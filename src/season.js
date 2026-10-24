/* e-Karmakshetra team play (v8): Ward Wars (Prabhag vs Prabhag) and community Boss events.
   Nobody fights anybody: Prabhags compete on verified civic work and the "bosses" are civic problems (waste, broken roads).
   Plain JavaScript on top of src/core.js. Browser: window.SEASON. Node: require("./src/season.js"). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./core.js"));
  else root.SEASON = factory(root.EK);
})(typeof self !== "undefined" ? self : this, function (EK) {
  "use strict";
  const S = EK.STATUS, z = (n) => String(n).padStart(2, "0");
  const fmt = (d) => d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  const parse = (day) => { const [y, m, d] = day.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (day, n) => { const d = parse(day); d.setDate(d.getDate() + n); return fmt(d); };
  function windowFor(day, span) {
    if (span === "month") return { from: day.slice(0, 7) + "-01", to: day.slice(0, 7) + "-31", label: "this month" };
    const dow = (parse(day).getDay() + 6) % 7, from = addDays(day, -dow);   // Monday to Sunday
    return { from, to: addDays(from, 6), label: "this week" };
  }
  const inWin = (d, w) => !!d && d >= w.from && d <= w.to;

  /* Ranked by points per verified resident so a small Prabhag can beat a big one. */
  function wardWars(state, day, span) {
    const w = windowFor(day, span || "week");
    const rows = state.prabhags.map(p => {
      const residents = state.users.filter(u => u.prabhag === p.id && u.verified && !u.official).length;
      const verified = state.reports.filter(r => r.prabhag === p.id && r.status === S.VERIFIED && inWin(r.verifiedDay, w)).length;
      const reviews = state.audit.filter(a => (a.action === "PEER_CONFIRM" || a.action === "FLAG_FAKE") && inWin(a.day, w) &&
        (state.users.find(u => u.id === a.actorId) || {}).prabhag === p.id).length;
      const score = verified * 10 + reviews;
      return { prabhag: p.id, name: p.name, residents, verified, reviews, score, perResident: residents ? Math.round(score / residents * 10) / 10 : 0 };
    }).sort((a, b) => b.perResident - a.perResident || b.score - a.score || a.name.localeCompare(b.name));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { window: w, rows, leader: rows.length && rows[0].score > 0 ? rows[0] : null };
  }

  function bossStatus(state, ev, day) {
    const w = { from: ev.from, to: ev.to };
    const hits = state.reports.filter(r => r.status === S.VERIFIED && r.category === ev.category && inWin(r.verifiedDay, w));
    const damage = hits.reduce((t, r) => t + ev.perReport + ev.perPeer * r.confirmations.length, 0);
    const hp = Math.max(0, ev.hp - damage), people = new Set();
    hits.forEach(r => { people.add(r.reporterId); r.confirmations.forEach(c => people.add(c)); });
    const status = hp === 0 ? "defeated" : day < ev.from ? "upcoming" : day > ev.to ? "escaped" : "active";
    return { id: ev.id, hp, maxHp: ev.hp, pct: Math.round(hp / ev.hp * 100), status, hits: hits.length, participants: people, helpers: people.size };
  }
  const claimId = (ev) => "boss_" + ev.id;
  function canClaim(state, uid, ev, day) {
    const st = bossStatus(state, ev, day);
    if (st.status !== "defeated") return "not defeated yet";
    if (!st.participants.has(uid)) return "only people who helped can claim";
    if ((state.questClaims || []).some(c => c.userId === uid && c.questId === claimId(ev))) return "already claimed";
    return null;
  }
  function claimBoss(state, uid, ev, day) {
    const why = canClaim(state, uid, ev, day); if (why) throw new Error("Cannot claim: " + why);
    const c = Object.freeze({ id: "q" + (state.seq++), userId: uid, questId: claimId(ev), period: "festive", periodKey: ev.id, xp: ev.xp, day });
    state.questClaims.push(c);
    state.audit.push(Object.freeze({ id: "a" + (state.seq++), day, actorId: uid, action: "BOSS_CLAIM", refId: ev.id, detail: "+" + ev.xp + " XP" }));
    return c;
  }
  return { windowFor, wardWars, bossStatus, canClaim, claimBoss, addDays };
});
