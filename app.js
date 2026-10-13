/* e-Karmakshetra prototype UI (v2). Rules live in src/core.js. Data is kept in the browser (localStorage). */
(function () {
  "use strict";
  const KEY = "ek_state_v2";
  const S = EK.STATUS;
  let state, sample, tab = "map", uid = null, officialLayer = false, flash = null, minutes = 0;
  const $ = (s) => document.querySelector(s);

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (typeof v === "function") el[k] = v;
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    kids.flat().forEach(c => el.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return el;
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ state, minutes })); } catch (e) {} };
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.state) { state = d.state; minutes = d.minutes || 0; return true; } } catch (e) {} return false; };
  const me = () => state.users.find(u => u.id === uid);
  const user = (id) => state.users.find(u => u.id === id);
  const pName = (id) => (state.prabhags.find(p => p.id === id) || {}).name || id;
  const tagClass = (st) => ({ [S.PENDING]: "pending", [S.AWAITING]: "awaiting", [S.VERIFIED]: "verified", [S.REVISE]: "revise", [S.REJECTED]: "rejected", [S.TRIBUNAL]: "dispute" }[st]);
  const tag = (st) => h("span", { class: "tag " + tagClass(st) }, st.replace(/_/g, " ").toLowerCase());

  function seed() {
    const day = "2000-01-01";
    state = EK.newState(sample.prabhags);
    const byName = {};
    sample.users.forEach(u => { byName[u.name] = EK.registerUser(state, { name: u.name, pseudonym: u.pseudonym, prabhag: u.prabhag, age: u.age, role: u.role, official: u.official, isSaathi: u.isSaathi }); });
    const off = byName["Official Demo"];
    Object.values(byName).forEach(u => { u.verified = true; });
    const peers = sample.users.filter(u => !u.official).map(u => byName[u.name]);
    sample.reports.forEach(r => {
      const by = byName[r.by];
      if (r.kind) EK.setRole(state, by.id, ({ solution: "solver", pilot: "pilot", campaign: "promoter", delivery: "deliverer" })[r.kind]);
      const rep = EK.submitReport(state, by.id, { kind: r.kind, category: r.category, text: r.text, hasPhoto: true, photoName: "sample.jpg", lat: r.lat, lng: r.lng, day });
      peers.filter(p => p.id !== by.id).slice(0, r.peers).forEach(p => EK.confirmReport(state, rep.id, p.id, day));
      if (r.approve) { EK.officialApprove(state, rep.id, off.id, day); }
    });
    minutes = 0;
  }
  function act(fn, ok) { try { fn(); save(); flash = { type: "ok", text: ok }; } catch (e) { flash = { type: "err", text: e.message }; } render(); }

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
    const colour = { [S.PENDING]: "#c97b00", [S.AWAITING]: "#2a6fb0", [S.VERIFIED]: "#1b7a3f", [S.REVISE]: "#8f4f00", [S.REJECTED]: "#a12a2a", [S.TRIBUNAL]: "#a12a2a" };
    const isOff = me() && me().official, seen = {};
    state.reports.forEach(r => {
      let x, y, title;
      if (officialLayer && isOff) { [x, y] = project(r.exactLat, r.exactLng); title = `${r.category}: ${r.text} @ ${r.exactLat.toFixed(4)}, ${r.exactLng.toFixed(4)}`; }
      else { const p = EK.publicView(state, r), [cx, cy] = project(p.centroid.lat, p.centroid.lng); const i = seen[r.prabhag] = (seen[r.prabhag] || 0) + 1; x = cx - 45 + (i % 6) * 18; y = cy + 8 + Math.floor(i / 6) * 18; title = `${p.category}: ${p.text} (${p.status})`; }
      const c = add("circle", { cx: x, cy: y, r: 8, fill: colour[r.status], stroke: "#fff", "stroke-width": 1.5 });
      const t = document.createElementNS(ns, "title"); t.textContent = title; c.appendChild(t);
    });
    const toggle = h("label", {}, h("input", { type: "checkbox", style: "width:auto;margin-right:6px", onchange: (e) => { officialLayer = e.target.checked; render(); }, checked: officialLayer && isOff ? "checked" : false, disabled: isOff ? false : "disabled" }), "Official layer: exact positions (officials only)");
    return h("div", { class: "card" }, h("h2", {}, "Mirror map: " + (officialLayer && isOff ? "official layer (exact)" : "public layer (Prabhag pins)")), svg,
      h("div", { class: "legend" }, h("span", { style: "color:#c97b00" }, "● peer review"), h("span", { style: "color:#2a6fb0" }, "● awaiting official"), h("span", { style: "color:#1b7a3f" }, "● verified"), h("span", { style: "color:#8f4f00" }, "● needs revision"), h("span", { style: "color:#a12a2a" }, "● rejected / tribunal")), toggle);
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
    const go = h("button", { onclick: () => act(() => {
      const p = state.prabhags.find(x => x.id === u.prabhag);
      EK.submitReport(state, u.id, { category: cat.value, text: txt.value, hasPhoto: photo.files.length > 0, photoName: photo.files[0] && photo.files[0].name,
        lat: p.lat + (Math.random() - .5) * 0.008, lng: p.lng + (Math.random() - .5) * 0.012, saathiFor: ben && ben.value.trim() ? ben.value : undefined });
    }, `Submitted. It needs ${state.config.peersNeeded} peer confirmations, then an official review.`) }, "Submit");
    const mine = state.reports.filter(r => r.reporterId === u.id).map(r => {
      const items = [h("div", { class: "row" }, tag(r.status), h("strong", {}, r.kind), h("span", {}, r.text)),
        h("small", { class: "muted" }, `Peers ${r.confirmations.length}/${state.config.peersNeeded} · flags ${r.flags.length}/${EK.RULES.FLAGS_NEEDED} · revival chances ${r.revivalChances}/${EK.RULES.REVIVAL_CHANCES}`)];
      if (r.status === S.REVISE) {
        const t2 = h("textarea", { rows: "2", placeholder: "Improve your description and add a new photo" }), p2 = h("input", { type: "file", accept: "image/*" });
        items.push(t2, p2, h("button", { onclick: () => act(() => EK.reviseReport(state, r.id, u.id, { text: t2.value, hasPhoto: p2.files.length > 0, photoName: p2.files[0] && p2.files[0].name }), "Revised and sent back to peer review.") }, "Resubmit"));
      }
      return h("div", { class: "card" }, items);
    });
    return h("div", {}, h("div", { class: "card" }, h("h2", {}, "File a report, proposal, pilot, campaign or delivery"),
      h("p", { class: "sub" }, `${u.pseudonym} · ${pName(u.prabhag)} · age group ${u.ageBracket}`),
      h("label", {}, "Active role"), role, h("label", {}, "Category"), cat, h("label", {}, "Description"), txt,
      h("label", {}, "Photo evidence (required; kept in your browser in this prototype)"), photo, ben ? [h("label", {}, "Digital Saathi mode"), ben] : [], h("p", {}, go)),
      mine.length ? h("div", {}, h("h2", {}, "My submissions"), mine) : []);
  }

  /* ---------- peer review ---------- */
  function reviewView() {
    const u = me();
    if (u.official) return h("div", { class: "card" }, h("p", {}, "Officials review from the Official tab. Peer review is for residents."));
    const open = state.reports.filter(r => r.status === S.PENDING && r.reporterId !== u.id);
    const rows = open.map(r => {
      const done = r.confirmations.includes(u.id) || r.flags.includes(u.id);
      const why = h("input", { placeholder: "Reason if flagging", style: "min-width:140px" });
      return h("tr", {}, h("td", {}, r.kind + " / " + r.category), h("td", {}, r.text, h("br"), h("small", { class: "muted" }, pName(r.prabhag) + " · photo: " + r.evidence.photoName)),
        h("td", {}, h("div", { class: "bar" }, h("i", { style: `width:${Math.min(100, r.confirmations.length / state.config.peersNeeded * 100)}%` })), `${r.confirmations.length}/${state.config.peersNeeded}`),
        h("td", {}, done ? "Reviewed" : h("div", { class: "row" }, h("button", { onclick: () => act(() => EK.confirmReport(state, r.id, u.id), "Confirmed. You earn peer points if an official verifies it.") }, "Confirm"), why,
          h("button", { class: "ghost", onclick: () => act(() => EK.flagReport(state, r.id, u.id, why.value), "Flag recorded. Three flags cost the reporter one revival chance.") }, "Flag"))));
    });
    return h("div", { class: "card" }, h("h2", {}, "Peer review queue"), h("p", { class: "sub" }, "Confirm only what you can honestly verify. Peer points are paid after official verification, never before."),
      rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Type", "Submission", "Peers", "Your review"].map(x => h("th", {}, x)))), h("tbody", {}, rows))) : h("p", {}, "Nothing to review."));
  }

  function ledgerView() {
    const u = me();
    const rows = state.ledger.filter(e => e.userId === u.id).map(e => h("tr", {}, h("td", {}, e.day), h("td", {}, e.event), h("td", {}, e.refId), h("td", {}, (e.points > 0 ? "+" : "") + e.points + (e.capped ? " (capped)" : ""))));
    return h("div", { class: "card" }, h("h2", {}, `Points ledger: balance ${EK.balance(state, u.id)}`),
      h("p", { class: "sub" }, `Append-only; corrections are offset entries. Daily cap ${EK.RULES.DAILY_CAP}. Points are recognition for verified outcomes; value ladder: certificates, then local vouchers, then sponsor honoraria.`),
      rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Day", "Event", "Ref", "Points"].map(x => h("th", {}, x)))), h("tbody", {}, rows))) : h("p", {}, "No entries yet."));
  }

  /* ---------- official ---------- */
  function officialView() {
    const u = me();
    if (!u.official) return h("div", { class: "card" }, h("h2", {}, "Official dashboard"), h("p", {}, "Choose “Official Demo” in the Acting as menu."));
    const k = EK.kpis(state), kp = (l, v) => h("div", { class: "card" }, h("div", { class: "kpi" }, v), h("div", { class: "sub" }, l));
    const aw = state.reports.filter(r => r.status === S.AWAITING).map(r => { const ov = EK.officialView(state, r), why = h("input", { placeholder: "Reason if rejecting", style: "min-width:130px" });
      return h("tr", {}, h("td", {}, r.text, h("br"), h("small", { class: "muted" }, `exact ${ov.exact.lat.toFixed(4)}, ${ov.exact.lng.toFixed(4)} · ${r.evidence.photoName} · ${r.confirmations.length} peers`)),
        h("td", {}, h("div", { class: "row" }, h("button", { onclick: () => act(() => EK.officialApprove(state, r.id, u.id), "Approved. Points minted for reporter and confirming peers.") }, "Approve"), why, h("button", { class: "ghost", onclick: () => act(() => EK.officialReject(state, r.id, u.id, why.value), "Rejected. No points issued.") }, "Reject")))); });
    const vr = state.reports.filter(r => r.status === S.VERIFIED && !r.resolved).map(r => h("tr", {}, h("td", {}, r.text), h("td", {}, h("button", { onclick: () => act(() => EK.markResolved(state, r.id, u.id), "Marked resolved.") }, "Mark resolved"))));
    const uv = state.users.filter(x => !x.verified).map(x => h("tr", {}, h("td", {}, x.name + " (" + x.pseudonym + ")"), h("td", {}, pName(x.prabhag)), h("td", {}, h("button", { onclick: () => act(() => EK.verifyUser(state, x.id, u.id), "Identity verified.") }, "Verify identity"))));
    const tr = state.reports.filter(r => r.status === S.TRIBUNAL).map(r => h("tr", {}, h("td", {}, r.text), h("td", {}, "Escalated after four strikes")));
    const thr = h("select", { onchange: (e) => act(() => EK.setPeersNeeded(state, u.id, parseInt(e.target.value, 10)), "Threshold updated.") },
      [10, 5, 3].map(n => h("option", { value: n, selected: state.config.peersNeeded === n ? "selected" : false }, n === 10 ? "10 peers (policy)" : n + " peers (quick demo)")));
    const tbl = (rows, heads, empty) => rows.length ? h("div", { class: "scroll" }, h("table", {}, heads ? h("thead", {}, h("tr", {}, heads.map(x => h("th", {}, x)))) : [], h("tbody", {}, rows))) : h("p", {}, empty);
    return h("div", {}, h("div", { class: "grid" }, kp("Verified residents", k.verifiedResidents), kp("Submissions", k.reports), kp("Awaiting official", k.awaitingOfficial), kp("Verified", k.verified), kp("Resolution rate", k.resolutionRate + "%")),
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
      h("p", {}, h("button", { onclick: () => act(() => { const x = EK.registerUser(state, { name: nm.value, pseudonym: ps.value, prabhag: pr.value, age: parseInt(ag.value, 10) }); uid = x.id; }, "Registered. Ask an official to verify you.") }, "Register")));
  }

  const TABS = [["map", "Map", mapView], ["file", "File", fileView], ["review", "Review", reviewView], ["ledger", "Ledger", ledgerView], ["official", "Official", officialView], ["audit", "Audit", auditView], ["join", "Join", joinView]];

  function render() {
    const sel = $("#userSel"); sel.innerHTML = "";
    state.users.forEach(u => sel.append(h("option", { value: u.id, selected: u.id === uid ? "selected" : false }, u.pseudonym + (u.official ? " (official)" : u.verified ? "" : " (unverified)"))));
    const tabs = $("#tabs"); tabs.innerHTML = "";
    TABS.forEach(([id, label]) => tabs.append(h("button", { role: "tab", "aria-selected": String(tab === id), onclick: () => { tab = id; flash = null; render(); } }, label)));
    const v = $("#view"); v.innerHTML = "";
    const u = me(), lim = EK.sessionLimit(u);
    $("#session").textContent = `Session left today: ${Math.max(0, lim - minutes)} min`;
    if (flash) v.append(h("div", { class: "msg " + flash.type, role: "status" }, flash.text));
    if (EK.breakDue(minutes)) v.append(h("div", { class: "msg ok" }, "Wellness break: stand up, stretch and look away from the screen for a minute."));
    if (!EK.sessionAllowed(u, minutes)) { v.append(h("div", { class: "card" }, h("h2", {}, "Time for a break"), h("p", {}, "You have reached today's session limit. This safeguard protects against overuse. Come back tomorrow."))); return; }
    if (["file", "review"].includes(tab) && !u.verified) { v.append(h("div", { class: "card" }, h("p", {}, "Your identity is not verified yet. An official must verify you (Official tab)."))); return; }
    v.append(TABS.find(t => t[0] === tab)[2]());
  }

  function init() {
    if (!load()) seed();
    uid = state.users.find(u => u.pseudonym === "Dinesh-P1").id;
    $("#userSel").onchange = (e) => { uid = e.target.value; flash = null; render(); };
    $("#resetBtn").onclick = () => { seed(); save(); uid = state.users.find(u => u.pseudonym === "Dinesh-P1").id; flash = { type: "ok", text: "Demo reset to sample data." }; render(); };
    setInterval(() => { minutes += 1; save(); render(); }, 60000);
    render();
  }
  fetch("data/sample_data.json").then(r => r.json()).then(d => { sample = d; init(); })
    .catch(() => { $("#view").textContent = "Could not load sample data. Serve this folder through a web server (see README) or use GitHub Pages."; });
})();
