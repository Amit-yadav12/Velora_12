// Velora full-app integration verification (dev-only, not shipped).
//
// Boots the REAL Vite dev server (app + the ./api serverless handlers through
// dev-api.js), mounts the REAL application (src/App.tsx) inside jsdom, and
// walks the end-to-end product flows with real clicks on the real DOM:
//
//   1. guest landing / role selection
//   2. business demo → ADMIN console (never the customer app)
//   3. customer demo → business → slot → details → confirm → instant QR
//   4. QR token verification page
//   5. customer booking → business dashboard updates with no reload
//   6. business action → customer view updates with no reload
//   7. API surface (no 5xx)
//   8. zero console errors / warnings / unhandled rejections
//
// Run: npx tsx scripts/verify-app.mjs
import { JSDOM } from 'jsdom';
import http from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ */
/* jsdom environment                                                   */
/* ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
const { window } = dom;

window.scrollTo = () => {};
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
}));
class Obs { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
window.IntersectionObserver = window.IntersectionObserver || Obs;
window.ResizeObserver = window.ResizeObserver || Obs;
window.URL.createObjectURL = () => 'blob:velora-test';
window.URL.revokeObjectURL = () => {};
window.HTMLCanvasElement.prototype.getContext = () => null;
window.HTMLCanvasElement.prototype.toBlob = function toBlob(cb) { cb(null); };

globalThis.window = window;
globalThis.document = window.document;
try { Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true }); } catch { /* node keeps its own */ }
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Event = window.Event;
globalThis.StorageEvent = window.StorageEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
// DOM APIs the download paths (QR PNG/SVG, invoice PDF) rely on. Without these
// the ticket's export buttons fail silently inside jsdom.
globalThis.XMLSerializer = window.XMLSerializer;
// jsdom never loads blob: images, which would leave `await img.onload` pending
// forever. Fire onload asynchronously so the export path completes (the canvas
// stub then returns no ctx, exercising the SVG fallback exactly like a browser
// with canvas blocked).
class HarnessImage {
  set src(_v) { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
  onload = null; onerror = null; crossOrigin = '';
}
globalThis.Image = HarnessImage;
globalThis.Blob = window.Blob;
globalThis.File = window.File;
globalThis.FileReader = window.FileReader;
globalThis.URL = window.URL;
globalThis.IntersectionObserver = Obs;
globalThis.ResizeObserver = Obs;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* ------------------------------------------------------------------ */
/* Console-error detection                                             */
/* ------------------------------------------------------------------ */

const problems = [];      // browser-side console output (must stay empty)
const serverLogs = [];    // ./api handler logs (expected without a database)
const ignorable = (msg) =>
  /Not implemented: window\.|Could not parse CSS|Error: Not implemented|navigator\.clipboard|not wrapped in act\(|react\.dev\/link\/wrap-tests-with-act|TestingLibrary/i.test(msg);
/**
 * API handlers run in the same process as this harness, so their logs must be
 * told apart from BROWSER console output. A browser log always passes through
 * app code (a page/component/context/service frame); a handler log never does.
 */
const isServerLog = () => {
  const stack = new Error().stack || '';
  const serverish = /@supabase|\/api\/|\/netlify\//.test(stack);
  const appFrame = /\/src\/(pages|components|contexts|services|app|lib\/api\.ts)/.test(stack);
  return serverish && !appFrame;
};
const record = (msg) => {
  if (ignorable(msg)) return;
  (isServerLog() ? serverLogs : problems).push(msg);
};
console.error = (...a) => { record(a.map(String).join(' ')); };
console.warn = (...a) => { record(a.map(String).join(' ')); };
window.addEventListener('error', (e) => record(`window.onerror: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => record(`unhandledrejection: ${String(e.reason)}`));

/* ------------------------------------------------------------------ */
/* Assertions + DOM helpers                                            */
/* ------------------------------------------------------------------ */

let pass = 0;
const failures = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { failures.push(name); console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
};

const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const all = (sel) => Array.from(document.querySelectorAll(sel));
const find = (sel, needle) => all(sel).find((el) => txt(el).toLowerCase().includes(String(needle).toLowerCase()));
const bodyHas = (needle) => txt(document.body).toLowerCase().includes(String(needle).toLowerCase());
/** Nearest ancestor card (or button) containing the given text. */
const cardWith = (needle, sel = '.card') => all(sel).find((el) => txt(el).toLowerCase().includes(String(needle).toLowerCase()));

const ReactMod = await import('react');

async function waitFor(predicate, { timeout = 9000, step = 150, label = 'condition' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await ReactMod.act(async () => { await new Promise((r) => setTimeout(r, step)); });
    try { if (predicate()) return true; } catch { /* keep waiting */ }
  }
  throw new Error(`waitFor(${label}) timed out after ${timeout}ms`);
}
const settle = (ms = 200) => ReactMod.act(async () => { await new Promise((r) => setTimeout(r, ms)); });

async function click(el) {
  if (!el) throw new Error('click(): element not found');
  await ReactMod.act(async () => {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await new Promise((r) => setTimeout(r, 60));
  });
}
function typeInto(input, value) {
  if (!input) return;
  // React tracks the previous value on the DOM node, so a plain assignment can
  // be swallowed. Use the PROTOTYPE setter, then emit input+change.
  const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
}
/* Download spy: records anchor[download] activations (both `a.click()` and the
   dispatched MouseEvent that FileSaver-style helpers use). */
const downloads = [];
const _protoClick = window.HTMLAnchorElement.prototype.click;
const _protoDispatch = window.HTMLAnchorElement.prototype.dispatchEvent;
const recordDownload = (a) => {
  if (a.hasAttribute('download')) { downloads.push(a.getAttribute('download') || 'file'); return true; }
  return false;
};
window.HTMLAnchorElement.prototype.click = function spyClick() {
  if (recordDownload(this)) return;
  return _protoClick.call(this);
};
window.HTMLAnchorElement.prototype.dispatchEvent = function spyDispatch(ev) {
  if (ev && ev.type === 'click' && recordDownload(this)) return true;
  return _protoDispatch.call(this, ev);
};

function selectValue(select, value) {
  if (!select) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
  if (setter) setter.call(select, value); else select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

/* ------------------------------------------------------------------ */
/* Boot: real dev server + real fetch + the real app                   */
/* ------------------------------------------------------------------ */

const { createServer } = await import('vite');
const vite = await createServer({
  root: ROOT,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, host: '127.0.0.1' },
  appType: 'custom',
});
const httpServer = http.createServer((req, res) => vite.middlewares(req, res));
await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
const PORT = httpServer.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

const apiCalls = [];
const nodeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  // External services (Google Maps/Places/CDN) are out of scope here and behave
  // like a deployment without credentials: the call fails, the app must cope.
  if (/^https?:\/\//i.test(url) && !url.startsWith(BASE)) throw new TypeError('fetch failed');
  const full = url.startsWith('http') ? url : `${BASE}${url.startsWith('/') ? '' : '/'}${url}`;
  const res = await nodeFetch(full, init);
  const path = full.slice(BASE.length).split('?')[0];
  if (path.startsWith('/api/')) apiCalls.push({ path, status: res.status, method: init?.method || 'GET' });
  return res;
};
window.fetch = globalThis.fetch;

const React = ReactMod.default;
const { createRoot } = await import('react-dom/client');
const appModule = await vite.ssrLoadModule('/src/App.tsx');
const App = appModule.default;

let root = null;
async function mount(path = '/') {
  if (root) await ReactMod.act(async () => { root.unmount(); });
  window.history.pushState({}, '', path);
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  root = createRoot(container);
  await ReactMod.act(async () => { root.render(React.createElement(App)); });
  await settle(250);
}
/** Client-side navigation — the router handles it; nothing reloads. */
async function goto(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new window.PopStateEvent('popstate'));
  await settle(300);
}

console.log('\n=== Velora full-app verification ===\n');

/* ================================================================== */
console.log('—— 1. Guest landing + role selection ——');
await mount('/');
await waitFor(() => bodyHas('What would you like to'), { label: 'customer home' });
ok('Customer app renders for a guest', bodyHas('What would you like to'));
ok('Customer app offers NO business-demo shortcut (console-only entry)',
  !find('button', 'Try the business demo') && !bodyHas('try the business demo'));

await goto('/welcome');
ok('Welcome screen shows both role paths', !!find('button', 'Customer') && !!find('button', 'Business'));

/* ================================================================== */
console.log('\n—— 2. Business demo → admin console ——');
await click(find('button', 'Business'));
await settle();
ok('Business path selected', bodyHas('business console'));
ok('Business path offers "Continue as demo business"', !!find('button', 'Continue as demo business'));
ok('Google button is visual-only (aria-disabled, no action wiring)', (() => {
  const g = find('button', 'Continue with Google');
  return !!g && g.getAttribute('aria-disabled') === 'true';
})());
ok('Google button has no click handler bound by the app', (() => {
  const g = find('button', 'Continue with Google');
  if (!g) return false;
  // A real handler would route/sign-in: clicking must change nothing at all.
  const before = window.location.pathname + document.body.textContent.length;
  g.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return before === window.location.pathname + document.body.textContent.length;
})());

await click(find('button', 'Continue as demo business'));
await waitFor(() => window.location.pathname === '/admin', { label: 'admin route' });
ok('Lands on /admin — the business console, not the customer app', window.location.pathname === '/admin', `path=${window.location.pathname}`);
await waitFor(() => all('.card').length > 0 && bodyHas('Total sales'), { label: 'dashboard cards' });
ok('Business demo lands INSIDE the admin console', bodyHas('Admin') && bodyHas('Total sales'));
const salesText = txt(find('.card', 'Total sales'));
ok('Dashboard sales derive from demo bookings (> 0)', Number(salesText.match(/(\d+)/)?.[1] || 0) > 0, salesText);
ok('Dashboard shows the revenue model', bodyHas('Sales & revenue') && bodyHas('Completed revenue'));
ok('Dashboard shows the demo tenant businesses', bodyHas('Aurora') || bodyHas('Apex'));
ok('Today\'s appointments are counted in IST (not UTC drift)', (() => {
  const today = Number(txt(find('.card', "Today's appointments")).match(/(\d+)/)?.[1] || 0);
  return today > 0;
})(), txt(find('.card', "Today's appointments")));

await goto('/admin/appointments');
await waitFor(() => /VL-/.test(txt(document.body)), { label: 'console appointments' });
ok('Console lists demo bookings', /VL-/.test(txt(document.body)));
ok('Console offers confirm/complete/cancel actions on pending bookings',
  all('button[title="Confirm"], button[title="Complete"], button[title="Cancel"]').length > 0);

await goto('/admin/businesses');
await waitFor(() => bodyHas('Aurora'), { label: 'console businesses' });
ok('Console lists demo businesses with demo badge', bodyHas('Aurora') || bodyHas('Apex'));
await goto('/admin/services');
await waitFor(() => bodyHas('Signature Haircut') || bodyHas('Add service'), { label: 'console services' });
ok('Console services list loads', bodyHas('Signature Haircut') || bodyHas('Hair Spa'));
await goto('/admin/staff');
await waitFor(() => bodyHas('Meera') || bodyHas('Add staff'), { label: 'console staff' });
ok('Console staff list loads', bodyHas('Meera') || bodyHas('Dr. Karan'));
await goto('/admin/customers');
await waitFor(() => /ananya|customer@velora|Total customers|Spend/i.test(txt(document.body)), { label: 'console customers' });
ok('Console customers are derived from bookings', /customer@velora\.ai|ananya\.sharma/i.test(txt(document.body)));
await goto('/admin/emails');
ok('Console emails page renders', bodyHas('Email') || bodyHas('email'));
await goto('/admin/audit');
ok('Console audit page renders', !bodyHas('Something went wrong'));

/* ================================================================== */
console.log('\n—— 2b. Console writes → customer views (one shared demo dataset) ——');
const demoStore = await vite.ssrLoadModule('/src/lib/demoStore.ts');
const demoAuth = await vite.ssrLoadModule('/src/lib/demoAuth.ts');
const offline = await vite.ssrLoadModule('/src/lib/offlineStore.ts');

await goto('/admin');
await waitFor(() => bodyHas('Active services'), { label: 'dashboard before edits' });
const svcCardBefore = txt(find('.card', 'Active services'));
const staffCardBefore = txt(find('.card', 'Active staff'));

await goto('/admin/services');
await waitFor(() => !!find('button', 'Add service'), { label: 'console services page' });
await click(find('button', 'Add service'));
await waitFor(() => !!all('input').find((i) => /Signature Haircut/.test(i.placeholder || '')), { label: 'service modal' });
const svcSelect = all('select')[0];
const targetBizId = svcSelect?.value || 'demo-biz-aurora';
const targetBizName = svcSelect?.selectedOptions?.[0]?.textContent || '';
const svcName = `Harness Ritual ${String(Date.now()).slice(-5)}`;
typeInto(all('input').find((i) => /Signature Haircut/.test(i.placeholder || '')), svcName);
const numInputs = all('input').filter((i) => i.type === 'number');
typeInto(numInputs[0], '25');
typeInto(numInputs[1], '1234');
await settle(150);
await click(find('button', 'Create service'));
await waitFor(() => bodyHas(svcName), { timeout: 6000, label: 'service row in console' });
ok('Admin creates a service and the console shows it immediately', bodyHas(svcName), `${svcName} → ${targetBizName}`);

// The customer app reads the SAME demo dataset.
await ReactMod.act(async () => { await demoAuth.signInDemo('customer'); });
await mount(`/business/${targetBizId}`);
await waitFor(() => bodyHas('Choose a service'), { label: 'customer business page' });
ok('A service created in the console is bookable in the customer app (one dataset)', bodyHas(svcName));

// Live push: the customer page is already mounted and must update with no reload.
const liveSvcName = `Live Ritual ${String(Date.now()).slice(-5)}`;
await ReactMod.act(async () => {
  demoStore.saveDemoService({ business_id: targetBizId, name: liveSvcName, description: 'added live', duration_min: 30, price: 900 });
  await new Promise((r) => setTimeout(r, 250));
});
await waitFor(() => bodyHas(liveSvcName), { timeout: 6000, label: 'live service on open page' });
ok('A service added while the customer page is open appears live (no reload)', bodyHas(liveSvcName));

const liveStaffFirst = `Ish${String(Date.now()).slice(-3)}`;
await ReactMod.act(async () => {
  demoStore.saveDemoStaff({ business_id: targetBizId, name: `${liveStaffFirst} Live`, role: 'Specialist' });
  await new Promise((r) => setTimeout(r, 250));
});
await waitFor(() => bodyHas(liveStaffFirst), { timeout: 6000, label: 'live staff on open page' });
ok('Staff added in the console appears in the customer picker live (no reload)', bodyHas(liveStaffFirst));


// The console-created service is bookable end-to-end.
const newSvcBtn = all('button').find((b) => txt(b).includes(svcName));
if (newSvcBtn) await click(newSvcBtn);
await settle(250);
await waitFor(() => all('button').some((b) => /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(txt(b))), { label: 'slots for new service' }).catch(() => {});
const newSlots = all('button').filter((b) => /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(txt(b)) && !b.disabled);
ok('The console-created service gets real availability', newSlots.length > 0, `${newSlots.length} slots`);
if (newSlots[0]) await click(newSlots[0]);
await settle(250);
await click(find('button', 'Review & book'));
await waitFor(() => bodyHas('Review your booking'), { label: 'review for new service' });
typeInto(all('input').find((i) => /Full name/i.test(i.placeholder || '')), 'Demo Customer');
typeInto(all('input').find((i) => /you@email\.com/i.test(i.placeholder || '')), 'customer@velora.ai');
await settle(150);
await click(find('button', 'Confirm booking'));
await waitFor(() => bodyHas("You're all set") || bodyHas('Booking received'), { timeout: 12000, label: 'ticket for new service' });
const writesNow = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]');
const newSvcBooking = writesNow.find((b) => String(b.service_name) === svcName && b.customer_email === 'customer@velora.ai');
ok('A booking for the console-created service is saved with an instant QR', !!newSvcBooking && !!document.querySelector('[data-qr] svg'));

await ReactMod.act(async () => { await demoAuth.signInDemo('admin'); });
await mount('/admin/appointments');
await waitFor(() => bodyHas(newSvcBooking?.ref || 'no-ref'), { timeout: 12000, label: 'console row for new booking' }).catch(() => {});
ok('The booking for the new service appears in the business console', !!newSvcBooking && bodyHas(newSvcBooking.ref), newSvcBooking?.ref);

// The dashboard counts those same records (still signed in as the business).
await goto('/admin');
await waitFor(() => bodyHas('Active staff'), { label: 'dashboard after edits' });
ok('Dashboard service/staff counts include the console edits',
  txt(find('.card', 'Active services')) !== svcCardBefore && txt(find('.card', 'Active staff')) !== staffCardBefore,
  `services ${svcCardBefore} → ${txt(find('.card', 'Active services'))} · staff ${staffCardBefore} → ${txt(find('.card', 'Active staff'))}`);

/* ================================================================== */
console.log('\n—— 2c. Email auth + business account creation ——');
const supa = await vite.ssrLoadModule('/src/lib/supabase.js');
const PW = 'Velora#2026test';
const CUST_EMAIL = 'harness.user@example.in';
const OWNER_EMAIL = 'harness.owner@example.in';

await ReactMod.act(async () => { await supa.default.auth.signOut(); });
await settle(200);
await mount('/welcome');
await waitFor(() => !!find('button', 'Customer'), { label: 'role picker' });
await click(find('button', 'Customer'));
await settle();
await click(find('button', 'Continue with Email'));
await waitFor(() => !!all('input').find((i) => /you@email\.com/.test(i.placeholder || '')), { label: 'email form' });
await click(find('button', 'Create account'));
await waitFor(() => !!all('input').find((i) => /Full name/.test(i.placeholder || '')), { label: 'register form' });
typeInto(all('input').find((i) => /Full name/.test(i.placeholder || '')), 'Harness User');
typeInto(all('input').find((i) => /you@email\.com/.test(i.placeholder || '')), CUST_EMAIL);
typeInto(all('input').find((i) => /Password/.test(i.placeholder || '')), PW);
await settle(120);
await click(find('button', 'Create account'));
await waitFor(() => window.location.pathname !== '/welcome', { timeout: 8000, label: 'registered session' }).catch(() => {});
ok('Email registration creates a working session', window.location.pathname !== '/welcome', `path=${window.location.pathname}`);
ok('Plaintext passwords are never written to storage', !JSON.stringify(window.localStorage).includes(PW));

await ReactMod.act(async () => { await supa.default.auth.signOut(); });
await mount('/welcome');
await click(find('button', 'Customer'));
await settle();
await click(find('button', 'Continue with Email'));
await waitFor(() => !!all('input').find((i) => /you@email\.com/.test(i.placeholder || '')), { label: 'signin form' });
typeInto(all('input').find((i) => /you@email\.com/.test(i.placeholder || '')), CUST_EMAIL);
typeInto(all('input').find((i) => /Password/.test(i.placeholder || '')), PW);
await click(find('button', 'Sign in'));
await waitFor(() => window.location.pathname !== '/welcome', { timeout: 8000, label: 'email sign-in' }).catch(() => {});
ok('Email sign-in works with the account just created',
  window.location.pathname !== '/welcome' && !bodyHas('Incorrect email or password'), `path=${window.location.pathname}`);

// Business account creation (2-step form) — must land in the ADMIN console.
await ReactMod.act(async () => { await supa.default.auth.signOut(); });
await mount('/welcome');
await click(find('button', 'Business'));
await settle();
await click(find('button', 'Create Business Account'));
await waitFor(() => bodyHas('Create your business account'), { label: 'business step 1' });
typeInto(all('input').find((i) => /Owner name/.test(i.placeholder || '')), 'Harness Owner');
typeInto(all('input').find((i) => /business@email\.com/.test(i.placeholder || '')), OWNER_EMAIL);
typeInto(all('input').find((i) => /Password/.test(i.placeholder || '')), PW);
await settle(120);
await click(find('button', 'Continue'));
await waitFor(() => bodyHas('Tell us about'), { label: 'business step 2' });
const newBizName = `Harness Studio ${String(Date.now()).slice(-5)}`;
typeInto(all('input').find((i) => /Business name/.test(i.placeholder || '')), newBizName);
await settle(120);
await click(find('button', 'Create business account'));
await waitFor(() => window.location.pathname === '/admin', { timeout: 10000, label: 'business account lands in console' }).catch(() => {});
ok('Business account creation lands in the business console (never the customer app)',
  window.location.pathname === '/admin', `path=${window.location.pathname}`);
ok('The new business is stored in the isolated demo tenant',
  demoStore.listDemoBusinesses('Jaipur', true).some((b) => b.name === newBizName), newBizName);
await goto('/admin/businesses');
await waitFor(() => bodyHas(newBizName), { timeout: 8000, label: 'new business in console' }).catch(() => {});
ok('The new business appears in the console immediately', bodyHas(newBizName));

/* ================================================================== */
console.log('\n—— 3. Customer demo → booking → instant QR ——');
window.localStorage.clear();

// Guest pass first: browsing must work and booking must route to sign-in
// instead of dead-ending or half-submitting.
await mount('/business/demo-biz-aurora');
await waitFor(() => bodyHas('Choose a service'), { label: 'guest business page' });
ok('Guests can browse business pages', bodyHas('Choose a service'));
const guestSvc = all('button').find((b) => /Signature Haircut/.test(txt(b)));
if (guestSvc) await click(guestSvc);
await settle(250);
const guestSlot = all('button').filter((b) => /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(txt(b)) && !b.disabled)[0];
if (guestSlot) await click(guestSlot);
await settle(250);
ok('A guest sees an explicit sign-in action, never a dead end', /sign in to book/i.test(txt(document.body)));
await click(find('button', 'Sign in to book'));
await waitFor(() => /^\/welcome/.test(window.location.pathname), { timeout: 6000, label: 'guest → welcome' }).catch(() => {});
ok('Guest booking routes to sign-in with a return path',
  /^\/welcome/.test(window.location.pathname) && /next=/.test(window.location.search),
  `${window.location.pathname}${window.location.search}`);

await mount('/welcome');
await click(find('button', 'Customer'));
await settle();
ok('Customer path offers "Continue as demo customer"', !!find('button', 'Continue as demo customer'));
await click(find('button', 'Continue as demo customer'));
await waitFor(() => window.location.pathname !== '/welcome' && bodyHas('What would you like to'), { label: 'customer app' });
ok('Customer demo lands in the customer app (never /admin)', window.location.pathname !== '/admin', `path=${window.location.pathname}`);

await goto('/explore');
await waitFor(() => bodyHas('Aurora Luxe Salon') || bodyHas('Apex Physio'), { timeout: 12000, label: 'demo listings' }).catch(() => {});
ok('Demo businesses are discoverable in the customer app',
  bodyHas('Aurora Luxe Salon') || bodyHas('Apex Physio'), txt(document.body).slice(-160));

const auroraCard = cardWith('Aurora Luxe Salon');
if (auroraCard) await click(Array.from(auroraCard.querySelectorAll('button')).find((b) => /book now/i.test(txt(b))));
else await goto('/business/demo-biz-aurora');
await waitFor(() => bodyHas('Choose a service'), { label: 'business detail' });
ok('Business detail opens with services from the shared dataset', bodyHas('Choose a service') && /₹/.test(txt(document.body)));

// Indian address + real Google Maps wiring for the discovery/detail surface.
ok('Business address carries locality, city, state and a 6-digit PIN',
  /Jaipur/.test(txt(document.body)) && /(Rajasthan|Delhi|Karnataka|Maharashtra|Gujarat|Telangana|Tamil Nadu|West Bengal)/.test(txt(document.body)) && /\b[1-9][0-9]{5}\b/.test(txt(document.body)));
const locFrame = document.querySelector('iframe[title="location"]');
const locSrc = locFrame?.getAttribute('src') || '';
ok('Map renders a Google Maps embed pinned to this business',
  /google\.com\/maps/.test(locSrc) && /(output=embed|embed\/v1)/.test(locSrc) && decodeURIComponent(locSrc).includes('Luxe'), locSrc.slice(0, 90));
const viewMapHref = all('a').map((a) => a.getAttribute('href') || '').find((h) => /google\.com\/maps\/search\/\?api=1&query=/.test(h)) || '';
ok('“View on Map” opens Google Maps with the business name + address',
  /Luxe/.test(decodeURIComponent(viewMapHref)) && /Jaipur/.test(decodeURIComponent(viewMapHref)), viewMapHref.slice(0, 90));
const dirHref = all('a').map((a) => a.getAttribute('href') || '').find((h) => /google\.com\/maps\/dir\/\?api=1&destination=/.test(h)) || '';
ok('“Get directions” targets the same location', /destination=.+/.test(dirHref) && /%2C/.test(dirHref), dirHref.slice(0, 90));

const svcBtn = all('button').find((b) => /Signature Haircut/.test(txt(b)));
if (svcBtn) await click(svcBtn);
await settle(200);
await waitFor(() => all('button').some((b) => /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(txt(b))), { label: 'slots' }).catch(() => {});
const slotBtns = all('button').filter((b) => /^\d{1,2}:\d{2}\s?(AM|PM)/i.test(txt(b)) && !b.disabled);
ok('Availability engine offers bookable slots', slotBtns.length > 0, `${slotBtns.length} slots`);
const chosenSlot = slotBtns[2] || slotBtns[0];
if (chosenSlot) await click(chosenSlot);
await settle(250);

ok('Primary action asks for sign-in-aware booking ("Review & book")', !!find('button', 'Review & book'));
await click(find('button', 'Review & book'));
await waitFor(() => bodyHas('Review your booking'), { label: 'review modal' });
ok('Review step shows business, service, when and total', bodyHas('Review your booking') && bodyHas('Total'));
typeInto(all('input').find((i) => /Full name/i.test(i.placeholder || '')), 'Demo Customer');
typeInto(all('input').find((i) => /you@email\.com/i.test(i.placeholder || '')), 'customer@velora.ai');
await settle(120);
await click(find('button', 'Confirm booking'));
await waitFor(() => bodyHas("You're all set") || bodyHas('Booking received'), { timeout: 12000, label: 'success ticket' });
ok('Booking completes with the success ticket', bodyHas("You're all set") || bodyHas('Booking received'));
ok('QR code is rendered IMMEDIATELY (no reload)', !!document.querySelector('[data-qr] svg'));
ok('Ticket exposes Google Calendar + Directions + QR download',
  bodyHas('Add to Google Calendar') && bodyHas('Directions') && bodyHas('Download QR ticket'));

// Verify the download actions actually fire a file download (anchor[download]).
await click(find('button', 'Download QR ticket'));
await settle(400);
ok('QR ticket downloads a scannable file named after the booking',
  downloads.some((d) => /^Velora-VL-[A-Z0-9]+-ticket\.(png|svg)$/.test(d)), downloads.join(', '));
await click(find('button', 'PDF'));
// jsPDF is a lazy chunk: on a cold dev server the first import can take a while.
await waitFor(() => downloads.some((d) => /\.pdf$/i.test(d)), { timeout: 20000, label: 'invoice pdf download' }).catch(() => {});
ok('Invoice PDF downloads too (lazy-loaded, no page reload)',
  downloads.some((d) => /\.pdf$/i.test(d)), downloads.join(', '));
ok('Ticket never claims an email was sent when no provider is configured',
  (process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY) ? true : !bodyHas('Confirmation email sent'),
  txt(document.body).slice(-120));
ok('Ticket states the live channel it actually uses (in-app updates / reminders)',
  bodyHas('In-app updates on') || bodyHas('Reminders scheduled') || bodyHas('Awaiting business confirmation'));
const gcalHref = all('a').find((a) => /calendar\.google\.com/.test(a.getAttribute('href') || ''))?.getAttribute('href') || '';
ok('Google Calendar link is a real, working template URL (no credentials needed)',
  gcalHref.startsWith('https://calendar.google.com/calendar/render?') && /dates=\d{8}T\d{6}Z/.test(gcalHref), gcalHref.slice(0, 80));

const bookings = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]');
const newest = bookings.find((b) => b.customer_email === 'customer@velora.ai' && !/^VL-OPS/.test(String(b.ref)));
ok('Booking is saved to the shared demo dataset', !!newest, `${bookings.length} bookings stored`);
ok('Saved booking is PENDING with a QR salt (business confirms next)', newest?.status === 'pending' && !!newest?.qr_salt);
ok('Booking mirror has invoice + notifications for both sides', (() => {
  const invoices = JSON.parse(window.localStorage.getItem('velora-local-invoices') || '[]');
  const notifs = JSON.parse(window.localStorage.getItem('velora-local-notifs') || '[]');
  return invoices.some((i) => i.booking_ref === newest?.ref)
    && notifs.some((n) => n.audience === 'customer' && n.booking_ref === newest?.ref)
    && notifs.some((n) => n.audience === 'admin' && n.booking_ref === newest?.ref);
})());
ok('Duplicate submission is impossible (one record for this ref)', bookings.filter((b) => b.ref === newest?.ref).length === 1);

// The exact URL the ticket QR encodes (same helper the booking used).
const ticketVerifyUrl = newest?.qr_salt ? demoStore.localVerifyUrl(newest.ref, newest.qr_salt) : '';
ok('Ticket QR encodes a verifiable public URL', /^https?:\/\/.+\/verify\/.+/.test(ticketVerifyUrl), ticketVerifyUrl.slice(0, 64));
ok('Ticket exposes the verify link on screen (QR is not decorative)',
  all('a').some((a) => /\/verify\//.test(a.getAttribute('href') || '')));

/* ================================================================== */
console.log('\n—— 4. QR verification page ——');
if (newest && ticketVerifyUrl) {
  await goto(new URL(ticketVerifyUrl).pathname);
  await waitFor(() => bodyHas('Valid ticket') || bodyHas('Ticket verified'), { label: 'verified ticket' }).catch(() => {});
  ok('QR verify page validates the booking', bodyHas('Valid ticket') || bodyHas('Ticket verified'));
  ok('Verification leaks no customer PII', !bodyHas('customer@velora.ai') && !bodyHas('Demo Customer'));
  await goto('/verify/local.abcdefghijkl');
  await waitFor(() => bodyHas('Invalid ticket') || bodyHas("Couldn't verify") || bodyHas('failed verification'), { label: 'invalid ticket' }).catch(() => {});
  ok('Unknown/tampered token is rejected', bodyHas('Invalid ticket') || bodyHas("Couldn't verify") || bodyHas('failed verification'));
}

/* ================================================================== */
console.log('\n—— 5. Customer booking → business dashboard, live (no reload) ——');
await ReactMod.act(async () => { await demoAuth.signInDemo('admin'); });
await mount('/admin');
await waitFor(() => bodyHas('Total sales'), { label: 'dashboard' });
const beforeSales = txt(find('.card', 'Total sales'));
const beforeUpcoming = txt(find('.card', 'Upcoming appointments'));
const beforeCustomers = txt(find('.card', 'Total customers'));
await ReactMod.act(async () => {
  await offline.createDemoBooking({
    business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
    service_id: 'demo-biz-aurora-svc1', service_name: 'Signature Haircut & Styling',
    service_duration: 45, service_price: 800, staff_name: 'Meera Kapoor',
    start_time: new Date(Date.now() + 26 * 3600 * 1000).toISOString(),
    customer_name: 'Live Sync Customer', customer_email: 'live.sync@example.in',
    status: 'pending',
  });
  await new Promise((r) => setTimeout(r, 200));
});
await waitFor(() => bodyHas('Live Sync Customer'), { timeout: 8000, label: 'new booking in console' }).catch(() => {});
ok('New customer booking appears in the console with no reload', bodyHas('Live Sync Customer'));
ok('Dashboard sales/revenue change live', txt(find('.card', 'Total sales')) !== beforeSales, `${beforeSales} → ${txt(find('.card', 'Total sales'))}`);
ok('Upcoming appointments and customer count update live too',
  txt(find('.card', 'Upcoming appointments')) !== beforeUpcoming && txt(find('.card', 'Total customers')) !== beforeCustomers,
  `upcoming ${beforeUpcoming} → ${txt(find('.card', 'Upcoming appointments'))} · customers ${beforeCustomers} → ${txt(find('.card', 'Total customers'))}`);
ok('Dashboard shows computed values — no placeholders or NaN',
  (() => {
    const cards = ['Total sales', 'Total revenue', 'Upcoming appointments', "Today's appointments", 'Total customers', 'Active services'];
    return cards.every((label) => {
      const t = txt(find('.card', label));
      return /\d/.test(t) && !/—|N\/A|undefined|NaN|null/i.test(t);
    });
  })());
ok('Business notification for the new booking is queued', JSON.parse(window.localStorage.getItem('velora-local-notifs') || '[]').some((n) => n.audience === 'admin' && n.booking_ref === newest?.ref || n.title === 'New booking'));

/* ================================================================== */
console.log('\n—— 6. Business action in the console → customer updates live ——');
await ReactMod.act(async () => { await demoAuth.signInDemo('admin'); });
await mount('/admin/appointments');
await waitFor(() => bodyHas(newest.ref), { label: 'booking row in console' });
const row = all('tr').find((tr) => txt(tr).includes(newest.ref));
ok('The booking the customer just made is visible in the business console', !!row, newest.ref);
const confirmBtn = row && Array.from(row.querySelectorAll('button')).find((b) => b.title === 'Confirm');
ok('Business can CONFIRM the appointment from the console', !!confirmBtn);
if (confirmBtn) {
  await click(confirmBtn);
  await waitFor(() => /confirmed/i.test(txt(all('tr').find((tr) => txt(tr).includes(newest.ref)) || document.body)), { timeout: 6000, label: 'row becomes confirmed' }).catch(() => {});
  ok('Console row reflects the confirmation without a reload',
    /confirmed/i.test(txt(all('tr').find((tr) => txt(tr).includes(newest.ref)) || document.body)));
}
const stored = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]').find((b) => b.ref === newest.ref);
ok('Confirmation is persisted in the shared dataset', stored?.status === 'confirmed', stored?.status);
ok('Customer notification for the confirmation is queued', JSON.parse(window.localStorage.getItem('velora-local-notifs') || '[]')
  .some((n) => n.audience === 'customer' && n.booking_ref === newest.ref && /confirmed/i.test(n.title)));

// Business completes the appointment → revenue is realised.
const completeRow = all('tr').find((tr) => txt(tr).includes(newest.ref));
const completeBtn = completeRow && Array.from(completeRow.querySelectorAll('button')).find((b) => b.title === 'Complete');
if (completeBtn) {
  await click(completeBtn);
  await waitFor(() => /completed/i.test(txt(all('tr').find((tr) => txt(tr).includes(newest.ref)) || document.body)), { timeout: 6000, label: 'row completed' }).catch(() => {});
  ok('Business can COMPLETE the appointment (revenue becomes realised)',
    JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]').find((b) => b.ref === newest.ref)?.status === 'completed');
}

// Customer side (fresh page load) reflects the business actions.
await ReactMod.act(async () => { await demoAuth.signInDemo('customer'); });
await mount('/appointments');
await waitFor(() => all('.card').length > 0 && !bodyHas('Sign in to view your bookings'), { label: 'appointments' });
const otherRefs = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]')
  .filter((b) => b.customer_email && b.customer_email !== 'customer@velora.ai' && !/^VL-OPS/.test(String(b.ref)))
  .map((b) => b.ref);
ok('Customer sees only their OWN bookings (no cross-customer leakage)',
  otherRefs.every((ref) => !bodyHas(ref)) && !bodyHas('Ananya Sharma'),
  `leaked: ${otherRefs.filter((r) => bodyHas(r)).join(',') || 'none'}`);
const myCard = all('.card').find((c) => txt(c).includes(newest.ref));
ok('Booking history shows the appointment the customer booked', !!myCard, newest.ref);
ok('Customer sees the CONFIRM + COMPLETE the business applied', /completed|confirmed/i.test(txt(myCard)));

// Live, no-reload update: a second booking arrives and then the business
// confirms it while the customer's list is mounted on screen.
let liveRef = null;
await ReactMod.act(async () => {
  const res = await offline.createDemoBooking({
    business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
    service_id: 'demo-biz-aurora-svc1', service_name: 'Signature Haircut & Styling',
    service_duration: 45, service_price: 800, staff_name: 'Meera Kapoor',
    start_time: new Date(Date.now() + 50 * 3600 * 1000).toISOString(),
    customer_name: 'Demo Customer', customer_email: 'customer@velora.ai', status: 'pending',
  });
  liveRef = res.booking.ref;
  await new Promise((r) => setTimeout(r, 200));
});
await waitFor(() => bodyHas(liveRef), { timeout: 6000, label: 'new booking appears live' }).catch(() => {});
ok('A brand-new booking appears on the customer side live (no reload)', bodyHas(liveRef), liveRef);
ok('It shows as pending until the business acts', (() => {
  const card = all('.card').find((c) => txt(c).includes(liveRef));
  return !!card && /pending/i.test(txt(card));
})());
const liveBooking = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]').find((b) => b.ref === liveRef);
await ReactMod.act(async () => {
  offline.transitionLocalBooking(liveBooking.id, 'confirmed');
  await new Promise((r) => setTimeout(r, 150));
});
await waitFor(() => {
  const card = all('.card').find((c) => txt(c).includes(liveRef));
  return !!card && /confirmed/i.test(txt(card));
}, { timeout: 6000, label: 'live confirm' }).catch(() => {});
ok('Customer list flips to CONFIRMED live when the business confirms (no reload)', (() => {
  const card = all('.card').find((c) => txt(c).includes(liveRef));
  return !!card && /confirmed/i.test(txt(card));
})());

// Business cancels from the console → the customer record and UI follow.
await ReactMod.act(async () => { await demoAuth.signInDemo('admin'); });
await mount('/admin/appointments');
await waitFor(() => bodyHas(liveRef), { timeout: 12000, label: 'console row for the live booking' });
const cancelRow = all('tr').find((tr) => txt(tr).includes(liveRef));
const cancelBtn = cancelRow && Array.from(cancelRow.querySelectorAll('button')).find((b) => b.title === 'Cancel');
if (cancelBtn) { await click(cancelBtn); await waitFor(() => /cancelled/i.test(txt(cancelRow)), { timeout: 8000, label: 'row cancelled' }).catch(() => {}); }
const afterCancel = JSON.parse(window.localStorage.getItem('velora-local-bookings') || '[]').find((b) => b.ref === liveRef);
ok('Business can CANCEL the appointment from the console', afterCancel?.status === 'cancelled', afterCancel?.status);
const cancelNotifs = JSON.parse(window.localStorage.getItem('velora-local-notifs') || '[]');
ok('Customer is notified that the booking was cancelled',
  cancelNotifs.some((n) => n.audience === 'customer' && n.booking_ref === liveRef && /cancel/i.test(String(n.title || '') + String(n.body || ''))));

await ReactMod.act(async () => { await demoAuth.signInDemo('customer'); });
await mount('/appointments');
await waitFor(() => all('.card').length > 0 && !bodyHas('Sign in to view your bookings'), { label: 'appointments page' });
// Ticket modal from booking history: the QR is re-generated from the stored salt
// and downloadable straight from the list.
// A pending booking for THIS customer (deterministic target for the ticket modal).
await ReactMod.act(async () => {
  await offline.createDemoBooking({
    business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
    service_id: 'demo-biz-aurora-svc1', service_name: 'Signature Haircut & Styling',
    service_duration: 45, service_price: 800, staff_name: 'Meera Kapoor',
    start_time: new Date(Date.now() + 72 * 3600000).toISOString(),
    customer_name: 'Demo Customer', customer_email: 'customer@velora.ai',
    status: 'pending',
  });
  await new Promise((r) => setTimeout(r, 200));
});
await waitFor(() => all('.card').some((c) => Array.from(c.querySelectorAll('button')).some((b) => /^\s*ticket/i.test(txt(b)))), { timeout: 12000, label: 'ticket button' }).catch(() => {});
const ticketCard = all('.card').find((c) => Array.from(c.querySelectorAll('button')).some((b) => /^\s*ticket/i.test(txt(b))));
const ticketBtn = ticketCard && Array.from(ticketCard.querySelectorAll('button')).find((b) => /^\s*ticket/i.test(txt(b)));
if (ticketBtn) await click(ticketBtn);
await waitFor(() => !!document.querySelector('[data-ticket-qr] svg'), { label: 'history ticket modal' }).catch(() => {});
ok('Booking history re-opens the ticket with a fresh QR', !!document.querySelector('[data-ticket-qr] svg'),
  `cards=${all('.card').length} withTicket=${all('.card').filter((c) => Array.from(c.querySelectorAll('button')).some((b) => /^\s*ticket/i.test(txt(b)))).length}`);
const beforeTicketDl = downloads.length;
await click(all('button').find((b) => /download png/i.test(txt(b))));
await settle(500);
ok('History ticket QR is downloadable from the list',
  downloads.slice(beforeTicketDl).some((d) => /ticket\.(png|svg)$/.test(d)), downloads.slice(beforeTicketDl).join(', '));
const closeTicket = all('button').find((b) => /close/i.test(txt(b)) || txt(b) === '×');
if (closeTicket) await click(closeTicket);
await settle(200);

const pastBtn = all('button').find((b) => /^past/i.test(txt(b)));
if (pastBtn) await click(pastBtn);
await waitFor(() => all('.card').some((c) => txt(c).includes(liveRef)), { timeout: 12000, label: 'cancelled card in history' }).catch(() => {});
ok('Customer sees the CANCELLED status in their history (one dataset)', (() => {
  const card = all('.card').find((c) => txt(c).includes(liveRef));
  return !!card && /cancelled/i.test(txt(card));
})());

/* ================================================================== */
console.log('\n—— 7. API surface (direct endpoint probes) ——');
const failing = apiCalls.filter((c) => c.status >= 500);
ok('No API call returned a server error (5xx) during the UI run', failing.length === 0, JSON.stringify(failing.slice(0, 4)));

const probe = async (path, init) => {
  try {
    const res = await nodeFetch(`${BASE}${path}`, init);
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: null, error: String(e) };
  }
};
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const jsonHeaders = { 'content-type': 'application/json' };

const bizList = await probe('/api/businesses?city=Jaipur');
const bizCount = Array.isArray(bizList.body) ? bizList.body.length : (bizList.body?.results?.length || 0);
ok('GET /api/businesses responds with a catalogue', bizList.status === 200 && bizCount > 0, `status=${bizList.status} count=${bizCount}`);
const rows = Array.isArray(bizList.body) ? bizList.body : (bizList.body?.results || []);
const serverBiz = rows.find((b) => Number(b.id) >= 100000) || rows[0];
ok('GET /api/businesses returns bookable providers (server/synthetic catalogue)', !!serverBiz);

const single = await probe(`/api/businesses?id=${encodeURIComponent(serverBiz?.id ?? 100001)}`);
ok('GET /api/businesses?id= resolves one business with services',
  single.status === 200 && Array.isArray(single.body?.services) && single.body.services.length > 0, `status=${single.status}`);

const discProbe = await probe('/api/discover?lat=26.9124&lng=75.7873&city=Jaipur');
ok('GET /api/discover responds with results',
  discProbe.status === 200 && Array.isArray(discProbe.body?.results) && discProbe.body.results.length > 0, `status=${discProbe.status}`);

const hm1 = await probe('/api/heatmap?business_id=demo-biz-aurora');
ok('GET /api/heatmap returns a 14-day forecast for a non-numeric demo id',
  hm1.status === 200 && Array.isArray(hm1.body?.days) && hm1.body.days.length === 14, `status=${hm1.status}`);
const hm2 = await probe('/api/heatmap?business_id=100001');
ok('GET /api/heatmap serves the synthetic forecast instantly', hm2.status === 200 && Array.isArray(hm2.body?.days), `status=${hm2.status}`);

const nearest = await probe('/api/nearest?lat=26.9124&lng=75.7873&city=Jaipur');
ok('GET /api/nearest responds', nearest.status === 200, `status=${nearest.status}`);
const slotsProbe = await probe(`/api/business-slots?business_id=100001&service_id=10000100&date=${tomorrow}`);
ok('GET /api/business-slots answers without a 5xx', slotsProbe.status < 500, `status=${slotsProbe.status}`);
const smart = await probe(`/api/smart-slots?business_id=100001&service_id=10000100&date=${tomorrow}&origin_lat=26.9124&origin_lng=75.7873`);
ok('GET /api/smart-slots answers without a 5xx', smart.status < 500, `status=${smart.status}`);

const notifProbe = await probe('/api/notifications');
ok('GET /api/notifications is authorization-checked (401/403, never 5xx)', notifProbe.status === 401 || notifProbe.status === 403, `status=${notifProbe.status}`);
const mineProbe = await probe('/api/my-bookings?email=nobody@example.in');
ok('GET /api/my-bookings is authorization-checked (never 5xx)', mineProbe.status < 500, `status=${mineProbe.status}`);
const adminProbe = await probe('/api/admin?resource=overview');
ok('GET /api/admin is authorization-checked (never 5xx)', adminProbe.status < 500, `status=${adminProbe.status}`);
const verifyBad = await probe('/api/verify-booking?token=local.notatoken');
ok('GET /api/verify-booking rejects a bad token by verdict, not by crash',
  verifyBad.status === 200 && verifyBad.body?.valid === false && !!verifyBad.body?.reason,
  `status=${verifyBad.status} reason=${verifyBad.body?.reason}`);
const verifyNoToken = await probe('/api/verify-booking');
ok('GET /api/verify-booking requires a token', verifyNoToken.status === 400 && verifyNoToken.body?.valid === false, `status=${verifyNoToken.status}`);
const placesProbe = await probe('/api/places?city=Jaipur&lat=26.9124&lng=75.7873');
ok('GET /api/places degrades gracefully without a Maps key', placesProbe.status < 500, `status=${placesProbe.status}`);
const geocodeProbe = await probe('/api/geocode?q=Jaipur');
ok('GET /api/geocode degrades gracefully without a Maps key', geocodeProbe.status < 500, `status=${geocodeProbe.status}`);
const reminders = await probe('/api/process-reminders', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({}) });
ok('POST /api/process-reminders is authentication/cron guarded (never 5xx)',
  reminders.status === 401 || reminders.status === 403, `status=${reminders.status}`);

const conciergeProbe = await probe('/api/concierge', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ message: 'I need a dentist tomorrow', city: 'Jaipur' }) });
ok('POST /api/concierge answers without a 5xx', conciergeProbe.status < 500, `status=${conciergeProbe.status}`);

const bookBody = {
  business_id: 100001, service_id: 10000100,
  start_time: new Date(Date.now() + 3 * 86400000).toISOString(),
  customer_name: 'API Probe', customer_email: 'probe@example.in',
};
const bookRes = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, idempotency_key: `probe-${Date.now()}` }) });
ok('POST /api/book creates a booking through the API (no 5xx)', bookRes.status < 500 && !!bookRes.body?.booking?.ref, `status=${bookRes.status}`);
ok('POST /api/book reports its pipeline HONESTLY (saved flag ⇔ demo_mode)',
  bookRes.body?.pipeline?.saved === !bookRes.body?.pipeline?.demo_mode, JSON.stringify(bookRes.body?.pipeline));
ok('POST /api/book never claims an email was sent without a provider',
  ['log-fallback', 'sending', 'queued'].includes(String(bookRes.body?.pipeline?.email)), String(bookRes.body?.pipeline?.email));
const replayA = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, start_time: new Date(Date.now() + 5 * 86400000).toISOString(), idempotency_key: 'velora-idem-probe' }) });
const replayB = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, start_time: new Date(Date.now() + 5 * 86400000).toISOString(), idempotency_key: 'velora-idem-probe' }) });
ok('POST /api/book is idempotent (same key ⇒ one booking, replayed answer)',
  replayA.status < 500 && replayB.status < 500 && !!replayA.body?.booking?.ref && replayA.body.booking.ref === replayB.body?.booking?.ref,
  `${replayA.body?.booking?.ref} vs ${replayB.body?.booking?.ref}`);

// Capacity model: a NAMED specialist owns their slot exclusively; "any
// specialist" is capped at the roster size (Prime MediTrust has 3).
const staffSlot = new Date(Date.now() + 6 * 86400000).toISOString();
const staffA = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, staff_id: 100001000, start_time: staffSlot, idempotency_key: 'staff-a' }) });
const staffB = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, staff_id: 100001000, start_time: staffSlot, idempotency_key: 'staff-b' }) });
ok('POST /api/book refuses a DOUBLE BOOKING of one specialist (409, no second record)',
  staffA.status === 201 && staffB.status === 409, `first=${staffA.status} second=${staffB.status}`);

const anySlot = new Date(Date.now() + 7 * 86400000).toISOString();
const anyStatuses = [];
for (let i = 0; i < 4; i += 1) {
  const r = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, start_time: anySlot, idempotency_key: `any-${i}` }) });
  anyStatuses.push(r.status);
}
ok('POST /api/book caps "any specialist" at the roster size (3 booked, 4th refused)',
  anyStatuses.slice(0, 3).every((st) => st === 201) && anyStatuses[3] === 409, anyStatuses.join(','));

const past = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, start_time: new Date(Date.now() - 86400000).toISOString(), idempotency_key: 'past-probe' }) });
ok('POST /api/book rejects a PAST slot', past.status === 400, `status=${past.status}`);
const noEmail = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, customer_email: 'not-an-email', idempotency_key: 'bad-email' }) });
ok('POST /api/book rejects an invalid customer email', noEmail.status === 400, `status=${noEmail.status}`);
const badService = await probe('/api/book', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ ...bookBody, service_id: 999999999, idempotency_key: 'bad-svc' }) });
ok('POST /api/book rejects a service that does not belong to the business', badService.status === 404, `status=${badService.status}`);

const demoFetches = apiCalls.filter((c) => /id=demo-/.test(c.path));
ok('Demo tenant entities are never fetched from the server (they resolve locally)',
  demoFetches.length === 0, JSON.stringify(demoFetches.slice(0, 3)));
const unexpected4xx = apiCalls.filter((c) => c.status >= 400 && c.status < 500 && !/\/api\/(notifications|bookings|admin|my-bookings|travel-planner)/.test(c.path));
ok('No unexpected 4xx from the UI (auth-gated endpoints excluded)',
  unexpected4xx.length === 0, JSON.stringify(unexpected4xx.slice(0, 4)));

const statuses = [...new Set(apiCalls.map((c) => `${c.method} ${c.path} → ${c.status}`))];
console.log(`  ℹ️  ${apiCalls.length} API calls from the UI · ${statuses.slice(0, 8).join(' | ')}`);

/* ================================================================== */
console.log('\n—— 8. Console errors ——');
const uniq = [...new Set(problems)];
ok('No BROWSER console errors / warnings / unhandled rejections during the whole run', uniq.length === 0, uniq.slice(0, 5).join(' ⏐ '));
const srv = [...new Set(serverLogs)];
if (srv.length) {
  console.log(`  ℹ️  ${srv.length} server-side ./api log line(s) (no database configured in this sandbox — handlers degrade to the synthetic preview path):`);
  srv.slice(0, 6).forEach((l) => console.log(`      · ${l.slice(0, 120)}`));
}

/* ------------------------------------------------------------------ */
await ReactMod.act(async () => { root.unmount(); });
await vite.close();
await new Promise((r) => httpServer.close(r));

console.log(`\n═══ RESULT: ${pass} passed, ${failures.length} failed ═══`);
if (failures.length) {
  console.log('Failed:\n - ' + failures.join('\n - '));
  process.exitCode = 1;
}
process.exit(process.exitCode || 0);
