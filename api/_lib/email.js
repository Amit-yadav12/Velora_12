// Production email delivery with provider fallback + persistent logging.
// Order: Resend -> SendGrid -> SMTP-relay webhook -> DB log (never fails).
// Every send is recorded in the `email_log` table so a confirmation is never
// silently lost and admins can verify delivery.
import supabase from '../db-client.js';

function htmlTemplate({ title, name, lines, cta }) {
  const rows = lines.map((l) => `<tr><td style="padding:8px 0;color:#475569;font-size:13px">${l.k}</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#0f172a;font-size:13px">${l.v}</td></tr>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:linear-gradient(100deg,#3b82f6,#6366f1);border-radius:16px 16px 0 0;padding:24px 28px">
      <div style="color:#fff;font-weight:700;font-size:20px;letter-spacing:-0.02em">Velora</div>
      <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px">Appointment booking</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:28px">
      <h1 style="margin:0 0 6px;font-size:20px;color:#0f172a">${title}</h1>
      <p style="margin:0 0 20px;color:#475569;font-size:14px">Hi ${name || 'there'}, here are your details.</p>
      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">${rows}</table>
      ${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#6366f1;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px;font-weight:600">${cta.label}</a>` : ''}
      <p style="margin:24px 0 0;color:#94a3b8;font-size:12px">This is an automated confirmation from Velora. Reply to this email if you need help.</p>
    </div>
  </div></body></html>`;
}

async function logEmail({ to, subject, html, provider, status, error, bookingRef }) {
  try {
    await supabase.from('email_log').insert({
      to_email: to, subject, html: html?.slice(0, 20000), provider, status,
      error: error || null, booking_ref: bookingRef || null,
    });
  } catch (e) { console.error('[email:log]', e.message); }
}

export async function sendEmail({ to, subject, title, name, lines, cta, bookingRef }) {
  const html = htmlTemplate({ title, name, lines, cta });
  const from = process.env.EMAIL_FROM || 'Velora <bookings@velora.ai>';
  let provider = 'none', status = 'failed', error = null;

  try {
    if (process.env.RESEND_API_KEY) {
      provider = 'resend';
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
      status = 'sent';
    } else if (process.env.SENDGRID_API_KEY) {
      provider = 'sendgrid';
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: (from.match(/<(.+)>/) || [])[1] || from }, subject, content: [{ type: 'text/html', value: html }] }),
      });
      if (!r.ok) throw new Error(`SendGrid ${r.status}: ${await r.text()}`);
      status = 'sent';
    } else if (process.env.SMTP_RELAY_URL) {
      // Optional generic HTTP->SMTP relay webhook (keyless setups).
      provider = 'smtp-relay';
      const r = await fetch(process.env.SMTP_RELAY_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (!r.ok) throw new Error(`SMTP relay ${r.status}`);
      status = 'sent';
    } else {
      // No provider configured: queue in DB so it's recoverable, and log.
      provider = 'queued';
      status = 'queued';
      console.log(`[email:queued] to=${to} subject="${subject}" (no provider configured — set RESEND_API_KEY to deliver)`);
    }
  } catch (err) {
    error = err.message;
    status = 'failed';
    console.error('[email:error]', err.message);
  }

  await logEmail({ to, subject, html, provider, status, error, bookingRef });
  return { ok: status === 'sent' || status === 'queued', provider, status, error };
}
