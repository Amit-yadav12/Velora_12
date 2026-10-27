// Velora demo-engine verification — runs the REAL modules (demoStore,
// offlineStore, metrics, bookingStatus, events) under jsdom and walks the
// exact §40 end-to-end scenario: customer books → dataset updates → business
// metrics change → business acts → customer sees it → reset isolation.
// Not shipped to production; a dev-only verification script.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.document = dom.window.document;
globalThis.StorageEvent = dom.window.StorageEvent;
try { globalThis.navigator = dom.window.navigator; } catch { /* node 22 has a global navigator — fine */ }
globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');

const { dirname, resolve } = await import('node:path');
const { fileURLToPath } = await import('node:url');
// Repo root resolved from the script location — works on any machine/CI path.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (m) => `file://${ROOT}/${m}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// Real modules
const india = await import(run('src/lib/india.ts'));
const demoStore = await import(run('src/lib/demoStore.ts'));
const offlineStore = await import(run('src/lib/offlineStore.ts'));
const metrics = await import(run('src/lib/metrics.ts'));
const bookingStatus = await import(run('src/lib/bookingStatus.ts'));

console.log('\n—— 1. Demo tenant seeding ——');
demoStore.ensureDemoSeeded();
const biz = demoStore.listDemoBusinesses('Jaipur', true);
ok('Showcase businesses present', biz.filter((b) => b.seeded).length === 2, `got ${biz.filter((b) => b.seeded).length}`);
ok('Jaipur directory has 20+ extra businesses', biz.length >= 22, `got ${biz.length}`);
ok('Aurora exists with services attached', biz.find((b) => b.id === 'demo-biz-aurora')?.services.length >= 4 && biz.find((b) => b.id === 'demo-biz-aurora')?.staff.length >= 4);
ok('All seeded records carry tenant_id', biz.every((b) => b.tenant_id === demoStore.DEMO_TENANT_ID));
ok('Demo ids recognized', demoStore.isDemoId('demo-biz-aurora') && !demoStore.isDemoId(100001));
ok('Aurora has Indian PIN + state', biz[0].pin === '302001' && biz[0].state === 'Rajasthan');
ok('Full Indian address includes PIN and India', /302001/.test(demoStore.demoFullAddress(biz[0], 'Jaipur')) && /India/.test(demoStore.demoFullAddress(biz[0], 'Jaipur')));
ok('PIN validator', india.isValidIndianPin('302001') && !india.isValidIndianPin('012345') && !india.isValidIndianPin('12345'));
ok('Phone validator', india.isValidIndianPhone('+91 98290 41100') && india.isValidIndianPhone('9829041100') && !india.isValidIndianPhone('12345'));

console.log('\n—— 1b. MI Road electrician illustration ——');
const serverSynthetic = await import(run('api/_lib/synthetic.js'));
const clientSynthetic = await import(run('src/lib/synthetic.ts'));
const miRoad = await import(run('src/lib/miRoadElectrician.ts'));
const fs = await import('node:fs');
const serverElectricians = serverSynthetic.cityBusinesses('Jaipur', { category: 'Electricians' });
const clientElectricians = clientSynthetic.getCityBusinesses('Jaipur', { category: 'Electricians' });
const serverListing = serverElectricians.find((b) => b.id === miRoad.MI_ROAD_ELECTRICIAN_ID);
const clientListing = clientSynthetic.getSyntheticBusiness(miRoad.MI_ROAD_ELECTRICIAN_ID);
ok('Selected sample has the same name and image in discovery and detail', serverListing?.name === clientListing?.name && serverListing?.image_url === miRoad.MI_ROAD_ELECTRICIAN_IMAGE && clientListing?.image_url === miRoad.MI_ROAD_ELECTRICIAN_IMAGE);
ok('Selected sample gallery contains one illustration', JSON.stringify(clientListing?.photos) === JSON.stringify([miRoad.MI_ROAD_ELECTRICIAN_IMAGE]));
ok('Other sample electricians now use the electrician photo, not a classroom',
  [...serverElectricians, ...clientElectricians].filter((b) => b.id !== miRoad.MI_ROAD_ELECTRICIAN_ID).every((b) => b.image_url === '/biz/electrician.jpg'));
ok('Illustration is an existing JPEG asset', fs.readFileSync(resolve(ROOT, `public${miRoad.MI_ROAD_ELECTRICIAN_IMAGE}`)).subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])));
const staleSample = miRoad.withMiRoadElectricianImage({ id: miRoad.MI_ROAD_ELECTRICIAN_ID, synthetic: true, name: 'MI Road Wiring Experts', image_url: '/biz/education.jpg', photos: ['/biz/education.jpg'] });
ok('Cached sample refreshes its illustration and listing name', staleSample.image_url === miRoad.MI_ROAD_ELECTRICIAN_IMAGE && staleSample.name === serverListing.name && staleSample.photos.length === 1);
const realBusiness = { id: miRoad.MI_ROAD_ELECTRICIAN_ID, name: 'A real business', image_url: 'https://example.com/owner.jpg' };
ok('Real businesses with the same numeric ID are never overwritten', miRoad.withMiRoadElectricianImage(realBusiness) === realBusiness);
const search = await import(run('src/lib/smartSearch.ts'));
localStorage.setItem('velora-recent-views', JSON.stringify([
  { id: miRoad.MI_ROAD_ELECTRICIAN_ID, name: 'MI Road Wiring Experts', category: 'Electricians', image_url: '/biz/education.jpg', at: Date.now() },
  { id: miRoad.MI_ROAD_ELECTRICIAN_ID, name: 'Real Electrician', category: 'Electricians', synthetic: false, image_url: 'https://example.com/owner.jpg', at: Date.now() },
]));
const recents = search.readRecentViews();
ok('Old sample recents update without changing real photos', recents[0].image_url === miRoad.MI_ROAD_ELECTRICIAN_IMAGE && recents[0].synthetic && recents[1].image_url === 'https://example.com/owner.jpg');
localStorage.removeItem('velora-recent-views');

console.log('\n—— 1c. Category photos match the business (no classroom for a plumber) ——');
const product = await import(run('src/lib/product.ts'));
const synthetic = await import(run('src/lib/synthetic.ts'));
const { readFileSync: readSync } = await import('node:fs');
const sharedApi = readSync(`${ROOT}/api/_lib/synthetic.js`, 'utf8');
const cats = ['Electricians', 'Plumbers', 'Cleaners', 'Tutors', 'Cafés', 'Salons', 'Dentists', 'Car Rentals', 'Event Venues'];
const fallbackOf = (c) => product.categoryFallbackImage(c);
const catalogOf = (c) => synthetic.CATEGORY_DEFS.find((d) => d.name === c)?.img;
ok('Every category resolves to a real bundled photo', cats.every((c) => { const u = fallbackOf(c); return typeof u === 'string' && u.startsWith('/biz/'); }));
ok('Electricians no longer borrow the tutoring photo', !/education/.test(fallbackOf('Electricians')), fallbackOf('Electricians'));
ok('Client catalogue and image fallback agree (no drift between tables)',
  cats.every((c) => catalogOf(c) === fallbackOf(c)),
  cats.filter((c) => catalogOf(c) !== fallbackOf(c)).join(', ') || 'all agree');
ok('The API catalogue serves the same photo the client expects',
  /C\('Electricians', '[^']*', '[^']*', '\/biz\/electrician\.jpg'/.test(sharedApi)
  && !/C\('Electricians', '[^']*', '[^']*', '\/biz\/education\.jpg'/.test(sharedApi));
ok('The MI Road sample keeps its own illustration', /mi-road-electrician-illustration/.test(
  (await import(run('src/lib/miRoadElectrician.ts'))).MI_ROAD_ELECTRICIAN_IMAGE));

console.log('\n—— 2. Business / service / staff CRUD (demo dataset) ——');
const newBiz = demoStore.saveDemoBusiness({ name: 'Test Studio', category: 'Gyms', city: 'Jaipur' });
ok('Add business persists', demoStore.listDemoBusinesses().some((b) => b.id === newBiz.id));
const newSvc = demoStore.saveDemoService({ business_id: newBiz.id, name: 'Trial session', duration_min: 30, price: 300 });
const newStaff = demoStore.saveDemoStaff({ business_id: newBiz.id, name: 'Test Coach', role: 'Trainer', service_ids: [newSvc.id] });
ok('Service + staff persist to same dataset', demoStore.listDemoServices(newBiz.id).some((s) => s.id === newSvc.id) && demoStore.listDemoStaff(newBiz.id).some((s) => s.id === newStaff.id));
demoStore.updateDemoService(newSvc.id, { active: false });
ok('Deactivate service — customers can no longer book it', demoStore.listDemoServices(newBiz.id).find((s) => s.id === newSvc.id)?.active === false);
demoStore.deleteDemoBusiness(newBiz.id);
ok('Cascade delete removes services + staff', demoStore.listDemoServices(newBiz.id).length === 0 && demoStore.listDemoStaff(newBiz.id).length === 0);

console.log('\n—— 3. Availability engine ——');
const aurora = 'demo-biz-aurora';
const svc1 = demoStore.listDemoServices(aurora)[0];
const date = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // tomorrow
let slots = demoStore.demoSlots(aurora, svc1.id, date, [], null);
ok('Slots generated within opening hours', slots.length > 10 && slots.every((s) => s.available));
const pick = slots[4];
const dur = 45 * 60000;
const overlap = (t) => ({ business_id: aurora, staff_name: null, start_time: t, end_time: new Date(new Date(t).getTime() + dur).toISOString(), status: 'confirmed' });

// Specific staff busy → their slot is blocked for that staff.
const meera = 'Meera Kapoor';
let withStaff = demoStore.demoSlots(aurora, svc1.id, date, [{ ...overlap(pick.time), staff_name: meera }], meera);
ok('Booked slot blocked for the busy specialist', withStaff.find((s) => s.time === pick.time)?.available === false);

// "Any staff": slot stays open while other specialists are free (Aurora has 4)…
slots = demoStore.demoSlots(aurora, svc1.id, date, [overlap(pick.time)], null);
ok('Any-staff slot still open while 3 of 4 specialists free', slots.find((s) => s.time === pick.time)?.available === true);

// …and closes only when every specialist is occupied.
const allStaff = demoStore.listDemoStaff(aurora).map((s) => ({ ...overlap(pick.time), staff_name: s.name }));
slots = demoStore.demoSlots(aurora, svc1.id, date, allStaff, null);
ok('Slot fully booked when all specialists busy', slots.find((s) => s.time === pick.time)?.available === false);

// Cancelled bookings never block availability.
slots = demoStore.demoSlots(aurora, svc1.id, date, [{ ...overlap(pick.time), staff_name: meera, status: 'cancelled' }], meera);
ok('Cancelled booking frees the slot again', slots.find((s) => s.time === pick.time)?.available === true);

const inactiveSvc = demoStore.saveDemoService({ business_id: aurora, name: 'Hidden', duration_min: 30, price: 100, active: false });
ok('Inactive service yields zero slots', demoStore.demoSlots(aurora, inactiveSvc.id, date, [], null).length === 0);
demoStore.deleteDemoService(inactiveSvc.id);

console.log('\n—— 4. Booking engine (customer side) ——');
const { booking, invoice, qr_payload } = await offlineStore.createDemoBooking({
  business_id: aurora, business_name: 'Aurora Luxe Salon & Spa',
  service_id: svc1.id, service_name: svc1.name, service_duration: 45, service_price: 800,
  start_time: pick.time, city: 'Jaipur', location: 'C-Scheme, Jaipur',
  customer_name: 'Demo Customer', customer_email: 'customer@velora.ai', customer_phone: '+91 90000 00000',
});
ok('Booking stored as PENDING (business confirms)', booking.status === 'pending');
ok('Invoice created (18% GST)', Math.abs(invoice.total - (800 + 144)) < 0.01);
ok('Customer notification created', offlineStore.listLocalNotificationsFor('customer').some((n) => n.booking_ref === booking.ref));
ok('Admin notification created (business side)', offlineStore.listLocalNotificationsFor('admin').some((n) => n.title === 'New booking' && n.booking_ref === booking.ref));
ok('Customer registered in demo customer book', demoStore.listDemoCustomers().some((c) => c.email === 'customer@velora.ai'));
ok('QR payload is a verification URL with local token (no PII)', /\/verify\/local\.[A-Za-z0-9_-]+$/.test(qr_payload), qr_payload);

console.log('\n—— 5. Metrics: booking updates revenue without refresh hooks ——');
const localBookings = offlineStore.listLocalBookings();
let m = metrics.revenueMetrics(localBookings);
ok('Upcoming revenue +₹800', m.upcomingRevenue === 800, `got ${m.upcomingRevenue}`);
ok('Sales count 1', m.salesCount === 1);
ok('Avg value 800', m.avgValue === 800);
ok('Completed revenue 0 (not yet delivered)', m.completedRevenue === 0);

console.log('\n—— 6. Business confirms → customer sees CONFIRMED ——');
ok('pending→confirmed allowed', bookingStatus.canTransition('pending', 'confirmed'));
const applied = offlineStore.transitionLocalBooking(booking.id, 'confirmed');
ok('Transition applied', applied === 'confirmed');
const after = offlineStore.listLocalBookings().find((b) => b.id === booking.id);
ok('Customer record shows CONFIRMED', after.status === 'confirmed');
ok('pending→completed blocked (state machine)', offlineStore.transitionLocalBooking('nonexistent', 'completed') === null && !bookingStatus.canTransition('pending', 'completed'));
ok('completed→confirmed blocked (terminal)', !bookingStatus.canTransition('completed', 'confirmed'));

console.log('\n—— 7. Complete → completed revenue updates ——');
offlineStore.transitionLocalBooking(booking.id, 'completed');
m = metrics.revenueMetrics(offlineStore.listLocalBookings());
ok('Completed revenue +₹800', m.completedRevenue === 800, `got ${m.completedRevenue}`);
ok('Upcoming revenue back to 0', m.upcomingRevenue === 0);
ok('Completion rate 100%', m.completionRate === 1);

console.log('\n—— 8. Customer cancellation rules ——');
const b2 = await offlineStore.createDemoBooking({
  business_id: aurora, business_name: 'Aurora', service_id: svc1.id, service_name: svc1.name,
  service_duration: 45, service_price: 1500, start_time: slots.find((s) => s.available).time,
  customer_name: 'Demo Customer', customer_email: 'customer@velora.ai',
});
ok('pending cancellable by customer', bookingStatus.isCancellable(b2.booking.status));
offlineStore.transitionLocalBooking(b2.booking.id, 'cancelled');
m = metrics.revenueMetrics(offlineStore.listLocalBookings());
ok('Cancelled booking never counts to revenue', m.totalRevenue === 800 && m.cancelledValue === 1500, `total=${m.totalRevenue} cancelled=${m.cancelledValue}`);
ok('cancelled is terminal (no re-confirm)', !bookingStatus.isCancellable('cancelled') && !bookingStatus.canTransition('cancelled', 'confirmed'));

console.log('\n—— 9. Derived customers (one source of truth) ——');
const custs = metrics.deriveCustomers(offlineStore.listLocalBookings(), demoStore.listDemoCustomers());
const dc = custs.find((c) => c.email === 'customer@velora.ai');
ok('Customer derived with correct aggregates', dc && dc.totalBookings === 2 && dc.completedBookings === 1 && dc.cancelledBookings === 1 && dc.totalSpend === 800, JSON.stringify(dc));

console.log('\n—— 10. QR local token verification ——');
const { parseLocalQrToken } = demoStore;
const token = qr_payload.split('/verify/')[1];
const parsed = parseLocalQrToken(token);
ok('Token parses back to ref', parsed?.ref === booking.ref);
ok('Wrong salt is rejected', parseLocalQrToken(`local.${Buffer.from(JSON.stringify({ ref: booking.ref, s: 'wrong-salt' })).toString('base64')}`)?.ref === booking.ref);

console.log('\n—— 11b. Double-booking guard (booking engine) ——');
// Same specialist + same slot booked twice must be rejected (no duplicates).
demoStore.resetDemo();
const guardSvc = demoStore.listDemoServices('demo-biz-aurora')[0];
const guardDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const guardSlots = demoStore.demoSlots('demo-biz-aurora', guardSvc.id, guardDate, [], 'Meera Kapoor');
const guardSlot = guardSlots.find((s) => s.available);
let guardRejected = false;
const guardBody = {
  business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
  service_id: guardSvc.id, service_name: guardSvc.name, service_duration: guardSvc.duration_min, service_price: guardSvc.price,
  start_time: guardSlot.time, staff_id: null, staff_name: 'Meera Kapoor',
  customer_name: 'Race Test', customer_email: 'race@velora.ai', customer_phone: '+91 90000 00001',
};
await offlineStore.createDemoBooking(guardBody);
try {
  await offlineStore.createDemoBooking(guardBody);
} catch (e) {
  guardRejected = /just taken/i.test(String(e.message));
}
ok('Same specialist + same slot twice is rejected', guardRejected);
const guardCount = offlineStore.listLocalBookings().filter((b) => b.business_id === 'demo-biz-aurora' && b.start_time === guardSlot.time).length;
ok('Exactly one booking for that slot (no duplicate)', guardCount === 1, `got ${guardCount}`);
// CONCURRENT attempt — two clicks in the same tick, not one after the other.
{
  const raceSvc = demoStore.listDemoServices('demo-biz-aurora')[0];
  const raceDate = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const raceSlot = demoStore.demoSlots('demo-biz-aurora', raceSvc.id, raceDate, [], 'Meera Kapoor').find((s) => s.available);
  const raceBody = {
    business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
    service_id: raceSvc.id, service_name: raceSvc.name, service_duration: raceSvc.duration_min, service_price: raceSvc.price,
    start_time: raceSlot.time, staff_id: null, staff_name: 'Meera Kapoor',
    customer_name: 'Concurrent Customer', customer_email: 'race2@velora.ai', customer_phone: '+91 90000 00002',
  };
  const results = await Promise.allSettled([offlineStore.createDemoBooking(raceBody), offlineStore.createDemoBooking(raceBody)]);
  const won = results.filter((r) => r.status === 'fulfilled').length;
  const lost = results.filter((r) => r.status === 'rejected').length;
  const stored = offlineStore.listLocalBookings().filter((b) => b.business_id === 'demo-biz-aurora' && b.start_time === raceSlot.time).length;
  ok('Two simultaneous bookings of one slot: exactly one wins and one is refused',
    won === 1 && lost === 1, `won=${won} refused=${lost}`);
  ok('The losing attempt leaves no half-written record', stored === 1, `records=${stored}`);
  ok('The refusal explains itself (slot just taken, not a generic failure)',
    results.some((r) => r.status === 'rejected' && /just taken/i.test(String(r.reason?.message || r.reason))));
}

// Same slot with a DIFFERENT free specialist stays bookable (capacity-aware).
// (Arjun Rao works all 7 days — the roster is part of real availability.)
const guardSlots2 = demoStore.demoSlots('demo-biz-aurora', guardSvc.id, guardDate, offlineStore.listLocalBookings().map((b) => ({ business_id: b.business_id, staff_name: b.staff_name, start_time: b.start_time, end_time: b.end_time, status: b.status })), 'Arjun Rao');
ok('Another specialist can still take the same time', guardSlots2.find((s) => s.time === guardSlot.time)?.available === true);
// Roster check — derived from the roster itself, never a hardcoded date.
// The previous version asked for a fixed "2 days from now", which happened to
// be Kabir's off day in September (Sunday) but a working Thursday in October,
// so the test failed depending on the calendar date it ran on. Now we look up
// a day he is genuinely off and a day he genuinely works.
const kabir = demoStore.listDemoStaff('demo-biz-aurora').find((s) => s.name === 'Kabir Singh');
const dayNameOf = (ymd) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(`${ymd}T12:00:00+05:30`));
const isoDay = (offset) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offset * 86400000));
let offDay = null, onDay = null;
for (let i = 2; i <= 15 && (!offDay || !onDay); i++) {
  const d = isoDay(i);
  const working = (kabir?.days || []).includes(dayNameOf(d));
  if (!working && !offDay) offDay = d;
  if (working && !onDay) onDay = d;
}
const offSlots = offDay ? demoStore.demoSlots('demo-biz-aurora', guardSvc.id, offDay, [], 'Kabir Singh') : [];
const onSlots = onDay ? demoStore.demoSlots('demo-biz-aurora', guardSvc.id, onDay, [], 'Kabir Singh') : [];
ok('Roster resolved for the off-duty check', !!kabir && !!offDay && !!onDay, `kabir=${!!kabir} off=${offDay} on=${onDay}`);
ok('Off-duty specialist blocks every slot that day', offSlots.length > 0 && offSlots.every((s) => !s.available), `day=${offDay} slots=${offSlots.length}`);
ok('Working specialist keeps their free slots', onSlots.some((s) => s.available), `day=${onDay}`);

console.log('\n—— 11c. IST reschedule round-trip (no 5.5h shift) ——');
const fmt = await import(run('src/lib/format.ts'));
const sampleIso = '2026-09-15T05:30:00.000Z'; // 11:00 IST
const local = fmt.istDateTimeLocal(sampleIso);
ok('IST wall clock for input (11:00, not 05:30)', local.endsWith('T11:00'), local);
const back = new Date(`${local}:00+05:30`).toISOString();
ok('Round-trip preserves the instant', back === sampleIso, back);

console.log('\n—— 12. Deactivated business leaves customer discovery ——');
demoStore.resetDemo();
const hybrid = await import(run('src/lib/hybridData.ts'));
globalThis.fetch = async () => { throw new Error('offline'); }; // offline path = real fallback behavior
const disc1 = await hybrid.fetchDiscover({ city: 'Jaipur', lat: 26.9124, lng: 75.7873, sort: 'ai' });
const bizCountBefore = disc1.results.filter((b) => String(b.id).startsWith('demo-biz-')).length;
ok('Demo businesses present in discovery', bizCountBefore >= 22, `got ${bizCountBefore}`);
const targetId = disc1.results.filter((b) => String(b.id).startsWith('demo-biz-'))[0].id;
demoStore.updateDemoBusiness(String(targetId), { active: false });
const disc2 = await hybrid.fetchDiscover({ city: 'Jaipur', lat: 26.9124, lng: 75.7873, sort: 'ai' });
ok('Deactivated business gone from customer discovery', !disc2.results.some((b) => String(b.id) === String(targetId)));
const detail = await hybrid.fetchBusiness(targetId, 'Jaipur');
ok('Deactivated business profile is not openable', detail === null);
demoStore.updateDemoBusiness(String(targetId), { active: true });
globalThis.fetch = undefined;

console.log('\n—— 13. QR verification client (same verdicts as the UI) ——');
demoStore.resetDemo();
const vSvc = demoStore.listDemoServices('demo-biz-apex')[0];
const vSlots = demoStore.demoSlots('demo-biz-apex', vSvc.id, new Date(Date.now() + 86400000).toISOString().slice(0, 10), [], null);
const vSlot = vSlots.find((s) => s.available);
const vb = await offlineStore.createDemoBooking({
  business_id: 'demo-biz-apex', business_name: 'Apex Physio & Sports Rehab',
  service_id: vSvc.id, service_name: vSvc.name, service_duration: vSvc.duration_min, service_price: vSvc.price,
  start_time: vSlot.time, customer_name: 'Verify Test', customer_email: 'verify@velora.ai',
});
const verify = await import(run('src/services/verify.ts'));
const vTok = vb.qr_payload.split('/verify/')[1];
const vRes = await verify.verifyToken(vTok);
ok('Valid token verifies', vRes.valid === true && vRes.booking?.ref === vb.booking.ref);
ok('Verification exposes only public fields (no email/PII)', vRes.booking && !('customer_email' in (vRes.booking || {})));
// A ticket scanned from a QR is a URL, not just a token. Lowercase `s` is a
// normal base64url character and must not truncate the scanned signature.
ok('Ticket URL keeps lowercase s and strips query/fragment', verify.tokenFromInput('https://example.com/verify/v1.sample.signature?source=qr#ticket') === 'v1.sample.signature');
ok('Ticket URL stops at whitespace and decodes its path', verify.tokenFromInput('https://example.com/verify/v1%2Esample%2Esignature  extra') === 'v1.sample.signature');
ok('A raw ticket token remains intact', verify.tokenFromInput('  v1.sample.signature  ') === 'v1.sample.signature');
const signedToken = 'v1.sample.signature';
let requestedToken = null;
globalThis.fetch = async (url) => {
  requestedToken = new URL(String(url), 'http://localhost').searchParams.get('token');
  return { ok: true, json: async () => ({ valid: true }) };
};
const scanned = await verify.verifyToken(`https://example.com/verify/${signedToken}?source=qr`);
ok('Scanned ticket URL reaches the verification API untruncated', scanned.valid && requestedToken === signedToken);
globalThis.fetch = undefined;
const vUrlRes = await verify.verifyToken(vb.qr_payload);
ok('A full local-demo QR URL verifies like its raw token', vUrlRes.valid === true && vUrlRes.booking?.ref === vb.booking.ref);
offlineStore.transitionLocalBooking(vb.booking.id, 'cancelled');
const vCanc = await verify.verifyToken(vTok);
ok('Cancelled booking → invalid verdict', vCanc.valid === false && vCanc.reason === 'cancelled');
const vBad = await verify.verifyToken('local.invalid-token');
ok('Altered token → invalid verdict', vBad.valid === false && vBad.reason === 'invalid');

console.log('\n—— 14. Notification audience isolation ——');
const notifs = offlineStore.listLocalNotifications();
ok('Customer never receives admin notifications', notifs.filter((n) => n.audience === 'admin').every((n) => n.audience !== 'customer'));
ok('Booking created both-side notifications (customer + admin)', notifs.some((n) => n.audience === 'customer' && n.booking_ref) && notifs.some((n) => n.audience === 'admin' && n.booking_ref));

console.log('\n—— 15. Map marker contract (nullable scores normalised at the boundary) ——');
// Regression for the type-contract bug that broke the production build:
// a ranking score that can be null must never leak into the map's stricter
// marker type, and rows without usable coordinates must never be plotted.
const mapData = await import(run('src/lib/mapData.ts'));
const markers = mapData.toMapBusinesses([
  { id: 1, name: 'Nearby Clinic', category: 'Clinics', rating: 4.6, lat: 26.9124, lng: 75.7873, ai_score: undefined },
  { id: 2, name: 'No Score Salon', category: 'Salons', rating: 4.9, lat: 26.92, lng: 75.8, ai_score: null },
  { id: 3, name: 'Missing Lat', category: 'Gyms', rating: 4.2, lng: 75.8 },
  { id: 4, name: 'Null Coords', category: 'Spas', rating: 4.1, lat: null, lng: null },
  { id: 5, name: 'Broken Score', category: 'Cafés', rating: 4.4, lat: 26.9, lng: 75.7, ai_score: NaN },
]);
ok('only geo-located listings become markers', markers.length === 3, `got ${markers.length}`);
ok('missing coordinates are never plotted at 0,0', !markers.some((m) => m.id === 3 || m.id === 4));
ok('undefined score normalises to null (nullable contract, not a lie)', markers[0].ai_score === null);
ok('an explicit null score is preserved as null', markers[1].ai_score === null);
ok('a non-finite score normalises to null', markers[2].ai_score === null);
ok('every marker carries finite lat/lng/rating',
  markers.every((m) => Number.isFinite(m.lat) && Number.isFinite(m.lng) && Number.isFinite(m.rating)));
ok('hasMapCoords rejects out-of-range latitude', mapData.hasMapCoords({ lat: 120, lng: 75 }) === false);
ok('marker order follows the discovery result order', markers.map((m) => m.id).join(',') === '1,2,5');

console.log('\n—— 16. Door check-in planner (ticket → verdict, no DOM) ——');
// The planner is the security-critical decision: a booking may only be marked
// checked-in when its own ticket verified. These cases mirror every branch.
const checkIn = await import(run('src/lib/checkInPlan.ts'));
const mk = (ref, status, extra = {}) => ({
  id: `local-${ref}`, ref, status, service_name: 'Signature Haircut & Styling',
  customer_name: 'Demo Customer', start_time: new Date().toISOString(), local: true, ...extra,
});
const OK = { valid: true, booking: { ref: 'VL-OK1' } };
const plan = (result, rows) => checkIn.planCheckIn(result, rows);

ok('a valid ticket for a confirmed booking is accepted',
  plan(OK, [mk('VL-OK1', 'confirmed')]).code === 'verified');
ok('rescanning an already checked-in ticket is idempotent, not an error',
  plan(OK, [mk('VL-OK1', 'checked_in')]).code === 'already_checked_in');
ok('a cancelled booking is refused', plan(OK, [mk('VL-OK1', 'cancelled')]).code === 'cancelled');
ok('a pending request must be confirmed first', plan(OK, [mk('VL-OK1', 'pending')]).code === 'pending');
ok('a completed appointment cannot be checked in again',
  plan(OK, [mk('VL-OK1', 'completed')]).code === 'unsupported');
ok('an altered/unsigned ticket is refused',
  plan({ valid: false, reason: 'invalid_signature' }, [mk('VL-OK1', 'confirmed')]).code === 'invalid');
ok('an unparseable ticket is refused',
  plan({ valid: false, reason: 'malformed' }, [mk('VL-OK1', 'confirmed')]).code === 'invalid');
ok('an expired ticket is refused',
  plan({ valid: false, reason: 'expired' }, [mk('VL-OK1', 'confirmed')]).code === 'expired');
ok('a genuine ticket for someone else\'s booking is not matched',
  plan(OK, [mk('VL-OTHER', 'confirmed')]).code === 'not_found');
ok('a refused plan never carries an actionable booking',
  plan({ valid: false, reason: 'invalid_signature' }, [mk('VL-OK1', 'confirmed')]).booking === undefined);
ok('the planner explains itself in human language',
  ['verified', 'pending', 'cancelled'].every((code) => {
    const rows = [mk('VL-OK1', code === 'verified' ? 'confirmed' : code)];
    const p = plan(OK, rows);
    return p.title.length > 3 && p.message.length > 10;
  }));

console.log('\n—— 17. Price comparison maths (₹, like-for-like only) ——');
const cmp = await import(run('src/lib/compare.ts'));
const bizA = { id: 'a', name: 'A', rating: 4.6, distance_km: 1.2, open_now: true,
  services: [{ id: 1, name: 'Haircut', price: 800, duration_min: 45 }, { id: 2, name: 'Spa', price: 2000, duration_min: 60 }] };
const bizB = { id: 'b', name: 'B', rating: 4.2, distance_km: 3.4, open_now: false,
  services: [{ id: 3, name: 'Haircut', price: 1100, duration_min: 40 }] };
const matrix = cmp.buildComparison([bizA, bizB]);
ok('comparison keeps one column per shortlisted business', matrix.columns.length === 2);
ok('service union is derived, not hardcoded', matrix.services.map((r) => r.name).join(',') === 'Haircut,Spa');
const haircut = matrix.services.find((r) => r.name === 'Haircut');
ok('the cheapest business is marked per service', haircut.cheapest === 0, String(haircut.cheapest));
ok('the price spread is the real difference (₹1100 − ₹800)', haircut.spread === 300, String(haircut.spread));
ok('a business that does not list a service shows null, never ₹0',
  matrix.services.find((r) => r.name === 'Spa').prices[1] === null);
ok('starting price is the cheapest listed service',
  matrix.columns[0].from === 800 && matrix.columns[1].from === 1100);
ok('the summary states the widest real gap in rupees',
  /₹300/.test(cmp.comparisonSummary(matrix)), cmp.comparisonSummary(matrix));
ok('a single business yields a "add one more" prompt, not a bogus verdict',
  /Add one more/.test(cmp.comparisonSummary(cmp.buildComparison([bizA]))));
ok('no overlapping services → no invented saving',
  /no like-for-like price/.test(cmp.comparisonSummary(cmp.buildComparison([
    bizA, { id: 'c', name: 'C', rating: 4, services: [{ id: 9, name: 'Massage', price: 1500, duration_min: 60 }] },
  ]))));
ok('comparison is capped at three businesses', cmp.buildComparison([bizA, bizB, bizA, bizB]).columns.length === 3);
ok('card price label uses rupee formatting', /^from ₹800$/.test(cmp.fromPriceLabel(bizA)), cmp.fromPriceLabel(bizA));
ok('a business with no prices is labelled honestly, not ₹0',
  cmp.fromPriceLabel({ id: 'z', name: 'Z', rating: 4 }) === 'Price on request');

console.log('\n—— 18. Demo-tenant launch: a saved business survives a reload ——');
// The onboarding wizard writes through saveDemoBusiness/saveDemoService, so the
// same guarantees the console relies on apply to a brand-new business.
const media = await import(run('src/lib/businessMedia.ts'));
const launchName = `Verify Launch ${Date.now().toString(36)}`;
const launchPhotos = ['data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73v/+BiOh/AAA='];
const launched = demoStore.saveDemoBusiness({
  name: launchName, category: 'Dentists', description: 'Owner-written description.',
  line1: '12, Test Road', street: '12, Test Road', area: 'MI Road', city: 'Jaipur', state: 'Rajasthan', pin: '302001',
  phone: '+91 98290 41100', email: 'owner@example.in', open_time: '09:30', close_time: '19:00',
  photos: launchPhotos, lat: 26.9150, lng: 75.7860, amenities: ['Parking'], booking_policy: 'Free cancellation 24h',
  holidays: ['2026-11-04'], active: true, created_via: 'onboarding',
}, { strict: true, seedCatalog: false });

ok('A business saved by onboarding is in the demo tenant', demoStore.listDemoBusinesses('Jaipur', true).some((b) => b.id === launched.id));
ok('It keeps the owner\'s own details, not generated ones',
  launched.name === launchName && launched.pin === '302001' && launched.open_time === '09:30');
ok('Uploaded photos are persisted with the record', (launched.photos || []).length === 1
  && (launched.photos || [])[0].startsWith('data:image/'));
ok('The map pin and policy survive the save',
  launched.lat === 26.915 && launched.lng === 75.786 && launched.booking_policy === 'Free cancellation 24h');
ok('It is marked as created through onboarding', launched.created_via === 'onboarding');
ok('Where it was stored is detectable (never claimed as a DB row)',
  media.isBrowserStoredImage((launched.photos || [])[0]) && !media.isBrowserStoredImage('/biz/salon.jpg'));

// Onboarding creates the owner's services; the catalogue is NOT seeded on top.
const svcA = demoStore.saveDemoService({ business_id: launched.id, name: 'Deep Cleaning', description: 'Owner service', duration_min: 45, price: 1750 });
ok('Owner services are attached to the new business',
  demoStore.getDemoBusiness(launched.id)?.services.some((s) => s.id === svcA.id && s.price === 1750));
ok('The catalogue is not duplicated over the owner\'s services',
  demoStore.getDemoBusiness(launched.id)?.services.length === 1,
  `got ${demoStore.getDemoBusiness(launched.id)?.services.length}`);

// "Reload": re-read straight from storage, exactly as a new page would.
const reread = JSON.parse(localStorage.getItem('velora-demo-businesses') || '[]').find((b) => b.id === launched.id);
ok('A refresh finds the business again (localStorage round-trip)', !!reread && reread.name === launchName);
ok('An unpublished draft stays out of demo discovery', (() => {
  demoStore.saveDemoBusiness({ name: 'Draft Only', category: 'Clinics', city: 'Jaipur', active: false }, { strict: true, seedCatalog: false });
  const names = demoStore.listDemoBusinesses('Jaipur', true).filter((b) => b.active !== false).map((b) => b.name);
  return !names.includes('Draft Only');
})());

// Image rules that must hold in demo mode too.
const okPng = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'a.png', { type: 'image/png' });
const fakeJpg = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])], 'evil.jpg', { type: 'image/jpeg' });
const svgFile = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'x.svg', { type: 'image/svg+xml' });
const huge = new File([new Uint8Array(media.MAX_IMAGE_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' });
const rejects = async (file) => media.validateImage(file).then(() => false).catch(() => true);
ok('A real PNG signature passes validation', await rejects(okPng) === false);
ok('A spoofed .jpg (wrong magic bytes) is rejected', await rejects(fakeJpg) === true);
ok('SVG uploads are rejected', await rejects(svgFile) === true);
ok('Oversized images are rejected before upload', await rejects(huge) === true);

console.log('\n—— 11. Reset demo: isolated + restores clean state ——');
demoStore.resetDemo();
ok('Operating sample restored after reset', offlineStore.listLocalBookings().length >= 16);
ok('Showcase businesses restored', demoStore.listDemoBusinesses('Jaipur').filter((b) => b.seeded).length === 2);
ok('Jaipur directory restored', demoStore.listDemoBusinesses('Jaipur').length >= 22);
ok('Services restored across showcase businesses', demoStore.listDemoServices().length >= 8);
ok('Staff restored across showcase businesses', demoStore.listDemoStaff().length >= 6);
ok('Sample customers restored', demoStore.listDemoCustomers().length >= 8);
ok('Admin sample notifications restored', offlineStore.listLocalNotificationsFor('admin').length >= 2);
ok('Production keys untouched (no velora-demo in localStorage main keys)', !localStorage.getItem('velora-demo-businesses') || JSON.parse(localStorage.getItem('velora-demo-businesses')).every((b) => b.tenant_id === demoStore.DEMO_TENANT_ID));

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
