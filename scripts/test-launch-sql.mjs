// Runs the real migrations against isolated embedded PostgreSQL (PGlite), not a live Supabase project.
// Emulates only the small auth/storage schema surface that the migrations use.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
const owner = '11111111-1111-4111-8111-111111111111';
const customer = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
let passed = 0;
const ok = (v, name) => { assert.ok(v, name); passed++; console.log(`  ✓ ${name}`); };
async function denied(p, name, code) { try { await p; assert.fail(`${name}: unexpectedly succeeded`); } catch (e) { if (e.code === 'ERR_ASSERTION') throw e; if (code) assert.equal(e.code, code, `${name}: wrong PostgreSQL error`); passed++; console.log(`  ✓ ${name}`); } }
const supabaseStubs = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
  create function auth.email() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.email',true),'') $$;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id bigint generated always as identity primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
  create publication supabase_realtime;
`;
try {
  await db.exec(supabaseStubs);

  // 0001's historical policy reset targets the whole public schema. Test the
  // generated fresh-project bootstrap itself, not just its individual files:
  // it must refuse an existing project's policies before executing any DDL.
  const bundle = await readFile(new URL('../supabase/APPLY_ALL.sql', import.meta.url), 'utf8');
  await db.exec(`create table public.unrelated_app(id integer); alter table public.unrelated_app enable row level security; create policy preserve_external on public.unrelated_app for select using (true);`);
  await assert.rejects(db.exec(bundle), /fresh project without existing public RLS policies/i, 'bootstrap must refuse an existing policy');
  ok((await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename='unrelated_app' and policyname='preserve_external'")).rows[0].n === 1, 'fresh bootstrap refuses and preserves unrelated RLS policies');
  ok((await db.query("select to_regclass('public.profiles') as name")).rows[0].name === null, 'bootstrap guard runs before any application DDL');
  await db.exec('drop policy preserve_external on public.unrelated_app');
  await assert.rejects(db.exec(bundle), /fresh project with an empty public schema/i, 'bootstrap must also refuse existing unprotected tables');
  ok((await db.query("select to_regclass('public.unrelated_app') as name")).rows[0].name === 'unrelated_app', 'fresh bootstrap refuses an existing table even without policies');
  ok((await db.query("select to_regclass('public.profiles') as name")).rows[0].name === null, 'table guard runs before application DDL');
  await db.exec('drop table public.unrelated_app'); // isolated PGlite test object only
  const fresh = new PGlite({ extensions: { btree_gist, pgcrypto } });
  try {
    await fresh.exec(supabaseStubs);
    await fresh.exec(bundle);
    ok((await fresh.query("select to_regclass('public.booking_allocations') as name")).rows[0].name !== null, 'fresh bootstrap applies every migration in an empty project');
  } finally { await fresh.close(); }

  const migrations = ['0001_velora_core.sql','0002_business_registration_role_lock.sql','0003_rls_tightening.sql','0004_booking_lifecycle.sql','0005_launch_security_and_booking.sql'];
  for (const file of migrations.slice(0, 4)) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  await db.query(`insert into auth.users(id,email) values ($1,'owner@example.com'),($2,'customer@example.com'),($3,'other@example.com')`, [owner, customer, other]);
  await db.query(`insert into public.profiles(id,email,role) values ($1,'owner@example.com','admin'),($2,'customer@example.com','customer'),($3,'other@example.com','customer')`, [owner,customer,other]);
  const legacyBusiness = (await db.query(`insert into public.businesses(name,category,owner_user_id,active) values ('Legacy Business','Salons',$1,true) returning id`,[owner])).rows[0].id;
  const legacyStaff = (await db.query(`insert into public.business_staff(business_id,name) values ($1,'Legacy specialist') returning id`, [legacyBusiness])).rows[0].id;
  const legacySvc = (await db.query(`insert into public.business_services(business_id,name,duration_min,price) values($1,'Legacy service',30,100) returning id`,[legacyBusiness])).rows[0].id;
  await db.query(`insert into public.bookings(ref,customer_id,customer_email,service_id,service_name,resource_id,resource_name,employee_name,start_time,end_time,status) values ('LEGACY-1',$1,'customer@example.com',$2,'Legacy service',$3,'Legacy Business','Legacy specialist', ((current_date+7)+time '09:00') at time zone 'Asia/Kolkata',((current_date+7)+time '09:30') at time zone 'Asia/Kolkata','confirmed')`,[customer,legacySvc,legacyBusiness]);
  // Supabase normally grants its client roles before migrations run.
  await db.exec('grant usage on schema public,auth,storage to authenticated,anon; grant select,insert,update,delete on all tables in schema public,storage to authenticated,anon; grant usage,select on all sequences in schema public,storage to authenticated,anon;');
  const migration = await readFile(new URL('../supabase/migrations/0005_launch_security_and_booking.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  ok((await db.query('select count(*)::int n from public.bookings')).rows[0].n === 1, 'migration is repeatable and retains historical bookings');
  ok((await db.query('select is_operator from public.profiles where id=$1',[owner])).rows[0].is_operator === false, 'existing admins are not silently promoted to operators');
  await db.exec("set request.jwt.claim.role = 'service_role'");
  const failedPayload = { name:'Atomic failure', category:'Salons', services:[{name:null,duration_min:30,price:50}] };
  await denied(db.query('select public.save_owned_business($1,$2,$3,$4,$5::jsonb)',[other,'other@example.com','Other',null,JSON.stringify(failedPayload)]), 'business creation rolls back on invalid service');
  ok((await db.query("select count(*)::int n from public.businesses where name='Atomic failure'")).rows[0].n === 0, 'failed business leaves no partial row');
  ok((await db.query('select role from public.profiles where id=$1',[other])).rows[0].role === 'customer', 'failed business leaves profile unprivileged');
  const payload = {name:'Real Studio',category:'Salons',address:'Test road',city:'Jaipur',state:'Rajasthan',pin:'302001',lat:26.9,lng:75.8,active:true,open_time:'09:00',close_time:'20:00',services:[{name:'Consultation',duration_min:30,price:850}],staff:[{name:'A',role:'Stylist'},{name:'B',role:'Stylist'}]};
  const saved = (await db.query('select public.save_owned_business($1,$2,$3,$4,$5::jsonb) as b',[owner,'owner@example.com','Owner',null,JSON.stringify(payload)])).rows[0].b;
  const services = (await db.query('select * from public.business_services where business_id=$1',[saved.id])).rows;
  const staff = (await db.query('select * from public.business_staff where business_id=$1 order by id',[saved.id])).rows;
  ok(saved.id && services.length === 1 && staff.length === 2, 'business, service and staff save atomically');
  const start = (await db.query("select (((current_date+7)+time '10:00') at time zone 'Asia/Kolkata')::text as t")).rows[0].t;
  async function reserve(bid, sid, staffId, who, ref, key, when = start) {
    return (await db.query('select public.reserve_business_slot($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10) as result',[bid,sid,staffId,who,'Customer',`${who === customer ? 'customer' : 'other'}@example.com`,'',when,ref,key])).rows[0].result;
  }
  const first = await reserve(saved.id,services[0].id,staff[0].id,customer,'VL-TEST1','retry-1');
  ok(first.booking.status === 'confirmed' && Number(first.invoice.total) === 850 && Number(first.invoice.tax) === 0, 'confirmed booking and INR invoice are committed together');
  const replay = await reserve(saved.id,services[0].id,staff[0].id,customer,'VL-DIFFERENT','retry-1');
  ok(replay.replayed && replay.booking.id === first.booking.id, 'retry key returns the same committed booking');
  await denied(reserve(saved.id,services[0].id,staff[0].id,other,'VL-TEST2','retry-2'), 'overlapping booking for same staff is rejected');
  const second = await reserve(saved.id,services[0].id,staff[1].id,other,'VL-TEST3','retry-3');
  ok(second.booking.id !== first.booking.id, 'another staff member retains capacity');
  await denied(reserve(legacyBusiness,legacySvc,legacyStaff,other,'VL-LEGACY','legacy-key',(await db.query("select (((current_date+7)+time '09:00') at time zone 'Asia/Kolkata')::text as t")).rows[0].t), 'historical booking blocks overlapping reservation');
  const later = (await db.query("select (((current_date+7)+time '11:00') at time zone 'Asia/Kolkata')::text as t")).rows[0].t;
  const third = await reserve(saved.id,services[0].id,staff[0].id,customer,'VL-TEST4','retry-4',later);
  await denied(db.query('select public.reschedule_business_slot($1,$2::timestamptz)',[third.booking.id,start]), 'reschedule to occupied time is rejected');
  ok((await db.query('select start_time from public.bookings where id=$1',[third.booking.id])).rows[0].start_time.getTime() === new Date(later).getTime(), 'failed reschedule preserves the original time');
  await db.query("update public.bookings set status='cancelled' where id=$1",[first.booking.id]);
  const afterCancel = await reserve(saved.id,services[0].id,staff[0].id,other,'VL-TEST5','retry-5');
  ok(afterCancel.booking.id !== first.booking.id, 'cancellation releases the allocation');
  await db.query("update public.bookings set status='completed' where id=$1",[second.booking.id]);
  await denied(reserve(saved.id,services[0].id,staff[1].id,customer,'VL-COMPLETED','completed-key'), 'completed future appointment still occupies its time');
  const unallocated = (await db.query("insert into public.bookings(ref,resource_name,start_time,end_time,status) values ('VL-UNALLOCATED','Real Studio',$1::timestamptz,$1::timestamptz+interval '30 minutes','cancelled') returning id", [start])).rows[0].id;
  await denied(db.query("insert into public.booking_allocations(booking_id,business_id,staff_key,period) values ($1,$2,$3,tstzrange($4::timestamptz,$4::timestamptz+interval '30 minutes','[)'))", [unallocated,saved.id,staff[0].id,start]), 'allocation table rejects overlapping intervals', '23P01');
  await db.exec(`set role authenticated; set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${other}'; set request.jwt.claim.email='other@example.com';`);
  const visible = (await db.query('select ref from public.bookings order by ref')).rows.map((r) => r.ref);
  ok(!visible.includes('LEGACY-1') && !visible.includes('VL-TEST4') && visible.includes('VL-TEST3'), 'booking RLS isolates customer IDs');
  await denied(db.query("update public.profiles set role='admin', is_operator=true where id=$1",[other]), 'client cannot grant itself platform authority');
  await denied(db.query("insert into public.bookings(ref,resource_name,start_time,end_time) values ('FORGED','X',now(),now()+interval '1 hour')"), 'client cannot forge a booking');
  await denied(db.query('select public.reserve_business_slot($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9,$10)',[saved.id,services[0].id,staff[0].id,other,'X','x@example.com','',later,'FORGED','forged']), 'authenticated clients cannot call service-only reservation RPC');
  ok((await db.query('select id,name from public.businesses where id=$1', [saved.id])).rows.length === 1, 'public directory columns remain readable');
  await denied(db.query('select owner_email from public.businesses where id=$1', [saved.id]), 'client cannot read private business owner email', '42501');
  ok((await db.query('select id from public.business_services where business_id=$1', [saved.id])).rows.length === 1, 'public service visibility survives restricted owner columns');
  await denied(db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['business-media',`${owner}/stolen.jpg`]), 'storage RLS rejects uploads to another owner folder');
  await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', ['business-media',`${other}/mine.jpg`]);
  ok(true, 'storage RLS allows uploads under the signed-in owner folder');
  console.log(`\n${passed} isolated PostgreSQL migration/security checks passed.`);
} finally { await db.close(); }
