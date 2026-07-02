// Registers the service worker for PWA install + offline support.
// Defensive: proactively clears any stale caches from older SW versions so a
// previously-cached broken build can't keep the app from loading.
export function registerPWA() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      // Nuke any caches created by older (cache-first) service workers.
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== 'velora-v3').map((k) => caches.delete(k)));
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });

      // When a new SW is found, take over immediately.
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            nw.postMessage?.('skipWaiting');
          }
        });
      });
    } catch (e) {
      console.warn('[pwa] SW registration failed', e);
    }
  });
}
