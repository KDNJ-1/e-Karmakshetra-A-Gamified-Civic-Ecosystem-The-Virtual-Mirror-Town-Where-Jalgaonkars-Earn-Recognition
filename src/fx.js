/* e-Karmakshetra screen effects and sound. Self-contained: no libraries, no audio files.
   Everything can be switched off (FX / Sound buttons) and respects "reduce motion". */
(function () {
  "use strict";
  const KEY = "ek_fx_v1";
  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  let prefs = { fx: !reduce, sound: true };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s) prefs = Object.assign(prefs, s); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) {} };

  let ctx = null;
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type, vol) {
    const c = audio(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t0 = c.currentTime + start;
    o.type = type || "square"; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  const SOUNDS = {
    click: () => tone(520, 0, 0.06, "square", 0.03),
    ok: () => { tone(523, 0, 0.09, "square", 0.04); tone(784, 0.09, 0.14, "square", 0.04); },
    xp: () => { [659, 784, 988].forEach((f, i) => tone(f, i * 0.07, 0.12, "triangle", 0.06)); },
    level: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.18, "square", 0.05)); },
    error: () => { tone(180, 0, 0.16, "sawtooth", 0.05); tone(140, 0.12, 0.2, "sawtooth", 0.05); }
  };
  function play(name) { if (prefs.sound && SOUNDS[name]) SOUNDS[name](); }

  /* confetti */
  let cv, cx, parts = [], raf = 0;
  const COLORS = ["#22e3ff", "#ff3d9a", "#ff9f1c", "#00c2a8", "#ffd34e", "#8a7dff"];
  function confetti(n) {
    if (!prefs.fx) return;
    cv = cv || document.getElementById("confetti"); if (!cv) return;
    cx = cx || cv.getContext("2d");
    cv.width = innerWidth; cv.height = innerHeight;
    for (let i = 0; i < (n || 120); i++) parts.push({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * 0.35,
      vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 3, g: .28 + Math.random() * .12, s: 5 + Math.random() * 6,
      r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: COLORS[i % COLORS.length], life: 90 + Math.random() * 50 });
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    cx.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(p => p.life-- > 0 && p.y < cv.height + 20);
    parts.forEach(p => { p.vy += p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c; cx.globalAlpha = Math.min(1, p.life / 30);
      cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); cx.restore(); });
    raf = parts.length ? requestAnimationFrame(step) : 0;
    if (!parts.length) cx.clearRect(0, 0, cv.width, cv.height);
  }

  /* floating "+N XP" and banner */
  function pop(text) {
    if (!prefs.fx) return;
    const box = document.getElementById("pops"); if (!box) return;
    const el = document.createElement("div"); el.className = "pop"; el.textContent = text; box.appendChild(el);
    setTimeout(() => el.remove(), 1500);
  }
  let bt = 0;
  function banner(title, sub) {
    const b = document.getElementById("banner"); if (!b) return;
    b.querySelector("strong").textContent = title; b.querySelector("span").textContent = sub || "";
    b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
    clearTimeout(bt); bt = setTimeout(() => b.classList.remove("show"), prefs.fx ? 2400 : 3200);
  }
  function setPref(k, v) {
    prefs[k] = v; save();
    document.documentElement.classList.toggle("fx-off", !prefs.fx);
  }
  document.documentElement.classList.toggle("fx-off", !prefs.fx);
  window.FX = { play, confetti, pop, banner, setPref, get: () => Object.assign({}, prefs) };
})();
