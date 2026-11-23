// ConferenceHub: read-only Supabase connectivity and database activity check.
// Uses the publishable browser key; never requires a service-role or secret key.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function parsePublicConfig(source) {
  function get(name) {
    const match = source.match(new RegExp("\\b" + name + "\\s*:\\s*[\"']([^\"']+)[\"']"));
    if (!match) throw new Error("Missing " + name + " in site/config.js");
    return match[1];
  }
  const supabaseUrl = get("supabaseUrl");
  const publishableKey = get("publishableKey");
  const parsed = new URL(supabaseUrl);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
    throw new Error("Expected an HTTPS Supabase project URL");
  }
  if (!publishableKey.startsWith("sb_publishable_")) {
    throw new Error("Expected a public publishable key, not a secret key");
  }
  return { supabaseUrl: parsed.origin, publishableKey };
}

export async function readPublicEdition({ supabaseUrl, publishableKey, request = fetch }) {
  const endpoint = new URL("/rest/v1/editions", supabaseUrl);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("limit", "1");
  const response = await request(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: publishableKey,
      accept: "application/json",
      "cache-control": "no-cache",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Supabase returned HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unexpected Supabase response format");
  return rows.length;
}

async function main() {
  const configFile = fileURLToPath(new URL("../site/config.js", import.meta.url));
  const config = parsePublicConfig(readFileSync(configFile, "utf8"));
  const count = await readPublicEdition(config);
  console.log("Supabase public database read OK (" + count + " edition row(s) returned, limit 1).");
  console.log("This is one database request, not a guarantee against inactivity pausing.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Supabase public database read FAILED: " + error.message);
    process.exitCode = 1;
  });
}
