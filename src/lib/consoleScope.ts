// Console business scope — which tenant the business console is looking at.
//
// Live deployments never rely on this for security: /api/bookings and
// /api/admin already filter every row to the signed-in owner's businesses
// (businessScope → owner_user_id). This store is the *view* control on top, so
// an operator with several businesses — or the sample tenant with a handful of
// authored businesses — can focus one and see exactly that business's data.
//
// `null` means "all businesses this account owns", which is the default and
// matches what the server returns.
import { useSyncExternalStore } from 'react';

const KEY = 'velora-console-scope';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Always read through: a cached copy silently goes stale when this module is
 * duplicated (HMR/lazy chunk) or when another tab changes the scope, and a
 * stale "all businesses" value would leak rows across tenants in the view.
 */
export function getConsoleScope(): string | null {
  return read();
}

export function setConsoleScope(businessId: string | null): void {
  try {
    if (businessId) localStorage.setItem(KEY, businessId);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — the in-memory value still works for this session */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  // Keep two console tabs (or a reset in another tab) in step.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useConsoleScope(): string | null {
  return useSyncExternalStore(subscribe, getConsoleScope, () => null);
}

/** The business id a booking row belongs to (server rows call it resource_id). */
export function bookingBusinessId(row: { business_id?: number | string; resource_id?: number | string }): string {
  const id = row.business_id ?? row.resource_id;
  return id == null ? '' : String(id);
}

/** True when a row with this business id is visible under the current scope. */
export function inScope(businessId: number | string | null | undefined, scope: string | null): boolean {
  if (!scope) return true;
  return businessId != null && String(businessId) === String(scope);
}
