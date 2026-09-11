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
