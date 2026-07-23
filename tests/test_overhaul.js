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
  check("live moments preserve the original compact species sprites",
    !!sheet && !sheet.poses && sheet.troodon && sheet.trike && sheet.quetz &&
    sheet.troodon.n === 2 && sheet.trike.n === 2 && sheet.quetz.n === 4 &&
    sheet.troodon.w === 32 && sheet.trike.w === 32 && sheet.quetz.w === 32 &&
    !SRC.includes("sheet.poses") && !SPRITES.includes("out.poses"));
  check("replay GIF captures the compact action finish at HD pixel-art size",
    SRC.includes("const GIF_W = 480, GIF_H = 270, GIF_MAX_FRAMES = 120") && SRC.includes("gifGrabFrame()") &&
    SRC.includes("G.replay.frames.length - 150"));
  check("pass aim no longer renders a threat/risk reticle", !SRC.includes("cx.arc(target.x - G.camX, target.y, 15") && !SRC.includes("cx.fillText(read.label"));
  check("lob arc uses the lower presentation apex", SRC.includes("clamp(d * 0.17, 20, 74)"));

  // A kickoff has an 11-player unit and turns into a real 11 v 11 return.
  g.state = "dead"; g.deadT = 0; g.deadNext = null;
  dbg.startKickoff("A");
  check("kickoff starts from the 35 with a coverage unit", g.state === "kick" && g.kick.kind === "KO" && g.kick.originYd === 35 && g.players.length === 11,
    g.state + "/" + (g.kick && g.kick.kind) + "/" + g.players.length);
  dbg.startKickReturn("PUNT", 12, 270);
  check("punt becomes a live 11 v 11 return", g.state === "live" && g.phase === "carry" && g.returnPlay &&
    g.players.filter((e) => e.team === "off").length === 11 && g.players.filter((e) => e.team === "def").length === 11,
    g.players.length + "/" + (g.returnPlay && g.returnPlay.kind));
  const ret = g.carrier;
  if (ret) ret.diveT = 0.01;
  stepFor(0.1);
  check("return is spotted as a fresh first down when the play ends", g.state === "dead" && !g.returnPlay && g.down === 1 && g.toGain <= 10,
    g.state + "/" + g.down + "/" + !!g.returnPlay);

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
  g.playT = 1.2;
  const reads = dbg.cpuReadBoard(qb);
  dbg.cpuQB(0.016);
  check("CPU QB identifies a safe projected window", reads.length > 0 && reads[0].window.risk < 0.40, reads[0] && reads[0].window.risk);
  check("CPU QB throws a safe ball for a user-controlled receiver", g.ball.mode === "air" && !g.ball.away && g.ball.target,
    g.ball.mode + "/" + !!g.ball.away);

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exitCode = fail ? 1 : 0;
})();
