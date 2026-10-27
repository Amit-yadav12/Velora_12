let pending: Promise<typeof google> | null = null;
let authenticationFailed = false;
let handlerInstalled = false;
const failureListeners = new Set<() => void>();

/** Google may reject a key after the script has already fired its load event. */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  failureListeners.add(listener);
  if (!handlerInstalled) {
    const host = window as Window & { gm_authFailure?: () => void };
    const previous = host.gm_authFailure;
    host.gm_authFailure = () => {
      authenticationFailed = true;
      previous?.();
      failureListeners.forEach((fn) => fn());
    };
    handlerInstalled = true;
  }
  if (authenticationFailed) listener();
  return () => { failureListeners.delete(listener); };
}

/** Browser key is public and must be restricted by HTTP referrer in Google Cloud. */
export function loadGoogleMaps(): Promise<typeof google> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!key || authenticationFailed) return Promise.reject(new Error('Google Maps is not configured or authorized.'));
  if (window.google?.maps) return Promise.resolve(window.google);
  if (pending) return pending;
  pending = new Promise<typeof google>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => reject(new Error('Google Maps took too long to load.')), 10000);
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    script.async = true;
    script.onload = () => { window.clearTimeout(timer); if (window.google?.maps) resolve(window.google); else reject(new Error('Google Maps could not load.')); };
    script.onerror = () => { window.clearTimeout(timer); reject(new Error('Google Maps could not load.')); };
    document.head.appendChild(script);
  }).catch((e) => { pending = null; throw e; });
  return pending;
}
