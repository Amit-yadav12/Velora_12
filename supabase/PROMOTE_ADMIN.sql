-- ============================================================================
-- Velora AI OS — PROMOTE_ADMIN.sql
-- Grants the business-console role to ONE account.
--
-- Run this in the Supabase SQL Editor AFTER supabase/APPLY_ALL.sql.
-- Idempotent: safe to re-run. Paste the whole file and press RUN.
--
-- 1. Change the email in the `admin_email` assignment below.
-- 2. That account must have signed up in the app at least once (it needs an
--    auth.users row). If it has not, sign up first and re-run this file — the
--    script tells you which case you are in instead of failing silently.
--
-- WHY THE TRIGGER PLUMBING BELOW EXISTS
--   Migration 0002 installs `protect_profile_role`, which rejects any role
--   change made by a non-service_role session. The SQL Editor does not run as
--   service_role, so a plain UPDATE ... SET role='admin' raises
--   "profile role cannot be changed from the client". The block below declares
--   the service-role JWT claims AND disables the trigger for the duration of
--   the update, so it works regardless of which Supabase `auth.role()`
--   definition the project uses. The trigger is re-enabled immediately.
-- ============================================================================

begin;

-- Present as the service role for anything that inspects the JWT claims.
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  admin_email text := 'admin@velora.ai';   -- <<< CHANGE THIS
  uid uuid;
  found int;
begin
  select u.id into uid
  from auth.users u
  where lower(u.email) = lower(admin_email)
  limit 1;

  if uid is null then
    raise notice 'NOT PROMOTED: % has no auth user yet. Sign up in the app with that email, then re-run this file.', admin_email;
    return;
  end if;

  -- The role-lock trigger only guards UPDATEs; a fresh insert is unaffected.
  -- Disable it for the update path so this works on every Supabase version.
  alter table public.profiles disable trigger protect_profile_role;

  insert into public.profiles (id, email, full_name, role)
  values (
    uid,
    admin_email,
    coalesce(
      (select raw_user_meta_data ->> 'full_name' from auth.users where id = uid),
      split_part(admin_email, '@', 1)
    ),
    'admin'
  )
  on conflict (id) do update
    set role = 'admin',
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  alter table public.profiles enable trigger protect_profile_role;

  select count(*) into found
  from public.profiles p
  where p.id = uid and p.role = 'admin';

  if found = 1 then
    raise notice 'OK: admin role granted to %', admin_email;
  else
    raise warning 'UNEXPECTED: the update ran but % is still not admin — check RLS on public.profiles.', admin_email;
  end if;
end $$;

commit;

-- Verify: this row must show role = admin.
select email, role, created_at
from public.profiles
where role = 'admin'
order by created_at;
