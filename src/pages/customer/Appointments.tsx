import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, MapPin, Clock, Navigation, X, CalendarClock, Loader2, Star, ChevronDown, Car } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { mapsDirections } from '../../lib/product';
import { apiGet, apiSend } from '../../lib/api';
import supabase from '../../lib/supabase';
import { onBookingsChanged, toast } from '../../services/events';
import ProgressTracker from '../../components/premium/ProgressTracker';
import { inr, istTime, ist } from '../../lib/format';
import QueueTracker from '../../components/premium/QueueTracker';
import { listLocalBookings, updateLocalBooking } from '../../lib/offlineStore';

function LeaveNow({ ref: bref, origin }: { ref: string; origin?: { lat: number; lng: number } | null }) {
  const [plan, setPlan] = useState<any>(null);
  useEffect(() => {
    const geo = origin ? `&origin_lat=${origin.lat}&origin_lng=${origin.lng}` : '';
    fetch(`/api/travel-planner?booking_ref=${bref}${geo}`).then(r => r.json()).then(setPlan).catch(() => {});
  }, [bref, origin?.lat, origin?.lng]);
  if (!plan || plan.error) return null;
  const soon = plan.mins_until_leave <= 60 && plan.mins_until_leave > -30;
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3 ${plan.should_leave_now ? 'bg-red-500/10 border-red-500/20' : 'bg-[var(--color-brand-blue)]/10 border-[var(--color-brand-blue)]/20'}`}>
      <Car className={`h-4 w-4 shrink-0 ${plan.should_leave_now ? 'text-red-400' : 'text-[var(--color-brand-blue)]'}`} />
      <div className="flex-1 min-w-0 text-xs">
        {plan.should_leave_now ? <p className="font-medium text-red-400">Leave now! ~{plan.travel_min} min in current traffic.</p>
          : soon ? <p className="text-muted"><span className="font-medium text-[var(--text)]">Leave by {plan.leave_label}</span> · ~{plan.travel_min} min travel + buffer</p>
          : <p className="text-muted">~{plan.travel_min} min travel · we'll remind you when to leave</p>}
      </div>
    </div>
  );
}

export default function Appointments() {
  const { profile, user } = useAuth();
  const { location } = useLocation();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [resched, setResched] = useState<any>(null);
  const [newTime, setNewTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [expanded, setExpanded] = useState<number | string | null>(null);

  const load = async () => {
    const d = await apiGet(`/api/my-bookings?email=${encodeURIComponent(profile?.email || '')}`).catch(() => []);
    const server = Array.isArray(d) ? d : [];
    // Merge local/demo bookings (synthetic + offline continuity), de-duped by ref.
    const local = listLocalBookings(profile?.email).map((b) => ({
      id: b.id, ref: b.ref, service_name: b.service_name, employee_name: b.staff_name,
      resource_name: b.business_name, start_time: b.start_time, end_time: b.end_time,
      status: b.status, price: b.price, location: b.location, local: true,
    }));
    const refs = new Set(server.map((b: any) => b.ref));
    const merged = [...server, ...local.filter((b) => !refs.has(b.ref))]
      .sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    setBookings(merged); setLoading(false);
  };
  useEffect(() => { if (profile?.email) load(); }, [profile?.email]);
  useEffect(() => { const ch = supabase.channel('appts').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load()).subscribe(); const off = onBookingsChanged(() => load()); return () => { supabase.removeChannel(ch); off(); }; }, [profile?.email]);

  const cancel = async (id: number | string) => {
    const target = bookings.find((b) => String(b.id) === String(id));
    if (target?.local) updateLocalBooking(id, { status: 'cancelled' });
    else {
      try { await apiSend('/api/bookings', 'PUT', { id, action: 'cancel' }); }
      catch { updateLocalBooking(id, { status: 'cancelled' }); }
    }
    load();
    toast('Booking cancelled', 'info');
  };
  const doResched = async () => {
    setErr(''); setBusy(true);
    try {
      const iso = new Date(newTime).toISOString();
      if (resched.local) {
        const dur = new Date(resched.end_time).getTime() - new Date(resched.start_time).getTime();
        updateLocalBooking(resched.id, { start_time: iso, end_time: new Date(new Date(iso).getTime() + dur).toISOString() });
      } else {
        await apiSend('/api/bookings', 'PUT', { id: resched.id, action: 'reschedule', start_time: iso });
      }
      setResched(null); load(); toast('Booking rescheduled', 'success');
    }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const { upcoming, past } = useMemo(() => {
    // Splitting bookings by the current time is intentional render-time logic;
    // it recomputes whenever `bookings` changes (e.g. on realtime updates).
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    return {
      upcoming: bookings.filter(b => new Date(b.start_time).getTime() > now && b.status !== 'cancelled'),
      past: bookings.filter(b => new Date(b.start_time).getTime() <= now || b.status === 'cancelled'),
    };
  }, [bookings]);
  const list = tab === 'upcoming' ? upcoming : past;

  if (!user) return (
    <div className="max-w-md mx-auto card p-10 text-center mt-10">
      <div className="h-14 w-14 rounded-2xl grad-btn grid place-items-center mx-auto mb-4"><Calendar className="h-7 w-7 text-white" /></div>
      <p className="font-semibold text-lg">Sign in to view your bookings</p>
      <p className="text-sm text-dim mt-1">Track, reschedule and manage all your appointments in one place.</p>
      <Link to="/welcome?next=/appointments" className="mt-5 inline-flex grad-btn text-white text-sm font-medium rounded-xl px-5 py-3">Sign in</Link>
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">My appointments</h1>
      <p className="text-sm text-dim mb-5">Manage your bookings, reschedule or cancel anytime.</p>
      <div className="inline-flex rounded-xl border border-app p-1 mb-6">
        {(['upcoming', 'past'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-5 py-2 text-sm rounded-lg capitalize transition-all ${tab === t ? 'grad-btn text-white' : 'text-muted'}`}>{t} {t === 'upcoming' && upcoming.length > 0 && `(${upcoming.length})`}</button>
        ))}
      </div>

      {loading ? <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-dim" /></div> : list.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-surface grid place-items-center mx-auto mb-3"><Calendar className="h-6 w-6 text-dim" /></div>
          <p className="font-medium">No {tab} appointments</p>
          <p className="text-sm text-dim mt-1">{tab === 'upcoming' ? 'Book your next appointment to see it here.' : 'Your history will appear here.'}</p>
          {tab === 'upcoming' && <Link to="/" className="mt-4 inline-flex grad-btn text-white text-sm font-medium rounded-xl px-4 py-2.5">Explore businesses</Link>}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((b, i) => {
            const past = tab === 'past';
            return (
              <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4">
                <div className="flex items-start gap-4">
                  <div className={`h-14 w-14 rounded-2xl grid place-items-center text-center shrink-0 ${b.status === 'cancelled' ? 'bg-red-500/10' : 'grad-btn'}`}>
                    <div className={b.status === 'cancelled' ? 'text-red-400' : 'text-white'}>
                      <p className="text-[10px] uppercase leading-none">{ist(b.start_time, { month: 'short' })}</p>
                      <p className="text-xl font-semibold leading-tight">{ist(b.start_time, { day: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{b.service_name}</h3>
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg capitalize ${b.status === 'cancelled' ? 'bg-red-500/15 text-red-400' : b.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>{b.status.replace('_', ' ')}</span>
                    </div>
                    <p className="text-sm text-dim">{b.resource_name}{b.employee_name ? ` · ${b.employee_name}` : ''}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{istTime(b.start_time)}</span>
                      {b.location && <span className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{b.location}</span></span>}
                      <span className="font-mono">{b.ref}</span>
                    </div>
                  </div>
                  <span className="font-semibold text-sm shrink-0">{inr(b.price)}</span>
                </div>
                {!past && b.status === 'confirmed' && (
                  <div className="mt-3 pt-3 border-t border-app flex flex-wrap gap-2 items-center">
                    {b.location && <a href={mapsDirections(b.location)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-app px-3 py-1.5 hover:border-[var(--border-strong)]"><Navigation className="h-3.5 w-3.5" /> Directions</a>}
                    <button onClick={() => { setResched(b); setNewTime(new Date(b.start_time).toISOString().slice(0, 16)); }} className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-app px-3 py-1.5 hover:border-[var(--border-strong)]"><CalendarClock className="h-3.5 w-3.5" /> Reschedule</button>
                    <button onClick={() => cancel(b.id)} className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-app px-3 py-1.5 hover:border-red-400/50 hover:text-red-400"><X className="h-3.5 w-3.5" /> Cancel</button>
                    <button onClick={() => setExpanded(e => e === b.id ? null : b.id)} className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-brand-indigo)] font-medium">Track {expanded === b.id ? <ChevronDown className="h-3.5 w-3.5 rotate-180 transition-transform" /> : <ChevronDown className="h-3.5 w-3.5 transition-transform" />}</button>
                  </div>
                )}
                <AnimatePresence>
                  {!past && expanded === b.id && (
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: [0.22,1,0.36,1] }} className="mt-3 space-y-3 overflow-hidden">
                      <ProgressTracker status={b.status} startTime={b.start_time} />
                      <QueueTracker startTime={b.start_time} />
                      <LeaveNow ref={b.ref} origin={location} />
                    </motion.div>
                  )}
                </AnimatePresence>
                {past && b.status === 'completed' && (
                  <div className="mt-3 pt-3 border-t border-app flex items-center gap-1"><span className="text-xs text-dim mr-1">Rate:</span>{[1,2,3,4,5].map(s => <Star key={s} className="h-4 w-4 text-amber-400" />)}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {resched && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setResched(null)} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative glass rounded-2xl p-6 w-full max-w-sm">
              <h3 className="font-semibold">Reschedule</h3><p className="text-sm text-dim mt-1">{resched.service_name} · {resched.ref}</p>
              <input type="datetime-local" value={newTime} onChange={e => setNewTime(e.target.value)} className="mt-4 w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
              {err && <p className="text-sm text-red-400 mt-2">{err}</p>}
              <div className="mt-4 flex gap-2"><button onClick={() => setResched(null)} className="flex-1 rounded-xl border border-app py-2.5 text-sm">Keep it</button><button onClick={doResched} disabled={busy} className="flex-1 grad-btn text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm</button></div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
