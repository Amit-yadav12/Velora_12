import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  IndianRupee, Users, UserCog, Sparkles, Star, Clock, TrendingUp,
  CheckCircle2, XCircle, ArrowUpRight, Activity, CalendarClock,
} from 'lucide-react';
import { PageHeader, Spinner, StatusBadge, EmptyState, StatCard, btnGhost, btnPrimary, DemoBadge, Modal } from '../../components/ui';
import { useConsoleData } from '../../lib/useConsoleData';
import { revenueMetrics } from '../../lib/metrics';
import { useLocation } from '../../contexts/LocationContext';
import { inr, ist, istTime, istDate } from '../../lib/format';
import { applyBookingAction } from '../../services/consoleActions';
import { getSyntheticReviews } from '../../lib/synthetic';
import { resetDemo } from '../../lib/demoStore';
import { toast } from '../../services/events';
import { isActionable } from '../../lib/bookingStatus';

export default function AdminDashboard() {
  const { city } = useLocation();
  const { bookings, businesses, services, staff, customers, loading, reload } = useConsoleData(city.name);
  const [resetOpen, setResetOpen] = useState(false);
  const [busy, setBusy] = useState<string | number | null>(null);

  // ---- Every number on this page is DERIVED from the shared dataset ----
  const m = useMemo(() => revenueMetrics(bookings), [bookings]);
  const activeServices = useMemo(() => services.filter((s: any) => s.active !== false), [services]);
  const activeStaff = useMemo(() => staff.filter((s: any) => s.active !== false), [staff]);
  const reviews = useMemo(() => {
    const list = businesses.filter((b: any) => b.review_count > 0);
    const total = list.reduce((s: number, b: any) => s + Number(b.review_count || 0), 0);
    const avg = list.length ? list.reduce((s: number, b: any) => s + Number(b.rating || 0) * Number(b.review_count || 0), 0) / (total || 1) : 0;
    return { total, avg: Math.round(avg * 10) / 10 };
  }, [businesses]);

  const upcoming = useMemo(
    // "Upcoming" is relative to render time on purpose — recomputes whenever
    // the dataset changes (real-time updates).
    () => bookings
      // eslint-disable-next-line react-hooks/purity
      .filter((b: any) => isActionable(b.status) && new Date(b.start_time).getTime() > Date.now())
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 8),
    [bookings],
  );
  const latest = useMemo(
    () => [...bookings].sort((a: any, b: any) => new Date(b.created_at || b.start_time).getTime() - new Date(a.created_at || a.start_time).getTime()).slice(0, 6),
    [bookings],
  );

  const act = async (b: any, action: any) => {
    setBusy(b.id);
    const ok = await applyBookingAction(b, action);
    if (ok) {
      toast(action === 'cancel' ? 'Booking cancelled' : `Booking ${action === 'confirm' ? 'confirmed' : action === 'complete' ? 'completed' : 'updated'}`, 'success');
      reload();
    }
    setBusy(null);
  };

  // Service popularity — derived from the same booking dataset.
  const topServices = useMemo(() => {
    const counts = new Map<string, { n: number; revenue: number }>();
    for (const b of bookings) {
      if (b.status === 'cancelled' || b.status === 'no_show') continue;
      const k = b.service_name || '—';
      const cur = counts.get(k) || { n: 0, revenue: 0 };
      counts.set(k, { n: cur.n + 1, revenue: cur.revenue + (Number(b.price) || 0) });
    }
    return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  }, [bookings]);

  const recentReviews = useMemo(() => {
    // Deterministic demo reviews for the demo businesses (same generator the
    // customer profile uses — one source of truth).
    const rows: any[] = [];
    for (const b of businesses.filter((x: any) => x.demo).slice(0, 2)) {
      try {
        getSyntheticReviews(b.id, 2).forEach((r: any) => rows.push({ ...r, biz: b.name }));
      } catch { /* non-fatal */ }
    }
    return rows.slice(0, 4);
  }, [businesses]);

  const doReset = () => {
    resetDemo();
    setResetOpen(false);
    toast('Demo data restored to a clean state', 'success');
    reload();
  };

  if (loading) return <Spinner />;

  const cards = [
    { label: 'Total sales', value: m.salesCount, icon: TrendingUp, color: '#60a5fa', sub: `${m.completedCount} completed` },
    { label: 'Total revenue', value: inr(m.totalRevenue), icon: IndianRupee, color: '#34d399', sub: `Avg ${inr(m.avgValue)}/booking` },
    { label: 'Upcoming appointments', value: m.upcomingCount, icon: CalendarClock, color: '#818cf8', sub: `${inr(m.upcomingRevenue)} booked` },
    { label: "Today's appointments", value: m.todayCount, icon: Clock, color: '#f59e0b', sub: `${inr(m.todayRevenue)} today` },
    { label: 'Total customers', value: customers.length, icon: Users, color: '#f472b6', sub: `${customers.filter((c: any) => c.status === 'vip').length} VIP` },
    { label: 'Active staff', value: activeStaff.length, icon: UserCog, color: '#22d3ee', sub: `${staff.length} total` },
    { label: 'Active services', value: activeServices.length, icon: Sparkles, color: '#a78bfa', sub: `${services.length} total` },
    { label: 'Reviews', value: reviews.total, icon: Star, color: '#fbbf24', sub: reviews.avg ? `${reviews.avg} avg rating` : 'No reviews yet' },
  ];

  const revenueRows: [string, string, string][] = [
    ['Completed revenue', inr(m.completedRevenue), `${m.completedCount} bookings`],
    ['Upcoming revenue', inr(m.upcomingRevenue), `${m.upcomingCount} appointments`],
    ["Today's revenue", inr(m.todayRevenue), `${m.todayCount} today`],
    ['Last 7 days', inr(m.weekRevenue), 'non-cancelled'],
    ['This month', inr(m.monthRevenue), 'non-cancelled'],
    ['Average booking value', inr(m.avgValue), `${m.salesCount} sales`],
    ['Cancelled', inr(m.cancelledValue), `${m.cancelledCount} bookings`],
  ];

  return (
    <div>
      <PageHeader
        title={`Dashboard · ${city.name}`}
        subtitle="Live operating picture — every number is calculated from real bookings."
        action={
          <button onClick={() => setResetOpen(true)} className={btnGhost}>
            <Activity className="h-4 w-4" /> Reset demo
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-dim">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> Live · real-time sync</span>
        <DemoBadge label="Demo tenant active — isolated from production" />
      </div>

      {/* Metric cards — derived, never hardcoded */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c, i) => <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} color={c.color} sub={c.sub} delay={i * 0.04} />)}
      </div>

      <div className="grid lg:grid-cols-5 gap-6 mb-6">
        {/* Revenue model */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Sales &amp; revenue</h2>
            <span className="text-xs text-dim">one consistent model</span>
          </div>
          <div className="space-y-1">
            {revenueRows.map(([label, value, sub]) => (
              <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2.5 hover:bg-[var(--surface-hover)] transition-colors">
                <div>
                  <p className="text-sm">{label}</p>
                  <p className="text-[11px] text-dim">{sub}</p>
                </div>
                <span className={`font-semibold tabular-nums ${label === 'Cancelled' ? 'text-red-400' : ''}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming appointments with actions */}
        <div className="card p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Upcoming appointments</h2>
            <span className="text-xs text-dim">{m.upcomingCount} total</span>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState title="No upcoming appointments" sub="New bookings appear here instantly — no refresh needed." />
          ) : (
            <div className="space-y-2">
              {upcoming.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-app p-3 hover:border-[var(--border-strong)] transition-colors">
                  <div className="h-10 w-10 rounded-xl grad-btn grid place-items-center text-white text-xs font-semibold shrink-0">
                    {ist(b.start_time, { day: 'numeric' })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.customer_name} · <span className="font-normal">{b.service_name}</span></p>
                    <p className="text-xs text-dim truncate">{b.resource_name} · {istDate(b.start_time)}, {istTime(b.start_time)} · {b.ref}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 hidden sm:block">{inr(b.price)}</span>
                  <StatusBadge status={b.status} />
                  {busy === b.id ? (
                    <span className="h-7 w-7 grid place-items-center"><span className="h-4 w-4 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></span>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      {b.status === 'pending' && (
                        <button onClick={() => act(b, 'confirm')} title="Confirm" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-blue-400 hover:border-blue-400/50"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                      )}
                      {b.status !== 'pending' && (
                        <button onClick={() => act(b, 'complete')} title="Complete" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-emerald-400 hover:border-emerald-400/50"><CheckCircle2 className="h-3.5 w-3.5" /></button>
                      )}
                      <button onClick={() => act(b, 'cancel')} title="Cancel" className="h-7 w-7 grid place-items-center rounded-lg border border-app hover:text-red-400 hover:border-red-400/50"><XCircle className="h-3.5 w-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Latest bookings */}
        <div className="card p-6 lg:col-span-3">
          <h2 className="font-semibold mb-4">Latest bookings</h2>
          {latest.length === 0 ? (
            <EmptyState title="No bookings yet" sub="Try the demo customer app — book something and watch it appear here live." />
          ) : (
            <div className="space-y-2">
              {latest.map((b: any) => (
                <div key={b.id} className="flex items-center gap-4 rounded-xl border border-app p-3">
                  <div className="h-10 w-10 rounded-xl grad-btn grid place-items-center text-white text-xs font-semibold shrink-0">{ist(b.start_time, { day: 'numeric' })}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{b.service_name} · {b.resource_name}</p>
                    <p className="text-xs text-dim truncate">{b.customer_name} · {ist(b.start_time, { weekday: 'short', day: 'numeric', month: 'short' })}, {istTime(b.start_time)} · {b.ref}{b.local ? ' · demo' : ''}</p>
                  </div>
                  <StatusBadge status={b.status} />
                  <span className="text-sm font-medium tabular-nums">{inr(b.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Analytics */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-semibold mb-4">Performance</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-dim">Completion rate</span><span className="font-semibold tabular-nums">{Math.round(m.completionRate * 100)}%</span></div>
              <div className="h-2 rounded-full bg-surface overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(m.completionRate * 100)}%` }} className="h-full grad-btn rounded-full" /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-dim">Cancellation rate</span><span className="font-semibold tabular-nums text-red-400">{Math.round(m.cancellationRate * 100)}%</span></div>
              <div className="h-2 rounded-full bg-surface overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.round(m.cancellationRate * 100)}%` }} className="h-full bg-red-500 rounded-full" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border border-app p-3"><p className="text-xs text-dim">Businesses</p><p className="text-lg font-semibold">{businesses.length}</p></div>
              <div className="rounded-xl border border-app p-3"><p className="text-xs text-dim">Active now</p><p className="text-lg font-semibold">{businesses.filter((b: any) => b.active !== false).length}</p></div>
              <div className="rounded-xl border border-app p-3"><p className="text-xs text-dim">Sales this week</p><p className="text-lg font-semibold">{m.weekCount}</p></div>
              <div className="rounded-xl border border-app p-3"><p className="text-xs text-dim">Avg value</p><p className="text-lg font-semibold">{inr(m.avgValue)}</p></div>
            </div>
            {topServices.length > 0 && (
              <div className="pt-4 mt-4 border-t border-app">
                <p className="text-xs text-dim uppercase tracking-wide mb-2">Top services</p>
                <div className="space-y-1.5">
                  {topServices.map(([name, st]: any) => (
                    <div key={name} className="flex items-center justify-between text-sm">
                      <span className="truncate mr-3">{name}</span>
                      <span className="text-dim shrink-0 text-xs">{st.n}× · {inr(st.revenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reviews — derived from business records (same data customers see) */}
      {recentReviews.length > 0 && (
        <div className="card p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent reviews</h2>
            <span className="text-xs text-dim inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {reviews.avg} avg · {reviews.total} reviews</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recentReviews.map((r: any, i: number) => (
              <div key={i} className="rounded-xl border border-app p-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="h-7 w-7 rounded-full grad-btn grid place-items-center text-white text-[10px] font-semibold shrink-0">{r.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{r.name}</p>
                    <p className="text-[10px] text-dim truncate">{r.biz}</p>
                  </div>
                  <span className="inline-flex items-center gap-0.5 text-xs shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{r.rating}</span>
                </div>
                <p className="text-xs text-muted line-clamp-2">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reset demo — demo tenant only, production data is never touched */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset demo data">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Restores the clean demo state: showcase businesses, services and staff are restored, and all demo bookings, invoices and notifications are cleared.
          </p>
          <p className="text-xs text-dim rounded-xl border border-app p-3">
            This only affects the isolated demo tenant (<code>demo-tenant-velora</code>). Production data is never modified.
          </p>
          <div className="flex gap-2.5">
            <button onClick={() => setResetOpen(false)} className={btnGhost + ' flex-1'}>Keep current data</button>
            <button onClick={doReset} className={btnPrimary + ' flex-1'}><ArrowUpRight className="h-4 w-4" /> Reset demo</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
