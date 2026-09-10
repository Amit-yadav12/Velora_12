// Velora live discovery — Google Places proxy.
// Returns REAL Google Maps businesses (names, ratings, photos, hours) when a
// Google Maps API key is configured; otherwise { live:false, results:[] } so
// the client gracefully falls back to the synthetic ecosystem.
import { cors, sanitizeText, enforceRateLimit } from './_lib/security.js';

const cache = new Map();
const TTL = 120000;

const CATEGORY_TYPE = {
  Clinics: 'doctor', Hospitals: 'hospital', Dentists: 'dentist', 'Diagnostic Centers': 'health',
  Pharmacies: 'pharmacy', Salons: 'beauty_salon', Barbershops: 'hair_care', Spas: 'spa',
  'Beauty Clinics': 'beauty_salon', Gyms: 'gym', 'Fitness Centers': 'gym', 'Yoga Studios': 'gym',
  'Physiotherapy Centers': 'physiotherapist', 'Wellness Centers': 'health', Restaurants: 'restaurant',
  'Cafés': 'cafe', Hotels: 'lodging', 'Coworking Spaces': 'coworking_space', 'Sports Centers': 'stadium',
  'Cricket Turfs': 'stadium', 'Football Grounds': 'stadium', 'Swimming Pools': 'swimming_pool',
  'Badminton Courts': 'stadium', 'Coaching Institutes': 'school', Tutors: 'school',
  'Driving Schools': 'driving_school', 'Passport Offices': 'local_government_office',
  'Government Services': 'local_government_office', Banks: 'bank', 'Insurance Offices': 'insurance_agency',
  Lawyers: 'lawyer', 'Professional Services': 'accounting', Consultants: 'consultant',
  'Pet Clinics': 'veterinary_care', 'Veterinary Hospitals': 'veterinary_care', 'Car Rentals': 'car_rental',
  'Bike Rentals': 'motorcycle_rental', 'Car Service Centers': 'car_repair', 'EV Charging Stations': 'ev_charging_station',
  'Home Services': 'home_goods_store', Electricians: 'electrician', Plumbers: 'plumber', Cleaners: 'cleaning_service',
  'Event Venues': 'event_venue', 'Photography Studios': 'photography_studio', 'Travel Agencies': 'travel_agency',
};

function key() {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

function photoUrl(ref, apiKey, w = 640) {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${w}&photo_reference=${ref}&key=${apiKey}`;
}

function normalize(p, apiKey, category) {
  const photos = (p.photos || []).slice(0, 4).map((ph) => photoUrl(ph.photo_reference, apiKey));
  return {
    place_id: p.place_id,
    name: p.name,
    address: p.formatted_address || p.vicinity,
    lat: p.geometry?.location?.lat,
    lng: p.geometry?.location?.lng,
    rating: p.rating,
    review_count: p.user_ratings_total,
    phone: p.formatted_phone_number,
    website: p.website,
    hours: p.opening_hours?.weekday_text,
    open_now: p.opening_hours?.open_now ?? null,
    photos,
    category: category || p.types?.[0]?.replace(/_/g, ' '),
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}&query_place_id=${p.place_id}`,
    price_level: p.price_level,
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!enforceRateLimit(req, res, 'places', { limit: 120, windowMs: 60_000 })) return;
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const { lat, lng, query, category, city, radius = '5000' } = req.query;
    const apiKey = key();
    if (!apiKey) return res.status(200).json({ live: false, results: [] });

    const q = sanitizeText(query, 120) || '';
    const cat = sanitizeText(category, 60) || '';
    const ck = JSON.stringify({ lat, lng, q, cat, radius });
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(hit.payload);
    }

    let url;
    if (q) {
      const loc = lat && lng ? `&location=${lat},${lng}&radius=${Math.min(50000, +radius || 5000)}` : '';
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(city ? `${q} in ${city}` : q)}${loc}&key=${apiKey}`;
    } else if (lat && lng) {
      const type = CATEGORY_TYPE[cat];
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${Math.min(50000, +radius || 5000)}${type ? `&type=${type}` : ''}${cat && !type ? `&keyword=${encodeURIComponent(cat)}` : ''}&key=${apiKey}`;
    } else {
      return res.status(200).json({ live: false, results: [] });
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let list = [];
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      const j = await r.json();
      list = (j.results || []).slice(0, 12);
      // Enrich top 4 with details (phone, hours, website) — bounded for latency.
      const top = list.slice(0, 4);
      const enriched = await Promise.all(top.map(async (p) => {
        try {
          const dr = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?place_id=${p.place_id}&fields=name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,geometry,photos,price_level,types&key=${apiKey}`, { signal: ctrl.signal });
          const dj = await dr.json();
          return dj.result ? { ...p, ...dj.result } : p;
        } catch { return p; }
      }));
      list = [...enriched, ...list.slice(4)];
    } finally {
      clearTimeout(t);
    }

    const results = list.map((p) => normalize(p, apiKey, cat || undefined));
    const payload = { live: results.length > 0, results, provider: 'google' };
    cache.set(ck, { at: Date.now(), payload });
    if (cache.size > 60) cache.delete(cache.keys().next().value);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[places:error]', err.message);
    return res.status(200).json({ live: false, results: [] });
  }
}
