import { createClient } from '@supabase/supabase-js';
import { triggerRestore } from './db-wake.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/**
 * Is a REAL database configured? Deployments and local previews without
 * credentials (e.g. the dev middleware's placeholder `https://demo.local`)
 * must not fire doomed DNS requests: every handler already has a synthetic /
 * preview fallback, and a network failure only produces noisy, misleading
 * "fetch failed" logs plus pointless retries.
 */
export function isDatabaseConfigured() {
  if (!supabaseUrl || !serviceKey) return false;
  let host = '';
  try { host = new URL(supabaseUrl).hostname; } catch { return false; }
  if (/(^|\.)local$/i.test(host) || host === 'demo.local') return false;
  if (/^(demo|test|placeholder|changeme)$/i.test(serviceKey)) return false;
  return true;
}

/** Configured-but-unreachable databases still trigger the wake/restore path. */
const dbFetch = async (url, options) => {
  const res = await fetch(url, options);
  if (!res.ok && res.status >= 500) triggerRestore();
  return res;
};

/**
 * Preview fetch: resolves with an explicit "not configured" error response
 * instead of throwing. Supabase clients translate it into `{ data: null,
 * error }` exactly like a real outage, so handlers take their existing
 * fallback path — deterministically, offline, and without console noise.
 */
const previewFetch = async () =>
  new Response(
    JSON.stringify({ message: 'Database not configured in this environment — Velora is serving the preview/synthetic dataset.' }),
    { status: 503, headers: { 'content-type': 'application/json' } },
  );

const supabase = createClient(supabaseUrl || 'https://not-configured.invalid', serviceKey || 'not-configured', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: isDatabaseConfigured() ? dbFetch : previewFetch },
});

export default supabase;
