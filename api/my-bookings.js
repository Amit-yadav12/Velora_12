import supabase from './db-client.js';
import { cors, isEmail , safeError} from './_lib/security.js';
import { getAuth } from './_lib/auth.js';
import { qrSigningReady, signBookingToken, verifyUrl } from './_lib/qr.js';

// Customer's own bookings (upcoming + past), STRICTLY scoped to the
// authenticated user. The email is taken from the verified session token —
// never from a client-supplied query param — to prevent IDOR access to
// other customers' bookings. Attaches the stored QR verification payload
// (booking_meta.qr_payload) so tickets are re-viewable from booking history.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await getAuth(req);
    if (!auth?.user?.id) return res.status(401).json({ error: 'Authentication required' });
    const email = isEmail(auth.user.email) ? auth.user.email.toLowerCase() : null;

    const { data, error } = await supabase.from('bookings').select('*')
      .eq('customer_id', auth.user.id).order('start_time', { ascending: false });
    if (error) throw error;
    let legacy = [];
    if (email && auth.user.email_confirmed_at) {
      const result = await supabase.from('bookings').select('*').is('customer_id', null)
        .eq('customer_email', email).order('start_time', { ascending: false });
      if (result.error) throw result.error;
      legacy = result.data || [];
    }

    // Generate a current signed ticket from the persisted row. Metadata writes
    // are auxiliary and must not make a committed ticket disappear on reload.
    const rows = [...(data || []), ...legacy]
      .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      .map((b) => ({ ...b, qr_payload: qrSigningReady() && !['cancelled', 'no_show'].includes(b.status)
        ? verifyUrl(req, signBookingToken({ ref: b.ref, id: b.id, biz: b.resource_name, svc: b.service_name, at: b.start_time })) : null }));
    return res.status(200).json(rows);
  } catch (err) {
    const se = safeError(err, 'my-bookings:error');
    res.status(se.status).json({ error: se.error });
  }
}
