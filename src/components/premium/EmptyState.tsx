import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

export default function EmptyState({ icon: Icon, title, sub, action }: { icon: LucideIcon; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-12 text-center">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 12 }}
        className="relative h-20 w-20 mx-auto mb-4">
        <div className="absolute inset-0 rounded-3xl grad-btn opacity-20 blur-xl" />
        <div className="relative h-full w-full rounded-3xl border border-app bg-surface grid place-items-center">
          <Icon className="h-8 w-8 text-[var(--color-brand-indigo)]" />
        </div>
      </motion.div>
      <p className="font-semibold text-lg">{title}</p>
      {sub && <p className="text-sm text-dim mt-1 max-w-xs mx-auto">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
