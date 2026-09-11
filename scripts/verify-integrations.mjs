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
//   6. Repository invariants — SQL bundle in sync, no hardcoded deploy domain
//
// Run: npx tsx scripts/verify-integrations.mjs
import { readFileSync } from 'node:fs';
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
  ok('fallback is explicitly labelled configuration-dependent',
    res.provider === 'log-fallback' && res.configured === false, JSON.stringify(res));
  ok('fallback id is a placeholder, never a Google id', String(res.eventId).startsWith('evt_'), String(res.eventId));
  const del = await calendar.deleteCalendarEvent('evt_abc');
  ok('placeholder events are not deleted on Google', del.provider === 'log-fallback' && f.calls.length === 0, JSON.stringify(del));
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
  ok('no provider configured → queued, not "sent"', r.status === 'queued' && r.provider === 'queued', JSON.stringify(r));
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
section('5. Booking pipeline — idempotency + double-booking');
const bookHandler = (await import('../api/book.js')).default;
const { syntheticBusiness } = await import('../api/_lib/synthetic.js');
const biz = syntheticBusiness(100000);
ok('synthetic fixture business resolved', !!biz && Array.isArray(biz.services) && biz.services.length > 0,
  JSON.stringify(biz && { id: biz.id, services: biz.services?.length, staff: biz.staff?.length }));

const futureIso = (hoursAhead = 30) => new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
const svc = biz.services[0];
const staffA = (biz.staff || [])[0];
const baseBody = () => ({
  business_id: biz.id, service_id: svc.id,
  customer_name: 'Integration Test', customer_email: 'integration@example.in',
  start_time: futureIso(),
});

// 5a. Idempotency: the same key replays the original booking, no duplicate.
const idemKey = `itest-${Date.now()}`;
const body1 = { ...baseBody(), idempotency_key: idemKey };
const r1 = fakeRes();
await bookHandler(fakeReq(body1), r1);
ok('first booking is created (201)', r1.statusCode === 201, `status=${r1.statusCode} ${JSON.stringify(r1.body)}`);
const ref1 = r1.body?.booking?.ref;
ok('booking carries a VL- reference', /^VL-[A-Z0-9]{6}$/.test(String(ref1)), String(ref1));
ok('QR payload is returned with the booking', /\/verify\/v1\./.test(String(r1.body?.qr_payload)), String(r1.body?.qr_payload));
const r2 = fakeRes();
await bookHandler(fakeReq({ ...body1, start_time: body1.start_time }), r2);
ok('the same idempotency key replays (200)', r2.statusCode === 200, `status=${r2.statusCode}`);
ok('the replay is flagged as deduplicated', r2.body?.deduplicated === true, JSON.stringify(r2.body?.deduplicated));
ok('the replay returns the SAME booking (no duplicate)', r2.body?.booking?.ref === ref1,
  `${r2.body?.booking?.ref} vs ${ref1}`);

// 5b. A named specialist cannot be double-booked in an overlapping slot.
const clashStart = futureIso(40);
const okRes = fakeRes();
await bookHandler(fakeReq({ ...baseBody(), start_time: clashStart, staff_id: staffA?.id }), okRes);
ok('named specialist booked once', okRes.statusCode === 201, `status=${okRes.statusCode} ${JSON.stringify(okRes.body)}`);
const clashRes = fakeRes();
await bookHandler(fakeReq({
  ...baseBody(), start_time: clashStart, staff_id: staffA?.id,
  customer_email: 'second@example.in', idempotency_key: `itest-clash-${Date.now()}`,
}), clashRes);
ok('the same specialist in the same slot is refused (409)', clashRes.statusCode === 409,
  `status=${clashRes.statusCode} ${JSON.stringify(clashRes.body)}`);

// 5c. Validation guards.
const pastRes = fakeRes();
await bookHandler(fakeReq({ ...baseBody(), start_time: new Date(Date.now() - 7200_000).toISOString() }), pastRes);
ok('a past slot is refused', pastRes.statusCode === 400 && /past/i.test(String(pastRes.body?.error)),
  `status=${pastRes.statusCode} ${JSON.stringify(pastRes.body)}`);
const badMail = fakeRes();
await bookHandler(fakeReq({ ...baseBody(), customer_email: 'not-an-email' }), badMail);
ok('an invalid email is refused', badMail.statusCode === 400 && /email/i.test(String(badMail.body?.error)),
  `status=${badMail.statusCode} ${JSON.stringify(badMail.body)}`);
const badSvc = fakeRes();
await bookHandler(fakeReq({ ...baseBody(), service_id: 99999999 }), badSvc);
ok('a service that is not on the business is refused', badSvc.statusCode === 404, `status=${badSvc.statusCode}`);

/* ========================================================================== */
/* 6. Demo console provisioning — the branch demo-mode tests never reach       */
/* ========================================================================== */
section('6. Demo sign-in — console role grant is never swallowed');

// src/lib/demoAuth.ts is loaded through a real Vite module graph with its two
// collaborators (supabase client + api client) replaced by stubs, so the actual
// provisioning branch runs in NON-demo mode — the mode a deployed site uses.
const { createServer } = await import('vite');
const viteServer = await createServer({
  root: ROOT,
  logLevel: 'silent',
  configFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  resolve: {
    alias: [
      { find: './supabase', replacement: join(ROOT, 'scripts/__stubs__/demo-supabase-stub.mjs') },
      { find: './api', replacement: join(ROOT, 'scripts/__stubs__/demo-api-stub.mjs') },
    ],
  },
});
const demoAuth = await viteServer.ssrLoadModule('/src/lib/demoAuth.ts');
const runDemo = async (scenario) => {
  globalThis.__provisionScenario = scenario;
  try { return await demoAuth.signInDemo('admin'); } finally { delete globalThis.__provisionScenario; }
};

let d = await runDemo('ok');
ok('a successful grant reports provision.ok', d.provision?.ok === true && d.email === 'admin@velora.ai',
  JSON.stringify(d));
d = await runDemo('409');
ok('a 409 grant failure is reported, not swallowed', d.provision?.ok === false && d.provision?.status === 409,
  JSON.stringify(d.provision));
ok('a 409 maps to the APPLY_ALL.sql instruction', /APPLY_ALL\.sql/.test(String(d.provision?.hint)), String(d.provision?.hint));
d = await runDemo('503');
ok('a 503 maps to the missing-credentials instruction',
  /SUPABASE_SERVICE_ROLE_KEY/.test(String(d.provision?.hint)), String(d.provision?.hint));
d = await runDemo('401');
ok('a 401 maps to the rotate-the-key instruction', /rotate/i.test(String(d.provision?.hint)), String(d.provision?.hint));
d = await runDemo('429');
ok('a 429 maps to a back-off instruction', /wait a minute/i.test(String(d.provision?.hint)), String(d.provision?.hint));
d = await runDemo('network');
ok('an unreachable function still returns a hint (no silent bounce)',
  d.provision?.ok === false && String(d.provision?.hint).length > 10 && d.provision?.status === undefined,
  JSON.stringify(d.provision));
d = await runDemo('unexpected');
ok('an unexpected 200 body is treated as a failure', d.provision?.ok === false, JSON.stringify(d.provision));
ok('provisionHint covers the unmapped case with PROMOTE_ADMIN.sql',
  /PROMOTE_ADMIN\.sql/.test(demoAuth.provisionHint(undefined, 'something odd')),
  demoAuth.provisionHint(undefined, 'something odd'));
await viteServer.close();

/* ========================================================================== */
/* 7. Repository invariants                                                   */
/* ========================================================================== */
section('7. Repository invariants');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const applyAll = read('supabase/APPLY_ALL.sql');
const migrations = ['0001_velora_core.sql', '0002_business_registration_role_lock.sql', '0003_rls_tightening.sql'];
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
ok('demo sign-in surfaces provisioning failures',
  /provision:\s*\{/.test(read('src/lib/demoAuth.ts')) && !/catch\s*\{\s*\/\/ Server keeps control/.test(read('src/lib/demoAuth.ts')));
ok('.env.example documents the calendar refresh chain',
  /GOOGLE_CALENDAR_REFRESH_TOKEN/.test(read('.env.example')) && /GOOGLE_CLIENT_SECRET/.test(read('.env.example')));
const pkg = JSON.parse(read('package.json'));
ok('verify:integrations is wired into the verify script',
  typeof pkg.scripts['verify:integrations'] === 'string' && /verify:integrations/.test(pkg.scripts.verify));

/* ========================================================================== */
console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail ? 1 : 0);
