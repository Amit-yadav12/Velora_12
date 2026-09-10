import { useEffect, useState } from 'react';
import { istDateTime } from '../../lib/format';
import { motion } from 'framer-motion';
import { Bell, Check, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import supabase from '../../lib/supabase';
import { useLocation } from '../../contexts/LocationContext';
import { markLocalNotificationRead, listLocalNotificationsFor } from '../../lib/offlineStore';
import { onNotifsChanged } from '../../services/events';

const iconFor = (t: string) => t === 'success' ? CheckCircle2 : t === 'warning' ? AlertTriangle : Info;
const colorFor = (t: string) => t === 'success' ? '#34d399' : t === 'warning' ? '#f59e0b' : '#60a5fa';

export default function Notifications() {
  const { city } = useLocation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => {
    // Customer-audience ONLY — business-side notifications are never shown here.
    const local = listLocalNotificationsFor('customer');
    fetch('/api/notifications?audience=customer').then(r => r.json()).then(d => {
      const server = Array.isArray(d) ? d.filter((n: any) => n.audience !== 'admin') : [];
      const seen = new Set(server.map((n: any) => `${n.title}|${n.body}`));
      const merged = [...server, ...local.filter((n) => !seen.has(`${n.title}|${n.body}`))]
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(merged); setLoading(false);
    }).catch(() => { setItems(local); setLoading(false); });
  };
  useEffect(() => { load(); }, [city.name]);
  useEffect(() => {
    const ch = supabase.channel('n-page').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, load).subscribe();
    const offLocal = onNotifsChanged(load);
    return () => { supabase.removeChannel(ch); offLocal(); };
  }, []);
  const markRead = async (id: number | string) => {
    const target = items.find((n) => String(n.id) === String(id));
    if (target?.local) markLocalNotificationRead(String(id));
    else {
      try { await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); } catch { /* non-fatal */ }
    }
    load();
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Notifications</h1>
      <p className="text-sm text-dim mb-5">Booking confirmations, reminders and updates.</p>
      {loading ? <div className="card h-24 animate-pulse" /> : items.length === 0 ? (
        <div className="card p-12 text-center"><div className="h-12 w-12 rounded-2xl bg-surface grid place-items-center mx-auto mb-3"><Bell className="h-6 w-6 text-dim" /></div><p className="font-medium">You're all caught up</p><p className="text-sm text-dim mt-1">New notifications will appear here.</p></div>
      ) : (
        <div className="space-y-2">
          {items.map((n, i) => { const Icon = iconFor(n.type); const c = colorFor(n.type); return (
            <motion.div key={n.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }} className={`card p-4 flex items-start gap-3 ${!n.read ? '' : 'opacity-70'}`}>
              <div className="h-9 w-9 rounded-xl grid place-items-center shrink-0" style={{ background: `${c}22` }}><Icon className="h-4 w-4" style={{ color: c }} /></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium">{n.title}</p><p className="text-sm text-dim">{n.body}</p><p className="text-xs text-dim mt-1">{istDateTime(n.created_at)}</p></div>
              {!n.read && <button onClick={() => markRead(n.id)} className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] shrink-0" title="Mark read"><Check className="h-3.5 w-3.5" /></button>}
            </motion.div>
          ); })}
        </div>
      )}
    </div>
  );
}
