import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { PageHeader, Spinner, EmptyState } from '../components/ui';
import { apiGet } from '../lib/api';
import type { AuditLog } from '../lib/types';

export default function Audit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet<AuditLog[]>('/api/audit').then(d => setLogs(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Immutable record of every action — for compliance and trust." />
      {logs.length === 0 ? <EmptyState title="No audit entries yet" sub="Actions like bookings, cancellations and status changes are logged here." /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-dim text-xs border-b border-app"><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Entity</th><th className="px-4 py-3 hidden md:table-cell">IP</th></tr></thead>
          <tbody>{logs.map(l => (<tr key={l.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)]"><td className="px-4 py-3 text-muted whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td><td className="px-4 py-3">{l.actor}</td><td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-lg bg-surface"><Shield className="h-3 w-3 text-[var(--color-brand-indigo)]" />{l.action}</span></td><td className="px-4 py-3 text-muted">{l.entity} #{l.entity_id}</td><td className="px-4 py-3 hidden md:table-cell text-dim font-mono text-xs">{l.ip}</td></tr>))}</tbody>
        </table></div></div>
      )}
    </div>
  );
}
