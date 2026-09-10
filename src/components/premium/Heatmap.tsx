import { useEffect, useState } from 'react';
import { ist } from '../../lib/format';
import { motion } from 'framer-motion';
import { TrendingDown, Sparkles } from 'lucide-react';
import type { HeatmapData } from '../../lib/types';

function color(occ: number) {
  if (occ >= 80) return 'rgba(239,68,68,0.85)';
  if (occ >= 60) return 'rgba(245,158,11,0.8)';
  if (occ >= 40) return 'rgba(99,102,241,0.7)';
  if (occ >= 20) return 'rgba(59,130,246,0.55)';
  return 'rgba(52,211,153,0.5)';
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
        <div><p className="font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--color-brand-indigo)]" /> Availability forecast</p><p className="text-xs text-dim mt-0.5">Predicted occupancy · next 14 days</p></div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d, i: number) => (
          <motion.button key={d.date} onClick={() => onPickDate?.(d.date)}
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.02 }}
            whileHover={{ scale: 1.08 }}
            className="aspect-square rounded-lg grid place-items-center text-[10px] font-medium text-white/90 relative group"
            style={{ background: color(d.occupancy) }} title={`${d.weekday} ${d.day}: ${d.occupancy}% booked`}>
            {d.day}
          </motion.button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3 text-[10px] text-dim">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Open</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{ background: color(50) }} /> Moderate</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-red-500" /> Busy</span>
      </div>
      {Array.isArray(data.best_days) && data.best_days.length > 0 && data.best_days[0]?.date && (
        <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-start gap-2.5">
          <TrendingDown className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-100/90"><span className="font-medium">AI tip:</span> {ist(data.best_days[0].date, { weekday: 'long', month: 'short', day: 'numeric' })} is the least crowded ({data.best_days[0].occupancy}% booked). {data.busiest_day && `Avoid ${data.busiest_day.weekday} — it's the busiest.`}</p>
        </div>
      )}
    </div>
  );
}
