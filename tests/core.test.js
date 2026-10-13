const test = require("node:test");
const assert = require("node:assert");
const EK = require("../src/core.js");
const S = EK.STATUS;

const PR = [{ id: "P4", lat: 21.0025, lng: 75.581 }, { id: "P1", lat: 21.02, lng: 75.55 }];
const D = "2026-10-14";

function world(nPeers = 12) {
  const s = EK.newState(PR);
  const off = EK.registerUser(s, { name: "Official", prabhag: "P4", age: 40, official: true });
  const rep = EK.registerUser(s, { name: "Reporter", prabhag: "P4", age: 25, role: "spotter", pseudonym: "Rep" });
  const peers = [];
  for (let i = 0; i < nPeers; i++) {
    const u = EK.registerUser(s, { name: "Peer" + i, prabhag: "P1", age: 30, pseudonym: "P" + i });
    EK.verifyUser(s, u.id, off.id); peers.push(u);
  }
  EK.verifyUser(s, rep.id, off.id);
  return { s, off, rep, peers };
}
const draft = { category: "waste", text: "Overflowing bin near the market gate", hasPhoto: true, lat: 21.0031, lng: 75.5822, day: D };
function toAwaiting(w) {
  const r = EK.submitReport(w.s, w.rep.id, draft);
  w.peers.slice(0, 10).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
  return r;
}

test("pilot is adults only", () => {
  const s = EK.newState(PR);
  assert.throws(() => EK.registerUser(s, { name: "Kid", prabhag: "P1", age: 16 }), /adults/);
});
test("age brackets are non-overlapping", () => {
  assert.deepStrictEqual([10, 17, 18, 35, 36, 59, 60].map(EK.ageBracket), ["0-10", "11-17", "18-35", "18-35", "36-59", "36-59", "60+"]);
});
test("duplicate account and pseudonym blocked", () => {
  const { s } = world(1);
  assert.throws(() => EK.registerUser(s, { name: "reporter", prabhag: "P4", age: 30 }), /Duplicate/);
  assert.throws(() => EK.registerUser(s, { name: "Other", prabhag: "P4", age: 30, pseudonym: "rep" }), /Pseudonym/);
});
test("unverified user cannot file", () => {
  const s = EK.newState(PR);
  const u = EK.registerUser(s, { name: "New", prabhag: "P1", age: 25 });
  assert.throws(() => EK.submitReport(s, u.id, draft), /verified/);
});
test("filing needs photo, description and the matching role", () => {
  const { s, rep } = world(1);
  assert.throws(() => EK.submitReport(s, rep.id, { ...draft, hasPhoto: false }), /Photo/);
  assert.throws(() => EK.submitReport(s, rep.id, { ...draft, text: "short" }), /describe/);
  assert.throws(() => EK.submitReport(s, rep.id, { ...draft, kind: "pilot" }), /role/);
});
test("duplicate report and daily filing limit", () => {
  const { s, rep } = world(1);
  EK.submitReport(s, rep.id, draft);
  assert.throws(() => EK.submitReport(s, rep.id, draft), /Duplicate/);
  for (let i = 0; i < 4; i++) EK.submitReport(s, rep.id, { ...draft, text: "Another distinct issue number " + i });
  assert.throws(() => EK.submitReport(s, rep.id, { ...draft, text: "One issue too many today" }), /limit/);
});
test("9 peers are not enough; 10 move it to official review", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  w.peers.slice(0, 9).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
  assert.strictEqual(r.status, S.PENDING);
  EK.confirmReport(w.s, r.id, w.peers[9].id, D);
  assert.strictEqual(r.status, S.AWAITING);
});
test("self-review, double review and official-as-peer are blocked", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  assert.throws(() => EK.confirmReport(w.s, r.id, w.rep.id), /own/);
  EK.confirmReport(w.s, r.id, w.peers[0].id);
  assert.throws(() => EK.confirmReport(w.s, r.id, w.peers[0].id), /already/);
  assert.throws(() => EK.confirmReport(w.s, r.id, w.off.id), /peers/);
});
test("no points before official approval", () => {
  const w = world(); toAwaiting(w);
  assert.strictEqual(EK.balance(w.s, w.rep.id), 0);
  assert.strictEqual(EK.balance(w.s, w.peers[0].id), 0);
});
test("official approval mints reporter and peer points", () => {
  const w = world(); const r = toAwaiting(w);
  EK.officialApprove(w.s, r.id, w.off.id, D);
  assert.strictEqual(r.status, S.VERIFIED);
  assert.strictEqual(EK.balance(w.s, w.rep.id), 10);
  assert.strictEqual(EK.balance(w.s, w.peers[0].id), 5);
  assert.strictEqual(EK.balance(w.s, w.peers[10].id), 0); // did not confirm
});
test("solution and pilot kinds are worth more", () => {
  const w = world(); EK.setRole(w.s, w.rep.id, "pilot");
  const r = EK.submitReport(w.s, w.rep.id, { ...draft, kind: "pilot", text: "Composting pilot results with before and after photos" });
  w.peers.slice(0, 10).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
  EK.officialApprove(w.s, r.id, w.off.id, D);
  assert.strictEqual(EK.balance(w.s, w.rep.id), 30);
});
test("official rejection pays nothing", () => {
  const w = world(); const r = toAwaiting(w);
  assert.throws(() => EK.officialReject(w.s, r.id, w.off.id, ""), /reason/);
  EK.officialReject(w.s, r.id, w.off.id, "Photo does not match location", D);
  assert.strictEqual(r.status, S.REJECTED);
  assert.strictEqual(EK.balance(w.s, w.peers[0].id), 0);
});
test("only officials approve; resident cannot", () => {
  const w = world(); const r = toAwaiting(w);
  assert.throws(() => EK.officialApprove(w.s, r.id, w.peers[0].id), /official/);
});
test("3 flags cost one revival chance and send report to revision", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  w.peers.slice(0, 2).forEach(p => EK.flagReport(w.s, r.id, p.id, "looks fake", D));
  assert.strictEqual(r.status, S.PENDING);
  EK.flagReport(w.s, r.id, w.peers[2].id, "looks fake", D);
  assert.strictEqual(r.status, S.REVISE);
  assert.strictEqual(r.revivalChances, 3);
});
test("revision returns to peer review; four strikes end in tribunal", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  for (let strike = 1; strike <= 4; strike++) {
    const ps = w.peers.slice((strike - 1) * 3, strike * 3);
    ps.forEach(p => EK.flagReport(w.s, r.id, p.id, "duplicate of another", D));
    if (strike < 4) {
      assert.strictEqual(r.status, S.REVISE);
      EK.reviseReport(w.s, r.id, w.rep.id, { text: "Revised description with better detail " + strike, hasPhoto: true, day: D });
      assert.strictEqual(r.status, S.PENDING);
    }
  }
  assert.strictEqual(r.revivalChances, 0);
  assert.strictEqual(r.status, S.TRIBUNAL);
});
test("only the reporter can revise, and only when revision is open", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  assert.throws(() => EK.reviseReport(w.s, r.id, w.rep.id, { text: "Some long enough text", hasPhoto: true }), /not open/);
  w.peers.slice(0, 3).forEach(p => EK.flagReport(w.s, r.id, p.id, "looks fake"));
  assert.throws(() => EK.reviseReport(w.s, r.id, w.peers[0].id, { text: "Some long enough text", hasPhoto: true }), /reporter/);
});
test("Saathi can file for a beneficiary and earns a bonus; others cannot", () => {
  const w = world();
  const sa = EK.registerUser(w.s, { name: "Saathi", prabhag: "P4", age: 28, isSaathi: true, pseudonym: "Saathi1" });
  EK.verifyUser(w.s, sa.id, w.off.id);
  assert.throws(() => EK.submitReport(w.s, w.rep.id, { ...draft, saathiFor: "Granny" }), /Saathi/);
  const r = EK.submitReport(w.s, sa.id, { ...draft, saathiFor: "Granny Demo" });
  assert.strictEqual(r.isSaathiAssisted, true);
  w.peers.slice(0, 10).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
  EK.officialApprove(w.s, r.id, w.off.id, D);
  assert.strictEqual(EK.balance(w.s, sa.id), 15);
});
test("daily cap limits earnings", () => {
  const w = world();
  for (let i = 0; i < 5; i++) {
    const r = EK.submitReport(w.s, w.rep.id, { ...draft, text: "Distinct hazard report number " + i + " at gate" });
    w.peers.slice(0, 10).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
    EK.officialApprove(w.s, r.id, w.off.id, D);
  }
  assert.strictEqual(EK.earnedToday(w.s, w.rep.id, D), EK.RULES.DAILY_CAP);
  assert.ok(w.s.ledger.some(e => e.capped));
});
test("ledger entries are frozen; corrections are offset entries", () => {
  const w = world(); const r = toAwaiting(w); EK.officialApprove(w.s, r.id, w.off.id, D);
  const e = w.s.ledger.find(x => x.userId === w.rep.id);
  assert.ok(Object.isFrozen(e));
  assert.throws(() => { "use strict"; e.points = 999; }, TypeError);
  EK.offsetEntry(w.s, w.off.id, e.id, "Approved in error", D);
  assert.strictEqual(EK.balance(w.s, w.rep.id), 0);
  assert.throws(() => EK.offsetEntry(w.s, w.off.id, e.id, "Approved in error"), /already/);
  assert.throws(() => EK.offsetEntry(w.s, w.peers[0].id, e.id, "Hacking attempt"), /official/);
});
test("public view exposes Prabhag centroid only, never exact coordinates", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  const pub = JSON.stringify(EK.publicView(w.s, r));
  assert.ok(!pub.includes("21.0031") && !pub.includes("75.5822"));
  assert.ok(pub.includes("21.0025"));
  assert.strictEqual(EK.officialView(w.s, r).exact.lat, 21.0031);
});
test("private profile shows as anonymous on the public layer", () => {
  const w = world(); const r = EK.submitReport(w.s, w.rep.id, draft);
  assert.strictEqual(EK.publicView(w.s, r).by, "Rep");
  w.rep.isProfilePublic = false;
  assert.strictEqual(EK.publicView(w.s, r).by, "Anonymous resident");
});
test("session limits by age bracket and break reminders", () => {
  const w = world(); const old = EK.registerUser(w.s, { name: "Elder", prabhag: "P1", age: 70, pseudonym: "El" });
  assert.strictEqual(EK.sessionLimit(w.rep), 60);
  assert.strictEqual(EK.sessionLimit(old), 45);
  assert.strictEqual(EK.sessionAllowed(old, 45), false);
  assert.strictEqual(EK.breakDue(20), true);
  assert.strictEqual(EK.breakDue(21), false);
});
test("audit trail records actions and is frozen", () => {
  const w = world(); const r = toAwaiting(w); EK.officialApprove(w.s, r.id, w.off.id, D);
  const acts = w.s.audit.map(a => a.action);
  assert.ok(acts.includes("SUBMIT") && acts.includes("PEER_CONFIRM") && acts.includes("OFFICIAL_APPROVE"));
  assert.ok(Object.isFrozen(w.s.audit[0]));
});
test("threshold change is official-only and bounded", () => {
  const w = world();
  assert.throws(() => EK.setPeersNeeded(w.s, w.rep.id, 3), /official/);
  assert.throws(() => EK.setPeersNeeded(w.s, w.off.id, 0), /1 to 50/);
  EK.setPeersNeeded(w.s, w.off.id, 3);
  const r = EK.submitReport(w.s, w.rep.id, draft);
  w.peers.slice(0, 3).forEach(p => EK.confirmReport(w.s, r.id, p.id, D));
  assert.strictEqual(r.status, S.AWAITING);
});
test("KPIs reflect states and resolution", () => {
  const w = world(); const r = toAwaiting(w); EK.officialApprove(w.s, r.id, w.off.id, D);
  EK.markResolved(w.s, r.id, w.off.id, D);
  const k = EK.kpis(w.s);
  assert.strictEqual(k.verified, 1); assert.strictEqual(k.resolved, 1); assert.strictEqual(k.resolutionRate, 100);
});

/* ---------- profile, levels, badges, leaderboard, quests ---------- */
const QUESTS = [
  { id: "d_review2", period: "daily", goal: "review", count: 2, xp: 5 },
  { id: "d_file1", period: "daily", goal: "file", count: 1, xp: 5 },
  { id: "f_waste", period: "festive", goal: "file", category: "waste", count: 1, xp: 25, from: "2026-10-12", to: "2026-10-21" }
];
test("levels are computed from XP with progress to the next level", () => {
  assert.strictEqual(EK.levelFor(0).name, "Seed");
  const l = EK.levelFor(40);
  assert.strictEqual(l.name, "Sprout"); assert.strictEqual(l.nextName, "Sapling");
  assert.strictEqual(l.progress, Math.round(((40 - 25) / (60 - 25)) * 100));
  assert.strictEqual(EK.levelFor(9999).progress, 100);
});
test("profile accepts emoji, initials and small photos; rejects unknown or huge images", () => {
  const { s, rep } = world(1);
  EK.setProfile(s, rep.id, { avatar: { type: "emoji", value: EK.AVATARS[0] } });
  assert.strictEqual(rep.avatar.type, "emoji");
  EK.setProfile(s, rep.id, { avatar: { type: "initials" } });
  EK.setProfile(s, rep.id, { avatar: { type: "photo", value: "data:image/jpeg;base64,AAAA" } });
  assert.throws(() => EK.setProfile(s, rep.id, { avatar: { type: "emoji", value: "x" } }), /Unknown/);
  assert.throws(() => EK.setProfile(s, rep.id, { avatar: { type: "photo", value: "http://evil.example/x.png" } }), /small image/);
  assert.throws(() => EK.setProfile(s, rep.id, { avatar: { type: "photo", value: "data:image/png;base64," + "A".repeat(90000) } }), /small image/);
});
test("leaderboard is opt-in, public-profile only, and ordered by XP", () => {
  const w = world(); const r = toAwaiting(w); EK.officialApprove(w.s, r.id, w.off.id, D);
  assert.strictEqual(EK.leaderboard(w.s).length, 0);
  EK.setProfile(w.s, w.rep.id, { showOnLeaderboard: true });
  EK.setProfile(w.s, w.peers[0].id, { showOnLeaderboard: true });
  const lb = EK.leaderboard(w.s);
  assert.strictEqual(lb[0].pseudonym, "Rep"); assert.strictEqual(lb[0].xp, 10);
  assert.strictEqual(lb[1].xp, 5);
  EK.setProfile(w.s, w.rep.id, { isProfilePublic: false });
  assert.strictEqual(EK.leaderboard(w.s).some(x => x.pseudonym === "Rep"), false);
  assert.strictEqual(EK.leaderboard(w.s, "P4").length, 0);
});
test("badges unlock from verified outcomes", () => {
  const w = world(); const r = toAwaiting(w);
  assert.strictEqual(EK.badgesFor(w.s, w.rep.id).find(b => b.id === "first_light").earned, false);
  EK.officialApprove(w.s, r.id, w.off.id, D);
  assert.strictEqual(EK.badgesFor(w.s, w.rep.id).find(b => b.id === "first_light").earned, true);
});
test("daily quest progress counts reviews done today only", () => {
  const w = world(); w.s.quests = QUESTS; const q = QUESTS[0];
  const r = EK.submitReport(w.s, w.rep.id, { ...draft, day: D });
  EK.confirmReport(w.s, r.id, w.peers[0].id, D);
  assert.strictEqual(EK.questProgress(w.s, w.peers[0].id, q, D).progress, 1);
  assert.strictEqual(EK.questProgress(w.s, w.peers[0].id, q, "2026-10-15").progress, 0);
  assert.throws(() => EK.claimQuest(w.s, w.peers[0].id, "d_review2", D), /not complete/);
});
test("claiming a quest gives XP once per period, never ledger points", () => {
  const w = world(); w.s.quests = QUESTS;
  EK.submitReport(w.s, w.rep.id, { ...draft, day: D });
  assert.strictEqual(EK.questProgress(w.s, w.rep.id, QUESTS[1], D).status, "ready");
  EK.claimQuest(w.s, w.rep.id, "d_file1", D);
  assert.strictEqual(EK.questXp(w.s, w.rep.id), 5);
  assert.strictEqual(EK.balance(w.s, w.rep.id), 0);
  assert.strictEqual(EK.totalXp(w.s, w.rep.id), 5);
  assert.throws(() => EK.claimQuest(w.s, w.rep.id, "d_file1", D), /Already/);
  EK.submitReport(w.s, w.rep.id, { ...draft, text: "A second distinct report for tomorrow", day: "2026-10-15" });
  EK.claimQuest(w.s, w.rep.id, "d_file1", "2026-10-15");
  assert.strictEqual(EK.questXp(w.s, w.rep.id), 10);
});
test("festive quest only works inside its window and by category", () => {
  const w = world(); w.s.quests = QUESTS; const q = QUESTS[2];
  EK.submitReport(w.s, w.rep.id, { ...draft, day: "2026-10-14" });
  assert.strictEqual(EK.questProgress(w.s, w.rep.id, q, "2026-10-14").status, "ready");
  assert.strictEqual(EK.questProgress(w.s, w.rep.id, q, "2026-10-01").status, "upcoming");
  assert.strictEqual(EK.questProgress(w.s, w.rep.id, q, "2026-11-01").status, "ended");
  EK.claimQuest(w.s, w.rep.id, "f_waste", "2026-10-14");
  assert.ok(EK.badgesFor(w.s, w.rep.id).find(b => b.id === "festival_spirit").earned);
});
test("officials cannot claim quests", () => {
  const w = world(); w.s.quests = QUESTS;
  assert.throws(() => EK.claimQuest(w.s, w.off.id, "d_file1", D), /residents/);
});
test("sample quest file is valid", () => {
  const q = require("../data/quests.json").quests; const ids = new Set();
  q.forEach(x => { assert.ok(x.id && x.title && x.text && x.xp > 0 && x.count > 0); assert.ok(!ids.has(x.id)); ids.add(x.id);
    assert.ok(["daily", "monthly", "yearly", "festive"].includes(x.period)); assert.ok(["review", "file", "verified"].includes(x.goal));
    if (x.period === "festive") assert.ok(x.from <= x.to); });
});
