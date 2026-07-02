import supabase from './db-client.js';
import { cors, sanitizeText, isISODate, assert, clientIp } from './_lib/security.js';
import { getAuth, requireRole } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { updateCalendarEvent, deleteCalendarEvent } from './_lib/calendar.js';

async function getMeta(bookingId) {
  const { data } = await supabase.from('booking_meta').select('*').eq('booking_id', bookingId).single();
  return data || null;
}

async function audit(actor, action, entityId, metadata, ip) {
  try { await supabase.from('audit_logs').insert({ actor, action, entity: 'booking', entity_id: String(entityId), metadata, ip }); }
  catch (e) { console.error('[audit]', e.message); }
}

// Booking management: list (admin) + cancel / reschedule / status.
// Creation happens in /api/book. Every mutation is authorization-checked:
// customers may only act on their own bookings; admins may act on any.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);

  try {
    // ---------- LIST (admin only) ----------
    if (req.method === 'GET') {
      const auth = await getAuth(req);
      const gate = requireRole(auth, ['admin']);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const { data, error } = await supabase.from('bookings').select('*').order('start_time', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    // ---------- UPDATE (cancel / reschedule / status) ----------
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const auth = await getAuth(req);
      assert(auth?.user, 'Authentication required.', 401);
      const { id, action } = req.body || {};
      assert(id, 'Booking id is required.');

      const { data: existing, error: exErr } = await supabase.from('bookings').select('*').eq('id', id).single();
      assert(!exErr && existing, 'Booking not found.', 404);

      // Authorization: admins may act on any booking; customers only on their own.
      const isAdmin = auth.profile?.role === 'admin';
      const isOwner = existing.customer_id === auth.user.id ||
        (existing.customer_email || '').toLowerCase() === (auth.user.email || '').toLowerCase();
      assert(isAdmin || isOwner, 'You are not allowed to modify this booking.', 403);

      // Customers cannot set arbitrary internal statuses (admin-only action).
      if (action === 'status') assert(isAdmin, 'Only staff can change booking status.', 403);

      const actor = auth.user.email;

      if (action === 'cancel') {
        assert(existing.status !== 'cancelled', 'Booking is already cancelled.');
        const { data, error } = await supabase.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('booking_history').insert({ booking_id: id, action: 'cancelled', detail: 'Booking cancelled', actor });
        await audit(actor, 'booking.cancel', id, { ref: existing.ref }, ip);
        // Calendar sync: delete events + cancel pending reminders
        const meta = await getMeta(id);
        if (meta?.calendar_event_id) await deleteCalendarEvent(meta.calendar_event_id);
        if (meta?.business_calendar_event_id) await deleteCalendarEvent(meta.business_calendar_event_id);
        await supabase.from('reminders').update({ sent: true }).eq('booking_id', id).eq('sent', false);
        await supabase.from('notifications').insert([
          { user_id: existing.customer_id || null, audience: 'customer', title: 'Booking cancelled', body: `${existing.service_name} — ${existing.ref}`, type: 'warning', booking_ref: existing.ref },
          { audience: 'admin', title: 'Booking cancelled', body: `${existing.ref} — slot now open`, type: 'warning', booking_ref: existing.ref },
        ]);
        await sendEmail({ to: existing.customer_email, subject: `Booking cancelled — ${existing.ref}`, title: 'Booking cancelled', name: existing.customer_name, lines: [{ k: 'Reference', v: existing.ref }, { k: 'Service', v: existing.service_name }] });
        return res.status(200).json(data);
      }

      if (action === 'reschedule') {
        assert(isISODate(req.body.start_time), 'A valid new start time is required.');
        const start = new Date(req.body.start_time);
        assert(start.getTime() > Date.now(), 'New time must be in the future.');
        const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
        const end = new Date(start.getTime() + (durationMs || 30 * 60000));
        // Conflict check for the same business/resource.
        const { data: conflicts } = await supabase.from('bookings').select('id')
          .eq('resource_name', existing.resource_name).neq('status', 'cancelled').neq('id', id)
          .lt('start_time', end.toISOString()).gt('end_time', start.toISOString());
        assert(!conflicts || conflicts.length === 0, 'That time is no longer available. Please choose another slot.', 409);
        const { data, error } = await supabase.from('bookings').update({ start_time: start.toISOString(), end_time: end.toISOString(), updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('booking_history').insert({ booking_id: id, action: 'rescheduled', detail: `Moved to ${start.toLocaleString()}`, actor });
        await audit(actor, 'booking.reschedule', id, { ref: existing.ref, to: start.toISOString() }, ip);
        // Calendar sync: update events + reschedule reminders
        const rmeta = await getMeta(id);
        const calPayload = { summary: `${existing.service_name} — ${existing.resource_name}`, description: `Velora booking ${existing.ref}`, start: start.toISOString(), end: end.toISOString(), location: existing.location };
        if (rmeta?.calendar_event_id) await updateCalendarEvent(rmeta.calendar_event_id, calPayload);
        if (rmeta?.business_calendar_event_id) await updateCalendarEvent(rmeta.business_calendar_event_id, calPayload);
        await supabase.from('reminders').delete().eq('booking_id', id).eq('sent', false);
        const newRem = [
          { kind: '24h', ms: 86400000 }, { kind: '1h', ms: 3600000 }, { kind: '15min', ms: 900000 },
        ].map((o) => ({ booking_id: id, booking_ref: existing.ref, kind: o.kind, fire_at: new Date(start.getTime() - o.ms).toISOString() }))
          .filter((r) => new Date(r.fire_at).getTime() > Date.now());
        if (newRem.length) await supabase.from('reminders').insert(newRem);
        await supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: 'Booking rescheduled', body: `${existing.ref} moved to ${start.toLocaleString()}`, type: 'info', booking_ref: existing.ref }]);
        await sendEmail({ to: existing.customer_email, subject: `Booking rescheduled — ${existing.ref}`, title: 'Booking rescheduled', name: existing.customer_name, lines: [{ k: 'Reference', v: existing.ref }, { k: 'New time', v: start.toLocaleString() }] });
        return res.status(200).json(data);
      }

      if (action === 'status') {
        const status = sanitizeText(req.body.status, 20);
        assert(['confirmed', 'in_progress', 'checked_in', 'completed', 'no_show'].includes(status), 'Invalid status.');
        if (status === 'checked_in') await supabase.from('booking_meta').upsert({ booking_id: id, checked_in: true, updated_at: new Date().toISOString() });
        const { data, error } = await supabase.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('booking_history').insert({ booking_id: id, action: `status:${status}`, detail: `Marked ${status}`, actor });
        await audit(actor, 'booking.status', id, { ref: existing.ref, status }, ip);
        await supabase.from('notifications').insert([{ audience: 'admin', title: `Booking ${status.replace('_', ' ')}`, body: `${existing.ref} · ${existing.customer_name}`, type: status === 'completed' ? 'success' : 'info', booking_ref: existing.ref }]);
        return res.status(200).json(data);
      }

      assert(false, 'Unknown action.');
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[bookings:error]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
}
