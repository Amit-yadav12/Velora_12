import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Clock } from 'lucide-react';

// Live queue tracker: derives position + wait from the booking's time and
// simulates live movement client-side for a real-time feel.
export default function QueueTracker({ startTime }: { startTime: string }) {
  const [pos, setPos] = useState(1);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    const compute = () => {
      const diffMin = (new Date(startTime).getTime() - Date.now()) / 60000;
      if (diffMin > 120 || diffMin < -30) { setPos(0); setWait(0); return; }
      const p = Math.max(1, Math.round(diffMin / 15) + 1);
      setPos(p); setWait(Math.max(0, Math.round(diffMin)));
    };
    compute();
    const t = setInterval(compute, 15000);
    return () => clearInterval(t);
  }, [startTime]);

  if (pos === 0) return null;
  const ahead = Math.max(0, pos - 1);
  return (
    <div className="card p-5 relative overflow-hidden">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full grad-btn opacity-10 blur-2xl" />
      <div className="flex items-center gap-2 text-xs text-[var(--color-brand-indigo)] mb-3"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" /> Live queue</div>
      <div className="flex items-end gap-6">
        <div><p className="text-4xl font-semibold">#{pos}</p><p className="text-xs text-dim">Your position</p></div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: Math.min(pos, 8) }).map((_, i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.06 }}
                className={`h-8 w-8 rounded-full grid place-items-center ${i === pos - 1 ? 'grad-btn' : 'bg-surface border border-app'}`}>
                <Users className={`h-3.5 w-3.5 ${i === pos - 1 ? 'text-white' : 'text-dim'}`} />
              </motion.div>
            ))}
          </div>
          <p className="mt-2 text-xs text-dim">{ahead} {ahead === 1 ? 'person' : 'people'} ahead of you</p>
        </div>
        <div className="text-right"><p className="text-2xl font-semibold flex items-center gap-1"><Clock className="h-4 w-4 text-[var(--color-brand-indigo)]" />{wait}m</p><p className="text-xs text-dim">Est. wait</p></div>
      </div>
    </div>
  );
}
