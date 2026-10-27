import { useEffect, useState } from 'react';
import { ist } from '../../lib/format';
import { motion } from 'framer-motion';
import { TrendingDown, Sparkles } from 'lucide-react';
import type { HeatmapData } from '../../lib/types';

// Swatch shades are dark enough for white 10px labels to clear WCAG AA (4.5:1)
// on the app's near-black surface — the amber/indigo tints used before did not.
function color(occ: number) {
  if (occ >= 80) return 'rgba(190,18,60,0.92)';
  if (occ >= 60) return 'rgba(180,83,9,0.95)';
  if (occ >= 40) return 'rgba(67,56,202,0.9)';
  if (occ >= 20) return 'rgba(29,78,216,0.9)';
  return 'rgba(4,120,87,0.9)';
}

export default function Heatmap({ businessId, onPickDate }: { businessId?: number | string; onPickDate?: (date: string) => void }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  useEffect(() => {
    let alive = true;
    import('../../lib/hybridData').then(({ fetchHeatmap }) =>
      fetchHeatmap(businessId).then((d) => alive && setData(d)).catch(() => {})
    );
    return () => { alive = false; };
  }, [businessId]);
  if (!data) return <div className="skeleton h-40 rounded-2xl" />;
  const days = Array.isArray(data.days) ? data.days : [];
  if (!days.length) return null;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div><p className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--text-link-strong)]" aria-hidden="true" /> Availability forecast</p><p className="text-xs text-dim mt-0.5">Sample forecast · illustrative data</p></div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i: number) => (
          <motion.button key={d.date} onClick={() => onPickDate?.(d.date)}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}
            whileHover={{ scale: 1.08 }}
            className="aspect-square rounded-lg grid place-items-center text-[10px] font-semibold text-white relative group"
            style={{ background: color(d.occupancy) }} title={`${d.weekday} ${d.day}: ${d.occupancy}% booked`}
            aria-label={`${d.weekday} ${d.day}: ${d.occupancy}% booked`}>
            {d.day}
          </motion.button>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-dim leading-relaxed">Estimated from booking history and a baseline forecast — not live sensor data.</p>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-dim">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Open</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{ background: color(50) }} /> Moderate</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-500" /> Busy</span>
      </div>
      {Array.isArray(data.best_days) && data.best_days.length > 0 && data.best_days[0]?.date && (
        <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-start gap-2.5">
          <TrendingDown className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-100/90"><span className="font-medium">Tip:</span> {ist(data.best_days[0].date, { weekday: 'long', month: 'short', day: 'numeric' })} is the least crowded ({data.best_days[0].occupancy}% booked). {data.busiest_day && `Avoid ${data.busiest_day.weekday} — it's the busiest.`}</p>
        </div>
      )}
    </div>
  );
}
