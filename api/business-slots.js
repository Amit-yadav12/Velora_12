import supabase from './db-client.js';
import { cors } from './_lib/security.js';

// Available time slots for a business service on a date, checking real
// bookings for conflicts. Slots are within business open/close hours.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { business_id, service_id, date } = req.query;
    if (!business_id || !date) return res.status(400).json({ error: 'business_id and date required' });
    const [{ data: biz }, { data: svc }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', business_id).single(),
      service_id ? supabase.from('business_services').select('*').eq('id', service_id).single() : Promise.resolve({ data: null }),
    ]);
    if (!biz) return res.status(404).json({ error: 'Business not found' });
    const dur = svc?.duration_min || 30;

    const dayStart = new Date(date + 'T00:00:00');
    const dayEnd = new Date(date + 'T23:59:59');
    const { data: booked } = await supabase.from('bookings').select('start_time,end_time,status')
      .eq('resource_name', biz.name).gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString()).neq('status', 'cancelled');

    const openH = parseInt((biz.open_time || '09:00').split(':')[0], 10);
    const closeH = parseInt((biz.close_time || '18:00').split(':')[0], 10) || 18;
    const now = Date.now();
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      for (const m of [0, 30]) {
        const s = new Date(date + 'T00:00:00'); s.setHours(h, m, 0, 0);
        const e = new Date(s.getTime() + dur * 60000);
        if (s.getTime() < now) continue;
        const taken = (booked || []).some((b) => new Date(b.start_time) < e && new Date(b.end_time) > s);
        slots.push({ time: s.toISOString(), label: s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), available: !taken });
      }
    }
    return res.status(200).json({ business: biz, service: svc, slots });
  } catch (err) {
    console.error('[business-slots:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
