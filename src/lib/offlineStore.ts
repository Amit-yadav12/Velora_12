// Velora offline/demo store — bookings, invoices and notifications persisted
// locally so the synthetic demo experience never breaks, even when the API or
// Supabase is unreachable. Merged with server data wherever it exists.

import { emitBookingsChanged, emitNotifsChanged } from '../services/events';

export interface LocalBooking {
  id: number | string;
  ref: string;
  business_id: number | string;
  business_name: string;
  service_name: string;
  staff_name?: string | null;
  start_time: string;
  end_time: string;
  status: string;
  price: number;
  city?: string;
  location?: string;
  customer_name?: string;
  customer_email?: string;
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
