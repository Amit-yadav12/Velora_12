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
--     0001_velora_core.sql                     14 tables, RLS, realtime, triggers
--     0002_business_registration_role_lock.sql ownership columns + role-lock trigger
--     0003_rls_tightening.sql                  removes the permissive anon policies
--   Order matters: 0001 drops and recreates every policy in public, so 0003
--   MUST run after it or the tightening is lost.
--
-- Idempotent: safe to re-run, and safe against a partially-migrated project.
-- GENERATED from the migration files by scripts/build-sql.mjs — edit the
-- migrations, not this file (verify:integrations fails if they drift).
-- ============================================================================

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
