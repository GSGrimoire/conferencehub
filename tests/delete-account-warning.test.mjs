// Regression check: account deletion must explicitly warn about the other tool.
// This is a static text guard, not a substitute for a browser or Supabase integration test.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const auth = readFileSync(new URL("../site/auth.js", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../site/privatliv.html", import.meta.url), "utf8");

test("kontosletning advarer i bekræftelsesdialog om GS QR Bar", () => {
  const confirmation = auth.split("\n").find((line) => line.includes('if (!confirm("ADVARSEL: Slet din konto?'));
  assert.ok(confirmation, "Advarslen skal stå i den faktiske confirm-dialog");
  assert.match(confirmation, /GS QR Bar/);
  assert.match(confirmation, /mister du OGSÅ din adgang/);
  assert.match(confirmation, /Vil du fortsætte\?/);
});

test("kontosletning forklares ved knappen og på privatlivssiden", () => {
  assert.match(auth, /id="me-delete"/);
  assert.match(auth, /<strong>Vigtigt:<\/strong> Hvis du også bruger GS QR Bar/);
  assert.match(privacy, /Vigtig advarsel om GS QR Bar/);
  assert.match(privacy, /QR-links, kampagner eller statistik/);
});

test("brugerens forslag slettes helt med kontoen, og teksten siger det", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261116120000_delete_account.sql", import.meta.url), "utf8");
  assert.match(sql, /delete from public\.suggestions where user_id = me;/);
  assert.doesNotMatch(sql, /update public\.suggestions/);
  assert.match(auth, /Forslag, du har sendt, slettes også\./);
  assert.doesNotMatch(auth, /uden din note/);
  assert.match(privacy, /slettes helt: navn, link og note/);
  assert.doesNotMatch(privacy, /beholdes uden kontotilknytning/);
});
