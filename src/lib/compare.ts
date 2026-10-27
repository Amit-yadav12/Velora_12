// Price comparison — pure functions, no DOM.
//
// "Compare businesses and prices in ₹" is a real product surface here: the
// customer shortlists up to three businesses and sees, per service, what each
// one charges, which is cheapest, and how far apart they are. Everything is
// derived from data the app already has (services + price_from); nothing is
// estimated or invented. A missing price shows as "—", never as ₹0.
import { inr } from './format';
import type { Business, BusinessService } from './product';

export const COMPARE_LIMIT = 3;

export interface ServicePriceRow {
  name: string;
  /** One entry per compared business, in column order. */
  prices: (number | null)[];
  /** Index of the cheapest column, or null when no business lists this service. */
  cheapest: number | null;
  /** Cheapest minus dearest, in ₹ — the real spread a customer would pay. */
  spread: number | null;
}

export interface Comparison {
  columns: { id: number | string; name: string; rating: number; distance: number | null; openNow: boolean; from: number | null; nextAvailable: string | null }[];
  services: ServicePriceRow[];
}

const priceOf = (b: Business): number | null => {
  const direct = b.price_from;
  if (direct != null && Number.isFinite(Number(direct))) return Number(direct);
  const svc = (b.services || []).map((s) => Number(s.price)).filter((n) => Number.isFinite(n));
  return svc.length ? Math.min(...svc) : null;
};

const activeServices = (b: Business): BusinessService[] =>
  (b.services || []).filter((s) => s.price != null && Number.isFinite(Number(s.price)) && s.active !== false);

/** Build the comparison matrix for 1–3 shortlisted businesses. */
export function buildComparison(bizs: readonly Business[]): Comparison {
  const columns = bizs.slice(0, COMPARE_LIMIT).map((b) => ({
    id: b.id,
    name: b.name,
    rating: Number(b.rating) || 0,
    distance: b.distance_km ?? null,
    openNow: !!b.open_now,
    from: priceOf(b),
    nextAvailable: b.next_available_label || null,
  }));

  // Union of service names, preserving the order they appear in.
  const names: string[] = [];
  for (const b of bizs) for (const s of activeServices(b)) if (!names.includes(s.name)) names.push(s.name);

  const services: ServicePriceRow[] = names.map((name) => {
    const prices = bizs.slice(0, COMPARE_LIMIT).map((b) => {
      const hit = activeServices(b).find((s) => s.name === name);
      return hit ? Number(hit.price) : null;
    });
    const known = prices.filter((p): p is number => p != null);
    const min = known.length ? Math.min(...known) : null;
    const max = known.length ? Math.max(...known) : null;
    return {
      name,
      prices,
      cheapest: min == null ? null : prices.indexOf(min),
      spread: min != null && max != null && known.length > 1 ? max - min : null,
    };
  });

  return { columns, services };
}

/** Human sentence for the sheet header — e.g. "Clinics differ by ₹900 for the same service." */
export function comparisonSummary(c: Comparison): string {
  if (c.columns.length < 2) return 'Add one more business to compare.';
  const spreads = c.services.map((s) => s.spread).filter((n): n is number => n != null && n > 0);
  if (!spreads.length) return 'These businesses list different services, so there is no like-for-like price to compare yet.';
  const widest = Math.max(...spreads);
  return `Same service, up to ${inr(widest)} apart across ${c.columns.length} businesses.`;
}

/** Short label used on cards and chips. */
export function fromPriceLabel(b: Business): string {
  const p = priceOf(b);
  return p == null ? 'Price on request' : `from ${inr(p)}`;
}
