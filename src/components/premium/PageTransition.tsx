import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';

/**
 * Lightweight page transition. Keyed on pathname so each route mounts with a
 * cheap fade + 8px rise (transform + opacity only — no layout). Reduced-motion
 * users get an instant swap. We intentionally avoid AnimatePresence exit here
 * to prevent double-mount jank on fast navigations.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={pathname}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  );
}
