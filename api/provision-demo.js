import supabase from './db-client.js';
import { cors, sanitizeText, assert, clientIp, enforceRateLimit, safeError } from './_lib/security.js';

// Demo account provisioning — server-side, strictly allowlisted.
// Only the two public demo identities can be provisioned, and only to their
// fixed roles. This is the single server-side path that grants the demo
// business account its console role (RLS blocks client role writes).
const ALLOWED = {
  'customer@velora.ai': { role: 'customer', full_name: 'Demo Customer' },
  'admin@velora.ai': { role: 'admin', full_name: 'Demo Admin' },
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = clientIp(req);
  try {
    assert(req.method === 'POST', 'Method not allowed', 405);
    if (!enforceRateLimit(req, res, 'provision-demo', { limit: 10, windowMs: 60_000 })) return;

    const email = String(req.body?.email || '').toLowerCase().trim();
    const spec = ALLOWED[email];
    // Never reveal which accounts are provisionable — generic response.
    assert(spec, 'This account cannot be provisioned.', 403);

    // The auth user must already exist (client signs up first).
    const { data: list } = await supabase.from('profiles').select('id').eq('email', email).limit(1);
    if (!list || list.length === 0) {
      // Try auth.users lookup via profiles miss → the caller must sign up first.
      return res.status(409).json({ error: 'Sign up first, then provision.' });
    }
    const { error } = await supabase.from('profiles').upsert({
      id: list[0].id,
      email,
      full_name: sanitizeText(spec.full_name, 120),
      role: spec.role,
    });
    if (error) throw error;

    try {
      await supabase.from('audit_logs').insert({
        actor: email, action: 'demo.provision', entity: 'profile',
        entity_id: String(list[0].id), metadata: { role: spec.role }, ip,
      });
    } catch (e) { console.error('[audit]', e.message); }

    return res.status(200).json({ ok: true, role: spec.role });
  } catch (err) {
    const s = safeError(err, 'provision-demo:error');
    res.status(s.status).json({ error: s.error });
  }
}
