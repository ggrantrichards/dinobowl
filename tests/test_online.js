// Two full game instances, one shared in-memory Firebase Realtime DB.
// Proves QUICK MATCH genuinely queues two strangers into ONE game:
//   • first player parks in the matchmaking slot as HOST
//   • second player CLAIMS the slot and joins as GUEST (same room)
//   • host's frames reach the guest (guest sees host's teams/state)
//   • guest's inputs reach the host (round-trip control channel)
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const nodeCrypto = require("crypto");
const GAME_DIR = path.join(__dirname, "..", "static", "game") + path.sep;

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (extra != null ? "  [" + extra + "]" : "")); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- shared in-memory Realtime Database ----------------
function makeSharedDb() {
  const store = {};
  const valueL = [];        // {path, cb}
  const childL = [];        // {path, cb}
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const parts = (p) => p.split("/").filter(Boolean);
  const SV = { TIMESTAMP: { ".sv": "timestamp" } };
  let pushN = 0;
  function read(p) { let n = store; for (const k of parts(p)) { if (n == null) return null; n = n[k]; } return n === undefined ? null : n; }
  function write(p, v) {
    const ps = parts(p); let n = store;
    for (let i = 0; i < ps.length - 1; i++) { if (typeof n[ps[i]] !== "object" || n[ps[i]] == null) n[ps[i]] = {}; n = n[ps[i]]; }
    const last = ps[ps.length - 1];
    if (v === null || v === undefined) delete n[last]; else n[last] = v;
  }
  function resolve(v) {
    if (v && typeof v === "object") {
      if (v[".sv"] === "timestamp") return Date.now();
      const o = Array.isArray(v) ? [] : {}; for (const k in v) o[k] = resolve(v[k]); return o;
    }
    return v;
  }
  function snap(p) { return { val: () => clone(read(p)), key: parts(p).slice(-1)[0] }; }
  function fireValue(p) { for (const l of valueL.slice()) if (l.path === p) l.cb(snap(p)); }
  function ref(pathStr) {
    const self = {
      _path: pathStr,
      child(name) { return ref(pathStr + "/" + name); },
      async set(v) { write(pathStr, resolve(clone(v))); fireValue(pathStr); },
      async transaction(fn) {
        const cur = clone(read(pathStr));
        const res = fn(cur);
        if (res === undefined) return { committed: false, snapshot: snap(pathStr) };
        write(pathStr, resolve(res)); fireValue(pathStr);
        return { committed: true, snapshot: snap(pathStr) };
      },
      async push(v) {
        const id = "psh" + (pushN++), cp = pathStr + "/" + id;
        write(cp, resolve(clone(v)));
        for (const l of childL.slice()) if (l.path === pathStr) l.cb({ val: () => clone(read(cp)), key: id, ref: ref(cp) });
        return ref(cp);
      },
      on(event, cb) {
        if (event === "value") { valueL.push({ path: pathStr, cb }); cb(snap(pathStr)); }
        else if (event === "child_added") { childL.push({ path: pathStr, cb }); }
        return cb;
      },
      off() {
        for (let i = valueL.length - 1; i >= 0; i--) if (valueL[i].path === pathStr) valueL.splice(i, 1);
        for (let i = childL.length - 1; i >= 0; i--) if (childL[i].path === pathStr) childL.splice(i, 1);
      },
      remove() { write(pathStr, null); fireValue(pathStr); },
      onDisconnect() { return { remove() { }, cancel() { } }; },
    };
    return self;
  }
  return { ref, SV, read, store };
}

// ---------------- one sandboxed game instance ----------------
let uidSeq = 0;
function makeInstance(label, sharedDb) {
  const elements = {};
  const winListeners = {};
  const canvas = {
    width: 0, height: 0, style: {},
    getContext: () => new Proxy({}, { get(t, k) {
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
      if (k === "createLinearGradient") return () => ({ addColorStop() { } });
      if (k === "canvas") return null;
      return () => { };
    }, set() { return true; } }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener: () => { },
    __listeners: {},
  };
  const store = new Map();
  let simTime = 0, rafCb = null;
  let myUid = null;
  const auth = {
    signInAnonymously: async () => { if (!myUid) myUid = "uid" + (++uidSeq); auth.currentUser = { uid: myUid }; return; },
    currentUser: null,
  };
  const fb = {
    apps: [],
    initializeApp() { fb.apps.push({}); },
    auth: () => auth,
    database: Object.assign(() => ({ ref: sharedDb.ref }), { ServerValue: sharedDb.SV }),
  };
  const sandbox = {
    console: { log() { }, warn() { }, error() { } },
    performance: { now: () => simTime },
    crypto: nodeCrypto.webcrypto,
    setTimeout, clearTimeout,
    URLSearchParams, TextEncoder, TextDecoder, Uint8ClampedArray, Uint32Array,
    requestAnimationFrame: (cb) => { rafCb = cb; },
    alert: () => { },
    history: { replaceState() { } },
    navigator: {},
    location: { search: "", pathname: "/game/" },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    firebase: fb,
  };
  sandbox.window = {
    addEventListener: (ev, cb) => { (winListeners[ev] = winListeners[ev] || []).push(cb); },
    DINO_BOWL_FIREBASE_CONFIG: { apiKey: "test", databaseURL: "test" },
    firebase: fb,
    AudioContext: undefined,
  };
  sandbox.document = {
    getElementById: (id) => (id === "game" ? canvas : (elements[id] = elements[id] || { textContent: "" })),
    createElement: () => ({ click() { }, style: {}, set href(v) { }, get href() { return ""; }, addEventListener() { }, getContext: canvas.getContext }),
    addEventListener: () => { },
    hidden: false, body: { classList: { toggle() { } } }, documentElement: {},
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GAME_DIR + "sprites.js", "utf8"), sandbox, { filename: "sprites.js" });
  sandbox.DinoSprites = sandbox.window.DinoSprites;
  vm.runInContext(fs.readFileSync(GAME_DIR + "game.js", "utf8"), sandbox, { filename: "game.js" });

  const inst = {
    label,
    get G() { return sandbox.window.__game; },
    status: () => (elements["online-status"] ? elements["online-status"].textContent : ""),
    uid: () => myUid,
    step(ms = 16.7) { simTime += ms; const cb = rafCb; rafCb = null; if (cb) cb(simTime); },
    stepFor(sec) { for (let i = 0; i < Math.ceil(sec * 60); i++) inst.step(16.7); },
    key(k) {
      for (const cb of winListeners.keydown || []) cb({ key: k, preventDefault() { } });
      for (const cb of winListeners.keyup || []) cb({ key: k, preventDefault() { } });
    },
  };
  return inst;
}

(async () => {
  const db = makeSharedDb();
  const A = makeInstance("A", db);
  const B = makeInstance("B", db);

  // let both boot to title (boot() is async — fetch teams.json)
  for (let i = 0; i < 40 && (A.G.state !== "title" || B.G.state !== "title"); i++) { A.step(); B.step(); await sleep(20); }
  check("both instances boot to title", A.G.state === "title" && B.G.state === "title", A.G.state + "/" + B.G.state);

  // ---- Player A opens the menu and taps QUICK MATCH ----
  A.key("Enter");                       // title → menu
  const optsA = A.G.debug ? null : null;
  // find QUICK MATCH index by walking the menu
  function tapQuickMatch(inst) {
    // menu is open; press Enter after moving to QUICK MATCH. Easiest: drive the
    // menu handler directly through the key path by matching the label.
    // We can't read menuOptions() externally, so cycle right until the status
    // path changes — instead just invoke via the known layout: EXHIBITION,
    // 2-PLAYER VERSUS, QUICK MATCH ...  → index 2.
    inst.key("d"); inst.key("d");        // move to QUICK MATCH (3rd card)
    inst.key("Enter");
  }
  tapQuickMatch(A);
  // let A's async matchmaking (signIn + transaction + room set) settle
  for (let i = 0; i < 20 && A.G.state !== "online_wait"; i++) { A.step(); await sleep(20); }
  await sleep(60); A.step();
  check("A is queued and waiting", A.G.state === "online_wait", A.G.state);
  check("A parked a slot in matchmaking/waiting",
    !!(db.read("dinobowl/matchmaking/waiting") && db.read("dinobowl/matchmaking/waiting").uid === A.uid()),
    JSON.stringify(db.read("dinobowl/matchmaking/waiting")));
  check("A became HOST (status)", /HOST/.test(A.status()), A.status());
  const roomA = db.read("dinobowl/matchmaking/waiting") && db.read("dinobowl/matchmaking/waiting").room;

  // ---- Player B taps QUICK MATCH and should CLAIM A's slot ----
  B.key("Enter");
  tapQuickMatch(B);
  for (let i = 0; i < 30 && B.G.state !== "online_wait"; i++) { B.step(); await sleep(20); }
  // give the guestJoined → host handler + the 1.1s host→select timer time to run
  for (let i = 0; i < 90; i++) { A.step(); B.step(); await sleep(20); if (A.G.state === "select") break; }

  check("B matched as GUEST (status)", /TEAM B/.test(B.status()), B.status());
  check("matchmaking slot was consumed (queue empty)", db.read("dinobowl/matchmaking/waiting") == null,
    JSON.stringify(db.read("dinobowl/matchmaking/waiting")));
  check("both landed in the SAME room", !!roomA && !!db.read("dinobowl/rooms/" + roomA),
    roomA);
  check("guest announced itself via guestJoined",
    !!(db.read("dinobowl/rooms/" + roomA + "/guestJoined") &&
       db.read("dinobowl/rooms/" + roomA + "/guestJoined").uid === B.uid()));
  check("host advanced to team SELECT after the match", A.G.state === "select", A.G.state);
  check("both sides know they're paired (found)",
    A.G.online && A.G.online.phase === "found" && B.G.online && B.G.online.phase === "found");

  // ---- host picks teams → starts the game → frames must reach the guest ----
  A.G.selA = 3;  // pick a deterministic team A
  A.key("Enter");            // confirm team A → step to opponent
  A.G.selB = 9;
  A.key("Enter");            // confirm opponent → pregame
  // stream frames for a bit; guest should adopt host's teams + leave the lobby
  for (let i = 0; i < 120; i++) { A.step(); B.step(); await sleep(4); if (B.G.my === A.G.my && B.G.state !== "online_wait") break; }
  check("host started a game with the chosen teams", !!A.G.my && !!A.G.opp, A.G.my + " vs " + A.G.opp);
  check("GUEST received the host's frame (same teams)", B.G.my === A.G.my && B.G.opp === A.G.opp,
    "guest=" + B.G.my + "/" + B.G.opp + " host=" + A.G.my + "/" + A.G.opp);
  check("guest left the lobby onto the host's live game state", B.G.state !== "online_wait" && B.G.state !== "menu", B.G.state);

  // ---- guest INPUT must reach the host (round-trip control channel) ----
  // Put both on a Team-B possession in a live-ish state so the guest is allowed
  // to control, then have the guest press 'h' (a global toggle onKey handles
  // unconditionally) and confirm the HOST's flag flipped.
  A.G.drive = "B"; A.G.state = "live"; A.G.phase = "drop";
  B.G.drive = "B"; B.G.state = "live"; B.G.phase = "drop";
  const helpBefore = !!A.G.help;
  B.key("h");                // guest keydown → queued to DB → host consumes
  A.step(); B.step();
  check("guest input crossed the wire and toggled the HOST",
    !!A.G.help === !helpBefore, "before=" + helpBefore + " after=" + A.G.help);
  check("input queue was drained by the host (no leftover)",
    (function () { const inp = db.read("dinobowl/rooms/" + roomA + "/inputs"); return inp == null || Object.keys(inp).length === 0; })());

  // ---- cancel path: a lone searcher can back out and clear its slot ----
  const C = makeInstance("C", db);
  for (let i = 0; i < 40 && C.G.state !== "title"; i++) { C.step(); await sleep(15); }
  C.key("Enter"); C.key("d"); C.key("d"); C.key("Enter");
  for (let i = 0; i < 20 && C.G.state !== "online_wait"; i++) { C.step(); await sleep(20); }
  await sleep(40); C.step();
  const parked = !!db.read("dinobowl/matchmaking/waiting");
  C.key("Escape");           // cancel
  await sleep(20); C.step();
  check("a searcher can cancel back to the menu", C.G.state === "menu", C.G.state);
  check("cancel cleared its matchmaking slot",
    parked && db.read("dinobowl/matchmaking/waiting") == null);

  console.log("\n======================");
  console.log("PASS " + pass + "  FAIL " + fail);
  process.exit(fail ? 1 : 0);
})();
