import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, CheckCircle2, X, Eye, Mail, Phone, MapPin, Clock, QrCode, ShieldCheck, ScanLine, BellRing } from 'lucide-react';
import { PageHeader, Spinner, ConsoleUnavailable, EmptyState, StatusBadge, DemoBadge, Modal, btnGhost, btnPrimary } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { applyBookingAction } from '../../services/consoleActions';
import { toast } from '../../services/events';
import CheckInDialog from '../../components/console/CheckInDialog';
import { ist, istTime, istDate, istDateTime } from '../../lib/format';
import { inr } from '../../lib/format';
import { canTransition, isActionable } from '../../lib/bookingStatus';
import type { ConsoleAction } from '../../services/consoleActions';
import type { ConsoleBooking } from '../../lib/types';
import { ticketUrlForRef } from '../../lib/demoJourney';
import { isDemoMode } from '../../lib/supabase';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** "just now" / "4 min ago" — makes the sample booking's live arrival legible. */
function receivedLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'just now';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return istDate(iso);
}

export default function AdminAppointments() {
  const { bookings, scopeBusiness, setScope, loading, error, reload } = useConsoleData();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<number | string | null>(null);
  const [detail, setDetail] = useState<ConsoleBooking | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [prefilledTicket, setPrefilledTicket] = useState<string>('');
  const [params, setParams] = useSearchParams();
  const focusRef = params.get('focus') || '';
  const autoCheckIn = params.get('checkin') === '1';
  const pinnedRef = useRef<HTMLDivElement>(null);
  const focused = focusRef ? bookings.find((b) => String(b.ref).toLowerCase() === focusRef.toLowerCase()) : undefined;
  // The newest request waiting for this business — the one the presenter just
  // submitted in the customer app.
  const awaiting = useMemo(
    () => [...bookings].filter((b) => b.status === 'pending').sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0],
    [bookings],
  );
  const spotlight = focused || awaiting;

  const openCheckIn = (booking: ConsoleBooking) => {
    setPrefilledTicket(ticketUrlForRef(booking.ref) || '');
    setCheckInOpen(true);
  };

  // ?focus=<ref>&checkin=1 — used by the demo guide so a presenter lands on the
  // exact booking and can open its ticket without hunting through the table.
  useEffect(() => {
    if (!focusRef || loading) return;
    const target = pinnedRef.current;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (autoCheckIn && focused && focused.status === 'confirmed') openCheckIn(focused);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once per navigation
  }, [focusRef, autoCheckIn, loading, focused?.status]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings.length, pending: 0, confirmed: 0, checked_in: 0, completed: 0, cancelled: 0 };
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
  if (error) return <ConsoleUnavailable retry={reload} />;

  return (
    <div>
      <PageHeader
        eyebrow={isDemoMode ? 'Demo business console · sample data' : undefined}
        title="Appointments"
        subtitle="Appointments for your authorized businesses."
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setPrefilledTicket(''); setCheckInOpen(true); }} className={btnPrimary} data-console-action="verify-ticket"><ScanLine className="h-4 w-4" aria-hidden="true" /> Verify ticket</button>
            <button onClick={exportCsv} className={btnGhost}><Download className="h-4 w-4" /> Export CSV</button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {['all', 'pending', 'confirmed', 'checked_in', 'completed', 'cancelled'].map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors ${filter === f ? 'grad-btn text-white' : 'border border-app text-muted hover:border-[var(--border-strong)]'}`}>
            {f.replace('_', ' ')} <span className="opacity-60">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {scopeBusiness && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-app bg-[var(--surface)] px-3 py-2 text-xs text-muted">
          <span className="font-medium text-[var(--text)]">Viewing {scopeBusiness.name}</span>
          <span className="text-dim">· only bookings for this business id are loaded</span>
          <button onClick={() => setScope(null)} className="ml-auto rounded-lg border border-app px-2 py-1 text-[11px] hover:border-[var(--border-strong)]">Show all</button>
        </div>
      )}

      {spotlight && (
        <div
          ref={pinnedRef}
          data-spotlight-ref={spotlight.ref}
          className="card mb-4 scroll-mt-24 overflow-hidden border-[var(--color-brand-indigo)]/40"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-app bg-[var(--color-brand-indigo)]/[0.08] px-4 py-2">
            <BellRing className="h-3.5 w-3.5 text-[var(--text-link-strong)]" aria-hidden="true" />
            <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--text-link-strong)]">
              {spotlight.status === 'pending' ? 'New sample request' : 'Latest sample booking'}
            </p>
            {spotlight.local && <DemoBadge />}
            <span className="font-mono text-[11px] text-muted">{spotlight.ref}</span>
            <StatusBadge status={spotlight.status} />
            {spotlight.created_at && (
              <span className="text-[11px] text-dim" data-received-at>
                received {receivedLabel(spotlight.created_at)}
              </span>
            )}
            {focusRef && <button onClick={() => setParams({}, { replace: true })} className="ml-auto text-[11px] text-dim underline underline-offset-2 hover:text-[var(--text)]">Clear focus</button>}
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight">{spotlight.service_name}</p>
              <p className="mt-0.5 text-sm text-muted">{spotlight.customer_name}{spotlight.customer_email ? ` · ${spotlight.customer_email}` : ''}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" />{istDate(spotlight.start_time)} · {istTime(spotlight.start_time)} IST</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{spotlight.resource_name}</span>
                <span className="font-medium text-[var(--text)] tabular-nums">{inr(spotlight.price)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {spotlight.status === 'pending' && canTransition('pending', 'confirmed') && (
                <button
                  onClick={() => act(spotlight, 'confirm')}
                  disabled={busy === spotlight.id}
                  className={btnPrimary + ' min-h-11'}
                  data-console-action="confirm-spotlight"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Confirm booking
                </button>
              )}
              {canTransition(spotlight.status, 'checked_in') && (
                <button onClick={() => openCheckIn(spotlight)} className={btnPrimary + ' min-h-11'} data-console-action="checkin-spotlight">
                  <ScanLine className="h-4 w-4" aria-hidden="true" /> Check in with ticket
                </button>
              )}
              <button onClick={() => setDetail(spotlight)} className={btnGhost + ' min-h-11'}>
                <Eye className="h-4 w-4" aria-hidden="true" /> Details
              </button>
            </div>
          </div>
          {spotlight.status === 'pending' && (
            <p className="border-t border-app px-4 py-2 text-[11px] text-dim">
              Confirm first — check-in is only allowed for confirmed appointments, and a ticket is verified before the guest is marked checked in.
            </p>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        scopeBusiness ? (
          <EmptyState
            title={`No appointments for ${scopeBusiness.name}`}
            sub="This console is scoped to one business, exactly like a live tenant: bookings addressed to another business id never appear here."
            action={<button onClick={() => setScope(null)} className={btnGhost + ' min-h-11'}>Show all businesses</button>}
          />
        ) : (
          <EmptyState title="No appointments" sub="Bookings from the customer app (demo or production) appear here instantly." />
        )
      ) : (
        <>
        {/* Phones: a card list — a 8-column table cannot be read at 375px. */}
        <div className="space-y-2 md:hidden">
          {filtered.map((b) => (
            <div key={`m-${b.id}`} data-booking-ref={b.ref} className={`card p-3 ${focusRef && String(b.ref).toLowerCase() === focusRef.toLowerCase() ? 'ring-2 ring-[var(--color-brand-indigo)]' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-tight">{b.service_name}</p>
                  <p className="truncate text-xs text-dim">{b.customer_name}{b.customer_email ? ` · ${b.customer_email}` : ''}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-dim">
                <span>{ist(b.start_time, { month: 'short', day: 'numeric' })}, {istTime(b.start_time)}</span>
                <span className="font-mono">{b.ref}</span>
                <span className="font-medium text-[var(--text)] tabular-nums">{inr(b.price)}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button onClick={() => setDetail(b)} className="inline-flex items-center gap-1 rounded-lg border border-app px-2.5 py-1.5 text-xs hover:border-[var(--border-strong)]"><Eye className="h-3.5 w-3.5" aria-hidden="true" /> Details</button>
                {isActionable(b.status) && b.status === 'pending' && (
                  <button onClick={() => act(b, 'confirm')} disabled={busy === b.id} className="inline-flex items-center gap-1 rounded-lg border border-app px-2.5 py-1.5 text-xs hover:border-blue-400/50 hover:text-blue-300 disabled:opacity-60"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Confirm</button>
                )}
                {isActionable(b.status) && b.status !== 'pending' && canTransition(b.status, 'checked_in') && (
                  <button onClick={() => openCheckIn(b)} className="inline-flex items-center gap-1 rounded-lg border border-app px-2.5 py-1.5 text-xs hover:border-cyan-400/50 hover:text-cyan-300"><ScanLine className="h-3.5 w-3.5" aria-hidden="true" /> Check in</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="card hidden overflow-hidden md:block">
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
                  <tr key={b.id} data-booking-ref={b.ref} className={`border-b border-app last:border-0 hover:bg-[var(--surface-hover)] transition-colors ${focusRef && String(b.ref).toLowerCase() === focusRef.toLowerCase() ? 'bg-[var(--color-brand-indigo)]/[0.08]' : ''}`}>
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
                        <button onClick={() => setDetail(b)} title="View details" aria-label={`View details for ${b.ref}`} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)]"><Eye className="h-3.5 w-3.5" aria-hidden="true" /></button>
                        {isActionable(b.status) && (
                          <>
                            {b.status === 'pending' && <button onClick={() => act(b, 'confirm')} title="Confirm" aria-label={`Confirm booking ${b.ref}`} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:text-blue-300 hover:border-blue-400/50"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                            {b.status !== 'pending' && canTransition(b.status, 'checked_in') && <button onClick={() => openCheckIn(b)} title="Check in with this ticket" aria-label={`Check in booking ${b.ref} with its ticket`} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:text-cyan-300 hover:border-cyan-400/50"><ScanLine className="h-3.5 w-3.5" aria-hidden="true" /></button>}
                            <button onClick={() => act(b, 'complete')} title="Complete" aria-label={`Mark booking ${b.ref} complete`} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:text-emerald-300 hover:border-emerald-400/50"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            <button onClick={() => act(b, 'cancel')} title="Cancel" aria-label={`Cancel booking ${b.ref}`} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:text-red-300 hover:border-red-400/50"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
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
        </>
      )}

      {/* Door check-in — its own dialog, never nested inside another modal */}
      <CheckInDialog
        open={checkInOpen}
        initialTicket={prefilledTicket}
        onClose={() => { setCheckInOpen(false); setPrefilledTicket(''); }}
        bookings={bookings}
        onCheckedIn={() => { reload(); setFilter('checked_in'); }}
        onOpenBooking={(b) => { setCheckInOpen(false); setDetail(b); }}
      />

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
                    <button onClick={() => { setDetail(null); openCheckIn(detail); }} className={btnPrimary + ' px-3 py-2 text-xs'}><ScanLine className="h-3.5 w-3.5" aria-hidden="true" /> Verify ticket &amp; check in</button>
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
            <p className="text-[11px] text-dim">Changes are saved to the booking; notifications depend on delivery configuration.</p>
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
