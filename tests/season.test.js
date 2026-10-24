const test = require("node:test"), assert = require("node:assert");
const EK = require("../src/core.js"), SE = require("../src/season.js");
function world() {
  const s = EK.newState([{ id: "P1", name: "A", lat: 1, lng: 1 }, { id: "P2", name: "B", lat: 1, lng: 2 }]);
  const mk = (n, pr, o) => { const u = EK.registerUser(s, Object.assign({ name: n, pseudonym: n, prabhag: pr, age: 30 }, o)); u.verified = true; return u; };
  const off = mk("Off", "P1", { official: true }), res = []; for (let i = 0; i < 12; i++) res.push(mk("R" + i, i < 8 ? "P1" : "P2", {}));
  return { s, off, res };
}
function verifiedReport(w, by, day, cat) {
  const r = EK.submitReport(w.s, by.id, { category: cat, text: "Pile of waste " + Math.random(), hasPhoto: true, lat: 1, lng: 1, day });
  w.res.filter(p => p.id !== by.id).slice(0, 10).forEach(p => EK.confirmReport(w.s, r.id, p.id, day)); EK.officialApprove(w.s, r.id, w.off.id, day); return r;
}
const ev = { id: "k", category: "waste", from: "2026-10-19", to: "2026-12-31", hp: 30, perReport: 6, perPeer: 1, xp: 15 };
test("week window is Monday to Sunday", () => { const w = SE.windowFor("2026-10-21", "week"); assert.deepStrictEqual([w.from, w.to], ["2026-10-19", "2026-10-25"]); });
test("ward wars rank by points per resident and ignore other weeks", () => {
  const w = world(); verifiedReport(w, w.res[0], "2026-10-21", "waste"); verifiedReport(w, w.res[9], "2026-10-21", "waste"); verifiedReport(w, w.res[10], "2026-09-01", "waste");
  const r = SE.wardWars(w.s, "2026-10-21", "week");
  assert.strictEqual(r.rows.reduce((t, x) => t + x.verified, 0), 2); assert.ok(r.leader); assert.strictEqual(r.rows[0].rank, 1);
  const p2 = r.rows.find(x => x.prabhag === "P2"), p1 = r.rows.find(x => x.prabhag === "P1"); assert.ok(p2.perResident >= 0 && p1.residents === 8);
});
test("boss loses HP per verified report and per peer, then can be claimed once by helpers only", () => {
  const w = world(); assert.strictEqual(SE.bossStatus(w.s, ev, "2026-10-21").hp, 30);
  verifiedReport(w, w.res[0], "2026-10-21", "waste"); let b = SE.bossStatus(w.s, ev, "2026-10-21");
  assert.strictEqual(b.hp, 30 - (6 + 10)); assert.strictEqual(b.status, "active");
  verifiedReport(w, w.res[1], "2026-10-21", "waste"); b = SE.bossStatus(w.s, ev, "2026-10-21");
  assert.strictEqual(b.hp, 0); assert.strictEqual(b.status, "defeated");
  assert.throws(() => SE.claimBoss(w.s, w.off.id, ev, "2026-10-21"), /helped/);
  const xp0 = EK.questXp(w.s, w.res[2].id); SE.claimBoss(w.s, w.res[2].id, ev, "2026-10-21"); assert.strictEqual(EK.questXp(w.s, w.res[2].id), xp0 + 15);
  assert.throws(() => SE.claimBoss(w.s, w.res[2].id, ev, "2026-10-21"), /already/);
});
test("other categories do not hurt the boss; unfinished boss escapes after its dates", () => {
  const w = world(); verifiedReport(w, w.res[0], "2026-10-21", "traffic");
  assert.strictEqual(SE.bossStatus(w.s, ev, "2026-10-21").hp, 30); assert.strictEqual(SE.bossStatus(w.s, ev, "2027-01-05").status, "escaped");
});
