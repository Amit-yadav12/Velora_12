// Google Calendar OAuth 2.0 sync. When GOOGLE_CALENDAR_ACCESS_TOKEN is set,
// creates/updates/deletes real events on both the customer's and the business'
// calendars. Otherwise returns a synthetic event id and logs — graceful
// fallback so the booking pipeline never fails on calendar issues.

const API = 'https://www.googleapis.com/calendar/v3/calendars';

function token() { return process.env.GOOGLE_CALENDAR_ACCESS_TOKEN; }
function calId() { return process.env.GOOGLE_CALENDAR_ID || 'primary'; }

export async function createCalendarEvent({ summary, description, start, end, location, attendees }) {
  try {
    if (token()) {
      const r = await fetch(`${API}/${encodeURIComponent(calId())}/events?sendUpdates=all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary, description, location,
          start: { dateTime: start }, end: { dateTime: end },
          reminders: { useDefault: false, overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 60 },
            { method: 'popup', minutes: 15 },
          ] },
          attendees: (attendees || []).map((e) => ({ email: e })),
        }),
      });
      if (!r.ok) throw new Error(`Calendar ${r.status}`);
      const j = await r.json();
      return { ok: true, eventId: j.id, htmlLink: j.htmlLink, provider: 'google' };
    }
    const synthetic = `evt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    console.log(`[calendar:fallback] created event ${synthetic} "${summary}"`);
    return { ok: true, eventId: synthetic, provider: 'log-fallback' };
  } catch (e) {
    console.error('[calendar:error]', e.message);
    return { ok: false, error: e.message, eventId: null };
  }
}

export async function updateCalendarEvent(eventId, { summary, description, start, end, location }) {
  try {
    if (!eventId) return { ok: false };
    if (token() && !eventId.startsWith('evt_')) {
      const r = await fetch(`${API}/${encodeURIComponent(calId())}/events/${eventId}?sendUpdates=all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, description, location, start: { dateTime: start }, end: { dateTime: end } }),
      });
      if (!r.ok) throw new Error(`Calendar ${r.status}`);
      return { ok: true, provider: 'google' };
    }
    console.log(`[calendar:fallback] updated event ${eventId}`);
    return { ok: true, provider: 'log-fallback' };
  } catch (e) {
    console.error('[calendar:update:error]', e.message);
    return { ok: false, error: e.message };
  }
}

export async function deleteCalendarEvent(eventId) {
  try {
    if (!eventId) return { ok: false };
    if (token() && !eventId.startsWith('evt_')) {
      const r = await fetch(`${API}/${encodeURIComponent(calId())}/events/${eventId}?sendUpdates=all`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
      });
      if (!r.ok && r.status !== 410) throw new Error(`Calendar ${r.status}`);
      return { ok: true, provider: 'google' };
    }
    console.log(`[calendar:fallback] deleted event ${eventId}`);
    return { ok: true, provider: 'log-fallback' };
  } catch (e) {
    console.error('[calendar:delete:error]', e.message);
    return { ok: false, error: e.message };
  }
}
