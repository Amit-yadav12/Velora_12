import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';

/**
 * Lightweight page transition. Keyed on pathname so each route mounts with a
 * cheap opacity fade. Reduced-motion users get an instant swap. We
 * intentionally avoid AnimatePresence exit here to prevent double-mount jank
 * on fast navigations.
 *
 * Deliberately opacity-only: animating transform here would make this wrapper a
 * containing block for `position: fixed`, which collapsed full-screen overlays
 * (booking success, modals) onto the page instead of the viewport. Overlays are
 * also portalled to <body>, so both layers of defence hold.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'opacity' }}
    >
      {children}
    </motion.div>
  );
}
