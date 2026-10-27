// Door check-in — turns a scanned ticket into a verified arrival.
//
// The logic is split in two so it can be tested without a browser:
//   planCheckIn()      pure decision: what does this verified ticket mean for
//                      this console's bookings?
//   checkInFromTicket() orchestrates verify → plan → apply.
//
// Guarantees:
//  * A booking only reaches `checked_in` when its ticket verified.
//  * Re-scanning the same ticket is idempotent ("already checked in"), never an
//    error and never a second state change.
//  * A ticket for another business, a cancelled booking or an expired ticket is
//    refused with a message the operator can act on.
import { apiSend } from '../lib/api';
import { verifyToken, tokenFromInput, type VerifyResult } from './verify';
import { transitionLocalBooking, pushLocalNotification } from '../lib/offlineStore';
import { planCheckIn, type CheckInPlan } from '../lib/checkInPlan';
import type { ConsoleBooking } from '../lib/types';
import { errMsg } from '../lib/types';

export { planCheckIn };
export type { CheckInPlan, CheckInCode } from '../lib/checkInPlan';

export interface CheckInOptions {
  bookings: readonly ConsoleBooking[];
  /** Applies the state change. Receives the raw verified token for server auth. */
  apply: (booking: ConsoleBooking, token: string) => Promise<void>;
}

/** Verify a pasted/scanned ticket, decide, then apply. Never throws. */
export async function checkInFromTicket(input: string, { bookings, apply }: CheckInOptions): Promise<CheckInPlan> {
  const token = tokenFromInput(input);
  if (!token) {
    return { ok: false, code: 'invalid', title: 'Nothing to verify', message: 'Scan a ticket QR or paste its link.' };
  }
  let result: VerifyResult;
  try {
    result = await verifyToken(token);
  } catch (e: unknown) {
    return {
      ok: false, code: 'failed', title: 'Could not reach verification',
      message: errMsg(e) || 'Verification is unavailable right now. Confirm the appointment from the list if the guest is expected.',
    };
  }
  const plan = planCheckIn(result, bookings);
  if (!plan.ok || !plan.booking) return plan;

  if (plan.code === 'already_checked_in') return plan;

  try {
    await apply(plan.booking, token);
    return plan;
  } catch (e: unknown) {
    return {
      ok: false, code: 'failed', booking: plan.booking, ref: plan.ref,
      title: 'Check-in did not save',
      message: errMsg(e) || 'The server rejected the check-in. The booking is unchanged — try again.',
    };
  }
}

/**
 * Default applier used by the console: demo-tenant rows transition locally,
 * server rows are checked in by the API with the ticket as proof.
 */
export async function applyCheckIn(booking: ConsoleBooking, token: string): Promise<void> {
  if (booking.local) {
    const applied = transitionLocalBooking(booking.id, 'checked_in');
    if (!applied) throw new Error('This booking can no longer be checked in.');
    pushLocalNotification({
      audience: 'customer', title: 'Checked in',
      body: `${booking.service_name} — ${booking.ref}. See you inside!`,
      type: 'success', read: false, booking_ref: booking.ref,
    });
    pushLocalNotification({
      audience: 'admin', title: 'Checked in',
      body: `${booking.ref} · ${booking.customer_name}`,
      type: 'info', read: false, booking_ref: booking.ref,
    });
    return;
  }
  await apiSend('/api/bookings', 'PUT', { id: booking.id, action: 'check_in', ticket: token });
}
