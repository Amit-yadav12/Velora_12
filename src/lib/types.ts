// Shared domain types for API responses and DB records.

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
