import supabase from './db-client.js';
import { cors, isEmail , safeError} from './_lib/security.js';
import { getAuth } from './_lib/auth.js';

// Customer's own bookings (upcoming + past), STRICTLY scoped to the
// authenticated user. The email is taken from the verified session token —
// never from a client-supplied query param — to prevent IDOR access to
// other customers' bookings.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = await getAuth(req);
    if (!auth?.user?.email) return res.status(401).json({ error: 'Authentication required' });
    const email = auth.user.email.toLowerCase();
    if (!isEmail(email)) return res.status(200).json([]);

    const { data, error } = await supabase.from('bookings').select('*')
      .eq('customer_email', email).order('start_time', { ascending: false });
    if (error) throw error;
    return res.status(200).json(data);
  } catch (err) {
    const se = safeError(err, 'my-bookings:error');
    res.status(se.status).json({ error: se.error });
  }
}
