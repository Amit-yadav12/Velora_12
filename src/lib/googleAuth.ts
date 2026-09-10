import supabase, { isDemoMode } from './supabase';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function buildCustomGoogleUrl(appName: string) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!clientId || !redirectUri) return null;
  const state = btoa(JSON.stringify({ origin: window.location.origin, appName, supabaseUrl, supabaseAnonKey }));
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
}

/**
 * Native Google OAuth via Supabase — primary method.
 * Uses Supabase Auth's built-in OAuth flow. Requires Google provider enabled in Supabase dashboard.
 * Falls back to custom proxy if native fails or is not configured.
 */
export async function signInWithGoogleNative(nextPath = '/') {
  // Demo mode: simulate Google login instantly
  if (isDemoMode) {
    const email = 'customer@velora.ai';
    const { error } = await supabase.auth.signInWithPassword({ email, password: 'velora123' });
    if (error) {
      // Demo auto-provision
      await supabase.auth.signUp({ email, password: 'velora123', options: { data: { full_name: 'Demo Customer' } } });
    }
    return { ok: true, method: 'demo' };
  }

  try {
    const redirectTo = `${window.location.origin}/welcome?next=${encodeURIComponent(nextPath)}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) throw error;
    return { ok: true, method: 'native' };
  } catch (err: any) {
    console.warn('[google-auth] native OAuth failed, trying custom proxy fallback:', err.message);
    // Fallback to custom proxy if configured
    const customUrl = buildCustomGoogleUrl('Velora');
    if (customUrl) {
      return signInWithGoogleCustom('Velora');
    }
    throw err;
  }
}

/**
 * Custom proxy OAuth — fallback method.
 * Opens popup to Google OAuth via custom proxy that exchanges code for Supabase session.
 */
export function signInWithGoogleCustom(appName = 'Velora') {
  const url = buildCustomGoogleUrl(appName);
  if (!url) {
    console.warn('[google-auth] Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_AUTH_PROXY');
    return { ok: false, error: 'Google OAuth not configured' };
  }
  window.open(url, 'google-auth', isMobile() ? '' : 'width=500,height=600');
  const handler = async (event: MessageEvent) => {
    if (event.data?.type === 'google-auth-denied') {
      window.removeEventListener('message', handler);
      return;
    }
    if (event.data?.type !== 'google-auth-success') return;
    window.removeEventListener('message', handler);
    try {
      if (event.data.access_token && event.data.refresh_token) {
        await supabase.auth.setSession({
          access_token: event.data.access_token,
          refresh_token: event.data.refresh_token,
        });
      } else if (event.data.id_token) {
        await supabase.auth.signInWithIdToken({ provider: 'google', token: event.data.id_token });
      }
    } catch (e) {
      console.error('[google-auth] session set failed', e);
    }
  };
  window.addEventListener('message', handler);
  return { ok: true, method: 'custom-proxy' };
}

// Legacy export for backward compatibility — tries native first, then custom
export function signInWithGoogle(appName = 'Velora') {
  // Try native OAuth first (non-blocking, redirects)
  signInWithGoogleNative('/').catch(() => {
    // If native fails, try custom proxy
    signInWithGoogleCustom(appName);
  });
}

export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('google_id_token');
  if (!token) return;
  window.history.replaceState({}, '', window.location.pathname);
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
  if (error) {
    console.error('[google-auth]', error.message);
    return;
  }
  try {
    window.close();
  } catch {
    /* popup may be blocked */
  }
}
