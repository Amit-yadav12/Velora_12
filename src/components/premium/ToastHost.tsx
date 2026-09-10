// Global toast host — listens for `toast()` events and renders a small,
// on-brand notification stack. Mount once per shell (customer + admin).
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { EVENTS, type ToastMsg, type ToastKind } from '../../services/events';

const ICONS: Record<ToastKind, typeof Info> = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};
const COLORS: Record<ToastKind, string> = {
  success: 'text-emerald-400',
  info: 'text-[var(--color-brand-indigo)]',
  warning: 'text-amber-400',
  error: 'text-red-400',
};

export default function ToastHost() {
  const [items, setItems] = useState<ToastMsg[]>([]);

  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent<ToastMsg>).detail;
      if (!detail?.message) return;
      setItems((prev) => [...prev.slice(-2), detail]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== detail.id));
      }, 4200);
    };
    window.addEventListener(EVENTS.TOAST, h);
    return () => window.removeEventListener(EVENTS.TOAST, h);
  }, []);

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[90] flex flex-col gap-2 items-end pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', damping: 24, stiffness: 320 }}
              className="pointer-events-auto max-w-xs glass rounded-xl border border-app px-3.5 py-2.5 shadow-xl flex items-start gap-2.5"
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${COLORS[t.kind]}`} />
              <p className="text-[13px] leading-snug flex-1">{t.message}</p>
              <button
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                aria-label="Dismiss notification"
                className="text-dim hover:text-[var(--text)] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
