import supabase from './db-client.js';
import { cors, sanitizeText } from './_lib/security.js';
import { cityBusinesses, syntheticBusiness, isSyntheticId } from './_lib/synthetic.js';

// Product catalog for customers: businesses, their services & staff.
// City-scoped; merges DB rows with the synthetic city ecosystem.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { id, category, q, featured, city } = req.query;
      const cityName = sanitizeText(city, 40) || null;

      // Single business with nested services + staff
      if (id) {
        // Synthetic id — resolve deterministically (instant, no DB needed)
        if (isSyntheticId(id)) {
          const biz = syntheticBusiness(id);
          if (!biz) return res.status(404).json({ error: 'Business not found' });
          return res.status(200).json(biz);
        }
        // DB row first, then synthetic lookup by numeric id as fallback
        try {
          const [{ data: biz }, { data: services }, { data: staff }] = await Promise.all([
            supabase.from('businesses').select('*').eq('id', id).single(),
            supabase.from('business_services').select('*').eq('business_id', id).eq('active', true).order('id'),
            supabase.from('business_staff').select('*').eq('business_id', id).eq('active', true).order('id'),
          ]);
          if (biz) return res.status(200).json({ ...biz, services: services || [], staff: staff || [] });
        } catch (e) {
          console.error('[businesses:db-single]', e.message);
        }
        const synth = syntheticBusiness(id);
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
        if (!error && Array.isArray(data)) dbRows = data;
      } catch (e) {
        console.error('[businesses:db-list]', e.message);
      }

      let synth = [];
      try {
        synth = cityBusinesses(cityName || 'Jaipur', {
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
    res.status(500).json({ error: err.message });
  }
}
