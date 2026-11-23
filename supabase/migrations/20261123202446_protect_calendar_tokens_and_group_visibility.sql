begin;

create schema conferencehub_private;
revoke all on schema conferencehub_private from public, anon, authenticated;
grant usage on schema conferencehub_private to authenticated;

-- Profile visibility does not confer access to calendar credentials.
create table public.calendar_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null default gen_random_uuid()
);
alter table public.calendar_tokens enable row level security;
revoke all on public.calendar_tokens from public, anon, authenticated;
grant select on public.calendar_tokens to authenticated;
grant select, insert, update, delete on public.calendar_tokens to service_role;
create policy "calendar token owner reads" on public.calendar_tokens
  for select to authenticated using (user_id = (select auth.uid()));

insert into public.calendar_tokens (user_id, token)
select id, calendar_token from public.profiles;
alter table public.profiles drop column calendar_token;

create function conferencehub_private.create_calendar_token() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.calendar_tokens (user_id) values (new.id);
  return new;
end;
$$;
revoke execute on function conferencehub_private.create_calendar_token() from public, anon, authenticated;
create trigger profile_calendar_token
  after insert on public.profiles
  for each row execute function conferencehub_private.create_calendar_token();

-- The viewer always comes from the current session. These helpers serve row policies
-- and live outside the schemas exposed by the Supabase Data API.
create function conferencehub_private.shares_group_with(other_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members viewer
    join public.group_members colleague using (group_id)
    where viewer.user_id = (select auth.uid()) and colleague.user_id = other_user
  );
$$;

create function conferencehub_private.group_role(target_group uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.group_members
  where group_id = target_group and user_id = (select auth.uid());
$$;

create function conferencehub_private.is_site_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_site_admin from public.profiles where id = (select auth.uid())), false);
$$;

revoke execute on function
  conferencehub_private.shares_group_with(uuid),
  conferencehub_private.group_role(uuid),
  conferencehub_private.is_site_admin()
from public, anon, authenticated;
grant execute on function
  conferencehub_private.shares_group_with(uuid),
  conferencehub_private.group_role(uuid),
  conferencehub_private.is_site_admin()
to authenticated;

alter policy "profiles read" on public.profiles to authenticated using (
  id = (select auth.uid())
  or activity_visibility = 'all'
  or (activity_visibility = 'group' and conferencehub_private.shares_group_with(id))
);
alter policy "attendance read" on public.attendance to authenticated using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p where p.id = attendance.user_id and (
      p.activity_visibility = 'all'
      or (p.activity_visibility = 'group' and conferencehub_private.shares_group_with(p.id))
    )
  )
);

alter policy "groups read" on public.groups to authenticated using (
  conferencehub_private.group_role(id) is not null or (select conferencehub_private.is_site_admin())
);
alter policy "members read" on public.group_members to authenticated using (
  conferencehub_private.group_role(group_id) is not null
);
alter policy "members removed by admin" on public.group_members to authenticated using (
  conferencehub_private.group_role(group_id) = 'admin'
);

alter policy "watch admin" on public.watch_targets to authenticated
  using ((select conferencehub_private.is_site_admin()));
alter policy "changes admin" on public.proposed_changes to authenticated
  using ((select conferencehub_private.is_site_admin()));
alter policy "suggestions read own" on public.suggestions to authenticated using (
  user_id = (select auth.uid()) or (select conferencehub_private.is_site_admin())
);

drop function public.shares_group(uuid, uuid);
drop function public.is_site_admin();
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.create_group(text), public.join_group(text) from public, anon;
grant execute on function public.create_group(text), public.join_group(text) to authenticated;

commit;
