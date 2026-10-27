import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Crosshair, Search, Loader2, X } from 'lucide-react';
import { useLocation, POPULAR_CITIES } from '../../contexts/LocationContext';
import { getCity } from '../../lib/cities';
import { Coords } from '../../lib/geo';

export default function LocationBar() {
  const { location, status, requestLocation, setManual, city, setCity, isLive } = useLocation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [preds, setPreds] = useState<Coords[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchNotice, setSearchNotice] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    const t = setTimeout(async () => {
      if (q.trim().length < 3) { setPreds([]); setSearchNotice(''); setLoading(false); return; }
      setLoading(true);
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Address search unavailable');
        const data = await response.json();
        if (live) { setPreds(data.predictions || []); setSearchNotice(data.unavailable ? 'Address search unavailable. Choose a city below.' : ''); }
      } catch { if (live) { setPreds([]); setSearchNotice('Address search unavailable. Choose a city below.'); } }
      finally { if (live) setLoading(false); }
    }, 300);
    return () => { live = false; clearTimeout(t); controller.abort(); };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  // Reset search state whenever the panel opens or closes, so reopening always
  // starts fresh (no stale query, predictions, or loading spinner).
  useEffect(() => {
    setQ('');
    setPreds([]);
    setLoading(false); setSearchNotice('');
  }, [open]);

  const label = isLive ? city.name : location?.label || city.name;
  const sub = isLive && location ? ' · GPS on' : '';

  return (
    <div ref={boxRef} className="relative">
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2 rounded-xl border border-app bg-elev px-3 py-2 text-sm hover:border-[var(--border-strong)] transition-colors max-w-full">
        <MapPin className="h-4 w-4 text-[var(--text-link-strong)] shrink-0" />
        <span className="truncate max-w-[160px]">{status === 'prompting' ? 'Locating…' : `${label}${sub}`}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="absolute left-0 mt-2 w-80 glass rounded-2xl shadow-2xl overflow-hidden z-50 p-2">
            <button onClick={() => { requestLocation(); setOpen(false); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-[var(--surface-hover)] text-sm">
              <Crosshair className="h-4 w-4 text-[var(--text-link-strong)]" /> Use my current location
            </button>
            {status === 'denied' && <p className="px-3 py-1.5 text-[11px] text-amber-400">Location blocked — search a city below.</p>}
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-dim" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search city or address…" className="w-full rounded-xl bg-elev border border-app pl-9 pr-8 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)]" />
              {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-dim" />}
              {!loading && q && <button onClick={() => { setQ(''); setPreds([]); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-3.5 w-3.5 text-dim" /></button>}
            </div>
            {searchNotice && <p role="status" className="px-3 py-2 text-xs text-amber-400">{searchNotice}</p>}
            {(!q || searchNotice) && (
              <div className="mt-2 px-1">
                <p className="text-[10px] uppercase tracking-wide text-dim px-2 mb-1.5">Popular cities</p>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_CITIES.map((c) => (
                    <button key={c.label} onClick={() => { if (c.label) setCity(c.label); setOpen(false); }} className={`text-xs rounded-full px-2.5 py-1 transition-colors ${city.name === c.label ? 'grad-btn text-white' : 'border border-app text-muted hover:border-[var(--border-strong)]'}`}>{c.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-1 max-h-56 overflow-y-auto no-scrollbar">
              {preds.map((p, i) => (
                <button key={i} onClick={() => {
                  // City predictions pin the city; addresses set a manual point.
                  const first = (p.label || '').split(',')[0].trim();
                  const asCity = getCity(first);
                  if (asCity) setCity(asCity.name);
                  else setManual({ ...p, label: p.label?.split(',').slice(0, 2).join(',') });
                  setOpen(false); setQ(''); setPreds([]);
                }} className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--surface-hover)] text-left">
                  <MapPin className="h-3.5 w-3.5 text-dim mt-0.5 shrink-0" />
                  <span className="text-xs text-muted line-clamp-2">{p.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
