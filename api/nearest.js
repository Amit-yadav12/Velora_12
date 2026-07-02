import supabase from './db-client.js';
import { cors } from './_lib/security.js';

// "Nearest everything": returns the single closest active business in each
// key category relative to the user's coordinates, with distance + travel est.
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
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });
    const origin = { lat: +lat, lng: +lng };

    const { data, error } = await supabase.from('businesses').select('*').eq('active', true);
    if (error) throw error;

    const enriched = (data || [])
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
    });
  } catch (err) {
    console.error('[nearest:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
