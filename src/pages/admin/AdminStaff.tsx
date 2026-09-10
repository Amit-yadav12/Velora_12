import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Power, CalendarClock } from 'lucide-react';
import { PageHeader, Spinner, EmptyState, DemoBadge, Modal, Field, inputCls, btnGhost, btnPrimary } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { saveDemoStaff, updateDemoStaff, deleteDemoStaff } from '../../lib/demoStore';
import { apiSend } from '../../lib/api';
import { toast } from '../../services/events';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface StaffForm {
  business_id: string; name: string; role: string; service_ids: string[]; days: string[]; start: string; end: string;
}

export default function AdminStaff() {
  const { staff, businesses, services, bookings, loading, reload } = useConsoleData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<StaffForm>({ business_id: '', name: '', role: '', service_ids: [], days: [...ALL_DAYS], start: '10:00', end: '19:00' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const demoBiz = useMemo(() => businesses.filter((b: any) => String(b.id).startsWith('demo-biz-')), [businesses]);
  const bizName = (id: any) => businesses.find((b) => String(b.id) === String(id))?.name || '—';
  const bizServices = (bizId: any) => services.filter((s: any) => String(s.business_id) === String(bizId));

  const upcomingFor = useMemo(() => {
    const map = new Map<string, number>();
    // eslint-disable-next-line react-hooks/purity -- intentional: relative time buckets
    const now = Date.now();
    for (const b of bookings) {
      if (b.status === 'cancelled' || new Date(b.start_time).getTime() <= now || !b.employee_name) continue;
      map.set(b.employee_name, (map.get(b.employee_name) || 0) + 1);
    }
    return map;
  }, [bookings]);

  const openCreate = () => {
    setEditing(null);
    setForm({ business_id: demoBiz[0]?.id || '', name: '', role: '', service_ids: [], days: [...ALL_DAYS], start: '10:00', end: '19:00' });
    setErr(''); setOpen(true);
  };
  const openEdit = (s: any) => {
    setEditing(s);
    setForm({
      business_id: String(s.business_id), name: s.name, role: s.role || '',
      service_ids: Array.isArray(s.service_ids) ? s.service_ids : [],
      days: Array.isArray(s.days) && s.days.length ? s.days : [...ALL_DAYS],
      start: s.start || '10:00', end: s.end || '19:00',
    });
    setErr(''); setOpen(true);
  };

  const save = async () => {
    setErr('');
    if (!form.business_id || !form.name.trim()) { setErr('Business and staff name are required.'); return; }
    setBusy(true);
    try {
      if (String(form.business_id).startsWith('demo-biz-')) {
        if (editing) updateDemoStaff(String(editing.id), { ...form, name: form.name.trim(), role: form.role.trim() || 'Staff' });
        else saveDemoStaff({ ...form, name: form.name.trim(), role: form.role.trim() || 'Staff' });
      } else if (editing) {
        await apiSend('/api/admin', 'PUT', { resource: 'staff', id: editing.id, name: form.name.trim(), role: form.role.trim() });
      } else {
        await apiSend('/api/admin', 'POST', { resource: 'staff', ...form, name: form.name.trim(), role: form.role.trim() || 'Staff', business_id: Number(form.business_id) });
      }
      toast(editing ? 'Staff updated — availability is live' : 'Staff added — counts update everywhere', 'success');
      setOpen(false);
      reload();
    } catch (e: any) {
      setErr(e?.message || 'Could not save staff.');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (s: any) => {
    const next = s.active === false;
    if (s.demo) updateDemoStaff(String(s.id), { active: next });
    else { try { await apiSend('/api/admin', 'PUT', { resource: 'staff', id: s.id, active: next }); } catch (e: any) { toast(e.message, 'error'); return; } }
    toast(next ? 'Staff active' : 'Staff deactivated — hidden from booking', next ? 'success' : 'info');
    reload();
  };

  const del = async (s: any) => {
    if (s.demo) deleteDemoStaff(String(s.id));
    else { try { await apiSend('/api/admin', 'DELETE', { resource: 'staff', id: s.id }); } catch (e: any) { toast(e.message, 'error'); return; } }
    toast('Staff removed', 'info');
    reload();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Staff"
        subtitle="Specialists who deliver services — assignments and availability drive the booking engine."
        action={<button onClick={openCreate} className={btnPrimary}><Plus className="h-4 w-4" /> Add staff</button>}
      />

      {staff.length === 0 ? (
        <EmptyState title="No staff yet" sub="Add specialists to a demo business — customers can pick them when booking." action={<button onClick={openCreate} className={btnGhost}><Plus className="h-4 w-4" /> Add staff</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {staff.map((s: any) => {
            const svcCount = Array.isArray(s.service_ids) ? s.service_ids.length : bizServices(s.business_id).length;
            const upcoming = upcomingFor.get(s.name) || 0;
            return (
              <div key={s.id} className={`card p-4 hover:border-[var(--border-strong)] transition-colors ${s.active === false ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="h-11 w-11 rounded-full grad-btn grid place-items-center text-white text-sm font-semibold shrink-0">
                    {s.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium truncate">{s.name}</p>
                      {s.demo && <DemoBadge />}
                    </div>
                    <p className="text-xs text-dim truncate">{s.role || 'Staff'} · {bizName(s.business_id)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(s)} title="Edit" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => toggleActive(s)} title={s.active !== false ? 'Deactivate' : 'Activate'} className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-amber-400"><Power className="h-3.5 w-3.5" /></button>
                    <button onClick={() => del(s)} title="Remove" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-surface text-dim">{svcCount} service{svcCount === 1 ? '' : 's'}</span>
                  <span className="px-2 py-0.5 rounded-lg bg-surface text-dim">{(Array.isArray(s.days) ? s.days : ALL_DAYS).length} days/wk</span>
                  <span className="px-2 py-0.5 rounded-lg bg-surface text-dim">{s.start || '10:00'}–{s.end || '19:00'}</span>
                  <span className={`px-2 py-0.5 rounded-lg inline-flex items-center gap-1 ${upcoming > 0 ? 'bg-[var(--color-brand-indigo)]/15 text-[var(--color-brand-indigo)]' : 'bg-surface text-dim'}`}>
                    <CalendarClock className="h-3 w-3" /> {upcoming} upcoming
                  </span>
                  {s.active === false && <span className="px-2 py-0.5 rounded-lg bg-red-500/15 text-red-400">Inactive</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => !busy && setOpen(false)} title={editing ? 'Edit staff' : 'Add staff'}>
        <div className="space-y-3">
          <Field label="Business *">
            <select className={inputCls} value={form.business_id} onChange={(e) => setForm({ ...form, business_id: e.target.value, service_ids: [] })} disabled={!!editing}>
              <option value="">Select business</option>
              {(demoBiz.length ? [...demoBiz, ...businesses.filter((b: any) => !String(b.id).startsWith('demo-biz-'))] : businesses).map((b: any) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Meera Kapoor" /></Field>
            <Field label="Role"><input className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="e.g. Senior Stylist" /></Field>
          </div>
          {String(form.business_id).startsWith('demo-biz-') && (
            <>
              <Field label="Services they deliver">
                <div className="flex flex-wrap gap-1.5">
                  {bizServices(form.business_id).map((s: any) => {
                    const on = form.service_ids.includes(String(s.id));
                    return (
                      <button key={s.id} type="button" onClick={() => setForm({ ...form, service_ids: on ? form.service_ids.filter((x) => x !== String(s.id)) : [...form.service_ids, String(s.id)] })}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${on ? 'border-[var(--color-brand-indigo)] bg-[var(--color-brand-indigo)]/10 text-[var(--text)]' : 'border-app text-dim hover:border-[var(--border-strong)]'}`}>
                        {s.name}
                      </button>
                    );
                  })}
                  {bizServices(form.business_id).length === 0 && <p className="text-xs text-dim">No services yet for this business.</p>}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Available from"><input type="time" className={inputCls} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                <Field label="Available until"><input type="time" className={inputCls} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
              </div>
              <Field label="Working days">
                <div className="flex flex-wrap gap-1.5">
                  {ALL_DAYS.map((d) => {
                    const on = form.days.includes(d);
                    return (
                      <button key={d} type="button" onClick={() => setForm({ ...form, days: on ? form.days.filter((x) => x !== d) : [...form.days, d] })}
                        className={`text-xs w-11 py-1.5 rounded-lg border transition-colors ${on ? 'border-[var(--color-brand-indigo)] bg-[var(--color-brand-indigo)]/10' : 'border-app text-dim hover:border-[var(--border-strong)]'}`}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-2.5">
            <button onClick={() => setOpen(false)} disabled={busy} className={btnGhost + ' flex-1'}>Cancel</button>
            <button onClick={save} disabled={busy} className={btnPrimary + ' flex-1'}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add staff'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
