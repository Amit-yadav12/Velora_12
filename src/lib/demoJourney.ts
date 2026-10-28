// The judge-facing demo journey, derived from real demo-tenant data.
//
// Nothing here is a mock: each step reads the same localStorage demo tenant the
// customer app and the business console use, so the checklist can only tick
// when the underlying action actually happened.
import { listLocalBookings, type LocalBooking } from './offlineStore';
import { localVerifyUrl } from './demoStore';

/** The showcase sample business used by the guided demo (Jaipur / C-Scheme). */
export const DEMO_SAMPLE_BUSINESS_ID = 'demo-biz-aurora';
export const DEMO_SAMPLE_BUSINESS_NAME = 'Aurora Luxe Salon & Spa';

/** Session-scoped evidence of visiting a screen (never a fake completion). */
const SEEN_KEY = 'velora-demo-guide-seen';

type Seen = { appointments?: boolean };
function readSeen(): Seen {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
export function markDemoSeen(screen: keyof Seen): void {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [screen]: true })); } catch { /* private mode */ }
}
export function clearDemoSeen(): void {
  try { sessionStorage.removeItem(SEEN_KEY); } catch { /* private mode */ }
}

/**
 * The exact ticket URL encoded in a sample booking's QR. Used by the console to
 * pre-fill verification for a presenter — it is the same token the guest's QR
 * contains, so no verification step is skipped or faked.
 */
export function ticketUrlForRef(ref: string): string | null {
  const booking = listLocalBookings().find((b) => b.ref === ref && b.qr_salt);
  return booking?.qr_salt ? localVerifyUrl(booking.ref, booking.qr_salt) : null;
}

/**
 * The most recent booking the presenter created (with a verifiable ticket).
 * The seeded operations history (`VL-OPS…`) is dashboard filler, not part of
 * the guided journey, so the checklist never ticks itself.
 */
export function latestDemoBooking(): LocalBooking | null {
  const rows = listLocalBookings().filter((b) => b.qr_salt && !String(b.ref).startsWith('VL-OPS'));
  if (!rows.length) return null;
  return [...rows].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
}

export interface JourneyStep {
  id: 'location' | 'booking' | 'ticket' | 'confirm' | 'checkin';
  title: string;
  detail: string;
  done: boolean;
}

export function buildJourney({ cityName, booking }: { cityName: string; booking: LocalBooking | null }): JourneyStep[] {
  const seen = readSeen();
  const status = booking?.status || '';
  return [
    {
      id: 'location',
      title: 'Jaipur sample location + sample business',
      detail: 'The city context is Jaipur and the listing is marked “Sample listing”.',
      done: cityName === 'Jaipur',
    },
    {
      id: 'booking',
      title: 'Service, slot and ₹ total',
      detail: 'Pick a service and a free slot, review the subtotal + 18% GST, submit.',
      done: !!booking,
    },
    {
      id: 'ticket',
      title: 'QR ticket, findable in Bookings',
      detail: 'The ticket QR opens /verify/<token>; the same booking is listed in Bookings.',
      done: !!booking && !!seen.appointments,
    },
    {
      id: 'confirm',
      title: 'Business confirms the same booking',
      detail: 'Switch to the demo business console — the request is waiting at the top.',
      done: !!booking && ['confirmed', 'checked_in', 'completed'].includes(status),
    },
    {
      id: 'checkin',
      title: 'Ticket verified at the door',
      detail: 'Verify the ticket to check the guest in and see the confirmed arrival state.',
      done: !!booking && ['checked_in', 'completed'].includes(status),
    },
  ];
}

export function journeyProgress(steps: JourneyStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}
