import { useCallback, useMemo, useState } from 'react';
import { Plus, Trash2, Pencil, Power } from 'lucide-react';
import { PageHeader, Spinner, EmptyState, DemoBadge, Modal, Field, inputCls, btnGhost, btnPrimary } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { inr } from '../../lib/format';
import { saveDemoService, updateDemoService, deleteDemoService } from '../../lib/demoStore';
import { apiSend } from '../../lib/api';
import { toast } from '../../services/events';
import { errMsg } from '../../lib/types';
import type { BusinessService } from '../../lib/product';

interface SvcForm { business_id: string; name: string; description: string; duration_min: number; price: number; }

export default function AdminServices() {
  const { services, businesses, loading, reload } = useConsoleData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessService | null>(null);
  const [form, setForm] = useState<SvcForm>({ business_id: '', name: '', description: '', duration_min: 30, price: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const bizName = useCallback((id: number | string) => businesses.find((b) => String(b.id) === String(id))?.name || '—', [businesses]);
  const demoBiz = useMemo(() => businesses.filter((b) => String(b.id).startsWith('demo-biz-')), [businesses]);
  const list = useMemo(() => [...services].sort((a, b) => String(bizName(a.business_id)).localeCompare(String(bizName(b.business_id)))), [services, bizName]);

  const openCreate = () => {
    setEditing(null);
    setForm({ business_id: demoBiz[0] ? String(demoBiz[0].id) : '', name: '', description: '', duration_min: 30, price: 0 });
    setErr(''); setOpen(true);
  };
  const openEdit = (s: BusinessService) => {
    setEditing(s);
    setForm({ business_id: String(s.business_id), name: s.name, description: s.description || '', duration_min: s.duration_min, price: s.price });
    setErr(''); setOpen(true);
  };

  const save = async () => {
    setErr('');
    if (!form.business_id || !form.name.trim()) { setErr('Business and service name are required.'); return; }
    setBusy(true);
    try {
      const isDemoTarget = String(form.business_id).startsWith('demo-biz-');
      if (isDemoTarget) {
        if (editing) updateDemoService(String(editing.id), { ...form, name: form.name.trim(), description: form.description.trim(), business_id: form.business_id });
        else saveDemoService({ ...form, name: form.name.trim(), description: form.description.trim(), business_id: form.business_id });
      } else {
        // Production row — admin-gated API.
        if (editing) await apiSend('/api/admin', 'PUT', { resource: 'services', id: editing.id, name: form.name.trim(), description: form.description.trim(), duration_min: form.duration_min, price: form.price });
        else await apiSend('/api/admin', 'POST', { resource: 'services', ...form, name: form.name.trim(), description: form.description.trim(), business_id: Number(form.business_id) });
      }
      toast(editing ? 'Service updated' : 'Service created — bookable immediately', 'success');
      setOpen(false);
      reload();
    } catch (e: unknown) {
      setErr(errMsg(e) || 'Could not save the service.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: BusinessService) => {
    const next = s.active === false;
    if (s.demo) updateDemoService(String(s.id), { active: next });
    else { try { await apiSend('/api/admin', 'PUT', { resource: 'services', id: s.id, active: next }); } catch (e: unknown) { toast(errMsg(e), 'error'); return; } }
    toast(next ? 'Service active — customers can book it' : 'Service deactivated — hidden from booking', next ? 'success' : 'info');
    reload();
  };

  const del = async (s: BusinessService) => {
    if (s.demo) deleteDemoService(String(s.id));
    else { try { await apiSend('/api/admin', 'DELETE', { resource: 'services', id: s.id }); } catch (e: unknown) { toast(errMsg(e), 'error'); return; } }
    toast('Service deleted', 'info');
    reload();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Services"
        subtitle="Manage bookable services. Deactivating a service hides it from customers instantly."
        action={<button onClick={openCreate} className={btnPrimary}><Plus className="h-4 w-4" /> Add service</button>}
      />

      {list.length === 0 ? (
        <EmptyState title="No services" sub="Add a service to a demo business to make it bookable." action={<button onClick={openCreate} className={btnGhost}><Plus className="h-4 w-4" /> Add service</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dim text-xs border-b border-app">
                  <th className="px-4 py-3">Service</th><th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Duration</th><th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.name} {s.demo && <DemoBadge />}</p>
                      <p className="text-xs text-dim line-clamp-1 max-w-[280px]">{s.description || '—'} <span className="font-mono opacity-60">· {String(s.id).slice(-8)}</span></p>
                    </td>
                    <td className="px-4 py-3 text-muted">{bizName(s.business_id)}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{s.duration_min} min</td>
                    <td className="px-4 py-3 tabular-nums">{inr(s.price)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg ${s.active !== false ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{s.active !== false ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(s)} title="Edit" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => toggleActive(s)} title={s.active !== false ? 'Deactivate' : 'Activate'} className={`h-7 w-7 grid place-items-center rounded-lg border border-app ${s.active !== false ? 'hover:text-amber-400' : 'hover:text-emerald-400'}`}><Power className="h-3.5 w-3.5" /></button>
                        <button onClick={() => del(s)} title="Delete" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={editing ? 'Edit service' : 'New service'}>
        <div className="space-y-3">
          <Field label="Business *">
            <select className={inputCls} value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value })} disabled={!!editing}>
              <option value="">Select business</option>
              {(demoBiz.length ? [...demoBiz, ...businesses.filter((b) => !String(b.id).startsWith('demo-biz-'))] : businesses).map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Service name *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Signature Haircut" /></Field>
          <Field label="Description"><input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's included" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (min)"><input className={inputCls} type="number" min={5} value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: +e.target.value })} /></Field>
            <Field label="Price (₹)"><input className={inputCls} type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></Field>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-2.5">
            <button onClick={() => setOpen(false)} disabled={busy} className={btnGhost + ' flex-1'}>Cancel</button>
            <button onClick={save} disabled={busy} className={btnPrimary + ' flex-1'}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create service'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
