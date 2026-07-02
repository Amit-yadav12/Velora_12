import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Clock, Star, Compass } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation, DEFAULT_CENTER } from '../../contexts/LocationContext';
import { Business, CATEGORIES } from '../../lib/product';
import { BusinessCard, SectionTitle, Rating, Grid } from '../../components/product';
import { apiGet } from '../../lib/api';
import { BusinessCardSkeleton } from '../../components/premium/Skeleton';
import DiscoverCard from '../../components/premium/DiscoverCard';
import LocationBar from '../../components/premium/LocationBar';

// Fetch with a hard timeout so the UI never hangs on a slow request.
function timedFetch(url: string, ms = 4500) {
  return Promise.race([
    fetch(url).then(r => r.json()),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

export default function Home() {
  const { profile, user } = useAuth();
  const { location } = useLocation();
  const origin = location || DEFAULT_CENTER;
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [recent, setRecent] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  // ONE fast primary call powers the whole page. Recently-viewed loads
  // separately (non-blocking) so it can never delay the main content.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    timedFetch(`/api/discover?lat=${origin.lat}&lng=${origin.lng}&sort=distance`)
      .then((disc: any) => {
        if (!alive) return;
        const results = disc?.results || [];
        setBusinesses(results);
        setLoading(false);
      })
      .catch(() => {
        // Fallback: plain business list (never leave the page empty).
        fetch('/api/businesses').then(r => r.json()).then((d) => {
          if (!alive) return;
          setBusinesses(Array.isArray(d) ? d : []);
          setLoading(false);
        }).catch(() => alive && setLoading(false));
      });
    return () => { alive = false; };
  }, [origin.lat, origin.lng]);

  useEffect(() => {
    if (!user) return;
    apiGet(`/api/track-view?user_id=${user.id}`).then((r) => Array.isArray(r) && setRecent(r)).catch(() => {});
  }, [user]);

  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); nav(`/explore?q=${encodeURIComponent(q)}`); };

  const featured = businesses.filter(b => (b as any).featured).slice(0, 3);
  const nearby = businesses.slice(0, 8);
  const openNow = businesses.filter((b: any) => b.open_now && b.next_available).slice(0, 4);
  const recommended = [...businesses].sort((a: any, b: any) => (b.ai_score || b.rating) - (a.ai_score || a.rating)).slice(0, 8);

  return (
    <div className="space-y-9">
      {/* Hero + search */}
      <section>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-sm text-dim">{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}, {profile?.full_name?.split(' ')[0] || 'there'} 👋</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-semibold tracking-tight">What would you like to <span className="grad-text">book</span> today?</h1>
        </motion.div>
        <div className="mt-4"><LocationBar /></div>
        <motion.form onSubmit={submitSearch} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.08 }} className="mt-3 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-dim" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clinics, salons, coaches, courts…" className="w-full rounded-2xl bg-elev border border-app pl-12 pr-28 py-4 text-[15px] outline-none focus:border-[var(--color-brand-indigo)] transition-colors shadow-sm" />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 grad-btn text-white text-sm font-medium rounded-xl px-4 py-2.5">Search</button>
        </motion.form>
      </section>

      {/* Categories */}
      <section>
        <SectionTitle title="Browse by category" action="View all" to="/explore" />
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {CATEGORIES.filter(c => c.name !== 'All').map((c, i) => (
            <motion.div key={c.name} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }}>
              <Link to={`/explore?category=${encodeURIComponent(c.name)}`} className="flex flex-col items-center gap-2 min-w-[84px] group">
                <div className="h-16 w-16 rounded-2xl grid place-items-center border border-app group-hover:border-[var(--border-strong)] transition-all group-hover:-translate-y-1" style={{ background: `${c.color}15` }}>
                  <c.icon className="h-6 w-6" style={{ color: c.color }} />
                </div>
                <span className="text-xs text-muted text-center leading-tight">{c.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Available right now */}
      {openNow.length > 0 && (
        <section>
          <SectionTitle title="Available right now" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {openNow.map((b: any, i) => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Link to={`/business/${b.id}`} className="card p-4 block group h-full">
                  <div className="flex items-center gap-2 text-xs text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> Open now</div>
                  <p className="mt-2 font-medium leading-tight group-hover:text-[var(--color-brand-indigo)] transition-colors line-clamp-1">{b.name}</p>
                  <p className="text-sm text-dim truncate">{b.category}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-sm font-medium"><Clock className="h-3.5 w-3.5 text-[var(--color-brand-indigo)]" /> {b.next_available_label}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-amber-400"><Star className="h-3 w-3 fill-amber-400" />{Number(b.rating).toFixed(1)}</span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section>
          <SectionTitle title="Featured providers" action="See all" to="/explore" />
          <Grid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {featured.map((b) => <BusinessCard key={b.id} b={b} />)}
          </Grid>
        </section>
      )}

      {/* Nearby */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div><h2 className="text-lg font-semibold tracking-tight">Nearby you</h2><p className="text-xs text-dim">Sorted by distance from {origin.label || 'your area'}</p></div>
          <Link to="/explore?view=map" className="text-sm text-[var(--color-brand-indigo)] font-medium">Open map</Link>
        </div>
        <Grid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(loading ? Array.from({ length: 8 }) : nearby).map((b: any, i) => b ? <DiscoverCard key={b.id} b={b} /> : <BusinessCardSkeleton key={i} />)}
        </Grid>
        {!loading && nearby.length === 0 && (
          <button onClick={() => nav('/explore')} className="card p-6 w-full flex items-center gap-3 text-left"><div className="h-10 w-10 rounded-xl grad-btn grid place-items-center"><Compass className="h-5 w-5 text-white" /></div><div><p className="font-medium">Explore all providers</p><p className="text-sm text-dim">Browse every business across categories.</p></div></button>
        )}
      </section>

      {/* Recently viewed */}
      {recent.length > 0 && (
        <section>
          <SectionTitle title="Recently viewed" />
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {recent.map(b => (
              <Link key={b.id} to={`/business/${b.id}`} className="card overflow-hidden min-w-[220px] group">
                <img src={b.image_url} alt={b.name} className="h-28 w-full object-cover" loading="lazy" />
                <div className="p-3"><p className="text-sm font-medium truncate">{b.name}</p><div className="flex items-center justify-between mt-1"><span className="text-xs text-dim">{b.category}</span><Rating value={b.rating} sm /></div></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recommended */}
      {recommended.length > 0 && (
        <section>
          <SectionTitle title="Recommended for you" />
          <Grid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommended.map((b) => <BusinessCard key={b.id} b={b} />)}
          </Grid>
        </section>
      )}

      <div className="h-4" />
    </div>
  );
}
