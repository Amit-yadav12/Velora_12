import supabase from './db-client.js';
import { cors , enforceRateLimit, safeError } from './_lib/security.js';
import { syntheticBusiness, syntheticSlots, isSyntheticId } from './_lib/synthetic.js';
import { istDayBounds, istTimeLabel, istWallDate } from './_lib/ist.js';

// Available time slots for a business service on a date, checking real
// bookings for conflicts. Slots are within business open/close hours.
// Supports synthetic ecosystem businesses deterministically.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'business-slots', { limit: 180, windowMs: 60_000 })) return;
  try {
    const { business_id, service_id, date } = req.query;
    if (!business_id || !date) return res.status(400).json({ error: 'business_id and date required' });

    if (isSyntheticId(business_id)) {
      const biz = syntheticBusiness(business_id);
      if (!biz) return res.status(404).json({ error: 'Business not found' });
      const svc = (biz.services || []).find((s) => String(s.id) === String(service_id)) || biz.services?.[0] || null;
      const slots = syntheticSlots(Number(business_id), date, svc?.duration_min || 30, biz.open_time, biz.close_time)
        .map((s) => ({ time: s.time, label: s.label, available: s.available }));
      return res.status(200).json({ business: biz, service: svc, slots });
    }

    const [{ data: biz }, { data: svc }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', business_id).single(),
      service_id ? supabase.from('business_services').select('*').eq('id', service_id).single() : Promise.resolve({ data: null }),
    ]);
    if (!biz) {
      const synth = syntheticBusiness(business_id);
      if (!synth) return res.status(404).json({ error: 'Business not found' });
      const s2 = syntheticSlots(Number(business_id) || 100001, date, 30, synth.open_time, synth.close_time)
        .map((s) => ({ time: s.time, label: s.label, available: s.available }));
      return res.status(200).json({ business: synth, service: null, slots: s2 });
    }
    const dur = svc?.duration_min || 30;

    // The requested date is an IST calendar date — query the exact IST day
    // window, not the runtime's local midnight (serverless runs in UTC).
    const bounds = istDayBounds(date);
    if (!bounds) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    const { data: booked } = await supabase.from('bookings').select('start_time,end_time,status')
      .eq('resource_name', biz.name)
      .gte('start_time', bounds.start.toISOString()).lt('start_time', bounds.end.toISOString())
      .neq('status', 'cancelled');

    const openH = parseInt((biz.open_time || '09:00').split(':')[0], 10);
    const closeH = biz.open_time === '00:00' ? 24 : (parseInt((biz.close_time || '18:00').split(':')[0], 10) || 18);
    const now = Date.now();
    const slots = [];
    for (let h = openH; h < closeH; h++) {
      for (const m of [0, 30]) {
        const s = istWallDate(date, h, m);
        if (Number.isNaN(s.getTime())) continue;
        const e = new Date(s.getTime() + dur * 60000);
        if (s.getTime() < now) continue;
        const taken = (booked || []).some((b) => new Date(b.start_time) < e && new Date(b.end_time) > s);
        slots.push({ time: s.toISOString(), label: istTimeLabel(s), available: !taken });
      }
    }
    return res.status(200).json({ business: biz, service: svc, slots });
  } catch (err) {
    console.error('[business-slots:error]', err.message);
    const s = safeError(err, 'business-slots:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
