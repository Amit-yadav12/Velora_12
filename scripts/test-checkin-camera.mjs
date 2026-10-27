// React/jsdom regression for a camera permission request that resolves after
// the check-in dialog has closed or unmounted. No physical camera is used.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.test/', pretendToBeVisual: true,
});
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
window.BarcodeDetector = class { async detect() { return []; } };
window.HTMLMediaElement.prototype.play = async () => {};

const React = await import('react');
globalThis.React = React; // tsx uses classic JSX outside the Vite transform
const { act, createElement } = React;
const { createRoot } = await import('react-dom/client');
const CheckInDialog = (await import('../src/components/console/CheckInDialog.tsx')).default;
const props = (open) => ({ open, onClose() {}, bookings: [], onCheckedIn() {} });
let passed = 0;
async function runCase(unmount) {
  let resolveCamera;
  Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: () => new Promise((resolve) => { resolveCamera = resolve; }),
  } });
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(createElement(CheckInDialog, props(true))));
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Scan QR'));
    assert.ok(button, 'camera button appears when the APIs are available');
    await act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    assert.equal(typeof resolveCamera, 'function', 'camera permission request started');
    if (unmount) await act(async () => root.unmount());
    else await act(async () => root.render(createElement(CheckInDialog, props(false))));
    await act(async () => { resolveCamera(stream); await Promise.resolve(); });
    assert.equal(stopped, 1, `camera stream must be stopped after dialog ${unmount ? 'unmounts' : 'closes'}`);
    passed++;
    console.log(`  ✓ late camera stream is stopped after dialog ${unmount ? 'unmounts' : 'closes'}`);
  } finally {
    if (!unmount) await act(async () => root.unmount());
    document.getElementById('root').replaceChildren();
  }
}
async function runActiveCase(closeBeforeDetection) {
  let resolveDetection, seenVideo, stops = 0, checkedIn = 0;
  const stream = { getTracks: () => [{ stop: () => { stops++; } }] };
  Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } });
  window.BarcodeDetector = class {
    detect(video) { seenVideo = video; return new Promise((resolve) => { resolveDetection = resolve; }); }
  };
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), init });
    return { ok: true, json: async () => String(url).startsWith('/api/verify-booking')
      ? { valid: true, booking: { ref: 'VL-TEST' } } : { ticket_verified: true } };
  };
  const booking = { id: 301, ref: 'VL-TEST', status: 'confirmed', service_name: 'Haircut', customer_name: 'Guest' };
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () => root.render(createElement(CheckInDialog, { ...props(true), bookings: [booking], onCheckedIn: () => { checkedIn++; } })));
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Scan QR'));
    await act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
    assert.ok(seenVideo && seenVideo.srcObject === stream && resolveDetection, 'an immediately granted stream attaches to the rendered video and reaches the detector');
    if (closeBeforeDetection) {
      await act(async () => root.render(createElement(CheckInDialog, props(false))));
      assert.equal(stops, 1, 'closing an active scan stops the camera');
    }
    await act(async () => { resolveDetection([{ rawValue: 'https://example.test/verify/v1.sample.signature?source=qr' }]); await new Promise((resolve) => setTimeout(resolve, 20)); });
    if (closeBeforeDetection) {
      assert.equal(requests.length, 0, 'a detection completed after closing must not submit a ticket');
      assert.equal(checkedIn, 0);
      console.log('  ✓ a late detector result cannot check in after closing');
    } else {
      const verification = requests.find((r) => r.url.startsWith('/api/verify-booking'));
      const update = requests.find((r) => r.url === '/api/bookings');
      assert.equal(new URL(verification.url, 'https://example.test').searchParams.get('token'), 'v1.sample.signature');
      assert.deepEqual(JSON.parse(update.init.body), { id: 301, action: 'check_in', ticket: 'v1.sample.signature' });
      assert.equal(checkedIn, 1);
      assert.equal(stops, 1, 'scanning a ticket stops the camera');
      console.log('  ✓ a scanned URL reaches verification and check-in intact, then stops the camera');
    }
    passed++;
  } finally {
    await act(async () => root.unmount());
    document.getElementById('root').replaceChildren();
  }
}
try {
  await runCase(false);
  await runCase(true);
  await runActiveCase(false);
  await runActiveCase(true);
  console.log(`\n${passed} camera lifecycle regressions passed (jsdom and mocked media/API calls).`);
} finally { window.close(); }
