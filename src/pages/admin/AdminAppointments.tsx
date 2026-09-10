import { useMemo, useState } from 'react';
import { Download, LogIn, CheckCircle2, X, Eye, Mail, Phone, MapPin, Clock, QrCode, ShieldCheck } from 'lucide-react';
import { PageHeader, Spinner, EmptyState, StatusBadge, DemoBadge, Modal, btnGhost, btnPrimary } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { applyBookingAction } from '../../services/consoleActions';
import { toast } from '../../services/events';
import { ist, istTime, istDate, istDateTime } from '../../lib/format';
import { inr } from '../../lib/format';
import { canTransition, isActionable } from '../../lib/bookingStatus';
import type { ConsoleAction } from '../../services/consoleActions';
import type { ConsoleBooking } from '../../lib/types';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export default function AdminAppointments() {
  const { bookings, loading, reload } = useConsoleData();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<number | string | null>(null);
  const [detail, setDetail] = useState<ConsoleBooking | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    for (const b of bookings) if (c[b.status] != null) c[b.status] += 1;
    return c;
  }, [bookings]);

  const filtered = useMemo(
    () => filter === 'all' ? bookings : bookings.filter((b) => b.status === filter),
    [bookings, filter],
  );

  const act = async (b: ConsoleBooking, action: ConsoleAction) => {
    setBusy(b.id);
    const ok = await applyBookingAction(b, action);
    if (ok) {
      const applied: Record<string, string> = { confirm: 'confirmed', complete: 'completed', cancel: 'cancelled', check_in: 'checked_in', no_show: 'no_show' };
      toast(action === 'cancel' ? 'Booking cancelled' : `Booking ${(applied[action] || 'updated').replace('_', ' ').toLowerCase()}`, 'success');
      const nextStatus = applied[action];
      setDetail((d) => (d && String(d.id) === String(b.id) && nextStatus ? { ...d, status: nextStatus } : d));
      reload();
    }
    setBusy(null);
  };

  const exportCsv = () => {
    const rows = [['Ref', 'Customer', 'Email', 'Service', 'Staff', 'Business', 'When', 'Status', 'Price']];
    filtered.forEach((b) => rows.push([b.ref, b.customer_name || '', b.customer_email || '', b.service_name, b.employee_name || '', b.resource_name || '', istDate(b.start_time) + ' ' + istTime(b.start_time), b.status, String(b.price ?? '')]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `velora-appointments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Appointments"
        subtitle="Every booking across all businesses — updated in real time."
        action={<button onClick={exportCsv} className={btnGhost}><Download className="h-4 w-4" /> Export CSV</button>}
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === f ? 'grad-btn text-white' : 'border border-app text-muted hover:border-[var(--border-strong)]'}`}>
            {f.replace('_', ' ')} <span className="opacity-60">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No appointments" sub="Bookings from the customer app (demo or production) appear here instantly." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dim text-xs border-b border-app">
                  <th className="px-4 py-3">Ref</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3 hidden md:table-cell">Business</th><th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{b.ref} {b.local && <DemoBadge />}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.customer_name}</p>
                      <p className="text-xs text-dim">{b.customer_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.service_name}</p>
                      {b.employee_name && <p className="text-xs text-dim">with {b.employee_name}</p>}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted">{b.resource_name}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">{ist(b.start_time, { month: 'short', day: 'numeric' })}, {istTime(b.start_time)}</td>
                    <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-4 py-3 text-right tabular-nums">{inr(b.price)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setDetail(b)} title="View details" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><Eye className="h-3.5 w-3.5" /></button>
                        {isActionable(b.status) && (
                          <>
                            {b.status === 'pending' && <button onClick={() => act(b, 'confirm')} title="Confirm" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-blue-400 hover:border-blue-400/50"><CheckCircle2 className="h-3.5 w-3.5" /></button>}
                            {b.status !== 'pending' && <button onClick={() => act(b, 'check_in')} title="Check in" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-cyan-400 hover:border-cyan-400/50"><LogIn className="h-3.5 w-3.5" /></button>}
                            <button onClick={() => act(b, 'complete')} title="Complete" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-emerald-400 hover:border-emerald-400/50"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                            <button onClick={() => act(b, 'cancel')} title="Cancel" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><X className="h-3.5 w-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Appointment detail — full context + allowed actions */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Appointment details" wide>
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{detail.ref}</span>
                {detail.local && <DemoBadge />}
              </div>
              <StatusBadge status={detail.status} />
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow icon={Mail} label="Customer" value={<span>{detail.customer_name}<span className="block text-xs text-dim">{detail.customer_email}</span></span>} />
              {detail.customer_phone && <InfoRow icon={Phone} label="Phone" value={detail.customer_phone} />}
              <InfoRow icon={Clock} label="When" value={`${istDate(detail.start_time)}, ${istTime(detail.start_time)} — ${istTime(detail.end_time || detail.start_time)}`} />
              <InfoRow icon={Clock} label="Duration" value={`${Math.max(0, Math.round((new Date(detail.end_time || detail.start_time).getTime() - new Date(detail.start_time).getTime()) / 60000))} min`} />
              <InfoRow icon={MapPin} label="Service" value={`${detail.service_name}${detail.employee_name ? ` · ${detail.employee_name}` : ''}`} />
              <InfoRow icon={MapPin} label="Business" value={detail.resource_name} />
              <InfoRow icon={MapPin} label="Location" value={detail.location || '—'} />
              <InfoRow icon={Clock} label="Booked at" value={detail.created_at ? istDateTime(detail.created_at) : '—'} />
              <InfoRow icon={MapPin} label="Price" value={inr(detail.price)} />
              <InfoRow icon={QrCode} label="QR verification" value={detail.qr_payload ? <span className="inline-flex items-center gap-1 text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Secure token issued</span> : <span className="text-dim">Not issued (pre-upgrade booking)</span>} />
            </div>

            {isActionable(detail.status) && (
              <div className="pt-3 border-t border-app">
                <p className="text-xs text-dim mb-2">Actions follow the booking state machine — only valid transitions are offered.</p>
                <div className="flex flex-wrap gap-2">
                  {detail.status === 'pending' && canTransition(detail.status, 'confirmed') && (
                    <button onClick={() => act(detail, 'confirm')} disabled={busy === detail.id} className={btnPrimary + ' px-3 py-2 text-xs'}>Confirm</button>
                  )}
                  {canTransition(detail.status, 'checked_in') && (
                    <button onClick={() => act(detail, 'check_in')} disabled={busy === detail.id} className={btnGhost + ' px-3 py-2 text-xs'}>Check in</button>
                  )}
                  {canTransition(detail.status, 'completed') && (
                    <button onClick={() => act(detail, 'complete')} disabled={busy === detail.id} className={btnGhost + ' px-3 py-2 text-xs'}>Complete</button>
                  )}
                  {canTransition(detail.status, 'cancelled') && (
                    <button onClick={() => act(detail, 'cancel')} disabled={busy === detail.id} className={btnGhost + ' px-3 py-2 text-xs hover:text-red-400 hover:border-red-400/50'}>Cancel</button>
                  )}
                  {detail.customer_email && (
                    <a href={`mailto:${detail.customer_email}?subject=${encodeURIComponent(`Your booking ${detail.ref}`)}`} className={btnGhost + ' px-3 py-2 text-xs'}><Mail className="h-3.5 w-3.5" /> Contact customer</a>
                  )}
                </div>
              </div>
            )}
            <p className="text-[11px] text-dim">Changes appear on the customer's side instantly — no refresh needed.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-app p-3 flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-surface grid place-items-center shrink-0"><Icon className="h-4 w-4 text-dim" /></div>
      <div className="min-w-0">
        <p className="text-[11px] text-dim uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}
