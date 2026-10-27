import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { fadeUp } from '../lib/motion';

/**
 * Reveal-on-scroll that can never strand content invisible.
 *
 * `whileInView` alone leaves a card stuck at opacity 0 if its IntersectionObserver
 * never fires — which happens when a whole section mounts below the viewport (a
 * container-level observer that never flips state) or when a fast programmatic
 * scroll jumps past it. This wrapper always resolves: in-view animates, and a
 * one-shot safety timer (~4s) shows the card regardless, so content is never
 * gated on an animation. Reduced motion skips straight to the final state.
 */
export default function Reveal({
  children,
  className,
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Stagger support for grids that used to inherit a parent variant. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const inView = useInView(ref, { once: true, amount: 0.15, margin: '0px 0px -60px 0px' });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (reduce || inView || timedOut) return;
    const t = window.setTimeout(() => setTimedOut(true), 4000);
    return () => window.clearTimeout(t);
  }, [reduce, inView, timedOut]);

  const show = reduce || inView || timedOut;

  return (
    <motion.div
      ref={ref}
      initial={reduce ? false : 'hidden'}
      animate={show ? 'show' : 'hidden'}
      variants={fadeUp}
      transition={delay && show ? { delay } : undefined}
      className={className}
      style={style}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </motion.div>
  );
}
