// Console booking actions — business-side status changes, validated against
// the shared state machine. Local (demo tenant) bookings transition through
// offlineStore (which validates + emits real-time events + notifications);
// server bookings go through the authorization-checked API.
import { apiSend } from '../lib/api';
import { transitionLocalBooking, pushLocalNotification } from '../lib/offlineStore';
import { STATUS_LABEL } from '../lib/bookingStatus';
import { toast } from './events';
import { errMsg, type ConsoleBooking } from '../lib/types';

export type ConsoleAction = 'confirm' | 'check_in' | 'complete' | 'cancel' | 'no_show';

const ACTION_STATUS: Record<ConsoleAction, string> = {
  confirm: 'confirmed',
  check_in: 'checked_in',
  complete: 'completed',
  cancel: 'cancelled',
  no_show: 'no_show',
};

export async function applyBookingAction(b: ConsoleBooking, action: ConsoleAction): Promise<boolean> {
  const toStatus = ACTION_STATUS[action];
  try {
    if (b.local) {
      // Validated transition — returns null when the move is not allowed.
      const applied = transitionLocalBooking(b.id, toStatus);
      if (!applied) {
        toast(`Cannot move this booking to ${STATUS_LABEL[toStatus]} from its current state.`, 'warning');
        return false;
      }
      pushLocalNotification({
        audience: 'customer',
        title: action === 'cancel' ? 'Booking cancelled' : `Booking ${STATUS_LABEL[toStatus].toLowerCase()}`,
        body: `${b.service_name} at ${b.resource_name} — ${b.ref}`,
        type: action === 'cancel' ? 'warning' : action === 'complete' ? 'success' : 'info',
        read: false, booking_ref: b.ref,
      });
      pushLocalNotification({
        audience: 'admin',
        title: action === 'cancel' ? 'Booking cancelled' : `Booking ${STATUS_LABEL[toStatus].toLowerCase()}`,
        body: `${b.ref} · ${b.customer_name} · ${b.service_name}`,
        type: action === 'cancel' ? 'warning' : 'info',
        read: false, booking_ref: b.ref,
      });
      return true;
    }
    // Server booking — authorization is enforced API-side (admin or owner).
    if (action === 'cancel') {
      await apiSend('/api/bookings', 'PUT', { id: b.id, action: 'cancel' });
    } else {
      await apiSend('/api/bookings', 'PUT', { id: b.id, action: 'status', status: toStatus });
    }
    return true;
  } catch (e: unknown) {
    toast(errMsg(e) || 'The change could not be applied. Refreshing…', 'error');
    return false;
  }
}
