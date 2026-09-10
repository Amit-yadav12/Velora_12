import supabase from './db-client.js';
import { cors, enforceRateLimit } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';

// Record + fetch recently viewed businesses per user, and toggle favorites.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (!enforceRateLimit(req, res, 'track-view', { limit: 120, windowMs: 60_000 })) return;
    const auth = await getAuth(req);
    // Session-derived identity ONLY — never trust a client-supplied user_id
    // (prevents recording/reading another user's browsing history).
    const uid = auth?.user?.id || null;
    const viewUserId = req.query.user_id || req.body?.user_id;

    if (req.method === 'POST') {
      const { business_id } = req.body || {};
      if (!uid || !business_id) return res.status(200).json({ ok: true });
      // Live Google place ids are strings — tracked client-side only.
      if (typeof business_id === 'string' && business_id.startsWith('live-')) return res.status(201).json({ ok: true });
      try {
        // de-dup: remove prior view of same business then insert fresh
        await supabase.from('recently_viewed').delete().eq('user_id', uid).eq('business_id', business_id);
        await supabase.from('recently_viewed').insert({ user_id: uid, business_id });
      } catch (e) {
        console.error('[track-view:save]', e.message);
      }
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'GET') {
      if (!uid) return res.status(200).json([]);
      const requested = String(viewUserId || uid);
      if (requested !== uid) return res.status(200).json([]);
      const { data } = await supabase.from('recently_viewed').select('business_id').eq('user_id', uid).order('viewed_at', { ascending: false }).limit(8);
      const ids = (data || []).map((r) => r.business_id);
      if (!ids.length) return res.status(200).json([]);
      const { data: biz } = await supabase.from('businesses').select('*').in('id', ids);
      // Synthetic ecosystem ids resolve deterministically (no DB rows needed).
      const { syntheticBusiness, isSyntheticId } = await import('./_lib/synthetic.js');
      const ordered = ids.map((id) => {
        const db = (biz || []).find((b) => String(b.id) === String(id));
        if (db) return db;
        if (isSyntheticId(id)) return syntheticBusiness(id);
        return null;
      }).filter(Boolean);
      return res.status(200).json(ordered);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[track-view:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
