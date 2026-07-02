import supabase from './db-client.js';
import { cors, sanitizeText, assert, clientIp } from './_lib/security.js';
import { getAuth, requireRole } from './_lib/auth.js';

// Secure admin operations. Requires an authenticated ADMIN.
async function audit(actor, action, entity, entityId, metadata, ip) {
  try { await supabase.from('audit_logs').insert({ actor, action, entity, entity_id: String(entityId), metadata, ip }); }
  catch (e) { console.error('[audit]', e.message); }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);
  try {
    const auth = await getAuth(req);
    const gate = requireRole(auth, ['admin']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const actor = auth.user.email;

    const resource = req.query.resource || req.body?.resource;
    assert(['services', 'staff', 'business', 'customers', 'overview', 'emails'].includes(resource), 'Unknown resource.');

    // ---- READ ----
    if (req.method === 'GET') {
      if (resource === 'overview') {
        const [{ data: bookings }, { data: businesses }, { data: profiles }] = await Promise.all([
          supabase.from('bookings').select('*'),
          supabase.from('businesses').select('*'),
          supabase.from('profiles').select('id,email,full_name,role,created_at'),
        ]);
        const active = (bookings || []).filter(b => b.status !== 'cancelled');
        return res.status(200).json({
          bookings: bookings || [], businesses: businesses || [],
          customers: (profiles || []).filter(p => p.role === 'customer'),
          stats: {
            total: active.length, revenue: Math.round(active.reduce((s, b) => s + Number(b.price || 0), 0)),
            today: active.filter(b => new Date(b.start_time).toDateString() === new Date().toDateString()).length,
            businesses: (businesses || []).length,
          },
        });
      }
      if (resource === 'customers') {
        const { data } = await supabase.from('profiles').select('id,email,full_name,role,phone,created_at').eq('role', 'customer').order('created_at', { ascending: false });
        return res.status(200).json(data || []);
      }
      if (resource === 'emails') {
        const { data } = await supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(50);
        return res.status(200).json(data || []);
      }
      if (resource === 'services') {
        const { data } = await supabase.from('business_services').select('*').order('id');
        return res.status(200).json(data || []);
      }
      if (resource === 'staff') {
        const { data } = await supabase.from('business_staff').select('*').order('id');
        return res.status(200).json(data || []);
      }
      if (resource === 'business') {
        const { data } = await supabase.from('businesses').select('*').order('id');
        return res.status(200).json(data || []);
      }
    }

    // ---- CREATE ----
    if (req.method === 'POST') {
      const body = req.body || {};
      if (resource === 'services') {
        assert(body.business_id && body.name, 'business_id and name are required.');
        const { data, error } = await supabase.from('business_services').insert({
          business_id: body.business_id, name: sanitizeText(body.name, 120),
          description: sanitizeText(body.description, 300), duration_min: Number(body.duration_min) || 30, price: Number(body.price) || 0,
        }).select().single();
        if (error) throw error;
        await audit(actor, 'service.create', 'service', data.id, { name: data.name }, ip);
        return res.status(201).json(data);
      }
      if (resource === 'staff') {
        assert(body.business_id && body.name, 'business_id and name are required.');
        const { data, error } = await supabase.from('business_staff').insert({
          business_id: body.business_id, name: sanitizeText(body.name, 120), role: sanitizeText(body.role, 80),
        }).select().single();
        if (error) throw error;
        await audit(actor, 'staff.create', 'staff', data.id, { name: data.name }, ip);
        return res.status(201).json(data);
      }
    }

    // ---- UPDATE ----
    if (req.method === 'PUT') {
      const { id, ...rest } = req.body || {};
      assert(id, 'id is required.');
      const table = resource === 'services' ? 'business_services' : resource === 'staff' ? 'business_staff' : 'businesses';
      const clean = {};
      ['name', 'description', 'role', 'tagline', 'open_time', 'close_time'].forEach(k => { if (rest[k] != null) clean[k] = sanitizeText(rest[k], 300); });
      ['duration_min', 'price', 'rating'].forEach(k => { if (rest[k] != null) clean[k] = Number(rest[k]); });
      ['active'].forEach(k => { if (rest[k] != null) clean[k] = !!rest[k]; });
      const { data, error } = await supabase.from(table).update(clean).eq('id', id).select().single();
      if (error) throw error;
      await audit(actor, `${resource}.update`, resource, id, clean, ip);
      return res.status(200).json(data);
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      assert(id, 'id is required.');
      const table = resource === 'services' ? 'business_services' : resource === 'staff' ? 'business_staff' : 'businesses';
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      await audit(actor, `${resource}.delete`, resource, id, {}, ip);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin:error]', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
}
