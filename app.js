/* e-Karmakshetra prototype UI (v3, game edition). Rules live in src/core.js, effects in src/fx.js.
   Data is kept in the browser (localStorage). */
(function () {
  "use strict";
  const KEY = "ek_state_v4";
  const S = EK.STATUS;
  let state, sample, tab = "map", uid = null, officialLayer = false, flash = null, minutes = 0, animate = true, rankWard = "";
  const $ = (s) => document.querySelector(s);
  const todayStr = () => { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (typeof v === "function") el[k] = v;
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    kids.flat().forEach(c => c != null && el.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return el;
  }
  const shared = () => !!(window.SYNC && SYNC.enabled && SYNC.ref);
  const save = () => { try { if (shared()) localStorage.setItem("ek_local_v3", JSON.stringify({ minutes, uid })); else localStorage.setItem(KEY, JSON.stringify({ state, minutes })); } catch (e) {} };
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.state) { state = d.state; minutes = d.minutes || 0; return true; } } catch (e) {} return false; };
  const me = () => state.users.find(u => u.id === uid);
  const user = (id) => state.users.find(u => u.id === id);
  const pName = (id) => (state.prabhags.find(p => p.id === id) || {}).name || id;
  const tagClass = (st) => ({ [S.PENDING]: "pending", [S.AWAITING]: "awaiting", [S.VERIFIED]: "verified", [S.REVISE]: "revise", [S.REJECTED]: "rejected", [S.TRIBUNAL]: "dispute" }[st]);
  const tag = (st) => h("span", { class: "tag " + tagClass(st) }, st.replace(/_/g, " ").toLowerCase());
  const xpOf = (id) => EK.totalXp(state, id);
  const PK = "ek_prefs_v1"; let prefs = { theme: "arcade", audio: 1, field: null };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PK)) || {}); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem(PK, JSON.stringify(prefs)); } catch (e) {} };
  const fieldOn = () => prefs.field === null ? TOWN.shouldAutoFieldMode(navigator) : !!prefs.field;
  const nowMs = () => Date.now() + ((state.town && state.town.clockOffset) || 0);
  const townCtx = { h, state: () => state, me: () => me(), act: (...a) => act(...a), avatar: (u, n) => avatar(u, n), pName: (id) => pName(id), now: nowMs, rerender: () => render(),
    field: fieldOn, fx: () => FX.get().fx, userName: (id) => { const u = user(id); return u ? (u.isProfilePublic ? u.pseudonym : "Anonymous resident") : "?"; } };
  function applyPrefs() {
    document.body.dataset.theme = prefs.theme; document.body.classList.toggle("field", fieldOn());
    if (fieldOn()) FX.setPref("fx", false);
    FX.setPref("sound", prefs.audio > 0); FX.setPref("ambient", prefs.audio === 2);
    const u = state && me(); const w = u && state.prabhags.find(p => p.id === u.prabhag);
    if (prefs.audio === 2 && w && !fieldOn()) FX.ambient(w.sound || "water"); else FX.ambient(null);
  }

  /* ---------- avatars ---------- */
  function avatar(u, size) {
    const a = u.avatar || { type: "initials" }, el = h("span", { class: "av", style: `--s:${size || 44}px`, "aria-hidden": "true" });
    if (a.type === "photo") el.append(h("img", { src: a.value, alt: "" }));
    else if (a.type === "emoji") el.append(h("span", { class: "emo" }, a.value));
    else el.append(h("span", { class: "ini" }, u.pseudonym.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?"));
    return el;
  }
  function shrinkImage(file, cb) {
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => {
      const c = document.createElement("canvas"), n = 96, r = Math.min(img.width, img.height); c.width = c.height = n;
      c.getContext("2d").drawImage(img, (img.width - r) / 2, (img.height - r) / 2, r, r, 0, 0, n, n); cb(c.toDataURL("image/jpeg", 0.8)); };
      img.onerror = () => cb(null); img.src = fr.result; };
    fr.onerror = () => cb(null); fr.readAsDataURL(file);
  }

  /* ---------- seed ---------- */
  function seed() {
    const day = "2000-01-01";
    state = EK.newState(sample.prabhags);
    const byName = {}, faces = EK.AVATARS;
    sample.users.forEach((u, i) => { byName[u.name] = EK.registerUser(state, { name: u.name, pseudonym: u.pseudonym, prabhag: u.prabhag, age: u.age, role: u.role, official: u.official, admin: u.admin, isSaathi: u.isSaathi }); });
    const off = byName["Official Demo"];
    Object.values(byName).forEach((u, i) => { u.verified = true; if (!u.official) EK.setProfile(state, u.id, { showOnLeaderboard: true, avatar: i % 4 === 0 ? { type: "initials" } : { type: "emoji", value: faces[i % faces.length] } }); });
    const peers = sample.users.filter(u => !u.official).map(u => byName[u.name]);
    sample.reports.forEach(r => {
      const by = byName[r.by];
      if (r.kind) EK.setRole(state, by.id, ({ solution: "solver", pilot: "pilot", campaign: "promoter", delivery: "deliverer" })[r.kind]);
      const rep = EK.submitReport(state, by.id, { kind: r.kind, category: r.category, text: r.text, hasPhoto: true, photoName: "sample.jpg", lat: r.lat, lng: r.lng, day });
      peers.filter(p => p.id !== by.id).slice(0, r.peers).forEach(p => EK.confirmReport(state, rep.id, p.id, day));
      if (r.approve) EK.officialApprove(state, rep.id, off.id, day);
    });
    seedTown(byName);
    minutes = 0;
  }
  function seedTown(by) {   // a lived-in sample town so judges see buildings, a shop and a show straight away
    const now = Date.now(), adm = by["Official Demo"], o2 = by["Officer Two Demo"];
    TOWN.ensure(state);
    ["Asha Demo", "Farid Demo", "Kavya Demo", "Bhushan Demo", "Chitra Demo", "Gauri Demo", "Dinesh Demo"].forEach(n => TOWN.demoGrant(state, adm.id, by[n].id, n === "Asha Demo" ? 400 : n === "Dinesh Demo" ? 300 : 200, now));
    const asha = by["Asha Demo"], farid = by["Farid Demo"], bh = by["Bhushan Demo"], gauri = by["Gauri Demo"], chitra = by["Chitra Demo"];
    TOWN.claimPlot(state, asha.id, 1, 1, now); TOWN.verifyMaker(state, adm.id, asha.id, now); TOWN.upgradePlot(state, asha.id, state.town.plots[0].id, now); TOWN.upgradePlot(state, asha.id, state.town.plots[0].id, now);
    const sh = TOWN.submitShop(state, asha.id, { name: "Asha Crochet Corner", desc: "Hand-embroidered crochet keychains made by a student, in many colours.", product: "Crochet keychains", template: "boutique", accent: "#ff3d9a", link: "https://example.com" }, now);
    TOWN.reviewShop(state, adm.id, sh.id, true, "", now);
    TOWN.claimPlot(state, farid.id, 2, 0, now); TOWN.claimPlot(state, by["Kavya Demo"].id, 0, 2, now); TOWN.claimPlot(state, bh.id, 0, 0, now);
    TOWN.applyRole(state, gauri.id, "theatre_manager", now); TOWN.decideRole(state, adm.id, state.town.roleReqs[0].id, true, now);
    const show = TOWN.proposeShow(state, chitra.id, { title: "Lake Clean-up Street Play", desc: "A 20 minute street play about keeping Mehrun Lake clean.", minutes: 20, startMs: now + 2 * 86400000, mode: "audio", ticket: 2, vodPrice: 1 }, now);
    TOWN.reviewShow(state, gauri.id, show.id, true, "", now);
  }
  const defaultUser = () => state.users.find(u => u.pseudonym === "Dinesh-P1");
  function buildSeedState() { const keep = state, keepMin = minutes; seed(); const s = state; state = keep; minutes = keepMin; s.quests = sample.quests; return s; }
  let pendingRender = false;
  function softRender() {   // do not wipe what someone is typing when another person's change arrives
    const a = document.activeElement;
    if (a && a.closest && a.closest("#view") && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pendingRender = true; return; }
    render();
  }

  /* ---------- actions with game feedback ---------- */
  function celebrate(id0, before, xp0, ok, kind) {
    flash = { type: "ok", text: ok };
    const after = EK.levelFor(xpOf(id0)), gain = xpOf(id0) - xp0;
    if (kind === "verified") { FX.play("xp"); FX.banner("VERIFIED ✓", "Points minted for the reporter and confirming peers"); FX.confetti(140); }
    else if (after.index > before.index) { FX.play("level"); FX.banner("LEVEL UP: " + after.name, "Level " + after.level + " reached"); FX.confetti(160); }
    else if (kind === "plot") { FX.play("level"); FX.confetti(120); FX.banner("PLOT UPGRADED", "Your town is growing"); }
    else if (gain > 0) { FX.play("xp"); FX.pop("+" + gain + " XP"); FX.confetti(70); }
    else FX.play("ok");
  }
  function fail(e) { flash = { type: "err", text: e.message || String(e) }; FX.play("error"); render(); }
  function act(fn, ok, kind) {
    const id0 = uid, before = EK.levelFor(xpOf(id0)), xp0 = xpOf(id0);
    if (shared()) {   // shared mode: run the action atomically on the shared state
      SYNC.transact((draft) => { const prev = state; state = draft; state.quests = sample.quests; try { fn(); } finally { state = prev; } })
        .then(() => { save(); celebrate(id0, before, xp0, ok, kind); render(); }).catch(fail);
      return;
    }
    try { fn(); save(); celebrate(id0, before, xp0, ok, kind); } catch (e) { flash = { type: "err", text: e.message }; FX.play("error"); }
    render();
  }

  /* ---------- HUD ---------- */
  function hud() {
    const u = me(), box = $("#hud"); box.innerHTML = "";
    if (u.official) { box.append(h("div", { class: "hudcard" }, avatar(u, 52), h("div", { class: "hudtxt" }, h("strong", {}, u.pseudonym), h("small", {}, "Official · " + pName(u.prabhag))))); return; }
    const xp = xpOf(u.id), lv = EK.levelFor(xp), b = EK.badgesFor(state, u.id).filter(x => x.earned).length;
    box.append(h("div", { class: "hudcard" }, avatar(u, 56),
      h("div", { class: "hudtxt" }, h("strong", {}, u.pseudonym), h("small", {}, pName(u.prabhag)),
        h("div", { class: "lvrow" }, h("span", { class: "lvbadge" }, "LV " + lv.level), h("b", {}, lv.name),
          h("div", { class: "xpbar", role: "progressbar", "aria-valuenow": String(lv.progress), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": "XP progress" }, h("i", { style: `width:${lv.progress}%` })),
          h("small", {}, lv.next ? `${xp} / ${lv.next} XP` : `${xp} XP · max`))),
      h("div", { class: "hudstats" }, h("div", {}, h("b", {}, EK.balance(state, u.id)), h("small", {}, "points")), h("div", {}, h("b", {}, EK.questXp(state, u.id)), h("small", {}, "quest XP")), h("div", {}, h("b", {}, b), h("small", {}, "badges")))));
  }

  /* ---------- map ---------- */
  function project(lat, lng) {
    const ps = state.prabhags, minLat = Math.min(...ps.map(p => p.lat)) - 0.006, maxLat = Math.max(...ps.map(p => p.lat)) + 0.006;
    const minLng = Math.min(...ps.map(p => p.lng)) - 0.012, maxLng = Math.max(...ps.map(p => p.lng)) + 0.012;
    return [40 + (lng - minLng) / (maxLng - minLng) * 620, 30 + (maxLat - lat) / (maxLat - minLat) * 340];
  }
  function mapView() {
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 700 400"); svg.setAttribute("class", "map");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Stylised Prabhag map of the pilot town");
    const add = (n, a, t) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); if (t) e.textContent = t; svg.appendChild(e); return e; };
    state.prabhags.forEach(p => { const [x, y] = project(p.lat, p.lng); add("ellipse", { class: "ward", cx: x, cy: y, rx: 95, ry: 62 }); add("text", { x: x - 50, y: y - 48 }, p.name); });
    const colour = { [S.PENDING]: "#ff9f1c", [S.AWAITING]: "#22e3ff", [S.VERIFIED]: "#3be08f", [S.REVISE]: "#ffd34e", [S.REJECTED]: "#ff5c7a", [S.TRIBUNAL]: "#ff5c7a" };
    const isOff = me() && me().official, seen = {};
    state.reports.forEach(r => {
      let x, y, title;
      if (officialLayer && isOff) { [x, y] = project(r.exactLat, r.exactLng); title = `${r.category}: ${r.text} @ ${r.exactLat.toFixed(4)}, ${r.exactLng.toFixed(4)}`; }
      else { const p = EK.publicView(state, r), [cx, cy] = project(p.centroid.lat, p.centroid.lng); const i = seen[r.prabhag] = (seen[r.prabhag] || 0) + 1; x = cx - 45 + (i % 6) * 18; y = cy + 8 + Math.floor(i / 6) * 18; title = `${p.category}: ${p.text} (${p.status})`; }
      const c = add("circle", { cx: x, cy: y, r: 8, fill: colour[r.status], stroke: "#fff", "stroke-width": 1.5, class: "pin" });
      const t = document.createElementNS(ns, "title"); t.textContent = title; c.appendChild(t);
    });
    const toggle = h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { officialLayer = e.target.checked; render(); }, checked: officialLayer && isOff ? "checked" : false, disabled: isOff ? false : "disabled" }), "Official layer: exact positions (officials only)");
    const lg = (c, t) => h("span", {}, h("i", { class: "dot", style: `background:${c}` }), t);
    return h("div", { class: "card" }, h("h2", {}, "Mirror map: " + (officialLayer && isOff ? "official layer (exact)" : "public layer (Prabhag pins)")), svg,
      h("div", { class: "legend" }, lg("#ff9f1c", "peer review"), lg("#22e3ff", "awaiting official"), lg("#3be08f", "verified"), lg("#ffd34e", "needs revision"), lg("#ff5c7a", "rejected / tribunal")), toggle);
  }

  /* ---------- file ---------- */
  function fileView() {
    const u = me();
    const role = h("select", { onchange: (e) => act(() => EK.setRole(state, u.id, e.target.value), "Role switched.") },
      Object.entries(EK.ROLES).map(([k, v]) => h("option", { value: k, selected: u.role === k ? "selected" : false }, v.label + " (" + EK.RULES.KIND_POINTS[v.kind] + " pts)")));
    const cat = h("select", {}, EK.CATEGORIES.map(c => h("option", { value: c }, c)));
    const txt = h("textarea", { rows: "3", placeholder: "Describe it (at least 10 characters)" });
    const photo = h("input", { type: "file", accept: "image/*" });
    const ben = u.isSaathi ? h("input", { placeholder: "Beneficiary name (filing on someone's behalf, optional)" }) : null;
    const go = h("button", { class: "cta", onclick: () => act(() => {
      const p = state.prabhags.find(x => x.id === u.prabhag);
      EK.submitReport(state, u.id, { category: cat.value, text: txt.value, hasPhoto: photo.files.length > 0, photoName: photo.files[0] && photo.files[0].name, day: todayStr(),
        lat: p.lat + (Math.random() - .5) * 0.008, lng: p.lng + (Math.random() - .5) * 0.012, saathiFor: ben && ben.value.trim() ? ben.value : undefined });
    }, `Submitted. It needs ${state.config.peersNeeded} peer confirmations, then an official review.`) }, "Submit");
    const mine = state.reports.filter(r => r.reporterId === u.id).map(r => {
      const items = [h("div", { class: "row" }, tag(r.status), h("strong", {}, r.kind), h("span", {}, r.text)),
        h("small", { class: "muted" }, `Peers ${r.confirmations.length}/${state.config.peersNeeded} · flags ${r.flags.length}/${EK.RULES.FLAGS_NEEDED} · revival chances ${r.revivalChances}/${EK.RULES.REVIVAL_CHANCES}`)];
      if (r.status === S.REVISE) {
        const t2 = h("textarea", { rows: "2", placeholder: "Improve your description and add a new photo" }), p2 = h("input", { type: "file", accept: "image/*" });
        items.push(t2, p2, h("button", { onclick: () => act(() => EK.reviseReport(state, r.id, u.id, { text: t2.value, hasPhoto: p2.files.length > 0, photoName: p2.files[0] && p2.files[0].name, day: todayStr() }), "Revised and sent back to peer review.") }, "Resubmit"));
      }
      return h("div", { class: "card" }, items);
    });
    return h("div", { class: "stack" }, h("div", { class: "card" }, h("h2", {}, "New mission"),
      h("p", { class: "sub" }, `${u.pseudonym} · ${pName(u.prabhag)} · age group ${u.ageBracket}`),
      h("label", {}, "Active role"), role, h("label", {}, "Category"), cat, h("label", {}, "Description"), txt,
      h("label", {}, "Photo evidence (required; kept in your browser in this prototype)"), photo, ben ? [h("label", {}, "Digital Saathi mode"), ben] : [], h("p", {}, go)),
      mine.length ? h("div", { class: "stack" }, h("h2", { class: "sec" }, "My missions"), mine) : []);
  }

  /* ---------- review ---------- */
  function reviewView() {
    const u = me();
    if (u.official) return h("div", { class: "card" }, h("p", {}, "Officials review from the Official page. Peer review is for residents."));
    const open = state.reports.filter(r => r.status === S.PENDING && r.reporterId !== u.id);
    const rows = open.map(r => {
      const done = r.confirmations.includes(u.id) || r.flags.includes(u.id);
      const why = h("input", { placeholder: "Reason if flagging", style: "min-width:140px" });
      return h("tr", {}, h("td", {}, r.kind + " / " + r.category), h("td", {}, r.text, h("br"), h("small", { class: "muted" }, pName(r.prabhag) + " · photo: " + r.evidence.photoName)),
        h("td", {}, h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, r.confirmations.length / state.config.peersNeeded * 100)}%` })), `${r.confirmations.length}/${state.config.peersNeeded}`),
        h("td", {}, done ? "Reviewed" : h("div", { class: "row" }, h("button", { onclick: () => act(() => EK.confirmReport(state, r.id, u.id, todayStr()), "Confirmed. You earn peer points if an official verifies it.") }, "Confirm"), why,
          h("button", { class: "ghost", onclick: () => act(() => EK.flagReport(state, r.id, u.id, why.value, todayStr()), "Flag recorded. Three flags cost the reporter one revival chance.") }, "Flag"))));
    });
    return h("div", { class: "card" }, h("h2", {}, "Peer review queue"), h("p", { class: "sub" }, "Confirm only what you can honestly verify. Peer points are paid after official verification, never before."),
      rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Type", "Submission", "Peers", "Your review"].map(x => h("th", {}, x)))), h("tbody", {}, rows))) : h("p", {}, "Nothing to review."));
  }

  /* ---------- quests ---------- */
  function questCard(q) {
    const u = me(), p = EK.questProgress(state, u.id, q, todayStr()), pct = Math.round(p.progress / p.goal * 100);
    const when = q.period === "festive" ? `${q.event} · ${p.window.from} to ${p.window.to}` : q.period;
    const btn = p.status === "ready" ? h("button", { class: "cta", onclick: () => act(() => EK.claimQuest(state, u.id, q.id, todayStr()), `Quest complete: +${q.xp} XP`) }, `Claim +${q.xp} XP`)
      : h("span", { class: "tag " + (p.status === "claimed" ? "verified" : p.status === "active" ? "awaiting" : "pending") }, p.status);
    return h("div", { class: "quest " + p.status }, h("div", { class: "qhead" }, h("strong", {}, q.title), h("small", {}, when)), h("p", {}, q.text),
      h("div", { class: "row" }, h("div", { class: "bar" }, h("i", { style: `width:${pct}%` })), h("small", {}, `${p.progress}/${p.goal}`), h("span", { class: "xpchip" }, "+" + q.xp + " XP"), btn));
  }
  function questView() {
    const u = me();
    if (u.official) return h("div", { class: "card" }, h("p", {}, "Quests are for residents."));
    const group = (title, list) => list.length ? h("div", { class: "card" }, h("h2", {}, title), h("div", { class: "qgrid" }, list.map(questCard))) : null;
    const f = state.quests.filter(q => q.period === "festive"), now = todayStr();
    const rank = (q) => { const s = EK.questProgress(state, u.id, q, now).status; return { ready: 0, active: 1, upcoming: 2, claimed: 3, ended: 4 }[s]; };
    f.sort((a, b) => rank(a) - rank(b) || a.from.localeCompare(b.from));
    return h("div", { class: "stack" }, h("p", { class: "sub" }, "Quests give Quest XP: recognition and levels only. They never change your points ledger and are never money."),
      group("Daily quests", state.quests.filter(q => q.period === "daily")), group("Monthly quests", state.quests.filter(q => q.period === "monthly")),
      group("Yearly quest", state.quests.filter(q => q.period === "yearly")), group("Festive and special events", f));
  }

  /* ---------- rank ---------- */
  function rankView() {
    const u = me(), sel = h("select", { onchange: (e) => { rankWard = e.target.value; render(); } }, h("option", { value: "" }, "All Prabhags"), state.prabhags.map(p => h("option", { value: p.id, selected: rankWard === p.id ? "selected" : false }, p.name)));
    const list = EK.leaderboard(state, rankWard), medal = ["🥇", "🥈", "🥉"];
    const rows = list.map((x, i) => { const you = x.userId === u.id; return h("tr", { class: you ? "you" : "" }, h("td", {}, medal[i] || i + 1), h("td", {}, h("div", { class: "row" }, avatar(user(x.userId), 32), h("b", {}, x.pseudonym + (you ? " (you)" : "")))), h("td", {}, pName(x.prabhag)), h("td", {}, x.level), h("td", {}, x.xp)); });
    return h("div", { class: "card" }, h("h2", {}, "Leaderboard"), h("p", { class: "sub" }, "Opt-in only. Shows pseudonyms and levels, never locations. Turn yourself on or off in Me."), sel,
      rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["#", "Player", "Prabhag", "Level", "XP"].map(x => h("th", {}, x)))), h("tbody", {}, rows))) : h("p", {}, "No one has joined the leaderboard here yet."));
  }

  /* ---------- me ---------- */
  function meView() {
    const u = me();
    const pick = (a, label) => h("button", { class: "avbtn" + (u.avatar.type === a.type && u.avatar.value === (a.value || "") ? " on" : ""), title: label, "aria-label": label, onclick: () => act(() => EK.setProfile(state, u.id, { avatar: a }), "Profile picture updated.") },
      a.type === "emoji" ? a.value : "Aa");
    const choices = [pick({ type: "initials" }, "Initials badge")].concat(EK.AVATARS.map(e => pick({ type: "emoji", value: e }, "Avatar " + e)));
    const up = h("input", { type: "file", accept: "image/*", "aria-label": "Upload a profile photo", onchange: (e) => { const f = e.target.files[0]; if (!f) return; shrinkImage(f, (d) => act(() => { if (!d) throw new Error("Could not read that image"); EK.setProfile(state, u.id, { avatar: { type: "photo", value: d } }); }, "Photo saved in your browser only.")); } });
    const toggle = (label, key, help) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: u[key] ? "checked" : false, onchange: (e) => act(() => EK.setProfile(state, u.id, { [key]: e.target.checked }), "Setting saved.") }), h("span", {}, label, h("small", { class: "muted" }, " " + help)));
    const badges = EK.badgesFor(state, u.id).map(b => h("div", { class: "badge" + (b.earned ? " on" : "") }, h("span", { class: "bi" }, b.icon), h("b", {}, b.name), h("small", {}, b.earned ? "Unlocked" : b.how)));
    const xp = xpOf(u.id), ladder = EK.LEVELS.map((l, i) => h("li", { class: xp >= l.xp ? "on" : "" }, h("b", {}, "LV " + (i + 1) + " · " + l.name), h("small", {}, l.xp + " XP")));
    return h("div", { class: "stack" },
      h("div", { class: "card" }, h("h2", {}, "My profile picture"), h("div", { class: "row big" }, avatar(u, 72), h("small", { class: "muted" }, "Pick a badge, use your initials, or upload a photo. Photos are shrunk and stay in your own browser in this prototype.")),
        h("div", { class: "avgrid" }, choices), h("label", {}, "Upload a photo (optional)"), up,
        toggle("Public profile", "isProfilePublic", "Your pseudonym shows on the public map and leaderboard. Off = 'Anonymous resident'."),
        toggle("Show me on the leaderboard", "showOnLeaderboard", "Opt-in. Needs a public profile.")),
      h("div", { class: "card" }, h("h2", {}, "Badges"), h("div", { class: "bgrid" }, badges)),
      h("div", { class: "card" }, h("h2", {}, "Level ladder"), h("ol", { class: "ladder" }, ladder)));
  }

  /* ---------- official, audit, join (unchanged rules) ---------- */
  function officialView() {
    const u = me();
    if (!u.official) return h("div", { class: "card" }, h("h2", {}, "Official dashboard"), h("p", {}, "Choose “JCMC-Official” in the Playing as menu."));
    const k = EK.kpis(state), kp = (l, v) => h("div", { class: "card kpicard" }, h("div", { class: "kpi" }, v), h("div", { class: "sub" }, l));
    const aw = state.reports.filter(r => r.status === S.AWAITING).map(r => { const ov = EK.officialView(state, r), why = h("input", { placeholder: "Reason if rejecting", style: "min-width:130px" });
      return h("tr", {}, h("td", {}, r.text, h("br"), h("small", { class: "muted" }, `exact ${ov.exact.lat.toFixed(4)}, ${ov.exact.lng.toFixed(4)} · ${r.evidence.photoName} · ${r.confirmations.length} peers`)),
        h("td", {}, h("div", { class: "row" }, h("button", { class: "cta", onclick: () => act(() => EK.officialApprove(state, r.id, u.id, todayStr()), "Approved. Points minted for reporter and confirming peers.", "verified") }, "Approve"), why, h("button", { class: "ghost", onclick: () => act(() => EK.officialReject(state, r.id, u.id, why.value, todayStr()), "Rejected. No points issued.") }, "Reject")))); });
    const vr = state.reports.filter(r => r.status === S.VERIFIED && !r.resolved).map(r => h("tr", {}, h("td", {}, r.text), h("td", {}, h("button", { onclick: () => act(() => EK.markResolved(state, r.id, u.id, todayStr()), "Marked resolved.") }, "Mark resolved"))));
    const uv = state.users.filter(x => !x.verified).map(x => h("tr", {}, h("td", {}, x.name + " (" + x.pseudonym + ")"), h("td", {}, pName(x.prabhag)), h("td", {}, h("button", { onclick: () => act(() => EK.verifyUser(state, x.id, u.id), "Identity verified.") }, "Verify identity"))));
    const tr = state.reports.filter(r => r.status === S.TRIBUNAL).map(r => h("tr", {}, h("td", {}, r.text), h("td", {}, "Escalated after four strikes")));
    const thr = h("select", { onchange: (e) => act(() => EK.setPeersNeeded(state, u.id, parseInt(e.target.value, 10)), "Threshold updated.") },
      [10, 5, 3].map(n => h("option", { value: n, selected: state.config.peersNeeded === n ? "selected" : false }, n === 10 ? "10 peers (policy)" : n + " peers (quick demo)")));
    const tbl = (rows, heads, empty) => rows.length ? h("div", { class: "scroll" }, h("table", {}, heads ? h("thead", {}, h("tr", {}, heads.map(x => h("th", {}, x)))) : [], h("tbody", {}, rows))) : h("p", {}, empty);
    return h("div", { class: "stack" }, h("div", { class: "grid" }, kp("Verified residents", k.verifiedResidents), kp("Submissions", k.reports), kp("Awaiting official", k.awaitingOfficial), kp("Verified", k.verified), kp("Resolution rate", k.resolutionRate + "%")),
      h("div", { class: "card" }, h("h2", {}, "Awaiting official review (exact layer)"), tbl(aw, null, "None.")),
      h("div", { class: "card" }, h("h2", {}, "Verified, awaiting resolution"), tbl(vr, null, "None.")),
      h("div", { class: "card" }, h("h2", {}, "Identity verification queue"), tbl(uv, ["Person", "Prabhag", ""], "No one waiting.")),
      h("div", { class: "card" }, h("h2", {}, "Dispute tribunal queue"), tbl(tr, null, "Empty.")),
      h("div", { class: "card" }, h("h2", {}, "Peer threshold"), h("p", { class: "sub" }, "Policy is 10 peers. Lower values exist only to speed up a live demo."), thr));
  }
  function auditView() {
    const rows = state.audit.slice(-40).reverse().map(a => h("tr", {}, h("td", {}, a.day), h("td", {}, (user(a.actorId) || { pseudonym: a.actorId }).pseudonym), h("td", {}, a.action), h("td", {}, a.refId), h("td", {}, a.detail)));
    return h("div", { class: "card" }, h("h2", {}, "Audit trail (last 40 actions)"), h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Day", "Actor", "Action", "Ref", "Detail"].map(x => h("th", {}, x)))), h("tbody", {}, rows))));
  }
  function joinView() {
    const nm = h("input", { placeholder: "Full name (kept private)" }), ps = h("input", { placeholder: "Public pseudonym" });
    const pr = h("select", {}, state.prabhags.map(p => h("option", { value: p.id }, p.name))), ag = h("input", { type: "number", placeholder: "Age (18+ in the pilot)" });
    return h("div", { class: "card" }, h("h2", {}, "Join as a resident"), h("p", { class: "sub" }, "Use invented details in this demo. An official must verify you before you can file or review."),
      h("label", {}, "Name"), nm, h("label", {}, "Pseudonym shown on the public layer"), ps, h("label", {}, "Prabhag"), pr, h("label", {}, "Age"), ag,
      h("p", {}, h("button", { class: "cta", onclick: () => act(() => { const x = EK.registerUser(state, { name: nm.value, pseudonym: ps.value, prabhag: pr.value, age: parseInt(ag.value, 10) }); uid = x.id; }, "Registered. Ask an official to verify you.") }, "Register")));
  }

  const TABS = [["map", "🗺️", "Map", mapView], ["town", "🏘️", "Town", () => TOWNUI.view(townCtx)], ["file", "✍️", "File", fileView], ["review", "🔍", "Review", reviewView], ["quests", "🎯", "Quests", questView], ["rank", "🏆", "Rank", rankView], ["me", "👤", "Me", meView]];
  const EXTRA = [["official", "Official", officialView], ["audit", "Audit", auditView], ["join", "Join", joinView]];

  function go(t) { tab = t; flash = null; animate = true; FX.play("click"); render(); window.scrollTo({ top: 0 }); }

  function render() {
    const sel = $("#userSel"); sel.innerHTML = "";
    state.users.forEach(u => sel.append(h("option", { value: u.id, selected: u.id === uid ? "selected" : false }, u.pseudonym + (u.official ? " (official)" : u.verified ? "" : " (unverified)"))));
    const bar = $("#tabs"); bar.innerHTML = "";
    TABS.forEach(([id, ic, label]) => bar.append(h("button", { role: "tab", "aria-selected": String(tab === id), onclick: () => go(id) }, h("span", { class: "ti" }, ic), h("span", { class: "tl" }, label))));
    const more = $("#more"); more.innerHTML = "";
    EXTRA.forEach(([id, label]) => more.append(h("button", { class: "chip" + (tab === id ? " on" : ""), onclick: () => go(id) }, label)));
    $("#fxBtn").setAttribute("aria-pressed", String(FX.get().fx)); $("#fieldBtn").setAttribute("aria-pressed", String(fieldOn()));
    $("#audBtn").textContent = ["🔇 Silent", "🔊 Chimes", "🌿 Ambient"][prefs.audio]; $("#themeSel").value = prefs.theme;
    hud();
    const v = $("#view"); v.innerHTML = ""; v.className = animate ? "enter" : ""; animate = false;
    const u = me(), lim = EK.sessionLimit(u);
    if (flash) v.append(h("div", { class: "msg " + flash.type, role: "status" }, flash.text));
    if (EK.breakDue(minutes)) v.append(h("div", { class: "msg ok" }, "Wellness break: stand up, stretch and look away from the screen for a minute."));
    v.append(h("div", { class: "sessline" }, `Session left today: ${Math.max(0, lim - minutes)} min`));
    if (!EK.sessionAllowed(u, minutes)) { v.append(h("div", { class: "card" }, h("h2", {}, "Time for a break"), h("p", {}, "You have reached today's session limit. This safeguard protects against overuse. Come back tomorrow."))); return; }
    if (["file", "review", "quests"].includes(tab) && !u.verified) { v.append(h("div", { class: "card" }, h("p", {}, "Your identity is not verified yet. An official must verify you (Official page)."))); return; }
    const entry = TABS.find(t => t[0] === tab) || EXTRA.find(t => t[0] === tab);
    v.append(entry[entry.length - 1]());
  }

  function wireUI() {
    $("#userSel").onchange = (e) => { uid = e.target.value; save(); flash = null; animate = true; FX.play("click"); render(); };
    $("#resetBtn").onclick = () => {
      if (shared()) {
        if (!window.confirm("Reset the SHARED demo for everyone who is using it?")) return;
        SYNC.reset(buildSeedState()).then(() => { flash = { type: "ok", text: "Shared demo reset to sample data." }; }).catch(fail); return;
      }
      seed(); state.quests = sample.quests; save(); uid = defaultUser().id; applyPrefs(); flash = { type: "ok", text: "Demo reset to sample data." }; animate = true; render();
    };
    $("#audBtn").onclick = () => { prefs.audio = (prefs.audio + 1) % 3; savePrefs(); applyPrefs(); FX.play("click"); render(); };
    $("#fxBtn").onclick = () => { FX.setPref("fx", !FX.get().fx); render(); };
    $("#fieldBtn").onclick = () => { prefs.field = !fieldOn(); savePrefs(); if (!prefs.field) FX.setPref("fx", !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)); applyPrefs(); render(); };
    $("#themeSel").onchange = (e) => { prefs.theme = e.target.value; savePrefs(); applyPrefs(); render(); };
    document.addEventListener("focusout", () => setTimeout(() => { const a = document.activeElement; if (pendingRender && !(a && a.closest && a.closest("#view") && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) { pendingRender = false; render(); } }, 50));
    setInterval(() => { minutes += 1; save(); const ul = me(); if (ul && (EK.breakDue(minutes) || !EK.sessionAllowed(ul, minutes))) render(); }, 60000);
  }
  function initLocal() {
    if (!load()) seed();
    state.quests = sample.quests; state.questClaims = state.questClaims || []; TOWN.ensure(state);
    uid = defaultUser().id; applyPrefs(); render();
  }
  function initShared() {
    let first = true; $("#view").textContent = "Connecting to the shared demo…";
    SYNC.start({
      seed: buildSeedState,
      onStatus: (m) => { const n = $("#syncnote"); if (n) n.textContent = m; },
      onState: (s) => {
        state = s; state.quests = sample.quests;
        if (first) { first = false; try { const l = JSON.parse(localStorage.getItem("ek_local_v3")); if (l) { minutes = l.minutes || 0; uid = l.uid; } } catch (e) {} }
        if (!uid || !user(uid)) uid = (defaultUser() || state.users[0]).id;
        TOWN.ensure(state); applyPrefs(); softRender();
      }
    }).then(() => { if (!SYNC.enabled) initLocal(); });   // fell back to this-device mode
  }
  function init() { wireUI(); if (window.SYNC && SYNC.enabled) initShared(); else initLocal(); }

  Promise.all([fetch("data/sample_data.json").then(r => r.json()), fetch("data/quests.json").then(r => r.json())])
    .then(([d, q]) => { sample = d; sample.quests = q.quests; init(); })
    .catch(() => { $("#view").textContent = "Could not load sample data. Serve this folder through a web server (see README) or use GitHub Pages."; });
})();
