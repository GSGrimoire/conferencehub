// Test af redaktørens kontrol: datolæsning og regler for udgivelse. Kør: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CH_TODAY = "2026-11-16";
const { findDates } = await import("../scripts/lib/dates.mjs");
const { processProposals, decide, checkField, officialHosts } = await import("../scripts/apply.mjs");

const isos = (s) => findDates(s).filter((d) => !d.noYear && !d.ambiguous).map((d) => d.iso);

test("datoer: engelsk, dansk, tysk, intervaller og tal", () => {
  assert.deepEqual(isos("Abstract deadline: 15 December 2026"), ["2026-12-15"]);
  assert.deepEqual(isos("Deadline: December 15th, 2026"), ["2026-12-15"]);
  assert.deepEqual(isos("4–6 March 2027, Rome"), ["2027-03-04", "2027-03-06"]);
  assert.deepEqual(isos("March 4-6, 2027"), ["2027-03-04", "2027-03-06"]);
  assert.deepEqual(isos("28 February – 2 March 2027"), ["2027-02-28", "2027-03-02"]);
  assert.deepEqual(isos("29. december 2026 – 2. januar 2027"), ["2026-12-29", "2027-01-02"]);
  assert.deepEqual(isos("Frist: 1. marts 2027"), ["2027-03-01"]);
  assert.deepEqual(isos("Einsendeschluss 31. Dezember 2026"), ["2026-12-31"]);
  assert.deepEqual(isos("Early bird until 2027-01-31"), ["2027-01-31"]);
  assert.deepEqual(isos("Deadline 31.01.2027"), ["2027-01-31"]);
  assert.deepEqual(isos("Deadline 15/01/2027"), ["2027-01-15"]); // 15 kan ikke være en måned
});

test("datoer: tvetydige og årløse markeres, ugyldige droppes", () => {
  assert.equal(findDates("Deadline 04/03/2027")[0].ambiguous, true);
  assert.equal(findDates("Abstract deadline: 15 December")[0].noYear, true);
  assert.deepEqual(isos("31 February 2027"), []);
  assert.deepEqual(isos("May 2027 in Rome"), []); // ingen dag
  assert.deepEqual(isos("Mayor 5 attended"), []);
});

const edition = { id: "x-2027", series: "x", name: "X 2027", start: "2027-06-03", end: "2027-06-05", venue: null,
  abstract_deadline: null, early_bird_deadline: "2027-02-01", registration_deadline: null,
  links: [{ label: "x", url: "https://www.x2027.com/" }] };
const page = "Important dates\nAbstract submission deadline: 15 December 2026\nEarly bird registration until 1 March 2027\nVenue: Palacio de Congresos, Valencia\nRegistration closes 10 July 2027";
const db = () => ({ editions: [structuredClone(edition)], series: [{ id: "x", name: "X" }], watch: [], evidence: [], pending: [], decisions: [] });
const fetcher = async () => ({ ok: true, text: page });
const P = (field, value, quote, url = "https://www.x2027.com/dates") => ({ edition_id: "x-2027", field, value, url, quote });

test("tomt felt med gyldigt citat udgives automatisk med kilde", async () => {
  const d = db();
  const r = await processProposals([P("abstract_deadline", "2026-12-15", "Abstract submission deadline: 15 December 2026")], d, fetcher);
  assert.equal(r.applied.length, 1);
  assert.equal(d.editions[0].abstract_deadline, "2026-12-15");
  assert.equal(d.editions[0].last_verified_at, "2026-11-16");
  assert.equal(d.evidence[0].quote, "Abstract submission deadline: 15 December 2026");
});

test("ændring af eksisterende værdi venter på godkendelse og kan godkendes", async () => {
  const d = db();
  const r = await processProposals([P("early_bird_deadline", "2027-03-01", "Early bird registration until 1 March 2027")], d, fetcher);
  assert.equal(r.pending.length, 1);
  assert.equal(d.editions[0].early_bird_deadline, "2027-02-01"); // uændret
  decide([r.pending[0].id], true, d);
  assert.equal(d.editions[0].early_bird_deadline, "2027-03-01");
  assert.equal(d.pending.length, 0);
  assert.equal(d.decisions[0].decision, "approved");
});

test("kontrollen afviser: fremmed domæne, opdigtet citat, forkert dato, frist efter start", async () => {
  const d = db();
  const r = await processProposals([
    P("abstract_deadline", "2026-12-15", "Abstract submission deadline: 15 December 2026", "https://conference-index.example/x"),
    P("abstract_deadline", "2026-12-20", "Abstract submission deadline: 20 December 2026"),
    P("abstract_deadline", "2026-12-16", "Abstract submission deadline: 15 December 2026"),
    P("registration_deadline", "2027-07-10", "Registration closes 10 July 2027"),
  ], d, fetcher);
  assert.equal(r.applied.length, 0);
  assert.deepEqual(r.rejected.map((x) => x.reason.split(" ")[0]), ["kilden", "citatet", "datoen", "fristen"]);
  assert.equal(d.editions[0].abstract_deadline, null);
});

test("sted skal stå i citatet; underdomæne af officielt domæne er tilladt", async () => {
  const d = db();
  const r = await processProposals([P("venue", "Palacio de Congresos, Valencia", "Venue: Palacio de Congresos, Valencia", "https://abstracts.x2027.com/")], d, fetcher);
  assert.equal(r.applied.length, 1);
  assert.equal(d.editions[0].venue, "Palacio de Congresos, Valencia");
});

test("side der ikke kan hentes giver godkendelse, ikke udgivelse", async () => {
  const d = db();
  const r = await processProposals([P("abstract_deadline", "2026-12-15", "Abstract submission deadline: 15 December 2026")], d, async () => ({ ok: false, reason: "robots.txt forbyder automatisk hentning" }));
  assert.equal(r.pending.length, 1);
  assert.equal(d.editions[0].abstract_deadline, null);
});

test("ny udgave venter altid på godkendelse", async () => {
  const d = db();
  const r = await processProposals([{ type: "new_edition", url: "https://www.x2027.com/dates", quote: "Abstract submission deadline: 15 December 2026",
    edition: { id: "x-2026b", series: "x", name: "X ekstra", start: "2026-12-15", links: [{ label: "x", url: "https://www.x2027.com/" }] } }], d, fetcher);
  assert.equal(r.pending.length, 1);
  assert.equal(d.editions.length, 1);
  decide([r.pending[0].id], true, d);
  assert.equal(d.editions.length, 2);
});

test("officielle domæner hentes fra links, overvågningsliste og serie", () => {
  const hosts = officialHosts(edition, { id: "x", official_domains: ["x-society.org"] }, [{ url: "https://reg.x2027.com/", edition_id: "x-2027" }]);
  assert.deepEqual([...hosts].sort(), ["reg.x2027.com", "x-society.org", "x2027.com"]);
  assert.equal(checkField(P("venue", "Valencia", "Venue: Palacio de Congresos, Valencia", "http://evil.x2027.com.example.org/"), edition, hosts, page).ok, false);
});
