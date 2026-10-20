const test = require("node:test"), assert = require("node:assert");
const EK = require("../src/core.js"), T = require("../src/town.js");
const D = 86400000, T0 = new Date(2026, 9, 20, 10, 0).getTime();

function world() {
  const s = EK.newState([{ id: "P1", name: "P1", lat: 1, lng: 1 }, { id: "P2", name: "P2", lat: 1, lng: 2 }]);
  const mk = (n, pr, o) => { const u = EK.registerUser(s, Object.assign({ name: n, pseudonym: n, prabhag: pr, age: 30 }, o)); u.verified = true; return u; };
  const admin = mk("Admin", "P1", { official: true, admin: true }), off = mk("Off", "P1", { official: true });
  const a = mk("Asha", "P1"), b = mk("Bala", "P1"), c = mk("Chi", "P2");
  T.ensure(s); return { s, admin, off, a, b, c };
}
const fund = (w, u, n) => T.demoGrant(w.s, w.admin.id, u.id, n, T0);
const shopArgs = (o) => Object.assign({ name: "Asha Crochet", desc: "Handmade embroidered keychains", template: "kiosk", link: "https://example.com/shop" }, o);
function storefront(w, u) { fund(w, u, 300); T.claimPlot(w.s, u.id, 0, 0, T0); T.verifyMaker(w.s, w.off.id, u.id, T0); T.upgradePlot(w.s, u.id, T.ensure(w.s).plots[0].id, T0); }

test("points movement is double-entry: lease conserves total points", () => {
  const w = world(); fund(w, w.a, 100);
  const before = w.s.ledger.reduce((t, e) => t + e.points, 0);
  T.claimPlot(w.s, w.a.id, 1, 1, T0);
  assert.strictEqual(w.s.ledger.reduce((t, e) => t + e.points, 0), before);
  assert.strictEqual(EK.balance(w.s, w.a.id), 49);
  const total = T.pools(w.s).reduce((t, p) => t + p.points, 0); assert.strictEqual(total, 51);
});
test("spending never lowers XP", () => {
  const w = world(); fund(w, w.a, 100); const xp = EK.totalXp(w.s, w.a.id);
  T.claimPlot(w.s, w.a.id, 0, 0, T0); assert.strictEqual(EK.totalXp(w.s, w.a.id), xp);
});
test("claim needs enough points, free cell, one plot each, inside grid", () => {
  const w = world();
  assert.throws(() => T.claimPlot(w.s, w.a.id, 0, 0, T0), /Not enough points/);
  fund(w, w.a, 200); fund(w, w.b, 200);
  assert.throws(() => T.claimPlot(w.s, w.a.id, 9, 9, T0), /outside/);
  T.claimPlot(w.s, w.a.id, 0, 0, T0);
  assert.throws(() => T.claimPlot(w.s, w.b.id, 0, 0, T0), /taken/);
  assert.throws(() => T.claimPlot(w.s, w.a.id, 1, 0, T0), /one plot/);
  assert.throws(() => T.claimPlot(w.s, w.off.id, 1, 1, T0), /verified residents/);
});
test("grid grows when 75% full", () => {
  const w = world(); assert.strictEqual(T.gridFor(w.s, "P1").rows, 3);
  const st = T.ensure(w.s);
  for (let i = 0; i < 9; i++) st.plots.push({ id: "x" + i, prabhag: "P1", x: i % 4, y: Math.floor(i / 4), ownerId: "z", level: 1, arrears: 0, owed: 0, status: "active", lastTaxMonth: "2026-10" });
  assert.strictEqual(T.gridFor(w.s, "P1").rows, 4);
});
test("storefront needs Maker badge; upgrade costs 151 then 51", () => {
  const w = world(); fund(w, w.a, 400); const p = T.claimPlot(w.s, w.a.id, 0, 0, T0);
  assert.throws(() => T.upgradePlot(w.s, w.a.id, p.id, T0), /Maker/);
  T.verifyMaker(w.s, w.off.id, w.a.id, T0); const b0 = EK.balance(w.s, w.a.id);
  T.upgradePlot(w.s, w.a.id, p.id, T0); assert.strictEqual(b0 - EK.balance(w.s, w.a.id), 151);
  T.upgradePlot(w.s, w.a.id, p.id, T0); assert.strictEqual(p.level, 3);
});
test("shop content screening and links", () => {
  const w = world(); storefront(w, w.a);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs({ desc: "Vote for our party in the election" }), T0), /Not allowed/);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs({ name: "<script>x</script>" }), T0), /</);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs({ link: "javascript:alert(1)" }), T0), /https/);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs({ link: "http://example.com" }), T0), /https/);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs({ link: "https://127.0.0.1/" }), T0), /public/);
});
test("shop review: fee escrowed then paid to the approving officer", () => {
  const w = world(); storefront(w, w.a);
  const sh = T.submitShop(w.s, w.a.id, shopArgs(), T0); assert.strictEqual(sh.status, "UNDER_REVIEW");
  assert.throws(() => T.reviewShop(w.s, w.a.id, sh.id, true, "", T0), /official/);
  const b = EK.balance(w.s, w.off.id); T.reviewShop(w.s, w.off.id, sh.id, true, "", T0 + D);
  assert.strictEqual(sh.status, "APPROVED"); assert.strictEqual(EK.balance(w.s, w.off.id), b + 1); assert.strictEqual(EK.balance(w.s, T.POOLS.review), 0);
  assert.throws(() => T.submitShop(w.s, w.a.id, shopArgs(), T0), /already has/);
});
test("SLA: warn at 75%, admin must wait for warning, idle reviewers lose 1 point", () => {
  const w = world(); storefront(w, w.a); fund(w, w.off, 5);
  const sh = T.submitShop(w.s, w.a.id, shopArgs(), T0);
  assert.throws(() => T.adminDecide(w.s, w.admin.id, "shop", sh.id, true, "", T0 + D), /75%/);
  assert.strictEqual(T.slaScan(w.s, T0 + 3 * D + 1)[0].level, "warn");
  const b = EK.balance(w.s, w.off.id);
  T.adminDecide(w.s, w.admin.id, "shop", sh.id, true, "", T0 + 3 * D + 2);
  assert.strictEqual(sh.status, "APPROVED"); assert.strictEqual(EK.balance(w.s, w.off.id), b - 1);
  assert.ok(w.s.audit.some(a => a.action === "SLA_WARN"));
});
test("appeal overturn costs the reviewer 15 points (never below zero)", () => {
  const w = world(); storefront(w, w.a); fund(w, w.off, 40);
  const sh = T.submitShop(w.s, w.a.id, shopArgs(), T0); T.reviewShop(w.s, w.off.id, sh.id, false, "photo unclear", T0);
  T.appealShop(w.s, w.a.id, sh.id, "I can add a clear photo of my work", T0);
  const b = EK.balance(w.s, w.off.id); T.decideAppeal(w.s, w.admin.id, sh.id, true, T0);
  assert.strictEqual(sh.status, "APPROVED"); assert.strictEqual(EK.balance(w.s, w.off.id), b - 15);
});
test("tax: charged once a month, arrears -> grace -> closed -> demolished", () => {
  const w = world(); fund(w, w.a, 55); const p = (T.claimPlot(w.s, w.a.id, 0, 0, T0), T.ensure(w.s).plots[0]);
  assert.strictEqual(EK.balance(w.s, w.a.id), 4);
  let r = T.runTaxMonth(w.s, "2026-11", T0); assert.strictEqual(r.charged, 1); assert.strictEqual(EK.balance(w.s, w.a.id), 2);
  assert.strictEqual(T.runTaxMonth(w.s, "2026-11", T0).charged, 0);                // idempotent
  T.runTaxMonth(w.s, "2026-12", T0); assert.strictEqual(EK.balance(w.s, w.a.id), 0);
  T.runTaxMonth(w.s, "2027-01", T0); assert.strictEqual(T.liveStatus(p), "grace");
  T.runTaxMonth(w.s, "2027-02", T0); assert.strictEqual(T.liveStatus(p), "grace");
  T.runTaxMonth(w.s, "2027-03", T0); assert.strictEqual(T.liveStatus(p), "closed");
  assert.throws(() => T.upgradePlot(w.s, w.a.id, p.id, T0), /arrears/);
  fund(w, w.a, 20); T.payArrears(w.s, w.a.id, p.id, T0); assert.strictEqual(T.liveStatus(p), "active");
});
test("plot is demolished after 2 grace + 5 closed months and the cell is free again", () => {
  const w = world(); fund(w, w.a, 51); const p = (T.claimPlot(w.s, w.a.id, 0, 0, T0), T.ensure(w.s).plots[0]);
  ["2026-11","2026-12","2027-01","2027-02","2027-03","2027-04","2027-05","2027-06"].forEach(m => T.runTaxMonth(w.s, m, T0));
  assert.strictEqual(p.status, "demolished"); assert.strictEqual(T.plotAt(w.s, "P1", 0, 0), undefined);
  fund(w, w.b, 100); assert.ok(T.claimPlot(w.s, w.b.id, 0, 0, T0));
});
test("tax with a shop is 4 and flows to ward pool, festive pool and designers", () => {
  const w = world(); storefront(w, w.a); T.submitShop(w.s, w.a.id, shopArgs(), T0);
  T.reviewShop(w.s, w.off.id, T.ensure(w.s).shops[0].id, true, "", T0);
  fund(w, w.b, 30); T.applyRole(w.s, w.b.id, "designer", T0); T.decideRole(w.s, w.admin.id, T.ensure(w.s).roleReqs[0].id, true, T0);
  const b = EK.balance(w.s, w.b.id), a = EK.balance(w.s, w.a.id); T.runTaxMonth(w.s, "2026-11", T0);
  assert.strictEqual(a - EK.balance(w.s, w.a.id), 4); assert.strictEqual(EK.balance(w.s, w.b.id) - b, 0);   // 20% of 4 = 0 (floor); tiny taxes stay in ward pool
  assert.strictEqual(T.pools(w.s).find(p => p.id === T.POOLS.festive).points >= 1, true);
});
test("role application: 21 points, admin approves, refund on reject", () => {
  const w = world(); fund(w, w.a, 30); T.applyRole(w.s, w.a.id, "theatre_manager", T0);
  assert.strictEqual(EK.balance(w.s, w.a.id), 9);
  T.decideRole(w.s, w.admin.id, T.ensure(w.s).roleReqs[0].id, false, T0); assert.strictEqual(EK.balance(w.s, w.a.id), 30);
  T.applyRole(w.s, w.a.id, "theatre_manager", T0); T.decideRole(w.s, w.admin.id, T.ensure(w.s).roleReqs[1].id, true, T0);
  assert.ok(w.a.townRoles.includes("theatre_manager"));
});
test("disputes: public and badge frozen after 7 days; upheld costs a revival chance", () => {
  const w = world(); storefront(w, w.a); const sh = T.submitShop(w.s, w.a.id, shopArgs(), T0); T.reviewShop(w.s, w.off.id, sh.id, true, "", T0);
  const d = T.openDispute(w.s, w.b.id, sh.id, "Keychain arrived broken", T0);
  assert.strictEqual(T.disputeScan(w.s, T0 + 6 * D), 0); assert.strictEqual(T.disputeScan(w.s, T0 + 7 * D), 1);
  assert.ok(d.public && sh.frozen);
  T.resolveDispute(w.s, w.off.id, d.id, true, "refund agreed", T0 + 8 * D); assert.strictEqual(sh.revival, 3);
});
test("theatre: rules for length, 24h gap, overlap, tickets go to performer", () => {
  const w = world(); fund(w, w.a, 20); fund(w, w.b, 20); fund(w, w.c, 20);
  const mk = (u, start, o) => T.proposeShow(w.s, u.id, Object.assign({ title: "Street play", desc: "A play about clean lakes", minutes: 30, startMs: start, mode: "audio" }, o), T0);
  assert.throws(() => mk(w.a, T0 + D, { minutes: 3 }), /Length/);
  const s1 = mk(w.a, T0 + D);
  assert.throws(() => mk(w.a, T0 + D + 5 * 36e5), /24 hours/);
  assert.throws(() => mk(w.b, T0 + D + 10 * 60000), /booked/);
  T.demoGrant(w.s, w.admin.id, w.c.id, 0, T0); fund(w, w.c, 25); T.applyRole(w.s, w.c.id, "theatre_manager", T0); T.decideRole(w.s, w.admin.id, T.ensure(w.s).roleReqs[0].id, true, T0);
  T.reviewShow(w.s, w.c.id, s1.id, true, "", T0);
  const pb = EK.balance(w.s, w.a.id); T.buyTicket(w.s, w.b.id, s1.id, T0 + D); assert.strictEqual(EK.balance(w.s, w.a.id), pb + 2);
  assert.throws(() => T.buyTicket(w.s, w.b.id, s1.id, T0 + D), /already/);
  T.clap(w.s, w.b.id, s1.id, T0 + D); assert.strictEqual(EK.balance(w.s, w.a.id), pb + 3);
  assert.throws(() => T.buyReplay(w.s, w.b.id, s1.id, T0 + D), /Replay|kept/);
});
test("quick phrases are limited to the safe list and rate limited", () => {
  const w = world(); assert.throws(() => T.say(w.s, w.a.id, "free text", T0), /Unknown/);
  for (let i = 0; i < 10; i++) T.say(w.s, w.a.id, "namaste", T0 + i);
  assert.throws(() => T.say(w.s, w.a.id, "namaste", T0 + 20), /Slow down/);
});
test("field mode auto-detect", () => {
  assert.strictEqual(T.shouldAutoFieldMode({ connection: { effectiveType: "3g" } }), true);
  assert.strictEqual(T.shouldAutoFieldMode({ connection: { saveData: true } }), true);
  assert.strictEqual(T.shouldAutoFieldMode({ connection: { effectiveType: "4g" }, deviceMemory: 8 }), false);
});
