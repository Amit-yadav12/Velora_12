// Google Calendar OAuth 2.0 sync.
//
// Two supported credentials, in order of preference:
//   1. GOOGLE_CALENDAR_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
//      → real OAuth 2.0 refresh-token chain. Access tokens are fetched on
//        demand, cached in memory until 60s before expiry, and a 401 from the
//        Calendar API invalidates the cache and retries exactly once. This is
//        what makes server-side calendar sync survive the ~1 hour access-token
//        lifetime without a human pasting a new token every hour.
//   2. GOOGLE_CALENDAR_ACCESS_TOKEN → static bearer token (still honoured for
//      existing deployments; it expires, so the refresh chain is preferred).
//
// With neither configured the pipeline degrades to an explicitly-labelled
// `log-fallback` (a synthetic event id + a log line) so a booking is never
// lost to a calendar problem — and it never claims a Google event exists.
// Any real API failure returns { ok: false, error } — never a fake success.

const API = 'https://www.googleapis.com/calendar/v3/calendars';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_SKEW_MS = 60_000; // refresh a minute before the real expiry

// In-memory token cache (per serverless instance; a miss simply refetches).
let cached = { token: null, expiresAt: 0 };
let inFlight = null;

/** Which credential path is configured. Exposed for /api/admin + tests. */
export function calendarAuthMode() {
  if (process.env.GOOGLE_CALENDAR_REFRESH_TOKEN && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return 'refresh-token';
  }
  if (process.env.GOOGLE_CALENDAR_ACCESS_TOKEN) return 'static-token';
  return 'none';
}

function calId() { return process.env.GOOGLE_CALENDAR_ID || 'primary'; }

/** Exchange the refresh token for a short-lived access token. */
async function fetchAccessToken() {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Token refresh ${r.status}: ${text.slice(0, 200)}`);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Token refresh returned a non-JSON body'); }
  if (!json?.access_token) throw new Error('Token refresh returned no access_token');
  const ttl = Number(json.expires_in) || 3600;
  cached = { token: json.access_token, expiresAt: Date.now() + ttl * 1000 - REFRESH_SKEW_MS };
  return cached.token;
}

/** Valid access token, or null when no credential is configured. */
async function accessToken() {
  const mode = calendarAuthMode();
  if (mode === 'static-token') return process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (mode !== 'refresh-token') return null;
  if (cached.token && Date.now() < cached.expiresAt) return cached.token;
  // Collapse concurrent refreshes into one network call.
  if (!inFlight) {
    inFlight = fetchAccessToken().finally(() => { inFlight = null; });
  }
  return inFlight;
}

function invalidateToken() {
  cached = { token: null, expiresAt: 0 };
}

/**
 * Authorized Calendar API call with automatic 401 recovery: if the cached
 * token was revoked/expired mid-flight we refresh once and retry once.
 * Returns null when no credential is configured (caller uses the fallback).
 */
async function callCalendar(pathname, init, { retried = false } = {}) {
  const token = await accessToken();
  if (!token) return null;
  const r = await fetch(`${API}/${pathname}`, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if ((r.status === 401 || r.status === 403) && !retried && calendarAuthMode() === 'refresh-token') {
    invalidateToken();
    return callCalendar(pathname, init, { retried: true });
  }
  return r;
}

const syntheticId = () => `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createCalendarEvent({ summary, description, start, end, location, attendees }) {
  try {
    const r = await callCalendar(
      `${encodeURIComponent(calId())}/events?sendUpdates=all`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary, description, location,
          start: { dateTime: start, timeZone: 'Asia/Kolkata' },
          end: { dateTime: end, timeZone: 'Asia/Kolkata' },
          reminders: { useDefault: false, overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ] },
          attendees: (attendees || []).filter(Boolean).map((e) => ({ email: e })),
        }),
      },
    );
    if (!r) {
      // No credential configured — configuration-dependent, clearly labelled.
      const synthetic = syntheticId();
      console.log(`[calendar:not-configured] no Google credential (set GOOGLE_CALENDAR_REFRESH_TOKEN + GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET); logged placeholder ${synthetic} "${summary}"`);
      return { ok: true, eventId: synthetic, provider: 'log-fallback', configured: false };
    }
    if (!r.ok) throw new Error(`Calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { ok: true, eventId: j.id, htmlLink: j.htmlLink, provider: 'google', configured: true };
  } catch (e) {
    console.error('[calendar:error]', e.message);
    return { ok: false, error: e.message, eventId: null, provider: 'google', configured: true };
  }
}

export async function updateCalendarEvent(eventId, { summary, description, start, end, location }) {
  try {
    if (!eventId) return { ok: false, error: 'no event id' };
    if (eventId.startsWith('evt_')) {
      console.log(`[calendar:not-configured] skipped update of placeholder ${eventId}`);
      return { ok: true, provider: 'log-fallback', configured: false };
    }
    const r = await callCalendar(`${encodeURIComponent(calId())}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'PATCH',
      body: JSON.stringify({
        summary, description, location,
        start: { dateTime: start, timeZone: 'Asia/Kolkata' },
        end: { dateTime: end, timeZone: 'Asia/Kolkata' },
      }),
    });
    if (!r) return { ok: false, error: 'no Google credential configured', provider: 'none', configured: false };
    if (!r.ok) throw new Error(`Calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { ok: true, provider: 'google', configured: true };
  } catch (e) {
    console.error('[calendar:update:error]', e.message);
    return { ok: false, error: e.message, provider: 'google', configured: true };
  }
}

export async function deleteCalendarEvent(eventId) {
  try {
    if (!eventId) return { ok: false, error: 'no event id' };
    if (eventId.startsWith('evt_')) {
      console.log(`[calendar:not-configured] skipped delete of placeholder ${eventId}`);
      return { ok: true, provider: 'log-fallback', configured: false };
    }
    const r = await callCalendar(`${encodeURIComponent(calId())}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'DELETE',
    });
    if (!r) return { ok: false, error: 'no Google credential configured', provider: 'none', configured: false };
    // 410 = already gone on Google's side; treat as success.
    if (!r.ok && r.status !== 410) throw new Error(`Calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { ok: true, provider: 'google', configured: true };
  } catch (e) {
    console.error('[calendar:delete:error]', e.message);
    return { ok: false, error: e.message, provider: 'google', configured: true };
  }
}

/** Test/ops helper — clears the cached token so the next call refetches. */
export function __resetCalendarAuthCache() { invalidateToken(); inFlight = null; }
