import supabase from './db-client.js';
import { cors } from './_lib/security.js';

// Live availability heatmap + AI availability predictor. Returns predicted
// occupancy per day (next 14 days) and per hour, derived from real bookings.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { business_id } = req.query;
    let q = supabase.from('bookings').select('start_time,status,resource_name');
    const { data: allBookings } = await q;
    const biz = business_id ? await supabase.from('businesses').select('name').eq('id', business_id).single() : null;
    const bizName = biz?.data?.name;
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
      days.push({ date: d.toISOString().slice(0, 10), weekday: d.toLocaleDateString([], { weekday: 'short' }), day: d.getDate(), occupancy: Math.round(occ * 100) });
    }
    const hours = Object.entries(hourCount).map(([h, c]) => ({ hour: `${h}:00`, occupancy: Math.round((c / maxHr) * 100) }));

    // AI predictor: recommend the least crowded upcoming days
    const best = [...days].filter((d) => d.occupancy < 55).sort((a, b) => a.occupancy - b.occupancy).slice(0, 3);
    const busiest = [...days].sort((a, b) => b.occupancy - a.occupancy)[0];

    return res.status(200).json({ days, hours, best_days: best, busiest_day: busiest });
  } catch (err) {
    console.error('[heatmap:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
