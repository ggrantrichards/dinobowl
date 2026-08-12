// First-down rise chain: a carrier tackled past the sticks must visibly play
// tackled → prone → GETUP (stand back up) → celebrate, in that order.
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
  key("Enter"); key("Enter"); key("Enter"); key("Enter"); key("Enter");
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");
  stepFor(2.6);
  g.practice = false;

  // the getup action pack exists on every species sheet
  const sheet = g.sheets && g.sheets.A;
  check("sprites: getup action pack built", !!(sheet && sheet.carno && sheet.carno.actions && sheet.carno.actions.getup &&
    sheet.carno.actions.getup.n >= 3), sheet && sheet.carno && Object.keys(sheet.carno.actions || {}).join(","));

  // set up a run that will be tackled PAST the line to gain
  g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
  g.drive = "A"; g.losYd = 35; g.down = 2; g.toGain = 5; g.patMode = false;
  g.weather.type = "CLEAR"; g.weather.wind = { x: 0, y: 0 };
  dbg.enterPlaycall(); stepFor(0.2);
  if (g.state === "playcall") dbg.choosePlay(g.callsheet.find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.2);
  key(" ");
  stepFor(0.3);
  const rb = g.players.find((e) => e.team === "off" && e.role === "RB") || g.players.find((e) => e.team === "off");
  check("reached a live play", g.state === "live" && !!rb, "state=" + g.state);
  if (g.state === "live" && rb) {
    g.carrier = rb; g.ball = { mode: "held", holder: rb, x: rb.x, y: rb.y, z: 12 };
    g.phase = "carry"; rb.state = "carry"; rb.proneT = 0; rb.staggerT = 0;
    // move him past the sticks, then have a defender wrap him up
    const fdX = (typeof g.losYd === "number") ? null : null;
    rb.x = 200 + (g.losYd + g.toGain + 2) * 24;   // xAtYd equivalent: FIELD_X0=10*24=240... use game helper below
  }
  // use real coordinates via a probe entity: place carrier 2 yds past the sticks
  if (g.carrier) {
    const yd = g.losYd + g.toGain + 2;
    // FIELD_X0 = 240 (10 yd * 24 px) in this build
    g.carrier.x = 240 + yd * 24; g.carrier.y = 296;
    const d = g.players.find((e) => e.team === "def");
    d.x = g.carrier.x - 10; d.y = g.carrier.y; d.diveT = 0.3; d.vx = 260; d.vy = 0;
    d.staggerT = 0; d.tackleCd = 0; d.proneT = 0;
    const oldRnd = Math.random; Math.random = () => 0.35;   // tackle lands, no fumble
    stepFor(0.5);
    Math.random = oldRnd;
  }
  check("play ended (whistle)", g.state === "dead" || g.state === "replay", "state=" + g.state);

  // sample the carrier's pose sequence through the dead beat
  const seen = [];
  const who = g.fdCelebEnt;
  check("first down awarded to the tackled carrier", !!who && g.down === 1, "down=" + g.down + " who=" + (who && who.name));
  // The AA pacing pass trims the dead beat to 0.6s and lets pose chains
  // finish BEHIND the play-call cards (tickDeadEntities also runs in
  // playcall/defcall) — so the rise is observed across both states now.
  for (let i = 0; i < 200 && ["dead", "playcall", "defcall"].includes(g.state); i++) {
    step(16.7);
    const p = who && who.poseT > 0 ? who.pose : "";
    if (p && seen[seen.length - 1] !== p) seen.push(p);
  }
  const iTackled = seen.findIndex((p) => p === "tackled" || p === "prone");
  const iGetup = seen.indexOf("getup");
  const iCeleb = seen.indexOf("celebrate");
  check("rise chain plays down → GETUP → celebrate in order",
    iTackled >= 0 && iGetup > iTackled && iCeleb > iGetup, "seq=" + seen.join("→"));

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
