// REGRESSION: a throw released while the QB is IMPROVISING (out of the pocket
// for 3s, or running hard out of it) used to freeze the whole game.
//
// G.qbImprov is recomputed AFTER the defenders' entity pass each tick. On the
// first frame after the release the flag was still true while G.ball.holder
// was already null, so the scramble-rally branches in man and zone coverage
// called pursue(e, null) -> dist(e, null) -> "Cannot read properties of null
// (reading 'x')". update() threw before it could recompute the flag, so it
// threw again on every frame after: the field sat frozen under the notice for
// the rest of the session (owner report 2026-09-09: "QB ran backwards and
// threw pretty far forward").
"use strict";
const H = require("./harness.js");
const { step, stepFor, key, mouse, G } = H;
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra ? "  -- " + extra : "")); }
}
(async () => {
  await new Promise((r) => setTimeout(r, 200));
  const g = G(); const dbg = g.debug;
  key("Enter"); key("Enter"); key("Enter"); key("Enter"); key("Enter");
  g.openingDrive = "A"; g.drive = "A"; key("Enter"); stepFor(2.6);
  let improvThrows = 0, rallyFrames = 0;
  for (let rep = 0; rep < 12 && !g.lastErr; rep++) {
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
    g.drive = "A"; g.losYd = 30 + rep * 3; g.down = 1; g.toGain = 10; g.patMode = false; g.clock = 500;
    dbg.enterPlaycall(); stepFor(0.15);
    if (g.state === "playcall") dbg.choosePlay((g.callsheet || []).find((p) => p.type === "pass") || g.callsheet[0], false);
    stepFor(0.1);
    if (g.state === "presnap") key(" ");
    // hold the ball past the 3.0s improv threshold, backing up the whole time
    H.keyHold("a");
    for (let i = 0; i < 200 && g.state === "live" && g.phase === "drop"; i++) step(16.7);
    H.keyRelease("a");
    if (g.state !== "live" || g.phase !== "drop") continue;         // sacked first — try another rep
    if (!g.qbImprov) continue;
    // the rally is live: defenders are chasing the holder on this very frame
    rallyFrames++;
    const qb = g.ball.holder;
    mouse("mousedown", 480, 270);
    g.aim = { x: qb.x + 260, y: qb.y };                               // a deep ball downfield
    mouse("mouseup", 480, 270);                                       // release -> throwLob
    if (g.ball.mode !== "air") continue;
    improvThrows++;
    check("rep " + rep + ": the release ends the improvisation on the same frame", g.qbImprov === false, String(g.qbImprov));
    // THE frame that used to throw, and the ten after it
    for (let i = 0; i < 12; i++) step(16.7);
    check("rep " + rep + ": no runtime error on the frames after an improv throw", !g.lastErr, g.lastErr);
    for (let i = 0; i < 400 && g.state === "live"; i++) step(16.7);
    check("rep " + rep + ": the play reaches a whistle", g.state !== "live", g.state + "/" + g.phase);
  }
  check("the scenario was actually exercised (>= 3 improv throws)", improvThrows >= 3, "improvThrows=" + improvThrows + " rallyFrames=" + rallyFrames);
  check("no runtime error over the whole run", !g.lastErr, g.lastErr);
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
