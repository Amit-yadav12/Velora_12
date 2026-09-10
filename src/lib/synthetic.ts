// Velora synthetic ecosystem — deterministic, city-scoped booking data.
// Every city gets hundreds of realistic businesses across 40+ categories with
// services (₹ pricing), staff, slots, reviews, offers, facilities, queues and
// AI popularity scores. Fully deterministic: same city+id always yields the
// same data, on client and server.
//
// Synthetic business ids live in a reserved numeric range (>= 100000) so they
// never collide with Supabase rows:
//   id = 100000 + cityIdx*20000 + catIdx*400 + idx

import { CITIES, cityIndex } from './cities';
import type { Business, BusinessService, BusinessStaff } from './product';

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

export function hashStr(s: string): number {
  // xfnv1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SYN_BASE = 100000;
export const SYN_CITY_STRIDE = 20000;
export const SYN_CAT_STRIDE = 400;
export const PER_CAT_PER_CITY = 7;

export function isSyntheticId(id: number | string): boolean {
  const n = Number(id);
  return Number.isFinite(n) && n >= SYN_BASE;
}

export function decodeSyntheticId(id: number | string): { cityIdx: number; catIdx: number; idx: number } | null {
  const n = Number(id);
  if (!Number.isFinite(n) || n < SYN_BASE) return null;
  const off = n - SYN_BASE;
  const cityIdx = Math.floor(off / SYN_CITY_STRIDE);
  const rem = off % SYN_CITY_STRIDE;
  const catIdx = Math.floor(rem / SYN_CAT_STRIDE);
  const idx = rem % SYN_CAT_STRIDE;
  if (cityIdx < 0 || cityIdx >= CITIES.length) return null;
  if (catIdx < 0 || catIdx >= CATEGORY_DEFS.length) return null;
  return { cityIdx, catIdx, idx: idx % PER_CAT_PER_CITY };
}

// ---------------------------------------------------------------------------
// Category catalogue — 47 categories with realistic Indian services & pricing
// ---------------------------------------------------------------------------

export interface ServiceTemplate { n: string; d: string; dur: number; lo: number; hi: number; }
export interface CategoryDef {
  name: string;
  singular: string;
  img: string;
  open: string;
  close: string;
  brands: string[];
  suffixes: string[];
  taglines: string[];
  roles: string[];
  services: ServiceTemplate[];
  facilities: string[];
}

const IMG = (f: string) => `/biz/${f}`;

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    name: 'Clinics', singular: 'Clinic', img: IMG('clinic.jpg'), open: '09:00', close: '21:00',
    brands: ['Aarogya', 'CityCare', 'LifeLine', 'Sanjeevani', 'MediTrust', 'HealthFirst', 'CarePoint', 'Vitalis'],
    suffixes: ['Clinic', 'Health Clinic', 'Family Clinic', 'Multi-Speciality Clinic', 'Care Centre', 'Medical Centre'],
    taglines: ['Trusted neighbourhood doctors', 'Same-day appointments', 'Family healthcare, simplified'],
    roles: ['General Physician', 'Paediatrician', 'Physician', 'Nurse', 'Receptionist'],
    services: [
      { n: 'General Consultation', d: 'Complete checkup with physician', dur: 20, lo: 300, hi: 800 },
      { n: 'Follow-up Visit', d: 'Review within 7 days', dur: 15, lo: 200, hi: 400 },
      { n: 'Health Checkup Basic', d: 'Vitals + blood sugar + BP', dur: 30, lo: 499, hi: 999 },
      { n: 'Vaccination', d: 'All standard vaccines', dur: 15, lo: 250, hi: 2500 },
      { n: 'ECG Test', d: '12-lead ECG with report', dur: 15, lo: 300, hi: 600 },
      { n: 'Nebulization Session', d: 'Respiratory relief therapy', dur: 20, lo: 200, hi: 350 },
    ],
    facilities: ['Waiting Lounge', 'Pharmacy Nearby', 'UPI Payments', 'Wheelchair Access', 'AC Waiting', 'Emergency Support'],
  },
  {
    name: 'Hospitals', singular: 'Hospital', img: IMG('hospital.jpg'), open: '00:00', close: '23:59',
    brands: ['Apollo-style', 'Fortis-style', 'Max-style', 'Narayana-style', 'Manipal-style', 'Kokilaben-style'].map((s) => s.replace('-style', 'Care')),
    suffixes: ['Hospitals', 'Multispeciality Hospital', 'Super Speciality Hospital', 'General Hospital'],
    taglines: ['24×7 emergency care', 'NABH accredited care', 'Advanced diagnostics & surgery'],
    roles: ['Cardiologist', 'Orthopaedic Surgeon', 'Neurologist', 'General Surgeon', 'Duty Doctor', 'Head Nurse'],
    services: [
      { n: 'OPD Consultation', d: 'Specialist doctor visit', dur: 20, lo: 500, hi: 1500 },
      { n: 'Full Body Checkup', d: '60+ tests with doctor review', dur: 120, lo: 1999, hi: 5999 },
      { n: 'X-Ray', d: 'Digital X-ray with report', dur: 20, lo: 400, hi: 900 },
      { n: 'Ultrasound', d: 'Whole abdomen / pelvis scan', dur: 30, lo: 900, hi: 2200 },
      { n: 'Physiotherapy Session', d: 'Post-op & pain rehab', dur: 45, lo: 600, hi: 1200 },
      { n: 'Emergency Care', d: '24×7 casualty & ICU', dur: 60, lo: 1000, hi: 5000 },
    ],
    facilities: ['24×7 Emergency', 'ICU & Ventilators', 'In-house Pharmacy', 'Cafeteria', 'Ambulance', 'Parking', 'Insurance Desk'],
  },
  {
    name: 'Dentists', singular: 'Dental Clinic', img: IMG('dental.jpg'), open: '10:00', close: '20:00',
    brands: ['SmileCraft', 'PearlDent', 'ToothFairy', 'DentaCare', 'BrightSmile', 'OrthoSmile', 'Clove-style', 'FMS-style'].map((s) => s.replace('-style', '')),
    suffixes: ['Dental Clinic', 'Dental Studio', 'Dental Care', 'Orthodontics Centre', 'Smile Studio'],
    taglines: ['Painless dentistry', 'Braces & aligners experts', 'Same-day crowns'],
    roles: ['Dentist', 'Orthodontist', 'Endodontist', 'Dental Hygienist', 'Clinic Coordinator'],
    services: [
      { n: 'Dental Checkup', d: 'Exam + treatment plan', dur: 20, lo: 300, hi: 500 },
      { n: 'Cleaning & Polishing', d: 'Scaling + stain removal', dur: 45, lo: 800, hi: 2500 },
      { n: 'Root Canal (RCT)', d: 'Single sitting painless RCT', dur: 60, lo: 4000, hi: 9000 },
      { n: 'Braces Consultation', d: 'Metal / ceramic / aligners', dur: 30, lo: 500, hi: 1000 },
      { n: 'Tooth Extraction', d: 'Simple & surgical removal', dur: 30, lo: 1000, hi: 4500 },
      { n: 'Teeth Whitening', d: 'Laser whitening session', dur: 60, lo: 6000, hi: 15000 },
    ],
    facilities: ['Digital X-Ray', 'Painless Anaesthesia', 'Sterilized Kits', 'UPI Payments', 'AC Lounge', 'Kids Friendly'],
  },
  {
    name: 'Diagnostic Centers', singular: 'Diagnostics', img: IMG('clinic.jpg'), open: '07:00', close: '21:00',
    brands: ['Thyrocare-style', 'Dr Lal-style', 'Metropolis-style', 'Orange-style', 'Lucid-style', 'Vijaya-style'].map((s) => s.replace('-style', ' Labs')),
    suffixes: ['Diagnostics', 'Pathology Labs', 'Diagnostic Centre', 'Lab & Imaging'],
    taglines: ['Same-day digital reports', 'NABL accredited labs', 'Home sample collection'],
    roles: ['Phlebotomist', 'Lab Technician', 'Radiologist', 'Pathologist', 'Front Desk'],
    services: [
      { n: 'Blood Test Panel', d: 'CBC + sugar + lipid', dur: 15, lo: 399, hi: 1299 },
      { n: 'Thyroid Profile', d: 'T3 T4 TSH complete', dur: 15, lo: 450, hi: 950 },
      { n: 'HbA1c Diabetes Test', d: '3-month sugar average', dur: 15, lo: 350, hi: 700 },
      { n: 'Full Body Package', d: '75+ tests + free consult', dur: 30, lo: 1499, hi: 3999 },
      { n: 'Home Sample Collection', d: 'At-doorstep pickup', dur: 20, lo: 0, hi: 150 },
      { n: 'Vitamin D & B12', d: 'Deficiency screening', dur: 15, lo: 800, hi: 1600 },
    ],
    facilities: ['Home Collection', 'Digital Reports', 'NABL Certified', 'UPI Payments', 'Waiting Lounge', 'Parking'],
  },
  {
    name: 'Pharmacies', singular: 'Pharmacy', img: IMG('clinic.jpg'), open: '08:00', close: '23:00',
    brands: ['MedPlus-style', 'Apollo-style', 'PharmEasy-style', 'Netmeds-style', 'Wellness-style', 'Care-style'].map((s) => s.replace('-style', '')),
    suffixes: ['Pharmacy', 'Medical Store', 'Medicines & More', 'Health Pharmacy'],
    taglines: ['Genuine medicines', 'Up to 25% off', 'Home delivery in 60 min'],
    roles: ['Pharmacist', 'Store Manager', 'Delivery Executive'],
    services: [
      { n: 'Prescription Order', d: 'Upload & get medicines', dur: 10, lo: 99, hi: 999 },
      { n: 'BP Check', d: 'Free BP monitoring', dur: 5, lo: 0, hi: 50 },
      { n: 'Sugar Check', d: 'Glucometer test', dur: 5, lo: 30, hi: 80 },
      { n: 'Health Devices', d: 'BP / sugar / nebulizer', dur: 15, lo: 500, hi: 4000 },
    ],
    facilities: ['Home Delivery', 'UPI Payments', 'Genuine Stock', 'Open Late'],
  },
  {
    name: 'Salons', singular: 'Salon', img: IMG('salon.jpg'), open: '10:00', close: '21:00',
    brands: ['Lakme-style', 'Naturals-style', 'Envi-style', 'Bounce-style', 'YLG-style', 'Looks-style', 'Geetanjali-style', 'Habibs-style'].map((s) => s.replace('-style', '')),
    suffixes: ['Salon', 'Hair & Beauty', 'Luxury Salon', 'Unisex Salon', 'Makeover Studio'],
    taglines: ['Premium hair & beauty', 'L’Oréal & Kerastase experts', 'Bridal specialists'],
    roles: ['Senior Stylist', 'Hair Spa Expert', 'Beautician', 'Nail Artist', 'Makeup Artist'],
    services: [
      { n: 'Haircut + Styling', d: 'Cut, wash & blow-dry', dur: 45, lo: 299, hi: 1499 },
      { n: 'Hair Spa', d: 'Deep nourish ritual', dur: 60, lo: 999, hi: 2999 },
      { n: 'Global Hair Colour', d: 'Ammonia-free colour', dur: 120, lo: 2999, hi: 7999 },
      { n: 'Keratin Treatment', d: 'Frizz-free smooth hair', dur: 150, lo: 4999, hi: 12999 },
      { n: 'Facial Glow', d: 'Signature brightening facial', dur: 60, lo: 1499, hi: 4999 },
      { n: 'Manicure + Pedicure', d: 'Spa mani-pedi combo', dur: 75, lo: 999, hi: 2499 },
    ],
    facilities: ['AC Lounge', 'Bridal Room', 'Premium Products', 'UPI Payments', 'Valet Parking', 'Coffee Bar'],
  },
  {
    name: 'Barbershops', singular: 'Barbershop', img: IMG('barber.jpg'), open: '09:00', close: '22:00',
    brands: ['Truefitt-style', 'Gatsby', 'ManeStreet', 'Blade & Co', 'Gentlemen’s Den', 'CutCrew', 'SharpEdge', 'UrbanBlade'].map((s) => s.replace('-style', '')),
    suffixes: ['Barbershop', 'Men’s Grooming', 'Hair & Beard Studio', 'Grooming Lounge'],
    taglines: ['Sharp cuts, zero wait', 'Beard sculpting experts', 'Hot-towel shaves'],
    roles: ['Master Barber', 'Beard Stylist', 'Junior Barber'],
    services: [
      { n: 'Haircut', d: 'Classic / fade / textured', dur: 30, lo: 199, hi: 799 },
      { n: 'Beard Trim + Shape', d: 'Precision beard styling', dur: 20, lo: 149, hi: 499 },
      { n: 'Haircut + Beard Combo', d: 'Full grooming session', dur: 50, lo: 349, hi: 1099 },
      { n: 'Head Massage', d: 'Champi stress relief', dur: 20, lo: 199, hi: 499 },
      { n: 'Hair Colour (Men)', d: 'Grey coverage / fashion', dur: 45, lo: 799, hi: 2499 },
    ],
    facilities: ['Walk-ins Welcome', 'UPI Payments', 'AC Lounge', 'Sanitized Tools'],
  },
  {
    name: 'Spas', singular: 'Spa', img: IMG('spa.jpg'), open: '10:00', close: '21:00',
    brands: ['O2-style', 'Tattva-style', 'Kaya-style', 'Anahata', 'SereneSoul', 'AyurBliss', 'Zenith', 'CloudNine'].map((s) => s.replace('-style', ' Spa')),
    suffixes: ['Spa', 'Wellness Spa', 'Thai Spa', 'Ayurvedic Spa', 'Day Spa'],
    taglines: ['Deep relaxation rituals', 'Balinese & Thai therapies', 'Couples retreats'],
    roles: ['Spa Therapist', 'Masseur', 'Masseuse', 'Wellness Consultant'],
    services: [
      { n: 'Full Body Massage (60m)', d: 'Swedish / deep tissue', dur: 60, lo: 1999, hi: 4499 },
      { n: 'Balinese Massage', d: 'Aromatherapy ritual', dur: 75, lo: 2499, hi: 5499 },
      { n: 'Head Shoulder Back', d: 'Express 30-min relief', dur: 30, lo: 999, hi: 1999 },
      { n: 'Couples Spa', d: 'Private suite for two', dur: 90, lo: 4999, hi: 9999 },
      { n: 'Foot Reflexology', d: 'Pressure-point therapy', dur: 45, lo: 899, hi: 1999 },
    ],
    facilities: ['Private Suites', 'Steam Room', 'Herbal Teas', 'Couples Room', 'UPI Payments', 'Valet Parking'],
  },
  {
    name: 'Beauty Clinics', singular: 'Beauty Clinic', img: IMG('salon.jpg'), open: '10:00', close: '20:00',
    brands: ['Kaya-style', 'VLCC-style', 'RichFeel-style', 'DermaGlow', 'SkinQ', 'GlowLab', 'Dermique', 'Aesthetica'].map((s) => s.replace('-style', '')),
    suffixes: ['Skin Clinic', 'Aesthetic Centre', 'Derma Clinic', 'Skin & Hair Clinic'],
    taglines: ['US-FDA approved tech', 'Dermat-supervised care', 'Visible results'],
    roles: ['Dermatologist', 'Aesthetician', 'Laser Specialist', 'Trichologist'],
    services: [
      { n: 'Skin Consultation', d: 'Analysis + treatment plan', dur: 30, lo: 500, hi: 1000 },
      { n: 'HydraFacial', d: 'Deep cleanse + glow', dur: 60, lo: 2500, hi: 6000 },
      { n: 'Laser Hair Reduction', d: 'Full body 6 sessions', dur: 60, lo: 4999, hi: 24999 },
      { n: 'Chemical Peel', d: 'Pigmentation & acne', dur: 45, lo: 2000, hi: 5500 },
      { n: 'PRP Hair Treatment', d: 'Hair regrowth therapy', dur: 60, lo: 4500, hi: 12000 },
    ],
    facilities: ['Dermat Supervised', 'US-FDA Tech', 'Private Rooms', 'UPI Payments', 'AC Lounge'],
  },
  {
    name: 'Gyms', singular: 'Gym', img: IMG('gym.jpg'), open: '05:00', close: '23:00',
    brands: ['Cultfit-style', 'Gold-style', 'Anytime-style', 'IronParadise', 'FlexNation', 'PowerHouse', 'MuscleMantra', 'FitArena'].map((s) => s.replace('-style', '')),
    suffixes: ['Fitness', 'Gym', 'Strength Club', 'Fitness Studio', 'Health Club'],
    taglines: ['Certified trainers', 'Strength + cardio zones', 'No-peak-hour crowds'],
    roles: ['Head Coach', 'Strength Trainer', 'Cardio Trainer', 'Nutritionist', 'Floor Trainer'],
    services: [
      { n: 'Day Pass', d: 'Full-day gym access', dur: 120, lo: 200, hi: 500 },
      { n: 'Monthly Membership', d: 'All equipment + classes', dur: 30, lo: 1500, hi: 4000 },
      { n: 'Personal Training (12)', d: '1-on-1 transformation', dur: 60, lo: 8000, hi: 25000 },
      { n: 'Zumba Group Class', d: 'High-energy dance fitness', dur: 60, lo: 300, hi: 600 },
      { n: 'Body Composition Test', d: 'Fat / muscle analysis', dur: 20, lo: 300, hi: 800 },
    ],
    facilities: ['Strength Zone', 'Cardio Deck', 'Locker Room', 'Protein Bar', 'AC Hall', 'Parking'],
  },
  {
    name: 'Fitness Centers', singular: 'Fitness Center', img: IMG('gym.jpg'), open: '05:30', close: '22:30',
    brands: ['FitZone', 'ActiveLife', 'ToneUp', 'SlimTrans', 'CoreCulture', 'PeakFit', 'BurnBox', 'FlexFit'],
    suffixes: ['Fitness Centre', 'Wellness Club', 'Fit Studio', 'Training Centre'],
    taglines: ['Group classes daily', 'Functional training', 'Weight-loss programs'],
    roles: ['Fitness Coach', 'CrossFit Trainer', 'Yoga Instructor', 'Dietician'],
    services: [
      { n: 'Functional Training', d: 'HIIT + mobility batch', dur: 60, lo: 500, hi: 1200 },
      { n: 'Weight Loss Program', d: '90-day guided plan', dur: 60, lo: 6000, hi: 18000 },
      { n: 'Strength Assessment', d: 'Baseline + roadmap', dur: 45, lo: 499, hi: 999 },
      { n: 'Couple Membership', d: 'Train together monthly', dur: 30, lo: 2500, hi: 6000 },
    ],
    facilities: ['Group Studio', 'Changing Rooms', 'Diet Plans', 'UPI Payments', 'Parking'],
  },
  {
    name: 'Yoga Studios', singular: 'Yoga Studio', img: IMG('gym.jpg'), open: '05:00', close: '21:00',
    brands: ['Isha-style', 'Art of Living-style', 'YogaMantra', 'Pranayama', 'Asana House', 'OmShala', 'Yogalaya', 'Sattva'].map((s) => s.replace('-style', '')),
    suffixes: ['Yoga Studio', 'Yoga Shala', 'Yoga & Meditation', 'Wellness Yoga'],
    taglines: ['Certified yogacharyas', 'Morning & evening batches', 'Prenatal yoga'],
    roles: ['Yoga Acharya', 'Meditation Guide', 'Prenatal Coach', 'Therapy Yoga Expert'],
    services: [
      { n: 'Drop-in Class', d: 'Hatha / Vinyasa flow', dur: 60, lo: 250, hi: 500 },
      { n: 'Monthly Batch', d: '12 sessions + diet chart', dur: 60, lo: 1800, hi: 3500 },
      { n: 'Meditation Session', d: 'Guided mindfulness', dur: 45, lo: 300, hi: 700 },
      { n: 'Therapy Yoga', d: 'Back pain / PCOS care', dur: 60, lo: 800, hi: 1500 },
      { n: 'Weekend Workshop', d: 'Advanced asana camp', dur: 180, lo: 1200, hi: 2500 },
    ],
    facilities: ['Wooden Floor Hall', 'Mats Provided', 'Changing Room', 'Herbal Corner', 'Peaceful Ambience'],
  },
  {
    name: 'Physiotherapy Centers', singular: 'Physio Center', img: IMG('physio.jpg'), open: '08:00', close: '21:00',
    brands: ['PhysioActive', 'CB Physio-style', 'ProHealth', 'MoveWell', 'RehabRight', 'Kineticure', 'FlexiCare', 'OrthoMove'].map((s) => s.replace('-style', '')),
    suffixes: ['Physiotherapy', 'Physio & Rehab', 'Pain Clinic', 'Sports Rehab'],
    taglines: ['BPTh / MPT doctors', 'Post-surgery rehab', 'Home visits available'],
    roles: ['Physiotherapist', 'Sports Physio', 'Neuro Physio', 'Rehab Assistant'],
    services: [
      { n: 'Physio Assessment', d: 'Movement + pain mapping', dur: 30, lo: 400, hi: 800 },
      { n: 'Pain Relief Session', d: 'IFT / ultrasound therapy', dur: 45, lo: 500, hi: 1000 },
      { n: 'Back Pain Program', d: '6-session spine care', dur: 45, lo: 3000, hi: 7000 },
      { n: 'Sports Injury Rehab', d: 'Return-to-play plan', dur: 60, lo: 800, hi: 1800 },
      { n: 'Home Physio Visit', d: 'At-home therapy', dur: 60, lo: 800, hi: 1500 },
    ],
    facilities: ['Modern Equipment', 'Private Bays', 'Home Visits', 'UPI Payments', 'Wheelchair Access'],
  },
  {
    name: 'Wellness Centers', singular: 'Wellness Center', img: IMG('spa.jpg'), open: '07:00', close: '21:00',
    brands: ['Jindal-style', 'Ananda-style', 'Somatheeram-style', 'VedaWell', 'Prakruti', 'OjasWell', 'Tattvam', 'Swasthya'].map((s) => s.replace('-style', '')),
    suffixes: ['Wellness Centre', 'Ayurveda Retreat', 'Naturopathy Centre', 'Holistic Clinic'],
    taglines: ['Ayurveda + naturopathy', 'Doctor-led detox', 'Stress reversal'],
    roles: ['Ayurvedic Doctor', 'Naturopath', 'Yoga Therapist', 'Dietician'],
    services: [
      { n: 'Ayurvedic Consultation', d: 'Dosha analysis + plan', dur: 45, lo: 600, hi: 1200 },
      { n: 'Abhyanga Massage', d: '4-hand oil therapy', dur: 60, lo: 1800, hi: 3500 },
      { n: 'Shirodhara', d: 'Stress & sleep therapy', dur: 60, lo: 2200, hi: 4500 },
      { n: 'Detox Day Program', d: 'Therapies + sattvik meals', dur: 300, lo: 4999, hi: 9999 },
    ],
    facilities: ['Doctor Supervised', 'Herbal Pharmacy', 'Sattvik Cafe', 'Garden Lounge', 'Private Rooms'],
  },
  {
    name: 'Restaurants', singular: 'Restaurant', img: IMG('indianhotel.jpg'), open: '11:00', close: '23:00',
    brands: ['Biryani Blues-style', 'Paradise-style', 'Ohri’s-style', 'Barbeque Nation-style', 'SpiceSymphony', 'Tandoori Nights', 'Dakshin Feast', 'Royal Dine'].map((s) => s.replace('-style', '')),
    suffixes: ['Restaurant', 'Fine Dine', 'Family Restaurant', 'Multi-Cuisine', 'Dining Hall'],
    taglines: ['North + South + Chinese', 'Live counters', 'Family friendly'],
    roles: ['Head Chef', 'Sous Chef', 'Captain', 'Host'],
    services: [
      { n: 'Table for 2', d: 'Window / regular seating', dur: 90, lo: 0, hi: 0 },
      { n: 'Table for 4-6', d: 'Family table booking', dur: 120, lo: 0, hi: 0 },
      { n: 'Buffet Lunch', d: 'Unlimited multi-cuisine', dur: 120, lo: 549, hi: 1299 },
      { n: 'Buffet Dinner', d: 'Live grill + desserts', dur: 150, lo: 749, hi: 1699 },
      { n: 'Private Dining', d: 'Celebration room (8)', dur: 180, lo: 2000, hi: 5000 },
    ],
    facilities: ['AC Hall', 'Family Seating', 'Valet Parking', 'UPI Payments', 'Veg Options', 'Kids Menu'],
  },
  {
    name: 'Cafés', singular: 'Café', img: IMG('indianhotel.jpg'), open: '09:00', close: '23:00',
    brands: ['Third Wave-style', 'Blue Tokai-style', 'Starbucks-style', 'Cafe Aaranya', 'BrewRoom', 'Filter Kaapi House', 'Mocha Tales', 'BeanBarn'].map((s) => s.replace('-style', ' Coffee')),
    suffixes: ['Café', 'Coffee House', 'Espresso Bar', 'Cafe & Bakery'],
    taglines: ['Single-origin brews', 'Work-friendly wifi', 'Fresh bakes daily'],
    roles: ['Barista', 'Head Barista', 'Pastry Chef', 'Cafe Manager'],
    services: [
      { n: 'Table Booking', d: 'Indoor / outdoor seat', dur: 120, lo: 0, hi: 0 },
      { n: 'Brewing Workshop', d: 'Pour-over masterclass', dur: 90, lo: 999, hi: 1999 },
      { n: 'High Tea for 2', d: 'Snacks + beverages', dur: 120, lo: 799, hi: 1499 },
      { n: 'Work Desk Pass', d: 'Full-day + 2 coffees', dur: 480, lo: 399, hi: 699 },
    ],
    facilities: ['High-speed WiFi', 'Work Plugs', 'Outdoor Seating', 'Pet Friendly', 'UPI Payments'],
  },
  {
    name: 'Hotels', singular: 'Hotel', img: IMG('hotel.jpg'), open: '00:00', close: '23:59',
    brands: ['Taj-style', 'ITC-style', 'Marriott-style', 'Novotel-style', 'Lemon Tree-style', 'FabHotel-style', 'Treebo-style', 'The Park-style'].map((s) => s.replace('-style', '')),
    suffixes: ['Hotel', 'Grand Hotel', 'Residency', 'Suites & Spa', 'Business Hotel'],
    taglines: ['Premium stays', 'Rooftop dining', 'Business ready'],
    roles: ['Front Office Manager', 'Concierge', 'Housekeeping Lead', 'F&B Manager'],
    services: [
      { n: 'Deluxe Room / Night', d: 'Queen bed + breakfast', dur: 1440, lo: 2499, hi: 7999 },
      { n: 'Executive Suite / Night', d: 'Lounge + suite perks', dur: 1440, lo: 5999, hi: 15999 },
      { n: 'Day-Use Room (8h)', d: 'Work + rest package', dur: 480, lo: 1499, hi: 3999 },
      { n: 'Banquet Hall', d: 'Events up to 200 guests', dur: 300, lo: 25000, hi: 90000 },
      { n: 'Airport Transfer', d: 'Sedan / Innova pickup', dur: 90, lo: 1200, hi: 3500 },
    ],
    facilities: ['24×7 Front Desk', 'Free WiFi', 'Restaurant', 'Room Service', 'Parking', 'Power Backup', 'Gym & Pool'],
  },
  {
    name: 'Coworking Spaces', singular: 'Coworking', img: IMG('coaching.jpg'), open: '08:00', close: '22:00',
    brands: ['WeWork-style', 'Awfis-style', '91Springboard-style', 'BHive-style', 'IndiQube-style', 'WorkNest', 'HustleHub', 'DeskDweller'].map((s) => s.replace('-style', '')),
    suffixes: ['Coworking', 'Workspaces', 'Business Centre', 'Shared Offices'],
    taglines: ['High-speed fibre', 'Meeting rooms', 'Startup community'],
    roles: ['Community Manager', 'Facility Lead', 'IT Support'],
    services: [
      { n: 'Day Pass', d: 'Hot desk + wifi + coffee', dur: 600, lo: 399, hi: 899 },
      { n: 'Hot Desk Monthly', d: 'Flexible seating', dur: 30, lo: 4999, hi: 9999 },
      { n: 'Dedicated Desk', d: 'Fixed desk + locker', dur: 30, lo: 7999, hi: 14999 },
      { n: 'Meeting Room / Hour', d: '6-seater + screen', dur: 60, lo: 500, hi: 1200 },
      { n: 'Private Cabin (4)', d: 'Lockable team room', dur: 30, lo: 25000, hi: 50000 },
    ],
    facilities: ['High-speed WiFi', 'Meeting Rooms', 'Printing', 'Pantry', 'Power Backup', 'Parking'],
  },
  {
    name: 'Sports Centers', singular: 'Sports Center', img: IMG('sports.jpg'), open: '06:00', close: '22:00',
    brands: ['Playo-style', 'Sportobuddy-style', 'Athlive', 'GameOn Arena', 'Sportiq', 'PlayZone', 'Victory Grounds', 'AceArena'].map((s) => s.replace('-style', '')),
    suffixes: ['Sports Arena', 'Sports Club', 'Multi-Sport Centre', 'Sports Complex'],
    taglines: ['Multiple sports, one pass', 'Floodlit courts', 'Coaching available'],
    roles: ['Head Coach', 'Assistant Coach', 'Facility Manager', 'Referee'],
    services: [
      { n: 'Court Booking / Hour', d: 'Badminton / TT / box cricket', dur: 60, lo: 300, hi: 900 },
      { n: 'Monthly Membership', d: 'Open play all sports', dur: 30, lo: 2000, hi: 5000 },
      { n: 'Kids Coaching', d: 'Weekend batches', dur: 60, lo: 1500, hi: 3500 },
      { n: 'Tournament Entry', d: 'Weekend leagues', dur: 180, lo: 500, hi: 2000 },
    ],
    facilities: ['Floodlights', 'Changing Rooms', 'Equipment Rental', 'Cafeteria', 'Parking', 'First Aid'],
  },
  {
    name: 'Cricket Turfs', singular: 'Cricket Turf', img: IMG('sports.jpg'), open: '06:00', close: '23:00',
    brands: ['BoxCricket Pro', 'TurfTown', 'CricArena', 'SixerPark', 'Googly Grounds', 'WicketWorld', 'PowerPlay Turf', 'NightCric'],
    suffixes: ['Cricket Turf', 'Box Cricket', 'Turf Arena', 'Cricket Ground'],
    taglines: ['FIFA-grade turf', 'Night slots till 11pm', 'Balls + kits included'],
    roles: ['Turf Manager', 'Umpire', 'Coach'],
    services: [
      { n: 'Turf Slot / Hour', d: '6-a-side with equipment', dur: 60, lo: 1200, hi: 3500 },
      { n: 'Night Slot / Hour', d: 'Floodlit premium hours', dur: 60, lo: 1800, hi: 4500 },
      { n: 'Tournament (Team)', d: 'Weekend box-cricket cup', dur: 240, lo: 3000, hi: 8000 },
      { n: 'Coaching Session', d: 'Batting + bowling drills', dur: 90, lo: 600, hi: 1500 },
    ],
    facilities: ['Floodlights', 'Equipment Included', 'Changing Rooms', 'Drinking Water', 'Parking'],
  },
  {
    name: 'Football Grounds', singular: 'Football Ground', img: IMG('sports.jpg'), open: '06:00', close: '22:00',
    brands: ['GoalArena', 'KickOff', 'StrikerPark', 'SoccerNest', 'Football Factory', 'GoalLine', 'TikiTaka Turf', 'HatTrick'],
    suffixes: ['Football Ground', 'Soccer Turf', 'Football Arena', 'Mini Stadium'],
    taglines: ['5v5 / 7v7 formats', 'Pro-grade turf', 'Bibs + balls included'],
    roles: ['Ground Manager', 'Football Coach', 'Referee'],
    services: [
      { n: 'Ground Slot / Hour', d: '5-a-side / 7-a-side', dur: 60, lo: 1500, hi: 4000 },
      { n: 'Kids Academy Trial', d: 'Age 5-15 batches', dur: 60, lo: 300, hi: 600 },
      { n: 'Monthly Academy', d: '12 coached sessions', dur: 60, lo: 2500, hi: 5000 },
    ],
    facilities: ['Floodlights', 'Bibs & Balls', 'Changing Rooms', 'First Aid', 'Parking'],
  },
  {
    name: 'Badminton Courts', singular: 'Badminton Court', img: IMG('badminton.jpg'), open: '05:00', close: '23:00',
    brands: ['ShuttleZone', 'SmashArena', 'CourtCraft', 'FeatherPlay', 'RallyHouse', 'DropShot Club', 'NetPlay', 'AceShuttle'],
    suffixes: ['Badminton Academy', 'Shuttle Courts', 'Badminton Club', 'Indoor Courts'],
    taglines: ['Wooden BWF courts', 'Feather + nylon', 'Pro coaching'],
    roles: ['Badminton Coach', 'Assistant Coach', 'Court Manager'],
    services: [
      { n: 'Court / Hour', d: 'Singles / doubles', dur: 60, lo: 250, hi: 700 },
      { n: 'Coaching Monthly', d: 'Beginner to advanced', dur: 60, lo: 2000, hi: 4500 },
      { n: 'Racket Stringing', d: 'Same-day service', dur: 30, lo: 250, hi: 500 },
    ],
    facilities: ['Wooden Courts', 'Shower Rooms', 'Pro Shop', 'Parking', 'Cafeteria'],
  },
  {
    name: 'Swimming Pools', singular: 'Swimming Pool', img: IMG('sports.jpg'), open: '06:00', close: '21:00',
    brands: ['AquaSplash', 'BlueWave', 'DiveDeep', 'SwimFit', 'CrystalPool', 'NeptuneSwim', 'AquaLife', 'SplashPoint'],
    suffixes: ['Swimming Pool', 'Swim Academy', 'Aquatic Centre', 'Swim Club'],
    taglines: ['Temperature controlled', 'Certified lifeguards', 'Kids batches'],
    roles: ['Swim Coach', 'Lifeguard', 'Pool Manager'],
    services: [
      { n: 'Open Swim / Hour', d: 'Lap + leisure lanes', dur: 60, lo: 200, hi: 500 },
      { n: 'Learn to Swim (12)', d: 'Beginner batch', dur: 60, lo: 3000, hi: 7000 },
      { n: 'Aqua Aerobics', d: 'Low-impact fitness', dur: 45, lo: 400, hi: 800 },
    ],
    facilities: ['Chlorinated', 'Lifeguards', 'Changing Rooms', 'Lockers', 'Cafeteria'],
  },
  {
    name: 'Coaching Institutes', singular: 'Coaching', img: IMG('coaching.jpg'), open: '07:00', close: '21:00',
    brands: ['FIITJEE-style', 'Allen-style', 'Aakash-style', 'Resonance-style', 'Sri Chaitanya-style', 'Narayana-style', 'Vidyamandir-style', 'CareerPath'].map((s) => s.replace('-style', '')),
    suffixes: ['Coaching Institute', 'Academy', 'Classes', 'IIT-JEE & NEET Academy'],
    taglines: ['IIT-JEE + NEET toppers', 'Small batches', 'Test series included'],
    roles: ['Physics Faculty', 'Maths Faculty', 'Chemistry Faculty', 'Biology Faculty', 'Counsellor'],
    services: [
      { n: 'Demo Class', d: 'Free trial session', dur: 90, lo: 0, hi: 0 },
      { n: 'JEE / NEET Batch', d: 'Class 11-12 + dropper', dur: 120, lo: 60000, hi: 180000 },
      { n: 'Foundation (8-10)', d: 'Olympiad + boards', dur: 90, lo: 25000, hi: 70000 },
      { n: 'Test Series', d: 'All-India mock tests', dur: 180, lo: 4999, hi: 14999 },
      { n: 'Counselling Session', d: 'Career roadmap', dur: 45, lo: 500, hi: 1500 },
    ],
    facilities: ['AC Classrooms', 'Library', 'Doubt Rooms', 'Test Lab', 'Hostel Tie-ups'],
  },
  {
    name: 'Tutors', singular: 'Tutor', img: IMG('education.jpg'), open: '07:00', close: '21:00',
    brands: ['HomeTuitions Pro', 'LearnLead', 'GradeUp Tutors', 'ScholarSprint', 'TopperTribe', 'EduMentor', 'BrightMinds', 'StudySathi'],
    suffixes: ['Home Tuitions', 'Tuition Centre', 'Learning Academy', 'Study Centre'],
    taglines: ['CBSE / ICSE / State', 'Home + online', 'Verified tutors'],
    roles: ['Maths Tutor', 'Science Tutor', 'English Tutor', 'Coordinator'],
    services: [
      { n: 'Trial Class', d: 'Free 1-hour session', dur: 60, lo: 0, hi: 0 },
      { n: 'Monthly Tuition (1-5)', d: 'All subjects', dur: 60, lo: 2000, hi: 5000 },
      { n: 'Monthly Tuition (6-10)', d: 'Maths + Science focus', dur: 90, lo: 3000, hi: 8000 },
      { n: 'Spoken English', d: '30-day fluency course', dur: 60, lo: 2500, hi: 6000 },
    ],
    facilities: ['Verified Tutors', 'Progress Reports', 'Online Option', 'Small Batches'],
  },
  {
    name: 'Driving Schools', singular: 'Driving School', img: IMG('car.jpg'), open: '07:00', close: '20:00',
    brands: ['Maruti-style', 'SafeDrive', 'WheelGuru', 'DriveMate', 'RoadReady', 'SwiftWheels', 'ConfidentDrive', 'PerfectGear'].map((s) => s.replace('-style', ' Driving')),
    suffixes: ['Driving School', 'Motor Training', 'Driving Academy'],
    taglines: ['Dual-control cars', 'RTO licence help', 'Lady instructors'],
    roles: ['Driving Instructor', 'Senior Instructor', 'RTO Coordinator'],
    services: [
      { n: 'Car Training (10 days)', d: 'Manual + auto basics', dur: 60, lo: 4500, hi: 9000 },
      { n: 'Car Training (20 days)', d: 'Zero to confident', dur: 60, lo: 7500, hi: 14000 },
      { n: 'Licence Assistance', d: 'LL + DL + RTO slot', dur: 30, lo: 1500, hi: 3500 },
      { n: 'Refresher (5 days)', d: 'For licence holders', dur: 60, lo: 3000, hi: 5500 },
    ],
    facilities: ['Dual-control Cars', 'Pickup & Drop', 'RTO Support', 'UPI Payments'],
  },
  {
    name: 'Passport Offices', singular: 'Passport Seva', img: IMG('law.jpg'), open: '09:00', close: '17:00',
    brands: ['Passport Seva Kendra', 'PSK Assistance Desk', 'Visa & Passport Hub', 'TravelDocsDesk'],
    suffixes: ['PSK Centre', 'Passport Assistance', 'Seva Kendra Support'],
    taglines: ['Appointment help', 'Document check', 'Tatkaal guidance'],
    roles: ['Documentation Expert', 'Appointment Coordinator'],
    services: [
      { n: 'New Passport Filing', d: 'Form + appointment', dur: 45, lo: 1000, hi: 2500 },
      { n: 'Renewal Filing', d: 'Reissue assistance', dur: 45, lo: 1000, hi: 2200 },
      { n: 'Document Verification', d: 'Pre-check + corrections', dur: 30, lo: 300, hi: 800 },
      { n: 'Tatkaal Guidance', d: 'Fast-track support', dur: 45, lo: 1500, hi: 3000 },
    ],
    facilities: ['Govt Authorized Help', 'Printing & Photos', 'UPI Payments'],
  },
  {
    name: 'Government Services', singular: 'Seva Center', img: IMG('law.jpg'), open: '09:00', close: '18:00',
    brands: ['MeeSeva-style', 'CSC-style', 'Aadhaar Seva Point', 'CitizenDesk', 'SevaSetu', 'eSeva Point', 'JanSeva Kendra', 'Sahayak Desk'].map((s) => s.replace('-style', '')),
    suffixes: ['Seva Kendra', 'Citizen Services', 'e-Seva Centre', 'Documentation Hub'],
    taglines: ['Aadhaar / PAN / voter', 'Certificates & affidavits', 'Same-day service'],
    roles: ['Service Executive', 'Documentation Officer'],
    services: [
      { n: 'Aadhaar Update', d: 'Mobile / address / biometric', dur: 30, lo: 100, hi: 300 },
      { n: 'PAN Application', d: 'New / correction / reprint', dur: 30, lo: 250, hi: 500 },
      { n: 'Income Certificate', d: 'Filing + follow-up', dur: 30, lo: 300, hi: 800 },
      { n: 'Affidavit & Notary', d: 'Draft + notarization', dur: 30, lo: 300, hi: 1000 },
    ],
    facilities: ['Printing & Scan', 'Photo Booth', 'UPI Payments', 'Token System'],
  },
  {
    name: 'Banks', singular: 'Bank Branch', img: IMG('law.jpg'), open: '10:00', close: '16:00',
    brands: ['HDFC-style', 'ICICI-style', 'SBI-style', 'Axis-style', 'Kotak-style', 'PNB-style'].map((s) => s.replace('-style', ' Bank Branch')),
    suffixes: ['Branch', 'Bank & Locker Desk', 'Financial Centre'],
    taglines: ['Priority counters', 'Locker facility', 'Loan desk'],
    roles: ['Branch Manager', 'Relationship Manager', 'Teller'],
    services: [
      { n: 'Account Opening', d: 'Savings / current / salary', dur: 30, lo: 0, hi: 0 },
      { n: 'Loan Consultation', d: 'Home / personal / auto', dur: 45, lo: 0, hi: 0 },
      { n: 'Locker Visit', d: 'Safe deposit access', dur: 15, lo: 0, hi: 0 },
      { n: 'Forex Desk', d: 'Cards + currency', dur: 20, lo: 0, hi: 0 },
    ],
    facilities: ['ATM Attached', 'Priority Counter', 'Parking', 'Wheelchair Access'],
  },
  {
    name: 'Insurance Offices', singular: 'Insurance', img: IMG('law.jpg'), open: '10:00', close: '18:00',
    brands: ['LIC-style', 'Star Health-style', 'HDFC Ergo-style', 'ICICI Lombard-style', 'PolicyDesk', 'CoverSure', 'InsureFirst', 'SafeGuard Advisors'].map((s) => s.replace('-style', '')),
    suffixes: ['Insurance', 'Insurance Advisors', 'Policy Centre'],
    taglines: ['Health + motor + life', 'Claim assistance', 'Zero-dep experts'],
    roles: ['Insurance Advisor', 'Claims Specialist', 'Branch Manager'],
    services: [
      { n: 'Health Insurance Plan', d: 'Family floater quotes', dur: 45, lo: 0, hi: 0 },
      { n: 'Motor Insurance', d: 'Car / bike renewal', dur: 20, lo: 0, hi: 0 },
      { n: 'Claim Filing Help', d: 'Cashless + reimbursement', dur: 30, lo: 0, hi: 0 },
      { n: 'Term Life Review', d: 'Cover-gap analysis', dur: 45, lo: 0, hi: 0 },
    ],
    facilities: ['Claim Desk', 'All Insurers', 'UPI Payments', 'Parking'],
  },
  {
    name: 'Lawyers', singular: 'Law Firm', img: IMG('law.jpg'), open: '10:00', close: '19:00',
    brands: ['LexVeritas', 'Nyaya Associates', 'JusticeJunction', 'LegalKart-style', 'VakilDesk', 'CaseCraft', 'Dharma Legal', 'AdvocateHub'].map((s) => s.replace('-style', '')),
    suffixes: ['Law Chambers', 'Advocates', 'Legal Associates', 'Law Firm'],
    taglines: ['Civil + criminal + family', 'High court practice', 'Confidential advice'],
    roles: ['Senior Advocate', 'Associate Lawyer', 'Paralegal'],
    services: [
      { n: 'Legal Consultation', d: '30-min expert advice', dur: 30, lo: 1000, hi: 5000 },
      { n: 'Property Registration', d: 'Draft + registration', dur: 120, lo: 5000, hi: 25000 },
      { n: 'Divorce / Family Case', d: 'Filing + counsel', dur: 60, lo: 11000, hi: 55000 },
      { n: 'Startup Incorporation', d: 'Pvt Ltd + compliance', dur: 60, lo: 8000, hi: 25000 },
      { n: 'Consumer Complaint', d: 'Draft + district forum', dur: 60, lo: 5000, hi: 15000 },
    ],
    facilities: ['Private Chambers', 'Video Consults', 'Document Vault', 'UPI Payments'],
  },
  {
    name: 'Professional Services', singular: 'Consultancy', img: IMG('law.jpg'), open: '10:00', close: '19:00',
    brands: ['SharpTax', 'AccuBooks', 'ComplyKart', 'AuditAce', 'FinEdge', 'BizComply', 'LedgerLine', 'TaxMitra'],
    suffixes: ['CA & Consultants', 'Tax Consultants', 'Audit Firm', 'Business Consultants'],
    taglines: ['CA-led advisory', 'GST + income tax', 'Startup compliance'],
    roles: ['Chartered Accountant', 'CS Associate', 'Tax Consultant', 'Audit Assistant'],
    services: [
      { n: 'ITR Filing', d: 'Salaried / business', dur: 45, lo: 999, hi: 4999 },
      { n: 'GST Registration', d: 'New GSTIN + setup', dur: 60, lo: 1999, hi: 5999 },
      { n: 'Monthly Bookkeeping', d: 'Ledgers + GST returns', dur: 60, lo: 3000, hi: 12000 },
      { n: 'Company Formation', d: 'Pvt Ltd / LLP end-to-end', dur: 60, lo: 9999, hi: 29999 },
    ],
    facilities: ['CA Signed', 'Digital Filing', 'Video Consults', 'UPI Payments'],
  },
  {
    name: 'Consultants', singular: 'Consultant', img: IMG('coaching.jpg'), open: '10:00', close: '19:00',
    brands: ['CareerCraft', 'VisaVerse', 'StudyAbroad Pro', 'GrowthGuru', 'PathFinders', 'EduBridge', 'CareerClarity', 'MentorMap'],
    suffixes: ['Consultancy', 'Career Consultants', 'Education Consultants', 'Visa Consultants'],
    taglines: ['Study abroad experts', 'Career counselling', 'Visa filing'],
    roles: ['Senior Counsellor', 'Visa Expert', 'Career Coach'],
    services: [
      { n: 'Career Counselling', d: 'Aptitude + roadmap', dur: 60, lo: 1500, hi: 4000 },
      { n: 'Study Abroad Plan', d: 'Shortlist + SOP + visa', dur: 60, lo: 0, hi: 0 },
      { n: 'Resume Makeover', d: 'ATS + LinkedIn revamp', dur: 60, lo: 1500, hi: 5000 },
      { n: 'Mock Interview', d: 'HR + technical rounds', dur: 60, lo: 999, hi: 2999 },
    ],
    facilities: ['1-on-1 Sessions', 'Online Option', 'Resource Library', 'UPI Payments'],
  },
  {
    name: 'Pet Clinics', singular: 'Pet Clinic', img: IMG('clinic.jpg'), open: '09:00', close: '21:00',
    brands: ['CrownVet-style', 'Paws & Claws', 'HappyTails', 'VetCare Plus', 'FurryFriends', 'PetPals Clinic', 'WagWell', 'Pawfect Care'].map((s) => s.replace('-style', '')),
    suffixes: ['Pet Clinic', 'Veterinary Clinic', 'Pet Care Centre'],
    taglines: ['Dogs + cats + exotics', 'Vaccinations', 'Grooming + boarding'],
    roles: ['Veterinarian', 'Vet Assistant', 'Groomer'],
    services: [
      { n: 'Vet Consultation', d: 'General health check', dur: 20, lo: 400, hi: 800 },
      { n: 'Vaccination', d: 'ARV / DHPPi / FVRCP', dur: 15, lo: 400, hi: 1800 },
      { n: 'Pet Grooming', d: 'Bath + cut + nails', dur: 90, lo: 800, hi: 2500 },
      { n: 'Deworming', d: 'All breeds', dur: 15, lo: 200, hi: 500 },
    ],
    facilities: ['In-house Lab', 'Pet Pharmacy', 'Grooming Spa', 'Boarding', 'Parking'],
  },
  {
    name: 'Veterinary Hospitals', singular: 'Vet Hospital', img: IMG('hospital.jpg'), open: '00:00', close: '23:59',
    brands: ['VetSuperCare', 'AnimalAid Hospital', 'PetEmergency 24×7', 'VetLife Hospital', 'PawsHospital', 'HealPaws'],
    suffixes: ['Veterinary Hospital', 'Animal Hospital', 'Pet Emergency'],
    taglines: ['24×7 pet emergency', 'Surgery + ICU', 'Digital X-ray'],
    roles: ['Veterinary Surgeon', 'Emergency Vet', 'Vet Nurse'],
    services: [
      { n: 'Emergency Care', d: '24×7 casualty', dur: 60, lo: 1000, hi: 5000 },
      { n: 'Pet Surgery', d: 'Spay / neuter / ortho', dur: 120, lo: 5000, hi: 30000 },
      { n: 'Pet Dental Cleaning', d: 'Scaling under sedation', dur: 60, lo: 3000, hi: 8000 },
      { n: 'Health Package', d: 'Senior pet screening', dur: 45, lo: 1999, hi: 4999 },
    ],
    facilities: ['24×7 Emergency', 'Surgery OT', 'Pet ICU', 'In-house Lab', 'Parking'],
  },
  {
    name: 'Car Rentals', singular: 'Car Rental', img: IMG('car.jpg'), open: '00:00', close: '23:59',
    brands: ['Zoomcar-style', 'Revv-style', 'Myles-style', 'DriveEasy', 'RentRide', 'SwiftWheels Rental', 'CityCruise', 'GoDrive'].map((s) => s.replace('-style', '')),
    suffixes: ['Car Rentals', 'Self-Drive Cars', 'Chauffeur Cars', 'Rent-a-Car'],
    taglines: ['Self-drive + chauffeur', 'Unlimited km plans', 'Doorstep delivery'],
    roles: ['Fleet Manager', 'Driver Partner', 'Support Executive'],
    services: [
      { n: 'Hatchback / Day', d: 'Swift / Baleno self-drive', dur: 1440, lo: 1800, hi: 2800 },
      { n: 'SUV / Day', d: 'Creta / XUV self-drive', dur: 1440, lo: 3500, hi: 6500 },
      { n: 'Chauffeur 8h/80km', d: 'Sedan with driver', dur: 480, lo: 2500, hi: 4500 },
      { n: 'Airport Drop', d: 'One-way transfer', dur: 120, lo: 900, hi: 2200 },
      { n: 'Outstation / Day', d: '250 km package', dur: 1440, lo: 3000, hi: 6000 },
    ],
    facilities: ['Doorstep Delivery', '24×7 Support', 'Full Insurance', 'UPI Payments', 'GPS Tracked'],
  },
  {
    name: 'Bike Rentals', singular: 'Bike Rental', img: IMG('car.jpg'), open: '08:00', close: '22:00',
    brands: ['Royal Brothers-style', 'WickedRide-style', 'BikeBlitz', 'ThrottleRent', 'RoadRider Rentals', 'GearUp Bikes', 'MotoMela', 'RideReady'].map((s) => s.replace('-style', '')),
    suffixes: ['Bike Rentals', 'Motorcycle Rentals', 'Scooter Rentals'],
    taglines: ['RE + KTM + Activa', 'Helmets included', 'One-way options'],
    roles: ['Fleet Executive', 'Mechanic', 'Support Staff'],
    services: [
      { n: 'Scooter / Day', d: 'Activa / Ntorq', dur: 1440, lo: 500, hi: 900 },
      { n: 'Royal Enfield / Day', d: 'Classic 350', dur: 1440, lo: 1500, hi: 2500 },
      { n: 'Sport Bike / Day', d: 'KTM / R15 / Apache', dur: 1440, lo: 1800, hi: 3500 },
      { n: 'Weekend Package', d: 'Sat–Sun unlimited fun', dur: 2880, lo: 2500, hi: 6000 },
    ],
    facilities: ['Helmets Included', 'Roadside Assist', 'UPI Payments', 'Luggage Rack'],
  },
  {
    name: 'Car Service Centers', singular: 'Car Service', img: IMG('car.jpg'), open: '09:00', close: '20:00',
    brands: ['GoMechanic-style', 'Pitstop-style', 'Mahindra First-style', 'CarClinic', 'AutoMend', 'MotorWorks', 'FixMyCar', 'ServiceLane'].map((s) => s.replace('-style', '')),
    suffixes: ['Car Service', 'Auto Garage', 'Car Care Studio', 'Multi-brand Service'],
    taglines: ['All brands serviced', 'Free pickup & drop', 'Upfront pricing'],
    roles: ['Service Advisor', 'Master Technician', 'Detailing Expert', 'Electrician'],
    services: [
      { n: 'General Service', d: 'Oil + filters + checkup', dur: 240, lo: 2499, hi: 7999 },
      { n: 'Car Detailing', d: 'Interior + exterior spa', dur: 300, lo: 1999, hi: 8999 },
      { n: 'AC Repair & Gas', d: 'Cooling + leak check', dur: 120, lo: 1499, hi: 4999 },
      { n: 'Dent & Paint (Panel)', d: 'Insurance + cash jobs', dur: 480, lo: 2500, hi: 8000 },
      { n: 'Wheel Alignment', d: 'Balancing + rotation', dur: 60, lo: 800, hi: 2000 },
    ],
    facilities: ['Free Pickup', 'Live Tracking', 'Genuine Parts', 'Waiting Lounge', 'UPI Payments'],
  },
  {
    name: 'EV Charging Stations', singular: 'EV Charging', img: IMG('car.jpg'), open: '00:00', close: '23:59',
    brands: ['Tata Power-style', 'ChargeZone-style', 'Statiq-style', 'VoltHub', 'ChargeKart', 'ElectronStop', 'PlugPoint', 'GreenWatt'].map((s) => s.replace('-style', ' EZ Charge')),
    suffixes: ['EV Charging', 'Charge Station', 'Fast Charging Hub'],
    taglines: ['60kW DC fast chargers', 'Cafe + wifi lounge', 'All connectors'],
    roles: ['Station Attendant', 'Support Engineer'],
    services: [
      { n: 'DC Fast Charge', d: '20–80% in ~45 min', dur: 60, lo: 400, hi: 1200 },
      { n: 'AC Slow Charge', d: 'Overnight / mall parking', dur: 240, lo: 200, hi: 600 },
      { n: 'Slot Reservation', d: 'Guaranteed charger slot', dur: 15, lo: 50, hi: 150 },
    ],
    facilities: ['DC Fast Chargers', 'Cafe Lounge', 'Restrooms', 'UPI Payments', 'CCTV'],
  },
  {
    name: 'Home Services', singular: 'Home Service', img: IMG('education.jpg'), open: '08:00', close: '21:00',
    brands: ['Urban Company-style', 'HouseJoy-style', 'Broomees-style', 'GharSeva', 'HomeMate', 'FixKar', 'SevaHome', 'Doorstep Pro'].map((s) => s.replace('-style', '')),
    suffixes: ['Home Services', 'Doorstep Services', 'Home Care'],
    taglines: ['Verified pros', 'Upfront pricing', 'Service warranty'],
    roles: ['Service Professional', 'Quality Auditor', 'Support Executive'],
    services: [
      { n: 'Home Deep Cleaning', d: '2–3 BHK full clean', dur: 240, lo: 2499, hi: 6999 },
      { n: 'AC Service', d: 'Foam + gas check', dur: 90, lo: 499, hi: 1499 },
      { n: 'Appliance Repair', d: 'Fridge / WM / TV', dur: 60, lo: 349, hi: 1500 },
      { n: 'Pest Control', d: 'Cockroach + mosquito', dur: 90, lo: 999, hi: 2999 },
      { n: 'Salon at Home', d: 'Women / men grooming', dur: 90, lo: 499, hi: 2999 },
    ],
    facilities: ['Verified Pros', 'Upfront Pricing', 'Warranty', 'UPI Payments'],
  },
  {
    name: 'Electricians', singular: 'Electrician', img: IMG('education.jpg'), open: '08:00', close: '22:00',
    brands: ['VoltFix', 'BijliMistri', 'WireWizard', 'CurrentCrew', 'SparkSquad', 'PowerPlug Pros'],
    suffixes: ['Electrical Services', 'Electrician on Call', 'Wiring Experts'],
    taglines: ['Same-day visits', 'Safety certified', 'All brands'],
    roles: ['Electrician', 'Senior Electrician'],
    services: [
      { n: 'Home Visit + Repair', d: 'Switches / fans / MCB', dur: 60, lo: 199, hi: 799 },
      { n: 'Fan Installation', d: 'Ceiling / wall / exhaust', dur: 45, lo: 249, hi: 499 },
      { n: 'Full House Wiring', d: 'New / rewiring quote', dur: 480, lo: 8000, hi: 40000 },
      { n: 'Inverter Setup', d: 'Install + battery', dur: 90, lo: 500, hi: 1500 },
    ],
    facilities: ['Same-day Visit', 'Genuine Parts', 'UPI Payments', 'Warranty'],
  },
  {
    name: 'Plumbers', singular: 'Plumber', img: IMG('education.jpg'), open: '08:00', close: '22:00',
    brands: ['PipeDoctor', 'NalKarigar', 'FlowFix', 'LeakLock Pros', 'AquaPlumb', 'DrainMasters'],
    suffixes: ['Plumbing Services', 'Plumber on Call', 'Pipe & Fittings'],
    taglines: ['Leak to bathroom Reno', '90-min response', 'Upfront rates'],
    roles: ['Plumber', 'Senior Plumber'],
    services: [
      { n: 'Home Visit + Repair', d: 'Taps / leaks / flush', dur: 60, lo: 199, hi: 799 },
      { n: 'Bathroom Fittings', d: 'Shower / mixer / WC', dur: 90, lo: 499, hi: 2500 },
      { n: 'Water Tank Cleaning', d: '500–2000L tanks', dur: 120, lo: 800, hi: 2500 },
      { n: 'Blockage Removal', d: 'Kitchen / drain lines', dur: 60, lo: 499, hi: 1500 },
    ],
    facilities: ['90-min Response', 'Genuine Parts', 'UPI Payments', 'Warranty'],
  },
  {
    name: 'Cleaners', singular: 'Cleaning', img: IMG('education.jpg'), open: '08:00', close: '21:00',
    brands: ['SparkleHome', 'DustBusters', 'CleanSweep Pro', 'Shine Squad', 'NeatNest', 'HygieneHeroes'],
    suffixes: ['Cleaning Services', 'Deep Cleaning Co', 'Home Cleaners'],
    taglines: ['Trained + verified staff', 'Eco chemicals', 'Re-clean guarantee'],
    roles: ['Cleaning Lead', 'Cleaning Executive'],
    services: [
      { n: '1BHK Deep Clean', d: 'Kitchen + bath + floors', dur: 180, lo: 1499, hi: 2999 },
      { n: '3BHK Deep Clean', d: 'Full home detailing', dur: 300, lo: 2999, hi: 6999 },
      { n: 'Sofa + Carpet Shampoo', d: '5-seater + rugs', dur: 120, lo: 999, hi: 2499 },
      { n: 'Move-in / Out Clean', d: 'Empty flat detailing', dur: 240, lo: 2499, hi: 5999 },
    ],
    facilities: ['Eco Chemicals', 'Own Equipment', 'Re-clean Promise', 'UPI Payments'],
  },
  {
    name: 'Event Venues', singular: 'Event Venue', img: IMG('hotel.jpg'), open: '09:00', close: '22:00',
    brands: ['GrandCelebrations', 'VenueVault', 'PartyPalace', 'ShaadiScape', 'CelebrateHub', 'Milestone Manor', 'FestiveLawns', 'BanquetBliss'],
    suffixes: ['Banquets', 'Convention Centre', 'Party Lawns', 'Event Venue'],
    taglines: ['Weddings + corporate', 'In-house catering', 'Decor partners'],
    roles: ['Venue Manager', 'Event Planner', 'Catering Lead'],
    services: [
      { n: 'Banquet (100 guests)', d: '4-hour slot + basics', dur: 240, lo: 40000, hi: 120000 },
      { n: 'Lawn (300 guests)', d: 'Evening wedding slot', dur: 300, lo: 90000, hi: 250000 },
      { n: 'Conference Hall', d: 'Corporate day package', dur: 480, lo: 25000, hi: 80000 },
      { n: 'Birthday Package', d: 'Decor + cake + host', dur: 180, lo: 15000, hi: 50000 },
    ],
    facilities: ['In-house Catering', 'Bridal Rooms', 'Parking', 'Power Backup', 'Decor Panel'],
  },
  {
    name: 'Photography Studios', singular: 'Photo Studio', img: IMG('coaching.jpg'), open: '09:00', close: '21:00',
    brands: ['LensKart-style', 'PixelPerfect', 'CandidTales', 'ShutterSoul', 'FrameCraft', 'MomentsMaker', 'LightLeak Studio', 'Aperture Art'].map((s) => s.replace('-style', '')),
    suffixes: ['Photography', 'Photo Studio', 'Films & Photos', 'Candid Studio'],
    taglines: ['Wedding + pre-wedding', 'Candid + traditional', 'Same-day teaser'],
    roles: ['Lead Photographer', 'Cinematographer', 'Editor', 'Drone Pilot'],
    services: [
      { n: 'Portrait Session', d: '1-hour studio shoot', dur: 60, lo: 2500, hi: 8000 },
      { n: 'Pre-wedding Shoot', d: '2 locations + teaser', dur: 480, lo: 25000, hi: 80000 },
      { n: 'Wedding Day', d: 'Photo + video team', dur: 600, lo: 60000, hi: 200000 },
      { n: 'Product Shoot', d: 'E-commerce catalogue', dur: 180, lo: 5000, hi: 25000 },
    ],
    facilities: ['Studio Floor', 'Drone + Gimbal', 'Same-day Teaser', 'UPI Payments'],
  },
  {
    name: 'Travel Agencies', singular: 'Travel Agency', img: IMG('hotel.jpg'), open: '10:00', close: '20:00',
    brands: ['MakeMyTrip-style', 'Yatra-style', 'Thomas Cook-style', 'WanderLust Trips', 'YatraMitra', 'GlobeTrek', 'HolidayHopper', 'SafarSathi'].map((s) => s.replace('-style', '')),
    suffixes: ['Travels', 'Holidays', 'Tours & Travels', 'Travel Agency'],
    taglines: ['Domestic + international', 'Visa + forex', 'Group departures'],
    roles: ['Travel Consultant', 'Visa Expert', 'Tour Manager'],
    services: [
      { n: 'Flight Booking', d: 'Best-fare promise', dur: 30, lo: 0, hi: 0 },
      { n: 'Holiday Package (3N)', d: 'Goa / Kerala / Dubai', dur: 60, lo: 15000, hi: 90000 },
      { n: 'Visa Filing', d: 'Schengen / US / UK', dur: 45, lo: 2000, hi: 8000 },
      { n: 'Honeymoon Special', d: 'Bali / Maldives / Manali', dur: 60, lo: 40000, hi: 150000 },
    ],
    facilities: ['IATA Partners', 'Visa Desk', 'Forex', 'EMI Options', 'UPI Payments'],
  },
];

// Legacy alias map (old category names -> current)
export const CATEGORY_ALIASES: Record<string, string> = {
  Doctors: 'Clinics',
  'Sports Academies': 'Sports Centers',
};

// ---------------------------------------------------------------------------
// Name pools
// ---------------------------------------------------------------------------

const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir', 'Ananya', 'Diya', 'Aadhya', 'Myra', 'Sara', 'Ira', 'Priya', 'Neha', 'Kavya', 'Anika', 'Rahul', 'Amit', 'Suresh', 'Ramesh', 'Priyanka', 'Deepak', 'Sneha', 'Kiran', 'Manish', 'Pooja', 'Vikram', 'Sharma', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Mehta', 'Khan', 'Das', 'Kulkarni'];
const LAST = ['Sharma', 'Verma', 'Reddy', 'Iyer', 'Nair', 'Gupta', 'Mehta', 'Khan', 'Das', 'Kulkarni', 'Patel', 'Singh', 'Yadav', 'Chowdary', 'Rao', 'Menon', 'Agarwal', 'Jain', 'Mishra', 'Pandey', 'Ghosh', 'Banerjee', 'Chatterjee', 'Pillai', 'Nambiar', 'Shetty', 'Hegde', 'Rathore', 'Chauhan', 'Pawar', 'Deshmukh', 'Joshi', 'Trivedi', 'Bhatt', 'Kaur', 'Gill', 'Anand', 'Krishnan', 'Subramanian', 'Venkatesh'];
const REVIEW_TITLES = ['Excellent experience', 'Highly recommended', 'Very professional', 'Great service', 'Worth every rupee', 'Smooth & quick', 'Best in the area', 'Courteous staff', 'Top-notch quality', 'Will visit again'];
const REVIEW_GOOD = [
  'Booked through Velora and got instant confirmation. Staff was courteous and the place was very clean.',
  'Zero waiting time with the reserved slot. Very professional service, highly recommended for families.',
  'Great experience overall. Pricing was transparent and the quality exceeded expectations.',
  'Neat, hygienic and well-managed. The specialist explained everything patiently. Five stars!',
  'Easy booking, polite staff and excellent results. Best option in this area in my opinion.',
  'Visited on a weekend — slot started exactly on time. Impressed with the process and care.',
];
const REVIEW_MID = [
  'Good service overall, though there was a short wait during peak hours. Quality was solid.',
  'Decent experience. Staff is helpful; parking can be tricky on weekends. Would return.',
  'Satisfied with the service. Slightly pricey but the quality justifies it.',
];
const REVIEW_BAD = [
  'Service was okay but the wait was longer than expected. Book an early slot to avoid rush.',
  'Average experience — good staff but the place gets crowded in the evenings.',
];
const OFFER_TEMPLATES = [
  { t: 'First-visit special', d: 'Flat 20% OFF your first booking', code: 'WELCOME20', pct: 20 },
  { t: 'Weekday saver', d: 'Extra 15% OFF Mon–Thu slots', code: 'WEEKDAY15', pct: 15 },
  { t: 'Early-bird deal', d: '10% OFF morning slots before 11 AM', code: 'EARLY10', pct: 10 },
  { t: 'Family pack', d: 'Book for 3+, get 25% OFF total', code: 'FAMILY25', pct: 25 },
  { t: 'Festive offer', d: 'Flat ₹200 OFF above ₹999', code: 'FESTIVE200', pct: 0 },
  { t: 'Student discount', d: '12% OFF with valid student ID', code: 'STUDENT12', pct: 12 },
  { t: 'Senior citizen care', d: 'Priority slots + 10% OFF', code: 'SENIOR10', pct: 10 },
  { t: 'Refer & earn', d: '₹150 credit for every referral', code: 'REFER150', pct: 0 },
];
const STREETS = ['Main Road', '1st Cross', '2nd Main', '100 Feet Road', '80 Feet Road', 'Ring Road', 'Station Road', 'Market Road', 'Lake View Road', 'Temple Street', 'Cross Road', 'High Street'];
const LANDMARKS = ['Near Metro Station', 'Opp. City Mall', 'Beside HDFC Bank', 'Near Bus Depot', 'Opp. Grand Hotel', 'Near Flyover', 'Above More Supermarket', 'Next to Apollo Pharmacy', 'Near Petrol Pump', 'Opp. Park Gate'];

// ---------------------------------------------------------------------------
// Business generation
// ---------------------------------------------------------------------------

export interface SyntheticOffer { title: string; desc: string; code: string; pct: number; valid_till: string; }
export interface SyntheticReview { id: string; name: string; rating: number; title: string; text: string; date: string; helpful: number; }
export interface SyntheticBusiness extends Business {
  slug: string;
  synthetic: true;
  area: string;
  landmark?: string;
  facilities: string[];
  amenities: string[];
  offers: SyntheticOffer[];
  price_level: 1 | 2 | 3 | 4;
  wait_min: number;
  queue_length: number;
  ai_popularity: number;
  open_now_hint: boolean;
  photos: string[];
  email?: string;
  website?: string;
}

const businessCache = new Map<string, SyntheticBusiness[]>();
const detailCache = new Map<number, SyntheticBusiness>();

function jitter(rnd: () => number, amt: number): number {
  return (rnd() - 0.5) * 2 * amt;
}

function pick<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function businessName(rnd: () => number, def: CategoryDef, area: string, city: string, idx: number): string {
  const style = rnd();
  if (style < 0.45) {
    return `${pick(rnd, def.brands)} ${pick(rnd, def.suffixes)}`;
  }
  if (style < 0.8) {
    return `${area} ${pick(rnd, def.suffixes)}`;
  }
  const cores = ['Prime', 'Elite', 'Royal', 'Grand', 'Supreme', 'Classic', 'Premium', 'Star', 'New', 'Shree', 'Sri', 'Om'];
  const name = `${pick(rnd, cores)} ${pick(rnd, def.brands)} ${def.singular}`;
  return idx > 3 ? `${name} ${area.split(' ')[0]}` : name;
}

function phoneFor(rnd: () => number): string {
  const prefixes = ['98', '99', '90', '91', '93', '94', '95', '96', '97', '98', '80', '81', '82', '83', '70', '72', '73', '79'];
  let n = pick(rnd, prefixes);
  for (let i = 0; i < 8; i++) n += Math.floor(rnd() * 10).toString();
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

function round5(n: number): number {
  if (n <= 0) return 0;
  return Math.round(n / 50) * 50 || 50;
}

export function getCityBusinesses(cityName: string, opts?: { category?: string; limit?: number }): SyntheticBusiness[] {
  const city = CITIES[cityIndex(cityName)] || CITIES[0];
  const cacheKey = city.slug;
  let all = businessCache.get(cacheKey);
  if (!all) {
    all = [];
    for (let catIdx = 0; catIdx < CATEGORY_DEFS.length; catIdx++) {
      const def = CATEGORY_DEFS[catIdx];
      for (let idx = 0; idx < PER_CAT_PER_CITY; idx++) {
        const id = SYN_BASE + cityIndex(city.name) * SYN_CITY_STRIDE + catIdx * SYN_CAT_STRIDE + idx;
        const rnd = mulberry32(hashStr(`${city.slug}|${def.name}|${idx}`));
        const area = city.areas[Math.floor(rnd() * city.areas.length)];
        const name = businessName(rnd, def, area, city.name, idx);
        const rating = Math.round((3.9 + rnd() * 1.1) * 10) / 10;
        const reviewCount = 40 + Math.floor(rnd() * 2400);
        const featured = rnd() > 0.9;
        const priceLevel = (1 + Math.floor(rnd() * 4)) as 1 | 2 | 3 | 4;
        const popularity = 55 + Math.floor(rnd() * 45);
        const lat = city.lat + jitter(rnd, 0.09);
        const lng = city.lng + jitter(rnd, 0.09);
        const streetNo = 1 + Math.floor(rnd() * 120);
        const street = pick(rnd, STREETS);
        const landmark = pick(rnd, LANDMARKS);
        const address = `${streetNo}, ${street}, ${area}, ${city.name}`;
        const facCount = 4 + Math.floor(rnd() * 3);
        const facilities = [...def.facilities].sort(() => rnd() - 0.5).slice(0, Math.min(facCount, def.facilities.length));
        const amenities = ['UPI Payments', 'Online Booking', 'GST Invoice', 'Free Cancellation'].slice(0, 2 + Math.floor(rnd() * 3));
        const offerCount = 1 + Math.floor(rnd() * 3);
        const offers: SyntheticOffer[] = [];
        const used = new Set<number>();
        for (let o = 0; o < offerCount; o++) {
          let oi = Math.floor(rnd() * OFFER_TEMPLATES.length);
          if (used.has(oi)) oi = (oi + 3) % OFFER_TEMPLATES.length;
          used.add(oi);
          const t = OFFER_TEMPLATES[oi];
          const valid = new Date(Date.now() + (7 + Math.floor(rnd() * 45)) * 86400000);
          offers.push({ title: t.t, desc: t.d, code: t.code, pct: t.pct, valid_till: valid.toISOString().slice(0, 10) });
        }
        const seed = `velora-${id}`;
        all.push({
          id,
          slug: `${city.slug}-${def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`,
          synthetic: true,
          name,
          tagline: pick(rnd, def.taglines),
          category: def.name,
          description: `${name} in ${area}, ${city.name} — ${pick(rnd, def.taglines).toLowerCase()}. Rated ${rating} by ${reviewCount}+ customers with instant Velora booking, live queue updates and easy rescheduling.`,
          address,
          city: city.name,
          area,
          landmark,
          lat: Math.round(lat * 100000) / 100000,
          lng: Math.round(lng * 100000) / 100000,
          phone: phoneFor(rnd),
          email: `care@${name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'velora'}.in`,
          rating,
          review_count: reviewCount,
          image_url: `https://picsum.photos/seed/${seed}/640/420`,
          cover_url: `https://picsum.photos/seed/${seed}-cover/1200/500`,
          photos: [0, 1, 2].map((p) => `https://picsum.photos/seed/${seed}-p${p}/640/420`),
          featured,
          open_time: def.open,
          close_time: def.close,
          facilities,
          amenities,
          offers,
          price_level: priceLevel,
          wait_min: 5 + Math.floor(rnd() * 30),
          queue_length: Math.floor(rnd() * 10),
          ai_popularity: popularity,
          open_now_hint: true,
        });
      }
    }
    // Sort: featured first, then popularity
    all.sort((a, b) => Number(b.featured || false) - Number(a.featured || false) || b.ai_popularity - a.ai_popularity);
    businessCache.set(cacheKey, all);
  }
  let out = all;
  if (opts?.category && opts.category !== 'All') {
    const cat = CATEGORY_ALIASES[opts.category] || opts.category;
    out = out.filter((b) => b.category === cat);
  }
  if (opts?.limit) out = out.slice(0, opts.limit);
  return out;
}

export function getSyntheticBusiness(id: number | string): SyntheticBusiness | null {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  const hit = detailCache.get(n);
  if (hit) return hit;
  const dec = decodeSyntheticId(n);
  if (!dec) return null;
  const city = CITIES[dec.cityIdx];
  const def = CATEGORY_DEFS[dec.catIdx];
  if (!city || !def) return null;
  const list = getCityBusinesses(city.name);
  const found = list.find((b) => b.id === n) || null;
  if (found) {
    // Attach services + staff (generated lazily, memoized)
    const full = attachDetails(found, def);
    detailCache.set(n, full);
    return full;
  }
  return null;
}

export function attachDetails(b: SyntheticBusiness, def?: CategoryDef): SyntheticBusiness {
  if (b.services && b.services.length > 0 && b.staff && b.staff.length > 0) return b;
  const d = def || CATEGORY_DEFS.find((c) => c.name === b.category) || CATEGORY_DEFS[0];
  const rnd = mulberry32(hashStr(`details|${b.id}`));
  const svcCount = Math.min(d.services.length, 4 + Math.floor(rnd() * 3));
  const svcIdxs = [...d.services.keys()].sort(() => rnd() - 0.5).slice(0, svcCount);
  const services: BusinessService[] = svcIdxs.map((si, k) => {
    const t = d.services[si];
    const price = t.lo === 0 && t.hi === 0 ? 0 : round5(t.lo + rnd() * (t.hi - t.lo));
    return { id: Number(b.id) * 100 + si, business_id: b.id as number, name: t.n, description: t.d, duration_min: t.dur, price };
  });
  services.sort((a, b2) => a.price - b2.price);
  const staffCount = 2 + Math.floor(rnd() * 4);
  const staff: BusinessStaff[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < staffCount; i++) {
    let nm = `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`;
    if (usedNames.has(nm)) nm = `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`;
    usedNames.add(nm);
    staff.push({
      id: (b.id as number) * 1000 + i,
      business_id: b.id as number,
      name: nm,
      role: d.roles[i % d.roles.length],
    });
  }
  return { ...b, services, staff };
}

// ---------------------------------------------------------------------------
// Reviews / slots / analytics (deterministic)
// ---------------------------------------------------------------------------

export function getSyntheticReviews(bizId: number | string, count = 8): SyntheticReview[] {
  const b = getSyntheticBusiness(bizId);
  const rating = b?.rating || 4.3;
  const rnd = mulberry32(hashStr(`reviews|${bizId}`));
  const out: SyntheticReview[] = [];
  for (let i = 0; i < count; i++) {
    const r = rnd();
    let stars: number;
    let text: string;
    if (r < (rating - 3.4) / 1.6) {
      stars = 5;
      text = pick(rnd, REVIEW_GOOD);
    } else if (r < (rating - 3.0) / 1.6) {
      stars = 4;
      text = rnd() > 0.4 ? pick(rnd, REVIEW_GOOD) : pick(rnd, REVIEW_MID);
    } else if (r < 0.92) {
      stars = 3;
      text = pick(rnd, REVIEW_MID);
    } else {
      stars = 2;
      text = pick(rnd, REVIEW_BAD);
    }
    const daysAgo = Math.floor(rnd() * 180);
    const date = new Date(Date.now() - daysAgo * 86400000);
    out.push({
      id: `${bizId}-r${i}`,
      name: `${pick(rnd, FIRST)} ${pick(rnd, LAST)}`,
      rating: stars,
      title: pick(rnd, REVIEW_TITLES),
      text,
      date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      helpful: Math.floor(rnd() * 40),
    });
  }
  return out;
}

export interface SyntheticSlot {
  time: string; label: string; status: 'available' | 'busy' | 'booked';
  available: boolean; wait_min: number | null; crowd: number; score: number;
}

export function getSyntheticSlots(bizId: number, dateStr: string, durationMin: number, openTime: string, closeTime: string): SyntheticSlot[] {
  const rnd = mulberry32(hashStr(`slots|${bizId}|${dateStr}`));
  const openH = parseInt((openTime || '09:00').split(':')[0], 10);
  const closeH = openTime === '00:00' ? 24 : (parseInt((closeTime || '21:00').split(':')[0], 10) || 21);
  const now = Date.now();
  const day = new Date(`${dateStr}T00:00:00`);
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const loadFactor = isWeekend ? 0.42 : 0.26;
  const slots: SyntheticSlot[] = [];
  for (let h = openH; h < closeH; h++) {
    for (const m of [0, 30]) {
      const s = new Date(`${dateStr}T00:00:00`);
      s.setHours(h, m, 0, 0);
      if (s.getTime() < now - 60000) continue;
      const peak = (h >= 11 && h <= 13) || (h >= 17 && h <= 19);
      const roll = rnd();
      const taken = roll < loadFactor + (peak ? 0.18 : 0);
      const crowd = taken ? 2 + Math.floor(rnd() * 3) : peak ? Math.floor(rnd() * 3) : Math.floor(rnd() * 2);
      const status = taken ? 'booked' : crowd >= 2 ? 'busy' : 'available';
      const wait = taken ? null : Math.min(35, crowd * 8 + (peak ? 6 : 0));
      let score = 0;
      if (!taken) {
        score = 100 - (wait || 0) - crowd * 10 + (durationMin <= 30 ? 4 : 0);
        if (h >= 10 && h <= 11) score += 8;
        if (h >= 15 && h <= 16) score += 6;
        if (h >= 12 && h <= 13) score -= 6;
      }
      slots.push({
        time: s.toISOString(),
        label: s.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
        status, available: !taken, wait_min: wait, crowd, score: Math.round(score),
      });
    }
  }
  return slots;
}

export interface SyntheticHeatmap {
  days: { date: string; weekday: string; day: number; occupancy: number }[];
  hours: { hour: string; occupancy: number }[];
  best_days: { date: string; weekday: string; day: number; occupancy: number }[];
  busiest_day: { date: string; weekday: string; day: number; occupancy: number };
}

export function getSyntheticHeatmap(bizId: number | string): SyntheticHeatmap {
  const rnd = mulberry32(hashStr(`heat|${bizId}`));
  const bias = rnd() * 0.3;
  const days = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const wd = d.getDay();
    const weekend = wd === 0 || wd === 6;
    const occ = Math.min(0.96, Math.max(0.08, (weekend ? 0.55 : 0.3) + bias + (rnd() - 0.5) * 0.3 + (i === 0 ? 0.12 : 0)));
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      day: d.getDate(),
      occupancy: Math.round(occ * 100),
    });
  }
  const hours = [];
  for (let h = 9; h <= 20; h++) {
    const peak = (h >= 11 && h <= 13) || (h >= 17 && h <= 19);
    hours.push({ hour: `${h}:00`, occupancy: Math.round(Math.min(96, (peak ? 62 : 30) + rnd() * 25)) });
  }
  const best = [...days].filter((d) => d.occupancy < 55).sort((a, b) => a.occupancy - b.occupancy).slice(0, 3);
  const busiest = [...days].sort((a, b) => b.occupancy - a.occupancy)[0];
  return { days, hours, best_days: best.length ? best : days.slice(0, 3), busiest_day: busiest };
}
