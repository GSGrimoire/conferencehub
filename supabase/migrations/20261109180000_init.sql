-- ConferenceHub – Supabase/Postgres-skema, version 1 (pilot)
-- Scope: plastik- og rekonstruktiv kirurgi.
-- Konferencedata er offentlige. Deltagelse styres af brugerens "Vis aktivitet":
--   all   = alle indloggede brugere kan se den
--   group = kun medlemmer af mine grupper (default)
--   none  = kun mig selv

create type activity_visibility as enum ('all', 'group', 'none');
create type edition_status as enum ('announced', 'confirmed', 'cancelled');
create type attendance_status as enum ('going', 'considering', 'abstract_submitted');
create type change_status as enum ('pending', 'approved', 'rejected');
create type member_role as enum ('admin', 'member');
create type user_role as enum ('doctor', 'nurse', 'other');

-- ---------------------------------------------------------------- konferencedata
create table series (
  id                text primary key,            -- fx 'dspr-efteraarsmoede'
  name              text not null,
  short_name        text,
  organiser         text,
  topics            text[] not null default '{}',
  frequency         text,                        -- fx 'årlig', 'hvert andet år'
  official_domains  text[] not null default '{}'
);

create table editions (
  id                     text primary key,       -- fx 'dspr-efteraarsmoede-2026'; aendres aldrig
  series_id              text not null references series(id),
  name                   text not null,
  topic                  text,
  start_date             date not null,
  end_date               date,
  venue                  text,
  abstract_deadline      date,
  early_bird_deadline    date,
  registration_deadline  date,
  deadline_notes         jsonb not null default '{}',
  links                  jsonb not null default '[]',  -- [{label, url}]
  note                   text,
  status                 edition_status not null default 'confirmed',
  last_verified_at       timestamptz,
  updated_at             timestamptz not null default now()
);

create table evidence (
  id          bigint generated always as identity primary key,
  edition_id  text not null references editions(id) on delete cascade,
  field       text not null,
  value       text,
  source_url  text not null,
  quote       text not null,                     -- ordret citat fra kilden
  fetched_at  timestamptz not null default now()
);

create table watch_targets (
  id              bigint generated always as identity primary key,
  url             text not null unique,
  edition_id      text references editions(id) on delete cascade,
  series_id       text references series(id) on delete cascade,
  kind            text not null,                 -- dates | abstracts | registration | programme | society_calendar
  fetch_mode      text not null default 'html',  -- html | browser | pdf
  last_hash       text,
  last_checked_at timestamptz,
  last_changed_at timestamptz,
  interval_hours  int not null default 24,
  fail_count      int not null default 0
);

create table proposed_changes (
  id          bigint generated always as identity primary key,
  edition_id  text not null references editions(id) on delete cascade,
  field       text not null,
  old_value   text,
  new_value   text,
  source_url  text not null,
  quote       text not null,
  status      change_status not null default 'pending',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- brugere og grupper
create table profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null,
  role                 user_role,
  activity_visibility  activity_visibility not null default 'group',
  calendar_token       uuid not null default gen_random_uuid(),  -- hemmelig adresse til .ics-feed
  is_site_admin        boolean not null default false,
  created_at           timestamptz not null default now()
);

create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                   -- fx 'Herlev Plastik'
  invite_code   text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  email_domain  text,                            -- valgfrit, fx 'regionh.dk'
  created_at    timestamptz not null default now()
);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table attendance (
  user_id     uuid not null references profiles(id) on delete cascade,
  edition_id  text not null references editions(id) on delete cascade,
  status      attendance_status not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, edition_id)
);

create table follows (
  user_id    uuid not null references profiles(id) on delete cascade,
  series_id  text not null references series(id) on delete cascade,
  primary key (user_id, series_id)
);

create table suggestions (
  id          bigint generated always as identity primary key,
  user_id     uuid references profiles(id) on delete set null,
  name        text,
  url         text,
  note        text,
  status      change_status not null default 'pending',
  created_at  timestamptz not null default now(),
  check (name is not null or url is not null)
);

-- ---------------------------------------------------------------- hjaelpefunktioner
create function shares_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members x join group_members y using (group_id)
    where x.user_id = a and y.user_id = b
  );
$$;

create function is_site_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_site_admin from profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------- rækkesikkerhed
alter table series           enable row level security;
alter table editions         enable row level security;
alter table evidence         enable row level security;
alter table watch_targets    enable row level security;
alter table proposed_changes enable row level security;
alter table profiles         enable row level security;
alter table groups           enable row level security;
alter table group_members    enable row level security;
alter table attendance       enable row level security;
alter table follows          enable row level security;
alter table suggestions      enable row level security;

-- Konferencedata: alle kan læse; kun admin skriver (synkroniseringen bruger service-nøglen).
create policy "series read"   on series   for select using (true);
create policy "editions read" on editions for select using (true);
create policy "evidence read" on evidence for select using (true);
create policy "watch admin"   on watch_targets    for all using (is_site_admin());
create policy "changes admin" on proposed_changes for all using (is_site_admin());

-- Profiler: man ser sig selv og dem, hvis aktivitet man må se.
create policy "profiles read" on profiles for select using (
  id = auth.uid()
  or activity_visibility = 'all'
  or (activity_visibility = 'group' and shares_group(id, auth.uid()))
);
create policy "profiles own" on profiles for update using (id = auth.uid());
create policy "profiles insert own" on profiles for insert with check (id = auth.uid());

-- Grupper: medlemmer ser deres grupper; indmeldelse sker via en funktion med invitationskoden.
create policy "groups read" on groups for select using (
  exists (select 1 from group_members m where m.group_id = groups.id and m.user_id = auth.uid())
  or is_site_admin()
);
create policy "members read" on group_members for select using (
  user_id = auth.uid() or shares_group(user_id, auth.uid())
);
create policy "members leave" on group_members for delete using (user_id = auth.uid());

-- Deltagelse: synlighed følger ejerens "Vis aktivitet".
create policy "attendance read" on attendance for select using (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p where p.id = attendance.user_id and (
      p.activity_visibility = 'all'
      or (p.activity_visibility = 'group' and shares_group(p.id, auth.uid()))
    )
  )
);
create policy "attendance own" on attendance for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "follows own" on follows for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "suggestions insert" on suggestions for insert with check (user_id = auth.uid());
create policy "suggestions read own" on suggestions for select using (user_id = auth.uid() or is_site_admin());

create function join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select id into g from groups where invite_code = code;
  if g is null then raise exception 'Ugyldig invitationskode'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end;
$$;

