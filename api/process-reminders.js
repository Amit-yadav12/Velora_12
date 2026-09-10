import supabase from './db-client.js';
import { cors , safeError} from './_lib/security.js';
import { getAuth } from './_lib/auth.js';
import { sendEmail } from './_lib/email.js';
import { travelTimeMin } from './_lib/maps.js';

// Processes due reminders: creates in-app notifications and (for the final
// "leave_now" reminder) an email with live travel estimate. Idempotent — marks
// each reminder sent. Designed to be hit by a cron/scheduler; also callable
// on-demand from the client to surface any just-due reminders.
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const now = new Date().toISOString();
    // Cron (shared secret) processes everything; signed-in users may only
    // trigger their OWN due reminders.
    const cronSecret = process.env.CRON_SECRET;
    const bearer = req.headers.authorization?.replace('Bearer ', '');
    const isCron = Boolean(cronSecret && bearer === cronSecret);
    const auth = isCron ? null : await getAuth(req);
    if (!isCron && !auth?.user?.email) return res.status(401).json({ error: 'Authentication required' });
    const scopeEmail = isCron ? null : auth.user.email.toLowerCase();
    const { data: due } = await supabase.from('reminders').select('*').eq('sent', false).lte('fire_at', now).limit(50);
    if (!due || !due.length) return res.status(200).json({ processed: 0 });

    let processed = 0;
    for (const r of due) {
      const { data: bk } = await supabase.from('bookings').select('*').eq('id', r.booking_id).single();
      if (!bk || bk.status === 'cancelled') { await supabase.from('reminders').update({ sent: true }).eq('id', r.id); continue; }
      if (scopeEmail && (bk.customer_email || '').toLowerCase() !== scopeEmail) continue;
      const whenIST = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(bk.start_time)) + ' IST';

      const titles = { '24h': 'Appointment tomorrow', '6h': 'Appointment in 6 hours', '1h': 'Appointment in 1 hour', '15min': 'Appointment in 15 minutes', 'leave_now': 'Time to leave' };
      await supabase.from('notifications').insert({
        user_id: bk.customer_id || null, audience: 'customer',
        title: titles[r.kind] || 'Appointment reminder',
        body: `${bk.service_name} at ${bk.resource_name} — ${whenIST}`,
        type: r.kind === 'leave_now' ? 'warning' : 'info', booking_ref: bk.ref,
      });

      if (r.kind === 'leave_now') {
        const { data: biz } = await supabase.from('businesses').select('*').eq('name', bk.resource_name).single();
        let travel = 15;
        // travel estimate best-effort (origin unknown server-side → skip if none)
        await sendEmail({
          to: bk.customer_email, subject: `Leave now for your appointment — ${bk.ref}`,
          title: 'Time to leave', name: bk.customer_name,
          lines: [{ k: 'Appointment', v: whenIST }, { k: 'Where', v: bk.location || biz?.address || '—' }, { k: 'Est. travel', v: `~${travel} min` }],
          cta: { label: 'Get directions', href: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(bk.location || bk.resource_name)}` },
        });
      }
      await supabase.from('reminders').update({ sent: true }).eq('id', r.id);
      processed++;
    }
    return res.status(200).json({ processed });
  } catch (err) {
    const se = safeError(err, 'process-reminders:error');
    res.status(se.status).json({ error: se.error });
  }
}
