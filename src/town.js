/* e-Karmakshetra town economy (v7): plots, storefronts, taxes, officer SLA, theatre, quick phrases.
   Plain JavaScript on top of src/core.js. Browser: window.TOWN. Node: require("./src/town.js").
   Design rules: points are in-game recognition, never cash; every spend is double-entry (what one account loses another gains);
   nothing here lets points be bought with money or converted to money. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.TOWN = factory(root.EK);
})(typeof self !== "undefined" ? self : this, function (EK) {
  "use strict";

  const DAY = 86400000;
  const R = Object.freeze({
    STARTER_PLOT: 51, STOREFRONT: 151, UPGRADE_STEP: 51, MAX_LEVEL: 5,
    PLOT_TAX: 2, BIZ_TAX: 2, SHOP_FEE: 1, SHOW_FEE: 1, ROLE_FEE: 21,
    SHOP_REVIEW_DAYS: 4, SHOW_REVIEW_DAYS: 1, ROLE_REVIEW_DAYS: 4, WARN_AT: 0.75,
    IDLE_PENALTY: 1, WRONG_PENALTY: 15, DISPUTE_DAYS: 7, SHOP_REVIVAL: 4,
    GRACE_MONTHS: 2, CLOSED_MONTHS: 5,
    TICKET: 2, CLAP: 1, VOD: 1, MAX_CLAPS: 5, SHOW_MIN: 5, SHOW_MAX: 90, SHOW_GAP_HOURS: 24,
    GRID_COLS: 4, GRID_MIN_ROWS: 3, GRID_FULL: 0.75,
    ROUTE: { wardPool: 50, festive: 30, designer: 20 }    // where lease and tax points flow (percent)
  });
  const LEVEL_NAMES = ["", "Starter plot (Hall of Fame)", "Storefront", "Showroom", "Pavilion", "Emporium"];
  const TEMPLATES = [
    { id: "kiosk", name: "Kiosk", minLevel: 2 }, { id: "craft", name: "Craft stall", minLevel: 2 },
    { id: "boutique", name: "Boutique", minLevel: 3 }, { id: "garden", name: "Garden nursery", minLevel: 3 },
    { id: "pavilion", name: "Pavilion (sandbox)", minLevel: 4 }];
  const ACCENTS = ["#ff9f1c", "#00c2a8", "#ff3d9a", "#22e3ff", "#ffd34e", "#8a7dff"];
  const QUICK_PHRASES = [
    { id: "namaste", en: "Namaste!", hi: "नमस्ते!" }, { id: "cleanup", en: "Clean-up happening here!", hi: "यहाँ सफ़ाई चल रही है!" },
    { id: "stall", en: "Check out my stall!", hi: "मेरी दुकान देखिए!" }, { id: "help", en: "Help needed for elder assistance", hi: "बुज़ुर्गों की मदद चाहिए" },
    { id: "thanks", en: "Thank you, neighbour!", hi: "धन्यवाद, पड़ोसी!" }, { id: "show", en: "Show starting soon at the stage", hi: "मंच पर कार्यक्रम शुरू होने वाला है" }];
  const BLOCKED = ["casino", "betting", "lottery", "gambling", "porn", "escort", "drugs", "weapon", "vote for", "election", "political party", "manifesto", "rally", "free money", "guaranteed profit"];

  const find = (a, id) => a.find(x => x.id === id);
  const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
  const dayOf = (ms) => { const d = new Date(ms), z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); };
  const monthOf = (ms) => dayOf(ms).slice(0, 7);
  const nowMs = (n) => (typeof n === "number" ? n : Date.now());

  function ensure(state) {
    if (!state.town) state.town = {};
    const t = state.town;
    ["plots", "shops", "shows", "tickets", "chat", "roleReqs", "disputes"].forEach(k => { if (!Array.isArray(t[k])) t[k] = []; });
    state.users.forEach(u => { if (!Array.isArray(u.townRoles)) u.townRoles = []; if (typeof u.maker !== "boolean") u.maker = false; });
    return t;
  }
  const nid = (s, p) => p + (s.seq++);
  const user = (s, id) => find(s.users, id);
  function audit(s, actor, action, ref, detail, ms) {
    s.audit.push(Object.freeze({ id: nid(s, "a"), day: dayOf(nowMs(ms)), actorId: actor, action, refId: ref, detail: detail || "" }));
  }

  /* ---------- points movement (double-entry, append-only) ---------- */
  const wardPool = (pid) => "pool:ward:" + pid;
  const POOLS = { festive: "pool:festive", review: "pool:review" };
  function post(s, uid, type, event, points, ref, ms) {
    s.ledger.push(Object.freeze({ id: nid(s, "l"), type, userId: uid, event, refId: ref, day: dayOf(nowMs(ms)), requested: points, points, capped: false }));
  }
  function pay(s, from, parts, event, ref, ms) {
    const total = parts.reduce((t, p) => t + p.pts, 0), have = EK.balance(s, from);
    if (total <= 0) return;
    if (have < total) throw new Error("Not enough points: need " + total + ", you have " + have);
    post(s, from, "SPEND", event, -total, ref, ms);
    parts.forEach(p => { if (p.pts > 0) post(s, p.to, "RECEIVE", event, p.pts, ref, ms); });
  }
  const pay1 = (s, from, to, pts, event, ref, ms) => pay(s, from, [{ to, pts }], event, ref, ms);
  function route(s, prabhag, amount) {   // lease and tax split: ward bounty pool, festive gifts, designers of that Prabhag
    const designers = s.users.filter(u => u.prabhag === prabhag && u.townRoles.includes("designer"));
    let d = Math.floor(amount * R.ROUTE.designer / 100), f = Math.floor(amount * R.ROUTE.festive / 100);
    if (!designers.length) d = 0;
    const w = amount - d - f, parts = [{ to: wardPool(prabhag), pts: w }, { to: POOLS.festive, pts: f }];
    if (d) { const each = Math.floor(d / designers.length); designers.forEach(x => parts.push({ to: x.id, pts: each })); parts[0].pts += d - each * designers.length; }
    return parts;
  }
  function demoGrant(s, adminId, uid, pts, ms) {   // DEMO ONLY so judges can try the economy without weeks of grinding
    const a = user(s, adminId); if (!a || !a.admin) throw new Error("Only the admin can post a demo grant");
    post(s, uid, "GRANT", "demo_grant (demo only; not earnable in production)", pts, "grant", ms); audit(s, adminId, "DEMO_GRANT", uid, "+" + pts, ms);
  }
  const pools = (s) => { const ids = new Set(s.ledger.filter(e => String(e.userId).startsWith("pool:")).map(e => e.userId)); return [...ids].map(id => ({ id, points: EK.balance(s, id) })); };

  /* ---------- roles (designer, officer, theatre manager) ---------- */
  const TOWN_ROLES = ["designer", "officer", "theatre_manager"];
  function applyRole(s, uid, role, ms) {
    const t = ensure(s), u = user(s, uid);
    if (!u || !u.verified || u.official) throw new Error("Only verified residents can apply");
    if (!TOWN_ROLES.includes(role)) throw new Error("Unknown role");
    if (u.townRoles.includes(role)) throw new Error("You already hold this role");
    if (t.roleReqs.find(r => r.userId === uid && r.role === role && r.status === "UNDER_REVIEW")) throw new Error("Application already pending");
    pay1(s, uid, POOLS.review, R.ROLE_FEE, "role_fee", role, ms);
    const r = { id: nid(s, "rr"), userId: uid, role, status: "UNDER_REVIEW", submittedAt: nowMs(ms), dueAt: nowMs(ms) + R.ROLE_REVIEW_DAYS * DAY, warned: false };
    t.roleReqs.push(r); audit(s, uid, "ROLE_APPLY", r.id, role, ms); return r;
  }
  function decideRole(s, adminId, reqId, approve, ms) {
    const t = ensure(s), a = user(s, adminId), r = find(t.roleReqs, reqId);
    if (!a || !a.admin) throw new Error("Only the admin approves in-game roles");
    if (!r || r.status !== "UNDER_REVIEW") throw new Error("Request not open");
    const u = user(s, r.userId);
    if (approve) { u.townRoles.push(r.role); r.status = "APPROVED"; pay1(s, POOLS.review, wardPool(u.prabhag), R.ROLE_FEE, "role_fee_to_ward", r.id, ms); }
    else { r.status = "REJECTED"; pay1(s, POOLS.review, u.id, R.ROLE_FEE, "role_fee_refund", r.id, ms); }
    audit(s, adminId, approve ? "ROLE_APPROVE" : "ROLE_REJECT", r.id, r.role, ms); return r;
  }
  function verifyMaker(s, officerId, uid, ms) {
    ensure(s); const o = user(s, officerId), u = user(s, uid);
    if (!isReviewer(o, "shop")) throw new Error("Only an official or approved officer can verify a maker");
    if (!u || !u.verified) throw new Error("Resident not found or not verified");
    u.maker = true; audit(s, officerId, "VERIFY_MAKER", uid, "valid photo ID checked", ms); return u;
  }
  function isReviewer(u, kind) {
    if (!u) return false;
    if (u.admin) return true;
    if (kind === "show") return u.townRoles && u.townRoles.includes("theatre_manager");
    return !!u.official || (u.townRoles && u.townRoles.includes("officer"));
  }

  /* ---------- plots ---------- */
  const liveStatus = (p) => p.status === "demolished" ? "demolished" : p.arrears === 0 ? "active" : p.arrears <= R.GRACE_MONTHS ? "grace"
    : p.arrears <= R.GRACE_MONTHS + R.CLOSED_MONTHS ? "closed" : "demolished";
  function gridFor(s, pid) {
    const t = ensure(s), n = t.plots.filter(p => p.prabhag === pid && liveStatus(p) !== "demolished").length;
    let rows = R.GRID_MIN_ROWS; while (n / (R.GRID_COLS * rows) >= R.GRID_FULL) rows++;   // the town grows as residents arrive
    return { cols: R.GRID_COLS, rows, claimed: n, capacity: R.GRID_COLS * rows };
  }
  const plotAt = (s, pid, x, y) => ensure(s).plots.find(p => p.prabhag === pid && p.x === x && p.y === y && liveStatus(p) !== "demolished");
  function claimPlot(s, uid, x, y, ms) {
    const t = ensure(s), u = user(s, uid);
    if (!u || !u.verified || u.official) throw new Error("Only verified residents can claim land");
    if (t.plots.find(p => p.ownerId === uid && liveStatus(p) !== "demolished")) throw new Error("In this pilot each resident holds one plot");
    const g = gridFor(s, u.prabhag);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= g.cols || y >= g.rows) throw new Error("That spot is outside the town");
    if (plotAt(s, u.prabhag, x, y)) throw new Error("That plot is already taken");
    pay(s, uid, route(s, u.prabhag, R.STARTER_PLOT), "plot_lease", "plot", ms);
    const p = { id: nid(s, "pl"), prabhag: u.prabhag, x, y, ownerId: uid, level: 1, claimedDay: dayOf(nowMs(ms)), lastTaxMonth: monthOf(nowMs(ms)), arrears: 0, owed: 0, status: "active" };
    t.plots.push(p); audit(s, uid, "CLAIM_PLOT", p.id, u.prabhag + " (" + x + "," + y + ")", ms); return p;
  }
  function upgradePlot(s, uid, plotId, ms) {
    const t = ensure(s), p = find(t.plots, plotId), u = user(s, uid);
    if (!p || p.ownerId !== uid) throw new Error("Not your plot");
    if (liveStatus(p) !== "active") throw new Error("Clear your arrears first");
    if (p.level >= R.MAX_LEVEL) throw new Error("Already at the highest level");
    if (p.level === 1 && !u.maker) throw new Error("A Verified Citizen Maker badge (photo ID checked by an official) is needed for a storefront");
    const cost = p.level === 1 ? R.STOREFRONT : R.UPGRADE_STEP;
    pay(s, uid, route(s, p.prabhag, cost), "plot_upgrade", p.id, ms); p.level += 1; audit(s, uid, "UPGRADE_PLOT", p.id, LEVEL_NAMES[p.level], ms); return p;
  }

  /* ---------- storefronts ---------- */
  function screenText(text) {
    const n = norm(text);
    if (/[<>]/.test(text)) return "Remove < and > characters";
    const hit = BLOCKED.find(w => n.includes(w)); return hit ? "Not allowed in a shop listing: \"" + hit + "\" (illegal ads and political campaigning are not permitted)" : null;
  }
  function cleanLink(l) {
    l = String(l || "").trim(); if (!l) return "";
    if (l.length > 200 || /\s/.test(l)) throw new Error("Link looks invalid");
    let u; try { u = new URL(l); } catch (e) { throw new Error("Link must be a full https:// address"); }
    if (u.protocol !== "https:" || !u.hostname.includes(".") || /^[\d.]+$/.test(u.hostname)) throw new Error("Link must be a public https:// website");
    return u.href;
  }
  function submitShop(s, uid, o, ms) {
    const t = ensure(s), u = user(s, uid), plot = t.plots.find(p => p.ownerId === uid && liveStatus(p) === "active");
    if (!plot || plot.level < 2) throw new Error("Upgrade your plot to a storefront first");
    if (!u.maker) throw new Error("A Verified Citizen Maker badge is needed to list products");
    const name = String(o.name || "").trim(), desc = String(o.desc || "").trim();
    if (name.length < 3 || name.length > 40) throw new Error("Shop name: 3 to 40 characters");
    if (desc.length < 10 || desc.length > 300) throw new Error("Description: 10 to 300 characters");
    [name, desc, o.product || ""].forEach(x => { const bad = screenText(x); if (bad) throw new Error(bad); });
    const tpl = TEMPLATES.find(x => x.id === o.template); if (!tpl) throw new Error("Choose a template");
    if (plot.level < tpl.minLevel) throw new Error(tpl.name + " needs plot level " + tpl.minLevel);
    const link = cleanLink(o.link), accent = ACCENTS.includes(o.accent) ? o.accent : ACCENTS[0];
    const live = t.shops.find(x => x.plotId === plot.id && ["UNDER_REVIEW", "APPROVED", "APPEAL"].includes(x.status));
    if (live) throw new Error("This plot already has a listing (" + live.status.toLowerCase().replace("_", " ") + ")");
    pay1(s, uid, POOLS.review, R.SHOP_FEE, "shop_registration_fee", plot.id, ms);
    const sh = { id: nid(s, "sh"), plotId: plot.id, ownerId: uid, prabhag: plot.prabhag, name, desc, product: String(o.product || "").trim().slice(0, 80), template: tpl.id, accent, link,
      status: "UNDER_REVIEW", submittedAt: nowMs(ms), dueAt: nowMs(ms) + R.SHOP_REVIEW_DAYS * DAY, warned: false, reviewerId: null, revival: R.SHOP_REVIVAL, frozen: false, appeal: null, reason: "" };
    t.shops.push(sh); audit(s, uid, "SHOP_SUBMIT", sh.id, name, ms); return sh;
  }
  function settle(s, shop, reviewerId, ms) { pay1(s, POOLS.review, reviewerId, R.SHOP_FEE, "review_fee_earned", shop.id, ms); }
  function reviewShop(s, reviewerId, shopId, approve, reason, ms) {
    const t = ensure(s), r = user(s, reviewerId), sh = find(t.shops, shopId);
    if (!isReviewer(r, "shop")) throw new Error("Only an official or approved officer can review shops");
    if (!sh || sh.status !== "UNDER_REVIEW") throw new Error("Listing is not waiting for review");
    if (sh.ownerId === reviewerId) throw new Error("You cannot review your own shop");
    if (!approve && norm(reason).length < 5) throw new Error("A reason is required");
    sh.status = approve ? "APPROVED" : "REJECTED"; sh.reviewerId = reviewerId; sh.reason = approve ? "" : reason; sh.decidedAt = nowMs(ms);
    settle(s, sh, reviewerId, ms); audit(s, reviewerId, approve ? "SHOP_APPROVE" : "SHOP_REJECT", sh.id, reason || "", ms); return sh;
  }
  function appealShop(s, uid, shopId, text, ms) {
    const t = ensure(s), sh = find(t.shops, shopId);
    if (!sh || sh.ownerId !== uid) throw new Error("Not your listing");
    if (sh.status !== "REJECTED") throw new Error("Only a rejected listing can be appealed");
    if (norm(text).length < 10) throw new Error("Explain your appeal (10+ characters)");
    sh.status = "APPEAL"; sh.appeal = text.trim(); audit(s, uid, "SHOP_APPEAL", sh.id, "", ms); return sh;
  }
  function penalise(s, uid, pts, event, to, ref, ms) {
    const take = Math.min(pts, Math.max(0, EK.balance(s, uid))); if (take > 0) pay1(s, uid, to, take, event, ref, ms); return take;
  }
  function decideAppeal(s, adminId, shopId, overturn, ms) {
    const t = ensure(s), a = user(s, adminId), sh = find(t.shops, shopId);
    if (!a || !a.admin) throw new Error("Only the admin decides appeals");
    if (!sh || sh.status !== "APPEAL") throw new Error("No appeal open");
    if (overturn) { sh.status = "APPROVED"; if (sh.reviewerId) penalise(s, sh.reviewerId, R.WRONG_PENALTY, "wrong_judgement_penalty", wardPool(sh.prabhag), sh.id, ms); }
    else sh.status = "REJECTED_FINAL";
    audit(s, adminId, overturn ? "APPEAL_OVERTURN" : "APPEAL_UPHELD", sh.id, "", ms); return sh;
  }

  /* ---------- SLA: warn at 75% of the window, admin can then decide; idle reviewers lose 1 point ---------- */
  function pending(s) {
    const t = ensure(s);
    return [].concat(t.shops.filter(x => x.status === "UNDER_REVIEW").map(x => ({ kind: "shop", item: x })),
      t.shows.filter(x => x.status === "UNDER_REVIEW").map(x => ({ kind: "show", item: x })),
      t.roleReqs.filter(x => x.status === "UNDER_REVIEW").map(x => ({ kind: "role", item: x })));
  }
  function slaScan(s, ms) {
    const now = nowMs(ms), out = [];
    pending(s).forEach(({ kind, item }) => {
      const span = item.dueAt - item.submittedAt, pct = (now - item.submittedAt) / span;
      const level = pct >= 1 ? "overdue" : pct >= R.WARN_AT ? "warn" : "ok";
      if (level !== "ok" && !item.warned) { item.warned = true; audit(s, "system", "SLA_WARN", item.id, kind + " " + level, ms); }
      out.push({ kind, id: item.id, level, hoursLeft: Math.round((item.dueAt - now) / 36e5) });
    });
    return out;
  }
  function adminDecide(s, adminId, kind, id, approve, reason, ms) {
    const t = ensure(s), a = user(s, adminId);
    if (!a || !a.admin) throw new Error("Only the admin can step in");
    const list = kind === "shop" ? t.shops : kind === "show" ? t.shows : t.roleReqs, item = find(list, id);
    if (!item || item.status !== "UNDER_REVIEW") throw new Error("Nothing to decide");
    slaScan(s, ms); if (!item.warned) throw new Error("Wait for the 75% warning before stepping in");
    if (kind === "role") return decideRole(s, adminId, id, approve, ms);
    if (!approve && norm(reason).length < 5) throw new Error("A reason is required");
    item.status = approve ? "APPROVED" : "REJECTED"; item.reviewerId = adminId; item.reason = approve ? "" : reason; item.decidedAt = nowMs(ms);
    pay1(s, POOLS.review, wardPool(item.prabhag || "P4"), kind === "shop" ? R.SHOP_FEE : R.SHOW_FEE, "review_fee_to_ward", item.id, ms);
    const idle = s.users.filter(u => !u.admin && isReviewer(u, kind) && (kind === "show" || u.prabhag === item.prabhag || u.official));
    idle.forEach(u => penalise(s, u.id, R.IDLE_PENALTY, "idle_reviewer_penalty", wardPool(item.prabhag || "P4"), item.id, ms));
    audit(s, adminId, "ADMIN_DECIDE", item.id, kind + (approve ? " approve" : " reject") + "; idle reviewers charged " + idle.length, ms); return item;
  }

  /* ---------- tax, grace, closure, demolition ---------- */
  function runTaxMonth(s, monthKey, ms) {
    const t = ensure(s); let charged = 0, missed = 0, demolished = 0;
    t.plots.forEach(p => {
      if (liveStatus(p) === "demolished" || p.lastTaxMonth >= monthKey) return;
      const biz = t.shops.some(x => x.plotId === p.id && x.status === "APPROVED"), amt = R.PLOT_TAX + (biz ? R.BIZ_TAX : 0);
      p.lastTaxMonth = monthKey;
      try { pay(s, p.ownerId, route(s, p.prabhag, amt), "monthly_tax", p.id, ms); charged++; }
      catch (e) { p.arrears += 1; p.owed += amt; missed++; }
      if (liveStatus(p) === "demolished") { p.status = "demolished"; demolished++; t.shops.forEach(x => { if (x.plotId === p.id) x.status = "REMOVED"; }); audit(s, "system", "DEMOLISH", p.id, "arrears " + p.arrears, ms); }
    });
    return { charged, missed, demolished };
  }
  function payArrears(s, uid, plotId, ms) {
    const t = ensure(s), p = find(t.plots, plotId);
    if (!p || p.ownerId !== uid) throw new Error("Not your plot");
    if (liveStatus(p) === "demolished") throw new Error("This plot was demolished and returned to the town");
    if (p.arrears === 0) throw new Error("No arrears");
    pay(s, uid, route(s, p.prabhag, p.owed), "arrears_cleared", p.id, ms); p.owed = 0; p.arrears = 0; audit(s, uid, "CLEAR_ARREARS", p.id, "", ms); return p;
  }

  /* ---------- buyer protection ---------- */
  function openDispute(s, buyerId, shopId, text, ms) {
    const t = ensure(s), sh = find(t.shops, shopId), b = user(s, buyerId);
    if (!b || !b.verified) throw new Error("Only verified residents can open a dispute");
    if (!sh || sh.status !== "APPROVED") throw new Error("Shop not found");
    if (sh.ownerId === buyerId) throw new Error("You cannot dispute your own shop");
    if (norm(text).length < 10) throw new Error("Describe the problem (10+ characters)");
    const d = { id: nid(s, "d"), shopId, buyerId, text: text.trim(), openedAt: nowMs(ms), status: "OPEN", public: false, note: "" };
    t.disputes.push(d); audit(s, buyerId, "DISPUTE_OPEN", d.id, shopId, ms); return d;
  }
  function disputeScan(s, ms) {   // after 7 unresolved days: complaint becomes public and the Maker badge on that shop is frozen
    const t = ensure(s), now = nowMs(ms); let n = 0;
    t.disputes.forEach(d => { if (d.status === "OPEN" && !d.public && now - d.openedAt >= R.DISPUTE_DAYS * DAY) { d.public = true; const sh = find(t.shops, d.shopId); if (sh) sh.frozen = true; n++; audit(s, "system", "DISPUTE_PUBLIC", d.id, "badge frozen", ms); } });
    return n;
  }
  function resolveDispute(s, byId, disputeId, upheldAgainstSeller, note, ms) {
    const t = ensure(s), d = find(t.disputes, disputeId), by = user(s, byId), sh = d && find(t.shops, d.shopId);
    if (!d || d.status !== "OPEN") throw new Error("Dispute not open");
    const seller = sh && sh.ownerId === byId;
    if (!seller && !isReviewer(by, "shop")) throw new Error("Only the seller or a ward officer can close a dispute");
    d.status = seller ? "SELLER_RESOLVED" : upheldAgainstSeller ? "UPHELD" : "DISMISSED"; d.note = String(note || "").slice(0, 200);
    if (!seller && upheldAgainstSeller) { sh.revival -= 1; sh.frozen = true; if (sh.revival <= 0) sh.status = "CLOSED_BY_TRIBUNAL"; }
    else if (!seller) { sh.frozen = t.disputes.some(x => x.shopId === sh.id && x.status === "OPEN" && x.public); }
    else sh.frozen = t.disputes.some(x => x.shopId === sh.id && x.id !== d.id && x.status === "OPEN" && x.public);
    audit(s, byId, "DISPUTE_" + d.status, d.id, d.note, ms); return d;
  }

  /* ---------- theatre (Rangamanch) ---------- */
  function proposeShow(s, uid, o, ms) {
    const t = ensure(s), u = user(s, uid), now = nowMs(ms);
    if (!u || !u.verified || u.official) throw new Error("Only verified residents can perform");
    const title = String(o.title || "").trim(), desc = String(o.desc || "").trim();
    if (title.length < 3 || title.length > 60) throw new Error("Title: 3 to 60 characters");
    if (desc.length < 10 || desc.length > 300) throw new Error("Description: 10 to 300 characters");
    [title, desc].forEach(x => { const bad = screenText(x); if (bad) throw new Error(bad); });
    const minutes = Number(o.minutes); if (!Number.isInteger(minutes) || minutes < R.SHOW_MIN || minutes > R.SHOW_MAX) throw new Error("Length must be " + R.SHOW_MIN + " to " + R.SHOW_MAX + " minutes");
    const start = Number(o.startMs); if (!(start > now) || start > now + 60 * DAY) throw new Error("Pick a start time within the next 60 days");
    const mode = ["video", "audio", "stills"].includes(o.mode) ? o.mode : "audio";
    const url = cleanLink(o.url), end = start + minutes * 60000, live = t.shows.filter(x => ["UNDER_REVIEW", "APPROVED"].includes(x.status));
    if (live.find(x => x.performerId === uid && Math.abs(x.startMs - start) < R.SHOW_GAP_HOURS * 36e5)) throw new Error("No two performances by the same person within 24 hours");
    if (live.find(x => start < x.startMs + x.minutes * 60000 && end > x.startMs)) throw new Error("The stage is already booked at that time");
    const price = o.ticket === undefined ? R.TICKET : Number(o.ticket); if (!Number.isInteger(price) || price < 0 || price > 10) throw new Error("Ticket price: 0 to 10 points");
    const vod = o.vodPrice === null || o.vodPrice === undefined || o.vodPrice === "" ? null : Number(o.vodPrice); if (vod !== null && (!Number.isInteger(vod) || vod < 0 || vod > 5)) throw new Error("Replay price: 0 to 5 points");
    pay1(s, uid, POOLS.review, R.SHOW_FEE, "show_registration_fee", "show", ms);
    const sh = { id: nid(s, "sw"), performerId: uid, prabhag: u.prabhag, title, desc, mode, url, startMs: start, minutes, ticket: price, vodPrice: vod, status: "UNDER_REVIEW",
      submittedAt: now, dueAt: now + R.SHOW_REVIEW_DAYS * DAY, warned: false, reviewerId: null, reason: "" };
    t.shows.push(sh); audit(s, uid, "SHOW_PROPOSE", sh.id, title, ms); return sh;
  }
  function reviewShow(s, mgrId, showId, approve, reason, ms) {
    const t = ensure(s), m = user(s, mgrId), sh = find(t.shows, showId);
    if (!isReviewer(m, "show")) throw new Error("Only a theatre manager can review shows");
    if (!sh || sh.status !== "UNDER_REVIEW") throw new Error("Show is not waiting for review");
    if (sh.performerId === mgrId) throw new Error("You cannot review your own show");
    if (!approve && norm(reason).length < 5) throw new Error("A reason is required");
    sh.status = approve ? "APPROVED" : "REJECTED"; sh.reviewerId = mgrId; sh.reason = approve ? "" : reason; sh.decidedAt = nowMs(ms);
    pay1(s, POOLS.review, mgrId, R.SHOW_FEE, "review_fee_earned", sh.id, ms); audit(s, mgrId, approve ? "SHOW_APPROVE" : "SHOW_REJECT", sh.id, reason || "", ms); return sh;
  }
  function buyTicket(s, uid, showId, ms) {
    const t = ensure(s), sh = find(t.shows, showId), now = nowMs(ms);
    if (!sh || sh.status !== "APPROVED") throw new Error("Show not available");
    if (sh.performerId === uid) throw new Error("Performers do not need a ticket");
    if (now > sh.startMs + sh.minutes * 60000) throw new Error("This show has ended (see replay)");
    if (t.tickets.find(x => x.userId === uid && x.showId === showId && x.kind === "live")) throw new Error("You already have a ticket");
    if (sh.ticket > 0) pay1(s, uid, sh.performerId, sh.ticket, "ticket", sh.id, ms);
    const k = { id: nid(s, "tk"), userId: uid, showId, kind: "live", day: dayOf(now) }; t.tickets.push(k); return k;
  }
  function clap(s, uid, showId, ms) {
    const t = ensure(s), sh = find(t.shows, showId);
    if (!sh || sh.status !== "APPROVED" || sh.performerId === uid) throw new Error("Cannot clap here");
    if (!t.tickets.find(x => x.userId === uid && x.showId === showId && (x.kind === "live" || x.kind === "replay"))) throw new Error("Get a ticket first");
    if (t.tickets.filter(x => x.userId === uid && x.showId === showId && x.kind === "clap").length >= R.MAX_CLAPS) throw new Error("Clap limit reached for this show");
    pay1(s, uid, sh.performerId, R.CLAP, "clap_tip", sh.id, ms); const k = { id: nid(s, "tk"), userId: uid, showId, kind: "clap", day: dayOf(nowMs(ms)) }; t.tickets.push(k); return k;
  }
  function buyReplay(s, uid, showId, ms) {
    const t = ensure(s), sh = find(t.shows, showId), now = nowMs(ms);
    if (!sh || sh.status !== "APPROVED") throw new Error("Show not available");
    if (sh.vodPrice == null) throw new Error("The performer kept this show live-only");
    if (now < sh.startMs + sh.minutes * 60000) throw new Error("Replay opens after the live show ends");
    if (t.tickets.find(x => x.userId === uid && x.showId === showId && x.kind === "replay")) throw new Error("You already have the replay");
    if (sh.vodPrice > 0 && sh.performerId !== uid) pay1(s, uid, sh.performerId, sh.vodPrice, "replay", sh.id, ms);
    const k = { id: nid(s, "tk"), userId: uid, showId, kind: "replay", day: dayOf(now) }; t.tickets.push(k); return k;
  }

  /* ---------- quick phrases (safe chat) ---------- */
  function say(s, uid, phraseId, ms) {
    const t = ensure(s), u = user(s, uid), now = nowMs(ms);
    if (!u || !QUICK_PHRASES.find(p => p.id === phraseId)) throw new Error("Unknown phrase");
    if (t.chat.filter(c => c.userId === uid && now - c.at < 60000).length >= 10) throw new Error("Slow down a little (10 phrases a minute)");
    t.chat.push({ userId: uid, phraseId, at: now }); if (t.chat.length > 40) t.chat.splice(0, t.chat.length - 40); return t.chat[t.chat.length - 1];
  }

  /* ---------- field mode helper ---------- */
  function shouldAutoFieldMode(nav) {
    if (!nav) return false; const c = nav.connection || {};
    return !!(c.saveData || ["slow-2g", "2g", "3g"].includes(c.effectiveType) || (nav.deviceMemory && nav.deviceMemory <= 2));
  }

  return { R, LEVEL_NAMES, TEMPLATES, ACCENTS, QUICK_PHRASES, TOWN_ROLES, ensure, liveStatus, gridFor, plotAt, claimPlot, upgradePlot, applyRole, decideRole, verifyMaker, isReviewer,
    submitShop, reviewShop, appealShop, decideAppeal, slaScan, pending, adminDecide, runTaxMonth, payArrears, openDispute, disputeScan, resolveDispute,
    proposeShow, reviewShow, buyTicket, clap, buyReplay, say, demoGrant, pools, wardPool, POOLS, screenText, cleanLink, shouldAutoFieldMode, dayOf, monthOf };
});
