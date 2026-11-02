// The guided story (pure; no DOM): which steps each version shows, on which network,
// and the URL hash that names a place in the story or the explorer.
(function (root) {
  const HSA = (root.HSA = root.HSA || {});

  // One quiz screen per version: the start and midway versions on a network where
  // they go wrong; the final version on the midway's network, where it now agrees.
  const KINDS = [["quiz"], ["quiz"], ["quiz"]];

  // The first option of card ci where version v is wrong, or -1.
  function firstWrong(data, ci, v) {
    const M = HSA.model;
    const card = data.cards[ci];
    for (let oi = 0; card && oi < card.states.length; oi++)
      if (M.isBroken(data, M.lookup(data, ci, oi).cells[v])) return oi;
    return -1;
  }

  // steps(data)[v] = [{v, kind, card, option}]: the start version's network is the
  // tutorial card, the midway's the story card; the final version replays the midway's.
  function steps(data) {
    const M = HSA.model;
    const tut = Math.max(0, M.cardIndex(data, data.tutorial_card));
    const story = Math.max(0, M.cardIndex(data, data.story_card));
    const at = [[tut, 0], [story, 1], [story, 1]];
    return KINDS.map((kinds, v) => {
      const [card, wrongIn] = at[v];
      const option = Math.max(0, firstWrong(data, card, wrongIn));
      return kinds.map((kind) => ({ v, kind, card, option }));
    });
  }

  // "#rr/1" is the story (level, version; an optional step may follow);
  // "#rr/1/explore/crit_04/0" the explorer (level, version, card id, option); anything
  // empty is the landing page. Numbers that
  // do not parse read as 0; the controller clamps them against the data.
  function parseHash(hash) {
    const parts = String(hash || "").replace(/^#/, "").split("/").filter(Boolean).map((p) => {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    if (!parts.length) return { screen: "landing" };
    const int = (x) => (/^\d+$/.test(x || "") ? Number(x) : 0);
    const [level, v, a, b, c] = parts;
    if (a === "explore") return { screen: "explore", level, v: int(v), card: b || null, option: int(c) };
    return { screen: "story", level, v: int(v), step: int(a) };
  }

  function formatHash(p) {
    if (!p || p.screen === "landing") return "";
    const base = "#" + p.level + "/" + p.v;
    if (p.screen === "explore") return base + "/explore/" + encodeURIComponent(p.card) + "/" + p.option;
    return p.step ? base + "/" + p.step : base;
  }

  HSA.story = { steps, firstWrong, parseHash, formatHash, KINDS };
})(globalThis);
