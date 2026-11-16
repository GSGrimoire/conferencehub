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
await as(A, "insert into suggestions (user_id, name) values ($1, 'Ny konference')", [A]);

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

console.log(`\n${passed} databasetests bestået`);
