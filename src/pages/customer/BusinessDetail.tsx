import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, MapPin, Phone, Clock, Loader2, Navigation, User, ChevronRight, Zap, Car, BadgeCheck, Tag, Users, Sparkles, Globe, ExternalLink } from 'lucide-react';
import { Business, BusinessService, BusinessStaff, categoryColor } from '../../lib/product';
import { BUSINESS_DAYS, todayHours } from '../../lib/businessHours';
import { CategoryIcon } from '../../components/product';
import { useAuth } from '../../contexts/AuthContext';
import { apiSend, hasLiveSession } from '../../lib/api';
import { submitBooking, newIdempotencyKey, type BookingPayload } from '../../services/booking';
import { errMsg, type BookingConfirmation, type ReviewRow } from '../../lib/types';
import { onBookingsChanged, onBusinessesChanged, onServicesChanged, onStaffChanged, toast } from '../../services/events';
import { inr, istDate, istTime, istToday, demoTax, demoTotal } from '../../lib/format';
import { isValidIndianPhone } from '../../lib/india';
import { useLocation } from '../../contexts/LocationContext';
import BookingTimeline, { Slot } from '../../components/premium/BookingTimeline';
import Heatmap from '../../components/premium/Heatmap';
import SuccessExperience from '../../components/premium/SuccessExperience';
import { SlotSkeleton } from '../../components/premium/Skeleton';
import { Modal, Field, inputCls, btnPrimary, btnGhost } from '../../components/ui';
import { fetchBusiness, fetchSlots, fetchReviews } from '../../lib/hybridData';
import { googleEmbedUrl, googleSearchUrl } from '../../lib/googleMaps';
import { pushRecentView } from '../../lib/smartSearch';
import { createDemoBooking, listLocalBookings } from '../../lib/offlineStore';
import { isDemoBusinessId } from '../../lib/demoStore';
import { cacheGet } from '../../lib/smartCache';
import { isMiRoadElectricianSample, MI_ROAD_ELECTRICIAN_ALT, withMiRoadElectricianImage } from '../../lib/miRoadElectrician';

export default function BusinessDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { profile, user } = useAuth();
  const [biz, setBiz] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessError, setBusinessError] = useState('');
  const [service, setService] = useState<BusinessService | null>(null);
  const [staff, setStaff] = useState<BusinessStaff | null>(null);
  const [date, setDate] = useState(params.get('date') || istToday());
  const focusBooking = params.get('focus') === 'booking';
  const [slots, setSlots] = useState<Slot[]>([]);
  const [recommended, setRecommended] = useState<Slot[]>([]);
  const [travel, setTravel] = useState(0);
  const [slot, setSlot] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [slotRetry, setSlotRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingConfirmation | null>(null);
  const [err, setErr] = useState('');
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
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
      setCustEmail(profile.email || user?.email || '');
    }
  }, [profile, user]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setBusinessError(''); setBiz(null);
    setResult(null);
    setErr('');
    // Live Google places resolve from the cached hydrated profile first.
    const cached = id ? cacheGet<Business>(`business:${id}`) : null;
    const apply = (raw: Business | null) => {
      if (!alive || !raw) return;
      const d = withMiRoadElectricianImage(raw);
      setBiz(d);
      setService(d?.services?.[0] || null);
      setLoading(false);
      pushRecentView({ id: d.id, name: d.name, category: d.category, city: d.city, image_url: d.image_url, rating: d.rating, synthetic: d.synthetic });
      fetchReviews(d.id).then((r) => alive && setReviews(r)).catch(() => {});
    };
    if (cached) {
      apply(cached);
      // Refresh in background for freshness.
      fetchBusiness(id!, city.name).then((d) => { if (d && alive) { setBiz(d); setService((s) => s || d?.services?.[0] || null); } }).catch(() => {});
    } else {
      fetchBusiness(id!, city.name).then((d) => { if (!d && alive) setLoading(false); apply(d); }).catch(() => { if (alive) { setBusinessError('Business details could not be loaded. Please try again.'); setLoading(false); } });
    }
    if (user && id && hasLiveSession()) apiSend('/api/track-view', 'POST', { business_id: id, user_id: user.id }).catch(() => {});
    const refresh = () => {
      fetchBusiness(id!, city.name).then((d) => { if (d && alive) { setBiz(d); setService((s) => d.services?.find((x) => String(x.id) === String(s?.id)) || d.services?.[0] || s); } }).catch(() => {});
    };
    const offs = [onBusinessesChanged(refresh), onServicesChanged(refresh), onStaffChanged(refresh), onBookingsChanged(refresh)];
    return () => { alive = false; offs.forEach((off) => off()); };
  }, [id, user, city.name]);

  useEffect(() => {
    if (!biz || !service || biz.synthetic || biz.live) return;
    let alive = true;
    setLoadingSlots(true); setSlot(''); setSlotError('');
    fetchSlots(biz.id, service.id, date, coords ? { lat: coords.lat, lng: coords.lng } : undefined, staff?.name || null, staff?.id || null).then(d => {
      if (!alive) return;
      setSlots(d.slots || []); setRecommended(d.recommended || []); setTravel(d.travel_min || 0);
      // auto-select AI top pick
      if (d.recommended?.[0]) setSlot(d.recommended[0].time);
    }).catch(() => {
      if (!alive) return;
      setSlots([]); setRecommended([]); setSlotError('Availability could not be loaded. Please try again.');
    }).finally(() => alive && setLoadingSlots(false));
    return () => { alive = false; };
  }, [biz, service, date, staff, coords, slotRetry]);

  // Stable per slot+service so retries replay the same booking, never a duplicate.
  const idemKey = useMemo(() => `${service?.id || 'svc'}|${slot}|${newIdempotencyKey()}`, [service?.id, slot]);

  // Booking flow: review the details (editable contact info), then confirm.
  const openReview = () => {
    if (!user) { nav(`/welcome?next=${encodeURIComponent(`/business/${id}`)}`); return; }
    setErr('');
    setReviewOpen(true);
  };

  const confirm = async () => {
    if (!custName.trim() || !custEmail.trim()) { setErr('Name and email are required.'); return; }
    if (custPhone.trim() && !isValidIndianPhone(custPhone)) { setErr('Enter a valid 10-digit Indian mobile number.'); return; }
    setErr(''); setSubmitting(true);
    try {
      if (isDemoBusinessId(biz!.id)) {
      // Demo-only duplicate guard. Real reservations are serialized in PostgreSQL.
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
      const activeStaffCount = (biz!.staff || []).filter((s) => s.active !== false).length;
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
        const { booking, invoice, qr_payload } = await createDemoBooking({
          business_id: String(biz!.id), business_name: biz!.name,
          service_id: service!.id != null ? String(service!.id) : null, service_name: service!.name,
          service_duration: service!.duration_min || 30, service_price: Number(service!.price) || 0,
          staff_id: staff?.id != null ? String(staff.id) : null, staff_name: staff?.name || null,
          start_time: slot,
          city: biz!.city || city.name, location: biz!.address,
          customer_name: custName.trim(), customer_email: custEmail.trim(), customer_phone: custPhone.trim(),
          status: 'pending',
        });
        setResult({
          booking: { ...booking, employee_name: booking.staff_name }, invoice, business: biz || undefined,
          maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz!.address || biz!.name)}`,
          qr_payload, local: true,
          pipeline: { email: 'log-fallback' },
        });
        toast('Sample booking created · demo tenant', 'success');
        setReviewOpen(false);
        return;
      }

      const payload: BookingPayload = {
        business_id: biz!.id, service_id: service!.id, staff_id: staff?.id || null,
        start_time: slot, customer_name: custName.trim(), customer_email: custEmail.trim(),
        idempotency_key: idemKey,
      };
      const res = await submitBooking(payload);
      setResult(res); setReviewOpen(false);
      toast(res?.deduplicated ? 'Booking already confirmed' : 'Booking confirmed', 'success');
    } catch (e: unknown) {
      setErr(errMsg(e) || 'We could not complete your booking. Please try again.');
    } finally { setSubmitting(false); }
  };

  // Deep link from the sample walkthrough / demo guide: land the presenter on
  // the booking panel instead of making them scroll a long listing.
  useEffect(() => {
    if (!focusBooking || loading || !biz) return;
    const target = document.getElementById('booking-panel');
    if (!target) return;
    const t = window.setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
    return () => window.clearTimeout(t);
  }, [focusBooking, loading, biz]);

  const mapSrc = useMemo(() => {
    if (!biz || biz.synthetic || biz.demo || biz.lat == null || biz.lng == null) return null;
    return googleEmbedUrl(`${biz.lat},${biz.lng}`, undefined, 15);
  }, [biz]);

  if (loading) return <div className="grid place-items-center py-32"><Loader2 className="h-6 w-6 animate-spin text-dim" /></div>;
  if (!biz) return <div className="card p-12 text-center" role="alert">{businessError || 'Business not found.'}</div>;

  const color = categoryColor(biz.category);
  const offers = biz.offers || [];
  const facilities: string[] = biz.facilities || [];
  const amenities: string[] = biz.amenities || [];
  const photos: string[] = biz.photos || [];
  const isIllustratedSample = isMiRoadElectricianSample(biz);
  const isLive = !!biz.live;

  if (result?.booking) return <SuccessExperience booking={result.booking} invoice={result.invoice || { total: Number(service?.price) || 0, number: result.booking.ref }} business={biz} mapsLink={result.maps_link || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.lat != null && biz.lng != null ? `${biz.lat},${biz.lng}` : biz.address || biz.name)}`} qrPayload={result.qr_payload || undefined} gmailComposeUrl={result.gmail_compose_url} emailStatus={result.pipeline?.email} remindersScheduled={!!result.pipeline && (result.pipeline.reminders_scheduled ?? 0) > 0} demo={!!result.local} onClose={() => nav('/appointments')} />;

  // Review + confirm — the final step of the booking engine
  const reviewModal = (
    <Modal open={reviewOpen} onClose={() => !submitting && setReviewOpen(false)} title="Review your booking">
      <div className="space-y-4">
        <div className="rounded-2xl border border-app bg-surface p-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><span className="text-dim">Business</span><span className="font-medium text-right">{biz.name}</span></div>
          <div className="flex justify-between gap-4"><span className="text-dim">Service</span><span className="font-medium text-right">{service?.name}</span></div>
          {staff && <div className="flex justify-between gap-4"><span className="text-dim">Specialist</span><span className="font-medium text-right">{staff.name}</span></div>}
          <div className="flex justify-between gap-4"><span className="text-dim">When</span><span className="font-medium text-right">{slot ? `${istDate(slot)}, ${istTime(slot)}` : '—'}</span></div>
          <div className="flex justify-between gap-4"><span className="text-dim">Duration</span><span className="font-medium text-right">{service?.duration_min} min</span></div>
          <div className="flex justify-between gap-4 border-t border-app pt-2"><span className="text-dim">Service price</span><span className="font-medium text-right tabular-nums">{service?.price === 0 ? 'Free' : inr(Number(service?.price) || 0)}</span></div>
          <div className="flex justify-between gap-4"><span className="text-dim">GST 18%{isDemoBusinessId(biz.id) ? ' (sample invoice)' : ''}</span><span className="font-medium text-right tabular-nums">{service?.price === 0 ? '—' : inr(demoTax(service?.price), { decimals: true })}</span></div>
          <div className="flex justify-between gap-4 border-t border-app pt-2"><span className="font-medium">Total payable</span><span className="text-base font-semibold tabular-nums">{service?.price === 0 ? 'Free' : inr(demoTotal(service?.price), { decimals: true })}</span></div>
        </div>
        <div className="grid gap-3">
          <Field label="Your name">
            <input className={inputCls} value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Full name" autoComplete="name" />
          </Field>
          <Field label="Email (booking confirmation goes here)">
            <input className={inputCls} value={custEmail} onChange={(e) => setCustEmail(e.target.value)} readOnly={!isDemoBusinessId(biz.id)} placeholder="you@email.com" type="email" autoComplete="email" />
          </Field>
          {isDemoBusinessId(biz.id) && <Field label="Phone (optional — demo only)">
            <input className={inputCls} value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="+91 …" type="tel" autoComplete="tel" />
          </Field>}
        </div>
        {isDemoBusinessId(biz.id) && (
          <div className="rounded-xl border border-dashed border-[var(--color-brand-violet)]/30 bg-[var(--color-brand-violet)]/[0.06] p-3">
            <p className="text-xs font-medium text-[var(--text-link-strong)]">Sample request · demo tenant</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-dim">
              Nothing is charged and no email or SMS is sent. The request is stored in this browser so the demo business console can confirm and check it in.
            </p>
          </div>
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

      <div className="relative rounded-3xl overflow-hidden h-52 sm:h-64 mb-6 bg-gradient-to-br from-indigo-900 via-slate-900 to-emerald-950">
        {biz.cover_url || biz.image_url ? <img src={biz.cover_url || biz.image_url} alt={isIllustratedSample ? MI_ROAD_ELECTRICIAN_ALT : biz.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} className={`h-full w-full object-cover ${isIllustratedSample ? 'object-left' : ''}`} /> : <div className="h-full w-full bg-gradient-to-br from-indigo-900 via-slate-900 to-emerald-950" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="glass rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 text-xs"><CategoryIcon category={biz.category} className="h-3.5 w-3.5" color={color} /> {biz.category}</div>
            {(biz.synthetic || biz.demo) && <div className="rounded-full px-2.5 py-1 text-xs bg-amber-500/20 text-amber-200">Sample listing{isIllustratedSample ? ' · AI illustration' : ''}</div>}
            {isLive && <div className="rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"><BadgeCheck className="h-3.5 w-3.5" /> Live on Google Maps</div>}
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white">{biz.name}</h1>
          <p className="text-white/80 text-sm">{biz.tagline}</p>
        </div>
      </div>

      {/* Mobile: the booking panel sits below services, reviews, photos and the
          map, so give phones an immediate primary action that jumps to it. */}
      <div className="lg:hidden mb-5">
        <button onClick={() => document.getElementById('booking-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2">
          <Zap className="h-4 w-4" /> {service ? `Book · ${Number(service.price) === 0 ? 'Free' : inr(service.price)}` : 'Choose a service and time'} <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* min-w-0 on both columns: the specialist strip is an intentional
          horizontal scroller, and without it its min-content width stretches
          the single-column mobile grid past the viewport. */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="flex flex-wrap gap-4 text-sm">
            {Number(biz.rating) > 0 ? <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="font-medium">{Number(biz.rating).toFixed(1)}</span><span className="text-dim">({biz.review_count})</span></span> : <span className="text-dim">Not rated</span>}
            <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="h-4 w-4" /> {biz.address}{biz.pin && !String(biz.address).includes(biz.pin) ? ` ${biz.pin}` : ''}</span>
            {todayHours(biz) && <span className="inline-flex items-center gap-1.5 text-muted"><Clock className="h-4 w-4" /> {todayHours(biz)}</span>}
            {!biz.synthetic && !biz.demo && biz.phone && <a href={`tel:${biz.phone}`} className="inline-flex items-center gap-1.5 text-[var(--text-link-strong)]"><Phone className="h-4 w-4" /> {biz.phone}</a>}
          </div>
          {/* Live Google signals + queue snapshot */}
          <div className="flex flex-wrap gap-2">
            {biz.open_now != null && (
              <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${biz.open_now ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
                title={isLive ? 'Opening hours supplied by the live Google Maps listing.' : 'Derived from this business\'s published opening hours.'}>
                <span className={`h-1.5 w-1.5 rounded-full ${biz.open_now ? 'bg-emerald-400 pulse-dot' : 'bg-red-400'}`} />
                {biz.open_now ? 'Open now' : 'Closed now'}{isLive ? ' · live' : ''}
              </span>
            )}
            {biz.wait_min != null && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted"
                title="Estimated from this listing's sample demand pattern — Velora does not receive live queue or sensor data."><Users className="h-3.5 w-3.5" /> ~{biz.wait_min} min estimated wait{biz.queue_length ? ` · ${biz.queue_length} in queue` : ''}</span>
            )}
            {biz.ai_popularity != null && (
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted"
                title="Relative demand score for this sample listing (0–100). It is a deterministic estimate over sample data, not measured footfall."><Sparkles className="h-3.5 w-3.5 text-[var(--text-link-strong)]" /> Estimated demand {biz.ai_popularity}/100</span>
            )}
            {biz.website && (
              <a href={biz.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface border border-app text-muted hover:text-[var(--text)]"><Globe className="h-3.5 w-3.5" /> Website</a>
            )}
          </div>
          <p className="text-muted">{biz.description}</p>
          {biz.booking_policy && <div className="rounded-2xl border border-app p-4 text-sm"><p className="font-medium">Booking policy</p><p className="text-muted mt-1">{biz.booking_policy}</p></div>}
          {biz.weekly_hours && Object.keys(biz.weekly_hours).length > 0 && <div className="rounded-2xl border border-app p-4 text-sm"><h2 className="font-semibold mb-3">Opening hours <span className="font-normal text-dim">· IST</span></h2><div className="grid sm:grid-cols-2 gap-x-8 gap-y-2">{BUSINESS_DAYS.map(([key, label]) => { const h = biz.weekly_hours?.[key]; return <div key={key} className="flex justify-between gap-4"><span className="text-dim">{label}</span><span>{!h ? 'Not set' : h.closed ? 'Closed' : `${h.open}–${h.close}`}</span></div>; })}</div>{!!biz.holidays?.length && <p className="text-xs text-dim mt-3">Holiday closures: {biz.holidays.join(', ')}</p>}</div>}

          {/* Offers */}
          {offers.length > 0 && (
            <div>
              <h2 className="font-semibold mb-3">Offers for you</h2>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {offers.map((o, i: number) => (
                  <div key={i} className="rounded-2xl border border-dashed border-[var(--color-brand-indigo)]/40 bg-[var(--color-brand-indigo)]/5 p-3.5 flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl grad-btn grid place-items-center shrink-0"><Tag className="h-4 w-4 text-white" /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{o.title}</p>
                      <p className="text-xs text-dim">{o.desc}</p>
                      <p className="mt-1 text-[11px] font-mono text-[var(--text-link-strong)]">Use code {o.code}</p>
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
                  <div className="flex items-center gap-3">{s.image_url && <img src={s.image_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} loading="lazy" className="h-14 w-14 rounded-xl object-cover" />}<div><p className="font-medium">{s.name}</p><p className="text-sm text-dim">{s.description} · {s.duration_min} min</p></div></div>
                  <span className="font-semibold">{s.price === 0 ? 'Free' : inr(s.price)}</span>
                </motion.button>
              ))}
              {(biz.services || []).length === 0 && <p className="text-sm text-dim">{isLive ? 'This Google listing has not enabled Velora booking.' : 'No services are currently available.'}</p>}
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
              <h2 className="font-semibold mb-3">{isIllustratedSample ? 'AI illustration' : 'Photos'}</h2>
              <div className="grid grid-cols-3 gap-2">
                {photos.slice(0, 6).map((p, i) => (
                  <img key={i} src={p} alt={isIllustratedSample ? MI_ROAD_ELECTRICIAN_ALT : `${biz.name} photo ${i + 1}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} className={`h-24 sm:h-32 w-full object-cover rounded-2xl border border-app ${isIllustratedSample ? 'object-left' : ''}`} />
                ))}
              </div>
            </div>
          )}

          {/* Availability forecast */}
          {(biz.synthetic || biz.demo) && <Heatmap businessId={biz.id} onPickDate={(d) => setDate(d)} />}

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
                <a href={googleSearchUrl(`${biz.name}, ${biz.address || biz.city || ''}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--text-link-strong)] font-medium"><ExternalLink className="h-4 w-4" /> View on Map</a>
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.lat != null && biz.lng != null ? `${biz.lat},${biz.lng}` : biz.address || biz.name)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--text-link-strong)] font-medium"><Navigation className="h-4 w-4" /> Get directions</a>
                {travel > 0 && <span className="inline-flex items-center gap-1.5 text-sm text-dim"><Car className="h-4 w-4" /> ~{travel} min away</span>}
              </div>
            </div>
          )}
        </div>

        {/* Booking panel */}
        <div id="booking-panel" className="min-w-0 h-fit scroll-mt-24 lg:sticky lg:top-24">
          {biz.live || biz.synthetic ? <div className="card p-5"><h2 className="font-semibold">{biz.live ? 'Listed on Google Maps' : 'Sample listing'}</h2><p className="text-sm text-muted mt-2">{biz.live ? 'This business has not enabled booking through Velora. Contact them directly for availability.' : 'This is an illustrative listing, not a real bookable business.'}</p>{biz.live && <a className="inline-flex text-sm text-[var(--text-link-strong)] mt-4" href={biz.maps_url || googleSearchUrl(biz.name)} target="_blank" rel="noreferrer">Open in Google Maps <ExternalLink className="h-4 w-4 ml-1" /></a>}</div> : <div className="card p-5">
            <h2 className="font-semibold">Book your appointment</h2>
            <div className="mt-4">
              <label htmlFor="booking-date" className="text-xs text-dim">Date (IST)</label>
              <input id="booking-date" type="date" value={date} min={istToday()} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2"><label className="text-xs text-dim">Pick a time</label>{recommended[0] && <span className="text-[10px] text-[var(--text-link-strong)] inline-flex items-center gap-1" title="Earliest well-rated free slot: ranked on availability, crowding and time of day."><Zap className="h-3 w-3" /> Best time · {recommended[0].label}</span>}</div>
              {loadingSlots ? <SlotSkeleton /> : slotError ? <div className="text-sm text-red-400 py-3">{slotError} <button onClick={() => setSlotRetry((n) => n + 1)} className="underline">Retry</button></div> : slots.filter(s => s.available).length === 0 ? <p className="text-sm text-dim py-4 text-center">No open slots. Try another date.</p> : (
                <BookingTimeline slots={slots} selected={slot} onSelect={setSlot} recommended={recommended} />
              )}
            </div>
            {service && (
              <div className="mt-4 space-y-1 border-t border-app pt-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-dim">{service.name}</span>
                  <span className="font-semibold tabular-nums">{service.price === 0 ? 'Free' : inr(service.price)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-dim">
                  <span>GST 18% at review</span>
                  <span className="tabular-nums">{service.price === 0 ? '—' : inr(demoTax(service.price), { decimals: true })}</span>
                </div>
              </div>
            )}
            {err && !reviewOpen && <p className="text-sm text-red-400 mt-3">{err}</p>}
            <motion.button whileTap={{ scale: 0.98 }} onClick={openReview} disabled={!slot || !service || submitting} className="mt-4 w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : !user ? <>Sign in to book <ChevronRight className="h-4 w-4" /></> : <>Review &amp; book <ChevronRight className="h-4 w-4" /></>}
            </motion.button>
            <p className="mt-2 text-center text-[11px] text-dim">{isDemoBusinessId(biz.id) ? 'Demo only · saved on this device' : `Instant confirmation · cancel at least ${biz.cancellation_hours || 0} hours before`}</p>
          </div>}
        </div>
      </div>
      {reviewModal}
    </div>
  );
}
