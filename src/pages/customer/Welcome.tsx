import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, Lock, User, ShieldCheck, CalendarCheck, Sparkles, MapPin, ChevronLeft, Store, UserRound, Building2, KeyRound, Phone, RotateCw } from 'lucide-react';
import supabase, { isDemoMode } from '../../lib/supabase';
import { LogoMark } from '../../components/Logo';
import { inputCls } from '../../components/ui';
import { signInDemo, isCanonicalDemoCredential } from '../../lib/demoAuth';
import { useAuth } from '../../contexts/AuthContext';
import type { LucideIcon } from 'lucide-react';
import { errMsg } from '../../lib/types';
import { isValidIndianPhone, normalizeIndianPhone } from '../../lib/india';
import { openDemoGuide } from '../../lib/demoGuideStore';
import { useLocation as useLocationContext } from '../../contexts/LocationContext';
import { DEMO_SAMPLE_BUSINESS_ID } from '../../lib/demoJourney';
import { istTomorrow } from '../../lib/format';

type Role = 'customer' | 'admin';
type Mode = 'choose' | 'signin' | 'register' | 'bizreg';
type AuthPath = 'email' | 'phone';

const GoogleLogo = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
    <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.42 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" />
  </svg>
);

export default function Welcome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const requestedNext = params.get('next') || '/';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/';
  const { user, profile, loading: authLoading, refresh } = useAuth();
  const { setCity } = useLocationContext();
  const reduceMotion = useReducedMotion();

  // ?role=business preselects the business console path (?role=customer the
  // customer path) — used by the one-click business demo fallback.
  const preselected: Role | null =
    params.get('role') === 'business' ? 'admin' : params.get('role') === 'customer' ? 'customer' : null;

  const [role, setRole] = useState<Role | null>(preselected);
  const [mode, setMode] = useState<Mode>('signin');
  const [emailOpen, setEmailOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [authPath, setAuthPath] = useState<AuthPath | null>(null);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [demoOtp, setDemoOtp] = useState('');
  const [demoOtpExpiresAt, setDemoOtpExpiresAt] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  // Deployment-facing notice when the business demo cannot be granted console
  // access (missing schema / missing credentials / rotated key). While it is
  // set we stay on this page and say why, instead of silently bouncing the
  // operator into the customer app.
  const [loading, setLoading] = useState(false);

  // Landing back here with a live session (e.g. an OAuth redirect) means we
  // should continue to the right home instead of showing the role picker.
  // Runs only on a fully settled state — never mid-load, never while an auth
  // action is in flight — so it can't race the demo sign-in or double-fire.
  useEffect(() => {
    if (!authLoading && user && profile && !loading) {
      nav(profile.role === 'admin' ? '/admin' : role === 'admin' ? '/onboard' : next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, profile, loading, next]);

  const homeFor = (r: Role) => (r === 'admin' ? '/admin' : next);
  const resetMsgs = () => { setErr(''); setInfo(''); };
  const switchMode = (m: Mode, revealEmail = false) => { resetMsgs(); setMode(m); setEmailOpen(revealEmail); setAuthPath(null); };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  const phoneIsValid = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    // Reject trunk prefixes and leading 0/1 rather than silently normalizing them away.
    return /^[6-9]\d{9}$/.test(national) && isValidIndianPhone(value);
  };

  const requestPhoneOtp = async () => {
    resetMsgs();
    if (!phoneIsValid(phone)) { setErr('Enter a valid Indian mobile number: 10 digits starting with 6–9, optionally prefixed by +91.'); return; }
    setLoading(true);
    setOtp('');
    try {
      const e164 = `+91${normalizeIndianPhone(phone)}`;
      if (isDemoMode) {
        const values = new Uint32Array(1);
        if (window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
        else values[0] = Math.floor(Math.random() * 1_000_000);
        setDemoOtp(String(values[0] % 1_000_000).padStart(6, '0'));
        setDemoOtpExpiresAt(Date.now() + 5 * 60 * 1000);
      } else {
        const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
        if (error) throw error;
        setDemoOtp('');
        setDemoOtpExpiresAt(0);
        setInfo('OTP request accepted by Supabase. Check your messages; delivery depends on your SMS provider.');
      }
      setOtpRequested(true);
      setResendCooldown(30);
    } catch (e: unknown) {
      setErr(friendly(errMsg(e)) || 'The SMS provider did not accept the OTP request.');
    } finally { setLoading(false); }
  };

  const verifyPhoneOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    resetMsgs();
    if (!/^\d{6}$/.test(otp)) { setErr('Enter the 6-digit verification code.'); return; }
    setLoading(true);
    try {
      if (isDemoMode) {
        if (Date.now() >= demoOtpExpiresAt) throw new Error('That demo code has expired. Request a new code and try again.');
        if (!demoOtp || otp !== demoOtp) throw new Error('That demo code is incorrect. Request a new code and try again.');
        await signInDemo('customer');
      } else {
        const e164 = `+91${normalizeIndianPhone(phone)}`;
        const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'sms' });
        if (error) throw error;
      }
      await refresh();
      nav(next, { replace: true });
    } catch (e: unknown) {
      // Do not leave a stale/partial session after a failed code attempt.
      try { await supabase.auth.signOut(); } catch { /* preserve the verification error */ }
      await refresh();
      setErr(friendly(errMsg(e)) || 'The code could not be verified. Request a new code and try again.');
      setLoading(false);
    }
  };

  /* ---------------- Email auth (sign in / create account) ---------------- */
  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    if (mode === 'register' && !name.trim()) { setErr('Enter your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address.'); return; }
    if (!password || (mode === 'register' && password.length < 6)) { setErr(mode === 'register' ? 'Password must be at least 6 characters.' : 'Enter your password.'); return; }
    setLoading(true);
    try {
      if (mode === 'signin' && !isDemoMode && isCanonicalDemoCredential(email, password)) {
        throw new Error('Demo credentials are available only in offline sample mode. Use an account registered with this project.');
      }
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name } },
        });
        if (error) throw error;
        if (!data.session && data.user) {
          if (!isDemoMode) {
            setInfo('Account created! Check your email to confirm, then sign in.');
            setLoading(false);
            return;
          }
        }
        if (data.user) {
          supabase.from('profiles').upsert({ id: data.user.id, email, full_name: name || email.split('@')[0], role: 'customer' }).then(() => {}, () => {});
        }
        await refresh();
        nav(role === 'admin' ? '/onboard' : next, { replace: true });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await refresh();
        const { data: signedProfile } = await supabase.from('profiles').select('role').eq('id', data.user?.id).maybeSingle();
        nav(signedProfile?.role === 'admin' ? '/admin' : role === 'admin' ? '/onboard' : next, { replace: true });
      }
    } catch (e: unknown) {
      setErr(friendly(errMsg(e)));
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setErr('Enter a valid email address before requesting a reset.'); return; }
    resetMsgs(); setLoading(true);
    try {
      // Demo mode has no mail infrastructure — never claim a link was sent.
      if (isDemoMode) {
        setInfo('Demo mode: no real email is sent. The demo password is velora123 — sign in with it directly.');
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/welcome` });
      if (error) throw error;
      setInfo(`Reset link sent to ${email}. Check your inbox (and spam).`);
    } catch (e: unknown) {
      setErr(friendly(errMsg(e)));
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Demo accounts ---------------- */
  const demo = async () => {
    setLoading(true); resetMsgs();
    const target = role || 'customer';
    try {
      await signInDemo(target, (p) => setInfo(p.message));
      // Re-read session + profile from the live session BEFORE navigating so
      // the target gate (AdminGate) already sees user + role=admin — this is
      // what makes the business demo land directly on the console.
      await refresh();
      nav(homeFor(target), { replace: true });
    } catch (e: unknown) {
      setErr(friendly(errMsg(e)));
      setLoading(false);
    }
  };

  /* Account creation happens first; the full business is saved only in the launch flow. */
  const createBusinessAccount = async (e: React.FormEvent) => {
    e.preventDefault(); resetMsgs();
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 6) { setErr('Enter your name, a valid email, and a password of at least 6 characters.'); return; }
    setLoading(true);
    try {
      const redirect = `${window.location.origin}/welcome?role=business&next=${encodeURIComponent('/onboard')}`;
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirect } });
      if (error) throw error;
      if (!data.session && !isDemoMode) {
        setInfo('Account created. Confirm your email, then sign in to finish your business profile.');
        setLoading(false); return;
      }
      await refresh();
      nav('/onboard', { replace: true });
    } catch (e: unknown) { setErr(friendly(errMsg(e)) || 'Could not create the account.'); setLoading(false); }
  };

  /**
   * Presenter fast path: sign in as the demo customer and open the Jaipur sample
   * business on tomorrow's date, with the booking panel in view. Nothing here
   * bypasses the product flow — it only saves navigation clicks.
   */
  const startJourney = async () => {
    setLoading(true); resetMsgs();
    try {
      setCity('Jaipur');
      await signInDemo('customer', (p) => setInfo(p.message));
      await refresh();
      const tomorrow = istTomorrow();
      nav(`/business/${DEMO_SAMPLE_BUSINESS_ID}?date=${tomorrow}&focus=booking`, { replace: true });
    } catch (e: unknown) {
      setErr(friendly(errMsg(e)) || 'The demo session could not be started.');
      setLoading(false);
    }
  };

  /* ---------------- Role selection screen ---------------- */
  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
        <div className="mesh" />
        <div className="absolute inset-0 grid-bg opacity-30" />
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="relative w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2.5 mb-8">
            <LogoMark size={40} />
            <span className="font-semibold tracking-tight text-2xl">Velora</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">How would you like to continue?</h1>
          <p className="text-muted mt-2">Choose your experience — you can switch anytime.</p>
          <button type="button" disabled aria-disabled="true" tabIndex={-1} className="mt-6 w-full min-h-11 rounded-xl border border-app bg-[var(--surface)] py-3 text-sm font-semibold flex items-center justify-center gap-2.5 opacity-70 cursor-not-allowed">
            <GoogleLogo /> Continue with Google
          </button>
          <p className="mt-2 text-xs text-dim">Google sign-in isn&apos;t connected in this build.</p>
          <p className="mt-2 text-xs text-dim">Sample mode: demo customer, demo business and demo OTP work offline. Google needs OAuth; SMS and email need providers.</p>

          {/* Fast path for a presenter: one click starts the exact demo journey
              (Jaipur sample business → slot → QR ticket) as the demo customer. */}
          {isDemoMode && (
            <div className="mt-6 rounded-2xl border border-[var(--color-brand-violet)]/30 bg-[var(--color-brand-violet)]/[0.08] p-4 text-left">
              <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--text-link-strong)]">Judge demo · about 3 minutes</p>
              <p className="mt-1 text-sm font-medium">One booking, both sides of Velora</p>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                Starts as the demo customer in Jaipur, on a clearly-marked sample salon. Sample data only — no payment or email is sent.
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={startJourney}
                data-demo-cta="start-journey"
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-brand-violet)]/20 px-4 py-2.5 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--color-brand-violet)]/40 hover:bg-[var(--color-brand-violet)]/30 disabled:opacity-60"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting demo…</> : <>Start the demo journey <ArrowRight className="h-4 w-4" /></>}
              </button>
              <button type="button" onClick={openDemoGuide} className="mt-2 text-[11px] font-medium text-[var(--text-link-strong)] underline underline-offset-2">
                See all five demo steps
              </button>
            </div>
          )}

          <div className="mt-6 grid gap-4">
            <RoleCard onClick={() => { setRole('customer'); setMode('signin'); }} icon={UserRound} title="I'm a Customer" sub="Discover and book appointments near you" tint="#6366f1" delay={0.05} />
            <RoleCard onClick={() => { setRole('admin'); setMode('signin'); }} icon={Store} title="I'm a Business" sub="Manage bookings, staff, services & availability" tint="#10b981" delay={0.12} />
          </div>
          <button onClick={() => nav('/')} className="mt-6 text-sm text-dim hover:text-[var(--text)] underline">
            Browse without signing in
          </button>
        </motion.div>
      </div>
    );
  }

  const isAdmin = role === 'admin';
  const accent = isAdmin ? '#10b981' : '#6366f1';

  /* ---------------- Auth screen ---------------- */
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand side */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden">
        <div className="mesh" />
        <div className="absolute inset-0 grid-bg opacity-40" />
        <button onClick={() => nav('/')} className="relative flex items-center gap-2.5 w-fit">
          <LogoMark size={36} />
          <span className="font-semibold tracking-tight text-xl">Velora</span>
        </button>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 glass rounded-full px-3 py-1 text-xs mb-4" style={{ color: accent }}>
            {isAdmin ? <Store className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />} {isAdmin ? 'Business console' : 'Customer app'}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            {isAdmin ? (
              <>Run your bookings<br /><span className="grad-text">effortlessly.</span></>
            ) : (
              <>The smartest way<br />to <span className="grad-text">book anything.</span></>
            )}
          </h1>
          <p className="mt-4 text-muted max-w-md">
            {isAdmin
              ? 'Real-time appointments, staff, services and availability — all in one beautiful console.'
              : 'Hospitals, salons, coaching, hotels, sports & more — instant confirmation, smart slot suggestions, and directions to the nearest options.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(isAdmin
              ? [['Live dashboard', CalendarCheck], ['Manage staff', User], ['Instant sync', Sparkles]]
              : [['Instant booking', CalendarCheck], ['Nearest first', MapPin], ['Concierge', Sparkles]]
            ).map(([t, Icon]: (string | LucideIcon)[]) => {
              const I = Icon as LucideIcon;
              return (
                <span key={t as string} className="glass rounded-xl px-4 py-2 text-sm flex items-center gap-2">
                  <I className="h-4 w-4 text-emerald-400" /> {t as string}
                </span>
              );
            })}
          </div>
        </div>
        <p className="relative text-xs text-dim">Secure sign-in · Google · Email</p>
      </div>

      {/* Auth side */}
      <div className="flex items-center justify-center p-6 sm:p-12 relative">
        <div className="mesh lg:hidden" />
        <motion.div key={role + mode} initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="w-full max-w-sm relative">
          <button
            onClick={() => {
              if (mode === 'bizreg') { switchMode('signin'); }
              else if (mode === 'register' || emailOpen) { switchMode('signin'); }
              else { setRole(null); resetMsgs(); }
            }}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-dim hover:text-[var(--text)]"
          >
            <ChevronLeft className="h-4 w-4" /> {mode !== 'signin' ? 'All sign-in options' : 'Change role'}
          </button>

          <div className="flex items-center gap-2 mb-1">
            <span className="h-8 w-8 rounded-xl grid place-items-center" style={{ background: `${accent}22` }}>
              {isAdmin ? <Store className="h-4 w-4" style={{ color: accent }} /> : <UserRound className="h-4 w-4" style={{ color: accent }} />}
            </span>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: accent }}>
              {isAdmin ? 'Business' : 'Customer'}
            </span>
          </div>

          {mode === 'bizreg' ? (
            <>
              <button type="button" disabled aria-disabled="true" tabIndex={-1} title="Google sign-in isn't connected in this build." className="mt-2 w-full min-h-11 rounded-xl border border-app bg-[var(--surface)] py-3 text-sm font-semibold flex items-center justify-center gap-2.5 opacity-70 cursor-not-allowed"><GoogleLogo /> Continue with Google</button>
              <p className="mt-2 text-center text-xs text-dim">Google sign-in isn&apos;t connected in this build.</p>
              <p className="mt-2 text-center text-xs text-dim">Sample mode: demo customer, demo business and demo OTP work offline. Google needs OAuth; SMS and email need providers.</p>
              <h2 className="mt-4 text-2xl font-semibold">Create your business account</h2>
              <p className="text-sm text-dim mt-1">Start with your owner account, then build your business profile.</p>
              <form onSubmit={createBusinessAccount} className="mt-6 space-y-3">
                <label htmlFor="owner-name" className="sr-only">Owner name</label>
                <input id="owner-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Owner name" aria-invalid={!!err} aria-describedby={err ? 'business-auth-error' : undefined} className={inputCls + ' min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                <label htmlFor="business-email" className="sr-only">Business email address</label>
                <input id="business-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="business@email.com" aria-invalid={!!err} aria-describedby={err ? 'business-auth-error' : undefined} className={inputCls + ' min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                <label htmlFor="business-password" className="sr-only">Password</label>
                <input id="business-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} autoComplete="new-password" placeholder="Password (min 6 characters)" aria-invalid={!!err} aria-describedby={err ? 'business-auth-error' : undefined} className={inputCls + ' min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                {err && <p id="business-auth-error" role="alert" className="text-sm text-red-400">{err}</p>}
                {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                <button disabled={loading} className="w-full min-h-11 grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account & continue <ArrowRight className="h-4 w-4" /></>}</button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
              <p className="text-sm text-dim mt-1">
                {mode === 'register' ? 'Join Velora in seconds.' : `Sign in to your ${isAdmin ? 'business console' : 'account'}.`}
              </p>

              <button
                type="button"
                disabled
                aria-disabled="true"
                tabIndex={-1}
                title="Google sign-in isn't connected in this build."
                className="mt-6 w-full min-h-11 rounded-xl border border-app bg-[var(--surface)] py-3 text-sm font-semibold flex items-center justify-center gap-2.5 opacity-70 cursor-not-allowed"
              >
                <GoogleLogo /> Continue with Google
              </button>
              <p className="mt-2 text-center text-xs text-dim">Google sign-in isn&apos;t connected in this build.</p>
              <p className="mt-2 text-center text-xs text-dim">Sample mode: demo customer, demo business and demo OTP work offline. Google needs OAuth; SMS and email need providers.</p>

              {err && !emailOpen && <p role="alert" className="text-sm text-red-400 mt-3">{err}</p>}
              <div className="my-4 flex items-center gap-3 text-xs text-dim">
                <div className="flex-1 h-px bg-[var(--border)]" />
                Choose a sign-in path
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {mode === 'signin' && !emailOpen && authPath !== 'phone' && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => { resetMsgs(); setEmailOpen(true); setAuthPath('email'); }}
                    disabled={loading}
                    className="min-h-11 rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]"
                  >
                    <Mail className="h-4 w-4 shrink-0" /> Continue with Email
                  </button>
                  <button
                    onClick={() => { resetMsgs(); setAuthPath('phone'); }}
                    disabled={loading}
                    className="min-h-11 rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]"
                  >
                    <Phone className="h-4 w-4 shrink-0" /> Continue with Phone
                  </button>
                </div>
              )}

              {/* Secondary: create business account (hollow, business role) */}
              {isAdmin && (
                <button
                  onClick={() => switchMode('bizreg')}
                  disabled={loading}
                  className="mt-2.5 w-full rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <Building2 className="h-4 w-4" /> Create Business Account
                </button>
              )}

              {/* Email form (revealed by the hollow button) */}
              {mode === 'signin' && emailOpen && (
                <form onSubmit={emailAuth} className="mt-5 space-y-3">
                  <div className="relative">
                    <label htmlFor="signin-email" className="sr-only">Email address</label>
                    <Mail aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input id="signin-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required aria-invalid={!!err} aria-describedby={err ? 'email-auth-error' : undefined} placeholder={isAdmin ? 'business@email.com' : 'you@email.com'} className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                  </div>
                  <div className="relative">
                    <label htmlFor="signin-password" className="sr-only">Password</label>
                    <Lock aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input id="signin-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required aria-invalid={!!err} aria-describedby={err ? 'email-auth-error' : undefined} placeholder="Password" className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                  </div>
                  {err && <p id="email-auth-error" role="alert" className="text-sm text-red-400">{err}</p>}
                  {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                  <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" onClick={forgotPassword} className="text-dim hover:text-[var(--text)] inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Reset password</button>
                    {!isAdmin && (
                      <button type="button" onClick={() => switchMode('register', true)} className="text-[var(--text-link-strong)] font-medium">Create account</button>
                    )}
                  </div>
                </form>
              )}

              {mode === 'signin' && authPath === 'phone' && (
                <section aria-labelledby="phone-login-heading" className="mt-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 id="phone-login-heading" className="text-sm font-semibold">Phone verification</h3>
                    <button type="button" onClick={() => { resetMsgs(); setAuthPath(null); setOtpRequested(false); setDemoOtp(''); }} className="min-h-11 px-2 text-xs text-[var(--text-link-strong)]">Other sign-in options</button>
                  </div>
                  {!otpRequested ? (
                    <form onSubmit={(event) => { event.preventDefault(); void requestPhoneOtp(); }} className="space-y-3">
                      <label htmlFor="phone-number" className="block text-xs text-dim">Indian mobile number</label>
                      <div className="relative">
                        <Phone aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                        <input id="phone-number" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="98765 43210 or +91 98765 43210" aria-invalid={!!err} aria-describedby={err ? 'phone-auth-error' : 'phone-format-help'} className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                      </div>
                      <p id="phone-format-help" className="text-xs text-dim">10 digits starting 6–9; +91 is added for provider verification.</p>
                      {err && <p id="phone-auth-error" role="alert" className="text-sm text-red-400">{err}</p>}
                      <button type="submit" disabled={loading} className="w-full min-h-11 grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Phone className="h-4 w-4" /> Request code</>}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={(event) => { void verifyPhoneOtp(event); }} className="space-y-3">
                      {demoOtp && <p role="status" className="rounded-xl border-2 border-amber-400 bg-amber-500/15 p-3 text-sm font-semibold text-amber-200">Demo mode — no SMS is sent. Your code is <span className="font-mono text-lg tracking-widest">{demoOtp}</span>.</p>}
                      {!demoOtp && info && <p role="status" className="rounded-xl border border-sky-400/30 bg-sky-500/10 p-3 text-sm text-sky-100">{info}</p>}
                      <label htmlFor="phone-otp" className="block text-xs text-dim">6-digit verification code</label>
                      <input id="phone-otp" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6-digit code" aria-invalid={!!err} aria-describedby={err ? 'otp-auth-error' : undefined} className={inputCls + ' min-h-11 tracking-[0.3em] focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                      {err && <p id="otp-auth-error" role="alert" aria-live="polite" className="text-sm text-red-400">{err}</p>}
                      <button type="submit" disabled={loading || otp.length !== 6} className="w-full min-h-11 grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify code <ArrowRight className="h-4 w-4" /></>}
                      </button>
                      <button type="button" disabled={loading || resendCooldown > 0} onClick={() => void requestPhoneOtp()} className="w-full min-h-11 rounded-xl border border-app py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                        <RotateCw className="h-4 w-4" /> {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                      </button>
                    </form>
                  )}
                </section>
              )}

              {mode === 'register' && (
                <form onSubmit={emailAuth} className="mt-5 space-y-3">
                  <div className="relative">
                    <label htmlFor="register-name" className="sr-only">Full name</label>
                    <User aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input id="register-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" aria-invalid={!!err} aria-describedby={err ? 'register-auth-error' : undefined} placeholder="Full name" className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                  </div>
                  <div className="relative">
                    <label htmlFor="register-email" className="sr-only">Email address</label>
                    <Mail aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input id="register-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required aria-invalid={!!err} aria-describedby={err ? 'register-auth-error' : undefined} placeholder="you@email.com" className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                  </div>
                  <div className="relative">
                    <label htmlFor="register-password" className="sr-only">Password</label>
                    <Lock aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input id="register-password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="new-password" required minLength={6} aria-invalid={!!err} aria-describedby={err ? 'register-auth-error' : undefined} placeholder="Password (min 6 characters)" className={inputCls + ' pl-10 min-h-11 focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]'} />
                  </div>
                  {err && <p id="register-auth-error" role="alert" className="text-sm text-red-400">{err}</p>}
                  {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                  <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="text-center text-xs text-dim">Already have an account? <button type="button" onClick={() => switchMode('signin', true)} className="text-[var(--text-link-strong)] font-medium">Sign in</button></p>
                </form>
              )}

              {/* Demo — clearly styled, honest about what it is */}
              {isDemoMode && <div className="mt-6 rounded-xl border border-dashed border-app p-3">
                <p className="text-xs text-dim mb-2">Explore the full working demo — {isAdmin ? 'business console' : 'customer app'} with sample data stored on this device.</p>
                <button onClick={demo} disabled={loading} className="w-full min-h-11 text-xs rounded-lg border border-app hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" /> Continue as demo {isAdmin ? 'business' : 'customer'}</>}
                </button>

              </div>}

              {!isAdmin && (
                <p className="mt-4 text-center text-sm text-dim">
                  Have a business? <button onClick={() => { setRole('admin'); switchMode('bizreg'); }} className="text-[var(--text-link-strong)] font-medium">Create a business account</button>
                </p>
              )}
            </>
          )}
          <p className="mt-3 text-center text-xs text-dim">
            You can also <button onClick={() => nav('/')} className="underline hover:text-[var(--text)]">browse without signing in</button>.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function RoleCard({ onClick, icon: Icon, title, sub, tint, delay }: { onClick: () => void; icon: LucideIcon; title: string; sub: string; tint: string; delay: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.2 }}
      whileHover={reduceMotion ? undefined : { y: -3, scale: 1.01 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      className="group card p-5 flex items-center gap-4 text-left transition-colors hover:border-[var(--border-strong)]"
    >
      <div className="h-14 w-14 rounded-2xl grid place-items-center shrink-0" style={{ background: `${tint}1f` }}>
        <Icon className="h-6 w-6" style={{ color: tint }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-dim">{sub}</p>
      </div>
      <div className="h-8 w-8 rounded-full border border-app grid place-items-center text-dim group-hover:text-white group-hover:border-transparent transition-all" style={{ background: 'transparent' }}>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </motion.button>
  );
}

function friendly(msg: string) {
  if (!msg) return '';
  if (/invalid login/i.test(msg)) return 'Incorrect email or password.';
  if (/already registered/i.test(msg)) return 'That email is already registered — try signing in.';
  if (/email.*confirm/i.test(msg)) return 'Check your email to confirm your account, or turn OFF confirm-email in Supabase Auth settings.';
  if (/too many requests|rate limit/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/provider.*(not.*enabled|is not enabled)/i.test(msg)) return 'Google sign-in is not enabled on this deployment yet — continue with email or the demo below.';
  if (/at least 6/i.test(msg)) return 'Password must be at least 6 characters.';
  return msg;
}
