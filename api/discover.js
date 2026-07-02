import supabase from './db-client.js';
import { cors, sanitizeText } from './_lib/security.js';

// FAST location-aware discovery. One query, pure in-memory math — no per-business
// booking loops. Returns distance, open/closed, an AI score + reason, and a
// lightweight next-availability hint. Results are cached briefly per query.

const cache = new Map(); // key -> { at, payload }
const TTL = 30000; // 30s micro-cache

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
    const { lat, lng, category, q, sort = 'recommended', open_now, max_km, min_rating } = req.query;
    const origin = lat && lng ? { lat: +lat, lng: +lng } : null;
    const now = new Date();
    const hour = now.getHours();

    const key = JSON.stringify({ lat, lng, category, q, sort, open_now, max_km, min_rating, b: Math.floor(Date.now() / TTL) });
    const hit = cache.get(key);
    if (hit) { res.setHeader('X-Cache', 'HIT'); return res.status(200).json(hit); }

    let query = supabase.from('businesses').select('*').eq('active', true);
    if (category && category !== 'All') query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    let list = data || [];

    if (q) {
      const term = (sanitizeText(q, 80) || '').toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(term) || b.category.toLowerCase().includes(term) || (b.description || '').toLowerCase().includes(term) || (b.city || '').toLowerCase().includes(term));
    }

    list = list.map((b) => {
      const oh = parseInt((b.open_time || '09:00').split(':')[0], 10);
      const ch = parseInt((b.close_time || '18:00').split(':')[0], 10) || 18;
      const open = hour >= oh && hour < ch;
      const km = origin ? haversineKm(origin, b) : null;
      const travelMin = km != null ? Math.round((km / 35) * 60) : null;

      // Cheap next-availability hint: next half-hour slot in open hours.
      let nextLabel = null;
      if (open) {
        const s = new Date(now);
        s.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
        if (now.getMinutes() >= 30) s.setHours(now.getHours() + 1);
        if (s.getHours() < ch) nextLabel = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      } else if (hour < oh) {
        const s = new Date(now); s.setHours(oh, 0, 0, 0);
        nextLabel = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }

      // AI score + reason
      let score = 50 + (b.rating - 4) * 30;
      const reasons = [];
      if (b.rating >= 4.8) reasons.push('top-rated');
      if (km != null) { score += Math.max(0, 20 - km * 2.5); if (km < 2) reasons.push('very close'); else if (km < 5) reasons.push('nearby'); }
      if (open) { score += 8; reasons.push('open now'); }
      if (b.review_count > 300) score += 5;

      return {
        ...b,
        distance_km: km != null ? Math.round(km * 10) / 10 : null,
        travel_min: travelMin,
        open_now: open,
        next_available: !!nextLabel,
        next_available_label: nextLabel,
        ai_score: Math.round(Math.min(100, Math.max(0, score))),
        ai_reason: reasons.length ? reasons.slice(0, 2) : ['good match'],
      };
    });

    if (open_now === 'true') list = list.filter((b) => b.open_now);
    if (max_km) list = list.filter((b) => b.distance_km == null || b.distance_km <= +max_km);
    if (min_rating) list = list.filter((b) => b.rating >= +min_rating);

    if (sort === 'distance' && origin) list.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else list.sort((a, b) => b.ai_score - a.ai_score);

    const top_pick = list.length ? [...list].sort((a, b) => b.ai_score - a.ai_score)[0] : null;
    const payload = { count: list.length, results: list, top_pick };
    cache.set(key, payload);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[discover:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
