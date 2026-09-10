/** Canonical live site (Netlify). */
export const LIVE_URL = 'https://velora-ai-in.netlify.app';

function envAppUrl(): string {
  try {
    const v = (import.meta as any)?.env?.VITE_APP_URL || '';
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

/** Origin for QR / verify — must match the host that holds the booking. */
export function ticketOrigin(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin.replace(/\/$/, '');
  } catch { /* ignore */ }
  return publicOrigin();
}
