import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, Lock, User, ShieldCheck, CalendarCheck, Sparkles, MapPin, ChevronLeft, Store, UserRound } from 'lucide-react';
import supabase from '../../lib/supabase';
import { signInWithGoogle } from '../../lib/googleAuth';
import { LogoMark } from '../../components/Logo';

type Role = 'customer' | 'admin';

export default function Welcome() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';

  const [role, setRole] = useState<Role | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const homeFor = (r: Role) => (r === 'admin' ? '/admin' : next);

  // Fast path: navigate immediately after auth — the guard + cached profile
  // handle final routing. No blocking DB round-trip here.
  const emailAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
        if (error) throw error;
        // Create the profile in the background — don't block navigation on it.
        if (data.user) {
          supabase.from('profiles').upsert({ id: data.user.id, email, full_name: name || email.split('@')[0], role: 'customer' }).then(() => {});
        }
        nav(next, { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav(homeFor(role || 'customer'), { replace: true });
      }
    } catch (e: any) { setErr(friendly(e.message)); setLoading(false); }
  };

  const demo = async () => {
    setLoading(true); setErr('');
    const em = role === 'admin' ? 'admin@velora.ai' : 'customer@velora.ai';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: 'velora123' });
      if (error) throw error;
      nav(homeFor(role || 'customer'), { replace: true });
    } catch (e: any) { setErr(friendly(e.message)); setLoading(false); }
  };

  /* ---------------- Role selection screen ---------------- */
  if (!role) {
    return (
      <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
        <div className="mesh" /><div className="absolute inset-0 grid-bg opacity-30" />
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md text-center">
          <div className="inline-flex items-center gap-2.5 mb-8">
            <LogoMark size={40} />
            <span className="font-semibold tracking-tight text-2xl">Velora</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">How would you like to continue?</h1>
          <p className="text-muted mt-2">Choose your experience — you can switch anytime.</p>

          <div className="mt-8 grid gap-4">
            <RoleCard onClick={() => setRole('customer')} icon={UserRound} title="I'm a Customer" sub="Discover and book appointments near you" tint="#6366f1" delay={0.05} />
            <RoleCard onClick={() => setRole('admin')} icon={Store} title="I'm a Business" sub="Manage bookings, staff, services & availability" tint="#10b981" delay={0.12} />
          </div>
          <button onClick={() => nav('/')} className="mt-6 text-sm text-dim hover:text-[var(--text)] underline">Browse without signing in</button>
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
        <div className="mesh" /><div className="absolute inset-0 grid-bg opacity-40" />
        <button onClick={() => nav('/')} className="relative flex items-center gap-2.5 w-fit">
          <LogoMark size={36} />
          <span className="font-semibold tracking-tight text-xl">Velora</span>
        </button>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 glass rounded-full px-3 py-1 text-xs mb-4" style={{ color: accent }}>
            {isAdmin ? <Store className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />} {isAdmin ? 'Business console' : 'Customer app'}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">{isAdmin ? <>Run your bookings<br /><span className="grad-text">effortlessly.</span></> : <>The smartest way<br />to <span className="grad-text">book anything.</span></>}</h1>
          <p className="mt-4 text-muted max-w-md">{isAdmin ? 'Real-time appointments, staff, services and availability — all in one beautiful console.' : 'Hospitals, salons, coaching, hotels, sports & more — instant confirmation, AI-recommended slots, and directions to the nearest options.'}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(isAdmin ? [['Live dashboard', CalendarCheck], ['Manage staff', User], ['Instant sync', Sparkles]] : [['Instant booking', CalendarCheck], ['Nearest first', MapPin], ['AI concierge', Sparkles]]).map(([t, Icon]: any) => (
              <span key={t} className="glass rounded-xl px-4 py-2 text-sm flex items-center gap-2"><Icon className="h-4 w-4 text-emerald-400" /> {t}</span>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-dim">Secure sign-in · Google · Email</p>
      </div>

      {/* Auth side */}
      <div className="flex items-center justify-center p-6 sm:p-12 relative">
        <div className="mesh lg:hidden" />
        <motion.div key={role} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm relative">
          <button onClick={() => { setRole(null); setErr(''); }} className="mb-6 inline-flex items-center gap-1.5 text-sm text-dim hover:text-[var(--text)]"><ChevronLeft className="h-4 w-4" /> Change role</button>

          <div className="flex items-center gap-2 mb-1">
            <span className="h-8 w-8 rounded-xl grid place-items-center" style={{ background: `${accent}22` }}>{isAdmin ? <Store className="h-4 w-4" style={{ color: accent }} /> : <UserRound className="h-4 w-4" style={{ color: accent }} />}</span>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: accent }}>{isAdmin ? 'Business' : 'Customer'}</span>
          </div>
          <h2 className="text-2xl font-semibold">{isSignUp ? 'Create your account' : 'Welcome back'}</h2>
          <p className="text-sm text-dim mt-1">{isSignUp ? 'Join Velora in seconds.' : `Sign in to your ${isAdmin ? 'business console' : 'account'}.`}</p>

          {!isAdmin && (
            <>
              <button onClick={() => signInWithGoogle('Velora')} className="mt-6 w-full rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2.5 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.42 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"/></svg>
                Continue with Google
              </button>
              <div className="my-4 flex items-center gap-3 text-xs text-dim"><div className="flex-1 h-px bg-[var(--border)]" />or<div className="flex-1 h-px bg-[var(--border)]" /></div>
            </>
          )}

          <form onSubmit={emailAuth} className={`${isAdmin ? 'mt-6' : ''} space-y-3`}>
            {isSignUp && !isAdmin && <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={name} onChange={e => setName(e.target.value)} required placeholder="Full name" className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none focus:border-[var(--color-brand-indigo)]" /></div>}
            <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={email} onChange={e => setEmail(e.target.value)} type="email" required placeholder={isAdmin ? 'business@email.com' : 'you@email.com'} className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none focus:border-[var(--color-brand-indigo)]" /></div>
            <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" /><input value={password} onChange={e => setPassword(e.target.value)} type="password" required placeholder="Password" className="w-full rounded-xl bg-elev border border-app pl-10 pr-4 py-3 text-sm outline-none focus:border-[var(--color-brand-indigo)]" /></div>
            {err && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-red-400">{err}</motion.p>}
            <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{isSignUp ? 'Create account' : 'Sign in'} <ArrowRight className="h-4 w-4" /></>}</button>
          </form>

          <div className="mt-6 rounded-xl border border-app p-3">
            <p className="text-xs text-dim mb-2">Explore instantly with a demo {isAdmin ? 'business' : 'account'}</p>
            <button onClick={demo} disabled={loading} className="w-full text-xs rounded-lg bg-surface hover:bg-[var(--surface-hover)] py-2.5 font-medium flex items-center justify-center gap-1.5">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" /> Continue as demo {isAdmin ? 'business' : 'customer'}</>}</button>
          </div>

          {!isAdmin && <p className="mt-4 text-center text-sm text-dim">{isSignUp ? 'Already have an account?' : "New to Velora?"} <button onClick={() => { setIsSignUp(!isSignUp); setErr(''); }} className="text-[var(--color-brand-indigo)] font-medium">{isSignUp ? 'Sign in' : 'Create account'}</button></p>}
          <p className="mt-3 text-center text-xs text-dim">You can also <button onClick={() => nav('/')} className="underline hover:text-[var(--text)]">browse without signing in</button>.</p>
        </motion.div>
      </div>
    </div>
  );
}

function RoleCard({ onClick, icon: Icon, title, sub, tint, delay }: any) {
  return (
    <motion.button onClick={onClick} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} whileHover={{ y: -3, scale: 1.01 }} whileTap={{ scale: 0.98 }}
      className="group card p-5 flex items-center gap-4 text-left transition-colors hover:border-[var(--border-strong)]">
      <div className="h-14 w-14 rounded-2xl grid place-items-center shrink-0" style={{ background: `${tint}1f` }}><Icon className="h-6 w-6" style={{ color: tint }} /></div>
      <div className="flex-1 min-w-0"><p className="font-semibold">{title}</p><p className="text-sm text-dim">{sub}</p></div>
      <div className="h-8 w-8 rounded-full border border-app grid place-items-center text-dim group-hover:text-white group-hover:border-transparent transition-all" style={{ background: 'transparent' }}><ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" /></div>
    </motion.button>
  );
}

function friendly(msg: string) {
  if (/invalid login/i.test(msg)) return 'Incorrect email or password.';
  if (/already registered/i.test(msg)) return 'That email is already registered — try signing in.';
  return msg;
}
