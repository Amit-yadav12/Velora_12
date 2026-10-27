import { istTimeLabel } from './_lib/ist.js';
import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { getAuth, businessScope, canAccessBusiness } from './_lib/auth.js';
import { travelTimeMin } from './_lib/maps.js';
import { syntheticBusiness, isSyntheticId } from './_lib/synthetic.js';

// AI Travel Planner: given a booking (or business + start time) and an origin,
// computes travel time, recommended leave-time, and a \"leave now\" countdown.
// Booking lookups are authorization-checked (owner or admin) — a booking ref
// must never reveal another customer's appointment details.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (!enforceRateLimit(req, res, 'travel-planner', { limit: 60, windowMs: 60_000 })) return;
    const { business_id, booking_ref, start_time, origin_lat, origin_lng } = req.query;
    let biz = null, start = start_time ? new Date(start_time) : null;
    if (booking_ref) {
      const auth = await getAuth(req);
      const { data: bk } = await supabase.from('bookings').select('*').eq('ref', booking_ref).single();
      if (bk) {
        // Authorization: admin or the booking's own customer only.
        const scope = auth?.profile?.role === 'admin' ? await businessScope(auth) : { operator: false, ids: [] };
        const isAdmin = canAccessBusiness(scope, bk.resource_id);
        const isOwner = !!auth?.user && (bk.customer_id === auth.user.id || (!bk.customer_id && !!auth.user.email_confirmed_at && !!auth.user.email && auth.user.email.toLowerCase() === (bk.customer_email || '').toLowerCase()));
        if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not your booking' });
        if (bk.status === 'cancelled') return res.status(404).json({ error: 'Booking cancelled' });
        start = new Date(bk.start_time);
        if (!isDatabaseConfigured() && isSyntheticId(bk.resource_id)) {
          biz = syntheticBusiness(bk.resource_id);
        } else {
          const { data: b } = await supabase.from('businesses').select('*').eq('id', bk.resource_id).single(); biz = b;
        }
        // Local/demo bookings carry location only — synthesize a center point.
        if (!biz && bk.location) biz = { name: bk.resource_name, address: bk.location, lat: null, lng: null };
      }
    } else if (business_id) {
      if (!isDatabaseConfigured() && isSyntheticId(business_id)) biz = syntheticBusiness(business_id);
      else {
        const { data: b } = await supabase.from('businesses').select('*').eq('id', business_id).single(); biz = b;
        if (!biz && !isDatabaseConfigured()) biz = syntheticBusiness(business_id);
      }
    }
    if (!biz || !start) return res.status(400).json({ error: 'Provide business_id/booking_ref and start_time' });

    if (!origin_lat || !origin_lng || !Number.isFinite(+origin_lat) || !Number.isFinite(+origin_lng) || Math.abs(+origin_lat) > 90 || Math.abs(+origin_lng) > 180 || biz.lat == null || biz.lng == null || !Number.isFinite(start.getTime())) return res.status(422).json({ error: 'A valid location and appointment time are needed for a travel estimate.' });
    const travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: biz.lat, lng: biz.lng });
    if (!travel) return res.status(503).json({ error: 'Travel estimate unavailable.' });
    const buffer = 10; // parking + walk-in buffer
    const leaveAt = new Date(start.getTime() - (travel + buffer) * 60000);
    const minsUntilLeave = Math.round((leaveAt.getTime() - Date.now()) / 60000);
    return res.status(200).json({
      business: biz.name, address: biz.address, travel_min: travel, buffer_min: buffer,
      leave_at: leaveAt.toISOString(),
      leave_label: istTimeLabel(leaveAt),
      mins_until_leave: minsUntilLeave,
      should_leave_now: minsUntilLeave <= 5 && minsUntilLeave > -30,
      maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address || biz.name)}`,
    });
  } catch (err) {
    console.error('[travel-planner:error]', err.message);
    const s = safeError(err, 'travel-planner:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
