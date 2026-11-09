// ConferenceHub, fase 2, trin 1: daglig ændringsdetektion.
// Henter hver overvåget side, normaliserer teksten, sammenligner med sidste version
// og lægger ændringer i queue/ til Claude-redaktøren. Kører i GitHub Actions (Node 20+).
//
//   node scripts/watch.mjs            normal kørsel
//   WATCH_ALL=1 node scripts/watch.mjs   ignorér intervaller (fx første kørsel)
//
// Filer:
//   data/watch.json         overvågningslisten (redigeres af mennesker og Claude)
//   state/watch-state.json  fingeraftryk, tidspunkter og fejltællere pr. URL
//   state/pages/<id>.txt    seneste normaliserede tekst pr. side (giver historik i git)
//   queue/<dato>.json       ændringer og døde links fundet i dag

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = process.env.CH_ROOT || ".";
const UA = "ConferenceHubBot/0.1 (+https://github.com/GSGrimoire/conferencehub)";
const TIMEOUT_MS = 30_000;
const DEAD_AFTER = 3;          // fejl i træk før et link meldes dødt
const SOON_DAYS = 90;          // tætte frister/starter giver daglig kontrol

const readJson = (p, fallback) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fallback);
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + "\n");
const sha = (s) => createHash("sha256").update(s).digest("hex");
const urlId = (u) => sha(u).slice(0, 16);
const today = process.env.CH_TODAY || new Date().toISOString().slice(0, 10);
const dayOf = (iso) => Date.parse(iso + "T00:00:00Z") / 864e5;

// ---------- hvornår skal en side tjekkes ----------
function isDue(target, edition, st) {
  if (process.env.WATCH_ALL) return true;
  if (edition && dayOf(edition.end_date || edition.end || edition.start) < dayOf(today)) return false; // overstået
  const last = st?.checked ? dayOf(st.checked.slice(0, 10)) : -Infinity;
  const interval = target.interval || (needsDaily(edition) ? "daily" : "weekly");
  return dayOf(today) - last >= (interval === "daily" ? 1 : 7);
}
function needsDaily(e) {
  if (!e) return true; // seriesider (jagt på næste udgave)
  const fields = ["abstract_deadline", "early_bird_deadline", "registration_deadline"];
  if (fields.some((f) => !e[f]) || !e.venue) return true;
  const soon = (iso) => iso && dayOf(iso) - dayOf(today) <= SOON_DAYS;
  return fields.some((f) => soon(e[f])) || soon(e.start);
}

// ---------- robots.txt (enkel fortolkning af "User-agent: *") ----------
const robotsCache = new Map();
async function allowed(url) {
  const u = new URL(url);
  if (!robotsCache.has(u.origin)) {
    let rules = [];
    try {
      const r = await fetch(u.origin + "/robots.txt", { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        let applies = false;
        for (const raw of (await r.text()).split(/\r?\n/)) {
          const line = raw.replace(/#.*/, "").trim();
          const [k, ...rest] = line.split(":"); const v = rest.join(":").trim();
          if (/^user-agent$/i.test(k)) applies = v === "*" || /conferencehub/i.test(v);
          else if (applies && /^disallow$/i.test(k) && v) rules.push(v);
        }
      }
    } catch { /* intet robots.txt = tilladt */ }
    robotsCache.set(u.origin, rules);
  }
  return !robotsCache.get(u.origin).some((p) => u.pathname.startsWith(p));
}

// ---------- normalisering ----------
export function normalize(html) {
  return html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .split("\n").map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^(©|copyright)\b/i.test(l) && !/cookie/i.test(l))
    .join("\n");
}
function lineDiff(oldText, newText) {
  const a = new Set(oldText.split("\n").filter(Boolean)), b = new Set(newText.split("\n").filter(Boolean));
  return {
    added: [...b].filter((l) => !a.has(l)).slice(0, 40),
    removed: [...a].filter((l) => !b.has(l)).slice(0, 40),
  };
}

// ---------- kørsel ----------
async function main() {
  const watch = readJson(`${ROOT}/data/watch.json`, []);
  const editions = Object.fromEntries(readJson(`${ROOT}/data/editions.json`, []).map((e) => [e.id, e]));
  const state = readJson(`${ROOT}/state/watch-state.json`, {});
  mkdirSync(`${ROOT}/state/pages`, { recursive: true });
  mkdirSync(`${ROOT}/queue`, { recursive: true });
  const queuePath = `${ROOT}/queue/${today}.json`;
  const queue = readJson(queuePath, []);
  const now = new Date().toISOString();
  let checked = 0, changed = 0, failed = 0, skipped = 0;

  for (const t of watch) {
    const ed = t.edition_id ? editions[t.edition_id] : null;
    const st = state[t.url] || {};
    if (!isDue(t, ed, st)) { skipped++; continue; }
    if (t.mode === "browser") { skipped++; continue; } // browserhentning kommer i næste trin
    if (!(await allowed(t.url))) {
      // Meldes kun første gang; siden må derefter tjekkes manuelt af Claude-redaktøren.
      if (!st.blocked) queue.push({ type: "blocked_by_robots", url: t.url, edition_id: t.edition_id ?? null, series_id: t.series_id ?? null, detected: now });
      state[t.url] = { ...st, blocked: true, checked: now };
      skipped++; continue;
    }
    checked++;
    try {
      const r = await fetch(t.url, { headers: { "user-agent": UA, "accept-language": "en,da;q=0.8" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const isPdf = t.mode === "pdf" || (r.headers.get("content-type") || "").includes("pdf");
      const body = isPdf ? Buffer.from(await r.arrayBuffer()) : await r.text();
      const text = isPdf ? "" : normalize(body);
      const hash = sha(isPdf ? body : text);
      const file = `${ROOT}/state/pages/${urlId(t.url)}.txt`;
      if (!isPdf && text.length < 200) throw new Error("næsten tom side (kræver måske browserhentning)");
      if (st.hash && st.hash !== hash) {
        changed++;
        const prev = !isPdf && existsSync(file) ? readFileSync(file, "utf8") : "";
        queue.push({ type: "changed", url: t.url, final_url: r.url, kind: t.kind, edition_id: t.edition_id ?? null,
          series_id: t.series_id ?? null, detected: now, pdf: isPdf, ...(isPdf ? {} : lineDiff(prev, text)) });
      }
      if (!isPdf) writeFileSync(file, text + "\n");
      state[t.url] = { hash, checked: now, changed: st.hash !== hash ? now : st.changed, fails: 0 };
    } catch (err) {
      failed++;
      const fails = (st.fails || 0) + 1;
      state[t.url] = { ...st, checked: now, fails, last_error: String(err.message || err) };
      if (fails === DEAD_AFTER) queue.push({ type: "dead_link", url: t.url, edition_id: t.edition_id ?? null, series_id: t.series_id ?? null, detected: now, error: String(err.message || err) });
    }
    await new Promise((res) => setTimeout(res, 1500)); // høflig pause mellem forespørgsler
  }

  writeJson(`${ROOT}/state/watch-state.json`, state);
  if (queue.length) writeJson(queuePath, queue);
  console.log(`Tjekket ${checked}, ændret ${changed}, fejlet ${failed}, sprunget over ${skipped}. Kø i dag: ${queue.length}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
