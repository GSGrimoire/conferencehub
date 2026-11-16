// Test af hyppighed og rotation i scripts/watch.mjs. Kør: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.CH_TODAY = "2026-11-16"; // mandag, ISO-uge 47
const { isDue, rotationFor, holdOf, isoWeek, isSoon } = await import("../scripts/watch.mjs");

const ed = (id, start, extra = {}) => ({ id, start, end: start, ...extra });
const target = (edition_id) => ({ url: `https://x.example/${edition_id}`, edition_id });

test("ISO-uge", () => {
  assert.equal(isoWeek("2026-11-16"), 47);
  assert.equal(isoWeek("2027-01-01"), 53); // fredag i 2026's uge 53
  assert.equal(isoWeek("2027-01-04"), 1);
});

test("ugentlig: tjekket for 7 dage siden er due, for 6 dage siden er ikke", () => {
  const e = ed("a-2027", "2027-06-01");
  assert.equal(isDue(target(e.id), e, { checked: "2026-11-09T05:00:00Z" }, null), true);
  assert.equal(isDue(target(e.id), e, { checked: "2026-11-10T05:00:00Z" }, null), false);
  assert.equal(isDue(target(e.id), e, {}, null), true); // aldrig tjekket
});

test("overståede udgaver tjekkes ikke", () => {
  const e = ed("old-2026", "2026-05-01");
  assert.equal(isDue(target(e.id), e, {}, null), false);
});

test("ingen rotation ved 160 aktive udgaver, rotation ved 161", () => {
  const many = (n) => Array.from({ length: n }, (_, i) => ed(`e${i}-2027`, "2027-06-01"));
  assert.equal(rotationFor(many(160)), null);
  const r = rotationFor([...many(161), ed("past-2026", "2026-01-01")]);
  assert.deepEqual({ holds: r.holds, active: r.active }, { holds: 2, active: 161 });
  assert.equal(r.current, 47 % 2);
});

test("rotation: kun eget hold, men snarlige frister tjekkes altid", () => {
  const rotation = { holds: 2, current: 0 };
  const inHold = Array.from({ length: 40 }, (_, i) => `x${i}`).find((id) => holdOf(id, 2) === 0);
  const outHold = Array.from({ length: 40 }, (_, i) => `x${i}`).find((id) => holdOf(id, 2) === 1);
  const a = ed(inHold, "2027-06-01"), b = ed(outHold, "2027-06-01");
  assert.equal(isDue(target(a.id), a, {}, rotation), true);
  assert.equal(isDue(target(b.id), b, {}, rotation), false);
  const urgent = ed(outHold, "2027-06-01", { abstract_deadline: "2026-12-01" });
  assert.equal(isSoon(urgent), true);
  assert.equal(isDue(target(urgent.id), urgent, {}, rotation), true);
});
