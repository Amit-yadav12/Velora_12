import { createElement } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, Clock } from 'lucide-react';
import { Business, categoryIcon, categoryColor } from '../lib/product';
import { fadeUp } from '../lib/motion';

/**
 * Renders a category's lucide icon. Encapsulating the icon lookup in a
 * component avoids assigning a component to a capitalized local during a
 * parent's render (which the React Compiler lint flags and which can defeat
 * memoization).
 */
export function CategoryIcon({ category, className, color }: { category: string; className?: string; color?: string }) {
  // createElement (rather than <Icon/>) so we render an *element* from a
  // looked-up component reference without defining a component during render.
  return createElement(categoryIcon(category), { className, style: color ? { color } : undefined });
}

export function Rating({ value, count, sm }: { value: number; count?: number; sm?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 ${sm ? 'text-xs' : 'text-sm'}`}>
      <Star className={`${sm ? 'h-3 w-3' : 'h-3.5 w-3.5'} fill-amber-400 text-amber-400`} />
      <span className="font-medium">{Number(value).toFixed(1)}</span>
      {count != null && <span className="text-dim">({count})</span>}
    </span>
  );
}

/**
 * BusinessCard is a motion child: it inherits the `variants={fadeUp}` state
 * from its parent `<Grid>` container, so ONE viewport observer drives the
 * whole list (no per-card observers / delay math = no scroll jank).
 * Only transform+opacity animate. `content-visibility:auto` skips paint for
 * off-screen cards.
 */
export function BusinessCard({ b }: { b: Business; index?: number }) {
  const color = categoryColor(b.category);
  return (
    <motion.div variants={fadeUp} style={{ contentVisibility: 'auto', containIntrinsicSize: '280px' } as React.CSSProperties}>
      <Link to={`/business/${b.id}`} className="group block card overflow-hidden">
        <div className="relative h-40 overflow-hidden">
          <img src={b.image_url} alt={b.name} className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 will-change-transform" loading="lazy" decoding="async" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
          <div className="absolute top-3 left-3 rounded-full px-2.5 py-1 flex items-center gap-1.5 text-xs bg-black/45 text-white backdrop-blur-sm">
            <CategoryIcon category={b.category} className="h-3.5 w-3.5" color={color} /> {b.category}
          </div>
          {b.featured && <div className="absolute top-3 right-3 grad-btn text-white text-[10px] font-medium px-2 py-1 rounded-full">Featured</div>}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight group-hover:text-[var(--color-brand-indigo)] transition-colors">{b.name}</h3>
            <Rating value={b.rating} sm />
          </div>
          <p className="text-sm text-dim mt-0.5 line-clamp-1">{b.tagline}</p>
          <div className="mt-3 flex items-center gap-3 text-xs text-dim">
            <span className="flex items-center gap-1 min-w-0"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{b.city}</span></span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{b.open_time}–{b.close_time}</span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/**
 * Grid — a single stagger container. Wrap BusinessCard lists in this so the
 * reveal is orchestrated once (cheap) rather than per item.
 */
export function Grid({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.1 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionTitle({ title, action, to }: { title: string; action?: string; to?: string }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {action && to && <Link to={to} className="text-sm text-[var(--color-brand-indigo)] font-medium">{action}</Link>}
    </div>
  );
}
