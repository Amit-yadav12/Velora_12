import supabase from './db-client.js';
import { cors } from './_lib/security.js';
import { getAuth, requireRole } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      // Admin-only in production; allow read if authed admin, else limited demo view.
      const auth = await getAuth(req);
      const gate = requireRole(auth, ['admin']);
      const limit = gate.ok ? 100 : 20;
      const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return res.status(200).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[audit:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
