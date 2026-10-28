// An incomplete live deployment must fail closed, not turn into a demo.
export function classifySupabaseConfig(url, key) {
  if (!url && !key) return { demo: true, validUrl: false, error: '' };
  let validUrl = false;
  try { validUrl = !!url && ['https:', 'http:'].includes(new URL(url).protocol); } catch { /* invalid URL */ }
  return {
    demo: false,
    validUrl,
    error: !validUrl || !key
      ? 'Live configuration is incomplete. Set a valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy.'
      : '',
  };
}
