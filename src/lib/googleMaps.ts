// Velora × Google Maps hybrid layer.
// Keyless Google Maps embeds work everywhere (no API key). When a Google Maps
// API key is configured, /api/places unlocks LIVE business discovery (names,
// ratings, photos, hours) which we merge with Velora's synthetic booking data.

import type { City } from './cities';
import type { Business } from './product';

export interface MapCenter { lat: number; lng: number; label?: string }

export function googleKey(): string {
  return import.meta.env?.VITE_GOOGLE_MAPS_API_KEY || '';
}

/** Keyless universal embed — renders real Google Maps in an iframe. */
export function googleEmbedUrl(query: string, center?: MapCenter, zoom = 14): string {
  const q = center ? `${query} near ${center.label || `${center.lat},${center.lng}`}` : query;
  const key = googleKey();
  if (key) {
    return `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&zoom=${zoom}`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=${zoom}&output=embed`;
}

/** Embed centered on exact coordinates with a query overlay. */
export function googleEmbedCenter(center: MapCenter, query?: string, zoom = 14): string {
  const key = googleKey();
  if (key) {
    if (query) {
      return `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&center=${center.lat},${center.lng}&zoom=${zoom}`;
    }
    return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${center.lat},${center.lng}&zoom=${zoom}`;
  }
  const q = query ? encodeURIComponent(query) : '';
  return `https://www.google.com/maps?q=${q}&ll=${center.lat},${center.lng}&z=${zoom}&output=embed`;
}

export function googleSearchUrl(query: string, center?: MapCenter): string {
  const q = center?.label ? `${query} in ${center.label}` : query;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function googleDirectionsUrl(dest: string, origin?: string): string {
  const p = new URLSearchParams({ api: '1', destination: dest });
  if (origin) p.set('origin', origin);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export function googlePlaceUrl(name: string, address?: string): string {
  return googleSearchUrl(address ? `${name}, ${address}` : name);
}

/** Effective map center: live GPS location wins when granted, else city. */
export function effectiveCenter(city: City, live?: MapCenter | null): MapCenter {
  if (live && Number.isFinite(live.lat) && Number.isFinite(live.lng)) {
    return { lat: live.lat, lng: live.lng, label: live.label || 'Your location' };
  }
  return { lat: city.lat, lng: city.lng, label: city.name };
}

// ---------------------------------------------------------------------------
// Live Places (via /api/places proxy — gracefully degrades to [])
// ---------------------------------------------------------------------------

export interface LivePlace {
  place_id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  review_count?: number;
  phone?: string;
  website?: string;
  hours?: string[];
  open_now?: boolean | null;
  photos?: string[];
  category?: string;
  maps_url?: string;
  price_level?: number;
}

const placesCache = new Map<string, { at: number; data: LivePlace[] }>();
const PLACES_TTL = 120000;

export async function fetchLivePlaces(opts: {
  lat: number; lng: number; query?: string; category?: string; city?: string; radius?: number;
}): Promise<{ live: boolean; results: LivePlace[] }> {
  const key = JSON.stringify(opts);
  const hit = placesCache.get(key);
  if (hit && Date.now() - hit.at < PLACES_TTL) return { live: hit.data.length > 0, results: hit.data };
  try {
    const p = new URLSearchParams({
      lat: String(opts.lat), lng: String(opts.lng),
      ...(opts.query ? { query: opts.query } : {}),
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.city ? { city: opts.city } : {}),
      ...(opts.radius ? { radius: String(opts.radius) } : {}),
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`/api/places?${p.toString()}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { live: false, results: [] };
    const j = await res.json();
    const results: LivePlace[] = Array.isArray(j?.results) ? j.results : [];
    placesCache.set(key, { at: Date.now(), data: results });
    if (placesCache.size > 40) placesCache.delete(placesCache.keys().next().value as string);
    return { live: !!j?.live && results.length > 0, results };
  } catch {
    return { live: false, results: [] };
  }
}

/** Normalize a live Google place into a Velora business shape (booking-ready). */
export function liveToBusiness(p: LivePlace, cityName: string, categoryFallback = 'Clinics'): Business {
  // Production fallback uses local /biz/ images, zero placeholder-image.
  const fallbackImg = `/biz/clinic.jpg`;
  return {
    id: `live-${p.place_id}`,
    live: true,
    place_id: p.place_id,
    name: p.name,
    tagline: p.category || 'Verified on Google Maps',
    category: p.category || categoryFallback,
    description: `${p.name}${p.address ? ` — ${p.address}` : ''}. Live listing from Google Maps with Velora instant booking.`,
    address: p.address || cityName,
    city: cityName,
    lat: p.lat,
    lng: p.lng,
    phone: p.phone,
    rating: p.rating ?? 4.2,
    review_count: p.review_count ?? 50,
    image_url: p.photos?.[0] || fallbackImg,
    cover_url: p.photos?.[1] || p.photos?.[0] || fallbackImg,
    photos: p.photos?.length ? p.photos : [fallbackImg],
    open_now: p.open_now ?? undefined,
    hours_text: p.hours,
    website: p.website,
    maps_url: p.maps_url || googlePlaceUrl(p.name, p.address),
    featured: false,
    synthetic: false,
  };
}

/** Open Google Maps (new tab) centered on the city or live location. */
export function openGoogleMaps(center: MapCenter, query?: string): void {
  const url = query ? googleSearchUrl(query, center) : `https://www.google.com/maps/@${center.lat},${center.lng},14z`;
  window.open(url, '_blank', 'noopener');
}
