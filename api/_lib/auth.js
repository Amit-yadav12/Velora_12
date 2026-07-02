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

export function requireRole(auth, roles) {
  if (!auth) return { ok: false, status: 401, error: 'Authentication required' };
  const role = auth.profile?.role || 'customer';
  if (roles && !roles.includes(role)) return { ok: false, status: 403, error: 'Insufficient permissions' };
  return { ok: true, role };
}
