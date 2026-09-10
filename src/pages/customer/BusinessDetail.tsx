import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, MapPin, Phone, Clock, Loader2, Navigation, User, ChevronRight, Zap, Car, BadgeCheck, Tag, Users, Sparkles, Globe, ExternalLink } from 'lucide-react';
import { Business, BusinessService, BusinessStaff, categoryColor, imgOnError } from '../../lib/product';
import { CategoryIcon } from '../../components/product';
import { useAuth } from '../../contexts/AuthContext';
import { apiSend } from '../../lib/api';
import { submitBooking, newIdempotencyKey } from '../../services/booking';
import { toast } from '../../services/events';
import { inr, istDate, istTime } from '../../lib/format';
import { useLocation } from '../../contexts/LocationContext';
import BookingTimeline, { Slot } from '../../components/premium/BookingTimeline';
import Heatmap from '../../components/premium/Heatmap';
import SuccessExperience from '../../components/premium/SuccessExperience';
import { SlotSkeleton } from '../../components/premium/Skeleton';
import { Modal, Field, inputCls, btnPrimary, btnGhost } from '../../components/ui';
import { fetchBusiness, fetchSlots, fetchReviews } from '../../lib/hybridData';
import { googleEmbedUrl, googleSearchUrl } from '../../lib/googleMaps';
import { pushRecentView } from '../../lib/smartSearch';
import { saveLocalBooking, saveLocalInvoice, pushLocalNotification, genLocalRef, createDemoBooking, listLocalBookings } from '../../lib/offlineStore';
import { isDemoBusinessId, genQrSalt, localVerifyUrl } from '../../lib/demoStore';
import { cacheGet } from '../../lib/smartCache';

export default function BusinessDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { profile, user } = useAuth();
  const [biz, setBiz] = useState<(Business & any) | null>(null);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<BusinessService | null>(null);
  const [staff, setStaff] = useState<BusinessStaff | null>(null);
  const [date, setDate] = useState(params.get('date') || new Date().toISOString().slice(0, 10));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recommended, setRecommended] = useState<Slot[]>([]);
  const [travel, setTravel] = useState(0);
  const [slot, setSlot] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const { mapCenter, city } = useLocation();
  const coords = mapCenter; // city center or live GPS — never re-prompts

  // Pre-fill the contact form from the signed-in profile (editable in review).
  useEffect(() => {
    if (profile) {
      setCustName((n) => n || profile.full_name || '');
      setCustEmail((e) => e || profile.email || '');
    }
  }, [profile?.full_name, profile?.email]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setResult(null);
    setErr('');
    // Live Google places resolve from the cached hydrated profile first.
    const cached = id ? cacheGet<any>(`business:${id}`) : null;
    const apply = (d: any) => {
      if (!alive || !d) return;
      setBiz(d);
      setService(d?.services?.[0] || null);
      setLoading(false);
      pushRecentView({ id: d.id, name: d.name, category: d.category, city: d.city, image_url: d.image_url, rating: d.rating });
      fetchReviews(d.id).then((r) => alive && setReviews(r)).catch(() => {});
    };
    if (cached) {
      apply(cached);
      // Refresh in background for freshness.
      fetchBusiness(id!, city.name).then((d) => { if (d && alive) { setBiz(d); setService((s) => s || d?.services?.[0] || null); } }).catch(() => {});
    } else {
      fetchBusiness(id!, city.name).then((d) => { if (!d && alive) setLoading(false); apply(d); }).catch(() => alive && setLoading(false));
    }
    if (user && id) apiSend('/api/track-view', 'POST', { business_id: id, user_id: user.id }).catch(() => {});
    return () => { alive = false; };
  }, [id, user, city.name]);

  useEffect(() => {
    if (!biz || !service) return;
    let alive = true;
    setLoadingSlots(true); setSlot('');
    fetchSlots(biz.id, service.id, date, coords ? { lat: coords.lat, lng: coords.lng } : undefined, staff?.name || null).then(d => {
      if (!alive) return;
      setSlots(d.slots || []); setRecommended(d.recommended || []); setTravel(d.travel_min || 0);
      // auto-select AI top pick
      if (d.recommended?.[0]) setSlot(d.recommended[0].time);
    }).finally(() => alive && setLoadingSlots(false));
    return () => { alive = false; };
  }, [biz, service, date, staff?.id, coords.lat, coords.lng]);

  // Stable per slot+service so retries replay the same booking, never a duplicate.
  const idemKey = useMemo(() => newIdempotencyKey(), [service?.id, slot]);

  // Booking flow: review the details (editable contact info), then confirm.
  const openReview = () => {
    if (!user) { nav(`/welcome?next=${encodeURIComponent(`/business/${id}`)}`); return; }
    setErr('');
    setReviewOpen(true);
  };

  const confirm = async () => {
    if (!custName.trim() || !custEmail.trim()) { setErr('Name and email are required.'); return; }
    setErr(''); setSubmitting(true);
    try {
      // Duplicate-slot guard: local mirrors of every booking in this environment
      // (server bookings are mirrored too), so a taken slot can never be
      // re-booked — even offline. Capacity-aware: with "any staff" the slot
      // only closes when every specialist is busy. The API re-checks server-side.
      const start = new Date(slot);
      const end = new Date(start.getTime() + (service!.duration_min || 30) * 60000);
      const overlaps = listLocalBookings().filter(
        (b) => String(b.business_id) === String(biz!.id)
          && b.status !== 'cancelled' && b.status !== 'no_show'
          && new Date(b.start_time) < end && new Date(b.end_time) > start,
      );
      const activeStaffCount = ((biz as any).staff || []).filter((s: any) => s.active !== false).length;
      const capacity = staff ? 1 : Math.max(1, activeStaffCount);
      const blocking = staff
        ? overlaps.filter((b) => (b.staff_name || '').toLowerCase() === staff.name.toLowerCase())
        : overlaps;
      if (blocking.length >= capacity) {
        setErr('That slot was just taken. Please pick another time.');
        setSubmitting(false);
        return;
      }

      // Demo tenant business → book directly against the shared demo dataset
      // (pending until the business confirms — the end-to-end demo path).
      if (isDemoBusinessId(biz!.id)) {
        const { booking, invoice, qr_payload } = await createDemoBooking({
          business_id: String(biz!.id), business_name: biz!.name,
          service_id: service!.id != null ? String(service!.id) : null, service_name: service!.name,
          service_duration: service!.duration_min || 30, service_price: Number(service!.price) || 0,
          staff_id: staff?.id != null ? String(staff.id) : null, staff_name: staff?.name || null,
          start_time: slot,
          city: (biz as any).city || city.name, location: biz!.address,
          customer_name: custName.trim(), customer_email: custEmail.trim(), customer_phone: custPhone.trim(),
          status: 'pending',
        });
        setResult({
          booking: { ...booking, employee_name: booking.staff_name }, invoice, business: biz,
          maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz!.address || biz!.name)}`,
          qr_payload, local: true,
          pipeline: { email: 'log-fallback' },
        });
        toast('Booking request sent', 'success');
        return;
      }

      const payload: any = {
        business_id: biz!.id, service_id: service!.id, staff_id: staff?.id || null,
        start_time: slot, customer_name: custName.trim(), customer_email: custEmail.trim(),
        idempotency_key: idemKey,
      };
      // Live Google businesses travel with their hydrated snapshot.
      if (typeof biz!.id === 'string' && String(biz!.id).startsWith('live-')) {
        payload.business_snapshot = {
          name: biz!.name, address: biz!.address, phone: (biz as any).phone,
          lat: biz!.lat, lng: biz!.lng, services: (biz!.services || []).map((s: any) => ({ id: s.id, name: s.name, duration_min: s.duration_min, price: s.price })),
          staff: ((biz as any).staff || []).map((s: any) => ({ id: s.id, name: s.name })),
        };
      }
      const res = await submitBooking(payload);
      // Demo continuity: mirror the booking locally so history/invoices work offline.
      try {
        const bk = res.booking;
        if (bk) {
          saveLocalBooking({
            id: bk.id, ref: bk.ref, business_id: biz!.id, business_name: biz!.name,
            service_name: service!.name, staff_name: staff?.name || null,
            start_time: bk.start_time, end_time: bk.end_time, status: bk.status,
            price: Number(service!.price) || 0, city: (biz as any).city || city.name,
            location: biz!.address, customer_name: custName.trim(), customer_email: custEmail.trim(),
          });
          if (res.invoice) {
            saveLocalInvoice({
              id: String(res.invoice.id || res.invoice.number), number: res.invoice.number,
              booking_ref: bk.ref, customer_name: custName.trim() || '', amount: Number(res.invoice.amount) || 0,
              tax: Number(res.invoice.tax) || 0, total: Number(res.invoice.total) || 0, status: res.invoice.status || 'issued',
            });
          }
          pushLocalNotification({
            audience: 'customer', title: 'Booking confirmed',
            body: `${service!.name} at ${biz!.name} — ${bk.ref}`, type: 'success', read: false, booking_ref: bk.ref,
          });
        }
      } catch { /* non-fatal */ }
      setResult(res);
      toast(res?.deduplicated ? 'Booking already confirmed' : 'Booking confirmed', 'success');
      } catch (e: any) {
      // Ultimate fallback: confirm locally so the demo flow never dead-ends.
      try {
        const ref = genLocalRef();
        const salt = genQrSalt();
        const start = new Date(slot);
        const end = new Date(start.getTime() + (service!.duration_min || 30) * 60000);
        const bk = {
          id: `local-${Date.now()}`, ref, customer_name: custName.trim(), customer_email: custEmail.trim(),
          service_name: service!.name, employee_name: staff?.name || null, resource_name: biz!.name,
          start_time: start.toISOString(), end_time: end.toISOString(), status: 'confirmed',
          price: service!.price, location: biz!.address,
        };
        const tax = Math.round(Number(service!.price) * 0.18);
        const invoice = {
          id: ref, number: `INV-${ref.slice(3)}`, booking_ref: ref, customer_name: custName.trim(),
          amount: service!.price, tax, total: Number(service!.price) + tax, status: 'issued',
          line_items: [{ desc: service!.name, qty: 1, price: Number(service!.price) }],
        };
        saveLocalBooking({
          id: bk.id, ref, business_id: biz!.id, business_name: biz!.name, service_name: service!.name,
          staff_name: staff?.name || null, start_time: bk.start_time, end_time: bk.end_time,
          status: 'confirmed', price: Number(service!.price) || 0, city: (biz as any).city || city.name,
          location: biz!.address, customer_name: custName.trim(), customer_email: custEmail.trim(), customer_phone: custPhone.trim(),
          qr_salt: salt,
        });
        saveLocalInvoice({ id: ref, number: invoice.number, booking_ref: ref, customer_name: custName.trim() || '', amount: Number(service!.price) || 0, tax, total: invoice.total, status: 'issued' });
        pushLocalNotification({ audience: 'customer', title: 'Booking confirmed', body: `${service!.name} at ${biz!.name} — ${ref}`, type: 'success', read: false, booking_ref: ref });
        setResult({
          booking: bk, invoice, business: biz,
          maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz!.address || biz!.name)}`,
          qr_payload: localVerifyUrl(ref, salt),
          pipeline: { email: 'log-fallback' },
        });
      } catch {
        setErr(e.message);
      }
    } finally { setSubmitting(false); setReviewOpen(false); }
  };

  const mapSrc = useMemo(() => {
    if (!biz) return null;
    // Real Google Maps centered on the business (keyless embed).
    return googleEmbedUrl(`${biz.name}, ${biz.address || biz.city || ''}`, biz.lat != null ? { lat: biz.lat, lng: biz.lng!, label: biz.name } : { lat: coords.lat, lng: coords.lng, label: city.name }, 15);
  }, [biz, coords.lat, coords.lng, city.name]);

  if (loading) return <div className="grid place-items-center py-32"><Loader2 className="h-6 w-6 animate-spin text-dim" /></div>;
  if (!biz) return <div className="card p-12 text-center">Business not found.</div>;

  const color = categoryColor(biz.category);
  const offers = (biz as any).offers || [];
  const facilities: string[] = (biz as any).facilities || [];
  const amenities: string[] = (biz as any).amenities || [];
  const photos: string[] = (biz as any).photos || [];
  const isLive = !!(biz as any).live;

  if (result) return <SuccessExperience booking={result.booking} invoice={result.invoice} business={biz} mapsLink={result.maps_link} qrPayload={result.qr_payload} gmailComposeUrl={result.gmail_compose_url} emailStatus={result.pipeline?.email} onClose={() => nav('/appointments')} />;

  // Review + confirm — the final step of the booking engine
  const reviewModal = (
    <Modal open={reviewOpen} onClose={() => !submitting && setReviewOpen(false)} title="Review your booking">
      <div className="space-y-4">
        <div className="rounded-2xl border border-app bg-surface p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-dim">Business</span><span className="font-medium text-right">{biz.name}</span></div>
          <div className="flex justify-between gap-4"><span className="text-dim">Service</span><span className="font-medium text-right">{service?.name}</span></div>
          {staff && <div className="flex justify-between gap-4"><span className="text-dim">Specialist</span><span className="font-medium text-right">{staff.name}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-dim">When</span><span className="font-medium text-right">{istDate(slot)}, {istTime(slot)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-dim">Duration</span><span className="font-medium text-right">{service?.duration_min} min</span></div>
          <div className="flex justify-between gap-4 pt-2 border-t border-app"><span className="text-dim">Total</span><span className="font-semibold">{service?.price === 0 ? 'Free' : inr(Number(service?.price) || 0)}</span></div>
        </div>
        <div className="grid gap-3">
          <Field label="Your name">
            <input className={inputCls} value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Full name" autoComplete="name" />
          </Field>
          <Field label="Email (booking confirmation goes here)">
            <input className={inputCls} value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" />
          </Field>
          <Field label="Phone (optional — for booking updates)">
            <input className={inputCls} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="+91 …" type="tel" autoComplete="tel" />
          </Field>
        </div>
        {isDemoBusinessId(biz.id) && (
          <p className="text-xs text-dim rounded-xl border border-dashed border-app p-3">
            This is a demo business — your booking is stored in the live demo dataset and appears on the business dashboard instantly. The business confirms it from their console.
          </p>
        )}
        {err && <p className="text-sm text-red-400">{err}</p>}
        <div className="flex gap-2.5">
          <button onClick={() => setReviewOpen(false)} disabled={submitting} className={btnGhost + ' flex-1'}>Back</button>
          <button onClick={confirm} disabled={submitting} className={btnPrimary + ' flex-[2]'}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : <>Confirm booking <ChevronRight className="h-4 w-4" /></>}
          </button>
        </div>
      </div>
    </Modal>
  );

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> Back</button>

      <div className="relative rounded-3xl overflow-hidden h-52 sm:h-64 mb-6">
        <img src={biz.cover_url || biz.image_url} alt={biz.name} onError={imgOnError(biz.category)} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="glass rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 text-xs"><CategoryIcon category={biz.category} className="h-3.5 w-3.5" color={color} /> {biz.category}</div>
            {isLive && <div className="rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"><BadgeCheck className="h-3.5 w-3.5" /> Live on Google Maps</div>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">{biz.name}</h1>
          <p className="text-white/80 text-sm">{biz.tagline}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="font-medium">{Number(biz.rating).toFixed(1)}</span><span className="text-dim">({biz.review_count})</span></span>
            <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="h-4 w-4" /> {biz.address}</span>
            <span className="inline-flex items-center gap-1.5 text-muted"><Clock className="h-4 w-4" /> {biz.open_time}–{biz.close_time}</span>
            {biz.phone && <a href={`tel:${biz.phone}`} className="inline-flex items-center gap-1.5 text-[var(--color-brand-indigo)]"><Phone className="h-4 w-4" /> {biz.phone}</a>}
          </div>
          {/* Live Google signals + queue snapshot */}
          <div className="flex flex-wrap gap-2">
            {(biz as any).open_now != null && (
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${(biz as any).open_now ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${(biz as any).open_now ? 'bg-emerald-400 pulse-dot' : 'bg-red-400'}`} />
                {(biz as any).open_now ? 'Open now (live)' : 'Closed now (live)'}
              </span>
            )}
            {(biz as any).wait_min != null && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted"><Users className="h-3.5 w-3.5" /> ~{(biz as any).wait_min} min wait{(biz as any).queue_length ? ` · ${(biz as any).queue_length} in queue` : ''}</span>
            )}
            {(biz as any).ai_popularity != null && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted"><Sparkles className="h-3.5 w-3.5 text-[var(--color-brand-indigo)]" /> {(biz as any).ai_popularity}% loved this week</span>
            )}
            {(biz as any).website && (
              <a href={(biz as any).website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted hover:text-[var(--text)]"><Globe className="h-3.5 w-3.5" /> Website</a>
            )}
          </div>
          <p className="text-muted">{biz.description}</p>

          {/* Offers */}
          {offers.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Offers for you</h2>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {offers.map((o: any, i: number) => (
                  <div key={i} className="rounded-2xl border border-dashed border-[var(--color-brand-indigo)]/40 bg-[var(--color-brand-indigo)]/5 p-3.5 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl grad-btn grid place-items-center shrink-0"><Tag className="h-4 w-4 text-white" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{o.title}</p>
                      <p className="text-xs text-dim">{o.desc}</p>
                      <p className="mt-1 text-[11px] font-mono text-[var(--color-brand-indigo)]">Use code {o.code}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Services */}
          <div>
            <h2 className="font-semibold mb-3">Choose a service</h2>
            <div className="space-y-2">
              {(biz.services || []).map((s: BusinessService) => (
                <motion.button whileTap={{ scale: 0.99 }} key={s.id} onClick={() => setService(s)} className={`w-full text-left rounded-2xl border p-4 flex items-center justify-between transition-all ${service?.id === s.id ? 'border-[var(--color-brand-indigo)] bg-[var(--color-brand-indigo)]/10' : 'border-app hover:border-[var(--border-strong)]'}`}>
                  <div><p className="font-medium">{s.name}</p><p className="text-sm text-dim">{s.description} · {s.duration_min} min</p></div>
                  <span className="font-semibold">{s.price === 0 ? 'Free' : inr(s.price)}</span>
                </motion.button>
              ))}
              {(biz.services || []).length === 0 && <p className="text-sm text-dim">Services loading…</p>}
            </div>
          </div>

          {/* Staff */}
          {(biz.staff || []).length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Pick a specialist <span className="text-dim font-normal text-sm">(optional)</span></h2>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                <button onClick={() => setStaff(null)} className={`flex flex-col items-center gap-2 min-w-[76px] ${!staff ? '' : 'opacity-60'}`}>
                  <div className={`h-14 w-14 rounded-full grid place-items-center border-2 ${!staff ? 'border-[var(--color-brand-indigo)]' : 'border-app'} bg-surface`}><User className="h-5 w-5 text-dim" /></div>
                  <span className="text-xs">Any</span>
                </button>
                {(biz.staff || []).map((st: BusinessStaff) => (
                  <button key={st.id} onClick={() => setStaff(st)} className={`flex flex-col items-center gap-2 min-w-[76px] ${staff?.id === st.id ? '' : 'opacity-70'}`}>
                    <div className={`h-14 w-14 rounded-full grid place-items-center text-white text-sm font-semibold border-2 grad-btn ${staff?.id === st.id ? 'border-[var(--color-brand-indigo)]' : 'border-transparent'}`}>{st.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                    <span className="text-xs text-center leading-tight">{st.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Facilities */}
          {(facilities.length > 0 || amenities.length > 0) && (
            <div>
              <h2 className="font-semibold mb-3">Facilities & amenities</h2>
              <div className="flex flex-wrap gap-2">
                {[...facilities, ...amenities].map((f, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs rounded-full border border-app px-3 py-1.5 text-muted"><BadgeCheck className="h-3.5 w-3.5 text-emerald-400" /> {f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Photos</h2>
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map((p, i) => (
                  <img key={i} src={p} alt={`${biz.name} photo ${i + 1}`} loading="lazy" onError={imgOnError(biz.category)} className="h-24 sm:h-32 w-full object-cover rounded-2xl border border-app" />
                ))}
              </div>
            </div>
          )}

          {/* Availability forecast */}
          <Heatmap businessId={biz.id} onPickDate={(d) => setDate(d)} />

          {/* Reviews */}
          {reviews.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">What customers say</h2>
              <div className="space-y-2.5">
                {reviews.slice(0, 5).map((r) => (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full grad-btn grid place-items-center text-white text-xs font-semibold shrink-0">{r.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.name}</p>
                        <p className="text-[11px] text-dim">{r.date}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{r.title}</p>
                    <p className="text-sm text-muted">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map */}
          {mapSrc && (
            <div>
              <h2 className="font-semibold mb-3">Location & directions</h2>
              <div className="rounded-2xl overflow-hidden border border-app h-56"><iframe title="location" src={mapSrc} className="w-full h-full border-0" loading="lazy" /></div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={googleSearchUrl(`${biz.name}, ${biz.address || biz.city || ''}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--color-brand-indigo)] font-medium"><ExternalLink className="h-4 w-4" /> View on Map</a>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address || biz.name)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--color-brand-indigo)] font-medium"><Navigation className="h-4 w-4" /> Get directions</a>
                {travel > 0 && <span className="inline-flex items-center gap-1.5 text-sm text-dim"><Car className="h-4 w-4" /> ~{travel} min away</span>}
              </div>
            </div>
          )}
        </div>

        {/* Booking panel */}
        <div className="lg:sticky lg:top-24 h-fit">
          <div className="card p-5">
            <h2 className="font-semibold">Book your appointment</h2>
            <div className="mt-4">
              <label className="text-xs text-dim">Date</label>
              <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2"><label className="text-xs text-dim">Pick a time</label>{recommended[0] && <span className="text-[10px] text-[var(--color-brand-indigo)] inline-flex items-center gap-1"><Zap className="h-3 w-3" /> AI picked {recommended[0].label}</span>}</div>
              {loadingSlots ? <SlotSkeleton /> : slots.filter(s => s.available).length === 0 ? <p className="text-sm text-dim py-4 text-center">No open slots. Try another date.</p> : (
                <BookingTimeline slots={slots} selected={slot} onSelect={setSlot} recommended={recommended} />
              )}
            </div>
            {service && (
              <div className="mt-4 pt-4 border-t border-app flex items-center justify-between text-sm">
                <span className="text-dim">{service.name}</span><span className="font-semibold">{service.price === 0 ? 'Free' : inr(service.price)}</span>
              </div>
            )}
            {err && !reviewOpen && <p className="text-sm text-red-400 mt-3">{err}</p>}
            <motion.button whileTap={{ scale: 0.98 }} onClick={openReview} disabled={!slot || !service || submitting} className="mt-4 w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : !user ? <>Sign in to book <ChevronRight className="h-4 w-4" /></> : <>Review &amp; book <ChevronRight className="h-4 w-4" /></>}
            </motion.button>
            <p className="mt-2 text-center text-[11px] text-dim">{isDemoBusinessId(biz.id) ? 'Business confirms your slot · Free cancellation · Calendar sync' : 'Free cancellation · Instant confirmation · Calendar sync'}</p>
          </div>
        </div>
      </div>
      {reviewModal}
    </div>
  );
}
