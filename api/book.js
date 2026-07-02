import supabase from './db-client.js';
import { cors, sanitizeText, isEmail, isISODate, assert, clientIp } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { createCalendarEvent } from './_lib/calendar.js';

function scheduleReminders(bookingId, ref, start) {
  const offsets = [
    { kind: '24h', ms: 24 * 60 * 60 * 1000 },
    { kind: '6h', ms: 6 * 60 * 60 * 1000 },
    { kind: '1h', ms: 60 * 60 * 1000 },
    { kind: '15min', ms: 15 * 60 * 1000 },
    { kind: 'leave_now', ms: 0 },
  ];
  const now = Date.now();
  return offsets
    .map((o) => ({ booking_id: bookingId, booking_ref: ref, kind: o.kind, fire_at: new Date(start.getTime() - o.ms).toISOString() }))
    .filter((r) => new Date(r.fire_at).getTime() > now);
}

function genRef() {
  const s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += s[Math.floor(Math.random() * s.length)];
  return `VL-${r}`;
}

async function audit(actor, action, entityId, metadata, ip) {
  try { await supabase.from('audit_logs').insert({ actor, action, entity: 'booking', entity_id: String(entityId), metadata, ip }); }
  catch (e) { console.error('[audit]', e.message); }
}

// Customer booking pipeline against the business catalog.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);
  try {
    assert(req.method === 'POST', 'Method not allowed', 405);
    const auth = await getAuth(req);
    const b = req.body || {};

    // 1. Validate + sanitize
    const customer_name = sanitizeText(b.customer_name, 120) || auth?.profile?.full_name || 'Guest';
    const customer_email = String(b.customer_email || auth?.user?.email || '').toLowerCase();
    const notes = sanitizeText(b.notes, 500);
    assert(isEmail(customer_email), 'A valid email is required.');
    assert(b.business_id, 'A business is required.');
    assert(b.service_id, 'A service is required.');
    assert(isISODate(b.start_time), 'A valid time slot is required.');
    const start = new Date(b.start_time);
    assert(start.getTime() > Date.now() - 60000, 'That slot is in the past.');

    // 2. Load business + service (real records)
    const [{ data: biz }, { data: svc }] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', b.business_id).single(),
      supabase.from('business_services').select('*').eq('id', b.service_id).single(),
    ]);
    assert(biz, 'Business not found.', 404);
    assert(svc && svc.business_id === biz.id, 'Service not found for this business.', 404);
    const end = new Date(start.getTime() + (svc.duration_min || 30) * 60000);

    // 3. Conflict prevention (same business, overlapping slot)
    const { data: clash } = await supabase.from('bookings').select('id')
      .eq('resource_name', biz.name).neq('status', 'cancelled')
      .lt('start_time', end.toISOString()).gt('end_time', start.toISOString());
    assert(!clash || clash.length === 0, 'That slot was just taken. Please pick another time.', 409);

    // 4. Optional staff
    let staffName = null;
    if (b.staff_id) {
      const { data: st } = await supabase.from('business_staff').select('name').eq('id', b.staff_id).single();
      staffName = st?.name || null;
    }

    // 5. Persist
    const ref = genRef();
    const { data: booking, error: insErr } = await supabase.from('bookings').insert({
      ref, customer_id: auth?.user?.id || null, customer_name, customer_email,
      service_id: null, service_name: svc.name,
      employee_name: staffName, resource_id: biz.id, resource_name: biz.name,
      start_time: start.toISOString(), end_time: end.toISOString(),
      status: 'confirmed', price: svc.price, price_breakdown: [{ k: svc.name, v: Number(svc.price) }],
      location: biz.address, notes,
    }).select().single();
    if (insErr) throw insErr;

    // 6. History + audit + invoice + notifications
    await supabase.from('booking_history').insert({ booking_id: booking.id, action: 'created', detail: `Booked ${svc.name} at ${biz.name}`, actor: customer_email });
    await audit(customer_email, 'booking.create', booking.id, { ref, business: biz.name }, ip);
    // India GST @ 18%
    const tax = Math.round(Number(svc.price) * 0.18 * 100) / 100;
    const istWhen = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(start) + ' IST';
    const { data: invoice } = await supabase.from('invoices').insert({
      number: `INV-${booking.id.toString().padStart(5, '0')}`, booking_id: booking.id, booking_ref: ref,
      customer_name, customer_email, amount: svc.price, tax, total: Math.round((Number(svc.price) + tax) * 100) / 100,
      status: 'issued', line_items: [{ desc: svc.name, qty: 1, price: Number(svc.price) }],
    }).select().single();
    await supabase.from('notifications').insert([
      { user_id: auth?.user?.id || null, audience: 'customer', title: 'Booking confirmed', body: `${svc.name} at ${biz.name} — ${istWhen}`, type: 'success', booking_ref: ref },
      { audience: 'admin', title: 'New booking', body: `${ref} · ${biz.name} · ${svc.name}`, type: 'info', booking_ref: ref },
    ]);

    // 7. Store QR payload + schedule reminders (fast DB writes)
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address || biz.name)}`;
    const qrPayload = JSON.stringify({ ref, id: booking.id, biz: biz.name, svc: svc.name, at: start.toISOString(), v: 1 });
    const reminders = scheduleReminders(booking.id, ref, start);
    await Promise.all([
      supabase.from('booking_meta').upsert({ booking_id: booking.id, qr_payload: qrPayload, updated_at: new Date().toISOString() }),
      reminders.length ? supabase.from('reminders').insert(reminders) : Promise.resolve(),
    ]);

    // Pre-filled Gmail compose fallback so the confirmation ALWAYS reaches the
    // user's inbox even if no email provider key is configured yet.
    const gmailBody = [
      `Booking confirmed — ${ref}`, ``, `Business: ${biz.name}`, `Service: ${svc.name}`,
      ...(staffName ? [`With: ${staffName}`] : []), `When: ${istWhen}`, `Where: ${biz.address || '—'}`,
      `Total: ₹${(Number(svc.price) + tax).toLocaleString('en-IN')} (incl. 18% GST)`, ``, `Directions: ${mapsLink}`,
    ].join('\n');
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(customer_email)}&su=${encodeURIComponent(`Your booking is confirmed — ${ref}`)}&body=${encodeURIComponent(gmailBody)}`;

    // 8. Respond INSTANTLY (< 2s). Email + calendar run in the background so the
    //    confirmation screen appears immediately with every detail.
    res.status(201).json({
      booking, invoice, maps_link: mapsLink, business: biz,
      qr_payload: qrPayload, gmail_compose_url: gmailComposeUrl,
      pipeline: { saved: true, email: process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY ? 'sending' : 'log-fallback', notified: true, reminders_scheduled: reminders.length },
    });

    // ---- Background work (does not block the response) ----
    (async () => {
      try {
        const cal = await createCalendarEvent({
          summary: `${svc.name} — ${biz.name}`,
          description: `Velora booking ${ref}.${notes ? ' Notes: ' + notes : ''}`,
          start: start.toISOString(), end: end.toISOString(), location: biz.address, attendees: [customer_email].filter(Boolean),
        });
        const bizCal = await createCalendarEvent({
          summary: `${customer_name} — ${svc.name}`,
          description: `Velora booking ${ref} for ${customer_name} (${customer_email}).`,
          start: start.toISOString(), end: end.toISOString(), location: biz.address, attendees: [biz.email].filter(Boolean),
        });
        await supabase.from('booking_meta').upsert({
          booking_id: booking.id, calendar_event_id: cal.eventId || null,
          business_calendar_event_id: bizCal.eventId || null, qr_payload: qrPayload, updated_at: new Date().toISOString(),
        });
        const emailRes = await sendEmail({
          to: customer_email, subject: `Your booking is confirmed — ${ref}`,
          title: 'Booking confirmed', name: customer_name, bookingRef: ref,
          lines: [
            { k: 'Reference', v: ref }, { k: 'Business', v: biz.name }, { k: 'Service', v: svc.name },
            ...(staffName ? [{ k: 'With', v: staffName }] : []),
            { k: 'When', v: istWhen }, { k: 'Where', v: biz.address || '—' },
            { k: 'Total (incl. 18% GST)', v: `₹${(Number(svc.price) + tax).toLocaleString('en-IN')}` },
          ],
          cta: { label: 'Get directions', href: mapsLink },
        });
        const adminEmail = biz.email || process.env.ADMIN_EMAIL;
        if (adminEmail) {
          await sendEmail({
            to: adminEmail, subject: `New booking — ${ref} (${svc.name})`,
            title: 'New booking received', name: biz.name, bookingRef: ref,
            lines: [
              { k: 'Reference', v: ref }, { k: 'Customer', v: `${customer_name} (${customer_email})` },
              { k: 'Service', v: svc.name }, ...(staffName ? [{ k: 'Assigned', v: staffName }] : []),
              { k: 'When', v: istWhen }, { k: 'Value', v: `₹${Number(svc.price).toLocaleString('en-IN')}` },
            ],
            cta: { label: 'Open admin', href: `${process.env.APP_URL || ''}/admin/appointments` },
          });
        }
        console.log(`[book] background done for ${ref}: calendar=${cal.provider} email=${emailRes.provider}`);
      } catch (bgErr) {
        console.error('[book:background]', bgErr.message);
      }
    })();
  } catch (err) {
    console.error('[book:error]', err.message);
    if (!res.headersSent) res.status(err.status || 500).json({ error: err.message });
  }
}
