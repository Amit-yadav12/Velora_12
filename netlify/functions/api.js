// Netlify Functions adapter for Velora's Vercel-style /api/*.js handlers.
// Routes /api/discover, /api/businesses, etc. to the corresponding file in ../../api/
// Supports both Netlify's event/context and Vercel's req/res handler signatures.
// ESM + CJS compatible — handles import.meta.url undefined in some bundlers.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';

let API_ROOT;
try {
  // ESM: use import.meta.url
  if (typeof import.meta !== 'undefined' && import.meta.url) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    API_ROOT = path.resolve(__dirname, '..', '..', 'api');
  } else {
    throw new Error('no import.meta.url');
  }
} catch {
  try {
    // CJS fallback: __dirname is available
    // @ts-ignore
    const cjsDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
    API_ROOT = path.resolve(cjsDir, '..', '..', 'api');
  } catch {
    // Final fallback: assume process.cwd() is repo root or /var/task
    const cwd = process.cwd();
    // Try common locations
    const candidates = [
      path.resolve(cwd, 'api'),
      path.resolve(cwd, '..', 'api'),
      path.resolve(cwd, '..', '..', 'api'),
      '/var/task/api',
      path.resolve('/var/task', 'api'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        API_ROOT = cand;
        break;
      }
    }
    if (!API_ROOT) API_ROOT = candidates[0];
  }
}

const handlerCache = new Map();

async function loadHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name);
  const file = path.join(API_ROOT, `${name}.js`);
  if (!fs.existsSync(file)) {
    // Try alternative path: maybe bundled in /var/task/api
    const alt = path.join('/var/task', 'api', `${name}.js`);
    if (fs.existsSync(alt)) {
      const mod = await import(pathToFileURL(alt).href);
      const fn = mod.default;
      if (typeof fn === 'function') handlerCache.set(name, fn);
      return fn;
    }
    return null;
  }
  const mod = await import(pathToFileURL(file).href);
  const fn = mod.default;
  if (typeof fn === 'function') handlerCache.set(name, fn);
  return fn;
}

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
    // Extract API name from path: /api/discover or /.netlify/functions/api/discover
    const rawPath = event.path || event.rawUrl || '';
    let apiName = '';

    // First check if Netlify passed the splat via params? No, we parse path.
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
        body: JSON.stringify({ error: 'API endpoint not specified', path: rawPath, apiRoot: API_ROOT }),
      };
    }

    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(apiName)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid endpoint' }),
      };
    }

    const handlerFn = await loadHandler(apiName);
    if (!handlerFn) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `API ${apiName} not found`, apiRoot: API_ROOT }),
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
