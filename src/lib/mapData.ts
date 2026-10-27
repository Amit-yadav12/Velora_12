// Map marker contract.
//
// The map layer is deliberately stricter than the `Business` domain model:
// `Business` describes whatever the API/catalogue could send (optional
// coordinates, nullable rating, an optional ranking score), while a marker can
// only exist where there is a real, finite coordinate and a rating to print.
// Normalising at this boundary is what keeps `MapBusiness` free of
// `number | null | undefined` while leaving the domain model honest about
// partial data — the alternative (loosening the map type, or casting) pushes
// `NaN`/`undefined` into Leaflet and `toFixed()` at runtime.
import type { Business } from './product';

/** A business that can actually be drawn on the map. */
export interface MapBusiness {
  id: number | string;
  name: string;
  category: string;
  /** Guaranteed finite and in range. */
  lat: number;
  /** Guaranteed finite and in range. */
  lng: number;
  /** Rating to print on the pin; unknown ratings normalise to 0. */
  rating: number;
  /**
   * Ranking score. Nullable *by contract*: the recommendation engine may have
   * no score for a listing (e.g. an unranked live Google place), and the map
   * must not invent one.
   */
  ai_score: number | null;
}

const finite = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** True when the value is a usable WGS-84 coordinate pair. */
export function hasMapCoords(b: Pick<Business, 'lat' | 'lng'>): boolean {
  const lat = finite(b.lat);
  const lng = finite(b.lng);
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Normalise a discovery result set into map markers. Order is preserved; rows
 * without usable coordinates are dropped (never plotted at 0,0).
 */
export function toMapBusinesses(businesses: readonly Business[]): MapBusiness[] {
  const out: MapBusiness[] = [];
  for (const b of businesses) {
    // Sample listings have illustrative coordinates, not verified locations.
    if (b.synthetic || b.demo || !hasMapCoords(b)) continue;
    out.push({
      id: b.id,
      name: b.name,
      category: b.category,
      lat: b.lat as number,
      lng: b.lng as number,
      rating: finite(b.rating) ?? 0,
      ai_score: finite(b.ai_score),
    });
  }
  return out;
}

/** Center + zoom for a marker set (used to frame the map without fitting a single pin). */
export function markerBounds(markers: readonly MapBusiness[]): MapBusiness[] {
  return markers.filter((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng));
}
