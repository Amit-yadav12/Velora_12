import { useReducedMotion } from 'framer-motion';
import type { Transition, Variants } from 'framer-motion';

/**
 * Shared motion system — GPU-only (transform + opacity) for 60 FPS.
 *
 * Rules enforced here:
 *  - Never animate `width`, `height`, `top`, `left`, `box-shadow` (layout/paint).
 *  - Only animate `transform` (x/y/scale) and `opacity` (composited).
 *  - Respect `prefers-reduced-motion` via `useMotion()`.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

export const spring: Transition = { type: 'spring', damping: 26, stiffness: 320, mass: 0.7 };
export const smooth: Transition = { duration: 0.5, ease: EASE };
export const fast: Transition = { duration: 0.28, ease: EASE };

// Fade + rise, cheap. Use for section reveals and cards.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: smooth },
};

// Container that staggers children WITHOUT re-measuring layout.
export const stagger = (gap = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap } },
});

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring },
};

// Collapse via scaleY (composited) instead of height:auto (layout).
export const collapse: Variants = {
  hidden: { opacity: 0, scaleY: 0.85, y: -6 },
  show: { opacity: 1, scaleY: 1, y: 0, transition: fast },
};

/**
 * Central hook. When the user prefers reduced motion, we return no-op
 * variants/transitions so nothing animates but the UI still renders.
 */
export function useMotion() {
  const reduce = useReducedMotion();
  if (reduce) {
    const none: Variants = { hidden: { opacity: 1 }, show: { opacity: 1 } };
    return {
      reduce: true,
      fadeUp: none, scaleIn: none, collapse: none,
      stagger: () => none,
      spring: { duration: 0 } as Transition,
      smooth: { duration: 0 } as Transition,
      fast: { duration: 0 } as Transition,
      // viewport reveal props (disabled)
      reveal: { initial: false as const },
    };
  }
  return {
    reduce: false,
    fadeUp, scaleIn, collapse, stagger,
    spring, smooth, fast,
    // shared viewport reveal props — `once` prevents re-trigger jank on scroll
    reveal: {
      initial: 'hidden' as const,
      whileInView: 'show' as const,
      viewport: { once: true, amount: 0.15, margin: '0px 0px -80px 0px' },
    },
  };
}
