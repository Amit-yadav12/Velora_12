// Netlify Scheduled Function: processes due reminders every 15 minutes
// Schedule is defined in netlify.toml: "*/15 * * * *"
// Also callable as HTTP endpoint for manual triggering (with CRON_SECRET)

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..', '..', 'api');

async function loadHandler() {
  const file = path.join(API_ROOT, 'process-reminders.js');
  if (!fs.existsSync(file)) throw new Error('process-reminders API not found');
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

function parseBody(event) {
  if (!event?.body) return undefined;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch { return undefined; }
}

export const handler = async (event, context) => {
  // Netlify scheduled events have event.body with next_run etc, but we treat same as HTTP
  try {
    const handlerFn = await loadHandler();

    const query = event?.queryStringParameters || {};
    const body = parseBody(event);
    const headers = event?.headers || {};

    // For scheduled invocations, inject CRON_SECRET as Bearer if available
    if (!headers.authorization && process.env.CRON_SECRET) {
      headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
    }

    const req = {
      method: event?.httpMethod || 'POST',
      headers,
      query,
      body,
      socket: { remoteAddress: headers['x-nf-client-connection-ip'] || 'unknown' },
    };

    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = null;
    let ended = false;

    const res = {
      statusCode: 200,
      get headersSent() { return ended; },
      setHeader: (k, v) => { responseHeaders[k] = v; return res; },
      status: (c) => { statusCode = c; res.statusCode = c; return res; },
      json: (data) => {
        responseHeaders['Content-Type'] = 'application/json';
        responseBody = JSON.stringify(data ?? null);
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
      responseBody = responseBody || JSON.stringify({ ok: true });
      responseHeaders['Content-Type'] = 'application/json';
    }

    // Scheduled functions should return 200
    return {
      statusCode,
      headers: responseHeaders,
      body: responseBody || '',
    };
  } catch (err) {
    console.error('[process-reminders:scheduled] error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

// Netlify scheduled function config (alternative to netlify.toml schedule)
// This is kept for compatibility — toml schedule takes precedence
export const config = {
  schedule: "*/15 * * * *",
};
