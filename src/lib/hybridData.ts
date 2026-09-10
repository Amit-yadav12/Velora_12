// Velora hybrid data layer — the single source of truth for all pages.
// Combines (1) Supabase/DB rows via API, (2) the deterministic synthetic city
// ecosystem, and (3) live Google Maps places. City-scoped everywhere with
// cached, fast responses and graceful offline fallbacks.

import { getCity, DEFAULT_CITY_NAME } from './cities';
import {
  getCityBusinesses, getSyntheticBusiness, attachDetails, getSyntheticSlots,
  getSyntheticReviews, getSyntheticHeatmap, hashStr, mulberry32, isSyntheticId,
  CATEGORY_ALIASES, CATEGORY_DEFS,
} from './synthetic';
import { cachedFetch, cacheGet, cacheSet, timedJson } from './smartCache';
import { fetchLivePlaces, liveToBusiness, type LivePlace } from './googleMaps';
import { searchBusinesses, applyFilters, personalizedBoost } from './smartSearch';
import { getDemoBusiness, isDemoBusinessId, listDemoBusinesses, demoSlots, demoFullAddress, type DemoBusinessDetails } from './demoStore';
import { listLocalBookings } from './offlineStore';
import type { Business } from './product';
import type { Slot } from '../components/premium/BookingTimeline';
import type { HeatmapData, NearestData, ReviewRow } from './types';

export interface DiscoverParams {
  city?: string;
  lat: number;
  lng: number;
  category?: string;
  q?: string;
  sort?: string;
  openNow?: boolean;
  minRating?: number;
  maxKm?: number;
  priceMax?: number;
  includeLive?: boolean;
}

export interface DiscoverResult {
  count: number;
  results: Business[];
  top_pick: Business | null;
  live_count: number;
  source: 'api' | 'synthetic' | 'mixed';
}

export interface SlotsResult {
  slots: Slot[];
  recommended: Slot[];
  travel_min: number;
}

interface DiscoverApiResponse {
  results?: Business[];
}

function haversineKm(aLat: number, aLng: number, bLat?: number, bLng?: number): number | null {
  if (bLat == null || bLng == null) return null;
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/**
 * Demo-tenant businesses as discovery-ready profiles. They are pinned near
 * the active city centre (deterministic offset per id) so distance, "open
 * now" and AI scoring all work exactly like every other business.
 */
function demoBusinessesForCity(cityName: string): Business[] {
  const city = getCity(cityName);
  // Deactivated demo businesses never reach customer discovery (the console
  // still lists them via listDemoBusinesses for management).
  const list = listDemoBusinesses(cityName, true).filter((b) => b.active !== false);
  return list.map((b) => {
    const h = hashStr(String(b.id));
    const lat = (city?.lat ?? 0) + ((h % 40) - 20) / 500;
    const lng = (city?.lng ?? 0) + (((h >> 6) % 40) - 20) / 500;
    const activeServices = (b.services || []).filter((s) => s.active !== false);
    return {
      ...b,
      address: `${b.area}, ${cityName}`,
      lat, lng,
      rating: Number(b.rating) || 4.5,
      review_count: b.review_count || 0,
      // Only ACTIVE services are bookable — deactivating a service in the
      // console hides it from customers instantly.
      services: activeServices,
      staff: (b.staff || []).filter((s) => s.active !== false),
      price_from: activeServices.length ? Math.min(...activeServices.map((s) => Number(s.price) || 0)) : null,
    };
  });
}

function enrich(b: Business, lat: number, lng: number): Business {
  const km = haversineKm(lat, lng, b.lat, b.lng);
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }).format(now));
  const oh = parseInt(String(b.open_time || '09:00').split(':')[0], 10);
  const chRaw = parseInt(String(b.close_time || '21:00').split(':')[0], 10);
  const ch = b.close_time === '23:59' || b.open_time === '00:00' ? 24 : (chRaw || 21);
  const open = b.open_now ?? (hour >= oh && hour < ch);
  let nextLabel: string | null = null;
  if (open) {
    const s = new Date(now);
    s.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (now.getMinutes() >= 30) s.setHours(now.getHours() + 1);
    if (s.getHours() < ch) nextLabel = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  let score = 50 + ((b.rating || 4.2) - 4) * 30;
  const reasons: string[] = [];
  if (b.rating >= 4.8) reasons.push('top-rated');
  if (km != null) {
    score += Math.max(0, 20 - km * 2.5);
    if (km < 2) reasons.push('very close');
    else if (km < 5) reasons.push('nearby');
  }
  if (open) { score += 8; reasons.push('open now'); }
  if ((b.review_count || 0) > 300) score += 5;
  if (b.featured) { score += 6; reasons.push('featured'); }
  if (b.ai_popularity) score += (b.ai_popularity - 70) / 6;
  score += personalizedBoost(b);
  if (b.live) { score += 4; reasons.push('live on Google Maps'); }
  const priceFrom = b.price_from ?? (Array.isArray(b.services) && b.services.length ? Math.min(...b.services.map((s) => Number(s.price) || 0)) : null);
  return {
    ...b,
    distance_km: km != null ? Math.round(km * 10) / 10 : (b.distance_km ?? null),
    travel_min: km != null ? Math.round((km / 35) * 60) : (b.travel_min ?? null),
    open_now: open,
    next_available: !!nextLabel,
    next_available_label: nextLabel,
    price_from: priceFrom,
    ai_score: Math.round(Math.min(100, Math.max(0, score))),
    ai_reason: reasons.length ? reasons.slice(0, 2) : ['good match'],
  };
}

function sortResults(list: Business[], sort: string): Business[] {
  const s = sort || 'ai';
  const arr = [...list];
  if (s === 'distance') arr.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
  else if (s === 'rating') arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  else if (s === 'availability') arr.sort((a, b) => Number(b.next_available || false) - Number(a.next_available || false) || (b.ai_score || 0) - (a.ai_score || 0));
  else if (s === 'price_low') arr.sort((a, b) => (a.price_from ?? 999999) - (b.price_from ?? 999999));
  else arr.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
  return arr;
}

/** City-scoped discovery — API first (DB + synthetic merged server-side), pure synthetic fallback. */
export async function fetchDiscover(p: DiscoverParams): Promise<DiscoverResult> {
  const cityName = p.city || DEFAULT_CITY_NAME;
  const city = getCity(cityName);
  const effCity = city?.name || DEFAULT_CITY_NAME;
  const category = p.category && p.category !== 'All' ? (CATEGORY_ALIASES[p.category] || p.category) : '';
  const cacheKey = `discover:${effCity}:${p.lat.toFixed(3)},${p.lng.toFixed(3)}:${category}:${p.q || ''}:${p.sort || 'ai'}:${p.openNow ? 1 : 0}:${p.minRating || 0}:${p.maxKm || 0}:${p.priceMax || 0}`;
  const hit = cacheGet<DiscoverResult>(cacheKey);
  if (hit) {
    // Demo businesses are local & instant — always swap in the fresh set so
    // console changes (add/edit/deactivate) show up immediately.
    const freshDemo = demoBusinessesForCity(effCity)
      .filter((b) => !category || b.category === category || (CATEGORY_ALIASES[category] && b.category === CATEGORY_ALIASES[category]))
      .filter((b) => !p.q || `${b.name} ${b.category} ${b.description || ''}`.toLowerCase().includes(p.q.toLowerCase()))
      .map((b) => enrich(b, p.lat, p.lng));
    const rest = hit.results.filter((b) => !isDemoBusinessId(b.id));
    const results = [...freshDemo, ...rest];
    return { ...hit, results, count: results.length };
  }

  // 1) Server (DB + synthetic merged, city-scoped)
  let serverResults: Business[] | null = null;
  try {
    const sp = new URLSearchParams({
      lat: String(p.lat), lng: String(p.lng), city: effCity,
      ...(category ? { category } : {}),
      ...(p.q ? { q: p.q } : {}),
      sort: 'recommended',
    });
    const d = await cachedFetch<DiscoverApiResponse>(`/api/discover?${sp.toString()}`, { ttl: 30000, timeout: 5000 });
    if (d && Array.isArray(d.results)) serverResults = d.results;
  } catch {
    serverResults = null;
  }

  // 2) Synthetic city ecosystem (always available, instant)
  let synthetic = getCityBusinesses(effCity, { category: category || undefined });
  if (p.q) {
    const hits = searchBusinesses(synthetic, p.q, 120);
    synthetic = hits.map((h) => h.item);
  }

  // 3) Merge: server wins on id conflicts; synthetic fills the city out
  let merged: Business[];
  let source: DiscoverResult['source'];
  if (serverResults && serverResults.length > 0) {
    // Server already merges DB+synthetic; still top-up with client synthetic for depth.
    merged = mergeDedup(serverResults, synthetic);
    source = 'mixed';
  } else {
    merged = [...synthetic];
    source = 'synthetic';
  }

  // 3b) Demo tenant businesses — the working demo environment. They share the
  //     same dataset as the business console and always surface first so the
  //     end-to-end demo (customer books → business sees it) is discoverable.
  const demoBiz = demoBusinessesForCity(effCity);
  if (demoBiz.length) {
    const demoIds = new Set(demoBiz.map((b) => String(b.id)));
    merged = [...demoBiz, ...merged.filter((b) => !demoIds.has(String(b.id)) && !isDemoBusinessId(b.id))];
  }

  // 4) Enrich + filter + sort (city-pinned)
  let enriched = merged
    .filter((b) => !b.city || b.city === effCity)
    .map((b) => enrich(b, p.lat, p.lng));
  enriched = applyFilters(enriched, {
    category: category || 'All',
    minRating: p.minRating || 0,
    maxKm: p.maxKm || 0,
    priceMax: p.priceMax || 0,
    openNow: p.openNow || false,
  });
  enriched = sortResults(enriched, p.sort || 'ai');

  // 5) Live Google places (opportunistic, non-blocking when cached)
  let liveCount = 0;
  if (p.includeLive) {
    try {
      const { live, results } = await fetchLivePlaces({ lat: p.lat, lng: p.lng, query: p.q, category: category || undefined, city: effCity });
      if (live && results.length) {
        const liveBiz = results.map((r) => enrich(liveToBusiness(r, effCity, category || undefined), p.lat, p.lng));
        enriched = mergeDedup(liveBiz, enriched);
        enriched = sortResults(enriched, p.sort || 'ai');
        liveCount = liveBiz.length;
      }
    } catch { /* live is best-effort */ }
  }

  const top = enriched.length ? [...enriched].sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0))[0] : null;
  const payload: DiscoverResult = { count: enriched.length, results: enriched, top_pick: top, live_count: liveCount, source };
  cacheSet(cacheKey, payload, 45000);
  return payload;
}

function mergeDedup(primary: Business[], secondary: Business[]): Business[] {
  const seen = new Set(primary.map((b) => String(b.id)));
  const out = [...primary];
  for (const b of secondary) {
    if (!seen.has(String(b.id))) {
      seen.add(String(b.id));
      out.push(b);
    }
  }
  return out;
}

/** Single business — synthetic ids resolve instantly locally; DB ids via API. */
export async function fetchBusiness(id: number | string, city?: string): Promise<Business | null> {
  // Demo tenant business — instant local resolution, services + staff attached.
  if (isDemoBusinessId(id)) {
    const raw = getDemoBusiness(id);
    if (raw && raw.active !== false) {
      const cityName = city || raw.city || DEFAULT_CITY_NAME;
      const cityMeta = getCity(cityName);
      const h = hashStr(String(raw.id));
      const full = {
        ...raw,
        city: cityName,
        address: demoFullAddress(raw, cityName),
        state: raw.state || cityMeta?.state || '',
        pin: raw.pin || '',
        country: raw.country || 'India',
        lat: (cityMeta?.lat ?? 0) + ((h % 40) - 20) / 500,
        lng: (cityMeta?.lng ?? 0) + (((h >> 6) % 40) - 20) / 500,
        rating: Number(raw.rating) || 4.5,
        open_now: true,
        services: (raw.services || []).filter((s) => s.active !== false),
        staff: (raw.staff || []).filter((s) => s.active !== false),
      };
      return full;
    }
    return null;
  }

  const key = `business:${id}`;
  const hit = cacheGet<Business>(key);
  if (hit) return hit;

  // Live Google place id
  if (typeof id === 'string' && id.startsWith('live-')) {
    // Live businesses are hydrated from the cached discover payload when possible;
    // otherwise synthesize a booking-ready shell around the place id.
    return null;
  }

  // Synthetic id — instant local resolution
  if (isSyntheticId(id)) {
    const b = getSyntheticBusiness(id);
    if (b) {
      const full = attachDetails({ ...b });
      cacheSet(key, full, 300000);
      return full;
    }
  }

  // Server (DB row or server-side synthetic)
  try {
    const d = await cachedFetch<Business>(`/api/businesses?id=${encodeURIComponent(String(id))}${city ? `&city=${encodeURIComponent(city)}` : ''}`, { ttl: 120000, timeout: 5000 });
    if (d && d.id) {
      cacheSet(key, d, 300000);
      return d;
    }
  } catch { /* fall through */ }

  // Last resort: synthetic lookup
  if (isSyntheticId(id)) {
    const b = getSyntheticBusiness(id);
    if (b) return attachDetails({ ...b });
  }
  return null;
}

/** Resolve a live place into a full booking-ready profile (live info + synthetic services). */
export function hydrateLiveBusiness(place: LivePlace, cityName: string, category?: string): Business {
  const shell = liveToBusiness(place, cityName, category);
  // Deterministic synthetic services/staff/offers derived from the place id so
  // live businesses feel fully bookable.
  const seedId = 900000 + (hashStr(place.place_id) % 90000);
  const rnd = mulberry32(hashStr(`livebiz|${place.place_id}`));
  const def = CATEGORY_DEFS.find((c) => c.name === shell.category) || CATEGORY_DEFS[0];
  const services = def.services.map((t, i) => ({
    id: seedId * 100 + i,
    business_id: shell.id,
    name: t.n,
    description: t.d,
    duration_min: t.dur,
    price: t.lo === 0 && t.hi === 0 ? 0 : Math.round((t.lo + rnd() * (t.hi - t.lo)) / 50) * 50,
  }));
  const staff = [0, 1, 2].map((i) => ({
    id: `${shell.id}-st${i}`,
    business_id: shell.id,
    name: ['Aarav Sharma', 'Priya Nair', 'Rahul Verma'][i],
    role: def.roles[i % def.roles.length],
  }));
  return { ...shell, services, staff, synthetic: false, live_bookable: true };
}

export async function fetchSlots(businessId: number | string, serviceId: number | string | null, date: string, origin?: { lat: number; lng: number }, staffName?: string | null): Promise<SlotsResult> {
  // Demo tenant: real availability from opening hours, service duration,
  // staff rosters and existing (non-cancelled) local bookings.
  if (isDemoBusinessId(businessId)) {
    const biz = getDemoBusiness(businessId);
    if (!biz) return { slots: [], recommended: [], travel_min: 0 };
    return buildDemoSlots(biz, serviceId, date, staffName);
  }
  const loc = origin ? `&origin_lat=${origin.lat}&origin_lng=${origin.lng}` : '';
  try {
    const d = (await timedJson(`/api/smart-slots?business_id=${encodeURIComponent(String(businessId))}${serviceId ? `&service_id=${encodeURIComponent(String(serviceId))}` : ''}&date=${date}${loc}`, 5000)) as SlotsResult | null;
    if (d && Array.isArray(d.slots)) {
      return { slots: d.slots, recommended: d.recommended || [], travel_min: d.travel_min || 0 };
    }
  } catch { /* synthetic fallback below */ }
  const biz = isSyntheticId(businessId) ? getSyntheticBusiness(businessId) : null;
  const svc = biz?.services?.find((s) => String(s.id) === String(serviceId)) || biz?.services?.[0];
  const dur = svc?.duration_min || 30;
  const slots = getSyntheticSlots(Number(businessId) || 100001, date, dur, biz?.open_time || '09:00', biz?.close_time || '21:00');
  const recommended = [...slots].filter((s) => s.available).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  return { slots, recommended, travel_min: 0 };
}

export async function fetchHeatmap(businessId?: number | string): Promise<HeatmapData> {
  try {
    const d = await cachedFetch<HeatmapData>(`/api/heatmap${businessId ? `?business_id=${encodeURIComponent(String(businessId))}` : ''}`, { ttl: 120000, timeout: 5000 });
    if (d && d.days) return d;
  } catch { /* synthetic fallback */ }
  return getSyntheticHeatmap(Number(businessId) || 0);
}

export async function fetchReviews(businessId: number | string): Promise<ReviewRow[]> {
  if (isSyntheticId(businessId) || String(businessId).startsWith('live-') || isDemoBusinessId(businessId)) {
    return getSyntheticReviews(businessId, 8);
  }
  // DB businesses: deterministic reviews seeded by id (stable demo data)
  return getSyntheticReviews(businessId, 8);
}

/**
 * Demo-tenant slots — availability computed live from the shared demo
 * dataset: existing local bookings for this business block their slots, so a
 * slot booked by the demo customer disappears for everyone until cancelled.
 */
function buildDemoSlots(biz: DemoBusinessDetails, serviceId: number | string | null, date: string, staffName?: string | null): SlotsResult {
  const existing = listLocalBookings().map((b) => ({
    business_id: b.business_id, staff_name: b.staff_name,
    start_time: b.start_time, end_time: b.end_time, status: b.status,
  }));
  const slots = demoSlots(String(biz.id), serviceId ? String(serviceId) : null, date, existing, staffName || null);
  const recommended = [...slots].filter((s) => s.available).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  return { slots, recommended, travel_min: 0 };
}

/** Nearest-per-category for the city, centered on the given point. */
export async function fetchNearest(lat: number, lng: number, city: string): Promise<NearestData> {
  try {
    const d = await cachedFetch<NearestData>(`/api/nearest?lat=${lat}&lng=${lng}&city=${encodeURIComponent(city)}`, { ttl: 60000, timeout: 5000 });
    if (d && (d.overall_nearest || d.nearest_per_category)) return d;
  } catch { /* synthetic fallback */ }
  const all = getCityBusinesses(city).map((b) => {
    const km = haversineKm(lat, lng, b.lat, b.lng);
    return { ...b, distance_km: km, travel_min: km != null ? Math.round((km / 35) * 60) : null };
  }).filter((b) => b.distance_km != null).sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999));
  const byCat: Record<string, Business> = {};
  for (const b of all) if (!byCat[b.category]) byCat[b.category] = b;
  return { overall_nearest: all[0] || null, nearest_per_category: Object.values(byCat), total_within_5km: all.filter((b) => (b.distance_km || 99) <= 5).length };
}
