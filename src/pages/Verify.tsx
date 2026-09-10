// Public ticket verification — scanned from the booking QR code.
// Works signed-in or signed out; shows only public-safe booking facts.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BadgeCheck, ShieldAlert, TicketX, Clock, Loader2, CalendarClock, Building2, Sparkles, ArrowRight } from 'lucide-react';
import { LogoMark } from '../components/Logo';
import { verifyToken, type VerifyResult } from '../services/verify';
import { errMsg } from '../lib/types';

function fmtWhen(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)) + ' IST';
  } catch {
    return '—';
  }
}

export default function Verify() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<{ loading: boolean; result: VerifyResult | null; error: string }>({
    loading: true, result: null, error: '',
  });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, result: null, error: '' });
    verifyToken(token || '')
      .then((result) => alive && setState({ loading: false, result, error: '' }))
      .catch((e: unknown) => alive && setState({ loading: false, result: null, error: errMsg(e) || 'Verification failed.' }));
    return () => { alive = false; };
  }, [token]);

  const r = state.result;
  const verdict = !r ? null : r.valid ? 'valid' : r.reason === 'cancelled' ? 'cancelled' : r.reason === 'expired' ? 'expired' : 'invalid';

  return (
    <div className="min-h-screen grid place-items-center p-6 relative overflow-hidden">
      <div className="mesh" />
      <div className="absolute inset-0 grid-bg opacity-30" />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <LogoMark size={36} />
          <span className="font-semibold tracking-tight text-xl">Velora</span>
        </div>

        <div className="glass rounded-3xl border border-app p-6 text-center">
          {state.loading && (
            <div className="py-10 flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-brand-indigo)]" />
              <p className="text-sm text-muted">Verifying ticket…</p>
            </div>
          )}

          {!state.loading && state.error && (
            <div className="py-8">
              <ShieldAlert className="h-10 w-10 mx-auto text-amber-400" />
              <h1 className="text-lg font-semibold mt-3">Couldn&apos;t verify</h1>
              <p className="text-sm text-muted mt-1">{state.error}</p>
              <button onClick={() => window.location.reload()} className="mt-5 rounded-xl border border-app px-5 py-2.5 text-sm font-medium hover:border-[var(--border-strong)]">
                Try again
              </button>
            </div>
          )}

          {!state.loading && r && (
            <>
              {verdict === 'valid' && <BadgeCheck className="h-12 w-12 mx-auto text-emerald-400" />}
              {verdict === 'cancelled' && <TicketX className="h-12 w-12 mx-auto text-red-400" />}
              {verdict === 'expired' && <Clock className="h-12 w-12 mx-auto text-amber-400" />}
              {verdict === 'invalid' && <ShieldAlert className="h-12 w-12 mx-auto text-red-400" />}
              <h1 className="text-xl font-semibold mt-3">
                {verdict === 'valid' && 'Valid ticket'}
                {verdict === 'cancelled' && 'Booking cancelled'}
                {verdict === 'expired' && 'Ticket expired'}
                {verdict === 'invalid' && 'Invalid ticket'}
              </h1>
              <p className="text-sm text-muted mt-1">{r.message || (r.valid ? 'This booking is confirmed.' : 'This ticket could not be verified.')}</p>

              {r.booking && (
                <div className="mt-5 rounded-2xl border border-app divide-y divide-[var(--border)] text-left text-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-dim flex items-center gap-2"><Sparkles className="h-4 w-4" />Reference</span>
                    <span className="font-mono font-semibold">{r.booking.ref}</span>
                  </div>
                  {r.booking.business && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-dim flex items-center gap-2"><Building2 className="h-4 w-4" />Business</span>
                      <span className="font-medium text-right truncate">{r.booking.business}</span>
                    </div>
                  )}
                  {r.booking.service && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-dim">Service</span>
                      <span className="font-medium text-right truncate">{r.booking.service}</span>
                    </div>
                  )}
                  {r.booking.start_time && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-dim flex items-center gap-2"><CalendarClock className="h-4 w-4" />When</span>
                      <span className="font-medium text-right">{fmtWhen(r.booking.start_time)}</span>
                    </div>
                  )}
                  {r.status && (
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-dim">Status</span>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${r.status === 'cancelled' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                        {r.status.toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {r.demo && <p className="text-[11px] text-dim mt-3">Signature verified offline · live status unavailable</p>}

              <Link to="/" className="mt-5 w-full grad-btn text-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2">
                Open Velora <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
        <p className="text-center text-[11px] text-dim mt-4">Velora secure tickets · signed &amp; tamper-evident</p>
      </motion.div>
    </div>
  );
}
