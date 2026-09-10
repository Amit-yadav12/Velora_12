// India-first formatting helpers: INR currency + IST time.

/** Format a number as Indian Rupees using the Indian digit-grouping system. */
export function inr(amount: number | string | null | undefined, opts?: { decimals?: boolean }): string {
  const n = Number(amount || 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: opts?.decimals ? 2 : 0,
    minimumFractionDigits: opts?.decimals ? 2 : 0,
  }).format(n);
}

/** Plain grouped number (Indian system), no currency symbol. */
export function inrNumber(amount: number | string | null | undefined): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(amount || 0));
}

const IST = 'Asia/Kolkata';

function asDate(date: string | Date | null | undefined): Date | null {
  if (date == null || date === '') return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a date/time in IST. Never throws on invalid input. */
export function ist(date: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = asDate(date);
  if (!d) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts }).format(d);
  } catch {
    return '—';
  }
}

export const istTime = (d: string | Date) => ist(d, { hour: 'numeric', minute: '2-digit', hour12: true });
export const istDate = (d: string | Date) => ist(d, { day: 'numeric', month: 'short', year: 'numeric' });
export const istDateTime = (d: string | Date) => ist(d, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
export const istDay = (d: string | Date) => ist(d, { day: 'numeric' });
export const istWeekday = (d: string | Date) => ist(d, { weekday: 'short' });

/** Get today's date in IST as YYYY-MM-DD (for date inputs). */
export function istToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return parts;
}

/** Distance helper (km) for nearby businesses. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
