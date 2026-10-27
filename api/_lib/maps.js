// Only report a driving time when Google Distance Matrix returned one.
// A straight-line guess is not live traffic or a provider result.
export async function travelTimeMin(origin, dest) {
  if (!origin || !dest || !Number.isFinite(Number(origin.lat)) || !Number.isFinite(Number(origin.lng)) || !Number.isFinite(Number(dest.lat)) || !Number.isFinite(Number(dest.lng))) return 0;
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return 0;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&mode=driving&key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return 0;
    const j = await r.json();
    const el = j?.rows?.[0]?.elements?.[0];
    return j.status === 'OK' && el?.status === 'OK' && el.duration?.value > 0 ? Math.max(1, Math.round(el.duration.value / 60)) : 0;
  } catch (e) { console.error('[maps:error]', e.message); return 0; }
}
