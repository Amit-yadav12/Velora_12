import { publicBusiness } from './_lib/public-business.js';
import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { syntheticBusiness, syntheticSlots, isSyntheticId } from './_lib/synthetic.js';
import { istDayBounds, istTimeLabel, istWallDate, istYmd, istWeekdayLabel } from './_lib/ist.js';

export function buildAvailableSlots({ date, business, service, staff, bookings, staffId, now = Date.now() }) {
  const bounds = istDayBounds(date);
  if (!bounds || istYmd(bounds.start) !== date) return null;
  if ((business.holidays || []).includes(date)) return [];
  const weekday = istWeekdayLabel(bounds.start).toLowerCase();
  const day = business.weekly_hours?.[weekday];
  if (day?.closed) return [];
  const parse = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
  const open = parse(day?.open || business.open_time || '09:00');
  const close = parse(day?.close || business.close_time || '20:00');
  const duration = Number(service.duration_min);
  if (!Number.isFinite(open) || !Number.isFinite(close) || !Number.isFinite(duration) || duration < 5 || close <= open) return [];
  const roster = staff.filter((s) => s.active !== false);
  const chosen = staffId == null ? roster : roster.filter((s) => String(s.id) === String(staffId));
  if (staffId != null && !chosen.length) return [];
  const activeBookings = bookings.filter((b) => ['pending', 'confirmed', 'checked_in', 'in_progress', 'completed'].includes(b.status));
  const slots = [];
  for (let minutes = open; minutes + duration <= close; minutes += 30) {
    const start = istWallDate(date, Math.floor(minutes / 60), minutes % 60);
    const end = new Date(start.getTime() + duration * 60000);
    if (start.getTime() <= now) continue;
    const overlaps = activeBookings.filter((b) => new Date(b.start_time) < end && new Date(b.end_time) > start);
    const available = roster.length === 0
      ? overlaps.length === 0
      : chosen.some((person) => !overlaps.some((b) => String(b.staff_id || '') === String(person.id) || (!b.staff_id && (!b.employee_name || String(b.employee_name).toLowerCase() === String(person.name).toLowerCase()))));
    slots.push({ time: start.toISOString(), label: istTimeLabel(start), available, status: available ? 'available' : 'booked', score: available ? 100 : 0 });
  }
  return slots;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'business-slots', { limit: 180, windowMs: 60_000 })) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { business_id, service_id, date, staff_id } = req.query;
    if (!business_id || !service_id || !date) return res.status(400).json({ error: 'business_id, service_id and date are required.' });
    if (!isDatabaseConfigured() && isSyntheticId(business_id)) {
      const biz = syntheticBusiness(business_id);
      if (!biz) return res.status(404).json({ error: 'Business not found' });
      const svc = (biz.services || []).find((s) => String(s.id) === String(service_id));
      if (!svc) return res.status(404).json({ error: 'Service not found' });
      // Sample data remains labelled as sample and is never accepted by /api/book.
      const slots = syntheticSlots(Number(business_id), date, svc.duration_min, biz.open_time, biz.close_time);
      return res.status(200).json({ business: biz, service: svc, slots, sample: true });
    }
    const bounds = istDayBounds(date);
    if (!bounds || istYmd(bounds.start) !== date) return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD.' });
    const [{ data: biz, error: be }, { data: svc, error: se }, { data: staff, error: ste }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', business_id).eq('active', true).maybeSingle(),
      supabase.from('business_services').select('*').eq('id', service_id).eq('business_id', business_id).eq('active', true).maybeSingle(),
      supabase.from('business_staff').select('id,name,active').eq('business_id', business_id).eq('active', true),
    ]);
    if (be || se || ste) throw be || se || ste;
    if (!biz || !svc) return res.status(404).json({ error: 'Business or service not found.' });
    let bookingsQuery = supabase.from('bookings').select('start_time,end_time,status,staff_id,employee_name').eq('resource_id', biz.id)
      .lt('start_time', bounds.end.toISOString()).gt('end_time', bounds.start.toISOString());
    const legacyQuery = supabase.from('bookings').select('start_time,end_time,status,staff_id,employee_name').is('resource_id', null).eq('resource_name', biz.name)
      .lt('start_time', bounds.end.toISOString()).gt('end_time', bounds.start.toISOString());
    const [booked, legacy] = await Promise.all([bookingsQuery, legacyQuery]);
    if (booked.error || legacy.error) throw booked.error || legacy.error;
    const slots = buildAvailableSlots({ date, business: biz, service: svc, staff: staff || [], bookings: [...(booked.data || []), ...(legacy.data || [])], staffId: staff_id || null });
    if (!slots) return res.status(400).json({ error: 'Invalid date.' });
    return res.status(200).json({ business: publicBusiness(biz), service: svc, slots, recommended: slots.filter((s) => s.available).slice(0, 3) });
  } catch (err) {
    const s = safeError(err, 'business-slots:error');
    if (!res.headersSent) return res.status(s.status).json({ error: s.error });
  }
}
