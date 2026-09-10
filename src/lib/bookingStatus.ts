// Velora booking status model — one consistent state machine everywhere.
// Statuses: PENDING → CONFIRMED → CHECKED_IN → COMPLETED, with CANCELLED /
// NO_SHOW as terminal exits. Transitions are validated on BOTH sides
// (customer cancel, business confirm/complete) so nonsensical moves are
// impossible regardless of where the change originates.

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

/** Allowed transitions — the single authority for status changes. */
export const STATUS_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'in_progress', 'completed', 'cancelled'],
  checked_in: ['completed', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = STATUS_TRANSITIONS[from as BookingStatus];
  if (!allowed) return false;
  return allowed.includes(to as BookingStatus);
}

/** Statuses that still count as "live revenue" (not cancelled / no-show). */
export const REVENUE_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
];

/** Statuses a customer may cancel from. */
export const CUSTOMER_CANCELLABLE: BookingStatus[] = ['pending', 'confirmed'];

export function isCancellable(status: string): boolean {
  return CUSTOMER_CANCELLABLE.includes(status as BookingStatus);
}

/** Statuses the business can act on (confirm / complete / cancel buttons). */
export function isActionable(status: string): boolean {
  return ['pending', 'confirmed', 'checked_in', 'in_progress'].includes(status);
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};
