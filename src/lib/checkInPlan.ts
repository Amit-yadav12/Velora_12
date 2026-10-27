// Door check-in decision — PURE, no network/DOM imports.
//
// Keeping the verdict logic separate from the I/O (verify → apply) means the
// security-relevant branches are unit-testable in isolation and cannot
// accidentally depend on a browser-only module.
import type { VerifyResult } from '../services/verify';
import type { ConsoleBooking } from './types';

export type CheckInCode =
  | 'verified'
  | 'already_checked_in'
  | 'invalid'
  | 'cancelled'
  | 'expired'
  | 'pending'
  | 'not_found'
  | 'other_business'
  | 'unsupported'
  | 'failed';

export interface CheckInPlan {
  ok: boolean;
  code: CheckInCode;
  title: string;
  message: string;
  booking?: ConsoleBooking;
  /** The booking ref the ticket claims, for rendering even when unmatched. */
  ref?: string;
}

const FIND = (bookings: readonly ConsoleBooking[], ref: string) =>
  bookings.find((b) => String(b.ref).toLowerCase() === String(ref).toLowerCase());

export { FIND as findBookingByRef };

/**
 * Decide what a verification result means for this console.
 * `bookings` is the operator's own dataset (ownership already enforced by the
 * API when these rows were loaded).
 */
export function planCheckIn(
  result: VerifyResult,
  bookings: readonly ConsoleBooking[],
): CheckInPlan {
  const ref = result.booking?.ref || '';

  if (!result.valid) {
    const reason = result.reason || 'invalid';
    if (reason === 'cancelled') {
      return { ok: false, code: 'cancelled', ref, title: 'Booking cancelled', message: 'This appointment was cancelled, so it cannot be checked in.' };
    }
    if (reason === 'expired') {
      return { ok: false, code: 'expired', ref, title: 'Ticket expired', message: 'This ticket is past its validity window. Verify the appointment in the list instead.' };
    }
    if (reason === 'invalid_signature' || reason === 'malformed' || reason === 'invalid') {
      return { ok: false, code: 'invalid', ref, title: 'Ticket not recognised', message: 'This QR code is not a valid Velora ticket, or it has been altered. Do not admit the visitor until you confirm the booking.' };
    }
    return { ok: false, code: 'invalid', ref, title: 'Ticket not recognised', message: result.message || 'This ticket could not be verified.' };
  }

  if (!ref) {
    return { ok: false, code: 'invalid', title: 'Ticket not recognised', message: 'This ticket does not identify a booking.' };
  }

  const booking = FIND(bookings, ref);
  if (!booking) {
    return {
      ok: false, code: 'not_found', ref,
      title: 'Not in your appointments',
      message: `Ticket is genuine for ${ref}, but that booking is not in this business's appointments. Check you are signed in to the right business.`,
    };
  }

  if (booking.status === 'cancelled') {
    return { ok: false, code: 'cancelled', ref, booking, title: 'Booking cancelled', message: 'This appointment was cancelled, so it cannot be checked in.' };
  }
  if (booking.status === 'completed' || booking.status === 'no_show') {
    return { ok: false, code: 'unsupported', ref, booking, title: 'Already finished', message: `This appointment is already marked ${booking.status === 'no_show' ? 'no-show' : 'completed'}.` };
  }
  if (booking.status === 'checked_in') {
    return { ok: true, code: 'already_checked_in', ref, booking, title: 'Already checked in', message: `${booking.customer_name || 'This guest'} was checked in earlier for ${booking.service_name}.` };
  }
  if (booking.status === 'pending') {
    return { ok: false, code: 'pending', ref, booking, title: 'Not confirmed yet', message: 'This booking is still a request. Confirm it first, then check the guest in.' };
  }

  return {
    ok: true, code: 'verified', ref, booking,
    title: 'Ticket verified',
    message: `${booking.customer_name || 'Guest'} · ${booking.service_name}${booking.employee_name ? ` with ${booking.employee_name}` : ''}`,
  };
}

