import { publicBusiness } from './_lib/public-business.js';
import { istHour, istMinute, istTimeLabel, istWallDate, istYmd, istWeekdayLabel } from './_lib/ist.js';
import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, sanitizeText, enforceRateLimit, safeError } from './_lib/security.js';
import { cityBusinesses } from './_lib/synthetic.js';

// FAST location-aware discovery, CITY-SCOPED. Merges Supabase rows with the
// deterministic synthetic city ecosystem so every city feels fully populated.
// One query, pure in-memory math — no per-business booking loops.

const cache = new Map(); // key -> { at, payload }
const TTL = 30000; // 30s micro-cache

function haversineKm(a, b) {
  if (![a.lat, a.lng, b.lat, b.lng].every((v) => v != null && Number.isFinite(Number(v)))) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'discover', { limit: 120, windowMs: 60_000 })) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { lat, lng, category, q, sort = 'recommended', open_now, max_km, min_rating, city, price_max } = req.query;
    if ((lat != null && (!Number.isFinite(+lat) || Math.abs(+lat) > 90)) || (lng != null && (!Number.isFinite(+lng) || Math.abs(+lng) > 180))) return res.status(400).json({ error: 'Invalid coordinates' });
    const origin = lat && lng ? { lat: +lat, lng: +lng } : null;
    const cityName = sanitizeText(city, 40) || null;
    const now = new Date();
    const hour = istHour(now);

    const key = JSON.stringify({ lat, lng, category, q, sort, open_now, max_km, min_rating, city: cityName, price_max, b: Math.floor(Date.now() / TTL) });
    const hit = cache.get(key);
    // Do not serve cached DB listings after an owner publishes or edits.
    void hit;

    // 1) Supabase rows (best effort — never blocks the synthetic ecosystem)
    let dbRows = [];
    try {
      let query = supabase.from('businesses').select('*,business_services(price,active)').eq('active', true);
      if (category && category !== 'All') query = query.eq('category', category);
      const { data, error } = await query;
      if (error && isDatabaseConfigured()) throw error;
      if (!error && Array.isArray(data)) dbRows = data.map((b) => {
        const prices = (b.business_services || []).filter((v) => v.active !== false && Number.isFinite(Number(v.price))).map((v) => Number(v.price));
        return { ...publicBusiness(b), price_from: prices.length ? Math.min(...prices) : null };
      });
    } catch (e) {
      console.error('[discover:db]', e.message);
      if (isDatabaseConfigured()) throw e;
    }

    // 2) Synthetic city ecosystem (always available)
    let synth = [];
    try {
      synth = isDatabaseConfigured() ? [] : cityBusinesses(cityName || 'Jaipur', { category: category && category !== 'All' ? category : undefined });
    } catch (e) {
      console.error('[discover:synth]', e.message);
    }

    // 3) Merge (DB wins on id conflicts), then city-pin
    const seen = new Set(dbRows.map((b) => String(b.id)));
    let list = [...dbRows];
    for (const b of synth) {
      if (!seen.has(String(b.id))) {
        seen.add(String(b.id));
        list.push(b);
      }
    }
    if (cityName) {
      list = list.filter((b) => !b.city || b.city === cityName);
    }

    if (q) {
      const term = (sanitizeText(q, 80) || '').toLowerCase();
      list = list.filter((b) => (b.name || '').toLowerCase().includes(term) || (b.category || '').toLowerCase().includes(term) || (b.description || '').toLowerCase().includes(term) || (b.city || '').toLowerCase().includes(term) || (b.area || '').toLowerCase().includes(term));
    }

    list = list.map((b) => {
      const oh = parseInt((b.open_time || '09:00').split(':')[0], 10);
      const is247 = b.open_time === '00:00';
      const ch = is247 ? 24 : (parseInt((b.close_time || '21:00').split(':')[0], 10) || 21);
      const weekday = istWeekdayLabel(now).toLowerCase();
      const day = b.weekly_hours?.[weekday];
      const parse = (v) => { const m = /^(\d{2}):(\d{2})/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
      const opens = parse(day?.open || b.open_time), closes = parse(day?.close || b.close_time);
      const minutes = hour * 60 + istMinute(now);
      const closed = day?.closed || (b.holidays || []).includes(istYmd(now));
      const open = closed ? false : opens != null && closes != null ? minutes >= opens && minutes < closes : null;
      const km = origin ? haversineKm(origin, b) : null;

      // Next bookable slot label, computed on the IST wall clock (the runtime
      // is UTC, so local-time arithmetic produced late-night/overnight labels).
      let nextLabel = null;
      if (open) {
        const mins = istMinute(now);
        const nextMin = mins < 30 ? 30 : 0;
        const nextHour = istHour(now) + (mins < 30 ? 0 : 1);
        if (nextHour < ch) {
          nextLabel = istTimeLabel(istWallDate(istYmd(now), nextHour, nextMin));
        }
      } else if (hour < oh) {
        nextLabel = istTimeLabel(istWallDate(istYmd(now), oh, 0));
      }

      let score = 50 + ((b.rating || 4.2) - 4) * 30;
      const reasons = [];
      if (b.rating >= 4.8) reasons.push('top-rated');
      if (km != null) { score += Math.max(0, 20 - km * 2.5); if (km < 2) reasons.push('very close'); else if (km < 5) reasons.push('nearby'); }
      if (open) { score += 8; reasons.push('open now'); }
      if (b.review_count > 300) score += 5;
      if (b.featured) { score += 6; reasons.push('featured'); }

      return {
        ...b,
        distance_km: km != null ? Math.round(km * 10) / 10 : null,
        travel_min: null,
        open_now: open,
        next_available: b.synthetic ? !!nextLabel : false,
        next_available_label: b.synthetic ? nextLabel : null,
        ai_score: Math.round(Math.min(100, Math.max(0, score))),
        ai_reason: reasons.length ? reasons.slice(0, 2) : ['good match'],
      };
    });

    if (open_now === 'true') list = list.filter((b) => b.open_now);
    if (max_km) list = list.filter((b) => b.distance_km == null || b.distance_km <= +max_km);
    if (min_rating) list = list.filter((b) => b.rating >= +min_rating);
    if (price_max) {
      list = list.filter((b) => {
        const from = b.price_from ?? (Array.isArray(b.services) && b.services.length ? Math.min(...b.services.map((s) => +s.price || 0)) : null);
        return from == null || from <= +price_max;
      });
    }

    if (sort === 'distance' && origin) list.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    else if (sort === 'price_low') list.sort((a, b) => (a.price_from ?? 999999) - (b.price_from ?? 999999));
    else list.sort((a, b) => b.ai_score - a.ai_score);

    const top_pick = list.length ? [...list].sort((a, b) => b.ai_score - a.ai_score)[0] : null;
    const payload = { count: list.length, results: list, top_pick, city: cityName || null };
    cache.set(key, payload);
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[discover:error]', err.message);
    const s = safeError(err, 'discover:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
