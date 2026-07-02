import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, MapPin, Phone, Clock, Loader2, Navigation, User, ChevronRight, Zap, Car } from 'lucide-react';
import { Business, BusinessService, BusinessStaff, categoryColor, mapsDirections, staticMap } from '../../lib/product';
import { CategoryIcon } from '../../components/product';
import { useAuth } from '../../contexts/AuthContext';
import { apiSend } from '../../lib/api';
import { inr } from '../../lib/format';
import { useLocation } from '../../contexts/LocationContext';
import BookingTimeline, { Slot } from '../../components/premium/BookingTimeline';
import Heatmap from '../../components/premium/Heatmap';
import SuccessExperience from '../../components/premium/SuccessExperience';
import { SlotSkeleton } from '../../components/premium/Skeleton';

export default function BusinessDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { profile, user } = useAuth();
  const [biz, setBiz] = useState<Business | null>(null);
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
  const { location: coords } = useLocation(); // cached, one-time permission — never re-prompts

  useEffect(() => {
    fetch(`/api/businesses?id=${id}`).then(r => r.json()).then(d => { setBiz(d); setService(d?.services?.[0] || null); setLoading(false); }).catch(() => setLoading(false));
    if (user) apiSend('/api/track-view', 'POST', { business_id: Number(id), user_id: user.id }).catch(() => {});
  }, [id, user]);

  useEffect(() => {
    if (!biz || !service) return;
    setLoadingSlots(true); setSlot('');
    const loc = coords ? `&origin_lat=${coords.lat}&origin_lng=${coords.lng}` : '';
    fetch(`/api/smart-slots?business_id=${biz.id}&service_id=${service.id}&date=${date}${loc}`).then(r => r.json()).then(d => {
      setSlots(d.slots || []); setRecommended(d.recommended || []); setTravel(d.travel_min || 0);
      // auto-select AI top pick
      if (d.recommended?.[0]) setSlot(d.recommended[0].time);
    }).finally(() => setLoadingSlots(false));
  }, [biz, service, date, coords]);

  const confirm = async () => {
    // Natural in-experience login gate: only prompt sign-in at booking time.
    if (!user) { nav(`/welcome?next=${encodeURIComponent(`/business/${id}`)}`); return; }
    setErr(''); setSubmitting(true);
    try {
      const res = await apiSend('/api/book', 'POST', {
        business_id: biz!.id, service_id: service!.id, staff_id: staff?.id || null,
        start_time: slot, customer_name: profile?.full_name, customer_email: profile?.email,
      });
      setResult(res);
    } catch (e: any) { setErr(e.message); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="grid place-items-center py-32"><Loader2 className="h-6 w-6 animate-spin text-dim" /></div>;
  if (!biz) return <div className="card p-12 text-center">Business not found.</div>;

  const color = categoryColor(biz.category);
  const mapSrc = staticMap(biz.lat, biz.lng);

  if (result) return <SuccessExperience booking={result.booking} invoice={result.invoice} business={biz} mapsLink={result.maps_link} qrPayload={result.qr_payload} gmailComposeUrl={result.gmail_compose_url} emailStatus={result.pipeline?.email} onClose={() => nav('/appointments')} />;

  return (
    <div>
      <button onClick={() => nav(-1)} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> Back</button>

      <div className="relative rounded-3xl overflow-hidden h-52 sm:h-64 mb-6">
        <img src={biz.cover_url || biz.image_url} alt={biz.name} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="glass rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 text-xs mb-2"><CategoryIcon category={biz.category} className="h-3.5 w-3.5" color={color} /> {biz.category}</div>
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
            <a href={`tel:${biz.phone}`} className="inline-flex items-center gap-1.5 text-[var(--color-brand-indigo)]"><Phone className="h-4 w-4" /> {biz.phone}</a>
          </div>
          <p className="text-muted">{biz.description}</p>

          {/* Services */}
          <div>
            <h2 className="font-semibold mb-3">Choose a service</h2>
            <div className="space-y-2">
              {(biz.services || []).map(s => (
                <motion.button whileTap={{ scale: 0.99 }} key={s.id} onClick={() => setService(s)} className={`w-full text-left rounded-2xl border p-4 flex items-center justify-between transition-all ${service?.id === s.id ? 'border-[var(--color-brand-indigo)] bg-[var(--color-brand-indigo)]/10' : 'border-app hover:border-[var(--border-strong)]'}`}>
                  <div><p className="font-medium">{s.name}</p><p className="text-sm text-dim">{s.description} · {s.duration_min} min</p></div>
                  <span className="font-semibold">{inr(s.price)}</span>
                </motion.button>
              ))}
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
                {(biz.staff || []).map(st => (
                  <button key={st.id} onClick={() => setStaff(st)} className={`flex flex-col items-center gap-2 min-w-[76px] ${staff?.id === st.id ? '' : 'opacity-70'}`}>
                    <div className={`h-14 w-14 rounded-full grid place-items-center text-white text-sm font-semibold border-2 grad-btn ${staff?.id === st.id ? 'border-[var(--color-brand-indigo)]' : 'border-transparent'}`}>{st.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                    <span className="text-xs text-center leading-tight">{st.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Availability forecast */}
          <Heatmap businessId={biz.id} onPickDate={(d) => setDate(d)} />

          {/* Map */}
          {mapSrc && (
            <div>
              <h2 className="font-semibold mb-3">Location & directions</h2>
              <div className="rounded-2xl overflow-hidden border border-app h-56"><iframe title="location" src={mapSrc} className="w-full h-full border-0" loading="lazy" /></div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={mapsDirections(biz.address || biz.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--color-brand-indigo)] font-medium"><Navigation className="h-4 w-4" /> Get directions</a>
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
                <span className="text-dim">{service.name}</span><span className="font-semibold">{inr(service.price)}</span>
              </div>
            )}
            {err && <p className="text-sm text-red-400 mt-3">{err}</p>}
            <motion.button whileTap={{ scale: 0.98 }} onClick={confirm} disabled={!slot || !service || submitting} className="mt-4 w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Booking…</> : !user ? <>Sign in to book <ChevronRight className="h-4 w-4" /></> : <>Confirm booking <ChevronRight className="h-4 w-4" /></>}
            </motion.button>
            <p className="mt-2 text-center text-[11px] text-dim">Free cancellation · Instant confirmation · Calendar sync</p>
          </div>
        </div>
      </div>
    </div>
  );
}
