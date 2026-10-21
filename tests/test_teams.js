// Gridiron team questions (static/gridiron/teams.js): how a checklist is read,
// and the pacing rule, on a small made-up league so the answers never drift
// with the data.
//
//     node tests/test_teams.js
const assert = require("assert");
const path = require("path");
const TM = require(path.join(__dirname, "..", "static", "gridiron", "teams.js"));

let failures = 0;
function check(name, fn) {
  try { fn(); console.log("PASS  " + name); }
  catch (e) { failures++; console.log("FAIL  " + name + "\n      " + e.message); }
}
const shape = (q) => q.reqs.map((r) => [r.label, r.alts.map((alt) => alt.map((a) =>
  [a.subject, a.key, a.op, a.n != null ? a.n : a.value, a.k || 1, !!a.sum].join(" ")))]);

const CHECKLIST = `2026 NFL team with: 

Have top 15 passer rating QB

1. Have top 12 combined passing + rushing yards QB or top 8 in passing + rushing yards/game
2. Team top 6 in point differential
3. Have a 950+ yard receiver or two 750+ receiving yards
4. QB had at least 64% completion percentage or top 3 in passing touchdowns
5. Team top 12 in yards/game
6. Team top 16 in points/game allowed and top 20 in yards/game allowed OR top 10 in points/game allowed
7. Team top 16 in turnover differential or top 8 in scoring defense or QB top 3 in passing TDs
8. RB with 1000 rushing yards or two with 1500 total rushing yards

• 10. Special teams that isn't bottom 10`;

check("a pasted checklist reads line by line, with its own numbers", () => {
  assert.ok(TM.isTeamQuery(CHECKLIST));
  const q = TM.parse(CHECKLIST);
  assert.deepStrictEqual(q.seasons, { min: 2026, max: 2026 });
  assert.deepStrictEqual(q.ignored, []);
  assert.deepStrictEqual(shape(q), [
    ["•", [["QB passer_rating top 15 1 false"]]],
    ["1", [["QB pr_yards top 12 1 false"], ["QB pr_ypg top 8 1 false"]]],
    ["2", [["team point_diff top 6 1 false"]]],
    ["3", [["REC receiving_yards >= 950 1 false"], ["REC receiving_yards >= 750 2 false"]]],
    ["4", [["QB completion_pct >= 0.64 1 false"], ["QB passing_tds top 3 1 false"]]],
    ["5", [["team ypg top 12 1 false"]]],
    ["6", [["team papg top 16 1 false", "team ypg_allowed top 20 1 false"], ["team papg top 10 1 false"]]],
    ["7", [["team turnover_diff top 16 1 false"], ["team papg top 8 1 false"], ["QB passing_tds top 3 1 false"]]],
    ["8", [["RB rushing_yards >= 1000 1 false"], ["RB rushing_yards >= 1500 2 true"]]],
    ["10", [["team st_epa notbottom 10 1 false"]]],
  ]);
});

check("one line: the header ends at 'teams', 'with' separates requirements", () => {
  const q = TM.parse("2026 teams top 6 in point differential with a top 10 passer rating QB and a 1000+ yard RB");
  assert.deepStrictEqual(shape(q), [
    ["1", [["team point_diff top 6 1 false"]]],
    ["2", [["QB passer_rating top 10 1 false", "RB rushing_yards >= 1000 1 false"]]],
  ]);
});

check("one line: 'since' sets a span; a role alone carries to its stat", () => {
  const q = TM.parse("teams with a 1500+ yard receiver, a QB with 30+ TDs since 2015");
  assert.deepStrictEqual(q.seasons, { min: 2015, max: null });
  assert.deepStrictEqual(shape(q), [
    ["1", [["REC receiving_yards >= 1500 1 false"]]],
    ["2", [["QB passing_tds >= 30 1 false"]]],
  ]);
});

check("player questions are not team questions", () => {
  for (const s of ["QBs with over 65% completion in 2026", "WRs with the highest target share", "RBs with 1000 rushing yards"])
    assert.ok(!TM.isTeamQuery(s), s);
});

// a two-team league: AAA has a back with 400 yards through 6 of 17 games
function league(complete, games) {
  const players = [
    ["q1", "QB One", "QB", "AAA", 6, 200, 1500, 50, 0],
    ["r1", "Back One", "RB", "AAA", 4, 0, 0, 400, 0],
    ["q2", "QB Two", "QB", "BBB", 6, 180, 1200, 30, 0],
    ["r2", "Back Two", "RB", "BBB", 6, 0, 0, 300, 0],
  ];
  const cols = { player_id: [], player_display_name: [], position: [], recent_team: [], games: [], pass_attempts: [],
                 passing_yards: [], rushing_yards: [], receiving_yards: [], season: [] };
  for (const p of players) {
    ["player_id", "player_display_name", "position", "recent_team", "games", "pass_attempts", "passing_yards", "rushing_yards", "receiving_yards"]
      .forEach((c, k) => cols[c].push(p[k]));
    cols.season.push(2030);
  }
  const team = (t, pd, rank) => ({ season: 2030, team: t, games, sched_games: 17, complete, wins: 3, losses: 3, ties: 0,
    point_diff: pd, point_diff_rank: rank, ppg: 20, papg: 20, ypg: 300, ypg_allowed: 300, turnover_diff: 0, st_epa: 0 });
  return { T: { cols, n: players.length }, teams: { meta: { seasons: [2030, 2030] }, rows: [team("AAA", 30, 1), team("BBB", -30, 2)] } };
}

check("mid-season, totals are paced on the team's games: 400 through 6 of 17 is 1,133", () => {
  const { T, teams } = league(false, 6);
  const r = TM.run("2030 NFL team with:\nRB with 1000 rushing yards", teams, T);
  const aaa = r.rows.find((x) => x.team === "AAA");
  assert.strictEqual(aaa.checks[0], true);
  assert.ok(/400 \(1,133 pace\)/.test(aaa.whys[0]), aaa.whys[0]);
  assert.ok(r.readNotes.some((n) => /2030 is in progress \(6 of 17 games\)/.test(n)));
});

check("a finished season uses real totals: no yards for games a player missed", () => {
  const { T, teams } = league(true, 17);
  const r = TM.run("2030 NFL team with:\nRB with 1000 rushing yards", teams, T);
  const aaa = r.rows.find((x) => x.team === "AAA");
  assert.strictEqual(aaa.checks[0], false);
  assert.ok(!/pace/.test(aaa.whys[0]), aaa.whys[0]);
  assert.ok(!r.readNotes.some((n) => /in progress/.test(n)));
});

check("ranks are never paced, and 'QB' is the team's starter", () => {
  const { T, teams } = league(false, 6);
  const r = TM.run("2030 NFL team with:\nTeam top 1 in point differential\nQB top 1 in passing yards", teams, T);
  const aaa = r.rows.find((x) => x.team === "AAA"), bbb = r.rows.find((x) => x.team === "BBB");
  assert.deepStrictEqual([aaa.checks, bbb.checks], [[true, true], [false, false]]);
  assert.strictEqual(aaa.qb, "QB One");
});

console.log(failures ? `\n${failures} failed` : "\nall team checks passed");
process.exit(failures ? 1 : 0);
