-- ConferenceHub: "Slet min konto" (GDPR: retten til sletning).
-- En indlogget bruger kan kun slette sig selv. Sletningen fjerner login (auth.users),
-- profil, gruppemedlemskaber, deltagelse og fulgte serier (on delete cascade).
-- Forslag beholdes uden afsender (on delete set null).
-- Grupper: er brugeren eneste admin, bliver det længst siddende medlem admin;
-- er brugeren eneste medlem, slettes gruppen med sin invitationskode.

create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  g record;
  heir uuid;
begin
  if me is null then
    raise exception 'Log ind for at slette din konto';
  end if;

  -- Serialize membership changes and simultaneous account deletions per group.
  for g in
    select gm.group_id
    from public.group_members gm
    join public.groups grp on grp.id = gm.group_id
    where gm.user_id = me
    order by gm.group_id
    for update of grp
  loop
    if not exists (select 1 from public.group_members o where o.group_id = g.group_id and o.user_id <> me) then
      delete from public.groups where id = g.group_id;
    elsif not exists (
      select 1 from public.group_members a
      where a.group_id = g.group_id and a.user_id <> me and a.role = 'admin'
    ) then
      select o.user_id into heir from public.group_members o
      where o.group_id = g.group_id and o.user_id <> me
      order by o.joined_at, o.user_id limit 1;
      update public.group_members set role = 'admin' where group_id = g.group_id and user_id = heir;
    end if;
  end loop;

  delete from auth.users where id = me;
end;
$$;

-- Revoke the default PUBLIC EXECUTE privilege on this function only.
-- Avoid global changes to grants shared with other Supabase applications.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
