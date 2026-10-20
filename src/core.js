/* e-Karmakshetra rules engine (v2). Plain JavaScript, no dependencies.
   Browser: window.EK. Node: require("./src/core.js").
   Implements: Prabhag-level public layer, 10-peer + 1-official gate, flag/strike/revival,
   append-only ledger with offset entries, rate limits, session limits, audit trail. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EK = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ROLES = Object.freeze({
    spotter: { label: "Critic / Spotter", kind: "hazard" },
    solver: { label: "Dreamer / Solver", kind: "solution" },
    pilot: { label: "Experimenter / Pilot", kind: "pilot" },
    promoter: { label: "Influencer / Promoter", kind: "campaign" },
    deliverer: { label: "Volunteer / Deliverer", kind: "delivery" }
  });

  const RULES = Object.freeze({
    PEERS_NEEDED_DEFAULT: 10,          // policy value from the design document
    FLAGS_NEEDED: 3,                   // distinct peer flags that cost one revival chance (anti-griefing)
    REVIVAL_CHANCES: 4,
    KIND_POINTS: { hazard: 10, solution: 20, pilot: 30, campaign: 20, delivery: 20 },
    PEER_POINTS: 5,                    // paid to each peer only when the report is VERIFIED
    SAATHI_BONUS: 5,
    DAILY_CAP: 40,
    MAX_REPORTS_PER_DAY: 5,
    PILOT_MIN_AGE: 18,
    SESSION_LIMIT_MIN: { "18-35": 60, "36-59": 60, "60+": 45 },
    BREAK_EVERY_MIN: 20
  });

  const CATEGORIES = ["traffic", "waste", "service", "mobility", "safety", "idea"];
  const STATUS = Object.freeze({
    PENDING: "PENDING_VERIFICATION", AWAITING: "AWAITING_OFFICIAL_REVIEW", VERIFIED: "VERIFIED",
    REVISE: "REVISE_OR_DISMISS", REJECTED: "REJECTED", TRIBUNAL: "DISPUTE_TRIBUNAL"
  });

  function newState(prabhags) {
    return { users: [], reports: [], ledger: [], audit: [], questClaims: [], quests: [], seq: 1, prabhags: prabhags || [],
             config: { peersNeeded: RULES.PEERS_NEEDED_DEFAULT } };
  }
  const nid = (s, p) => p + (s.seq++);
  const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, " ").trim();
  const today = () => { const d = new Date(); const z = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()); }; // local date (India-friendly)
  const find = (arr, id) => arr.find(x => x.id === id);

  function ageBracket(age) {
    if (age <= 10) return "0-10";
    if (age <= 17) return "11-17";
    if (age <= 35) return "18-35";
    if (age <= 59) return "36-59";
    return "60+";
  }

  function audit(state, actorId, action, refId, detail, day) {
    const e = Object.freeze({ id: nid(state, "a"), day: day || today(), actorId, action, refId, detail: detail || "" });
    state.audit.push(e); return e;
  }

  /* ---------- users ---------- */
  function registerUser(state, o) {
    const name = String(o.name || "").trim();
    if (!name) throw new Error("Name is required");
    if (!o.prabhag) throw new Error("Prabhag is required");
    if (!Number.isInteger(o.age) || o.age < RULES.PILOT_MIN_AGE)
      throw new Error("The pilot is for adults (18+). Minor access needs verified parental consent (roadmap).");
    if (state.users.find(u => norm(u.name) === norm(name) && u.prabhag === o.prabhag))
      throw new Error("Duplicate account detected for this name and Prabhag");
    const pseudonym = String(o.pseudonym || "").trim() || ("Citizen-" + (state.users.length + 1));
    if (state.users.find(u => norm(u.pseudonym) === norm(pseudonym))) throw new Error("Pseudonym already taken");
    const user = { id: nid(state, "u"), name, pseudonym, prabhag: o.prabhag, age: o.age, ageBracket: ageBracket(o.age),
      role: o.role && ROLES[o.role] ? o.role : "spotter", official: !!o.official, admin: !!(o.official && o.admin), townRoles: [], maker: false, isSaathi: !!o.isSaathi,
      isProfilePublic: o.isProfilePublic !== false, showOnLeaderboard: !!o.showOnLeaderboard,
      avatar: { type: "initials", value: "" }, verified: !!o.official };
    state.users.push(user);
    audit(state, user.id, "REGISTER", user.id);
    return user;
  }
  function verifyUser(state, userId, officialId) {
    const by = find(state.users, officialId);
    if (!by || !by.official) throw new Error("Only an official can verify a user");
    const u = find(state.users, userId); if (!u) throw new Error("User not found");
    u.verified = true; audit(state, officialId, "VERIFY_USER", userId); return u;
  }
  function setRole(state, userId, role) {
    const u = find(state.users, userId);
    if (!u) throw new Error("User not found");
    if (!ROLES[role]) throw new Error("Unknown role");
    u.role = role; return u;
  }

  /* ---------- ledger (append-only) ---------- */
  function earnedToday(state, userId, day) {
    return state.ledger.filter(e => e.userId === userId && e.day === day && e.type === "EARN")
      .reduce((s, e) => s + e.points, 0);
  }
  function mint(state, userId, event, points, refId, day) {
    const allowed = Math.max(0, Math.min(points, RULES.DAILY_CAP - earnedToday(state, userId, day)));
    const e = Object.freeze({ id: nid(state, "l"), type: "EARN", userId, event, refId, day, requested: points, points: allowed, capped: allowed < points });
    state.ledger.push(e); return e;
  }
  function offsetEntry(state, officialId, ledgerId, reason, day) {
    const o = find(state.users, officialId);
    if (!o || !o.official) throw new Error("Only an official can post a correction");
    const orig = find(state.ledger, ledgerId);
    if (!orig || orig.type !== "EARN") throw new Error("Ledger entry not found");
    if (state.ledger.find(e => e.type === "OFFSET" && e.refId === ledgerId)) throw new Error("Entry already corrected");
    if (!reason || norm(reason).length < 5) throw new Error("A reason is required");
    const e = Object.freeze({ id: nid(state, "l"), type: "OFFSET", userId: orig.userId, event: "correction: " + reason,
      refId: ledgerId, day: day || today(), requested: -orig.points, points: -orig.points, capped: false });
    state.ledger.push(e); audit(state, officialId, "LEDGER_OFFSET", ledgerId, reason, day); return e;
  }
  const balance = (s, uid) => s.ledger.filter(e => e.userId === uid).reduce((t, e) => t + e.points, 0);

  /* ---------- reports ---------- */
  function submitReport(state, userId, o) {
    const user = find(state.users, userId);
    const day = o.day || today();
    if (!user) throw new Error("User not found");
    if (!user.verified) throw new Error("Identity must be verified before filing");
    const kind = o.kind || ROLES[user.role].kind;
    if (!RULES.KIND_POINTS[kind]) throw new Error("Unknown submission type");
    if (ROLES[user.role].kind !== kind) throw new Error("Switch to the " + ROLES[Object.keys(ROLES).find(k => ROLES[k].kind === kind)].label + " role to file this");
    if (!CATEGORIES.includes(o.category)) throw new Error("Unknown category");
    if (!o.text || norm(o.text).length < 10) throw new Error("Please describe it (at least 10 characters)");
    if (!o.hasPhoto) throw new Error("Photo evidence is required");
    if (state.reports.filter(r => r.reporterId === userId && r.day === day).length >= RULES.MAX_REPORTS_PER_DAY)
      throw new Error("Daily filing limit reached (" + RULES.MAX_REPORTS_PER_DAY + ")");
    if (state.reports.find(r => r.reporterId === userId && norm(r.text) === norm(o.text))) throw new Error("Duplicate report detected");
    let beneficiary = null;
    if (o.saathiFor) {
      if (!user.isSaathi) throw new Error("Only a Digital Saathi can file on behalf of someone");
      beneficiary = String(o.saathiFor).trim(); if (!beneficiary) throw new Error("Beneficiary name required");
    }
    const r = { id: nid(state, "r"), reporterId: userId, prabhag: user.prabhag, kind, category: o.category, text: o.text.trim(),
      exactLat: Number(o.lat), exactLng: Number(o.lng), evidence: { photoName: o.photoName || "photo.jpg", capturedAt: o.capturedAt || new Date().toISOString() },
      confirmations: [], flags: [], revivalChances: RULES.REVIVAL_CHANCES, isSaathiAssisted: !!beneficiary, beneficiaryName: beneficiary,
      status: STATUS.PENDING, resolved: false, day };
    state.reports.push(r); audit(state, userId, "SUBMIT", r.id, kind, day); return r;
  }

  function guardPeer(state, r, v) {
    if (!r) throw new Error("Report not found");
    if (!v || !v.verified || v.official) throw new Error("Only verified residents can review as peers");
    if (r.reporterId === v.id) throw new Error("You cannot review your own report");
    if (r.confirmations.includes(v.id) || r.flags.includes(v.id)) throw new Error("You have already reviewed this report");
    if (r.status !== STATUS.PENDING) throw new Error("Report is not open for peer review");
  }
  function confirmReport(state, reportId, verifierId, day) {
    const r = find(state.reports, reportId), v = find(state.users, verifierId);
    guardPeer(state, r, v);
    r.confirmations.push(v.id); audit(state, v.id, "PEER_CONFIRM", r.id, "", day);
    if (r.confirmations.length >= state.config.peersNeeded) r.status = STATUS.AWAITING;
    return r;
  }
  function flagReport(state, reportId, verifierId, reason, day) {
    const r = find(state.reports, reportId), v = find(state.users, verifierId);
    guardPeer(state, r, v);
    if (!reason || norm(reason).length < 5) throw new Error("Please give a reason for the flag");
    r.flags.push(v.id); audit(state, v.id, "FLAG_FAKE", r.id, reason, day);
    if (r.flags.length >= RULES.FLAGS_NEEDED) {            // one strike
      r.revivalChances -= 1; r.flags = []; r.confirmations = [];
      r.status = r.revivalChances > 0 ? STATUS.REVISE : STATUS.TRIBUNAL;
      audit(state, "system", r.status === STATUS.TRIBUNAL ? "TO_TRIBUNAL" : "STRIKE", r.id, "chances left: " + r.revivalChances, day);
    }
    return r;
  }
  function reviseReport(state, reportId, userId, o) {
    const r = find(state.reports, reportId);
    if (!r || r.reporterId !== userId) throw new Error("Only the reporter can revise");
    if (r.status !== STATUS.REVISE) throw new Error("This report is not open for revision");
    if (!o.text || norm(o.text).length < 10) throw new Error("Please describe it (at least 10 characters)");
    if (!o.hasPhoto) throw new Error("New photo evidence is required");
    r.text = o.text.trim(); r.evidence = { photoName: o.photoName || "photo.jpg", capturedAt: new Date().toISOString() };
    r.status = STATUS.PENDING; audit(state, userId, "REVISE", r.id, "", o.day); return r;
  }
  function officialApprove(state, reportId, officialId, day) {
    day = day || today();
    const r = find(state.reports, reportId), o = find(state.users, officialId);
    if (!o || !o.official) throw new Error("Only an official can approve");
    if (!r) throw new Error("Report not found");
    if (r.status !== STATUS.AWAITING) throw new Error("Report is not awaiting official review");
    r.status = STATUS.VERIFIED; r.verifiedDay = day; audit(state, officialId, "OFFICIAL_APPROVE", r.id, "", day);
    mint(state, r.reporterId, "verified_" + r.kind, RULES.KIND_POINTS[r.kind], r.id, day);
    if (r.isSaathiAssisted) mint(state, r.reporterId, "saathi_bonus", RULES.SAATHI_BONUS, r.id, day);
    r.confirmations.forEach(pid => mint(state, pid, "peer_confirmation", RULES.PEER_POINTS, r.id, day));
    return r;
  }
  function officialReject(state, reportId, officialId, reason, day) {
    const r = find(state.reports, reportId), o = find(state.users, officialId);
    if (!o || !o.official) throw new Error("Only an official can reject");
    if (!r || r.status !== STATUS.AWAITING) throw new Error("Report is not awaiting official review");
    if (!reason || norm(reason).length < 5) throw new Error("A reason is required");
    r.status = STATUS.REJECTED; audit(state, officialId, "OFFICIAL_REJECT", r.id, reason, day); return r;
  }
  function markResolved(state, reportId, officialId, day) {
    const r = find(state.reports, reportId), o = find(state.users, officialId);
    if (!o || !o.official) throw new Error("Only an official can mark resolved");
    if (!r || r.status !== STATUS.VERIFIED) throw new Error("Only verified reports can be resolved");
    r.resolved = true; r.resolvedDay = day || today(); audit(state, officialId, "RESOLVE", r.id, "", day); return r;
  }
  function setPeersNeeded(state, officialId, n) {
    const o = find(state.users, officialId);
    if (!o || !o.official) throw new Error("Only an official can change the threshold");
    if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error("Threshold must be 1 to 50");
    state.config.peersNeeded = n; audit(state, officialId, "SET_THRESHOLD", "config", String(n));
  }

  /* ---------- two-layer map ---------- */
  function centroid(state, prabhagId) {
    const p = state.prabhags.find(x => x.id === prabhagId);
    return p ? { lat: p.lat, lng: p.lng } : null;
  }
  function publicView(state, r) {
    const u = find(state.users, r.reporterId);
    return { id: r.id, prabhag: r.prabhag, centroid: centroid(state, r.prabhag), kind: r.kind, category: r.category, status: r.status,
      text: r.text, by: u && u.isProfilePublic ? u.pseudonym : "Anonymous resident", peerCount: r.confirmations.length };
  }
  function officialView(state, r) {
    return Object.assign({}, r, { exact: { lat: r.exactLat, lng: r.exactLng } });
  }

  /* ---------- wellbeing ---------- */
  const sessionLimit = (u) => RULES.SESSION_LIMIT_MIN[u.ageBracket] || 30;
  const sessionAllowed = (u, minutes) => minutes < sessionLimit(u);
  const breakDue = (minutes) => minutes > 0 && minutes % RULES.BREAK_EVERY_MIN === 0;


  /* ---------- profile, levels, badges, leaderboard, quests (recognition only; never money) ---------- */
  const AVATARS = Object.freeze(["\u{1F989}", "\u{1F42F}", "\u{1F99A}", "\u{1F338}", "\u{1F418}", "\u{1F981}", "\u{1F333}", "☀️", "\u{1FA94}", "\u{1F3F9}"]);
  const LEVELS = Object.freeze([
    { name: "Seed", xp: 0 }, { name: "Sprout", xp: 25 }, { name: "Sapling", xp: 60 },
    { name: "Tree", xp: 120 }, { name: "Grove", xp: 220 }, { name: "Forest", xp: 400 }]);

  function setProfile(state, userId, o) {
    const u = find(state.users, userId); if (!u) throw new Error("User not found");
    if (o.avatar) {
      const a = o.avatar;
      if (a.type === "emoji") { if (!AVATARS.includes(a.value)) throw new Error("Unknown avatar"); }
      else if (a.type === "photo") {
        if (typeof a.value !== "string" || !a.value.startsWith("data:image/") || a.value.length > 80000) throw new Error("Photo must be a small image");
      } else if (a.type !== "initials") throw new Error("Unknown avatar type");
      u.avatar = { type: a.type, value: a.type === "initials" ? "" : a.value };
    }
    if (typeof o.isProfilePublic === "boolean") u.isProfilePublic = o.isProfilePublic;
    if (typeof o.showOnLeaderboard === "boolean") u.showOnLeaderboard = o.showOnLeaderboard;
    return u;
  }

  const questXp = (state, uid) => (state.questClaims || []).filter(c => c.userId === uid).reduce((s, c) => s + c.xp, 0);
  /* XP counts points EARNED for verified outcomes (EARN and OFFSET), not spending or transfers, so buying a plot never lowers your level. */
  const earnedXp = (state, uid) => state.ledger.filter(e => e.userId === uid && (e.type === "EARN" || e.type === "OFFSET")).reduce((t, e) => t + e.points, 0);
  const totalXp = (state, uid) => Math.max(0, earnedXp(state, uid) + questXp(state, uid));
  function levelFor(xp) {
    let i = 0; LEVELS.forEach((l, k) => { if (xp >= l.xp) i = k; });
    const cur = LEVELS[i], nxt = LEVELS[i + 1] || null;
    return { index: i, level: i + 1, name: cur.name, xp, floor: cur.xp, next: nxt ? nxt.xp : null, nextName: nxt ? nxt.name : null,
      progress: nxt ? Math.round(((xp - cur.xp) / (nxt.xp - cur.xp)) * 100) : 100 };
  }

  const BADGES = Object.freeze([
    { id: "first_light", icon: "\u{1F31F}", name: "First Light", how: "Get one of your own submissions verified" },
    { id: "peer_guardian", icon: "\u{1F6E1}️", name: "Peer Guardian", how: "Be one of the peers on 3 verified submissions" },
    { id: "saathi_hero", icon: "\u{1F91D}", name: "Digital Saathi", how: "Get a Saathi-assisted submission verified" },
    { id: "pilot_pioneer", icon: "\u{1F9EA}", name: "Pilot Pioneer", how: "Get a pilot proof verified" },
    { id: "quest_hunter", icon: "\u{1F3AF}", name: "Quest Hunter", how: "Claim 3 quests" },
    { id: "festival_spirit", icon: "\u{1FA94}", name: "Festival Spirit", how: "Claim a festive quest" }]);
  function badgesFor(state, uid) {
    const own = state.reports.filter(r => r.reporterId === uid && r.status === STATUS.VERIFIED);
    const asPeer = state.reports.filter(r => r.status === STATUS.VERIFIED && r.confirmations.includes(uid)).length;
    const claims = (state.questClaims || []).filter(c => c.userId === uid);
    const has = {
      first_light: own.length >= 1, peer_guardian: asPeer >= 3,
      saathi_hero: own.some(r => r.isSaathiAssisted), pilot_pioneer: own.some(r => r.kind === "pilot"),
      quest_hunter: claims.length >= 3, festival_spirit: claims.some(c => c.period === "festive") };
    return BADGES.map(b => Object.assign({ earned: !!has[b.id] }, b));
  }

  function leaderboard(state, prabhagId) {
    return state.users.filter(u => u.verified && !u.official && u.showOnLeaderboard && u.isProfilePublic && (!prabhagId || u.prabhag === prabhagId))
      .map(u => ({ userId: u.id, pseudonym: u.pseudonym, prabhag: u.prabhag, avatar: u.avatar, xp: totalXp(state, u.id), level: levelFor(totalXp(state, u.id)).name }))
      .sort((a, b) => b.xp - a.xp || a.pseudonym.localeCompare(b.pseudonym));
  }

  /* quests: data-driven (data/quests.json). Rewards are Quest XP: recognition and levels only, never ledger points or money. */
  function questWindow(q, now) {
    if (q.period === "daily") return { from: now, to: now, key: now };
    if (q.period === "monthly") return { from: now.slice(0, 7) + "-01", to: now.slice(0, 7) + "-31", key: now.slice(0, 7) };
    if (q.period === "yearly") return { from: now.slice(0, 4) + "-01-01", to: now.slice(0, 4) + "-12-31", key: now.slice(0, 4) };
    return { from: q.from, to: q.to, key: q.id };   // festive / special event
  }
  const inWin = (d, w) => d >= w.from && d <= w.to;
  function questProgress(state, uid, q, now) {
    now = now || today(); const w = questWindow(q, now); let n = 0;
    if (q.goal === "review") n = state.audit.filter(a => a.actorId === uid && (a.action === "PEER_CONFIRM" || a.action === "FLAG_FAKE") && inWin(a.day, w)).length;
    else if (q.goal === "file") n = state.reports.filter(r => r.reporterId === uid && inWin(r.day, w) && (!q.category || r.category === q.category) && (!q.kind || r.kind === q.kind)).length;
    else if (q.goal === "verified") n = state.reports.filter(r => r.reporterId === uid && r.status === STATUS.VERIFIED && r.verifiedDay && inWin(r.verifiedDay, w) && (!q.category || r.category === q.category)).length;
    const claimed = (state.questClaims || []).some(c => c.userId === uid && c.questId === q.id && c.periodKey === w.key);
    const status = claimed ? "claimed" : now < w.from ? "upcoming" : now > w.to ? "ended" : n >= q.count ? "ready" : "active";
    return { questId: q.id, progress: Math.min(n, q.count), goal: q.count, status, window: w };
  }
  function claimQuest(state, uid, questId, now) {
    now = now || today();
    const q = state.quests.find(x => x.id === questId); if (!q) throw new Error("Quest not found");
    const u = find(state.users, uid); if (!u || !u.verified || u.official) throw new Error("Only verified residents can claim quests");
    const p = questProgress(state, uid, q, now);
    if (p.status === "claimed") throw new Error("Already claimed for this period");
    if (p.status !== "ready") throw new Error("Quest is not complete yet");
    const c = Object.freeze({ id: nid(state, "q"), userId: uid, questId, period: q.period, periodKey: p.window.key, xp: q.xp, day: now });
    state.questClaims.push(c); audit(state, uid, "QUEST_CLAIM", questId, "+" + q.xp + " XP", now); return c;
  }

  function kpis(state) {
    const by = (s) => state.reports.filter(r => r.status === s).length;
    const verified = by(STATUS.VERIFIED), resolved = state.reports.filter(r => r.resolved).length;
    return { verifiedResidents: state.users.filter(u => u.verified && !u.official).length, reports: state.reports.length,
      pending: by(STATUS.PENDING), awaitingOfficial: by(STATUS.AWAITING), verified, rejected: by(STATUS.REJECTED),
      needsRevision: by(STATUS.REVISE), tribunal: by(STATUS.TRIBUNAL), resolved,
      resolutionRate: verified ? Math.round((resolved / verified) * 100) : 0 };
  }

  return { ROLES, RULES, CATEGORIES, STATUS, ageBracket, newState, registerUser, verifyUser, setRole, submitReport, confirmReport,
    flagReport, reviseReport, officialApprove, officialReject, markResolved, setPeersNeeded, offsetEntry, publicView, officialView,
    sessionLimit, sessionAllowed, breakDue, balance, earnedToday, kpis,
    AVATARS, LEVELS, BADGES, setProfile, totalXp, questXp, levelFor, badgesFor, leaderboard, questProgress, claimQuest };
});
