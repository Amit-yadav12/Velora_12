// Velora demo tenant — an isolated, fully working demo environment.
//
// ALL demo entities (businesses, services, staff, customers) live in the
// browser's localStorage under the `velora-demo-*` namespace, tagged with
// DEMO_TENANT_ID. Production data (Supabase) is NEVER touched: no demo reset,
// demo business creation, demo booking or demo staff creation can affect it.
// The admin console and customer app read from this store as part of the same
// hybrid data layer, so both sides always share ONE demo dataset.

import {
  emitBookingsChanged, emitBusinessesChanged, emitDemoReset, emitNotifsChanged,
  emitServicesChanged, emitStaffChanged,
} from '../services/events';

export const DEMO_TENANT_ID = 'demo-tenant-velora';

/** localStorage namespaces — demo only, never mixed with production rows. */
const K_BIZ = 'velora-demo-businesses';
const K_SVC = 'velora-demo-services';
const K_STAFF = 'velora-demo-staff';
const K_CUST = 'velora-demo-customers';
const K_SEEDED = 'velora-demo-seeded-v1';
// Local demo-continuity stores owned by this tenant (bookings/invoices/notifs).
export const LOCAL_STORE_KEYS = [
  'velora-local-bookings', 'velora-local-invoices', 'velora-local-notifs', 'velora-bus',
];

export interface DemoService {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration_min: number;
  price: number;
  active: boolean;
  created_at: string;
}

export interface DemoStaff {
  id: string;
  business_id: string;
  name: string;
  role: string;
  service_ids: string[];
  days: string[]; // working days
  start: string; // 'HH:MM'
  end: string; // 'HH:MM'
  active: boolean;
  created_at: string;
}

export interface DemoBusiness {
  id: string; // demo-biz-*
  name: string;
  category: string;
  description: string;
  area: string;
  phone: string;
  email: string;
  open_time: string;
  close_time: string;
  image_url: string;
  rating: number;
  review_count: number;
  featured: boolean;
  offers: { title: string; desc: string; code: string; pct: number }[];
  facilities: string[];
  amenities: string[];
  active: boolean;
  seeded: boolean; // part of the clean demo state (restored on reset)
  city: string; // city it was created in / last restamped for
  tenant_id: typeof DEMO_TENANT_ID;
  created_at: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, arr: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 300)));
  } catch { /* non-fatal (private mode) */ }
}

export function isDemoId(id: number | string | null | undefined): boolean {
  const s = String(id ?? '');
  return s.startsWith('demo-') || s.startsWith('local-') || s.startsWith('live-');
}

export function isDemoBusinessId(id: number | string | null | undefined): boolean {
  return String(id ?? '').startsWith('demo-biz-');
}

/* ------------------------------------------------------------------ */
/* Seed — the clean demo state restored by Reset Demo                  */
/* ------------------------------------------------------------------ */

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function seedServices(bizId: string, defs: [string, string, number, number][]): DemoService[] {
  return defs.map(([name, description, duration_min, price], i) => ({
    id: `${bizId}-svc${i + 1}`,
    business_id: bizId,
    name, description, duration_min, price,
    active: true,
    created_at: new Date().toISOString(),
  }));
}

function seedStaff(bizId: string, defs: [string, string, string[]][], services: DemoService[]): DemoStaff[] {
  return defs.map(([name, role, serviceNames], i) => ({
    id: `${bizId}-st${i + 1}`,
    business_id: bizId,
    name, role,
    service_ids: serviceNames
      .map((n) => services.find((s) => s.name.startsWith(n))?.id)
      .filter((x): x is string => !!x),
    days: i === defs.length - 1 ? ALL_DAYS.slice(0, 5) : ALL_DAYS,
    start: '10:00',
    end: '19:00',
    active: true,
    created_at: new Date().toISOString(),
  }));
}

/** The pristine demo dataset: 2 showcase businesses with services + staff. */
export function buildSeed(): { businesses: DemoBusiness[]; services: DemoService[]; staff: DemoStaff[] } {
  const now = new Date().toISOString();

  const aurora: DemoBusiness = {
    id: 'demo-biz-aurora',
    name: 'Aurora Luxe Salon & Spa',
    category: 'Salons',
    description:
      'A premium unisex salon and day-spa. Expert stylists, organic treatments and a calm, luxurious atmosphere — now booking in real time on Velora.',
    area: 'C-Scheme',
    phone: '+91 98290 41100',
    email: 'hello@auroraluxe.example',
    open_time: '10:00',
    close_time: '20:00',
    image_url: '/biz/salon.jpg',
    rating: 4.8,
    review_count: 214,
    featured: true,
    offers: [
      { title: 'First visit 20% off', desc: 'New customers get 20% off any service above ₹500.', code: 'AURORA20', pct: 20 },
      { title: 'Spa duo bundle', desc: 'Book any two spa services together and save 15%.', code: 'SPADUO', pct: 15 },
    ],
    facilities: ['Valet parking', 'Air conditioned', 'Card & UPI accepted'],
    amenities: ['Organic products', 'Private rooms', 'Complimentary beverages'],
    active: true,
    seeded: true,
    city: '',
    tenant_id: DEMO_TENANT_ID,
    created_at: now,
  };

  const apex: DemoBusiness = {
    id: 'demo-biz-apex',
    name: 'Apex Physio & Sports Rehab',
    category: 'Physiotherapy Centers',
    description:
      'Evidence-based physiotherapy and sports rehabilitation. Certified therapists, modern equipment and personalised recovery plans.',
    area: 'Malviya Nagar',
    phone: '+91 98290 41200',
    email: 'care@apexphysio.example',
    open_time: '08:00',
    close_time: '19:00',
    image_url: '/biz/physio.jpg',
    rating: 4.7,
    review_count: 168,
    featured: false,
    offers: [
      { title: 'Free posture screening', desc: 'Complimentary 15-min posture assessment with any session.', code: 'APEXPOSTURE', pct: 0 },
    ],
    facilities: ['Wheelchair accessible', 'Parking', 'ICU-trained staff'],
    amenities: ['Modern rehab equipment', 'Private cabins'],
    active: true,
    seeded: true,
    city: '',
    tenant_id: DEMO_TENANT_ID,
    created_at: now,
  };

  const auroraServices = seedServices(aurora.id, [
    ['Signature Haircut & Styling', 'Consultation, wash, cut and blow-dry with a senior stylist.', 45, 800],
    ['Premium Hydra Facial', 'Deep-cleanse, exfoliation and hydra-glow finish.', 60, 1500],
    ['Aroma Relaxation Massage', 'Full-body Swedish massage with essential oils.', 75, 2200],
    ['Bridal Glow Package', 'Pre-bridal skincare, hair spa and trial styling session.', 120, 5500],
  ]);
  const apexServices = seedServices(apex.id, [
    ['Initial Assessment & Plan', 'Full musculoskeletal assessment with a recovery roadmap.', 45, 900],
    ['Sports Deep-Tissue Massage', 'Targeted deep-tissue work for athletes and active people.', 60, 1200],
    ['Dry Needling Therapy', 'Trigger-point dry needling by certified therapists.', 45, 1100],
    ['Guided Rehab Session', 'One-on-one supervised rehabilitation session.', 45, 800],
  ]);

  const auroraStaff = seedStaff(aurora.id, [
    ['Meera Kapoor', 'Senior Stylist', ['Signature Haircut', 'Bridal']],
    ['Arjun Rao', 'Lead Spa Therapist', ['Aroma Relaxation', 'Premium Hydra']],
    ['Divya Sharma', 'Beauty Consultant', ['Premium Hydra', 'Bridal']],
    ['Kabir Singh', 'Junior Stylist', ['Signature Haircut']],
  ], auroraServices);
  const apexStaff = seedStaff(apex.id, [
    ['Dr. Karan Mehta', 'Lead Physiotherapist', ['Initial Assessment', 'Dry Needling', 'Guided Rehab']],
    ['Dr. Sneha Iyer', 'Sports Therapist', ['Sports Deep-Tissue', 'Guided Rehab']],
  ], apexServices);

  return {
    businesses: [aurora, apex],
    services: [...auroraServices, ...apexServices],
    staff: [...auroraStaff, ...apexStaff],
  };
}

/** Idempotent seed — runs once per browser. */
export function ensureDemoSeeded(): void {
  try {
    if (localStorage.getItem(K_SEEDED)) return;
  } catch { return; }
  const seed = buildSeed();
  write(K_BIZ, seed.businesses);
  write(K_SVC, seed.services);
  write(K_STAFF, seed.staff);
  try { localStorage.setItem(K_SEEDED, JSON.stringify({ at: new Date().toISOString() })); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

/**
 * Demo businesses for a given city. Seeded showcase businesses are restamped
 * to the active city (they travel with the demo); user-created demo
 * businesses appear in their own city. `withDetails` attaches services+staff.
 */
export function listDemoBusinesses(city?: string, withDetails = false): any[] {
  ensureDemoSeeded();
  const biz = read<DemoBusiness>(K_BIZ);
  const services = read<DemoService>(K_SVC);
  const staff = read<DemoStaff>(K_STAFF);
  return biz
    .filter((b) => b.active !== false || true) // keep inactive visible to the console
    .filter((b) => !city || b.seeded || !b.city || b.city === city)
    .map((b) => {
      const base = { ...b, city: city || b.city || '', demo: true, tenant_id: DEMO_TENANT_ID };
      if (withDetails) {
        return {
          ...base,
          services: services.filter((s) => s.business_id === b.id),
          staff: staff.filter((s) => s.business_id === b.id),
        };
      }
      return base;
    });
}

export function getDemoBusiness(id: number | string): any | null {
  ensureDemoSeeded();
  const b = read<DemoBusiness>(K_BIZ).find((x) => x.id === String(id));
  if (!b) return null;
  const services = read<DemoService>(K_SVC).filter((s) => s.business_id === b.id);
  const staff = read<DemoStaff>(K_STAFF).filter((s) => s.business_id === b.id);
  return { ...b, demo: true, tenant_id: DEMO_TENANT_ID, services, staff };
}

export function saveDemoBusiness(input: Partial<DemoBusiness> & { name: string; category: string }): DemoBusiness {
  const list = read<DemoBusiness>(K_BIZ);
  const id = input.id || `demo-biz-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`;
  const biz: DemoBusiness = {
    id,
    name: input.name.trim(),
    category: input.category,
    description: (input.description || '').trim(),
    area: (input.area || 'City Center').trim(),
    phone: (input.phone || '').trim(),
    email: (input.email || '').trim(),
    open_time: input.open_time || '09:00',
    close_time: input.close_time || '20:00',
    image_url: input.image_url || '/biz/store.jpg',
    rating: input.rating ?? 4.5,
    review_count: input.review_count ?? 0,
    featured: false,
    offers: [],
    facilities: input.facilities || ['Card & UPI accepted'],
    amenities: [],
    active: true,
    seeded: false,
    city: input.city || '',
    tenant_id: DEMO_TENANT_ID,
    created_at: new Date().toISOString(),
  };
  write(K_BIZ, [biz, ...list.filter((b) => b.id !== biz.id)]);
  emitBusinessesChanged();
  return biz;
}

export function updateDemoBusiness(id: string, patch: Partial<DemoBusiness>): void {
  const list = read<DemoBusiness>(K_BIZ).map((b) => (b.id === id ? { ...b, ...patch, id } : b));
  write(K_BIZ, list);
  emitBusinessesChanged();
}

/** Cascade delete: business → its services, staff and (soft) future bookings. */
export function deleteDemoBusiness(id: string): void {
  write(K_BIZ, read<DemoBusiness>(K_BIZ).filter((b) => b.id !== id));
  write(K_SVC, read<DemoService>(K_SVC).filter((s) => s.business_id !== id));
  write(K_STAFF, read<DemoStaff>(K_STAFF).filter((s) => s.business_id !== id));
  emitBusinessesChanged();
  emitServicesChanged();
  emitStaffChanged();
}

/* ------------------------------------------------------------------ */
/* Services                                                            */
/* ------------------------------------------------------------------ */

export function listDemoServices(businessId?: string): (DemoService & { demo: true })[] {
  ensureDemoSeeded();
  const list = read<DemoService>(K_SVC);
  return (businessId ? list.filter((s) => s.business_id === businessId) : list).map((s) => ({ ...s, demo: true }));
}

export function saveDemoService(input: Partial<DemoService> & { business_id: string; name: string }): DemoService {
  const list = read<DemoService>(K_SVC);
  const svc: DemoService = {
    id: input.id || `demo-svc-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`,
    business_id: input.business_id,
    name: input.name.trim(),
    description: (input.description || '').trim(),
    duration_min: Number(input.duration_min) || 30,
    price: Number(input.price) || 0,
    active: input.active !== false,
    created_at: input.created_at || new Date().toISOString(),
  };
  write(K_SVC, [svc, ...list.filter((s) => s.id !== svc.id)]);
  emitServicesChanged();
  return svc;
}

export function updateDemoService(id: string, patch: Partial<DemoService>): void {
  write(K_SVC, read<DemoService>(K_SVC).map((s) => (s.id === id ? { ...s, ...patch, id } : s)));
  emitServicesChanged();
}

export function deleteDemoService(id: string): void {
  write(K_SVC, read<DemoService>(K_SVC).filter((s) => s.id !== id));
  emitServicesChanged();
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export function listDemoStaff(businessId?: string): (DemoStaff & { demo: true })[] {
  ensureDemoSeeded();
  const list = read<DemoStaff>(K_STAFF);
  return (businessId ? list.filter((s) => s.business_id === businessId) : list).map((s) => ({ ...s, demo: true }));
}

export function saveDemoStaff(input: Partial<DemoStaff> & { business_id: string; name: string }): DemoStaff {
  const list = read<DemoStaff>(K_STAFF);
  const st: DemoStaff = {
    id: input.id || `demo-st-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`,
    business_id: input.business_id,
    name: input.name.trim(),
    role: (input.role || 'Staff').trim(),
    service_ids: Array.isArray(input.service_ids) ? input.service_ids : [],
    days: Array.isArray(input.days) && input.days.length ? input.days : ALL_DAYS,
    start: input.start || '10:00',
    end: input.end || '19:00',
    active: input.active !== false,
    created_at: input.created_at || new Date().toISOString(),
  };
  write(K_STAFF, [st, ...list.filter((s) => s.id !== st.id)]);
  emitStaffChanged();
  return st;
}

export function updateDemoStaff(id: string, patch: Partial<DemoStaff>): void {
  write(K_STAFF, read<DemoStaff>(K_STAFF).map((s) => (s.id === id ? { ...s, ...patch, id } : s)));
  emitStaffChanged();
}

export function deleteDemoStaff(id: string): void {
  write(K_STAFF, read<DemoStaff>(K_STAFF).filter((s) => s.id !== id));
  emitStaffChanged();
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

export function listDemoCustomers(): (DemoCustomer & { demo: true })[] {
  return read<DemoCustomer>(K_CUST).map((c) => ({ ...c, demo: true }));
}

export function saveDemoCustomer(input: { name: string; email: string; phone?: string }): DemoCustomer {
  const list = read<DemoCustomer>(K_CUST);
  const email = input.email.toLowerCase().trim();
  const existing = list.find((c) => c.email.toLowerCase() === email);
  if (existing) {
    const updated = { ...existing, name: input.name || existing.name, phone: input.phone || existing.phone };
    write(K_CUST, list.map((c) => (c.id === existing.id ? updated : c)));
    return updated;
  }
  const c: DemoCustomer = {
    id: `demo-cust-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`,
    name: input.name.trim(), email, phone: input.phone || '',
    created_at: new Date().toISOString(),
  };
  write(K_CUST, [c, ...list]);
  return c;
}

/* ------------------------------------------------------------------ */
/* Availability — opening hours × service duration × staff × bookings  */
/* ------------------------------------------------------------------ */

export interface DemoSlot {
  time: string;
  label: string;
  status: 'available' | 'busy' | 'booked';
  available: boolean;
  wait_min: number | null;
  crowd: number;
  score: number;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Real availability for a demo business: opening hours, service duration,
 * staff working days/hours, and existing non-cancelled bookings. Already
 * booked slots are never returned as available.
 */
export function demoSlots(
  businessId: string,
  serviceId: string | null,
  date: string, // YYYY-MM-DD
  existingBookings: { business_id: number | string; staff_name?: string | null; start_time: string; end_time: string; status: string }[],
  staffName?: string | null,
): DemoSlot[] {
  const biz = getDemoBusiness(businessId);
  if (!biz) return [];
  const svc = (biz.services || []).find((s: any) => String(s.id) === String(serviceId)) || (biz.services || [])[0];
  if (!svc || svc.active === false) return [];
  const dur = svc.duration_min || 30;

  const openH = parseInt((biz.open_time || '09:00').split(':')[0], 10) || 9;
  const closeH = parseInt((biz.close_time || '20:00').split(':')[0], 10) || 20;

  // Staff constraints: specific staff member's hours + working days.
  const staff = staffName ? (biz.staff || []).find((s: any) => s.name === staffName && s.active !== false) : null;
  const dayName = DAY_NAMES[new Date(`${date}T12:00:00`).getDay()];
  const staffAvailableThatDay = !staff || (staff.days || []).includes(dayName);
  const staffOpen = staff ? parseInt(staff.start.split(':')[0], 10) : openH;
  const staffClose = staff ? parseInt(staff.end.split(':')[0], 10) : closeH;
  const effOpen = Math.max(openH, staffOpen);
  const effClose = Math.min(closeH, staffClose);

  // Active staff capacity (for "any staff" bookings the slot blocks only when
  // every specialist is busy at that time).
  const activeStaff = (biz.staff || []).filter((s: any) => s.active !== false);
  const capacity = Math.max(1, staff ? 1 : activeStaff.length);

  const relevant = existingBookings.filter(
    (b) => String(b.business_id) === String(businessId) && b.status !== 'cancelled' && b.status !== 'no_show',
  );

  const now = Date.now();
  const slots: DemoSlot[] = [];
  for (let h = effOpen; h < effClose; h++) {
    for (const m of [0, 30]) {
      const s = new Date(`${date}T00:00:00`);
      s.setHours(h, m, 0, 0);
      const e = new Date(s.getTime() + dur * 60000);
      if (s.getTime() < now) continue;
      if (e.getTime() > new Date(`${date}T23:59:59`).getTime()) continue;

      const overlaps = relevant.filter(
        (b) => new Date(b.start_time) < e && new Date(b.end_time) > s,
      );
      // With a specific staff: their bookings block the slot. With "any":
      // the slot is gone only when every specialist is occupied.
      const blocking = staffName
        ? overlaps.filter((b) => (b.staff_name || '').toLowerCase() === (staffName || '').toLowerCase())
        : overlaps;
      const taken = staffAvailableThatDay ? blocking.length >= capacity : true;

      const crowd = overlaps.length;
      const status: DemoSlot['status'] = taken ? 'booked' : crowd >= capacity ? 'busy' : 'available';
      let score = 0;
      if (!taken) {
        score = 100 - crowd * 10;
        if (h >= 10 && h <= 11) score += 8;
        if (h >= 15 && h <= 16) score += 6;
        if (h >= 12 && h <= 13) score -= 6;
      }
      slots.push({
        time: s.toISOString(),
        label: s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        status,
        available: !taken,
        wait_min: taken ? null : Math.min(35, crowd * 8),
        crowd,
        score,
      });
    }
  }
  return slots;
}

/* ------------------------------------------------------------------ */
/* Local QR verification tokens (offline/demo bookings)                */
/* ------------------------------------------------------------------ */

function b64u(obj: unknown): string {
  try { return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  catch { return ''; }
}
function unb64u(s: string): any | null {
  try {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4)));
  } catch { return null; }
}

export function genQrSalt(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 18; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

/**
 * Capability token for local (demo tenant) bookings: `local.<b64url>`.
 * Contains ONLY the booking ref + a random unguessable salt — no PII. The
 * booking record itself (status, expiry) is checked at verification time.
 */
export function makeLocalQrToken(ref: string, salt: string): string {
  return `local.${b64u({ ref, s: salt })}`;
}

export function parseLocalQrToken(token: string): { ref: string; s: string } | null {
  if (!token.startsWith('local.')) return null;
  const data = unb64u(token.slice(6));
  if (!data || typeof data.ref !== 'string' || typeof data.s !== 'string') return null;
  return { ref: data.ref, s: data.s };
}

export function localVerifyUrl(ref: string, salt: string): string {
  const t = makeLocalQrToken(ref, salt);
  return `${window.location.origin}/verify/${encodeURIComponent(t)}`;
}

/* ------------------------------------------------------------------ */
/* Reset — demo tenant ONLY, production data is never touched          */
/* ------------------------------------------------------------------ */

/**
 * Restores the clean demo state. Clears ONLY the velora-demo-* and
 * velora-local-* namespaces (bookings, invoices, notifications created in
 * the demo) and re-seeds the showcase businesses, services and staff.
 * Supabase rows are untouched by design.
 */
export function resetDemo(): void {
  try {
    [K_BIZ, K_SVC, K_STAFF, K_CUST, ...LOCAL_STORE_KEYS].forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(K_SEEDED);
  } catch { /* non-fatal */ }
  ensureDemoSeeded();
  emitDemoReset();
  emitBusinessesChanged();
  emitServicesChanged();
  emitStaffChanged();
  emitBookingsChanged();
  emitNotifsChanged();
}
