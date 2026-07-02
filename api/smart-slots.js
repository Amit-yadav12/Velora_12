import supabase from './db-client.js';
import { cors } from './_lib/security.js';
import { travelTimeMin } from './_lib/maps.js';

// AI Smart Slot Recommendation. Scores open slots by wait time, provider
// availability, travel time, expected crowding and time-of-day preference.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { business_id, service_id, date, origin_lat, origin_lng } = req.query;
    if (!business_id) return res.status(400).json({ error: 'business_id required' });
    const day = date || new Date().toISOString().slice(0, 10);

    const [{ data: biz }, svcRes] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', business_id).single(),
      service_id ? supabase.from('business_services').select('*').eq('id', service_id).single() : Promise.resolve({ data: null }),
    ]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const svc = svcRes.data;
    const dur = svc?.duration_min || 30;

    const dayStart = new Date(day + 'T00:00:00');
    const dayEnd = new Date(day + 'T23:59:59');
    const { data: booked } = await supabase.from('bookings').select('start_time,end_time,status')
      .eq('resource_name', biz.name).gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString()).neq('status', 'cancelled');

    // Travel time (Google Maps w/ fallback)
    let travel = 0;
    if (origin_lat && biz.lat != null) {
      travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: biz.lat, lng: biz.lng });
    }

    const openH = parseInt((biz.open_time || '09:00').split(':')[0], 10);
    const closeH = parseInt((biz.close_time || '18:00').split(':')[0], 10) || 18;
    const now = Date.now();
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      for (const m of [0, 30]) {
        const s = new Date(day + 'T00:00:00'); s.setHours(h, m, 0, 0);
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
        slots.push({ time: s.toISOString(), label: s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), status, available: !taken, wait_min: wait, crowd, score });
      }
    }
    const best = [...slots].filter((s) => s.available).sort((a, b) => b.score - a.score).slice(0, 3);
    return res.status(200).json({ business: biz, service: svc, travel_min: travel, slots, recommended: best });
  } catch (err) {
    console.error('[smart-slots:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
