// ConferenceHub, fase 1: læsbar side uden login.
// Data: data/editions.json og data/series.json (kopieres ind ved build).
"use strict";

const MONTHS = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
const MONTHS_LONG = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
const SOON_DAYS = 42;          // frister inden for 6 uger fremhæves
const NEAR_MONTHS = 8;         // "Snarligt" = starter inden for 8 måneder
const PAST_DAYS = 270;         // "Overstået" viser de sidste ca. 9 måneder

const TOPICS = [
  { key: "all", label: "Alle" },
  { key: "plastik", label: "Plastikkirurgi" },
  { key: "bryst", label: "Bryst" },
  { key: "mikro", label: "Mikrokirurgi" },
  { key: "forbr", label: "Forbrænding" },
  { key: "lymf", label: "Lymfødem" },
  { key: "postbar", label: "Postbariatrisk" },
  { key: "syge", label: "Sygepleje" },
];
const TOPIC_MAP = {
  "Plastik": ["plastik"], "Bryst/Plastik": ["bryst", "plastik"], "Mamma": ["bryst"],
  "Mikrokir.": ["mikro"], "Forbrænding": ["forbr"], "Lymfødem": ["lymf"],
  "Overvægt": ["postbar"], "Sygepleje": ["syge"],
};
const DEADLINES = [
  ["abstract_deadline", "Abstractfrist", "Abstract"],
  ["early_bird_deadline", "Early bird", "Early bird"],
  ["registration_deadline", "Tilmeldingsfrist", "Tilmelding"],
];

// ---------- datoer (heltal = dage siden 1970, ingen tidszonefejl) ----------
const dayOf = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const isoOf = (day) => new Date(day * 864e5).toISOString().slice(0, 10);
const parts = (iso) => iso.split("-").map(Number);
function todayDay() {
  const forced = new URLSearchParams(location.search).get("today"); // til test: ?today=2027-01-15
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) return dayOf(forced);
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / 864e5;
}
function fmtDate(iso, withYear = true) {
  const [y, m, d] = parts(iso);
  return `${d}. ${MONTHS[m - 1]}${withYear ? " " + y : ""}`;
}
function fmtRange(a, b) {
  if (!b || a === b) return fmtDate(a);
  const [ya, ma, da] = parts(a), [yb, mb, db] = parts(b);
  if (ya === yb && ma === mb) return `${da}.–${db}. ${MONTHS[ma - 1]} ${ya}`;
  if (ya === yb) return `${da}. ${MONTHS[ma - 1]}–${db}. ${MONTHS[mb - 1]} ${ya}`;
  return `${fmtDate(a)}–${fmtDate(b)}`;
}
function inDays(n) {
  if (n === 0) return "i dag";
  if (n === 1) return "i morgen";
  return `om ${n} dage`;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- tilstand ----------
const state = { editions: [], series: {}, topic: "all", q: "", today: todayDay() };

function nextDeadline(e) {
  let best = null;
  for (const [field, , short] of DEADLINES) {
    if (!e[field]) continue;
    const d = dayOf(e[field]) - state.today;
    if (d >= 0 && (!best || d < best.days)) best = { field, short, days: d, iso: e[field] };
  }
  return best;
}
function matches(e) {
  if (state.topic !== "all" && !(TOPIC_MAP[e.topic] || []).includes(state.topic)) return false;
  if (!state.q) return true;
  const s = state.series[e.series] || {};
  const hay = [e.name, e.venue, e.topic, s.name, s.short_name].join(" ").toLowerCase();
  return state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}

// ---------- tidslinje ----------
function renderStrip() {
  const el = document.getElementById("strip");
  const t = new Date(state.today * 864e5);
  const y0 = t.getUTCFullYear(), m0 = t.getUTCMonth();
  const ws = Date.UTC(y0, m0, 1) / 864e5, we = Date.UTC(y0, m0 + 12, 1) / 864e5;
  const pct = (day) => ((day - ws) / (we - ws)) * 100;

  let months = "";
  for (let i = 0; i < 12; i++) {
    const m = (m0 + i) % 12, y = y0 + Math.floor((m0 + i) / 12);
    months += `<span class="${m === 0 ? "jan" : ""}">${MONTHS[m]}${m === 0 || i === 0 ? " " + y : ""}</span>`;
  }

  const items = state.editions
    .filter((e) => matches(e) && dayOf(e.end || e.start) >= ws && dayOf(e.start) < we)
    .sort((a, b) => a.start.localeCompare(b.start));
  // Fordel flag på baner, så etiketterne ikke overlapper (ca. 2,45 px pr. dag ved min. bredde).
  const lanes = [];
  const bars = items.map((e) => {
    const s = state.series[e.series] || {};
    const label = s.short_name || e.name;
    const startDay = Math.max(dayOf(e.start), ws);
    const labelDays = (label.length * 7.4 + 22) / 2.45;
    let lane = lanes.findIndex((end) => end < startDay);
    if (lane === -1) { lane = lanes.length; lanes.push(0); }
    lanes[lane] = startDay + labelDays;
    const done = dayOf(e.end || e.start) < state.today;
    return `<a class="bar${done ? " done" : ""}" href="#e-${esc(e.id)}" style="left:${pct(startDay).toFixed(2)}%;top:${lane * 2.3}rem"
      title="${esc(e.name)}, ${esc(fmtRange(e.start, e.end))}${done ? " (afholdt)" : ""}">${esc(label)}</a>`;
  }).join("");

  const height = Math.max(lanes.length, 1) * 2.3 + 0.3;
  el.innerHTML = `<div class="months">${months}</div>
    <div class="lanes" style="height:${height}rem">${bars}</div>
    <div class="today" style="left:${pct(state.today).toFixed(2)}%" aria-hidden="true"><span>I dag</span></div>`;
}

// ---------- rækker ----------
function row(e) {
  const s = state.series[e.series] || {};
  const nd = nextDeadline(e);
  const isPast = dayOf(e.end || e.start) < state.today;
  let next;
  if (isPast) next = `<span class="none">Afholdt</span>`;
  else if (nd) next = `<span class="${nd.days <= SOON_DAYS ? "soon" : ""}">${nd.short} ${nd.days <= SOON_DAYS ? inDays(nd.days) : fmtDate(nd.iso)}</span>`;
  else next = `<span class="none">Ingen kendt frist</span>`;

  const dl = [["Dato", fmtRange(e.start, e.end)], ["Sted", e.venue || "Ikke offentliggjort"]];
  for (const [field, label] of DEADLINES) {
    const note = (e.deadline_notes || {})[field.replace("_deadline", "")];
    if (e[field]) {
      const passed = dayOf(e[field]) < state.today;
      dl.push([label, `<span class="${passed ? "expired" : ""}">${fmtDate(e[field])}</span>${passed ? " (udløbet)" : ""}`]);
    } else if (note) dl.push([label, esc(note)]);
  }
  if (e.note) dl.push(["Note", esc(e.note)]);
  const links = (e.links || []).map((l) => `<a href="${esc(l.url)}" rel="noopener">${esc(l.label)}</a>`).join("");

  return `<li class="row" id="e-${esc(e.id)}"><details>
    <summary>
      <div class="when">${esc(fmtRange(e.start, e.end))}</div>
      <div class="what"><h3>${esc(e.name)}<span class="chev" aria-hidden="true">›</span></h3><p>${esc(e.venue || "Sted ikke offentliggjort")}</p></div>
      <div class="next">${next}</div>
    </summary>
    <div class="detail">
      <dl>${dl.map(([k, v]) => `<dt>${k}</dt><dd>${k === "Dato" || k === "Sted" ? esc(v) : v}</dd>`).join("")}</dl>
      <div class="actions">
        ${isPast ? "" : `<button class="btn" type="button" data-ics="${esc(e.id)}">Føj til kalender</button>`}
        ${links}
      </div>
      <p class="source">Serie: ${esc(s.name || e.series)}. Kilde: ${esc(e.source || "ukendt")}.</p>
    </div>
  </details></li>`;
}

function render() {
  const nearEnd = (() => { const t = new Date(state.today * 864e5); return Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + NEAR_MONTHS, t.getUTCDate()) / 864e5; })();
  const list = state.editions.filter(matches);
  const soon = [], far = [], past = [];
  for (const e of list) {
    const end = dayOf(e.end || e.start), start = dayOf(e.start);
    if (end < state.today) { if (state.today - end <= PAST_DAYS) past.push(e); }
    else if (start <= nearEnd) soon.push(e);
    else far.push(e);
  }
  soon.sort((a, b) => a.start.localeCompare(b.start));
  far.sort((a, b) => a.start.localeCompare(b.start));
  past.sort((a, b) => b.start.localeCompare(a.start));
  for (const [id, arr] of [["soon", soon], ["far", far], ["past", past]]) {
    document.getElementById(id).innerHTML = arr.map(row).join("");
    document.getElementById("c-" + id).textContent = `(${arr.length})`;
  }
  document.getElementById("empty").hidden = soon.length + far.length + past.length > 0;
  renderStrip();
  renderLede();
}

function renderLede() {
  let best = null;
  for (const e of state.editions.filter(matches)) {
    const nd = nextDeadline(e);
    if (nd && (!best || nd.days < best.nd.days)) best = { e, nd };
  }
  const el = document.getElementById("next-deadline");
  if (!best) { el.textContent = "Ingen kommende frister i det valgte filter."; return; }
  const words = { Abstract: "abstractfrist", "Early bird": "early bird-frist", Tilmelding: "tilmeldingsfrist" };
  const when = `${fmtDate(best.nd.iso)} (${inDays(best.nd.days)})`;
  el.innerHTML = `Næste ${words[best.nd.short]}: <a href="#e-${esc(best.e.id)}">${esc(best.e.name)}</a>, ` +
    (best.nd.days <= SOON_DAYS ? `<strong>${esc(when)}</strong>.` : `${esc(when)}.`);
}

// ---------- kalenderfil (.ics) ----------
function icsText(e) {
  const fold = (s) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const d = (iso) => iso.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const url = (e.links && e.links[0] && e.links[0].url) || "";
  const ev = (uid, summary, start, endExcl) => [
    "BEGIN:VEVENT", `UID:${uid}@conferencehub`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d(start)}`, `DTEND;VALUE=DATE:${d(endExcl)}`,
    `SUMMARY:${fold(summary)}`, e.venue ? `LOCATION:${fold(e.venue)}` : null, url ? `URL:${url}` : null,
    "END:VEVENT"].filter(Boolean);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ConferenceHub//DA", "CALSCALE:GREGORIAN"];
  lines.push(...ev(e.id, e.name, e.start, isoOf(dayOf(e.end || e.start) + 1)));
  for (const [field, label] of DEADLINES) {
    if (e[field] && dayOf(e[field]) >= state.today)
      lines.push(...ev(`${e.id}-${field}`, `${label}: ${e.name}`, e[field], isoOf(dayOf(e[field]) + 1)));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
document.addEventListener("click", (ev) => {
  const b = ev.target.closest("[data-ics]");
  if (!b) return;
  const e = state.editions.find((x) => x.id === b.dataset.ics);
  const blob = new Blob([icsText(e)], { type: "text/calendar;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${e.id}.ics` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- filtre ----------
function renderChips() {
  const el = document.getElementById("chips");
  el.innerHTML = TOPICS.map((t) => `<button type="button" data-topic="${t.key}" aria-pressed="${t.key === state.topic}">${t.label}</button>`).join("");
  el.onclick = (ev) => {
    const b = ev.target.closest("button[data-topic]");
    if (!b) return;
    state.topic = b.dataset.topic;
    el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  };
}
document.getElementById("q").addEventListener("input", (ev) => { state.q = ev.target.value.trim(); render(); });

// Et link til en konference (#e-id) åbner rækken.
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const li = id && document.getElementById(id);
  if (!li) return;
  const past = li.closest(".past"); if (past) past.open = true;
  const det = li.querySelector("details"); if (det) det.open = true;
  li.scrollIntoView({ block: "start" });
}
window.addEventListener("hashchange", openFromHash);

// ---------- start ----------
Promise.all([fetch("data/editions.json").then((r) => r.json()), fetch("data/series.json").then((r) => r.json())])
  .then(([editions, series]) => {
    state.editions = editions;
    state.series = Object.fromEntries(series.map((s) => [s.id, s]));
    renderChips();
    render();
    openFromHash();
  })
  .catch(() => {
    document.getElementById("next-deadline").textContent = "Konferencedata kunne ikke hentes. Genindlæs siden; virker det stadig ikke, så kontakt den ansvarlige for siden.";
  });
