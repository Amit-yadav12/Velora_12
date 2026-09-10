import { useEffect, useMemo, useState } from 'react';
import { Search, Navigation, ExternalLink, Loader2, MapPin, Star, X } from 'lucide-react';
import { googleEmbedUrl, fetchLivePlaces, openGoogleMaps, type LivePlace, type MapCenter } from '../../lib/googleMaps';
import { imgOnError } from '../../lib/product';

// Real Google Maps discovery — keyless embed centered on the active city
// (or live GPS location), with live business search layered on top.
// Selecting a live business opens its Velora booking profile.
export default function GoogleMapEmbed({ center, city, category, onSelectLive }: {
  center: MapCenter;
  city: string;
  category?: string;
  onSelectLive?: (place: LivePlace) => void;
}) {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [live, setLive] = useState<LivePlace[]>([]);
  const [hasLive, setHasLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const embedSrc = useMemo(() => {
    const query = submitted || category || 'top rated';
    return googleEmbedUrl(`${query} in ${city}`, center, 14);
  }, [submitted, category, city, center]);

  // Live places refresh with city/category/search (best-effort, cached).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLivePlaces({ lat: center.lat, lng: center.lng, query: submitted || undefined, category: submitted ? undefined : category, city })
      .then(({ live: ok, results }) => {
        if (!alive) return;
        setHasLive(ok);
        setLive(results);
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [center.lat, center.lng, city, category, submitted]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(q.trim());
    setShowResults(true);
  };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl">
      <iframe
        title={`Google Maps — ${city}`}
        src={embedSrc}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />

      {/* Floating search */}
      <form onSubmit={submit} className="absolute left-3 right-3 top-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dim" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search on Google Maps in ${city}…`}
            className="glass w-full rounded-xl py-2.5 pl-9 pr-8 text-sm outline-none placeholder:text-[var(--text-dim)]"
          />
          {q && (
            <button type="button" onClick={() => { setQ(''); setSubmitted(''); }} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-dim" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => openGoogleMaps(center, submitted || category ? `${submitted || category} in ${city}` : city)}
          title="Open in Google Maps"
          className="glass grid h-10 w-10 shrink-0 place-items-center rounded-xl"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </form>

      {/* Center badge */}
      <div className="glass absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs">
        <MapPin className="h-3.5 w-3.5 text-[var(--color-brand-indigo)]" />
        <span className="max-w-[180px] truncate">{center.label || city}</span>
        {hasLive && <span className="flex items-center gap-1 text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />Live</span>}
      </div>
      <button
        onClick={() => openGoogleMaps(center)}
        className="glass absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
      >
        <Navigation className="h-3.5 w-3.5 text-[var(--color-brand-indigo)]" /> Directions
      </button>

      {/* Live results strip */}
      {loading && (
        <div className="glass absolute left-1/2 top-16 flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding live places…
        </div>
      )}
      {showResults && hasLive && live.length > 0 && (
        <div className="absolute inset-x-3 bottom-14 max-h-44 overflow-y-auto no-scrollbar space-y-2">
          {live.slice(0, 6).map((p) => (
            <button
              key={p.place_id}
              onClick={() => onSelectLive?.(p)}
              className="glass flex w-full items-center gap-3 rounded-2xl p-2 text-left"
            >
              {p.photos?.[0] ? (
                <img src={p.photos[0]} alt={p.name} className="h-11 w-11 shrink-0 rounded-xl object-cover" loading="lazy" onError={imgOnError(p.category || '')} />
              ) : (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface"><MapPin className="h-4 w-4 text-dim" /></div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-[11px] text-dim">{p.address}</p>
              </div>
              {p.rating != null && (
                <span className="flex shrink-0 items-center gap-1 text-xs"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(p.rating).toFixed(1)}</span>
              )}
              {p.open_now != null && (
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${p.open_now ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                  {p.open_now ? 'Open' : 'Closed'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
