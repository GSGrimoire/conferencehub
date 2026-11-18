-- ConferenceHub: kontrol før "Slet min konto" går live (issue #1).
-- Kun læsning: ændrer intet og viser ingen brugerdata, kun skema og rettigheder.
-- Kør i Supabase → SQL Editor i det projekt, ConferenceHub bruger, og kopiér hele resultatet.
select '1 auth.users ejer' as punkt, pg_get_userbyid(c.relowner)::text as svar
  from pg_class c where c.oid = 'auth.users'::regclass
union all
select '2 postgres må slette i auth.users', has_table_privilege('postgres', 'auth.users', 'DELETE')::text
union all
select '3 SQL-editoren kører som', current_user::text
union all
select '4 fremmednøgle til auth.users',
       conrelid::regclass::text || ' (' || confdeltype::text || ')'
  from pg_constraint where confrelid = 'auth.users'::regclass and contype = 'f'
union all
select '5 trigger på auth.users', tgname::text || ': ' || tgfoid::regproc::text
  from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal
union all
select '6 tabel i public', c.relname::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
union all
select '7 delete_my_account findes', (to_regprocedure('public.delete_my_account()') is not null)::text
union all
select '8 antal konti', count(*)::text from auth.users
order by 1, 2;
-- Fremmednøglens bogstav: c = slettes med, n = sættes til tom, a/r = blokerer sletningen.
