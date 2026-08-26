// TEXT OVERFLOW SWEEP -- the instrument, not a unit test.
//
//   node tests/text_overflow_sweep.js
//
// Drives the real game into every screen headlessly, records the geometry of
// every fillText and every fillRect for one frame of each, infers which box
// each string was drawn INTO, and reports the ones that do not fit -- with the
// measured width, the box width, and the overflow in pixels.
//
// Four checks, in decreasing order of assumption:
//   BOUNDS   the string leaves the 960x540 canvas SIDEWAYS. No inference.
//   VBOUNDS  the string leaves it VERTICALLY -- drawn above the top edge or
//            below the bottom one. Also inference-free, and it was the missing
//            half: a screen can lay out five rows of cards in four rows of
//            room and every width on it still measures perfectly.
//   BOX      the string leaves the rect it was drawn into. Uses the container
//            inference below, and carries a confidence.
//   COLLIDE  two strings on the same baseline overlap. Catches multi-column
//            layouts that have no box to overflow (the season-stats table).
//
// It exits non-zero if any HIGH-confidence BOX or any BOUNDS hit survives, so
// it can be a gate. tests/test_textfit.js is the fast regression lock; this is
// what you run to go LOOKING.
//
// It carries its own copy of the browser stubs rather than requiring
// harness.js, because it needs a 2d context that RECORDS and harness.js's must
// stay a cheap no-op for every other suite. The part that matters -- the text
// metric -- is shared: both require ./textmetrics.js.
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

"use strict";
// ---- browser stubs + a RECORDING 2d context ------------------------------
const TM = require("./textmetrics.js");
const GAME_DIR = path.join(__dirname, "..", "static", "game") + path.sep;

const REC = { rects: [], texts: [], on: false };
function mul(a, b) { // a then b  (b applied on top)
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
          a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
const ID = [1,0,0,1,0,0];
function styleAlpha(style) {
  const s = String(style || "");
  if (s === "transparent" || s === "none") return 0;
  const m = /rgba?\(([^)]*)\)/.exec(s);
  if (m) { const p = m[1].split(","); return p.length > 3 ? parseFloat(p[3]) : 1; }
  return 1;
}
function apply(m, x, y) { return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]; }

function makeCtx(isMain) {
  const st = { font: "10px sans-serif", textAlign: "left", fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, m: ID.slice() };
  const stack = [];
  const target = {};
  const api = {
    save() { stack.push({ ...st, m: st.m.slice() }); },
    restore() { const s = stack.pop(); if (s) Object.assign(st, s); },
    translate(x, y) { st.m = mul(st.m, [1,0,0,1,x,y]); },
    scale(x, y) { st.m = mul(st.m, [x,0,0,y,0,0]); },
    rotate(a) { const c=Math.cos(a), s=Math.sin(a); st.m = mul(st.m, [c,s,-s,c,0,0]); },
    setTransform(a,b,c,d,e,f) { st.m = [a,b,c,d,e,f]; },
    resetTransform() { st.m = ID.slice(); },
    measureText(s) { return { width: TM.measure(s, st.font) }; },
    getImageData: (x,y,w,h) => ({ data: new Uint8ClampedArray(Math.max(4, w*h*4)) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect(x,y,w,h) { if (REC.on && isMain) push(REC.rects, x,y,w,h,"fill",String(st.fillStyle)); },
    strokeRect(x,y,w,h) { if (REC.on && isMain) push(REC.rects, x,y,w,h,"stroke",String(st.strokeStyle)); },
    clearRect() {},
    fillText(s,x,y) {
      if (!REC.on || !isMain) return;
      const w = TM.measure(s, st.font), px = TM.pxOf(st.font);
      const p = apply(st.m, x, y);
      REC.texts.push({ text: String(s), font: st.font, px, w, align: st.textAlign,
        x: p[0], y: p[1], rawX: x, rawY: y, alpha: st.globalAlpha,
        fill: String(st.fillStyle), rectCount: REC.rects.length, scaleX: st.m[0] });
    },
    strokeText() {},
  };
  function push(arr,x,y,w,h,kind,style) {
    const a = apply(st.m, x, y), b = apply(st.m, x+w, y+h);
    arr.push({ x: Math.min(a[0],b[0]), y: Math.min(a[1],b[1]),
               w: Math.abs(b[0]-a[0]), h: Math.abs(b[1]-a[1]), kind,
               alpha: st.globalAlpha * styleAlpha(style), style });
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in api) return api[k];
      if (k === "font") return st.font;
      if (k === "textAlign") return st.textAlign;
      if (k === "fillStyle") return st.fillStyle;
      if (k === "strokeStyle") return st.strokeStyle;
      if (k === "globalAlpha") return st.globalAlpha;
      if (k === "canvas") return null;
      return () => {};
    },
    set(t, k, v) { if (k in st) st[k] = v; return true; },
  });
}

let mainMade = false;
function makeCanvasStub() {
  const listeners = {};
  const isMain = !mainMade; mainMade = true;
  return { width: 0, height: 0, style: {}, getContext: () => makeCtx(isMain),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    __listeners: listeners };
}
const gameCanvas = makeCanvasStub();
const winListeners = {}, store = new Map();
global.window = { addEventListener: (ev, fn) => { (winListeners[ev]=winListeners[ev]||[]).push(fn); }, __rafQueue: [] };
global.document = {
  getElementById: (id) => (id === "game" ? gameCanvas : { textContent: "", style: {} }),
  createElement: (tag) => (tag === "canvas" ? makeCanvasStub() : { click(){}, style:{}, set href(v){}, get href(){return "";}, addEventListener(){} }),
  addEventListener: () => {}, hidden: false,
  body: { classList: { toggle() {} } }, documentElement: {},
};
global.localStorage = { getItem: k => store.has(k)?store.get(k):null, setItem: (k,v)=>store.set(k,String(v)), removeItem: k=>store.delete(k) };
let rafCb = null;
global.requestAnimationFrame = cb => { rafCb = cb; };
global.alert = () => {};
global.history = { replaceState() {} };
try { Object.defineProperty(global, "navigator", { value: {}, configurable: true }); } catch(e) { global.navigator = {}; }
global.location = { search: "", pathname: "/game/" };
global.fetch = async (url) => String(url).includes("teams.json")
  ? { ok: true, json: async () => JSON.parse(fs.readFileSync(GAME_DIR + "teams.json", "utf8")) }
  : { ok: false, json: async () => ({}) };
let simTime = 0;
if (!global.performance) global.performance = { now: () => simTime };

// DETERMINISM. The game picks its call sheet, its weather, its commentary and
// its player-of-the-game with Math.random, so an unseeded sweep visits a
// different set of strings every run -- I watched the same revision report 1
// hit and then 7. That is fine for going LOOKING and useless as a gate, so the
// generator is replaced with a seeded one (mulberry32) and the seed is an
// input. Run several seeds to widen the sample; run the SAME seed to reproduce.
const SEED = Number(process.env.DINO_SWEEP_SEED || 1) | 0;
Math.random = (function (a) {
  a = (a + 0x6d2b79f5) | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})(SEED);

vm.runInThisContext(fs.readFileSync(GAME_DIR + "sprites.js", "utf8"), { filename: "sprites.js" });
global.DinoSprites = global.window.DinoSprites;
vm.runInThisContext(fs.readFileSync(GAME_DIR + "game.js", "utf8"), { filename: "game.js" });

function step(ms = 16) { simTime += ms; const cb = rafCb; rafCb = null; if (cb) cb(simTime); else throw new Error("loop died"); }
function stepFor(s) { for (let i=0;i<Math.ceil(s*60);i++) step(16.7); }
function key(k) { for (const fn of winListeners.keydown||[]) fn({key:k,preventDefault(){}}); for (const fn of winListeners.keyup||[]) fn({key:k,preventDefault(){}}); }
function mouse(ev,x,y,button=0){ const e={clientX:x,clientY:y,button,preventDefault(){}};
  for (const fn of gameCanvas.__listeners[ev]||[]) fn(e); for (const fn of winListeners[ev]||[]) fn(e); }
const G = () => global.window.__game;
// capture ONE frame's worth of geometry
function capture() { REC.rects.length = 0; REC.texts.length = 0; REC.on = true; step(16.7); REC.on = false;
  return { rects: REC.rects.slice(), texts: REC.texts.slice() }; }

// ---- box inference + the three checks -------------------------------------
const W = 960, H = 540;

function span(t) {
  const w = t.w;
  if (t.align === "center") return [t.x - w / 2, t.x + w / 2];
  if (t.align === "right" || t.align === "end") return [t.x - w, t.x];
  return [t.x, t.x + w];
}

// Which rect IS this string's box? Learned from the false positives of the
// first two passes:
//   1. the rect must be VISIBLE — fillStyle alpha >= .02. This started at
//      .15 to reject the menu's decorative rgba(255,255,255,.015) stripes,
//      but .15 also rejected drawQBs' rgba(255,255,255,.03) card, which is a
//      real 108px box that really did hold a 112px string. The stripes are
//      full-HEIGHT and rule 2 rejects them on their own, so the floor comes
//      down and the SHAPE rules do the work instead of the paint opacity.
//   2. it must not be the page backdrop (full width AND near-full height).
//      A full-width STRIP (0,32,W,18) very much is a box.
//   3. the text's em band must sit inside it vertically.
//   4. the inset must AGREE WITH textAlign. A left-aligned string sits a small
//      pad in from the box's left edge; a centred one sits near the box's
//      centre. This is what rules out unrelated HUD chips that merely happen
//      to sit under the anchor.
//   5. a box narrower than three characters of the current font is not a text
//      box, it is some other widget.
//   6. among the survivors take the MOST RECENTLY DRAWN. Painter order is the
//      real grouping signal: a screen paints box-then-its-text, so the last
//      qualifying rect before the string is the one it was positioned against.
function container(t, rects) {
  const [x0, x1] = span(t);
  const top = t.y - t.px, bot = t.y + t.px * 0.25;
  const isC = t.align === "center";
  const isR = t.align === "right" || t.align === "end";
  for (let i = t.rectCount - 1; i >= 0; i--) {
    const r = rects[i];
    if (r.w < 8 || r.h < 6) continue;
    if (r.alpha < 0.02) continue;
    if (r.w >= W - 2 && r.h >= H * 0.7) continue;          // page backdrop
    if (r.h >= H * 0.92) continue;                          // full-height stripe
    if (r.w < t.px * 3) continue;                           // too narrow to be a text box
    const ov = Math.min(bot, r.y + r.h) - Math.max(top, r.y);
    if (ov < (bot - top) * 0.55) continue;
    const lim = Math.max(8, r.w * 0.45);
    if (isC) { if (Math.abs(t.x - (r.x + r.w / 2)) > Math.max(6, r.w * 0.3)) continue; }
    else if (isR) { const d = (r.x + r.w) - t.x; if (d < -2 || d > lim) continue; }
    else { const d = t.x - r.x; if (d < -2 || d > lim) continue; }
    if (r.x + r.w <= x0 + 1 || r.x >= x1 - 1) continue;
    return r;
  }
  return null;
}

// a drop shadow is the SAME string a few px away — not a collision
function isShadow(a, b) {
  return a.text === b.text && Math.abs(a.x - b.x) <= 10 && Math.abs(a.y - b.y) <= 10;
}
// Two reasons two overlapping strings are not actually a collision, both of
// them about PAINT ORDER, and they need different thresholds because they are
// different claims:
//
//   a) a near-full-screen fill drawn between them is a LAYER change (the title
//      footer vs the overlay drawn on top of it). 0.8 is enough for that --
//      nobody reads the screen underneath a 20%-visible wash.
//   b) an opaque PLATE drawn between them that covers the first string is
//      simple occlusion: it is not there any more. This one demands 0.98,
//      because a 92% plate does NOT hide what is under it -- it ghosts it, and
//      a ghost of one string through another is exactly the defect being
//      hunted. (That is not hypothetical: the tapped-player info card is
//      rgba(4,10,7,.92) and it used to ghost the carrier's jersey name.)
function separated(a, b, rects) {
  const lo = Math.min(a.rectCount, b.rectCount), hi = Math.max(a.rectCount, b.rectCount);
  const first = a.rectCount <= b.rectCount ? a : b;
  const fs2 = span(first);
  const ftop = first.y - first.px, fbot = first.y + first.px * 0.25;
  for (let i = lo; i < hi; i++) {
    const r = rects[i];
    // Only a FILL can hide anything. A strokeRect is an OUTLINE: it paints four
    // one-pixel edges and leaves the middle exactly as it was. Getting this
    // wrong is not academic -- the info card draws a gold 196x46 strokeRect at
    // alpha 1, and counting that as a cover silently excused the very
    // collision underneath it. Found by trying to make the lock fail.
    if (r.kind !== "fill") continue;
    if (r.alpha >= 0.8 && r.w >= W * 0.9 && r.h >= H * 0.9) return true;
    if (r.alpha >= 0.98 &&
        r.x <= fs2[0] + 1 && r.x + r.w >= fs2[1] - 1 &&
        r.y <= ftop + 1 && r.y + r.h >= fbot - 1) return true;
  }
  return false;
}

function analyze(frame, where) {
  const out = [];
  const { rects, texts } = frame;
  for (const t of texts) {
    if (!t.text || !t.text.trim()) continue;
    if (t.alpha < 0.06) continue;
    const [x0, x1] = span(t);
    const outR = x1 - W, outL = -x0;
    // Only a string ANCHORED on screen is a UI string. A world label whose
    // anchor is off-camera (a jersey name 200 yards downfield) and an intro
    // name mid-slide-in are not overflows, they are just not on screen yet.
    const anchored = t.x >= 0 && t.x <= W && x1 > 0 && x0 < W;

    // VERTICAL bounds. The em band of a pixel font sits from (baseline - px)
    // to about (baseline + px/4); if that band leaves the canvas the string is
    // partly or wholly not on screen. Anything anchored horizontally on screen
    // is a UI string, because the only strings positioned in WORLD space are
    // the player labels and the field never leaves y = 84..508.
    const top = t.y - t.px, bot = t.y + t.px * 0.25;
    const outB = bot - H, outT = -top;
    if (anchored && (outB > 0.5 || outT > 0.5)) {
      out.push({
        kind: "VBOUNDS", where, text: t.text, fontPx: t.px, measuredPx: +t.w.toFixed(1),
        boxPx: H, overflowPx: +Math.max(outB, outT).toFixed(1), side: outB > outT ? "bottom" : "top",
        at: "x=" + t.x.toFixed(0) + " y=" + t.y.toFixed(0) + " band=[" +
          top.toFixed(0) + "," + bot.toFixed(0) + "] canvas h=" + H
      });
      continue;
    }
    if (anchored && (outR > 0.5 || outL > 0.5)) {
      out.push({
        kind: "BOUNDS", where, text: t.text, fontPx: t.px, measuredPx: +t.w.toFixed(1),
        boxPx: W, overflowPx: +Math.max(outR, outL).toFixed(1), side: outR > outL ? "right" : "left",
        at: "x=" + t.x.toFixed(0) + " y=" + t.y.toFixed(0) + " align=" + t.align
      });
      continue;
    }
    const r = container(t, rects);
    if (r) {
      const spillR = x1 - (r.x + r.w), spillL = r.x - x0;
      const spill = Math.max(spillR, spillL);
      if (spill > 0.5) {
        out.push({
          kind: "BOX", where, text: t.text, fontPx: t.px, measuredPx: +t.w.toFixed(1),
          confidence: (r.w >= 120 || r.w >= t.w * 0.55) ? "HIGH" : "LOW",
          boxPx: +r.w.toFixed(0), overflowPx: +spill.toFixed(1), side: spillR > spillL ? "right" : "left",
          at: "box(" + r.x.toFixed(0) + "," + r.y.toFixed(0) + "," + r.w.toFixed(0) + "x" + r.h.toFixed(0) +
            ") text x=" + t.x.toFixed(0) + " y=" + t.y.toFixed(0) + " align=" + t.align
        });
      }
    }
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i], b = texts[j];
      if (!a.text.trim() || !b.text.trim()) continue;
      if (a.alpha < 0.06 || b.alpha < 0.06) continue;
      if (Math.abs(a.y - b.y) > Math.min(a.px, b.px) * 0.6) continue;
      if (isShadow(a, b)) continue;
      if (separated(a, b, rects)) continue;
      const [ax0, ax1] = span(a), [bx0, bx1] = span(b);
      const ov = Math.min(ax1, bx1) - Math.max(ax0, bx0);
      if (ov > 1) out.push({
        kind: "COLLIDE", where, text: a.text, other: b.text,
        fontPx: a.px, measuredPx: +a.w.toFixed(1), boxPx: +Math.abs(bx0 - ax0).toFixed(0),
        overflowPx: +ov.toFixed(1),
        at: "y=" + a.y.toFixed(0) + " a=[" + ax0.toFixed(0) + "," + ax1.toFixed(0) +
          "] b=[" + bx0.toFixed(0) + "," + bx1.toFixed(0) + "]"
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the drive
"use strict";

const findings = [];
// One record per scene. A scene whose setup threw used to print "!!" and record
// nothing, which is indistinguishable from a clean scene in the totals -- so a
// broken driver would report zero overflows and pass. Now the caller can tell
// "measured and clean" from "never looked", and the test asserts on it.
const scenes = [];
let QUIET = false;
const say = (m) => { if (!QUIET) console.log(m); };
function shot(label) {
  let f;
  try { f = capture(); }
  catch (e) { say("  !! " + label + " threw: " + e.message); scenes.push({ label, ok: false, why: "threw: " + e.message }); return; }
  if (G().lastErr) {
    const why = "lastErr: " + G().lastErr;
    say("  !! " + label + " " + why); G().lastErr = null;
    scenes.push({ label, ok: false, why }); return;
  }
  const r = analyze(f, label);
  say("  " + label + ": " + f.texts.length + " strings " + f.rects.length + " rects -> " + r.length);
  scenes.push({ label, ok: true, texts: f.texts.length, rects: f.rects.length, hits: r.length });
  findings.push(...r);
}
function scene(label, setup) {
  try { setup(); }
  catch (e) { say("  !! " + label + " setup threw: " + e.message); scenes.push({ label, ok: false, why: "setup threw: " + e.message }); return; }
  shot(label);
}

async function drive(opts) {
  QUIET = !!(opts && opts.quiet);
  findings.length = 0; scenes.length = 0;
  await new Promise(r => setTimeout(r, 400));
  const g = G(), D = g.debug;
  global.window.DINO_BOWL_FIREBASE_CONFIG = { apiKey: "x" };
  const PJ = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "static", "game", "players.json"), "utf8"));
  const PLAYERS = PJ.players || PJ;

  scene("title", () => { g.state = "title"; });
  scene("title(gallery)", () => { g.gallery = true; });
  scene("title(gallery off)", () => { g.gallery = false; });

  // the cold open, every beat of it
  for (const bt of [0.2, 0.8, 1.5, 2.0, 2.7, 3.5, 4.2, 4.95, 5.6, 8])
    scene("coldopen(t=" + bt + ")", () => { g.state = "title"; g.bootT = bt; });
  g.bootT = 30;

  // ---------- FRONT DOOR (state "menu", 2 cols of 372) and the full grid
  // (state "allmodes", 3 cols of 284). Every card selected in turn, because
  // selection bumps the title from PF(9) to PF(10).
  for (let i = 0; i < 4; i++) scene("frontdoor(sel" + i + ")", () => { g.state = "menu"; g.menuIdx = i; });
  for (let i = 0; i < 14; i++) scene("allmodes(sel" + i + ")", () => { g.state = "allmodes"; g.menuIdx = i; });
  scene("allmodes(hover)", () => { mouse("mousemove", 300, 300); });

  for (let d = 0; d < D.diffTable.length; d++)
    scene("settings(diff" + d + ")", () => { g.diff = d; g.state = "settings"; });
  scene("settings(all off)", () => { g.crt = false; g.playDefense = false; g.halftimeShow = false; g.coachMode = false; g.state = "settings"; });
  scene("settings(all on)", () => { g.crt = true; g.playDefense = true; g.halftimeShow = true; g.coachMode = true; });

  scene("qbs", () => { g.state = "qbs"; });
  for (let p = 0; p < 7; p++) scene("tutorial(p" + p + ")", () => { g.state = "tutorial"; g.tut = p; });

  scene("online_wait(searching)", () => { g.state = "online_wait"; g.online = { phase: "search" }; });
  scene("online_wait(found-host)", () => { g.online = { phase: "found", role: "host" }; });
  scene("online_wait(found-guest)", () => { g.online = { phase: "found", role: "guest" }; });
  g.online = null;

  // ---------- scouting, over the real ~1700-row table
  g.scoutData = PLAYERS;
  const combos = [["spd", "ALL"], ["stam", "OFF"], ["hands", "OL"], ["agi", "DEF"], ["tkl", "ALL"], ["jump", "ALL"], ["str", "ALL"]];
  for (const c of combos)
    scene("scout(" + c[0] + "/" + c[1] + ")", () => { g.scout = { sort: c[0], posFilter: c[1], top: 0, list: null }; g.state = "scout"; });
  for (const top of [50, 200, 600, 1200])
    scene("scout(top" + top + ")", () => { g.scout = { sort: "spd", posFilter: "ALL", top: top, list: null }; });

  // ---------- playbook lab
  scene("editor", () => { g.ed = { slot: 0, routes: { WR1: [], WR3: [], TE: [], WR2: [], RB: [] } }; g.state = "editor"; });
  scene("editor(slot3)", () => { g.ed.slot = 3; });

  // ---------- season screens over many teams (team names vary a lot in length)
  const TEAMSET = ["GB", "NE", "JAX", "LV", "WAS", "TB", "LAC", "KC", "NO", "CIN", "SF", "MIN", "NYG", "PHI"];
  for (const tm of TEAMSET) {
    D.newSeason(tm);
    scene("hub(" + tm + ")", () => { g.state = "hub"; });
    scene("standings(" + tm + ")", () => { g.state = "standings"; });
    try {
      for (let w = 1; w <= 6; w++) g.szn.results.push({ week: w, my: 20 + w, them: 13 + (w % 4) * 7, home: w % 2 === 0, opp: g.szn.schedule[w - 1].opp });
      g.szn.week = 7; g.szn.trainPts = 3;
    } catch (e) { }
    scene("hub(" + tm + ",played)", () => { g.state = "hub"; });
    scene("upgrade(" + tm + ")", () => { g.state = "upgrade"; });
    const rk = (n, pos, from) => ({ name: n, pos: pos, role: pos, spd: 88, hands: 84, str: 79,
      jump: 81, agi: 86, arm: 90, acc: 87, tkl: 72, stats: {}, fromTeam: from });
    scene("offseason(draft," + tm + ")", () => {
      g.off = { step: 0, chosen: {},
        picks: [rk("Nova Quickstep Jr.", "WR"), rk("Bruiser Yates Jr.", "LB"), rk("Sarge Fossil Jr.", "QB")],
        fas: [rk("Thunderfoot Bonecrusher", "TE", "JAX"), rk("Q", "S", "NE"), rk("Windshear Skyhunter", "WR", "LAC")] };
      g.state = "offseason";
    });
    scene("offseason(fa," + tm + ")", () => { g.off.step = 1; });
  }

  D.newSeason("GB");
  scene("sznstats(full)", () => {
    const mk = (name, pos, o) => Object.assign({
      name: name, pos: pos, games: 9, passYds: 0, rushYds: 0, recYds: 0, tkl: 0, sacks: 0,
      att: 0, cmp: 0, car: 0, rec: 0, passTd: 0, passInt: 0, rushTd: 0, recTd: 0, defInt: 0
    }, o);
    g.szn.seasonStats = {
      a: mk("Thunderfoot Bonecrusher", "QB", { att: 288, cmp: 199, passYds: 3410, passTd: 31, passInt: 12, car: 41, rushYds: 288, rushTd: 4 }),
      b: mk("Slabtail Longstrider", "RB", { car: 244, rushYds: 1388, rushTd: 17, rec: 44, recYds: 402, recTd: 3 }),
      c: mk("Windshear Skyhunter", "WR", { rec: 108, recYds: 1622, recTd: 14 }),
      d: mk("Ironhide Nightstalker", "LB", { tkl: 142, sacks: 13, defInt: 4 }),
      e: mk("Q", "S", { tkl: 88, sacks: 2, defInt: 7 }),
      f: mk("Bonecrusher Thunderfoot", "EDGE", { tkl: 61, sacks: 19, defInt: 1 })
    };
    // 14 rows is what the screen draws at most, and rows 8..14 live in the
    // RIGHT-hand column — the only place the 58-char slice can run off canvas
    for (let i = 0; i < 10; i++)
      g.szn.seasonStats["x" + i] = mk("Longstrider Nightstalker", "WR", { rec: 100 + i, recYds: 1500 + i, recTd: 12, car: 30, rushYds: 244, rushTd: 3, att: 12, cmp: 8, passYds: 133, passTd: 2, passInt: 1 });
    g.state = "sznstats";
  });
  scene("sznstats(empty)", () => { g.szn.seasonStats = {}; });
  scene("hub(champ)", () => { g.szn.phase = "done"; g.szn.champion = g.szn.team; g.state = "hub"; });
  scene("hub(lost)", () => { g.szn.champion = "NE"; });
  scene("hub(playoffs)", () => {
    g.szn.phase = "playoffs";
    g.szn.playoffs = { round: 0, seed: 4, roundNames: ["WILD CARD", "DIVISIONAL", "CONFERENCE", "THE DINO BOWL"] };
    g.state = "hub";
  });
  for (let r = 0; r < 4; r++) scene("hub(playoff-r" + r + ")", () => { g.szn.playoffs.round = r; });

  // ---------- team select
  // Every one of the 32 teams, on both sides of the card. drawSelect is the
  // only screen that renders a team's depth chart AND its rampager showcase,
  // and both are built from that team's real roster names -- 5 pairs only ever
  // showed 10 teams' worth, so the long names were a coin flip.
  for (let i = 0; i < 32; i++)
    scene("select(" + i + "v" + ((i + 16) % 32) + ")", () => {
      g.szn = null; g.state = "select"; g.selStep = 0; g.selA = i; g.selB = (i + 16) % 32;
    });
  scene("select(step1)", () => { g.selStep = 1; });

  // ---------- career flow
  scene("career_create", () => {
    g.mode = "career";
    g.cflow = {
      step: "create", row: 0, first: 0, last: 0, posIdx: 0, accIdx: 0,
      quiz: { i: 0, t: 12, score: 0 },
      drill: { idx: 0, t: 0, presses: 0, balls: [], caught: 0, strTries: 0, strSum: 0, barT: 0 },
      ratings: null
    };
    g.state = "career_create";
  });
  for (let r = 0; r < 4; r++)
    scene("career_create(row" + r + ")", () => { g.cflow.row = r; g.cflow.first = r * 3; g.cflow.last = r * 5; g.cflow.posIdx = r; g.cflow.accIdx = r; });
  for (let i = 0; i < 14; i++)
    scene("career_quiz(q" + i + ")", () => { g.state = "career_quiz"; g.cflow.quiz = { i: i, t: 9, score: i }; });
  for (let d = 0; d < 5; d++)
    scene("career_drill(d" + d + ")", () => {
      g.state = "career_drill";
      g.cflow.drill = { idx: d, t: 1, presses: 3, balls: [], caught: 2, strTries: 2, strSum: 90, barT: 0.4 };
    });
  scene("career_draft", () => {
    g.cflow.ratings = { spd: 82, hands: 77, tkl: 71, acc: 68 };
    g.career = {
      name: "Thunderfoot Bonecrusher", pos: "WR", team: "GB", level: 3, xp: 210,
      ratings: { spd: 82, hands: 77, tkl: 71, acc: 68 }, iq: 4, ovr: 79, species: "trex", acc: "NONE",
      gamesPlayed: 12, seasonLine: { att: 0, cmp: 0, passYds: 0, car: 8, rushYds: 44, rec: 9, recYds: 132, tkl: 1 }
    };
    g.state = "career_draft";
  });
  D.newSeason("GB");
  scene("hub(career)", () => { g.state = "hub"; });
  scene("hub(career,done)", () => { g.szn.phase = "done"; g.szn.champion = "GB"; });

  // ---------- a live game
  g.career = null; g.szn = null; g.mode = "exhibition";
  g.state = "allmodes"; g.menuIdx = 0; key("Enter"); key("Enter"); key("Enter");
  shot("intro");
  for (const ab of ["WAS","NE","TB","JAX","PHI","SF","GB","LAC","CIN"]) {
    scene("intro(" + ab + " at rest)", () => {
      g.state = "intro"; g.my = ab; g.opp = "NE";
      g.intro = { t: 3.0 };   // slide fully settled: the name sits at W/2
    });
  }
  g.state = "pregame";
  key("Enter"); shot("pregame");
  g.openingDrive = "A"; g.drive = "A"; key("Enter");
  for (let i = 0; i < 40 && ["playcall", "defcall", "presnap", "live"].indexOf(g.state) < 0; i++) stepFor(0.25);

  const fresh = (side, extra) => {
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
    g.drive = side; g.losYd = 35; g.down = 1; g.toGain = 10; g.patMode = false;
    Object.assign(g, extra || {});
    D.enterPlaycall(); stepFor(0.3);
  };
  for (let n = 0; n < 25; n++) scene("playcall#" + n, () => fresh("A"));
  for (let n = 0; n < 25; n++) scene("defcall#" + n, () => fresh("B"));
  // EVERY signature play on a card. These only rotate in ~35% of the time for
  // one particular team, so a random sweep never sees the long ones.
  const ABBRS14 = ["ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB","HOU","IND",
    "JAX","KC","LA","LAC","LV","MIA","MIN","NE","NO","NYG","NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"];
  for (const ab of ABBRS14) {
    scene("playcall(sig " + ab + ")", () => {
      fresh("A");
      if (g.callsheet && g.callsheet.length) g.callsheet[3] = D.signaturePlay(ab);
    });
  }
  scene("playcall(4th19)", () => fresh("A", { down: 4, toGain: 19, losYd: 8 }));
  scene("playcall(goalline)", () => fresh("A", { losYd: 98, down: 3, toGain: 2 }));

  scene("presnap", () => { fresh("A"); if (g.state === "playcall") D.choosePlay(g.callsheet[0], false); stepFor(0.2); });
  scene("live", () => { if (g.state === "presnap") { key(" "); stepFor(0.8); } });
  const ents = (g.players || []).slice(0, 8);
  for (let i = 0; i < ents.length; i++)
    scene("live+selcard" + i, () => { g.selCard = { e: ents[i], t: 1.5 }; });
  // The info card floats 74px ABOVE the tapped player and the jersey tag sits
  // 17px BELOW its own, so whether the two land on each other is a matter of
  // where two dinosaurs happen to be standing -- which is exactly why
  // reverting this fix stopped turning the lock red once the tree moved. Aim
  // it. The card's three lines sit at (e.y - 74) + 14 / +27 / +39, so walking
  // the offset across 46..85 drags all three of them through the tag's
  // baseline. A RANGE rather than the three exact values, because the tagged
  // player moves a few px between the scene setup and the captured frame, and
  // the collision check only treats baselines within 0.6em as shared.
  for (let dy = 46; dy <= 85; dy += 3) {
    for (const dx of [0, 70]) {
      scene("live+selcard(on the name tag dy=" + dy + " dx=" + dx + ")", () => {
        const tagged = g.carrier || (g.ball && g.ball.holder) || (g.players || [])[0];
        if (!tagged) return;
        g.selCard = { e: Object.assign({}, tagged, { x: tagged.x + dx, y: tagged.y + dy }), t: 1.5 };
      });
    }
  }
  g.selCard = null;
  scene("live+ticker", () => { g.ticker = { text: "DINO NEWS - Green Bay Packers 21, Chicago Bears 14 - 3rd and 8 from the CHI 41", t: 2 }; });
  // EVERY commentary line, with the longest real last name substituted in.
  // announce() builds these at runtime from a template plus a player name, so
  // the game's longest ticker string is not a literal anywhere in the source
  // and cannot be found by reading it.
  if (D.callLines) {
    const LONGEST = "CRENSHAW-DICKSON";   // 16, the longest lastName in players.json
    const lines = D.callLines();
    for (let i = 0; i < lines.length; i++)
      scene("ticker#" + i, () => { g.ticker = { text: "\ud83c\udf99 " + lines[i].replace("{P}", LONGEST), t: 2 }; });
  }
  g.ticker = null;
  scene("help", () => { g.help = true; });
  g.help = false;
  scene("boxscore", () => { g.showBox = true; });
  g.showBox = false;
  for (const kind of ["FG", "XP", "PUNT", "KO"])
    scene("kick(" + kind + ")", () => { g.drive = "A"; g.losYd = kind === "FG" ? 72 : 35; D.enterKick(kind); stepFor(0.2); });
  scene("ptchoice", () => { g.state = "ptchoice"; });
  scene("over", () => { g.state = "over"; });
  scene("over+box", () => { g.showBox = true; });
  g.showBox = false;
  scene("dead", () => { g.state = "dead"; g.deadT = 1.5; });

  for (const kind of ["meteor", "fg", "dash", "snack"]) {
    scene("halftime(" + kind + ")", () => {
      g.half = {
        kind: kind, t: 20, cont: function () { }, score: 3, hits: 2, px: 400, py: 275, stun: 0,
        drops: [], spawnT: 0.5, camX: 0,
        kickNo: 2, kicks: 5, stage: 1, kt: 0.2, val: 40, power: 62, fgd: 38, wind: 12, fly: null,
        hurdles: [{ x: 420, hit: false }, { x: 700, hit: true }], runV: 150, jumpZ: 0, jumpV: 0,
        stumbles: 1, combo: 4
      };
      g.state = "halftime";
    });
  }
  g.half = null;

  const banners = [
    ["TOUCHDOWN!", "Thunderfoot Bonecrusher for 62 yards"],
    ["INTERCEPTION!", "Windshear Skyhunter picks off the Chicago Bears"],
    ["FUMBLE - RECOVERED BY THE DEFENSE", "Slabtail Longstrider strips it at the Green Bay Packers 3"],
    ["4TH DOWN CONVERSION", "the herd goes for it and gets it, Green Bay Packers ball"],
    ["YEAR 3 BEGINS!", "Your legends return, a little older, a little wiser."],
    ["DINO BOWL CHAMPIONS!", "The Green Bay Packers rule the Cretaceous."],
    ["SACK!", "Ironhide Nightstalker drags down Thunderfoot Bonecrusher for -9"],
    // worst realistic case: two of the longest real player names in one line
    ["FUMBLE - RECOVERED BY THE DEFENSE",
      "Brandon Crenshaw-Dickson strips Dadrion Taylor-Demerson at the Washington Commanders 3"],
    ["INTERCEPTED IN THE END ZONE BY THE COMMANDERS", "Da'Metrius Weatherspoon, 104 yards the other way"]
  ];
  const megas = [
    ["TOUCHDOWN, BRANDON CRENSHAW-DICKSON!", "62 yards, and the Washington Commanders lead"],
    ["DINO BOWL CHAMPIONS!", "Brandon Crenshaw-Dickson is your Most Valuable Dinosaur"]
  ];
  for (let i = 0; i < megas.length; i++)
    scene("banner-mega#" + i, () => {
      g.state = "presnap";
      g.banner = { text: megas[i][0], sub: megas[i][1], t: 1.5, t0: 1.5, tier: "mega" };
    });
  for (let i = 0; i < banners.length; i++)
    scene("banner#" + i, () => { g.state = "presnap"; g.banner = { text: banners[i][0], sub: banners[i][1], t: 1.5, t0: 1.5 }; });
  g.banner = null;

  const notes = [
    "Could not sign in for matchmaking: network request failed",
    "Online play needs the Firebase config, running local only",
    "Your opponent left the game. Returning to the menu.",
    // notify() quotes network errors verbatim, so the length is not knowable
    // from the source. This is a real Firebase auth message.
    "Could not sign in for matchmaking: FirebaseError: Firebase: Error (auth/network-request-failed). Check your connection and try again later.",
    "x".repeat(300)
  ];
  for (let i = 0; i < notes.length; i++)
    scene("notify#" + i, () => { g.note = { text: notes[i], t: 3, t0: 3 }; g.state = "allmodes"; });
  g.note = null;

  scene("practice(off)", () => { g.practice = true; g.practiceSide = "A"; g.state = "presnap"; });
  scene("practice(def)", () => { g.practiceSide = "B"; });
  g.practice = false;

  scene("replay", () => {
    if (g.tape && g.tape.length >= 50) { g.replay = { frames: g.tape.slice(-126), i: 3, cont: function () { } }; g.state = "replay"; }
    else console.log("  (no tape captured)");
  });
  scene("replay(rec)", () => { g.gifRec = true; });
  g.gifRec = false; g.replay = null;

  // ---------- report
  const seen = new Set();
  const uniq = findings.filter(f => {
    const k = f.kind + "|" + f.text + "|" + (f.other || "") + "|" + f.fontPx + "|" + f.boxPx + "|" + f.overflowPx;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  uniq.sort((a, b) => b.overflowPx - a.overflowPx);
  // A COLLIDE gates as well now. It is the only check that catches a layout
  // with no box to overflow (the season-stats columns, a world label under a
  // floating card), and two strings printed on one baseline are every bit as
  // unreadable as one hanging out of its card.
  const gating = uniq.filter(f => f.kind === "BOUNDS" || f.kind === "VBOUNDS" ||
    f.kind === "COLLIDE" || (f.kind === "BOX" && f.confidence === "HIGH"));
  // Once nothing can leave its box, the only cost left is WORDS: fitText
  // shrinks and then ellipsizes. The game records every string it actually had
  // to cut, so that cost is a list rather than a surprise in a screenshot.
  const cuts = (D.textCuts ? D.textCuts() : []);
  return { uniq, gating, scenes, findings, cuts };
}

function report(res) {
  console.log("\n================ " + res.uniq.length + " unique hits ================");
  for (const f of res.uniq) {
    console.log("[" + f.kind + "] +" + f.overflowPx + "px  font=" + f.fontPx + "px measured=" +
      f.measuredPx + " box=" + f.boxPx + (f.confidence ? " " + f.confidence : "") + "  @" + f.where);
    console.log("    " + JSON.stringify(f.text));
    if (f.other) console.log("    vs " + JSON.stringify(f.other));
    console.log("    " + f.at);
  }
  const bad = res.scenes.filter(s => !s.ok);
  for (const b of bad) console.log("!! SCENE DID NOT RENDER: " + b.label + " -- " + b.why);
  if (res.cuts && res.cuts.length) {
    console.log("");
    console.log(res.cuts.length + " string(s) had to be CUT to fit (copy loss, not overflow):");
    for (const c of res.cuts) console.log("  \u2702 " + JSON.stringify(c));
  }
  console.log("");
  console.log(res.scenes.length + " scenes driven, " + bad.length + " failed to render");
  console.log(res.gating.length + " gating hit(s) (BOUNDS, VBOUNDS, COLLIDE, or BOX at HIGH confidence)");
}

// analyze and span are exported so tests/test_textboxes.js can hand the
// checker a SYNTHETIC frame whose answer is known and prove it still bites. A
// sweep that reports zero because its checker was neutered is indistinguishable
// from a clean game, and that is the one failure this whole file cannot have.
module.exports = { drive, report, analyze, span, TM };

// As a script: drive everything, print the ranked report, exit non-zero on any
// gating hit so it can be a build gate. Required as a module -- which is what
// tests/test_textboxes.js does -- it just hands the numbers back.
if (require.main === module) {
  const JSON_ONLY = process.argv.indexOf("--json") >= 0;
  drive({ quiet: JSON_ONLY }).then((res) => {
    if (JSON_ONLY) {
      // one machine-readable line, so tests/test_textboxes.js can run this in
      // a child process per seed and assert on the numbers instead of scraping
      console.log("SWEEP_JSON " + JSON.stringify({
        seed: SEED, scenes: res.scenes.length,
        failed: res.scenes.filter(x => !x.ok).map(x => x.label + ": " + x.why),
        gating: res.gating, total: res.uniq.length, cuts: res.cuts,
      }));
    } else {
      report(res);
      console.log("seed=" + SEED + "  (DINO_SWEEP_SEED=N to change it)");
    }
    if (res.gating.length || res.scenes.some(x => !x.ok)) process.exitCode = 1;
  }, (e) => { console.error(e); process.exitCode = 2; });
}
