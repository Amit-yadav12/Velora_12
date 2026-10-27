import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, Lock, User, ShieldCheck, CalendarCheck, Sparkles, MapPin, ChevronLeft, Store, UserRound, Building2, KeyRound } from 'lucide-react';
import supabase, { isDemoMode } from '../../lib/supabase';
import { LogoMark } from '../../components/Logo';
import { inputCls } from '../../components/ui';
import { signInDemo } from '../../lib/demoAuth';
import { useAuth } from '../../contexts/AuthContext';
import type { LucideIcon } from 'lucide-react';
import { errMsg } from '../../lib/types';

type Role = 'customer' | 'admin';
type Mode = 'choose' | 'signin' | 'register' | 'bizreg';

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
  const switchMode = (m: Mode, revealEmail = false) => { resetMsgs(); setMode(m); setEmailOpen(revealEmail); };

  /* ---------------- Email auth (sign in / create account) ---------------- */
  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    setLoading(true);
    try {
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
    if (!email) { setErr('Enter your email above first, then tap reset.'); return; }
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

  const googleSignIn = async () => {
    if (isDemoMode) return;
    resetMsgs(); setLoading(true);
    try {
      const destination = role === 'admin' ? '/onboard' : next;
      const redirectTo = `${window.location.origin}/welcome?role=${role === 'admin' ? 'business' : 'customer'}&next=${encodeURIComponent(destination)}`;
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
      if (error) throw error;
    } catch (e: unknown) { setErr(friendly(errMsg(e)) || 'Google sign-in is unavailable.'); setLoading(false); }
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
    if (!name.trim() || !email.includes('@') || password.length < 6) { setErr('Enter your name, email and a password of at least 6 characters.'); return; }
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

  /* ---------------- Role selection screen ---------------- */
  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
        <div className="mesh" />
        <div className="absolute inset-0 grid-bg opacity-30" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2.5 mb-8">
            <LogoMark size={40} />
            <span className="font-semibold tracking-tight text-2xl">Velora</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">How would you like to continue?</h1>
          <p className="text-muted mt-2">Choose your experience — you can switch anytime.</p>

          <div className="mt-8 grid gap-4">
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
        <motion.div key={role + mode} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative">
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
              <h2 className="text-2xl font-semibold">Create your business account</h2>
              <p className="text-sm text-dim mt-1">Start with your owner account, then build your business profile.</p>
              <form onSubmit={createBusinessAccount} className="mt-6 space-y-3">
                <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="Owner name" className={inputCls} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="email" placeholder="business@email.com" className={inputCls} />
                <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} autoComplete="new-password" placeholder="Password (min 6 characters)" className={inputCls} />
                {err && <p role="alert" className="text-sm text-red-400">{err}</p>}
                {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account & continue <ArrowRight className="h-4 w-4" /></>}</button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
              <p className="text-sm text-dim mt-1">
                {mode === 'register' ? 'Join Velora in seconds.' : `Sign in to your ${isAdmin ? 'business console' : 'account'}.`}
              </p>

              {/* Supabase OAuth requires a configured and enabled Google provider. */}
              <button
                type="button"
                disabled={isDemoMode || loading}
                onClick={googleSignIn}
                title={isDemoMode ? 'Connect Supabase to enable Google sign-in' : 'Continue with Google'}
                className="mt-6 w-full rounded-xl border border-app bg-[var(--surface)] py-3 text-sm font-semibold flex items-center justify-center gap-2.5 transition-all duration-200 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--color-brand-indigo)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-indigo)]"
              >
                <GoogleLogo /> Continue with Google
              </button>

              {err && !emailOpen && <p role="alert" className="text-sm text-red-400 mt-3">{err}</p>}
              <div className="my-4 flex items-center gap-3 text-xs text-dim">
                <div className="flex-1 h-px bg-[var(--border)]" />
                or
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>

              {/* Secondary: email (hollow) — reveals the email form */}
              {mode === 'signin' && !emailOpen && (
                <button
                  onClick={() => setEmailOpen(true)}
                  disabled={loading}
                  className="w-full rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <Mail className="h-4 w-4" /> Continue with Email
                </button>
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
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder={isAdmin ? 'business@email.com' : 'you@email.com'} className={inputCls + ' pl-10'} />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Password" className={inputCls + ' pl-10'} />
                  </div>
                  {err && <p className="text-sm text-red-400">{err}</p>}
                  {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                  <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" onClick={forgotPassword} className="text-dim hover:text-[var(--text)] inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> Reset password</button>
                    {!isAdmin && (
                      <button type="button" onClick={() => switchMode('register', true)} className="text-[var(--color-brand-indigo)] font-medium">Create account</button>
                    )}
                  </div>
                </form>
              )}

              {mode === 'register' && (
                <form onSubmit={emailAuth} className="mt-5 space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Full name" className={inputCls + ' pl-10'} />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@email.com" className={inputCls + ' pl-10'} />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} placeholder="Password (min 6 characters)" className={inputCls + ' pl-10'} />
                  </div>
                  {err && <p className="text-sm text-red-400">{err}</p>}
                  {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                  <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Create account <ArrowRight className="h-4 w-4" /></>}
                  </button>
                  <p className="text-center text-xs text-dim">Already have an account? <button type="button" onClick={() => switchMode('signin', true)} className="text-[var(--color-brand-indigo)] font-medium">Sign in</button></p>
                </form>
              )}

              {/* Demo — clearly styled, honest about what it is */}
              {isDemoMode && <div className="mt-6 rounded-xl border border-dashed border-app p-3">
                <p className="text-xs text-dim mb-2">Explore the full working demo — {isAdmin ? 'business console' : 'customer app'} with sample data stored on this device.</p>
                <button onClick={demo} disabled={loading} className="w-full text-xs rounded-lg border border-app hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" /> Continue as demo {isAdmin ? 'business' : 'customer'}</>}
                </button>

              </div>}

              {!isAdmin && (
                <p className="mt-4 text-center text-sm text-dim">
                  Have a business? <button onClick={() => { setRole('admin'); switchMode('bizreg'); }} className="text-[var(--color-brand-indigo)] font-medium">Create a business account</button>
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
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -3, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
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
