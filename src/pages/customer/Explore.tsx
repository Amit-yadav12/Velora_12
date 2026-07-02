import { useEffect, useState, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, List, SlidersHorizontal, Sparkles, Search, X, Compass } from 'lucide-react';
import { CATEGORIES } from '../../lib/product';
import { Grid } from '../../components/product';
import { useLocation, DEFAULT_CENTER } from '../../contexts/LocationContext';
import { useTheme } from '../../lib/theme';
import LocationBar from '../../components/premium/LocationBar';
import DiscoverCard from '../../components/premium/DiscoverCard';
import EmptyState from '../../components/premium/EmptyState';
import { BusinessCardSkeleton } from '../../components/premium/Skeleton';
import supabase from '../../lib/supabase';

const MapView = lazy(() => import('../../components/premium/MapView'));

const SORTS = [
  { id: 'ai', label: 'AI Recommended' }, { id: 'distance', label: 'Nearest' },
  { id: 'rating', label: 'Top rated' }, { id: 'availability', label: 'Soonest' },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const { location } = useLocation();
  const { theme } = useTheme();
  const origin = location || DEFAULT_CENTER;

  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || 'All');
  const [sort, setSort] = useState(params.get('view') === 'map' ? 'distance' : 'ai');
  const [view, setView] = useState<'list' | 'map'>(params.get('view') === 'map' ? 'map' : 'list');
  const [openNow, setOpenNow] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxKm, setMaxKm] = useState(0);
  const [results, setResults] = useState<any[]>([]);
  const [topPick, setTopPick] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchResults = () => {
    setLoading(true);
    const p = new URLSearchParams();
    p.set('lat', String(origin.lat)); p.set('lng', String(origin.lng));
    if (q) p.set('q', q);
    if (category !== 'All') p.set('category', category);
    p.set('sort', sort);
    if (openNow) p.set('open_now', 'true');
    if (minRating) p.set('min_rating', String(minRating));
    if (maxKm) p.set('max_km', String(maxKm));
    fetch(`/api/discover?${p.toString()}`).then(r => r.json()).then(d => {
      setResults(d.results || []); setTopPick(d.top_pick || null); setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchResults(); /* eslint-disable-next-line */ }, [category, sort, openNow, minRating, maxKm, origin.lat, origin.lng]);
  useEffect(() => { const t = setTimeout(fetchResults, 350); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);
  // Real-time: refresh discovery when any booking changes (availability shifts)
  useEffect(() => {
    const ch = supabase.channel('discover-rt').on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchResults()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [category, sort, origin.lat, origin.lng]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q); if (category !== 'All') p.set('category', category); if (view === 'map') p.set('view', 'map');
    setParams(p, { replace: true });
    // eslint-disable-next-line
  }, [q, category, view]);

  const mapBusinesses = useMemo(() => results.filter(b => b.lat != null), [results]);
  const activeFilters = (openNow ? 1 : 0) + (minRating ? 1 : 0) + (maxKm ? 1 : 0);

  return (
    <div className="pb-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <LocationBar />
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search businesses & services…" className="w-full rounded-xl bg-elev border border-app pl-10 pr-9 py-2 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-dim" /></button>}
        </div>
        <button onClick={() => setShowFilters(s => !s)} className={`relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${activeFilters ? 'border-[var(--color-brand-indigo)] text-[var(--color-brand-indigo)]' : 'border-app'}`}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilters > 0 && <span className="h-4 w-4 rounded-full grad-btn text-white text-[9px] grid place-items-center">{activeFilters}</span>}
        </button>
        <div className="flex rounded-xl border border-app p-0.5">
          <button onClick={() => setView('list')} className={`h-8 w-8 grid place-items-center rounded-lg ${view === 'list' ? 'grad-btn text-white' : 'text-muted'}`}><List className="h-4 w-4" /></button>
          <button onClick={() => setView('map')} className={`h-8 w-8 grid place-items-center rounded-lg ${view === 'map' ? 'grad-btn text-white' : 'text-muted'}`}><MapIcon className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
        {CATEGORIES.map(c => (
          <button key={c.name} onClick={() => setCategory(c.name)} className={`flex items-center gap-1.5 whitespace-nowrap text-sm rounded-full px-3.5 py-1.5 transition-all ${category === c.name ? 'grad-btn text-white' : 'border border-app text-muted hover:border-[var(--border-strong)]'}`}>
            <c.icon className="h-3.5 w-3.5" /> {c.name}
          </button>
        ))}
      </div>

      {/* Sort + filters panel */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {SORTS.map(s => <button key={s.id} onClick={() => setSort(s.id)} className={`text-xs rounded-lg px-3 py-1.5 whitespace-nowrap ${sort === s.id ? 'bg-[var(--surface-hover)] text-[var(--text)] font-medium' : 'text-dim'}`}>{s.id === 'ai' && '✦ '}{s.label}</button>)}
        </div>
        <span className="ml-auto text-xs text-dim">{loading ? 'Finding…' : `${results.length} nearby`}</span>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.22,1,0.36,1] }} className="card p-4 mb-4 grid sm:grid-cols-3 gap-4">
            <div><label className="text-xs text-dim">Open now</label><button onClick={() => setOpenNow(v => !v)} className={`mt-1 w-full rounded-lg py-2 text-sm ${openNow ? 'grad-btn text-white' : 'border border-app'}`}>{openNow ? 'Open only' : 'Any'}</button></div>
            <div><label className="text-xs text-dim">Min rating</label>
              <div className="mt-1 flex gap-1">{[0, 4, 4.5, 4.8].map(r => <button key={r} onClick={() => setMinRating(r)} className={`flex-1 rounded-lg py-2 text-xs ${minRating === r ? 'grad-btn text-white' : 'border border-app'}`}>{r === 0 ? 'Any' : `${r}★`}</button>)}</div>
            </div>
            <div><label className="text-xs text-dim">Max distance {maxKm ? `(${maxKm} km)` : ''}</label>
              <input type="range" min={0} max={20} step={1} value={maxKm} onChange={e => setMaxKm(+e.target.value)} className="mt-3 w-full accent-[var(--color-brand-indigo)]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI top pick banner */}
      {topPick && !loading && results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4 rounded-2xl p-4 relative overflow-hidden border border-[var(--color-brand-indigo)]/30" style={{ background: 'linear-gradient(100deg, rgba(99,102,241,0.12), rgba(52,211,153,0.08))' }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl grad-btn grid place-items-center shrink-0"><Sparkles className="h-5 w-5 text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[var(--color-brand-indigo)] font-medium">AI recommends</p>
              <p className="font-semibold truncate">{topPick.name} <span className="text-dim font-normal text-sm">· score {topPick.ai_score}</span></p>
              {(() => { const r = Array.isArray(topPick.ai_reason) ? topPick.ai_reason : topPick.ai_reason ? [topPick.ai_reason] : []; return r.length > 0 ? <p className="text-xs text-dim">Because it's {r.join(', ')}.</p> : null; })()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Views */}
      {view === 'map' ? (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 h-[380px] lg:h-[600px] card p-0 overflow-hidden">
            <Suspense fallback={<div className="skeleton h-full w-full" />}>
              <MapView origin={origin} businesses={mapBusinesses} activeId={active} onSelect={setActive} theme={theme} />
            </Suspense>
          </div>
          <div className="lg:col-span-2 space-y-3 lg:max-h-[600px] lg:overflow-y-auto no-scrollbar">
            {loading ? Array.from({ length: 4 }).map((_, i) => <BusinessCardSkeleton key={i} />) :
              results.length === 0 ? <EmptyState icon={Compass} title="Nothing nearby" sub="Try widening your filters or searching another area." /> :
                results.map((b) => <DiscoverCard key={b.id} b={b} active={active === b.id} onHover={setActive} compact />)}
          </div>
        </div>
      ) : (
        loading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <BusinessCardSkeleton key={i} />)}</div> :
          results.length === 0 ? <EmptyState icon={Compass} title="No businesses found" sub="Adjust your filters, change your location, or try a different category." /> :
            <Grid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{results.map((b) => <DiscoverCard key={b.id} b={b} onHover={setActive} active={active === b.id} />)}</Grid>
      )}
    </div>
  );
}
