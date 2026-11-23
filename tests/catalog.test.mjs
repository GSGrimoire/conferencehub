import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
function setup() {
  const nodes = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, { addEventListener() {} });
      return nodes.get(id);
    },
  };
  return runInNewContext(source + "\n({ state, matches, row, nextDeadline, renderLede, openFromHash, document, location })", {
    window: { addEventListener() {} },
    location: { search: "?today=2026-11-23", hash: "" },
    document,
    fetch: () => new Promise(() => {}),
    URL,
    URLSearchParams,
  });
}

const event = {
  id: "meeting",
  name: "Düsseldorf Meeting",
  topic: "Mikrokir.",
  status: "confirmed",
  start: "2026-12-10",
  abstract_deadline: "2026-11-23",
};

test("catalogue search accepts accents and the displayed topic names", () => {
  const { state, matches } = setup();
  state.q = "Dusseldorf mikrokirurgi";
  assert.equal(matches(event), true);
  state.topic = "bryst";
  assert.equal(matches(event), false);
});

test("a cancelled conference keeps its listing but suppresses the deadline and calendar action", () => {
  const { state, row, nextDeadline, renderLede, document } = setup();
  const cancelled = { ...event, status: "cancelled" };
  state.editions = [cancelled];
  assert.equal(nextDeadline(cancelled), null);
  assert.match(row(cancelled), /Aflyst/);
  assert.doesNotMatch(row(cancelled), /data-ics=/);
  renderLede();
  assert.match(document.getElementById("next-deadline").textContent, /Ingen kommende frister/);
});

test("source quotations are available in the listing with proper text escaping", () => {
  const { state, row } = setup();
  state.evidence["meeting|abstract_deadline"] = {
    quote: "Apply <before> 23 Nov",
    source_url: "https://example.org/dates",
  };
  const rendered = row(event);
  assert.match(rendered, /<summary>Se kilde<\/summary>/);
  assert.match(rendered, /Apply &lt;before&gt; 23 Nov/);
  assert.match(rendered, /https:\/\/example.org\/dates/);
});

test("malformed conference links leave the catalogue usable", () => {
  const { openFromHash, location } = setup();
  location.hash = "#e-%E0%A4%A";
  assert.doesNotThrow(openFromHash);
});
