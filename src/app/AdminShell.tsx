import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, CalendarDays, Store, Sparkles, Users, UserCog, Shield, Sun, Moon, LogOut, Menu, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../lib/theme';
import { LogoMark } from '../components/Logo';
import PageTransition from '../components/premium/PageTransition';
import ToastHost from '../components/premium/ToastHost';

const items = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/admin/businesses', label: 'Businesses', icon: Store },
  { to: '/admin/services', label: 'Services', icon: Sparkles },
  { to: '/admin/staff', label: 'Staff', icon: UserCog },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/emails', label: 'Emails', icon: Mail },
  { to: '/admin/audit', label: 'Audit Log', icon: Shield },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const doSignOut = async () => { await signOut(); nav('/welcome', { replace: true }); };

  return (
    <div className="min-h-screen flex">
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-60 bg-elev border-r border-app flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center gap-2.5 px-5 h-16 border-b border-app">
          <LogoMark size={32} />
          <span className="font-semibold tracking-tight">Velora</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--color-brand-indigo)]/15 text-[var(--color-brand-indigo)]">Admin</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map(it => {
            const active = loc.pathname === it.to;
            return <Link key={it.to} to={it.to} onClick={() => setOpen(false)} className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${active ? 'grad-btn text-white' : 'text-muted hover:bg-[var(--surface-hover)]'}`}><it.icon className="h-4 w-4" />{it.label}</Link>;
          })}
        </nav>
        <div className="p-3 border-t border-app">
          <div className="flex items-center gap-3 px-2 py-2"><div className="h-9 w-9 rounded-full grad-btn grid place-items-center text-white text-sm font-semibold">{(profile?.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2)}</div><div className="min-w-0"><p className="text-sm font-medium truncate">{profile?.full_name}</p><p className="text-xs text-dim truncate">{profile?.email}</p></div></div>
          <button onClick={doSignOut} className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted hover:bg-[var(--surface-hover)]"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-app flex items-center gap-3 px-5 sticky top-0 z-20 bg-elev/80 backdrop-blur">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-app"><Menu className="h-4 w-4" /></button>
          <span className="text-sm font-medium">Admin Console</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/" className="text-sm text-dim hover:text-[var(--text)]">Customer app ↗</Link>
            <button aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} className="h-9 w-9 grid place-items-center rounded-lg border border-app">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </header>
        <main className="flex-1 p-5 lg:p-8 max-w-7xl w-full mx-auto"><PageTransition>{children}</PageTransition></main>
        <ToastHost />
      </div>
    </div>
  );
}
