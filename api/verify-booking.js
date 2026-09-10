// Public QR verification: GET /api/verify-booking?token=v1...
// Validates the HMAC signature + expiry, then overlays the LIVE booking status
// from the database when available. Returns only public-safe fields (ref,
// business, service, date, status) — never email, phone, or user ids.
import supabase from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { verifyBookingToken } from './_lib/qr.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!enforceRateLimit(req, res, 'verify-booking', { limit: 120, windowMs: 60_000 })) return;

    const token = req.query.token;
    if (!token) return res.status(400).json({ valid: false, reason: 'missing_token' });
    const v = verifyBookingToken(token);
    if (!v.ok) {
      const messages = {
        malformed: 'This QR code is not a valid Velora ticket.',
        invalid_signature: 'This ticket failed verification — it may have been altered.',
        expired: 'This ticket has expired.',
        legacy: 'This ticket was issued before verification was enabled and cannot be checked.',
      };
      return res.status(200).json({ valid: false, reason: v.reason, message: messages[v.reason] });
    }

    const d = v.data;
    const booking = {
      ref: d.ref,
      business: d.biz || null,
      service: d.svc || null,
      start_time: d.at || null,
    };

    // Live status overlay from DB (authoritative when reachable).
    try {
      const { data: row } = await supabase
        .from('bookings')
        .select('ref,status,start_time')
        .eq('ref', d.ref)
        .single();
      if (row) {
        if (row.status === 'cancelled') {
          return res.status(200).json({
            valid: false, reason: 'cancelled', status: 'cancelled',
            message: 'This booking was cancelled.', booking,
            checked_at: new Date().toISOString(),
          });
        }
        return res.status(200).json({
          valid: true, status: row.status || 'confirmed', booking,
          checked_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[verify-booking:db]', e.message);
    }

    // No DB row (demo/local booking or DB unreachable): the signed token
    // itself is the proof — signature + expiry already validated above.
    return res.status(200).json({
      valid: true, status: 'confirmed', demo: true, booking,
      message: 'Signature verified. Live status unavailable offline.',
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    const s = safeError(err, 'verify-booking:error');
    res.status(s.status).json({ error: s.error });
  }
}
