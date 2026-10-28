-- College Event Management and Registration System
-- Run this entire file in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  email text not null unique,
  password_hash text not null,
  role text not null default 'student' check (role in ('student','admin')),
  student_id text,
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  category text not null check (category in ('Technology','Cultural','Sports','Workshop','Other')),
  description text not null check (char_length(description) between 5 and 1000),
  event_date timestamptz not null,
  venue text not null check (char_length(venue) between 2 and 160),
  capacity integer not null check (capacity between 1 and 10000),
  fee numeric(10,2) not null default 0 check (fee between 0 and 100000),
  status text not null default 'published' check (status in ('published','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at timestamptz not null default now(),
  unique (event_id, student_id)
);

create index if not exists events_date_status_idx on public.events(status,event_date);
create index if not exists registrations_student_idx on public.registrations(student_id,created_at desc);
create index if not exists registrations_event_status_idx on public.registrations(event_id,status);

-- Prevent an administrator from lowering capacity below current confirmed registrations.
create or replace function public.check_event_capacity()
returns trigger language plpgsql as $$
declare v_count integer;
begin
  select count(*) into v_count from public.registrations where event_id = new.id and status = 'confirmed';
  if new.capacity < v_count then raise exception 'CAPACITY_BELOW_REGISTERED_COUNT'; end if;
  return new;
end; $$;
drop trigger if exists events_check_capacity on public.events;
create trigger events_check_capacity before update of capacity on public.events for each row execute function public.check_event_capacity();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events for each row execute function public.set_updated_at();

-- Atomic capacity check and registration: concurrent requests cannot overbook an event.
create or replace function public.register_for_event(p_event_id uuid, p_student_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_event public.events%rowtype; v_registration public.registrations%rowtype; v_count integer;
begin
  select * into v_event from public.events where id=p_event_id for update;
  if not found or v_event.status <> 'published' then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.event_date <= now() then raise exception 'EVENT_CLOSED'; end if;
  if exists(select 1 from public.registrations where event_id=p_event_id and student_id=p_student_id and status='confirmed') then raise exception 'ALREADY_REGISTERED'; end if;
  select count(*) into v_count from public.registrations where event_id=p_event_id and status='confirmed';
  if v_count >= v_event.capacity then raise exception 'EVENT_FULL'; end if;
  -- Reuse the unique row after a prior cancellation, preserving one row per student/event.
  insert into public.registrations(event_id,student_id,status) values(p_event_id,p_student_id,'confirmed')
  on conflict(event_id,student_id) do update set status='confirmed',created_at=now()
  returning * into v_registration;
  return jsonb_build_object('id',v_registration.id,'event_id',v_registration.event_id,'status',v_registration.status,'created_at',v_registration.created_at);
end; $$;

-- The application accesses tables through the trusted server key only.
-- RLS is enabled and no browser-facing policies are created, so anon/authenticated
-- clients cannot read or modify these tables directly. The server must enforce roles.
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
revoke all on public.profiles from anon, authenticated;
revoke all on public.events from anon, authenticated;
revoke all on public.registrations from anon, authenticated;
revoke execute on function public.register_for_event(uuid,uuid) from public, anon, authenticated;
grant execute on function public.register_for_event(uuid,uuid) to service_role;
