// ConferenceHub beta: login, deltagelse, "Vis aktivitet", grupper og forslag.
// Bygger oven på app.js via window.CH og eventet "ch:rendered".
"use strict";
(() => {
  const cfg = window.CH_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const account = $("account");
  if (!cfg.supabaseUrl || !cfg.publishableKey || !window.supabase) return; // login er ikke sat op endnu

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.publishableKey, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STATUS = { going: "Deltager", considering: "Overvejer", abstract_submitted: "Abstract indsendt" };
  const VIS = [
    ["group", "Min gruppe", "Kun medlemmer af dine grupper kan se, hvad du deltager i."],
    ["all", "Alle", "Alle, der er logget ind på ConferenceHub, kan se det."],
    ["none", "Ingen", "Kun du selv kan se det. Du vises heller ikke på gruppens liste."],
  ];
  const ROLES = [["", "Vælg"], ["doctor", "Læge"], ["nurse", "Sygeplejerske"], ["other", "Andet"]];

  let me = null, profile = null, groups = [], mine = new Map(), crowd = new Map();

  // Invitationslink: ?join=<kode> huskes, til brugeren er logget ind.
  const joinParam = new URLSearchParams(location.search).get("join");
  if (joinParam) { try { sessionStorage.setItem("ch_join", joinParam); } catch { /* privat vindue */ } }

  function toast(msg) {
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove("show"), 4500);
  }

  // ---------------------------------------------------------------- data
  async function load() {
    const { data: { session } } = await sb.auth.getSession();
    me = session?.user || null;
    profile = null; groups = []; mine = new Map(); crowd = new Map();
    if (me) {
      let code = null; try { code = sessionStorage.getItem("ch_join"); } catch { /* ok */ }
      if (code) {
        const { error } = await sb.rpc("join_group", { code });
        try { sessionStorage.removeItem("ch_join"); } catch { /* ok */ }
        if (joinParam) history.replaceState(null, "", location.pathname + location.hash);
        toast(error ? `Kunne ikke melde dig ind: ${error.message}` : "Du er nu medlem af gruppen.");
      }
      const [p, gm, att] = await Promise.all([
        sb.from("profiles").select("id,display_name,role,activity_visibility").eq("id", me.id).single(),
        sb.from("group_members").select("role, groups(id,name,invite_code)").eq("user_id", me.id),
        sb.from("attendance").select("user_id,edition_id,status"),
      ]);
      profile = p.data;
      groups = (gm.data || []).filter((r) => r.groups).map((r) => ({ ...r.groups, myRole: r.role }));
      const rows = att.data || [];
      mine = new Map(rows.filter((a) => a.user_id === me.id).map((a) => [a.edition_id, a.status]));
      const others = rows.filter((a) => a.user_id !== me.id);
      const ids = [...new Set(others.map((a) => a.user_id))];
      const names = ids.length ? (await sb.from("profiles").select("id,display_name").in("id", ids)).data || [] : [];
      const nameOf = Object.fromEntries(names.map((n) => [n.id, n.display_name]));
      for (const a of others) {
        if (!crowd.has(a.edition_id)) crowd.set(a.edition_id, []);
        crowd.get(a.edition_id).push({ name: nameOf[a.user_id] || "En kollega", status: a.status });
      }
    }
    renderAccount(); decorate(); renderMe();
  }

  // ---------------------------------------------------------------- konto i toppen
  function renderAccount() {
    if (!me) {
      account.innerHTML = `<button class="btn" type="button" data-login>Log ind</button>`;
      return;
    }
    account.innerHTML = `<a href="#mig">${esc(profile?.display_name || "Min side")}</a>
      <button class="linklike" type="button" id="logout">Log ud</button>`;
    $("logout").onclick = async () => { await sb.auth.signOut(); location.hash = ""; await load(); toast("Du er logget ud."); };
  }

  // ---------------------------------------------------------------- login
  const dlg = $("login-dialog");
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("[data-login]")) { $("login-msg").textContent = ""; dlg.showModal(); }
  });
  $("login-google").onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname + location.search } });
    if (error) $("login-msg").textContent = `Google-login virker ikke endnu: ${error.message}`;
  };
  if (cfg.emailLogin) {
    $("login-email").hidden = false;
    $("login-email").onsubmit = async (ev) => {
      ev.preventDefault();
      const email = $("login-email-input").value.trim();
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      $("login-msg").textContent = error ? `Kunne ikke sende link: ${error.message}` : `Tjek din mail (${email}) og klik på linket.`;
    };
  }

  // ---------------------------------------------------------------- deltagelse på hver konference
  function decorate() {
    document.querySelectorAll(".crowd[data-ed]").forEach((el) => {
      const n = (crowd.get(el.dataset.ed) || []).length + (mine.has(el.dataset.ed) ? 1 : 0);
      el.textContent = n ? `${n} med` : "";
    });
    document.querySelectorAll(".mine[data-ed]").forEach((el) => {
      const id = el.dataset.ed, past = el.dataset.past === "1";
      const others = crowd.get(id) || [];
      const list = others.length
        ? `<p class="who">${others.map((o) => `${esc(o.name)} (${STATUS[o.status].toLowerCase()})`).join(", ")}</p>` : "";
      if (!me) {
        el.innerHTML = past ? "" : `<p class="hint"><button class="linklike" type="button" data-login>Log ind</button> for at melde din deltagelse og se, hvem fra din gruppe der skal med.</p>`;
        return;
      }
      if (past) { el.innerHTML = list; return; }
      const cur = mine.get(id);
      el.innerHTML = `<div class="choice" role="group" aria-label="Din deltagelse">
          ${Object.entries(STATUS).map(([k, v]) => `<button type="button" data-att="${k}" data-ed="${esc(id)}" aria-pressed="${cur === k}">${v}</button>`).join("")}
          ${cur ? `<button type="button" class="linklike" data-att="" data-ed="${esc(id)}">Fjern</button>` : ""}
        </div>${list}
        ${profile?.activity_visibility === "none" ? `<p class="hint">Din aktivitet er skjult for andre. Du kan ændre det under <a href="#mig">Min side</a>.</p>` : ""}`;
    });
  }
  document.addEventListener("ch:rendered", decorate);
  document.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-att]");
    if (!b || !me) return;
    const id = b.dataset.ed, status = b.dataset.att;
    const res = status
      ? await sb.from("attendance").upsert({ user_id: me.id, edition_id: id, status, updated_at: new Date().toISOString() })
      : await sb.from("attendance").delete().eq("user_id", me.id).eq("edition_id", id);
    if (res.error) { toast(`Kunne ikke gemme: ${res.error.message}`); return; }
    if (status) mine.set(id, status); else mine.delete(id);
    decorate(); renderMe();
    toast(status ? `Gemt: ${STATUS[status]}.` : "Din deltagelse er fjernet.");
  });

  // ---------------------------------------------------------------- Min side
  function renderMe() {
    const sec = $("mig");
    const show = location.hash === "#mig";
    if (!show) { sec.hidden = true; return; }
    sec.hidden = false;
    if (!me) {
      sec.innerHTML = `<h2 id="me-title">Min side</h2><p>Log ind for at se dine konferencer og grupper.</p>
        <button class="btn" type="button" data-login>Log ind</button>`;
      return;
    }
    const { state, fmtRange } = window.CH;
    const myEds = state.editions.filter((e) => mine.has(e.id)).sort((a, b) => a.start.localeCompare(b.start));
    const origin = location.origin + location.pathname;
    sec.innerHTML = `
      <div class="me-head"><h2 id="me-title">Min side</h2><a href="#" class="linklike">Luk</a></div>
      <div class="me-grid">
        <form id="me-profile" class="panel">
          <h3>Profil</h3>
          <label for="me-name">Navn, som kolleger ser det</label>
          <input id="me-name" required maxlength="80" value="${esc(profile?.display_name)}">
          <label for="me-role">Rolle</label>
          <select id="me-role">${ROLES.map(([k, v]) => `<option value="${k}" ${profile?.role === k || (!profile?.role && !k) ? "selected" : ""}>${v}</option>`).join("")}</select>
          <button class="btn" type="submit">Gem profil</button>
        </form>

        <fieldset class="panel" id="me-vis">
          <legend><h3>Vis aktivitet</h3></legend>
          <p class="hint">Hvem kan se, hvilke konferencer du deltager i?</p>
          ${VIS.map(([k, label, help]) => `<label class="radio"><input type="radio" name="vis" value="${k}" ${profile?.activity_visibility === k ? "checked" : ""}>
            <span><strong>${label}</strong><br><span class="hint">${help}</span></span></label>`).join("")}
        </fieldset>

        <section class="panel" aria-labelledby="me-groups-title">
          <h3 id="me-groups-title">Mine grupper</h3>
          ${groups.length ? `<ul class="plain">${groups.map((g) => `<li>
              <strong>${esc(g.name)}</strong>${g.myRole === "admin" ? " (admin)" : ""}<br>
              <span class="hint">Invitationslink:</span> <code>${esc(origin)}?join=${esc(g.invite_code)}</code>
              <button class="linklike" type="button" data-copy="${esc(origin)}?join=${esc(g.invite_code)}">Kopiér</button>
              <button class="linklike" type="button" data-leave="${esc(g.id)}">Forlad</button></li>`).join("")}</ul>`
            : `<p>Du er ikke med i nogen gruppe endnu. Brug et invitationslink fra en kollega, eller opret gruppen for din afdeling.</p>`}
          <form id="me-join" class="inline-form">
            <label for="me-code">Invitationskode</label>
            <div class="inline"><input id="me-code" required autocomplete="off"><button class="btn" type="submit">Bliv medlem</button></div>
          </form>
          <form id="me-create" class="inline-form">
            <label for="me-gname">Opret ny gruppe</label>
            <div class="inline"><input id="me-gname" required maxlength="80" placeholder="Fx Herlev Plastik"><button class="btn" type="submit">Opret</button></div>
          </form>
        </section>

        <section class="panel" aria-labelledby="me-confs-title">
          <h3 id="me-confs-title">Mine konferencer</h3>
          ${myEds.length ? `<ul class="plain">${myEds.map((e) => `<li><a href="#e-${esc(e.id)}">${esc(e.name)}</a><br>
            <span class="hint">${esc(fmtRange(e.start, e.end))}, ${STATUS[mine.get(e.id)].toLowerCase()}</span></li>`).join("")}</ul>`
            : `<p>Du har ikke meldt dig til noget endnu. Åbn en konference i listen og vælg Deltager eller Overvejer.</p>`}
        </section>

        <form id="me-suggest" class="panel">
          <h3>Foreslå en konference</h3>
          <p class="hint">Udfyld navn, link eller begge dele. Forslaget tjekkes, før det kommer på listen.</p>
          <label for="sg-name">Navn</label><input id="sg-name" maxlength="200">
          <label for="sg-url">Link</label><input id="sg-url" type="url" placeholder="https://">
          <label for="sg-note">Note (valgfri)</label><textarea id="sg-note" rows="2" maxlength="1000"></textarea>
          <p class="error" id="sg-err" role="alert"></p>
          <button class="btn" type="submit">Send forslag</button>
        </form>
      </div>`;

    $("me-profile").onsubmit = async (ev) => {
      ev.preventDefault();
      const upd = { display_name: $("me-name").value.trim(), role: $("me-role").value || null };
      const { error } = await sb.from("profiles").update(upd).eq("id", me.id);
      if (error) return toast(`Kunne ikke gemme: ${error.message}`);
      Object.assign(profile, upd); renderAccount(); toast("Profilen er gemt.");
    };
    $("me-vis").onchange = async (ev) => {
      const v = ev.target.value;
      const { error } = await sb.from("profiles").update({ activity_visibility: v }).eq("id", me.id);
      if (error) return toast(`Kunne ikke gemme: ${error.message}`);
      profile.activity_visibility = v; decorate();
      toast(`Vis aktivitet: ${VIS.find((x) => x[0] === v)[1]}.`);
    };
    $("me-join").onsubmit = async (ev) => {
      ev.preventDefault();
      const code = $("me-code").value.trim().replace(/^.*[?&]join=/, "");
      const { error } = await sb.rpc("join_group", { code });
      if (error) return toast(`Kunne ikke melde dig ind: ${error.message}`);
      toast("Du er nu medlem af gruppen."); await load();
    };
    $("me-create").onsubmit = async (ev) => {
      ev.preventDefault();
      const { error } = await sb.rpc("create_group", { group_name: $("me-gname").value });
      if (error) return toast(`Kunne ikke oprette gruppen: ${error.message}`);
      toast("Gruppen er oprettet. Del invitationslinket med dine kolleger."); await load();
    };
    $("me-suggest").onsubmit = async (ev) => {
      ev.preventDefault();
      const name = $("sg-name").value.trim(), url = $("sg-url").value.trim(), note = $("sg-note").value.trim();
      if (!name && !url) { $("sg-err").textContent = "Skriv et navn eller indsæt et link."; $("sg-name").setAttribute("aria-describedby", "sg-err"); $("sg-name").focus(); return; }
      $("sg-err").textContent = "";
      const { error } = await sb.from("suggestions").insert({ user_id: me.id, name: name || null, url: url || null, note: note || null });
      if (error) return toast(`Kunne ikke sende forslaget: ${error.message}`);
      ev.target.reset(); toast("Tak. Forslaget er sendt.");
    };
  }
  document.addEventListener("click", async (ev) => {
    const c = ev.target.closest("[data-copy]");
    if (c) { try { await navigator.clipboard.writeText(c.dataset.copy); toast("Invitationslinket er kopieret."); } catch { toast("Kopiér linket manuelt."); } }
    const l = ev.target.closest("[data-leave]");
    if (l && me) {
      const { error } = await sb.from("group_members").delete().eq("group_id", l.dataset.leave).eq("user_id", me.id);
      if (error) return toast(`Kunne ikke forlade gruppen: ${error.message}`);
      toast("Du har forladt gruppen."); await load();
    }
  });
  window.addEventListener("hashchange", () => { renderMe(); if (location.hash === "#mig") $("mig").scrollIntoView({ block: "start" }); });

  // Kald aldrig andre Supabase-funktioner direkte i callbacken (kan låse); udskyd med setTimeout.
  let loaded = false;
  sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      if (dlg.open) dlg.close();
      if (loaded || event === "SIGNED_OUT") setTimeout(load, 0);
    }
  });
  load().then(() => { loaded = true; });
})();
