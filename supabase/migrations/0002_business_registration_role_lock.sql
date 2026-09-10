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
