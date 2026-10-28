import { FlaskConical, Info } from 'lucide-react';
import { isDemoMode } from '../../lib/supabase';
import { openDemoGuide } from '../../lib/demoGuideStore';

/**
 * Persistent "this is the sample tenant" bar.
 *
 * The demo is only credible if the boundary is obvious at a glance, on every
 * screen, in both the customer app and the business console. Rendered only when
 * no Supabase project is configured (isDemoMode).
 */
export default function SampleModeBar({ surface }: { surface: 'customer' | 'business' }) {
  if (!isDemoMode) return null;
  return (
    <div
      data-sample-mode-bar
      className="border-b border-[var(--color-brand-violet)]/25 bg-[var(--color-brand-violet)]/[0.09]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-1.5 text-[11px] leading-tight text-[var(--text-link-strong)]">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="font-semibold">Demo environment</span>
        <span className="text-[var(--text-muted)]">
          {surface === 'customer'
            ? '— sample businesses, sample prices and sample bookings stored in this browser.'
            : '— this business, its staff, prices and bookings are synthetic and stored in this browser.'}
        </span>
        <span className="hidden text-[var(--text-dim)] sm:inline">This demo is device-local, not shared across devices. No payments, emails or calendar invites are sent.</span>
        <button
          type="button"
          onClick={openDemoGuide}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[var(--color-brand-violet)]/30 px-1.5 py-0.5 font-medium text-[var(--text-link-strong)] hover:border-[var(--color-brand-violet)]/60"
        >
          <Info className="h-3 w-3" aria-hidden="true" /> Walkthrough
        </button>
      </div>
    </div>
  );
}
