// ConferenceHub: synkroniserer data/series.json og data/editions.json til Supabase.
// Kører i .github/workflows/sync.yml efter hvert push til data/.
// Kræver repo-secrets SUPABASE_URL og SUPABASE_SECRET_KEY (service role / secret key).

import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.log("SUPABASE_URL eller SUPABASE_SECRET_KEY mangler; springer synkronisering over.");
  process.exit(0);
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const series = read("data/series.json").map((s) => ({
  id: s.id, name: s.name, short_name: s.short_name ?? null,
  organiser: s.organiser ?? null, topics: s.topics ?? [], frequency: s.frequency ?? null,
  official_domains: s.official_domains ?? [],
}));
const editions = read("data/editions.json").map((e) => ({
  id: e.id, series_id: e.series, name: e.name, topic: e.topic ?? null,
  start_date: e.start, end_date: e.end ?? null, venue: e.venue ?? null,
  abstract_deadline: e.abstract_deadline ?? null, early_bird_deadline: e.early_bird_deadline ?? null,
  registration_deadline: e.registration_deadline ?? null, deadline_notes: e.deadline_notes ?? {},
  links: e.links ?? [], note: e.note ?? null, status: e.status ?? "confirmed",
  last_verified_at: e.last_verified_at ?? null, updated_at: new Date().toISOString(),
}));

async function upsert(table, rows) {
  const r = await fetch(`${url}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: key, "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=minimal",
      // Nye nøgler (sb_secret_...) sendes kun i apikey; den gamle service_role-JWT (eyJ...) også som Bearer.
      ...(key.startsWith("eyJ") ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} ${await r.text()}`);
  console.log(`${table}: ${rows.length} rækker synkroniseret`);
}

await upsert("series", series);   // serier først, udgaverne peger på dem
await upsert("editions", editions);
