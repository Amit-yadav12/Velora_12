// Focused API regressions. Supabase/Auth and external providers are stubbed;
// these tests do not contact a live project or assert provider delivery.
import assert from 'node:assert/strict';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://launch-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'launch-test-service-key';
process.env.QR_SIGNING_SECRET = 'a'.repeat(48);
delete process.env.RESEND_API_KEY; delete process.env.SENDGRID_API_KEY; delete process.env.SMTP_RELAY_URL;
const supabase = (await import('../api/db-client.js')).default;
const { validateBusinessInput, storagePathForUrl, coordinatesMatch } = await import('../api/_lib/business-input.js');
const { buildAvailableSlots } = await import('../api/business-slots.js');
const qr = await import('../api/_lib/qr.js');
const { validateImage } = await import('../src/lib/businessMedia.ts');
const { toMapBusinesses } = await import('../src/lib/mapData.ts');
const { todayHours } = await import('../src/lib/businessHours.ts');
const { inr } = await import('../src/lib/format.ts');
let count = 0;
const ok = (condition, label) => { assert.ok(condition, label); count++; console.log(`  ✓ ${label}`); };
const throws = (fn, label) => { assert.throws(fn); count++; console.log(`  ✓ ${label}`); };

const input = { name:'Studio', category:'Salons', email:'owner@example.com', address:'Test Road', city:'Jaipur', state:'Rajasthan', pin:'302001', lat:26.9, lng:75.8, location_confirmed:true, active:true, services:[{name:'Haircut', duration_min:30, price:500}], staff:[], photos:[] };
ok(validateBusinessInput(input, 'owner@example.com').active, 'valid published business passes server validation');
throws(() => validateBusinessInput({ ...input, pin:'000000' }, 'owner@example.com'), 'invalid Indian PIN rejected');
throws(() => validateBusinessInput({ ...input, location_confirmed:false }, 'owner@example.com'), 'publish requires owner-confirmed coordinates');
throws(() => validateBusinessInput({ ...input, lat:0, lng:0 }, 'owner@example.com'), 'zero coordinates rejected');
throws(() => validateBusinessInput({ ...input, holidays:['2030-02-30'] }, 'owner@example.com'), 'impossible holiday date rejected');
throws(() => validateBusinessInput({ ...input, services:[{name:'Haircut', duration_min:0, price:-1}] }, 'owner@example.com'), 'invalid service and price rejected');
throws(() => validateBusinessInput(input, 'owner@example.com', { editing:true, existingServices:0 }), 'editing cannot publish using an unsaved service');
ok(storagePathForUrl('https://launch-test.supabase.co/storage/v1/object/public/business-media/owner/photo.webp','owner','https://launch-test.supabase.co')?.filename === 'photo.webp', 'own storage URL is accepted');
ok(!storagePathForUrl('https://evil.example/storage/v1/object/public/business-media/owner/photo.webp','owner','https://launch-test.supabase.co') && !storagePathForUrl('https://launch-test.supabase.co/storage/v1/object/public/business-media/other/photo.webp','owner','https://launch-test.supabase.co'), 'external and cross-owner image URLs rejected');
ok(coordinatesMatch({lat:26.9,lng:75.8},{lat:26.9001,lng:75.8}) && !coordinatesMatch({lat:26.9,lng:75.8},{lat:27.9,lng:75.8}), 'provider verification compares real coordinates');
const png = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], 'image.png', {type:'image/png'});
await validateImage(png); ok(true, 'valid PNG signature accepted');
await assert.rejects(validateImage(new File(['not an image'], 'spoof.png', {type:'image/png'}))); ok(true, 'spoofed image signature rejected');
await assert.rejects(validateImage(new File(['abc'], 'bad.svg', {type:'image/svg+xml'}))); ok(true, 'SVG upload rejected');
await assert.rejects(validateImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {type:'image/png'}))); ok(true, 'oversized upload rejected');
const date = '2030-01-07'; // Monday in IST
const business = {weekly_hours:{mon:{open:'10:00',close:'12:00',closed:false}},holidays:[]};
const svc = {duration_min:60};
const people = [{id:1,name:'A',active:true},{id:2,name:'B',active:true}];
const busy = [{start_time:'2030-01-07T04:30:00Z',end_time:'2030-01-07T05:30:00Z',status:'confirmed',staff_id:1}];
const opts = {date,business,service:svc,staff:people,bookings:busy,now:Date.parse('2030-01-01T00:00:00Z')};
const aSlots = buildAvailableSlots({...opts,staffId:1}), anySlots = buildAvailableSlots({...opts,staffId:null});
ok(aSlots.length === 3 && !aSlots[0].available && anySlots[0].available, 'staff-specific overlap blocks only the occupied specialist');
ok(buildAvailableSlots({...opts,business:{...business,holidays:[date]}}).length === 0, 'holiday closes the available grid');
ok(!buildAvailableSlots({...opts,bookings:[{...busy[0],status:'completed'}],staffId:1})[0].available, 'completed future appointment does not free its slot');
ok(buildAvailableSlots({...opts,bookings:[{...busy[0],staff_id:null,employee_name:null}],staffId:null})[0].available === false, 'unassigned historical booking conservatively blocks capacity');
const maps = toMapBusinesses([{id:1,name:'Real',category:'Salons',rating:0,review_count:0,lat:26.9,lng:75.8,ai_score:null},{id:2,name:'Missing',category:'Salons',rating:0,review_count:0},{id:3,name:'Sample',category:'Salons',rating:0,review_count:0,lat:26.9,lng:75.8,synthetic:true}]);
ok(maps.length === 1 && maps[0].ai_score === null, 'map filters fabricated/missing coordinates and preserves nullable score');
const monday = new Date('2030-01-07T04:30:00Z');
ok(todayHours({weekly_hours:{mon:{open:'10:30',close:'17:30',closed:false}}},monday)==='Today 10:30–17:30 IST' && todayHours({weekly_hours:{mon:{open:'10:30',close:'17:30',closed:false}},holidays:['2030-01-07']},monday)==='Closed today · holiday', 'customer hours reflect the IST weekly schedule and holiday');
ok(inr(500.5).includes('500.50') && inr(500).includes('500'), 'INR prices retain paise without inventing a round amount');

// Small query double used to exercise authorization + status handling of the real handlers.
const owner = {id:'owner-id',email:'owner@example.com',email_confirmed_at:'2030-01-01'};
const outsider = {id:'outsider-id',email:'outsider@example.com',email_confirmed_at:'2030-01-01'};
const customer = {id:'customer-id',email:'customer@example.com',email_confirmed_at:'2030-01-01'};
const phoneUser = {id:'phone-id', phone:'919876543210', phone_confirmed_at:'2030-01-01'};
const users = {'owner-token':owner,'outsider-token':outsider,'customer-token':customer,'phone-token':phoneUser};
const start = new Date(Date.now()+86400000).toISOString();
const rows = {
  profiles:[{id:owner.id,role:'admin',is_operator:false},{id:outsider.id,role:'admin',is_operator:false},{id:customer.id,role:'customer',is_operator:false},{id:phoneUser.id,role:'customer',is_operator:false}],
  businesses:[{id:101,name:'Studio',owner_user_id:owner.id,owner_email:'private-owner@example.com',active:true},{id:102,name:'Other',owner_user_id:'another-id',active:true}],
  business_services:[{id:201,business_id:101,name:'Haircut',active:true}], business_staff:[],
  bookings:[{id:301,ref:'VL-SECURE',customer_id:customer.id,customer_email:customer.email,resource_id:101,resource_name:'Studio',service_name:'Haircut',start_time:start,end_time:new Date(Date.now()+88200000).toISOString(),status:'confirmed'}],
  booking_meta:[],booking_history:[],notifications:[],audit_logs:[],reminders:[],email_log:[],invoices:[],
};
supabase.auth.getUser = async (token) => ({ data:{user:users[token] || null}, error:null });
class Query {
  constructor(table) {this.table=table;this.filters=[];this.op='select';this.patch=null;this.limitN=Infinity;}
  select(_columns, options) {this.countOnly = options?.head; return this;} eq(k,v) {this.filters.push(r=>String(r[k])===String(v));return this;}
  is(k,v) {this.filters.push(r=>r[k] === v);return this;} in(k,v) {this.filters.push(r=>v.some(x=>String(x)===String(r[k])));return this;}
  lt(k,v){this.filters.push(r=>r[k]<v);return this;} gt(k,v){this.filters.push(r=>r[k]>v);return this;} lte(k,v){this.filters.push(r=>r[k]<=v);return this;}
  order(){return this;} limit(n){this.limitN=n;return this;} update(v){this.op='update';this.patch=v;return this;}
  insert(v){this.op='insert';this.patch=v;return this;} upsert(v){this.op='upsert';this.patch=v;return this;}
  delete(){this.op='delete';return this;}
  run(single=false) {
    const all=rows[this.table] ||= []; let found=all.filter(r=>this.filters.every(f=>f(r))).slice(0,this.limitN);
    if (this.op==='update') found.forEach(r=>Object.assign(r,this.patch));
    if (this.op==='insert' || this.op==='upsert') { const added=Array.isArray(this.patch)?this.patch:[this.patch]; all.push(...added); found=added; }
    if (this.op==='delete') found.forEach(r=>all.splice(all.indexOf(r),1));
    return {data:single ? found[0] || null : found, error:null, count:this.countOnly ? found.length : null};
  }
  maybeSingle(){return Promise.resolve(this.run(true));} single(){return Promise.resolve(this.run(true));}
  then(resolve,reject){return Promise.resolve(this.run()).then(resolve,reject);}
}
supabase.from = (name) => new Query(name);
supabase.storage.from = () => ({list:async()=>({data:[],error:null})});
let rpcCalls = 0, lastRpcParams;
supabase.rpc = async (name, params) => {
  rpcCalls++; lastRpcParams = params;
  if (name === 'reserve_business_slot') return {data:{booking:{...rows.bookings[0]},business:rows.businesses[0],invoice:{number:'INV-VL-SECURE',total:500},replayed:false},error:null};
  if (name === 'save_owned_business') return {data:{id:103,...params.p_data},error:null};
  return {data:null,error:{message:'unexpected rpc'}};
};
const fakeRes = () => { const r={statusCode:200,body:null,headersSent:false,headers:{}}; r.status=c=>(r.statusCode=c,r);r.json=b=>(r.body=b,r.headersSent=true,r);r.setHeader=(k,v)=>(r.headers[k]=v);r.end=()=>(r.headersSent=true,r);return r; };
const req = (method,token,body={},query={}) => ({method,body,query,headers:{...(token?{authorization:`Bearer ${token}`}:{})},socket:{remoteAddress:'198.51.100.9'}});
const checkHandler=(await import('../api/bookings.js')).default;
const verifyHandler=(await import('../api/verify-booking.js')).default;
const adminHandler=(await import('../api/admin.js')).default;
const bookHandler=(await import('../api/book.js')).default;
const regHandler=(await import('../api/register-business.js')).default;
const token = qr.signBookingToken({ref:'VL-SECURE',id:301,biz:'Studio',svc:'Haircut',at:start});
const parts=token.split('.'); const badToken=`${parts[0]}.${parts[1]}.${parts[2][0]==='a'?'b':'a'}${parts[2].slice(1)}`;
ok(qr.verifyBookingToken(token).ok && !qr.verifyBookingToken(badToken).ok, 'HMAC accepts valid token and rejects tampering');
let res=fakeRes();await checkHandler(req('PUT','outsider-token',{id:301,action:'check_in',ticket:token}),res);
ok(res.statusCode===403 && rows.bookings[0].status==='confirmed', 'unrelated business owner cannot check in another business’s ticket');
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'check_in',ticket:badToken}),res);
ok(res.statusCode===400 && rows.bookings[0].status==='confirmed', 'altered ticket cannot check in');
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'check_in',ticket:token}),res);
ok(res.statusCode===200 && rows.bookings[0].status==='checked_in' && res.body.ticket_verified, 'authorized owner can check in a valid ticket');
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'check_in',ticket:token}),res);
ok(res.statusCode===200 && res.body.already_checked_in, 'repeat check-in is idempotent');
// Simulate the row being rescheduled after it was read but before check-in updates it.
rows.bookings[0].status='confirmed';
const preRaceFrom=supabase.from;
supabase.from=(table)=>{
  const q=preRaceFrom(table);
  if(table==='bookings') { const run=q.run.bind(q); q.run=(single)=>{if(q.op==='update') rows.bookings[0].start_time=new Date(Date.now()+172800000).toISOString();return run(single);}; }
  return q;
};
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'check_in',ticket:token}),res);
ok(res.statusCode===409 && rows.bookings[0].status==='confirmed', 'check-in cannot race a reschedule using the old signed time');
supabase.from=preRaceFrom;rows.bookings[0].start_time=start;rows.bookings[0].status='checked_in';
res=fakeRes();await verifyHandler(req('GET',null,{}, {token}),res);
ok(res.body.valid===true && res.body.status==='checked_in', 'public token verification uses current persisted status');
rows.bookings[0].start_time=new Date(Date.now()+172800000).toISOString();
res=fakeRes();await verifyHandler(req('GET',null,{}, {token}),res);
ok(res.body.valid===false && res.body.reason==='outdated', 'rescheduled booking invalidates the old signed ticket');
rows.bookings[0].start_time=start; rows.bookings[0].status='cancelled';
res=fakeRes();await verifyHandler(req('GET',null,{}, {token}),res);
ok(res.body.valid===false && res.body.reason==='cancelled', 'cancelled booking cannot verify as valid');
res=fakeRes();await adminHandler(req('GET','outsider-token',{}, {resource:'business'}),res);
ok(res.statusCode===200 && res.body.length===0, 'admin with no owned businesses cannot list all tenants');
res=fakeRes();await adminHandler(req('POST','owner-token',{resource:'services',business_id:102,name:'Intrusion'},{}),res);
ok(res.statusCode===403, 'business owner cannot modify another tenant’s services');
res=fakeRes();await regHandler(req('PUT','outsider-token',{...input,id:101}),res);
ok(res.statusCode===404, 'business editor rejects another owner');
res=fakeRes();await regHandler(req('POST','owner-token',{...input,photos:['https://launch-test.supabase.co/storage/v1/object/public/business-media/owner-id/missing.jpg']}),res);
ok(res.statusCode===400 && /missing/i.test(res.body.error), 'business save refuses a missing uploaded object');
const ownPhoto='https://launch-test.supabase.co/storage/v1/object/public/business-media/owner-id/service.jpg';
res=fakeRes();await adminHandler(req('POST','owner-token',{resource:'services',business_id:101,name:'Color',image_url:'https://evil.example/service.jpg'}),res);
ok(res.statusCode===400, 'service image rejects an external URL');
res=fakeRes();await adminHandler(req('POST','owner-token',{resource:'services',business_id:101,name:'Color',image_url:ownPhoto}),res);
ok(res.statusCode===400 && /missing/i.test(res.body.error), 'service image must exist in Storage');
supabase.storage.from = () => ({list:async()=>({data:[{name:'service.jpg'}],error:null}),download:async()=>({data:new Blob(['not an image']),error:null})});
res=fakeRes();await adminHandler(req('POST','owner-token',{resource:'services',business_id:101,name:'Color',image_url:ownPhoto}),res);
ok(res.statusCode===400 && /not a valid/i.test(res.body.error), 'server rejects a spoofed object even if it exists in Storage');
supabase.storage.from = () => ({list:async()=>({data:[{name:'service.jpg'}],error:null}),download:async()=>({data:new Blob([new Uint8Array([255,216,255,224,0,0,0,0,0,0,0,0])]),error:null})});
res=fakeRes();await adminHandler(req('POST','owner-token',{resource:'services',business_id:101,name:'Color',image_url:ownPhoto}),res);
ok(res.statusCode===201 && res.body.image_url===ownPhoto, 'service creation persists an owned, existing photo');
rows.business_services[0].image_url='https://legacy.example/old.jpg';
res=fakeRes();await adminHandler(req('PUT','owner-token',{resource:'services',id:201,name:'Updated',image_url:'https://legacy.example/old.jpg'}),res);
ok(res.statusCode===200 && rows.business_services[0].image_url==='https://legacy.example/old.jpg', 'editing preserves an unchanged legacy service photo');
res=fakeRes();await adminHandler(req('PUT','owner-token',{resource:'services',id:201,image_url:'https://evil.example/new.jpg'}),res);
ok(res.statusCode===400, 'editing cannot replace a service photo with an external image');
res=fakeRes();await bookHandler(req('POST',null,{business_id:101,service_id:201,start_time:start,idempotency_key:'retry'}),res);
ok(res.statusCode===401 && rpcCalls===0, 'unauthenticated real reservation is refused before RPC');
res=fakeRes();await bookHandler(req('POST','customer-token',{business_id:101,service_id:201,start_time:start,customer_name:'Customer',customer_email:'wrong@example.com',idempotency_key:'retry'}),res);
ok(res.statusCode===400 && rpcCalls===0, 'booking cannot target a different customer email');
rows.bookings[0].status='confirmed';
res=fakeRes();await bookHandler(req('POST','customer-token',{business_id:101,service_id:201,start_time:start,customer_name:'Customer',customer_email:customer.email,idempotency_key:'retry'}),res);
ok(res.statusCode===201 && !!res.body.booking && /\/verify\/v1\./.test(res.body.qr_payload) && rpcCalls===1, 'confirmed response requires a committed reservation and signed ticket');
res=fakeRes();await bookHandler(req('POST','phone-token',{business_id:101,service_id:201,start_time:start,customer_name:'Phone Customer',idempotency_key:'phone-retry'}),res);
ok(res.statusCode===201 && lastRpcParams.p_customer_id===phoneUser.id && lastRpcParams.p_customer_email===null && res.body.pipeline.email==='not_applicable', 'phone-only user reserves by authenticated ID without inventing or sending email');
res=fakeRes();await bookHandler(req('POST','phone-token',{business_id:101,service_id:201,start_time:start,customer_name:'Phone Customer',customer_email:'other@example.com',idempotency_key:'phone-retry'}),res);
ok(res.statusCode===400, 'phone-only user cannot attach an unverified email to the booking');

const businessesHandler=(await import('../api/businesses.js')).default;
const discoverHandler=(await import('../api/discover.js')).default;
const nearestHandler=(await import('../api/nearest.js')).default;
const heatmapHandler=(await import('../api/heatmap.js')).default;
const slotsHandler=(await import('../api/business-slots.js')).default;
const conciergeHandler=(await import('../api/concierge.js')).default;
res=fakeRes();await businessesHandler(req('GET',null,{}, {id:'101'}),res);
ok(res.statusCode===200 && res.body.name==='Studio' && !('owner_email' in res.body) && !('owner_user_id' in res.body), 'public business API omits private owner identity');
res=fakeRes();await slotsHandler(req('GET',null,{}, {business_id:'101',service_id:'201',date:'2030-01-07'}),res);
ok(res.statusCode===200 && !('owner_email' in res.body.business) && !('owner_user_id' in res.body.business), 'public slots API omits private owner identity');
res=fakeRes();await discoverHandler(req('GET',null,{}, {city:'Jaipur'}),res);
ok(res.statusCode===200 && res.body.results.every(b=>!b.synthetic && !('owner_email' in b) && b.travel_min === null), 'configured discovery contains no synthetic rows, private owner fields or guessed travel times');
res=fakeRes();await nearestHandler(req('GET',null,{}, {city:'Jaipur',lat:'26.9',lng:'75.8'}),res);
ok(res.statusCode===200 && !res.body.overall_nearest?.synthetic, 'configured nearest endpoint never inserts synthetic rows');
res=fakeRes();await heatmapHandler(req('GET',null,{}, {business_id:'101'}),res);
ok(res.statusCode===503, 'synthetic forecast is unavailable for configured businesses');
res=fakeRes();await conciergeHandler(req('POST',null,{message:'book Studio at 12 am',city:'Jaipur'}),res);
ok(res.statusCode===200 && res.body.action?.preferred_hour===0 && res.body.action?.to.includes('&hour=0') && res.body.reply.includes('midnight'), 'concierge preserves midnight in its booking link and response');
const ordinaryFrom = supabase.from;
supabase.from = (table) => {
  if (table !== 'businesses') return ordinaryFrom(table);
  const q = new Query(table); q.run = () => ({data:null,error:{message:'database unavailable'},count:null}); return q;
};
res=fakeRes();await businessesHandler(req('GET',null,{}, {id:'101'}),res);
ok(res.statusCode===500, 'configured database outage is not reported as an empty listing or 404');
res=fakeRes();await nearestHandler(req('GET',null,{}, {city:'Jaipur',lat:'26.9',lng:'75.8'}),res);
ok(res.statusCode===500, 'configured nearest outage does not fall back to fabricated businesses');
res=fakeRes();await conciergeHandler(req('POST',null,{message:'find salon',city:'Jaipur'}),res);
ok(res.statusCode===500, 'concierge does not report an empty result during a configured database outage');
supabase.from = ordinaryFrom;
supabase.from = (table) => {
  if (table !== 'bookings') return ordinaryFrom(table);
  const q = new Query(table); q.run = () => ({data:null,error:{message:'database unavailable'},count:null}); return q;
};
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'cancel'}),res);
ok(res.statusCode===500, 'booking lookup outage is not misreported as a missing booking');
supabase.from = ordinaryFrom;
// A committed status update is still acknowledged if a secondary write throws.
rows.bookings[0].status='confirmed';
supabase.from = (table) => { if (table==='booking_meta') throw new Error('secondary store offline'); return ordinaryFrom(table); };
res=fakeRes();await checkHandler(req('PUT','owner-token',{id:301,action:'check_in',ticket:token}),res);
ok(res.statusCode===200 && rows.bookings[0].status==='checked_in', 'check-in success survives a post-commit metadata failure');
supabase.from = ordinaryFrom;
const myBookingsHandler=(await import('../api/my-bookings.js')).default;
rows.bookings.push({id:399,ref:'VL-PHONE',customer_id:phoneUser.id,customer_email:null,resource_id:101,resource_name:'Studio',service_name:'Cut',start_time:start,end_time:start,status:'confirmed'});
res=fakeRes();await myBookingsHandler(req('GET','phone-token'),res);
ok(res.statusCode===200 && res.body.length===1 && res.body[0].ref==='VL-PHONE', 'phone-only booking history is scoped by user ID');
supabase.from = (table) => { if (table==='booking_meta') throw new Error('secondary store offline'); return ordinaryFrom(table); };
res=fakeRes();await myBookingsHandler(req('GET','customer-token'),res);
ok(res.statusCode===200 && /\/verify\/v1\./.test(res.body[0]?.qr_payload), 'ticket can be regenerated from the persisted booking without metadata');
supabase.from = ordinaryFrom;
supabase.from = (table) => { if (table==='audit_logs') throw new Error('audit store offline'); return ordinaryFrom(table); };
res=fakeRes();await adminHandler(req('PUT','owner-token',{resource:'services',id:201,name:'Saved despite audit failure'}),res);
ok(res.statusCode===200 && rows.business_services[0].name==='Saved despite audit failure', 'service update reports a committed write despite secondary audit failure');
supabase.from = ordinaryFrom;
// On-demand reminder processing is scoped before the global batch limit.
const remindersHandler=(await import('../api/process-reminders.js')).default;
rows.bookings.push({id:302,ref:'VL-OTHER',customer_id:'someone-else',customer_email:'other@example.com',resource_id:101,resource_name:'Studio',service_name:'Cut',start_time:start,end_time:start,status:'confirmed'});
rows.reminders.push({id:401,booking_id:301,booking_ref:'VL-SECURE',sent:false,fire_at:'2020-01-01T00:00:00Z',kind:'1h'}, {id:402,booking_id:302,booking_ref:'VL-OTHER',sent:false,fire_at:'2020-01-01T00:00:00Z',kind:'1h'});
res=fakeRes();await remindersHandler(req('POST','customer-token'),res);
ok(res.statusCode===200 && res.body.processed===1 && rows.reminders.find(r=>r.id===401).sent && !rows.reminders.find(r=>r.id===402).sent, 'on-demand reminders process only the signed-in customer’s bookings');
rows.reminders.find(r=>r.id===401).sent=false;
supabase.from = (table) => {
  if (table !== 'notifications') return ordinaryFrom(table);
  const q = new Query(table); q.run = () => ({data:null,error:{message:'notification store offline'},count:null}); return q;
};
res=fakeRes();await remindersHandler(req('POST','customer-token'),res);
ok(res.statusCode===500 && !rows.reminders.find(r=>r.id===401).sent, 'failed notification insert does not mark a reminder processed');
supabase.from = ordinaryFrom;
// Provider is stubbed; assert the outgoing HTML safely escapes untrusted text.
const originalFetch=globalThis.fetch;
let sentHtml='';
process.env.RESEND_API_KEY='fake-test-key';
globalThis.fetch=async (_url,options)=>{sentHtml=JSON.parse(options.body).html;return new Response('{}',{status:200});};
const { sendEmail } = await import('../api/_lib/email.js');
await sendEmail({to:'customer@example.com',subject:'Test',title:'<Title>',name:'<img src=x onerror=alert(1)>',lines:[{k:'<Key>',v:'<b>value</b>'}],cta:{label:'Open',href:'https://example.com/?x=1&y=2'}});
ok(sentHtml.includes('&lt;img') && sentHtml.includes('&lt;b&gt;value&lt;/b&gt;') && !sentHtml.includes('<img src=x'), 'untrusted email text is HTML-escaped');
globalThis.fetch=originalFetch;delete process.env.RESEND_API_KEY;
supabase.from = (table) => {
  if (table !== 'email_log') return ordinaryFrom(table);
  const q = new Query(table); q.run = () => ({data:null,error:{message:'log offline'},count:null}); return q;
};
const unlogged=await sendEmail({to:'customer@example.com',subject:'Test',title:'Test',lines:[]});
ok(unlogged.status==='not_recorded' && !unlogged.ok, 'an unlogged, unsent email is not reported as queued');
supabase.from = ordinaryFrom;
// ---- Tenant isolation of the business console (the "their own id" rule) ----
// An owner's console is scoped by their businesses; a booking addressed to a
// different business id must never be listed, confirmed or checked in.
rows.bookings.push({id:303,ref:'VL-TENANT-B',customer_id:'someone-else',customer_email:'other@example.com',resource_id:102,resource_name:'Other',service_name:'Cut',start_time:start,end_time:start,status:'pending'});
const listFor = async (token) => { const r = fakeRes(); await checkHandler(req('GET',token), r); return r; };
const ownerList = await listFor('owner-token');
ok(ownerList.statusCode === 200 && ownerList.body.some((b) => b.ref === 'VL-SECURE') && !ownerList.body.some((b) => b.ref === 'VL-TENANT-B'), 'owner console lists its own bookings and never another business’s rows');
const outsiderList = await listFor('outsider-token');
ok(outsiderList.statusCode === 200 && outsiderList.body.length === 0, 'an admin who owns no business sees no tenant bookings');
res = fakeRes(); await checkHandler(req('PUT','owner-token',{id:303,action:'status',status:'confirmed'}), res);
ok(res.statusCode === 403 && rows.bookings.find((b) => b.id === 303).status === 'pending', 'owner cannot confirm another business’s booking by id');
rows.bookings.splice(rows.bookings.indexOf(rows.bookings.find((b) => b.id === 303)), 1);

const { travelTimeMin } = await import('../api/_lib/maps.js');
delete process.env.GOOGLE_MAPS_API_KEY;
ok(await travelTimeMin({lat:26.9,lng:75.8},{lat:26.91,lng:75.81})===0, 'travel time is unavailable without a live provider instead of a fabricated estimate');

console.log(`\n${count} focused API/input regressions passed (providers mocked).`);
