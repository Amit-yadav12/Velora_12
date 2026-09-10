import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutGrid, CalendarDays, Store, Sparkles, Users, UserCog, Shield, Sun, Moon, LogOut, Menu, Mail, Bell, CheckCheck, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../lib/theme';
import { LogoMark } from '../components/Logo';
import PageTransition from '../components/premium/PageTransition';
import ToastHost from '../components/premium/ToastHost';
import supabase from '../lib/supabase';
import { apiGet, apiSend } from '../lib/api';
import { listLocalNotificationsFor, markAllLocalNotificationsRead, markLocalNotificationRead } from '../lib/offlineStore';
import { onNotifsChanged, toast } from '../services/events';
import { resetDemo } from '../lib/demoStore';
import type { NotificationRow } from '../lib/types';

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
  const [bellOpen, setBellOpen] = useState(false);
  const [notifs, setNotifs] = useState<NotificationRow[]>([]);
  const unread = notifs.filter((n) => !n.read).length;
  const bellRef = useRef<HTMLDivElement>(null);

  const loadNotifs = () => {
    // Server notifications (role-scoped, authorization-checked) + demo tenant.
    apiGet<NotificationRow[]>('/api/notifications').then((d) => {
      const server: NotificationRow[] = Array.isArray(d) ? d : [];
      const local = listLocalNotificationsFor('admin');
      const ids = new Set(server.map((n) => String(n.id)));
      const merged: NotificationRow[] = [...server, ...local.filter((n) => !ids.has(String(n.id)))]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 30);
      setNotifs(merged);
    }).catch(() => {
      setNotifs(listLocalNotificationsFor('admin'));
    });
  };

  useEffect(() => { loadNotifs(); }, [loc.pathname]);
  useEffect(() => {
    const ch = supabase.channel('admin-notifs').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, loadNotifs).subscribe();
    const off = onNotifsChanged(loadNotifs);
    const click = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false); };
    window.addEventListener('click', click);
    return () => { supabase.removeChannel(ch); off(); window.removeEventListener('click', click); };
  }, []);

  const markRead = async (n: NotificationRow) => {
    if (n.local) markLocalNotificationRead(String(n.id));
    else { try { await apiSend('/api/notifications', 'PUT', { id: n.id }); } catch { /* non-fatal */ } }
    loadNotifs();
  };
  const markAll = async () => {
    markAllLocalNotificationsRead('admin');
    for (const n of notifs.filter((x) => !x.read && !x.local)) {
      try { await apiSend('/api/notifications', 'PUT', { id: n.id }); } catch { /* non-fatal */ }
    }
    loadNotifs();
  };

  const doResetDemo = () => {
    resetDemo();
    toast('Demo data restored to a clean state', 'success');
    setBellOpen(false);
    setOpen(false);
  };

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
          <button onClick={doResetDemo} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted hover:bg-[var(--surface-hover)]" title="Restore the clean demo state (demo tenant only — production data is never touched)"><Activity className="h-4 w-4" /> Reset demo data</button>
          <div className="flex items-center gap-3 px-2 py-2"><div className="h-9 w-9 rounded-full grad-btn grid place-items-center text-white text-sm font-semibold">{(profile?.full_name || 'A').split(' ').map(n => n[0]).join('').slice(0, 2)}</div><div className="min-w-0"><p className="text-sm font-medium truncate">{profile?.full_name}</p><p className="text-xs text-dim truncate">{profile?.email}</p></div></div>
          <button onClick={doSignOut} className="mt-1 w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-muted hover:bg-[var(--surface-hover)]"><LogOut className="h-4 w-4" /> Sign out</button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-app flex items-center gap-3 px-5 sticky top-0 z-20 bg-elev/80 backdrop-blur">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="lg:hidden h-9 w-9 grid place-items-center rounded-lg border border-app"><Menu className="h-4 w-4" /></button>
          <span className="text-sm font-medium">Business Console</span>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--color-brand-violet)]/15 text-[var(--color-brand-violet)] border border-[var(--color-brand-violet)]/25">Demo tenant</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/" className="text-sm text-dim hover:text-[var(--text)] hidden sm:block">Customer app ↗</Link>
            {/* Notifications */}
            <div className="relative" ref={bellRef}>
              <button aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`} onClick={() => setBellOpen(o => !o)} className="relative h-9 w-9 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors">
                <Bell className="h-4 w-4" />
                {unread > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] grid place-items-center">{unread}</span>}
              </button>
              <AnimatePresence>
                {bellOpen && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute right-0 mt-2 w-80 glass rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-app">
                      <p className="text-sm font-semibold">Notifications</p>
                      {unread > 0 && <button onClick={markAll} className="text-xs text-[var(--color-brand-indigo)] font-medium inline-flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
                    </div>
                    <div className="max-h-96 overflow-y-auto p-1.5">
                      {notifs.length === 0 ? (
                        <p className="text-sm text-dim text-center py-8">No notifications yet.<br />New bookings and updates land here in real time.</p>
                      ) : notifs.map((n) => (
                        <button key={n.id} onClick={() => markRead(n)} className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-hover)] ${!n.read ? 'bg-[var(--color-brand-indigo)]/5' : ''}`}>
                          <div className="flex items-start gap-2.5">
                            <span className={`h-1.5 w-1.5 rounded-full mt-1.5 shrink-0 ${n.read ? 'bg-transparent' : n.type === 'success' ? 'bg-emerald-400' : n.type === 'warning' ? 'bg-amber-400' : 'bg-blue-400'}`} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{n.title}</p>
                              <p className="text-xs text-dim line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-dim mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} className="h-9 w-9 grid place-items-center rounded-lg border border-app">{theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          </div>
        </header>
        <main className="flex-1 p-5 lg:p-8 max-w-7xl w-full mx-auto"><PageTransition>{children}</PageTransition></main>
        <ToastHost />
      </div>
    </div>
  );
}
