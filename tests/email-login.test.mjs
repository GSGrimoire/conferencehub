import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const src = readFileSync(new URL("../site/email-login.js", import.meta.url), "utf8");
const ids = ["login-email", "login-email-verify", "login-email-input", "login-email-code", "login-email-send", "login-email-confirm", "login-email-resend", "login-email-reset", "login-email-target", "login-msg"];
function createHarness(auth = {}) {
  const elements = Object.fromEntries(ids.map(id => [id, {value: "", textContent: "", hidden: false, disabled: false, focus() {this.focused = true;}}]));
  const doc = { getElementById: id => elements[id] };
  const w = {};
  const timers = new Set();
  let ms = 0;
  const clock = { now: () => ms, setInterval: (fn, interval) => {assert.equal(interval,1000); timers.add(fn); return fn;}, clearInterval: id => timers.delete(id)};
  runInNewContext(src, {window: w, document: doc});
  const controller = w.CHEmailLogin.setup(auth, doc, clock);
  const event = {preventDefault() {}};
  const advance = (delay) => {ms += delay; for(const timer of [...timers]) timer();};
  return {elements,controller,event,advance,timers};
}

test("initial state is email entry", () => {
  const {elements}=createHarness();
  assert.equal(elements["login-email"].hidden,false);
  assert.equal(elements["login-email-verify"].hidden,true);
});

test("new-user code request is sent and verification is shown", async () => {
  let sent;
  const {elements,event}=createHarness({signInWithOtp: async x => {sent=x;return {error:null};}});
  elements["login-email-input"].value="  colleague@regionh.dk  ";
  await elements["login-email"].onsubmit(event);
  assert.equal(sent.email,"colleague@regionh.dk");
  assert.equal(sent.options.shouldCreateUser,true);
  assert.equal(elements["login-email-verify"].hidden,false);
  assert.equal(elements["login-email-target"].textContent,"colleague@regionh.dk");
  assert.match(elements["login-msg"].textContent,/10 minutter/);
  assert.equal(elements["login-email-resend"].disabled,true);
  assert.match(elements["login-email-resend"].textContent,/60 s/);
});

test("valid six-digit code verifies intended address", async () => {
  let verified;
  const {elements,event}=createHarness({signInWithOtp:async()=>({error:null}),verifyOtp:async x=>{verified=x;return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-code"].value="123456";
  await elements["login-email-verify"].onsubmit(event);
  assert.equal(verified.email,"colleague@regionh.dk");
  assert.equal(verified.token,"123456");
  assert.equal(verified.type,"email");
  assert.equal(elements["login-msg"].textContent,"Du er logget ind.");
});

test("invalid code is rejected before contacting server", async () => {
  let attempts=0;
  const {elements,event}=createHarness({signInWithOtp:async()=>({error:null}),verifyOtp:async()=>{attempts++;return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-code"].value="12345";
  await elements["login-email-verify"].onsubmit(event);
  assert.equal(attempts,0);
  assert.match(elements["login-msg"].textContent,/sekscifrede/);
});

test("expired code displays Danish error and keeps verification enabled", async () => {
  const {elements,event}=createHarness({signInWithOtp:async()=>({error:null}),verifyOtp:async()=>({error:{code:"otp_expired",message:"Token has expired"}})});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  elements["login-email-code"].value="123456";
  await elements["login-email-verify"].onsubmit(event);
  assert.match(elements["login-msg"].textContent,/forkert eller udløbet/);
  assert.equal(elements["login-email-confirm"].disabled,false);
});

test("resend is disabled until 60 s and works after 60 s", async () => {
  let count=0;
  const {elements,event,advance,timers}=createHarness({signInWithOtp:async()=>{count++;return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  assert.equal(count,1);
  await elements["login-email-resend"].onclick();
  assert.equal(count,1);
  advance(59000);
  assert.equal(elements["login-email-resend"].disabled,true);
  advance(1000);
  assert.equal(elements["login-email-resend"].disabled,false);
  assert.equal(timers.size,0);
  await elements["login-email-resend"].onclick();
  assert.equal(count,2);
  assert.equal(elements["login-email-resend"].disabled,true);
});

test("reset clears verification while preserving local send cooldown", async () => {
  let count=0;
  const {elements,event,controller}=createHarness({signInWithOtp:async()=>{count++;return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  controller.reset({focus:false});
  assert.equal(elements["login-email"].hidden,false);
  assert.equal(elements["login-email-verify"].hidden,true);
  assert.equal(elements["login-email-code"].value,"");
  await elements["login-email"].onsubmit(event);
  assert.equal(count,1);
  assert.match(elements["login-msg"].textContent,/Vent 60 sekunder/);
});

test("reset supports a new email address", async () => {
  const sent=[];
  const {elements,event,controller}=createHarness({signInWithOtp:async x=>{sent.push(x.email);return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  controller.reset();
  elements["login-email-input"].value="another@example.com";
  await elements["login-email"].onsubmit(event);
  assert.deepEqual(sent,["colleague@regionh.dk","another@example.com"]);
});

test("send errors are Danish and do not reveal raw server details", async () => {
  const {elements,event}=createHarness({signInWithOtp:async()=>({error:{code:"over_email_send_rate_limit",message:"too many requests"}})});
  elements["login-email-input"].value="colleague@regionh.dk";
  await elements["login-email"].onsubmit(event);
  assert.match(elements["login-msg"].textContent,/For mange forsøg/);
  assert.equal(elements["login-email"].hidden,false);
  assert.equal(elements["login-email-send"].disabled,false);
});

test("in-flight send prevents duplicate requests", async () => {
  let resolve;let calls=0;
  const promise=new Promise(r=>{resolve=r;});
  const {elements,event}=createHarness({signInWithOtp:async()=>{calls++;await promise;return {error:null};}});
  elements["login-email-input"].value="colleague@regionh.dk";
  const first=elements["login-email"].onsubmit(event);
  await elements["login-email"].onsubmit(event);
  assert.equal(calls,1);
  resolve();await first;
  assert.equal(elements["login-email-send"].disabled,false);
});

test("site integration retains Google and feature disabled", () => {
  const config=readFileSync(new URL("../site/config.js",import.meta.url),"utf8");
  const html=readFileSync(new URL("../site/index.html",import.meta.url),"utf8");
  const auth=readFileSync(new URL("../site/auth.js",import.meta.url),"utf8");
  assert.ok(config.includes("emailLogin: false"));
  assert.ok(html.includes('id="login-google"'));
  assert.ok(html.includes('id="login-email-resend"'));
  assert.ok(html.indexOf('src="email-login.js"') < html.indexOf('src="auth.js"'));
  assert.ok(auth.includes("emailLogin?.reset({ focus: false })"));
  assert.ok(auth.includes("window.CHEmailLogin.setup(sb.auth)"));
});

test("both new-user and returning-user email templates send a code valid for ten minutes", () => {
  for (const name of ["confirm_signup_code.html", "magic_link_code.html"]) {
    const content = readFileSync(new URL("../supabase/templates/" + name, import.meta.url), "utf8");
    assert.ok(content.includes("{{ .Token }}"));
    assert.ok(content.includes("10 minutter"));
    assert.ok(!content.includes("{{ .ConfirmationURL }}"));
  }
});
