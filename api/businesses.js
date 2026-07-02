import supabase from './db-client.js';
import { cors, sanitizeText } from './_lib/security.js';

// Product catalog for customers: businesses, their services & staff.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET') {
      const { id, category, q, featured } = req.query;

      // Single business with nested services + staff
      if (id) {
        const [{ data: biz }, { data: services }, { data: staff }] = await Promise.all([
          supabase.from('businesses').select('*').eq('id', id).single(),
          supabase.from('business_services').select('*').eq('business_id', id).eq('active', true).order('id'),
          supabase.from('business_staff').select('*').eq('business_id', id).eq('active', true).order('id'),
        ]);
        if (!biz) return res.status(404).json({ error: 'Business not found' });
        return res.status(200).json({ ...biz, services: services || [], staff: staff || [] });
      }

      // List
      let query = supabase.from('businesses').select('*').eq('active', true);
      if (category && category !== 'All') query = query.eq('category', category);
      if (featured === 'true') query = query.eq('featured', true);
      const { data, error } = await query.order('rating', { ascending: false });
      if (error) throw error;
      let list = data || [];
      if (q) {
        const term = sanitizeText(q, 80)?.toLowerCase() || '';
        list = list.filter((b) =>
          b.name.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term) ||
          (b.description || '').toLowerCase().includes(term) ||
          (b.city || '').toLowerCase().includes(term)
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
