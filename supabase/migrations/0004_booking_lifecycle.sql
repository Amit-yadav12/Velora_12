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
