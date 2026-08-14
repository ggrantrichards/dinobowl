// Regression coverage for the visual / special-teams / QB overhaul.
"use strict";
const H = require("./harness.js");
const fs = require("fs");
const path = require("path");
const { step, stepFor, key, G } = H;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  [" + detail + "]" : "")); }
}
const SRC = fs.readFileSync(path.join(__dirname, "..", "static", "game", "game.js"), "utf8");
const SPRITES = fs.readFileSync(path.join(__dirname, "..", "static", "game", "sprites.js"), "utf8");

(async () => {
  await new Promise((r) => setTimeout(r, 180));
  const g = G(), dbg = g.debug;
  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  if (g.state === "intro") key("Enter");
  g.drive = "A"; g.losYd = 35; g.down = 1; g.toGain = 10;

  // Football moments retain the compact hand-authored dino maps rather than
  // replacing them with a larger, generic action body.
  const sheet = g.sheets.A;
  // AA animation pass (owner play-test): walk cycles deliberately expanded
  // 2->4 frames (contact/pass-up/contact-B/pass-down with baked bounce);
  // quetz stays 2 ground + 2 flight. Still compact hand-authored maps.
  check("live moments preserve the original compact species sprites",
    !!sheet && !sheet.poses && sheet.troodon && sheet.trike && sheet.quetz &&
    sheet.troodon.n === 4 && sheet.trike.n === 4 && sheet.quetz.n === 4 &&
    sheet.troodon.w === 32 && sheet.trike.w === 32 && sheet.quetz.w === 32 &&
    !SRC.includes("sheet.poses") && !SPRITES.includes("out.poses"));
  check("replay GIF captures the compact action finish at HD pixel-art size",
    SRC.includes("const GIF_W = 480, GIF_H = 270, GIF_MAX_FRAMES = 120") && SRC.includes("gifGrabFrame()") &&
    SRC.includes("G.replay.frames.length - 150"));
  check("pass aim no longer renders a threat/risk reticle", !SRC.includes("cx.arc(target.x - G.camX, target.y, 15") && !SRC.includes("cx.fillText(read.label"));
  check("lob arc uses the lower presentation apex", SRC.includes("clamp(d * 0.17, 20, 74)"));

  // Kickoffs and kick returns are removed: no kick meter, no run-back — the
  // receiving team simply takes over at its own 25.
  g.state = "dead"; g.deadT = 0; g.deadNext = null; g.drive = "B"; g.clock = 400;
  dbg.startKickoff("A");
  // AA pass (owner ask): the kickoff is now a VISIBLE 1.7s boot-and-flight
  // beat — still no live return, the ball just sails on camera. Ride it out.
  H.stepFor(2.0);
  check("kickoff/returns removed — receiving team starts at its own 25, no kick or return",
    g.drive === "A" && g.losYd === 25 && !g.returnPlay && g.state !== "kick" && g.state !== "kickfly",
    g.drive + "/" + g.losYd + "/" + g.state + "/" + !!g.returnPlay);
  check("the live kick-return builder is gone from the engine", !SRC.includes("function startKickReturn"));

  // CPU quarterback with a human receiver must select a safe read, not force
  // that receiver into a defender's chest.
  g.state = "dead"; g.deadT = 0; g.deadNext = null; g.drive = "A"; g.losYd = 42; g.down = 1; g.toGain = 10;
  dbg.enterPlaycall(); stepFor(0.2);
  const play = (g.callsheet || []).find((p) => p.type === "pass") || g.callsheet[0];
  dbg.choosePlay(play, false);
  const wr = g.players.find((e) => e.team === "off" && e.routeEligible);
  if (wr) { g.players.forEach((e) => e.controlled = false); wr.controlled = true; g.controlled = wr; }
  key(" ");
  const qb = g.ball.holder;
  g.players.filter((e) => e.team === "def").forEach((e, i) => { e.x = qb.x + 410 + i * 9; e.y = 110 + i * 30; e.vx = e.vy = 0; });
  // 1.2 was chosen to sit just past the old `minHold` of 1.0. The A6 balance pass
  // raised minHold to 1.5 (elite 1.35) so the CPU QB lets routes develop instead
  // of dumping the ball at the first safe checkdown, so 1.2 is now INSIDE the
  // hold window and the QB correctly declines to throw. Moved past the new
  // threshold — the assertion below is about WHICH read he picks for a
  // user-controlled receiver, not about when he is allowed to throw
  // (LESSON #18: move the test with a comment when the design deliberately moved).
  g.playT = 1.8;
  const reads = dbg.cpuReadBoard(qb);
  dbg.cpuQB(0.016);
  check("CPU QB identifies a safe projected window", reads.length > 0 && reads[0].window.risk < 0.40, reads[0] && reads[0].window.risk);
  check("CPU QB throws a safe ball for a user-controlled receiver", g.ball.mode === "air" && !g.ball.away && g.ball.target,
    g.ball.mode + "/" + !!g.ball.away);

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exitCode = fail ? 1 : 0;
})();
