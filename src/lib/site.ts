/**
 * Last-resort origin, used ONLY when there is neither VITE_APP_URL nor a
 * non-local window origin (i.e. local dev). A deployed build always resolves
 * `publicOrigin()` from its own host, so this never leaks into production URLs.
 */
export const LIVE_URL = 'https://velora-ai-in.netlify.app';

function envAppUrl(): string {
  try {
    const v = import.meta.env?.VITE_APP_URL || '';
    return String(v).replace(/\/$/, '');
  } catch {
    return '';
  }
}

/** Public origin for Calendar, share, emails. Localhost falls back to Netlify. */
export function publicOrigin(): string {
  const fromEnv = envAppUrl();
  if (fromEnv) return fromEnv;
  try {
    const o = typeof window !== 'undefined' ? window.location.origin : '';
    if (o && !/localhost|127\.0\.0\.1|0\.0\.0\.0|:5173|:4173/i.test(o)) return o.replace(/\/$/, '');
  } catch { /* ignore */ }
  return LIVE_URL;
}

/**
 * Bare host used where a domain (not an origin) is required — e.g. the UID of
 * a generated .ics file. Derived from the deployment, never hardcoded, so a
 * new domain does not inherit the previous site's identity.
 */
export function canonicalHost(): string {
  try {
    const o = typeof window !== 'undefined' ? window.location?.hostname : '';
    if (o && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(o)) return o;
  } catch { /* ignore */ }
  try {
    return new URL(publicOrigin()).hostname;
  } catch {
    return 'velora.local';
  }
}

/** Origin for QR / verify — must match the host that holds the booking. */
export function ticketOrigin(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin.replace(/\/$/, '');
  } catch { /* ignore */ }
  return publicOrigin();
}
