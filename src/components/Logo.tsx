/**
 * Velora brand mark.
 *
 * A handcrafted monogram: a rounded "V" cut so its right stroke lifts into a
 * checkmark tick (booking confirmed) while the whole shape reads as a subtle
 * location pin. Intentionally asymmetric so it doesn't look like a generic
 * auto-generated diamond/rhombus.
 */
import { useId } from 'react';

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const id = 'velora-g-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {/* rounded squircle plate */}
      <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill={`url(#${id})`} />
      {/* V that turns into a check-tick */}
      <path
        d="M11 12.5 L18.4 27.2 Q19.6 29.4 21.2 27.2 L30.5 13"
        stroke="white"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* small dot: the 'slot' / pin point */}
      <circle cx="30.5" cy="13" r="2.1" fill="white" />
      <circle cx="30.5" cy="13" r="2.1" fill="white" opacity="0.55" />
    </svg>
  );
}

export function Logo({ size = 32, text = true, className = '' }: { size?: number; text?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {text && <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.56 }}>Velora</span>}
    </span>
  );
}

export default Logo;
