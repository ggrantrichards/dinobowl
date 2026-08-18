// BLOCKING BENCH — the measurement instrument for TRENCH WARFARE (ROADMAP S1).
//
// WHAT WAS BROKEN, AND IT WAS THE MEASUREMENT, NOT THE CODE. Five separate
// attempts to fix the run game were each judged on an ad-hoc ~30-play probe.
// Thirty carries of a distribution whose p90 is a breakaway cannot resolve a
// 1 yd/carry effect: the standard error of a 30-carry mean is as big as the
// entire effect being argued about, which is why ROADMAP records attempts 1-5
// as "arguably indistinguishable". This file is the fix for that. It prints ONE
// machine-readable JSON report covering both the run game and pass protection
// from a pinned, seeded, reproducible configuration, at a sample size where a
// 1 yd/carry change lands outside the noise floor — and it prints the standard
// error next to every number so nobody has to guess whether a delta is real.
//
// Usage:
//   node tests/blocking_bench.js                       # seed 4242, full sample
//   node tests/blocking_bench.js --seed=999
//   node tests/blocking_bench.js --seed=4242 --carries=40 --passes=30 --probe=20
//   node tests/blocking_bench.js --seed=4242 --pretty  # indented
//
// HOW THE DETERMINISM IS BUILT (this is the whole value of the file):
//   1. mulberry32 replaces Math.random BEFORE require("./harness.js") boots the
//      engine, exactly as tests/qa_botgame.js does. The engine draws its
//      matchup, its ratings, its per-rep block-anchor jitter and its juke
//      hazard from that one stream.
//   2. Weather is pinned CLEAR every play. Weather scales SPEED (speedMod), so
//      an unpinned RAIN game is a different physics build, not a noisy sample.
//   3. Difficulty is pinned to VETERAN (DIFFS[1], defSpd 1.0). The DYNAMIC row
//      is rewritten in place by refreshDynamicDiff() off the win/loss ladder,
//      so leaving G.diff there would let the defense get faster mid-run.
//   4. The DEFENSIVE CALL IS PINNED on a fixed rotation by trial index. Left to
//      cpuChooseDef the coordinator scouts G.recentOff, and a bench that calls
//      160 straight runs teaches it to call goal-line fronts — so the last
//      carry would be measured against a different defense than the first.
//   5. The MATCHUP rotates on a fixed 8-pair schedule over 16 franchises. One
//      matchup is a rating reading, not a league reading; test_batch3 #6's hold
//      floor sits at 0.80s rather than 0.95s for exactly this reason.
//   Same seed + same build => byte-identical JSON. Same seed + changed build =>
//   every difference in the output is the code change.
//
// WHAT A RESULT MEANS. Run three seeds. The spread of run.ydsPerCarry.median
// across seeds IS the noise floor. A later claim smaller than that spread is
// not a result, it is a coincidence, and this header exists so nobody has to
// relitigate it.
"use strict";

// ---------------------------------------------------------------- CLI + seed
const ARGV = process.argv.slice(2);
function arg(name, dflt) {
  const hit = ARGV.find((a) => a === "--" + name || a.startsWith("--" + name + "="));
  if (!hit) return dflt;
  const eq = hit.indexOf("=");
  return eq < 0 ? "1" : hit.slice(eq + 1);
}
const SEED = Number(arg("seed", 4242)) >>> 0;
const N_CARRIES = Number(arg("carries", 160));
const N_PASSES = Number(arg("passes", 120));
const N_PROBE = Number(arg("probe", 80));
const PRETTY = arg("pretty", null) != null;

// mulberry32 — installed before the engine boots so the ENGINE's own draws
// come off this stream, not just the bench's.
{
  let a = SEED;
  Math.random = function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = require("./harness.js");
const { step, key, G } = H;

// ------------------------------------------------------------ field geometry
// Mirrors game.js:14/19/24-27 (YPX 24, FIELD_X0 = 10 * YPX, TOP 84, BOT 508).
// Duplicated because G.debug does not export them; the geomCheck block in the
// report re-derives them from live entity positions, so a constant drift shows
// up as a loud failure instead of silently rescaling every yard in the table.
const YPX = 24;
const FIELD_X0 = 10 * YPX;
const TOP = 84, BOT = 508;
const MID = (TOP + BOT) / 2;             // 296
const xAtYd = (yd) => FIELD_X0 + yd * YPX;
const ydAtX = (x) => (x - FIELD_X0) / YPX;
// The tackle box: ~4.7 yd either side of the ball. A gap outside it is the
// perimeter, not a lane, and counting the empty sideline as a 200px hole would
// make every play look like it had somewhere to go.
const BOX_HALF = 112;
// "Reachable": how far off his own line the carrier could plausibly get to a
// hole before the play is decided. ~2 yards.
const REACH_PX = 50;

// --------------------------------------------------------------- small stats
const R2 = (v, d) => {
  if (v == null || !isFinite(v)) return null;
  const m = Math.pow(10, d == null ? 2 : d);
  return Math.round(v * m) / m;
};
function pctl(xs, p) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) * (v - m), 0) / (xs.length - 1));
}
// Every distribution in this report carries seMean — the standard error of the
// mean. That is the number that decides whether a "+1 yd/carry" claim is even
// sayable at this sample size, and it is why it is printed and not derived
// later from memory.
function summary(xs0, d) {
  const xs = xs0.filter((v) => v != null && isFinite(v));
  if (!xs.length) return { n: 0 };
  const s = sd(xs);
  return {
    n: xs.length, mean: R2(mean(xs), d), median: R2(pctl(xs, 0.5), d),
    p10: R2(pctl(xs, 0.10), d), p90: R2(pctl(xs, 0.90), d),
    min: R2(Math.min.apply(null, xs), d), max: R2(Math.max.apply(null, xs), d),
    sd: R2(s, d), seMean: s == null ? null : R2(s / Math.sqrt(xs.length), d),
  };
}
function tally(xs) {
  const o = {};
  for (const x of xs) if (x != null) o[x] = (o[x] || 0) + 1;
  return o;
}
const shareOf = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? R2(100 * mean(v), 1) : null;
};
const D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const flat = (xs) => xs.reduce((a, b) => a.concat(b), []);

// ------------------------------------------------------- pinned play calls
// Plain data, identical in shape to the engine's own OFF_PLAYS / DEF_PLAYS
// entries (game.js:72-107). Run plays and defensive calls carry no route
// closures — HB DIVE really is just {name,type,tags,lane} — so writing them
// here is the same literal, not a reimplementation, and it removes
// relevantOffense()'s situational scoring roll from the measurement. A PASS
// play cannot be built this way (its `routes` are R.* closures), so the bench
// caches a real one off the live callsheet instead.
const RUN_CALLS = [
  { name: "HB DIVE", type: "run", tags: ["run", "short"], lane: 0 },
  { name: "HB SWEEP UP", type: "run", tags: ["run"], lane: -1 },
  { name: "HB SWEEP DOWN", type: "run", tags: ["run"], lane: 1 },
];
// Four fronts: a 3-man, two 4-man, and a 5-man blitz. Pinned per trial index so
// a stage-2 or stage-3 re-run faces the SAME defense on the same trial number.
const DEF_CALLS = [
  { name: "MAN 2 HIGH", rush: 4, man: true, tags: ["balanced"] },
  { name: "COVER 2 ZONE", rush: 4, man: false, tags: ["balanced"] },
  { name: "ZONE 3 DEEP", rush: 3, man: false, tags: ["deep"] },
  { name: "MAN BLITZ", rush: 5, man: true, tags: ["blitz", "short"] },
];
const ABBRS = ["KC", "PHI", "SF", "BAL", "DAL", "BUF", "DET", "CIN",
  "MIN", "PIT", "MIA", "GB", "LA", "NYJ", "CLE", "SEA"];

const CLEAR_WX = () => ({
  type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1,
  fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP",
});

(async () => {
  await new Promise((r) => setTimeout(r, 300));
  const g = G();
  const dbg = g.debug;
  step(); step();

  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  if (g.state === "intro") key("Enter");
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");
  for (let i = 0; i < 40 && !["playcall", "defcall", "presnap"].includes(g.state); i++) {
    for (let j = 0; j < 15; j++) step(16.7);
  }
  if (g.lastErr) { console.error("BOOT ERROR: " + g.lastErr); process.exit(1); }

  const bodyR = dbg.bodyRadius;
  const bodyRange = dbg.bodyContactRange;

  // ------------------------------------------------------------ config pinning
  // Everything here is a KNOB THAT MOVES YARDS. Left unpinned each one is a free
  // variable a before/after diff would silently blame on the code change.
  function pinGlobals() {
    g.diff = 1;                 // VETERAN: defSpd 1.0, no DYNAMIC ladder drift
    g.humanB = false;
    g.playDefense = false;
    g.coachMode = true;         // enterPlaycall parks in "playcall" so we choose
    g.practice = false;
    g.patMode = false;
    g.ot = false;
    g.returnPlay = null;
    g.quarter = 1;
    g.clock = 3600;             // enterPlaycall and presnap both bail on clock <= 0
    g.score.A = 0; g.score.B = 0;
    g.weather = CLEAR_WX();
    g.rampage.A = 0; g.rampage.B = 0;   // no apex rampage inside a measurement
    g.gameStats = {};
    g.stats = g.stats || {};
    g.touchMove = null;
  }
  function freshDown(i) {
    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    g.half = null; g.replay = null; g.celebrate = null; g.ramp = null;
    g.my = ABBRS[(i % 8) * 2]; g.opp = ABBRS[(i % 8) * 2 + 1];
    g.drive = "A";
    // 20 leaves 80 yards of runway: long enough that the p90 is a real
    // breakaway rather than a goal line, far enough from either end zone to
    // stay off the fringe formation logic.
    g.losYd = 20; g.down = 1; g.toGain = 10;
    pinGlobals();
  }

  // One real pass play, cached off the live callsheet (its routes are closures
  // we cannot fabricate). choosePlay only stores the reference, so one is enough.
  let passPlay = null;
  for (let t = 0; t < 60 && !passPlay; t++) {
    freshDown(t);
    dbg.enterPlaycall();
    for (let j = 0; j < 12; j++) step(16.7);
    const hit = (g.callsheet || []).find((p) => p.type === "pass" && p.routes && !p.hbPass && !p.sweepPass);
    if (hit) passPlay = hit;
  }
  if (!passPlay) { console.error("could not cache a pass play off the callsheet"); process.exit(1); }

  // ---------------------------------------------------------- the trial driver
  // Drive the engine from a dead ball to a LIVE snap with the play and the
  // defense we chose. The buildPlayers() re-call is exactly how audible()
  // repoints a formation at the line (game.js:2313), so pinning G.defCall this
  // way is an engine-sanctioned path, not a poke at private state.
  function stage(i, offCall) {
    freshDown(i);
    dbg.enterPlaycall();
    for (let j = 0; j < 12; j++) step(16.7);
    if (g.state !== "playcall") return null;
    const defCall = DEF_CALLS[i % DEF_CALLS.length];
    dbg.choosePlay(offCall, false);
    for (let j = 0; j < 8 && g.state !== "presnap"; j++) step(16.7);
    if (g.state !== "presnap") return null;
    g.defCall = defCall;
    dbg.buildPlayers();
    return { defCall };
  }

  // ------------------------------------------------------------ hole geometry
  // widestGap: the largest y-interval inside a window that no body occupies.
  // This is the metric no previous probe had, and it answers "was there ever a
  // lane at all".
  function widestGap(bodies, lo, hi) {
    const arr = bodies.map((e) => ({ y: e.y, r: bodyR(e) })).sort((a, b) => a.y - b.y);
    if (!arr.length) return { w: hi - lo, y: (lo + hi) / 2 };
    let best = -1, bestY = (lo + hi) / 2, cursor = lo;
    for (const b of arr) {
      const edge = b.y - b.r;
      if (edge > cursor && edge - cursor > best) { best = edge - cursor; bestY = (cursor + edge) / 2; }
      cursor = Math.max(cursor, b.y + b.r);
    }
    if (hi - cursor > best) { best = hi - cursor; bestY = (cursor + hi) / 2; }
    return { w: Math.max(0, best), y: bestY };
  }
  // Same scan, but only gaps whose CENTRE is within reach of the carrier's own
  // line. A 40px hole 150px away is not a hole this carrier can use — and the
  // shipping carrier cannot use it AT ALL, because a user-controlled ball
  // carrier with no stick input is driven at `e.vy = 0` (game.js:7040), dead
  // straight from his alignment.
  function reachableGap(bodies, refY, lo, hi) {
    const arr = bodies.map((e) => ({ y: e.y, r: bodyR(e) })).sort((a, b) => a.y - b.y);
    const gaps = [];
    let cursor = lo;
    for (const b of arr) {
      const edge = b.y - b.r;
      if (edge > cursor) gaps.push({ w: edge - cursor, y: (cursor + edge) / 2 });
      cursor = Math.max(cursor, b.y + b.r);
    }
    if (hi > cursor) gaps.push({ w: hi - cursor, y: (cursor + hi) / 2 });
    const near = gaps.filter((q) => Math.abs(q.y - refY) <= REACH_PX);
    if (!near.length) return { w: 0, y: refY };
    return near.reduce((a, b) => (b.w > a.w ? b : a));
  }
  // THE CORRIDOR SCAN. Because the shipping carrier runs straight, the honest
  // question is not "is there a hole somewhere" but "what is standing directly
  // in front of him, and whose jersey is it". Returns the x-distance to the
  // first body whose y-footprint overlaps his, and which team it belongs to.
  function corridor(carrier) {
    if (!carrier) return { px: null, team: null, role: null };
    let best = null;
    for (const e of g.players) {
      if (e === carrier || e.proneT > 0) continue;
      if (e.x <= carrier.x) continue;
      if (Math.abs(e.y - carrier.y) >= bodyR(e) + bodyR(carrier)) continue;
      const dx = e.x - carrier.x;
      if (!best || dx < best.px) best = { px: dx, team: e.team, role: e.role };
    }
    return best || { px: null, team: null, role: null };
  }
  function sampleHoles(losX, carrier) {
    const live = g.players.filter((e) => e !== carrier && e.proneT <= 0);
    const inLos = (e) => e.x > losX - 34 && e.x < losX + 58;
    const defLos = live.filter((e) => e.team === "def" && inLos(e));
    const allLos = live.filter(inLos);
    const lo = MID - BOX_HALF, hi = MID + BOX_HALF;
    const gd = widestGap(defLos, lo, hi), ga = widestGap(allLos, lo, hi);
    const refY = carrier ? carrier.y : MID;
    const rd = reachableGap(defLos, refY, lo, hi), ra = reachableGap(allLos, refY, lo, hi);
    const need = carrier ? bodyR(carrier) * 2 : 26;
    const cor = corridor(carrier);
    return {
      boxDefGapPx: gd.w, boxAllGapPx: ga.w, boxAllGapOffsetPx: ga.y - refY,
      reachDefGapPx: rd.w, reachAllGapPx: ra.w, reachAllGapOffsetPx: ra.y - refY,
      carrierWidthPx: need,
      boxAllFits: ga.w >= need ? 1 : 0,
      reachAllFits: ra.w >= need ? 1 : 0,
      reachDefFits: rd.w >= need ? 1 : 0,
      corridorPx: cor.px, corridorTeam: cor.team, corridorRole: cor.role,
      corridorIsOwnBlocker: cor.team == null ? null : (cor.team === "off" ? 1 : 0),
      defInLos: defLos.length,
    };
  }

  // -------------------------------------------------------------- RUN TRIALS
  // Rejection accounting is part of the instrument: "carries sampled" is
  // worthless unless you can also say what was thrown away and why.
  function runTrial(i, opts) {
    const o = opts || {};
    const call = RUN_CALLS[i % RUN_CALLS.length];
    const st = stage(i, call);
    if (!st) return { reject: "stage" };
    const losYd0 = g.losYd, losX = xAtYd(losYd0);
    // presnap x of every defender, so "penetration" can be measured against
    // where he actually started rather than against the LOS plane
    const preX = new Map();
    for (const e of g.players) preX.set(e, e.x);
    key(" ");
    if (g.state !== "live") return { reject: "nosnap" };

    const rec = {
      i, call: call.name, def: st.defCall.name, my: g.my, opp: g.opp, losYd0,
      holes: {}, handoffT: null, contactT: null, maxAdvYd: 0, gainYd: null,
      reason: null, td: 0, ownBlockerContactFrames: 0, carryFrames: 0,
    };
    const everBlocked = new Map();    // def -> true if .blockedBy was ever set
    const everStalked = new Map();    // def -> true if ever someone's .block
    const latchCycles = new Map();    // def -> number of separate latches
    const accPeak = new Map();        // def -> max(blockAcc / blockShedAt)
    const blockedFrames = new Map();  // def -> frames spent blocked
    const lastBlockedF = new Map();   // def -> last frame index seen blocked
    const openRep = new Map();        // def -> live merged rep
    const reps = [];                  // merged reps
    const deepestPen = new Map();     // def -> most negative (x - presnapX)
    let washed = null, washLaneY = null, nearestDefToCarrierY = null;
    let carrier = null, frames = 0;
    const HOLE_AT = [0.1, 0.3, 0.5];
    let holeIdx = 0;

    while (g.state === "live" && g.playT < 16.4) {
      // Carrier steering probe — MEASUREMENT ONLY. It writes G.touchMove, the
      // mobile-stick field kdir() already reads (game.js:1187-1193), so the
      // engine's own cut mechanic does the steering and no engine code changes.
      if (o.aimAtHole && g.phase === "carry" && g.carrier) {
        const h = sampleHoles(losX, g.carrier);
        const dy = h.reachAllGapPx >= h.carrierWidthPx ? h.reachAllGapOffsetPx : h.boxAllGapOffsetPx;
        g.touchMove = Math.abs(dy) > 8 ? { x: 0, y: dy > 0 ? 1 : -1 } : { x: 0, y: 0 };
      } else if (g.touchMove) g.touchMove = null;

      step(16.7);
      frames++;
      if (g.lastErr) return { reject: "error", err: g.lastErr };

      while (holeIdx < HOLE_AT.length && g.playT >= HOLE_AT[holeIdx]) {
        rec.holes["t" + String(HOLE_AT[holeIdx]).replace("0.", "")] =
          sampleHoles(losX, g.carrier || g.ball.holder);
        holeIdx++;
      }
      if (rec.handoffT == null && g.phase === "carry" && g.carrier) {
        rec.handoffT = g.playT;
        carrier = g.carrier;
        rec.carrierRole = carrier.role;
        rec.carrierY = carrier.y;
        rec.handoffDepthYd = losYd0 - ydAtX(carrier.x);
        // THE KINEMATIC FLOOR. He takes the ball this far behind the line and
        // runs at e.vx = his top speed. This is the number of seconds it would
        // take him to reach the LOS in a completely empty stadium — so if first
        // contact lands sooner than this, no amount of blocking downfield can
        // matter, because the play is over before he could physically get to the
        // line even with nobody on the field.
        rec.carrierSpdPx = carrier.spd;
        rec.secToReachLosInAVacuum = (losX - carrier.x) / Math.max(1, carrier.spd);
        // THE SCRIPTED DOUBLE-TEAM WASH (game.js:6576-6585). At the handoff the
        // engine picks the interior defender nearest `laneY = MID + lane*44`,
        // staggers him 0.55s and shoves him 12px off the lane. Record who got
        // washed, where the designed lane was, and who was actually nearest the
        // RUNNER — because those are not the same defender.
        washLaneY = MID + ((g.curPlay && g.curPlay.lane) || 0) * 44;
        const front = g.players.filter((e) => e.team === "def" && (e.role === "DL" || e.role === "EDGE"));
        // The handoff wash stagger was 0.55s when this detector was written and is
        // 0.22s since the stage-2 re-aim (a 0.55s freeze made the wash victim an
        // unblockable plug in the crease). Threshold lowered so the metric keeps
        // reporting; 0.2 still cannot collide with a press jam (0.30/0.35) because
        // this filter only looks at DL/EDGE.
        washed = front.filter((e) => e.staggerT >= 0.2)[0] || null;
        const nearest = front.slice().sort((a, b) => Math.abs(a.y - carrier.y) - Math.abs(b.y - carrier.y))[0];
        nearestDefToCarrierY = nearest || null;
        rec.wash = {
          designedLaneY: washLaneY,
          carrierYAtHandoff: carrier.y,
          laneMinusCarrierPx: washLaneY - carrier.y,
          washedY: washed ? washed.y : null,
          washedOffsetFromCarrierPx: washed ? washed.y - carrier.y : null,
          nearestFrontDefY: nearest ? nearest.y : null,
          nearestFrontDefOffsetPx: nearest ? nearest.y - carrier.y : null,
          washedWasNearestToCarrier: washed && nearest ? (washed === nearest ? 1 : 0) : null,
        };
      }

      // -------- per-defender ledger
      for (const e of g.players) {
        if (e.team !== "def") continue;
        const pen = e.x - preX.get(e);
        if (!deepestPen.has(e) || pen < deepestPen.get(e)) deepestPen.set(e, pen);
        if (e.blockedBy) {
          everBlocked.set(e, true);
          blockedFrames.set(e, (blockedFrames.get(e) || 0) + 1);
          if (e.blockShedAt) {
            const fr = (e.blockAcc || 0) / e.blockShedAt;
            if (!accPeak.has(e) || fr > accPeak.get(e)) accPeak.set(e, fr);
          }
          const lf = lastBlockedF.get(e);
          // MERGED REPS: a rep that is dropped and re-latched inside 3 frames is
          // the same rep continuing, not two reps. Both views are reported —
          // merged reps say how long a defender was actually held, raw latch
          // COUNT says how badly the latch is thrashing, and the difference
          // between the two is itself a finding.
          if (lf == null || frames - lf > 3) {
            if (openRep.has(e)) reps.push(closeRep(e, openRep.get(e)));
            openRep.set(e, {
              t0: g.playT, latchX: e.blockLatchX == null ? e.x : e.blockLatchX,
              latchY: e.blockLatchY == null ? e.y : e.blockLatchY,
              midX0: (e.x + e.blockedBy.x) / 2, blocker: e.blockedBy, latches: 1,
            });
          } else if (lf === frames - 1) {
            // contiguous frame — nothing to do
          } else {
            const r = openRep.get(e);
            if (r) r.latches++;
          }
          if (lf !== frames - 1) latchCycles.set(e, (latchCycles.get(e) || 0) + 1);
          lastBlockedF.set(e, frames);
        } else if (openRep.has(e) && frames - (lastBlockedF.get(e) || 0) > 3) {
          reps.push(closeRep(e, openRep.get(e)));
          openRep.delete(e);
        }
      }
      function closeRep(e, r) {
        return {
          role: e.role, dur: g.playT - r.t0, latches: r.latches,
          dxYd: (e.x - r.latchX) / YPX,
          midDxYd: (((e.x + r.blocker.x) / 2) - r.midX0) / YPX,
        };
      }
      for (const e of g.players) if (e.team === "off" && e.block) everStalked.set(e.block, true);

      if (carrier) {
        rec.carryFrames++;
        rec.maxAdvYd = Math.max(rec.maxAdvYd, ydAtX(carrier.x) - losYd0);
        // is he wedged into his OWN blocker? (the corridor scan says this is
        // the modal obstruction; this counts how long it lasts)
        for (const e of g.players) {
          if (e.team !== "off" || e === carrier) continue;
          if (D(e, carrier) <= bodyRange(e, carrier, 0)) { rec.ownBlockerContactFrames++; break; }
        }
        if (rec.contactT == null) {
          for (const d of g.players) {
            if (d.team !== "def" || d.proneT > 0) continue;
            if (D(d, carrier) <= bodyRange(d, carrier, 0)) {
              rec.contactT = g.playT;
              rec.contactSinceHandoff = g.playT - rec.handoffT;
              rec.contactRole = d.role;
              rec.contactEverBlocked = everBlocked.get(d) ? 1 : 0;
              rec.contactAdvYd = ydAtX(carrier.x) - losYd0;
              rec.contactTacklerRelLosPx = d.x - losX;
              rec.contactInBackfield = d.x < losX ? 1 : 0;
              rec.contactWasWashed = washed ? (d === washed ? 1 : 0) : null;
              rec.contactAccPeak = accPeak.has(d) ? accPeak.get(d) : null;
              rec.corridorAtContact = corridor(carrier);
              break;
            }
          }
        }
        rec.__endX = carrier.x;
        const near = g.players.filter((d) => d.team === "def" && d.proneT <= 0)
          .sort((a, b) => D(a, carrier) - D(b, carrier))[0];
        if (near) {
          rec.firstTacklerRole = near.role;
          rec.firstTacklerEverBlocked = everBlocked.get(near) ? 1 : 0;
          rec.firstTacklerDistPx = D(near, carrier);
        }
      }
    }
    g.touchMove = null;
    for (const [e, r] of openRep) {
      reps.push({
        role: e.role, dur: g.playT - r.t0, latches: r.latches, open: 1,
        dxYd: (e.x - r.latchX) / YPX,
        midDxYd: (((e.x + r.blocker.x) / 2) - r.midX0) / YPX,
      });
    }

    rec.reason = (g.lastDead && g.lastDead.reason) || null;
    rec.frames = frames;
    if (!carrier) return { reject: "nohandoff", reason: rec.reason };
    if (carrier.role !== "RB") return { reject: "notrb", reason: rec.reason };
    if (g.carrier !== carrier) return { reject: "ballchanged", reason: rec.reason };
    if (["SACKED!", "INTERCEPTED!", "FUMBLE!", "INCOMPLETE"].includes(rec.reason)) {
      return { reject: "notarun", reason: rec.reason };
    }
    // the gain the way playDead spots it (game.js:4003-4004)
    const spot = Math.max(0, Math.min(100, ydAtX(rec.__endX)));
    rec.gainYd = spot - losYd0;
    rec.td = spot >= 100 ? 1 : 0;
    rec.reps = reps;
    rec.ownBlockerContactPct = rec.carryFrames ? rec.ownBlockerContactFrames / rec.carryFrames : null;
    // grind health: did the accumulator ever get anywhere, and how many times
    // did each block re-latch?
    const blkDefs = Array.from(everBlocked.keys());
    rec.grind = {
      blockedDefenders: blkDefs.length,
      latchCycles: blkDefs.map((e) => latchCycles.get(e) || 0),
      accPeaks: blkDefs.map((e) => (accPeak.has(e) ? accPeak.get(e) : 0)),
      washedAccPeak: washed ? (accPeak.has(washed) ? accPeak.get(washed) : 0) : null,
      washedLatchCycles: washed ? (latchCycles.get(washed) || 0) : null,
    };
    rec.secondLevel = (() => {
      const sl = g.players.filter((e) => e.team === "def" && ["LB", "CB", "S"].includes(e.role));
      return { n: sl.length, blocked: sl.filter((e) => everBlocked.get(e) || everStalked.get(e)).length };
    })();
    rec.penetration = Array.from(deepestPen.entries())
      .filter(([e]) => everBlocked.get(e))
      .map(([e, px]) => ({ role: e.role, deepestPx: px, blockedSec: (blockedFrames.get(e) || 0) / 60 }));
    delete rec.__endX;
    return rec;
  }

  // ------------------------------------------------------------- PASS TRIALS
  // Pass protection must not regress, so it is measured on the same instrument.
  // IT TAKES TWO CONFIGURATIONS, and conflating them is how you get a
  // meaningless answer. A first cut of this bench measured only the resolving
  // one and reported a 0% sack rate with 0% pressure — not because the pocket is
  // perfect, but because cpuQB throws at a median 1.07s, i.e. the ball is gone
  // before the rush can matter. A protection metric taken off a 1.07s dropback
  // measures the QB's decision clock, not the O-line.
  //
  //   "resolve" — the QB is driven by cpuQB (the bench takes control of WR1 in
  //     PRE-SNAP, which is what makes update()'s `userIsReceiver` true,
  //     game.js:6587-6599). The play ends in a throw or a sack, so this is the
  //     configuration that yields a SACK RATE and a time-to-throw.
  //   "hold" — nobody is given control, so the QB is the user's and stands in
  //     the pocket (game.js:6601 drifts him back 42px/s for 0.7s and then he is
  //     a statue). This is the configuration that STRESSES the protection, and
  //     it is the one test_batch3 #6 uses via freshPassPlay, so its engagement
  //     numbers are the ones comparable to that assertion and to the ROADMAP
  //     52.9%-engaged / 0.65s-hold / 39.6%-free figures. G.drive stays "A" in
  //     both, so the pocketCollapsing path (game.js:7190-7199 — drive A, no
  //     humanB, phase drop, playT > 2.85) is live, which is where a long hold
  //     turns into a shed parade.
  function passTrial(i, mode) {
    const st = stage(i, passPlay);
    if (!st) return { reject: "stage" };
    if (mode === "resolve") {
      const wr = g.players.find((e) => e.team === "off" && e.role === "WR1");
      if (!wr) return { reject: "nowr" };
      g.players.forEach((p) => { p.controlled = false; });
      wr.controlled = true; g.controlled = wr;
    }
    key(" ");
    if (g.state !== "live") return { reject: "nosnap" };

    const rec = { i, mode, def: st.defCall.name, my: g.my, opp: g.opp, pressureT: null, reason: null, throwT: null };
    const everBlocked = new Map();
    const openRep = new Map();
    const lastBlockedF = new Map();
    const reps = [];
    const latchCycles = new Map();
    // rush-frame ledger, buffered per defender so "approaching" (not yet
    // blocked but WILL be) can be told apart from "never-blocked" only once the
    // play is over. Classifying live would call every pre-contact frame
    // "never-blocked" and inflate the free-rusher share.
    const frameLog = new Map();
    let dropFrames = 0, f = 0;

    while (g.state === "live" && g.playT < 16.4) {
      step(16.7); f++;
      if (g.lastErr) return { reject: "error", err: g.lastErr };
      const qb = g.ball.holder;
      const inDrop = g.phase === "drop" && qb;
      if (rec.throwT == null && g.phase !== "drop" && g.phase !== "presnap") rec.throwT = g.playT;
      if (!inDrop) continue;
      dropFrames++;
      for (const e of g.players) {
        if (e.team !== "def" || e.state !== "rush") continue;
        const blocked = !!e.blockedBy;
        if (!frameLog.has(e)) frameLog.set(e, []);
        frameLog.get(e).push(blocked ? 1 : 0);
        if (blocked) {
          everBlocked.set(e, true);
          const lf = lastBlockedF.get(e);
          if (lf == null || f - lf > 3) {
            if (openRep.has(e)) reps.push({ role: e.role, dur: g.playT - openRep.get(e).t0, latches: openRep.get(e).latches });
            openRep.set(e, { t0: g.playT, latches: 1 });
          } else if (lf !== f - 1) { openRep.get(e).latches++; }
          if (lf !== f - 1) latchCycles.set(e, (latchCycles.get(e) || 0) + 1);
          lastBlockedF.set(e, f);
        } else if (openRep.has(e) && f - (lastBlockedF.get(e) || 0) > 3) {
          reps.push({ role: e.role, dur: g.playT - openRep.get(e).t0, latches: openRep.get(e).latches });
          openRep.delete(e);
        }
        // TIME TO FIRST PRESSURE: an UNBLOCKED rusher inside 60px of the passer
        if (rec.pressureT == null && !blocked && D(e, qb) < 60) {
          rec.pressureT = g.playT;
          rec.pressureRole = e.role;
          rec.pressureEverBlocked = everBlocked.get(e) ? 1 : 0;
        }
      }
    }
    for (const [e, r] of openRep) reps.push({ role: e.role, dur: g.playT - r.t0, latches: r.latches, open: 1 });

    rec.reason = (g.lastDead && g.lastDead.reason) || null;
    rec.sack = rec.reason === "SACKED!" ? 1 : 0;
    rec.sackT = rec.sack ? g.playT : null;
    rec.dropFrames = dropFrames;
    rec.reps = reps;
    rec.latchCycles = Array.from(latchCycles.values());
    let engaged = 0, approaching = 0, postShed = 0, never = 0;
    for (const log of frameLog.values()) {
      const ever = log.some((v) => v === 1);
      let seen = false;
      for (const v of log) {
        if (v === 1) { engaged++; seen = true; }
        else if (seen) postShed++;
        else if (ever) approaching++;
        else never++;
      }
    }
    rec.rushFrames = { engaged, approaching, postShed, never, total: engaged + approaching + postShed + never };
    return rec;
  }

  // ------------------------------------------------- geometry self-check
  // game.js:2995 stages the five OL at losX - 14 on 32px centres. If the YPX /
  // FIELD_X0 constants above ever drift out of step with the engine, this is the
  // field that says so — and the daylight/wall numbers here are the live
  // restatement of the ROADMAP "4px of daylight, ~140px wall" measurement.
  let geomCheck = null;
  {
    const st = stage(0, RUN_CALLS[0]);
    if (st) {
      const ol = g.players.filter((e) => e.team === "off" && e.role === "OL").sort((a, b) => a.y - b.y);
      const rb = g.players.find((e) => e.team === "off" && e.role === "RB");
      const front = g.players.filter((e) => e.team === "def" && ["DL", "EDGE"].includes(e.role)).sort((a, b) => a.y - b.y);
      const losX = xAtYd(g.losYd);
      const off = mean(ol.map((e) => e.x - losX));
      const spacing = mean(ol.slice(1).map((e, k) => e.y - ol[k].y));
      geomCheck = {
        losYd: g.losYd, losXcomputed: losX,
        olXoffsetFromLosPx: R2(off, 2), olCentreSpacingPx: R2(spacing, 2),
        olBodyRadiusPx: R2(mean(ol.map((e) => bodyR(e))), 2),
        olDaylightPx: R2(mean(ol.slice(1).map((e, k) => (e.y - bodyR(e)) - (ol[k].y + bodyR(ol[k])))), 2),
        olWallSpanPx: R2((ol[ol.length - 1].y + bodyR(ol[ol.length - 1])) - (ol[0].y - bodyR(ol[0])), 2),
        rbAlignYMinusMidPx: rb ? R2(rb.y - MID, 2) : null,
        frontDefYMinusMidPx: front.map((e) => R2(e.y - MID, 1)),
        agreesWithEngine: Math.abs(off + 14) < 8 && Math.abs(spacing - 32) < 3,
      };
    }
  }

  // ------------------------------------------------------------- run the bench
  const runs = [], runRejects = [];
  for (let i = 0; i < N_CARRIES; i++) {
    const r = runTrial(i, {});
    if (r.reject) runRejects.push(r.reject + (r.reason ? ":" + r.reason : "")); else runs.push(r);
  }
  const resolves = [], resolveRejects = [];
  for (let i = 0; i < N_PASSES; i++) {
    const r = passTrial(i, "resolve");
    if (r.reject) resolveRejects.push(r.reject); else resolves.push(r);
  }
  const holds = [], holdRejects = [];
  for (let i = 0; i < N_PASSES; i++) {
    const r = passTrial(i, "hold");
    if (r.reject) holdRejects.push(r.reject); else holds.push(r);
  }
  // PROBE: the same carries with the carrier steered at the widest reachable
  // hole via G.touchMove. Quantifies ROADMAP attribution (d) — "the carrier not
  // aiming at a hole" — WITHOUT changing a line of engine code. A small delta
  // means vision is not the binding constraint and S8 cannot be the lead fix.
  const probe = [], probeRejects = [];
  for (let i = 0; i < N_PROBE; i++) {
    const r = runTrial(i, { aimAtHole: true });
    if (r.reject) probeRejects.push(r.reject); else probe.push(r);
  }

  // ------------------------------------------------------------------ reduce
  const gains = runs.map((r) => r.gainYd);
  const probeGains = probe.map((r) => r.gainYd);
  const runReps = flat(runs.map((r) => r.reps));
  const pens = flat(runs.map((r) => r.penetration));
  const H_ = (k, field, d) => summary(runs.map((r) => r.holes[k] && r.holes[k][field]), d);
  const HS = (k, field) => shareOf(runs.map((r) => r.holes[k] && r.holes[k][field]));
  const holeBlock = (field, d) => ({ t0_1: H_("t1", field, d), t0_3: H_("t3", field, d), t0_5: H_("t5", field, d) });
  const holeShares = (field) => ({ t0_1: HS("t1", field), t0_3: HS("t3", field), t0_5: HS("t5", field) });

  const DROPBACKS_PER_GAME = 34;
  // one reducer, run over each pass configuration
  function passBlock(set, rejects, label) {
    const reps = flat(set.map((p) => p.reps));
    const rf = set.reduce((a, p) => ({
      engaged: a.engaged + p.rushFrames.engaged, approaching: a.approaching + p.rushFrames.approaching,
      postShed: a.postShed + p.rushFrames.postShed, never: a.never + p.rushFrames.never,
      total: a.total + p.rushFrames.total,
    }), { engaged: 0, approaching: 0, postShed: 0, never: 0, total: 0 });
    const sh = (v) => (rf.total ? R2(100 * v / rf.total, 1) : null);
    const sacks = set.reduce((a, p) => a + p.sack, 0);
    return {
      what: label,
      dropbacksSampled: set.length,
      rejected: rejects.length,
      rejectReasons: tally(rejects),
      sacks,
      sackRatePctOfDropbacks: set.length ? R2(100 * sacks / set.length, 2) : null,
      // POCKET HOLD is the clock-independent protection number, and it is the
      // one to compare across stages. A raw "sack rate" is not comparable on its
      // own, because it is a product of pocket integrity AND the passer's
      // decision clock: cpuQB throws at ~1.07s and is never sacked, while a
      // statue QB is sacked ~100% of the time. How long the pocket LASTS is the
      // property of the O-line. The derived per-game figures below convert it
      // back into sacks/game under three assumed throw clocks, and their spread
      // is exactly how clock-sensitive that conversion is.
      pocketHoldToSackSec: summary(set.map((p) => p.sackT), 3),
      pctSackedBefore: {
        t1_5: shareOf(set.map((p) => (p.sackT != null && p.sackT < 1.5 ? 1 : 0))),
        t2_0: shareOf(set.map((p) => (p.sackT != null && p.sackT < 2.0 ? 1 : 0))),
        t2_5: shareOf(set.map((p) => (p.sackT != null && p.sackT < 2.5 ? 1 : 0))),
        t3_0: shareOf(set.map((p) => (p.sackT != null && p.sackT < 3.0 ? 1 : 0))),
      },
      sacksPerTeamPerGameAtThrowClock: {
        basis: DROPBACKS_PER_GAME + " dropbacks per team per game. NFL reference is 2.3; tests/soak.js measures this build in real games at 31 sacks over 3 games, i.e. ~5.2 per team per game. READ ONLY THE CLOCK BELOW pocketHoldToSackSec.median: past that point nearly every held dropback has already been sacked, so the conversion saturates at DROPBACKS_PER_GAME and stops meaning anything.",
        clock2_0s: R2(DROPBACKS_PER_GAME * (mean(set.map((p) => (p.sackT != null && p.sackT < 2.0 ? 1 : 0))) || 0), 2),
        clock2_5s: R2(DROPBACKS_PER_GAME * (mean(set.map((p) => (p.sackT != null && p.sackT < 2.5 ? 1 : 0))) || 0), 2),
        clock3_0s: R2(DROPBACKS_PER_GAME * (mean(set.map((p) => (p.sackT != null && p.sackT < 3.0 ? 1 : 0))) || 0), 2),
      },
      timeToFirstPressureSec: summary(set.map((p) => p.pressureT), 3),
      pctOfDropbacksWithPressure: R2(100 * set.filter((p) => p.pressureT != null).length / Math.max(1, set.length), 1),
      firstPressureRoleMix: tally(set.map((p) => p.pressureRole)),
      pctFirstPressureCameFromAShedBlock: shareOf(set.map((p) => p.pressureEverBlocked)),
      rushFrameShares: {
        note: "share of rush-frames during the dropback, per defender in state 'rush'. approaching = not yet blocked but blocked later in this play; never = blocked at no point in the play.",
        engagedPct: sh(rf.engaged), approachingPct: sh(rf.approaching),
        postShedPct: sh(rf.postShed), neverBlockedPct: sh(rf.never),
        framesSampled: rf.total,
      },
      engagementDurationSec: {
        merged: {
          median: R2(pctl(reps.map((e) => e.dur), 0.5), 3),
          p90: R2(pctl(reps.map((e) => e.dur), 0.9), 3),
          mean: R2(mean(reps.map((e) => e.dur)), 3),
          n: reps.length,
        },
        latchesPerMergedRep: summary(reps.map((e) => e.latches), 2),
        latchCyclesPerDefender: summary(flat(set.map((p) => p.latchCycles)), 2),
      },
      timeToThrowOrSackSec: summary(set.map((p) => p.throwT), 3),
      dropbackLengthSec: summary(set.map((p) => p.dropFrames / 60), 3),
      whistleReasons: tally(set.map((p) => p.reason)),
    };
  }

  const byCall = {};
  for (const c of RUN_CALLS) byCall[c.name] = summary(runs.filter((r) => r.call === c.name).map((r) => r.gainYd), 2);
  const byDef = {};
  for (const d of DEF_CALLS) byDef[d.name] = summary(runs.filter((r) => r.def === d.name).map((r) => r.gainYd), 2);

  const report = {
    bench: "blocking_bench v1 (ROADMAP S1)",
    seed: SEED,
    config: {
      carriesRequested: N_CARRIES, passesRequested: N_PASSES, probeRequested: N_PROBE,
      difficulty: "VETERAN (DIFFS[1], defSpd 1.0)",
      weather: "CLEAR, re-pinned every play (speedMod 1, fumbleMod 0)",
      spot: "own 20, 1st & 10",
      carrierControl: "side A is the user, so becomeCarrier hands the RB to setControlled. With no stick input the engine drives him at e.vx = full speed, e.vy = 0 (game.js:7036-7040) — dead straight from his alignment. That IS the shipping default and it is what the ROADMAP baseline measured.",
      runCalls: RUN_CALLS.map((c) => c.name).join(", "),
      defCalls: DEF_CALLS.map((c) => c.name).join(", "),
      defRotation: "pinned by trial index (i % 4). cpuChooseDef scouts G.recentOff and would drift toward run fronts over 160 straight carries.",
      matchups: "8 fixed pairs over 16 franchises, rotated by (i % 8)",
      passConfig: "cpuQB drives the QB (bench controls WR1 pre-snap => userIsReceiver); drive stays A so pocketCollapsing is live",
    },
    geomCheck,
    run: {
      carriesSampled: runs.length,
      rejected: runRejects.length,
      rejectReasons: tally(runRejects),
      realHandoffGuarantee: "a carry counts only if the play reached phase 'carry' with an RB carrier, the carrier never changed (no fumble, no lateral), and the whistle was not SACKED!/INTERCEPTED!/FUMBLE!/INCOMPLETE. QB keepers and scrambles are excluded by construction: only HB DIVE / HB SWEEP are called and qbKeep is never set.",
      ydsPerCarry: summary(gains, 2),
      touchdowns: runs.reduce((a, r) => a + r.td, 0),
      handoffTSec: summary(runs.map((r) => r.handoffT), 3),
      handoffDepthYd: summary(runs.map((r) => r.handoffDepthYd), 2),
      timeToFirstContactFromSnapSec: summary(runs.map((r) => r.contactT), 3),
      timeToFirstContactFromHandoffSec: summary(runs.map((r) => r.contactSinceHandoff), 3),
      advanceAtFirstContactYd: summary(runs.map((r) => r.contactAdvYd), 2),
      maxAdvancePastLosYd: summary(runs.map((r) => r.maxAdvYd), 2),
      kinematicFloor: {
        note: "the handoff is taken behind the line and the carrier runs at his top speed, so there is a hard minimum time before he can reach the LOS AT ALL. Compare it with timeToFirstContactFromHandoffSec: if contact lands first, the play was over before the line of scrimmage was physically reachable in an empty stadium, and nothing downfield of the LOS can be the cause.",
        carrierTopSpeedPxPerSec: summary(runs.map((r) => r.carrierSpdPx), 1),
        secToReachLosInAVacuum: summary(runs.map((r) => r.secToReachLosInAVacuum), 3),
        pctContactedBeforeReachingTheLosWasEvenPossible: shareOf(runs.map((r) =>
          r.contactSinceHandoff != null && r.secToReachLosInAVacuum != null
            ? (r.contactSinceHandoff < r.secToReachLosInAVacuum ? 1 : 0) : null)),
      },
      holeWidth: {
        note: "px, sampled at +0.1 / +0.3 / +0.5s after the snap. 'box' scans the whole tackle box (MID +/- " + BOX_HALF + "px); 'reach' only counts gaps whose centre is within " + REACH_PX + "px of the carrier's own line, because a hole he cannot get to is not a hole. Fit threshold is the carrier's body DIAMETER.",
        boxWidestDefenceOnlyPx: holeBlock("boxDefGapPx", 1),
        boxWidestAllBodiesPx: holeBlock("boxAllGapPx", 1),
        boxWidestOffsetFromCarrierPx: holeBlock("boxAllGapOffsetPx", 1),
        reachWidestDefenceOnlyPx: holeBlock("reachDefGapPx", 1),
        reachWidestAllBodiesPx: holeBlock("reachAllGapPx", 1),
        carrierBodyWidthPx: H_("t3", "carrierWidthPx", 1),
        pctCarriesWithAFittingBoxHole: holeShares("boxAllFits"),
        pctCarriesWithAFittingREACHABLEHole: holeShares("reachAllFits"),
        pctCarriesWithAFittingReachableDefenceGap: holeShares("reachDefFits"),
      },
      straightAheadCorridor: {
        note: "the shipping carrier runs at vy = 0, so the decisive question is what is directly in front of him. corridorPx = x-distance to the first body whose y-footprint overlaps his; corridorIsOwnBlocker = that body wears his own jersey.",
        distanceToFirstBodyPx: holeBlock("corridorPx", 1),
        pctFirstBodyIsOwnBlocker: holeShares("corridorIsOwnBlocker"),
        firstBodyRoleMix: {
          t0_3: tally(runs.map((r) => r.holes.t3 && r.holes.t3.corridorRole)),
          t0_5: tally(runs.map((r) => r.holes.t5 && r.holes.t5.corridorRole)),
        },
        atFirstContact: {
          distanceToFirstBodyPx: summary(runs.map((r) => r.corridorAtContact && r.corridorAtContact.px), 1),
          roleMix: tally(runs.map((r) => r.corridorAtContact && r.corridorAtContact.role)),
          pctOwnBlocker: shareOf(runs.map((r) => r.corridorAtContact && r.corridorAtContact.team
            ? (r.corridorAtContact.team === "off" ? 1 : 0) : null)),
        },
        pctOfCarryFramesWedgedIntoOwnBlocker: R2(100 * mean(runs.map((r) => r.ownBlockerContactPct).filter((v) => v != null)), 1),
      },
      firstContact: {
        note: "the first defender to reach body range of the carrier — the '29 of 30' finding",
        roleMix: tally(runs.map((r) => r.contactRole)),
        pctAlreadyBlocked: shareOf(runs.map((r) => r.contactEverBlocked)),
        pctInTheOFFENSIVEBackfield: shareOf(runs.map((r) => r.contactInBackfield)),
        tacklerXRelativeToLosPx: summary(runs.map((r) => r.contactTacklerRelLosPx), 1),
        pctWasTheScriptedWashVictim: shareOf(runs.map((r) => r.contactWasWashed)),
        grindProgressOfThatDefender: summary(runs.map((r) => r.contactAccPeak), 3),
      },
      nearestDefenderAtWhistle: {
        roleMix: tally(runs.map((r) => r.firstTacklerRole)),
        pctAlreadyBlocked: shareOf(runs.map((r) => r.firstTacklerEverBlocked)),
        distPx: summary(runs.map((r) => r.firstTacklerDistPx), 1),
      },
      scriptedDoubleTeamWash: {
        note: "game.js:6576-6585 washes the interior defender nearest laneY = MID + lane*44. The RB aligns at MID + 14, so the designed lane and the actual runner are not the same y — and with the front four at MID -60/-20/+20/+60 that offset decides which of the two interior men gets washed.",
        designedLaneMinusCarrierPx: summary(runs.map((r) => r.wash && r.wash.laneMinusCarrierPx), 1),
        washedDefenderOffsetFromCarrierPx: summary(runs.map((r) => r.wash && r.wash.washedOffsetFromCarrierPx), 1),
        nearestFrontDefenderOffsetFromCarrierPx: summary(runs.map((r) => r.wash && r.wash.nearestFrontDefOffsetPx), 1),
        pctWashedTheDEFENDERNEARESTTheCarrier: shareOf(runs.map((r) => r.wash && r.wash.washedWasNearestToCarrier)),
      },
      blockLatchHealth: {
        note: "releaseBlock() zeroes blockAcc and a fresh latch re-rolls blockShedAt, so a block that keeps dropping and re-taking its man can never accumulate grind. latchCycles counts separate latches per blocked defender in one play; accPeak is the highest fraction of his shed threshold the grind ever reached (1.0 = an earned shed, ~0 = the grind never ran).",
        latchCyclesPerBlockedDefender: summary(flat(runs.map((r) => r.grind.latchCycles)), 2),
        grindAccPeakFraction: summary(flat(runs.map((r) => r.grind.accPeaks)), 3),
        washVictimLatchCycles: summary(runs.map((r) => r.grind.washedLatchCycles), 2),
        washVictimGrindAccPeak: summary(runs.map((r) => r.grind.washedAccPeak), 3),
        blockedDefendersPerCarry: summary(runs.map((r) => r.grind.blockedDefenders), 2),
      },
      pairDisplacement: {
        note: "yards the engagement travels along +x, the offence's direction. POSITIVE = the O-lineman drove the defender off the ball. Merged reps only (a re-latch within 3 frames continues the same rep).",
        rusherFromLatchYd: summary(runReps.map((e) => e.dxYd), 3),
        pairMidpointYd: summary(runReps.map((e) => e.midDxYd), 3),
        repsSampled: runReps.length,
      },
      blockedRusherPenetration: {
        note: "deepest px a defender who was blocked at some point got BEHIND his own presnap x — i.e. into the offensive backfield. NEGATIVE = penetration.",
        deepestPenetrationPx: summary(pens.map((p) => p.deepestPx), 1),
        pctBlockedDefendersWhoPenetrated: shareOf(pens.map((p) => (p.deepestPx < -6 ? 1 : 0))),
        secondsSpentBlocked: summary(pens.map((p) => p.blockedSec), 3),
        repsSampled: pens.length,
      },
      secondLevel: {
        note: "LB/CB/S ever engaged or ever the target of a runblock / leadblock assignment, per carry",
        defendersPerPlay: summary(runs.map((r) => r.secondLevel.n), 2),
        blockedPerPlay: summary(runs.map((r) => r.secondLevel.blocked), 2),
        pctBlocked: R2(100 * mean(runs.map((r) => r.secondLevel.blocked / Math.max(1, r.secondLevel.n))), 1),
      },
      engagementDurationSec: {
        merged: { median: R2(pctl(runReps.map((e) => e.dur), 0.5), 3), p90: R2(pctl(runReps.map((e) => e.dur), 0.9), 3), n: runReps.length },
        latchesPerMergedRep: summary(runReps.map((e) => e.latches), 2),
      },
      byRunCall: byCall,
      byDefensiveCall: byDef,
      whistleReasons: tally(runs.map((r) => r.reason)),
    },
    pass: {
      note: "TWO configurations. Read 'resolving' for the sack rate and 'heldPocket' for protection quality. A protection number taken off the resolving config is meaningless: cpuQB throws at a median ~1.07s, so the ball is gone before the rush arrives and the sack rate is 0% by construction.",
      resolving: passBlock(resolves, resolveRejects,
        "QB driven by cpuQB; the play ends in a throw or a sack. This is the SACK RATE configuration."),
      heldPocket: passBlock(holds, holdRejects,
        "user QB left standing in the pocket with no input, as test_batch3 #6's freshPassPlay does. This is the PROTECTION-QUALITY configuration and the one comparable to that assertion's 0.80-2.0s hold band and to the ROADMAP 52.9%/0.65s/39.6% figures."),
    },
    probes: {
      carrierAimedAtWidestReachableHole: {
        note: "identical carries, but the bench writes G.touchMove every frame to steer the carrier at the widest reachable tackle-box gap. No engine change — this is the mobile stick kdir() already reads, so the engine's own cut mechanic does the work. Isolates ROADMAP attribution (d).",
        carriesSampled: probe.length,
        rejectReasons: tally(probeRejects),
        ydsPerCarry: summary(probeGains, 2),
        deltaMedianYd: probeGains.length && gains.length ? R2(pctl(probeGains, 0.5) - pctl(gains, 0.5), 2) : null,
        deltaMeanYd: probeGains.length && gains.length ? R2(mean(probeGains) - mean(gains), 2) : null,
        maxAdvancePastLosYd: summary(probe.map((r) => r.maxAdvYd), 2),
        pctFirstBodyInCorridorIsOwnBlockerAt0_5: shareOf(probe.map((r) => r.holes.t5 && r.holes.t5.corridorIsOwnBlocker)),
      },
    },
    noiseFloorHowTo: "run this file twice at the same seed (output must be byte-identical), then at 3+ seeds; the spread of run.ydsPerCarry.median across seeds is the noise floor. run.ydsPerCarry.seMean is the within-run standard error of the mean.",
  };

  console.log(JSON.stringify(report, null, PRETTY ? 2 : 0));
  process.exit(0);
})();
