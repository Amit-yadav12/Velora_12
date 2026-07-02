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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  // basic hardening headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
