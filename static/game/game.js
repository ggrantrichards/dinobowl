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
  // Retro Bowl-style pacing: short quarters + a RUNNING clock (the clock
  // ticks through the huddle and presnap; stoppages freeze it until the snap)
  const QUARTER_LEN = 120;
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
  // `primary` = the play's intended first read — it draws in GOLD on the
  // field and the call sheet so every card telegraphs its intent at a glance
  const OFF_PLAYS = [
    { name: "FOUR VERTS", type: "pass", tags: ["deep"], primary: "WR1", routes: { WR1: R.go, WR3: R.seam, TE: R.seam, WR2: R.go, RB: R.block } },
    { name: "SLANTS", type: "pass", tags: ["quick"], primary: "WR3", routes: { WR1: R.slantIn(1), WR3: R.slantIn(1), TE: R.flat(1), WR2: R.slantIn(-1), RB: R.block } },
    { name: "CURL FLAT", type: "pass", tags: ["medium"], primary: "WR1", routes: { WR1: R.curl, WR3: R.flat(-1), TE: R.seam, WR2: R.curl, RB: R.flat(1) } },
    { name: "POST CORNER", type: "pass", tags: ["deep"], primary: "TE", routes: { WR1: R.post(1), WR3: R.drag(1), TE: R.corner(-1), WR2: R.post(-1), RB: R.screen } },
    { name: "MESH", type: "pass", tags: ["quick", "medium"], primary: "WR3", routes: { WR1: R.slantIn(1), WR3: R.drag(1), TE: R.drag(-1), WR2: R.go, RB: R.wheel(-1) } },
    { name: "RB SCREEN", type: "pass", tags: ["quick", "screen"], primary: "RB", routes: { WR1: R.go, WR3: R.go, TE: R.block, WR2: R.go, RB: R.screen } },
    { name: "DAGGER", type: "pass", tags: ["medium", "deep"], primary: "WR3", routes: { WR1: R.go, WR3: R.dig(1), TE: R.flat(1), WR2: R.comeback, RB: R.block } },
    { name: "FLOOD", type: "pass", tags: ["medium"], primary: "WR3", routes: { WR1: R.corner(1), WR3: R.out(1), TE: R.flat(1), WR2: R.drag(1), RB: R.block } },
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
  // Master SFX trim (owner: match Retro Bowl's restraint — quiet accents)
  const SFX_MASTER = 0.85;   // grunts/pads up a notch (owner mix 2026-08-07)
  let AC = null, muted = false;
  // Mixer buses: music / sfx / crowd → master (+ gentle limiter). Volumes
  // persist in localStorage. OWNER MIX LAW (play-test 2026-08-06, Pixel
  // Gridiron): the crowd is a bed UNDER the action, never over it — its bus
  // ceiling keeps every roar below the action SFX layer.
  let masterBus = null, musicBus = null, sfxBus = null, crowdBus = null;
  let volMusic = 0.7, volSfx = 1.0;
  try { const v = localStorage.getItem("dinobowl_vol_music"); if (v != null) volMusic = Math.max(0, Math.min(1, Number(v))); } catch (_) { }
  try { const v = localStorage.getItem("dinobowl_vol_sfx"); if (v != null) volSfx = Math.max(0, Math.min(1, Number(v))); } catch (_) { }
  function ensureAC() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      // a hidden tab must go SILENT: without this, a backgrounded game keeps
      // its sequencer alive forever (audio tabs dodge timer throttling) — the
      // owner heard "two musics" from a second tab (play-test 2026-08-07)
      try {
        document.addEventListener("visibilitychange", () => {
          // alt-tab must not burn game clock or leave the sim running blind
          if (document.hidden && ["live", "presnap", "playcall", "defcall", "dead", "kick", "kickfly", "ptchoice"].includes(G.state) && !G.practice) {
            G.paused = true;
          }
          if (!AC) return;
          if (document.hidden) { stopMusic(); AC.suspend(); }
          else AC.resume();
        });
      } catch (_) { }
    }
    if (!masterBus) {
      masterBus = AC.createGain(); masterBus.gain.value = 1;
      const comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 7;
      masterBus.connect(comp); comp.connect(AC.destination);
      // owner mix (2026-08-07): music UNDER the game sounds — grunts and the
      // crowd must read; music is a bed, the field is the band
      musicBus = AC.createGain(); musicBus.gain.value = 0.32 * volMusic;
      sfxBus = AC.createGain(); sfxBus.gain.value = volSfx;
      crowdBus = AC.createGain(); crowdBus.gain.value = 1.1;
      musicBus.connect(masterBus); sfxBus.connect(masterBus); crowdBus.connect(masterBus);
    }
    return AC;
  }
  function setVol(kind, v) {
    v = Math.max(0, Math.min(1, v));
    if (kind === "music") { volMusic = v; if (musicBus) musicBus.gain.value = 0.32 * v; }
    else { volSfx = v; if (sfxBus) sfxBus.gain.value = v; }
    try { localStorage.setItem("dinobowl_vol_" + kind, String(v)); } catch (_) { }
  }
  function beep(f, dur, type, vol, delay, bus) {
    if (muted) return;
    try {
      ensureAC();
      const t0 = AC.currentTime + (delay || 0);
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type || "square"; o.frequency.value = f;
      g.gain.setValueAtTime((vol || 0.06) * SFX_MASTER, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(bus || sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  // A filtered NOISE BURST is the other half of every physical game sound.
  // An oscillator alone reads as a synth tone; pads, turf, leather, and crowd
  // reactions are all broadband. `from`→`to` sweeps the filter over the burst
  // (down = impact/settle, up = whoosh/rise) and `attack` shapes swells.
  function noiseBurst(o) {
    if (muted) return;
    try {
      ensureAC();
      o = o || {};
      const t0 = AC.currentTime + (o.delay || 0);
      const dur = o.dur || 0.12, attack = Math.min(o.attack || 0.004, dur * 0.5);
      const sr = AC.sampleRate;
      const buf = AC.createBuffer(1, Math.max(32, sr * dur) | 0, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource(); src.buffer = buf;
      const f = AC.createBiquadFilter();
      f.type = o.type || "bandpass"; f.Q.value = o.q == null ? 0.9 : o.q;
      f.frequency.setValueAtTime(Math.max(30, o.from || 800), t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to || o.from || 800), t0 + dur);
      const g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime((o.vol || 0.08) * SFX_MASTER, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
      src.start(t0); src.stop(t0 + dur + 0.03);
    } catch (e) { /* audio unavailable */ }
  }
  // A pitch-dropping sine is the WEIGHT of a hit — the part you feel.
  function thump(f0, f1, dur, vol, delay, bus) {
    if (muted) return;
    try {
      ensureAC();
      const t0 = AC.currentTime + (delay || 0);
      const osc = AC.createOscillator(), g = AC.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(Math.max(24, f0), t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, f1), t0 + dur);
      g.gain.setValueAtTime((vol || 0.08) * SFX_MASTER, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(bus || sfxBus);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  // looping crowd bed — swells in close 4th quarters and after big plays
  let crowdGain = null, crowdSpike = 0;
  let cheerBusy = 0;
  function initCrowd() {
    if (crowdGain || !AC) return;
    try {
      ensureAC();
      const sr = AC.sampleRate;
      crowdGain = AC.createGain(); crowdGain.gain.value = 0;
      crowdGain.connect(crowdBus);
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
      src.connect(bp); bp.connect(g); g.connect(crowdBus);
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
  // the crowd DEFLATES: a falling, murmuring "awwww" when the home side's
  // play dies — the emotional counterweight that makes the cheers land
  let awwBusy = 0;
  function crowdAww(intensity) {
    if (!AC || muted || awwBusy > AC.currentTime - 1.4) return;
    try {
      awwBusy = AC.currentTime;
      const k = Math.max(0.4, Math.min(1.2, intensity || 0.6));
      // the voice mass sags downward in pitch — everyone sitting back down
      // (kept SHORT so it reads as a reaction, not a soundtrack)
      noiseBurst({ from: 1050, to: 480, dur: 0.85 + k * 0.35, vol: 0.05 * k, q: 0.8, attack: 0.14, bus: crowdBus });
      noiseBurst({ from: 620, to: 300, dur: 1.0 + k * 0.3, vol: 0.035 * k, q: 0.7, attack: 0.2, delay: 0.06, bus: crowdBus });
      // a few grumbling low voices under it
      thump(180, 95, 0.5, 0.02 * k, 0.15, crowdBus);
    } catch (e) { /* ignore */ }
  }

  // Every physical sound is LAYERED (noise transient + tonal body) and the
  // heavy ones accept an intensity so a de-cleater is audibly bigger than an
  // arm tackle and a 40-yard strike bigger than a checkdown.
  const sfx = {
    snap: () => { thump(190, 95, 0.08, 0.045); noiseBurst({ from: 1100, to: 450, dur: 0.045, vol: 0.028 }); },
    throw: () => noiseBurst({ from: 450, to: 2300, dur: 0.2, vol: 0.05, q: 1.6, attack: 0.05 }),          // rising whoosh
    bullet: () => { noiseBurst({ from: 800, to: 3400, dur: 0.13, vol: 0.065, q: 2.2, attack: 0.015 }); thump(320, 150, 0.06, 0.028); }, // snappy zip
    catch: (big) => {                                          // leather "pock" + chest "thump"
      const k = big ? 1.45 : 1;
      noiseBurst({ from: 1600, to: 650, dur: 0.045, vol: 0.055 * k, q: 1.2 });
      thump(230, 105, 0.1, 0.05 * k, 0.014);
      if (big) noiseBurst({ from: 500, to: 220, dur: 0.12, vol: 0.035, type: "lowpass", q: 0.5, delay: 0.03 });
    },
    tackle: (force) => {                                       // pad crack + body thud + sub weight
      const k = clamp(force == null ? 1 : force, 0.55, 2.2);
      noiseBurst({ from: 2600, to: 320, dur: 0.05, vol: 0.05 * k, q: 0.7 });
      noiseBurst({ from: 430, to: 110, dur: 0.14 + 0.04 * k, vol: 0.07 * k, type: "lowpass", q: 0.5, delay: 0.012 });
      thump(150, 44, 0.18 + 0.07 * k, 0.1 * k, 0.014);
    },
    whistle: () => { beep(1420, 0.26, "triangle", 0.05); beep(1420, 0.18, "triangle", 0.05, 0.3); },
    td: () => {                                                // fanfare with a bass floor + sparkle
      duckMusic(0.3, 1.4);
      [523, 659, 784, 1047].forEach((f, i) => { beep(f, 0.17, "square", 0.065, i * 0.13); beep(f / 2, 0.2, "triangle", 0.05, i * 0.13); });
      noiseBurst({ from: 900, to: 4200, dur: 0.5, vol: 0.03, q: 1.1, attack: 0.1, delay: 0.36 });
    },
    pick: () => {                                              // sting + the stadium inhaling
      duckMusic(0.35, 1.0);
      [700, 500, 350].forEach((f, i) => { beep(f, 0.14, "square", 0.065, i * 0.11); beep(f * 0.5, 0.16, "triangle", 0.04, i * 0.11); });
      noiseBurst({ from: 500, to: 1400, dur: 0.35, vol: 0.03, q: 0.8, attack: 0.3 });
    },
    roar: () => {                                              // T-rex: sub growl + throat rasp
      thump(120, 40, 0.7, 0.14);
      noiseBurst({ from: 300, to: 90, dur: 0.65, vol: 0.08, type: "lowpass", q: 0.6, attack: 0.05 });
      beep(55, 0.6, "sawtooth", 0.1, 0.08);
    },
    kick: () => { thump(260, 90, 0.09, 0.06); noiseBurst({ from: 900, to: 350, dur: 0.05, vol: 0.045 }); },
    doink: () => { beep(1180, 0.08, "square", 0.09); beep(760, 0.12, "triangle", 0.05, 0.05); noiseBurst({ from: 3200, to: 1600, dur: 0.09, vol: 0.03, q: 3 }); },
    juke: () => noiseBurst({ from: 700, to: 2600, dur: 0.07, vol: 0.04, q: 1.8 }),   // a swish of turf
    firstdown: () => [600, 800].forEach((f, i) => beep(f, 0.1, "square", 0.06, i * 0.1)),
  };

  // ------------------------------------------------------------------ music
  // Chiptune step-sequencer: 16th-note patterns on a lookahead scheduler.
  // Two loops — a laid-back title/hub theme and a driving gameday loop —
  // plus a duck() so jingles and big SFX sit on top. All synthesized.
  const NOTE_FREQ = (() => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const out = {};
    for (let oct = 1; oct <= 7; oct++) names.forEach((n, i) => {
      out[n + oct] = 440 * Math.pow(2, (oct * 12 + i - 57) / 12);
    });
    return out;
  })();
  const SONGS = {
    /* Title theme — big open plains, something ancient sunning itself. Dm Bb F C */
    menu: {
      bpm: 92,
      lead: { wave: "square", vol: 0.13, pat:
        "D4 = - F4 G4 = - - A4 = G4 F4 D4 = = = " +
        "A#3 = - D4 F4 = - - G4 = F4 D4 C4 = = = " +
        "F4 = - A4 C5 = A4 = F4 = G4 A4 F4 = = = " +
        "C4 = E4 = G4 = = = A4 = G4 E4 C4 = = = " },
      bass: { wave: "triangle", vol: 0.2, pat:
        "D2 - - D2 - - D2 - D2 - - D2 - - A2 - " +
        "A#1 - - A#1 - - A#1 - A#1 - - A#1 - - F2 - " +
        "F2 - - F2 - - F2 - F2 - - F2 - - C2 - " +
        "C2 - - C2 - - C2 - C2 - G2 - E2 - - - " },
      arp: { wave: "square", vol: 0.045, pat:
        "D5 A4 F4 A4 " .repeat(4) + "D5 A#4 F4 A#4 " .repeat(4) +
        "C5 A4 F4 A4 " .repeat(4) + "E5 C5 G4 C5 " .repeat(4) },
      drums: { vol: 0.45, pat: "K - - - S - - h K - K - S - h h " .repeat(4) }
    },
    /* Gameday — stomping, primal. Em G A C */
    game: {
      bpm: 128,
      lead: { wave: "square", vol: 0.1, pat:
        "E4 - G4 - B4 = A4 G4 E4 - G4 - A4 = = - " +
        "G4 - B4 - D5 = C5 B4 G4 - B4 - D5 = = - " +
        "A4 - C5 - E5 = D5 C5 A4 - C5 - E5 = = - " +
        "C5 = B4 A4 G4 = E4 = D4 = E4 G4 E4 = = - " },
      bass: { wave: "triangle", vol: 0.22, pat:
        "E2 E2 - E2 - E2 E3 - E2 E2 - E2 - E2 E3 - " +
        "G2 G2 - G2 - G2 G3 - G2 G2 - G2 - G2 G3 - " +
        "A2 A2 - A2 - A2 A3 - A2 A2 - A2 - A2 A3 - " +
        "C2 C2 - C2 - C2 C3 - C2 C2 - C2 - C2 C3 - " },
      arp: { wave: "square", vol: 0.035, pat:
        "E5 B4 G4 B4 " .repeat(4) + "G5 D5 B4 D5 " .repeat(4) +
        "A5 E5 C5 E5 " .repeat(4) + "G5 E5 C5 E5 " .repeat(4) },
      drums: { vol: 0.55, pat: "K - h - S - h h K - K h S - h h " .repeat(4) }
    }
  };
  let songName = null, songStep = 0, songNextT = 0, songTimer = null, songParsed = null, musicDuck = 1;
  function chipNote(wave, freq, t, dur, vol) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = wave; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.03));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function drumHit(kind, t, vol) {
    if (kind === "K") {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
      g.gain.setValueAtTime(vol * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      o.connect(g); g.connect(musicBus);
      o.start(t); o.stop(t + 0.13);
    } else {
      noiseBurst({ from: kind === "S" ? 1800 : 7000, to: kind === "S" ? 1200 : 6000,
                   dur: kind === "S" ? 0.08 : 0.03, vol: vol * (kind === "S" ? 0.28 : 0.15),
                   q: 0.9, bus: musicBus, delay: Math.max(0, t - AC.currentTime) });
    }
  }
  function playSong(name) {
    if (songName === name || muted) return;
    stopMusic();
    const song = SONGS[name];
    if (!song || !AC || AC.state !== "running") return;   // wait for first gesture
    songName = name; songStep = 0;
    songNextT = AC.currentTime + 0.05;
    songParsed = {};
    for (const ch of ["lead", "bass", "arp"]) songParsed[ch] = song[ch].pat.trim().split(/\s+/);
    songParsed.drums = song.drums.pat.trim().split(/\s+/);
    const tick = () => {
      if (songName !== name || !AC) return;
      const stepDur = 60 / song.bpm / 4;
      while (songNextT < AC.currentTime + 0.25) {
        const t = songNextT, step = songStep;
        for (const ch of ["lead", "bass", "arp"]) {
          const pat = songParsed[ch];
          const cell = pat[step % pat.length];
          if (cell === "-" || cell === "=") continue;
          const f = NOTE_FREQ[cell];
          if (!f) continue;
          let len = 1;
          while (pat[(step + len) % pat.length] === "=") len++;
          chipNote(song[ch].wave, f, t, stepDur * len * 0.9, song[ch].vol * musicDuck);
        }
        const d = songParsed.drums[step % songParsed.drums.length];
        if (d !== "-") drumHit(d, t, song.drums.vol * musicDuck);
        songNextT += stepDur;
        songStep++;
      }
      songTimer = setTimeout(tick, 90);
    };
    tick();
  }
  function stopMusic() {
    songName = null;
    if (songTimer) { clearTimeout(songTimer); songTimer = null; }
  }
  function duckMusic(amount, secs) {
    musicDuck = amount;
    setTimeout(() => { musicDuck = 1; }, secs * 1000);
  }
  // which song fits the current screen — checked every frame, no-ops when set
  const MATCH_STATES = { intro: 1, playcall: 1, defcall: 1, presnap: 1, live: 1, dead: 1, kick: 1, kickfly: 1, replay: 1, ptchoice: 1, halftime: 1, over: 1, qa: 1 };
  function updateMusic() {
    if (muted) { stopMusic(); return; }
    if (!AC || AC.state !== "running") return;
    playSong(MATCH_STATES[G.state] ? "game" : "menu");
  }

  // ------------------------------------------------------------------- state
  const cv = document.getElementById("game");
  // `cx` is a binding, not a constant: the static-turf bake below points it
  // at an offscreen context for one synchronous paint and then puts it
  // straight back (see ensureFieldCache).
  let cx = cv.getContext("2d");
  cx.imageSmoothingEnabled = false;

  // ------------------------------------------------------ safe localStorage
  // localStorage is TWO separate hazards, and both used to reach the G
  // initializer below unguarded — where a throw kills the whole IIFE and the
  // player gets a permanently black canvas with no in-game way to recover:
  //   1. ACCESS itself throws — Safari private browsing, "block all cookies",
  //      or site-data-disabled. No corruption needed; the game simply never
  //      booted on those devices.
  //   2. The VALUE is corrupt — a write truncated by a killed tab or a quota
  //      error, or the literal string "undefined" (what setItem stores when
  //      handed an undefined). JSON.parse throws on all of those.
  // Every read/write now goes through these. A bad save starts fresh; storage
  // being unavailable just means nothing persists. Neither can stop the boot.
  // (loadCpuMemory/loadDyn already did this correctly — this generalizes it.)
  function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function lsSet(key, val) { try { localStorage.setItem(key, String(val)); return true; } catch (_) { return false; } }
  function lsDel(key) { try { localStorage.removeItem(key); } catch (_) { } }
  // parse + SHAPE-VALIDATE: a save that parses but is the wrong shape (an older
  // schema, a hand-edited value) is just as fatal downstream as a syntax error,
  // and NaN written into a persisted number is permanent corruption.
  function lsJSON(key, fallback, validate) {
    try {
      const raw = lsGet(key);
      if (raw == null || raw === "" || raw === "undefined" || raw === "null") return fallback;
      const v = JSON.parse(raw);
      if (v == null || (validate && !validate(v))) return fallback;
      return v;
    } catch (_) { return fallback; }
  }
  function lsInt(key, def) { const n = parseInt(lsGet(key), 10); return Number.isFinite(n) ? n : def; }

  const G = {
    state: "loading", bootT: 0,
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
    camX: 0, shake: 0, zoom: 1, zoomPunch: 0, selA: 0, selB: 0, selStep: 0,
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
    diff: lsInt("dinobowl_diff", 1),
    record: lsJSON("dinobowl_record", { w: 0, l: 0, t: 0 },
      (v) => Number.isFinite(v.w) && Number.isFinite(v.l) && Number.isFinite(v.t)),
  };
  const DIFFS = [
    // cushion: px of trail-technique separation a man-coverage DB allows
    // (source: trail = lerp(10,40,diff/10) at 20px/yd; scaled to 24px/yd and
    // the VETERAN anchor deliberately RAISED so contested arrivals become a
    // minority — measured 68-77% of arrivals were 50/50 duels, LESSONS #26).
    // coverLag: seconds the DB keeps driving the receiver's PRE-BREAK stem.
    { name: "HATCHLING", defSpd: 0.92, cpuThink: 1.35, catchBonus: 0.08, coverLag: 0.80, cushion: 38, tdP: 0.16 },
    { name: "VETERAN", defSpd: 1.0, cpuThink: 1.0, catchBonus: 0, coverLag: 0.62, cushion: 28, tdP: 0.24 },
    { name: "APEX", defSpd: 1.07, cpuThink: 0.75, catchBonus: -0.06, coverLag: 0.42, cushion: 18, tdP: 0.32 },
    // LIVE row — refreshDynamicDiff() rewrites EVERY gameplay field in place
    // (diff() sits on per-frame hot paths, so the row is mutated, never
    // reallocated). Values here are only the pre-init placeholder.
    { name: "DYNAMIC", defSpd: 1.0, cpuThink: 1.0, catchBonus: 0, coverLag: 0.62, cushion: 28, tdP: 0.24 },
  ];
  const DIFF_DYNAMIC = 3;
  const diff = () => DIFFS[G.diff] || DIFFS[1];
  // The AI must never ask for a spot physics forbids (LESSONS #14): the
  // contested-mode solver core is bodyContactRange × ~0.62, so the tightest
  // cushion resolves to "as close as the bodies allow", not inside them.
  const CUSHION_FLOOR_MULT = 0.62;
  function coverCushion(e, tgt) {
    return Math.max(diff().cushion, bodyContactRange(e, tgt, 0) * CUSHION_FLOOR_MULT);
  }
  // --- RETRO BOWL BLOCK GRIND (RETRO_BOWL_MECHANICS §3): no hold timer, no
  // dice at contact. The rusher POURS work into the rep each frame and the
  // blocker's grade IS the threshold. Mirrors the checkTackles pattern
  // (tackleAcc vs takedownAt) with the roles swapped to Dino Bowl's inverted
  // win condition (threshold crossed = the RUSHER sheds and runs free).
  const BLK_FEED_BASE = 100;      // work units/sec from a str-75 rusher
  const BLK_FEED_PER_PT = 0.020;  // +2% feed per str point over 75
  const BLK_ANCHOR_BASE = 130;    // work units a blk-75 blocker absorbs
  const BLK_ANCHOR_PER_PT = 3.0;  // +3 units per blk point over 75
  // per-SNAP dice, rolled ONCE at latch — the source's own irandom(3..5) on
  // my_tackle_limit (±~18%). Never per-frame (LESSONS #15).
  const BLK_JITTER_LO = 0.82, BLK_JITTER_HI = 1.18;
  const BLK_RUN_ANCHOR_MULT = 1.45;   // drive blocking holds longer
  const BLK_HOLD_FLOOR = 0.55;        // no instant sheds
  const BLK_HOLD_CEIL_PASS = 2.0, BLK_HOLD_CEIL_RUN = 2.6;
  const BLK_TECH_FEED = { spin: 1.30, speed: 1.12, bull: 1.00 };
  const BLK_APEX_FEED = 1.18;         // QB HUNTER / WALL pour harder — no coinflip
  // the tether: a block also ends when the BATTLE ITSELF drifts this far from
  // where it began (the bull-rush walk-back) — the visible escape that
  // replaces the old invisible 8% instant-shed reroll
  // calibrated against the measured bull walk-back (~19px/s with the +15
  // bull push): a strong bull breaks ~19.6px just before the ~1.2s grind,
  // a weak rusher (negative push) never does — first 6-game run at base 34
  // measured only 2-5% tether fires (dead code), this brings it to the
  // designed 15-30% share
  const BLK_TETHER_BASE = 28;
  const BLK_TETHER_TECH = { bull: 0.70, speed: 1.00, spin: 1.10 };
  const BLK_TETHER_RUN_MULT = 1.35;
  const BLK_COLLAPSE_LEFT = 0.18;     // pocket-collapse leaves this much grind
  // --- RUN LANE: the designed hole, MAINTAINED (ROADMAP S4/S5).
  // The hole has to be held open every frame, not opened once at the snap: an
  // engaged blocker re-aims at his man's CURRENT position on every tick, so a
  // one-time alignment change is erased within a few frames (ROADMAP failed
  // attempt 4). RUN_LANE_HALF is the daylight the line works for on each side of
  // the ball's line, measured to the defender's inside FACE, so a finished crease
  // is 2 * RUN_LANE_HALF px between faces against a 26px carrier body.
  // Swept on the blocking bench at seeds 4242/999, 160 carries each:
  //   26 -> 1.09 / 1.33 yd, a fitting reachable hole on 0% of carries at +0.5s
  //   34 -> 1.44 / 1.47 yd, 20-21%
  //   42 -> 1.50 yd,        43%     <- CHOSEN
  //   50 -> 1.52 yd,        45%     (inside the noise floor of 42)
  //   58 -> 1.35 yd,        45%     (over-wide: the front fans past the tackle box)
  // 42 drives a blocked man 58px — 2.4 yd — off the ball's line, which is a real
  // reach block and still inside the 112px tackle box. Pass protection is
  // untouched at every value (held-pocket hold 2.17-2.20s, merged engagement
  // 1.052s) because runLaneY() returns null on anything that is not a run.
  const RUN_LANE_HALF = 42;
  // AI STRIP ATTEMPT: ONE DRAW PER PLAY, taken when the first defender reaches
  // strike range, and then the question is settled for the whole play.
  //
  // THREE SCHEMES, AND WHY THIS IS THE THIRD. Originally the game rolled
  // Math.random() < dt * 0.02 on EVERY frame a defender sat 18-40px from the
  // carrier — a per-frame probability roll (LESSON #15) whose real rate is set
  // by DWELL TIME. Lengthening the grind therefore raised the fumble rate all
  // by itself, with the fumble gate untouched: three independent tackle-model
  // rewrites each took turnovers from 0.14% to 0.49-0.76% per carry and all
  // three mistook it for their own doing.
  // Moving to one draw per DEFENDER on band entry removed the dwell coupling
  // but not the coupling: measured over 1434 carries at nine seeds, attempts
  // went to 0.0176/carry against a 0.0063 baseline, because a longer grind
  // means more defenders reach strike range — the entry count tracks
  // tacklers/carry, which the same change took from 2.01 to 6.42. The rate was
  // no longer a function of time, but it was still a function of pile size.
  // Once per PLAY is the only form with no such handle: the attempt rate is a
  // property of the down, not of how the tackle happens to unfold. It also
  // matches what the original comment always claimed the mechanic was — "a
  // real punch-out is a rare, high-risk play, not every rep".
  // Calibrated straight to the measured baseline, since attempts/carry is now
  // just this probability: 0.0063 over 1596 carries (~10 events, so +/-32%
  // Poisson — the decoupling is the certain part, the exact rate is not).
  const AI_PUNCH_P = 0.0063;
  const RUN_DRIVE_BASE = 44;          // px/sec a blk-75 lineman turns the pair
  const RUN_DRIVE_PER_PT = 0.7;       // per point of blk over the rusher's str
  const RUN_DRIVE_MIN = 18, RUN_DRIVE_MAX = 62;
  const CLIMB_REACH = 168;            // 7 yd: past this a lineman cannot get there
  // A LINEMAN ONLY CLAIMS A MAN HE CAN ACTUALLY REACH. An O-lineman runs
  // spdPx(60..70) = 69 px/s measured; a linebacker runs 88 and a linebacker
  // PURSUING the carrier leads him, so he is travelling DOWNFIELD at ~78 px/s
  // while the blocker chases. A tail chase therefore never closes: measured on
  // the blocking bench, seed 4242, 60 carries, a climbing lineman was in body
  // contact with his claimed man on 1.9% of 5,840 climb frames, his closest
  // approach all play was a median 61.7 px, and only 30% of carries saw a climb
  // make contact at all -- while he stood in the crease on 1.16 of every carry
  // frame. So the claim is capped at arm's length: inside this he is close
  // enough to get hands on, outside it he seals the crease edge instead of
  // jogging through the hole after a man he will never catch.
  const CLIMB_GRASP = 46;
  // --- CPU CARRIER EVASION, as hazards per GAME-SECOND (LESSON #15).
  // The juke and the stiff-arm used bare per-FRAME probabilities (0.018 / 0.02)
  // rolled from cpuCarrier, which runs once per rendered frame and is already
  // handed dt. That made an evasive move a function of the player's monitor.
  // Measured on a pinned scenario (one defender welded inside the window for
  // 400 game-seconds): the per-frame odds held at ~0.018 as designed, but that
  // came out as ~2.5 / ~1.0 / ~0.5 jukes per GAME-second at 6.9 / 16.7 / 33.3ms
  // frame times — a 144Hz screen bought ~2.4x the jukes of a 60Hz one. Same
  // scenario with slow-mo running: 2.4/s vs 1.0/s, because update() is fed
  // sdt (dt * slowScale, in loop()) while the roll ignored dt entirely — the
  // rate rose exactly when the camera slowed down. Not cosmetic: a juke wipes
  // the wrap and drains 30 off the deterministic takedown accumulator.
  // x dt makes each a hazard per game-second: refresh-rate independent, and
  // slow-mo safe because sdt IS game time. Calibrated to REPRODUCE the 60Hz
  // frequency, not to re-balance it — 0.018/frame x 60 frames/s = 1.08/s, and
  // the agility term (agi-75)/900 per frame x 60 = (agi-75)/15 per second.
  // Re-measured after: 0.95-1.08 per game-second across those same three frame
  // times, and 1.2 with slow-mo on.
  // EVASION: ONE DECISION PER CLOSING DEFENDER, NOT A PER-FRAME ROLL.
  // These were rates per game-second, tested every frame the nearest defender
  // sat inside the window. That is LESSON #15, and its real rate is DWELL
  // TIME — which the tackle rewrite just tripled, so the old numbers no longer
  // meant what they were tuned to mean. The window is now entered ONCE per
  // defender and the question is asked once, so the rate is a property of the
  // matchup rather than of how long contact happens to last.
  // CALIBRATED, not guessed: blocking_bench measures 3.43 opportunities per
  // carry with a mean dwell of 9 frames, and the closed form of the old roll,
  // 1-(1-dt*RATE)^9 averaged over 546 windows, is 0.142 for the juke and 0.155
  // for the stiff-arm. So an average back keeps the rate he had.
  const JUKE_P_BASE = 0.14;           // at 75 agility — matches the old rate
  const JUKE_P_PER_AGI = 0.008;       // and elite agility earns more of them
  const JUKE_P_MIN = 0.04, JUKE_P_MAX = 0.55;
  // The stiff-arm used to be a CLIFF: only a carrier at 85+ strength could ever
  // throw the paw, and below that the move did not exist. It is a gradient now,
  // so a 90 back does it often, a 78 receiver does it rarely, and nobody is
  // locked out of their own animation by one integer.
  const STIFF_P_BASE = 0.04;          // at 75 strength
  const STIFF_P_PER_STR = 0.011;      // 85 -> 0.15, matching the old elite rate
  const STIFF_P_MIN = 0, STIFF_P_MAX = 0.45;
  // THE COST OF THE MOVE, which is what keeps either of them from being free.
  // A real juke is a PLANT: the back stops going forward, redirects, and has to
  // rebuild speed. That is the trade — you beat the man in front of you and pay
  // for it in ground, so cutting into traffic is punished rather than rewarded.
  // The stiff-arm costs less because you are extending an arm, not changing
  // direction, but it still costs something: you are not pumping that arm.
  // Both ramp back linearly rather than snapping, so the recovery reads.
  const JUKE_PLANT_T = 0.38, JUKE_PLANT_SPEED = 0.55;
  const STIFF_PLANT_T = 0.22, STIFF_PLANT_SPEED = 0.82;
  // THE PLAYER-DRIVEN DODGE CUT (W/S, or a vertical flick of the stick).
  // Every ball carrier gets it — QB, RB, TE, WR — and the cost is the same
  // shape as the AI juke: brief, ramped, and paid AFTER the cut lands, so a
  // cut is a change of momentum rather than a free sidestep. Shorter and
  // cheaper than a full juke because it is a step, not a spin.
  const CUT_BURST = 2.1;              // lateral multiple of run speed
  const CUT_T = 0.16;                 // how long the burst lasts
  const CUT_CD = 0.34;                // before another cut is available
  const CUT_SLOW_T = 0.30, CUT_SLOW_SPEED = 0.78;
  const CUT_BEAT_RANGE = 26;          // a cut only beats a COMMITTED man
  const CUT_BEAT_CLOSING = 30;
  // A SPIN OFF A BLOCK ALWAYS MAKES PROGRESS. See the SHIFT handler.
  const SPIN_CHUNK_BASE = 0.42;       // fraction of the grind it pours
  const SPIN_CHUNK_PER_STR = 1 / 90;
  const SPIN_TECH_BONUS = 1.25;       // a spin specialist does it better
  // One release path for every way a block can end. The old code cleared
  // blockedBy/engaged by hand at six sites and one of them leaked a stale
  // blockedBy on the rusher (permanently speed-capped, filtered out of the
  // rush pool) — with an accumulator that would also strand blockAcc.
  function releaseBlock(rusher, opts) {
    const o = opts || {};
    const b = rusher.blockedBy;
    if (b && b.engaged === rusher) b.engaged = null;
    rusher.blockedBy = null;
    rusher.blockAcc = 0; rusher.blockShedAt = 0; rusher.blockFeed = 0;
    rusher.blockLatchX = null; rusher.blockLatchY = null; rusher.blockTetherR = 0;
    rusher.engageT = 0;
    if (o.freeT != null) rusher.freeT = o.freeT;
    if (o.spin && rusher.rushTech === "spin") rusher.spinT = 0.3;
    if (o.staggerBlocker && b) b.staggerT = o.staggerBlocker;
  }
  // Live feed rate (units/sec) the rusher pours into his current rep.
  function blockFeedRate(r) {
    let f = BLK_FEED_BASE * (1 + (((r.str || 80) - 75) * BLK_FEED_PER_PT));
    f *= BLK_TECH_FEED[r.rushTech] || 1;
    if (r.apex && (r.passive === "sack" || r.passive === "wall")) f *= BLK_APEX_FEED;
    return Math.max(1, f);
  }
  // Projected seconds left in the rep — engageT stays alive as a READ-ONLY
  // derived field so every existing consumer (tests, HUD) keeps working.
  function blockHoldLeft(r) {
    if (!r.blockedBy || !r.blockFeed) return 0;
    return Math.max(0, (r.blockShedAt - (r.blockAcc || 0)) / r.blockFeed);
  }
  // The run lane: the y the football is actually travelling on. Pre-handoff the
  // back is not the carrier yet, so his alignment stands in for it — which is
  // also the ROADMAP's definition ("derived from RB alignment"). Returns null on
  // anything that is not a run, so pass protection never sees this code path.
  function runLaneY() {
    if (!(G.curPlay && G.curPlay.type === "run")) return null;
    if (G.carrier && G.carrier.team === "off") return G.carrier.y;
    const bc = G.players.find((p) => p.team === "off" && (p.role === "RB" || p.role === "FB"));
    return bc ? bc.y : MID;
  }
  // Shared shed check: grind-out OR tether break. Returns the cause tag.
  function blockShedCheck(r) {
    if (!r.blockedBy) return null;
    if ((r.blockAcc || 0) >= (r.blockShedAt || Infinity)) return "blk:grind";
    const drift = (r.blockLatchX == null) ? 0 :
      Math.hypot(r.x - r.blockLatchX, r.y - r.blockLatchY);
    if (drift > (r.blockTetherR || BLK_TETHER_BASE)) return "blk:tether";
    return null;
  }
  function saveRecord() {
    lsSet("dinobowl_record", JSON.stringify(G.record));
    lsSet("dinobowl_diff", G.diff);
    saveDyn();
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
  // Owner decision: the 4-card play-call screens are a Dino Bowl IMPROVEMENT
  // over Retro Bowl — they stay the DEFAULT. "Fast flow" (instant lineup, the
  // CHANGE PLAY chip only) is the opt-in for players who want pure RB pace.
  // Settings persist in localStorage (see the SETTINGS menu).
  const settingOn = (key, defOn) => {
    try { const v = localStorage.getItem(key); return v == null ? defOn : v === "1"; }
    catch (_) { return defOn; }
  };
  const settingSet = (key, on) => { try { localStorage.setItem(key, on ? "1" : "0"); } catch (_) { } };
  G.coachMode = settingOn("dinobowl_coach", true);        // play-call cards (default ON)
  G.playDefense = settingOn("dinobowl_playdef", true);    // play your defensive snaps
  G.halftimeShow = settingOn("dinobowl_halfshow", false); // mascot minigames at the half
  G.crt = settingOn("dinobowl_crt", false);               // scanline overlay (default OFF)
  applyCrt();
  try { G.qlen = Number(localStorage.getItem("dinobowl_qlen")) || 120; } catch (_) { G.qlen = 120; }

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
  window.addEventListener("error", (e) => { G.lastErr = e.message + " @ " + e.lineno; notify(G.lastErr); });

  const keys = {};
  let mouse = { x: 0, y: 0, down: false };

  // --------------------------------------------------------- online play
  // The host is authoritative: it simulates the play and streams a compact
  // render state; the guest sends controls only while team B has the ball.
  // This avoids physics desync while keeping the normal possession-based game.
  const Net = { role: null, room: null, db: null, lastFrame: 0, remoteView: false, inputRef: null };
  const netStatus = (text) => { const el = document.getElementById("online-status"); if (el) el.textContent = "ONLINE: " + text; };
  // S5: THREE states, not two. The bar used to print READY whenever the config
  // object existed — including when the Firebase SDK itself had been blocked
  // by an extension, a filter or a flaky CDN, which is the one cause the old
  // message never named. The absence of the global is the ground truth;
  // index.html additionally sets DINO_BOWL_SCRIPT_BLOCKED from an onerror so
  // "the file 404'd" can be told apart from "nobody configured it".
  const netReady = () => !!(window.DINO_BOWL_FIREBASE_CONFIG && window.firebase);
  function netReason() {
    if (!window.DINO_BOWL_FIREBASE_CONFIG) return "CONFIG MISSING";
    if (!window.firebase) return "SDK BLOCKED";
    return "READY";
  }
  const netBlurb = () => (window.DINO_BOWL_FIREBASE_CONFIG
    ? "Online is unavailable — the Firebase SDK did not load (ad-blocker, extension or network filter)."
    : window.DINO_BOWL_SCRIPT_BLOCKED
      ? "Online is unavailable — firebase-config.js did not load. Check the deploy, or an ad-blocker."
      : "Online needs FIREBASE_WEB_CONFIG — see the README.");
  // Every online message goes through here: the status bar gets the short
  // three-state word, the player gets the sentence. No native alert() survives.
  function netNote(text, status) { if (status) netStatus(status); notify(text); }
  const roomId = () => Array.from(crypto.getRandomValues(new Uint32Array(2))).map((n) => n.toString(36)).join("").slice(0, 10);
  const cleanNet = (v) => JSON.parse(JSON.stringify(v, (key, value) => {
    if (["engaged", "cover", "controlled", "sheets", "ballSpr", "crowd", "tape", "replay", "deadNext"].includes(key)) return undefined;
    return typeof value === "function" ? undefined : value;
  }));
  // THE BOX SCORE IS NOT A PER-FRAME QUANTITY. G.gameStats is a per-player
  // map (~250 bytes of JSON a line, 30-44 lines by the fourth quarter) that
  // only ever changes at a whistle, and netFrame ships 12 times a SECOND — so
  // the stream was re-sending the whole thing ~12x/s for a panel the guest can
  // only read between plays anyway. It now rides ONE frame per dead beat.
  // A frame that omits the key means "unchanged": applyNetFrame's Object.assign
  // simply leaves the guest's copy alone, and JSON.stringify drops undefined.
  // The latch is keyed on G.playNo, which is the play's identity and is bumped
  // by snap() itself, so it cannot go stale (LESSON #20). playNo is coerced
  // through `|| 0` on purpose: before the first snap it is undefined, and an
  // undefined latch comparing equal to an undefined play id would silently
  // suppress the very first send.
  function netStats() {
    if (G.state !== "dead") return undefined;
    const playId = G.playNo || 0;
    if (G._netStatsPlay === playId) return undefined;
    G._netStatsPlay = playId;
    return G.gameStats;
  }
  function netFrame() {
    const carrier = G.players.indexOf(G.carrier), rampEnt = G.ramp && G.players.indexOf(G.ramp.ent);
    return cleanNet({
      state: G.state, my: G.my, opp: G.opp, homeAbbr: G.homeAbbr, score: G.score,
      quarter: G.quarter, clock: G.clock, drive: G.drive, losYd: G.losYd, down: G.down, toGain: G.toGain,
      weather: G.weather, stadium: G.stadium, rampage: G.rampage, ramp: G.ramp ? Object.assign({}, G.ramp, { ent: rampEnt }) : null,
      players: G.players, ball: G.ball, carrier, phase: G.phase, playT: G.playT, callsheet: G.callsheet,
      playIdx: G.playIdx, curPlay: G.curPlay, defCall: G.defCall, aim: G.aim, kick: G.kick, banner: G.banner,
      // `parts` is GONE from the wire. Measured on a live snap: a CLEAR frame
      // was 33,077 bytes and a SNOW frame 123,922 — 712 snowflakes, every one
      // of them a fresh {x,y,vx,vy,t,snow} object, serialised and pushed to
      // Firebase 12 times a second (~1.5 MB/s of pure weather). Weather is
      // decoration with no authority in it, so both sides simulate it locally
      // from `weather`, which is still streamed. See update()'s remoteView bail.
      deadT: G.deadT, camX: G.camX, shake: G.shake, pteros: G.pteros, ot: G.ot,
      stats: G.stats, gameStats: netStats(), patMode: G.patMode, clockStopped: G.clockStopped, humanB: true,
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
    // THE TRAP: with `parts` stripped, nothing on the guest re-creates this
    // array, and drawWeatherFX iterates it on EVERY rendered frame. G.parts is
    // [] at construction, but a frame could arrive before any local tick and a
    // future strip could catch a different field the same way — so the guard
    // lives right where the frame lands. It must NOT be an unconditional
    // `G.parts = []`: that would wipe the guest's own weather 12 times a
    // second and leave a sky that never holds more than ~5 frames of snow.
    if (!Array.isArray(G.parts)) G.parts = [];
    G.carrier = f.carrier >= 0 ? G.players[f.carrier] : null;
    if (G.ramp && typeof G.ramp.ent === "number") G.ramp.ent = G.players[G.ramp.ent];
    if (teamChanged && TEAMS[G.my] && TEAMS[G.opp]) {
      G.sheets.A = DinoSprites.buildTeamSprites(TEAMS[G.my][1], TEAMS[G.my][2]);
      G.sheets.B = DinoSprites.buildTeamSprites(TEAMS[G.opp][1], TEAMS[G.opp][2]);
      if (G.stadium) buildCrowd(TEAMS[G.stadium.home][1]);
    }
  }
  async function startOnlineHost() {
    if (!netReady()) { netNote(netBlurb(), netReason()); return; }
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
      notify("Room ready — the invite link is in your address bar (and copied when permitted). Pick your teams, then send it over.", { quiet: true, t: 9 });
    } catch (err) { console.error(err); netNote("Could not start online room: " + err.message, "HOST FAILED"); }
  }
  async function joinOnlineRoom(id) {
    // an invite link that lands on a browser with no working Firebase used to
    // say "CONFIG REQUIRED" even when the config was fine and the SDK was the
    // thing that had been blocked.
    if (!netReady()) { netNote(netBlurb(), netReason()); return; }
    try {
      if (!firebase.apps.length) firebase.initializeApp(window.DINO_BOWL_FIREBASE_CONFIG);
      await firebase.auth().signInAnonymously();
      Net.role = "guest"; Net.room = id; Net.db = firebase.database(); Net.remoteView = true;
      const ref = Net.db.ref("dinobowl/rooms/" + id);
      ref.child("frame").on("value", (snap) => applyNetFrame(snap.val()));
      Net.inputRef = ref.child("inputs"); netStatus("CONNECTED · TEAM B");
    } catch (err) { console.error(err); netNote("Could not join this room: " + err.message, "JOIN FAILED"); }
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
    if (!netReady()) return false;
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
      if (!(await ensureFirebase())) { netNote(netBlurb(), netReason()); G.state = "menu"; return; }
    } catch (err) { console.error(err); netNote("Could not sign in for matchmaking: " + err.message, "SIGN-IN FAILED"); G.state = "menu"; return; }
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
      console.error(err);
      netNote("Matchmaking is unavailable (the database rules may need deploying). Try ONLINE (LINK) instead.", "MATCH FAILED");
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
        G.mode = "online"; G.humanB = true; G.career = null; G.szn = null; G.selectFor = "exh";
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

  // The states in which the GUEST is the one actually playing: team B's own
  // snap, from the call sheet through the whistle.
  const GUEST_PLAY_STATES = ["playcall", "presnap", "live", "kick", "ptchoice"];
  function canControlHere() {
    if (!Net.role) return true;
    // S4: the guest may also tap THROUGH a whistle — "dead" and "replay"
    // forward to the host, whose deadSkip()/endReplay() are already spam-safe,
    // so the guest is no longer a spectator between its own plays. The HOST's
    // test deliberately keeps the original list: it must never lose control of
    // a dead beat merely because team B has the ball.
    if (Net.role === "guest") return G.drive === "B" && (GUEST_PLAY_STATES.includes(G.state) || G.state === "dead" || G.state === "replay");
    return G.drive !== "B" || !GUEST_PLAY_STATES.includes(G.state);
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
  // Purely LOCAL keys. Mute, the help overlay, the box score and the pause
  // card are this machine's own screen furniture — they never touch the
  // simulation, so they are handled HERE, for BOTH roles, ahead of the net
  // gate. Before this the guest reached onKey in NO state whatsoever
  // (onlineInput returned true unconditionally), and the host lost the same
  // four keys for as long as team B had the ball. While the local pause card
  // is up every key is local, or ESC would open a card that Q could not close.
  const LOCAL_ONLY_KEYS = ["m", "h", "b", "escape"];
  function onlineInput(input) {
    if (!Net.role) return false;
    if (input && input.type === "key" && (G.paused || LOCAL_ONLY_KEYS.includes(input.key))) return false;
    if (Net.role === "guest") { if (canControlHere()) sendRemoteInput(input); return true; }
    return !canControlHere();
  }
  const initialRoom = new URLSearchParams(location.search).get("room");
  if (initialRoom) joinOnlineRoom(initialRoom);
  else netStatus(netReason());

  // ------------------------------------------------------------------ input
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  // THE POINTER DOES NOT STOP AT THE CANVAS EDGE. `mousemove` and `mouseup`
  // were bound to `cv`, so a drag that wandered onto the LETTERBOX (the game
  // is letterboxed at almost every aspect ratio) and released there never
  // delivered its mouseup: `mouse.down` stayed true, the arm stayed loaded and
  // the throw simply never resolved. Both now listen on `window`, which still
  // receives the canvas's own events by bubbling — nothing about an in-canvas
  // gesture changes. The coordinate is clamped to the canvas so an outside
  // release resolves at the edge the player last SAW rather than at a wild
  // number (which is also exactly what the canvas-bound listener used to do,
  // by freezing at the last in-canvas position).
  const canvasPosClamped = (e) => { const p = canvasPos(e); return { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) }; };
  window.addEventListener("mousemove", (e) => {
    const p = canvasPosClamped(e); mouse.x = p.x; mouse.y = p.y;
    if (Net.role === "guest" && canControlHere() && performance.now() - (Net.lastMove || 0) > 45) {
      Net.lastMove = performance.now(); sendRemoteInput({ type: "move", x: p.x, y: p.y });
    }
  });
  cv.addEventListener("mousedown", (e) => {
    const p = canvasPos(e); mouse.x = p.x; mouse.y = p.y;  // aim where you actually clicked
    if (onlineInput(e.button === 2 ? { type: "alt", x: p.x, y: p.y } : { type: "press", x: p.x, y: p.y })) return;
    if (!AC) sfx.snap();
    skipBanner();   // a click trims routine banners; the press still lands
    if (e.button === 2) { onAltFire(); return; }
    mouse.down = true; onPress();
  });
  window.addEventListener("mouseup", (e) => {
    const p = canvasPosClamped(e); mouse.x = p.x; mouse.y = p.y;
    if (e.button === 0) { if (onlineInput({ type: "release", x: mouse.x, y: mouse.y })) return; mouse.down = false; onRelease(); }
  });
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
    skipBanner();   // a fresh key trims routine banners; the key still works
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
  // EXACTLY ONE FINGER OWNS THE AIM. Every non-button touch used to be tagged
  // role:"aim" and to call onPress(), and ANY lift called onRelease(). So a
  // resting off-hand thumb anywhere in the right 58% of the screen during a
  // dropback re-planted G.slingAnchor at the thumb and nulled G.aim; the very
  // next lift — the thumb's — resolved nothing and set mouse.down false, after
  // which the arm could never re-arm (the aim update is gated on
  // `slingAnchor && mouse.down`). The QB just stood there until the sack.
  // The gesture now has an OWNER: the first aim finger claims it, later ones
  // are inert until it lifts, and only the owner's lift releases. This is also
  // P0-12's "at most one role:aim touch per event" — one per GESTURE is
  // strictly stronger than one per event.
  let aimTouchId = null;              // identifier of the finger that owns aim
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
    // Self-heal: if the owning finger vanished without ever delivering a
    // touchend (a gesture stolen by the OS, a dropped event), do not strand
    // the arm forever. The claim is dropped SILENTLY — a phantom onRelease()
    // here would throw a pass the player never asked for.
    if (aimTouchId !== null && e.touches &&
      !Array.prototype.some.call(e.touches, (t2) => t2.identifier === aimTouchId)) {
      delete touches[aimTouchId]; aimTouchId = null; mouse.down = false;
    }
    for (const t of e.changedTouches) {
      const p = canvasPosT(t);
      const btn = touchButtonAt(p);
      if (btn) { touches[t.identifier] = { role: "btn", id: btn.id }; pressTouchButton(btn.id); continue; }
      // movement joystick on the left half during live control
      if (controllableNow() && p.x < W * 0.42) {
        touches[t.identifier] = { role: "move", ox: p.x, oy: p.y };
        continue;
      }
      // otherwise a tap/aim like the mouse — but only for the OWNER. A second
      // finger is recorded inert so its move and its lift are explicit no-ops.
      if (aimTouchId !== null) { touches[t.identifier] = { role: "idle" }; continue; }
      aimTouchId = t.identifier;
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
      } else if (tr.role === "aim" && t.identifier === aimTouchId) { mouse.x = p.x; mouse.y = p.y; }
    }
  }
  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const tr = touches[t.identifier]; if (!tr) continue;
      delete touches[t.identifier];
      if (tr.role === "move") G.touchMove = { x: 0, y: 0 };
      // The claim is cleared HERE — the same place the release happens — so a
      // touchcancel (which shares this handler) can never leak ownership.
      else if (tr.role === "aim" && t.identifier === aimTouchId) { aimTouchId = null; mouse.down = false; onRelease(); }
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
  // ---- DYNAMIC DIFFICULTY LADDER (modeled on the RB source's
  // suppress_difficulty win/loss ladder, MECHANICS §11) ---------------------
  // Career starts at 10 = easiest = D1. After each FRANCHISE match: loss +1,
  // win −1, win by >14 a further −1, tie 0. Clamp [−1,10] until you win a
  // Dino Bowl, then [−5,10]. Displayed as D1..D16 = 16 − (5 + suppress).
  // (This module lives AFTER clamp() on purpose — loadDyn calls it at parse
  // time and DIFFS at 459 sits inside clamp's temporal dead zone.)
  const DYN_KEY = "dinobowl_dyn";
  const DYN_MAX = 10, DYN_MIN_BASE = -1, DYN_MIN_CHAMP = -5;
  const lerpD = (a, b, t) => a + (b - a) * t;
  function loadDyn() {
    try {
      const d = JSON.parse(localStorage.getItem(DYN_KEY) || "null");
      if (d && typeof d.sup === "number") {
        return { v: 1, sup: clamp(Math.round(d.sup), DYN_MIN_CHAMP, DYN_MAX), champ: !!d.champ };
      }
    } catch (_) { /* malformed → a fresh career, never a crash */ }
    return { v: 1, sup: DYN_MAX, champ: false };
  }
  function saveDyn() { try { localStorage.setItem(DYN_KEY, JSON.stringify(G.dyn)); } catch (_) { } }
  const dynFloor = () => (G.dyn.champ ? DYN_MIN_CHAMP : DYN_MIN_BASE);
  const dynSuppress = () => clamp(G.dyn.sup, dynFloor(), DYN_MAX);
  const dynDNumber = () => 16 - (5 + dynSuppress());   // D1..D16
  function refreshDynamicDiff() {
    const t = (dynSuppress() + 5) / 15;   // 1 = D1 easiest .. 0 = D16 hardest
    const d = DIFFS[DIFF_DYNAMIC];
    d.name = "DYNAMIC (D" + dynDNumber() + ")";
    d.defSpd = lerpD(1.10, 0.92, t);
    d.cpuThink = lerpD(0.70, 1.35, t);
    d.catchBonus = lerpD(-0.08, 0.08, t);
    d.tdP = lerpD(0.34, 0.16, t);
    // Change-2 coverage fields: the anchors are the static HATCHLING/APEX
    // extremes so the ladder is a strict superset of the fixed tiers.
    d.coverLag = lerpD(0.42, 0.80, t);
    d.cushion = lerpD(18, 38, t);
  }
  // suppress-equivalent of each STATIC tier — used by difficulty-sensitive
  // formulas that want a scalar (e.g. the fumble gate), never by the lerp.
  const DIFF_SUPPRESS_EQ = [10, 3, -5];   // HATCHLING / VETERAN / APEX
  const diffScalar = () => (G.diff === DIFF_DYNAMIC ? dynSuppress()
    : (DIFF_SUPPRESS_EQ[G.diff] != null ? DIFF_SUPPRESS_EQ[G.diff] : 3));
  G.dyn = loadDyn();
  if (!(G.diff >= 0 && G.diff < DIFFS.length)) G.diff = 1;   // sanitize saves
  refreshDynamicDiff();
  // The ladder moves once per franchise match only (season/career).
  function bumpDynamicLadder() {
    const marg = G.score.A - G.score.B;
    let delta = marg > 0 ? -1 : marg < 0 ? 1 : 0;
    if (marg > 14) delta -= 1;   // a blowout win drops two rungs
    G.dyn.sup = clamp(G.dyn.sup + delta, dynFloor(), DYN_MAX);
    saveDyn(); refreshDynamicDiff();
  }
  // Deliberately slow league — the field plays HUGE.  At 24px/yd this works
  // out to exactly HALF the on-screen yards-per-second of the fast stripped
  // build (which ran unscaled ratings at 20px/yd), so a 40-yard sprint takes
  // ~10s at top speed instead of ~5 (and a soaring safety ~5.5s, not ~2.8).
  const SPEED_SCALE = 0.6;
  // Preserve rating spread without letting the slowest roster entry turn into
  // a visibly stalled sprite.  Retro-style football needs every on-field dino
  // to have enough baseline motion for routes, pursuit, and contact to read.
  const spdPx = (r) => Math.max(56, (96 + (r - 60) * 1.9) * SPEED_SCALE);   // rating -> px/s
  const lastName = (n) => {
    const p = (n || "").split(" ").filter((w2) => !["II", "III", "IV", "Jr.", "Jr", "Sr.", "Sr"].includes(w2));
    return p[p.length - 1] || n || "";
  };

  function banner(text, sub, time, opts) {
    G.banner = { text, sub: sub || "", t: time || 1.5,
      tier: (opts && opts.tier) || "mid",
      sticky: !!(opts && opts.sticky) };
  }
  // any input trims a routine banner to a beat — never the sticky rule
  // banners (LESSON #4: the 0:00 rule must stay visible), and the input
  // itself still goes through, so skipping never eats a gameplay press
  function skipBanner() {
    if (G.banner && !G.banner.sticky && G.banner.t > 0.22) G.banner.t = 0.22;
  }
  // ------------------------------------------------ error / notice surface
  // G.lastErr had two writers and ZERO readers: a caught exception vanished
  // into a property nothing ever drew, and the player just saw the game stop
  // responding with no clue why. notify() is the single channel for "something
  // the player needs to know that isn't a play" — a small red one-liner at the
  // foot of EVERY screen for a few seconds, plus one console.error per
  // DISTINCT message so a fault that repeats every frame cannot flood the
  // console. It is also what replaced the seven native alert() calls the
  // online paths used to throw over the canvas (S5).
  //
  // The "seen" set hangs off the function rather than sitting in a module-level
  // const on purpose: joinOnlineRoom() runs during the IIFE's own evaluation
  // when the page carries a ?room= link, and it can notify() from there — a
  // const declared this far down the file would still be in its temporal dead
  // zone and the notice would throw instead of showing.
  function notify(text, opts) {
    if (text == null || text === "") return;
    const msg = String(text);
    G.note = { text: msg, t: (opts && opts.t) || 6 };
    if (opts && opts.quiet) return;
    notify.seen = notify.seen || new Set();
    if (notify.seen.has(msg)) return;
    notify.seen.add(msg);
    try { console.error("[dinobowl] " + msg); } catch (_) { /* no console */ }
  }
  // ...and the same input advances the DEAD BEAT itself past a short
  // read-lockout (0.35s routine, 0.9s for TD/turnover mega beats) — the tap
  // that clears the text also moves the game forward, PG's core rule
  function deadSkip() {
    if (G.state !== "dead" || !G.deadNext || G.deadT <= 0.01) return;
    const lockout = (G.deadT0 || 0) > 1.6 ? 0.9 : 0.35;
    if ((G.deadElapsed || 0) >= lockout) G.deadT = Math.min(G.deadT, 0.01);
  }
  // ...and the SAME rule for the kick flight. The boot-and-flight beat was the
  // one dead beat with no skip at all: deadSkip() is gated to state "dead", so
  // every input during "kickfly" was swallowed. Measured over a full game that
  // was 15-17s of unskippable ball-watching (~8% of total game time, 2.1-3.6s a
  // pop) — the single largest block of dead air in the game, and the only one a
  // tap could not shorten. Same 0.35s read-lockout as a routine dead beat: the
  // boot is always seen, the sail is optional. Landing it early still runs the
  // made-kick crossing beat and the normal `after()` resolution, because
  // updateKickFly checks the upright plane before it checks completion.
  const FLY_READ_LOCK = 0.35;
  function flySkip() {
    const f = G.kickFly;
    if (G.state !== "kickfly" || !f || f.t < FLY_READ_LOCK) return;
    f.t = f.T;
  }
  // ONE shared truth for the STOP CLOCK chip: the draw and the tap hotspot
  // must always agree, or taps get eaten by an invisible box
  function stopChipVisible() {
    return G.state === "dead" && !G.practice && !G.patMode && !G.clockStopped && !G.celebrate &&
      G.timeouts && G.timeouts[G.humanB ? G.drive : "A"] > 0 && G.clock > 0;
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
    // UNIFORM size: variety comes from color only, so the stands read as one
    // tidy crowd instead of mismatched debris.
    const w = 5, h = 4;
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
    // Ties need a column. Without one, seasonAfterGame's `won = A > B` booked a
    // drawn game as a LOSS for you and a WIN for your opponent, and the standings
    // had nowhere to put the truth.
    ABBRS.forEach((t) => (records[t] = { w: 0, l: 0, t: 0 }));
    G.szn = {
      team, week: 1, phase: "regular",
      schedule: opps.map((o, i) => ({ opp: o, home: i % 2 === 0 })),
      records, results: [], seasonStats: {}, playoffs: null, champion: null,
      staff: genStaff(), dev: {},
    };
    saveSeason();
  }
  function saveSeason() { if (G.szn) lsSet("dinobowl_season", JSON.stringify(G.szn)); }
  function loadSeason() {
    try { return JSON.parse(localStorage.getItem("dinobowl_season") || "null"); } catch (e) { return null; }
  }
  function clearSeason() { lsDel("dinobowl_season"); }

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
        // (|| 0) on BOTH sides: a season save written before `fum` existed has
        // no such key, and `undefined + n` NaN-poisons the line forever.
        for (const f of ["passYds", "passTd", "passInt", "cmp", "att", "rushYds", "rushTd", "car", "recYds", "recTd", "rec", "tkl", "sacks", "defInt", "ff", "fum", "sacked", "sackYds"]) t[f] = (t[f] || 0) + (s[f] || 0);
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
    // A DRAWN GAME IS NOT A LOSS. Every branch below used to key off `won` alone,
    // so a tie handed the opponent a win, charged you a loss, and -- in the
    // playoffs -- eliminated you. Ties are reachable whenever overtime expires
    // level; a playoff game now replays overtime instead (see endQuarter), so in
    // practice `tied` is a regular-season outcome.
    const tied = G.score.A === G.score.B;
    // dynamic ladder moves on franchise results only (exhibitions don't count)
    bumpDynamicLadder();
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
      if (tied) {
        G.szn.records[G.szn.team].t = (G.szn.records[G.szn.team].t || 0) + 1;
        G.szn.records[sched.opp].t = (G.szn.records[sched.opp].t || 0) + 1;
      } else if (won) { G.szn.records[G.szn.team].w++; G.szn.records[sched.opp].l++; }
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
      // a tie is half a win for seeding, the standard football convention
      .sort((a, b) => ((G.szn.records[b].w + (G.szn.records[b].t || 0) * 0.5) -
        (G.szn.records[a].w + (G.szn.records[a].t || 0) * 0.5)) || (teamOvr(b) - teamOvr(a)))
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
      // WHAT WAS BROKEN: THE CHAMPIONSHIP WAS SILENT. Winning the Dino Bowl set
      // two fields and returned — no confetti, no flash, no cheer, no card. The
      // single biggest moment the game has shipped less payoff than a first
      // down, which gets a flash, a cheer and a celebration pose.
      // This runs from gameOver()'s onGameOver hook, so the state is "over":
      // drawOver() paints a 55%-opacity card over the LIVE FIELD and
      // updateParticles/drawWeatherFX both still run there, so confetti really
      // does rain over the trophy screen. Mega tier and a 99s banner match the
      // FINAL card that is already up. Existing emitters only.
      banner("DINO BOWL CHAMPIONS!", TEAMS[G.szn.team][0].toUpperCase() + " RULE THE CRETACEOUS", 99, { tier: "mega" });
      fxConfetti(G.camX + W / 2);
      fxFlash(24);
      crowdCheer(1.2);
      crowdSpike = 0.16;
      G.zoomPunch = Math.max(G.zoomPunch, 0.12);
      sfx.td(); sfx.roar();
      // a champion unlocks the deep end of the dynamic ladder (D13-D16)
      if (!G.dyn.champ) { G.dyn.champ = true; saveDyn(); refreshDynamicDiff(); }
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
  function saveCareer() { if (G.career) lsSet("dinobowl_career", JSON.stringify(G.career)); }
  function clearCareer() { lsDel("dinobowl_career"); G.career = null; }

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
    G.score = { A: 0, B: 0 }; G.quarter = 1; G.clock = (G.qlen || QUARTER_LEN); G.ot = false;
    G.rampage = { A: 0, B: 0 }; G.ramp = null;
    G.rampUsed = { A: 0, B: 0 };   // holds the half-number it was spent in
    // RB source: timeouts = clamp(2 + matchlength, 2, 3) per half
    const toN = (G.qlen || 120) >= 180 ? 3 : 2;
    G.timeouts = { A: toN, B: toN };
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
    clearCelebration();   // P0-21: a residual from the last game's final TD must not ride along
    G.zeroBannerPlay = null;
    // show the pregame hype/lineup screen first; kickoff waits for ENTER/tap
    G.intro = { t: 0 };
    G.state = "intro";
    sfx.td();
  }
  function kickoffAfterPregame() {
    const wtxt = G.weather.type === "CLEAR" ? "Clear skies in the Cretaceous." :
      G.weather.type === "RAIN" ? "Rain — slick ball, watch for fumbles!" : "Snow — heavy legs, short passes!";
    banner(TEAMS[G.my][0].toUpperCase() + " vs " + TEAMS[G.opp][0].toUpperCase(), wtxt + "  " + (G.drive === "A" ? "You receive!" : (G.humanB ? "P2 receives!" : "CPU receives!")), 2.4);
    // Kickoffs/returns are removed, so the opening possession is simply spotted
    // at the receiving team's 25 (startKickoff handles the placement). G.drive
    // is already the team receiving the toss.
    const receiving = G.drive;
    G.state = "dead"; G.deadT = 2.4; G.deadNext = () => startKickoff(receiving);
  }

  // ------------------------------------------------------------- practice mode
  function startPractice() {
    G.mode = "practice"; G.practice = true; G.humanB = false; G.career = null; G.szn = null;
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
  // WHOSE STADIUM IS THIS. The crowd is not a neutral bed — buildCrowd() dresses
  // the stands in TEAMS[G.stadium.home] colors, and startGame sets
  // `G.homeAbbr = opts.home === false ? G.opp : G.my`, while the season schedule
  // alternates (`home: i % 2 === 0`). So on a road week the people in the seats
  // are side B's fans, and every reaction keyed off `G.drive === "A"` was
  // cheering and groaning for the wrong team for half the schedule.
  // This is the one place that answers the question, and it answers it from the
  // BUILDING, not from who is holding a controller: local 2-player (G.humanB) is
  // two humans in one stadium, and an online guest never reaches this code at
  // all — update() returns at `if (Net.remoteView) return;` and guests only draw
  // the host's snapshots — so "which human is local" is the wrong question and
  // is deliberately not asked. The `!== G.my` guard keeps a same-team
  // exhibition (my === opp) resolving to A instead of flipping the stands.
  const crowdSide = () => (G.homeAbbr && G.homeAbbr === G.opp && G.homeAbbr !== G.my) ? "B" : "A";

  function enterPlaycall() {
    // SUDDEN DEATH, ENFORCED. Overtime's banner promises "next score wins", but OT
    // was an ordinary timed quarter -- you could kick a go-ahead field goal and then
    // watch the opponent drive back with the clock still running, the exact opposite
    // of what the game just told the player. Every scoring path (touchdown, PAT,
    // two-point try, field goal, safety, defensive score) funnels through a dead
    // beat and back into the play-call, so this one check covers all of them without
    // touching a single scoring routine. patMode is excluded so a conversion try
    // after an overtime touchdown still resolves before the whistle.
    if (G.ot && G.score.A !== G.score.B && !G.patMode && !G.practice) { gameOver(); return; }
    if (G.patMode) {
      // a conversion try exists outside the clock entirely
    } else if (!G.practice) {
      if (G.clock <= 0) { endQuarter(); return; }
      // RUNNING clock model: no chunk runoff — real time ticks through the
      // huddle/presnap in update(); a stoppage stays frozen until the snap.
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
      if (G.coachMode) { G.state = "playcall"; return; }
      // FAST FLOW: line up immediately with the top situational call — the
      // routes drawn on the turf ARE the play call; cycle at the line.
      G.playIdx = 0;
      choosePlay(sheet[0], false);
      return;
    } else {
      if (!G.humanB && !G.playDefense && !G.patMode && !G.practice) { simCpuDrive(); return; }
      const off = cpuChooseOff();
      if (!off) return;                        // CPU chose a kick (handles its own flow)
      G.pendingOff = off; askDefense();
    }
  }
  // Owner setting "PLAY DEFENSE: OFF" — the CPU possession resolves the way
  // Retro Bowl resolves ALL opponent drives: instantly and statistically,
  // scaled by difficulty. No live snaps, one result card, next drive.
  function simCpuDrive() {
    const cpuSide = G.drive;
    const d = diff();
    // table-driven (0.16/0.24/0.32, lerped on DYNAMIC) — the old index
    // arithmetic would have read G.diff=3 as tdP 0.40
    const tdP = d.tdP != null ? d.tdP : 0.24;
    const r = Math.random();
    let result, points = 0, spot = 25, yds;
    const plays = 3 + (Math.random() * 7 | 0);
    if (r < tdP) { result = "TOUCHDOWN"; points = 6 + (Math.random() < 0.94 ? 1 : 0); yds = 100 - G.losYd; }
    else if (r < tdP + 0.16) { result = "FIELD GOAL"; points = 3; yds = Math.round(rnd(15, 50)); }
    else if (r < tdP + 0.27) { result = "TURNOVER"; spot = clamp(Math.round(100 - (G.losYd + rnd(0, 30))), 12, 90); yds = Math.round(rnd(0, 22)); }
    else { result = "PUNT"; spot = clamp(Math.round(rnd(8, 35)), 5, 60); yds = Math.round(rnd(4, 32)); }
    G.score[cpuSide] += points;
    G.clock = Math.max(0, G.clock - rnd(30, 65));   // the possession costs clock
    banner(TEAMS[teamAbbrOf(cpuSide)][0].toUpperCase() + " DRIVE: " + result,
      plays + " plays · " + Math.max(0, yds) + " yds", 1.7);
    if (points >= 6) { sfx.td(); crowdAww(0.9); }
    else if (points === 3) { sfx.kick(); crowdAww(0.5); }
    else crowdCheer(0.35);   // your defense (simulated) got the stop
    G.state = "dead"; G.deadT = 1.3; G.clockStopped = true;
    G.deadNext = () => {
      if (G.clock <= 0 && !G.patMode) { endQuarter(); return; }
      G.drive = other(cpuSide); G.losYd = spot; G.down = 1; G.toGain = Math.min(10, 100 - spot);
      enterPlaycall();
    };
  }
  function askDefense() {
    // a human calls the defensive scheme only in single-player while defending;
    // in 2-player the defense is CPU-run (alternating offensive possessions)
    if (defenseHumanSteers()) {
      G.callsheet = relevantDefense(4);
      G.callFor = other(G.drive);
      if (G.coachMode) { G.state = "defcall"; return; }
      G.playIdx = 0;
      choosePlay(G.callsheet[0], true);
      return;
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
    // CHANGE PLAY at the line: cycles the 4-call situational sheet (offense
    // when you have the ball, coverage shells when you're defending)
    if (G.state !== "presnap" || G.patMode) return;
    const sheet = G.callsheet || [];
    if (!sheet.length) return;
    G.playIdx = ((G.playIdx || 0) + dir + sheet.length) % sheet.length;
    const pick = sheet[G.playIdx];
    if (offenseIsUser()) G.curPlay = pick;
    else if (defenseHumanSteers()) G.defCall = pick;
    else return;
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
      tackleCd: 0, soarT: 0, soarCd: 0, soarCharge: 0.35, punching: 0, punchCd: 0, punchRolled: false, spinCd: 0, throwT: 0, jumpT: 0,
      stiffT: 0, stiffCd: 0, stamNow: 1, coldT: 0,
      jukePlantT: 0, stiffPlantT: 0, stiffConsidered: null,
      // WHAT WAS BROKEN: these four were never initialised anywhere. The cut
      // guard reads `if (wantCut && e.cutCd <= 0)`, and `undefined <= 0` is
      // FALSE — so the player-driven dodge cut could never fire, on any
      // carrier, in any build that has ever shipped. Vertical input did
      // nothing at all: the same block sets e.vy = 0 unconditionally, so W/S
      // read as "the carrier cannot go up or down".
      cutT: 0, cutCd: 0, cutSlowT: 0, cutDir: 0,
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
      layQ: 0,
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
      e.tackleImpactWith = 0; e.tackleImpactRole = ""; e.tackleFallDir = 0; e.layQ = 0;
    }
  }
  function beginTackleImpact(tackler, carrier, duration, options) {
    if (!tackler || !carrier) return null;
    const opt = options || {};
    const dur = Math.max(0.08, duration || 0.48);
    // The hit travels along the tackler's momentum when the caller supplies
    // it (so a defender drives the pile the way HE was moving, from any
    // angle), otherwise along the line between the two bodies.
    let dx, dy;
    if (opt.hit && (opt.hit.x || opt.hit.y)) { dx = opt.hit.x; dy = opt.hit.y; }
    else { dx = carrier.x - tackler.x; dy = carrier.y - tackler.y; }
    let d = Math.hypot(dx, dy);
    if (d < 0.001) { dx = tackler.dir || 1; dy = 0; d = 1; }
    const nx = dx / d, ny = dy / d;
    // THE HIT IS A 2D VECTOR AND IT HAS TO STAY ONE. (nx, ny) is computed
    // correctly above from the tackler's real momentum, and then the old line
    // here threw all of it away except the SIGN OF nx. Two things broke.
    //
    // (a) ny was discarded outright, so a defender driving the carrier ACROSS
    //     the field laid him out along the sideline anyway — the body fell a
    //     direction the hit never travelled.
    // (b) worse, when the hit was near-vertical (|nx| <= 0.18) the fall
    //     direction fell back to carrier.dir — whichever way the carrier
    //     HAPPENED TO BE FACING before contact. That is a stale value with no
    //     relationship to the tackle, and it is the "tackle animation loses
    //     its direction" the owner reported: hit a man square from downfield
    //     and he flops along his old heading.
    //
    // fallDir is now only the MIRROR (which way the art faces), and when the
    // hit gives no horizontal signal it comes from the geometry between the
    // two bodies — never from a stale facing.
    let fallDir;
    if (Math.abs(nx) > 0.18) fallDir = nx >= 0 ? 1 : -1;
    else {
      const gx = carrier.x - tackler.x;
      fallDir = Math.abs(gx) > 0.001 ? (gx >= 0 ? 1 : -1) : (tackler.dir || carrier.dir || 1);
    }
    // layQ is the quarter-turn the BODY LIES ALONG: 0 = down the sideline
    // (which is how the laid-out cel is authored), +1/-1 = across the field.
    // Quantized to quarter turns deliberately. imageSmoothingEnabled is false
    // everywhere in this game, so a quarter turn is a lossless move on the
    // pixel grid, while an arbitrary angle resamples a 16x16 sprite into
    // uneven pixel sizes and reads as damage rather than as rotation. Four
    // directions is the most a pixel-art body can lie in and stay crisp.
    // The 1.6 factor is hysteresis: only a decisively cross-field hit changes
    // the layout, so the ordinary tackle still looks exactly as it did.
    const layQ = Math.abs(ny) > Math.abs(nx) * 1.6 ? (ny >= 0 ? 1 : -1) : 0;
    tackler.layQ = layQ; carrier.layQ = layQ;
    tackler.tackleImpactT = dur; carrier.tackleImpactT = dur;
    tackler.tackleImpactWith = carrier.bodyId; carrier.tackleImpactWith = tackler.bodyId;
    tackler.tackleImpactRole = "driver"; carrier.tackleImpactRole = "carrier";
    carrier.tackleFallDir = fallDir; carrier.tackleFallPending = true;
    // The pair collapses together facing the hit: the tackler drives forward
    // and the carrier folds forward under it, both leaning the same way so the
    // tackler drapes over the carrier's back rather than passing through it.
    tackler.dir = fallDir; carrier.dir = fallDir;

    // A real hit kicks up turf. The compact dust ring marks the contact beat
    // in live play and the QA review scene alike — the same visual language
    // as the game's other impact moments, never a HUD effect.
    G.parts = G.parts || [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      G.parts.push({ x: (tackler.x + carrier.x) / 2 + Math.cos(a) * 7,
        y: Math.max(tackler.y, carrier.y) + 2 + Math.sin(a) * 3, z: 2,
        vx: Math.cos(a) * rnd(30, 55), vy: Math.sin(a) * rnd(18, 34), vz: rnd(24, 60),
        t: rnd(0.28, 0.5), puff: true });
    }
    // takedowns tear the turf, not just the air
    fxChunks((tackler.x + carrier.x) / 2, Math.max(tackler.y, carrier.y) + 2, 5);

    // The live play has just had its ordinary bodies separated by physics.
    // Move only this pair into a clearly readable shoulder overlap; the ball
    // carrier is displaced *away* from the driver rather than folded in place.
    if (opt.reposition !== false) {
      const impactGap = opt.impactGap == null
        ? Math.max(11, Math.round(bodyContactRange(tackler, carrier) * 0.48))
        : opt.impactGap;
      // The knockback distance IS the hit's change in position: it scales with
      // how hard the defender was driving INTO the carrier (opt.drive = his
      // speed projected onto the line to the ball). Charging in with momentum
      // blasts the carrier well back; a standing/arm tackle barely moves him;
      // lunging backward against his own run (negative drive) moves him least.
      const drive = opt.drive || 0;
      // THE PILE FALLS WHERE THE POWER CONTEST SAYS.
      // WAS: knockback = 4 + drive*0.1 px applied along `nx` — the TACKLER'S
      // momentum — so at the whistle the carrier was teleported 3-16px in
      // whatever direction the defender happened to be moving, and playDead
      // spots the ball at ydAtX(carrier.x) on the very next statement. Measured
      // on the blocking bench (seed 4242, 158 carries) that ONE frame was worth
      // -0.41 yd median, i.e. MORE than the entire -0.28 median YAC: the wrapped
      // carrier was already gaining ground during the grind and then giving all
      // of it back in the collapse.
      // It also INVERTED the role table, which is how it was found. A DL who is
      // engaged is being driven off the ball by his blocker, so his vx points
      // DOWNfield and `nx` knocked the carrier FORWARD (measured DL YAC +0.112);
      // a free safety arriving downhill has vx pointing upfield, so the identical
      // line of code took yards away (S YAC -0.291). A safety alone in the open
      // field was stopping the carrier better than a defensive tackle in traffic
      // purely because of the sign of the tackler's velocity.
      // NOW: the FALL still reads along the hit — nx/ny drive the cel, the facing
      // and the y-fold, so LESSON #2 and the LESSON #23 cel budget are untouched
      // — but the ground the carrier KEEPS is a contested pile push along the
      // field axis: +x when he wins the power contest, -x only when he genuinely
      // loses it. Forward is always +x for whoever has the ball (playDead spots
      // at ydAtX and scores at >= 100), so "he fell forward" is a real
      // forward-progress spot and a tackle for loss is a contest he lost.
      // No dice anywhere in here (LESSON #15 / LESSON #19): it is strength plus
      // stiff-arm plus agility against strength plus tackling and the defender's
      // own measured closing drive — every term is on the ratings screen.
      const pilePow = ((carrier.str || 75) + (carrier.stiff || carrier.str || 75) + (carrier.agi || 75) * 0.5) / 2.5;
      const pileForce = ((tackler.str || 75) + (tackler.tkl || 75)) / 2;
      const contest = opt.contest != null ? opt.contest
        : clamp((pilePow - pileForce) / 20 + 0.5 - clamp(drive, 0, 160) / 120, -1, 1);
      // opt.knockback stays an explicit override for the scripted QA scenes and
      // keeps its old meaning there (px straight back along the hit).
      const push = opt.knockback != null ? -opt.knockback : contest * 10;
      carrier.x += push;
      carrier.y += ny * Math.min(4.5, Math.abs(push) * 0.4);
      // Carry a little of that momentum into the carrier so the dead-ball
      // settle drifts with the hit instead of stopping dead on contact.
      carrier.vx += push * 3.5; carrier.vy += ny * Math.abs(drive) * 0.12;
      // NO TELEPORTING: the tackler may be nudged into the wrap by at most a
      // few pixels. If he is farther out than that, he keeps his real spot
      // and momentum and simply rides in — a wrap must never look like the
      // defender warping multiple yards onto the carrier.
      const wantX = carrier.x - nx * impactGap, wantY = carrier.y - ny * impactGap;
      const tdx = wantX - tackler.x, tdy = wantY - tackler.y;
      const tdist = Math.hypot(tdx, tdy);
      const maxSnap = 10;
      if (tdist <= maxSnap) { tackler.x = wantX; tackler.y = wantY; }
      else {
        tackler.x += (tdx / tdist) * maxSnap; tackler.y += (tdy / tdist) * maxSnap;
        tackler.vx += (tdx / tdist) * 90; tackler.vy += (tdy / tdist) * 90;
      }
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
  // Freeze the resting tackle pile on its most-collapsed cels: the carrier
  // folded over ("tackled" at full progress) and the tackler draped over it
  // ("tackle" at full progress). Pinning the pose progress (rather than letting
  // the timer run) keeps both bodies fully intact and stops either from
  // animating back upright, while the tackle-impact timers keep the pair
  // exempt from the separation solver so the overlap holds.
  function pinPileCels(s) {
    s.carrier.pose = "tackled"; s.carrier.poseDur = 1; s.carrier.poseT = 0.08;
    s.tackler.pose = "tackle"; s.tackler.poseDur = 1; s.tackler.poseT = 0.08;
    s.tackler.tackleImpactT = Math.max(s.tackler.tackleImpactT, 0.5);
    s.carrier.tackleImpactT = Math.max(s.carrier.tackleImpactT, 0.5);
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
      e.animT += dt * 8;
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
        e.tackleFallDir = 0; e.tackleFallPending = false; e.layQ = 0;
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
      // The review can showcase a hit arriving from any angle via ?qaDir=.
      // Field play never fixes the fall to one side, so neither does the gate.
      const DIRS = {
        right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1],
        upright: [0.86, -0.5], downright: [0.86, 0.5],
        upleft: [-0.86, -0.5], downleft: [-0.86, 0.5],
      };
      const dv = DIRS[new URLSearchParams(location.search).get("qaDir")] || DIRS.right;
      const hlen = Math.hypot(dv[0], dv[1]) || 1;
      const hit = { x: dv[0] / hlen, y: dv[1] / hlen };
      const fallDir = hit.x >= 0 ? 1 : -1;
      const startGap = 96;
      // Both start on the hit axis, centred on the contact spot. The carrier
      // faces the incoming hit; both are turned into the fall at contact.
      rb.x = baseX + hit.x * startGap * 0.5; rb.y = baseY + hit.y * startGap * 0.5;
      db.x = baseX - hit.x * startGap * 0.5; db.y = baseY - hit.y * startGap * 0.5;
      db.dir = fallDir; rb.dir = -fallDir;
      hold(rb);
      scene = { kind, t: 0, dur: 1.34, baseX, baseY, tackler: db, carrier: rb, gap,
        hit, fallDir,
        // A real wrap intentionally brings the two painted bodies together;
        // this is much closer than the ordinary torso gap but only lasts long
        // enough to read as one dino driving the other backwards.
        impactGap: Math.max(11, Math.round(gap * 0.48)),
        // The resting pile is even tighter than the wrap: the tackler ends
        // lying across the carrier's torso while the carrier's head, chest
        // and tucked football stay readable past the tackler's flattened
        // body — the under-player must never disappear into the pile.
        pileGap: 10,
        startGap, dive: false, wrap: false, caption: "TACKLE · LAUNCH → DRIVE → PILE-ON" };
    } else if (kind === "stiffarm") {
      // A broken tackle: the carrier meets a defender head-on, shrugs him off
      // with a species-appropriate shove, and keeps his feet while the tackler
      // reels away. Shows the rare stat+velocity shed as a clean review beat.
      use(db, rb);
      rb.x = baseX - 26; rb.y = baseY; rb.dir = 1;
      db.x = baseX + 46; db.y = baseY - 6; db.dir = -1;
      hold(rb);
      scene = { kind, t: 0, dur: 0.86, baseX, baseY, carrier: rb, tackler: db,
        broke: false, caption: "BROKEN TACKLE · CLOSE → HEAD-BUTT → SHRUG OFF" };
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
    G.qaScene = scene; G.state = "qa"; G.phase = ["tackle", "firstdown", "stiffarm"].includes(kind) ? "carry" : "air";
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
    updateParticles(dt);
    if (s.kind === "tackle") {
      const clearGap = s.gap + 4;
      const hit = s.hit || { x: 1, y: 0 };
      // Field play is elongated horizontally, so a hit's cross-field (y)
      // travel reads at roughly half its along-axis distance. Placing both
      // dinos on the hit axis lets the same beats play from any angle.
      const place = (mid, along) => ({
        x: s.baseX + hit.x * along, y: s.baseY + hit.y * along * 0.5 + mid,
      });
      // Punchy timing: the dive launches late enough that the airborne apex
      // lands ON the contact beat (the old cel peaked and came back down
      // BEFORE contact, so the tackle whiffed the air). The whole hit is
      // quicker, then holds on the resting pile.
      const diveStart = 0.14, wrapStart = 0.34;
      if (s.t < wrapStart) {
        const q = s.t / wrapStart;
        const d = lerp(s.startGap, clearGap, q);
        const cp = place(0, d / 2), tp = place(0, -d / 2);
        s.carrier.x = cp.x; s.carrier.y = cp.y;
        s.tackler.x = tp.x; s.tackler.y = tp.y;
        if (!s.dive && s.t >= diveStart) {
          s.dive = true; s.diveAt = s.t; s.phase = "gather";
          // jumpT 0.40 peaks 0.20s later — exactly at wrapStart — so the dino
          // is at the top of its lunge when it connects, then rides down.
          s.tackler.jumpT = 0.40;
          qaSetPose(s.tackler, "dive", 0.34);
        }
      } else if (!s.fallen) {
        const closeQ = clamp((s.t - wrapStart) / 0.10, 0, 1);
        // Drive: the pair travels along the hit axis TOGETHER while the
        // shoulder stays buried, the carrier crumpling upright as it is driven
        // back — heads fully intact through the whole hit.
        const driveQ = clamp((s.t - (wrapStart + 0.06)) / 0.34, 0, 1);
        const smooth = (q) => q * q * (3 - 2 * q);
        const d = lerp(clearGap, s.impactGap, closeQ);
        const knock = 20 * smooth(driveQ);
        const cp = place(0, d / 2 + knock);
        s.carrier.x = cp.x; s.carrier.y = cp.y;
        s.tackler.x = s.carrier.x - hit.x * d;
        s.tackler.y = s.carrier.y - hit.y * d * 0.5 + 1;
        if (!s.wrap) {
          s.wrap = true; s.wrapAt = s.t; s.phase = "wrap";
          // Both lean into the hit: the carrier folds forward as it is driven
          // down and the tackler drapes over its back — two intact, full-size
          // bodies collapsing together, never one flattened blob.
          beginTackleImpact(s.tackler, s.carrier, 1.10, { reposition: false, impactGap: s.impactGap, hit });
          qaSetPose(s.tackler, "tackle", 1.02);
          qaSetPose(s.carrier, "tackled", 1.02);
          s.carrier.impactLead = false; s.carrier.impactT = 0;
        }
        if (s.t >= 0.52) s.phase = "drive";
        // At the end of the drive the pair settles into the resting pile: the
        // carrier folded over (most-collapsed cel) with the tackler draped on
        // top from behind, both heavily overlapped but each fully intact.
        if (s.t >= 0.92) {
          s.fallen = true; s.phase = "pile";
          s.carrier.tackleFallPending = false;
          const restX = s.carrier.x;
          s.carrier.x = restX; s.carrier.y = s.baseY;
          s.tackler.x = restX - s.fallDir * 7; s.tackler.y = s.baseY + 2;
          s.tackler.dir = s.fallDir; s.carrier.dir = s.fallDir;
          s.tackler.jumpT = 0;
          pinPileCels(s);
          // A low dust kick under the pile as the pair hits the turf.
          for (let i = 0; i < 7; i++) spawnPart("puff",
            restX + rnd(-16, 12), s.baseY + rnd(2, 7), 1,
            rnd(-45, 45), rnd(-14, 14), rnd(16, 46),
            rnd(0.26, 0.46));
        }
      } else {
        // Resting pile: hold the two collapsed dinos pinned to their most-
        // folded cels so neither animates back upright before the clip ends.
        pinPileCels(s);
        s.tackler.dir = s.fallDir; s.carrier.dir = s.fallDir;
      }
      hold(s.carrier);
    } else if (s.kind === "stiffarm") {
      const contact = 0.40;
      const smooth = (q) => q * q * (3 - 2 * q);
      if (s.t < contact) {
        // Close: the carrier churns forward, the tackler bears down from the
        // front. The head-butt is ARMED early enough that its strike cel lands
        // exactly at contact — all the forward head drive happens BEFORE/AT the
        // hit, never after it.
        const q = s.t / contact;
        s.carrier.x = s.baseX - 26 + q * 24; s.carrier.y = s.baseY; s.carrier.dir = 1;
        s.tackler.x = s.baseX + 46 - q * 34; s.tackler.y = s.baseY - 6 + q * 6; s.tackler.dir = -1;
        // dur 0.28 ⇒ at contact the pose is ~57% through = the STRIKE cel (fi1).
        if (s.t >= contact - 0.16 && !s.armed) { s.armed = true; qaSetPose(s.carrier, "stiff", 0.28); }
      } else {
        if (!s.broke) {
          s.broke = true; s.brokeAt = s.t; s.phase = "shrug";
          // Do NOT re-arm the pose here — that would replay the wind-up after
          // contact. The pose is already mid-strike; let it recoil naturally.
          qaSetPose(s.tackler, "shoved", 0.5);
          // A crisp head-butt reads through the shake plus the game's own
          // integer-aligned impact burst at the point of contact — no scattered
          // dust cloud (that looked like floating bubbles at field scale).
          s.carrier.impactT = 0.4; s.carrier.impactLead = true; s.tackler.impactT = 0.4;
          G.shake = Math.max(G.shake, 0.24); sfx.tackle();
        }
        const q = smooth(clamp((s.t - contact) / 0.42, 0, 1));
        // The carrier breaks free and keeps churning forward (head recoiling to
        // neutral as its pose ends); the tackler is thrown back and to the side.
        s.carrier.x = s.baseX - 2 + q * 24; s.carrier.y = s.baseY; s.carrier.dir = 1;
        s.tackler.x = s.baseX + 12 + q * 22; s.tackler.y = s.baseY - 6 - q * 12; s.tackler.dir = -1;
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
      // interior linemen fight with a move too: powerful DTs bull the pocket,
      // the quicker ones spin off the guard instead of latching forever
      if (role === "DL") e.rushTech = (e.str || 82) >= 85 ? "bull" : "spin";
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

    // PRESNAP TEXTURE (source parity, MECHANICS §9): every non-DL defender
    // rolls ONE ±10px y-jitter per snap (the source's `randyards`) so shells
    // never repeat exactly — rolled once per buildPlayers, never per frame
    // (LESSON #15). Intentional shells (deep/sneak/goal-line) override below.
    // Hash-aware corner: the formation always re-centers at MID, so the
    // "hash" is where the last whistle died laterally (G.hashY). Died near a
    // sideline → the far-side corner widens toward the open field + deepens
    // (source: CB ∓100 → ∓140 on a hash, scaled to this field).
    if (!G.patMode) {
      for (const e of P) {
        if (e.team === "def" && ["LB", "CB", "S"].includes(e.role))
          e.y = clamp(e.y + rnd(-10, 10), TOP + 12, BOT - 12);
      }
      const hashY = G.hashY == null ? MID : G.hashY;
      const ht = clamp((Math.abs(hashY - MID) / ((BOT - TOP) / 2) - 0.5) * 2, 0, 1);
      if (ht > 0) {
        const farSign = hashY < MID ? 1 : -1;
        const farCB = P.filter((e) => e.team === "def" && e.role === "CB")
          .sort((a, b) => farSign * (b.y - a.y))[0];
        if (farCB) {
          farCB.y = clamp(farCB.y + farSign * 10 * ht, TOP + 12, BOT - 12);
          farCB.x += 14 * ht;   // off-coverage depth on the wide side
        }
      }
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
        if (rt.end === "block") {
          e.state = "block";
          // a blocking BACK is never just furniture: he chips for a beat and
          // then leaks into the flat as the quarterback's checkdown outlet
          if (e.role === "RB") e.rbRelease = 1.05;
          continue;
        }
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
  function useTimeout(side) {
    if (G.state !== "dead" || G.practice || G.patMode || G.clockStopped) return;
    if (!G.timeouts || G.timeouts[side] <= 0) return;
    G.timeouts[side]--;
    G.clockStopped = true;    // frozen until the next snap
    sfx.whistle();
    banner("TIMEOUT " + TEAMS[teamAbbrOf(side)][0].toUpperCase(),
      G.timeouts[side] + " remaining this half", 1.1);
  }
  function snap() {
    G.state = "live"; G.phase = "drop"; G.playT = 0;
    G.clockStopped = false;   // the snap restarts a stopped clock
    G.tape = []; G.playPass = null; G.aim = null; G.soarAim = null; G.slingAnchor = null;
    // the SAVE HIGHLIGHT chip asks "did THIS play score?", so its reference
    // total is latched where the play resets, next to the tape it belongs to
    G.hlScore0 = G.score.A + G.score.B;
    noteAiPlayStart();
    G.selCard = null;   // the pre-snap info card never lingers into the play
    // scouting log for the CPU defensive coordinator
    if (G.curPlay && offenseIsUser()) {
      G.recentOff = (G.recentOff || []).slice(-4);
      G.recentOff.push(G.curPlay.type);
    }
    G.playNo = (G.playNo || 0) + 1;
    G.flickerDone = false; G.lateralHinted = false; G.breakawayCalled = false;
    // a safety who flew last play starts this one on an empty tank —
    // the wings need about a second to recharge before a long flight
    if (G.soarSpent && G.soarSpent.play === G.playNo - 1) {
      for (const e of G.players) {
        if (e.species === "quetz" && sideOf(e) === G.soarSpent.side) e.soarCharge = 0;
      }
    }
    sfx.snap();
    // per-play flags reset by construction — the throw latch (hasThrown/
    // canPass) must never survive into the next snap via ANY entity-reuse
    // path (owner play-test 2026-08-07: "could no longer throw at all")
    // pancakeDone joins the list for the same reason: the fullback lead-block
    // pancake is a once-per-PLAY beat, so a latch that outlived the snap would
    // silently downgrade it to once per GAME (LESSON #20 — a latch or
    // accumulator model has to be reset wherever the play resets).
    G.punchDrawn = false;   // the strip question is asked once per play (LESSON #20)
    // ...and so are these two. A celebration that somehow outlived its beat
    // would freeze the quarter clock for the whole of the next snap (P0-21),
    // and the 0:00 latch is per-play by definition (P0-20). LESSON #20: a
    // latch resets where the play resets.
    clearCelebration();
    G.zeroBannerPlay = null;
    for (const e of G.players) { e.punchedThisPlay = false; e.punchRolled = false; e.pressDone = false; e.fdCeleb = 0; e.hasThrown = false; e.canPass = false; e.pancakeDone = false; e.jukeConsidered = null; e.stiffConsidered = null; e.jukePlantT = 0; e.stiffPlantT = 0; }
    // The takedown ledger, the escape ledger and the per-play contact clock are
    // latches, so they reset where the play resets — LESSON #20, which is exactly
    // what the loop above already exists to honour.
    for (const e of G.players) {
      e.firstContactT = null; e.breakAcc = 0; e.wrapClock = 0; e.brokeFree = false;
      e.tackleAcc = 0; e.grappledT = 0; e.wrapTop = 0; e.wrapN = 0; e.wrapStampT = null;
    }
    G.qbImprov = false;
    if (offenseIsUser()) G.snapTaught = (G.snapTaught || 0) + 1;   // coach bubble fades after 3 snaps
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
    // ARM FATIGUE (RB source): every attempt saps a little range; a strong
    // stamina motor barely notices, a weak one fades late in games
    if (qb) yds -= Math.min(6, (qb.attCount || 0) * (99 - (qb.stam || 80)) * 0.012);
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
    let defender = null, separation = 999, laneGap = 999, dfFutureX = 0;
    const dx = spot.x - qb.x, dy = spot.y - qb.y, lineLen2 = dx * dx + dy * dy || 1;
    for (const d of G.players) {
      if (d.team !== "def") continue;
      const future = { x: d.x + d.vx * flight, y: d.y + d.vy * flight };
      const sep = dist(future, projected);
      if (sep < separation) { separation = sep; defender = d; dfFutureX = future.x; }
      const along = clamp(((future.x - qb.x) * dx + (future.y - qb.y) * dy) / lineLen2, 0, 1);
      const lanePoint = { x: qb.x + dx * along, y: qb.y + dy * along };
      laneGap = Math.min(laneGap, dist(future, lanePoint));
    }
    // A nearby defender matters most; a defender sitting directly in the
    // throwing lane is the second cue.  Bad placement turns an otherwise
    // open receiver into a lower-percentage throw without inventing drops.
    // FLIGHT-AWARE separation pricing: defenders break on the ball 0.28s
    // into a flight (breakOnBall — untouched, owner-parked), so a deep
    // rainbow's danger radius grows with hang time while a sub-0.28s bullet
    // can never be broken on. The divisor charges exactly that closing
    // distance: bullets read honestly open, floaty lobs need real grass.
    const closeR = 24 + 30 * Math.max(0, flight - 0.28);
    let risk = clamp(0.56 - separation / Math.max(70, closeR * 1.55) + Math.max(0, 34 - laneGap) / 110 + placement / 150, 0, 1);
    // QA balance: a DB trailing BEHIND the receiver on a downfield throw
    // rarely erases the catch anymore (box-out at the catch point), so he
    // should not scare the QB off the throw the way a defender closing from
    // in FRONT of the catch point does.
    if (defender && spot.x > qb.x + 40 && dfFutureX < projected.x - 8) risk = Math.max(0, risk - 0.10);
    return {
      risk, separation, placement, defender,
      label: risk < 0.24 ? "OPEN WINDOW" : risk < 0.56 ? "TIGHT WINDOW" : "DANGER — DEFENDER"
    };
  }
  function throwLob(forceRec) {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    const to = { x: G.aim.x, y: G.aim.y };
    // Retro Bowl convention (owner ask 2026-08-07): a "throw" aimed BEHIND
    // the quarterback isn't a throw — he tucks it and takes off
    if (to.x < qb.x - 8 && !G.patMode) {
      G.aim = null; G.slingAnchor = null;
      becomeCarrier(qb);
      G.gainTag = { x: qb.x, y: qb.y - 34, text: "SCRAMBLE!", t: 0.8 };
      sfx.juke();
      return;
    }
    // the CPU's lead math was computed for ITS chosen receiver — honor it
    const rec = forceRec || pickPassTarget(to);
    const d = dist(qb, to);
    let T = 0.55 + d / 470;
    // wind pushes the landing spot
    to.x += G.weather.wind.x * T * 1.6; to.y += G.weather.wind.y * T * 1.6;
    // accuracy scatter: throws land close to where they were aimed — a weak
    // arm or ugly weather widens the cone, but never wildly
    // RB source: NOBODY has accuracy dice — the ball flies where it was
    // aimed. QBs differ by arm (range/velocity), fatigue, and read quality;
    // only weather (and a whisker of acc for the CPU's hand) bends a throw.
    const userThrow = qb.controlled && offenseIsUser();
    let err = userThrow
      ? weatherScatter() * 0.5
      : weatherScatter() * 0.7 + (100 - qb.acc) * 0.08;
    to.x += rnd(-err, err); to.y += rnd(-err, err);
    // even a wild throw stays over the field of play (only ~1-in-100 sails OOB)
    if (Math.random() > 0.01) to.y = clamp(to.y, TOP + 10, BOT - 10);
    to.x = clamp(to.x, xAtYd(-8), xAtYd(108));
    clampThrowRange(qb, to); // wind/scatter cannot turn a legal throw into a bomb
    // ONE gesture controls everything: a short pull throws a flat, quick
    // dart; a long pull floats the deep rainbow (Retro Bowl model)
    const pull = G.slingPull == null ? 0.7 : G.slingPull;
    T = (0.55 + dist(qb, to) / 470) * (0.8 + 0.28 * pull);
    const read = assessPassWindow(qb, rec, to, T);
    G.ball = { mode: "air", kind: "lob", from: { x: qb.x, y: qb.y }, to, t: 0, T, x: qb.x, y: qb.y, z: 12, holder: null, target: rec, read, pull };
    qb.attCount = (qb.attCount || 0) + 1;
    G.phase = "air"; G.aim = null; G.slingAnchor = null; qb.state = "idle"; qb.throwT = 0.3; playPose(qb, "throw", 0.32);
    controlIntendedReceiver(to, rec);
    if (G.carrier === qb) { G.carrier = null; qb.canPass = false; qb.hasThrown = true; }
    G.playPass = { passer: qb }; addStat(qb, "att");
    sfx.throw();
  }
  function throwBullet(forceRec) {
    const qb = G.ball.holder; if (!qb || !G.aim) return;
    // bullet locks onto the receiver nearest the aim point.
    // QA balance: lead by the ball's ACTUAL flight time (was a flat 0.35s) so
    // the receiver catches in stride instead of arriving early and idling at
    // the spot while his trail DB closes back onto his hip.
    // AIM ASSIST MAY FORGIVE A NEAR MISS. IT MAY NOT OVERRULE THE PLAYER.
    // pickPassTarget returns the nearest ELIGIBLE receiver, and eligible()
    // excludes anyone whose state is "block" — so a stalk-blocking WR, a
    // blocking TE or a back in protection is NOT throwable, while the aim
    // reticle gives no hint of it. Point at one and the ball went silently to a
    // different man. Measured by aiming EXACTLY at a receiver in clear weather
    // (so zero scatter): errors up to 6.72 YARDS off the reticle, several of them
    // with the man under the cursor standing completely still. Restricting the
    // same test to throwable receivers dropped the maximum to 1.63 yards, which
    // isolates this as the cause. That is the opposite of the zero-scatter
    // contract — the player cannot see WHY the ball left (LESSON #19).
    // Now the snap only holds if an eligible man is actually near the reticle;
    // otherwise the ball goes exactly where it was pointed and falls incomplete,
    // which is a result the player can read.
    const SNAP_RANGE = 2.2 * YPX;
    const snapped = forceRec || pickPassTarget(G.aim);
    const rec = forceRec || (snapped && dist(snapped, G.aim) <= SNAP_RANGE ? snapped : null);
    // ...and lead by the ball's REAL flight time. A bullet flies d/430 seconds
    // (see T below), but the lead was floored at 0.3s * 0.9: a 2-yard checkdown
    // is airborne about 0.11s and was being led 0.27s, i.e. 2.4x too far ahead.
    // That floor was a systematic 1.2-1.7 yard miss on exactly the short throws
    // the game leans on, and it is why a stationary or decelerating receiver
    // watched the ball sail past his upfield shoulder.
    const leadT = rec ? Math.min(0.75, dist(qb, rec) / 430) * 0.9 : 0;
    const tgt = rec ? { x: rec.x + rec.vx * leadT, y: rec.y + rec.vy * leadT } : { x: G.aim.x, y: G.aim.y };
    const userThrow = qb.controlled && offenseIsUser();
    let err = userThrow
      ? weatherScatter() * 0.3                       // RB source: bullets fly true
      : weatherScatter() * 0.4 + (100 - qb.acc) * 0.06;
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
    announce("td", recoverer.name); sfx.td();
    // WHAT WAS BROKEN: a scoop-and-score is six points and it got a banner and
    // a cheer — no confetti, no flash, no lens punch, no hit-stop — while an
    // offensive touchdown three functions away got all four. This is the same
    // event; it gets the same payoff, keyed to the STANDS (crowdSide()) rather
    // than to side A, so on a road week the home crowd is not celebrating your
    // defense scoring on them. It gets touchdown()'s full 0.4s payoff beat:
    // the 0.2 here was written to match F1's post-whistle clamp, and that
    // clamp was my own misreading of LESSON #23 (a tackle budget) — so this
    // was a defensive score being denied the beat its own comment promises.
    const dtHome = scoringSide === crowdSide();
    G.zoomPunch = Math.max(G.zoomPunch, 0.14);
    impactMoment(0.05, 0.4, 0.5);
    fxConfetti(recoverer.x);
    if (G.stadium && G.stadium.time !== "day") fxFlash(16);
    crowdSpike = dtHome ? 0.14 : 0.05;
    if (dtHome) crowdCheer(1.0); else crowdAww(1.2);
    startCelebration(scoringSide, Math.random() < 0.5 ? "spike" : "hop", recoverer);
    G.deadT = 1.4;
    // Keep the current offense/defense entity labels through the celebration,
    // then make the scoring team the kicking side for the conversion/kickoff.
    G.deadNext = () => {
      G.drive = scoringSide; G.losYd = 25; G.down = 1; G.toGain = 10;
      if (isHuman(scoringSide)) G.state = "ptchoice";
      else enterKick("XP");
    };
  }

  // ------------------------------------------------------------- catch logic
  function resolveArrival() {
    const b = G.ball;
    if (G.qaTele) G.qaTele.push({ tag: "arrive:" + (G.patMode ? "pat" : "reg") + ":" + (G.playPass ? "pp" : "nopp"), drive: G.drive });
    const spot = { x: b.to.x, y: b.to.y };
    const riskyMoonBall = b.kind === "lob" && b.from && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) >= 22 * YPX;
    // quick game: short throws are the offense's bread and butter — they
    // complete reliably and rarely get picked by a lurking defender
    const shortThrow = b.from && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) < 9 * YPX;
    if (riskyMoonBall && G.drive === "A" && !G.humanB && G.aiPlay) G.aiPlay.risky = true;
    const learnedPick = cpuRiskPickBoost(riskyMoonBall);
    const recs = eligible().map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    // The defender pool had no state filter, so "nearest to the landing spot"
    // could be a man who is not playing football at that instant: face-down
    // after a missed dive (proneT), frozen by a block-sell or leak freeze
    // (staggerT), or locked up in a block (blockedBy). He still became `df` and
    // drove the contested gate, the lurk pick and the tip roll below, so a
    // grounded body could be credited with the interception and an
    // `int:lurk`/`ct:` tag could name a defender who never made a play
    // (LESSON #25 — a cause tag has to name a real cause). Four siblings already
    // agree on this predicate (the `posOwner` claim, the mid-flight lane pick,
    // `breakOnBall`, the loose-ball scrum); this is the same filter on the same
    // pool, and it can only ever REMOVE a man from the contest.
    // Honest scope: narrow, not constant. The reachable case is a human defender
    // who dives and misses on a playable-defense snap (proneT 0.55, right on the
    // landing spot) or a sell/leak freeze — a blocked DL is already walled off by
    // noIntZone. Measured on a staged arrival: a prone man on the spot went
    // int:lurk -> INCOMPLETE, and with the receiver there too ct:/catch:contest
    // -> catch:solo, while healthy-defender arrivals came out identical. The
    // catch windows and the tip model are untouched — this decides only WHO may
    // contest.
    const defs = G.players.filter((e) => e.team === "def" && e.proneT <= 0 && e.staggerT <= 0 && !e.blockedBy).map((e) => ({ e, d: dist(e, spot) })).sort((a, b2) => a.d - b2.d);
    const nearestRec = recs[0];
    const intendedRec = b.target ? recs.find((r2) => r2.e === b.target) : null;
    // The player chose a receiver at release.  Preserve that intent unless a
    // teammate has genuinely arrived much closer to the bad ball placement.
    const rec = intendedRec && (!nearestRec || intendedRec.d <= nearestRec.d + 14) ? intendedRec : nearestRec;
    const df = defs[0];
    const BASE_CATCH_R = b.kind === "bullet" ? 30 : 34;
    // catch radius reflects the ATHLETE: sure hands extend a receiver's
    // range, a leaper's hops extend a defender's — plus the control bonus.
    // Difficulty scales the windows the way the RB source does (easier =
    // bigger receiver window, smaller defender window).
    // signed: easier settings widen the HUMAN offense's windows and shrink
    // the CPU's (and invert when the CPU has the ball). The sign used to live
    // in the per-catch dice; with the dice gone the window IS the difficulty.
    const dScale = (offenseIsUser() ? 1 : -1) * (diff().catchBonus || 0);
    const recR = BASE_CATCH_R * (1 + dScale) * (rec && rec.e.controlled ? 1.12 : 1) * (rec ? (0.9 + ((rec.e.hands || 75) - 60) / 300) : 1);
    // RB source ratio: the defender's play-the-ball window is only ~60-75%
    // of the receiver's — the ball is the OFFENSE's unless the defense truly
    // beats them to the spot.
    const dfR = BASE_CATCH_R * (1 - dScale) * 0.72 * (df && df.e.controlled ? 1.12 : 1) * (df ? (0.82 + ((df.e.jump || 70) - 55) / 260) : 1);
    // RB SOURCE RULE: a defender can NEVER intercept within 5 yards of the
    // throw origin — the quick game is structurally pick-proof; contested
    // short balls become swats/incompletions instead.
    const noIntZone = b.from && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) < 5 * YPX;

    // both contesters leap at the ball (guarantees the visual on a real contest)
    if (rec && rec.d < 52) rec.e.jumpT = Math.max(rec.e.jumpT || 0, 0.4);
    if (df && df.d < 52) df.e.jumpT = Math.max(df.e.jumpT || 0, 0.4);

    const qaT = (tag) => { if (G.qaTele) G.qaTele.push({ tag, drive: G.drive, kind: b.kind, recD: rec ? Math.round(rec.d) : null, dfD: df ? Math.round(df.d) : null }); };
    
    const completeCatch = (who) => {
      // QA telemetry: catch depth past the LOS (negative = screen/checkdown)
      const cdYd = Math.round((spot.x - xAtYd(G.losYd)) / YPX);
      qaT("cd:" + (cdYd <= 0 ? "neg" : cdYd < 6 ? "short" : cdYd < 14 ? "mid" : "deep"));
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
      // a deep strike or a contested high-point SOUNDS bigger than a checkdown
      const bigGrab = throwDepth > 14 * YPX || highPoint;
      sfx.catch(bigGrab);
      // catch pop: the moment of possession reads on screen, not just in audio
      fxDust(who.x, who.y + 4, bigGrab ? 7 : 4);
      if (bigGrab) { impactMoment(0.05, 0.1, 0.5); G.zoomPunch = Math.max(G.zoomPunch, 0.06); }
    };
    // --- TRUE 50/50 BALL: receiver and defender both in range → they go up
    // together and the better leap comes down with it (your timed jump counts;
    // a receiver left on autopilot leaps late and loses leverage)
    // QA balance: a defender only forces the 50/50 leap if he actually has
    // position on the BALL. A trail DB glued to the receiver's hip but a step
    // farther from the landing spot is "in phase" — he tackles on the catch,
    // he doesn't get a coin-flip to erase it (that made every completion a
    // contested jump ball and every trailing DB a turnover machine).
    // (margin +2: he must be at least AS close to the ball, not just nearby;
    // and if the receiver established position first — boxed him out — the
    // defender only gets the leap with a perfectly TIMED jump over the top)
    if (rec && df && rec.d < recR && df.d < dfR && df.d <= rec.d + 2 &&
      !(b.posOwner === rec.e && !df.e.jumpTimed)) {
      qaT("ct:" + df.e.role + (df.e.ballAttack ? ":ba" : ":cov"));  // QA telemetry: who contests
      impactMoment(0.03, 0.3, 0.5);  // contested ball arrival slows for the leap
      const timing = (e) => e.jumpTimed ? 24 : (e.jumpMistimed ? -14 : (e.autoJumped ? -4 : 0));
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
      const defenderLeverage = (df.e.ballAttack ? 2 : 0) + (df.e.catchLeverage || 0) +
        (inPassingLane ? 1.5 : 0) + defenderCrash * 3;
      const rs = posScore(rec) + 9;   // real route-runner edge: offense-first
      const ds = posScore(df) + (df.e.apex && df.e.passive === "ballhawk" ? 6 : 0) + defenderCrash * 8 + defenderLeverage * 2 + learnedPick * 18;
      if (rs >= ds) {
        let pc = 0.9 - (99 - (rec.e.hands || 75)) * 0.003 + G.weather.catchMod - 0.1 +
          (offenseIsUser() ? 1 : -1) * diff().catchBonus;
        if (rec.e.controlled) pc += 0.10; // +10% catch rate for controlled player
        if (b.read && b.read.risk >= 0.56) pc -= (b.read.risk - 0.48) * 0.16;
        if (Math.random() < pc) {
          qaT("catch:contest");   // QA telemetry: contested-branch completion
          completeCatch(rec.e);
          // If the receiver wins the ball but a defender drives through him
          // from the opposite direction, the catch is not automatically safe.
          // The ball stays live after the forced fumble, so either team can
          // still recover it instead of turning this into a scripted pick.
          const crashFumbleP = defenderCrash > 0 ? 0.02 + defenderCrash * 0.08 + defenderLeverage * 0.006 +
            (G.drive === "A" && !G.humanB ? 0.05 : 0) : 0;
          // goal-line immunity (§12): a contested catch inside the 5 is never
          // turned over by a dice roll the receiver did not choose
          if (!fumbleImmuneSpot(rec.e.x) && Math.random() < crashFumbleP) { fumble(rec.e, df.e); return; }
          banner("MOSSED!", lastName(rec.e.name) + " wins the jump ball!", 0.8);
          announce("catch", rec.e.name);
          return;
        }
        // even an offense "win" can pop loose to a leaping DB — much more so
        // when YOUR jump was mistimed and HIS was perfect
        // QA balance: 0.17 base made even WON jump balls turn over too often
        let slopP = 0.11 + defenderCrash * 0.15 + (rec.e.jumpMistimed ? 0.10 : 0) + (df.e.jumpTimed ? 0.07 : 0);
        if (!noIntZone && ds > rs - 10 && Math.random() < slopP) { qaT("int:slop"); intercepted(df.e, spot); return; }
        incomplete(spot, "BROKEN UP!"); return;
      } else {
        // the DEFENDER won the leap: his jump talent + the receiver's weak
        // hands decide whether it's a pick or just a swat
        // QA balance: base 0.52 / floor 0.2 made a lost 50/50 a coin-flip pick;
        // a normal contested loss should mostly be a swat, with picks the
        // minority outcome (double-coverage crashes still push intP way up)
        let intP = 0.32 + ((df.e.jump || 75) - 75) * 0.004 + (75 - (rec.e.hands || 75)) * 0.003 +
          ((df.e.hands || 75) - 75) * 0.003 +
          (df.e.jumpTimed && rec.e.jumpMistimed ? 0.10 : 0);
        intP += defenderCrash * 0.14 + defenderLeverage * 0.018 + learnedPick * 0.5;
        if (!noIntZone && Math.random() < clamp(intP, 0.12, 0.8)) { qaT("int:leap"); intercepted(df.e, spot); return; }
        incomplete(spot, "SWATTED AWAY!"); return;
      }
    }
    // --- solo defender in range: THE WINDOW IS THE MODEL (RB source). A
    // lurker who genuinely reaches the landing spot picks the ball; the leap
    // he visibly times (or doesn't) is what buys him the full window. No
    // blind closeness dice — either he got there or he didn't.
    if (df && df.d < dfR) {
      // leap timing scales the effective play-the-ball window: a perfectly
      // timed jump uses all of it, a flat-footed lurker only the core, a
      // mistimed hop almost none — all three are readable on screen
      let w = dfR * (df.e.jumpTimed ? 1 : df.e.jumpMistimed ? 0.5 : 0.8);
      if (df.e.ballAttack) w *= 1.05 + (df.e.catchLeverage || 0) * 0.01;
      if (df.e.apex && df.e.passive === "ballhawk") w *= 1.06;
      // quick game protection: a short, on-time throw beats the lurker
      // (structural — matches the source's pick-proof quick game)
      if (shortThrow) w *= 0.75;
      // CPU scouting: repeated risky moon balls teach the defense to sit on
      // the route — a learned lurker plays with a wider effective window
      w *= 1 + learnedPick;
      // QA balance: this branch is for a defender ALONE in the lane. A DB who
      // is farther from the ball than a boxed-out receiver standing under it
      // is NOT a lurker — without position his play is a hit, not a pick
      // (iter-7 tele: routing box-outs through here made int:lurk explode).
      const lurkHasBall = !rec || rec.d >= recR || (df.d <= rec.d + 2 && b.posOwner !== rec.e);
      if (noIntZone) w = 0;   // RB source: no picks within 5 yds of the QB
      if (lurkHasBall && df.d < w) { qaT("int:lurk"); intercepted(df.e, spot); return; }
      if (!rec || df.d < rec.d - 4) { qaT("swat:lurk"); incomplete(spot); return; }
    }
    // --- solo receiver: RB tip model — an uncontested ball in the window is
    // CAUGHT. Full stop. A drop needs a cause the camera already showed:
    // a defender beating you to the landing spot (pressure tip), a leap you
    // visibly mistimed, or a rain-slick fingertip stretch. No unexplained
    // dice, no phantom INTs after a failed roll.
    if (rec && rec.d < recR) {
      // 1) PRESSURE TIP — the defender got to the ball first (with the
      //    source's flat offense-favor margin, 5px at 20px/yd → 6px here).
      //    A tip caroms to him only if he was truly inside his own window;
      //    otherwise it dies incomplete. One per-event roll on a visible tip.
      if (df && df.d + 6 < rec.d && df.d < Math.max(dfR * 1.35, 46)) {
        if (!noIntZone && df.d < dfR && Math.random() < 0.22) { qaT("int:tip"); intercepted(df.e, spot); return; }
        qaT("drop:pressure");
        announce("drop", rec.e.name);
        incomplete(spot, "TIPPED AWAY!"); return;
      }
      // 2) MISTIMED LEAP on a high ball — you left your feet early (this
      //    flag only ever sets on the human's own early jump) and the ball
      //    sails through where your claws were
      const highBall = b.kind === "lob" && b.from && Math.hypot(b.to.x - b.from.x, b.to.y - b.from.y) > 9 * YPX;
      if (rec.e.jumpMistimed && highBall) {
        qaT("drop:mistime");
        announce("drop", rec.e.name);
        incomplete(spot, "MISTIMED THE LEAP!"); return;
      }
      // 3) WEATHER — rain/snow shrinks the SECURE part of the window
      //    (deterministic gate, mirrors the source's low_catch weather shift):
      //    an edge-of-window stretch that sticks on a dry day slips when wet
      const secureR = recR * (1 + Math.min(0, G.weather.catchMod) * 2.5);
      if (rec.d > secureR) {
        qaT("drop:weather");
        announce("drop", rec.e.name);
        incomplete(spot, "SLIPS OFF THE WET CLAWS!"); return;
      }
      qaT("catch:solo");
      completeCatch(rec.e);
      return;
    }
    qaT("inc:none");
    incomplete(spot);
  }
  function incomplete(spot, reason) {
    G.ball.mode = "dead"; G.ball.x = spot.x; G.ball.y = spot.y; G.ball.z = 0;
    playDead(reason || "INCOMPLETE", null, true);
  }
  function intercepted(defender, spot) {
    if (G.qaTele) G.qaTele.push({ tag: "icall:" + (G.patMode ? "pat" : "reg") + ":" + (G.playPass ? "pp" : "nopp") + ":" + (G.state || "?"), drive: G.drive });
    announce("int", defender.name);
    sfx.pick();
    impactMoment(0.05, 0.34, 0.45);
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
    // WHAT WAS BROKEN: this was the ONLY in-play crowd reaction in the file and
    // it had two bugs in four lines. (1) It was aww-ONLY — grep confirmed
    // crowdCheer had no in-play call site outside touchdown() and the
    // first-down block — so a sack, a pick or a strip BY your defense, the
    // loudest thing that happens in a stadium, played nothing at all, and the
    // same events played the DISAPPOINTMENT cue when the visitors turned it
    // over. (2) It was hard-keyed to side A, but the stands belong to
    // G.homeAbbr, which is side B on a road week — so half the season the crowd
    // groaned for the wrong team.
    // crowdSide() is the single source of truth for whose building this is.
    // TIERING: the cheer stays UNDER a touchdown's (1.0 cheer / 0.14 spike) so a
    // takeaway is loud without competing with six points, and the crowd BUS is
    // untouched — the 08-06 mix law is that crowd sits under the action. These
    // fire once per whistle, never per frame (LESSON #15), and crowdCheer /
    // crowdAww each self-throttle (cheerBusy / awwBusy) if two land together.
    if (!G.practice) {
      const homeBall = G.drive === crowdSide();
      const takeaway = !!info.turnover || reason === "INTERCEPTED!";
      const deadPass = ["INCOMPLETE", "DROPPED!", "BROKEN UP!", "SWATTED AWAY!", "THROWN AWAY"].includes(reason);
      if (homeBall) {
        if (takeaway) crowdAww(1.2);
        else if (reason === "SACKED!") crowdAww(0.85);
        else if (deadPass) crowdAww(0.55);
      } else {
        // ...and here is the half that was missing: their drive just died, and
        // that is a HOME CROWD EVENT.
        if (takeaway) { crowdCheer(0.95); crowdSpike = Math.max(crowdSpike, 0.11); }
        else if (reason === "SACKED!") { crowdCheer(0.75); crowdSpike = Math.max(crowdSpike, 0.08); }
        else if (deadPass) crowdCheer(0.45);
      }
    }
    // the replay tape keeps rolling briefly past the whistle so the actual
    // TACKLE / landing is on film, and the tackled dino hits the deck
    G.deadRecT = 0.7;
    // freeze the +Ny tag where the run ended so the gain reads at the whistle
    if (G.carrier && G.phase === "carry") {
      const gained0 = Math.round(ydAtX(G.carrier.x) - G.losYd);
      if (Math.abs(gained0) >= 1) G.gainTag = { x: G.carrier.x, y: G.carrier.y - 34, text: (gained0 > 0 ? "" : "") + gained0 + "y", t: 0.9 };
    }
    if (G.carrier && ["TACKLED", "SACKED!", "FLATTENED!"].includes(reason)) {
      // long enough to read the takedown, short enough that dinos pop back
      // up with football urgency instead of lying around
      G.carrier.proneT = Math.max(G.carrier.proneT || 0, 0.4);
      // ...and he must STAND BACK UP (LESSON #3). Nothing decrements proneT
      // outside live play — tickDeadEntities ticks jumpT/spinT/throwT/swingT/
      // catchDiveT/poseT/pileT and never proneT — so the authored cels expired
      // while the flag stayed set and the renderer drew the STANDING cel turned
      // 90 degrees for the rest of the beat. Measured on a routine 1st-and-20
      // tackle: 180 of 180 frames (a full 3s) in that rotated fallback, with
      // neither `prone` nor `getup` ever playing, on tackles AND sacks.
      // The chain runner clears proneT and tackleFallPending as it advances a
      // link, so this is also what releases the flag. It starts only after the
      // in-flight tackled/impact cel finishes (LESSON #2 — never an override),
      // and a first down replaces it with prone->getup->celebrate just below.
      G.carrier.poseChain = [{ pose: "prone", dur: 0.34 }, { pose: "getup", dur: 0.34 }];
      // PILE-ON (Retro Bowl look): the next one or two arriving defenders
      // keep coming and fold onto the tackle spot instead of stopping short
      const spot = { x: G.carrier.x, y: G.carrier.y };
      G.players.filter((e) => e.team === "def" && e.tackleImpactRole !== "driver" &&
        e.proneT <= 0 && dist(e, spot) > 20 && dist(e, spot) < 130)
        .sort((a, b) => dist(a, spot) - dist(b, spot)).slice(0, 2)
        .forEach((e, i) => {
          e.pileT = 0.55; e.piled = false;
          e.pileSpot = { x: spot.x + rnd(-9, 9), y: spot.y + rnd(-7, 7) + (i ? 6 : -6) };
        });
    }
    // remember the call for a possible coach's challenge
    G.lastDead = {
      reason, spotYd: null, losYd: G.losYd, down: G.down, toGain: G.toGain,
      ballYd: clamp(ydAtX(G.ball.x), 1, 99), turnover: !!info.turnover
    };
    // inside the final minute, stepping out of bounds STOPS the clock —
    // no automatic between-play runoff (incompletions already stop it)
    // incompletions, out of bounds, and turnovers stop the running clock
    // until the next snap (Retro Bowl / NFL behavior)
    if (reason === "OUT OF BOUNDS" || noSpot || info.turnover) G.clockStopped = true;
    // in-bounds whistles burn a dead-time CHUNK (RB source: 3-22s chunks; we
    // use the low band since our resets are watchable, not simulated)
    else if (!G.practice && !G.patMode && G.clock > 0) G.clock = Math.max(0, G.clock - rnd(3, 7));
    // next snap's "hash" = where this whistle died laterally (texture only)
    if (!noSpot) G.hashY = clamp(G.carrier ? G.carrier.y : G.ball.y, TOP, BOT);
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
      G.deadT = 1.4; G.deadNext = () => { changePossession(25); enterPlaycall(); };   // kickoff beat folded in
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
      G.deadT = 1.4; G.deadNext = () => { changePossession(30); enterPlaycall(); };
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
      G.deadT = 0.9; G.deadNext = enterPlaycall;
      return;
    }

    const safeSpot = Math.max(1, spotYd);
    const gained = safeSpot - G.losYd;
    if (G.carrier && !info.turnover) {
      if (G.drive === "A" && gained > 0) {
        G.rampage.A = clamp(G.rampage.A + gained * 2.2, 0, 100);
        // Split into the field that is actually true. Every positive gain used to
        // land in `passYds` regardless of play type, leaving `rushYds` permanently
        // zero and the name a lie -- the "YOUR DAY" total and the 250-yard TRAIN
        // bonus were only right because they add the two together. The SUM is
        // unchanged; each half now means what it says.
        if (G.playPass && G.playPass.receiver) G.stats.passYds += gained;
        else G.stats.rushYds += gained;
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
        // A SACK IS NOT A CARRY. Both sack sites make the QB the carrier and
        // then whistle with noSpot=false, so this block used to book every sack
        // as a QB rushing ATTEMPT carrying the lost yardage. The effect on the
        // data was severe and silent: over 6 bot games it turned 64 "carries"
        // into 0 net rushing yards, because ~-7 yards per sack cancelled the
        // real rushing gains almost exactly. Every rushing total, carry count
        // and yards-per-play figure in the box score, the season roll-up and the
        // balance harness was wrong, which is why no balance tuning could be
        // trusted. Sack yardage now lands on the QB's own `sacked`/`sackYds`
        // fields and no longer touches rushYds or car.
        if (reason === "SACKED!") {
          addStat(G.carrier, "sacked"); addStat(G.carrier, "sackYds", g2);
        } else {
          addStat(G.carrier, "rushYds", g2); addStat(G.carrier, "car");
        }
      }
    }

    if (info.turnover) {
      G.returnPlay = null;
      banner(reason, info.by ? (info.fumbleRec ? "Recovered by " : "Picked off by ") + lastName(info.by) : "", 1.8);
      G.deadT = 1.2;   // the pick/scoop was just watched live — no replay tax
      G.deadNext = () => { changePossession(100 - spotYd); enterPlaycall(); };
      return;
    }

    // normal down progression
    let sub = "";
    if (!noSpot) sub = (gained >= 0 ? "+" : "") + Math.round(gained) + " yds";
    // ONE spot, ONE first-down line, used by both the ruling and the display.
    // This used to compare the raw float spot (34.87) against the integer line
    // (35) while the plate DREW Math.round(spotYd) = 35: the ball sat exactly on
    // the yellow line and the HUD said "4th & 1". Rounding first makes the ruling
    // match what the player sees, and a tie goes to the offense (LESSON #17).
    // fdLine is captured BEFORE losYd moves, so the chains cannot drift: toGain
    // is always the distance to the SAME line for the whole series.
    const fdLine = G.losYd + G.toGain;
    const spotInt = noSpot ? G.losYd : Math.round(clamp(spotYd, 1, 99));
    if (spotInt >= fdLine && !noSpot) {
      G.losYd = spotInt; G.down = 1; G.toGain = Math.min(10, 100 - G.losYd);
      banner("FIRST DOWN!", sub, 0.9); sfx.firstdown();
      // moving the chains ALWAYS gets a celebration: the ball carrier pops up
      // and throws the first-down signal (arm out), the fresh line of gain
      // flashes, and the home crowd roars
      const fdGuy = G.carrier || G.players.find((e) => (e.team === "off") === (G.drive === "A") && e.role === "QB");
      if (fdGuy) {
        const wasDown = fdGuy.proneT > 0 || fdGuy.tackleFallPending ||
          ["tackled", "prone", "dive", "diveCatch"].includes(fdGuy.pose);
        if (wasDown) {
          // He earned it on the turf: let the tackle beat finish (this also
          // keeps the tackle-pair overlap exemption intact so the wrap stays
          // on screen), then STAND UP through the authored getup cels, and
          // only then throw the first-down signal.
          fdGuy.poseChain = [
            { pose: "prone", dur: 0.14 },
            { pose: "getup", dur: 0.3 },
            { pose: "celebrate", dur: 0.85, fdCeleb: 0.85 },
          ];
          G.fdRise = true;
        } else {
          fdGuy.proneT = 0; fdGuy.jumpT = 0.45; fdGuy.fdCeleb = 1.3;
          playPose(fdGuy, "celebrate", 1.3);
        }
      }
      G.fdCelebEnt = fdGuy;
      G.fdFlash = 1.1;
      announce("firstdown", fdGuy && fdGuy.name);
      crowdSpike = Math.max(crowdSpike, 0.06); crowdCheer(0.35);
    } else {
      if (!noSpot) G.losYd = spotInt;
      // distance to the UNCHANGED first-down line — never a re-derivation from
      // `gained`, which drifted the chains a yard whenever rounding disagreed
      G.toGain = Math.max(1, fdLine - G.losYd);
      G.down += 1;
      if (G.down > 4) {
        banner("TURNOVER ON DOWNS", "", 1.8);
        // WHAT WAS BROKEN: a fourth-down stop IS a turnover — same swing as a
        // pick — and this branch handed the ball over with no payoff of any
        // kind: no lens, no shake, no crowd, no ticker. Compare the pick
        // branch a few lines up, which gets a card and a slow-mo beat.
        // Tiered as a turnover when the HOME defense made it (crowdSide()), and
        // a stand inside the 10 additionally earns the sparks, because a
        // goal-line stand is the loudest stop in football. Everything here is
        // existing vocabulary and all of it sits below a touchdown's confetti +
        // 0.14 spike + mega card, so it cannot compete with six points.
        const stoodUp = G.drive !== crowdSide();
        const goalLine = G.losYd >= 90;
        // a sack already fired its own (better) ticker line — don't stomp it
        if (reason !== "SACKED!") announce("tackle", G.carrier && G.carrier.name);
        if (stoodUp) {
          crowdCheer(goalLine ? 1.0 : 0.85);
          crowdSpike = Math.max(crowdSpike, goalLine ? 0.12 : 0.09);
          G.zoomPunch = Math.max(G.zoomPunch, 0.09);
          G.shake = Math.max(G.shake, 0.2);
          if (goalLine) { sfx.roar(); fxSparks(G.carrier ? G.carrier.x : G.ball.x, G.carrier ? G.carrier.y : G.ball.y, 10); }
        } else crowdAww(1.1);
        // down stays 5 only for this beat; downText()'s `|| "4th"` covers the
        // plate, and changePossession resets it before the next snap
        G.deadT = 1.2; G.deadNext = () => { changePossession(100 - G.losYd); enterPlaycall(); };
        return;
      }
      banner(reason, sub + "  ·  " + downText(), 1.2);
    }
    // Retro-style pace: the next play lines up fast. Rising first downs get
    // just enough beat for the getup + point; replays only for sacks.
    // 0.6s to cards — the tackle/getup chains finish BEHIND the card screen
    // (tickDeadEntities runs in playcall too), and the sub-1s takedown
    // already sold the sack live: no more mandatory replay tax (PG pacing)
    G.deadT = 0.6; G.fdRise = false;
    G.deadNext = enterPlaycall;
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
  // ONE place that ends a celebration, so no caller can null the latch and
  // leave entities stranded in celebPhase (tickDeadEntities skips those, and a
  // stranded body never finishes its pose chain).
  function clearCelebration() {
    G.celebrate = null;
    for (const e of G.players || []) e.celebPhase = null;
  }
  function updateCelebration(dt) {
    const c = G.celebrate;
    // The LIFETIME now ticks unconditionally in update() (P0-21); this
    // function is purely the choreography.
    if (!c || c.t <= 0) return;
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
          for (let i = 0; i < 3; i++) spawnPart("splash", e.x + rnd(-8, 8), e.y + rnd(-4, 6), 0, rnd(-50, 50), rnd(-30, 30), rnd(30, 90), rnd(0.3, 0.6));
        }
        if (e.x > xAtYd(109)) { e.dir *= -1; e.slideV = 60; } // don't slide into the stands
      } else if (e.celebPhase === "party") {
        // bounce and shuffle around the scorer
        if (e.jumpT <= 0) {
          e.jumpT = 0.4;
          // the SPIKE: the scorer slams it down once — turf explodes
          if (c.style === "spike" && !c.spiked && e === c.scorer) {
            c.spiked = true; sfx.tackle(); G.shake = Math.max(G.shake, 0.25);
            for (let i = 0; i < 10; i++) spawnPart("puff", e.x + rnd(-8, 8), e.y + rnd(-4, 6), 2, rnd(-70, 70), rnd(-50, 50), rnd(30, 100), rnd(0.3, 0.6));
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
    G.zoomPunch = Math.max(G.zoomPunch, 0.14);   // the lens leans into the moment
    fxConfetti(G.carrier ? G.carrier.x : (G.ball ? G.ball.x : G.camX + W / 2));
    if (G.stadium && G.stadium.time !== "day") fxFlash(16);
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
    impactMoment(0.05, 0.4, 0.5);   // the goal-line cross gets a slow payoff beat
    banner("TOUCHDOWN " + TEAMS[scoringAbbr][0].toUpperCase() + "!",
      (rainParty ? "💦 PUDDLE PARTY! · " : "") + drivePayoff, 2, { tier: "mega" });
    announce("td", G.carrier && G.carrier.name);
    sfx.td();
    // WHAT WAS BROKEN: the stands CHEERED THE OPPONENT. A touchdown against you
    // played crowdCheer(0.5) — a real roar, just quieter — and there was no aww
    // anywhere on this path, so the one moment a home crowd is guaranteed to
    // groan was the moment it applauded. And "A" is not the home side on a road
    // week (G.homeAbbr = G.opp there), so the venue was wrong too.
    const tdHome = t === crowdSide();
    crowdSpike = tdHome ? 0.14 : 0.05;
    if (tdHome) crowdCheer(1.0); else crowdAww(1.2);
    if (rainParty) {
      const c = G.carrier || G.ball;
      for (let i = 0; i < 26; i++) spawnPart("splash", c.x + rnd(-16, 16), c.y + rnd(-8, 12), 0, rnd(-60, 60), rnd(-40, 40), rnd(30, 110), rnd(0.3, 0.7));
    }
    if (t === "A") G.stats.tds++;
    // 1.2s to the conversion choice — the celebration keeps playing BEHIND
    // the ptchoice card (updateCelebration ticks there), PG's TD flow
    G.deadT = 1.2;
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
      // no mandatory TD replay — the challenge flag / G-key path still has it
      G.deadNext = () => { G.state = "ptchoice"; };
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
      G.deadNext = () => { if (wantTwo) goForTwo(); else enterKick("XP"); };
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
  // ONE geometry for the two conversion buttons — ptClick used to hit-test
  // the 4-card playcall layout while the draw used its own rects, so clicks
  // landed on nothing (owner play-test 2026-08-07: "clicking 1pt/2pt doesn't work")
  function ptRects() {
    const cards = [{ kind: "XP" }, { kind: "GO2" }];
    // WHAT WAS BROKEN: the player was asked to choose a conversion THROUGH an
    // opaque card. The mega TD banner fills y = H/2-72 .. H/2+60 — 198..330 at
    // this 540px height — at .88 alpha, and it is drawn AFTER drawPTChoice
    // (drawBanner is the last overlay in drawFrame, by design, because a banner
    // must never be buried). Both conversion buttons sat at y 300 h 72, so
    // 30px of each — their entire top border and the top 42% of their body —
    // plus the banner's 5px gold rule at y 325 were painted over. Verified by
    // recording every fillRect of one ptchoice frame with the banner live:
    // 3 of the card's rects intersected the banner fill, and a mid-tier banner
    // (212..316, e.g. BEAST QUAKE) overlapped them too. The banner's DURATION
    // and its any-input skip contract are owner-tuned, so the geometry moves
    // instead: 356 clears the mega banner's bottom edge by 26px, and both the
    // draw and the hit test read this one rect list, so they cannot drift.
    const rects = [{ x: W / 2 - 300, y: 356 }, { x: W / 2 + 60, y: 356 }];
    return cards.map((c, i) => ({ x: rects[i].x, y: rects[i].y, w: 240, h: 72, c }));
  }
  // ONE geometry for the opt-in replay chip too, same reason ptRects exists.
  function ptReplayRect() { return { x: W / 2 - 170, y: 446, w: 340, h: 28 }; }
  // ------------------------------------------------ SAVE HIGHLIGHT (GIF door)
  // WHAT WAS BROKEN: the GIF exporter is a real, finished feature that almost
  // nobody could reach. It lives on the replay screen, and the replay screen
  // had exactly two doors: the once-per-game coach's challenge — which also
  // risks a timeout and is whitelisted to INCOMPLETE / DROPPED! / INTERCEPTED!
  // / TACKLED / BROKEN UP! / SWATTED AWAY!, i.e. every reason EXCEPT a
  // touchdown, a sack, a FLATTENED! and a fumble-return TD — and, since batch
  // F, the PAT card after one of YOUR touchdowns. A safety, a pick, a
  // scoop-and-score, a fourth-down stand, a two-point stop and every CPU
  // touchdown had no door at all: the exact plays anyone would want to share.
  //
  // This door is free. It costs no challenge and no timeout, it appears only
  // on a dead beat that is ALREADY parked waiting for input, and the replay's
  // continuation puts the game back on that same beat — G.deadT and G.deadNext
  // are untouched while state is "replay" (update() returns straight out of
  // the replay branch), so nothing about dead-ball pacing changes.
  //
  // "Did this play score?" is answered by comparing the running total against
  // the total latched at the snap, which is where the play resets (LESSON #20)
  // — that covers touchdown(), defensiveTouchdown(), the safety branch and the
  // two-point conversion from one place. Turnovers come off G.lastDead, and a
  // fourth-down stop is the documented G.down === 5 that only exists for the
  // length of this beat. G.tape is cleared only in snap(), so at this beat it
  // still holds the play that just happened.
  function highlightBeat() {
    return G.state === "dead" && !G.replay && !!G.tape && G.tape.length >= 50 &&
      ((G.score.A + G.score.B) !== (G.hlScore0 || 0) ||
        !!(G.lastDead && G.lastDead.turnover) || G.down > 4);
  }
  // ONE geometry for the chip, for the same reason stopChipVisible() exists:
  // an invisible hotspot that outlives its box eats taps. It sits under the
  // STOP CLOCK chip whenever that one is also up.
  function highlightChipRect() { return { x: 10, y: stopChipVisible() ? 82 : 40, w: 214, h: 36 }; }
  function saveHighlight() {
    if (!highlightBeat()) return;
    startReplay(() => { G.state = "dead"; });   // tape >= 50 is already proven
    gifStart();                                 // needs G.replay, so it goes second
  }
  function ptClick() {
    // WHAT WAS BROKEN: startReplay had exactly ONE caller — inside
    // throwChallenge — and G.replay is assigned nowhere else, so the replay
    // screen, and the GIF exporter that lives on it, could only be reached by
    // spending the once-per-game coach's challenge on a play the referee has a
    // 38% chance of overturning. Meanwhile snapshotFrame runs on EVERY live
    // frame to feed a tape almost nobody could watch. A touchdown is the
    // shareable artifact of a football game, and G.tape is only cleared in
    // snap(), so at this card the tape still holds the score: the last 126
    // frames are the final ~1.4s of the play plus the 0.7s of celebration that
    // deadRecT films. This is also the one beat that is ALREADY parked waiting
    // on a human decision, so a look at the tape costs zero pacing — the owner
    // deleted the mandatory post-TD replay on purpose and this stays OPT-IN,
    // with the card still sitting here when the replay ends.
    const rr = ptReplayRect();
    if (!G.replay && G.tape.length >= 50 &&
      mouse.x >= rr.x && mouse.x <= rr.x + rr.w && mouse.y >= rr.y && mouse.y <= rr.y + rr.h) {
      startReplay(() => { G.state = "ptchoice"; }); return;
    }
    for (const r2 of ptRects()) {
      if (mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h) {
        ptChoose(r2.c.kind === "GO2"); return;
      }
    }
  }
  function drawPTChoice() {
    // Retro Bowl-style: the field dims and two BIG buttons own the moment
    cx.fillStyle = "rgba(5,12,8,.45)"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(15);
    // the prompt clears the banner band too (its bottom 6px used to sit under it)
    cx.fillStyle = "#3a63c4"; cx.fillRect(W / 2 - 280, 130, 560, 54);
    cx.strokeStyle = "#f4f6f1"; cx.lineWidth = 2; cx.strokeRect(W / 2 - 280, 130, 560, 54);
    cx.fillStyle = "#f4f6f1"; cx.fillText("1 or 2 point conversion?", W / 2, 166);
    ptRects().forEach((r2) => {
      const c = r2.c;
      const hov = mouse.x >= r2.x && mouse.x <= r2.x + r2.w && mouse.y >= r2.y && mouse.y <= r2.y + r2.h;
      cx.fillStyle = hov ? "#4a73d4" : "#3a63c4"; cx.fillRect(r2.x, r2.y, r2.w, r2.h);
      cx.fillStyle = "rgba(0,0,0,.35)"; cx.fillRect(r2.x + 4, r2.y + r2.h, r2.w, 6);
      cx.strokeStyle = "#f4f6f1"; cx.lineWidth = 2; cx.strokeRect(r2.x, r2.y, r2.w, r2.h);
      cx.font = PF(14); cx.fillStyle = "#f4f6f1";
      cx.fillText(c.kind === "XP" ? "1 PT" : "2 PT", r2.x + r2.w / 2, r2.y + 34);
      cx.font = PF(7); cx.fillStyle = "rgba(244,246,241,.75)";
      cx.fillText(c.kind === "XP" ? "[1] drag-kick the extra point" : "[2] one snap from the 2", r2.x + r2.w / 2, r2.y + 58);
    });
    // the opt-in replay/GIF chip (see ptClick for why it lives on this card).
    // Tap OR R, so mobile gets the same door as the keyboard.
    if (G.tape.length >= 50) {
      const rr = ptReplayRect();
      const hov = mouse.x >= rr.x && mouse.x <= rr.x + rr.w && mouse.y >= rr.y && mouse.y <= rr.y + rr.h;
      cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(rr.x, rr.y, rr.w, rr.h);
      cx.strokeStyle = hov ? "#ffd23f" : "#9db0a4"; cx.lineWidth = 2; cx.strokeRect(rr.x, rr.y, rr.w, rr.h);
      cx.font = PF(7); cx.fillStyle = hov ? "#ffd23f" : "#9db0a4"; cx.textAlign = "center";
      cx.fillText("[R] / TAP = REPLAY THAT TOUCHDOWN  ·  G = SAVE GIF", rr.x + rr.w / 2, rr.y + 18);
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
    const last = lsGet("dinobowl_lasthalf");
    const pool = HALF_GAMES.filter((k) => k !== last);
    const kind = pool[(Math.random() * pool.length) | 0];
    lsSet("dinobowl_lasthalf", kind);
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
      // modulo the species' OWN cel count, not a hard-coded 2 — trex carries a
      // 4-frame walk since the 08-07 pass, and `% 2` dropped the mirrored half
      const spr = sheet.trex, fi = ((performance.now() / 140) | 0) % spr.R.length;
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
      // same as the meteor game above: cycle carno's full 4-frame walk
      const spr = sheet.carno, fi = ((performance.now() / 100) | 0) % spr.R.length;
      cx.fillStyle = "rgba(0,0,0,.28)";
      cx.fillRect(h.px - G.camX - 8, MID + 2, 16 - h.jumpZ * 0.1, 4);
      cx.drawImage(spr.R[fi], h.px - G.camX - spr.w / 2, MID - spr.h + 6 - h.jumpZ);
    }
    drawHalfFrame("🏃 DINO DASH — " + Math.max(0, Math.round(ydAtX(h.px))) + " YDS — " + Math.ceil(Math.max(0, h.t)) + "s",
      "TAP/SPACE = HURDLE THE ROCKS · FACEPLANTS KILL YOUR SPEED · GO GO GO");
  }

  function endQuarter() {
    if (G.quarter === 2) {
      G.quarter = 3; G.clock = (G.qlen || QUARTER_LEN);
      if (G.timeouts) { const toN2 = (G.qlen || 120) >= 180 ? 3 : 2; G.timeouts.A = toN2; G.timeouts.B = toN2; }
      const secondHalf = () => {
        G.drive = G.openingDrive === "A" ? "B" : "A"; G.losYd = 25; G.down = 1; G.toGain = 10; enterPlaycall();
      };
      if (G.halftimeShow) {
        banner("HALFTIME", "Mascot minigame time — four shows in the rotation!", 2.0);
        G.state = "dead"; G.deadT = 2.0;
        G.deadNext = () => startHalftimeShow(secondHalf);
      } else {
        // Retro Bowl style: a beat on the score, straight into the 3rd
        banner("HALFTIME", G.score.A + " — " + G.score.B, 1.6);
        G.state = "dead"; G.deadT = 1.6; G.deadNext = secondHalf;
      }
    } else if (G.quarter >= 4) {
      // A PLAYOFF GAME CANNOT END LEVEL. Overtime was a single timed 5th quarter,
      // so if it expired still tied the game just ended -- in the playoffs that is
      // a drawn elimination game, and via the old `won` check it counted as your
      // loss. Keep playing overtimes until someone leads. A regular-season tie is
      // legal and still stands after one overtime.
      const mustDecide = !!(G.szn && G.szn.phase === "playoffs");
      if (G.score.A === G.score.B && (!G.ot || mustDecide)) {
        const otNo = G.ot ? (G.quarter - 4) + 1 : 1;
        G.ot = true; G.quarter = 4 + otNo; G.clock = (G.qlen || QUARTER_LEN);
        // OVERTIME is a fresh sudden-death possession from the 25 — the old
        // code silently continued whatever mid-drive down/distance the 4th
        // quarter died on, deciding OT by clock luck
        const otBall = Math.random() < 0.5 ? "A" : "B";
        G.drive = otBall; G.losYd = 25; G.down = 1; G.toGain = 10; G.hashY = MID;
        banner(otNo > 1 ? "OVERTIME " + otNo + "!" : "OVERTIME!",
          TEAMS[teamAbbrOf(otBall)][0].toUpperCase() + " wins the toss — next score wins", 2.2);
        G.state = "dead"; G.deadT = 2.2; G.deadNext = enterPlaycall;
      } else {
        gameOver();
      }
    } else {
      G.quarter += 1; G.clock = (G.qlen || QUARTER_LEN);
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
    const iWon = win === G.my, iLost = win === G.opp;
    banner(win ? TEAMS[win][0].toUpperCase() + " WIN!" : "TIE GAME", "", 99,
      iWon ? { tier: "mega" } : undefined);
    // WHAT WAS BROKEN: every final whistle played sfx.td() — the SCORING
    // FANFARE. Losing by four touchdowns triggered the same triumphant sting as
    // winning, which is the single loudest wrong note in the game. A win keeps
    // the fanfare and now also gets the payoff it never had (mega card, lens,
    // crowd); a loss gets sfx.pick(), which is already written as "a sting plus
    // the stadium inhaling", and the aww; a tie gets the flat whistle.
    // No confetti here: the champion beat in advancePlayoffs owns the confetti
    // so an ordinary week-6 win does not look like a trophy.
    if (iWon) {
      sfx.td(); crowdCheer(1.0); crowdSpike = 0.14;
      G.zoomPunch = Math.max(G.zoomPunch, 0.1);
    } else if (iLost) { sfx.pick(); crowdAww(1.2); }
    else { sfx.whistle(); crowdAww(0.6); }
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
    G.state = "kick"; G.aim = null; G.hashY = MID;   // kicks re-center
    const kicker = roster(G.drive === "A" ? G.my : G.opp).kicker;
    G.kick = {
      kind, stage: 0, t: 0, power: 0, acc: 0, kicker, cpu: !isHuman(G.drive),
      // WHICH INPUT MODEL OWNS THIS KICK. There are two of them — the two-beat
      // meter (tap / SPACE / the touch KICK button) and the pull-back drag —
      // and they used to BOTH run on one gesture: the press burned the power
      // beat off the oscillating bar while the same held pointer accumulated a
      // pull, so one gesture produced two different power numbers. `mode` stays
      // null until the first real input decides (LESSON: latch the model, do
      // not stack them); after that the loser is a no-op for the rest of the
      // kick. `press` holds the meter value sampled at a press that has not yet
      // been decided, and a seeded `val` keeps the first frame finite.
      mode: null, press: null, val: 50,
      // Kickoffs are launched from the kicking side's 35, independent of the
      // previous drive's final spot.  That is important after touchdowns.
      // An EXTRA POINT is snapped from a fixed spot too, and it is not the
      // drive's LOS. This read `kind === "KO" ? 35 : G.losYd`, and touchdown()
      // never assigns G.losYd — the author knew, because goForTwo sets
      // `G.losYd = 98` by hand. So the XP was staged wherever the scoring PLAY
      // started: score from the 45 and the kicker lined up at the 39 for a
      // 68.8-yard kick while the meter plan and the HUD both said 33 (measured
      // staged-vs-shown: +79.8 yds from the 1, +35.8 from the 45, -17.2 from the
      // 98). A blocked XP inherited it too — the live ball started 60.3 yards
      // from the end zone the recovery has to reach (`spotYd >= 100`). The
      // scoring was never wrong; the picture was, which is LESSON #4 in reverse.
      // 84 is derived, not chosen: `100 - 84 + 17 = 33` reproduces the two
      // hard-coded 33s (kickMeterPlan and resolveKick), so geometry, meter and
      // scoring agree WITHOUT touching G.losYd — that is the live drive spot and
      // must keep pointing at the real ball. Measured after: staged 29.8 vs shown
      // 33 from EVERY touchdown spot, the same -3.2 the file already carries on
      // ordinary field goals (the unit stages 140px = 5.83 yds back while the
      // distance model assumes 7), and a blocked XP now starts 21.3 yards out.
      originYd: kind === "KO" ? 35 : kind === "XP" ? 84 : G.losYd,
    };
    buildKickFormation(kind);
  }

  function startKickoff(receivingSide) {
    if (receivingSide == null) receivingSide = other(G.drive);
    G.hashY = MID;   // a new possession starts centered
    // Kickoffs and kick returns are intentionally removed. Rather than a kick
    // meter and a run-back, the receiving team simply takes over at its own 25
    // (Retro Bowl handles the start of a possession the same way). `changePos`
    // flips the drive, so set it to the kicking side first.
    G.drive = other(receivingSide);
    G.kick = null; G.kickFly = null; G.returnPlay = null;
    // A VISIBLE kickoff (owner ask 2026-08-07: "there was no kickoff"):
    // the ball actually boots off the tee and sails through the end zone
    // on camera — still no live return (owner keeper), just the moment.
    //
    // WHAT WAS BROKEN: this beat used to run `G.players = []` one line before
    // building the flight, so the 1.7s the owner asked for played over a field
    // with NOBODY on it — no kicker, no tee, no coverage, no return unit. The
    // comment above promised a boot; the code deleted everyone who could boot
    // it. Worse, the flight went the wrong way: the drawing frame always points
    // the CURRENT offense right, `G.drive` is the KICKING team here, and
    // `xAtYd(66) -> xAtYd(-4)` runs right-to-left, i.e. backwards into the
    // kicking team's OWN end zone (ROADMAP S8). Measured baseline: 0 players
    // for all 102 frames of the beat, ball resting at x 144 = the left end zone.
    //
    // THE FIX: stand both units up in a real kickoff alignment and boot from
    // the kicking team's own 35 toward the receiving end zone. Everything here
    // is presentation — the whole beat lives in state "dead", where update()
    // runs only tickDeadEntities(), so no AI ticks and no ball is ever live.
    // Kick RETURNS remain an owner veto: deadNext still spots the receiving
    // team at its own 25, exactly as before.
    sfx.kick(); crowdCheer(0.25);
    banner("KICKOFF", "…sails through the end zone — touchback, out at the 25", 1.6);
    G.state = "dead"; G.deadT = 1.7; G.clockStopped = true;
    const teeX = xAtYd(35);
    buildKickoffSet(teeX);
    // T 1.45 inside the 1.7s beat leaves the ball a quarter-second on the deck
    // in the end zone before the whistle, instead of vanishing mid-air.
    G.koFly = { t: 0, T: 1.45, fx: teeX, fy: MID, tx: xAtYd(104), ty: MID + rnd(-40, 40) };
    G.ball = { mode: "koflight", x: G.koFly.fx, y: G.koFly.fy, z: 12, holder: null };
    // camera sits BEHIND the tee now that the ball travels left-to-right, so
    // the field the kick is headed for is the part you can see.
    G.camX = clamp(teeX - W * 0.25, 0, FIELD_LEN - W);
    G.deadNext = () => {
      G.koFly = null;
      changePossession(25);
      // The units now walk to the new line of scrimmage. Two things force this:
      // possession flips the drawing frame (the offense always attacks right),
      // and `teamOf()` reads G.drive — so without the side-tag swap the kicking
      // team would suddenly be painted in the RECEIVING team's colours on the
      // first card. Re-ranking them at the new LOS also means no screen ever
      // renders with `G.players.length === 0`; enterPresnap's buildPlayers()
      // replaces this holding pattern with the real formation on the snap.
      const losX = xAtYd(G.losYd);
      let o = 0, d = 0;
      for (const e of G.players) {
        e.team = e.team === "off" ? "def" : "off";
        e.dir = e.team === "off" ? 1 : -1;
        e.vx = 0; e.vy = 0; e.state = "idle";
        const i = e.team === "off" ? o++ : d++;
        e.x = losX + (e.team === "off" ? -30 - (i % 2) * 24 : 30 + (i % 2) * 24);
        e.y = MID - 150 + (i % 11) * 30;
      }
      resolvePlayerContacts();
      // ...and the ball must NEVER be handed on still in "koflight". Every other
      // ball mode has an owner: "loose"/"air" are advanced by updateBall, "held"
      // rides its holder, "kickfly" by updateKickFly. "koflight" is advanced
      // ONLY by the koFly block inside the dead-state branch, so the moment the
      // beat ended nothing moved it and the football simply hung in mid-air over
      // the first play-call card of the game (measured: still mode "koflight",
      // z 12, at t = 10.5s, ~1.7s after the beat). Spot it dead on the new line.
      G.ball = { mode: "dead", x: losX, y: G.hashY || MID, z: 0, holder: null };
      G.carrier = null; G.controlled = null;
      enterPlaycall();
    };
  }
  // The kickoff alignment itself, 22 cosmetic bodies. Deliberately
  // self-contained rather than routed through buildKickFormation("KO"): that
  // builder is shared with the live FG/PUNT snaps and hard-depends on a
  // populated `G.kick`, and seeding a fake G.kick during a "dead" beat would
  // put a non-null kick object in front of every `G.kick` reader for 1.7s.
  // Nothing here is live, so it owns its own bodies.
  function buildKickoffSet(teeX) {
    const kickR = roster(G.drive === "A" ? G.my : G.opp);
    const recvR = roster(G.drive === "A" ? G.opp : G.my);
    const cover = kickR.defense || [];
    const back = recvR.defense || [];
    const SPEC = ["allo", "deinony", "trike", "stego"];
    const pick = (list, i) => list[i % Math.max(1, list.length)] || { name: "", spd: 80 };
    const P = [];
    // Kicking team = "off" (teamOf maps "off" to G.drive, the kicking side):
    // ten coverage dinos strung across the restraining line, five per side.
    for (let i = 0; i < 10; i++) {
      const p = pick(cover, i), lane = i < 5 ? i : i - 5;
      const e = mkEnt("off", SPEC[i % 4], p.name || "", "GUN", p.spd || 82, { str: 74, tkl: 78 });
      e.x = teeX - 18 - (i % 2) * 10;
      e.y = MID + (i < 5 ? -1 : 1) * (36 + lane * 40);
      e.state = "idle";
      P.push(e);
    }
    // The kicker, a stride behind the tee. There is no authored "kick" cel in
    // COMPACT_ACTION_KEYS, so the boot borrows the authored "throw" pack — a
    // plant, a release at head height, then a forward follow-through, which is
    // the closest thing in the sprite set to a leg swing. tickDeadEntities()
    // runs the pose timer during "dead", so the follow-through actually plays.
    const kk = mkEnt("off", "troodon", (kickR.kicker || {}).name || "", "K", 70, {});
    kk.x = teeX - 34; kk.y = MID; kk.state = "idle";
    playPose(kk, "throw", 0.52);
    P.push(kk);
    // Receiving team = "def": an eight-dino wall on its own 45, and three
    // returners waiting in the end zone the ball is actually headed for. They
    // stand and watch — a live run-back is an owner veto (ROADMAP keeper).
    for (let i = 0; i < 8; i++) {
      const p = pick(back, i);
      const e = mkEnt("def", SPEC[(i + 1) % 4], p.name || "", "LB", p.spd || 80, { str: 76, tkl: 80 });
      e.x = xAtYd(55) + (i % 2) * 12;
      e.y = MID - 168 + i * 48;
      e.state = "idle";
      P.push(e);
    }
    for (let i = 0; i < 3; i++) {
      const p = pick(back, i + 8);
      const e = mkEnt("def", "deinony", p.name || "", "CB", p.spd || 88, { str: 70, tkl: 74 });
      e.x = xAtYd(88 + i * 4); e.y = MID + (i - 1) * 96; e.state = "idle";
      P.push(e);
    }
    G.players = P;
    G.carrier = null; G.controlled = null; G.selCard = null;
    resolvePlayerContacts();
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
    // P0 SOFTLOCK GUARD: onPress and the drag release can both land inside one
    // input event, and enterKick seeds no k.val. The second call then ran
    // `k.acc = undefined - 50` = NaN, which NaN'd the punt geometry and left the
    // game in "kickfly" with a flight that could never complete — a permanent
    // frozen field mid-game. Re-entry is now refused and val/power are pinned
    // finite, so a doubled press is simply ignored instead of fatal.
    if (!k || k.stage >= 2) return;
    // MODE LATCH (see enterKick): once a pull has claimed the kick, SPACE and
    // stray taps stop here instead of silently eating a meter beat behind the
    // player's back. Otherwise this call IS the meter, so it claims the kick.
    if (k.mode === "drag") return;
    k.mode = "meter"; k.press = null;
    if (!Number.isFinite(k.val)) k.val = 50;
    // The power beat LOCKS POWER — it is not the kick. sfx.kick() fired here,
    // so every metered kick played a boot sound at the press and a second one
    // when launchKick actually booted the ball (measured: 2 sfx.kick per kick,
    // now 1). A short tick marks the lock; the boot stays with the boot.
    if (k.stage === 0) { k.power = k.val; k.stage = 1; k.t = 0; beep(880, 0.05, "square", 0.045); return; }
    if (!Number.isFinite(k.power)) k.power = k.val;
    k.acc = k.val - 50; // -50..50, 0 is perfect
    k.stage = 2; k.t = 0;
    resolveKick();
  }
  // A press in the kick state is AMBIGUOUS: it can be the tap that stops the
  // meter or the grab that starts a pull. It used to be treated as BOTH — it
  // ran kickLocked immediately (burning the power beat and firing the kick
  // sound) while the drag model kept accumulating on the same held pointer.
  // The press now only ARMS the gesture and remembers the meter value at the
  // instant of the press; kickRelease decides what it meant.
  function kickPress() {
    const k = G.kick;
    if (!k || k.cpu || k.stage >= 2) return;
    if (k.mode === "drag") return;                      // the pull owns this kick
    if (k.mode === "meter") { kickLocked(); return; }   // meter owns it: press = beat
    k.press = { val: Number.isFinite(k.val) ? k.val : 50 };
  }
  // ONE place decides what the end of a press meant. A pull past the regrip
  // threshold is a DRAG kick. Anything shorter was a TAP, and a tap drives the
  // meter with the value sampled AT THE PRESS — not at the release, which
  // would hand the player a number he never stopped the bar on. Returns true
  // when it resolved the kick, so updateKick can bail out of the frame.
  function kickRelease() {
    const k = G.kick;
    if (!k || k.cpu || k.stage >= 2) { if (k) { k.drag = null; k.pull = 0; k.press = null; } return false; }
    if (k.mode === "drag" && k.pull > 25) {
      k.power = clamp(k.pull / 1.7, 5, 100);
      k.acc = k.aimY || 0;
      k.stage = 2; k.drag = null; k.press = null;
      resolveKick();
      return true;
    }
    k.drag = null; k.pull = 0;
    // pulled back, then eased off short of the threshold — a regrip, and
    // crucially it no longer costs the player a burned power beat
    if (k.mode === "drag") { k.mode = null; return false; }
    if (k.press) { k.val = k.press.val; k.press = null; kickLocked(); }
    return false;
  }
  function launchKick(toX, toY, after, through) {
    const kk = (G.kick && G.kick.kickerEnt) || { x: xAtYd(G.losYd) - 140, y: MID };
    sfx.kick();
    const d = Math.abs(toX - kk.x);
    // The flight is CAPPED at the 1.7s this beat was designed for. Unclamped,
    // `0.8 + d/640` ran 3.2s+ on a full-field kickoff (~1560px of travel) —
    // nearly double the intent, and it was the longest beat in the game. A long
    // boot now simply looks FAST, which is what a booted kickoff should look
    // like, and flySkip() can cut it short after 0.35s either way.
    let arc = clamp(d * 0.45, 80, 300);
    if (through) {
      // A MADE kick has to be SEEN threading the window, and the capped arc
      // could not put it there: z = 10 + arc*k*(1-k) peaks at 85 while the
      // drawn crossbar sits 84px above the ball's y and the plane crossing
      // lands at k ≈ 0.78-0.87 — measured 25/35/45yd makes and PATs all
      // crossed at z 18-22, i.e. ~70px BELOW the bar, reading as a clank off
      // the base pad. Solve the same parabola for the height that matters:
      // z = 118 at the upright plane puts the ball ~27px above the bar,
      // squarely inside the lit window, agreeing with the MID±8 make the
      // resolution already ruled (LESSON #23: the fork stays snug — only the
      // presentation moves). Misses keep the old low arc; the 1000 cap keeps
      // a maximum-range make on screen (peak z ≈ 250 of 296 available).
      const planeK = clamp((xAtYd(108) - kk.x) / ((toX - kk.x) || 1), 0.1, 0.9);
      arc = Math.min(1000, 108 / (planeK * (1 - planeK)));
    }
    G.kickFly = { from: { x: kk.x, y: kk.y }, to: { x: toX, y: toY }, t: 0, T: clamp(0.8 + d / 640, 0.8, 1.7), arc, after, through: !!through };
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
      // Kick returns are removed — a kickoff always just spots the receiving
      // team (this branch is unreached now that startKickoff bypasses the KO
      // kick entirely, but stays return-free as a safety net).
      launchKick(xAtYd(Math.min(100, land)), directional, () => {
        banner("TOUCHBACK", "Return team starts at the 25", 1.35);
        G.deadT = 1.0;
        G.deadNext = () => finishKickTouchback(25);
        G.state = "dead";
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
      // Punt returns are removed: the ball is simply spotted where it is
      // downed (or a touchback to the 25), with no run-back. The kick itself —
      // the 4th-down decision and its field-position stakes — is kept.
      const spot = land >= 100 ? 25 : clamp(Math.round(100 - land), 1, 60);
      if (land < 100) sub = d + " yard punt — downed at the " + Math.round(100 - land);
      launchKick(xAtYd(Math.min(100, land)), targetY, () => {
        banner("PUNT", sub, 1.4);
        G.deadT = 1.1; G.deadNext = () => finishKickTouchback(spot); G.state = "dead";
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
    // A made kick used to TERMINATE 30px past the plane — the ball visibly
    // died ON the post structure instead of sailing through it (owner
    // play-test 2026-08-14: "you never see the ball go through"). The make/
    // miss ruling is untouched — this is only where the flight ends: a good
    // ball now sails 150px past the posts and exits the frame, the way a
    // real make clears the bar with room. launchKick pairs this with an arc
    // that actually crosses the plane inside the drawn window (see there).
    const toX = good ? postX + 150 : (short ? postX - rnd(60, 140) : postX + rnd(0, 30));
    const toY = good ? MID + rnd(-8, 8) : (short ? MID + rnd(-16, 16) : MID + (Math.random() < 0.5 ? -1 : 1) * rnd(44, 76));
    const drive0 = G.drive, losYd0 = G.losYd;
    launchKick(toX, clamp(toY, TOP + 12, BOT - 12), () => {
      if (k.kind === "XP") {
        if (good) { if (doink) sfx.doink(); G.score[drive0] += 1; banner(doink ? "DOINK!  EXTRA POINT GOOD" : "EXTRA POINT GOOD", doink ? "Off the upright and through!" : "", 1.4); }
        else banner("XP MISSED!", "The ptero shanks it!", 1.4);
        G.deadT = 1.3; G.deadNext = () => { changePossession(25); enterPlaycall(); };   // kickoff beat folded in
      } else if (good) {
        if (doink) sfx.doink(); G.score[drive0] += 3; sfx.td();
        // WHAT WAS BROKEN: three points landed with a flat 0.6 cheer no matter
        // who kicked it or what it meant — the crowd applauded the visitors'
        // go-ahead kick, and a walk-off game-winner got the same beat as a
        // meaningless second-quarter chip shot. fxConfetti/fxFlash had exactly
        // one call site each (inside touchdown), so a kick could never light
        // the place up.
        // TIERING, per the owner: routine make = toast (lens tick + cheer),
        // a Q4/OT go-ahead = mid card and the sparks. A make is still quieter
        // than a touchdown: no confetti, spike capped at 0.10 vs the TD's 0.14.
        const fgHome = drive0 === crowdSide();
        const fgWinner = (G.quarter >= 4 || G.ot) && (G.score[drive0] - G.score[other(drive0)]) > 0 &&
          (G.score[drive0] - G.score[other(drive0)]) <= 3;
        G.zoomPunch = Math.max(G.zoomPunch, fgWinner ? 0.11 : 0.06);
        if (fgHome) { crowdCheer(fgWinner ? 1.0 : 0.6); crowdSpike = Math.max(crowdSpike, fgWinner ? 0.10 : 0.05); }
        else crowdAww(fgWinner ? 1.1 : 0.5);
        if (fgWinner) {
          fxSparks(xAtYd(108), MID, 12);
          if (fgHome && G.stadium && G.stadium.time !== "day") fxFlash(10);
        }
        banner(doink ? "DOINK!  IT'S GOOD!" : "FIELD GOAL GOOD!", (doink ? "Off the upright — " : "") + fgDist + " yards by " + lastName(k.kicker.name), 1.8);
        G.deadT = 1.5; G.deadNext = () => { changePossession(25); enterPlaycall(); };   // kickoff beat folded in
      } else {
        banner("FIELD GOAL MISSED", short ? "...it dies at the doorstep!" : fgDist + " yard attempt sails wide", 1.8);
        // A MISS IS SPOTTED AT THE KICK, NOT AT THE LINE. This handed the defense
        // the ball at `100 - losYd0` — the line of scrimmage — so the shorter the
        // chip shot you missed, the deeper you pinned them: measured before,
        // los 97 -> their own 3, los 90 -> 10, los 85 -> 15. Every other
        // special-teams outcome in this file is floored or fixed (made FG/XP 25,
        // two-point 25, touchback 25, safety 30); the miss was the only one that
        // ran to the goal line, which inverts the fourth-down calculus — a bad
        // kick bought better field position than a punt.
        // The real rule, and Retro Bowl's: takeover at the SPOT OF THE KICK,
        // never closer to their own goal than the 20. The kick is taken 7 yards
        // behind the LOS — the same 7 already baked into `fgDist = 100 - losYd +
        // 17` (10 end zone + 7 holder) — so the spot is `losYd0 - 7` in our frame
        // and `100 - (losYd0 - 7)` in theirs. Measured after: los 97 -> 20
        // (floor), 90 -> 20 (floor), 85 -> 22, 80 -> 27, 60 -> 47, 45 -> 62.
        // Spotting is not an owner keeper, so it follows the source (LESSON #22);
        // the make/miss ruling, the goal fork and the meter are untouched.
        G.deadT = 1.8; G.deadNext = () => { changePossession(Math.max(20, 100 - (losYd0 - 7))); enterPlaycall(); };
      }
      G.state = "dead";
    }, good);   // a made kick lights the uprights as the ball crosses the plane
  }

  function finishKickTouchback(spot) {
    G.kick = null; G.kickFly = null; G.returnPlay = null;
    changePossession(spot == null ? 25 : spot);
    enterPlaycall();
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
        tkl: 0, sacks: 0, defInt: 0, ff: 0, fum: 0,
        // A sack is neither a carry nor a pass attempt, so it gets its own two
        // fields on the QB's line: `sacked` counts them, `sackYds` holds the
        // (negative) yardage. `sacks` above stays what it always was — the
        // DEFENDER's credit.
        sacked: 0, sackYds: 0,
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
  // ONE truth for how fast the tape plays back. gifStart's seek is derived
  // from it, so the two can never drift (they already had: see gifStart).
  const REPLAY_SPEED = 0.55;
  function startReplay(cont) {
    if (G.tape.length < 50) { cont(); return; }
    // last 2.1s of action only — the whole-play tape at 0.42x was a 7-13s tax
    G.replay = { frames: G.tape.slice(-126), i: 0, cont };
    G.state = "replay";
  }
  function updateReplay(dt) {
    const r2 = G.replay;
    r2.i += dt * 60 * REPLAY_SPEED; // slow motion, but not molasses
    if (r2.i >= r2.frames.length) endReplay();
  }
  // ------------------------------------------------ the coach's challenge
  function throwChallenge() {
    if (G.challengeUsed || !G.lastDead || G.state !== "dead") return;
    // a challenge requires a timeout to risk (matches the fail-banner copy)
    const side = G.humanB ? G.drive : "A";
    if (!G.timeouts || G.timeouts[side] <= 0) return;
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
        G.timeouts[side]--;   // a failed challenge really does cost it now
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
        // possession never actually flipped on the INT (changePossession was
        // deferred into the deadNext this challenge replaced) — restoring the
        // spot is ALL that's needed. The old drive-flip here handed the ball
        // to the defense on a WON challenge (state corruption).
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
  function gifEncode(frames, w, h, delayCs, pal) {
    const out = [];
    const STR = (t) => { for (let i = 0; i < t.length; i++) out.push(t.charCodeAt(i)); };
    STR("GIF89a");
    out.push(w & 255, w >> 8, h & 255, h >> 8, 0xF7, 0, 0);
    // WHAT WAS BROKEN: this wrote a FIXED 3-3-2 table — three bits of red,
    // three of green and TWO of blue, i.e. four blue levels for the entire
    // export. Dino Bowl's gold #ffd23f came out (255,218,0), so the amber went
    // flat yellow; turf greens collapsed toward olive; and every team blue
    // snapped to one of 0/85/170/255. The table is now the one gifBuildPalette
    // derived from the pixels the renderer actually drew (256 entries, 3 bytes
    // each). Callers always pass it; the 3-3-2 ramp survives only as a fallback
    // so a malformed call still produces a readable file instead of throwing.
    for (let i = 0; i < 256; i++) {
      if (pal && pal.length >= 768) out.push(pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]);
      else out.push(Math.round(((i >> 5) & 7) * 255 / 7), Math.round(((i >> 2) & 7) * 255 / 7), Math.round((i & 3) * 255 / 3));
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
  // THE GIF's SEEK, DERIVED. `frames.length - 150` was dead code: startReplay
  // slices the tape to at most 126 frames, so Math.max(0, 126 - 150) chose 0
  // every single time and the comment above it ("start on the final 2.5
  // seconds") described something that never ran. The real budget is a
  // function of the two rates that already exist — one grab every 3 rendered
  // frames, and REPLAY_SPEED tape-frames of travel per rendered frame — so
  // GIF_MAX_FRAMES grabs cover GIF_MAX_FRAMES * 3 * REPLAY_SPEED tape frames.
  // At today's numbers that is 198, comfortably more than the 126-frame
  // replay, so the export still starts at 0 and still contains the whole
  // finish; the difference is that it now starts there BECAUSE the budget
  // covers the window, and a longer replay window would seek correctly instead
  // of silently dropping its ending.
  const GIF_TAPE_SPAN = Math.floor(GIF_MAX_FRAMES * 3 * REPLAY_SPEED);
  // ---- adaptive local colour table (replaces the fixed 3-3-2 ramp)
  // The first grabbed frame is histogrammed into 32768 RGB555 buckets; the 256
  // heaviest buckets become the table, each entry the MEAN colour of its
  // bucket rather than the bucket corner. Every later pixel resolves through a
  // lazily filled 32K Int16Array, so the steady-state cost is one typed-array
  // read per pixel — measured 1.43ms/frame at 480x270 against the 1.30ms the
  // fixed table cost, i.e. the fidelity is free.
  function gifBuildPalette(d) {
    const cnt = new Uint32Array(32768), sr = new Uint32Array(32768), sg = new Uint32Array(32768), sb = new Uint32Array(32768);
    for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      cnt[k]++; sr[k] += d[i]; sg[k] += d[i + 1]; sb[k] += d[i + 2];
    }
    const used = [];
    for (let k = 0; k < 32768; k++) if (cnt[k]) used.push(k);
    used.sort((a, b) => cnt[b] - cnt[a]);
    const n = Math.max(1, Math.min(256, used.length));
    const pal = new Uint8Array(768);
    for (let i = 0; i < n && i < used.length; i++) {
      const k = used[i], c = cnt[k];
      pal[i * 3] = Math.round(sr[k] / c); pal[i * 3 + 1] = Math.round(sg[k] / c); pal[i * 3 + 2] = Math.round(sb[k] / c);
    }
    G.gifPalN = n;
    G.gifPal = pal;
    G.gifLut = new Int16Array(32768).fill(-1);
    for (let i = 0; i < n; i++) {
      G.gifLut[((pal[i * 3] >> 3) << 10) | ((pal[i * 3 + 1] >> 3) << 5) | (pal[i * 3 + 2] >> 3)] = i;
    }
  }
  // only ever runs for a bucket the table has not seen yet — at most 32768
  // times across a whole export, in practice a few hundred
  function gifNearest(r, g, b) {
    const pal = G.gifPal; let best = 0, bd = Infinity;
    for (let i = 0; i < G.gifPalN; i++) {
      const dr = r - pal[i * 3], dg = g - pal[i * 3 + 1], db = b - pal[i * 3 + 2];
      const d2 = dr * dr + dg * dg + db * db;
      if (d2 < bd) { bd = d2; best = i; if (d2 === 0) break; }
    }
    return best;
  }
  function gifGrabFrame() {
    if (!G.gifCv) { G.gifCv = document.createElement("canvas"); G.gifCv.width = GIF_W; G.gifCv.height = GIF_H; }
    const g2 = G.gifCv.getContext("2d");
    g2.imageSmoothingEnabled = false;
    g2.drawImage(cv, 0, 0, GIF_W, GIF_H);
    const d = g2.getImageData(0, 0, GIF_W, GIF_H).data;
    if (!G.gifPal || !G.gifLut) gifBuildPalette(d);
    const lut = G.gifLut, idx = new Uint8Array(GIF_W * GIF_H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
      let v = lut[k];
      if (v < 0) { v = gifNearest(d[i], d[i + 1], d[i + 2]); lut[k] = v; }
      idx[j] = v;
    }
    G.gifFrames.push(idx);
  }
  function gifStart() {
    if (!G.replay) return;
    G.gifFrames = []; G.gifRec = true; G.gifSkip = 0;
    // a new export derives a new table from its OWN footage (a night game and
    // a snow game do not share 256 colours)
    G.gifPal = null; G.gifLut = null;
    // Replays run in slow motion.  Starting on the final 2.5 seconds of the
    // live tape guarantees that the tackle/catch/turnover is actually inside
    // the finite, shareable GIF rather than spending its frame budget on a
    // routine route release.
    G.replay.i = Math.max(0, G.replay.frames.length - GIF_TAPE_SPAN);
    banner("🎥 RECORDING…", "capturing the finish in crisp pixel art", 1.2);
  }
  function gifFinish() {
    if (!G.gifRec || !G.gifFrames.length) { G.gifRec = false; return; }
    G.gifRec = false;
    // PAINT BEFORE YOU BLOCK. gifEncode is pure array maths over every frame
    // of the tape and it runs on the MAIN THREAD: measured at 254-314ms on
    // desktop V8 for 76 frames, and roughly a second on a mid-range phone.
    // That was survivable while the exporter could only be reached by spending
    // the once-per-game coach's challenge, because almost nobody reached it.
    // The SAVE HIGHLIGHT chip makes it a ONE-TAP action — and a one-tap action
    // that freezes with no feedback does not read as work, it reads as a hang.
    // So the notice goes up and a frame is allowed to LAND before the encode
    // starts.
    // setTimeout, deliberately, NOT requestAnimationFrame: the headless test
    // harness stubs rAF as a single stored callback, so registering one here
    // would overwrite the game loop's own callback and stop the harness dead.
    // ~48ms is three frames at 60fps — long enough to guarantee a paint, and
    // invisible next to the encode it is covering.
    const frames = G.gifFrames, pal = G.gifPal;
    G.gifFrames = [];
    G.gifPal = null; G.gifLut = null;   // 96KB of lookup, freed with the frames
    banner("SAVING HIGHLIGHT…", frames.length + " frames — one moment", 1.2);
    setTimeout(() => {
      try {
        const bytes = gifEncode(frames, GIF_W, GIF_H, 7, pal);
        const blob = new Blob([bytes], { type: "image/gif" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "dinobowl-replay.gif";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        banner("GIF SAVED!", "check your downloads — share the chaos", 1.6);
      } catch (err) { banner("GIF FAILED", String(err).slice(0, 40), 1.4); }
    }, 48);
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
    // Cadence fix (owner play-test): animT is advanced speed-proportionally at
    // the tick sites, so the index here is 1:1 — the old ×7 double-multiply
    // flipped 2 frames at ~49Hz, a strobe that read as vibration, not a gait.
    if (species === "quetz") {
      const groundCount = Math.min(2, count);
      if (soaring && spr.flight && spr.flight.n) {
        return { pack: spr.flight, fi: (animT * 8 | 0) % spr.flight.n };
      }
      if (soaring && count > groundCount) {
        return { pack: spr, fi: groundCount + ((animT * 8 | 0) % (count - groundCount)) };
      }
      return { pack: spr, fi: (animT | 0) % groundCount };
    }
    return { pack: spr, fi: (animT | 0) % count };
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
    // standing still: breathe and blink instead of jittering the walk legs.
    // Guarded on spr.idle so it activates only when the idle pack exists.
    if (!wingsOpen && spr.idle && spr.idle.n >= 3 &&
        Math.hypot(e.vx || 0, e.vy || 0) <= 10 && !e.soarT) {
      const t = e.animT || 0;
      const fi = (t % 4 > 3.85) ? 2 : ((t * 1.2 | 0) % 2);   // blink ~every 4s
      return { pack: spr.idle, fi, pose: state.pose, progress: state.progress, action: false };
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
    const list = depthOrder(REPLAY_ORDER, f.ents);
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
    // 2-player: a human R press fires the meter of the side he actually
    // controls — the old hard-coded "A" locked player 2 out of rampage
    const side = cpu === true ? "B" : cpu === "A" || cpu === "B" ? cpu : "A";
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
    if (apex.blockedBy) releaseBlock(apex);
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
    if (G.paused) { G.paused = false; return; }   // tap = resume
    const S = G.state;
    if (S === "title") { G.state = "menu"; G.menuIdx = 0; return; }
    if (S === "online_wait") { if (!G.online || G.online.phase !== "found") cancelMatch(); return; }
    if (S === "replay") { endReplay(); return; }   // tap anywhere skips the replay
    if (S === "kickfly") { flySkip(); return; }    // tap anywhere lands the kick
    if (S === "halftime") {
      // corner chip skips; anywhere else acts (kick lock / dash jump)
      if (mouse.x > W - 130 && mouse.y < 46) { endHalftime(); return; }
      halftimePress();
      return;
    }
    if (S === "menu" || S === "allmodes") { menuTapAt(mouse.x, mouse.y); return; }
    if (S === "qbs") { G.state = "menu"; return; }
    if (S === "settings") { settingsClick(); return; }
    if (S === "dead") { // timeout chip first; any other tap advances the beat
      // the hotspot only exists when the chip is actually DRAWN — an
      // invisible 210px tap-eater near the scoreboard broke "any tap
      // advances" after clock-stopping whistles
      if (stopChipVisible() && mouse.x >= 10 && mouse.x <= 206 && mouse.y >= 40 && mouse.y <= 76) {
        useTimeout(G.humanB ? G.drive : "A"); return;
      }
      // ...and the SAVE HIGHLIGHT chip, under exactly the same rule: the
      // hotspot exists only while the chip is actually drawn.
      if (highlightBeat()) {
        const hr = highlightChipRect();
        if (mouse.x >= hr.x && mouse.x <= hr.x + hr.w && mouse.y >= hr.y && mouse.y <= hr.y + hr.h) { saveHighlight(); return; }
      }
      deadSkip();
      return;
    }
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
      // CHANGE PLAY chip (top-right): cycle the callsheet at the line
      if (!G.patMode && mouse.x > W - 200 && mouse.y > 40 && mouse.y < 86 &&
        (offenseIsUser() || defenseHumanSteers())) { audible(1); return; }
      const wx = mouse.x + G.camX, wy = mouse.y;
      // pressing YOUR QB is the Retro Bowl one-motion snap: the same hold
      // pulls straight back into the throw. This check runs BEFORE the
      // nearest-player pick — the QB and RB stack 17px apart, and when the
      // press landed nearer the RB it silently switched control to the RB
      // and handed the QB to the CPU (the real "can't throw" bug,
      // owner play-test 2026-08-07).
      const qbP = offenseIsUser() && G.players.find((p) => p.team === "off" && p.role === "QB");
      if (qbP && Math.hypot(qbP.x - wx, qbP.y - wy) < 26) {
        snap();
        G.slingAnchor = { x: mouse.x, y: mouse.y }; G.aim = null;
        return;
      }
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
          (pick.routeEligible || pick.role === "RB")) setControlled(pick);
        return;                       // a tap on a non-QB doesn't snap
      }
      // field taps are SIDE-AWARE: on offense, tap = snap (and the hold
      // carries into the throw — one motion). On defense, the CPU offense
      // never snaps for you, so a missed 26px defender pick must NOT start
      // the play — it selects the nearest defender instead (owner-adjacent
      // fix: misclicks were snapping the CPU's play).
      if (offenseIsUser()) {
        snap();
        G.slingAnchor = { x: mouse.x, y: mouse.y }; G.aim = null;
      } else if (defenseHumanSteers()) {
        const near = G.players.filter((e2) => e2.team === "def")
          .sort((a, b) => Math.hypot(a.x - wx, a.y - wy) - Math.hypot(b.x - wx, b.y - wy))[0];
        if (near) { setControlled(near); G.selCard = { e: near, t: 1.4 }; }
      }
      return;
    }
    if (S === "kick" && !G.kick.cpu) { kickPress(); return; }
    if (S === "over") {   // tap = continue (box score first if it's open)
      if (G.showBox) { G.showBox = false; return; }
      onKey("enter"); return;
    }
    if (["career_create", "career_quiz", "career_draft"].includes(S)) { careerClick(S); return; }
    if (S === "live") {
      // the timed catch/defend jump works with the MOUSE too — the player
      // who threw with the mouse shouldn't need the keyboard at the game's
      // most timing-critical beat (the touch UI already had a JUMP button)
      if (G.ball.mode === "air" && !G.ball.away && G.controlled &&
        (G.controlled.routeEligible || G.controlled.team === "def")) {
        timedJump(G.controlled); return;
      }
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
    spawnPart("snowball", from.x, from.y - 10, 8,
      (to.x - from.x) / T, (to.y - from.y) / T, 90 + d * 0.12,
      T, 200);
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
      // a soft snow *pff*, never the full tackle thud — ambient crowd
      // snowballs must not sound like hits all game long
      noiseBurst({ from: 900, to: 300, dur: 0.07, vol: 0.03, q: 0.7 });
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
    // the kick has its own release rule (tap vs pull) and it must run even for a
    // press/release that lands inside a single frame, which updateKick's
    // mouse.down polling can never see
    if (G.state === "kick") { G.slingAnchor = null; kickRelease(); return; }
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
    // Owner feel note (2026-08-07): 150px-to-max "immediately cocked it back"
    // — no touch on short throws. Full range now needs a committed ~275px
    // pull, and the response is power-curved so the first half of the pull
    // covers the short/intermediate game with fine placement control.
    const k = Math.pow(Math.min(1, (pull - 14) / 260), 1.35);
    G.slingPull = k;                               // pull depth also shapes the arc
    const len = 46 + k * (mr - 46);
    const p = { x: qb.x + (dx / pull) * len, y: clamp(qb.y + (dy / pull) * len, TOP + 6, BOT - 6) };
    p.x = clamp(p.x, xAtYd(-8), xAtYd(108));
    return p;
  }

  function onKey(k) {
    if (k === "m") { muted = !muted; return; }
    if (k === "h") { G.help = !G.help; return; }
    // PAUSE — a 12-minute game you can't pause or quit isn't a product.
    // ESC toggles; Q from the pause card abandons to the menu (season saves).
    if (G.paused) {
      if (k === "escape") { G.paused = false; return; }
      if (k === "q") {
        G.paused = false;
        if (G.szn) saveSeason();
        stopMusic();
        G.state = "menu"; G.menuIdx = 0;
      }
      return;
    }
    if (k === "escape" && !G.practice &&
      ["live", "presnap", "playcall", "defcall", "dead", "kick", "kickfly", "ptchoice"].includes(G.state)) {
      G.paused = true; return;
    }
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
    if (k === "d" && G.state === "title") { G.diff = (G.diff + 1) % DIFFS.length; saveRecord(); return; }
    if (k === "b" && !["title", "select", "live"].includes(G.state)) { G.showBox = !G.showBox; return; }
    if (k === "c" && G.state === "dead" && !G.challengeUsed) { throwChallenge(); return; }
    // G on a scoring/turnover dead beat = watch it back AND save the GIF. It
    // is guarded by highlightBeat() rather than by state alone so that a G
    // press on an ordinary whistle still falls through to the normal handling.
    if (k === "g" && G.state === "dead" && highlightBeat()) { saveHighlight(); return; }
    // space/enter during a dead beat advances it (challenge/timeout keys above)
    if (G.state === "dead" && (k === " " || k === "enter")) { deadSkip(); return; }
    if (G.state === "kickfly" && (k === " " || k === "enter")) { flySkip(); return; }
    const S = G.state;
    if (S === "online_wait") { if (k === "escape") cancelMatch(); return; }
    if (S === "title" && (k === "enter" || k === " ")) { G.state = "menu"; G.menuIdx = 0; return; }
    if (S === "menu" || S === "allmodes") { menuKey(k); return; }
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
    if (S === "settings") { settingsKey(k); return; }
    if (S === "dead" && k === "t") { useTimeout(G.humanB ? G.drive : "A"); return; }
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
          const c2 = G.controlled, bl = c2.blockedBy;
          c2.spinCd = 1.3; c2.spinT = 0.3; sfx.juke();
          // A SPIN ALWAYS MAKES PROGRESS. This was
          //   Math.random() < 0.4 + (str - blockerStr) / 110
          // so in an even matchup THREE SPINS IN FIVE did nothing whatsoever:
          // the cel played, the 1.3s cooldown burned, the block held, and the
          // player had no way to tell a failed spin from a mistimed one. That
          // is precisely the dice-at-a-moment-of-truth LESSON #19 bans, and it
          // is why a spin "does not seem to get you out of the block".
          // It now POURS into the same grind ledger blockShedCheck already
          // reads, so every spin is visible progress: a decisive strength
          // advantage frees him outright, an even rep takes two, and a spin
          // specialist (rushTech) gets more out of each one. Deterministic,
          // stat-driven, and the player can always see it working.
          const gap = (c2.str || 80) - (bl.str || 75);
          const frac = SPIN_CHUNK_BASE + clamp(gap * SPIN_CHUNK_PER_STR, -0.18, 0.34);
          const chunk = Math.max(1, (c2.blockShedAt || 0) * frac *
            (c2.rushTech === "spin" ? SPIN_TECH_BONUS : 1));
          c2.blockAcc = (c2.blockAcc || 0) + chunk;
          const shed = blockShedCheck(c2);
          if (shed) {
            if (G.qaTele) G.qaTele.push({ tag: shed, drive: G.drive });
            releaseBlock(c2, { spin: true, freeT: 2.5 });
          }
        }
      }
      // owner control model: forward-input on an offensive carrier IS the
      // dive — auto-run owns forward motion, so D/→ becomes the lunge
      if ((k === "e" || k === "control" || ((k === "d" || k === "arrowright") && offenseIsUser())) &&
        G.carrier && G.controlled === G.carrier) doDive(G.carrier);
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
      if (k === "r") tryRampage(G.humanB ? G.drive : "A");
      if (k === "v") throwSnowball();
      if (k === "tab" && !offenseIsUser()) switchDefender();
    }
    if (S === "ptchoice") {
      if (k === "1") ptChoose(false);
      if (k === "2") ptChoose(true);
      // R = the opt-in look at the touchdown you just scored, and the only
      // door to the GIF exporter that is not the once-per-game challenge flag.
      // See ptClick for the full WHAT WAS BROKEN; the tap target is the chip
      // drawn on the same card, and both routes share startReplay's contract:
      // the replay returns to THIS card, so nothing about the conversion
      // decision or the dead-beat pacing changes.
      if (k === "r" && !G.replay && G.tape.length >= 50) startReplay(() => { G.state = "ptchoice"; });
    }
  }

  function doJuke(e) {
    if (e.jukeCd > 0 || e.proneT > 0) return;
    e.jukeT = 0.32; e.jukeCd = 2.1; e.spinT = 0.32; sfx.juke();
    // THE PLANT — the trade. Shared by the player-input juke and the CPU one,
    // so both pay it. See JUKE_PLANT_T.
    e.jukePlantT = JUKE_PLANT_T;
    // the cut: snap velocity to the opposite lateral side (a real cutback)
    const cutY = e.vy >= 0 ? -1 : 1;
    e.vy = cutY * Math.max(60, Math.abs(e.vy) + 40);
    // THE PLANT FOOT. Dust fires from where he actually pushed off — the side
    // he is cutting AWAY from — instead of from under his centre, so the cut
    // reads as a direction and not as a puff. A second, smaller burst trails a
    // few pixels behind along the new line.
    fxDust(e.x - e.dir * 3, e.y + 4 - cutY * 3, 4);
    fxDust(e.x - e.dir * 7, e.y + 5, 3);
    // a cut this hard shifts the camera a touch — the same language the other
    // contact beats use, at the smallest size in the file so it never competes
    // with a takedown.
    G.shake = Math.max(G.shake || 0, 0.07);
    // a juke has to be TIMED: it only shakes defenders who are right on top
    // of you and closing hard — soaring tacklers can't be juked at all
    fxDust(e.x, e.y + 4, 5);   // cleats bite the turf on the cut
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
    // the paw costs less ground than a cut — you are extending an arm, not
    // changing direction — but it is not free either.
    e.stiffPlantT = STIFF_PLANT_T;
    playPose(e, "stiff", 0.52);
    sfx.juke();
    // The strike reads on the DEFENDER too, not just on the carrier: the arm
    // goes out toward the man being warded off, so the dust and the small beat
    // land between them rather than under the carrier.
    let near = null, nd = 1e9;
    for (const d of G.players) {
      if (d.team === e.team || d.proneT > 0) continue;
      const dd = dist(d, e);
      if (dd < nd) { nd = dd; near = d; }
    }
    if (near && nd < 34) {
      fxDust((e.x + near.x) / 2, (e.y + near.y) / 2 + 3, 3);
      if (Math.abs(near.x - e.x) > 2) e.dir = near.x >= e.x ? 1 : -1;
    }
  }
  // A broken tackle: the carrier `c` shrugs off tackler `e`. The tackler is
  // driven back off-balance along the line of contact and left staggering,
  // while the carrier plays the stiff-arm cel and keeps his feet.  Shared by
  // the timed player stiff-arm and the rare automatic shrug-off so both read
  // identically. `power` (0..1) sizes the shove.
  function shrugOffTackle(c, e, power) {
    const pw = clamp(power == null ? 0.6 : power, 0.2, 1);
    const dx = e.x - c.x, dy = e.y - c.y, m = Math.hypot(dx, dy) || 1;
    const nx = dx / m, ny = dy / m;
    e.x += nx * (10 + 12 * pw); e.y += ny * (10 + 12 * pw);
    c.tackleAcc = 0; c.grappledT = 0; c.grappleRolled = false;   // fight reset
    e.grapT = 0; e.grappling = null;                             // wrap broken
    e.staggerT = Math.max(e.staggerT || 0, 0.7 + 0.4 * pw);
    e.proneT = Math.max(e.proneT || 0, pw > 0.7 ? 0.3 : 0);
    e.tackleCd = 0.5;
    // A quick head snap, not a lingering drive: the strike is immediate and the
    // pose recoils fast so the carrier is back to running by the next beat.
    playPose(c, "stiff", 0.34); playPose(e, "shoved", 0.5 + 0.2 * pw);
    if (Math.abs(nx) > 0.2) { c.dir = nx >= 0 ? 1 : -1; e.dir = c.dir; }
    c.impactT = 0.4; c.impactLead = true; e.impactT = 0.4;
    G.shake = Math.max(G.shake, 0.12 + 0.12 * pw); sfx.tackle();
    impactMoment(0.04, 0.26, 0.5);   // the shrug-off is a highlight beat
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
  // TWO LAYERS. "menu" is the front door: four big cards, the things almost
  // everybody wants. "allmodes" is the full grid that used to BE the front
  // door — versus, online, career, practice, the lab — reached from MORE
  // MODES. Thirteen cards is a directory, not a welcome.
  //
  // The labels here deliberately map onto the SAME action branches the grid
  // uses (see menuKey): PLAY GAME resolves to EXHIBITION, and PLAY SEASON
  // resolves to whichever of CONTINUE CAREER / CONTINUE SEASON / NEW SEASON
  // your saves call for. So there is exactly one implementation of every
  // mode, and the front door is a routing layer over it.
  function homeOptions() {
    const sz = loadSeason(), cr = loadCareer();
    const opts = [["PLAY GAME", "one game, any two teams"]];
    if (sz && cr) opts.push(["PLAY SEASON", cr.name + " · " + TEAMS[cr.team][0]]);
    else if (sz) opts.push(["PLAY SEASON", "pick up where you left off"]);
    else opts.push(["PLAY SEASON", "17 games + the DINO BOWL"]);
    opts.push(["MORE MODES", "versus · online · career · lab"]);
    opts.push(["SETTINGS", "difficulty · flow · halftime"]);
    return opts;
  }
  const menuIsGrid = () => G.state === "allmodes";
  const activeMenuOptions = () => (menuIsGrid() ? menuOptions() : homeOptions());
  // the front door gets fewer, bigger cards; the grid keeps its three columns
  const menuGrid = () => (menuIsGrid()
    ? { cols: 3, cw: 284, chh: 88, gapx: 18, gapy: 14 }
    : { cols: 2, cw: 372, chh: 118, gapx: 22, gapy: 18 });
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
    opts.push(["SETTINGS", "defense snaps · halftime shows · quarter length · flow"]);
    return opts;
  }
  function menuKey(k) {
    const opts = activeMenuOptions();
    const cols = menuGrid().cols;   // was hard-coded 3, which stranded the cursor
    if (k === "arrowright" || k === "d") G.menuIdx = (G.menuIdx + 1) % opts.length;
    if (k === "arrowleft" || k === "a") G.menuIdx = (G.menuIdx + opts.length - 1) % opts.length;
    if (k === "arrowdown" || k === "s") G.menuIdx = (G.menuIdx + cols) % opts.length;
    if (k === "arrowup" || k === "w") G.menuIdx = (G.menuIdx + opts.length - cols) % opts.length;
    // ESC walks back out one layer at a time rather than all the way home
    if (k === "escape") { G.state = menuIsGrid() ? "menu" : "title"; G.menuIdx = 0; return; }
    if (k !== "enter" && k !== " ") return;
    G.humanB = false; G.practice = false;   // reset; versus/practice re-enable below
    let pick = opts[G.menuIdx][0];
    // the front door routes; it does not reimplement
    if (pick === "MORE MODES") { G.state = "allmodes"; G.menuIdx = 0; return; }
    if (pick === "PLAY GAME") pick = "EXHIBITION";
    if (pick === "PLAY SEASON") {
      const sz2 = loadSeason(), cr2 = loadCareer();
      pick = (sz2 && cr2) ? "CONTINUE CAREER" : sz2 ? "CONTINUE SEASON" : "NEW SEASON";
    }
    if (pick === "EXHIBITION") {
      G.mode = "exhibition"; G.selectFor = "exh"; G.career = null; G.szn = null; G.humanB = false;
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
    } else if (pick === "2-PLAYER VERSUS") {
      G.mode = "versus"; G.selectFor = "exh"; G.career = null; G.szn = null; G.humanB = true;
      G.state = "select"; G.selStep = 0; G.selA = (Math.random() * 32) | 0; G.selB = (Math.random() * 32) | 0;
    } else if (pick === "QUICK MATCH") {
      G.mode = "online"; G.selectFor = "exh"; G.career = null; G.szn = null; G.humanB = true;
      startQuickMatch();     // sets G.state = "online_wait" and queues us
    } else if (pick === "ONLINE (LINK)") {
      G.mode = "online"; G.selectFor = "exh"; G.career = null; G.szn = null; G.humanB = true;
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
    } else if (pick === "SETTINGS") {
      G.state = "settings";
    }
  }
  const SETTINGS_ROWS = () => [
    ["PLAY DEFENSE", G.playDefense ? "ON — you play your defensive snaps" : "OFF — CPU drives resolve instantly (Retro Bowl style)",
      () => { G.playDefense = !G.playDefense; settingSet("dinobowl_playdef", G.playDefense); }],
    ["HALFTIME SHOWS", G.halftimeShow ? "ON — mascot minigames at the break" : "OFF — straight to the 3rd quarter",
      () => { G.halftimeShow = !G.halftimeShow; settingSet("dinobowl_halfshow", G.halftimeShow); }],
    ["PLAY-CALL SCREENS", G.coachMode ? "ON — pick from 4 cards every down (Dino Bowl style)" : "OFF — instant lineup, CHANGE PLAY chip only",
      () => { G.coachMode = !G.coachMode; settingSet("dinobowl_coach", G.coachMode); }],
    ["QUARTER LENGTH", Math.round((G.qlen || 120) / 60) + ":00",
      () => { G.qlen = G.qlen >= 180 ? 60 : (G.qlen || 120) + 60; try { localStorage.setItem("dinobowl_qlen", String(G.qlen)); } catch (_) { } }],
    ["DIFFICULTY", diff().name + (G.diff === DIFF_DYNAMIC
      ? " — the ladder follows your season results (" + (G.dyn.champ ? "D1-D16" : "D1-D12") + ")"
      : " — fixed"),
      () => { G.diff = (G.diff + 1) % DIFFS.length; saveRecord(); }],
    ["MUSIC VOLUME", volMusic <= 0 ? "OFF" : Math.round(volMusic * 100) + "%",
      () => setVol("music", volMusic >= 0.99 ? 0 : volMusic + 0.25)],
    ["SFX VOLUME", volSfx <= 0 ? "OFF" : Math.round(volSfx * 100) + "%",
      () => setVol("sfx", volSfx >= 0.99 ? 0 : volSfx + 0.25)],
    ["CRT SCANLINES", G.crt ? "ON — phosphor and vignette over the field" : "OFF — clean pixels",
      () => { G.crt = !G.crt; settingSet("dinobowl_crt", G.crt); applyCrt(); }],
  ];
  function applyCrt() {
    try {
      const el = document.getElementById("crt");
      if (el && el.style) el.style.display = G.crt ? "block" : "none";
    } catch (_) { }
  }
  function settingsKey(k) {
    const rows = SETTINGS_ROWS();
    const n = parseInt(k, 10);
    if (n >= 1 && n <= rows.length) { rows[n - 1][2](); sfx.juke(); return; }
    if (k === "escape" || k === "enter") { G.state = "menu"; }
  }
  const SET_Y0 = 118, SET_DY = 48;   // 8 rows must fit the 540px screen
  function settingsClick() {
    const rows = SETTINGS_ROWS();
    for (let i = 0; i < rows.length; i++) {
      if (Math.abs(mouse.y - (SET_Y0 + i * SET_DY)) < 22) { rows[i][2](); sfx.juke(); return; }
    }
    if (mouse.y > H - 56) G.state = "menu";
  }
  function drawSettings() {
    cx.fillStyle = "#0a1f14"; cx.fillRect(0, 0, W, H);
    cx.textAlign = "center"; cx.font = PF(16); cx.fillStyle = "#ffd23f";
    cx.fillText("⚙ SETTINGS", W / 2, 64);
    const rows = SETTINGS_ROWS();
    rows.forEach(([name, val], i) => {
      const y = SET_Y0 + i * SET_DY;
      cx.fillStyle = "rgba(13,37,25,.9)"; cx.fillRect(W / 2 - 330, y - 20, 660, 42);
      cx.strokeStyle = "#1d4030"; cx.strokeRect(W / 2 - 330, y - 20, 660, 42);
      cx.textAlign = "left"; cx.font = PF(10); cx.fillStyle = "#f4f6f1";
      cx.fillText((i + 1) + ". " + name, W / 2 - 310, y - 2);
      cx.font = PF(8); cx.fillStyle = "#69be28";
      cx.fillText(val, W / 2 - 310, y + 14);
    });
    cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#9db0a4";
    cx.fillText("PRESS 1-" + rows.length + " / TAP A ROW TO CHANGE  ·  ESC = BACK", W / 2, H - 32);
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
      // P0 SAVE LOSS: only `season` reached startOffseason; the very next line
      // then caught enter/space for EVERY other mode and ran
      // `clearSeason(); clearCareer();` — so finishing your first career season
      // and pressing the key the hub tells you to press DELETED the career.
      // ENTER now always CONTINUES. Wiping is only ever an explicit ESC.
      if (k === "enter" || k === " ") { startOffseason(); return; }
      if (k === "escape") {
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
  // Live "juice" timing: a big football moment earns a couple of frozen frames
  // (hit-stop) and then a short slow-motion beat before easing back to speed.
  // The freeze/slow clocks always tick on REAL time, so a moment can never
  // stall the game; outside live play and its dead-ball aftermath the scaling
  // is inert.
  function impactMoment(freeze, slow, scale) {
    if (G.state !== "live" && G.state !== "dead") return;
    G.freezeT = Math.max(G.freezeT || 0, freeze || 0);
    G.slowT = Math.max(G.slowT || 0, slow || 0);
    G.slowScale = scale || 0.45;
  }
  function loop(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;
    G.rdt = dt;   // unscaled frame time — the dead-ball countdown ticks on this
    let sdt = dt;
    // WHAT WAS BROKEN: impactMoment deliberately accepts "dead" as well as
    // "live", but this block only scaled while the state was "live" and it
    // ZEROED both clocks otherwise. Every terminal moment asks for its beat on
    // the exact frame playDead/touchdown flips the state to "dead", so the
    // request was cancelled one frame after it was made. Measured with a
    // per-frame (state, dt, sdt) log on a real harness game: tackle 0, sack 0,
    // INT 0, TD 0 scaled frames after the whistle, freezeT/slowT already 0 on
    // the whistle frame itself. The hit-stop system was fully wired and then
    // switched off exactly where it was supposed to land.
    // WHY IT WAS WRITTEN THAT WAY, AND WHAT STILL HOLDS: scaling a dead beat
    // also scales G.deadT, which stretches the whistle-to-snap wait — that is
    // the "steals the player's time" the old comment was protecting. The
    // protection is kept, twice over, instead of by banning the beat:
    //  (1) the S === "dead" branch of update() counts deadT/deadRecT/deadElapsed
    //      down on G.rdt (real time), so the wait does not grow at all —
    //      measured whistle-to-cards median 601ms before AND after; and
    //  (2) a post-whistle request is still ceilinged, so a stray or runaway
    //      ask cannot sit on the game — but the ceiling is the largest
    //      LEGITIMATE ask (0.4s, the touchdown's), not the takedown's.
    //      CORRECTION: F1 originally clamped this to 0.2s "per LESSON #23".
    //      That was wrong. #23's 0.2s slow-mo figure is a TACKLE budget — it
    //      is owner-tuned alongside the tackled cel and proneT, all takedown
    //      numbers. Applied blanket to every dead-ball beat it hit exactly
    //      two call sites, the touchdown (0.4) and the interception (0.34),
    //      which are the two payoff beats batch F existed to make reachable.
    //      Every other request is already <= 0.2 and is untouched either way,
    //      so the clamp did nothing except undo the feature. The whistle-to-
    //      snap wait is protected by (1) alone, which is real-time and
    //      independent: measured whistle-to-cards median 601ms regardless.
    // Both clocks still burn REAL dt, so a beat can never stall the game
    // (LESSON #9), and any state that is neither live nor dead still throws a
    // stale request away outright.
    const scalable = G.state === "live" || G.state === "dead";
    if (G.state === "dead") {
      if (G.freezeT > 0.08) G.freezeT = 0.08;   // a FREEZE stops the game; hard cap
      if (G.slowT > 0.4) G.slowT = 0.4;         // the largest legitimate ask (touchdown)
    }
    if (scalable && G.freezeT > 0) { G.freezeT = Math.max(0, G.freezeT - dt); sdt = 0; }
    else if (scalable && G.slowT > 0) { G.slowT = Math.max(0, G.slowT - dt); sdt = dt * (G.slowScale || 0.45); }
    else if (!scalable) { G.freezeT = 0; G.slowT = 0; }
    try {
      if (!G.qaStill) update(sdt);
      // 12 fps state replication is smooth for this pixel-art game while
      // leaving enough database headroom for player input.
      if (Net.role === "host" && Net.db && Net.room && G.state !== "online_wait" && t - Net.lastFrame > 83) {
        Net.lastFrame = t;
        Net.db.ref("dinobowl/rooms/" + Net.room + "/frame").set(netFrame());
      }
      render();
    }
    catch (err) { G.lastErr = String(err); notify(G.lastErr); }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    updateMusic();   // purely local — even online guests get the soundtrack
    // The notice one-liner ages out on REAL time and does so before the pause
    // return, so a message raised while the pause card is up still expires.
    if (G.note) { G.note.t -= (G.rdt || dt); if (G.note.t <= 0) G.note = null; }
    if (G.paused) return;   // ESC pause: nothing ticks, nothing burns
    // scorebug punch: when points land, the score flashes gold and a +N tag
    // floats off the bug — the scoreboard itself celebrates
    if (G._hudA == null) { G._hudA = G.score.A; G._hudB = G.score.B; }
    if (G.score.A !== G._hudA) { G._popA = { amt: G.score.A - G._hudA, t: 1.2 }; G._hudA = G.score.A; }
    if (G.score.B !== G._hudB) { G._popB = { amt: G.score.B - G._hudB, t: 1.2 }; G._hudB = G.score.B; }
    if (G._popA) { G._popA.t -= dt; if (G._popA.t <= 0) G._popA = null; }
    if (G._popB) { G._popB.t -= dt; if (G._popB.t <= 0) G._popB = null; }
    if (G.transT > 0) G.transT = Math.max(0, G.transT - dt);
    // Guests only draw the host's authoritative snapshots.
    // ...but the WEATHER is local on both sides now (netFrame no longer ships
    // `parts`), and this tick has to happen BEFORE the bail: updateParticles
    // lives ~2900 lines further down, past the return, so a guest that fell
    // through here would render an empty sky forever.
    if (Net.remoteView) {
      if (!Array.isArray(G.parts)) G.parts = [];
      updateParticles(dt);
      return;
    }
    if (G.fgFlashT > 0) G.fgFlashT = Math.max(0, G.fgFlashT - dt);
    if (G.gainTag) { G.gainTag.t -= dt; if (G.gainTag.t <= 0) G.gainTag = null; }
    // P0-21: the celebration latch gets an UNCONDITIONAL lifetime. It used to
    // be decremented only inside updateCelebration(), which just four states
    // call — so a flag that leaked anywhere else (enterKick, kickfly, or a
    // residual carried into a brand new game) never expired, and the
    // "!G.celebrate" term in the quarter-clock gate immediately below froze
    // the clock outright. LESSON #20: the latch now dies on real time wherever
    // it lives, and snap()/startGame clear it where the play and the game reset.
    if (G.celebrate) { G.celebrate.t -= dt; if (G.celebrate.t <= 0) clearCelebration(); }
    // RUNNING clock — Retro Bowl pacing: burns ~2.2x during the live snap and
    // ~2.5x through the dead-ball reset (a play "costs" 10-20 game-seconds),
    // but only 1:1 while you read the defense at presnap. Stoppages
    // (incompletion / OOB / turnover) freeze it until the snap.
    if (["live", "presnap", "dead"].includes(G.state) && !G.practice && !G.patMode &&
      !G.clockStopped && !G.half && !G.celebrate && !G.replay && G.clock > 0) {
      // DECOMPILED RB VALUES: 1 game second per 700ms while the ball is
      // live; the dead-ball chunk is applied at the whistle (below), so the
      // reset itself only drifts; presnap reads run slow. Plus the source's
      // hidden rubber-band: +50% runoff while the human leads by more than 7.
      // presnap no longer bleeds clock: the decompiled source only ticks
      // during LIVE play + the whistle chunk, and the owner play-test found
      // quarters dying while reading the defense ("time runs out mid
      // play-call — it should be stopped there"). Once you reach the line,
      // the snap is yours. Dead-beat drift is nudged up to keep game length.
      let rate = G.state === "live" ? (1 / 0.7) : G.state === "dead" ? 0.55 : 0;
      if (!G.humanB && (G.score.A - G.score.B) > 7) rate *= 1.5;
      const cb = G.clock;
      G.clock = Math.max(0, G.clock - dt * rate);
      // LESSON #4 — a correct rule that is invisible reads as a bug. The old
      // guard was "!G.banner", so the single frame on which the clock crosses
      // zero was silently thrown away whenever ANY other banner happened to be
      // up (BROKEN TACKLE is the common one), and nothing ever retried. Latch
      // the EVENT instead: once per play, regardless of the slot. The banner is
      // already sticky, so it correctly outranks the toast it displaces.
      if (cb > 0 && G.clock <= 0 && G.state === "live" && G.zeroBannerPlay !== G.playNo) {
        G.zeroBannerPlay = G.playNo;
        banner("0:00", "The play runs to the whistle!", 0.9, { sticky: true });
      }
    }
    // 0:00 before the snap = the quarter is over (you don't get the play)
    if (G.state === "presnap" && G.clock <= 0 && !G.practice && !G.patMode) { endQuarter(); return; }
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
      // "kickfly" was missing from this list, so the stadium fell SILENT for the
      // entire 1.7s flight of every field goal, extra point, punt and kickoff --
      // the crowd cut to zero exactly while the ball was in the air and everyone
      // was watching it. It is the one moment in a kick that wants a crowd.
      // (Batch C was credited with this fix and did not actually deliver it; the
      // gate is a single list and it still omitted the state.) The mix law from
      // the 08-06 play-test is unchanged -- crowd stays UNDER the action at the
      // non-live 0.012 level, it simply is not muted.
      const inGame = ["live", "presnap", "dead", "kick", "kickfly", "playcall", "defcall", "ptchoice"].includes(G.state);
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
    // PG responsiveness model: track how long this dead beat has been on
    // screen so any input can advance it past a short read-lockout
    if (S === "dead") {
      if (!G.deadElapsed) G.deadT0 = G.deadT;   // remember the beat's full size
      // real time, not scaled time (F1): this drives the input read-lockout in
      // deadSkip(), and a post-whistle slow-mo beat must not make the player
      // wait longer than usual before a tap can advance the beat.
      G.deadElapsed = (G.deadElapsed || 0) + (G.rdt || dt);
    } else G.deadElapsed = 0;
    // pose chains, piles, and celebrations keep animating BEHIND the card
    // screens and the PAT choice — decision time overlaps animation time
    if (S === "playcall" || S === "defcall" || S === "ptchoice") {
      tickDeadEntities(dt);
      if (G.celebrate) updateCelebration(dt);
    }
    if (S === "dead") {
      // The dead beat's own COUNTDOWN runs on real time even while a
      // post-whistle hit-stop is scaling the action (F1). That is what keeps
      // the beat from stealing the player's time: the tackle/pick/TD gets its
      // frozen and slowed frames, and the whistle-to-snap wait does not grow by
      // a millisecond — measured median 601ms both before and after. G.rdt is
      // the loop's unscaled frame time and equals dt whenever nothing is
      // scaling, so this is a no-op on every ordinary frame.
      const rdt = G.rdt || dt;
      G.deadT -= rdt;
      if (G.deadRecT > 0) { G.deadRecT -= rdt; snapshotFrame(); }   // film the aftermath
      // the cosmetic kickoff flight: boot arc sailing into the end zone
      if (G.koFly && G.ball && G.ball.mode === "koflight") {
        const k = G.koFly;
        k.t = Math.min(k.T, k.t + dt);
        const p = k.t / k.T;
        G.ball.x = k.fx + (k.tx - k.fx) * p;
        G.ball.y = k.fy + (k.ty - k.fy) * p;
        // ...and it LANDS. The old profile returned to z 12 at p = 1, so the
        // ball finished the arc still floating a ball's height above the turf.
        // Bleeding the launch height out over the flight puts it on the deck.
        G.ball.z = (1 - p) * 12 + 300 * p * (1 - p);
      }
      tickDeadEntities(dt);
      if (G.celebrate) updateCelebration(dt);
      if (G.deadT <= 0 && G.deadNext) {
        // S3. A continuation that THREW used to leave "dead" with no way out
        // at all: deadNext had already been nulled, deadT counted down
        // forever, and space/enter/escape were every one of them no-ops.
        //
        // The continuation is still consumed BEFORE the call, exactly as it
        // always was, and that ordering is load-bearing: continuations
        // routinely schedule the next beat themselves, and several of them
        // re-arm the very same function object (enterPlaycall reaching a
        // spent clock lands in endQuarter, which sets deadNext =
        // enterPlaycall again). Deferring the null and then clearing it "only
        // if unchanged" cannot tell that legitimate re-arm apart from a
        // continuation that scheduled nothing — it deletes the new beat and
        // hangs the game. So: consume first, and REPAIR on the way out.
        const f = G.deadNext;
        G.deadNext = null;
        try { f(); }
        catch (err) {
          G.lastErr = String(err);
          notify("RECOVERED FROM AN ERROR — RESETTING THE PLAY");
          // ...unless the continuation managed to schedule its successor
          // before it blew up, in which case that beat is the better recovery.
          if (!G.deadNext) { G.deadT = 0; enterPlaycall(); }
        }
      }
      // Belt and braces for the OTHER softlock shape: a dead beat with no
      // continuation at all (a stray state edit, a dropped frame, a net frame
      // that landed mid-beat, or a continuation whose own recovery failed).
      // Three seconds past the whistle with nothing scheduled is not a beat,
      // it is a hang. The kickoff exemption is written against the flight that
      // is ACTUALLY still animating — the same test the block above uses, plus
      // "not landed yet" — because a stale G.koFly object left lying around
      // would otherwise disable this watchdog permanently. deadT is re-zeroed
      // first so a recovery that itself fails retries once every 3s rather
      // than once a frame.
      const koStillFlying = !!(G.koFly && G.ball && G.ball.mode === "koflight" && G.koFly.t < G.koFly.T);
      if (G.deadT < -3 && !G.deadNext && !koStillFlying) {
        G.deadT = 0;
        notify("DEAD BALL RECOVERED — BACK TO THE PLAY CALL");
        enterPlaycall();
      }
      updateCamera(dt);
      return;
    }
    if (S === "intro") { G.intro.t += dt; if (G.intro.t > 6.4) { G.intro = null; G.state = "pregame"; } return; }
    // The cold-open runs on the title clock. Nothing about INPUT changes:
    // ENTER/tap still goes title -> menu at any point, during the animation or
    // after it, so the boot adds no extra keypress to any flow (the battery
    // navigates by mashing ENTER and would notice immediately).
    if (S === "title") { G.bootT = (G.bootT || 0) + dt; return; }
    if (S === "kick") { updateKick(dt); return; }
    if (S === "kickfly") { updateKickFly(dt); return; }
    if (S === "halftime") { updateHalftime(dt); return; }
    if (S === "replay") { updateReplay(dt); return; }
    if (S === "qa") { updateHighlight(dt); return; }
    if (S === "career_quiz" || S === "career_drill") { updateCareer(dt); return; }
    if (S !== "live") return;
    return updateLiveTail(dt);
  }
  // whistle-to-next-snap cosmetics: extracted so the card screens can keep
  // ticking poses (never freezing a chain mid-link — LESSONS #2/#3 intact)
  function tickDeadEntities(dt) {
    {
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
        // pile-on runners keep coming through the whistle and fold onto the
        // tackle; they rise with everyone else via the normal pose flow
        if (e.pileT > 0) {
          e.pileT -= dt;
          const dx3 = e.pileSpot.x - e.x, dy3 = e.pileSpot.y - e.y, dd3 = Math.hypot(dx3, dy3);
          const step3 = (e.spd || 90) * 1.15 * dt;
          if (dd3 > 6 && !e.piled) { e.x += (dx3 / dd3) * Math.min(step3, dd3); e.y += (dy3 / dd3) * Math.min(step3, dd3); e.animT += dt * 8; }
          else if (!e.piled) {
            e.piled = true;
            playPose(e, "tackle", 0.36);
            e.poseChain = [{ pose: "getup", dur: 0.34 }];
          }
          if (e.pileT <= 0) e.pileT = 0;
        }
        // Chained poses (tackled → getup → celebrate): the next link starts
        // only when the current cel has finished AND its own delay is spent,
        // so the rise is a sequence the eye can follow, never an override.
        if (e.poseChain && e.poseChain.length && e.poseT <= 0) {
          const link = e.poseChain[0];
          if (link.after > 0) link.after -= dt;
          else {
            e.poseChain.shift();
            if (!e.poseChain.length) e.poseChain = null;
            // A GROUNDED link means he is still down, so proneT must stay set:
            // snapshotFrame records `prone: e.proneT > 0` and the replay draws
            // the laid-out body from it, so releasing the flag on every link
            // made replays show a STANDING dino during the prone cel. Only a
            // rising/upright link (getup, celebrate) releases it.
            if (link.pose === "prone" || link.pose === "tackled" || link.pose === "layflat") {
              e.proneT = Math.max(e.proneT || 0, link.dur);
            } else e.proneT = 0;
            e.tackleFallPending = false;
            playPose(e, link.pose, link.dur);
            if (link.fdCeleb) { e.fdCeleb = link.fdCeleb; e.jumpT = 0.45; }
          }
        }
        // After the impact cel has shown the actual shoulder wrap, keep a
        // made-tackle carrier in the authored backward-fall cel — for as long
        // as he is actually down, so the 90°-rotated fallback never flashes.
        // (A pose chain owns its own prone link, so it skips this.)
        if (!e.poseChain && e.tackleFallPending && e.proneT > 0 && e.poseT <= 0) {
          e.tackleFallPending = false;
          playPose(e, "prone", Math.max(0.3, e.proneT));
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
    }
  }
  function updateLiveTail(dt) {
    G.playT += dt;
    // snow footsteps: crunches ONLY while the player you're controlling (or
    // the live ball carrier) is actually running — never a constant ambience
    if (G.weather && G.weather.type === "SNOW") {
      const mover = G.controlled || G.carrier;
      const moving = mover && Math.hypot(mover.vx, mover.vy) > (mover.spd || 90) * 0.35;
      G.snowStepT = (G.snowStepT || 0) - dt;
      if (moving && G.snowStepT <= 0) {
        G.snowStepT = 0.27;
        noiseBurst({ from: 1000, to: 420, dur: 0.045, vol: 0.018, q: 0.8 });
      }
    }
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
      // THE DOUBLE-TEAM, RE-AIMED AND SHORTENED. Two defects, both measured.
      // (1) It washed the interior man nearest laneY = MID + lane * 44, a
      // designed point the runner is not standing on: the back aligns at
      // MID + 18.7 and the front four sit at MID -59.8 / -19.8 / +19.6 / +59.8,
      // so that 18.7px offset lands inside a near-tie between the two interior
      // men and gets settled by sub-pixel solver noise. At seed 4242 it washed
      // the defender actually NEAREST the carrier on 18.8% of carries (17.5-19.4%
      // across five seeds), and the washed man was the first to touch the ball
      // only 20.6% of the time. The one lane-clearing mechanism in the build was
      // aimed at a point the runner is not on, so it is now aimed at the ball.
      // (2) A 0.55s freeze is far too long now that the run block drives the pair
      // out of the lane every frame: a staggered man is released by his blocker,
      // is excluded from the block pool, and therefore gets no drive either — a
      // wash victim standing in the crease became an IMMOVABLE plug for a third
      // of the play. 0.22s still buys the double-team its beat while handing him
      // back to a blocker in time to be turned out.
      const laneY = rb ? rb.y : MID + ((G.curPlay && G.curPlay.lane) || 0) * 44;
      const dt2 = G.players.filter((e) => e.team === "def" && (e.role === "DL" || e.role === "EDGE"))
        .sort((a, b) => Math.abs(a.y - laneY) - Math.abs(b.y - laneY))[0];
      if (dt2 && dt2.staggerT <= 0) {
        dt2.staggerT = 0.22;
        dt2.y += dt2.y > laneY ? 12 : -12;
      }
    }
    // CPU QB (also throws for YOUR team when you chose to play as a receiver)
    const userIsReceiver = offenseIsUser() && G.controlled && G.controlled !== G.ball.holder &&
      G.controlled.team === "off" && G.ball.mode === "held";
    // a QB improvising behind the line is a RUN THREAT the defense reacts to
    // — the play has broken down (long hold, or clearly bolting) and the
    // second level rallies instead of statue-guarding finished routes
    // (owner play-test 2026-08-07: "players literally just stand there")
    {
      const hld = G.ball.holder;
      G.qbImprov = G.phase === "drop" && hld && hld.role === "QB" &&
        (G.playT > 3.0 || (G.playT > 1.2 && Math.hypot(hld.vx, hld.vy) > hld.spd * 0.55 &&
          (Math.abs(hld.y - MID) > 96 || hld.x < xAtYd(G.losYd) - 110)));
    }
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
    // CPU rampage (offensive or defensive apex) — never auto-spend a HUMAN
    // player 2's meter in versus mode
    if (!G.humanB && rampAvail("B")) tryRampage(true);
    // flea flicker: the back auto-pitches it home to the QB
    if (G.curPlay && G.curPlay.flicker && !G.flickerDone && G.phase === "carry" &&
      G.carrier && G.carrier.role === "RB" && G.playT > 1.15) {
      const qb = G.players.find((p) => p.role === "QB");
      if (qb) doLateral({ x: qb.x, y: qb.y });
    }
    // BREAKAWAY (source s_is_in_the_clear): the carrier cracked midfield with
    // zero defenders between him and the goal — call it once per play.
    // Geometric check + latch, not a dice roll (LESSON #15).
    if (!G.breakawayCalled && !G.patMode && G.phase === "carry" && G.carrier) {
      const cyd = ydAtX(G.carrier.x);
      if (cyd > 50 && cyd < 90 &&
        !G.players.some((e) => e.team !== G.carrier.team && e.x > G.carrier.x - 8)) {
        G.breakawayCalled = true;
        announce("bigplay", G.carrier.name);
        crowdCheer(0.5);
        if (G.qaTele) G.qaTele.push({ tag: "brk:clear", drive: G.drive });
        cpuSoarSave(G.carrier);
      }
    }
    // check-down outlet: after his chip, the blocking back releases to the
    // flat and becomes a live target for user and CPU quarterbacks alike
    if (G.phase === "drop" && G.curPlay && G.curPlay.type === "pass") {
      for (const e of G.players) {
        if (e.team !== "off" || e.role !== "RB" || e.state !== "block" || e.rbRelease == null) continue;
        e.rbRelease -= dt;
        if (e.rbRelease <= 0) {
          e.rbRelease = null;
          const side = e.y >= MID ? 1 : -1;
          e.path = [
            { x: e.x + 2 * YPX, y: clamp(e.y + side * 55, TOP + 12, BOT - 12) },
            { x: e.x + 7 * YPX, y: clamp(e.y + side * 85, TOP + 12, BOT - 12) },
          ];
          e.endMode = "go"; e.pathI = 0; e.state = "route";
        }
      }
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
    const target = G.carrier || (b && (b.mode === "air" || b.mode === "loose" || b.mode === "kickfly" || b.mode === "koflight") ? b : b && b.holder) || { x: xAtYd(G.losYd) };
    // lookahead: on a live carry the lens leads the runner so you see the
    // field he's about to hit, not the turf he already crossed
    const lead = G.carrier && G.state === "live" ? (G.carrier.dir || 1) * 52 : 0;
    const want = clamp(target.x + lead - W * 0.45, 0, FIELD_LEN - W);
    G.camX += (want - G.camX) * Math.min(1, dt * (b && b.mode === "loose" ? 8 : 5));
    // punch-zoom: ball flights pull the lens in a touch; TDs and de-cleaters
    // punch it harder, then it eases home. Kept OFF while aim UI is live so
    // world-anchored overlays never misalign.
    let wantZ = 1;
    if (b && (b.mode === "air" || b.mode === "kickfly")) wantZ = 1.06;
    if (G.zoomPunch > 0) {
      wantZ = Math.max(wantZ, 1 + G.zoomPunch);
      G.zoomPunch = Math.max(0, G.zoomPunch - dt * 0.35);
    }
    G.zoom += (wantZ - G.zoom) * Math.min(1, dt * 5);
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
        // legible; the pull depth shapes the arc (short pull = flat dart).
        const h = clamp(d * 0.17, 20, 74) * (b.pull == null ? 1 : 0.6 + 0.65 * b.pull);
        b.z = 12 + h * 4 * k * (1 - k);
      } else {
        b.z = 14 + 10 * Math.sin(Math.PI * k) - 6 * k;
        // bullet can be picked mid-flight by defenders in the lane.
        // QA balance fix: this used to re-roll EVERY FRAME a defender's box
        // overlapped the ball, so a trail DB riding the receiver's hip ended
        // nearly every bullet (pick or swat) before arrival — completions
        // cratered. Now each defender gets ONE reaction roll per throw, most
        // bullets zip past, and the end-of-flight contest is left to
        // resolveArrival (k < 0.85 guard).
        for (const e of G.players) {
          if (e.team !== "def" || e.staggerT > 0 || e.blockedBy) continue;
          if (Math.abs(e.x - b.x) < 10 && Math.abs(e.y - b.y) < 10 && b.t > 0.08 && k < 0.85 && e.__laneBall !== b) {
            e.__laneBall = b;   // one reaction per defender per throw
            if (Math.random() < 0.28 + (e.jumpT > 0 ? 0.15 : 0)) {
              if (Math.random() < 0.3 + (e.controlled ? 0.2 : 0)) {
                if (G.qaTele) G.qaTele.push({ tag: "int:lane", drive: G.drive, kind: b.kind });
                intercepted(e, e); return;
              }
              else { incomplete({ x: b.x, y: b.y }); return; }
            }
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
        // Never cue a dino that is DOWN or mid-contact. This fired on the
        // nearest receiver and nearest defender unconditionally, so it could
        // overwrite an in-flight tackle/tackled/prone cel (LESSON #2) — and on a
        // grounded dino the laid-out rotation then got applied to a CATCH cel,
        // the same double-rotation defect fixed in A-2. Only the animation cue
        // is gated: the leap block below still sets jumpT/jumpTimed for everyone,
        // because those decide catch outcomes and balance is a separate batch.
        const cueOk = (e) => e && (e.proneT || 0) <= 0 && (e.staggerT || 0) <= 0 &&
          !e.grappling && (e.grappledT || 0) <= 0 && !e.poseChain &&
          !["tackle", "tackled", "prone", "layflat", "shoved", "getup", "dive"].includes(e.pose || "");
        if (recCue && recCue.d < 60 && cueOk(recCue.e)) playPose(recCue.e, cuePose, cueDur);
        if (defCue && defCue.d < 60 && cueOk(defCue.e)) playPose(defCue.e, cuePose, cueDur);
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
        if (rec && rec.d < 44 && !rec.e.controlled) {
          rec.e.jumpT = 0.4;
          // QA balance: 0.38 → 0.44 — AI pros time their leaps a touch better,
          // tipping normal contested balls toward catch-or-breakup, not picks
          if (Math.random() < 0.44 + ((rec.e.hands || 75) - 70) * 0.01) rec.e.jumpTimed = true;
        }
        if (df && df.d < 44 && !df.e.controlled) {
          df.e.jumpT = 0.4;
          if (Math.random() < 0.2 + ((df.e.jump || 75) - 70) * 0.005) df.e.jumpTimed = true;
        }
      }
      // QA balance: BOX-OUT — remember who established position under the
      // ball first. Distance at the landing frame cannot tell "receiver
      // camped here and the DB closed late" from "the DB beat him to it",
      // and that difference is what decides a real catch point.
      if ((b.kind === "lob" || b.kind === "bullet") && !b.away && !b.posOwner) {
        if (b.target && dist(b.target, b.to) < 15) b.posOwner = b.target;
        else {
          const d0 = G.players.find((p) => p.team === "def" && p.staggerT <= 0 && dist(p, b.to) < 15);
          if (d0) b.posOwner = d0;
        }
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
    e.animT += dt * (Math.hypot(e.vx, e.vy) > 10
      ? 4 + 7 * Math.min(1, Math.hypot(e.vx, e.vy) / 91)   // stride rate follows speed
      : 1.4);
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
    if (e.jukePlantT > 0) e.jukePlantT -= dt;
    if (e.stiffPlantT > 0) e.stiffPlantT -= dt;
    if (e.stiffCd > 0) e.stiffCd -= dt;
    // a locked-on grappler rides the carrier (drag-the-pile): he is pulled
    // along at wrap distance rather than re-running pursuit every frame
    if (e.grapT > 0) {
      e.grapT -= dt;
      const c2 = e.grappling;
      if (c2 && G.carrier === c2 && c2.proneT <= 0 && e.staggerT <= 0) {
        const gdx = c2.x - e.x, gdy = c2.y - e.y, gdm = Math.hypot(gdx, gdy) || 1;
        const hold = bodyContactRange(e, c2) * 0.58;
        if (gdm > hold) {
          const pull = Math.min(gdm - hold, 380 * dt);
          e.x += (gdx / gdm) * pull; e.y += (gdy / gdm) * pull;
        }
      } else { e.grapT = 0; e.grappling = null; }
    }
    // grapple fight bookkeeping (RB takedown model): pulling out of the wrap
    // drains the accumulated takedown quickly and re-arms the shrug roll
    if (e.grappledT > 0) { e.grappledT -= dt; e.wrapClock = (e.wrapClock || 0) + dt; }
    else if (e.tackleAcc > 0 || e.breakAcc > 0) {
      // Decay stays COHERENT with the pour: the pour dropped by roughly the same
      // factor when the role rate landed, so a carrier who pulls out of the wrap
      // still clears the whole accumulator in about half a second rather than
      // instantly. The escape ledger drains on the same clock as the takedown
      // ledger it races — a half-finished break must not survive a trip through
      // open field and cash in on the next contact.
      e.tackleAcc = Math.max(0, e.tackleAcc - dt * 110);
      e.breakAcc = Math.max(0, (e.breakAcc || 0) - dt * 110);
      if (e.tackleAcc <= 0) { e.grappleRolled = false; e.hardHitTaken = false; e.wrapClock = 0; }
    }

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
    // CATCH GATHER (owner play-test: "players don't slow down after
    // receiving", so the defense never converges). completeCatch stamps
    // catchT and becomeCarrier in the SAME tick, and moveToward writes
    // velocity straight from e.spd — so a receiver at full route speed was a
    // full-speed carrier on the very frame he possessed the ball (measured
    // 100% of route speed at catch+0.1s), INSIDE checkTackles' 0.40s tackle
    // grace. Untouchable AND at top speed is a double buff: the nearest
    // defender closed only 2-9px over the first half second (5 seeded runs),
    // which reads as teleport-YAC. The real Retro Bowl cannot have this
    // problem — its movement is accel-based (WR 0.115 px/frame^2,
    // RETRO_BOWL_MECHANICS.md sec 2), so possession always costs a
    // re-acceleration beat. We set velocity directly, so the beat is an
    // explicit deterministic ramp (LESSON #19, no dice): 55% legs at
    // possession, full stride at +0.45s. Measured (5 seeds x 6 games): 65% of
    // route speed at +0.1s, defenders close 11-14px in the first 0.5s,
    // median YAC 1.8-2.7 -> 1.3-2.1yd, comp%/INT flat within seed noise.
    // The 0.40s grace itself is untouched — the carrier is protected BECAUSE
    // he is gathering, not on top of full speed. diveT/soarT keep their own
    // landing physics (same guard as inGrace), and QB keeps/handoffs have no
    // catchT, so runs never gather.
    let gather = 1;
    if (e === G.carrier && e.catchT != null && e.diveT <= 0 && e.soarT <= 0) {
      const ct = G.playT - e.catchT;
      if (ct >= 0 && ct < 0.45) gather = 0.55 + ct;
    }
    // LEG DRIVE IN THE WRAP — the carrier's side of the takedown.
    // WAS: a flat 0.42. Every wrapped carrier crawled at 42% of his legs, so a
    // 250-pound power back held by one corner and a scatback held by a defensive
    // tackle moved at exactly the same rate, and nothing in the file told
    // updateEntity who had hold of him. One constant cannot express "he is moving
    // the pile" or "he was stood up at the line", which are the two things a run
    // through contact is supposed to read as — and it is slow enough that the
    // contact solver's own separation push could out-run his forward progress, so
    // he was not fighting for yards, he was being processed.
    // NOW it is the contest the wrap publishes in checkTackles. `legs` is the
    // carrier's power plant — strength, the stiff-arm rating, and enough agility
    // to keep his feet — against the anchored force of the man who actually has
    // him. Both normalise to ~75 at league average, and the band is set so the
    // middle of the league lands above the old constant while a losing matchup
    // drops well below it: going backward is now something the carrier has to
    // LOSE (the floor, plus the defenders standing on his downfield face) rather
    // than the default.
    // Read one frame stale on purpose — grappledT is read the same way, and
    // checkTackles by construction runs after all movement for the tick is
    // chosen. Deterministic and legible (LESSON #15 / LESSON #19); this changes
    // only how fast the man with the ball may move, never firmness, contact mode
    // or grapple depth (LESSON #1).
    let wrapDrive = 1;
    if (e.grappledT > 0) {
      const legs = ((e.str || 75) + (e.stiff || e.str || 75) * 0.6 + (e.agi || 75) * 0.3) / 1.9;
      const resist = e.wrapTop > 0 ? e.wrapTop : 75;
      // A RECEIVER IS NOT A RUNNING BACK, AND THE PASS GAME IS GUARDED. The
      // owner's play-test finding was that receivers do NOT slow down after
      // receiving, and the catch-gather ramp a few lines below exists to TRIM
      // receiver YAC; leg drive is the same lever pointed the other way, so
      // handing it to a receiver undoes that work. Measured: the run-game tuning
      // alone took receiver yards-after-catch from a 1.05 median to 1.91. A back
      // hits the hole with his pads down and his legs already churning; a
      // receiver is catching, turning, and then absorbing the hit. `catchT` is
      // the engine's own marker for "this man received the ball on this play" —
      // the same field the gather ramp keys off — so the two corrections stay on
      // one switch instead of drifting apart.
      const wrapGrit = e.catchT != null ? 0.36 : 1;
      wrapDrive = wrapGrit * clamp(0.86 + (legs - resist) / 150, 0.16, 0.92);
    }
    // THE PLANT. A cut or a thrown paw costs forward speed and then rebuilds it,
    // so evasion buys you the defender in front of you and charges you ground
    // for it. Ramped, not a step: (1 - plantFraction) eases back to full over
    // the window so the recovery is visible rather than a snap.
    let plant = 1;
    if (e.jukePlantT > 0) plant *= JUKE_PLANT_SPEED + (1 - JUKE_PLANT_SPEED) * (1 - e.jukePlantT / JUKE_PLANT_T);
    if (e.stiffPlantT > 0) plant *= STIFF_PLANT_SPEED + (1 - STIFF_PLANT_SPEED) * (1 - e.stiffPlantT / STIFF_PLANT_T);
    const speedMod = G.weather.speedMod * wrapDrive * plant * (e.diveT > 0 ? 1.9 : 1) *
      (G.ramp && G.ramp.ent === e ? 1.28 : 1) * (e.soarT > 0 ? 1.9 : 1) * passMod * tired * (1 - longCarryFade) * (e.coldT > 0 ? 0.78 : 1) * burst * gather;
    if (e.jukeT > 0) e.jukeT -= dt;
    if (e.diveT > 0) {
      e.diveT -= dt;
      if (e.diveT <= 0) {
        if (e === G.carrier) { playDead("DIVE", null, false); return; }
        e.proneT = 0.55;
        // The `dive` cel is ALREADY horizontal (sprites.js builds dive frames
        // 2-3 through actionLayFlat), and doDive gives the pose 0.50s against a
        // 0.30s diveT. So for the 0.20s overhang the laid-out ROTATION was
        // applied on top of an already-flat cel and stood the sprite on end.
        // Swap the spent dive cel for the authored grounded one — but only when
        // `dive` is still what is playing: if the dive actually landed a hit,
        // the contact pose owns the body and must not be overwritten (LESSON #2).
        // cel duration MATCHES proneT so the authored grounded art covers the
        // whole time he is flagged down — a shorter cel left a gap where the
        // generic rotated-walk fallback showed through
        if (e.pose === "dive") { e.pose = ""; e.poseT = 0; playPose(e, "prone", e.proneT); }
        // No rise CHAIN here on purpose: a dive expires during LIVE play, where
        // proneT decays on the live path and he stands and rejoins on his own.
        // The chain runner only ticks in dead-ball states, so a chain queued
        // here just sat there and fired a stale `getup` after the whistle, long
        // after he was already upright. LESSON #3 is satisfied by the live rise.
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
        csp *= 0.42;
        e.blockAcc = (e.blockAcc || 0) + blockFeedRate(e) * dt;
        e.engageT = blockHoldLeft(e);
        // a controlled rusher steers freely at csp, so he can EARN the
        // tether break laterally — the human's visible escape move
        const shedC = blockShedCheck(e);
        if (shedC) {
          if (G.qaTele) G.qaTele.push({ tag: shedC, drive: G.drive });
          releaseBlock(e, { spin: true, freeT: 2.5 });
        }
      }
      // Owner control model (2026-08-07): a BALL CARRIER runs on his own —
      // football players don't stand still holding the ball. No input = full
      // churn toward the endzone; back-input = throttle down (set up blocks);
      // forward-input = dive (mapped in onKey, ignored as steering here).
      // Vertical taps are DODGE CUTS, not strafing: a hard lateral burst
      // with a brief ~5% legs cost after — a cut is a change of momentum.
      const isCarrier = e === G.carrier;
      if (isCarrier && e.diveT <= 0) {
        const fwdDir = e.team === "off" ? 1 : -1;
        if (e.cutCd > 0) e.cutCd -= dt;
        if (e.cutSlowT > 0) e.cutSlowT -= dt;
        const wantCut = Math.abs(d.y) > 0.35;
        if (wantCut && e.cutCd <= 0) {
          e.cutT = CUT_T; e.cutDir = d.y > 0 ? 1 : -1;
          e.cutCd = CUT_CD; e.cutSlowT = CUT_SLOW_T;
          // dust off the PLANT foot — the side he pushes away from — so the
          // cut reads as a direction rather than a puff under his belly
          fxDust(e.x - e.dir * 3, e.y + 4 - e.cutDir * 3, 4); sfx.juke();
          // TIMED RIGHT, IT MAKES HIM MISS. A cut only beats a man who has
          // COMMITTED — close, and closing hard. Cut early or late and it is
          // just a step sideways that cost you speed, which is what makes the
          // timing a skill instead of a button. Agility decides how badly the
          // defender is beaten; a soaring tackler cannot be cut at all,
          // exactly as in doJuke.
          for (const df of G.players) {
            if (df.team === e.team || df.staggerT > 0 || df.soarT > 0 || df.proneT > 0) continue;
            const gap = dist(df, e);
            if (gap >= CUT_BEAT_RANGE) continue;
            const closing = (df.vx * (e.x - df.x) + df.vy * (e.y - df.y)) / Math.max(1, gap);
            if (closing <= CUT_BEAT_CLOSING) continue;
            df.staggerT = Math.max(df.staggerT || 0,
              0.34 + Math.max(0, ((e.agi || 75) - (df.agi || 75))) / 240);
            G.shake = Math.max(G.shake || 0, 0.06);
          }
        }
        const backing = (fwdDir > 0 ? d.x < -0.35 : d.x > 0.35);
        const throttle = backing ? 0.45 : 1;
        // the cost, ramped back rather than snapped, so the recovery reads.
        // It was a flat 0.95 — a 5% tax nobody could feel, on a mechanic that
        // never fired anyway.
        const cutTax = e.cutSlowT > 0
          ? CUT_SLOW_SPEED + (1 - CUT_SLOW_SPEED) * (1 - e.cutSlowT / CUT_SLOW_T)
          : 1;
        e.vx = fwdDir * throttle * cutTax * csp;
        e.vy = 0;
        if (e.cutT > 0) { e.cutT -= dt; e.vy = e.cutDir * csp * CUT_BURST; e.vx *= 0.75; }
      } else {
        const m = Math.hypot(d.x, d.y) || 1;
        e.vx = (d.x / m) * csp; e.vy = (d.y / m) * csp;
      }
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
          // the INTENDED receiver — the one the throw was actually for —
          // ALWAYS attacks the football, exactly like the defenders breaking
          // on it. The old rule only sent "whoever happened to be nearest",
          // so a led receiver kept jogging his route while the DB drove to
          // the spot: free interceptions. Offense plays the ball first now.
          if (e === G.ball.target || (nearest === e && nd < 220) ||
            (e.controlled && dist(e, G.ball.to) < 260)) {
            const tgt = { x: G.ball.to.x, y: clamp(G.ball.to.y, TOP + 8, BOT - 8) };
            moveToward(e, tgt, sp * (e === G.ball.target ? 1.06 : 1), dt); break;
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
          // NOTE: the first branch used to clear only e.engaged and LEAK a
          // stale blockedBy on the rusher (speed-capped + filtered out of the
          // rush pool for the rest of the play) — releaseBlock fixes both ends
          if (r2.staggerT > 0 || (r2.state !== "rush" && !r2.controlled)) { releaseBlock(r2); break; }
          if (dist(e, r2) > 42) { releaseBlock(r2, { staggerBlocker: 0.3 }); break; } // beaten clean
          // stay latched INTO the rusher — real linemen play chest-to-chest
          // with their hands inside, so the pair holds at grapple depth
          // (~55% of full separation), not at arm's length
          const gap = bodyContactRange(e, r2, 1) * 0.55;
          // RUN DRIVE (ROADMAP S4 + S5). WHAT WAS BROKEN: on a run the five linemen
          // played pass protection — a HOLD, not a drive. An engaged blocker aims at
          // his man's CURRENT spot, so the pair parks wherever the defender chose to
          // stand, while the defender's own blocked-rusher term in case "rush" walks
          // him toward the football every frame. The ball is ON the lane, so a blocked
          // pair actively homed ONTO the runner's path. Measured on the blocking bench
          // (tests/blocking_bench.js, seed 4242, 160 carries): the widest gap the
          // carrier could REACH — centre within 50px of his own line — was 0.0 / 4.6 /
          // 4.1 px at +0.1 / +0.3 / +0.5s against a 26px body, and ZERO of 160 carries
          // at any sample on any of five seeds had a hole he would fit through. A
          // fitting hole existed on 100% of carries but sat 149 / 99 / 82 px off his
          // line — always the box perimeter, never an interior lane. driveOutOfLane()
          // owns the fix and the reasoning behind its shape.
          const lane = e.team === "off" ? runLaneY() : null;
          if (lane != null) driveOutOfLane(e, r2, lane, dt);
          moveToward(e, { x: r2.x + (e.team === "off" ? -gap : gap), y: r2.y }, sp * 1.05, dt);
          break;
        }
        if (e.engaged && G.ramp && G.ramp.ent === e.engaged) releaseBlock(e.engaged, { staggerBlocker: 0.8 });
        // A STAGGERED man is not blockable, and leaving him in this pool was a
        // silent grind killer. The engaged branch above releases the instant
        // r2.staggerT > 0, but this filter only excluded blockedBy / freeT — so
        // the moment the handoff wash staggered an interior defender, a DIFFERENT
        // lineman re-latched him on the very next frame, the engaged branch let
        // go again, and the pair oscillated for the whole 0.55s stagger.
        // releaseBlock() zeroes blockAcc and every fresh latch re-rolls
        // blockShedAt, so the Retro Bowl grind (RETRO_BOWL_MECHANICS §3) never
        // ran on that defender at all. Measured on the blocking bench, seed 4242:
        // wash-victim latch cycles median 13 (max 22) against a median of 1 for
        // every other blocked defender, and wash-victim grind accPeak 0.246 vs
        // 0.632 overall, with a frame trace showing one-frame-on / one-frame-off
        // and the threshold re-rolled each cycle (185/165/198/175/181 work units)
        // while the accumulator stayed pinned at 0. Run-only: heldPocket
        // latches-per-rep was already exactly 1.00 with sd 0 over 480 reps.
        const rushers = G.players.filter((p) => p.team !== e.team && p.state === "rush" && !p.blockedBy && !(p.freeT > 0) && !(p.staggerT > 0) && !(G.ramp && G.ramp.ent === p));
        rushers.sort((a, b) => dist(a, e) - dist(b, e));
        if (!rushers[0] || dist(rushers[0], e) > 120) {
          // Nothing is immediately in the gap: the five blockers move as a
          // *unit*.  On a pass they keep a clean U-shaped pocket around the
          // QB; on a run they climb in staggered lanes ahead of the carrier
          // instead of becoming five unrelated homing missiles.
          // A run block is on the clock from the SNAP, not from the handoff. The
          // carry sub-case used to require G.phase === "carry", and the handoff does
          // not fire until G.playT > 0.35 — so for the first third of a second the
          // free lineman ran the PASS-POCKET target (esc.x + 34 off the standing
          // quarterback) and simply held his alignment inside the wall. Measured at
          // seed 4242: the escort blocker did not start clearing until +0.35s and
          // only reached his lane-edge spot at +0.82s, while first contact on the
          // ball lands at +0.90s from the snap. The crease finished forming eighty
          // milliseconds before the play was decided. Keying the run sub-case off
          // runLaneY() instead gives it the whole play: the back is not the carrier
          // yet pre-handoff, so his alignment is the lane and he is the anchor.
          const run = runLaneY();
          const esc = run != null
            ? (G.carrier && G.carrier.team === e.team ? G.carrier
              : G.players.find((p) => p.team === e.team && (p.role === "RB" || p.role === "FB")) || G.ball.holder)
            : (G.carrier && G.carrier.team === e.team ? G.carrier : G.ball.holder);
          if (esc) {
            const slot = e.lineSlot == null ? 2 : e.lineSlot;
            const offset = e.lineOffset == null ? (slot - 2) * 32 : e.lineOffset;
            if (run != null) {
              // SECOND LEVEL (ROADMAP S7). A hole has to LEAD somewhere, and nobody
              // climbed. The receivers stalk whichever CB/S/LB is nearest THEM
              // (case "runblock" ranks by distance to the receiver, and they align
              // 100px+ outside), and an O-lineman could not block a linebacker at
              // all: the block pool below filters on state === "rush" and a
              // linebacker is in state "read". So the free lineman escorted the ball
              // instead of blocking anyone. That cost nothing while no crease
              // existed, which is why ROADMAP scored this at ~0 of the gap — but
              // once the drive above opened one it became the binding constraint.
              // Frame trace at seed 4242 with the crease open: the front four were
              // turned out to MID -23 / -25 / +60 / +72 and the carrier reached
              // +1.6 yd before an UNBLOCKED linebacker sitting at MID+7, 3.5 yd
              // downfield, ended it. Adding this is worth +0.50 yd/carry (0.84 ->
              // 1.34 median) and takes second-level defenders blocked or stalked
              // from 43.6% to 85.4%. He takes the man nearest the BALL that no
              // teammate has claimed, and stalks him with the receivers' own
              // mechanism — same damp, same shove, same strength-scaled cap.
              if (e.block && (e.block.blockedBy || e.block.staggerT > 0 ||
                e.block.proneT > 0 || e.block.freeT > 0 || e.block.soarT > 0 ||
                // ...or the man simply outran him. Without this the lineman keeps a
                // claim forever: he never lets go, never arrives, and the `claimed`
                // filter reserves that defender against every other blocker while he
                // does it (LESSON #20 -- every detach path clears its own state).
                dist(e.block, e) > CLIMB_GRASP * 1.6)) {
                e.block = null; e.blockHold = 0;
              }
              if (!e.block) {
                const ball = G.carrier || esc;
                const claimed = G.players.filter((p) => p.team === e.team && p !== e && p.block)
                  .map((p) => p.block);
                // Nearest the BALL — not nearest the lane's y, and not nearest
                // himself. Ranking by lane offset sent him after the free safety:
                // traced at seed 4242 the safety sat 5px off the ball's line but 200px
                // (8+ yd) downfield, so he chased a man he could never reach while the
                // linebacker who made the tackle stood 17px off the line and 52px away.
                // Measured that way: 110 climb frames, ZERO contacts. CLIMB_REACH caps
                // it at 7 yd of the ball for the same reason.
                const climb = G.players.filter((p) => p.team !== e.team && !p.blockedBy &&
                  p.staggerT <= 0 && p.proneT <= 0 && p.soarT <= 0 && claimed.indexOf(p) < 0 &&
                  (p.role === "LB" || p.role === "CB" || p.role === "S") &&
                  p.x > ball.x - 10 && Math.abs(p.y - run) < 104 && dist(p, ball) < CLIMB_REACH &&
                  dist(p, e) < CLIMB_GRASP);
                climb.sort((a, b2) => dist(a, ball) - dist(b2, ball));
                e.block = climb[0] || null;
              }
              if (e.block) { stalkBlock(e, e.block, sp, dt, run); break; }
              const laneX = 26 + Math.abs(slot - 2) * 9;
              let laneY = clamp(esc.y + offset * 0.72, TOP + 18, BOT - 18);
              // A LINEMAN WITH NO MAN MUST NOT STAND IN THE HOLE. There are five
              // blockers and usually four rushers, so at least one lineman a play
              // runs this escort branch — and it sent him to esc.x + 26..44 (in
              // FRONT of the ball) on esc.y + offset * 0.72, which for the guards
              // is only 23px off the ball's own line: inside a 16px body radius
              // of it. Once the engaged pairs started clearing the lane above, the
              // free linemen became the entire remaining wall. Frame trace at seed
              // 4242, HB DIVE: by +0.75s the engaged pairs had been turned out to
              // -51 and +57 off MID while two UNENGAGED linemen sat at -9 and +40,
              // leaving 17px of daylight against a 26px body. Hold him to the same
              // RUN_LANE_HALF the drive works for, so an escort blocker seals the
              // EDGE of the crease instead of plugging it.
              const clear = RUN_LANE_HALF + bodyRadius(e);
              const dy = laneY - run;
              if (Math.abs(dy) < clear) laneY = run + (dy >= 0 ? clear : -clear);
              laneY = clamp(laneY, TOP + 18, BOT - 18);
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
            // back in the trench, so he is not claiming a second-level man any more
            // (a stale e.block would reserve that defender against every other
            // blocker via the `claimed` filter above — LESSON #20: every detach path
            // clears its own state)
            e.block = null; e.blockHold = 0;
            // RETRO BOWL BLOCK GRIND: no timer, no dice at contact. The
            // blocker's grade is the threshold, the rusher pours work into it
            // every frame, and per-snap variance lives in ONE threshold roll
            // at the latch (the source's my_tackle_limit · irandom(3..5)).
            // A stronger rusher sheds sooner because he FEEDS faster; a
            // better blocker holds longer because his anchor is deeper —
            // and the bull-rush walk-back can break the tether first.
            const isRun = !!(G.curPlay && G.curPlay.type === "run");
            const feed = blockFeedRate(r0);
            let anchor = BLK_ANCHOR_BASE + (((e.blk || e.str || 75) - 75) * BLK_ANCHOR_PER_PT);
            anchor *= rnd(BLK_JITTER_LO, BLK_JITTER_HI);   // ONE roll per rep
            if (isRun) anchor *= BLK_RUN_ANCHOR_MULT;
            // auditable seconds bounds: no instant sheds, no welded blocks
            anchor = clamp(anchor, feed * BLK_HOLD_FLOOR,
              feed * (isRun ? BLK_HOLD_CEIL_RUN : BLK_HOLD_CEIL_PASS));
            r0.blockAcc = 0; r0.blockShedAt = anchor; r0.blockFeed = feed;
            r0.engageT = anchor / feed;   // derived projection, read-only
            // the tether anchor: the world point where the grapple began
            r0.blockLatchX = r0.x; r0.blockLatchY = r0.y;
            r0.blockTetherR = BLK_TETHER_BASE * (BLK_TETHER_TECH[r0.rushTech] || 1) *
              (isRun ? BLK_TETHER_RUN_MULT : 1);
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
          // Pocket collapse: jump the accumulator so at most 0.18s of grind
          // remains — a hard guarantee (the sack flow depends on it), not a
          // feed multiplier.
          if (pocketCollapsing) {
            e.blockAcc = Math.max(e.blockAcc || 0, (e.blockShedAt || 0) - (e.blockFeed || 1) * BLK_COLLAPSE_LEFT);
          }
          e.blockAcc = (e.blockAcc || 0) + blockFeedRate(e) * dt;
          e.engageT = blockHoldLeft(e);   // derived, keeps read-only consumers alive
          // the pair FIGHTS: a stronger rusher walks his blocker back into the
          // pocket (bull rush doubles down), a stronger blocker stonewalls
          const qb2 = G.ball.holder || G.carrier;
          const push = clamp(((e.str || 80) - (e.blockedBy.str || 75)) * 0.9, -10, 30) + (e.rushTech === "bull" ? 15 : 0);
          if (qb2 && push !== 0) {
            const dx2 = qb2.x - e.x, dy2 = qb2.y - e.y, m2 = Math.hypot(dx2, dy2) || 1;
            // BEING BLOCKED MUST IMPEDE PROGRESS TOWARD THE BALL (ROADMAP S3).
            // WHAT WAS BROKEN: this push is the pair FIGHTING, and it is aimed at
            // `qb2 = G.ball.holder || G.carrier` -- on a pass that is a quarterback
            // standing still 100+px away, which is what it was written for, but on a
            // run it is the BALL CARRIER about 36px away and moving. So a defender
            // who had been beaten and wrapped up still tracked the runner LATERALLY,
            // every frame, dragging his own blocker along with him. That is exactly
            // ROADMAP's 29-of-30 finding ("the block latches and rides along to the
            // ball") and exactly the S3 it asks for: separate "engaged and held" from
            // "engaged and walking to the ball". It is also why the run-lane drive
            // needed ~1s to clear a crease -- driveOutOfLane() turns the pair OUT at
            // 18-62 px/s while this term pulled it straight back IN at up to 45.
            // Measured on the blocking bench (tests/blocking_bench.js, seed 4242, 160
            // carries) with the drive already in: 56.9-62.3% of first tacklers were
            // ALREADY BLOCKED, and their grind was a median 0.27 of the way to a shed
            // -- a man losing his rep three-to-one was still making the tackle.
            // THE FIX: on a run the push keeps its x component and loses its y. A
            // blocked lineman can still drive his blocker backward off the ball (that
            // is a bull rush and it stays legible), but he cannot slide sideways to
            // the football while another man has his hands on him. Not attempt 5 from
            // the ROADMAP -- that cut the whole push to 15% and measured 0.74yd; the
            // full-strength fight is intact here and only the homing is gone.
            // Faithful to RETRO_BOWL_MECHANICS section 3, where a rusher spends his
            // work on the GRIND and travel is what winning the grind buys him.
            // Pass protection cannot see this: runLaneY() returns null off a run.
            const pushLane = runLaneY();
            const pdx = (dx2 / m2) * push * dt;
            const pdy = pushLane == null ? (dy2 / m2) * push * dt : 0;
            e.x += pdx; e.y += pdy;
            e.blockedBy.x += pdx; e.blockedBy.y += pdy;
          }
          e.x += rnd(-8, 6) * dt; e.y += rnd(-8, 8) * dt;
          const shed = blockShedCheck(e);
          if (shed) {
            if (G.qaTele) G.qaTele.push({ tag: shed, drive: G.drive });
            releaseBlock(e, { spin: true, freeT: pocketCollapsing ? 3.2 : 2.5 });
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
          // a freed rusher closes with urgency but NOT at superhero speed —
          // the D-line must never visibly outrun the skill players
          const rushSp = G.phase === "drop" ? (e.freeT > 0 ? 1.22 : 1.08) : 0.82;
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
        const tgt = G.carrier || (G.qbImprov ? G.ball.holder : null);
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
        // scramble rally: a man defender whose receiver has FINISHED his
        // route plasters off and closes on the improvising QB
        if (G.qbImprov && (!e.coverSlot || !G.players.some((p) => p.role === e.coverSlot &&
          p.state === "route" && p.path && p.pathI < p.path.length))) {
          pursue(e, G.ball.holder, sp * 0.92, dt); break;
        }
        let tgt = null;
        if (e.coverSlot) tgt = G.players.find((p) => p.role === e.coverSlot);
        if (!tgt) { // free safety: keep depth over the deepest threat
          const rec = eligible().sort((a, b) => b.x - a.x)[0];
          const minDepth = xAtYd(G.losYd) + 90;
          tgt = rec ? { x: Math.max(minDepth, rec.x + 34), y: (rec.y + MID) / 2 } : { x: xAtYd(G.losYd) + 220, y: MID };
          moveToward(e, tgt, sp * 0.95, dt); break;
        }
        // trail technique: near-hip leverage, but human — a step slow to
        // mirror, so a crisp route break buys the receiver real separation.
        // QA balance fix: coverage used to mirror the receiver frame-perfectly
        // through his break, so no route ever separated downfield and every
        // deep window read as high-risk. Real corners react to a break a beat
        // late: when the receiver hits a route waypoint (pathI advances) the
        // defender keeps driving toward the receiver's PRE-BREAK trajectory
        // for ~0.55s before re-mirroring. That beat is the throwing window.
        if (e.coverLagT > 0) e.coverLagT -= dt;
        const brkI = tgt.state === "route" ? (tgt.pathI || 0) : -1;
        if (brkI >= 0 && e.coverLastBrkI != null && brkI !== e.coverLastBrkI) {
          // DIFFICULTY IS THE REACTION, not the legs (RB source §6): easier
          // tiers keep driving the stale stem longer after a route break
          e.coverLagT = diff().coverLag;
          // stale read: where the pre-break stem was taking the receiver
          const la = e.coverLagT * 0.82;
          e.coverStale = { x: tgt.x + tgt.vx * la, y: tgt.y + tgt.vy * la };
        }
        e.coverLastBrkI = brkI;
        if (e.coverLagT > 0 && e.coverStale) { moveToward(e, e.coverStale, sp * 0.92, dt); break; }
        // QA balance: the trail spot used to be DOWNFIELD of the receiver
        // (tgt.x + range), which parked the DB between the receiver and every
        // catch point — all arrivals were contested, no route ever won. Real
        // trail technique sits on the hip a step toward the QB; the DB is in
        // phase to tackle at the catch but must play THROUGH the receiver to
        // break it up. Deep shots are still policed by the free safety and
        // breakOnBall.
        // DIFFICULTY IS THE CUSHION (RB source §6 lerp(10,40,diff)): the DB
        // trails at a tier-set distance toward the QB. The VETERAN anchor was
        // deliberately WIDENED (22→28px effective) so most arrivals are clean
        // catches with the duel reserved for genuinely tight throws.
        moveToward(e, { x: tgt.x - coverCushion(e, tgt), y: tgt.y }, sp * 0.99, dt);
        break;
      }
      case "zone": {
        if (G.ball.mode === "air" && breakOnBall(e, sp, dt)) break;
        if (G.ball.mode === "loose") { moveToward(e, G.ball, sp, dt); break; }
        if (G.carrier) { pursue(e, G.carrier, sp * 1.0, dt); break; }
        // scramble rally: underneath zones collapse on the improvising QB;
        // safeties keep the deep lid so the late bomb still gets punished
        if (G.qbImprov && e.role !== "S") { pursue(e, G.ball.holder, sp * 0.9, dt); break; }
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
          // The fullback's pancake is a ONE-PER-PLAY beat now. It used to be a
          // raw `threat.staggerT = 0.9; e.staggerT = 0.35;` with no latch and
          // no str/blk/tkl input, and the two halves fed each other: the
          // self-freeze early-returned the FB at updateEntity's stagger gate,
          // so he skipped this branch for 0.35s and then re-ran it, while the
          // threat filter above (`p.staggerT <= 0`) excludes the man he just
          // froze — so he simply walked to the NEXT one. Measured by counting
          // pancakes at this exact site over five seeded 12-play samples of
          // hand-built lead-block geometry: up to 3 defenders frozen at once
          // (1.75 pancakes per play on the worst seed) and 0.32-6.55s of FB
          // self-freeze; after the latch it is at most 1 per play and 0.00s of
          // self-freeze on every seed. Scope is narrow and worth stating
          // plainly: `fb: true` lives only on the SIG_ARCHETYPES power_toss /
          // tush_push, so it needs a franchise that has one, a fullback on the
          // field, and the card to be offered — it is not an ordinary run and
          // it cannot softlock. But it IS the marquee play the player
          // deliberately chose, which makes it the most visible instance of the
          // rigid-body symptom LESSON #1 was written about. The pancakeDone
          // latch (reset per snap in snap(), beside punchedThisPlay/pressDone)
          // keeps the spectacle exactly once, and dropping the FB's own freeze
          // lets him keep escorting the carrier instead of re-arming.
          if (dist(e, threat) < bodyContactRange(e, threat, 2) && !e.pancakeDone) {
            e.pancakeDone = true;
            threat.staggerT = Math.max(threat.staggerT || 0, 0.9);
            sfx.tackle();
          }
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
          // You can't stalk-block a flying dino. Dropping the target used to
          // leave e.blockHold set, and blockHold is a persistent ACCUMULATOR,
          // not a per-target timer: the cap below is
          // clamp(0.9 + (str delta)/40, 0.45, 1.7), so a retained hold can
          // already exceed the NEXT defender's cap and that block dies on
          // frame one — handing a fresh defender freeT = 1.0 for a block that
          // never happened. Verified with a hand-built rep (blockHold 0.80,
          // target made to soar, one frame stepped): the value survived the
          // break before this line existed, and is 0 after. Keying the
          // accumulator to the rep is what LESSON #20 asks of an accumulation
          // model — every detach path clears its own state.
          if (b2.soarT > 0) { e.block = null; e.blockHold = 0; break; }
          // shadow the defender on the side between him and the ball carrier,
          // then stalk him. The move and the contact response now live in
          // stalkBlock() so a climbing O-lineman uses the same three pieces; the
          // measurements that shaped them are recorded here, where they were made.
          // STALK BLOCK: bump and slide, never a hard freeze. This used to
          // read `if (b2.staggerT <= 0) b2.staggerT = 0.12`, and that guard
          // did NOT prevent a continuous freeze — it re-stamped on every
          // decay. buildPlayers pushes offense into G.players before defense
          // and updateEntity walks that array in order, so the receiver
          // re-stamped 0.12 before the defender's own update ever reached the
          // stagger gate near the top of updateEntity (`e.staggerT -= dt;
          // e.vx = e.vy = 0; return;`). The defender never got one free
          // frame — which also made the velocity damp on this very line dead
          // code. Measured on four seeded 19-play run samples: 35-59% of
          // stalk-contact frames at exactly vx===0 && vy===0, worst unbroken
          // pin 94 frames (1.57s), and 10-28 of every 15-39 blocked
          // defenders held past 2 consecutive frames. buildPlayers puts
          // WR1/WR2/WR3/TE in `runblock` on every run play, so this fired on
          // every carry. Now the damp is live, plus a small rating-scaled
          // nudge off the carrier's path — 8-46 px/s against a ~91 px/s top
          // speed, a shove and not the 180px/s wall LESSON #14 calls out.
          // Separation itself belongs to the contact solver's soft live mode:
          // a block must cost the defender ground and tempo, not turn him
          // into a statue that cannot spin off (LESSON #1). Post-fix the same
          // seeds read 0-6.5% frozen frames, and blocks still WORK — the
          // blocked defender's closest approach to the carrier is unchanged
          // or farther, so this removes the weld, not the block.
          // stalk blocks obey the trench rules too: strength decides how long
          // the pin lasts, and nothing stays blocked past 1.7 seconds
          stalkBlock(e, b2, sp, dt);
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
        if (G.carrier && G.carrier.team === e.team) {
          // WHAT WAS BROKEN: a teammate with no assignment drifted toward
          // { x: carrier.x + 30, y: e.y } — thirty pixels IN FRONT of the ball,
          // on his own y, at half speed. On a handoff the quarterback keeps
          // state "idle" (becomeCarrier deliberately skips role QB), he aligns
          // at MID while the back aligns at MID+18.7, and their body radii sum
          // to 30 — so their footprints already overlap at the snap. He then
          // jogged into the runner's path and could never clear it, because he
          // manages ~50 px/s against the back's 91.8. Measured on the blocking
          // bench (tests/blocking_bench.js, seed 4242, 160 carries): the first
          // body in the carrier's straight-ahead corridor was his OWN player on
          // 100% of carries at +0.1s, +0.3s AND +0.5s — an OL 160/160 at +0.3s
          // and the QUARTERBACK 160/160 at 10px at +0.5s — and the carrier was
          // wedged into a teammate on 92.4% of his carry frames.
          // THE FIX: an unassigned teammate may still run ahead of the ball,
          // but never in the ball's path. While his body overlaps the runner's
          // line he gives ground and steps off it at real running speed; once
          // he is clear he resumes the old lazy drift. Nothing freezes and no
          // speed is buffed — the solver still owns separation (LESSON #1).
          const clear = bodyContactRange(e, G.carrier, 6);
          const dy = e.y - G.carrier.y;
          const inLane = Math.abs(dy) < clear;
          const ty = inLane ? G.carrier.y + (dy >= 0 ? clear : -clear) : e.y;
          moveToward(e, { x: G.carrier.x + (inLane ? -30 : 30), y: clamp(ty, TOP + 6, BOT - 6) },
            sp * (inLane ? 0.9 : 0.5), dt);
        }
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
          if (blockBeatExempt(a, b)) continue;
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
  function settleContactVelocity(a, b, nx, ny, scale) {
    // Keep positional correction from turning into a visible frame-by-frame
    // buzz.  We only erase the component moving INTO the other body; tangential
    // motion remains, so route releases and pursuit angles still feel alive.
    // `scale` < 1 turns the settle into a glancing bump instead of a wall.
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    const closing = rvx * nx + rvy * ny;
    if (closing >= 0) return;
    const ia = 1 / Math.max(0.01, bodyMass(a));
    const ib = 1 / Math.max(0.01, bodyMass(b));
    const impulse = (-closing * 0.72 * (scale == null ? 1 : scale)) / (ia + ib);
    a.vx -= nx * impulse * ia; a.vy -= ny * impulse * ia;
    b.vx += nx * impulse * ib; b.vy += ny * impulse * ib;
  }
  // Firm separation (bodies never overlap) is only worth its rigidity where a
  // clean read matters: pre-snap spacing and a loose-ball scrum.  During live
  // line play it makes every body an impenetrable wall — the pocket becomes
  // an unbeatable cage and a defender can body-block a runner without
  // tackling.  There, contact is a GRAPPLE instead: like real linemen, bodies
  // grab into each other with substantial partial overlap and hand-fighting.
  // The ball-in-air moment gets its own CONTESTED mode (see below): partial
  // overlap so both players can crowd the catch point, but split evenly so
  // neither side can bulldoze the other off the spot.
  function contactFirm() {
    if (G.state === "presnap") return true;
    if (G.state !== "live") return true;      // menus, QA scenes, replay, unit tests
    return G.phase === "loose";
  }
  // A rusher who has beaten his block earns a real lane THROUGH the line to the
  // ball: the O-line stops hard-walling him for the brief window after the shed.
  // This is what lets an edge rusher actually get home instead of being pinned
  // to a blocker's hip forever.
  function blockBeatExempt(a, b) {
    const r = (a.freeT > 0 && a.state === "rush") ? a : (b.freeT > 0 && b.state === "rush") ? b : null;
    if (!r) return false;
    const o = r === a ? b : a;
    return o.team !== r.team && (o.state === "block" || o.state === "runblock");
  }
  // mode: undefined/falsy = FIRM (full separation), "grapple" = live line
  // play (deep partial overlap + hand-fighting), "contested" = ball in the
  // air (partial overlap, EVEN split so nobody bulldozes the catch point).
  function resolveBodyContacts(players, iterations, settleVelocity, pushFrac, mode) {
    const frac = pushFrac == null ? 1 : pushFrac;
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
          // A freed rusher slips through the blockers he already beat.
          if (blockBeatExempt(a, b)) continue;
          const fullD = bodyContactRange(a, b);
          // GRAPPLE/CONTESTED modes shrink the enforced distance so bodies
          // genuinely interlock — NFL linemen grab into each other's pads,
          // they don't bounce off a force field.  Only the deepest overlap is
          // corrected; everything shallower than the grapple depth is legal
          // hand-fighting territory.
          let minD = fullD;
          if (mode === "grapple") minD = fullD * (a.team === b.team ? 0.42 : 0.58);
          else if (mode === "contested") minD = fullD * 0.62;
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = dx * dx + dy * dy;
          const engagedPair = a.engaged === b || b.engaged === a;
          // Hand-fighting: an engaged block pair visibly pushes and pulls
          // along the contact axis even at legal depth — the pair works,
          // it doesn't stand frozen at equilibrium.
          if (mode === "grapple" && engagedPair && d2 < fullD * fullD && d2 > 0.0001) {
            const dd = Math.sqrt(d2), fnx = dx / dd, fny = dy / dd;
            const fight = Math.sin(G.playT * 8.5 + (a.bodyId * 2.1)) * 0.55;
            a.x -= fnx * fight; a.y -= fny * fight * 0.5;
            b.x += fnx * fight; b.y += fny * fight * 0.5;
          }
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
          let overlap = (minD - d) * frac;
          if (mode) overlap = Math.min(overlap, 2.5);
          // Share of the correction each body absorbs.  FIRM keeps the
          // physical inverse-mass split.  CONTESTED splits evenly — a heavier
          // or faster defender can NOT bulldoze the receiver off the catch
          // point (and vice versa); both crowd the spot.  GRAPPLE biases the
          // split toward the OFFENSE: this is an offense-first football game,
          // so blockers and route runners move defenders more than they get
          // moved. Same-team traffic splits evenly and shallowly.
          let shareA, shareB;
          if (mode === "contested" || (mode && a.team === b.team)) {
            shareA = 0.5; shareB = 0.5;
            // A BLOCKER GETS OUT OF HIS OWN RUNNER'S WAY. Same-team traffic split
            // the correction evenly, so the ball carrier absorbed half of every
            // bump from his own linemen — and on a run that is not an edge case:
            // measured on the blocking bench (seed 4242, 160 carries) the carrier
            // is inside a teammate's body on 85-92% of his carry frames, because
            // the hole is a 40-50px crease and five blockers are working in it. At
            // a 2.5px overlap cap and pushFrac 0.5 an even split can cost him more
            // than a pixel a frame, every frame — 60+ px/s of drag against a 91.8
            // px/s top speed, applied by his OWN team. This is exactly the
            // symmetric code LESSON #17 says hides a defense bias, so the man
            // WITHOUT the ball yields. Nothing about firmness, the three contact
            // modes, or the same-team grapple depth changes (LESSON #1): only who
            // absorbs a correction that was already being applied.
            if (mode && a.team === b.team && G.carrier) {
              if (G.carrier === a) { shareA = 0.1; shareB = 0.9; }
              else if (G.carrier === b) { shareA = 0.9; shareB = 0.1; }
            }
          } else if (mode === "grapple") {
            shareA = a.team === "off" ? 0.32 : 0.68;
            shareB = 1 - shareA;
            // A BALL CARRIER IN A WRAP IS THE MAN DRIVING, SO HE STOPS PAYING THE
            // SEPARATION TAX. Same defect and same fix as the same-team clause
            // directly above, found the same way.
            // The grappler RIDES the carrier to bodyContactRange * 0.58 every
            // frame (updateEntity's grapT block), which is exactly `minD` for a
            // cross-team grapple pair. So the wrap parks a body on the carrier's
            // downfield face, the carrier then drives INTO it, and that overlap is
            // corrected against him — 0.32 of it, every frame, once per defender
            // in the pile. Instrumented per frame on the blocking bench with the
            // finish rate already slowed to 17 frames of grind: the carrier's own
            // movement was +0.49 yd and the solver took -0.33 yd of it straight
            // back, 67% of his forward progress, scaling with every frame of grind
            // added. That is the term that made a longer takedown pointless.
            // The tackle is already priced twice — the accumulator says when he
            // goes down, wrapDrive says how fast he moves while held — so charging
            // him a third time in the physics solver is double counting, and it is
            // why contact read as "processed" instead of "fought". The defenders
            // in the pile absorb it instead: that IS moving the pile, and the
            // accumulator still bounds how long he gets to.
            // NOTHING about firmness, contact mode or grapple depth changes
            // (LESSON #1) — minD, the 2.5px overlap cap and pushFrac are all
            // untouched. Only who absorbs a correction that was already applied.
            if (G.carrier && G.carrier.grappledT > 0 && a.team !== b.team &&
                (G.carrier === a || G.carrier === b)) {
              if (G.carrier === a) { shareA = 0.04; shareB = 0.96; }
              else { shareB = 0.04; shareA = 0.96; }
            }
          } else {
            const ia = 1 / Math.max(0.01, bodyMass(a));
            const ib = 1 / Math.max(0.01, bodyMass(b));
            shareA = ia / (ia + ib); shareB = 1 - shareA;
          }
          a.x -= nx * overlap * shareA; a.y -= ny * overlap * shareA;
          b.x += nx * overlap * shareB; b.y += ny * overlap * shareB;
          if (settleVelocity && pass === 0) {
            settleContactVelocity(a, b, nx, ny, mode ? (a.team === b.team ? 0.1 : 0.22) : 1);
          }
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
    const firm = contactFirm();
    if (firm) {
      // Contested/static moments: fully separate so a jump ball, a snap
      // formation, or a loose-ball scrum reads with zero body overlap. The
      // torso solve and exact-sprite solve are alternated so a tail/horn nudge
      // that pushes a third dino a fraction into its radius is repaired before
      // the renderer sees it.
      for (let cycle = 0; cycle < 6; cycle++) {
        resolveBodyContacts(players, cycle === 0 ? 16 : 6, cycle === 0, 1);
        if (!resolveVisualSpriteContacts()) break;
      }
    } else if (G.phase === "air") {
      // CONTESTED: the ball is up. Partial overlap is allowed (both players
      // can genuinely crowd the catch point) but the enforced core keeps them
      // readable as two bodies, and the split is EVEN — positioning at the
      // spot is earned by the route and the leap, never by physics shoving.
      resolveBodyContacts(players, 1, false, 0.5, "contested");
    } else {
      // GRAPPLE: live line play / pursuit. Bodies interlock like real
      // linemen — legal partial overlap down to the grapple core, weak
      // capped corrections beyond it, hand-fighting on engaged pairs, and an
      // offense-biased share so blocks and runs move the defense. Blocks are
      // won/lost by the block AI's hold timers, tackles by the tackle check —
      // never by physics walls.
      resolveBodyContacts(players, 1, true, 0.5, "grapple");
    }
  }

  // STALK BLOCK, shared by the receivers and by an O-lineman who has climbed to
  // the second level: get between your man and the ball, then cost him ground and
  // tempo without welding him in place. Lifted verbatim out of case "runblock" so
  // there is ONE implementation of the damp + rating-scaled shove + strength-scaled
  // hold cap. The long history of why each of those three pieces reads the way it
  // does is documented at the call site in case "runblock"; the short version is
  // LESSON #1 (a block costs the defender ground and tempo, it does not turn him
  // into a statue) and LESSON #14 (the shove is 8-46 px/s against a ~91 px/s top
  // speed — a shove, not a wall).
  // Turn a blocked pair OUT of the run lane, moving BOTH bodies by the same
  // amount. Moving both is the whole trick: the grapple overlap is unchanged, so
  // the contact solver has nothing to undo and this works WITH the soft-contact
  // contract instead of fighting it (LESSON #1). That is why it moves the number
  // where ROADMAP attempts 1 and 2 did not — aiming through the man, then shoving
  // the rusher alone, both of which the solver and his own pursuit simply erased
  // (0.07 and 0.29 yd). It is applied EVERY frame off the CURRENT lane, which is
  // what attempt 4 lacked: an engaged blocker re-aims at his man every tick, so a
  // one-time alignment change is gone within a few frames (0.57 yd). Bounded at
  // both ends — the turn stops as soon as the defender's inside face clears
  // RUN_LANE_HALF, so a crease never becomes a boulevard, and the rate is blk vs
  // str with hard px/sec limits rather than a roll (LESSON #15, LESSON #19).
  function driveOutOfLane(blocker, man, lane, dt) {
    const off = man.y - lane;
    if (Math.abs(off) >= RUN_LANE_HALF + bodyRadius(man)) return;
    // dead even: he works his man toward the side he lined up on
    const side = off === 0 ? ((blocker.lineOffset || 0) >= 0 ? 1 : -1) : (off > 0 ? 1 : -1);
    const drive = clamp(RUN_DRIVE_BASE +
      ((blocker.blk || blocker.str || 75) - (man.str || 80)) * RUN_DRIVE_PER_PT,
      RUN_DRIVE_MIN, RUN_DRIVE_MAX) * dt;
    const y0 = man.y;
    man.y = clamp(man.y + side * drive, TOP + 10, BOT - 10);
    blocker.y = clamp(blocker.y + side * drive, TOP + 10, BOT - 10);
    // Carry the tether anchor along with the drive, or the block sheds itself.
    // blockShedCheck() measures drift from the world point where the grapple began
    // against a ~38px run tether, and this turn moves the pair up to
    // RUN_LANE_HALF + a body radius — so displacement the BLOCKER created was being
    // read as the rusher escaping him, and merged run engagements ran 1.07s against
    // a ~1.75s nominal grind. In the decoded source the tether is a distance
    // between the two men in the grapple (RETRO_BOWL_MECHANICS §3, "a ~12px
    // distance tether break"), not a leash to a spot on the turf, so only the
    // rusher's OWN movement should spend it.
    if (man.blockLatchY != null) man.blockLatchY += man.y - y0;
  }

  // Pass `lane` (the run crease) and the pair gets turned OUT of the crease once
  // this blocker has his man, the same way the trench drive does. He still takes
  // the shortest line TO him — trying to make him seal the crease edge instead of
  // walling his man off measured 1.34 -> 1.09 yd/carry, because he stopped
  // reaching his man at all. Getting the defender is worth more than the body the
  // blocker occupies while doing it.
  function stalkBlock(e, b2, sp, dt, lane) {
    const ref = G.carrier || { x: xAtYd(G.losYd), y: MID };
    const side = b2.x > ref.x ? -bodyContactRange(e, b2, 1) : bodyContactRange(e, b2, 1);
    moveToward(e, { x: b2.x + side, y: b2.y }, sp * 0.95, dt);
    if (dist(e, b2) >= bodyContactRange(e, b2, 2)) return;
    b2.vx *= 0.5; b2.vy *= 0.5;
    const shove = clamp(26 + ((e.str || 68) - (b2.str || 70)) * 0.6, 8, 46) * dt;
    const sdx = b2.x - e.x, sdy = b2.y - e.y, sm = Math.hypot(sdx, sdy) || 1;
    b2.x += (sdx / sm) * shove; b2.y += (sdy / sm) * shove;
    e.blockHold = (e.blockHold || 0) + dt;
    const cap = clamp(0.9 + ((e.str || 68) - (b2.str || 70)) / 40, 0.45, 1.7);
    if (lane != null) driveOutOfLane(e, b2, lane, dt);
    if (e.blockHold > cap) {
      e.blockHold = 0; e.block = null; e.staggerT = 0.5;
      b2.staggerT = 0; b2.freeT = 1.0;   // the defender sheds and runs free
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
  // CPU SOAR SAVE (owner play-test 2026-08-13, finding #3): the CPU
  // quetzalcoatlus safety NEVER flew — both startSoar call sites were human
  // input (mouse release on a soar aim, SHIFT), so on a breakaway the CPU
  // safety jogged a pursuit angle while the carrier walked in, and the wings
  // the owner designed were cosmetic on defense. Hook the one event that
  // means "the pursuit is beaten": the breakawayCalled latch — geometric and
  // once per play (LESSON #15/#20), so this can never become a per-frame
  // leash. The fastest-to-the-spot un-engaged CPU quetz spends his existing
  // charge (no refill) to fly at an INTERCEPT POINT — the carrier led by his
  // own velocity over the flight time, the same lead pursue() takes on foot —
  // and the landing resolves through normal checkTackles contact, so it
  // converts touchdowns into long gains sometimes, never scripts the takedown
  // (LESSON #17). A human-steered safety is never auto-launched (owner
  // keeper: playable defense, LESSON #22), and a flight that cannot beat the
  // carrier to the spot is not attempted: a truly beaten defense stays beaten
  // rather than wasting the meter on cinema.
  function cpuSoarSave(c) {
    if (!c) return false;
    let best = null, bestT = 1e9, bestTgt = null;
    for (const e of G.players) {
      if (e.team === c.team || e.species !== "quetz" || e.controlled) continue;
      if (e.blockedBy || e.grapT > 0 || e.proneT > 0 || e.staggerT > 0 || !soarReady(e)) continue;
      const fsp = e.spd * 1.9 * (G.weather ? G.weather.speedMod : 1);
      const maxT = 0.35 + (e.soarCharge || 0) * 1.35;
      // two-pass intercept estimate: aim where the carrier WILL be when the
      // wings arrive, not where he is (startSoar locks steering at takeoff)
      let t = dist(e, c) / fsp;
      t = clamp(dist(e, { x: c.x + c.vx * t, y: c.y + c.vy * t }) / fsp, 0.3, maxT);
      const tgt = { x: c.x + c.vx * t, y: clamp(c.y + c.vy * t, TOP + 4, BOT - 4) };
      if (dist(e, tgt) > fsp * maxT * 1.02) continue;   // out of wing range
      if (ydAtX(tgt.x) >= 100) continue;                // he scores before the meet
      if (t < bestT) { best = e; bestT = t; bestTgt = tgt; }
    }
    if (!best || !startSoar(best, bestTgt)) return false;
    if (G.qaTele) G.qaTele.push({ tag: "soar:save", drive: G.drive });
    return true;
  }
  // returns TRUE only if this defender actually has a play on the ball;
  // everyone else must KEEP COVERING (standing statue-still while the offense
  // runs a go route was embarrassing and is now impossible)
  function breakOnBall(e, sp, dt) {
    const b = G.ball;
    if (b.away) { e.ballAttack = false; return false; } // nobody bites on a throwaway
    // QA balance: defenders used to drive on the landing spot the FRAME the
    // ball left the QB's claw, so every arrival was contested (tele showed
    // almost zero solo catches). A human DB needs a beat to recognize the
    // throw — until then he keeps covering his man/zone.
    if ((b.t || 0) < 0.28 && !e.ballAttack) return false;
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
    // QA balance: 1.08/1.02 → 1.02/0.96 — the break on the ball should be a
    // race the intended receiver (1.06 toward the spot) can actually win;
    // a defender only beats him there off a genuine jump on the throw
    moveToward(e, target, sp * (e.role === "S" ? 1.02 : 0.96), dt);
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
      // per-game-second hazard now (LESSON #15 — the arithmetic is at
      // JUKE_RATE), plus ONE decision per closing defender. jukeCd (2.1s)
      // already blocks a repeat inside a single pass — measured dwell inside
      // 28px is only ~0.1s — so the latch only bites the long chase, where a
      // pursuer who hangs between 28 and 44px could earn a second juke the
      // moment the cooldown lapsed. Keyed to the man like punchedThisPlay,
      // freed when he drops off, and cleared at the snap so it can never
      // survive into the next play as a stale one-shot throttle (LESSON #20).
      // ONE DECISION PER CLOSING DEFENDER. The latch is now set when the
      // question is ASKED, not when the answer happens to be yes — the old code
      // only latched inside the success branch, so a failed roll simply rolled
      // again next frame and the whole thing stayed dwell-coupled despite the
      // comment claiming otherwise. Freed when he drops off past 44px, and
      // cleared at the snap so it can never survive into the next play
      // (LESSON #20).
      if (dist(n, e) > 44) {
        if (e.jukeConsidered === n.bodyId) e.jukeConsidered = null;
        if (e.stiffConsidered === n.bodyId) e.stiffConsidered = null;
      }
      if (dist(n, e) < 28 && e.jukeCd <= 0 && e.jukeConsidered !== n.bodyId) {
        e.jukeConsidered = n.bodyId;   // asked and answered, win or lose
        const jp = clamp(JUKE_P_BASE + ((e.agi || 75) - 75) * JUKE_P_PER_AGI, JUKE_P_MIN, JUKE_P_MAX);
        if (Math.random() < jp) doJuke(e);
      }
      // …and the paw is a STRENGTH gradient now, not a hard 85 cutoff
      else if (dist(n, e) < 26 && e.stiffCd <= 0 && e.stiffConsidered !== n.bodyId) {
        e.stiffConsidered = n.bodyId;
        const sp2 = clamp(STIFF_P_BASE + ((e.stiff || e.str || 75) - 75) * STIFF_P_PER_STR, STIFF_P_MIN, STIFF_P_MAX);
        if (Math.random() < sp2) startStiffArm(e);
      }
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
      // the board must assume the REAL lob hang time (throwLob's own T) —
      // the old shorter guess + 0.94 haircut aimed every ball ~0.7yd BEHIND
      // the receiver, forcing comebacks through the trail DB
      const d0 = dist(qb, rec);
      const flight = (0.55 + d0 / 470) * 0.996;
      const lead = {
        x: rec.x + rec.vx * flight,
        y: clamp(rec.y + rec.vy * flight, TOP + 10, BOT - 10),
      };
      lead.x = clamp(lead.x, qb.x - 18, qb.x + maxRange());
      const window = assessPassWindow(qb, rec, lead, flight);
      const depth = (lead.x - xAtYd(G.losYd)) / YPX;
      const targetBonus = userReceiver && rec === G.controlled ? 16 : 0;
      // Separation has value, but an open 6-yard outlet beats a "maybe"
      // 25-yard throw.  This is the core fix for AI-QB interceptions.
      // QA balance: depth 0.72 → 1.05 — with coverage now lagging at route
      // breaks, an open 10-yard dig should outscore a 2-yard flat; the risk
      // term still vetoes genuine coverage
      const score = depth * 7.5 + Math.min(window.separation, 70) * 1.22 - window.risk * 145 - window.placement * 0.28 + targetBonus;
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
    // MINIMUM HOLD: routes only earn separation at their breaks (coverLag),
    // which no receiver reaches in the first half-second — throwing before
    // then was lobbing into in-phase coverage, the "off rip" interception
    // (owner play-test 2026-08-07). Hot-route exception: a genuinely wide-
    // open short outlet may still beat a blitz early.
    const minHold = elite ? 1.35 : 1.5;
    const beforeHold = G.playT < minHold;

    const board = cpuReadBoard(qb);
    if (!board.length) { if (pressured && G.playT > 1.15) cpuThrowAway(qb); return; }
    const preferred = board.find((r) => r.rec === G.controlled);
    // DOWN & DISTANCE shape appetite: early downs live to play again;
    // 3rd-and-short tolerates a tight fit
    let safeLimit = elite ? 0.48 : 0.34;
    if (G.down <= 2 && G.toGain >= 7) safeLimit -= 0.05;
    if (G.down >= 3 && G.toGain <= 3) safeLimit += 0.06;
    const playableLimit = safeLimit + 0.07;
    let choice = board.find((r) => r.window.risk <= safeLimit) || null;
    // on 3rd-and-long, prefer a read that can actually move the sticks
    if (choice && G.down >= 3 && G.toGain > 4 && choice.depth < G.toGain) {
      const mover = board.find((r) => r.window.risk <= safeLimit && r.depth >= G.toGain &&
        r.score >= choice.score - 10);
      if (mover) choice = mover;
    }
    if (beforeHold && choice && !(pressured && choice.depth <= 4 && choice.window.risk < 0.14)) choice = null;
    // When a player is running a receiver, feed that route if it is genuinely
    // comparable to the best read. The CPU no longer forces it into coverage.
    if (!beforeHold && preferred && preferred.window.risk <= playableLimit && (!choice || preferred.score >= choice.score - 13)) choice = preferred;
    const mustThrow = G.playT > (elite ? 2.9 : 2.7) * diff().cpuThink || (pressured && G.playT > (elite ? 1.72 : 1.6));

    if (choice && (choice.window.risk <= safeLimit || mustThrow && choice.window.risk <= playableLimit)) {
      // RELEASE RE-GATE: the world moved since the board was built — if the
      // window degraded past playable, pump and re-read next tick
      const finalRead = assessPassWindow(qb, choice.rec, choice.lead,
        (0.55 + dist(qb, choice.lead) / 470) * 0.996);
      if (finalRead.risk > playableLimit + 0.06 && !mustThrow) return;
      const savedAcc = qb.acc;
      if (elite) qb.acc = Math.max(qb.acc, 92);
      G.aim = choice.lead;
      const quick = choice.depth <= 9 && choice.window.risk < 0.34 && !inFace;
      // arc matches depth: touch passes fly flat, deep shots get the rainbow
      G.slingPull = clamp(0.4 + choice.depth / 30, 0.45, 1.0);
      if (quick) throwBullet(choice.rec); else throwLob(choice.rec);
      G.slingPull = null;
      qb.acc = savedAcc;
      return;
    }
    // CHECKDOWN LADDER: nothing downfield under the gate — take the open
    // outlet instead of force-feeding the least-bad deep ball
    if (!choice && !beforeHold && G.playT > (elite ? 1.8 : 2.0)) {
      const dump = board.filter((r) => r.depth <= 8 && r.window.risk <= 0.30)
        .sort((a, b) => b.window.separation - a.window.separation)[0];
      if (dump) {
        G.aim = dump.lead;
        G.slingPull = 0.5;
        throwBullet(dump.rec);
        G.slingPull = null;
        return;
      }
    }

    // A scripted protection loss can only finish when a rusher is actually
    // in the pocket. It is a pressure cue, not permission for the CPU to
    // hold the ball while an easy outlet is available.
    if (qb.sackDoom && pressured && G.playT >= qb.sackAt && (!choice || choice.window.risk > playableLimit) && inFace) {
      const sacker = nearbyRush[0];
      G.carrier = qb; qb.canPass = false;
      announce("sack", sacker && sacker.name);
      if (sacker) { addStat(sacker, "sacks"); addStat(sacker, "tkl"); }
      G.shake = Math.max(G.shake, 0.25); fxChunks(qb.x, qb.y + 2, 6); impactMoment(0.06, 0.12, 0.45);
      sfx.tackle(); playDead("SACKED!", null, false);
      return;
    }
    if (mustThrow) {
      // athletic QBs pull it down FIRST; the throwaway is the last resort
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
      // FIRST TOUCH, stamped from geometry alone. The grind ramp below is the
      // hard guarantee behind LESSON #23's one-second takedown budget, and it is
      // only as good as the moment it starts counting from. Stamped inside the
      // wrap branch it missed every frame the loop skipped for another reason —
      // a defender still `blockedBy` and not yet at true overlap, the 0.40s
      // catch grace, a tackleCd — so a carrier could be in among bodies for half
      // a second before the clock even started, and a measured play ran 1.39s
      // from first contact to the whistle with the ramp never engaging. This is
      // the same body-range test the blocking bench uses to define first contact,
      // so the clock and the metric now start on the same frame.
      if (c.firstContactT == null) {
        for (const q of G.players) {
          if (q.team === c.team || q.proneT > 0) continue;
          if (dist(q, c) <= bodyContactRange(q, c, 0)) { c.firstContactT = G.playT; break; }
        }
      }
      // --- peanut punch resolves FIRST with a generous strike range, so a
      // wound-up swing actually connects instead of losing to the wrap-up
      for (const e of G.players) {
        if (e.team === c.team || e.staggerT > 0 || e.proneT > 0) continue;
        // AI defenders RARELY go for the strip instead of a clean tackle —
        // a real punch-out is a rare, high-risk play, not every rep. Once per
        // play, per defender, and only a small fraction of the time.
        if (!e.controlled && e.punchCd <= 0 && e.punching <= 0 && !e.punchedThisPlay) {
          const dd0 = dist(e, c);
          // WHAT WAS BROKEN: this was `Math.random() < dt * 0.02` evaluated on
          // EVERY frame the defender sat in the 18-40px strike band. That is a
          // per-frame probability roll (LESSON #15), and its real rate is set
          // by DWELL TIME — so strip attempts were coupled to how long contact
          // lasted. Measured dwell: mean 8.4 frames, max 45. The consequence is
          // that ANY change lengthening the grind raises the fumble rate on its
          // own, with the fumble gate itself untouched: three independent
          // tackle-model rewrites each took turnovers from 0.14% to 0.49-0.76%
          // per carry, and all three mistook it for their own doing.
          //
          // Now the decision is made ONCE per defender per play, the frame he
          // enters strike range, and stays decided (punchRolled is latched for
          // the play and cleared in snap(), LESSON #20). A strip attempt is a
          // property of the play, not of how long the tackle takes.
          if (dd0 > 18 && dd0 < 40 && !G.punchDrawn) {
            G.punchDrawn = true;
            if (Math.random() < AI_PUNCH_P) {
              e.punchedThisPlay = true;
              timedJump(e);
              startPunch(e);
            }
          }
        }
        if (e.punching > 0 && (e.jumpT > 0 || e.soarT > 0) && dist(e, c) < 26 && !(G.ramp && G.ramp.ent === c)) {
          e.punching = 0; e.punchCd = 1.1;
          for (let s2 = 0; s2 < 6; s2++) G.parts.push({ x: c.x + rnd(-6, 6), y: c.y - 12 + rnd(-6, 6), z: 8, vx: rnd(-60, 60), vy: rnd(-40, 40), vz: rnd(20, 70), t: 0.3, puff: true });
          // human punch is timing-based & reliable; an AI strip is a long shot
          const timing = clamp(1 - Math.abs((e.punchDist == null ? 60 : e.punchDist) - 30) / 42, 0, 1);
          let odds = e.controlled
            ? 0.22 + timing * 0.5 + ((e.str || 75) - 75) / 250
            : 0.10 + ((e.str || 75) - 75) / 600;   // AI: low base, small strength bonus
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
        // an ENGAGED (blocked) defender only tackles at true body overlap —
        // no reach pads, no solver latches. The trench pile at the LOS was
        // auto-downing scrambling QBs who merely ran past it
        // (owner play-test 2026-08-07: "downed for no reason").
        if (e.blockedBy && dc > bodyContactRange(e, c, 0)) continue;
        const evx = e.contactVx == null ? e.vx : e.contactVx;
        const evy = e.contactVy == null ? e.vy : e.contactVy;
        const cvx = c.contactVx == null ? c.vx : c.contactVx;
        const cvy = c.contactVy == null ? c.vy : c.contactVy;
        const impactClosing = ((evx - cvx) * (c.x - e.x) + (evy - cvy) * (c.y - e.y)) / Math.max(1, dc);
        // arrival must be the DEFENDER's own doing: his drive toward the
        // ball, true overlap, or fresh contact he initiated — never just the
        // carrier's velocity making a statue "arrive"
        const defDrive = (evx * (c.x - e.x) + evy * (c.y - e.y)) / Math.max(1, dc);
        // A defender who has already turned away must not magically tackle
        // just because a separation solve left him brushing the carrier.
        const recentCarrierContact = e.carrierContact ||
          (e.carrierContactAt != null && G.playT - e.carrierContactAt < 0.16);
        const actuallyArriving = dc <= bodyContactRange(e, c, 1.5) || defDrive > 6 ||
          (recentCarrierContact && !e.blockedBy);
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
          // Is THIS contact inside the 0.40s post-catch grace window? Computed up
          // front so the escape branches below can decline to SPEND a resource on
          // a contact that the window is about to wave off. It deliberately does
          // NOT skip those branches wholesale.
          //
          // The obvious fix — hoisting the whole bail up here, above the escape
          // branches — was tried first and is WRONG. A juke, a truck or a shed
          // that fires RESOLVES the contact by staggering the tackler and
          // `continue`s, so it never reached the late bail in the first place;
          // notably `shedCharges` (below) is consumed unconditionally whenever a
          // charge remains. Hoisting therefore suppressed the ENTIRE contact for
          // the full window instead of just protecting the resource: the tackler
          // was no longer pushed off, real takedowns were pushed past the window,
          // and it broke both the hard-hit fumble path and the tackled->getup
          // chain. Measured, not guessed — test_all #15 and the E3 getup
          // assertion both went red, and a stable 3-run baseline proved they were
          // not flakes.
          //
          // What actually leaked is narrower: only the branches that spend a
          // resource and then FAIL. On a failed truck roll (truckP clamped
          // 0.25-0.40, so ~2/3 of tries), a failed YAC roll (0.25-0.48, ~60%),
          // or a LOST stiff-arm contest, the charge or the player's timed input
          // was consumed and then the contact was waved off with no stagger, no
          // shake and no sound — nothing sets tackleCd on that path either, so
          // nothing limited the bleed. That is the LESSON #19 violation ("the
          // player can always see WHY"), and it fired on exactly the play the YAC
          // passive advertises: completeCatch stamps catchT and becomeCarrier
          // grants the charges in the SAME tick, while a trailing DB parked at
          // coverCushion ~28px is already inside a ~26px body contact range.
          //
          // `shedCharges` is intentionally NOT guarded: it always applies
          // staggerT 0.9 + shake + sound before continuing, so it is never spent
          // silently. The late bail stays exactly where it was.
          const inGrace = c.catchT != null && G.playT - c.catchT < 0.40 && e.diveT <= 0 && e.soarT <= 0;
          if (c.jukeT > 0) {
            e.staggerT = 0.8; e.grapT = 0; e.grappling = null;   // juked out of the wrap
            c.tackleAcc = Math.max(0, (c.tackleAcc || 0) - 30);
            sfx.juke(); continue;
          }
          // Truckstick has two strength-based tries per carry, rather than
          // two guaranteed sheds. Even a dominant back is never automatic.
          if (c.truckCharges > 0 && !inGrace) {
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
          if (c.apex && c.passive === "yac" && c.yacCharge > 0 && !inGrace) {
            c.yacCharge = 0;
            const yacP = clamp(0.34 + ((c.agi || 75) - (e.agi || 75)) / 180, 0.25, 0.48);
            if (Math.random() < yacP) { e.staggerT = 0.85; sfx.juke(); continue; }
          }
          // TIMED STIFF-ARM contest: the player armed a stiff-arm, so it's a
          // strong strength-vs-strength shove. Win = the tackler is planted.
          if (c.stiffT > 0 && !inGrace) {
            c.stiffT = 0;
            if ((c.stiff || c.str || 75) + rnd(0, 26) > (e.str || 75) + rnd(0, 26)) {
              shrugOffTackle(c, e, 0.9);
              continue;
            }
          }
          // (no per-arrival cooldown any more: the RB takedown model keeps
          // the grappler ENGAGED, pouring every frame — escape paths set
          // their own cooldowns when they physically shed him)
          // HARD HIT: a well-timed dive/flight arriving fast and strong can
          // jar the ball loose — or leave a fresh-catch receiver seeing stars
          const closing = impactClosing;
          // The hit travels where the DEFENDER's momentum is taking him, so a
          // tackle can come from any direction rather than always folding to
          // one side. The controlled defender can additionally steer it with
          // the movement stick/keys — even back against his own momentum, which
          // still lands but with far less drive behind it.
          const evx = e.contactVx == null ? e.vx : e.contactVx;
          const evy = e.contactVy == null ? e.vy : e.contactVy;
          const cvx = c.contactVx == null ? c.vx : c.contactVx;
          const cvy = c.contactVy == null ? c.vy : c.contactVy;
          let hx = evx, hy = evy;
          if (e.controlled) { const k = kdir(); hx += k.x * 60; hy += k.y * 60; }
          const hlen = Math.hypot(hx, hy);
          const hitVec = hlen > 8 ? { x: hx / hlen, y: hy / hlen } : null;
          // Momentum alignment: a big defender driving THROUGH the ballcarrier
          // in the same direction the carrier is running (a de-cleater from
          // behind or square-on) is what strips the ball in the real NFL —
          // uncommon, but it happens. Hits from the side or against the
          // carrier's grain rarely do.
          const eSpeed = Math.hypot(evx, evy), cSpeed = Math.hypot(cvx, cvy);
          const align = cSpeed > 4 && eSpeed > 4
            ? (evx * cvx + evy * cvy) / (eSpeed * cSpeed) : 0;   // -1..1
          // eDrive = the defender's OWN speed aimed at the ball carrier. It is
          // the physical engine of the hit: large positive means charging in
          // with momentum, ~0 means flat-footed, negative means lunging back
          // against his own run. It drives knockback distance, tackle odds,
          // and part of the strip chance.
          const eDrive = (evx * (c.x - e.x) + evy * (c.y - e.y)) / Math.max(1, dc);
          // A DE-CLEATER IS AN ARRIVAL, NOT A FINISH. bigDrive tests the
          // carrier's own speed against 0.45 of his top end — and a wrapped
          // carrier used to be pinned at a flat 0.42, i.e. permanently just under
          // that line, so during a grapple bigDrive was effectively off. Giving
          // the carrier real leg drive below pushed him over it and the flag came
          // on for every frame of every wrap: measured, "FLATTENED!" went from 8%
          // of carries to 39%, and because hardHit is also an input to the
          // ball-strip check at takedown, a tuning pass on the RUN GAME was
          // quietly turning up the fumble pressure. Neither was intended and
          // neither is football: a de-cleater is a defender arriving with
          // momentum into a runner who is still running free; once he is wrapped
          // it is a grind, not a blast. The window is the first tenth of a second
          // of the wrap rather than literally frame one, so a second man arriving
          // into the same collision can still blow it up — gating on frame one
          // alone cut "FLATTENED!" to 1%, well under the 8% it started at.
          // c.hardHitTaken already latches the flag for the frame it fires on,
          // and that is what the takedown presentation reads, so a play that
          // STARTS with a de-cleater still ENDS "FLATTENED!".
          const bigDrive = (e.str || 75) >= 84 && eSpeed > c.spd * 0.55 &&
            cSpeed > c.spd * 0.45 && align > 0.4 && (c.wrapClock || 0) <= 0.12;
          // Dive momentum is partially spent turning into the tackle, so the
          // closing threshold must be attainable after the approach step.
          // This also fixes the visible "arrived but missed" CPU tackle.
          const hardHit = (closing > 56 && (e.str || 75) >= 76 && (e.diveT > 0 || e.soarT > 0)) || bigDrive;
          // freshCatch is the WIDER 0.6s "ball isn't tucked yet" window that only
          // tryStripAtTakedown prices — it is not a bail. The 0.40s tackle-grace
          // bail that used to sit right here now runs at the TOP of this block,
          // above the escape branches (its QA history stays on it: 0.22 -> 0.40,
          // because completions were dying for 0 YAC).
          const freshCatch = c.catchT != null && G.playT - c.catchT < 0.6;
          if (c.catchT != null && G.playT - c.catchT < 0.40 && e.diveT <= 0 && e.soarT <= 0) { continue; }
          // an arm tackle on a back moving at full clip mostly bounces off —
          // you bring him down with a dive, a wrap at an angle, or numbers
          const fullClip = !G.playPass && Math.hypot(c.vx, c.vy) > c.spd * 0.7 && e.diveT <= 0 && e.soarT <= 0;
          // Momentum term: charging into the carrier makes the tackle stick;
          // trying to wrap up while moving AWAY from him (a whiffed overrun, a
          // backward lunge) is barely a tackle at all. This is what makes an
          // against-the-grain hit weak instead of a free takedown.
          const driveP = clamp(eDrive / 300, -0.2, 0.12);
          let p = (fullClip ? 0.38 : 0.52) + (e.tkl - c.agi) / 160 - ((c.str || 75) - 75) / 320 + (e.diveT > 0 ? 0.24 : 0) + (e.soarT > 0 ? 0.34 : 0) + (e.controlled ? 0.08 : 0) + (hardHit ? 0.1 : 0) + driveP;
          if (G.drive === "A" && !G.humanB && e.team === "def") p += 0.08; // CPU finishes QB/carrier tackles
          if (e.apex && e.passive === "tackle") p += 0.08;               // HEAT-SEEKER finishes better
          if (c.apex && c.passive === "escape") p -= 0.08;               // HOUDINI slips, not vanishes
          // RARE automatic broken tackle (a stiff-arm / shrug-off with no timed
          // input): even a sure wrap can be thrown off. The odds turn on the
          // carrier's power + balance vs the defender's strength + tackling,
          // AND on the hit itself — a weak or against-the-grain arm tackle is
          // far more breakable than a square, full-speed de-cleater, which is
          // nearly impossible to shed. Deliberately uncommon, like the NFL.
          const carrierPower = ((c.str || 75) + (c.stiff || c.str || 75) + (c.agi || 75) * 0.5) / 2.5;
          const defForce = ((e.str || 75) + (e.tkl || 75)) / 2;
          // ---- BREAKING A TACKLE IS A CONTEST HE WINS, NOT A COIN FLIP.
          // WAS: one Math.random() roll per grapple against a base of 0.045,
          // from which a square full-speed hit subtracted up to 0.15 — so on most
          // real contacts breakP clamped to exactly ZERO, and on the rest it was
          // a ~5% shot. Measured: 0.03 broken tackles per carry, 1.2% of
          // engagement episodes, and DL / EDGE / CB / S never broke a single one
          // across the whole bench. A good NFL back breaks 0.15-0.25 a carry.
          // Worse than the rate, it was a die at the moment of truth
          // (LESSON #19): the player could not see why one hit bounced off and an
          // identical-looking one did not, because there was nothing to see.
          // NOW it is the mirror image of the takedown accumulator and the two
          // RACE. The defender pours strength into bringing him down; the carrier
          // pours leg drive into getting out; whichever ledger fills first is
          // what the player watches happen. Every term is legible: his power and
          // balance against this defender's force, how square and how fast the
          // hit was, how many other men already have hold of him, and how long he
          // has been held. Deterministic end to end, no per-frame roll anywhere
          // (LESSON #15, LESSON #19).
          // `held` is counted inline rather than read off the wrap stamp so it
          // cannot depend on which defender this loop happens to reach first.
          if (c.firstContactT == null) c.firstContactT = G.playT;
          let held = 0;
          for (const q of G.players) {
            if (q === e || q.team === c.team || q.staggerT > 0 || q.proneT > 0) continue;
            if (dist(q, c) <= bodyContactRange(q, c, 2)) held++;
          }
          const breakEdge = 0.45 + (carrierPower - defForce) / 26
            // Hit quality: a square, full-speed drive (high eDrive) is nearly
            // unbreakable; a soft, poorly-angled or against-the-grain arm
            // tackle (low/negative eDrive) is what actually gets shed.
            - clamp((eDrive - 22) / 120, -0.3, 0.85)
            - held * 0.18                                      // you do not shed a gang tackle
            + ((c.apex && c.passive === "truck") ? 0.4 : 0)    // power backs shed more
            - ((e.diveT > 0 || e.soarT > 0) ? 0.22 : 0)        // a committed dive wraps up better
            - ((e.apex && e.passive === "tackle") ? 0.2 : 0)   // HEAT-SEEKER hangs on
            // ...and he gets out on the first beat or he is going down. This
            // reads the PER-PLAY contact clock, not the current wrap: keyed to
            // the wrap, a shed reset its own window, escapes chained, and one
            // measured play ran 1.77s from first contact to the whistle. One
            // escape early is a broken tackle; four in a row is a different
            // sport.
            - clamp((G.playT - c.firstContactT - 0.12) / 0.25, 0, 1.1);
          c.breakAcc = (c.breakAcc || 0) + Math.max(0, breakEdge) * dt * 230;
          // A shrug-off only applies to an actual wrap-up attempt — not while
          // the defender is mid-punch (that's the ball-strip mechanic) — and
          // not on a dead-on airborne dive already committed past the point of
          // being shed.
          // ONE ESCAPE PER PLAY. The escape resets the takedown ledger, so
          // without a latch a back who keeps winning the contest keeps restarting
          // the fight: measured, chained escapes ran first-contact-to-whistle out
          // to 1.39s, which LESSON #23's one-second takedown budget does not have
          // room for even with the grind ramp maxed. One broken tackle is a
          // highlight; three in a row is a different sport. Reset per play with
          // the other latches (LESSON #20).
          // ...and the escape window CLOSES. The soft late-grind term above is a
          // slope, and a truck-passive power back could out-run it: measured, one
          // such back broke free late enough that the refill pushed
          // first-contact-to-whistle to 1.27s. The window is the same order as the
          // slope, so it only ever catches the outlier, and with it the whole
          // takedown is provably inside LESSON #23's one-second budget: last
          // possible escape 0.45s, and the grind ramp finishes a from-scratch
          // refill inside another 0.4s.
          if (e.punching <= 0 && c.breakAcc >= 60 && !c.brokeFree &&
              G.playT - c.firstContactT < 0.45) {
            c.brokeFree = true;
            c.breakAcc = 0; c.tackleAcc = 0; c.wrapClock = 0;
            // Shove scales with how badly the carrier out-powered the hit.
            shrugOffTackle(c, e, clamp(0.4 + (carrierPower - defForce) / 120, 0.3, 1));
            const brkLines = [
              lastName(e.name) + " wasn't strong enough",
              lastName(c.name) + " runs right through " + lastName(e.name),
              lastName(e.name) + " bounces off",
              lastName(c.name) + " won't go down",
            ];
            banner("BROKEN TACKLE!", brkLines[(Math.random() * brkLines.length) | 0] + "!", 0.8);
            announce("bighit", c.name);
            continue;
          }
          // ---- RETRO BOWL TAKEDOWN MODEL (decompiled source): no dice at
          // contact. Contact GRAPPLES the carrier; every wrapped defender
          // pours strength into the takedown each frame, and the carrier is
          // down when the pour beats his strength threshold. Escapes (juke,
          // stiff-arm, shrug-off, pulling out of the wrap) reset the fight —
          // and while wrapped he drags the pile at half speed, fighting for
          // every yard. `p` (stats+momentum) scales the pour so a good hit
          // still finishes faster than a weak arm-tackle.
          c.grappledT = 0.14;
          // the wrap LOCKS (RB source): the grappler RIDES the carrier —
          // getting dragged for extra yards — until the takedown lands or a
          // move (juke/stiff-arm/shrug) physically breaks him off
          e.grappling = c; e.grapT = 0.22;
          // WHO FINISHES A TACKLE, AND HOW LONG IT TAKES.
          // WAS: one flat rate for every defender on the field. At dt = 1/60 the
          // pour was ~4.55/frame against a 60 threshold = 13 frames = 0.22s, and
          // the +46 hard-hit chunk finished it in FOUR frames — measured median
          // contact-to-whistle 0.15s, max 0.30s. Real football is 0.5-1.5s and
          // LESSON #23's budget is a full second, so the takedown was running at
          // about a fifth of the screen time it is allowed.
          // Three things were wrong. (a) Nothing distinguished a 300-pound tackle
          // wrapping a back in a phone booth from a corner trying to drag him
          // down in the open field; the decoded Retro Bowl source prices exactly
          // that at DL 5.1 against CB/S 2.6, a 2x spread, where `e.str` alone
          // only spans 1.5x from a 90 to a 60. (b) The +46 chunk was a takedown
          // by fiat: 46 of the 60 needed, in one frame, with nothing the carrier
          // could do about it. (c) Additive pouring made slowing the rate down
          // self-defeating — MORE defenders simply arrived and poured in parallel,
          // so 2.01 distinct tacklers per carry became 3.89 and the median grind
          // stalled at 0.23s instead of the 0.5s the rate was set for. Football
          // answer: the FIRST man wraps and the rest pile ON. The second defender
          // genuinely helps; the fourth is arriving at a tackle already decided.
          // So the pour is sub-additive (1, 0.45, 0.29, 0.22 — summing to about
          // two men however many show up), it carries an explicit role rate, and
          // the big hit STAGGERS the grind forward instead of ending it.
          // Still no rolls anywhere (LESSON #15 / LESSON #19): a deterministic
          // accumulator whose rate is stats, role, momentum and the clock.
          const ROLE_FINISH = { DL: 1.35, EDGE: 1.1, LB: 0.68, CB: 0.4, S: 0.34 };
          // A committed AIRBORNE dive is not a role skill — it is a man leaving
          // his feet to take the runner's legs out — so it gets a floor rather
          // than a corner's finish rate.
          const roleFinish = airborne
            ? Math.max(ROLE_FINISH[e.role] || 0.8, 1.2)
            : (ROLE_FINISH[e.role] || 0.8);
          // The wrap is re-stamped every frame: how many men have hold of him,
          // and the anchored force of the strongest one. Frame-stamped, so it is
          // a plain per-frame count and not a hidden accumulator.
          if (c.wrapStampT !== G.playT) { c.wrapStampT = G.playT; c.wrapN = 0; c.wrapTop = 0; }
          const gang = 1 / (1 + (c.wrapN || 0) * 1.2);
          // WRAP_ANCHOR is the finish table read as MASS rather than as tempo: a
          // tackle in the phone booth is an anchor, a corner in the open field
          // gets dragged. Deliberately the strongest SINGLE wrapper and not the
          // sum — the pile in this engine is big (median 3, up to 9 defenders
          // inside body range on one frame), so a summed resistance ran to a
          // median of 159 against a carrier's ~79 of legs, pinned every wrapped
          // runner to the floor, and measured WORSE than the flat constant it
          // replaced (YAC median 0.50 -> 0.33). Gang size is already priced in
          // the sub-additive pour above and in the contact solver; pricing it a
          // third time here just re-created the original bug. What this term is
          // FOR is the matchup: a power back against a corner versus a scatback
          // against a defensive tackle.
          const WRAP_ANCHOR = { DL: 1.12, EDGE: 1.04, LB: 0.96, CB: 0.84, S: 0.82 };
          c.wrapTop = Math.max(c.wrapTop || 0,
            (((e.str || 75) + (e.tkl || 75)) / 2) * (WRAP_ANCHOR[e.role] || 0.95));
          c.wrapN = (c.wrapN || 0) + 1;
          // HOW LONG THIS PLAY HAS BEEN IN CONTACT — and the guarantee that the
          // takedown cannot outrun LESSON #23's one-second screen-time budget.
          // Every term that lengthens the grind (role rate, sub-additive pile,
          // leg drive, an escape that restarts the fight) pushes at that ceiling
          // from a different direction, and they DO line up badly: keyed to the
          // current wrap this ramp measured a 1.77s outlier because a chain of
          // escapes kept resetting it. So the clock is stamped once per play, at
          // first contact, and nothing resets it until the next snap. Past ~0.55s
          // the play is no longer "he is fighting for yards", it is "he is
          // wrapped up and it is over", and the pour ramps hard to say so. A
          // bound, not a mechanic.
          if (c.firstContactT == null) c.firstContactT = G.playT;
          const grindRamp = 1 + clamp((G.playT - c.firstContactT - 0.55) / 0.1, 0, 6);
          // LEG DRIVE IS WHAT RESISTS A TAKEDOWN, so a carrier with no legs under
          // him has nothing to resist with. This is the same idea as the leg-drive
          // block in updateEntity, read from the other side: a back churning at
          // full stride is hard to put down, and a man stood up at the line or
          // caught flat-footed goes straight to the ground. It is also why a
          // committed airborne DIVE is a takedown rather than a grind — nobody
          // churns for half a second with a defender wrapped round his ankles —
          // and it is what test_all #15 is asserting when it drives a 90-strength
          // diving tackler into a stationary carrier and expects the play over.
          const standUp = 1.9 - clamp(Math.hypot(c.vx, c.vy) / Math.max(1, c.spd), 0, 1) * 0.9;
          const pour = gang * roleFinish * ((e.str || 75) / 75) * (0.55 + clamp(p, 0.2, 1) * 0.6) * dt * 66 *
            (e.diveT > 0 || e.soarT > 0 ? 3.8 : 1) * (e.controlled ? 1.15 : 1) * grindRamp * standUp;
          // THE HARD-HIT CHUNK, kept only where it is actually the play. The old
          // flat +46 was 46 of the 60 needed in ONE frame for any hard hit, which
          // is a takedown by fiat and is why the measured median grind was four
          // frames. But a full-speed AIRBORNE dive that connects genuinely is a
          // knockdown — nobody churns for half a second with a defender wrapped
          // round his ankles — so the airborne branch keeps a decisive chunk while
          // a standing de-cleater now has to finish the grind like everyone else.
          // (test_all #15 asserts exactly this case, and it is unseeded, so this
          // needs real margin rather than a boundary pass.)
          c.tackleAcc = (c.tackleAcc || 0) + pour +
            (hardHit && !c.hardHitTaken ? (airborne ? 40 : 12) : 0);
          if (hardHit) c.hardHitTaken = true;
          // WHOSE GRIND IS THIS. A back churning in traffic and a receiver caught
          // in the open field are not the same football event, and the whole point
          // of the owner's catch-gather work (the ramp in updateEntity) was that
          // receiver YAC had to be TRIMMED, not grown. Lengthening the takedown
          // for everybody handed the pass game a running back's contact balance:
          // measured, receiver contact-to-whistle went 0.45s -> 1.04s and receiver
          // yards-after-catch nearly doubled — precisely the regression the
          // passing guard exists to catch. So the threshold carries the carrier's
          // own body. A back or a QB has to be brought down; a receiver goes down
          // closer to when he is hit. A rating-shaped constant per position, not a
          // roll, and it reads correctly the other way too: this is why a fullback
          // is harder to put on the ground than a slot receiver.
          const CARRIER_HOLD = { RB: 1, FB: 1.05, QB: 0.85, TE: 0.24, WR: 0.13, WR1: 0.13, WR2: 0.13, WR3: 0.13 };
          const carrierHold = CARRIER_HOLD[c.role] == null ? 0.8 : CARRIER_HOLD[c.role];
          const takedownAt = (60 + ((c.str || 75) - 75) * 1.1 + ((c.apex && c.passive === "truck") ? 16 : 0)) * carrierHold;
          if (c.tackleAcc >= takedownAt) {
            c.tackleAcc = 0;
            c.impactT = 0.5;
            c.impactLead = true; e.impactT = 0.5;
            playPose(c, "tackled", 0.42);
            playPose(e, "tackle", e.diveT > 0 || e.soarT > 0 ? 0.4 : 0.34);
            // A made tackle gets a short body-on-body shoulder wrap driven
            // along the defender's momentum, so the pair falls the way the hit
            // is actually travelling instead of a fixed screen direction.
            beginTackleImpact(e, c, 0.34, { hit: hitVec || undefined, drive: eDrive });
            // A takedown that BEGAN with a de-cleater still presents as one, even
            // though the flag itself now only fires on the arrival window —
            // c.hardHitTaken is what has always latched that. PRESENTATION ONLY:
            // tryStripAtTakedown is handed exactly the same `hardHit` it always
            // was, so the fumble gate's input is untouched by this rewrite.
            const bigFinish = hardHit || !!c.hardHitTaken;
            // a SHORT beat (owner: the collapse must not linger)
            // Deliberately still keyed to hardHit and NOT to bigFinish: the
            // hit-stop belongs to the frame the collision happens on, and by the
            // time a de-cleater's grind finishes half a second later that moment
            // has passed. It is also the line test_aa_glitchless H5 pins
            // character-for-character as the owner-tuned takedown beat.
            impactMoment(hardHit ? 0.04 : 0.02, hardHit ? 0.2 : 0.11, 0.5);
            if (tryStripAtTakedown(c, e, { hardHit, bigDrive, freshCatch, align })) {
              if (bigFinish) { G.shake = Math.max(G.shake, 0.5); G.zoomPunch = Math.max(G.zoomPunch, 0.1); fxSparks(e.x, e.y, 10); announce("bighit", e.name); sfx.roar(); }
              fumble(c, e); return;
            }
            if (bigFinish) { G.shake = Math.max(G.shake, 0.4); G.zoomPunch = Math.max(G.zoomPunch, 0.08); fxSparks(e.x, e.y, 8); announce("bighit", e.name); sfx.roar(); }
            // the sound of the hit scales with the defender's actual drive
            sfx.tackle(bigFinish ? 2 : 0.85 + Math.max(0, eDrive) / 220);
            addStat(e, "tkl");
            playDead(bigFinish ? "FLATTENED!" : "TACKLED", null, false);
            return;
          }
          // No dazed-and-detach branch and no random bounce-off: a big hit
          // pours its +46 chunk into the takedown and the defender STAYS in
          // the grapple. The carrier's answers are moves, power, or help.
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
        // an ENGAGED rusher sacks only at true body overlap — reach windows,
        // solver-contact latches, and the finish window belong to men who
        // actually beat their block (owner play-test: QB "downed at the LOS
        // with nobody near him" — the culprits were blocked linemen)
        const engaged = !!e.blockedBy;
        if ((dqb < wrapRange && (!engaged || dqb < bodyContactRange(e, qb, 0))) ||
          (recentQBContact && !engaged) || (cpuFinish && !engaged)) {
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
          // THE SACK THE PLAYER ACTUALLY FEELS HAD NO BEAT TO SURVIVE. F1 is
          // about a requested hit-stop being cancelled at the whistle — but on
          // THIS path, the CPU bringing down a HUMAN quarterback in normal play,
          // nothing was ever requested: only sfx.tackle(). The beat log measured
          // 0 freeze and 0 slow frames on a real harness sack while tackle / INT
          // / TD all showed a request, which is how the gap surfaced. The sibling
          // site (the scripted CPU protection loss, ~350 lines up) already asks
          // for exactly these numbers, and 0.12s of slow-mo is inside the
          // LESSON #23 0.2s ceiling.
          G.shake = Math.max(G.shake, 0.25);
          impactMoment(0.06, 0.12, 0.45);
          playDead("SACKED!", null, false);
          return;
        }
      }
    }
  }

  // Source's GML dice, verbatim semantics: irandom(n) is uniform 0..n
  // INCLUSIVE (P(==0) = 1/(n+1)); irandom_range(a,b) is uniform ints a..b.
  const irandom = (n) => (Math.random() * (Math.max(0, n) + 1)) | 0;
  const irandomRange = (a, b) => a + ((Math.random() * (b - a + 1)) | 0);
  // MECHANICS §12: no incidental fumbles within 5 yds of EITHER goal line.
  const FUM_IMMUNE_YD = 5;
  const fumbleImmuneSpot = (x) => {
    const yd = ydAtX(x);
    return yd < FUM_IMMUNE_YD || yd > 100 - FUM_IMMUNE_YD;
  };
  // source: −1 on "hard", −2 on "extreme"; higher diffScalar = easier
  const fumbleDiffBonus = () => { const s = diffScalar(); return s <= -3 ? 2 : s <= 1 ? 1 : 0; };
  // Owner keeper (LESSON #23): a flat-footed arm tackle must not strip. A
  // soft wrap WIDENS the trigger bound so 1/11 stays the hard-hit ceiling.
  const FUM_SOFT_TRIGGER_ADD = 55;
  // Ball-security contest (source: (skill·10+attitude)·0.5 + fumbles·50 +
  // difficulty·2, clamp 1..100). Dino Bowl analogue: hands is the ball skill,
  // str is holding on through contact; the 61/78/1.4 rescale maps the Madden
  // 60-99 spread onto the source's 1..100 scale. Signed difficulty because
  // the human can play DEFENSE here (unlike RB) — house idiom, see dScale.
  function ballSecurityScore(c, carrierIsUser) {
    const base = 61 + (((c.hands || 75) + (c.str || 75)) / 2 - 78) * 1.4;
    const prior = (G.szn && G.szn.seasonStats && G.szn.seasonStats[c.name] &&
      G.szn.seasonStats[c.name].fum) || 0;
    return clamp(base + prior * 50 + diffScalar() * 2 * (carrierIsUser ? 1 : -1), 1, 100);
  }
  // ---- the ONE incidental strip site: two-stage gate MODELED ON the RB
  // source's idiom (§12 — the exact trigger was inferred, not decoded;
  // constants are tuned against our own soak baseline). The dino-power
  // strips (peanut punch, rampage, apex QB hunter) are owner keepers and do
  // NOT route through here.
  function tryStripAtTakedown(c, e, h) {
    const tele = (tag) => { if (G.qaTele) G.qaTele.push({ tag: "fum:" + tag, drive: G.drive }); };
    // --- immunities, all before any dice ---
    if (c.team !== "off") { tele("imm:def"); return false; }
    if (c.role === "QB") { tele("imm:qb"); return false; }   // sacks/scrambles never strip
    if (fumbleImmuneSpot(c.x)) { tele("imm:goal"); return false; }
    // --- STAGE 1: integer trigger, hard-hit ceiling 1-in-11 ---
    let bound = 10 - fumbleDiffBonus();
    if (G.weather.fumbleMod > 0) bound -= 2;   // rain/snow/freezing
    const big = h.hardHit || h.bigDrive;
    if (big) {
      if (h.freshCatch) bound -= 3;            // ball not tucked yet
      if (h.align > 0.7) bound -= 1;           // square de-cleater
    } else {
      bound += FUM_SOFT_TRIGGER_ADD;           // soft wrap: ~1/66
    }
    bound = Math.max(4, bound);
    tele("trig:" + (big ? (h.freshCatch ? "fresh" : h.align > 0.7 ? "decleater" : "hard") : "soft"));
    if (irandom(bound) !== 0) { tele("hold:trigger"); return false; }
    // --- STAGE 2: the security contest, then the flat floor ---
    const sec = ballSecurityScore(c, offenseIsUser());
    if (irandomRange(-100, 85) > sec) { tele("lost:contest"); return true; }
    // deliberate LESSON-#19 exception: the source's own ~2% floor — a rare
    // no-visible-cause pop-out kept because fumble() still explains itself
    // loudly on screen (stagger + banner + loose-ball scramble)
    if (irandom(49) === 0) { tele("lost:floor"); return true; }
    tele("hold:contest");
    return false;
  }
  function fumble(carrier, tackler) {
    carrier.staggerT = 0.8;
    addStat(carrier, "fum");   // career hardening reads this from seasonStats
    // A short, sharp beat only: the strip is the moment, but the scramble for
    // the loose ball must play out near full speed or recoveries feel muddy.
    impactMoment(0.05, 0.16, 0.5);
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
    // DRAG KICK (Retro Bowl style): pull back from the ball — pull length is
    // power, vertical offset is aim (fighting the wind) — release to kick.
    // SPACE still runs the classic two-beat meter as a keyboard fallback.
    if (!k.cpu && k.stage < 2 && k.mode !== "meter") {
      if (mouse.down) {
        if (!k.drag) k.drag = { x: mouse.x, y: mouse.y };
        k.pull = Math.max(0, k.drag.x - mouse.x);
        k.aimY = clamp((mouse.y - k.drag.y) * 0.45, -50, 50);
        // past the regrip threshold the PULL claims the kick: from here the
        // meter presses are dead and the bar reads out the pull instead
        if (k.pull > 25) { k.mode = "drag"; k.press = null; }
      } else if (k.drag) {
        // resolution lives in kickRelease so the event path and this polling
        // path can never both resolve one gesture
        if (kickRelease()) return;
      }
      // dawdle and the operation falls apart: snap goes bad, kick shanks
      if (k.t > 7 && k.stage === 0) { k.power = 22; k.acc = rnd(-45, 45); k.stage = 2; resolveKick(); return; }
    }
    if (k.cpu) {
      // CPU nails it near-optimally with some noise
      if (k.stage === 0 && k.val > 88) kickLocked();
      else if (k.stage === 1 && Math.abs(k.val - 50) < rnd(2, 12)) kickLocked();
    }
    // the rush is LIVE while you aim: blockers hold each man a beat, then
    // he's coming for the kicker
    const kk = k.kickerEnt;
    for (const e of G.players) {
      e.animT += dt * (e.team === "def" && e.holdT <= 0 ? 8 : 1.4);
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
    // a MADE kick lights the window as the ball crosses the upright plane
    if (f.through && !f.crossed && G.ball.x >= xAtYd(108)) {
      f.crossed = true; G.fgFlashT = 0.8;
      beep(1320, 0.18, "triangle", 0.05); beep(1760, 0.22, "triangle", 0.04, 0.08);
    }
    updateCamera(dt);
    if (kk >= 1) {
      const after = f.after;
      G.kickFly = null; G.ball.mode = "dead";
      after();
    }
  }

  // --------------------------------------------------------------- weather
  // ---------------------------------------------------------- particle pool
  // Every grain used to be a fresh object literal carrying its own boolean tag
  // (`rain: true` / `puff: true` / ...). In weather that is 2-6 brand-new
  // objects a frame, forever, each kind with its own hidden class. One uniform
  // record with a `k` kind field, recycled through a free list, allocates
  // nothing at all once the game is warm.
  //
  // MAX_PARTS is a hard live budget, and not only a fill-rate guard: G.parts
  // rides along inside every online frame, and unbounded snow was pushing
  // ~90 KB of grain JSON per frame down the wire.
  const MAX_PARTS = 300;
  const PART_POOL = [];
  const PART_POOL_MAX = 512;
  // Argument order deliberately mirrors the old object literals field for
  // field, so the rnd() calls at every emitter still consume the RNG in
  // exactly the same order and a seeded run reproduces exactly.
  function spawnPart(k, x, y, z, vx, vy, vz, t, g, col, ph) {
    const p = PART_POOL.length ? PART_POOL.pop()
      : { k: "", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: null, g: 0, t: 0, col: null, ph: 0 };
    p.k = k; p.x = x; p.y = y; p.z = z || 0;
    p.vx = vx || 0; p.vy = vy || 0; p.vz = vz == null ? null : vz;
    p.t = t; p.g = g || 0; p.col = col || null; p.ph = ph || 0;
    (G.parts || (G.parts = [])).push(p);
    return p;
  }
  // Only pool-shaped records go back into the pool. Two emitters still live
  // inside the tackle model (beginTackleImpact's impact ring, checkTackles'
  // punch burst) and that code belongs to another batch this pass, so their
  // grains still arrive as old-style literals with no `k`. Letting those into
  // the pool would make every recycled record polymorphic again, which is the
  // exact thing the pool exists to stop.
  function recyclePart(p) {
    if (p.k && PART_POOL.length < PART_POOL_MAX) PART_POOL.push(p);
  }

  // ---- payoff particle vocabulary (AA pass) — same G.parts system, new
  // typed grains. Every emitter is an event, never a per-frame roll (LESSON #15).
  function fxDust(x, y, n) {
    for (let i = 0; i < (n || 5); i++) spawnPart("dust",
      x + rnd(-5, 5), y + rnd(-2, 3), 1,
      rnd(-35, 35), rnd(-16, 12), rnd(15, 45),
      rnd(0.25, 0.45));
  }
  function fxChunks(x, y, n) {
    for (let i = 0; i < (n || 6); i++) spawnPart("chunk",
      x + rnd(-6, 6), y + rnd(-3, 4), 2,
      rnd(-70, 70), rnd(-32, 32), rnd(50, 120),
      rnd(0.3, 0.55), 300, Math.random() < 0.5 ? "#2c5e33" : "#5a4426");
  }
  function fxSparks(x, y, n) {
    for (let i = 0; i < (n || 8); i++) {
      const a = Math.random() * Math.PI * 2;
      spawnPart("spark", x, y - 6, 8,
        Math.cos(a) * rnd(60, 140), Math.sin(a) * rnd(22, 55), rnd(20, 90),
        rnd(0.18, 0.38), 260, Math.random() < 0.5 ? "#ffffff" : "#ffd23f");
    }
  }
  const CONF_COLS = ["#ffd23f", "#f4f6f1", "#ff5533", "#69be28", "#8ec7ff"];
  function fxConfetti(x) {
    // rains across the whole visible frame and lands ON the turf within its
    // lifetime (z is height above the anchor y; draw pos = y - z)
    for (let i = 0; i < 110; i++) spawnPart("conf",
      G.camX + rnd(-20, W + 20), rnd(TOP + 10, BOT - 10), rnd(50, 130),
      rnd(-14, 14), 0, rnd(-55, -15),
      rnd(2.0, 3.2), 42, CONF_COLS[(Math.random() * CONF_COLS.length) | 0],
      Math.random() * 6.28);
  }
  function fxFlash(n) {
    for (let i = 0; i < (n || 12); i++) spawnPart("flash",
      G.camX + rnd(20, W - 20), rnd(14, TOP - 12), 0,
      0, 0, null, rnd(0.08, 0.5));
  }

  function updateParticles(dt) {
    const w = G.weather;
    if (!w || G.state === "title" || G.state === "select") return;
    // speed streaks trail a breakaway carrier at full gallop (geometric
    // condition — the latch at breakawayCalled — not a roll)
    if (G.state === "live" && G.carrier && G.breakawayCalled) {
      const sp = Math.hypot(G.carrier.vx || 0, G.carrier.vy || 0);
      if (sp > 60) spawnPart("streak",
        G.carrier.x - (G.carrier.dir || 1) * 10, G.carrier.y + rnd(-6, 6), 10,
        -(G.carrier.dir || 1) * 40, 0, null, 0.2);
    }
    // Weather is a RATE, not a per-frame head count. `for (i = 0; i < 6; i++)`
    // meant 360 raindrops a second at 60fps but only 180 at 30fps: a phone that
    // dropped to half framerate silently lost half its weather. That is the
    // LESSON #15 shape — how much world happens must not be a function of how
    // often the frame happens to run. dt * 360 and dt * 120 reproduce the old
    // 60fps density exactly (6 and 2 per frame at 16.7ms) and now hold at any
    // framerate. The fractional remainder is CARRIED in an accumulator, never
    // settled with a coin flip.
    if (G.partAccW !== w.type) { G.partAccW = w.type; G.partAcc = 0; }
    const room = Math.max(0, MAX_PARTS - G.parts.length);
    if (w.type === "RAIN") {
      G.partAcc += dt * 360;
      const want = G.partAcc | 0; G.partAcc -= want;
      const n = Math.min(want, room);
      for (let i = 0; i < n; i++) spawnPart("rain", G.camX + rnd(-40, W + 40), rnd(-20, H), 0, w.wind.x * 2 - 60, 540, null, rnd(0.25, 0.5));
      // players splash through the puddles (Fields rules)
      for (const e of G.players || []) {
        if (Math.hypot(e.vx, e.vy) > 36 && inPuddle(e) && Math.random() < dt * 9) {
          for (let i = 0; i < 3; i++) spawnPart("splash", e.x + rnd(-6, 6), e.y + rnd(-2, 4), 0, rnd(-30, 30), rnd(-20, 6), rnd(20, 60), rnd(0.25, 0.45));
        }
      }
    } else if (w.type === "SNOW") {
      G.partAcc += dt * 120;
      const want = G.partAcc | 0; G.partAcc -= want;
      const n = Math.min(want, room);
      for (let i = 0; i < n; i++) spawnPart("snow", G.camX + rnd(-40, W + 40), -6, 0, w.wind.x * 1.5 + rnd(-18, 18), rnd(40, 90), null, rnd(4, 8));
      // the crowd lobs the occasional snowball — live snaps only, and rarely.
      // NEVER on an online guest: snowballSplat() is the one particle in this
      // system with gameplay in it (staggerT / coldT / stamNow, plus the
      // ICEMAN banner), and on a guest those are local fictions the host's
      // next authoritative frame overwrites 83ms later. Ambient snowballs are
      // host-side only; everything else here is pure decoration.
      if (G.state === "live" && !Net.remoteView && Math.random() < dt * 0.1) {
        const fromTop = Math.random() < 0.5;
        spawnPart("snowball",
          G.camX + rnd(60, W - 60), fromTop ? TOP - 8 : BOT + 8, 4,
          rnd(-40, 40), fromTop ? rnd(50, 110) : rnd(-110, -50), 130,
          rnd(1.4, 2.0), 160);
      }
    }
    for (const p of G.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt;
      if (p.vz != null) { p.z = (p.z || 0) + p.vz * dt; p.vz -= (p.g || 220) * dt; }
      // confetti settles on the turf and fades there instead of sinking through
      if (p.k === "conf" && p.z <= 0) { p.z = 0; p.vz = 0; p.vx *= 0.9; p.t = Math.min(p.t, 0.5); }
      if (p.k === "snowball" && p.z <= 0 && p.vz < 0) { // lands with a puff
        p.t = 0;
        snowballSplat(p);
        for (let i = 0; i < 5; i++) spawnPart("puff", p.x + rnd(-4, 4), p.y + rnd(-3, 3), 0, rnd(-40, 40), rnd(-30, 30), rnd(10, 50), 0.3);
      }
    }
    // Compaction in place. The filter() this replaces threw away and rebuilt
    // the whole array every frame; dead grains now go back to the pool.
    // `over` only bites when an event burst (confetti) has pushed the list past
    // the budget, and it gives up the oldest WEATHER grains first so the FX
    // that actually carry meaning are never the ones starved out.
    let over = G.parts.length - MAX_PARTS;
    let keep = 0;
    for (let i = 0; i < G.parts.length; i++) {
      const p = G.parts[i];
      let live = p.t > 0 && p.y < H + 30 && p.y > -30;
      if (live && over > 0 && (p.k === "rain" || p.k === "snow")) { live = false; over--; }
      if (live) G.parts[keep++] = p;
      else recyclePart(p);
    }
    G.parts.length = keep;
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
  // screen-level state changes get a fast fade instead of a hard cut —
  // match-internal flips (live/dead/playcall) never fade, they must be instant
  const SHELL_STATES = { title: 1, menu: 1, select: 1, hub: 1, settings: 1, standings: 1, qbs: 1, tutorial: 1, scout: 1, editor: 1, offseason: 1, upgrade: 1, sznstats: 1, pregame: 1, over: 1, online_wait: 1 };
  function render() {
    if (G._lastRState !== G.state) {
      if ((SHELL_STATES[G._lastRState] || SHELL_STATES[G.state]) && G._lastRState !== undefined) G.transT = 0.18;
      G._lastRState = G.state;
    }
    renderInner();
    if (G.transT > 0) {   // the new screen fades up over ~0.18s
      cx.fillStyle = "rgba(4,10,7," + Math.min(0.85, G.transT / 0.18).toFixed(3) + ")";
      cx.fillRect(0, 0, W, H);
    }
    if (G.paused) {
      cx.fillStyle = "rgba(4,10,7,.72)"; cx.fillRect(0, 0, W, H);
      cx.fillStyle = "rgba(13,37,25,.95)"; cx.fillRect(W / 2 - 220, H / 2 - 64, 440, 128);
      cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2; cx.strokeRect(W / 2 - 220, H / 2 - 64, 440, 128);
      cx.textAlign = "center"; cx.font = PF(20); cx.fillStyle = "#ffd23f";
      cx.fillText("PAUSED", W / 2, H / 2 - 18);
      cx.font = PF(9); cx.fillStyle = "#f4f6f1";
      cx.fillText("ESC — RESUME      Q — QUIT TO MENU", W / 2, H / 2 + 22);
    }
    // S3: the notice line, drawn LAST so nothing can paint over it and no
    // screen has to opt in. Under qaMode the raw G.lastErr is pinned up too —
    // a caught exception can never again be invisible. The centred line is
    // drawn second so this block always leaves textAlign the way the pause
    // card above already leaves it.
    if (G.qaMode && G.lastErr) {
      cx.textAlign = "left"; cx.font = PF(8); cx.fillStyle = "#ff4d3d";
      cx.fillText(String(G.lastErr).slice(0, 130), 8, H - 22);
    }
    if (G.note && G.note.t > 0) {
      cx.textAlign = "center"; cx.font = PF(9); cx.fillStyle = "#ff7a6b";
      cx.fillText(G.note.text.slice(0, 110).toUpperCase(), W / 2, H - 9);
    }
  }
  function renderInner() {
    cx.save();
    if (G.shake > 0) {
      // trauma-style: amplitude falls off on a power curve and the frame
      // ROLLS a little — rotation is what makes a hit feel like a hit
      const tr = Math.pow(Math.min(1, G.shake), 1.5);
      cx.translate(W / 2, H / 2);
      cx.rotate(rnd(-0.006, 0.006) * tr);
      cx.translate(-W / 2 + rnd(-7, 7) * tr, -H / 2 + rnd(-5, 5) * tr);
    }
    cx.fillStyle = "#0a1410"; cx.fillRect(-8, -8, W + 16, H + 16);

    const S = G.state;
    if (S === "loading") { drawCenterText("LOADING DINO BOWL...", "", 0); cx.restore(); return; }
    if (S === "title") { drawTitle(); cx.restore(); return; }
    if (S === "online_wait") { drawOnlineWait(); cx.restore(); return; }
    if (S === "menu" || S === "allmodes") { drawMenu(); cx.restore(); return; }
    if (S === "settings") { drawSettings(); cx.restore(); return; }
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

    // punch-zoom wraps the WORLD only — HUD, banners, and aim UI stay 1:1
    const zoomed = G.zoom > 1.004;
    if (zoomed) {
      cx.save();
      const fx = clamp((G.ball ? G.ball.x - G.camX : W / 2), 220, W - 220);
      cx.translate(fx, H * 0.55); cx.scale(G.zoom, G.zoom); cx.translate(-fx, -H * 0.55);
    }
    drawField();
    drawPlayers();
    // the goal structures stand ABOVE the ground plane and the players
    drawGoalpostTop(xAtYd(-8) - G.camX, false);
    drawGoalpostTop(xAtYd(108) - G.camX, G.fgFlashT > 0);
    drawBall();
    drawWeatherFX();
    if (zoomed) cx.restore();
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

  // Depth sort runs twice a frame over ~22 entities. `.slice().sort()` threw a
  // fresh array away every single time; these persistent buffers are refilled
  // in place instead. Two buffers, not one shared: the live renderer and the
  // replay renderer must never be able to alias each other's list.
  const DRAW_ORDER = [], REPLAY_ORDER = [];
  const byDepth = (a, b) => a.y - b.y;
  function depthOrder(buf, src) {
    buf.length = 0;
    for (let i = 0; i < src.length; i++) buf.push(src[i]);
    buf.sort(byDepth);
    return buf;
  }

  // ------------------------------------------------------- static turf cache
  // Stripes, mow grain, endzones, the midfield mark, yard lines, numbers,
  // hashes and the sidelines are a pure function of the FIELD, not of the
  // camera — yet they were being repainted, about a thousand canvas ops of
  // them, on every single frame. Bake them once into an offscreen canvas as
  // wide as the whole field and blit that at -cam.
  //
  // VW is the culling width those paints test against: W while drawing to the
  // screen, the entire field while baking. Without it the bake would cull
  // everything past the first viewport and the cache would hold only the left
  // edge of the field.
  let VW = W;
  // Getting this key right is the whole job. A possession flip swaps which
  // endzone belongs to whom, so G.drive AND both abbreviations have to be in
  // it — key on the endzone pair alone and a turnover leaves the previous
  // drive's endzones frozen on screen. The TEAMS flag covers the boot window
  // before teams.json lands, so a blank first bake cannot get stuck either.
  function fieldCacheKey() {
    const ezA = (G.drive === "A" ? G.my : G.opp) || "GB";
    const ezB = (G.drive === "A" ? G.opp : G.my) || "CHI";
    const home = (G.stadium && G.stadium.home) || G.homeAbbr || G.my || "-";
    const wx = (G.weather && G.weather.type) || "CLEAR";
    return wx + "|" + ezA + "|" + ezB + "|" + (G.drive || "-") + "|" + home +
      "|" + (TEAMS[ezA] && TEAMS[ezB] ? "T" : "-");
  }
  function ensureFieldCache() {
    const key = fieldCacheKey();
    if (G.fieldCv && G.fieldKey === key) return G.fieldCv;
    if (!G.fieldCv) {
      const fcv = document.createElement("canvas");
      fcv.width = FIELD_LEN; fcv.height = H;
      G.fieldCv = fcv; G.fieldCx = fcv.getContext("2d");
      G.fieldCx.imageSmoothingEnabled = false;
    }
    // Point the module's `cx` at the offscreen sheet for exactly one
    // synchronous paint. Nothing yields in between, and the finally block puts
    // the camera and the context back even if a paint throws.
    const keepCx = cx, keepCam = G.camX, keepVW = VW;
    try {
      G.fieldCx.clearRect(0, 0, FIELD_LEN, H);
      cx = G.fieldCx; G.camX = 0; VW = FIELD_LEN;
      paintFieldStatic();
    } finally {
      cx = keepCx; G.camX = keepCam; VW = keepVW;
      G.fieldKey = key;
    }
    return G.fieldCv;
  }

  function paintFieldStatic() {
    const cam = G.camX;
    // grass stripes every five yards.  Keep their geometry tied to xAtYd so
    // the visual field stays truthful when the presentation scale changes.
    for (let seg = 0; seg < 24; seg++) {
      const x = xAtYd(-10 + seg * 5) - cam;
      if (x + 5 * YPX < 0 || x > VW) continue;
      const snow = G.weather && G.weather.type === "SNOW";
      const base = seg % 2 ? (snow ? "#c9d4cf" : "#1e6b35") : (snow ? "#bcc9c3" : "#1a5e2e");
      cx.fillStyle = G.weather && G.weather.type === "RAIN" ? shade(base, -14) : base;
      cx.fillRect(x, TOP, 5 * YPX, BOT - TOP);
      // fine mow-grain dots (deterministic per column so they don't shimmer)
      cx.fillStyle = "rgba(0,0,0,.08)";
      const wx0 = xAtYd(-10 + seg * 5);
      for (let dy = TOP + 10; dy < BOT - 6; dy += 24) {
        for (let dxp = 6 + ((seg * 13) % 12); dxp < 5 * YPX; dxp += 22) {
          cx.fillRect(Math.round(x + dxp), dy + ((wx0 + dxp) % 3) * 5, 2, 2);
        }
      }
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
      if (x < -20 || x > VW + 20) continue;
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
      if (x < -4 || x > VW + 4) continue;
      cx.fillRect(x - 1, MID - 52, 2, 6); cx.fillRect(x - 1, MID + 46, 2, 6);
    }
    // sidelines
    cx.fillStyle = "#f4f6f1";
    cx.fillRect(-cam, TOP - 5, FIELD_LEN, 5); cx.fillRect(-cam, BOT, FIELD_LEN, 5);
  }

  function drawField() {
    const cam = G.camX;
    cx.drawImage(ensureFieldCache(), -cam, 0);
    // backdrop: sky / skyline / dome behind the stands
    drawBackdrop(cam);
    // crowd
    if (G.crowd) cx.drawImage(G.crowd, -cam * 0.55, 6);
    // The field now has its own life: coaches, photographers, ball kids,
    // bench groups and near-sideline fans scroll with the actual yard lines.
    // sideline figures removed — the tiny coach/camera/medic dinos read as
    // clutter at game zoom (owner play-test 2026-08-07: "weird tiny dinos
    // by the sidelines, remove that"). Clean aprons, Retro Bowl style.
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
      // The blue stripe marks THE SNAP, and a staged kick does not always snap
      // from the drive's spot: kickoffs come off the 35 and extra points off the
      // 84 (enterKick's originYd). Reading G.losYd here was only ever right by
      // accident, because XPs used to be mis-staged AT the drive spot. Now that
      // the extra point has its own origin, a goal-line touchdown would leave
      // this stripe floating downfield of the kicker — measured on a TD from the
      // 95: kicker at screen x 336, stripe at 740, ~17 yards adrift. Follow the
      // kick's own origin. Field goals and punts are unaffected (their origin IS
      // G.losYd), and the `state === "kick"` gate keeps a spent kick object from
      // leaking into the next live play.
      const snapYd = G.state === "kick" && G.kick && G.kick.originYd != null ? G.kick.originYd : G.losYd;
      const losX = xAtYd(snapYd) - cam;
      cx.fillStyle = "rgba(60,120,255,.75)"; cx.fillRect(losX - 1, TOP, 3, BOT - TOP);
      const fdX = xAtYd(Math.min(100, snapYd + G.toGain)) - cam;
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
    // The sky only depends on the time of day, so build the gradient once
    // and hold it. createLinearGradient was minting a fresh CanvasGradient
    // on every frame of every outdoor game.
    if (!G.skyGrad || G.skyGradKey !== st.time) {
      const grad = cx.createLinearGradient(0, 0, 0, 70);
      grad.addColorStop(0, top2); grad.addColorStop(1, bot2);
      G.skyGrad = grad; G.skyGradKey = st.time;
    }
    cx.fillStyle = G.skyGrad; cx.fillRect(0, 0, W, 70);
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
    // Retro Bowl paints the mark twice more at the 25s (smaller)
    for (const yd of [25, 75]) {
      const x25 = xAtYd(yd) - cam;
      if (x25 < -60 || x25 > VW + 60) continue;
      cx.save(); cx.globalAlpha = 0.6;
      cx.font = PF(15); cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillStyle = shade(t[1], 12);
      cx.fillText(homeAb, x25, TOP + 62);
      cx.fillText(homeAb, x25, BOT - 56);
      cx.restore(); cx.textBaseline = "alphabetic";
    }
    const x = xAtYd(50) - cam;
    if (x < -90 || x > VW + 90) return;
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
    if (x + width < 0 || x > VW) return;
    // solid, saturated team paint (Retro Bowl endzones are a full color slab)
    cx.fillStyle = shade(t[1], -6); cx.fillRect(x, TOP, width, BOT - TOP);
    cx.fillStyle = "rgba(0,0,0,.14)"; cx.fillRect(x, TOP, width, 6);
    cx.fillRect(x, BOT - 6, width, 6);
    cx.save();
    cx.translate(x + width / 2, MID);
    cx.rotate(x0 === 0 ? -Math.PI / 2 : Math.PI / 2);
    cx.font = PF(26); cx.fillStyle = t[2]; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(t[0].toUpperCase().slice(0, 10), 0, 0);
    cx.restore();
  }
  // The goal is a STANDING structure, not paint on the turf: a turf shadow +
  // padded base drawn with the field, and the pole/crossbar/uprights drawn
  // ABOVE the players so the whole thing rises off the ground plane.
  function drawGoalpost(x) {
    if (x < -80 || x > W + 80) return;
    // ground contact: shadow + base pad anchor the post to the turf
    cx.fillStyle = "rgba(0,0,0,.28)";
    cx.fillRect(x - 12, MID + 40, 24, 4);
  }
  function drawGoalpostTop(x, glow) {
    if (x < -80 || x > W + 80) return;
    const baseY = MID + 42;                 // pole meets the turf here
    const barY = MID - 84;                  // crossbar height above the field
    const upTop = barY - 96;                // upright tips (post ≈ 55% of field height)
    const hot = glow ? clamp(G.fgFlashT / 0.8, 0, 1) : 0;
    const bright = hot > 0 ? "#fff3a0" : "#ffd23f";
    // padded base + shaft (dark pad low, bright shaft, shaded right edge)
    cx.fillStyle = "#243036"; cx.fillRect(x - 5, baseY - 34, 10, 34);
    cx.fillStyle = "#e8c15a"; cx.fillRect(x - 3, barY + 4, 6, (baseY - 34) - (barY + 4));
    cx.fillStyle = "#b58f31"; cx.fillRect(x + 1, barY + 4, 2, (baseY - 34) - (barY + 4));
    // crossbar as a 3D tube: bright face + darker underside — a TIGHT fork
    // like the reference; a made kick threads a snug window
    cx.fillStyle = bright; cx.fillRect(x - 32, barY, 64, 5);
    cx.fillStyle = "#b58f31"; cx.fillRect(x - 32, barY + 4, 64, 1);
    // uprights lean subtly outward toward the top — perspective, not paint
    for (const s of [-1, 1]) {
      const bx = x + s * 30;
      cx.fillStyle = bright;
      cx.fillRect(bx - 2, barY - 32, 5, 32);
      cx.fillRect(bx - 2 + s * 2, barY - 64, 5, 32);
      cx.fillRect(bx - 2 + s * 4, upTop, 5, (barY - 64) - upTop);
      cx.fillStyle = "#b58f31"; cx.fillRect(bx + 2, barY - 32, 1, 32);
    }
    // the MADE-kick moment: the window between the uprights lights up as the
    // ball sails through, so a good kick is unmistakable
    if (hot > 0) {
      cx.save();
      cx.globalAlpha = 0.35 * hot;
      cx.fillStyle = "#fff3a0";
      cx.fillRect(x - 26, upTop, 52, barY - upTop);
      cx.restore();
      cx.font = PF(10); cx.textAlign = "center";
      cx.fillStyle = "rgba(255,243,160," + (0.5 + 0.5 * hot) + ")";
      cx.fillText("THROUGH!", x, upTop - 8);
    }
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
    const list = depthOrder(DRAW_ORDER, G.players);
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
      // the ring IS the ball indicator: carrier or the QB holding it pre-throw.
      // Drawn as PIXELS, not a ctx.ellipse: this marker is on screen for every
      // frame of every play, which made it the most-seen anti-aliased vector
      // stroke in the game and a direct violation of AA_TRANSFORMATION §1
      // ("fillRect at integer coords ... no anti-aliased vector strokes
      // anywhere near the field"). Same 15x6 flat-oval read, eight fillRects,
      // integer coords, no per-frame allocation.
      if (!G.qaCapture && (e === G.carrier || (e === G.ball.holder && (G.phase === "drop" || G.phase === "handoff")))) {
        const rx = Math.round(e.x - G.camX), ry = Math.round(e.y);
        cx.fillStyle = "rgba(255,210,63,.9)";
        cx.fillRect(rx - 8, ry - 6, 17, 2); cx.fillRect(rx - 8, ry + 4, 17, 2);
        cx.fillRect(rx - 13, ry - 5, 4, 2); cx.fillRect(rx + 9, ry - 5, 4, 2);
        cx.fillRect(rx - 15, ry - 1, 3, 2); cx.fillRect(rx + 12, ry - 1, 3, 2);
        cx.fillRect(rx - 13, ry + 3, 4, 2); cx.fillRect(rx + 9, ry + 3, 4, 2);
      }
      if (e.proneT > 0 && !["tackled", "shoved", "prone"].includes(pose)) {
        cx.save(); cx.translate(e.x - G.camX, e.y); cx.rotate(e.dir * Math.PI / 2);
        cx.drawImage(img, -drawW / 2, -drawH + 6); cx.restore();
      } else if (e.layQ && (pose === "tackled" || pose === "prone")) {
        // A body driven ACROSS the field lies across the field. The laid-out
        // cel is authored horizontal (head to the right in the R pack), so a
        // single lossless quarter turn aims it up- or down-field instead of
        // snapping every tackle onto the sideline axis. beginTackleImpact set
        // layQ from the hit vector, and it is cleared where the impact clears.
        // Accessories are deliberately not drawn on this path, for the same
        // reason the proneT fallback above skips them: bling and QB features
        // are positioned against the STANDING pack head fraction and would
        // land off-body on a rotated cel.
        cx.save(); cx.translate(e.x - G.camX, e.y - drawH / 2 + 3);
        cx.rotate(e.layQ * Math.PI / 2);
        cx.drawImage(img, -drawW / 2, -drawH / 2); cx.restore();
      } else if (e.spinT > 0) {
        // spin-move: a quick full rotation through the cut
        cx.save(); cx.translate(e.x - G.camX, e.y - spr.h / 2 + 3 - jump);
        cx.rotate((1 - e.spinT / 0.32) * Math.PI * 2 * e.dir);
        cx.drawImage(img, -spr.w / 2, -spr.h / 2); cx.restore();
      } else {
        cx.drawImage(img, x, y);
        // accessories ride the current FRAME's pixels (see frameBobDy)
        // baseline against the species' STANDING pack (`spr`) — the same body
        // whose head fraction drawBling/drawQBFeature position against
        const bobDy = frameBobDy(artPack, e.dir >= 0 ? "R" : "L", spriteFrame.fi, spr);
        // career bling overlay — positioned dynamically off the sprite bounds so
        // it lands on the head / chest of ANY dino species and faces the right way
        if (e.careerAcc && e.careerAcc !== "NONE") drawBling(e, spr, x, y + bobDy);
        // personalized dinos: QBs wear their gallery identity in-game, and
        // apex rampagers carry their star's signature feature
        if (!ramping) {
          let featKind = null;
          if (e.role === "QB") { const qf = QB_ID[teamAbbrOf(sideOf(e))]; if (qf && qf[1] !== "small") featKind = qf[1]; }
          else if (e.apex) featKind = RAMP_FEAT[teamAbbrOf(sideOf(e))];
          if (featKind) {
            const mid0 = e.x - G.camX;
            if (e.dir < 0) { cx.save(); cx.translate(2 * mid0, 0); cx.scale(-1, 1); }
            drawQBFeature(featKind, x, y + bobDy, spr.w);
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
      // Snowball victims shiver under drifting ice crystals — a readable
      // "cold" cue with NO rectangle overlay painted over the sprite.
      if (e.coldT > 0) {
        const blink = ((performance.now() / 200) | 0) % 2;
        cx.fillStyle = "#dff2ff";
        cx.fillRect(Math.round(e.x - G.camX - 7), Math.round(e.y - drawH - 4 + blink), 2, 2);
        cx.fillRect(Math.round(e.x - G.camX + 5), Math.round(e.y - drawH - 7 - blink), 2, 2);
        cx.fillStyle = "#8ecafc";
        cx.fillRect(Math.round(e.x - G.camX - 1), Math.round(e.y - drawH - 9 + blink), 2, 2);
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
    // "+Ny" gain tag: rides the carrier live, then lingers where the run died
    if (G.state === "live" && G.carrier && G.phase === "carry") {
      const gained = Math.round(ydAtX(G.carrier.x) - G.losYd);
      if (Math.abs(gained) >= 1) {
        const tx = G.carrier.x - G.camX, ty = G.carrier.y - 42;
        cx.font = PF(9); cx.textAlign = "center";
        cx.fillStyle = "rgba(4,10,7,.7)"; cx.fillText(gained + "y", tx + 1, ty + 1);
        cx.fillStyle = gained > 0 ? "#ffd23f" : "#ff8a5c"; cx.fillText(gained + "y", tx, ty);
      }
    }
    if (G.gainTag && G.gainTag.t > 0) {
      cx.save(); cx.globalAlpha = clamp(G.gainTag.t / 0.9, 0, 1);
      cx.font = PF(9); cx.textAlign = "center";
      cx.fillStyle = "rgba(4,10,7,.7)"; cx.fillText(G.gainTag.text, G.gainTag.x - G.camX + 1, G.gainTag.y + 1);
      cx.fillStyle = "#ffd23f"; cx.fillText(G.gainTag.text, G.gainTag.x - G.camX, G.gainTag.y);
      cx.restore();
    }
  }

  // Accessories must ride the PIXELS, not the sprite rectangle: the 4-frame
  // walk cycle bobs the whole body ±1 row, so anything drawn at a fixed
  // fraction of the box visibly detaches (owner play-test 2026-08-07:
  // "Lamar's headband stays in the same place"). frameBobDy reads the
  // current frame's mask and returns how far the body sits from frame 0.
  const bobCache = new WeakMap();
  function maskTopRow(pack, dirKey, fi) {
    if (!pack || !pack.mask) return null;
    const frames = pack.mask[dirKey] || pack.mask.R;
    const mask = frames && frames[fi % frames.length];
    if (!mask) return null;
    for (let sy = 0; sy < mask.h; sy++) {
      const spans = mask.rows[sy];
      if (spans && spans.length) return sy;
    }
    return null;
  }
  // How far below the STANDING silhouette's top edge this cel's body starts.
  // `basePack` is the species' walk pack and is the baseline that matters: the
  // accessory draw positions off a head fraction of the upright body, so the
  // offset has to be measured against that same upright reference. Measuring a
  // pack against its OWN cel 0 (the old behaviour) returns ~0 for a grounded
  // pack — every prone cel starts low — so bling and QB visors floated at the
  // upright head position, 9-11px above a laid-out body. Now far more visible,
  // because the prone cel plays on every tackle since the A-1 rise chain.
  function frameBobDy(pack, dirKey, fi, basePack) {
    if (!pack) return 0;
    const base = basePack && basePack.mask ? basePack : pack;
    let byPack = bobCache.get(pack);
    if (!byPack || byPack.__base !== base) { byPack = { __base: base }; bobCache.set(pack, byPack); }
    const key = dirKey + ":" + fi;
    if (byPack[key] !== undefined) return byPack[key];
    const t0 = maskTopRow(base, dirKey, 0), tf = maskTopRow(pack, dirKey, fi);
    const dy = t0 == null || tf == null ? 0 : tf - t0;
    byPack[key] = dy;
    return dy;
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
    // flight trail: fading ghost dots make the arc readable at a glance
    if (b.mode === "air" || b.mode === "kickfly" || b.mode === "koflight") {
      b.trail = b.trail || [];
      b.trail.push({ x: b.x, y: b.y - b.z });
      if (b.trail.length > 7) b.trail.shift();
      for (let i = 0; i < b.trail.length; i++) {
        cx.globalAlpha = (i / b.trail.length) * 0.32;
        cx.fillStyle = "#f4f6f1";
        cx.fillRect(b.trail[i].x - G.camX - 1, b.trail[i].y - 1, 3, 3);
      }
      cx.globalAlpha = 1;
    } else if (b.trail && b.trail.length) b.trail.length = 0;
    // shadow thins with height so hang time reads
    const shA = Math.max(0.12, 0.3 - (b.z || 0) * 0.002);
    cx.fillStyle = "rgba(0,0,0," + shA + ")";
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
      // `p.k` is the grain's kind. The two emitters that still sit inside the
      // tackle model — beginTackleImpact's impact ring and checkTackles' punch
      // burst — are off limits this batch, so their grains keep arriving with
      // the old `puff: true` tag. Resolve that here rather than reach into a
      // function another batch owns. For a pooled grain `p.k` is a non-empty
      // string, so this is one truthiness test and nothing else.
      switch (p.k || (p.puff ? "puff" : "")) {
        case "splash":
          cx.fillStyle = "rgba(150,200,255," + Math.min(0.8, p.t * 2) + ")";
          cx.fillRect(p.x - G.camX, p.y - p.z, 3, 3);
          break;
        case "snowball":
          cx.fillStyle = "rgba(0,0,0,.25)"; cx.fillRect(p.x - G.camX - 3, p.y, 7, 3);
          cx.drawImage(G.snowSpr, p.x - G.camX - 6, p.y - p.z - 5);
          break;
        case "puff":
          cx.fillStyle = "rgba(244,246,241," + Math.min(0.9, p.t * 1.5) + ")";
          cx.fillRect(p.x - G.camX, p.y - p.z, 4, 4);
          break;
        case "dust":
          cx.fillStyle = "rgba(178,158,112," + Math.min(0.8, p.t * 1.8) + ")";
          cx.fillRect(p.x - G.camX, p.y - p.z, 3, 3);
          break;
        case "chunk":
        case "spark":
          cx.globalAlpha = Math.min(1, p.t * 2.2);
          cx.fillStyle = p.col;
          cx.fillRect(p.x - G.camX, p.y - p.z, p.k === "spark" ? 2 : 3, p.k === "spark" ? 2 : 3);
          cx.globalAlpha = 1;
          break;
        case "conf":
          cx.globalAlpha = Math.min(1, p.t);
          cx.fillStyle = p.col;
          cx.fillRect(p.x - G.camX + Math.sin(p.ph + p.t * 6) * 2.5, p.y - p.z, 4, 3);
          cx.globalAlpha = 1;
          break;
        case "flash":
          cx.fillStyle = "rgba(255,255,255," + Math.min(0.95, p.t * 3) + ")";
          cx.fillRect(p.x - G.camX, p.y, 3, 3);
          break;
        case "streak":
          cx.fillStyle = "rgba(255,255,255," + Math.min(0.4, p.t * 1.6) + ")";
          cx.fillRect(p.x - G.camX, p.y - p.z, 5, 2);
          break;
      }
    }
    const w = G.weather; if (!w) return;
    if (w.type === "RAIN") {
      cx.strokeStyle = "rgba(160,200,255,.4)"; cx.lineWidth = 1;
      cx.beginPath();
      for (const p of G.parts) if (p.k === "rain") { const x = p.x - G.camX; cx.moveTo(x, p.y); cx.lineTo(x + p.vx * 0.02, p.y + 11); }
      cx.stroke();
      cx.fillStyle = "rgba(10,20,40,.12)"; cx.fillRect(0, 0, W, H);
    } else if (w.type === "SNOW") {
      cx.fillStyle = "rgba(255,255,255,.85)";
      for (const p of G.parts) if (p.k === "snow") cx.fillRect(p.x - G.camX, p.y, 3, 3);
      cx.fillStyle = "rgba(220,230,255,.07)"; cx.fillRect(0, 0, W, H);
    }
  }

  // ------------------------------------------------------------- UI screens
  // ============================================== THE COLD OPEN
  // A dinosaur, grazing, notices the light go out. He looks up. Something
  // dark is falling and getting bigger, and he is certain he knows what it
  // is. He is wrong: it is a football.
  //
  // Drawn in the same discipline as the field — integer coordinates, banded
  // colour instead of gradients, fillRect and nearest-neighbour blits only
  // (AA_TRANSFORMATION 1). No new assets: the reveal is the game's own ball
  // sprite scaled by an INTEGER factor so it stays crisp, and the "meteor" is
  // that same silhouette before you can read it.
  const BOOT_LEN = 7.4;
  // A dusk jungle, in five depth planes, and an animal in the front one.
  //  graze 0.9 · the light goes 2.0 · he looks up 2.9 · it falls 4.3
  //  REVEAL 5.4 · impact 6.2 · out 7.4
  const BOOT = { graze: 0.9, dim: 2.0, look: 2.9, fall: 4.3, reveal: 5.4, land: 6.2 };
  const HZ = 372;                    // horizon

  // ---- pixel primitives. Scanline fills, integer rows, so every shape is
  // authored art rather than a stack of rectangles (AA_TRANSFORMATION 1).
  function pxDisc(cx0, cy0, r, fill) {
    cx.fillStyle = fill;
    const R = Math.max(1, Math.round(r));
    for (let dy = -R; dy <= R; dy++) {
      const half = Math.round(Math.sqrt(Math.max(0, R * R - dy * dy)));
      if (half > 0) cx.fillRect(Math.round(cx0) - half, Math.round(cy0) + dy, half * 2, 1);
    }
  }
  // even-odd scanline polygon fill: the workhorse for every silhouette here
  function pxPoly(pts, fill) {
    if (!pts.length) return;
    cx.fillStyle = fill;
    let lo = 1e9, hi = -1e9;
    for (const p of pts) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
    lo = Math.floor(lo); hi = Math.ceil(hi);
    for (let y = lo; y <= hi; y++) {
      const xs = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
        if (x1 > x0) cx.fillRect(x0, y, x1 - x0, 1);
      }
    }
  }
  // a fern frond: a tapering rachis with leaflets stepping down both edges.
  // Drawn as one polygon so the notches stay crisp instead of turning to mush.
  function frond(ox, oy, len, ang, wide, fill) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const P = (d, o) => [ox + ca * d - sa * o, oy + sa * d + ca * o];
    const up = [], dn = [];
    const LEAF = 11;   // more, shallower leaflets reads as foliage
    for (let i = 0; i <= LEAF; i++) {
      const f = i / LEAF;
      const d = f * len;
      const w = wide * Math.sin(Math.PI * (0.18 + f * 0.82)) * (1 - f * 0.35);
      up.push(P(d, -w));
      up.push(P(d + len / LEAF * 0.5, -w * 0.74));    // a shallow leaflet edge —
      dn.push(P(d, w));                               // deep notches read as a
      dn.push(P(d + len / LEAF * 0.5, w * 0.74));     // lightning zigzag, not a fern
    }
    pxPoly(up.concat(dn.reverse()), fill);
  }
  // a tree fern: slim trunk, crown of fronds. The silhouette of the Mesozoic.
  function treeFern(x, groundY, h, spread, fill, tilt) {
    const tx = x + (tilt || 0) * h * 0.18;
    pxPoly([[x - 4, groundY], [x + 4, groundY], [tx + 3, groundY - h], [tx - 3, groundY - h]], fill);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI + (i + 0.5) / n * Math.PI;   // fan across the top
      frond(tx, groundY - h, spread * (0.72 + 0.28 * Math.sin(i * 2.1)), a, spread * 0.17, fill);
    }
  }

  // ---- THE DISTANCE IS BAKED ONCE, exactly like G.crowd and G.fieldCv. That
  // buys two things: the per-frame cost collapses to a couple of blits, and
  // because the bake is a one-off we can afford REAL ORDERED DITHERING, which
  // is the single biggest difference between hand-made 8-bit art and a
  // generated gradient. This game already dithers — the crowd is a field of
  // hashed pixel blocks — so it is the house idiom, not an import.
  const SKY_RAMP = ["#0d1828", "#142334", "#1b2f3d", "#263c3e", "#3d4e37", "#67602c", "#a37c28", "#d59f3a"];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bootBake() {
    if (G.bootSky) return;
    const BL = 2;                       // 2px dither blocks: chunky, and honest
    // ---- SKY: an 8-step ramp, dithered between adjacent steps. Flat bands
    // read as a machine gradient; a Bayer threshold breaks the seams the way a
    // pixel artist would, with no extra colours in the palette.
    const skyH = HZ + 40;
    const sc = document.createElement("canvas"); sc.width = W; sc.height = skyH;
    const sg = sc.getContext("2d");
    const n = SKY_RAMP.length;
    for (let by = 0; by * BL < skyH; by++) {
      const y = by * BL;
      const pos = (y / (skyH - 1)) * (n - 1);
      const i = Math.min(n - 2, Math.floor(pos)), f = pos - i;
      for (let bx = 0; bx * BL < W; bx++) {
        const thr = (BAYER4[((by & 3) << 2) | (bx & 3)] + 0.5) / 16;
        sg.fillStyle = SKY_RAMP[f > thr ? i + 1 : i];
        sg.fillRect(bx * BL, y, BL, BL);
      }
    }
    G.bootSky = sc;
    // ---- SCENE: volcano body, ridge, both fern ranks and the ground, on one
    // transparent layer wider than the screen so the parallax has somewhere to
    // scroll. Every plane gets TWO tones plus a lit edge — one flat colour per
    // plane is the other thing that reads as generated.
    const PAD = 160;
    const nc = document.createElement("canvas"); nc.width = W + PAD * 2; nc.height = H;
    const ng = nc.getContext("2d");
    const O = PAD;                       // scene-space origin offset
    const poly = (pts, fill) => {
      if (!pts.length) return;
      ng.fillStyle = fill;
      let lo = 1e9, hi = -1e9;
      for (const p of pts) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
      for (let y = Math.floor(lo); y <= Math.ceil(hi); y++) {
        const xs = [];
        for (let k = 0; k < pts.length; k++) {
          const a = pts[k], b = pts[(k + 1) % pts.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
        }
        if (xs.length < 2) continue;
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const x0 = Math.round(xs[k]), x1 = Math.round(xs[k + 1]);
          if (x1 > x0) ng.fillRect(x0, y, x1 - x0, 1);
        }
      }
    };
    const fr = (ox, oy, len, ang, wide, fill) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const P = (d, o) => [ox + ca * d - sa * o, oy + sa * d + ca * o];
      const up = [], dn = [], LEAF = 11;
      for (let i = 0; i <= LEAF; i++) {
        const f2 = i / LEAF, d = f2 * len;
        const w = wide * Math.sin(Math.PI * (0.18 + f2 * 0.82)) * (1 - f2 * 0.35);
        up.push(P(d, -w)); up.push(P(d + len / LEAF * 0.5, -w * 0.74));
        dn.push(P(d, w)); dn.push(P(d + len / LEAF * 0.5, w * 0.74));
      }
      poly(up.concat(dn.reverse()), fill);
    };
    const tf = (x, groundY, h, spread, fill, tip, tilt) => {
      const tx = x + (tilt || 0) * h * 0.18;
      poly([[x - 4, groundY], [x + 4, groundY], [tx + 3, groundY - h], [tx - 3, groundY - h]], fill);
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI + (i + 0.5) / 7 * Math.PI;
        const L = spread * (0.72 + 0.28 * Math.sin(i * 2.1));
        fr(tx, groundY - h, L, a, spread * 0.17, fill);
        // lit tips: the last third of each frond a shade up, so the crown has
        // a form instead of being a flat cutout
        fr(tx + Math.cos(a) * L * 0.66, groundY - h + Math.sin(a) * L * 0.66, L * 0.34, a, spread * 0.1, tip);
      }
    };
    // volcano: body, a lighter sunward flank, and a dark caldera lip
    const vX = 742 + O, vB = HZ + 4, vH = 176;
    poly([[vX - 210, vB], [vX - 52, vB - vH], [vX + 44, vB - vH], [vX + 232, vB]], "#141d22");
    poly([[vX + 8, vB - vH], [vX + 44, vB - vH], [vX + 232, vB], [vX + 96, vB]], "#1b262a");
    poly([[vX - 52, vB - vH], [vX + 44, vB - vH], [vX + 30, vB - vH + 9], [vX - 38, vB - vH + 9]], "#0a0f12");
    // ridge + a lit crest line
    const rg = [];
    for (let x = -20; x <= W + PAD * 2 + 20; x += 40) rg.push([x, HZ - 26 - 22 * Math.sin(x * 0.011) - 14 * Math.sin(x * 0.03)]);
    const crest = rg.slice();
    rg.push([W + PAD * 2 + 20, HZ + 8], [-20, HZ + 8]);
    poly(rg, "#0f1c1a");
    for (const p of crest) ng.fillStyle = "#1a2a24", ng.fillRect(Math.round(p[0]) - 20, Math.round(p[1]), 40, 2);
    // fern ranks, far then near, each with lit tips
    for (let i = 0; i < 8; i++) tf(-40 + i * 168 + O, HZ + 10, 92 + ((i * 37) % 46), 62 + ((i * 23) % 26), "#0b1a14", "#12271d", ((i % 3) - 1) * 0.3);
    for (let i = 0; i < 7; i++) tf(30 + i * 196 + O, HZ + 26, 128 + ((i * 51) % 62), 84 + ((i * 31) % 34), "#06120e", "#0b1d15", ((i % 2) ? 1 : -1) * 0.22);
    // ground: base, a lit strip at the horizon, and tufts so it is not a slab
    // darker than it was: the near ground has to sit BEHIND a near-black animal
    // without competing with him, and the tufts supply the texture instead.
    ng.fillStyle = "#05100c"; ng.fillRect(0, HZ + 18, nc.width, H);
    ng.fillStyle = "#0a1a13"; ng.fillRect(0, HZ + 18, nc.width, 3);
    for (let i = 0; i < 150; i++) {
      const seed = ((i * 2654435761) >>> 0);
      const gx = (seed % (nc.width - 8)) + 4;
      const gy = HZ + 24 + ((seed >>> 9) % 84);
      const gh = 4 + ((seed >>> 17) % 7);
      ng.fillStyle = ((seed >>> 5) & 3) ? "#08160f" : "#0b1e14";
      ng.fillRect(gx, gy - gh, 2, gh);
      ng.fillRect(gx - 2, gy - gh + 2, 2, gh - 2);
      ng.fillRect(gx + 2, gy - gh + 1, 2, gh - 1);
    }
    G.bootScene = nc; G.bootScenePad = PAD; G.bootVX = 742;
  }

  function drawBoot() {
    const t = G.bootT || 0;
    const ease = (a, b) => clamp((t - a) / Math.max(0.0001, b - a), 0, 1);
    const smooth = (v) => v * v * (3 - 2 * v);
    // the light drains as the thing comes down — the reason he looks up
    const gloom = smooth(ease(BOOT.dim, BOOT.fall)) * 0.80;
    const look = smooth(ease(BOOT.dim + 0.3, BOOT.look));
    // ---- CAMERA. A slow drift the whole time, and a tilt up on the look, so
    // the shot is never still. Everything below is drawn through this.
    const camPan = Math.sin(t * 0.22) * 9;
    const camLift = look * 30;
    cx.save();
    cx.translate(Math.round(-camPan), Math.round(camLift));

    bootBake();
    // ---- 1. THE DISTANCE, in two blits. Sky first, then the scene layer at
    // its parallax offset.
    cx.drawImage(G.bootSky, 0, -40);
    const pad = G.bootScenePad;
    cx.drawImage(G.bootScene, -pad - camPan * 0.55, 0);
    // ---- 2. ATMOSPHERE. ONE overlay dims everything in the distance as the
    // light goes. Drawn here so the foreground (fronds, the animal) stays
    // near-black on its own terms rather than being washed twice.
    if (gloom > 0.01) {
      cx.fillStyle = "rgba(3,7,10," + gloom.toFixed(3) + ")";
      cx.fillRect(-40, -40, W + 80, H + 80);
    }
    const vX = G.bootVX - camPan * 0.55, vBase = HZ + 4, vH = 176;
    // stars come out over the dimmed sky
    if (gloom > 0.22) {
      const a = Math.min(0.85, (gloom - 0.22) * 1.6);
      for (let i = 0; i < 60; i++) {
        const sx = (i * 197) % (W + 60) - 30, sy = (i * 89) % (HZ - 60) + 6;
        const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + i);
        cx.fillStyle = "rgba(244,246,241," + (a * tw).toFixed(3) + ")";
        cx.fillRect(sx, sy, (i % 7) ? 2 : 3, (i % 7) ? 2 : 3);
      }
    }
    // the crater glow PULSES, so it stays live rather than baked
    // THE CALDERA. A flat fillRect here read as an orange bar stuck on the
    // summit. It wants to be lava sitting IN a crater, with heat bleeding up
    // out of it: a dark lip, a hot pool, and a soft bloom above.
    const glow = 0.45 + 0.55 * Math.sin(t * 0.9);
    const cy0 = vBase - vH;
    // bloom first, so the lip and pool sit crisply on top of it
    pxDisc(vX - 4, cy0 - 2, 30 + glow * 8, "rgba(255,120,50," + (0.10 + 0.07 * glow).toFixed(3) + ")");
    pxDisc(vX - 4, cy0 - 1, 18 + glow * 5, "rgba(255,150,70," + (0.13 + 0.09 * glow).toFixed(3) + ")");
    // the pool: a shallow lens, brightest at its centre
    for (let i = 0; i < 5; i++) {
      const hw = Math.round(30 - i * 5);
      const a = 0.30 + i * 0.13 + glow * 0.16;
      cx.fillStyle = "rgba(" + (255) + "," + Math.round(96 + i * 26) + "," + Math.round(38 + i * 14) + "," + Math.min(0.95, a).toFixed(3) + ")";
      cx.fillRect(vX - 4 - hw, cy0 + 1 + i, hw * 2, 1);
    }
    // and the dark lip in front of it, so the lava is contained
    cx.fillStyle = "#0a0f12";
    cx.fillRect(vX - 40, cy0 + 6, 72, 3);
    cx.fillRect(vX - 34, cy0 - 1, 8, 2);
    cx.fillRect(vX + 16, cy0 - 1, 9, 2);
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      const px2 = vX - 6 + Math.sin(t * 0.5 + f * 2.4) * (10 + f * 40) + f * 34;
      const py2 = vBase - vH - 8 - f * 46;
      pxDisc(px2, py2, 7 + f * 17, "rgba(26,24,28," + (0.34 - f * 0.033).toFixed(3) + ")");
    }
    // ---- MIST, live: two slow bands over the ridge. Depth for almost nothing,
    // and it has to drift, so it is the one distance element that is not baked.
    for (let i = 0; i < 2; i++) {
      const my = HZ - 34 + i * 20;
      const mx = ((t * (9 + i * 6)) % (W + 240)) - 120;
      cx.fillStyle = "rgba(150,178,168," + (0.05 + 0.03 * i).toFixed(3) + ")";
      cx.fillRect(mx - 260, my, 520, 9 + i * 4);
      cx.fillRect(mx + 300, my + 4, 380, 7);
    }
    // ---- mid-ground fronds, in front of the baked canopy but BEHIND the
    // object, so the middle distance moves too without occluding the ball.
    {
      const sw = (i, amp) => Math.sin(t * (0.5 + i * 0.13) + i * 2.3) * amp;
      const mp = -camPan * 0.9;
      frond(250 + mp, HZ - 96, 150, -0.42 + sw(4, 0.055), 22, "#071310");
      frond(620 + mp, HZ - 74, 132, -2.72 + sw(5, 0.050), 20, "#071310");
    }

    // ---- THE OBJECT. Dark, rim-lit, trailing streaks: you read "meteor"
    // because it is small, falling and on fire. It is the football the whole
    // time — the game's own sprite, at an INTEGER scale so it stays crisp.
    // THE HOLD. Between the reveal and reveal+0.3 the fall barely advances, so
    // the ball hangs for a beat exactly when the audience is realising what it
    // is. Comic timing, and it costs one clamp.
    let fall = ease(BOOT.dim + 0.35, BOOT.land);
    {
      const hold0 = (BOOT.reveal - (BOOT.dim + 0.35)) / (BOOT.land - (BOOT.dim + 0.35));
      const hold1 = (BOOT.reveal + 0.3 - (BOOT.dim + 0.35)) / (BOOT.land - (BOOT.dim + 0.35));
      if (fall > hold0 && fall < hold1) fall = hold0 + (fall - hold0) * 0.18;
      else if (fall >= hold1) fall = hold0 + (hold1 - hold0) * 0.18 + (fall - hold1);
    }
    // the ball stays IN THE SKY. Let it descend into the head band and the
    // silhouette is drawn over its middle, splitting it into two brown chunks —
    // measured, one object at x461-570 cut by the skull. The growing ground
    // SHADOW plus the impact flash sell the landing; the ball itself never has
    // to reach the turf, and this holds regardless of the render transform.
    const drop = HZ - 60;
    const objX = Math.round(W * 0.60 - fall * 58 - camPan * 1.2);
    const objY = Math.round(-16 + fall * drop * 0.66 + fall * fall * drop * 0.34);
    const objR = Math.round(3 + Math.pow(fall, 1.8) * 66);
    const shown = t > BOOT.dim + 0.3;
    // its shadow arrives on the ground before it does — the oldest trick there
    // is for selling something falling toward you, and it is nearly free
    if (shown && objY > 40) {
      const sh = Math.max(4, objR * (0.5 + fall * 0.9));
      cx.fillStyle = "rgba(0,0,0," + (0.20 + 0.42 * fall).toFixed(3) + ")";
      for (let dy = -3; dy <= 3; dy++) {
        const hw = Math.round(sh * Math.sqrt(Math.max(0, 1 - (dy / 3.4) * (dy / 3.4))));
        cx.fillRect(objX - hw, HZ + 44 + dy * 3, hw * 2, 3);
      }
    }
    if (shown) {
      const tail = t < BOOT.reveal ? 1 - smooth(ease(BOOT.fall, BOOT.reveal)) * 0.85 : 0;
      if (tail > 0.02) {
        for (let i = 1; i <= 6; i++) {
          const ty = objY - i * (16 + objR * 0.46) * tail;
          const tw = Math.max(2, Math.round(objR * 0.66 * (1 - i / 7)));
          if (ty > -34) {
            cx.fillStyle = "rgba(255," + (150 + i * 12) + ",63," + (0.30 * tail * (1 - i / 7)).toFixed(3) + ")";
            cx.fillRect(objX - tw, Math.round(ty), tw * 2, 3);
          }
        }
      }
      if (t < BOOT.reveal) {
        pxDisc(objX, objY, objR + 3, "rgba(255,140,50,.20)");
        pxDisc(objX, objY, objR + 1, "rgba(255,190,90,.38)");   // the burning rim
        pxDisc(objX, objY, objR, "#100b06");
      } else {
        const scale = Math.max(2, Math.round(objR / 5));
        cx.save();
        cx.translate(objX, objY);
        cx.rotate((t - BOOT.reveal) * 6.2);
        if (G.ballSpr) cx.drawImage(G.ballSpr, -8 * scale, -5 * scale, 16 * scale, 10 * scale);
        else pxDisc(0, 0, objR, "#7a4a1e");
        cx.restore();
      }
    }

    // ---- 6. NEAR PLANE: giant fronds hanging into frame. This is what makes
    // it a JUNGLE rather than a field at night — the camera is inside the
    // foliage, not looking at it.
    // SWAY. Static foliage is the single loudest "this is a still image" tell,
    // and it costs one sine per frond. Each gets its own rate and phase so they
    // never pulse in unison, and the near ones swing widest because they are
    // closest to the camera.
    const near = "#030805";
    const np = -camPan * 1.5;
    const sway = (i, amp) => Math.sin(t * (0.5 + i * 0.13) + i * 2.3) * amp;
    frond(-30 + np, -20, 330, 1.02 + sway(0, 0.052), 46, near);
    frond(70 + np, -46, 270, 1.24 + sway(1, 0.040), 36, near);
    frond(W + 40 + np, -30, 340, 2.05 + sway(2, 0.048), 48, near);
    frond(W - 60 + np, -60, 250, 1.92 + sway(3, 0.036), 34, near);
    // NOTE the two mid-ground swaying fronds are drawn earlier, with the mist,
    // because anything in this NEAR pass lands on top of the falling ball —
    // which it did, straight across the football at the reveal.

    // ---- 7. THE ANIMAL. A theropod head in profile, authored as a polygon so
    // it reads as a skull and not as a stepped mound. He fills the lower left,
    // snout to the right, and tilts UP on the look. The eye does the acting.
    const bob = Math.sin(t * 2.1) * (1 - look) * 2.6;
    const tilt = 0.085 - look * 0.235;      // nose down grazing, nose up looking
    cx.save();
    cx.translate(Math.round(96), Math.round(322 + bob + look * 16));
    cx.rotate(tilt);
    const SK = 1.24;
    cx.scale(SK, SK);
    const HEAD = [
      [396, 120], [372, 96], [338, 85], [300, 79], [262, 65], [232, 43],
      [196, 25], [152, 17], [102, 23], [56, 43], [18, 77], [-120, 128],
      [-120, 460], [214, 460], [222, 196], [250, 170], [290, 152], [332, 139], [372, 131],
    ];
    // THREE TONES, not one. He is backlit, so he stays very dark — but a single
    // flat fill reads as a cutout pasted over the scene. A base, a slightly
    // lifted dorsal plane where the sky grazes his back and snout, and a darker
    // underside, is enough to make him an object with a form.
    pxPoly(HEAD, "#030805");
    // dorsal plane: the upper surface of the skull and snout
    pxPoly([[152, 17], [196, 25], [232, 43], [262, 65], [300, 79], [338, 85], [372, 96],
      [368, 104], [332, 95], [296, 88], [258, 74], [228, 52], [194, 34], [150, 26], [104, 32], [58, 52]], "#07100a");
    // underside of the jaw, darker still
    pxPoly([[214, 460], [222, 196], [250, 170], [290, 152], [332, 139], [372, 131], [378, 143],
      [336, 151], [296, 164], [258, 182], [236, 206], [230, 460]], "#020603");
    // SCUTES along the brow and neck — the osteoderm row is what says
    // "archosaur" faster than any amount of outline does
    for (let i = 0; i < 9; i++) {
      const f = i / 8;
      const sx2 = 168 - f * 150, sy2 = 20 + f * 34;
      const h2 = 7 - f * 2.5;
      pxPoly([[sx2, sy2], [sx2 + 9, sy2 - 1], [sx2 + 5, sy2 - h2]], "#0c1710");
    }
    // jaw line and a few teeth — tiny marks, but they turn a shape into a jaw
    pxPoly([[236, 176], [372, 132], [378, 140], [242, 186]], "#0a1409");
    for (let i = 0; i < 6; i++) {
      const f = i / 5, jx = 250 + f * 118, jy = 172 - f * 30;
      pxPoly([[jx, jy], [jx + 7, jy - 2], [jx + 4, jy + 8]], "#9aa38f");
    }
    // nostril
    pxPoly([[348, 100], [366, 96], [364, 106], [346, 109]], "#000000");
    // brow ridge catching the last warm light in the sky
    // NO RIM LIGHT. Two attempts at one — first desaturated, then warm and
    // thinned — both read as a stick laid across his skull rather than as light
    // on an edge, because at this scale a highlight long enough to see is long
    // enough to look like a drawn line. The silhouette is stronger clean, and
    // the eye is already the focal point it needs.
    // ---- THE EYE
    const blink = (t > 1.42 && t < 1.56) || (t > 3.34 && t < 3.44);
    const wide = t >= BOOT.reveal ? 1 : 0;
    // A REAL EYE, in four parts. It was a flat cream disc, which is the one
    // thing in the frame the viewer looks at, so it has to hold up: a sunken
    // socket, an AMBER IRIS with a hotter inner ring, a vertical reptile slit,
    // and one specular block. The slit widens at the punchline.
    const eH = blink ? 5 : Math.round(34 + wide * 10);
    const eCx = 176, eCy = 66;
    pxDisc(eCx, eCy, eH / 2 + 5, "#010402");                    // socket
    if (!blink) {
      pxDisc(eCx, eCy, eH / 2, wide ? "#e8a63a" : "#b8791f");   // iris
      pxDisc(eCx, eCy, eH / 2 - 4, wide ? "#ffd98a" : "#d99a34"); // hotter centre
      const pupW = Math.round(7 + wide * 6);
      const pupH = Math.round(eH * 0.86);
      const px2 = Math.round(eCx - pupW / 2 + look * 9);
      const py2 = Math.round(eCy - pupH / 2 + (1 - look) * 5);
      cx.fillStyle = "#04070a";
      cx.fillRect(px2, py2, pupW, pupH);                        // the slit
      cx.fillStyle = "#fffdf2";
      cx.fillRect(px2 + pupW + 2, py2 + 4, 3, 3);               // specular
      // a lid line over the top of the eye so it sits IN the skull
      cx.fillStyle = "#060f09";
      cx.fillRect(eCx - eH / 2 - 4, eCy - eH / 2 - 2, eH + 8, 3);
    } else {
      cx.fillStyle = "#0a1207";
      cx.fillRect(eCx - 20, eCy - 1, 40, 4);
    }
    cx.restore();

    // ---- WHAT HE THINKS IT IS. The joke, stated: a meteor in the bubble,
    // which becomes a football at the reveal.
    if (t > BOOT.look + 0.25 && t < BOOT.land + 0.2) {
      const bx = Math.round(W * 0.30), by = Math.round(150);
      const grow = smooth(ease(BOOT.look + 0.25, BOOT.look + 0.55));
      const R = Math.round(38 * grow);
      if (R > 4) {
        pxDisc(bx - 40, by + 62, Math.round(5 * grow), "rgba(240,244,235,.9)");
        pxDisc(bx - 26, by + 42, Math.round(9 * grow), "rgba(240,244,235,.9)");
        pxDisc(bx, by, R, "rgba(240,244,235,.94)");
        pxDisc(bx - R * 0.5, by - R * 0.42, Math.round(R * 0.5), "rgba(240,244,235,.94)");
        pxDisc(bx + R * 0.52, by - R * 0.3, Math.round(R * 0.46), "rgba(240,244,235,.94)");
        if (t < BOOT.reveal) {
          pxDisc(bx + 2, by + 2, 12, "#120d08");
          cx.fillStyle = "#e2622b";
          cx.fillRect(bx - 24, by - 12, 13, 3); cx.fillRect(bx - 28, by - 2, 15, 3);
        } else if (G.ballSpr) {
          cx.drawImage(G.ballSpr, bx - 18, by - 11, 36, 22);
        }
      }
    }

    // ---- EMBERS. Ash from the volcano, drifting up-left across every plane.
    for (let i = 0; i < 16; i++) {
      const life = (t * 0.28 + i * 0.0625) % 1;
      const ex = (vX - 40 - life * 520 + Math.sin(t * 0.8 + i) * 26);
      const ey = vBase - vH - life * 150 + Math.cos(t * 0.6 + i * 2) * 16;
      const a = (1 - life) * 0.6;
      if (a > 0.03 && ey > -20) {
        cx.fillStyle = "rgba(255," + (140 + ((i * 13) % 70)) + ",70," + a.toFixed(3) + ")";
        cx.fillRect(Math.round(ex), Math.round(ey), 2, 2);
      }
    }
    cx.restore();

    // ---- IMPACT. A hard white frame, then dust, then the world settles.
    if (!G.bootThud && t >= BOOT.land) {
      G.bootThud = true;
      G.shake = Math.max(G.shake || 0, 0.62);
      sfx.doink(); crowdCheer(0.5);
    }
    if (t > BOOT.fall && t < BOOT.land) G.shake = Math.max(G.shake || 0, 0.12 * ease(BOOT.fall, BOOT.land));
    if (!G.bootWhoosh && t >= BOOT.look) { G.bootWhoosh = true; beep(140, 1.9, "sawtooth", 0.055); }
    const flash = 1 - clamp((t - BOOT.land) / 0.22, 0, 1);
    if (t >= BOOT.land && flash > 0) {
      cx.fillStyle = "rgba(255,244,214," + (flash * 0.85).toFixed(3) + ")";
      cx.fillRect(0, 0, W, H);
    }
    // ---- THE PAYOFF. A flash on its own is a cut, not an impact. Three things
    // land together: a dust ring running out along the ground, debris thrown up
    // out of it, and — the part that sells the scale — every pterosaur in the
    // canopy breaking for the sky at once.
    if (t >= BOOT.land) {
      const bt = t - BOOT.land;
      // dust ring: expanding, thinning, hugging the turf
      if (bt < 1.5) {
        const rr = 30 + bt * 300;
        const a = Math.max(0, 0.5 - bt * 0.34);
        for (let k = 0; k < 3; k++) {
          const r2 = rr - k * 22;
          if (r2 < 8) continue;
          cx.fillStyle = "rgba(196,186,150," + (a * (1 - k * 0.3)).toFixed(3) + ")";
          for (let dy = -2; dy <= 2; dy++) {
            const hw = Math.round(r2 * Math.sqrt(Math.max(0, 1 - (dy / 2.6) * (dy / 2.6))));
            cx.fillRect(objX - hw, HZ + 48 + dy * 4, 5, 3);
            cx.fillRect(objX + hw - 5, HZ + 48 + dy * 4, 5, 3);
          }
        }
      }
      // debris thrown up out of the ring
      if (bt < 1.1) {
        for (let i = 0; i < 22; i++) {
          const sd = ((i * 2654435761) >>> 0);
          const dir = (sd & 1) ? 1 : -1;
          const sp = 90 + (sd >>> 7) % 200;
          const dx2 = objX + dir * sp * bt * (0.5 + ((sd >>> 3) % 5) / 10);
          const dy2 = HZ + 44 - (170 + ((sd >>> 11) % 90)) * bt + 300 * bt * bt;
          if (dy2 > HZ + 52) continue;
          cx.fillStyle = "rgba(176,166,132," + Math.max(0, 0.75 - bt * 0.7).toFixed(3) + ")";
          cx.fillRect(Math.round(dx2), Math.round(dy2), 3, 3);
        }
      }
      // PTEROSAURS. Nine of them off the canopy, each on its own heading, wings
      // beating on its own phase. Two authored cels — wings up, wings down —
      // because a flap is what makes a silhouette a living thing.
      for (let i = 0; i < 9; i++) {
        const ph = i * 0.83;
        const bx = Math.round(180 + i * 74 - bt * (86 + i * 16));
        const by = Math.round(HZ - 52 - bt * (54 + (i % 3) * 22) - Math.sin(bt * 5 + ph) * 7);
        if (bx < -30 || by < -24) continue;
        cx.fillStyle = "#0b1712";
        if (Math.sin(bt * 12 + ph) > 0) {
          cx.fillRect(bx - 7, by, 6, 2); cx.fillRect(bx + 2, by, 6, 2);
          cx.fillRect(bx - 1, by + 1, 3, 2);
        } else {
          cx.fillRect(bx - 7, by - 4, 5, 2); cx.fillRect(bx + 3, by - 4, 5, 2);
          cx.fillRect(bx - 3, by - 2, 3, 2); cx.fillRect(bx + 1, by - 2, 3, 2);
          cx.fillRect(bx - 1, by, 3, 2);
        }
      }
    }
    // ---- and out to the title
    const out = smooth(ease(BOOT.land + 0.5, BOOT_LEN));
    if (out > 0) { cx.fillStyle = "rgba(5,12,8," + out.toFixed(3) + ")"; cx.fillRect(0, 0, W, H); }
    cx.textAlign = "center";
    cx.font = PF(8); cx.fillStyle = "rgba(157,176,164,.55)";
    cx.fillText("ENTER / TAP TO SKIP", W / 2, H - 16);
  }
  function drawTitle() {
    // the cold open owns the first BOOT_LEN seconds of the title state
    if ((G.bootT || 0) < BOOT_LEN) { drawBoot(); return; }
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
    // Raw cel tick — each species moduloes by ITS OWN frame count at the draw
    // sites below. This used to be `% 2`, which threw away half of every 4-frame
    // walk cycle (the mirrored contact and pass-down cels added in the 08-07
    // animation pass), so both showcase headliners strode on one leg.
    const fi = ((performance.now() / 130) | 0);
    const feat = (kind, fx, dy) => {
      if (!kind) return;
      if (flip) { cx.save(); cx.translate(2 * (fx + 44), 0); cx.scale(-1, 1); }
      drawQBFeature(kind, fx, 262 + (dy || 0), 88);
      if (flip) cx.restore();
    };
    const dk = flip ? "L" : "R";
    if (sheet && sheet.troodon) {
      const dirSet = flip ? sheet.troodon.L : sheet.troodon.R;
      cx.drawImage(dirSet[fi % dirSet.length], runX - 44, 262, 88, 88);
      const qf = QB_ID[ab];
      // the showcase animates — the headband rides the frame's pixels
      if (qf && qf[1] !== "small") feat(qf[1], runX - 44,
        frameBobDy(sheet.troodon, dk, fi % dirSet.length) * (88 / sheet.troodon.h));
    }
    if (sheet && sheet[spec]) {
      const dirSet = flip ? sheet[spec].L : sheet[spec].R;
      cx.drawImage(dirSet[fi % dirSet.length], runX - 44 + (flip ? 130 : -130), 262, 88, 88);
      feat(RAMP_FEAT[ab], runX - 44 + (flip ? 130 : -130),
        frameBobDy(sheet[spec], dk, fi % dirSet.length) * (88 / sheet[spec].h));
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
    // every block lives in a PANEL — floating text read as unfinished
    // (owner play-test 2026-08-07: "stuff is outside of boxes")
    const panel = (px, py, pw, ph) => {
      cx.fillStyle = "rgba(13,37,25,.88)"; cx.fillRect(px, py, pw, ph);
      cx.strokeStyle = "#1d4030"; cx.lineWidth = 2; cx.strokeRect(px, py, pw, ph);
    };
    panel(W / 2 - 250, 8, 500, 26);   // gameday strip
    cx.textAlign = "center"; cx.font = PF(11); cx.fillStyle = "#9db0a4";
    cx.fillText("● GAMEDAY · " + (G.weather.month || "SEP") + " · " + (G.stadium.dome ? "DOME" : (G.stadium.time || "day").toUpperCase()) +
      " · " + G.weather.type + " · " + (G.weather.temp != null ? G.weather.temp + "°F" : "") + " ●", W / 2, 26);
    panel(28, 42, 340, 44); panel(W - 368, 42, 340, 44);   // team nameplates
    cx.font = PF(20);
    cx.fillStyle = hudColor(G.my); cx.textAlign = "left"; cx.fillText(tA[0].toUpperCase(), 40, 70);
    cx.fillStyle = hudColor(G.opp); cx.textAlign = "right"; cx.fillText(tB[0].toUpperCase(), W - 40, 70);
    cx.textAlign = "center"; cx.font = PF(10); cx.fillStyle = "#f4f6f1";
    cx.fillText("OVR " + rA.ovr, 320, 70); cx.fillText("OVR " + rB.ovr, W - 320, 70);
    cx.font = PF(22); cx.fillStyle = "#ffd23f"; cx.fillText("VS", W / 2, 70);
    panel(28, 94, 340, 200); panel(W - 368, 94, 340, 200);  // starter columns

    // starter columns
    const roles = ["QB", "RB", "WR1", "WR2", "TE"];
    const slot = (r, i) => r.offense.filter((p) => p.role === (i.startsWith("WR") ? "WR" : i))[i === "WR2" ? 1 : 0];
    function drawCol(ros, abbr, x0, align) {
      cx.textAlign = align;
      let y = 118;
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
        const fi2 = t % sheet[spec].R.length;
        cx.drawImage(sheet[spec].R[fi2], cx0 - 32, 306, 64, 64);
        // the signature feature rides the animated frame's pixels
        if (RAMP_FEAT[abbr]) drawQBFeature(RAMP_FEAT[abbr], cx0 - 32,
          306 + frameBobDy(sheet[spec], "R", fi2) * (64 / sheet[spec].h), 64);
      }
      cx.textAlign = "center"; cx.font = PF(8); cx.fillStyle = "#ff5533"; cx.fillText("★ RAMPAGER · " + pos, cx0, 300);
      cx.font = PF(10); cx.fillStyle = "#fff"; cx.fillText(info[0].toUpperCase().slice(0, 16), cx0, 382);
      cx.font = PF(9); cx.fillStyle = "#ffd23f"; cx.fillText(pk.label, cx0, 401);
    };
    cx.fillStyle = "rgba(255,85,51,.08)"; cx.fillRect(W / 2 - 260, 285, 520, 150);
    cx.strokeStyle = "#ff5533"; cx.strokeRect(W / 2 - 260, 285, 520, 150);
    showRamp(G.my, W / 2 - 150, "A");
    showRamp(G.opp, W / 2 + 150, "B");
    // passive descriptions — WRAPPED inside each half of the card. Unwrapped
    // text bled through the borders (owner play-test 2026-08-07).
    const wrapText = (text, cxp, y0, maxW, maxLines) => {
      const words = String(text).split(/\s+/);
      let line = "", lines = [];
      for (const w2 of words) {
        const tryLine = line ? line + " " + w2 : w2;
        if (cx.measureText(tryLine).width > maxW && line) { lines.push(line); line = w2; }
        else line = tryLine;
      }
      if (line) lines.push(line);
      if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += "…"; }
      lines.forEach((l, i) => cx.fillText(l, cxp, y0 + i * 11));
    };
    cx.textAlign = "center"; cx.font = PF(7); cx.fillStyle = "#9db0a4";
    wrapText((PASSIVES[(RAMPAGERS[G.my] || [0, "truck"])[1]]).desc, W / 2 - 132, 414, 226, 2);
    wrapText((PASSIVES[(RAMPAGERS[G.opp] || [0, "truck"])[1]]).desc, W / 2 + 132, 414, 226, 2);

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
    // WHAT WAS BROKEN: this whole feature vocabulary IS pixel art, but on the
    // field it is scaled by spr.w/44 — a fraction — so every rect landed at a
    // fractional coordinate with a fractional size and the canvas anti-aliased
    // its edges into a smear on the head of every QB and every apex rampager.
    // Same law as the aim overlay (AA_TRANSFORMATION §1: "fillRect at integer
    // coords, one palette"). Measured on a live QB: every feature rect was
    // fractional in BOTH position and size (e.g. 510.09, 101.91, 8.727x1.455).
    // The gallery (s = 44) and the pregame card (s = 88) have an integer k, so
    // their art is byte-identical — this only snaps the in-game scaling.
    const P = (bx, by, bw, bh, c) => {
      cx.fillStyle = c;
      cx.fillRect(Math.round(x + bx * k), Math.round(y + by * k),
        Math.max(1, Math.round(bw * k)), Math.max(1, Math.round(bh * k)));
    };
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
      // P0: the Flask-only URL 404s on the Firebase host, and the old
      // `.catch(() => { G.scoutData = []; })` defeated this very `if (!G.scoutData)`
      // guard — one silent failure and SCOUTING stayed a blank table forever.
      // Fall back to the statically-hosted roster, and leave scoutData NULL on
      // total failure so re-entering the screen retries.
      fetch("/api/game/players").then((r) => (r.ok ? r.json() : Promise.reject()))
        .catch(() => fetch("/game/players.json").then((r) => r.json()))
        .then((d) => { const l = d.players || d; if (Array.isArray(l) && l.length) G.scoutData = l; })
        .catch(() => { G.scoutData = null; });
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
    const saved = lsJSON("dinobowl_customplay", null, (v) => v.routesRaw && typeof v.routesRaw === "object");
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
      lsSet("dinobowl_customplay", JSON.stringify({ routes, routesRaw: G.ed.routes }));
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
    // shape-validated: an older save held only routesRaw, and reading
    // saved.routes.WR1 off it threw on the play-call screen
    const saved = lsJSON("dinobowl_customplay", null, (v) => v.routes && typeof v.routes === "object");
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
  function saveFranchise(f) { lsSet("dinobowl_franchise", JSON.stringify(f)); }
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
    "SETTINGS": ["stego", "⚙"],
    "PLAY GAME": ["trex", "🏈"], "PLAY SEASON": ["spino", "📅"], "MORE MODES": ["carno", "🦖"],
  };
  function menuCardRects() {
    const opts = activeMenuOptions();
    const { cols, cw, chh, gapx, gapy } = menuGrid();
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
    cx.fillText(menuIsGrid()
      ? "ARROWS + ENTER · TAP A CARD · ESC = MAIN MENU"
      : "ARROWS + ENTER · TAP A CARD · ESC = TITLE", W / 2, H - 14);
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
  // Play-card minis are CHALKBOARD DIAGRAMS: pixel dots on the palette with
  // the gold primary read telling you the play's intent at a glance — the
  // old solid #69be28 strokes made all four cards read as identical green
  // scribbles (owner play-test 2026-08-06).
  function miniDots(pts, color, size) {
    const s = size || 2;
    cx.fillStyle = color;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!len) continue;
      const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      for (let d = 0; d <= len; d += 4) {
        cx.fillRect(Math.round(a.x + ux * d) - 1, Math.round(a.y + uy * d) - 1, s, s);
      }
    }
  }
  function miniChevron(a, b, color) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    cx.save();
    cx.translate(Math.round(b.x), Math.round(b.y));
    cx.rotate(ang);
    cx.lineWidth = 1; cx.strokeStyle = color;
    cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-4, -3); cx.moveTo(0, 0); cx.lineTo(-4, 3); cx.stroke();
    cx.restore();
  }
  function drawMiniPlay(play, cxx, cyy) {
    if (!play.routes && play.type !== "run") {
      // defensive call: X marks
      cx.font = PF(9); cx.fillStyle = "#ff7a6b"; cx.textAlign = "center";
      const n = play.rush || 3;
      cx.fillText("RUSH " + n, cxx, cyy);
      cx.fillText(play.man ? "MAN COVER" : "ZONE COVER", cxx, cyy + 22);
      return;
    }
    // LOS tick: a dotted sage line so every diagram reads as a piece of field
    cx.fillStyle = "rgba(157,176,164,.5)";
    for (let y = cyy - 30; y <= cyy + 34; y += 5) cx.fillRect(Math.round(cxx - 42), y, 1, 2);
    if (play.type === "run") {
      const lane = play.lane || 0;
      const pts = [
        { x: cxx - 20, y: cyy + 16 },
        { x: cxx - 6, y: cyy + 16 },
        { x: cxx + 26, y: cyy + 16 + lane * 18 - 8 },
      ];
      miniDots(pts, "#ffd23f");
      miniChevron(pts[1], pts[2], "#ffd23f");
      cx.fillStyle = "#f4f6f1"; cx.fillRect(cxx - 24, cyy + 13, 6, 6);
      return;
    }
    const offs = [[-46, -24], [-30, -10], [14, 10], [34, 24], [-40, 30]];
    const keysR = ["WR1", "WR3", "TE", "WR2", "RB"];
    const prim = play.primary || "WR1";
    for (let i = 0; i < keysR.length; i++) {
      const rt = play.routes[keysR[i]];
      if (!rt || rt.end === "block") continue;
      let px = cxx - 50 + 8, py = cyy + offs[i][1];
      const pts = [{ x: px, y: py }];
      for (const [dyd, dy] of rt.pts) { px += dyd * 2.4; py += dy * 0.22; pts.push({ x: px, y: py }); }
      if (rt.end === "go") pts.push({ x: px + 16, y: py });
      const isPrim = keysR[i] === prim;
      miniDots(pts, isPrim ? "#ffd23f" : "rgba(244,246,241,.55)");
      if (isPrim) miniChevron(pts[pts.length - 2], pts[pts.length - 1], "#ffd23f");
      else {
        cx.fillStyle = "rgba(244,246,241,.55)";
        cx.fillRect(Math.round(pts[pts.length - 1].x) - 1, Math.round(pts[pts.length - 1].y) - 1, 2, 2);
      }
    }
  }

  // Retro Bowl-style route art: thick color-coded polylines with arrowheads.
  // The routes on the turf ARE the play call.
  // Route previews are PIXEL ART, not vector strokes: marching 3x3 chalk
  // dots with a turf shadow, and a chunky pixel chevron at the break.
  // Solid anti-aliased blue/green lines read as modern flat design and
  // killed the retro vibe (owner play-test 2026-08-06).
  function drawRoutePoly(pts, color, endDot) {
    if (pts.length < 2) return;
    const march = (performance.now() / 110) % 7;   // dots crawl along the route
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (!segLen) continue;
      const ux = (b.x - a.x) / segLen, uy = (b.y - a.y) / segLen;
      for (let d = march; d < segLen; d += 7) {
        const px = (a.x + ux * d) | 0, py = (a.y + uy * d) | 0;
        cx.fillStyle = "rgba(0,26,12,.55)";
        cx.fillRect(px - 1, py, 4, 4);               // painted-on-turf shadow
        cx.fillStyle = color;
        cx.fillRect(px - 1, py - 1, 3, 3);
      }
    }
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    if (endDot) {
      // settle spot: a hollow pixel square, like chalk on the grass
      cx.strokeStyle = color; cx.lineWidth = 2;
      cx.strokeRect((b.x | 0) - 4, (b.y | 0) - 4, 9, 9);
      return;
    }
    // chunky chevron: three shrinking pixel bars pointing up the route
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    cx.fillStyle = color;
    for (let s = 0; s < 3; s++) {
      const hx = b.x + ca * (3 + s * 3), hy = b.y + sa * (3 + s * 3);
      const half = 6 - s * 2;
      for (let k = -half; k <= half; k += 3) {
        cx.fillRect(((hx - sa * k) | 0) - 1, ((hy + ca * k) | 0) - 1, 3, 3);
      }
    }
  }
  function drawPresnapUI() {
    if (offenseIsUser() && G.curPlay) {
      if (G.curPlay.type === "pass") {
        for (const e of G.players) {
          if (e.team !== "off") continue;
          // the blocking back's leak-out checkdown: white line with a dot
          if (e.role === "RB" && e.rbRelease != null) {
            const side = e.y >= MID ? 1 : -1;
            drawRoutePoly([
              { x: e.x - G.camX, y: e.y },
              { x: e.x - G.camX + 2 * YPX, y: clamp(e.y + side * 55, TOP + 12, BOT - 12) },
              { x: e.x - G.camX + 5 * YPX, y: clamp(e.y + side * 80, TOP + 12, BOT - 12) },
            ], "#f4f6f1", true);
            continue;
          }
          if (!e.path || !e.path.length || e.state === "block") continue;
          const pts = [{ x: e.x - G.camX, y: e.y }].concat(e.path.map((wp) => ({ x: wp.x - G.camX, y: wp.y })));
          if (e.endMode === "go") {
            const lp = pts[pts.length - 1];
            pts.push({ x: lp.x + 80, y: lp.y });
          }
          // palette color code: GOLD = the play's primary read, chalk = the
          // rest, sage = the back — the routes team WITH the field now
          const prim = (G.curPlay && G.curPlay.primary) || "WR1";
          const col = e.role === prim ? "#ffd23f" : e.role === "RB" ? "#9db0a4" : "rgba(244,246,241,.8)";
          drawRoutePoly(pts, col, e.role === "RB" && e.endMode !== "go");
        }
      } else {
        // run play: the lane is THE play — it gets the gold
        const rb = G.players.find((e) => e.team === "off" && e.role === "RB");
        if (rb) {
          const laneY = clamp(MID + (G.curPlay.lane || 0) * 44, TOP + 16, BOT - 16);
          drawRoutePoly([
            { x: rb.x - G.camX, y: rb.y },
            { x: rb.x - G.camX + 60, y: (rb.y + laneY) / 2 },
            { x: rb.x - G.camX + 170, y: laneY },
          ], "#ffd23f", false);
        }
      }
    }
    // down & distance plate ON the field at the line of scrimmage
    if (!G.patMode) {
      // Same reason as the LOS stripe: on an extra point the snap is at
      // enterKick's fixed origin, not at the touchdown's line of scrimmage, so
      // anchoring the plate to G.losYd would strand it ~17 yards downfield of
      // the formation. Gated on state "kick" so a spent G.kick cannot drag the
      // plate into the next drive.
      const losX = xAtYd(G.state === "kick" && G.kick && G.kick.originYd != null ? G.kick.originYd : G.losYd) - G.camX;
      if (losX > -80 && losX < W + 80) {
        const txt = downText();
        cx.font = PF(10); cx.textAlign = "center";
        const w2 = cx.measureText(txt).width + 26;
        cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(losX - w2 / 2 - 60, MID + 62, w2, 24);
        cx.strokeStyle = "rgba(244,246,241,.35)"; cx.strokeRect(losX - w2 / 2 - 60, MID + 62, w2, 24);
        cx.fillStyle = "#f4f6f1"; cx.fillText(txt, losX - 60, MID + 79);
      }
    }
    // CHANGE PLAY chip — top-right, like the reference
    if (!G.patMode && (offenseIsUser() || defenseHumanSteers())) {
      cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(W - 196, 44, 178, 40);
      cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2; cx.strokeRect(W - 196, 44, 178, 40);
      cx.font = PF(9); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
      cx.fillText(offenseIsUser() ? "CHANGE PLAY" : "CHANGE DEFENSE", W - 107, 60);
      cx.font = PF(7); cx.fillStyle = "#9db0a4";
      const name = offenseIsUser() ? (G.curPlay ? G.curPlay.name : "") : (G.defCall ? G.defCall.name : "");
      cx.fillText("⟳ " + name, W - 107, 76);
    }
    // star players: yellow star + soft gold pulse + initials (Retro style)
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    for (const e of G.players) {
      if (!e.apex) continue;
      const ex = e.x - G.camX;
      if (ex < -20 || ex > W + 20) continue;
      cx.save(); cx.globalAlpha = 0.25 + 0.25 * pulse;
      cx.fillStyle = "#ffd23f";
      cx.beginPath(); cx.ellipse(ex, e.y + 5, 13, 5, 0, 0, Math.PI * 2); cx.fill();
      cx.restore();
      cx.font = PF(8); cx.textAlign = "center"; cx.fillStyle = "#ffd23f";
      cx.fillText("★", ex, e.y - 40);
      if (e.routeEligible && e.name) {
        const init = e.name.split(" ").map((w) => w[0]).join(".");
        cx.font = PF(7); cx.fillStyle = "rgba(244,246,241,.85)";
        cx.fillText(init, ex + 16, e.y - 30);
      }
    }
    cx.textAlign = "center"; cx.font = PF(9);
    cx.fillStyle = "rgba(0,0,0,.55)"; cx.fillRect(W / 2 - 290, H - 30, 580, 22);
    cx.fillStyle = "#ffd23f";
    // the footer teaches the SIGNATURE gesture, not the fallback
    cx.fillText(offenseIsUser()
      ? "HOLD YOUR QB & PULL BACK = SNAP + THROW  ·  SPACE = SNAP  ·  Q/E = CHANGE PLAY"
      : "TAP A DINO TO CONTROL HIM  ·  SPACE = SNAP  ·  Q/E = CHANGE DEFENSE", W / 2, H - 14);
    // first-3-snaps coach bubble floats over the QB himself
    if (offenseIsUser() && (G.snapTaught || 0) < 3 && !G.patMode) {
      const qb2 = G.players.find((p) => p.team === "off" && p.role === "QB");
      if (qb2) {
        const bx2 = qb2.x - G.camX, pulse = Math.sin(performance.now() / 260) * 2;
        cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(bx2 - 84, qb2.y - 58 + pulse, 168, 18);
        cx.strokeStyle = "#ffd23f"; cx.lineWidth = 1; cx.strokeRect(bx2 - 84, qb2.y - 58 + pulse, 168, 18);
        cx.font = PF(7); cx.fillStyle = "#ffd23f";
        cx.fillText("HOLD ME + PULL BACK ⟵", bx2, qb2.y - 45 + pulse);
      }
    }
  }

  // ------------------------------------------------ pixel overlay primitives
  // WHAT WAS BROKEN: the aim overlay — the single gesture the whole game is
  // built on — was the one thing on the field drawn as ANTI-ALIASED VECTOR ART.
  // AA_TRANSFORMATION §1 states the law: "fillRect at integer coords, one
  // palette, no anti-aliased vector strokes anywhere near the field", and the
  // owner has already rejected this exact class once (the round-cap route
  // strokes in off-palette blue/mint). Census of ONE live frame with the aim
  // loaded, recorded through a counting ctx: 2 setLineDash + 1 ctx.arc +
  // 1 ctx.ellipse + 20 moveTo/lineTo path vertices in the aim/soar tints, and
  // every single one of them at a FRACTIONAL coordinate (the camera scroll is
  // fractional, so nothing snapped). These two helpers are the pixel
  // equivalents; the overlay now draws with nothing but fillRect on integers.
  // A chunky dotted line. step = pixels between stamps (step <= size draws solid).
  function pxDotLine(x0, y0, x1, y1, step, size, col) {
    cx.fillStyle = col;
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    const o = size >> 1;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      cx.fillRect(Math.round(x0 + (x1 - x0) * k) - o, Math.round(y0 + (y1 - y0) * k) - o, size, size);
    }
  }
  // A pixel RING: midpoint-circle rasterisation on 8-fold symmetry, stamped as
  // 2px blocks with every other step skipped, so it reads as a dotted 8-bit
  // reticle rather than a smooth outline. Centre and radius are the ones the
  // ctx.arc used, so the AA pass's "SIZE = the real scatter" contract is intact.
  function pxRing(cxp, cyp, r, col) {
    cx.fillStyle = col;
    const ox = Math.round(cxp), oy = Math.round(cyp);
    let x = Math.max(2, Math.round(r)), y = 0, err = 1 - x, i = 0;
    while (x >= y) {
      if ((i++ & 1) === 0) {
        cx.fillRect(ox + x - 1, oy + y - 1, 2, 2); cx.fillRect(ox + y - 1, oy + x - 1, 2, 2);
        cx.fillRect(ox - y - 1, oy + x - 1, 2, 2); cx.fillRect(ox - x - 1, oy + y - 1, 2, 2);
        cx.fillRect(ox - x - 1, oy - y - 1, 2, 2); cx.fillRect(ox - y - 1, oy - x - 1, 2, 2);
        cx.fillRect(ox + y - 1, oy - x - 1, 2, 2); cx.fillRect(ox + x - 1, oy - y - 1, 2, 2);
      }
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }
  // ONE tint ramp for every aim cue. The green is the game's own #69be28: the
  // ring used rgba(126,214,60), a near-miss that existed nowhere else in the
  // file, which is the same off-palette drift the owner rejected in the route art.
  const aimTint = (risk) => risk < 0.24 ? "rgba(105,190,40,.95)" : risk < 0.56 ? "rgba(255,210,63,.95)" : "rgba(255,85,51,.95)";

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
      // the preview NEVER lies: the arc and ring live at the point the ball
      // can actually reach (same clamp the throw applies) — the owner found
      // balls landing short of the marker on max-range pulls (2026-08-07)
      const a = clampThrowRange(qb, { x: G.aim.x, y: G.aim.y });
      // ...and now it does not lie about the FLIGHT either. WHAT WAS BROKEN:
      // the preview solved its own arc and its own hang time, and the throw
      // solved different ones. `pull` — how far back you dragged — lowers the
      // lob's apex by up to 40% and stretches its hang time by up to 8%;
      // drawBall applies it to the ball, throwLob stores it on the ball, and
      // this preview ignored it. Measured across pull 0.05→1.00 at four aim
      // depths: the drawn apex was off by −37%..+25% and the previewed hang
      // time by −19%..+8%, so `win.risk` — the tint — was reading a flight
      // NEITHER throw makes (the preview's T is used inside assessPassWindow's
      // own closing-distance term, so this is the read, not decoration).
      // ONE pull, ONE T, ONE apex, shared with throwLob and drawBall.
      // The RING previews the LOB, because releasing this gesture throws a lob;
      // the SPACE bullet is a different flight and gets its own cue below.
      const pull = G.slingPull == null ? 0.7 : G.slingPull;    // throwLob's own default
      const d = dist(qb, a);
      const T = (0.55 + d / 470) * (0.8 + 0.28 * pull);        // == throwLob
      const h = clamp(d * 0.17, 20, 74) * (0.6 + 0.65 * pull); // == drawBall's lob apex
      // the windup: a taut "rubber band" from the QB back toward the pull
      const bx = qb.x - (a.x - qb.x) * 0.22, by = qb.y - (a.y - qb.y) * 0.22;
      pxDotLine(qb.x - G.camX, qb.y, bx - G.camX, by, 2, 3, "rgba(255,138,92,.9)");
      // the flight path as pixel pips on the SAME parabola the ball will fly.
      // The old dash pattern was [5,6] — an 11px period — so the pip spacing
      // keeps that density and the read is unchanged.
      const n = clamp(Math.round(d / 11), 8, 48);
      cx.fillStyle = "#ffd23f";
      for (let i = 0; i <= n; i++) {
        const k = i / n;
        cx.fillRect(Math.round(qb.x + (a.x - qb.x) * k - G.camX) - 1,
          Math.round(qb.y + (a.y - qb.y) * k - h * 4 * k * (1 - k)) - 1, 3, 3);
      }
      // Retro Bowl read: a clean landing RING — the football, the routes and
      // your eyes are the interface; no labels, no targeting computer.
      // The AA pass makes the ring HONEST without adding a single word:
      // TINT = the pass window the engine already computes (green/amber/red),
      // SIZE = the real weather scatter + wind drift on this throw. Pure
      // surfaced truth (LESSON #19: the player can always see WHY).
      const tgt = pickPassTarget(a);
      const win = assessPassWindow(qb, tgt, a, T);
      const drift = Math.hypot(G.weather.wind.x, G.weather.wind.y) * T * 1.6;
      const ringR = clamp(11 + weatherScatter() * 0.5 * 0.7 + drift * 0.5, 11, 26);
      pxRing(a.x - G.camX, a.y, ringR, aimTint(win.risk));
      // ...and the CENTRE PIP carries the SPACE-BULLET's read, because ONE
      // reticle serves TWO throws and one tint cannot be honest about both. A
      // bullet flies d/430 rather than the lob's T, and over 15,400
      // frame x receiver x pull samples the two land in DIFFERENT tint buckets
      // 62% of the time — and the bullet is not simply the safer ball, it reads
      // WORSE on 21% of samples (a faster ball also arrives closer to where the
      // receiver actually is, which cuts the placement penalty). Ring = what
      // RELEASE will throw, pip = what SPACE will throw. No new words on screen.
      // If this reads as clutter, one line reverts it: pass aimTint(win.risk).
      cx.fillStyle = aimTint(assessPassWindow(qb, tgt, a, d / 430).risk);
      cx.fillRect(Math.round(a.x - G.camX) - 1, Math.round(a.y) - 1, 3, 3);
    }

    // soar aim — a defender launching himself wings-open at a target point
    if (G.soarAim && G.controlled) {
      const s = G.controlled, a = G.soarAim;
      // same class of violation as the throw preview above, same fix: this was
      // a dashed 2px vector stroke plus a ctx.arc, both at fractional coords
      pxDotLine(s.x - G.camX, s.y, a.x - G.camX, a.y, 9, 3, "#8ecafc");
      pxRing(a.x - G.camX, a.y, 12, "#8ecafc");
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
    // The cursor has to be the number the LATCHED model is actually using.
    // During a pull that is the pull-derived power — the sine drives nothing
    // then, and the bright bar used to sweep the AIM lane through the whole
    // drag (measured: shown 98.05 on the aim lane while the kick went out at
    // power 52.94). While a press is still undecided the cursor FREEZES on the
    // value the press sampled, so a tap visibly stops the bar where the player
    // stopped it even though the commit waits for the release.
    const dragPower = k.mode === "drag" ? clamp((k.pull || 0) / 1.7, 5, 100) : null;
    const val = dragPower != null ? dragPower
      : k.press ? k.press.val
        : powerStage ? k.val : (k.stage === 1 ? k.val : k.acc + 50);
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
    const stageText = k.mode === "drag"
      ? (k.kind === "KO" ? "KICK DEPTH — PULL INTO THE GREEN" : "KICK POWER — PULL INTO THE GREEN")
      : powerStage ? (k.kind === "KO" ? "KICK DEPTH — STOP IN THE GREEN" : "KICK POWER — STOP IN THE GREEN") : "AIM — STOP IN THE GREEN";
    cx.fillText(stageText, W / 2, 217);
    if (!k.cpu) {
      cx.font = PF(8); cx.fillStyle = "#9db0a4";
      // The footer advertised BOTH control schemes for the whole kick even
      // though only one of them is live once a kick is latched. It now names
      // the model that actually owns this kick, and only offers the choice
      // while the choice is still open.
      const hint = k.mode === "drag" ? "PULL BACK FOR POWER  ·  RELEASE TO KICK  ·  EASE OFF TO REGRIP"
        : k.mode === "meter" ? "TAP OR SPACE TO STOP THE BAR  ·  " + (powerStage ? "POWER" : "AIM")
          : "PULL BACK & RELEASE TO KICK  ·  OR TAP / SPACE FOR THE METER";
      cx.fillText(hint, W / 2, 236);
    }
    // wind
    const wd = G.weather.wind;
    cx.font = PF(9); cx.fillStyle = "#8ecafc";
    cx.fillText("WIND " + Math.round(Math.hypot(wd.x, wd.y) / 6) + " " + windArrow(), W / 2 + 178, 112);
    // live drag arrow: grows with the pull, bends with your aim
    if (!k.cpu && k.stage < 2 && k.drag && k.pull > 6) {
      const kk = k.kickerEnt;
      const bx = (kk ? kk.x - G.camX + 10 : W / 2), by = kk ? kk.y - 6 : MID;
      const len = 30 + k.pull * 1.1;
      const dy = (k.aimY || 0) * 1.6;
      drawRoutePoly([
        { x: bx, y: by },
        { x: bx + len * 0.55, y: by + dy * 0.4 - len * 0.12 },
        { x: bx + len, y: by + dy },
      ], k.pull > 160 ? "#ff8a5c" : "#ffd23f", false);
    }
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
    // uniform, matching the stands
    const w = 6, h = 8;
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
    hudText(nA + " " + G.score.A, 14, 20, G._popA ? "#ffd23f" : hudColor(G.my));
    hudText("—", 118, 20, "#9db0a4");
    hudText(nB + " " + G.score.B, 140, 20, G._popB ? "#ffd23f" : hudColor(G.opp));
    // floating +N tags rise off the bug when points land
    for (const [pop, px] of [[G._popA, 60], [G._popB, 186]]) {
      if (!pop) continue;
      cx.globalAlpha = Math.min(1, pop.t);
      cx.font = PF(10); cx.fillStyle = "#ffd23f";
      cx.fillText("+" + pop.amt, px, 20 + (1.2 - pop.t) * -14 + 14);
      cx.globalAlpha = 1;
      cx.font = PF(11);
    }
    cx.textAlign = "center";
    const qtxt = G.quarter <= 4 ? "Q" + G.quarter : "OT";
    const mm = Math.floor(G.clock / 60), ss = ("0" + Math.floor(G.clock % 60)).slice(-2);
    const ckCol = G.clock <= 0 ? "#ff5533" : G.clock < 60 ? "#ffd23f" : "#f4f6f1";
    hudText(qtxt + " " + mm + ":" + ss, W / 2 - 60, 20, ckCol);
    hudText(downText(), W / 2 + 62, 20, "#ffd23f");
    // possession + weather
    cx.textAlign = "right"; cx.font = PF(9);
    const wIco = G.weather ? (G.weather.type === "RAIN" ? "☔" : G.weather.type === "SNOW" ? "❄" : "☀") : "";
    hudText("◈ " + (G.drive === "A" ? nA : nB) + " BALL  " + wIco + " " + windArrow(), W - 120, 20, "#9db0a4");
    // controlled-player plate: condition smiley + NAME [ROLE] (Retro style)
    const cc0 = G.controlled || G.carrier;
    if (cc0 && cc0.name && ["live", "presnap"].includes(G.state)) {
      const cond = cc0.stamNow == null ? 1 : cc0.stamNow;
      const face = cond > 0.65 ? "#ffd23f" : cond > 0.35 ? "#ff9b3f" : "#ff5533";
      cx.fillStyle = "rgba(4,10,7,.7)"; cx.fillRect(10, H - 34, 250, 24);
      cx.fillStyle = face; cx.fillRect(16, H - 30, 16, 16);
      cx.fillStyle = "#101010";
      cx.fillRect(20, H - 26, 2, 3); cx.fillRect(26, H - 26, 2, 3);       // eyes
      if (cond > 0.65) cx.fillRect(20, H - 19, 8, 2);                     // smile
      else if (cond > 0.35) { cx.fillRect(20, H - 18, 8, 2); }            // flat
      else { cx.fillRect(20, H - 17, 8, 2); cx.fillRect(19, H - 19, 2, 2); cx.fillRect(27, H - 19, 2, 2); } // frown
      cx.font = PF(9); cx.textAlign = "left"; cx.fillStyle = "#f4f6f1";
      cx.fillText(lastName(cc0.name) + " [" + (cc0.role || "") + "]", 40, H - 17);
    }
    // timeout pips (3 per half per side) under the scoreboard
    if (G.timeouts && !G.practice) {
      cx.fillStyle = "#ffd23f";
      for (let i = 0; i < (G.timeouts.A || 0); i++) cx.fillRect(14 + i * 8, 26, 5, 3);
      cx.fillStyle = "#9db0a4";
      for (let i = 0; i < (G.timeouts.B || 0); i++) cx.fillRect(140 + i * 8, 26, 5, 3);
    }
    // STOP CLOCK chip: shown during the dead beat while the clock would run
    // (stopChipVisible is THE shared truth — the tap hotspot mirrors it)
    if (stopChipVisible()) {
      cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(10, 40, 196, 36);
      cx.strokeStyle = "#ffd23f"; cx.lineWidth = 2; cx.strokeRect(10, 40, 196, 36);
      cx.font = PF(9); cx.textAlign = "left"; cx.fillStyle = "#ffd23f";
      cx.fillText("⏱ STOP CLOCK (T)", 22, 63);
    }
    // SAVE HIGHLIGHT chip: the GIF exporter's own door (see highlightBeat).
    // highlightChipRect() is THE shared truth — the tap hotspot mirrors it.
    if (highlightBeat()) {
      const hr = highlightChipRect();
      cx.fillStyle = "rgba(4,10,7,.85)"; cx.fillRect(hr.x, hr.y, hr.w, hr.h);
      cx.strokeStyle = "#ff5533"; cx.lineWidth = 2; cx.strokeRect(hr.x, hr.y, hr.w, hr.h);
      cx.font = PF(9); cx.textAlign = "left"; cx.fillStyle = "#ff5533";
      cx.fillText("🎥 SAVE HIGHLIGHT (G)", hr.x + 12, hr.y + 23);
    }
    // rampage meter (one per half — spent = grayed out until the break).
    // 2-player versus draws BOTH meters, one per human.
    const drawRampMeter = (side, mx0) => {
      const spent = !G.practice && G.rampUsed && G.rampUsed[side] === (G.quarter <= 2 ? 1 : 2);
      cx.fillStyle = "#0d2519"; cx.fillRect(mx0, 8, 90, 14);
      const rp = G.rampage[side];
      cx.fillStyle = spent ? "#3a4441" : (rp >= 100 ? "#ff4444" : "#e8622c");
      cx.fillRect(mx0, 8, 90 * (spent ? 1 : rp / 100), 14);
      cx.strokeStyle = "#f4f6f1"; cx.strokeRect(mx0, 8, 90, 14);
      cx.font = PF(7); cx.textAlign = "center";
      cx.fillStyle = spent ? "#9db0a4" : "#fff";
      cx.fillText(spent ? "SPENT·½" : (rp >= 100 ? "R=RAMPAGE!" : "🦖RAMPAGE"), mx0 + 45, 18);
    };
    drawRampMeter("A", W - 104);
    if (G.humanB) drawRampMeter("B", W - 204);

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
    if (b.tier === "mega") {
      // the game's peaks get a bigger card, a slam-in scale, and a live pulse
      const born = b.born || (b.born = b.t);
      const age = Math.max(0, born - b.t);
      const slam = 1 + Math.max(0, 0.14 - age * 1.6);
      const pulse = 0.7 + 0.3 * Math.sin(age * 9);
      cx.fillStyle = "rgba(5,12,8,.88)"; cx.fillRect(0, H / 2 - 72, W, 132);
      cx.fillStyle = "rgba(255,210,63," + (0.55 + 0.45 * pulse) + ")";
      cx.fillRect(0, H / 2 - 72, W, 5); cx.fillRect(0, H / 2 + 55, W, 5);
      cx.translate(W / 2, H / 2 - 8); cx.scale(slam, slam);
      cx.textAlign = "center";
      cx.font = PF(31); cx.fillStyle = "#ffd23f";
      cx.fillText(b.text, 0, 0);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      if (b.sub) { cx.textAlign = "center"; cx.font = PF(11); cx.fillStyle = "#f4f6f1"; cx.fillText(b.sub, W / 2, H / 2 + 30); }
      cx.restore();
      return;
    }
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
    enterPlaycall, buildPlayers, changePossession, enterKick, startKickoff, signaturePlay, choosePlay, tryRampage, lateral, dropBall, goForTwo, resolveArrival, breakOnBall, kickMeterPlan, assessPassWindow, cpuQB, cpuReadBoard,
    cpuChooseDef, cpuChooseOff, saveCpuMemory, newSeason, startPlayoffs, seasonAfterGame, startSeasonGame, gameOver, simWeekOthers, pickWeather, makeStadium,
    resolvePlayerContacts, resolveVisualSpriteContacts, visualMasksOverlap,
    bodyRadius, bodyContactRange, stageHighlight, updateHighlight, qaExportFrame, beginTackleImpact,
    spriteFrameFor: selectGameplaySpriteFrame,
    loop,   // headless browser pumping (rAF never fires in hidden panes)
    bumpDynamicLadder, refreshDynamicDiff, diffScalar, ballSecurityScore,
    irandom, irandomRange, fumbleImmuneSpot, diffTable: DIFFS,
    get dyn() { return G.dyn; },
    get szn() { return G.szn; }
  };

  boot();
  requestAnimationFrame(loop);
})();
