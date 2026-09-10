import { LucideIcon } from 'lucide-react';
import {
  Stethoscope, Smile, Scissors, Dumbbell, Building2, Trophy, Scale, Car,
  GraduationCap, HeartPulse, Sparkles, Grid3x3, Hospital, Pill, Dog, Wrench,
  UtensilsCrossed, Coffee, Briefcase, Bike, Zap, Droplets, Camera, Plane,
  Home, Paintbrush, ShowerHead, Plug, Pipette, Dumbbell as DumbbellIcon,
  Flower2, Leaf, Activity, Waves, Target, CircleDot, Flag, BookOpen, KeyRound,
  Landmark, ShieldCheck, FileText, Baby, Syringe, Star, Music, Dumbbell as GymIcon,
} from 'lucide-react';

export interface Business {
  id: number | string; name: string; tagline?: string; category: string; description?: string;
  address?: string; city?: string; lat?: number; lng?: number; phone?: string;
  rating: number; review_count: number; image_url?: string; cover_url?: string;
  featured?: boolean; open_time?: string; close_time?: string;
  services?: BusinessService[]; staff?: BusinessStaff[];
  // Hybrid extensions (synthetic ecosystem + live Google Maps)
  slug?: string;
  synthetic?: boolean;
  live?: boolean;
  place_id?: string;
  area?: string;
  landmark?: string;
  email?: string;
  website?: string;
  maps_url?: string;
  facilities?: string[];
  amenities?: string[];
  offers?: BusinessOffer[];
  photos?: string[];
  hours_text?: string[];
  price_level?: number;
  price_from?: number | null;
  min_price?: number | null;
  wait_min?: number;
  queue_length?: number;
  ai_popularity?: number;
  distance_km?: number | null;
  travel_min?: number | null;
  open_now?: boolean;
  next_available?: boolean;
  next_available_label?: string | null;
  ai_score?: number;
  ai_reason?: string[] | string;
  live_bookable?: boolean;
  // Full address parts (demo tenant + console editing)
  line1?: string;
  street?: string;
  state?: string;
  pin?: string;
  country?: string;
  // Console state
  active?: boolean;
  demo?: boolean;
}
export interface BusinessOffer { title: string; desc: string; code: string; pct: number; valid_till?: string }
export interface BusinessService {
  id: number | string; business_id: number | string; name: string; description?: string; duration_min: number; price: number;
  active?: boolean; demo?: boolean;
}
export interface BusinessStaff {
  id: number | string; business_id: number | string; name: string; role?: string; avatar_url?: string;
  active?: boolean; demo?: boolean; service_ids?: (number | string)[]; days?: string[]; start?: string; end?: string;
}

// NOTE: first 10 entries preserve the original catalogue order exactly.
// New categories extend the ecosystem without disturbing existing UI.
export const CATEGORIES: { name: string; icon: LucideIcon; color: string }[] = [
  { name: 'All', icon: Grid3x3, color: '#818cf8' },
  { name: 'Clinics', icon: Stethoscope, color: '#60a5fa' },
  { name: 'Dentists', icon: Smile, color: '#22d3ee' },
  { name: 'Salons', icon: Scissors, color: '#f472b6' },
  { name: 'Fitness Centers', icon: Dumbbell, color: '#34d399' },
  { name: 'Hotels', icon: Building2, color: '#a78bfa' },
  { name: 'Sports Centers', icon: Trophy, color: '#fbbf24' },
  { name: 'Coaching Institutes', icon: GraduationCap, color: '#4ade80' },
  { name: 'Car Rentals', icon: Car, color: '#38bdf8' },
  { name: 'Professional Services', icon: Scale, color: '#f59e0b' },
  // ---- Expanded ecosystem ----
  { name: 'Hospitals', icon: Hospital, color: '#f87171' },
  { name: 'Diagnostic Centers', icon: Syringe, color: '#60a5fa' },
  { name: 'Pharmacies', icon: Pill, color: '#34d399' },
  { name: 'Spas', icon: Flower2, color: '#c084fc' },
  { name: 'Gyms', icon: GymIcon, color: '#4ade80' },
  { name: 'Yoga Studios', icon: Leaf, color: '#a3e635' },
  { name: 'Restaurants', icon: UtensilsCrossed, color: '#fb923c' },
  { name: 'Cafés', icon: Coffee, color: '#d6a97c' },
  { name: 'Coworking Spaces', icon: Briefcase, color: '#818cf8' },
  { name: 'Cricket Turfs', icon: Target, color: '#4ade80' },
  { name: 'Football Grounds', icon: CircleDot, color: '#38bdf8' },
  { name: 'Swimming Pools', icon: Waves, color: '#22d3ee' },
  { name: 'Badminton Courts', icon: Zap, color: '#facc15' },
  { name: 'Driving Schools', icon: KeyRound, color: '#94a3b8' },
  { name: 'Passport Offices', icon: BookOpen, color: '#60a5fa' },
  { name: 'Government Services', icon: Landmark, color: '#f59e0b' },
  { name: 'Banks', icon: Landmark, color: '#34d399' },
  { name: 'Insurance Offices', icon: ShieldCheck, color: '#38bdf8' },
  { name: 'Lawyers', icon: Scale, color: '#f59e0b' },
  { name: 'Consultants', icon: FileText, color: '#a78bfa' },
  { name: 'Tutors', icon: GraduationCap, color: '#4ade80' },
  { name: 'Pet Clinics', icon: Dog, color: '#fb923c' },
  { name: 'Veterinary Hospitals', icon: HeartPulse, color: '#f87171' },
  { name: 'Car Service Centers', icon: Wrench, color: '#94a3b8' },
  { name: 'EV Charging Stations', icon: Plug, color: '#4ade80' },
  { name: 'Bike Rentals', icon: Bike, color: '#fbbf24' },
  { name: 'Beauty Clinics', icon: Sparkles, color: '#f472b6' },
  { name: 'Physiotherapy Centers', icon: Activity, color: '#22d3ee' },
  { name: 'Wellness Centers', icon: Leaf, color: '#34d399' },
  { name: 'Home Services', icon: Home, color: '#60a5fa' },
  { name: 'Electricians', icon: Zap, color: '#facc15' },
  { name: 'Plumbers', icon: Droplets, color: '#38bdf8' },
  { name: 'Cleaners', icon: ShowerHead, color: '#22d3ee' },
  { name: 'Event Venues', icon: Flag, color: '#c084fc' },
  { name: 'Photography Studios', icon: Camera, color: '#f472b6' },
  { name: 'Travel Agencies', icon: Plane, color: '#38bdf8' },
  { name: 'Barbershops', icon: Paintbrush, color: '#d6a97c' },
];

export const categoryIcon = (cat: string): LucideIcon => {
  const found = CATEGORIES.find((c) => c.name === cat);
  if (found) return found.icon;
  if (cat === 'Doctors') return Stethoscope;
  if (cat === 'Sports Academies') return Trophy;
  if (cat === 'Gym') return DumbbellIcon;
  if (cat === 'Kids') return Baby;
  if (cat === 'Music') return Music;
  if (cat === 'Pipette') return Pipette;
  if (cat === 'Star') return Star;
  return Sparkles;
};
export const categoryColor = (cat: string): string => CATEGORIES.find((c) => c.name === cat)?.color || '#818cf8';

// ---- India-first formatting (INR + IST) ----
export function formatINR(amount: number | string): string {
  const n = Number(amount) || 0;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}
export function formatISTDate(d: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', ...opts });
}
export function formatISTTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true });
}
export function formatISTDateTime(d: string | Date): string {
  return `${formatISTDate(d, { weekday: 'short' })}, ${formatISTTime(d)} IST`;
}
export const INDIAN_CITIES = ['Hyderabad', 'Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Pune', 'Jaipur', 'Kolkata', 'Ahmedabad', 'Lucknow', 'Chandigarh', 'Indore', 'Varanasi', 'Surat', 'Nagpur', 'Kochi'];

export function mapsDirections(dest: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Local fallback image per category (used if a remote photo fails to load). */
/** Production: 36 real category photos in public/biz (zero placeholder-image). */
export function categoryFallbackImage(cat: string): string {
  const map: Record<string, string> = {
    Clinics: '/biz/clinic.jpg',
    Hospitals: '/biz/hospital.jpg',
    Dentists: '/biz/dental.jpg',
    'Diagnostic Centers': '/biz/diagnostic.jpg',
    Pharmacies: '/biz/pharmacy.jpg',
    Salons: '/biz/salon.jpg',
    Barbershops: '/biz/barber.jpg',
    Spas: '/biz/spa.jpg',
    'Beauty Clinics': '/biz/beauty.jpg',
    Gyms: '/biz/gym.jpg',
    'Fitness Centers': '/biz/gym.jpg',
    'Yoga Studios': '/biz/yoga.jpg',
    'Physiotherapy Centers': '/biz/physio.jpg',
    'Wellness Centers': '/biz/spa.jpg',
    Restaurants: '/biz/restaurant.jpg',
    'Cafés': '/biz/cafe.jpg',
    Hotels: '/biz/hotel.jpg',
    'Coworking Spaces': '/biz/coworking.jpg',
    'Sports Centers': '/biz/sports.jpg',
    'Cricket Turfs': '/biz/cricket.jpg',
    'Football Grounds': '/biz/football.jpg',
    'Swimming Pools': '/biz/swimming.jpg',
    'Badminton Courts': '/biz/badminton.jpg',
    'Coaching Institutes': '/biz/coaching.jpg',
    Tutors: '/biz/education.jpg',
    'Driving Schools': '/biz/driving.jpg',
    'Passport Offices': '/biz/law.jpg',
    'Government Services': '/biz/law.jpg',
    Banks: '/biz/bank.jpg',
    'Insurance Offices': '/biz/insurance.jpg',
    Lawyers: '/biz/law.jpg',
    'Professional Services': '/biz/law.jpg',
    Consultants: '/biz/coworking.jpg',
    'Pet Clinics': '/biz/pet.jpg',
    'Veterinary Hospitals': '/biz/hospital.jpg',
    'Car Rentals': '/biz/car.jpg',
    'Bike Rentals': '/biz/car.jpg',
    'Car Service Centers': '/biz/car-service.jpg',
    'EV Charging Stations': '/biz/car.jpg',
    'Home Services': '/biz/education.jpg',
    Electricians: '/biz/education.jpg',
    Plumbers: '/biz/education.jpg',
    Cleaners: '/biz/education.jpg',
    'Event Venues': '/biz/hotel.jpg',
    'Photography Studios': '/biz/coaching.jpg',
    'Travel Agencies': '/biz/hotel.jpg',
  };
  return map[cat] || '/biz/clinic.jpg';
}

/** Attach to <img onError> so remote photos degrade to a local asset, never broken. */
export function imgOnError(category: string) {
  return (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget;
    if (el.dataset.fbk) return;
    el.dataset.fbk = '1';
    el.src = categoryFallbackImage(category);
  };
}

export function staticMap(lat?: number, lng?: number, _zoom = 14) {
  // OpenStreetMap static-style embed via a lightweight tile preview (no key required).
  if (lat == null || lng == null) return null;
  const d = 0.01;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}
