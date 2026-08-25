// Quarter-clock rule: 0:00 during a live play must NOT end the quarter or the
// game — the play runs to its whistle (tackle / OOB / score) first.
"use strict";
const H = require("./harness.js");
const { step, stepFor, key, G } = H;

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (info ? "  [" + info + "]" : "")); }
}

(async () => {
  await new Promise((r) => setTimeout(r, 200));
  const g = G();
  const dbg = g.debug;
  // boot into an exhibition game (same deterministic path as test_all)
  key("Enter");            // title -> menu
  key("Enter");            // EXHIBITION -> select
  key("Enter"); key("Enter"); // pick A, pick B -> team intro
  key("Enter");            // skip the intro -> pregame
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");            // opening possession spotted at the 25
  stepFor(2.6);
  g.practice = false;
  const forceDrive = (side) => {
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
    g.drive = side; g.losYd = 35; g.down = 1; g.toGain = 10; g.patMode = false;
  };

  // --- Q1: clock expires mid-play, play must finish first
  g.quarter = 1; g.clock = 1.0; g.score.A = 0; g.score.B = 0;
  forceDrive("A");
  dbg.enterPlaycall();
  g.quarter = 1; g.clock = 1.0;   // enterPlaycall may run clock/quarter logic — re-pin
  stepFor(0.2);
  if (g.state === "playcall") dbg.choosePlay(g.callsheet.find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.2);
  key(" ");   // snap
  stepFor(0.2);
  check("clock test reached a live play", g.state === "live", "state=" + g.state);
  // force a long-running carry: RB with the ball, everyone else far away
  const rb = g.players.find((e) => e.team === "off" && e.role === "RB") || g.players.find((e) => e.team === "off");
  if (g.state === "live" && rb) {
    g.carrier = rb; g.ball = { mode: "held", holder: rb, x: rb.x, y: rb.y, z: 12 };
    g.phase = "carry"; rb.state = "carry"; rb.proneT = 0; rb.staggerT = 0;
    g.players.forEach((e) => { if (e.team === "def") { e.x = rb.x - 500; e.vx = 0; } });
  }
  stepFor(1.2);   // realtime tick drains the last second of clock mid-carry
  check("clock hit 0:00 while the play is LIVE", g.clock <= 0 && g.state === "live",
    "clock=" + g.clock.toFixed(2) + " state=" + g.state);
  check("quarter did NOT flip mid-play", g.quarter === 1, "q=" + g.quarter);
  // now end the play deterministically: carrier steps out of bounds
  if (g.state === "live" && g.carrier) { g.carrier.y = 60; stepFor(0.2); }
  check("whistle blew (play over)", g.state !== "live", "state=" + g.state);
  for (let t = 0; t < 15 && g.quarter === 1 && !g.half; t += 0.25) stepFor(0.25);
  check("quarter ended only AFTER the whistle", g.quarter === 2 || g.state === "halftime" || !!g.half,
    "q=" + g.quarter + " state=" + g.state);

  // --- Q4: same rule must not end the GAME mid-play
  forceDrive("A");
  g.quarter = 4; g.clock = 1.0; g.ot = false; g.score.A = 21; g.score.B = 7;
  dbg.enterPlaycall();
  g.quarter = 4; g.clock = 1.0;
  stepFor(0.2);
  if (g.state === "playcall") dbg.choosePlay(g.callsheet.find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.2);
  key(" ");
  stepFor(0.2);
  const rb2 = g.players.find((e) => e.team === "off" && e.role === "RB") || g.players.find((e) => e.team === "off");
  if (g.state === "live" && rb2) {
    g.carrier = rb2; g.ball = { mode: "held", holder: rb2, x: rb2.x, y: rb2.y, z: 12 };
    g.phase = "carry"; rb2.state = "carry"; rb2.proneT = 0; rb2.staggerT = 0;
    g.players.forEach((e) => { if (e.team === "def") { e.x = rb2.x - 500; e.vx = 0; } });
  }
  stepFor(1.2);
  check("Q4: game did not end while the play was live", g.state === "live" && g.quarter === 4,
    "state=" + g.state + " q=" + g.quarter);
  if (g.state === "live" && g.carrier) { g.carrier.y = 60; stepFor(0.2); }
  for (let t = 0; t < 15 && g.state !== "over"; t += 0.25) stepFor(0.25);
  check("Q4: game over arrived only after the whistle", g.state === "over", "state=" + g.state);

  // =====================================================================
  // BATCH E — flow and observability.
  // =====================================================================
  // One shared setup: put the game on a live carry that will not end on its
  // own (defenders parked 600px upfield), with the clock pinned where we want
  // it. Returns true when the carry actually took.
  function liveCarry(clockAt) {
    forceDrive("A");
    g.quarter = 1; g.clock = 200; g.ot = false; g.score.A = 0; g.score.B = 0;
    dbg.enterPlaycall();
    g.quarter = 1; g.clock = 200;
    stepFor(0.2);
    if (g.state === "playcall") dbg.choosePlay(g.callsheet.find((p) => p.type === "run") || g.callsheet[0], false);
    stepFor(0.2);
    key(" ");
    stepFor(0.2);
    const rb = g.players.find((e) => e.team === "off" && e.role === "RB") || g.players.find((e) => e.team === "off");
    if (g.state === "live" && rb) {
      g.carrier = rb; g.ball = { mode: "held", holder: rb, x: rb.x, y: rb.y, z: 12 };
      g.phase = "carry"; rb.state = "carry"; rb.proneT = 0; rb.staggerT = 0;
      g.players.forEach((e) => { if (e.team === "def") { e.x = rb.x - 600; e.vx = 0; } });
    }
    g.quarter = 1; g.clock = clockAt;
    return g.state === "live";
  }

  // ---- P0-20: the 0:00 rule banner is an EVENT latch, not "only when the
  // screen happens to be free". LESSON #4 — a correct rule that is invisible
  // reads as a bug. A/B: cross zero once with an empty slot, once with a
  // BROKEN TACKLE toast already up. It must post BOTH times.
  check("P0-20 control run reached a live carry", liveCarry(0.5), "state=" + g.state);
  g.banner = null;
  stepFor(0.6);
  check("P0-20 control — 0:00 posts when the banner slot is empty",
    !!g.banner && g.banner.text === "0:00", g.banner ? g.banner.text : "null");

  check("P0-20 A/B run reached a live carry", liveCarry(0.5), "state=" + g.state);
  g.banner = { text: "BROKEN TACKLE!", sub: "", t: 0.8, tier: "mid", sticky: false };
  stepFor(0.6);
  check("P0-20 the 0:00 banner is NOT vetoed by a banner already on screen",
    !!g.banner && g.banner.text === "0:00", g.banner ? g.banner.text : "null");
  check("P0-20 ...and it posts sticky, so an input cannot trim the rule away",
    !!g.banner && g.banner.sticky === true, JSON.stringify(g.banner));

  // ---- P0-21: a leaked celebration flag froze the quarter clock outright.
  // The latch now has an unconditional lifetime, so it expires even in states
  // that never called updateCelebration() — "live" being the costly one.
  check("P0-21 setup reached a live carry", liveCarry(100), "state=" + g.state);
  g.celebrate = { t: 0.5, style: "hop", scorer: null, spiked: false };
  stepFor(1.6);
  check("P0-21 a leaked celebration EXPIRES during live play", g.celebrate === null,
    JSON.stringify(g.celebrate));
  check("P0-21 ...and the quarter clock burns again once it has",
    (100 - g.clock) > 0.5, "burned " + (100 - g.clock).toFixed(2) + "s");

  // ...and the snap clears both per-play latches outright (LESSON #20).
  forceDrive("A");
  g.quarter = 1; g.clock = 200;
  dbg.enterPlaycall();
  stepFor(0.2);
  if (g.state === "playcall") dbg.choosePlay(g.callsheet.find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.2);
  g.celebrate = { t: 999, style: "hop", scorer: null, spiked: false };
  g.zeroBannerPlay = 12345;
  key(" ");
  check("P0-21 the snap clears a celebration that outlived its beat",
    g.celebrate === null, JSON.stringify(g.celebrate));
  check("P0-20 the snap resets the 0:00 latch", g.zeroBannerPlay === null, String(g.zeroBannerPlay));

  // ---- S3: a dead beat can no longer become a one-way door.
  g.paused = false; g.koFly = null; g.half = null; g.replay = null; g.celebrate = null;
  g.quarter = 1; g.clock = 200; g.patMode = false; g.practice = false; g.note = null;
  g.state = "dead"; g.deadT = 0.05;
  g.deadNext = () => { throw new Error("test: a continuation that throws"); };
  stepFor(0.6);
  check("S3 a THROWING continuation recovers instead of hanging in dead",
    !(g.state === "dead" && !g.deadNext),
    "state=" + g.state + " deadT=" + g.deadT.toFixed(2) + " deadNext=" + (g.deadNext ? "fn" : "null"));
  check("S3 ...and the error is SURFACED, not swallowed into G.lastErr",
    !!g.note && /ERROR/.test(g.note.text) && /throws/.test(String(g.lastErr)),
    JSON.stringify(g.note) + " lastErr=" + g.lastErr);

  // ...and the watchdog covers the other shape: a dead beat with no
  // continuation at all. Three seconds past the whistle is a hang, not a beat.
  g.paused = false; g.koFly = null; g.half = null; g.replay = null; g.celebrate = null;
  g.quarter = 1; g.clock = 200; g.note = null;
  g.state = "dead"; g.deadT = 0.05; g.deadNext = null;
  stepFor(1.5);
  check("S3 watchdog does NOT fire early (the beat gets its full grace)",
    g.state === "dead" && g.deadT < 0, "state=" + g.state + " deadT=" + g.deadT.toFixed(2));
  stepFor(3.0);
  check("S3 watchdog recovers an orphaned dead beat within ~3s",
    !(g.state === "dead" && !g.deadNext),
    "state=" + g.state + " deadT=" + g.deadT.toFixed(2) + " deadNext=" + (g.deadNext ? "fn" : "null"));

  // ...and it must survive the STALE G.koFly this engine leaves lying around.
  // Measured over a full bot game on BOTH the old and the new build: G.koFly
  // is non-null on 100% of frames after the opening kickoff, with the ball
  // long since out of "koflight". A watchdog guarded on a bare "!G.koFly"
  // would therefore be dead code — it could never fire even once — so the
  // guard is written against a flight that is genuinely still animating.
  g.paused = false; g.half = null; g.replay = null; g.celebrate = null;
  g.quarter = 1; g.clock = 200; g.note = null;
  g.koFly = { t: 1.45, T: 1.45, fx: 0, fy: 0, tx: 0, ty: 0 };
  g.ball = { mode: "dead", x: 0, y: 0, z: 0, holder: null };
  g.state = "dead"; g.deadT = 0.05; g.deadNext = null;
  stepFor(4.5);
  check("S3 watchdog is NOT disabled by a stale koFly left over from a kickoff",
    !(g.state === "dead" && !g.deadNext),
    "state=" + g.state + " deadT=" + g.deadT.toFixed(2));

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
