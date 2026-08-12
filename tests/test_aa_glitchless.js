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

  // functional: drive a routine 1st-and-20 tackle and watch the rise
  g.state = "dead"; g.deadT = 0; g.deadNext = null;
  g.drive = "A"; g.losYd = 30; g.down = 1; g.toGain = 20; g.patMode = false; g.practice = false;
  g.clock = 300; g.quarter = 1; g.score.A = 0; g.score.B = 0;
  dbg.enterPlaycall(); stepFor(0.2);
  dbg.choosePlay((g.callsheet || []).find((p) => p.type === "run") || g.callsheet[0], false);
  stepFor(0.1); key(" ");
  let liveGuard = 0, seen = null;
  while (g.state === "live" && liveGuard < 1200) { step(16.7); liveGuard++; if (g.carrier) seen = g.carrier; }
  let rotatedFallback = 0, sawGetup = 0;
  if (seen) {
    for (let i = 0; i < 180; i++) {
      step(16.7);
      // the defect signature: nothing authored playing, yet still flagged down,
      // so the renderer turns the STANDING cel on its side
      if (!(seen.pose || "") && (seen.proneT || 0) > 0) rotatedFallback++;
      if (seen.pose === "getup") sawGetup++;
    }
  }
  check("E2 a routine tackle never shows the 90-rotated walk fallback",
    !!seen && rotatedFallback === 0, seen ? rotatedFallback + " frames" : "no carrier seen");
  check("E3 ...and the carrier visibly stands back up through getup",
    !!seen && sawGetup > 0, seen ? sawGetup + " getup frames" : "no carrier seen");

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exitCode = fail ? 1 : 0;
})();
