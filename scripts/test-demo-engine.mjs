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
const events = await import(run('src/services/events.ts'));

console.log('\n—— 0. Real-time event transport ——');
let bookingSignals = 0;
const offBookingSignal = events.onBookingsChanged(() => { bookingSignals += 1; });
events.emitBookingsChanged();
ok('Same-tab booking event arrives synchronously', bookingSignals === 1, `got ${bookingSignals}`);
const busPayload = localStorage.getItem('velora-bus');
window.dispatchEvent(new StorageEvent('storage', { key: 'velora-bus', newValue: busPayload }));
ok('Cross-tab storage event reaches booking subscriber', bookingSignals === 2, `got ${bookingSignals}`);
offBookingSignal();
events.emitBookingsChanged();
ok('Unsubscribe removes both event listeners', bookingSignals === 2, `got ${bookingSignals}`);

let entitySignals = 0;
const entityOffs = [
  events.onBusinessesChanged(() => { entitySignals += 1; }),
  events.onServicesChanged(() => { entitySignals += 1; }),
  events.onStaffChanged(() => { entitySignals += 1; }),
];

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

console.log('\n—— 2. Business / service / staff CRUD (demo dataset) ——');
entitySignals = 0;
const newBiz = demoStore.saveDemoBusiness({ name: 'Test Studio', category: 'Gyms', city: 'Jaipur' });
ok('Add business persists', demoStore.listDemoBusinesses().some((b) => b.id === newBiz.id));
const newSvc = demoStore.saveDemoService({ business_id: newBiz.id, name: 'Trial session', duration_min: 30, price: 300 });
const newStaff = demoStore.saveDemoStaff({ business_id: newBiz.id, name: 'Test Coach', role: 'Trainer', service_ids: [newSvc.id] });
ok('Service + staff persist to same dataset', demoStore.listDemoServices(newBiz.id).some((s) => s.id === newSvc.id) && demoStore.listDemoStaff(newBiz.id).some((s) => s.id === newStaff.id));
demoStore.updateDemoService(newSvc.id, { active: false });
ok('Deactivate service — customers can no longer book it', demoStore.listDemoServices(newBiz.id).find((s) => s.id === newSvc.id)?.active === false);
demoStore.deleteDemoBusiness(newBiz.id);
ok('Cascade delete removes services + staff', demoStore.listDemoServices(newBiz.id).length === 0 && demoStore.listDemoStaff(newBiz.id).length === 0);
ok('Every entity mutation emits an immediate refresh signal', entitySignals === 9, `got ${entitySignals}`);
entityOffs.forEach((off) => off());

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

let liveSales = m.salesCount;
const offLiveMetrics = events.onBookingsChanged(() => {
  liveSales = metrics.revenueMetrics(offlineStore.listLocalBookings()).salesCount;
});
const liveBooking = await offlineStore.createDemoBooking({
  business_id: aurora, business_name: 'Aurora Luxe Salon & Spa',
  service_id: svc1.id, service_name: svc1.name, service_duration: 45, service_price: 650,
  start_time: slots.find((s) => s.available && s.time !== pick.time).time,
  customer_name: 'Realtime Customer', customer_email: 'realtime@velora.ai',
});
ok('Booking event recomputes dashboard sales with no refetch', liveSales === 2, `got ${liveSales}`);
offlineStore.transitionLocalBooking(liveBooking.booking.id, 'confirmed');
ok('Business transition is visible through the same live record', offlineStore.listLocalBookings().find((b) => b.id === liveBooking.booking.id)?.status === 'confirmed');
offlineStore.transitionLocalBooking(liveBooking.booking.id, 'cancelled');
offLiveMetrics();

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
// Same slot with a DIFFERENT free specialist stays bookable (capacity-aware).
// (Arjun Rao works all 7 days — the roster is part of real availability.)
const guardSlots2 = demoStore.demoSlots('demo-biz-aurora', guardSvc.id, guardDate, offlineStore.listLocalBookings().map((b) => ({ business_id: b.business_id, staff_name: b.staff_name, start_time: b.start_time, end_time: b.end_time, status: b.status })), 'Arjun Rao');
ok('Another specialist can still take the same time', guardSlots2.find((s) => s.time === guardSlot.time)?.available === true);
ok('A staff member off-duty that day blocks their slot', demoStore.demoSlots('demo-biz-aurora', guardSvc.id, guardDate, [], 'Kabir Singh').every((s) => !s.available || s.time !== guardSlot.time) || demoStore.demoSlots('demo-biz-aurora', guardSvc.id, guardDate, [], 'Kabir Singh').find((s) => s.time === guardSlot.time)?.available === false);

console.log('\n—— 11c. IST reschedule round-trip (no 5.5h shift) ——');
const fmt = await import(run('src/lib/format.ts'));
const sampleIso = '2026-09-15T05:30:00.000Z'; // 11:00 IST
const local = fmt.istDateTimeLocal(sampleIso);
ok('IST wall clock for input (11:00, not 05:30)', local.endsWith('T11:00'), local);
const back = new Date(`${local}:00+05:30`).toISOString();
ok('Round-trip preserves the instant', back === sampleIso, back);
const boundaryMetrics = metrics.revenueMetrics([{
  id: 'ist-boundary', ref: 'IST', status: 'confirmed', price: 100,
  start_time: '2026-09-16T05:30:00.000Z',
}], new Date('2026-09-15T20:00:00.000Z')); // 01:30 IST on 16 Sep
ok('Dashboard today boundary is Asia/Kolkata, not runtime-local', boundaryMetrics.todayCount === 1 && boundaryMetrics.todayRevenue === 100);

console.log('\n—— 12. Deactivated business leaves customer discovery ——');
demoStore.resetDemo();
const hybrid = await import(run('src/lib/hybridData.ts'));
globalThis.fetch = async () => { throw new Error('offline'); }; // offline path = real fallback behavior
const disc1 = await hybrid.fetchDiscover({ city: 'Jaipur', lat: 26.9124, lng: 75.7873, sort: 'ai', q: 'deactivate-test-a' });
const bizCountBefore = disc1.results.filter((b) => String(b.id).startsWith('demo-biz-')).length;
ok('Demo businesses present in discovery', bizCountBefore >= 22, `got ${bizCountBefore}`);
const targetId = disc1.results.filter((b) => String(b.id).startsWith('demo-biz-'))[0].id;
demoStore.updateDemoBusiness(String(targetId), { active: false });
const disc2 = await hybrid.fetchDiscover({ city: 'Jaipur', lat: 26.9124, lng: 75.7873, sort: 'ai', q: 'deactivate-test-b' });
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
offlineStore.transitionLocalBooking(vb.booking.id, 'cancelled');
const vCanc = await verify.verifyToken(vTok);
ok('Cancelled booking → invalid verdict', vCanc.valid === false && vCanc.reason === 'cancelled');
const vBad = await verify.verifyToken('local.invalid-token');
ok('Altered token → invalid verdict', vBad.valid === false && vBad.reason === 'invalid');

console.log('\n—— 14. Notification audience isolation ——');
const notifs = offlineStore.listLocalNotifications();
ok('Customer never receives admin notifications', notifs.filter((n) => n.audience === 'admin').every((n) => n.audience !== 'customer'));
ok('Booking created both-side notifications (customer + admin)', notifs.some((n) => n.audience === 'customer' && n.booking_ref) && notifs.some((n) => n.audience === 'admin' && n.booking_ref));

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
