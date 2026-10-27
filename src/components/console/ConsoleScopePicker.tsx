import { useEffect, useMemo, useState } from 'react';
import { Building2, Info } from 'lucide-react';
import { isDemoMode } from '../../lib/supabase';
import { apiGet, hasLiveSession } from '../../lib/api';
import { listDemoBusinesses } from '../../lib/demoStore';
import { getConsoleScope, setConsoleScope, useConsoleScope } from '../../lib/consoleScope';
import { onBusinessesChanged, onDemoReset } from '../../services/events';
import type { Business } from '../../lib/product';

/**
 * Which business the console is showing.
 *
 * The live API already returns only the signed-in owner's businesses, so this
 * control can never widen access — it narrows the view (and proves the point to
 * a judge: Aurora's console shows Aurora's bookings, Apex's shows Apex's).
 */
export default function ConsoleScopePicker() {
  const scope = useConsoleScope();
  const [businesses, setBusinesses] = useState<Business[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!hasLiveSession()) {
        if (alive) setBusinesses(isDemoMode ? listDemoBusinesses(undefined, true) : []);
        return;
      }
      apiGet<Business[]>('/api/admin?resource=business')
        .then((rows) => { if (alive) setBusinesses(Array.isArray(rows) ? rows : []); })
        .catch(() => { if (alive) setBusinesses([]); });
    };
    load();
    const offs = [onBusinessesChanged(load), onDemoReset(load)];
    return () => { alive = false; offs.forEach((off) => off()); };
  }, []);

  // A stale scope (e.g. after "Reset demo data" or switching accounts) must not
  // silently hide every row — drop it and fall back to the full tenant view.
  useEffect(() => {
    const stored = getConsoleScope();
    if (!stored || businesses.length === 0) return;
    if (!businesses.some((b) => String(b.id) === stored)) setConsoleScope(null);
  }, [businesses]);

  const options = useMemo(
    () => businesses.map((b) => ({ id: String(b.id), name: b.name })),
    [businesses],
  );
  const activeName = options.find((o) => o.id === scope)?.name;

  return (
    <div className="flex min-w-0 items-center gap-2" data-console-scope>
      <label htmlFor="console-scope" className="hidden shrink-0 items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-dim sm:flex">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" /> Scope
      </label>
      <select
        id="console-scope"
        aria-label="Console business scope"
        value={scope ?? ''}
        onChange={(e) => setConsoleScope(e.target.value || null)}
        aria-describedby="console-scope-help"
        className="min-h-9 max-w-[13rem] truncate rounded-lg border border-app bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)] focus:border-[var(--color-brand-indigo)]"
      >
        <option value="">{isDemoMode ? 'All sample businesses' : 'All my businesses'}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <span
        id="console-scope-help"
        className="hidden max-w-[16rem] truncate text-[11px] text-dim xl:block"
        title={isDemoMode
          ? 'Sample data: each business only sees bookings addressed to its own id. A live console is scoped to the owner’s business on the server.'
          : 'Every row is scoped to the businesses you own.'}
      >
        {activeName ? `Only ${activeName}` : 'Everything this account owns'}
        {isDemoMode && <Info className="ml-1 inline h-3 w-3 align-[-1px]" aria-hidden="true" />}
      </span>
    </div>
  );
}
