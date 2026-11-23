import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const src = readFileSync(new URL("../site/email-login.js", import.meta.url), "utf8");
const ids = ["login-email", "login-email-verify", "login-email-input", "login-email-code", "login-email-send", "login-email-confirm", "login-email-reset", "login-email-target", "login-msg"];
function createHarness(auth) {
  const elements = Object.fromEntries(ids.map(id => [id, { value: "", textContent: "", hidden: false, disabled: false, focus() { this.focused = true; } }]));
  const doc = { getElementById: id => elements[id] };
  const w = {};
  runInNewContext(src, { window: w, document: doc });
  w.CHEmailLogin.setup(auth, doc);
  const event = { preventDefault() {} };
  return { elements, event };
}

test("email sign-in is initially available with a hidden verification form", () => {
  const { elements } = createHarness({});
  assert.equal(elements["login-email"].hidden, false);
  assert.equal(elements["login-email-verify"].hidden, true);
});

test("sending a code enables verification, with new-user signup permitted", async () => {
  let args;
  const { elements, event } = createHarness({signInWithOtp: async x => { args = x; return { error: null }; }});
  elements["login-email-input"].value = "  colleague@regionh.dk  ";
  await elements["login-email"].onsubmit(event);
  assert.equal(args.email, "colleague@regionh.dk");
  assert.equal(args.options.shouldCreateUser, true);
  assert.equal(elements["login-email-target"].textContent, "colleague@regionh.dk");
  assert.equal(elements["login-email"].hidden, true);
  assert.equal(elements["login-email-verify"].hidden, false);
  assert.equal(elements["login-email-code"].focused, true);
});

test("the six-digit code is verified against the intended email", async () => {
  let args;
  const { elements, event } = createHarness({
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async x => { args = x; return { error: null }; },
  });
  elements["login-email-input"].value = "colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-code"].value = "123456";
  await elements["login-email-verify"].onsubmit(event);
  assert.equal(args.email, "colleague@regionh.dk");
  assert.equal(args.token, "123456");
  assert.equal(args.type, "email");
  assert.equal(elements["login-msg"].textContent, "Du er logget ind.");
});

test("invalid codes and transport errors do not claim success", async () => {
  let requests = 0;
  const { elements, event } = createHarness({
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => { requests++; return { error: { message: "Udløbet" } }; },
  });
  elements["login-email-input"].value = "colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-code"].value = "12345";
  await elements["login-email-verify"].onsubmit(event);
  assert.equal(requests, 0);
  elements["login-email-code"].value = "123456";
  await elements["login-email-verify"].onsubmit(event);
  assert.equal(requests, 1);
  assert.match(elements["login-msg"].textContent, /Udløbet/);
  assert.equal(elements["login-email-confirm"].disabled, false);
});

test("resend/reset lets the user choose a new email address", async () => {
  const { elements, event } = createHarness({signInWithOtp: async () => ({ error: null })});
  elements["login-email-input"].value = "colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-reset"].onclick();
  assert.equal(elements["login-email"].hidden, false);
  assert.equal(elements["login-email-verify"].hidden, true);
  assert.equal(elements["login-email-input"].focused, true);
});

test("the sign-in option stays disabled in production and Google remains intact", () => {
  const config = readFileSync(new URL("../site/config.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../site/index.html", import.meta.url), "utf8");
  const auth = readFileSync(new URL("../site/auth.js", import.meta.url), "utf8");
  assert.match(config, /emailLogin:\\s*false/);
  assert.match(html, /id="login-google"/);
  assert.match(html, /id="login-email-code"/);
  assert.ok(html.indexOf('src="email-login.js"') < html.indexOf('src="auth.js"'));
  assert.match(auth, /CHEmailLogin\\.setup\\(sb\\.auth\\)/);
});
test("a sending failure leaves the email entry screen available", async () => {
  const { elements, event } = createHarness({
    signInWithOtp: async () => ({ error: { message: "Afsendelse er endnu ikke konfigureret" } }),
  });
  elements["login-email-input"].value = "colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  assert.equal(elements["login-email"].hidden, false);
  assert.equal(elements["login-email-verify"].hidden, true);
  assert.equal(elements["login-email-send"].disabled, false);
  assert.match(elements["login-msg"].textContent, /ikke konfigureret/);
});
