import supabase from './db-client.js';
import { cors } from './_lib/security.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { audience } = req.query;
      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
      if (audience) q = q.eq('audience', audience);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data);
    }
    if (req.method === 'PUT') {
      const { id } = req.body || {};
      const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[notifications:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
