// Velora city analytics — deterministic per-city dashboards (bookings,
// revenue, occupancy, top categories) so every dashboard feels alive.

import { hashStr, mulberry32 } from './synthetic';
import { CATEGORY_DEFS } from './synthetic';

export interface CityAnalytics {
  city: string;
  bookingsToday: number;
  bookingsWeek: number;
  revenueToday: number;
  revenueWeek: number;
  occupancyPct: number;
  avgRating: number;
  activeBusinesses: number;
  repeatRate: number;
  hourlyDemand: { hour: string; bookings: number }[];
  topCategories: { name: string; bookings: number; revenue: number }[];
  dailyTrend: { day: string; bookings: number; revenue: number }[];
}

export function getCityAnalytics(city: string): CityAnalytics {
  const rnd = mulberry32(hashStr(`analytics|${city}|${new Date().toISOString().slice(0, 10)}`));
  const base = 900 + Math.floor(rnd() * 2600);
  const bookingsToday = base;
  const bookingsWeek = base * 6 + Math.floor(rnd() * 2000);
  const avgTicket = 750 + Math.floor(rnd() * 650);
  const revenueToday = bookingsToday * avgTicket;
  const revenueWeek = bookingsWeek * avgTicket;
  const hours = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM'];
  const hourlyDemand = hours.map((h, i) => {
    const peak = (i >= 2 && i <= 4) || (i >= 8 && i <= 10);
    return { hour: h, bookings: Math.round(base * (peak ? 0.11 + rnd() * 0.04 : 0.045 + rnd() * 0.04)) };
  });
  const cats = [...CATEGORY_DEFS].sort(() => rnd() - 0.5).slice(0, 8).map((c, i) => {
    const b = Math.round(base * (0.16 - i * 0.015) * (0.8 + rnd() * 0.4));
    return { name: c.name, bookings: b, revenue: b * (400 + Math.floor(rnd() * 1800)) };
  });
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyTrend = days.map((d, i) => {
    const weekend = i >= 5;
    const b = Math.round(base * (weekend ? 1.35 : 0.85 + rnd() * 0.3));
    return { day: d, bookings: b, revenue: b * avgTicket };
  });
  return {
    city,
    bookingsToday,
    bookingsWeek,
    revenueToday,
    revenueWeek,
    occupancyPct: 58 + Math.floor(rnd() * 28),
    avgRating: Math.round((4.2 + rnd() * 0.5) * 10) / 10,
    activeBusinesses: CATEGORY_DEFS.length * 7,
    repeatRate: 32 + Math.floor(rnd() * 22),
    hourlyDemand,
    topCategories: cats,
    dailyTrend,
  };
}
