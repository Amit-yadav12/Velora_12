// Velora metrics — the ONE revenue & growth calculation model.
// Every dashboard number is DERIVED from the merged booking dataset
// (server rows + demo tenant bookings). There are no stored counters to
// drift out of sync: change a booking → every metric recomputes correctly.
//
// Model (consistent across the whole product):
//   • A booking counts toward revenue/sales when its status is
//     pending | confirmed | checked_in | in_progress | completed
//     (cancelled & no_show NEVER contribute — a booking is counted once, ever).
//   • completedRevenue is the realised subset; upcomingRevenue is the
//     not-yet-delivered subset. completed + upcoming = totalRevenue.

import { REVENUE_STATUSES, type BookingStatus } from './bookingStatus';

export interface BookingLike {
  id: number | string;
  ref: string;
  status: string;
  price?: number | string | null;
  start_time: string;
  end_time?: string | null;
  created_at?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string | null;
  name?: string;
  email?: string;
  phone?: string | null;
}

export interface RevenueMetrics {
  salesCount: number;          // non-cancelled bookings (each = one sale)
  totalRevenue: number;        // value of all non-cancelled bookings
  avgValue: number;            // totalRevenue / salesCount
  completedRevenue: number;    // realised
  upcomingRevenue: number;     // booked, not yet delivered
  todayRevenue: number;
  weekRevenue: number;         // last 7 days
  monthRevenue: number;        // current calendar month
  cancelledCount: number;
  cancelledValue: number;
  upcomingCount: number;       // future non-cancelled appointments
  todayCount: number;          // appointments starting today
  weekCount: number;           // non-cancelled bookings starting in the last 7 days
  totalCount: number;
  completedCount: number;
  completionRate: number;      // 0..1
  cancellationRate: number;    // 0..1
}

function counts(b: BookingLike): boolean {
  return REVENUE_STATUSES.includes(b.status as BookingStatus);
}

const num = (v: unknown) => Number(v) || 0;

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function revenueMetrics(bookings: BookingLike[], now = new Date()): RevenueMetrics {
  const total = bookings.length;
  const active = bookings.filter(counts);
  const completed = bookings.filter((b) => b.status === 'completed');
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  const notDelivered = active.filter((b) => b.status !== 'completed');

  const sum = (list: BookingLike[]) => list.reduce((s, b) => s + num(b.price), 0);
  const nowMs = now.getTime();
  const todayStart = startOfDay(now);
  const weekStart = nowMs - 7 * 86400000;
  const monthStart = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));

  const today = active.filter((b) => {
    const t = new Date(b.start_time).getTime();
    return t >= todayStart && t < todayStart + 86400000;
  });
  const week = active.filter((b) => new Date(b.start_time).getTime() >= weekStart);
  const month = active.filter((b) => new Date(b.start_time).getTime() >= monthStart);
  const upcomingList = notDelivered.filter((b) => new Date(b.start_time).getTime() > nowMs);

  return {
    salesCount: active.length,
    totalRevenue: sum(active),
    avgValue: active.length ? Math.round(sum(active) / active.length) : 0,
    completedRevenue: sum(completed),
    upcomingRevenue: sum(upcomingList),
    todayRevenue: sum(today),
    weekRevenue: sum(week),
    monthRevenue: sum(month),
    cancelledCount: cancelled.length,
    cancelledValue: sum(cancelled),
    upcomingCount: upcomingList.length,
    todayCount: today.length,
    weekCount: week.length,
    totalCount: total,
    completedCount: completed.length,
    completionRate: total ? completed.length / total : 0,
    cancellationRate: total ? cancelled.length / total : 0,
  };
}

export interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone?: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  upcomingBookings: number;
  totalSpend: number;          // non-cancelled booking value
  lastBooking: string | null;
  nextAppointment: string | null;
  createdAt: string;
  status: 'new' | 'active' | 'vip';
}

/**
 * Derives the customer book from booking records (single source of truth —
 * the same bookings the dashboard revenue comes from) plus any explicit
 * customer profiles. Nothing is double-counted.
 */
export function deriveCustomers(
  bookings: BookingLike[],
  explicit: { id: string | number; email: string; full_name?: string; name?: string; phone?: string; created_at?: string }[] = [],
  now = new Date(),
): CustomerRecord[] {
  const byEmail = new Map<string, CustomerRecord>();
  const key = (e: string) => (e || '').toLowerCase().trim();

  const ensure = (email: string, name?: string, phone?: string, created?: string): CustomerRecord => {
    const k = key(email);
    let rec = byEmail.get(k);
    if (!rec) {
      rec = {
        id: k || 'unknown', email: email || '—', name: name || email?.split('@')[0] || 'Guest', phone: phone || '',
        totalBookings: 0, completedBookings: 0, cancelledBookings: 0, upcomingBookings: 0,
        totalSpend: 0, lastBooking: null, nextAppointment: null,
        createdAt: created || new Date().toISOString(), status: 'new',
      };
      byEmail.set(k, rec);
    }
    if (name && (rec.name === rec.email?.split('@')[0] || !rec.name)) rec.name = name;
    if (phone && !rec.phone) rec.phone = phone;
    return rec;
  };

  for (const c of explicit) ensure(c.email, c.full_name || c.name, c.phone, c.created_at);

  const nowMs = now.getTime();
  for (const b of bookings) {
    const email = key(b.customer_email || b.email || '');
    if (!email) continue;
    const rec = ensure(email, b.customer_name || b.name, b.customer_phone || b.phone || undefined, b.created_at);
    rec.totalBookings += 1;
    const t = new Date(b.start_time).getTime();
    if (b.status === 'completed') rec.completedBookings += 1;
    if (b.status === 'cancelled') rec.cancelledBookings += 1;
    if (counts(b)) {
      rec.totalSpend += num(b.price);
      if (t > nowMs) rec.upcomingBookings += 1;
    }
    if (!rec.lastBooking || new Date(b.created_at || b.start_time) > new Date(rec.lastBooking)) {
      rec.lastBooking = b.created_at || b.start_time;
    }
    const startT = new Date(b.start_time).toISOString();
    if (t > nowMs && b.status !== 'cancelled') {
      if (!rec.nextAppointment || new Date(startT) < new Date(rec.nextAppointment)) rec.nextAppointment = startT;
    }
  }

  const list = [...byEmail.values()];
  for (const c of list) {
    c.status = c.totalSpend >= 5000 || c.totalBookings >= 5 ? 'vip' : c.totalBookings > 1 ? 'active' : 'new';
  }
  return list.sort((a, b) => (b.lastBooking || '').localeCompare(a.lastBooking || ''));
}
