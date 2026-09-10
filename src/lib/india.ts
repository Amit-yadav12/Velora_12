// India-first validation and address helpers. Used by booking, business
// registration, and profile display. Never mutates user-entered free text.

export const IST_OFFSET = '+05:30';
export const IST_TZ = 'Asia/Kolkata';

/** Indian PIN: exactly 6 digits, first digit 1–9. */
export function isValidIndianPin(pin: string | null | undefined): boolean {
  return /^[1-9][0-9]{5}$/.test(String(pin || '').trim());
}

/** Digits only, last 10 of an Indian mobile (starts with 6–9). */
export function normalizeIndianPhone(raw: string | null | undefined): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export function isValidIndianPhone(raw: string | null | undefined): boolean {
  const n = normalizeIndianPhone(raw);
  return /^[6-9][0-9]{9}$/.test(n);
}

export function formatIndianPhone(raw: string | null | undefined): string {
  const n = normalizeIndianPhone(raw);
  if (!isValidIndianPhone(n)) return String(raw || '').trim();
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

export interface IndianAddress {
  line1?: string; // house / shop / building
  street?: string;
  area?: string;
  locality?: string;
  city?: string;
  district?: string;
  state?: string;
  pin?: string;
  country?: string;
}

/** Human-readable Indian address, skipping empty parts. */
export function formatIndianAddress(a: IndianAddress | null | undefined): string {
  if (!a) return '';
  const parts = [
    a.line1, a.street, a.area || a.locality, a.city,
    a.district && a.district !== a.city ? a.district : '',
    a.state, a.pin, a.country || 'India',
  ].map((p) => String(p || '').trim()).filter(Boolean);
  // de-dupe consecutive repeats
  const out: string[] = [];
  for (const p of parts) if (out[out.length - 1] !== p) out.push(p);
  return out.join(', ');
}

/** Instant IST wall-clock as a Date (correct even if the host is UTC). */
export function istWallDate(yyyyMmDd: string, hours: number, minutes = 0): Date {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return new Date(`${yyyyMmDd}T${hh}:${mm}:00${IST_OFFSET}`);
}

export function istYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
