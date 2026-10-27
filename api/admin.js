import supabase from './db-client.js';
import { cors, sanitizeText, assert, clientIp, safeError } from './_lib/security.js';
import { getAuth, requireRole, businessScope, canAccessBusiness } from './_lib/auth.js';
import { istYmd } from './_lib/ist.js';
import { verifyMediaUrls } from './_lib/business-media.js';

async function audit(actor, action, entity, entityId, metadata, ip) {
  try { const { error } = await supabase.from('audit_logs').insert({ actor, action, entity, entity_id: String(entityId), metadata, ip }); if (error) console.error('[admin:audit]', error.message); }
  catch (e) { console.error('[admin:audit]', e.message); }
}
function numericServiceFields(body, clean) {
  if (body.duration_min != null) {
    const n = Number(body.duration_min);
    assert(Number.isInteger(n) && n >= 5 && n <= 600, 'Duration must be between 5 and 600 minutes.');
    clean.duration_min = n;
  }
  if (body.price != null) {
    const n = Number(body.price);
    assert(Number.isFinite(n) && n >= 0 && n <= 10000000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Enter a valid price in ₹.');
    clean.price = n;
  }
}
async function rows(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const auth = await getAuth(req);
    const gate = requireRole(auth, ['admin']);
    if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
    const scope = await businessScope(auth);
    const resource = req.query.resource || req.body?.resource;
    assert(['services', 'staff', 'business', 'customers', 'overview', 'emails'].includes(resource), 'Unknown resource.');
    const tableFor = { services: 'business_services', staff: 'business_staff', business: 'businesses' };
    const actor = auth.user.email;

    if (req.method === 'GET') {
      if (resource === 'emails') {
        assert(scope.operator, 'Only the platform operator can view delivery logs.', 403);
        return res.status(200).json(await rows(supabase.from('email_log').select('*').order('created_at', { ascending: false }).limit(50)));
      }
      if (!scope.operator && scope.ids.length === 0) return res.status(200).json(resource === 'overview' ? { bookings: [], businesses: [], customers: [], stats: { total: 0, revenue: 0, today: 0, businesses: 0 } } : []);
      if (resource === 'overview' || resource === 'customers') {
        let query = supabase.from('bookings').select('*');
        if (!scope.operator) query = query.in('resource_id', scope.ids);
        const bookings = await rows(query);
        const byEmail = new Map();
        for (const b of bookings) if (b.customer_email) byEmail.set(b.customer_email.toLowerCase(), { id: b.customer_id, email: b.customer_email, full_name: b.customer_name, role: 'customer' });
        const customers = [...byEmail.values()];
        if (resource === 'customers') return res.status(200).json(customers);
        let bq = supabase.from('businesses').select('*');
        if (!scope.operator) bq = bq.in('id', scope.ids);
        const businesses = await rows(bq);
        const active = bookings.filter((b) => b.status !== 'cancelled');
        return res.status(200).json({ bookings, businesses, customers, stats: { total: active.length, revenue: Math.round(active.reduce((n, b) => n + Number(b.price || 0), 0)), today: active.filter((b) => istYmd(new Date(b.start_time)) === istYmd()).length, businesses: businesses.length } });
      }
      let query = supabase.from(tableFor[resource]).select('*').order('id');
      if (!scope.operator) query = query.in(resource === 'business' ? 'id' : 'business_id', scope.ids);
      return res.status(200).json(await rows(query));
    }

    assert(['services', 'staff'].includes(resource), 'Manage business profiles via the business editor.', 400);
    const table = tableFor[resource];
    const body = req.body || {};
    if (req.method === 'POST') {
      assert(canAccessBusiness(scope, body.business_id), 'This business is not owned by your account.', 403);
      const name = sanitizeText(body.name, 120);
      assert(name, 'A name is required.');
      const clean = { business_id: body.business_id, name };
      if (resource === 'services') {
        clean.description = sanitizeText(body.description, 300);
        numericServiceFields({ duration_min: body.duration_min ?? 30, price: body.price ?? 0 }, clean);
        if (body.image_url != null && body.image_url !== '') {
          assert(typeof body.image_url === 'string', 'Invalid service image.');
          await verifyMediaUrls([body.image_url], auth.user.id); clean.image_url = body.image_url;
        }
      } else clean.role = sanitizeText(body.role, 80);
      const { data, error } = await supabase.from(table).insert(clean).select().single();
      if (error) throw error;
      await audit(actor, `${resource}.create`, resource, data.id, { name }, clientIp(req));
      return res.status(201).json(data);
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      assert(body.id, 'id is required.');
      const { data: existing, error: findError } = await supabase.from(table).select(resource === 'services' ? 'id,business_id,image_url' : 'id,business_id').eq('id', body.id).maybeSingle();
      if (findError) throw findError;
      assert(existing && canAccessBusiness(scope, existing.business_id), 'Resource not found or not owned by your account.', 404);
      if (req.method === 'DELETE') {
        // Disable instead of deleting: booking/service history remains intact.
        const { error } = await supabase.from(table).update({ active: false }).eq('id', body.id);
        if (error) throw error;
        await audit(actor, `${resource}.archive`, resource, body.id, {}, clientIp(req));
        return res.status(200).json({ ok: true, archived: true });
      }
      const clean = {};
      for (const key of ['name', 'description', 'role']) if (body[key] != null) clean[key] = sanitizeText(body[key], key === 'name' ? 120 : 300);
      if (Object.hasOwn(clean, 'name')) assert(clean.name, 'Name cannot be empty.');
      if (resource === 'services') {
        numericServiceFields(body, clean);
        if (Object.hasOwn(body, 'image_url')) {
          assert(body.image_url == null || typeof body.image_url === 'string', 'Invalid service image.');
          const image = body.image_url || null;
          await verifyMediaUrls([image], auth.user.id, [existing.image_url]); clean.image_url = image;
        }
      }
      if (body.active != null) { assert(typeof body.active === 'boolean', 'Invalid active state.'); clean.active = body.active; }
      assert(Object.keys(clean).length, 'No valid fields to update.');
      const { data, error } = await supabase.from(table).update(clean).eq('id', body.id).select().single();
      if (error) throw error;
      await audit(actor, `${resource}.update`, resource, body.id, clean, clientIp(req));
      return res.status(200).json(data);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    const s = safeError(err, 'admin:error');
    if (!res.headersSent) return res.status(s.status).json({ error: s.error });
  }
}
