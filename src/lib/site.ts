function envAppUrl(): string {
  try { return String(import.meta.env?.VITE_APP_URL || '').replace(/\/$/, ''); }
  catch { return ''; }
}

/** Use this deployment's configured or actual origin; never a historical site. */
export function publicOrigin(): string {
  const configured = envAppUrl();
  if (configured) return configured;
  try { return typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''; }
  catch { return ''; }
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
