// Door check-in dialog — scan (or paste) a ticket, get a verdict.
//
// Camera scanning is a progressive enhancement: it appears only when the browser
// exposes BarcodeDetector *and* a camera. The paste path is always available, so
// the flow works on every device and in every automated test.
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, ClipboardPaste, Loader2, ScanLine, ShieldAlert, XCircle } from 'lucide-react';
import { Modal, btnGhost, btnPrimary, inputCls } from '../ui';
import { checkInFromTicket, applyCheckIn, type CheckInPlan } from '../../services/checkIn';
import type { ConsoleBooking } from '../../lib/types';

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function detectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

const CODE_STYLE: Record<string, { ring: string; icon: 'ok' | 'warn' | 'error' }> = {
  verified: { ring: 'border-emerald-500/40 bg-emerald-500/10', icon: 'ok' },
  already_checked_in: { ring: 'border-cyan-500/40 bg-cyan-500/10', icon: 'ok' },
  pending: { ring: 'border-amber-500/40 bg-amber-500/10', icon: 'warn' },
  not_found: { ring: 'border-amber-500/40 bg-amber-500/10', icon: 'warn' },
  other_business: { ring: 'border-amber-500/40 bg-amber-500/10', icon: 'warn' },
};

export default function CheckInDialog({ open, onClose, bookings, onCheckedIn, onOpenBooking }: {
  open: boolean;
  onClose: () => void;
  bookings: readonly ConsoleBooking[];
  onCheckedIn: () => void;
  onOpenBooking?: (b: ConsoleBooking) => void;
}) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<CheckInPlan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canScan = typeof window !== 'undefined' && !!detectorCtor() && !!navigator?.mediaDevices?.getUserMedia;

  const stopScan = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  // Never leave the camera running once the dialog closes/unmounts.
  useEffect(() => () => stopScan(), []);
  useEffect(() => {
    if (!open) { stopScan(); setScanNote(''); }
  }, [open]);

  const submit = async (value: string) => {
    if (busy) return;
    setBusy(true);
    const result = await checkInFromTicket(value, { bookings, apply: applyCheckIn });
    setPlan(result);
    setBusy(false);
    if (result.code === 'verified') onCheckedIn();
  };

  const reset = () => { setInput(''); setPlan(null); setScanNote(''); };

  const startScan = async () => {
    const Detector = detectorCtor();
    if (!Detector) return;
    setScanNote('');
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      const detector = new Detector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw) {
            stopScan();
            setInput(raw);
            await submit(raw);
            return;
          }
        } catch { /* a dropped frame is not an error */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopScan();
      setScanNote('Camera access was blocked. Paste the ticket link instead — it verifies exactly the same way.');
    }
  };

  const style = plan ? CODE_STYLE[plan.code] || { ring: 'border-red-500/40 bg-red-500/10', icon: 'error' as const } : null;

  return (
    <Modal open={open} onClose={() => { stopScan(); onClose(); }} title="Verify ticket & check in">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Scan the guest&apos;s Velora QR ticket. The ticket signature is verified before the
          appointment is marked checked-in — a screenshot of an altered code will not pass.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); if (input.trim()) submit(input.trim()); }}
          className="space-y-2"
        >
          <label htmlFor="ticket-input" className="text-xs text-dim">Ticket link or token</label>
          <textarea
            id="ticket-input"
            value={input}
            onChange={(e) => { setInput(e.target.value); setPlan(null); }}
            rows={2}
            spellCheck={false}
            autoComplete="off"
            placeholder="Paste the ticket link (…/verify/local.… or …/verify/v1.…) or scan below"
            className={`${inputCls} font-mono text-xs resize-none`}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || !input.trim()} className={btnPrimary + ' flex-1 min-w-[140px]'}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</> : <><ShieldAlert className="h-4 w-4" /> Verify &amp; check in</>}
            </button>
            {canScan && !scanning && (
              <button type="button" onClick={startScan} className={btnGhost}>
                <Camera className="h-4 w-4" /> Scan QR
              </button>
            )}
            {scanning && (
              <button type="button" onClick={stopScan} className={btnGhost}>
                <CameraOff className="h-4 w-4" /> Stop camera
              </button>
            )}
            {plan && (
              <button type="button" onClick={reset} className={btnGhost}>
                <ClipboardPaste className="h-4 w-4" /> Next ticket
              </button>
            )}
          </div>
        </form>

        {scanning && (
          <div className="rounded-xl overflow-hidden border border-app bg-black/40 relative">
            {/* Camera preview only — muted and never played back, so no captions apply. */}
            <video ref={videoRef} muted playsInline className="w-full max-h-56 object-cover" />
            <div role="status" className="absolute inset-x-0 bottom-0 bg-black/60 text-[11px] text-white/90 px-3 py-1.5 flex items-center gap-1.5">
              <ScanLine className="h-3 w-3" aria-hidden="true" /> Hold the ticket QR inside the frame
            </div>
          </div>
        )}

        {scanNote && <p className="text-xs text-amber-400">{scanNote}</p>}

        <div aria-live="polite" aria-atomic="true">
          {plan && style && (
            <div className={`rounded-2xl border p-4 ${style.ring}`} data-checkin-code={plan.code}>
              <div className="flex items-start gap-3">
                {style.icon === 'ok'
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  : style.icon === 'warn'
                    ? <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    : <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="font-medium">{plan.title}</p>
                  <p className="text-sm text-muted mt-0.5">{plan.message}</p>
                  {plan.ref && <p className="text-[11px] font-mono text-dim mt-1.5">{plan.ref}</p>}
                  {plan.booking && onOpenBooking && (
                    <button
                      type="button"
                      onClick={() => { onOpenBooking(plan.booking as ConsoleBooking); stopScan(); onClose(); }}
                      className="mt-2 text-xs font-medium text-[var(--color-brand-indigo)]"
                    >
                      Open appointment
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] text-dim leading-relaxed">
          Valid tickets: signature check + expiry + live booking status. Cancelled appointments,
          altered codes and tickets from another business are all refused.
        </p>
      </div>
    </Modal>
  );
}
