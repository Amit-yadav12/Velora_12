import { useEffect, useState } from 'react';
import { Star, MapPin } from 'lucide-react';
import { PageHeader, Spinner } from '../../components/ui';
import { apiGet } from '../../lib/api';
import { useLocation } from '../../contexts/LocationContext';
import { imgOnError } from '../../lib/product';

export default function AdminBusinesses() {
  const { city } = useLocation();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // City-scoped catalogue (DB + synthetic ecosystem merged server-side).
    apiGet(`/api/businesses?city=${encodeURIComponent(city.name)}`)
      .then(d => { setList(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => apiGet('/api/admin?resource=business').then(d => { setList(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false)));
  }, [city.name]);
  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader title={`Businesses · ${city.name}`} subtitle={`${list.length} providers on the platform.`} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.slice(0, 60).map(b => (
          <div key={b.id} className="card overflow-hidden">
            <img src={b.image_url} alt={b.name} onError={imgOnError(b.category)} loading="lazy" className="h-32 w-full object-cover" />
            <div className="p-4"><div className="flex items-start justify-between"><div><p className="font-medium">{b.name}</p><p className="text-xs text-dim">{b.category}</p></div><span className="inline-flex items-center gap-1 text-xs"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{Number(b.rating).toFixed(1)}</span></div><p className="mt-2 text-xs text-dim flex items-center gap-1"><MapPin className="h-3 w-3" />{b.address}</p><div className="mt-2 flex items-center justify-between"><span className={`text-[11px] px-2 py-0.5 rounded-lg ${b.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>{b.active ? 'Active' : 'Inactive'}</span>{b.featured && <span className="text-[11px] px-2 py-0.5 rounded-lg bg-[var(--color-brand-indigo)]/15 text-[var(--color-brand-indigo)]">Featured</span>}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
