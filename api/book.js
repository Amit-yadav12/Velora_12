import { publicBusiness } from './_lib/public-business.js';
import { randomBytes } from 'node:crypto';
import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, sanitizeText, isEmail, isISODate, assert, enforceRateLimit, safeError } from './_lib/security.js';
import { signBookingToken, verifyUrl, qrSigningReady } from './_lib/qr.js';
import { getAuth } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { calendarAuthMode, createCalendarEvent } from './_lib/calendar.js';
import { istDateTimeLabel } from './_lib/ist.js';

export function bookingRpcError(error) {
  if (error?.code === '23P01' || error?.code === '23505') return { status: 409, error: 'That slot was just taken. Please pick another time.' };
  if (error?.code === 'P0002') return { status: 404, error: 'The business, service or specialist is not available.' };
  if (error?.code === 'P0001') return { status: 400, error: 'That time is outside the business’s available hours.' };
  return null;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    assert(req.method === 'POST', 'Method not allowed', 405);
    if (!enforceRateLimit(req, res, 'book', { limit: 20, windowMs: 60_000 })) return;
    const body = req.body || {};
    // Sample/Google listings are information, not inventory. Never accept a
    // browser-supplied business/service snapshot as a real reservation.
    assert(/^\d+$/.test(String(body.business_id || '')) && /^\d+$/.test(String(body.service_id || '')), 'Only registered Velora businesses can accept bookings.', 400);
    assert(isISODate(body.start_time) && new Date(body.start_time).getTime() > Date.now(), 'A future time slot is required.');
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Booking is unavailable because the database is not configured. No appointment was created.' });
    if (!qrSigningReady()) return res.status(503).json({ error: 'Booking is unavailable because ticket signing is not configured. No appointment was created.' });
    const auth = await getAuth(req);
    assert(auth?.user?.id, 'Sign in to book.', 401);
    const email = isEmail(auth.user.email) ? auth.user.email.toLowerCase() : null;
    if (body.customer_email) assert(email && String(body.customer_email).trim().toLowerCase() === email, 'Use the email address on your signed-in account.');
    const name = sanitizeText(body.customer_name, 120) || sanitizeText(auth.profile?.full_name, 120);
    assert(name, 'Your name is required.');
    const key = sanitizeText(body.idempotency_key || req.headers?.['x-idempotency-key'], 80);
    assert(key, 'A booking retry key is required.');
    const staffId = body.staff_id == null || body.staff_id === '' ? null : Number(body.staff_id);
    assert(staffId == null || (Number.isSafeInteger(staffId) && staffId > 0), 'Invalid specialist.');
    const ref = `VL-${randomBytes(6).toString('hex').toUpperCase()}`;
    const { data: result, error } = await supabase.rpc('reserve_business_slot', {
      p_business_id: Number(body.business_id), p_service_id: Number(body.service_id), p_staff_id: staffId,
      p_customer_id: auth.user.id, p_customer_name: name, p_customer_email: email,
      p_notes: sanitizeText(body.notes, 500), p_start: new Date(body.start_time).toISOString(),
      p_ref: ref, p_idempotency_key: key,
    });
    if (error) {
      const mapped = bookingRpcError(error);
      if (mapped) return res.status(mapped.status).json({ error: mapped.error });
      throw error;
    }
    const booking = result?.booking, business = result?.business;
    assert(booking?.id && booking.ref && business?.id, 'Reservation could not be confirmed.', 500);
    const token = signBookingToken({ ref: booking.ref, id: booking.id, biz: booking.resource_name, svc: booking.service_name, at: booking.start_time });
    const qrPayload = verifyUrl(req, token);
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(business.lat != null && business.lng != null ? `${business.lat},${business.lng}` : business.address || business.name)}`;
    let remindersScheduled = 0, emailStatus = 'not_configured';
    // Auxiliary delivery failures do not undo or disguise the committed booking.
    if (!result.replayed) {
      try {
        const meta = await supabase.from('booking_meta').upsert({ booking_id: booking.id, qr_payload: qrPayload, updated_at: new Date().toISOString() });
        if (meta.error) console.error('[book:qr-store]', meta.error.message);
        const offsets = [['24h', 86400000], ['6h', 21600000], ['1h', 3600000], ['15min', 900000]];
        const reminders = offsets.map(([kind, ms]) => ({ booking_id: booking.id, booking_ref: booking.ref, kind, fire_at: new Date(new Date(booking.start_time).getTime() - ms).toISOString() })).filter((r) => new Date(r.fire_at).getTime() > Date.now());
        if (reminders.length) {
          const saved = await supabase.from('reminders').insert(reminders);
          if (!saved.error) remindersScheduled = reminders.length;
        }
        const calendarTask = calendarAuthMode() === 'none' ? Promise.resolve([]) : Promise.all([
          createCalendarEvent({ summary: `${booking.service_name} — ${business.name}`, description: `Velora booking ${booking.ref}`,
            start: booking.start_time, end: booking.end_time, location: business.address, attendees: email ? [email] : [] }),
          createCalendarEvent({ summary: `${name} — ${booking.service_name}`, description: `Velora booking ${booking.ref}`,
            start: booking.start_time, end: booking.end_time, location: business.address, attendees: business.email ? [business.email] : [] }),
        ]);
        const [emailResult, calendar] = await Promise.all([
          email ? sendEmail({ to: email, subject: `Your booking is confirmed — ${booking.ref}`, title: 'Booking confirmed', name, bookingRef: booking.ref,
            lines: [{ k: 'Reference', v: booking.ref }, { k: 'Business', v: booking.resource_name }, { k: 'Service', v: booking.service_name }, { k: 'When', v: istDateTimeLabel(booking.start_time) }, { k: 'Price', v: `₹${Number(booking.price).toLocaleString('en-IN')}` }],
            cta: { label: 'View ticket', href: qrPayload } }) : Promise.resolve({ status: 'not_applicable' }),
          calendarTask,
        ]);
        emailStatus = emailResult.status === 'sent' ? emailResult.provider : emailResult.status;
        if (calendar.length) {
          await supabase.from('booking_meta').upsert({ booking_id: booking.id, qr_payload: qrPayload,
            calendar_event_id: calendar[0]?.configured && calendar[0]?.ok ? calendar[0].eventId : null,
            business_calendar_event_id: calendar[1]?.configured && calendar[1]?.ok ? calendar[1].eventId : null,
            updated_at: new Date().toISOString() });
        }
      } catch (e) { console.error('[book:delivery]', e.message); emailStatus = 'failed'; }
    }
    return res.status(result.replayed ? 200 : 201).json({ booking, business: publicBusiness(business), invoice: result.invoice, maps_link: mapsLink,
      qr_payload: qrPayload, deduplicated: !!result.replayed, demo_mode: false,
      pipeline: { saved: true, email: emailStatus, reminders_scheduled: remindersScheduled } });
  } catch (err) {
    const s = safeError(err, 'book:error');
    if (!res.headersSent) return res.status(s.status).json({ error: s.error });
  }
}
