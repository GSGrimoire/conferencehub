begin;

create table conferencehub_private.group_creators (
  group_id uuid primary key references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade
);
create index group_creators_user_idx on conferencehub_private.group_creators (user_id);

-- Existing rows have no recorded creator. Attribute them to the longest-standing current admin.
insert into conferencehub_private.group_creators (group_id, user_id)
select distinct on (group_id) group_id, user_id
from public.group_members where role = 'admin'
order by group_id, joined_at, user_id;

create table conferencehub_private.group_creation_lock (
  singleton boolean primary key default true check (singleton),
  last_write timestamptz not null default now()
);
insert into conferencehub_private.group_creation_lock default values;

create or replace function public.create_group(group_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  clean_name text := btrim(coalesce(group_name, ''));
  new_group uuid;
begin
  if viewer is null then
    raise exception 'Log ind for at oprette en gruppe';
  end if;
  if char_length(clean_name) not between 2 and 80 then
    raise exception 'Gruppenavnet skal være på 2 til 80 tegn';
  end if;

  -- Hold a write lock to commit so simultaneous creations cannot share the last slot.
  update conferencehub_private.group_creation_lock set last_write = clock_timestamp();
  if (select count(*) from conferencehub_private.group_creators where user_id = viewer) >= 10 then
    raise exception 'Du kan højst oprette 10 aktive grupper';
  end if;
  if (select count(*) from public.groups) >= 250 then
    raise exception 'Der kan ikke oprettes flere grupper lige nu';
  end if;

  insert into public.groups (name) values (clean_name) returning id into new_group;
  insert into public.group_members (group_id, user_id, role) values (new_group, viewer, 'admin');
  insert into conferencehub_private.group_creators (group_id, user_id) values (new_group, viewer);
  return new_group;
end;
$$;

create table conferencehub_private.suggestion_daily_total (
  singleton boolean primary key default true check (singleton),
  day date not null,
  used integer not null check (used between 1 and 100)
);
create table conferencehub_private.suggestion_daily_by_user (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  day date not null,
  used integer not null check (used between 1 and 5)
);

-- Existing records are retained. The constraint applies to future writes.
alter table public.suggestions add constraint suggestions_input_limits check (
  (nullif(btrim(name), '') is not null or nullif(btrim(url), '') is not null)
  and (name is null or char_length(name) <= 200)
  and (url is null or (char_length(url) <= 2048 and url ~* '^https?://[^/?#[:space:]]+[^[:space:]]*$'))
  and (note is null or char_length(note) <= 1000)
) not valid;

create function conferencehub_private.limit_suggestion_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  viewer uuid := auth.uid();
  utc_day date := (statement_timestamp() at time zone 'UTC')::date;
begin
  if viewer is null or new.user_id is distinct from viewer then
    raise exception using errcode = '42501', message = 'Log ind for at sende dit eget forslag';
  end if;

  insert into conferencehub_private.suggestion_daily_total as budget (day, used)
    values (utc_day, 1)
    on conflict (singleton) do update set
      used = case when budget.day = utc_day then budget.used + 1 else 1 end,
      day = utc_day
    where budget.day < utc_day or (budget.day = utc_day and budget.used < 100);
  if not found then
    raise exception 'Der kan ikke sendes flere forslag i dag';
  end if;

  insert into conferencehub_private.suggestion_daily_by_user as budget (user_id, day, used)
    values (viewer, utc_day, 1)
    on conflict (user_id) do update set
      used = case when budget.day = utc_day then budget.used + 1 else 1 end,
      day = utc_day
    where budget.day < utc_day or (budget.day = utc_day and budget.used < 5);
  if not found then
    raise exception 'Du kan højst sende fem forslag pr. dag';
  end if;
  return new;
end;
$$;
revoke execute on function conferencehub_private.limit_suggestion_write() from public, anon, authenticated;
create trigger suggestions_write_limit
  before insert on public.suggestions
  for each row execute function conferencehub_private.limit_suggestion_write();

commit;
