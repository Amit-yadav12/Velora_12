import supabase from './db-client.js';
import { cors } from './_lib/security.js';
import { travelTimeMin } from './_lib/maps.js';
import { syntheticBusiness, isSyntheticId } from './_lib/synthetic.js';

// AI Travel Planner: given a booking (or business + start time) and an origin,
// computes travel time, recommended leave-time, and a \"leave now\" countdown.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const { business_id, booking_ref, start_time, origin_lat, origin_lng } = req.query;
    let biz = null, start = start_time ? new Date(start_time) : null;
    if (booking_ref) {
      const { data: bk } = await supabase.from('bookings').select('*').eq('ref', booking_ref).single();
      if (bk) {
        start = new Date(bk.start_time);
        if (isSyntheticId(bk.resource_id)) {
          biz = syntheticBusiness(bk.resource_id);
        } else {
          const { data: b } = await supabase.from('businesses').select('*').eq('name', bk.resource_name).single(); biz = b;
        }
        // Local/demo bookings carry location only — synthesize a center point.
        if (!biz && bk.location) biz = { name: bk.resource_name, address: bk.location, lat: origin_lat ? +origin_lat : null, lng: origin_lng ? +origin_lng : null };
      }
    } else if (business_id) {
      if (isSyntheticId(business_id)) biz = syntheticBusiness(business_id);
      else {
        const { data: b } = await supabase.from('businesses').select('*').eq('id', business_id).single(); biz = b;
        if (!biz) biz = syntheticBusiness(business_id);
      }
    }
    if (!biz || !start) return res.status(400).json({ error: 'Provide business_id/booking_ref and start_time' });

    let travel = 15;
    if (origin_lat && biz.lat != null) travel = await travelTimeMin({ lat: +origin_lat, lng: +origin_lng }, { lat: biz.lat, lng: biz.lng }) || 15;
    const buffer = 10; // parking + walk-in buffer
    const leaveAt = new Date(start.getTime() - (travel + buffer) * 60000);
    const minsUntilLeave = Math.round((leaveAt.getTime() - Date.now()) / 60000);
    return res.status(200).json({
      business: biz.name, address: biz.address, travel_min: travel, buffer_min: buffer,
      leave_at: leaveAt.toISOString(),
      leave_label: leaveAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      mins_until_leave: minsUntilLeave,
      should_leave_now: minsUntilLeave <= 5 && minsUntilLeave > -30,
      maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address || biz.name)}`,
    });
  } catch (err) {
    console.error('[travel-planner:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
