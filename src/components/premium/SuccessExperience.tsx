import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Navigation, CalendarPlus, Share2, Download, QrCode, CalendarCheck, MapPin, Clock, User, Sparkles, Loader2, Mail } from 'lucide-react';
import { inr } from '../../lib/format';
import { googleCalendarUrl } from '../../lib/calendar';
import { publicOrigin } from '../../lib/site';

interface Props {
  booking: any;
  business: any;
  invoice: any;
  mapsLink: string;
  qrPayload?: string;
  gmailComposeUrl?: string;
  emailStatus?: string;
  onDone?: () => void;
  onClose?: () => void;
}

function gcalLink(b: any, biz: any) {
  return googleCalendarUrl({
    title: `${b?.service_name || 'Appointment'} — ${biz?.name || 'Velora'}`,
    start: b?.start_time,
    end: b?.end_time || b?.start_time,
    location: biz?.address || biz?.name || '',
    details: `Velora booking ${b?.ref || ''}${b?.employee_name ? ` with ${b.employee_name}` : ''}. Manage: ${publicOrigin()}/appointments`,
  });
}

export default function SuccessExperience({ booking, business, invoice, mapsLink, qrPayload, gmailComposeUrl, emailStatus, onDone, onClose }: Props) {
  const nav = useNavigate();
  const done = onDone || onClose || (() => nav('/'));
  const emailSent = emailStatus === 'sending' || emailStatus === 'resend' || emailStatus === 'sendgrid' || emailStatus === 'smtp-relay';
  const [particles, setParticles] = useState<{ x: number; d: number; c: string; s: number }[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const colors = ['#60a5fa', '#818cf8', '#34d399', '#f59e0b', '#f472b6'];
    setParticles(Array.from({ length: 40 }).map(() => ({ x: Math.random() * 100, d: Math.random() * 0.5, c: colors[Math.floor(Math.random() * colors.length)], s: 6 + Math.random() * 8 })));
  }, []);

  const downloadPdf = async () => {
    setPdfLoading(true);
    try {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    doc.setFillColor(99, 102, 241); doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255); doc.setFontSize(22); doc.text('VELORA', 20, 25);
    doc.setFontSize(11); doc.text('Booking Confirmation', 20, 33);
    doc.setTextColor(20); doc.setFontSize(16); doc.text(booking.service_name, 20, 58);
    doc.setFontSize(11); doc.setTextColor(90);
    const rows: [string, string][] = [
      ['Booking ID', booking.ref],
      ['Business', business.name],
      ['Address', business.address || '-'],
      ...(booking.employee_name ? [['Specialist', booking.employee_name] as [string, string]] : []),
      ['Date & Time', new Date(booking.start_time).toLocaleString()],
      ['Invoice', invoice.number],
      ['Total', inr(invoice.total)],
    ];
    let y = 72;
    rows.forEach(([k, v]) => { doc.setTextColor(140); doc.text(k, 20, y); doc.setTextColor(30); doc.text(String(v), 80, y); y += 10; });
    if (qrPayload && qrPayload.startsWith('http')) { doc.setTextColor(100); doc.setFontSize(9); doc.text('Verify ticket: ' + qrPayload, 20, y + 2, { maxWidth: 170 }); y += 8; }
    doc.setDrawColor(220); doc.line(20, y, 190, y);
    doc.setTextColor(150); doc.setFontSize(9); doc.text('Present this confirmation or your QR ticket at check-in. Thank you for booking with Velora.', 20, y + 12, { maxWidth: 170 });
    doc.save(`Velora-${booking.ref}.pdf`);
    } catch (e) { console.error('[pdf]', e); } finally { setPdfLoading(false); }
  };

  const share = async () => {
    const data = { title: 'My Velora booking', text: `${booking.service_name} at ${business.name} on ${new Date(booking.start_time).toLocaleString()} — ${booking.ref}`, url: publicOrigin() };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); } } catch { /* cancelled */ }
  };

  const downloadQr = async () => {
    // High-resolution PNG (1024×1024, white quiet zone) — stays scannable when
    // printed or zoomed. Falls back to SVG if canvas export is unavailable.
    try {
      const svg = document.querySelector('[data-qr] svg');
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
      const vb = (svg as any).viewBox?.baseVal;
      const ratio = vb && vb.width ? vb.width / vb.height : 1;
      let w = size, h = size;
      if (ratio > 1) h = Math.round(size / ratio); else w = Math.round(size * ratio);
      ctx.drawImage(img, pad, pad + (size - h) / 2, w, h);
      URL.revokeObjectURL(svgUrl);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('toBlob failed');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Velora-${booking.ref}-ticket.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch {
      // SVG fallback — still a crisp, scannable vector ticket.
      try {
        const svg = document.querySelector('[data-qr] svg');
        if (!svg) return;
        const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Velora-${booking.ref}-ticket.svg`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } catch { /* non-fatal */ }
    }
  };

  // Prefer the server-stored QR payload so the ticket matches DB records.
  const qrData = String(qrPayload || (booking?.ref ? `${publicOrigin()}/appointments` : 'velora-ticket')).slice(0, 800);
  const isPending = booking?.status === 'pending';
  const total = Number(invoice?.total ?? invoice?.amount ?? booking?.price ?? 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[95] overflow-y-auto bg-[var(--bg)]">
      {/* Aurora bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-blue)]/25 blur-3xl" style={{ animation: 'aurora 8s ease-in-out infinite' }} />
        <div className="absolute top-20 right-1/4 h-96 w-96 rounded-full bg-[var(--color-brand-emerald)]/20 blur-3xl" style={{ animation: 'aurora 10s ease-in-out infinite reverse' }} />
      </div>
      {/* Confetti */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map((p, i) => (
          <motion.span key={i} initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: '110vh', opacity: 0, rotate: 360 }} transition={{ duration: 2.4 + p.d, delay: p.d, ease: 'easeIn' }}
            className="absolute rounded-sm" style={{ left: `${p.x}%`, width: p.s, height: p.s, background: p.c }} />
        ))}
      </div>

      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, delay: 0.1 }} className={`relative h-20 w-20 rounded-full grid place-items-center mb-6 ${isPending ? 'bg-amber-500' : 'grad-btn'}`}>
          <div className={`absolute inset-0 rounded-full blur-xl opacity-60 ${isPending ? 'bg-amber-500' : 'grad-btn'}`} />
          {isPending ? <Clock className="relative h-10 w-10 text-white" strokeWidth={2.5} /> : <Check className="relative h-10 w-10 text-white" strokeWidth={3} />}
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="text-3xl sm:text-4xl font-semibold tracking-tight text-center">
          {isPending ? 'Booking received! 🎉' : "You're all set! 🎉"}
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-muted mt-2 text-center">
          {isPending
            ? `${business?.name || 'The business'} has your request — they'll confirm shortly. You'll see the update here and in your bookings.`
            : 'Your appointment is confirmed. Add it to your calendar below.'}
        </motion.p>

        {/* Ticket card */}
        <motion.div initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.4, type: 'spring', damping: 20 }}
          className="mt-8 w-full max-w-md glass rounded-3xl overflow-hidden shadow-2xl">
          <div className="relative p-5 grad-btn text-white">
            <div className="flex items-center justify-between">
              <div><p className="text-xs opacity-80">Booking ID</p><p className="text-lg font-mono font-semibold">{booking.ref}</p></div>
              <CalendarCheck className="h-8 w-8 opacity-90" />
            </div>
          </div>
          {/* perforation */}
          <div className="relative h-4 bg-[var(--glass)]"><div className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[var(--bg)]" /><div className="absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-[var(--bg)]" /><div className="mx-5 border-t border-dashed border-app h-0" /></div>
          <div className="p-5">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2.5 text-sm">
                <p className="font-semibold text-base">{booking.service_name}</p>
                <p className="flex items-center gap-2 text-muted"><Sparkles className="h-4 w-4 text-[var(--color-brand-indigo)]" />{business.name}</p>
                {booking.employee_name && <p className="flex items-center gap-2 text-muted"><User className="h-4 w-4" />{booking.employee_name}</p>}
                <p className="flex items-center gap-2 text-muted"><Clock className="h-4 w-4" />{new Date(booking.start_time).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                <p className="flex items-center gap-2 text-muted"><MapPin className="h-4 w-4" /><span className="truncate">{business.address}</span></p>
              </div>
              <div className="shrink-0 text-center">
                <div className="p-2 rounded-xl bg-white" data-qr>{qrData ? <QRCodeSVG value={qrData} size={92} level="M" /> : <QrCode className="h-16 w-16 text-dim" />}</div>
                <p className="text-[10px] text-dim mt-1.5">Scan at check-in</p>
                {qrData.startsWith('http') && <a href={qrData} target="_blank" rel="noreferrer" className="text-[10px] text-[var(--color-brand-indigo)] underline underline-offset-2">Verify ticket</a>}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-app flex items-center justify-between">
              <span className="text-sm text-dim">Total</span><span className="font-semibold">{inr(total)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {isPending ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-400"><Clock className="h-3 w-3" /> Awaiting business confirmation</span>
              ) : (
                <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full ${emailSent ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>{emailSent ? <><Check className="h-3 w-3" /> Confirmation email sent</> : <><Mail className="h-3 w-3" /> Emailing your confirmation</>}</span>
              )}
              <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400"><Check className="h-3 w-3" /> Reminders scheduled</span>
            </div>
          </div>
        </motion.div>

        {/* Actions */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="mt-6 w-full max-w-md grid grid-cols-2 gap-2.5">
          <a href={gcalLink(booking, business)} target="_blank" rel="noreferrer" className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><CalendarPlus className="h-4 w-4" /> Add to Google Calendar</a>
          <a href={mapsLink} target="_blank" rel="noreferrer" className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><Navigation className="h-4 w-4" /> Directions</a>
          <button onClick={share} className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><Share2 className="h-4 w-4" /> Share</button>
          <button onClick={downloadPdf} disabled={pdfLoading} className="rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)] disabled:opacity-60">{pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PDF</button>
          <button onClick={downloadQr} className="col-span-2 rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]"><QrCode className="h-4 w-4" /> Download QR ticket (PNG)</button>
        </motion.div>
        {gmailComposeUrl && (
          <motion.a initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }} href={gmailComposeUrl} target="_blank" rel="noreferrer"
            className="mt-3 w-full max-w-md rounded-xl border border-app py-3 text-sm font-medium flex items-center justify-center gap-2 hover:border-[var(--border-strong)]">
            <Mail className="h-4 w-4 text-red-400" /> Send confirmation to my Gmail
          </motion.a>
        )}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-4 w-full max-w-md flex gap-2.5">
          <button onClick={() => nav('/appointments')} className="flex-1 grad-btn text-white rounded-xl py-3 text-sm font-medium">View my bookings</button>
          <button onClick={done} className="flex-1 rounded-xl border border-app py-3 text-sm font-medium">Book another</button>
        </motion.div>
      </div>
    </motion.div>
  );
}
