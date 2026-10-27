import supabase from '../db-client.js';

// Verify the Supabase access token from the Authorization header.
// Returns { user, profile } or null. Used to protect API routes + enforce RBAC.
export async function getAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { user, profile: profile || null };
}

/**
 * Names of the businesses a caller OWNS. The console uses a single 'admin'
 * role for both the platform operator and every business owner, so object-level
 * authorization has to come from ownership, not from the role name alone.
 * Returns [] when the caller owns nothing (platform/demo operator).
 */
export async function ownedBusinessNames(userId) {
  if (!userId) return [];
  try {
    const { data } = await supabase.from('businesses').select('name').eq('owner_user_id', userId);
    return Array.isArray(data) ? data.map((b) => b.name).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * May this caller operate on a booking for `resourceName`? Owners are limited
 * to their own businesses; a caller who owns no business is the platform
 * operator and may act across the estate. Ownership is resolved server-side
 * from the database — never from a client-supplied business id.
 */
export function canOperateOn(ownedNames, resourceName) {
  if (!Array.isArray(ownedNames) || ownedNames.length === 0) return true; // platform operator
  return ownedNames.some((n) => String(n).toLowerCase() === String(resourceName || '').toLowerCase());
}

export function requireRole(auth, roles) {
  if (!auth) return { ok: false, status: 401, error: 'Authentication required' };
  const role = auth.profile?.role || 'customer';
  if (roles && !roles.includes(role)) return { ok: false, status: 403, error: 'Insufficient permissions' };
  return { ok: true, role };
}
