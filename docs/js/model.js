// Pure data access for one level of HSA_DATA. No DOM.
(function (root) {
  const HSA = (root.HSA = root.HSA || {});

  function lookup(level, cardIdx, optionIdx) {
    const card = Number.isInteger(cardIdx) ? level.cards[cardIdx] : undefined;
    if (!card) throw new RangeError("bad card index " + cardIdx);
    const st = Number.isInteger(optionIdx) ? card.states[optionIdx] : undefined;
    if (!st) throw new RangeError("bad option index " + optionIdx);
    const shownIdx = level.show === "fixed" ? 1 : 2;
    const otherIdx = 3 - shownIdx;
    const at = (list, v) => (Array.isArray(list) && list[v] !== undefined ? list[v] : null);
    return {
      env: st.env,
      failures: st.failures,
      oracle: st.oracle_table,
      oracleIgp: st.oracle_igp || null,
      cells: st.cells.map((c) => ({ status: c[0], verdict: c[shownIdx], other: c[otherIdx], igp: c[3] })),
      // Per version: the card's question, its answer choices, the oracle's answer and the
      // verifier's own model ({answer, ambiguous, unsat, bgp|igp}). Null where data lacks them;
      // the model is also null where the verifier crashed (a panic cell has no model).
      versions: [0, 1, 2].map((v) => ({
        question: at(card.questions, v),
        choices: at(card.choices, v) || [],
        oracleAnswer: at(st.oracle_answers, v),
        model: st.cells[v] && st.cells[v][0] === "panic" ? null : at(st.models, v),
      })),
    };
  }

  // The verifier's answer for version v of a lookup result, or null when it has none: no
  // model, a crash, or an unsat model (no routing state at all). Null never matches a choice.
  function modelAnswer(result, v) {
    const m = result.versions[v] && result.versions[v].model;
    return m && !m.unsat && typeof m.answer === "string" ? m.answer : null;
  }

  function isBroken(level, cell) {
    return cell.status === "panic" || cell.verdict !== "Pass" ||
      (level.level === "ospf" && cell.igp.length > 0);
  }

  function cardIndex(level, id) {
    return level.cards.findIndex((c) => c.id === id);
  }

  HSA.model = { lookup, modelAnswer, isBroken, cardIndex };
})(globalThis);
