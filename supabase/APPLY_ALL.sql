-- ============================================================================
-- Velora AI OS — APPLY_ALL.sql
-- One-paste database bootstrap for a FRESH Supabase project.
--
-- HOW TO RUN
--   1. Supabase dashboard -> your project -> SQL Editor -> New query
--   2. Paste this ENTIRE file and press RUN
--   3. Expected result: "Success. No rows returned"
--   4. Then run supabase/PROMOTE_ADMIN.sql (change the email, press RUN)
--
-- WHAT IT DOES
--   Applies every migration in supabase/migrations/ in order:
--     0001_velora_core.sql                       14 tables, RLS, realtime, triggers
--     0002_business_registration_role_lock.sql   ownership columns + role-lock trigger
--     0003_rls_tightening.sql                    removes the permissive anon policies
--     0004_booking_lifecycle.sql                 pending status + service-only invoice writes
--     0005_launch_security_and_booking.sql       tenant isolation + transactional bookings
--   Order matters: the historical 0001 drops every policy in public. This
--   bundle aborts before DDL when public policies or relations already exist.
--   Do NOT rerun it on an existing or partially migrated project. Back up and
--   apply only the missing incremental migrations after reviewing their impact.
--   Running historical 0001 directly does NOT include the bootstrap guard.
--
-- GENERATED from the migration files by scripts/build-sql.mjs — edit the
-- migrations, not this file (verify:integrations fails if they drift).
-- ============================================================================

do $velora_fresh_project_guard$
begin
  if exists (select 1 from pg_policies where schemaname = 'public') then
    raise exception 'APPLY_ALL.sql requires a fresh project without existing public RLS policies; back up and apply incremental migrations instead';
  end if;
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  ) then
    raise exception 'APPLY_ALL.sql requires a fresh project with an empty public schema; back up and apply incremental migrations instead';
  end if;
end
$velora_fresh_project_guard$;

-- ============================================================================
-- >>> 0001_velora_core.sql
-- ============================================================================

-- Velora Core Schema — 14 tables + RLS + realtime
-- Run this in Supabase SQL Editor (one-shot). Idempotent where possible.
-- Designed for production with demo fallbacks: empty DB still works via synthetic ecosystem.

-- Enable pgcrypto for gen_random_uuid if not already
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. profiles — mirrors auth.users, stores role + display name
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'customer' check (role in ('customer','admin')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. businesses — core business directory (synthetic + real)
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id bigserial primary key,
  name text not null,
  slug text,
  category text not null,
  description text,
  address text,
  city text,
  area text,
  landmark text,
  lat double precision,
  lng double precision,
  phone text,
  email text,
  website text,
  rating numeric(2,1) default 4.2,
  review_count int default 0,
  image_url text,
  cover_url text,
  photos jsonb default '[]'::jsonb,
  facilities jsonb default '[]'::jsonb,
  amenities jsonb default '[]'::jsonb,
  offers jsonb default '[]'::jsonb,
  active boolean not null default true,
  featured boolean not null default false,
  open_time text default '09:00',
  close_time text default '21:00',
  price_from numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. business_services — services per business with INR pricing
-- ---------------------------------------------------------------------------
create table if not exists public.business_services (
  id bigserial primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  description text,
  duration_min int not null default 30,
  price numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. business_staff — staff per business
-- ---------------------------------------------------------------------------
create table if not exists public.business_staff (
  id bigserial primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null,
  role text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. bookings — central booking table with QR + calendar sync
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id bigserial primary key,
  ref text not null unique,
  customer_id uuid references public.profiles(id) on delete set null,
  customer_name text,
  customer_email text,
  service_id bigint references public.business_services(id) on delete set null,
  service_name text,
  employee_name text,
  resource_id bigint,
  resource_name text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','in_progress','checked_in','completed','cancelled','no_show')),
  price numeric default 0,
  price_breakdown jsonb default '[]'::jsonb,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bookings_start_time_idx on public.bookings(start_time desc);
create index if not exists bookings_customer_email_idx on public.bookings(customer_email);
create index if not exists bookings_resource_name_idx on public.bookings(resource_name);
create index if not exists bookings_ref_idx on public.bookings(ref);

-- ---------------------------------------------------------------------------
-- 6. booking_meta — QR payload + calendar ids + check-in flag
-- ---------------------------------------------------------------------------
create table if not exists public.booking_meta (
  booking_id bigint primary key references public.bookings(id) on delete cascade,
  qr_payload text,
  calendar_event_id text,
  business_calendar_event_id text,
  checked_in boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 7. booking_history — audit trail per booking
-- ---------------------------------------------------------------------------
create table if not exists public.booking_history (
  id bigserial primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  action text not null,
  detail text,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists booking_history_booking_id_idx on public.booking_history(booking_id);

-- ---------------------------------------------------------------------------
-- 8. reminders — scheduled reminders (24h, 6h, 1h, 15min, leave_now)
-- ---------------------------------------------------------------------------
create table if not exists public.reminders (
  id bigserial primary key,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  booking_ref text,
  kind text not null check (kind in ('24h','6h','1h','15min','leave_now')),
  fire_at timestamptz not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reminders_fire_at_idx on public.reminders(fire_at) where sent = false;
create index if not exists reminders_booking_id_idx on public.reminders(booking_id);

-- ---------------------------------------------------------------------------
-- 9. notifications — in-app notifications (customer + admin)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  audience text not null default 'customer' check (audience in ('customer','admin')),
  title text not null,
  body text,
  type text default 'info' check (type in ('info','success','warning','error')),
  booking_ref text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_audience_idx on public.notifications(audience);
create index if not exists notifications_created_at_idx on public.notifications(created_at desc);

-- ---------------------------------------------------------------------------
-- 10. recently_viewed — per-user recent business views
-- ---------------------------------------------------------------------------
create table if not exists public.recently_viewed (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_id bigint not null,
  viewed_at timestamptz not null default now(),
  unique(user_id, business_id)
);
create index if not exists recently_viewed_user_id_idx on public.recently_viewed(user_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- 11. email_log — persistent email delivery log (never loses confirmations)
-- ---------------------------------------------------------------------------
create table if not exists public.email_log (
  id bigserial primary key,
  to_email text not null,
  subject text not null,
  html text,
  provider text,
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  error text,
  booking_ref text,
  created_at timestamptz not null default now()
);
create index if not exists email_log_to_email_idx on public.email_log(to_email);
create index if not exists email_log_booking_ref_idx on public.email_log(booking_ref);

-- ---------------------------------------------------------------------------
-- 12. audit_logs — admin audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor text,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------------
-- 13. idempotency_keys — prevents duplicate bookings on retry
-- ---------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  key text primary key,
  response jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 14. invoices — per-booking invoice with GST
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id bigserial primary key,
  number text not null unique,
  booking_id bigint not null references public.bookings(id) on delete cascade,
  booking_ref text,
  customer_name text,
  customer_email text,
  amount numeric not null default 0,
  tax numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'issued' check (status in ('issued','paid','cancelled')),
  line_items jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists invoices_booking_id_idx on public.invoices(booking_id);
create index if not exists invoices_booking_ref_idx on public.invoices(booking_ref);

-- ---------------------------------------------------------------------------
-- RLS — enable and create permissive policies for authenticated + anon
-- Production hardening: customers can only read/write their own bookings,
-- admins bypass via service_role. For demo, anon can read businesses/services.
-- ---------------------------------------------------------------------------

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_services enable row level security;
alter table public.business_staff enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_meta enable row level security;
alter table public.booking_history enable row level security;
alter table public.reminders enable row level security;
alter table public.notifications enable row level security;
alter table public.recently_viewed enable row level security;
alter table public.email_log enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.invoices enable row level security;

-- Drop existing policies if re-running (idempotent)
do $$
declare
  pol record;
begin
  for pol in select policyname, tablename from pg_policies where schemaname='public' loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- profiles: users can read all, but only update own; insert allowed for new users
create policy "profiles_read_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id or auth.role() = 'service_role');
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id or auth.role() = 'service_role');
create policy "profiles_delete_own" on public.profiles for delete using (auth.uid() = id or auth.role() = 'service_role');

-- businesses: public read, service_role write
create policy "businesses_read_all" on public.businesses for select using (true);
create policy "businesses_write_service" on public.businesses for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- services + staff: public read, service_role write
create policy "services_read_all" on public.business_services for select using (true);
create policy "services_write_service" on public.business_services for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "staff_read_all" on public.business_staff for select using (true);
create policy "staff_write_service" on public.business_staff for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- bookings: customers read own (by customer_id or email), admins via service_role; insert allowed for authenticated
create policy "bookings_select_own" on public.bookings for select using (
  auth.uid() = customer_id or lower(customer_email) = lower(auth.email()) or auth.role() = 'service_role'
);
create policy "bookings_insert_auth" on public.bookings for insert with check (
  auth.role() = 'authenticated' or auth.role() = 'service_role' or auth.role() = 'anon'
);
create policy "bookings_update_own" on public.bookings for update using (
  auth.uid() = customer_id or lower(customer_email) = lower(auth.email()) or auth.role() = 'service_role'
);
create policy "bookings_delete_service" on public.bookings for delete using (auth.role() = 'service_role');

-- booking_meta, history: same as bookings via service_role or owner
create policy "booking_meta_all_service" on public.booking_meta for all using (auth.role() = 'service_role' or true) with check (true);
create policy "booking_history_all" on public.booking_history for all using (true) with check (true);

-- reminders: service_role only (cron)
create policy "reminders_all_service" on public.reminders for all using (auth.role() = 'service_role' or true) with check (true);

-- notifications: user can read own, admin reads admin audience via service_role; insert via service_role
create policy "notifications_select_own" on public.notifications for select using (
  user_id = auth.uid() or audience = 'customer' or auth.role() = 'service_role'
);
create policy "notifications_insert_all" on public.notifications for insert with check (true);
create policy "notifications_update_own" on public.notifications for update using (user_id = auth.uid() or auth.role() = 'service_role');

-- recently_viewed: user owns
create policy "recently_viewed_all" on public.recently_viewed for all using (user_id = auth.uid() or auth.role() = 'service_role') with check (user_id = auth.uid() or auth.role() = 'service_role');

-- email_log: service_role read/write, but allow read for debugging
create policy "email_log_all" on public.email_log for all using (true) with check (true);

-- audit_logs: service_role + admin read, service_role write
create policy "audit_logs_read" on public.audit_logs for select using (auth.role() = 'service_role' or true);
create policy "audit_logs_insert" on public.audit_logs for insert with check (true);

-- idempotency_keys: all for service_role, but allow insert/read for booking flow
create policy "idempotency_all" on public.idempotency_keys for all using (true) with check (true);

-- invoices: owner or service_role
create policy "invoices_select" on public.invoices for select using (
  lower(customer_email) = lower(auth.email()) or auth.role() = 'service_role'
);
create policy "invoices_insert" on public.invoices for insert with check (true);
create policy "invoices_update_service" on public.invoices for update using (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Realtime — enable for live booking updates
-- ---------------------------------------------------------------------------
-- Supabase realtime uses the supabase_realtime publication
-- Add tables to it (idempotent)
do $$
begin
  -- Create publication if not exists (Supabase already has supabase_realtime)
  -- We add tables to it
  begin
    alter publication supabase_realtime add table public.bookings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reminders;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.businesses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.booking_history;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at_profiles on public.profiles;
create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.handle_updated_at();
drop trigger if exists set_updated_at_businesses on public.businesses;
create trigger set_updated_at_businesses before update on public.businesses for each row execute function public.handle_updated_at();
drop trigger if exists set_updated_at_bookings on public.bookings;
create trigger set_updated_at_bookings before update on public.bookings for each row execute function public.handle_updated_at();
drop trigger if exists set_updated_at_booking_meta on public.booking_meta;
create trigger set_updated_at_booking_meta before update on public.booking_meta for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Demo seed helpers (optional) — creates demo customer/admin profiles if auth users exist
-- ---------------------------------------------------------------------------
-- Note: actual demo users should be created via Supabase Auth dashboard or sign-up.
-- This migration does NOT insert auth.users, only ensures tables exist.

-- ============================================================================
-- >>> 0002_business_registration_role_lock.sql
-- ============================================================================

-- Velora 0002 — Business registration + server-side role enforcement.
-- Run after 0001_velora_core.sql in the Supabase SQL Editor. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Business ownership — links a business to the account that created it
-- ---------------------------------------------------------------------------
alter table public.businesses
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.businesses
  add column if not exists owner_email text;

create index if not exists businesses_owner_idx on public.businesses (owner_user_id);

-- ---------------------------------------------------------------------------
-- 2. Role lock — 'admin' can ONLY be granted server-side.
--    Migration 0001 allowed users to insert/update their own profile with
--    ANY role (privilege escalation risk). These policies + trigger close
--    that: clients may only create their own profile as 'customer', and the
--    role column can never change except via the service role (the
--    /api/register-business and /api/provision-demo endpoints).
-- ---------------------------------------------------------------------------

-- Inserts: own row, customer role (service role bypasses RLS entirely).
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_insert_own_customer" on public.profiles;
create policy "profiles_insert_own_customer" on public.profiles for insert
  with check (auth.uid() = id and role = 'customer');

-- Updates: own row (role column protected by the trigger below).
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own_lock" on public.profiles for update
  using (auth.uid() = id or auth.role() = 'service_role')
  with check (auth.uid() = id or auth.role() = 'service_role');

-- Trigger: reject any role change that is not made by the service role.
create or replace function public.protect_profile_role()
returns trigger as $$
begin
  if old.role <> new.role and auth.role() <> 'service_role' then
    raise exception 'profile role cannot be changed from the client';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ============================================================================
-- >>> 0003_rls_tightening.sql
-- ============================================================================

-- Velora 0003 — Row-level security tightening.
-- Run after 0001_velora_core.sql and 0002_business_registration_role_lock.sql.
-- Idempotent (drops then recreates the policies it owns).
--
-- WHY: several tables shipped with permissive policies written as
-- `auth.role() = 'service_role' or true`, which is ALWAYS true — an anon key
-- could read/write QR payloads, reminders, email bodies, audit rows and
-- idempotency keys. Every one of those tables is written by the API routes
-- (service role only); clients read them through the API. The policies below
-- keep the app working while removing anonymous access.

-- ---------------------------------------------------------------------------
-- 0. Helper: is the current session an admin of the console?
--    security definer so it can read profiles regardless of the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- Every role needs EXECUTE: policies call this helper while evaluating a row
-- for that role (it simply returns false for anonymous sessions).
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. booking_meta — QR payload / calendar id / check-in flag
-- ---------------------------------------------------------------------------
drop policy if exists "booking_meta_all_service" on public.booking_meta;
drop policy if exists "booking_meta_select_own" on public.booking_meta;
drop policy if exists "booking_meta_write_service" on public.booking_meta;

-- Readable by the booking's owner (customer) and by the service role.
create policy "booking_meta_select_own" on public.booking_meta for select using (
  auth.role() = 'service_role'
  or exists (
    select 1 from public.bookings b
    where b.id = booking_meta.booking_id
      and (b.customer_id = auth.uid() or lower(b.customer_email) = lower(auth.email()))
  )
);
-- Writes happen only from the API (service role).
create policy "booking_meta_write_service" on public.booking_meta for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2. booking_history — audit trail of a booking's lifecycle
-- ---------------------------------------------------------------------------
drop policy if exists "booking_history_all" on public.booking_history;
drop policy if exists "booking_history_select_own" on public.booking_history;
drop policy if exists "booking_history_write_service" on public.booking_history;

create policy "booking_history_select_own" on public.booking_history for select using (
  auth.role() = 'service_role'
  or exists (
    select 1 from public.bookings b
    where b.id = booking_history.booking_id
      and (b.customer_id = auth.uid() or lower(b.customer_email) = lower(auth.email()))
  )
);
create policy "booking_history_write_service" on public.booking_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. reminders — scheduler-only (cron / API service role)
-- ---------------------------------------------------------------------------
drop policy if exists "reminders_all_service" on public.reminders;
drop policy if exists "reminders_service_only" on public.reminders;
create policy "reminders_service_only" on public.reminders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 4. email_log — the console's Email delivery page reads it through
--    /api/admin (service role). Admins may also stream it over Realtime.
-- ---------------------------------------------------------------------------
drop policy if exists "email_log_all" on public.email_log;
drop policy if exists "email_log_admin_read" on public.email_log;
drop policy if exists "email_log_write_service" on public.email_log;
create policy "email_log_admin_read" on public.email_log for select
  using (auth.role() = 'service_role' or public.is_platform_admin());
create policy "email_log_write_service" on public.email_log for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 5. audit_logs — append-only from the API, readable by admins
-- ---------------------------------------------------------------------------
drop policy if exists "audit_logs_read" on public.audit_logs;
drop policy if exists "audit_logs_insert" on public.audit_logs;
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
drop policy if exists "audit_logs_write_service" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs for select
  using (auth.role() = 'service_role' or public.is_platform_admin());
create policy "audit_logs_write_service" on public.audit_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 6. idempotency_keys — booking replay protection, API-only
-- ---------------------------------------------------------------------------
drop policy if exists "idempotency_all" on public.idempotency_keys;
drop policy if exists "idempotency_service_only" on public.idempotency_keys;
create policy "idempotency_service_only" on public.idempotency_keys for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 7. notifications — own rows (plus admin audience for console admins)
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_insert_all" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_insert_service" on public.notifications;

create policy "notifications_select_own" on public.notifications for select using (
  auth.role() = 'service_role'
  or user_id = auth.uid()
  or (audience = 'admin' and public.is_platform_admin())
);
create policy "notifications_update_own" on public.notifications for update using (
  auth.role() = 'service_role' or user_id = auth.uid()
);
-- Notifications are created by the API (service role) / DB triggers only.
create policy "notifications_insert_service" on public.notifications for insert
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 8. Sanity: every policy in this file is idempotent, so re-running the file
--    cannot break a deployment. Verify with:
--    select tablename, policyname, cmd, qual from pg_policies
--    where schemaname = 'public' order by tablename;
-- ---------------------------------------------------------------------------

-- ============================================================================
-- >>> 0004_booking_lifecycle.sql
-- ============================================================================

-- Velora 0004 — Booking lifecycle + invoice write hardening.
-- Run after 0001_velora_core.sql, 0002 and 0003. Idempotent.
--
-- 1. bookings.status CHECK was created with the original six values and never
--    learnt about 'pending', while the application's state machine
--    (api/bookings.js + src/lib/bookingStatus.ts) has modelled a
--    request → confirm lifecycle all along. Any persisted booking that needed
--    'pending' failed the constraint, so the business console's "confirm
--    request" flow only ever worked against the local demo dataset.
--
-- 2. invoices shipped in 0001 with `insert with check (true)`. Every invoice is
--    written by the API with the service role, so the permissive insert is not
--    needed and let an anon key forge invoice rows. Writes are now service-only;
--    customers keep the own-row SELECT policy from 0001.

-- ---------------------------------------------------------------------------
-- 1. bookings.status — accept the full application lifecycle
-- ---------------------------------------------------------------------------
alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'));

-- The console filters by status and a queue/check-in view scans by day.
create index if not exists bookings_status_idx on public.bookings (status);

-- ---------------------------------------------------------------------------
-- 2. invoices — API-only writes
-- ---------------------------------------------------------------------------
drop policy if exists "invoices_insert" on public.invoices;
drop policy if exists "invoices_insert_service" on public.invoices;
create policy "invoices_insert_service" on public.invoices for insert
  with check (auth.role() = 'service_role');

drop policy if exists "invoices_update_service" on public.invoices;
create policy "invoices_update_service" on public.invoices for update
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 3. Documented limitation (deliberately NOT enforced by an exclusion
--    constraint): bookings.resource_name is a business, and capacity means
--    several bookings may legitimately overlap. True overlap prevention is
--    enforced by /api/book's slot ledger + clash query; a single-resource
--    btree_gist exclusion constraint here would reject legitimate
--    multi-specialist capacity. If a deployment pins one specialist per
--    resource, add:
--      create extension if not exists btree_gist;
--      alter table public.bookings add constraint bookings_no_overlap
--        exclude using gist (resource_name with =,
--                            tstzrange(start_time, end_time) with &&)
--        where (status in ('pending','confirmed','checked_in','in_progress'));
--    only after removing every legitimate overlapping historical row.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- >>> 0005_launch_security_and_booking.sql
-- ============================================================================

-- Velora 0005: additive launch, tenant isolation and transactional bookings.
-- Apply this migration ONLY to existing installations; never reset production data.
-- Take a database/storage backup before applying. Existing bookings and images are retained.

-- Existing admin roles remain intact, but no account is implicitly elevated to
-- platform operator. Explicitly promote trusted operators with PROMOTE_ADMIN.sql.
alter table public.profiles add column if not exists is_operator boolean not null default false;

create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.role is distinct from new.role or old.is_operator is distinct from new.is_operator)
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'profile privileges cannot be changed from the client';
  end if;
  return new;
end $$;
create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.is_operator);
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated, service_role;

-- Profiles and booking writes cannot be read/forged through the public key.
drop policy if exists "profiles_insert_own_customer" on public.profiles;
create policy "profiles_insert_own_customer" on public.profiles for insert
  with check (auth.uid() = id and role = 'customer' and is_operator = false);
drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select using (id = auth.uid() or public.is_platform_admin());
drop policy if exists "bookings_insert_auth" on public.bookings;
drop policy if exists "bookings_update_own" on public.bookings;
drop policy if exists "bookings_write_service_only" on public.bookings;
create policy "bookings_write_service_only" on public.bookings for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
-- Stable customer IDs are authoritative. Email-only historical bookings can
-- be retrieved through the authenticated API after verified-email checks.
drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own" on public.bookings for select using (customer_id=auth.uid() or auth.role()='service_role');
drop policy if exists "booking_meta_select_own" on public.booking_meta;
create policy "booking_meta_select_own" on public.booking_meta for select using (
  auth.role()='service_role' or exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid())
);
drop policy if exists "booking_history_select_own" on public.booking_history;
create policy "booking_history_select_own" on public.booking_history for select using (
  auth.role()='service_role' or exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid())
);
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices for select using (
  auth.role()='service_role' or exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid())
);
-- Owner-specific notifications only. Old untargeted broadcasts remain visible
-- to the explicitly promoted platform operator, not to every business owner.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (
  auth.role() = 'service_role' or user_id = auth.uid()
  or (user_id is null and audience = 'admin' and public.is_platform_admin())
);

-- Draft/inactive listings and their services are visible only to their owner.
drop policy if exists "businesses_read_all" on public.businesses;
drop policy if exists "businesses_read_visible" on public.businesses;
create policy "businesses_read_visible" on public.businesses for select using (
  active or owner_user_id=auth.uid() or public.is_platform_admin()
);
-- Child visibility must not require clients to read private ownership columns.
create or replace function public.owns_business(p_id bigint) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.businesses b where b.id=p_id and b.owner_user_id=auth.uid());
$$;
revoke all on function public.owns_business(bigint) from public;
grant execute on function public.owns_business(bigint) to anon, authenticated, service_role;
drop policy if exists "services_read_all" on public.business_services;
drop policy if exists "services_read_visible" on public.business_services;
create policy "services_read_visible" on public.business_services for select using (
  (active and exists(select 1 from public.businesses b where b.id=business_id and b.active))
  or public.owns_business(business_id) or public.is_platform_admin()
);
drop policy if exists "staff_read_all" on public.business_staff;
drop policy if exists "staff_read_visible" on public.business_staff;
create policy "staff_read_visible" on public.business_staff for select using (
  (active and exists(select 1 from public.businesses b where b.id=business_id and b.active))
  or public.owns_business(business_id) or public.is_platform_admin()
);

alter table public.businesses add column if not exists state text;
alter table public.businesses add column if not exists pin text;
alter table public.businesses add column if not exists logo_url text;
alter table public.businesses add column if not exists booking_policy text;
alter table public.businesses add column if not exists cancellation_hours integer not null default 0;
alter table public.businesses add column if not exists weekly_hours jsonb not null default '{}'::jsonb;
alter table public.businesses add column if not exists holidays jsonb not null default '[]'::jsonb;
alter table public.businesses add column if not exists location_status text not null default 'unverified';
alter table public.businesses add column if not exists google_place_id text;
-- A public directory exposes business contact details, not the owner's auth
-- identity or private account email. Server-side owner/operator APIs use the
-- service role. Public PostgREST clients must select explicit public columns.
revoke select on public.businesses from public, anon, authenticated;
revoke select (owner_user_id,owner_email) on public.businesses from public, anon, authenticated;
grant select (id,name,slug,category,description,address,city,area,landmark,lat,lng,phone,email,website,
  rating,review_count,image_url,cover_url,photos,facilities,amenities,offers,active,featured,open_time,close_time,
  price_from,created_at,updated_at,state,pin,logo_url,booking_policy,cancellation_hours,weekly_hours,holidays,
  location_status,google_place_id) on public.businesses to anon, authenticated;
alter table public.business_services add column if not exists image_url text;
alter table public.bookings add column if not exists staff_id bigint references public.business_staff(id) on delete set null;
alter table public.bookings add column if not exists idempotency_key text;
create unique index if not exists bookings_customer_idempotency_idx
  on public.bookings(customer_id, idempotency_key) where customer_id is not null and idempotency_key is not null;
create index if not exists bookings_resource_time_idx on public.bookings(resource_id, start_time, end_time);

-- Public assets are deliberately readable. Only authenticated users may write
-- objects under their own UUID prefix. The API checks that referenced uploads
-- exist and belong to the current owner. SVG/HTML and oversized files rejected.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-media', 'business-media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "business_media_public_read" on storage.objects;
create policy "business_media_public_read" on storage.objects for select using (bucket_id = 'business-media');
drop policy if exists "business_media_owner_insert" on storage.objects;
create policy "business_media_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "business_media_owner_update" on storage.objects;
create policy "business_media_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "business_media_owner_delete" on storage.objects;
create policy "business_media_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'business-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Atomic business + starter services/staff + console role. The HTTP API checks
-- input and media ownership; this function adds an ownership check and makes
-- sure no partial business or premature role grant survives a failed insert.
create or replace function public.save_owned_business(
  p_owner uuid, p_email text, p_owner_name text, p_business_id bigint, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  svc jsonb;
  member jsonb;
  photo_list jsonb := coalesce(p_data->'photos', '[]'::jsonb);
begin
  if p_owner is null then raise exception 'Owner required'; end if;
  if p_business_id is not null then
    select * into b from public.businesses where id = p_business_id and owner_user_id = p_owner for update;
    if not found then raise exception 'Business not owned by caller'; end if;
    update public.businesses set
      name=p_data->>'name', category=p_data->>'category', description=p_data->>'description',
      address=p_data->>'address', area=p_data->>'area', city=p_data->>'city', state=p_data->>'state', pin=p_data->>'pin',
      lat=(p_data->>'lat')::double precision, lng=(p_data->>'lng')::double precision,
      phone=p_data->>'phone', email=p_data->>'email', website=p_data->>'website',
      open_time=p_data->>'open_time', close_time=p_data->>'close_time',
      weekly_hours=coalesce(p_data->'weekly_hours', '{}'::jsonb), holidays=coalesce(p_data->'holidays', '[]'::jsonb),
      amenities=coalesce(p_data->'amenities', '[]'::jsonb), booking_policy=p_data->>'booking_policy', cancellation_hours=coalesce((p_data->>'cancellation_hours')::integer,0),
      photos=photo_list, image_url=photo_list->>0, cover_url=photo_list->>0, logo_url=p_data->>'logo_url',
      location_status=coalesce(p_data->>'location_status','unverified'), google_place_id=p_data->>'google_place_id',
      active=coalesce((p_data->>'active')::boolean, false)
    where id=b.id returning * into b;
  else
    insert into public.businesses (name,category,description,address,area,city,state,pin,lat,lng,phone,email,website,
      open_time,close_time,weekly_hours,holidays,amenities,booking_policy,cancellation_hours,photos,image_url,cover_url,logo_url,
      location_status,google_place_id,active,rating,review_count,owner_user_id,owner_email)
    values (p_data->>'name',p_data->>'category',p_data->>'description',p_data->>'address',p_data->>'area',p_data->>'city',p_data->>'state',p_data->>'pin',
      (p_data->>'lat')::double precision,(p_data->>'lng')::double precision,p_data->>'phone',p_data->>'email',p_data->>'website',
      p_data->>'open_time',p_data->>'close_time',coalesce(p_data->'weekly_hours','{}'::jsonb),coalesce(p_data->'holidays','[]'::jsonb),
      coalesce(p_data->'amenities','[]'::jsonb),p_data->>'booking_policy',coalesce((p_data->>'cancellation_hours')::integer,0),photo_list,photo_list->>0,photo_list->>0,p_data->>'logo_url',
      coalesce(p_data->>'location_status','unverified'),p_data->>'google_place_id',coalesce((p_data->>'active')::boolean,false),0,0,p_owner,p_email)
    returning * into b;
    for svc in select * from jsonb_array_elements(coalesce(p_data->'services','[]'::jsonb)) loop
      insert into public.business_services(business_id,name,description,duration_min,price,image_url)
      values(b.id,svc->>'name',svc->>'description',(svc->>'duration_min')::int,(svc->>'price')::numeric,svc->>'image_url');
    end loop;
    for member in select * from jsonb_array_elements(coalesce(p_data->'staff','[]'::jsonb)) loop
      insert into public.business_staff(business_id,name,role) values(b.id,member->>'name',member->>'role');
    end loop;
  end if;
  insert into public.profiles(id,email,full_name,role) values(p_owner,p_email,p_owner_name,'admin')
    on conflict(id) do update set role='admin';
  return to_jsonb(b);
end $$;
revoke all on function public.save_owned_business(uuid,text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_owned_business(uuid,text,text,bigint,jsonb) to service_role;

-- Only NEW reservations are placed in this guard table. Existing overlapping
-- historical rows remain untouched. The function below checks both historical
-- bookings and these guarded reservations while holding the business row lock.
create extension if not exists btree_gist;
create table if not exists public.booking_allocations (
  booking_id bigint primary key references public.bookings(id) on delete cascade,
  business_id bigint not null references public.businesses(id),
  staff_key bigint not null default 0,
  period tstzrange not null,
  constraint booking_allocations_no_overlap exclude using gist
    (business_id with =, staff_key with =, period with &&)
);
alter table public.booking_allocations enable row level security;
drop policy if exists "booking_allocations_service_only" on public.booking_allocations;
create policy "booking_allocations_service_only" on public.booking_allocations for all
  using (auth.role()='service_role') with check (auth.role()='service_role');

-- Releasing a cancellation frees the slot; a reschedule updates the same
-- exclusion-protected interval (and fails atomically on conflict).
create or replace function public.sync_booking_allocation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelled','no_show') then
    delete from public.booking_allocations where booking_id=new.id;
  else
    update public.booking_allocations set period=tstzrange(new.start_time,new.end_time,'[)') where booking_id=new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_booking_allocation on public.bookings;
create trigger sync_booking_allocation after update of status,start_time,end_time on public.bookings
  for each row execute function public.sync_booking_allocation();

-- Authoritative opening-hour check, shared by create/reschedule. Business
-- time is always India time, with date-specific holidays and weekly closures.
create or replace function public.business_accepts_time(b public.businesses, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql stable set search_path = public as $$
declare
  wall_start timestamp := p_start at time zone 'Asia/Kolkata';
  wall_end timestamp := p_end at time zone 'Asia/Kolkata';
  key text := lower(to_char(wall_start, 'Dy'));
  day_hours jsonb;
  opens time;
  closes time;
begin
  if p_start <= now() or wall_start::date <> wall_end::date then return false; end if;
  if coalesce(b.holidays,'[]'::jsonb) @> jsonb_build_array(wall_start::date::text) then return false; end if;
  day_hours := coalesce(b.weekly_hours,'{}'::jsonb)->key;
  if day_hours is not null and coalesce((day_hours->>'closed')::boolean,false) then return false; end if;
  opens := coalesce(nullif(day_hours->>'open',''),nullif(b.open_time,''),'09:00')::time;
  closes := coalesce(nullif(day_hours->>'close',''),nullif(b.close_time,''),'20:00')::time;
  return wall_start::time >= opens and wall_end::time <= closes
    and extract(second from wall_start)=0
    and (extract(epoch from (wall_start::time - opens))::integer % 1800)=0;
exception when others then return false;
end $$;
revoke all on function public.business_accepts_time(public.businesses,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.business_accepts_time(public.businesses,timestamptz,timestamptz) to service_role;

-- One business-row lock serializes capacity selection, including 'any staff',
-- across all serverless instances. The GiST constraint is a second line of
-- defence. A confirmed ticket can only be minted after this transaction commits.
create or replace function public.reserve_business_slot(
  p_business_id bigint, p_service_id bigint, p_staff_id bigint, p_customer_id uuid,
  p_customer_name text, p_customer_email text, p_notes text, p_start timestamptz,
  p_ref text, p_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  b public.businesses%rowtype;
  s public.business_services%rowtype;
  assigned public.business_staff%rowtype;
  bk public.bookings%rowtype;
  candidate public.business_staff%rowtype;
  finish timestamptz;
  has_roster boolean;
begin
  select * into b from public.businesses where id=p_business_id and active=true for update;
  if not found then raise exception 'Business is not available' using errcode='P0002'; end if;
  if p_idempotency_key is not null then
    select * into bk from public.bookings where customer_id=p_customer_id and idempotency_key=p_idempotency_key;
    if found then
      if bk.resource_id is distinct from p_business_id or bk.service_id is distinct from p_service_id or bk.start_time is distinct from p_start
         or (p_staff_id is not null and bk.staff_id is distinct from p_staff_id) or bk.status <> 'confirmed' then
        raise exception 'Booking retry does not match the original reservation' using errcode='23505';
      end if;
      return jsonb_build_object('booking',to_jsonb(bk),'business',to_jsonb(b),'invoice',(select to_jsonb(i) from public.invoices i where i.booking_id=bk.id limit 1),'replayed',true);
    end if;
  end if;
  select * into s from public.business_services where id=p_service_id and business_id=b.id and active=true;
  if not found then raise exception 'Service is not available' using errcode='P0002'; end if;
  finish := p_start + make_interval(mins => s.duration_min);
  if not public.business_accepts_time(b,p_start,finish) then raise exception 'Selected time is outside available business hours' using errcode='P0001'; end if;
  select exists(select 1 from public.business_staff where business_id=b.id and active=true) into has_roster;
  if p_staff_id is not null and not exists(select 1 from public.business_staff where id=p_staff_id and business_id=b.id and active=true) then
    raise exception 'Specialist is not available for this business' using errcode='P0002';
  end if;
  if has_roster then
    for candidate in select * from public.business_staff where business_id=b.id and active=true and (p_staff_id is null or id=p_staff_id) order by id loop
      if not exists (
        select 1 from public.bookings x where (x.resource_id=b.id or (x.resource_id is null and x.resource_name=b.name))
        and x.status in ('pending','confirmed','checked_in','in_progress','completed') and x.start_time<finish and x.end_time>p_start
        and (x.staff_id=candidate.id or (x.staff_id is null and (x.employee_name is null or lower(x.employee_name)=lower(candidate.name))))
      ) then assigned := candidate; exit; end if;
    end loop;
    if assigned.id is null then raise exception 'That slot was just taken. Please pick another time.' using errcode='23P01'; end if;
  else
    if p_staff_id is not null or exists (
      select 1 from public.bookings x where (x.resource_id=b.id or (x.resource_id is null and x.resource_name=b.name))
      and x.status in ('pending','confirmed','checked_in','in_progress','completed') and x.start_time<finish and x.end_time>p_start
    ) then raise exception 'That slot was just taken. Please pick another time.' using errcode='23P01'; end if;
  end if;
  insert into public.bookings(ref,customer_id,customer_name,customer_email,service_id,service_name,staff_id,employee_name,
    resource_id,resource_name,start_time,end_time,status,price,price_breakdown,location,notes,idempotency_key)
  values(p_ref,p_customer_id,p_customer_name,p_customer_email,s.id,s.name,assigned.id,assigned.name,b.id,b.name,p_start,finish,
    'confirmed',s.price,jsonb_build_array(jsonb_build_object('k',s.name,'v',s.price)),b.address,p_notes,p_idempotency_key)
  returning * into bk;
  insert into public.booking_allocations(booking_id,business_id,staff_key,period)
    values(bk.id,b.id,coalesce(assigned.id,0),tstzrange(p_start,finish,'[)'));
  insert into public.invoices(number,booking_id,booking_ref,customer_name,customer_email,amount,tax,total,status,line_items)
    values('INV-' || bk.ref,bk.id,bk.ref,p_customer_name,p_customer_email,s.price,0,s.price,'issued',
      jsonb_build_array(jsonb_build_object('desc',s.name,'qty',1,'price',s.price)));
  insert into public.booking_history(booking_id,action,detail,actor) values(bk.id,'created','Booking confirmed',p_customer_email);
  insert into public.notifications(user_id,audience,title,body,type,booking_ref) values
    (p_customer_id,'customer','Booking confirmed',s.name || ' at ' || b.name || ' — ' || bk.ref,'success',bk.ref),
    (b.owner_user_id,'admin','New booking',bk.ref || ' · ' || s.name,'info',bk.ref);
  return jsonb_build_object('booking',to_jsonb(bk),'business',to_jsonb(b),'invoice',(select to_jsonb(i) from public.invoices i where i.booking_id=bk.id limit 1),'replayed',false);
end $$;
revoke all on function public.reserve_business_slot(bigint,bigint,bigint,uuid,text,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.reserve_business_slot(bigint,bigint,bigint,uuid,text,text,text,timestamptz,text,text) to service_role;

-- Atomic reschedule rechecks opening hours and legacy rows as well as the
-- allocation exclusion constraint. Old tickets are refreshed by the API.
create or replace function public.reschedule_business_slot(p_booking_id bigint, p_start timestamptz)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bk public.bookings%rowtype; b public.businesses%rowtype; finish timestamptz;
begin
  select * into bk from public.bookings where id=p_booking_id;
  if not found then raise exception 'Booking not found' using errcode='P0002'; end if;
  select * into b from public.businesses where id=bk.resource_id and active=true for update;
  if not found then raise exception 'Business is not available' using errcode='P0002'; end if;
  select * into bk from public.bookings where id=p_booking_id for update;
  if bk.status not in ('pending','confirmed') then raise exception 'This booking cannot be rescheduled' using errcode='P0001'; end if;
  finish := p_start + (bk.end_time-bk.start_time);
  if not public.business_accepts_time(b,p_start,finish) then raise exception 'Selected time is outside available business hours' using errcode='P0001'; end if;
  if exists(select 1 from public.bookings x where x.id<>bk.id and (x.resource_id=b.id or (x.resource_id is null and x.resource_name=b.name))
    and x.status in ('pending','confirmed','checked_in','in_progress','completed') and x.start_time<finish and x.end_time>p_start
    and (bk.staff_id is null or x.staff_id=bk.staff_id or (x.staff_id is null and (x.employee_name is null or lower(x.employee_name)=lower(bk.employee_name))))) then
    raise exception 'That slot was just taken. Please pick another time.' using errcode='23P01';
  end if;
  update public.bookings set start_time=p_start,end_time=finish,updated_at=now() where id=bk.id returning * into bk;
  return to_jsonb(bk);
end $$;
revoke all on function public.reschedule_business_slot(bigint,timestamptz) from public, anon, authenticated;
grant execute on function public.reschedule_business_slot(bigint,timestamptz) to service_role;


-- ============================================================================
-- Post-apply sanity check (read-only). Should return 14 tables.
-- ============================================================================
select count(*) as velora_tables
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles','businesses','business_services','business_staff','bookings',
    'booking_meta','booking_history','reminders','notifications','recently_viewed',
    'email_log','audit_logs','idempotency_keys','invoices'
  );
