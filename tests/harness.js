// Headless harness: runs the real sprites.js + game.js in Node with stubbed
// browser APIs and a manually-stepped requestAnimationFrame loop.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const GAME_DIR = path.join(__dirname, "..", "static", "game") + path.sep;
const TM = require("./textmetrics.js");

// ---- 2d context stub (crashes never) with a REAL text metric.
// measureText used to be  () => ({ width: 10 })  -- a CONSTANT. Text overflow
// is purely a function of the measured width, so with a constant no test in
// this repo could ever see one, which is exactly why the overflows existed.
// The only state the stub now has to keep is the font, because the width
// depends on it. See textmetrics.js for how the numbers were established.
function makeCtx() {
  let font = "10px 'Press Start 2P', monospace";
  return new Proxy({}, {
    get(t, k) {
      if (k === "font") return font;
      if (k === "measureText") return (s) => ({ width: TM.measure(s, font) });
      if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
      if (k === "createLinearGradient") return () => ({ addColorStop() { } });
      if (k === "canvas") return null;
      return () => { };
    },
    set(t, k, v) { if (k === "font") font = String(v); return true; },
  });
}
function makeCanvasStub() {
  const listeners = {};
  return {
    width: 0, height: 0, style: {},
    getContext: () => makeCtx(),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    __listeners: listeners,
  };
}

const gameCanvas = makeCanvasStub();
const winListeners = {};
const store = new Map();

global.window = {
  addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn); },
  __rafQueue: [],
};
global.document = {
  getElementById: (id) => (id === "game" ? gameCanvas : { textContent: "" }),
  createElement: (tag) => (tag === "canvas" ? makeCanvasStub() : { click() { }, style: {}, set href(v) { }, get href() { return ""; }, addEventListener() { } }),
  addEventListener: () => { },
  hidden: false,
  body: { classList: { toggle() { } } },
  documentElement: {},
};
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let rafCb = null;
global.requestAnimationFrame = (cb) => { rafCb = cb; };
global.alert = () => { };
global.history = { replaceState() { } };
// Node >=21 exposes a getter-only global.navigator — plain assignment throws
try { Object.defineProperty(global, "navigator", { value: {}, configurable: true }); }
catch (e) { /* older Node: plain global already assignable */ global.navigator = {}; }
global.location = { search: "", pathname: "/game/" };
global.fetch = async (url) => {
  if (String(url).includes("teams.json")) {
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(GAME_DIR + "teams.json", "utf8")) };
  }
  return { ok: false, json: async () => ({}) };
};
if (!global.performance) global.performance = { now: () => simTime };

// ---- load the real scripts
vm.runInThisContext(fs.readFileSync(GAME_DIR + "sprites.js", "utf8"), { filename: "sprites.js" });
global.DinoSprites = global.window.DinoSprites;
vm.runInThisContext(fs.readFileSync(GAME_DIR + "game.js", "utf8"), { filename: "game.js" });

// ---- loop driver
let simTime = 0;
function step(ms = 16) {
  simTime += ms;
  const cb = rafCb; rafCb = null;
  if (cb) cb(simTime);
  else throw new Error("no rAF callback queued — the loop died");
}
function stepFor(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) step(16.7); }
function key(k) {
  for (const fn of winListeners.keydown || []) fn({ key: k, preventDefault() { } });
  for (const fn of winListeners.keyup || []) fn({ key: k, preventDefault() { } });
}
// key() is a TAP — down and up in the same call. Anything that reads the HELD
// key set (the movement stick: kdir() over keys["w"]/keys["s"]) is invisible
// to it, so a held direction needs these two.
function keyHold(k) {
  for (const fn of winListeners.keydown || []) fn({ key: k, preventDefault() { } });
}
function keyRelease(k) {
  for (const fn of winListeners.keyup || []) fn({ key: k, preventDefault() { } });
}
// A real pointer event on the canvas BUBBLES to window, and mousemove/mouseup
// are registered on window so a release over the LETTERBOX still resolves.
// Feed both lists; no handler is registered on both, so nothing double-fires.
function mouse(ev, x, y, button = 0) {
  const e = { clientX: x, clientY: y, button, preventDefault() { } };
  for (const fn of gameCanvas.__listeners[ev] || []) fn(e);
  for (const fn of winListeners[ev] || []) fn(e);
}

// ---- multi-touch: touch("touchstart", [{id, x, y}, ...])
// The LIVE set is tracked the way a browser tracks event.touches: a
// touchstart/touchmove event sees the new positions, and a touchend sees the
// set with the lifted fingers ALREADY GONE. Several fingers in one call are
// one synchronous event with several changedTouches — which is exactly the
// two-finger case the input layer has to survive.
const liveTouches = new Map();
function touch(ev, list) {
  const mk = (t) => ({ identifier: t.id, clientX: t.x, clientY: t.y });
  const changedTouches = list.map(mk);
  if (ev === "touchend" || ev === "touchcancel") for (const t of list) liveTouches.delete(t.id);
  else for (const t of list) liveTouches.set(t.id, mk(t));
  const e = { changedTouches, touches: Array.from(liveTouches.values()), preventDefault() { } };
  for (const fn of gameCanvas.__listeners[ev] || []) fn(e);
  return e;
}
function resetTouches() { liveTouches.clear(); }

const G = () => global.window.__game;
module.exports = {
  step, stepFor, key, mouse, touch, resetTouches, G, store, keyHold, keyRelease,
  // the real metric, so a test can assert a box width against the same number
  // a browser would produce
  measureTextWidth: TM.measure, fontPx: TM.pxOf, textEm: TM.widthEm,
};
