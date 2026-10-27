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

/**
 * IST wall-clock primitives. `istWallDate` and `istYmd` live in india.ts (one
 * implementation, shared with phone/PIN validation) and are re-exported here so
 * time formatting has a single import surface. Slot grids are defined in
 * business wall-clock time and must be built with the IST offset — never with
 * the browser's local zone, or a customer abroad books a different instant.
 */
export { istWallDate, istYmd } from './india';

/** IST hour of day (0–23). */
export function istHour(date: string | Date = new Date()): number {
  const d = asDate(date);
  if (!d) return NaN;
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: IST, hourCycle: 'h23', hour: '2-digit',
  }).format(d));
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** IST minute of hour (0–59). */
export function istMinute(date: string | Date = new Date()): number {
  const d = asDate(date);
  if (!d) return NaN;
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: IST, hourCycle: 'h23', minute: '2-digit',
  }).format(d));
}

/** IST weekday, 0 = Sunday … 6 = Saturday (same convention as Date#getDay). */
export function istWeekdayIndex(date: string | Date = new Date()): number {
  return WEEKDAY_INDEX[ist(date, { weekday: 'short' })] ?? NaN;
}

/** IST wall-clock value for <input type="datetime-local">: YYYY-MM-DDTHH:mm. */
export function istDateTimeLocal(d: string | Date): string {
  const date = asDate(d);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Distance helper (km) for nearby businesses. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
