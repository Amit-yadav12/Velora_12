import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// Configured-looking project and intercepted requests: no live service is contacted.
process.env.VITE_SUPABASE_URL = 'https://invalid.example';
process.env.VITE_SUPABASE_ANON_KEY = 'public-test-key';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
const demo = process.argv.includes('--demo');
if (demo) sessionStorage.setItem('velora-explicit-demo', '1');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'isSecureContext', { value: true });
const displayed = [];
class FakeNotification { static permission = 'granted'; constructor(title, options) { displayed.push({ title, ...options }); } }
window.Notification = globalThis.Notification = FakeNotification;
let tick;
window.setInterval = fn => { tick = fn; return 1; };
window.clearInterval = () => {};
let rows = [{ id: 1, audience: 'customer', read: false }];
let requests = 0;
globalThis.fetch = async (url) => {
  assert.equal(url, '/api/notifications'); requests++;
  return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let root;
try {
  const { useBrowserAlerts } = await server.ssrLoadModule('/src/lib/useBrowserAlerts.ts');
  function Test() { useBrowserAlerts('real-user-test', 'customer'); return null; }
  root = createRoot(document.getElementById('root'));
  await act(async () => { root.render(React.createElement(Test)); await new Promise(r => setTimeout(r, 50)); });
  // Auth initialization is async; let the initial poll settle.
  await act(async () => { await new Promise(r => setTimeout(r, 100)); });
  if (demo) {
    assert.equal(requests, 0, 'demo must not contact live notifications');
    assert.equal(tick, undefined, 'demo must not start a live poll');
    console.log('Explicit demo: browser alerts make no live notification requests.');
  } else {
  assert.equal(requests, 1);
  assert.equal(displayed.length, 0, 'existing notifications establish a baseline');
  rows = [...rows, { id: 2, audience: 'customer', read: false }, { id: 3, audience: 'admin', read: false }, { id: 4, audience: 'customer', read: true }];
  await act(async () => { await tick(); });
  assert.equal(displayed.length, 1, 'only newly unread customer row is displayed');
  assert.match(displayed[0].body, /Open Velora/);
  await act(async () => { await tick(); });
  assert.equal(displayed.length, 1, 'unchanged rows do not repeat');
  FakeNotification.permission = 'denied';
  await act(async () => { await tick(); });
  assert.equal(requests, 3, 'denied permission does not poll');
  assert.equal(displayed.length, 1);
  console.log('Live foreground alerts: authenticated endpoint mocked, baseline, audience, read status, deduplication and denial passed.');
  }
} finally {
  if (root) await act(async () => root.unmount());
  await server.close(); dom.window.close();
}
// Supabase's browser auth client can keep a background refresh timer in Node.
process.exit(0);
