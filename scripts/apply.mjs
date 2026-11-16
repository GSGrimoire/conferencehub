// ConferenceHub: redaktørens kontrol i kode.
// Claude-redaktøren foreslår værdier med ordret citat (review/proposals.json). Dette script
// kontrollerer hvert forslag og afgør, hvad der må udgives:
//
//   - kilden skal ligge på konferencens egne domæner (links i data/editions.json, data/watch.json
//     eller series.official_domains)
//   - citatet skal stå ordret på siden, når den hentes nu
//   - datoen skal kunne læses ud af citatet; en frist skal ligge før konferencens start
//   - et tomt felt med gyldigt citat udgives automatisk
//   - en ændring af en eksisterende værdi og nye udgaver lægges i review/pending.json til godkendelse
//
//   node scripts/apply.mjs review/proposals.json     kontrollér og anvend forslag
//   node scripts/apply.mjs --approve id1,id2           godkend ventende ændringer
//   node scripts/apply.mjs --reject id1                afvis ventende ændringer
//
// Skriver data/editions.json, data/series.json, data/evidence.json, review/pending.json,
// review/decisions.json og en kort rapport i review/last-run.md.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { htmlToLines, allowed, UA } from "./watch.mjs";
import { findDates, cleanText } from "./lib/dates.mjs";

const ROOT = process.env.CH_ROOT || ".";
const today = process.env.CH_TODAY || new Date().toISOString().slice(0, 10);
const readJson = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");

export const DATE_FIELDS = ["start", "end", "abstract_deadline", "early_bird_deadline", "registration_deadline"];
export const FIELDS = [...DATE_FIELDS, "venue"];
const DEADLINES = ["abstract_deadline", "early_bird_deadline", "registration_deadline"];

const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch { return null; } };
export const idOf = (p) => createHash("sha256").update(JSON.stringify([p.type || "field", p.edition_id || p.edition?.id, p.field, p.value, p.url])).digest("hex").slice(0, 10);

export function officialHosts(edition, series, watch) {
  const urls = [
    ...((edition && edition.links) || []).map((l) => l.url),
    ...watch.filter((t) => (edition && t.edition_id === edition.id) || (series && t.series_id === series.id)).map((t) => t.url),
  ];
  const hosts = new Set(urls.map(hostOf).filter(Boolean));
  for (const d of (series && series.official_domains) || []) hosts.add(d.toLowerCase().replace(/^www\./, ""));
  return hosts;
}
export function isOfficial(url, hosts) {
  const h = hostOf(url);
  if (!h || !/^https?:$/.test(new URL(url).protocol)) return false;
  return [...hosts].some((o) => h === o || h.endsWith("." + o));
}

// Henter siden som ren tekst. PDF'er læses med pdftotext, hvis det findes.
export async function fetchText(url) {
  if (!(await allowed(url))) return { ok: false, reason: "robots.txt forbyder automatisk hentning; tjek siden i hånden" };
  let r;
  try {
    r = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en,da;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
  } catch (e) { return { ok: false, reason: `kunne ikke hente siden (${e.message})` }; }
  if (!r.ok) return { ok: false, reason: `siden svarede HTTP ${r.status}` };
  const type = r.headers.get("content-type") || "";
  if (type.includes("pdf") || /\.pdf($|\?)/i.test(url)) {
    const file = join(tmpdir(), `ch-${Date.now()}.pdf`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    try { return { ok: true, text: execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" }) }; }
    catch { return { ok: false, reason: "PDF kunne ikke læses (pdftotext mangler)" }; }
  }
  const html = (await r.text()).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  return { ok: true, text: htmlToLines(html).join("\n") };
}

// Kontrollerer ét feltforslag. Returnerer { ok, reason } eller { ok, value }.
export function checkField(p, edition, hosts, pageText) {
  if (!FIELDS.includes(p.field)) return { ok: false, reason: `ukendt felt "${p.field}"` };
  if (!p.quote || !p.url) return { ok: false, reason: "citat eller kilde mangler" };
  if (!isOfficial(p.url, hosts)) return { ok: false, reason: `kilden ${hostOf(p.url)} er ikke et af konferencens domæner (${[...hosts].join(", ")})` };
  const quote = cleanText(p.quote), page = cleanText(pageText);
  if (quote.length < 8) return { ok: false, reason: "citatet er for kort" };
  if (!page.includes(quote)) return { ok: false, reason: "citatet står ikke ordret på siden" };
  if (p.field === "venue") {
    if (!quote.toLowerCase().includes(cleanText(p.value).toLowerCase())) return { ok: false, reason: "stedet står ikke i citatet" };
    return { ok: true, value: cleanText(p.value) };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.value || "")) return { ok: false, reason: `værdien "${p.value}" er ikke en dato (ÅÅÅÅ-MM-DD)` };
  const dates = findDates(quote);
  const exact = dates.find((d) => d.iso === p.value && !d.noYear && !d.ambiguous);
  if (!exact) {
    const md = p.value.slice(5);
    if (dates.some((d) => d.iso.slice(5) === md && (d.noYear || d.ambiguous))) {
      return { ok: false, needsApproval: true, reason: "datoen står i citatet, men året mangler eller dag og måned kan byttes om" };
    }
    return { ok: false, reason: `datoen ${p.value} kan ikke læses ud af citatet` };
  }
  const start = p.field === "start" ? p.value : edition.start;
  if (DEADLINES.includes(p.field) && start && p.value > start) return { ok: false, reason: `fristen ${p.value} ligger efter konferencens start ${start}` };
  if (p.field === "end" && start && p.value < start) return { ok: false, reason: "slutdatoen ligger før starten" };
  if (p.field === "start" && edition.end && p.value > edition.end) return { ok: false, reason: "startdatoen ligger efter slutdatoen" };
  return { ok: true, value: p.value };
}

function setField(edition, field, value) {
  edition[field] = value;
  edition.last_verified_at = today;
}
function addEvidence(evidence, item) {
  const rest = evidence.filter((e) => !(e.edition_id === item.edition_id && e.field === item.field));
  return [...rest, item];
}

// Behandler en liste af forslag. fetcher kan udskiftes i test.
export async function processProposals(proposals, db, fetcher = fetchText) {
  const result = { applied: [], confirmed: [], pending: [], rejected: [] };
  const pages = new Map();
  const getPage = async (url) => { if (!pages.has(url)) pages.set(url, await fetcher(url)); return pages.get(url); };
  const byId = Object.fromEntries(db.editions.map((e) => [e.id, e]));
  const seriesById = Object.fromEntries(db.series.map((s) => [s.id, s]));

  for (const p of proposals) {
    const id = idOf(p);
    if (db.pending.some((x) => x.id === id)) { result.pending.push({ id, ...p, reason: "venter allerede på godkendelse" }); continue; }

    if (p.type === "new_edition") {
      const e = p.edition || {};
      if (!e.id || !e.series || !e.name || !e.start) { result.rejected.push({ id, ...p, reason: "ny udgave mangler id, serie, navn eller start" }); continue; }
      if (byId[e.id]) { result.rejected.push({ id, ...p, reason: `udgaven ${e.id} findes allerede` }); continue; }
      const series = seriesById[e.series] || p.series;
      if (!series) { result.rejected.push({ id, ...p, reason: `serien ${e.series} findes ikke` }); continue; }
      const page = await getPage(p.url);
      const hosts = officialHosts(e, series, db.watch);
      const check = page.ok ? checkField({ field: "start", value: e.start, url: p.url, quote: p.quote }, e, hosts, page.text) : { ok: false, reason: page.reason };
      const item = { id, type: "new_edition", edition: e, series: seriesById[e.series] ? undefined : series, url: p.url, quote: p.quote, check: check.ok ? "citat og startdato bekræftet" : check.reason, created: today };
      db.pending.push(item); result.pending.push(item);
      continue;
    }

    const edition = byId[p.edition_id];
    if (!edition) { result.rejected.push({ id, ...p, reason: `ukendt udgave ${p.edition_id}` }); continue; }
    const hosts = officialHosts(edition, seriesById[edition.series], db.watch);
    const page = isOfficial(p.url || "", hosts) ? await getPage(p.url) : { ok: true, text: "" };
    if (!page.ok) {
      const item = { id, ...p, old_value: edition[p.field] ?? null, reason: page.reason, created: today };
      db.pending.push(item); result.pending.push(item); continue;
    }
    const check = checkField(p, edition, hosts, page.text);
    if (!check.ok) {
      if (check.needsApproval) {
        const item = { id, ...p, old_value: edition[p.field] ?? null, reason: check.reason, created: today };
        db.pending.push(item); result.pending.push(item);
      } else result.rejected.push({ id, ...p, reason: check.reason });
      continue;
    }
    const current = edition[p.field] ?? null;
    const ev = { edition_id: edition.id, field: p.field, value: check.value, source_url: p.url, quote: cleanText(p.quote), fetched_at: today };
    if (current === check.value) {
      edition.last_verified_at = today; db.evidence = addEvidence(db.evidence, ev);
      result.confirmed.push({ id, ...p });
    } else if (current === null || current === "") {
      setField(edition, p.field, check.value); db.evidence = addEvidence(db.evidence, ev);
      result.applied.push({ id, ...p });
    } else {
      const item = { id, ...p, value: check.value, old_value: current, reason: "ændrer en eksisterende værdi", created: today };
      db.pending.push(item); result.pending.push(item);
    }
  }
  return result;
}

export function decide(ids, approve, db) {
  const done = [];
  for (const id of ids) {
    const item = db.pending.find((x) => x.id === id);
    if (!item) { done.push({ id, error: "findes ikke i review/pending.json" }); continue; }
    db.pending = db.pending.filter((x) => x.id !== id);
    if (approve) {
      if (item.type === "new_edition") {
        if (item.series && !db.series.some((s) => s.id === item.series.id)) db.series.push(item.series);
        db.editions.push({ ...item.edition, last_verified_at: today });
      } else {
        const e = db.editions.find((x) => x.id === item.edition_id);
        if (!e) { done.push({ id, error: `ukendt udgave ${item.edition_id}` }); continue; }
        setField(e, item.field, item.value);
        db.evidence = addEvidence(db.evidence, { edition_id: e.id, field: item.field, value: item.value, source_url: item.url, quote: cleanText(item.quote), fetched_at: item.created || today });
      }
    }
    db.decisions.push({ id, decision: approve ? "approved" : "rejected", date: today, item });
    done.push({ id, decision: approve ? "godkendt" : "afvist" });
  }
  db.editions.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return done;
}

function load() {
  return {
    editions: readJson(`${ROOT}/data/editions.json`, []),
    series: readJson(`${ROOT}/data/series.json`, []),
    watch: readJson(`${ROOT}/data/watch.json`, []),
    evidence: readJson(`${ROOT}/data/evidence.json`, []),
    pending: readJson(`${ROOT}/review/pending.json`, []),
    decisions: readJson(`${ROOT}/review/decisions.json`, []),
  };
}
function save(db) {
  mkdirSync(`${ROOT}/review`, { recursive: true });
  writeJson(`${ROOT}/data/editions.json`, db.editions);
  writeJson(`${ROOT}/data/series.json`, db.series);
  writeJson(`${ROOT}/data/evidence.json`, db.evidence);
  writeJson(`${ROOT}/review/pending.json`, db.pending);
  writeJson(`${ROOT}/review/decisions.json`, db.decisions);
}
function report(r) {
  const line = (x) => `- ${x.edition_id || x.edition?.id} · ${x.field || "ny udgave"}: ${x.value ?? x.edition?.start ?? ""}${x.old_value ? ` (var ${x.old_value})` : ""}${x.reason ? ` – ${x.reason}` : ""} [${x.id}]`;
  return [
    `# Redaktørkørsel ${today}`, "",
    `Udgivet automatisk: ${r.applied.length} · Bekræftet uændret: ${r.confirmed.length} · Venter på godkendelse: ${r.pending.length} · Afvist af kontrollen: ${r.rejected.length}`, "",
    "## Udgivet automatisk", ...r.applied.map(line), "",
    "## Venter på godkendelse", ...r.pending.map(line), "",
    "## Afvist af kontrollen", ...r.rejected.map(line), "",
  ].join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const db = load();
  if (args[0] === "--approve" || args[0] === "--reject") {
    const out = decide((args[1] || "").split(",").filter(Boolean), args[0] === "--approve", db);
    save(db); console.log(JSON.stringify(out, null, 2)); return;
  }
  const file = args[0] || `${ROOT}/review/proposals.json`;
  const r = await processProposals(readJson(file, []), db);
  db.editions.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  save(db);
  writeFileSync(`${ROOT}/review/last-run.md`, report(r));
  console.log(report(r));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
