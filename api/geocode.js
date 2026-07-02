import { cors, sanitizeText } from './_lib/security.js';

// Place autocomplete / geocoding. Uses Google Places/Geocoding when a key is
// configured, else OpenStreetMap Nominatim (no key required). Returns a list
// of { label, lat, lng } predictions.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const q = sanitizeText(req.query.q, 120);
    if (!q || q.length < 2) return res.status(200).json({ predictions: [] });

    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      try {
        // Google Places Autocomplete gives the best "search a place" results.
        const acUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=geocode&key=${key}`;
        const acRes = await fetch(acUrl);
        const ac = await acRes.json();
        if (ac.predictions?.length) {
          // Resolve each prediction to coordinates via Geocoding.
          const detailed = await Promise.all(ac.predictions.slice(0, 6).map(async (p) => {
            try {
              const gRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?place_id=${p.place_id}&key=${key}`);
              const g = await gRes.json();
              const loc = g.results?.[0]?.geometry?.location;
              if (loc) return { label: p.description, lat: loc.lat, lng: loc.lng };
            } catch { /* skip */ }
            return null;
          }));
          const predictions = detailed.filter(Boolean);
          if (predictions.length) return res.status(200).json({ provider: 'google', predictions });
        }
        // Fallback to plain geocoding if autocomplete returned nothing.
        const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`;
        const gr = await fetch(gUrl);
        const gj = await gr.json();
        if (gj.results?.length) {
          return res.status(200).json({
            provider: 'google',
            predictions: gj.results.slice(0, 6).map((g) => ({ label: g.formatted_address, lat: g.geometry.location.lat, lng: g.geometry.location.lng })),
          });
        }
      } catch (e) { console.error('[geocode:google]', e.message); }
    }

    // Keyless fallback: OpenStreetMap Nominatim (global, no bias).
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Velora-Booking/1.0 (booking app)' } });
    const j = await r.json();
    const predictions = (Array.isArray(j) ? j : []).map((p) => ({ label: p.display_name, lat: +p.lat, lng: +p.lon }));
    return res.status(200).json({ provider: 'osm', predictions });
  } catch (err) {
    console.error('[geocode:error]', err.message);
    res.status(200).json({ predictions: [] });
  }
}
