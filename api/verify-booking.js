import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { verifyBookingToken, qrSigningReady } from './_lib/qr.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    if (!enforceRateLimit(req, res, 'verify-booking', { limit: 120, windowMs: 60_000 })) return;
    if (!req.query.token) return res.status(400).json({ valid: false, reason: 'missing_token' });
    if (isDatabaseConfigured() && !qrSigningReady()) return res.status(503).json({ valid: false, reason: 'unavailable', message: 'Live ticket verification is unavailable. Please try again.' });
    const v = verifyBookingToken(req.query.token);
    if (!v.ok) return res.status(200).json({ valid: false, reason: v.reason, message: 'This ticket is invalid, altered or expired.' });
    if (!isDatabaseConfigured() || !qrSigningReady()) return res.status(503).json({ valid: false, reason: 'unavailable', message: 'Live ticket verification is unavailable. Please try again.' });
    const { data: row, error } = await supabase.from('bookings').select('id,ref,status,start_time,resource_name,service_name').eq('id', v.data.id).eq('ref', v.data.ref).maybeSingle();
    if (error) throw error;
    if (!row) return res.status(200).json({ valid: false, reason: 'not_found', message: 'No matching appointment exists.' });
    if (new Date(row.start_time).getTime() !== new Date(v.data.at).getTime()) return res.status(200).json({ valid: false, reason: 'outdated', message: 'This appointment changed. Open the latest ticket from booking history.' });
    const booking = { ref: row.ref, business: row.resource_name, service: row.service_name, start_time: row.start_time };
    if (['cancelled', 'no_show', 'completed'].includes(row.status)) return res.status(200).json({ valid: false, reason: row.status, status: row.status, booking, message: 'This appointment is no longer valid.' });
    return res.status(200).json({ valid: true, status: row.status, booking, checked_at: new Date().toISOString() });
  } catch (err) {
    const s = safeError(err, 'verify-booking:error');
    return res.status(s.status).json({ error: s.error, valid: false });
  }
}
