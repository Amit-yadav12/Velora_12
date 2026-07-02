import { createContext, useContext, useState, useEffect, useRef } from 'react';
import supabase from '../lib/supabase';

interface Profile { id: string; email: string; full_name: string; role: string; }
interface Ctx { user: any; profile: Profile | null; loading: boolean; role: string; signOut: () => Promise<void>; refresh: () => void; }
const AuthContext = createContext<Ctx>({ user: null, profile: null, loading: true, role: 'customer', signOut: async () => {}, refresh: () => {} });

const CACHE_KEY = 'velora-profile';
const readCache = (): Profile | null => { try { const s = localStorage.getItem(CACHE_KEY); return s ? JSON.parse(s) : null; } catch { return null; } };
const writeCache = (p: Profile | null) => {
  try { if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p)); else localStorage.removeItem(CACHE_KEY); } catch { /* non-fatal */ }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // Guard against redirect loops / duplicate profile fetches.
  const lastUid = useRef<string | null>(null);

  const applyProfile = (p: Profile | null) => { setProfile(p); writeCache(p); };

  const loadProfile = async (u: any) => {
    if (!u) { applyProfile(null); return; }
    // Only trust cache if it matches this exact user.
    const cached = readCache();
    if (cached && cached.id === u.id) setProfile(cached);
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', u.id).single();
      if (data) { applyProfile(data as Profile); return; }
      const created: Profile = {
        id: u.id, email: u.email,
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Guest',
        role: 'customer',
      };
      await supabase.from('profiles').upsert(created);
      applyProfile(created);
    } catch (e) {
      console.error('[auth] loadProfile failed:', e);
      if (!cached || cached.id !== u.id) {
        applyProfile({ id: u.id, email: u.email, full_name: u.email?.split('@')[0] || 'Guest', role: 'customer' });
      }
    }
  };

  useEffect(() => {
    let mounted = true;
    const safety = setTimeout(() => { if (mounted) setLoading(false); }, 4000);

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      const u = session?.user ?? null;
      lastUid.current = u?.id ?? null;
      setUser(u);
      await loadProfile(u);
      if (mounted) { clearTimeout(safety); setLoading(false); }
    };
    init().catch((e) => { console.error('[auth] init failed:', e); if (mounted) { clearTimeout(safety); setLoading(false); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      // Ignore events that don't change the user (e.g. TOKEN_REFRESHED) to avoid loops.
      if (u?.id === lastUid.current && event !== 'SIGNED_OUT') { setUser(u); return; }
      lastUid.current = u?.id ?? null;
      setUser(u);
      if (u) loadProfile(u); else applyProfile(null);
      setLoading(false);
    });
    return () => { mounted = false; clearTimeout(safety); subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    lastUid.current = null;
    setUser(null); applyProfile(null);
    try { await supabase.auth.signOut(); } catch (e) { console.error('[auth] signOut error:', e); }
    try { Object.keys(localStorage).filter((k) => k.startsWith('sb-') || k.includes('supabase')).forEach((k) => localStorage.removeItem(k)); } catch { /* non-fatal */ }
  };
  const refresh = () => loadProfile(user);

  return <AuthContext.Provider value={{ user, profile, loading, role: profile?.role || 'customer', signOut, refresh }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
