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
