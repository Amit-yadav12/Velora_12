import { useEffect, useId, useRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, type LucideIcon } from 'lucide-react';
import Portal from './Portal';

export function PageHeader({ title, subtitle, action, eyebrow }: { title: string; subtitle?: string; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--color-brand-indigo)] mb-1">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-dim mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    // -200/-300 shades only: these 11px chips sit on a 15% tint over a dark
    // surface, where the 400 shades drop under WCAG AA (4.5:1).
    pending: 'bg-amber-500/15 text-amber-200',
    confirmed: 'bg-blue-500/15 text-blue-200', in_progress: 'bg-indigo-500/15 text-indigo-200', checked_in: 'bg-cyan-500/15 text-cyan-200',
    completed: 'bg-emerald-500/15 text-emerald-200', cancelled: 'bg-red-500/15 text-red-200',
    no_show: 'bg-amber-500/15 text-amber-200',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg capitalize ${map[status] || 'bg-surface text-dim'}`}>{status.replace('_', ' ')}</span>;
}

/** Small chip marking entities that belong to the isolated demo tenant. */
export function DemoBadge({ label = 'Demo' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--color-brand-violet)]/15 text-[var(--text-link-strong)] border border-[var(--color-brand-violet)]/25">
      {label}
    </span>
  );
}

export function Spinner() {
  return <div className="grid place-items-center py-20"><div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></div>;
}

export function ConsoleUnavailable({ retry }: { retry: () => void }) {
  return <div role="alert" className="card p-8 text-center"><p className="font-semibold">Console data could not be loaded</p><p className="text-sm text-dim mt-2">Check your connection and try again. No empty results are being assumed.</p><button onClick={retry} className="mt-4 rounded-xl border border-app px-4 py-2 text-sm">Retry</button></div>;
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
  label: string; value: ReactNode; icon: LucideIcon; color?: string; sub?: string; delay?: number;
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
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []);
    focusables()[0]?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', h, true);
    return () => {
      window.removeEventListener('keydown', h, true);
      document.body.style.overflow = bodyOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);
  return (
    <Portal>
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduceMotion ? false : { scale: 0.95, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { scale: 0.95, opacity: 0, y: 12 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', damping: 26, stiffness: 320 }}
            className={`relative glass rounded-2xl border border-app shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} my-8`}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-app sticky top-0 glass rounded-t-2xl z-10">
              <h3 id={titleId} className="font-semibold">{title}</h3>
              <button aria-label="Close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg border border-app hover:border-[var(--border-strong)] transition-colors"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    </Portal>
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
