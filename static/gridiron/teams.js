/*
 * Gridiron — team questions.
 *
 * "2026 NFL team with: top 6 in point differential, a 1,000-yard RB, ..." asks
 * about TEAM-seasons, which the player engine (engine.js) cannot: it needs the
 * team table (teams.json, from build_teams.py) and, for "a QB / receiver / RB
 * who ...", the player table the page already has loaded.
 *
 * Reading a checklist:
 *   - each line (or each comma-separated part of a one-line question) is a
 *     requirement, and a team must meet every one
 *   - "or" splits a requirement into alternatives; one is enough
 *   - "and" splits an alternative into conditions; all of them are needed
 *   - a condition that names no subject takes the one before it in its line:
 *     "QB top 12 in X or top 8 in Y" asks both of the QB
 *
 * Subjects: the team, its starting QB (most pass attempts for that team), or
 * any receiver / RB on its roster ("a 950+ yard receiver", "two 750+ yard
 * receivers", "two RBs with 1,500 total rushing yards").
 *
 * A season still being played paces TOTALS in thresholds to the full schedule
 * from the team's games played (400 yards through 6 of 17 games is a 1,133-yard
 * pace). A finished season uses real totals: a back who missed games gets no
 * yards for them. Ranks and rates are never paced.
 */
(function (root) {
  "use strict";

  const TEAM_STATS = {
    point_diff: { label: "point differential", asc: false, total: true, sign: true },
    ppg: { label: "points/game", asc: false },
    papg: { label: "points/game allowed", asc: true },
    ypg: { label: "yards/game", asc: false },
    ypg_allowed: { label: "yards/game allowed", asc: true },
    turnover_diff: { label: "turnover differential", asc: false, total: true, sign: true },
    takeaways: { label: "takeaways", asc: false, total: true },
    giveaways: { label: "giveaways", asc: true, total: true },
    st_epa: { label: "special teams EPA", asc: false, total: true, sign: true, dec: 1 },
    wins: { label: "wins", asc: false, total: true },
  };

  // rate stats rank only players who cleared the same per-game floor the
  // season table uses (fetch_data.RATE_RANKS)
  const QB_FLOOR = ["pass_attempts", 14], RB_FLOOR = ["carries", 6.25], REC_FLOOR = ["targets", 2.5];
  const PLAYER_STATS = {
    passer_rating: { label: "passer rating", role: "QB", col: "passer_rating", rate: QB_FLOOR, dec: 1 },
    qbr: { label: "QBR", role: "QB", col: "qbr", rate: QB_FLOOR, dec: 1 },
    completion_pct: { label: "completion %", role: "QB", col: "completion_pct", rate: QB_FLOOR, pct: true },
    int_rate: { label: "interception rate", role: "QB", col: "int_rate", rate: QB_FLOOR, pct: true, asc: true },
    ypa: { label: "yards/attempt", role: "QB", col: "ypa", rate: QB_FLOOR, dec: 2 },
    pass_ypg: { label: "passing yards/game", role: "QB", col: "pass_ypg", rate: QB_FLOOR, dec: 1 },
    pass_tds_pg: { label: "passing TDs/game", role: "QB", col: "pass_tds_pg", rate: QB_FLOOR, dec: 2 },
    passing_yards: { label: "passing yards", role: "QB", col: "passing_yards", total: true },
    passing_tds: { label: "passing TDs", role: "QB", col: "passing_tds", total: true },
    interceptions: { label: "interceptions", role: "QB", col: "interceptions", total: true, asc: true, floor: QB_FLOOR },
    pr_yards: { label: "passing + rushing yards", role: "QB", sum: ["passing_yards", "rushing_yards"], total: true },
    pr_ypg: { label: "passing + rushing yards/game", role: "QB", sum: ["passing_yards", "rushing_yards"], perGame: true, rate: QB_FLOOR, dec: 1 },
    rushing_yards: { label: "rushing yards", role: "RB", col: "rushing_yards", total: true },
    rushing_tds: { label: "rushing TDs", role: "RB", col: "rushing_tds", total: true },
    carries: { label: "carries", role: "RB", col: "carries", total: true },
    rush_ypg: { label: "rushing yards/game", role: "RB", col: "rush_ypg", rate: RB_FLOOR, dec: 1 },
    ypc: { label: "yards/carry", role: "RB", col: "ypc", rate: RB_FLOOR, dec: 2 },
    scrimmage_yards: { label: "scrimmage yards", role: "RB", sum: ["rushing_yards", "receiving_yards"], total: true },
    receiving_yards: { label: "receiving yards", role: "REC", col: "receiving_yards", total: true },
    receptions: { label: "receptions", role: "REC", col: "receptions", total: true },
    receiving_tds: { label: "receiving TDs", role: "REC", col: "receiving_tds", total: true },
    targets: { label: "targets", role: "REC", col: "targets", total: true },
    rec_ypg: { label: "receiving yards/game", role: "REC", col: "rec_ypg", rate: REC_FLOOR, dec: 1 },
  };
  // a bare "yards" / "TDs" is the subject's own kind
  const GENERIC = { _yards: { QB: "passing_yards", RB: "rushing_yards", REC: "receiving_yards" },
                    _tds: { QB: "passing_tds", RB: "rushing_tds", REC: "receiving_tds" } };

  // [phrase, key]; at one position the longest phrase wins
  const PHRASES = [
    ["point differential", "point_diff"], ["point diff", "point_diff"], ["point margin", "point_diff"], ["scoring margin", "point_diff"],
    ["points/game allowed", "papg"], ["points per game allowed", "papg"], ["points allowed per game", "papg"],
    ["points allowed/game", "papg"], ["ppg allowed", "papg"], ["points allowed", "papg"], ["scoring defense", "papg"],
    ["yards/game allowed", "ypg_allowed"], ["yards per game allowed", "ypg_allowed"], ["yards allowed per game", "ypg_allowed"],
    ["yards allowed/game", "ypg_allowed"], ["yards allowed", "ypg_allowed"], ["total defense", "ypg_allowed"],
    ["points/game", "ppg"], ["points per game", "ppg"], ["ppg", "ppg"], ["scoring offense", "ppg"],
    ["yards/game", "ypg"], ["yards per game", "ypg"], ["total offense", "ypg"], ["offensive yards", "ypg"],
    ["turnover differential", "turnover_diff"], ["turnover margin", "turnover_diff"], ["turnover diff", "turnover_diff"],
    ["takeaways", "takeaways"], ["giveaways", "giveaways"],
    ["special teams epa", "st_epa"], ["special teams", "st_epa"], ["st epa", "st_epa"],
    ["wins", "wins"],
    ["passer rating", "passer_rating"], ["qb rating", "passer_rating"], ["rating", "passer_rating"], ["qbr", "qbr"],
    ["completion percentage", "completion_pct"], ["completion %", "completion_pct"], ["completion pct", "completion_pct"],
    ["completion rate", "completion_pct"], ["completion", "completion_pct"], ["cmp%", "completion_pct"],
    ["interception rate", "int_rate"], ["int rate", "int_rate"], ["interceptions", "interceptions"], ["ints", "interceptions"],
    ["yards per attempt", "ypa"], ["yards/attempt", "ypa"], ["y/a", "ypa"],
    ["passing+rushing yards/game", "pr_ypg"], ["passing+rushing yards per game", "pr_ypg"], ["passing+rushing yards", "pr_yards"],
    ["rushing+passing yards/game", "pr_ypg"], ["rushing+passing yards per game", "pr_ypg"], ["rushing+passing yards", "pr_yards"],
    ["passing yards/game", "pass_ypg"], ["passing yards per game", "pass_ypg"], ["passing yards", "passing_yards"], ["pass yards", "passing_yards"],
    ["passing touchdowns per game", "pass_tds_pg"], ["passing tds per game", "pass_tds_pg"], ["passing tds/game", "pass_tds_pg"],
    ["passing touchdowns", "passing_tds"], ["passing tds", "passing_tds"], ["passing td", "passing_tds"],
    ["td passes", "passing_tds"], ["touchdown passes", "passing_tds"],
    ["rushing yards/game", "rush_ypg"], ["rushing yards per game", "rush_ypg"], ["rushing yards", "rushing_yards"], ["rush yards", "rushing_yards"],
    ["yards per carry", "ypc"], ["yards/carry", "ypc"], ["ypc", "ypc"],
    ["rushing touchdowns", "rushing_tds"], ["rushing tds", "rushing_tds"], ["carries", "carries"],
    ["scrimmage yards", "scrimmage_yards"], ["yards from scrimmage", "scrimmage_yards"],
    ["receiving yards/game", "rec_ypg"], ["receiving yards per game", "rec_ypg"], ["receiving yards", "receiving_yards"], ["rec yards", "receiving_yards"],
    ["receptions", "receptions"], ["catches", "receptions"], ["receiving touchdowns", "receiving_tds"], ["receiving tds", "receiving_tds"],
    ["targets", "targets"],
    ["yards", "_yards"], ["yard", "_yards"], ["yds", "_yards"], ["touchdowns", "_tds"], ["tds", "_tds"],
  ];

  const ROLE_WORDS = [
    ["QB", /\b(qbs?|quarterbacks?|passers?)\b/],
    ["REC", /\b(receivers?|wrs?|wide ?outs?|tes?|tight ends?|pass ?catchers?|targets? for)\b/],
    ["RB", /\b(rbs?|running ?backs?|backs?|rushers?|halfbacks?)\b/],
  ];
  const COUNT_WORDS = { two: 2, three: 3, four: 4, five: 5, both: 2 };
  const ROLE_NAME = { QB: ["starting QB", "QBs"], REC: ["receiver", "receivers"], RB: ["RB", "RBs"] };

  class TeamQueryError extends Error { constructor(m) { super(m); this.name = "QueryError"; } }

  const isLetter = (ch) => !!ch && /[a-z0-9%]/.test(ch);

  function findPhrase(s) {
    let best = null;
    for (const [p, key] of PHRASES) {
      let from = 0;
      for (;;) {
        const i = s.indexOf(p, from);
        if (i < 0) break;
        from = i + 1;
        if (isLetter(s[i - 1]) || (isLetter(s[i + p.length]) && !/^s\b/.test(s.slice(i + p.length)))) continue;
        if (!best || i < best.i || (i === best.i && p.length > best.p.length)) best = { i, p, key };
        break;
      }
    }
    return best;
  }

  function isTeamQuery(text) {
    const t = text.toLowerCase();
    return /^\s*(?:(?:19|20)\d\d\s+)?(?:nfl\s+)?teams?\b/.test(t)
      || /\b(?:nfl\s+)?teams?\s*(?:with|that|who|where|which|whose|:)/.test(t);
  }

  function seasonsOf(header) {
    let m = header.match(/\b((?:19|20)\d\d)\s*(?:-|–|to|through|thru)\s*((?:19|20)\d\d)\b/);
    if (m) return { min: +m[1], max: +m[2] };
    m = header.match(/\bsince\s+((?:19|20)\d\d)\b/);
    if (m) return { min: +m[1], max: null };
    m = header.match(/\b((?:19|20)\d\d)\b/);
    if (m) return { min: +m[1], max: +m[1] };
    return { min: null, max: null };
  }

  // "passing and rushing yards" is one stat, not two clauses joined by "and"
  const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .replace(/\b(?:combined\s+)?(passing|rushing)\s*(?:\+|&|and|plus)\s*(passing|rushing)\b/g, "$1+$2")
    .replace(/\s+/g, " ").trim();

  function parseAtom(raw, inherited) {
    let s = " " + raw + " ";
    const atom = { text: raw.trim() };
    // the rank words
    let m = s.match(/\b(?:isn'?t|is not|not|aren'?t|never|outside(?: of)?(?: the)?)\s+(?:in\s+)?(?:the\s+)?bottom\s+(\d+)\b/);
    if (m) { atom.op = "notbottom"; atom.n = +m[1]; s = s.replace(m[0], " "); }
    else if ((m = s.match(/\bbottom\s+(\d+)\b/))) { atom.op = "bottom"; atom.n = +m[1]; s = s.replace(m[0], " "); }
    else if ((m = s.match(/\btop\s*-?\s*(\d+)\b/))) { atom.op = "top"; atom.n = +m[1]; s = s.replace(m[0], " "); }
    // the stat
    const ph = findPhrase(s);
    // the subject
    let role = null;
    for (const [r, rx] of ROLE_WORDS) if (rx.test(s)) { role = r; break; }
    // "RB" alone names who the next condition is about
    if (!ph) return role && !/\d/.test(s) ? { roleOnly: role } : null;
    let key = ph.key;
    if (TEAM_STATS[key]) { atom.subject = "team"; atom.key = key; }
    else {
      role = role || (inherited && inherited !== "team" ? inherited : null) || (PLAYER_STATS[key] ? PLAYER_STATS[key].role : null);
      if (!role) return null;
      if (GENERIC[key]) key = GENERIC[key][role];
      atom.subject = role; atom.key = key;
    }
    const st = TEAM_STATS[atom.key] || PLAYER_STATS[atom.key];
    // how many players: "two 750+ yard receivers", "two with 1500 total rushing yards"
    m = s.match(/\b(two|three|four|five|both)\b/);
    if (m && atom.subject !== "team" && atom.subject !== "QB") {
      atom.k = COUNT_WORDS[m[1]];
      if (/\b(total|combined|between them|together)\b/.test(s)) atom.sum = true;
    }
    if (!atom.op) {
      const nm = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(%|percent)?\s*(\+|or more|or higher|or better|or fewer|or less|or lower)?/);
      if (!nm) return null;
      let v = parseFloat(nm[1].replace(/,/g, ""));
      if (st.pct && (nm[2] || v > 1)) v /= 100;
      const before = s.slice(0, nm.index);
      let op = ">=";
      if (/\b(or fewer|or less|or lower)\b/.test(nm[3] || "") || /\b(at most|no more than|max(?:imum)? of)\s*$/.test(before)) op = "<=";
      else if (/\b(under|less than|fewer than|below|lower than)\s*$/.test(before)) op = "<";
      else if (/\b(over|more than|above|greater than|better than|higher than)\s*$/.test(before)) op = ">";
      atom.op = op; atom.value = v;
    }
    return atom;
  }

  function parse(text) {
    let t = text.replace(/\r/g, "");
    // the header is everything before the first colon, or, on one line, the words before "with"
    let header = "", body = t;
    const colon = t.indexOf(":");
    if (colon >= 0 && /\bteams?\b/i.test(t.slice(0, colon))) { header = t.slice(0, colon); body = t.slice(colon + 1); }
    else {
      // "2026 teams top 6 in X" — the header ends at "teams"; what follows is asked
      const m = t.match(/^(.*?\bteams?\b)\s*(?:with|that|who|where|which|whose)?\b/i);
      if (m) { header = m[1]; body = t.slice(m[0].length); }
    }
    let seasons = seasonsOf(header.toLowerCase());
    // "... in 2024" / "since 2020" at the end of a one-line question
    const tail = body.match(/\b(in|since|during)\s+((?:19|20)\d\d)\b/i);
    if (seasons.min == null && tail) {
      seasons = tail[1].toLowerCase() === "since" ? { min: +tail[2], max: null } : { min: +tail[2], max: +tail[2] };
      body = body.replace(tail[0], " ");
    }
    let lines = body.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      // one line: commas, semicolons and "with" separate requirements, but a
      // piece that names no stat ("RB", "two") belongs with the next one
      const parts = (lines[0] || "").split(/[;,]|\bwith\b/i).map((l) => l.trim()).filter(Boolean);
      lines = [];
      let carry = "";
      for (const part of parts) {
        const piece = carry ? carry + " with " + part : part;
        if (findPhrase(" " + norm(piece) + " ")) { lines.push(piece); carry = ""; } else carry = piece;
      }
      if (carry) { if (lines.length) lines[lines.length - 1] += " with " + carry; else lines.push(carry); }
    }
    const reqs = [], ignored = [];
    const numbered = lines.some((l) => /^(?:[•\-*·▪◦–—]\s*)*\d+\s*[.)]\s+/.test(l));
    for (const line of lines) {
      const num = line.match(/^(?:[•\-*·▪◦–—]\s*)*(\d+)\s*[.)]\s+/);
      const clean = line.replace(/^(?:[•\-*·▪◦–—]\s*)*(?:\d+\s*[.)]\s+)?/, "").trim();
      if (!clean) continue;
      const alts = [];
      let inherited = null;
      for (const altText of norm(clean).split(/\bor\b/)) {
        const atoms = [];
        for (const atomText of altText.split(/\band\b/)) {
          if (!atomText.trim()) continue;
          const a = parseAtom(atomText, inherited);
          if (a && a.roleOnly) inherited = a.roleOnly;
          else if (a) { atoms.push(a); inherited = a.subject; }
          else ignored.push(atomText.trim());
        }
        if (atoms.length) alts.push(atoms);
      }
      // a numbered list keeps its own numbers; an unnumbered line in it is "•"
      if (alts.length) reqs.push({ text: clean, alts, label: num ? num[1] : numbered ? "•" : String(reqs.length + 1) });
    }
    if (!reqs.length) throw new TeamQueryError("I couldn't read any team requirement. Try one per line, like \"top 6 in point differential\" or \"a 1000+ yard RB\".");
    return { seasons, reqs, ignored };
  }

  // ---------------------------------------------------------------- evaluation
  function fmtNum(v, st) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (st.pct) return (v * 100).toFixed(1).replace(/\.0$/, "") + "%";
    const dec = st.dec != null ? st.dec : (Number.isInteger(v) ? 0 : 1);
    const s = Number(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return st.sign && v > 0 ? "+" + s : s;
  }
  const SIGN = { ">=": "≥", ">": ">", "<=": "≤", "<": "<" };
  const cmp = (op, a, b) => op === ">=" ? a >= b : op === ">" ? a > b : op === "<=" ? a <= b : a < b;

  function describe(a) {
    const st = TEAM_STATS[a.key] || PLAYER_STATS[a.key];
    let who;
    if (a.subject === "team") who = "team";
    else if (a.subject === "QB") who = ROLE_NAME.QB[0];
    else if (a.k > 1) who = (a.k === 2 ? "two " : a.k + " ") + ROLE_NAME[a.subject][1] + (a.sum ? " combined" : "");
    else who = "a " + ROLE_NAME[a.subject][0];
    let what;
    if (a.op === "top") what = "top " + a.n + " in " + st.label;
    else if (a.op === "bottom") what = "bottom " + a.n + " in " + st.label;
    else if (a.op === "notbottom") what = "not bottom " + a.n + " in " + st.label;
    else what = st.label + " " + SIGN[a.op] + " " + fmtNum(a.value, Object.assign({}, st, { sign: false, dec: st.pct ? undefined : (Number.isInteger(a.value) ? 0 : st.dec) }));
    return who + ": " + what;
  }

  function run(text, teamData, T) {
    const q = parse(text);
    const rows = teamData.rows;
    const lo = q.seasons.min, hi = q.seasons.max;
    const inScope = rows.filter((r) => (lo == null || r.season >= lo) && (hi == null || r.season <= hi));
    if (!inScope.length) throw new TeamQueryError("No team-seasons in that range — the team table covers " + teamData.meta.seasons[0] + "–" + teamData.meta.seasons[1] + ".");

    // per season: how many teams, how far along, the per-game floor for rate ranks
    const seasonInfo = new Map();
    for (const r of rows) {
      const s = seasonInfo.get(r.season) || { teams: 0, maxGames: 0, sched: r.sched_games, complete: r.complete };
      s.teams++; s.maxGames = Math.max(s.maxGames, r.games); s.sched = Math.max(s.sched, r.sched_games);
      seasonInfo.set(r.season, s);
    }
    const C = T.cols, n = T.n;
    const get = (c, i) => (C[c] ? C[c][i] : null);
    const value = (key, i) => {
      const st = PLAYER_STATS[key];
      if (st.sum) {
        let tot = 0, seen = false;
        for (const c of st.sum) { const v = get(c, i); if (v != null) { tot += v; seen = true; } }
        if (!seen) return null;
        if (st.perGame) { const g = get("games", i); return g ? tot / g : null; }
        return tot;
      }
      const v = get(st.col, i);
      return v == null || typeof v !== "number" ? null : v;
    };
    const inRole = (role, i) => {
      const p = C.position[i];
      if (role === "QB") return p === "QB";
      if (role === "RB") return p === "RB" || p === "FB";
      return p !== "QB";
    };
    // players by season|team, only for the seasons asked about
    const wanted = new Set(inScope.map((r) => r.season));
    const roster = new Map();
    for (let i = 0; i < n; i++) {
      const s = C.season[i];
      if (!wanted.has(s)) continue;
      const k = s + "|" + C.recent_team[i];
      if (!roster.has(k)) roster.set(k, []);
      roster.get(k).push(i);
    }
    const starter = new Map();
    const qbOf = (season, team) => {
      const k = season + "|" + team;
      if (starter.has(k)) return starter.get(k);
      let best = null, att = -1;
      for (const i of roster.get(k) || []) {
        if (C.position[i] !== "QB") continue;
        const a = get("pass_attempts", i) || 0;
        if (a > att) { att = a; best = i; }
      }
      starter.set(k, best);
      return best;
    };
    // league ranks among players of the role in that season (pandas method="min")
    const rankCache = new Map();
    const rankOf = (key, role, i) => {
      const season = C.season[i], ck = season + "|" + role + "|" + key;
      let m = rankCache.get(ck);
      if (!m) {
        const st = PLAYER_STATS[key], info = seasonInfo.get(season);
        const games = info.complete ? info.sched : info.maxGames;
        const floor = st.rate || st.floor;
        const pool = [];
        for (let j = 0; j < n; j++) {
          if (C.season[j] !== season || !inRole(role, j)) continue;
          const v = value(key, j);
          if (v == null) continue;
          if (floor) { if ((get(floor[0], j) || 0) < floor[1] * games) continue; }
          else if (!(v > 0)) continue;
          pool.push([j, v]);
        }
        pool.sort((a, b) => st.asc ? a[1] - b[1] : b[1] - a[1]);
        m = new Map();
        let r = 0;
        pool.forEach(([j, v], k) => { if (k === 0 || v !== pool[k - 1][1]) r = k + 1; m.set(j, r); });
        rankCache.set(ck, m);
      }
      return m.get(i) || null;
    };

    const anyPaced = [];
    function evalAtom(a, team) {
      const info = seasonInfo.get(team.season);
      const pace = info.complete || !team.games ? 1 : team.sched_games / team.games;
      if (a.subject === "team") {
        const st = TEAM_STATS[a.key], v = team[a.key], r = team[a.key + "_rank"];
        let ok, why = st.label + " " + fmtNum(v, st) + " (#" + r + " of " + info.teams + ")";
        if (a.op === "top") ok = r != null && r <= a.n;
        else if (a.op === "bottom") ok = r != null && r > info.teams - a.n;
        else if (a.op === "notbottom") ok = r != null && r <= info.teams - a.n;
        else {
          const pv = st.total ? v * pace : v;
          if (st.total && pace !== 1) { why += ", " + fmtNum(Math.round(pv), st) + " pace"; anyPaced.push(team.season); }
          ok = v != null && cmp(a.op, pv, a.value);
        }
        return { ok, why };
      }
      const st = PLAYER_STATS[a.key];
      const label = (i) => C.player_display_name[i] || "?";
      let members;
      if (a.subject === "QB") { const i = qbOf(team.season, team.team); members = i == null ? [] : [i]; }
      else members = (roster.get(team.season + "|" + team.team) || []).filter((i) => inRole(a.subject, i));
      if (!members.length) return { ok: false, why: "no " + ROLE_NAME[a.subject][0] + " on the roster" };
      const need = a.k || 1;
      const scored = members.map((i) => {
        const v = value(a.key, i);
        const pv = v != null && st.total && !a.op.includes("top") && !a.op.includes("bottom") ? v * pace : v;
        return { i, v, pv, r: a.op === "top" || a.op === "bottom" || a.op === "notbottom" ? rankOf(a.key, a.subject, i) : null };
      }).filter((x) => x.v != null);
      const show = (x) => label(x.i) + " " + fmtNum(x.v, st) + (x.pv !== x.v ? " (" + fmtNum(Math.round(x.pv), st) + " pace)" : "") + (x.r != null ? " #" + x.r : "");
      if (scored.some((x) => x.pv !== x.v)) anyPaced.push(team.season);
      let ok, picks;
      if (a.op === "top" || a.op === "bottom" || a.op === "notbottom") {
        // "bottom N" is measured against the ranked pool: rank > pool size - N
        const pool = rankCache.get(team.season + "|" + a.subject + "|" + a.key);
        const size = pool ? pool.size : 0;
        const pass = (x) => a.op === "top" ? x.r <= a.n : a.op === "bottom" ? x.r > size - a.n : x.r <= size - a.n;
        const ranked = scored.filter((x) => x.r != null).sort((x, y) => x.r - y.r);
        const good = ranked.filter(pass);
        ok = good.length >= need;
        picks = (good.length >= need ? good : ranked.length ? ranked : scored).slice(0, need);
      } else if (a.sum) {
        const top = scored.slice().sort((x, y) => st.asc ? x.pv - y.pv : y.pv - x.pv).slice(0, need);
        const tot = top.reduce((t, x) => t + x.pv, 0);
        ok = top.length >= need && cmp(a.op, tot, a.value);
        return { ok, why: top.map(show).join(" + ") + " = " + fmtNum(Math.round(tot), st) };
      } else {
        const sorted = scored.slice().sort((x, y) => st.asc ? x.pv - y.pv : y.pv - x.pv);
        const good = sorted.filter((x) => cmp(a.op, x.pv, a.value));
        ok = good.length >= need;
        picks = (good.length >= need ? good : sorted).slice(0, need);
      }
      return { ok, why: picks.length ? picks.map(show).join(", ") : "no qualifying " + ROLE_NAME[a.subject][0] };
    }

    const out = inScope.map((team) => {
      const checks = [], whys = [];
      for (const req of q.reqs) {
        let pass = false; const altWhy = [];
        for (const alt of req.alts) {
          const res = alt.map((a) => evalAtom(a, team));
          const ok = res.every((x) => x.ok);
          altWhy.push({ ok, why: res.map((x) => (x.ok ? "✓ " : "✗ ") + x.why).join("; ") });
          if (ok) pass = true;
        }
        checks.push(pass);
        whys.push(pass ? altWhy.filter((x) => x.ok).map((x) => x.why).join(" · or · ") : altWhy.map((x) => x.why).join(" · or · "));
      }
      const qb = qbOf(team.season, team.team);
      return {
        season: team.season, team: team.team, record: team.wins + "-" + team.losses + (team.ties ? "-" + team.ties : ""),
        games: team.games, sched_games: team.sched_games, met: checks.filter(Boolean).length, total: checks.length, checks, whys,
        qb: qb == null ? null : C.player_display_name[qb],
        point_diff: team.point_diff, ppg: team.ppg, papg: team.papg, ypg: team.ypg, ypg_allowed: team.ypg_allowed,
        turnover_diff: team.turnover_diff, st_epa: team.st_epa,
      };
    });
    out.sort((a, b) => b.met - a.met || b.season - a.season || b.point_diff - a.point_diff || (a.team < b.team ? -1 : 1));
    const all = out.filter((r) => r.met === r.total).length;
    const notes = q.reqs.map((r) => (r.label === "•" ? "• " : r.label + ". ") + r.alts.map((alt) => alt.map(describe).join(" and ")).join("  — or —  "));
    const readNotes = [];
    for (const s of [...new Set(anyPaced)].sort()) {
      const info = seasonInfo.get(s);
      readNotes.push(s + " is in progress (" + info.maxGames + " of " + info.sched + " games): totals in thresholds are paced to " + info.sched + " games from each team's games played; ranks and rates are as they stand");
    }
    readNotes.push("QB means the team's starter (most pass attempts); a receiver or RB is anyone on the roster at that position");
    const passCounts = q.reqs.map((_, k) => out.filter((r) => r.checks[k]).length);
    return { seasons: q.seasons, reqs: q.reqs, notes, readNotes, ignored: q.ignored, rows: out, all, passCounts, scope: inScope.length };
  }

  const api = { isTeamQuery, parse, run, TeamQueryError, TEAM_STATS, PLAYER_STATS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GridironTeams = api;
})(typeof window !== "undefined" ? window : globalThis);
