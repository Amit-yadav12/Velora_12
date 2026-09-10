import supabase from './db-client.js';
import { cors, sanitizeText, assert, clientIp, enforceRateLimit, safeError } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';

// Business account registration.
//
// Flow: the client signs the owner up with Supabase Auth first, then calls
// this endpoint with the session token. The server (service role) then:
//   1. grants the account the 'admin' (business console) role — the ONLY
//      client-reachable path that can set this role (RLS + trigger in
//      migration 0002 block direct role writes),
//   2. creates the business row linked to the owner,
//   3. inserts the starter services.
// Roles are therefore enforced server-side — never trusted from the client.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);
  try {
    assert(req.method === 'POST', 'Method not allowed', 405);
    if (!enforceRateLimit(req, res, 'register-business', { limit: 5, windowMs: 60_000 })) return;

    const auth = await getAuth(req);
    assert(auth?.user, 'Sign in first, then create your business.', 401);
    const user = auth.user;

    const b = req.body || {};
    const name = sanitizeText(b.name, 160);
    const category = sanitizeText(b.category, 80);
    assert(name, 'Business name is required.');
    assert(category, 'Category is required.');
    const city = sanitizeText(b.city, 80) || null;
    const open_time = /^\d{2}:\d{2}$/.test(String(b.open_time || '')) ? b.open_time : '09:00';
    const close_time = /^\d{2}:\d{2}$/.test(String(b.close_time || '')) ? b.close_time : '20:00';

    // 1. Grant the business console role (service role bypasses RLS).
    const { error: roleErr } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      full_name: sanitizeText(b.owner_name, 120) || auth.profile?.full_name || user.user_metadata?.full_name || user.email.split('@')[0],
      role: 'admin',
    });
    if (roleErr) throw roleErr;

    // 2. Create the business, linked to its owner.
    const { data: biz, error: bizErr } = await supabase.from('businesses').insert({
      name,
      category,
      description: sanitizeText(b.description, 600),
      address: sanitizeText(b.address, 300),
      city,
      phone: sanitizeText(b.phone, 40),
      email: sanitizeText(b.email, 160) || user.email,
      open_time,
      close_time,
      rating: 0,
      review_count: 0,
      owner_user_id: user.id,
      owner_email: user.email,
      active: true,
    }).select().single();
    if (bizErr) throw bizErr;

    // 3. Starter services (validated + sanitized).
    const services = (Array.isArray(b.services) ? b.services : [])
      .filter((s) => s && s.name)
      .slice(0, 10)
      .map((s) => ({
        business_id: biz.id,
        name: sanitizeText(s.name, 120),
        description: sanitizeText(s.description, 300),
        duration_min: Math.min(600, Math.max(5, Number(s.duration_min) || 30)),
        price: Math.max(0, Number(s.price) || 0),
      }));
    if (services.length) {
      const { error: svcErr } = await supabase.from('business_services').insert(services);
      if (svcErr) console.error('[register-business:services]', svcErr.message);
    }

    try {
      await supabase.from('audit_logs').insert({
        actor: user.email, action: 'business.register', entity: 'business',
        entity_id: String(biz.id), metadata: { name: biz.name, city: biz.city }, ip,
      });
    } catch (e) { console.error('[audit]', e.message); }

    return res.status(201).json({ ok: true, business: biz, services_created: services.length });
  } catch (err) {
    const s = safeError(err, 'register-business:error');
    res.status(s.status).json({ error: s.error });
  }
}
