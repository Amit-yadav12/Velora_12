// Shared domain types for API responses and DB records.

import type { Business } from './product';
import type { SyntheticHeatmap, SyntheticReview } from './synthetic';

/** Extract a readable message from anything thrown. Never throws itself. */
export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === 'string') return m;
  }
  return '';
}

/**
 * Merged console booking row — server DB rows + demo-tenant bookings share
 * this shape, so dashboards, exports and actions work on one dataset.
 */
export interface ConsoleBooking {
  id: number | string;
  ref: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string | null;
  service_id?: number | string | null;
  service_name: string;
  employee_name?: string | null;
  staff_id?: number | string | null;
  business_id?: number | string;
  business_name?: string;
  resource_name?: string;
  start_time: string;
  end_time?: string | null;
  status: string;
  price?: number | string | null;
  location?: string | null;
  city?: string | null;
  created_at?: string;
  updated_at?: string;
  qr_payload?: string | null;
  qr_salt?: string;
  local?: boolean;
  notes?: string | null;
  synthetic?: boolean;
  demo?: boolean;
}

/** Merged notification row — server notifications + local/demo notifications. */
export interface NotificationRow {
  id: number | string;
  audience: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  booking_ref?: string | null;
  created_at: string;
  local?: boolean;
}

/** Email delivery log row (admin console). */
export interface EmailLogRow {
  id: number | string;
  status: string;
  to_email?: string;
  subject?: string;
  provider?: string;
  booking_ref?: string | null;
  created_at: string;
}

/** Customer review (deterministic generator shared by profile + dashboard). */
export type ReviewRow = SyntheticReview;

/** 14-day availability forecast + best/busiest days. */
export type HeatmapData = SyntheticHeatmap;

/** Nearest-per-category discovery payload. */
export interface NearestData {
  overall_nearest: Business | null;
  nearest_per_category: Business[];
  total_within_5km?: number;
}

/** Explicit customer profile merged with booking-derived records. */
export interface ExplicitCustomer {
  id: string | number;
  email: string;
  full_name?: string;
  name?: string;
  phone?: string;
  created_at?: string;
}

/** Leave-now travel plan for an upcoming appointment. */
export interface TravelPlan {
  error?: string;
  mins_until_leave: number;
  should_leave_now: boolean;
  travel_min: number;
  leave_label?: string;
}

/** Booking shape rendered by the ticket / success experience. */
export interface TicketBooking {
  id: number | string;
  ref: string;
  service_name: string;
  start_time: string;
  end_time?: string | null;
  status?: string;
  employee_name?: string | null;
  customer_name?: string;
  customer_email?: string;
  price?: number | string | null;
  location?: string | null;
  business_id?: number | string;
  resource_name?: string;
}

/** Invoice shape rendered by the ticket / success experience. */
export interface TicketInvoice {
  number: string;
  total: number;
  id?: number | string;
  booking_ref?: string;
  customer_name?: string;
  amount?: number;
  tax?: number;
  status?: string;
  line_items?: { desc: string; qty: number; price: number }[];
}

/** POST /api/book response — also the shape local/demo fallbacks produce. */
export interface BookingConfirmation {
  booking: TicketBooking;
  invoice?: TicketInvoice;
  business?: Business;
  maps_link?: string;
  qr_payload?: string | null;
  gmail_compose_url?: string;
  deduplicated?: boolean;
  pipeline?: { email?: string };
  local?: boolean;
}

export interface Booking {
  id: number;
  ref: string;
  customer_id?: string | null;
  customer_name: string;
  customer_email: string;
  service_id?: number | null;
  service_name: string;
  employee_name?: string | null;
  resource_id?: number | null;
  resource_name?: string | null;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  price: number;
  price_breakdown?: { k: string; v: number }[] | null;
  location?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id: number;
  number: string;
  booking_ref: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  line_items?: { desc: string; qty: number; price: number }[];
}

export interface AppNotification {
  id: number;
  audience: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  booking_ref?: string | null;
  created_at: string;
}

export interface Slot {
  time: string;
  label: string;
  status: 'available' | 'busy' | 'booked';
  available: boolean;
  wait_min?: number | null;
  crowd?: number;
  score?: number;
}

export interface ConciergeAction {
  type: 'navigate' | 'book' | 'directions';
  to?: string;
  business_id?: number;
  date?: string;
  preferred_hour?: number | null;
  maps_link?: string;
  results?: { id: number; name: string }[];
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  entity: string;
  entity_id: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone?: string | null;
  created_at: string;
}
