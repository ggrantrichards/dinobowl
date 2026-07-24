/* ============================================================
 * DINO BOWL — an 8-bit retro football game with dinosaurs.
 * Real NFL teams + real player stats served from /api/game/teams.
 * ============================================================ */
(function () {
  "use strict";

  // ------------------------------------------------------------------ consts
  const W = 960, H = 540;
  const YPX = 20;                       // px per yard (x axis)
  const FIELD_X0 = 200;                 // x of offense's own goal line... x of left goal line
  const FIELD_LEN = 2400;               // 120 yards incl endzones
  const TOP = 84, BOT = 508;            // sidelines (y)
  const MID = (TOP + BOT) / 2;
  const xAtYd = (yd) => FIELD_X0 + yd * YPX;
  const ydAtX = (x) => (x - FIELD_X0) / YPX;

  const TEAMS = {
    ARI: ["Cardinals", "#97233f", "#ffb612"], ATL: ["Falcons", "#a71930", "#2b2b2b"],
    BAL: ["Ravens", "#241773", "#9e7c0c"], BUF: ["Bills", "#00338d", "#c60c30"],
    CAR: ["Panthers", "#0085ca", "#101820"], CHI: ["Bears", "#0b162a", "#c83803"],
    CIN: ["Bengals", "#fb4f14", "#1c1c1c"], CLE: ["Browns", "#311d00", "#ff3c00"],
    DAL: ["Cowboys", "#003594", "#869397"], DEN: ["Broncos", "#fb4f14", "#002244"],
    DET: ["Lions", "#0076b6", "#b0b7bc"], GB: ["Packers", "#203731", "#ffb612"],
    HOU: ["Texans", "#03202f", "#a71930"], IND: ["Colts", "#002c5f", "#a2aaad"],
    JAX: ["Jaguars", "#006778", "#d7a22a"], KC: ["Chiefs", "#e31837", "#ffb81c"],
    LA: ["Rams", "#003594", "#ffa300"], LAC: ["Chargers", "#0080c6", "#ffc20e"],
    LV: ["Raiders", "#1c1c1c", "#a5acaf"], MIA: ["Dolphins", "#008e97", "#fc4c02"],
    MIN: ["Vikings", "#4f2683", "#ffc62f"], NE: ["Patriots", "#002244", "#c60c30"],
    NO: ["Saints", "#d3bc8d", "#101820"], NYG: ["Giants", "#0b2265", "#a71930"],
    NYJ: ["Jets", "#125740", "#e8e8e6"], PHI: ["Eagles", "#004c54", "#a5acaf"],
    PIT: ["Steelers", "#ffb612", "#101820"], SEA: ["Seahawks", "#002244", "#69be28"],
    SF: ["49ers", "#aa0000", "#b3995d"], TB: ["Buccaneers", "#d50a0a", "#34302b"],
    TEN: ["Titans", "#0c2340", "#4b92db"], WAS: ["Commanders", "#5a1414", "#ffb612"],
  };
  const ABBRS = Object.keys(TEAMS);

  // ---------------------------------------------------------------- playbook
  // Routes: waypoints [dyd (yards downfield), dy (px lateral, +down)] then mode
  // mode: 'go' keep running, 'stop' settle, 'block'
  const R = {
    go: { pts: [[3, 0]], end: "go" },
    slantIn: (s) => ({ pts: [[3, 0], [9, 90 * s]], end: "go" }),
    curl: { pts: [[9, 0], [8, 10]], end: "stop" },
    flat: (s) => ({ pts: [[1, 60 * s], [2, 90 * s]], end: "stop" }),
    post: (s) => ({ pts: [[10, 0], [18, 70 * s]], end: "go" }),
    corner: (s) => ({ pts: [[10, 0], [17, -80 * s]], end: "go" }),
    drag: (s) => ({ pts: [[2, 0], [6, 150 * s]], end: "go" }),
    wheel: (s) => ({ pts: [[0, 120 * s], [6, 110 * s], [16, 100 * s]], end: "go" }),
    screen: { pts: [[-3, 40]], end: "stop" },
    seam: { pts: [[4, 0], [14, -25]], end: "go" },
    dig: (s) => ({ pts: [[12, 0], [13, -100 * s]], end: "stop" }),
    out: (s) => ({ pts: [[6, 0], [7, -80 * s]], end: "stop" }),
    comeback: { pts: [[11, 0], [10, 12]], end: "stop" },
    block: { pts: [], end: "block" },
  };
  // slots: WR1 (top wide), WR3 (top slot), TE (bottom tight), WR2 (bottom wide), RB
  // tags drive the "show the 4 most relevant" scorer: quick / medium / deep / run / screen / goalline
  const OFF_PLAYS = [
    { name: "FOUR VERTS", type: "pass", tags: ["deep"], routes: { WR1: R.go, WR3: R.seam, TE: R.seam, WR2: R.go, RB: R.block } },
    { name: "SLANTS", type: "pass", tags: ["quick"], routes: { WR1: R.slantIn(1), WR3: R.slantIn(1), TE: R.flat(1), WR2: R.slantIn(-1), RB: R.block } },
    { name: "CURL FLAT", type: "pass", tags: ["medium"], routes: { WR1: R.curl, WR3: R.flat(-1), TE: R.seam, WR2: R.curl, RB: R.flat(1) } },
    { name: "POST CORNER", type: "pass", tags: ["deep"], routes: { WR1: R.post(1), WR3: R.drag(1), TE: R.corner(-1), WR2: R.post(-1), RB: R.screen } },
    { name: "MESH", type: "pass", tags: ["quick", "medium"], routes: { WR1: R.slantIn(1), WR3: R.drag(1), TE: R.drag(-1), WR2: R.go, RB: R.wheel(-1) } },
    { name: "RB SCREEN", type: "pass", tags: ["quick", "screen"], routes: { WR1: R.go, WR3: R.go, TE: R.block, WR2: R.go, RB: R.screen } },
    { name: "DAGGER", type: "pass", tags: ["medium", "deep"], routes: { WR1: R.go, WR3: R.dig(1), TE: R.flat(1), WR2: R.comeback, RB: R.block } },
    { name: "FLOOD", type: "pass", tags: ["medium"], routes: { WR1: R.corner(1), WR3: R.out(1), TE: R.flat(1), WR2: R.drag(1), RB: R.block } },
    { name: "HB DIVE", type: "run", tags: ["run", "short"], lane: 0 },
    { name: "HB SWEEP ▲", type: "run", tags: ["run"], lane: -1 },
    { name: "HB SWEEP ▼", type: "run", tags: ["run"], lane: 1 },
    { name: "SWEEP PASS", type: "run", tags: ["trick", "medium"], lane: -1, hbPass: true, sweepPass: true },
    { name: "HB DRAW", type: "run", tags: ["run", "draw"], lane: 0, draw: true },
    { name: "QB SNEAK", type: "run", tags: ["run", "short", "goalline"], lane: 0, qbKeep: true },
  ];
  const PASS_PLAYS = OFF_PLAYS.filter((p) => p.type === "pass");
  const RUN_PLAYS = OFF_PLAYS.filter((p) => p.type === "run");
  const ALL_PLAYS = OFF_PLAYS;
  // 10 defensive calls; deep = safeties bail, run = crashes the box, spy = contain the QB
  const DEF_PLAYS = [
    { name: "MAN 2 HIGH", rush: 4, man: true, tags: ["balanced"] },
    { name: "COVER 2 ZONE", rush: 4, man: false, tags: ["balanced"] },
    { name: "ZONE 3 DEEP", rush: 3, man: false, tags: ["deep"] },
    { name: "COVER 4 QUARTERS", rush: 3, man: false, deep: true, tags: ["deep", "long"] },
    { name: "MAN BLITZ", rush: 5, man: true, tags: ["blitz", "short"] },
    { name: "NICKEL BLITZ", rush: 6, man: true, tags: ["blitz", "long"] },
    { name: "ZONE BLITZ", rush: 5, man: false, tags: ["blitz", "medium"] },
    { name: "GOAL-LINE STUFF", rush: 6, man: true, run: true, tags: ["run", "short", "goalline"] },
    { name: "QB SPY", rush: 3, man: true, spy: true, tags: ["spy", "medium"] },
    { name: "TAMPA 2", rush: 4, man: false, tampa: true, tags: ["balanced", "deep"] },
    { name: "PREVENT", rush: 3, man: false, deep: true, prevent: true, tags: ["deep", "long", "prevent"] },
  ];

  // score plays for the current situation and return the N most relevant
  function relevantOffense(n) {
    const toGain = G.toGain, goal = G.losYd + G.toGain >= 100, deep = 100 - G.losYd;
    const late = G.quarter >= 4 && (G.score.A - G.score.B) < 0; // trailing late → pass
    return OFF_PLAYS.map((p) => {
      let s = Math.random() * 0.3;
      if (goal || G.losYd >= 96) { if (p.tags.includes("goalline")) s += 3; if (p.tags.includes("run")) s += 1.2; if (p.tags.includes("quick")) s += 0.8; }
      if (toGain <= 3) { if (p.tags.includes("run") || p.tags.includes("short")) s += 2; if (p.tags.includes("quick")) s += 1; }
      else if (toGain >= 8) { if (p.tags.includes("deep")) s += 2; if (p.tags.includes("medium")) s += 1.2; if (p.tags.includes("run")) s -= 0.4; }
      else { if (p.tags.includes("medium")) s += 1.6; if (p.tags.includes("run")) s += 0.8; }
      if (deep > 60) { if (p.tags.includes("deep")) s += 0.6; }  // backed up: take shots less
      if (late) { if (p.type === "pass") s += 1; }
      return { p, s };
    }).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.p);
  }
  function relevantDefense(n) {
    const toGain = G.toGain, goal = G.losYd + G.toGain >= 100 || G.losYd >= 96;
    const late = G.quarter >= 4 && (G.score.B - G.score.A) < 0; // CPU/opp trailing? prevent when protecting a lead
    const protect = G.quarter >= 4 && (G.score.A - G.score.B) > 0 && G.clock < 40;
    return DEF_PLAYS.map((d) => {
      let s = Math.random() * 0.3;
      if (goal) { if (d.tags.includes("goalline") || d.tags.includes("run")) s += 3; }
      if (toGain <= 3) { if (d.tags.includes("short") || d.tags.includes("run") || d.tags.includes("blitz")) s += 1.8; }
      else if (toGain >= 8) { if (d.tags.includes("long") || d.tags.includes("deep")) s += 2; if (d.tags.includes("blitz")) s += 0.6; }
      else { if (d.tags.includes("balanced") || d.tags.includes("medium")) s += 1.6; }
      if (protect && d.tags.includes("prevent")) s += 2.5;
      if (!protect && d.tags.includes("prevent")) s -= 1;
      return { d, s };
    }).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.d);
  }

  // ---- signature plays: one famous call per franchise -----------------------
  // archetypes:
  //  bomb        — every route goes deep, receivers get a step
  //  hook_lateral— curl underneath with a trailing mate; lateral prompt on catch
  //  power_toss  — wide toss behind a fullback, carrier sheds the first hit
  //  hb_pass     — handoff, but the back can still throw from behind the line
  //  flea_flicker— handoff, auto-pitch back to the QB, then it's all verts
  //  tush_push   — QB sneak with the whole herd shoving (bonus power)
  const SIG_ARCHETYPES = {
    bomb: { type: "pass", routes: { WR1: R.go, WR3: R.post(1), TE: R.seam, WR2: R.go, RB: R.block }, deep: true },
    hook_lateral: { type: "pass", routes: { WR1: R.go, WR3: R.curl, TE: R.curl, WR2: R.drag(-1), RB: R.screen }, lateralHint: true },
    power_toss: { type: "run", lane: 1, fb: true, shed: true },
    hb_pass: { type: "run", lane: -1, hbPass: true },
    flea_flicker: { type: "pass", routes: { WR1: R.go, WR3: R.seam, TE: R.block, WR2: R.go, RB: R.block }, flicker: true, deep: true },
    tush_push: { type: "run", lane: 0, qbKeep: true, shed: true, fb: true },
  };
  const SIGNATURES = {
    ARI: ["HAIL MURRAY", "bomb"], ATL: ["BIJAN SWEEP", "power_toss"],
    BAL: ["LAMAR KEEPER", "tush_push"], BUF: ["13 SECONDS", "bomb"],
    CAR: ["KEEP POUNDING", "power_toss"], CHI: ["BEARS DOWN", "hook_lateral"],
    CIN: ["JOE BRRR SHOT", "bomb"], CLE: ["DAWG CHECK", "hook_lateral"],
    DAL: ["HAIL MARY ORIGINAL", "bomb"], DEN: ["MILE HIGH FLICKER", "flea_flicker"],
    DET: ["SAINTS OF SIX", "hb_pass"], GB: ["4TH & 26", "bomb"],
    HOU: ["BULLS ON PARADE", "power_toss"], IND: ["CATCH & PITCH", "hook_lateral"],
    JAX: ["MYLES GAME", "flea_flicker"], KC: ["CORN DOG", "bomb"],
    LA: ["MATTHEW MAGIC", "flea_flicker"], LAC: ["BOLT BOMB", "bomb"],
    LV: ["SEA OF HANDS", "hook_lateral"], MIA: ["MIAMI MIRACLE", "hook_lateral"],
    MIN: ["MINNEAPOLIS MIRACLE", "bomb"], NE: ["SNOW PLOW SNEAK", "tush_push"],
    NO: ["AMBUSH ONSIDE", "hb_pass"], NYG: ["HELMET CATCH", "bomb"],
    NYJ: ["MONO BOWL TOSS", "power_toss"], PHI: ["PHILLY SPECIAL", "hb_pass"],
    PIT: ["IMMACULATE RECEPTION", "hook_lateral"], SEA: ["BEAST QUAKE", "power_toss"],
    SF: ["THE CATCH", "bomb"], TB: ["BRADY SNEAK", "tush_push"],
    TEN: ["MUSIC CITY MIRACLE", "hook_lateral"], WAS: ["COUNTER TREY", "power_toss"],
  };
  function signaturePlay(abbr) {
    const sig = SIGNATURES[abbr] || ["APEX SPECIAL", "bomb"];
    const arch = SIG_ARCHETYPES[sig[1]];
    return Object.assign({ name: sig[0], sig: true }, arch);
  }

  // one apex rampager per franchise (the biggest, baddest dino on the roster);
  // role decides which starter transforms — some teams rampage on DEFENSE
  const APEX_ROLE = {
    ARI: "TE", ATL: "RB", BAL: "QB", BUF: "QB", CAR: "EDGE", CHI: "LB",
    CIN: "WR1", CLE: "EDGE", DAL: "EDGE", DEN: "CB", DET: "RB", GB: "LB",
    HOU: "WR1", IND: "RB", JAX: "EDGE", KC: "DL", LA: "DL", LAC: "EDGE",
    LV: "EDGE", MIA: "RB", MIN: "WR1", NE: "CB", NO: "RB", NYG: "DL",
    NYJ: "CB", PHI: "RB", PIT: "EDGE", SEA: "LB", SF: "LB", TB: "LB",
    TEN: "RB", WAS: "QB",
  };
  const APEX_DEF_ROLES = ["EDGE", "DL", "LB", "CB", "S"];

  // each franchise's apex rampager gets a passive themed to its real NFL star
  const PASSIVES = {
    cannon: { label: "HOWITZER ARM", desc: "Bombs travel farther, accurate even on the run." },
    escape: { label: "HOUDINI", desc: "Slips would-be sacks and scrambles like the wind." },
    truck: { label: "TRUCKSTICK", desc: "Shrugs off the first two tacklers every carry." },
    burner: { label: "AFTERBURNER", desc: "Game-breaking top-end speed." },
    yac: { label: "YAC MONSTER", desc: "The first tackler almost always whiffs." },
    redzone: { label: "RED-ZONE MAGNET", desc: "Nearly automatic hands inside the 20." },
    sack: { label: "QB HUNTER", desc: "Explodes off the edge; sacks jar the ball loose." },
    wall: { label: "IMMOVABLE", desc: "Collapses the pocket and swats passes." },
    tackle: { label: "HEAT-SEEKER", desc: "Huge tackle radius; erases the run." },
    ballhawk: { label: "BALLHAWK", desc: "Blankets receivers and picks off throws." },
  };
  // team -> star name shown on the hype screen + which passive they carry
  const RAMPAGERS = {
    ARI: ["Trey McBride", "redzone"], ATL: ["Bijan Robinson", "yac"],
    BAL: ["Lamar Jackson", "escape"], BUF: ["Josh Allen", "cannon"],
    CAR: ["Jadeveon Clowney", "sack"], CHI: ["Tremaine Edmunds", "tackle"],
    CIN: ["Ja'Marr Chase", "burner"], CLE: ["Myles Garrett", "sack"],
    DAL: ["Micah Parsons", "sack"], DEN: ["Pat Surtain II", "ballhawk"],
    DET: ["Jahmyr Gibbs", "yac"], GB: ["Quay Walker", "tackle"],
    HOU: ["Nico Collins", "burner"], IND: ["Jonathan Taylor", "truck"],
    JAX: ["Josh Hines-Allen", "sack"], KC: ["Chris Jones", "wall"],
    LA: ["Kobie Turner", "wall"], LAC: ["Khalil Mack", "sack"],
    LV: ["Maxx Crosby", "sack"], MIA: ["De'Von Achane", "burner"],
    MIN: ["Justin Jefferson", "burner"], NE: ["Christian Gonzalez", "ballhawk"],
    NO: ["Alvin Kamara", "yac"], NYG: ["Dexter Lawrence", "wall"],
    NYJ: ["Sauce Gardner", "ballhawk"], PHI: ["Saquon Barkley", "truck"],
    PIT: ["T.J. Watt", "sack"], SEA: ["Ernest Jones", "tackle"],
    SF: ["Fred Warner", "tackle"], TB: ["Lavonte David", "tackle"],
    TEN: ["Tony Pollard", "truck"], WAS: ["Jayden Daniels", "escape"],
  };
  const passiveOf = (abbr) => (RAMPAGERS[abbr] || [null, "truck"])[1];

  // ------------------------------------------------------------------- audio
  let AC = null, muted = false;
  function beep(f, dur, type, vol, delay) {
    if (muted) return;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = AC.currentTime + (delay || 0);
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square"; o.frequency.value = f;
      g.gain.setValueAtTime(vol || 0.06, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  // looping crowd bed — swells in close 4th quarters and after big plays
  let crowdGain = null, crowdSpike = 0;
  let cheerBusy = 0;
  function initCrowd() {
    if (crowdGain || !AC) return;
    try {
      const sr = AC.sampleRate;
      crowdGain = AC.createGain(); crowdGain.gain.value = 0;
      crowdGain.connect(AC.destination);
      // layer 1: deep stadium rumble (brown-ish noise, slow swells baked in)
      const len = sr * 4;
      const buf = AC.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.025 * white) / 1.025;             // brown noise
        const swell = 0.7 + 0.3 * Math.sin(i / sr * 0.9) * Math.sin(i / sr * 2.3);
        d[i] = last * 9 * swell;
      }
      const bed = AC.createBufferSource(); bed.buffer = buf; bed.loop = true;
      const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
      bed.connect(lp); lp.connect(crowdGain); bed.start();
      // layer 2: "ten thousand voices" — band-passed noise that flutters
      const buf2 = AC.createBuffer(1, sr * 3, sr);
      const d2 = buf2.getChannelData(0);
      for (let i = 0; i < d2.length; i++) {
        const flutter = 0.5 + 0.5 * Math.sin(i / sr * 5.3) * Math.sin(i / sr * 13.7 + 1.7);
        d2[i] = (Math.random() * 2 - 1) * 0.5 * flutter;
      }
      const voices = AC.createBufferSource(); voices.buffer = buf2; voices.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 950; bp.Q.value = 0.7;
      const vg = AC.createGain(); vg.gain.value = 0.55;
      voices.connect(bp); bp.connect(vg); vg.connect(crowdGain); voices.start();
      // layer 3: the CHANT band — a brighter human-register shimmer that
      // pulses in a stadium-chant rhythm, so the bed reads as cheering,
      // not machinery
      const buf3 = AC.createBuffer(1, sr * 4, sr);
      const d3 = buf3.getChannelData(0);
      for (let i = 0; i < d3.length; i++) {
        const t = i / sr;
        const chant = Math.max(0, Math.sin(t * Math.PI * 1.6)) ** 2;         // DUH... DUH... rhythm
        const shimmer = 0.6 + 0.4 * Math.sin(t * 31 + Math.sin(t * 7) * 2);
        d3[i] = (Math.random() * 2 - 1) * 0.4 * (0.35 + 0.65 * chant) * shimmer;
      }
      const chant = AC.createBufferSource(); chant.buffer = buf3; chant.loop = true;
      const bp3 = AC.createBiquadFilter(); bp3.type = "bandpass"; bp3.frequency.value = 1500; bp3.Q.value = 1.1;
      const cg = AC.createGain(); cg.gain.value = 0.4;
      chant.connect(bp3); bp3.connect(cg); cg.connect(crowdGain); chant.start();
    } catch (e) { /* audio unavailable */ }
  }
  // an actual CHEER: a two-layer roar — a wall of voices that sweeps UP in
  // pitch as everyone leaps to their feet, plus clap/whistle transients
  function crowdCheer(intensity) {
    if (!AC || muted || cheerBusy > AC.currentTime - 0.4) return;
    try {
      cheerBusy = AC.currentTime;
      const sr = AC.sampleRate, dur = 2.0 + intensity * 1.3;
      const buf = AC.createBuffer(1, sr * dur, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.18) * Math.exp(-Math.max(0, t - 0.5) * 1.1);
        // individual "voices" flutter at different rates → a living roar
        const flutter = 0.55 + 0.25 * Math.sin(t * 23) + 0.2 * Math.sin(t * 9.7 + 2);
        d[i] = (Math.random() * 2 - 1) * env * flutter;
      }
      const src = AC.createBufferSource(); src.buffer = buf;
      // the roar's center frequency SWEEPS UP — the sound of a crowd rising
      const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.6;
      bp.frequency.setValueAtTime(550, AC.currentTime);
      bp.frequency.exponentialRampToValueAtTime(1200 + intensity * 500, AC.currentTime + 0.5);
      bp.frequency.exponentialRampToValueAtTime(700, AC.currentTime + dur);
      const g = AC.createGain(); g.gain.value = 0.2 * (0.7 + intensity);
      src.connect(bp); bp.connect(g); g.connect(AC.destination);
      src.start();
      // clap spray: dozens of tiny snaps scattered through the roar
      for (let i = 0; i < 14; i++) {
        beep(1800 + Math.random() * 1400, 0.03, "square", 0.012, Math.random() * (0.8 + intensity * 0.6));
      }
      // a couple of long two-finger whistles over the top
      for (let i = 0; i < 2; i++) beep(2100 + Math.random() * 500, 0.35, "sine", 0.02, 0.2 + i * 0.5);
      // scattered airhorn-ish whoops
      for (let i = 0; i < 3; i++) beep(300 + Math.random() * 500, 0.3, "triangle", 0.02, 0.15 + i * 0.22);
    } catch (e) { /* ignore */ }
  }

  const sfx = {
    snap: () => beep(200, 0.07, "square", 0.05),
    throw: () => { beep(500, 0.09, "square", 0.05); beep(700, 0.07, "square", 0.04, 0.05); },
    bullet: () => beep(900, 0.12, "sawtooth", 0.05),
    catch: () => beep(660, 0.1, "square", 0.06),
    tackle: () => beep(120, 0.12, "sawtooth", 0.08),
    whistle: () => { beep(1400, 0.25, "triangle", 0.05); beep(1400, 0.18, "triangle", 0.05, 0.3); },
    td: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, "square", 0.07, i * 0.13)),
    pick: () => [700, 500, 350].forEach((f, i) => beep(f, 0.13, "square", 0.07, i * 0.11)),
    roar: () => { beep(80, 0.5, "sawtooth", 0.16); beep(55, 0.6, "sawtooth", 0.14, 0.1); },
    kick: () => beep(300, 0.1, "square", 0.06),
    juke: () => beep(880, 0.05, "square", 0.04),
    firstdown: () => [600, 800].forEach((f, i) => beep(f, 0.1, "square", 0.06, i * 0.1)),
  };

  // ------------------------------------------------------------------- state
  const cv = document.getElementById("game");
  const cx = cv.getContext("2d");
  cx.imageSmoothingEnabled = false;

  const G = {
    state: "loading",
    rosters: null, season: null,
    my: null, opp: null, sheets: {}, ball: null, ballSpr: null,
    score: { A: 0, B: 0 }, quarter: 1, clock: 120, drive: "A",
    losYd: 25, down: 1, toGain: 10, openingDrive: "A",
    weather: { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 72 },
    rampage: { A: 0, B: 0 }, ramp: null, // {team, t}
    players: [], carrier: null, phase: "idle", playT: 0,
    callsheet: [], playIdx: 0, curPlay: null, defCall: DEF_PLAYS[0],
    aim: null, // {x, y}
    kick: null, // {kind, stage, t, power, acc}
    banner: null, deadT: 0, deadNext: null,
    camX: 0, shake: 0, selA: 0, selB: 0, selStep: 0,
    parts: [], pteros: [], crowd: null, ot: false,
    help: false, controlled: null, tabIdx: 0,
    stats: { passYds: 0, rushYds: 0, tds: 0 },
    msg: "",
    tape: [], replay: null,
    diff: parseInt(localStorage.getItem("dinobowl_diff") || "1", 10),
    record: JSON.parse(localStorage.getItem("dinobowl_record") || '{"w":0,"l":0,"t":0}'),
  };
  const DIFFS = [
    { name: "HATCHLING", defSpd: 0.92, cpuThink: 1.35, catchBonus: 0.08 },
    { name: "VETERAN", defSpd: 1.0, cpuThink: 1.0, catchBonus: 0 },
    { name: "APEX", defSpd: 1.07, cpuThink: 0.75, catchBonus: -0.06 },
  ];
  const diff = () => DIFFS[G.diff] || DIFFS[1];
  function saveRecord() {
    localStorage.setItem("dinobowl_record", JSON.stringify(G.record));
    localStorage.setItem("dinobowl_diff", String(G.diff));
  }
  window.__game = G; // for debugging / automated tests
  window.addEventListener("error", (e) => { G.lastErr = e.message + " @ " + e.lineno; });

  const keys = {};
  let mouse = { x: 0, y: 0, down: false };

  // --------------------------------------------------------- online play
  // The host is authoritative: it simulates the play and streams a compact
  // render state; the guest sends controls only while team B has the ball.
  // This avoids physics desync while keeping the normal possession-based game.
  const Net = { role: null, room: null, db: null, lastFrame: 0, remoteView: false, inputRef: null };
  const netStatus = (text) => { const el = document.getElementById("online-status"); if (el) el.textContent = "ONLINE: " + text; };
  const roomId = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join("").slice(0, 10);
  const cleanNet = (v) => JSON.parse(JSON.stringify(v, (key, value) => {
    if (["engaged", "cover", "controlled", "sheets", "ballSpr", "crowd", "tape", "replay", "deadNext"].includes(key)) return undefined;
    return typeof value === "function" ? undefined : value;
  }));
  function netFrame() {
    const carrier = G.players.indexOf(G.carrier), rampEnt = G.ramp && G.players.indexOf(G.ramp.ent);
    return cleanNet({
      state: G.state, my: G.my, opp: G.opp, homeAbbr: G.homeAbbr, score: G.score,
      quarter: G.quarter, clock: G.clock, drive: G.drive, losYd: G.losYd, down: G.down, toGain: G.toGain,
      weather: G.weather, stadium: G.stadium, rampage: G.rampage, ramp: G.ramp ? Object.assign({}, G.ramp, { ent: rampEnt }) : null,
      players: G.players, ball: G.ball, carrier, phase: G.phase, playT: G.playT, callsheet: G.callsheet,
      playIdx: G.playIdx, curPlay: G.curPlay, defCall: G.defCall, aim: G.aim, kick: G.kick, banner: G.banner,
      deadT: G.deadT, camX: G.camX, shake: G.shake, parts: G.parts, pteros: G.pteros, ot: G.ot,
      stats: G.stats, gameStats: G.gameStats, patMode: G.patMode, clockStopped: G.clockStopped, humanB: true
    });
  }
  function applyNetFrame(f) {
    if (!f) return;
    const teamChanged = f.my && (G.my !== f.my || G.opp !== f.opp);
    Object.assign(G, f);
    G.carrier = f.carrier >= 0 ? G.players[f.carrier] : null;
    if (G.ramp && typeof G.ramp.ent === "number") G.ramp.ent = G.players[G.ramp.ent];
    if (teamChanged && TEAMS[G.my] && TEAMS[G.opp]) {
      G.sheets.A = DinoSprites.buildTeamSprites(TEAMS[G.my][1], TEAMS[G.my][2]);
      G.sheets.B = DinoSprites.buildTeamSprites(TEAMS[G.opp][1], TEAMS[G.opp][2]);
      if (G.stadium) buildCrowd(TEAMS[G.stadium.home][1]);
    }
  }
  async function startOnlineHost() {
    if (!window.DINO_BOWL_FIREBASE_CONFIG || !window.firebase) { alert("Online multiplayer needs FIREBASE_WEB_CONFIG. See README."); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.DINO_BOWL_FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      Net.role = "host"; Net.room = roomId(); Net.db = firebase.database();
      const ref = Net.db.ref("dinobowl/rooms/" + Net.room);
      await ref.set({ meta: { createdAt: firebase.database.ServerValue.TIMESTAMP, version: 1, hostUid: firebase.auth().currentUser.uid }, frame: netFrame() });
      Net.inputRef = ref.child("inputs");
      Net.inputRef.on("child_added", (snap) => { const input = snap.val(); snap.ref.remove(); if (input) applyRemoteInput(input); });
      history.replaceState(null, "", location.pathname + "?room=" + Net.room);
      netStatus("HOST · SHARE LINK");
      navigator.clipboard && navigator.clipboard.writeText(location.href).catch(() => { });
      alert("Room ready. The invite link is in your address bar (and copied when permitted). Choose your teams, then have your friend open it.");
    } catch (err) { console.error(err); alert("Could not start online room: " + err.message); }
  }
  async function joinOnlineRoom(id) {
    if (!window.DINO_BOWL_FIREBASE_CONFIG || !window.firebase) { netStatus("CONFIG REQUIRED"); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.DINO_BOWL_FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      Net.role = "guest"; Net.room = id; Net.db = firebase.database(); Net.remoteView = true;
      const ref = Net.db.ref("dinobowl/rooms/" + id);
      ref.child("frame").on("value", (snap) => applyNetFrame(snap.val()));
      Net.inputRef = ref.child("inputs"); netStatus("CONNECTED · TEAM B");
    } catch (err) { console.error(err); netStatus("JOIN FAILED"); alert("Could not join this room: " + err.message); }
  }
  function canControlHere() {
    if (!Net.role) return true;
    if (Net.role === "guest") return G.drive === "B" && ["playcall", "presnap", "live", "kick", "ptchoice"].includes(G.state);
    return G.drive !== "B" || !["playcall", "presnap", "live", "kick", "ptchoice"].includes(G.state);
  }
  function sendRemoteInput(input) { if (Net.inputRef) Net.inputRef.push(input); }
  function applyRemoteInput(i) {
    if (Net.role !== "host" || G.drive !== "B") return;
    if (i.type === "key") { keys[i.key] = true; onKey(i.key); }
    if (i.type === "keyup") keys[i.key] = false;
    if (i.type === "move") { mouse.x = i.x; mouse.y = i.y; }
    if (i.type === "press") { mouse.x = i.x; mouse.y = i.y; mouse.down = true; onPress(); }
    if (i.type === "release") { mouse.x = i.x; mouse.y = i.y; mouse.down = false; onRelease(); }
    if (i.type === "alt") { mouse.x = i.x; mouse.y = i.y; onAltFire(); }
  }
  function onlineInput(input) {
    if (!Net.role) return false;
    if (Net.role === "guest") { if (canControlHere()) sendRemoteInput(input); return true; }
    return !canControlHere();
  }
  const initialRoom = new URLSearchParams(location.search).get("room");
  if (initialRoom) joinOnlineRoom(initialRoom);
  else if (window.DINO_BOWL_FIREBASE_CONFIG) netStatus("READY");

  // ------------------------------------------------------------------ input
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  cv.addEventListener("mousemove", (e) => {
    const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y;
    if (Net.role === "guest" && canControlHere() && performance.now() - (Net.lastMove || 0) > 45) {
      Net.lastMove = performance.now(); sendRemoteInput({ type: "move", x: p.x, y: p.y });
    }
  });
  cv.addEventListener("mousedown", (e) => {
    const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y;  // aim where you actually clicked
    if (onlineInput(e.button === 2 ? { type: "alt", x: p.x, y: p.y } : { type: "press", x: p.x, y: p.y })) return;
    if (!AC) sfx.snap();
    if (e.button === 2) { onAltFire(); return; }
    mouse.down = true; onPress();
  });
  cv.addEventListener("mouseup", (e) => { const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y; });
  cv.addEventListener("mouseup", (e) => { if (e.button === 0) { if (onlineInput({ type: "release", x: mouse.x, y: mouse.y })) return; mouse.down = false; onRelease(); } });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab"].includes(e.key)) e.preventDefault();
    if (keys[e.key.toLowerCase()]) return;
    keys[e.key.toLowerCase()] = true;
    if (onlineInput({ type: "key", key: e.key.toLowerCase() })) keys[e.key.toLowerCase()] = false;
    else onKey(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
    if (Net.role === "guest" && canControlHere()) sendRemoteInput({ type: "keyup", key: e.key.toLowerCase() });
  });

  // ------------------------------------------------------ touch (iOS/iPadOS)
  // left of screen = movement joystick; right = aim/drag; on-screen buttons for actions
  const touches = {};                 // id -> {role, ...}
  G.touch = false; G.touchMove = { x: 0, y: 0 };   // flips true on the first real touch
  function canvasPosT(t) {
    const r = cv.getBoundingClientRect();
    return { x: (t.clientX - r.left) * (W / r.width), y: (t.clientY - r.top) * (H / r.height) };
  }
  const controllableNow = () => G.state === "live" &&
    ((offenseIsUser() && (G.phase === "drop" || (G.phase === "carry" && G.controlled === G.carrier))) ||
      (!offenseIsUser() && G.controlled));
  function onTouchStart(e) {
    e.preventDefault();
    G.touch = true;                   // reveal on-screen controls for touch players
    for (const t of e.changedTouches) {
      const p = canvasPosT(t);
      const btn = touchButtonAt(p);
      if (btn) { touches[t.identifier] = { role: "btn", id: btn.id }; pressTouchButton(btn.id); continue; }
      // movement joystick on the left half during live control
      if (controllableNow() && p.x < W * 0.42) {
        touches[t.identifier] = { role: "move", ox: p.x, oy: p.y };
        continue;
      }
      // otherwise a tap/aim like the mouse
      touches[t.identifier] = { role: "aim" };
      mouse.x = p.x; mouse.y = p.y; mouse.down = true; onPress();
    }
  }
  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tr = touches[t.identifier]; if (!tr) continue;
      const p = canvasPosT(t);
      if (tr.role === "move") {
        const dx = p.x - tr.ox, dy = p.y - tr.oy, m = Math.hypot(dx, dy) || 1, mag = Math.min(1, m / 44);
        G.touchMove = { x: (dx / m) * mag, y: (dy / m) * mag };
      } else if (tr.role === "aim") { mouse.x = p.x; mouse.y = p.y; }
    }
  }
  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tr = touches[t.identifier]; if (!tr) continue;
      delete touches[t.identifier];
      if (tr.role === "move") G.touchMove = { x: 0, y: 0 };
      else if (tr.role === "aim") { mouse.down = false; onRelease(); }
    }
  }
  cv.addEventListener("touchstart", onTouchStart, { passive: false });
  cv.addEventListener("touchmove", onTouchMove, { passive: false });
  cv.addEventListener("touchend", onTouchEnd, { passive: false });
  cv.addEventListener("touchcancel", onTouchEnd, { passive: false });

  const kdir = () => {
    if (G.touchMove && (G.touchMove.x || G.touchMove.y)) return { x: G.touchMove.x, y: G.touchMove.y };
    return {
      x: (keys["d"] || keys["arrowright"] ? 1 : 0) - (keys["a"] || keys["arrowleft"] ? 1 : 0),
      y: (keys["s"] || keys["arrowdown"] ? 1 : 0) - (keys["w"] || keys["arrowup"] ? 1 : 0),
    };
  };

  // --------------------------------------------------------------- utilities
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const spdPx = (r) => 96 + (r - 60) * 1.9;   // rating -> px/s
  const lastName = (n) => {
    const p = (n || "").split(" ").filter((w2) => !["II", "III", "IV", "Jr.", "Jr", "Sr.", "Sr"].includes(w2));
    return p[p.length - 1] || n || "";
  };

  function banner(text, sub, time) {
    G.banner = { text, sub: sub || "", t: time || 1.5 };
  }

  // ------------------------------------------------ 8-bit announcer ticker
  const CALLS = {
    td: ["HE COULD... GO... ALL THE WAY... AND HE DID!", "TOUCHDOWN! ROAR IT OUT!", "SIX POINTS OF PURE CRETACEOUS FURY!", "{P} JUST WENT PREHISTORIC!",
      "TOUCHDOWN! SOMEONE CHECK ON THAT DEFENSE, THEY'RE EXTINCT!", "{P} SCORES! AND THE METEOR CAN'T EVEN STOP HIM!",
      "SIX! MY CO-HOST JUST SWALLOWED HIS MICROPHONE!", "THAT DRIVE TOOK 65 MILLION YEARS TO PAY OFF... WORTH IT!"],
    bigplay: ["HE'S GOT AFTERBURNERS!", "{P} IS A PROBLEM!", "SOMEBODY CALL A PALEONTOLOGIST!", "WARP SPEED, ENGAGED!",
      "{P} RUNS LIKE THE RENT IS DUE!", "THAT'S NOT A DINO, THAT'S A COMET WITH CLEATS!"],
    catch: ["WHAT A GRAB BY {P}!", "STICKY CLAWS!", "HE MOSSED HIM! HE ABSOLUTELY MOSSED HIM!",
      "{P} HAS GLUE FOR BLOOD, FOLKS!", "CAUGHT IT! WITH ARMS THAT TINY!"],
    drop: ["OH NO, RIGHT OFF THE CLAWS!", "THAT ONE HITS THE TURF... AND THE HEART.", "BUTTERFINGERS! DO DINOS HAVE FINGERS?",
      "HE DROPPED IT! HIS MOM DROVE THREE HOURS FOR THIS!", "THE BALL SAID: NOT TODAY, {P}.",
      "T-REX ARMS STRIKE AGAIN. NATURE IS CRUEL."],
    int: ["PICKED OFF! DISASTER!", "{P} SAYS: MINE NOW.", "THE BALL HAS SWITCHED ALLEGIANCES!",
      "INTERCEPTED! THAT PASS WAS ADDRESSED TO THE WRONG ERA!", "{P} JUST FILED FOR CUSTODY OF THAT FOOTBALL!"],
    fumble: ["THE BALL IS LOOSE! CHAOS!", "IT'S ON THE GROUND! SCRAMBLE!", "PEANUT-PUNCHED INTO NEXT WEEK!",
      "THE BALL IS FREE! IT'S NOBODY'S CHILD NOW!", "BUTTER. ABSOLUTE BUTTER. LOOSE BALL!!"],
    sack: ["FLATTENED BEHIND THE LINE!", "THE POCKET HAS COLLAPSED LIKE AN OLD FOSSIL!", "SACK CITY, POPULATION: {P}.",
      "THE QUARTERBACK HAS BEEN FILED UNDER 'SEDIMENT'!", "{P} JUST REDECORATED THE BACKFIELD WITH A QUARTERBACK!",
      "SACKED! THAT ONE'S GOING IN THE MUSEUM!"],
    tackle: ["WRAPPED UP AND PLANTED.", "NOTHING DOING ON THAT ONE.", "STONEWALLED!",
      "PLANTED LIKE A JURASSIC FERN.", "DENIED! THE GROUND WOULD LIKE A WORD."],
    bighit: ["OHHH! THAT HIT REGISTERED ON THE RICHTER SCALE!", "{P} JUST SENT HIM BACK TO THE TRIASSIC!",
      "BONE-RATTLER!! GRANDMA FELT THAT ONE AT HOME!", "DE-CLEATED! HIS ANCESTORS FELT THAT!",
      "{P} HIT HIM SO HARD THE FOSSIL RECORD FLINCHED!"],
    rampage: ["OH NO. OH NO NO NO. HE'S HUGE!", "SOMEONE ANGERED THE APEX!", "RAMPAGE MODE: ENGAGED. GOOD LUCK.",
      "RUN. I'M NOT COMMENTATING, I'M ADVISING: RUN."],
    kickgood: ["RIGHT DOWN BROADWAY!", "THE PTERO SPLITS THE UPRIGHTS!"],
    kickmiss: ["WIDE! OH, THE AGONY!", "SHANKED IT INTO THE MESOZOIC!"],
    soar: ["THE SAFETY TAKES FLIGHT!", "AIR SUPPORT HAS ARRIVED!", "BIRD UP! THIS GAME HAS AIR TRAFFIC CONTROL NOW!"],
    firstdown: ["MOVE THEM CHAINS!", "FRESH SET OF DOWNS, FRESH SET OF PROBLEMS FOR THE DEFENSE!",
      "FIRST DOWN! THE SURVEYORS ARE JOGGING!"],
  };
  function announce(kind, pname) {
    const arr = CALLS[kind]; if (!arr) return;
    let line = arr[(Math.random() * arr.length) | 0];
    line = line.replace("{P}", (pname ? lastName(pname).toUpperCase() : "THAT DINO"));
    G.ticker = { text: "🎙 " + line, t: 3.4 };
  }

  // ------------------------------------------------------------------- boot
  async function boot() {
    try {
      // Static Hosting may ship a pre-generated roster file. The Flask app
      // continues to use its data-backed API; absent either, generic rosters work.
      let d = null;
      for (const url of ["/game/teams.json", "/api/game/teams"]) {
        try { const r = await fetch(url); if (r.ok) { d = await r.json(); break; } } catch (_) { /* try next */ }
      }
      if (!d || d.error) throw new Error((d && d.error) || "Roster data unavailable");
      G.rosters = d.teams; G.season = d.season;
    } catch (e) {
      G.rosters = null; G.msg = "Roster API unavailable — using generic dino rosters.";
      G.season = new Date().getFullYear();
    }
    G.ballSpr = DinoSprites.buildBall(2);
    G.snowSpr = DinoSprites.buildSnowball(2);
    buildCrowd();
    G.state = "title";
  }

  function fallbackRoster(abbr) {
    const mk = (name, pos, role) => ({ name, pos, role, spd: 82, acc: 82, arm: 82, hands: 82, agi: 82, stats: {} });
    return {
      offense: [mk(abbr + " Rex", "QB", "QB"), mk("Swift Claw", "RB", "RB"), mk("Air Raptor", "WR", "WR"),
      mk("Deep Fang", "WR", "WR"), mk("Slot Spike", "WR", "WR"), mk("Big Frill", "TE", "TE")],
      defense: "DL DL DL LB LB DB DB DB".split(" ").map((p, i) => ({ name: "Defender " + (i + 1), pos: p, spd: 80, tkl: 80 })),
      kicker: { name: "Ptero Legsly", leg: 85 }, ovr: 82,
    };
  }
  const rosterBase = (abbr) => (G.rosters && G.rosters[abbr]) || fallbackRoster(abbr);
  // franchise continuity: your draft pick + free agent join the squad, and
  // everyone else's legs age a step each off-season
  const roster = (abbr) => {
    const base = rosterBase(abbr);
    const f = loadFranchise ? loadFranchise() : null;
    let r2 = base, cloned = false;
    if (f && f.team === abbr && G.szn) {
      r2 = JSON.parse(JSON.stringify(base)); cloned = true;
      const agePen = Math.min(4, f.aged || 0);
      for (const p2 of r2.offense) p2.spd = Math.max(58, (p2.spd || 75) - agePen);
      for (const a of (f.adds || [])) {
        const slotPos = a.pos === "FB" ? "RB" : a.pos;
        const group = r2.offense.filter((p2) => p2.pos === slotPos);
        if (group.length && ["QB", "RB", "WR", "TE"].includes(slotPos)) {
          // the newcomer replaces the weakest current option at his position
          let worst = group[0];
          for (const g2 of group) if ((g2.spd + (g2.hands || 70)) < (worst.spd + (worst.hands || 70))) worst = g2;
          const idx = r2.offense.indexOf(worst);
          r2.offense[idx] = Object.assign({}, a, { role: worst.role });
        } else if (r2.defense && r2.defense.length) {
          r2.defense[r2.defense.length - 1] = Object.assign({}, a);
        }
      }
    }
    // in-season development: hot streaks raise a player's ratings, slumps
    // drop them — earned game by game over the year (Retro Bowl style)
    if (G.szn && G.szn.team === abbr && G.szn.dev && Object.keys(G.szn.dev).length) {
      if (!cloned) { r2 = JSON.parse(JSON.stringify(r2)); cloned = true; }
      const applyDev = (p2) => {
        const d = G.szn.dev[p2.name]; if (!d) return;
        for (const f2 of ["spd", "hands", "agi", "acc", "arm", "tkl", "str"]) {
          if (p2[f2] != null) p2[f2] = clamp(p2[f2] + d, 55, 99);
        }
      };
      r2.offense.forEach(applyDev);
      (r2.defense || []).forEach(applyDev);
    }
    return r2;
  };

  function buildCrowd(homeColor) {
    const c = DinoSprites.makeCanvas(FIELD_LEN, 64);
    const g = c.getContext("2d");
    g.fillStyle = "#131a22"; g.fillRect(0, 0, FIELD_LEN, 64);
    const cols = ["#4caf50", "#8a6f3c", "#7a8a99", "#c98f4a", "#d4a373", "#5d8aa8", "#9b6a97"];
    for (let y = 8; y < 60; y += 10) {
      for (let x = 4; x < FIELD_LEN; x += 8) {
        if (Math.random() < 0.85) {
          // half the herd wears the home jersey
          g.fillStyle = homeColor && Math.random() < 0.45 ? homeColor : cols[(Math.random() * cols.length) | 0];
          g.fillRect(x + ((y / 10) % 2) * 3, y, 5, 5);            // dino head
          g.fillRect(x + ((y / 10) % 2) * 3 + 4, y + 1, 2, 2);    // snout
        }
      }
    }
    // home banners
    if (homeColor) {
      g.font = "10px monospace";
      for (let x = 160; x < FIELD_LEN; x += 420) {
        g.fillStyle = homeColor; g.fillRect(x, 26, 92, 14);
        g.fillStyle = "#f4f6f1"; g.fillText("GO HERD!", x + 14, 37);
      }
    }
    G.crowd = c;
  }

  // ---- stadiums: every franchise gets its own park, parameterized ----------
  const DOMES = new Set(["ARI", "ATL", "DAL", "DET", "HOU", "IND", "LA", "LV", "MIN", "NO"]);
  function seedHash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
  function makeStadium(homeAbbr) {
    const h = seedHash(homeAbbr);
    const times = ["day", "dusk", "night"];
    return {
      home: homeAbbr,
      dome: DOMES.has(homeAbbr),
      time: times[(h + (Math.random() * 3 | 0)) % 3],
      skyline: Array.from({ length: 26 }, (_, i) => {
        const hh = seedHash(homeAbbr + i);
        return { w: 20 + hh % 34, h: 14 + (hh >> 3) % 34, gap: 4 + (hh >> 6) % 16 };
      }),
    };
  }
  // real-ish climate: weather follows the stadium's latitude, the month of the
  // season, and the time of day. Weather effects on catches are SMALL — you
  // only notice them over a full game's worth of throws.
  const TEAM_CLIMATE = { // cold / mild / warm (domes never care)
    BUF: "cold", GB: "cold", CHI: "cold", NE: "cold", NYJ: "cold", NYG: "cold",
    PIT: "cold", CLE: "cold", DEN: "cold", KC: "cold", CIN: "cold", PHI: "cold",
    BAL: "mild", WAS: "mild", SEA: "mild", TEN: "mild", CAR: "mild", SF: "mild",
    JAX: "warm", MIA: "warm", TB: "warm", LAC: "warm", NO: "warm", ARI: "warm",
    ATL: "warm", HOU: "warm", DAL: "warm", LA: "warm", LV: "warm", MIN: "cold",
    DET: "cold", IND: "mild",
  };
  const RAINY_TOWNS = new Set(["SEA", "MIA", "TB", "JAX", "NE", "PIT"]); // drizzle capitals
  const MONTHS = ["SEP", "OCT", "NOV", "DEC", "JAN"];
  const monthOfWeek = (wk) => wk <= 4 ? 0 : wk <= 8 ? 1 : wk <= 13 ? 2 : wk <= 17 ? 3 : 4;
  function pickWeather(stadium, week) {
    const wind = { x: rnd(-30, 30), y: rnd(-14, 14) };
    if (stadium && stadium.dome) {
      return { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, dome: true, temp: 72, month: MONTHS[monthOfWeek(week || 1)] };
    }
    const climate = TEAM_CLIMATE[stadium ? stadium.home : "KC"] || "mild";
    const mi = monthOfWeek(week || 1);
    // base temps by climate row and month column (Sep → Jan)
    const BASE = { cold: [60, 48, 38, 26, 20], mild: [70, 60, 50, 42, 38], warm: [84, 76, 68, 60, 56] };
    let temp = BASE[climate][mi] + rnd(-7, 7);
    if (stadium.time === "night") temp -= 8;
    else if (stadium.time === "dusk") temp -= 4;
    temp = Math.round(temp);
    // precipitation odds rise late in the year and in rainy towns
    const precip = 0.18 + mi * 0.06 + (RAINY_TOWNS.has(stadium.home) ? 0.2 : 0);
    let w;
    if (Math.random() < precip) {
      if (temp <= 32) w = { type: "SNOW", wind: { x: wind.x * 1.3, y: wind.y * 1.3 }, catchMod: -0.03, speedMod: 0.88, fumbleMod: 0.02, kickMod: -0.1 };
      else w = { type: "RAIN", wind, catchMod: -0.04, speedMod: 0.94, fumbleMod: 0.04, kickMod: -0.05 };
    } else {
      w = { type: "CLEAR", wind, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0 };
    }
    // freezing fingers: a small extra tax below 32°F
    if (temp <= 32) { w.catchMod -= 0.03; w.fumbleMod += 0.01; }
    w.temp = temp; w.month = MONTHS[mi];
    return w;
  }

  // ---------------------------------------------------------- season mode
  const DIVISIONS = {
    "AFC EAST": ["BUF", "MIA", "NE", "NYJ"], "AFC NORTH": ["BAL", "CIN", "CLE", "PIT"],
    "AFC SOUTH": ["HOU", "IND", "JAX", "TEN"], "AFC WEST": ["DEN", "KC", "LAC", "LV"],
    "NFC EAST": ["DAL", "NYG", "PHI", "WAS"], "NFC NORTH": ["CHI", "DET", "GB", "MIN"],
    "NFC SOUTH": ["ATL", "CAR", "NO", "TB"], "NFC WEST": ["ARI", "LA", "SEA", "SF"],
  };
  const conferenceOf = (ab) => Object.keys(DIVISIONS).find((d) => DIVISIONS[d].includes(ab)).slice(0, 3);
  const divisionOf = (ab) => Object.keys(DIVISIONS).find((d) => DIVISIONS[d].includes(ab));
  const teamOvr = (ab) => roster(ab).ovr || 80;

  // your coaching staff: a head coach, an offensive coordinator and a
  // defensive coordinator, each 1-5 stars. They buff the whole team in-game.
  const COACH_FIRST = ["Sarge", "Doc", "Boomer", "Granite", "Whistles", "Iron", "Chalkboard", "Grumpy", "Coach", "Old Man"];
  const COACH_LAST = ["Rexworth", "Clawson", "Fossilbeck", "Stomparelli", "McJaws", "Tarpit", "Scalechuck", "Roarshach", "Bonesley", "Thunderlizard"];
  function mkCoach(role) {
    const stars = 1 + ((Math.random() * 3) | 0) + (Math.random() < 0.25 ? 1 : 0);   // 1-4, rare 5
    return {
      role, stars: Math.min(5, stars),
      name: COACH_FIRST[(Math.random() * COACH_FIRST.length) | 0] + " " + COACH_LAST[(Math.random() * COACH_LAST.length) | 0],
    };
  }
  const genStaff = () => ({ hc: mkCoach("HC"), oc: mkCoach("OC"), dc: mkCoach("DC") });

  function newSeason(team) {
    const rivals = DIVISIONS[divisionOf(team)].filter((t) => t !== team);
    const others = ABBRS.filter((t) => t !== team && !rivals.includes(t)).sort(() => Math.random() - 0.5);
    const opps = rivals.concat(rivals, others.slice(0, 11)).sort(() => Math.random() - 0.5);
    const records = {};
    ABBRS.forEach((t) => (records[t] = { w: 0, l: 0 }));
    G.szn = {
      team, week: 1, phase: "regular",
      schedule: opps.map((o, i) => ({ opp: o, home: i % 2 === 0 })),
      records, results: [], seasonStats: {}, playoffs: null, champion: null,
      staff: genStaff(), dev: {},
    };
    saveSeason();
  }
  function saveSeason() { if (G.szn) localStorage.setItem("dinobowl_season", JSON.stringify(G.szn)); }
  function loadSeason() {
    try { return JSON.parse(localStorage.getItem("dinobowl_season") || "null"); } catch (e) { return null; }
  }
  function clearSeason() { localStorage.removeItem("dinobowl_season"); }

  function simScore(a, b) { // returns [ptsA, ptsB]
    const edge = (teamOvr(a) - teamOvr(b)) * 0.6;
    const pa = Math.max(0, Math.round(22 + edge + rnd(-12, 12)));
    let pb = Math.max(0, Math.round(22 - edge + rnd(-12, 12)));
    if (pa === pb) pb += Math.random() < 0.5 ? 3 : -Math.min(3, pb);
    return [pa, pb];
  }

  function simWeekOthers() {
    // pair up every team not involved in the user's game and sim results
    const busy = new Set([G.szn.team, G.szn.schedule[G.szn.week - 1] ? G.szn.schedule[G.szn.week - 1].opp : null]);
    const rest = ABBRS.filter((t) => !busy.has(t)).sort(() => Math.random() - 0.5);
    for (let i = 0; i + 1 < rest.length; i += 2) {
      const [pa, pb] = simScore(rest[i], rest[i + 1]);
      if (pa > pb) { G.szn.records[rest[i]].w++; G.szn.records[rest[i + 1]].l++; }
      else { G.szn.records[rest[i + 1]].w++; G.szn.records[rest[i]].l++; }
    }
  }

  function mergeSeasonStats() {
    for (const [k, s] of Object.entries(G.gameStats || {})) {
      if (s.side !== "A") continue;
      const t = G.szn.seasonStats[s.name] || Object.assign({}, s, { games: 0 });
      if (G.szn.seasonStats[s.name]) {
        for (const f of ["passYds", "passTd", "passInt", "cmp", "att", "rushYds", "rushTd", "car", "recYds", "recTd", "rec", "tkl", "sacks", "defInt", "ff"]) t[f] += s[f];
      }
      t.games++;
      G.szn.seasonStats[s.name] = t;
    }
  }

  // performance-driven development: big games nudge a dino's ratings UP a
  // notch, stinkers shave one off — accumulated (and capped) over the season
  function developPlayers() {
    G.szn.dev = G.szn.dev || {};
    for (const s of Object.values(G.gameStats || {})) {
      if (s.side !== "A") continue;
      const score = s.passYds * 0.4 + s.passTd * 25 - s.passInt * 20 + s.rushYds * 0.8 + s.rushTd * 20 +
        s.recYds * 0.8 + s.recTd * 20 + s.rec * 3 + s.tkl * 5 + s.sacks * 20 + s.defInt * 30 + s.ff * 20;
      const touches = s.att + s.car + s.rec + s.tkl + s.sacks;
      let delta = 0;
      if (score >= 90) delta = 1;                       // a genuinely big game
      else if (score < 22 && touches >= 3) delta = -1;  // heavily involved, produced nothing
      if (!delta) continue;
      G.szn.dev[s.name] = clamp((G.szn.dev[s.name] || 0) + delta, -3, 5);
    }
  }

  function seasonAfterGame() {
    const won = G.score.A > G.score.B;
    mergeSeasonStats();
    developPlayers();
    careerXpAfterGame();
    if (G.szn.phase === "regular") {
      const sched = G.szn.schedule[G.szn.week - 1];
      G.szn.results.push({ week: G.szn.week, opp: sched.opp, home: sched.home, my: G.score.A, them: G.score.B });
      if (won) { G.szn.records[G.szn.team].w++; G.szn.records[sched.opp].l++; }
      else { G.szn.records[sched.opp].w++; G.szn.records[G.szn.team].l++; }
      simWeekOthers();
      G.szn.week++;
      if (G.szn.week > 17) startPlayoffs();
    } else if (G.szn.phase === "playoffs") {
      advancePlayoffs(won);
    }
    saveSeason();
  }

  function seeds(conf) {
    return ABBRS.filter((t) => conferenceOf(t) === conf)
      .sort((a, b) => (G.szn.records[b].w - G.szn.records[a].w) || (teamOvr(b) - teamOvr(a)))
      .slice(0, 7);
  }
  function startPlayoffs() {
    const my = G.szn.team;
    const afc = seeds("AFC"), nfc = seeds("NFC");
    const mine = conferenceOf(my) === "AFC" ? afc : nfc;
    const seed = mine.indexOf(my) + 1;
    G.szn.phase = "playoffs";
    G.szn.playoffs = { afc, nfc, round: seed === 1 ? 1 : 0, seed, alive: seed >= 1 && seed <= 7, roundNames: ["WILD CARD", "DIVISIONAL", "CONFERENCE", "DINO BOWL"] };
    if (!G.szn.playoffs.alive || seed < 1) { simRestOfPlayoffs(); }
  }
  function playoffOpp() {
    // a plausible opponent: best remaining seed in conference, or cross-conf in the Dino Bowl
    const p = G.szn.playoffs;
    const my = G.szn.team;
    const conf = conferenceOf(my);
    if (p.round >= 3) {
      const other = conf === "AFC" ? p.nfc : p.afc;
      return other[(Math.random() * 3) | 0];
    }
    const mine = (conf === "AFC" ? p.afc : p.nfc).filter((t) => t !== my);
    return mine[Math.min(mine.length - 1, (Math.random() * (4 - p.round)) | 0)];
  }
  function advancePlayoffs(won) {
    const p = G.szn.playoffs;
    if (!won) {
      p.alive = false;
      simRestOfPlayoffs();
      return;
    }
    if (p.round >= 3) { // won the Dino Bowl!
      G.szn.phase = "done"; G.szn.champion = G.szn.team;
      return;
    }
    p.round++;
  }
  function simRestOfPlayoffs() {
    // someone else lifts the trophy
    const finalists = [seeds("AFC")[0], seeds("NFC")[0]];
    G.szn.champion = finalists[(Math.random() * 2) | 0];
    G.szn.phase = "done";
  }

  function startSeasonGame() {
    let opp, home;
    if (G.szn.phase === "regular") {
      const sched = G.szn.schedule[G.szn.week - 1];
      opp = sched.opp; home = sched.home;
    } else {
      opp = playoffOpp();
      home = G.szn.playoffs.seed <= 2;
      G.szn.playoffs.curOpp = opp;
    }
    G.onGameOver = () => { seasonAfterGame(); };
    startGame({ my: G.szn.team, opp, home });
  }

  // ---------------------------------------------------------- career mode
  const CAREER_POS = [
    ["QB", "troodon"], ["RB", "carno"], ["WR", "veloci"], ["TE", "deino"],
    ["LB", "spino"], ["CB", "deinony"], ["S", "quetz"],
  ];
  const ACCESSORIES = ["NONE", "HEADBAND", "CHAIN", "SPIKES", "SHADES"];
  const NAME_FIRST = ["Rex", "Claw", "Dash", "Spike", "Fang", "Titan", "Blaze", "Echo", "Zilla", "Chomp", "Tank", "Nova"];
  const NAME_LAST = ["McRoar", "Thunderfoot", "Sharptooth", "Longneck", "Ripjaw", "Bonecrusher", "Swiftclaw", "Stomper", "Raptorius", "Fossilfoot", "Meteor", "Cretaceous"];
  const DINOLICK = [
    { q: "A ball and a helmet cost $110 total. The helmet costs $100 more than the ball. The ball costs?", a: ["$10", "$5", "$55", "$100"], c: 1 },
    { q: "What is the 17th letter of the alphabet?", a: ["P", "R", "Q", "S"], c: 2 },
    { q: "A raptor runs 60 yards in 3 seconds. How far in 10 seconds?", a: ["180 yd", "600 yd", "120 yd", "200 yd"], c: 3 },
    { q: "Which number is SMALLEST?", a: ["0.33", "0.303", "0.033", "0.3"], c: 2 },
    { q: "RAPTOR is to PACK as BIRD is to ___", a: ["EGG", "FLOCK", "NEST", "WING"], c: 1 },
    { q: "3 dinos eat 3 goats in 3 minutes. How long do 100 dinos need for 100 goats?", a: ["100 min", "33 min", "3 min", "1 min"], c: 2 },
  ];

  function loadCareer() {
    try { return JSON.parse(localStorage.getItem("dinobowl_career") || "null"); } catch (e) { return null; }
  }
  function saveCareer() { if (G.career) localStorage.setItem("dinobowl_career", JSON.stringify(G.career)); }
  function clearCareer() { localStorage.removeItem("dinobowl_career"); G.career = null; }

  function startCareerFlow() {
    const saved = loadCareer();
    const szn = loadSeason();
    if (saved && szn) { G.mode = "career"; G.career = saved; G.szn = szn; G.state = "hub"; return; }
    G.mode = "career";
    G.cflow = {
      step: "create", row: 0, first: (Math.random() * NAME_FIRST.length) | 0,
      last: (Math.random() * NAME_LAST.length) | 0, posIdx: 0, accIdx: 0,
      quiz: { i: 0, t: 12, score: 0 },
      drill: { idx: 0, t: 0, presses: 0, balls: [], caught: 0, strTries: 0, strSum: 0, barT: 0 },
      ratings: null,
    };
    G.state = "career_create";
  }

  function cName() { return NAME_FIRST[G.cflow.first] + " " + NAME_LAST[G.cflow.last]; }

  function careerKey(k) {
    const c = G.cflow;
    if (G.state === "career_create") {
      if (k === "arrowdown" || k === "s") c.row = (c.row + 1) % 4;
      if (k === "arrowup" || k === "w") c.row = (c.row + 3) % 4;
      const dirn = (k === "arrowright" || k === "d") ? 1 : (k === "arrowleft" || k === "a") ? -1 : 0;
      if (dirn) {
        if (c.row === 0) c.first = (c.first + dirn + NAME_FIRST.length) % NAME_FIRST.length;
        if (c.row === 1) c.last = (c.last + dirn + NAME_LAST.length) % NAME_LAST.length;
        if (c.row === 2) c.posIdx = (c.posIdx + dirn + CAREER_POS.length) % CAREER_POS.length;
        if (c.row === 3) c.accIdx = (c.accIdx + dirn + ACCESSORIES.length) % ACCESSORIES.length;
      }
      if (k === "enter") { G.state = "career_quiz"; c.quiz = { i: 0, t: 14, score: 0 }; }
      return;
    }
    if (G.state === "career_quiz") {
      const n = parseInt(k, 10);
      if (n >= 1 && n <= 4) {
        if (n - 1 === DINOLICK[c.quiz.i].c) { c.quiz.score++; sfx.firstdown(); } else sfx.tackle();
        c.quiz.i++; c.quiz.t = 14;
        if (c.quiz.i >= DINOLICK.length) startDrills();
      }
      return;
    }
    if (G.state === "career_drill") {
      const d = c.drill;
      if (d.idx === 0 && k === " ") { d.presses++; }
      if (d.idx === 2 && (k === " " || k === "enter")) {
        // stop the strength bar
        const v = 50 + 50 * Math.sin(d.barT * 5);
        d.strSum += v; d.strTries++; sfx.kick();
        if (d.strTries >= 3) finishDrills();
      }
      return;
    }
    if (G.state === "career_draft") {
      if (k === "enter" || k === " ") {
        newSeason(G.career.team);
        G.state = "hub";
        saveCareer(); saveSeason();
      }
      return;
    }
  }

  function startDrills() {
    G.cflow.drill = { idx: 0, t: 3.5, presses: 0, balls: [], caught: 0, thrown: 0, strTries: 0, strSum: 0, barT: 0 };
    G.state = "career_drill";
  }
  function updateCareer(dt) {
    const c = G.cflow;
    if (G.state === "career_quiz") {
      c.quiz.t -= dt;
      if (c.quiz.t <= 0) { c.quiz.i++; c.quiz.t = 14; sfx.tackle(); if (c.quiz.i >= DINOLICK.length) startDrills(); }
      return;
    }
    if (G.state !== "career_drill") return;
    const d = c.drill;
    if (d.idx === 0) { // 40-yard dash: mash space
      d.t -= dt;
      if (d.t <= 0) { d.idx = 1; d.t = 14; d.balls = []; d.thrown = 0; }
    } else if (d.idx === 1) { // catch drill: click 6 falling balls
      d.t -= dt;
      if (d.thrown < 6 && Math.random() < dt * 1.4) {
        d.balls.push({ x: rnd(160, W - 160), y: 80, vy: rnd(120, 180), r: 16 });
        d.thrown++;
      }
      for (const b of d.balls) b.y += b.vy * dt;
      d.balls = d.balls.filter((b) => b.y < H - 60);
      if (d.t <= 0 || (d.thrown >= 6 && !d.balls.length)) { d.idx = 2; d.barT = 0; }
    } else if (d.idx === 2) {
      d.barT += dt;
    }
  }
  function careerDrillClick() {
    const d = G.cflow.drill;
    if (d.idx !== 1) return;
    for (const b of d.balls) {
      if (Math.hypot(mouse.x - b.x, mouse.y - b.y) < b.r + 10) { b.y = 9999; d.caught++; sfx.catch(); return; }
    }
  }
  function finishDrills() {
    const c = G.cflow, d = c.drill;
    const iq = c.quiz.score;                        // 0..6
    const spd = clamp(66 + d.presses * 1.4, 60, 99);
    const hands = clamp(64 + d.caught * 6, 60, 99);
    const str = clamp(55 + (d.strSum / Math.max(1, d.strTries)) * 0.42, 55, 99);
    const acc = clamp(62 + iq * 5.5, 60, 99);
    const [pos, species] = CAREER_POS[c.posIdx];
    const ratings = {
      spd: Math.round(spd), hands: Math.round(hands), tkl: Math.round(str),
      acc: Math.round(acc), agi: Math.round((spd + str) / 2), arm: Math.round((acc + str) / 2),
    };
    const ovr = Math.round((ratings.spd + ratings.hands + ratings.tkl + ratings.acc) / 4);
    const round = clamp(8 - Math.floor((ovr - 55) / 5), 1, 7);
    // weaker franchises draft earlier
    const order = ABBRS.slice().sort((a, b) => teamOvr(a) - teamOvr(b));
    const team = order[clamp((round - 1) * 4 + ((Math.random() * 4) | 0), 0, 31)];
    G.career = {
      name: cName(), pos, species, acc: ACCESSORIES[c.accIdx],
      ratings, ovr, round, team, iq,
      xp: 0, level: 1, gamesPlayed: 0, seasonLine: null,
    };
    G.state = "career_draft";
    sfx.td();
  }

  function careerPickTeam() { /* unused — draft assigns the team */ }

  function careerXpAfterGame() {
    if (!G.career) return;
    G.career.gamesPlayed++;
    const s = Object.values(G.gameStats || {}).find((x) => x.side === "A" && x.name === G.career.name);
    if (!s) { G.career.xp += 10; saveCareer(); return; } // showed up, at least
    const gained = s.passYds * 0.5 + s.rushYds + s.recYds + (s.passTd + s.rushTd + s.recTd) * 30 +
      s.tkl * 6 + s.sacks * 25 + s.defInt * 35 + s.ff * 25;
    G.career.xp += Math.round(10 + gained);
    G.career.seasonLine = s;
    while (G.career.xp >= G.career.level * 120) {
      G.career.xp -= G.career.level * 120;
      G.career.level++;
      for (const f of ["spd", "hands", "tkl", "acc", "agi", "arm"]) {
        G.career.ratings[f] = clamp(G.career.ratings[f] + 1, 60, 99);
      }
      banner("LEVEL UP!", G.career.name + " is now level " + G.career.level, 2);
    }
    saveCareer();
  }

  function drawCareer() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    const c = G.cflow;
    if (G.state === "career_create") {
      cx.font = PF(18); cx.fillStyle = "#ffd23f";
      cx.fillText("CREATE YOUR DINO", W / 2, 60);
      const rows = [
        ["FIRST NAME", NAME_FIRST[c.first]],
        ["LAST NAME", NAME_LAST[c.last]],
        ["POSITION", CAREER_POS[c.posIdx][0] + "  (" + CAREER_POS[c.posIdx][1].toUpperCase() + ")"],
        ["BLING", ACCESSORIES[c.accIdx]],
      ];
      rows.forEach(([label, val], i) => {
        const sel = c.row === i;
        cx.font = PF(10); cx.fillStyle = sel ? "#ffd23f" : "#9db0a4";
        cx.fillText(label, W / 2 - 160, 150 + i * 50);
        cx.fillStyle = sel ? "#f4f6f1" : "#9db0a4";
        cx.fillText((sel ? "◀ " : "") + val + (sel ? " ▶" : ""), W / 2 + 120, 150 + i * 50);
      });
      // preview sprite + selected bling
      const sheet = G.sheets.A;
      if (sheet) {
        const spr = sheet[CAREER_POS[c.posIdx][1]];
        const t = performance.now() / 200 | 0;
        cx.drawImage(spr.R[t % 2], W / 2 - 48, 360, 96, 96);
        if (ACCESSORIES[c.accIdx] !== "NONE") drawBlingAt(ACCESSORIES[c.accIdx], W / 2 - 48, 360, 96, 96, 1);
      }
      cx.font = PF(9); cx.fillStyle = "#9db0a4";
      cx.fillText("ARROWS TO EDIT · ENTER = TAKE THE DINOLICK", W / 2, 500);
      return;
    }
    if (G.state === "career_quiz") {
      const qz = c.quiz, item = DINOLICK[Math.min(qz.i, DINOLICK.length - 1)];
      cx.font = PF(14); cx.fillStyle = "#ffd23f";
      cx.fillText("THE DINOLICK — Q" + (qz.i + 1) + "/6", W / 2, 60);
      cx.font = PF(10); cx.fillStyle = "#f4f6f1";
      wrapText(item.q, W / 2, 130, 700, 22);
      item.a.forEach((ans, i) => {
        cx.font = PF(10); cx.fillStyle = "#9db0a4";
        cx.fillText("[" + (i + 1) + "]  " + ans, W / 2, 250 + i * 40);
      });
      // timer bar
      cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 200, 430, 400, 14);
      cx.fillStyle = qz.t < 4 ? "#ff5533" : "#69be28";
      cx.fillRect(W / 2 - 200, 430, 400 * (qz.t / 14), 14);
      cx.font = PF(8); cx.fillStyle = "#9db0a4";
      cx.fillText("SCORE " + qz.score + " — PRESS 1-4", W / 2, 470);
      return;
    }
    if (G.state === "career_drill") {
      const d = c.drill;
      if (d.idx === 0) {
        cx.font = PF(14); cx.fillStyle = "#ffd23f"; cx.fillText("40-YARD DASH", W / 2, 80);
        cx.font = PF(10); cx.fillStyle = "#f4f6f1"; cx.fillText("MASH SPACE!!", W / 2, 130);
        cx.font = PF(26); cx.fillStyle = "#69be28"; cx.fillText(String(d.presses), W / 2, 240);
        cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 200, 300, 400, 16);
        cx.fillStyle = "#e8622c"; cx.fillRect(W / 2 - 200, 300, 400 * Math.max(0, d.t / 3.5), 16);
      } else if (d.idx === 1) {
        cx.font = PF(14); cx.fillStyle = "#ffd23f"; cx.fillText("CATCH DRILL — CLICK THE BALLS", W / 2, 60);
        for (const b of d.balls) cx.drawImage(G.ballSpr, b.x - 8, b.y - 5);
        cx.font = PF(11); cx.fillStyle = "#69be28"; cx.fillText("CAUGHT " + d.caught + "/6", W / 2, H - 60);
      } else {
        cx.font = PF(14); cx.fillStyle = "#ffd23f"; cx.fillText("STRENGTH — STOP AT THE TOP (" + d.strTries + "/3)", W / 2, 80);
        const v = 50 + 50 * Math.sin(d.barT * 5);
        cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 40, 140, 80, 280);
        cx.fillStyle = v > 84 ? "#69be28" : "#e8622c";
        cx.fillRect(W / 2 - 40, 140 + 280 * (1 - v / 100), 80, 280 * (v / 100));
        cx.strokeStyle = "#f4f6f1"; cx.strokeRect(W / 2 - 40, 140, 80, 280);
        cx.font = PF(9); cx.fillStyle = "#9db0a4"; cx.fillText("SPACE TO SLAM", W / 2, 460);
      }
      return;
    }
    if (G.state === "career_draft") {
      const p = G.career;
      cx.font = PF(16); cx.fillStyle = "#ffd23f";
      cx.fillText("THE DINO DRAFT", W / 2, 70);
      cx.font = PF(12); cx.fillStyle = TEAMS[p.team][2];
      cx.fillText("ROUND " + p.round + " — THE " + TEAMS[p.team][0].toUpperCase() + " SELECT…", W / 2, 140);
      cx.font = PF(15); cx.fillStyle = "#f4f6f1";
      cx.fillText(p.name.toUpperCase() + " · " + p.pos, W / 2, 190);
      const sheet = G.sheets.A;
      if (sheet) {
        const spr = sheet[p.species];
        cx.drawImage(spr.R[0], W / 2 - 56, 220, 112, 112);
        if (p.acc && p.acc !== "NONE") drawBlingAt(p.acc, W / 2 - 56, 220, 112, 112, 1);
      }
      cx.font = PF(9); cx.fillStyle = "#9db0a4";
      cx.fillText("SPD " + p.ratings.spd + " · HANDS " + p.ratings.hands + " · STR " + p.ratings.tkl +
        " · ACC " + p.ratings.acc + " · DINOLICK " + p.iq + "/6 · OVR " + p.ovr, W / 2, 370);
      cx.font = PF(11); cx.fillStyle = Math.sin(performance.now() / 300) > 0 ? "#ffd23f" : "#8a6";
      cx.fillText("ENTER = SIGN THE CONTRACT", W / 2, 430);
      return;
    }
  }
  function wrapText(text, x, y, maxW, lh) {
    const words = text.split(" ");
    let line = "", yy = y;
    for (const w2 of words) {
      if (cx.measureText(line + w2).width > maxW) { cx.fillText(line, x, yy); line = w2 + " "; yy += lh; }
      else line += w2 + " ";
    }
    cx.fillText(line.trim(), x, yy);
  }
  function drawCareerHubPanel() {
    const p = G.career;
    cx.font = PF(9); cx.fillStyle = "#ffd23f";
    cx.fillText("★ " + p.name.toUpperCase() + " · " + p.pos + " · LVL " + p.level, W / 2, 330);
    cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 120, 342, 240, 10);
    cx.fillStyle = "#69be28"; cx.fillRect(W / 2 - 120, 342, 240 * clamp(p.xp / (p.level * 120), 0, 1), 10);
    cx.font = PF(7); cx.fillStyle = "#9db0a4";
    cx.fillText("XP " + p.xp + "/" + p.level * 120 + " · SPD " + p.ratings.spd + " HND " + p.ratings.hands + " STR " + p.ratings.tkl, W / 2, 368);
  }
  function drawCareerSummary(y) {
    const p = G.career, s = p.seasonLine;
    cx.font = PF(9); cx.fillStyle = "#ffd23f";
    cx.fillText(p.name.toUpperCase() + " — LVL " + p.level + " · " + p.gamesPlayed + " games", W / 2, y);
    if (s) {
      cx.font = PF(8); cx.fillStyle = "#f4f6f1";
      cx.fillText("last game: " + (s.att ? s.cmp + "/" + s.att + " " + s.passYds + "yd " : "") +
        (s.car ? s.car + "car " + s.rushYds + "yd " : "") + (s.rec ? s.rec + "rec " + s.recYds + "yd " : "") +
        (s.tkl ? s.tkl + "tkl" : ""), W / 2, y + 24);
    }
  }

  // ------------------------------------------------------- game flow control
  function startGame(opts) {
    opts = opts || {};
    G.my = opts.my || ABBRS[G.selA]; G.opp = opts.opp || ABBRS[G.selB];
    G.homeAbbr = opts.home === false ? G.opp : G.my;
    G.sheets.A = DinoSprites.buildTeamSprites(TEAMS[G.my][1], TEAMS[G.my][2]);
    G.sheets.B = DinoSprites.buildTeamSprites(TEAMS[G.opp][1], TEAMS[G.opp][2]);
    G.score = { A: 0, B: 0 }; G.quarter = 1; G.clock = 180; G.ot = false;
    G.rampage = { A: 0, B: 0 }; G.ramp = null;
    G.stadium = makeStadium(G.homeAbbr || G.my);
    // the calendar drives the climate: season/career games use their real week,
    // playoffs are January football, exhibitions land on a random week
    G.gameWeek = (G.szn && (G.mode === "season" || G.mode === "career"))
      ? (G.szn.phase === "playoffs" ? 18 : Math.min(18, G.szn.week))
      : 1 + ((Math.random() * 18) | 0);
    G.weather = pickWeather(G.stadium, G.gameWeek);
    buildCrowd(TEAMS[G.stadium.home][1]);
    G.openingDrive = Math.random() < 0.5 ? "A" : "B";
    G.drive = G.openingDrive;
    G.lastOffSide = null;   // 2-player device-pass tracking
    G.losYd = 25; G.down = 1; G.toGain = 10;
    G.stats = { passYds: 0, rushYds: 0, tds: 0 };
    G.gameStats = {}; G.challengeUsed = false; G.ticker = null;
    G.banner = null;
    // show the pregame hype/lineup screen first; kickoff waits for ENTER/tap
    G.state = "pregame";
    sfx.td();
  }
  function kickoffAfterPregame() {
    const wtxt = G.weather.type === "CLEAR" ? "Clear skies in the Cretaceous." :
      G.weather.type === "RAIN" ? "Rain — slick ball, watch for fumbles!" : "Snow — heavy legs, short passes!";
    banner(TEAMS[G.my][0].toUpperCase() + " vs " + TEAMS[G.opp][0].toUpperCase(), wtxt + "  " + (G.drive === "A" ? "You receive!" : (G.humanB ? "P2 receives!" : "CPU receives!")), 2.4);
    G.state = "dead"; G.deadT = 2.4; G.deadNext = enterPlaycall;
  }

  // ------------------------------------------------------------- practice mode
  function startPractice() {
    G.mode = "practice"; G.practice = true; G.humanB = false; G.career = null;
    G.practiceSide = "A"; // A = offense drill, B = defense drill
    G.my = ABBRS[(Math.random() * 32) | 0];
    do { G.opp = ABBRS[(Math.random() * 32) | 0]; } while (G.opp === G.my);
    G.homeAbbr = G.my;
    G.sheets.A = DinoSprites.buildTeamSprites(TEAMS[G.my][1], TEAMS[G.my][2]);
    G.sheets.B = DinoSprites.buildTeamSprites(TEAMS[G.opp][1], TEAMS[G.opp][2]);
    G.score = { A: 0, B: 0 }; G.quarter = 1; G.clock = 900; G.ot = false;
    G.rampage = { A: 100, B: 100 }; G.ramp = null;
    G.stadium = makeStadium(G.my); G.stadium.dome = false; G.stadium.time = "day";
    G.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 70 };
    buildCrowd(TEAMS[G.my][1]);
    G.gameStats = {}; G.stats = { passYds: 0, rushYds: 0, tds: 0 };
    G.drive = "A"; G.losYd = 35; G.down = 1; G.toGain = 10;
    banner("PRACTICE FIELD", "No clock, no pressure — try everything!", 1.6);
    G.state = "dead"; G.deadT = 1.6; G.deadNext = enterPlaycall;
  }
  function practiceReset() {
    // endless reps: recenter and keep going, alternating a fresh 1st down
    G.drive = G.practiceSide;
    G.losYd = G.practiceSide === "A" ? 35 : 65;
    G.down = 1; G.toGain = 10;
    G.rampage.A = 100; G.rampage.B = 100;
    enterPlaycall();
  }
  function togglePracticeSide() {
    G.practiceSide = G.practiceSide === "A" ? "B" : "A";
    banner(G.practiceSide === "A" ? "OFFENSE DRILL" : "DEFENSE DRILL",
      G.practiceSide === "A" ? "Pass, run, juke, lateral, RAMPAGE" : "Control ▼ · dive, F punch, SHIFT soar, RAMPAGE", 1.4);
    G.state = "dead"; G.deadT = 1.2; G.deadNext = practiceReset;
  }

  // which side is human? A is always human; B is human only in local 2-player
  const isHuman = (side) => side === "A" ? true : (!!G.humanB || (G.practice && false));
  const other = (side) => side === "A" ? "B" : "A";
  const teamAbbrOf = (side) => side === "A" ? G.my : G.opp;

  function enterPlaycall() {
    if (G.patMode) {
      // a conversion try exists outside the clock entirely
    } else if (!G.practice) {
      if (G.clock <= 0) { endQuarter(); return; }
      if (G.clockStopped) G.clockStopped = false;      // OOB/incompletion froze it
      else G.clock = Math.max(0, G.clock - 14);
    } else { G.rampage.A = 100; G.rampage.B = 100; }  // always available to try
    G.phase = "idle"; G.aim = null; G.kick = null;
    G.pendingOff = null; G.pendingDef = null;
    // 2-player: hand the device to whoever now has the ball
    if (G.humanB && G.drive !== G.lastOffSide) {
      G.lastOffSide = G.drive;
      const who = G.drive === "A" ? "PLAYER 1" : "PLAYER 2";
      const tm = TEAMS[teamAbbrOf(G.drive)][0].toUpperCase();
      banner(who + " — " + tm + " BALL", "Pass the device · you're on offense", 1.9);
      G.state = "dead"; G.deadT = 2.0; G.deadNext = askOffense; return;
    }
    askOffense();
  }
  function askOffense() {
    if (isHuman(G.drive)) {
      // 4 situational calls; the franchise signature and your custom
      // "MY PLAY" only ROTATE IN sometimes instead of hogging half the
      // sheet on every single snap
      const sheet = relevantOffense(4);
      if (Math.random() < 0.35) sheet[3] = signaturePlay(teamAbbrOf(G.drive));
      const mine = customPlay();
      if (mine && Math.random() < 0.3) sheet[2] = mine;
      G.callsheet = sheet;
      G.callFor = G.drive;
      G.state = "playcall";
    } else {
      const off = cpuChooseOff();
      if (!off) return;                        // CPU chose a kick (handles its own flow)
      G.pendingOff = off; askDefense();
    }
  }
  function askDefense() {
    // a human calls the defensive scheme only in single-player while defending;
    // in 2-player the defense is CPU-run (alternating offensive possessions)
    if (defenseHumanSteers()) {
      G.callsheet = relevantDefense(4);
      G.callFor = other(G.drive);
      G.state = "defcall";
    } else {
      G.pendingDef = cpuChooseDef();
      commitPlay();
    }
  }
  function commitPlay() {
    G.curPlay = G.pendingOff; G.defCall = G.pendingDef;
    enterPresnap();
  }

  function cpuChooseOff() {
    if (G.down === 4 && !G.patMode) {
      const fgDist = 100 - G.losYd + 17;
      if (fgDist <= 50) { enterKick("FG"); return null; }
      if (G.losYd < 58 || G.toGain > 2) { enterKick("PUNT"); return null; }
    }
    // pick from the situationally-relevant set with a little noise —
    // and never run the exact same call back-to-back
    let pool = relevantOffense(5);
    if (pool.length > 1 && G.cpuLastOff) pool = pool.filter((p) => p.name !== G.cpuLastOff);
    const short = G.toGain <= 3;
    // a real coordinator runs it ~42% of the time (more on short yardage); the
    // pool is topped up with runs so the ground game actually shows up
    let runs = pool.filter((p) => p.type === "run"), passes = pool.filter((p) => p.type === "pass");
    if (!runs.length) runs = RUN_PLAYS.slice();
    let choice;
    if ((Math.random() < (short ? 0.58 : 0.42)) && runs.length) choice = runs[(Math.random() * runs.length) | 0];
    else choice = (passes[0] ? passes : pool)[(Math.random() * (passes.length || pool.length)) | 0];
    G.cpuLastOff = choice && choice.name;
    return choice;
  }
  function cpuChooseDef() {
    const pool = relevantDefense(4);
    // the CPU coordinator scouts YOUR tendencies: a pass-happy stretch pulls
    // coverage/blitz calls, ground-and-pound pulls run-stuffers
    const recent = G.recentOff || [];
    if (recent.length >= 3) {
      const rate = recent.filter((t) => t === "pass").length / recent.length;
      const want = rate > 0.7 ? ["deep", "long", "blitz"] : rate < 0.3 ? ["run", "short", "goalline"] : null;
      if (want && Math.random() < 0.55) {
        const counter = DEF_PLAYS.filter((d) => d.tags.some((tg) => want.includes(tg)));
        if (counter.length) return counter[(Math.random() * counter.length) | 0];
      }
    }
    return pool[(Math.random() * pool.length) | 0];
  }

  // user selected a play card (offense or defense); advance the pipeline
  function choosePlay(play, isDefenseCard) {
    if (isDefenseCard) { G.pendingDef = play; commitPlay(); return; }
    G.pendingOff = play;
    askDefense();
  }

  function enterPresnap() {
    G.ramp = null; // a rampage never outlives the play
    buildPlayers();
    G.state = "presnap"; G.phase = "presnap"; G.playT = 0;
    G.camX = clamp(xAtYd(G.losYd) - 300, 0, FIELD_LEN - W);
  }

  function audible(dir) {
    if (G.drive !== "A") return;
    const i = (ALL_PLAYS.indexOf(G.curPlay) + dir + ALL_PLAYS.length) % ALL_PLAYS.length;
    G.curPlay = ALL_PLAYS[i];
    buildPlayers();
    sfx.juke();
  }

  // -------------------------------------------------------- player entities
  function mkEnt(team, species, name, role, sp, extra) {
    return Object.assign({
      team, species, name: name || "", role: role || "", spd: spdPx(sp || 78),
      x: 0, y: 0, vx: 0, vy: 0, dir: team === "off" ? 1 : -1, animT: Math.random(),
      state: "idle", path: null, pathI: 0, endMode: "stop",
      engaged: null, engageT: 0, staggerT: 0, jukeT: 0, jukeCd: 0, diveT: 0, proneT: 0,
      hands: 75, agi: 75, tkl: 75, acc: 75, arm: 75, controlled: false, cover: null, zone: null,
      tackleCd: 0, soarT: 0, soarCd: 0, soarCharge: 0.35, punching: 0, punchCd: 0, spinCd: 0, throwT: 0, jumpT: 0,
      // unique athletic profile: jump derives from the name so every dino differs
      jump: 55 + (seedHash(name || species) % 30),
    }, extra || {});
  }

  function buildPlayers() {
    const offAb = G.drive === "A" ? G.my : G.opp;
    const defAb = G.drive === "A" ? G.opp : G.my;
    const offR = roster(offAb), defR = roster(defAb);
    const losX = xAtYd(G.losYd);
    const P = [];

    const get = (role, i) => {
      const list = offR.offense.filter((p) => p.role === role);
      return list[i || 0] || offR.offense[0] || { name: "Dino", spd: 78, hands: 78, agi: 78, acc: 78, arm: 78 };
    };
    const qb = get("QB"), rb = get("RB"), wr1 = get("WR", 0), wr2 = get("WR", 1), wr3 = get("WR", 2), te = get("TE");

    // Offensive line: the REAL five, rated by actual size/strength
    const olist = (offR.oline && offR.oline.length ? offR.oline : [0, 1, 2, 3, 4].map(function (i) { return { name: "", str: 74, tkl: 80, spd: 60 }; }));
    for (let i = 0; i < 5; i++) {
      const op = olist[i % olist.length];
      const e = mkEnt("off", "trike", op.name || "", "OL", Math.min(70, op.spd || 60),
        { tkl: op.tkl || 80, str: op.str || 75, jump: op.jump || 60 });
      e.x = losX - 14; e.y = MID - 64 + i * 32; e.state = "block";
      P.push(e);
    }
    // QB: troodon
    const eqb = mkEnt("off", "troodon", qb.name, "QB", qb.spd, { acc: qb.acc, arm: qb.arm, agi: qb.agi, hands: 70, str: qb.str || 72, jump: qb.jump || 65 });
    eqb.x = losX - 46; eqb.y = MID; P.push(eqb);
    // RB: carnotaurus
    const erb = mkEnt("off", "carno", rb.name, "RB", rb.spd, { hands: rb.hands, agi: rb.agi, str: rb.str || 78, jump: rb.jump || 70 });
    erb.x = losX - 84; erb.y = MID + 14; P.push(erb);
    // FB: pachycephalosaurus lead blocker on power plays (subs in for the
    // slot receiver so the offense still fields exactly 11)
    const hasFB = !!(G.curPlay && G.curPlay.fb);
    if (hasFB) {
      const fbP = offR.offense.filter((p) => p.role === "RB")[1] || rb;
      const efb = mkEnt("off", "pachy", fbP.name, "FB", (fbP.spd || 78) - 4, { tkl: 86 });
      efb.x = losX - 60; efb.y = MID + 6; efb.state = "leadblock"; P.push(efb);
    }
    // Receivers: velociraptors; TE: deinocheirus
    const slots = [
      ["WR1", wr1, losX - 10, TOP + 36],
      ["WR3", wr3, losX - 22, TOP + 110],
      ["TE", te, losX - 12, BOT - 120],
      ["WR2", wr2, losX - 10, BOT - 36],
    ];
    for (const [slot, p, x, y] of slots) {
      if (hasFB && slot === "WR3") continue;   // the FB took his snap
      const e = mkEnt("off", slot === "TE" ? "deino" : "veloci", p.name, slot, p.spd, { hands: p.hands, agi: p.agi, str: p.str || 68, jump: p.jump || 72 });
      e.x = x; e.y = y; P.push(e);
    }

    // ---- defense
    const dline = defR.defense.filter((d) => ["DE", "DT", "DL", "NT"].includes(d.pos));
    const edges = dline.filter((d) => d.pos === "DE");
    const tackles = dline.filter((d) => d.pos !== "DE");
    const lb = defR.defense.filter((d) => ["LB", "ILB", "OLB", "MLB"].includes(d.pos));
    const db = defR.defense.filter((d) => ["CB", "DB", "S", "FS", "SAF"].includes(d.pos));
    const dget = (arr, i, fb) => arr[i] || { name: fb, spd: 78, tkl: 78 };
    // a TRUE 11-man defense: 4 down linemen (EDGE-DT-DT-EDGE), 2 LBs and a
    // nickel secondary (3 CBs + 2 safeties) — a real modern base front
    const pick = (arr, i, alt, fbName) => arr[i] || alt || { name: fbName, spd: 78, tkl: 78 };
    const lineSpec = [
      [pick(edges, 0, dline[0], "Edge Dino"), "allo", "EDGE"],
      [pick(tackles, 0, dline[2], "Nose Dino"), "stego", "DL"],
      [pick(tackles, 1, dline[3], "Tackle Dino"), "stego", "DL"],
      [pick(edges, 1, dline[1], "Edge Dino"), "allo", "EDGE"],
    ];
    const lineY = [MID - 60, MID - 20, MID + 20, MID + 60];
    for (let i = 0; i < 4; i++) {
      const [d, species, role] = lineSpec[i];
      const e = mkEnt("def", species, d.name, role, d.spd, { tkl: d.tkl, state: "rush", str: d.str || 82, jump: d.jump || 65 });
      e.x = losX + 16; e.y = lineY[i]; e.state = "rush";
      // edge rushers each bring a signature pass-rush technique (speed / spin / bull)
      if (role === "EDGE") e.rushTech = (e.spd > spdPx(84)) ? "speed" : ((e.str || 82) >= 84 ? "bull" : "spin");
      P.push(e);
    }
    // 2 LB: spinosaurus
    for (let i = 0; i < 2; i++) {
      const d = dget(lb, i, "Backer");
      const e = mkEnt("def", "spino", d.name, "LB", d.spd, { tkl: d.tkl, str: d.str || 78, jump: d.jump || 70 });
      e.x = losX + 90; e.y = MID - 50 + i * 100; e.state = "read"; P.push(e);
    }
    // 5 DB: three deinonychus corners + a strong safety + the soaring
    // quetzalcoatlus free safety patrolling centerfield
    const dbSpec = [
      [TOP + 36, "WR1", "CB", "deinony", 34],
      [BOT - 36, "WR2", "CB", "deinony", 34],
      [TOP + 110, "WR3", "CB", "deinony", 30],
      [BOT - 130, "TE", "S", "deinony", 150],
      [MID, null, "S", "quetz", 230],
    ];
    for (let i = 0; i < 5; i++) {
      const d = dget(db, i, "Cover Dino");
      const [y0, slot, role, species, depth] = dbSpec[i];
      const e = mkEnt("def", species, d.name, role, d.spd, { tkl: d.tkl, str: d.str || 66, jump: d.jump || 80, hands: d.hands || 74 });
      e.x = losX + depth; e.y = y0; e.coverSlot = slot;
      e.state = "cover"; P.push(e);
    }

    // defensive call adjustments
    const call = G.defCall || DEF_PLAYS[0];
    const lbs = P.filter((e) => e.role === "LB");
    // rush count: 4 base (the down linemen) → add LBs as the number climbs;
    // light 3-man rushes drop an edge into coverage
    if (call.rush >= 5 && lbs[0]) lbs[0].state = "rush";
    if (call.rush >= 6 && lbs[1]) lbs[1].state = "rush";
    if (call.rush <= 3) { const ed = P.filter((e) => e.role === "EDGE")[1]; if (ed) ed.state = "read"; }
    if (!call.man) P.filter((e) => e.role === "CB" || e.role === "S").forEach((e, i) => {
      if (e.state === "rush") return;
      e.state = "zone";
      const depth = call.deep ? 300 : 190;
      // corners take the flats/thirds, safeties split the deep halves
      e.zone = { x: losX + depth, y: [TOP + 70, BOT - 70, MID, MID + 110, MID - 110][i] || MID };
      if (e.role === "S") e.zone.x = losX + (call.deep ? 380 : 260);
    });
    // extra-deep safeties on prevent; run-stuff crashes the box; spy shadows the QB
    if (call.deep) P.filter((e) => e.role === "S").forEach((e, i) => { e.y = MID + (i === 0 ? -90 : 90); e.x = losX + (call.prevent ? 320 : 260); });
    if (call.run) P.filter((e) => e.role === "LB" || e.role === "S").forEach((e) => { e.x = Math.min(e.x, losX + 40); e.runStuff = true; });
    if (call.spy) { const s = lbs[0] || P.find((e) => e.role === "LB"); if (s) { s.state = "spy"; } }
    // TAMPA 2: a linebacker bails out and sprints to the deep middle hole
    if (call.tampa) {
      const mlb = lbs[0];
      if (mlb) { mlb.state = "zone"; mlb.zone = { x: losX + 280, y: MID }; }
    }

    // route paths for receivers
    for (const e of P) {
      if (e.team === "off" && ["WR1", "WR2", "WR3", "TE", "RB"].includes(e.role)) e.routeEligible = true;
    }
    if (G.curPlay.type === "pass") {
      for (const e of P) {
        const rt = G.curPlay.routes[e.role];
        if (!rt) continue;
        if (rt.end === "block") { e.state = "block"; continue; }
        e.path = rt.pts.map(([dyd, dy]) => ({ x: e.x + dyd * YPX + 10, y: clamp(e.y + dy, TOP + 10, BOT - 10) }));
        e.endMode = rt.end; e.pathI = 0; e.state = "route";
      }
    } else {
      // RUN play (incl. QB sneak): receivers don't freeze — they release
      // downfield and stalk-block the nearest defender instead of standing still
      for (const e of P) {
        if (e.team === "off" && ["WR1", "WR2", "WR3", "TE"].includes(e.role)) {
          e.state = "runblock";
        }
      }
    }

    // apex rampager: mark the starter whose role matches the franchise pick,
    // and give it that franchise star's signature passive ability
    const offApex = APEX_ROLE[offAb], defApex = APEX_ROLE[defAb];
    for (const e of P) {
      if (e.team === "off" && !APEX_DEF_ROLES.includes(offApex) && e.role === offApex) {
        e.apex = true; e.passive = passiveOf(offAb);
        if (RAMPAGERS[offAb]) e.name = RAMPAGERS[offAb][0];   // the rampager IS the star
      }
      if (e.team === "def" && APEX_DEF_ROLES.includes(defApex) &&
        (e.role === defApex || (defApex === "EDGE" && e.role === "EDGE") || (defApex === "DL" && e.role === "DL"))) {
        if (!P.some((o) => o.apex && o.team === "def")) {
          e.apex = true; e.passive = passiveOf(defAb);
          if (RAMPAGERS[defAb]) e.name = RAMPAGERS[defAb][0];
        }
      }
    }
    // passive: always-on stat/speed tweaks for the apex dino
    for (const e of P) {
      if (!e.apex) continue;
      if (e.passive === "burner") e.spd *= 1.13;
      if (e.passive === "cannon") { e.arm = Math.min(99, e.arm + 12); e.acc = Math.min(99, e.acc + 4); }
      if (e.passive === "escape") e.agi = Math.min(99, e.agi + 12);
      if (e.passive === "tackle") e.tkl = Math.min(99, e.tkl + 10);
      if (e.passive === "ballhawk") { e.spd *= 1.06; e.tkl = Math.min(99, e.tkl + 6); e.jump = 99; }
      if (e.passive === "redzone") { e.hands = Math.min(99, e.hands + 8); e.jump = Math.max(e.jump, 95); }
    }
    // elite-hands receivers and tight ends are the other true leapers
    for (const e of P) {
      if (["WR1", "WR2", "WR3", "TE"].includes(e.role) && e.hands >= 92) e.jump = Math.max(e.jump, 92);
    }

    // career mode: your created dino replaces the starter at their position
    if (G.career && G.mode === "career") {
      const slotFor = { QB: "QB", RB: "RB", WR: "WR1", TE: "TE", LB: "LB", CB: "CB", S: "S" };
      const wantRole = slotFor[G.career.pos];
      const mySide = G.drive === "A" ? "off" : "def";
      const isDef = ["LB", "CB", "S"].includes(G.career.pos);
      if ((mySide === "off") !== isDef) {
        const ent = P.find((e) => e.team === mySide && e.role === wantRole);
        if (ent) {
          ent.name = G.career.name; ent.careerAcc = G.career.acc;
          const r2 = G.career.ratings;
          ent.spd = spdPx(r2.spd); ent.hands = r2.hands; ent.agi = r2.agi;
          ent.acc = r2.acc; ent.arm = r2.arm; ent.tkl = r2.tkl;
          if (isDef) { P.forEach((p) => (p.controlled = false)); ent.controlled = true; G.controlled = ent; }
        }
      }
    }

    // difficulty: the CPU-run side gets faster or slower legs
    const cpuTeam = G.drive === "A" ? "def" : "off";
    for (const e of P) if (e.team === cpuTeam) e.spd *= diff().defSpd;
    // coaching staff (season/career): the OC schemes the offense open, the
    // DC dials up the defense, the HC lifts everybody a touch
    if (G.szn && G.szn.staff && (G.mode === "season" || G.mode === "career")) {
      const st = G.szn.staff;
      for (const e of P) {
        const mine = (e.team === "off") === (G.drive === "A");
        if (!mine) continue;
        e.spd *= 1 + (st.hc.stars || 1) * 0.005;
        if (e.team === "off") {
          e.acc = Math.min(99, e.acc + (st.oc.stars || 1));
          e.hands = Math.min(99, e.hands + (st.oc.stars || 1));
        } else {
          e.tkl = Math.min(99, e.tkl + (st.dc.stars || 1));
          e.spd *= 1 + (st.dc.stars || 1) * 0.004;
        }
      }
    }
    // goal-line conversion defense: everyone keys the ball, edges CONTAIN the
    // rollout so a QB can't just stroll around the corner
    if (G.patMode) {
      const defs2 = P.filter((e) => e.team === "def");
      defs2.forEach((e) => { e.spd *= 1.12; });
      const edges = defs2.filter((e) => e.role === "EDGE");
      edges.forEach((e, i) => { e.contain = true; e.y = MID + (i === 0 ? -70 : 70); });
    }

    G.players = P;
    G.ball = { mode: "held", holder: eqb, x: eqb.x, y: eqb.y, z: 10 };
    G.carrier = null;
    G.controlled = null;
    if (defenseHumanSteers()) {
      // single-player defense: the user drives the (soaring) free safety by default
      const s = P.find((e) => e.team === "def" && e.species === "quetz") ||
        P.find((e) => e.team === "def" && e.role === "S") || P.find((e) => e.team === "def");
      s.controlled = true; G.controlled = s;
    }
  }

  // ----------------------------------------------------------------- snap!
  function snap() {
    G.state = "live"; G.phase = "drop"; G.playT = 0;
    G.tape = []; G.playPass = null; G.aim = null; G.soarAim = null;
    // scouting log for the CPU defensive coordinator
    if (G.curPlay && offenseIsUser()) {
      G.recentOff = (G.recentOff || []).slice(-4);
      G.recentOff.push(G.curPlay.type);
    }
    G.playNo = (G.playNo || 0) + 1;
    G.flickerDone = false; G.lateralHinted = false;
    // a safety who flew last play starts this one on an empty tank —
    // the wings need about a second to recharge before a long flight
    if (G.soarSpent && G.soarSpent.play === G.playNo - 1) {
      for (const e of G.players) {
        if (e.species === "quetz" && sideOf(e) === G.soarSpent.side) e.soarCharge = 0;
      }
    }
    sfx.snap();
    for (const e of G.players) { e.punchedThisPlay = false; e.pressDone = false; e.fdCeleb = 0; }
    const qb = G.players.find((e) => e.role === "QB");
    G.ball.holder = qb;
    // pre-roll this dropback's protection: the pass-rush strength vs the O-line
    // sets a realistic sack chance (a mobile QB is harder to bring down). Only
    // matters for a CPU-run QB; a human QB is sacked by live pressure instead.
    if (qb) {
      const rush = G.players.filter((e) => e.team === "def" && (e.role === "EDGE" || e.role === "DL"));
      const oline = G.players.filter((e) => e.team === "off" && e.role === "OL");
      const rushStr = rush.reduce((s, e) => s + (e.str || 80), 0) / Math.max(1, rush.length);
      const olStr = oline.reduce((s, e) => s + (e.str || 75), 0) / Math.max(1, oline.length);
      const mobility = ((qb.agi || 75) - 75) / 200;
      let sackChance = clamp(0.075 + (rushStr - olStr) / 200 - mobility, 0.02, 0.15);
      qb.sackDoom = Math.random() < sackChance;
      qb.sackAt = rnd(1.1, 2.4);
    }
    if (G.curPlay.type === "run" && !G.curPlay.qbKeep) {
      G.phase = "handoff";
    } else if (G.curPlay.qbKeep) {
      becomeCarrier(qb);
      if (G.curPlay.shed) qb.shedCharges = 2; // tush push: the herd shoves
    }
  }

  function becomeCarrier(e) {
    G.carrier = e; G.ball.holder = e; G.ball.mode = "held";
    G.phase = "carry"; e.state = "carry";
    // teammates stop running routes and block for the man with the ball
    for (const o of G.players) {
      if (o.team === e.team && o !== e && (o.state === "route" || o.state === "idle") && o.role !== "QB") {
        o.state = "runblock"; o.block = null;
      }
    }
    if (G.curPlay) {
      if (G.curPlay.shed && e.shedCharges == null) e.shedCharges = 1;
      if (G.curPlay.lateralHint && !G.lateralHinted && offenseIsUser() && e.team === "off" && e.role !== "RB") {
        G.lateralHinted = true;
        banner("LATERAL READY!", "PRESS Q TO PITCH IT BACK", 0.9);
      }
      // designated halfback-pass trick: leak the QB downfield as an eligible target
      if (G.curPlay.hbPass && e.role === "RB" && !e.hasThrown) {
        const qb = G.players.find((p) => p.role === "QB");
        if (qb && qb !== e) {
          qb.routeEligible = true;
          qb.path = [{ x: qb.x + 12 * YPX, y: clamp(qb.y - 60, TOP + 12, BOT - 12) }];
          qb.pathI = 0; qb.endMode = "go"; qb.state = "route";
        }
      }
    }
    // Any QB or RB with the ball can still throw while behind the line of
    // scrimmage (QB sneak, RB handoff, scramble) — the RB just isn't accurate.
    if ((e.role === "QB" || e.role === "RB") && !e.hasThrown) e.canPass = true;
    // apex passives that trigger on becoming the ball carrier
    if (e.apex && e.carrierPassived !== G.playT) {
      e.carrierPassived = G.playT;
      if (e.passive === "truck") e.shedCharges = (e.shedCharges || 0) + 2;
      if (e.passive === "yac") e.yacCharge = 1;   // first tackler whiffs
    }
    if (offenseIsUser() && e.team === "off") setControlled(e);
  }
  // offense is human-steered when the driving side is human (both sides in 2-player)
  const offenseIsUser = () => (G.drive === "A") ? true : !!G.humanB;
  // a human steers a DEFENDER only in single-player while defending (never in 2-player;
  // there the defending player only calls the scheme and the CPU executes it)
  const defenseHumanSteers = () => !G.humanB && G.drive !== "A";
  function setControlled(e) {
    G.players.forEach((p) => (p.controlled = false));
    if (e) { e.controlled = true; }
    G.controlled = e;
  }

  // ------------------------------------------------------------ throw logic
  function maxRange() {
    const qb = G.players.find((e) => e.role === "QB");
    return (28 + ((qb ? qb.arm : 80) - 60) * 0.55) * YPX;
  }
  // non-QBs (a halfback on a trick play / sneak pitch) throw wobblers
  const passScatter = (p) => (p && p.role !== "QB") ? (G.curPlay && G.curPlay.sweepPass ? 10 : 26) : 0;
  // bad weather shakes the ball loose from the intended spot a little
  const weatherScatter = () => G.weather.type === "SNOW" ? 9 : G.weather.type === "RAIN" ? 7 : 0;
  function throwLob() {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    const to = { x: G.aim.x, y: G.aim.y };
    const d = dist(qb, to);
    const T = 0.5 + d / 620;
    // wind pushes the landing spot
    to.x += G.weather.wind.x * T * 1.6; to.y += G.weather.wind.y * T * 1.6;
    // accuracy scatter: throws land close to where they were aimed — a weak
    // arm or ugly weather widens the cone, but never wildly
    const err = (100 - qb.acc) * 0.3 + weatherScatter() + passScatter(qb);
    to.x += rnd(-err, err); to.y += rnd(-err, err);
    // even a wild throw stays over the field of play (only ~1-in-100 sails OOB)
    if (Math.random() > 0.01) to.y = clamp(to.y, TOP + 10, BOT - 10);
    to.x = clamp(to.x, xAtYd(-8), xAtYd(108));
    G.ball = { mode: "air", kind: "lob", from: { x: qb.x, y: qb.y }, to, t: 0, T, x: qb.x, y: qb.y, z: 12, holder: null };
    G.phase = "air"; G.aim = null; qb.state = "idle"; qb.throwT = 0.3;
    controlIntendedReceiver(to);
    if (G.carrier === qb) { G.carrier = null; qb.canPass = false; qb.hasThrown = true; }
    G.playPass = { passer: qb }; addStat(qb, "att");
    sfx.throw();
  }
  function throwBullet() {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    // bullet locks onto the receiver nearest the aim point
    const rec = eligible().sort((a, b) => dist(a, G.aim) - dist(b, G.aim))[0];
    const tgt = rec ? { x: rec.x + rec.vx * 0.35, y: rec.y + rec.vy * 0.35 } : { x: G.aim.x, y: G.aim.y };
    const err = (100 - qb.acc) * 0.18 + weatherScatter() * 0.6 + passScatter(qb);
    tgt.x += rnd(-err, err); tgt.y += rnd(-err, err);
    if (Math.random() > 0.01) tgt.y = clamp(tgt.y, TOP + 10, BOT - 10);   // stays in play
    tgt.x = clamp(tgt.x, xAtYd(-8), xAtYd(108));
    const d = dist(qb, tgt), T = d / 560;
    G.ball = { mode: "air", kind: "bullet", from: { x: qb.x, y: qb.y }, to: tgt, t: 0, T, x: qb.x, y: qb.y, z: 14, holder: null, target: rec };
    G.phase = "air"; G.aim = null; qb.state = "idle"; qb.throwT = 0.3;
    controlIntendedReceiver(tgt);
    if (G.carrier === qb) { G.carrier = null; qb.canPass = false; qb.hasThrown = true; }
    G.playPass = { passer: qb }; addStat(qb, "att");
    sfx.bullet();
  }
  const eligible = () => G.players.filter((e) => e.team === "off" && e.routeEligible && e.state !== "block" && e !== G.carrier);

  // hand the sticks to the receiver the throw is meant for — move him under
  // the ball and TIME THE JUMP (space/click as it arrives)
  function controlIntendedReceiver(to) {
    if (!offenseIsUser() || G.ball.away) return;
    const rec = eligible().sort((a, b) => dist(a, to) - dist(b, to))[0];
    if (rec && dist(rec, to) < 320) {
      G.players.forEach((p2) => { p2.jumpTimed = false; p2.jumpMistimed = false; });
      setControlled(rec);
    }
  }
  function timedJump(e) {
    if (e.jumpT > 0 || G.ball.mode !== "air") return;
    e.jumpT = 0.4;
    const untilLanding = G.ball.T - G.ball.t;
    if (untilLanding <= 0.35 && untilLanding >= 0.02) e.jumpTimed = true;   // perfect
    else if (untilLanding > 0.6) e.jumpMistimed = true;                     // way early
    sfx.juke();
  }

  // ------------------------------------------------------------ lateral pitch
  // pitch the ball to a point (used by the AI flea-flicker); always backward
  function doLateral(to) {
    const c = G.carrier;
    if (!c || G.state !== "live" || G.phase !== "carry") return;
    const back = (c.team === "off") ? Math.min(to.x, c.x - 6) : Math.max(to.x, c.x + 6);
    to = { x: back, y: clamp(to.y, TOP + 4, BOT - 4) };
    G.ball = { mode: "air", kind: "lateral", from: { x: c.x, y: c.y }, to, t: 0, T: 0.16 + dist(c, to) / 420, x: c.x, y: c.y, z: 14, holder: null };
    c.state = "idle"; c.throwT = 0.22; G.carrier = null; G.phase = "air";
    sfx.throw();
  }
  // user lateral — aimed at the mouse like a throw, but the ball must go
  // backward, it's wild while you're running, and a miss is a live ball.
  function lateral() {
    const c = G.carrier;
    if (!c || G.state !== "live" || G.phase !== "carry") return;
    let to = { x: mouse.x + G.camX, y: clamp(mouse.y, TOP + 6, BOT - 6) };
    const moving = Math.hypot(c.vx, c.vy) > 30;
    const err = moving ? 46 : 15;              // throwing on the run is a gamble
    to.x += rnd(-err, err); to.y += rnd(-err, err);
    doLateral(to);
  }

  // ------------------------------------------------------------- loose ball
  function dropBall(x, y, why) {
    announce("fumble");
    G.ball = { mode: "loose", x, y, z: 8, vx: rnd(-70, 40), vy: rnd(-60, 60), t: 0, holder: null };
    G.carrier = null; G.phase = "loose";
    banner(why || "FUMBLE!", "LIVE BALL!!", 1.0);
    sfx.tackle();
  }
  function recoverBall(e) {
    const offTeam = e.team === "off";
    if (offTeam) {
      becomeCarrier(e);
      banner("RECOVERED!", lastName(e.name) + " falls on it", 0.9);
    } else {
      sfx.pick();
      G.ball.mode = "dead";
      playDead("TURNOVER!", { turnover: true, spotYd: clamp(ydAtX(e.x), 1, 99), by: e.name, fumbleRec: true });
    }
  }

  // ------------------------------------------------------------- catch logic
  function resolveArrival() {
    const b = G.ball;
    const spot = { x: b.to.x, y: b.to.y };
    const recs = eligible().map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    const defs = G.players.filter((e) => e.team === "def").map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    const rec = recs[0], df = defs[0];
    const BASE_CATCH_R = b.kind === "bullet" ? 30 : 34;
    // catch radius reflects the ATHLETE: sure hands extend a receiver's
    // range, a leaper's hops extend a defender's — plus the control bonus
    const recR = BASE_CATCH_R * (rec && rec.e.controlled ? 1.12 : 1) * (rec ? (0.9 + ((rec.e.hands || 75) - 60) / 300) : 1);
    const dfR = BASE_CATCH_R * (df && df.e.controlled ? 1.12 : 1) * (df ? (0.82 + ((df.e.jump || 70) - 55) / 260) : 1);

    // both contesters leap at the ball (guarantees the visual on a real contest)
    if (rec && rec.d < 52) rec.e.jumpT = Math.max(rec.e.jumpT || 0, 0.4);
    if (df && df.d < 52) df.e.jumpT = Math.max(df.e.jumpT || 0, 0.4);

    const completeCatch = (who) => {
      who.x = spot.x; who.y = spot.y;
      who.catchT = G.playT;   // fresh catches are vulnerable to a big hit
      becomeCarrier(who);
      if (G.playPass) { G.playPass.receiver = who; addStat(G.playPass.passer, "cmp"); addStat(who, "rec"); }
      sfx.catch();
    };
    // --- TRUE 50/50 BALL: receiver and defender both in range → they go up
    // together and the better leap comes down with it (your timed jump counts)
    if (rec && df && rec.d < recR && df.d < dfR) {
      const timing = (e) => e.jumpTimed ? 24 : (e.jumpMistimed ? -14 : 0);
      const posScore = (x) => (BASE_CATCH_R - x.d) * 1.5 + ((x.e.jump || 70) - 70) * 0.9 +
        ((x.e.hands || 70) - 70) * 0.6 + timing(x.e) + rnd(0, 16);
      const rs = posScore(rec) + 6;   // receiver ran the route — small edge
      const ds = posScore(df) + (df.e.apex && df.e.passive === "ballhawk" ? 12 : 0);
      if (rs >= ds) {
        let pc = 0.9 - (99 - (rec.e.hands || 75)) * 0.003 + G.weather.catchMod - 0.1 +
          (offenseIsUser() ? 1 : -1) * diff().catchBonus;
        if (rec.e.controlled) pc += 0.10; // +10% catch rate for controlled player
        if (Math.random() < pc) {
          completeCatch(rec.e);
          banner("MOSSED!", lastName(rec.e.name) + " wins the jump ball!", 0.8);
          announce("catch", rec.e.name);
          return;
        }
        if (ds > rs - 10 && Math.random() < 0.3) { intercepted(df.e, spot); return; }
        incomplete(spot, "BROKEN UP!"); return;
      } else {
        if (ds - rs > 12 && Math.random() < 0.5) { intercepted(df.e, spot); return; }
        incomplete(spot, "SWATTED AWAY!"); return;
      }
    }
    // --- solo defender in range: pick odds from closeness (slightly softened)
    if (df && df.d < dfR) {
      const closeness = 1 - df.d / dfR;
      let pickP = (b.kind === "bullet" ? 0.32 : 0.26) * closeness + (df.e.controlled ? 0.14 : 0);
      if (!rec || df.d < rec.d) pickP += 0.15;
      if (df.e.jumpTimed) pickP += 0.22;      // a perfectly timed leap steals it
      if (df.e.jumpMistimed) pickP -= 0.08;
      if (df.e.apex && df.e.passive === "ballhawk") pickP += 0.18;
      if (Math.random() < pickP) { intercepted(df.e, spot); return; }
      if (!rec || df.d < rec.d - 4) { incomplete(spot); return; }
    }
    // --- solo receiver: low, hands-dependent drop rate (a touch friendlier now)
    if (rec && rec.d < recR) {
      let p = 0.82 - (99 - (rec.e.hands || 75)) * 0.005 + G.weather.catchMod + (offenseIsUser() ? 1 : -1) * diff().catchBonus;
      if (rec.e.jumpTimed) p += 0.14;      // a well-timed leap secures it
      if (rec.e.jumpMistimed) p -= 0.10;   // jumping way early bobbles it
      if (b.kind === "bullet") p += 0.03;
      if (rec.e.apex && rec.e.passive === "redzone" && G.losYd >= 80) p += 0.15;
      if (rec.e.controlled) p += 0.10; // +10% catch rate for controlled player
      if (Math.random() < p) {
        completeCatch(rec.e);
        return;
      }
      if (df && df.d < 30 && Math.random() < 0.22) { intercepted(df.e, spot); return; }
      announce("drop", rec.e.name);
      incomplete(spot, "DROPPED!"); return;
    }
    incomplete(spot);
  }
  function incomplete(spot, reason) {
    G.ball.mode = "dead"; G.ball.x = spot.x; G.ball.y = spot.y; G.ball.z = 0;
    playDead(reason || "INCOMPLETE", null, true);
  }
  function intercepted(defender, spot) {
    announce("int", defender.name);
    sfx.pick();
    G.ball.mode = "dead";
    if (G.playPass) addStat(G.playPass.passer, "passInt");
    addStat(defender, "defInt");
    playDead("INTERCEPTED!", { turnover: true, spotYd: clamp(ydAtX(spot.x), 1, 99), by: defender.name });
  }

  // --------------------------------------------------------------- dead ball
  function playDead(reason, info, noSpot) {
    if (G.state !== "live") return;
    G.state = "dead"; G.phase = "dead"; sfx.whistle();
    G.aim = null; G.soarAim = null;
    info = info || {};
    // the replay tape keeps rolling briefly past the whistle so the actual
    // TACKLE / landing is on film, and the tackled dino hits the deck
    G.deadRecT = 0.7;
    if (G.carrier && ["TACKLED", "SACKED!", "FLATTENED!"].includes(reason)) {
      G.carrier.proneT = Math.max(G.carrier.proneT || 0, 0.9);
    }
    // remember the call for a possible coach's challenge
    G.lastDead = {
      reason, spotYd: null, losYd: G.losYd, down: G.down, toGain: G.toGain,
      ballYd: clamp(ydAtX(G.ball.x), 1, 99), turnover: !!info.turnover
    };
    // inside the final minute, stepping out of bounds STOPS the clock —
    // no automatic between-play runoff (incompletions already stop it)
    if (G.clock <= 60 && (reason === "OUT OF BOUNDS" || noSpot)) G.clockStopped = true;
    const spotYd = info.spotYd != null ? info.spotYd :
      (noSpot ? G.losYd : clamp(ydAtX(G.carrier ? G.carrier.x : G.ball.x), 0, 100));

    // practice mode: no downs/scoring bookkeeping — just show the result and reset
    if (G.practice) {
      const td = !info.turnover && !noSpot && spotYd >= 100;
      if (td) { sfx.td(); banner("TOUCHDOWN!", "Nice rep — resetting", 1.4); }
      else banner(reason || "PLAY OVER", "practice · next rep · [P] switch drill", 1.3);
      G.deadT = 1.5; G.deadNext = practiceReset;
      return;
    }

    // two-point conversion attempt resolves in one play
    if (G.patMode) {
      G.patMode = false;
      const good = !info.turnover && !noSpot && spotYd >= 100;
      if (good) { G.score[G.drive] += 2; banner("TWO-POINT GOOD!", "", 1.6); sfx.td(); }
      else banner("CONVERSION FAILED", "", 1.6);
      G.deadT = 1.7; G.deadNext = () => { changePossession(25); enterPlaycall(); };
      return;
    }

    // the defense feeds its apex meter on every stop
    const defSide = G.drive === "A" ? "B" : "A";
    const stopGain = info.turnover ? 38 : (reason === "SACKED!" ? 26 : (noSpot ? 10 : 0));
    if (stopGain) G.rampage[defSide] = clamp(G.rampage[defSide] + stopGain, 0, 100);

    // touchdown?
    if (!info.turnover && !noSpot && spotYd >= 100) { touchdown(); return; }
    // safety? only a real takedown in the end zone counts — a catch there is live
    if (!info.turnover && !noSpot && spotYd <= 0 &&
      ["TACKLED", "SACKED!", "FLATTENED!", "DIVE"].includes(reason)) {
      const defT = G.drive === "A" ? "B" : "A";
      G.score[defT] += 2;
      banner("SAFETY!", "Two points!", 2);
      G.deadT = 2; G.deadNext = () => { changePossession(30); enterPlaycall(); };
      return;
    }

    const safeSpot = Math.max(1, spotYd);
    const gained = safeSpot - G.losYd;
    if (G.carrier && !info.turnover) {
      if (G.drive === "A" && gained > 0) {
        G.rampage.A = clamp(G.rampage.A + gained * 2.2, 0, 100);
        G.stats.passYds += gained;
      }
      if (G.drive === "B" && gained > 0) G.rampage.B = clamp(G.rampage.B + gained * 2.2, 0, 100);
    }
    // per-player yardage attribution
    if (!noSpot && !info.turnover) {
      const g2 = Math.round(gained);
      if (G.playPass && G.playPass.receiver) {
        addStat(G.playPass.passer, "passYds", g2);
        addStat(G.playPass.receiver, "recYds", g2);
      } else if (G.carrier) {
        addStat(G.carrier, "rushYds", g2); addStat(G.carrier, "car");
      }
    }

    if (info.turnover) {
      banner(reason, info.by ? (info.fumbleRec ? "Recovered by " : "Picked off by ") + lastName(info.by) : "", 1.8);
      G.deadT = 1.8;
      G.deadNext = () => startReplay(() => { changePossession(100 - spotYd); enterPlaycall(); });
      return;
    }

    // normal down progression
    let sub = "";
    if (!noSpot) sub = (gained >= 0 ? "+" : "") + Math.round(gained) + " yds";
    if (spotYd >= G.losYd + G.toGain && !noSpot) {
      G.losYd = Math.round(spotYd); G.down = 1; G.toGain = Math.min(10, 100 - G.losYd);
      banner("FIRST DOWN!", sub, 1.2); sfx.firstdown();
      // moving the chains ALWAYS gets a celebration: the ball carrier pops up
      // and throws the first-down signal (arm out), the fresh line of gain
      // flashes, and the home crowd roars
      const fdGuy = G.carrier || G.players.find((e) => (e.team === "off") === (G.drive === "A") && e.role === "QB");
      if (fdGuy) { fdGuy.proneT = 0; fdGuy.jumpT = 0.45; fdGuy.fdCeleb = 1.3; }
      G.fdCelebEnt = fdGuy;
      G.fdFlash = 1.1;
      announce("firstdown", fdGuy && fdGuy.name);
      crowdSpike = Math.max(crowdSpike, 0.06); crowdCheer(0.35);
    } else {
      if (!noSpot) G.losYd = Math.round(clamp(spotYd, 1, 99));
      G.toGain = Math.max(1, Math.round(G.losYd + G.toGain - spotYd) === 0 ? 1 : G.toGain - (noSpot ? 0 : Math.round(gained)));
      G.down += 1;
      if (G.down > 4) {
        banner("TURNOVER ON DOWNS", "", 1.8);
        G.deadT = 1.8; G.deadNext = () => { changePossession(100 - G.losYd); enterPlaycall(); };
        return;
      }
      banner(reason, sub + "  ·  " + downText(), 1.2);
    }
    G.deadT = 1.3; G.deadNext = enterPlaycall;
  }

  function downText() {
    const n = ["1st", "2nd", "3rd", "4th"][G.down - 1] || "4th";
    return n + " & " + (G.losYd + G.toGain >= 100 ? "GOAL" : Math.max(1, Math.round(G.toGain)));
  }

  // ---------------------------------------------------- endzone celebrations
  // styles: "slide" (rain slip-n-slide) · "hop" (bounce mob) · "spike" (the
  // scorer slams the ball, teammates mob around) — every TD gets one
  function startCelebration(side, style, scorer) {
    const team = side === G.drive ? "off" : "def";
    G.celebrate = { t: 3.2, style, scorer, spiked: false };
    const focus = scorer && scorer.team === team ? { x: clamp(scorer.x, xAtYd(101), xAtYd(108)), y: clamp(scorer.y, TOP + 40, BOT - 40) } : null;
    for (const e of G.players) {
      if (e.team !== team) continue;
      e.celebTarget = focus && style !== "slide"
        ? { x: clamp(focus.x + rnd(-50, 50), xAtYd(100), xAtYd(109)), y: clamp(focus.y + rnd(-46, 46), TOP + 30, BOT - 30) }
        : { x: xAtYd(rnd(101, 108)), y: rnd(TOP + 40, BOT - 40) };
      e.celebPhase = "run"; e.celebDelay = rnd(0, 0.5);
      e.staggerT = 0; e.proneT = 0;
    }
  }
  function updateCelebration(dt) {
    const c = G.celebrate;
    c.t -= dt;
    if (c.t <= 0) { G.celebrate = null; G.players.forEach((e) => { e.celebPhase = null; }); return; }
    for (const e of G.players) {
      if (!e.celebPhase) continue;
      e.animT += dt * 8;
      if (e.jumpT > 0) e.jumpT -= dt;   // the game clock is dead — tick hops here
      if (e.celebDelay > 0) { e.celebDelay -= dt; continue; }
      if (e.celebPhase === "run") {
        const d = dist(e, e.celebTarget);
        moveToward(e, e.celebTarget, e.spd * 1.1, dt);
        if (d < 24) {
          e.jumpT = 0.4;
          if (c.style === "slide") { e.celebPhase = "slide"; e.slideV = e.spd * 1.2; }
          else e.celebPhase = "party";
        }
      } else if (e.celebPhase === "slide") {
        e.proneT = 0.4;                       // rendered laid-out
        e.x += e.dir * e.slideV * dt;
        e.slideV = Math.max(30, e.slideV * 0.965);
        if (G.weather.type === "RAIN" && Math.random() < dt * 22) {
          for (let i = 0; i < 3; i++) G.parts.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-4, 6), z: 0, vx: rnd(-50, 50), vy: rnd(-30, 30), vz: rnd(30, 90), t: rnd(0.3, 0.6), splash: true });
        }
        if (e.x > xAtYd(109)) { e.dir *= -1; e.slideV = 60; } // don't slide into the stands
      } else if (e.celebPhase === "party") {
        // bounce and shuffle around the scorer
        if (e.jumpT <= 0) {
          e.jumpT = 0.4;
          // the SPIKE: the scorer slams it down once — turf explodes
          if (c.style === "spike" && !c.spiked && e === c.scorer) {
            c.spiked = true; sfx.tackle(); G.shake = Math.max(G.shake, 0.25);
            for (let i = 0; i < 10; i++) G.parts.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-4, 6), z: 2, vx: rnd(-70, 70), vy: rnd(-50, 50), vz: rnd(30, 100), t: rnd(0.3, 0.6), puff: true });
          }
        }
        e.x += Math.sin(performance.now() / 130 + e.y) * 26 * dt;
        e.x = clamp(e.x, xAtYd(99), xAtYd(109));
      }
    }
  }

  function touchdown() {
    const t = G.drive;
    G.score[t] += 6;
    G.rampage[t] = clamp(G.rampage[t] + 25, 0, 100);
    // stat attribution for the score
    const g2 = Math.round(100 - G.losYd);
    if (G.playPass && G.playPass.receiver) {
      addStat(G.playPass.passer, "passYds", g2); addStat(G.playPass.passer, "passTd");
      addStat(G.playPass.receiver, "recYds", g2); addStat(G.playPass.receiver, "recTd");
    } else if (G.carrier) {
      addStat(G.carrier, "rushYds", g2); addStat(G.carrier, "car"); addStat(G.carrier, "rushTd");
    }
    const scoringAbbr = t === "A" ? G.my : G.opp;
    const rainParty = G.weather.type === "RAIN";
    banner("TOUCHDOWN " + TEAMS[scoringAbbr][0].toUpperCase() + "!",
      rainParty ? "💦 PUDDLE PARTY!" : "", 2);
    announce("td", G.carrier && G.carrier.name);
    sfx.td();
    crowdSpike = t === "A" ? 0.14 : 0.05;
    crowdCheer(t === "A" ? 1.0 : 0.5);
    if (rainParty) {
      const c = G.carrier || G.ball;
      for (let i = 0; i < 26; i++) G.parts.push({ x: c.x + rnd(-16, 16), y: c.y + rnd(-8, 12), z: 0, vx: rnd(-60, 60), vy: rnd(-40, 40), vz: rnd(30, 110), t: rnd(0.3, 0.7), splash: true });
    }
    if (t === "A") G.stats.tds++;
    G.deadT = 2.6;
    // EVERY touchdown gets a celebration: the scorer spikes it or the whole
    // squad bounces in a mob around him
    startCelebration(t, Math.random() < 0.5 ? "spike" : "hop", G.carrier);
    // ★ EASTER EGG: Bears touchdown in the rain — the whole team storms the
    // endzone and slides through the puddles (Chicago vs SF, 2022)
    if (scoringAbbr === "CHI" && rainParty) {
      startCelebration(t, "slide", G.carrier);
      banner("BEAR WEATHER!", "The whole team hits the slip-n-slide!", 3.2);
      G.deadT = 3.4;
    }
    // ★ EASTER EGG: a Seattle running back scores — BEAST QUAKE. The ground
    // itself shakes and the crowd registers on the Richter scale.
    if (scoringAbbr === "SEA" && G.carrier && G.carrier.role === "RB" && !(G.playPass && G.playPass.receiver)) {
      G.shake = 1.8;
      crowdSpike = 0.4;
      sfx.roar(); sfx.td();
      banner("BEAST QUAKE!!", "The crowd is literally seismic!", 3.0);
      G.deadT = 3.2;
    }
    if (isHuman(t)) {   // the human who scored chooses XP or 2 (either player in 2-player)
      G.deadNext = () => startReplay(() => { G.state = "ptchoice"; });
    } else {
      // CPU: chase the two when the score calls for it late
      const deficit = G.score.A - G.score.B; // after its 6
      const wantTwo = G.quarter >= 3 && [2, 5, 10, 16, 18].includes(deficit) && Math.random() < 0.75;
      G.deadNext = () => startReplay(() => { if (wantTwo) goForTwo(); else enterKick("XP"); });
    }
  }

  function goForTwo() {
    G.patMode = true;
    G.losYd = 98; G.down = 1; G.toGain = 2;
    banner("GOING FOR TWO!", "", 1.1);
    enterPlaycall();
  }
  function ptChoose(two) {
    if (two) goForTwo();
    else enterKick("XP");
  }
  function ptClick() {
    const cards = [{ kind: "XP" }, { kind: "GO2" }];
    for (const r2 of cardRects(cards)) {
      if (mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h) {
        ptChoose(r2.c.kind === "GO2"); return;
      }
    }
  }
  function drawPTChoice() {
    cx.fillStyle = "rgba(5,12,8,.55)"; cx.fillRect(0, 330, W, H - 330);
    cx.textAlign = "center"; cx.font = PF(13); cx.fillStyle = "#ffd23f";
    cx.fillText("AFTER THE TOUCHDOWN…", W / 2, 350);
    const cards = [{ kind: "XP" }, { kind: "GO2" }];
    for (const r2 of cardRects(cards)) {
      const hov = mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h;
      cx.fillStyle = hov ? "#14402a" : "#0d2519";
      cx.fillRect(r2.x, r2.y, r2.w, r2.h);
      cx.strokeStyle = hov ? "#ffd23f" : "#1d4030"; cx.lineWidth = 2;
      cx.strokeRect(r2.x, r2.y, r2.w, r2.h);
      cx.font = PF(10); cx.fillStyle = "#f4f6f1";
      cx.fillText(r2.c.kind === "XP" ? "KICK XP (+1)" : "GO FOR 2!", r2.x + r2.w / 2, r2.y + 40);
      cx.font = PF(8); cx.fillStyle = "#9db0a4";
      cx.fillText(r2.c.kind === "XP" ? "[1] the safe ptero" : "[2] one play, 2 yds", r2.x + r2.w / 2, r2.y + 80);
    }
  }

  function changePossession(newLosYd) {
    G.drive = G.drive === "A" ? "B" : "A";
    G.losYd = Math.round(clamp(newLosYd, 1, 99));
    G.down = 1; G.toGain = Math.min(10, 100 - G.losYd);
    G.ramp = null;
  }

  // ------------------------------ halftime show: METEOR MADNESS ------------
  // The mascot T-rex sprints around midfield catching footballs launched from
  // the stands while ACTUAL METEORS rain down. Catch = +7 rampage. Meteor
  // hit = stunned and -1. Spawns ramp up, so the last seconds get frantic.
  // Everything lands on one screen — nothing is ever out of reach.
  function startHalftimeShow(cont) {
    G.half = {
      t: 22, cont, score: 0, hits: 0, best: 0,
      px: W / 2 + clamp(xAtYd(50) - W / 2, 0, FIELD_LEN - W), py: MID, stun: 0,
      drops: [], spawnT: 0.5,
      camX: clamp(xAtYd(50) - W / 2, 0, FIELD_LEN - W),
    };
    G.state = "halftime";
  }
  function updateHalftime(dt) {
    const h = G.half;
    h.t -= dt;
    // spawn rate ramps as the clock runs down
    const ramp = 1 + (22 - h.t) / 9;
    h.spawnT -= dt * ramp;
    if (h.spawnT <= 0) {
      h.spawnT = rnd(0.6, 0.95);
      const meteor = Math.random() < 0.42;
      h.drops.push({
        fx: h.camX + rnd(60, W - 60), fy: rnd(TOP + 30, BOT - 30),
        hgt: 340, fall: meteor ? rnd(300, 380) : rnd(160, 215), kind: meteor ? "m" : "b",
      });
    }
    // steer: WASD/joystick or chase the cursor
    if (h.stun > 0) h.stun -= dt;
    else {
      const kd = kdir();
      let tx, ty;
      if (kd.x || kd.y) { tx = h.px + kd.x * 220; ty = h.py + kd.y * 220; }
      else { tx = mouse.x + h.camX; ty = mouse.y; }
      const d = Math.hypot(tx - h.px, ty - h.py);
      if (d > 4) {
        const sp = 310;
        h.px += (tx - h.px) / d * Math.min(sp * dt, d);
        h.py += (ty - h.py) / d * Math.min(sp * dt, d);
      }
      h.px = clamp(h.px, h.camX + 22, h.camX + W - 22);
      h.py = clamp(h.py, TOP + 8, BOT - 8);
    }
    for (const dr of h.drops) {
      if (dr.done) { dr.doneT = (dr.doneT || 0) + dt; continue; }
      dr.hgt -= dr.fall * dt;
      if (dr.hgt <= 0) {
        dr.done = true;
        const dd = Math.hypot(h.px - dr.fx, h.py - dr.fy);
        if (dr.kind === "b") {
          if (dd < 30 && h.stun <= 0) {
            h.score++; G.rampage.A = clamp(G.rampage.A + 7, 0, 100);
            sfx.catch(); crowdCheer(0.3);
          }
        } else {
          G.shake = Math.max(G.shake, 0.35); sfx.tackle();
          if (dd < 40) { h.stun = 1.0; h.hits++; h.score = Math.max(0, h.score - 1); sfx.roar(); }
        }
      }
    }
    h.drops = h.drops.filter((dr) => !dr.done || dr.doneT == null || dr.doneT < 0.35);
    if (h.t <= 0) endHalftime();
  }
  function endHalftime() {
    const h = G.half; G.half = null;
    banner("METEOR MADNESS: " + h.score + " CAUGHT!",
      (h.hits ? "clonked by " + h.hits + " meteor" + (h.hits > 1 ? "s" : "") + " · " : "") + "rampage meter fed for the second half!", 2.2);
    G.state = "dead"; G.deadT = 2.2; G.deadNext = h.cont;
  }
  function drawHalftime() {
    const h = G.half;
    G.camX = h.camX;
    drawField();
    for (const dr of h.drops) {
      const sx = dr.fx - G.camX;
      if (!dr.done) {
        // landing marker grows as the object falls — that's your read
        const k = 1 - dr.hgt / 340;
        cx.strokeStyle = dr.kind === "m" ? "rgba(255,80,40,.85)" : "rgba(255,210,63,.85)";
        cx.lineWidth = 2;
        cx.beginPath(); cx.ellipse(sx, dr.fy, 6 + k * 16, 3 + k * 7, 0, 0, Math.PI * 2); cx.stroke();
        if (dr.kind === "m") {
          cx.fillStyle = "#ff9e4a"; cx.fillRect(sx - 6, dr.fy - dr.hgt - 6, 12, 12);
          cx.fillStyle = "#ffdf9e"; cx.fillRect(sx - 2, dr.fy - dr.hgt - 2, 5, 5);
          cx.strokeStyle = "rgba(255,190,90,.6)"; cx.lineWidth = 2;
          cx.beginPath(); cx.moveTo(sx + 8, dr.fy - dr.hgt - 22); cx.lineTo(sx, dr.fy - dr.hgt); cx.stroke();
        } else {
          cx.drawImage(G.ballSpr, sx - 8, dr.fy - dr.hgt - 5);
        }
      } else if (dr.kind === "m") {
        // impact shockwave
        cx.strokeStyle = "rgba(255,120,60," + Math.max(0, 1 - (dr.doneT || 0) * 3) + ")";
        cx.lineWidth = 3;
        cx.beginPath(); cx.arc(sx, dr.fy, 10 + (dr.doneT || 0) * 110, 0, Math.PI * 2); cx.stroke();
      }
    }
    // the mascot rex (flickers while stunned)
    const sheet = G.sheets.A;
    if (sheet && sheet.trex && !(h.stun > 0 && ((performance.now() / 90) | 0) % 2)) {
      const spr = sheet.trex, fi = ((performance.now() / 140) | 0) % 2;
      cx.fillStyle = "rgba(0,0,0,.28)";
      cx.fillRect(h.px - G.camX - 8, h.py + 2, 16, 4);
      cx.drawImage(spr.R[fi], h.px - G.camX - spr.w / 2, h.py - spr.h + 6);
    }
    cx.font = PF(12); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
    cx.fillText("☄ METEOR MADNESS — " + Math.ceil(Math.max(0, h.t)) + "s — " + h.score + " CAUGHT", W / 2, 52);
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("CATCH 🏈 (+7 RAMPAGE) · DODGE METEORS (-1 & STUN) · MOUSE/WASD · ENTER TO SKIP", W / 2, 72);
  }

  function endQuarter() {
    if (G.quarter === 2) {
      G.quarter = 3; G.clock = 180;
      banner("HALFTIME", "METEOR MADNESS! Catch footballs, dodge the sky!", 2.0);
      G.state = "dead"; G.deadT = 2.0;
      G.deadNext = () => startHalftimeShow(() => {
        G.drive = G.openingDrive === "A" ? "B" : "A"; G.losYd = 25; G.down = 1; G.toGain = 10; enterPlaycall();
      });
    } else if (G.quarter >= 4) {
      if (G.score.A === G.score.B && !G.ot) {
        G.ot = true; G.quarter = 5; G.clock = 180;
        banner("OVERTIME!", "Next score wins... probably.", 2.2);
        G.state = "dead"; G.deadT = 2.2; G.deadNext = enterPlaycall;
      } else {
        gameOver();
      }
    } else {
      G.quarter += 1; G.clock = 180;
      banner("END OF Q" + (G.quarter - 1), "", 1.6);
      G.state = "dead"; G.deadT = 1.6; G.deadNext = enterPlaycall;
    }
  }

  function gameOver() {
    G.state = "over";
    const win = G.score.A > G.score.B ? G.my : G.score.B > G.score.A ? G.opp : null;
    if (!G.humanB) {   // don't log 2-player results to the solo all-time record
      if (win === G.my) G.record.w++; else if (win === G.opp) G.record.l++; else G.record.t++;
      saveRecord();
    }
    banner(win ? TEAMS[win][0].toUpperCase() + " WIN!" : "TIE GAME", "", 99);
    sfx.td();
    // Player of the Game — biggest stat line on the field
    const lines = Object.values(G.gameStats || {});
    let best = null, bv = -1;
    for (const s of lines) {
      const v = s.passYds * 0.7 + s.rushYds + s.recYds + (s.passTd + s.rushTd + s.recTd) * 40 +
        s.tkl * 5 + s.sacks * 25 + s.defInt * 35 + s.ff * 25 - s.passInt * 20;
      if (v > bv) { bv = v; best = s; }
    }
    if (best && bv > 10) {
      const bits = [];
      if (best.passYds) bits.push(best.passYds + " pass yds");
      if (best.passTd) bits.push(best.passTd + " TD");
      if (best.rushYds) bits.push(best.rushYds + " rush yds");
      if (best.recYds) bits.push(best.recYds + " rec yds");
      if (best.sacks) bits.push(best.sacks + " sacks");
      if (best.defInt) bits.push(best.defInt + " INT");
      if (best.tkl && !best.sacks && !best.defInt) bits.push(best.tkl + " tackles");
      G.pog = { name: lastName(best.name).toUpperCase(), line: bits.slice(0, 3).join(", ") };
    } else G.pog = null;
    if (G.onGameOver) { const f = G.onGameOver; G.onGameOver = null; f(); }
  }

  // -------------------------------------------------------------- kick play
  function enterKick(kind) {
    G.state = "kick"; G.aim = null;
    const kicker = roster(G.drive === "A" ? G.my : G.opp).kicker;
    G.kick = { kind, stage: 0, t: 0, power: 0, acc: 0, kicker, cpu: !isHuman(G.drive) };
  }
  function kickLocked() {
    const k = G.kick;
    if (k.stage === 0) { k.power = k.val; k.stage = 1; k.t = 0; sfx.kick(); return; }
    k.acc = k.val - 50; // -50..50, 0 is perfect
    k.stage = 2; k.t = 0;
    resolveKick();
  }
  function resolveKick() {
    const k = G.kick;
    const leg = k.kicker.leg || 84;
    if (k.kind === "PUNT") {
      const d = Math.round((22 + (k.power / 100) * (26 + leg * 0.22)) + G.weather.wind.x / YPX * 1.2);
      let land = G.losYd + d;
      let sub;
      if (land >= 100) { land = 80; sub = "Touchback."; } else { sub = d + " yard punt"; }
      banner("PUNT", sub, 1.6);
      G.deadT = 1.6; G.deadNext = () => { changePossession(100 - land); enterPlaycall(); };
      G.state = "dead";
      return;
    }
    const fgDist = k.kind === "XP" ? 33 : Math.round(100 - G.losYd + 17);
    const range = 28 + leg * 0.32 + (k.power - 55) * 0.2;
    const accOk = Math.abs(k.acc + G.weather.wind.y * 0.5) < (k.kind === "XP" ? 24 : 16) + (leg - 80) * 0.2;
    const good = fgDist <= range && accOk && Math.random() > 0.04 + (G.weather.kickMod ? Math.abs(G.weather.kickMod) : 0);
    if (k.kind === "XP") {
      if (good) { G.score[G.drive] += 1; banner("EXTRA POINT GOOD", "", 1.4); }
      else banner("XP MISSED!", "The ptero shanks it!", 1.4);
      G.deadT = 1.5; G.deadNext = () => { changePossession(25); enterPlaycall(); };
    } else {
      if (good) {
        G.score[G.drive] += 3; sfx.td();
        banner("FIELD GOAL GOOD!", fgDist + " yards by " + lastName(k.kicker.name), 1.8);
        G.deadT = 1.8; G.deadNext = () => { changePossession(25); enterPlaycall(); };
      } else {
        banner("FIELD GOAL MISSED", fgDist + " yard attempt", 1.8);
        G.deadT = 1.8; G.deadNext = () => { changePossession(100 - G.losYd); enterPlaycall(); };
      }
    }
    G.state = "dead";
  }

  // ----------------------------------------------------------- stat tracking
  function statLine(e) {
    if (!e || !e.name) return null;
    const key = sideOf(e) + "|" + e.name;
    if (!G.gameStats[key]) {
      G.gameStats[key] = {
        name: e.name, side: sideOf(e), pos: e.role,
        passYds: 0, passTd: 0, passInt: 0, cmp: 0, att: 0,
        rushYds: 0, rushTd: 0, car: 0, recYds: 0, recTd: 0, rec: 0,
        tkl: 0, sacks: 0, defInt: 0, ff: 0,
      };
    }
    return G.gameStats[key];
  }
  function addStat(e, field, amt) {
    const s = statLine(e);
    if (s) s[field] += (amt == null ? 1 : amt);
  }
  function snapshotFrame() {
    G.tape.push({
      camX: G.camX,
      ball: { x: G.ball.x, y: G.ball.y, z: G.ball.z || 0, held: G.ball.mode === "held" },
      ents: G.players.map((e) => ({
        x: e.x, y: e.y, dir: e.dir, sp: e.species, side: sideOf(e),
        ramp: !!(G.ramp && G.ramp.ent === e), prone: e.proneT > 0, anim: e.animT,
        // action states so the replay shows the TACKLE, the FLIGHT, the DIVE,
        // the throw and the spin — not just dinos gliding around
        jmp: e.jumpT > 0 ? e.jumpT : 0, soar: e.soarT > 0, dive: e.diveT > 0,
        spin: e.spinT > 0 ? e.spinT : 0, thr: e.throwT > 0 ? e.throwT : 0,
        swing: e.swingT > 0 ? e.swingT : 0, jr: e.jump || 70,
      })),
    });
    if (G.tape.length > 340) G.tape.shift();
  }
  function startReplay(cont) {
    if (G.tape.length < 50) { cont(); return; }
    G.replay = { frames: G.tape.slice(), i: 0, cont };
    G.state = "replay";
  }
  function updateReplay(dt) {
    const r2 = G.replay;
    r2.i += dt * 60 * 0.42; // slow motion
    if (r2.i >= r2.frames.length) endReplay();
  }
  // ------------------------------------------------ the coach's challenge
  function throwChallenge() {
    if (G.challengeUsed || !G.lastDead || G.state !== "dead") return;
    const c = G.lastDead;
    if (!["INCOMPLETE", "DROPPED!", "INTERCEPTED!", "TACKLED", "BROKEN UP!", "SWATTED AWAY!"].includes(c.reason)) return;
    G.challengeUsed = true;
    banner("🚩 CHALLENGE FLAG!", "Upon further review…", 2.6);
    sfx.whistle(); sfx.whistle();
    const savedNext = G.deadNext;
    G.deadT = Math.max(G.deadT, 2.6);
    G.deadNext = () => startReplay(() => {
      // a sharp head coach picks better spots to throw the flag
      const hcBonus = (G.szn && G.szn.staff ? G.szn.staff.hc.stars : 0) * 0.03;
      const overturned = Math.random() < 0.38 + hcBonus;   // weighted: the call usually stands
      if (!overturned) {
        banner("THE CALL STANDS", "That timeout is gone forever.", 1.8);
        G.deadT = 1.8; G.deadNext = savedNext; G.state = "dead";
        return;
      }
      sfx.td();
      if (["INCOMPLETE", "DROPPED!", "BROKEN UP!", "SWATTED AWAY!"].includes(c.reason)) {
        // overturned to a CATCH at the ball's landing spot
        const spot = Math.min(99, Math.max(c.losYd + 1, c.ballYd));
        banner("OVERTURNED — CATCH!", "Complete at the " + (spot > 50 ? 100 - spot : spot), 2);
        if (spot >= c.losYd + c.toGain) { G.losYd = spot; G.down = 1; G.toGain = Math.min(10, 100 - spot); }
        else { G.losYd = spot; G.toGain = Math.max(1, c.losYd + c.toGain - spot); G.down = Math.min(4, c.down + 1); }
      } else if (c.reason === "INTERCEPTED!") {
        banner("OVERTURNED — INCOMPLETE!", "The pick is wiped away!", 2);
        G.drive = G.drive === "A" ? "B" : "A";   // give it back
        G.losYd = c.losYd; G.down = Math.min(4, c.down + 1); G.toGain = c.toGain;
      } else { // TACKLED spot challenge: a friendlier spot
        const spot = Math.min(99, c.ballYd + 2);
        banner("OVERTURNED — BETTER SPOT!", "", 1.6);
        if (spot >= c.losYd + c.toGain) { G.losYd = spot; G.down = 1; G.toGain = Math.min(10, 100 - spot); }
        else G.losYd = spot;
      }
      G.deadT = 2; G.deadNext = enterPlaycall; G.state = "dead";
    });
  }

  // ------------------------------------------------ replay → animated GIF
  function gifLZW(indices, out) {
    const CLEAR = 256, EOI = 257;
    out.push(8); // min code size
    let dict, dictSize, codeSize;
    const reset = () => { dict = new Map(); dictSize = 258; codeSize = 9; };
    let bitBuf = 0, bitCnt = 0; const chunk = [];
    const flushChunk = () => { out.push(chunk.length); for (const b of chunk) out.push(b); chunk.length = 0; };
    const emit = (code) => {
      bitBuf |= code << bitCnt; bitCnt += codeSize;
      while (bitCnt >= 8) {
        chunk.push(bitBuf & 255); bitBuf >>= 8; bitCnt -= 8;
        if (chunk.length === 255) flushChunk();
      }
    };
    reset(); emit(CLEAR);
    let prev = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const c = indices[i], key = prev * 256 + c;
      if (dict.has(key)) { prev = dict.get(key); continue; }
      emit(prev);
      dict.set(key, dictSize++);
      if (dictSize > (1 << codeSize) && codeSize < 12) codeSize++;
      if (dictSize >= 4095) { emit(CLEAR); reset(); }
      prev = c;
    }
    emit(prev); emit(EOI);
    if (bitCnt > 0) chunk.push(bitBuf & 255);
    if (chunk.length) flushChunk();
    out.push(0);
  }
  function gifEncode(frames, w, h, delayCs) {
    const out = [];
    const STR = (t) => { for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i)); };
    STR("GIF89a");
    out.push(w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0);
    for (let i = 0; i < 256; i++) {   // fixed 3-3-2 palette (great for pixel art)
      out.push(Math.round(((i >> 5) & 7) * 255 / 7), Math.round(((i >> 2) & 7) * 255 / 7), Math.round((i & 3) * 255 / 3));
    }
    out.push(0x21, 0xFF, 0x0B); STR("NETSCAPE2.0"); out.push(3, 1, 0, 0, 0); // loop forever
    for (const px of frames) {
      out.push(0x21, 0xF9, 4, 0, delayCs & 255, delayCs >> 8, 0, 0);
      out.push(0x2C, 0, 0, 0, 0, w & 255, w >> 8, h & 255, h >> 8, 0);
      gifLZW(px, out);
    }
    out.push(0x3B);
    return new Uint8Array(out);
  }
  const GIF_W = 240, GIF_H = 135;
  function gifGrabFrame() {
    if (!G.gifCv) { G.gifCv = document.createElement("canvas"); G.gifCv.width = GIF_W; G.gifCv.height = GIF_H; }
    const g2 = G.gifCv.getContext("2d");
    g2.drawImage(cv, 0, 0, GIF_W, GIF_H);
    const d = g2.getImageData(0, 0, GIF_W, GIF_H).data;
    const idx = new Uint8Array(GIF_W * GIF_H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      idx[j] = ((d[i] >> 5) << 5) | ((d[i + 1] >> 5) << 2) | (d[i + 2] >> 6);
    }
    G.gifFrames.push(idx);
  }
  function gifStart() {
    if (!G.replay) return;
    G.gifFrames = []; G.gifRec = true; G.gifSkip = 0;
    G.replay.i = 0;                        // roll it back and record the whole thing
    banner("🎥 RECORDING…", "the GIF saves when the replay ends", 1.2);
  }
  function gifFinish() {
    if (!G.gifRec || !G.gifFrames.length) { G.gifRec = false; return; }
    G.gifRec = false;
    try {
      const bytes = gifEncode(G.gifFrames, GIF_W, GIF_H, 7);
      const blob = new Blob([bytes], { type: "image/gif" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "dinobowl-replay.gif";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      banner("GIF SAVED!", "check your downloads — share the chaos", 1.6);
    } catch (err) { banner("GIF FAILED", String(err).slice(0, 40), 1.4); }
    G.gifFrames = [];
  }

  function endReplay() {
    gifFinish();
    const c = G.replay && G.replay.cont;
    G.replay = null;
    if (c) c(); else G.state = "playcall";
  }
  function drawReplay() {
    const r2 = G.replay;
    const f = r2.frames[Math.min(r2.frames.length - 1, r2.i | 0)];
    G.camX = f.camX;
    drawField();
    const list = f.ents.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const sheet = G.sheets[e.side];
      if (!sheet) continue;
      const spr = e.ramp ? sheet.rampage : sheet[e.sp];
      if (!spr) continue;
      let fi = (e.anim * 4 | 0) % 2;
      if (e.soar && spr.n > 2) fi = 2 + ((e.anim * 6 | 0) % 2);   // wings open
      const img = (e.dir >= 0 ? spr.R : spr.L)[fi];
      const jumpAmp = 5 + Math.max(0, (e.jr || 60) - 55) * 0.2;
      const jump = e.jmp > 0 ? Math.sin((1 - e.jmp / 0.4) * Math.PI) * jumpAmp : 0;
      cx.fillStyle = "rgba(0,0,0,.28)";
      cx.fillRect(e.x - G.camX - 8, e.y + 2, 16, 4);
      if (e.prone) {           // laid out on the turf (the tackle's aftermath)
        cx.save(); cx.translate(e.x - G.camX, e.y); cx.rotate((e.dir >= 0 ? 1 : -1) * Math.PI / 2);
        cx.drawImage(img, -spr.w / 2, -spr.h + 6); cx.restore();
      } else if (e.spin > 0) { // mid spin-move / juke rotation
        cx.save(); cx.translate(e.x - G.camX, e.y - spr.h / 2 + 3 - jump);
        cx.rotate((1 - e.spin / 0.32) * Math.PI * 2 * (e.dir >= 0 ? 1 : -1));
        cx.drawImage(img, -spr.w / 2, -spr.h / 2); cx.restore();
      } else if (e.dive) {     // horizontal layout mid-dive
        cx.save(); cx.translate(e.x - G.camX, e.y - 8 - jump); cx.rotate((e.dir >= 0 ? 1 : -1) * Math.PI / 2.6);
        cx.drawImage(img, -spr.w / 2, -spr.h + 6); cx.restore();
      } else {
        cx.drawImage(img, e.x - G.camX - spr.w / 2, e.y - spr.h + 6 - jump);
        if (e.thr > 0) {       // the throwing arm swing
          const prog = 1 - e.thr / 0.3;
          const sx = e.x - G.camX, sy = e.y - jump - 20;
          cx.strokeStyle = "#f4f6f1"; cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(sx, sy);
          cx.lineTo(sx + (e.dir >= 0 ? 1 : -1) * (-8 + prog * 22), sy - 6 + prog * 8); cx.stroke();
        }
        if (e.swing > 0) {     // the peanut-punch swat
          const pr = 1 - e.swing / 0.3;
          const sx0 = e.x - G.camX, sy0 = e.y - jump - 16;
          cx.strokeStyle = "#ff8a5c"; cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(sx0, sy0);
          cx.lineTo(sx0 + (e.dir >= 0 ? 1 : -1) * (4 + pr * 16), sy0 - 2 + pr * 4); cx.stroke();
        }
      }
    }
    if (!f.ball.held) {
      cx.fillStyle = "rgba(0,0,0,.3)"; cx.fillRect(f.ball.x - G.camX - 5, f.ball.y - 2, 10, 4);
      cx.drawImage(G.ballSpr, f.ball.x - G.camX - 8, f.ball.y - f.ball.z - 5);
    }
    // letterbox + flashing tag
    cx.fillStyle = "#050c08"; cx.fillRect(0, 0, W, 52); cx.fillRect(0, H - 52, W, 52);
    if (Math.sin(performance.now() / 250) > -0.3) {
      cx.font = PF(14); cx.fillStyle = "#ff5533"; cx.textAlign = "left";
      cx.fillText("● INSTANT REPLAY", 30, 34);
    }
    cx.font = PF(8); cx.fillStyle = "#9db0a4"; cx.textAlign = "right";
    cx.fillText("TAP / ANY KEY TO SKIP", W - 30, H - 24);
  }

  // ---------------------------------------------------------------- rampage
  // Only each franchise's APEX dino can rampage. If the apex plays defense,
  // the rampage is a defensive one — an unblockable, ball-punching monster.
  function sideOf(e) { return (e.team === "off") === (G.drive === "A") ? "A" : "B"; }
  function tryRampage(cpu) {
    const side = cpu ? "B" : "A";
    if (G.rampage[side] < 100 || G.ramp || G.state !== "live") return;
    const apex = G.players.find((e) => e.apex && sideOf(e) === side);
    if (!apex) return;
    if (apex.team === "off" && (G.carrier !== apex || G.phase !== "carry")) return;
    G.rampage[side] = 0;
    G.ramp = { team: side, t: 4.0, ent: apex };
    apex.staggerT = 0; apex.proneT = 0;
    if (apex.blockedBy) { apex.blockedBy.engaged = null; apex.blockedBy = null; }
    G.shake = 0.7;
    banner("RAMPAGE!!", lastName(apex.name).toUpperCase() + " IS UNSTOPPABLE!", 1.2);
    announce("rampage", apex.name);
    sfx.roar();
    spawnPtero(true);
  }
  function spawnPtero(flock) {
    const n = flock ? 4 : 1;
    for (let i = 0; i < n; i++) {
      G.pteros.push({ x: G.camX - 60 - i * 50, y: rnd(18, 60), v: rnd(60, 110), f: 0 });
    }
  }

  // ------------------------------------------------------------ input hooks
  function onPress() {
    const S = G.state;
    if (S === "title") { G.state = "menu"; G.menuIdx = 0; return; }
    if (S === "replay") { endReplay(); return; }   // tap anywhere skips the replay
    if (S === "halftime") { return; }
    if (S === "menu") { menuTapAt(mouse.x, mouse.y); return; }
    if (S === "qbs") { G.state = "menu"; return; }
    if (S === "tutorial") { G.tut = Math.min(TUT_PAGES.length - 1, (G.tut || 0) + 1); return; }
    if (S === "scout") { scoutClick(); return; }
    if (S === "editor") { editorClick(); return; }
    if (S === "offseason") { offseasonClick(); return; }
    if (S === "pregame") { kickoffAfterPregame(); return; }
    if (S === "hub") { if (G.szn && G.szn.phase === "done") hubKey("enter"); else startSeasonGame(); return; }
    if (S === "standings" || S === "sznstats") { G.state = "hub"; return; }
    if (S === "select") { selectClick(); return; }
    if (S === "playcall" || S === "defcall") { playcallClick(); return; }
    if (S === "career_drill") { careerDrillClick(); return; }
    if (S === "presnap") {
      const wx = mouse.x + G.camX, wy = mouse.y;
      let pick = null, pd = 26;
      for (const e2 of G.players) {
        const dd = Math.hypot(e2.x - wx, e2.y - wy);
        if (dd < pd) { pd = dd; pick = e2; }
      }
      if (pick) {
        G.selCard = { e: pick, t: 2.2 };
        const userSide = offenseIsUser() ? "off" : "def";
        if (pick.team === "def" && !offenseIsUser()) setControlled(pick);   // choose your defender
        // offense: BE that player — pick a receiver/back and you play as him
        // (the CPU quarterback runs the play and can hit you on your route)
        if (pick.team === "off" && offenseIsUser() &&
          (pick.routeEligible || pick.role === "QB" || pick.role === "RB")) setControlled(pick);
        return;                       // a tap on a player doesn't snap
      }
      snap(); return;
    }
    if (S === "kick" && !G.kick.cpu) { kickLocked(); return; }
    if (S === "over") return;
    if (S === "live") {
      if (G.phase === "drop" && offenseIsUser() && G.ball.holder && G.ball.holder.role === "QB") {
        G.aim = worldMouse();
      } else if (G.phase === "carry" && offenseIsUser() && G.carrier && G.carrier.canPass &&
        G.carrier.x < xAtYd(G.losYd)) {
        G.aim = worldMouse(); // halfback pass!
      } else if (G.phase === "carry" && G.controlled === G.carrier) {
        // click = juke toward mouse
        doJuke(G.carrier);
      } else if (!offenseIsUser() && G.controlled) {
        const c = G.controlled;
        // a soar-capable defender (quetzalcoatlus safety) LAUNCHES himself:
        // hold to aim like a throw, release to fly wings-open at the target
        if (c.species === "quetz" && soarReady(c)) {
          G.soarAim = soarMouse();
        } else {
          doDive(c);
        }
      }
    }
    if (S === "ptchoice") { ptClick(); return; }
  }
  function soarMouse() {
    return { x: mouse.x + G.camX, y: clamp(mouse.y, TOP + 6, BOT - 6) };
  }

  // ---------------------------------------------------- snowball fight (V key)
  function throwSnowball() {
    if (!G.weather || G.weather.type !== "SNOW" || G.state !== "live") return;
    if (G.snowCd > 0) return;
    const from = G.controlled || G.ball.holder || G.players.find((e) => e.team === "off");
    if (!from) return;
    G.snowCd = 1.2;
    const to = { x: mouse.x + G.camX, y: clamp(mouse.y, TOP - 10, BOT + 10) };
    const d = dist(from, to), T = clamp(d / 300, 0.4, 1.4);
    G.parts.push({
      x: from.x, y: from.y - 10, z: 8,
      vx: (to.x - from.x) / T, vy: (to.y - from.y) / T, vz: 90 + d * 0.12,
      t: T, snowball: true, g: 200, thrown: true,
    });
    sfx.juke();
  }
  // a thrown snowball that lands near a dino staggers them for a beat
  function snowballSplat(p) {
    if (!p.thrown) return;
    for (const e of G.players) {
      if (dist(e, p) < 15 && e.staggerT <= 0 && e.proneT <= 0) { e.staggerT = 0.45; sfx.tackle(); break; }
    }
  }

  // ----------------------------------------------------- on-screen touch buttons
  function touchButtons() {
    if (!G.touch) return [];
    const b = []; const rx = W - 48; let ry = 150; const R = 28;
    const add = (id, label, key) => { b.push({ id, label, key, x: rx, y: ry, r: R }); ry += 64; };
    if (G.state === "presnap") {
      b.push({ id: "snap", label: "SNAP", key: " ", x: W / 2, y: H - 46, r: 38 });
      add("audR", "AUD▶", "e"); add("audL", "◀AUD", "q");
    } else if (G.state === "live") {
      if (offenseIsUser()) {
        if (G.phase === "drop") { add("bullet", "BULLET", " "); add("away", "THRWAWY", "x"); }
        else if (G.phase === "carry") { add("juke", "JUKE", "shift"); add("dive", "DIVE", "e"); add("lat", "LATRL", "q"); if (G.rampage.A >= 100) add("ramp", "🦖", "r"); }
      } else {
        add("switch", "SWITCH", "tab"); add("dive", "DIVE", " "); add("punch", "PUNCH", "f"); add("soar", "SOAR", "shift"); if (G.rampage.A >= 100) add("ramp", "🦖", "r");
      }
      if (G.weather && G.weather.type === "SNOW") add("snow", "☃THROW", "v");
    } else if (G.state === "kick" && !G.kick.cpu) {
      b.push({ id: "kick", label: "KICK", key: " ", x: W / 2, y: H - 46, r: 38 });
    }
    return b;
  }
  function touchButtonAt(p) {
    for (const btn of touchButtons()) if (Math.hypot(p.x - btn.x, p.y - btn.y) <= btn.r + 6) return btn;
    return null;
  }
  function pressTouchButton(id) {
    const btn = touchButtons().find((b) => b.id === id);
    if (btn) onKey(btn.key);
  }
  function drawTouchButtons() {
    if (!G.touch) return;
    // left joystick base while moving
    for (const id in touches) {
      const tr = touches[id];
      if (tr.role === "move") {
        cx.strokeStyle = "rgba(255,255,255,.25)"; cx.lineWidth = 3;
        cx.beginPath(); cx.arc(tr.ox, tr.oy, 40, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = "rgba(255,210,63,.5)";
        cx.beginPath(); cx.arc(tr.ox + G.touchMove.x * 40, tr.oy + G.touchMove.y * 40, 18, 0, Math.PI * 2); cx.fill();
      }
    }
    for (const btn of touchButtons()) {
      cx.fillStyle = "rgba(5,12,8,.6)"; cx.strokeStyle = "rgba(255,210,63,.8)"; cx.lineWidth = 2;
      cx.beginPath(); cx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2); cx.fill(); cx.stroke();
      cx.fillStyle = "#ffd23f"; cx.font = PF(btn.label.length > 5 ? 7 : 8); cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(btn.label, btn.x, btn.y);
      cx.textBaseline = "alphabetic";
    }
  }
  function onRelease() {
    if (G.state !== "live") return;
    if (G.soarAim && G.controlled) { startSoar(G.controlled, G.soarAim); G.soarAim = null; return; }
    if (G.aim && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) throwLob();
  }
  function onAltFire() {
    if (G.state === "live" && G.phase === "drop" && offenseIsUser()) {
      if (!G.aim) G.aim = worldMouse();
      throwBullet();
    }
  }
  function worldMouse() {
    const qb = G.ball.holder;
    const p = { x: mouse.x + G.camX, y: mouse.y };
    if (qb) {
      const d = dist(qb, p), mr = maxRange();
      if (d > mr) { const s = mr / d; p.x = qb.x + (p.x - qb.x) * s; p.y = qb.y + (p.y - qb.y) * s; }
    }
    p.y = clamp(p.y, TOP + 6, BOT - 6);
    return p;
  }

  function onKey(k) {
    if (k === "m") { muted = !muted; return; }
    if (k === "h") { G.help = !G.help; return; }
    if (k === "g" && G.state === "title") { G.gallery = !G.gallery; return; }
    if (G.state === "halftime" && (k === "enter" || k === "escape")) { endHalftime(); return; }
    if (G.state === "replay") {
      if (k === "g" && !G.gifRec) { gifStart(); return; }
      endReplay(); return;
    }
    if (k === "d" && G.state === "title") { G.diff = (G.diff + 1) % 3; saveRecord(); return; }
    if (k === "b" && !["title", "select", "live"].includes(G.state)) { G.showBox = !G.showBox; return; }
    if (k === "c" && G.state === "dead" && !G.challengeUsed) { throwChallenge(); return; }
    const S = G.state;
    if (S === "title" && (k === "enter" || k === " ")) { G.state = "menu"; G.menuIdx = 0; return; }
    if (S === "menu") { menuKey(k); return; }
    if (S === "qbs") { if (k === "escape" || k === "enter" || k === " ") { G.state = "menu"; } return; }
    if (S === "tutorial") {
      if (k === "arrowright" || k === "d" || k === "enter" || k === " ") G.tut = Math.min(TUT_PAGES.length - 1, (G.tut || 0) + 1);
      if (k === "arrowleft" || k === "a") G.tut = Math.max(0, (G.tut || 0) - 1);
      if (k === "escape") G.state = "menu";
      return;
    }
    if (S === "scout") { scoutKey(k); return; }
    if (S === "editor") { editorKey(k); return; }
    if (S === "offseason") { offseasonKey(k); return; }
    if (S === "pregame" && (k === "enter" || k === " ")) { kickoffAfterPregame(); return; }
    if (S === "hub") { hubKey(k); return; }
    if (S === "standings" || S === "sznstats") { if (k === "enter" || k === "escape" || k === "b" || k === "s") G.state = "hub"; return; }
    if (S === "select") { selectKey(k); return; }
    if (["career_create", "career_quiz", "career_drill", "career_draft"].includes(S)) { careerKey(k); return; }
    // practice: P switches between offense and defense drills, ESC quits
    if (G.practice && (S === "playcall" || S === "defcall" || S === "presnap")) {
      if (k === "p") { togglePracticeSide(); return; }
      if (k === "escape") { G.practice = false; G.state = "menu"; G.menuIdx = 0; return; }
    }
    if (S === "playcall" || S === "defcall") {
      const n = parseInt(k, 10);
      const cards = currentCards();
      if (n >= 1 && n <= cards.length) cardAction(cards[n - 1]);
      return;
    }
    if (S === "presnap") {
      if (k === " " || k === "enter") snap();
      if (k === "q") audible(-1);
      if (k === "e") audible(1);
      return;
    }
    if (S === "kick" && !G.kick.cpu && (k === " " || k === "enter")) { kickLocked(); return; }
    if (S === "over" && (k === "enter" || k === " ")) {
      G.showBox = false;
      if (G.mode === "season" || G.mode === "career") { G.state = "hub"; }
      else { G.state = "menu"; G.menuIdx = 0; }
      return;
    }
    if (S === "live") {
      // SHIFT — offense: juke the carrier; defense: quetzalcoatlus takes flight
      if (k === "shift") {
        if (G.carrier && G.controlled === G.carrier) doJuke(G.carrier);
        else if (!offenseIsUser() && G.controlled && G.controlled.species === "quetz" && soarReady(G.controlled)) {
          const c2 = G.controlled, d = kdir();
          const tgt = (d.x || d.y) ? { x: c2.x + d.x * 100, y: c2.y + d.y * 100 } :
            (G.carrier ? G.carrier : { x: c2.x - 100, y: c2.y });
          startSoar(c2, tgt);
        }
        // blocked pass-rusher: SHIFT = spin/swim move to try to shed the block
        else if (!offenseIsUser() && G.controlled && G.controlled.blockedBy && G.controlled.spinCd <= 0) {
          const c2 = G.controlled;
          c2.spinCd = 1.3; c2.spinT = 0.3; sfx.juke();
          if (Math.random() < 0.4 + ((c2.str || 80) - (c2.blockedBy.str || 75)) / 110) {
            c2.blockedBy.engaged = null; c2.blockedBy = null; c2.freeT = 2.5;
          }
        }
      }
      if ((k === "e" || k === "control") && G.carrier && G.controlled === G.carrier) doDive(G.carrier);
      if (k === "q" && offenseIsUser() && G.carrier && G.controlled === G.carrier) lateral();
      // F — peanut punch (defense, near the carrier). TIME IT: press as you
      // arrive on the carrier for the best odds of jarring it loose.
      if (k === "f" && !offenseIsUser() && G.controlled) startPunch(G.controlled);
      if (k === " ") {
        if (G.aim && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) { throwBullet(); }
        // ball in the air: SPACE is a TIMED JUMP for receivers AND defenders —
        // a defender who times the leap can pick the pass off (dive still
        // works any other time)
        else if (G.ball.mode === "air" && G.controlled && (G.controlled.routeEligible || G.controlled.team === "def")) timedJump(G.controlled);
        else if (!offenseIsUser() && G.controlled) doDive(G.controlled);
      }
      if (k === "x" && G.phase === "drop" && offenseIsUser()) { // throwaway
        G.ball = { mode: "air", kind: "lob", away: true, from: { x: G.ball.holder.x, y: G.ball.holder.y }, to: { x: G.ball.holder.x + 160, y: TOP - 40 }, t: 0, T: 0.8, x: G.ball.holder.x, y: G.ball.holder.y, z: 12, holder: null };
        G.phase = "air"; G.aim = null; sfx.throw();
      }
      if (k === "r") tryRampage();
      if (k === "v") throwSnowball();
      if (k === "tab" && !offenseIsUser()) switchDefender();
    }
    if (S === "ptchoice") {
      if (k === "1") ptChoose(false);
      if (k === "2") ptChoose(true);
    }
  }

  function doJuke(e) {
    if (e.jukeCd > 0 || e.proneT > 0) return;
    e.jukeT = 0.32; e.jukeCd = 2.1; e.spinT = 0.32; sfx.juke();
    // the cut: snap velocity to the opposite lateral side (a real cutback)
    const cutY = e.vy >= 0 ? -1 : 1;
    e.vy = cutY * Math.max(60, Math.abs(e.vy) + 40);
    // a juke has to be TIMED: it only shakes defenders who are right on top
    // of you and closing hard — soaring tacklers can't be juked at all
    for (const d of G.players) {
      if (d.team === e.team || d.staggerT > 0 || d.soarT > 0) continue;
      const dd = dist(d, e);
      const closing = (d.vx * (e.x - d.x) + d.vy * (e.y - d.y)) / Math.max(1, dd);
      if (dd < 24 && closing > 55) {
        d.staggerT = 0.38 + Math.max(0, (e.agi - d.agi)) / 260;
      }
    }
  }
  function doDive(e) {
    if (e.diveT > 0 || e.proneT > 0) return;
    e.diveT = 0.3;
  }
  function switchDefender() {
    const defs = G.players.filter((e) => e.team === "def" && e.role !== "DL");
    if (!defs.length) return;
    const ref = G.carrier || G.ball;
    defs.sort((a, b) => dist(a, ref) - dist(b, ref));
    const cur = defs.indexOf(G.controlled);
    setControlled(defs[(cur + 1) % defs.length]);
  }

  // ---------------------------------------------------------------- menus
  function menuOptions() {
    const opts = [["EXHIBITION", "one game, any matchup"]];
    opts.push(["2-PLAYER VERSUS", "you vs a friend on one screen"]);
    if (window.DINO_BOWL_FIREBASE_CONFIG) opts.push(["ONLINE VERSUS", "host a link — remote friend controls Team B"]);
    opts.push(["PRACTICE", "free reps: passing, running, punch, flight, RAMPAGE"]);
    const sz = loadSeason(), cr = loadCareer();
    if (sz && cr) opts.push(["CONTINUE CAREER", cr.name + " · " + cr.pos + " · " + TEAMS[cr.team][0]]);
    else if (sz) opts.push(["CONTINUE SEASON", "pick up where the herd left off"]);
    opts.push(["NEW SEASON", "17 games + playoffs + the DINO BOWL"]);
    opts.push(["NEW CAREER", "create a dino, take the DINOLICK, get drafted"]);
    opts.push(["MEET THE QBS", "all 32 starting quarterbacks, dino-fied"]);
    opts.push(["TUTORIAL", "everything explained — even Cover 4 and Tampa 2"]);
    opts.push(["SCOUTING", "every player ranked: speed, strength, jump…"]);
    opts.push(["PLAYBOOK LAB", "draw your own play, run it in games"]);
    return opts;
  }
  function menuKey(k) {
    const opts = menuOptions();
    if (k === "arrowright" || k === "d") G.menuIdx = (G.menuIdx + 1) % opts.length;
    if (k === "arrowleft" || k === "a") G.menuIdx = (G.menuIdx + opts.length - 1) % opts.length;
    if (k === "arrowdown" || k === "s") G.menuIdx = (G.menuIdx + 3) % opts.length;
    if (k === "arrowup" || k === "w") G.menuIdx = (G.menuIdx + opts.length - 3) % opts.length;
    if (k === "escape") { G.state = "title"; return; }
    if (k !== "enter" && k !== " ") return;
    G.humanB = false; G.practice = false;   // reset; versus/practice re-enable below
    const pick = opts[G.menuIdx][0];
    if (pick === "EXHIBITION") {
      G.mode = "exhibition"; G.selectFor = "exh"; G.career = null; G.humanB = false;
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
    } else if (pick === "2-PLAYER VERSUS") {
      G.mode = "versus"; G.selectFor = "exh"; G.career = null; G.humanB = true;
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
    } else if (pick === "ONLINE VERSUS") {
      G.mode = "online"; G.selectFor = "exh"; G.career = null; G.humanB = true;
      startOnlineHost();
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
    } else if (pick === "PRACTICE") {
      startPractice();
    } else if (pick === "CONTINUE SEASON") {
      G.mode = "season"; G.career = null; G.szn = loadSeason(); G.state = "hub";
    } else if (pick === "CONTINUE CAREER") {
      startCareerFlow();
    } else if (pick === "NEW SEASON") {
      G.mode = "season"; G.selectFor = "season"; G.career = null; clearCareer();
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0;
    } else if (pick === "NEW CAREER") {
      clearCareer(); clearSeason(); G.szn = null;
      startCareerFlow();
    } else if (pick === "MEET THE QBS") {
      G.state = "qbs";
    } else if (pick === "TUTORIAL") {
      G.tut = 0; G.state = "tutorial";
    } else if (pick === "SCOUTING") {
      openScouting();
    } else if (pick === "PLAYBOOK LAB") {
      openEditor();
    }
  }
  function menuTapAt(mx, my) {
    for (const r2 of menuCardRects()) {
      if (mx >= r2.x && mx <= r2.x + r2.w && my >= r2.y && my <= r2.y + r2.h) {
        G.menuIdx = r2.i; menuKey("enter"); return;
      }
    }
  }
  function hubKey(k) {
    if (G.szn && G.szn.phase === "done") {
      if ((k === "enter" || k === " ") && G.mode === "season") { startOffseason(); return; }
      if (k === "enter" || k === " ") {
        clearSeason(); G.szn = null;
        if (G.mode === "career") clearCareer();
        G.state = "menu"; G.menuIdx = 0;
      }
      return;
    }
    if (k === "enter" || k === " " || k === "p") { startSeasonGame(); }
    if (k === "s") G.state = "standings";
    if (k === "t") G.state = "sznstats";
    if (k === "escape") { saveSeason(); G.state = "menu"; G.menuIdx = 0; }
  }

  // ------------------------------------------------------------- selections
  function selectKey(k) {
    const cols = 8;
    let sel = G.selStep === 0 ? G.selA : G.selB;
    if (k === "arrowright" || k === "d") sel = (sel + 1) % 32;
    if (k === "arrowleft" || k === "a") sel = (sel + 31) % 32;
    if (k === "arrowdown" || k === "s") sel = (sel + cols) % 32;
    if (k === "arrowup" || k === "w") sel = (sel + 32 - cols) % 32;
    if (G.selStep === 0) G.selA = sel; else G.selB = sel;
    if (k === "enter" || k === " ") {
      if (G.selectFor === "season") { newSeason(ABBRS[G.selA]); G.state = "hub"; return; }
      if (G.selectFor === "career") { careerPickTeam(ABBRS[G.selA]); return; }
      if (G.selStep === 0) { G.selStep = 1; if (G.selB === G.selA) G.selB = (G.selA + 16) % 32; }
      else startGame();
    }
    if (k === "escape") { if (G.selStep === 1) G.selStep = 0; else { G.state = "menu"; } }
  }
  function teamCellAt(mx, my) {
    const gx0 = 188, gy0 = 150, cw = 74, ch = 56;
    for (let i = 0; i < 32; i++) {
      const cxp = gx0 + (i % 8) * cw, cyp = gy0 + ((i / 8) | 0) * ch;
      if (mx >= cxp && mx < cxp + cw - 8 && my >= cyp && my < cyp + ch - 8) return i;
    }
    return -1;
  }
  function selectClick() {
    const i = teamCellAt(mouse.x, mouse.y);
    if (i >= 0) {
      if (G.selStep === 0) {
        if (G.selA === i) {
          if (G.selectFor === "season") { newSeason(ABBRS[i]); G.state = "hub"; return; }
          if (G.selectFor === "career") { careerPickTeam(ABBRS[i]); return; }
          G.selStep = 1; if (G.selB === i) G.selB = (i + 16) % 32;
        }
        else G.selA = i;
      } else {
        if (G.selB === i) startGame(); else G.selB = i;
      }
    }
  }

  // playcall cards
  function currentCards() {
    let cards = G.callsheet.map((p) => ({ kind: "play", play: p }));
    if (G.state === "playcall" && G.down === 4 && !G.patMode) {
      cards = cards.slice(0, 2);
      cards.push({ kind: "PUNT" });
      if (100 - G.losYd + 17 <= 62) cards.push({ kind: "FG" }); // in plausible range only
    }
    return cards;
  }
  function cardRects(cards) {
    const n = cards.length, cw = 168, gap = 16;
    const total = n * cw + (n - 1) * gap, x0 = (W - total) / 2;
    return cards.map((c, i) => ({ x: x0 + i * (cw + gap), y: 356, w: cw, h: 128, c }));
  }
  function playcallClick() {
    const cards = currentCards();
    for (const r of cardRects(cards)) {
      if (mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h) { cardAction(r.c); return; }
    }
  }
  function cardAction(c) {
    if (c.kind === "PUNT") { enterKick("PUNT"); return; }
    if (c.kind === "FG") { enterKick("FG"); return; }
    choosePlay(c.play, G.state === "defcall");
  }

  // ================================================================== UPDATE
  let lastT = 0;
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;
    try {
      update(dt);
      // 12 fps state replication is smooth for this pixel-art game while
      // leaving enough database headroom for player input.
      if (Net.role === "host" && Net.db && t - Net.lastFrame > 83) {
        Net.lastFrame = t;
        Net.db.ref("dinobowl/rooms/" + Net.room + "/frame").set(netFrame());
      }
      render();
    }
    catch (err) { G.lastErr = String(err); }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    // Guests only draw the host's authoritative snapshots.
    if (Net.remoteView) return;
    // ambient pteros
    if (Math.random() < dt * 0.06) spawnPtero();
    for (const p of G.pteros) { p.x += p.v * dt; p.f += dt * 6; }
    G.pteros = G.pteros.filter((p) => p.x < G.camX + W + 100);
    // ★ once in a while, a meteor streaks across the sky. The crowd pretends
    // not to notice. (it IS a dinosaur game — a little existential dread is thematic)
    if (!G.meteor && Math.random() < dt * 0.004 && !["title", "select", "menu"].includes(G.state)) {
      G.meteor = { x: -60, y: rnd(4, 20), vx: rnd(500, 700), vy: rnd(20, 45), t: 2.2 };
    }
    if (G.meteor) {
      G.meteor.x += G.meteor.vx * dt; G.meteor.y += G.meteor.vy * dt; G.meteor.t -= dt;
      if (G.meteor.t <= 0 || G.meteor.x > W + 80) G.meteor = null;
    }
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    if (G.snowCd > 0) G.snowCd -= dt;
    if (G.selCard && G.selCard.t > 0) G.selCard.t -= dt;
    if (G.ticker && G.ticker.t > 0) G.ticker.t -= dt;
    // crowd volume: alive during play, LOUD in a close 4th quarter
    initCrowd();
    if (crowdGain) {
      crowdSpike = Math.max(0, crowdSpike - dt * 0.08);
      const inGame = ["live", "presnap", "dead", "kick", "playcall", "defcall", "ptchoice"].includes(G.state);
      const close = (G.quarter >= 4) && Math.abs(G.score.A - G.score.B) <= 8;
      let vol = !inGame || muted ? 0 : (G.state === "live" ? 0.026 : 0.012);
      if (close && inGame && !muted) vol += 0.04;
      vol += muted ? 0 : crowdSpike;
      crowdGain.gain.setTargetAtTime(vol, AC.currentTime, 0.4);
    }
    if (G.banner && G.banner.t < 90) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
    if (G.fdFlash > 0) G.fdFlash -= dt;
    updateParticles(dt);

    const S = G.state;
    if (S === "dead") {
      G.deadT -= dt;
      if (G.deadRecT > 0) { G.deadRecT -= dt; snapshotFrame(); }   // film the aftermath
      // cosmetic action timers finish playing out after the whistle so
      // hops, throws and swats don't freeze mid-pose
      for (const e of G.players || []) {
        if (e.celebPhase) continue;
        if (e.jumpT > 0) e.jumpT -= dt;
        if (e.spinT > 0) e.spinT -= dt;
        if (e.throwT > 0) e.throwT -= dt;
        if (e.swingT > 0) e.swingT -= dt;
        // first-down celebration: pop back up and keep hopping while signalling
        if (e.fdCeleb > 0) {
          e.fdCeleb -= dt; e.proneT = 0;
          if (e.jumpT <= 0) e.jumpT = 0.45;
          if (e.fdCeleb <= 0) e.fdCeleb = 0;
        }
      }
      if (G.celebrate) updateCelebration(dt);
      if (G.deadT <= 0 && G.deadNext) { const f = G.deadNext; G.deadNext = null; f(); }
      updateCamera(dt);
      return;
    }
    if (S === "kick") { updateKick(dt); return; }
    if (S === "halftime") { updateHalftime(dt); return; }
    if (S === "replay") { updateReplay(dt); return; }
    if (S === "career_quiz" || S === "career_drill") { updateCareer(dt); return; }
    if (S !== "live") return;

    G.playT += dt;
    if (!G.practice && !G.patMode) G.clock = Math.max(0, G.clock - dt * 2.2);
    if (G.aim && mouse.down && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) G.aim = worldMouse();
    if (G.soarAim && mouse.down && !offenseIsUser()) G.soarAim = soarMouse();
    if (G.ramp) { G.ramp.t -= dt; if (G.ramp.t <= 0) G.ramp = null; }

    updateBall(dt);
    for (const e of G.players) updateEntity(e, dt);
    checkTackles(dt);
    checkBounds();
    updateCamera(dt);
    snapshotFrame();

    // handoff moment
    if (G.phase === "handoff" && G.playT > 0.45) {
      const rb = G.players.find((e) => e.role === "RB");
      becomeCarrier(rb);
    }
    // CPU QB (also throws for YOUR team when you chose to play as a receiver)
    const userIsReceiver = offenseIsUser() && G.controlled && G.controlled !== G.ball.holder &&
      G.controlled.team === "off" && G.ball.mode === "held";
    if (G.phase === "drop" && (!offenseIsUser() || userIsReceiver)) cpuQB(dt);
    // user QB dropback auto-drift
    if (G.phase === "drop" && offenseIsUser() && !userIsReceiver) {
      const qb = G.ball.holder;
      if (qb && qb.role === "QB") {
        const d = kdir();
        const sp = qb.spd * 0.9 * G.weather.speedMod;
        if (d.x || d.y) { qb.x += d.x * sp * dt; qb.y += d.y * sp * dt; }
        else if (G.playT < 0.7) qb.x -= 70 * dt;
        qb.y = clamp(qb.y, TOP + 8, BOT - 8);
        // QB crosses LOS -> becomes a runner
        if (qb.x > xAtYd(G.losYd) + 6) { becomeCarrier(qb); G.aim = null; }
        // sack timer safety: defenders handle it via tackles on holder
      }
    }
    // CPU rampage (offensive or defensive apex)
    if (G.rampage.B >= 100) tryRampage(true);
    // flea flicker: the back auto-pitches it home to the QB
    if (G.curPlay && G.curPlay.flicker && !G.flickerDone && G.phase === "carry" &&
      G.carrier && G.carrier.role === "RB" && G.playT > 1.15) {
      const qb = G.players.find((p) => p.role === "QB");
      if (qb) doLateral({ x: qb.x, y: qb.y });
    }
    // clock expiry mid-drive
    if (G.clock <= 0 && G.phase === "idle") endQuarter();
  }

  function updateCamera(dt) {
    const b = G.ball;
    // the camera stays glued to the football — including a LOOSE fumble
    // bouncing on the turf — so you always see who actually falls on it
    const target = G.carrier || (b && (b.mode === "air" || b.mode === "loose") ? b : b && b.holder) || { x: xAtYd(G.losYd) };
    const want = clamp(target.x - W * 0.45, 0, FIELD_LEN - W);
    G.camX += (want - G.camX) * Math.min(1, dt * (b && b.mode === "loose" ? 8 : 5));
  }

  // ----------------------------------------------------------- ball physics
  function updateBall(dt) {
    const b = G.ball;
    if (b.mode === "held" && b.holder) { b.x = b.holder.x + b.holder.dir * 8; b.y = b.holder.y; b.z = 12; return; }
    if (b.mode === "loose") {
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.vx *= 0.94; b.vy *= 0.94;
      b.z = Math.abs(Math.sin(b.t * 9)) * 10 * Math.max(0, 1 - b.t * 0.8);
      // a fumble that rolls out of bounds is dead at the spot it crossed the
      // line — the team that coughed it up keeps possession there
      if (b.y <= TOP + 2 || b.y >= BOT - 2) {
        b.mode = "dead";
        playDead("FUMBLE OUT OF BOUNDS", { spotYd: clamp(ydAtX(b.x), 1, 99) });
        return;
      }
      if (b.t > 0.45) {
        // WHOEVER is actually on the ball gets it — linemen included
        const near = G.players.filter((e) => e.staggerT <= 0 && e.proneT <= 0)
          .sort((p, q2) => dist(p, b) - dist(q2, b))[0];
        if (near && dist(near, b) < 17) {
          near.x = b.x; near.y = b.y;   // the recoverer is visibly ON the ball
          recoverBall(near);
        }
      }
      if (b.t > 6) { // nobody wants it — offense keeps at the spot
        const any = G.players.filter((e) => e.team === "off").sort((p, q2) => dist(p, b) - dist(q2, b))[0];
        if (any) { any.x = b.x; any.y = b.y; recoverBall(any); }
      }
      return;
    }
    if (b.mode === "air") {
      b.t += dt;
      const k = Math.min(1, b.t / b.T);
      b.x = b.from.x + (b.to.x - b.from.x) * k;
      b.y = b.from.y + (b.to.y - b.from.y) * k;
      if (b.kind === "lateral") {
        b.z = 12 + 14 * Math.sin(Math.PI * k);
        if (k >= 1) {
          const mate = G.players.filter((e) => e.team === "off" && e.role !== "OL")
            .sort((p, q2) => dist(p, b.to) - dist(q2, b.to))[0];

          const catchRadius = mate && mate.controlled ? 34 : 30; // 10%+ radius boost
          const catchRate = 0.92 + ((mate ? mate.hands : 75) - 75) / 400 + (mate && mate.controlled ? 0.10 : 0); // 10% catch rate boost

          if (mate && dist(mate, b.to) < catchRadius && Math.random() < catchRate) {
            mate.x = b.to.x; mate.y = b.to.y;
            // flea flicker: the ball comes back to a throwing QB
            if (mate.role === "QB" && G.curPlay.flicker) {
              G.ball = { mode: "held", holder: mate, x: mate.x, y: mate.y, z: 12 };
              G.carrier = null; G.phase = "drop"; mate.state = "idle";
              G.flickerDone = true;
              if (offenseIsUser()) setControlled(mate);
              sfx.catch();
            } else {
              becomeCarrier(mate);
              sfx.catch();
            }
          } else {
            dropBall(b.to.x, b.to.y, "LATERAL LOOSE!");
          }
        }
        return;
      }
      if (b.kind === "lob") {
        const d = dist(b.from, b.to);
        const h = clamp(d * 0.28, 26, 120);
        b.z = 12 + h * 4 * k * (1 - k);
      } else {
        b.z = 14 + 10 * Math.sin(Math.PI * k) - 6 * k;
        // bullet can be picked mid-flight by defenders in the lane
        for (const e of G.players) {
          if (e.team !== "def" || e.staggerT > 0) continue;
          if (Math.abs(e.x - b.x) < 12 && Math.abs(e.y - b.y) < 12 && b.t > 0.08 && k < 0.92) {
            if (Math.random() < 0.3 + (e.controlled ? 0.2 : 0) + (e.jumpT > 0 ? 0.15 : 0)) { intercepted(e, e); return; }
            else { incomplete({ x: b.x, y: b.y }); return; }
          }
        }
      }
      // as the pass arrives, the nearest receiver and nearest defender both leap
      // (nobody leaps for a throwaway or a ball landing out of bounds)
      if ((b.kind === "lob" || b.kind === "bullet") && !b.contested && k > 0.8 &&
        !b.away && b.to.y > TOP + 4 && b.to.y < BOT - 4) {
        b.contested = true;
        const rec = eligible().map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        const df = G.players.filter((e) => e.team === "def")
          .map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        if (rec && rec.d < 44) rec.e.jumpT = 0.4;
        if (df && df.d < 44) df.e.jumpT = 0.4;
      }
      if (k >= 1) {
        if (b.to.y <= TOP || b.to.y >= BOT) { incomplete(b.to); return; } // throwaway OOB
        resolveArrival();
      }
    }
  }

  // -------------------------------------------------------------- entity AI
  function updateEntity(e, dt) {
    e.animT += dt * (Math.hypot(e.vx, e.vy) > 10 ? 7 : 2);
    if (e.throwT > 0) e.throwT -= dt;   // cosmetic timers always tick
    if (e.spinT > 0) e.spinT -= dt;
    if (e.swingT > 0) e.swingT -= dt;
    if (e.jumpT > 0) e.jumpT -= dt;
    // a soaring quetzalcoatlus is UNSTOPPABLE mid-flight: blocks, jukes and
    // shoves don't ground it — it tackles from the air. Checked before
    // stagger/prone so contact can never freeze a flight in place.
    if (e.soarT > 0) {
      e.staggerT = 0; e.proneT = 0;
      e.soarT -= dt;
      const fsp = e.spd * 1.9 * (G.weather ? G.weather.speedMod : 1);
      e.vx = e.soarDir.x * fsp; e.vy = e.soarDir.y * fsp;
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.y = clamp(e.y, TOP - 4, BOT + 4);
      if (Math.abs(e.vx) > 5) e.dir = e.vx > 0 ? 1 : -1;
      return;
    }
    if (e.staggerT > 0) { e.staggerT -= dt; e.vx = e.vy = 0; return; }
    if (e.proneT > 0) { e.proneT -= dt; e.vx = e.vy = 0; return; }
    if (e.jukeCd > 0) e.jukeCd -= dt;
    if (e.tackleCd > 0) e.tackleCd -= dt;
    if (e.spinCd > 0) e.spinCd -= dt;
    if (e.punchCd > 0) e.punchCd -= dt;

    let passMod = 1;
    if (e.apex) {
      if (e.passive === "escape" && e === G.carrier) passMod = 1.18;         // scrambling QB
      if ((e.passive === "sack" || e.passive === "wall") && e.state === "rush") passMod = 1.2;
    }
    const speedMod = G.weather.speedMod * (e.jukeT > 0 ? 0.92 : 1) * (e.diveT > 0 ? 1.9 : 1) *
      (G.ramp && G.ramp.ent === e ? 1.28 : 1) * (e.soarT > 0 ? 1.9 : 1) * passMod;
    if (e.jukeT > 0) e.jukeT -= dt;
    if (e.diveT > 0) {
      e.diveT -= dt;
      if (e.diveT <= 0) {
        if (e === G.carrier) { playDead("DIVE", null, false); return; }
        e.proneT = 0.55;
      }
    }
    const sp = e.spd * speedMod;

    if (e.soarCd > 0) e.soarCd -= dt;
    // the wings recharge on the ground — full tank in ~1 second
    if (e.species === "quetz" && G.state === "live") {
      e.soarCharge = Math.min(1, (e.soarCharge == null ? 0.35 : e.soarCharge) + dt * 0.7);
    }
    if (e.punching > 0) e.punching -= dt;

    // --- user-controlled movement
    // While a pass is in the air you do NOT steer the intended receiver —
    // he keeps running his route (and adjusts to the ball) like a real WR.
    // Your only input is TIMING THE JUMP (space/click as it arrives); the
    // sticks come back the instant he catches it.
    const receiverOnAuto = e.team === "off" && e !== G.carrier && G.ball.mode === "air" && !G.ball.away;
    if (e.controlled && !receiverOnAuto && (e === G.carrier || e !== G.ball.holder) && (e.team === "def" ||
      e.team === "off") && G.state === "live") {
      const d = kdir();
      // hands off the sticks? a controlled receiver keeps running his route
      if (!d.x && !d.y && e.team === "off" && e !== G.carrier && e.state === "route" &&
        e.path && e.pathI < e.path.length) {
        const wp = e.path[e.pathI];
        moveToward(e, wp, sp, dt);
        if (dist(e, wp) < 8) e.pathI++;
        return;
      }
      // fighting through a block: slowed, not frozen — win the rep to run free
      let csp = sp;
      if (e.blockedBy) {
        e.engageT -= dt;
        csp *= 0.42;
        if (e.engageT <= 0) {
          if (e.rushTech === "spin") e.spinT = 0.3;
          e.blockedBy.engaged = null; e.blockedBy = null; e.freeT = 2.5;
        }
      }
      const m = Math.hypot(d.x, d.y) || 1;
      e.vx = (d.x / m) * csp; e.vy = (d.y / m) * csp;
      if (e.diveT > 0) { const dm = Math.hypot(e.vx, e.vy) || 1; e.vx = (e.vx / dm) * sp; e.vy = (e.vy / dm) * sp; if (!d.x && !d.y) { e.vx = e.dir * sp; } }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.vx) e.dir = e.vx > 0 ? 1 : -1;
      e.y = clamp(e.y, TOP - 4, BOT + 4);
      return;
    }

    // --- AI by state
    switch (e.state) {
      case "route": {
        // press at the line: a corner in your chest jams the release — a
        // quick hand-fight decides who wins the first two steps. Only right
        // off the snap, only near the line, never once the ball is gone.
        if (G.playT < 0.45 && !e.pressDone && G.ball.mode === "held" &&
          Math.abs(e.x - xAtYd(G.losYd)) < 34) {
          const jam = G.players.find((p) => p.team === "def" && p.coverSlot === e.role && dist(p, e) < 22);
          if (jam) {
            e.pressDone = true;
            e.swingT = 0.3; jam.swingT = 0.3;      // visible hand-fighting
            const win = Math.random() < 0.5 + ((e.agi || 75) - (jam.str || 70)) / 150;
            if (win) jam.staggerT = 0.35;           // swim move — free release
            else { e.staggerT = 0.3; }              // jammed at the line
          }
        }
        // the nearest receiver adjusts to a ball in flight — but never chases
        // a throwaway or a ball that's clearly sailing out of bounds
        if (G.ball.mode === "air" && !G.ball.away &&
          G.ball.to.y > TOP + 4 && G.ball.to.y < BOT - 4) {
          let nearest = null, nd = 1e9;
          for (const r2 of eligible()) { const dd = dist(r2, G.ball.to); if (dd < nd) { nd = dd; nearest = r2; } }
          // the INTENDED receiver (controlled) always works back to the ball,
          // not just whoever happens to be nearest as it comes down
          if ((nearest === e && nd < 220) || (e.controlled && dist(e, G.ball.to) < 260)) {
            const tgt = { x: G.ball.to.x, y: clamp(G.ball.to.y, TOP + 8, BOT - 8) };
            moveToward(e, tgt, sp, dt); break;
          }
        }
        if (!e.path || e.pathI >= e.path.length) {
          if (e.endMode === "go" && e.x < xAtYd(106)) moveToward(e, { x: e.x + 100, y: e.y }, sp, dt);
          else { e.vx *= 0.8; e.vy *= 0.8; }
          break;
        }
        const wp = e.path[e.pathI];
        moveToward(e, wp, sp * (G.curPlay && G.curPlay.deep ? 1.06 : 1), dt);
        if (dist(e, wp) < 8) e.pathI++;
        break;
      }
      case "block": {
        // OL / blocking: pick nearest unengaged rusher
        if (e.engaged) {
          const r2 = e.engaged;
          if (r2.staggerT > 0 || (r2.state !== "rush" && !r2.controlled)) { e.engaged = null; break; }
          if (dist(e, r2) > 42) { r2.blockedBy = null; e.engaged = null; e.staggerT = 0.3; break; } // beaten clean
          // stay latched onto the rusher (mirror his fight)
          moveToward(e, { x: r2.x + (e.team === "off" ? -8 : 8), y: r2.y }, sp * 1.05, dt);
          break;
        }
        if (e.engaged && G.ramp && G.ramp.ent === e.engaged) { e.engaged.blockedBy = null; e.engaged = null; e.staggerT = 0.8; }
        const rushers = G.players.filter((p) => p.team !== e.team && p.state === "rush" && !p.blockedBy && !(p.freeT > 0) && !(G.ramp && G.ramp.ent === p));
        rushers.sort((a, b) => dist(a, e) - dist(b, e));
        if (!rushers[0] || dist(rushers[0], e) > 120) {
          // nothing to block: climb to the second level / escort the carrier
          const esc = G.carrier && G.carrier.team === e.team ? G.carrier : G.ball.holder;
          if (esc) moveToward(e, { x: esc.x + (e.team === "off" ? 24 : -24), y: e.y }, sp * 0.7, dt);
          break;
        }
        if (rushers[0] && dist(rushers[0], e) < 120) {
          const qb = G.ball.holder || e;
          const mid = { x: (rushers[0].x + qb.x) / 2, y: (rushers[0].y + qb.y) / 2 };
          moveToward(e, mid, sp * 0.9, dt);
          if (dist(e, rushers[0]) < 16) {
            const r0 = rushers[0];
            e.engaged = r0; r0.blockedBy = e;
            // trench battle: blocker STRENGTH vs rusher STRENGTH decides how
            // long the block holds — but no block survives past 1.7s, and an
            // elite rusher occasionally wins the rep instantly and runs free
            const diff2 = ((e.str || 75) - (r0.str || 75)) / 40;
            let hold = clamp(rnd(0.45, 0.9) * (1 + diff2), 0.3, 1.7);
            const eliteEdge = (r0.str || 75) - (e.str || 75);
            // every rusher can occasionally win his rep quickly; elites do it often
            if (Math.random() < 0.08) hold = Math.min(hold, rnd(0.3, 0.7));
            if (eliteEdge > 4 && Math.random() < 0.22 + eliteEdge * 0.014) hold = rnd(0.2, 0.5);
            if (r0.apex && (r0.passive === "sack" || r0.passive === "wall") && Math.random() < 0.4) hold = Math.min(hold, rnd(0.25, 0.55));
            r0.engageT = hold;
          }
        }
        break;
      }
      case "rush": {
        const tgt = G.carrier || G.ball.holder;
        if (e.freeT > 0) e.freeT -= dt;
        if (e.blockedBy) {
          e.engageT -= dt;
          // the pair FIGHTS: a stronger rusher walks his blocker back into the
          // pocket (bull rush doubles down), a stronger blocker stonewalls
          const qb2 = G.ball.holder || G.carrier;
          const push = clamp(((e.str || 80) - (e.blockedBy.str || 75)) * 0.9, -10, 30) + (e.rushTech === "bull" ? 15 : 0);
          if (qb2 && push !== 0) {
            const dx2 = qb2.x - e.x, dy2 = qb2.y - e.y, m2 = Math.hypot(dx2, dy2) || 1;
            e.x += (dx2 / m2) * push * dt; e.y += (dy2 / m2) * push * dt;
            e.blockedBy.x += (dx2 / m2) * push * dt; e.blockedBy.y += (dy2 / m2) * push * dt;
          }
          e.x += rnd(-8, 6) * dt; e.y += rnd(-8, 8) * dt;
          if (e.engageT <= 0) {
            if (e.rushTech === "spin") e.spinT = 0.3;   // spins off the block
            e.blockedBy.engaged = null; e.blockedBy = null; e.freeT = 2.5;
          }
          break;
        }
        if (G.ball.mode === "loose") { moveToward(e, G.ball, sp, dt); break; }
        // speed rush: an unblocked edge bends the arc around the tackle first
        if (e.rushTech === "speed" && G.phase === "drop" && G.playT < 0.85 && !(e.freeT > 0)) {
          moveToward(e, { x: xAtYd(G.losYd) - 26, y: MID + (e.y > MID ? 108 : -108) }, sp * 1.04, dt);
          break;
        }
        if (e.contain && tgt) {
          // stay outside: attack the QB's rollout shoulder, not his back
          const side = e.y > tgt.y ? 1 : -1;
          pursue(e, { x: tgt.x + 18, y: tgt.y + side * 16, vx: tgt.vx, vy: tgt.vy }, sp, dt);
          break;
        }
        // a rusher who has beaten his block closes on the QB with urgency
        if (tgt && tgt === G.carrier) pursue(e, tgt, sp * 1.0, dt);
        else if (tgt) moveToward(e, tgt, sp * (G.phase === "drop" ? 1.16 : 0.92), dt);
        break;
      }
      case "read": { // linebackers: read-and-react — crash the run, wall the pass
        const tgt = G.carrier;
        if (tgt) {
          // run fit: trigger DOWNHILL hard while the back is still in the box
          const crash = tgt.x < xAtYd(G.losYd) + 30 ? 1.03 : 0.95;
          pursue(e, tgt, sp * crash, dt);
        }
        else if (G.ball.mode === "air") breakOnBall(e, sp, dt);
        else if (G.ball.mode === "loose") moveToward(e, G.ball, sp, dt);
        else if (G.phase === "drop" && G.playT > 0.5) {
          // pass shows: sink into the hook window and wall off the crossers
          const hook = { x: xAtYd(G.losYd) + 120, y: e.y };
          let threat = null, td2 = 110;
          for (const r2 of eligible()) { const dd = Math.hypot(r2.x - hook.x, r2.y - hook.y); if (dd < td2) { td2 = dd; threat = r2; } }
          moveToward(e, threat ? { x: threat.x + 10, y: threat.y } : hook, sp * 0.82, dt);
        }
        else { const home = { x: xAtYd(G.losYd) + 80, y: e.y }; moveToward(e, home, sp * 0.5, dt); }
        break;
      }
      case "spy": { // shadow the QB to contain a scramble, then attack
        if (G.carrier) { pursue(e, G.carrier, sp * 1.0, dt); break; }
        if (G.ball.mode === "loose") { moveToward(e, G.ball, sp, dt); break; }
        const qb = G.ball.holder;
        if (qb) moveToward(e, { x: Math.min(qb.x + 26, xAtYd(G.losYd) + 30), y: qb.y }, sp * 0.7, dt);
        break;
      }
      case "cover": { // man coverage
        if (G.ball.mode === "air") { breakOnBall(e, sp, dt); break; }
        if (G.ball.mode === "loose") { moveToward(e, G.ball, sp, dt); break; }
        if (G.carrier) { pursue(e, G.carrier, sp * 1.0, dt); break; }
        let tgt = null;
        if (e.coverSlot) tgt = G.players.find((p) => p.role === e.coverSlot);
        if (!tgt) { // free safety: keep depth over the deepest threat
          const rec = eligible().sort((a, b) => b.x - a.x)[0];
          const minDepth = xAtYd(G.losYd) + 90;
          tgt = rec ? { x: Math.max(minDepth, rec.x + 34), y: (rec.y + MID) / 2 } : { x: xAtYd(G.losYd) + 220, y: MID };
          moveToward(e, tgt, sp * 0.95, dt); break;
        }
        // tight trail technique: sit on the receiver's near hip, matching speed
        moveToward(e, { x: tgt.x + 6, y: tgt.y }, sp * 1.0, dt);
        break;
      }
      case "zone": {
        if (G.ball.mode === "air") { breakOnBall(e, sp, dt); break; }
        if (G.ball.mode === "loose") { moveToward(e, G.ball, sp, dt); break; }
        if (G.carrier) { pursue(e, G.carrier, sp * 1.0, dt); break; }
        if (e.zone) {
          // smart zone: don't just stand on your landmark — pick up the most
          // dangerous receiver entering your area and shade onto him
          let threat = null, td2 = 110;
          for (const r2 of eligible()) {
            const dd = Math.hypot(r2.x - e.zone.x, r2.y - e.zone.y);
            if (dd < td2) { td2 = dd; threat = r2; }
          }
          if (threat) moveToward(e, { x: (threat.x + threat.vx * 0.3 + e.zone.x) / 2, y: (threat.y + threat.vy * 0.3 + e.zone.y) / 2 }, sp * 0.92, dt);
          else moveToward(e, e.zone, sp * 0.8, dt);
        }
        break;
      }
      case "leadblock": { // fullback: escort the carrier, flatten the first threat
        const c = G.carrier;
        if (!c) { moveToward(e, { x: e.x + 60, y: e.y }, sp * 0.9, dt); break; }
        const threat = G.players.filter((p) => p.team !== e.team && p.staggerT <= 0 && p.x > c.x - 20)
          .sort((p, q2) => dist(p, c) - dist(q2, c))[0];
        if (threat && dist(threat, c) < 140) {
          moveToward(e, threat, sp, dt);
          if (dist(e, threat) < 14) { threat.staggerT = 0.9; e.staggerT = 0.35; sfx.tackle(); }
        } else moveToward(e, { x: c.x + 40, y: c.y }, sp * 0.98, dt);
        break;
      }
      case "runblock": { // receiver on a run play: release + stalk-block a DB
        // on the SWEEP PASS the receivers sell the block... then sneak out deep
        if (G.curPlay && G.curPlay.sweepPass && G.playT > 0.9 && !e.leaked) {
          e.leaked = true; e.state = "route";
          e.path = [{ x: e.x + 10 * YPX, y: clamp(e.y + (e.y < MID ? -40 : 40), TOP + 12, BOT - 12) }];
          e.pathI = 0; e.endMode = "go";
          break;
        }
        if (!e.block) {
          const dbs = G.players.filter((p) => p.team !== e.team && ["CB", "S", "LB"].includes(p.role));
          dbs.sort((a, b2) => dist(a, e) - dist(b2, e));
          e.block = dbs[0] || null;
        }
        if (e.block) {
          const b2 = e.block;
          if (b2.soarT > 0) { e.block = null; break; }   // you can't stalk-block a flying dino
          // shadow the defender on the side between him and the ball carrier
          const ref = G.carrier || { x: xAtYd(G.losYd), y: MID };
          const side = b2.x > ref.x ? -6 : 6;
          moveToward(e, { x: b2.x + side, y: b2.y }, sp * 0.95, dt);
          if (dist(e, b2) < 16) {
            b2.vx *= 0.5; b2.vy *= 0.5; if (b2.staggerT <= 0) b2.staggerT = 0.12;
            // stalk blocks obey the trench rules too: strength decides how long
            // the pin lasts, and nothing stays blocked past 1.7 seconds
            e.blockHold = (e.blockHold || 0) + dt;
            const cap = clamp(0.7 + ((e.str || 68) - (b2.str || 70)) / 40, 0.35, 1.7);
            if (e.blockHold > cap) {
              e.blockHold = 0; e.block = null; e.staggerT = 0.5;
              b2.staggerT = 0; b2.freeT = 1.0;   // the defender sheds and runs free
            }
          }
        } else {
          moveToward(e, { x: e.x + 100, y: e.y }, sp * 0.9, dt);
        }
        break;
      }
      case "carry": {
        if (!e.controlled) cpuCarrier(e, sp, dt);
        break;
      }
      default: {
        // never stand frozen: drift with the play
        if (G.carrier && G.carrier.team === e.team) { moveToward(e, { x: G.carrier.x + 30, y: e.y }, sp * 0.5, dt); }
        else if (G.carrier) { pursue(e, G.carrier, sp * 0.95, dt); }
        else { e.vx *= 0.85; e.vy *= 0.85; e.x += e.vx * dt; e.y += e.vy * dt; }
      }
    }
  }

  function moveToward(e, tgt, sp, dt) {
    const dx = tgt.x - e.x, dy = tgt.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) { e.vx = e.vy = 0; return; }
    e.vx = (dx / d) * sp; e.vy = (dy / d) * sp;
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (Math.abs(e.vx) > 5) e.dir = e.vx > 0 ? 1 : -1;
  }

  // chase the carrier with a proper pursuit angle. Defenders take an
  // intercept angle and the nearest one gets a small closing burst, so a ball
  // carrier in the open actually gets run down (no free 30-yard scampers).
  function pursue(e, c, sp, dt) {
    const d = dist(e, c);
    const t = clamp(d / Math.max(60, sp), 0, 0.9);
    const lead = { x: c.x + c.vx * t * 0.85, y: clamp(c.y + c.vy * t * 0.85, TOP + 4, BOT - 4) };
    // the closest pursuer to the carrier bears down a touch faster
    if (c === G.carrier) {
      let nearest = null, nd = 1e9;
      for (const p of G.players) { if (p.team === e.team && p.staggerT <= 0 && p.proneT <= 0) { const dd = dist(p, c); if (dd < nd) { nd = dd; nearest = p; } } }
      if (nearest === e) sp *= 1.08;
    }
    // breakaway: nobody between the carrier and the endzone
    const defs = G.players.filter((p) => p.team === e.team);
    const breakaway = c.vx > 20 && !defs.some((p) => p.x > c.x + 12 && Math.abs(p.y - c.y) < 120);
    // an AI quetzalcoatlus safety answers a breakaway by taking flight
    if (breakaway && e.species === "quetz" && !e.controlled && soarReady(e) && d > 70 && d < 460) {
      startSoar(e, lead);
    }
    moveToward(e, lead, sp, dt);
  }

  // flight rules: the wings run on a CHARGE meter. A short hop is available
  // almost immediately; a full-field flight needs about a second of charge.
  // Using it last play just means starting this play on an empty tank.
  function soarReady(e) {
    return e.soarCd <= 0 && e.soarT <= 0 && (e.soarCharge || 0) >= 0.3;
  }
  function startSoar(e, tgt) {
    const dx = tgt.x - e.x, dy = tgt.y - e.y;
    const m = Math.hypot(dx, dy) || 1;
    e.soarDir = { x: dx / m, y: dy / m };
    // flight range is whatever the charge affords (steering is locked in)
    const flightSpd = e.spd * 1.9 * (G.weather ? G.weather.speedMod : 1);
    const maxT = 0.35 + (e.soarCharge || 0) * 1.35;
    e.soarT = clamp(m / flightSpd, 0.3, maxT);
    e.soarCharge = 0;
    e.soarCd = 0.9;
    e.staggerT = 0; e.proneT = 0;         // takeoff shrugs off any contact
    G.soarSpent = { side: sideOf(e), play: G.playNo };
    sfx.juke(); sfx.roar();
  }
  function breakOnBall(e, sp, dt) {
    const b = G.ball;
    if (b.away) return;   // nobody bites on a throwaway
    if (dist(e, b.to) < 240) moveToward(e, { x: b.to.x, y: clamp(b.to.y, TOP + 8, BOT - 8) }, sp, dt);
  }

  function cpuCarrier(e, sp, dt) {
    // steer downfield, dodge nearest defender
    const defs = G.players.filter((p) => p.team === "def" && p.staggerT <= 0);
    defs.sort((a, b) => dist(a, e) - dist(b, e));
    let ty = e.y;
    const n = defs[0];
    if (n && n.x > e.x - 10 && dist(n, e) < 95) {
      ty = e.y + (n.y > e.y ? -1 : 1) * 90;
      // jukes are a gamble, not a reflex — a good back only breaks one now and
      // then, and elite agility makes it more likely to land
      if (dist(n, e) < 28 && e.jukeCd <= 0 && Math.random() < 0.018 + Math.max(0, (e.agi - 75)) / 900) doJuke(e);
    }
    // situational smarts: lay out for the goal line or the sticks when a
    // tackler is about to arrive
    if (e.diveT <= 0 && n && dist(n, e) < 42) {
      const goalX = xAtYd(100), fdX2 = xAtYd(Math.min(100, G.losYd + G.toGain));
      if (goalX - e.x < 70 && goalX - e.x > 8) doDive(e);
      else if (fdX2 - e.x < 40 && fdX2 - e.x > 6 && Math.random() < 0.5) doDive(e);
    }
    ty = clamp(ty, TOP + 14, BOT - 14);
    moveToward(e, { x: e.x + 120, y: ty }, sp, dt);
  }

  const ELITE_QBS = ["Patrick Mahomes", "Josh Allen", "Joe Burrow", "Lamar Jackson"];
  function cpuQB(dt) {
    const qb = G.ball.holder;
    if (!qb) return;
    const elite = ELITE_QBS.includes(qb.name);
    // drift back
    if (G.playT < 0.8) { qb.x -= 65 * dt; }
    const rushers = G.players.filter((p) => p.team === "def" && dist(p, qb) < 46 && !p.blockedBy);
    const pressured = rushers.length > 0;
    // a free rusher in the QB's lap and the pocket's gone: he can't get it off —
    // hold the ball and eat the sack (checkTackles finishes it). This is what
    // makes the sack rate realistic instead of zero.
    const inFace = rushers.some((p) => dist(p, qb) < 20);
    if (inFace && G.playT > (elite ? 0.8 : 0.95) && !(qb.apex && qb.passive === "escape" && Math.random() < 0.5)) return;
    if (G.playT < (elite ? 0.5 : 0.7)) return;
    // read separation PROJECTED at the catch point, not where players stand now
    let best = null, bestSep = -1;
    for (const r2 of eligible()) {
      const flight = 0.5 + dist(qb, r2) / 620;
      const proj = { x: r2.x + r2.vx * flight, y: r2.y + r2.vy * flight };
      let sep = 9999;
      for (const d of G.players) if (d.team === "def") sep = Math.min(sep, Math.hypot(d.x + d.vx * flight - proj.x, d.y + d.vy * flight - proj.y));
      if (r2.x < xAtYd(Math.max(0, G.losYd - 8))) sep -= 30;
      if (proj.x > qb.x + 40) sep += 8;                        // prefer downfield looks
      if (sep > bestSep) { bestSep = sep; best = r2; }
    }
    const think = diff().cpuThink * (elite ? 0.55 : 1);
    const openNow = elite ? 40 : 48;
    const mustThrow = G.playT > 2.3 * think || (pressured && G.playT > (elite ? 1.35 : 1.0) * think);
    // SACK: a realistic share of dropbacks end in a sack. Rather than fight
    // the frame-by-frame pixel race (the QB releases before a rusher can
    // physically arrive), the protection breakdown is pre-rolled at the snap
    // — the DL/OL strength gap sets the odds, and it triggers when the QB has
    // held past the pressure moment (unless he's open early or an escape
    // artist). This is what a human-controlled rusher achieves live, too.
    if (qb.sackDoom) {
      // only a blown-coverage bomb in the very first beat lets him dodge it
      const escapeOpen = best && bestSep > 120 && G.playT < 0.8;
      if (!escapeOpen) {
        if (G.playT >= qb.sackAt) {
          const sacker = G.players.filter((p) => p.team === "def" && (p.state === "rush" || p.role === "EDGE" || p.role === "DL" || p.role === "LB"))
            .sort((a, b) => dist(a, qb) - dist(b, qb))[0] || G.players.find((p) => p.team === "def");
          if (sacker) { sacker.x = qb.x + 8; sacker.y = qb.y; }   // he arrives on the QB
          G.carrier = qb; qb.canPass = false;
          announce("sack", sacker && sacker.name);
          if (sacker) { addStat(sacker, "sacks"); addStat(sacker, "tkl"); }
          G.shake = Math.max(G.shake, 0.25); sfx.tackle();
          playDead("SACKED!", null, false);
          return;
        }
        return;   // protection is collapsing — hold the ball, can't step up yet
      }
    }
    // nobody's open and the pocket's dying? a smart QB throws it into the
    // fifth row instead of forcing a pick
    if (mustThrow && best && bestSep < 18 && Math.random() < 0.45) {
      G.ball = { mode: "air", kind: "lob", away: true, from: { x: qb.x, y: qb.y }, to: { x: qb.x + 160, y: TOP - 40 }, t: 0, T: 0.8, x: qb.x, y: qb.y, z: 12, holder: null };
      G.phase = "air"; qb.state = "idle"; qb.throwT = 0.3; sfx.throw();
      return;
    }
    // occasionally take a downfield SHOT at a covered deep receiver — this is
    // where real incompletions, picks, and big plays come from (pure checkdowns
    // complete too often and never get intercepted)
    let shotTgt = null;
    if (!mustThrow && G.playT > 0.9 && Math.random() < 0.08) {
      const deep = eligible().filter((r2) => r2.x > qb.x + 120).sort((a, b) => b.x - a.x)[0];
      if (deep) shotTgt = deep;   // a shot downfield even into coverage
    }
    if (shotTgt || (best && (bestSep > openNow || mustThrow))) {
      const tgtR = shotTgt || best;
      const flight = 0.5 + dist(qb, tgtR) / 620;
      const lead = { x: tgtR.x + tgtR.vx * flight * (elite ? 0.95 : 0.6), y: tgtR.y + tgtR.vy * flight * (elite ? 0.95 : 0.6) };
      lead.x = clamp(lead.x, qb.x - 40, qb.x + maxRange() * (elite ? 1.15 : 1));
      if (elite) qb.acc = Math.max(qb.acc, 94);                // elite ball placement
      G.aim = lead;
      const laneClear = bestSep > (elite ? 30 : 40);
      if (!shotTgt && laneClear && dist(qb, lead) < 240 && Math.random() < 0.5) throwBullet();
      else throwLob();
    } else if (pressured && G.playT > (elite ? 1.8 : 1.4)) {
      becomeCarrier(qb); // scramble
    }
  }

  // ------------------------------------------------------------- tackling
  // wind up a peanut-punch swing: the leap + swat that goes for the BALL,
  // not the man. Success is decided at contact, based on how well you
  // timed the press relative to your arrival on the carrier.
  function startPunch(e) {
    if (e.punchCd > 0 || e.punching > 0 || e.proneT > 0) return;
    e.punching = 0.5;
    e.punchDist = G.carrier ? dist(e, G.carrier) : 60;
    e.jumpT = Math.max(e.jumpT, 0.35); e.swingT = 0.3;   // leap + swing
    sfx.juke();
  }
  function checkTackles(dt) {
    if (G.phase === "carry" && G.carrier) {
      const c = G.carrier;
      // --- peanut punch resolves FIRST with a generous strike range, so a
      // wound-up swing actually connects instead of losing to the wrap-up
      for (const e of G.players) {
        if (e.team === c.team || e.staggerT > 0 || e.proneT > 0) continue;
        // AI defenders RARELY go for the strip instead of a clean tackle —
        // a real punch-out is a rare, high-risk play, not every rep. Once per
        // play, per defender, and only a small fraction of the time.
        if (!e.controlled && e.punchCd <= 0 && e.punching <= 0 && !e.punchedThisPlay) {
          const dd0 = dist(e, c);
          if (dd0 > 18 && dd0 < 40 && Math.random() < dt * 0.02) { e.punchedThisPlay = true; startPunch(e); }
        }
        if (e.punching > 0 && dist(e, c) < 26 && !(G.ramp && G.ramp.ent === c)) {
          e.punching = 0; e.punchCd = 1.1;
          for (let s2 = 0; s2 < 6; s2++) G.parts.push({ x: c.x + rnd(-6, 6), y: c.y - 12 + rnd(-6, 6), z: 8, vx: rnd(-60, 60), vy: rnd(-40, 40), vz: rnd(20, 70), t: 0.3, puff: true });
          // human punch is timing-based & reliable; an AI strip is a long shot
          const timing = clamp(1 - Math.abs((e.punchDist == null ? 60 : e.punchDist) - 30) / 42, 0, 1);
          const odds = e.controlled
            ? 0.22 + timing * 0.5 + ((e.str || 75) - 75) / 250
            : 0.10 + ((e.str || 75) - 75) / 500;   // AI: low base, small strength bonus
          if (Math.random() < odds) { e.punched = true; fumble(c, e); return; }
          e.staggerT = 0.3;   // whiffed the swat — a beat to recover
        }
      }
      for (const e of G.players) {
        if (e.team === c.team || e.staggerT > 0 || e.proneT > 0 || e.tackleCd > 0) continue;
        let r2 = (e.diveT > 0 || e.soarT > 0) ? 22 : 14;   // a soaring dino has a big hit box
        if (e.apex && e.passive === "tackle") r2 += 7;      // HEAT-SEEKER range
        if (dist(e, c) < r2) {
          // rampaging BALL CARRIER: send tacklers flying
          if (G.ramp && G.ramp.ent === c) {
            e.staggerT = 1.2; e.vx = 0; e.vy = 0;
            e.x += (e.x - c.x) * 1.6; e.y += (e.y - c.y) * 1.6;
            G.shake = 0.25; sfx.tackle();
            continue;
          }
          // rampaging DEFENDER: automatic takedown, likely jarring the ball out
          if (G.ramp && G.ramp.ent === e) {
            G.shake = 0.3; sfx.roar();
            if (Math.random() < 0.55) { fumble(c, e); return; }
            playDead("FLATTENED!", null, false);
            return;
          }
          if (c.jukeT > 0) { e.staggerT = 0.8; sfx.juke(); continue; }
          if (c.shedCharges > 0) { // power backs bounce off the first hits
            c.shedCharges--; e.staggerT = 0.9; G.shake = 0.15; sfx.tackle();
            continue;
          }
          // YAC MONSTER: the first tackler whiffs
          if (c.apex && c.passive === "yac" && c.yacCharge > 0) {
            c.yacCharge = 0; e.staggerT = 0.85; sfx.juke(); continue;
          }
          e.tackleCd = 0.5;
          // HARD HIT: a well-timed dive/flight arriving fast and strong can
          // jar the ball loose — or leave a fresh-catch receiver seeing stars
          const closing = ((e.vx - c.vx) * (c.x - e.x) + (e.vy - c.vy) * (c.y - e.y)) / Math.max(1, dist(e, c));
          const hardHit = closing > 180 && (e.str || 75) >= 76 && (e.diveT > 0 || e.soarT > 0);
          const freshCatch = c.catchT != null && G.playT - c.catchT < 0.6;
          let p = 0.52 + (e.tkl - c.agi) / 160 + (e.diveT > 0 ? 0.24 : 0) + (e.soarT > 0 ? 0.34 : 0) + (e.controlled ? 0.08 : 0) + (hardHit ? 0.1 : 0);
          if (e.apex && e.passive === "tackle") p += 0.16;               // HEAT-SEEKER wraps up
          if (c.apex && c.passive === "escape") p -= 0.14;               // HOUDINI slips
          if (Math.random() < p) {
            if (Math.random() < 0.009 + G.weather.fumbleMod + (hardHit ? (freshCatch ? 0.18 : 0.09) : 0)) {
              if (hardHit) { G.shake = Math.max(G.shake, 0.5); announce("bighit", e.name); sfx.roar(); }
              fumble(c, e); return;
            }
            if (hardHit) { G.shake = Math.max(G.shake, 0.4); announce("bighit", e.name); sfx.roar(); }
            sfx.tackle();
            addStat(e, "tkl");
            playDead(hardHit ? "FLATTENED!" : "TACKLED", null, false);
            return;
          } else if (hardHit) {
            // the big hit lands but doesn't finish: the carrier is DAZED
            c.staggerT = 0.85; e.staggerT = 0.4;
            G.shake = Math.max(G.shake, 0.3); sfx.tackle();
            banner("BIG HIT!", lastName(c.name) + " is dazed but upright!", 0.7);
          } else {
            e.staggerT = 0.75;
          }
        }
      }
    }
    // sack: defenders reaching QB pre-throw. The pocket holds for the first
    // beat (~0.9s) — but a truly ELITE rusher who wins his rep can get home
    // in under a second, and physically reaching the QB is always a sack
    // (being "blocked" no longer grants immunity — you have to stay in front)
    if (G.phase === "drop" && G.ball.holder) {
      const qb = G.ball.holder;
      for (const e of G.players) {
        if (e.team !== "def" || e.staggerT > 0 || e.tackleCd > 0) continue;
        const elite = (e.str || 75) >= 88 || (e.apex && (e.passive === "sack" || e.passive === "wall"));
        if (G.playT < (elite ? 0.5 : 0.9)) continue;
        if (dist(e, qb) < 13) {
          // HOUDINI QB slips the would-be sacker instead of going down
          if (qb.apex && qb.passive === "escape" && Math.random() < 0.5) {
            e.staggerT = 0.7; e.tackleCd = 0.6; sfx.juke(); continue;
          }
          sfx.tackle();
          announce("sack", e.name);
          addStat(e, "sacks"); addStat(e, "tkl");
          G.carrier = qb;
          // QB HUNTER strip-sack jars the ball loose
          if (e.apex && e.passive === "sack" && Math.random() < 0.5) { fumble(qb, e); return; }
          playDead("SACKED!", null, false);
          return;
        }
      }
    }
  }

  function fumble(carrier, tackler) {
    carrier.staggerT = 0.8;
    if (tackler) addStat(tackler, "ff");
    dropBall(carrier.x, carrier.y, tackler && tackler.punched ? "PEANUT PUNCH!" : "FUMBLE!");
  }

  function checkBounds() {
    if (G.phase === "carry" && G.carrier) {
      const c = G.carrier;
      if (c.y <= TOP - 2 || c.y >= BOT + 2) { playDead("OUT OF BOUNDS", null, false); return; }
      if (c.x >= xAtYd(100)) { playDead("", null, false); return; } // TD handled in playDead via spot
      if (c.x <= xAtYd(-9) && c.team === "off") { playDead("TACKLED", null, false); return; }
    }
  }

  // ---------------------------------------------------------------- kicking
  function updateKick(dt) {
    const k = G.kick;
    k.t += dt;
    if (k.stage === 0) k.val = 50 + 50 * Math.sin(k.t * 4.2);
    if (k.stage === 1) k.val = 50 + 50 * Math.sin(k.t * 5.6 + Math.PI / 2);
    if (k.cpu) {
      // CPU nails it near-optimally with some noise
      if (k.stage === 0 && k.val > 88) kickLocked();
      else if (k.stage === 1 && Math.abs(k.val - 50) < rnd(2, 12)) kickLocked();
    }
  }

  // --------------------------------------------------------------- weather
  function updateParticles(dt) {
    const w = G.weather;
    if (!w || G.state === "title" || G.state === "select") return;
    if (w.type === "RAIN") {
      for (let i = 0; i < 6; i++) G.parts.push({ x: G.camX + rnd(-40, W + 40), y: rnd(-20, H), vx: w.wind.x * 2 - 60, vy: 540, t: rnd(0.25, 0.5), rain: true });
      // players splash through the puddles (Fields rules)
      for (const e of G.players || []) {
        if (Math.hypot(e.vx, e.vy) > 60 && inPuddle(e) && Math.random() < dt * 9) {
          for (let i = 0; i < 3; i++) G.parts.push({ x: e.x + rnd(-6, 6), y: e.y + rnd(-2, 4), z: 0, vx: rnd(-30, 30), vy: rnd(-20, 6), vz: rnd(20, 60), t: rnd(0.25, 0.45), splash: true });
        }
      }
    } else if (w.type === "SNOW") {
      for (let i = 0; i < 2; i++) G.parts.push({ x: G.camX + rnd(-40, W + 40), y: -6, vx: w.wind.x * 1.5 + rnd(-18, 18), vy: rnd(40, 90), t: rnd(4, 8), snow: true });
      // the crowd lobs the occasional snowball
      if (Math.random() < dt * 0.25) {
        const fromTop = Math.random() < 0.5;
        G.parts.push({
          x: G.camX + rnd(60, W - 60), y: fromTop ? TOP - 8 : BOT + 8, z: 4,
          vx: rnd(-40, 40), vy: fromTop ? rnd(50, 110) : rnd(-110, -50), vz: 130,
          t: rnd(1.4, 2.0), snowball: true, g: 160,
        });
      }
    }
    for (const p of G.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      if (p.vz != null) { p.z = (p.z || 0) + p.vz * dt; p.vz -= (p.g || 220) * dt; }
      if (p.snowball && p.z <= 0 && p.vz < 0) { // lands with a puff
        p.t = 0;
        snowballSplat(p);
        for (let i = 0; i < 5; i++) G.parts.push({ x: p.x + rnd(-4, 4), y: p.y + rnd(-3, 3), z: 0, vx: rnd(-40, 40), vy: rnd(-30, 30), vz: rnd(10, 50), t: 0.3, puff: true });
      }
    }
    G.parts = G.parts.filter((p) => p.t > 0 && p.y < H + 30 && p.y > -30);
  }
  function inPuddle(e) {
    // puddles live on a fixed deterministic grid (mirrors drawField's rects)
    for (let i = 0; i < 14; i++) {
      const px = (i * 397) % FIELD_LEN, py = TOP + 40 + ((i * 233) % 380);
      if (e.x > px && e.x < px + 44 && e.y > py - 4 && e.y < py + 12) return true;
    }
    return false;
  }

  // ================================================================== RENDER
  function render() {
    cx.save();
    if (G.shake > 0) cx.translate(rnd(-5, 5) * G.shake, rnd(-4, 4) * G.shake);
    cx.fillStyle = "#0a1410"; cx.fillRect(-8, -8, W + 16, H + 16);

    const S = G.state;
    if (S === "loading") { drawCenterText("LOADING DINO BOWL...", "", 0); cx.restore(); return; }
    if (S === "title") { drawTitle(); cx.restore(); return; }
    if (S === "menu") { drawMenu(); cx.restore(); return; }
    if (S === "qbs") { drawQBs(); cx.restore(); return; }
    if (S === "tutorial") { drawTutorial(); cx.restore(); return; }
    if (S === "scout") { drawScouting(); cx.restore(); return; }
    if (S === "editor") { drawEditor(); cx.restore(); return; }
    if (S === "offseason") { drawOffseason(); cx.restore(); return; }
    if (S === "pregame") { drawPregame(); cx.restore(); return; }
    if (S === "hub") { drawHub(); cx.restore(); return; }
    if (S === "standings") { drawStandings(); cx.restore(); return; }
    if (S === "sznstats") { drawSznStats(); cx.restore(); return; }
    if (S === "select") { drawSelect(); cx.restore(); return; }
    if (["career_create", "career_quiz", "career_drill", "career_draft"].includes(S)) { drawCareer(); cx.restore(); return; }

    if (S === "halftime" && G.half) { drawHalftime(); drawHUD(); cx.restore(); return; }
    if (S === "replay" && G.replay) {
      drawReplay();
      cx.font = PF(8); cx.textAlign = "left"; cx.fillStyle = G.gifRec ? "#ff5533" : "#9db0a4";
      cx.fillText(G.gifRec ? "● REC → GIF" : "G = SAVE AS GIF", 30, H - 24);
      cx.restore();
      if (G.gifRec && (G.gifSkip = (G.gifSkip + 1) % 3) === 0 && G.gifFrames.length < 80) gifGrabFrame();
      return;
    }

    drawField();
    drawPlayers();
    drawBall();
    drawWeatherFX();
    if (S === "presnap") drawPresnapUI();
    if (S === "live") drawLiveUI();
    if (S === "playcall" || S === "defcall") drawPlaycall();
    if (S === "ptchoice") drawPTChoice();
    if (S === "kick") drawKickUI();
    // tapped-player info card (name + unique ratings)
    if (G.selCard && G.selCard.t > 0 && (S === "presnap" || S === "live")) {
      const e2 = G.selCard.e;
      const cxp = clamp(e2.x - G.camX, 90, W - 90), cyp = Math.max(64, e2.y - 74);
      cx.fillStyle = "rgba(4,10,7,.92)"; cx.fillRect(cxp - 86, cyp, 172, 46);
      cx.strokeStyle = "#ffd23f"; cx.strokeRect(cxp - 86, cyp, 172, 46);
      cx.font = PF(8); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
      cx.fillText((e2.role || e2.species).toUpperCase() + " · " + lastName(e2.name || "DINO").toUpperCase(), cxp, cyp + 14);
      cx.font = PF(7); cx.fillStyle = "#f4f6f1";
      cx.fillText("SPD " + Math.round((e2.spd - 96) / 1.9 + 60) + " STR " + (e2.str || 75) + " JMP " + (e2.jump || 70), cxp, cyp + 27);
      cx.fillText("HND " + (e2.hands || 75) + " TKL " + (e2.tkl || 75) + " AGI " + (e2.agi || 75), cxp, cyp + 39);
    }
    if (G.ticker && G.ticker.t > 0) {
      const a = Math.min(1, G.ticker.t * 2);
      cx.save(); cx.globalAlpha = a;
      cx.fillStyle = "rgba(4,10,7,.9)"; cx.fillRect(0, H - 32, W, 18);
      cx.fillStyle = "#ffd23f"; cx.fillRect(0, H - 32, 4, 18);
      cx.font = PF(8); cx.textAlign = "left"; cx.fillStyle = "#f4f6f1";
      cx.fillText(G.ticker.text, 12, H - 19);
      cx.restore();
    }
    drawHUD();
    drawTouchButtons();
    if (G.practice) drawPracticeTips();
    if (G.banner) drawBanner();
    if (S === "over") drawOver();
    if (G.showBox) drawBoxScore();
    if (G.help) drawHelp();
    cx.restore();
  }

  function drawPracticeTips() {
    const off = G.practiceSide === "A";
    cx.fillStyle = "rgba(4,10,7,.82)"; cx.fillRect(0, 32, W, 18);
    cx.textAlign = "center"; cx.font = PF(7); cx.fillStyle = "#ffd23f";
    const tips = off
      ? "OFFENSE DRILL — hold-click=aim · SPACE=bullet · WASD=run · SHIFT=juke · Q=lateral · R=RAMPAGE"
      : "DEFENSE DRILL — TAB=switch · SPACE=dive · F=punch · SHIFT=soar · R=RAMPAGE";
    cx.fillText(tips + "     [P] SWITCH DRILL · [ESC] QUIT", W / 2, 45);
  }

  const PF = (s) => s + "px 'Press Start 2P', monospace";

  function drawField() {
    const cam = G.camX;
    // grass stripes per 10 yd
    for (let seg = 0; seg < 24; seg++) {
      const x = seg * 100 - cam;
      if (x + 100 < 0 || x > W) continue;
      const snow = G.weather && G.weather.type === "SNOW";
      const base = seg % 2 ? (snow ? "#c9d4cf" : "#1e6b35") : (snow ? "#bcc9c3" : "#1a5e2e");
      cx.fillStyle = G.weather && G.weather.type === "RAIN" ? shade(base, -14) : base;
      cx.fillRect(x, TOP, 100, BOT - TOP);
    }
    // endzones
    const ezA = (G.drive === "A" ? G.my : G.opp) || "GB";   // offense's own endzone (left)
    const ezB = (G.drive === "A" ? G.opp : G.my) || "CHI";  // target endzone (right)
    drawEndzone(0, ezA); drawEndzone(FIELD_LEN - 200, ezB);
    // midfield logo: the home team's mark painted at the 50, real-stadium style
    drawMidfieldLogo(cam);
    // yard lines
    cx.strokeStyle = "rgba(244,246,241,.55)"; cx.lineWidth = 2;
    cx.font = PF(10); cx.fillStyle = "rgba(244,246,241,.5)"; cx.textAlign = "center";
    for (let yd = 0; yd <= 100; yd += 5) {
      const x = xAtYd(yd) - cam;
      if (x < -20 || x > W + 20) continue;
      cx.beginPath(); cx.moveTo(x, TOP); cx.lineTo(x, BOT); cx.stroke();
      if (yd % 10 === 0 && yd > 0 && yd < 100) {
        const num = yd <= 50 ? yd : 100 - yd;
        cx.fillText(String(num), x, TOP + 34);
        cx.fillText(String(num), x, BOT - 22);
      }
    }
    // hashes
    cx.fillStyle = "rgba(244,246,241,.35)";
    for (let yd = 0; yd <= 100; yd++) {
      const x = xAtYd(yd) - cam;
      if (x < -4 || x > W + 4) continue;
      cx.fillRect(x - 1, MID - 52, 2, 6); cx.fillRect(x - 1, MID + 46, 2, 6);
    }
    // sidelines
    cx.fillStyle = "#f4f6f1";
    cx.fillRect(-cam, TOP - 5, FIELD_LEN, 5); cx.fillRect(-cam, BOT, FIELD_LEN, 5);
    // backdrop: sky / skyline / dome behind the stands
    drawBackdrop(cam);
    // crowd
    if (G.crowd) cx.drawImage(G.crowd, -cam * 0.55, 6);
    // pterodactyls in the sky
    for (const p of G.pteros) {
      const sheet = G.sheets.A ? G.sheets.A.ptero : null;
      if (sheet) cx.drawImage(sheet.R[(p.f | 0) % 2], p.x - cam * 0.55, p.y);
    }
    if (G.stadium && G.stadium.home === "NE") drawMassageParlor(cam);
    // meteor streak (screen-space, above everything in the sky band)
    if (G.meteor) {
      const m = G.meteor;
      cx.strokeStyle = "rgba(255,190,90,.8)"; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(m.x - 34, m.y - 3); cx.lineTo(m.x, m.y); cx.stroke();
      cx.strokeStyle = "rgba(255,240,180,.5)"; cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(m.x - 50, m.y - 5); cx.lineTo(m.x - 10, m.y - 1); cx.stroke();
      cx.fillStyle = "#ffdf9e"; cx.fillRect(m.x - 2, m.y - 2, 5, 5);
      cx.fillStyle = "#ff9e4a"; cx.fillRect(m.x - 4, m.y - 1, 2, 3);
    }
    // night: stadium light masts above the stands
    if (G.stadium && !G.stadium.dome && G.stadium.time === "night") {
      for (let i = 0; i < 8; i++) {
        const lx = 140 + i * 300 - cam * 0.55;
        if (lx < -40 || lx > W + 40) continue;
        cx.fillStyle = "#243244"; cx.fillRect(lx - 2, 2, 4, 16);
        cx.fillStyle = "#fff7cf"; cx.fillRect(lx - 9, 0, 18, 5);
        cx.fillStyle = "rgba(255,247,207,.15)";
        cx.beginPath(); cx.moveTo(lx - 9, 5); cx.lineTo(lx - 30, 60); cx.lineTo(lx + 30, 60); cx.lineTo(lx + 9, 5); cx.fill();
      }
    }
    // goalposts
    drawGoalpost(xAtYd(-8) - cam); drawGoalpost(xAtYd(108) - cam);
    // LOS + first down
    if (["presnap", "live", "playcall", "defcall", "dead", "kick"].includes(G.state)) {
      const losX = xAtYd(G.losYd) - cam;
      cx.fillStyle = "rgba(60,120,255,.75)"; cx.fillRect(losX - 1, TOP, 3, BOT - TOP);
      const fdX = xAtYd(Math.min(100, G.losYd + G.toGain)) - cam;
      cx.fillStyle = "rgba(255,210,63,.85)"; cx.fillRect(fdX - 1, TOP, 3, BOT - TOP);
      // fresh set of downs: the new line of gain pulses gold for a beat
      if (G.fdFlash > 0) {
        const pulse = Math.abs(Math.sin(performance.now() / 90));
        cx.fillStyle = "rgba(255,210,63," + (0.25 + 0.45 * pulse) * Math.min(1, G.fdFlash) + ")";
        cx.fillRect(fdX - 5, TOP, 11, BOT - TOP);
      }
    }
    // rain puddles / snow drifts
    if (G.weather && G.weather.type === "RAIN") {
      cx.fillStyle = "rgba(30,60,90,.25)";
      for (let i = 0; i < 14; i++) {
        const px = ((i * 397) % FIELD_LEN) - cam;
        if (px > -60 && px < W) cx.fillRect(px, TOP + 40 + ((i * 233) % 380), 44, 8);
      }
    }
  }

  function drawBackdrop(cam) {
    const st = G.stadium;
    if (!st) return;
    if (st.dome) {
      // ribbed dome ceiling
      cx.fillStyle = "#1a2230"; cx.fillRect(0, 0, W, 68);
      cx.strokeStyle = "#2c3a50"; cx.lineWidth = 3;
      for (let i = -2; i < 9; i++) {
        cx.beginPath(); cx.arc(i * 160 - (cam * 0.3) % 160, 96, 90, Math.PI, 2 * Math.PI); cx.stroke();
      }
      cx.fillStyle = "#f4e9c0";
      for (let i = 0; i < 30; i++) cx.fillRect(((i * 83) % W), 8 + (i * 37) % 20, 3, 3); // roof lights
      return;
    }
    const skies = {
      day: ["#7db6e8", "#a9d0f0"], dusk: ["#d98a4a", "#7a4a6e"], night: ["#0c1426", "#1a2540"],
    };
    const [top2, bot2] = skies[st.time] || skies.day;
    const grad = cx.createLinearGradient(0, 0, 0, 70);
    grad.addColorStop(0, top2); grad.addColorStop(1, bot2);
    cx.fillStyle = grad; cx.fillRect(0, 0, W, 70);
    if (st.time === "night") {
      cx.fillStyle = "#e8ecf4";
      for (let i = 0; i < 40; i++) cx.fillRect(((i * 197 + 31) % W), (i * 53) % 40, 2, 2); // stars
      cx.fillStyle = "#f4e9c0"; cx.fillRect(W - 130, 12, 14, 14); // moon
    }
    if (st.time === "dusk") { cx.fillStyle = "#f4c95d"; cx.fillRect(120, 16, 16, 16); } // low sun
    // city skyline silhouette (seeded per stadium)
    cx.fillStyle = st.time === "night" ? "#141c2e" : st.time === "dusk" ? "#4a3050" : "#5a7ba0";
    let sx = -((cam * 0.4) % 240) - 240;
    let i2 = 0;
    while (sx < W + 40) {
      const b = st.skyline[i2 % st.skyline.length];
      cx.fillRect(sx, 62 - b.h, b.w, b.h + 8);
      if (st.time === "night") { // lit windows
        cx.fillStyle = "#f4d98a";
        for (let wy = 62 - b.h + 3; wy < 58; wy += 7) cx.fillRect(sx + 3 + ((wy * 13) % (b.w - 6)), wy, 2, 3);
        cx.fillStyle = "#141c2e";
      }
      sx += b.w + b.gap; i2++;
    }
  }

  // ★ EASTER EGG: outside the Patriots' stadium there's... a massage parlor.
  // drawn over the stands (same layer as the night light masts) so it's visible
  function drawMassageParlor(cam) {
    const mx = ((-(cam * 0.55)) % 1300 + 1300) % 1300 - 170 + 560;
    if (mx < -70 || mx > W + 10) return;
    cx.fillStyle = "#3d2b4a"; cx.fillRect(mx, 43, 56, 27);            // the building
    cx.fillStyle = "#1d1330"; cx.fillRect(mx + 6, 54, 12, 16);        // door
    cx.fillStyle = "#f4d98a"; cx.fillRect(mx + 26, 50, 9, 8); cx.fillRect(mx + 40, 50, 9, 8); // lit windows
    cx.fillStyle = "#ff7ac2"; cx.fillRect(mx - 2, 33, 60, 10);        // neon sign board
    cx.fillStyle = "#fff"; cx.font = "8px monospace"; cx.textAlign = "center";
    cx.fillText("MASSAGE", mx + 28, 41);
    if (Math.sin(performance.now() / 400) > 0) { cx.fillStyle = "#ff2d8a"; cx.fillRect(mx + 53, 34, 4, 8); } // blinking neon
  }

  // the home team's midfield mark: colored disc + white ring + abbreviation,
  // painted into the grass at the 50 like every real stadium
  function drawMidfieldLogo(cam) {
    const homeAb = (G.stadium && G.stadium.home) || G.homeAbbr || G.my;
    const t = TEAMS[homeAb];
    if (!t) return;
    const x = xAtYd(50) - cam;
    if (x < -90 || x > W + 90) return;
    cx.save();
    cx.globalAlpha = 0.85;
    cx.fillStyle = shade(t[1], -8);
    cx.beginPath(); cx.ellipse(x, MID, 74, 52, 0, 0, Math.PI * 2); cx.fill();
    cx.strokeStyle = t[2]; cx.lineWidth = 5;
    cx.beginPath(); cx.ellipse(x, MID, 74, 52, 0, 0, Math.PI * 2); cx.stroke();
    cx.strokeStyle = "rgba(244,246,241,.85)"; cx.lineWidth = 2;
    cx.beginPath(); cx.ellipse(x, MID, 64, 44, 0, 0, Math.PI * 2); cx.stroke();
    cx.font = PF(24); cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = t[2];
    cx.fillText(homeAb, x, MID + 2);
    cx.textBaseline = "alphabetic";
    // tiny dino skull crest above the letters
    cx.fillStyle = "rgba(244,246,241,.9)";
    cx.fillRect(x - 5, MID - 30, 10, 6); cx.fillRect(x - 3, MID - 24, 6, 3);
    cx.restore();
  }

  function drawEndzone(x0, abbr) {
    const cam = G.camX, t = TEAMS[abbr];
    const x = x0 - cam;
    if (x + 200 < 0 || x > W) return;
    cx.fillStyle = shade(t[1], -18); cx.fillRect(x, TOP, 200, BOT - TOP);
    cx.save();
    cx.translate(x + 100, MID);
    cx.rotate(x0 === 0 ? -Math.PI / 2 : Math.PI / 2);
    cx.font = PF(26); cx.fillStyle = t[2]; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(t[0].toUpperCase().slice(0, 10), 0, 0);
    cx.restore();
  }
  function drawGoalpost(x) {
    if (x < -30 || x > W + 30) return;
    cx.fillStyle = "#ffd23f";
    cx.fillRect(x - 3, MID - 8, 6, 40);
    cx.fillRect(x - 30, MID - 12, 60, 5);
    cx.fillRect(x - 30, MID - 60, 5, 52); cx.fillRect(x + 25, MID - 60, 5, 52);
  }

  function teamOf(e) { return (e.team === "off") === (G.drive === "A") ? "A" : "B"; }

  function drawPlayers() {
    const list = G.players.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const sheet = G.sheets[teamOf(e)];
      if (!sheet) continue;
      const ramping = G.ramp && G.ramp.ent === e;
      const spr = ramping ? sheet.rampage : sheet[e.species];
      let fi = (e.animT * 4 | 0) % 2;
      // wings-open flight frames while soaring OR winding up a soar launch
      const wingsOpen = e.soarT > 0 || (G.soarAim && e === G.controlled);
      if (wingsOpen && spr.n > 2) fi = 2 + ((e.animT * 6 | 0) % 2);
      const img = (e.dir >= 0 ? spr.R : spr.L)[fi];
      // jump-for-the-ball hop — height scales with the dino's own jump rating
      // (only ballhawks / elite leapers get real air; most hop modestly)
      const jumpAmp = 5 + Math.max(0, (e.jump || 60) - 55) * 0.2;
      const jump = e.jumpT > 0 ? Math.sin((1 - e.jumpT / 0.4) * Math.PI) * jumpAmp : 0;
      const x = e.x - G.camX - spr.w / 2, y = e.y - spr.h + 6 - jump;
      // shadow (stays on the ground; shrinks as they leap)
      cx.fillStyle = "rgba(0,0,0,.28)";
      const shW = 16 - jump * 0.5;
      cx.fillRect(e.x - G.camX - shW / 2, e.y + 2, shW, 4);
      // the ring IS the ball indicator: carrier or the QB holding it pre-throw
      if (e === G.carrier || (e === G.ball.holder && (G.phase === "drop" || G.phase === "handoff"))) {
        cx.strokeStyle = "rgba(255,210,63,.9)"; cx.lineWidth = 2;
        cx.beginPath(); cx.ellipse(e.x - G.camX, e.y, 15, 6, 0, 0, Math.PI * 2); cx.stroke();
      }
      if (e.proneT > 0) {
        cx.save(); cx.translate(e.x - G.camX, e.y); cx.rotate(e.dir * Math.PI / 2);
        cx.drawImage(img, -spr.w / 2, -spr.h + 6); cx.restore();
      } else if (e.spinT > 0) {
        // spin-move: a quick full rotation through the cut
        cx.save(); cx.translate(e.x - G.camX, e.y - spr.h / 2 + 3 - jump);
        cx.rotate((1 - e.spinT / 0.32) * Math.PI * 2 * e.dir);
        cx.drawImage(img, -spr.w / 2, -spr.h / 2); cx.restore();
      } else {
        cx.drawImage(img, x, y);
        // career bling overlay — positioned dynamically off the sprite bounds so
        // it lands on the head / chest of ANY dino species and faces the right way
        if (e.careerAcc && e.careerAcc !== "NONE") drawBling(e, spr, x, y);
        // (no tucked-ball sprite — the golden ring at the feet marks the ball holder)
        // peanut-punch swing: a fast forward jab while airborne
        if (e.swingT > 0) {
          const pr = 1 - e.swingT / 0.3;
          const sx0 = e.x - G.camX, sy0 = e.y - jump - 16;
          cx.strokeStyle = "#ff8a5c"; cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(sx0, sy0);
          cx.lineTo(sx0 + e.dir * (4 + pr * 16), sy0 - 2 + pr * 4); cx.stroke();
        }
        // throwing animation: cocked-back windup, then a forward arm swing releasing the ball
        if (e.throwT > 0) {
          const prog = 1 - e.throwT / 0.3;          // 0=windup, 1=follow-through
          const sx = e.x - G.camX, sy = e.y - jump - 20; // shoulder
          const reach = -8 + prog * 22;             // arm sweeps forward
          const ax = sx + e.dir * reach, ay = sy - 6 + prog * 8;
          cx.strokeStyle = spr === sheet.rampage ? "#b08d55" : "#f4f6f1";
          cx.lineWidth = 3;
          cx.beginPath(); cx.moveTo(sx, sy); cx.lineTo(ax, ay); cx.stroke();
          if (prog < 0.6) cx.drawImage(G.ballSpr, ax - 6, ay - 8); // ball in hand pre-release
        }
      }
      // first-down celebration: the arm thrust downfield + a "1ST!" call-out
      if (e.fdCeleb > 0) {
        const ax0 = e.x - G.camX, ay0 = e.y - jump - 18;
        cx.strokeStyle = "#ffd23f"; cx.lineWidth = 3;
        cx.beginPath(); cx.moveTo(ax0, ay0); cx.lineTo(ax0 + e.dir * 16, ay0 - 8); cx.stroke();
        cx.fillStyle = Math.sin(performance.now() / 90) > 0 ? "#ffd23f" : "#fff";
        cx.font = PF(8); cx.textAlign = "center";
        cx.fillText("1ST!", ax0, ay0 - 14);
      }
      // controlled marker
      if (e.controlled && G.state === "live") {
        cx.fillStyle = "#ffd23f"; cx.font = PF(8); cx.textAlign = "center";
        cx.fillText("▼", e.x - G.camX, y - 8);
      }
      // apex rampager star
      if (e.apex && (G.state === "presnap" || (G.state === "live" && G.rampage[sideOf(e)] >= 100))) {
        cx.fillStyle = "#ff5533"; cx.font = PF(8); cx.textAlign = "center";
        cx.fillText("★", e.x - G.camX, y - 18);
      }
      // carrier name / QB name
      if ((e === G.carrier || (G.ball.holder === e && G.phase === "drop")) && e.name) {
        cx.font = PF(7); cx.textAlign = "center";
        cx.fillStyle = "rgba(0,0,0,.5)"; cx.fillRect(e.x - G.camX - 34, e.y + 8, 68, 11);
        cx.fillStyle = "#fff"; cx.fillText(lastName(e.name).toUpperCase().slice(0, 10), e.x - G.camX, e.y + 17);
      }
    }
  }

  // a filled pixel block with a dark outline, so bling pops on any body color
  function pxBlock(bx, by, bw, bh, color) {
    cx.fillStyle = "rgba(0,0,0,.85)"; cx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    cx.fillStyle = color; cx.fillRect(bx, by, bw, bh);
  }
  function drawBling(e, spr, x, y) {
    drawBlingAt(e.careerAcc, x, y, spr.w, spr.h, e.dir >= 0 ? 1 : -1);
  }
  // draw accessory scaled to a sprite rectangle (works in-game and on menus)
  function drawBlingAt(acc, x, y, w, h, dir) {
    const k = w / 32;                                  // 32px = on-field sprite size
    const P = (bx, by, bw, bh, c) => pxBlock(x + bx * k, y + by * k, Math.max(2, bw * k), Math.max(2, bh * k), c);
    const headCX = w / 2 + dir * w * 0.20, headTop = h * 0.08;
    const chestCX = w / 2 + dir * w * 0.10, chestY = h * 0.42;
    const hcx = headCX / k, htp = headTop / k, ccx = chestCX / k, cty = chestY / k;
    switch (acc) {
      case "HEADBAND":
        P(hcx - 9, htp, 18, 4, "#ff2d2d");
        P(hcx - 9, htp + 1, 18, 1.5, "#ff7a6b");
        P(hcx - dir * 10, htp + 1, 3, 3, "#ff2d2d");   // knot
        P(hcx - dir * 14, htp + 3, 4, 2, "#d11");      // tail
        break;
      case "CHAIN":
        P(ccx - 8, cty, 3, 2, "#ffd23f");
        P(ccx - 4, cty + 2, 3, 2, "#ffe98a");
        P(ccx + 1, cty + 2, 3, 2, "#ffe98a");
        P(ccx + 5, cty, 3, 2, "#ffd23f");
        P(ccx - 2, cty + 4, 4, 4, "#fff2b0");          // pendant
        break;
      case "SPIKES":
        for (let s2 = 0; s2 < 4; s2++) P(hcx - 10 + s2 * 6, htp - 4 + (s2 % 2), 3, 6, "#ff3b2f");
        break;
      case "SHADES":
        P(hcx - 8, htp + 3, 16, 4, "#0a0a0a");
        P(hcx + dir * 2, htp + 4, 3, 1.5, "#8ec7ff");  // glint
        break;
    }
  }

  function drawBall() {
    const b = G.ball;
    if (!b || b.mode === "dead") return;
    if (b.mode === "held" && b.holder) return; // tucked away
    // shadow
    cx.fillStyle = "rgba(0,0,0,.3)";
    cx.fillRect(b.x - G.camX - 5, b.y - 2, 10, 4);
    cx.drawImage(G.ballSpr, b.x - G.camX - 8, b.y - b.z - 5);
  }

  function drawWeatherFX() {
    // time-of-day tint over the field
    if (G.stadium && !G.stadium.dome) {
      if (G.stadium.time === "night") { cx.fillStyle = "rgba(8,12,40,.16)"; cx.fillRect(0, 0, W, H); }
      if (G.stadium.time === "dusk") { cx.fillStyle = "rgba(80,40,10,.09)"; cx.fillRect(0, 0, W, H); }
    }
    // splash + snowball particles
    for (const p of G.parts) {
      if (p.splash) {
        cx.fillStyle = "rgba(150,200,255," + Math.min(0.8, p.t * 2) + ")";
        cx.fillRect(p.x - G.camX, p.y - p.z, 3, 3);
      } else if (p.snowball) {
        cx.fillStyle = "rgba(0,0,0,.25)"; cx.fillRect(p.x - G.camX - 3, p.y, 7, 3);
        cx.drawImage(G.snowSpr, p.x - G.camX - 6, p.y - p.z - 5);
      } else if (p.puff) {
        cx.fillStyle = "rgba(244,246,241," + Math.min(0.9, p.t * 1.5) + ")";
        cx.fillRect(p.x - G.camX, p.y - p.z, 4, 4);
      }
    }
    const w = G.weather; if (!w) return;
    if (w.type === "RAIN") {
      cx.strokeStyle = "rgba(160,200,255,.4)"; cx.lineWidth = 1;
      cx.beginPath();
      for (const p of G.parts) if (p.rain) { const x = p.x - G.camX; cx.moveTo(x, p.y); cx.lineTo(x + p.vx * 0.02, p.y + 11); }
      cx.stroke();
      cx.fillStyle = "rgba(10,20,40,.12)"; cx.fillRect(0, 0, W, H);
    } else if (w.type === "SNOW") {
      cx.fillStyle = "rgba(255,255,255,.85)";
      for (const p of G.parts) if (p.snow) cx.fillRect(p.x - G.camX, p.y, 3, 3);
      cx.fillStyle = "rgba(220,230,255,.07)"; cx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------- UI screens
  function drawTitle() {
    // scrolling field backdrop
    G.camX = (G.camX + 0.6) % (FIELD_LEN - W);
    drawField();
    cx.fillStyle = "rgba(5,12,8,.72)"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    cx.font = PF(58); cx.fillStyle = "#2a6e37";
    cx.fillText("DINO BOWL", W / 2 + 4, 178);
    cx.fillStyle = "#ffd23f"; cx.fillText("DINO BOWL", W / 2, 172);
    cx.font = PF(13); cx.fillStyle = "#f4f6f1";
    cx.fillText("8-BIT FOOTBALL · " + (G.season || "") + " ROSTERS (LIVE DATA) · 100% DINOSAURS", W / 2, 216);
    if (G.sheets.A === undefined && G.rosters) {
      const s = DinoSprites.buildTeamSprites("#e31837", "#ffb81c");
      const s2 = DinoSprites.buildTeamSprites("#00338d", "#c60c30");
      G.sheets.A = s; G.sheets.B = s2;
    }
    if (G.sheets.A) {
      const t = performance.now() / 200 | 0;
      cx.drawImage(G.sheets.A.trex.R[t % 2], W / 2 - 150, 260, 96, 96);
      cx.drawImage(G.sheets.B.veloci.L[t % 2], W / 2 + 60, 260, 96, 96);
    }
    cx.font = PF(15); cx.fillStyle = Math.sin(performance.now() / 300) > 0 ? "#ffd23f" : "#8a6";
    cx.fillText("PRESS ENTER TO START", W / 2, 420);
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("H = CONTROLS  ·  M = MUTE  ·  G = MEET THE HERD", W / 2, 456);
    cx.fillText("D = DIFFICULTY: " + diff().name + "   ·   ALL-TIME " + G.record.w + "-" + G.record.l + (G.record.t ? "-" + G.record.t : ""), W / 2, 478);
    if (G.msg) { cx.fillStyle = "#ff7a6b"; cx.fillText(G.msg, W / 2, 502); }
    if (G.gallery) drawGallery();
  }

  // player overall from ratings (offense) or spd/tkl (defense)
  function playerOvr(p) {
    if (p.role === "QB") return Math.round((p.arm * 1.2 + p.acc + (p.spd - 40) * 0.4) / 2.4);
    if (p.role === "RB") return Math.round((p.spd + p.agi + p.hands * 0.6) / 2.6);
    if (["WR1", "WR2", "WR3", "TE"].includes(p.role)) return Math.round((p.hands + p.spd + p.agi * 0.5) / 2.5);
    return Math.round(((p.spd || 75) + (p.tkl || 75)) / 2);
  }
  function drawPregame() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    // header
    const tA = TEAMS[G.my], tB = TEAMS[G.opp];
    const rA = roster(G.my), rB = roster(G.opp);
    cx.textAlign = "center"; cx.font = PF(11); cx.fillStyle = "#9db0a4";
    cx.fillText("● GAMEDAY · " + (G.weather.month || "SEP") + " · " + (G.stadium.dome ? "DOME" : (G.stadium.time || "day").toUpperCase()) +
      " · " + G.weather.type + " · " + (G.weather.temp != null ? G.weather.temp + "°F" : "") + " ●", W / 2, 26);
    cx.font = PF(20);
    cx.fillStyle = hudColor(G.my); cx.textAlign = "left"; cx.fillText(tA[0].toUpperCase(), 40, 58);
    cx.fillStyle = hudColor(G.opp); cx.textAlign = "right"; cx.fillText(tB[0].toUpperCase(), W - 40, 58);
    cx.textAlign = "center"; cx.font = PF(10); cx.fillStyle = "#f4f6f1";
    cx.fillText("OVR " + rA.ovr, 90, 78); cx.fillText("OVR " + rB.ovr, W - 90, 78);
    cx.font = PF(22); cx.fillStyle = "#ffd23f"; cx.fillText("VS", W / 2, 62);

    // starter columns
    const roles = ["QB", "RB", "WR1", "WR2", "TE"];
    const slot = (r, i) => r.offense.filter((p) => p.role === (i.startsWith("WR") ? "WR" : i))[i === "WR2" ? 1 : 0];
    function drawCol(ros, abbr, x0, align) {
      cx.textAlign = align;
      let y = 108;
      const picks = [["QB", "QB"], ["RB", "RB"], ["WR", "WR1"], ["WR", "WR2"], ["TE", "TE"]];
      const seen = {};
      for (const [pos, role] of picks) {
        const list = ros.offense.filter((p) => p.role === pos);
        const idx = seen[pos] || 0; seen[pos] = idx + 1;
        const p = list[idx]; if (!p) continue;
        const pr = { role, spd: p.spd, hands: p.hands, agi: p.agi, arm: p.arm, acc: p.acc };
        const ov = playerOvr(pr);
        cx.font = PF(9); cx.fillStyle = "#69be28"; cx.fillText(pos, x0, y);
        cx.fillStyle = "#f4f6f1"; cx.fillText(lastName(p.name).slice(0, 13).toUpperCase(), x0 + (align === "left" ? 44 : -44), y);
        cx.fillStyle = "#9db0a4"; cx.fillText(ov, x0 + (align === "left" ? 250 : -250), y);
        y += 30;
      }
      // key defender
      const dl = ros.defense[0];
      if (dl) { cx.font = PF(9); cx.fillStyle = "#69be28"; cx.fillText(dl.pos, x0, y); cx.fillStyle = "#f4f6f1"; cx.fillText(lastName(dl.name).slice(0, 13).toUpperCase(), x0 + (align === "left" ? 44 : -44), y); }
    }
    drawCol(rA, G.my, 40, "left");
    drawCol(rB, G.opp, W - 40, "right");

    // rampager showcase (center)
    const showRamp = (abbr, cx0, side) => {
      const info = RAMPAGERS[abbr] || ["Apex Dino", "truck"];
      const pk = PASSIVES[info[1]];
      const sheet = side === "A" ? G.sheets.A : G.sheets.B;
      const pos = APEX_ROLE[abbr] || "QB";
      const spec = { QB: "troodon", RB: "carno", WR1: "veloci", TE: "deino", EDGE: "allo", DL: "stego", LB: "spino", CB: "deinony", S: "quetz" }[pos] || "trex";
      if (sheet && sheet[spec]) { const t = performance.now() / 200 | 0; cx.drawImage(sheet[spec].R[t % 2], cx0 - 32, 306, 64, 64); }
      cx.textAlign = "center"; cx.font = PF(8); cx.fillStyle = "#ff5533"; cx.fillText("★ RAMPAGER · " + pos, cx0, 300);
      cx.font = PF(10); cx.fillStyle = "#fff"; cx.fillText(info[0].toUpperCase().slice(0, 16), cx0, 382);
      cx.font = PF(9); cx.fillStyle = "#ffd23f"; cx.fillText(pk.label, cx0, 401);
    };
    cx.fillStyle = "rgba(255,85,51,.08)"; cx.fillRect(W / 2 - 260, 285, 520, 150);
    cx.strokeStyle = "#ff5533"; cx.strokeRect(W / 2 - 260, 285, 520, 150);
    showRamp(G.my, W / 2 - 150, "A");
    showRamp(G.opp, W / 2 + 150, "B");
    // passive descriptions
    cx.textAlign = "center"; cx.font = PF(7); cx.fillStyle = "#9db0a4";
    cx.fillText((PASSIVES[(RAMPAGERS[G.my] || [0, "truck"])[1]]).desc, W / 2 - 150, 418);
    cx.fillText((PASSIVES[(RAMPAGERS[G.opp] || [0, "truck"])[1]]).desc, W / 2 + 150, 418);

    cx.font = PF(13); cx.fillStyle = Math.sin(performance.now() / 300) > 0 ? "#ffd23f" : "#8a6";
    cx.fillText("PRESS ENTER / TAP TO KICK OFF", W / 2, H - 34);
  }

  // ---------------------------------------------------- MEET THE QBS gallery
  // every starter gets a hand-written identity true to the real player,
  // plus a unique pixel feature (no two neighbors look the same)
  const QB_ID = {
    ARI: ["STEADY VET", "clipboard"], ATL: ["LEFTY LASER", "lefty"],
    BAL: ["FASTEST QB ALIVE", "speed"], BUF: ["THE HOWITZER", "bigarm"],
    CAR: ["MIGHTY MITE", "small"], CHI: ["ICEMAN", "visor"],
    CIN: ["ELITE? ELITE.", "beard"], CLE: ["PRIME JR.", "chain"],
    DAL: ["AMERICA'S ARM", "star"], DEN: ["THE PROFESSOR", "visor"],
    DET: ["ICE COLD", "shades"], GB: ["CHEESEHEAD", "cheese"],
    HOU: ["SMOOTH OPERATOR", "chain"], IND: ["RESURRECTION", "headband"],
    JAX: ["SUNSHINE", "hair"], KC: ["NO-LOOK MAGIC", "mohawk"],
    LA: ["NO-BLINK BOMBS", "beard"], LAC: ["BOLT FROM ZEUS", "bolt"],
    LV: ["COMEBACK KING", "headband"], MIA: ["QUICKEST RELEASE", "speed"],
    MIN: ["THE HEIR", "visor"], NE: ["THE NEW HOPE", "star"],
    NO: ["BAYOU CANNON", "bigarm"], NYG: ["DART BY NAME", "bolt"],
    NYJ: ["TRACK STAR", "speed"], PHI: ["TUSH PUSHER", "bigarm"],
    PIT: ["THE MYSTIC", "beard"], SEA: ["SEEING GHOSTS", "ghost"],
    SF: ["GAME MANAGER", "clipboard"], TB: ["FIRED UP", "flame"],
    TEN: ["ROCKET WARD", "bolt"], WAS: ["ISLAND CALM", "lei"],
  };
  // small bespoke pixel decorations drawn around a 44px gallery sprite
  function drawQBFeature(kind, x, y, s) { // s = sprite size
    const k = s / 44;
    const P = (bx, by, bw, bh, c) => { cx.fillStyle = c; cx.fillRect(x + bx * k, y + by * k, Math.max(1, bw * k), Math.max(1, bh * k)); };
    switch (kind) {
      case "beard": P(30, 18, 8, 5, "#cfd2d6"); P(31, 23, 6, 3, "#aeb3b9"); break;          // grey chin beard
      case "cheese": P(22, -6, 18, 8, "#ffd23f"); P(24, -2, 4, 4, "#e8b820"); P(32, -4, 4, 4, "#e8b820"); break; // cheesehead wedge
      case "hair": P(24, -2, 14, 4, "#ffe08a"); P(34, 2, 6, 10, "#ffe08a"); P(36, 12, 4, 6, "#f4cc66"); break;   // flowing blond mane
      case "mohawk": P(26, -5, 4, 7, "#2b1c10"); P(30, -7, 4, 9, "#2b1c10"); P(34, -5, 4, 7, "#2b1c10"); break;  // hair tuft
      case "shades": P(28, 8, 12, 3, "#0a0a0a"); P(29, 11, 4, 1, "#8ec7ff"); break;
      case "visor": P(26, 5, 14, 4, "#3a4c66"); P(27, 6, 12, 2, "#8ec7ff"); break;           // mirrored visor
      case "chain": P(18, 26, 12, 2, "#ffd23f"); P(22, 28, 4, 4, "#fff2b0"); break;
      case "headband": P(26, 4, 14, 3, "#ff2d2d"); break;
      case "nails": P(6, 40, 3, 3, "#ff7ac2"); P(12, 42, 3, 3, "#ff7ac2"); P(30, 40, 3, 3, "#ff7ac2"); break;    // painted claws
      case "speed": P(-8, 16, 8, 2, "#8ecafc"); P(-12, 22, 10, 2, "#8ecafc"); P(-7, 28, 7, 2, "#8ecafc"); break; // motion lines
      case "bolt": P(44, 2, 4, 6, "#ffd23f"); P(41, 8, 4, 6, "#ffd23f"); P(45, 14, 3, 5, "#ffd23f"); break;      // lightning
      case "flame": P(44, 10, 4, 8, "#ff7a2d"); P(45, 6, 3, 5, "#ffd23f"); break;
      case "ghost": P(44, -4, 10, 10, "#f4f6f1"); P(46, -1, 2, 2, "#0a0a0a"); P(50, -1, 2, 2, "#0a0a0a"); P(44, 6, 3, 3, "#f4f6f1"); P(49, 6, 3, 3, "#f4f6f1"); break;
      case "star": P(46, 2, 4, 4, "#8ecafc"); P(47, 0, 2, 8, "#8ecafc"); P(44, 4, 8, 2, "#8ecafc"); break;
      case "clipboard": P(-4, 22, 8, 11, "#c9b48a"); P(-3, 24, 6, 1, "#5a4a30"); P(-3, 27, 6, 1, "#5a4a30"); break;
      case "lefty": P(2, 20, 6, 4, "#8a4a1f"); P(3, 21, 4, 2, "#f4f6f1"); break;             // ball in the LEFT hand
      case "bigarm": P(38, 16, 7, 7, "#3aa06b"); P(39, 14, 5, 3, "#256b47"); break;          // flexed throwing arm
      case "lei": P(24, 16, 16, 3, "#ff7ac2"); P(26, 19, 3, 2, "#ffd23f"); P(33, 19, 3, 2, "#ffd23f"); break;    // flower lei
      // "small" handled at draw time (smaller sprite)
    }
  }
  function qbSheet(abbr) {
    G.qbSheets = G.qbSheets || {};
    if (!G.qbSheets[abbr]) G.qbSheets[abbr] = DinoSprites.buildTeamSprites(TEAMS[abbr][1], TEAMS[abbr][2]);
    return G.qbSheets[abbr];
  }
  function drawQBs() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText("MEET THE QBS — 32 TROODONS OF THE LEAGUE", W / 2, 32);
    const t = performance.now() / 220 | 0;
    for (let i = 0; i < 32; i++) {
      const ab = ABBRS[i];
      const ros = roster(ab);
      const qb = ros.offense.find((p) => p.role === "QB") || { name: "Dino", arm: 75, acc: 75, spd: 75 };
      const [tag, feat] = QB_ID[ab] || ["THE STARTER", "headband"];
      const gx = 22 + (i % 8) * 118, gy = 52 + ((i / 8) | 0) * 118;
      cx.fillStyle = "rgba(255,255,255,.03)"; cx.fillRect(gx, gy, 108, 108);
      const spr = qbSheet(ab).troodon;
      const size = feat === "small" ? 36 : 44;                    // Bryce-sized
      const sx2 = gx + 32 + (44 - size) / 2, sy2 = gy + 8 + (44 - size);
      cx.drawImage(spr.R[t % 2], sx2, sy2, size, size);
      if (feat !== "small") drawQBFeature(feat, gx + 32, gy + 8, 44);
      cx.font = PF(7); cx.fillStyle = hudColor(ab); cx.textAlign = "center";
      cx.fillText(ab + " · " + lastName(qb.name).slice(0, 9).toUpperCase(), gx + 54, gy + 64);
      cx.fillStyle = "#ffd23f";
      cx.fillText(tag, gx + 54, gy + 78);
      cx.fillStyle = "#9db0a4";
      cx.fillText("A" + Math.round(qb.arm) + " C" + Math.round(qb.acc) + " S" + Math.round(qb.spd), gx + 54, gy + 92);
    }
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("A=ARM C=ACCURACY S=SPEED  ·  ESC / TAP TO GO BACK", W / 2, H - 12);
  }

  // ------------------------------------------------------------- tutorial
  const TUT_PAGES = [
    ["FOOTBALL IN 60 SECONDS", [
      "Your team gets 4 tries (DOWNS) to move the ball 10 yards",
      "past the YELLOW line. Make it: 4 fresh downs. Fail: the",
      "other team takes over right there.",
      "",
      "Reach the far END ZONE = TOUCHDOWN (6 pts), then kick (+1)",
      "or run one more play from the 2 (+2).",
      "Kick a FIELD GOAL through the posts anytime = 3 pts.",
      "On 4th down, a PUNT kicks the problem far downfield.",
      "Tackled in YOUR OWN end zone = SAFETY, 2 pts for them."]],
    ["OFFENSE — CONTROLS", [
      "1-4 / tap ...... pick a play (card 4 = your team's famous play)",
      "Q / E .......... audible (swap the play at the line)",
      "SPACE .......... snap the ball",
      "HOLD CLICK ..... aim: dotted arc shows the throw · RELEASE = lob",
      "SPACE/R-CLICK .. BULLET pass (fast, flat, riskier)",
      "After the throw YOU become the receiver: steer with WASD",
      "and press SPACE as the ball arrives to TIME THE JUMP.",
      "WASD run · SHIFT cutback juke · E dive · Q lateral · X throwaway"]],
    ["DEFENSE — CONTROLS", [
      "Click a dino before the snap to control HIM (or TAB mid-play).",
      "WASD chase · SPACE dive tackle",
      "F .............. PEANUT PUNCH: time it as you reach the carrier",
      "SPACE (ball up)  timed leap — pick the pass off at its peak",
      "SHIFT/hold-click SOAR (safety only): straight-line flight. The",
      "                 wings run on a 1s charge: short hops instantly,",
      "                 full-field flights on a full tank. Unstoppable",
      "                 mid-air — blocks and jukes can't ground you.",
      "SHIFT (blocked)  spin move to shed an offensive lineman",
      "R .............. RAMPAGE when the ★ apex dino's meter is full"]],
    ["PLAYBOOK GLOSSARY — OFFENSE", [
      "FOUR VERTS ..... everyone sprints deep. Beats teams with few",
      "                 deep defenders; risky vs Cover 4.",
      "SLANTS ......... quick diagonal cuts. Fast, safe, short.",
      "RB SCREEN ...... throw short behind the line, blockers lead.",
      "HB DIVE/SWEEP .. handoff up the middle / around the edge.",
      "SWEEP PASS ..... FAKE the sweep, blockers sneak out, RB throws!",
      "PLAY ACTION idea: run first so they crowd the line, then bomb."]],
    ["PLAYBOOK GLOSSARY — DEFENSE (for non-football people)", [
      "MAN ............ every defender shadows one receiver, like tag.",
      "ZONE ........... defenders guard AREAS of grass instead.",
      "COVER 2/3/4 .... the number = how many defenders split the DEEP",
      "                 field. Cover 2 = 2 deep halves. Cover 4 = four",
      "                 deep quarters (nothing gets behind you… slowly).",
      "TAMPA 2 ........ Cover 2, but a linebacker sprints to the deep",
      "                 middle — plugs Cover 2's famous soft spot.",
      "NICKEL BLITZ ... a 5th defensive back is on the field… and he",
      "                 CHARGES the QB instead of covering. High risk.",
      "QB SPY ......... one defender ignores everyone and mirrors the",
      "                 QB so he can't scramble.",
      "PREVENT ........ everyone plays deep, gives up short stuff,",
      "                 protects a late lead."]],
    ["WEATHER, RATINGS & DINO POWERS", [
      "Every player has UNIQUE ratings from their real NFL size and",
      "stats: speed, strength, jump, hands… Strong O-lines block",
      "longer; strong D-lines break through faster.",
      "RAIN/FREEZING adds small drop+fumble risk. SNOW slows legs.",
      "V throws a snowball in snow games. C throws the CHALLENGE",
      "FLAG once a game on a close call. Halftime = mascot minigame!"]],
  ];
  // ------------------------------------------------------------- scouting
  const SCOUT_COLS = [["spd", "SPD"], ["str", "STR"], ["jump", "JMP"], ["hands", "HND"], ["tkl", "TKL"], ["agi", "AGI"]];
  function openScouting() {
    G.scout = { sort: "spd", posFilter: "ALL", top: 0, list: null };
    G.state = "scout";
    if (!G.scoutData) {
      fetch("/api/game/players").then((r) => r.json()).then((d) => { G.scoutData = d.players || []; }).catch(() => { G.scoutData = []; });
    }
  }
  function scoutList() {
    let L = G.scoutData || [];
    const f = G.scout.posFilter;
    if (f === "OFF") L = L.filter((p2) => ["QB", "RB", "FB", "WR", "TE"].includes(p2.pos));
    else if (f === "OL") L = L.filter((p2) => ["C", "G", "OT", "OL", "T"].includes(p2.pos));
    else if (f === "DEF") L = L.filter((p2) => !["QB", "RB", "FB", "WR", "TE", "C", "G", "OT", "OL", "T"].includes(p2.pos));
    return L.slice().sort((a, b) => (b[G.scout.sort] || 0) - (a[G.scout.sort] || 0));
  }
  function scoutKey(k) {
    if (k === "escape") { G.state = "menu"; return; }
    const idx = SCOUT_COLS.findIndex((c) => c[0] === G.scout.sort);
    if (k === "arrowright" || k === "d") { G.scout.sort = SCOUT_COLS[(idx + 1) % SCOUT_COLS.length][0]; G.scout.top = 0; }
    if (k === "arrowleft" || k === "a") { G.scout.sort = SCOUT_COLS[(idx + SCOUT_COLS.length - 1) % SCOUT_COLS.length][0]; G.scout.top = 0; }
    if (k === "arrowdown" || k === "s") G.scout.top = Math.min(Math.max(0, scoutList().length - 14), G.scout.top + 5);
    if (k === "arrowup" || k === "w") G.scout.top = Math.max(0, G.scout.top - 5);
    if (k === "f") { const F = ["ALL", "OFF", "OL", "DEF"]; G.scout.posFilter = F[(F.indexOf(G.scout.posFilter) + 1) % F.length]; G.scout.top = 0; }
  }
  function scoutClick() {
    // tap a column header to sort by it
    const y0 = 92;
    if (mouse.y > y0 - 16 && mouse.y < y0 + 4) {
      for (let i = 0; i < SCOUT_COLS.length; i++) {
        const x0 = 420 + i * 82;
        if (mouse.x > x0 - 36 && mouse.x < x0 + 36) { G.scout.sort = SCOUT_COLS[i][0]; G.scout.top = 0; return; }
      }
    }
    if (mouse.y > H - 44) { G.state = "menu"; return; }
    scoutKey(mouse.y > H / 2 ? "arrowdown" : "arrowup");
  }
  function drawScouting() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(13); cx.fillStyle = "#ffd23f";
    cx.fillText("SCOUTING — EVERY DINO IN THE LEAGUE", W / 2, 40);
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("◀▶ / TAP HEADER = SORT · F = FILTER (" + G.scout.posFilter + ") · ▲▼ SCROLL · ESC BACK", W / 2, 62);
    if (!G.scoutData) { cx.fillText("scouting the league…", W / 2, 200); return; }
    const L = scoutList();
    cx.textAlign = "left"; cx.font = PF(8);
    cx.fillStyle = "#69be28";
    cx.fillText("PLAYER", 70, 92); cx.fillText("TM", 300, 92); cx.fillText("POS", 352, 92);
    cx.textAlign = "center";
    SCOUT_COLS.forEach((c, i) => {
      cx.fillStyle = c[0] === G.scout.sort ? "#ffd23f" : "#69be28";
      cx.fillText(c[1] + (c[0] === G.scout.sort ? "▼" : ""), 420 + i * 82, 92);
    });
    for (let i = 0; i < 14; i++) {
      const p2 = L[G.scout.top + i]; if (!p2) break;
      const y = 116 + i * 26;
      cx.textAlign = "left"; cx.fillStyle = "#f4f6f1";
      cx.fillText((G.scout.top + i + 1) + ". " + lastName(p2.name).slice(0, 14).toUpperCase(), 70, y);
      cx.fillStyle = hudColor(p2.team); cx.fillText(p2.team, 300, y);
      cx.fillStyle = "#9db0a4"; cx.fillText(p2.pos, 352, y);
      cx.textAlign = "center";
      SCOUT_COLS.forEach((c, j) => {
        cx.fillStyle = c[0] === G.scout.sort ? "#ffd23f" : "#f4f6f1";
        cx.fillText(String(p2[c[0]] != null ? p2[c[0]] : "—"), 420 + j * 82, y);
      });
    }
  }

  // ---------------------------------------------------- ADD 4) playbook lab
  const ED_SLOTS = ["WR1", "WR3", "TE", "WR2", "RB"];
  function openEditor() {
    const saved = JSON.parse(localStorage.getItem("dinobowl_customplay") || "null");
    G.ed = { slot: 0, routes: saved ? saved.routesRaw : { WR1: [], WR3: [], TE: [], WR2: [], RB: [] } };
    G.state = "editor";
  }
  function editorStart(slot) { // receiver start positions on the mini-field
    return { WR1: [200, 130], WR3: [190, 190], TE: [200, 330], WR2: [200, 390], RB: [140, 275] }[slot];
  }
  function editorKey(k) {
    if (k === "escape") { G.state = "menu"; return; }
    if (k === "arrowdown" || k === "s") G.ed.slot = (G.ed.slot + 1) % ED_SLOTS.length;
    if (k === "arrowup" || k === "w") G.ed.slot = (G.ed.slot + ED_SLOTS.length - 1) % ED_SLOTS.length;
    if (k === "x") G.ed.routes[ED_SLOTS[G.ed.slot]] = [];
    if (k === "enter") {  // SAVE: convert pixels → route waypoints and store
      const routes = {};
      for (const sl of ED_SLOTS) {
        const pts = G.ed.routes[sl];
        if (!pts.length) { routes[sl] = { pts: [], end: "block" }; continue; }
        const st = editorStart(sl);
        let px = st[0], py = st[1];
        const wp = pts.map((q2) => {
          const dyd = Math.round((q2[0] - px) / 12), dy = Math.round((q2[1] - py) * 1.15);
          px = q2[0]; py = q2[1];
          return [Math.max(-4, dyd), dy];
        });
        routes[sl] = { pts: wp, end: "go" };
      }
      localStorage.setItem("dinobowl_customplay", JSON.stringify({ routes, routesRaw: G.ed.routes }));
      banner("PLAY SAVED!", "\"MY PLAY\" is now on your call sheet", 1.6);
      G.state = "menu";
    }
  }
  function editorClick() {
    // click near a receiver dot = select him; otherwise add a waypoint (max 3)
    for (let i = 0; i < ED_SLOTS.length; i++) {
      const st = editorStart(ED_SLOTS[i]);
      if (Math.hypot(mouse.x - st[0], mouse.y - st[1]) < 16) { G.ed.slot = i; return; }
    }
    const sl = ED_SLOTS[G.ed.slot];
    if (mouse.x > 120 && mouse.x < 900 && mouse.y > 90 && mouse.y < 460 && G.ed.routes[sl].length < 3) {
      G.ed.routes[sl].push([mouse.x, mouse.y]);
    }
  }
  function customPlay() {
    const saved = JSON.parse(localStorage.getItem("dinobowl_customplay") || "null");
    if (!saved) return null;
    return {
      name: "MY PLAY", type: "pass", tags: ["custom"], custom: true, routes: {
        WR1: saved.routes.WR1, WR3: saved.routes.WR3, TE: saved.routes.TE,
        WR2: saved.routes.WR2, RB: saved.routes.RB
      }
    };
  }
  function drawEditor() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.fillStyle = "#155229"; cx.fillRect(120, 90, 780, 370);
    cx.strokeStyle = "rgba(244,246,241,.4)";
    for (let i = 0; i < 8; i++) { cx.beginPath(); cx.moveTo(180 + i * 90, 90); cx.lineTo(180 + i * 90, 460); cx.stroke(); }
    cx.fillStyle = "rgba(60,120,255,.7)"; cx.fillRect(218, 90, 3, 370);   // the line of scrimmage
    cx.textAlign = "center"; cx.font = PF(13); cx.fillStyle = "#ffd23f";
    cx.fillText("PLAYBOOK LAB — DRAW \"MY PLAY\"", W / 2, 40);
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("▲▼ PICK A RECEIVER · CLICK THE GRASS = ADD WAYPOINT (3 MAX) · X = CLEAR · ENTER = SAVE · ESC", W / 2, 62);
    for (let i = 0; i < ED_SLOTS.length; i++) {
      const sl = ED_SLOTS[i], st = editorStart(sl), sel = i === G.ed.slot;
      cx.strokeStyle = sel ? "#ffd23f" : "rgba(255,210,63,.4)"; cx.lineWidth = 2;
      cx.setLineDash(sel ? [] : [4, 5]);
      cx.beginPath(); cx.moveTo(st[0], st[1]);
      for (const q2 of G.ed.routes[sl]) cx.lineTo(q2[0], q2[1]);
      cx.stroke(); cx.setLineDash([]);
      for (const q2 of G.ed.routes[sl]) { cx.fillStyle = "#ffd23f"; cx.fillRect(q2[0] - 3, q2[1] - 3, 6, 6); }
      cx.fillStyle = sel ? "#ffd23f" : "#69be28";
      cx.beginPath(); cx.arc(st[0], st[1], sel ? 10 : 7, 0, Math.PI * 2); cx.fill();
      cx.font = PF(7); cx.fillStyle = "#0a1f14"; cx.fillText(sl, st[0], st[1] + 3);
    }
  }

  // -------------------------------------------- ADD 3) franchise offseason
  function loadFranchise() { try { return JSON.parse(localStorage.getItem("dinobowl_franchise") || "null"); } catch (e) { return null; } }
  function saveFranchise(f) { localStorage.setItem("dinobowl_franchise", JSON.stringify(f)); }
  function genRookie(i) {
    const POS2 = ["QB", "RB", "WR", "TE", "LB", "CB", "S"][(Math.random() * 7) | 0];
    const nm = ["Rex Halloway", "Dot Comet", "Sarge Fossil", "Nova Quickstep", "Bruiser Yates", "Echo Nightwing"][(Math.random() * 6) | 0] + " Jr.";
    const q2 = 70 + ((Math.random() * 28) | 0);
    return {
      name: nm, pos: POS2, role: POS2 === "QB" ? "QB" : POS2 === "RB" ? "RB" : POS2 === "WR" ? "WR" : POS2 === "TE" ? "TE" : POS2,
      spd: q2 + ((Math.random() * 8) | 0) - 4, hands: q2 - 4 + ((Math.random() * 10) | 0), str: 62 + ((Math.random() * 34) | 0),
      jump: 62 + ((Math.random() * 34) | 0), agi: q2, arm: POS2 === "QB" ? q2 + 4 : 70, acc: POS2 === "QB" ? q2 : 70, tkl: 60 + ((Math.random() * 30) | 0), stats: {}
    };
  }
  function startOffseason() {
    const others = ABBRS.filter((t) => t !== G.szn.team);
    const fas = [];
    for (let i = 0; i < 3; i++) {
      const t = others[(Math.random() * others.length) | 0];
      const ros = roster(t);
      const star = ros.offense[(Math.random() * ros.offense.length) | 0];
      if (star) fas.push(dict_star(star, t));
    }
    G.off = { step: 0, picks: [genRookie(0), genRookie(1), genRookie(2)], fas, chosen: {} };
    G.state = "offseason";
  }
  function dict_star(p2, t) { const c = JSON.parse(JSON.stringify(p2)); c.fromTeam = t; return c; }
  function offseasonKey(k) {
    const n = parseInt(k, 10);
    if (n >= 1 && n <= 3) offseasonPick(n - 1);
    if (k === "escape") finishOffseason();
  }
  function offseasonClick() {
    const i = Math.floor((mouse.x - 90) / 270);
    if (i >= 0 && i <= 2 && mouse.y > 150 && mouse.y < 420) offseasonPick(i);
  }
  function offseasonPick(i) {
    if (G.off.step === 0) { G.off.chosen.draft = G.off.picks[i]; G.off.step = 1; sfx.td(); }
    else { G.off.chosen.fa = G.off.fas[i]; finishOffseason(); }
  }
  function finishOffseason() {
    const f = loadFranchise() || { year: 1, adds: [], aged: 0 };
    f.year++; f.aged++;
    if (G.off && G.off.chosen.draft) f.adds.push(dictTeamAdd(G.off.chosen.draft));
    if (G.off && G.off.chosen.fa) f.adds.push(dictTeamAdd(G.off.chosen.fa));
    f.team = G.szn.team;
    saveFranchise(f);
    const team = G.szn.team;
    clearSeason();
    newSeason(team);
    banner("YEAR " + f.year + " BEGINS!", "Your legends return — a little older, a little wiser.", 2.4);
    G.state = "hub";
  }
  function dictTeamAdd(p2) { const c = JSON.parse(JSON.stringify(p2)); delete c.fromTeam; return c; }
  function drawOffseason() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    const o = G.off;
    cx.fillText(o.step === 0 ? "THE DINO DRAFT — PICK ONE ROOKIE" : "FREE AGENCY — SIGN ONE STAR", W / 2, 60);
    const list = o.step === 0 ? o.picks : o.fas;
    for (let i = 0; i < list.length; i++) {
      const p2 = list[i], x0 = 90 + i * 270;
      cx.fillStyle = "#0d2519"; cx.fillRect(x0, 150, 250, 270);
      cx.strokeStyle = "#1d4030"; cx.strokeRect(x0, 150, 250, 270);
      cx.font = PF(9); cx.fillStyle = "#ffd23f";
      cx.fillText("[" + (i + 1) + "] " + lastName(p2.name).toUpperCase(), x0 + 125, 190);
      cx.font = PF(8); cx.fillStyle = "#f4f6f1";
      cx.fillText(p2.pos + (p2.fromTeam ? " · from " + p2.fromTeam : " · ROOKIE"), x0 + 125, 216);
      cx.fillStyle = "#9db0a4";
      cx.fillText("SPD " + p2.spd + "  HND " + (p2.hands || 70), x0 + 125, 250);
      cx.fillText("STR " + (p2.str || 70) + "  JMP " + (p2.jump || 70), x0 + 125, 274);
    }
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("1-3 / TAP TO CHOOSE", W / 2, H - 40);
  }

  function drawTutorial() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    const pg = TUT_PAGES[G.tut || 0];
    cx.textAlign = "center"; cx.font = PF(13); cx.fillStyle = "#ffd23f";
    cx.fillText(pg[0], W / 2, 54);
    cx.font = PF(8); cx.textAlign = "left"; cx.fillStyle = "#f4f6f1";
    pg[1].forEach((l, i) => cx.fillText(l, 90, 100 + i * 24));
    cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("◀ ▶ PAGE " + ((G.tut || 0) + 1) + "/" + TUT_PAGES.length + " · ESC = BACK", W / 2, H - 24);
  }

  // menu card layout: 3 columns of chunky arcade cards with dino mascots
  const MENU_ICONS = {
    "EXHIBITION": ["trex", "🏈"], "2-PLAYER VERSUS": ["carno", "🤜🤛"], "ONLINE VERSUS": ["quetz", "🌐"],
    "PRACTICE": ["troodon", "🏋"], "CONTINUE SEASON": ["spino", "📅"], "CONTINUE CAREER": ["veloci", "⭐"],
    "NEW SEASON": ["spino", "📅"], "NEW CAREER": ["veloci", "⭐"], "MEET THE QBS": ["troodon", "🎓"],
    "TUTORIAL": ["pachy", "📖"], "SCOUTING": ["deinony", "🔎"], "PLAYBOOK LAB": ["deino", "✏"],
  };
  function menuCardRects() {
    const opts = menuOptions();
    const cols = 3, cw = 284, chh = 88, gapx = 18, gapy = 14;
    const rows = Math.ceil(opts.length / cols);
    const x0 = (W - (cols * cw + (cols - 1) * gapx)) / 2;
    const y0 = Math.max(96, (H - 40 - rows * (chh + gapy)) / 2 + 40);
    return opts.map((o, i) => ({
      x: x0 + (i % cols) * (cw + gapx), y: y0 + ((i / cols) | 0) * (chh + gapy), w: cw, h: chh, o, i,
    }));
  }
  function drawMenu() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    // subtle field-stripe backdrop
    for (let i = 0; i < 10; i++) { cx.fillStyle = i % 2 ? "rgba(255,255,255,.015)" : "transparent"; cx.fillRect(i * 96, 0, 96, H); }
    cx.textAlign = "center";
    cx.font = PF(26); cx.fillStyle = "#2a6e37"; cx.fillText("DINO BOWL", W / 2 + 3, 57);
    cx.fillStyle = "#ffd23f"; cx.fillText("DINO BOWL", W / 2, 54);
    const t = performance.now() / 220 | 0;
    for (const r2 of menuCardRects()) {
      const sel = r2.i === G.menuIdx;
      const hov = mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h;
      cx.fillStyle = sel ? "#14402a" : hov ? "#102e1f" : "#0d2519";
      cx.fillRect(r2.x, r2.y, r2.w, r2.h);
      cx.strokeStyle = sel ? "#ffd23f" : "#1d4030"; cx.lineWidth = sel ? 3 : 2;
      cx.strokeRect(r2.x, r2.y, r2.w, r2.h);
      // mascot sprite on the left of the card
      const ic = MENU_ICONS[r2.o[0]] || ["trex", ""];
      if (G.sheets.A && G.sheets.A[ic[0]]) {
        cx.drawImage(G.sheets.A[ic[0]].R[sel ? t % 2 : 0], r2.x + 8, r2.y + r2.h / 2 - 22, 44, 44);
      }
      cx.textAlign = "left";
      cx.font = PF(sel ? 10 : 9); cx.fillStyle = sel ? "#ffd23f" : "#f4f6f1";
      cx.fillText(ic[1] + " " + r2.o[0], r2.x + 60, r2.y + 34);
      cx.font = PF(7); cx.fillStyle = "#9db0a4";
      const sub = r2.o[1].length > 34 ? r2.o[1].slice(0, 33) + "…" : r2.o[1];
      cx.fillText(sub, r2.x + 60, r2.y + 54);
    }
    cx.textAlign = "center"; cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("ARROWS + ENTER · CLICK/TAP A CARD · ESC BACK", W / 2, H - 14);
  }

  function drawHub() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    const z = G.szn;
    if (!z) { G.state = "menu"; return; }
    const t = TEAMS[z.team];
    cx.textAlign = "center";
    cx.font = PF(20); cx.fillStyle = t[2];
    cx.fillText(t[0].toUpperCase() + "  ·  " + z.records[z.team].w + "-" + z.records[z.team].l, W / 2, 70);
    if (z.phase === "done") {
      const champ = z.champion;
      cx.font = PF(24); cx.fillStyle = "#ffd23f";
      cx.fillText(champ === z.team ? "🏆 DINO BOWL CHAMPIONS!" : "SEASON OVER", W / 2, 180);
      cx.font = PF(12); cx.fillStyle = "#f4f6f1";
      cx.fillText(champ === z.team ? "The " + t[0] + " rule the Cretaceous." : TEAMS[champ][0].toUpperCase() + " win the DINO BOWL.", W / 2, 220);
      if (G.career) drawCareerSummary(300);
      cx.font = PF(10); cx.fillStyle = "#ffd23f";
      cx.fillText("ENTER = BACK TO MENU", W / 2, H - 60);
      return;
    }
    let heading, subline;
    if (z.phase === "regular") {
      const sched = z.schedule[z.week - 1];
      heading = "WEEK " + z.week + " / 17";
      subline = (sched.home ? "vs " : "@ ") + TEAMS[sched.opp][0].toUpperCase() + "  (" + z.records[sched.opp].w + "-" + z.records[sched.opp].l + ")";
    } else {
      heading = z.playoffs.roundNames[z.playoffs.round] || "PLAYOFFS";
      subline = "seed #" + z.playoffs.seed + " — win or go extinct";
    }
    cx.font = PF(13); cx.fillStyle = "#f4f6f1"; cx.fillText(heading, W / 2, 130);
    cx.font = PF(11); cx.fillStyle = "#9db0a4"; cx.fillText(subline, W / 2, 158);
    // the coaching staff (older saves get one generated on the spot)
    if (!z.staff) { z.staff = genStaff(); saveSeason(); }
    cx.font = PF(7); cx.fillStyle = "#69be28";
    cx.fillText("HC " + z.staff.hc.name.toUpperCase() + " " + "★".repeat(z.staff.hc.stars) +
      "   ·   OC " + z.staff.oc.name.toUpperCase() + " " + "★".repeat(z.staff.oc.stars) +
      "   ·   DC " + z.staff.dc.name.toUpperCase() + " " + "★".repeat(z.staff.dc.stars), W / 2, 182);
    // recent results
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    const recent = z.results.slice(-5);
    recent.forEach((r2, i) => {
      const wl = r2.my > r2.them ? "W" : "L";
      cx.fillStyle = wl === "W" ? "#69be28" : "#ff7a6b";
      cx.fillText("WK" + r2.week + "  " + wl + " " + r2.my + "-" + r2.them + " " + (r2.home ? "vs" : "@") + " " + r2.opp, W / 2, 210 + i * 22);
    });
    if (G.career) drawCareerHubPanel();
    cx.font = PF(13); cx.fillStyle = Math.sin(performance.now() / 300) > 0 ? "#ffd23f" : "#8a6";
    cx.fillText("ENTER = PLAY", W / 2, 400);
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("S = STANDINGS  ·  T = TEAM STATS  ·  ESC = MENU", W / 2, 434);
  }

  function drawStandings() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText("STANDINGS", W / 2, 46);
    cx.font = PF(7);
    let col = 0;
    for (const [div, teams] of Object.entries(DIVISIONS)) {
      const x = 60 + (col % 4) * 220, y0 = 80 + ((col / 4) | 0) * 220;
      cx.textAlign = "left";
      cx.fillStyle = "#ffd23f"; cx.fillText(div, x, y0);
      const sorted = teams.slice().sort((a, b) => G.szn.records[b].w - G.szn.records[a].w);
      sorted.forEach((tm, i) => {
        cx.fillStyle = tm === G.szn.team ? "#ffd23f" : "#f4f6f1";
        cx.fillText(tm.padEnd(4) + " " + G.szn.records[tm].w + "-" + G.szn.records[tm].l, x, y0 + 20 + i * 16);
      });
      col++;
    }
    cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("ENTER = BACK", W / 2, H - 26);
  }

  function drawSznStats() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText(TEAMS[G.szn.team][0].toUpperCase() + " SEASON STATS", W / 2, 46);
    const rows = Object.values(G.szn.seasonStats || {})
      .map((s) => ({ s, v: s.passYds + s.rushYds + s.recYds + s.tkl * 4 + s.sacks * 10 }))
      .sort((a, b) => b.v - a.v).slice(0, 14);
    cx.font = PF(8); cx.textAlign = "left";
    rows.forEach((r2, i) => {
      const s = r2.s;
      const x = i < 7 ? 80 : W / 2 + 40, y = 90 + (i % 7) * 56;
      cx.fillStyle = "#ffd23f";
      cx.fillText((s.pos + "    ").slice(0, 4) + lastName(s.name).slice(0, 14) + "  (" + s.games + " gm)", x, y);
      cx.fillStyle = "#f4f6f1";
      const parts = [];
      if (s.att) parts.push(s.cmp + "/" + s.att + ", " + s.passYds + " yds, " + s.passTd + " TD, " + s.passInt + " INT");
      if (s.car) parts.push(s.car + " car, " + s.rushYds + " yds" + (s.rushTd ? ", " + s.rushTd + " TD" : ""));
      if (s.rec) parts.push(s.rec + " rec, " + s.recYds + " yds" + (s.recTd ? ", " + s.recTd + " TD" : ""));
      if (s.tkl || s.sacks) parts.push(s.tkl + " tkl" + (s.sacks ? ", " + s.sacks + " sacks" : "") + (s.defInt ? ", " + s.defInt + " INT" : ""));
      cx.fillText(parts.join(" · ").slice(0, 58) || "—", x, y + 16);
    });
    if (!rows.length) { cx.textAlign = "center"; cx.fillStyle = "#9db0a4"; cx.fillText("Play a game first!", W / 2, 200); }
    cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("ENTER = BACK", W / 2, H - 26);
  }

  function drawSelect() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    cx.font = PF(20); cx.fillStyle = "#ffd23f";
    cx.fillText(G.selStep === 0 ? "PICK YOUR TEAM" : "PICK YOUR OPPONENT", W / 2, 60);
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("ARROWS / CLICK · ENTER TO CONFIRM", W / 2, 88);
    const sel = G.selStep === 0 ? G.selA : G.selB;
    const other = G.selStep === 1 ? G.selA : -1;
    for (let i = 0; i < 32; i++) {
      const ab = ABBRS[i], t = TEAMS[ab];
      const x = 188 + (i % 8) * 74, y = 150 + ((i / 8) | 0) * 56;
      cx.fillStyle = t[1]; cx.fillRect(x, y, 66, 48);
      cx.fillStyle = shade(t[1], -25); cx.fillRect(x, y + 40, 66, 8);
      cx.font = PF(12); cx.fillStyle = t[2];
      cx.fillText(ab, x + 33, y + 24);
      if (i === other) { cx.font = PF(8); cx.fillStyle = "#fff"; cx.fillText("YOU", x + 33, y + 38); }
      if (i === sel) {
        cx.strokeStyle = "#ffd23f"; cx.lineWidth = 3;
        cx.strokeRect(x - 3, y - 3, 72, 54);
      }
    }
    // roster preview panel
    const ab = ABBRS[sel], ros = roster(ab);
    const qb = ros.offense.find((p) => p.role === "QB");
    const wr = ros.offense.find((p) => p.role === "WR");
    const rb = ros.offense.find((p) => p.role === "RB");
    cx.font = PF(11); cx.fillStyle = "#f4f6f1"; cx.textAlign = "center";
    let line = TEAMS[ab][0].toUpperCase() + "  ·  OVR " + ros.ovr;
    if (qb) line += "  ·  QB " + lastName(qb.name) + (qb.stats && qb.stats.passing_yards ? " (" + qb.stats.passing_yards + " YDS)" : "");
    cx.fillText(line, W / 2, 420);
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    let l2 = "";
    if (rb) l2 += "RB " + lastName(rb.name) + (rb.stats && rb.stats.rushing_yards != null ? " " + rb.stats.rushing_yards + "yd" : "") + "   ";
    if (wr) l2 += "WR " + lastName(wr.name) + (wr.stats && wr.stats.receiving_yards != null ? " " + wr.stats.receiving_yards + "yd" : "");
    cx.fillText(l2, W / 2, 444);
    cx.fillText("K " + lastName(ros.kicker.name) + " · LEG " + ros.kicker.leg, W / 2, 466);
  }

  function drawPlaycall() {
    cx.fillStyle = "rgba(5,12,8,.55)"; cx.fillRect(0, 330, W, H - 330);
    cx.textAlign = "center";
    cx.font = PF(13); cx.fillStyle = "#ffd23f";
    const label = G.state === "defcall" ? "DEFENSIVE CALL" : "CALL THE PLAY";
    cx.fillText(label + "  ·  " + downText() + "  ·  " + (G.state === "defcall" ? "CPU ball" : "your ball"), W / 2, 350);
    const cards = currentCards();
    for (const r2 of cardRects(cards)) {
      const hov = mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h;
      cx.fillStyle = hov ? "#14402a" : "#0d2519";
      cx.fillRect(r2.x, r2.y, r2.w, r2.h);
      cx.strokeStyle = hov ? "#ffd23f" : "#1d4030"; cx.lineWidth = 2;
      cx.strokeRect(r2.x, r2.y, r2.w, r2.h);
      cx.font = PF(10); cx.fillStyle = "#f4f6f1";
      const name = r2.c.kind === "play" ? r2.c.play.name : r2.c.kind === "FG" ? "FIELD GOAL" : "PUNT";
      cx.fillText(name, r2.x + r2.w / 2, r2.y + 24);
      cx.font = PF(8); cx.fillStyle = "#9db0a4";
      cx.fillText("[" + (cardRects(cards).indexOf(r2) + 1) + "]", r2.x + r2.w / 2, r2.y + r2.h - 10);
      if (r2.c.kind === "play") drawMiniPlay(r2.c.play, r2.x + r2.w / 2, r2.y + 72);
      else {
        cx.font = PF(22); cx.fillText(r2.c.kind === "FG" ? "🦶" : "☁", r2.x + r2.w / 2, r2.y + 80);
      }
    }
  }
  function drawMiniPlay(play, cxx, cyy) {
    cx.strokeStyle = "#69be28"; cx.lineWidth = 2;
    if (!play.routes && play.type !== "run") {
      // defensive call: X marks
      cx.font = PF(9); cx.fillStyle = "#ff7a6b"; cx.textAlign = "center";
      const n = play.rush || 3;
      cx.fillText("RUSH " + n, cxx, cyy);
      cx.fillText(play.man ? "MAN COVER" : "ZONE COVER", cxx, cyy + 22);
      return;
    }
    if (play.type === "run") {
      cx.beginPath(); cx.moveTo(cxx - 20, cyy + 16);
      const lane = play.lane || 0;
      cx.lineTo(cxx - 6, cyy + 16 - 0); cx.lineTo(cxx + 26, cyy + 16 + lane * 18 - 8);
      cx.stroke();
      cx.fillStyle = "#69be28"; cx.fillRect(cxx - 24, cyy + 13, 6, 6);
      return;
    }
    const offs = [[-46, -24], [-30, -10], [14, 10], [34, 24], [-40, 30]];
    const keysR = ["WR1", "WR3", "TE", "WR2", "RB"];
    for (let i = 0; i < keysR.length; i++) {
      const rt = play.routes[keysR[i]];
      if (!rt || rt.end === "block") continue;
      let px = cxx - 50 + 8, py = cyy + offs[i][1];
      cx.beginPath(); cx.moveTo(px, py);
      for (const [dyd, dy] of rt.pts) { px += dyd * 2.4; py += dy * 0.22; cx.lineTo(px, py); }
      if (rt.end === "go") cx.lineTo(px + 16, py);
      cx.stroke();
    }
  }

  function drawPresnapUI() {
    // dotted route preview
    if (G.drive === "A" && G.curPlay.type === "pass") {
      cx.setLineDash([4, 5]); cx.strokeStyle = "rgba(255,210,63,.8)"; cx.lineWidth = 2;
      for (const e of G.players) {
        if (!e.path || !e.path.length) continue;
        cx.beginPath(); cx.moveTo(e.x - G.camX, e.y);
        for (const wp of e.path) cx.lineTo(wp.x - G.camX, wp.y);
        if (e.endMode === "go") {
          const lp = e.path[e.path.length - 1];
          cx.lineTo(lp.x - G.camX + 90, lp.y);
        }
        cx.stroke();
      }
      cx.setLineDash([]);
    }
    cx.textAlign = "center"; cx.font = PF(11);
    cx.fillStyle = "rgba(0,0,0,.55)"; cx.fillRect(W / 2 - 330, H - 34, 660, 26);
    cx.fillStyle = "#ffd23f";
    const a = G.drive === "A" ? (G.curPlay ? G.curPlay.name : "") + "  ·  Q/E AUDIBLE  ·  SPACE = SNAP" : "SPACE = SNAP";
    cx.fillText(a, W / 2, H - 16);
  }

  function drawLiveUI() {
    // aiming arc
    if (G.aim && G.ball.holder) {
      const qb = G.ball.holder;
      const a = G.aim;
      cx.setLineDash([5, 6]); cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2;
      cx.beginPath();
      const n = 14;
      const d = dist(qb, a), h = clamp(d * 0.28, 26, 120);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const px = qb.x + (a.x - qb.x) * k - G.camX;
        const py = qb.y + (a.y - qb.y) * k - (h * 4 * k * (1 - k));
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      cx.stroke(); cx.setLineDash([]);
      // landing marker
      cx.strokeStyle = "#ffd23f";
      cx.beginPath(); cx.arc(a.x - G.camX, a.y, 12, 0, Math.PI * 2); cx.stroke();
      cx.font = PF(8); cx.fillStyle = "#ffd23f"; cx.textAlign = "center";
      cx.fillText("RELEASE=LOB · SPACE/R-CLICK=BULLET", a.x - G.camX, a.y - 22);
    }

    // soar aim — a defender launching himself wings-open at a target point
    if (G.soarAim && G.controlled) {
      const s = G.controlled, a = G.soarAim;
      cx.setLineDash([5, 6]); cx.strokeStyle = "#8ecafc"; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(s.x - G.camX, s.y); cx.lineTo(a.x - G.camX, a.y); cx.stroke();
      cx.setLineDash([]);
      cx.strokeStyle = "#8ecafc";
      cx.beginPath(); cx.arc(a.x - G.camX, a.y, 12, 0, Math.PI * 2); cx.stroke();
      cx.font = PF(8); cx.fillStyle = "#8ecafc"; cx.textAlign = "center";
      cx.fillText("RELEASE TO SOAR", a.x - G.camX, a.y - 20);
    }

    // floating contextual key prompt over the controlled dino
    const cc = G.controlled;
    const prompt = (txt, tint) => {
      const px = cc.x - G.camX, py = cc.y - 40;
      cx.font = PF(8); cx.textAlign = "center";
      const w2 = cx.measureText(txt).width + 12;
      cx.fillStyle = "rgba(5,12,8,.8)"; cx.fillRect(px - w2 / 2, py - 10, w2, 14);
      cx.fillStyle = tint || "#ffd23f"; cx.fillText(txt, px, py);
    };
    if (cc && G.state === "live" && !G.soarAim) {
      if (offenseIsUser() && cc === G.carrier && G.phase === "carry") {
        // a trailing teammate exists to pitch to?
        const mate = G.players.find((p) => p.team === "off" && p !== cc && p.role !== "OL" && p.x < cc.x - 4);
        if (mate && !cc.canPass) prompt("Q LATERAL");
        else if (cc.canPass) prompt("HOLD-CLICK PASS · Q LATERAL");
      } else if (!offenseIsUser() && cc.soarT <= 0) {
        if (cc.species === "quetz" && soarReady(cc)) {
          prompt((cc.soarCharge >= 0.98 ? "SOAR — FULL RANGE" : "SOAR — SHORT HOP (" + Math.round(cc.soarCharge * 100) + "%)"), "#8ecafc");
        }
        else if (cc.species === "quetz") prompt("WINGS CHARGING " + Math.round((cc.soarCharge || 0) * 100) + "%", "#5a7a94");
        else if (cc.blockedBy) prompt("SHIFT: SPIN OFF THE BLOCK", "#ff8a5c");
        else if (G.carrier && dist(cc, G.carrier) < 46) prompt("F PUNCH", "#ff8a5c");
      }
    }
    // defense footer hint
    if (!offenseIsUser() && G.controlled) {
      cx.font = PF(8); cx.fillStyle = "rgba(244,246,241,.7)"; cx.textAlign = "center";
      const soarer = G.controlled.species === "quetz";
      cx.fillText("TAB SWITCH · SPACE DIVE · F PUNCH" + (soarer ? " · HOLD-CLICK / SHIFT = SOAR" : ""), W / 2, H - 14);
    }
  }

  function drawKickUI() {
    const k = G.kick;
    cx.fillStyle = "rgba(5,12,8,.6)"; cx.fillRect(W / 2 - 220, 180, 440, 190);
    cx.strokeStyle = "#ffd23f"; cx.strokeRect(W / 2 - 220, 180, 440, 190);
    cx.textAlign = "center";
    cx.font = PF(14); cx.fillStyle = "#ffd23f";
    const title = k.kind === "XP" ? "EXTRA POINT" : k.kind === "FG" ? "FIELD GOAL · " + Math.round(100 - G.losYd + 17) + " YDS" : "PUNT";
    cx.fillText(title, W / 2, 210);
    cx.font = PF(9); cx.fillStyle = "#f4f6f1";
    cx.fillText(lastName(k.kicker.name).toUpperCase() + "  LEG " + (k.kicker.leg || 84) + (k.cpu ? "  (CPU)" : ""), W / 2, 234);
    // power bar
    cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 170, 258, 340, 22);
    cx.fillStyle = "#e8622c"; cx.fillRect(W / 2 - 170, 258, 340 * ((k.stage === 0 ? k.val : k.power) / 100), 22);
    cx.strokeStyle = "#f4f6f1"; cx.strokeRect(W / 2 - 170, 258, 340, 22);
    cx.font = PF(8); cx.fillStyle = "#9db0a4"; cx.fillText("POWER", W / 2, 296);
    // accuracy bar
    if (k.stage >= 1) {
      cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 170, 310, 340, 22);
      cx.fillStyle = "#1d4030"; cx.fillRect(W / 2 - 24, 310, 48, 22);
      const vx = W / 2 - 170 + 340 * ((k.stage === 1 ? k.val : k.acc + 50) / 100);
      cx.fillStyle = "#ffd23f"; cx.fillRect(vx - 3, 306, 6, 30);
      cx.strokeStyle = "#f4f6f1"; cx.strokeRect(W / 2 - 170, 310, 340, 22);
      cx.font = PF(8); cx.fillStyle = "#9db0a4"; cx.fillText("ACCURACY — CLICK IN THE CENTER", W / 2, 350);
    } else if (!k.cpu) {
      cx.font = PF(8); cx.fillStyle = "#9db0a4"; cx.fillText("CLICK / SPACE TO SET POWER", W / 2, 350);
    }
    // wind
    const wd = G.weather.wind;
    cx.font = PF(9); cx.fillStyle = "#8ecafc";
    cx.fillText("WIND " + Math.round(Math.hypot(wd.x, wd.y) / 6) + " " + windArrow(), W / 2 + 150, 210);
  }
  function windArrow() {
    const w = G.weather.wind, a = Math.atan2(w.y, w.x);
    const dirs = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];
    return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  }

  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255));
  }
  // pick a HUD-legible color for a team: the brighter of its two colors,
  // lightened if it's still too dark for the near-black HUD bar
  function hudColor(ab) {
    if (!ab) return "#fff";
    let c = lum(TEAMS[ab][2]) >= lum(TEAMS[ab][1]) ? TEAMS[ab][2] : TEAMS[ab][1];
    if (lum(c) < 90) c = shade(c, 110);
    return c;
  }

  // draw HUD text with a 1px dark drop-shadow so it stays legible on any backdrop
  function hudText(txt, x, y, color) {
    cx.fillStyle = "rgba(0,0,0,.9)";
    cx.fillText(txt, x + 1, y + 1);
    cx.fillStyle = color;
    cx.fillText(txt, x, y);
  }

  function drawHUD() {
    // opaque top bar so the scoreboard reads over bright skylines/crowds
    cx.fillStyle = "rgba(4,10,7,.97)"; cx.fillRect(0, 0, W, 30);
    cx.fillStyle = "rgba(255,210,63,.35)"; cx.fillRect(0, 30, W, 1); // thin gold underline
    cx.textAlign = "left"; cx.font = PF(11);
    const nA = G.my || "YOU", nB = G.opp || "CPU";
    hudText(nA + " " + G.score.A, 14, 20, hudColor(G.my));
    hudText("—", 118, 20, "#9db0a4");
    hudText(nB + " " + G.score.B, 140, 20, hudColor(G.opp));
    cx.textAlign = "center";
    const qtxt = G.quarter <= 4 ? "Q" + G.quarter : "OT";
    const mm = Math.floor(G.clock / 60), ss = ("0" + Math.floor(G.clock % 60)).slice(-2);
    hudText(qtxt + " " + mm + ":" + ss, W / 2 - 60, 20, "#f4f6f1");
    hudText(downText(), W / 2 + 62, 20, "#ffd23f");
    // possession + weather
    cx.textAlign = "right"; cx.font = PF(9);
    const wIco = G.weather ? (G.weather.type === "RAIN" ? "☔" : G.weather.type === "SNOW" ? "❄" : "☀") : "";
    hudText((G.drive === "A" ? "◈ YOUR BALL" : "◈ CPU BALL") + "  " + wIco + " " + windArrow(), W - 120, 20, "#9db0a4");
    // rampage meter
    cx.fillStyle = "#0d2519"; cx.fillRect(W - 104, 8, 90, 14);
    const rp = G.rampage.A;
    cx.fillStyle = rp >= 100 ? "#ff4444" : "#e8622c";
    cx.fillRect(W - 104, 8, 90 * (rp / 100), 14);
    cx.strokeStyle = "#f4f6f1"; cx.strokeRect(W - 104, 8, 90, 14);
    cx.font = PF(7); cx.textAlign = "center";
    cx.fillStyle = "#fff";
    cx.fillText(rp >= 100 ? "R=RAMPAGE!" : "🦖RAMPAGE", W - 59, 18);

    // compact temperature + time-of-day dial (hidden under the practice tips bar)
    if (!G.practice && G.stadium && ["live", "presnap", "dead", "playcall", "defcall", "kick", "ptchoice"].includes(G.state)) {
      const dx = W - 30, dy = 44, r = 9;
      cx.fillStyle = "rgba(4,10,7,.75)";
      cx.beginPath(); cx.arc(dx, dy, r + 2, 0, Math.PI * 2); cx.fill();
      // sun arcs across the dial by time of day; moon at night; bulb icon in domes
      cx.strokeStyle = "rgba(255,255,255,.25)"; cx.lineWidth = 1;
      cx.beginPath(); cx.arc(dx, dy, r, 0, Math.PI * 2); cx.stroke();
      if (G.stadium.dome) {
        cx.fillStyle = "#f4e9c0"; cx.fillRect(dx - 2, dy - 4, 4, 5); cx.fillRect(dx - 1, dy + 2, 2, 2); // roof light
      } else {
        const ang = { day: -Math.PI / 2, dusk: -Math.PI / 8, night: Math.PI / 2 }[G.stadium.time] || -Math.PI / 2;
        const sx2 = dx + Math.cos(ang) * (r - 3), sy2 = dy + Math.sin(ang) * (r - 3);
        cx.fillStyle = G.stadium.time === "night" ? "#cfd8ea" : "#ffd23f";
        cx.beginPath(); cx.arc(sx2, sy2, 3, 0, Math.PI * 2); cx.fill();
      }
      const t = G.weather.temp != null ? G.weather.temp : 72;
      cx.font = PF(7); cx.textAlign = "right";
      cx.fillStyle = t <= 32 ? "#8ecafc" : t >= 85 ? "#ff8a5c" : "#9db0a4";
      cx.fillText(t + "°F", dx - 14, dy + 3);
    }
  }

  function drawBanner() {
    const b = G.banner;
    const a = Math.min(1, b.t * 3);
    cx.save(); cx.globalAlpha = a;
    cx.fillStyle = "rgba(5,12,8,.8)"; cx.fillRect(0, H / 2 - 58, W, 104);
    cx.fillStyle = "#ffd23f"; cx.fillRect(0, H / 2 - 58, W, 4); cx.fillRect(0, H / 2 + 42, W, 4);
    cx.textAlign = "center";
    cx.font = PF(26); cx.fillStyle = "#ffd23f";
    cx.fillText(b.text, W / 2, H / 2 - 8);
    if (b.sub) { cx.font = PF(11); cx.fillStyle = "#f4f6f1"; cx.fillText(b.sub, W / 2, H / 2 + 24); }
    cx.restore();
  }

  function drawOver() {
    cx.fillStyle = "rgba(5,12,8,.55)"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    cx.font = PF(30); cx.fillStyle = "#ffd23f";
    cx.fillText("FINAL", W / 2, 170);
    cx.font = PF(20); cx.fillStyle = "#f4f6f1";
    cx.fillText(G.my + " " + G.score.A + "  —  " + G.opp + " " + G.score.B, W / 2, 220);
    cx.font = PF(10); cx.fillStyle = "#9db0a4";
    cx.fillText("YOUR DAY: " + Math.round(G.stats.passYds + G.stats.rushYds) + " TOTAL YDS · " + G.stats.tds + " TD", W / 2, 260);
    if (G.pog) {
      cx.font = PF(11); cx.fillStyle = "#ffd23f";
      cx.fillText("🏆 PLAYER OF THE GAME: " + G.pog.name, W / 2, 292);
      cx.font = PF(9); cx.fillStyle = "#f4f6f1";
      cx.fillText(G.pog.line, W / 2, 312);
    }
    cx.font = PF(13); cx.fillStyle = Math.sin(performance.now() / 300) > 0 ? "#ffd23f" : "#8a6";
    cx.fillText("ENTER = CONTINUE  ·  B = BOX SCORE", W / 2, 348);
  }

  // ------------------------------------------------------------- box score
  function drawBoxScore() {
    cx.fillStyle = "rgba(5,12,8,.94)"; cx.fillRect(40, 40, W - 80, H - 80);
    cx.strokeStyle = "#ffd23f"; cx.strokeRect(40, 40, W - 80, H - 80);
    cx.textAlign = "center"; cx.font = PF(13); cx.fillStyle = "#ffd23f";
    cx.fillText("BOX SCORE  ·  " + (G.my || "") + " " + G.score.A + " — " + (G.opp || "") + " " + G.score.B, W / 2, 70);
    const lines = Object.values(G.gameStats || {});
    const forSide = (side) => lines.filter((s) => s.side === side);
    const fmt = (s) => {
      const parts = [];
      if (s.att) parts.push(s.cmp + "/" + s.att + " " + s.passYds + "yd " + s.passTd + "TD" + (s.passInt ? " " + s.passInt + "INT" : ""));
      if (s.car) parts.push(s.car + "car " + s.rushYds + "yd" + (s.rushTd ? " " + s.rushTd + "TD" : ""));
      if (s.rec) parts.push(s.rec + "rec " + s.recYds + "yd" + (s.recTd ? " " + s.recTd + "TD" : ""));
      if (s.tkl || s.sacks || s.defInt || s.ff) {
        let d = s.tkl + "tkl";
        if (s.sacks) d += " " + s.sacks + "sck";
        if (s.defInt) d += " " + s.defInt + "int";
        if (s.ff) d += " " + s.ff + "ff";
        parts.push(d);
      }
      return parts.join(" · ");
    };
    cx.font = PF(8); cx.textAlign = "left";
    [["A", 70, G.my], ["B", W / 2 + 30, G.opp]].forEach(([side, x0, ab]) => {
      cx.fillStyle = ab && TEAMS[ab] ? TEAMS[ab][2] : "#ffd23f";
      cx.font = PF(10);
      cx.fillText(ab || side, x0, 100);
      cx.font = PF(7); cx.fillStyle = "#f4f6f1";
      const rows = forSide(side)
        .map((s) => ({ s, score: s.passYds + s.rushYds + s.recYds + s.tkl * 4 + s.sacks * 10 + s.defInt * 12 + s.ff * 10 }))
        .sort((a, b) => b.score - a.score).slice(0, 12);
      rows.forEach((r2, i) => {
        const s = r2.s;
        cx.fillStyle = "#9db0a4";
        cx.fillText((s.pos + "    ").slice(0, 4) + lastName(s.name).slice(0, 12), x0, 122 + i * 26);
        cx.fillStyle = "#f4f6f1";
        cx.fillText(fmt(s).slice(0, 44), x0, 133 + i * 26);
      });
      if (!rows.length) { cx.fillStyle = "#9db0a4"; cx.fillText("no stats yet", x0, 122); }
    });
    cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("B TO CLOSE", W / 2, H - 54);
  }

  // sprite gallery (press G on title) — art QA
  const GALLERY = [
    ["troodon", "QB TROODON"], ["carno", "RB CARNOTAURUS"], ["pachy", "FB PACHY"],
    ["veloci", "WR VELOCIRAPTOR"], ["deino", "TE DEINOCHEIRUS"], ["trike", "OL TRICERATOPS"],
    ["stego", "DT STEGOSAURUS"], ["allo", "ED ALLOSAURUS"], ["spino", "LB SPINOSAURUS"],
    ["deinony", "CB DEINONYCHUS"], ["quetz", "S QUETZALCOATLUS"], ["trex", "T-REX"],
  ];
  function drawGallery() {
    cx.fillStyle = "rgba(5,12,8,.95)"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText("MEET THE HERD", W / 2, 40);
    const sheet = G.sheets.A;
    if (!sheet) return;
    const t = performance.now() / 220 | 0;
    for (let i = 0; i < GALLERY.length; i++) {
      const [key, label] = GALLERY[i];
      const spr = sheet[key];
      const gx = 90 + (i % 4) * 210, gy = 70 + ((i / 4) | 0) * 150;
      cx.drawImage(spr.R[t % 2], gx, gy, spr.w * 2.6, spr.h * 2.6);
      cx.font = PF(8); cx.fillStyle = "#f4f6f1";
      cx.fillText(label, gx + 46, gy + 108);
    }
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("G TO CLOSE", W / 2, H - 20);
  }

  function drawHelp() {
    cx.fillStyle = "rgba(5,12,8,.9)"; cx.fillRect(90, 60, W - 180, H - 120);
    cx.strokeStyle = "#ffd23f"; cx.strokeRect(90, 60, W - 180, H - 120);
    cx.textAlign = "left"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText("HOW TO PLAY DINO BOWL", 120, 100);
    cx.font = PF(9); cx.fillStyle = "#f4f6f1";
    const lines = [
      "OFFENSE — 4 downs to cross the yellow line.",
      " 1-4 / CLICK ....... call a play (4 = team's FAMOUS play)",
      " Q / E audible ..... SPACE = snap",
      " HOLD L-CLICK ...... aim pass · RELEASE = lob",
      " SPACE / R-CLICK ... BULLET pass while aiming (fast + flat)",
      " WASD run · SHIFT juke · E dive · X throwaway",
      " Q while running ... aim a LATERAL (backward, live ball!)",
      " QB sneak / handoff behind the line can still THROW",
      "",
      "DEFENSE — you control the ▼ dino. TAB switch · SPACE dive.",
      " F near carrier .... PEANUT PUNCH the ball out",
      " SHIFT (safety) .... QUETZALCOATLUS SOARS in a straight line",
      "",
      "R = RAMPAGE when the ★ APEX dino's meter is full.",
      "Every team has ONE apex — sometimes on defense!",
      "RAIN/FREEZING = drops+fumbles · SNOW = slow legs · V = throw a snowball",
      "OOB inside 1:00 stops the clock · M mute · H close help",
    ];
    lines.forEach((l, i) => cx.fillText(l, 120, 130 + i * 21));
  }

  function drawCenterText(a, b, y) {
    cx.textAlign = "center"; cx.font = PF(16); cx.fillStyle = "#ffd23f";
    cx.fillText(a, W / 2, H / 2 + (y || 0));
    if (b) { cx.font = PF(10); cx.fillStyle = "#9db0a4"; cx.fillText(b, W / 2, H / 2 + 30); }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r2 = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), bl = clamp((n & 255) + amt, 0, 255);
    return "rgb(" + r2 + "," + g + "," + bl + ")";
  }

  // debug/test hooks (used by automated game tests)
  G.debug = {
    enterPlaycall, buildPlayers, changePossession, enterKick, signaturePlay, choosePlay, tryRampage, lateral, dropBall, goForTwo,
    newSeason, startPlayoffs, seasonAfterGame, startSeasonGame, gameOver, simWeekOthers, pickWeather, makeStadium, get szn() { return G.szn; }
  };

  boot();
  requestAnimationFrame(loop);
})();
