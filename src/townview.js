/* e-Karmakshetra town screens (v7): World canvas (flat 2D or 2.5D isometric), Mall, Stage, My Plot, Desk.
   Draws with the HTML canvas only (no libraries, no image files). All rules live in src/town.js. */
(function () {
  "use strict";
  const T = window.TOWN, EK = window.EK;
  let sub = "world", viewMode = "iso", wardSel = null, picked = null, raf = 0, last = 0, tod = "auto", rain = false, warSpan = "week";
  const walkers = [];                      // sample citizens (NPCs) and your own avatar; ghost mode: they pass through each other
  const bubbles = {};                      // userId -> { text, until }
  let me2 = { x: 1.5, y: 1.5, tx: 1.5, ty: 1.5 };

  const css = (n, f) => (getComputedStyle(document.body).getPropertyValue(n).trim() || f);
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); return "rgb(" + c.join(",") + ")"; };

  function view(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(); T.ensure(s);
    if (!wardSel || !s.prabhags.find(p => p.id === wardSel)) wardSel = u.prabhag;
    const tabs = [["world", "🌍 World"], ["mall", "🛍️ Mall"], ["stage", "🎭 Stage"], ["wars", "⚔️ Wars"], ["plot", "🏠 My plot"], ["desk", "🛂 Desk"]];
    const seg = h("div", { class: "seg", role: "tablist" }, tabs.map(([id, l]) => h("button", { role: "tab", "aria-selected": String(sub === id), onclick: () => { sub = id; picked = null; ctx.rerender(); } }, l)));
    const body = { world: world, mall: mall, stage: stage, wars: wars, plot: myplot, desk: desk }[sub](ctx);
    return h("div", { class: "stack" }, h("p", { class: "sub" }, "Points here are in-game recognition, never money. Everything in this town is a sample for the pilot demo: use invented names only."), seg, body);
  }

  /* ---------- World ---------- */
  function world(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), g = T.gridFor(s, wardSel);
    const sel = h("select", { "aria-label": "Prabhag", onchange: (e) => { wardSel = e.target.value; picked = null; ctx.rerender(); } }, s.prabhags.map(p => h("option", { value: p.id, selected: p.id === wardSel ? "selected" : false }, p.name)));
    const modeBtn = (id, l) => h("button", { class: "chip" + (viewMode === id ? " on" : ""), onclick: () => { viewMode = id; ctx.rerender(); } }, l);
    const plots = s.town.plots.filter(p => p.prabhag === wardSel && T.liveStatus(p) !== "demolished");
    const head = h("div", { class: "card" }, h("h2", {}, "Virtual Mirror Town"), h("p", { class: "sub" }, `Grid ${g.cols} × ${g.rows} · ${g.claimed} of ${g.capacity} plots claimed. The town grows as residents arrive (new row at 75% full). Tap an empty plot to see it, a building to see its owner.`),
      h("div", { class: "row" }, sel, modeBtn("iso", "2.5D isometric"), modeBtn("flat", "Flat 2D"), h("span", { class: "muted small" }, "3D low-poly: roadmap")),
      h("div", { class: "row" }, [["auto", "🕒 Live time"], ["day", "🌞 Day"], ["dusk", "🌆 Dusk"], ["night", "🌙 Night"]].map(([id, l]) => h("button", { class: "chip" + (tod === id ? " on" : ""), onclick: () => { tod = id; ctx.rerender(); } }, l)),
        h("button", { class: "chip" + (rain ? " on" : ""), onclick: () => { rain = !rain; ctx.rerender(); } }, "🌧️ Monsoon")),
      bossMini(ctx));
    const info = h("div", { class: "card", id: "plotinfo", "aria-live": "polite" }); fillInfo(ctx, info);
    const phrases = h("div", { class: "card" }, h("h2", {}, "Say something (safe phrases)"), h("div", { class: "row" }, T.QUICK_PHRASES.map(p => h("button", { class: "chip", onclick: () => { bubbles[u.id] = { text: p.en, until: Date.now() + 6000 }; ctx.act(() => T.say(s, u.id, p.id, ctx.now()), "Sent.", null); } }, p.en + " · " + p.hi))),
      h("small", { class: "muted" }, "Only pre-set phrases are allowed, so there is no abuse or spam. Free-text private chat is on the roadmap (needs moderation and consent design)."));
    if (ctx.field()) {   // Field / Data-saver mode: no canvas, tiny page
      const rows = plots.map(p => h("tr", {}, h("td", {}, `(${p.x + 1},${p.y + 1})`), h("td", {}, (ctx.userName(p.ownerId))), h("td", {}, T.LEVEL_NAMES[p.level]), h("td", {}, T.liveStatus(p))));
      return h("div", { class: "stack" }, head, h("div", { class: "card" }, h("h2", {}, "Plots (data-saver list)"), rows.length ? h("div", { class: "scroll" }, h("table", {}, h("thead", {}, h("tr", {}, ["Plot", "Owner", "Level", "Status"].map(x => h("th", {}, x)))), h("tbody", {}, rows))) : h("p", {}, "All plots are empty.")), info, phrases);
    }
    const cv = h("canvas", { id: "town", class: "town", role: "img", "aria-label": "Town map: empty plots and buildings of " + ctx.pName(wardSel) });
    const wrap = h("div", { class: "card tcard" }, cv);
    requestAnimationFrame(() => startCanvas(ctx, cv, info));
    return h("div", { class: "stack" }, head, wrap, info, phrases);
  }

  function fillInfo(ctx, box) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(); box.innerHTML = "";
    if (!picked) { box.append(h("h2", {}, "Plot details"), h("p", { class: "muted" }, "Tap a plot on the map.")); return; }
    const p = T.plotAt(s, wardSel, picked.x, picked.y);
    if (!p) {
      box.append(h("h2", {}, `Empty plot (${picked.x + 1},${picked.y + 1})`), h("p", {}, `Claim it as a Starter plot / Hall of Fame for ${T.R.STARTER_PLOT} points. Tax is ${T.R.PLOT_TAX} points a month. You hold at most one plot in this pilot.`));
      if (u.official) box.append(h("p", { class: "muted" }, "Officials do not own land."));
      else if (u.prabhag !== wardSel) box.append(h("p", { class: "muted" }, "You can only claim land in your own Prabhag (" + ctx.pName(u.prabhag) + ")."));
      else box.append(h("button", { class: "cta", onclick: () => ctx.act(() => T.claimPlot(s, u.id, picked.x, picked.y, ctx.now()), "Land claimed! Welcome to your plot.", "plot") }, `Claim for ${T.R.STARTER_PLOT} points`));
      return;
    }
    const owner = s.users.find(x => x.id === p.ownerId), shop = s.town.shops.find(x => x.plotId === p.id && x.status === "APPROVED");
    box.append(h("h2", {}, T.LEVEL_NAMES[p.level]), h("div", { class: "row" }, owner ? ctx.avatar(owner, 40) : null, h("div", {}, h("b", {}, owner && owner.isProfilePublic ? owner.pseudonym : "Anonymous resident"), h("br"), h("small", { class: "muted" }, `Status: ${T.liveStatus(p)} · since ${p.claimedDay}`))));
    if (shop) box.append(h("p", {}, h("b", {}, shop.name), " · ", shop.desc), h("small", { class: "muted" }, "See it in the Mall tab."));
    else box.append(h("p", { class: "muted" }, p.level === 1 ? "A Hall of Fame plot: the owner's badges and level shine here." : "Storefront has no approved listing yet."));
    if (owner) { const b = EK.badgesFor(s, owner.id).filter(x => x.earned).map(x => x.icon).join(" "); if (b) box.append(h("p", {}, "Hall of Fame: " + b + " · Level " + EK.levelFor(EK.totalXp(s, owner.id)).name)); }
  }

  function startCanvas(ctx, cv, info) {
    if (!document.body.contains(cv)) return;
    const s = ctx.state(), g = T.gridFor(s, wardSel), TW = 110, TH = 56, CS = 120, iso = viewMode === "iso";
    const W = iso ? (g.cols + g.rows) * TW / 2 + 40 : g.cols * CS, H = iso ? (g.cols + g.rows) * TH / 2 + 150 : g.rows * CS;
    cv.width = W; cv.height = H; const c = cv.getContext("2d");
    const ox = iso ? g.rows * TW / 2 + 20 : 0, oy = iso ? 110 : 0;
    const pos = (x, y) => iso ? [ox + (x - y) * TW / 2, oy + (x + y) * TH / 2] : [x * CS, y * CS];
    const plotsAll = () => s.town.plots.filter(p => p.prabhag === wardSel && T.liveStatus(p) !== "demolished");
    if (!walkers.length || walkers.wd !== wardSel) {
      walkers.length = 0; walkers.wd = wardSel;
      const locals = s.users.filter(x => !x.official && x.prabhag === wardSel).slice(0, 8);
      for (let i = 0; i < 8; i++) { const x = locals[i]; walkers.push({ id: x ? x.id : "npc" + i, x: Math.random() * g.cols, y: Math.random() * g.rows, tx: Math.random() * g.cols, ty: Math.random() * g.rows, npc: true, pause: 0, e: x && x.avatar && x.avatar.type === "emoji" ? x.avatar.value : EK.AVATARS[i % EK.AVATARS.length] }); }
    }
    const hour = new Date().getHours(), phase = tod !== "auto" ? tod : hour >= 6 && hour < 17 ? "day" : hour >= 17 && hour < 19 ? "dusk" : "night";
    const today = T.dayOf(ctx.now()), festive = (s.quests || []).some(q => q.period === "festive" && q.from <= today && today <= q.to);
    const drops = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 6 }));
    let tick = 0;
    const ink = css("--fg", "#eaf0ff"), grass = css("--grass", "#1c3b2a"), grass2 = css("--grass2", "#21452f"), road = css("--road", "#2b3055");
    const tile = (x, y, fill, stroke, dash) => {
      c.beginPath();
      if (iso) { const [px, py] = pos(x, y); c.moveTo(px, py); c.lineTo(px + TW / 2, py + TH / 2); c.lineTo(px, py + TH); c.lineTo(px - TW / 2, py + TH / 2); c.closePath(); }
      else { const [px, py] = pos(x, y); c.rect(px + 2, py + 2, CS - 4, CS - 4); }
      c.fillStyle = fill; c.fill(); c.setLineDash(dash || []); c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); c.setLineDash([]);
    };
    const box = (x, y, hgt, accent, closed) => {
      const base = closed ? "#6b7085" : accent;
      if (iso) {
        const [px, py] = pos(x, y), cx = px, cy = py + TH / 2, hw = TW / 2 * 0.72, hh = TH / 2 * 0.72;
        const P = (dx, dy, up) => [cx + dx, cy + dy - (up || 0)], poly = (pts, fill) => { c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); c.fillStyle = fill; c.fill(); };
        poly([P(-hw, 0), P(0, hh), P(0, hh, hgt), P(-hw, 0, hgt)], shade(base, 0.6));        // left wall
        poly([P(0, hh), P(hw, 0), P(hw, 0, hgt), P(0, hh, hgt)], shade(base, 0.82));        // right wall
        poly([P(0, -hh, hgt), P(hw, 0, hgt), P(0, hh, hgt), P(-hw, 0, hgt)], shade(base, 1.2));   // roof
      } else {
        const [px, py] = pos(x, y), m = 14, w = CS - 2 * m, hh = 36 + hgt * 0.9;
        c.fillStyle = shade(base, 0.7); c.fillRect(px + m, py + CS - m - hh, w, hh);
        c.fillStyle = base; c.fillRect(px + m, py + CS - m - hh - 12, w, 14);            // pixel roof band
        c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(px + CS / 2 - 8, py + CS - m - 26, 16, 26);   // door
        c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(px + m + 8, py + CS - m - hh + 8, 14, 12); c.fillRect(px + CS - m - 22, py + CS - m - hh + 8, 14, 12);
      }
    };
    function anchor(x, y) { const [px, py] = pos(x, y); return iso ? [px, py + TH / 2] : [px + CS / 2, py + CS / 2]; }
    function drawAll() {
      c.clearRect(0, 0, W, H);
      const cells = []; for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) cells.push([x, y]);
      cells.forEach(([x, y]) => tile(x, y, (x + y) % 2 ? grass : grass2, picked && picked.x === x && picked.y === y ? css("--cyan", "#22e3ff") : road, null));
      cells.forEach(([x, y]) => {
        const p = T.plotAt(s, wardSel, x, y), [ax, ay] = anchor(x, y);
        if (!p) { tile(x, y, "rgba(255,211,78,.05)", "rgba(255,211,78,.55)", [5, 5]); c.fillStyle = "rgba(255,211,78,.8)"; c.font = "600 " + (iso ? 11 : 13) + "px sans-serif"; c.textAlign = "center"; c.fillText(iso ? "+" : "empty", ax, ay + 4); return; }
        const shop = s.town.shops.find(q => q.plotId === p.id && q.status === "APPROVED"), st = T.liveStatus(p);
        box(x, y, 12 + p.level * 14, shop ? shop.accent : "#8a7dff", st === "closed");
        c.textAlign = "center"; c.fillStyle = "#fff"; c.font = "700 13px sans-serif";
        const label = st === "closed" ? "CLOSED" : st === "grace" ? "⚠ dues" : shop ? shop.name.slice(0, 14) : p.level === 1 ? "★ Hall" : "(no listing)";
        const [px, py] = pos(x, y); c.fillText(label, ax, iso ? py + TH + 12 : py + 14);
        if (T.liveStatus(p) !== "active" && st !== "grace") { c.globalAlpha = 0.4; c.fillStyle = "#cfd6ff"; c.fillRect(0, 0, 0, 0); c.globalAlpha = 1; }
      });
      const list = walkers.concat([{ id: ctx.me().id, x: me2.x, y: me2.y, mine: true }]);
      list.sort((a, b) => a.x + a.y - (b.x + b.y)).forEach(w => {
        const [px, py] = iso ? [ox + (w.x - w.y) * TW / 2, oy + (w.x + w.y) * TH / 2 + TH / 2] : [w.x * CS, w.y * CS];
        const usr = s.users.find(q => q.id === w.id), e = w.npc ? w.e : (usr && usr.avatar && usr.avatar.type === "emoji" ? usr.avatar.value : "🙂");
        c.font = "26px sans-serif"; c.textAlign = "center"; c.fillText(e, px, py);
        if (w.mine) { c.strokeStyle = css("--cyan", "#22e3ff"); c.lineWidth = 2; c.beginPath(); c.ellipse(px, py + 4, 15, 6, 0, 0, 7); c.stroke(); }
        const b = bubbles[w.id]; if (b && b.until > Date.now()) { c.font = "700 12px sans-serif"; const tw = c.measureText(b.text).width + 14; c.fillStyle = "#fff"; c.fillRect(px - tw / 2, py - 56, tw, 22); c.fillStyle = "#111"; c.fillText(b.text, px, py - 41); }
      });
      // time of day, lanterns, festive lights, rain
      if (phase !== "day") { c.fillStyle = phase === "night" ? "rgba(6,10,45,.5)" : "rgba(255,110,40,.16)"; c.fillRect(0, 0, W, H); }
      if (phase !== "day") s.town.plots.filter(p => p.prabhag === wardSel && T.liveStatus(p) !== "demolished").forEach(p => {
        const [ax, ay] = anchor(p.x, p.y), gr = c.createRadialGradient(ax, ay - 10, 2, ax, ay - 10, iso ? 55 : 70); gr.addColorStop(0, phase === "night" ? "rgba(255,200,90,.65)" : "rgba(255,200,90,.35)"); gr.addColorStop(1, "rgba(255,200,90,0)");
        c.fillStyle = gr; c.fillRect(ax - 80, ay - 90, 160, 160); });
      if (festive) for (let i = 0; i < 18; i++) { const fx = (i + 0.5) * W / 18, fy = 8 + Math.sin(i * 1.3 + tick / 8) * 4; c.fillStyle = ["#ffd34e", "#ff3d9a", "#22e3ff", "#ff9f1c"][i % 4]; c.beginPath(); c.arc(fx, fy, 4, 0, 7); c.fill(); }
      if (rain) { c.strokeStyle = "rgba(190,215,255,.55)"; c.lineWidth = 1.2; c.beginPath(); drops.forEach(d => { c.moveTo(d.x, d.y); c.lineTo(d.x - 3, d.y + 10); }); c.stroke(); }
    }
    cv.onclick = (ev) => {
      const r = cv.getBoundingClientRect(), px = (ev.clientX - r.left) * W / r.width, py = (ev.clientY - r.top) * H / r.height; let x, y;
      if (iso) { const a = (py - oy - TH / 2) / (TH / 2), b = (px - ox) / (TW / 2); x = Math.floor((a + b) / 2); y = Math.floor((a - b) / 2); } else { x = Math.floor(px / CS); y = Math.floor(py / CS); }
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return;
      picked = { x, y }; me2.tx = x + 0.5; me2.ty = y + 0.5; FX.play("click"); fillInfo(ctx, info); drawAll();
    };
    cancelAnimationFrame(raf); last = 0;
    const animate = ctx.fx() && !ctx.field();
    function frame(t) {
      if (!document.body.contains(cv)) return;
      if (animate && t - last > 45) {   // about 20 frames a second keeps phones cool
        last = t;
        tick++; if (tick % 160 === 0) { const w = walkers[Math.floor(Math.random() * walkers.length)], p = T.QUICK_PHRASES[Math.floor(Math.random() * T.QUICK_PHRASES.length)]; if (w) bubbles[w.id] = { text: p.en, until: Date.now() + 4000 }; }
        walkers.forEach(w => {
          if (w.pause > 0) { w.pause--; return; }
          const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
          if (d < 0.06) { const pl = plotsAll(); if (pl.length && Math.random() < 0.5) { const q = pl[Math.floor(Math.random() * pl.length)]; w.tx = q.x + 0.5; w.ty = q.y + 0.5; w.pause = 30; } else { w.tx = Math.random() * g.cols; w.ty = Math.random() * g.rows; } }
          else { w.x += dx / d * 0.03; w.y += dy / d * 0.03; } });
        if (rain) drops.forEach(d => { d.y += d.v; d.x -= 1; if (d.y > H) { d.y = -10; d.x = Math.random() * W; } });
        const dx = me2.tx - me2.x, dy = me2.ty - me2.y, d = Math.hypot(dx, dy); if (d > 0.04) { me2.x += dx / d * 0.07; me2.y += dy / d * 0.07; }
        drawAll();
      }
      raf = requestAnimationFrame(frame);
    }
    drawAll(); raf = requestAnimationFrame(frame);
  }

  /* ---------- Mall ---------- */
  function mall(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me();
    const shops = s.town.shops.filter(x => x.status === "APPROVED");
    const cards = shops.map(x => {
      const o = s.users.find(q => q.id === x.ownerId), plot = s.town.plots.find(p => p.id === x.plotId), disp = s.town.disputes.filter(d => d.shopId === x.id && d.public && d.status === "OPEN");
      const why = h("input", { placeholder: "Problem with an order? Describe it" });
      const link = x.link ? h("a", { href: x.link, target: "_blank", rel: "noopener noreferrer nofollow" }, "Visit shop website ↗") : h("small", { class: "muted" }, "No website linked");
      return h("div", { class: "shop", style: "--ac:" + x.accent }, h("div", { class: "row" }, h("b", {}, x.name), x.frozen ? h("span", { class: "tag revise" }, "badge frozen") : h("span", { class: "tag verified" }, "verified maker"), h("small", { class: "muted" }, ctx.pName(x.prabhag) + (plot ? ` · plot (${plot.x + 1},${plot.y + 1})` : ""))),
        h("p", {}, x.desc), x.product ? h("small", {}, "Product: " + x.product) : null, h("div", { class: "row" }, o ? ctx.avatar(o, 28) : null, h("small", {}, o && o.isProfilePublic ? o.pseudonym : "Anonymous resident"), link),
        disp.length ? h("p", { class: "msg err" }, `Public complaint open (${disp.length}): ${disp[0].text}`) : null,
        u.verified && !u.official && x.ownerId !== u.id ? h("div", { class: "row" }, why, h("button", { class: "ghost", onclick: () => ctx.act(() => T.openDispute(s, u.id, x.id, why.value, ctx.now()), "Complaint sent to the seller, the partner hub and the ward officer. It becomes public after 7 days if unresolved.", null) }, "Report")) : null);
    });
    return h("div", { class: "stack" }, h("div", { class: "card" }, h("h2", {}, "Virtual Mall"), h("p", { class: "sub" }, "Approved storefronts only. Payment happens outside this app on the seller's own website; the app never handles money or UPI in this version. Delivery model (volunteer deliverer with OTP, partner drop-hub, or direct handover) is a pilot design in the docs."), cards.length ? null : h("p", {}, "No approved shops yet.")), cards);
  }

  /* ---------- Stage (Rangamanch) ---------- */
  function stage(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), now = ctx.now(), fmt = (ms) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    const shows = s.town.shows.filter(x => x.status === "APPROVED").sort((a, b) => a.startMs - b.startMs);
    const list = shows.map(x => {
      const p = s.users.find(q => q.id === x.performerId), ended = now > x.startMs + x.minutes * 60000, live = now >= x.startMs && !ended;
      const mine = s.town.tickets.filter(t => t.userId === u.id && t.showId === x.id).map(t => t.kind), has = mine.includes("live") || mine.includes("replay");
      const btns = [];
      if (!u.official && x.performerId !== u.id) {
        if (!ended && !mine.includes("live")) btns.push(h("button", { class: "cta", onclick: () => ctx.act(() => T.buyTicket(s, u.id, x.id, now), "Ticket booked.", null) }, `Ticket ${x.ticket} pts`));
        if (ended && x.vodPrice != null && !mine.includes("replay")) btns.push(h("button", { onclick: () => ctx.act(() => T.buyReplay(s, u.id, x.id, now), "Replay unlocked.", null) }, `Replay ${x.vodPrice} pt`));
        if (has) btns.push(h("button", { class: "ghost", onclick: () => ctx.act(() => T.clap(s, u.id, x.id, now), "👏 Sent 1 point.", null) }, "👏 Clap (1 pt)"));
      }
      return h("div", { class: "shop", style: "--ac:#ff3d9a" }, h("div", { class: "row" }, h("b", {}, x.title), h("span", { class: "tag " + (live ? "verified" : ended ? "pending" : "awaiting") }, live ? "LIVE" : ended ? "ended" : "upcoming"), h("small", { class: "muted" }, fmt(x.startMs) + " · " + x.minutes + " min · " + x.mode)),
        h("p", {}, x.desc), h("small", {}, "By " + (p ? p.pseudonym : "?") + " · Balcony (free): short cut clips only · Seats: " + x.ticket + " pts to the performer"),
        has && x.url ? h("p", {}, h("a", { href: x.url, target: "_blank", rel: "noopener noreferrer nofollow" }, x.mode === "video" ? "Open the video stream ↗" : "Open the audio room ↗"), " ", h("small", { class: "muted" }, "On mobile data the stage defaults to audio and stills.")) : null, h("div", { class: "row" }, btns));
    });
    const f = { title: h("input", { placeholder: "Title (e.g. Lake clean-up street play)" }), desc: h("textarea", { rows: "2", placeholder: "What will the audience see or hear? (10+ characters)" }),
      min: h("input", { type: "number", min: "5", max: "90", value: "20", "aria-label": "Minutes" }), when: h("input", { type: "datetime-local", "aria-label": "Start time" }),
      mode: h("select", {}, [["audio", "Audio room (lowest data)"], ["video", "Video embed link"], ["stills", "Slides and stills"]].map(([v, l]) => h("option", { value: v }, l))),
      url: h("input", { placeholder: "https:// stream link (optional)" }), tk: h("input", { type: "number", min: "0", max: "10", value: String(T.R.TICKET), "aria-label": "Ticket price" }),
      vod: h("select", {}, [["", "Live only (no replay)"], ["1", "Replay for 1 point"], ["0", "Replay free"]].map(([v, l]) => h("option", { value: v }, l))) };
    const form = u.official ? h("p", { class: "muted" }, "Officials moderate; residents perform.") : h("div", { class: "card" }, h("h2", {}, "Propose a performance"), h("p", { class: "sub" }, `Fee ${T.R.SHOW_FEE} point, reviewed by a theatre manager within 24 hours. ${T.R.SHOW_MIN}-${T.R.SHOW_MAX} minutes. No two of your shows within 24 hours. No politics or illegal ads.`),
      f.title, f.desc, h("div", { class: "row" }, f.when, f.min, f.mode), f.url, h("div", { class: "row" }, h("label", {}, "Ticket"), f.tk, f.vod),
      h("p", {}, h("button", { class: "cta", onclick: () => ctx.act(() => T.proposeShow(s, u.id, { title: f.title.value, desc: f.desc.value, minutes: parseInt(f.min.value, 10), startMs: f.when.value ? new Date(f.when.value).getTime() : NaN, mode: f.mode.value, url: f.url.value, ticket: parseInt(f.tk.value, 10), vodPrice: f.vod.value === "" ? null : parseInt(f.vod.value, 10) }, now), "Proposal sent for review.", null) }, "Submit proposal")));
    const mine = s.town.shows.filter(x => x.performerId === u.id && x.status !== "APPROVED").map(x => h("p", {}, h("b", {}, x.title), " · ", h("span", { class: "tag " + (x.status === "REJECTED" ? "rejected" : "awaiting") }, x.status.toLowerCase().replace("_", " ")), x.reason ? " " + x.reason : ""));
    return h("div", { class: "stack" }, h("div", { class: "card" }, h("h2", {}, "Rangamanch: civic theatre"), h("p", { class: "sub" }, "Open-air amphitheatre and indoor Natyagruha share one schedule. Streams are embedded or linked (no video runs through our server). The stage is a pilot design: shows here are samples.")), list.length ? list : h("div", { class: "card" }, "No approved shows yet."), form, mine.length ? h("div", { class: "card" }, h("h2", {}, "My proposals"), mine) : null);
  }

  /* ---------- Wars (Ward Wars + Boss events) ---------- */
  function bossMini(ctx) {
    const { h } = ctx, s = ctx.state(), day = T.dayOf(ctx.now());
    return h("div", { class: "bossmini" }, ctx.events().map(ev => { const b = SEASON.bossStatus(s, ev, day);
      return h("div", { class: "row" }, h("span", { class: "bossico" }, ev.icon), h("small", {}, ev.name + ": "), h("div", { class: "hp", role: "progressbar", "aria-label": ev.name + " health", "aria-valuenow": String(b.pct), "aria-valuemin": "0", "aria-valuemax": "100" }, h("i", { style: "width:" + b.pct + "%" })), h("small", {}, b.status === "defeated" ? "defeated!" : b.hp + "/" + b.maxHp + " HP")); }));
  }
  function wars(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), day = T.dayOf(ctx.now()), r = SEASON.wardWars(s, day, warSpan), max = Math.max(1, ...r.rows.map(x => x.perResident)), medal = ["🥇", "🥈", "🥉"];
    const chips = h("div", { class: "row" }, [["week", "This week"], ["month", "This month"]].map(([id, l]) => h("button", { class: "chip" + (warSpan === id ? " on" : ""), onclick: () => { warSpan = id; ctx.rerender(); } }, l)));
    const rows = r.rows.map(x => h("div", { class: "war" + (x.prabhag === u.prabhag ? " mine" : "") }, h("div", { class: "row" }, h("b", {}, (medal[x.rank - 1] || x.rank) + " " + x.name), h("small", { class: "muted" }, `${x.verified} verified · ${x.reviews} reviews · ${x.residents} residents`), h("b", { class: "wscore" }, x.perResident + " /resident")),
      h("div", { class: "hp wide" }, h("i", { style: "width:" + Math.round(x.perResident / max * 100) + "%" }))));
    const bosses = ctx.events().map(ev => { const b = SEASON.bossStatus(s, ev, day), why = SEASON.canClaim(s, u.id, ev, day), mine = b.participants.has(u.id);
      return h("div", { class: "boss " + b.status }, h("div", { class: "bossface" }, ev.icon), h("div", { class: "bossbody" }, h("div", { class: "row" }, h("b", {}, ev.name), h("span", { lang: "hi", class: "deva2" }, ev.name_hi), h("span", { class: "tag " + (b.status === "defeated" ? "verified" : b.status === "active" ? "awaiting" : "pending") }, b.status)),
        h("p", { class: "small" }, ev.text), h("div", { class: "hp wide", role: "progressbar", "aria-valuenow": String(b.pct), "aria-valuemin": "0", "aria-valuemax": "100", "aria-label": ev.name + " health" }, h("i", { style: "width:" + b.pct + "%" })),
        h("small", {}, `${b.hp} / ${b.maxHp} HP · ${b.hits} verified reports · ${b.helpers} citizens helped${mine ? " · you helped!" : ""} · ${ev.from} to ${ev.to}`),
        !u.official && !why ? h("p", {}, h("button", { class: "cta", onclick: () => ctx.claimBoss(ev) }, `Claim +${ev.xp} Quest XP`)) : h("small", { class: "muted" }, b.status === "defeated" && why ? " " + why : ""))); });
    return h("div", { class: "stack" }, h("div", { class: "card" }, h("h2", {}, "Ward Wars: Prabhag vs Prabhag"), h("p", { class: "sub" }, "Teams are Prabhags. Nobody fights; Prabhags compete on verified civic work (10 per verified report + 1 per honest review), ranked per verified resident so a small ward can beat a big one. Season resets every week or month."), chips, rows),
      h("div", { class: "card" }, h("h2", {}, "Community boss events"), h("p", { class: "sub" }, "The bosses are civic problems. Every verified report of the right kind, and every peer who confirmed it, takes HP off. Defeat it together and everyone who helped can claim Quest XP (recognition only)."), bosses));
  }

  /* ---------- My plot ---------- */
  function myplot(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), now = ctx.now();
    if (u.official) return h("div", { class: "card" }, h("p", {}, "Officials do not hold land. Use the Desk tab."));
    const plot = s.town.plots.find(p => p.ownerId === u.id && T.liveStatus(p) !== "demolished"), bal = EK.balance(s, u.id), items = [];
    items.push(h("div", { class: "card" }, h("h2", {}, "My wallet"), h("p", {}, h("b", {}, bal + " points"), " · XP is not reduced by spending."), h("small", { class: "muted" }, "Points are earned for verified civic work. Demo grants exist only so you can try the economy.")));
    if (!plot) { items.push(h("div", { class: "card" }, h("h2", {}, "You have no land yet"), h("p", {}, `Go to the World tab, tap an empty plot in your Prabhag and claim it (${T.R.STARTER_PLOT} points).`))); }
    else {
      const st = T.liveStatus(plot), nextCost = plot.level === 1 ? T.R.STOREFRONT : T.R.UPGRADE_STEP;
      const dues = st === "active" ? "Taxes are up to date." : st === "grace" ? `Grace period: ${plot.arrears} month(s) unpaid (${plot.owed} pts). Pay before closure.` : `Closed: ${plot.arrears} months unpaid (${plot.owed} pts). Demolished after ${T.R.GRACE_MONTHS + T.R.CLOSED_MONTHS} months.`;
      items.push(h("div", { class: "card" }, h("h2", {}, T.LEVEL_NAMES[plot.level] + " · " + ctx.pName(plot.prabhag) + ` (${plot.x + 1},${plot.y + 1})`), h("p", {}, dues), h("p", { class: "sub" }, `Tax: ${T.R.PLOT_TAX} pts a month (+${T.R.BIZ_TAX} with an approved shop). Maker badge: ${u.maker ? "verified" : "not yet (an official checks your photo ID)"}.`),
        h("div", { class: "row" }, plot.level < T.R.MAX_LEVEL ? h("button", { class: "cta", onclick: () => ctx.act(() => T.upgradePlot(s, u.id, plot.id, now), "Upgraded!", "plot") }, `Upgrade for ${nextCost} pts`) : null, plot.arrears ? h("button", { onclick: () => ctx.act(() => T.payArrears(s, u.id, plot.id, now), "Arrears cleared.", null) }, `Pay ${plot.owed} pts arrears`) : null)));
      if (plot.level >= 2 && st === "active") items.push(shopForm(ctx, plot));
    }
    const roles = T.TOWN_ROLES.map(r => { const has = u.townRoles.includes(r), pend = s.town.roleReqs.some(q => q.userId === u.id && q.role === r && q.status === "UNDER_REVIEW");
      return h("div", { class: "row" }, h("b", {}, r.replace("_", " ")), has ? h("span", { class: "tag verified" }, "you hold this") : pend ? h("span", { class: "tag awaiting" }, "under review") : h("button", { onclick: () => ctx.act(() => T.applyRole(s, u.id, r, now), "Application sent to the admin.", null) }, `Apply (${T.R.ROLE_FEE} pts)`)); });
    items.push(h("div", { class: "card" }, h("h2", {}, "In-game roles"), h("p", { class: "sub" }, "Design Engineer, Officer and Theatre Manager. Admin approves; fee " + T.R.ROLE_FEE + " points (refunded if rejected)."), roles));
    return h("div", { class: "stack" }, items);
  }
  function shopForm(ctx, plot) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), now = ctx.now(), cur = s.town.shops.filter(x => x.plotId === plot.id).slice(-1)[0];
    if (cur && ["UNDER_REVIEW", "APPROVED", "APPEAL"].includes(cur.status)) {
      const left = Math.max(0, Math.round((cur.dueAt - now) / 36e5));
      return h("div", { class: "card" }, h("h2", {}, "My shop: " + cur.name), h("p", {}, h("span", { class: "tag " + (cur.status === "APPROVED" ? "verified" : "awaiting") }, cur.status.toLowerCase().replace("_", " ")), cur.status === "UNDER_REVIEW" ? ` Decision due in about ${left} hours (4-day window).` : ""), h("p", {}, cur.desc));
    }
    const f = { name: h("input", { placeholder: "Shop name (3-40 characters)" }), desc: h("textarea", { rows: "2", placeholder: "What do you make or sell? (10-300 characters)" }), prod: h("input", { placeholder: "Main product (optional)" }),
      link: h("input", { placeholder: "https:// your own website or shop page (optional)" }),
      tpl: h("select", {}, T.TEMPLATES.filter(x => x.minLevel <= plot.level).map(x => h("option", { value: x.id }, x.name))) };
    let accent = T.ACCENTS[0]; const sw = h("div", { class: "row" }, T.ACCENTS.map(a => h("button", { class: "swatch", "aria-label": "Colour " + a, style: "background:" + a, onclick: (e) => { accent = a; sw.querySelectorAll(".swatch").forEach(b => b.classList.remove("on")); e.target.classList.add("on"); } })));
    return h("div", { class: "card" }, h("h2", {}, "Open a storefront"), cur && cur.status.startsWith("REJECTED") ? h("p", { class: "msg err" }, "Last decision: " + cur.status.toLowerCase() + (cur.reason ? " (" + cur.reason + ")" : "")) : null,
      cur && cur.status === "REJECTED" ? (() => { const ap = h("input", { placeholder: "Why should this be reconsidered? (10+ characters)" }); return h("p", {}, ap, h("button", { class: "ghost", onclick: () => ctx.act(() => T.appealShop(s, u.id, cur.id, ap.value, now), "Appeal sent to the admin.", null) }, "Appeal this decision")); })() : null,
      h("p", { class: "sub" }, `Registration ${T.R.SHOP_FEE} point; an officer reviews within 4 days. Needs a Verified Maker badge. No politics or illegal ads. Links must be https.`),
      f.name, f.desc, f.prod, f.link, h("label", {}, "Template"), f.tpl, h("label", {}, "Accent colour"), sw,
      h("p", {}, h("button", { class: "cta", onclick: () => ctx.act(() => T.submitShop(s, u.id, { name: f.name.value, desc: f.desc.value, product: f.prod.value, link: f.link.value, template: f.tpl.value, accent }, now), "Sent for officer review.", null) }, "Submit for review")));
  }

  /* ---------- Desk (officers, theatre managers, admin) ---------- */
  function desk(ctx) {
    const { h } = ctx, s = ctx.state(), u = ctx.me(), now = ctx.now(), items = [];
    const reviewer = T.isReviewer(u, "shop"), mgr = T.isReviewer(u, "show");
    if (!reviewer && !mgr) return h("div", { class: "card" }, h("h2", {}, "Desk"), h("p", {}, "This desk is for officers, theatre managers and the admin. Choose “JCMC-Official” in Playing as, or apply for a role in My plot."));
    const reason = () => h("input", { placeholder: "Reason if rejecting", style: "min-width:150px" });
    const sla = T.slaScan(s, now), slaOf = (id) => sla.find(x => x.id === id);
    const slaTag = (id) => { const x = slaOf(id); return x ? h("span", { class: "tag " + (x.level === "overdue" ? "rejected" : x.level === "warn" ? "revise" : "awaiting") }, x.level === "ok" ? x.hoursLeft + " h left" : x.level + " · " + x.hoursLeft + " h") : null; };
    if (reviewer) {
      const q = s.town.shops.filter(x => x.status === "UNDER_REVIEW").map(x => { const r = reason(); const o = s.users.find(z => z.id === x.ownerId);
        return h("div", { class: "shop", style: "--ac:" + x.accent }, h("div", { class: "row" }, h("b", {}, x.name), slaTag(x.id), h("small", { class: "muted" }, ctx.pName(x.prabhag))), h("p", {}, x.desc), x.link ? h("small", {}, "Link: " + x.link) : null,
          h("div", { class: "row" }, r, h("button", { class: "cta", onclick: () => ctx.act(() => T.reviewShop(s, u.id, x.id, true, "", now), "Approved. You receive the 1-point review fee.", null) }, "Approve"), h("button", { class: "ghost", onclick: () => ctx.act(() => T.reviewShop(s, u.id, x.id, false, r.value, now), "Rejected with reason.", null) }, "Reject"),
            u.admin ? h("button", { onclick: () => ctx.act(() => T.adminDecide(s, u.id, "shop", x.id, true, "", now), "Admin approved. Idle reviewers were charged 1 point each.", null) }, "Admin step-in") : null)); });
      items.push(h("div", { class: "card" }, h("h2", {}, "Shop listings under review"), q.length ? q : h("p", {}, "Nothing waiting.")));
      const mk = s.users.filter(x => x.verified && !x.official && !x.maker).map(x => h("div", { class: "row" }, h("span", {}, x.pseudonym + " · " + ctx.pName(x.prabhag)), h("button", { onclick: () => ctx.act(() => T.verifyMaker(s, u.id, x.id, now), "Maker badge granted after ID check.", null) }, "I checked their photo ID: grant badge")));
      items.push(h("div", { class: "card" }, h("h2", {}, "Verified Citizen Maker badges"), h("p", { class: "sub" }, "Check a valid photo ID (and college ID or SHG registration) in person or through your approved process. The app never stores ID images in this demo."), mk.length ? mk : h("p", {}, "Everyone eligible has a badge.")));
      const ap = s.town.shops.filter(x => x.status === "APPEAL").map(x => h("div", { class: "row" }, h("b", {}, x.name), h("small", {}, x.appeal), u.admin ? [h("button", { onclick: () => ctx.act(() => T.decideAppeal(s, u.id, x.id, true, now), "Overturned. The original reviewer lost 15 points.", null) }, "Overturn"), h("button", { class: "ghost", onclick: () => ctx.act(() => T.decideAppeal(s, u.id, x.id, false, now), "Appeal rejected.", null) }, "Uphold")] : h("small", { class: "muted" }, "Admin decides")));
      if (ap.length) items.push(h("div", { class: "card" }, h("h2", {}, "Appeals"), ap));
      const ds = s.town.disputes.filter(d => d.status === "OPEN").map(d => { const sh = s.town.shops.find(x => x.id === d.shopId), n = h("input", { placeholder: "Note" });
        return h("div", { class: "row" }, h("b", {}, sh ? sh.name : "?"), h("small", {}, d.text + (d.public ? " (public)" : "")), n, h("button", { onclick: () => ctx.act(() => T.resolveDispute(s, u.id, d.id, true, n.value, now), "Upheld: seller loses one revival chance and the badge is frozen.", null) }, "Uphold"), h("button", { class: "ghost", onclick: () => ctx.act(() => T.resolveDispute(s, u.id, d.id, false, n.value, now), "Dismissed.", null) }, "Dismiss")); });
      items.push(h("div", { class: "card" }, h("h2", {}, "Buyer disputes"), ds.length ? ds : h("p", {}, "None open.")));
    }
    if (mgr) {
      const q = s.town.shows.filter(x => x.status === "UNDER_REVIEW").map(x => { const r = reason();
        return h("div", { class: "shop", style: "--ac:#ff3d9a" }, h("div", { class: "row" }, h("b", {}, x.title), slaTag(x.id)), h("p", {}, x.desc), h("div", { class: "row" }, r, h("button", { class: "cta", onclick: () => ctx.act(() => T.reviewShow(s, u.id, x.id, true, "", now), "Show approved and scheduled.", null) }, "Approve"), h("button", { class: "ghost", onclick: () => ctx.act(() => T.reviewShow(s, u.id, x.id, false, r.value, now), "Rejected with reason.", null) }, "Reject"),
          u.admin ? h("button", { onclick: () => ctx.act(() => T.adminDecide(s, u.id, "show", x.id, true, "", now), "Admin approved.", null) }, "Admin step-in") : null)); });
      items.push(h("div", { class: "card" }, h("h2", {}, "Performance proposals (24 h window)"), q.length ? q : h("p", {}, "Nothing waiting.")));
    }
    if (u.admin) {
      const rq = s.town.roleReqs.filter(x => x.status === "UNDER_REVIEW").map(x => { const o = s.users.find(z => z.id === x.userId); return h("div", { class: "row" }, h("b", {}, (o ? o.pseudonym : "?") + " → " + x.role.replace("_", " ")), slaTag(x.id), h("button", { class: "cta", onclick: () => ctx.act(() => T.decideRole(s, u.id, x.id, true, now), "Role granted.", null) }, "Approve"), h("button", { class: "ghost", onclick: () => ctx.act(() => T.decideRole(s, u.id, x.id, false, now), "Rejected; fee refunded.", null) }, "Reject")); });
      items.push(h("div", { class: "card" }, h("h2", {}, "Role applications (admin)"), rq.length ? rq : h("p", {}, "None.")));
      const off = (s.town.clockOffset || 0), pools = T.pools(s).map(p => h("tr", {}, h("td", {}, p.id), h("td", {}, p.points)));
      const target = h("select", {}, s.users.filter(x => !x.official).map(x => h("option", { value: x.id }, x.pseudonym)));
      items.push(h("div", { class: "card" }, h("h2", {}, "Admin tools (demo)"), h("p", { class: "sub" }, `Demo clock: +${Math.round(off / 864e5)} day(s). Move time forward to see the 75% warning, idle penalties, monthly tax, grace, closure and demolition.`),
        h("div", { class: "row" }, h("button", { onclick: () => ctx.act(() => { s.town.clockOffset = off + 864e5; }, "Demo clock moved +1 day.", null) }, "⏩ +1 day"), h("button", { onclick: () => ctx.act(() => { s.town.clockOffset = off + 30 * 864e5; }, "Demo clock moved +30 days.", null) }, "⏩ +30 days"),
          h("button", { class: "cta", onclick: () => ctx.act(() => { const r = T.runTaxMonth(s, T.monthOf(now + 0), now); const m = T.disputeScan(s, now); s.audit.push(Object.freeze({ id: "a" + (s.seq++), day: T.dayOf(now), actorId: u.id, action: "TAX_RUN", refId: "tax", detail: JSON.stringify(r) + " disputes public " + m })); }, "Monthly tax run for the demo month.", null) }, "Run this month's tax")),
        h("div", { class: "row" }, target, h("button", { onclick: () => ctx.act(() => T.demoGrant(s, u.id, target.value, 200, now), "+200 demo points granted.", null) }, "Demo grant +200 points")),
        h("h2", { class: "sec" }, "Treasury pools"), pools.length ? h("div", { class: "scroll" }, h("table", {}, h("tbody", {}, pools))) : h("p", {}, "Empty."), h("small", { class: "muted" }, "Lease and tax: 50% ward quest-bounty pool, 30% festive-gift pool, 20% to the ward's Design Engineers. Nothing sits idle: pools are meant to be spent on quest bounties and gifts.")));
    }
    return h("div", { class: "stack" }, items);
  }

  window.TOWNUI = { view };
})();
