import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { isDemoMode } from '../../lib/supabase';
import { onBookingsChanged, onServicesChanged, onStaffChanged } from '../../services/events';

/**
 * Honest sync indicator for the business console.
 *
 * Sample mode: the console re-reads the shared browser store whenever a booking,
 * service or staff row changes, so a booking made in another window appears
 * without a reload. Nothing is polled from a server and nothing is notified —
 * the label says "Sample sync" rather than implying a live provider feed.
 *
 * Live mode: rows arrive from the server (Supabase realtime where configured,
 * otherwise on navigation), so the same chip reads "Live sync".
 */
export default function LiveSyncBadge() {
  const [fresh, setFresh] = useState(false);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const bump = () => {
      setAt(Date.now());
      setFresh(true);
    };
    const offs = [onBookingsChanged(bump), onServicesChanged(bump), onStaffChanged(bump)];
    return () => offs.forEach((off) => off());
  }, []);

  useEffect(() => {
    if (!fresh) return;
    const t = window.setTimeout(() => setFresh(false), 4000);
    return () => window.clearTimeout(t);
  }, [fresh, at]);

  const label = fresh ? 'Updated just now' : isDemoMode ? 'Sample sync' : 'Live sync';

  return (
    <span
      role="status"
      aria-live="polite"
      data-live-sync={fresh ? 'fresh' : 'idle'}
      title={
        isDemoMode
          ? 'The console reads the shared sample store in this browser: a booking made in another window appears here without a reload. No server or provider is contacted.'
          : 'The console refreshes when booking data changes on the server.'
      }
      className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium md:inline-flex ${
        fresh
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
          : 'border-app bg-[var(--surface)] text-dim'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-emerald-400 ${fresh ? '' : 'pulse-dot'}`} aria-hidden="true" />
      <Radio className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
