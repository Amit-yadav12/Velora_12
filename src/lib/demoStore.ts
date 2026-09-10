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
import { formatIndianAddress, istWallDate, istYmd } from './india';
import { ticketOrigin } from './site';
import { CATEGORY_DEFS } from './synthetic';
import type { LocalBooking, LocalInvoice } from './offlineStore';

export const DEMO_TENANT_ID = 'demo-tenant-velora';

/** localStorage namespaces — demo only, never mixed with production rows. */
const K_BIZ = 'velora-demo-businesses';
const K_SVC = 'velora-demo-services';
const K_STAFF = 'velora-demo-staff';
const K_CUST = 'velora-demo-customers';
const K_SEEDED = 'velora-demo-seeded-v2';
const K_OPS = 'velora-demo-ops-v1';
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
  line1: string;
  street: string;
  area: string;
  city: string; // city it was created in / last restamped for
  state: string;
  pin: string;
  country: string;
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

/** Demo business as served to discovery + console (tenant-tagged, details optional). */
export interface DemoBusinessView extends DemoBusiness {
  demo: boolean;
  services?: DemoService[];
  staff?: DemoStaff[];
}

/** Demo business with services + staff attached (detail/slots paths). */
export interface DemoBusinessDetails extends DemoBusinessView {
  services: DemoService[];
  staff: DemoStaff[];
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
    localStorage.setItem(key, JSON.stringify(arr.slice(0, 800)));
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
    line1: 'Shop 14, Crystal Plaza',
    street: 'Bhagwan Das Road',
    area: 'C-Scheme',
    city: '',
    state: 'Rajasthan',
    pin: '302001',
    country: 'India',
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
    tenant_id: DEMO_TENANT_ID,
    created_at: now,
  };

  const apex: DemoBusiness = {
    id: 'demo-biz-apex',
    name: 'Apex Physio & Sports Rehab',
    category: 'Physiotherapy Centers',
    description:
      'Evidence-based physiotherapy and sports rehabilitation. Certified therapists, modern equipment and personalised recovery plans.',
    line1: '12, Apex Wellness Centre',
    street: 'JLN Marg',
    area: 'Malviya Nagar',
    city: '',
    state: 'Rajasthan',
    pin: '302017',
    country: 'India',
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
    tenant_id: DEMO_TENANT_ID,
    created_at: now,
  };

  const auroraServices = seedServices(aurora.id, [
    ['Signature Haircut & Styling', 'Consultation, wash, cut and blow-dry with a senior stylist.', 45, 800],
    ['Premium Hydra Facial', 'Deep-cleanse, exfoliation and hydra-glow finish.', 60, 1500],
    ['Aroma Relaxation Massage', 'Full-body Swedish massage with essential oils.', 75, 2200],
    ['Bridal Glow Package', 'Pre-bridal skincare, hair spa and trial styling session.', 120, 5500],
    ['Hair Spa', 'Deep nourish ritual with premium oils.', 60, 1800],
    ['Global Hair Colour', 'Ammonia-free colour with senior colourist.', 120, 4500],
    ['Keratin Treatment', 'Frizz-free smooth finish.', 150, 7999],
    ['Manicure + Pedicure', 'Spa mani-pedi combo.', 75, 1499],
  ]);
  const apexServices = seedServices(apex.id, [
    ['Initial Assessment & Plan', 'Full musculoskeletal assessment with a recovery roadmap.', 45, 900],
    ['Sports Deep-Tissue Massage', 'Targeted deep-tissue work for athletes and active people.', 60, 1200],
    ['Dry Needling Therapy', 'Trigger-point dry needling by certified therapists.', 45, 1100],
    ['Guided Rehab Session', 'One-on-one supervised rehabilitation session.', 45, 800],
    ['Pain Relief Session', 'IFT / ultrasound therapy for acute pain.', 45, 750],
    ['Back Pain Program', 'Spine-care session with movement plan.', 45, 1100],
    ['Home Physio Visit', 'At-home therapy visit.', 60, 1200],
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
    if (!localStorage.getItem(K_SEEDED)) {
      const seed = buildSeed();
      write(K_BIZ, seed.businesses);
      write(K_SVC, seed.services);
      write(K_STAFF, seed.staff);
      try { localStorage.setItem(K_SEEDED, JSON.stringify({ at: new Date().toISOString() })); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  ensureFullMenus();
  ensureJaipurDirectory();
}

type JaipurListing = {
  id: string; name: string; category: string; area: string; street: string;
  pin: string; phone: string; rating: number; desc: string; featured?: boolean;
};

const JAIPUR_DIRECTORY: JaipurListing[] = [
  { id: 'demo-biz-jp-amber-hospital', name: 'Amber Care Multispeciality', category: 'Hospitals', area: 'Civil Lines', street: 'Sardar Patel Marg', pin: '302006', phone: '+91 98290 42101', rating: 4.7, featured: true, desc: '24×7 emergency, ICU and specialist OPDs in the heart of Jaipur.' },
  { id: 'demo-biz-jp-pinkcity-hospital', name: 'Pinkcity Heart & General', category: 'Hospitals', area: 'Tonk Road', street: 'Tonk Road', pin: '302015', phone: '+91 98290 42102', rating: 4.6, desc: 'Cardiology, orthopaedics and full-body checkups with same-day reports.' },
  { id: 'demo-biz-jp-sanganer-hospital', name: 'Sanganer Wellness Hospital', category: 'Hospitals', area: 'Sanganer', street: 'Airport Road', pin: '302029', phone: '+91 98290 42103', rating: 4.5, desc: 'Neighbourhood hospital with digital diagnostics and cashless desks.' },
  { id: 'demo-biz-jp-rajputana-hotel', name: 'Rajputana Grand Hotel', category: 'Hotels', area: 'MI Road', street: 'Mirza Ismail Road', pin: '302001', phone: '+91 98290 42201', rating: 4.8, featured: true, desc: 'Heritage-inspired stays, rooftop dining and airport transfers.' },
  { id: 'demo-biz-jp-nahargarh-hotel', name: 'Nahargarh Residency', category: 'Hotels', area: 'Bani Park', street: 'Hasanpura Road', pin: '302016', phone: '+91 98290 42202', rating: 4.6, desc: 'Business rooms, banquet lawns and day-use suites near the station.' },
  { id: 'demo-biz-jp-amer-suites', name: 'Amer Fort View Suites', category: 'Hotels', area: 'Amer', street: 'Amer Road', pin: '302028', phone: '+91 98290 42203', rating: 4.7, desc: 'Hill-view rooms with spa and chauffeur service for palace circuits.' },
  { id: 'demo-biz-jp-johari-salon', name: 'Johari Bazaar Beauty Atelier', category: 'Salons', area: 'Johari Bazaar', street: 'Johari Bazaar', pin: '302003', phone: '+91 98290 42301', rating: 4.8, featured: true, desc: 'Bridal, colour and keratin specialists in the old city.' },
  { id: 'demo-biz-jp-cscheme-salon', name: 'C-Scheme Luxe Cuts', category: 'Salons', area: 'C-Scheme', street: 'Bhagwan Das Road', pin: '302001', phone: '+91 98290 42302', rating: 4.7, desc: 'Unisex salon with L’Oréal colour bar and private bridal rooms.' },
  { id: 'demo-biz-jp-vaishali-salon', name: 'Vaishali Glow Studio', category: 'Salons', area: 'Vaishali Nagar', street: 'Amrapali Marg', pin: '302021', phone: '+91 98290 42303', rating: 4.6, desc: 'Walk-in friendly cuts, spa facials and mani-pedi lounge.' },
  { id: 'demo-biz-jp-pinkcity-coaching', name: 'Pinkcity IIT-JEE Academy', category: 'Coaching Institutes', area: 'Raja Park', street: 'Govind Marg', pin: '302004', phone: '+91 98290 42401', rating: 4.7, featured: true, desc: 'Small-batch JEE coaching with test series and doubt rooms.' },
  { id: 'demo-biz-jp-neet-forum', name: 'Civil Lines NEET Forum', category: 'Coaching Institutes', area: 'Civil Lines', street: 'Jacob Road', pin: '302006', phone: '+91 98290 42402', rating: 4.6, desc: 'NEET + foundation batches with all-India mocks.' },
  { id: 'demo-biz-jp-scholars-hub', name: 'Mansarovar Scholars Hub', category: 'Coaching Institutes', area: 'Mansarovar', street: 'Shipra Path', pin: '302020', phone: '+91 98290 42403', rating: 4.5, desc: 'Boards + olympiad foundation for classes 8–12.' },
  { id: 'demo-biz-jp-passport', name: 'Jaipur Passport Seva Desk', category: 'Passport Offices', area: 'Secretariat', street: 'Secretariat Road', pin: '302005', phone: '+91 98290 42501', rating: 4.4, featured: true, desc: 'New passport, renewal and Tatkaal filing assistance.' },
  { id: 'demo-biz-jp-janseva', name: 'Jan Seva Kendra MI Road', category: 'Government Services', area: 'MI Road', street: 'Mirza Ismail Road', pin: '302001', phone: '+91 98290 42502', rating: 4.3, desc: 'Aadhaar, PAN, certificates and affidavits — same-day tokens.' },
  { id: 'demo-biz-jp-aadhaar', name: 'Aadhaar & PAN Facilitation', category: 'Government Services', area: 'Malviya Nagar', street: 'JLN Marg', pin: '302017', phone: '+91 98290 42503', rating: 4.2, desc: 'Biometric updates, reprints and income certificates.' },
  { id: 'demo-biz-jp-smilecraft', name: 'Smilecraft Dental Jaipur', category: 'Dentists', area: 'C-Scheme', street: 'Ashok Marg', pin: '302001', phone: '+91 98290 42601', rating: 4.8, desc: 'Painless RCT, aligners and same-day crowns.' },
  { id: 'demo-biz-jp-pearl-dental', name: 'Pearl Orthodontics Raja Park', category: 'Dentists', area: 'Raja Park', street: 'Gopalpura Bypass', pin: '302018', phone: '+91 98290 42602', rating: 4.6, desc: 'Braces, whitening and kids-friendly dentistry.' },
  { id: 'demo-biz-jp-amer-gym', name: 'Amer Fort Fitness Club', category: 'Gyms', area: 'Vaishali Nagar', street: 'Nirvana Road', pin: '302021', phone: '+91 98290 42701', rating: 4.5, desc: 'Strength + cardio with certified trainers from 5 AM.' },
  { id: 'demo-biz-jp-iron-house', name: 'Mansarovar Iron House', category: 'Fitness Centers', area: 'Mansarovar', street: 'New Sanganer Road', pin: '302020', phone: '+91 98290 42702', rating: 4.4, desc: 'Functional training, Zumba and body-comp testing.' },
  { id: 'demo-biz-jp-thali', name: 'Rajwada Thali House', category: 'Restaurants', area: 'Bapu Bazaar', street: 'Nehru Bazaar', pin: '302003', phone: '+91 98290 42801', rating: 4.7, desc: 'Unlimited Rajasthani thali, family tables and private dining.' },
  { id: 'demo-biz-jp-lakshmi', name: 'Laxmi Misthan Bhojanalay', category: 'Restaurants', area: 'Johari Bazaar', street: 'Tripolia Bazaar', pin: '302002', phone: '+91 98290 42802', rating: 4.6, desc: 'Classic sweets, thalis and festive banquet bookings.' },
  { id: 'demo-biz-jp-jalmahal-spa', name: 'Jal Mahal Day Spa', category: 'Spas', area: 'Amer Road', street: 'Jal Mahal Circle', pin: '302002', phone: '+91 98290 42901', rating: 4.8, desc: 'Balinese, couples and Ayurvedic rituals overlooking the lake.' },
];

/** Jaipur-only directory — 20+ bookable providers with full category menus. */
export function ensureJaipurDirectory(): void {
  try {
    const existing = read<DemoBusiness>(K_BIZ);
    const have = new Set(existing.map((b) => b.id));
    const missing = JAIPUR_DIRECTORY.filter((d) => !have.has(d.id));
    if (!missing.length) return;
    const now = new Date().toISOString();
    const added: DemoBusiness[] = missing.map((d) => {
      const def = catalogDef(d.category);
      return {
        id: d.id,
        name: d.name,
        category: d.category,
        description: d.desc,
        line1: d.name,
        street: d.street,
        area: d.area,
        city: 'Jaipur',
        state: 'Rajasthan',
        pin: d.pin,
        country: 'India',
        phone: d.phone,
        email: `hello@${d.id.replace(/demo-biz-jp-/, '')}.jaipur.example`,
        open_time: def.open || '09:00',
        close_time: def.close || '20:00',
        image_url: def.img || catalogImage(d.category),
        rating: d.rating,
        review_count: 80 + Math.round(d.rating * 40),
        featured: !!d.featured,
        offers: [{ title: 'Jaipur first visit', desc: '10% off your first Velora booking.', code: 'PINK10', pct: 10 }],
        facilities: catalogFacilities(d.category),
        amenities: ['UPI Payments', 'Online Booking', 'GST Invoice'],
        active: true,
        seeded: false,
        tenant_id: DEMO_TENANT_ID,
        created_at: now,
      };
    });
    write(K_BIZ, [...existing, ...added]);
    for (const b of added) seedCatalogForBusiness(b.id, b.category);
  } catch { /* ignore */ }
}

/** Merge the full category menu onto every demo business (idempotent). */
export function ensureFullMenus(): void {
  try {
    for (const b of read<DemoBusiness>(K_BIZ)) seedCatalogForBusiness(b.id, b.category);
  } catch { /* ignore */ }
}

function addIstDays(ymd: string, days: number): string {
  return istYmd(new Date(istWallDate(ymd, 12, 0).getTime() + days * 86400000));
}

type OpsRow = {
  biz: 'aurora' | 'apex';
  svc: number; // 1-based service index
  staff: number; // 1-based staff index
  day: number; // offset from today
  h: number;
  m: number;
  status: string;
  cust: number;
};

/**
 * Sample operating data so the business dashboard looks live: mixed
 * appointment statuses, GST invoices, and a customer book. Idempotent;
 * never overwrites bookings the user already created.
 */
export function ensureDemoOps(): void {
  try {
    if (localStorage.getItem(K_OPS)) return;
  } catch { return; }
  ensureDemoSeeded();
  const existingBookings = read<LocalBooking>('velora-local-bookings');
  if (existingBookings.length > 0) {
    try { localStorage.setItem(K_OPS, JSON.stringify({ at: new Date().toISOString(), skipped: true })); } catch { /* ignore */ }
    return;
  }
  const today = istYmd();
  const people: { name: string; email: string; phone: string }[] = [
    { name: 'Demo Customer', email: 'customer@velora.ai', phone: '+91 90000 00000' },
    { name: 'Ananya Sharma', email: 'ananya.sharma@example.in', phone: '+91 98290 11001' },
    { name: 'Priya Mehta', email: 'priya.mehta@example.in', phone: '+91 98290 11002' },
    { name: 'Rohan Kapoor', email: 'rohan.kapoor@example.in', phone: '+91 98290 11003' },
    { name: 'Neha Gupta', email: 'neha.gupta@example.in', phone: '+91 98290 11004' },
    { name: 'Vikram Singh', email: 'vikram.singh@example.in', phone: '+91 98290 11005' },
    { name: 'Kavya Iyer', email: 'kavya.iyer@example.in', phone: '+91 98290 11006' },
    { name: 'Aditya Reddy', email: 'aditya.reddy@example.in', phone: '+91 98290 11007' },
    { name: 'Sneha Nair', email: 'sneha.nair@example.in', phone: '+91 98290 11008' },
    { name: 'Kabir Khan', email: 'kabir.khan@example.in', phone: '+91 98290 11009' },
    { name: 'Meera Joshi', email: 'meera.joshi@example.in', phone: '+91 98290 11010' },
    { name: 'Rahul Verma', email: 'rahul.verma@example.in', phone: '+91 98290 11011' },
    { name: 'Divya Patel', email: 'divya.patel@example.in', phone: '+91 98290 11012' },
  ];
  const rows: OpsRow[] = [
    { biz: 'aurora', svc: 1, staff: 1, day: -18, h: 11, m: 0, status: 'completed', cust: 0 },
    { biz: 'aurora', svc: 2, staff: 3, day: -16, h: 14, m: 0, status: 'completed', cust: 1 },
    { biz: 'aurora', svc: 3, staff: 2, day: -14, h: 16, m: 0, status: 'completed', cust: 2 },
    { biz: 'aurora', svc: 4, staff: 3, day: -12, h: 10, m: 30, status: 'completed', cust: 3 },
    { biz: 'aurora', svc: 1, staff: 4, day: -10, h: 12, m: 0, status: 'cancelled', cust: 4 },
    { biz: 'aurora', svc: 2, staff: 2, day: -8, h: 15, m: 0, status: 'completed', cust: 5 },
    { biz: 'aurora', svc: 1, staff: 1, day: -6, h: 11, m: 30, status: 'completed', cust: 6 },
    { biz: 'aurora', svc: 3, staff: 2, day: -4, h: 17, m: 0, status: 'completed', cust: 7 },
    { biz: 'aurora', svc: 2, staff: 3, day: -2, h: 13, m: 0, status: 'completed', cust: 8 },
    { biz: 'aurora', svc: 1, staff: 1, day: 0, h: 11, m: 0, status: 'checked_in', cust: 9 },
    { biz: 'aurora', svc: 2, staff: 2, day: 0, h: 16, m: 0, status: 'confirmed', cust: 10 },
    { biz: 'aurora', svc: 1, staff: 4, day: 1, h: 10, m: 30, status: 'confirmed', cust: 11 },
    { biz: 'aurora', svc: 3, staff: 2, day: 2, h: 15, m: 0, status: 'pending', cust: 0 },
    { biz: 'aurora', svc: 4, staff: 1, day: 4, h: 11, m: 0, status: 'confirmed', cust: 1 },
    { biz: 'apex', svc: 1, staff: 1, day: -15, h: 9, m: 0, status: 'completed', cust: 2 },
    { biz: 'apex', svc: 2, staff: 2, day: -11, h: 10, m: 0, status: 'completed', cust: 4 },
    { biz: 'apex', svc: 3, staff: 1, day: -7, h: 11, m: 30, status: 'completed', cust: 6 },
    { biz: 'apex', svc: 4, staff: 2, day: -3, h: 16, m: 0, status: 'cancelled', cust: 8 },
    { biz: 'apex', svc: 1, staff: 1, day: 0, h: 9, m: 30, status: 'confirmed', cust: 10 },
    { biz: 'apex', svc: 2, staff: 2, day: 1, h: 14, m: 0, status: 'pending', cust: 3 },
    { biz: 'apex', svc: 4, staff: 1, day: 3, h: 10, m: 0, status: 'confirmed', cust: 5 },
    { biz: 'apex', svc: 3, staff: 1, day: 5, h: 12, m: 0, status: 'confirmed', cust: 7 },
  ];

  const bookings: LocalBooking[] = [];
  const invoices: LocalInvoice[] = [];
  const customers: DemoCustomer[] = people.map((p, i) => ({
    id: `demo-cust-ops${i + 1}`,
    name: p.name,
    email: p.email,
    phone: p.phone,
    created_at: istWallDate(addIstDays(today, -20 + i), 9, 0).toISOString(),
  }));

  rows.forEach((r, i) => {
    const bizId = r.biz === 'aurora' ? 'demo-biz-aurora' : 'demo-biz-apex';
    const bizName = r.biz === 'aurora' ? 'Aurora Luxe Salon & Spa' : 'Apex Physio & Sports Rehab';
    const services = read<DemoService>(K_SVC).filter((s) => s.business_id === bizId);
    const staff = read<DemoStaff>(K_STAFF).filter((s) => s.business_id === bizId);
    const svc = services[r.svc - 1] || services[0];
    const st = staff[r.staff - 1] || staff[0];
    const person = people[r.cust];
    const ymd = addIstDays(today, r.day);
    const start = istWallDate(ymd, r.h, r.m);
    const end = new Date(start.getTime() + (svc?.duration_min || 45) * 60000);
    const ref = `VL-OPS${String(i + 1).padStart(3, '0')}`;
    const salt = genQrSalt();
    const price = Number(svc?.price) || 0;
    const created = istWallDate(addIstDays(ymd, -1), 18, 12).toISOString();
    bookings.push({
      id: `local-ops-${i + 1}`,
      ref,
      business_id: bizId,
      business_name: bizName,
      service_id: svc?.id ?? null,
      service_name: svc?.name || 'Service',
      staff_id: st?.id ?? null,
      staff_name: st?.name || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: r.status,
      price,
      city: 'Jaipur',
      location: r.biz === 'aurora' ? 'C-Scheme, Jaipur' : 'Malviya Nagar, Jaipur',
      customer_name: person.name,
      customer_email: person.email,
      customer_phone: person.phone,
      qr_salt: salt,
      created_at: created,
      local: true,
    });
    const tax = Math.round(price * 0.18 * 100) / 100;
    invoices.push({
      id: ref,
      number: `INV-${ref.slice(3)}`,
      booking_ref: ref,
      customer_name: person.name,
      amount: price,
      tax,
      total: Math.round((price + tax) * 100) / 100,
      status: r.status === 'cancelled' ? 'void' : 'issued',
      created_at: created,
    });
  });

  const notifs = [
    { id: 'ln-ops-1', audience: 'admin', title: 'Today’s floor', body: 'Walk-ins and confirmed visits are on the board — check today’s appointments.', type: 'info', read: false, booking_ref: 'VL-OPS010', created_at: new Date().toISOString(), local: true },
    { id: 'ln-ops-2', audience: 'admin', title: 'Revenue this week', body: 'Completed services are posting to the dashboard as they close.', type: 'success', read: false, booking_ref: null, created_at: new Date().toISOString(), local: true },
    { id: 'ln-ops-3', audience: 'admin', title: 'Cancellation noted', body: 'Apex Guided Rehab was cancelled — slot is free again.', type: 'warning', read: false, booking_ref: 'VL-OPS018', created_at: new Date().toISOString(), local: true },
  ];

  write('velora-local-bookings', bookings);
  write('velora-local-invoices', invoices);
  write(K_CUST, customers);
  write('velora-local-notifs', notifs);
  try { localStorage.setItem(K_OPS, JSON.stringify({ at: new Date().toISOString(), n: bookings.length })); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Businesses                                                          */
/* ------------------------------------------------------------------ */

/**
 * Demo businesses for a given city. Seeded showcase businesses are restamped
 * to the active city (they travel with the demo); user-created demo
 * businesses appear in their own city. `withDetails` attaches services+staff.
 */
export function listDemoBusinesses(city?: string, withDetails = false): DemoBusinessView[] {
  ensureDemoSeeded();
  const biz = read<DemoBusiness>(K_BIZ);
  const services = read<DemoService>(K_SVC);
  const staff = read<DemoStaff>(K_STAFF);
  return biz
    .filter((b) => b.active !== false || true) // keep inactive visible to the console
    .filter((b) => !city || b.seeded || !b.city || b.city === city)
    .map((b) => {
      const base: DemoBusinessView = { ...b, city: city || b.city || '', demo: true, tenant_id: DEMO_TENANT_ID };
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

export function demoFullAddress(b: Partial<DemoBusiness> & { area?: string; city?: string }, cityName?: string): string {
  return formatIndianAddress({
    line1: b.line1, street: b.street, area: b.area,
    city: cityName || b.city, state: b.state, pin: b.pin,
    country: b.country || 'India',
  });
}

export function getDemoBusiness(id: number | string): DemoBusinessDetails | null {
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
    line1: (input.line1 || '').trim(),
    street: (input.street || '').trim(),
    area: (input.area || 'City Center').trim(),
    city: input.city || '',
    state: (input.state || '').trim(),
    pin: (input.pin || '').trim(),
    country: input.country || 'India',
    phone: (input.phone || '').trim(),
    email: (input.email || '').trim(),
    open_time: input.open_time || '09:00',
    close_time: input.close_time || '20:00',
    image_url: input.image_url || catalogImage(input.category),
    rating: input.rating ?? 4.6,
    review_count: input.review_count ?? 28,
    featured: input.featured ?? true,
    offers: input.offers || [],
    facilities: input.facilities || catalogFacilities(input.category),
    amenities: [],
    active: true,
    seeded: false,
    tenant_id: DEMO_TENANT_ID,
    created_at: new Date().toISOString(),
  };
  write(K_BIZ, [biz, ...list.filter((b) => b.id !== biz.id)]);
  seedCatalogForBusiness(biz.id, biz.category);
  emitBusinessesChanged();
  emitServicesChanged();
  emitStaffChanged();
  return biz;
}

function catalogDef(category: string) {
  return CATEGORY_DEFS.find((c) => c.name === category) || CATEGORY_DEFS.find((c) => c.name === 'Salons') || CATEGORY_DEFS[0];
}
function catalogImage(category: string): string {
  return catalogDef(category).img || '/biz/salon.jpg';
}
function catalogFacilities(category: string): string[] {
  return catalogDef(category).facilities?.slice(0, 6) || ['Card & UPI accepted'];
}

const STAFF_NAMES = ['Aarav Sharma', 'Priya Nair', 'Rahul Verma', 'Ananya Iyer', 'Kabir Malhotra'];

/** Full bookable menu + roster for a demo business, from its category. Idempotent. */
export function seedCatalogForBusiness(businessId: string, category?: string): void {
  const biz = read<DemoBusiness>(K_BIZ).find((b) => b.id === businessId);
  const cat = category || biz?.category || 'Salons';
  const def = catalogDef(cat);
  const existing = read<DemoService>(K_SVC).filter((s) => s.business_id === businessId);
  const have = new Set(existing.map((s) => s.name.toLowerCase()));
  const missing = (def.services || []).filter((s) => !have.has(s.n.toLowerCase()));
  if (missing.length) {
    const start = existing.length;
    const extra: DemoService[] = missing.map((s, i) => {
      const mid = s.lo === 0 && s.hi === 0 ? 0 : Math.round(((s.lo + s.hi) / 2) / 50) * 50;
      return {
        id: `${businessId}-svc${start + i + 1}-${s.n.slice(0, 8).replace(/\W/g, '')}`,
        business_id: businessId,
        name: s.n,
        description: s.d,
        duration_min: s.dur,
        price: mid,
        active: true,
        created_at: new Date().toISOString(),
      };
    });
    write(K_SVC, [...extra, ...read<DemoService>(K_SVC)]);
  }
  const haveStaff = read<DemoStaff>(K_STAFF).some((s) => s.business_id === businessId);
  if (!haveStaff) {
    const services = read<DemoService>(K_SVC).filter((s) => s.business_id === businessId);
    const roles = (def.roles || ['Staff']).slice(0, 3);
    const staffDefs: [string, string, string[]][] = roles.map((role, i) => [
      STAFF_NAMES[i % STAFF_NAMES.length],
      role,
      services.slice(0, 3).map((s) => s.name),
    ]);
    const staff = seedStaff(businessId, staffDefs, services);
    write(K_STAFF, [...staff, ...read<DemoStaff>(K_STAFF)]);
  }
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
  const svc = (biz.services || []).find((s) => String(s.id) === String(serviceId)) || (biz.services || [])[0];
  if (!svc || svc.active === false) return [];
  const dur = svc.duration_min || 30;

  const openH = parseInt((biz.open_time || '09:00').split(':')[0], 10) || 9;
  const closeH = parseInt((biz.close_time || '20:00').split(':')[0], 10) || 20;

  // Staff constraints: specific staff member's hours + working days.
  const staff = staffName ? (biz.staff || []).find((s) => s.name === staffName && s.active !== false) : null;
  const dayName = DAY_NAMES[istWallDate(date, 12, 0).getDay()];
  const staffAvailableThatDay = !staff || (staff.days || []).includes(dayName);
  const staffOpen = staff ? parseInt(staff.start.split(':')[0], 10) : openH;
  const staffClose = staff ? parseInt(staff.end.split(':')[0], 10) : closeH;
  const effOpen = Math.max(openH, staffOpen);
  const effClose = Math.min(closeH, staffClose);

  // Active staff capacity (for "any staff" bookings the slot blocks only when
  // every specialist is busy at that time).
  const activeStaff = (biz.staff || []).filter((s) => s.active !== false);
  const capacity = Math.max(1, staff ? 1 : activeStaff.length);

  const relevant = existingBookings.filter(
    (b) => String(b.business_id) === String(businessId) && b.status !== 'cancelled' && b.status !== 'no_show',
  );

  const now = Date.now();
  const slots: DemoSlot[] = [];
  for (let h = effOpen; h < effClose; h++) {
    for (const m of [0, 30]) {
      const s = istWallDate(date, h, m);
      if (Number.isNaN(s.getTime())) continue;
      const e = new Date(s.getTime() + dur * 60000);
      if (s.getTime() < now) continue;
      if (e.getTime() > istWallDate(date, 23, 59).getTime()) continue;

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
function unb64u(s: string): unknown {
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
  const data = unb64u(token.slice(6)) as { ref?: unknown; s?: unknown } | null;
  if (!data || typeof data.ref !== 'string' || typeof data.s !== 'string') return null;
  return { ref: data.ref, s: data.s };
}

export function localVerifyUrl(ref: string, salt: string): string {
  const t = makeLocalQrToken(ref, salt);
  return `${ticketOrigin()}/verify/${encodeURIComponent(t)}`;
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
    [K_BIZ, K_SVC, K_STAFF, K_CUST, K_OPS, ...LOCAL_STORE_KEYS].forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem(K_SEEDED);
  } catch { /* non-fatal */ }
  ensureDemoSeeded();
  ensureDemoOps();
  emitDemoReset();
  emitBusinessesChanged();
  emitServicesChanged();
  emitStaffChanged();
  emitBookingsChanged();
  emitNotifsChanged();
}
