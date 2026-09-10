// Central booking service — single contract for creating bookings.
// Every attempt carries an idempotency key so retries, double-clicks and
// flaky networks can never create duplicate bookings server-side.
import { apiSend } from '../lib/api';
import { errMsg, type BookingConfirmation } from '../lib/types';

export interface BookingPayload {
  business_id: number | string;
  service_id: number | string;
  staff_id?: number | string | null;
  start_time: string;
  customer_name?: string;
  customer_email?: string;
  notes?: string;
  business_snapshot?: unknown;
  idempotency_key?: string;
}

export function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* older browsers */
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function friendlyError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('slot') && (m.includes('taken') || m.includes('past'))) return message;
  if (m.includes('too many requests')) return 'Too many attempts — please wait a moment and try again.';
  if (m.includes('failed to fetch') || m.includes('network')) {
    return "We couldn't reach Velora right now. Check your connection and try again.";
  }
  if (!message || m.includes('request failed') || m.includes('internal')) {
    return "We couldn't complete your booking right now. Please try again.";
  }
  return message;
}

export async function submitBooking(payload: BookingPayload): Promise<BookingConfirmation> {
  const body = { ...payload, idempotency_key: payload.idempotency_key || newIdempotencyKey() };
  try {
    return await apiSend<BookingConfirmation>('/api/book', 'POST', body);
  } catch (e: unknown) {
    throw new Error(friendlyError(errMsg(e)));
  }
}
