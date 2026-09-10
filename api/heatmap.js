import supabase from './db-client.js';
import { cors, enforceRateLimit } from './_lib/security.js';
import { syntheticHeatmap } from './_lib/synthetic.js';

// Live availability heatmap + AI availability predictor. Returns predicted
// occupancy per day (next 14 days) and per hour, derived from real bookings.
// Falls back to deterministic synthetic predictions when DB is unreachable.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'heatmap', { limit: 120, windowMs: 60_000 })) return;
  try {
    const { business_id } = req.query;
    // Synthetic businesses get deterministic predictions instantly.
    if (business_id && Number(business_id) >= 100000) {
      return res.status(200).json(syntheticHeatmap(Number(business_id)));
    }
    let allBookings = null;
    try {
      const q = supabase.from('bookings').select('start_time,status,resource_name');
      const { data } = await q;
      allBookings = data;
    } catch (e) {
      console.error('[heatmap:db]', e.message);
    }
    if (!allBookings) {
      return res.status(200).json(syntheticHeatmap(Number(business_id) || 0));
    }
    let bizName = null;
    if (business_id) {
      try {
        const biz = await supabase.from('businesses').select('name').eq('id', business_id).single();
        bizName = biz?.data?.name;
      } catch { /* non-fatal */ }
    }
    const bookings = (allBookings || []).filter((b) => b.status !== 'cancelled' && (!bizName || b.resource_name === bizName));

    // Occupancy by weekday (0-6) and hour (9-18) from history
    const weekdayCount = Array(7).fill(0);
    const hourCount = {};
    for (let h = 9; h <= 18; h++) hourCount[h] = 0;
    bookings.forEach((b) => {
      const d = new Date(b.start_time);
      weekdayCount[d.getDay()]++;
      const h = d.getHours();
      if (h in hourCount) hourCount[h]++;
    });
    // Blend with synthetic baseline so new businesses still show a forecast.
    const synth = syntheticHeatmap(Number(business_id) || 0);
    const maxWd = Math.max(1, ...weekdayCount);
    const maxHr = Math.max(1, ...Object.values(hourCount));

    // Next 14 days predicted occupancy
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
      const wd = d.getDay();
      const base = weekdayCount[wd] / maxWd; // 0..1 historical tendency
      // add mild noise + weekend uplift
      const occ = Math.min(1, Math.max(0.08, base * 0.7 + (wd === 5 || wd === 6 ? 0.25 : 0.1) + (i === 0 ? 0.15 : 0)));
      const blended = bookings.length > 5 ? occ : (occ * 0.4 + (synth.days[i].occupancy / 100) * 0.6);
      days.push({ date: d.toISOString().slice(0, 10), weekday: d.toLocaleDateString([], { weekday: 'short' }), day: d.getDate(), occupancy: Math.round(blended * 100) });
    }
    const hours = Object.entries(hourCount).map(([h, c]) => ({ hour: `${h}:00`, occupancy: Math.round((c / maxHr) * 100) }));

    // AI predictor: recommend the least crowded upcoming days
    const best = [...days].filter((d) => d.occupancy < 55).sort((a, b) => a.occupancy - b.occupancy).slice(0, 3);
    const busiest = [...days].sort((a, b) => b.occupancy - a.occupancy)[0];

    return res.status(200).json({ days, hours, best_days: best, busiest_day: busiest });
  } catch (err) {
    console.error('[heatmap:error]', err.message);
    try {
      return res.status(200).json(syntheticHeatmap(0));
    } catch {
      res.status(500).json({ error: err.message });
    }
  }
}
