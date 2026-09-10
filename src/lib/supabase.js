// Velora Supabase client — production backend when env is configured,
// zero-crash local DEMO MODE otherwise (previews, offline, no keys).
// Demo mode emulates auth sessions + query results in-memory/localStorage so
// every page renders and the full product flow stays explorable.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isDemoMode = !url || !anon;

/** @returns {any} Demo-mode client — typed as any so all call sites keep working. */
function createDemoClient() {
  const SESS_KEY = 'velora-demo-session';
  const listeners = new Set();
  const readSession = () => {
    try {
      const s = localStorage.getItem(SESS_KEY);
      return s ? JSON.parse(s) : null;
    } catch {
      return null;
    }
  };
  const writeSession = (sess) => {
    try {
      if (sess) localStorage.setItem(SESS_KEY, JSON.stringify(sess));
      else localStorage.removeItem(SESS_KEY);
    } catch {
      /* private mode */
    }
  };
  const roleFor = (email) =>
    String(email || '').toLowerCase().trim().startsWith('admin') ? 'admin' : 'customer';
  const nameFor = (email) => {
    const n = String(email || 'guest')
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .trim();
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : 'Guest';
  };
  const userFor = (email, fullName) => {
    const em = String(email || 'guest@velora.ai').toLowerCase().trim();
    return {
      id: `demo-${em.replace(/[^a-z0-9]+/g, '-')}`,
      email: em,
      user_metadata: { full_name: fullName || nameFor(em) },
    };
  };
  const sessionFor = (email, fullName) => {
    const user = userFor(email, fullName);
    return { user, access_token: 'demo-token', refresh_token: 'demo-refresh', expires_in: 3600 * 24 * 7 };
  };
  const emit = (event) => {
    const sess = readSession();
    listeners.forEach((cb) => {
      try {
        cb(event, sess);
      } catch {
        /* listener error */
      }
    });
  };

  const passwordAuth = async ({ email, password, options } = {}) => {
    if (!email || !String(email).includes('@')) {
      return { data: { user: null, session: null }, error: { message: 'Enter a valid email address' } };
    }
    if (!password) {
      return { data: { user: null, session: null }, error: { message: 'Enter your password' } };
    }
    const session = sessionFor(email, options?.data?.full_name);
    writeSession(session);
    setTimeout(() => emit('SIGNED_IN'), 0);
    return { data: { user: session.user, session }, error: null };
  };

  // Chainable, thenable query builder: absorbs select/eq/order/... and resolves
  // demo-shaped results so every page renders with zero backend.
  // profiles are PERSISTED locally (velora-demo-profiles) so demo-mode business
  // registration genuinely grants console access across sessions.
  const PROFILES_KEY = 'velora-demo-profiles';
  const readProfiles = () => {
    try {
      const raw = localStorage.getItem(PROFILES_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  const writeProfiles = (rows) => {
    try { localStorage.setItem(PROFILES_KEY, JSON.stringify(rows.slice(0, 100))); } catch { /* ignore */ }
  };
  const from = (table) => {
    const state = { single: false, op: 'select', payload: null };
    const exec = () => {
      if (table === 'profiles') {
        const sess = readSession();
        const em = sess?.user?.email || 'guest@velora.ai';
        const defaults = {
          id: sess?.user?.id || 'demo-guest',
          email: em,
          full_name: sess?.user?.user_metadata?.full_name || nameFor(em),
          role: roleFor(em),
          created_at: new Date().toISOString(),
        };
        const stored = readProfiles();
        const mine = stored.find((p) => p.id === defaults.id || p.email === em);
        const row = { ...defaults, ...(mine || {}) };
        if (state.op === 'insert' || state.op === 'upsert' || state.op === 'update') {
          const payload = Array.isArray(state.payload) ? state.payload[0] : state.payload;
          const merged = { ...row, ...(payload || {}) };
          writeProfiles([...stored.filter((p) => p.id !== merged.id && p.email !== merged.email), merged]);
          return { data: merged, error: null };
        }
        return state.single ? { data: row, error: null } : { data: [row], error: null };
      }
      if (state.op === 'insert' || state.op === 'upsert') {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload].filter(Boolean);
        return { data: state.single ? rows[0] ?? null : rows, error: null };
      }
      if (state.op === 'update' || state.op === 'delete') {
        return { data: state.single ? null : [], error: null };
      }
      return state.single ? { data: null, error: null } : { data: [], error: null, count: 0 };
    };
    const api = new Proxy(
      {},
      {
        get(_t, prop) {
          if (typeof prop === 'symbol') return undefined;
          if (prop === 'then') {
            return (resolve, reject) => {
              try {
                resolve(exec());
              } catch (e) {
                if (reject) reject(e);
              }
            };
          }
          if (prop === 'single' || prop === 'maybeSingle') {
            return () => {
              state.single = true;
              return api;
            };
          }
          if (prop === 'insert' || prop === 'upsert' || prop === 'update' || prop === 'delete') {
            return (payload) => {
              state.op = prop;
              state.payload = payload ?? null;
              return api;
            };
          }
          return (..._args) => api;
        },
      }
    );
    return api;
  };

  const channelStub = {
    on: () => channelStub,
    subscribe: () => channelStub,
    unsubscribe: () => {},
  };

  return {
    isDemo: true,
    auth: {
      getSession: async () => ({ data: { session: readSession() }, error: null }),
      getUser: async () => {
        const s = readSession();
        return { data: { user: s?.user ?? null }, error: null };
      },
      signInWithPassword: passwordAuth,
      signUp: passwordAuth,
      signInWithIdToken: async () => {
        const session = sessionFor('guest@velora.ai');
        writeSession(session);
        setTimeout(() => emit('SIGNED_IN'), 0);
        return { data: { user: session.user, session }, error: null };
      },
      setSession: async () => ({ data: { session: readSession() }, error: null }),
      signOut: async () => {
        writeSession(null);
        setTimeout(() => emit('SIGNED_OUT'), 0);
        return { error: null };
      },
      onAuthStateChange: (cb) => {
        if (typeof cb === 'function') {
          listeners.add(cb);
          setTimeout(() => {
            try {
              cb('INITIAL_SESSION', readSession());
            } catch {
              /* ignore */
            }
          }, 0);
        }
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(cb);
              },
            },
          },
        };
      },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => {
        const s = readSession();
        return { data: { user: s?.user ?? null }, error: null };
      },
    },
    from,
    channel: () => channelStub,
    removeChannel: async () => ({}),
  };
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
const supabase = isDemoMode ? createDemoClient() : createClient(url, anon);

export default supabase;
