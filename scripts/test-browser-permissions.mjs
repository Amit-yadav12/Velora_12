import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<div id="root"></div>', { url: 'https://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
let requests = 0;
class FakeNotification {
  static permission = 'default';
  static async requestPermission() { requests++; FakeNotification.permission = 'denied'; return 'denied'; }
}
window.Notification = globalThis.Notification = FakeNotification;
const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
let root;
try {
  const { default: BrowserAlerts } = await server.ssrLoadModule('/src/components/premium/BrowserAlerts.tsx');
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(BrowserAlerts)));
  assert.match(document.body.textContent, /Permission not requested yet/);
  assert.match(document.body.textContent, /Sample mode does not send device alerts/);
  assert.equal(requests, 0);
  await act(async () => document.querySelector('button').click());
  assert.equal(requests, 1);
  assert.match(document.body.textContent, /Blocked\. Allow notifications/);
  FakeNotification.permission = 'granted';
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
  assert.match(document.body.textContent, /Permission allowed/);
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
  assert.match(document.body.textContent, /Unavailable in this browser or on an insecure connection/);
  console.log('Browser permission controls: no automatic prompt, denied, granted and insecure states passed (jsdom, mocked browser).');
} finally {
  if (root) await act(async () => root.unmount());
  await server.close();
  dom.window.close();
}
