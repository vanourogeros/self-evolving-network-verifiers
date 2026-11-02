// Controller: the URL hash names the place (landing, a story step, or the explorer);
// every move changes the hash and every hash change renders. Kiosk mode returns to the
// landing page after a quiet spell.
(function (root) {
  const HSA = root.HSA;
  const V = HSA.view, S = HSA.story, M = HSA.model;
  const LEVELS = ["rr", "ospf"];
  const DATA = root.HSA_DATA || {}, CONTENT = root.HSA_CONTENT || {};
  const IDLE_MS = 90 * 1000;

  const params = new URLSearchParams(root.location.search);
  const kiosk = params.has("kiosk");
  const STEPS = {};
  for (const l of LEVELS) if (DATA[l]) STEPS[l] = S.steps(DATA[l]);

  let place = { screen: "landing" };
  // Guesses by question: "level|version|card|option" -> the chosen answer, or "" when
  // the visitor asked to just see it. Kept for the visit only.
  const guesses = new Map();
  const guessKey = (p) => {
    if (p.screen === "story") {
      const st = STEPS[p.level][p.v][p.step];
      return [p.level, p.v, DATA[p.level].cards[st.card].id, st.option].join("|");
    }
    return p.screen === "explore" ? [p.level, p.v, p.card, p.option].join("|") : null;
  };
  // The story step the explorer was opened from, so "Back to the story" returns there.
  let storyReturn = null;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  // The verifier's answer for the question on the current screen, or null.
  function answerHere() {
    const d = DATA[place.level];
    let ci, oi;
    if (place.screen === "story") ({ card: ci, option: oi } = STEPS[place.level][place.v][place.step]);
    else if (place.screen === "explore") { ci = place.cardIdx; oi = place.option; } else return null;
    return M.modelAnswer(M.lookup(d, ci, oi), place.v);
  }
  const otherOf = (level) => LEVELS.find((l) => l !== level);

  // A parsed hash, checked against the data: unknown levels go to the landing page and
  // out-of-range numbers are clamped.
  function resolve(hash) {
    const p = S.parseHash(hash);
    if (p.screen === "landing" || !LEVELS.includes(p.level)) return { screen: "landing" };
    const v = clamp(p.v, 0, 2);
    if (p.screen === "story") return { screen: "story", level: p.level, v, step: clamp(p.step, 0, STEPS[p.level][v].length - 1) };
    const d = DATA[p.level];
    let ci = p.card ? M.cardIndex(d, p.card) : -1;
    if (ci < 0) ci = STEPS[p.level][v][0].card;
    return { screen: "explore", level: p.level, v, card: d.cards[ci].id, cardIdx: ci, option: clamp(p.option, 0, d.cards[ci].states.length - 1) };
  }

  function go(p) {
    const hash = S.formatHash(p);
    if ((root.location.hash || "") === hash || (!hash && !root.location.hash)) { place = resolve(hash); render({ top: true }); return; }
    // Setting an empty hash leaves "#" behind; pushState drops it for the landing page.
    // A sandboxed frame may refuse pushState, so fall back to the bare "#".
    if (!hash) {
      try {
        root.history.pushState(null, "", root.location.pathname + root.location.search);
        onHash();
        return;
      } catch (e) { /* fall through */ }
    }
    root.location.hash = hash;
  }

  const on = {
    go,
    home() { go({ screen: "landing" }); },
    openLevel(level) { storyReturn = null; go({ screen: "story", level, v: 0, step: 0 }); },
    otherLevel() { on.openLevel(otherOf(place.level)); },
    explore(at) {
      if (place.screen === "story") storyReturn = { screen: "story", level: place.level, v: place.v, step: place.step };
      go({ screen: "explore", level: place.level, v: at.v, card: at.card, option: at.option });
    },
    guess(choice) {
      const k = guessKey(place);
      if (!k || guesses.has(k)) return;
      guesses.set(k, choice);
      const right = !!choice && choice === answerHere();
      render({ focus: "#reveal-title", scrollTo: ".reveal-box" });
      // A right guess bursts into confetti from the "You guessed …: right!" line, once the
      // smooth scroll to the result has settled.
      if (right && HSA.confetti) root.setTimeout(() => {
        const el = document.querySelector(".guessed.right");
        if (!el) return;
        const b = el.getBoundingClientRect();
        HSA.confetti.burst(b.left + Math.min(b.width, 260) / 2, b.top + b.height / 2);
      }, 450);
    },
    backToStory() {
      const back = storyReturn && storyReturn.level === place.level ? storyReturn : { screen: "story", level: place.level, v: place.v, step: 0 };
      go(back);
    },
  };

  // ---------- rendering ----------

  function render(opts) {
    const o = opts || {};
    const main = document.getElementById("app");
    const slot = document.getElementById("masthead-slot");
    const active = document.activeElement;
    const focusKey = active && active.getAttribute ? active.getAttribute("data-focus-key") : null;
    const level = place.level;
    const gk = guessKey(place);
    const ctx = level ? { levelKey: level, data: DATA[level], content: CONTENT[level], place,
      steps: STEPS[level], other: CONTENT[otherOf(level)], guess: gk && guesses.has(gk) ? guesses.get(gk) : undefined } : null;

    let screen;
    if (place.screen === "landing") screen = V.landing(LEVELS.map((k) => ({ key: k, data: DATA[k], content: CONTENT[k] })), on);
    else if (place.screen === "story") screen = V.story(ctx, on);
    else screen = V.explore(ctx, on);

    // Confetti belongs to the screen it was fired on.
    for (const c of document.querySelectorAll(".confetti")) c.remove();
    main.replaceChildren(screen);
    slot.replaceChildren(ctx ? V.masthead(ctx, on) : "");
    document.body.setAttribute("data-screen", place.screen);
    document.title = ctx ? CONTENT[level].title + " · " + V.TITLE : V.TITLE;

    if (o.top) root.scrollTo(0, 0);
    if (o.scrollTo) {
      const el = main.querySelector(o.scrollTo);
      const reduce = (() => { try { return root.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return true; } })();
      if (el) el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    let target = o.focus ? document.querySelector(o.focus) : null;
    if (!target && focusKey) target = document.querySelector('[data-focus-key="' + focusKey + '"]');
    if (target) {
      if (!target.hasAttribute("tabindex") && !/^(BUTTON|INPUT|A)$/.test(target.tagName)) target.setAttribute("tabindex", "-1");
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
  }

  function onHash() {
    const prev = place;
    place = resolve(root.location.hash);
    const moved = prev.screen !== place.screen || prev.level !== place.level || prev.v !== place.v || prev.step !== place.step;
    // A new step or screen moves focus to its heading; a new card or option in the
    // explorer keeps focus on the control that was used.
    render(moved ? { top: true, focus: place.screen === "landing" ? "#landing-title" : "#step-title" } : {});
  }

  // Left and right arrow keys step through the story (not while a form control has focus).
  function onKey(ev) {
    if (place.screen !== "story" || ev.altKey || ev.ctrlKey || ev.metaKey) return;
    const t = ev.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const flat = STEPS[place.level].flat();
    const i = flat.indexOf(STEPS[place.level][place.v][place.step]);
    const to = ev.key === "ArrowRight" ? flat[i + 1] : ev.key === "ArrowLeft" ? flat[i - 1] : null;
    if (!to) return;
    ev.preventDefault();
    go({ screen: "story", level: place.level, v: to.v, step: STEPS[place.level][to.v].indexOf(to) });
  }

  // ---------- kiosk ----------

  function setupKiosk() {
    document.documentElement.classList.add("kiosk");
    document.body.classList.add("kiosk");
    let timer = null;
    const poke = () => { if (timer) clearTimeout(timer); timer = setTimeout(on.home, IDLE_MS); };
    for (const ev of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"])
      root.addEventListener(ev, poke, { passive: true });
    poke();
  }

  // ---------- boot ----------

  function boot() {
    if (!LEVELS.every((l) => DATA[l] && CONTENT[l])) {
      document.getElementById("app").replaceChildren(V.h("p.wrap", { text: "The level data did not load. Check that data/ and content/ sit next to index.html." }));
      return;
    }
    document.getElementById("home").addEventListener("click", on.home);
    root.addEventListener("hashchange", onHash);
    root.addEventListener("popstate", onHash);
    root.addEventListener("keydown", onKey);
    if (kiosk) setupKiosk();
    place = resolve(root.location.hash);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(globalThis);
