import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Loader2, X } from 'lucide-react';
import { PageHeader, Spinner } from '../../components/ui';
import { inr } from '../../lib/format';
import { apiGet, apiSend } from '../../lib/api';

export default function AdminServices() {
  const [services, setServices] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business_id: '', name: '', description: '', duration_min: 30, price: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => Promise.all([apiGet('/api/admin?resource=services'), apiGet('/api/admin?resource=business')]).then(([s, b]) => { setServices(s); setBusinesses(b); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const bizName = (id: number) => businesses.find(b => b.id === id)?.name || '—';
  const create = async () => {
    setErr(''); if (!form.business_id || !form.name) { setErr('Business and name are required.'); return; }
    setBusy(true);
    try { await apiSend('/api/admin', 'POST', { resource: 'services', ...form, business_id: Number(form.business_id) }); setOpen(false); setForm({ business_id: '', name: '', description: '', duration_min: 30, price: 0 }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const del = async (id: number) => { await apiSend('/api/admin', 'DELETE', { resource: 'services', id }); load(); };

  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Services" subtitle="Manage bookable services across businesses." action={<button onClick={() => setOpen(true)} className="grad-btn text-white text-sm font-medium rounded-xl px-4 py-2.5 flex items-center gap-2"><Plus className="h-4 w-4" /> Add service</button>} />
      <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-dim text-xs border-b border-app"><th className="px-4 py-3">Service</th><th className="px-4 py-3">Business</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Price</th><th className="px-4 py-3"></th></tr></thead>
        <tbody>{services.map(s => (
          <tr key={s.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)]"><td className="px-4 py-3 font-medium">{s.name}<span className="block text-xs text-dim">{s.description}</span></td><td className="px-4 py-3 text-muted">{bizName(s.business_id)}</td><td className="px-4 py-3 text-muted">{s.duration_min} min</td><td className="px-4 py-3">{inr(s.price)}</td><td className="px-4 py-3 text-right"><button onClick={() => del(s.id)} className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>
        ))}</tbody>
      </table></div></div>

      <AnimatePresence>{open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative glass rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">New service</h3><button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="space-y-3">
              <select value={form.business_id} onChange={e => setForm({ ...form, business_id: e.target.value })} className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none"><option value="">Select business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Service name" className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" />
              <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" />
              <div className="grid grid-cols-2 gap-3"><input type="number" value={form.duration_min} onChange={e => setForm({ ...form, duration_min: +e.target.value })} placeholder="Minutes" className="rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" /><input type="number" value={form.price} onChange={e => setForm({ ...form, price: +e.target.value })} placeholder="Price" className="rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" /></div>
              {err && <p className="text-sm text-red-400">{err}</p>}
              <button onClick={create} disabled={busy} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create service</button>
            </div>
          </motion.div>
        </div>
      )}</AnimatePresence>
    </div>
  );
}
