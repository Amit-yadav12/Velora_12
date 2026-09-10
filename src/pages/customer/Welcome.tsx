import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Mail, Lock, User, ShieldCheck, CalendarCheck, Sparkles, MapPin, ChevronLeft, Store, UserRound, Building2, KeyRound } from 'lucide-react';
import supabase, { isDemoMode } from '../../lib/supabase';
import { signInWithGoogleNative } from '../../lib/googleAuth';
import { LogoMark } from '../../components/Logo';
import { CATEGORIES } from '../../lib/product';
import { CITIES } from '../../lib/cities';
import { saveDemoBusiness } from '../../lib/demoStore';
import { apiSend } from '../../lib/api';
import { toast } from '../../services/events';
import { inputCls } from '../../components/ui';

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
  const next = params.get('next') || '/';

  const [role, setRole] = useState<Role | null>(null);
  const [mode, setMode] = useState<Mode>('signin');
  const [emailOpen, setEmailOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Business registration (2 steps)
  const [bizStep, setBizStep] = useState<1 | 2>(1);
  const [biz, setBiz] = useState({ name: '', category: 'Salons', description: '', area: '', city: 'Jaipur', phone: '', open_time: '09:00', close_time: '20:00' });
  const [svc, setSvc] = useState({ name: '', duration_min: 45, price: 500 });

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
        nav(next, { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav(homeFor(role || 'customer'), { replace: true });
      }
    } catch (e: any) {
      setErr(friendly(e.message));
      setLoading(false);
    }
  };

  const forgotPassword = async () => {
    if (!email) { setErr('Enter your email above first, then tap reset.'); return; }
    resetMsgs(); setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/welcome` });
      if (error) throw error;
      setInfo(`Reset link sent to ${email}. Check your inbox (and spam).`);
    } catch (e: any) {
      setErr(friendly(e.message));
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- Google (primary) ---------------- */
  const handleGoogle = async () => {
    resetMsgs();
    setLoading(true);
    try {
      const res = await signInWithGoogleNative(next);
      if (res.ok && res.method === 'demo') {
        nav(homeFor(role || 'customer'), { replace: true });
        return;
      }
      if (!res.ok) {
        setErr(res.error || 'Google sign-in failed. Try email or the demo below.');
        setLoading(false);
        return;
      }
      // Native OAuth redirects; popup flow resolves via onAuthStateChange.
      setTimeout(() => setLoading(false), 2500);
    } catch (e: any) {
      setErr(friendly(e?.message) || 'Google sign-in failed. Try email or demo.');
      setLoading(false);
    }
  };

  /* ---------------- Demo accounts ---------------- */
  const demo = async () => {
    setLoading(true); resetMsgs();
    const isAdmin = role === 'admin';
    const em = isAdmin ? 'admin@velora.ai' : 'customer@velora.ai';
    const fullName = isAdmin ? 'Demo Admin' : 'Demo Customer';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: 'velora123' });
      if (error && /invalid login|user not found|invalid.*credentials/i.test(error.message)) {
        setInfo('Provisioning demo account…');
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: em, password: 'velora123',
          options: { data: { full_name: fullName } },
        });
        if (signUpErr) throw signUpErr;
        // Server-side role grant for the demo business account (production DBs
        // lock roles — client upserts can't escalate). Best-effort: demo mode
        // resolves roles locally.
        if (!isDemoMode) {
          try { await apiSend('/api/provision-demo', 'POST', { email: em }); } catch { /* role stays customer; console unavailable */ }
        }
        if (!signUpData.session) {
          const { error: secondErr } = await supabase.auth.signInWithPassword({ email: em, password: 'velora123' });
          if (secondErr && !signUpData.session) throw secondErr;
        }
        // Ensure the profile row exists with the right display name.
        supabase.from('profiles').upsert({
          id: signUpData.user?.id, email: em, full_name: fullName, role: isAdmin ? 'admin' : 'customer',
        }).then(() => {}, () => {});
      } else if (error) {
        throw error;
      }
      nav(homeFor(role || 'customer'), { replace: true });
    } catch (e: any) {
      setErr(friendly(e.message));
      setLoading(false);
    }
  };

  /* ---------------- Business account registration ---------------- */
  const toBizStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    if (!name.trim()) { setErr('Enter the owner name.'); return; }
    if (!email.includes('@')) { setErr('Enter a valid email.'); return; }
    if (password.length < 6) { setErr('Password must be at least 6 characters.'); return; }
    setBizStep(2);
  };

  const createBusinessAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMsgs();
    if (!biz.name.trim() || !biz.category) { setErr('Business name and category are required.'); return; }
    setLoading(true);
    try {
      // 1. Create the auth account.
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } },
      });
      if (signUpErr) throw signUpErr;
      if (!signUpData.session && !isDemoMode) {
        setInfo('Account created! Confirm your email (check inbox), then sign in and your business will finish setting up.');
        setLoading(false);
        return;
      }

      // 2. Register the business — server grants the console role + creates
      //    the business row (production). Demo mode stores it in the demo
      //    tenant so the whole flow works with zero backend.
      if (isDemoMode) {
        supabase.from('profiles').upsert({ id: signUpData.user?.id, email, full_name: name, role: 'admin' }).then(() => {}, () => {});
        saveDemoBusiness({
          name: biz.name.trim(), category: biz.category, description: biz.description.trim(),
          area: biz.area.trim() || 'City Center', phone: biz.phone.trim(), email,
          open_time: biz.open_time, close_time: biz.close_time, city: biz.city,
        });
        toast('Business created — welcome to Velora', 'success');
        nav('/admin', { replace: true });
        return;
      }

      await apiSend('/api/register-business', 'POST', {
        owner_name: name, name: biz.name.trim(), category: biz.category,
        description: biz.description.trim(), address: `${biz.area.trim()}, ${biz.city}`,
        city: biz.city, phone: biz.phone.trim(), open_time: biz.open_time, close_time: biz.close_time,
        services: svc.name.trim() ? [{ name: svc.name.trim(), duration_min: svc.duration_min, price: svc.price, description: '' }] : [],
      });
      toast('Business account created — welcome to Velora', 'success');
      nav('/admin', { replace: true });
    } catch (e: any) {
      setErr(friendly(e?.message) || 'Could not create the business account. Please try again.');
      setLoading(false);
    }
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
              : 'Hospitals, salons, coaching, hotels, sports & more — instant confirmation, AI-recommended slots, and directions to the nearest options.'}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {(isAdmin
              ? [['Live dashboard', CalendarCheck], ['Manage staff', User], ['Instant sync', Sparkles]]
              : [['Instant booking', CalendarCheck], ['Nearest first', MapPin], ['AI concierge', Sparkles]]
            ).map(([t, Icon]: any) => (
              <span key={t as string} className="glass rounded-xl px-4 py-2 text-sm flex items-center gap-2">
                <Icon className="h-4 w-4 text-emerald-400" /> {t as string}
              </span>
            ))}
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
              if (mode === 'bizreg') { switchMode('signin'); setBizStep(1); }
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
              <h2 className="text-2xl font-semibold">{bizStep === 1 ? 'Create your business account' : `Tell us about ${biz.name.trim() || 'your business'}`}</h2>
              <p className="text-sm text-dim mt-1">{bizStep === 1 ? 'Step 1 of 2 — the owner account.' : 'Step 2 of 2 — your business profile. Customers see this instantly.'}</p>
              {bizStep === 1 ? (
                <form onSubmit={toBizStep2} className="mt-6 space-y-3">
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Owner name" className={inputCls + ' pl-10'} />
                  </div>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="business@email.com" className={inputCls + ' pl-10'} />
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} placeholder="Password (min 6 characters)" className={inputCls + ' pl-10'} />
                  </div>
                  {err && <p className="text-sm text-red-400">{err}</p>}
                  <button className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={createBusinessAccount} className="mt-6 space-y-3">
                  <input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} required placeholder="Business name" className={inputCls} />
                  <div className="grid grid-cols-2 gap-3">
                    <select value={biz.category} onChange={(e) => setBiz({ ...biz, category: e.target.value })} className={inputCls}>
                      {CATEGORIES.filter((c) => c.name !== 'All').map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                    <select value={biz.city} onChange={(e) => setBiz({ ...biz, city: e.target.value })} className={inputCls}>
                      {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <textarea value={biz.description} onChange={(e) => setBiz({ ...biz, description: e.target.value })} placeholder="What does your business do?" rows={2} className={inputCls + ' resize-none'} />
                  <div className="grid grid-cols-2 gap-3">
                    <input value={biz.area} onChange={(e) => setBiz({ ...biz, area: e.target.value })} placeholder="Area / locality" className={inputCls} />
                    <input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="Phone" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="text-xs text-dim">Opens</span>
                      <input type="time" value={biz.open_time} onChange={(e) => setBiz({ ...biz, open_time: e.target.value })} className={inputCls + ' mt-1'} /></label>
                    <label className="block"><span className="text-xs text-dim">Closes</span>
                      <input type="time" value={biz.close_time} onChange={(e) => setBiz({ ...biz, close_time: e.target.value })} className={inputCls + ' mt-1'} /></label>
                  </div>
                  <div className="rounded-xl border border-dashed border-app p-3 space-y-2">
                    <p className="text-xs text-dim">First service (optional — you can add more later)</p>
                    <div className="grid grid-cols-[1fr_70px_80px] gap-2">
                      <input value={svc.name} onChange={(e) => setSvc({ ...svc, name: e.target.value })} placeholder="e.g. Consultation" className={inputCls} />
                      <input type="number" min={5} value={svc.duration_min} onChange={(e) => setSvc({ ...svc, duration_min: +e.target.value })} title="Minutes" className={inputCls} />
                      <input type="number" min={0} value={svc.price} onChange={(e) => setSvc({ ...svc, price: +e.target.value })} title="Price ₹" className={inputCls} />
                    </div>
                  </div>
                  {err && <p className="text-sm text-red-400">{err}</p>}
                  {info && <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">{info}</p>}
                  <button disabled={loading} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2 disabled:opacity-60">
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : <><Building2 className="h-4 w-4" /> Create business account</>}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold">{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2>
              <p className="text-sm text-dim mt-1">
                {mode === 'register' ? 'Join Velora in seconds.' : `Sign in to your ${isAdmin ? 'business console' : 'account'}.`}
              </p>

              {/* Primary: Google */}
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="mt-6 w-full rounded-xl grad-btn text-white py-3 text-sm font-semibold flex items-center justify-center gap-2.5 shadow-lg shadow-[var(--color-brand-indigo)]/20 disabled:opacity-60"
              >
                <GoogleLogo /> Continue with Google
              </button>

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
                  onClick={() => { switchMode('bizreg'); setBizStep(1); }}
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
              <div className="mt-6 rounded-xl border border-dashed border-app p-3">
                <p className="text-xs text-dim mb-2">Explore the full working demo — {isAdmin ? 'business console' : 'customer app'} with live demo data.</p>
                <button onClick={demo} disabled={loading} className="w-full text-xs rounded-lg border border-app hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] py-2.5 font-medium flex items-center justify-center gap-1.5 transition-colors">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><ShieldCheck className="h-3.5 w-3.5" /> Continue as demo {isAdmin ? 'business' : 'customer'}</>}
                </button>
              </div>

              {!isAdmin && (
                <p className="mt-4 text-center text-sm text-dim">
                  Have a business? <button onClick={() => { setRole('admin'); switchMode('bizreg'); setBizStep(1); }} className="text-[var(--color-brand-indigo)] font-medium">Create a business account</button>
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

function RoleCard({ onClick, icon: Icon, title, sub, tint, delay }: any) {
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
