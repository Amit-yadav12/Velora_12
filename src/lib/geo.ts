export interface Coords { lat: number; lng: number; label?: string; city?: string; }

export function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function formatDistance(km?: number | null): string {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatTravel(min?: number | null): string {
  if (min == null) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60); const m = min % 60;
  return `${h}h ${m}m`;
}

const KEY = 'velora-location';
export function saveLocation(c: Coords) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage unavailable */ } }
export function loadLocation(): Coords | null { try { const v = localStorage.getItem(KEY); return v ? JSON.parse(v) : null; } catch { return null; } }
