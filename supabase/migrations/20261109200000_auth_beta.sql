-- ConferenceHub beta: login, profiler, grupper, deltagelse og forslag.

-- ---------------------------------------------------------------- profil oprettes ved første login
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- stram rettighederne
-- Brugere må kun ændre navn, rolle og "Vis aktivitet" på deres egen profil,
-- aldrig is_site_admin eller calendar_token, og profiler oprettes kun af triggeren.
drop policy if exists "profiles insert own" on profiles;
revoke insert, update, delete on profiles from anon, authenticated;
grant update (display_name, role, activity_visibility) on profiles to authenticated;

-- Grupper oprettes og joines kun via funktionerne nedenfor.
revoke insert, update, delete on groups from anon, authenticated;
revoke insert, update on group_members from anon, authenticated;

-- Forslag: brugeren udfylder kun navn, link og note; status styres af admin.
revoke insert, update, delete on suggestions from anon, authenticated;
grant insert (user_id, name, url, note) on suggestions to authenticated;

-- Konferencedata skrives kun af synkroniseringen (secret key omgår RLS).
revoke insert, update, delete on series, editions, evidence, watch_targets, proposed_changes from anon, authenticated;

-- Anonyme brugere må kun læse konferencedata.
revoke all on profiles, groups, group_members, attendance, follows, suggestions from anon;

-- ---------------------------------------------------------------- grupper
create function create_group(group_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Log ind for at oprette en gruppe'; end if;
  if length(trim(coalesce(group_name, ''))) < 2 then raise exception 'Giv gruppen et navn'; end if;
  insert into groups (name) values (trim(group_name)) returning id into g;
  insert into group_members (group_id, user_id, role) values (g, auth.uid(), 'admin');
  return g;
end;
$$;

-- join_group findes fra init-migrationen; kræv login og trim koden.
create or replace function join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'Log ind for at blive medlem'; end if;
  select id into g from groups where invite_code = trim(code);
  if g is null then raise exception 'Ugyldig invitationskode'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end;
$$;

-- Gruppe-admin kan fjerne medlemmer.
create policy "members removed by admin" on group_members for delete using (
  exists (select 1 from group_members a where a.group_id = group_members.group_id and a.user_id = auth.uid() and a.role = 'admin')
);

revoke execute on function create_group(text), join_group(text) from anon;
grant execute on function create_group(text), join_group(text) to authenticated;
