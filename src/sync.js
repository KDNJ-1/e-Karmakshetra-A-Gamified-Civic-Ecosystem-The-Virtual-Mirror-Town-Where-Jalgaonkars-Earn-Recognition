/* e-Karmakshetra optional shared mode (multi-person demo) using Firebase Realtime Database.
   Off unless firebase-config.js provides a config. Every action runs as an atomic transaction on ONE shared
   state object, using the same rules engine (src/core.js), so two people can never overwrite each other.
   Without a config, window.SYNC.enabled is false and the app works exactly as before (single device). */
(function () {
  "use strict";
  const cfg = window.EK_FIREBASE_CONFIG;
  const SYNC = { enabled: false, ready: null, error: null };
  window.SYNC = SYNC;
  if (!cfg || !cfg.databaseURL) return;
  SYNC.enabled = true;
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src)); document.head.appendChild(s); });

  /* Realtime Database drops empty arrays and null values, so rebuild the shape the rules engine expects. */
  function normalize(s) {
    s = s || {};
    ["users", "reports", "ledger", "audit", "questClaims", "quests", "prabhags"].forEach(k => { s[k] = Array.isArray(s[k]) ? s[k].filter(x => x != null) : (s[k] ? Object.values(s[k]) : []); });
    s.reports.forEach(r => { r.confirmations = r.confirmations ? Object.values(r.confirmations) : []; r.flags = r.flags ? Object.values(r.flags) : []; });
    s.town = s.town || {};
    ["plots", "shops", "shows", "tickets", "chat", "roleReqs", "disputes"].forEach(k => { s.town[k] = s.town[k] ? Object.values(s.town[k]).filter(x => x != null) : []; });
    s.users.forEach(u => { u.townRoles = u.townRoles ? Object.values(u.townRoles) : []; });
    s.config = s.config || { peersNeeded: 10 }; s.seq = s.seq || 1;
    return s;
  }
  const clean = (o) => JSON.parse(JSON.stringify(o));   // removes undefined (not allowed in Firebase)

  SYNC.start = function (opts) {   // opts: { seed: () => state, onState: (state) => void, onStatus: (msg) => void }
    SYNC.ready = (async () => {
      if (!window.firebase) { await loadScript(SDK + "firebase-app-compat.js"); await loadScript(SDK + "firebase-auth-compat.js"); await loadScript(SDK + "firebase-database-compat.js"); }
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      await firebase.auth().signInAnonymously();
      const ref = firebase.database().ref("rooms/" + (cfg.room || "demo") + "/state");
      SYNC.ref = ref;
      await ref.transaction((cur) => cur ? undefined : clean(opts.seed()), () => {}, false);   // create once if empty
      ref.on("value", (snap) => { const v = snap.val(); if (v) opts.onState(normalize(v)); }, (e) => { SYNC.error = e; opts.onStatus("Shared mode lost its connection: " + e.message); });
      opts.onStatus("Shared demo connected. Use invented names only.");
    })().catch((e) => { SYNC.error = e; SYNC.enabled = false; opts.onStatus("Shared mode unavailable (" + e.message + "). Running on this device only."); });
    return SYNC.ready;
  };

  /* Run mutate(draftState) atomically against the latest shared state. Resolves true, or rejects with the rules-engine error. */
  SYNC.transact = function (mutate) {
    return new Promise((resolve, reject) => {
      let failure = null;
      SYNC.ref.transaction((cur) => {
        failure = null;
        if (cur == null) { failure = new Error("Still connecting. Please try again in a moment."); return undefined; }
        const draft = normalize(cur ? clean(cur) : null);
        try { mutate(draft); } catch (e) { failure = e; return undefined; }   // abort on any rules error
        return clean(draft);
      }, (err, committed) => {
        if (err) return reject(err);
        if (!committed) return reject(failure || new Error("Another change happened at the same time. Please try again."));
        resolve(true);
      }, true);
    });
  };
  SYNC.reset = function (seedState) { return SYNC.ref.set(clean(seedState)); };
})();
