// Demo guide state — a tiny external store so any surface (the persistent
// sample-mode bar, the welcome screen, the console) can open the presenter's
// walkthrough without prop-drilling through three shells.
import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    try { listener(); } catch { /* a broken listener must not close the guide */ }
  });
}

export function openDemoGuide() { open = true; emit(); }
export function closeDemoGuide() { open = false; emit(); }
export function toggleDemoGuide() { open = !open; emit(); }

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDemoGuideOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
