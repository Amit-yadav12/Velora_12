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
import supabase, { isDemoMode } from './supabase';
import { apiSend } from './api';

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

/**
 * Sign into a canonical demo account, provisioning it on first use.
 * Returns the demo email once a live session exists. Throws on hard failures
 * (rate limits, locked accounts, unreachable auth) so callers can surface a
 * fallback instead of silently landing on the wrong experience.
 */
export async function signInDemo(
  role: DemoRole,
  onProgress?: (p: DemoProgress) => void,
): Promise<{ email: string }> {
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
  if (!isDemoMode) {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) {
      onProgress?.({ step: 'profile', message: 'Preparing your profile…' });
      await supabase
        .from('profiles')
        .upsert({ id: uid, email, full_name: demoNameFor(role) })
        .then(() => undefined, () => undefined); // profile row is cosmetic; role comes from the server
    }
    if (role === 'admin') {
      onProgress?.({ step: 'provision', message: 'Granting console access…' });
      try {
        await apiSend('/api/provision-demo', 'POST', { email });
      } catch {
        // Server keeps control of the role; if the grant is unavailable the
        // account simply stays customer-level — never escalated client-side.
      }
    }
  }

  return { email };
}
