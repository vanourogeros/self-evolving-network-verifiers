// The page background: a faint network of drifting routers, linked when close, with
// small packets travelling along the links, and logic symbols that fade in, drift and
// fade out. Drawn on one fixed canvas behind the page;
// a single still frame for visitors who prefer reduced motion; paused in hidden tabs.
(function (root) {
  if (typeof document === "undefined") return;
  const HSA = (root.HSA = root.HSA || {});

  const LINK = 170;       // px: routers closer than this are linked
  const FPS = 30;
  let canvas, ctx, w = 0, h = 0, dpr = 1;
  let nodes = [], packets = [], glyphs = [], colors = null, last = 0, spawn = 0, raf = 0;
  const SYMBOLS = ["∀", "∃", "⊨", "⊢", "∧", "∨", "¬", "⇒", "≡", "⊥", "⊤", "∈", "λ", "□", "◇", "∅"];

  const reduced = () => { try { return root.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; } };

  function readColors() {
    const css = root.getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    colors = { node: v("--muted"), link: v("--muted"), packets: [v("--accent"), v("--route-oracle"), v("--route-model")], font: v("--sans") || "sans-serif" };
  }

  function resize() {
    dpr = Math.min(root.devicePixelRatio || 1, 2);
    w = root.innerWidth; h = root.innerHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const want = Math.max(18, Math.min(70, Math.round((w * h) / 20000)));
    while (nodes.length < want) nodes.push(node());
    nodes.length = want;
    for (const n of nodes) { n.x = Math.min(n.x, w); n.y = Math.min(n.y, h); }
    const wantG = Math.max(6, Math.min(18, Math.round((w * h) / 90000)));
    while (glyphs.length < wantG) glyphs.push(glyph(Math.random()));
    glyphs.length = wantG;
  }

  // A symbol partway (age 0..1) through its life: it fades in, drifts and fades out.
  function glyph(age) {
    const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 6;
    return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      text: SYMBOLS[(Math.random() * SYMBOLS.length) | 0], size: 16 + Math.random() * 18,
      rot: (Math.random() - 0.5) * 0.5, spin: (Math.random() - 0.5) * 0.06,
      life: 9 + Math.random() * 9, age, tint: Math.random() < 0.25 };
  }

  function node() {
    const a = Math.random() * Math.PI * 2, sp = 6 + Math.random() * 10; // px per second
    return { x: Math.random() * w, y: Math.random() * h, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.6 + Math.random() * 1.6 };
  }

  function step(dt) {
    for (const n of nodes) {
      n.x += n.vx * dt; n.y += n.vy * dt;
      if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
      if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
    }
    // A packet now and then, along a link that exists at the moment it starts.
    spawn -= dt;
    if (spawn <= 0 && packets.length < 6) {
      spawn = 0.5 + Math.random() * 0.9;
      const a = nodes[(Math.random() * nodes.length) | 0];
      const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < LINK);
      if (near.length) packets.push({ a, b: near[(Math.random() * near.length) | 0], t: 0, dur: 1.2 + Math.random() * 1.2,
        color: colors.packets[(Math.random() * colors.packets.length) | 0] });
    }
    for (const p of packets) p.t += dt / p.dur;
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      g.x += g.vx * dt; g.y += g.vy * dt; g.rot += g.spin * dt; g.age += dt / g.life;
      if (g.age >= 1) glyphs[i] = glyph(0);
    }
    packets = packets.filter((p) => p.t < 1 && Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y) < LINK * 1.2);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.link;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= LINK) continue;
        ctx.globalAlpha = 0.22 * (1 - d / LINK);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const g of glyphs) {
      ctx.save();
      ctx.translate(g.x, g.y); ctx.rotate(g.rot);
      ctx.font = "600 " + g.size.toFixed(0) + "px " + colors.font;
      ctx.fillStyle = g.tint ? colors.packets[0] : colors.node;
      ctx.globalAlpha = 0.3 * Math.sin(Math.PI * g.age);
      ctx.fillText(g.text, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = colors.node;
    ctx.globalAlpha = 0.45;
    for (const n of nodes) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill(); }
    for (const p of packets) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85 * Math.sin(Math.PI * p.t);
      ctx.beginPath(); ctx.arc(p.a.x + (p.b.x - p.a.x) * p.t, p.a.y + (p.b.y - p.a.y) * p.t, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = root.requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
    last = now;
    step(dt); draw();
  }

  function start() {
    if (raf || reduced() || document.hidden) return;
    last = 0; raf = root.requestAnimationFrame(frame);
  }
  function stop() { if (raf) root.cancelAnimationFrame(raf); raf = 0; }

  function init() {
    canvas = document.createElement("canvas");
    canvas.className = "backdrop";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    ctx = canvas.getContext("2d");
    if (!ctx) return;
    readColors(); resize(); draw(); start();
    root.addEventListener("resize", () => { resize(); draw(); });
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    // The theme switch changes the colours.
    new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  HSA.backdrop = { start, stop };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(globalThis);
