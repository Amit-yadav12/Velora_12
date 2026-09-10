import { useEffect, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="text-sm text-dim mt-1">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-500/15 text-amber-400',
    confirmed: 'bg-blue-500/15 text-blue-400', in_progress: 'bg-indigo-500/15 text-indigo-400', checked_in: 'bg-cyan-500/15 text-cyan-400',
    completed: 'bg-emerald-500/15 text-emerald-400', cancelled: 'bg-red-500/15 text-red-400',
    no_show: 'bg-amber-500/15 text-amber-400',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg capitalize ${map[status] || 'bg-surface text-dim'}`}>{status.replace('_', ' ')}</span>;
}

/** Small chip marking entities that belong to the isolated demo tenant. */
export function DemoBadge({ label = 'Demo' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--color-brand-violet)]/15 text-[var(--color-brand-violet)] border border-[var(--color-brand-violet)]/25">
      {label}
    </span>
  );
}

export function Spinner() {
  return <div className="grid place-items-center py-20"><div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></div>;
}

export function EmptyState({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="card p-10 text-center">
      <p className="font-medium">{title}</p>
      {sub && <p className="text-sm text-dim mt-1 max-w-sm mx-auto">{sub}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Premium metric card — same shell as the existing dashboard cards. */
export function StatCard({ label, value, icon: Icon, color = '#818cf8', sub, delay = 0 }: {
  label: string; value: ReactNode; icon: any; color?: string; sub?: string; delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="card p-5 group hover:border-[var(--border-strong)] transition-colors">
      <div className="h-9 w-9 rounded-xl grid place-items-center mb-3" style={{ background: `${color}22` }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-sm text-dim">{label}</p>
      {sub && <p className="text-[11px] text-dim mt-1">{sub}</p>}
    </motion.div>
  );
}

/** Consistent modal shell — glass, rounded, animated, scroll-safe on mobile. */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 12 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className={`relative glass rounded-2xl border border-app shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} my-8`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-app sticky top-0 glass rounded-t-2xl z-10">
              <h3 className="font-semibold">{title}</h3>
              <button aria-label="Close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Form field label + input in one consistent style. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-dim">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls = 'w-full rounded-xl bg-elev border border-app px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-brand-indigo)] transition-colors placeholder:text-dim';

/** Primary (filled) action — used sparingly, one per view. */
export const btnPrimary = 'grad-btn text-white text-sm font-medium rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 disabled:opacity-60';

/** Secondary (hollow/outlined) action — the default for non-primary buttons. */
export const btnGhost = 'rounded-xl border border-app px-4 py-2.5 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-60';
