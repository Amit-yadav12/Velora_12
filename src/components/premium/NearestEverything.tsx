import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Navigation, MapPin, Star, Clock } from 'lucide-react';
import { categoryIcon, categoryColor, imgOnError } from '../../lib/product';
import { formatDistance, formatTravel } from '../../lib/geo';
import { fetchNearest } from '../../lib/hybridData';

// "Nearest everything" — the single closest option in each key category.
export default function NearestEverything({ lat, lng, city }: { lat: number; lng: number; city?: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchNearest(lat, lng, city || 'Jaipur')
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [lat, lng, city]);

  if (loading) return <div className="skeleton h-40 rounded-2xl" />;
  if (!data?.nearest_per_category?.length) return null;

  const items = data.nearest_per_category.slice(0, 8);
  const overall = data.overall_nearest;

  return (
    <div>
      {/* Highlight: overall nearest */}
      {overall && (
        <Link to={`/business/${overall.id}`} className="block mb-3">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl grad-btn p-5 text-white">
            <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <img src={overall.image_url} alt={overall.name} onError={imgOnError(overall.category)} className="h-16 w-16 rounded-2xl object-cover ring-2 ring-white/30" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/80 flex items-center gap-1"><Navigation className="h-3 w-3" /> Closest to you{city ? ` in ${city}` : ''}</p>
                <p className="font-semibold text-lg leading-tight truncate">{overall.name}</p>
                <p className="text-sm text-white/85 flex items-center gap-2">
                  {overall.category} · <MapPin className="h-3 w-3" /> {formatDistance(overall.distance_km)} · <Clock className="h-3 w-3" /> ~{formatTravel(overall.travel_min)}
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <span className="inline-flex items-center gap-1 text-sm"><Star className="h-3.5 w-3.5 fill-white text-white" />{Number(overall.rating).toFixed(1)}</span>
              </div>
            </div>
          </motion.div>
        </Link>
      )}

      {/* Grid: nearest per category */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {items.map((b: any, i: number) => {
          const Icon = categoryIcon(b.category);
          const color = categoryColor(b.category);
          return (
            <Link key={b.id} to={`/business/${b.id}`}>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                whileHover={{ y: -2 }} className="card p-3 h-full">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: `${color}18` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <span className="text-[11px] text-dim truncate">Nearest {b.category.replace(/s$/, '').toLowerCase()}</span>
                </div>
                <p className="mt-2 text-sm font-medium leading-tight line-clamp-1">{b.name}</p>
                <p className="mt-1 text-xs text-dim flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />{formatDistance(b.distance_km)}
                  <span className="text-dim/50">·</span>~{formatTravel(b.travel_min)}
                </p>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
