import supabase, { isDatabaseConfigured } from './db-client.js';
import { cors, sanitizeText, assert, clientIp, enforceRateLimit, safeError } from './_lib/security.js';
import { getAuth } from './_lib/auth.js';
import { validateBusinessInput, coordinatesMatch } from './_lib/business-input.js';
import { verifyMediaUrls } from './_lib/business-media.js';

async function verifyPlace(data) {
  if (!data.google_place_id || data.lat == null || data.location_status !== 'owner_confirmed') return;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${encodeURIComponent(data.google_place_id)}&key=${encodeURIComponent(key)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const json = await response.json();
    const location = json.status === 'OK' ? json.results?.[0]?.geometry?.location : null;
    if (coordinatesMatch({ lat: data.lat, lng: data.lng }, location)) data.location_status = 'verified';
    else data.google_place_id = null; // never mark a mismatched pin verified
  } catch { /* quota/network: retain owner-confirmed, not provider-verified */ }
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    assert(req.method === 'POST' || req.method === 'PUT', 'Method not allowed', 405);
    if (!enforceRateLimit(req, res, 'register-business', { limit: 15, windowMs: 60_000 })) return;
    if (!isDatabaseConfigured()) return res.status(503).json({ error: 'Business storage is not configured. No business was saved.' });
    const auth = await getAuth(req);
    assert(auth?.user?.id && auth.user.email, 'Sign in to save your business.', 401);
    const id = req.method === 'PUT' ? Number(req.body?.id) : null;
    if (req.method === 'PUT') assert(Number.isSafeInteger(id) && id > 0, 'A valid business id is required.');
    let existing = null, serviceCount = 0;
    if (id) {
      const { data, error } = await supabase.from('businesses').select('*').eq('id', id).eq('owner_user_id', auth.user.id).maybeSingle();
      if (error) throw error;
      assert(data, 'Business not found or not owned by this account.', 404);
      existing = data;
      const result = await supabase.from('business_services').select('id', { count: 'exact', head: true }).eq('business_id', id).eq('active', true);
      if (result.error) throw result.error;
      serviceCount = result.count || 0;
    }
    const data = validateBusinessInput(req.body, auth.user.email, { editing: !!id, existingServices: serviceCount });
    // Existing services/staff are managed independently; editing never deletes them.
    if (id) { data.services = []; data.staff = []; }
    await verifyMediaUrls([...data.photos, data.logo_url, ...data.services.map((s) => s.image_url)], auth.user.id, [...(Array.isArray(existing?.photos) ? existing.photos : []), existing?.logo_url, existing?.image_url, existing?.cover_url]);
    await verifyPlace(data);
    const { data: business, error } = await supabase.rpc('save_owned_business', {
      p_owner: auth.user.id, p_email: auth.user.email,
      p_owner_name: sanitizeText(req.body?.owner_name, 120) || auth.profile?.full_name || auth.user.user_metadata?.full_name || auth.user.email.split('@')[0],
      p_business_id: id, p_data: data,
    });
    if (error) throw error;
    assert(business?.id, 'Business could not be saved.', 500);
    try { await supabase.from('audit_logs').insert({ actor: auth.user.email, action: id ? 'business.update' : 'business.register', entity: 'business', entity_id: String(business.id), metadata: { name: business.name, active: business.active }, ip: clientIp(req) }); }
    catch (e) { console.error('[register-business:audit]', e.message); }
    return res.status(id ? 200 : 201).json({ ok: true, business });
  } catch (err) {
    const s = safeError(err, 'register-business:error');
    return res.status(s.status).json({ error: s.error });
  }
}
