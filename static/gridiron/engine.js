/* Gridiron — browser query engine.
 *
 * A line-for-line port of query_engine.py (parse + run) that works on the
 * columnar table in data.json instead of a pandas frame. The VOCABULARY
 * (aliases, positions, display names, direction, percent sets), the RANK
 * RULES and the COLUMN RULES are not written here: they are read from
 * data.json's meta block, which export_gridiron.py copies out of the Python
 * modules. tests/test_gridiron_parity.py runs the same questions through both
 * engines and diffs the answers, so this file cannot quietly drift.
 *
 * Works in the browser (window.Gridiron) and in Node (module.exports). */
(function (root) {
  "use strict";

  class QueryError extends Error { }

  // ---- rapidfuzz.fuzz.ratio: 100 * (1 - indel_distance / (len a + len b)),
  // indel distance = len a + len b - 2 * LCS. Default processor = none.
  function lcsLen(a, b) {
    const m = a.length, n = b.length;
    if (!m || !n) return 0;
    let prev = new Array(n + 1).fill(0), cur = new Array(n + 1).fill(0);
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  function ratio(a, b) {
    const tot = a.length + b.length;
    if (!tot) return 100;
    return 100 * (1 - (tot - 2 * lcsLen(a, b)) / tot);
  }

  function makeEngine(meta) {
    const ALIASES = meta.aliases;                 // [[phrase, col], ...] in Python order
    const POSITIONS = meta.positions;
    const DISPLAY = meta.display;
    const ASC_GOOD = new Set(meta.ascending_good);
    const PCT = new Set(meta.pct_stats);
    const PP = new Set(meta.pp_stats || []);
    const posWords = Object.keys(POSITIONS).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const posRegex = posWords.map((w) => [w, new RegExp("\\b" + esc(w) + "\\b")]);
    const num = (x) => (x == null ? null : Number(x));
    const disp = (col) => DISPLAY[col] || col;
    const g = (v) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 6, useGrouping: false });   // python %g-ish

    function findStat(text, start) {
      start = start || 0;
      const search = text.slice(start).trim();
      if (!search) return null;
      let best = null;
      for (const [phrase, col] of ALIASES) {
        const idx = text.indexOf(phrase, start);
        if (idx !== -1 && (best === null || idx < best[1])) best = [col, idx, idx + phrase.length];
      }
      if (best) return best;
      const words = search.split(/\s+/).filter(Boolean);
      let bestMatch = null, bestIdx = -1, bestLen = 0;
      for (const n of [3, 2, 1]) {
        for (let i = 0; i + n <= words.length; i++) {
          const chunk = words.slice(i, i + n).join(" ");
          let top = null, topScore = -1;
          for (const [phrase] of ALIASES) {
            const sc = ratio(chunk, phrase);
            if (sc >= 85 && sc > topScore) { topScore = sc; top = phrase; }
          }
          if (top) {
            const chunkIdx = text.indexOf(chunk, start);
            if (chunkIdx !== -1 && (bestMatch === null || chunkIdx < bestIdx)) { bestMatch = top; bestIdx = chunkIdx; bestLen = chunk.length; }
          }
        }
      }
      if (bestMatch) {
        const col = ALIASES.find(([p]) => p === bestMatch)[1];
        return [col, bestIdx, bestIdx + bestLen];
      }
      return null;
    }

    function parse(query) {
      const q = " " + String(query).toLowerCase().trim() + " ";
      const conds = [], notes = [];
      for (const [word, re] of posRegex) {
        if (re.test(q)) {
          const pos = POSITIONS[word];
          conds.push({ kind: "position", value: pos.codes });
          notes.push("position is " + pos.label);
          break;
        }
      }
      let m = q.match(/between (\d{4}) and (\d{4})/);
      if (m) {
        const a = +m[1], b = +m[2];
        conds.push({ kind: "season_range", min: Math.min(a, b), max: Math.max(a, b) });
        notes.push("season between " + Math.min(a, b) + " and " + Math.max(a, b));
      } else {
        m = q.match(/since (\d{4})/);
        if (m) { conds.push({ kind: "season_range", min: +m[1], max: null }); notes.push("season since " + m[1]); }
        m = q.match(/before (\d{4})/);
        if (m) { conds.push({ kind: "season_range", min: null, max: +m[1] - 1 }); notes.push("season before " + m[1]); }
        m = q.match(/\bin (\d{4})\b/);
        if (m) { conds.push({ kind: "season_range", min: +m[1], max: +m[1] }); notes.push("season is " + m[1]); }
      }
      if (/playoff|postseason/.test(q)) { conds.push({ kind: "playoffs" }); notes.push("appeared in the playoffs that season"); }

      for (const mm of q.matchAll(/led the league in /g)) {
        const st = findStat(q, mm.index + mm[0].length);
        if (st) {
          const col = st[0];
          conds.push({ kind: "rank", col, n: 1, asc: ASC_GOOD.has(col) });
          notes.push("led the league in " + disp(col));
        }
      }

      const rankStarts = [...q.matchAll(/(top|bottom)\s+\d+/g)].map((x) => x.index);
      for (const mm of q.matchAll(/(top|bottom)\s+(\d+)/g)) {
        const direction = mm[1], n = +mm[2];
        const end = mm.index + mm[0].length;
        const later = rankStarts.filter((s) => s > mm.index);
        const nxt = later.length ? Math.min(...later) : q.length;
        let stop = nxt;
        const tail = q.slice(end, nxt);
        const tm = tail.match(/\b(over|more than|at least|above|under|less than|fewer than|below|at most|who|since|before|between|led|for|on)\b|\d/);
        if (tm) stop = end + tm.index;
        const win = q.slice(end, stop);
        let pos = 0;
        for (;;) {
          const st = findStat(win, pos);
          if (!st) break;
          const [col, sStart, sEnd] = st;
          const pre = win.slice(0, sStart);
          let wantsLow;
          if (pre.includes("lowest") || pre.includes("fewest") || direction === "bottom") wantsLow = true;
          else if (pre.includes("highest") || pre.includes("most")) wantsLow = false;
          else wantsLow = ASC_GOOD.has(col);
          conds.push({ kind: "rank", col, n, asc: wantsLow });
          const arrow = wantsLow ? "lowest" : "highest";
          const word = (direction === "bottom" && !ASC_GOOD.has(col)) ? "bottom" : "top";
          notes.push(word + " " + n + " in " + disp(col) + " (" + arrow + ")");
          pos = sEnd;
        }
      }

      const threshPat = /(over|more than|at least|above|under|less than|fewer than|below|at most)\s+([\d,\.]+)/g;
      for (const mm of q.matchAll(threshPat)) {
        const opWord = mm[1], value = parseFloat(mm[2].replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;
        const end = mm.index + mm[0].length;
        let st = findStat(q.slice(end, end + 40), 0);
        if (!st) st = findStat(q.slice(Math.max(0, mm.index - 40), mm.index), 0);
        let col;
        if (!st) { if (value >= 18 && value <= 50) col = "age"; else continue; }
        else col = st[0];
        let op;
        if (["over", "more than", "above"].includes(opWord)) op = ">";
        else if (opWord === "at least") op = ">=";
        else if (["under", "less than", "fewer than", "below"].includes(opWord)) op = "<";
        else op = "<=";
        conds.push({ kind: "threshold", col, op, value });
        notes.push(disp(col) + " " + op + " " + g(value));
      }

      const postPat = /([\d,\.]+)\s*(\+|or more|or fewer|or less|or higher|or lower|or younger|or older)\s*(%|percent|years old)?/g;
      for (const mm of q.matchAll(postPat)) {
        let value = parseFloat(mm[1].replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;
        const phrase = mm[2], isPct = !!mm[3];
        const gte = ["+", "or more", "or higher", "or older"].includes(phrase);
        const end = mm.index + mm[0].length;
        const fwd = q.slice(end, end + 45);
        const cut = fwd.match(/\b(and|over|more than|at least|above|under|less than|fewer than|below|at most|who|top|bottom|since|before|between|led|for|on)\b/);
        const statWin = cut ? fwd.slice(0, cut.index) : fwd;
        let st = findStat(statWin, 0);
        if (!st) st = findStat(q.slice(Math.max(0, mm.index - 40), mm.index), 0);
        let col;
        if (!st) { if (value >= 18 && value <= 50) col = "age"; else continue; }
        else col = st[0];
        if (isPct || PCT.has(col)) value = value > 1 ? value / 100 : value;
        conds.push({ kind: "threshold", col, op: gte ? ">=" : "<=", value });
        const shown = PCT.has(col) ? g(value * 100) + "%" : g(value);
        notes.push(disp(col) + " " + (gte ? "≥" : "≤") + " " + shown);
      }

      if (!conds.length) throw new QueryError("I couldn't find anything to filter on. Try naming a position, a stat with 'top N', a threshold like 'over 4000 passing yards', or 'playoffs'.");
      return { conds, notes };
    }

    return { parse, findStat, QueryError, DISPLAY, ASC_GOOD, PCT, PP };
  }

  // ---- the table: columnar data.json -> row access + per-season ranks
  class Table {
    constructor(data) {
      this.meta = data.meta;
      this.n = data.meta.rows;
      this.cols = {};
      for (const [name, c] of Object.entries(data.cols)) {
        if (Array.isArray(c)) this.cols[name] = c;
        else {   // sparse -> dense array of nulls
          const arr = new Array(this.n).fill(null);
          for (let k = 0; k < c.i.length; k++) arr[c.i[k]] = c.v[k];
          this.cols[name] = arr;
        }
      }
      this.rankCache = new Map();
      this.engine = makeEngine(this.meta);
    }
    has(col) { return Object.prototype.hasOwnProperty.call(this.cols, col); }
    sched(season) { return season >= 2021 ? 17 : 16; }
    // fetch_data.add_ranks, per (col): rank 1 = best within each season, ties
    // share the lowest rank (pandas method="min"), only qualified rows ranked
    nativeRank(col) {
      if (this.rankCache.has(col)) return this.rankCache.get(col);
      const out = new Array(this.n).fill(null);
      const seasons = this.cols.season, vals = this.cols[col];
      const rate = (this.meta.rate_ranks || []).find((r) => r[0] === col);
      const isDesc = (this.meta.rank_desc || []).includes(col);
      if (!rate && !isDesc) { this.rankCache.set(col, null); return null; }
      const bySeason = new Map();
      for (let i = 0; i < this.n; i++) {
        const v = vals[i];
        let ok;
        if (rate) {
          const [, , qual, minimum, perGame] = rate;
          const need = perGame ? minimum * this.sched(seasons[i]) : minimum;
          const qv = this.cols[qual] ? this.cols[qual][i] : null;
          ok = v != null && (qv || 0) >= need;
        } else ok = (v || 0) > 0;
        if (!ok) continue;
        if (!bySeason.has(seasons[i])) bySeason.set(seasons[i], []);
        bySeason.get(seasons[i]).push(i);
      }
      const asc = rate ? !!rate[1] : false;
      for (const idxs of bySeason.values()) {
        idxs.sort((a, b) => asc ? vals[a] - vals[b] : vals[b] - vals[a]);
        let r = 0;
        for (let k = 0; k < idxs.length; k++) {
          if (k === 0 || vals[idxs[k]] !== vals[idxs[k - 1]]) r = k + 1;
          out[idxs[k]] = r;
        }
      }
      this.rankCache.set(col, out);
      return out;
    }
    // query_engine.run's dynamic branch: rank among rows with value > 0
    dynamicRank(col, asc) {
      const out = new Array(this.n).fill(null);
      const seasons = this.cols.season, vals = this.cols[col];
      // NOTE: pandas ranks across the WHOLE frame here (not per season) —
      // mirrored exactly, including that quirk
      const idxs = [];
      for (let i = 0; i < this.n; i++) if ((vals[i] || 0) > 0) idxs.push(i);
      idxs.sort((a, b) => asc ? vals[a] - vals[b] : vals[b] - vals[a]);
      let r = 0;
      for (let k = 0; k < idxs.length; k++) {
        if (k === 0 || vals[idxs[k]] !== vals[idxs[k - 1]]) r = k + 1;
        out[idxs[k]] = r;
      }
      void seasons;
      return out;
    }
    run(query) {
      const E = this.engine;
      const { conds, notes } = E.parse(query);
      let mask = new Uint8Array(this.n).fill(1);
      for (const c of conds) {
        if (c.kind === "position") {
          const codes = new Set(Array.isArray(c.value) ? c.value : [c.value]);
          const p = this.cols.position;
          for (let i = 0; i < this.n; i++) if (mask[i] && !codes.has(p[i])) mask[i] = 0;
        } else if (c.kind === "playoffs") {
          const p = this.cols.made_playoffs;
          for (let i = 0; i < this.n; i++) if (mask[i] && !p[i]) mask[i] = 0;
        } else if (c.kind === "season_range") {
          const s = this.cols.season;
          for (let i = 0; i < this.n; i++) {
            if (!mask[i]) continue;
            if (c.min != null && s[i] < c.min) mask[i] = 0;
            if (c.max != null && s[i] > c.max) mask[i] = 0;
          }
        } else if (c.kind === "threshold") {
          if (!this.has(c.col)) throw new E.QueryError("I don't have a '" + (E.DISPLAY[c.col] || c.col) + "' column.");
          const v = this.cols[c.col];
          const fill = c.op.includes(">") ? -1 : Infinity;
          for (let i = 0; i < this.n; i++) {
            if (!mask[i]) continue;
            const x = v[i] == null || typeof v[i] !== "number" ? fill : v[i];
            const ok = c.op === ">=" ? x >= c.value : c.op === ">" ? x > c.value : c.op === "<=" ? x <= c.value : x < c.value;
            if (!ok) mask[i] = 0;
          }
        } else if (c.kind === "rank") {
          const nativeAsc = E.ASC_GOOD.has(c.col);
          if (c.asc === nativeAsc) {
            const rk = this.has(c.col) ? this.nativeRank(c.col) : null;
            if (!rk) throw new E.QueryError("I can't rank on '" + (E.DISPLAY[c.col] || c.col) + "'.");
            for (let i = 0; i < this.n; i++) if (mask[i] && !(rk[i] != null && rk[i] <= c.n)) mask[i] = 0;
          } else {
            if (!this.has(c.col)) throw new E.QueryError("I don't have a '" + (E.DISPLAY[c.col] || c.col) + "' column.");
            const rk = this.dynamicRank(c.col, c.asc);
            for (let i = 0; i < this.n; i++) if (mask[i] && !(rk[i] != null && rk[i] <= c.n)) mask[i] = 0;
          }
        }
      }
      const idx = [];
      for (let i = 0; i < this.n; i++) if (mask[i]) idx.push(i);
      return { idx, conds, notes };
    }
    // query_engine.result_columns
    resultColumns(idx, conds) {
      const M = this.meta;
      const named = conds.filter((c) => c.col).map((c) => c.col);
      const positions = new Set(idx.map((i) => this.cols.position[i]).filter((p) => p != null));
      const defCodes = new Set(M.def_codes), defStats = new Set(M.def_stat_cols);
      const groups = [];
      for (const p of positions) {
        const key = defCodes.has(p) ? "DEF" : p === "TE" ? "WR" : p === "FB" ? "RB" : p;
        if (M.pos_defaults[key] && !groups.includes(key)) groups.push(key);
      }
      let gs = groups;
      if (!gs.length && named.some((c) => defStats.has(c))) gs = ["DEF"];
      if (!gs.length && named.length) gs = named.some((c) => /^(pass|completion|int_rate|qbr|sack_pct)/.test(c)) ? ["QB"] : ["RB", "WR"];
      const ordered = [];
      for (const c of [...M.always_cols, ...named, ...gs.flatMap((k) => M.pos_defaults[k])]) {
        if (this.has(c) && !ordered.includes(c)) ordered.push(c);
      }
      const always = new Set(M.always_cols);
      return ordered.filter((c) => always.has(c) || idx.some((i) => this.cols[c][i] != null));
    }
    row(i, cols) { const o = {}; for (const c of cols) o[c] = this.cols[c][i]; return o; }
    // python: sort_values(["season", "player_display_name"], ascending=[False, True])
    sortIdx(idx) {
      const s = this.cols.season, nm = this.cols.player_display_name;
      return idx.slice().sort((a, b) => (s[b] - s[a]) || String(nm[a] || "").localeCompare(String(nm[b] || ""), "en"));
    }
    query(text, limit) {
      const { idx, conds, notes } = this.run(text);
      const cols = this.resultColumns(idx, conds);
      const sorted = this.sortIdx(idx);
      const rows = sorted.slice(0, limit || 2000).map((i) => this.row(i, cols));
      return { notes, count: idx.length, columns: cols, rows, truncated: idx.length > (limit || 2000) };
    }
    career(playerId) {
      const idx = [];
      const ids = this.cols.player_id;
      for (let i = 0; i < this.n; i++) if (ids[i] === playerId) idx.push(i);
      idx.sort((a, b) => this.cols.season[a] - this.cols.season[b]);
      return idx.map((i) => this.row(i, this.meta.columns));
    }
  }

  const api = { Table, makeEngine, ratio, QueryError };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Gridiron = api;
})(typeof window !== "undefined" ? window : globalThis);
