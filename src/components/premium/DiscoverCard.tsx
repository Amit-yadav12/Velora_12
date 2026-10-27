import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, Clock, Navigation, Phone, Heart, ChevronRight, Sparkles, Car, ArrowLeftRight, Check } from 'lucide-react';
import { categoryColor, mapsDirections, type Business } from '../../lib/product';
import { CategoryIcon } from '../product';
import { formatDistance, formatTravel } from '../../lib/geo';
import { fadeUp } from '../../lib/motion';
import { prefetchOnIntent } from '../../lib/smartCache';
import { fromPriceLabel } from '../../lib/compare';
import { isMiRoadElectricianSample, MI_ROAD_ELECTRICIAN_ALT } from '../../lib/miRoadElectrician';

export default function DiscoverCard({ b, active, onHover, compact, onCompare, compared }: {
  b: Business; index?: number; active?: boolean; onHover?: (id: number | string | null) => void; compact?: boolean;
  /** Shortlist toggle — renders only where comparison is available. */
  onCompare?: (b: Business) => void; compared?: boolean;
}) {
  const nav = useNavigate();
  const color = categoryColor(b.category);
  const isIllustratedSample = isMiRoadElectricianSample(b);
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
          <div className={`rounded-xl bg-gradient-to-br from-indigo-900 to-emerald-950 overflow-hidden ${compact ? 'h-20 w-20' : 'h-24 w-24'}`}>{b.image_url && <img src={b.image_url} alt={isIllustratedSample ? MI_ROAD_ELECTRICIAN_ALT : b.name} onError={e => { e.currentTarget.style.display = 'none'; }} className={`h-full w-full object-cover ${isIllustratedSample ? 'object-left' : ''}`} loading="lazy" />}</div>
          {(b.ai_score ?? 0) >= 75 && <div title={`Velora match score ${b.ai_score}/100 — a heuristic using rating, straight-line distance, opening hours and featured status`} aria-label={`Velora match score ${b.ai_score} out of 100`} className="absolute -top-1.5 -left-1.5 grad-btn text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" aria-hidden="true" /><span aria-hidden="true">{b.ai_score}<span className="opacity-70">/100</span></span></div>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold leading-tight truncate">{b.name}</h3>
              {(b.synthetic || b.demo || b.live) && <p className="text-[10px] text-amber-400">{b.live ? 'Google listing · not bookable on Velora' : isIllustratedSample ? 'Sample listing · AI illustration' : 'Sample listing'}</p>}
              <p className="text-xs text-dim flex items-center gap-1 mt-0.5"><CategoryIcon category={b.category} className="h-3 w-3" color={color} />{b.category}</p>
            </div>
            <div className="shrink-0 flex items-center gap-0.5">
              {onCompare && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCompare(b); }}
                  aria-pressed={!!compared}
                  aria-label={`${compared ? 'Remove' : 'Add'} ${b.name} ${compared ? 'from' : 'to'} price comparison`}
                  title="Compare prices"
                  className={`h-7 w-7 grid place-items-center rounded-lg hover:bg-[var(--surface-hover)] ${compared ? 'text-[var(--color-brand-indigo)]' : 'text-dim'}`}
                >
                  {compared ? <Check className="h-4 w-4" aria-hidden="true" /> : <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />}
                </button>
              )}
              <button onClick={toggleFav} aria-label={`${fav ? 'Remove' : 'Save'} ${b.name}`} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-[var(--surface-hover)]"><Heart className={`h-4 w-4 ${fav ? 'fill-red-500 text-red-500' : 'text-dim'}`} /></button>
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {b.rating != null && Number(b.rating) > 0 ? <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /><span className="font-medium">{Number(b.rating).toFixed(1)}</span><span className="text-dim">({b.review_count})</span></span> : <span className="text-dim">Not rated</span>}
            {!b.synthetic && !b.demo && b.distance_km != null && <span title="Straight-line distance" className="inline-flex items-center gap-1 text-muted"><MapPin className="h-3 w-3" />{formatDistance(b.distance_km)}</span>}
            {!b.synthetic && !b.demo && b.travel_min != null && <span className="inline-flex items-center gap-1 text-muted"><Car className="h-3 w-3" />{formatTravel(b.travel_min)}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
            {b.open_now != null && <span className={`px-1.5 py-0.5 rounded ${b.open_now ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{b.open_now ? 'Open now' : 'Closed'}</span>}
            <span className="px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--text)] tabular-nums">{fromPriceLabel(b)}</span>
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
        <button onClick={(e) => { e.stopPropagation(); nav(`/business/${b.id}`); }} className="flex-1 py-2.5 text-xs font-medium grad-btn text-white flex items-center justify-center gap-1">{b.live || b.synthetic ? 'View listing' : b.demo ? 'Try demo' : 'Book now'} <ChevronRight className="h-3.5 w-3.5" /></button>
        {!b.synthetic && !b.demo && <button onClick={directions} title="Directions" className="px-3.5 border-l border-app hover:bg-[var(--surface-hover)]"><Navigation className="h-4 w-4 text-[var(--color-brand-indigo)]" /></button>}
        {!b.synthetic && !b.demo && b.phone && <button onClick={call} title="Call" className="px-3.5 border-l border-app hover:bg-[var(--surface-hover)]"><Phone className="h-4 w-4 text-emerald-400" /></button>}
      </div>
    </motion.div>
  );
}
