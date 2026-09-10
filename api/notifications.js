// In-app notifications — strictly scoped to the authenticated user.
// A user receives their own rows (user_id match) plus role broadcasts
// (user_id NULL + audience matching their role). Mark-read is scoped the
// same way so users can never touch another user's notifications.
import supabase from './db-client.js';
import { cors, enforceRateLimit, safeError } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (!enforceRateLimit(req, res, 'notifications', { limit: 120, windowMs: 60_000 })) return;
    const auth = await getAuth(req);
    if (!auth?.user) return res.status(401).json({ error: 'Authentication required' });
    const uid = auth.user.id;
    const role = auth.profile?.role || 'customer';
    const audience = role === 'admin' ? 'admin' : 'customer';

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('notifications').select('*')
        .or(`user_id.eq.${uid},and(user_id.is.null,audience.eq.${audience})`)
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'PUT') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Notification id is required' });
      const { data: row } = await supabase.from('notifications').select('id,user_id,audience').eq('id', id).single();
      if (!row) return res.status(404).json({ error: 'Not found' });
      const owned = row.user_id === uid || (!row.user_id && row.audience === audience);
      if (!owned) return res.status(403).json({ error: 'Not your notification' });
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const s = safeError(err, 'notifications:error');
    res.status(s.status).json({ error: s.error });
  }
}
