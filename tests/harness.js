// Headless harness: runs the real sprites.js + game.js in Node with stubbed
// browser APIs and a manually-stepped requestAnimationFrame loop.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const GAME_DIR = path.join(__dirname, "..", "static", "game") + path.sep;

// ---- 2d context stub (records nothing, crashes never)
function makeCtx() {
  return new Proxy({}, {
    get(t, k) {
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "getImageData") return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
      if (k === "createLinearGradient") return () => ({ addColorStop() { } });
      if (k === "canvas") return null;
      return () => { };
    },
    set() { return true; },
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
global.navigator = {};
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
function mouse(ev, x, y, button = 0) {
  for (const fn of gameCanvas.__listeners[ev] || []) fn({ clientX: x, clientY: y, button, preventDefault() { } });
}

const G = () => global.window.__game;
module.exports = { step, stepFor, key, mouse, G, store };
