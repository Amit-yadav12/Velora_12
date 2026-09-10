import supabase from './db-client.js';
import { cors, sanitizeText, isEmail , enforceRateLimit} from './_lib/security.js';
import { getAuth } from './_lib/auth.js';
import { cityBusinesses } from './_lib/synthetic.js';

// Conversational AI concierge. Understands natural-language requests and
// returns a structured action the frontend can execute (navigate, book, etc.),
// plus a human reply. Uses live DB data; OpenAI enriches the reply if a key
// is set, otherwise a deterministic NLU handles intents.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function parseDate(text) {
  const t = text.toLowerCase();
  const now = new Date();
  if (t.includes('today')) return now;
  if (t.includes('tomorrow')) { const d = new Date(now); d.setDate(d.getDate() + 1); return d; }
  for (let i = 0; i < 7; i++) {
    if (t.includes(DAYS[i])) { const d = new Date(now); const diff = (i - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + diff); return d; }
  }
  return null;
}
function parseTimeOfDay(text) {
  const t = text.toLowerCase();
  if (t.includes('morning')) return 10;
  if (t.includes('afternoon')) return 14;
  if (t.includes('evening') || t.includes('night')) return 17;
  const m = t.match(/(\d{1,2})\s*(am|pm)/);
  if (m) { let h = parseInt(m[1], 10); if (m[2] === 'pm' && h < 12) h += 12; return h; }
  return null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!enforceRateLimit(req, res, 'concierge', { limit: 30, windowMs: 60_000 })) return;
    const auth = await getAuth(req);
    const message = sanitizeText(req.body?.message, 400) || '';
    const lower = message.toLowerCase();
    const city = sanitizeText(req.body?.city, 40) || 'Jaipur';
    let businesses = [];
    try {
      const { data } = await supabase.from('businesses').select('*').eq('active', true);
      if (Array.isArray(data)) businesses = data;
    } catch (e) { console.error('[concierge:db]', e.message); }
    // Merge the synthetic city ecosystem so the concierge knows every city.
    try {
      const synth = cityBusinesses(city).filter((b) => !businesses.some((d) => String(d.id) === String(b.id)));
      businesses = [...businesses, ...synth];
    } catch (e) { console.error('[concierge:synth]', e.message); }
    businesses = businesses.filter((b) => !b.city || b.city === city);

    // ---- Intent detection ----
    let intent = 'chat';
    if (/(cancel)/.test(lower)) intent = 'cancel';
    else if (/(reschedule|move|change).*(appointment|booking)/.test(lower) || /reschedule/.test(lower)) intent = 'reschedule';
    else if (/(show|see|view|my|upcoming).*(booking|appointment)/.test(lower) || /(upcoming|my booking|my appointment)/.test(lower)) intent = 'my_bookings';
    else if (/(book|schedule|reserve|slot)/.test(lower)) intent = 'book';
    else if (/(direction|navigate|how do i get|take me)/.test(lower)) intent = 'navigate';
    else if (/(nearest|nearby|near me|closest|find|where)/.test(lower)) intent = 'find';
    else if (/(appointment|booking)/.test(lower)) intent = 'book';

    // Match a business/category from the message
    const matchBiz = (businesses || []).find((b) =>
      lower.includes(b.name.toLowerCase()) || lower.includes(b.category.toLowerCase().replace(/s$/, '')));
    const categoryHints = { dentist: 'Dentists', dental: 'Dentists', doctor: 'Clinics', clinic: 'Clinics', hospital: 'Hospitals', pharmacy: 'Pharmacies', medicine: 'Pharmacies', lab: 'Diagnostic Centers', diagnostic: 'Diagnostic Centers', blood: 'Diagnostic Centers', salon: 'Salons', hair: 'Salons', spa: 'Spas', massage: 'Spas', skin: 'Beauty Clinics', facial: 'Beauty Clinics', gym: 'Gyms', fitness: 'Fitness Centers', yoga: 'Yoga Studios', physio: 'Physiotherapy Centers', restaurant: 'Restaurants', food: 'Restaurants', biryani: 'Restaurants', cafe: 'Cafés', coffee: 'Cafés', hotel: 'Hotels', stay: 'Hotels', cowork: 'Coworking Spaces', office: 'Coworking Spaces', cricket: 'Cricket Turfs', turf: 'Cricket Turfs', football: 'Football Grounds', soccer: 'Football Grounds', swim: 'Swimming Pools', pool: 'Swimming Pools', badminton: 'Badminton Courts', shuttle: 'Badminton Courts', coach: 'Coaching Institutes', jee: 'Coaching Institutes', neet: 'Coaching Institutes', tuition: 'Tutors', driving: 'Driving Schools', licence: 'Driving Schools', license: 'Driving Schools', passport: 'Passport Offices', visa: 'Consultants', aadhaar: 'Government Services', pan: 'Government Services', bank: 'Banks', loan: 'Banks', insurance: 'Insurance Offices', lawyer: 'Lawyers', legal: 'Lawyers', advocate: 'Lawyers', tax: 'Professional Services', gst: 'Professional Services', career: 'Consultants', pet: 'Pet Clinics', dog: 'Pet Clinics', vet: 'Veterinary Hospitals', car: 'Car Rentals', rental: 'Car Rentals', bike: 'Bike Rentals', scooter: 'Bike Rentals', garage: 'Car Service Centers', detailing: 'Car Service Centers', ev: 'EV Charging Stations', charging: 'EV Charging Stations', electrician: 'Electricians', plumber: 'Plumbers', plumbing: 'Plumbers', clean: 'Cleaners', venue: 'Event Venues', banquet: 'Event Venues', wedding: 'Event Venues', photo: 'Photography Studios', travel: 'Travel Agencies', holiday: 'Travel Agencies', flight: 'Travel Agencies', barber: 'Barbershops', beard: 'Barbershops', wellness: 'Wellness Centers', ayurveda: 'Wellness Centers', home: 'Home Services', tutor: 'Tutors', court: 'Sports Centers', tennis: 'Sports Centers', sports: 'Sports Centers' };
    let cat = null;
    for (const [k, v] of Object.entries(categoryHints)) if (lower.includes(k)) { cat = v; break; }

    const date = parseDate(message);
    const hour = parseTimeOfDay(message);

    let reply = '';
    let action = null;

    if (intent === 'find') {
      const results = cat ? (businesses || []).filter((b) => b.category === cat) : businesses || [];
      const top = results.sort((a, b) => b.rating - a.rating).slice(0, 3);
      reply = top.length ? `I found ${results.length} ${cat || 'places'} in ${city} for you. Top pick: ${top[0].name} (${top[0].rating}★) at ${top[0].address}.` : `I couldn't find matches in ${city}. Try a category like salons, clinics or gyms.`;
      action = { type: 'navigate', to: cat ? `/search?category=${encodeURIComponent(cat)}` : '/search', results: top.map((b) => ({ id: b.id, name: b.name })) };
    } else if (intent === 'book') {
      const target = matchBiz || (cat ? (businesses || []).filter((b) => b.category === cat).sort((a, b) => b.rating - a.rating)[0] : null);
      if (target) {
        const d = (date || new Date());
        const dateStr = d.toISOString().slice(0, 10);
        reply = `Great — let's book ${target.name}${date ? ` for ${d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}` : ''}${hour ? ` in the ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}` : ''}. Opening the booking page with smart slots.`;
        action = { type: 'book', business_id: target.id, date: dateStr, preferred_hour: hour, to: `/business/${target.id}?date=${dateStr}${hour ? `&hour=${hour}` : ''}` };
      } else {
        reply = 'Which type of business would you like to book? For example: "Book a dentist tomorrow afternoon" or "Book Lumen Hair & Beauty".';
        action = { type: 'navigate', to: '/search' };
      }
    } else if (intent === 'my_bookings') {
      reply = 'Here are your appointments.';
      action = { type: 'navigate', to: '/appointments' };
    } else if (intent === 'cancel' || intent === 'reschedule') {
      const email = auth?.user?.email;
      let upcoming = [];
      if (email && isEmail(email)) {
        const { data } = await supabase.from('bookings').select('*').eq('customer_email', email).eq('status', 'confirmed').gt('start_time', new Date().toISOString()).order('start_time').limit(3);
        upcoming = data || [];
      }
      reply = upcoming.length ? `You have ${upcoming.length} upcoming appointment(s). Opening your bookings so you can ${intent} — your next is ${upcoming[0].service_name} at ${upcoming[0].resource_name}.` : `Opening your appointments so you can ${intent} one.`;
      action = { type: 'navigate', to: '/appointments' };
    } else if (intent === 'navigate') {
      const target = matchBiz || (businesses || [])[0];
      reply = target ? `Opening directions to ${target.name}.` : 'Which place would you like directions to?';
      action = target ? { type: 'directions', maps_link: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target.address || target.name)}` } : null;
    } else {
      reply = "I can book, reschedule or cancel appointments, find nearby businesses, and open directions. Try: \u201cBook me a salon tomorrow afternoon\u201d or \u201cFind the nearest clinic\u201d.";
    }

    // Optional OpenAI enrichment for a warmer reply (kept concise)
    if (process.env.OPENAI_API_KEY && intent === 'chat') {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages: [
            { role: 'system', content: 'You are Velora, a concise, friendly booking concierge. Keep replies under 2 sentences.' },
            { role: 'user', content: message },
          ], temperature: 0.5, max_tokens: 120 }),
        });
        if (r.ok) { const j = await r.json(); reply = j.choices?.[0]?.message?.content?.trim() || reply; }
      } catch (e) { console.error('[concierge:openai]', e.message); }
    }

    return res.status(200).json({ intent, reply, action });
  } catch (err) {
    console.error('[concierge:error]', err.message);
    res.status(500).json({ error: err.message });
  }
}
