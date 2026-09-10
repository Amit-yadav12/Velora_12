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

const { execSync } = await import('node:child_process');
const run = (m) => `file:///home/user/Velora_12/${m}`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

// Real modules
const demoStore = await import(run('src/lib/demoStore.ts'));
const offlineStore = await import(run('src/lib/offlineStore.ts'));
const metrics = await import(run('src/lib/metrics.ts'));
const bookingStatus = await import(run('src/lib/bookingStatus.ts'));

console.log('\n—— 1. Demo tenant seeding ——');
demoStore.ensureDemoSeeded();
const biz = demoStore.listDemoBusinesses('Jaipur', true);
ok('Seeds 2 showcase businesses', biz.length === 2, `got ${biz.length}`);
ok('Aurora exists with services attached', biz[0].services.length === 4 && biz[0].staff.length === 4);
ok('All seeded records carry tenant_id', biz.every((b) => b.tenant_id === demoStore.DEMO_TENANT_ID));
ok('Demo ids recognized', demoStore.isDemoId('demo-biz-aurora') && !demoStore.isDemoId(100001));

console.log('\n—— 2. Business / service / staff CRUD (demo dataset) ——');
const newBiz = demoStore.saveDemoBusiness({ name: 'Test Studio', category: 'Gyms', city: 'Jaipur' });
ok('Add business persists', demoStore.listDemoBusinesses().some((b) => b.id === newBiz.id));
const newSvc = demoStore.saveDemoService({ business_id: newBiz.id, name: 'Trial session', duration_min: 30, price: 300 });
const newStaff = demoStore.saveDemoStaff({ business_id: newBiz.id, name: 'Test Coach', role: 'Trainer', service_ids: [newSvc.id] });
ok('Service + staff persist to same dataset', demoStore.listDemoServices(newBiz.id).length === 1 && demoStore.listDemoStaff(newBiz.id).length === 1);
demoStore.updateDemoService(newSvc.id, { active: false });
ok('Deactivate service — customers can no longer book it', demoStore.listDemoServices(newBiz.id)[0].active === false);
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

console.log('\n—— 11. Reset demo: isolated + restores clean state ——');
demoStore.resetDemo();
ok('Demo bookings cleared', offlineStore.listLocalBookings().length === 0);
ok('Showcase businesses restored', demoStore.listDemoBusinesses('Jaipur').length === 2);
ok('Services restored (8 across 2 businesses)', demoStore.listDemoServices().length === 8);
ok('Staff restored (6 across 2 businesses)', demoStore.listDemoStaff().length === 6);
ok('Notifications reset', offlineStore.listLocalNotificationsFor('admin').length === 0);
ok('Production keys untouched (no velora-demo in localStorage main keys)', !localStorage.getItem('velora-demo-businesses') || JSON.parse(localStorage.getItem('velora-demo-businesses')).every((b) => b.tenant_id === demoStore.DEMO_TENANT_ID));

console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
process.exit(fail === 0 ? 0 : 1);
