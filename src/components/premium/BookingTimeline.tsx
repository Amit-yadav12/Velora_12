import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Clock, Users, Zap } from 'lucide-react';

export interface Slot { time: string; label: string; status: 'available' | 'busy' | 'booked'; available: boolean; wait_min?: number | null; crowd?: number; score?: number; }

export default function BookingTimeline({ slots, selected, onSelect, recommended = [] }: {
  slots: Slot[]; selected: string; onSelect: (t: string) => void; recommended?: Slot[];
}) {
  const recSet = new Set(recommended.map((r) => r.time));
  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 mb-3 text-xs">
        <Legend color="#34d399" label="Available" />
        <Legend color="#f59e0b" label="Busy" />
        <Legend color="#ef4444" label="Booked" />
        {recommended.length > 0 && <span className="ml-auto inline-flex items-center gap-1 text-[var(--color-brand-indigo)]"><Zap className="h-3.5 w-3.5" /> AI picks</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {slots.map((s, i) => <SlotButton key={s.time} slot={s} i={i} selected={selected === s.time} recommended={recSet.has(s.time)} onSelect={onSelect} />)}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5 text-dim"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</span>;
}

function SlotButton({ slot, i, selected, recommended, onSelect }: { slot: Slot; i: number; selected: boolean; recommended: boolean; onSelect: (t: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const click = (e: React.MouseEvent) => {
    if (!slot.available) return;
    const el = ref.current; if (el) {
      const r = el.getBoundingClientRect();
      const wave = document.createElement('span');
      wave.className = 'ripple-wave';
      const size = Math.max(r.width, r.height);
      wave.style.width = wave.style.height = `${size}px`;
      wave.style.left = `${e.clientX - r.left - size / 2}px`;
      wave.style.top = `${e.clientY - r.top - size / 2}px`;
      el.appendChild(wave);
      setTimeout(() => wave.remove(), 600);
    }
    onSelect(slot.time);
  };
  return (
    <motion.button
      ref={ref} onClick={click} disabled={!slot.available}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 12) * 0.02 }}
      whileHover={slot.available ? { y: -2, scale: 1.03 } : {}} whileTap={slot.available ? { scale: 0.94 } : {}}
      className={`ripple relative rounded-xl border py-2.5 text-xs font-medium transition-colors ${selected ? 'grad-btn text-white border-transparent' : `slot-${slot.status}`}`}>
      {recommended && !selected && <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full grad-btn grid place-items-center"><Zap className="h-2.5 w-2.5 text-white" /></span>}
      <span className="block">{slot.label}</span>
      {slot.available && slot.wait_min != null && slot.wait_min > 0 && (
        <span className={`mt-0.5 flex items-center justify-center gap-0.5 text-[9px] ${selected ? 'text-white/80' : 'opacity-70'}`}><Clock className="h-2.5 w-2.5" />~{slot.wait_min}m</span>
      )}
      {slot.status === 'busy' && !selected && <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] opacity-70"><Users className="h-2.5 w-2.5" />busy</span>}
    </motion.button>
  );
}
