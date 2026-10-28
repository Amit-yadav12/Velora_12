import { istDateTime } from '../../lib/format';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Navigation, CalendarPlus, Share2, Download, QrCode, CalendarCheck, MapPin, Clock, User, Sparkles, Loader2, Mail } from 'lucide-react';
import { inr } from '../../lib/format';
import { googleCalendarUrl } from '../../lib/calendar';
import { publicOrigin } from '../../lib/site';
import { downloadBlob, svgBlob } from '../../lib/download';
import Portal from '../Portal';
import type { Business } from '../../lib/product';
import type { TicketBooking, TicketInvoice } from '../../lib/types';

interface Props {
  booking: TicketBooking;
  business: Business;
  invoice: TicketInvoice;
  mapsLink: string;
  qrPayload?: string;
  gmailComposeUrl?: string;
  emailStatus?: string;
  /** True only when server-side reminders were actually persisted. */
  remindersScheduled?: boolean;
  /** Sample bookings are local to this browser and are not valid real tickets. */
  demo?: boolean;
  onDone?: () => void;
  onClose?: () => void;
}

function gcalLink(b: TicketBooking, biz: Business) {
  return googleCalendarUrl({
    title: `${b?.service_name || 'Appointment'} — ${biz?.name || 'Velora'}`,
    start: b?.start_time,
    end: b?.end_time || b?.start_time,
    location: biz?.address || biz?.name || '',
    details: `Velora booking ${b?.ref || ''}${b?.employee_name ? ` with ${b.employee_name}` : ''}. Manage: ${publicOrigin()}/appointments`,
  });
}

export default function SuccessExperience({ booking, business, invoice, mapsLink, qrPayload, gmailComposeUrl, emailStatus, remindersScheduled, demo = false, onDone, onClose }: Props) {
  const nav = useNavigate();
  const reduceMotion = useReducedMotion();
  const done = onDone || onClose || (() => nav('/'));
  // Honest email badge: only claim a send when a provider actually accepted it.
  const emailSent = emailStatus === 'resend' || emailStatus === 'sendgrid' || emailStatus === 'smtp-relay';
  const emailQueued = emailStatus === 'queued';
  const [particles, setParticles] = useState<{ x: number; d: number; c: string; s: number }[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    // A short, deliberate celebration — skipped entirely for reduced motion.
    if (reduceMotion) { setParticles([]); return; }
    const colors = ['#60a5fa', '#818cf8', '#34d399', '#f59e0b', '#f472b6'];
    setParticles(Array.from({ length: 24 }).map(() => ({ x: Math.random() * 100, d: Math.random() * 0.4, c: colors[Math.floor(Math.random() * colors.length)], s: 5 + Math.random() * 6 })));
    // Remove the pieces once they have fallen: decoration must not keep sitting
    // over the ticket (it also made automated contrast checks unreadable).
    const clear = window.setTimeout(() => setParticles([]), 3200);
    return () => window.clearTimeout(clear);
  }, [reduceMotion]);

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFillColor(99, 102, 241); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255); doc.setFontSize(22); doc.text('VELORA', 20, 25);
    doc.setFontSize(11); doc.text(demo ? 'DEMO - NOT A REAL BOOKING' : 'Booking Confirmation', 20, 33);
    doc.setTextColor(20); doc.setFontSize(16); doc.text(booking.service_name, 20, 58);
    doc.setFontSize(11); doc.setTextColor(90);
    const rows: [string, string][] = [
      ['Booking ID', booking.ref],
      ['Business', business.name],
      ['Address', business.address || '-'],
      ...(booking.employee_name ? [['Specialist', booking.employee_name] as [string, string]] : []),
      ['Date & Time', istDateTime(booking.start_time)],
      ['Invoice', invoice.number],
      ['Total', inr(invoice.total)],
    ];
    let y = 72;
    rows.forEach(([k, v]) => { doc.setTextColor(140); doc.text(k, 20, y); doc.setTextColor(30); doc.text(String(v), 80, y); y += 10; });
    if (qrPayload && qrPayload.startsWith('http')) { doc.setTextColor(100); doc.setFontSize(9); doc.text('Verify ticket: ' + qrPayload, 20, y + 2, { maxWidth: 170 }); y += 8; }
    doc.setDrawColor(220); doc.line(20, y, 190, y);
    doc.setTextColor(150); doc.setFontSize(9); doc.text(demo ? 'Demo only. Not a real appointment or valid check-in ticket.' : 'Present your QR ticket at check-in. Thank you for booking with Velora.', 20, y + 12, { maxWidth: 170 });
    // Download it ourselves: jsPDF's internal save() silently no-ops in some
    // environments (and gives no signal when it does), so the anchor path is
    // the single, predictable download route for both PDF and QR.
    downloadBlob(doc.output('blob'), `Velora-${booking.ref}.pdf`);
    } catch (e) { console.error('[pdf]', e); } finally { setPdfLoading(false); }
  };

  const share = async () => {
    const data = { title: demo ? 'Velora demo request' : 'My Velora booking', text: `${demo ? 'DEMO ONLY — not an appointment. ' : ''}${booking.service_name} at ${business.name} on ${istDateTime(booking.start_time)} — ${booking.ref}`, url: publicOrigin() };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); } } catch { /* cancelled */ }
  };

  const downloadQr = async () => {
    // High-resolution PNG (1024×1024, white quiet zone) — stays scannable when
    // printed or zoomed. Falls back to SVG if canvas export is unavailable.
    try {
      const svg = document.querySelector('[data-qr] svg') as SVGSVGElement | null;
      if (!svg) return;
      const xml = new XMLSerializer().serializeToString(svg);
      const svgUrl = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg load failed'));
        img.src = svgUrl;
      });
      const px = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = px; canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas ctx');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, px, px);
      const pad = Math.round(px * 0.08); // quiet zone keeps it scannable
      const size = px - pad * 2;
      const vb = (svg as SVGSVGElement).viewBox?.baseVal;
      const ratio = vb && vb.width ? vb.width / vb.height : 1;
      let w = size, h = size;
      if (ratio > 1) h = Math.round(size / ratio); else w = Math.round(size * ratio);
      ctx.drawImage(img, pad, pad + (size - h) / 2, w, h);
      URL.revokeObjectURL(svgUrl);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      downloadBlob(blob, `Velora-${booking.ref}-ticket.png`);
    } catch {
      // SVG fallback — still a crisp, scannable vector ticket.
      const blob = svgBlob(document.querySelector('[data-qr] svg') as SVGSVGElement | null);
      if (blob) downloadBlob(blob, `Velora-${booking.ref}-ticket.svg`);
    }
  };

  // Prefer the server-stored QR payload so the ticket matches DB records.
  const qrData = String(qrPayload || '').slice(0, 1600);
  const isPending = booking?.status === 'pending';
  const total = Number(invoice?.total ?? invoice?.amount ?? booking?.price ?? 0);
  const subtotal = Number(invoice?.amount ?? booking?.price ?? 0);
  const tax = Number(invoice?.tax ?? Math.max(0, total - subtotal));

  return (
    <Portal>
    <motion.div
      role="region"
      aria-label={demo ? 'Sample booking confirmation' : 'Booking confirmation'}
      data-success-overlay
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[95] overflow-y-auto bg-[var(--bg)]"
    >
      {/* Aurora bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-blue)]/10 blur-3xl" style={{ animation: 'aurora 8s ease-in-out infinite' }} />
        <div className="absolute top-20 right-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-emerald)]/8 blur-3xl" style={{ animation: 'aurora 10s ease-in-out infinite reverse' }} />
      </div>
      {/* Confetti */}
      {particles.length > 0 && <div className="fixed inset-0 pointer-events-none overflow-hidden" data-confetti aria-hidden="true">
        {particles.map((p, i) => (
          <motion.span key={i} initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: '110vh', opacity: 0, rotate: 360 }} transition={{ duration: 2.4 + p.d, delay: p.d, ease: 'easeIn' }}
            className="absolute rounded-sm" style={{ left: `${p.x}%`, width: p.s, height: p.s, background: p.c }} />
        ))}
      </div>}

      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-10 sm:py-12">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, delay: 0.1 }} className={`relative h-20 w-20 rounded-full grid place-items-center mb-6 ${isPending ? 'bg-amber-500' : 'grad-btn'}`}>
          <div className={`absolute inset-0 rounded-full blur-xl opacity-60 ${isPending ? 'bg-amber-500' : 'grad-btn'}`} />
          {isPending ? <Clock className="relative h-10 w-10 text-white" strokeWidth={2.5} /> : <Check className="relative h-10 w-10 text-white" strokeWidth={3} />}
        </motion.div>
        {demo && (
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-brand-violet)]/30 bg-[var(--color-brand-violet)]/12 px-3 py-1 text-[11px] font-medium text-[var(--text-link-strong)]">
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" /> Sample data · demo tenant
          </span>
        )}
        <motion.h1 initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.15 }} className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
          {demo ? 'Demo request saved' : isPending ? 'Booking request received' : 'Your appointment is confirmed'}
        </motion.h1>
        <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.25 }} className="text-muted mt-2 text-center max-w-md">
          {demo ? 'This sample is saved on this device only. It is not a real appointment or valid check-in ticket.' : isPending
            ? 'Your request is awaiting confirmation from the business.'
            : 'Your appointment is saved. Add it to your calendar below.'}
        </motion.p>

        {/* Ticket card */}
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.3, type: 'spring', damping: 24 }}
          className="mt-7 w-full max-w-md rounded-3xl border border-app bg-[var(--bg-elev)] overflow-hidden shadow-2xl">
          <div className="relative p-5 grad-btn text-white">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="text-xs opacity-80">{demo ? 'Sample booking ID' : 'Booking ID'}</p><p className="text-lg font-mono font-semibold break-all">{booking.ref}</p></div>
              <div className="text-right shrink-0">
                <CalendarCheck className="h-8 w-8 opacity-90 ml-auto" aria-hidden="true" />
                {demo && <p className="mt-1 text-[10px] uppercase tracking-[.14em] opacity-90">Demo ticket</p>}
              </div>
            </div>
          </div>
          {/* perforation */}
          <div className="relative h-4 bg-[var(--bg-elev)]"><div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[var(--bg)]" /><div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[var(--bg)]" /><div className="mx-5 border-t border-dashed border-app h-0" /></div>
          <div className="p-5">
            <div className="flex flex-col-reverse gap-4 sm:flex-row">
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="font-semibold text-base leading-tight">{booking.service_name}</p>
                <p className="flex items-start gap-2 text-muted"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-link-strong)]" aria-hidden="true" /><span className="min-w-0 break-words">{business.name}</span></p>
                {booking.employee_name && <p className="flex items-start gap-2 text-muted"><User className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{booking.employee_name}</span></p>}
                <p className="flex items-start gap-2 text-muted"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0">{istDateTime(booking.start_time)} IST</span></p>
                <p className="flex items-start gap-2 text-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">{business.address}</span></p>
              </div>
              {qrData && <div className="shrink-0 text-center sm:text-right">
                <div className="rounded-xl bg-white p-2" data-qr role="img" aria-label={`QR ticket for sample booking ${booking.ref}`}>
                  {qrData ? <QRCodeSVG value={qrData} size={92} level="M" aria-hidden="true" /> : <QrCode className="h-16 w-16 text-dim" aria-hidden="true" />}
                </div>
                <p className="mt-1.5 text-[10px] text-muted">{demo ? 'Sample QR' : 'Scan at check-in'}</p>
                {qrData.startsWith('http') && <a href={qrData} target="_blank" rel="noreferrer" className="text-[10px] text-[var(--text-link-strong)] underline underline-offset-2">Verify ticket</a>}
              </div>}
            </div>
            <div className="mt-4 space-y-1.5 border-t border-app pt-4 text-sm">
              <div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-muted">{booking.service_name} · {invoice?.number || 'invoice'}</span><span className="shrink-0 tabular-nums">{inr(subtotal)}</span></div>
              {tax > 0 && <div className="flex items-center justify-between"><span className="text-muted">GST 18%{demo ? ' (sample invoice)' : ''}</span><span className="tabular-nums">{inr(tax, { decimals: true })}</span></div>}
              <div className="flex items-center justify-between pt-1.5 border-t border-app"><span className="font-medium">Total</span><span className="font-semibold tabular-nums">{inr(total)}</span></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {demo ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-200"><Clock className="h-3 w-3" aria-hidden="true" /> Sample only · no business notification sent</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] text-amber-200"><Clock className="h-3 w-3" aria-hidden="true" /> No payment taken · confirm it in the demo console</span>
                </>
              ) : isPending ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400"><Clock className="h-3 w-3" /> Awaiting business confirmation</span>
              ) : emailSent ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200"><Check className="h-3 w-3" /> Email accepted by provider</span>
              ) : emailQueued ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-200"><Mail className="h-3 w-3" /> Email recorded in log · not sent</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-blue-500/15 text-blue-200"><Mail className="h-3 w-3" /> {emailStatus === 'failed' ? 'Email delivery failed · view your booking here' : 'Email delivery not confirmed · view your booking here'}</span>
              )}
              {remindersScheduled ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200"><Check className="h-3 w-3" /> Reminder records saved · delivery not verified</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-200"><Clock className="h-3 w-3" /> Check your bookings for updates</span>
              )}
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduceMotion ? 0 : 0.4 }} className="mt-6 grid w-full max-w-md grid-cols-2 gap-2.5">
          {!demo && <a href={gcalLink(booking, business)} target="_blank" rel="noreferrer" className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><CalendarPlus className="h-4 w-4" /> Add to Google Calendar</a>}
          {!demo && <a href={mapsLink} target="_blank" rel="noreferrer" className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><Navigation className="h-4 w-4" /> Directions</a>}
          <button onClick={share} className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><Share2 className="h-4 w-4" /> Share</button>
          <button onClick={downloadPdf} disabled={pdfLoading} className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)] disabled:opacity-60">{pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF</button>
          {qrData && <button onClick={downloadQr} className="col-span-2 rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><QrCode className="h-4 w-4" /> Download QR ticket (PNG)</button>}
        </motion.div>
        {gmailComposeUrl && (
          <motion.a initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} href={gmailComposeUrl} target="_blank" rel="noreferrer"
            className="mt-3 w-full max-w-md rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]">
            <Mail className="h-4 w-4 text-red-400" /> Send confirmation to my Gmail
          </motion.a>
        )}
        <motion.div initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduceMotion ? 0 : 0.5 }} className="mt-4 w-full max-w-md flex gap-2.5">
          <button onClick={() => nav('/appointments')} className="flex-1 grad-btn text-white rounded-xl py-3 text-sm font-medium">View my bookings</button>
          <button onClick={done} className="flex-1 rounded-xl border border-app py-3 text-sm font-medium">Book another</button>
        </motion.div>
      </div>
    </motion.div>
    </Portal>
  );
}
