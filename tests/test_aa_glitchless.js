// AA GLITCHLESS PASS (2026-08-12) — regression locks for four defects found by
// dynamic probing rather than by reading code. Each block states the defect, the
// player-visible symptom, and the measurement that proved it.
//
//   A. Hostile/corrupt localStorage killed the BOOT outright (black canvas
//      forever, no in-game recovery). Included Safari private browsing, which
//      needed no corruption at all — the game was simply unplayable there.
//   B. The first-down ruling compared a float spot against an integer line while
//      the plate DREW the rounded spot: the ball sat exactly on the yellow line
//      and the HUD read "4th & 1". Measured on ~3.6% of plays.
//   C. The kick boot-and-flight beat was the only dead beat with NO skip, and
//      ran to 3.2s+ against a documented 1.7s intent. 15-17s of unskippable
//      ball-watching per game, ~8% of total game time.
//   G. TRENCH WARFARE (ROADMAP S10) - the run game gained ~0 yd/carry and five
//      separate repairs each measured no better than baseline, because a blocked
//      defender still walked to the ball and the blockers themselves filled the
//      only crease. These are RATCHETS, not a victory lap: they lock in what is
//      measured and they fail loudly in BOTH directions, because the owner's
//      standard is that a run game gaining 8 is as broken as one gaining 0.
//   D. Action packs shipped DEAD CELS — `shoved` had frames 2 and 3 pixel-identical
//      in all 11 species, and `tackled`'s first two cels were near-identical
//      uprights, so the whole upright->horizontal rotation snapped in one step.
"use strict";
const H = require("./harness.js");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { step, stepFor, key, G } = H;

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  [" + detail + "]" : "")); }
}
const GAME_DIR = path.join(__dirname, "..", "static", "game");
const SRC = fs.readFileSync(path.join(GAME_DIR, "game.js"), "utf8");
const SPRITES_SRC = fs.readFileSync(path.join(GAME_DIR, "sprites.js"), "utf8");

// ---------------------------------------------------------------------------
// A. BOOT RESILIENCE — run in a CHILD process so a fresh game.js is evaluated
//    against hostile storage. (This process already has one loaded.)
// ---------------------------------------------------------------------------
function bootWith(recordVal, throwOnAccess) {
  const helper = path.join(os.tmpdir(), "dinobowl_boot_probe_" + process.pid + ".js");
  const src = `
"use strict";
const fs=require("fs"),vm=require("vm"),path=require("path");
const GAME_DIR=${JSON.stringify(GAME_DIR + path.sep)};
const RECORD=${JSON.stringify(recordVal)}, THROWS=${throwOnAccess ? "true" : "false"};
function ctx(){return new Proxy({},{get(t,k){
  if(k==="measureText")return()=>({width:10});
  if(k==="getImageData")return(x,y,w,h)=>({data:new Uint8ClampedArray(Math.max(4,w*h*4))});
  if(k==="createLinearGradient")return()=>({addColorStop(){}});
  if(k==="canvas")return null;
  return()=>{};},set(){return true;}});}
function cv(){const l={};return{width:0,height:0,style:{},getContext:()=>ctx(),
  getBoundingClientRect:()=>({left:0,top:0,width:960,height:540}),
  addEventListener:(e,f)=>{(l[e]=l[e]||[]).push(f);},__listeners:l};}
const store=new Map(); if(RECORD!==null&&!THROWS)store.set("dinobowl_record",RECORD);
global.window={addEventListener(){},__rafQueue:[]};
global.document={getElementById:(i)=>(i==="game"?cv():{textContent:""}),
  createElement:(t)=>(t==="canvas"?cv():{click(){},style:{},set href(v){},get href(){return"";},addEventListener(){}}),
  addEventListener(){},hidden:false,body:{classList:{toggle(){}}},documentElement:{}};
global.localStorage=THROWS?{getItem(){throw new Error("SecurityError: storage is not available");},
  setItem(){throw new Error("SecurityError");},removeItem(){throw new Error("SecurityError");}}
  :{getItem:(k)=>(store.has(k)?store.get(k):null),setItem:(k,v)=>store.set(k,String(v)),removeItem:(k)=>store.delete(k)};
global.requestAnimationFrame=()=>{};
global.alert=()=>{}; global.history={replaceState(){}};
try{Object.defineProperty(global,"navigator",{value:{},configurable:true});}catch(e){global.navigator={};}
global.location={search:"",pathname:"/game/"};
global.fetch=async(u)=>String(u).includes("teams.json")
  ?{ok:true,json:async()=>JSON.parse(fs.readFileSync(GAME_DIR+"teams.json","utf8"))}:{ok:false,json:async()=>({})};
if(!global.performance)global.performance={now:()=>0};
vm.runInThisContext(fs.readFileSync(GAME_DIR+"sprites.js","utf8"),{filename:"sprites.js"});
global.DinoSprites=global.window.DinoSprites;
vm.runInThisContext(fs.readFileSync(GAME_DIR+"game.js","utf8"),{filename:"game.js"});
const g=global.window.__game;
process.stdout.write(JSON.stringify({booted:!!g,diff:g?g.diff:null,record:g?g.record:null}));
`;
  fs.writeFileSync(helper, src);
  try {
    const out = execFileSync(process.execPath, [helper], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(out);
  } catch (e) { return { booted: false, error: String(e.message || e).slice(0, 120) }; }
  finally { try { fs.unlinkSync(helper); } catch (_) { } }
}

const okRec = bootWith('{"w":3,"l":1,"t":0}', false);
check("A1 boots normally and reads a valid saved record",
  okRec.booted && okRec.record && okRec.record.w === 3, JSON.stringify(okRec).slice(0, 90));
const truncated = bootWith('{"w":3,"l":1,', false);
check("A2 a TRUNCATED save still boots (was: permanently black canvas)",
  truncated.booted && truncated.record && truncated.record.w === 0, JSON.stringify(truncated).slice(0, 90));
const literalUndef = bootWith("undefined", false);
check('A3 the literal string "undefined" in storage still boots',
  literalUndef.booted && literalUndef.record && literalUndef.record.w === 0, JSON.stringify(literalUndef).slice(0, 90));
const wrongShape = bootWith('{"w":null,"l":0,"t":0}', false);
check("A4 a parseable-but-wrong-shape save falls back instead of poisoning stats",
  wrongShape.booted && wrongShape.record && wrongShape.record.w === 0, JSON.stringify(wrongShape).slice(0, 90));
const noStorage = bootWith(null, true);
check("A5 boots when localStorage ACCESS THROWS (Safari private browsing)",
  noStorage.booted && noStorage.record && noStorage.record.w === 0, JSON.stringify(noStorage).slice(0, 90));
// and the guards must stay in place at the source level
check("A6 the G initializer never parses storage unguarded",
  !/diff:\s*parseInt\(localStorage/.test(SRC) && !/record:\s*JSON\.parse\(localStorage/.test(SRC) &&
  /diff:\s*lsInt\(/.test(SRC) && /record:\s*lsJSON\(/.test(SRC));
check("A7 every localStorage touch is guarded (helpers or an enclosing try)",
  (() => {
    // Guarded means: it IS one of the ls* helpers, or `try {` opens on the same
    // line, or on the nearest preceding non-blank line (loadCpuMemory/loadDyn
    // both open their try a line above the parse).
    const lines = SRC.split("\n");
    const bad = [];
    lines.forEach((ln, i) => {
      const t = ln.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;   // prose
      const code = ln.replace(/\/\/.*$/, "");
      if (!/localStorage\./.test(code)) return;
      if (/function ls(Get|Set|Del)\(/.test(code)) return;  // the helpers themselves
      if (/try\s*\{/.test(code)) return;
      let j = i - 1;
      while (j >= 0 && !lines[j].trim()) j--;
      if (j >= 0 && /try\s*\{\s*$/.test(lines[j].replace(/\/\/.*$/, ""))) return;
      bad.push(i + 1);
    });
    check.__bad = bad.join(",");
    return bad.length === 0;
  })(), "unguarded at line(s) " + (check.__bad || ""));

// ---------------------------------------------------------------------------
// B/C/D need the live engine.
// ---------------------------------------------------------------------------
(async () => {
  await new Promise((r) => setTimeout(r, 220));
  const g = G(), dbg = g.debug;
  key("Enter"); key("Enter"); key("Enter"); key("Enter");
  if (g.state === "intro") key("Enter");
  g.openingDrive = "A"; g.drive = "A";
  key("Enter");
  stepFor(2.6);

  // ---- B. FIRST-DOWN LINE INTEGRITY -------------------------------------
  check("B1 the ruling and the plate share ONE rounded spot and ONE fd line",
    /const fdLine = G\.losYd \+ G\.toGain;/.test(SRC) &&
    /const spotInt = noSpot \? G\.losYd : Math\.round\(clamp\(spotYd, 1, 99\)\);/.test(SRC) &&
    /if \(spotInt >= fdLine && !noSpot\)/.test(SRC));
  check("B2 to-gain is the distance to the SAME line, never re-derived from `gained`",
    /G\.toGain = Math\.max\(1, fdLine - G\.losYd\);/.test(SRC) &&
    !/Math\.round\(G\.losYd \+ G\.toGain - spotYd\) === 0/.test(SRC));

  // play a real game and assert the chains never move inside a series
  function pilot() {
    const S = g.state;
    if (S === "playcall" || S === "defcall" || S === "ptchoice") { key("1"); return; }
    if (S === "presnap") { key(" "); return; }
    if (S === "over" || S === "halftime") { key("Enter"); return; }
    if (S !== "live") { key("Enter"); return; }
    if (g.drive === "A" && g.phase === "drop" && g.ball.holder && g.playT > 0.85) {
      const board = dbg.cpuReadBoard(g.ball.holder);
      if (board && board.length) {
        const pick = board.find((r) => r.window && r.window.risk <= 0.45);
        if (pick) { g.aim = pick.lead; H.mouse("mousedown", 480, 270, 2); H.mouse("mouseup", 480, 270, 2); }
        else if (g.playT > 2.8) key("x");
      }
    }
  }
  g.quarter = 1; g.clock = 150; g.score.A = 0; g.score.B = 0; g.ot = false;
  g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null; g.replay = null; g.celebrate = null;
  g.gameStats = {}; g.drive = "A"; g.losYd = 25; g.down = 1; g.toGain = 10;
  g.patMode = false; g.practice = false;
  g.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP" };
  dbg.enterPlaycall();
  let series = null, drifts = 0, sampled = 0, lastSig = "";
  let guard = 0;
  while (g.state !== "over" && guard < 120000) {
    pilot(); step(16.7); guard++;
    if (g.state !== "presnap" || g.patMode) continue;
    const sig = g.drive + "|" + g.down + "|" + g.losYd + "|" + g.toGain;
    if (sig === lastSig) continue;
    lastSig = sig; sampled++;
    const fd = g.losYd + g.toGain;
    if (g.down === 1 || !series || series.drive !== g.drive) series = { drive: g.drive, fd };
    else if (series.fd < 100 && Math.abs(fd - series.fd) > 0.6) { drifts++; series.fd = fd; }
  }
  check("B3 the first-down line never moves mid-series over a full game",
    sampled > 40 && drifts === 0, sampled + " plays sampled, " + drifts + " drifts");

  // ---- C. KICK FLIGHT: capped AND skippable ------------------------------
  check("C1 the flight duration is clamped to the 1.7s design intent",
    /T: clamp\(0\.8 \+ d \/ 640, 0\.8, 1\.7\)/.test(SRC));
  check("C2 a kickfly skip is wired to both key and tap, and gated by a lockout",
    /function flySkip\(\)/.test(SRC) && /const FLY_READ_LOCK = 0\.35;/.test(SRC) &&
    /G\.state === "kickfly" && \(k === " " \|\| k === "enter"\)/.test(SRC) &&
    /if \(S === "kickfly"\) \{ flySkip\(\); return; \}/.test(SRC));

  // C3 NOTE: the runtime behaviour of the cap + skip was measured with the
  // pacing probe over full games rather than asserted here — driving the engine
  // into "kickfly" from this harness proved timing-dependent and a flaky gate is
  // worse than none (LESSON #8). Numbers at the time of the fix:
  //   per-segment flight  2.1-3.6s  ->  1.7s flat (the documented intent)
  //   impatient player    15.4s/gm  ->  3.3s/gm  (skip finally works)
  //   longest dead beat   kickfly 3.9s -> kick meter 0.5s (player-driven)
  // C1/C2 above pin the cap and the skip wiring at the source level, which is
  // what would actually regress.
  g.state = "dead"; g.deadT = 0; g.deadNext = null; g.drive = "B"; g.clock = 400;
  dbg.startKickoff("A");
  stepFor(2.4);
  check("C6 a kickoff still resolves possession correctly (own 25, no live return)",
    g.drive === "A" && g.losYd === 25 && !g.returnPlay,
    g.drive + "/" + g.losYd + "/" + !!g.returnPlay);

  // ---- D. NO DEAD CELS in the contact action packs -----------------------
  // Rasterize the REAL packs with a tiny recording canvas (the shared harness
  // ctx is a no-op stub, so pixels have to be captured here) and assert that
  // consecutive cels actually differ.
  const cels = (() => {
    function parse(s) {
      const m = /^#([0-9a-f]{6})$/i.exec(String(s).trim());
      if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; }
      return [255, 0, 255, 255];
    }
    class C {
      constructor(w, h) { this.width = w; this.height = h; this.px = new Uint8ClampedArray(Math.max(4, w * h * 4)); this._c = new X(this); }
      getContext() { return this._c; }
      get dataset() { return (this._d = this._d || {}); }
    }
    class X {
      constructor(c) { this.cv = c; this.fillStyle = "#000"; this.tx = 0; this.ty = 0; this.sx = 1; this.sy = 1; }
      translate(x, y) { this.tx += x * this.sx; this.ty += y * this.sy; }
      scale(x, y) { this.sx *= x; this.sy *= y; }
      save() { } restore() { } clearRect() { }
      fillRect(x, y, w, h) {
        const col = parse(this.fillStyle);
        let x0 = this.tx + x * this.sx, x1 = this.tx + (x + w) * this.sx;
        let y0 = this.ty + y * this.sy, y1 = this.ty + (y + h) * this.sy;
        if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
        if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
        for (let py = Math.round(y0); py < Math.round(y1); py++) {
          if (py < 0 || py >= this.cv.height) continue;
          for (let px = Math.round(x0); px < Math.round(x1); px++) {
            if (px < 0 || px >= this.cv.width) continue;
            const i = (py * this.cv.width + px) * 4;
            this.cv.px[i] = col[0]; this.cv.px[i + 1] = col[1]; this.cv.px[i + 2] = col[2]; this.cv.px[i + 3] = 255;
          }
        }
      }
      drawImage(src, dx, dy) {
        if (!src || !src.px) return;
        for (let sy = 0; sy < src.height; sy++) for (let sx = 0; sx < src.width; sx++) {
          const si = (sy * src.width + sx) * 4;
          if (src.px[si + 3] === 0) continue;
          let wx = this.tx + (dx + sx) * this.sx, wy = this.ty + (dy + sy) * this.sy;
          if (this.sx < 0) wx -= 1;
          if (this.sy < 0) wy -= 1;
          const px = Math.round(wx), py = Math.round(wy);
          if (px < 0 || px >= this.cv.width || py < 0 || py >= this.cv.height) continue;
          const di = (py * this.cv.width + px) * 4;
          this.cv.px[di] = src.px[si]; this.cv.px[di + 1] = src.px[si + 1];
          this.cv.px[di + 2] = src.px[si + 2]; this.cv.px[di + 3] = 255;
        }
      }
    }
    const sandbox = {
      window: {},
      document: {
        createElement: (t) => {
          if (t !== "canvas") return {};
          const c = new C(1, 1);
          return new Proxy(c, {
            set(o, k, v) { o[k] = v; if ((k === "width" || k === "height") && o.width > 0 && o.height > 0) o.px = new Uint8ClampedArray(o.width * o.height * 4); return true; },
            get(o, k) { const v = o[k]; return typeof v === "function" ? v.bind(o) : v; },
          });
        },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext(SPRITES_SRC, sandbox, { filename: "sprites.js" });
    return sandbox.window.DinoSprites;
  })();

  const SPECIES = ["troodon", "carno", "pachy", "veloci", "deino", "trike", "stego", "allo", "spino", "deinony", "quetz"];
  const sheets = cels.buildTeamSprites("#c8102e", "#ffffff", 2);
  function alphaKey(fr) {
    let s = "";
    for (let i = 3; i < fr.px.length; i += 4) s += fr.px[i] > 0 ? "1" : "0";
    return s;
  }
  function deadPairs(action) {
    const out = [];
    for (const k of SPECIES) {
      const pack = sheets[k] && sheets[k].actions && sheets[k].actions[action];
      if (!pack || pack.R.length < 2) continue;
      const keys = pack.R.map(alphaKey);
      for (let i = 1; i < keys.length; i++) if (keys[i] === keys[i - 1]) out.push(k + " " + (i - 1) + "->" + i);
    }
    return out;
  }
  const shovedDead = deadPairs("shoved");
  check("D1 `shoved` has no pixel-identical consecutive cels (was 11 — one per species)",
    shovedDead.length === 0, shovedDead.slice(0, 6).join(", "));
  const tackledDead = deadPairs("tackled");
  check("D2 `tackled` has no pixel-identical consecutive cels",
    tackledDead.length === 0, tackledDead.slice(0, 6).join(", "));
  const tackleDead = deadPairs("tackle");
  check("D3 `tackle` (the tackler) has no pixel-identical consecutive cels",
    tackleDead.length === 0, tackleDead.slice(0, 6).join(", "));

  // the tackled arc must be four DISTINCT reads: fold -> deeper fold -> lay -> settle
  check("D4 the tackled collapse samples a real fold arc, not phase 0 (which stood up)",
    /const layFrom = kind === "prone" \? 0 : Math\.max\(1, count - 2\);/.test(SPRITES_SRC) &&
    /const foldP = layFrom <= 1 \? 1 : 0\.40 \+ 0\.60 \* \(fi \/ \(layFrom - 1\)\);/.test(SPRITES_SRC) &&
    !/if \(kind === "prone" \|\| phase >= 0\.5\)/.test(SPRITES_SRC));
  check("D5 `shoved` reels through four distinct leans, not -2/-3/-2/-2",
    /fi === 0 \? -2 : fi === 1 \? -4 : fi === 2 \? -3 : -1/.test(SPRITES_SRC));
  // the owner-tuned collapse curve itself must NOT have moved (LESSON #23)
  check("D6 LESSON #23 fold pitch + head-lead curve untouched",
    /actionPitchForward\(cells, rig, 0\.10 \+ 0\.08 \* p, p >= 1 \? 1 : 0\)/.test(SPRITES_SRC) &&
    /actionLeadWithHead\(cells, rig, Math\.round\(1 \+ 2 \* p\)\)/.test(SPRITES_SRC));
  // and every land species still owns a 4-cel pack (no silent shrink, LESSON #10)
  const packSizes = SPECIES.map((k) => (sheets[k] && sheets[k].actions.tackled ? sheets[k].actions.tackled.R.length : 0));
  check("D7 all 11 land species still carry 4 tackled cels",
    packSizes.every((n) => n === 4), packSizes.join(","));

  // -------------------------------------------------------------------- I
  // THE TACKLED BODY KEEPS ITS BODY. Owner report: tackled characters were
  // "condensed into pancakes ... their body and/or head doesn't cease to
  // exist". Cause: actionLayFlat's settle multiplied each row offset by 0.55
  // and wrote through an `out[ny][nx] === "."` guard, so several source rows
  // collided on one destination row, the first writer won, and the rest were
  // discarded. The scan paints turf-side first, so what was thrown away was
  // always the pixels FURTHEST from the ground — on a body rotated onto its
  // side that is the dorsal ridge and the top of the skull.
  // Measured before the fix: the settled cel kept 64.5% of the standing body
  // (min 60.4%), and the helmet went 14 -> 7 px on trike, 3 -> 1 on stego,
  // 11 -> 6 on allo and spino, 11 -> 7 on five others. Every land species.
  // The fix settles by SPILLING (a taken row pushes the pixel to the nearest
  // free row away from the turf), so mass is preserved BY CONSTRUCTION.
  // These are pixel assertions, not source greps: they would catch any future
  // change that starts dropping body pixels again by any mechanism.
  function bodyMass(fr) {
    let n = 0;
    for (let i = 3; i < fr.px.length; i += 4) if (fr.px[i] > 0) n++;
    return n;
  }
  function headMass(fr) {   // the helmet is the near-white block
    let n = 0;
    for (let i = 0; i < fr.px.length; i += 4) {
      if (fr.px[i + 3] > 0 && fr.px[i] > 200 && fr.px[i + 1] > 200 && fr.px[i + 2] > 200) n++;
    }
    return n;
  }
  const massLoss = [], headLoss = [];
  for (const k of SPECIES) {
    const sh = sheets[k];
    if (!sh || !sh.actions) continue;
    const standMass = bodyMass(sh.R[0]), standHead = headMass(sh.R[0]);
    // the cels actionLayFlat SETTLES: every prone cel, and the last tackled one
    const settled = [];
    if (sh.actions.prone) settled.push(...sh.actions.prone.R.map((f, i) => ["prone#" + i, f]));
    if (sh.actions.tackled) { const R = sh.actions.tackled.R; settled.push(["tackled#" + (R.length - 1), R[R.length - 1]]); }
    for (const [label, fr] of settled) {
      if (bodyMass(fr) < standMass) massLoss.push(k + " " + label + " " + bodyMass(fr) + "/" + standMass);
      if (headMass(fr) < standHead) headLoss.push(k + " " + label + " " + headMass(fr) + "/" + standHead);
    }
  }
  check("I1 a settled/laid-out cel never loses body pixels (was 64.5% of the standing body)",
    massLoss.length === 0, massLoss.slice(0, 6).join(", "));
  check("I2 the HEAD survives being laid out (was 14->7 on trike, 3->1 on stego)",
    headLoss.length === 0, headLoss.slice(0, 6).join(", "));
  check("I3 the settle spills instead of dropping on collision",
    SPRITES_SRC.includes("while (ny > 0 && out[ny][nx] !== \".\") ny--;") &&
    !SPRITES_SRC.includes("&& out[ny][nx] === \".\") out[ny][nx] = ch;"));

  // A TACKLE KEEPS THE DIRECTION IT HAPPENED IN. beginTackleImpact computes a
  // real 2D hit vector from the tackler's momentum and then used to collapse
  // it to sign(nx), discarding ny entirely; worse, a near-vertical hit fell
  // back to carrier.dir — the carrier's STALE pre-contact facing, which has no
  // relationship to the tackle. Hit a man square from downfield and he flopped
  // along his old heading. fallDir is now only the mirror and comes from the
  // hit (or the body geometry) and never from a stale facing; layQ is the
  // quarter-turn the body lies along, so a cross-field hit lays him out across
  // the field. Quarter turns only: imageSmoothingEnabled is false everywhere,
  // so a quarter turn is lossless on the pixel grid while an arbitrary angle
  // resamples a 16x16 sprite into uneven pixels and reads as damage.
  // Probed over 12 hit angles x both stale facings: 12 layouts along the
  // sideline, 12 across the field, 0 inheriting the stale facing.
  check("I4 the fall direction is never taken from the carrier's stale facing",
    !SRC.includes("(carrier.dir || tackler.dir || 1);") &&
    SRC.includes("fallDir = Math.abs(gx) > 0.001 ? (gx >= 0 ? 1 : -1) : (tackler.dir || carrier.dir || 1);"));
  check("I5 the layout carries the hit's CROSS-FIELD component, quantized to quarter turns",
    SRC.includes("const layQ = Math.abs(ny) > Math.abs(nx) * 1.6 ? (ny >= 0 ? 1 : -1) : 0;") &&
    SRC.includes("tackler.layQ = layQ; carrier.layQ = layQ;"));
  check("I6 a laid-out body is actually DRAWN along that quarter turn",
    SRC.includes('} else if (e.layQ && (pose === "tackled" || pose === "prone")) {') &&
    SRC.includes("cx.rotate(e.layQ * Math.PI / 2);"));
  // LESSON #20: the latch resets where the play resets, or the next tackle
  // inherits the previous one's layout.
  check("I7 layQ is cleared where the tackle impact clears",
    SRC.includes('e.tackleImpactRole = ""; e.tackleFallDir = 0; e.layQ = 0;'));

  // ---------------------------------------------------------------------------
  // E. THE ANIMATION BATCH (ROADMAP A3, shipped 2026-08-12)
  //   E1-E3  a tackled/sacked carrier RISES instead of holding a 90-rotated walk
  //          cel (measured 180/180 frames in that fallback before the fix)
  //   E4     grounded pose-chain links keep proneT so replays stay truthful
  //   E5     a dive that misses does not stack a second rotation on a flat cel
  //   E6     the catch cue cannot overwrite a contact/grounded cel (LESSON #2)
  //   E7     accessories baseline against the STANDING pack, not a grounded one
  //   E8     no frame index is clamped to `% 2` while 4-cel walks exist
  // ---------------------------------------------------------------------------
  check("E1 a tackled carrier is handed a prone->getup rise chain (LESSON #3)",
    /G\.carrier\.poseChain = \[\{ pose: "prone", dur: 0\.34 \}, \{ pose: "getup", dur: 0\.34 \}\];/.test(SRC));
  check("E4 grounded chain links KEEP proneT so the replay tape stays truthful",
    /if \(link\.pose === "prone" \|\| link\.pose === "tackled" \|\| link\.pose === "layflat"\) \{/.test(SRC) &&
    /e\.proneT = Math\.max\(e\.proneT \|\| 0, link\.dur\);/.test(SRC));
  check("E5 a spent dive cel is swapped for the authored grounded cel, guarded on pose",
    /if \(e\.pose === "dive"\) \{ e\.pose = ""; e\.poseT = 0; playPose\(e, "prone", e\.proneT\); \}/.test(SRC));
  check("E6 the catch cue skips a downed or mid-contact dino",
    /const cueOk = \(e\) =>/.test(SRC) && /cueOk\(recCue\.e\)/.test(SRC) && /cueOk\(defCue\.e\)/.test(SRC));
  check("E7 frameBobDy baselines against a supplied standing pack",
    /function frameBobDy\(pack, dirKey, fi, basePack\)/.test(SRC) &&
    /const t0 = maskTopRow\(base, dirKey, 0\)/.test(SRC) &&
    /frameBobDy\(artPack, e\.dir >= 0 \? "R" : "L", spriteFrame\.fi, spr\)/.test(SRC));
  check("E8 no walk-cel index is hard-clamped to `% 2`",
    !/\(\(performance\.now\(\) \/ 1[034]0\) \| 0\) % 2/.test(SRC), "a % 2 cel clamp survives");

  // Functional: a routine 1st-and-20 tackle, FORCED so the gate is deterministic.
  // An earlier version just ran a run play and hoped it ended in a tackle; it
  // failed roughly 1 run in 5 because the play could end out of bounds or as an
  // incompletion, and a flaky gate is worse than no gate (LESSON #8). This now
  // mirrors test_all #7: strip the carrier's escape resources, put a committed
  // diving tackler on him, and pin the RNG so the takedown lands.
  g.state = "dead"; g.deadT = 0; g.deadNext = null;
  g.drive = "A"; g.losYd = 30; g.down = 1; g.toGain = 20; g.patMode = false; g.practice = false;
  g.clock = 300; g.quarter = 1; g.score.A = 0; g.score.B = 0;
  g.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP" };
  dbg.enterPlaycall(); stepFor(0.2);
  dbg.choosePlay((g.callsheet || []).find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.1); key(" ");
  stepFor(0.5);
  const rbE = g.players.find((e) => e.team === "off" && e.role === "RB");
  if (g.state === "live" && rbE && !g.carrier) {
    g.carrier = rbE; g.ball = { mode: "held", holder: rbE, x: rbE.x, y: rbE.y, z: 12 };
    g.phase = "carry"; rbE.state = "carry";
  }
  const seen = g.carrier;
  let rotatedFallback = 0, sawGetup = 0, sawTackled = 0, reachedDead = false;
  if (seen) {
    // no escapes, and a committed diver so the takedown cannot be declined
    seen.shedCharges = 0; seen.yacCharge = 0; seen.truckCharges = 0;
    seen.jukeT = 0; seen.jukeCd = 99; seen.stiffT = 0; seen.catchT = null;
    const tk = g.players.find((e) => e.team === "def");
    tk.x = seen.x; tk.y = seen.y; tk.str = 92; tk.diveT = 0.3;
    tk.staggerT = 0; tk.tackleCd = 0; tk.proneT = 0; tk.vx = 380; tk.vy = 0;
    const savedRnd = Math.random;
    Math.random = () => 0.9;          // tackle lands, strip roll fails (no fumble)
    for (let i = 0; i < 90 && g.state === "live"; i++) step(16.7);
    Math.random = savedRnd;
    reachedDead = g.state !== "live";
    for (let i = 0; i < 180; i++) {
      step(16.7);
      // the defect signature: nothing authored playing, yet still flagged down,
      // so the renderer turns the STANDING cel on its side
      if (!(seen.pose || "") && (seen.proneT || 0) > 0) rotatedFallback++;
      if (seen.pose === "getup") sawGetup++;
      if (seen.pose === "tackled" || seen.pose === "prone") sawTackled++;
    }
  }
  check("E2 the forced tackle resolved and never showed the 90-rotated walk fallback",
    !!seen && reachedDead && rotatedFallback === 0,
    seen ? "dead=" + reachedDead + " fallbackFrames=" + rotatedFallback : "no carrier");
  check("E3 ...the grounded cels play, and the carrier stands back up through getup",
    !!seen && sawTackled > 0 && sawGetup > 0,
    seen ? "grounded=" + sawTackled + " getup=" + sawGetup : "no carrier");

  // ---------------------------------------------------------------------------
  // F. BATCH D — RULES CORRECTNESS (shipped 2026-08-13)
  // Save-corrupting bugs, so each gets an explicit assertion. A drawn game used
  // to be booked as YOUR loss and THEIR win -- the season records had no tie
  // column at all -- and in the playoffs a tie eliminated you. Overtime promised
  // "next score wins" while actually playing a full timed 5th quarter.
  // ---------------------------------------------------------------------------
  {
    dbg.newSeason("KC");
    g.szn.phase = "regular"; g.szn.week = 1;
    const oppT = g.szn.schedule[0].opp;
    const l0 = g.szn.records["KC"].l, w0 = g.szn.records[oppT].w;
    g.score.A = 21; g.score.B = 21;
    g.gameStats = {}; g.stats = { passYds: 0, rushYds: 0, tds: 0 };
    dbg.seasonAfterGame();
    check("F1 a drawn game is not charged as your loss", g.szn.records["KC"].l === l0);
    check("F2 a drawn game is not credited as their win", g.szn.records[oppT].w === w0);
    check("F3 both teams are credited a tie",
      (g.szn.records["KC"].t || 0) === 1 && (g.szn.records[oppT].t || 0) === 1,
      "you " + (g.szn.records["KC"].t || 0) + " them " + (g.szn.records[oppT].t || 0));

    dbg.newSeason("KC"); g.szn.phase = "regular"; g.szn.week = 1;
    const oppW = g.szn.schedule[0].opp;
    g.score.A = 28; g.score.B = 10;
    g.gameStats = {}; g.stats = { passYds: 0, rushYds: 0, tds: 0 };
    dbg.seasonAfterGame();
    check("F4 a win still records W/L normally",
      g.szn.records["KC"].w === 1 && g.szn.records[oppW].l === 1);

    g.szn = null; g.practice = false; g.patMode = false;
    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    g.ot = true; g.quarter = 5; g.clock = 90; g.score.A = 24; g.score.B = 21;
    dbg.enterPlaycall();
    check("F5 a lead in overtime ends the game (sudden death)", g.state === "over", "state=" + g.state);

    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    g.ot = true; g.quarter = 5; g.clock = 90; g.score.A = 21; g.score.B = 21;
    dbg.enterPlaycall();
    check("F6 a level overtime keeps playing", g.state !== "over", "state=" + g.state);

    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    g.ot = false; g.quarter = 3; g.clock = 90; g.score.A = 14; g.score.B = 7;
    dbg.enterPlaycall();
    check("F7 a lead in REGULATION does not end the game", g.state !== "over", "state=" + g.state);

    dbg.newSeason("KC"); g.szn.phase = "playoffs";
    g.ot = true; g.quarter = 5; g.clock = 0; g.score.A = 17; g.score.B = 17;
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.patMode = false; g.practice = false;
    dbg.enterPlaycall();
    check("F8 a level playoff overtime replays OT rather than ending",
      g.state !== "over" && g.quarter >= 6, "state=" + g.state + " q=" + g.quarter);

    dbg.newSeason("KC"); g.szn.phase = "regular"; g.szn.week = 1;
    g.ot = true; g.quarter = 5; g.clock = 0; g.score.A = 17; g.score.B = 17;
    g.state = "dead"; g.deadT = 0; g.deadNext = null;
    g.gameStats = {}; g.stats = { passYds: 0, rushYds: 0, tds: 0 };
    dbg.enterPlaycall();
    check("F9 a level regular-season overtime may end in a tie", g.state === "over", "state=" + g.state);
    g.szn = null; g.ot = false;
  }
  check("F10 the season records carry a tie column",
    SRC.includes("records[t] = { w: 0, l: 0, t: 0 }"));
  check("F11 seeding counts a tie as half a win",
    SRC.includes("(G.szn.records[b].t || 0) * 0.5"));
  check("F12 a drawn game takes its own branch, not the loss branch",
    SRC.includes("const tied = G.score.A === G.score.B;") &&
    SRC.includes("} else if (won) { G.szn.records[G.szn.team].w++;"));
  check("F13 sudden death is enforced where every scoring path funnels",
    SRC.includes('if (G.ot && G.score.A !== G.score.B && !G.patMode && !G.practice) { gameOver(); return; }'));
  check("F14 a playoff game cannot end level",
    SRC.includes('const mustDecide = !!(G.szn && G.szn.phase === "playoffs");'));
  check("F15 team yardage is split into the field that is true",
    SRC.includes("if (G.playPass && G.playPass.receiver) G.stats.passYds += gained;") &&
    SRC.includes("else G.stats.rushYds += gained;"));
  check("F16 non-franchise modes drop the season, not just the career",
    (SRC.split("G.career = null; G.szn = null").length - 1) +
    (SRC.split("G.szn = null; G.selectFor").length - 1) >= 5);


  // ---------------------------------------------------------------------------
  // G. TRENCH WARFARE REGRESSION GATES (ROADMAP S10)
  //
  // WHY THESE EXIST. The run game gained ~0.0 yd/carry (measured: median -0.06 on
  // tests/blocking_bench.js at seed 4242, 160 carries, reproduced on five seeds)
  // and ROADMAP records FIVE consecutive failed repairs, each judged on ~30
  // carries - a sample whose noise floor is 0.32 yd, i.e. as large as the effect
  // being argued about. Two mechanisms were genuinely broken; both are fixed and
  // both get a lock here:
  //   1. A blocked defender kept homing on the ball. The blocked-rusher push in
  //      case "rush" aims at `G.ball.holder || G.carrier`; on a pass that is a
  //      stationary QB (which is what it was written for), but on a run it is the
  //      ball carrier ~36px away, so a defender who had already lost his rep
  //      still tracked the runner LATERALLY and dragged his blocker along. That
  //      is ROADMAP's "in 29 of 30 forced runs the first defender to reach him is
  //      a DL who had ALREADY been blocked" finding. Measured 100% of first
  //      tacklers already blocked at baseline; 8-11% now.
  //   2. The blockers were the wall. An O-lineman runs 69 px/s against a
  //      linebacker's 88, and a linebacker PURSUING the carrier leads him, so he
  //      travels downfield at ~78 - a tail chase never closes. A lineman who
  //      "climbed" to the second level therefore never arrived (1.9% of 5,840
  //      climb frames in body contact, median closest approach 61.7px) and stood
  //      in the crease instead, on 1.16 of every carry frame. A hole the carrier
  //      would FIT through existed on 0% of carries at baseline; 76-78% now.
  //
  // A gate asserting the 4-5 yd/carry TARGET band would be red today, and one
  // asserting that ~1.3 is correct would be LESSON #18 (enshrining dead design).
  // So the bands below are deliberately WIDE: they catch a regression back into
  // the ~0.0 trench and they catch a runaway, and they say nothing at all about
  // whether the target band has been reached. It has not - see ROADMAP.
  //
  // HOW THE PLAYS ARE STAGED, and this part is load-bearing. An earlier draft of
  // this section picked its run off the LIVE callsheet with
  // `callsheet.findIndex((p) => p.type === "run")`. That is wrong twice over: the
  // sheet is mostly pass cards, so most trials were skipped outright, and the
  // "run" it did find was whatever trick or signature card happened to be
  // offered - SWEEP PASS (which leaks the receivers downfield at 0.9s and freezes
  // the fooled DBs on purpose) or MONO BOWL TOSS. Measured that way the gates
  // read 100% blocked-tacklers and 0% creases, i.e. the BASELINE numbers, purely
  // because it was never measuring an ordinary run. So this mirrors
  // tests/blocking_bench.js instead: synthetic HB DIVE / HB SWEEP calls fed
  // through dbg.choosePlay, with the defensive front pinned per trial. The
  // buildPlayers() re-call after setting G.defCall is the same path audible()
  // uses to repoint a formation at the line, not a poke at private state.
  // ---------------------------------------------------------------------------
  {
    const YPX = 24, FIELD_X0 = 10 * YPX;
    const ydAtX = (x) => (x - FIELD_X0) / YPX;
    const bodyRange = dbg.bodyContactRange;
    const RUN_CALLS = [
      { name: "HB DIVE", type: "run", tags: ["run", "short"], lane: 0 },
      { name: "HB SWEEP UP", type: "run", tags: ["run"], lane: -1 },
      { name: "HB SWEEP DOWN", type: "run", tags: ["run"], lane: 1 },
    ];
    const DEF_CALLS = [
      { name: "MAN 2 HIGH", rush: 4, man: true, tags: ["balanced"] },
      { name: "COVER 2 ZONE", rush: 4, man: false, tags: ["balanced"] },
      { name: "ZONE 3 DEEP", rush: 3, man: false, tags: ["deep"] },
      { name: "MAN BLITZ", rush: 5, man: true, tags: ["blitz", "short"] },
    ];
    // Pinned exactly like the bench, for the same reasons: weather scales SPEED
    // (speedMod), the DYNAMIC difficulty row is rewritten in place mid-run off
    // the win/loss ladder, and cpuChooseDef scouts G.recentOff - so an unpinned
    // suite calling 40 straight runs would face a different defense on carry 40
    // than on carry 1. Every one of those is a knob that moves yards.
    const pinRun = () => {
      g.diff = 1; g.humanB = false; g.playDefense = false; g.coachMode = true;
      g.practice = false; g.patMode = false; g.ot = false; g.returnPlay = null;
      g.quarter = 1; g.clock = 3600; g.score.A = 0; g.score.B = 0;
      g.rampage.A = 0; g.rampage.B = 0; g.touchMove = null;
      g.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1,
        fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP" };
    };
    const gains = [], blockedTackler = [], creaseFits = [];
    let frozenRuns = 0, worstFrozen = 0, carriesRun = 0, contactFrames = 0;
    for (let t = 0; t < 36; t++) {
      g.state = "dead"; g.deadT = 0; g.deadNext = null; g.half = null;
      g.replay = null; g.celebrate = null; g.ramp = null;
      g.drive = "A"; g.losYd = 20; g.down = 1; g.toGain = 10;
      pinRun();
      dbg.enterPlaycall(); stepFor(0.25);
      if (g.state !== "playcall") continue;
      dbg.choosePlay(RUN_CALLS[t % RUN_CALLS.length], false);
      for (let j = 0; j < 8 && g.state !== "presnap"; j++) step(16.7);
      if (g.state !== "presnap") continue;
      g.defCall = DEF_CALLS[t % DEF_CALLS.length];
      dbg.buildPlayers();
      const losYd0 = g.losYd;
      key(" ");
      if (g.state !== "live") continue;
      const everBlocked = new Map();
      const frozenStreak = new Map();
      const lastPos = new Map();
      let carrier = null, tackler = null, lastX = null, fit = 0;
      while (g.state === "live" && g.playT < 12) {
        step(16.7);
        for (const e of g.players) {
          if (e.team !== "def") continue;
          if (e.blockedBy) everBlocked.set(e, true);
          // LESSON #1 / P0-2: a block must cost a defender ground and tempo, not
          // weld him in place. A previous batch measured 35-59% of STALK-CONTACT
          // frames at exactly vx===0 && vy===0, worst unbroken pin 94 frames
          // (1.57s), because the stalk re-stamped staggerT on every decay and the
          // defender never got one free frame. Three things keep this gate honest
          // rather than merely loud, and each was a false positive I measured:
          //   - It watches POSITION, not vx/vy. A GRAPPLED rusher legitimately has
          //     stale zero velocity: case "rush" takes the `if (e.blockedBy)`
          //     branch, moves him with `e.x += ...` / `e.y += ...` and breaks
          //     without ever assigning vx/vy. Scoring him on velocity flagged 2430
          //     "pins" on the PRISTINE baseline, which has no such weld - the
          //     signal was entirely my detector.
          //   - Only STALK targets count, which is what the original measurement
          //     was about. The grapple is deliberately a locked ride
          //     (RETRO_BOWL_MECHANICS section 3), so a blocked man moving slowly
          //     inside it is the design, not a defect.
          //   - A staggerT freeze is itself a DESIGNED mechanic (the handoff
          //     double-team wash, the sweep-pass sell), so a staggered man is not a
          //     weld either. Same for prone / soaring / diving.
          const stalked = g.players.some((pl) => pl.team !== e.team && pl.block === e);
          if (!stalked || e.staggerT > 0 || e.proneT > 0 || e.soarT > 0 || e.diveT > 0) {
            frozenStreak.set(e, 0); lastPos.set(e, e.x + "," + e.y);
            continue;
          }
          contactFrames++;
          const posKey = e.x + "," + e.y;
          if (lastPos.get(e) === posKey) {
            const n = (frozenStreak.get(e) || 0) + 1;
            frozenStreak.set(e, n);
            if (n > worstFrozen) worstFrozen = n;
            if (n > 6) frozenRuns++;
          } else frozenStreak.set(e, 0);
          lastPos.set(e, posKey);
        }
        if (!carrier && g.phase === "carry" && g.carrier) carrier = g.carrier;
        const c = g.carrier;
        if (c) lastX = c.x;
        if (c && g.phase === "carry") {
          if (!tackler) {
            const hit = g.players.find((pl) => pl.team === "def" &&
              Math.hypot(pl.x - c.x, pl.y - c.y) < bodyRange(pl, c, 2));
            if (hit) tackler = hit;
          }
          // THE CREASE: the widest y-interval ahead of him that no body occupies,
          // measured against his 26px body DIAMETER and only counted within 60px
          // of his own line, because a hole he cannot reach is not a hole. This is
          // the metric that read 0.0 / 4.6 / 4.1 px at +0.1 / +0.3 / +0.5s at
          // baseline - no lane existed by construction, on any of five seeds.
          if (!fit && g.playT > 0.45 && g.playT < 0.8) {
            const ys = g.players.filter((pl) => pl !== c && pl.x > c.x - 20 &&
              pl.x < c.x + 100 && Math.abs(pl.y - c.y) < 60)
              .map((pl) => pl.y).sort((a, b) => a - b);
            let cur = c.y - 60;
            for (const y of ys.concat([c.y + 60])) {
              if (y - 16 - cur >= 26) { fit = 1; break; }
              cur = Math.max(cur, y + 16);
            }
          }
        }
      }
      if (!carrier || carrier.role !== "RB" || lastX == null) continue;
      if (["SACKED!", "FUMBLE!", "INTERCEPTED!"].includes((g.lastDead && g.lastDead.reason) || "")) continue;
      carriesRun++;
      gains.push(ydAtX(lastX) - losYd0);
      creaseFits.push(fit);
      if (tackler) blockedTackler.push(everBlocked.get(tackler) ? 1 : 0);
    }
    const med = (xs) => {
      const a = xs.slice().sort((x, y) => x - y);
      return a.length ? a[(a.length - 1) >> 1] : null;
    };
    const share = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const medGain = med(gains);
    const blkShare = share(blockedTackler), fitShare = share(creaseFits);
    check("G0 the gate sampled real RB carries off ordinary run calls",
      carriesRun >= 20, carriesRun + " carries");
    // FLOOR: baseline was a median of -0.06 yd over a 160-carry bench and +0.05
    // yd/carry over six real bot games. A median at or under 0.4 means the trench
    // has closed back up. CEILING: the owner's standard is that "a run game
    // gaining 8 is as broken as one gaining 0", so this fails upward too. Neither
    // bound is a claim that the 4-5 target is met - measured median here is ~1.3
    // on the bench (mean ~1.65), and ~0.3-0.6 in real bot games.
    check("G1 the run game is out of the ~0.0 trench (median > 0.4 yd/carry)",
      medGain != null && medGain > 0.4,
      "median " + (medGain == null ? "n/a" : medGain.toFixed(2)) + " yd over " + gains.length);
    check("G2 the run game has NOT run away (median < 5.5 yd/carry)",
      medGain != null && medGain < 5.5,
      "median " + (medGain == null ? "n/a" : medGain.toFixed(2)) + " yd");
    check("G3 a BLOCKED defender is no longer the man who makes the tackle (< 45%)",
      blkShare != null && blockedTackler.length >= 10 && blkShare < 0.45,
      (blkShare == null ? "n/a" : (100 * blkShare).toFixed(1) + "%") + " of " + blockedTackler.length);
    check("G4 a reachable crease exists on a real share of carries (> 25%)",
      fitShare != null && creaseFits.length >= 10 && fitShare > 0.25,
      (fitShare == null ? "n/a" : (100 * fitShare).toFixed(1) + "%"));
    check("G5 a stalk-blocked defender is never welded in place (LESSON #1, P0-2)",
      frozenRuns === 0 && contactFrames > 200,
      frozenRuns + " pins over 6 frames, worst streak " + worstFrozen +
      ", over " + contactFrames + " stalk-contact frames");
  }
  // PASS PROTECTION IS INSULATED BY CONSTRUCTION, not merely by measurement.
  // Every run-only trench mechanism is gated on runLaneY(), which returns null
  // unless G.curPlay.type === "run" - so driveOutOfLane, the escort run branch,
  // the second-level climb and the blocked-rusher lateral-homing cut are all
  // unreachable on a dropback. test_batch3 #6 owns the live 0.80-2.0s hold band;
  // these guard the gate that keeps that band insulated, because an edit to
  // runLaneY() is the one change that could silently expose protection to all of
  // it without any pass assertion going red.
  check("G6 runLaneY gates the run-only trench work on a run play type",
    /function runLaneY\(\)\s*\{[\s\S]{0,200}?G\.curPlay\.type === "run"[\s\S]{0,60}?return null;/.test(SRC));
  check("G7 the blocked-rusher push drops only its LATERAL term, and only on a run",
    SRC.includes("const pushLane = runLaneY();") &&
    SRC.includes("const pdy = pushLane == null ? (dy2 / m2) * push * dt : 0;") &&
    SRC.includes("const pdx = (dx2 / m2) * push * dt;"));
  // The drive is a SHOVE, not the 180px/s wall LESSON #14 calls out, and it
  // cannot run away: it stops the moment the defender's inside face clears
  // RUN_LANE_HALF, and its rate is a strength differential clamped at both ends
  // rather than a per-frame roll (LESSON #15, LESSON #19).
  check("G8 the run drive stays bounded at both ends",
    SRC.includes("if (Math.abs(off) >= RUN_LANE_HALF + bodyRadius(man)) return;") &&
    SRC.includes("RUN_DRIVE_MIN, RUN_DRIVE_MAX"));
  check("G9 a lineman claims a second-level man only within reach, and releases when outrun",
    SRC.includes("dist(p, e) < CLIMB_GRASP)") &&
    SRC.includes("dist(e.block, e) > CLIMB_GRASP * 1.6"));

  // -------------------------------------------------------------------- H
  // THE SCORING PAYOFF BEAT. Batch F made post-whistle hit-stop reachable at
  // all — every terminal beat had been cancelled one frame after it was asked
  // for, because the scaling block only ran while the state was "live" and
  // playDead flips it to "dead" on the very frame the beat is requested.
  // F1 then clamped the dead-ball slow-mo to 0.2s "per LESSON #23", and that
  // was a misreading: #23 0.2s figure is a TACKLE budget, owner-tuned next
  // to the tackled cel (0.42s) and proneT (0.4). Applied blanket to every
  // dead-ball beat it hit exactly two call sites — touchdown() at 0.4 and
  // intercepted() at 0.34 — which are precisely the two beats batch F existed
  // to deliver. Every other request in the file is already <= 0.2 and was
  // unaffected either way, so the clamp did nothing except undo the feature.
  // Measured scaled frames after the whistle, before -> after:
  //   tackle 9 -> 9 (untouched)  interception 12 -> 21  touchdown 12 -> 24
  //   and a runaway 2.0s ask still stops at 24 frames rather than 120.
  // These pin all three halves: the takedown budget, the payoff, the guard.
  check("H1 the dead-ball slow-mo ceiling is the largest legitimate ask, not the takedown one",
    SRC.includes("if (G.slowT > 0.4) G.slowT = 0.4;") &&
    !SRC.includes("if (G.slowT > 0.2) G.slowT = 0.2;"));
  check("H2 a FREEZE is still hard-capped — it stops the game outright",
    SRC.includes("if (G.freezeT > 0.08) G.freezeT = 0.08;"));
  check("H3 the touchdown keeps its full slow payoff beat",
    SRC.includes("impactMoment(0.05, 0.4, 0.5);   // the goal-line cross gets a slow payoff beat"));
  // Same event, same payoff: a defensive/return score reaches the same
  // scoreboard by a different route and its own comment promises parity.
  check("H4 a defensive score gets the SAME payoff as an offensive touchdown",
    SRC.split("impactMoment(0.05, 0.4, 0.5)").length - 1 >= 2);
  check("H5 the takedown beat is untouched by the raised ceiling (LESSON #23)",
    SRC.includes("impactMoment(hardHit ? 0.04 : 0.02, hardHit ? 0.2 : 0.11, 0.5);"));
  // The whistle-to-snap wait is what the original clamp was really guarding,
  // and it is guarded independently and better: the dead branch counts down on
  // G.rdt (REAL time), so scaling a dead beat cannot stretch the wait at all.
  // That is why raising the slow ceiling costs the player nothing.
  check("H6 the dead-ball countdown ticks on REAL time, so a longer beat cannot steal the wait",
    SRC.includes("G.rdt = dt;") &&
    SRC.includes("const rdt = G.rdt || dt;") &&
    SRC.includes("G.deadT -= rdt;"));

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exitCode = fail ? 1 : 0;
})();
