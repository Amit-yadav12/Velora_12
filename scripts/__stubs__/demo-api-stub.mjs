// Test double for src/lib/api.ts — same role as demo-supabase-stub.mjs.
// `globalThis.__provisionScenario` picks what /api/provision-demo does.
// ApiError is re-declared here because demoAuth imports it from this module,
// so `instanceof` resolves against the same class on both sides.
export class ApiError extends Error {
  constructor(message, status, path) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export async function apiSend(path) {
  const s = globalThis.__provisionScenario || 'ok';
  if (s === 'ok') return { ok: true, role: 'admin' };
  if (s === 'unexpected') return { ok: false };
  if (s === 'network') throw new TypeError('Failed to fetch');
  throw new ApiError(`Request failed (${s})`, Number(s), path);
}
