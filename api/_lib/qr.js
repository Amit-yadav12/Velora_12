// Signed QR verification tokens (HMAC-SHA256).
// Format: v1.<base64url(payload)>.<base64url(signature)>
// Payload: { ref, id, biz, svc, at, exp } — no PII (never embeds email/phone).
// The token is self-validating (signature + expiry) so demo/local bookings
// without a database row still verify; when a DB row exists the live status
// (e.g. cancelled) takes precedence.
import { createHmac, timingSafeEqual } from 'node:crypto';

let warned = false;
function secret() {
  const s = process.env.QR_SIGNING_SECRET;
  if (!s && !warned) {
    warned = true;
    console.warn('[qr] QR_SIGNING_SECRET not set — using dev fallback. Set it in production.');
  }
  return s || 'velora-dev-only-qr-secret';
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s || ''), 'base64url');

export function signBookingToken({ ref, id, biz, svc, at }) {
  const start = new Date(at).getTime();
  const exp = Number.isFinite(start) ? start + 30 * 24 * 3600 * 1000 : Date.now() + 30 * 24 * 3600 * 1000;
  const payload = b64u(JSON.stringify({ ref, id, biz, svc, at, exp }));
  const sig = b64u(createHmac('sha256', secret()).update(`v1.${payload}`).digest());
  return `v1.${payload}.${sig}`;
}

export function verifyBookingToken(token) {
  if (typeof token !== 'string') return { ok: false, reason: 'malformed' };
  const t = token.trim();
  if (t.startsWith('{')) return { ok: false, reason: 'legacy' };
  const parts = t.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return { ok: false, reason: 'malformed' };
  const [, payload, sig] = parts;
  let expected;
  try {
    expected = b64u(createHmac('sha256', secret()).update(`v1.${payload}`).digest());
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const a = unb64u(sig);
  const b = unb64u(expected);
  if (a.length !== b.length) return { ok: false, reason: 'invalid_signature' };
  try {
    if (!timingSafeEqual(a, b)) return { ok: false, reason: 'invalid_signature' };
  } catch {
    return { ok: false, reason: 'invalid_signature' };
  }
  let data;
  try {
    data = JSON.parse(unb64u(payload).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!data?.ref) return { ok: false, reason: 'malformed' };
  if (data.exp && Date.now() > data.exp) return { ok: false, reason: 'expired', data };
  return { ok: true, data };
}

// Absolute base URL for verification links embedded in QR codes.
export function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host) {
    const proto = /localhost|127\.0\.0\.1/i.test(host) ? 'http' : 'https';
    return `${proto}://${host}`;
  }
  return 'https://velora-ai-in.netlify.app';
}

export function verifyUrl(req, token) {
  return `${baseUrl(req)}/verify/${encodeURIComponent(token)}`;
}
