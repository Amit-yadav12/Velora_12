import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2, Clock3, ExternalLink, Image as ImageIcon, Loader2, MapPin, Plus, ShieldCheck, Sparkles, Store, Trash2, Users } from 'lucide-react';
import { Logo } from '../../components/Logo';
import ImageUploader from '../../components/premium/ImageUploader';
import InteractiveMap from '../../components/premium/InteractiveMap';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { CATEGORIES, type Business } from '../../lib/product';
import { CITIES, getCity } from '../../lib/cities';
import { apiGet, apiSend } from '../../lib/api';
import { cacheInvalidate } from '../../lib/smartCache';
import { isDemoMode } from '../../lib/supabase';
import { errMsg } from '../../lib/types';
import { inr } from '../../lib/format';
import { onBusinessesChanged, emitBusinessesChanged } from '../../services/events';

interface Hours { open: string; close: string; closed: boolean }
interface ServiceForm { name: string; description: string; duration_min: number; price: number; image_url: string | null }
interface StaffForm { name: string; role: string }
interface Form {
  name: string; category: string; description: string; phone: string; email: string; website: string;
  address: string; area: string; city: string; state: string; pin: string; lat: number | null; lng: number | null;
  google_place_id: string | null; location_confirmed: boolean;
  photos: string[]; logo_url: string | null; open_time: string; close_time: string;
  weekly_hours: Record<string, Hours>; holidays: string[]; amenities: string[]; booking_policy: string; cancellation_hours: number;
  services: ServiceForm[]; staff: StaffForm[]; active: boolean;
}
interface Prediction { label: string; lat: number; lng: number; city?: string; state?: string; pin?: string; place_id?: string | null }
const DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']] as const;
const STEPS = ['Your business', 'Photos', 'Location', 'Services & hours', 'Review'];
const newHours = () => Object.fromEntries(DAYS.map(([d]) => [d, { open: '09:00', close: '20:00', closed: false }]));
const blankService = (): ServiceForm => ({ name: '', description: '', duration_min: 30, price: 0, image_url: null });
const blankForm = (city: string, email: string): Form => ({
  name: '', category: 'Salons', description: '', phone: '', email, website: '', address: '', area: '', city,
  state: getCity(city)?.state || '', pin: '', lat: null, lng: null, google_place_id: null, location_confirmed: false,
  photos: [], logo_url: null, open_time: '09:00', close_time: '20:00', weekly_hours: newHours(), holidays: [],
  amenities: [], booking_policy: '', cancellation_hours: 0, services: [blankService()], staff: [], active: false,
});
const validCoords = (lat: number | null, lng: number | null) => lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="block text-sm font-medium mb-1.5">{text}</span>{children}{hint && <span className="block text-xs text-dim mt-1.5">{hint}</span>}</label>;
}

function Preview({ form }: { form: Form }) {
  const price = form.services.filter((s) => s.name.trim()).map((s) => s.price);
  return <div className="launch-preview overflow-hidden rounded-[24px] border border-white/10 bg-[#111323] shadow-2xl text-white">
    <div className="relative h-36 sm:h-44 overflow-hidden bg-gradient-to-br from-[#222c58] via-[#252148] to-[#123932]">
      {form.photos[0] ? <img src={form.photos[0]} alt="Business cover preview" className="h-full w-full object-cover" /> : <div className="h-full grid place-items-center"><div className="text-center text-white/55"><ImageIcon className="h-7 w-7 mx-auto mb-2" /><p className="text-xs">Your business photo</p></div></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-[#111323]/80 to-transparent" />
      <div className="absolute left-4 bottom-3 flex gap-2"><span className="rounded-full bg-white/15 backdrop-blur px-2.5 py-1 text-[10px] font-medium">{form.category}</span><span className="rounded-full bg-[#9be8d4]/15 text-[#a8f4db] px-2.5 py-1 text-[10px] font-medium">PREVIEW</span></div>
    </div>
    <div className="p-5">
      <div className="flex gap-3 items-start">
        {form.logo_url ? <img src={form.logo_url} alt="Business logo preview" className="h-11 w-11 object-cover rounded-xl border border-white/20" /> : <div className="h-11 w-11 rounded-xl bg-white/10 grid place-items-center"><Store className="h-5 w-5 text-[#9fa9fc]" /></div>}
        <div className="min-w-0"><h3 className="font-semibold truncate text-lg">{form.name || 'Your business name'}</h3><p className="text-xs text-white/55 mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {form.area || form.city || 'Your location'}</p></div>
      </div>
      <p className="text-sm text-white/60 leading-relaxed mt-4 line-clamp-2">{form.description || 'A little story about what makes your business special will appear here.'}</p>
      <div className="border-t border-white/10 mt-4 pt-4 flex items-center justify-between text-xs text-white/60"><span>Services from</span><strong className="text-white text-sm">{price.length ? inr(Math.min(...price)) : 'Add a service'}</strong></div>
    </div>
  </div>;
}

export default function BusinessOnboarding() {
  const nav = useNavigate();
  const { id } = useParams();
  const { user, profile, loading: authLoading, refresh } = useAuth();
  const { city } = useLocation();
  const [form, setForm] = useState<Form>(() => blankForm(city.name, user?.email || ''));
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [busyUploads, setBusyUploads] = useState(0);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<Business | null>(null);
  const [existingCount, setExistingCount] = useState(0);
  const [holidayText, setHolidayText] = useState('');
  const [amenityText, setAmenityText] = useState('');
  const [search, setSearch] = useState('');
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [suggested, setSuggested] = useState<Prediction | null>(null);
  const mapCenter = useMemo(() => {
    if (validCoords(form.lat, form.lng)) return { lat: form.lat!, lng: form.lng! };
    const c = getCity(form.city) || city;
    return { lat: c.lat, lng: c.lng };
  }, [form.lat, form.lng, form.city, city]);
  const selected = useMemo(() => validCoords(form.lat, form.lng) ? { lat: form.lat!, lng: form.lng! } : null, [form.lat, form.lng]);
  const uploadBusy = (busy: boolean) => setBusyUploads((n) => Math.max(0, n + (busy ? 1 : -1)));

  useEffect(() => { if (user?.email) setForm((f) => ({ ...f, email: f.email || user.email || '' })); }, [user?.email]);
  useEffect(() => {
    if (!id || !user) return;
    let live = true;
    Promise.all([apiGet<Business[]>('/api/admin?resource=business'), apiGet<{ business_id: number | string; active?: boolean }[]>('/api/admin?resource=services')])
      .then(([businesses, services]) => {
        if (!live) return;
        const b = businesses.find((x) => String(x.id) === String(id));
        if (!b) { setError('This business was not found in your account.'); return; }
        const hours = b.weekly_hours && Object.keys(b.weekly_hours).length ? b.weekly_hours : newHours();
        const fallbackOpen = b.open_time || '09:00', fallbackClose = b.close_time || '20:00';
        const normalizedHours = Object.fromEntries(DAYS.map(([day]) => [day, hours[day] || { open: fallbackOpen, close: fallbackClose, closed: false }]));
        setForm({ ...blankForm(b.city || city.name, b.email || user.email || ''),
          name: b.name, category: b.category, description: b.description || '', phone: b.phone || '', email: b.email || '', website: b.website || '',
          address: b.address || '', area: b.area || '', city: b.city || '', state: b.state || '', pin: b.pin || '', lat: b.lat ?? null, lng: b.lng ?? null,
          google_place_id: b.google_place_id || null, location_confirmed: b.location_status === 'verified' || b.location_status === 'owner_confirmed',
          photos: b.photos?.length ? b.photos : [...new Set([b.cover_url, b.image_url].filter((v): v is string => !!v))], logo_url: b.logo_url || null, open_time: fallbackOpen, close_time: fallbackClose,
          weekly_hours: normalizedHours, holidays: b.holidays || [], amenities: b.amenities || [], booking_policy: b.booking_policy || '', cancellation_hours: b.cancellation_hours || 0,
          services: [], staff: [], active: b.active !== false,
        });
        setExistingCount(services.filter((s) => String(s.business_id) === String(id) && s.active !== false).length);
        setHolidayText((b.holidays || []).join(', ')); setAmenityText((b.amenities || []).join(', '));
      }).catch((e: unknown) => live && setError(errMsg(e) || 'Could not load the business.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [id, user, city.name]);

  useEffect(() => {
    if (search.trim().length < 3) { setPredictions([]); return; }
    let live = true;
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError('');
      apiGet<{ predictions: Prediction[]; error?: string }>(`/api/geocode?q=${encodeURIComponent(search)}`)
        .then((r) => { if (live) { setPredictions(r.predictions || []); setSearchError(r.error || ''); } })
        .catch(() => live && setSearchError('Address search is unavailable. Enter the address and coordinates manually.'))
        .finally(() => live && setSearching(false));
    }, 400);
    return () => { live = false; clearTimeout(timer); };
  }, [search]);

  // Keep the review fresh if another console operation updated the catalogue.
  useEffect(() => onBusinessesChanged(() => cacheInvalidate('discover:')), []);

  if (authLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--color-brand-indigo)]" /></div>;
  if (!user) return <div className="min-h-screen grid place-items-center p-6"><div className="launch-panel p-8 max-w-md text-center"><Logo size={36} /><h1 className="text-2xl font-semibold mt-5">Let’s make your business discoverable.</h1><p className="text-sm text-muted mt-2">Sign in first to keep your business and uploaded photos connected to your account.</p><Link to={`/welcome?role=business&next=${encodeURIComponent(id ? `/onboard/${id}` : '/onboard')}`} className="grad-btn inline-flex text-white rounded-xl px-5 py-3 mt-5">Sign in or create account</Link></div></div>;
  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--color-brand-indigo)]" /></div>;

  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const addressChange = (key: 'address' | 'city' | 'state' | 'pin', value: string) => setForm((f) => ({ ...f, [key]: value, location_confirmed: false, google_place_id: null }));
  const selectPrediction = (p: Prediction) => {
    setForm((f) => ({ ...f, address: p.label, lat: p.lat, lng: p.lng, city: p.city || f.city, state: p.state || f.state, pin: p.pin || f.pin, google_place_id: p.place_id || null, location_confirmed: false }));
    setSearch(''); setPredictions([]); setSuggested(null);
  };
  const pickPoint = (point: { lat: number; lng: number }) => {
    const lat = Number(point.lat.toFixed(6)), lng = Number(point.lng.toFixed(6));
    setForm((f) => ({ ...f, lat, lng, google_place_id: null, location_confirmed: false }));
    setSuggested(null);
    apiGet<{ predictions: Prediction[] }>(`/api/geocode?lat=${lat}&lng=${lng}`).then((d) => setSuggested(d.predictions?.[0] || null)).catch(() => {});
  };
  const setService = (i: number, patch: Partial<ServiceForm>) => setForm((f) => ({ ...f, services: f.services.map((s, x) => x === i ? { ...s, ...patch } : s) }));
  const setStaff = (i: number, patch: Partial<StaffForm>) => setForm((f) => ({ ...f, staff: f.staff.map((s, x) => x === i ? { ...s, ...patch } : s) }));
  const stepError = (): string => {
    if (step === 0 && (!form.name.trim() || !form.category)) return 'Add your business name and category to continue.';
    if (step === 3 && form.services.some((s) => s.name && (s.duration_min < 5 || s.duration_min > 600 || s.price < 0))) return 'Check the duration and ₹ price for each service.';
    return '';
  };
  const nextStep = () => { const e = stepError(); setError(e); if (!e) { setStep((n) => Math.min(4, n + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const save = async (publish: boolean) => {
    setError('');
    if (busyUploads) { setError('Wait for the image uploads to finish.'); return; }
    if (isDemoMode) { setError('Supabase is not configured. This is a preview only; no business or images have been saved.'); return; }
    if (!form.name.trim() || !form.category) { setError('Add your business name and category.'); setStep(0); return; }
    const services = form.services.filter((s) => s.name.trim());
    if (publish && (!form.address.trim() || !form.city.trim() || !form.state.trim() || !/^[1-9]\d{5}$/.test(form.pin))) { setError('Add your full address, city, state and 6-digit PIN before publishing.'); setStep(2); return; }
    if (publish && (!validCoords(form.lat, form.lng) || !form.location_confirmed)) { setError('Place the pin and confirm that it matches the address.'); setStep(2); return; }
    if (publish && !services.length && !existingCount) { setError('Add at least one service before publishing.'); setStep(3); return; }
    if (services.some((s) => !Number.isInteger(s.duration_min) || s.duration_min < 5 || s.duration_min > 600 || !Number.isFinite(s.price) || s.price < 0)) { setError('Check each service duration and price.'); setStep(3); return; }
    const holidays = holidayText.split(',').map((x) => x.trim()).filter(Boolean);
    if (holidays.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) { setError('Use YYYY-MM-DD for holiday dates.'); setStep(3); return; }
    setSaving(true);
    try {
      const response = await apiSend<{ ok: boolean; business: Business }>('/api/register-business', id ? 'PUT' : 'POST', {
        ...form, id: id ? Number(id) : undefined, owner_name: profile?.full_name, active: publish,
        services, staff: form.staff.filter((s) => s.name.trim()), holidays,
        amenities: amenityText.split(',').map((x) => x.trim()).filter(Boolean),
      }, { timeout: 25000 });
      if (!response.ok || !response.business?.id) throw new Error('The business could not be saved.');
      cacheInvalidate('discover:'); cacheInvalidate('/api/discover'); cacheInvalidate('business:');
      emitBusinessesChanged();
      await refresh().catch(() => {});
      setSaved(response.business);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) { setError(errMsg(e) || 'Could not confirm the save. Check your dashboard before retrying.'); }
    finally { setSaving(false); }
  };

  if (saved) return <div className="min-h-screen px-4 py-8 sm:py-12">
    <div className="max-w-5xl mx-auto"><Logo size={36} /><motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mt-10 grid lg:grid-cols-2 gap-10 items-center">
      <div><div className="h-14 w-14 rounded-2xl bg-emerald-400/15 border border-emerald-400/25 grid place-items-center text-emerald-400"><CheckCircle2 className="h-7 w-7" /></div><p className="uppercase tracking-[.2em] text-[11px] text-emerald-400 font-semibold mt-6">{saved.active ? 'Your launch is live' : 'Saved as a draft'}</p><h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.08] mt-3">{saved.active ? 'A new chapter starts here.' : 'A beautiful start.'}</h1><p className="text-muted leading-relaxed mt-4 max-w-md">{saved.active ? `${saved.name} is saved and visible in customer discovery. Your services are listed on your profile.` : `${saved.name} is safely saved to your account. Publish when your location and services are ready.`}</p>
        <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-app px-3 py-1.5 text-xs text-muted flex gap-1.5 items-center"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Saved to your account</span><span className="rounded-full border border-app px-3 py-1.5 text-xs text-muted flex gap-1.5 items-center"><MapPin className="h-3.5 w-3.5 text-indigo-400" />{saved.location_status === 'verified' ? 'Google-verified pin' : saved.location_status === 'owner_confirmed' ? 'Owner-confirmed pin' : 'Location not verified'}</span></div>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/admin/businesses" className="grad-btn rounded-xl px-5 py-3 text-sm text-white font-semibold inline-flex gap-2 items-center">Go to business dashboard <ArrowRight className="h-4 w-4" /></Link>{saved.active && <Link to={`/business/${saved.id}`} className="rounded-xl border border-app px-5 py-3 text-sm font-medium inline-flex gap-2 items-center">View your profile <ExternalLink className="h-4 w-4" /></Link>}</div>
      </div>
      <div className="space-y-4"><Preview form={form} /><div className="launch-panel p-5"><p className="text-sm font-semibold">{form.address || saved.address || 'Address not added'}</p><p className="text-xs text-dim mt-1">{form.city}{form.state ? `, ${form.state}` : ''} {form.pin}</p>{selected && <div className="mt-4 h-48"><InteractiveMap center={selected} selected={selected} /></div>}{form.services.filter((s) => s.name).slice(0, 3).map((s, i) => <div key={i} className="flex justify-between text-sm border-t border-app pt-3 mt-3"><span>{s.name} <span className="text-dim">· {s.duration_min} min</span></span><strong>{inr(s.price)}</strong></div>)}</div></div>
    </motion.div></div>
  </div>;

  return <div className="min-h-screen pb-16">
    <header className="border-b border-app bg-elev/80 backdrop-blur sticky top-0 z-40"><div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between"><Link to={profile?.role === 'admin' ? '/admin/businesses' : '/'}><Logo size={34} /></Link><span className="hidden sm:flex text-xs text-dim items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Your details belong to you</span><Link to={profile?.role === 'admin' ? '/admin/businesses' : '/'} className="text-sm text-muted hover:text-[var(--text)]">Exit</Link></div></header>
    <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-7 sm:pt-10">
      <div className="max-w-3xl"><p className="text-[11px] uppercase tracking-[.22em] text-[var(--color-brand-indigo)] font-semibold">Velora for business</p><h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">{id ? 'Make your profile shine.' : 'Your business, beautifully booked.'}</h1><p className="text-muted text-sm sm:text-base mt-2">A thoughtful first impression, a simpler way to welcome customers.</p></div>
      {isDemoMode && <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">Preview mode: connect Supabase Auth, database and Storage before saving a real business or uploading photos.</div>}
      <ol aria-label="Business setup progress" className="mt-7 flex gap-2 sm:gap-4 overflow-x-auto pb-2">{STEPS.map((s, i) => <li key={s} className="flex items-center gap-2 shrink-0"><button type="button" onClick={() => { if (i <= step) { setStep(i); setError(''); } }} aria-current={i === step ? 'step' : undefined} className={`h-8 w-8 rounded-full text-xs font-semibold grid place-items-center ${i < step ? 'bg-emerald-400/15 text-emerald-400' : i === step ? 'grad-btn text-white' : 'border border-app text-dim'}`}>{i < step ? <Check className="h-4 w-4" /> : i + 1}</button><span className={`text-xs hidden sm:block ${i === step ? 'text-[var(--text)] font-medium' : 'text-dim'}`}>{s}</span>{i < STEPS.length - 1 && <span className="w-4 lg:w-8 h-px bg-[var(--border)] ml-1" />}</li>)}</ol>
      <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_360px] gap-7 xl:gap-12 items-start">
        <section className="launch-panel p-5 sm:p-8">
          {step === 0 && <div className="space-y-5"><div><p className="text-xs text-[var(--color-brand-indigo)] font-semibold uppercase tracking-wider">01 / The essentials</p><h2 className="text-2xl font-semibold mt-2">Tell your story.</h2><p className="text-sm text-dim mt-1">The details customers will see first.</p></div>
            <div className="grid sm:grid-cols-2 gap-4"><Label text="Business name *"><input className="launch-input" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. The Studio Jaipur" maxLength={160} /></Label><Label text="Category *"><select className="launch-input" value={form.category} onChange={(e) => update('category', e.target.value)}>{CATEGORIES.filter((c) => c.name !== 'All').map((c) => <option key={c.name}>{c.name}</option>)}</select></Label></div>
            <Label text="Description" hint="Tell customers what makes you different."><textarea className="launch-input resize-y" rows={4} maxLength={1000} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="A welcoming space for…" /></Label>
            <div className="grid sm:grid-cols-2 gap-4"><Label text="Phone"><input className="launch-input" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="10-digit mobile number" /></Label><Label text="Business email"><input className="launch-input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="hello@business.in" /></Label></div>
            <Label text="Website" hint="Optional"><input className="launch-input" type="url" value={form.website} onChange={(e) => update('website', e.target.value)} placeholder="https://" /></Label>
          </div>}
          {step === 1 && <div className="space-y-7"><div><p className="text-xs text-[var(--color-brand-indigo)] font-semibold uppercase tracking-wider">02 / Your visual identity</p><h2 className="text-2xl font-semibold mt-2">Show the real you.</h2><p className="text-sm text-dim mt-1">Use genuine photos of your own space. The first image becomes your cover.</p></div>
            <ImageUploader label="Business photos" images={form.photos} onChange={(v) => update('photos', v)} userId={user.id} onBusy={uploadBusy} />
            <div className="border-t border-app pt-6"><ImageUploader label="Business logo" images={form.logo_url ? [form.logo_url] : []} onChange={(v) => update('logo_url', v[0] || null)} userId={user.id} max={1} onBusy={uploadBusy} /></div>
            <p className="text-xs text-dim leading-relaxed">Images are uploaded to your account’s secure storage. Removing one here removes it from your profile; it does not delete the original file from storage.</p>
          </div>}
          {step === 2 && <div className="space-y-5"><div><p className="text-xs text-[var(--color-brand-indigo)] font-semibold uppercase tracking-wider">03 / Find your place</p><h2 className="text-2xl font-semibold mt-2">Put yourself on the map.</h2><p className="text-sm text-dim mt-1">Search an address or enter it manually. Check the pin before you publish.</p></div>
            <div className="relative"><Label text="Search for an address" hint="Select a suggestion to fill in the address and pin."><input className="launch-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a street, landmark or place" autoComplete="off" /></Label>{searching && <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin text-dim" />}{predictions.length > 0 && <div className="absolute left-0 right-0 top-[72px] z-20 rounded-xl border border-app bg-elev shadow-xl overflow-hidden">{predictions.map((p, i) => <button type="button" key={`${p.label}-${i}`} onClick={() => selectPrediction(p)} className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--surface-hover)] flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-indigo-400" />{p.label}</button>)}</div>}{searchError && <p className="text-xs text-amber-400 mt-2">{searchError}</p>}</div>
            <Label text="Full street address *"><input className="launch-input" value={form.address} onChange={(e) => addressChange('address', e.target.value)} placeholder="Building, street and locality" /></Label>
            <div className="grid sm:grid-cols-2 gap-4"><Label text="Area / locality"><input className="launch-input" value={form.area} onChange={(e) => update('area', e.target.value)} placeholder="e.g. C Scheme" /></Label><Label text="City *"><input list="velora-cities" className="launch-input" value={form.city} onChange={(e) => addressChange('city', e.target.value)} /><datalist id="velora-cities">{CITIES.map((c) => <option key={c.name} value={c.name} />)}</datalist></Label><Label text="State *"><input className="launch-input" value={form.state} onChange={(e) => addressChange('state', e.target.value)} /></Label><Label text="PIN code *"><input className="launch-input" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => addressChange('pin', e.target.value)} placeholder="6 digits" /></Label></div>
            <div><p className="text-sm font-medium mb-2">Select your location</p><div className="h-64"><InteractiveMap center={mapCenter} selected={selected} onPick={pickPoint} /></div><p className="text-xs text-dim mt-2">Click the map or drag the pin. You can also enter coordinates below.</p></div>
            {suggested && <div className="rounded-xl bg-[var(--color-brand-indigo)]/10 border border-[var(--color-brand-indigo)]/20 p-3 text-xs text-muted">Nearby address: {suggested.label} <button type="button" className="text-[var(--color-brand-indigo)] font-medium underline ml-1" onClick={() => selectPrediction({ ...suggested, lat: form.lat!, lng: form.lng!, place_id: null })}>Use address</button></div>}
            <div className="grid grid-cols-2 gap-4"><Label text="Latitude"><input className="launch-input" type="number" step="any" value={form.lat ?? ''} onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value === '' ? null : Number(e.target.value), location_confirmed: false, google_place_id: null }))} /></Label><Label text="Longitude"><input className="launch-input" type="number" step="any" value={form.lng ?? ''} onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value === '' ? null : Number(e.target.value), location_confirmed: false, google_place_id: null }))} /></Label></div>
            <label className="flex items-start gap-3 rounded-xl border border-app p-4 text-sm"><input type="checkbox" className="mt-1 accent-indigo-500" checked={form.location_confirmed} onChange={(e) => update('location_confirmed', e.target.checked)} disabled={!validCoords(form.lat, form.lng)} /><span>I confirm that this pin matches my business address.<span className="block text-xs text-dim mt-1">A manual pin is owner-confirmed, not automatically Google-verified.</span></span></label>
          </div>}
          {step === 3 && <div className="space-y-7"><div><p className="text-xs text-[var(--color-brand-indigo)] font-semibold uppercase tracking-wider">04 / Make it bookable</p><h2 className="text-2xl font-semibold mt-2">Your services, your schedule.</h2><p className="text-sm text-dim mt-1">Set real prices in rupees and the hours customers can book.</p></div>
            {id ? <div className="rounded-xl border border-app p-4"><p className="font-medium text-sm">{existingCount} active service{existingCount === 1 ? '' : 's'}</p><p className="text-xs text-dim mt-1">Services and team members are managed separately so existing appointments remain intact.</p><Link className="inline-flex text-sm text-[var(--color-brand-indigo)] mt-3" to="/admin/services">Manage services <ArrowRight className="h-4 w-4 ml-1" /></Link><Link className="inline-flex text-sm text-[var(--color-brand-indigo)] mt-3 ml-5" to="/admin/staff">Manage staff <ArrowRight className="h-4 w-4 ml-1" /></Link></div> : <div className="space-y-4"><div className="flex items-center justify-between"><h3 className="font-semibold">Services</h3><button type="button" onClick={() => update('services', [...form.services, blankService()])} className="text-sm text-[var(--color-brand-indigo)] flex items-center gap-1"><Plus className="h-4 w-4" /> Add service</button></div>{form.services.map((s, i) => <div key={i} className="rounded-2xl border border-app p-4 space-y-3"><div className="flex items-center justify-between text-xs text-dim"><span>SERVICE {i + 1}</span>{form.services.length > 1 && <button type="button" onClick={() => update('services', form.services.filter((_, x) => x !== i))} aria-label={`Remove service ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}</div><Label text="Service name"><input className="launch-input" value={s.name} onChange={(e) => setService(i, { name: e.target.value })} placeholder="e.g. Signature haircut" /></Label><div className="grid grid-cols-2 gap-3"><Label text="Duration (min)"><input className="launch-input" type="number" min={5} max={600} value={s.duration_min} onChange={(e) => setService(i, { duration_min: Number(e.target.value) })} /></Label><Label text="Price (₹)"><input className="launch-input" type="number" min={0} step="0.01" value={s.price} onChange={(e) => setService(i, { price: Number(e.target.value) })} /></Label></div><Label text="Description"><input className="launch-input" value={s.description} onChange={(e) => setService(i, { description: e.target.value })} placeholder="What’s included" /></Label><ImageUploader label="Service photo (optional)" images={s.image_url ? [s.image_url] : []} onChange={(v) => setService(i, { image_url: v[0] || null })} userId={user.id} max={1} onBusy={uploadBusy} /></div>)}</div>}
            {!id && <div className="space-y-3"><div className="flex justify-between items-center"><h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-indigo-400" /> Your team <span className="text-xs font-normal text-dim">optional</span></h3><button type="button" onClick={() => update('staff', [...form.staff, { name: '', role: '' }])} className="text-sm text-[var(--color-brand-indigo)] flex items-center gap-1"><Plus className="h-4 w-4" /> Add staff</button></div>{form.staff.map((s, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><input aria-label={`Staff ${i + 1} name`} className="launch-input" value={s.name} placeholder="Name" onChange={(e) => setStaff(i, { name: e.target.value })} /><input aria-label={`Staff ${i + 1} role`} className="launch-input" value={s.role} placeholder="Role" onChange={(e) => setStaff(i, { role: e.target.value })} /><button type="button" aria-label={`Remove staff ${i + 1}`} onClick={() => update('staff', form.staff.filter((_, x) => x !== i))}><Trash2 className="h-4 w-4 text-dim" /></button></div>)}</div>}
            <div className="space-y-3"><h3 className="font-semibold flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-400" /> Weekly opening hours</h3>{DAYS.map(([day, name]) => { const h = form.weekly_hours[day]; return <div key={day} className="grid grid-cols-[82px_1fr_1fr_auto] gap-2 items-center text-sm"><span className="text-muted">{name.slice(0, 3)}</span><input aria-label={`${name} opens`} type="time" className="launch-input !px-2" value={h.open} disabled={h.closed} onChange={(e) => update('weekly_hours', { ...form.weekly_hours, [day]: { ...h, open: e.target.value } })} /><input aria-label={`${name} closes`} type="time" className="launch-input !px-2" value={h.close} disabled={h.closed} onChange={(e) => update('weekly_hours', { ...form.weekly_hours, [day]: { ...h, close: e.target.value } })} /><label className="text-xs text-dim flex gap-1 items-center"><input type="checkbox" checked={h.closed} onChange={(e) => update('weekly_hours', { ...form.weekly_hours, [day]: { ...h, closed: e.target.checked } })} /> Closed</label></div>; })}</div>
            <Label text="Holiday closures" hint="Comma-separated dates, e.g. 2026-12-25, 2027-01-01."><input className="launch-input" value={holidayText} onChange={(e) => setHolidayText(e.target.value)} placeholder="YYYY-MM-DD" /></Label><Label text="Amenities" hint="Separate with commas."><input className="launch-input" value={amenityText} onChange={(e) => setAmenityText(e.target.value)} placeholder="Wi-Fi, parking, wheelchair access" /></Label><Label text="Cancellation notice (hours)" hint="Customers can cancel before this cutoff. Staff can assist after it."><input className="launch-input" type="number" min={0} max={720} value={form.cancellation_hours} onChange={(e) => update('cancellation_hours', Number(e.target.value))} /></Label><Label text="Booking policy"><textarea className="launch-input" rows={3} value={form.booking_policy} onChange={(e) => update('booking_policy', e.target.value)} placeholder="Anything customers should know before they arrive" /></Label>
          </div>}
          {step === 4 && <div className="space-y-5"><div><p className="text-xs text-[var(--color-brand-indigo)] font-semibold uppercase tracking-wider">05 / Ready when you are</p><h2 className="text-2xl font-semibold mt-2">A final look.</h2><p className="text-sm text-dim mt-1">Publish when everything is right, or save a private draft.</p></div><div className="rounded-2xl border border-app divide-y divide-[var(--border)]">{[['Business', form.name || 'Not added'], ['Category', form.category], ['Address', [form.address, form.city, form.state, form.pin].filter(Boolean).join(', ') || 'Not added'], ['Map pin', selected ? `${selected.lat.toFixed(5)}, ${selected.lng.toFixed(5)} · ${form.location_confirmed ? 'owner confirmed' : 'needs confirmation'}` : 'Not added'], ['Photos', `${form.photos.length} uploaded`], ['Services', id ? `${existingCount} active` : `${form.services.filter((s) => s.name.trim()).length} added`]].map(([k, v]) => <div key={k} className="flex justify-between gap-5 px-4 py-3 text-sm"><span className="text-dim">{k}</span><span className="text-right font-medium">{v}</span></div>)}</div><p className="text-xs text-dim flex gap-2 leading-relaxed"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" /> Only published businesses appear in discovery. A confirmed pin is not the same as a provider-verified address.</p></div>}
          {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">{error}</p>}
          <div className="mt-8 pt-5 border-t border-app flex flex-wrap justify-between gap-3"><button type="button" onClick={() => { setError(''); if (step > 0) setStep(step - 1); else nav(-1); }} className="rounded-xl border border-app px-4 py-3 text-sm font-medium inline-flex items-center gap-2"><ArrowLeft className="h-4 w-4" /> Back</button>{step < 4 ? <button type="button" onClick={nextStep} disabled={busyUploads > 0} className="grad-btn rounded-xl px-5 py-3 text-sm text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50">Continue <ArrowRight className="h-4 w-4" /></button> : <div className="flex gap-2"><button type="button" disabled={saving || busyUploads > 0} onClick={() => void save(false)} className="rounded-xl border border-app px-4 py-3 text-sm font-medium disabled:opacity-50">{id && form.active ? 'Unpublish & save draft' : 'Save draft'}</button><button type="button" disabled={saving || busyUploads > 0} onClick={() => void save(true)} className="grad-btn rounded-xl px-5 py-3 text-sm text-white font-semibold inline-flex items-center gap-2 disabled:opacity-50">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <>{id ? 'Save & publish' : 'Publish business'} <ArrowRight className="h-4 w-4" /></>}</button></div>}</div>
        </section>
        <aside className="lg:sticky lg:top-24 space-y-4"><div className="flex justify-between items-center"><div><p className="text-sm font-semibold">Live preview</p><p className="text-xs text-dim mt-1">A first look at your profile</p></div><Sparkles className="h-4 w-4 text-indigo-400" /></div><Preview form={form} /><div className="rounded-2xl border border-app p-4 flex gap-3"><div className="h-9 w-9 rounded-xl bg-emerald-400/10 grid place-items-center shrink-0"><BadgeCheck className="h-4 w-4 text-emerald-400" /></div><div><p className="text-sm font-medium">Built on trust</p><p className="text-xs text-dim leading-relaxed mt-1">Real photos, clear prices, and a location you confirm. You’re always in control.</p></div></div></aside>
      </div>
    </main>
  </div>;
}
