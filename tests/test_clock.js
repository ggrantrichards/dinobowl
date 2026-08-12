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

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
