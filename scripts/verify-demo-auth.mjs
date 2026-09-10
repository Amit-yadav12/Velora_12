// Demo-auth verification — loads the REAL signInDemo helper through a Vite
// dev-server module graph (ssrLoadModule) so import.meta.env, the supabase
// client and the demo profiles resolver run exactly as in the app.
// Asserts the race-proof guarantees: canonical demo sessions, canonical roles,
// and that a stale stored profile row can never demote the demo admin.
// Not shipped to production; a dev-only verification script.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.document = dom.window.document;
try { globalThis.navigator = dom.window.navigator; } catch { /* node has a global navigator — fine */ }

const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { createServer } = await import('vite');
const server = await createServer({
  root: ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
});

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

try {
  const demoAuth = await server.ssrLoadModule('/src/lib/demoAuth.ts');
  const supabaseMod = await server.ssrLoadModule('/src/lib/supabase.js');
  const supabase = supabaseMod.default;
  const PROFILES_KEY = 'velora-demo-profiles';
  const readRole = async () => {
    const { data } = await supabase.from('profiles').select('*').single();
    return data?.role;
  };

  console.log('\n—— Demo auth: one-click business console ——');

  // 1) signInDemo('admin') → live session for admin@velora.ai with role=admin.
  localStorage.clear();
  await demoAuth.signInDemo('admin');
  let session = (await supabase.auth.getSession()).data.session;
  ok(
    'signInDemo(admin) → admin@velora.ai session',
    session?.user?.email === 'admin@velora.ai',
    `got ${session?.user?.email}`,
  );
  ok('admin profile resolves with role=admin', (await readRole()) === 'admin', `got ${await readRole()}`);

  // 2) A stale stored profile with role=customer can NEVER demote the demo
  //    admin after re-sign-in — the canonical role wins over stored rows.
  const stored = JSON.parse(localStorage.getItem(PROFILES_KEY) || '[]');
  const corrupted = stored.map((r) => (r.email === 'admin@velora.ai' ? { ...r, role: 'customer' } : r));
  localStorage.setItem(PROFILES_KEY, JSON.stringify(corrupted));
  await supabase.auth.signOut();
  await demoAuth.signInDemo('admin');
  ok('stale stored role=customer cannot demote the demo admin', (await readRole()) === 'admin', `got ${await readRole()}`);

  // 3) signInDemo('customer') → customer@velora.ai with role=customer.
  await supabase.auth.signOut();
  await demoAuth.signInDemo('customer');
  session = (await supabase.auth.getSession()).data.session;
  ok(
    'signInDemo(customer) → customer@velora.ai with role=customer',
    session?.user?.email === 'customer@velora.ai' && (await readRole()) === 'customer',
    `email=${session?.user?.email} role=${await readRole()}`,
  );
} finally {
  await server.close();
}

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
