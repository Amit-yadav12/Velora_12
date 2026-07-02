import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Loader2, X } from 'lucide-react';
import { PageHeader, Spinner } from '../../components/ui';
import { apiGet, apiSend } from '../../lib/api';

export default function AdminStaff() {
  const [staff, setStaff] = useState<any[]>([]);
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ business_id: '', name: '', role: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = () => Promise.all([apiGet('/api/admin?resource=staff'), apiGet('/api/admin?resource=business')]).then(([s, b]) => { setStaff(s); setBusinesses(b); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const bizName = (id: number) => businesses.find(b => b.id === id)?.name || '—';
  const create = async () => { setErr(''); if (!form.business_id || !form.name) { setErr('Business and name required.'); return; } setBusy(true); try { await apiSend('/api/admin', 'POST', { resource: 'staff', ...form, business_id: Number(form.business_id) }); setOpen(false); setForm({ business_id: '', name: '', role: '' }); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const del = async (id: number) => { await apiSend('/api/admin', 'DELETE', { resource: 'staff', id }); load(); };
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Staff" subtitle="Specialists and employees who deliver services." action={<button onClick={() => setOpen(true)} className="grad-btn text-white text-sm font-medium rounded-xl px-4 py-2.5 flex items-center gap-2"><Plus className="h-4 w-4" /> Add staff</button>} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map(s => (
          <div key={s.id} className="card p-4 flex items-center gap-3"><div className="h-11 w-11 rounded-full grad-btn grid place-items-center text-white text-sm font-semibold">{s.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div><div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{s.name}</p><p className="text-xs text-dim">{s.role} · {bizName(s.business_id)}</p></div><button onClick={() => del(s.id)} className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><Trash2 className="h-3.5 w-3.5" /></button></div>
        ))}
      </div>
      <AnimatePresence>{open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4"><div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="relative glass rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">New staff member</h3><button onClick={() => setOpen(false)}><X className="h-4 w-4" /></button></div>
            <div className="space-y-3">
              <select value={form.business_id} onChange={e => setForm({ ...form, business_id: e.target.value })} className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none"><option value="">Select business</option>{businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" />
              <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role / title" className="w-full rounded-xl bg-elev border border-app px-3 py-2.5 text-sm outline-none" />
              {err && <p className="text-sm text-red-400">{err}</p>}
              <button onClick={create} disabled={busy} className="w-full grad-btn text-white font-medium rounded-xl py-3 flex items-center justify-center gap-2">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Add staff</button>
            </div>
          </motion.div>
        </div>
      )}</AnimatePresence>
    </div>
  );
}
