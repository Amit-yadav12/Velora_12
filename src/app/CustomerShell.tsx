import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../components/premium/PageTransition';
import { Home, CalendarCheck, Bell, User, Sun, Moon, Search, LogOut, Settings, ChevronRight, Command } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../lib/theme';
import supabase from '../lib/supabase';
import Spotlight from '../components/premium/Spotlight';
import { LogoMark } from '../components/Logo';
import AIConcierge from '../components/premium/AIConcierge';
import InstallPrompt from '../components/premium/InstallPrompt';

const tabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/appointments', label: 'Bookings', icon: CalendarCheck },
  { to: '/notifications', label: 'Alerts', icon: Bell },
  { to: '/profile', label: 'Profile', icon: User },
];

export default function CustomerShell({ children }: { children: React.ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menu, setMenu] = useState(false);
  const [spotlight, setSpotlight] = useState(false);

  const loadUnread = () => {
    const countLocal = () => {
      try {
        const raw = localStorage.getItem('velora-local-notifs');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr.filter((n: any) => !n.read).length : 0;
      } catch { return 0; }
    };
    fetch('/api/notifications?audience=customer').then(r => r.json()).then(d => {
      const server = Array.isArray(d) ? d.filter((n: any) => !n.read).length : 0;
      setUnread(server + countLocal());
    }).catch(() => setUnread(countLocal()));
  };
  useEffect(() => { loadUnread(); }, [loc.pathname]);
  useEffect(() => {
    const ch = supabase.channel('cust-notif').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, loadUnread).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSpotlight(o => !o); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const doSignOut = async () => { await signOut(); nav('/welcome', { replace: true }); };
  const initials = (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* Floating top nav */}
      <motion.header initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="sticky top-0 z-40 px-4 pt-3">
        <div className="mx-auto max-w-6xl glass rounded-2xl px-4 py-2.5 flex items-center gap-3 shadow-lg">
          <Link to="/" className="flex items-center gap-2">
            <LogoMark size={32} />
            <span className="font-semibold tracking-tight hidden sm:block">Velora</span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 ml-4">
            {tabs.map(t => {
              const active = loc.pathname === t.to;
              return <Link key={t.to} to={t.to} className={`relative px-3.5 py-2 text-sm rounded-lg transition-colors ${active ? 'text-[var(--text)]' : 'text-muted hover:text-[var(--text)]'}`}>
                {t.label}
                {active && <motion.span layoutId="nav-underline" className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full grad-btn" />}
              </Link>;
            })}
          </nav>
          <button onClick={() => setSpotlight(true)} className="hidden lg:flex items-center gap-2 ml-2 rounded-xl border border-app px-3 py-2 text-sm text-dim hover:border-[var(--border-strong)] transition-colors min-w-[180px]">
            <Search className="h-4 w-4" /> Search…
            <span className="ml-auto flex items-center gap-0.5 text-[10px]"><Command className="h-3 w-3" />K</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button aria-label="Search" onClick={() => setSpotlight(true)} className="h-9 w-9 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors lg:hidden"><Search className="h-4 w-4" /></button>
            <button aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} className="h-9 w-9 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
            <Link to="/notifications" aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`} className="relative h-9 w-9 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors">
              <Bell className="h-4 w-4" />
              {unread > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] grid place-items-center">{unread}</span>}
            </Link>
            <div className="relative">
              <button aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(m => !m)} className="h-9 w-9 rounded-full grad-btn grid place-items-center text-white text-xs font-semibold">{user ? initials : <User className="h-4 w-4" />}</button>
              <AnimatePresence>
                {menu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 mt-2 w-56 glass rounded-2xl shadow-2xl overflow-hidden z-50 p-1.5">
                      {user ? (
                        <>
                          <div className="px-3 py-2.5"><p className="text-sm font-medium truncate">{profile?.full_name}</p><p className="text-xs text-dim truncate">{profile?.email}</p></div>
                          <div className="h-px bg-[var(--border)] my-1" />
                          <Link to="/profile" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)]"><User className="h-4 w-4" /> Profile <ChevronRight className="h-3.5 w-3.5 ml-auto text-dim" /></Link>
                          <Link to="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)]"><Settings className="h-4 w-4" /> Settings <ChevronRight className="h-3.5 w-3.5 ml-auto text-dim" /></Link>
                          <button onClick={doSignOut} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)] text-red-400"><LogOut className="h-4 w-4" /> Sign out</button>
                        </>
                      ) : (
                        <>
                          <div className="px-3 py-2.5"><p className="text-sm font-medium">Browsing as guest</p><p className="text-xs text-dim">Sign in to book & manage appointments</p></div>
                          <div className="h-px bg-[var(--border)] my-1" />
                          <Link to="/welcome" onClick={() => setMenu(false)} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm grad-btn text-white justify-center font-medium"><User className="h-4 w-4" /> Sign in</Link>
                        </>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6"><PageTransition>{children}</PageTransition></main>

      {/* Floating bottom nav (mobile) */}
      <motion.nav initial={{ y: 80 }} animate={{ y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="lg:hidden fixed bottom-4 inset-x-4 z-40">
        <div className="glass rounded-2xl px-2 py-2 flex items-center justify-around shadow-2xl">
          {tabs.map(t => {
            const active = loc.pathname === t.to;
            return (
              <Link key={t.to} to={t.to} className="relative flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl">
                {active && <motion.span layoutId="tab-bg" className="absolute inset-0 rounded-xl bg-[var(--surface-hover)]" />}
                <span className="relative"><t.icon className={`h-5 w-5 ${active ? 'text-[var(--color-brand-indigo)]' : 'text-muted'}`} />
                  {t.to === '/notifications' && unread > 0 && <span className="absolute -top-1 -right-1 h-3.5 min-w-3.5 px-0.5 rounded-full bg-red-500 text-white text-[8px] grid place-items-center">{unread}</span>}
                </span>
                <span className={`relative text-[10px] ${active ? 'text-[var(--text)] font-medium' : 'text-dim'}`}>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </motion.nav>

      <Spotlight open={spotlight} onClose={() => setSpotlight(false)} />
      <AIConcierge />
      <InstallPrompt />
    </div>
  );
}
