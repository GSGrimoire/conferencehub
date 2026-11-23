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
const A = "00000000-0000-4000-8000-00000000000a", B = "00000000-0000-4000-8000-00000000000b", C = "00000000-0000-4000-8000-00000000000c";
const previousToken = "00000000-0000-4000-8000-000000000123";

// Supabase-lignende udgangspunkt: roller, auth.users, auth.uid() og standardrettigheder.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
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
  if (f.endsWith("_auth_beta.sql")) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'a@example.org', '{\"full_name\":\"Anna\"}')", [A]);
    await db.query("update profiles set calendar_token = $1 where id = $2", [previousToken, A]);
  }
}

await db.exec(`
  insert into series (id, name) values ('x', 'X');
  insert into editions (id, series_id, name, start_date) values ('x-2027', 'x', 'X 2027', '2027-06-01');
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${B}', 'b@example.org', '{}'), ('${C}', 'c@example.org', '{}');
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
await as(A, "insert into suggestions (user_id, name) values ($1, 'Ny konference')", [A]);

await check("profil oprettes af triggeren med navn fra Google", async () => {
  assert.equal((await rows("select display_name from profiles where id = $1", [A]))[0].display_name, "Anna");
});

await check("kalendertoken bevares og er kun synlig for sin ejer", async () => {
  assert.equal((await one(A, "select token from calendar_tokens where user_id = $1", [A])).token, previousToken);
  assert.deepEqual((await as(B, "select user_id from calendar_tokens order by user_id")).rows, [{ user_id: B }]);
  assert.ok((await one(B, "select token from calendar_tokens")).token);
  await assert.rejects(as(null, "select token from calendar_tokens"), /permission denied/);
  await assert.rejects(as(A, "update calendar_tokens set token = gen_random_uuid()"), /permission denied/);
  assert.equal((await one(B, "select * from profiles where id = $1", [A])).display_name, "Anna");
  assert.equal((await one(B, "select * from profiles where id = $1", [A])).calendar_token, undefined);
});

await check("kalender- og gruppeændringen kan køres igen uden at udskifte tokens", async () => {
  const before = await one(B, "select token from calendar_tokens");
  const migration = readdirSync(dir).find(f => f.endsWith("_protect_calendar_tokens_and_group_visibility.sql"));
  await db.exec(readFileSync(new URL(migration, dir), "utf8"));
  assert.deepEqual(await one(B, "select token from calendar_tokens"), before);
  assert.equal((await one(A, "select token from calendar_tokens")).token, previousToken);
});

await check("gruppemedlemmer kan kun se medlemsrækker i egne grupper", async () => {
  assert.deepEqual((await as(B, "select user_id from group_members where group_id = $1 order by user_id", [g1])).rows, [{ user_id: A }, { user_id: B }]);
  assert.deepEqual((await as(B, "select user_id from group_members where group_id = $1", [g3])).rows, []);
  assert.equal((await as(B, "delete from group_members where group_id = $1 and user_id = $2", [g1, A])).affectedRows, 0);
  assert.equal((await as(A, "delete from group_members where group_id = $1 and user_id = $2", [g1, B])).affectedRows, 1);
  await as(B, "select join_group($1)", [await code(g1)]);
});

await check("offentlige databasefunktioner giver kun de nødvendige kald", async () => {
  const permissions = (await rows(`
    select has_function_privilege('anon', 'public.create_group(text)', 'EXECUTE') as anon_create,
           has_function_privilege('anon', 'public.join_group(text)', 'EXECUTE') as anon_join,
           has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') as call_trigger,
           to_regprocedure('public.shares_group(uuid,uuid)') as old_membership_helper
  `))[0];
  assert.deepEqual(permissions, { anon_create: false, anon_join: false, call_trigger: false, old_membership_helper: null });
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
  for (const t of ["profiles where id", "attendance where user_id", "group_members where user_id", "follows where user_id", "calendar_tokens where user_id"]) {
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

await check("forslag beholdes uden afsender", async () => {
  const s = await rows("select user_id from suggestions where name = 'Ny konference'");
  assert.equal(s.length, 1);
  assert.equal(s[0].user_id, null);
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
           has_function_privilege('public.delete_my_account()', 'EXECUTE') as owner_access
  `);
  assert.equal(p[0].yes, true);
  assert.equal(p[0].no, false);
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

await check("gruppenavn, antal grupper og eksisterende invitationer", async () => {
  await assert.rejects(as(B, "select create_group($1)", ["x".repeat(81)]), /2 til 80 tegn/);
  for (let i = 0; i < 10; i++) await as(B, "select create_group($1)", [`Gruppe ${i + 1}`]);
  await assert.rejects(as(B, "select create_group('En gruppe mere')"), /10 aktive grupper/);
  await as(B, "select join_group($1)", [await code(g3)]);
  assert.ok((await one(C, "select create_group('En anden ejers gruppe') as id")).id);
});

await check("forslagsgrænser gælder pr. bruger og optæller kun gennemførte forslag", async () => {
  const send = (id, name, url = null, note = null) =>
    as(id, "insert into suggestions (user_id, name, url, note) values ($1, $2, $3, $4)", [id, name, url, note]);
  await assert.rejects(as(null, "insert into suggestions (name) values ('Et forslag')"), /permission denied/);
  await assert.rejects(send(B, "x".repeat(201)), /suggestions_input_limits/);
  await assert.rejects(send(B, "Konference", "https://" + "x".repeat(2049)), /suggestions_input_limits/);
  await assert.rejects(send(B, "Konference", null, "x".repeat(1001)), /suggestions_input_limits/);
  for (let i = 0; i < 5; i++) await send(B, `Forslag ${i + 1}`);
  await assert.rejects(send(B, "Et forslag mere"), /fem forslag pr. dag/);
  await send(C, null, "https://example.org/conference");
  await db.exec("update conferencehub_private.suggestion_daily_total set used = 100");
  await assert.rejects(send(C, "Efter den fælles grænse"), /flere forslag i dag/);
  await db.exec(`
    update conferencehub_private.suggestion_daily_total set day = day - 1;
    update conferencehub_private.suggestion_daily_by_user set day = day - 1;
  `);
  await send(B, "Et forslag næste dag");
  assert.equal((await rows("select used from conferencehub_private.suggestion_daily_total"))[0].used, 1);
});

console.log(`\n${passed} databasetests bestået`);
await db.close();
