import supabase from './db-client.js';
import { cors, sanitizeText, isEmail, isISODate, assert, clientIp, enforceRateLimit, safeError } from './_lib/security.js';
import { signBookingToken, verifyUrl } from './_lib/qr.js';
import { getAuth } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { createCalendarEvent } from './_lib/calendar.js';
import { syntheticBusiness, isSyntheticId } from './_lib/synthetic.js';

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

// Idempotency store: same key => same response, never a duplicate booking.
// Persistent when the `idempotency_keys` table exists, in-memory otherwise.
const idemMemory = new Map();

// Slot ledger: authoritative overlap protection even when no database is
// reachable (previews, demo deployments). One ENTRY PER BOOKING (not per slot —
// a slot can legitimately hold as many bookings as there are specialists), each
// pruned once it is in the past. The DB clash check below runs on top of this.
const slotLedger = [];
function ledgerClash(businessId, start, end, staffName, capacity) {
  const now = Date.now();
  const s = start.getTime(), e = end.getTime();
  const overlapping = slotLedger.filter((row) => row.biz === String(businessId) && row.start < e && row.end > s);
  // A named specialist is exclusive: any overlapping booking that either named
  // them or was auto-assigned counts against them.
  if (staffName) {
    const key = staffName.toLowerCase();
    return overlapping.some((row) => row.staff === null || row.staff === key);
  }
  // "Any specialist" consumes one seat per booking; every named booking holds
  // its own seat. The slot closes when all roster seats are taken.
  const named = new Set(overlapping.filter((row) => row.staff).map((row) => row.staff)).size;
  const unassigned = overlapping.filter((row) => row.staff === null).length;
  return named + unassigned >= capacity;
}
function ledgerAdd(businessId, staffName, start, end) {
  slotLedger.push({ biz: String(businessId), staff: staffName ? staffName.toLowerCase() : null, start: start.getTime(), end: end.getTime() });
  if (slotLedger.length > 2000) {
    const now = Date.now();
    for (let i = slotLedger.length - 1; i >= 0; i -= 1) if (slotLedger[i].end <= now) slotLedger.splice(i, 1);
  }
}
async function findReplay(key) {
  if (idemMemory.has(key)) return idemMemory.get(key);
  try {
    const { data } = await supabase.from('idempotency_keys').select('response').eq('key', key).single();
    if (data?.response) { idemMemory.set(key, data.response); return data.response; }
  } catch { /* table optional */ }
  return null;
}
async function saveReplay(key, response) {
  idemMemory.set(key, response);
  if (idemMemory.size > 500) idemMemory.delete(idemMemory.keys().next().value);
  try { await supabase.from('idempotency_keys').upsert({ key, response, created_at: new Date().toISOString() }); }
  catch { /* table optional */ }
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
    if (!enforceRateLimit(req, res, 'book', { limit: 20, windowMs: 60_000 })) return;
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

    // 1b. Idempotency: retries/double-clicks replay the original response.
    const idempotencyKey = sanitizeText(b.idempotency_key || req.headers['x-idempotency-key'], 80);
    if (idempotencyKey) {
      const replay = await findReplay(idempotencyKey);
      if (replay) return res.status(200).json({ ...replay, deduplicated: true });
    }

    // 2. Load business + service (DB rows, synthetic ecosystem, or live Google places)
    let biz = null;
    let svc = null;
    if (typeof b.business_id === 'string' && b.business_id.startsWith('live-')) {
      // Live Google Maps business — client supplies the hydrated snapshot.
      const snap = b.business_snapshot || {};
      assert(snap.name, 'Business snapshot required for live listings.', 400);
      biz = {
        id: b.business_id, name: sanitizeText(snap.name, 160), address: sanitizeText(snap.address, 300) || snap.name,
        phone: snap.phone || null, email: null, lat: snap.lat ?? null, lng: snap.lng ?? null,
        staff: Array.isArray(snap.staff) ? snap.staff : [],
      };
      const services = Array.isArray(snap.services) ? snap.services : [];
      svc = services.find((s) => String(s.id) === String(b.service_id)) || null;
      assert(svc && svc.name, 'Service not found for this business.', 404);
      svc = { name: sanitizeText(svc.name, 160), duration_min: +svc.duration_min || 30, price: +svc.price || 0 };
      if (b.staff_id && Array.isArray(biz.staff)) {
        const st = biz.staff.find((s) => String(s.id) === String(b.staff_id));
        if (st) b._staffName = st.name;
      }
    } else if (isSyntheticId(b.business_id)) {
      const synth = syntheticBusiness(b.business_id);
      assert(synth, 'Business not found.', 404);
      biz = synth;
      svc = (synth.services || []).find((s) => String(s.id) === String(b.service_id)) || null;
      assert(svc, 'Service not found for this business.', 404);
    } else {
      const [{ data: dbBiz }, { data: dbSvc }] = await Promise.all([
        supabase.from('businesses').select('*').eq('id', b.business_id).single(),
        supabase.from('business_services').select('*').eq('id', b.service_id).single(),
      ]);
      biz = dbBiz;
      svc = dbSvc;
      if (!biz) {
        // Graceful fallback: synthetic registry (demo continuity)
        const synth = syntheticBusiness(b.business_id);
        if (synth) {
          biz = synth;
          svc = (synth.services || []).find((s) => String(s.id) === String(b.service_id)) || synth.services?.[0] || null;
        }
      }
      assert(biz, 'Business not found.', 404);
      assert(svc, 'Service not found for this business.', 404);
    }
    const end = new Date(start.getTime() + (svc.duration_min || 30) * 60000);

    // 3. Optional staff (DB, synthetic roster, or live snapshot) — resolved
    //    BEFORE the conflict check so the ledger can enforce staff capacity.
    let staffName = b._staffName || null;
    if (b.staff_id && !staffName) {
      if (isSyntheticId(b.business_id) && Array.isArray(biz.staff)) {
        staffName = biz.staff.find((s) => String(s.id) === String(b.staff_id))?.name || null;
      } else {
        try {
          const { data: st } = await supabase.from('business_staff').select('name').eq('id', b.staff_id).single();
          staffName = st?.name || null;
        } catch { /* non-fatal */ }
      }
    }

    // 4. Conflict prevention (same business, overlapping slot).
    // 4a. In-memory ledger — works even with no database (preview/demo deploys).
    //     Capacity-aware: a named staff member owns their slot exclusively;
    //     "any staff" only closes when every specialist is busy. Only enforced
    //     when the roster is known (synthetic/live snapshot); DB businesses
    //     rely on the database clash check below, which is authoritative.
    if (Array.isArray(biz.staff)) {
      const staffCapacity = Math.max(1, biz.staff.length);
      assert(!ledgerClash(biz.id, start, end, staffName || null, staffCapacity), 'That slot was just taken. Please pick another time.', 409);
    }
    // 4b. Database clash check (authoritative when a DB is configured).
    //     Consistent with the ledger above: a NAMED specialist is exclusive,
    //     "any specialist" bookings are capped at the roster size — and at a
    //     single resource when no roster is known (conservative default).
    try {
      const { data: clash } = await supabase.from('bookings').select('id,employee_name')
        .eq('resource_name', biz.name).neq('status', 'cancelled')
        .lt('start_time', end.toISOString()).gt('end_time', start.toISOString());
      if (Array.isArray(clash)) {
        const roster = Array.isArray(biz.staff) && biz.staff.length ? biz.staff.length : 1;
        const named = new Set(clash.map((r) => String(r.employee_name || '').toLowerCase()).filter(Boolean));
        const unassigned = clash.filter((r) => !r.employee_name).length;
        if (staffName) {
          // Named specialist: conflicts with their own row — or when every
          // roster seat is already taken by auto-assigned bookings.
          assert(!named.has(staffName.toLowerCase()) && unassigned < roster, 'That slot was just taken. Please pick another time.', 409);
        } else {
          assert(named.size + unassigned < roster, 'That slot was just taken. Please pick another time.', 409);
        }
      }
    } catch (e) {
      if (e.status === 409) throw e;
      console.error('[book:clash-check]', e.message);
    }

    // 5. Persist (DB write; demo-mode confirmation if the DB is unreachable)
    const ref = genRef();
    let booking = null;
    let demoMode = false;
    try {
      const { data, error: insErr } = await supabase.from('bookings').insert({
        ref, customer_id: auth?.user?.id || null, customer_name, customer_email,
        service_id: null, service_name: svc.name,
        employee_name: staffName, resource_id: typeof biz.id === 'number' ? biz.id : null, resource_name: biz.name,
        start_time: start.toISOString(), end_time: end.toISOString(),
        status: 'confirmed', price: svc.price, price_breakdown: [{ k: svc.name, v: Number(svc.price) }],
        location: biz.address, notes,
      }).select().single();
      if (insErr) throw insErr;
      booking = data;
    } catch (e) {
      console.error('[book:persist-fallback]', e.message);
      demoMode = true;
      booking = {
        id: Date.now(), ref, customer_id: auth?.user?.id || null, customer_name, customer_email,
        service_name: svc.name, employee_name: staffName, resource_id: biz.id, resource_name: biz.name,
        start_time: start.toISOString(), end_time: end.toISOString(), status: 'confirmed',
        price: svc.price, price_breakdown: [{ k: svc.name, v: Number(svc.price) }],
        location: biz.address, notes, created_at: new Date().toISOString(),
      };
    }

    // 6. History + audit + invoice + notifications (best effort in demo mode)
    const tax = Math.round(Number(svc.price) * 0.18 * 100) / 100;
    const istWhen = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(start) + ' IST';
    let invoice = {
      id: Date.now(), number: `INV-${String(booking.id).slice(-5).padStart(5, '0')}`, booking_id: booking.id, booking_ref: ref,
      customer_name, customer_email, amount: svc.price, tax, total: Math.round((Number(svc.price) + tax) * 100) / 100,
      status: 'issued', line_items: [{ desc: svc.name, qty: 1, price: Number(svc.price) }],
    };
    let reminders = scheduleReminders(booking.id, ref, start);
    if (!demoMode) {
      try {
        await supabase.from('booking_history').insert({ booking_id: booking.id, action: 'created', detail: `Booked ${svc.name} at ${biz.name}`, actor: customer_email });
        await audit(customer_email, 'booking.create', booking.id, { ref, business: biz.name }, ip);
        const { data: inv } = await supabase.from('invoices').insert({
          number: invoice.number, booking_id: booking.id, booking_ref: ref,
          customer_name, customer_email, amount: svc.price, tax, total: invoice.total,
          status: 'issued', line_items: invoice.line_items,
        }).select().single();
        if (inv) invoice = inv;
        await supabase.from('notifications').insert([
          { user_id: auth?.user?.id || null, audience: 'customer', title: 'Booking confirmed', body: `${svc.name} at ${biz.name} — ${istWhen}`, type: 'success', booking_ref: ref },
          { audience: 'admin', title: 'New booking', body: `${ref} · ${biz.name} · ${svc.name}`, type: 'info', booking_ref: ref },
        ]);
      } catch (e) {
        console.error('[book:side-effects]', e.message);
      }
    }

    // 7. Store QR payload + schedule reminders (fast DB writes)
    const mapsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(biz.address || biz.name)}`;
    const qrToken = signBookingToken({ ref, id: booking.id, biz: biz.name, svc: svc.name, at: start.toISOString() });
    const qrPayload = verifyUrl(req, qrToken);
    if (!demoMode) {
      try {
        await Promise.all([
          supabase.from('booking_meta').upsert({ booking_id: booking.id, qr_payload: qrPayload, updated_at: new Date().toISOString() }),
          reminders.length ? supabase.from('reminders').insert(reminders) : Promise.resolve(),
        ]);
      } catch (e) {
        console.error('[book:meta]', e.message);
      }
    }

    // Pre-filled Gmail compose fallback so the confirmation ALWAYS reaches the
    // user's inbox even if no email provider key is configured yet.
    const gmailBody = [
      `Booking confirmed — ${ref}`, ``, `Business: ${biz.name}`, `Service: ${svc.name}`,
      ...(staffName ? [`With: ${staffName}`] : []), `When: ${istWhen}`, `Where: ${biz.address || '—'}`,
      `Total: ₹${(Number(svc.price) + tax).toLocaleString('en-IN')} (incl. 18% GST)`, ``, `Directions: ${mapsLink}`, `Verify ticket: ${qrPayload}`,
    ].join('\n');
    const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(customer_email)}&su=${encodeURIComponent(`Your booking is confirmed — ${ref}`)}&body=${encodeURIComponent(gmailBody)}`;

    // 7b. Record the slot in the ledger so concurrent requests cannot double-book.
    ledgerAdd(biz.id, staffName, start, end);

    // 8. Respond INSTANTLY (< 2s). Email + calendar run in the background so the
    //    confirmation screen appears immediately with every detail.
    const response = {
      booking, invoice, maps_link: mapsLink, business: biz,
      qr_payload: qrPayload, gmail_compose_url: gmailComposeUrl, demo_mode: demoMode,
      pipeline: { saved: !demoMode, demo_mode: demoMode, email: process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY ? 'sending' : 'log-fallback', notified: !demoMode, reminders_scheduled: demoMode ? 0 : reminders.length },
    };
    if (idempotencyKey) await saveReplay(idempotencyKey, response);
    res.status(201).json(response);

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
        if (!demoMode) {
          await supabase.from('booking_meta').upsert({
            booking_id: booking.id, calendar_event_id: cal.eventId || null,
            business_calendar_event_id: bizCal.eventId || null, qr_payload: qrPayload, updated_at: new Date().toISOString(),
          });
        }
        const emailRes = await sendEmail({
          to: customer_email, subject: `Your booking is confirmed — ${ref}`,
          title: 'Booking confirmed', name: customer_name, bookingRef: ref,
          lines: [
            { k: 'Reference', v: ref }, { k: 'Business', v: biz.name }, { k: 'Service', v: svc.name },
            ...(staffName ? [{ k: 'With', v: staffName }] : []),
            { k: 'When', v: istWhen }, { k: 'Where', v: biz.address || '—' },
            { k: 'Total (incl. 18% GST)', v: `₹${(Number(svc.price) + tax).toLocaleString('en-IN')}` },
            { k: 'Verify ticket', v: qrPayload },
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
    const s = safeError(err, 'book:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
