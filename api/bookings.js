import supabase from './db-client.js';
import { cors, sanitizeText, isISODate, assert, clientIp, safeError } from './_lib/security.js';
import { getAuth, requireRole, businessScope, canAccessBusiness } from './_lib/auth.js';
import { istDateTimeLabel } from './_lib/ist.js';
import { verifyBookingToken, signBookingToken, verifyUrl, qrSigningReady } from './_lib/qr.js';
import { bookingRpcError } from './book.js';
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

// A committed lifecycle transition must not be reported as failed because an
// auxiliary notification, audit, reminder or calendar provider is unavailable.
async function bestEffort(label, tasks) {
  const results = await Promise.allSettled(tasks.map((task) => Promise.resolve().then(task)));
  for (const result of results) {
    if (result.status === 'rejected') console.error(`[bookings:${label}]`, result.reason?.message || result.reason);
    else if (result.value?.error) console.error(`[bookings:${label}]`, result.value.error.message || result.value.error);
  }
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
      const scope = await businessScope(auth);
      if (!scope.operator && !scope.ids.length) return res.status(200).json([]);
      let query = supabase.from('bookings').select('*').order('start_time', { ascending: false });
      if (!scope.operator) query = query.in('resource_id', scope.ids);
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

      const { data: existing, error: exErr } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
      if (exErr) throw exErr;
      assert(existing, 'Booking not found.', 404);

      const isAdmin = auth.profile?.role === 'admin';
      const scope = isAdmin ? await businessScope(auth) : { operator: false, ids: [] };
      const staffAccess = isAdmin && canAccessBusiness(scope, existing.resource_id);
      const isOwner = existing.customer_id === auth.user.id ||
        (!existing.customer_id && !!auth.user.email_confirmed_at && !!auth.user.email && (existing.customer_email || '').toLowerCase() === auth.user.email.toLowerCase());
      assert(staffAccess || isOwner, 'You are not allowed to modify this booking.', 403);
      if (action === 'status' || action === 'check_in') assert(staffAccess, 'Only authorized business staff can change this booking.', 403);

      const actor = auth.user.email;

      if (action === 'cancel') {
        assert(canTransition(existing.status, 'cancelled'), `A ${existing.status} booking cannot be cancelled.`);
        if (!staffAccess) {
          const { data: business, error: businessError } = await supabase.from('businesses').select('cancellation_hours').eq('id', existing.resource_id).maybeSingle();
          if (businessError) throw businessError;
          assert(business, 'Cancellation policy unavailable. Contact the business.', 409);
          const cutoff = Number(business.cancellation_hours || 0) * 3600000;
          assert(new Date(existing.start_time).getTime() - Date.now() > cutoff, `Cancellation requires at least ${business.cancellation_hours || 0} hours' notice.`, 409);
        }
        const { data, error } = await supabase.from('bookings').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', id).eq('status', existing.status).eq('start_time', existing.start_time).select().maybeSingle();
        if (error) throw error;
        assert(data, 'The booking changed. Refresh and try again.', 409);
        await bestEffort('cancel-side-effects', [
          () => supabase.from('booking_history').insert({ booking_id: id, action: 'cancelled', detail: 'Booking cancelled', actor }),
          () => audit(actor, 'booking.cancel', id, { ref: existing.ref }, ip),
          async () => { const meta = await getMeta(id); await Promise.all([meta?.calendar_event_id && deleteCalendarEvent(meta.calendar_event_id), meta?.business_calendar_event_id && deleteCalendarEvent(meta.business_calendar_event_id)]); },
          () => supabase.from('reminders').update({ sent: true }).eq('booking_id', id).eq('sent', false),
          () => supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: 'Booking cancelled', body: `${existing.service_name} — ${existing.ref}`, type: 'warning', booking_ref: existing.ref }]),
          () => sendEmail({ to: existing.customer_email, subject: `Booking cancelled — ${existing.ref}`, title: 'Booking cancelled', name: existing.customer_name, lines: [{ k: 'Reference', v: existing.ref }, { k: 'Service', v: existing.service_name }] }),
        ]);
        return res.status(200).json(data);
      }

      if (action === 'reschedule') {
        assert(['pending', 'confirmed'].includes(existing.status), `A ${existing.status} booking cannot be rescheduled.`);
        assert(isISODate(req.body.start_time), 'A valid new start time is required.');
        assert(qrSigningReady(), 'Ticket signing is unavailable. Try again later.', 503);
        const start = new Date(req.body.start_time);
        assert(start.getTime() > Date.now(), 'New time must be in the future.');
        const { data, error } = await supabase.rpc('reschedule_business_slot', { p_booking_id: id, p_start: start.toISOString() });
        if (error) {
          const mapped = bookingRpcError(error);
          if (mapped) return res.status(mapped.status).json({ error: mapped.error });
          throw error;
        }
        const end = new Date(data.end_time);
        const token = signBookingToken({ ref: data.ref, id: data.id, biz: data.resource_name, svc: data.service_name, at: data.start_time });
        const calPayload = { summary: `${existing.service_name} — ${existing.resource_name}`, description: `Velora booking ${existing.ref}`, start: start.toISOString(), end: end.toISOString(), location: existing.location };
        const newRem = [
          { kind: '24h', ms: 86400000 }, { kind: '1h', ms: 3600000 }, { kind: '15min', ms: 900000 },
        ].map((o) => ({ booking_id: id, booking_ref: existing.ref, kind: o.kind, fire_at: new Date(start.getTime() - o.ms).toISOString() }))
          .filter((r) => new Date(r.fire_at).getTime() > Date.now());
        await bestEffort('reschedule-side-effects', [
          () => supabase.from('booking_meta').upsert({ booking_id: id, qr_payload: verifyUrl(req, token), updated_at: new Date().toISOString() }),
          () => supabase.from('booking_history').insert({ booking_id: id, action: 'rescheduled', detail: `Moved to ${istDateTimeLabel(start)}`, actor }),
          () => audit(actor, 'booking.reschedule', id, { ref: existing.ref, to: start.toISOString() }, ip),
          async () => { const meta = await getMeta(id); await Promise.all([meta?.calendar_event_id && updateCalendarEvent(meta.calendar_event_id, calPayload), meta?.business_calendar_event_id && updateCalendarEvent(meta.business_calendar_event_id, calPayload)]); },
          async () => { await supabase.from('reminders').delete().eq('booking_id', id).eq('sent', false); if (newRem.length) await supabase.from('reminders').insert(newRem); },
          () => supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: 'Booking rescheduled', body: `${existing.ref} moved to ${istDateTimeLabel(start)}`, type: 'info', booking_ref: existing.ref }]),
          () => sendEmail({ to: existing.customer_email, subject: `Booking rescheduled — ${existing.ref}`, title: 'Booking rescheduled', name: existing.customer_name, lines: [{ k: 'Reference', v: existing.ref }, { k: 'New time', v: istDateTimeLabel(start) }] }),
        ]);
        return res.status(200).json(data);
      }

      // ---- Door check-in: the scanned ticket is PROOF, not decoration ----
      // The console posts the token it scanned; the signature is verified here
      // and the token's booking reference must match the row being checked in.
      // A booking cannot reach 'checked_in' without a valid ticket.
      if (action === 'check_in') {
        assert(staffAccess, 'Only authorized staff can check in a booking.', 403);
        assert(qrSigningReady(), 'Ticket verification is unavailable.', 503);
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
        if (String(verified.data.ref) !== String(existing.ref) || String(verified.data.id) !== String(existing.id) || new Date(verified.data.at).getTime() !== new Date(existing.start_time).getTime()) {
          return res.status(409).json({ error: 'That ticket belongs to a different booking.', reason: 'ref_mismatch' });
        }
        if (existing.status === 'checked_in') {
          return res.status(200).json({ ...existing, already_checked_in: true, ticket_verified: true });
        }
        assert(canTransition(existing.status, 'checked_in'), `A ${existing.status} booking cannot be checked in.`, 409);

        const { data, error } = await supabase.from('bookings')
          .update({ status: 'checked_in', updated_at: new Date().toISOString() })
          .eq('id', id).eq('status', existing.status).eq('start_time', existing.start_time).select().maybeSingle();
        if (error) throw error;
        if (!data) {
          const { data: current, error: currentError } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle();
          if (currentError) throw currentError;
          if (current?.status === 'checked_in' && new Date(current.start_time).getTime() === new Date(verified.data.at).getTime()) return res.status(200).json({ ...current, already_checked_in: true, ticket_verified: true });
          return res.status(409).json({ error: 'The booking changed. Refresh and try again.' });
        }
        await bestEffort('checkin-side-effects', [
          () => supabase.from('booking_meta').upsert({ booking_id: id, checked_in: true, updated_at: new Date().toISOString() }),
          () => supabase.from('booking_history').insert({ booking_id: id, action: 'checked_in', detail: `Ticket verified at the door (${verified.data.svc || existing.service_name})`, actor }),
          () => audit(actor, 'booking.check_in', id, { ref: existing.ref, ticket: 'verified', staff: actor }, ip),
          () => supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: 'Checked in', body: `${existing.service_name} — ${existing.ref}. See you inside!`, type: 'success', booking_ref: existing.ref }]),
        ]);
        return res.status(200).json({ ...data, ticket_verified: true });
      }

      if (action === 'status') {
        const status = sanitizeText(req.body.status, 20);
        assert(status !== 'checked_in', 'Check-in requires a signed ticket.', 403);
        assert(canTransition(existing.status, status), `Invalid transition: ${existing.status} → ${status}.`);
        const { data, error } = await supabase.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', id).eq('status', existing.status).eq('start_time', existing.start_time).select().maybeSingle();
        if (error) throw error;
        assert(data, 'The booking changed. Refresh and try again.', 409);
        await bestEffort('status-side-effects', [
          () => supabase.from('booking_history').insert({ booking_id: id, action: `status:${status}`, detail: `Marked ${status}`, actor }),
          () => audit(actor, 'booking.status', id, { ref: existing.ref, status }, ip),
          () => supabase.from('notifications').insert([{ user_id: existing.customer_id || null, audience: 'customer', title: `Booking ${status.replace('_', ' ')}`, body: `${existing.ref} · ${existing.service_name}`, type: status === 'completed' ? 'success' : 'info', booking_ref: existing.ref }]),
        ]);
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
