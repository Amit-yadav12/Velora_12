import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Star, Sparkles, CornerDownLeft, TrendingUp, History, MapPin } from 'lucide-react';
import { CATEGORIES, categoryIcon, categoryColor, imgOnError } from '../../lib/product';
import { useLocation } from '../../contexts/LocationContext';
import { fetchDiscover } from '../../lib/hybridData';
import { buildSuggestions, pushSearchHistory, readRecentViews, type Suggestion, type RecentView } from '../../lib/smartSearch';
import type { Business } from '../../lib/product';

type Item = { type: 'suggest'; data: Suggestion } | { type: 'recent'; data: RecentView };

export default function Spotlight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { city, mapCenter } = useLocation();
  const [q, setQ] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // City-scoped corpus for instant AI search (cached hybrid payload).
      fetchDiscover({ city: city.name, lat: mapCenter.lat, lng: mapCenter.lng, sort: 'ai' })
        .then((d) => setBusinesses(d.results || []))
        .catch(() => {});
      setQ(''); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, city.name, mapCenter.lat, mapCenter.lng]);

  const suggestions: Suggestion[] = useMemo(
    () => buildSuggestions({ query: q, businesses, categories: CATEGORIES, city: city.name, limit: 9 }),
    [q, businesses, city.name]
  );
  const recent = useMemo(() => (open && !q ? readRecentViews().slice(0, 3) : []), [open, q]);

  const items: Item[] = [
    ...suggestions.map((s) => ({ type: 'suggest' as const, data: s })),
    ...recent.map((r) => ({ type: 'recent' as const, data: r })),
  ];

  const select = (item?: Item) => {
    if (!item) { if (q.trim()) { pushSearchHistory(q.trim()); nav(`/search?q=${encodeURIComponent(q)}`); onClose(); } return; }
    if (item.type === 'recent') { nav(`/business/${item.data.id}`); onClose(); return; }
    const s = item.data;
    if (s.kind === 'business' && s.id != null) nav(`/business/${s.id}`);
    else if (s.kind === 'category') nav(`/search?category=${encodeURIComponent(s.text)}`);
    else { pushSearchHistory(s.text); nav(`/search?q=${encodeURIComponent(s.text)}`); }
    onClose();
  };

  // Keyboard navigation reads the latest state via ref — the listener is
  // subscribed once per open, not re-created on every keystroke.
  const keyRef = useRef({ items, active, onClose, select });
  useEffect(() => { keyRef.current = { items, active, onClose, select }; });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = keyRef.current;
      if (!open) return;
      if (e.key === 'Escape') k.onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, k.items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); k.select(k.items[k.active]); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const iconFor = (s: Suggestion) => {
    if (s.kind === 'trending') return <TrendingUp className="h-4 w-4 text-[var(--color-brand-indigo)]" />;
    if (s.kind === 'history') return <History className="h-4 w-4 text-dim" />;
    if (s.kind === 'category') return <Sparkles className="h-4 w-4 text-[var(--color-brand-indigo)]" />;
    return <Search className="h-4 w-4 text-dim" />;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <motion.div initial={{ scale: 0.96, y: -12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 340 }} className="relative w-full max-w-xl glass rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-app">
              <Search className="h-5 w-5 text-dim" />
              <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder={`Search in ${city.name}…`} className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--text-dim)]" />
              <kbd className="text-[10px] text-dim border border-app rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto no-scrollbar p-2">
              {items.length === 0 && <div className="px-3 py-10 text-center text-sm text-dim">No results. Press Enter to search.</div>}
              {!q && suggestions.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-dim">Trending in {city.name}</p>}
              {!!q && suggestions.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-dim">Suggestions</p>}
              {items.map((item, i) => {
                const isActive = i === active;
                if (item.type === 'recent') {
                  const b = item.data;
                  const Icon = categoryIcon(b.category);
                  return (
                    <div key={`r-${b.id}`}>
                      {i === suggestions.length && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-dim">Recently viewed</p>}
                      <button onMouseEnter={() => setActive(i)} onClick={() => select(item)} className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl ${isActive ? 'bg-[var(--surface-hover)]' : ''}`}>
                        {b.image_url ? <img src={b.image_url} alt={b.name} onError={imgOnError(b.category)} className="h-10 w-10 rounded-xl object-cover" /> : <div className="h-10 w-10 rounded-xl grid place-items-center bg-surface"><Icon className="h-4 w-4" style={{ color: categoryColor(b.category) }} /></div>}
                        <div className="flex-1 text-left min-w-0"><p className="text-sm font-medium truncate">{b.name}</p><p className="text-xs text-dim flex items-center gap-1.5"><Icon className="h-3 w-3" style={{ color: categoryColor(b.category) }} />{b.category} · {b.city}</p></div>
                        {b.rating != null && <span className="text-xs flex items-center gap-1 shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(b.rating).toFixed(1)}</span>}
                        {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-dim shrink-0" />}
                      </button>
                    </div>
                  );
                }
                const s = item.data;
                return (
                  <button key={`s-${i}`} onMouseEnter={() => setActive(i)} onClick={() => select(item)} className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl ${isActive ? 'bg-[var(--surface-hover)]' : ''}`}>
                    <div className="h-9 w-9 rounded-xl grid place-items-center bg-surface shrink-0">{iconFor(s)}</div>
                    <span className="flex-1 text-left min-w-0">
                      <span className="block text-sm truncate">{s.text}</span>
                      {s.sub && <span className="text-xs text-dim flex items-center gap-1"><MapPin className="h-3 w-3" />{s.sub}</span>}
                    </span>
                    {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-dim shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-app flex items-center gap-3 text-[10px] text-dim">
              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI instant search · {city.name}</span>
              <span className="ml-auto">↑↓ navigate · ↵ select</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
