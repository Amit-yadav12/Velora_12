import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Star, Sparkles, CornerDownLeft } from 'lucide-react';
import { CATEGORIES, categoryIcon, categoryColor } from '../../lib/product';

interface Item { type: 'cat' | 'biz'; data: any; }

export default function Spotlight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetch('/api/businesses').then(r => r.json()).then(d => Array.isArray(d) && setBusinesses(d)).catch(() => {});
      setQ(''); setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const term = q.toLowerCase();
  const bizResults = q
    ? businesses.filter(b => b.name.toLowerCase().includes(term) || b.category.toLowerCase().includes(term) || (b.city || '').toLowerCase().includes(term)).slice(0, 5)
    : businesses.slice(0, 4);
  const catResults = q ? CATEGORIES.filter(c => c.name !== 'All' && c.name.toLowerCase().includes(term)).slice(0, 3) : [];
  const items: Item[] = [...catResults.map(c => ({ type: 'cat' as const, data: c })), ...bizResults.map(b => ({ type: 'biz' as const, data: b }))];

  const select = (item?: Item) => {
    if (!item) { if (q) { nav(`/search?q=${encodeURIComponent(q)}`); onClose(); } return; }
    if (item.type === 'cat') nav(`/search?category=${encodeURIComponent(item.data.name)}`);
    else nav(`/business/${item.data.id}`);
    onClose();
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); select(items[active]); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, items, active]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
          <motion.div initial={{ scale: 0.96, y: -12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 340 }} className="relative w-full max-w-xl glass rounded-3xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-app">
              <Search className="h-5 w-5 text-dim" />
              <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setActive(0); }} placeholder="Search businesses, services, cities…" className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-[var(--text-dim)]" />
              <kbd className="text-[10px] text-dim border border-app rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <div className="max-h-[50vh] overflow-y-auto no-scrollbar p-2">
              {items.length === 0 && <div className="px-3 py-10 text-center text-sm text-dim">No results. Press Enter to search.</div>}
              {catResults.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-dim">Categories</p>}
              {items.map((item, i) => {
                const isActive = i === active;
                if (item.type === 'cat') {
                  const c = item.data;
                  return (
                    <button key={`c-${c.name}`} onMouseEnter={() => setActive(i)} onClick={() => select(item)} className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl ${isActive ? 'bg-[var(--surface-hover)]' : ''}`}>
                      <div className="h-9 w-9 rounded-xl grid place-items-center" style={{ background: `${c.color}22` }}><c.icon className="h-4 w-4" style={{ color: c.color }} /></div>
                      <span className="flex-1 text-left text-sm">{c.name}</span>
                      {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-dim" />}
                    </button>
                  );
                }
                const b = item.data; const Icon = categoryIcon(b.category);
                return (
                  <div key={`b-${b.id}`}>
                    {i === catResults.length && bizResults.length > 0 && <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-dim">Businesses</p>}
                    <button onMouseEnter={() => setActive(i)} onClick={() => select(item)} className={`flex w-full items-center gap-3 px-3 py-2.5 rounded-2xl ${isActive ? 'bg-[var(--surface-hover)]' : ''}`}>
                      <img src={b.image_url} alt={b.name} className="h-10 w-10 rounded-xl object-cover" />
                      <div className="flex-1 text-left min-w-0"><p className="text-sm font-medium truncate">{b.name}</p><p className="text-xs text-dim flex items-center gap-1.5"><Icon className="h-3 w-3" style={{ color: categoryColor(b.category) }} />{b.category} · {b.city}</p></div>
                      <span className="text-xs flex items-center gap-1 shrink-0"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(b.rating).toFixed(1)}</span>
                      {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-dim shrink-0" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2.5 border-t border-app flex items-center gap-3 text-[10px] text-dim">
              <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Instant search</span>
              <span className="ml-auto">↑↓ navigate · ↵ select</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
