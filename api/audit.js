import supabase from './db-client.js';
import { cors, safeError } from './_lib/security.js';
import { getAuth, requireRole, businessScope } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      // Admin-only in production; allow read if authed admin, else limited demo view.
      const auth = await getAuth(req);
      const gate = requireRole(auth, ['admin']);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      const scope = await businessScope(auth);
      if (!scope.operator) return res.status(403).json({ error: 'Platform operator access required.' });
      const limit = 100;
      const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      return res.status(200).json(data);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[audit:error]', err.message);
    const s = safeError(err, 'audit:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
