import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, Clock, Navigation, Phone, Heart, ChevronRight, Sparkles, Car } from 'lucide-react';
import { categoryColor, mapsDirections, imgOnError } from '../../lib/product';
import { CategoryIcon } from '../product';
import { formatDistance, formatTravel } from '../../lib/geo';
import { fadeUp } from '../../lib/motion';
import { prefetchOnIntent } from '../../lib/smartCache';

export default function DiscoverCard({ b, active, onHover, compact }: {
  b: any; index?: number; active?: boolean; onHover?: (id: number | null) => void; compact?: boolean;
}) {
  const nav = useNavigate();
  const color = categoryColor(b.category);
  const [fav, setFav] = useState(false);

  const toggleFav = (e: React.MouseEvent) => { e.stopPropagation(); setFav(f => !f); };
  const directions = (e: React.MouseEvent) => { e.stopPropagation(); window.open(mapsDirections(b.address || b.name), '_blank'); };
  const call = (e: React.MouseEvent) => { e.stopPropagation(); window.location.href = `tel:${b.phone}`; };

  return (
    <motion.div
      variants={fadeUp}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '220px' } as React.CSSProperties}
      onMouseEnter={() => { onHover?.(b.id); prefetchOnIntent(`/api/businesses?id=${b.id}`); }} onMouseLeave={() => onHover?.(null)}
      onClick={() => nav(`/business/${b.id}`)}
      className={`card overflow-hidden cursor-pointer transition-all ${active ? 'ring-2 ring-[var(--color-brand-indigo)] border-transparent' : ''}`}>
      <div className="flex gap-3 p-3">
        <div className="relative shrink-0">
          <img src={b.image_url} alt={b.name} onError={imgOnError(b.category)} className={`rounded-xl object-cover ${compact ? 'h-20 w-20' : 'h-24 w-24'}`} loading="lazy" />
          {b.ai_score >= 75 && <div className="absolute -top-1.5 -left-1.5 grad-btn text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" />{b.ai_score}</div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight truncate">{b.name}</h3>
              <p className="text-xs text-dim flex items-center gap-1 mt-0.5"><CategoryIcon category={b.category} className="h-3 w-3" color={color} />{b.category}</p>
            </div>
            <button onClick={toggleFav} className="shrink-0 h-7 w-7 grid place-items-center rounded-lg hover:bg-[var(--surface-hover)]"><Heart className={`h-4 w-4 ${fav ? 'fill-red-500 text-red-500' : 'text-dim'}`} /></button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span className="font-medium">{Number(b.rating).toFixed(1)}</span><span className="text-dim">({b.review_count})</span></span>
            {b.distance_km != null && <span className="inline-flex items-center gap-1 text-muted"><MapPin className="h-3 w-3" />{formatDistance(b.distance_km)}</span>}
            {b.travel_min != null && <span className="inline-flex items-center gap-1 text-muted"><Car className="h-3 w-3" />{formatTravel(b.travel_min)}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className={`px-1.5 py-0.5 rounded ${b.open_now ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{b.open_now ? 'Open now' : 'Closed'}</span>
            {b.next_available_label && <span className="text-dim inline-flex items-center gap-1"><Clock className="h-3 w-3" />Next: {b.next_available_label}</span>}
          </div>
        </div>
      </div>
      {(() => {
        const reasons = Array.isArray(b.ai_reason) ? b.ai_reason : b.ai_reason ? [b.ai_reason] : [];
        return reasons.length > 0 ? (
          <div className="px-3 pb-2 -mt-1"><p className="text-[11px] text-[var(--color-brand-indigo)] flex items-center gap-1"><Sparkles className="h-3 w-3" /> {reasons.join(' · ')}</p></div>
        ) : null;
      })()}
      <div className="flex border-t border-app">
        <button onClick={(e) => { e.stopPropagation(); nav(`/business/${b.id}`); }} className="flex-1 py-2.5 text-xs font-medium grad-btn text-white flex items-center justify-center gap-1">Book now <ChevronRight className="h-3.5 w-3.5" /></button>
        <button onClick={directions} title="Directions" className="px-3.5 border-l border-app hover:bg-[var(--surface-hover)]"><Navigation className="h-4 w-4 text-[var(--color-brand-indigo)]" /></button>
        <button onClick={call} title="Call" className="px-3.5 border-l border-app hover:bg-[var(--surface-hover)]"><Phone className="h-4 w-4 text-emerald-400" /></button>
      </div>
    </motion.div>
  );
}
