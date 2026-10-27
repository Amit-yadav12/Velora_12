import supabase from './db-client.js';
import { cors, sanitizeText, isISODate, assert, clientIp, safeError } from './_lib/security.js';
import { getAuth, requireRole, ownedBusinessNames, canOperateOn } from './_lib/auth.js';
import { istDateTimeLabel } from './_lib/ist.js';
import { verifyBookingToken } from './_lib/qr.js';
import { sendEmail } from './_lib/email.js';
import { updateCalendarEvent, deleteCalendarEvent } from './_lib/calendar.js';

async function getMeta(bookingId) {
  const { data } = await supabase.from('booking_meta').select('*').eq('booking_id', bookingId).single();
  return data || null;
}

// Mirrors src/lib/bookingStatus.ts — the server-side authority for status
// transitions. Customers AND staff can never make a nonsensical move,
// regardless of where the change originates.
const STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'in_progress', 'completed', 'cancelled'],
  checked_in: ['completed', 'no_show'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  no_show: [],
};

function canTransition(from, to) {
  const allowed = STATUS_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

async function audit(actor, action, entityId, metadata, ip) {
  try { await supabase.from('audit_logs').insert({ actor, action, entity: 'booking', entity_id: String(entityId), metadata, ip }); }
  catch (e) { console.error('[audit]', e.message); }
}

// Booking management: list (admin) + cancel / reschedule / status.
// Creation happens in /api/book. Every mutation is authorization-checked:
// customers may only act on their own bookings; admins may act on any.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);

  try {
    // ---------- LIST (admin only) ----------
    if (req.method === 'GET') {
      const auth = await getAuth(req);
      const gate = requireRole(auth, ['admin']);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      // Object-level authorization: an owner only ever lists their own
      // business's appointments. A caller who owns no business is the platform
      // operator and sees the whole estate. Ownership comes from the DB
      // (businesses.owner_user_id), never from the request.
      const owned = await ownedBusinessNames(auth.user.id);
      let query = supabase.from('bookings').select('*').order('start_time', { ascending: false });
      if (owned.length) query = query.in('resource_name', owned);
      const { data, error } = await query;
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

      // Same object-level check for mutations, before any state change.
      const owned = isAdmin ? await ownedBusinessNames(auth.user.id) : [];
      assert(canOperateOn(owned, existing.resource_name), 'This booking belongs to another business.', 403);

      const actor = auth.user.email;

      if (action === 'cancel') {
        assert(canTransition(existing.status, 'cancelled'), `A ${existing.status} booking cannot be cancelled.`);
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
        assert(['pending', 'confirmed', 'checked_in', 'in_progress'].includes(existing.status), `A ${existing.status} booking cannot be rescheduled.`);
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
        await supabase.from('booking_history').insert({ booking_id: id, action: 'rescheduled', detail: `Moved to ${istDateTimeLabel(start)}`, actor });
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
        await supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: 'Booking rescheduled', body: `${existing.ref} moved to ${istDateTimeLabel(start)}`, type: 'info', booking_ref: existing.ref }]);
        await sendEmail({ to: existing.customer_email, subject: `Booking rescheduled — ${existing.ref}`, title: 'Booking rescheduled', name: existing.customer_name, lines: [{ k: 'Reference', v: existing.ref }, { k: 'New time', v: `${istDateTimeLabel(start)}` }] });
        return res.status(200).json(data);
      }

      // ---- Door check-in: the scanned ticket is PROOF, not decoration ----
      // The console posts the token it scanned; the signature is verified here
      // and the token's booking reference must match the row being checked in.
      // A booking cannot reach 'checked_in' without a valid ticket.
      if (action === 'check_in') {
        assert(isAdmin, 'Only staff can check in a booking.', 403);
        const ticket = sanitizeText(req.body.ticket, 2000);
        assert(ticket, 'Scan or paste the ticket to check in.', 400);
        const verified = verifyBookingToken(ticket);
        if (!verified.ok) {
          const messages = {
            malformed: 'This QR code is not a valid Velora ticket.',
            invalid_signature: 'This ticket failed verification — it may have been altered.',
            expired: 'This ticket has expired.',
            legacy: 'This ticket was issued before verification was enabled.',
          };
          return res.status(400).json({ error: messages[verified.reason] || 'This ticket could not be verified.', reason: verified.reason });
        }
        if (String(verified.data.ref) !== String(existing.ref)) {
          return res.status(409).json({ error: 'That ticket belongs to a different booking.', reason: 'ref_mismatch' });
        }
        if (existing.status === 'checked_in') {
          return res.status(200).json({ ...existing, already_checked_in: true, ticket_verified: true });
        }
        assert(canTransition(existing.status, 'checked_in'), `A ${existing.status} booking cannot be checked in.`, 409);

        const { data, error } = await supabase.from('bookings')
          .update({ status: 'checked_in', updated_at: new Date().toISOString() })
          .eq('id', id).select().single();
        if (error) throw error;
        await supabase.from('booking_meta').upsert({ booking_id: id, checked_in: true, updated_at: new Date().toISOString() });
        await supabase.from('booking_history').insert({
          booking_id: id, action: 'checked_in',
          detail: `Ticket verified at the door (${verified.data.svc || existing.service_name})`, actor,
        });
        await audit(actor, 'booking.check_in', id, { ref: existing.ref, ticket: 'verified', staff: actor }, ip);
        await supabase.from('notifications').insert([
          { user_id: existing.customer_id || null, audience: 'customer', title: 'Checked in', body: `${existing.service_name} — ${existing.ref}. See you inside!`, type: 'success', booking_ref: existing.ref },
          { audience: 'admin', title: 'Checked in', body: `${existing.ref} · ${existing.customer_name}`, type: 'info', booking_ref: existing.ref },
        ]);
        return res.status(200).json({ ...data, ticket_verified: true });
      }

      if (action === 'status') {
        const status = sanitizeText(req.body.status, 20);
        assert(canTransition(existing.status, status), `Invalid transition: ${existing.status} → ${status}.`);
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
    // 4xx messages are written for humans; anything else is logged, never
    // echoed (driver/schema errors can disclose internals).
    const s = safeError(err, 'bookings:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
