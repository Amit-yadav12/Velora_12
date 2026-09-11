import supabase from './supabase';

/**
 * API failure with the HTTP status attached. `errMsg()` still returns just the
 * message, so every existing call site is unaffected — but callers that need to
 * react differently per status (e.g. demo provisioning: 409 = schema missing,
 * 503 = no credentials, 401/403 = bad key) can branch on `.status` instead of
 * pattern-matching prose.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

export async function apiGet<T = unknown>(path: string, opts?: { timeout?: number }): Promise<T> {
  const timeout = opts?.timeout ?? 8000;
  const res = await timedFetch(path, { headers: { ...(await authHeaders()) } }, timeout);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new ApiError(errJson.error || `Request failed (${res.status})`, res.status, path);
  }
  return res.json();
}

export async function apiSend<T = unknown>(path: string, method: string, body: unknown, opts?: { timeout?: number }): Promise<T> {
  const timeout = opts?.timeout ?? 10000;
  const res = await timedFetch(
    path,
    {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify(body),
    },
    timeout,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error || `Request failed (${res.status})`, res.status, path);
  return json;
}

// Empty-DB fallback helper: if API returns empty array or fails, caller can use synthetic
export async function apiGetWithFallback<T>(path: string, fallback: () => T, opts?: { timeout?: number }): Promise<T> {
  try {
    const data = await apiGet(path, opts);
    if (Array.isArray(data) && data.length === 0) {
      return fallback();
    }
    const results = data && typeof data === 'object' ? (data as { results?: unknown }).results : undefined;
    if (Array.isArray(results) && results.length === 0) {
      return fallback();
    }
    return data as T;
  } catch {
    return fallback();
  }
}
