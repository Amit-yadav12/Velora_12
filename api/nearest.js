import supabase from './db-client.js';
import { cors, sanitizeText, enforceRateLimit } from './_lib/security.js';
import { cityBusinesses } from './_lib/synthetic.js';

// "Nearest everything": returns the single closest active business in each
// key category relative to the user's coordinates, with distance + travel est.
// City-scoped; DB + synthetic merged.
function haversineKm(a, b) {
  if (a.lat == null || b.lat == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'nearest', { limit: 120, windowMs: 60_000 })) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { lat, lng, city } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const origin = { lat: +lat, lng: +lng };
    const cityName = sanitizeText(city, 40) || 'Jaipur';

    let dbRows = [];
    try {
      const { data, error } = await supabase.from('businesses').select('*').eq('active', true);
      if (!error && Array.isArray(data)) dbRows = data;
    } catch (e) {
      console.error('[nearest:db]', e.message);
    }
    let synth = [];
    try {
      synth = cityBusinesses(cityName);
    } catch (e) {
      console.error('[nearest:synth]', e.message);
    }
    const seen = new Set(dbRows.map((b) => String(b.id)));
    const all = [...dbRows];
    for (const b of synth) {
      if (!seen.has(String(b.id))) {
        seen.add(String(b.id));
        all.push(b);
      }
    }
    const pinned = all.filter((b) => !b.city || b.city === cityName);

    const enriched = pinned
      .map((b) => {
        const km = haversineKm(origin, b);
        return { ...b, distance_km: km, travel_min: km != null ? Math.round((km / 35) * 60) : null };
      })
      .filter((b) => b.distance_km != null)
      .sort((a, b) => a.distance_km - b.distance_km);

    // nearest per category
    const byCat = {};
    for (const b of enriched) {
      if (!byCat[b.category]) byCat[b.category] = b;
    }
    const nearestPerCategory = Object.values(byCat);

    return res.status(200).json({
      overall_nearest: enriched[0] || null,
      nearest_per_category: nearestPerCategory,
      total_within_5km: enriched.filter((b) => b.distance_km <= 5).length,
      city: cityName,
    });
  } catch (err) {
    console.error('[nearest:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
