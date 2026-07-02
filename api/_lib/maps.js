// Google Maps Platform: travel-time estimate between employee + location.
// Uses the Distance Matrix API when a key is configured; otherwise falls back
// to a deterministic haversine-based estimate so pricing never blocks.

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export async function travelTimeMin(origin, dest) {
  try {
    if (!origin || !dest || origin.lat == null || dest.lat == null) return 0;
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (key) {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.lat},${origin.lng}&destinations=${dest.lat},${dest.lng}&mode=driving&key=${key}`;
      const r = await fetch(url);
      const j = await r.json();
      const el = j?.rows?.[0]?.elements?.[0];
      if (el?.duration?.value) return Math.round(el.duration.value / 60);
    }
    // Fallback: ~40 km/h average urban speed.
    const km = haversineKm(origin, dest);
    return Math.round((km / 40) * 60);
  } catch (e) {
    console.error('[maps:error]', e.message);
    return 0;
  }
}
