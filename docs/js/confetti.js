// Confetti for a right guess: a burst of small coloured pieces from one point, animated
// with the Web Animations API and removed when done. Nothing for visitors who prefer
// reduced motion.
(function (root) {
  const HSA = (root.HSA = root.HSA || {});
  const TOKENS = ["--route-oracle", "--route-model", "--accent", "--ok", "--signal"];

  // x, y: viewport coordinates of the burst.
  function burst(x, y) {
    try { if (root.matchMedia("(prefers-reduced-motion: reduce)").matches) return; } catch (e) { return; }
    const css = root.getComputedStyle(document.documentElement);
    const colors = TOKENS.map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
    const layer = document.createElement("div");
    layer.className = "confetti";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    let longest = 0;
    for (let i = 0; i < 90; i++) {
      const p = document.createElement("span");
      p.style.left = x + "px";
      p.style.top = y + "px";
      p.style.width = 6 + Math.random() * 6 + "px";
      p.style.height = 8 + Math.random() * 8 + "px";
      p.style.background = colors[i % colors.length] || "currentColor";
      if (Math.random() < 0.3) p.style.borderRadius = "50%";
      layer.appendChild(p);
      // Mostly upward, then falling under gravity.
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = 260 + Math.random() * 320;
      const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
      const spin = (Math.random() * 2 - 1) * 720;
      const secs = 1.3 + Math.random() * 0.6;
      const frames = [];
      for (let k = 0; k <= 10; k++) {
        const t = (secs * k) / 10;
        frames.push({ transform: "translate(" + vx * t + "px, " + (vy * t + 450 * t * t) + "px) rotate(" + (spin * k) / 10 + "deg)",
          opacity: k < 7 ? 1 : 1 - (k - 7) / 3 });
      }
      if (p.animate) p.animate(frames, { duration: secs * 1000, easing: "linear", fill: "forwards" });
      longest = Math.max(longest, secs);
    }
    root.setTimeout(() => layer.remove(), longest * 1000 + 200);
  }

  HSA.confetti = { burst };
})(globalThis);
