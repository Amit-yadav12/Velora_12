import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, IndianRupee, Store, Clock } from 'lucide-react';
import { StatusBadge, Spinner } from '../../components/ui';
import { apiGet } from '../../lib/api';
import supabase from '../../lib/supabase';
import { inr, istDateTime } from '../../lib/format';

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const load = () => apiGet('/api/admin?resource=overview').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { const ch = supabase.channel('adm').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load()).subscribe(); return () => { supabase.removeChannel(ch); }; }, []);
  if (!data) return <Spinner />;
  const s = data.stats;
  const cards = [
    { label: 'Active bookings', value: s.total, icon: CalendarDays, color: '#60a5fa' },
    { label: 'Revenue', value: inr(s.revenue), icon: IndianRupee, color: '#34d399' },
    { label: "Today's bookings", value: s.today, icon: Clock, color: '#f59e0b' },
    { label: 'Businesses', value: s.businesses, icon: Store, color: '#818cf8' },
  ];
  const recent = [...data.bookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);
  return (
    <div>
      <div className="flex items-center justify-between mb-6"><div><h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1><p className="text-sm text-dim mt-1 flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> Live · real-time</p></div></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c, i) => <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-5"><div className="h-9 w-9 rounded-xl grid place-items-center mb-3" style={{ background: `${c.color}22` }}><c.icon className="h-4 w-4" style={{ color: c.color }} /></div><p className="text-2xl font-semibold">{c.value}</p><p className="text-sm text-dim">{c.label}</p></motion.div>)}
      </div>
      <div className="card p-6">
        <h2 className="font-semibold mb-4">Latest bookings</h2>
        <div className="space-y-2">
          {recent.map(b => (
            <div key={b.id} className="flex items-center gap-4 rounded-xl border border-app p-3">
              <div className="h-10 w-10 rounded-xl grad-btn grid place-items-center text-white text-xs font-semibold">{new Date(b.start_time).getDate()}</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{b.service_name} · {b.resource_name}</p><p className="text-xs text-dim">{b.customer_name} · {istDateTime(b.start_time)}</p></div>
              <StatusBadge status={b.status} /><span className="text-sm font-medium tabular-nums">{inr(b.price)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
