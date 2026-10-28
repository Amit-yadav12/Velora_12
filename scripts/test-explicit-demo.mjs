// Exercise the deployed configuration boundary with a configured-looking URL,
// while intercepting every network request. No live project is contacted.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

process.env.VITE_SUPABASE_URL = 'https://example.invalid';
process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
sessionStorage.setItem('velora-explicit-demo', '1');
localStorage.setItem('sb-live-auth-token', 'live-session-must-survive');
let requests = 0;
globalThis.fetch = async () => { requests++; throw new Error('Unexpected network request in demo'); };
const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const supabaseMod = await server.ssrLoadModule('/src/lib/supabase.js');
  const auth = await server.ssrLoadModule('/src/lib/demoAuth.ts');
  const api = await server.ssrLoadModule('/src/lib/api.ts');
  const store = await server.ssrLoadModule('/src/lib/demoStore.ts');
  const hybrid = await server.ssrLoadModule('/src/lib/hybridData.ts');
  assert.equal(supabaseMod.isDemoMode, true);
  assert.equal(supabaseMod.isExplicitDemo, true);
  assert.equal(supabaseMod.supabaseConfigError, '');
  await auth.signInDemo('customer');
  assert.equal((await supabaseMod.default.auth.getSession()).data.session.user.email, 'customer@velora.ai');
  await assert.rejects(api.apiSend('/api/book', 'POST', {}), /unavailable in the device-local demo/);
  await assert.rejects(api.apiGet('/api/my-bookings'), /unavailable in the device-local demo/);
  store.ensureDemoSeeded();
  const found = await hybrid.fetchDiscover({ city: 'Jaipur', lat: 26.9124, lng: 75.7873, sort: 'ai', includeLive: true });
  assert.ok(found.results.some((b) => String(b.id).startsWith('demo-biz-')));
  assert.equal(await hybrid.fetchBusiness('987654321', 'Jaipur'), null);
  assert.equal(requests, 0, 'demo discovery and blocked writes must not call the live API');
  await supabaseMod.default.auth.signOut();
  assert.equal(localStorage.getItem('sb-live-auth-token'), 'live-session-must-survive');
  await auth.signInDemo('admin');
  assert.equal((await supabaseMod.default.auth.getSession()).data.session.user.email, 'admin@velora.ai');
  console.log('Explicit demo: configured-project isolation, customer/business identities and live-session preservation passed.');
} finally { await server.close(); dom.window.close(); }
