import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, AlertTriangle, Mail } from 'lucide-react';
import { PageHeader, Spinner, EmptyState } from '../../components/ui';
import { apiGet } from '../../lib/api';
import supabase from '../../lib/supabase';

const statusMeta: Record<string, { icon: any; color: string; label: string }> = {
  sent: { icon: CheckCircle2, color: '#34d399', label: 'Sent' },
  queued: { icon: Clock, color: '#f59e0b', label: 'Queued' },
  failed: { icon: AlertTriangle, color: '#ef4444', label: 'Failed' },
  pending: { icon: Clock, color: '#818cf8', label: 'Pending' },
};

export default function AdminEmails() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => apiGet('/api/admin?resource=emails').then((d) => { setLogs(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const ch = supabase.channel('adm-email').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'email_log' }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (loading) return <Spinner />;
  const queuedCount = logs.filter((l) => l.status === 'queued').length;

  return (
    <div>
      <PageHeader title="Email delivery" subtitle="Every booking confirmation is recorded here — verifiable and reliable." />
      <div className="mb-4 rounded-2xl border border-app bg-surface p-4 flex items-start gap-3">
        <Mail className="h-5 w-5 text-[var(--color-brand-indigo)] mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">How email works here</p>
          <p className="text-xs text-muted mt-0.5">
            Server bookings trigger real emails when <code className="text-[var(--text)]">RESEND_API_KEY</code> or <code className="text-[var(--text)]">SENDGRID_API_KEY</code> is configured — otherwise they queue (below) and the customer gets a one-tap Gmail compose fallback.
            Demo-tenant bookings never send real email; they notify in-app instead. Reminders run on the 15-minute scheduler.
          </p>
        </div>
      </div>
      {queuedCount > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-[var(--text)]">{queuedCount} email(s) queued</p>
            <p className="text-xs text-muted mt-0.5">Emails are queued when no provider is configured. Add a <code className="text-[var(--text)]">RESEND_API_KEY</code> (or SendGrid) to deliver instantly to Gmail and other inboxes.</p>
          </div>
        </div>
      )}
      {logs.length === 0 ? <EmptyState title="No emails yet" sub="Confirmation emails will appear here after the first booking." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-muted text-xs border-b border-app"><th className="px-4 py-3">Status</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3 hidden md:table-cell">Provider</th><th className="px-4 py-3">Ref</th><th className="px-4 py-3">Time</th></tr></thead>
          <tbody>{logs.map((l) => {
            const m = statusMeta[l.status] || statusMeta.pending; const Icon = m.icon;
            return (
              <tr key={l.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)]">
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg" style={{ background: `${m.color}1f`, color: m.color }}><Icon className="h-3.5 w-3.5" />{m.label}</span></td>
                <td className="px-4 py-3 text-[var(--text)]">{l.to_email}</td>
                <td className="px-4 py-3 text-muted max-w-[240px] truncate">{l.subject}</td>
                <td className="px-4 py-3 hidden md:table-cell text-muted">{l.provider}</td>
                <td className="px-4 py-3 font-mono text-xs">{l.booking_ref || '—'}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            );
          })}</tbody>
        </table></div></div>
      )}
    </div>
  );
}
