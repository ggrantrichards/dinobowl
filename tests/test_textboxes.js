// THE LOCK.
//
//   node tests/test_textboxes.js
//
// test_textfit.js checks the helpers and a list of boxes somebody thought to
// write down. This file checks EVERY boxed string on EVERY screen, by driving
// the real game headlessly and measuring what it actually drew. If a future
// edit lengthens a string, shrinks a card, or moves a column, this goes red.
//
// It is three things, and it needs all three:
//
//   PART 1  the instrument bites. A sweep that reports zero because someone
//           neutered its checker is indistinguishable from a clean game, so
//           the checker is first fed SYNTHETIC frames whose answers are known:
//           a string past the canvas edge, a string out of its box, two
//           strings on one baseline. If these stop being reported, this file
//           fails and nothing below it is trusted.
//   PART 2  the instrument LOOKED. A scene whose setup throws used to record
//           nothing, which reads as clean. So the scene count and the
//           render-failure count are asserted, not just the hit count.
//   PART 3  the game is clean, over several seeds. The game picks its call
//           sheet, weather, commentary and player-of-the-game at random, so
//           one run visits one sample of the strings; the seeds are fixed so
//           the result is reproducible, and each extra seed is a different
//           sample. Seed 1 runs in-process, the rest in child processes so
//           they cannot contaminate each other.
//
// It is deliberately the slowest suite in the repo (~20s). It is also the only
// one that can see a text overflow at all.
"use strict";
const path = require("path");
const { execFileSync } = require("child_process");
const sweep = require("./text_overflow_sweep.js");

const EXTRA_SEEDS = [2, 3];        // seed 1 is the in-process run below
const MIN_SCENES = 400;            // the drive currently visits 420

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra != null ? "  [" + extra + "]" : "")); }
}

// ---------------------------------------------------------------- PART 1
// A synthetic frame, in the exact shape the recorder produces. The numbers are
// chosen so the right answer is arithmetic, not judgement.
function text(o) {
  return Object.assign({
    text: "X", font: "10px 'Press Start 2P', monospace", px: 10, w: 10,
    align: "left", x: 0, y: 100, alpha: 1, fill: "#fff", rectCount: 0, scaleX: 1,
  }, o);
}
function rect(o) {
  return Object.assign({ x: 0, y: 0, w: 100, h: 20, kind: "fill", alpha: 1, style: "#111" }, o);
}

function selfTest() {
  // (a) BOUNDS: 40 characters at PF(10) is 400px starting at x=800 -> 240px
  //     past the right edge of a 960px canvas.
  const long = "X".repeat(40);
  let r = sweep.analyze({ rects: [], texts: [text({ text: long, w: 400, x: 800 })] }, "synthetic");
  const b = r.filter((f) => f.kind === "BOUNDS");
  check("instrument: reports a string that leaves the canvas",
    b.length === 1 && Math.abs(b[0].overflowPx - 240) < 0.51,
    JSON.stringify(r));

  // (b) BOX: 200px of text drawn into a 100px box that is visibly filled and
  //     vertically contains it. Left-aligned at the box's left edge + 4px pad.
  const boxed = { rects: [rect({ x: 100, y: 90, w: 100, h: 20 })],
    texts: [text({ text: "X".repeat(20), w: 200, x: 104, y: 104, rectCount: 1 })] };
  r = sweep.analyze(boxed, "synthetic");
  const bx = r.filter((f) => f.kind === "BOX");
  check("instrument: reports a string that leaves its box",
    bx.length === 1 && Math.abs(bx[0].overflowPx - 104) < 0.51 && bx[0].boxPx === 100,
    JSON.stringify(r));

  // (c) and it does NOT report one that fits: 80px of text in the same box.
  r = sweep.analyze({ rects: [rect({ x: 100, y: 90, w: 100, h: 20 })],
    texts: [text({ text: "X".repeat(8), w: 80, x: 104, y: 104, rectCount: 1 })] }, "synthetic");
  check("instrument: silent when the string fits", r.length === 0, JSON.stringify(r));

  // (d) COLLIDE: two different strings on one baseline whose spans overlap.
  r = sweep.analyze({ rects: [], texts: [
    text({ text: "LEFT", w: 100, x: 200, y: 300 }),
    text({ text: "RIGHT", w: 100, x: 250, y: 300 }),
  ] }, "synthetic");
  const co = r.filter((f) => f.kind === "COLLIDE");
  check("instrument: reports two strings printed on one baseline",
    co.length === 1 && Math.abs(co[0].overflowPx - 50) < 0.51, JSON.stringify(r));

  // (e) a drop shadow is the SAME string 1px away and must not be a collision.
  r = sweep.analyze({ rects: [], texts: [
    text({ text: "SAME", w: 40, x: 200, y: 300 }),
    text({ text: "SAME", w: 40, x: 201, y: 301 }),
  ] }, "synthetic");
  check("instrument: a drop shadow is not a collision",
    r.filter((f) => f.kind === "COLLIDE").length === 0, JSON.stringify(r));

  // (f) the faint-card rule. drawQBs' card is rgba(255,255,255,.03); the floor
  //     used to be .15, which hid a real 108px box holding a 112px string.
  r = sweep.analyze({ rects: [rect({ x: 100, y: 90, w: 108, h: 108, style: "rgba(255,255,255,.03)", alpha: 0.03 })],
    texts: [text({ text: "X".repeat(16), w: 112, px: 7, x: 154, y: 130, align: "center", rectCount: 1 })] }, "synthetic");
  check("instrument: a faint .03-alpha card still counts as a box",
    r.filter((f) => f.kind === "BOX").length === 1, JSON.stringify(r));

  // (g) VBOUNDS. A baseline at y=556 on a 540px canvas puts a PF(7) band at
  //     549..558, i.e. ~18px below the bottom edge. This is the check that
  //     found a whole menu card's description drawn off the bottom of the
  //     screen while every WIDTH on that screen measured perfectly.
  r = sweep.analyze({ rects: [], texts: [text({ px: 7, w: 210, x: 96, y: 556 })] }, "synthetic");
  const vb = r.filter((f) => f.kind === "VBOUNDS");
  check("instrument: reports a string drawn below the bottom edge",
    vb.length === 1 && Math.abs(vb[0].overflowPx - 17.75) < 0.51, JSON.stringify(r));
  r = sweep.analyze({ rects: [], texts: [text({ px: 7, w: 210, x: 96, y: 4 })] }, "synthetic");
  check("instrument: reports a string drawn above the top edge",
    r.filter((f) => f.kind === "VBOUNDS").length === 1, JSON.stringify(r));

  // (h) occlusion, and its threshold. A FULLY opaque plate painted over the
  //     first string in between means there is nothing left to collide with;
  //     a 92% one does not -- it ghosts, and a ghost of one string through
  //     another is the defect, not the excuse.
  const twoStrings = [
    text({ text: "UNDER", w: 100, x: 200, y: 300, rectCount: 0 }),
    text({ text: "OVER", w: 100, x: 250, y: 300, rectCount: 1 }),
  ];
  const cover = (alpha) => ({
    rects: [rect({ x: 150, y: 280, w: 300, h: 30, alpha: alpha, style: "rgba(4,10,7," + alpha + ")" })],
    texts: twoStrings,
  });
  check("instrument: an opaque plate between two strings is occlusion, not a collision",
    sweep.analyze(cover(1), "synthetic").filter((f) => f.kind === "COLLIDE").length === 0);
  check("instrument: a 92% plate is a GHOST and still collides",
    sweep.analyze(cover(0.92), "synthetic").filter((f) => f.kind === "COLLIDE").length === 1);
}

// The only string the sweep expects to see CUT, and it is one the sweep
// invented: 300 x's fed to notify() to prove an unbounded string cannot escape
// its box. Real game copy must never appear here -- if it does, some screen is
// eating words to fit and the answer is a wider box or another line, not a
// smaller font. This is the guard fitText cannot provide for itself: once
// nothing can overflow, the only thing left to lose is the words.
const ALLOWED_CUTS = ["X".repeat(300)];
function unexpectedCuts(cuts) {
  return (cuts || []).filter((c) => ALLOWED_CUTS.indexOf(c) < 0);
}

// ---------------------------------------------------------------- PART 3
function describe(hits) {
  return hits.slice(0, 8).map((f) => "[" + f.kind + "] +" + f.overflowPx + "px " +
    JSON.stringify(f.text) + " in " + f.boxPx + "px @" + f.where).join(" ;; ");
}

function childSeed(seed) {
  // The sweep exits NON-ZERO when it finds something, which is the whole point
  // of it being a gate -- so a non-zero exit is the interesting case, not an
  // error. Read stdout either way and let the assertions below judge it.
  let out;
  try {
    out = execFileSync(process.execPath,
      [path.join(__dirname, "text_overflow_sweep.js"), "--json"],
      { env: Object.assign({}, process.env, { DINO_SWEEP_SEED: String(seed) }),
        encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = String(e.stdout || "");
    if (!out) throw new Error("seed " + seed + " produced no output: " + e.message);
  }
  const line = out.split(/\r?\n/).find((l) => l.indexOf("SWEEP_JSON ") === 0);
  if (!line) throw new Error("seed " + seed + ": no SWEEP_JSON line\n" + out.slice(-2000));
  return JSON.parse(line.slice("SWEEP_JSON ".length));
}

(async () => {
  selfTest();

  const res = await sweep.drive({ quiet: true });

  // PART 2 -- it looked, and every screen rendered.
  check("sweep: drove at least " + MIN_SCENES + " screen states",
    res.scenes.length >= MIN_SCENES, res.scenes.length + " scenes");
  const broke = res.scenes.filter((s) => !s.ok);
  check("sweep: every screen rendered without throwing", broke.length === 0,
    broke.map((s) => s.label + " -- " + s.why).join(" ;; "));
  check("sweep: every screen actually drew some text",
    res.scenes.every((s) => !s.ok || s.texts > 0),
    res.scenes.filter((s) => s.ok && !s.texts).map((s) => s.label).join(", "));

  // PART 3 -- and nothing is outside its box.
  check("seed 1: no string leaves its box, its baseline or the canvas",
    res.gating.length === 0, describe(res.gating));
  // The LOW-confidence bucket is not a gate (the box inference is a heuristic
  // and a soft hit is a thing to LOOK at, not a build break) but it should be
  // empty on a clean tree, so it is worth saying out loud when it is not.
  check("seed 1: not even a soft, low-confidence hit", res.uniq.length === 0,
    describe(res.uniq));
  check("seed 1: no real copy had to be cut to fit",
    unexpectedCuts(res.cuts).length === 0,
    unexpectedCuts(res.cuts).map((c) => JSON.stringify(c)).join(" ;; "));

  for (const seed of EXTRA_SEEDS) {
    let j;
    try { j = childSeed(seed); }
    catch (e) { check("seed " + seed + ": sweep ran", false, e.message); continue; }
    check("seed " + seed + ": drove at least " + MIN_SCENES + " screen states",
      j.scenes >= MIN_SCENES, j.scenes + " scenes");
    check("seed " + seed + ": every screen rendered", j.failed.length === 0, j.failed.join(" ;; "));
    check("seed " + seed + ": no string leaves its box, its baseline or the canvas",
      j.gating.length === 0, describe(j.gating));
    check("seed " + seed + ": no real copy had to be cut to fit",
      unexpectedCuts(j.cuts).length === 0,
      unexpectedCuts(j.cuts).map((c) => JSON.stringify(c)).join(" ;; "));
  }

  console.log("\n" + pass + " pass, " + fail + " fail");
  if (fail) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 2; });
