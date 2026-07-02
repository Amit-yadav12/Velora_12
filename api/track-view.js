import supabase from './db-client.js';
import { cors } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';

// Record + fetch recently viewed businesses per user, and toggle favorites.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const auth = await getAuth(req);
    const uid = auth?.user?.id || req.query.user_id || req.body?.user_id;

    if (req.method === 'POST') {
      const { business_id } = req.body || {};
      if (!uid || !business_id) return res.status(200).json({ ok: true });
      // de-dup: remove prior view of same business then insert fresh
      await supabase.from('recently_viewed').delete().eq('user_id', uid).eq('business_id', business_id);
      await supabase.from('recently_viewed').insert({ user_id: uid, business_id });
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'GET') {
      if (!uid) return res.status(200).json([]);
      const { data } = await supabase.from('recently_viewed').select('business_id').eq('user_id', uid).order('viewed_at', { ascending: false }).limit(8);
      const ids = (data || []).map((r) => r.business_id);
      if (!ids.length) return res.status(200).json([]);
      const { data: biz } = await supabase.from('businesses').select('*').in('id', ids);
      const ordered = ids.map((id) => (biz || []).find((b) => b.id === id)).filter(Boolean);
      return res.status(200).json(ordered);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[track-view:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
