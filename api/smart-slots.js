import { istDayBounds, istTimeLabel, istWallDate } from './_lib/ist.js';
import supabase from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { travelTimeMin } from './_lib/maps.js';
import { syntheticBusiness, syntheticSlots, isSyntheticId } from './_lib/synthetic.js';

// AI Smart Slot Recommendation. Scores open slots by wait time, provider
// availability, travel time, expected crowding and time-of-day preference.
// Works for DB businesses AND synthetic ecosystem businesses.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'smart-slots', { limit: 120, windowMs: 60_000 })) return;
  try {
    const { business_id, service_id, date, origin_lat, origin_lng } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id required' });
    const day = date || new Date().toISOString().slice(0, 10);

    // Synthetic business — deterministic slots, instant.
    if (isSyntheticId(business_id)) {
      const biz = syntheticBusiness(business_id);
      if (!biz) return res.status(404).json({ error: 'Business not found' });
      const svc = (biz.services || []).find((s) => String(s.id) === String(service_id)) || biz.services?.[0] || null;
      const slots = syntheticSlots(Number(business_id), day, svc?.duration_min || 30, biz.open_time, biz.close_time);
      const recommended = [...slots].filter((s) => s.available).sort((a, b) => b.score - a.score).slice(0, 3);
      let travel = 0;
      if (origin_lat && biz.lat != null) {
        travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: biz.lat, lng: biz.lng });
      }
      return res.status(200).json({ business: biz, service: svc, travel_min: travel, slots, recommended });
    }

    const [{ data: biz }, svcRes] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', business_id).single(),
      service_id ? supabase.from('business_services').select('*').eq('id', service_id).single() : Promise.resolve({ data: null }),
    ]);
    // DB miss — try synthetic registry as fallback (same id space safety)
    let effBiz = biz;
    let effSvc = svcRes.data;
    if (!effBiz) {
      const synth = syntheticBusiness(business_id);
      if (!synth) return res.status(404).json({ error: 'Business not found' });
      effBiz = synth;
      effSvc = (synth.services || []).find((s) => String(s.id) === String(service_id)) || synth.services?.[0] || null;
      const slots = syntheticSlots(Number(business_id) || 100001, day, effSvc?.duration_min || 30, effBiz.open_time, effBiz.close_time);
      const recommended = [...slots].filter((s) => s.available).sort((a, b) => b.score - a.score).slice(0, 3);
      let travel = 0;
      if (origin_lat && effBiz.lat != null) {
        travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: effBiz.lat, lng: effBiz.lng });
      }
      return res.status(200).json({ business: effBiz, service: effSvc, travel_min: travel, slots, recommended });
    }
    const svc = effSvc;
    const dur = svc?.duration_min || 30;

    // IST day window (see ./_lib/ist.js) — the runtime clock is UTC.
    const bounds = istDayBounds(day);
    if (!bounds) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const { data: booked } = await supabase.from('bookings').select('start_time,end_time,status')
      .eq('resource_name', effBiz.name)
      .gte('start_time', bounds.start.toISOString()).lt('start_time', bounds.end.toISOString())
      .neq('status', 'cancelled');

    // Travel time (Google Maps w/ fallback)
    let travel = 0;
    if (origin_lat && effBiz.lat != null) {
      travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: effBiz.lat, lng: effBiz.lng });
    }

    const openH = parseInt((effBiz.open_time || '09:00').split(':')[0], 10);
    const closeH = effBiz.open_time === '00:00' ? 24 : (parseInt((effBiz.close_time || '18:00').split(':')[0], 10) || 18);
    const now = Date.now();
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      for (const m of [0, 30]) {
        const s = istWallDate(day, h, m);
        if (Number.isNaN(s.getTime())) continue;
        const e = new Date(s.getTime() + dur * 60000);
        if (s.getTime() < now) continue;
        const taken = (booked || []).some((b) => new Date(b.start_time) < e && new Date(b.end_time) > s);
        // crowding = bookings within +/- 1 hour
        const crowd = (booked || []).filter((b) => Math.abs(new Date(b.start_time).getTime() - s.getTime()) < 3600000).length;
        const status = taken ? 'booked' : crowd >= 2 ? 'busy' : 'available';
        // estimated wait scales with crowding
        const wait = taken ? null : Math.min(35, crowd * 8 + (h >= 12 && h <= 14 ? 6 : 0));
        // score: prefer available, low wait, low crowd, mid-morning/late-afternoon
        let score = 0;
        if (!taken) {
          score = 100 - wait - crowd * 10;
          if (h >= 10 && h <= 11) score += 8;
          if (h >= 15 && h <= 16) score += 6;
          if (h >= 12 && h <= 13) score -= 6;
        }
        slots.push({ time: s.toISOString(), label: istTimeLabel(s), status, available: !taken, wait_min: wait, crowd, score });
      }
    }
    const best = [...slots].filter((s) => s.available).sort((a, b) => b.score - a.score).slice(0, 3);
    return res.status(200).json({ business: effBiz, service: svc, travel_min: travel, slots, recommended: best });
  } catch (err) {
    console.error('[smart-slots:error]', err.message);
    const s = safeError(err, 'smart-slots:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
