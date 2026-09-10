// Velora smart cache — instant page transitions via memory + persistent cache,
// request deduping, hard timeouts and idle-time prefetching.

const mem = new Map<string, { at: number; ttl: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const CACHE_PREFIX = 'velora-cache-v2:';

function readDisk(key: string): { at: number; ttl: number; data: unknown } | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeDisk(key: string, entry: { at: number; ttl: number; data: unknown }) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota full — evict oldest velora entries and retry once.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.slice(0, Math.max(1, Math.floor(keys.length / 2))).forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch { /* non-fatal */ }
  }
}

export function cacheGet<T = unknown>(key: string): T | null {
  const now = Date.now();
  const m = mem.get(key);
  if (m && now - m.at < m.ttl) return m.data as T;
  const d = readDisk(key);
  if (d && now - d.at < d.ttl) {
    mem.set(key, d);
    return d.data as T;
  }
  return null;
}

export function cacheSet(key: string, data: unknown, ttl = 60000, persist = true): void {
  const entry = { at: Date.now(), ttl, data };
  mem.set(key, entry);
  if (mem.size > 200) mem.delete(mem.keys().next().value as string);
  if (persist) writeDisk(key, entry);
}

export function cacheInvalidate(prefix: string): void {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX + prefix)) drop.push(k);
    }
    drop.forEach((k) => localStorage.removeItem(k));
  } catch { /* non-fatal */ }
}

export async function timedJson(url: string, ms = 6000, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cached fetch with dedupe: concurrent callers share one request; results are
 * served from memory/disk cache when fresh. Never throws for cache misses —
 * only for network failures (caller decides fallback).
 */
export function cachedFetch<T = unknown>(url: string, opts?: { ttl?: number; timeout?: number; persist?: boolean; init?: RequestInit }): Promise<T> {
  const ttl = opts?.ttl ?? 45000;
  const hit = cacheGet<T>(url);
  if (hit != null) return Promise.resolve(hit);
  const flying = inflight.get(url);
  if (flying) return flying as Promise<T>;
  const p = timedJson(url, opts?.timeout ?? 6000, opts?.init)
    .then((data) => {
      cacheSet(url, data, ttl, opts?.persist !== false);
      inflight.delete(url);
      return data as T;
    })
    .catch((e) => {
      inflight.delete(url);
      throw e;
    });
  inflight.set(url, p);
  return p;
}

/** Warm the cache during idle time so navigations feel instant. */
export function prefetch(urls: string[], opts?: { ttl?: number; timeout?: number }): void {
  const run = () => {
    for (const u of urls) {
      if (cacheGet(u) != null || inflight.has(u)) continue;
      cachedFetch(u, { ttl: opts?.ttl ?? 60000, timeout: opts?.timeout ?? 5000 }).catch(() => {});
    }
  };
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
  if (typeof ric === 'function') ric(run, { timeout: 2500 });
  else setTimeout(run, 1200);
}

/** Prefetch on hover/intent — call from onMouseEnter for instant detail opens. */
export function prefetchOnIntent(url: string): void {
  if (cacheGet(url) != null || inflight.has(url)) return;
  cachedFetch(url, { ttl: 120000, timeout: 5000 }).catch(() => {});
}
