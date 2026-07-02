import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{subtitle && <p className="text-sm text-dim mt-1">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: 'bg-blue-500/15 text-blue-400', in_progress: 'bg-indigo-500/15 text-indigo-400', checked_in: 'bg-cyan-500/15 text-cyan-400',
    completed: 'bg-emerald-500/15 text-emerald-400', cancelled: 'bg-red-500/15 text-red-400',
    no_show: 'bg-amber-500/15 text-amber-400',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-lg capitalize ${map[status] || 'bg-surface text-dim'}`}>{status.replace('_', ' ')}</span>;
}

export function Spinner() {
  return <div className="grid place-items-center py-20"><div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></div>;
}

export function EmptyState({ title, sub }: { title: string; sub?: string }) {
  return <div className="card p-10 text-center"><p className="font-medium">{title}</p>{sub && <p className="text-sm text-dim mt-1">{sub}</p>}</div>;
}
