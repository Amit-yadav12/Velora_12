import { publicBusiness } from './_lib/public-business.js';
import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, sanitizeText, enforceRateLimit, safeError } from './_lib/security.js';
import { cityBusinesses, syntheticBusiness, isSyntheticId } from './_lib/synthetic.js';

// Product catalog for customers: businesses, their services & staff.
// City-scoped; merges DB rows with the synthetic city ecosystem.
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'businesses', { limit: 120, windowMs: 60_000 })) return;
  try {
    if (req.method === 'GET') {
      const { id, category, q, featured, city } = req.query;
      const cityName = sanitizeText(city, 40) || null;

      // Single business with nested services + staff
      if (id) {
        // Synthetic id — resolve deterministically (instant, no DB needed)
        if (isSyntheticId(id) && !isDatabaseConfigured()) {
          const biz = syntheticBusiness(id);
          if (!biz) return res.status(404).json({ error: 'Business not found' });
          return res.status(200).json(biz);
        }
        // DB row first, then synthetic lookup by numeric id as fallback
        try {
          const [businessResult, serviceResult, staffResult] = await Promise.all([
            supabase.from('businesses').select('*').eq('id', id).eq('active', true).maybeSingle(),
            supabase.from('business_services').select('*').eq('business_id', id).eq('active', true).order('id'),
            supabase.from('business_staff').select('*').eq('business_id', id).eq('active', true).order('id'),
          ]);
          const error = businessResult.error || serviceResult.error || staffResult.error;
          if (error && isDatabaseConfigured()) throw error;
          if (businessResult.data) return res.status(200).json({ ...publicBusiness(businessResult.data), services: serviceResult.data || [], staff: staffResult.data || [] });
        } catch (e) {
          console.error('[businesses:db-single]', e.message);
          if (isDatabaseConfigured()) throw e;
        }
        const synth = !isDatabaseConfigured() ? syntheticBusiness(id) : null;
        if (synth) return res.status(200).json(synth);
        return res.status(404).json({ error: 'Business not found' });
      }

      // List — DB + synthetic merged, city-pinned
      let dbRows = [];
      try {
        let query = supabase.from('businesses').select('*').eq('active', true);
        if (category && category !== 'All') query = query.eq('category', category);
        if (featured === 'true') query = query.eq('featured', true);
        const { data, error } = await query.order('rating', { ascending: false });
        if (error && isDatabaseConfigured()) throw error;
        if (!error && Array.isArray(data)) dbRows = data.map(publicBusiness);
      } catch (e) {
        console.error('[businesses:db-list]', e.message);
        if (isDatabaseConfigured()) throw e;
      }

      let synth = [];
      try {
        synth = isDatabaseConfigured() ? [] : cityBusinesses(cityName || 'Jaipur', {
          category: category && category !== 'All' ? category : undefined,
        });
        if (featured === 'true') synth = synth.filter((b) => b.featured);
      } catch (e) {
        console.error('[businesses:synth]', e.message);
      }

      const seen = new Set(dbRows.map((b) => String(b.id)));
      let list = [...dbRows];
      for (const b of synth) {
        if (!seen.has(String(b.id))) {
          seen.add(String(b.id));
          list.push(b);
        }
      }
      if (cityName) list = list.filter((b) => !b.city || b.city === cityName);
      if (q) {
        const term = sanitizeText(q, 80)?.toLowerCase() || '';
        list = list.filter((b) =>
          (b.name || '').toLowerCase().includes(term) ||
          (b.category || '').toLowerCase().includes(term) ||
          (b.description || '').toLowerCase().includes(term) ||
          (b.city || '').toLowerCase().includes(term) ||
          (b.area || '').toLowerCase().includes(term)
        );
      }
      return res.status(200).json(list);
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[businesses:error]', err.message);
    const s = safeError(err, 'businesses:error');
    if (!res.headersSent) res.status(s.status).json({ error: s.error });
  }
}
