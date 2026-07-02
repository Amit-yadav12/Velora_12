import { useEffect, useState } from 'react';
import { X, CheckCircle2, Loader2, LogIn, Download } from 'lucide-react';
import { PageHeader, StatusBadge, Spinner, EmptyState } from '../../components/ui';
import { apiGet, apiSend } from '../../lib/api';
import supabase from '../../lib/supabase';
import { ist, istTime } from '../../lib/format';

export default function AdminAppointments() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<number | null>(null);
  const load = () => apiGet('/api/bookings').then(d => { setBookings(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => { const ch = supabase.channel('adm-appt').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => load()).subscribe(); return () => { supabase.removeChannel(ch); }; }, []);
  const act = async (id: number, action: string, extra: any = {}) => { setBusy(id); await apiSend('/api/bookings', 'PUT', { id, action, ...extra }); await load(); setBusy(null); };
  const exportCsv = () => {
    const rows = [['Ref', 'Customer', 'Email', 'Service', 'Business', 'When', 'Status', 'Price']];
    filtered.forEach(b => rows.push([b.ref, b.customer_name, b.customer_email, b.service_name, b.resource_name, ist(b.start_time, { month: 'short', day: 'numeric' }) + ' ' + istTime(b.start_time), b.status, b.price]));
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `velora-appointments-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  if (loading) return <Spinner />;
  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  return (
    <div>
      <PageHeader title="Appointments" subtitle="Every booking across all businesses, in real time." action={<button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-app px-4 py-2.5 text-sm font-medium hover:border-[var(--border-strong)]"><Download className="h-4 w-4" /> Export CSV</button>} />
      <div className="flex gap-2 mb-4 flex-wrap">{['all', 'confirmed', 'completed', 'cancelled', 'no_show'].map(f => <button key={f} onClick={() => setFilter(f)} className={`text-xs px-3 py-1.5 rounded-lg capitalize ${filter === f ? 'grad-btn text-white' : 'border border-app text-muted'}`}>{f.replace('_', ' ')}</button>)}</div>
      {filtered.length === 0 ? <EmptyState title="No appointments" /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-dim text-xs border-b border-app"><th className="px-4 py-3">Ref</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Service</th><th className="px-4 py-3 hidden md:table-cell">Business</th><th className="px-4 py-3">When</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>{filtered.map(b => (
            <tr key={b.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)]">
              <td className="px-4 py-3 font-mono text-xs">{b.ref}</td><td className="px-4 py-3">{b.customer_name}</td><td className="px-4 py-3 font-medium">{b.service_name}</td>
              <td className="px-4 py-3 hidden md:table-cell text-muted">{b.resource_name}</td>
              <td className="px-4 py-3 text-muted whitespace-nowrap">{ist(b.start_time, { month: 'short', day: 'numeric' })}, {istTime(b.start_time)}</td>
              <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
              <td className="px-4 py-3">{busy === b.id ? <Loader2 className="h-4 w-4 animate-spin text-dim" /> : (b.status === 'confirmed' || b.status === 'checked_in') && (
                <div className="flex gap-1 justify-end">
                  {b.status === 'confirmed' && <button onClick={() => act(b.id, 'status', { status: 'checked_in' })} title="Check in" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-blue-400"><LogIn className="h-3.5 w-3.5" /></button>}
                  <button onClick={() => act(b.id, 'status', { status: 'completed' })} title="Complete" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => act(b.id, 'cancel')} title="Cancel" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}</td>
            </tr>
          ))}</tbody>
        </table></div></div>
      )}
    </div>
  );
}
