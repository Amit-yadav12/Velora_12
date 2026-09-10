// Velora dev-only API middleware — mounts ./api/*.js serverless handlers under
// /api/* so `vite dev` previews get fully working APIs (synthetic-powered,
// no database needed). Production (Vercel) serves ./api natively; this file is
// only loaded by vite.config.ts in dev.
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function readJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return resolve(undefined);
    }
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size < 1024 * 1024) chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve(undefined);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

function ensurePreviewEnv() {
  // Dummy backend env so server handlers boot in pure-synthetic preview mode.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://demo.local';
  }
  if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://demo.local';
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) process.env.SUPABASE_SERVICE_ROLE_KEY = 'demo';
  if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'demo';
}

// SPA fallback for `vite preview` (deep links like /verify/... serve index.html).
function spaFallback(req, res, next) {
  if (req.method !== 'GET') return next();
  let p = '';
  try { p = new URL(req.url || '/', 'http://local').pathname; } catch { return next(); }
  if (p.startsWith('/api/')) return next();
  const file = path.join(ROOT, 'dist', decodeURIComponent(p));
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) return next();
    fs.readFile(path.join(ROOT, 'dist', 'index.html'), (e2, data) => {
      if (e2) return next();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(data);
    });
  });
}

export function devApi() {

  const cache = new Map();
  async function load(name) {
    if (!cache.has(name)) {
      const file = path.join(ROOT, 'api', `${name}.js`);
      if (!fs.existsSync(file)) return null;
      cache.set(name, (await import(pathToFileURL(file).href)).default);
    }
    return cache.get(name);
  }

  const apiMiddleware = async (nodeReq, nodeRes, next) => {
        let pathname = '';
        try {
          pathname = new URL(nodeReq.url || '/', 'http://local').pathname;
        } catch {
          return next();
        }
        if (!pathname.startsWith('/api/')) return next();
        const name = pathname.slice(5).split('/').filter(Boolean)[0] || '';
        if (!/^[a-z0-9][a-z0-9_-]*$/i.test(name)) return next();
        let handler = null;
        try {
          handler = await load(name);
        } catch (e) {
          console.error(`[dev-api] failed to load ${name}:`, e.message);
        }
        if (typeof handler !== 'function') {
          nodeRes.statusCode = 404;
          nodeRes.setHeader('Content-Type', 'application/json');
          nodeRes.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        const url = new URL(nodeReq.url || '/', 'http://local');
        const query = Object.fromEntries(url.searchParams.entries());
        const body = await readJsonBody(nodeReq);
        const req = {
          method: nodeReq.method || 'GET',
          headers: nodeReq.headers || {},
          query,
          body,
          socket: nodeReq.socket,
        };
        const res = {
          statusCode: 200,
          get headersSent() {
            return nodeRes.headersSent;
          },
          setHeader: (k, v) => {
            try {
              nodeRes.setHeader(k, v);
            } catch {
              /* already sent */
            }
            return res;
          },
          status: (c) => {
            nodeRes.statusCode = c;
            res.statusCode = c;
            return res;
          },
          json: (o) => {
            if (!nodeRes.headersSent) nodeRes.setHeader('Content-Type', 'application/json');
            nodeRes.end(JSON.stringify(o ?? null));
            return res;
          },
          end: (s) => {
            nodeRes.end(s);
            return res;
          },
        };
        try {
          await handler(req, res);
          if (!nodeRes.writableEnded) {
            console.warn(`[dev-api] ${name} returned without responding — closing.`);
            nodeRes.statusCode = 200;
            nodeRes.setHeader('Content-Type', 'application/json');
            nodeRes.end(JSON.stringify({ ok: true }));
          }
        } catch (e) {
          console.error(`[dev-api] ${name} error:`, e.message);
          if (!nodeRes.writableEnded) {
            nodeRes.statusCode = 500;
            nodeRes.setHeader('Content-Type', 'application/json');
            nodeRes.end(JSON.stringify({ error: 'Internal error' }));
          }
        }
      };

  return {
    name: 'velora-dev-api',
    apply: 'serve',
    configureServer(server) {
      ensurePreviewEnv();
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      ensurePreviewEnv();
      server.middlewares.use(apiMiddleware);
      server.middlewares.use(spaFallback);
    },
  };
}
