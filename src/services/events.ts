// Velora local event bus — instant same-browser sync without infrastructure.
// Same-tab updates travel via CustomEvent; cross-tab updates via the storage
// event (localStorage writes fire `storage` in every OTHER open tab).
// Used for: booking changes, notification badge sync, toast messages.

export const EVENTS = {
  BOOKINGS_CHANGED: 'velora:bookings-changed',
  NOTIFS_CHANGED: 'velora:notifs-changed',
  TOAST: 'velora:toast',
} as const;

const BUS_KEY = 'velora-bus';

function ping(kind: string) {
  try {
    window.dispatchEvent(new CustomEvent(kind));
  } catch {
    /* non-DOM env */
  }
  try {
    localStorage.setItem(BUS_KEY, JSON.stringify({ kind, t: Date.now() }));
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
export function onBookingsChanged(cb: () => void): () => void {
  return listen(EVENTS.BOOKINGS_CHANGED, cb);
}
export function onNotifsChanged(cb: () => void): () => void {
  return listen(EVENTS.NOTIFS_CHANGED, cb);
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
