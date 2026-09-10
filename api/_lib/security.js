// Input sanitization + validation helpers (XSS / injection hardening).
// Supabase client uses parameterized queries so SQL injection is not possible,
// but we still sanitize all free-text inputs before persistence + display.

export function sanitizeText(input, max = 2000) {
  if (input == null) return null;
  let s = String(input);
  // strip control chars
  s = s.replace(/[\u0000-\u001F\u007F]/g, '');
  // neutralize HTML-significant chars to prevent stored XSS
  s = s.replace(/[<>]/g, (c) => (c === '<' ? '\u2039' : '\u203a'));
  s = s.trim().slice(0, max);
  return s.length ? s : null;
}

export function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}

export function isISODate(v) {
  if (typeof v !== 'string') return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}

export function assert(cond, message, status = 400) {
  if (!cond) {
    const e = new Error(message);
    e.status = status;
    throw e;
  }
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Idempotency-Key');
  // basic hardening headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (per route + client IP).
// Serverless-safe best effort: each isolate tracks its own counters, which is
// enough to blunt casual abuse + runaway clients. Returns null when allowed,
// or { status, error, retryAfter } when the caller should reject with 429.
// ---------------------------------------------------------------------------
const buckets = new Map(); // key -> { count, resetAt }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();

export function rateLimit(req, route, { limit = 60, windowMs = 60_000 } = {}) {
  const key = `${route}|${clientIp(req)}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return {
      status: 429,
      error: 'Too many requests — please slow down and try again shortly.',
      retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
    };
  }
  return null;
}

export function enforceRateLimit(req, res, route, opts) {
  const hit = rateLimit(req, route, opts);
  if (hit) {
    res.setHeader('Retry-After', String(hit.retryAfter));
    res.status(hit.status).json({ error: hit.error });
    return false;
  }
  return true;
}

// Never leak stack traces / driver errors to clients; log server-side instead.
export function safeError(err, tag) {
  console.error(`[${tag}]`, err?.message || err);
  if (err?.status && err.status < 500) return { status: err.status, error: err.message };
  return { status: 500, error: 'Something went wrong on our end. Please try again.' };
}
