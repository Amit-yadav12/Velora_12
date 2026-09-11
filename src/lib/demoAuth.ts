// Shared demo sign-in helper — the single client-side path into the two public
// demo identities (customer@velora.ai / admin@velora.ai, password velora123).
//
// Race-proofing principles:
//  - Never writes a `role` column client-side. Roles are granted server-side:
//    /api/provision-demo (allowlisted demo identities) in production, or the
//    demo-mode profiles resolver (canonical roles) in demo mode.
//  - Profile upserts carry only {id, email, full_name}, so a client write can
//    never clobber (or escalate) a server role grant.
//  - Callers must `await refresh()` (AuthContext) after this resolves, so the
//    very next render already sees the settled session + profile.
//
// FAILURE VISIBILITY: the console role grant is never swallowed. A failed grant
// returns `provision.ok === false` with a status and a human hint, so the UI can
// tell the operator *why* the business demo did not open (missing schema vs.
// missing credentials vs. rotated key) instead of silently bouncing into the
// customer app with no explanation.
import supabase, { isDemoMode } from './supabase';
import { apiSend, ApiError } from './api';

export type DemoRole = 'admin' | 'customer';

export const DEMO_PASSWORD = 'velora123';

export const demoEmailFor = (role: DemoRole): string =>
  role === 'admin' ? 'admin@velora.ai' : 'customer@velora.ai';

export const demoNameFor = (role: DemoRole): string =>
  role === 'admin' ? 'Demo Admin' : 'Demo Customer';

const INVALID_LOGIN = /invalid login|user not found|invalid.*credentials/i;
const ALREADY_REGISTERED = /already registered/i;

export interface DemoProgress {
  step: 'signin' | 'signup' | 'profile' | 'provision';
  message: string;
}

export interface DemoProvision {
  ok: boolean;
  /** HTTP status from /api/provision-demo, when the call completed. */
  status?: number;
  /** Raw server message, when one was returned. */
  error?: string;
  /** What to actually do about it — deployment-facing, not customer-facing. */
  hint?: string;
}

export interface DemoSignInResult {
  email: string;
  role: DemoRole;
  /** Present only for the admin identity on a real (non-demo) deployment. */
  provision?: DemoProvision;
}

/**
 * Map a provisioning failure onto the deployment step that fixes it. These are
 * the three ways a fresh Supabase project leaves the business demo closed.
 */
export function provisionHint(status: number | undefined, error: string | undefined): string {
  const e = String(error || '').toLowerCase();
  if (status === 409 || e.includes('sign up first') || e.includes('relation') && e.includes('does not exist')) {
    return 'The profiles table is missing or empty — run supabase/APPLY_ALL.sql in the Supabase SQL Editor, then retry.';
  }
  if (status === 503 || e.includes('not configured') || e.includes('database')) {
    return 'The function has no database credentials — set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the host, then redeploy.';
  }
  if (status === 401 || status === 403 || e.includes('jwt') || e.includes('apikey')) {
    return 'The service-role key was rejected — rotate/update SUPABASE_SERVICE_ROLE_KEY (Settings → API) and redeploy.';
  }
  if (status === 429) return 'Too many provisioning attempts — wait a minute and try again.';
  return 'Console access could not be granted automatically. Re-run supabase/PROMOTE_ADMIN.sql for this email, then sign in again.';
}

/**
 * Sign into a canonical demo account, provisioning it on first use.
 * Returns the demo email plus the outcome of the server-side role grant.
 * Throws on hard failures (rate limits, locked accounts, unreachable auth) so
 * callers can surface a fallback instead of silently landing on the wrong
 * experience.
 */
export async function signInDemo(
  role: DemoRole,
  onProgress?: (p: DemoProgress) => void,
): Promise<DemoSignInResult> {
  const email = demoEmailFor(role);
  const password = DEMO_PASSWORD;

  // 1) Try the canonical credentials first.
  onProgress?.({ step: 'signin', message: 'Signing into the demo account…' });
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && INVALID_LOGIN.test(error.message)) {
    // Not provisioned on this deployment yet → create it, then sign in again.
    onProgress?.({ step: 'signup', message: 'Provisioning the demo account…' });
    const { error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: demoNameFor(role) } },
    });
    if (signUpErr && !ALREADY_REGISTERED.test(signUpErr.message)) throw signUpErr;
    const { error: reSignInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (reSignInErr) throw reSignInErr;
  } else if (error) {
    throw error;
  }

  // 2) Real (non-demo) deployments: make sure the profiles row exists — but
  //    WITHOUT a role column. The admin role is granted exclusively by the
  //    server (/api/provision-demo, strictly allowlisted); in demo mode the
  //    profiles resolver enforces canonical roles locally.
  if (isDemoMode) return { email, role };

  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  let profileMissing = false;
  if (uid) {
    onProgress?.({ step: 'profile', message: 'Preparing your profile…' });
    // Cosmetic row only — role still comes from the server. A failure here is
    // recorded, not thrown: /api/provision-demo reports the actionable cause.
    try {
      await supabase.from('profiles').upsert({ id: uid, email, full_name: demoNameFor(role) });
    } catch {
      profileMissing = true;
    }
  }

  if (role !== 'admin') return { email, role };

  onProgress?.({ step: 'provision', message: 'Granting console access…' });
  try {
    const res = await apiSend<{ ok?: boolean; role?: string }>('/api/provision-demo', 'POST', { email });
    if (res?.ok) return { email, role, provision: { ok: true, status: 200 } };
    const hint = provisionHint(200, 'unexpected provisioning response');
    return { email, role, provision: { ok: false, status: 200, hint } };
  } catch (e: unknown) {
    const status = e instanceof ApiError ? e.status : undefined;
    const error = e instanceof Error ? e.message : String(e);
    // Reported, never thrown: the customer experience still works, and the
    // account is never escalated client-side. The caller decides how loud to be.
    return {
      email,
      role,
      provision: {
        ok: false,
        status,
        error,
        hint: profileMissing && status === undefined
          ? 'The profiles table is missing or empty — run supabase/APPLY_ALL.sql in the Supabase SQL Editor, then retry.'
          : provisionHint(status, error),
      },
    };
  }
}
