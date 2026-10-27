import { cors, sanitizeText, enforceRateLimit } from './_lib/security.js';

const coords = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const component = (parts, type) => (parts || []).find((x) => x.types?.includes(type))?.long_name || '';
function fromGoogle(g) {
  const loc = g.geometry?.location;
  if (!coords(loc?.lat, loc?.lng)) return null;
  const parts = g.address_components || [];
  return { label: g.formatted_address, lat: loc.lat, lng: loc.lng, place_id: g.place_id || null,
    city: component(parts, 'locality') || component(parts, 'administrative_area_level_2'),
    state: component(parts, 'administrative_area_level_1'), pin: component(parts, 'postal_code') };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceRateLimit(req, res, 'geocode', { limit: 60, windowMs: 60_000 })) return;
  const q = sanitizeText(req.query.q, 160);
  const reverse = req.query.lat != null || req.query.lng != null;
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (reverse && (!coords(lat, lng) || req.query.lat === '' || req.query.lng === '')) return res.status(400).json({ error: 'Invalid coordinates.' });
  if (!reverse && (!q || q.length < 3)) return res.status(200).json({ predictions: [] });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      if (reverse) {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(6000) });
        const data = await r.json();
        if (data.status === 'OK') return res.status(200).json({ provider: 'google', predictions: (data.results || []).slice(0, 1).map(fromGoogle).filter(Boolean) });
        if (data.status === 'ZERO_RESULTS') return res.status(200).json({ provider: 'google', predictions: [] });
        return res.status(200).json({ provider: 'google', predictions: [], unavailable: true, error: 'Google geocoding is unavailable. Check the API key, enabled APIs, and quota.' });
      }
      const ac = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:in&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
      if (ac.status === 'ZERO_RESULTS') return res.status(200).json({ provider: 'google', predictions: [] });
      if (ac.status !== 'OK') return res.status(200).json({ provider: 'google', predictions: [], unavailable: true, error: 'Google autocomplete is unavailable. Check the API key, enabled APIs, and quota.' });
      const predictions = await Promise.all((ac.predictions || []).slice(0, 5).map(async (p) => {
        const g = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(p.place_id)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(6000) }).then((r) => r.json());
        return g.status === 'OK' ? fromGoogle(g.results?.[0] || {}) : null;
      }));
      return res.status(200).json({ provider: 'google', predictions: predictions.filter(Boolean) });
    } catch { return res.status(200).json({ provider: 'google', predictions: [], unavailable: true, error: 'Address search is temporarily unavailable. Enter the address and coordinates manually.' }); }
  }
  // Public Nominatim does not permit autocomplete or unrestricted high-volume
  // application traffic. Without a configured provider, fail gracefully and
  // let the owner enter a confirmed address and coordinates instead.
  return res.status(200).json({ predictions: [], unavailable: true, error: reverse
    ? 'Reverse geocoding is not configured. Enter the address manually.'
    : 'Address autocomplete is not configured. Enter the address and coordinates manually.' });
}
