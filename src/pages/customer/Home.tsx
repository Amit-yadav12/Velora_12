import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Clock, Star, Compass } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation } from '../../contexts/LocationContext';
import { Business, CATEGORIES, imgOnError } from '../../lib/product';
import { BusinessCard, SectionTitle, Rating, Grid } from '../../components/product';
import { apiGet } from '../../lib/api';
import { BusinessCardSkeleton } from '../../components/premium/Skeleton';
import { onBusinessesChanged, onDemoReset, onServicesChanged } from '../../services/events';
import DiscoverCard from '../../components/premium/DiscoverCard';
import LocationBar from '../../components/premium/LocationBar';
import { fetchDiscover } from '../../lib/hybridData';
import { readRecentViews, pushSearchHistory, type RecentView } from '../../lib/smartSearch';
import { prefetch } from '../../lib/smartCache';

const recentToCard = (r: RecentView): Business => ({
  id: r.id, name: r.name, category: r.category, city: r.city,
  image_url: r.image_url, rating: r.rating ?? 0, review_count: 0,
});

export default function Home() {
  const { profile, user } = useAuth();
  const { city, mapCenter } = useLocation();
  const origin = mapCenter;
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [recent, setRecent] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  // ONE fast hybrid call powers the whole page — city-scoped, cached, with a
  // synthetic ecosystem fallback so the page is never empty. Recently-viewed
  // loads separately (non-blocking) so it can never delay the main content.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDiscover({ city: city.name, lat: origin.lat, lng: origin.lng, sort: 'distance' })
      .then((disc) => {
        if (!alive) return;
        setBusinesses(disc.results);
        setLoading(false);
        // Intelligent prefetch: warm top detail pages during idle time. Demo
        // tenant businesses resolve locally, so they are never fetched (the
        // server has no rows for them — a request would just 404).
        prefetch(disc.results.filter((b) => !String(b.id).startsWith('demo-')).slice(0, 6).map((b) => `/api/businesses?id=${b.id}`));
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [city.name, origin.lat, origin.lng]);

  // Real-time: new/edited demo businesses appear immediately.
  useEffect(() => {
    const refresh = () => {
      fetchDiscover({ city: city.name, lat: origin.lat, lng: origin.lng, sort: 'distance' })
        .then((disc) => setBusinesses(disc.results))
        .catch(() => {});
    };
    const offs = [onBusinessesChanged(refresh), onServicesChanged(refresh), onDemoReset(refresh)];
    return () => { offs.forEach((off) => off()); };
  }, [city.name, origin.lat, origin.lng]);

  useEffect(() => {
    // Instant local recents first, then server merge (city-pinned).
    const local = readRecentViews().filter((r) => !r.city || r.city === city.name);
    if (local.length) setRecent(local.map(recentToCard));
    if (!user) return;
    apiGet<RecentView[]>(`/api/track-view?user_id=${user.id}`)
      .then((r) => {
        if (!Array.isArray(r)) return;
        const pinned = r.filter((b) => !b.city || b.city === city.name);
        setRecent((prev) => {
          const seen = new Set(pinned.map((b) => String(b.id)));
          return [...pinned.map(recentToCard), ...prev.filter((b) => !seen.has(String(b.id)))].slice(0, 8);
        });
      })
      .catch(() => {});
  }, [user, city.name]);

  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); if (q.trim()) pushSearchHistory(q.trim()); nav(`/explore?q=${encodeURIComponent(q)}`); };

  const featured = businesses.filter(b => b.featured).slice(0, 3);
  const nearby = businesses.slice(0, 8);
  const openNow = businesses.filter((b) => b.open_now && b.next_available).slice(0, 4);
  const recommended = [...businesses].sort((a, b) => (b.ai_score || b.rating) - (a.ai_score || a.rating)).slice(0, 8);

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

      {/* NOTE: the business demo entry lives in the BUSINESS sign-in path
          (Welcome → Business → "Continue as demo business" → /admin). The
          customer app stays customer-only — no console shortcuts here. */}

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
            {openNow.map((b, i) => (
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
          <div><h2 className="text-lg font-semibold tracking-tight">Nearby in {city.name}</h2><p className="text-xs text-dim">Sorted by distance from {origin.label || city.name}</p></div>
          <Link to="/explore?view=map" className="text-sm text-[var(--color-brand-indigo)] font-medium">Open map</Link>
        </div>
        <Grid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(loading ? Array.from({ length: 8 }, () => null) : nearby).map((b, i) => b ? <DiscoverCard key={b.id} b={b} /> : <BusinessCardSkeleton key={i} />)}
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
                <img src={b.image_url} alt={b.name} onError={imgOnError(b.category)} className="h-28 w-full object-cover" loading="lazy" />
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
