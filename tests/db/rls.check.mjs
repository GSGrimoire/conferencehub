// Databasetest: kører alle migrationer i Postgres (PGlite) med en efterligning af Supabase'
// auth-skema og roller, og tester "Slet min konto" og de vigtigste adgangsregler.
// Kører ikke med de almindelige tests, fordi PGlite ikke er en afhængighed i repo'et:
//
//   npm i --prefix /tmp/pglite @electric-sql/pglite
//   PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node tests/db/rls.check.mjs

import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";

const { PGlite } = await import(process.env.PGLITE || "@electric-sql/pglite");
const db = new PGlite();

// Supabase-lignende udgangspunkt: roller, auth.users, auth.uid() og standardrettigheder.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
const dir = new URL("../../supabase/migrations/", import.meta.url);
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(new URL(f, dir), "utf8"));
}

const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b", C = "00000000-0000-4000-8000-00000000000c";
await db.exec(`
  insert into series (id, name) values ('x', 'X');
  insert into editions (id, series_id, name, start_date) values ('x-2027', 'x', 'X 2027', '2027-06-01');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${A}', 'a@example.org', '{"full_name":"Anna"}'), ('${B}', 'b@example.org', '{}'), ('${C}', 'c@example.org', '{}');
`);

// Kør SQL som en bestemt bruger (eller anonym), som PostgREST gør det.
async function as(user, sql, params = []) {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user || ""]);
  try { return await db.query(sql, params); }
  finally { await db.exec("reset role"); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (user, sql, params) => (await as(user, sql, params)).rows[0];
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

// Opsætning: A er admin i G1 (med B) og alene i G2; A er medlem af C's gruppe G3.
const g1 = (await one(A, "select create_group('Herlev Plastik') as id")).id;
const g2 = (await one(A, "select create_group('Kun Anna') as id")).id;
const g3 = (await one(C, "select create_group('Cs gruppe') as id")).id;
const code = async (g) => (await rows("select invite_code from groups where id = $1", [g]))[0].invite_code;
await as(B, "select join_group($1)", [await code(g1)]);
await as(A, "select join_group($1)", [await code(g3)]);
await as(A, "insert into attendance (user_id, edition_id, status) values ($1, 'x-2027', 'going')", [A]);
await as(B, "insert into attendance (user_id, edition_id, status) values ($1, 'x-2027', 'considering')", [B]);
await as(A, "insert into suggestions (user_id, name, url, note) values ($1, 'Ny konference', 'https://example.org/ny', 'Skriv til anna@example.org')", [A]);
await as(B, "insert into suggestions (user_id, name, note) values ($1, 'Bs konference', 'Bs note')", [B]);

await check("profil oprettes af triggeren med navn fra Google", async () => {
  assert.equal((await rows("select display_name from profiles where id = $1", [A]))[0].display_name, "Anna");
});

await check("anonym kan ikke kalde delete_my_account", async () => {
  await assert.rejects(as(null, "select delete_my_account()"), /permission denied/);
});

await check("brugere kan ikke slette i auth.users direkte", async () => {
  await assert.rejects(as(B, "delete from auth.users where id = $1", [A]), /permission denied/);
});

await check("B kan ikke se eller ændre A's deltagelse ud over Vis aktivitet", async () => {
  await as(B, "delete from attendance where user_id = $1", [A]);
  assert.equal((await rows("select count(*)::int n from attendance where user_id = $1", [A]))[0].n, 1);
});

await check("A sletter sin konto: kun A forsvinder", async () => {
  await as(A, "select delete_my_account()");
  assert.equal((await rows("select count(*)::int n from auth.users where id = $1", [A]))[0].n, 0);
  for (const t of ["profiles where id", "attendance where user_id", "group_members where user_id", "follows where user_id"]) {
    assert.equal((await rows(`select count(*)::int n from ${t} = $1`, [A]))[0].n, 0, t);
  }
  assert.equal((await rows("select count(*)::int n from auth.users")).at(0).n, 2);
  assert.equal((await rows("select count(*)::int n from attendance where user_id = $1", [B]))[0].n, 1);
});

await check("grupper: B arver admin i G1, G2 slettes, G3 er uændret", async () => {
  assert.equal((await rows("select role from group_members where group_id = $1 and user_id = $2", [g1, B]))[0].role, "admin");
  assert.equal((await rows("select count(*)::int n from groups where id = $1", [g2]))[0].n, 0);
  assert.equal((await rows("select role from group_members where group_id = $1 and user_id = $2", [g3, C]))[0].role, "admin");
  assert.equal((await rows("select count(*)::int n from group_members where group_id = $1", [g3]))[0].n, 1);
});

await check("forslag beholdes uden afsender og uden note; andres forslag er uændrede", async () => {
  const s = await rows("select user_id, name, url, note from suggestions where name = 'Ny konference'");
  assert.equal(s.length, 1);
  assert.equal(s[0].user_id, null);
  assert.equal(s[0].note, null, "noten kan indeholde en mailadresse og skal være slettet");
  assert.equal(s[0].url, "https://example.org/ny");
  assert.equal((await rows("select count(*)::int n from suggestions where note like '%anna@example.org%'"))[0].n, 0);
  const b = await rows("select user_id, note from suggestions where name = 'Bs konference'");
  assert.deepEqual(b, [{ user_id: B, note: "Bs note" }]);
});

await check("indlogget uden bruger-id afvises", async () => {
  await db.exec("set role authenticated");
  await assert.rejects(db.query("select delete_my_account()"), /Log ind/);
  await db.exec("reset role");
});


// Ensure the function is callable by authenticated users only.
await check("EXECUTE-grants: authenticated ja, anon og PUBLIC nej", async () => {
  const p = await rows(`
    select has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE') as yes,
           has_function_privilege('anon', 'public.delete_my_account()', 'EXECUTE') as no,
           exists (select 1 from aclexplode(f.proacl) a
                   where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_grant,
           f.prosecdef as definer, f.proconfig as config
    from pg_proc f where f.oid = 'public.delete_my_account()'::regprocedure
  `);
  assert.equal(p[0].yes, true);
  assert.equal(p[0].no, false);
  assert.equal(p[0].public_grant, false);
  assert.equal(p[0].definer, true);
  assert.deepEqual(p[0].config, ['search_path=""']);
});

// Supabase gives every new function EXECUTE for anon by default. Each function anon can run
// must be listed here on purpose, so a new migration cannot open one by accident.
await check("anon kan kun køre funktioner på den bevidste liste", async () => {
  const allowed = [
    "create_group", "join_group", // kræver login: fejler med 'Log ind' uden auth.uid()
    "handle_new_user",            // triggerfunktion: kan ikke kaldes direkte
    "is_site_admin", "shares_group", // bruges i RLS-politikker; opfølgning: overvej at lukke for anon
  ].sort();
  const got = (await rows(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1
  `)).map((r) => r.proname);
  assert.deepEqual(got, allowed);
  await db.exec("create function public.ny_testfunktion() returns int language sql as 'select 1'");
  assert.equal((await rows("select has_function_privilege('anon', 'public.ny_testfunktion()', 'EXECUTE') as x"))[0].x, true,
    "efterligningen giver nye funktioner anon-EXECUTE som Supabase; derfor skal hver migration revoke");
  await db.exec("drop function public.ny_testfunktion()");
});

// A group with multiple remaining members: the oldest member inherits the role.
await check("gruppe med tre medlemmer: længst siddende bliver admin", async () => {
  const D = "00000000-0000-4000-8000-00000000000d";
  const E = "00000000-0000-4000-8000-00000000000e";
  const F = "00000000-0000-4000-8000-00000000000f";
  await db.exec(`
    insert into auth.users (id, email) values
      ('${D}', 'd@example.org'), ('${E}', 'e@example.org'), ('${F}', 'f@example.org');
  `);
  const g = (await one(D, "select create_group('Tre medlemmer') as id")).id;
  const invite = await code(g);
  await as(E, "select join_group($1)", [invite]);
  await as(F, "select join_group($1)", [invite]);
  await db.query("update group_members set joined_at = '2026-01-01' where group_id = $1 and user_id = $2", [g, E]);
  await db.query("update group_members set joined_at = '2026-02-01' where group_id = $1 and user_id = $2", [g, F]);
  await as(D, "select delete_my_account()");
  const members = await rows("select user_id, role from group_members where group_id = $1 order by user_id", [g]);
  assert.equal(members.length, 2);
  assert.equal(members.find(m => m.user_id === E).role, "admin");
  assert.equal(members.find(m => m.user_id === F).role, "member");
  assert.equal((await rows("select count(*)::int n from groups where id = $1", [g]))[0].n, 1);
});

// Flere gruppevarianter, gentagne kald, direkte skriveadgang og rollback.
const U = (n) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
await db.exec(`insert into auth.users (id, email) values ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `('${U(n)}', 'u${n}@example.org')`).join(", ")}`);
const member = async (g, u) => (await rows("select role from group_members where group_id = $1 and user_id = $2", [g, u]))[0]?.role;

await check("almindeligt medlem sletter sig: admin og gruppe er uændrede", async () => {
  const g = (await one(U(1), "select create_group('Medlem går') as id")).id;
  await as(U(2), "select join_group($1)", [await code(g)]);
  await as(U(2), "select delete_my_account()");
  assert.equal(await member(g, U(1)), "admin");
  assert.equal(await member(g, U(2)), undefined);
  assert.equal((await rows("select count(*)::int n from group_members where group_id = $1", [g]))[0].n, 1);
});

await check("flere admins: ingen ny admin udpeges", async () => {
  const g = (await one(U(3), "select create_group('To admins') as id")).id;
  const c = await code(g);
  await as(U(4), "select join_group($1)", [c]);
  await as(U(5), "select join_group($1)", [c]);
  await db.query("update group_members set role = 'admin' where group_id = $1 and user_id = $2", [g, U(5)]);
  await db.query("update group_members set joined_at = '2020-01-01' where group_id = $1 and user_id = $2", [g, U(4)]);
  await as(U(3), "select delete_my_account()");
  assert.equal(await member(g, U(5)), "admin");
  assert.equal(await member(g, U(4)), "member", "det ældste medlem bliver ikke admin, når der allerede er en");
});

await check("samme joined_at: laveste bruger-id arver deterministisk", async () => {
  const g = (await one(U(6), "select create_group('Uafgjort') as id")).id;
  const c = await code(g);
  await as(U(8), "select join_group($1)", [c]);
  await as(U(7), "select join_group($1)", [c]);
  await db.query("update group_members set joined_at = '2026-03-01' where group_id = $1 and user_id <> $2", [g, U(6)]);
  await as(U(6), "select delete_my_account()");
  assert.equal(await member(g, U(7)), "admin");
  assert.equal(await member(g, U(8)), "member");
});

await check("bruger uden grupper kan slette sig, og et gentaget kald rører ingen andre", async () => {
  const before = (await rows("select count(*)::int n from auth.users"))[0].n;
  await as(U(9), "select delete_my_account()");
  assert.equal((await rows("select count(*)::int n from auth.users where id = $1", [U(9)]))[0].n, 0);
  await as(U(9), "select delete_my_account()"); // gammel session efter sletning: ingen fejl, ingen effekt
  assert.equal((await rows("select count(*)::int n from auth.users"))[0].n, before - 1);
});

await check("brugere kan ikke indsætte eller ændre i auth.users direkte", async () => {
  await assert.rejects(as(B, "update auth.users set email = 'x@example.org' where id = $1", [B]), /permission denied/);
  await assert.rejects(as(B, "insert into auth.users (id) values (gen_random_uuid())"), /permission denied/);
});

await check("fejler sletningen af login, rulles gruppeændringer og forslag tilbage", async () => {
  const g = (await one(U(1), "select create_group('Rollback') as id")).id;
  await as(B, "select join_group($1)", [await code(g)]);
  await as(U(1), "insert into suggestions (user_id, name, note) values ($1, 'Rollback-forslag', 'privat note')", [U(1)]);
  await db.exec(`
    create function auth.block_delete() returns trigger language plpgsql as $f$
    begin raise exception 'auth-trigger afviser sletning'; end $f$;
    create trigger block_delete before delete on auth.users for each row execute function auth.block_delete();
  `);
  try {
    await assert.rejects(as(U(1), "select delete_my_account()"), /auth-trigger afviser/);
  } finally {
    await db.exec("drop trigger block_delete on auth.users; drop function auth.block_delete();");
  }
  assert.equal(await member(g, U(1)), "admin");
  assert.equal(await member(g, B), "member");
  assert.equal((await rows("select note from suggestions where name = 'Rollback-forslag'"))[0].note, "privat note");
  assert.equal((await rows("select count(*)::int n from auth.users where id = $1", [U(1)]))[0].n, 1);
});

console.log(`\n${passed} databasetests bestået`);
