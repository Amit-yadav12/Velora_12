// Velora AI smart search — fuzzy matching, instant suggestions, trending,
// recently-viewed and personalized ranking. Pure functions, no network.

import type { Business } from './product';

export interface SearchFilters {
  category?: string;
  minRating?: number;
  maxKm?: number;
  priceMax?: number;
  openNow?: boolean;
  availableToday?: boolean;
}

const RECENT_KEY = 'velora-recent-views';
const SEARCH_HIST_KEY = 'velora-search-history';

export function normalize(s: string): string {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Token-aware fuzzy score: higher = better match. 0 = no match. */
export function fuzzyScore(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  const qTokens = q.split(' ');
  const tTokens = t.split(' ');
  let matched = 0;
  let score = 0;
  for (const qt of qTokens) {
    if (!qt) continue;
    let best = 0;
    for (const tt of tTokens) {
      if (tt === qt) best = Math.max(best, 20);
      else if (tt.startsWith(qt)) best = Math.max(best, 12);
      else if (tt.includes(qt)) best = Math.max(best, 7);
      else if (qt.length > 2 && subsequence(tt, qt)) best = Math.max(best, 3);
    }
    if (best > 0) { matched++; score += best; }
  }
  if (matched === 0) return 0;
  // Bonus when all tokens matched
  if (matched === qTokens.filter(Boolean).length) score += 10;
  return score;
}

function subsequence(text: string, pattern: string): boolean {
  let j = 0;
  for (let i = 0; i < text.length && j < pattern.length; i++) {
    if (text[i] === pattern[j]) j++;
  }
  return j === pattern.length;
}

export function searchBusinesses<T extends { name: string; category: string; description?: string; city?: string; area?: string; address?: string }>(
  list: T[], query: string, limit = 30
): { item: T; score: number }[] {
  const q = normalize(query);
  if (!q) return list.slice(0, limit).map((item) => ({ item, score: 1 }));
  const out: { item: T; score: number }[] = [];
  for (const item of list) {
    const hay = `${item.name} ${item.category} ${item.description || ''} ${item.area || ''} ${item.city || ''} ${item.address || ''}`;
    const s = fuzzyScore(hay, q) + fuzzyScore(item.name, q) * 0.8 + fuzzyScore(item.category, q) * 0.5;
    if (s > 0) out.push({ item, score: s });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

export interface Suggestion { kind: 'business' | 'category' | 'service' | 'area' | 'trending' | 'history'; text: string; sub?: string; id?: number | string }

export function buildSuggestions(opts: {
  query: string;
  businesses: Business[];
  categories: { name: string }[];
  city: string;
  limit?: number;
}): Suggestion[] {
  const { query, businesses, categories, city, limit = 8 } = opts;
  const q = normalize(query);
  const out: Suggestion[] = [];
  if (!q) {
    // Empty query: trending + history
    for (const h of readSearchHistory().slice(0, 3)) {
      out.push({ kind: 'history', text: h });
    }
    for (const t of trendingQueries(city).slice(0, 4)) {
      if (out.length >= (limit || 8)) break;
      out.push({ kind: 'trending', text: t });
    }
    return out;
  }
  // Categories first
  for (const c of categories) {
    if (c.name === 'All') continue;
    if (fuzzyScore(c.name, q) > 0) out.push({ kind: 'category', text: c.name, sub: `in ${city}` });
    if (out.length >= (limit || 8)) return out;
  }
  // Businesses
  const hits = searchBusinesses(businesses, q, limit || 8);
  for (const h of hits) {
    out.push({ kind: 'business', text: h.item.name, sub: `${h.item.category} · ${h.item.area || h.item.city || ''}`, id: h.item.id });
    if (out.length >= (limit || 8)) break;
  }
  return out;
}

/** Deterministic trending queries per city (rotates daily). */
export function trendingQueries(city: string): string[] {
  const pools = [
    ['Dentist near me', 'Hair spa', 'Full body checkup', 'Box cricket turf', 'Bridal makeup'],
    ['Physiotherapy', 'Skin clinic', 'Gym day pass', 'Pet grooming', 'Car detailing'],
    ['Eye checkup', 'Yoga classes', 'Salon at home', 'Swimming pool', 'Passport help'],
    ['Diagnostic labs', 'Spa deals', 'Football turf', 'Coworking day pass', 'Bike rental'],
  ];
  const day = Math.floor(Date.now() / 86400000);
  let h = 0;
  for (const ch of city) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pools[(h + day) % pools.length];
}

// ---- Recently viewed (local, instant) ----

export interface RecentView { id: number | string; name: string; category: string; city?: string; image_url?: string; rating?: number; at: number }

export function readRecentViews(): RecentView[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function pushRecentView(v: Omit<RecentView, 'at'>): void {
  try {
    const cur = readRecentViews().filter((r) => String(r.id) !== String(v.id));
    cur.unshift({ ...v, at: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 12)));
  } catch { /* non-fatal */ }
}

// ---- Search history ----

export function readSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HIST_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export function pushSearchHistory(q: string): void {
  const query = q.trim();
  if (query.length < 2) return;
  try {
    const cur = readSearchHistory().filter((s) => normalize(s) !== normalize(query));
    cur.unshift(query);
    localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(cur.slice(0, 10)));
  } catch { /* non-fatal */ }
}

// ---- Personalized ranking ----

export function personalizedBoost(biz: Business): number {
  try {
    const recent = readRecentViews();
    if (!recent.length) return 0;
    const catCount = new Map<string, number>();
    for (const r of recent) catCount.set(r.category, (catCount.get(r.category) || 0) + 1);
    const top = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c);
    if (top.includes(biz.category)) return 12;
    return 0;
  } catch {
    return 0;
  }
}

// ---- Advanced filters ----

export function applyFilters<T extends {
  category: string; rating: number; distance_km?: number | null;
  price_from?: number | null; min_price?: number | null; services?: { price: number }[];
  open_now?: boolean; next_available?: boolean;
}>(list: T[], f: SearchFilters): T[] {
  return list.filter((b) => {
    if (f.category && f.category !== 'All' && b.category !== f.category) return false;
    if (f.minRating && b.rating < f.minRating) return false;
    if (f.maxKm && (b.distance_km == null || b.distance_km > f.maxKm)) return false;
    if (f.priceMax) {
      const from = b.price_from ?? b.min_price ?? (b.services?.length ? Math.min(...b.services.map((s) => s.price)) : null);
      if (from != null && from > f.priceMax) return false;
    }
    if (f.openNow && !b.open_now) return false;
    if (f.availableToday && !b.next_available) return false;
    return true;
  });
}
