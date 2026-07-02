import { LucideIcon } from 'lucide-react';
import { Stethoscope, Smile, Scissors, Dumbbell, Building2, Trophy, Scale, Car, GraduationCap, HeartPulse, Sparkles, Grid3x3 } from 'lucide-react';

export interface Business {
  id: number; name: string; tagline?: string; category: string; description?: string;
  address?: string; city?: string; lat?: number; lng?: number; phone?: string;
  rating: number; review_count: number; image_url?: string; cover_url?: string;
  featured?: boolean; open_time?: string; close_time?: string;
  services?: BusinessService[]; staff?: BusinessStaff[];
}
export interface BusinessService { id: number; business_id: number; name: string; description?: string; duration_min: number; price: number; }
export interface BusinessStaff { id: number; business_id: number; name: string; role?: string; avatar_url?: string; }

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
];

export const categoryIcon = (cat: string): LucideIcon => {
  const found = CATEGORIES.find((c) => c.name === cat);
  if (found) return found.icon;
  if (cat === 'Doctors' || cat === 'Hospitals') return HeartPulse;
  if (cat === 'Sports Academies') return Trophy;
  if (cat === 'Lawyers') return Scale;
  if (cat === 'Tutors') return GraduationCap;
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
export const INDIAN_CITIES = ['Jaipur', 'Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Ahmedabad', 'Kolkata', 'Lucknow', 'Chandigarh', 'Indore'];

export function mapsDirections(dest: string) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
export function staticMap(lat?: number, lng?: number, _zoom = 14) {
  // OpenStreetMap static-style embed via a lightweight tile preview (no key required).
  if (lat == null || lng == null) return null;
  const d = 0.01;
  const bbox = `${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
}
