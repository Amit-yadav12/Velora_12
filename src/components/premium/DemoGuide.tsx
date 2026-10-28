import { useEffect, useMemo, useState } from 'react';
import { useLocation as useRouterLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Check, ChevronRight, Compass, Loader2, MapPin, QrCode, RotateCcw, ShieldCheck, Store, Ticket, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation as useLocationContext } from '../../contexts/LocationContext';
import { useTheme } from '../../lib/theme';
import { isDemoMode } from '../../lib/supabase';
import { resetDemo } from '../../lib/demoStore';
import { signInDemo } from '../../lib/demoAuth';
import { toast } from '../../services/events';
import { closeDemoGuide, openDemoGuide, toggleDemoGuide, useDemoGuideOpen } from '../../lib/demoGuideStore';
import {
  DEMO_SAMPLE_BUSINESS_ID, buildJourney, clearDemoSeen, journeyProgress, latestDemoBooking,
} from '../../lib/demoJourney';
import { istTomorrow } from '../../lib/format';
import Portal from '../Portal';

/**
 * Presenter walkthrough for the isolated demo tenant.
 *
 * Every tick is derived from the shared demo dataset (the same localStorage
 * records the customer app and the console read), so this can only show
 * progress that genuinely happened. It never claims a real booking, payment,
 * email or provider action.
 */
export default function DemoGuide() {
  const open = useDemoGuideOpen();
  const nav = useNavigate();
  const routerLoc = useRouterLocation();
  const { city, setCity } = useLocationContext();
  const { user, profile, role, signOut, refresh } = useAuth();
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [booking, setBooking] = useState(() => latestDemoBooking());
  const [busy, setBusy] = useState<'customer' | 'business' | 'checkin' | null>(null);
  const [error, setError] = useState('');

  // Re-read the demo tenant whenever the route changes or the guide opens —
  // booking confirmations and check-ins happen on other screens.
  useEffect(() => {
    setBooking(latestDemoBooking());
    const update = () => setBooking(latestDemoBooking());
    window.addEventListener('velora:bookings-changed', update);
    window.addEventListener('velora:demo-reset', update);
    return () => {
      window.removeEventListener('velora:bookings-changed', update);
      window.removeEventListener('velora:demo-reset', update);
    };
  }, [routerLoc.pathname, open]);

  const steps = useMemo(() => buildJourney({ cityName: city.name, booking }), [city.name, booking]);
  const progress = journeyProgress(steps);
  const isBusiness = role === 'admin';

  const tomorrow = useMemo(() => istTomorrow(), []);

  const goSample = () => {
    setCity('Jaipur');
    nav(`/business/${DEMO_SAMPLE_BUSINESS_ID}?date=${tomorrow}&focus=booking`);
    closeDemoGuide();
  };
  const goBookings = () => { nav('/appointments'); closeDemoGuide(); };
  const goConsole = () => {
    const ref = booking?.ref ? `?focus=${encodeURIComponent(booking.ref)}` : '';
    nav(`/admin/appointments${ref}`);
    closeDemoGuide();
  };

  const becomeCustomer = async () => {
    setBusy('customer'); setError('');
    try {
      if (isBusiness) { await signOut(); }
      await signInDemo('customer');
      await refresh();
      toast('Signed in as the demo customer', 'success');
      goSample();
    } catch {
      setError('Could not start the demo customer session. Reload and try again.');
    } finally { setBusy(null); }
  };

  const becomeBusiness = async () => {
    setBusy('business'); setError('');
    try {
      if (!isBusiness) { await signOut(); await signInDemo('admin'); await refresh(); }
      goConsole();
    } catch {
      setError('Could not start the demo business session. Reload and try again.');
    } finally { setBusy(null); }
  };

  const checkInLatest = async () => {
    setBusy('checkin'); setError('');
    try {
      if (!isBusiness) { await signOut(); await signInDemo('admin'); await refresh(); }
      const ref = booking?.ref ? `&focus=${encodeURIComponent(booking.ref)}` : '';
      nav(`/admin/appointments?checkin=1${ref}`);
      closeDemoGuide();
    } catch {
      setError('Could not open the ticket check-in. Try the business console directly.');
    } finally { setBusy(null); }
  };

  const reset = () => {
    resetDemo();
    clearDemoSeen();
    setBooking(null);
    toast('Demo data restored to a clean state', 'success');
    nav('/');
  };

  // Global keyboard shortcut: "g" toggles the guide (ignored while typing).
  useEffect(() => {
    if (!isDemoMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      if (event.key.toLowerCase() === 'g') { event.preventDefault(); if (open) closeDemoGuide(); else openDemoGuide(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!isDemoMode) return null;

  const actionFor = (id: string) => {
    switch (id) {
      case 'location': return { label: 'Open sample business', onClick: becomeCustomer, busy: busy === 'customer' };
      case 'booking': return { label: 'Pick service + slot', onClick: becomeCustomer, busy: busy === 'customer' };
      case 'ticket': return { label: 'Open Bookings', onClick: goBookings, busy: false };
      case 'confirm': return { label: 'Open business console', onClick: becomeBusiness, busy: busy === 'business' };
      default: return { label: 'Verify & check in', onClick: checkInLatest, busy: busy === 'checkin' };
    }
  };
  const icons = { location: MapPin, booking: Compass, ticket: Ticket, confirm: Store, checkin: ShieldCheck } as const;

  return (
    <>
      {/* Launcher — bottom-left so it never covers the concierge (bottom-right)
          or the mobile tab bar. */}
      {/* Above the mobile tab bar; bottom-left on desktop so it never covers
          the concierge launcher (bottom-right). */}
      <div className="fixed bottom-[calc(5.6rem+env(safe-area-inset-bottom))] left-3 z-[70] sm:left-4 lg:bottom-4">
        <button
          type="button"
          onClick={toggleDemoGuide}
          aria-expanded={open}
          aria-haspopup="dialog"
          data-demo-guide-launcher
          className="group flex items-center gap-2 rounded-full border border-[var(--color-brand-violet)]/35 bg-[var(--glass)] px-3.5 py-2.5 text-xs font-medium shadow-xl backdrop-blur transition-colors hover:border-[var(--color-brand-violet)]/70"
        >
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-brand-violet)]/20 text-[10px] font-semibold text-[var(--text-link-strong)]">
            {progress.done}/{progress.total}
          </span>
          <span className="text-[var(--text)]">Demo guide</span>
        </button>
      </div>

      <Portal>
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-stretch sm:justify-end">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0 }}
                className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                onClick={closeDemoGuide}
                aria-hidden="true"
              />
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="demo-guide-title"
                initial={reduceMotion ? false : { y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduceMotion ? undefined : { y: 30, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 30, stiffness: 320 }}
                className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border border-app bg-[var(--bg-elev)] shadow-2xl sm:my-3 sm:mr-3 sm:max-h-none sm:max-w-sm sm:rounded-3xl"
              >
                <div className="flex items-start gap-3 border-b border-app px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--text-link-strong)]">Sample tenant · Jaipur</p>
                    <h2 id="demo-guide-title" className="mt-0.5 text-lg font-semibold tracking-tight">Presenter walkthrough</h2>
                    <p className="mt-1 text-xs text-dim">
                      {progress.done} of {progress.total} steps done. Sample businesses and bookings live in this browser — nothing is sent to a real provider.
                    </p>
                  </div>
                  <button type="button" onClick={closeDemoGuide} aria-label="Close demo guide" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-app hover:border-[var(--border-strong)]">
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="h-1 w-full bg-[var(--surface)]">
                  <div className="h-full bg-[linear-gradient(100deg,#3b82f6,#6366f1)] transition-[width] duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <ol className="space-y-2">
                    {steps.map((step, index) => {
                      const Icon = icons[step.id];
                      const action = actionFor(step.id);
                      const next = !step.done && steps.slice(0, index).every((s) => s.done);
                      return (
                        <li
                          key={step.id}
                          data-demo-step={step.id}
                          data-demo-step-done={step.done ? 'true' : 'false'}
                          className={`rounded-2xl border p-3 transition-colors ${step.done
                            ? 'border-emerald-500/30 bg-emerald-500/[0.07]'
                            : next ? 'border-[var(--color-brand-indigo)]/45 bg-[var(--color-brand-indigo)]/[0.08]' : 'border-app'}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${step.done ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[var(--surface)] text-muted'}`}>
                              {step.done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-1.5 text-sm font-medium">
                                <Icon className="h-3.5 w-3.5 text-[var(--text-link-strong)]" aria-hidden="true" />
                                {step.title}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-relaxed text-dim">{step.detail}</p>
                              <button
                                type="button"
                                onClick={action.onClick}
                                disabled={action.busy}
                                className={`mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-60 ${step.done ? 'border border-app text-muted hover:border-[var(--border-strong)]' : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]'}`}
                              >
                                {action.busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                                {action.label}
                                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          {step.done && <span className="sr-only">Completed</span>}
                        </li>
                      );
                    })}
                  </ol>

                  {booking && (
                    <div className="mt-3 rounded-2xl border border-dashed border-app px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11px] text-dim"><QrCode className="h-3 w-3" aria-hidden="true" /> Latest sample booking</p>
                      <p className="mt-0.5 font-mono text-xs">{booking.ref} · <span className="capitalize">{booking.status.replace('_', ' ')}</span></p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{booking.service_name} · {booking.business_name}</p>
                    </div>
                  )}

                  {error && <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>}
                </div>

                <div className="border-t border-app px-4 py-3">
                  <p className="text-[11px] leading-relaxed text-dim">
                    Honest by design: no payment is taken, no email or calendar event is sent, and the QR only verifies inside this demo tenant.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 rounded-lg border border-app px-2.5 py-1.5 text-[11px] font-medium hover:border-[var(--border-strong)]">
                      <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset sample data
                    </button>
                    <button type="button" onClick={isBusiness ? goSample : goConsole} className="inline-flex items-center gap-1.5 rounded-lg border border-app px-2.5 py-1.5 text-[11px] font-medium hover:border-[var(--border-strong)]">
                      {isBusiness ? <Compass className="h-3 w-3" aria-hidden="true" /> : <Store className="h-3 w-3" aria-hidden="true" />}
                      {isBusiness ? 'Customer app' : 'Business console'}
                    </button>
                    <span className="ml-auto self-center text-[10px] text-dim">{theme === 'dark' ? 'Dark' : 'Light'} · press G</span>
                  </div>
                  {profile?.email && <p className="mt-2 truncate text-[10px] text-dim">Signed in: {profile.email}</p>}
                  {!user && <p className="mt-2 text-[10px] text-dim">Not signed in — the guide will start the demo customer session for you.</p>}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
