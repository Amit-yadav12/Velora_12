import supabase from '../db-client.js';

export async function getAuth(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  const { data, error } = await supabase.auth.getUser(match[1]);
  if (error || !data?.user) return null;
  const user = data.user;
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (profileError) throw profileError;
  return { user, profile: profile || null };
}

export function requireRole(auth, roles) {
  if (!auth?.user) return { ok: false, status: 401, error: 'Authentication required' };
  const role = auth.profile?.role || 'customer';
  if (roles && !roles.includes(role)) return { ok: false, status: 403, error: 'Insufficient permissions' };
  return { ok: true, role };
}

/** Empty ownership never means platform-wide access. Only an explicit server-owned flag does. */
export async function businessScope(auth) {
  if (auth?.profile?.role !== 'admin') return { operator: false, ids: [], names: [] };
  if (auth.profile.is_operator === true) return { operator: true, ids: [], names: [] };
  const { data, error } = await supabase.from('businesses').select('id,name').eq('owner_user_id', auth.user.id);
  if (error) throw error;
  return { operator: false, ids: (data || []).map((b) => b.id), names: (data || []).map((b) => b.name) };
}
export function canAccessBusiness(scope, businessId) {
  return scope?.operator === true || (businessId != null && scope?.ids?.some((id) => String(id) === String(businessId)) === true);
}
// Legacy callers/tests: no implicit privilege for an empty list.
export function canOperateOn(ownedNames, resourceName, operator = false) {
  return operator === true || (Array.isArray(ownedNames) && ownedNames.some((n) => String(n).toLowerCase() === String(resourceName || '').toLowerCase()));
}
export async function ownedBusinessNames(userId) {
  const { data, error } = await supabase.from('businesses').select('name').eq('owner_user_id', userId);
  if (error) throw error;
  return (data || []).map((b) => b.name).filter(Boolean);
}
