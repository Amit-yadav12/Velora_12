// QR ticket verification client — resolves a token or full /verify/ URL
// against the signed verification endpoint. Demo-tenant bookings use
// `local.*` capability tokens that verify against the same shared local
// booking dataset (no network needed, same verdicts: valid / cancelled /
// expired / invalid).
import { parseLocalQrToken } from '../lib/demoStore';
import { listLocalBookings } from '../lib/offlineStore';

export interface VerifyResult {
  valid: boolean;
  reason?: string;
  status?: string;
  demo?: boolean;
  message?: string;
  booking?: { ref: string; business?: string | null; service?: string | null; start_time?: string | null };
  checked_at?: string;
}

export function tokenFromInput(input: string): string {
  const t = (input || '').trim();
  const m = t.match(/\/verify\/([^?#\\s]+)/);
  const raw = m ? m[1] : t;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Demo-tenant tickets: check the salted token against the local dataset. */
function verifyLocalToken(token: string): VerifyResult {
  const parsed = parseLocalQrToken(token);
  if (!parsed) {
    return { valid: false, reason: 'invalid', message: 'This QR code is not a valid Velora ticket.' };
  }
  const booking = listLocalBookings().find((b) => b.ref === parsed.ref);
  if (!booking) {
    return {
      valid: false, reason: 'invalid',
      message: 'Demo-tenant tickets verify in the browser session where they were booked. Open this link in that browser, or use the in-app ticket view.',
    };
  }
  if (booking.qr_salt !== parsed.s) {
    return { valid: false, reason: 'invalid', message: 'This ticket failed verification — it may have been altered.' };
  }
  const facts = { ref: booking.ref, business: booking.business_name, service: booking.service_name, start_time: booking.start_time };
  if (booking.status === 'cancelled') {
    return { valid: false, reason: 'cancelled', status: 'cancelled', message: 'This booking was cancelled.', booking: facts };
  }
  if (new Date(booking.end_time).getTime() < Date.now() - 24 * 3600 * 1000) {
    return { valid: false, reason: 'expired', status: booking.status, message: 'This ticket has expired.', booking: facts };
  }
  return {
    valid: true, status: booking.status, demo: true, booking: facts,
    message: booking.status === 'pending' ? 'Ticket verified — awaiting business confirmation.' : 'This booking is verified.',
    checked_at: new Date().toISOString(),
  };
}

export async function verifyToken(input: string): Promise<VerifyResult> {
  const token = tokenFromInput(input);
  if (!token) throw new Error('Paste a ticket link or token to verify it.');
  if (token.startsWith('local.')) return verifyLocalToken(token);
  let res: Response;
  try {
    res = await fetch(`/api/verify-booking?token=${encodeURIComponent(token)}`);
  } catch {
    throw new Error("We couldn't reach Velora right now. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as VerifyResult;
  if (!res.ok) throw new Error((data as any)?.error || 'Verification failed. Please try again.');
  return data;
}
