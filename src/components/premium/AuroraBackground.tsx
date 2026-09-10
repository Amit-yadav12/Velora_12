import { motion, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { useEffect, useState } from 'react';

/**
 * Premium animated aurora background.
 * GPU-only (transform/opacity). Motion is disabled on small screens and when
 * the user prefers reduced motion — the orbs remain as a static gradient wash,
 * which is where nearly all the beauty is with none of the per-frame cost.
 */
export default function AuroraBackground() {
  const reduce = useReducedMotion();
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (reduce) { setAnimate(false); return; }
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setAnimate(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [reduce]);

  const orb = (cls: string, anim: TargetAndTransition, dur: number) => (
    animate
      ? <motion.div className={`aurora-orb ${cls}`} animate={anim} transition={{ duration: dur, repeat: Infinity, ease: 'easeInOut' }} />
      : <div className={`aurora-orb ${cls}`} />
  );

  return (
    <div aria-hidden className="aurora-bg" style={{ position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' }}>
      <div className="aurora-base" />
      {orb('aurora-orb-1', { x: [0, 120, -40, 0], y: [0, 80, 140, 0], scale: [1, 1.12, 0.96, 1] }, 28)}
      {orb('aurora-orb-2', { x: [0, -100, 60, 0], y: [0, 100, -60, 0], scale: [1, 0.92, 1.15, 1] }, 34)}
      {orb('aurora-orb-3', { x: [0, 80, -80, 0], y: [0, -80, 60, 0], scale: [1, 1.08, 0.9, 1] }, 40)}
      <div className="aurora-grid" />
      <div className="aurora-grain" />
    </div>
  );
}
