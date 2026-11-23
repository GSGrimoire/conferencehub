import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicConfig, readPublicEdition } from "../scripts/check-supabase.mjs";

const source = 'window.CH_CONFIG = { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" };';
const config = { supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_test" };

test("reads only the public project configuration", () => {
  assert.deepEqual(parsePublicConfig(source), config);
  assert.throws(() => parsePublicConfig(source.replace("sb_publishable_test", "sb_secret_test")), /publishable key/);
  assert.throws(() => parsePublicConfig(source.replace("https://example.supabase.co", "http://example.supabase.co")), /HTTPS/);
});

test("makes one read-only request for at most one public edition", async () => {
  let calls = 0;
  const rows = await readPublicEdition({ ...config, request: async (url, options) => {
    calls++;
    const requested = new URL(url);
    assert.equal(requested.pathname, "/rest/v1/editions");
    assert.equal(requested.searchParams.get("select"), "id");
    assert.equal(requested.searchParams.get("limit"), "1");
    assert.equal(options.method, "GET");
    assert.equal(options.headers.apikey, config.publishableKey);
    assert.equal(options.cache, "no-store");
    return { ok: true, json: async () => [{ id: "synthetic" }] };
  }});
  assert.equal(calls, 1);
  assert.equal(rows, 1);
});

test("reports API errors without falsely claiming success", async () => {
  await assert.rejects(readPublicEdition({ ...config, request: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
});

test("rejects unexpected responses", async () => {
  await assert.rejects(readPublicEdition({ ...config, request: async () => ({ ok: true, json: async () => ({ message: "not a list" }) }) }), /Unexpected/);
});
