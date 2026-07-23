/* ============================================================
 * DINO BOWL — an 8-bit retro football game with dinosaurs.
 * Real NFL teams + real player stats served from /api/game/teams.
 * ============================================================ */
(function () {
  "use strict";

  // ------------------------------------------------------------------ consts
  const W = 960, H = 540;
  // A 24px yard gives the live camera roughly 40 yards of field rather than
  // 48.  The scale is deliberate: a first down has room to develop and a TD
  // feels like the payoff to a drive, while all football distances remain
  // expressed in real yards through xAtYd / ydAtX.
  const YPX = 24;                       // px per yard (x axis)
  // A football play must always resolve. This is a last-resort whistle for
  // rare traffic jams or an abandoned user input sequence; normal passes,
  // runs, returns, tackles, and bounds checks all end much sooner.
  const MAX_LIVE_PLAY_T = 16;
  const FIELD_X0 = 10 * YPX;            // x of the left goal line
  const FIELD_LEN = 120 * YPX;          // 120 yards incl endzones
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
    truck: { label: "TRUCKSTICK", desc: "Has a 25–40% strength-based chance to shrug off each of the first two tacklers." },
    burner: { label: "AFTERBURNER", desc: "Game-breaking top-end speed." },
    yac: { label: "YAC MONSTER", desc: "Has a strong agility-based chance to make the first tackler miss." },
    redzone: { label: "RED-ZONE MAGNET", desc: "Reliable hands and body control inside the 20." },
    sack: { label: "QB HUNTER", desc: "Explodes off the edge; sacks jar the ball loose." },
    wall: { label: "IMMOVABLE", desc: "Collapses the pocket and swats passes." },
    tackle: { label: "HEAT-SEEKER", desc: "Improved pursuit and finishing on tackles." },
    ballhawk: { label: "BALLHAWK", desc: "Elite range and timing when playing the ball." },
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
    doink: () => { beep(1180, 0.08, "square", 0.09); beep(760, 0.12, "triangle", 0.05, 0.05); },
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
    // `?qa=1` is a local, non-gameplay visual review surface.  It lets the
    // team record the exact same canvas renderer used in a match without
    // relying on random drive outcomes to inspect a tackle or high-point grab.
    qaMode: new URLSearchParams(location.search).has("qa"),
    // `?qa=1&capture=1` keeps the deterministic review scene but removes
    // review-only chrome from a rendered GIF. Production play continues to
    // show its normal ball indicator and carrier name.
    qaCapture: new URLSearchParams(location.search).has("capture"), qaScene: null, qaStill: false,
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

  // Persistent CPU scouting lives only in this browser.  It is intentionally
  // small and aggregate: the CPU remembers play style and results, never raw
  // input recordings.  That lets a returning player face a coordinator that
  // recognizes repeated habits without turning one bad game into a cheat code.
  const CPU_SCOUT_KEY = "dinobowl_cpu_scout_v2";
  const freshScoutLine = () => ({ plays: 0, pass: 0, run: 0, sneak: 0, deep: 0, risky: 0, success: 0, turnovers: 0, tds: 0 });
  const freshCpuMemory = () => ({ version: 2, games: 0, wins: 0, losses: 0, opp: { all: freshScoutLine() }, cpu: { plays: {} } });
  function loadCpuMemory() {
    try {
      const saved = JSON.parse(localStorage.getItem(CPU_SCOUT_KEY) || "null");
      if (saved && saved.version === 2 && saved.opp && saved.cpu) {
        for (const key of Object.keys(saved.opp)) saved.opp[key] = Object.assign(freshScoutLine(), saved.opp[key]);
        saved.opp.all = saved.opp.all || freshScoutLine();
        saved.cpu.plays = saved.cpu.plays || {};
        return saved;
      }
    } catch (_) { /* a malformed old save simply starts fresh */ }
    return freshCpuMemory();
  }
  function saveCpuMemory() {
    try { localStorage.setItem(CPU_SCOUT_KEY, JSON.stringify(G.cpuMemory)); } catch (_) { }
  }
  G.cpuMemory = loadCpuMemory();

  function scoutSituation() {
    if (G.losYd >= 80 || G.losYd + G.toGain >= 100) return "redzone";
    if (G.toGain <= 3) return "short";
    if (G.toGain >= 8) return "long";
    return "normal";
  }
  function scoutLineFor(bucket) {
    const opp = G.cpuMemory.opp;
    if (!opp[bucket]) opp[bucket] = freshScoutLine();
    return opp[bucket];
  }
  function persistentScout(bucket) {
    const specific = scoutLineFor(bucket || scoutSituation());
    return specific.plays >= 6 ? specific : scoutLineFor("all");
  }
  function cpuExperience() {
    const all = scoutLineFor("all");
    // The learning curve is meaningful by a few games, but capped so the CPU
    // still has to execute rather than becoming statistically unbeatable.
    return clamp(G.cpuMemory.games * 0.08 + all.plays * 0.006, 0, 1);
  }
  function cpuRiskPickBoost(isRisky) {
    if (!isRisky || G.drive !== "A" || G.humanB) return 0;
    const scout = persistentScout(scoutSituation());
    const riskyRate = scout.risky / Math.max(1, scout.pass);
    const reps = clamp(scout.risky / 16, 0, 1);
    return clamp((0.025 + riskyRate * 0.06) * reps * (0.45 + cpuExperience() * 0.55), 0, 0.09);
  }
  function noteAiPlayStart() {
    if (G.practice || G.patMode || !G.curPlay) { G.aiPlay = null; return; }
    if (!G.driveStory || G.driveStory.side !== G.drive) G.driveStory = { side: G.drive, startYd: G.losYd, plays: 0 };
    G.driveStory.plays++;
    G.aiPlay = {
      side: G.drive, name: G.curPlay.name || "UNKNOWN", type: G.curPlay.type || "pass",
      tags: (G.curPlay.tags || []).slice(), startYd: G.losYd, toGain: G.toGain,
      qbKeep: !!G.curPlay.qbKeep,
      bucket: scoutSituation(), risky: false, counted: false,
    };
  }
  function recordAiPlayResult(reason, info, noSpot, spotYd) {
    const meta = G.aiPlay;
    if (!meta || meta.counted || G.practice || G.humanB) return;
    meta.counted = true;
    const turnover = !!(info && info.turnover);
    const gain = noSpot ? 0 : spotYd - meta.startYd;
    const td = !turnover && !noSpot && spotYd >= 100;
    const success = !turnover && !noSpot && (td || spotYd >= meta.startYd + meta.toGain || gain >= Math.max(3, meta.toGain * 0.55));
    if (isHuman(meta.side)) {
      for (const key of ["all", meta.bucket]) {
        const line = scoutLineFor(key);
        line.plays++; line[meta.type === "pass" ? "pass" : "run"]++;
        if (meta.qbKeep) line.sneak++;
        if (meta.tags.includes("deep")) line.deep++;
        if (meta.risky) line.risky++;
        if (success) line.success++;
        if (turnover) line.turnovers++;
        if (td) line.tds++;
      }
    } else {
      const plays = G.cpuMemory.cpu.plays;
      const line = plays[meta.name] || (plays[meta.name] = { plays: 0, success: 0, yards: 0, turnovers: 0, tds: 0 });
      line.plays++; line.yards += gain;
      if (success) line.success++;
      if (turnover) line.turnovers++;
      if (td) line.tds++;
    }
    saveCpuMemory();
  }
  function recordCpuGameResult() {
    if (G.humanB || G.practice) return;
    G.cpuMemory.games++;
    if (G.score.B > G.score.A) G.cpuMemory.wins++;
    else if (G.score.B < G.score.A) G.cpuMemory.losses++;
    saveCpuMemory();
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
      stats: G.stats, gameStats: G.gameStats, patMode: G.patMode, clockStopped: G.clockStopped, humanB: true,
      // so a matched guest can WATCH the host pick teams (read-only)
      selA: G.selA, selB: G.selB, selStep: G.selStep, selectFor: G.selectFor, mode: G.mode
    });
  }
  function applyNetFrame(f) {
    if (!f) return;
    // the host's pre-game lobby frame must not yank the guest off its own
    // "matched — waiting for host" screen
    if (f.state === "online_wait" || f.state === "loading" || f.state === "title" || f.state === "menu") return;
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
  // ------------------------------------------------- QUICK MATCH (auto-queue)
  // Two strangers who both tap QUICK MATCH get paired into ONE game via a
  // single atomic slot at dinobowl/matchmaking/waiting. Whoever arrives first
  // parks there as the host; the next arrival CLAIMS that slot (transaction
  // pops it) and joins as the guest. Stale slots (>45s) self-heal.
  function resetNet() {
    Net.role = null; Net.remoteView = false; Net.room = null;
    Net.inputRef = null; Net.frameRef = null; Net.guestRef = null; Net.waitRef = null; Net.cancelled = false;
  }
  async function ensureFirebase() {
    if (!window.DINO_BOWL_FIREBASE_CONFIG || !window.firebase) return false;
    if (!firebase.apps.length) firebase.initializeApp(window.DINO_BOWL_FIREBASE_CONFIG);
    await firebase.auth().signInAnonymously();
    Net.db = firebase.database();
    return true;
  }
  async function startQuickMatch() {
    resetNet();
    G.online = { phase: "searching", since: performance.now(), role: null };
    G.state = "online_wait";
    try {
      if (!(await ensureFirebase())) { alert("Online multiplayer needs Firebase config."); G.state = "menu"; return; }
    } catch (err) { console.error(err); alert("Could not sign in for matchmaking: " + err.message); G.state = "menu"; return; }
    if (Net.cancelled) return;
    const myUid = firebase.auth().currentUser.uid;
    const waitRef = Net.db.ref("dinobowl/matchmaking/waiting");
    Net.waitRef = waitRef;
    let asGuestRoom = null, asHostRoom = null;
    try {
      await waitRef.transaction((cur) => {
        const fresh = cur && typeof cur.ts === "number" && (Date.now() - cur.ts) < 45000;
        if (fresh && cur.uid && cur.uid !== myUid) {
          asGuestRoom = cur.room; asHostRoom = null;
          return null;                 // claim this waiting player → pop the slot
        }
        asGuestRoom = null; asHostRoom = roomId();
        return { uid: myUid, room: asHostRoom, ts: firebase.database.ServerValue.TIMESTAMP };
      });
    } catch (err) {
      console.error(err); netStatus("MATCH FAILED");
      alert("Matchmaking is unavailable (database rules may need deploying). Try ONLINE (LINK) instead.");
      G.online = null; G.state = "menu"; return;
    }
    if (Net.cancelled) { if (asHostRoom) waitRef.transaction((c) => (c && c.uid === myUid ? null : c)); return; }
    if (asGuestRoom) { await joinMatchedRoom(asGuestRoom, myUid); }
    else { await hostMatchedRoom(asHostRoom, myUid); }
  }
  async function hostMatchedRoom(room, myUid) {
    Net.role = "host"; Net.room = room;
    G.online.role = "host";
    netStatus("HOSTING · WAITING FOR A PLAYER");
    const ref = Net.db.ref("dinobowl/rooms/" + room);
    await ref.set({ meta: { createdAt: firebase.database.ServerValue.TIMESTAMP, version: 1, hostUid: myUid }, frame: netFrame() });
    Net.inputRef = ref.child("inputs");
    Net.inputRef.on("child_added", (snap) => { const input = snap.val(); snap.ref.remove(); if (input) applyRemoteInput(input); });
    // if we drop while still waiting, clear our queue slot so nobody joins a dead room
    Net.waitRef.onDisconnect().remove();
    Net.guestRef = ref.child("guestJoined");
    Net.guestRef.on("value", (snap) => {
      const g = snap.val();
      if (!g || !g.uid || !G.online || G.online.phase !== "searching") return;
      G.online.phase = "found";
      netStatus("MATCHED · YOU HOST");
      Net.waitRef.onDisconnect().cancel();
      Net.waitRef.transaction((cur) => (cur && cur.uid === myUid ? null : cur));   // tidy the slot
      // host picks the teams; the game streams to the guest from there
      setTimeout(() => {
        if (Net.cancelled) return;
        G.mode = "online"; G.humanB = true; G.career = null; G.selectFor = "exh";
        G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
      }, 1100);
    });
  }
  async function joinMatchedRoom(room, myUid) {
    Net.role = "guest"; Net.room = room; Net.remoteView = true;
    G.online = { phase: "found", role: "guest", since: performance.now() };
    const ref = Net.db.ref("dinobowl/rooms/" + room);
    Net.frameRef = ref.child("frame");
    await ref.child("guestJoined").set({ uid: myUid, ts: firebase.database.ServerValue.TIMESTAMP });
    Net.frameRef.on("value", (snap) => applyNetFrame(snap.val()));
    Net.inputRef = ref.child("inputs");
    netStatus("MATCHED · TEAM B");
  }
  function cancelMatch() {
    Net.cancelled = true;
    try {
      const uid = firebase.auth().currentUser && firebase.auth().currentUser.uid;
      if (Net.waitRef) { Net.waitRef.onDisconnect().cancel(); Net.waitRef.transaction((c) => (c && c.uid === uid ? null : c)); }
      if (Net.frameRef) Net.frameRef.off();
      if (Net.guestRef) Net.guestRef.off();
      if (Net.inputRef) Net.inputRef.off();
    } catch (_) { /* best-effort cleanup */ }
    resetNet();
    G.online = null; G.state = "menu"; G.menuIdx = 0;
    netStatus("READY");
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
    const key = e.key.toLowerCase();
    // QA capture keys are intentionally edge-triggered. Browser automation
    // correctly sends key-down input but may coalesce repeated numeric taps;
    // unlike movement, these local review controls must never be treated as a
    // held key or an export can silently duplicate a stale canvas frame.
    if (G.qaMode && ["1", "2", "3", "4", "5"].includes(key)) { onKey(key); return; }
    if (keys[key]) return;
    keys[key] = true;
    if (onlineInput({ type: "key", key })) keys[key] = false;
    else onKey(key);
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
  const SPEED_SCALE = 0.6;   // deliberately slow league — the field plays HUGE
  // Preserve rating spread without letting the slowest roster entry turn into
  // a visibly stalled sprite.  Retro-style football needs every on-field dino
  // to have enough baseline motion for routes, pursuit, and contact to read.
  const spdPx = (r) => Math.max(56, (96 + (r - 60) * 1.9) * SPEED_SCALE);   // rating -> px/s
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
    // A football is deliberately smaller than a 16×16 dino map. At one
    // pixel per ball-cell it lands inside the compact action claws instead of
    // reading as a white/orange block pasted over a helmet or torso.
    G.ballSpr = DinoSprites.buildBall(1);
    G.snowSpr = DinoSprites.buildSnowball(2);
    // Bare-dino sheets are kept for non-playing sideline staff only. Stadium
    // spectators themselves are deliberately simple color blocks, so the
    // stands stay readable instead of looking like a second team on the field.
    G.fanSprites = DinoSprites.buildFanSprites ? DinoSprites.buildFanSprites(1) : null;
    buildCrowd();
    G.state = "title";
    // A frozen `?qa=1&capture=1&qaStill=tackle&qaAt=.72` frame is a local
    // review aid only. It lets animation QA inspect the exact same renderer
    // at a named moment without racing requestAnimationFrame or touching live
    // gameplay state.
    const qaStillKind = G.qaMode && new URLSearchParams(location.search).get("qaStill");
    const qaStillAt = Number(new URLSearchParams(location.search).get("qaAt"));
    if (["tackle", "firstdown", "catch", "interception"].includes(qaStillKind)) {
      stageHighlight(qaStillKind);
      let remain = clamp(Number.isFinite(qaStillAt) ? qaStillAt : 0, 0, 2.2);
      while (remain > 0.0001) {
        const step = Math.min(1 / 120, remain);
        updateHighlight(step);
        remain -= step;
      }
      G.qaStill = true;
    }
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
    if (G.szn && G.szn.team === abbr && ((G.szn.dev && Object.keys(G.szn.dev).length) || (G.szn.devF && Object.keys(G.szn.devF).length))) {
      if (!cloned) { r2 = JSON.parse(JSON.stringify(r2)); cloned = true; }
      const applyDev = (p2) => {
        const d = (G.szn.dev || {})[p2.name];
        if (d) for (const f2 of ["spd", "hands", "agi", "acc", "arm", "tkl", "str"]) {
          if (p2[f2] != null) p2[f2] = clamp(p2[f2] + d, 55, 99);
        }
        // hand-picked TRAIN upgrades (the clickable upgrade screen)
        const df2 = (G.szn.devF || {})[p2.name];
        if (df2) for (const [f3, amt] of Object.entries(df2)) {
          p2[f3] = clamp((p2[f3] || 70) + amt, 40, 99);
        }
      };
      r2.offense.forEach(applyDev);
      (r2.defense || []).forEach(applyDev);
    }
    return r2;
  };

  function crowdFanPalette(homeColor) {
    const home = (G.stadium && TEAMS[G.stadium.home]) || null;
    // The team colors are present, but never dominate the whole stand.  The
    // other swatches make a packed stadium read as a mix of individual fans.
    return [
      homeColor || "#d39b68", home ? home[2] : "#d7ba71",
      "#d39b68", "#75a2bf", "#a57daa", "#6eaa70",
      "#c87567", "#d0ba79", "#8997aa",
    ];
  }

  function drawCrowdFanBlock(g, x, y, seed, palette) {
    // A spectator is intentionally just a compact cluster of rectangles.  No
    // limbs, tails, or sprite silhouette: at field scale these read cleanly as
    // a full stand without competing with the playable dinosaurs.
    const w = 4 + (seed % 3) * 2;
    const h = 3 + ((seed >>> 3) % 2) * 2;
    g.fillStyle = "#090f16";
    g.fillRect(x - 1, y + h, w + 2, 1);
    g.fillStyle = palette[(seed >>> 6) % palette.length];
    g.fillRect(x, y, w, h);
    // A restrained one-pixel highlight gives the block a little texture while
    // preserving the square/rectangle language of the crowd.
    if ((seed >>> 9) % 4 === 0) {
      g.fillStyle = "rgba(244,246,241,.42)";
      g.fillRect(x + 1, y, Math.max(1, w - 3), 1);
    }
  }

  function buildCrowd(homeColor) {
    const c = DinoSprites.makeCanvas(FIELD_LEN, 66);
    const g = c.getContext("2d");
    g.fillStyle = "#131a22"; g.fillRect(0, 0, FIELD_LEN, 64);
    g.imageSmoothingEnabled = false;
    const palette = crowdFanPalette(homeColor);
    // Pixel rails break up the seating rows; the short, varied blocks below
    // remain legible as fans without accidentally creating another dinosaur
    // silhouette in the background.
    g.fillStyle = "#25303b";
    for (let y = 2; y < 64; y += 12) g.fillRect(0, y, FIELD_LEN, 1);
    for (let y = 6, row = 0; y < 59; y += 10, row++) {
      for (let x = 4 + (row % 2) * 5; x < FIELD_LEN - 8; x += 12) {
        const seed = (((x * 37) ^ (row * 101) ^ (x >>> 1)) >>> 0);
        if (seed % 11 !== 0) drawCrowdFanBlock(g, x, y + ((seed >>> 12) % 2), seed, palette);
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
    // TRAIN points: 2 for a win, 1 for showing up, +1 for a 250-yard day
    G.szn.trainPts = (G.szn.trainPts || 0) + (won ? 2 : 1) +
      ((G.stats.passYds + G.stats.rushYds) >= 250 ? 1 : 0);
    mergeSeasonStats();
    developPlayers();
    // CONDITION: a game takes it out of the legs; STAMINA decides how much
    // comes back by next Sunday. Low-motor dinos start the next game duller.
    G.szn.condition = G.szn.condition || {};
    for (const s2 of Object.values(G.gameStats || {})) {
      if (s2.side !== "A") continue;
      const st = stamOf(s2.name, s2.pos);
      const drop = rnd(8, 20) - (st - 75) * 0.5;
      G.szn.condition[s2.name] = Math.round(clamp(100 - Math.max(0, drop), 78, 100));
    }
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
    G.rampUsed = { A: 0, B: 0 };   // holds the half-number it was spent in
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
    G.driveStory = { side: G.drive, startYd: G.losYd, plays: 0 };
    G.stats = { passYds: 0, rushYds: 0, tds: 0 };
    G.gameStats = {}; G.challengeUsed = false; G.ticker = null;
    G.banner = null;
    // show the pregame hype/lineup screen first; kickoff waits for ENTER/tap
    G.intro = { t: 0 };
    G.state = "intro";
    sfx.td();
  }
  function kickoffAfterPregame() {
    const wtxt = G.weather.type === "CLEAR" ? "Clear skies in the Cretaceous." :
      G.weather.type === "RAIN" ? "Rain — slick ball, watch for fumbles!" : "Snow — heavy legs, short passes!";
    banner(TEAMS[G.my][0].toUpperCase() + " vs " + TEAMS[G.opp][0].toUpperCase(), wtxt + "  " + (G.drive === "A" ? "You receive!" : (G.humanB ? "P2 receives!" : "CPU receives!")), 2.4);
    // Opening possession starts with an actual kick and return, not a silent
    // placement at the 25.  G.drive is already the team receiving the toss.
    const receiving = G.drive;
    G.state = "dead"; G.deadT = 2.4; G.deadNext = () => startKickoff(receiving);
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
    G.driveStory = { side: G.drive, startYd: G.losYd, plays: 0 };
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

  function learnedCpuOffensePick(candidates) {
    if (!candidates.length) return null;
    const learned = G.cpuMemory.cpu.plays || {};
    const experience = cpuExperience();
    const weights = candidates.map((p) => {
      const line = learned[p.name];
      if (!line || !line.plays) return 1;
      const n = line.plays;
      const confidence = clamp(n / 8, 0, 1);
      const success = line.success / n;
      const yards = clamp((line.yards / n + 2) / 10, 0, 1);
      const tdRate = line.tds / n;
      const turnoverRate = line.turnovers / n;
      // Results pick the better answer more often as the coordinator gathers
      // evidence, while a nonzero base weight preserves variety and avoids a
      // solved, single-play CPU offense.
      const value = success * 0.52 + yards * 0.25 + tdRate * 0.35 - turnoverRate * 0.45;
      return Math.max(0.2, 1 + experience * confidence * value * 2.1);
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function cpuChooseOff() {
    if (G.down === 4 && !G.patMode) {
      const fgDist = 100 - G.losYd + 17;
      // A CPU that is chasing the score has to treat fourth down differently.
      // The old rule took every makeable field goal (or punted) regardless of
      // game state, so it could casually surrender a late possession while
      // down multiple scores.
      const cpuSide = G.drive;
      const deficit = Math.max(0, G.score[other(cpuSide)] - G.score[cpuSide]);
      const trailing = deficit > 0;
      const late = G.quarter >= 4;
      const urgent = late && G.clock <= 120;
      const short = G.toGain <= 3;
      let goForP = 0;
      if (trailing && late) {
        if (deficit >= 8) goForP = urgent ? 0.94 : 0.52;
        else if (deficit >= 4) goForP = urgent ? 0.72 : 0.34;
        else goForP = G.clock <= 75 ? 0.60 : 0.20;
        if (short) goForP += 0.10;
        if (G.losYd >= 50) goForP += 0.08;
        if (G.losYd <= 25 && !urgent) goForP -= 0.12;
      } else if (trailing && G.quarter >= 3 && deficit >= 8 && short && G.losYd >= 45) {
        // Start applying pressure before the final quarter when a possession
        // is already not enough to catch up.
        goForP = 0.28;
      }
      if (goForP > 0 && Math.random() < clamp(goForP, 0, 0.97)) {
        G.cpuFourthDecision = "GO";
      } else {
        G.cpuFourthDecision = fgDist <= 50 ? "FG" : "PUNT";
        if (fgDist <= 50) { enterKick("FG"); return null; }
        if (G.losYd < 58 || G.toGain > 2) { enterKick("PUNT"); return null; }
      }
    }
    // Pick from the situationally-relevant set with a little noise — and
    // never run the exact same call back-to-back.  The old coordinator ran
    // on 42% of ordinary downs and repeatedly chose interior runs, which made
    // the CPU easy to sit on.  It now treats the run as a constraint/clock
    // tool and favors the perimeter unless the situation calls for power.
    let pool = relevantOffense(5);
    if (pool.length > 1 && G.cpuLastOff) pool = pool.filter((p) => p.name !== G.cpuLastOff);
    const short = G.toGain <= 3;
    const goalLine = G.losYd + G.toGain >= 100 || G.losYd >= 96;
    let runs = pool.filter((p) => p.type === "run"), passes = pool.filter((p) => p.type === "pass");
    if (!runs.length) runs = RUN_PLAYS.slice();
    let choice;
    const runRate = goalLine ? 0.52 : (short ? 0.46 : (G.toGain >= 8 ? 0.18 : 0.28));
    if (Math.random() < runRate && runs.length) {
      const conventional = runs.filter((p) => !p.hbPass && !p.sweepPass);
      const candidates = conventional.length ? conventional : runs;
      const outside = candidates.filter((p) => p.lane && p.lane !== 0);
      const middle = candidates.filter((p) => !p.lane || p.lane === 0);
      // Sweeps give the CPU a viable second answer; short yardage and the
      // goal line still lean into the interior by design.
      let lanePool = (!short && !goalLine && outside.length && Math.random() < 0.72) ? outside : (middle.length ? middle : candidates);
      if (lanePool.length > 1 && G.cpuLastRunLane != null) {
        const varied = lanePool.filter((p) => p.lane !== G.cpuLastRunLane);
        if (varied.length) lanePool = varied;
      }
      choice = learnedCpuOffensePick(lanePool);
      G.cpuLastRunLane = choice.lane || 0;
    }
    else choice = learnedCpuOffensePick(passes.length ? passes : pool);
    G.cpuLastOff = choice && choice.name;
    return choice;
  }
  function cpuChooseDef() {
    const pool = relevantDefense(4);
    // Long-term scouting survives game-to-game. The coordinator remembers
    // player play style by situation, then chooses a counter more often as
    // the sample and game experience grow.
    const book = persistentScout(scoutSituation());
    // The CPU never sees the selected card.  It does remember that the QB
    // keeps sneaking in the same short-yardage spots, then comes in with a
    // prepared front.  That makes a fake-pass/sneak a counterable tendency,
    // not an automatic first down or a psychic defensive call.
    const sneakRate = (book.sneak || 0) / Math.max(1, book.plays);
    if (G.toGain <= 3 && book.sneak >= 2 && sneakRate >= 0.18 &&
      Math.random() < clamp(0.34 + cpuExperience() * 0.34 + (book.sneak - 2) * 0.06, 0.34, 0.82)) {
      const antiSneak = DEF_PLAYS.filter((d) => d.tags.includes("run") || d.tags.includes("goalline") || d.spy);
      if (antiSneak.length) return antiSneak[(Math.random() * antiSneak.length) | 0];
    }
    if (book.plays >= 6) {
      const passRate = book.pass / book.plays;
      const deepRate = Math.max(book.deep / Math.max(1, book.pass), book.risky / Math.max(1, book.pass));
      const want = passRate >= 0.56
        ? (deepRate >= 0.32 ? ["deep", "long", "prevent"] : ["blitz", "short", "deep"])
        : passRate <= 0.34 ? ["run", "short", "goalline"] : null;
      const learnedCounterP = clamp(0.22 + cpuExperience() * 0.24 + (book.plays - 6) * 0.015, 0.22, 0.76);
      if (want && Math.random() < learnedCounterP) {
        const counter = DEF_PLAYS.filter((d) => d.tags.some((tg) => want.includes(tg)));
        if (counter.length) return counter[(Math.random() * counter.length) | 0];
      }
    }
    // the CPU coordinator scouts YOUR tendencies: a pass-happy stretch pulls
    // coverage/blitz calls, ground-and-pound pulls run-stuffers
    const recent = G.recentOff || [];
    if (recent.length >= 3) {
      const rate = recent.filter((t) => t === "pass").length / recent.length;
      const want = rate > 0.7 ? ["deep", "long", "blitz"] : rate < 0.3 ? ["run", "short", "goalline"] : null;
      // The short-term read reacts inside the current drive; the persistent
      // book above means the CPU also arrives prepared next game.
      const learnedCounterP = clamp(0.45 + (recent.length - 2) * 0.12, 0.45, 0.81);
      if (want && Math.random() < learnedCounterP) {
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
  // STAMINA (Madden-style ranges): how long a dino holds top speed before the
  // legs go. Backs/corners run all day; linemen live in 4-second bursts.
  // Derived per player from the name seed so every dino is a little different.
  const STAM_BASE = {
    QB: 78, RB: 88, FB: 82, WR: 87, WR1: 87, WR2: 87, WR3: 87, TE: 84,
    OL: 76, EDGE: 79, DL: 78, LB: 85, CB: 88, S: 87, K: 72,
  };
  // Collision bodies describe the part of each dino that actually occupies
  // turf (torso / hips), not the full sprite rectangle including a tail,
  // horns, or outstretched arms.  This keeps a line of trikes shoulder-to-
  // shoulder without letting bodies clip through one another.  Mass is used
  // only to split positional correction: a triceratops wins more of a crowd
  // than a raptor, but no player is immovable.
  const BODY_PROFILES = {
    // These radii intentionally clear the painted 32px silhouettes, not just
    // a tiny centre dot. Normal football traffic always leaves a visible seam.
    // A completed tackle is the one deliberate exception: its paired bodies
    // may share a brief shoulder-wrap window before the carrier falls away.
    troodon: { r: 13, mass: 0.88 }, carno: { r: 15, mass: 1.18 },
    pachy: { r: 15, mass: 1.22 }, veloci: { r: 13, mass: 0.82 },
    deino: { r: 14, mass: 1.08 }, trike: { r: 16, mass: 1.42 },
    stego: { r: 16, mass: 1.38 }, allo: { r: 15, mass: 1.16 },
    spino: { r: 15, mass: 1.20 }, deinony: { r: 13, mass: 0.86 },
    quetz: { r: 14, mass: 0.94 }, trex: { r: 20, mass: 1.75 },
    ptero: { r: 10, mass: 0.65 }, default: { r: 14, mass: 1.0 },
  };
  let nextBodyId = 1;
  const stamOf = (name, role) =>
    clamp((STAM_BASE[role] || 82) + (seedHash((name || "dino") + "stam") % 21) - 10, 60, 99);
  // kickers: RANGE comes from the leg; ACCURACY is its own talent
  const kickAccOf = (name) => clamp(68 + (seedHash((name || "ptero") + "kacc") % 30), 65, 99);
  function mkEnt(team, species, name, role, sp, extra) {
    const body = BODY_PROFILES[species] || BODY_PROFILES.default;
    const e = Object.assign({
      team, species, name: name || "", role: role || "", spd: spdPx(sp || 78),
      x: 0, y: 0, vx: 0, vy: 0, dir: team === "off" ? 1 : -1, animT: Math.random(),
      bodyId: nextBodyId++, bodyR: body.r, bodyMass: body.mass,
      state: "idle", path: null, pathI: 0, endMode: "stop",
      engaged: null, engageT: 0, staggerT: 0, jukeT: 0, jukeCd: 0, diveT: 0, proneT: 0,
      hands: 75, agi: 75, tkl: 75, acc: 75, arm: 75, controlled: false, cover: null, zone: null,
      tackleCd: 0, soarT: 0, soarCd: 0, soarCharge: 0.35, punching: 0, punchCd: 0, spinCd: 0, throwT: 0, jumpT: 0,
      stiffT: 0, stiffCd: 0, stamNow: 1, coldT: 0,
      // Visual action state is deliberately separate from gameplay timers.
      // It shifts the original compact species sprite for a dive, high-point
      // catch, stiff-arm, tackle aftermath, or celebration—never a generic
      // replacement body that could break the field's visual language.
      pose: "", poseT: 0, poseDur: 0, impactT: 0, impactLead: false, catchDiveT: 0,
      // A successful tackle owns one intentionally overlapping pair for a
      // fraction of a second. These fields never participate in ordinary
      // player movement or collision; they only exempt that named contact
      // from the separation solver while the shoulder wrap is on screen.
      tackleImpactT: 0, tackleImpactWith: 0, tackleImpactRole: "", tackleFallDir: 0, tackleFallPending: false,
      // unique athletic profile: jump derives from the name so every dino differs
      jump: 55 + (seedHash(name || species) % 30),
    }, extra || {});
    if (!e.stam) e.stam = stamOf(e.name, e.role);
    return e;
  }
  // An action pose is cosmetic state layered on top of the original compact
  // species sprite.  Gameplay never depends on this timer: a dropped frame
  // cannot change a catch, tackle, or possession outcome.
  function playPose(e, pose, duration) {
    if (!e || !pose) return;
    e.pose = pose;
    e.poseDur = Math.max(0.08, duration || 0.48);
    e.poseT = e.poseDur;
  }
  function continuePose(e, pose, remaining) {
    // Keep an anticipatory catch in the frame it has earned. Restarting it at
    // possession would make hands fall back to a load after the ball arrived.
    if (e && e.pose === pose && e.poseT > 0) {
      const p = poseState(e).progress;
      e.poseDur = Math.max(0.08, remaining / Math.max(0.06, 1 - p));
      e.poseT = Math.max(0.08, remaining);
      return;
    }
    playPose(e, pose, remaining);
  }

  // ---------------------------------------------------------------- tackle contact beat
  // Normal dinos must never visually overlap. A real tackle is different:
  // for one short, named shoulder-wrap window the driver puts body mass into
  // the carrier, then the carrier is moved backward out of the contact. The
  // pair identity prevents a nearby third dino from ever inheriting this
  // exception by accident.
  function isIntentionalTacklePair(a, b) {
    if (!a || !b || !(a.tackleImpactT > 0) || !(b.tackleImpactT > 0)) return false;
    if (a.tackleImpactWith !== b.bodyId || b.tackleImpactWith !== a.bodyId) return false;
    const driver = a.tackleImpactRole === "driver" ? a : (b.tackleImpactRole === "driver" ? b : null);
    const carrier = a.tackleImpactRole === "carrier" ? a : (b.tackleImpactRole === "carrier" ? b : null);
    if (!driver || !carrier) return false;
    // It is not a permanent collision exemption after the action cels end.
    return driver.poseT > 0 && carrier.poseT > 0 &&
      ["dive", "tackle"].includes(driver.pose) && ["tackled", "prone"].includes(carrier.pose);
  }
  function tickTackleImpact(e, dt) {
    if (!e || !(e.tackleImpactT > 0)) return;
    e.tackleImpactT = Math.max(0, e.tackleImpactT - dt);
    if (!e.tackleImpactT) {
      e.tackleImpactWith = 0; e.tackleImpactRole = ""; e.tackleFallDir = 0;
    }
  }
  function beginTackleImpact(tackler, carrier, duration, options) {
    if (!tackler || !carrier) return null;
    const opt = options || {};
    const dur = Math.max(0.08, duration || 0.48);
    let dx = carrier.x - tackler.x, dy = carrier.y - tackler.y;
    let d = Math.hypot(dx, dy);
    if (d < 0.001) { dx = tackler.dir || 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    const fallDir = Math.abs(nx) > 0.18 ? (nx >= 0 ? 1 : -1) : (carrier.dir || tackler.dir || 1);
    tackler.tackleImpactT = dur; carrier.tackleImpactT = dur;
    tackler.tackleImpactWith = carrier.bodyId; carrier.tackleImpactWith = tackler.bodyId;
    tackler.tackleImpactRole = "driver"; carrier.tackleImpactRole = "carrier";
    carrier.tackleFallDir = fallDir; carrier.tackleFallPending = true;

    // The live play has just had its ordinary bodies separated by physics.
    // Move only this pair into a clearly readable shoulder overlap; the ball
    // carrier is displaced *away* from the driver rather than folded in place.
    if (opt.reposition !== false) {
      const impactGap = opt.impactGap == null
        ? Math.max(11, Math.round(bodyContactRange(tackler, carrier) * 0.48))
        : opt.impactGap;
      const knockback = opt.knockback == null ? Math.max(6, Math.round(impactGap * 0.55)) : opt.knockback;
      carrier.x += nx * knockback; carrier.y += ny * knockback;
      tackler.x = carrier.x - nx * impactGap; tackler.y = carrier.y - ny * impactGap;
      if (Math.abs(nx) > 0.18) tackler.dir = fallDir;
    }
    return { nx, ny, fallDir };
  }

  // ------------------------------------------------------ visual QA scenes
  // These four tiny, deterministic set pieces are intentionally available
  // only through the `?qa=1` local review URL. They use the production field,
  // player sprites, ball renderer, action motion, and contact solver—so a GIF is
  // evidence of the actual game path, not a separate mockup.  Each scene has
  // an approach/read before its football moment, then holds its aftermath long
  // enough for frame-by-frame inspection.
  function qaSetPose(e, pose, duration) {
    playPose(e, pose, duration);
    e.poseDur = duration;
  }
  // Export a review frame through a DOM attribute only when a reviewer asks
  // for it in `?qa=1`.  The browser harness reads the exact canvas PNG from
  // this attribute, so exports cannot accidentally include browser chrome or
  // JPEG-compress the single-pixel artwork.
  function qaExportFrame() {
    if (!G.qaMode) return;
    render();
    cv.dataset.qaState = G.state;
    cv.dataset.qaScene = G.qaScene ? G.qaScene.kind : "";
    cv.dataset.qaTime = G.qaScene ? G.qaScene.t.toFixed(3) : "0.000";
    cv.dataset.qaPng = cv.toDataURL("image/png");
  }
  function qaStepCosmetics(dt) {
    for (const e of G.players || []) {
      e.animT += dt * 7;
      if (e.jumpT > 0) e.jumpT = Math.max(0, e.jumpT - dt);
      if (e.catchDiveT > 0) e.catchDiveT = Math.max(0, e.catchDiveT - dt);
      if (e.impactT > 0) e.impactT = Math.max(0, e.impactT - dt);
      tickTackleImpact(e, dt);
      if (e.poseT > 0) {
        e.poseT = Math.max(0, e.poseT - dt);
        if (!e.poseT) e.pose = "";
      }
      if (e.fdCeleb > 0) e.fdCeleb = Math.max(0, e.fdCeleb - dt);
    }
  }
  function stageHighlight(kind) {
    // A fixed daytime KC/PIT presentation prevents weather, roster loading,
    // or camera randomness from hiding an artifact in the visual gate.
    G.mode = "qa"; G.practice = false; G.humanB = false;
    G.my = "KC"; G.opp = "PIT"; G.homeAbbr = "KC";
    G.sheets.A = DinoSprites.buildTeamSprites(TEAMS.KC[1], TEAMS.KC[2]);
    G.sheets.B = DinoSprites.buildTeamSprites(TEAMS.PIT[1], TEAMS.PIT[2]);
    G.stadium = makeStadium("KC"); G.stadium.dome = false; G.stadium.time = "day";
    G.weather = { type: "CLEAR", wind: { x: 0, y: 0 }, catchMod: 0, speedMod: 1, fumbleMod: 0, kickMod: 0, temp: 72, month: "SEP" };
    buildCrowd(TEAMS.KC[1]);
    G.score = { A: 17, B: 14 }; G.quarter = 4; G.clock = 82;
    G.rampage = { A: 52, B: 40 }; G.ramp = null; G.rampUsed = { A: 0, B: 0 };
    // Keep the QA tackle/catch lane free of the blue/yellow sticks. In real
    // play those lines can cross any collision, but a review GIF must not let
    // a first-down stripe hide the tackler's shoulder at the exact contact.
    G.drive = "A"; G.losYd = 36; G.down = 2; G.toGain = 8;
    G.curPlay = OFF_PLAYS.find((p) => p.name === "SLANTS") || OFF_PLAYS[1];
    G.defCall = DEF_PLAYS[0]; G.parts = []; G.ticker = null; G.banner = null;
    G.fdFlash = 0; G.carrier = null; G.controlled = null; G.playT = 0;
    buildPlayers();

    const qb = G.players.find((e) => e.team === "off" && e.role === "QB");
    const rb = G.players.find((e) => e.team === "off" && e.role === "RB");
    const wr = G.players.find((e) => e.team === "off" && e.role === "WR1") ||
      G.players.find((e) => e.team === "off" && e.routeEligible);
    const db = G.players.find((e) => e.team === "def" && e.species === "deinony") ||
      G.players.find((e) => e.team === "def");
    const safety = G.players.find((e) => e.team === "def" && e.species === "quetz") || db;
    // Use a midpoint between major yard stripes so the QA contact is not
    // visually bisected by a white field line in its most important frame.
    const baseX = xAtYd(57), baseY = MID;
    const use = (...actors) => {
      G.players = actors.filter(Boolean);
      for (const e of G.players) {
        e.vx = e.vy = 0; e.state = "idle"; e.path = null; e.pathI = 0;
        e.pose = ""; e.poseT = 0; e.poseDur = 0; e.jumpT = 0; e.proneT = 0;
        e.impactT = 0; e.impactLead = false; e.catchDiveT = 0; e.fdCeleb = 0;
        e.tackleImpactT = 0; e.tackleImpactWith = 0; e.tackleImpactRole = "";
        e.tackleFallDir = 0; e.tackleFallPending = false;
        e.soarT = 0; e.soarCd = 0; e.soarCharge = 0.35; e.controlled = false;
      }
    };
    const hold = (e) => {
      G.carrier = e;
      G.ball = { mode: "held", holder: e, x: e.x + e.dir * 8, y: e.y, z: 12 };
    };

    let scene;
    if (kind === "tackle") {
      use(db, rb);
      const gap = bodyContactRange(db, rb) + 1;
      db.x = baseX - 53; db.y = baseY + 2; db.dir = 1;
      rb.x = baseX + 53; rb.y = baseY; rb.dir = -1;
      hold(rb);
      scene = { kind, t: 0, dur: 1.58, baseX, baseY, tackler: db, carrier: rb, gap,
        // A real wrap intentionally brings the two painted bodies together;
        // this is much closer than the ordinary torso gap but only lasts long
        // enough to read as one dino driving the other backwards.
        impactGap: Math.max(11, Math.round(gap * 0.48)),
        startGap: 106, dive: false, wrap: false, caption: "TACKLE · APPROACH → DIVE → SHOULDER DRIVE → BACKWARD FALL" };
    } else if (kind === "firstdown") {
      use(rb, db);
      G.losYd = 50; G.toGain = 10; G.down = 2;
      const firstDownX = xAtYd(60);
      rb.x = firstDownX - 44; rb.y = baseY; rb.dir = 1;
      db.x = rb.x - 92; db.y = baseY + 54; db.dir = 1;
      hold(rb);
      scene = { kind, t: 0, dur: 1.56, baseX, baseY, runner: rb, defender: db, crossed: false,
        firstDownX, finishX: firstDownX + 36, celebrated: false,
        caption: "FIRST DOWN · CROSS → PLANT → POINT" };
    } else if (kind === "catch") {
      use(qb, wr, db);
      qb.x = baseX - 172; qb.y = baseY + 46; qb.dir = 1;
      wr.x = baseX - 28; wr.y = baseY; wr.dir = 1;
      db.x = baseX + 62; db.y = baseY - 48; db.dir = -1;
      G.carrier = null;
      G.ball = { mode: "held", holder: qb, x: qb.x + 8, y: qb.y, z: 12 };
      qb.throwT = 0.32; qaSetPose(qb, "throw", 0.32);
      scene = { kind, t: 0, dur: 1.58, baseX, baseY, qb, receiver: wr, defender: db, caught: false,
        releaseAt: 0.16, flight: 0.72, contactQ: 0.78, target: { x: baseX + 10, y: baseY },
        caption: "HIGH-POINT CATCH · LOAD → LEAP → CLAWS" };
    } else { // interception
      use(qb, wr, safety);
      qb.x = baseX - 172; qb.y = baseY + 46; qb.dir = 1;
      safety.x = baseX + 46; safety.y = baseY; safety.dir = -1;
      wr.x = baseX - 24; wr.y = baseY + 38; wr.dir = 1;
      G.carrier = null;
      G.ball = { mode: "held", holder: qb, x: qb.x + 8, y: qb.y, z: 12 };
      qb.throwT = 0.32; qaSetPose(qb, "throw", 0.32);
      scene = { kind: "interception", t: 0, dur: 1.58, baseX, baseY, qb, receiver: wr, defender: safety, picked: false,
        releaseAt: 0.16, flight: 0.72, contactQ: 0.76, target: { x: baseX + 10, y: baseY },
        safetyGrounded: true, caption: "INTERCEPTION · READ → JUMP → TURN" };
    }
    G.qaScene = scene; G.state = "qa"; G.phase = kind === "tackle" || kind === "firstdown" ? "carry" : "air";
    G.camX = clamp(baseX - W * 0.45, 0, FIELD_LEN - W);
    resolvePlayerContacts();
    return scene;
  }
  function updateHighlight(dt) {
    const s = G.qaScene;
    if (!s) { G.state = "title"; return; }
    const hold = (e) => {
      G.carrier = e;
      G.ball = { mode: "held", holder: e, x: e.x + e.dir * 8, y: e.y, z: 12 };
    };
    const lerp = (a, b, q) => a + (b - a) * clamp(q, 0, 1);
    s.t = Math.min(s.dur, s.t + dt);
    qaStepCosmetics(dt);
    if (s.kind === "tackle") {
      const clearGap = s.gap + 4;
      // Let the launch read for nearly half a second. The impact then closes
      // into a genuine, transient body-on-body wrap before the carrier is
      // knocked backward and falls out of it. Keeping those three beats
      // separate prevents a tackle from reading as two sprites merely
      // squeezing together at a permanent physics seam.
      const diveStart = 0.10, wrapStart = 0.46;
      if (s.t < wrapStart) {
        const q = s.t / wrapStart;
        const d = lerp(s.startGap, clearGap, q);
        s.tackler.x = s.baseX - d / 2; s.carrier.x = s.baseX + d / 2;
        s.tackler.y = s.baseY + 2; s.carrier.y = s.baseY;
        if (!s.dive && s.t >= diveStart) {
          s.dive = true; s.diveAt = s.t; s.phase = "gather";
          // The launch clears the turf briefly, peaks during the head-first
          // lunge, and is back down before the shoulder wrap. This is visual
          // motion only—the collision solver still owns the body gap.
          s.tackler.jumpT = 0.34;
          qaSetPose(s.tackler, "dive", 0.38);
        }
      } else {
        const closeQ = clamp((s.t - wrapStart) / 0.12, 0, 1);
        const driveQ = clamp((s.t - (wrapStart + 0.08)) / 0.46, 0, 1);
        // Keep the shoulder engaged through the entire backwards rotation.
        // A tackle that releases before the carrier hits the turf reads as a
        // pass-by; a real defender stays connected through the fall.
        const releaseQ = clamp((s.t - 1.48) / 0.22, 0, 1);
        // First close to a shoulder/body overlap. The last few review frames
        // only ease that compression slightly, rather than reopening a field
        // coloured gap before the backward-fall silhouette has landed.
        let d = lerp(clearGap, s.impactGap, closeQ);
        if (releaseQ > 0) d = lerp(s.impactGap, Math.min(clearGap, s.impactGap + 4), releaseQ);
        const knockback = 18 * (driveQ * driveQ * (3 - 2 * driveQ));
        s.carrier.x = s.baseX + d / 2 + knockback;
        s.tackler.x = s.carrier.x - d;
        // Keep the driver one pixel nearer camera, but align its shoulder to
        // the carrier's chest. The older low offset landed at the thighs and
        // looked like two dinos slipping past each other rather than a wrap.
        s.carrier.y = s.baseY + Math.round(2 * driveQ);
        // As the carrier rotates down, the tackler drops its shoulder and
        // torso with the hit. That keeps the body-led wrap connected to the
        // carrier's ribs instead of leaving a helmet-to-helmet-looking tap.
        const fallSink = clamp((s.t - 1.02) / 0.22, 0, 1);
        s.tackler.y = s.carrier.y + 1 + Math.round(4 * fallSink);
        if (!s.wrap) {
          s.wrap = true; s.wrapAt = s.t; s.phase = "wrap";
          // This narrowly scoped contact exception is the only time the
          // exact mask/body solvers allow visual overlap. All other players
          // retain their normal physical separation.
          beginTackleImpact(s.tackler, s.carrier, 1.18, { reposition: false, impactGap: s.impactGap });
          qaSetPose(s.tackler, "tackle", 1.24);
          qaSetPose(s.carrier, "tackled", 1.18);
          // The overlapping shoulder/torso silhouettes communicate contact
          // directly; no detached burst is needed to fake the collision.
          s.carrier.impactLead = false; s.carrier.impactT = 0;
        }
        if (s.t >= 0.72) s.phase = "drive";
        if (s.t >= 1.02) s.phase = "backward-fall";
        // Finish on the compact backward-fall cel, which keeps the football
        // tucked to the torso and preserves the dino's full body volume.
        if (!s.fallen && s.t >= 1.08) {
          s.fallen = true;
          s.carrier.tackleFallPending = false;
          // Hold the authored fall past the end of the review clip. Letting
          // this timer expire on the final GIF frame snapped the carrier back
          // upright and erased the payoff of an otherwise correct tackle.
          qaSetPose(s.carrier, "prone", Math.max(0.72, s.dur - s.t + 0.22));
        }
      }
      hold(s.carrier);
    } else if (s.kind === "firstdown") {
      if (s.t < 0.26) s.runner.x = lerp(s.firstDownX - 44, s.firstDownX, s.t / 0.26);
      else if (s.t < 0.42) s.runner.x = lerp(s.firstDownX, s.finishX, (s.t - 0.26) / 0.16);
      else s.runner.x = s.finishX;
      s.defender.x = s.runner.x - 86; s.defender.y = s.baseY + 54;
      if (!s.crossed && s.t >= 0.26) {
        s.crossed = true;
        s.crossedAt = s.t; G.fdFlash = 0.66;
      }
      if (!s.celebrated && s.t >= 0.42) {
        // One small plant/hop, then a downfield point with the ball tucked in
        // the opposite arm. The result text is deliberately only a brief tag.
        s.celebrated = true; s.celebratedAt = s.t; s.phase = "point";
        s.runner.jumpT = 0.4; s.runner.fdCeleb = 0.62;
        qaSetPose(s.runner, "celebrate", 0.92);
      }
      hold(s.runner);
    } else {
      const landing = s.kind === "catch" ? s.receiver : s.defender;
      if (s.t < s.releaseAt) {
        // The throw begins in the quarterback's actual claws; the football
        // is not rendered in midair before his release cel has moved.
        G.ball = { mode: "held", holder: s.qb, x: s.qb.x + s.qb.dir * 8, y: s.qb.y, z: 12 };
      } else if (!s.caught && !s.picked) {
        if (!s.released) {
          s.released = true;
          G.ball = {
            mode: "air", kind: "lob",
            from: { x: s.qb.x + s.qb.dir * 10, y: s.qb.y - 10 },
            to: { x: s.target.x, y: s.target.y },
            x: s.qb.x + s.qb.dir * 10, y: s.qb.y - 10, z: 12, holder: null,
          };
        }
        const q = clamp((s.t - s.releaseAt) / s.flight, 0, 1);
        const b = G.ball;
        b.x = lerp(b.from.x, b.to.x, q);
        b.y = lerp(b.from.y, b.to.y, q);
        // At the contact beat the ball is at the jumper's claws, not on the
        // turf under a sprite. Its arc is kept deliberately modest and clear.
        b.z = 12 + 42 * Math.sin(Math.PI * q);
        if (s.kind === "catch") {
          if (s.receiverStartX == null) { s.receiverStartX = s.receiver.x; s.defenderStartX = s.defender.x; }
          s.receiver.x = lerp(s.receiverStartX, s.target.x, q / 0.62);
          s.defender.x = lerp(s.defenderStartX, s.target.x + 28, q / 0.58);
          s.defender.y = lerp(s.baseY - 48, s.baseY - 28, q / 0.58);
          // A compact three-cel action needs a short load so the middle cel
          // is the actual high point when the football reaches the claws.
          // It is continued at possession below rather than restarted there.
          if (!s.loaded && q >= 0.48) { s.loaded = true; s.loadedAt = s.t; s.phase = "load"; qaSetPose(s.receiver, "catchHigh", 0.54); }
          if (!s.leapt && q >= 0.56) { s.leapt = true; s.leaptAt = s.t; s.phase = "leap"; s.receiver.jumpT = 0.4; }
          if (!s.diveAttempt && q >= 0.58) { s.diveAttempt = true; qaSetPose(s.defender, "dive", 0.40); }
        } else {
          if (s.safetyStartX == null) { s.safetyStartX = s.defender.x; s.receiverStartX = s.receiver.x; }
          // The safety reads and walks into the window on foot. `soarT` is
          // intentionally pinned at zero in this set piece.
          s.defender.soarT = 0;
          s.defender.x = lerp(s.safetyStartX, s.target.x + 2, q / 0.58);
          s.receiver.x = lerp(s.receiverStartX, s.target.x - 18, q / 0.72);
          if (!s.loaded && q >= 0.46) { s.loaded = true; s.loadedAt = s.t; s.phase = "read"; qaSetPose(s.defender, "catchHigh", 0.54); }
          if (!s.leapt && q >= 0.55) { s.leapt = true; s.leaptAt = s.t; s.phase = "jump"; s.defender.jumpT = 0.4; }
          if (!s.contested && q >= 0.54) { s.contested = true; qaSetPose(s.receiver, "dive", 0.36); }
        }
        if (q >= s.contactQ) {
          s.contactAt = s.t;
          // Do not snap back to the loading frame on possession.  Retiming
          // the same pose lets the apex resolve to a tucked-ball landing.
          continuePose(landing, "catchHigh", 0.78);
          if (s.kind === "catch") { s.caught = true; s.phase = "secure"; hold(s.receiver); }
          else { s.picked = true; s.phase = "secure"; hold(s.defender); }
        }
      } else {
        // A visible landing/pivot comes after possession; it never happens on
        // the same frame as the ball contact.
        if (s.kind === "interception" && s.t > s.releaseAt + s.flight * 0.92) landing.dir = 1;
        if (s.t > s.releaseAt + s.flight * 0.94) landing.x += (s.kind === "catch" ? 14 : 12) * dt;
      }
    }
    G.fdFlash = Math.max(0, (G.fdFlash || 0) - dt);
    resolvePlayerContacts();
    // Keep the review camera locked on the action lane. A real game camera
    // tracks the ball, but a QA GIF must make a 32px tackle or high-point
    // legible from frame one instead of panning the moment out of its crop.
    G.camX = clamp((s.baseX || xAtYd(60)) - W * 0.45, 0, FIELD_LEN - W);
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
        // BLOCKING is the O-lineman's stat (his "catching") — real Madden
        // pass/run-block when we have it, mass+technique otherwise
        { tkl: op.tkl || 80, str: op.str || 75, jump: op.jump || 60, stam: op.stam,
          blk: op.blk || clamp(Math.round((op.str || 75) * 0.65 + (op.tkl || 80) * 0.35), 60, 99) });
      e.x = losX - 14; e.y = MID - 64 + i * 32; e.state = "block";
      e.lineSlot = i; e.lineOffset = -64 + i * 32;
      P.push(e);
    }
    // QB: troodon
    const eqb = mkEnt("off", "troodon", qb.name, "QB", qb.spd, { acc: qb.acc, arm: qb.arm, agi: qb.agi, hands: 70, str: qb.str || 72, jump: qb.jump || 65, stam: qb.stam, stiff: qb.stiff });
    eqb.x = losX - 46; eqb.y = MID; P.push(eqb);
    // RB: carnotaurus
    const erb = mkEnt("off", "carno", rb.name, "RB", rb.spd, { hands: rb.hands, agi: rb.agi, str: rb.str || 78, jump: rb.jump || 70, stam: rb.stam, stiff: rb.stiff });
    erb.x = losX - 56; erb.y = MID + 14; P.push(erb);
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
      const e = mkEnt("off", slot === "TE" ? "deino" : "veloci", p.name, slot, p.spd, { hands: p.hands, agi: p.agi, str: p.str || 68, jump: p.jump || 72, stam: p.stam, stiff: p.stiff });
      e.x = x; e.y = y; P.push(e);
    }

    // ---- defense
    const dline = defR.defense.filter((d) => ["DE", "DT", "DL", "NT"].includes(d.pos));
    const edges = dline.filter((d) => d.pos === "DE");
    const tackles = dline.filter((d) => d.pos !== "DE");
    const lb = defR.defense.filter((d) => ["LB", "ILB", "OLB", "MLB"].includes(d.pos));
    const db = defR.defense.filter((d) => ["CB", "DB", "S", "FS", "SAF"].includes(d.pos));
    // every starter is a REAL, NAMED player: if a position group runs dry
    // (say, a 4-DB roster in a nickel front), the next man up comes off the
    // actual bench instead of materializing as a nameless "Dino"
    const usedDefs = new Set();
    const benchDef = () => defR.defense.find((p2) => !usedDefs.has(p2));
    const pick = (arr, i, alt, fbName) => {
      let c = arr[i] && !usedDefs.has(arr[i]) ? arr[i] : null;
      if (!c && alt && !usedDefs.has(alt)) c = alt;
      if (!c) c = benchDef();
      if (!c) c = { name: fbName, spd: 78, tkl: 78 };
      usedDefs.add(c);
      return c;
    };
    const dget = (arr, i, fb) => pick(arr, i, null, fb);
    const lineSpec = [
      [pick(edges, 0, dline[0], "Edge Dino"), "allo", "EDGE"],
      [pick(tackles, 0, dline[2], "Nose Dino"), "stego", "DL"],
      [pick(tackles, 1, dline[3], "Tackle Dino"), "stego", "DL"],
      [pick(edges, 1, dline[1], "Edge Dino"), "allo", "EDGE"],
    ];
    const lineY = [MID - 60, MID - 20, MID + 20, MID + 60];
    for (let i = 0; i < 4; i++) {
      const [d, species, role] = lineSpec[i];
      const e = mkEnt("def", species, d.name, role, d.spd, { tkl: d.tkl, state: "rush", str: d.str || 82, jump: d.jump || 65, stam: d.stam });
      e.x = losX + 16; e.y = lineY[i]; e.state = "rush";
      // edge rushers each bring a signature pass-rush technique (speed / spin / bull)
      if (role === "EDGE") e.rushTech = (e.spd > spdPx(84)) ? "speed" : ((e.str || 82) >= 84 ? "bull" : "spin");
      P.push(e);
    }
    // 2 LB: spinosaurus
    for (let i = 0; i < 2; i++) {
      const d = dget(lb, i, "Backer");
      const e = mkEnt("def", "spino", d.name, "LB", d.spd, { tkl: d.tkl, str: d.str || 78, jump: d.jump || 70, stam: d.stam });
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
      const e = mkEnt("def", species, d.name, role, d.spd, { tkl: d.tkl, str: d.str || 66, jump: d.jump || 80, hands: d.hands || 74, stam: d.stam });
      e.x = losX + depth; e.y = y0; e.coverSlot = slot;
      e.state = "cover"; P.push(e);
    }

    // defensive call adjustments
    const call = G.defCall || DEF_PLAYS[0];
    const lbs = P.filter((e) => e.role === "LB");
    const sneakBook = !G.humanB && G.drive === "A" ? persistentScout(scoutSituation()) : null;
    const sneakAlert = !!(sneakBook && G.toGain <= 3 && sneakBook.sneak >= 2 &&
      sneakBook.sneak / Math.max(1, sneakBook.plays) >= 0.18);
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
    // A prepared short-yardage front is earned by film, not by knowing the
    // offense's card.  One backer shadows the QB while his partner plugs the
    // A-gap; a real pass still has its normal coverage answers.
    if (sneakAlert && !G.patMode) {
      const spy = lbs[0], plug = lbs[1];
      if (spy) { spy.state = "spy"; spy.x = losX + 30; spy.y = MID - 18; spy.runStuff = true; }
      if (plug) { plug.state = "read"; plug.x = losX + 36; plug.y = MID + 18; plug.runStuff = true; }
      P.filter((e) => e.role === "EDGE").forEach((e) => { e.contain = true; });
      G.sneakAlert = true;
    } else G.sneakAlert = false;
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
      if (e.passive === "burner") e.spd *= 1.08;
      if (e.passive === "cannon") { e.arm = Math.min(99, e.arm + 12); e.acc = Math.min(99, e.acc + 4); }
      if (e.passive === "escape") e.agi = Math.min(99, e.agi + 8);
      if (e.passive === "tackle") e.tkl = Math.min(99, e.tkl + 6);
      if (e.passive === "ballhawk") { e.spd *= 1.03; e.tkl = Math.min(99, e.tkl + 4); e.jump = Math.max(e.jump, 92); }
      if (e.passive === "redzone") { e.hands = Math.min(99, e.hands + 5); e.jump = Math.max(e.jump, 90); }
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

    // CONDITION carry-over (season/career): tired legs from last week start
    // the game slower and with a partly-drained stamina tank
    if (G.szn && G.szn.condition) {
      const mySide = G.drive === "A" ? "off" : "def";
      for (const e of P) {
        if (e.team !== mySide) continue;
        const cond = G.szn.condition[e.name];
        if (cond == null || cond >= 100) continue;
        e.spd *= 0.85 + 0.15 * (cond / 100);
        e.stamNow = cond / 100;
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
      const tackles2 = defs2.filter((e) => e.role === "DL");
      // Give the short-yardage front real lanes before contact solving it.
      // The old 40px-wide interior put the line and the two A-gap backers
      // inside one another; this wider bear front still plugs the middle while
      // keeping every dinosaur's body distinct on the pre-snap frame.
      edges.forEach((e, i) => { e.contain = true; e.y = MID + (i === 0 ? -84 : 84); });
      tackles2.forEach((e, i) => { e.y = MID + (i === 0 ? -50 : 50); });
      // Stack the A-gaps: the sneak is the FIRST thing this defense takes away.
      P.filter((e) => e.team === "def" && e.role === "LB").forEach((e, i) => {
        e.x = losX + 24; e.y = MID + (i === 0 ? -16 : 16); e.runStuff = true;
      });
    }

    G.players = P;
    G.ball = { mode: "held", holder: eqb, x: eqb.x, y: eqb.y, z: 10 };
    G.carrier = null;
    // Formation coordinates are authored for football spacing, but species have
    // different physical footprints.  Settle them before the first rendered
    // pre-snap frame as well as during live play.
    resolvePlayerContacts();
    G.ball.x = eqb.x + eqb.dir * 8; G.ball.y = eqb.y;
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
    G.tape = []; G.playPass = null; G.aim = null; G.soarAim = null; G.slingAnchor = null;
    noteAiPlayStart();
    G.selCard = null;   // the pre-snap info card never lingers into the play
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
      const mobility = Math.min(0.05, ((qb.agi || 75) - 75) / 250);
      const receiverControl = offenseIsUser() && G.controlled && G.controlled.team === "off" && G.controlled !== qb;
      // The old pre-roll was high enough to make CPU QB / user-WR mode feel
      // predetermined. Protection can still lose, but an AI quarterback now
      // has time to identify and throw the available outlet.
      let sackChance = clamp(0.085 + (rushStr - olStr) / 300 - mobility, 0.035, 0.13);
      if (receiverControl) sackChance *= 0.58;
      qb.sackDoom = Math.random() < sackChance;
      qb.sackAt = rnd(1.42, 2.7);
    }
    if (G.curPlay.type === "run" && !G.curPlay.qbKeep) {
      G.phase = "handoff";
    } else if (G.curPlay.qbKeep) {
      becomeCarrier(qb);
      if (G.curPlay.shed) qb.shedCharges = 2; // tush push: the herd shoves
    }
  }

  function becomeCarrier(e) {
    e.carryT = 0;   // fresh legs through the hole (short burst)
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
          qb.path = [{ x: qb.x + 14 * YPX, y: clamp(qb.y - 70, TOP + 12, BOT - 12) }];
          qb.pathI = 0; qb.endMode = "go"; qb.state = "route";
          // nobody covers the quarterback on a handoff — the defense needs a
          // beat to even realize he's a receiver now
          for (const d2 of G.players) {
            if (d2.team === "def" && dist(d2, qb) < 110 && d2.staggerT <= 0 && d2.soarT <= 0) d2.staggerT = 0.5;
          }
        }
      }
    }
    // Any QB or RB with the ball can still throw while behind the line of
    // scrimmage (QB sneak, RB handoff, scramble) — the RB just isn't accurate.
    if ((e.role === "QB" || e.role === "RB") && !e.hasThrown) e.canPass = true;
    // apex passives that trigger on becoming the ball carrier
    if (e.apex && e.carrierPassived !== G.playT) {
      e.carrierPassived = G.playT;
      // Truckstick gets two *attempts* to power through a tackler, not two
      // automatic escapes.  Keeping the attempts on the carrier also makes
      // the ability readable and prevents a single back from being invincible.
      if (e.passive === "truck") e.truckCharges = (e.truckCharges || 0) + 2;
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
    const qb = G.ball.holder || G.players.find((e) => e.role === "QB");
    const arm = qb ? (qb.arm || 75) : 80;
    // Range is measured from the passer's CURRENT position, never the LOS.
    // CPU howitzers can reach 40 yards. A user-controlled QB tops out 10
    // yards shorter (30), so neither the aim preview nor final scatter lets a
    // player launch an unrealistic 40-yard bomb from a deep drop.
    const userQB = !!(qb && qb.controlled && qb.team === "off" && offenseIsUser());
    const cap = userQB ? 30 : 40;
    let yds = clamp(12 + (arm - 60) * 0.8, 12, cap);
    // throwing on the run bleeds distance — set your feet for the deep ball
    if (qb && Math.hypot(qb.vx, qb.vy) > qb.spd * 0.35) yds *= 0.72;
    return yds * YPX;
  }
  function clampThrowRange(qb, to) {
    const range = maxRange();
    const d = dist(qb, to);
    if (d > range) {
      const scale = range / d;
      to.x = qb.x + (to.x - qb.x) * scale;
      to.y = qb.y + (to.y - qb.y) * scale;
    }
    return to;
  }
  // non-QBs (a halfback on a trick play / sneak pitch) throw wobblers
  const passScatter = (p) => (p && p.role !== "QB") ? (G.curPlay && G.curPlay.sweepPass ? 10 : 26) : 0;
  // bad weather shakes the ball loose from the intended spot a little
  const weatherScatter = () => G.weather.type === "SNOW" ? 9 : G.weather.type === "RAIN" ? 7 : 0;
  // Passing has an explicit, player-visible read.  The target is chosen when
  // the throw is released (not retroactively at arrival), and its window is
  // judged from separation, ball placement, and a defender actually sitting
  // in the lane.  This is the core fairness contract: OPEN is dependable;
  // TIGHT is a choice; DANGER is a mistake the player can see before release.
  function pickPassTarget(to) {
    return eligible().slice().sort((a, b) => dist(a, to) - dist(b, to))[0] || null;
  }
  function assessPassWindow(qb, rec, spot, flight) {
    if (!rec) return { risk: 1, label: "NO TARGET", separation: 0, placement: 999, defender: null };
    const projected = { x: rec.x + rec.vx * flight, y: rec.y + rec.vy * flight };
    const placement = dist(projected, spot);
    let defender = null, separation = 999, laneGap = 999;
    const dx = spot.x - qb.x, dy = spot.y - qb.y, lineLen2 = dx * dx + dy * dy || 1;
    for (const d of G.players) {
      if (d.team !== "def") continue;
      const future = { x: d.x + d.vx * flight, y: d.y + d.vy * flight };
      const sep = dist(future, projected);
      if (sep < separation) { separation = sep; defender = d; }
      const along = clamp(((future.x - qb.x) * dx + (future.y - qb.y) * dy) / lineLen2, 0, 1);
      const lanePoint = { x: qb.x + dx * along, y: qb.y + dy * along };
      laneGap = Math.min(laneGap, dist(future, lanePoint));
    }
    // A nearby defender matters most; a defender sitting directly in the
    // throwing lane is the second cue.  Bad placement turns an otherwise
    // open receiver into a lower-percentage throw without inventing drops.
    const risk = clamp(0.56 - separation / 125 + Math.max(0, 34 - laneGap) / 110 + placement / 150, 0, 1);
    return {
      risk, separation, placement, defender,
      label: risk < 0.24 ? "OPEN WINDOW" : risk < 0.56 ? "TIGHT WINDOW" : "DANGER — DEFENDER"
    };
  }
  function throwLob() {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    const to = { x: G.aim.x, y: G.aim.y };
    const rec = pickPassTarget(to);
    const d = dist(qb, to);
    let T = 0.55 + d / 470;
    // wind pushes the landing spot
    to.x += G.weather.wind.x * T * 1.6; to.y += G.weather.wind.y * T * 1.6;
    // accuracy scatter: throws land close to where they were aimed — a weak
    // arm or ugly weather widens the cone, but never wildly
    let err = (100 - qb.acc) * 0.3 + weatherScatter() + passScatter(qb);
    err += (d / Math.max(1, maxRange())) * (99 - qb.acc) * 0.18;   // deep = harder
    to.x += rnd(-err, err); to.y += rnd(-err, err);
    // even a wild throw stays over the field of play (only ~1-in-100 sails OOB)
    if (Math.random() > 0.01) to.y = clamp(to.y, TOP + 10, BOT - 10);
    to.x = clamp(to.x, xAtYd(-8), xAtYd(108));
    clampThrowRange(qb, to); // wind/scatter cannot turn a legal throw into a bomb
    T = 0.55 + dist(qb, to) / 470;
    const read = assessPassWindow(qb, rec, to, T);
    G.ball = { mode: "air", kind: "lob", from: { x: qb.x, y: qb.y }, to, t: 0, T, x: qb.x, y: qb.y, z: 12, holder: null, target: rec, read };
    G.phase = "air"; G.aim = null; G.slingAnchor = null; qb.state = "idle"; qb.throwT = 0.3; playPose(qb, "throw", 0.32);
    controlIntendedReceiver(to, rec);
    if (G.carrier === qb) { G.carrier = null; qb.canPass = false; qb.hasThrown = true; }
    G.playPass = { passer: qb }; addStat(qb, "att");
    sfx.throw();
  }
  function throwBullet() {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    // bullet locks onto the receiver nearest the aim point
    const rec = pickPassTarget(G.aim);
    const tgt = rec ? { x: rec.x + rec.vx * 0.35, y: rec.y + rec.vy * 0.35 } : { x: G.aim.x, y: G.aim.y };
    let err = (100 - qb.acc) * 0.18 + weatherScatter() * 0.6 + passScatter(qb);
    err += (dist(qb, tgt) / Math.max(1, maxRange())) * (99 - qb.acc) * 0.12;
    tgt.x += rnd(-err, err); tgt.y += rnd(-err, err);
    if (Math.random() > 0.01) tgt.y = clamp(tgt.y, TOP + 10, BOT - 10);   // stays in play
    tgt.x = clamp(tgt.x, xAtYd(-8), xAtYd(108));
    clampThrowRange(qb, tgt);
    const d = dist(qb, tgt), T = d / 430;
    const read = assessPassWindow(qb, rec, tgt, T);
    G.ball = { mode: "air", kind: "bullet", from: { x: qb.x, y: qb.y }, to: tgt, t: 0, T, x: qb.x, y: qb.y, z: 14, holder: null, target: rec, read };
    G.phase = "air"; G.aim = null; G.slingAnchor = null; qb.state = "idle"; qb.throwT = 0.3; playPose(qb, "throw", 0.32);
    controlIntendedReceiver(tgt, rec);
    if (G.carrier === qb) { G.carrier = null; qb.canPass = false; qb.hasThrown = true; }
    G.playPass = { passer: qb }; addStat(qb, "att");
    sfx.bullet();
  }
  const eligible = () => G.players.filter((e) => e.team === "off" && e.routeEligible && e.state !== "block" && e !== G.carrier);

  // hand the sticks to the receiver the throw is meant for — move him under
  // the ball and TIME THE JUMP (space/click as it arrives)
  function controlIntendedReceiver(to, intended) {
    if (!offenseIsUser() || G.ball.away) return;
    const rec = intended || pickPassTarget(to);
    if (rec && dist(rec, to) < 320) {
      G.players.forEach((p2) => { p2.jumpTimed = false; p2.jumpMistimed = false; p2.autoJumped = false; });
      setControlled(rec);
    }
  }
  function timedJump(e) {
    if (e.jumpT > 0) return;
    if (G.ball.mode !== "air") { e.jumpT = 0.45; sfx.juke(); return; }   // plain hop
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
    G.ball = { mode: "air", kind: "lateral", from: { x: c.x, y: c.y }, to, t: 0, T: 0.16 + dist(c, to) / 320, x: c.x, y: c.y, z: 14, holder: null };
    c.state = "idle"; c.throwT = 0.22; playPose(c, "throw", 0.26); G.carrier = null; G.phase = "air";
    sfx.throw();
  }
  // user lateral — aimed at the mouse like a throw, but the ball must go
  // backward, it's wild while you're running, and a miss is a live ball.
  function lateral() {
    const c = G.carrier;
    if (!c || G.state !== "live" || G.phase !== "carry") return;
    let to = { x: mouse.x + G.camX, y: clamp(mouse.y, TOP + 6, BOT - 6) };
    const moving = Math.hypot(c.vx, c.vy) > 18;
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
      // A defense that falls on a fumble in the offense's own end zone has
      // scored six, not merely changed possession at the one-yard line.
      if (!G.patMode && ydAtX(e.x) <= 0) { defensiveTouchdown(e); return; }
      sfx.pick();
      G.ball.mode = "dead";
      playDead("TURNOVER!", { turnover: true, spotYd: clamp(ydAtX(e.x), 1, 99), by: e.name, fumbleRec: true });
    }
  }

  function defensiveTouchdown(recoverer) {
    if (G.state !== "live") return;
    const scoringSide = other(G.drive);
    recordAiPlayResult("FUMBLE RETURN TD!", { turnover: true }, false, 0);
    G.state = "dead"; G.phase = "dead"; G.deadRecT = 0.7;
    G.aim = null; G.soarAim = null; G.slingAnchor = null;
    G.carrier = recoverer;
    G.ball = { mode: "held", holder: recoverer, x: recoverer.x, y: recoverer.y, z: 12 };
    G.score[scoringSide] += 6;
    G.rampage[scoringSide] = clamp(G.rampage[scoringSide] + 25, 0, 100);
    banner("FUMBLE RETURN TD!", lastName(recoverer.name) + " falls on it for six", 2.4);
    announce("td", recoverer.name); sfx.td(); crowdCheer(scoringSide === "A" ? 1 : 0.5);
    startCelebration(scoringSide, Math.random() < 0.5 ? "spike" : "hop", recoverer);
    G.deadT = 2.6;
    // Keep the current offense/defense entity labels through the celebration,
    // then make the scoring team the kicking side for the conversion/kickoff.
    G.deadNext = () => startReplay(() => {
      G.drive = scoringSide; G.losYd = 25; G.down = 1; G.toGain = 10;
      if (isHuman(scoringSide)) G.state = "ptchoice";
      else enterKick("XP");
    });
  }

  // ------------------------------------------------------------- catch logic
  function resolveArrival() {
    const b = G.ball;
    const spot = { x: b.to.x, y: b.to.y };
    const riskyMoonBall = b.kind === "lob" && b.from && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) >= 22 * YPX;
    if (riskyMoonBall && G.drive === "A" && !G.humanB && G.aiPlay) G.aiPlay.risky = true;
    const learnedPick = cpuRiskPickBoost(riskyMoonBall);
    const recs = eligible().map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    const defs = G.players.filter((e) => e.team === "def").map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    const nearestRec = recs[0];
    const intendedRec = b.target ? recs.find((r2) => r2.e === b.target) : null;
    // The player chose a receiver at release.  Preserve that intent unless a
    // teammate has genuinely arrived much closer to the bad ball placement.
    const rec = intendedRec && (!nearestRec || intendedRec.d <= nearestRec.d + 14) ? intendedRec : nearestRec;
    const df = defs[0];
    const BASE_CATCH_R = b.kind === "bullet" ? 30 : 34;
    // catch radius reflects the ATHLETE: sure hands extend a receiver's
    // range, a leaper's hops extend a defender's — plus the control bonus
    const recR = BASE_CATCH_R * (rec && rec.e.controlled ? 1.12 : 1) * (rec ? (0.9 + ((rec.e.hands || 75) - 60) / 300) : 1);
    const dfR = BASE_CATCH_R * (df && df.e.controlled ? 1.12 : 1) * (df ? (0.82 + ((df.e.jump || 70) - 55) / 260) : 1);

    // both contesters leap at the ball (guarantees the visual on a real contest)
    if (rec && rec.d < 52) rec.e.jumpT = Math.max(rec.e.jumpT || 0, 0.4);
    if (df && df.d < 52) df.e.jumpT = Math.max(df.e.jumpT || 0, 0.4);

    const completeCatch = (who) => {
      // Do not snap a dino to the landing dot.  Reaching the ball inside his
      // catch radius is what earns the catch; the authored cel then puts the
      // football at his claws, preserving the approach he just ran on screen.
      const throwDepth = b.from ? Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) : 0;
      const stretch = rec && rec.e === who && rec.d > recR * 0.46;
      const highPoint = b.kind === "lob" && (throwDepth > 9 * YPX || who.jumpT > 0);
      const catchPose = highPoint ? "catchHigh" : (b.kind === "bullet" ? "catchLow" : "catch");
      // Every completion gets a readable secure-the-ball moment; the extended
      // action lasts just long enough to show dives and high points without
      // interrupting a clean catch-and-run.
      continuePose(who, catchPose, (who.diveT > 0 || stretch || highPoint) ? 0.56 : 0.42);
      if (who.diveT > 0 || stretch) who.catchDiveT = 0.56;
      who.catchT = G.playT;   // fresh catches are vulnerable to a big hit
      becomeCarrier(who);
      if (G.playPass) { G.playPass.receiver = who; addStat(G.playPass.passer, "cmp"); addStat(who, "rec"); }
      sfx.catch();
    };
    // --- TRUE 50/50 BALL: receiver and defender both in range → they go up
    // together and the better leap comes down with it (your timed jump counts;
    // a receiver left on autopilot leaps late and loses leverage)
    if (rec && df && rec.d < recR && df.d < dfR) {
      const timing = (e) => e.jumpTimed ? 24 : (e.jumpMistimed ? -14 : (e.autoJumped ? -9 : 0));
      const posScore = (x) => (BASE_CATCH_R - x.d) * 1.5 + ((x.e.jump || 70) - 70) * 0.9 +
        ((x.e.hands || 70) - 70) * 0.6 + timing(x.e) + rnd(0, 16);
      // A safety/DB attacking the catch point from the other direction has
      // leverage that a trailing defender does not.  This is deliberately a
      // contest-only effect: a cleanly separated receiver is still open, but
      // repeated moon balls into a closing defender become a real turnover
      // risk even when both players have comparable ratings and jump timing.
      const dx = rec.e.x - df.e.x, dy = rec.e.y - df.e.y;
      const gap = Math.hypot(dx, dy) || 1;
      const closing = ((df.e.vx - rec.e.vx) * dx + (df.e.vy - rec.e.vy) * dy) / gap;
      const headOn = df.e.vx * rec.e.vx + df.e.vy * rec.e.vy < -300;
      const defenderCrash = headOn ? clamp((closing - 28) / 90, 0, 1) : 0;
      // The defender earns leverage by recognizing the throw early and
      // getting into the passing lane.  This is intentionally separate from
      // ratings: an aware safety who arrives from in front has a real play on
      // a floated ball, while a trailing DB does not magically gain the same
      // advantage at the final frame.
      const passDir = b.from ? Math.sign(b.to.x - b.from.x) || 1 : 1;
      const inPassingLane = b.from && (df.e.x - rec.e.x) * passDir < -2;
      const defenderLeverage = (df.e.ballAttack ? 3 : 0) + (df.e.catchLeverage || 0) +
        (inPassingLane ? 2.5 : 0) + defenderCrash * 3;
      const rs = posScore(rec);       // a true 50/50 has no built-in WR edge
      const ds = posScore(df) + (df.e.apex && df.e.passive === "ballhawk" ? 6 : 0) + defenderCrash * 8 + defenderLeverage * 2 + learnedPick * 36;
      if (rs >= ds) {
        let pc = 0.9 - (99 - (rec.e.hands || 75)) * 0.003 + G.weather.catchMod - 0.1 +
          (offenseIsUser() ? 1 : -1) * diff().catchBonus;
        if (rec.e.controlled) pc += 0.10; // +10% catch rate for controlled player
        if (b.read && b.read.risk >= 0.56) pc -= (b.read.risk - 0.48) * 0.16;
        if (Math.random() < pc) {
          completeCatch(rec.e);
          // If the receiver wins the ball but a defender drives through him
          // from the opposite direction, the catch is not automatically safe.
          // The ball stays live after the forced fumble, so either team can
          // still recover it instead of turning this into a scripted pick.
          const crashFumbleP = defenderCrash > 0 ? 0.05 + defenderCrash * 0.15 + defenderLeverage * 0.01 +
            (G.drive === "A" && !G.humanB ? 0.05 : 0) : 0;
          if (Math.random() < crashFumbleP) { fumble(rec.e, df.e); return; }
          banner("MOSSED!", lastName(rec.e.name) + " wins the jump ball!", 0.8);
          announce("catch", rec.e.name);
          return;
        }
        // even an offense "win" can pop loose to a leaping DB — much more so
        // when YOUR jump was mistimed and HIS was perfect
        let slopP = 0.26 + defenderCrash * 0.15 + (rec.e.jumpMistimed ? 0.10 : 0) + (df.e.jumpTimed ? 0.07 : 0);
        if (ds > rs - 10 && Math.random() < slopP) { intercepted(df.e, spot); return; }
        incomplete(spot, "BROKEN UP!"); return;
      } else {
        // the DEFENDER won the leap: his jump talent + the receiver's weak
        // hands decide whether it's a pick or just a swat
        let intP = 0.65 + ((df.e.jump || 75) - 75) * 0.004 + (75 - (rec.e.hands || 75)) * 0.003 +
          ((df.e.hands || 75) - 75) * 0.003 +
          (df.e.jumpTimed && rec.e.jumpMistimed ? 0.10 : 0);
        intP += defenderCrash * 0.14 + defenderLeverage * 0.018 + learnedPick;
        if (G.drive === "A" && !G.humanB) intP += 0.06; // risky user throws punish harder
        if (Math.random() < clamp(intP, 0.35, 0.9)) { intercepted(df.e, spot); return; }
        incomplete(spot, "SWATTED AWAY!"); return;
      }
    }
    // --- solo defender in range: pick odds from closeness (slightly softened)
    if (df && df.d < dfR) {
      const closeness = 1 - df.d / dfR;
      let pickP = (b.kind === "bullet" ? 0.33 : 0.27) * closeness + (df.e.controlled ? 0.14 : 0);
      if (!rec || df.d < rec.d) pickP += 0.15;
      if (df.e.jumpTimed) pickP += 0.22;      // a perfectly timed leap steals it
      if (df.e.jumpMistimed) pickP -= 0.08;
      if (df.e.apex && df.e.passive === "ballhawk") pickP += 0.10;
      if (G.drive === "A" && !G.humanB && rec && df.d <= rec.d + 8) pickP += 0.08;
      if (df.e.ballAttack) pickP += 0.06 + (df.e.catchLeverage || 0) * 0.012;
      if (b.read && b.read.risk >= 0.56) pickP += 0.10 + (b.read.risk - 0.56) * 0.18;
      pickP += learnedPick;
      pickP += ((df.e.jump || 75) - 75) * 0.002 + ((df.e.hands || 75) - 75) * 0.002;
      if (Math.random() < pickP) { intercepted(df.e, spot); return; }
      if (!rec || df.d < rec.d - 4) { incomplete(spot); return; }
    }
    // --- solo receiver: clean reads should feel like catches, not dice rolls.
    // Ratings and timing still matter, but drops mostly come from pressure,
    // weather, mistiming, or visibly poor ball placement.
    if (rec && rec.d < recR) {
      const closeDefender = df && df.d < Math.max(dfR * 1.35, 46);
      const cleanRead = !closeDefender && (!b.read || b.read.risk < 0.24) && rec.d < recR * 0.82;
      let p = 0.80 + ((rec.e.hands || 75) - 75) * 0.003 + G.weather.catchMod +
        (offenseIsUser() ? 1 : -1) * diff().catchBonus;
      if (cleanRead) p += 0.10;
      if (rec.e.jumpTimed) p += 0.06;      // the timing skill closes a tight catch
      if (rec.e.jumpMistimed) p -= 0.09;   // an early leap is visibly costly
      if (rec.e.controlled && rec.e.autoJumped) p -= 0.035;
      if (b.kind === "bullet") p += 0.02;
      if (rec.e.apex && rec.e.passive === "redzone" && G.losYd >= 80) p += 0.08;
      if (rec.e.controlled) p += 0.055;
      if (b.read) p -= Math.max(0, b.read.risk - 0.24) * 0.14;
      if (Math.random() < clamp(p, 0.42, 0.985)) {
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
    // A pick needs a visible secure/landing beat before the possession card.
    // Keep the defender at the position he earned instead of teleporting him
    // to the destination, and let the high-point cel own the ball image.
    const prior = G.ball || {};
    const throwDepth = prior.from ? Math.hypot(spot.x - prior.from.x, spot.y - prior.from.y) : 0;
    defender.jumpT = Math.max(defender.jumpT || 0, 0.4);
    playPose(defender, prior.kind === "bullet" ? "catchLow" : (throwDepth > 8 * YPX ? "catchHigh" : "catch"), 0.62);
    defender.catchT = G.playT;
    G.carrier = defender;
    G.ball = { mode: "held", holder: defender, x: defender.x, y: defender.y, z: 12 };
    if (G.playPass) addStat(G.playPass.passer, "passInt");
    addStat(defender, "defInt");
    playDead("INTERCEPTED!", { turnover: true, spotYd: clamp(ydAtX(spot.x), 1, 99), by: defender.name });
  }

  // --------------------------------------------------------------- dead ball
  function playDead(reason, info, noSpot) {
    if (G.state !== "live") return;
    G.state = "dead"; G.phase = "dead"; sfx.whistle();
    G.aim = null; G.soarAim = null; G.slingAnchor = null;
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
    recordAiPlayResult(reason, info, noSpot, spotYd);

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
      const scoringSide = G.drive;
      G.deadT = 1.7; G.deadNext = () => startKickoff(other(scoringSide));
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
      ["TACKLED", "SACKED!", "FLATTENED!", "DIVE", "OUT OF END ZONE"].includes(reason)) {
      const defT = G.drive === "A" ? "B" : "A";
      G.score[defT] += 2;
      banner("SAFETY!", "Two points!", 2);
      G.deadT = 2; G.deadNext = () => { changePossession(30); enterPlaycall(); };
      return;
    }

    // A return ends at its own spot and begins a fresh possession. It is not
    // a regular down that accidentally awards a "first down" mid-return.
    if (G.returnPlay && !info.turnover) {
      const returnKind = G.returnPlay.kind;
      const returnYd = clamp(Math.round(spotYd), 1, 99);
      G.returnPlay = null;
      G.losYd = returnYd; G.down = 1; G.toGain = Math.min(10, 100 - returnYd);
      banner(returnKind + " RETURN", "TO THE " + returnYd, 1.25);
      G.deadT = 1.25; G.deadNext = enterPlaycall;
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
      G.returnPlay = null;
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
      if (fdGuy) {
        fdGuy.proneT = 0; fdGuy.jumpT = 0.45; fdGuy.fdCeleb = 1.3;
        playPose(fdGuy, "celebrate", 1.3);
      }
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
    G.deadT = 1.3;
    // sacks and tackles-for-loss earn the instant-replay treatment
    const tfl = !noSpot && !info.turnover && gained <= -1 &&
      ["TACKLED", "SACKED!", "FLATTENED!"].includes(reason);
    G.deadNext = (reason === "SACKED!" || tfl) ? () => startReplay(enterPlaycall) : enterPlaycall;
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
    G.returnPlay = null;
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
    const story = G.driveStory && G.driveStory.side === t ? G.driveStory : null;
    const drivePayoff = story ? story.plays + " PLAY DRIVE · " + Math.max(1, Math.round(100 - story.startYd)) + " YDS" : "DRIVE COMPLETE";
    banner("TOUCHDOWN " + TEAMS[scoringAbbr][0].toUpperCase() + "!",
      (rainParty ? "💦 PUDDLE PARTY! · " : "") + drivePayoff, 2);
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
      // CPU: use the actual scoring side, not a hard-coded team B.  Being
      // down two after the touchdown means it was down eight before it, so a
      // two-point try ties the game and is always the right call.
      const deficit = G.score[other(t)] - G.score[t]; // after its 6
      let wantTwo = deficit === 2;
      if (!wantTwo && G.quarter >= 4) {
        if (deficit === 1) wantTwo = Math.random() < (G.clock <= 120 ? 0.95 : 0.78);
        else if ([5, 8, 11, 14].includes(deficit)) wantTwo = Math.random() < (G.clock <= 120 ? 0.86 : 0.68);
      } else if (!wantTwo && G.quarter >= 3 && [2, 5, 10, 16, 18].includes(deficit)) {
        wantTwo = Math.random() < 0.75;
      }
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
    G.driveStory = { side: G.drive, startYd: G.losYd, plays: 0 };
    G.ramp = null;
  }

  // ------------------------------ halftime show: METEOR MADNESS ------------
  // The mascot T-rex sprints around midfield catching footballs launched from
  // the stands while ACTUAL METEORS rain down. Catch = +7 rampage. Meteor
  // hit = stunned and -1. Spawns ramp up, so the last seconds get frantic.
  // Everything lands on one screen — nothing is ever out of reach.
  // ---- FOUR halftime shows, never the same one twice in a row ----
  //  meteor : dodge meteors, catch footballs        (steer)
  //  fg     : FIELD GOAL FRENZY, 5 kicks, wind      (timing meters)
  //  dash   : DINO DASH hurdles sprint              (jump timing)
  //  snack  : SNACK SCRAMBLE, falling stadium food  (steer, combo)
  const HALF_GAMES = ["meteor", "fg", "dash", "snack"];
  function startHalftimeShow(cont) {
    const last = localStorage.getItem("dinobowl_lasthalf");
    const pool = HALF_GAMES.filter((k) => k !== last);
    const kind = pool[(Math.random() * pool.length) | 0];
    try { localStorage.setItem("dinobowl_lasthalf", kind); } catch (_) { }
    const camX = clamp(xAtYd(50) - W / 2, 0, FIELD_LEN - W);
    G.half = {
      kind, t: 22, cont, score: 0, hits: 0,
      px: camX + W / 2, py: MID, stun: 0, drops: [], spawnT: 0.5, camX,
    };
    const h = G.half;
    if (kind === "fg") {
      Object.assign(h, { t: 30, kickNo: 1, kicks: 5, stage: 0, kt: 0, val: 0, power: 0, fgd: 30, wind: rnd(-24, 24), fly: null, camX: clamp(xAtYd(78) - W / 2, 0, FIELD_LEN - W) });
    } else if (kind === "dash") {
      const hurdles = [];
      for (let x = 420; x < FIELD_LEN - 300; x += rnd(170, 300)) hurdles.push({ x, hit: false });
      Object.assign(h, { t: 18, px: 240, py: MID, runV: 150, jumpZ: 0, jumpV: 0, hurdles, stumbles: 0, camX: 0 });
    } else if (kind === "snack") {
      Object.assign(h, { spawnT: 0.3, combo: 0 });
    }
    G.state = "halftime";
  }
  // one press/space handler for every show
  // halftime rewards: in 2-player versus, BOTH meters get fed
  function halfReward(x) {
    G.rampage.A = clamp(G.rampage.A + x, 0, 100);
    if (G.humanB) G.rampage.B = clamp(G.rampage.B + x, 0, 100);
  }
  function halftimePress() {
    const h = G.half; if (!h) return;
    if (h.kind === "fg" && !h.fly) {
      if (h.stage === 0) { h.power = h.val; h.stage = 1; h.kt = 0; sfx.kick(); }
      else if (h.stage === 1) {
        const acc = h.val - 50;
        const windPush = h.wind * 0.35;
        const window2 = 16 - h.fgd * 0.12;
        const good = Math.abs(acc + windPush) < Math.max(7, window2) && h.power > 35 + h.fgd * 0.5;
        h.fly = { t: 0, T: 0.85, good, acc: acc + windPush };
        sfx.kick();
      }
    } else if (h.kind === "dash" && h.jumpZ <= 0) {
      h.jumpV = 235; h.jumpZ = 0.01; sfx.juke();
    }
  }
  function updateHalftime(dt) {
    const h = G.half;
    h.t -= dt;
    if (h.kind === "fg") { updateHalfFG(dt); return; }
    if (h.kind === "dash") { updateHalfDash(dt); return; }
    // meteor + snack share the falling-object engine
    const ramp = 1 + (22 - h.t) / 9;
    h.spawnT -= dt * ramp;
    if (h.spawnT <= 0) {
      if (h.kind === "snack") {
        h.spawnT = rnd(0.3, 0.55);
        const gold = Math.random() < 0.14;
        h.drops.push({
          fx: h.camX + rnd(60, W - 60), fy: rnd(TOP + 30, BOT - 30),
          hgt: 340, fall: rnd(170, 260), kind: gold ? "g" : "s",
          driftX: rnd(-40, 40),
        });
      } else {
        h.spawnT = rnd(0.6, 0.95);
        const meteor = Math.random() < 0.42;
        h.drops.push({
          fx: h.camX + rnd(60, W - 60), fy: rnd(TOP + 30, BOT - 30),
          hgt: 340, fall: meteor ? rnd(300, 380) : rnd(160, 215), kind: meteor ? "m" : "b",
        });
      }
    }
    // snacks drift on the breeze — track the marker, not where it started
    if (h.kind === "snack") for (const dr of h.drops) if (!dr.done && dr.driftX) {
      dr.fx = clamp(dr.fx + dr.driftX * dt, h.camX + 30, h.camX + W - 30);
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
        if (dr.kind === "b" || dr.kind === "s" || dr.kind === "g") {
          if (dd < 30 && h.stun <= 0) {
            const pts = dr.kind === "g" ? 3 : 1;
            h.combo = (h.combo || 0) + 1;
            h.score += pts;
            halfReward(5 + pts * 2 + Math.min(4, h.combo));
            sfx.catch(); crowdCheer(dr.kind === "g" ? 0.6 : 0.3);
          } else if (dr.kind !== "b") h.combo = 0;
        } else {
          G.shake = Math.max(G.shake, 0.35); sfx.tackle();
          if (dd < 40) { h.stun = 1.0; h.hits++; h.score = Math.max(0, h.score - 1); sfx.roar(); }
        }
      }
    }
    h.drops = h.drops.filter((dr) => !dr.done || dr.doneT == null || dr.doneT < 0.35);
    if (h.t <= 0) endHalftime();
  }
  function updateHalfFG(dt) {
    const h = G.half;
    if (h.fly) {
      h.fly.t += dt;
      if (h.fly.t >= h.fly.T) {
        if (h.fly.good) { h.score++; halfReward(9); sfx.td(); crowdCheer(0.5); }
        else sfx.tackle();
        h.kickNo++;
        if (h.kickNo > h.kicks) { endHalftime(); return; }
        h.stage = 0; h.kt = 0; h.fly = null;
        h.fgd = 30 + (h.kickNo - 1) * 7;              // 30 → 58 yards
        h.wind = rnd(-30, 30);
      }
      return;
    }
    h.kt += dt;
    if (h.stage === 0) h.val = 50 + 50 * Math.sin(h.kt * 4.4);
    else h.val = 50 + 50 * Math.sin(h.kt * (5.4 + h.kickNo * 0.35) + Math.PI / 2);
    if (h.t <= 0) endHalftime();
  }
  function updateHalfDash(dt) {
    const h = G.half;
    // the sprint: constant burn with a stumble tax
    h.runV = Math.min(300, h.runV + dt * 26);
    if (h.stun > 0) { h.stun -= dt; }
    else h.px += h.runV * dt;
    // jump physics
    if (h.jumpZ > 0 || h.jumpV > 0) {
      h.jumpZ += h.jumpV * dt; h.jumpV -= 620 * dt;
      if (h.jumpZ <= 0) { h.jumpZ = 0; h.jumpV = 0; }
    }
    for (const hu of h.hurdles) {
      if (!hu.hit && Math.abs(h.px - hu.x) < 10 && h.jumpZ < 16) {
        hu.hit = true; h.stumbles++; h.stun = 0.7; h.runV = 120;
        G.shake = Math.max(G.shake, 0.25); sfx.tackle();
      } else if (!hu.hit && h.px > hu.x + 12) { hu.hit = true; h.score++; sfx.juke(); }
    }
    h.camX = clamp(h.px - 300, 0, FIELD_LEN - W);
    if (h.t <= 0 || h.px > FIELD_LEN - 260) {
      halfReward(Math.round(ydAtX(h.px) * 0.55));
      endHalftime();
    }
  }
  const HALF_TITLES = {
    meteor: (h) => ["METEOR MADNESS: " + h.score + " CAUGHT!", (h.hits ? "clonked by " + h.hits + " meteor" + (h.hits > 1 ? "s" : "") + " · " : "") + "rampage meter fed for the second half!"],
    fg: (h) => ["FIELD GOAL FRENZY: " + h.score + "/" + h.kicks + "!", (h.score >= 4 ? "ICE IN THE VEINS — " : "") + "every make fed the rampage meter!"],
    dash: (h) => ["DINO DASH: " + Math.max(0, Math.round(ydAtX(h.px))) + " YARDS!", h.stumbles ? h.stumbles + " faceplant" + (h.stumbles > 1 ? "s" : "") + " — hurdles are undefeated" : "CLEAN RUN! The crowd is losing it!"],
    snack: (h) => ["SNACK SCRAMBLE: " + h.score + " SNACKS!", "golden drumsticks are 3 · the rampage meter thanks you"],
  };
  function endHalftime() {
    const h = G.half; G.half = null;
    const [t1, t2] = (HALF_TITLES[h.kind] || HALF_TITLES.meteor)(h);
    banner(t1, t2, 2.2);
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
    const title = h.kind === "snack"
      ? "🌭 SNACK SCRAMBLE — " + Math.ceil(Math.max(0, h.t)) + "s — " + h.score + " SNACKS"
      : "☄ METEOR MADNESS — " + Math.ceil(Math.max(0, h.t)) + "s — " + h.score + " CAUGHT";
    const hint = h.kind === "snack"
      ? "CATCH THE FLYING FOOD · GOLD DRUMSTICK = 3 · COMBOS FEED RAMPAGE FASTER"
      : "CATCH 🏈 (+7 RAMPAGE) · DODGE METEORS (-1 & STUN) · MOUSE/WASD · ENTER TO SKIP";
    drawHalfFrame(title, hint);
  }
  function drawHalfFrame(title, hint) {
    cx.font = PF(12); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
    cx.fillText(title, W / 2, 52);
    cx.fillStyle = "rgba(5,12,8,.8)"; cx.fillRect(W - 122, 10, 108, 30);
    cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2; cx.strokeRect(W - 122, 10, 108, 30);
    cx.font = PF(9); cx.fillStyle = "#ffd23f"; cx.fillText("SKIP ▶", W - 68, 30);
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText(hint, W / 2, 72);
  }
  function drawHalfFG() {
    const h = G.half;
    G.camX = h.camX;
    drawField();
    const postX = xAtYd(108) - G.camX;
    // the kicking tee dino
    const sheet = G.sheets.A;
    const kx = xAtYd(78 - h.fgd + 61) - G.camX;   // spot scales with distance
    const sx = xAtYd(108 - h.fgd) - G.camX;
    if (sheet && sheet.troodon) cx.drawImage(sheet.troodon.R[0], sx - 16, MID - 26);
    cx.drawImage(G.ballSpr, sx + 4, MID - 6);
    // ball flight
    if (h.fly) {
      const k = h.fly.t / h.fly.T;
      const bx = sx + (postX - sx) * k;
      const by = MID + h.fly.acc * 1.6 * k;
      cx.drawImage(G.ballSpr, bx - 8, by - (10 + 200 * k * (1 - k)) - 5);
      if (k > 0.9) {
        cx.font = PF(16); cx.textAlign = "center";
        cx.fillStyle = h.fly.good ? "#69be28" : "#ff5533";
        cx.fillText(h.fly.good ? "GOOD!" : "NO GOOD", postX - 60, MID - 90);
      }
    } else {
      // meters
      cx.fillStyle = "rgba(5,12,8,.75)"; cx.fillRect(W / 2 - 190, H - 118, 380, 92);
      cx.strokeStyle = "#ffd23f"; cx.strokeRect(W / 2 - 190, H - 118, 380, 92);
      cx.font = PF(9); cx.textAlign = "center"; cx.fillStyle = "#f4f6f1";
      cx.fillText("KICK " + h.kickNo + "/" + h.kicks + " — " + h.fgd + " YDS", W / 2, H - 98);
      cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 160, H - 86, 320, 16);
      cx.fillStyle = h.stage === 0 ? "#e8622c" : "#3a4441";
      cx.fillRect(W / 2 - 160, H - 86, 320 * ((h.stage === 0 ? h.val : h.power) / 100), 16);
      if (h.stage === 1) {
        cx.fillStyle = "#0d2519"; cx.fillRect(W / 2 - 160, H - 62, 320, 16);
        cx.fillStyle = "#1d4030"; cx.fillRect(W / 2 - 26, H - 62, 52, 16);
        const vx = W / 2 - 160 + 320 * (h.val / 100);
        cx.fillStyle = "#ffd23f"; cx.fillRect(vx - 3, H - 66, 6, 24);
      }
      cx.font = PF(8); cx.fillStyle = "#8ecafc";
      cx.fillText("WIND " + (h.wind > 0 ? "↓ " : "↑ ") + Math.abs(Math.round(h.wind / 4)), W / 2 + 140, H - 98);
    }
    drawHalfFrame("🦶 FIELD GOAL FRENZY — " + h.score + "/" + h.kicks + " — " + Math.ceil(Math.max(0, h.t)) + "s",
      "TAP/SPACE: LOCK POWER, THEN ACCURACY · WATCH THE WIND · LONGER EVERY KICK");
  }
  function drawHalfDash() {
    const h = G.half;
    G.camX = h.camX;
    drawField();
    // hurdles: pixel boulders
    for (const hu of h.hurdles) {
      const x = hu.x - G.camX;
      if (x < -30 || x > W + 30) continue;
      cx.fillStyle = hu.hit ? "rgba(122,138,153,.4)" : "#7a8a99";
      cx.fillRect(x - 9, MID - 14, 18, 14);
      cx.fillStyle = hu.hit ? "rgba(90,106,120,.4)" : "#5a6a78";
      cx.fillRect(x - 6, MID - 20, 12, 7);
    }
    const sheet = G.sheets.A;
    if (sheet && sheet.carno && !(h.stun > 0 && ((performance.now() / 90) | 0) % 2)) {
      const spr = sheet.carno, fi = ((performance.now() / 100) | 0) % 2;
      cx.fillStyle = "rgba(0,0,0,.28)";
      cx.fillRect(h.px - G.camX - 8, MID + 2, 16 - h.jumpZ * 0.1, 4);
      cx.drawImage(spr.R[fi], h.px - G.camX - spr.w / 2, MID - spr.h + 6 - h.jumpZ);
    }
    drawHalfFrame("🏃 DINO DASH — " + Math.max(0, Math.round(ydAtX(h.px))) + " YDS — " + Math.ceil(Math.max(0, h.t)) + "s",
      "TAP/SPACE = HURDLE THE ROCKS · FACEPLANTS KILL YOUR SPEED · GO GO GO");
  }

  function endQuarter() {
    if (G.quarter === 2) {
      G.quarter = 3; G.clock = 180;
      banner("HALFTIME", "Mascot minigame time — four shows in the rotation!", 2.0);
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
    recordCpuGameResult();
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
    G.kick = {
      kind, stage: 0, t: 0, power: 0, acc: 0, kicker, cpu: !isHuman(G.drive),
      // Kickoffs are launched from the kicking side's 35, independent of the
      // previous drive's final spot.  That is important after touchdowns.
      originYd: kind === "KO" ? 35 : G.losYd,
    };
    buildKickFormation(kind);
  }

  function startKickoff(receivingSide) {
    if (receivingSide == null) receivingSide = other(G.drive);
    // For the kick sequence G.drive names the kicking team; it flips once the
    // returner fields it, exactly once, in startKickReturn / touchback.
    G.drive = other(receivingSide);
    G.kickoffReceiving = receivingSide;
    G.losYd = 35; G.down = 1; G.toGain = 10;
    enterKick("KO");
  }
  // The kick meter deliberately has a clear makeable lane instead of making
  // players infer it from a percentage.  It is still a two-beat Dino Bowl
  // kick (range, then aim), but each beat uses the easy-to-read timing bar
  // that makes a Retro Bowl field goal feel fair at a glance.
  function kickMeterPlan(k) {
    if (k.kind === "KO") {
      return { fgDist: 65, powerMin: 46, accCenter: clamp(50 - G.weather.wind.y * 0.35, 8, 92), accHalf: 32 };
    }
    const leg = k.kicker.leg || 84;
    const fgDist = k.kind === "XP" ? 33 : Math.round(100 - G.losYd + 17);
    // This is the power value at which the existing range calculation first
    // reaches the posts.  Everything to its right is green: more leg never
    // punishes a kick, but a short kick does.
    const powerMin = clamp(55 + (fgDist - (28 + leg * 0.32)) * 5, 4, 94);
    const kacc = k.kicker.kacc || kickAccOf(k.kicker.name);
    const accHalf = (k.kind === "XP" ? 24 : 16) + (kacc - 80) * 0.25;
    // Crosswind shifts the aiming lane, so the UI and make calculation always
    // agree about where a true kick is headed.
    const accCenter = clamp(50 - G.weather.wind.y * 0.5, 2, 98);
    return { fgDist, powerMin, accCenter, accHalf };
  }
  // RETRO-BOWL-STYLE LIVE KICKS: the snap is real. Six rushers claw through
  // the protection while you work the meter — dawdle and the kick gets
  // BLOCKED (live ball!). Made kicks then FLY downfield in real time.
  function buildKickFormation(kind) {
    const losX = xAtYd(G.kick && G.kick.originYd != null ? G.kick.originYd : G.losYd);
    const defAb = G.drive === "A" ? G.opp : G.my;
    const defR = roster(defAb);
    const P = [];
    for (let i = 0; i < 5; i++) {
      const e = mkEnt("off", "trike", "", "OL", 60, { str: 82 });
      e.x = losX - 10; e.y = MID - 56 + i * 28; e.state = "idle";
      P.push(e);
    }
    const kk = mkEnt("off", "troodon", G.kick.kicker.name, "K", 68, {});
    kk.x = losX - (kind === "PUNT" ? 240 : kind === "KO" ? 0 : 140); kk.y = MID; kk.state = "idle";
    P.push(kk); G.kick.kickerEnt = kk;
    if (kind === "KO") {
      // A kickoff unit fans across the field instead of pretending it is a
      // field-goal protection play.  The actual coverage is built for the
      // live return when the ball lands.
      for (let i = 0; i < 5; i++) {
        const e = mkEnt("off", i % 2 ? "deinony" : "allo", "", "GUN", 82, { str: 72, tkl: 78 });
        e.x = losX - 8; e.y = MID - 96 + i * 48; e.state = "idle"; P.push(e);
      }
      G.players = P;
      G.ball = { mode: "held", holder: kk, x: kk.x, y: kk.y, z: 10 };
      G.carrier = null; G.controlled = null; G.selCard = null;
      resolvePlayerContacts();
      G.ball.x = kk.x + kk.dir * 8; G.ball.y = kk.y;
      G.camX = clamp(kk.x - W * 0.35, 0, FIELD_LEN - W);
      return;
    }
    const pool = (defR.defense || []).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const d = pool[i] || { name: "", spd: 78 };
      const e = mkEnt("def", i % 2 ? "allo" : "stego", d.name, "EDGE", d.spd || 78, { str: d.str || 80 });
      e.x = losX + 14; e.y = MID - 70 + i * 28; e.state = "kickrush";
      // how long the protection holds THIS rusher — decisive kicks are safe
      e.holdT = rnd(1.5, 2.6) + (kind === "PUNT" ? 0.2 : 0);
      P.push(e);
    }
    G.players = P;
    G.ball = { mode: "held", holder: kk, x: kk.x, y: kk.y, z: 10 };
    G.carrier = null; G.controlled = null; G.selCard = null;
    resolvePlayerContacts();
    G.ball.x = kk.x + kk.dir * 8; G.ball.y = kk.y;
    G.camX = clamp(kk.x - W * 0.35, 0, FIELD_LEN - W);
  }
  function blockedKick(rusher) {
    sfx.tackle(); sfx.roar();
    G.shake = 0.5;
    announce("fumble", rusher && rusher.name);
    G.state = "live"; G.phase = "loose"; G.playT = 0;
    // a blocked EXTRA POINT is still a conversion try: one live play, worth
    // at most 2, and the kickoff possession change happens no matter what
    if (G.kick && G.kick.kind === "XP") G.patMode = true;
    G.curPlay = { name: "KICK", type: "run", tags: [] };
    for (const e of G.players) if (e.state === "kickrush") e.state = "rush";
    const kk = G.kick.kickerEnt;
    G.ball = { mode: "loose", x: kk.x + 14, y: kk.y, z: 8, vx: rnd(40, 120), vy: rnd(-60, 60), t: 0, holder: null };
    banner("BLOCKED KICK!!", "LIVE BALL -- dive on it!", 1.4);
    crowdCheer(0.8);
    G.kick = null;
  }
  function kickLocked() {
    const k = G.kick;
    if (k.stage === 0) { k.power = k.val; k.stage = 1; k.t = 0; sfx.kick(); return; }
    k.acc = k.val - 50; // -50..50, 0 is perfect
    k.stage = 2; k.t = 0;
    resolveKick();
  }
  function launchKick(toX, toY, after) {
    const kk = (G.kick && G.kick.kickerEnt) || { x: xAtYd(G.losYd) - 140, y: MID };
    sfx.kick();
    const d = Math.abs(toX - kk.x);
    G.kickFly = { from: { x: kk.x, y: kk.y }, to: { x: toX, y: toY }, t: 0, T: 0.8 + d / 640, arc: clamp(d * 0.45, 80, 300), after };
    G.ball = { mode: "kickfly", x: kk.x, y: kk.y, z: 10, holder: null };
    G.state = "kickfly";
  }
  function resolveKick() {
    const k = G.kick;
    const leg = k.kicker.leg || 84;
    if (k.kind === "KO") {
      // Kickoffs usually reach the goal line, but weather/leg/aim decide
      // whether there is a returnable ball, a short kick, or a touchback.
      const origin = k.originYd == null ? 35 : k.originYd;
      let d = 47 + (k.power / 100) * (18 + leg * 0.16) + G.weather.wind.x / YPX;
      let land = origin + d;
      const err = Math.abs(k.acc + G.weather.wind.y * 0.35);
      const directional = clamp(MID + k.acc * 2.6 + G.weather.wind.y * 3, TOP + 20, BOT - 20);
      if (err > 26) land -= (err - 26) * 0.34;       // badly aimed balls hang shorter
      land = clamp(land, 74, 106);
      const returnYd = clamp(100 - land, 1, 26);
      // Returns should be part of normal play, not a once-a-game novelty.
      // Deep kicks still earn touchbacks, but a large share are fielded.
      const touchback = land >= 100 && Math.random() < 0.45;
      launchKick(xAtYd(Math.min(100, land)), directional, () => {
        if (touchback) {
          banner("TOUCHBACK", "Return team starts at the 25", 1.35);
          G.deadT = 1.35;
          G.deadNext = () => finishKickTouchback(25);
          G.state = "dead";
        } else {
          startKickReturn("KICKOFF", returnYd, Math.round(d));
        }
      });
      return;
    }
    if (k.kind === "PUNT") {
      let d = Math.round((22 + (k.power / 100) * (26 + leg * 0.22)) + G.weather.wind.x / YPX * 1.2);
      let land = G.losYd + d;
      let sub;
      // CPU punters deliberately take a little off to leave the ball around
      // the 5-14 instead of blindly booming it through the end zone.
      const pinTarget = k.cpu ? clamp(92 + rnd(-5, 3), 86, 96) : null;
      if (pinTarget != null && land > pinTarget) {
        land = pinTarget;
        d = Math.round(land - G.losYd);
      }
      if (land >= 100) { land = 100; sub = "Touchback."; }
      else if (k.cpu && land >= 86) sub = d + " yard coffin-corner punt — pinned at the " + Math.round(100 - land) + ".";
      else sub = d + " yard punt";
      const targetY = clamp(MID + G.weather.wind.y * 2 + rnd(-60, 60), TOP + 20, BOT - 20);
      launchKick(xAtYd(Math.min(100, land)), targetY, () => {
        if (land >= 100) {
          banner("PUNT", sub, 1.4);
          G.deadT = 1.4; G.deadNext = () => finishKickTouchback(25); G.state = "dead";
        } else {
          startKickReturn("PUNT", clamp(100 - land, 1, 26), d, targetY);
        }
      });
      return;
    }
    const fgDist = k.kind === "XP" ? 33 : Math.round(100 - G.losYd + 17);
    // the kicker's three tools: RANGE (leg), ACCURACY (his own talent — sets
    // how wide the make-window is), STAMINA (a weak motor fades in the 4th)
    const kacc = k.kicker.kacc || kickAccOf(k.kicker.name);
    const kstam = stamOf(k.kicker.name, "K");
    let range = 28 + leg * 0.32 + (k.power - 55) * 0.2;
    if (G.quarter >= 4) range -= (99 - kstam) * 0.05;
    const meter = kickMeterPlan(k);
    const accError = Math.abs(k.acc + G.weather.wind.y * 0.5);
    const accOk = accError < meter.accHalf;
    const good = fgDist <= range && accOk && Math.random() > 0.04 + (G.weather.kickMod ? Math.abs(G.weather.kickMod) : 0);
    const short = fgDist > range;                          // out of gas vs shanked
    // A ball that barely has enough leg or clips the edge of the aiming lane
    // can ping an upright and still tumble through.  It gives close kicks a
    // memorable result without turning misses into makes.
    const edgeKick = Math.abs(accError - meter.accHalf) < 2.5 || Math.abs(range - fgDist) < 1.2;
    const doink = good && edgeKick && Math.random() < 0.55;
    const postX = xAtYd(108);
    const toX = good ? postX + 30 : (short ? postX - rnd(60, 140) : postX + rnd(0, 30));
    const toY = good ? MID + rnd(-14, 14) : (short ? MID + rnd(-20, 20) : MID + (Math.random() < 0.5 ? -1 : 1) * rnd(48, 80));
    const drive0 = G.drive, losYd0 = G.losYd;
    launchKick(toX, clamp(toY, TOP + 12, BOT - 12), () => {
      if (k.kind === "XP") {
        if (good) { if (doink) sfx.doink(); G.score[drive0] += 1; banner(doink ? "DOINK!  EXTRA POINT GOOD" : "EXTRA POINT GOOD", doink ? "Off the upright and through!" : "", 1.4); }
        else banner("XP MISSED!", "The ptero shanks it!", 1.4);
        G.deadT = 1.5; G.deadNext = () => startKickoff(other(drive0));
      } else if (good) {
        if (doink) sfx.doink(); G.score[drive0] += 3; sfx.td(); crowdCheer(0.6);
        banner(doink ? "DOINK!  IT'S GOOD!" : "FIELD GOAL GOOD!", (doink ? "Off the upright — " : "") + fgDist + " yards by " + lastName(k.kicker.name), 1.8);
        G.deadT = 1.8; G.deadNext = () => startKickoff(other(drive0));
      } else {
        banner("FIELD GOAL MISSED", short ? "...it dies at the doorstep!" : fgDist + " yard attempt sails wide", 1.8);
        G.deadT = 1.8; G.deadNext = () => { changePossession(100 - losYd0); enterPlaycall(); };
      }
      G.state = "dead";
    });
  }

  function finishKickTouchback(spot) {
    G.kick = null; G.kickFly = null; G.returnPlay = null;
    changePossession(spot == null ? 25 : spot);
    enterPlaycall();
  }

  function startKickReturn(kind, startYd, kickY) {
    const kickingSide = G.drive;
    const receivingSide = other(kickingSide);
    const returnAb = teamAbbrOf(receivingSide);
    const kickAb = teamAbbrOf(kickingSide);
    const returnRoster = roster(returnAb);
    const kickRoster = roster(kickAb);
    const cleanYd = clamp(Math.round(startYd), 1, 26);
    // Flip the possession before building entities so the existing movement,
    // tackle, weather and player-control systems all understand who is
    // advancing.  Camera orientation remains consistent for the receiver.
    G.drive = receivingSide; G.losYd = cleanYd; G.down = 1; G.toGain = 10;
    G.driveStory = { side: G.drive, startYd: cleanYd, plays: 0 };
    const x0 = xAtYd(cleanYd);
    const y0 = clamp(kickY == null ? MID + rnd(-72, 72) : kickY, TOP + 24, BOT - 24);
    const P = [];
    const skill = (returnRoster.offense || []).filter((p) => p.role === "WR" || p.role === "RB" || p.role === "TE");
    const retP = skill.slice().sort((a, b) => ((b.spd || 75) + (b.agi || 75) * 0.35 + (b.hands || 75) * 0.2) - ((a.spd || 75) + (a.agi || 75) * 0.35 + (a.hands || 75) * 0.2))[0] || { name: "Return Dino", spd: 80, agi: 78, hands: 76, str: 72, stam: 84 };
    const ret = mkEnt("off", retP.role === "RB" ? "carno" : "veloci", retP.name, "RET", retP.spd || 80,
      { agi: retP.agi || 78, hands: retP.hands || 76, str: retP.str || 72, jump: retP.jump || 74, stam: retP.stam, stiff: retP.stiff });
    ret.x = x0; ret.y = y0; ret.state = "carry"; ret.returner = true; P.push(ret);
    const line = returnRoster.oline || [];
    const lanes = [[26, -100], [36, -60], [42, -20], [42, 20], [36, 60], [26, 100], [104, -112], [112, -56], [118, 0], [112, 56]];
    for (let i = 0; i < lanes.length; i++) {
      const [dx, dy] = lanes[i];
      const lp = line[i % Math.max(1, line.length)] || skill[i % Math.max(1, skill.length)] || { name: "Block Dino", spd: 72, str: 74, tkl: 74 };
      const species = i < 5 ? "trike" : (i % 2 ? "pachy" : "deino");
      const b = mkEnt("off", species, lp.name || "Block Dino", "BLK", Math.max(64, lp.spd || 70),
        { str: lp.str || 74, tkl: lp.tkl || 74, agi: lp.agi || 70, stam: lp.stam, blk: lp.blk || lp.str || 74 });
      b.x = x0 + dx; b.y = clamp(y0 + dy, TOP + 16, BOT - 16); b.state = "returnblock"; P.push(b);
    }
    const coverPool = (kickRoster.defense || []).concat(kickRoster.offense || []);
    for (let i = 0; i < 11; i++) {
      const dp = coverPool[i % Math.max(1, coverPool.length)] || { name: "Coverage Dino", spd: 80, tkl: 78, str: 76 };
      const d = mkEnt("def", i % 3 === 0 ? "allo" : i % 3 === 1 ? "deinony" : "spino", dp.name || "Coverage Dino", "COV", dp.spd || 80,
        { tkl: dp.tkl || 78, str: dp.str || 76, agi: dp.agi || 76, jump: dp.jump || 72, hands: dp.hands || 72, stam: dp.stam });
      d.x = x0 + 178 + (i % 3) * 18;
      d.y = clamp(TOP + 22 + i * ((BOT - TOP - 44) / 10), TOP + 16, BOT - 16);
      d.state = "returncover"; P.push(d);
    }
    G.players = P;
    G.ball = { mode: "held", holder: ret, x: ret.x, y: ret.y, z: 12 };
    G.carrier = null; G.controlled = null; G.kick = null; G.kickFly = null;
    // This happens before becomeCarrier so the returner is also contained
    // during setup; once the whistle starts, the carrier may still run out of
    // bounds and let checkBounds spot the ball correctly.
    resolvePlayerContacts();
    G.ball.x = ret.x + ret.dir * 8; G.ball.y = ret.y;
    G.curPlay = { name: kind + " RETURN", type: "return", tags: ["return"] };
    G.playPass = null; G.returnPlay = { kind, startYd: cleanYd, kickY: y0 };
    G.state = "live"; G.phase = "carry"; G.playT = 0;
    becomeCarrier(ret);
    banner(kind + " RETURN", "FIELD IT AT THE " + cleanYd + " — FIND A LANE", 1.1);
    G.camX = clamp(ret.x - W * 0.38, 0, FIELD_LEN - W);
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
        // Preserve the actual authored cel and its normalized progression so
        // replay GIFs do not regress into a rotated running sprite.
        pose: e.poseT > 0 ? e.pose : "",
        poseP: e.poseT > 0 ? clamp(1 - e.poseT / Math.max(0.01, e.poseDur || e.poseT || 0.5), 0, 0.999) : 0,
        diveCatch: e.catchDiveT > 0,
        impact: e.impactT > 0 ? e.impactT : 0, impactLead: !!e.impactLead,
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
  // Replays are shareable proof of the action art.  Preserve a clean half-
  // resolution of the 960×540 canvas instead of reducing the cel work to a
  // postage-stamp 240×135 export.
  const GIF_W = 480, GIF_H = 270, GIF_MAX_FRAMES = 120;
  function gifGrabFrame() {
    if (!G.gifCv) { G.gifCv = document.createElement("canvas"); G.gifCv.width = GIF_W; G.gifCv.height = GIF_H; }
    const g2 = G.gifCv.getContext("2d");
    g2.imageSmoothingEnabled = false;
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
    // Replays run in slow motion.  Starting on the final 2.5 seconds of the
    // live tape guarantees that the tackle/catch/turnover is actually inside
    // the finite, shareable GIF rather than spending its frame budget on a
    // routine route release.
    G.replay.i = Math.max(0, G.replay.frames.length - 150);
    banner("🎥 RECORDING…", "capturing the finish in crisp pixel art", 1.2);
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
  // Quetzalcoatlus packs deliberately contain two grounded walk frames
  // followed by two wings-open soar frames.  Keeping that split here prevents
  // an ordinary safety stride from ever sampling aerial art. The flight frames
  // are selected only while a real soar is active (or while the player is
  // explicitly holding the soar aim control).
  function selectGameplaySpriteFrame(spr, species, animT, soaring) {
    const count = Math.max(1, spr.n || 1);
    if (species === "quetz") {
      const groundCount = Math.min(2, count);
      if (soaring && spr.flight && spr.flight.n) {
        return { pack: spr.flight, fi: (animT * 8 | 0) % spr.flight.n };
      }
      if (soaring && count > groundCount) {
        return { pack: spr, fi: groundCount + ((animT * 8 | 0) % (count - groundCount)) };
      }
      return { pack: spr, fi: (animT * 7 | 0) % groundCount };
    }
    return { pack: spr, fi: (animT * 7 | 0) % count };
  }
  // Action art stays in the exact same compact 16×16 / 2px-grid language as
  // the run cycle.  Keeping the choice in one place is important: the player
  // renderer, replay renderer, ball anchor, and opaque-pixel collision pass
  // must all agree on the cel that is actually on screen.
  function poseState(e) {
    const pose = e && e.poseT > 0 ? e.pose : "";
    const duration = Math.max(0.01, e && (e.poseDur || e.poseT) || 0.5);
    return { pose, progress: pose ? clamp(1 - e.poseT / duration, 0, 0.999) : 0 };
  }
  function renderedPose(e, pose) {
    // A stretched reception owns a distinct forward-dive cel.  It is still
    // the same dinosaur body and grid, not a loose arm painted over a runner.
    if (e && e.catchDiveT > 0 && ["catch", "catchHigh", "catchLow"].includes(pose)) return "diveCatch";
    return pose;
  }
  function selectActionSpriteFrame(e, spr, wingsOpen) {
    const state = poseState(e);
    const pose = renderedPose(e, state.pose);
    // An intentional soar retains flight art. A normal safety jump is not a
    // soar, so its grounded high-point cel is allowed to take priority here.
    const action = !e.soarT && spr.actions && pose && spr.actions[pose];
    if (action && action.n) {
      return {
        pack: action,
        fi: Math.min(action.n - 1, Math.floor(state.progress * action.n)),
        pose,
        progress: state.progress,
        action: true,
      };
    }
    const base = selectGameplaySpriteFrame(spr, e.species, e.animT, wingsOpen);
    return Object.assign(base, { pose: state.pose, progress: state.progress, action: false });
  }
  function selectReplayActionFrame(spr, e) {
    const basePose = e.pose || "";
    const pose = e.diveCatch && ["catch", "catchHigh", "catchLow"].includes(basePose) ? "diveCatch" : basePose;
    const action = !e.soar && spr.actions && pose && spr.actions[pose];
    if (action && action.n) {
      return {
        pack: action,
        fi: Math.min(action.n - 1, Math.floor(clamp(e.poseP || 0, 0, 0.999) * action.n)),
        pose,
        progress: e.poseP || 0,
        action: true,
      };
    }
    const base = selectGameplaySpriteFrame(spr, e.sp, e.anim, !!e.soar);
    return Object.assign(base, { pose, progress: e.poseP || 0, action: false });
  }
  function spriteBallAnchor(pack, dir, fi, originX, originY, fallbackX, fallbackY) {
    const tracks = pack && pack.anchor && (pack.anchor[dir] || pack.anchor.R);
    const point = tracks && tracks.length ? tracks[fi % tracks.length] : null;
    const ball = point && point.ball;
    const ax = Array.isArray(ball) ? ball[0] : ball && ball.x;
    const ay = Array.isArray(ball) ? ball[1] : ball && ball.y;
    if (Number.isFinite(ax) && Number.isFinite(ay)) return { x: originX + ax, y: originY + ay };
    return { x: fallbackX, y: fallbackY };
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
      const spriteFrame = selectReplayActionFrame(spr, e);
      const pose = spriteFrame.pose;
      const poseProgress = spriteFrame.progress;
      const artPack = spriteFrame.pack;
      const img = (e.dir >= 0 ? artPack.R : artPack.L)[spriteFrame.fi];
      const drawW = artPack.w, drawH = artPack.h;
      const jumpAmp = 5 + Math.max(0, (e.jr || 60) - 55) * 0.2;
      const jump = e.jmp > 0 ? Math.sin((1 - e.jmp / 0.4) * Math.PI) * jumpAmp : 0;
      let poseX = 0, poseY = 0;
      if (!spriteFrame.action && (pose === "tackle" || pose === "dive")) {
        poseX = (e.dir >= 0 ? 1 : -1) * Math.round(6 * Math.min(1, poseProgress * 1.35));
        poseY = Math.round(3 * poseProgress);
      } else if (!spriteFrame.action && (pose === "tackled" || pose === "shoved")) {
        poseX = (e.dir >= 0 ? -1 : 1) * Math.round(4 * poseProgress);
        poseY = Math.round(4 * poseProgress);
      } else if (!spriteFrame.action && pose === "catchLow") poseY = 2;
      else if (!spriteFrame.action && pose === "stiff") poseX = (e.dir >= 0 ? 1 : -1) * 3;
      else if (!spriteFrame.action && pose === "throw") poseX = (e.dir >= 0 ? 1 : -1) * Math.round(2 * poseProgress);
      cx.fillStyle = "rgba(0,0,0,.28)";
      cx.fillRect(e.x - G.camX - 8, e.y + 2, 16, 4);
      const artX = Math.round(e.x - G.camX - drawW / 2 + poseX);
      const artY = Math.round(e.y - drawH + 6 - jump + poseY);
      if (e.prone && !["tackled", "shoved", "prone"].includes(pose)) { // laid-out aftermath
        cx.save(); cx.translate(e.x - G.camX, e.y); cx.rotate((e.dir >= 0 ? 1 : -1) * Math.PI / 2);
        cx.drawImage(img, -drawW / 2, -drawH + 6); cx.restore();
      } else if (e.spin > 0) { // mid spin-move / juke rotation
        cx.save(); cx.translate(e.x - G.camX, e.y - drawH / 2 + 3 - jump);
        cx.rotate((1 - e.spin / 0.32) * Math.PI * 2 * (e.dir >= 0 ? 1 : -1));
        cx.drawImage(img, -drawW / 2, -drawH / 2); cx.restore();
      } else {
        cx.drawImage(img, artX, artY);
      }
      if (f.ball.held && pose && Math.abs(f.ball.x - (e.x + (e.dir >= 0 ? 8 : -8))) < 18 && Math.abs(f.ball.y - e.y) < 12) {
        let bx = e.x - G.camX + (e.dir >= 0 ? 9 : -9), by = e.y - 15 - jump;
        if (pose === "catchHigh") by = e.y - 28 - jump;
        else if (pose === "catchLow") by = e.y - 8;
        else if (pose === "tackled" || pose === "shoved") { bx = e.x - G.camX + (e.dir >= 0 ? 5 : -5); by = e.y - 11; }
        const anchor = spriteBallAnchor(artPack, e.dir >= 0 ? "R" : "L", spriteFrame.fi,
          artX, artY, bx, by);
        bx = anchor.x; by = anchor.y;
        drawFootballAt(bx, by);
      }
      if (e.impact && e.impactLead) {
        drawPixelImpactBurst(e.x - G.camX + (e.dir >= 0 ? 7 : -7), e.y - 22, clamp(e.impact / 0.5, 0, 1));
      }
    }
    if (!f.ball.held) {
      cx.fillStyle = "rgba(0,0,0,.3)"; cx.fillRect(f.ball.x - G.camX - 5, f.ball.y - 2, 10, 4);
      drawFootballAt(f.ball.x - G.camX, f.ball.y - f.ball.z);
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
  const rampAvail = (side) => G.rampage[side] >= 100 &&
    (G.practice || !G.rampUsed || G.rampUsed[side] !== (G.quarter <= 2 ? 1 : 2));
  function tryRampage(cpu) {
    const side = cpu ? "B" : "A";
    if (G.rampage[side] < 100 || G.ramp || G.state !== "live") return;
    // ONE rampage per half, per team (practice field excepted)
    const half = G.quarter <= 2 ? 1 : 2;
    if (!G.practice && G.rampUsed && G.rampUsed[side] === half) {
      if (!cpu && !G.banner) banner("RAMPAGE SPENT", half === 1 ? "One per half — it recharges at halftime" : "One per half — that was it for today", 1.0);
      return;
    }
    const apex = G.players.find((e) => e.apex && sideOf(e) === side);
    if (!apex) return;
    if (apex.team === "off" && (G.carrier !== apex || G.phase !== "carry")) return;
    if (G.rampUsed) G.rampUsed[side] = half;
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
    if (S === "online_wait") { if (!G.online || G.online.phase !== "found") cancelMatch(); return; }
    if (S === "replay") { endReplay(); return; }   // tap anywhere skips the replay
    if (S === "halftime") {
      // corner chip skips; anywhere else acts (kick lock / dash jump)
      if (mouse.x > W - 130 && mouse.y < 46) { endHalftime(); return; }
      halftimePress();
      return;
    }
    if (S === "menu") { menuTapAt(mouse.x, mouse.y); return; }
    if (S === "qbs") { G.state = "menu"; return; }
    if (S === "tutorial") { G.tut = Math.min(TUT_PAGES.length - 1, (G.tut || 0) + 1); return; }
    if (S === "scout") { scoutClick(); return; }
    if (S === "editor") { editorClick(); return; }
    if (S === "offseason") { offseasonClick(); return; }
    if (S === "intro") { G.intro = null; G.state = "pregame"; return; }   // tap skips
    if (S === "pregame") { kickoffAfterPregame(); return; }
    if (S === "hub") {
      if (G.szn && G.szn.phase !== "done" && mouse.x > W / 2 - 90 && mouse.x < W / 2 + 90 && mouse.y > 448 && mouse.y < 482) { openUpgrade(); return; }
      if (G.szn && G.szn.phase === "done") hubKey("enter"); else startSeasonGame(); return;
    }
    if (S === "upgrade") { upgradeClick(); return; }
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
    if (S === "over") {   // tap = continue (box score first if it's open)
      if (G.showBox) { G.showBox = false; return; }
      onKey("enter"); return;
    }
    if (["career_create", "career_quiz", "career_draft"].includes(S)) { careerClick(S); return; }
    if (S === "live") {
      if (G.phase === "drop" && offenseIsUser() && G.ball.holder && G.ball.holder.role === "QB") {
        // slingshot passing: the press only plants your grip — you have to
        // PULL BACKWARD (bring the ball behind your head) to load the throw
        G.slingAnchor = { x: mouse.x, y: mouse.y }; G.aim = null;
      } else if (G.phase === "carry" && offenseIsUser() && G.carrier && G.carrier.canPass &&
        G.carrier.x < xAtYd(G.losYd)) {
        G.slingAnchor = { x: mouse.x, y: mouse.y }; G.aim = null; // halfback pass!
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
  // tap-through for the keyboard-first career screens (mobile parity)
  function careerClick(S) {
    if (S === "career_draft") { careerKey("enter"); return; }
    if (S === "career_quiz") {
      for (let i = 0; i < 4; i++) {
        if (Math.abs(mouse.y - (250 + i * 40 - 8)) < 20) { careerKey(String(i + 1)); return; }
      }
      return;
    }
    // career_create: tap a row to select it, tap the ◀/▶ side to cycle it,
    // tap the bottom prompt to move on to the DINOLICK
    if (mouse.y > 460) { careerKey("enter"); return; }
    for (let i = 0; i < 4; i++) {
      if (Math.abs(mouse.y - (150 + i * 50 - 8)) < 25) {
        const c = G.cflow;
        if (c.row !== i) { c.row = i; return; }        // first tap selects
        careerKey(mouse.x < W / 2 + 120 ? "arrowleft" : "arrowright");
        return;
      }
    }
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
  // A snowball makes its victim cold, blue, and slower for a few seconds.
  function snowballSplat(p) {
    for (const e of G.players) {
      if (dist(e, p) >= 15 || e.proneT > 0) continue;
      // Caleb Williams is the Iceman: snowballs bounce off his frozen visor.
      if (e.name === "Caleb Williams") {
        banner("ICEMAN!", "Caleb Williams shrugs off the snowball", 0.7);
        sfx.juke();
        break;
      }
      e.staggerT = Math.max(e.staggerT || 0, 0.28);
      e.coldT = Math.max(e.coldT || 0, 4.5);
      e.stamNow = Math.max(0, (e.stamNow == null ? 1 : e.stamNow) - 0.18);
      sfx.tackle();
      break;
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
      // ball in the air: ONE button matters — time the leap
      if (G.phase === "air" && G.ball.mode === "air" && !G.ball.away) {
        b.push({ id: "jump", label: "JUMP!", key: " ", x: W - 64, y: H - 84, r: 40 });
      } else if (offenseIsUser()) {
        if (G.phase === "drop") { add("bullet", "BULLET", " "); add("away", "THRWAWY", "x"); }
        else if (G.phase === "carry") { add("juke", "JUKE", "shift"); add("stiff", "STIFF", "f"); add("dive", "DIVE", "e"); add("lat", "LATRL", "q"); if (rampAvail("A")) add("ramp", "🦖", "r"); }
      } else {
        add("switch", "SWITCH", "tab"); add("jump", "JUMP", " "); add("dive", "DIVE", "e"); add("punch", "PUNCH", "f"); add("soar", "SOAR", "shift"); if (rampAvail("A")) add("ramp", "🦖", "r");
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
    if (G.state !== "live") { G.slingAnchor = null; return; }
    if (G.soarAim && G.controlled) {
      const cq = G.controlled;
      if (dist(cq, G.soarAim) < 34) doDive(cq);       // tap = tackle, not takeoff
      else startSoar(cq, G.soarAim);
      G.soarAim = null; return;
    }
    if (G.aim && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) throwLob();
    G.slingAnchor = null;
  }
  function onAltFire() {
    // a bullet needs a loaded arm too: right-click only fires while pulled back
    if (G.state === "live" && G.phase === "drop" && offenseIsUser() && G.aim) {
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
  // pull-back passing: drag AWAY from where you pressed (behind your head)
  // and the ball launches the OPPOSITE way — farther pull = deeper throw.
  function slingAim() {
    const qb = G.ball.holder;
    if (!qb || !G.slingAnchor) return null;
    const dx = G.slingAnchor.x - mouse.x, dy = G.slingAnchor.y - mouse.y;
    const pull = Math.hypot(dx, dy);
    if (pull < 14) return null;                    // a twitch isn't a windup
    const mr = maxRange();
    const k = Math.min(1, (pull - 14) / 150);      // ~165px pull = full range
    const len = 46 + k * (mr - 46);
    const p = { x: qb.x + (dx / pull) * len, y: clamp(qb.y + (dy / pull) * len, TOP + 6, BOT - 6) };
    p.x = clamp(p.x, xAtYd(-8), xAtYd(108));
    return p;
  }

  function onKey(k) {
    if (k === "m") { muted = !muted; return; }
    if (k === "h") { G.help = !G.help; return; }
    // Local visual-review shortcuts.  They are inert in normal play because
    // `qaMode` exists only when the URL explicitly asks for it.
    if (G.qaMode && ({ "1": "tackle", "2": "firstdown", "3": "catch", "4": "interception" }[k])) {
      stageHighlight({ "1": "tackle", "2": "firstdown", "3": "catch", "4": "interception" }[k]);
      return;
    }
    if (G.qaMode && k === "5") { qaExportFrame(); return; }
    if (k === "g" && G.state === "title") { G.gallery = !G.gallery; return; }
    if (G.state === "halftime" && (k === "enter" || k === "escape")) { endHalftime(); return; }
    if (G.state === "halftime" && k === " ") { halftimePress(); return; }
    if (G.state === "replay") {
      if (k === "g" && !G.gifRec) { gifStart(); return; }
      endReplay(); return;
    }
    if (k === "d" && G.state === "title") { G.diff = (G.diff + 1) % 3; saveRecord(); return; }
    if (k === "b" && !["title", "select", "live"].includes(G.state)) { G.showBox = !G.showBox; return; }
    if (k === "c" && G.state === "dead" && !G.challengeUsed) { throwChallenge(); return; }
    const S = G.state;
    if (S === "online_wait") { if (k === "escape") cancelMatch(); return; }
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
    if (S === "intro" && (k === "enter" || k === " " || k === "escape")) { G.intro = null; G.state = "pregame"; return; }
    if (S === "pregame" && (k === "enter" || k === " ")) { kickoffAfterPregame(); return; }
    if (S === "hub") { hubKey(k); return; }
    if (S === "standings" || S === "sznstats") { if (k === "enter" || k === "escape" || k === "b" || k === "s") G.state = "hub"; return; }
    if (S === "upgrade") { if (k === "escape" || k === "enter" || k === "u") G.state = "hub"; return; }
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
      // E is the dive button on defense too (click also dives)
      if (k === "e" && !offenseIsUser() && G.controlled) doDive(G.controlled);
      if (k === "q" && offenseIsUser() && G.carrier && G.controlled === G.carrier) lateral();
      // F — peanut punch (defense, near the carrier). It is an airborne swat:
      // jump or soar first, then time the strike at the ball.
      if (k === "f" && !offenseIsUser() && G.controlled) startPunch(G.controlled);
      // F with the ball = STIFF-ARM: a strength-vs-strength shove (0.35s window)
      if (k === "f" && offenseIsUser() && G.carrier && G.controlled === G.carrier) startStiffArm(G.carrier);
      if (k === " ") {
        if (G.aim && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) { throwBullet(); }
        // ball in the air: SPACE is a TIMED JUMP for receivers AND defenders —
        // a defender who times the leap can pick the pass off (dive still
        // works any other time)
        else if (G.ball.mode === "air" && G.controlled && (G.controlled.routeEligible || G.controlled.team === "def")) timedJump(G.controlled);
        // defense: SPACE is ALWAYS a jump (tackling lives on click / E)
        else if (!offenseIsUser() && G.controlled) timedJump(G.controlled);
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
      if (dd < 24 && closing > 33) {
        d.staggerT = 0.38 + Math.max(0, (e.agi - d.agi)) / 260;
      }
    }
  }
  function doDive(e) {
    if (e.diveT > 0 || e.proneT > 0) return;
    e.diveT = 0.3;
    // A dive is a short launch, not a faster walk sprite.  It lands before
    // the prone aftermath, while the compact action map keeps the dinosaur's
    // head, tail, torso, and hind legs anatomically intact.
    e.jumpT = Math.max(e.jumpT || 0, 0.34);
    playPose(e, "dive", 0.50);
  }
  // STIFF-ARM: the STRENGTH move. A short window where an incoming tackler
  // must win a muscle contest or eat turf. Timing it beats spamming it.
  function startStiffArm(e) {
    if (e.stiffCd > 0 || e.proneT > 0 || e !== G.carrier) return;
    e.stiffT = 0.35; e.stiffCd = 1.5; e.swingT = 0.3;
    playPose(e, "stiff", 0.52);
    sfx.juke();
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
    if (window.DINO_BOWL_FIREBASE_CONFIG) {
      opts.push(["QUICK MATCH", "auto-queue — get paired with a random player online"]);
      opts.push(["ONLINE (LINK)", "host a private game, share the link with a friend"]);
    }
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
    } else if (pick === "QUICK MATCH") {
      G.mode = "online"; G.selectFor = "exh"; G.career = null; G.humanB = true;
      startQuickMatch();     // sets G.state = "online_wait" and queues us
    } else if (pick === "ONLINE (LINK)") {
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
    if (k === "u") openUpgrade();
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
      if (!G.qaStill) update(dt);
      // 12 fps state replication is smooth for this pixel-art game while
      // leaving enough database headroom for player input.
      if (Net.role === "host" && Net.db && Net.room && G.state !== "online_wait" && t - Net.lastFrame > 83) {
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
        if (e.catchDiveT > 0) e.catchDiveT -= dt;
        tickTackleImpact(e, dt);
        if (e.poseT > 0) {
          e.poseT -= dt;
          if (e.poseT <= 0) { e.poseT = 0; e.pose = ""; }
        }
        // After the impact cel has shown the actual shoulder wrap, keep a
        // made-tackle carrier in the authored backward-fall cel. This avoids
        // dropping straight from contact into a rotated running sprite.
        if (e.tackleFallPending && e.proneT > 0 && e.poseT <= 0) {
          e.tackleFallPending = false;
          playPose(e, "prone", Math.max(0.14, Math.min(0.38, G.deadRecT + dt)));
        }
        // first-down celebration: pop back up and keep hopping while signalling
        if (e.fdCeleb > 0) {
          e.fdCeleb -= dt; e.proneT = 0;
          if (e.jumpT <= 0) e.jumpT = 0.45;
          if (e.pose !== "celebrate") playPose(e, "celebrate", e.fdCeleb);
          else e.poseT = Math.max(e.poseT || 0, e.fdCeleb);
          if (e.fdCeleb <= 0) e.fdCeleb = 0;
        }
      }
      if (G.celebrate) updateCelebration(dt);
      if (G.deadT <= 0 && G.deadNext) { const f = G.deadNext; G.deadNext = null; f(); }
      updateCamera(dt);
      return;
    }
    if (S === "intro") { G.intro.t += dt; if (G.intro.t > 6.4) { G.intro = null; G.state = "pregame"; } return; }
    if (S === "kick") { updateKick(dt); return; }
    if (S === "kickfly") { updateKickFly(dt); return; }
    if (S === "halftime") { updateHalftime(dt); return; }
    if (S === "replay") { updateReplay(dt); return; }
    if (S === "qa") { updateHighlight(dt); return; }
    if (S === "career_quiz" || S === "career_drill") { updateCareer(dt); return; }
    if (S !== "live") return;

    G.playT += dt;
    if (!G.practice && !G.patMode) G.clock = Math.max(0, G.clock - dt * 2.2);
    if (G.slingAnchor && mouse.down && (G.phase === "drop" || (G.phase === "carry" && G.carrier && G.carrier.canPass))) G.aim = slingAim();
    if (G.soarAim && mouse.down && !offenseIsUser()) G.soarAim = soarMouse();
    if (G.ramp) { G.ramp.t -= dt; if (G.ramp.t <= 0) G.ramp = null; }

    updateBall(dt);
    for (const e of G.players) updateEntity(e, dt);
    // All movement for this tick is now chosen.  Resolve physical body contact
    // before tackling so a hit happens shoulder-to-shoulder rather than after
    // two sprites have passed through one another.
    resolvePlayerContacts();
    checkTackles(dt);
    checkBounds();
    if (G.state !== "live") return;
    // No live play may silently run forever. At this point the ball has had
    // sixteen real seconds to cross a boundary, score, be caught, recovered,
    // or tackled; whistle its current spot and keep the game flowing.
    if (G.playT >= MAX_LIVE_PLAY_T) { playDead("WHISTLE", null, false); return; }
    updateCamera(dt);
    snapshotFrame();

    // handoff moment
    if (G.phase === "handoff" && G.playT > 0.35) {
      const rb = G.players.find((e) => e.role === "RB");
      becomeCarrier(rb);
      // the double-team: nearest interior defender to the lane gets washed
      const laneY = MID + ((G.curPlay && G.curPlay.lane) || 0) * 44;
      const dt2 = G.players.filter((e) => e.team === "def" && (e.role === "DL" || e.role === "EDGE"))
        .sort((a, b) => Math.abs(a.y - laneY) - Math.abs(b.y - laneY))[0];
      if (dt2 && dt2.staggerT <= 0) {
        dt2.staggerT = 0.55;
        dt2.y += dt2.y > laneY ? 12 : -12;
      }
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
        else if (G.playT < 0.7) qb.x -= 42 * dt;
        qb.y = clamp(qb.y, TOP + 8, BOT - 8);
        // QB crosses LOS -> becomes a runner
        if (qb.x > xAtYd(G.losYd) + 6) { becomeCarrier(qb); G.aim = null; }
        // sack timer safety: defenders handle it via tackles on holder
      }
    }
    // CPU rampage (offensive or defensive apex)
    if (rampAvail("B")) tryRampage(true);
    // flea flicker: the back auto-pitches it home to the QB
    if (G.curPlay && G.curPlay.flicker && !G.flickerDone && G.phase === "carry" &&
      G.carrier && G.carrier.role === "RB" && G.playT > 1.15) {
      const qb = G.players.find((p) => p.role === "QB");
      if (qb) doLateral({ x: qb.x, y: qb.y });
    }
    // QB dropbacks and a few scripted exchanges happen after the main AI pass.
    // Run the same solve once more so the state that is actually rendered at
    // the end of this tick cannot reintroduce a backfield overlap.
    if (G.state === "live") resolvePlayerContacts();
    // clock expiry mid-drive
    if (G.clock <= 0 && G.phase === "idle") endQuarter();
  }

  function updateCamera(dt) {
    const b = G.ball;
    // the camera stays glued to the football — including a LOOSE fumble
    // bouncing on the turf — so you always see who actually falls on it
    const target = G.carrier || (b && (b.mode === "air" || b.mode === "loose" || b.mode === "kickfly") ? b : b && b.holder) || { x: xAtYd(G.losYd) };
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
        // A throw still clears defenders, but no longer climbs into a
        // moon-ball.  Lower apex + quicker descent make the receiver/DB race
        // legible and reward leading a route rather than floating it forever.
        const h = clamp(d * 0.17, 20, 74);
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
      // Start the catch read before the hop.  This gives a dino time to load
      // its hind legs and raise its claws toward a descending pass, while the
      // existing jump timing below remains the gameplay authority.  In other
      // words: the animation anticipates the ball; it never grants a catch.
      if ((b.kind === "lob" || b.kind === "bullet") && !b.catchCue && k >= 0.52 &&
        !b.away && b.to.y > TOP + 4 && b.to.y < BOT - 4) {
        b.catchCue = true;
        const recCue = eligible().map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        const defCue = G.players.filter((e) => e.team === "def")
          .map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        const cuePose = b.kind === "lob" ? "catchHigh" : "catchLow";
        const cueDur = clamp((b.T - b.t) + 0.18, 0.40, 0.72);
        if (recCue && recCue.d < 60) playPose(recCue.e, cuePose, cueDur);
        if (defCue && defCue.d < 60) playPose(defCue.e, cuePose, cueDur);
      }
      // as the pass arrives, the nearest receiver and nearest defender both leap
      // (nobody leaps for a throwaway or a ball landing out of bounds)
      if ((b.kind === "lob" || b.kind === "bullet") && !b.contested && k > 0.8 &&
        !b.away && b.to.y > TOP + 4 && b.to.y < BOT - 4) {
        b.contested = true;
        const rec = eligible().map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        const df = G.players.filter((e) => e.team === "def")
          .map((e) => ({ e, d: dist(e, b.to) })).sort((a, c2) => a.d - c2.d)[0];
        // YOUR receiver waits for YOU: no reflex jump here for the controlled
        // dino — his late autopilot hop happens just before the ball lands
        if (rec && rec.d < 44 && !rec.e.controlled) rec.e.jumpT = 0.4;
        if (df && df.d < 44 && !df.e.controlled) df.e.jumpT = 0.4;
      }
      // controlled receiver never pressed JUMP → a late, slightly-off
      // autopilot hop (worse odds than timing it yourself with SPACE)
      if (k > 0.93 && !b.autoJumpDone && !b.away) {
        b.autoJumpDone = true;
        const cc2 = G.controlled;
        if (cc2 && cc2.routeEligible && cc2.jumpT <= 0 && !cc2.jumpTimed && !cc2.jumpMistimed &&
          dist(cc2, b.to) < 44) {
          cc2.jumpT = 0.4; cc2.autoJumped = true;
        }
      }
      if (k >= 1) {
        if (b.to.y <= TOP || b.to.y >= BOT) { incomplete(b.to); return; } // throwaway OOB
        resolveArrival();
      }
    }
  }

  // -------------------------------------------------------------- entity AI
  function updateEntity(e, dt) {
    e.prevX = e.x;
    e.animT += dt * (Math.hypot(e.vx, e.vy) > 10 ? 7 : 2);
    if (e.throwT > 0) e.throwT -= dt;   // cosmetic timers always tick
    if (e.spinT > 0) e.spinT -= dt;
    if (e.swingT > 0) e.swingT -= dt;
    if (e.catchDiveT > 0) e.catchDiveT -= dt;
    if (e.jumpT > 0) e.jumpT -= dt;
    if (e.poseT > 0) {
      e.poseT -= dt;
      if (e.poseT <= 0) { e.poseT = 0; e.pose = ""; }
    }
    if (e.impactT > 0) e.impactT -= dt;
    tickTackleImpact(e, dt);
    if (e.coldT > 0) e.coldT = Math.max(0, e.coldT - dt);
    // a soaring quetzalcoatlus is UNSTOPPABLE mid-flight: blocks, jukes and
    // shoves don't ground it — it tackles from the air. Checked before
    // stagger/prone so contact can never freeze a flight in place.
    if (e.soarT > 0) {
      e.staggerT = 0; e.proneT = 0;
      e.soarT -= dt;
      const fsp = e.spd * 1.9 * (G.weather ? G.weather.speedMod : 1) * (e.coldT > 0 ? 0.78 : 1);
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
    if (e.stiffT > 0) e.stiffT -= dt;
    if (e.stiffCd > 0) e.stiffCd -= dt;

    let passMod = 1;
    if (e.apex) {
      if (e.passive === "escape" && e === G.carrier) passMod = 1.08;         // scrambling QB
      if ((e.passive === "sack" || e.passive === "wall") && e.state === "rush") passMod = 1.12;
    }
    // STAMINA: long carries burn noticeably harder than routes. A back or WR
    // who has run 20+ yards with the ball loses top-end speed before a fresh
    // defender does, while high-stamina players merely fade more gradually.
    const vNow = Math.hypot(e.vx, e.vy);
    if (vNow > e.spd * 0.82) e.stamNow = Math.max(0, (e.stamNow == null ? 1 : e.stamNow) - dt / (3.2 + ((e.stam || 80) - 60) * 0.1));
    else e.stamNow = Math.min(1, (e.stamNow == null ? 1 : e.stamNow) + dt * 0.45);
    if (e === G.carrier) e.carryT = (e.carryT || 0) + dt;
    const tired = e.stamNow < 0.55 ? (0.92 - (0.55 - e.stamNow) * 0.32) : 1;
    const longCarryFade = e === G.carrier ? clamp(((e.carryT || 0) - 2.2) * 0.05, 0, 0.18) : 0;
    const burst = (e === G.carrier && !G.playPass && (e.carryT || 0) < 1.2) ? 1.12 : 1;   // hitting the hole
    const speedMod = G.weather.speedMod * (e.jukeT > 0 ? 0.92 : 1) * (e.diveT > 0 ? 1.9 : 1) *
      (G.ramp && G.ramp.ent === e ? 1.28 : 1) * (e.soarT > 0 ? 1.9 : 1) * passMod * tired * (1 - longCarryFade) * (e.coldT > 0 ? 0.78 : 1) * burst;
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

    // --- offense plays the ball like it matters: the nearest teammate works
    // toward a lateral in flight, and skill players fall on a loose ball
    if (e.team === "off" && e.role !== "OL" && e !== G.ball.holder) {
      if (G.ball.mode === "air" && G.ball.kind === "lateral") {
        const near2 = G.players.filter((p) => p.team === "off" && p.role !== "OL" && p.proneT <= 0)
          .sort((a, b) => dist(a, G.ball.to) - dist(b, G.ball.to))[0];
        if (near2 === e) { moveToward(e, G.ball.to, sp, dt); return; }
      }
      if (G.ball.mode === "loose" && dist(e, G.ball) < 170 && e.proneT <= 0) {
        moveToward(e, G.ball, sp, dt); return;
      }
    }
    // --- AI by state
    switch (e.state) {
      case "route": {
        // press at the line: a corner in your chest jams the release — a
        // quick hand-fight decides who wins the first two steps. Only right
        // off the snap, only near the line, never once the ball is gone.
        if (G.playT < 0.45 && !e.pressDone && G.ball.mode === "held" &&
          Math.abs(e.x - xAtYd(G.losYd)) < 34) {
          const jam = G.players.find((p) => p.team === "def" && p.coverSlot === e.role &&
            dist(p, e) < bodyContactRange(p, e, 3));
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
          const gap = bodyContactRange(e, r2, 1);
          moveToward(e, { x: r2.x + (e.team === "off" ? -gap : gap), y: r2.y }, sp * 1.05, dt);
          break;
        }
        if (e.engaged && G.ramp && G.ramp.ent === e.engaged) { e.engaged.blockedBy = null; e.engaged = null; e.staggerT = 0.8; }
        const rushers = G.players.filter((p) => p.team !== e.team && p.state === "rush" && !p.blockedBy && !(p.freeT > 0) && !(G.ramp && G.ramp.ent === p));
        rushers.sort((a, b) => dist(a, e) - dist(b, e));
        if (!rushers[0] || dist(rushers[0], e) > 120) {
          // Nothing is immediately in the gap: the five blockers move as a
          // *unit*.  On a pass they keep a clean U-shaped pocket around the
          // QB; on a run they climb in staggered lanes ahead of the carrier
          // instead of becoming five unrelated homing missiles.
          const esc = G.carrier && G.carrier.team === e.team ? G.carrier : G.ball.holder;
          if (esc) {
            const slot = e.lineSlot == null ? 2 : e.lineSlot;
            const offset = e.lineOffset == null ? (slot - 2) * 32 : e.lineOffset;
            if (G.phase === "carry" && esc === G.carrier) {
              const laneX = 26 + Math.abs(slot - 2) * 9;
              const laneY = clamp(esc.y + offset * 0.72, TOP + 18, BOT - 18);
              moveToward(e, { x: esc.x + laneX, y: laneY }, sp * 0.84, dt);
            } else {
              moveToward(e, { x: esc.x + 34, y: clamp(esc.y + offset, TOP + 18, BOT - 18) }, sp * 0.72, dt);
            }
          }
          break;
        }
        if (rushers[0] && dist(rushers[0], e) < 120) {
          const qb = G.ball.holder || e;
          const mid = { x: (rushers[0].x + qb.x) / 2, y: (rushers[0].y + qb.y) / 2 };
          moveToward(e, mid, sp * 0.9, dt);
          if (dist(e, rushers[0]) < bodyContactRange(e, rushers[0], 2)) {
            const r0 = rushers[0];
            e.engaged = r0; r0.blockedBy = e;
            // trench battle: blocker STRENGTH vs rusher STRENGTH decides how
            // long the block holds — but no block survives past 1.7s, and an
            // elite rusher occasionally wins the rep instantly and runs free
            const diff2 = ((e.blk || e.str || 75) - (r0.str || 75)) / 40;
            // A block needs a readable beat before a shed.  The added base
            // duration offsets the wider physical bodies without returning to
            // the old frozen-pocket behavior; ratings and elite rush moves
            // still decide the quick wins below.
            let hold = clamp(0.45 + rnd(0.45, 0.9) * (1 + diff2), 0.70, 2.0);
            // drive blocking: on a RUN play the line stays latched longer
            if (G.curPlay && G.curPlay.type === "run") hold = clamp(hold + 0.9, 1.4, 2.0);
            const eliteEdge = (r0.str || 75) - (e.blk || e.str || 75);
            // every rusher can occasionally win his rep quickly; elites do it often
            if (Math.random() < 0.08) hold = Math.min(hold, rnd(0.6, 1.0));
            if (eliteEdge > 4 && Math.random() < 0.22 + eliteEdge * 0.014) hold = rnd(0.5, 0.8);
            if (r0.apex && (r0.passive === "sack" || r0.passive === "wall") && Math.random() < 0.25) hold = Math.min(hold, rnd(0.55, 0.85));
            r0.engageT = hold;
          }
        }
        break;
      }
      case "rush": {
        const tgt = G.carrier || G.ball.holder;
        if (e.freeT > 0) e.freeT -= dt;
        if (e.blockedBy) {
          // A stationary human QB cannot keep a five-man pocket pristine
          // forever.  After a real coverage beat, a rusher visibly sheds and
          // gets a clean lane instead of repeatedly re-engaging in place.
          // The freeT cooldown below prevents an immediate re-block.
          const pocketCollapsing = G.drive === "A" && !G.humanB &&
            // Let a cleanly won block breathe before pocket compression
            // begins.  A quarterback who holds the ball too long still gets
            // pressure, but no rusher sheds on the same beat he engages.
            G.phase === "drop" && G.playT > 2.85;
          if (pocketCollapsing) e.engageT = Math.min(e.engageT, 0.18);
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
            e.blockedBy.engaged = null; e.blockedBy = null;
            e.freeT = pocketCollapsing ? 3.2 : 2.5;
            // Once free, bend around the pocket rather than repeatedly
            // walking straight into the nearest lineman. This is a real
            // pursuit lane, not a pass-through: the contact solver still
            // keeps the rusher outside every body.
            if (qb2 && G.phase === "drop") {
              e.rushBypass = true;
              e.rushLane = e.y <= qb2.y ? -1 : 1;
            }
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
        else if (tgt) {
          // Winning a physical rep creates a short clean-lane burst.  Without
          // it, the new body solver can make a freed rusher drift beside the
          // pocket instead of closing it, even though no blocker remains.
          const rushSp = G.phase === "drop" ? (e.freeT > 0 ? 1.40 : 1.16) : 0.82;
          let rushTgt = tgt;
          if (e.freeT > 0 && e.rushBypass && tgt.role === "QB") {
            const laneY = clamp(tgt.y + (e.rushLane || 1) * 72, TOP + bodyRadius(e), BOT - bodyRadius(e));
            // Cross the QB's outside shoulder before turning upfield.  Targeting
            // a point just behind him makes the curve clear the U-shaped pocket
            // while retaining an honest, visible approach to the sack.
            if (e.x > tgt.x + 8 || Math.abs(e.y - laneY) > 10) {
              rushTgt = { x: tgt.x - 8, y: laneY };
            } else {
              e.rushBypass = false;
            }
          }
          moveToward(e, rushTgt, sp * rushSp, dt);
        }
        break;
      }
      case "read": { // linebackers: read-and-react — crash the run, wall the pass
        const tgt = G.carrier;
        if (tgt) {
          // run fit: trigger DOWNHILL hard while the back is still in the box
          // (a run-stuff call sends them downhill even harder)
          const qbSneak = tgt.role === "QB" && G.curPlay && G.curPlay.qbKeep;
          // The QB has shown the keep now, so a prepared front can trigger
          // immediately.  This is intentionally after the visual commitment,
          // never a pre-snap read of a fake-pass card.
          const crash = (qbSneak ? 1.12 : (tgt.x < xAtYd(G.losYd) + 30 ? 0.9 : 0.87)) *
            (e.runStuff ? (qbSneak ? 1.22 : 1.12) : 1);
          pursue(e, tgt, sp * crash, dt);
        }
        else if (G.ball.mode === "air" && breakOnBall(e, sp, dt)) { /* playing the ball */ }
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
        if (G.ball.mode === "air" && breakOnBall(e, sp, dt)) break;
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
        // trail technique: near-hip leverage, but human — a step slow to
        // mirror, so a crisp route break buys the receiver real separation
        moveToward(e, { x: tgt.x + bodyContactRange(e, tgt, 1), y: tgt.y }, sp * 0.99, dt);
        break;
      }
      case "zone": {
        if (G.ball.mode === "air" && breakOnBall(e, sp, dt)) break;
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
      case "returncover": {
        const c = G.carrier;
        if (!c) { moveToward(e, { x: e.x - 55, y: e.y }, sp, dt); break; }
        // Coverage keeps its lane until the returner declares, then folds in
        // at an angle.  Eleven separate lanes prevent the old one-at-a-time
        // chase that made special teams look like a regular offensive snap.
        const laneY = TOP + 22 + (e.y - TOP) * 0.92;
        const depth = c.x < e.x - 52 ? e.x - 34 : c.x + 8;
        const target = { x: depth, y: c.y * 0.62 + laneY * 0.38, vx: c.vx, vy: c.vy };
        pursue(e, target, sp * (c.x > e.x - 80 ? 1.08 : 0.91), dt);
        break;
      }
      case "returnblock": {
        const c = G.carrier;
        if (!c) { moveToward(e, { x: e.x + 42, y: e.y }, sp * 0.85, dt); break; }
        const cover = G.players.filter((p) => p.team !== e.team && p.state === "returncover" && p.staggerT <= 0)
          .sort((a, b) => (dist(a, c) + Math.max(0, c.x - a.x) * 0.35) - (dist(b, c) + Math.max(0, c.x - b.x) * 0.35))[0];
        if (cover && cover.x > c.x - 20 && dist(cover, c) < 175) {
          const shield = { x: cover.x - bodyContactRange(e, cover, 1), y: cover.y };
          moveToward(e, shield, sp * 1.02, dt);
          if (dist(e, cover) < bodyContactRange(e, cover, 2)) {
            cover.staggerT = Math.max(cover.staggerT || 0, 0.16);
            cover.vx *= 0.34; cover.vy *= 0.34;
          }
        } else {
          moveToward(e, { x: c.x + 48, y: c.y + (e.y - c.y) * 0.58 }, sp * 0.9, dt);
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
          if (dist(e, threat) < bodyContactRange(e, threat, 2)) { threat.staggerT = 0.9; e.staggerT = 0.35; sfx.tackle(); }
        } else moveToward(e, { x: c.x + 40, y: c.y }, sp * 0.98, dt);
        break;
      }
      case "runblock": { // receiver on a run play: release + stalk-block a DB
        // on the SWEEP PASS the receivers sell the block... then sneak out deep
        if (G.curPlay && G.curPlay.sweepPass && G.playT > 0.9 && !e.leaked) {
          e.leaked = true; e.state = "route";
          e.path = [{ x: e.x + 10 * YPX, y: clamp(e.y + (e.y < MID ? -40 : 40), TOP + 12, BOT - 12) }];
          e.pathI = 0; e.endMode = "go";
          // the sold block WORKED: nearby DBs bit on the run and freeze a beat
          for (const d2 of G.players) {
            if (d2.team !== e.team && ["CB", "S", "LB"].includes(d2.role) &&
              dist(d2, e) < 95 && d2.staggerT <= 0 && d2.soarT <= 0) d2.staggerT = 0.55;
          }
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
          const side = b2.x > ref.x ? -bodyContactRange(e, b2, 1) : bodyContactRange(e, b2, 1);
          moveToward(e, { x: b2.x + side, y: b2.y }, sp * 0.95, dt);
          if (dist(e, b2) < bodyContactRange(e, b2, 2)) {
            b2.vx *= 0.5; b2.vy *= 0.5; if (b2.staggerT <= 0) b2.staggerT = 0.12;
            // stalk blocks obey the trench rules too: strength decides how long
            // the pin lasts, and nothing stays blocked past 1.7 seconds
            e.blockHold = (e.blockHold || 0) + dt;
            const cap = clamp(0.9 + ((e.str || 68) - (b2.str || 70)) / 40, 0.45, 1.7);
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

  // ---------------------------------------------------------------- contact physics
  // Movement AI deliberately only chooses a desired velocity.  After every
  // entity has moved, this small position-based solve separates every pair of
  // bodies.  Doing it as a shared pass (rather than in the individual AI
  // branches) prevents update-order bias: a DB cannot slip through a WR just
  // because he happened to update first this frame.
  function bodyRadius(e) {
    let r = e.bodyR || BODY_PROFILES.default.r;
    // A rampaging dino swaps to the double-size T-rex art, so its physical
    // footprint must grow with it.  A prone dino still occupies turf, but its
    // laid-out body is a shallower obstacle than an upright one.
    if (G.ramp && G.ramp.ent === e) r *= 1.34;
    if (e.proneT > 0) r *= 0.72;
    return r;
  }
  function bodyMass(e) {
    let m = e.bodyMass || BODY_PROFILES.default.mass;
    if (G.ramp && G.ramp.ent === e) m *= 1.45;
    if (e.staggerT > 0) m *= 1.18;
    if (e.proneT > 0) m *= 1.35;
    if (e.soarT > 0) m *= 1.16;
    return m;
  }
  // `pad` is reach beyond actual body-to-body contact (hands, a diving
  // shoulder, etc.).  The default is true physical contact with no overlap.
  function bodyContactRange(a, b, pad) {
    // The two extra pixels are visual clearance: a valid collision must not
    // look like two complete sprite silhouettes are occupying the same turf.
    return bodyRadius(a) + bodyRadius(b) + 2 + (pad || 0);
  }
  // The physical solver owns torsos and momentum; this compact-mask pass
  // owns the art. A circle alone can be correct for a raptor's hips while a
  // diagonal tail or horn still clips another painted sprite. Keeping the
  // two stages separate preserves natural football spacing in formations and
  // adds a one-pixel visual seam only where the actual opaque maps touch.
  function compactVisualPlacement(e, spr, actionArt) {
    const state = poseState(e);
    const pose = renderedPose(e, state.pose);
    const poseProgress = state.progress;
    const jumpAmp = 5 + Math.max(0, (e.jump || 60) - 55) * 0.2 + (pose === "catchHigh" ? 6 : 0);
    const jump = e.jumpT > 0 ? Math.sin((1 - e.jumpT / 0.4) * Math.PI) * jumpAmp : 0;
    let poseX = 0, poseY = 0;
    // The authored compact cels already contain a planted shoulder, tail
    // counterbalance, reaching claws, and a real fall. Retain the old small
    // offsets only as a compatibility fallback for a missing cel; otherwise
    // do not slide a running sprite under the new action art.
    if (!actionArt && (pose === "tackle" || pose === "dive")) {
      poseX = e.dir * Math.round(6 * Math.min(1, poseProgress * 1.35));
      poseY = Math.round(3 * poseProgress);
    } else if (!actionArt && (pose === "tackled" || pose === "shoved")) {
      poseX = -e.dir * Math.round(4 * poseProgress);
      poseY = Math.round(4 * poseProgress);
    } else if (!actionArt && pose === "catchLow") {
      poseY = 2;
    } else if (!actionArt && pose === "stiff") {
      poseX = e.dir * 3;
    } else if (!actionArt && pose === "throw") {
      poseX = e.dir * Math.round(2 * poseProgress);
    }
    return {
      pose, jump, poseX, poseY,
      x: Math.round(e.x - spr.w / 2 + poseX),
      y: Math.round(e.y - spr.h + 6 - jump + poseY),
    };
  }
  function visualFootprint(e) {
    const sheet = G.sheets && G.sheets[teamOf(e)];
    if (!sheet) return null;
    const ramping = G.ramp && G.ramp.ent === e;
    const spr = ramping ? sheet.rampage : sheet[e.species];
    if (!spr || !spr.mask) return null;
    const wingsOpen = e.species === "quetz" &&
      (e.soarT > 0 || (G.soarAim && e === G.controlled));
    const spriteFrame = selectActionSpriteFrame(e, spr, wingsOpen);
    const artPack = spriteFrame.pack || spr;
    const p = compactVisualPlacement(e, artPack, spriteFrame.action);
    // The 90-degree whistle fall and spin are intentionally short-lived.
    // Their conservative boxes are only a fallback; upright dinos use their
    // exact per-frame opaque pixel maps below.
    if (e.proneT > 0 && !["tackled", "shoved", "prone"].includes(p.pose)) {
      return { e, x: Math.round(e.x - spr.h / 2), y: Math.round(e.y - spr.w / 2), w: spr.h, h: spr.w, box: true };
    }
    if (e.spinT > 0) {
      const side = Math.ceil(Math.hypot(spr.w, spr.h));
      return { e, x: Math.round(e.x - side / 2), y: Math.round(e.y - side / 2), w: side, h: side, box: true };
    }
    const dir = e.dir >= 0 ? "R" : "L";
    const maskPack = artPack && artPack.mask ? artPack : spr;
    const frames = maskPack.mask[dir] || maskPack.mask.R;
    const mask = frames && frames[spriteFrame.fi % frames.length];
    if (!mask) return null;
    return { e, x: p.x, y: p.y, w: mask.w, h: mask.h, rows: mask.rows, box: false };
  }
  function footprintSpansAt(f, y, pad) {
    pad = pad || 0;
    if (f.box) return [[f.x - pad, f.x + f.w + pad]];
    const local = y - f.y;
    const spans = [];
    for (let sy = local - pad; sy <= local + pad; sy++) {
      if (sy < 0 || sy >= f.h) continue;
      for (const [a, b] of f.rows[sy]) spans.push([f.x + a - pad, f.x + b + pad]);
    }
    return spans;
  }
  function footprintsOverlap(a, b, pad) {
    pad = pad || 0;
    if (a.x + a.w + pad <= b.x - pad || b.x + b.w + pad <= a.x - pad ||
      a.y + a.h + pad <= b.y - pad || b.y + b.h + pad <= a.y - pad) return false;
    const top = Math.max(a.y - pad, b.y - pad), bot = Math.min(a.y + a.h + pad, b.y + b.h + pad);
    for (let y = top; y < bot; y++) {
      const ar = footprintSpansAt(a, y, pad), br = footprintSpansAt(b, y, pad);
      for (const [as, ae] of ar) for (const [bs, be] of br) if (as < be && bs < ae) return true;
    }
    return false;
  }
  function visualMasksOverlap(a, b, pad) {
    const fa = visualFootprint(a), fb = visualFootprint(b);
    return !!(fa && fb && footprintsOverlap(fa, fb, pad));
  }
  function shiftedFootprint(f, dx, dy) {
    return Object.assign({}, f, { x: f.x + dx, y: f.y + dy });
  }
  function visualSeparation(a, b, fa, fb) {
    const sx = b.x >= a.x ? 1 : -1, sy = b.y >= a.y ? 1 : -1;
    const dirs = [{ x: sx, y: 0 }, { x: -sx, y: 0 }, { x: 0, y: sy }, { x: 0, y: -sy }];
    let best = null;
    const maxStep = Math.max(fa.w + fb.w, fa.h + fb.h) + 4;
    for (const dir of dirs) {
      for (let n = 1; n <= maxStep; n++) {
        if (!footprintsOverlap(fa, shiftedFootprint(fb, dir.x * n, dir.y * n), 1)) {
          if (!best || n < best.n) best = { x: dir.x, y: dir.y, n };
          break;
        }
      }
    }
    return best;
  }
  function resolveVisualSpriteContacts() {
    if (!G.sheets || !G.players || G.players.length < 2) return;
    // A few passes are enough because the torso solve already removed the
    // large overlap. This only nudges the rare diagonal horn/tail collision.
    let corrected = false;
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (let i = 0; i < G.players.length; i++) {
        const a = G.players[i]; if (!a) continue;
        for (let j = i + 1; j < G.players.length; j++) {
          const b = G.players[j]; if (!b) continue;
          // Match the torso solver's narrowly scoped tackle exception. The
          // exact opaque-pixel pass still protects every non-tackle pair.
          if (isIntentionalTacklePair(a, b)) continue;
          const fa = visualFootprint(a), fb = visualFootprint(b);
          // Only enter the corrective pass for a real opaque-pixel collision.
          // The chosen separation still leaves a one-pixel seam, but dinos
          // that are already cleanly adjacent do not get needlessly pushed
          // into another formation partner.
          if (!fa || !fb || !footprintsOverlap(fa, fb, 0)) continue;
          const sep = visualSeparation(a, b, fa, fb);
          if (!sep) continue;
          const ia = 1 / Math.max(0.01, bodyMass(a)), ib = 1 / Math.max(0.01, bodyMass(b));
          const total = ia + ib;
          // Whole-pixel correction keeps the exact same placement used by the
          // renderer from flickering between a clear seam and a one-pixel clip.
          const da = Math.max(1, Math.ceil(sep.n * ia / total));
          const db = Math.max(1, Math.ceil(sep.n * ib / total));
          a.x -= sep.x * da; a.y -= sep.y * da;
          b.x += sep.x * db; b.y += sep.y * db;
          constrainBodyToField(a); constrainBodyToField(b);
          moved = true; corrected = true;
        }
      }
      if (!moved) break;
    }
    return corrected;
  }
  function constrainBodyToField(e) {
    // A ball carrier is intentionally allowed to cross a sideline/end line so
    // checkBounds can whistle the play dead.  Everyone else stays physically
    // inside the painted field instead of being displaced into the stands.
    if (e === G.carrier) return;
    const r = bodyRadius(e);
    e.x = clamp(e.x, r, FIELD_LEN - r);
    e.y = clamp(e.y, TOP + r, BOT - r);
  }
  function settleContactVelocity(a, b, nx, ny) {
    // Keep positional correction from turning into a visible frame-by-frame
    // buzz.  We only erase the component moving INTO the other body; tangential
    // motion remains, so route releases and pursuit angles still feel alive.
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const closing = rvx * nx + rvy * ny;
    if (closing >= 0) return;
    const ia = 1 / Math.max(0.01, bodyMass(a));
    const ib = 1 / Math.max(0.01, bodyMass(b));
    const impulse = (-closing * 0.72) / (ia + ib);
    a.vx -= nx * impulse * ia; a.vy -= ny * impulse * ia;
    b.vx += nx * impulse * ib; b.vy += ny * impulse * ib;
  }
  function resolveBodyContacts(players, iterations, settleVelocity) {
    for (let pass = 0; pass < iterations; pass++) {
      for (let i = 0; i < players.length; i++) {
        const a = players[i];
        if (!a) continue;
        for (let j = i + 1; j < players.length; j++) {
          const b = players[j];
          if (!b) continue;
          // Only the named driver/carrier pair of an active completed tackle
          // may share space. Formation traffic, loose-ball scrums, and every
          // other player pair continue through the full physical solver.
          if (isIntentionalTacklePair(a, b)) continue;
          const minD = bodyContactRange(a, b);
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD) continue;
          const qb = G.phase === "drop" && G.ball && G.ball.holder;
          if (qb === a && b.team === "def") {
            b.qbContact = true; b.qbContactAt = G.playT;
          }
          if (qb === b && a.team === "def") {
            a.qbContact = true; a.qbContactAt = G.playT;
          }
          // The same latch applies to a ball carrier. A clean shoulder-to-
          // shoulder arrival must still become a tackle after separation.
          if (G.carrier === a && b.team !== a.team) {
            b.carrierContact = true; b.carrierContactAt = G.playT;
          }
          if (G.carrier === b && a.team !== b.team) {
            a.carrierContact = true; a.carrierContactAt = G.playT;
          }
          let d = Math.sqrt(d2), nx, ny;
          if (d > 0.0001) {
            nx = dx / d; ny = dy / d;
          } else {
            // Exact coincident centers occur on scripted catches/recoveries.
            // Choose a stable, deterministic normal rather than injecting a
            // random visual pop every replay.
            nx = ((a.bodyId + b.bodyId) & 1) ? 1 : -1; ny = 0; d = 0;
          }
          const overlap = minD - d;
          const ia = 1 / Math.max(0.01, bodyMass(a));
          const ib = 1 / Math.max(0.01, bodyMass(b));
          const total = ia + ib;
          a.x -= nx * overlap * (ia / total); a.y -= ny * overlap * (ia / total);
          b.x += nx * overlap * (ib / total); b.y += ny * overlap * (ib / total);
          if (settleVelocity && pass === 0) settleContactVelocity(a, b, nx, ny);
        }
      }
      for (const e of players) constrainBodyToField(e);
    }
  }
  function resolvePlayerContacts() {
    const players = G.players || [];
    if (players.length < 2) return;
    // Preserve the pre-solve velocity for tackle momentum. Contact response
    // correctly slows bodies, but a defender should still receive credit for
    // the speed with which he actually arrived at the hit.
    for (const e of players) {
      e.contactVx = e.vx; e.contactVy = e.vy;
      e.qbContact = false; e.carrierContact = false;
    }
    // The torso solve and the exact-sprite solve are deliberately alternated.
    // A tail/horn correction can move a third dino a fraction of a pixel into
    // its physical radius; the next small torso pass repairs that before the
    // renderer sees it. The ordinary case exits after the first mask check.
    for (let cycle = 0; cycle < 6; cycle++) {
      resolveBodyContacts(players, cycle === 0 ? 16 : 6, cycle === 0);
      if (!resolveVisualSpriteContacts()) break;
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
    // A safety pursues on foot by default. Straight-line flight is an
    // explicit player-controlled soar (hold/release or SHIFT), never an AI
    // breakaway shortcut that turns ordinary coverage into hovering.
    moveToward(e, lead, sp, dt);
  }

  // flight rules: the wings run on a CHARGE meter. A short hop is available
  // almost immediately; a full-field flight needs about a second of charge.
  // Using it last play just means starting this play on an empty tank.
  function soarReady(e) {
    return e.soarCd <= 0 && e.soarT <= 0 && (e.soarCharge || 0) >= 0.3;
  }
  function startSoar(e, tgt) {
    if (!e || e.species !== "quetz" || !soarReady(e)) return false;
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
    return true;
  }
  // returns TRUE only if this defender actually has a play on the ball;
  // everyone else must KEEP COVERING (standing statue-still while the offense
  // runs a go route was embarrassing and is now impossible)
  function breakOnBall(e, sp, dt) {
    const b = G.ball;
    if (b.away) { e.ballAttack = false; return false; } // nobody bites on a throwaway
    const flightLeft = Math.max(0, (b.T || 0) - (b.t || 0));
    const spot = { x: b.to.x, y: clamp(b.to.y, TOP + 8, BOT - 8) };
    const defenders = G.players.filter((p) => p.team === "def" && p.proneT <= 0)
      .sort((a, b2) => dist(a, spot) / Math.max(1, a.spd || 1) - dist(b2, spot) / Math.max(1, b2.spd || 1));
    const rank = defenders.indexOf(e);
    const nearestRec = eligible().sort((a, b2) => dist(a, spot) - dist(b2, spot))[0];
    const roleBonus = e.role === "S" ? 52 : e.role === "CB" ? 30 : e.role === "LB" ? 16 : 0;
    // Only the two best-positioned defenders (plus a nearby safety) are
    // allowed to abandon their assignment.  Their range scales with remaining
    // air time, so a deep lob lets a safety read it early while a bullet still
    // rewards tight man coverage rather than a teleporting defender.
    const readRange = 118 + roleBonus + sp * flightLeft * 1.45;
    const canJoin = rank <= 1 || (e.role === "S" && rank === 2 && dist(e, spot) < readRange * 0.82);
    if (!canJoin || dist(e, spot) > readRange) { e.ballAttack = false; return false; }

    const passDir = b.from ? Math.sign(b.to.x - b.from.x) || 1 : 1;
    const alreadyInLane = nearestRec && (e.x - nearestRec.x) * passDir < 10;
    // Meet the receiver slightly between him and the passer when the defender
    // has inside/front leverage.  That creates the converging, contested
    // catch point seen in good football games instead of two dinos arriving
    // independently at the last pixel.
    const lead = alreadyInLane ? 14 + (e.role === "S" ? 5 : 0) : 0;
    const target = { x: spot.x - passDir * lead, y: spot.y };
    e.ballAttack = true;
    e.catchLeverage = lead ? 2 + (e.role === "S" ? 1 : 0) : 1;
    moveToward(e, target, sp * (e.role === "S" ? 1.08 : 1.02), dt);
    return true;
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
      // …and only a true STIFF-ARM artist (85+) throws the paw, rarely
      else if (dist(n, e) < 26 && e.stiffCd <= 0 && (e.stiff || e.str || 75) >= 85 && Math.random() < 0.02) startStiffArm(e);
    }
    // A goal-line dive can score before contact.  Do not auto-dive at the
    // sticks: that used to whistle an untouched CPU carrier dead the instant
    // it earned a first down, taking away any chance to keep running.
    if (e.diveT <= 0 && n && dist(n, e) < 42) {
      const goalX = xAtYd(100);
      if (goalX - e.x < 70 && goalX - e.x > 8) doDive(e);
    }
    ty = clamp(ty, TOP + 14, BOT - 14);
    moveToward(e, { x: e.x + 120, y: ty }, sp, dt);
  }

  const ELITE_QBS = ["Patrick Mahomes", "Josh Allen", "Joe Burrow", "Lamar Jackson"];

  function cpuReadBoard(qb) {
    const userReceiver = offenseIsUser() && G.controlled && G.controlled.team === "off" && G.controlled !== qb;
    return eligible().map((rec) => {
      const flight = 0.46 + dist(qb, rec) / 540;
      const lead = {
        x: rec.x + rec.vx * flight * 0.94,
        y: clamp(rec.y + rec.vy * flight * 0.94, TOP + 10, BOT - 10),
      };
      lead.x = clamp(lead.x, qb.x - 18, qb.x + maxRange());
      const window = assessPassWindow(qb, rec, lead, flight);
      const depth = Math.max(0, lead.x - qb.x) / YPX;
      const targetBonus = userReceiver && rec === G.controlled ? 16 : 0;
      // Separation has value, but an open 6-yard outlet beats a "maybe"
      // 25-yard throw.  This is the core fix for AI-QB interceptions.
      const score = depth * 0.72 + window.separation * 1.22 - window.risk * 145 - window.placement * 0.28 + targetBonus;
      return { rec, lead, flight, window, depth, score };
    }).sort((a, b) => b.score - a.score);
  }

  function cpuThrowAway(qb) {
    const sideline = qb.y < MID ? TOP - 32 : BOT + 32;
    G.ball = { mode: "air", kind: "lob", away: true, from: { x: qb.x, y: qb.y }, to: { x: qb.x + 150, y: sideline }, t: 0, T: 0.65, x: qb.x, y: qb.y, z: 12, holder: null };
    G.phase = "air"; qb.state = "idle"; qb.throwT = 0.3; playPose(qb, "throw", 0.32); G.aim = null; sfx.throw();
  }

  function cpuQB(dt) {
    const qb = G.ball.holder;
    if (!qb || qb.role !== "QB") return;
    const elite = ELITE_QBS.includes(qb.name) || (qb.acc || 0) >= 92;
    const nearbyRush = G.players.filter((p) => p.team === "def" && !p.blockedBy && dist(p, qb) < 86)
      .sort((a, b) => dist(a, qb) - dist(b, qb));
    const pressured = nearbyRush.length > 0;
    const inFace = nearbyRush[0] && dist(nearbyRush[0], qb) < 25;
    // Slide inside the pocket away from the nearest free rusher. It gives the
    // line/QB a shared shape and prevents the old statue-QB sack parade.
    if (G.playT < 0.85) qb.x -= 36 * dt;
    if (pressured && nearbyRush[0]) {
      const avoid = nearbyRush[0].y >= qb.y ? -1 : 1;
      qb.y = clamp(qb.y + avoid * Math.min(42, qb.spd * 0.38) * dt, TOP + 18, BOT - 18);
    }
    const reaction = (elite ? 0.48 : 0.66) * diff().cpuThink * (1 - Math.min(0.22, cpuExperience() * 0.12));
    if (G.playT < reaction) return;

    const board = cpuReadBoard(qb);
    if (!board.length) { if (pressured && G.playT > 1.45) cpuThrowAway(qb); return; }
    const preferred = board.find((r) => r.rec === G.controlled);
    const safeLimit = elite ? 0.48 : 0.40;
    const playableLimit = elite ? 0.60 : 0.53;
    let choice = board.find((r) => r.window.risk <= safeLimit) || null;
    // When a player is running a receiver, feed that route if it is genuinely
    // comparable to the best read. The CPU no longer forces it into coverage.
    if (preferred && preferred.window.risk <= playableLimit && (!choice || preferred.score >= choice.score - 13)) choice = preferred;
    const mustThrow = G.playT > (elite ? 2.55 : 2.28) * diff().cpuThink || (pressured && G.playT > (elite ? 1.18 : 1.02));

    if (choice && (choice.window.risk <= safeLimit || mustThrow && choice.window.risk <= playableLimit)) {
      const savedAcc = qb.acc;
      if (elite) qb.acc = Math.max(qb.acc, 92);
      G.aim = choice.lead;
      const quick = choice.depth <= 9 && choice.window.risk < 0.34 && !inFace;
      if (quick) throwBullet(); else throwLob();
      qb.acc = savedAcc;
      return;
    }

    // A scripted protection loss can only finish when a rusher is actually
    // in the pocket. It is a pressure cue, not permission for the CPU to
    // hold the ball while an easy outlet is available.
    if (qb.sackDoom && pressured && G.playT >= qb.sackAt && (!choice || choice.window.risk > playableLimit) && inFace) {
      const sacker = nearbyRush[0];
      G.carrier = qb; qb.canPass = false;
      announce("sack", sacker && sacker.name);
      if (sacker) { addStat(sacker, "sacks"); addStat(sacker, "tkl"); }
      G.shake = Math.max(G.shake, 0.25); sfx.tackle(); playDead("SACKED!", null, false);
      return;
    }
    if (mustThrow) {
      if ((qb.agi || 75) >= 84 && !inFace && Math.random() < 0.52) { becomeCarrier(qb); return; }
      cpuThrowAway(qb);
    }
  }

  // ------------------------------------------------------------- tackling
  // wind up a peanut-punch swing: the leap + swat that goes for the BALL,
  // not the man. Success is decided at contact, based on how well you
  // timed the press relative to your arrival on the carrier.
  function startPunch(e) {
    // A peanut punch is an airborne swat.  Jump (or soar) first; F from the
    // turf no longer manufactures a free leap-and-strip.
    if (e.punchCd > 0 || e.punching > 0 || e.proneT > 0 || (e.jumpT <= 0 && e.soarT <= 0)) return;
    e.punching = 0.5;
    e.punchDist = G.carrier ? dist(e, G.carrier) : 60;
    e.swingT = 0.3;
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
          if (dd0 > 18 && dd0 < 40 && Math.random() < dt * 0.02) {
            e.punchedThisPlay = true;
            timedJump(e);
            startPunch(e);
          }
        }
        if (e.punching > 0 && (e.jumpT > 0 || e.soarT > 0) && dist(e, c) < 26 && !(G.ramp && G.ramp.ent === c)) {
          e.punching = 0; e.punchCd = 1.1;
          for (let s2 = 0; s2 < 6; s2++) G.parts.push({ x: c.x + rnd(-6, 6), y: c.y - 12 + rnd(-6, 6), z: 8, vx: rnd(-60, 60), vy: rnd(-40, 40), vz: rnd(20, 70), t: 0.3, puff: true });
          // human punch is timing-based & reliable; an AI strip is a long shot
          const timing = clamp(1 - Math.abs((e.punchDist == null ? 60 : e.punchDist) - 30) / 42, 0, 1);
          let odds = e.controlled
            ? 0.22 + timing * 0.5 + ((e.str || 75) - 75) / 250
            : 0.14 + ((e.str || 75) - 75) / 500;   // AI: low base, small strength bonus
          odds -= (((c.str || 75) - 75) + ((c.hands || 75) - 75)) / 900;   // ball security
          if (Math.random() < odds) { e.punched = true; fumble(c, e); return; }
          e.staggerT = 0.3;   // whiffed the swat — a beat to recover
        }
      }
      for (const e of G.players) {
        if (e.team === c.team || e.staggerT > 0 || e.proneT > 0 || e.tackleCd > 0) continue;
        // Body separation means centers no longer enter the old 14px
        // overlap-only tackle gate.  A normal wrap starts at true shoulder
        // contact; a dive/soar earns a little reach with the leading shoulder.
        const airborne = e.diveT > 0 || e.soarT > 0;
        let r2 = bodyContactRange(e, c, airborne ? 6 : 2);
        if (e.apex && e.passive === "tackle") r2 += 3;      // HEAT-SEEKER range
        const dc = dist(e, c);
        const evx = e.contactVx == null ? e.vx : e.contactVx;
        const evy = e.contactVy == null ? e.vy : e.contactVy;
        const cvx = c.contactVx == null ? c.vx : c.contactVx;
        const cvy = c.contactVy == null ? c.vy : c.contactVy;
        const impactClosing = ((evx - cvx) * (c.x - e.x) + (evy - cvy) * (c.y - e.y)) / Math.max(1, dc);
        // A defender who has already turned away must not magically tackle
        // just because a separation solve left him brushing the carrier.
        const recentCarrierContact = e.carrierContact ||
          (e.carrierContactAt != null && G.playT - e.carrierContactAt < 0.16);
        const actuallyArriving = dc <= bodyContactRange(e, c, 1.5) || impactClosing > 6 || recentCarrierContact;
        if (dc < r2 && actuallyArriving) {
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
          // Truckstick has two strength-based tries per carry, rather than
          // two guaranteed sheds. Even a dominant back is never automatic.
          if (c.truckCharges > 0) {
            c.truckCharges--;
            const truckP = clamp(0.325 + ((c.str || 75) - (e.str || 75)) / 300, 0.25, 0.4);
            if (Math.random() < truckP) {
              e.staggerT = 0.9; G.shake = 0.15; sfx.tackle();
              continue;
            }
          }
          if (c.shedCharges > 0) { // power backs bounce off the first hits
            c.shedCharges--; e.staggerT = 0.9; G.shake = 0.15; sfx.tackle();
            continue;
          }
          // YAC MONSTER: one agility-based chance to make the first tackler miss
          if (c.apex && c.passive === "yac" && c.yacCharge > 0) {
            c.yacCharge = 0;
            const yacP = clamp(0.34 + ((c.agi || 75) - (e.agi || 75)) / 180, 0.25, 0.48);
            if (Math.random() < yacP) { e.staggerT = 0.85; sfx.juke(); continue; }
          }
          // STIFF-ARM contest: raw strength vs raw strength. Win = the
          // tackler is planted; lose = he's still coming, and mad about it
          if (c.stiffT > 0) {
            c.stiffT = 0;
            if ((c.stiff || c.str || 75) + rnd(0, 26) > (e.str || 75) + rnd(0, 26)) {
              const dx3 = e.x - c.x, dy3 = e.y - c.y, m3 = Math.hypot(dx3, dy3) || 1;
              e.staggerT = 0.75; e.proneT = Math.max(e.proneT || 0, 0.3);
              playPose(c, "stiff", 0.44); playPose(e, "shoved", 0.54);
              c.impactT = 0.42; c.impactLead = true; e.impactT = 0.42;
              e.x += (dx3 / m3) * 14; e.y += (dy3 / m3) * 14;
              G.shake = Math.max(G.shake, 0.12); sfx.tackle();
              continue;
            }
          }
          e.tackleCd = 0.5;
          // HARD HIT: a well-timed dive/flight arriving fast and strong can
          // jar the ball loose — or leave a fresh-catch receiver seeing stars
          const closing = impactClosing;
          // Dive momentum is partially spent turning into the tackle, so the
          // closing threshold must be attainable after the approach step.
          // This also fixes the visible "arrived but missed" CPU tackle.
          const hardHit = closing > 56 && (e.str || 75) >= 76 && (e.diveT > 0 || e.soarT > 0);
          const freshCatch = c.catchT != null && G.playT - c.catchT < 0.6;
          // an arm tackle on a back moving at full clip mostly bounces off —
          // you bring him down with a dive, a wrap at an angle, or numbers
          const fullClip = !G.playPass && Math.hypot(c.vx, c.vy) > c.spd * 0.7 && e.diveT <= 0 && e.soarT <= 0;
          let p = (fullClip ? 0.38 : 0.52) + (e.tkl - c.agi) / 160 - ((c.str || 75) - 75) / 320 + (e.diveT > 0 ? 0.24 : 0) + (e.soarT > 0 ? 0.34 : 0) + (e.controlled ? 0.08 : 0) + (hardHit ? 0.1 : 0);
          if (G.drive === "A" && !G.humanB && e.team === "def") p += 0.08; // CPU finishes QB/carrier tackles
          if (e.apex && e.passive === "tackle") p += 0.08;               // HEAT-SEEKER finishes better
          if (c.apex && c.passive === "escape") p -= 0.08;               // HOUDINI slips, not vanishes
          if (Math.random() < p) {
            c.impactT = 0.5;
            c.impactLead = true; e.impactT = 0.5;
            playPose(c, "tackled", 0.68);
            playPose(e, "tackle", e.diveT > 0 || e.soarT > 0 ? 0.58 : 0.48);
            // A made tackle gets a short body-on-body shoulder wrap. The
            // carrier is shifted backward along the actual hit vector before
            // the dead-ball fall, so it never reads as a sprite compressing
            // vertically in place.
            beginTackleImpact(e, c, 0.46);
            const ballSec = clamp(1 - ((c.str || 75) - 75) * 0.004 - ((c.hands || 75) - 75) * 0.003, 0.5, 1.5);
            const ffSkill = hardHit ? Math.max(0, ((e.tkl || 75) - 80)) * 0.002 : 0;   // big hitters strip more
            if (Math.random() < (0.008 + G.weather.fumbleMod + ffSkill + (hardHit ? (freshCatch ? 0.16 : 0.06) : 0)) * ballSec) {
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
            c.impactT = 0.34; c.impactLead = true; e.impactT = 0.34;
            playPose(c, "tackled", 0.36); playPose(e, "tackle", 0.38);
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
        if (G.playT < (elite ? 0.8 : 1.2)) continue;
        const dqb = dist(e, qb);
        const evx = e.contactVx == null ? e.vx : e.contactVx;
        const evy = e.contactVy == null ? e.vy : e.contactVy;
        const qvx = qb.contactVx == null ? qb.vx : qb.contactVx;
        const qvy = qb.contactVy == null ? qb.vy : qb.contactVy;
        const closing = ((evx - qvx) * (qb.x - e.x) + (evy - qvy) * (qb.y - e.y)) / Math.max(1, dqb);
        const wrapRange = bodyContactRange(e, qb, 1.5);
        // CPU rushers get a small finish window when they are actively
        // closing on the human QB. This closes the one-frame run-past gap
        // where a defender visibly reached the passer but narrowly missed the
        // old 13px overlap check.
        // A rusher who is still driving through the pocket can finish from a
        // forearm's reach; the extra space is reach, not body overlap, and is
        // gated by real closing speed so a defender running away cannot claim
        // a sack.
        const cpuFinish = G.drive === "A" && !G.humanB && dqb < bodyContactRange(e, qb, 10) && closing > 8;
        const recentQBContact = e.qbContact ||
          (e.qbContactAt != null && G.playT - e.qbContactAt < 0.22);
        if (dqb < wrapRange || recentQBContact || cpuFinish) {
          // HOUDINI QB slips the would-be sacker instead of going down
          // It now requires actual movement and is a rare escape, not a
          // coin-flip immunity after the rusher has already arrived.
          const qbMoving = Math.hypot(qb.vx, qb.vy) > qb.spd * 0.42;
          if (qb.apex && qb.passive === "escape" && qbMoving && Math.random() < 0.18) {
            e.staggerT = 0.7; e.tackleCd = 0.6; sfx.juke(); continue;
          }
          sfx.tackle();
          announce("sack", e.name);
          addStat(e, "sacks"); addStat(e, "tkl");
          G.carrier = qb;
          // QB HUNTER can jar it loose, but a clean sack remains the expected
          // outcome. A strip-sack should feel like a special moment, not erase
          // most otherwise well-earned pressure finishes.
          if (e.apex && e.passive === "sack" && Math.random() < 0.09) { fumble(qb, e); return; }
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
      // Leaving through the BACK of the offense's own end zone is a safety.
      const backEnd = xAtYd(-10);
      if (c.team === "off" && (c.x <= backEnd || (c.prevX > backEnd && c.x <= backEnd))) {
        playDead("OUT OF END ZONE", { spotYd: 0 }, false); return;
      }
    }
  }

  // ---------------------------------------------------------------- kicking
  function updateKick(dt) {
    const k = G.kick;
    if (!k) return;
    k.t += dt;
    if (k.stage === 0) k.val = 50 + 50 * Math.sin(k.t * 4.2);
    if (k.stage === 1) k.val = 50 + 50 * Math.sin(k.t * 5.6 + Math.PI / 2);
    if (k.cpu) {
      // CPU nails it near-optimally with some noise
      if (k.stage === 0 && k.val > 88) kickLocked();
      else if (k.stage === 1 && Math.abs(k.val - 50) < rnd(2, 12)) kickLocked();
    }
    // the rush is LIVE while you aim: blockers hold each man a beat, then
    // he's coming for the kicker
    const kk = k.kickerEnt;
    for (const e of G.players) {
      e.animT += dt * (e.team === "def" && e.holdT <= 0 ? 7 : 2);
      if (e.team !== "def" || !kk) continue;
      if (e.holdT > 0) { e.holdT -= dt; e.x += rnd(-8, 8) * dt; e.y += rnd(-6, 6) * dt; continue; }
      moveToward(e, kk, e.spd * 0.95, dt);
      if (k.stage < 2 && dist(e, kk) < 15) { blockedKick(e); return; }
    }
  }
  // the made/missed kick flies for real -- camera chases the ball
  function updateKickFly(dt) {
    const f = G.kickFly;
    if (!f) return;
    f.t += dt;
    const kk = Math.min(1, f.t / f.T);
    G.ball.x = f.from.x + (f.to.x - f.from.x) * kk;
    G.ball.y = f.from.y + (f.to.y - f.from.y) * kk;
    G.ball.z = 10 + f.arc * kk * (1 - kk);
    updateCamera(dt);
    if (kk >= 1) {
      const after = f.after;
      G.kickFly = null; G.ball.mode = "dead";
      after();
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
        if (Math.hypot(e.vx, e.vy) > 36 && inPuddle(e) && Math.random() < dt * 9) {
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
    if (S === "online_wait") { drawOnlineWait(); cx.restore(); return; }
    if (S === "menu") { drawMenu(); cx.restore(); return; }
    if (S === "qbs") { drawQBs(); cx.restore(); return; }
    if (S === "tutorial") { drawTutorial(); cx.restore(); return; }
    if (S === "scout") { drawScouting(); cx.restore(); return; }
    if (S === "editor") { drawEditor(); cx.restore(); return; }
    if (S === "offseason") { drawOffseason(); cx.restore(); return; }
    if (S === "intro") { drawIntro(); cx.restore(); return; }
    if (S === "pregame") { drawPregame(); cx.restore(); return; }
    if (S === "hub") { drawHub(); cx.restore(); return; }
    if (S === "standings") { drawStandings(); cx.restore(); return; }
    if (S === "upgrade") { drawUpgrade(); cx.restore(); return; }
    if (S === "sznstats") { drawSznStats(); cx.restore(); return; }
    if (S === "select") { drawSelect(); cx.restore(); return; }
    if (["career_create", "career_quiz", "career_drill", "career_draft"].includes(S)) { drawCareer(); cx.restore(); return; }

    if (S === "halftime" && G.half) {
      if (G.half.kind === "fg") drawHalfFG();
      else if (G.half.kind === "dash") drawHalfDash();
      else drawHalftime();
      drawHUD(); cx.restore(); return;
    }
    if (S === "replay" && G.replay) {
      drawReplay();
      cx.font = PF(8); cx.textAlign = "left"; cx.fillStyle = G.gifRec ? "#ff5533" : "#9db0a4";
      cx.fillText(G.gifRec ? "● REC → GIF" : "G = SAVE AS GIF", 30, H - 24);
      cx.restore();
      if (G.gifRec && (G.gifSkip = (G.gifSkip + 1) % 3) === 0 && G.gifFrames.length < GIF_MAX_FRAMES) gifGrabFrame();
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
      const cxp = clamp(e2.x - G.camX, 102, W - 102), cyp = Math.max(64, e2.y - 74);
      cx.fillStyle = "rgba(4,10,7,.92)"; cx.fillRect(cxp - 98, cyp, 196, 46);
      cx.strokeStyle = "#ffd23f"; cx.strokeRect(cxp - 98, cyp, 196, 46);
      cx.font = PF(8); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
      cx.fillText((e2.role || e2.species).toUpperCase() + " · " + lastName(e2.name || "DINO").toUpperCase(), cxp, cyp + 14);
      cx.font = PF(7); cx.fillStyle = "#f4f6f1";
      cx.fillText("SPD " + Math.round((e2.spd / SPEED_SCALE - 96) / 1.9 + 60) + " STR " + (e2.str || 75) + " JMP " + (e2.jump || 70), cxp, cyp + 27);
      cx.fillText("HND " + (e2.hands || 75) + " TKL " + (e2.tkl || 75) + " AGI " + (e2.agi || 75) + " STA " + (e2.stam || 82), cxp, cyp + 39);
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
    if (S === "qa" && !G.qaCapture) drawQAOverlay();
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
      ? "OFFENSE DRILL — hold & PULL BACK=aim, release=throw · SPACE=bullet · SHIFT=juke · F=stiff-arm · Q=lateral · R=RAMPAGE"
      : "DEFENSE DRILL — TAB=switch · SPACE=jump · JUMP+F=punch · SHIFT=soar · R=RAMPAGE";
    cx.fillText(tips + "     [P] SWITCH DRILL · [ESC] QUIT", W / 2, 45);
  }

  const PF = (s) => s + "px 'Press Start 2P', monospace";

  function drawField() {
    const cam = G.camX;
    // grass stripes every five yards.  Keep their geometry tied to xAtYd so
    // the visual field stays truthful when the presentation scale changes.
    for (let seg = 0; seg < 24; seg++) {
      const x = xAtYd(-10 + seg * 5) - cam;
      if (x + 5 * YPX < 0 || x > W) continue;
      const snow = G.weather && G.weather.type === "SNOW";
      const base = seg % 2 ? (snow ? "#c9d4cf" : "#1e6b35") : (snow ? "#bcc9c3" : "#1a5e2e");
      cx.fillStyle = G.weather && G.weather.type === "RAIN" ? shade(base, -14) : base;
      cx.fillRect(x, TOP, 5 * YPX, BOT - TOP);
    }
    // endzones
    const ezA = (G.drive === "A" ? G.my : G.opp) || "GB";   // offense's own endzone (left)
    const ezB = (G.drive === "A" ? G.opp : G.my) || "CHI";  // target endzone (right)
    drawEndzone(0, ezA); drawEndzone(FIELD_LEN - 10 * YPX, ezB);
    // midfield logo: the home team's mark painted at the 50, real-stadium style
    drawMidfieldLogo(cam);
    // yard lines
    cx.strokeStyle = "rgba(244,246,241,.55)"; cx.lineWidth = 2;
    // Big, high-contrast numbers make every five-yard gain visibly matter.
    // They are drawn into the turf, not floated as HUD text, so drives feel
    // longer without lying about the actual spot.
    cx.font = PF(16); cx.fillStyle = "rgba(244,246,241,.64)"; cx.textAlign = "center";
    for (let yd = 0; yd <= 100; yd += 5) {
      const x = xAtYd(yd) - cam;
      if (x < -20 || x > W + 20) continue;
      cx.beginPath(); cx.moveTo(x, TOP); cx.lineTo(x, BOT); cx.stroke();
      if (yd % 10 === 0 && yd > 0 && yd < 100) {
        const num = yd <= 50 ? yd : 100 - yd;
        cx.fillStyle = "rgba(6,35,18,.44)";
        cx.fillText(String(num), x + 2, TOP + 50 + 2);
        cx.fillText(String(num), x + 2, BOT - 34 + 2);
        cx.fillStyle = "rgba(244,246,241,.64)";
        cx.fillText(String(num), x, TOP + 50);
        cx.fillText(String(num), x, BOT - 34);
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
    // The field now has its own life: coaches, photographers, ball kids,
    // bench groups and near-sideline fans scroll with the actual yard lines.
    drawSidelineLife(cam);
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
    if (["presnap", "live", "playcall", "defcall", "dead", "kick", "qa"].includes(G.state)) {
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
    const width = 10 * YPX;
    if (x + width < 0 || x > W) return;
    cx.fillStyle = shade(t[1], -18); cx.fillRect(x, TOP, width, BOT - TOP);
    cx.save();
    cx.translate(x + width / 2, MID);
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

  // A shared contact burst makes tackle / stiff-arm impact legible at field
  // scale. It is deliberately made of integer-aligned pixel bars instead of
  // canvas strokes: diagonal anti-aliasing looked like loose visual debris in
  // the otherwise crisp 16x16 dinosaur world.
  function drawPixelImpactBurst(x, y, q) {
    const spread = Math.round((1 - q) * 4);
    const marks = [
      [-10 - spread, -7, 5, 2], [7 + spread, -7, 5, 2],
      [-14 - spread, 1, 5, 2], [11 + spread, 1, 5, 2],
      [-6, -12 - spread, 2, 5], [6, -12 - spread, 2, 5],
    ];
    cx.save(); cx.globalAlpha = 0.35 + q * 0.65;
    cx.fillStyle = q > 0.6 ? "#fff3a0" : "#ff9b5f";
    for (const m of marks) cx.fillRect(Math.round(x + m[0]), Math.round(y + m[1]), m[2], m[3]);
    cx.restore();
  }
  function drawContactBurst(e) {
    if (!e.impactLead || e.impactT <= 0) return;
    drawPixelImpactBurst(e.x - G.camX + e.dir * 7, e.y - 22, clamp(e.impactT / 0.5, 0, 1));
  }

  function drawPlayers() {
    const list = G.players.slice().sort((a, b) => a.y - b.y);
    for (const e of list) {
      const sheet = G.sheets[teamOf(e)];
      if (!sheet) continue;
      const ramping = G.ramp && G.ramp.ent === e;
      const spr = ramping ? sheet.rampage : sheet[e.species];
      // Wings-open art is reserved for an active or explicitly aimed safety
      // soar. Quetz ground frames stay in the normal walk cycle.
      const wingsOpen = e.species === "quetz" &&
        (e.soarT > 0 || (G.soarAim && e === G.controlled));
      const spriteFrame = selectActionSpriteFrame(e, spr, wingsOpen);
      // Preserve the small, clean species sprite through every football
      // moment. The action pack is another hand-drawn 16×16 species map at
      // the same scale—not a generic, enlarged cel or a rotated runner.
      const artPack = spriteFrame.pack;
      const img = (e.dir >= 0 ? artPack.R : artPack.L)[spriteFrame.fi];
      const drawW = artPack.w, drawH = artPack.h;
      // This is also the placement used by the exact opaque-sprite contact
      // pass. Keeping one shared calculation means visual clearance is
      // guaranteed at the pixels we actually draw, including a jump or dive.
      const visual = compactVisualPlacement(e, artPack, spriteFrame.action);
      const pose = spriteFrame.pose, jump = visual.jump;
      const x = Math.round(visual.x - G.camX), y = visual.y;
      // shadow (stays on the ground; shrinks as they leap)
      cx.fillStyle = "rgba(0,0,0,.28)";
      const shW = 16 - jump * 0.5;
      cx.fillRect(e.x - G.camX - shW / 2, e.y + 2, shW, 4);
      // the ring IS the ball indicator: carrier or the QB holding it pre-throw
      if (!G.qaCapture && (e === G.carrier || (e === G.ball.holder && (G.phase === "drop" || G.phase === "handoff")))) {
        cx.strokeStyle = "rgba(255,210,63,.9)"; cx.lineWidth = 2;
        cx.beginPath(); cx.ellipse(e.x - G.camX, e.y, 15, 6, 0, 0, Math.PI * 2); cx.stroke();
      }
      if (e.proneT > 0 && !["tackled", "shoved", "prone"].includes(pose)) {
        cx.save(); cx.translate(e.x - G.camX, e.y); cx.rotate(e.dir * Math.PI / 2);
        cx.drawImage(img, -drawW / 2, -drawH + 6); cx.restore();
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
        // personalized dinos: QBs wear their gallery identity in-game, and
        // apex rampagers carry their star's signature feature
        if (!ramping) {
          let featKind = null;
          if (e.role === "QB") { const qf = QB_ID[teamAbbrOf(sideOf(e))]; if (qf && qf[1] !== "small") featKind = qf[1]; }
          else if (e.apex) featKind = RAMP_FEAT[teamAbbrOf(sideOf(e))];
          if (featKind) {
            const mid0 = e.x - G.camX;
            if (e.dir < 0) { cx.save(); cx.translate(2 * mid0, 0); cx.scale(-1, 1); }
            drawQBFeature(featKind, x, y, spr.w);
            if (e.dir < 0) cx.restore();
          }
        }
        // Compact species action cels own throws, catches, and contact.  The
        // old canvas stroke overlays drew humanoid white/orange arms over the
        // dinosaur sprites, so they are deliberately not used as a fallback.
      }
      // A secured ball is visible at the original dino's claws during the
      // tiny catch/tackle beat.  Held balls otherwise stay tucked (and never
      // duplicate the airborne ball), preserving the game's uncluttered read.
      if (G.ball && G.ball.mode === "held" && G.ball.holder === e && pose) {
        let bx = e.x - G.camX + e.dir * 9, by = e.y - 15 - jump;
        if (pose === "catchHigh") by = e.y - 28 - jump;
        else if (pose === "catchLow") by = e.y - 8;
        else if (pose === "tackled" || pose === "shoved") { bx = e.x - G.camX + e.dir * 5; by = e.y - 11; }
        const anchor = spriteBallAnchor(artPack, e.dir >= 0 ? "R" : "L", spriteFrame.fi,
          visual.x - G.camX, visual.y, bx, by);
        bx = anchor.x; by = anchor.y;
        drawFootballAt(bx, by);
      }
      // The celebration cel owns the read. A very short tag confirms the
      // result without replacing the dinosaur's point-and-hop with text.
      if (!G.qaCapture && e.fdCeleb > 0 && e.fdCeleb < 0.62) {
        const ax0 = e.x - G.camX, ay0 = e.y - jump - 18;
        cx.fillStyle = Math.sin(performance.now() / 90) > 0 ? "#ffd23f" : "#fff";
        cx.font = PF(8); cx.textAlign = "center";
        cx.fillText("1ST!", ax0, ay0 - 22);
      }
      // Snowball victims visibly turn blue until they warm back up.
      if (e.coldT > 0) {
        cx.save();
        cx.globalAlpha = 0.22 + 0.12 * Math.min(1, e.coldT / 4.5);
        cx.fillStyle = "#58c8ff";
        cx.fillRect(x, y, spr.w, spr.h);
        cx.restore();
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
      if (!G.qaCapture && (e === G.carrier || (G.ball.holder === e && G.phase === "drop")) && e.name) {
        cx.font = PF(7); cx.textAlign = "center";
        cx.fillStyle = "rgba(0,0,0,.5)"; cx.fillRect(e.x - G.camX - 34, e.y + 8, 68, 11);
        cx.fillStyle = "#fff"; cx.fillText(lastName(e.name).toUpperCase().slice(0, 10), e.x - G.camX, e.y + 17);
      }
      drawContactBurst(e);
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

  function drawFootballAt(x, y) {
    const spr = G.ballSpr;
    if (!spr) return;
    cx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
  }
  function drawBall() {
    const b = G.ball;
    if (!b || b.mode === "dead") return;
    if (b.mode === "held" && b.holder) return; // tucked away
    // shadow
    cx.fillStyle = "rgba(0,0,0,.3)";
    cx.fillRect(b.x - G.camX - 3, b.y - 1, 6, 3);
    drawFootballAt(b.x - G.camX, b.y - b.z);
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
  // pregame INTRO: each team's QB and rampager charge across the screen with
  // their names and nicknames up in lights
  const APEX_SPECIES = { QB: "troodon", RB: "carno", WR1: "veloci", TE: "deino", EDGE: "allo", DL: "stego", LB: "spino", CB: "deinony", S: "quetz" };
  function drawIntroSide(ab, sheet, t, flip) {
    const team = TEAMS[ab];
    // team banner
    cx.fillStyle = team[1]; cx.fillRect(0, 96, W, 118);
    cx.fillStyle = shade(team[1], -22); cx.fillRect(0, 196, W, 18);
    const slide = Math.min(1, t * 2.2);
    cx.font = PF(30); cx.textAlign = "center"; cx.fillStyle = team[2];
    cx.fillText(team[0].toUpperCase(), W / 2 + (1 - slide) * (flip ? -520 : 520), 172);
    // the two headliners run in
    const qb = roster(ab).offense.find((p2) => p2.role === "QB") || { name: "Dino" };
    const rampInfo = RAMPAGERS[ab] || ["Apex Dino", "truck"];
    const spec = APEX_SPECIES[APEX_ROLE[ab] || "QB"] || "trex";
    const runX = flip ? W + 80 - t * 300 : -80 + t * 300;
    const fi = ((performance.now() / 130) | 0) % 2;
    const feat = (kind, fx) => {
      if (!kind) return;
      if (flip) { cx.save(); cx.translate(2 * (fx + 44), 0); cx.scale(-1, 1); }
      drawQBFeature(kind, fx, 262, 88);
      if (flip) cx.restore();
    };
    if (sheet && sheet.troodon) {
      const dirSet = flip ? sheet.troodon.L : sheet.troodon.R;
      cx.drawImage(dirSet[fi], runX - 44, 262, 88, 88);
      const qf = QB_ID[ab];
      if (qf && qf[1] !== "small") feat(qf[1], runX - 44);
    }
    if (sheet && sheet[spec]) {
      const dirSet = flip ? sheet[spec].L : sheet[spec].R;
      cx.drawImage(dirSet[fi], runX - 44 + (flip ? 130 : -130), 262, 88, 88);
      feat(RAMP_FEAT[ab], runX - 44 + (flip ? 130 : -130));
    }
    // names + nicknames
    const a2 = clamp((t - 0.5) * 2, 0, 1);
    cx.save(); cx.globalAlpha = a2;
    cx.font = PF(13); cx.fillStyle = "#f4f6f1";
    cx.fillText(lastName(qb.name).toUpperCase() + "  ·  \u201C" + ((QB_ID[ab] || ["THE STARTER"])[0]) + "\u201D", W / 2, 396);
    cx.font = PF(11); cx.fillStyle = "#ff5533";
    cx.fillText("\u2605 " + rampInfo[0].toUpperCase() + "  ·  " + (PASSIVES[rampInfo[1]] || PASSIVES.truck).label, W / 2, 428);
    cx.restore();
  }
  function drawIntro() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    const t = G.intro ? G.intro.t : 0;
    const half = 3.2;
    if (t < half) drawIntroSide(G.my, G.sheets.A, t, false);
    else drawIntroSide(G.opp, G.sheets.B, t - half, true);
    cx.font = PF(8); cx.textAlign = "center"; cx.fillStyle = "#9db0a4";
    cx.fillText("TAP / ENTER TO SKIP", W / 2, H - 18);
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
      if (sheet && sheet[spec]) {
        const t = performance.now() / 200 | 0;
        cx.drawImage(sheet[spec].R[t % 2], cx0 - 32, 306, 64, 64);
        if (RAMP_FEAT[abbr]) drawQBFeature(RAMP_FEAT[abbr], cx0 - 32, 306, 64);
      }
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
      case "dreads": P(30, 2, 3, 10, "#1c1410"); P(34, 0, 3, 12, "#241a12"); P(26, 3, 3, 8, "#1c1410"); break;
      case "spikes": for (let s2 = 0; s2 < 4; s2++) P(24 + s2 * 5, -4 + (s2 % 2) * 2, 3, 6, "#ff3b2f"); break;
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
  // each franchise's rampager wears a feature modeled on the real star
  const RAMP_FEAT = {
    ARI: "headband", ATL: "dreads", BAL: "visor", BUF: "bigarm", CAR: "spikes",
    CHI: "chain", CIN: "shades", CLE: "spikes", DAL: "bolt", DEN: "shades",
    DET: "speed", GB: "cheese", HOU: "chain", IND: "headband", JAX: "spikes",
    KC: "flame", LA: "beard", LAC: "beard", LV: "mohawk", MIA: "speed",
    MIN: "chain", NE: "shades", NO: "dreads", NYG: "flame", NYJ: "chain",
    PHI: "bigarm", PIT: "headband", SEA: "chain", SF: "visor", TB: "headband",
    TEN: "speed", WAS: "visor",
  };
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
      "Tackled or run out the BACK of YOUR OWN end zone = SAFETY, 2 pts for them."]],
    ["OFFENSE — CONTROLS", [
      "1-4 / tap ...... pick a play (card 4 = your team's famous play)",
      "Q / E .......... audible (swap the play at the line)",
      "SPACE .......... snap the ball",
      "PULL BACK ...... hold click/touch and DRAG BACKWARD (behind your",
      "                 head!) — the arc shows the throw · RELEASE = lob",
      "SPACE/R-CLICK .. BULLET pass (fast, flat, riskier)",
      "After the throw the receiver runs his route on his own —",
      "your ONLY job is SPACE/JUMP as the ball drops in. Time it",
      "right = strong hands; leave it to autopilot = late, shaky leap.",
      "WASD run · SHIFT juke · F stiff-arm · E dive · Q lateral · X away"]],
    ["DEFENSE — CONTROLS", [
      "Click a dino before the snap to control HIM (or TAB mid-play).",
      "WASD chase · CLICK or E = dive tackle · SPACE = JUMP",
      "JUMP + F ....... PEANUT PUNCH: swat at the ball while airborne",
      "SPACE (ball up)  TIME the leap — pick the pass off at its peak",
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
    ["RATINGS — WHAT EVERY NUMBER ACTUALLY DOES", [
      "SPD speed ...... top running speed, pure and simple.",
      "STA stamina .... how LONG top speed lasts; long ball-carrier runs",
      "                 produce heavy legs — and, in season mode,",
      "                 how fresh the player is again by NEXT week.",
      "STR strength ... breaks tackles, powers the STIFF-ARM (F),",
      "                 shoves through blocks, protects the ball.",
      "HND catching ... contested grabs, off-target passes, fumble-proofing.",
      "JMP / AGI ...... jump-ball ceiling · juke sharpness + tackle slip.",
      "QBs: ARM = throw distance, ACC = how tight the ball groups.",
      "OL: BLOCKING (mass+technique) instead of catching.",
      "DEF: TACKLING instead of catching.  K: RANGE · ACCURACY · STAMINA.",
      "All from real NFL size/stat data, Madden-style 60-99 scales."]],
    ["WEATHER & DINO POWERS", [
      "RAIN/FREEZING adds small drop+fumble risk. SNOW slows legs.",
      "V throws a snowball in snow games: hits make dinos COLD and blue.",
      "Caleb Williams, the ICEMAN, is immune. C throws the CHALLENGE",
      "FLAG once a game on a close call. Halftime = mascot minigame!",
      "RAMPAGE (R) is once per half per team — spend it well."]],
  ];
  // ------------------------------------------------------------- scouting
  const SCOUT_COLS = [["spd", "SPD"], ["str", "STR"], ["stam", "STA"], ["jump", "JMP"], ["hands", "HND"], ["tkl", "TKL"], ["agi", "AGI"]];
  function openScouting() {
    G.scout = { sort: "spd", posFilter: "ALL", top: 0, list: null };
    G.state = "scout";
    if (!G.scoutData) {
      fetch("/api/game/players").then((r) => r.json()).then((d) => { G.scoutData = d.players || []; }).catch(() => { G.scoutData = []; });
    }
  }
  function scoutList() {
    let L = (G.scoutData || []).map((p2) => p2.stam ? p2 : Object.assign({}, p2, { stam: stamOf(p2.name, p2.role || p2.pos) }));
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
        const x0 = 410 + i * 74;
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
      cx.fillText(c[1] + (c[0] === G.scout.sort ? "▼" : ""), 410 + i * 74, 92);
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
        cx.fillText(String(p2[c[0]] != null ? p2[c[0]] : "—"), 410 + j * 74, y);
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
    "EXHIBITION": ["trex", "🏈"], "2-PLAYER VERSUS": ["carno", "🤜🤛"],
    "QUICK MATCH": ["quetz", "🌐"], "ONLINE (LINK)": ["quetz", "🔗"],
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
  function drawOnlineWait() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center";
    const o = G.online || {};
    const searching = o.phase !== "found";
    const dots = ".".repeat(1 + ((performance.now() / 400 | 0) % 3));
    cx.font = PF(22); cx.fillStyle = "#ffd23f";
    cx.fillText(searching ? "FINDING AN OPPONENT" : "OPPONENT FOUND!", W / 2, 190);
    cx.font = PF(11); cx.fillStyle = "#f4f6f1";
    const sub = searching ? "Queuing you into the next player online" + dots
      : (o.role === "host" ? "You're the host — pick the teams…" : "Matched! Waiting for the host to pick teams" + dots);
    cx.fillText(sub, W / 2, 232);
    // a little spinning dino to show it's alive
    if (G.sheets.A && G.sheets.A.quetz) {
      const spr = G.sheets.A.quetz, t = performance.now() / 160 | 0;
      cx.save(); cx.translate(W / 2, 320);
      cx.rotate(searching ? (performance.now() / 500) % (Math.PI * 2) : 0);
      cx.drawImage(spr.R[t % 2], -spr.w, -spr.h, spr.w * 2, spr.h * 2);
      cx.restore();
    }
    netStatus && 0;
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText(searching ? "ESC / TAP = CANCEL" : "", W / 2, H - 56);
    // a tappable cancel chip for mobile
    if (searching) {
      cx.fillStyle = "rgba(5,12,8,.8)"; cx.fillRect(W / 2 - 70, H - 46, 140, 30);
      cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2; cx.strokeRect(W / 2 - 70, H - 46, 140, 30);
      cx.font = PF(10); cx.fillStyle = "#ffd23f"; cx.fillText("CANCEL", W / 2, H - 26);
    }
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
    cx.fillText("S = STANDINGS  ·  T = TEAM STATS  ·  U = TRAIN  ·  ESC = MENU", W / 2, 434);
    // tappable TRAIN chip with the point balance
    const pts = (z.trainPts || 0);
    cx.fillStyle = pts > 0 ? "#14402a" : "rgba(13,37,25,.8)";
    cx.fillRect(W / 2 - 90, 448, 180, 34);
    cx.strokeStyle = pts > 0 ? "#ffd23f" : "#1d4030"; cx.lineWidth = 2;
    cx.strokeRect(W / 2 - 90, 448, 180, 34);
    cx.font = PF(9); cx.fillStyle = pts > 0 ? "#ffd23f" : "#9db0a4";
    cx.fillText("🏋 TRAIN (" + pts + " PTS)", W / 2, 470);
  }

  // ---------------- TRAIN: the clickable upgrade room (#10) ----------------
  // pick a starter, pick an attribute, spend a point: +1, up to +5 per
  // attribute per season. Points come from wins and big offensive days.
  const TRAIN_CAP = 5;
  function trainCols(p2) {
    return p2.role === "QB" || p2.pos === "QB"
      ? [["arm", "ARM"], ["acc", "ACC"], ["spd", "SPD"], ["str", "STR"], ["stam", "STA"]]
      : [["spd", "SPD"], ["hands", "HND"], ["str", "STR"], ["jump", "JMP"], ["stam", "STA"]];
  }
  function upgradeList() {
    const r2 = roster(G.szn.team);
    const rows = [];
    const seen = {};
    for (const [pos, n2] of [["QB", 1], ["RB", 1], ["WR", 2], ["TE", 1]]) {
      const list = r2.offense.filter((p2) => p2.role === pos);
      for (let i = 0; i < n2 && list[i]; i++) rows.push(list[i]);
    }
    const defs = (r2.defense || []).slice().sort((a, b) => (b.ovr || 75) - (a.ovr || 75)).slice(0, 3);
    rows.push(...defs);
    return rows.slice(0, 8);
  }
  function openUpgrade() {
    if (!G.szn) return;
    G.upRows = upgradeList();
    G.state = "upgrade";
  }
  function upgradeCell(mx, my) {
    const rows = G.upRows || [];
    for (let i = 0; i < rows.length; i++) {
      const y = 118 + i * 44;
      if (my < y - 16 || my > y + 12) continue;
      for (let j2 = 0; j2 < 5; j2++) {
        const x = 400 + j2 * 106;
        if (mx > x - 44 && mx < x + 44) return { i, j: j2 };
      }
    }
    return null;
  }
  function upgradeClick() {
    if (mouse.y > H - 50) { G.state = "hub"; return; }
    const hit = upgradeCell(mouse.x, mouse.y);
    if (!hit) return;
    const z = G.szn;
    if ((z.trainPts || 0) <= 0) { banner("NO TRAIN POINTS", "Win games to earn more!", 1.1); return; }
    const p2 = G.upRows[hit.i];
    const [field] = trainCols(p2)[hit.j];
    z.devF = z.devF || {};
    const mine = z.devF[p2.name] = z.devF[p2.name] || {};
    if ((mine[field] || 0) >= TRAIN_CAP) { banner("MAXED THIS SEASON", "+" + TRAIN_CAP + " is the yearly cap per skill", 1.1); return; }
    mine[field] = (mine[field] || 0) + 1;
    z.trainPts--;
    saveSeason();
    G.upRows = upgradeList();   // reflect the boost immediately
    sfx.firstdown();
  }
  function drawUpgrade() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(14); cx.fillStyle = "#ffd23f";
    cx.fillText("🏋 TRAINING ROOM — " + (G.szn.trainPts || 0) + " POINTS", W / 2, 44);
    cx.font = PF(8); cx.fillStyle = "#9db0a4";
    cx.fillText("TAP A STAT TO SPEND A POINT (+1, MAX +" + TRAIN_CAP + "/SKILL/SEASON) · WINS EARN MORE", W / 2, 66);
    const rows = G.upRows || [];
    rows.forEach((p2, i) => {
      const y = 118 + i * 44;
      cx.textAlign = "left"; cx.font = PF(9);
      cx.fillStyle = "#69be28"; cx.fillText((p2.role || p2.pos || "").padEnd(3), 40, y);
      cx.fillStyle = "#f4f6f1"; cx.fillText(lastName(p2.name).slice(0, 14).toUpperCase(), 96, y);
      cx.fillStyle = "#9db0a4"; cx.fillText("OVR " + (p2.ovr || playerOvr(p2)), 290, y);
      const boosts = (G.szn.devF || {})[p2.name] || {};
      trainCols(p2).forEach(([f2, label], j2) => {
        const x = 400 + j2 * 106;
        const hov = mouse.x > x - 44 && mouse.x < x + 44 && mouse.y > y - 16 && mouse.y < y + 12;
        cx.fillStyle = hov ? "#14402a" : "#0d2519";
        cx.fillRect(x - 44, y - 16, 88, 28);
        cx.strokeStyle = hov ? "#ffd23f" : "#1d4030"; cx.lineWidth = 2;
        cx.strokeRect(x - 44, y - 16, 88, 28);
        cx.textAlign = "center"; cx.font = PF(7);
        cx.fillStyle = "#9db0a4"; cx.fillText(label, x - 22, y + 2);
        cx.fillStyle = boosts[f2] ? "#69be28" : "#f4f6f1";
        cx.fillText(String(p2[f2] != null ? p2[f2] : "—") + (boosts[f2] ? " ▲" : " +"), x + 18, y + 2);
      });
    });
    cx.textAlign = "center"; cx.font = PF(9);
    cx.fillStyle = "#ffd23f"; cx.fillText("TAP HERE / ESC = BACK TO THE HUB", W / 2, H - 24);
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
    // a matched guest only WATCHES the host choose — make that clear
    cx.fillText(Net.remoteView ? "🌐 MATCHED! YOUR HOST IS PICKING THE TEAMS…" : "ARROWS / CLICK · ENTER TO CONFIRM", W / 2, 88);
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
    // grip planted but not pulled yet: coach the windup
    if (G.slingAnchor && !G.aim && G.ball.holder && mouse.down) {
      const qb = G.ball.holder;
      cx.font = PF(8); cx.fillStyle = "#ffd23f"; cx.textAlign = "center";
      cx.fillText("⟵ PULL BACK TO WIND UP", qb.x - G.camX, qb.y - 44);
    }
    // aiming arc
    if (G.aim && G.ball.holder) {
      const qb = G.ball.holder;
      const a = G.aim;
      // the windup: a taut "rubber band" from the QB back toward the pull
      cx.strokeStyle = "rgba(255,138,92,.9)"; cx.lineWidth = 3;
      cx.beginPath(); cx.moveTo(qb.x - G.camX, qb.y);
      const bx = qb.x - (a.x - qb.x) * 0.22, by = qb.y - (a.y - qb.y) * 0.22;
      cx.lineTo(bx - G.camX, by); cx.stroke();
      cx.setLineDash([5, 6]); cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2;
      cx.beginPath();
      const n = 14;
      const d = dist(qb, a), h = clamp(d * 0.17, 20, 74);
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        const px = qb.x + (a.x - qb.x) * k - G.camX;
        const py = qb.y + (a.y - qb.y) * k - (h * 4 * k * (1 - k));
        if (i === 0) cx.moveTo(px, py); else cx.lineTo(px, py);
      }
      cx.stroke(); cx.setLineDash([]);
      // No magic threat percentage/ring: the football, coverage leverage,
      // and this modest landing cross are the read.  The game still judges
      // risk underneath, but it never pretends to be a targeting computer.
      const markX = a.x - G.camX, markY = a.y;
      cx.fillStyle = "rgba(244,246,241,.88)";
      cx.fillRect(markX - 5, markY - 1, 10, 2); cx.fillRect(markX - 1, markY - 5, 2, 10);
      cx.font = PF(7); cx.fillStyle = "rgba(244,246,241,.72)"; cx.textAlign = "center";
      cx.fillText("RELEASE", markX, markY - 16);
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
        else if (cc.canPass) prompt("HOLD & PULL BACK TO PASS · Q LATERAL");
      } else if (!offenseIsUser() && cc.soarT <= 0) {
        if (cc.species === "quetz" && soarReady(cc)) {
          prompt((cc.soarCharge >= 0.98 ? "SOAR — FULL RANGE" : "SOAR — SHORT HOP (" + Math.round(cc.soarCharge * 100) + "%)"), "#8ecafc");
        }
        else if (cc.species === "quetz") prompt("WINGS CHARGING " + Math.round((cc.soarCharge || 0) * 100) + "%", "#5a7a94");
        else if (cc.blockedBy) prompt("SHIFT: SPIN OFF THE BLOCK", "#ff8a5c");
        else if (G.carrier && dist(cc, G.carrier) < 46) prompt("JUMP + F PUNCH", "#ff8a5c");
      }
    }
    // defense footer hint
    if (!offenseIsUser() && G.controlled) {
      cx.font = PF(8); cx.fillStyle = "rgba(244,246,241,.7)"; cx.textAlign = "center";
      const soarer = G.controlled.species === "quetz";
      cx.fillText("TAB SWITCH · SPACE JUMP · CLICK/E DIVE · JUMP+F PUNCH" + (soarer ? " · PULL-CLICK / SHIFT = SOAR" : ""), W / 2, H - 14);
    }
  }

  function drawKickUI() {
    const k = G.kick;
    const meter = kickMeterPlan(k);
    const bx = W / 2 - 220, bw = 440;
    cx.fillStyle = "rgba(5,12,8,.78)"; cx.fillRect(W / 2 - 250, 82, 500, 166);
    cx.strokeStyle = "#ffd23f"; cx.strokeRect(W / 2 - 250, 82, 500, 166);
    cx.textAlign = "center";
    cx.font = PF(14); cx.fillStyle = "#ffd23f";
    const title = k.kind === "XP" ? "EXTRA POINT" : k.kind === "FG" ? "FIELD GOAL · " + Math.round(100 - G.losYd + 17) + " YDS" : k.kind === "KO" ? "KICKOFF · COVER THE RETURN" : "PUNT · PIN THEM DEEP";
    cx.fillText(title, W / 2, 112);
    cx.font = PF(9); cx.fillStyle = "#f4f6f1";
    cx.fillText(lastName(k.kicker.name).toUpperCase() + "  LEG " + (k.kicker.leg || 84) + " · ACC " + (k.kicker.kacc || kickAccOf(k.kicker.name)) + (k.cpu ? "  (CPU)" : ""), W / 2, 135);
    // Retro Bowl's great UI trick: the user sees the makeable lane first,
    // then stops one bright cursor in it.  The same line is reused for aim so
    // the kick stays fast, readable, and does not cover the live rush.
    const powerStage = k.stage === 0;
    const laneStart = powerStage ? meter.powerMin : clamp(meter.accCenter - meter.accHalf, 0, 100);
    const laneEnd = powerStage ? 100 : clamp(meter.accCenter + meter.accHalf, 0, 100);
    const val = powerStage ? k.val : (k.stage === 1 ? k.val : k.acc + 50);
    const by = 164;
    cx.fillStyle = "#6d241a"; cx.fillRect(bx, by, bw, 28);
    cx.fillStyle = "#2f8f47"; cx.fillRect(bx + bw * laneStart / 100, by, bw * (laneEnd - laneStart) / 100, 28);
    // A light centre stripe makes the highest-accuracy portion obvious while
    // preserving the full skill-scaled green window on either side.
    if (!powerStage) {
      cx.fillStyle = "rgba(244,246,241,.25)";
      cx.fillRect(bx + bw * (meter.accCenter - 1.2) / 100, by, bw * 2.4 / 100, 28);
    }
    cx.strokeStyle = "#f4f6f1"; cx.strokeRect(bx, by, bw, 28);
    const vx = bx + bw * clamp(val, 0, 100) / 100;
    cx.fillStyle = "#ffd23f"; cx.fillRect(vx - 4, by - 5, 8, 38);
    cx.fillStyle = "#fff9d0"; cx.fillRect(vx - 1, by - 7, 2, 42);
    cx.font = PF(9); cx.fillStyle = "#f4f6f1";
    const stageText = powerStage ? (k.kind === "KO" ? "KICK DEPTH — STOP IN THE GREEN" : "KICK POWER — STOP IN THE GREEN") : "AIM — STOP IN THE GREEN";
    cx.fillText(stageText, W / 2, 217);
    if (!k.cpu) {
      cx.font = PF(8); cx.fillStyle = "#9db0a4";
      cx.fillText("CLICK / SPACE TO LOCK " + (powerStage ? "POWER" : "AIM"), W / 2, 236);
    }
    // wind
    const wd = G.weather.wind;
    cx.font = PF(9); cx.fillStyle = "#8ecafc";
    cx.fillText("WIND " + Math.round(Math.hypot(wd.x, wd.y) / 6) + " " + windArrow(), W / 2 + 178, 112);
  }

  function drawSidelineDino(x, feetY, seed, faceRight) {
    // Sideline staff retain their bare-dino sprites. Spectators use the block
    // helper below, so this is never used to populate a crowd or fan bench.
    const herd = G.fanSprites;
    const keys = DinoSprites.FAN_SPECIES_KEYS || (herd ? Object.keys(herd) : []);
    if (!herd || !keys.length) return;
    const key = keys[((seed % keys.length) + keys.length) % keys.length];
    const pack = herd[key];
    if (!pack) return;
    const frame = ((Math.floor(performance.now() / 260) + seed) % pack.n + pack.n) % pack.n;
    const img = (faceRight ? pack.R : pack.L)[frame];
    cx.drawImage(img, Math.round(x - img.width / 2), Math.round(feetY - img.height));
  }

  function drawSidelineFanBlock(x, feetY, seed) {
    const home = G.stadium && TEAMS[G.stadium.home];
    const palette = crowdFanPalette(home && home[1]);
    const w = 5 + ((seed >>> 1) % 2) * 2;
    const h = 7 + ((seed >>> 4) % 2) * 2;
    const top = Math.round(feetY - h);
    // These follow the same clean, rectilinear language as the far stands.
    // There are no sprite frames or animated limbs to misread as players.
    cx.fillStyle = "#101720";
    cx.fillRect(Math.round(x - w / 2 - 1), top + h, w + 2, 2);
    cx.fillStyle = palette[((seed * 7) >>> 0) % palette.length];
    cx.fillRect(Math.round(x - w / 2), top, w, h);
    if ((seed >>> 7) % 3 === 0) {
      cx.fillStyle = "rgba(244,246,241,.4)";
      cx.fillRect(Math.round(x - w / 2 + 1), top + 1, Math.max(1, w - 3), 1);
    }
  }

  function drawSidelineLife(cam) {
    const topFeet = TOP - 2, botFeet = BOT + 22;
    // field-space positions instead of screen-space looping keeps a coach at
    // the same 35-yard line while the camera follows a long return.
    for (let i = -2; i < 46; i++) {
      const wx = i * 68 + 18;
      const sx = wx - cam;
      if (sx < -20 || sx > W + 20) continue;
      const lower = i % 2 === 0;
      const feetY = lower ? botFeet : topFeet;
      const type = ((i % 7) + 7) % 7;
      if (type === 0) { // yellow-coat chain crew and marker
        drawSidelineDino(sx - 4, feetY, i, !lower);
        cx.fillStyle = "#f2a900"; cx.fillRect(sx + 8, feetY - 27, 2, 34);
        cx.fillStyle = "#ffd23f"; cx.fillRect(sx + 4, feetY - 28, 10, 8);
        continue;
      }
      if (type === 1) { // television camera person
        drawSidelineDino(sx - 2, feetY, i, !lower);
        cx.fillStyle = "#252c36"; cx.fillRect(sx + 4, feetY - 17, 12, 8);
        cx.fillStyle = "#707d88"; cx.fillRect(sx + 14, feetY - 16, 8, 4);
        cx.fillStyle = "#10151c"; cx.fillRect(sx + 7, feetY - 9, 2, 9); cx.fillRect(sx + 15, feetY - 9, 2, 9);
        continue;
      }
      if (type === 2 || type === 5) { // bench of compact block-fan spectators
        cx.fillStyle = "#7a4b27"; cx.fillRect(sx - 16, feetY + 1, 32, 4);
        for (let j = -1; j <= 1; j++) {
          const bx = sx + j * 8;
          drawSidelineFanBlock(bx, feetY, i + j * 11);
        }
        continue;
      }
      // Coaches, medics, and ball kids are dinos too; props identify their
      // job without putting a human silhouette back into the dino stadium.
      drawSidelineDino(sx, feetY, i + type * 7, !lower);
      if (type === 3) { // coach clipboard
        cx.fillStyle = "#c9b48a"; cx.fillRect(sx + 5, feetY - 16, 5, 8);
        cx.fillStyle = "#5a4a30"; cx.fillRect(sx + 6, feetY - 14, 3, 1); cx.fillRect(sx + 6, feetY - 11, 3, 1);
      }
      if (type === 4) { // medic kit
        cx.fillStyle = "#8ecafc"; cx.fillRect(sx - 12, feetY - 7, 7, 5);
        cx.fillStyle = "#f4f6f1"; cx.fillRect(sx - 10, feetY - 6, 3, 1); cx.fillRect(sx - 9, feetY - 7, 1, 3);
      }
      if (type === 6) { // ball kid's football
        cx.fillStyle = "#8a4a1f"; cx.fillRect(sx + 9, feetY - 9, 5, 3);
        cx.fillStyle = "#f4e6c6"; cx.fillRect(sx + 11, feetY - 8, 1, 1);
      }
    }
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
    // rampage meter (one per half — spent = grayed out until the break)
    const rampSpent = !G.practice && G.rampUsed && G.rampUsed.A === (G.quarter <= 2 ? 1 : 2);
    cx.fillStyle = "#0d2519"; cx.fillRect(W - 104, 8, 90, 14);
    const rp = G.rampage.A;
    cx.fillStyle = rampSpent ? "#3a4441" : (rp >= 100 ? "#ff4444" : "#e8622c");
    cx.fillRect(W - 104, 8, 90 * (rampSpent ? 1 : rp / 100), 14);
    cx.strokeStyle = "#f4f6f1"; cx.strokeRect(W - 104, 8, 90, 14);
    cx.font = PF(7); cx.textAlign = "center";
    cx.fillStyle = rampSpent ? "#9db0a4" : "#fff";
    cx.fillText(rampSpent ? "SPENT·½" : (rp >= 100 ? "R=RAMPAGE!" : "🦖RAMPAGE"), W - 59, 18);

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
    cx.fillText("ENTER / TAP = CONTINUE  ·  B = BOX SCORE", W / 2, 348);
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
      const gx = 100 + (i % 4) * 210, gy = 58 + ((i / 4) | 0) * 158;
      const frameCount = key === "quetz" ? Math.min(2, spr.n) : spr.n;
      cx.drawImage(spr.R[t % frameCount], gx, gy, spr.w * 2.0, spr.h * 2.0);
      cx.font = PF(8); cx.fillStyle = "#f4f6f1";
      cx.fillText(label, gx + spr.w, gy + spr.h * 2.0 + 14);
    }
    cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("G TO CLOSE", W / 2, H - 20);
  }

  function drawQAOverlay() {
    const s = G.qaScene;
    if (!s) return;
    // Keep the label out of the action's central read; GIF reviewers can see
    // both the football moment and exactly which behavior is under inspection.
    cx.fillStyle = "rgba(4,10,7,.82)"; cx.fillRect(18, H - 34, 370, 18);
    cx.strokeStyle = "rgba(255,210,63,.78)"; cx.strokeRect(18, H - 34, 370, 18);
    cx.textAlign = "left"; cx.font = PF(7); cx.fillStyle = "#ffd23f";
    cx.fillText("QA · " + s.caption, 28, H - 21);
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
      " PULL BACK ......... hold click, drag backward, release = lob",
      " SPACE / R-CLICK ... BULLET pass while aiming (fast + flat)",
      " WASD run · SHIFT juke · E dive · X throwaway",
      " Q while running ... aim a LATERAL (backward, live ball!)",
      " QB sneak / handoff behind the line can still THROW",
      "",
      "DEFENSE — you control the ▼ dino. TAB switch · SPACE dive.",
      " SPACE then F .... PEANUT PUNCH the ball out midair",
      " SHIFT (safety) .... QUETZALCOATLUS SOARS in a straight line",
      "",
      "R = RAMPAGE when the ★ APEX dino's meter is full.",
      "Every team has ONE apex — sometimes on defense!",
      "SNOWBALL HITS = cold + slow (except ICEMAN Caleb) · V = throw snowball",
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
    enterPlaycall, buildPlayers, changePossession, enterKick, startKickoff, startKickReturn, signaturePlay, choosePlay, tryRampage, lateral, dropBall, goForTwo, resolveArrival, breakOnBall, kickMeterPlan, assessPassWindow, cpuQB, cpuReadBoard,
    cpuChooseDef, cpuChooseOff, saveCpuMemory, newSeason, startPlayoffs, seasonAfterGame, startSeasonGame, gameOver, simWeekOthers, pickWeather, makeStadium,
    resolvePlayerContacts, resolveVisualSpriteContacts, visualMasksOverlap,
    bodyRadius, bodyContactRange, stageHighlight, spriteFrameFor: selectGameplaySpriteFrame,
    get szn() { return G.szn; }
  };

  boot();
  requestAnimationFrame(loop);
})();
