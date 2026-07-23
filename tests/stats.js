// Statistical playtest: run many CPU-vs-CPU plays through the REAL game engine
// and measure completion %, yards/attempt, INT rate, sack rate, yards/carry,
// fumble rate, and scoring — then compare to real NFL norms.
"use strict";
const H = require("./harness.js");
const { step, G } = H;

// bands follow the USER'S spec where it deviates from the NFL on purpose:
// throws are capped ~20yds (#1) so Y/A runs lower than the NFL's 6.5+, and
// INTs/sacks target ~2 per game (#13.1) = ~5-7% of attempts/dropbacks.
const NFL = {
  compPct: [60, 70],       // completion %
  yardsPerAtt: [4.6, 7.8], // net yards/attempt (short-throw meta by design)
  intRate: [3.5, 7.0],     // ~2 per game per team (user spec)
  sackRate: [5.0, 8.0],    // sacks per dropback (%)
  yardsPerCarry: [4.0, 4.7],
  fumbleLostPerPlay: [0.5, 1.2], // fumbles LOST per 100 offensive plays
  passRunSplit: [55, 62],  // % of plays that are pass calls (league ~58%)
};

function inRange(v, [lo, hi]) { return v >= lo && v <= hi; }
function tag(v, r) { return inRange(v, r) ? "OK " : (v < r[0] ? "LOW" : "HI "); }

(async () => {
  await new Promise((r) => setTimeout(r, 250));
  const g = G();
  const dbg = g.debug;

  // start an exhibition so rosters/sprites/stadium exist
  const key = (k) => { for (const fn of []) { } H.key(k); };
  key("Enter"); key("Enter");
  g.selA = 1; g.selB = 5;      // fixed matchup: ATL vs CHI (median rosters)
  key("Enter"); key("Enter"); key("Enter");
  // make sure we're actually in a game
  let guard = 0;
  while (!g.players && guard++ < 20) { key("Enter"); step(200); }

  const S = {
    plays: 0, passCalls: 0, runCalls: 0,
    att: 0, cmp: 0, passYds: 0, ints: 0, sacks: 0, sackYds: 0, throwaways: 0, scrambles: 0,
    car: 0, rushYds: 0, fumblesLost: 0, tds: 0, firstDowns: 0, safeties: 0,
    airYds: 0, yac: 0, compForSplit: 0,
  };
  const ydAtX = (x) => (x - 200) / 20;

  const NUM = 1600;
  for (let p = 0; p < NUM; p++) {
    // fresh 1st & 10 at a random spot; force CPU offense (drive B, no humanB)
    g.humanB = false; g.practice = false; g.patMode = false;
    g.drive = "B";
    g.losYd = 20 + (p % 55);
    g.down = 1; g.toGain = 10;
    g.clock = 900; g.quarter = 1; g.ot = false;
    g.rampage = { A: 0, B: 0 }; g.ramp = null;
    g.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 70 };

    // CPU picks the offense; with CPU offense the "human" side is the defense,
    // so the pipeline pauses at defcall — pick a scheme to reach the snap.
    dbg.enterPlaycall();
    let s = 0;
    while (!["presnap", "defcall", "playcall"].includes(g.state) && s++ < 40) step(16.7);
    if (g.state === "defcall" || g.state === "playcall") {
      const cards = g.callsheet || [];
      const pickIdx = 1 + ((p * 7) % Math.max(1, cards.length));  // vary the defense
      H.key(String(Math.min(cards.length, pickIdx)));
      let s2 = 0;
      while (g.state !== "presnap" && s2++ < 20) step(16.7);
    }
    if (g.state !== "presnap") { // CPU chose a kick etc. — skip
      g.state = "dead"; g.deadT = 0; g.deadNext = null; step(16.7);
      continue;
    }
    const play = g.curPlay;
    const isPass = play && play.type === "pass";
    S.plays++;
    if (isPass) S.passCalls++; else S.runCalls++;
    const los0 = g.losYd;

    // snap and STRIP all human control so both sides run pure AI
    // (find the snap by toggling state via the input path)
    H.key(" ");
    g.controlled = null;
    if (g.players) g.players.forEach((e) => (e.controlled = false));

    // run to the whistle
    let threw = false, threwAway = false, lastCarrierX = null, sawFumble = false;
    let catchX = null, wasReceiverCatch = false;
    let f = 0;
    while (g.state === "live" && f++ < 600) {
      step(16.7);
      g.controlled = null;
      const b = g.ball;
      if (b && b.mode === "air" && (b.kind === "lob" || b.kind === "bullet")) {
        if (b.away) threwAway = true; else threw = true;
      }
      // capture the catch point the first frame a thrown pass has a receiver
      if (catchX == null && g.playPass && g.playPass.receiver) { catchX = g.playPass.receiver.x; wasReceiverCatch = true; }
      if (g.carrier) lastCarrierX = g.carrier.x;
      if ((b && b.mode === "loose") || g.phase === "loose") sawFumble = true;
    }
    if (wasReceiverCatch && catchX != null) {
      S.airYds += Math.round(ydAtX(catchX) - los0);
      S.yac += Math.round((lastCarrierX != null ? ydAtX(lastCarrierX) : ydAtX(catchX)) - ydAtX(catchX));
      S.compForSplit++;
    }

    const reason = (g.lastDead && g.lastDead.reason) || "";
    const pass = g.playPass;
    const completed = !!(pass && pass.receiver);
    const carrierYd = lastCarrierX != null ? ydAtX(lastCarrierX) : los0;
    const gained = Math.round(carrierYd - los0);
    const firstDownLine = los0 < 90 ? 10 : (100 - los0);
    const scoredTD = carrierYd >= 100;

    // classify honestly: pass plays that never released the ball are either a
    // SACK (QB down at/behind LOS) or a SCRAMBLE (QB ran for yards)
    if (reason === "INTERCEPTED!") {
      S.att++; S.ints++;
    } else if (threwAway) {
      S.att++; S.throwaways++;
    } else if (completed) {
      S.att++; S.cmp++; S.passYds += Math.max(-5, gained);
      if (scoredTD) S.tds++;
      if (gained >= firstDownLine) S.firstDowns++;
    } else if (threw) {
      S.att++; // incompletion / drop / broken up → 0 yards
    } else if (isPass) {
      // no throw on a pass play → sack or scramble
      if (reason === "SACKED!" || gained <= 0) { S.sacks++; S.sackYds += Math.min(0, gained); }
      else { S.scrambles++; S.car++; S.rushYds += gained; if (scoredTD) S.tds++; if (gained >= firstDownLine) S.firstDowns++; }
    } else {
      // designed run
      S.car++; S.rushYds += gained;
      if (scoredTD) S.tds++;
      if (carrierYd <= 0 && ["TACKLED", "FLATTENED!", "DIVE"].includes(reason)) S.safeties++;
      if (gained >= firstDownLine) S.firstDowns++;
    }
    if (sawFumble && g.lastDead && g.lastDead.turnover) S.fumblesLost++;

    // reset for next iteration
    g.state = "dead"; g.deadT = 0; g.deadNext = null; g.replay = null; g.celebrate = null;
    step(16.7);
    if (g.lastErr) { console.log("ERR:", g.lastErr); g.lastErr = null; }
  }

  const compPct = 100 * S.cmp / Math.max(1, S.att);
  const yPerAtt = S.passYds / Math.max(1, S.att);
  const intRate = 100 * S.ints / Math.max(1, S.att);
  const dropbacks = S.att + S.sacks;
  const sackRate = 100 * S.sacks / Math.max(1, dropbacks);
  const designedCarries = S.car - S.scrambles;
  const yPerCarry = S.rushYds / Math.max(1, S.car);
  const fumbleRate = 100 * S.fumblesLost / Math.max(1, S.plays);
  const passSplit = 100 * S.passCalls / Math.max(1, S.plays);

  const line = (label, v, r, unit) =>
    console.log(`  [${tag(v, r)}] ${label.padEnd(22)} ${v.toFixed(1)}${unit}  (NFL ${r[0]}–${r[1]}${unit})`);

  console.log("\n==== DINO BOWL — " + S.plays + " CPU-vs-CPU plays (" + g.my + " off vs " + g.opp + ") ====");
  console.log("  pass calls " + S.passCalls + " · run calls " + S.runCalls + " · attempts " + S.att + " · carries " + S.car + " · sacks " + S.sacks);
  line("Completion %", compPct, NFL.compPct, "%");
  line("Yards / attempt", yPerAtt, NFL.yardsPerAtt, "");
  line("INT rate", intRate, NFL.intRate, "%");
  line("Sack rate", sackRate, NFL.sackRate, "%");
  line("Yards / carry", yPerCarry, NFL.yardsPerCarry, "");
  line("Fumbles lost / 100 plays", fumbleRate, NFL.fumbleLostPerPlay, "");
  line("Pass-call %", passSplit, NFL.passRunSplit, "%");
  console.log("  extra: throwaways " + S.throwaways + " · scrambles " + S.scrambles + " · TDs " + S.tds + " · first downs " + S.firstDowns + " (" + (100 * S.firstDowns / S.plays).toFixed(0) + "% of plays) · safeties " + S.safeties);
  console.log("  completion split: avg AIR yds " + (S.airYds / Math.max(1, S.compForSplit)).toFixed(1) + " · avg YAC " + (S.yac / Math.max(1, S.compForSplit)).toFixed(1) + " (NFL ~ air 6 / YAC 5)");
  // machine-readable
  console.log("JSON " + JSON.stringify({ compPct, yPerAtt, intRate, sackRate, yPerCarry, fumbleRate, passSplit, plays: S.plays, att: S.att, car: S.car }));
  process.exit(0);
})().catch((e) => { console.error("CRASH", e); process.exit(2); });
