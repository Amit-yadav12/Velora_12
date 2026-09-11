// Test double for src/lib/supabase.js — used only by
// scripts/verify-integrations.mjs to execute src/lib/demoAuth.ts against a
// NON-demo deployment (isDemoMode = false), which is the path that calls
// /api/provision-demo. Dev-only; never imported by the app or shipped to dist.
export const isDemoMode = false;

const profile = { id: 'u-1', email: 'admin@velora.ai', full_name: 'Demo Admin', role: 'customer' };

const supabase = {
  auth: {
    signInWithPassword: async () => ({ data: { session: { user: profile } }, error: null }),
    signUp: async () => ({ data: { session: { user: profile } }, error: null }),
    getSession: async () => ({ data: { session: { user: profile } }, error: null }),
  },
  from: () => ({
    upsert: async () => ({ data: profile, error: null }),
    select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }),
  }),
};

export default supabase;
