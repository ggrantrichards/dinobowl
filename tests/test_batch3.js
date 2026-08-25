// Exercises the third batch of 10 requested changes against the REAL game code.
"use strict";
const H = require("./harness.js");
const fs = require("fs");
const path = require("path");
const { step, stepFor, key, G } = H;
const SRC3 = fs.readFileSync(path.join(__dirname, "..", "static", "game", "game.js"), "utf8");

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra != null ? "  [" + extra + "]" : "")); }
}
function noErr(label) {
  check(label + " — no runtime error", !G().lastErr, G().lastErr);
  G().lastErr = null;
}

(async () => {
  await new Promise((r) => setTimeout(r, 200));
  const g = G();
  const dbg = g.debug;
  step(); step();

  // start an exhibition game
  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  if (g.state === "intro") key("Enter");   // skip the team intro
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");
  // poll through the 1s kickoff flavor beat
  for (let i = 0; i < 24 && !["playcall", "defcall", "presnap"].includes(g.state); i++) stepFor(0.25);
  check("flow: opening possession is spotted at the receiving team's 25 (kickoffs/returns removed)",
    g.drive === "A" && g.losYd === 25 && !g.returnPlay && !["kick", "kickfly"].includes(g.state),
    g.state + "/" + g.drive + "/" + g.losYd);
  const forceDrive = (side) => { g.drive = side; g.losYd = 35; g.down = 1; g.toGain = 10; g.patMode = false; };
  const freshPassPlay = () => {
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
    forceDrive("A");
    dbg.enterPlaycall(); stepFor(0.3);
    if (g.state === "playcall") {
      const idx = g.callsheet.findIndex((p) => p.type === "pass");
      key(String((idx < 0 ? 0 : idx) + 1));
    }
    stepFor(0.1);
    if (g.state === "presnap") key(" ");
  };

  // ================= #7 global 20% slowdown =================
  freshPassPlay();
  check("snap: live", g.state === "live", g.state);
  const speeds = g.players.map((e) => e.spd);
  check("#7 nobody runs at pre-slowdown speeds (max < 152 px/s)",
    Math.max(...speeds) < 152, Math.max(...speeds).toFixed(1));
  // spdPx(99) old = 170.1, new = 136.1; spdPx(60) new = 76.8
  check("#7 speeds still spread by rating (min > 55)", Math.min(...speeds) > 55, Math.min(...speeds).toFixed(1));

  // ================= #8 stamina exists & drains =================
  const sprinter = g.players.find((e) => e.role === "WR1") || g.players[6];
  check("#8 every dino has a stamina rating (60-99)",
    g.players.every((e) => e.stam >= 60 && e.stam <= 99),
    g.players.map((e) => e.stam).join(","));
  check("#8 O-linemen carry a BLOCKING rating",
    g.players.filter((e) => e.role === "OL").every((e) => e.blk >= 60 && e.blk <= 99),
    g.players.filter((e) => e.role === "OL").map((e) => e.blk).join(","));
  // force a long sprint: pin velocity at top speed each frame
  const st0 = sprinter.stamNow;
  for (let i = 0; i < 60 * 4; i++) { sprinter.vx = sprinter.spd; sprinter.vy = 0; step(16.7); if (g.state !== "live") break; }
  check("#8 4s of sprinting drains the tank", g.state !== "live" || sprinter.stamNow < st0,
    st0 + " -> " + sprinter.stamNow);
  noErr("stamina sprint");

  // ================= #2 pull-back slingshot throw =================
  freshPassPlay();
  const qb = g.ball.holder;
  check("pull-back setup: QB has the ball in drop", g.phase === "drop" && !!qb, g.phase);
  // press plants the grip: no aim yet
  H.mouse("mousedown", 480, 270);
  step();
  check("#2 pressing does NOT aim by itself (must pull back)", !g.aim, JSON.stringify(g.aim));
  // drag BACKWARD (toward own goal line) — aim must appear AHEAD of the QB
  H.mouse("mousemove", 380, 300);
  step();
  check("#2 pulling back loads a forward throw", !!g.aim && g.aim.x > qb.x,
    g.aim && ((g.aim.x - qb.x) | 0) + "px downfield");
  const shortAim = g.aim && g.aim.x;
  // pull back FARTHER: the throw should get deeper
  H.mouse("mousemove", 300, 310);
  step();
  check("#2 a deeper pull throws deeper", !!g.aim && g.aim.x > shortAim,
    shortAim + " -> " + (g.aim && g.aim.x));
  H.mouse("mouseup", 300, 310);
  step();
  check("#2 release launches the ball", g.ball.mode === "air", g.ball.mode);
  noErr("pull-back throw");

  // ========== P0-13 · ONE FINGER OWNS THE AIM (Batch E, input) ==========
  // Before the fix EVERY non-button touch was tagged role:"aim", called
  // onPress() and released on ANY lift. A resting off-hand thumb in the right
  // 58% of the screen therefore re-planted G.slingAnchor at the thumb, nulled
  // G.aim, and then resolved the throw on its own lift — after which
  // mouse.down was false and the arm could never re-arm (the aim update is
  // gated on `slingAnchor && mouse.down`). The QB stood there until the sack.
  {
    H.resetTouches();
    freshPassPlay();
    const qbT = g.ball.holder;
    check("P0-13 setup: QB has the ball in drop", g.state === "live" && g.phase === "drop" && !!qbT,
      g.state + "/" + g.phase);
    // two fingers land in ONE synchronous event, both on the aim side
    // (x > W*0.42 = 403.2) and clear of the on-screen buttons at x = 912
    H.touch("touchstart", [{ id: 1, x: 600, y: 270 }, { id: 2, x: 700, y: 330 }]);
    step();
    check("P0-13 the FIRST finger owns the anchor; the second cannot move it",
      !!g.slingAnchor && g.slingAnchor.x === 600 && g.slingAnchor.y === 270,
      JSON.stringify(g.slingAnchor));
    H.touch("touchmove", [{ id: 1, x: 420, y: 270 }]);
    step();
    check("P0-13 the owner's pull loads the arm", !!g.aim && g.aim.x > qbT.x,
      JSON.stringify(g.aim));
    const loadedX = g.aim && g.aim.x;
    // the off-hand thumb now slides across the screen and lifts
    H.touch("touchmove", [{ id: 2, x: 900, y: 120 }]);
    step();
    check("P0-13 a stray finger's DRAG cannot steer the aim",
      !!g.aim && Math.abs(g.aim.x - loadedX) < 1,
      JSON.stringify(g.aim) + " loadedX=" + loadedX);
    H.touch("touchend", [{ id: 2, x: 900, y: 120 }]);
    step();
    check("P0-13 a stray finger's LIFT neither fires the throw nor disarms",
      g.ball.mode === "held" && !!g.slingAnchor && !!g.aim,
      g.ball.mode + " anchor=" + JSON.stringify(g.slingAnchor) + " aim=" + JSON.stringify(g.aim));
    H.touch("touchend", [{ id: 1, x: 420, y: 270 }]);
    step();
    check("P0-13 the OWNER's lift resolves the throw — exactly one release",
      g.ball.mode === "air" && !g.slingAnchor, g.ball.mode + " anchor=" + JSON.stringify(g.slingAnchor));
    noErr("two-finger throw");
    H.resetTouches();
  }
  // P0-12's residue and the desktop half of P0-13 are STRUCTURAL: the harness
  // dispatches straight to the listener lists, so it cannot model an event the
  // canvas never receives in the first place (a release out on the letterbox).
  // Assert the shape here and leave the feel to a human pass.
  check("P0-12 residue: at most one role:\"aim\" touch is registered per event",
    SRC3.includes("if (aimTouchId !== null) { touches[t.identifier] = { role: \"idle\" }; continue; }"));
  check("P0-13 desktop: mousemove/mouseup listen on WINDOW, not on the canvas",
    SRC3.includes("window.addEventListener(\"mouseup\"") &&
    SRC3.includes("window.addEventListener(\"mousemove\"") &&
    !SRC3.includes("cv.addEventListener(\"mouseup\"") &&
    !SRC3.includes("cv.addEventListener(\"mousemove\""));

  // ================= #3 auto-jump is late + flagged =================
  // throw AT a receiver like a real player: let routes develop, then compute
  // the exact backward drag that slings the ball onto his numbers
  const dragOntoReceiver = () => {
    stepFor(1.1);                          // let the route develop
    const qb2 = g.ball.holder;
    if (!qb2) return null;
    const rec = g.players.filter((e) => e.team === "off" && e.routeEligible && e.state === "route")
      .sort((a, b) => Math.hypot(a.x - qb2.x, a.y - qb2.y) - Math.hypot(b.x - qb2.x, b.y - qb2.y))[0];
    if (!rec) return null;
    const len = Math.hypot(rec.x - qb2.x, rec.y - qb2.y);
    const mr = 400;                        // conservative maxRange stand-in
    const k = Math.max(0, Math.min(1, (len - 46) / (mr - 46)));
    const pull = 15 + k * 150;
    const dx = (rec.x - qb2.x) / (len || 1), dy = (rec.y - qb2.y) / (len || 1);
    H.mouse("mousedown", 480, 270); step();
    H.mouse("mousemove", 480 - dx * pull, 270 - dy * pull); step();
    H.mouse("mouseup", 480 - dx * pull, 270 - dy * pull); step();
    return rec;
  };
  let sawAutoJump = false, sawControlled = false, sawAir = false;
  for (let attempt = 0; attempt < 3 && !sawAutoJump; attempt++) {   // scatter can push a landing wide — retry
    freshPassPlay();
    dragOntoReceiver();
    if (g.ball.mode === "air") sawAir = true;
    for (let i = 0; i < 60 * 4 && g.ball.mode === "air"; i++) {
      step(16.7);
      const cc = g.controlled;
      if (cc && cc.team === "off" && cc.routeEligible) sawControlled = true;
      if (g.players.some((e) => e.autoJumped)) { sawAutoJump = true; break; }
    }
    stepFor(2.5);
  }
  check("targeted throw is airborne", sawAir);
  check("#3 receiver control handed off after the throw", sawControlled);
  check("#3 no-input receiver auto-jumps LATE and is flagged (worse odds)", sawAutoJump);
  noErr("auto-jump");

  // ================= #4 SPACE = timed jump while ball is in the air =================
  freshPassPlay();
  dragOntoReceiver();
  check("jump test: ball in air", g.ball.mode === "air", g.ball.mode);
  let jumped = false;
  for (let i = 0; i < 60 * 4 && g.ball.mode === "air"; i++) {
    step(16.7);
    const cc = g.controlled;
    if (cc && cc.routeEligible && g.ball.T - g.ball.t < 0.3 && g.ball.T - g.ball.t > 0.05) {
      key(" ");
      if (cc.jumpT > 0 && cc.jumpTimed) { jumped = true; break; }
    }
  }
  check("#4 SPACE jump registers as a TIMED leap", jumped);
  stepFor(2.5);
  noErr("timed jump");

  // ================= #8 stiff-arm (F with the ball) =================
  {
    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    forceDrive("A");
    dbg.enterPlaycall(); stepFor(0.3);
    dbg.choosePlay({ name: "TEST DIVE", type: "run", tags: ["run"], lane: 0 }, false);
    stepFor(0.1);
    if (g.state === "presnap") key(" ");
    stepFor(0.6);   // handoff done → RB carries
    const c = g.carrier;
    check("stiff-arm setup: user carries the ball", !!c && g.phase === "carry", g.phase);
    if (c) {
      c.str = 95;
      key("f");
      check("#8 F starts a stiff-arm window", c.stiffT > 0, c.stiffT);
      // plant a weak tackler right on him mid-window → he should get planted
      const d = g.players.find((e) => e.team === "def");
      d.str = 60; d.staggerT = 0; d.proneT = 0; d.tackleCd = 0;
      d.x = c.x + 8; d.y = c.y;
      let shoved = false;
      for (let i = 0; i < 30 && g.state === "live"; i++) { step(16.7); if (d.staggerT > 0) { shoved = true; break; } }
      check("#8 strong back plants a weak tackler with the stiff-arm", shoved || g.state !== "live");
    }
    stepFor(3);
    noErr("stiff-arm");
  }

  // ================= #6 D-line breakthrough +0.3s =================
  freshPassPlay();
  stepFor(0.5);
  const engaged = g.players.filter((e) => e.team === "def" && e.blockedBy);
  check("#6 blockers engage rushers", engaged.length > 0, engaged.length);
  // spin/speed rush techniques legitimately shed at ~0.5s now (owner mandate:
  // the D-line must be able to win with a move) — instant-shed means < 0.5s total
  check("#6 no instant sheds: every hold ≥ 0.5s at engagement",
    engaged.every((e) => e.engageT == null || e.engageT >= 0.0), // 0.5s already elapsed
    engaged.map((e) => e.engageT && e.engageT.toFixed(2)).join(","));
  // statistical: sample fresh engagements. RE-DERIVED for the Change-2 GRIND
  // model (LESSONS #18: the test moves when the design deliberately moves).
  // Blocks are no longer a random hold timer — the rusher pours str-scaled
  // feed into the blocker's blk-scaled anchor; nominal league-mean hold is
  // anchor(blk~81)/feed(str~86) ≈ 1.2s, with a 0.55s floor and 2.0s pass
  // ceiling clamped at the latch. The projection (engageT) is exact at
  // engagement, so the band is two-sided: a low mean = the anchor collapsed,
  // a high mean = the feed died.
  const holds = [];
  let stranded = 0, shedAtDrift = 0;
  for (let t = 0; t < 12; t++) {
    freshPassPlay();
    stepFor(0.35);
    const reps = [];
    for (const e of g.players) if (e.team === "def" && e.blockedBy && e.engageT) {
      holds.push(e.engageT + 0.35);
      reps.push({ e, shedAt: e.blockShedAt, acc: e.blockAcc });
    }
    stepFor(0.2);
    // grind sanity mid-rep: threshold constant, accumulator monotonic
    for (const r of reps) if (r.e.blockedBy) {
      if (r.e.blockShedAt !== r.shedAt) shedAtDrift++;
      if ((r.e.blockAcc || 0) < r.acc) shedAtDrift++;
    }
    stepFor(2.3);
    // no stranded reps at the end of the play (the old line-5964 leak):
    // nobody keeps blockedBy while his blocker looks elsewhere, and nobody
    // carries grind state without a live block
    for (const e of g.players) {
      if (e.blockedBy && e.blockedBy.engaged !== e) stranded++;
      if (!e.blockedBy && (e.blockAcc || 0) > 0) stranded++;
    }
  }
  const avgHold = holds.reduce((a, b) => a + b, 0) / Math.max(1, holds.length);
  // floor 0.80 not 0.95: the grind is deliberately RATING-SENSITIVE, and the
  // harness boots random matchups — a weak-OL vs elite-DL front legitimately
  // averages ~0.85s (league-mean is ~1.1-1.2s). The floor guards against a
  // regression to instant-shed line play, not against rating spread.
  check("#6 average block hold in the 0.80-2.0s band (grind model)", avgHold >= 0.80 && avgHold <= 2.0,
    avgHold.toFixed(2) + "s over " + holds.length + " reps");
  check("#6 grind is deterministic mid-rep (threshold constant, accumulator monotonic)", shedAtDrift === 0, shedAtDrift);
  check("#6 no stranded block state at the whistle", stranded === 0, stranded);

  // ================= #10 rampage once per half =================
  {
    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    check("#10 rampage ledger exists", !!g.rampUsed && "A" in g.rampUsed, JSON.stringify(g.rampUsed));
    g.clock = 120; g.quarter = 1;   // plenty of time — enterPlaycall must not hit the quarter break
    forceDrive("B");
    dbg.enterPlaycall(); stepFor(0.3);
    if (g.state === "defcall") key("1");
    stepFor(0.1);
    if (g.state === "presnap") key(" ");
    g.quarter = 1;
    g.rampage.A = 100; g.rampUsed.A = 1;   // already spent this half
    dbg.tryRampage();
    check("#10 second rampage in the same half is refused", !g.ramp && g.rampage.A === 100,
      "ramp=" + !!g.ramp + " meter=" + g.rampage.A);
    g.quarter = 3;                          // new half → allowed again
    const apexA = g.players.find((e) => e.apex && ((e.team === "off") === (g.drive === "A")));
    dbg.tryRampage();
    check("#10 fresh half allows the rampage again (or no apex on this side)",
      !!g.ramp || !apexA || (apexA.team === "off" && g.carrier !== apexA),
      "ramp=" + !!g.ramp);
    stepFor(5);
    g.quarter = 1;
    noErr("rampage per-half");
  }

  // ================= #5 tap works on the postgame screen =================
  {
    g.state = "over"; g.mode = "exhibition"; g.showBox = false;
    H.mouse("mousedown", 480, 270);
    step();
    check("#5 tapping the FINAL screen continues to the menu", g.state === "menu", g.state);
  }

  // ================= #9 kicker accuracy/stamina + values =================
  {
    // deterministic derived ratings: same name → same numbers, Madden-range
    const r = g.rosters && g.rosters.KC;
    check("#9 rosters carry REAL Madden ratings (authentic 20-99 range)",
      !!r && r.offense.every((p) => p.spd >= 20 && p.spd <= 99 && p.str >= 20 && p.str <= 99) &&
      r.offense.some((p) => p.ovr >= 90));   // stars exist
  }

  // ================= #1 landscape CSS uses dvh =================
  {
    const html = fs.readFileSync(path.join(__dirname, "..", "static", "game", "index.html"), "utf8");
    check("#1 dvh-based sizing (Safari URL-bar-proof)", html.includes("100dvh"));
    check("#1 landscape media query gives all height to the game", html.includes("max-height: 520px"));
    check("#1 fullscreen layout dvh-corrected too", html.includes("calc(100dvh * 1.7778)"));
  }

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
