import { useMemo, useState } from 'react';
import { Mail, Phone, CalendarDays, ChevronRight, Star } from 'lucide-react';
import { PageHeader, Spinner, EmptyState, DemoBadge, Modal, StatusBadge, StatCard } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { inr, istDate, istTime } from '../../lib/format';
import { Users, Wallet as WalletIcon, Repeat } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CustomerRecord } from '../../lib/metrics';

export default function AdminCustomers() {
  const { customers, bookings, loading } = useConsoleData();
  const [detail, setDetail] = useState<CustomerRecord | null>(null);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    if (!q.trim()) return customers;
    const s = q.toLowerCase();
    return customers.filter((c) => `${c.name} ${c.email} ${c.phone || ''}`.toLowerCase().includes(s));
  }, [customers, q]);

  const stats = useMemo(() => {
    const totalSpend = customers.reduce((s: number, c) => s + c.totalSpend, 0);
    return {
      total: customers.length,
      vip: customers.filter((c) => c.status === 'vip').length,
      spend: totalSpend,
      avg: customers.length ? Math.round(totalSpend / customers.length) : 0,
    };
  }, [customers]);

  const customerBookings = useMemo(() => {
    if (!detail) return [];
    return bookings
      .filter((b) => (b.customer_email || '').toLowerCase() === detail.email.toLowerCase())
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
  }, [detail, bookings]);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Derived from real booking records — one source of truth with the dashboard."
        action={
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone…"
            className="rounded-xl bg-elev border border-app px-4 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)] w-56 sm:w-72 transition-colors" />
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total customers" value={stats.total} icon={Users} color="#f472b6" />
        <StatCard label="VIP customers" value={stats.vip} icon={Star} color="#fbbf24" delay={0.05} />
        <StatCard label="Lifetime value" value={inr(stats.spend)} icon={WalletIcon} color="#34d399" delay={0.1} />
        <StatCard label="Avg spend" value={inr(stats.avg)} icon={Repeat} color="#60a5fa" delay={0.15} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No customers yet" sub="Customers appear here from their first booking — including demo bookings." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-dim text-xs border-b border-app">
                  <th className="px-4 py-3">Customer</th><th className="px-4 py-3 hidden md:table-cell">Contact</th>
                  <th className="px-4 py-3">Bookings</th><th className="px-4 py-3">Completed</th>
                  <th className="px-4 py-3">Total spend</th><th className="px-4 py-3 hidden lg:table-cell">Last booking</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Next</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)] transition-colors cursor-pointer" onClick={() => setDetail(c)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-full grad-btn grid place-items-center text-white text-xs font-semibold shrink-0">
                          {c.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.name}</p>
                          <p className="text-xs text-dim truncate">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted">
                      {c.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.totalBookings}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-400">{c.completedBookings}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{inr(c.totalSpend)}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted whitespace-nowrap">{c.lastBooking ? istDate(c.lastBooking) : '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted whitespace-nowrap">{c.nextAppointment ? `${istDate(c.nextAppointment)}, ${istTime(c.nextAppointment)}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg capitalize ${c.status === 'vip' ? 'bg-amber-500/15 text-amber-400' : c.status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface text-dim'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-dim" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer profile */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="Customer profile" wide>
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl grad-btn grid place-items-center text-white font-semibold shrink-0">
                {detail.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold truncate">{detail.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim mt-0.5">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{detail.email}</span>
                  {detail.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{detail.phone}</span>}
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Since {istDate(detail.createdAt)}</span>
                </div>
              </div>
              <span className={`ml-auto text-[11px] px-2 py-1 rounded-lg capitalize shrink-0 ${detail.status === 'vip' ? 'bg-amber-500/15 text-amber-400' : 'bg-surface text-dim'}`}>{detail.status}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat label="Total bookings" value={detail.totalBookings} />
              <MiniStat label="Completed" value={detail.completedBookings} />
              <MiniStat label="Cancelled" value={detail.cancelledBookings} />
              <MiniStat label="Total spend" value={inr(detail.totalSpend)} />
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Booking history</p>
              {customerBookings.length === 0 ? (
                <p className="text-sm text-dim">No bookings recorded.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {customerBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border border-app p-3">
                      <div className="h-9 w-9 rounded-lg grad-btn grid place-items-center text-white text-[10px] font-semibold shrink-0">
                        {istDate(b.start_time).slice(0, 6)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{b.service_name} · {b.resource_name}</p>
                        <p className="text-xs text-dim">{istDate(b.start_time)}, {istTime(b.start_time)} · {b.ref} {b.local && <DemoBadge />}</p>
                      </div>
                      <StatusBadge status={b.status} />
                      <span className="text-sm font-medium tabular-nums">{inr(b.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {detail.nextAppointment && (
              <p className="text-xs text-dim">Next appointment: {istDate(detail.nextAppointment)}, {istTime(detail.nextAppointment)}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-app p-3">
      <p className="text-[11px] text-dim uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
