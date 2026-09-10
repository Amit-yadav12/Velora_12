// Netlify Functions adapter for Velora's Vercel-style /api/*.js handlers.
// Routes /api/discover, /api/businesses, etc. to the corresponding file in ../../api/
// Supports both Netlify's event/context and Vercel's req/res handler signatures.

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, '..', '..', 'api');

const handlerCache = new Map();

async function loadHandler(name) {
  if (handlerCache.has(name)) return handlerCache.get(name);
  const file = path.join(API_ROOT, `${name}.js`);
  if (!fs.existsSync(file)) return null;
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
    // Netlify passes the full path in event.path and also event.rawUrl
    const rawPath = event.path || event.rawUrl || '';
    let apiName = '';
    // Try to get from /api/ prefix
    const apiMatch = rawPath.match(/\/api\/([a-z0-9_-]+)/i);
    if (apiMatch) {
      apiName = apiMatch[1];
    } else {
      // Fallback: check if path is /.netlify/functions/api/<name>
      const fnMatch = rawPath.match(/\/\.netlify\/functions\/api\/([a-z0-9_-]+)/i);
      if (fnMatch) apiName = fnMatch[1];
      else {
        // Direct function name via query or last segment
        const parts = rawPath.split('/').filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && /^[a-z0-9][a-z0-9_-]*$/i.test(last) && last !== 'api') apiName = last;
      }
    }

    // If no name extracted, try to use the :splat param via event.path replacement
    // Netlify redirect passes :splat as part of path after /api/
    if (!apiName) {
      // event.queryStringParameters may contain the splat? No.
      // As fallback, list available handlers for debugging
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'API endpoint not specified' }),
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
        body: JSON.stringify({ error: `API ${apiName} not found` }),
      };
    }

    // Build Vercel-style req
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

    // Build Vercel-style res that captures output for Netlify return
    let statusCode = 200;
    const responseHeaders = {};
    let responseBody = null;
    let ended = false;

    const res = {
      statusCode: 200,
      get headersSent() { return ended; },
      setHeader: (k, v) => { responseHeaders[k] = v; return res; },
      getHeader: (k) => responseHeaders[k],
      status: (c) => { statusCode = c; res.statusCode = c; return res; },
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

    // If handler didn't end, default to 200 with empty body
    if (!ended) {
      if (!responseBody) {
        responseBody = JSON.stringify({ ok: true });
        if (!responseHeaders['Content-Type']) responseHeaders['Content-Type'] = 'application/json';
      }
      ended = true;
    }

    // Ensure CORS and security headers
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
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
