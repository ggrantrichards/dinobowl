// Soak test: play FULL games end-to-end with random-but-plausible inputs,
// exercising every state (playcall, defcall, kicks, replays, halftime,
// celebrations, OT, game over). Any G.lastErr or dead rAF loop = failure.
"use strict";
const H = require("./harness.js");
const { step, key, G } = H;

(async () => {
  await new Promise((r) => setTimeout(r, 200));
  const g = G();
  key("Enter"); key("Enter"); key("Enter"); key("Enter"); key("Enter"); // into game 1

  const stats = { plays: 0, tds: 0, fumbles: 0, sacks: 0, ints: 0, halftimes: 0, replays: 0, games: 0 };
  let lastState = "", framesInState = 0, prevBanner = "";
  const MAXF = 120000;   // ~33 game-minutes of frames
  for (let f = 0; f < MAXF; f++) {
    step(16.7);
    if (g.lastErr) { console.log("RUNTIME ERROR:", g.lastErr, "state=", g.state); process.exit(1); }
    const S = g.state;
    if (S === lastState) framesInState++; else { framesInState = 0; lastState = S; }
    if (g.banner && g.banner.text !== prevBanner) {
      prevBanner = g.banner.text;
      if (/TOUCHDOWN/.test(prevBanner)) stats.tds++;
      if (/FUMBLE|PEANUT|LOOSE/.test(prevBanner)) stats.fumbles++;
      if (/SACK/.test(prevBanner)) stats.sacks++;
      if (/INTERCEPT/.test(prevBanner)) stats.ints++;
    }
    // stuck-state watchdog (dead/kick/etc should all self-advance)
    if (framesInState > 60 * 45) {
      const ball = g.ball || {};
      const carrier = g.carrier || {};
      console.log("STUCK in state", S, "for 45s", JSON.stringify({
        phase: g.phase, playT: Number((g.playT || 0).toFixed(2)), clock: Number((g.clock || 0).toFixed(2)),
        ball: { mode: ball.mode, kind: ball.kind, x: Math.round(ball.x || 0), y: Math.round(ball.y || 0) },
        carrier: { role: carrier.role, x: Math.round(carrier.x || 0), y: Math.round(carrier.y || 0) },
      }));
      process.exit(1);
    }
    if (S === "playcall" || S === "defcall") { if (f % 30 === 0) { key(String(1 + ((Math.random() * 4) | 0))); stats.plays++; } }
    else if (S === "presnap") { if (f % 20 === 0) key(" "); }
    else if (S === "live") {
      if (Math.random() < 0.02) key([" ", "shift", "e", "f", "q", "tab", "r"][(Math.random() * 7) | 0]);
      if (Math.random() < 0.01) { H.mouse("mousedown", 400 + Math.random() * 400, 100 + Math.random() * 350); }
      if (Math.random() < 0.01) { H.mouse("mouseup", 400 + Math.random() * 400, 100 + Math.random() * 350); }
      if (Math.random() < 0.003) { H.mouse("mousedown", 500, 250, 2); } // bullet
    }
    else if (S === "kick") { if (f % 25 === 0) key(" "); }
    else if (S === "intro" || S === "pregame") { if (f % 20 === 0) key("Enter"); }
    else if (S === "kickfly" || S === "upgrade") { /* self-advancing / n.a. */ }
    else if (S === "replay") { stats.replays++; if (Math.random() < 0.02) key("x"); }
    else if (S === "halftime") { if (framesInState === 1) stats.halftimes++; /* let it play out */ }
    else if (S === "ptchoice") { key(Math.random() < 0.5 ? "1" : "2"); }
    else if (S === "over") {
      stats.games++;
      if (stats.games >= 3) break;
      key("Enter"); key("Enter"); key("Enter"); key("Enter"); key("Enter"); // straight into the next game
    }
  }
  console.log("SOAK OK — no runtime errors across", stats.games, "full games");
  console.log(JSON.stringify(stats));
  process.exit(0);
})().catch((e) => { console.error("HARNESS CRASH:", e); process.exit(2); });
