// QA bot: plays full games through the real engine and prints a JSON balance
// report — box scores, completion %, INT rate, sacks, yards/play — plus
// physics-feel metrics (line overlap %, contested-catch displacement).
// Usage: node tests/qa_botgame.js [games=2] [seed]
//
// SEED PINNING (added 2026-08-12, and it is the difference between a usable
// balance instrument and a coin flip). Unseeded, this harness draws different
// matchups and different play selections every run, so two runs of the SAME
// build produced pilot INT 37 vs 53 and CPU completion 96% vs 85%. That makes
// any before/after comparison meaningless and is exactly the trap LESSON #24
// describes. Pass a seed and Math.random becomes a deterministic mulberry32
// stream installed BEFORE the engine boots, so two runs of the same build at the
// same seed are identical and a diff attributes cleanly to the code change.
// Balance work should always pass a seed; leave it off only to sample variety.
"use strict";

const SEED = process.argv[3] == null ? null : Number(process.argv[3]);
if (SEED != null) {
  // mulberry32 — small, fast, good enough for gameplay sampling
  let a = SEED >>> 0;
  Math.random = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  // ---- A COMPETENT HUMAN PILOT (rewritten 2026-08-12).
  // The previous pilot was a FLOOR, not a measurement (LESSON #16: "a scripted
  // pilot's ceiling is not the engine's ceiling"). It produced 4.3 yds/att and 0
  // points a game, and four separate things about it — not the engine — were
  // dragging those numbers down:
  //
  //  1. IT INHERITED THE BOARD'S CHECKDOWN BIAS WHOLE. It took the first read
  //     with risk <= 0.45 out of `cpuReadBoard`, but that board is already sorted
  //     by `depth * 1.05 + separation * 1.22 - risk * 145`, so each 0.01 of risk
  //     costs 1.45 YARDS of depth: a 4-yard checkdown at risk 0.02 (+1.3) outranks
  //     a 25-yard shot at risk 0.20 (-2.75). board[0] is the SHORTEST read by
  //     construction, so "first acceptable read" meant "shortest read", always.
  //     The pilot now RE-RANKS every read with its own value function so that the
  //     engine's read-selection bias shows up in the ENGINE's numbers (side B) and
  //     not in the pilot's.
  //  2. EVERY THROW WAS A FLAT BULLET. It only ever right-clicked, and never set
  //     `G.slingPull`. The engine's own CPU throws a bullet only for depth <= 9 at
  //     risk < 0.34 and otherwise LOBS with `slingPull = clamp(0.4 + depth/30,
  //     0.45, 1.0)` so the arc matches the depth. A flat deep ball arrives LOW, and
  //     the drop model is a low-ball TIP — so the pilot was converting its own deep
  //     completions into tips. It now lobs with the same depth-scaled pull.
  //  3. IT THREW AT 0.85s, before deep routes had developed. Now it holds the ball
  //     and only fires early for a genuinely open deep shot.
  //  4. IT PRESSED SPACE AFTER EVERY THROW, which LESSON #16 records as having
  //     "mistimed every catch jump and made the engine look broken". Removed
  //     entirely: AI receivers already time their own leaps via `jumpTimed`, and
  //     that is the behaviour we actually want to measure.
  //
  // It also had NO pressure awareness and took ~10 sacks a game; a human throws it
  // away instead of eating one.
  // How much a pick costs, in yards, in the pilot's head. This is the pilot's
  // RISK APPETITE and it is CALIBRATED, not guessed: it is tuned so the pilot
  // lands on the owner's Retro Bowl spec of ~80% completion and an ~8% INT rate
  // (see ROADMAP.md BALANCE TARGETS). A pilot that plays to the spec makes
  // yards-per-attempt a clean reading of what the ENGINE offers.
  // CALIBRATION SWEEP, seed 4242, 6 games, with the slingshot lob working:
  //   cost  comp%  INT/att%  yds/att  yds/gm     spec: 80% comp, ~8% INT/att
  //     25    76      6.7      6.0     180   <- CHOSEN, closest to spec
  //     15    74     13.5      7.0     190
  //     10    72     15.7      6.6     190
  //      6    76     13.8      7.3     194
  // Being bolder than 25 buys about one yard an attempt for DOUBLE the spec INT
  // rate, so 25 it is. For reference, the old bullet-only pilot managed 76% /
  // 7.6% / 4.3 yds/att / 152 yds-gm, so the rewrite is worth +1.7 yds/att and
  // +28 yards a game of measurement headroom that was previously being blamed
  // on the engine.
  // Overridable for sweeps: PILOT_INT_COST / PILOT_RISK_CAP.
  const INT_COST_YDS = Number(process.env.PILOT_INT_COST || 25);
  const RISK_CAP = Number(process.env.PILOT_RISK_CAP || 0.62);
  // expected value of a read, the way a competent player weighs it: yards you
  // probably get, minus what a pick would cost you
  const readValue = (r) => (r.depth || 0) * (1 - r.window.risk) - r.window.risk * INT_COST_YDS;

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
    if (g.drive !== "A" || g.phase !== "drop" || !g.ball.holder) return;

    const qb = g.ball.holder;
    const board = dbg.cpuReadBoard ? dbg.cpuReadBoard(qb) : null;
    if (!board || !board.length) return;

    // is someone in his face? a human feels this and gets rid of the ball
    const heat = g.players.some((e) => e.team === "def" && !e.blockedBy &&
      Math.hypot(e.x - qb.x, e.y - qb.y) < 46);

    const ranked = board.slice().sort((a, b) => readValue(b) - readValue(a));
    const best = ranked[0];
    const v = readValue(best);
    const t = g.playT;

    // Hold the ball like a human: early only for a genuinely open deep shot,
    // then progressively less picky, and under pressure take what is there.
    let fire = false;
    if (heat && t > 0.6) fire = v > -4;            // pressured: anything sane
    else if (t < 1.15) fire = v > 12;              // early: only a real shot
    else if (t < 2.6) fire = v > 2;
    else fire = v > -2;

    // ---- windup in progress? steer it, then release.
    // THE LOB HAS TO BE A REAL SLINGSHOT DRAG. Setting G.aim and clicking does
    // not work: a left mousedown in the drop phase sets G.slingAnchor and
    // NULLS G.aim (game.js onPress), and update() then recomputes
    // `G.aim = slingAim()` every frame from the drag vector while mouse.down is
    // true. slingAim is a catapult — `dx = anchor - mouse`, so you drag AWAY
    // from the target — and the pull DISTANCE sets both range and arc
    // (slingPull, which only throwLob reads; a bullet is always flat).
    // A first attempt here fired mousedown+mouseup with a programmatic G.aim and
    // silently threw NOTHING, because aim was null by the time onRelease ran:
    // attempts collapsed to ~2 a game and the numbers looked like a balance
    // result. So: drag, read back the engine's OWN computed aim, correct once,
    // then release. No duplicated range/arc maths, so this cannot drift from the
    // engine the way a reimplementation would.
    if (g.__wind) {
      const w = g.__wind;
      const cur = g.aim;
      if (cur && w.tries < 2) {
        const errX = w.tx - cur.x, errY = w.ty - cur.y;
        if (Math.hypot(errX, errY) > 12) {
          // aim lands along the drag ray at a distance set by the pull, so
          // scale the pull by how short/long we came in
          const have = Math.hypot(cur.x - qb.x, cur.y - qb.y) || 1;
          const want = Math.hypot(w.tx - qb.x, w.ty - qb.y);
          w.pull = Math.max(20, Math.min(300, w.pull * (want / have)));
          const u = { x: (w.tx - qb.x) / want, y: (w.ty - qb.y) / want };
          mouse("mousemove", w.ax - u.x * w.pull, w.ay - u.y * w.pull, 0);
          w.tries++;
          return;
        }
      }
      mouse("mouseup", w.mx, w.my, 0);   // release -> onRelease -> throwLob
      g.__wind = null;
      return;
    }

    if (fire && best.window.risk < RISK_CAP) {
      // bullet for the short stuff, exactly the split cpuQB uses
      const quick = best.depth <= 9 && best.window.risk < 0.34 && !heat;
      if (quick) {
        g.aim = best.lead;
        mouse("mousedown", 480, 270, 2); mouse("mouseup", 480, 270, 2);   // right button = bullet
        return;
      }
      // start the sling windup toward the lead point
      const tx = best.lead.x, ty = best.lead.y;
      const want = Math.hypot(tx - qb.x, ty - qb.y) || 1;
      const u = { x: (tx - qb.x) / want, y: (ty - qb.y) / want };
      // first guess: slingAim maps a ~14..274px pull onto 46px..maxRange, so
      // start proportional and let the correction pass above finish the job
      const pull = Math.max(20, Math.min(300, 14 + (want / 720) * 260));
      const ax = qb.x - g.camX, ay = qb.y;
      mouse("mousedown", ax, ay, 0);
      // onPress may have grabbed a nearby receiver (or re-snapped); put the QB
      // back in charge and plant the anchor ourselves
      g.players.forEach((e) => { e.controlled = false; });
      qb.controlled = true; g.controlled = qb;
      g.slingAnchor = { x: ax, y: ay };
      const mx = ax - u.x * pull, my = ay - u.y * pull;
      mouse("mousemove", mx, my, 0);
      g.__wind = { tx, ty, ax, ay, mx, my, pull, tries: 0 };
      return;
    }
    if (t > 3.0) key("x");   // nothing there — throw it away rather than eat a sack
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
    seed: SEED,   // null = unseeded, so this run is NOT comparable to another
    tele,
    games: reports,
    passing: { A_pilot: agg("A"), B_cpu: agg("B") },
    physics: { engagedBlockOverlapPct: Math.round(ov * 1000) / 10, samples: overlapSamples.length },
  }, null, 2));
  process.exit(0);
})();
