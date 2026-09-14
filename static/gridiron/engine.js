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
  const RATING_PARTS = ["completions", "pass_attempts", "passing_yards", "passing_tds", "interceptions"];
  const r4 = (x) => Math.floor(x * 10000 + 0.5) / 10000;   // one rounding, shared with the Python engine
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

    // the same word is a different column depending on who is asked about
    // (mirrors query_engine.POS_SWAP)
    const DEF_CODES = new Set(["CB", "DB", "S", "FS", "SAF", "DE", "OLB", "DT", "NT", "DL", "LB", "ILB", "MLB"]);
    const POS_SWAP = {
      interceptions: { DEF: "def_interceptions" },
      sacks: { QB: "sacks_taken" },
      fumbles: { DEF: "forced_fumbles" },
      any_tds: { QB: "passing_tds", RB: "rushing_tds", FB: "rushing_tds", WR: "receiving_tds", TE: "receiving_tds", DEF: "def_tds", "*": "total_tds" },
      any_yards: { QB: "passing_yards", RB: "rushing_yards", FB: "rushing_yards", WR: "receiving_yards", TE: "receiving_yards", "*": "total_yards" },
      ypa: { RB: "ypc", FB: "ypc" },                 // a back's yards per attempt are carries
      pass_attempts: { RB: "carries", FB: "carries" },
    };
    let posGroup = null;   // set by parse() for the one question being read
    const posGroupOf = (codes) => !codes ? null : (codes.some((c) => DEF_CODES.has(c)) ? "DEF" : codes[0]);
    function findStat(text, start) {
      const r = findStatRaw(text, start);
      const swap = r && POS_SWAP[r[0]];
      if (swap) { const col = (posGroup && swap[posGroup]) || swap["*"]; if (col) return [col, r[1], r[2]]; }
      return r;
    }
    function findStatRaw(text, start) {
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

    // comparison words that carry their own stat when none is named nearby
    const COMPARE_GT = new Set(["over", "more than", "above", "taller than", "heavier than", "older than", "longer than",
      "greater than", "higher than", "bigger than", "faster than"]);
    const COMPARE_LT = new Set(["under", "less than", "fewer than", "below", "shorter than", "lighter than", "younger than",
      "lower than", "smaller than", "slower than"]);
    const COMPARE_COL = { "taller than": "height", "shorter than": "height", "heavier than": "weight", "lighter than": "weight",
      "older than": "age", "younger than": "age" };
    const COMPARE_RE = [...COMPARE_GT, ...COMPARE_LT, "at least", "at most"].sort((a, b) => b.length - a.length).map(esc).join("|");
    const CLAUSE_BREAK = /\b(and|with|who|that|or|while)\b|,/;
    // the stat mentioned LAST in text (the one nearest a number that follows it)
    function findStatLast(text) {
      let last = null, pos = 0;
      for (;;) { const st = findStat(text, pos); if (!st) return last; last = st; pos = st[2]; }
    }
    // a stat found FORWARD of a number that sits past a conjunction belongs to
    // the NEXT clause ("QBR over 70 and EPA per play above 0.2"): prefer the
    // stat behind the number in that case
    function statForNumber(q, start, end, fwdLen) {
      const fwd = q.slice(end, end + fwdLen);
      const st = findStat(fwd, 0);
      if (st && CLAUSE_BREAK.test(fwd.slice(0, st[1]))) {
        const back = findStatLast(q.slice(Math.max(0, start - 40), start));
        if (back) return back;
      }
      if (st) return st;
      return findStatLast(q.slice(Math.max(0, start - 40), start));
    }
    // a percent stat typed as "5%" or "5" means 0.05; typed as "0.05" stays
    const pctValue = (col, value, marked) => (PCT.has(col) && (marked || value >= 1)) ? value / 100 : value;
    // "70%+ completion" is the completion PERCENTAGE, not seventy completions
    const PCT_SIBLING = { completions: "completion_pct", receptions: "catch_pct", fg_made: "fg_pct",
                          passing_tds: "td_pct", interceptions: "int_rate", sacks_taken: "sack_pct",
                          pat_made: "pat_pct" };
    const pctCol = (col, marked) => (marked && PCT_SIBLING[col] && !PCT.has(col)) ? PCT_SIBLING[col] : col;
    // a bare zero is an EXACT zero: "0 interceptions" wants the games with none
    const zeroOp = (col, value, op) => (value === 0 && op === ">=" && !/yards|epa|rating|pct|rate|share/.test(col)) ? "<=" : op;
    const SIGN = { ">": ">", "<": "<", ">=": "\u2265", "<=": "\u2264" };
    const NUM_RE = /\d[\d,.]*/g;
    const PCT_TAIL_RE = /^\s*(%|percent)/;
    const covered = (i, spans) => spans.some(([a, b]) => a <= i && i < b);

    // mirrors query_engine._rewrite_lengths: "20+ yard passing tds" and
    // "td passes of 40 or more yards" become one digit-free stat name
    const LEN = "(\\d{2,3})\\s*(?:\\+|plus|or more|or longer)?\\s*-?\\s*(?:yards?|yds?|yarders?)";
    const LEN_FAMILIES = [
      ["pass_td", "(?:passing|pass|throwing)\\s+(?:touchdowns?|tds?)|(?:touchdown|td)\\s+(?:passes|throws)"],
      ["rush_td", "(?:rushing|rush|running)\\s+(?:touchdowns?|tds?)|(?:touchdown|td)\\s+(?:runs?|rushes|carries)"],
      ["rec_td", "(?:receiving|rec)\\s+(?:touchdowns?|tds?)|(?:touchdown|td)\\s+(?:catches|receptions|grabs)"],
      ["pos_td", "(?:touchdowns?|tds?|scores)"],
      ["pass", "(?:completions|passes|throws|passing plays)"],
      ["rush", "(?:runs|rushes|carries|rushing plays)"],
      ["rec", "(?:catches|receptions|grabs|receiving plays)"],
    ];
    const LEN_NAMES = { pass_td: "td passes", rush_td: "td runs", rec_td: "td catches", pass: "completions", rush: "runs", rec: "catches" };
    const POS_TD_FAMILY = { QB: "pass_td", RB: "rush_td", FB: "rush_td", WR: "rec_td", TE: "rec_td" };
    // only 20+ and 40+ buckets exist; any other length is reported, not guessed
    function rewriteLengths(q, posCodes, ignored) {
      const name = (fam, n) => {
        if (fam === "pos_td") {
          fam = (posCodes || []).map((c) => POS_TD_FAMILY[c]).find(Boolean);
          if (!fam) return null;
        }
        if (parseInt(n, 10) < 20) return "";
        return (parseInt(n, 10) >= 40 ? "fortyplus" : "twentyplus") + " yard " + LEN_NAMES[fam];
      };
      for (const [fam, pat] of LEN_FAMILIES) {
        for (const rx of [new RegExp(LEN + "\\s+(?:long\\s+)?(?:" + pat + ")\\b", "g"),
                          new RegExp("\\b(?:" + pat + ")\\s+(?:of|over|for|going|longer than|greater than|at least|more than|beyond)\\s+(?:at least\\s+)?" + LEN, "g")]) {
          q = q.replace(rx, (m, n) => {
            const nm = name(fam, n);
            if (nm === null) return m;
            if (nm === "") { ignored.push(m.trim() + " (only 20+ and 40+ yard plays are counted)"); return " "; }
            return " " + nm + " ";
          });
        }
      }
      return q;
    }

    function parse(query) {
      posGroup = null;
      let q = " " + String(query).toLowerCase().trim() + " ";
      // 6'2 / 6-2" style heights become inches so "taller than 6'2" just works
      // money is in millions: "$40 million", "$40m", "40 million", "40 mil" -> 40
      q = q.replace(/\$\s*(\d[\d,\.]*)\s*(million|mil|m)\b/g, "$1");
      q = q.replace(/(\d[\d,\.]*)\s*(million|mil)\b/g, "$1");
      q = q.replace(/(\d)['’-](\d{1,2})(?:"|''|”| in\b|\b)/g, (m, f, i) => String(parseInt(f, 10) * 12 + parseInt(i, 10)));
      // A parenthetical that is only a length — "deep pass TDs (20+ yards)" — is
      // restating what the stat already means, not asking for a second filter.
      q = q.replace(/\(\s*\d+\s*\+?\s*(?:or more\s*)?(?:air\s+)?(?:yards?|yds?)\s*\)/g, " ");
      const conds = [], notes = [], ignored = [];
      const spans = [];   // character ranges already turned into a condition
      let posCodes = null;
      for (const [word, re] of posRegex) {
        if (re.test(q)) {
          const pos = POSITIONS[word];
          posCodes = pos.codes;
          conds.push({ kind: "position", value: pos.codes, flag: pos.flag || null });
          notes.push("position is " + pos.label);
          break;
        }
      }
      posGroup = posGroupOf(posCodes);
      q = rewriteLengths(q, posCodes, ignored);
      let m = q.match(/between (\d{4}) and (\d{4})/);
      if (m) {
        const a = +m[1], b = +m[2];
        conds.push({ kind: "season_range", min: Math.min(a, b), max: Math.max(a, b) });
        notes.push("season between " + Math.min(a, b) + " and " + Math.max(a, b));
        spans.push([m.index, m.index + m[0].length]);
      } else {
        m = q.match(/since (\d{4})/);
        if (m) { conds.push({ kind: "season_range", min: +m[1], max: null }); notes.push("season since " + m[1]); spans.push([m.index, m.index + m[0].length]); }
        m = q.match(/before (\d{4})/);
        if (m) { conds.push({ kind: "season_range", min: null, max: +m[1] - 1 }); notes.push("season before " + m[1]); spans.push([m.index, m.index + m[0].length]); }
        m = q.match(/\bin (\d{4})\b/);
        if (m) { conds.push({ kind: "season_range", min: +m[1], max: +m[1] }); notes.push("season is " + m[1]); spans.push([m.index, m.index + m[0].length]); }
      }
      // WON a playoff game / the Super Bowl is a result, not an appearance
      m = q.match(/\b(?:won|win|winning|wins)\b[^,]{0,25}?\bsuper bowl\b|\bsuper bowl (?:champions?|champs|winners?|mvp)\b|\b(?:has|have|with|got|earned) (?:a |their |his |her )?rings?\b/);
      if (m) {
        conds.push({ kind: "threshold", col: "super_bowl_wins", op: ">=", value: 1 });
        notes.push("won the Super Bowl that season");
        spans.push([m.index, m.index + m[0].length]);
      }
      m = q.match(/\b(?:won|win|winning|wins)\b[^,]{0,25}?\b(?:playoff|postseason)\s+(?:game|games|win|wins|matchup)\b|\bwon in the (?:playoffs|postseason)\b|\b(?:playoff|postseason) (?:win|wins|victory|victories)\b/);
      if (m) {
        if (!/\d\s*\+?\s*(?:or more\s+)?(?:playoff|postseason) (?:win|wins|victories)/.test(q)) {
          conds.push({ kind: "threshold", col: "playoff_wins", op: ">=", value: 1 });
          notes.push("won a playoff game that season");
          spans.push([m.index, m.index + m[0].length]);
        }
      } else if (/playoff|postseason/.test(q)) { conds.push({ kind: "playoffs" }); notes.push("appeared in the playoffs that season"); }

      for (const mm of q.matchAll(/led the league in /g)) {
        const st = findStat(q, mm.index + mm[0].length);
        if (st) {
          const col = st[0];
          conds.push({ kind: "rank", col, n: 1, asc: ASC_GOOD.has(col) });
          notes.push("led the league in " + disp(col));
          spans.push([mm.index, st[2]]);
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
        spans.push([mm.index, end]);
      }

      // "who has the most X" / "fewest X" asks for an ORDER, not a filter.
      // Skipped when the sentence already says top N, the explicit form.
      if (!/(top|bottom)\s+\d+/.test(q)) {
        const mm = q.match(/(?<!at )\b(most|fewest|least|lowest|highest|best|leader in|leaders in)\b\s*/);
        if (mm) {
          const after = mm.index + mm[0].length;
          const st = findStat(q.slice(after, after + 45), 0);
          if (st) {
            const asc = ["fewest", "least", "lowest"].includes(mm[1]);
            conds.push({ kind: "sort", col: st[0], asc });
            notes.push("sorted by " + disp(st[0]) + " (" + (asc ? "lowest" : "highest") + " first)");
          }
        }
      }

      const threshPat = new RegExp("(" + COMPARE_RE + ")\\s+([\\d,\\.]+)\\s*(%|percent)?", "g");
      for (const mm of q.matchAll(threshPat)) {
        const opWord = mm[1], pctMark = !!mm[3];
        let value = parseFloat(mm[2].replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;
        const end = mm.index + mm[0].length;
        let st = null;
        if (!(opWord in COMPARE_COL)) st = statForNumber(q, mm.index, end, 40);
        let col;
        if (st) col = st[0];
        else if (opWord in COMPARE_COL) col = COMPARE_COL[opWord];
        else if (value >= 18 && value <= 50) col = "age";
        else continue;
        let op;
        if (COMPARE_GT.has(opWord)) op = ">";
        else if (opWord === "at least") op = ">=";
        else if (COMPARE_LT.has(opWord)) op = "<";
        else op = "<=";
        col = pctCol(col, pctMark);
        value = pctValue(col, value, pctMark);
        op = zeroOp(col, value, op);
        conds.push({ kind: "threshold", col, op, value });
        const shown = PCT.has(col) ? g(value * 100) + "%" : g(value);
        notes.push(disp(col) + " " + SIGN[op] + " " + shown);
        spans.push([mm.index, end]);
      }

      // "12%+" and "12+%" mean the same thing, so the percent mark is allowed
      // on either side of the plus. It used to be accepted only after it, which
      // made "12%+ pressure rate" parse as nothing at all.
      const postPat = /(?<num>[\d,.]+)\s*(?<pre>%|percent)?\s*(?<word>\+|or more|or fewer|or less|or higher|or lower|or younger|or older)\s*(?<post>%|percent|years old)?/g;
      for (const mm of q.matchAll(postPat)) {
        let value = parseFloat(mm.groups.num.replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;
        const phrase = mm.groups.word;
        const isPct = ["%", "percent"].includes(mm.groups.pre) || ["%", "percent"].includes(mm.groups.post);
        const gte = ["+", "or more", "or higher", "or older"].includes(phrase);
        const end = mm.index + mm[0].length;
        const fwd = q.slice(end, end + 45);
        const cut = fwd.match(/\b(and|over|more than|at least|above|under|less than|fewer than|below|at most|who|top|bottom|since|before|between|led|for|on)\b/);
        const statWin = cut ? fwd.slice(0, cut.index) : fwd;
        let st = findStat(statWin, 0);
        if (!st) st = findStatLast(q.slice(Math.max(0, mm.index - 40), mm.index));
        let col;
        if (!st) { if (value >= 18 && value <= 50) col = "age"; else continue; }
        else col = st[0];
        col = pctCol(col, isPct);
        value = pctValue(col, value, isPct);
        const op2 = zeroOp(col, value, gte ? ">=" : "<=");
        conds.push({ kind: "threshold", col, op: op2, value });
        const shown = PCT.has(col) ? g(value * 100) + "%" : g(value);
        notes.push(disp(col) + " " + SIGN[gte ? ">=" : "<="] + " " + shown);
        spans.push([mm.index, end]);
      }

      // A number next to a stat with no comparison word at all — "100
      // receptions", "12% pressure rate" — is a floor, the way anyone reading
      // it out loud would take it. Without this the clause was dropped and the
      // answer still looked right: "WRs with 100 receptions" returned every WR
      // season ever. Anything left over is reported rather than swallowed.
      NUM_RE.lastIndex = 0;
      for (const mm of q.matchAll(NUM_RE)) {
        if (covered(mm.index, spans)) continue;
        const value = parseFloat(mm[0].replace(/,/g, ""));
        if (!Number.isFinite(value)) continue;
        const tail = PCT_TAIL_RE.exec(q.slice(mm.index + mm[0].length));
        const end = mm.index + mm[0].length + (tail ? tail[0].length : 0);
        const st = statForNumber(q, mm.index, end, 40);
        let col = st ? st[0] : null;
        // "25 years old" is an equality, not a floor, so age stays explicit
        if (col === null || col === "age") {
          let frag = q.slice(mm.index, mm.index + 30).trim();
          frag = frag.split(/\b(?:and|with|who|that|since|before|between)\b|,/)[0].trim();
          ignored.push(frag);
          continue;
        }
        col = pctCol(col, !!tail);
        const v = pctValue(col, value, !!tail);
        const op3 = zeroOp(col, v, ">=");
        conds.push({ kind: "threshold", col, op: op3, value: v });
        notes.push(disp(col) + " " + SIGN[op3] + " " + (PCT.has(col) ? g(v * 100) + "%" : g(v)));
        spans.push([mm.index, end]);
      }

      // a game line, not a season line (this does NOT match "per game")
      if (/\ba game\b|\bgames with\b|\bgame with\b|\bgame where\b|\bin one game\b|\bsingle[- ]game\b|\bany game\b|\bone game\b|\d[\d,]*\s*\+?\s*(?:yard|yd|point|td|touchdown|sack|tackle|reception|catch|carry)s?[\s-]*game/.test(q)) conds.push({ kind: "scope", value: "game" });
      // the escape hatch that keeps a multi-season question on season lines
      if (/\bin a (?:single )?season\b|\bsingle[- ]season\b|\bbest season\b|\bper season\b|\bseason with the\b/.test(q)) conds.push({ kind: "scope", value: "season" });
      if (!conds.length) throw new QueryError("I couldn't find anything to filter on. Try naming a position, a stat with 'top N', a threshold like 'over 4000 passing yards', or 'playoffs'.");
      // "5 rings" is a career count; a season holds one at most. Keep the season
      // filter at >= 1 and carry the real number for the career-totals pass.
      for (const c of conds) {
        if (c.kind === "threshold" && c.col === "super_bowl_wins" && c.value > 1) {
          c.career = Math.round(c.value); c.value = 1;
          for (let i = 0; i < notes.length; i++) if (notes[i].startsWith("Super Bowl wins")) notes[i] = "Super Bowl wins \u2265 " + c.career + " across the matched seasons (career total)";
          if (!conds.some((k) => k.kind === "sort")) conds.push({ kind: "sort", col: "super_bowl_wins", asc: false });
        }
      }
      return { conds, notes, ignored };
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
        else {   // sparse -> dense; `d` is the value the omitted rows hold (a
                 // game line is mostly zeros, and 420k explicit zeros per column
                 // is most of the file)
          const arr = new Array(this.n).fill(c.d === undefined ? null : c.d);
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
      const { conds, notes, ignored } = this.engine.parse(query);
      return { idx: this.apply(conds), conds, notes, ignored };
    }
    // the filter half of run(): every row that passes every condition
    apply(conds) {
      const E = this.engine;
      let mask = new Uint8Array(this.n).fill(1);
      for (const c of conds) {
        if (c.kind === "position") {
          const codes = new Set(Array.isArray(c.value) ? c.value : [c.value]);
          const p = this.cols.position;
          // a derived flag narrows the codes; "edge rusher" is the one group the
          // position label cannot answer on its own (see fetch_data.edge_flag)
          const fl = c.flag && this.has(c.flag) ? this.cols[c.flag] : null;
          for (let i = 0; i < this.n; i++) if (mask[i] && (!codes.has(p[i]) || (fl && !fl[i]))) mask[i] = 0;
        } else if (c.kind === "playoffs") {
          // a season line says the team got there, a game line says this game was one
          const p = this.has("made_playoffs") ? this.cols.made_playoffs : this.cols.playoff_game;
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
      return idx;
    }
    // query_engine.result_columns
    resultColumns(idx, conds) {
      // mirrors query_engine.playoff_asked: the yes/no badge only on a playoff question
      const PLAYOFF_FLAGS = ["made_playoffs", "playoff_game"];
      const playoffAsked = conds.some((c) => c.kind === "playoffs"
        || (c.col || "").includes("playoff") || (c.col || "").includes("super_bowl"));
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
      const keep = playoffAsked ? ordered : ordered.filter((c) => !PLAYOFF_FLAGS.includes(c));
      return keep.filter((c) => always.has(c) || idx.some((i) => this.cols[c][i] != null));
    }
    row(i, cols) { const o = {}; for (const c of cols) o[c] = this.cols[c][i]; return o; }
    // mirrors query_engine.sort_result: an explicit "most/fewest X" first
    // (NA last, as pandas na_position="last"), otherwise newest season
    sortIdx(idx, conds) {
      const s = this.cols.season, nm = this.cols.player_display_name;
      // Python compares strings by code point and pandas puts NA last; locale
      // collation disagrees on names like "A.J." vs "Aaron", so match Python.
      const wk = this.has("week") ? this.cols.week : null;
      const pid = this.cols.player_id;
      const byName = (a, b) => {
        const d = s[b] - s[a];
        if (d) return d;
        if (wk) { const w = wk[b] - wk[a]; if (w) return w; }   // newest game first inside a season
        const x = nm[a], y = nm[b];
        if (x == null && y == null) return pid[a] < pid[b] ? -1 : pid[a] > pid[b] ? 1 : 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (x !== y) return x < y ? -1 : 1;
        return pid[a] < pid[b] ? -1 : pid[a] > pid[b] ? 1 : 0;
      };
      const so = (conds || []).find((c) => c.kind === "sort" && this.has(c.col));
      if (!so) return idx.slice().sort(byName);
      // A rate leaderboard is only meaningful among players who threw (ran,
      // caught) enough: a two-game backup is not the best passer in the league.
      // Unqualified seasons keep their place at the bottom rather than vanishing.
      const fl = this.rateFloor(so.col);
      const q = fl && this.has(fl.qual) ? this.cols[fl.qual] : null;
      const unq = (i) => {
        if (!q) return 0;
        const need = fl.perGame ? fl.min * (this.cols.season[i] >= 2021 ? 17 : 16) : fl.min;
        return (q[i] || 0) >= need ? 0 : 1;
      };
      const v = this.cols[so.col], dir = so.asc ? 1 : -1;
      return idx.slice().sort((a, b) => {
        const ua = unq(a), ub = unq(b);
        if (ua !== ub) return ua - ub;
        const va = v[a], vb = v[b];
        if (va == null && vb == null) return byName(a, b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return va === vb ? byName(a, b) : (va - vb) * dir;
      });
    }
    query(text, limit) {
      const { idx, conds, notes, ignored } = this.run(text);
      return this.present(idx, conds, notes, ignored, limit);
    }
    // the same answer for conditions the page has edited (a clause removed, a number changed)
    queryConds(conds, notes, ignored, limit) {
      return this.present(this.apply(conds), conds, notes, ignored, limit);
    }
    // ---- CAREER OR SEASON ---------------------------------------------------
    // A row here is one season, so "most X" needs a reading. The span decides it
    // and the word "season" overrides it. Mirrors query_engine.py exactly:
    //   "most X in 2024" one season · "most X since 2021" CAREER ·
    //   "most X in a season since 2021" the best single line ·
    //   a THRESHOLD or a "top N" RANK is always per season.
    rateOk(parts) {
      return (parts === "rating" ? RATING_PARTS : parts[0].concat(parts[1])).every((c) => this.has(c));
    }
    rateValue(get, parts) {
      if (parts === "rating") {
        const att = get("pass_attempts");
        if (!att) return null;
        const cap = (x) => Math.max(0, Math.min(2.375, x));
        const a = cap((get("completions") / att - 0.3) * 5);
        const b = cap((get("passing_yards") / att - 3) * 0.25);
        const c = cap(get("passing_tds") / att * 20);
        const d = cap(2.375 - get("interceptions") / att * 25);
        return r4((a + b + c + d) / 6 * 100);
      }
      const den = parts[1].reduce((t, x) => t + get(x), 0);
      if (!den) return null;
      return r4(parts[0].reduce((t, x) => t + get(x), 0) / den);
    }
    rateFloor(col) {
      for (const r of this.meta.rate_ranks) if (r[0] === col) return { qual: r[2], min: r[3], perGame: !!r[4] };
      return null;
    }
    rateNotes(col) {
      const D = (c) => this.engine.DISPLAY[c] || c;
      const out = [D(col) + " is rebuilt from the career totals, not averaged"];
      const fl = this.rateFloor(col);
      if (fl) out.push("ranked only for a player with at least " + fl.min + " " + D(fl.qual) + " per " + (fl.perGame ? "scheduled game" : "season") + " over the span");
      return out;
    }
    careerScope(idx, conds) {
      const M = this.meta, D = (c) => this.engine.DISPLAY[c] || c;
      if (conds.some((c) => c.kind === "scope" && (c.value === "season" || c.value === "game"))) return { career: false, notes: [] };
      if (conds.some((c) => c.kind === "rank")) return { career: false, notes: [] };
      const seasons = new Set();
      for (const i of idx) seasons.add(this.cols.season[i]);
      if (seasons.size < 2) return { career: false, notes: [] };
      const sort = conds.find((c) => c.kind === "sort");
      if (!sort) return { career: conds.some((c) => c.kind === "threshold" && c.career), notes: [] };
      const col = sort.col, parts = (M.rate_parts || {})[col];
      if ((M.sum_cols || []).includes(col)) return { career: true, notes: [] };
      if (parts && this.rateOk(parts)) return { career: true, notes: this.rateNotes(col) };
      if (parts || M.pct_stats.includes(col) || (M.pp_stats || []).includes(col))
        return { career: false, notes: [D(col) + " is a per-season rate I can't rebuild across seasons \u2014 these are season lines"] };
      return { career: false, notes: [] };
    }
    presentCareer(idx, conds, notes, ignored, limit, extra) {
      const M = this.meta;
      const sums = M.sum_cols || [], rateParts = M.rate_parts || {}, maxCols = (M.max_cols || []).filter((c) => this.has(c));
      const rates = Object.keys(rateParts).filter((c) => this.has(c) && this.rateOk(rateParts[c]));
      const ident = M.always_cols.filter((c) => this.has(c) && c !== "made_playoffs");
      const base = this.resultColumns(idx, conds);
      const cols = ident.concat(base.filter((c) => !ident.includes(c) && (sums.includes(c) || maxCols.includes(c) || rates.includes(c))));
      for (const e of ["playoff_wins", "super_bowl_wins"]) if (this.has(e) && !cols.includes(e)) cols.push(e);   // always carried: they break ties
      const s = conds.find((c) => c.kind === "sort" && cols.includes(c.col)) || { col: "super_bowl_wins", asc: false };
      const fl = rates.includes(s.col) ? this.rateFloor(s.col) : null;
      const need = new Set(["games"]);
      for (const c of rates) for (const x of (rateParts[c] === "rating" ? RATING_PARTS : rateParts[c][0].concat(rateParts[c][1]))) need.add(x);
      if (fl) need.add(fl.qual);
      const want = [...new Set([...cols, ...need])].filter((c) => this.has(c));
      const by = new Map();
      for (const i of idx) {
        const id = this.cols.player_id[i], season = this.cols.season[i];
        let r = by.get(id);
        if (!r) { r = { _id: id, _lo: season, _hi: season, _last: i, _n: 0, _sched: 0, _tot: {}, _seen: {}, _max: {} }; by.set(id, r); }
        if (season < r._lo) r._lo = season;
        if (season >= r._hi) { r._hi = season; r._last = i; }
        r._n++; r._sched += season >= 2021 ? 17 : 16;
        for (const c of want) {
          const v = this.cols[c][i];
          if (v != null && typeof v === "number") { r._tot[c] = (r._tot[c] || 0) + v; r._seen[c] = true; }
        }
        for (const c of maxCols) { const v = this.cols[c][i]; if (v != null && (r._max[c] == null || v > r._max[c])) r._max[c] = v; }
      }
      let rows = [...by.values()].map((r) => {
        const get = (x) => r._tot[x] || 0;
        const o = {};
        for (const c of ident) if (c !== "season") o[c] = this.cols[c][r._last];
        o.season = r._lo === r._hi ? String(r._lo) : r._lo + "\u2013" + r._hi;
        for (const c of cols) {
          if (rates.includes(c)) o[c] = this.rateValue(get, rateParts[c]);
          else if (maxCols.includes(c)) o[c] = r._max[c] == null ? null : r._max[c];
          else if (sums.includes(c)) o[c] = r._seen[c] ? get(c) : null;
        }
        o._qual = fl ? get(fl.qual) : 0;
        o._floor = (fl && fl.perGame ? r._sched : r._n) * (fl ? fl.min : 0);
        return o;
      });
      const th = conds.find((c) => c.kind === "threshold" && c.career);
      if (th && cols.includes(th.col)) rows = rows.filter((r) => (r[th.col] || 0) >= th.career);
      if (fl) rows = rows.filter((r) => r._qual >= r._floor);   // a rate ranks only a player who cleared the bar over the span
      rows.forEach((r) => { delete r._qual; delete r._floor; });
      const cmp = (a, b, asc) => {
        const an = a == null || Number.isNaN(a), bn = b == null || Number.isNaN(b);
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return asc ? a - b : b - a;
      };
      const str = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
      rows.sort((a, b) => cmp(a[s.col], b[s.col], !!s.asc) ||
        (s.col !== "playoff_wins" && cols.includes("playoff_wins") ? cmp(a.playoff_wins, b.playoff_wins, false) : 0) ||
        str(a.player_display_name, b.player_display_name) || str(a.player_id, b.player_id));
      return { conds, notes, readNotes: [...(extra || []), "career totals \u2014 one row per player, the matched seasons added up; the season column shows the span"],
               ignored, sort: s, count: rows.length, columns: cols, rows: rows.slice(0, limit || 2000), idx,
               truncated: rows.length > (limit || 2000), totals: null, career: true };
    }
    present(idx, conds, notes, ignored, limit) {
      const scope = this.careerScope(idx, conds);
      if (scope.career) return this.presentCareer(idx, conds, notes, ignored, limit, scope.notes);
      const cols = this.resultColumns(idx, conds);
      const readNotes = [...scope.notes];
      const rs = conds.find((c) => c.kind === "sort" && this.has(c.col));
      const rfl = rs ? this.rateFloor(rs.col) : null;
      if (rfl && this.has(rfl.qual)) readNotes.push("ranked only among seasons with at least " + rfl.min + " " + (this.engine.DISPLAY[rfl.qual] || rfl.qual) + " per " + (rfl.perGame ? "scheduled game" : "season") + "; the rest sit below them");
      const sorted = this.sortIdx(idx, conds);
      const rows = sorted.slice(0, limit || 2000).map((i) => this.row(i, [...cols, "player_id"]));
      const sort = conds.find((c) => c.kind === "sort" && this.has(c.col)) || null;
      return { conds, notes, readNotes, ignored, sort, count: idx.length, columns: cols, rows, idx,
               truncated: idx.length > (limit || 2000), totals: sort ? this.totals(idx, sort.col) : null };
    }
    // "who has the most X since 2021" is a question about a SPAN, but every row
    // here is one season, so the season table alone answers "best season". This
    // sums the matched seasons per player; only for counting stats, where a sum
    // means something.
    totals(idx, col) {
      const M = this.meta;
      const counting = M.rank_desc.includes(col) || col === "playoff_wins" || col === "super_bowl_wins";
      if (!counting || M.pct_stats.includes(col) || (M.pp_stats || []).includes(col)) return null;
      const seasons = new Set(idx.map((i) => this.cols.season[i]));
      if (seasons.size < 2) return null;
      const by = new Map();
      for (const i of idx) {
        const v = this.cols[col][i];
        if (v == null) continue;
        const id = this.cols.player_id[i];
        const cur = by.get(id) || { id, name: this.cols.player_display_name[i], team: this.cols.recent_team[i], total: 0, seasons: 0 };
        cur.total += v; cur.seasons++; cur.name = this.cols.player_display_name[i] || cur.name;
        by.set(id, cur);
      }
      const rows = [...by.values()].sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : 1)).slice(0, 10);
      return rows.length ? { col, rows, spanned: seasons.size } : null;
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
