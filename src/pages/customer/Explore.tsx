import { useEffect, useState, useMemo, lazy, Suspense, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Map as MapIcon, List, SlidersHorizontal, Sparkles, Search, X, Compass, Pin, TrendingUp, History } from 'lucide-react';
import { CATEGORIES, type Business } from '../../lib/product';
import { Grid } from '../../components/product';
import { useLocation } from '../../contexts/LocationContext';
import { useTheme } from '../../lib/theme';
import LocationBar from '../../components/premium/LocationBar';
import DiscoverCard from '../../components/premium/DiscoverCard';
import EmptyState from '../../components/premium/EmptyState';
import { BusinessCardSkeleton } from '../../components/premium/Skeleton';
import GoogleMapEmbed from '../../components/premium/GoogleMapEmbed';
import supabase from '../../lib/supabase';
import { onBookingsChanged, onBusinessesChanged, onServicesChanged, onStaffChanged } from '../../services/events';
import { fetchDiscover, hydrateLiveBusiness } from '../../lib/hybridData';
import { buildSuggestions, pushSearchHistory, type Suggestion } from '../../lib/smartSearch';
import { cacheSet } from '../../lib/smartCache';
import type { LivePlace } from '../../lib/googleMaps';

const MapView = lazy(() => import('../../components/premium/MapView'));

const SORTS = [
  { id: 'ai', label: 'AI Recommended' }, { id: 'distance', label: 'Nearest' },
  { id: 'rating', label: 'Top rated' }, { id: 'availability', label: 'Soonest' },
  { id: 'price_low', label: 'Price: low' },
];

export default function Explore() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const { city, mapCenter } = useLocation();
  const { theme } = useTheme();
  const origin = mapCenter;

  const [q, setQ] = useState(params.get('q') || '');
  const [category, setCategory] = useState(params.get('category') || 'All');
  const [sort, setSort] = useState(params.get('view') === 'map' ? 'distance' : 'ai');
  const [view, setView] = useState<'list' | 'map'>(params.get('view') === 'map' ? 'map' : 'list');
  const [mapMode, setMapMode] = useState<'google' | 'pins'>('google');
  const [openNow, setOpenNow] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxKm, setMaxKm] = useState(0);
  const [priceMax, setPriceMax] = useState(0);
  const [results, setResults] = useState<Business[]>([]);
  const [topPick, setTopPick] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<number | string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const fetchResults = () => {
    setLoading(true);
    fetchDiscover({
      city: city.name, lat: origin.lat, lng: origin.lng,
      category, q, sort, openNow, minRating, maxKm, priceMax,
      includeLive: view === 'map',
    }).then((d) => {
      setResults(d.results || []); setTopPick(d.top_pick || null); setLoading(false);
    }).catch(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchResults intentionally unmemoized; q is debounced by the next effect
  useEffect(() => { fetchResults(); }, [category, sort, openNow, minRating, maxKm, priceMax, city.name, origin.lat, origin.lng, view]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced q; immediate + debounced fetch split is intentional
  useEffect(() => { const t = setTimeout(fetchResults, 350); return () => clearTimeout(t); }, [q]);
  // Real-time: refresh discovery when any booking changes (availability shifts)
  // or when demo businesses/services change in the console (add / edit / deactivate).
  useEffect(() => {
    const ch = supabase.channel('discover-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, fetchResults)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, fetchResults)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_services' }, fetchResults)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_staff' }, fetchResults)
      .subscribe();
    const offBookings = onBookingsChanged(fetchResults);
    const offBiz = onBusinessesChanged(fetchResults);
    const offSvc = onServicesChanged(fetchResults);
    const offStaff = onStaffChanged(fetchResults);
    return () => { supabase.removeChannel(ch); offBookings(); offBiz(); offSvc(); offStaff(); };
    // eslint-disable-next-line
  }, [category, sort, city.name, origin.lat, origin.lng]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q); if (category !== 'All') p.set('category', category); if (view === 'map') p.set('view', 'map');
    setParams(p, { replace: true });
    // eslint-disable-next-line
  }, [q, category, view]);
  // Sync when arriving via links (Home category tiles, concierge, etc.)
  useEffect(() => {
    const pq = params.get('q') || '';
    const pc = params.get('category') || 'All';
    if (pq !== q) setQ(pq);
    if (pc !== category) setCategory(pc);
    // eslint-disable-next-line
  }, [params]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSuggestOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const suggestions: Suggestion[] = useMemo(
    () => buildSuggestions({ query: q, businesses: results, categories: CATEGORIES, city: city.name }),
    [q, results, city.name]
  );

  const pickSuggestion = (s: Suggestion) => {
    if (s.kind === 'business' && s.id != null) {
      pushSearchHistory(s.text);
      nav(`/business/${s.id}`);
    } else if (s.kind === 'category') {
      setCategory(s.text);
      setQ('');
    } else {
      setQ(s.text);
      pushSearchHistory(s.text);
    }
    setSuggestOpen(false);
  };

  const selectLive = (place: LivePlace) => {
    // Hydrate the live Google place into a booking-ready profile and cache it
    // so the detail page opens instantly with live info + synthetic booking.
    const full = hydrateLiveBusiness(place, city.name, category !== 'All' ? category : undefined);
    cacheSet(`business:${full.id}`, full, 300000);
    pushSearchHistory(place.name);
    nav(`/business/${full.id}`);
  };

  const mapBusinesses = useMemo(() => results.filter(b => b.lat != null), [results]);
  const activeFilters = (openNow ? 1 : 0) + (minRating ? 1 : 0) + (maxKm ? 1 : 0) + (priceMax ? 1 : 0);

  return (
    <div className="pb-4">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <LocationBar />
        <div ref={searchRef} className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={e => { if (e.key === 'Enter' && q.trim()) { pushSearchHistory(q.trim()); setSuggestOpen(false); } }}
            placeholder={`Search in ${city.name}…`}
            className="w-full rounded-xl bg-elev border border-app pl-10 pr-9 py-2 text-sm outline-none focus:border-[var(--color-brand-indigo)]"
          />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-dim" /></button>}
          <AnimatePresence>
            {suggestOpen && suggestions.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="absolute left-0 right-0 mt-2 glass rounded-2xl shadow-2xl overflow-hidden z-50 p-1.5">
                {!q && <p className="px-3 pt-1.5 pb-1 text-[10px] uppercase tracking-wide text-dim">Trending in {city.name}</p>}
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => pickSuggestion(s)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--surface-hover)] text-left">
                    {s.kind === 'trending' ? <TrendingUp className="h-3.5 w-3.5 text-[var(--color-brand-indigo)] shrink-0" />
                      : s.kind === 'history' ? <History className="h-3.5 w-3.5 text-dim shrink-0" />
                      : s.kind === 'category' ? <Sparkles className="h-3.5 w-3.5 text-[var(--color-brand-indigo)] shrink-0" />
                      : <Search className="h-3.5 w-3.5 text-dim shrink-0" />}
                    <span className="flex-1 min-w-0"><span className="block text-sm truncate">{s.text}</span>{s.sub && <span className="block text-[11px] text-dim truncate">{s.sub}</span>}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button onClick={() => setShowFilters(s => !s)} className={`relative flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm ${activeFilters ? 'border-[var(--color-brand-indigo)] text-[var(--color-brand-indigo)]' : 'border-app'}`}>
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeFilters > 0 && <span className="h-4 w-4 rounded-full grad-btn text-white text-[9px] grid place-items-center">{activeFilters}</span>}
        </button>
        <div className="flex rounded-xl border border-app p-0.5">
          <button onClick={() => setView('list')} title="List view" className={`h-8 w-8 grid place-items-center rounded-lg ${view === 'list' ? 'grad-btn text-white' : 'text-muted'}`}><List className="h-4 w-4" /></button>
          <button onClick={() => setView('map')} title="Google Maps view" className={`h-8 w-8 grid place-items-center rounded-lg ${view === 'map' ? 'grad-btn text-white' : 'text-muted'}`}><MapIcon className="h-4 w-4" /></button>
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
        <span className="ml-auto text-xs text-dim">{loading ? 'Finding…' : `${results.length} in ${city.name}`}</span>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.22,1,0.36,1] }} className="card p-4 mb-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div><label className="text-xs text-dim">Open now</label><button onClick={() => setOpenNow(v => !v)} className={`mt-1 w-full rounded-lg py-2 text-sm ${openNow ? 'grad-btn text-white' : 'border border-app'}`}>{openNow ? 'Open only' : 'Any'}</button></div>
            <div><label className="text-xs text-dim">Min rating</label>
              <div className="mt-1 flex gap-1">{[0, 4, 4.5, 4.8].map(r => <button key={r} onClick={() => setMinRating(r)} className={`flex-1 rounded-lg py-2 text-xs ${minRating === r ? 'grad-btn text-white' : 'border border-app'}`}>{r === 0 ? 'Any' : `${r}★`}</button>)}</div>
            </div>
            <div><label className="text-xs text-dim">Max distance {maxKm ? `(${maxKm} km)` : ''}</label>
              <input type="range" min={0} max={20} step={1} value={maxKm} onChange={e => setMaxKm(+e.target.value)} className="mt-3 w-full accent-[var(--color-brand-indigo)]" />
            </div>
            <div><label className="text-xs text-dim">Max price {priceMax ? `(₹${priceMax.toLocaleString('en-IN')})` : ''}</label>
              <input type="range" min={0} max={10000} step={500} value={priceMax} onChange={e => setPriceMax(+e.target.value)} className="mt-3 w-full accent-[var(--color-brand-indigo)]" />
              {priceMax > 0 && <button onClick={() => setPriceMax(0)} className="mt-1 text-[11px] text-dim hover:text-[var(--text)]">Clear</button>}
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
              <p className="text-xs text-[var(--color-brand-indigo)] font-medium">AI recommends in {city.name}</p>
              <p className="font-semibold truncate">{topPick.name} <span className="text-dim font-normal text-sm">· score {topPick.ai_score}</span></p>
              {(() => { const r = Array.isArray(topPick.ai_reason) ? topPick.ai_reason : topPick.ai_reason ? [topPick.ai_reason] : []; return r.length > 0 ? <p className="text-xs text-dim">Because it's {r.join(', ')}.</p> : null; })()}
            </div>
          </div>
        </motion.div>
      )}

      {/* Views */}
      {view === 'map' ? (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 h-[380px] lg:h-[600px] card p-0 overflow-hidden relative">
            {mapMode === 'google' ? (
              <GoogleMapEmbed center={origin} city={city.name} category={category !== 'All' ? category : undefined} onSelectLive={selectLive} />
            ) : (
              <Suspense fallback={<div className="skeleton h-full w-full" />}>
                <MapView origin={origin} businesses={mapBusinesses} activeId={active} onSelect={setActive} theme={theme} />
              </Suspense>
            )}
            <div className="absolute left-3 top-[68px] flex rounded-xl border border-app bg-[var(--bg-elev)]/90 backdrop-blur p-0.5 z-[5]">
              <button onClick={() => setMapMode('google')} title="Live Google Maps" className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${mapMode === 'google' ? 'grad-btn text-white' : 'text-muted'}`}><MapIcon className="h-3.5 w-3.5" /> Google</button>
              <button onClick={() => setMapMode('pins')} title="Velora booking pins" className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${mapMode === 'pins' ? 'grad-btn text-white' : 'text-muted'}`}><Pin className="h-3.5 w-3.5" /> Pins</button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-3 lg:max-h-[600px] lg:overflow-y-auto no-scrollbar">
            {loading ? Array.from({ length: 4 }).map((_, i) => <BusinessCardSkeleton key={i} />) :
              results.length === 0 ? <EmptyState icon={Compass} title={`Nothing in ${city.name}`} sub="Try widening your filters or searching another area." /> :
                results.map((b) => <DiscoverCard key={b.id} b={b} active={String(active) === String(b.id)} onHover={(id) => setActive(id)} compact />)}
          </div>
        </div>
      ) : (
        loading ? <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <BusinessCardSkeleton key={i} />)}</div> :
          results.length === 0 ? <EmptyState icon={Compass} title="No businesses found" sub={`Adjust your filters, or explore another category in ${city.name}.`} /> :
            <Grid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{results.map((b) => <DiscoverCard key={b.id} b={b} onHover={(id) => setActive(id)} active={String(active) === String(b.id)} />)}</Grid>
      )}
    </div>
  );
}
