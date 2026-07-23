// Regression coverage for physical separation and the visible football beats.
"use strict";
const H = require("./harness.js");
const fs = require("fs");
const path = require("path");
const { stepFor, key, G } = H;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  [" + detail + "]" : "")); }
}
function everyBodyGap(g, dbg) {
  let low = Infinity;
  for (let i = 0; i < g.players.length; i++) {
    for (let j = i + 1; j < g.players.length; j++) {
      const a = g.players[i], b = g.players[j];
      low = Math.min(low, Math.hypot(a.x - b.x, a.y - b.y) - dbg.bodyContactRange(a, b));
    }
  }
  return low;
}
function anyPaintedSpriteOverlap(g, dbg) {
  for (let i = 0; i < g.players.length; i++) {
    for (let j = i + 1; j < g.players.length; j++) {
      if (dbg.visualMasksOverlap(g.players[i], g.players[j])) return true;
    }
  }
  return false;
}

const GAME = fs.readFileSync(path.join(__dirname, "..", "static", "game", "game.js"), "utf8");
const SPRITES = fs.readFileSync(path.join(__dirname, "..", "static", "game", "sprites.js"), "utf8");
const COMPACT_ACTION_CODE = SPRITES.slice(SPRITES.indexOf("function compactActionFrame"), SPRITES.indexOf("function scaleActionPoint"));
const REPLAY_DRAW_CODE = GAME.slice(GAME.indexOf("function drawReplay"), GAME.indexOf("function teamOf"));
const LIVE_DRAW_CODE = GAME.slice(GAME.indexOf("function drawPlayers"), GAME.indexOf("function drawBall"));

(async () => {
  await new Promise((r) => setTimeout(r, 210));
  const g = G(), dbg = g.debug;
  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  if (g.state === "intro") key("Enter");
  g.drive = "A"; g.losYd = 35; g.down = 1; g.toGain = 10;
  g.curPlay = { name: "FEEL TEST", type: "run", lane: 0 };
  dbg.buildPlayers();

  // An authored formation may be tight but its torso/hip footprints must not
  // start inside each other before the player even snaps the ball.
  const formationGap = everyBodyGap(g, dbg);
  check("pre-snap formation has no body overlap", formationGap >= -0.05, formationGap.toFixed(3));
  check("pre-snap formation has no painted-sprite overlap", !anyPaintedSpriteOverlap(g, dbg));

  // The quetz safety sheet contains two grounded frames followed by two
  // wings-open frames. Normal pursuit must stay grounded; only the deliberate
  // straight-line SOAR action may select the flight half of the sheet.
  const safety = g.players.find((e) => e.team === "def" && e.species === "quetz");
  const safetyPack = safety && g.sheets.B && g.sheets.B.quetz;
  if (safetyPack) {
    const walking = dbg.spriteFrameFor(safetyPack, "quetz", 9.5, false);
    const flying = dbg.spriteFrameFor(safetyPack, "quetz", 9.5, true);
    check("safety walk cycle stays on grounded quetz frames",
      walking.pack === safetyPack && walking.fi >= 0 && walking.fi < 2, walking.fi);
  check("explicit soar selects wings-open quetz frames",
      flying.pack === safetyPack && flying.fi >= 2 && flying.fi < safetyPack.n, flying.fi);
  } else check("safety quetz frame fixture exists", false);
  check("AI safety pursuit cannot auto-launch a soar", !GAME.includes("startSoar(e, lead);"));
  check("grounded quetz action packs are sourced only from folded-wing walk maps",
    SPRITES.includes('const actionSourceFrames = key === "quetz" ? spec.frames.slice(0, 2) : spec.frames;'));

  // Exact coincident centers are the pathological case that revealed random
  // jitter in early solver versions.  Resolve it deterministically and retain
  // real contact distance instead of teleporting to a magic hard-coded point.
  const a = g.players[0], b = g.players[1];
  a.x = b.x = 480; a.y = b.y = 270;
  a.vx = 48; a.vy = 0; b.vx = -32; b.vy = 0;
  dbg.resolvePlayerContacts();
  const exactGap = Math.hypot(a.x - b.x, a.y - b.y) - dbg.bodyContactRange(a, b);
  check("exact-center collision resolves without body overlap", exactGap >= -0.05, exactGap.toFixed(3));
  check("collision solver keeps a finite, physical result",
    [a.x, a.y, b.x, b.y, a.vx, a.vy, b.vx, b.vy].every(Number.isFinite));

  // Circle bodies can be clear while two diagonal silhouettes still meet: a
  // raptor's tail/body can cross another raptor's head at this offset. The
  // exact mask pass must catch that seam and create a real pixel gap.
  dbg.buildPlayers();
  const diagonalA = g.players[0], diagonalB = g.players[1];
  g.players = [diagonalA, diagonalB];
  for (const e of g.players) {
    e.species = "veloci"; e.bodyR = 13; e.bodyMass = 0.82;
    e.dir = 1; e.animT = 0; e.pose = ""; e.poseT = 0; e.jumpT = 0;
    e.vx = e.vy = 0;
  }
  diagonalA.x = 480; diagonalA.y = 270;
  diagonalB.x = 498; diagonalB.y = 248;
  const diagonalBodyGap = Math.hypot(diagonalA.x - diagonalB.x, diagonalA.y - diagonalB.y) - dbg.bodyContactRange(diagonalA, diagonalB);
  const diagonalStartedPainted = dbg.visualMasksOverlap(diagonalA, diagonalB);
  dbg.resolvePlayerContacts();
  check("diagonal raptor fixture clears the torso circles before mask correction", diagonalBodyGap > 0.1, diagonalBodyGap.toFixed(3));
  check("diagonal raptor fixture begins with a painted-pixel collision", diagonalStartedPainted);
  check("exact visual mask pass clears a diagonal tail/head collision", !dbg.visualMasksOverlap(diagonalA, diagonalB));

  // Rebuild after the synthetic contact test and exercise the real catch path.
  dbg.buildPlayers();
  const qb = g.players.find((e) => e.team === "off" && e.role === "QB");
  const rec = g.players.find((e) => e.team === "off" && e.routeEligible);
  const defenders = g.players.filter((e) => e.team === "def");
  if (qb && rec) {
    rec.x = qb.x + 120; rec.y = qb.y; rec.vx = rec.vy = 0;
    defenders.forEach((e, i) => { e.x = qb.x + 500 + i * 16; e.y = 100 + i * 25; e.vx = e.vy = 0; });
    g.state = "live"; g.phase = "air"; g.carrier = null; g.playT = 1;
    g.playPass = { passer: qb, receiver: rec };
    g.ball = { mode: "air", kind: "lob", from: { x: qb.x, y: qb.y }, to: { x: rec.x, y: rec.y },
      x: rec.x, y: rec.y, z: 16, t: 0.6, T: 0.6, holder: null, target: rec };
    const random = Math.random; Math.random = () => 0;
    dbg.resolveArrival();
    Math.random = random;
    check("completion attaches the ball to the arriving dino", g.carrier === rec && g.ball.holder === rec,
      JSON.stringify({ carrier: g.carrier && g.carrier.role, mode: g.ball.mode }));
  check("completion visibly starts a compact original-sprite catch beat", rec.poseT > 0 && ["catch", "catchHigh", "catchLow"].includes(rec.pose), rec.pose);
  } else check("catch scene has a QB and eligible receiver", false);

  const actionBase = g.sheets.A && g.sheets.A.veloci;
  const actionHigh = actionBase && actionBase.actions && actionBase.actions.catchHigh;
  const actionTackle = actionBase && actionBase.actions && actionBase.actions.tackle;
  check("action cels preserve the compact species map contract",
    !!(actionHigh && actionTackle && actionHigh.compact && actionHigh.w === actionBase.w && actionHigh.h === actionBase.h &&
      actionHigh.n >= 3 && actionHigh.mask && actionHigh.mask.R && actionHigh.anchor && actionHigh.anchor.R && actionHigh.anchor.R[1] &&
      actionHigh.anchor.R[1].ball && actionTackle.mask && actionTackle.anchor),
    JSON.stringify(actionHigh && { w: actionHigh.w, h: actionHigh.h, n: actionHigh.n, compact: actionHigh.compact }));
  check("compact action cels never add generic arms, white gloves, or squash transforms",
    !COMPACT_ACTION_CODE.includes("actionArm(") && !COMPACT_ACTION_CODE.includes('"w"') &&
      !SPRITES.includes("actionSquash") && !SPRITES.includes("actionSideFall") && !SPRITES.includes("actionFoldLegs"));
  check("live and replay renderers do not draw humanoid throw or punch strokes over dinos",
    !REPLAY_DRAW_CODE.includes("e.thr > 0") && !REPLAY_DRAW_CODE.includes("e.swing > 0") &&
      !LIVE_DRAW_CODE.includes("e.throwT > 0") && !LIVE_DRAW_CODE.includes("e.swingT > 0"));

  check("catches do not snap a receiver to the ball destination", !GAME.includes("who.x = spot.x") && !GAME.includes("who.y = spot.y"));
  check("interceptions secure the ball before the turnover card", GAME.includes("G.ball = { mode: \"held\", holder: defender") && GAME.includes("playPose(defender"));
  check("live tackling resolves physical contact before tackle logic", GAME.includes("resolvePlayerContacts();\n    checkTackles(dt);"));
  // Random input can leave a carrier surrounded but neither moving nor being
  // tackled. A football game must whistle that rare deadlock rather than let
  // the live state consume the rest of a quarter.
  dbg.buildPlayers();
  const stalledRunner = g.players.find((e) => e.team === "off" && e.role === "RB");
  if (stalledRunner) {
    g.state = "live"; g.phase = "carry"; g.carrier = stalledRunner;
    g.ball = { mode: "held", holder: stalledRunner, x: stalledRunner.x, y: stalledRunner.y, z: 12 };
    g.playT = 15.99;
    stepFor(0.05);
    check("a stalled live play receives a safety whistle", g.state === "dead" && g.lastDead && g.lastDead.reason === "WHISTLE",
      JSON.stringify({ state: g.state, reason: g.lastDead && g.lastDead.reason }));
  } else check("a stalled live play has a carrier for the whistle test", false);
  check("replay captures compact action state and action-focused GIFs", GAME.includes("poseP:") && GAME.includes("diveCatch:") && GAME.includes("GIF_MAX_FRAMES = 120") && GAME.includes("G.replay.frames.length - 150") && !GAME.includes("sheet.poses") && !SPRITES.includes("out.poses"));
  const crowdCode = GAME.slice(GAME.indexOf("function buildCrowd"), GAME.indexOf("// ---- stadiums"));
  const sidelineCode = GAME.slice(GAME.indexOf("function drawSidelineLife"), GAME.indexOf("function windArrow"));
  check("stand and bench spectators use compact color blocks rather than dino sprites",
    crowdCode.includes("drawCrowdFanBlock") && !crowdCode.includes("fanSprites") && !crowdCode.includes("drawImage") &&
      sidelineCode.includes("drawSidelineFanBlock(bx, feetY") && sidelineCode.includes("type === 2 || type === 5"));

  // The deterministic visual-review surface is built with production sprites
  // and physics.  It makes the rendered GIF gate repeatable without adding a
  // gameplay-only animation system or relying on a lucky drive outcome.
  for (const kind of ["tackle", "firstdown", "catch", "interception"]) {
    const scene = dbg.stageHighlight(kind);
    let paintedClear = true;
    let unexpectedPaintedOverlap = false;
    let unrelatedBodyClear = true;
    let tackleContactFrames = 0;
    let carrierAtWrap = null;
    let carrierMaxAfterWrap = -Infinity;
    const poses = new Set();
    let groundedSafety = true;
    // Audit the whole compact action window at a denser cadence than the GIF
    // itself. A clean static end frame cannot hide a late jump, sliding tackle,
    // or one-pixel silhouette collision between captures.
    for (let frame = 0; frame < 36; frame++) {
      stepFor(scene.dur / 36);
      const pairs = [];
      for (let i = 0; i < g.players.length; i++) {
        for (let j = i + 1; j < g.players.length; j++) {
          const a = g.players[i], b = g.players[j];
          const namedTacklePair = kind === "tackle" &&
            ((a === scene.tackler && b === scene.carrier) || (a === scene.carrier && b === scene.tackler));
          const activeTackleWrap = namedTacklePair && a.tackleImpactT > 0 && b.tackleImpactT > 0 &&
            a.tackleImpactWith === b.bodyId && b.tackleImpactWith === a.bodyId;
          const overlaps = dbg.visualMasksOverlap(a, b);
          if (overlaps) pairs.push({ namedTacklePair, activeTackleWrap });
          if (overlaps && activeTackleWrap) tackleContactFrames++;
          if (overlaps && !activeTackleWrap) unexpectedPaintedOverlap = true;
          if (!activeTackleWrap) {
            unrelatedBodyClear = unrelatedBodyClear &&
              Math.hypot(a.x - b.x, a.y - b.y) - dbg.bodyContactRange(a, b) >= -0.05;
          }
        }
      }
      paintedClear = paintedClear && pairs.length === 0;
      if (kind === "tackle" && scene.wrap) {
        if (carrierAtWrap == null) carrierAtWrap = scene.carrier.x;
        carrierMaxAfterWrap = Math.max(carrierMaxAfterWrap, scene.carrier.x);
      }
      for (const e of g.players) if (e.poseT > 0) poses.add(e.pose);
      if (kind === "interception") groundedSafety = groundedSafety && scene.defender.soarT <= 0;
    }
    const semantic = kind === "tackle"
      ? scene.dive && scene.wrap && scene.diveAt < scene.wrapAt && scene.wrapAt - scene.diveAt >= 0.30 &&
          poses.has("dive") && poses.has("tackle") && poses.has("tackled") && scene.fallen &&
          tackleContactFrames >= 4 && carrierAtWrap != null && carrierMaxAfterWrap - carrierAtWrap >= 10
      : kind === "firstdown"
        ? scene.crossed && scene.celebrated && scene.crossedAt < scene.celebratedAt && poses.has("celebrate")
        : scene.loaded && scene.leapt && scene.contactAt && scene.loadedAt < scene.leaptAt && scene.leaptAt < scene.contactAt &&
          poses.has("catchHigh") && (kind !== "interception" || groundedSafety);
    const collisionPolicy = kind === "tackle"
      ? unrelatedBodyClear && !unexpectedPaintedOverlap
      : everyBodyGap(g, dbg) >= -0.05 && paintedClear;
    check("QA " + kind + " scene runs on compact production dinos",
      g.state === "qa" && !!scene && semantic && collisionPolicy && !g.lastErr,
      JSON.stringify({ state: g.state, semantic, gap: everyBodyGap(g, dbg), paintedClear,
        unexpectedPaintedOverlap, unrelatedBodyClear, tackleContactFrames,
        backwardDrive: carrierAtWrap == null ? null : carrierMaxAfterWrap - carrierAtWrap, err: g.lastErr }));
  }
  check("action rendering selects compact species packs, never an oversized pose sheet",
    !GAME.includes("sheet.poses") && !SPRITES.includes("out.poses") && GAME.includes("selectActionSpriteFrame") &&
      SPRITES.includes("base.actions = buildCompactActions") && SPRITES.includes("const COMPACT_ACTION_KEYS"));

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exitCode = fail ? 1 : 0;
})();
