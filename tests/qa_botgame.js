// QA bot: plays full games through the real engine and prints a JSON balance
// report — box scores, completion %, INT rate, sacks, yards/play — plus
// physics-feel metrics (line overlap %, contested-catch displacement).
// Usage: node tests/qa_botgame.js [games=2]
"use strict";
const H = require("./harness.js");
const { step, stepFor, key, mouse, G } = H;

const GAMES = Number(process.argv[2] || 2);

(async () => {
  await new Promise((r) => setTimeout(r, 250));
  const g = G();
  const dbg = g.debug;

  // ---- boot into exhibition
  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  key("Enter");                       // skip intro
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");
  stepFor(2.6);

  // ---- simple but competent side-A pilot: on offense, snap and throw to the
  // most open receiver at a sane time; on defense, let the AI cover (switch
  // control off by never pressing keys). This isolates ENGINE balance.
  function pilotTick() {
    const S = g.state;
    if (S === "playcall") { key("1"); return; }
    if (S === "defcall") { key("1"); return; }
    if (S === "presnap") { key(" "); return; }
    if (S === "over") { key("Enter"); return; }
    if (S === "dead" || S === "replay" || S === "halftime") {
      if (S === "halftime") key("Enter");
      return;
    }
    if (S !== "live") { key("Enter"); return; }
    // live offense with the ball in the QB's hands: pick the best window
    if (g.drive === "A" && g.phase === "drop" && g.ball.holder && g.playT > 0.85) {
      const qb = g.ball.holder;
      const board = dbg.cpuReadBoard ? dbg.cpuReadBoard(qb) : null;
      if (board && board.length) {
        const pick = board.find((r) => r.window && r.window.risk <= 0.45) ||
          (g.playT > 2.4 && board[0].window && board[0].window.risk <= 0.6 ? board[0] : null);
        if (pick) {
          g.aim = pick.lead;
          mouse("mousedown", 480, 270, 2); mouse("mouseup", 480, 270, 2);   // bullet via right-click
        } else if (g.playT > 2.8) {
          key("x");   // nothing there — a competent human throws it away
        }
      }
    }
    // time the catch jump like a human: SPACE as the ball arrives
    if (g.drive === "A" && g.ball && g.ball.mode === "air" && !g.ball.away &&
      g.ball.T && g.ball.t / g.ball.T > 0.8 && !g.__jumped) {
      g.__jumped = true; key(" ");
    }
    if (!g.ball || g.ball.mode !== "air") g.__jumped = false;
  }

  const overlapSamples = [];
  function samplePhysics() {
    if (g.state !== "live" || !g.players) return;
    for (const e of g.players) {
      if (e.state !== "rush" || !e.blockedBy) continue;
      const b = e.blockedBy;
      const full = (e.bodyR || 14) + (b.bodyR || 14) + 2;
      const d = Math.hypot(e.x - b.x, e.y - b.y);
      overlapSamples.push(Math.max(0, 1 - d / full));
    }
  }

  const reports = [];
  for (let game = 0; game < GAMES; game++) {
    // fresh game state
    g.quarter = 1; g.clock = 180; g.score.A = 0; g.score.B = 0; g.ot = false;
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
    g.gameStats = {}; g.stats = g.stats || {}; g.drive = game % 2 ? "B" : "A";
    g.losYd = 25; g.down = 1; g.toGain = 10; g.patMode = false; g.practice = false;
    g.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP" };
    g.qaTele = g.qaTele || [];
    dbg.enterPlaycall();
    let guard = 0;
    while (g.state !== "over" && guard < 200000) {
      pilotTick();
      step(16.7); guard++;
      if (guard % 4 === 0) samplePhysics();
      if (g.lastErr) { console.error("RUNTIME ERROR:", g.lastErr); process.exit(1); }
    }
    // collect the box score
    const lines = Object.values(g.gameStats || {});
    const qbs = lines.filter((s) => s.att > 0).map((s) => ({
      side: s.side, name: s.name, cmp: s.cmp, att: s.att, yds: s.passYds, td: s.passTd, int: s.passInt,
    }));
    const rush = lines.filter((s) => s.car > 0).map((s) => ({ side: s.side, name: s.name, car: s.car, yds: s.rushYds }));
    const sacks = lines.reduce((n, s) => n + (s.sacks || 0), 0);
    reports.push({ game: game + 1, score: { A: g.score.A, B: g.score.B }, qbs, rush, sacks });
    key("Enter"); stepFor(1.0);   // leave the over screen
    // drive back to a fresh playcall for the next loop
    for (let i = 0; i < 30 && !["playcall", "defcall", "menu", "title", "hub", "pregame", "dead", "presnap"].includes(g.state); i++) { key("Enter"); stepFor(0.3); }
  }

  const ov = overlapSamples.length
    ? overlapSamples.reduce((a, b) => a + b, 0) / overlapSamples.length : 0;
  const allQbs = reports.flatMap((r) => r.qbs);
  const agg = (side) => {
    const qs = allQbs.filter((q) => q.side === side);
    const t = qs.reduce((a, q) => ({ cmp: a.cmp + q.cmp, att: a.att + q.att, yds: a.yds + q.yds, td: a.td + q.td, int: a.int + q.int }),
      { cmp: 0, att: 0, yds: 0, td: 0, int: 0 });
    t.pct = t.att ? Math.round(100 * t.cmp / t.att) : 0;
    return t;
  };
  const tele = {};
  for (const t of (g.qaTele || [])) { const k = t.drive + "|" + t.tag; tele[k] = (tele[k] || 0) + 1; }
  console.log(JSON.stringify({
    tele,
    games: reports,
    passing: { A_pilot: agg("A"), B_cpu: agg("B") },
    physics: { engagedBlockOverlapPct: Math.round(ov * 1000) / 10, samples: overlapSamples.length },
  }, null, 2));
  process.exit(0);
})();
