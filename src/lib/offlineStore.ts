// Velora offline/demo store — bookings, invoices and notifications persisted
// locally so the synthetic demo experience never breaks, even when the API or
// Supabase is unreachable. Merged with server data wherever it exists.

import { emitBookingsChanged, emitNotifsChanged } from '../services/events';
import { canTransition } from './bookingStatus';

export interface LocalBooking {
  id: number | string;
  ref: string;
  business_id: number | string;
  business_name: string;
  service_id?: number | string | null;
  service_name: string;
  staff_name?: string | null;
  staff_id?: number | string | null;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  city?: string;
  location?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  qr_salt?: string;
  created_at: string;
  local: true;
}

export interface LocalInvoice {
  id: string;
  number: string;
  booking_ref: string;
  customer_name: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  created_at: string;
}

export interface LocalNotification {
  id: string;
  audience: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  booking_ref?: string | null;
  created_at: string;
  local: true;
}

const B_KEY = 'velora-local-bookings';
const I_KEY = 'velora-local-invoices';
const N_KEY = 'velora-local-notifs';

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(key: string, arr: any[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 100)));
  } catch { /* non-fatal */ }
  // Instant same-browser sync (tabs, dashboards, badges, toasts).
  try {
    if (key === N_KEY) emitNotifsChanged();
    else emitBookingsChanged();
  } catch { /* non-DOM env */ }
}

export function listLocalBookings(email?: string | null): LocalBooking[] {
  const all = read<LocalBooking>(B_KEY);
  if (!email) return all;
  const e = email.toLowerCase();
  return all.filter((b) => !b.customer_email || b.customer_email.toLowerCase() === e);
}

export function saveLocalBooking(b: Omit<LocalBooking, 'local' | 'created_at'> & { created_at?: string }): LocalBooking {
  const full: LocalBooking = { ...b, local: true, created_at: b.created_at || new Date().toISOString() };
  const cur = read<LocalBooking>(B_KEY).filter((x) => String(x.id) !== String(full.id) && x.ref !== full.ref);
  cur.unshift(full);
  write(B_KEY, cur);
  return full;
}

export function updateLocalBooking(id: number | string, patch: Partial<LocalBooking>): void {
  const cur = read<LocalBooking>(B_KEY).map((b) => (String(b.id) === String(id) ? { ...b, ...patch } : b));
  write(B_KEY, cur);
}

/**
 * Status change for a local booking, validated against the shared state
 * machine (see bookingStatus.ts). Nonsensical transitions are rejected —
 * returns the applied status, or null when the transition is not allowed.
 */
export function transitionLocalBooking(id: number | string, to: string): string | null {
  const cur = read<LocalBooking>(B_KEY);
  const target = cur.find((b) => String(b.id) === String(id));
  if (!target) return null;
  if (!canTransition(target.status, to)) return null;
  const next = cur.map((b) => (String(b.id) === String(id) ? { ...b, status: to } : b));
  write(B_KEY, next);
  return to;
}

export function listLocalInvoices(): LocalInvoice[] {
  return read<LocalInvoice>(I_KEY);
}

export function saveLocalInvoice(inv: Omit<LocalInvoice, 'created_at'> & { created_at?: string }): LocalInvoice {
  const full: LocalInvoice = { ...inv, created_at: inv.created_at || new Date().toISOString() };
  const cur = read<LocalInvoice>(I_KEY).filter((x) => x.number !== full.number);
  cur.unshift(full);
  write(I_KEY, cur);
  return full;
}

export function listLocalNotifications(): LocalNotification[] {
  return read<LocalNotification>(N_KEY);
}

export function pushLocalNotification(n: Omit<LocalNotification, 'id' | 'created_at' | 'local'> & { id?: string }): LocalNotification {
  const full: LocalNotification = {
    ...n,
    id: n.id || `ln-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    created_at: new Date().toISOString(),
    local: true,
  };
  const cur = read<LocalNotification>(N_KEY);
  cur.unshift(full);
  write(N_KEY, cur.slice(0, 60));
  return full;
}

export function markLocalNotificationRead(id: string): void {
  const cur = read<LocalNotification>(N_KEY).map((n) => (String(n.id) === String(id) ? { ...n, read: true } : n));
  write(N_KEY, cur);
}

/** Mark every local notification as read (used by the business console). */
export function markAllLocalNotificationsRead(audience?: string): void {
  const cur = read<LocalNotification>(N_KEY).map((n) =>
    !n.read && (!audience || n.audience === audience) ? { ...n, read: true } : n,
  );
  write(N_KEY, cur);
}

export function listLocalNotificationsFor(audience: string): LocalNotification[] {
  return read<LocalNotification>(N_KEY).filter((n) => n.audience === audience);
}

/** Seed a couple of demo notifications per city so Alerts never feels empty. */
export function seedCityNotifications(city: string): LocalNotification[] {
  const existing = listLocalNotifications();
  const hasCity = existing.some((n) => n.body.includes(city));
  if (hasCity) return existing;
  const seeds: Omit<LocalNotification, 'id' | 'created_at' | 'local'>[] = [
    { audience: 'customer', title: `Welcome to Velora ${city}`, body: `300+ verified businesses in ${city} are now bookable with instant confirmation.`, type: 'success', read: false },
    { audience: 'customer', title: 'Weekend slots filling fast', body: `Top-rated salons & clinics in ${city} are 70% booked this weekend — reserve early.`, type: 'info', read: false },
  ];
  const made = seeds.map(pushLocalNotification);
  return [...made, ...existing];
}

export function genLocalRef(): string {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += s[Math.floor(Math.random() * s.length)];
  return `VL-${r}`;
}

/**
 * Creates a booking inside the DEMO TENANT — the one code path the demo
 * customer flow uses. Persists the booking + invoice, registers the customer
 * in the demo customer book, and emits notifications for BOTH sides
 * (customer confirmation + admin "new booking"). Emits the real-time events
 * that instantly refresh the business dashboard.
 */
export async function createDemoBooking(input: {
  business_id: string;
  business_name: string;
  service_id?: string | null;
  service_name: string;
  service_duration: number;
  service_price: number;
  staff_id?: string | null;
  staff_name?: string | null;
  start_time: string;
  city?: string;
  location?: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  status?: string; // default: pending (business confirms)
}): Promise<{ booking: LocalBooking; invoice: LocalInvoice; qr_payload: string }> {
  const { saveDemoCustomer, genQrSalt, localVerifyUrl } = await import('./demoStore');
  const start = new Date(input.start_time);
  if (Number.isNaN(start.getTime())) throw new Error('Please pick a valid time slot.');
  const end = new Date(start.getTime() + (input.service_duration || 30) * 60000);

  const overlaps = listLocalBookings().filter(
    (b) => String(b.business_id) === String(input.business_id)
      && b.status !== 'cancelled' && b.status !== 'no_show'
      && new Date(b.start_time) < end && new Date(b.end_time) > start,
  );
  const staffTaken = input.staff_name
    ? overlaps.filter((b) => (b.staff_name || '').toLowerCase() === input.staff_name!.toLowerCase())
    : overlaps;
  if (input.staff_name && staffTaken.length >= 1) {
    throw new Error('That slot was just taken. Please pick another time.');
  }

  const ref = genLocalRef();
  const salt = genQrSalt();
  const price = Number(input.service_price) || 0;

  const booking = saveLocalBooking({
    id: `local-${Date.now()}`,
    ref,
    business_id: input.business_id,
    business_name: input.business_name,
    service_id: input.service_id ?? null,
    service_name: input.service_name,
    staff_id: input.staff_id ?? null,
    staff_name: input.staff_name || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: input.status || 'pending',
    price,
    city: input.city,
    location: input.location,
    customer_name: input.customer_name,
    customer_email: input.customer_email,
    customer_phone: input.customer_phone,
    qr_salt: salt,
  });

  const tax = Math.round(price * 0.18 * 100) / 100;
  const invoice = saveLocalInvoice({
    id: ref, number: `INV-${ref.slice(3)}`, booking_ref: ref,
    customer_name: input.customer_name,
    amount: price, tax, total: Math.round((price + tax) * 100) / 100, status: 'issued',
  });

  // Customer book entry (single source: demo customers + derived from bookings).
  try { saveDemoCustomer({ name: input.customer_name, email: input.customer_email, phone: input.customer_phone }); } catch { /* non-fatal */ }

  const whenLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(start) + ' IST';
  pushLocalNotification({
    audience: 'customer', title: input.status === 'confirmed' ? 'Booking confirmed' : 'Booking received',
    body: `${input.service_name} at ${input.business_name} — ${ref} · ${whenLabel}`,
    type: input.status === 'confirmed' ? 'success' : 'info', read: false, booking_ref: ref,
  });
  pushLocalNotification({
    audience: 'admin', title: 'New booking',
    body: `${ref} · ${input.business_name} · ${input.service_name} · ${input.customer_name}`,
    type: 'info', read: false, booking_ref: ref,
  });

  // Full verification URL — scanning the QR opens the verify page directly.
  return { booking, invoice, qr_payload: localVerifyUrl(ref, salt) };
}

/** Verification URL for a local (demo tenant) booking. */
export function localBookingVerifyUrl(b: LocalBooking): string | null {
  if (!b.qr_salt) return null;
  try {
    return `${window.location.origin}/verify/${encodeURIComponent(`local.${btoa(JSON.stringify({ ref: b.ref, s: b.qr_salt })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`)}`;
  } catch {
    return null;
  }
}
