/**
 * Velora brand mark — premium 3D edition.
 *
 * Same concept as always: a rounded "V" whose right stroke lifts into a
 * checkmark tick (booking confirmed) with the slot/pin dot. Now rendered with
 * real depth: extruded base, glossy glass face, inner top light, soft ground
 * shadow and a dimensional V with its own extrusion + specular dot.
 */
import { useId } from 'react';

export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const face = `velora-face-${uid}`;
  const depth = `velora-depth-${uid}`;
  const sheen = `velora-sheen-${uid}`;
  const vgrad = `velora-v-${uid}`;
  const dot = `velora-dot-${uid}`;
  const soft = `velora-soft-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={face} x1="8" y1="6" x2="40" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7cb3ff" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id={depth} x1="8" y1="9" x2="40" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1d4ed8" />
          <stop offset="0.55" stopColor="#3730a3" />
          <stop offset="1" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={sheen} x1="24" y1="6" x2="24" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={vgrad} x1="15" y1="15" x2="35" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfe0ff" />
        </linearGradient>
        <radialGradient id={dot} cx="0.35" cy="0.3" r="0.9">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#bfdbfe" />
        </radialGradient>
        <filter id={soft} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>

      {/* ground shadow */}
      <ellipse cx="24" cy="42.6" rx="13.5" ry="2.8" fill="#000000" opacity="0.38" filter={`url(#${soft})`} />
      {/* extruded base (the 3D side) */}
      <rect x="8" y="9" width="32" height="32" rx="10" fill={`url(#${depth})`} />
      {/* glass face */}
      <rect x="8" y="6" width="32" height="32" rx="10" fill={`url(#${face})`} />
      {/* glass sheen + inner top light */}
      <rect x="8" y="6" width="32" height="32" rx="10" fill={`url(#${sheen})`} />
      <rect x="9.4" y="7.2" width="29.2" height="29.6" rx="8.6" fill="none" stroke="#ffffff" strokeOpacity="0.38" strokeWidth="1" />

      {/* V extrusion (depth copy) */}
      <path
        d="M16.2 17.1 L24 32.6 Q25.4 34.9 27.1 32.6 L36.7 17.1"
        stroke="#1e1b4b"
        strokeOpacity="0.5"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* V face that turns into a check-tick */}
      <path
        d="M15 15.5 L22.8 31 Q24.2 33.4 25.9 31 L35.5 15.5"
        stroke={`url(#${vgrad})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* slot / pin dot with specular */}
      <circle cx="35.5" cy="15.5" r="2.7" fill={`url(#${dot})`} />
      <circle cx="34.6" cy="14.6" r="0.9" fill="#ffffff" />
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
