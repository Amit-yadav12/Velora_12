import supabase from './supabase';

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

export async function apiGet(path: string, opts?: { timeout?: number }) {
  const timeout = opts?.timeout ?? 8000;
  const res = await timedFetch(path, { headers: { ...(await authHeaders()) } }, timeout);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function apiSend(path: string, method: string, body: any, opts?: { timeout?: number }) {
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
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// Empty-DB fallback helper: if API returns empty array or fails, caller can use synthetic
export async function apiGetWithFallback<T>(path: string, fallback: () => T, opts?: { timeout?: number }): Promise<T> {
  try {
    const data = await apiGet(path, opts);
    if (Array.isArray(data) && data.length === 0) {
      return fallback();
    }
    if (data && typeof data === 'object' && Array.isArray((data as any).results) && (data as any).results.length === 0) {
      return fallback();
    }
    return data as T;
  } catch {
    return fallback();
  }
}
