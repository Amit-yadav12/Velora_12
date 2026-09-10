// Netlify Functions adapter for Velora's Vercel-style /api/*.js handlers.
// Statically imports all handlers so esbuild bundles them (no filesystem needed).
// Routes /api/discover, /api/businesses, etc. to the corresponding handler.

import admin from '../../api/admin.js';
import audit from '../../api/audit.js';
import book from '../../api/book.js';
import bookings from '../../api/bookings.js';
import businessSlots from '../../api/business-slots.js';
import businesses from '../../api/businesses.js';
import concierge from '../../api/concierge.js';
import discover from '../../api/discover.js';
import geocode from '../../api/geocode.js';
import heatmap from '../../api/heatmap.js';
import myBookings from '../../api/my-bookings.js';
import nearest from '../../api/nearest.js';
import notifications from '../../api/notifications.js';
import places from '../../api/places.js';
import processReminders from '../../api/process-reminders.js';
import smartSlots from '../../api/smart-slots.js';
import trackView from '../../api/track-view.js';
import travelPlanner from '../../api/travel-planner.js';
import verifyBooking from '../../api/verify-booking.js';

const handlers = {
  admin,
  audit,
  book,
  bookings,
  'business-slots': businessSlots,
  businesses,
  concierge,
  discover,
  geocode,
  heatmap,
  'my-bookings': myBookings,
  nearest,
  notifications,
  places,
  'process-reminders': processReminders,
  'smart-slots': smartSlots,
  'track-view': trackView,
  'travel-planner': travelPlanner,
  'verify-booking': verifyBooking,
};

function parseBody(event) {
  if (!event.body) return undefined;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export const handler = async (event, context) => {
  try {
    const rawPath = event.path || event.rawUrl || '';
    let apiName = '';

    const apiMatch = rawPath.match(/\/api\/([a-z0-9_-]+)/i);
    if (apiMatch) {
      apiName = apiMatch[1];
    } else {
      const fnMatch = rawPath.match(/\/\.netlify\/functions\/api\/([a-z0-9_-]+)/i);
      if (fnMatch) apiName = fnMatch[1];
      else {
        const parts = rawPath.split('/').filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && /^[a-z0-9][a-z0-9_-]*$/i.test(last) && last !== 'api') apiName = last;
      }
    }

    if (!apiName) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API endpoint not specified', path: rawPath }),
      };
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(apiName)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid endpoint' }),
      };
    }

    const handlerFn = handlers[apiName];
    if (!handlerFn) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `API ${apiName} not found`, available: Object.keys(handlers) }),
      };
    }

    const query = event.queryStringParameters || {};
    const body = parseBody(event);
    const headers = event.headers || {};

    const req = {
      method: event.httpMethod || 'GET',
      headers,
      query,
      body,
      socket: { remoteAddress: headers['x-nf-client-connection-ip'] || headers['client-ip'] || 'unknown' },
    };

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = null;
    let ended = false;

    const res = {
      statusCode: 200,
      get headersSent() {
        return ended;
      },
      setHeader: (k, v) => {
        responseHeaders[k] = v;
        return res;
      },
      getHeader: (k) => responseHeaders[k],
      status: (c) => {
        statusCode = c;
        res.statusCode = c;
        return res;
      },
      json: (data) => {
        if (!responseHeaders['Content-Type']) responseHeaders['Content-Type'] = 'application/json';
        responseBody = JSON.stringify(data ?? null);
        ended = true;
        return res;
      },
      send: (data) => {
        responseBody = typeof data === 'string' ? data : JSON.stringify(data);
        ended = true;
        return res;
      },
      end: (data) => {
        if (data) responseBody = typeof data === 'string' ? data : JSON.stringify(data);
        ended = true;
        return res;
      },
    };

    await handlerFn(req, res);

    if (!ended) {
      if (!responseBody) {
        responseBody = JSON.stringify({ ok: true });
        if (!responseHeaders['Content-Type']) responseHeaders['Content-Type'] = 'application/json';
      }
      ended = true;
    }

    if (!responseHeaders['Access-Control-Allow-Origin']) {
      responseHeaders['Access-Control-Allow-Origin'] = '*';
    }

    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody || '',
    };
  } catch (err) {
    console.error('[netlify:api] error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', detail: err.message }),
    };
  }
};
