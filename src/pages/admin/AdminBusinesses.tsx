import { useMemo, useState } from 'react';
import { Star, MapPin, Plus, Pencil, Trash2, Phone, Clock, ExternalLink } from 'lucide-react';
import { PageHeader, Spinner, EmptyState, DemoBadge, Modal, Field, inputCls, btnGhost, btnPrimary } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { useLocation } from '../../contexts/LocationContext';
import { imgOnError } from '../../lib/product';
import { CATEGORIES } from '../../lib/product';
import { CITIES } from '../../lib/cities';
import { saveDemoBusiness, updateDemoBusiness, deleteDemoBusiness, isDemoBusinessId } from '../../lib/demoStore';
import { isValidIndianPin, isValidIndianPhone } from '../../lib/india';
import { getCity } from '../../lib/cities';
import { toast } from '../../services/events';
import { useNavigate } from 'react-router-dom';

interface BizForm {
  name: string; category: string; description: string;
  line1: string; street: string; area: string; city: string; state: string; pin: string;
  phone: string; email: string; open_time: string; close_time: string;
  svcName: string; svcDuration: number; svcPrice: number;
}

const emptyForm = (city: string): BizForm => ({
  name: '', category: 'Salons', description: '',
  line1: '', street: '', area: '', city, state: getCity(city)?.state || '', pin: '',
  phone: '', email: '',
  open_time: '09:00', close_time: '20:00', svcName: '', svcDuration: 45, svcPrice: 500,
});

export default function AdminBusinesses() {
  const { city } = useLocation();
  const nav = useNavigate();
  const { businesses, loading, reload } = useConsoleData(city.name);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<BizForm>(emptyForm(city.name));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any>(null);

  const list = useMemo(() => {
    const demo = businesses.filter((b: any) => isDemoBusinessId(b.id));
    const rest = businesses.filter((b: any) => !isDemoBusinessId(b.id));
    return [...demo, ...rest];
  }, [businesses]);

  const openCreate = () => { setEditing(null); setForm(emptyForm(city.name)); setErr(''); setOpen(true); };
  const openEdit = (b: any) => {
    setEditing(b);
    setForm({
      name: b.name, category: b.category, description: b.description || '',
      line1: b.line1 || '', street: b.street || '', area: (b.area || '').replace(/, .*$/, ''),
      city: b.city || city.name, state: b.state || getCity(b.city || city.name)?.state || '', pin: b.pin || '',
      phone: b.phone || '', email: b.email || '',
      open_time: b.open_time || '09:00', close_time: b.close_time || '20:00',
      svcName: '', svcDuration: 45, svcPrice: 500,
    });
    setErr(''); setOpen(true);
  };

  const save = async () => {
    setErr('');
    if (!form.name.trim() || !form.category) { setErr('Business name and category are required.'); return; }
    if (form.pin.trim() && !isValidIndianPin(form.pin)) { setErr('Enter a valid 6-digit Indian PIN code.'); return; }
    if (form.phone.trim() && !isValidIndianPhone(form.phone)) { setErr('Enter a valid 10-digit Indian mobile number.'); return; }
    setBusy(true);
    try {
      if (editing) {
        updateDemoBusiness(String(editing.id), {
          name: form.name.trim(), category: form.category, description: form.description.trim(),
          line1: form.line1.trim(), street: form.street.trim(),
          area: form.area.trim() || 'City Center', phone: form.phone.trim(), email: form.email.trim(),
          open_time: form.open_time, close_time: form.close_time, city: form.city,
          state: form.state.trim() || getCity(form.city)?.state || '', pin: form.pin.trim(), country: 'India',
        });
        toast('Business updated — customer profile reflects it immediately', 'success');
      } else {
        const biz = saveDemoBusiness({
          name: form.name.trim(), category: form.category, description: form.description.trim(),
          line1: form.line1.trim(), street: form.street.trim(),
          area: form.area.trim() || 'City Center', phone: form.phone.trim(), email: form.email.trim(),
          open_time: form.open_time, close_time: form.close_time, city: form.city,
          state: form.state.trim() || getCity(form.city)?.state || '', pin: form.pin.trim(), country: 'India',
        });
        // Optional starter service — bookable the moment it's saved.
        if (form.svcName.trim()) {
          const { saveDemoService } = await import('../../lib/demoStore');
          saveDemoService({
            business_id: biz.id, name: form.svcName.trim(),
            description: 'Added with the business', duration_min: form.svcDuration, price: form.svcPrice,
          });
        }
        toast('Business created — live for customers with a full service menu', 'success');
      }
      setOpen(false);
      reload();
    } catch (e: any) {
      setErr(e?.message || 'Could not save the business.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!confirmDelete) return;
    deleteDemoBusiness(String(confirmDelete.id));
    setConfirmDelete(null);
    toast('Business removed from the demo tenant', 'info');
    reload();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title={`Businesses · ${city.name}`}
        subtitle={`${list.length} providers on the platform. Demo businesses are editable; production rows are managed in the database.`}
        action={<button onClick={openCreate} className={btnPrimary}><Plus className="h-4 w-4" /> Add business</button>}
      />

      {list.length === 0 ? (
        <EmptyState title="No businesses yet" sub="Add your first demo business — it appears in customer discovery instantly." action={<button onClick={openCreate} className={btnGhost}><Plus className="h-4 w-4" /> Add business</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.slice(0, 90).map((b: any) => (
            <div key={b.id} className="card overflow-hidden group hover:border-[var(--border-strong)] transition-colors">
              <div className="relative">
                <img src={b.image_url} alt={b.name} onError={imgOnError(b.category)} loading="lazy" className={`h-32 w-full object-cover ${b.active === false ? 'opacity-50' : ''}`} />
                <div className="absolute top-2 left-2 flex gap-1.5">{isDemoBusinessId(b.id) && <DemoBadge />}{b.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/25">Inactive</span>}</div>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{b.name}</p>
                    <p className="text-xs text-dim">{b.category}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(b.rating || 0).toFixed(1)}</span>
                </div>
                <p className="mt-2 text-xs text-dim flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{b.area ? `${b.area}, ` : ''}{b.city || city.name}</span></p>
                <p className="mt-1 text-xs text-dim flex items-center gap-1"><Clock className="h-3 w-3" />{b.open_time}–{b.close_time}</p>
                {b.phone && <p className="mt-1 text-xs text-dim flex items-center gap-1"><Phone className="h-3 w-3" />{b.phone}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg ${b.active !== false ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{b.active !== false ? 'Active' : 'Inactive'}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => nav(`/business/${b.id}`)} title="View customer profile" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><ExternalLink className="h-3.5 w-3.5" /></button>
                    {isDemoBusinessId(b.id) ? (
                      <>
                        <button onClick={() => openEdit(b)} title="Edit" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setConfirmDelete(b)} title="Delete" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    ) : (
                      <span className="text-[10px] text-dim self-center">DB row</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit business */}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={editing ? 'Edit business' : 'Add business'} wide>
        <div className="space-y-3">
          <Field label="Business name *">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Glow Studio" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category *">
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.filter((c) => c.name !== 'All').map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="City">
              <select className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                {CITIES.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Description">
            <textarea className={inputCls + ' resize-none'} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this business do?" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area / locality"><input className={inputCls} value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. C-Scheme" /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 …" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening hours"><input type="time" className={inputCls} value={form.open_time} onChange={(e) => setForm({ ...form, open_time: e.target.value })} /></Field>
            <Field label="Closing hours"><input type="time" className={inputCls} value={form.close_time} onChange={(e) => setForm({ ...form, close_time: e.target.value })} /></Field>
          </div>
          {!editing && (
            <div className="rounded-xl border border-dashed border-app p-3 space-y-2">
              <p className="text-xs text-dim">First service (optional)</p>
              <div className="grid grid-cols-[1fr_70px_80px] gap-2">
                <input className={inputCls} value={form.svcName} onChange={(e) => setForm({ ...form, svcName: e.target.value })} placeholder="e.g. Consultation" />
                <input className={inputCls} type="number" min={5} value={form.svcDuration} onChange={(e) => setForm({ ...form, svcDuration: +e.target.value })} title="Minutes" />
                <input className={inputCls} type="number" min={0} value={form.svcPrice} onChange={(e) => setForm({ ...form, svcPrice: +e.target.value })} title="Price ₹" />
              </div>
            </div>
          )}
          <p className="text-xs text-dim rounded-xl border border-app p-3">
            Saved to the isolated demo tenant — appears immediately in business listings, search and customer discovery.
          </p>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex gap-2.5">
            <button onClick={() => setOpen(false)} disabled={busy} className={btnGhost + ' flex-1'}>Cancel</button>
            <button onClick={save} disabled={busy} className={btnPrimary + ' flex-1'}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create business'}</button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Remove business">
        {confirmDelete && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Remove <strong>{confirmDelete.name}</strong> from the demo tenant? Its services and staff are removed with it. Demo bookings stay in history for audit.</p>
            <div className="flex gap-2.5">
              <button onClick={() => setConfirmDelete(null)} className={btnGhost + ' flex-1'}>Keep</button>
              <button onClick={remove} className={btnPrimary + ' flex-1 hover:bg-red-500'}>Remove</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
