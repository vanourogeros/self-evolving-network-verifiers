// DOM builders. Every piece of data or content text goes in through
// textContent / createTextNode; nothing here uses innerHTML.
(function (root) {
  const HSA = (root.HSA = root.HSA || {});
  // XML namespace identifier for createElementNS; it is never fetched.
  const SVGNS = "http://www.w3.org/2000/svg";
  let uid = 0;
  const TITLE = "Self-Evolving Network Verifiers";

  // ---------- element helpers ----------

  function append(node, kids) {
    for (const k of kids) {
      if (k === null || k === undefined || k === false) continue;
      if (Array.isArray(k)) append(node, k);
      else if (typeof k === "string" || typeof k === "number") node.appendChild(document.createTextNode(String(k)));
      else node.appendChild(k);
    }
    return node;
  }

  // h("div.a.b", {attrs, on}, ...children)
  function h(spec, props, ...kids) {
    const [head, ...classes] = spec.split(".");
    const [tag, id] = head.split("#");
    const node = document.createElement(tag || "div");
    if (id) node.id = id;
    if (classes.length) node.className = classes.join(" ");
    applyProps(node, props);
    return append(node, kids);
  }

  function s(spec, props, ...kids) {
    const [tag, ...classes] = spec.split(".");
    const node = document.createElementNS(SVGNS, tag);
    if (classes.length) node.setAttribute("class", classes.join(" "));
    applyProps(node, props);
    return append(node, kids);
  }

  function applyProps(node, props) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }

  // Math symbols get their own upright span: some system text fonts lack them (U+2260
  // fell back to a font that drew "=/"), and italic serif runs arrows into letters.
  const SYM = /([\u2260\u2264\u2265\u2248\u2261\u2190\u2192\u21d2\u21d4\u2208\u2209\u220b\u222a\u2203\u00ac\u221e])/;
  function symText(text) {
    return String(text).split(SYM).filter(Boolean)
      .map((p, i) => (SYM.test(p) && p.length === 1 ? h("span.sym", { text: p }) : document.createTextNode(p)));
  }

  // Text with `code` spans (content uses backticks for CLI snippets) and symbol spans.
  function richText(spec, text, props) {
    const node = h(spec, props);
    String(text).split("`").forEach((part, i) => {
      if (!part) return;
      if (i % 2) node.appendChild(h("code", { text: part }));
      else append(node, symText(part));
    });
    return node;
  }

  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);

  // ---------- network drawing ----------

  function areaIndex(area) {
    if (!area || /backbone/i.test(area)) return 0;
    const m = /(\d+)/.exec(area);
    return m ? Number(m[1]) : 0;
  }

  const fmtW = (w) => (Number.isInteger(w) ? String(w) : String(+w.toFixed(2)));
  const edgeKey = (a, b) => (a < b ? a + "\u0000" + b : b + "\u0000" + a);

  function positions(card, layout) {
    const pos = {};
    const names = card.net.routers.map((r) => r.name);
    names.forEach((n, i) => {
      const p = layout && layout[n];
      if (p) pos[n] = { x: p[0], y: p[1] };
      else {
        const t = (2 * Math.PI * i) / names.length - Math.PI / 2;
        pos[n] = { x: 300 + 210 * Math.cos(t), y: 180 + 130 * Math.sin(t) };
      }
    });
    return pos;
  }

  function chip(x, y, label, cls) {
    const w = label.length * 7.4 + 12;
    return s("g.chip" + (cls ? "." + cls : ""), { transform: "translate(" + x.toFixed(1) + " " + y.toFixed(1) + ")" },
      s("rect", { x: -w / 2, y: -10, width: w, height: 20, rx: 4 }),
      s("text", { x: 0, y: 4.5, "text-anchor": "middle", text: label }));
  }

  // ---------- routes, deciders, outcome (pure; no DOM) ----------

  const levelName = (level) => (typeof level === "string" ? level : level && level.level);
  const isVerifierSide = (side) => side === "verifier" || side === "model";

  // The verifier's raw model for version v of a data state, or null when it has none
  // (a crash, an unsat model, or no recorded model).
  function rawModel(state, v) {
    const cell = state.cells && state.cells[v];
    if (cell && cell[0] === "panic") return null;
    const m = Array.isArray(state.models) ? state.models[v] : null;
    return m && !m.unsat ? m : null;
  }

  // The hop list behind the answer to version v's question, for one side ("oracle" or
  // "verifier"). RR: the asked router, then each learned-from neighbour in turn, until
  // an external router or a router with no route ([router] alone means no route).
  // OSPF: src followed by its next hop(s) toward dst ([src] alone means unreachable).
  // Null when the verifier has no model (crash, unsat, missing).
  function routeChain(level, card, state, v, side) {
    const q = card.questions && card.questions[v];
    if (!q) return null;
    const verifier = isVerifierSide(side);
    const m = verifier ? rawModel(state, v) : null;
    if (verifier && !m) return null;
    if (levelName(level) === "ospf") {
      const key = q.src + "->" + q.dst;
      const oi = state.oracle_igp || {};
      const mi = m && m.igp ? m.igp : {};
      // The verifier's rows hold only the pairs that differ, plus the question pair.
      const row = verifier && Object.prototype.hasOwnProperty.call(mi, key) ? mi[key] : oi[key];
      const nh = row ? row.nh || row.nhs || [] : [];
      return [q.src].concat(nh);
    }
    const table = verifier ? m.bgp || {} : state.oracle_table || {};
    const ext = new Set(card.net.routers.filter((r) => r.external).map((r) => r.name));
    const chain = [q.router];
    const seen = new Set(chain);
    let cur = q.router;
    while (!ext.has(cur)) {
      const e = table[cur];
      const f = e && e.from;
      if (!f || seen.has(f)) break;
      chain.push(f);
      seen.add(f);
      cur = f;
    }
    return chain;
  }

  // The edges [a, b] a hop list draws: consecutive pairs for RR, src to each next hop for OSPF.
  function routeEdges(level, chain) {
    if (!chain || chain.length < 2) return [];
    if (levelName(level) === "ospf") return chain.slice(1).map((n) => [chain[0], n]);
    return chain.slice(1).map((n, i) => [chain[i], n]);
  }

  const sameEdges = (a, b) => {
    const k = (es) => es.map(([x, y]) => edgeKey(x, y)).sort().join("|");
    return k(a) === k(b);
  };

  // The deciding rule and reasons for one (card, env, version), or null.
  function deciderFor(content, card, env, v) {
    const id = typeof card === "string" ? card : card && card.id;
    const d = content && content.deciders && content.deciders[id];
    const e = d && d[env];
    return (e && e[v]) || null;
  }

  const asksRouters = (q) => (!q ? [] : q.kind === "next_hop" ? [q.src, q.dst] : [q.router]);

  // The mistake entry for one (card, env, version), or null where the version is right.
  function mistakeFor(content, card, env, v) {
    const id = typeof card === "string" ? card : card && card.id;
    const e = content && content.mistakes && content.mistakes[id] && content.mistakes[id][env];
    return (e && e[v]) || null;
  }


  // A router's ID is its index in net.routers, internal and external together; the
  // RR tie-break rules compare these.
  const routerIds = (card) => Object.fromEntries(card.net.routers.map((r, i) => [r.name, i]));
  // The "#N" label drawn under a router on the RR diagram.
  const ridLabel = (ids, name) => "#" + ids[name];

  // ---------- diagram geometry (pure; no DOM) ----------

  // The full diagram's viewBox: the 600x360 layout box plus room for labels under the
  // lowest routers and beside the outermost ones.
  const VIEW = { x: -20, y: -12, w: 640, h: 412 };
  // Narrow screens scale node children by 1.3 and chips by 1.15 (style.css).
  const SCALES = [{ node: 1, chip: 1 }, { node: 1.3, chip: 1.15 }];

  // How a route hop between a and b is drawn: "link" (straight, along an up physical
  // link), "ebgp" (straight, along the eBGP session), "session" (curved, along the iBGP
  // session) or "straight" (no session to follow). A failed link never carries a hop.
  function hopShape(level, card, a, b, failures) {
    const k = edgeKey(a, b);
    const failed = new Set((failures || []).map(([x, y]) => edgeKey(x, y)));
    const linked = card.net.links.some((l) => edgeKey(l.a, l.b) === k);
    if (levelName(level) !== "rr") return "link";
    if (linked && !failed.has(k)) return "link";
    const ss = card.net.sessions.find((x) => edgeKey(x.a, x.b) === k);
    if (!ss) return "straight";
    return ss.type === "EBgp" ? "ebgp" : "session";
  }

  // An OSPF network's areas as regions that tile the drawing without overlapping:
  // {pieces: [{area, rings: [[{x,y}]], label: {x,y}}]}, one piece per connected part of
  // an area (a split area gets two). The drawing is the union of each area's routers'
  // outline, widened by AREA_PAD, with any hole filled; each spot in it belongs to the
  // area of its nearest link. Two areas' border
  // is where their nearest links are equally far, so it runs through the router they
  // share. Traced on a grid (marching squares, interpolated so borders are smooth).
  const AREA_PAD = 40, AREA_STEP = 4;
  const areaCache = new WeakMap();
  function areaRegions(card, pos) {
    const key = JSON.stringify(pos);
    const hit = areaCache.get(card);
    if (hit && hit.key === key) return hit.value;
    const value = traceAreas(card, pos);
    areaCache.set(card, { key, value });
    return value;
  }

  function segDist(A, B, P) {
    const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / L)) : 0;
    return Math.hypot(P.x - A.x - t * dx, P.y - A.y - t * dy);
  }

  function traceAreas(card, pos) {
    const internal = card.net.routers.filter((r) => !r.external && pos[r.name]).map((r) => pos[r.name]);
    const links = card.net.links.filter((l) => pos[l.a] && pos[l.b]);
    const areas = [...new Set(links.map((l) => areaIndex(l.area)))].sort((a, b) => a - b);
    if (!internal.length || !links.length) return { pieces: [] };
    const hulls = areas.map((a) => convexHull([...new Set(links.filter((l) => areaIndex(l.area) === a).flatMap((l) => [l.a, l.b]))].map((n) => pos[n])));
    // Each link pulled back a little from a router it shares with another area: beyond
    // that router, both areas' links are otherwise nearest at the router itself, a tie;
    // pulled back, the border there splits the angle between the two links, still
    // through the router.
    const areasAt = {};
    for (const l of links) for (const n of [l.a, l.b]) (areasAt[n] = areasAt[n] || new Set()).add(areaIndex(l.area));
    const segs = links.map((l) => {
      const A = pos[l.a], B = pos[l.b], len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
      const e = Math.min(12, len / 4) / len, ea = areasAt[l.a].size > 1 ? e : 0, eb = areasAt[l.b].size > 1 ? e : 0;
      return { area: areaIndex(l.area), A: { x: A.x + (B.x - A.x) * ea, y: A.y + (B.y - A.y) * ea }, B: { x: B.x - (B.x - A.x) * eb, y: B.y - (B.y - A.y) * eb } };
    });
    const st = AREA_STEP, m = AREA_PAD + 2 * st;
    const x0 = Math.min(...internal.map((p) => p.x)) - m, y0 = Math.min(...internal.map((p) => p.y)) - m;
    const nx = Math.ceil((Math.max(...internal.map((p) => p.x)) + m - x0) / st), ny = Math.ceil((Math.max(...internal.map((p) => p.y)) + m - y0) / st);
    const at = (i, j) => ({ x: x0 + i * st, y: y0 + j * st });
    // outside[j][i] >= 0 outside the drawing; a hole (outside, but not reachable from
    // the grid's edge) is filled in.
    const outside = [];
    for (let j = 0; j <= ny; j++) {
      const row = [];
      for (let i = 0; i <= nx; i++) row.push(Math.min(...hulls.map((hl) => hullDist(hl, at(i, j)))) - AREA_PAD);
      outside.push(row);
    }
    const open = outside.map((row) => row.map(() => false)), stack = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
      if ((i === 0 || j === 0 || i === nx || j === ny) && outside[j][i] >= 0) { open[j][i] = true; stack.push([i, j]); }
    while (stack.length) {
      const [a, b] = stack.pop();
      for (const [c, e] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]])
        if (c >= 0 && e >= 0 && c <= nx && e <= ny && !open[e][c] && outside[e][c] >= 0) { open[e][c] = true; stack.push([c, e]); }
    }
    // field[k][j][i] < 0 inside area k: the larger of "outside the drawing" and "nearer
    // another area's link".
    const field = areas.map(() => []);
    const near = [];
    for (let j = 0; j <= ny; j++) {
      const rows = areas.map(() => []), nrow = [];
      for (let i = 0; i <= nx; i++) {
        const P = at(i, j);
        const out = outside[j][i] >= 0 && !open[j][i] ? -1 : outside[j][i];
        const d = areas.map((a) => Math.min(...segs.filter((g) => g.area === a).map((g) => segDist(g.A, g.B, P))));
        areas.forEach((a, k) => {
          const other = Math.min(...d.filter((_, q) => q !== k));
          rows[k].push(Math.max(out, d[k] - (other === Infinity ? Infinity : other)));
        });
        nrow.push(Math.min(...d));
      }
      areas.forEach((_, k) => field[k].push(rows[k]));
      near.push(nrow);
    }
    const pieces = [];
    areas.forEach((area, k) => {
      const f = field[k];
      // Connected parts, by flood fill over grid points inside the area.
      const part = f.map((row) => row.map(() => -1));
      let nParts = 0;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        if (f[j][i] >= 0 || part[j][i] >= 0) continue;
        const stack = [[i, j]];
        part[j][i] = nParts;
        while (stack.length) {
          const [a, b] = stack.pop();
          for (const [c, e] of [[a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]])
            if (c >= 0 && e >= 0 && c <= nx && e <= ny && f[e][c] < 0 && part[e][c] < 0) { part[e][c] = nParts; stack.push([c, e]); }
        }
        nParts++;
      }
      const rings = contour(f, nx, ny, at);
      for (let q = 0; q < nParts; q++) {
        // The label goes where it is clearest of the area's border, the links and the
        // routers, checked across its width (as wide as on a phone); among spots clear
        // enough, the one nearest the part's middle, the upper one on a tie.
        const half = Math.ceil(34 / st);
        let mx = 0, my = 0, cnt = 0;
        for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) if (part[j][i] === q) { const P = at(i, j); mx += P.x; my += P.y; cnt++; }
        mx /= cnt; my /= cnt;
        let best = null, bestScore = -Infinity, bestD = Infinity;
        for (let j = 0; j <= ny; j++) for (let i = half; i <= nx - half; i++) {
          if (part[j][i] !== q) continue;
          let score = 24;
          for (const di of [-half, 0, half]) {
            const v = f[j][i + di], P = at(i + di, j);
            const rd = Math.min(...internal.map((R) => Math.hypot(R.x - P.x, R.y - P.y))) - 32;
            score = Math.min(score, part[j][i + di] === q ? -v : -Infinity, near[j][i + di] - 4, rd);
          }
          const P = at(i, j), dm = Math.hypot(P.x - mx, P.y - my);
          if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && dm < bestD - 1e-9)) { bestScore = score; bestD = dm; best = P; }
        }
        const ringsOf = rings.filter((r) => {
          // A ring belongs to this part when its first grid neighbour inside is in it.
          const P = r[0];
          let cell = null, dmin = Infinity;
          for (let dj = -1; dj <= 2; dj++) for (let di = -1; di <= 2; di++) {
            const i = Math.floor((P.x - x0) / st) + di, j = Math.floor((P.y - y0) / st) + dj;
            if (i < 0 || j < 0 || i > nx || j > ny || part[j][i] < 0) continue;
            const g = at(i, j), dd = Math.hypot(g.x - P.x, g.y - P.y);
            if (dd < dmin) { dmin = dd; cell = part[j][i]; }
          }
          return cell === q;
        });
        pieces.push({ area, rings: ringsOf, label: best ? { x: best.x, y: best.y + 4.5 } : null });
      }
    });
    return { pieces };
  }

  // Closed outlines of the region where f < 0 (marching squares; the grid's edge is
  // outside). Saddles are split by the cell centre's average value.
  function contour(f, nx, ny, at) {
    const pt = (i1, j1, i2, j2) => {
      const a = f[j1][i1], b = f[j2][i2], t = a / (a - b), P = at(i1, j1), Q = at(i2, j2);
      return { x: P.x + (Q.x - P.x) * t, y: P.y + (Q.y - P.y) * t };
    };
    const segs = [];
    const ends = new Map();
    const add = (k1, p1, k2, p2) => {
      const sgi = segs.length;
      segs.push([k1, p1, k2, p2]);
      for (const k of [k1, k2]) { if (!ends.has(k)) ends.set(k, []); ends.get(k).push(sgi); }
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const tl = f[j][i] < 0, tr = f[j][i + 1] < 0, br = f[j + 1][i + 1] < 0, bl = f[j + 1][i] < 0;
      const c = (tl ? 8 : 0) + (tr ? 4 : 0) + (br ? 2 : 0) + (bl ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const E = {
        t: ["h" + i + "," + j, () => pt(i, j, i + 1, j)], b: ["h" + i + "," + (j + 1), () => pt(i, j + 1, i + 1, j + 1)],
        l: ["v" + i + "," + j, () => pt(i, j, i, j + 1)], r: ["v" + (i + 1) + "," + j, () => pt(i + 1, j, i + 1, j + 1)],
      };
      const centre = (f[j][i] + f[j][i + 1] + f[j + 1][i + 1] + f[j + 1][i]) / 4 < 0;
      const pairs = {
        1: ["lb"], 2: ["br"], 3: ["lr"], 4: ["tr"], 5: centre ? ["lt", "br"] : ["lb", "tr"], 6: ["tb"], 7: ["lt"],
        8: ["lt"], 9: ["tb"], 10: centre ? ["tr", "lb"] : ["lt", "br"], 11: ["tr"], 12: ["lr"], 13: ["br"], 14: ["lb"],
      }[c];
      for (const [u, v] of pairs) add(E[u][0], E[u][1](), E[v][0], E[v][1]());
    }
    const used = new Array(segs.length).fill(false), rings = [];
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = true;
      const ring = [segs[s0][1]];
      let key = segs[s0][2], start = segs[s0][0], pnt = segs[s0][3];
      while (key !== start) {
        ring.push(pnt);
        const nxt = (ends.get(key) || []).find((q) => !used[q]);
        if (nxt === undefined) break;
        used[nxt] = true;
        const sg = segs[nxt];
        if (sg[0] === key) { key = sg[2]; pnt = sg[3]; } else { key = sg[0]; pnt = sg[1]; }
      }
      if (ring.length > 2) rings.push(ring);
    }
    return rings;
  }

  // The convex hull of points, counter-clockwise (Andrew's monotone chain).
  function convexHull(points) {
    const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const half = (pts) => {
      const out = [];
      for (const q of pts) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
        out.push(q);
      }
      return out.slice(0, -1);
    };
    return half(p).concat(half(p.slice().reverse()));
  }

  // Distance from P to a convex polygon (0 inside it).
  function hullDist(hull, P) {
    const seg = (A, B) => {
      const dx = B.x - A.x, dy = B.y - A.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / L)) : 0;
      return Math.hypot(P.x - A.x - t * dx, P.y - A.y - t * dy);
    };
    if (hull.length === 1) return Math.hypot(P.x - hull[0].x, P.y - hull[0].y);
    const n = hull.length;
    let inside = n >= 3, d = Infinity;
    for (let i = 0; i < n; i++) {
      const A = hull[i], B = hull[(i + 1) % n];
      if ((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x) < 0) inside = false;
      d = Math.min(d, seg(A, B));
    }
    return inside ? 0 : d;
  }

  // Link label chips: [{x, y, w, h, label, cls}]: the cost, and ✕ on a broken
  // link; OSPF links that cost 1 get none. A link under a drawn route gets its chip
  // moved 18 px off the link, to the upper (or, for a vertical link, left) side, so the
  // route band stays visible.
  function chipSpots(card, pos, level, onRoute, failed) {
    const out = [];
    const cw = (label) => label.length * 7.4 + 12;
    for (const l of card.net.links) {
      const A = pos[l.a], B = pos[l.b];
      if (!A || !B) continue;
      const isFailed = failed.has(edgeKey(l.a, l.b));
      if (level === "ospf" && l.w === 1 && !isFailed) continue;
      let x = (A.x + B.x) / 2, y = (A.y + B.y) / 2;
      if (onRoute.has(edgeKey(l.a, l.b))) {
        const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
        let nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
        if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
        x += nx * 18; y += ny * 18;
      }
      const label = level === "ospf" && l.w === 1 ? "✕" : (isFailed ? "✕ " : "") + fmtW(l.w);
      out.push({ x, y, w: cw(label), h: 20, label, cls: "chip-weight" + (isFailed ? ".chip-failed" : "") });
    }
    return out;
  }

  const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
  const insideView = (r) => r.x - r.w / 2 >= VIEW.x && r.x + r.w / 2 <= VIEW.x + VIEW.w && r.y - r.h / 2 >= VIEW.y && r.y + r.h / 2 <= VIEW.y + VIEW.h;
  const segHits = (P, Q, r) => {
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, x = P.x + (Q.x - P.x) * t, y = P.y + (Q.y - P.y) * t;
      if (Math.abs(x - r.x) * 2 < r.w && Math.abs(y - r.y) * 2 < r.h) return true;
    }
    return false;
  };

  // A text label's box (in layout units) at node P, for local offset (dx, baseline dy),
  // anchor and node scale.
  function textBox(P, dx, dy, anchor, text, charW, size, scale) {
    const w = text.length * charW * scale, h = size * scale;
    const cx = P.x + dx * scale + (anchor === "start" ? w / 2 : anchor === "end" ? -w / 2 : 0);
    return { x: cx, y: P.y + (dy - size / 3) * scale, w: w + 2, h: h + 2 };
  }

  // Where each internal router's "id N" label goes: {name: {dx, dy, anchor}}. Below
  // the router when that is clear of chips, links, other routers and the viewBox at
  // both screen scales; otherwise above, right, then left.
  function idSpots(card, pos, chips, R) {
    const ids = routerIds(card);
    const out = {};
    for (const r of card.net.routers) {
      if (r.external) continue;
      const P = pos[r.name];
      const text = ridLabel(ids, r.name);
      const cands = [[0, R + 21, "middle"], [0, -(R + 8), "middle"], [R + 5, 4, "start"], [-(R + 5), 4, "end"]];
      const clear = ([dx, dy, anchor]) => SCALES.every((sc) => {
        const b = textBox(P, dx, dy, anchor, text, 6.6, 11, sc.node);
        if (!insideView(b)) return false;
        if (chips.some((c) => overlap(b, { x: c.x, y: c.y, w: c.w * sc.chip, h: c.h * sc.chip }))) return false;
        if (card.net.links.some((l) => pos[l.a] && pos[l.b] && segHits(pos[l.a], pos[l.b], b))) return false;
        return card.net.routers.every((o) => o.name === r.name || !overlap(b, { x: pos[o.name].x, y: pos[o.name].y, w: 2 * R * sc.node, h: 2 * R * sc.node }));
      });
      const pick = cands.find(clear) || cands[0];
      out[r.name] = { dx: pick[0], dy: pick[1], anchor: pick[2] };
    }
    return out;
  }

  // A tag under a router, anchored so it stays inside the viewBox at both scales.
  function tagAnchor(P, text) {
    const half = (text.length * 7.2 * 1.3) / 2;
    if (P.x - half < VIEW.x + 4) return "start";
    if (P.x + half > VIEW.x + VIEW.w - 4) return "end";
    return "middle";
  }

  function tagText(P, tag, y, cls) {
    const anchor = tagAnchor(P, tag);
    return s("text." + (cls || "noroute-tag"), { x: anchor === "start" ? -(P.x - VIEW.x - 4) / 1.3 : anchor === "end" ? (VIEW.x + VIEW.w - 4 - P.x) / 1.3 : 0,
      y, "text-anchor": anchor, text: tag });
  }

  // opts: {level, failures, mini, answer:bool, unknown:bool, routeDir:"forward"|"reverse", noRoute:Set, asked:[names], ids:bool,
  //        routes:{oracle:[[a,b]], model:[[a,b]], both:bool}, tags:{name: text | {text, kind}}}
  function drawNet(card, layout, opts) {
    const o = opts || {};
    const mini = !!o.mini;
    const level = o.level;
    const pos = positions(card, layout);
    const ext = new Set(card.net.routers.filter((r) => r.external).map((r) => r.name));
    // OSPF questions are about paths inside the network; its outside peer plays no part.
    const hideExt = level === "ospf";
    const failed = new Set((o.failures || []).map(([a, b]) => edgeKey(a, b)));
    const noRoute = o.noRoute || new Set();
    const asked = new Set(mini ? [] : o.asked || []);
    const tags = (!mini && o.tags) || {};
    // An answer figure shows only the topology, faint, under one route.
    const answer = !mini && !!o.answer;
    const showIds = !mini && !answer && !!o.ids;
    const ids = routerIds(card);
    const R = mini ? 15 : 19;
    const id = "n" + ++uid;

    // An answer figure is cropped to the routers (plus room for a tag below them).
    let vb = mini ? [0, 0, 600, 360] : [VIEW.x, VIEW.y, VIEW.w, VIEW.h];
    if (answer) {
      const shown = Object.entries(pos).filter(([n]) => !(hideExt && ext.has(n))).map(([, p]) => p);
      const xs = shown.map((p) => p.x), ys = shown.map((p) => p.y);
      const x0 = Math.max(VIEW.x, Math.min(...xs) - 50), x1 = Math.min(VIEW.x + VIEW.w, Math.max(...xs) + 50);
      const y0 = Math.max(VIEW.y, Math.min(...ys) - 40), y1 = Math.min(VIEW.y + VIEW.h, Math.max(...ys) + 48);
      const w = Math.max(x1 - x0, 300), h = Math.max(y1 - y0, 150);
      vb = [x0 - (w - (x1 - x0)) / 2, y0 - (h - (y1 - y0)) / 2, w, h];
    }
    const svg = s("svg.net" + (mini ? ".net-mini" : "") + (answer ? ".net-answer" : ""), {
      viewBox: vb.map((n) => +n.toFixed(1)).join(" "), width: "100%", preserveAspectRatio: "xMidYMid meet",
      role: mini ? null : "img", "aria-hidden": mini ? "true" : null, focusable: "false",
    });
    if (!mini) {
      const nInt = card.net.routers.length - ext.size;
      const fl = (o.failures || []).map(([a, b]) => a + "–" + b);
      svg.appendChild(s("title", { text: "Network " + card.title + ": " + plural(nInt, "router", "routers") +
        ", " + plural(ext.size, "external peer", "external peers") + ", " + plural(card.net.links.length, "link", "links") +
        (fl.length ? "; failed link " + fl.join(", ") : "; no failed links") + "." }));
      svg.appendChild(s("defs", null,
        s("marker", { id: id + "-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" },
          s("path.arrowhead", { d: "M0 0 L10 5 L0 10 z" })),
        ["oracle", "model"].map((side) =>
          s("marker", { id: id + "-" + side, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 13, markerHeight: 13, orient: "auto", markerUnits: "userSpaceOnUse" },
            s("path.route-head-" + side, { d: "M0 0 L10 5 L0 10 z" })))));
    }

    const gAreas = s("g.areas"), gLinks = s("g.links"), gExt = s("g.ebgp"), gSess = s("g.sessions"), gRoutes = s("g.routes"),
      gLabels = s("g.labels"), gRings = s("g.rings"), gNodes = s("g.nodes");
    svg.append(gAreas, gLinks, gExt, gSess, gRoutes, gLabels, gRings, gNodes);

    // Control point of the curve an iBGP session (or a route along it) bends through.
    const bend = (A, B) => {
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      const off = Math.max(18, Math.min(40, len * 0.3));
      return { x: (A.x + B.x) / 2 - (dy / len) * off, y: (A.y + B.y) / 2 + (dx / len) * off };
    };

    // A route hop: straight along a physical link or an eBGP session, otherwise curved
    // along the iBGP session between the two routers (in the session's own orientation).
    const hopPath = (a, b) => {
      const A = pos[a], B = pos[b];
      if (!A || !B) return null;
      const line = "M" + A.x.toFixed(1) + " " + A.y.toFixed(1) + " L" + B.x.toFixed(1) + " " + B.y.toFixed(1);
      if (hopShape(level, card, a, b, o.failures) !== "session") return line;
      const ss = card.net.sessions.find((x) => edgeKey(x.a, x.b) === edgeKey(a, b));
      const P = pos[ss.a], Q = pos[ss.b], c = bend(P, Q);
      return "M" + P.x.toFixed(1) + " " + P.y.toFixed(1) + " Q" + c.x.toFixed(1) + " " + c.y.toFixed(1) + " " + Q.x.toFixed(1) + " " + Q.y.toFixed(1);
    };
    // An answer figure draws the route as arrows beside the links, so each link's own
    // colour (its area) stays visible: toward the asked router for RR (the way the route
    // travels), from src to its next hop for OSPF (the way traffic goes).
    const arrowHop = (a, b, side) => {
      const A = pos[a], B = pos[b];
      if (!A || !B) return null;
      const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      let nx = -uy, ny = ux;
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
      const off = 14, gapA = (ext.has(a) ? 26 : R) + 7, gapB = (ext.has(b) ? 26 : R) + 7;
      const p = (P, sgn, gap) => (P.x + sgn * ux * gap + nx * off).toFixed(1) + " " + (P.y + sgn * uy * gap + ny * off).toFixed(1);
      return s("path.route-arrow.route-arrow-" + side, { d: "M" + p(A, 1, gapA) + " L" + p(B, -1, gapB), "marker-end": "url(#" + id + "-" + side + ")" });
    };
    if (answer && o.routes) {
      for (const side of ["oracle", "model"])
        for (const [a, b] of o.routes[side] || []) {
          const el = o.routeDir === "reverse" ? arrowHop(b, a, side) : arrowHop(a, b, side);
          if (el) gRoutes.appendChild(el);
        }
    } else if (!mini && o.routes) {
      const draw = (edges, cls) => {
        for (const [a, b] of edges || []) {
          const d = hopPath(a, b);
          if (d) gRoutes.appendChild(s("path." + cls, { d }));
        }
      };
      draw(o.routes.oracle, "route.route-oracle");
      if (!o.routes.both) draw(o.routes.model, "route.route-model");
    }

    // Each area is a tinted region with a hard border; a router two areas share sits on
    // the border between them.
    if (level === "ospf")
      for (const piece of areaRegions(card, pos).pieces) {
        const k = Math.min(piece.area, 3);
        const d = piece.rings.map((r) => "M" + r.map((q) => q.x.toFixed(1) + " " + q.y.toFixed(1)).join(" L") + " Z").join(" ");
        gAreas.appendChild(s("path.area-region.area-" + k, { d, "fill-rule": "evenodd" }));
        if (!mini && !answer && piece.label)
          gAreas.appendChild(s("text.area-label.area-" + k, { x: +piece.label.x.toFixed(1), y: +piece.label.y.toFixed(1), "text-anchor": "middle", text: "area " + piece.area }));
      }

    const onRoute = new Set();
    if (!mini && o.routes)
      for (const [a, b] of (o.routes.oracle || []).concat(o.routes.both ? [] : o.routes.model || [])) onRoute.add(edgeKey(a, b));
    for (const l of card.net.links) {
      const A = pos[l.a], B = pos[l.b];
      if (!A || !B) continue;
      const area = areaIndex(l.area);
      let cls = "link";
      if (level === "ospf") cls += " area area-" + Math.min(area, 3) + (area === 0 ? " backbone" : "");
      if (failed.has(edgeKey(l.a, l.b))) cls += " failed";
      gLinks.appendChild(s("line", { class: cls, x1: A.x, y1: A.y, x2: B.x, y2: B.y }));
    }
    const chips = mini || answer ? [] : chipSpots(card, pos, level, onRoute, failed);
    for (const c of chips) gLabels.appendChild(chip(c.x, c.y, c.label, c.cls));
    const idAt = showIds ? idSpots(card, pos, chips, R) : {};

    for (const ss of card.net.sessions) {
      const A = pos[ss.a], B = pos[ss.b];
      if (!A || !B) continue;
      if (ss.type === "EBgp") {
        if (!hideExt) gExt.appendChild(s("line.ebgp-edge", { x1: A.x, y1: A.y, x2: B.x, y2: B.y }));
        continue;
      }
      if (mini || answer || level !== "rr") continue; // the OSPF level runs a plain iBGP full mesh; drawing it is noise
      const { x: cx, y: cy } = bend(A, B);
      const trim = (P, gap) => {
        const vx = cx - P.x, vy = cy - P.y, d = Math.hypot(vx, vy) || 1;
        return { x: P.x + (vx / d) * gap, y: P.y + (vy / d) * gap };
      };
      const p0 = trim(A, R + 4), p1 = trim(B, (ext.has(ss.b) ? 24 : R) + 5);
      const d = "M" + p0.x.toFixed(1) + " " + p0.y.toFixed(1) + " Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + p1.x.toFixed(1) + " " + p1.y.toFixed(1);
      if (ss.type === "IBgpClient") gSess.appendChild(s("path.client", { d, "marker-end": "url(#" + id + "-arrow)" }));
      else gSess.appendChild(s("path.peer", { d }));
    }

    for (const r of card.net.routers) {
      const P = pos[r.name];
      if (r.external && hideExt) continue;
      if (r.external) {
        const w = Math.max(44, r.name.length * 9 + 18);
        gNodes.appendChild(s("g.node.external", { transform: "translate(" + P.x + " " + P.y + ")" },
          s("rect", { x: -w / 2, y: mini ? -12 : -15, width: w, height: mini ? 24 : 30, rx: mini ? 12 : 15 }),
          mini ? null : s("text", { x: 0, y: 5, "text-anchor": "middle", text: r.name })));
      } else {
        // A tag is a string (a no-route tag) or {text, kind: "value"} (a mistake's value).
        const t = tags[r.name];
        const isValue = !!t && typeof t === "object" && t.kind === "value";
        const tag = t ? (isValue ? t.text : t) : noRoute.has(r.name) ? "∅ no route" : null;
        const nr = (!!tag && !isValue) || noRoute.has(r.name);
        gNodes.appendChild(s("g.node.internal" + (nr ? ".noroute" : ""), { transform: "translate(" + P.x + " " + P.y + ")" },
          s("circle", { r: R }),
          mini ? null : s("text", { x: 0, y: 5, "text-anchor": "middle", text: r.name }),
          showIds ? s("text.rid", { x: idAt[r.name].dx, y: idAt[r.name].dy, "text-anchor": idAt[r.name].anchor, text: ridLabel(ids, r.name) }) : null,
          tag && !mini ? tagText(P, tag, R + (showIds && idAt[r.name].dy > 0 ? 36 : 16), isValue ? "value-tag" : null) : null));
      }
      if (asked.has(r.name))
        gRings.appendChild(s("g.ringg", { transform: "translate(" + P.x + " " + P.y + ")" }, s("circle.ring", { r: (r.external ? 24 : R) + 6 })));
    }
    if (o.unknown) svg.appendChild(s("text.net-unknown", { x: vb[0] + vb[2] / 2, y: vb[1] + vb[3] / 2 + 34, "text-anchor": "middle", text: "?" }));
    return svg;
  }

  // extra: {asked: "asked router" | "asked pair", ids: bool,
  //         routes: {both, oracle, model, oracleLabel, modelLabel, bothLabel}}
  function legend(level, card, failures, extra) {
    const x = extra || {};
    const items = [];
    const sw = (cls, extra) => s("svg.swatch", { viewBox: "0 0 36 12", width: 36, height: 12, "aria-hidden": "true" },
      s("line", { class: cls, x1: 2, y1: 6, x2: 34, y2: 6 }), extra || null);
    // Only what is actually drawn gets a swatch.
    if (x.routes) {
      if (x.routes.oracle) items.push([sw("route route-oracle"), x.routes.both ? x.routes.bothLabel : x.routes.oracleLabel]);
      if (x.routes.model) items.push([sw("route route-model"), x.routes.modelLabel]);
    }
    if (x.asked)
      items.push([s("svg.swatch", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true" },
        s("circle.ring", { cx: 8, cy: 8, r: 6 })), x.asked]);
    if (x.ids) items.push([null, "#n = router number (some ties go to the lower number)"]);
    if (level === "ospf") {
      const areas = [...new Set(card.net.links.map((l) => areaIndex(l.area)))].sort((a, b) => a - b);
      for (const a of areas) {
        const k = Math.min(a, 3);
        items.push([s("svg.swatch", { viewBox: "0 0 36 16", width: 36, height: 16, "aria-hidden": "true" },
          s("rect.area-region.area-" + k, { x: 0, y: 0, width: 36, height: 16, rx: 8 }),
          s("line", { class: "link area area-" + k + (a === 0 ? " backbone" : ""), x1: 8, y1: 8, x2: 28, y2: 8 })), a === 0 ? "area 0" : "area " + a]);
      }
      items.push([null, card.net.links.some((l) => l.w !== 1) ? "every link costs 1, unless a number is shown" : "every link costs 1"]);
    } else {
      items.push([sw("link"), "cable, with its cost"]);
      if (card.net.sessions.some((x) => x.type === "IBgpClient"))
        items.push([s("svg.swatch", { viewBox: "0 0 36 12", width: 36, height: 12, "aria-hidden": "true" },
          s("path.client", { d: "M2 6 L28 6" }), s("path.arrowhead", { d: "M26 2 L34 6 L26 10 z" })), "reflector → its client (routes pass only along arrows and dashes)"]);
      if (card.net.sessions.some((x) => x.type === "IBgpPeer")) items.push([sw("peer"), "regular peers"]);
    }
    if (level !== "ospf") items.push([sw("ebgp-edge"), "where the route comes in from outside"]);
    if (failures && failures.length) items.push([sw("link failed"), "broken link"]);
    return h("ul.legend", null, items.map(([icon, text]) => h("li", null, icon, h("span", { text }))));
  }


  // ---------- plain-language helpers (pure; no DOM) ----------

  // A card's title and blurb: the content's plain-language text when it has some.
  function cardText(content, card) {
    const t = content && content.cards && content.cards[card.id];
    return { title: (t && t.title) || card.title, blurb: (t && t.blurb) || card.blurb };
  }

  // "no failures" reads "all links up"; "fail link a–b" reads "link a–b down".
  function optionText(label) {
    if (label === "no failures") return "all links up";
    const m = /^fail link (.+)$/.exec(label);
    return m ? "link " + m[1] + " down" : label;
  }

  // An answer as words: RR "from T" / "no route"; OSPF "via r1" / "can't reach it".
  function answerText(levelKey, a) {
    if (a === null || a === undefined) return "no answer";
    if (levelKey === "ospf") return a === "unreachable" ? "can't reach it" : "via " + a;
    return a === "no route" ? "no route" : "from " + a;
  }

  // An answer as a clause about who: "r1 gets it from r0", "b1 can't reach t".
  function answerClause(levelKey, q, a, who) {
    if (levelKey === "ospf") return a === "unreachable" ? who + " can't reach " + q.dst : who + " goes via " + a;
    return a === "no route" ? who + " gets no route" : who + " gets it from " + a;
  }

  // The reference's answer as a sentence, and the question to the visitor.
  function quizText(levelKey, content, q, oracleAnswer, vname) {
    const subject = q.kind === "next_hop" ? q.src : q.router;
    const normally = "The correct answer, from " + content.oracleName + " (the reference): " + answerClause(levelKey, q, oracleAnswer, subject) + ".";
    if (levelKey === "ospf")
      return { normally, ask: "Does the verifier get it right? Using the " + vname + " rules, how will it say " + q.src + " sends traffic for " + q.dst + "?" };
    return { normally, ask: "Does the verifier get it right? Using the " + vname + " rules, where will it say " + q.router + " gets the route?" };
  }

  // Each rule the next version adds or changes, before and after the fix.
  function ruleChanges(versions, v) {
    const before = new Map(versions[v].rules.map((r) => [r.id, r]));
    return versions[v + 1].rules.filter((r) => r.change !== "same")
      .map((r) => ({ id: r.id, before: before.has(r.id) ? before.get(r.id).text : null, after: r.text, stillWrong: !!r.wrong }));
  }

  // What one (card, option, version) shows once revealed. Pure.
  function revealFacts(levelKey, data, content, ci, oi, v) {
    const M = HSA.model;
    const card = data.cards[ci];
    const result = M.lookup(data, ci, oi);
    const cell = result.cells[v];
    const ve = result.versions[v];
    const broke = M.isBroken(data, cell);
    const m = ve.model;
    let says = "";
    if (cell.status === "panic") says = "crashes on this network";
    else if (!m) says = "gives no answer";
    else if (m.unsat) says = "finds no consistent answer at all";
    const q = ve.question;
    const subject = q.kind === "next_hop" ? q.src : q.router;
    const usable = m && !m.unsat && cell.status !== "panic";
    const refSays = content.oracleName + " says " + answerClause(levelKey, q, ve.oracleAnswer, usable ? "it" : subject);
    const headline = !broke
      ? "The verifier gets it right: like " + content.oracleName + ", it says " + answerClause(levelKey, q, ve.oracleAnswer, subject) + "."
      : usable
        ? "The verifier gets it wrong: it says " + answerClause(levelKey, q, m.answer, subject) + ", but " + refSays + "."
        : "The verifier " + says + "; " + refSays + ".";
    const mistake = broke ? mistakeFor(content, card, result.env, v) : null;
    const dec = deciderFor(content, card, result.env, v);
    const rule = mistake ? mistake.rule : dec && dec.verifier ? dec.verifier.rule : null;
    return { broke, headline, mistake, rule, answer: m && !m.unsat ? m.answer : null, oracleAnswer: ve.oracleAnswer, result };
  }

  // ---------- icons and the system diagram ----------

  // Small line icons on a 24-unit grid, drawn in currentColor.
  const ICONS = {
    robot: () => [s("rect", { x: 4, y: 8, width: 16, height: 12, rx: 3 }), s("line", { x1: 12, y1: 8, x2: 12, y2: 4.5 }),
      s("circle.fill", { cx: 12, cy: 3.6, r: 1.3 }), s("circle.fill", { cx: 9, cy: 13.5, r: 1.4 }), s("circle.fill", { cx: 15, cy: 13.5, r: 1.4 }),
      s("line", { x1: 9.5, y1: 17, x2: 14.5, y2: 17 })],
    rules: () => [s("rect", { x: 5, y: 3, width: 14, height: 18, rx: 2 }), s("line", { x1: 8, y1: 8, x2: 16, y2: 8 }),
      s("line", { x1: 8, y1: 12, x2: 16, y2: 12 }), s("line", { x1: 8, y1: 16, x2: 13, y2: 16 })],
    server: () => [s("rect", { x: 4, y: 4, width: 16, height: 7, rx: 1.5 }), s("rect", { x: 4, y: 13, width: 16, height: 7, rx: 1.5 }),
      s("circle.fill", { cx: 7.5, cy: 7.5, r: 1 }), s("circle.fill", { cx: 7.5, cy: 16.5, r: 1 }),
      s("line", { x1: 11, y1: 7.5, x2: 17, y2: 7.5 }), s("line", { x1: 11, y1: 16.5, x2: 17, y2: 16.5 })],
    net: () => [s("path", { d: "M6 6 L18 6 L18 18 L6 18 Z M6 6 L18 18" }),
      ...[[6, 6], [18, 6], [18, 18], [6, 18]].map(([x, y]) => s("circle.bg", { cx: x, cy: y, r: 2.6 }))],
    stack: () => [s("rect", { x: 8, y: 2.5, width: 13, height: 13, rx: 2 }), s("rect.bg", { x: 5.5, y: 5, width: 13, height: 13, rx: 2 }),
      s("rect.bg", { x: 3, y: 7.5, width: 13, height: 13, rx: 2 }), s("path", { d: "M6.5 11 L12.5 11 L12.5 17 L6.5 17 Z" })],
    pencil: () => [s("path", { d: "M4 20 L5.5 14.5 L15.5 4.5 L19.5 8.5 L9.5 18.5 Z" }), s("line", { x1: 13.5, y1: 6.5, x2: 17.5, y2: 10.5 })],
    blocks: () => [s("rect", { x: 2.5, y: 9, width: 6, height: 6, rx: 1 }), s("rect", { x: 9, y: 9, width: 6, height: 6, rx: 1 }),
      s("rect", { x: 15.5, y: 9, width: 6, height: 6, rx: 1 })],
    check: () => [s("circle", { cx: 12, cy: 12, r: 9 }), s("path", { d: "M7.5 12.5 L10.5 15.5 L16.5 9" })],
    coin: () => [s("circle", { cx: 12, cy: 12, r: 9 }), s("path", { d: "M14.5 8.5 C13.5 7.3 9 7.3 9 9.8 C9 12.3 15 11.6 15 14.2 C15 16.8 10.3 16.7 9.3 15.4 M12 6 L12 18" })],
    magnifier: () => [s("circle", { cx: 10, cy: 10, r: 6 }), s("line", { x1: 14.5, y1: 14.5, x2: 20.5, y2: 20.5 })],
    stopwatch: () => [s("circle", { cx: 12, cy: 13.5, r: 7.5 }), s("line", { x1: 12, y1: 13.5, x2: 12, y2: 9 }),
      s("line", { x1: 10, y1: 3, x2: 14, y2: 3 }), s("line", { x1: 12, y1: 3, x2: 12, y2: 6 })],
    bars: () => [s("line", { x1: 3, y1: 20.5, x2: 21, y2: 20.5 }), s("rect", { x: 5, y: 14, width: 3.5, height: 6.5 }),
      s("rect", { x: 10.25, y: 9, width: 3.5, height: 11.5 }), s("rect", { x: 15.5, y: 4, width: 3.5, height: 16.5 })],
    share: () => [s("path", { d: "M3 8 L8 8 L8 13 L3 13 Z M16 11 L21 11 L21 16 L16 16 Z" }),
      s("path.dash", { d: "M8 10.5 C11 10.5 13 13.5 16 13.5" })],
  };

  // A standalone icon for HTML (outside the diagram).
  const svgIcon = (name) => s("svg.icon.icon-html", { viewBox: "0 0 24 24", width: 28, height: 28, "aria-hidden": "true", focusable: "false" }, ICONS[name]());

  function icon(name, size, x, y) {
    return s("svg.icon", { viewBox: "0 0 24 24", width: size, height: size, x, y, "aria-hidden": "true", focusable: "false" }, ICONS[name]());
  }

  // The loop, in two layouts with the same parts: wide (left to right) and tall (top
  // to bottom, for phones). Each test network goes to the verifier and the reference;
  // their answers are compared; a difference goes to the AI fixer, agreement to the AI tester.
  const LOOP = {
    wide: { vb: "0 0 860 316", w: 174, h: 64,
      boxes: { tests: [95, 154, 154, 68], verifier: [300, 84], reference: [300, 236], fixer: [680, 84], tester: [680, 236] },
      compare: [480, 160, 36], done: [802, 220, 52, 32],
      arrows: [["M172 140 L194 140 L194 84 L213 84"], ["M172 168 L194 168 L194 236 L213 236"],
        ["M387 92 L450 130"], ["M387 228 L450 190"], ["M512 138 L594 96", "sd-differ"], ["M512 182 L594 224", "sd-same"],
        ["M680 52 L680 22 L300 22 L300 50", "sd-fix"], ["M680 268 L680 294 L95 294 L95 190", "sd-test"], ["M767 236 L800 236", "sd-done"]],
      labels: [[202, 164, "each test", null, "start"], [426, 100, "its routes", null, "start"], [426, 226, "real routes", null, "start"],
        [560, 104, "no", "sd-differ"], [560, 222, "yes", "sd-same"], [490, 15, "fixes the rules, then re-checks every test", "sd-fix"],
        [390, 288, "adds a new, harder test", "sd-test"], [828, 272, "none left", "sd-done"]] },
    tall: { vb: "0 0 360 486", w: 150, h: 62, testerSub: "harder tests",
      boxes: { tests: [180, 40, 150, 60], verifier: [96, 150], reference: [264, 150], fixer: [96, 370], tester: [264, 370] },
      compare: [180, 260, 36], done: [238, 432, 52, 30],
      arrows: [["M150 70 L112 116"], ["M210 70 L248 116"], ["M112 183 L156 230"], ["M248 183 L204 230"],
        ["M160 290 L118 336", "sd-differ"], ["M200 290 L242 336", "sd-same"],
        ["M21 370 L8 370 L8 150 L19 150", "sd-fix"], ["M339 370 L352 370 L352 40 L257 40", "sd-test"], ["M264 401 L264 430", "sd-done"]],
      labels: [[180, 98, "each test"], [70, 214, "its routes", null, "start"], [290, 214, "real routes", null, "end"],
        [124, 312, "no", "sd-differ", "end"], [236, 312, "yes", "sd-same", "start"],
        [14, 262, "fixes rules", "sd-fix", "start"], [346, 262, "harder test", "sd-test", "end"], [210, 452, "none left", "sd-done", "end"]] },
  };

  function loopSvg(L, cls) {
    const id = "sd" + ++uid;
    const svg = s("svg.sysdiag." + cls, { viewBox: L.vb, role: "img", focusable: "false",
      "aria-label": "Each test network goes to the verifier and to the reference. Their routes are compared. If they differ, an AI fixer edits the verifier's rules. If they agree, an AI tester looks for a harder test network. The run ends when the tester finds none." });
    // One arrowhead per colour (context-stroke is not universal).
    svg.appendChild(s("defs", null, ["plain", "bad", "good"].map((tone) =>
      s("marker", { id: id + "-" + tone, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse", markerUnits: "userSpaceOnUse" },
        s("path.sd-head-" + tone, { d: "M0 0 L10 5 L0 10 z" })))));
    const toneOf = (c) => (/sd-(differ|fix)/.test(c || "") ? "bad" : /sd-(same|test|done)/.test(c || "") ? "good" : "plain");
    const box = ([cx, cy, w, h], ic, title, sub, c) => {
      w = w || L.w; h = h || L.h;
      return s("g.sd-box" + (c ? "." + c : ""), null,
        s("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 8 }),
        icon(ic, 30, cx - w / 2 + 11, cy - 15),
        s("text.sd-title", { x: cx - w / 2 + 50, y: cy - 3, text: title }),
        s("text.sd-sub", { x: cx - w / 2 + 50, y: cy + 15, text: sub }));
    };
    const B = L.boxes, [ccx, ccy, cr] = L.compare, [dx, dy, dw, dh] = L.done;
    // Flows first, so boxes sit on top of their ends.
    svg.append(...L.arrows.map(([d, c]) => s("path.sd-flow" + (c ? "." + c : ""), { d, "marker-end": "url(#" + id + "-" + toneOf(c) + ")" })));
    svg.append(
      box(B.tests, "stack", "Tests", "small networks"),
      box(B.verifier, "rules", "Verifier", "its rules", "sd-verifier"),
      box(B.reference, "server", "Reference", "a simulator"),
      box(B.fixer, "robot", "AI fixer", "edits the rules"),
      box(B.tester, "robot", "AI tester", L.testerSub || "finds harder tests"),
      s("g.sd-compare", null, s("circle", { cx: ccx, cy: ccy, r: cr }),
        s("text.sd-title", { x: ccx, y: ccy - 3, "text-anchor": "middle", text: "same" }),
        s("text.sd-title", { x: ccx, y: ccy + 14, "text-anchor": "middle", text: "routes?" })),
      s("g.sd-donebox", null, s("rect", { x: dx, y: dy, width: dw, height: dh, rx: dh / 2 }),
        s("text.sd-title", { x: dx + dw / 2, y: dy + dh / 2 + 5, "text-anchor": "middle", text: "done" })));
    svg.append(...L.labels.map(([x, y, text, c, anchor]) =>
      s("text.sd-label" + (c ? "." + c : ""), { x, y, "text-anchor": anchor || "middle", text })));
    return svg;
  }

  function systemDiagram() {
    return h("figure.sysfig", null,
      h("div.sysfig-frame", null, loopSvg(LOOP.wide, "sd-wide"), loopSvg(LOOP.tall, "sd-tall")),
      h("figcaption", { text: "The verifier and the reference answer the same test networks. Where their routes differ, the AI fixer edits the verifier's rules; where they agree, the AI tester looks for a harder network. The run ends when it finds none." }));
  }

  // ---------- page top (story and explorer) ----------

  function crumbs(ctx, on) {
    return h("nav.crumbs", { "aria-label": "Pages" },
      h("button.btn-quiet", { type: "button", "data-focus-key": "home", on: { click: on.home } }, "← " + TITLE),
      h("button.btn-quiet", { type: "button", "data-focus-key": "other-level", on: { click: on.otherLevel } }, "Other example: " + ctx.other.title + " →"));
  }

  // ---------- landing ----------

  // The project page: the problem, the approach, early results and what's next, then
  // the two interactive examples.
  function landing(list, on) {
    const stats = [
      ["blocks", "3", "features taught to a 3,000-line verifier: OSPF areas, BGP route reflection, and VPNs"],
      ["check", "6 runs", "all ended in full agreement with the reference on every test (with a smaller AI model, the runs never got there)"],
      ["coin", "$19–42", "of AI usage per run, with no expert in the loop"],
    ];
    const next = [
      ["magnifier", "Is passing every test enough?", "Tests check one network at a time; a verifier must be right for all of them. We want ways to know when the tests cover enough."],
      ["stopwatch", "Fast, not just correct", "Two versions that give the same answers can differ by more than 1000× in speed. The loop should improve speed too."],
      ["bars", "More than where traffic goes", "Operators also care about what happens while routing settles, and about how loaded links get."],
      ["share", "One verifier per network?", "If a faithful verifier costs days and tens of dollars, every network could grow its own, and share its hardest tests with others."],
    ];
    const section = (id, title, ...kids) => h("section.proj-sec", { "aria-labelledby": id }, h("h2#" + id + ".proj-h", { id, text: title }), kids);
    return h("div.screen.landing.wrap", null,
      h("header.proj-hero", null,
        h("h1#landing-title.display", { id: "landing-title", tabindex: "-1", text: TITLE }),
        h("p.authors", { text: "Ioannis Protogeros, Tibor Schneider, Laurent Vanbever" }),
        h("p.affil", { text: "ETH Zürich" }),
        h("p.venue", { text: "HotNets 2026" }),
        h("div.hero-links", null,
          h("a.pill", { href: "https://arxiv.org/abs/2608.11340" }, svgIcon("rules"), "Paper (arXiv)"),
          // A button, not a #fragment link: the hash names the page's place (see story.js).
          h("button.pill", { type: "button", "data-focus-key": "jump-try", on: { click: () => {
            const el = document.getElementById("p-try");
            if (el) { el.scrollIntoView({ block: "start" }); el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
          } } }, svgIcon("net"), "Interactive examples ↓"))),
      section("p-problem", "The problem",
        h("p.lead", { text: "A network verifier checks a network's configuration before it goes live: will traffic still get through if any link fails, whatever routes the neighbors announce? A simulator can answer that for one failure at a time; a verifier answers for all of them at once. To do so, it needs rules for how routing works. Today experts write those rules by hand, feature by feature, and real routers often differ from the standards. Keeping them complete and correct never ends, so most networks are never verified." }),
        h("div.contrast", { role: "img", "aria-label": "Hand-written rules do not match what real routers do." },
          h("div.contrast-item", null, svgIcon("pencil"), h("span", { text: "Rules written by hand, feature by feature" })),
          h("span.contrast-neq", { "aria-hidden": "true", text: "≠" }),
          h("div.contrast-item", null, svgIcon("server"), h("span", { text: "What real routers do, per vendor and version" })))),
      section("p-approach", "Our approach",
        h("p.lead", { text: "Let an AI write the verifier's rules, and check them against the real thing. A reference, such as a network simulator or emulated routers, shows how a test network actually routes. Every disagreement shows the AI what to fix." }),
        systemDiagram(),
        h("ul.stats", { "aria-label": "Early results" }, stats.map(([ic, n, d]) => h("li", null, svgIcon(ic), h("strong", { text: n }), h("span", { text: d }))))),
      section("p-next", "What's next",
        h("ul.next", null, next.map(([ic, t, d]) => h("li", null, svgIcon(ic), h("div", null, h("strong", { text: t }), h("span", { text: d })))))),
      section("p-try", "See it happen",
        h("p.lead", { text: "Follow one real run through three versions of the verifier: before the AI added the feature, midway, and at the end. For each, guess what it does on a network where it goes wrong, then see why and how the AI fixed it." }),
        h("div.level-grid", null, list.map((L, i) => {
          const story = L.data.cards[HSA.model.cardIndex(L.data, L.data.story_card)] || L.data.cards[0];
          return h("article.level-card", null,
            h("div.level-art", { "aria-hidden": "true" }, drawNet(story, L.content.layout[story.id], { mini: true, level: L.key })),
            h("p.kicker", { text: "Example " + (i + 1) + " · reference: " + L.content.oracleName }),
            h("h3", { text: L.content.title }),
            richText("p", L.content.intro),
            h("button.btn-primary", { type: "button", "data-focus-key": "open-" + L.key, on: { click: () => on.openLevel(L.key) } }, "Start →"));
        }))));
  }

  // ---------- every router's answer (folded tables) ----------

  const fromOf = (e) => (e && e.from ? e.from : null);
  const igpRow = (r) => ({ nh: r && Array.isArray(r.nh) ? r.nh.slice().sort() : [], cost: r && r.nh && r.nh.length ? r.cost : null });
  const sameIgp = (a, b) => JSON.stringify(igpRow(a)) === JSON.stringify(igpRow(b));
  const qPair = (q) => (q && q.kind === "next_hop" ? q.src + "->" + q.dst : null);

  // Rows for both sides: [{key, label, isQ, diff, oracle:[cells], model:[cells]|null}].
  // A cell is a string, or null for "no route" / "unreachable". Pure (no DOM); with no
  // usable model (crash, unsat, missing) no row is marked as differing.
  function compareRows(levelKey, card, result, v) {
    const ve = result.versions[v];
    const m = ve.model && !ve.model.unsat ? ve.model : null;
    const q = ve.question;
    if (levelKey === "ospf") {
      const oi = result.oracleIgp || {};
      const keys = Object.keys(oi);
      const qp = qPair(q);
      if (qp && !keys.includes(qp)) keys.push(qp);
      const mi = m && m.igp ? m.igp : {};
      return keys.map((k) => {
        const [src, dst] = k.split("->");
        const o = igpRow(oi[k]);
        // The verifier's rows hold only the pairs that differ, plus the question pair.
        const mr = Object.prototype.hasOwnProperty.call(mi, k) ? igpRow(mi[k]) : o;
        const cells = (r) => (r.nh.length ? [r.nh.join(" + "), String(r.cost)] : null);
        return { key: k, label: src + " → " + dst, isQ: k === qp, diff: !!m && !sameIgp(o, mr),
          oracle: cells(o), model: m ? cells(mr) : null };
      });
    }
    const oracle = result.oracle;
    const names = card.net.routers.filter((r) => !r.external).map((r) => r.name);
    for (const n of Object.keys(oracle)) if (!names.includes(n)) names.push(n);
    const bgp = m && m.bgp ? m.bgp : {};
    return names.map((n) => {
      const o = oracle[n];
      const mf = fromOf(bgp[n]);
      return { key: n, label: n, isQ: !!q && q.router === n, diff: !!m && fromOf(o) !== mf,
        oracle: o ? [o.from] : null, model: mf ? [mf] : null };
    });
  }

  function sideTable(levelKey, rows, side) {
    const isO = side === "oracle";
    const heads = levelKey === "ospf" ? ["from → to", "first hop", "cost"] : ["router", "gets it from"];
    const none = levelKey === "ospf" ? "can't reach" : "no route";
    return h("div.table-wrap", null,
      h("table.rib.cmp", null,
        h("thead", null, h("tr", null, heads.map((t) => h("th", { scope: "col", text: t })))),
        h("tbody", null, rows.map((r) => {
          const cells = isO ? r.oracle : r.model;
          return h("tr" + (cells ? "" : ".none") + (r.isQ ? ".is-q" : "") + (r.diff ? ".is-diff" : ""), null,
            h("th", { scope: "row" },
              h("span.rowname", { text: r.label }),
              r.isQ ? h("span.qtag", null, h("span", { "aria-hidden": "true", text: "?" }), h("span.sr", { text: " (in the question)" })) : null,
              r.diff ? h("span.dtag", null, h("span", { "aria-hidden": "true", text: "✗" }), h("span.sr", { text: " (differs)" })) : null),
            cells ? cells.map((c) => h("td", { text: c }))
              : h("td", { colspan: heads.length - 1 }, none));
        }))));
  }

  function compare(levelKey, content, card, result, v) {
    const ve = result.versions[v];
    const m = ve.model;
    const vname = content.versions[v].name;
    const rows = compareRows(levelKey, card, result, v);
    const crashed = result.cells[v].status === "panic";
    let right;
    if (crashed || !m) right = h("p.cmp-note", { text: crashed ? "The verifier crashed on this network." : "No answer recorded for this version." });
    else if (m.unsat) right = h("p.cmp-note", { text: "The verifier found no consistent answer at all on this network." });
    else right = sideTable(levelKey, rows, "model");
    const nDiff = rows.filter((r) => r.diff).length;
    return h("div.compare-block", null,
      h("div.compare", null,
        h("div.side.side-oracle", null, h("h4.label", { text: content.oracleName + " (reference)" }), sideTable(levelKey, rows, "oracle")),
        h("div.side.side-model", null, h("h4.label", { text: "Verifier (" + vname + ")" }), right)),
      h("p.cmp-key", null,
        h("span.qtag", { "aria-hidden": "true", text: "?" }), " in the question",
        h("span.cmp-key-sep", { "aria-hidden": "true", text: " · " }),
        h("span.dtag", { "aria-hidden": "true", text: "✗" }), " " + (nDiff ? plural(nDiff, "row differs", "rows differ") : "no row differs")));
  }

  // ---------- panels ----------

  // What the verifier says on a network in version v: the network's own line when the
  // content has one, otherwise the version's.
  function verifierSays(content, card, v) {
    const vs = content && content.verifierSays;
    if (!vs) return null;
    const own = vs[card.id] && vs[card.id][String(v)];
    return own || (vs.default && vs.default[v]) || null;
  }

  // The verifier as a small cartoon owl holding a magnifying glass, with ∀ ("for all")
  // on its chest: a verifier answers for every case at once. Its face follows the mood:
  // 0 sure of itself (the start), 1 sure but quizzical (midway), 2 wondering (the end),
  // "learned" wide-eyed after a counterexample.
  function mascot(mood) {
    const up = mood === 2 ? -3 : 0, wide = mood === "learned";
    const er = wide ? 11.5 : 10.5, pr = wide ? 5.5 : 4.5;
    const brows = {
      0: [s("path.m-line", { d: "M21 33 Q31 29 40 33" }), s("path.m-line", { d: "M44 33 Q53 29 63 33" })],
      1: [s("path.m-line", { d: "M22 30 L40 32" }), s("path.m-line", { d: "M44 30 Q53 23 62 28" })],
      2: [s("path.m-line", { d: "M22 28 Q31 24 39 28" }), s("path.m-line", { d: "M45 28 Q53 24 62 28" }), s("text.m-mark", { x: 70, y: 16, text: "?" })],
      learned: [s("path.m-line", { d: "M22 25 Q31 20 39 25" }), s("path.m-line", { d: "M45 25 Q53 20 62 25" }), s("text.m-mark", { x: 70, y: 16, text: "!" })],
    }[mood];
    // A sure owl's eyes are half closed: a lid over the top of each.
    const lids = mood === 0 ? [32, 52].map((cx) => s("path.m-lid", { d: "M" + (cx - er) + " 38 A" + er + " " + er + " 0 0 1 " + (cx + er) + " 38 Z" })) : [];
    const beak = wide
      ? [s("path.m-beak", { d: "M37 50 L47 50 L42 54 Z" }), s("path.m-beak", { d: "M38.5 56 L45.5 56 L42 60 Z" })]
      : [s("path.m-beak", { d: "M37 50 L47 50 L42 57 Z" })];
    return s("svg.mascot", { viewBox: "0 0 90 100", width: 90, height: 100, "aria-hidden": "true", focusable: "false" },
      s("path.m-body", { d: "M22 28 L18 10 L33 20 Q42 17 51 20 L66 10 L62 28 Q72 40 72 58 C72 82 60 94 42 94 C24 94 12 82 12 58 Q12 40 22 28 Z" }),
      s("path.m-line", { d: "M16 58 Q10 72 20 82" }),
      s("ellipse.m-belly", { cx: 42, cy: 75, rx: 15, ry: 13 }),
      s("text.m-forall", { x: 42, y: 82, "text-anchor": "middle", text: "∀" }),
      [32, 52].map((cx) => s("circle.m-eyeball", { cx, cy: 40, r: er })),
      [32, 52].map((cx) => s("circle.m-eye", { cx: cx + (mood === 1 ? 1.5 : 0), cy: 41 + up, r: pr })),
      [32, 52].map((cx) => s("circle.m-glint", { cx: cx + 1.8 + (mood === 1 ? 1.5 : 0), cy: 39 + up, r: 1.5 })),
      lids, brows, beak,
      s("path.m-line", { d: "M64 62 Q70 60 72 54" }),
      s("circle.m-lens", { cx: 77, cy: 47, r: 8 }),
      s("path.m-feet", { d: "M33 94 L31 98 M35 94 L35 98 M37 94 L39 98 M47 94 L45 98 M49 94 L49 98 M51 94 L53 98" }));
  }

  // The verifier after a counterexample, saying what it learned from it; null when the
  // content has no line for this network and version.
  function learnedPanel(content, card, v) {
    const t = verifierLearns(content, card, v);
    if (!t) return null;
    return h("div.says.says-learned", null, mascot("learned"),
      h("p.bubble", null, h("span.sr-only", { text: "What the verifier learns: " }), t));
  }

  function verifierLearns(content, card, v) {
    const vl = content && content.verifierLearns;
    return (vl && vl[card.id] && vl[card.id][String(v)]) || null;
  }

  // The verifier, with a speech bubble saying what it believes on this network.
  function saysPanel(content, card, v) {
    const text = verifierSays(content, card, v);
    if (!text) return null;
    return h("div.says", null, mascot(v),
      h("p.bubble", null, h("span.sr-only", { text: "The verifier (" + content.versions[v].name + " version) says: " }), text));
  }

  // The network itself: routers, links, costs or areas, sessions, failures; no routes.
  function configFigure(levelKey, content, card, oi, v) {
    const failures = card.states[oi].failures;
    const q = card.questions ? card.questions[v] : null;
    const net = { level: levelKey, failures, asked: asksRouters(q), ids: levelKey === "rr" };
    return h("figure.netfig", null, drawNet(card, content.layout[card.id], net),
      legend(levelKey, card, failures, { asked: q ? "in the question" : null, ids: net.ids }));
  }

  // One side's answer on a faint copy of the network: the reference's route, or the
  // verifier's ("?" until revealed). f is revealFacts for the same cell. OSPF draws the
  // first hop only: the data records next hops for the question's pair, not whole paths.
  function answerFigure(levelKey, content, card, oi, v, side, revealed, f, valueTags) {
    const st = card.states[oi];
    const q = card.questions[v];
    const isRef = side === "oracle";
    const hidden = !isRef && !revealed;
    const chain = hidden ? null : routeChain(levelKey, card, st, v, isRef ? "oracle" : "verifier");
    const edges = routeEdges(levelKey, chain);
    const net = { level: levelKey, failures: st.failures, answer: true, unknown: hidden, asked: asksRouters(q), tags: {},
      routeDir: levelKey === "rr" ? "reverse" : "forward",
      routes: isRef ? { oracle: edges, model: [] } : { oracle: [], model: edges } };
    const at = q.kind === "next_hop" ? q.src : q.router;
    if (chain && chain.length < 2) net.tags[at] = "∅ " + (levelKey === "ospf" ? "can't reach" : "no route");
    if (isRef && revealed) for (const [n, t] of Object.entries(valueTags || {})) if (!net.tags[n]) net.tags[n] = { text: t, kind: "value" };
    let what;
    if (isRef) what = answerClause(levelKey, q, f.oracleAnswer, at);
    else if (hidden) what = "your guess";
    else what = f.answer !== null ? answerClause(levelKey, q, f.answer, at) : "no answer";
    const who = isRef ? content.oracleName + " (reference)" : "Verifier (" + content.versions[v].name + ")";
    return h("figure.answer-fig" + (isRef ? ".is-ref" : ".is-model") + (hidden ? ".is-hidden" : ""), null,
      h("figcaption", null, h("span.af-who", { text: who }), h("span.af-what", { text: what })),
      drawNet(card, content.layout[card.id], net));
  }

  // "4–5, 7" for the rule ids 1..max that a rulebook skips.
  function idRanges(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      let j = i;
      while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
      out.push(i === j ? String(ids[i]) : ids[i] + "–" + ids[j]);
      i = j;
    }
    return out.join(", ");
  }

  // One line naming the ids a version's rulebook skips, or null when it skips none.
  function ruleGapText(versions, v) {
    const rules = (versions[v] && versions[v].rules) || [];
    const have = new Set(rules.map((r) => r.id));
    const max = Math.max(0, ...have);
    const gaps = [];
    for (let i = 1; i <= max; i++) if (!have.has(i)) gaps.push(i);
    if (!gaps.length) return null;
    const later = new Set(versions.slice(v + 1).flatMap((x) => (x.rules || []).map((r) => r.id)));
    const one = gaps.length === 1;
    const name = (one ? "Rule " : "Rules ") + idRanges(gaps);
    return gaps.every((g) => later.has(g))
      ? name + (one ? " appears" : " appear") + " in later versions."
      : name + (one ? " is" : " are") + " not used in this version.";
  }

  // A version's numbered rules. A rule that differs from how the reference really
  // behaves carries a "✗ <reference>: …" line; lit = {rule, kind: "mistake" | "decides"}
  // lights one rule.
  function rulebook(content, v, lit) {
    const versions = content.versions;
    const ver = versions[v];
    const prevName = v > 0 ? versions[v - 1].name : null;
    const gap = ruleGapText(versions, v);
    const rules = Array.isArray(ver.rules) ? ver.rules : [];
    const anyBadge = rules.some((r) => r.change === "new" || r.change === "changed");
    return h("section.panel.rulebook", { "aria-labelledby": "rules-title" },
      h("h2#rules-title.label", { id: "rules-title", text: "The verifier's rules (" + ver.name + ")" }),
      anyBadge && prevName ? h("p.rules-sub", { text: "Marked: what changed since the " + prevName + " version." }) : null,
      h("ol.rules", null, rules.map((r) => {
        const kind = lit && r.id === lit.rule ? lit.kind : null;
        const badgeText = r.change === "new" ? "new" : r.change === "changed" ? "changed" : null;
        return h("li.rule-item" + (kind === "mistake" ? ".is-mistake" : kind ? ".is-decider" : ""), null,
          h("span.rule-num", { "aria-hidden": "true", text: String(r.id) }),
          h("span.rule-body", null,
            h("span.sr", { text: "Rule " + r.id + ": " }),
            richText("span.rule-text", r.text),
            r.wrong ? h("span.rule-wrong", null, h("span", { "aria-hidden": "true", text: "✗ " }), noteText(r.wrong)) : null,
            badgeText || kind
              ? h("span.rule-tags", null,
                badgeText ? h("span.rbadge.rbadge-" + badgeText, { text: badgeText }) : null,
                kind === "mistake" ? h("span.rbadge.rbadge-mistake", null, h("span", { "aria-hidden": "true", text: "✗ " }), "causes the mistake") : null,
                kind === "decides" ? h("span.rbadge.rbadge-decides", null, h("span", { "aria-hidden": "true", text: "▸ " }), "decides here") : null)
              : null));
      })),
      ver.missing ? h("p.rules-missing", null, h("span", { "aria-hidden": "true", text: "✗ " }), noteText(ver.missing)) : null,
      gap ? h("p.rules-gap", { text: gap }) : null,
      content.rulesNote ? h("p.rules-gap", { text: content.rulesNote }) : null);
  }

  // "The verifier does X, while it should actually do Y.": the correction in bold.
  function noteText(note) {
    const cut = note.indexOf(", while it should actually ");
    if (cut < 0) return note;
    return h("span", null, note.slice(0, cut) + ", ", h("strong", { text: note.slice(cut + 2) }));
  }

  function diffPre(text) {
    const pre = h("pre.diff", { tabindex: "0", "aria-label": "Abridged diff" });
    const code = h("code");
    String(text).split("\n").forEach((line, i, all) => {
      const c = line[0];
      const cls = c === "+" ? "add" : c === "-" ? "del" : line.trim() === "…" ? "gap" : "ctx";
      code.appendChild(h("span." + cls, { text: line + (i < all.length - 1 ? "\n" : "") }));
    });
    pre.appendChild(code);
    return pre;
  }

  // How the AI fixed version v: the rules it changed, before and after, then the diff.
  function fixBlock(content, v) {
    const ver = content.versions[v], next = content.versions[v + 1];
    const rv = ver && ver.reveal;
    if (!rv || !next) return null;
    const found = rv.proposals > 0
      ? "The AI tester came up with this network in round " + rv.round + " of the run; the AI fixer then changed the rules."
      : "The starting tests already caught this; the AI fixer changed the rules in round " + rv.round + " of the run.";
    return h("div.fix", null,
      h("h3.label", { text: "How the AI fixed it" }),
      h("ol.rchanges", null, ruleChanges(content.versions, v).map((c) => h("li.rchange", null,
        h("span.rule-num", { "aria-hidden": "true", text: String(c.id) }),
        h("div.rchange-body", null,
          h("span.sr", { text: "Rule " + c.id + ": " }),
          h("p.rbefore", null, h("span.rwho", { text: "before" }),
            c.before === null ? h("span.rnone", { text: "(no such rule)" }) : h("span", { text: c.before })),
          h("p.rafter" + (c.stillWrong ? ".still-wrong" : ""), null, h("span.rwho", { text: "after" }),
            h("span", null, c.after, c.stillWrong ? h("span.still-note", { text: " Still not quite right: see the " + content.versions[v + 1].name + " version." }) : null)))))),
      h("p.found", { text: found }),
      h("details.more", null, h("summary", { text: "See the AI's code change" }), diffPre(rv.excerpt)));
  }

  // The question and its answer buttons; once answered (or shown), the reveal.
  function quizPanel(ctx, on, ci, oi, v, opts) {
    const o = opts || {};
    const { data, content, levelKey } = ctx;
    const card = data.cards[ci];
    const vname = content.versions[v].name;
    const f = revealFacts(levelKey, data, content, ci, oi, v);
    const q = card.questions[v];
    const qt = quizText(levelKey, content, q, f.oracleAnswer, vname);
    const guess = ctx.guess;
    const revealed = guess !== undefined;
    const choices = (card.choices && card.choices[v]) || [];

    const tags = f.mistake && f.mistake.tags;
    const ask = h("section.panel.quiz", { "aria-labelledby": "quiz-q" },
      h("p.normally", { text: qt.normally }),
      h("div.answer-figs", null,
        answerFigure(levelKey, content, card, oi, v, "oracle", revealed, f, tags),
        answerFigure(levelKey, content, card, oi, v, "verifier", revealed, f, tags)),
      h("p.quiz-q", { id: "quiz-q", text: qt.ask }),
      h("div.choice-buttons", { role: "group", "aria-labelledby": "quiz-q" }, choices.map((c, i) =>
        h("button.btn-choice", { type: "button", "aria-pressed": guess === c ? "true" : "false", disabled: revealed,
          "data-focus-key": "choice-" + i, on: { click: () => on.guess(c) } }, answerText(levelKey, c)))),
      revealed ? null : h("p.just-show", null, h("button.linklike", { type: "button", "data-focus-key": "show", on: { click: () => on.guess("") } }, "Just show me")));

    if (!revealed) return ask;
    const m = f.mistake;
    const right = guess && guess === f.answer;
    const reveal = h("section.panel.reveal-box" + (f.broke ? ".is-broke" : ".is-held"), { "aria-labelledby": "reveal-title" },
      guess ? h("p.guessed" + (right ? ".right" : ".wrong"), { text: right
        ? "You were right: the verifier does say " + answerText(levelKey, guess) + "."
        : "Not quite: you guessed " + answerText(levelKey, guess) + ", but the verifier says " + answerText(levelKey, f.answer) + "." }) : null,
      h("h2#reveal-title.headline", { id: "reveal-title", tabindex: "-1" },
        h("span.oicon", { "aria-hidden": "true", text: f.broke ? "✗" : "✓" }), h("span", { text: f.headline })),
      m ? h("div.why", null,
        h("p.why-row", null, h("span.rule-ref", { text: "rule " + m.rule }), " ", h("span", { text: m.why })),
        h("p.why-row.why-ref", null, h("strong", { text: content.oracleName + ": " }), h("span", { text: m.reference })))
        : null,
      m ? learnedPanel(content, card, v) : null,
      m && v < 2 ? fixBlock(content, v) : null,
      o.closing,
      h("details.more", null, h("summary", { text: "Every router's answer" }), compare(levelKey, content, card, f.result, v)));
    return [ask, reveal];
  }

  const netPanel = (title, blurb, fig, radios, says) => h("section.panel.netpanel", { "aria-labelledby": "card-title" },
    h("h2#card-title.card-title", { id: "card-title", text: title }), blurb ? richText("p.card-blurb", blurb) : null, says || null, fig, radios || null);

  // ---------- story ----------

  function progress(ctx, on) {
    const { content, place, levelKey } = ctx;
    return h("nav.progress", { "aria-label": "Versions" }, h("ol.pgroups", null, content.versions.map((ver, v) => {
      const cur = v === place.v;
      return h("li", null, h("button.pdot" + (cur ? ".is-current" : "") + (v < place.v ? ".is-done" : ""), {
        type: "button", "aria-current": cur ? "step" : null, "data-focus-key": "p-" + v,
        on: { click: () => on.go({ screen: "story", level: levelKey, v, step: 0 }) },
      }, h("span.pdot-label", { text: (v + 1) + " · " + ver.name })));
    })));
  }

  function closingNote(content) {
    const note = content.twist ? ["A twist", content.twist] : content.bonus ? ["Also", content.bonus] : null;
    return h("div.closing", null,
      richText("p.endtext", content.endText),
      note ? h("aside.note", { "aria-label": note[0] }, h("p.kicker", { text: note[0] }), richText("p", note[1])) : null);
  }

  // Key terms and marks for the example, open on the first version.
  function howTo(content, open) {
    const items = content.howto || [];
    if (!items.length) return null;
    return h("details.howto", { open: !!open },
      h("summary", { text: "New here? How to read this example" }),
      h("ul", null, items.map(([term, text]) => h("li", null, h("strong", { text: term + ": " }), richText("span", text)))));
  }

  function story(ctx, on) {
    const { data, content, levelKey, place, steps } = ctx;
    const st = steps[place.v][0];
    const v = st.v;
    const ver = content.versions[v];
    const card = data.cards[st.card];
    const oi = st.option;
    const revealed = ctx.guess !== undefined;
    const f = revealFacts(levelKey, data, content, st.card, oi, v);
    const ct = cardText(content, card);
    const lit = revealed && f.rule !== null ? { rule: f.rule, kind: f.mistake ? "mistake" : "decides" } : null;
    const optLabel = card.options.length > 1 ? " · " + optionText(card.options[oi].label) : "";

    const nav = h("div.storynav", null,
      v > 0
        ? h("button.btn-quiet", { type: "button", "data-focus-key": "back", on: { click: () => on.go({ screen: "story", level: levelKey, v: v - 1, step: 0 }) } }, "← " + content.versions[v - 1].name + " version")
        : h("button.btn-quiet", { type: "button", "data-focus-key": "back", on: { click: on.home } }, "← Project page"),
      h("button.btn-secondary", { type: "button", "data-focus-key": "explore", on: { click: () => on.explore({ v, card: card.id, option: oi }) } }, "Try another network"),
      v < 2
        ? h("button.btn-primary", { type: "button", "data-focus-key": "next", on: { click: () => on.go({ screen: "story", level: levelKey, v: v + 1, step: 0 }) } }, "Next: " + content.versions[v + 1].name + " version →")
        : h("button.btn-primary", { type: "button", "data-focus-key": "next", on: { click: on.otherLevel } }, "Next example: " + ctx.other.title + " →"));

    return h("section.screen.story.wrap", { "aria-labelledby": "step-title" },
      crumbs(ctx, on),
      progress(ctx, on),
      h("div.step-head", null,
        h("p.kicker", { text: content.title + " · version " + (v + 1) + " of 3" }),
        h("h1#step-title.display-sm", { id: "step-title", tabindex: "-1", text: ver.name + " version" }),
        h("p.step-lead", { text: ver.blurb }),
        howTo(content, v === 0)),
      h("div.bench", null,
        netPanel(ct.title + optLabel, ct.blurb, configFigure(levelKey, content, card, oi, v), null, saysPanel(content, card, v)),
        rulebook(content, v, lit)),
      quizPanel(ctx, on, st.card, oi, v, { closing: v === 2 ? closingNote(content) : null }),
      nav);
  }

  // ---------- explorer ----------

  function explore(ctx, on) {
    const { data, content, levelKey, place } = ctx;
    const v = place.v, ci = place.cardIdx, oi = place.option;
    const card = data.cards[ci];
    const revealed = ctx.guess !== undefined;
    const f = revealFacts(levelKey, data, content, ci, oi, v);
    const lit = revealed && f.rule !== null ? { rule: f.rule, kind: f.mistake ? "mistake" : "decides" } : null;
    const go = (patch) => on.go(Object.assign({ screen: "explore", level: levelKey, v, card: card.id, option: oi }, patch));
    const ct = cardText(content, card);

    const tabs = h("div.vtabs", { role: "group", "aria-label": "Version" }, content.versions.map((ver, i) =>
      h("button.vtab", { type: "button", "aria-pressed": i === v ? "true" : "false", "data-focus-key": "vt-" + i, on: { click: () => go({ v: i }) } }, ver.name)));

    const strip = h("div.strip", { role: "group", "aria-label": "Networks" }, data.cards.map((c, i) => {
      const t = cardText(content, c);
      return h("button.tile" + (i === ci ? ".is-selected" : ""), {
        type: "button", "aria-pressed": i === ci ? "true" : "false", "data-focus-key": "card-" + i,
        on: { click: () => { if (i !== ci) go({ card: c.id, option: 0 }); } },
      },
        h("span.tile-art", null, drawNet(c, content.layout[c.id], { mini: true, level: levelKey, failures: i === ci ? card.states[oi].failures : [] })),
        h("span.tile-title", { text: t.title }),
        richText("span.tile-blurb", t.blurb));
    }));

    const radios = card.options.length > 1
      ? h("fieldset.failures", null,
        h("legend.label", { text: "Links" }),
        card.options.map((op, o) => h("label.radio", null,
          h("input", { type: "radio", name: "failure", value: String(o), checked: o === oi, "data-focus-key": "opt-" + o,
            on: { change: () => go({ option: o }) } }),
          h("span", { text: optionText(op.label) }))))
      : null;

    return h("section.screen.explore.wrap", { "aria-labelledby": "step-title" },
      crumbs(ctx, on),
      h("div.step-head", null,
        h("p.kicker", { text: content.title + " · try another network" }),
        h("h1#step-title.display-sm", { id: "step-title", tabindex: "-1", text: "Try another network" }),
        h("p.step-lead", { text: "Pick a version and a network, then guess what the verifier does. Some networks trip it up; most don't." }),
        h("div.explore-bar", null, tabs,
          h("button.btn-quiet", { type: "button", "data-focus-key": "to-story", on: { click: on.backToStory } }, "← Back to the story"))),
      strip,
      h("div.bench", null,
        netPanel(ct.title, ct.blurb, configFigure(levelKey, content, card, oi, v), radios, saysPanel(content, card, v)),
        rulebook(content, v, lit)),
      quizPanel(ctx, on, ci, oi, v));
  }

  HSA.view = { h, drawNet, landing, story, explore, compareRows,
    routeChain, routeEdges, deciderFor, mistakeFor, routerIds, ridLabel,
    hopShape, chipSpots, idSpots, areaRegions, verifierSays, verifierLearns, positions, VIEW, ruleGapText, ruleChanges, TITLE,
    cardText, optionText, answerText, quizText, revealFacts };
})(globalThis);
