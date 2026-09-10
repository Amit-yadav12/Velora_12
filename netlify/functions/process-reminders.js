// Netlify Scheduled Function: processes due reminders every 15 minutes
// Schedule is defined in netlify.toml: "*/15 * * * *"
// Also callable as HTTP endpoint for manual triggering (with CRON_SECRET)
// ESM + CJS compatible

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

let API_ROOT;
try {
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    API_ROOT = path.resolve(__dirname, '..', '..', 'api');
  } else {
    throw new Error('no import.meta.url');
  }
} catch {
  try {
    // @ts-ignore
    const cjsDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    API_ROOT = path.resolve(cjsDir, '..', '..', 'api');
  } catch {
    const cwd = process.cwd();
    const candidates = [path.resolve(cwd, 'api'), '/var/task/api', path.resolve('/var/task', 'api')];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        API_ROOT = cand;
        break;
      }
    }
    if (!API_ROOT) API_ROOT = candidates[0];
  }
}

async function loadHandler() {
  const file = path.join(API_ROOT, 'process-reminders.js');
  if (!fs.existsSync(file)) {
    const alt = path.join('/var/task', 'api', 'process-reminders.js');
    if (!fs.existsSync(alt)) throw new Error('process-reminders API not found at ' + file);
    const mod = await import(pathToFileURL(alt).href);
    return mod.default;
  }
  const mod = await import(pathToFileURL(file).href);
  return mod.default;
}

function parseBody(event) {
  if (!event?.body) return undefined;
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export const handler = async (event, context) => {
  try {
    const handlerFn = await loadHandler();
    const query = event?.queryStringParameters || {};
    const body = parseBody(event);
    const headers = event?.headers || {};

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
      get headersSent() {
        return ended;
      },
      setHeader: (k, v) => {
        responseHeaders[k] = v;
        return res;
      },
      status: (c) => {
        statusCode = c;
        res.statusCode = c;
        return res;
      },
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

export const config = {
  schedule: '*/15 * * * *',
};
