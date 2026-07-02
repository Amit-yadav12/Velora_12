import { useEffect, useState } from 'react';
import { istDate } from '../../lib/format';
import { PageHeader, Spinner, EmptyState } from '../../components/ui';
import { apiGet } from '../../lib/api';

export default function AdminCustomers() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { apiGet('/api/admin?resource=customers').then(d => { setList(d); setLoading(false); }).catch(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title="Customers" subtitle={`${list.length} registered customers.`} />
      {list.length === 0 ? <EmptyState title="No customers yet" /> : (
        <div className="card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-dim text-xs border-b border-app"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3 hidden md:table-cell">Phone</th><th className="px-4 py-3">Joined</th></tr></thead>
          <tbody>{list.map(c => (<tr key={c.id} className="border-b border-app last:border-0 hover:bg-[var(--surface-hover)]"><td className="px-4 py-3 flex items-center gap-2"><span className="h-8 w-8 rounded-full grad-btn grid place-items-center text-white text-xs font-semibold">{(c.full_name || 'U').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}</span>{c.full_name}</td><td className="px-4 py-3 text-muted">{c.email}</td><td className="px-4 py-3 hidden md:table-cell text-muted">{c.phone || '—'}</td><td className="px-4 py-3 text-muted">{istDate(c.created_at)}</td></tr>))}</tbody>
        </table></div></div>
      )}
    </div>
  );
}
