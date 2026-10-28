// Velora integration verification (dev-only, not shipped to production).
//
// Exercises the server-side integration layer against the REAL modules — the
// same files Netlify/Vercel execute — with the network stubbed so results are
// deterministic and offline:
//
//   1. Google Calendar OAuth — refresh-token chain, token caching, 401 retry,
//      static-token mode, and honest "not configured" reporting
//   2. Email delivery — provider precedence and never claiming a send that
//      did not happen
//   3. QR tokens — HMAC sign/verify, tamper rejection, deployment-agnostic
//      base URL (no stale domain baked into a ticket)
//   4. India / Asia-Kolkata helpers — PIN, phone, address, IST wall-clock
//   5. Booking pipeline guards — idempotent replay, double-booking refusal
//   4b. IST slot grid + forecast dates — 10:00 stays 10:00 IST on a UTC host
//   6. Security — CORS allowlist, ownership checks, error hygiene
//   7. Repository invariants — SQL bundle in sync, no hardcoded deploy domain
//
// Run: npx tsx scripts/verify-integrations.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};
const section = (t) => console.log(`\n—— ${t} ——`);

/** Minimal fetch recorder: routes by URL, replays queued responses. */
function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  return {
    calls,
    restore() { globalThis.fetch = original; },
  };
}
const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

function fakeRes() {
  const res = { statusCode: 200, body: null, headersSent: false, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; res.headersSent = true; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.end = () => { res.headersSent = true; return res; };
  return res;
}
const fakeReq = (body, headers = {}) => ({
  method: 'POST', body, headers, query: {}, socket: { remoteAddress: '203.0.113.9' },
});

const withEnv = async (vars, fn) => {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; if (v === null) delete process.env[k]; else process.env[k] = v; }
  try { return await fn(); }
  finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};

/* ========================================================================== */
/* 1. Google Calendar — OAuth refresh-token chain                              */
/* ========================================================================== */
const calendar = await import('../api/_lib/calendar.js');

section('1. Google Calendar — OAuth refresh-token chain');

await withEnv({
  GOOGLE_CALENDAR_REFRESH_TOKEN: 'refresh-abc',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_CALENDAR_ACCESS_TOKEN: null,
  GOOGLE_CALENDAR_ID: 'primary',
}, async () => {
  calendar.__resetCalendarAuthCache();
  ok('auth mode is refresh-token', calendar.calendarAuthMode() === 'refresh-token', `got ${calendar.calendarAuthMode()}`);

  // First call: token exchange, then the Calendar API with the fresh bearer.
  let f = stubFetch((url) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return jsonResponse({ access_token: 'at-1', expires_in: 3600 });
    }
    return jsonResponse({ id: 'google-event-1', htmlLink: 'https://calendar.google.com/x' });
  });
  let res = await calendar.createCalendarEvent({
    summary: 'Haircut — Velora Salon', start: '2026-03-02T04:30:00.000Z',
    end: '2026-03-02T05:15:00.000Z', location: 'C-Scheme, Jaipur', attendees: ['a@b.in'],
  });
  ok('creates a real Google event', res.ok === true && res.provider === 'google', JSON.stringify(res));
  ok('real Google event id returned (not a placeholder)', res.eventId === 'google-event-1', String(res.eventId));
  ok('exchanged the refresh token first', f.calls[0].url.startsWith('https://oauth2.googleapis.com/token'));
  ok('sent refresh_token + client credentials', String(f.calls[0].init.body).includes('refresh_token=refresh-abc')
    && String(f.calls[0].init.body).includes('client_id=client-id'));
  ok('called Calendar with the fresh bearer token',
    f.calls[1].url.includes('/calendars/primary/events') && f.calls[1].init.headers.Authorization === 'Bearer at-1',
    String(f.calls[1]?.init?.headers?.Authorization));
  const sentBody = JSON.parse(f.calls[1].init.body);
  ok('declares the IST time zone on start/end (Google Event shape)',
    sentBody.start.timeZone === 'Asia/Kolkata' && sentBody.end.timeZone === 'Asia/Kolkata'
    && sentBody.timeZone === undefined, JSON.stringify(sentBody.start));
  ok('attaches the customer as an attendee',
    Array.isArray(sentBody.attendees) && sentBody.attendees[0]?.email === 'a@b.in', JSON.stringify(sentBody.attendees));
  ok('sets the booking reminders Google sends', sentBody.reminders?.overrides?.length === 3);

  // Second call: cached token — no second token exchange.
  f.restore();
  f = stubFetch(() => jsonResponse({ id: 'google-event-2' }));
  res = await calendar.createCalendarEvent({ summary: 'Cached', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('reuses the cached access token (no second exchange)',
    f.calls.length === 1 && f.calls[0].url.includes('/calendars/'), `calls=${f.calls.length}`);
  f.restore();

  // 401 mid-flight: invalidate, refresh once, retry once.
  calendar.__resetCalendarAuthCache();
  let tokenCalls = 0;
  f = stubFetch((url, _init, n) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) { tokenCalls++; return jsonResponse({ access_token: `at-${tokenCalls}`, expires_in: 3600 }); }
    return n === 2 ? jsonResponse({ error: 'token revoked' }, 401) : jsonResponse({ id: 'google-event-3' });
  });
  res = await calendar.createCalendarEvent({ summary: 'Retry', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('a 401 refreshes the token and retries exactly once', res.ok === true && res.eventId === 'google-event-3', JSON.stringify(res));
  ok('refreshed the token exactly twice (initial + after 401)', tokenCalls === 2, `tokenCalls=${tokenCalls}`);
  f.restore();

  // Broken credentials must NEVER look like success.
  calendar.__resetCalendarAuthCache();
  f = stubFetch(() => jsonResponse({ error: 'invalid_grant' }, 400));
  res = await calendar.createCalendarEvent({ summary: 'Broken', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('a failed token exchange reports failure (never fakes success)', res.ok === false && /invalid_grant/.test(String(res.error)), JSON.stringify(res));
  f.restore();

  // Calendar API 5xx is a real failure too.
  calendar.__resetCalendarAuthCache();
  f = stubFetch((url) => url.startsWith('https://oauth2.googleapis.com/token')
    ? jsonResponse({ access_token: 'at-ok', expires_in: 3600 })
    : jsonResponse({ error: 'quota exceeded' }, 429));
  res = await calendar.createCalendarEvent({ summary: 'Quota', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('a rejected Calendar call reports failure', res.ok === false && /429/.test(String(res.error)), JSON.stringify(res));
  f.restore();
  calendar.__resetCalendarAuthCache();
});

await withEnv({
  GOOGLE_CALENDAR_REFRESH_TOKEN: null, GOOGLE_CLIENT_ID: null, GOOGLE_CLIENT_SECRET: null,
  GOOGLE_CALENDAR_ACCESS_TOKEN: 'static-at',
}, async () => {
  calendar.__resetCalendarAuthCache();
  ok('auth mode is static-token', calendar.calendarAuthMode() === 'static-token', calendar.calendarAuthMode());
  const f = stubFetch(() => jsonResponse({ id: 'static-event' }));
  const res = await calendar.createCalendarEvent({ summary: 'Static', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('static token is used without an exchange', res.ok === true && f.calls.length === 1
    && f.calls[0].init.headers.Authorization === 'Bearer static-at', JSON.stringify(res));
  f.restore();
  calendar.__resetCalendarAuthCache();
});

await withEnv({
  GOOGLE_CALENDAR_REFRESH_TOKEN: null, GOOGLE_CLIENT_ID: null, GOOGLE_CLIENT_SECRET: null,
  GOOGLE_CALENDAR_ACCESS_TOKEN: null,
}, async () => {
  calendar.__resetCalendarAuthCache();
  ok('auth mode is none when unconfigured', calendar.calendarAuthMode() === 'none', calendar.calendarAuthMode());
  const f = stubFetch(() => jsonResponse({ id: 'should-not-be-called' }));
  const res = await calendar.createCalendarEvent({ summary: 'Unconfigured', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
  ok('no network call is attempted', f.calls.length === 0, `calls=${f.calls.length}`);
  ok('missing configuration is explicitly reported',
    res.provider === 'none' && res.configured === false && !res.ok, JSON.stringify(res));
  ok('no event id is invented without Google', res.eventId === null, String(res.eventId));
  const del = await calendar.deleteCalendarEvent('evt_abc');
  ok('placeholder events are not deleted on Google', del.provider === 'none' && !del.ok && f.calls.length === 0, JSON.stringify(del));
  f.restore();
  calendar.__resetCalendarAuthCache();
});

/* ========================================================================== */
/* 2. Email delivery — provider precedence, honest status                      */
/* ========================================================================== */
const { sendEmail } = await import('../api/_lib/email.js');
const mailArgs = {
  to: 'guest@example.in', subject: 'Your booking is confirmed — VL-TEST1',
  title: 'Booking confirmed', name: 'Guest', bookingRef: 'VL-TEST1',
  lines: [{ k: 'Reference', v: 'VL-TEST1' }],
};

section('2. Email delivery — provider precedence + honesty');

await withEnv({ RESEND_API_KEY: null, SENDGRID_API_KEY: null, SMTP_RELAY_URL: null }, async () => {
  const r = await sendEmail(mailArgs);
  ok('no provider configured → unsent; queue is reported only if logged', r.provider === 'queued' && (r.status === 'queued' ? r.logged : r.status === 'not_recorded' && !r.logged) && !r.ok, JSON.stringify(r));
  ok('queued is not reported as a delivered email', r.provider !== 'resend' && r.provider !== 'sendgrid');
});
await withEnv({ RESEND_API_KEY: 're_test', SENDGRID_API_KEY: null, SMTP_RELAY_URL: null }, async () => {
  const f = stubFetch(() => jsonResponse({ id: 'mail-1' }));
  const r = await sendEmail(mailArgs);
  ok('Resend is preferred when configured', r.provider === 'resend' && r.status === 'sent', JSON.stringify(r));
  ok('Resend received the rendered HTML', String(f.calls[0].init.body).includes('Booking confirmed'));
  f.restore();
});
await withEnv({ RESEND_API_KEY: null, SENDGRID_API_KEY: 'sg_test', SMTP_RELAY_URL: null }, async () => {
  const f = stubFetch(() => jsonResponse({}, 202));
  const r = await sendEmail(mailArgs);
  ok('SendGrid is used when Resend is absent', r.provider === 'sendgrid' && r.status === 'sent', JSON.stringify(r));
  f.restore();
});
await withEnv({ RESEND_API_KEY: 're_test', SENDGRID_API_KEY: null, SMTP_RELAY_URL: null }, async () => {
  const f = stubFetch(() => jsonResponse({ message: 'bad key' }, 401));
  const r = await sendEmail(mailArgs);
  ok('a provider rejection is reported as failed', r.ok === false && r.status === 'failed' && !!r.error, JSON.stringify(r));
  f.restore();
});

/* ========================================================================== */
/* 3. QR tokens — signing, tamper rejection, deployment-agnostic base URL      */
/* ========================================================================== */
const qr = await import('../api/_lib/qr.js');

section('3. QR verification tokens');

// A QR ticket is only valid for 30 days after the appointment starts, so the
// fixture slot must be in the future (a past slot legitimately reads 'expired').
const ticketAt = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
const token = qr.signBookingToken({ ref: 'VL-ABC123', id: 4242, biz: 'Velora Salon', svc: 'Haircut', at: ticketAt });
ok('signed token has the v1 3-part shape', /^v1\.[^.]+\.[^.]+$/.test(token), token);
ok('a valid token verifies', qr.verifyBookingToken(token).ok === true,
  JSON.stringify(qr.verifyBookingToken(token).reason));
const staleToken = qr.signBookingToken({ ref: 'VL-STALE', id: 1, biz: 'B', svc: 'S', at: new Date(Date.now() - 40 * 86400_000).toISOString() });
ok('a ticket older than its 30-day window reads as expired',
  qr.verifyBookingToken(staleToken).ok === false && qr.verifyBookingToken(staleToken).reason === 'expired',
  JSON.stringify(qr.verifyBookingToken(staleToken)));
ok('verification exposes no PII', !/email|phone/i.test(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')));
const parts = token.split('.');
const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString()), ref: 'VL-HACKED' })).toString('base64url')}.${parts[2]}`;
ok('a tampered payload is rejected', qr.verifyBookingToken(tampered).ok === false
  && qr.verifyBookingToken(tampered).reason === 'invalid_signature', JSON.stringify(qr.verifyBookingToken(tampered)));
ok('a malformed token is rejected', qr.verifyBookingToken('not-a-token').ok === false);
ok('a legacy JSON token is rejected', qr.verifyBookingToken('{"ref":"VL-1"}').ok === false);

const reqFor = (headers = {}) => ({ headers });
await withEnv({ APP_URL: null, URL: null, DEPLOY_PRIME_URL: null, VERCEL_URL: null }, async () => {
  ok('APP_URL wins when set', await withEnv({ APP_URL: 'https://book.example.com/' }, async () =>
    qr.baseUrl(reqFor({ host: 'other.example.com' }))) === 'https://book.example.com');
  ok('falls back to the serving host', qr.baseUrl(reqFor({ host: 'new-site.netlify.app' })) === 'https://new-site.netlify.app',
    qr.baseUrl(reqFor({ host: 'new-site.netlify.app' })));
  ok('honours x-forwarded-host/proto',
    qr.baseUrl(reqFor({ 'x-forwarded-host': 'custom.domain, proxy', 'x-forwarded-proto': 'https' })) === 'https://custom.domain',
    qr.baseUrl(reqFor({ 'x-forwarded-host': 'custom.domain, proxy', 'x-forwarded-proto': 'https' })));
  ok('uses the platform site URL when there is no host header',
    await withEnv({ URL: 'https://from-netlify-env.netlify.app' }, async () => qr.baseUrl(reqFor({})))
    === 'https://from-netlify-env.netlify.app');
  const orphan = qr.baseUrl(reqFor({}));
  ok('never invents a stale deployment domain', orphan === '' && !/netlify\.app/.test(orphan), JSON.stringify(orphan));
  ok('verify link points at /verify/<token>',
    qr.verifyUrl(reqFor({ host: 'new-site.netlify.app' }), 'tok') === 'https://new-site.netlify.app/verify/tok');
});

/* ========================================================================== */
/* 3b. Door check-in — the ticket is proof, not decoration                    */
/* ========================================================================== */
section('3b. Door check-in requires a verifiable ticket');

const bookingsApi = readFileSync(join(ROOT, 'api/bookings.js'), 'utf8');
// Slice from the check_in branch to the *next* branch, so the assertion window
// is exactly this action's code (the first 'status' hit is a guard earlier in
// the file, which would give an empty window).
const checkInStart = bookingsApi.indexOf("if (action === 'check_in')");
const checkInEnd = bookingsApi.indexOf("if (action === 'status')", checkInStart);
const checkInBlock = checkInStart < 0 ? '' : bookingsApi.slice(checkInStart, checkInEnd);
ok('the API implements an explicit check_in action', checkInBlock.length > 200);
ok('check_in verifies the scanned ticket signature server-side',
  /verifyBookingToken\(ticket\)/.test(checkInBlock), 'no verifyBookingToken call');
ok('check_in refuses a missing ticket instead of trusting a status flip',
  /assert\(ticket,/.test(checkInBlock));
ok('check_in is staff-only', /assert\(staffAccess/.test(checkInBlock));
ok('the ticket must belong to the row being checked in',
  /verified\.data\.ref/.test(checkInBlock) && /status\(409\)/.test(checkInBlock));
ok('re-scanning is idempotent (no second state change)',
  /already_checked_in/.test(checkInBlock));
ok('the state machine still gates check_in',
  /canTransition\(existing\.status, 'checked_in'\)/.test(checkInBlock));
ok('check-in is audited', /audit\(actor, 'booking\.check_in'/.test(checkInBlock));
ok('a failed verification never mutates the booking',
  checkInBlock.indexOf('if (!verified.ok)') < checkInBlock.indexOf(".update({ status: 'checked_in'"));
ok('the browser cannot mark a booking checked in without a ticket',
  !/action: 'status', status: 'checked_in'/.test(readFileSync(join(ROOT, 'src/services/checkIn.ts'), 'utf8'))
  && /ticket: token/.test(readFileSync(join(ROOT, 'src/services/checkIn.ts'), 'utf8')));

/* ========================================================================== */
/* 4. India / Asia-Kolkata helpers                                            */
/* ========================================================================== */
section('4. India-first validation + Asia/Kolkata time');
const india = await import('../src/lib/india.ts');

ok('accepts a valid 6-digit PIN', india.isValidIndianPin('302001') === true);
ok('rejects a PIN starting with 0', india.isValidIndianPin('012345') === false);
ok('rejects a 5-digit PIN', india.isValidIndianPin('30200') === false);
ok('normalises +91 and 0 prefixes', india.normalizeIndianPhone('+91 98290 12345') === '9829012345'
  && india.normalizeIndianPhone('09829012345') === '9829012345');
ok('rejects a landline-style number', india.isValidIndianPhone('0141234567') === false);
ok('formats an Indian mobile', india.formatIndianPhone('9829012345') === '+91 98290 12345');
ok('formats a full Indian address',
  india.formatIndianAddress({ line1: '12 MG Road', area: 'C-Scheme', city: 'Jaipur', state: 'Rajasthan', pin: '302001' })
  === '12 MG Road, C-Scheme, Jaipur, Rajasthan, 302001, India');
ok('IST wall-clock maps to the correct UTC instant',
  india.istWallDate('2026-03-02', 10, 0).toISOString() === '2026-03-02T04:30:00.000Z',
  india.istWallDate('2026-03-02', 10, 0).toISOString());
ok('istYmd renders the IST calendar date', /^\d{4}-\d{2}-\d{2}$/.test(india.istYmd(new Date('2026-03-01T20:00:00Z'))),
  india.istYmd(new Date('2026-03-01T20:00:00Z')));
ok('a 20:00Z instant is already the next IST day',
  india.istYmd(new Date('2026-03-01T20:00:00Z')) === '2026-03-02', india.istYmd(new Date('2026-03-01T20:00:00Z')));

/* ========================================================================== */
/* 4b. IST slot grid + forecast calendar (regression: slots stored 5.5h late)  */
/* ========================================================================== */
section('4b. IST slot grid — wall clock, labels and forecast dates');

const ist = await import('../api/_lib/ist.js');
const { syntheticSlots, syntheticHeatmap } = await import('../api/_lib/synthetic.js');
const clientSynthetic = await import('../src/lib/synthetic.ts');
const clientFormat = await import('../src/lib/format.ts');

// The runner is usually UTC (CI + serverless). These assertions therefore fail
// on the old code, which built slots with `setHours()` in the runtime zone and
// stored 10:00 IST as 10:00 UTC (15:30 IST for the business).
const isUtcRunner = new Date().getTimezoneOffset() === 0;
const slotDate = ist.istYmd(new Date(Date.now() + 2 * 86400000));
const serverSlots = syntheticSlots(100001, slotDate, 30, '10:00', '13:00');
ok('server slot grid is non-empty', serverSlots.length > 0, `got ${serverSlots.length}`);
ok('every server slot lands on a 10:00–12:30 IST wall clock',
  serverSlots.every((s) => {
    const h = ist.istHour(s.time);
    return h >= 10 && h < 13 && [0, 30].includes(ist.istMinute(s.time));
  }),
  JSON.stringify(serverSlots.slice(0, 3).map((s) => `${s.label} → ${s.time}`)));
ok('first server slot is exactly 10:00 IST',
  serverSlots[0]?.time === ist.istWallDate(slotDate, 10, 0).toISOString(),
  `${serverSlots[0]?.time} vs ${ist.istWallDate(slotDate, 10, 0).toISOString()}`);
ok('server slot labels are IST, not the runtime zone',
  serverSlots.every((s) => s.label === ist.istTimeLabel(s.time)),
  JSON.stringify(serverSlots.slice(0, 3).map((s) => `${s.label} vs ${ist.istTimeLabel(s.time)}`)));
ok('a 10:00 slot label reads "10:00 am"', serverSlots[0]?.label === '10:00 am', serverSlots[0]?.label);
if (isUtcRunner) {
  ok('UTC runtime: 10:00 IST slot is stored as 04:30Z',
    serverSlots[0]?.time === `${slotDate}T04:30:00.000Z`, serverSlots[0]?.time);
}

const clientSlots = clientSynthetic.getSyntheticSlots(100001, slotDate, 30, '10:00', '13:00');
ok('client + server slot grids agree on instants and labels',
  clientSlots.length === serverSlots.length
  && clientSlots.every((s, i) => s.time === serverSlots[i].time && s.label === serverSlots[i].label),
  `${clientSlots[0]?.time}/${serverSlots[0]?.time}`);
ok('client slot labels match the IST formatter',
  clientSlots.every((s) => s.label === clientFormat.istTime(s.time)), clientSlots[0]?.label);

const forecastServer = syntheticHeatmap(100001);
const forecastClient = clientSynthetic.getSyntheticHeatmap(100001);
const istToday = ist.istYmd();
ok('server forecast starts on today in IST', forecastServer.days[0]?.date === istToday, `${forecastServer.days[0]?.date} vs ${istToday}`);
ok('client forecast starts on today in IST', forecastClient.days[0]?.date === istToday, `${forecastClient.days[0]?.date} vs ${istToday}`);
ok('server forecast weekdays match the IST calendar',
  forecastServer.days.slice(0, 14).every((d) => d.weekday === ist.istWeekdayLabel(new Date(`${d.date}T12:00:00+05:30`))),
  JSON.stringify(forecastServer.days.slice(0, 3).map((d) => `${d.date}=${d.weekday}`)));
ok('forecast covers 14 consecutive IST days',
  forecastServer.days.length === 14
  && new Set(forecastServer.days.map((d) => d.date)).size === 14,
  `got ${forecastServer.days.length}`);

const calLib = await import('../src/lib/calendar.ts');
const ics = await calLib.icsBlob({
  title: 'Haircut; with Dr, Rao', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z',
  location: 'C-Scheme, Jaipur', details: 'Line one',
}).text();
ok('ICS uses UTC basic-format times', /DTSTART:20260302T043000Z/.test(ics) && /DTEND:20260302T051500Z/.test(ics));
ok('ICS escapes commas and semicolons in the summary',
  ics.includes('SUMMARY:Haircut\\; with Dr\\, Rao'),
  (ics.match(/SUMMARY:.*/) || [''])[0]);
ok('ICS carries a reminder alarm', /BEGIN:VALARM/.test(ics) && /TRIGGER:-PT1H/.test(ics));
ok('ICS UID is host-scoped and unique', /UID:\d+\.[a-z0-9]+@[^@\s]+/.test(ics), (ics.match(/UID:.*/) || [''])[0]);
const gcUrl = calLib.googleCalendarUrl({ title: 'Haircut', start: '2026-03-02T04:30:00.000Z', end: '2026-03-02T05:15:00.000Z' });
ok('Google Calendar link is pre-filled with the slot',
  gcUrl.startsWith('https://calendar.google.com/calendar/render?') && gcUrl.includes('20260302T043000Z%2F20260302T051500Z'), gcUrl);

/* ========================================================================== */
/* 5. Booking pipeline guards                                                 */
/* ========================================================================== */
section('5. Booking pipeline — fail closed without a real database');
const bookHandler = (await import('../api/book.js')).default;
const future = new Date(Date.now() + 86400000).toISOString();
const fixture = { business_id: 100000, service_id: 1000001, customer_name: 'Integration Test', customer_email: 'integration@example.in', start_time: future, idempotency_key: 'retry-key' };
const missingDb = fakeRes();
await bookHandler(fakeReq(fixture), missingDb);
ok('unconfigured database refuses synthetic reservations', missingDb.statusCode === 503 && !missingDb.body?.booking,
  `status=${missingDb.statusCode} ${JSON.stringify(missingDb.body)}`);
const live = fakeRes();
await bookHandler(fakeReq({ ...fixture, business_id: 'live-unpartnered-google-place' }), live);
ok('unpartnered Google listings cannot be booked', live.statusCode === 400 && !live.body?.booking);
const pastRes = fakeRes();
await bookHandler(fakeReq({ ...fixture, start_time: new Date(Date.now() - 7200000).toISOString() }), pastRes);
ok('a past slot is refused', pastRes.statusCode === 400 && /future/i.test(String(pastRes.body?.error)));
const { bookingRpcError } = await import('../api/book.js');
ok('database overlap maps to a conflict', bookingRpcError({ code: '23P01' })?.status === 409);
ok('unknown database errors do not masquerade as a reservation', bookingRpcError({ code: 'XX000' }) === null);

/* ========================================================================== */
/* 6. Shared demo credentials are blocked on configured deployments          */
/* ========================================================================== */
section('6. Demo credentials cannot reach production auth');
const { createServer } = await import('vite');
const viteServer = await createServer({
  root: ROOT, logLevel: 'silent', configFile: false,
  server: { middlewareMode: true, hmr: false }, appType: 'custom',
  resolve: { alias: [{ find: './supabase', replacement: join(ROOT, 'scripts/__stubs__/demo-supabase-stub.mjs') }] },
});
const demoAuth = await viteServer.ssrLoadModule('/src/lib/demoAuth.ts');
let rejected = false;
globalThis.__demoAuthCalls = 0;
try { await demoAuth.signInDemo('admin'); } catch (e) { rejected = /only in the local preview/i.test(e.message); }
ok('configured projects reject public demo credentials before contacting Auth', rejected && globalThis.__demoAuthCalls === 0);
delete globalThis.__demoAuthCalls;
await viteServer.close();

/* ========================================================================== */
/* 6. Security — CORS allowlist, object-level authz, error hygiene            */
/* ========================================================================== */
section('6. Security — CORS, ownership checks, error hygiene');

const security = await import('../api/_lib/security.js');
const { canOperateOn } = await import('../api/_lib/auth.js');

await withEnv({ APP_URL: 'https://velora.example', ALLOWED_ORIGINS: null }, async () => {
  const r = fakeRes();
  security.cors(r, { headers: { origin: 'https://velora.example' } });
  ok('CORS echoes a configured origin', r.headers['Access-Control-Allow-Origin'] === 'https://velora.example',
    JSON.stringify(r.headers));
  const evil = fakeRes();
  security.cors(evil, { headers: { origin: 'https://evil.example' } });
  ok('CORS does not grant an unknown browser origin', evil.headers['Access-Control-Allow-Origin'] === undefined,
    JSON.stringify(evil.headers));
  ok('CORS varies on Origin when it is selective', evil.headers.Vary === 'Origin');
  const preflight = fakeRes();
  security.cors(preflight, { headers: { origin: 'https://evil.example' } });
  ok('preflight advertises the methods it actually allows',
    /POST/.test(preflight.headers['Access-Control-Allow-Methods'])
    && /Authorization/.test(preflight.headers['Access-Control-Allow-Headers']));
});

await withEnv({ APP_URL: null, ALLOWED_ORIGINS: null }, async () => {
  const r = fakeRes();
  security.cors(r, { headers: { origin: 'http://localhost:5173' } });
  ok('unconfigured deployments keep the permissive fallback (preview stays usable)',
    r.headers['Access-Control-Allow-Origin'] === '*');
});

ok('empty ownership does not imply operator authority', canOperateOn([], 'Aurora Luxe') === false);
ok('explicit platform operator may operate anywhere', canOperateOn([], 'Aurora Luxe', true) === true);
ok('an owner may operate on their own business', canOperateOn(['Aurora Luxe'], 'aurora luxe') === true);
ok('an owner may NOT operate on another business', canOperateOn(['Aurora Luxe'], 'Apex Physio') === false);

const generic = security.safeError(Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }), 'test');
ok('unexpected server errors never echo driver detail', generic.status === 500 && !/duplicate key/i.test(generic.error), generic.error);
const expected = security.safeError(Object.assign(new Error('That slot was just taken.'), { status: 409 }), 'test');
ok('intentional 4xx messages reach the client', expected.status === 409 && expected.error === 'That slot was just taken.');
ok('sanitizer neutralises angle brackets', !/[<>]/.test(security.sanitizeText('<script>alert(1)</script>') || ''));
ok('rate limiter rejects after the configured budget', (() => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.7' }, socket: {} };
  for (let i = 0; i < 3; i++) security.rateLimit(req, 'test-route', { limit: 3, windowMs: 60000 });
  const hit = security.rateLimit(req, 'test-route', { limit: 3, windowMs: 60000 });
  return hit && hit.status === 429 && hit.retryAfter >= 1;
})());

/* ========================================================================== */
/* 7. Repository invariants                                                   */
/* ========================================================================== */
section('7. Repository invariants');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const applyAll = read('supabase/APPLY_ALL.sql');
// Discovered, not hardcoded — a new migration must appear in the bootstrap
// bundle or this check fails (the bundle script used to list files by hand).
const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
let inOrder = true, lastIdx = -1;
for (const m of migrations) {
  const body = read(`supabase/migrations/${m}`).trimEnd();
  const idx = applyAll.indexOf(body);
  if (idx < 0) { inOrder = false; console.log(`     missing: ${m}`); }
  else if (idx < lastIdx) { inOrder = false; console.log(`     out of order: ${m}`); }
  else lastIdx = idx;
}
ok('APPLY_ALL.sql contains every migration, in order', inOrder);
ok('APPLY_ALL.sql creates the profiles table', /create table if not exists public\.profiles/i.test(applyAll));
ok('APPLY_ALL.sql creates all 14 core tables',
  ['profiles', 'businesses', 'business_services', 'business_staff', 'bookings', 'booking_meta',
    'booking_history', 'reminders', 'notifications', 'recently_viewed', 'email_log', 'audit_logs',
    'idempotency_keys', 'invoices']
    .every((t) => applyAll.includes(`create table if not exists public.${t}`)));
ok('APPLY_ALL.sql enables realtime on bookings', /alter publication supabase_realtime add table public\.bookings/i.test(applyAll));
ok('the RLS tightening runs after the permissive policies',
  applyAll.indexOf('booking_meta_select_own') > applyAll.indexOf('booking_meta_all_service'));
ok('bookings.status accepts the pending request state the app models',
  /check \(status in \('pending'/.test(applyAll), 'status CHECK missing pending');
// 0001 created the permissive policy; 0004 must drop it AFTER that and replace
// it with the service-role policy, or the hardening never takes effect.
const permissiveInvoice = applyAll.indexOf('create policy "invoices_insert" on public.invoices for insert with check (true)');
const invoiceDrop = applyAll.indexOf('drop policy if exists "invoices_insert" on public.invoices');
const invoiceService = applyAll.indexOf('create policy "invoices_insert_service"');
ok('invoice writes are service-role only',
  permissiveInvoice >= 0 && invoiceDrop > permissiveInvoice && invoiceService > invoiceDrop,
  `permissive@${permissiveInvoice} drop@${invoiceDrop} service@${invoiceService}`);

/* --------------------------------------------------------------------------
 * Brand assets: the declared sizes must match the files that actually ship.
 * A PWA icon whose pixels disagree with the manifest is an install bug, and
 * the OG card must be the 1200x630 the meta tags promise.
 * -------------------------------------------------------------------------- */
const pngSize = (file) => {
  const buf = readFileSync(join(ROOT, 'public', file));
  // IHDR width/height live at bytes 16..23 of every PNG.
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length, png: buf.slice(1, 4).toString() === 'PNG' };
};
const manifest = JSON.parse(read('public/manifest.webmanifest'));
for (const icon of manifest.icons) {
  const size = pngSize(icon.src.replace(/^\//, ''));
  ok(`PWA icon ${icon.src} is a real PNG at its declared ${icon.sizes}`,
    size.png && `${size.w}x${size.h}` === icon.sizes, `${size.w}x${size.h}`);
}
const og = pngSize('og-image.png');
ok('Social card is the 1200x630 the meta tags declare', og.w === 1200 && og.h === 630, `${og.w}x${og.h}`);
ok('Ship-weight sanity: icons and card stay small (no multi-megabyte blobs)', og.bytes < 900_000 && pngSize('icon-512.png').bytes < 400_000,
  `og ${Math.round(og.bytes / 1024)}KB · 512 ${Math.round(pngSize('icon-512.png').bytes / 1024)}KB`);
ok('Index.html points at the apple touch icon that exists', (() => {
  const html = read('index.html');
  const href = (html.match(/rel="apple-touch-icon"[^>]*href="([^"]+)"/) || [])[1];
  return !!href && pngSize(href.replace(/^\//, '')).png;
})());
ok('The brand assets are reproducible from a committed script',
  read('scripts/brand/make-assets.sh').includes('render_icon 512') && read('scripts/brand/fonts/OFL.txt').includes('SIL OPEN FONT LICENSE'));

const promote = read('supabase/PROMOTE_ADMIN.sql');
ok('PROMOTE_ADMIN.sql has no psql-only meta-commands', !/^\s*\\(set|i|c)\b/m.test(promote));
ok('PROMOTE_ADMIN.sql works around the role-lock trigger',
  /disable trigger protect_profile_role/.test(promote) && /enable trigger protect_profile_role/.test(promote));
ok('PROMOTE_ADMIN.sql reports the "user has not signed up" case', /has no auth user yet/i.test(promote));

const toml = read('netlify.toml');
ok('netlify.toml no longer hardcodes the deploy domain', !/velora-ai-in\.netlify\.app/.test(toml));
ok('netlify.toml pins a Vite-7-compatible Node', /NODE_VERSION\s*=\s*"(2[2-9]|3\d)"/.test(toml), toml.match(/NODE_VERSION.*/)?.[0] || '');
ok('the QR helper has no hardcoded deploy domain', !/velora-ai-in\.netlify\.app/.test(read('api/_lib/qr.js')));
ok('the ICS generator has no hardcoded deploy domain', !/velora-ai-in\.netlify\.app/.test(read('src/lib/calendar.ts')));
ok('shared demo sign-in is guarded on configured deployments',
  /if \(!isDemoMode\) throw/.test(read('src/lib/demoAuth.ts')));
ok('.env.example documents the calendar refresh chain',
  /GOOGLE_CALENDAR_REFRESH_TOKEN/.test(read('.env.example')) && /GOOGLE_CLIENT_SECRET/.test(read('.env.example')));
const pkg = JSON.parse(read('package.json'));
ok('verify:integrations is wired into the verify script',
  typeof pkg.scripts['verify:integrations'] === 'string' && /verify:integrations/.test(pkg.scripts.verify));

console.log('\n—— Concierge date interpretation (IST, deterministic) ——');
const { parseRequestedDate, parseTimeOfDay } = await import('../api/concierge.js');
const istAfterMidnight = new Date('2026-10-27T20:00:00Z'); // Wednesday 01:30 IST, Tuesday UTC
ok('today uses the IST calendar even when UTC is still yesterday', parseRequestedDate('book today', istAfterMidnight) === '2026-10-28');
ok('tomorrow uses the IST calendar across UTC midnight', parseRequestedDate('book tomorrow', istAfterMidnight) === '2026-10-29');
ok('weekday requests use the IST weekday, not the UTC weekday', parseRequestedDate('book Wednesday', istAfterMidnight) === '2026-11-04');
ok('next weekday works across a month boundary', parseRequestedDate('book Sunday', new Date('2026-10-31T20:00:00Z')) === '2026-11-08');
ok('no explicit date is not invented', parseRequestedDate('book a salon', istAfterMidnight) === null);
ok('12 am is midnight and 12 pm is noon', parseTimeOfDay('12 am') === 0 && parseTimeOfDay('12 pm') === 12);
ok('invalid 12-hour clock values do not become preferred hours', parseTimeOfDay('13 pm') === null && parseTimeOfDay('0 am') === null);

/* ========================================================================== */
console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
