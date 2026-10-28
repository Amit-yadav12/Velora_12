// Explicit per-tab mode selection. Demo records remain in their own browser
// namespaces and are never used as credentials against the live project.
export const DEMO_MODE_KEY = 'velora-explicit-demo';
export function demoSelected(storage) {
  try { return storage?.getItem(DEMO_MODE_KEY) === '1'; } catch { return false; }
}
export function enterDemo(role = 'customer') {
  try {
    sessionStorage.setItem(DEMO_MODE_KEY, '1');
    if (!demoSelected(sessionStorage)) throw new Error('storage unavailable');
    window.location.assign(`/welcome?role=${role === 'business' ? 'business' : 'customer'}&startDemo=1`);
  } catch {
    throw new Error('Demo mode needs browser session storage. Enable it and try again.');
  }
}
export function exitDemo() {
  try { sessionStorage.removeItem(DEMO_MODE_KEY); } catch { /* reload still fails closed */ }
  window.location.assign('/welcome');
}
