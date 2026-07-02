import { motion } from 'framer-motion';
import { Check, CalendarCheck, UserCheck, Bell, LogIn, CheckCircle2, Clock } from 'lucide-react';

const STEPS = [
  { key: 'confirmed', label: 'Confirmed', icon: CalendarCheck },
  { key: 'approved', label: 'Approved', icon: Check },
  { key: 'assigned', label: 'Assigned', icon: UserCheck },
  { key: 'reminder', label: 'Reminder', icon: Bell },
  { key: 'checkin', label: 'Checked-in', icon: LogIn },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
];

// Maps a booking to a progress index based on status + time.
export function stageFor(status: string, startTime: string): number {
  if (status === 'completed') return 5;
  if (status === 'no_show') return 4;
  const mins = (new Date(startTime).getTime() - Date.now()) / 60000;
  if (status === 'in_progress') return 4;
  if (mins <= 60) return 3; // reminder window
  if (mins <= 24 * 60) return 2; // assigned
  return 1; // approved
}

export default function ProgressTracker({ status, startTime }: { status: string; startTime: string }) {
  const active = stageFor(status, startTime);
  return (
    <div className="card p-5">
      <p className="text-sm font-medium mb-4">Booking progress</p>
      <div className="relative flex justify-between">
        <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--border)]" />
        {/* scaleX is GPU-composited; origin-left keeps it anchored — no layout thrash */}
        <motion.div className="absolute top-4 left-4 right-4 h-0.5 grad-btn origin-left" style={{ transformOrigin: 'left' }}
          initial={{ scaleX: 0 }} animate={{ scaleX: active / (STEPS.length - 1) }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        {STEPS.map((s, i) => {
          const done = i <= active;
          const Icon = s.icon;
          return (
            <div key={s.key} className="relative flex flex-col items-center gap-1.5 z-10" style={{ flex: '0 0 auto' }}>
              <motion.div initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }}
                className={`h-8 w-8 rounded-full grid place-items-center ${done ? 'grad-btn text-white' : 'bg-surface border border-app text-dim'}`}>
                {i === active && status !== 'completed' ? <Clock className="h-4 w-4 animate-pulse" /> : <Icon className="h-4 w-4" />}
              </motion.div>
              <span className={`text-[10px] ${done ? 'text-[var(--text)] font-medium' : 'text-dim'}`}>{s.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
