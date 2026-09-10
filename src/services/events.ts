// Velora local event bus — instant same-browser sync without infrastructure.
// Same-tab updates travel via CustomEvent; cross-tab updates via the storage
// event (localStorage writes fire `storage` in every OTHER open tab).
// Used for: booking changes, notification badge sync, toast messages.

export const EVENTS = {
  BOOKINGS_CHANGED: 'velora:bookings-changed',
  NOTIFS_CHANGED: 'velora:notifs-changed',
  BUSINESSES_CHANGED: 'velora:businesses-changed',
  SERVICES_CHANGED: 'velora:services-changed',
  STAFF_CHANGED: 'velora:staff-changed',
  DEMO_RESET: 'velora:demo-reset',
  TOAST: 'velora:toast',
} as const;

const BUS_KEY = 'velora-bus';
let sequence = 0;

function ping(kind: string) {
  try {
    window.dispatchEvent(new CustomEvent(kind));
  } catch {
    /* non-DOM env */
  }
  try {
    // A storage event is not fired when a key is assigned the same value.
    // Include a per-tab sequence so two mutations in the same millisecond are
    // still observable by every other tab.
    localStorage.setItem(BUS_KEY, JSON.stringify({ kind, t: Date.now(), sequence: ++sequence }));
  } catch {
    /* private mode */
  }
}

function listen(kind: string, cb: () => void): () => void {
  const direct = () => cb();
  const crossTab = (e: StorageEvent) => {
    if (e.key !== BUS_KEY || !e.newValue) return;
    try {
      if (JSON.parse(e.newValue).kind === kind) cb();
    } catch {
      /* ignore */
    }
  };
  window.addEventListener(kind, direct);
  window.addEventListener('storage', crossTab);
  return () => {
    window.removeEventListener(kind, direct);
    window.removeEventListener('storage', crossTab);
  };
}

export function emitBookingsChanged() {
  ping(EVENTS.BOOKINGS_CHANGED);
}
export function emitNotifsChanged() {
  ping(EVENTS.NOTIFS_CHANGED);
}
export function emitBusinessesChanged() {
  ping(EVENTS.BUSINESSES_CHANGED);
}
export function emitServicesChanged() {
  ping(EVENTS.SERVICES_CHANGED);
}
export function emitStaffChanged() {
  ping(EVENTS.STAFF_CHANGED);
}
export function emitDemoReset() {
  ping(EVENTS.DEMO_RESET);
}
export function onBookingsChanged(cb: () => void): () => void {
  return listen(EVENTS.BOOKINGS_CHANGED, cb);
}
export function onNotifsChanged(cb: () => void): () => void {
  return listen(EVENTS.NOTIFS_CHANGED, cb);
}
export function onBusinessesChanged(cb: () => void): () => void {
  return listen(EVENTS.BUSINESSES_CHANGED, cb);
}
export function onServicesChanged(cb: () => void): () => void {
  return listen(EVENTS.SERVICES_CHANGED, cb);
}
export function onStaffChanged(cb: () => void): () => void {
  return listen(EVENTS.STAFF_CHANGED, cb);
}
export function onDemoReset(cb: () => void): () => void {
  return listen(EVENTS.DEMO_RESET, cb);
}

export type ToastKind = 'success' | 'info' | 'warning' | 'error';
export interface ToastMsg {
  id: number;
  message: string;
  kind: ToastKind;
}

export function toast(message: string, kind: ToastKind = 'info') {
  try {
    window.dispatchEvent(
      new CustomEvent<ToastMsg>(EVENTS.TOAST, {
        detail: { id: Date.now() + Math.random(), message, kind },
      })
    );
  } catch {
    /* non-DOM env */
  }
}
