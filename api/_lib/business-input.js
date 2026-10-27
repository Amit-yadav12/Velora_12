import { assert, isEmail, sanitizeText } from './security.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value) => datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const text = (v, max) => sanitizeText(v, max);

export function validateBusinessInput(raw, fallbackEmail, { editing = false, existingServices = 0 } = {}) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const name = text(b.name, 160);
  const category = text(b.category, 80);
  assert(name && category, 'Business name and category are required.');
  const email = text(b.email, 254) || fallbackEmail;
  assert(!email || isEmail(email), 'Enter a valid business email.');
  const phone = text(b.phone, 30);
  if (phone) assert(/^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(phone.replace(/[\s()-]/g, '')), 'Enter a valid 10-digit Indian mobile number.');
  const pin = text(b.pin, 6);
  if (pin) assert(/^[1-9]\d{5}$/.test(pin), 'Enter a valid 6-digit Indian PIN code.');
  const website = text(b.website, 500);
  if (website) {
    let u; try { u = new URL(website); } catch { /* invalid */ }
    assert(u && ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password, 'Website must be an http or https URL.');
  }
  const open_time = text(b.open_time, 5) || '09:00';
  const close_time = text(b.close_time, 5) || '20:00';
  assert(timePattern.test(open_time) && timePattern.test(close_time) && open_time < close_time, 'Enter valid opening and closing times on the same day.');
  const weekly_hours = {};
  for (const day of DAYS) {
    const d = b.weekly_hours?.[day];
    if (!d) continue;
    assert(typeof d === 'object', 'Invalid weekly hours.');
    const open = String(d.open || open_time), close = String(d.close || close_time);
    assert(timePattern.test(open) && timePattern.test(close) && open < close, `Check ${day.toUpperCase()} opening hours.`);
    weekly_hours[day] = { open, close, closed: d.closed === true };
  }
  const holidays = Array.isArray(b.holidays) ? b.holidays : [];
  assert(holidays.length <= 100 && holidays.every((d) => typeof d === 'string' && validDate(d)), 'Enter valid holiday dates.');
  const photos = Array.isArray(b.photos) ? b.photos : [];
  assert(photos.length <= 8 && photos.every((p) => typeof p === 'string'), 'Add up to 8 business photos.');
  const logo_url = typeof b.logo_url === 'string' && b.logo_url ? b.logo_url : null;
  const services = Array.isArray(b.services) ? b.services : [];
  assert(services.length <= 20, 'Add up to 20 services.');
  const cleanServices = services.map((s) => {
    const n = text(s?.name, 120), duration = Number(s?.duration_min), price = Number(s?.price);
    assert(n && Number.isInteger(duration) && duration >= 5 && duration <= 600 && Number.isFinite(price) && price >= 0 && price <= 10000000 && Math.abs(price * 100 - Math.round(price * 100)) < 1e-6, 'Each service needs a name, duration (5–600 min) and valid ₹ price.');
    return { name: n, description: text(s.description, 300), duration_min: duration, price, image_url: typeof s.image_url === 'string' && s.image_url ? s.image_url : null };
  });
  const staff = Array.isArray(b.staff) ? b.staff : [];
  assert(staff.length <= 30, 'Add up to 30 team members.');
  const cleanStaff = staff.map((s) => {
    const n = text(s?.name, 120);
    assert(n, 'Each team member needs a name.');
    return { name: n, role: text(s.role, 80) };
  });
  const lat = b.lat === '' || b.lat == null ? null : Number(b.lat);
  const lng = b.lng === '' || b.lng == null ? null : Number(b.lng);
  assert((lat == null && lng == null) || (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0)), 'Select a valid map location.');
  const address = text(b.address, 300), city = text(b.city, 80), state = text(b.state, 80);
  const active = b.active === true;
  if (active) {
    assert(address && city && state && pin, 'A complete address, city, state and PIN are required to publish.');
    assert(lat != null && lng != null && b.location_confirmed === true, 'Confirm the map pin before publishing.');
    assert(editing ? existingServices > 0 : cleanServices.length > 0, 'Add at least one active service before publishing.');
  }
  const cancellation_hours = Number(b.cancellation_hours ?? 0);
  assert(Number.isInteger(cancellation_hours) && cancellation_hours >= 0 && cancellation_hours <= 720, 'Cancellation notice must be between 0 and 720 hours.');
  const amenities = Array.isArray(b.amenities) ? b.amenities.slice(0, 20).map((x) => text(x, 60)).filter(Boolean) : [];
  return {
    name, category, description: text(b.description, 1000), address, area: text(b.area, 120), city, state, pin,
    lat, lng, phone, email, website, open_time, close_time, weekly_hours, holidays: [...new Set(holidays)],
    amenities, cancellation_hours, booking_policy: text(b.booking_policy, 1000), photos, logo_url, services: cleanServices, staff: cleanStaff,
    active, google_place_id: text(b.google_place_id, 250),
    location_status: lat == null ? 'unverified' : b.location_confirmed === true ? 'owner_confirmed' : 'unverified',
  };
}

export function storagePathForUrl(value, userId, projectUrl) {
  if (!value || !projectUrl) return null;
  try {
    const u = new URL(value), project = new URL(projectUrl);
    const prefix = `/storage/v1/object/public/business-media/${userId}/`;
    if (u.origin !== project.origin || !u.pathname.startsWith(prefix) || u.search || u.hash) return null;
    const filename = u.pathname.slice(prefix.length);
    if (!/^[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(filename)) return null;
    return { folder: userId, filename };
  } catch { return null; }
}

export function coordinatesMatch(a, b, maxMeters = 100) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
  const r = Math.PI / 180, dlat = (b.lat-a.lat)*r, dlng = (b.lng-a.lng)*r;
  const h = Math.sin(dlat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h)) <= maxMeters;
}
