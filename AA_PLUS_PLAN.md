# Dinobowl AA+ Revamp — Phased Implementation Plan

> **STATUS 2026-08-06:** Phase 0 + Phase 1 IMPLEMENTED (music sequencer + mixer
> buses/sliders with the crowd-under-action mix law, camera punch-zoom/trauma
> shake/lookahead, payoff particle vocabulary + catch/sack impact beats + ball
> trail, mega banners + any-input skip, scorebug score-punch, honest aim ring,
> screen fades, CRT toggle default OFF). Full suite green (265 assertions) +
> 3-game soak clean. NOT yet deployed — owner gate: live play-test + by-ear
> audio mix pass (parity-notes P1) come first. One test updated with comment
> per LESSON #18 (catch impact beat vs staged whistle scene, LESSON #9).

**Root:** `C:\Users\ggrantrichards\Downloads\dinobowl-main\dinobowl-main` (all paths below relative to this).
**Thesis:** The simulation core is already at/above the AA bar (no-dice contracts, grapple model, kick meter, pacing, difficulty legibility). The gap is the presentation ceiling: music, mixing, camera language, payoff FX, interactive struggle, and shell identity. So Phase 1 is almost entirely presentation-layer additions that bolt onto working systems without touching the tuned sim.

**Process gates for every phase (non-negotiable, from LESSONS.md):** live human play-test outranks harness/stills (#6); full pre-ship suite `test_all/clock/getup/game_feel/batch3/batch4/overhaul/online` + 3-game soak (#13); ≥6 bot games and distribution diffs before any balance judgment (#24); telemetry books must balance (#25); never accept a shrunken game.js/sprites.js without a diff (#10); no per-frame probability rolls (#15); bump the cache-bust `?v=` on both shells and verify deploy by curling game.js for a new marker (#11, #12).

---

## Phase 0 (do first, same day) — Unblock verification

**0.1 Fix the feel harness on Node 22.** `tests/harness.js:58` — `global.navigator = {}` throws on Node ≥21 (getter-only global). Replace with `Object.defineProperty(global, 'navigator', { value: {}, configurable: true })`. ~3 lines. Until this lands, zero feel gates can run on this machine, so nothing else can be verified.

**0.2 Unify the shipped build.** `templates/game.html:122-128` pins v28 while `static/game/index.html:101-102` pins v29 — the two entry points ship different game code. Diff v28 vs v29 expectations, pin both shells to the same version, and make the version string a single documented constant to bump. ~10 lines.

---

## Phase 1 — Highest-impact feel + visual wins (~2–3 weeks)

**1.1 Chiptune music sequencer (GAP 1 — biggest single missing system).**
WHAT: WebAudio step-sequencer with a menu song, an in-game song (intensity-reactive if cheap), and short jingles (TD, made kick, game over, Dino Bowl win). PLAYBOOK: Pixel Gridiron's WebAudio chiptune sequencer, ported nearly verbatim.
WHERE: new section adjacent to the SFX engine, `static/game/game.js:221-422`; song start/stop hooks in the state transitions inside `update()` (5557) and `startGame`/`gameOver`/menu entry. ~350–450 new lines.

**1.2 Audio mixer: buses, ducking, sliders (GAP 2).**
WHAT: master/music/SFX/crowd GainNodes replacing direct-to-destination connections; ducking envelopes (crowd+music dip under banners, announcer beats, jingles); MUSIC and SFX volume slider rows in settings, persisted to localStorage. PLAYBOOK: enveloped layered SFX + ducking + volume sliders.
WHERE: rewire `beep/noiseBurst/thump` and crowd bed at `game.js:225-383` (kill hardcoded `SFX_MASTER` at 223); settings screen `SETTINGS_ROWS` ~5386-5429; new keys alongside `dinobowl_coach` etc. at 582-590. ~150–200 lines.

**1.3 Camera language: punch-zoom + rotational trauma shake + lookahead (GAP 3).**
WHAT: (a) ease-zoom to ~1.15–1.25 on ball-in-air, red zone, TDs, made kicks, big hits (this is also parity-notes P1); (b) replace linear translate-only shake with trauma^2 falloff plus a small rotation term; (c) velocity lookahead on breakaways. PLAYBOOK: camera punch-zoom + rotational trauma shake + hitstop (hitstop already exists — do not touch `impactMoment` 5529-5542).
WHERE: `updateCamera` 5800-5807, the render transform at 7556, zoom triggers at `touchdown` (3818), `resolveArrival` (3338), `resolveKick` (4423), breakaway trigger 5765-5773. ~100–140 lines.

**1.4 Pooled payoff particle vocabulary (GAP 6).**
WHAT: pre-allocated pool replacing push/filter `G.parts`; new emitters — dust puffs on jukes/cuts/direction snaps, turf chunks on takedowns/dives, impact sparks on hard hits, TD confetti, night-game crowd flashbulbs, speed streaks on breakaways. PLAYBOOK: pooled particle FX, exact vocabulary list.
WHERE: particle system 7510-7551 + `drawWeatherFX` 8136-8160; hook sites: juke (currently sound-only, sfx at 420), `beginTackleImpact` 2222, `touchdown` 3818, breakaway 5765-5773, `completeCatch` ~3381. ~300–400 lines.

**1.5 Impact beats on clean catches and sacks (GAP 8).**
WHAT: `impactMoment` micro-beat + catch-pop particle + small camera nudge on clean completions (deep strikes especially); shake + hitstop on sacks. Also ball trail ghosts in flight (parity-notes P1 "throw/catch juice").
WHERE: `completeCatch` 3381-3402 (mirror the contested beat at 3417), sack branch of `checkTackles` 7337-7357, ball render inside `updateBall`/draw path 5810-5965. ~60–90 lines.

**1.6 Broadcast scorebug score-punch + tiered skippable banners (GAP 7).**
WHAT: score-change punch-scale/flash/count-up in the scorebug; banner tiers (toast for TACKLED-class events, mid card for FIRST DOWN, full celebration card for TD/turnover) with any-input skip. PLAYBOOK: broadcast scorebug with score-punch; skippable tiered banners.
WHERE: `drawHUD` 9445-9526 (+ helpers 9424-9443), `drawBanner` 9528-9539, banner-post call sites via 5610. ~140–200 lines. Preserve the clock-rule banner requirement (LESSON #4).

**1.7 Pre-throw risk legibility (GAP 5) — OWNER-GATED VISUAL STYLE.**
WHAT: call `assessPassWindow` live during aim and tint the existing landing ring green/amber/red; size the ring by the real weather/arm scatter `err` that already exists invisibly (3199-3204). No new dice — purely surfacing computed truth, which is exactly LESSON #19's "player can always see WHY." PLAYBOOK: legible throw model / visible accuracy cone.
WHERE: `assessPassWindow` 3156-3183, aim UI 9209-9233. ~60–100 lines. The current comment says "no labels, no targeting computer" — confirm with owner that a tinted/sized ring (no text) respects that intent before shipping (see open questions).

**1.8 Screen transition primitive + CRT/scanline shell identity.**
WHAT: one shared fade/wipe (`G.transT` + easing) wrapped around state changes so menu→select→pregame→kickoff stop hard-cutting; CRT/scanline+vignette DOM overlay with a settings toggle; identical in both shells. PLAYBOOK: CRT/scanline DOM identity with screen transitions.
WHERE: `render()` dispatch 7554-7636 (wrap), state-change idiom sites; `static/game/index.html` + `templates/game.html` (overlay div + CSS); settings row + localStorage key. ~150–200 lines.

**Phase 1 exit gate:** owner live play-test with the by-ear audio mix pass (parity-notes P1 — the kit was synthesized blind and never A/B'd); full suite green; deploy to football-dino with a new marker string.

---

## Phase 2 — Systems upgrades (~3–4 weeks)

**2.1 Interactive grapple mash (GAP 4) — OWNER-GATED DESIGN.**
WHAT: while wrapped, carrier mashes (key/tap) to add escape work against the takedown accumulator; controlled defender mashes to pour faster; visible struggle pips/meter + "FIGHT!" prompt; haptic tick per mash on touch. PLAYBOOK: interactive grapple mash. HARD CONSTRAINTS: takedowns must still resolve in under a second, tackled-cel 0.42s, slow-mo ≤0.2s (LESSON #23 owner numbers); accumulator determinism stays — mash modulates pour rate, never rolls dice.
WHERE: takedown model 7262-7306, carrier-wrapped movement 6041, input dispatch `onKey` 5134-5250 + touch buttons 5039-5088, prompt draw near 9248-9277. ~220–300 lines.

**2.2 Sprite animation upgrade: 4+-frame cycles + hand-keyed payoff cels.**
WHAT: extend every species walk cycle from 2 to 4 frames; upgrade the highest-visibility action packs (tackle, tackled, celebrate, stiff-arm, throw, catch) from 3 procedural map-transform frames to hand-keyed frames with authored anchors. Evaluate reviving the dead 6-frame FILM system (`sprites.js:804-992`, "LEGACY FILM-CEL MODELS (unattached)") as the base rather than authoring from scratch — owner call on direction. PLAYBOOK: 4+-frame sprite cycles with payoff poses. HARD CONSTRAINT: all 13 species stay silhouette-distinct per position (owner constraint 0) — extend, never homogenize.
WHERE: `sprites.js` species defs 26-602, `buildSpecies` 625-669, action packs 1000-1549; frame selection `selectActionSpriteFrame` game.js:4741-4774 and replay mirror 4759-4853; verify with the gallery QA screen 9604-9616 AND `tests/test_game_feel.js` pose assertions (update tests with comments per LESSON #18). ~450–650 lines. Respect pose-chain rules (LESSONS #2-3: never playPose over in-flight contact anims; every knockdown gets a getup).

**2.3 Defensive playcall identity: named-defender KEY + XP (GAP 10).**
WHAT: defensive cards get route-art-grade treatment: scheme diagram mini, a named KEY defender pulled from the real roster ("KEY: T.J. Watt — edge heat"), and post-play XP/stat credit surfaced when the key defender makes the play; feeds the existing per-player dev system. PLAYBOOK: defensive playcalls with named-defender XP.
WHERE: `DEF_PLAYS` 90-102 (add key-role metadata), `drawMiniPlay` def branch 9036-9068, `askDefense` 1931-1945, stat credit in `playDead` 3575 and `developPlayers` 1368. ~180–250 lines.

**2.4 Crowd upgrade: team pockets, score reactions, flashbulbs.**
WHAT: rebuild the crowd canvas with row structure and home/away color pockets; lightweight animation state (wave/jump rows on scores, keyed off the existing excitement scalar); flashbulb particle integration from 1.4 at night games. PLAYBOOK: crowd rows with team pockets + flashbulbs.
WHERE: crowd build 1173-1229 (palette at 1173-1182), stands render 7765-7806, excitement scalar 5599-5608. ~150–200 lines.

**2.5 Master palette system.**
WHAT: single `PAL` object as source of truth for the recurring family (gold #ffd23f, off-white #f4f6f1, sage #9db0a4, deep greens), exported to CSS custom properties in both shells; sweep the highest-traffic scattered hex literals (field, HUD, sky, dials) onto it. PLAYBOOK: disciplined master palette shared canvas+CSS.
WHERE: new const near top of game.js; replacements concentrated in drawField 7650-7763, HUD 9424-9526, stadium 7765-7806; `:root` vars in `static/game/index.html:12` and `templates/game.html:14-17`. ~150–250 line touches. Leave sprites.js species palettes alone (curated per-dino, working).

**2.6 Field/lighting finish: mow checkerboard, light pools, vignette.**
WHAT: mow checkerboard option layered over stripes; field-level light pools under the night masts (cones currently stop at the stands); subtle vignette; longer dusk shadows if cheap. PLAYBOOK: field/stadium art items.
WHERE: `drawField` 7650-7763, masts 7729-7739, tint overlays 8130-8135. ~80–120 lines.

**2.7 Kick perfect-strike payoff.**
WHAT: differentiated PERFECT! beat on a center-lane strike — flash, chime, crowd spike, 1-frame hitstop, confetti tick on game-winners. PLAYBOOK: sweet-spot kicking payoff. Meter mechanics themselves are STRONG-rated — additive only.
WHERE: perfect-window detection 9304-9307, `resolveKick` 4423-4513, meter draw 9280-9335. ~50–70 lines.

**2.8 Touch feel: haptics + button feedback + defense stack trim (GAP 9).**
WHAT: `navigator.vibrate` pulses keyed to `impactMoment` intensity; pressed-state flash/scale on touch buttons; make the right-edge defense stack contextual (show only currently-valid verbs) so 5–6 buttons stop crowding the aim region.
WHERE: `drawTouchButtons`/handlers 5039-5088, touch routing 900-951, vibrate hook inside `impactMoment` 5529. ~100–140 lines.

**Phase 2 exit gate:** owner live play-test focused on grapple feel and sprite reads; ≥6 bot games confirming no balance drift (grapple mash must not move takedown-time or YAC distributions for CPU-vs-CPU).

---

## Phase 3 — Product & polish layer (~2–3 weeks)

**3.1 Procedural headlines + franchise records.** Post-game headline generator from the game's stat lines and real names (the broken-tackle commentary system at ~real-name quality already exists as a pattern); persistent franchise record book (season/career bests) with "RECORD!" banner tier hook into 1.6. WHERE: season layer 1289-1476, `seasonAfterGame` 1383-1414, new localStorage key, hub/standings screens. ~200–280 lines. PLAYBOOK: procedural headlines + franchise records.

**3.2 Pregame matchup card.** Parity-notes P1, never shipped: team ratings/records/star-vs-star card before the intro, skippable. WHERE: `startGame`→intro flow 1773-1806, new draw fn near 8204-8252, reuse QB_ID/RAMPAGERS showcase data 8201-8340. ~120–160 lines.

**3.3 First-session hints.** Contextual one-time hints (first snap: throw gesture; first defensive snap: TAB/verbs; first 4th down: cards) with a persisted seen-set; the tutorial state exists, this is the in-game drip. WHERE: prompt system near 9248-9277, localStorage. ~100–150 lines. PLAYBOOK: first-session hints.

**3.4 Shell meta: OG/meta tags, favicon, font self-hosting.** Both shells; drop the Google-Fonts remote dependency (Press Start 2P as data-URI or local asset — also removes an offline/CSP failure mode). ~40–60 lines. PLAYBOOK: OG/meta/favicon.

**3.5 Scouting static fallback + serving-mode symmetry (data hygiene).** Add `/game/players.json` fallback to the scouting fetch (game.js:8497 currently silently empties on Firebase hosting, ~10 lines). Decide (owner Q) whether Flask `/api/game/teams` gets the Madden overlay or static hosting is declared canonical — currently the same matchup plays with different numbers per host (app.py:368-390 vs export_static_game_data.py).

**3.6 Star-table refresh for 2026.** Hand-audit RAMPAGERS/APEX_ROLE/QB_ID/SIGNATURES (game.js:145-218, 8326+) against the exported 2026 rosters; flag mismatches where the name-override masks a data-driven starter. ~data-only edits. Owner call on whether to pipeline-generate candidates going forward.

**3.7 Dead-code cleanup (only after 2.2 decides the FILM question).** Remove or revive: legacy FILM cels sprites.js:671-992 (~320 lines), orphaned `returncover/returnblock` AI states game.js:6405-6432, unreachable KO branch 4426-4449, `careerPickTeam` stub 1625. Pure deletion diffs, reviewed line-by-line per LESSON #10.

> **:warning: DO NOT EXECUTE THE LINE RANGES ABOVE — 2026-08-12.** `game.js` and
> `sprites.js` were rewritten on 2026-08-11 and 2026-08-12; every coordinate in this
> file is stale by 100-300 lines. Deleting `sprites.js:671-992` today removes
> **`buildSpecies` (now sprites.js:777) — the function that builds every sprite in
> the game** — plus the 4-frame walk expansion and `IDLE_MAPS`. `profileOf`
> (sprites.js:925-944) is **LIVE code** sitting under a comment header that reads
> `// LEGACY FILM-CEL MODELS (unattached)`. Delete by SYMBOL NAME (`FILM`,
> `filmCel`, `filmPack`, `drawDinoCel`, `filmPalette`, `mirrorCanvas`), never by
> line range. See `ROADMAP.md` (the current plan of record) Lane B1/B3.

**3.8 Online quality-of-life (optional, timeboxed).** Guest-side frame interpolation and replacing `alert()` error UX (game.js:673-859). Do NOT attempt host migration or a protocol rewrite — out of scope for AA+ feel.

---

## DO NOT TOUCH (working systems + owner law)

- **All no-dice moments of truth:** zero user throw scatter (3195-3202), catch windows/tip model in `resolveArrival` (3338-3549), deterministic takedown accumulator thresholds (7262-7306), two-stage fumble gate (7391). Phase work is additive presentation on top.
- **Owner vetoes/keepers:** playcall cards as DEFAULT, no SIM/auto-play anywhere, no kick/punt returns, halftime off-by-default-but-kept, playable defense optional, dino powers, contested timed-jump duel, offense-first stance.
- **Parked levers — owner call only:** contested-entry rate / `breakOnBall` flight-time closing (LESSON #26); rampage goal-line fumble immunity.
- **Tuned constants:** SPEED_SCALE 0.6 @ YPX 24; clock model values (700ms tick, dead-time chunks, comeback throttle); clock-never-ends-a-live-play + its banner; LESSON #23 tackle timings; D1–D16 ladder mechanics; kick meter core.
- **Architecture:** do not modularize the game.js monolith as part of this revamp — every workstream above is additive within the existing IIFE. The "migration" that deleted 3,400 lines is the cautionary tale; `static/game/` is source of truth, diff everything.
- **Contact solver three-mode system** (6725-6852) and physics firmness rules (firm only at presnap/air/loose).
- **Deploy path:** `firebase deploy --only hosting --project football-dino` + curl-marker verification.

## Open questions ONLY the owner can answer

1. **Contested-entry rate:** pull the `breakOnBall` flight-time lever now (entries ~80% vs RB's minority), or judge in the Phase 1 live play-test first? (Explicitly parked in LESSONS #26.)
2. **Rampage goal-line fumble immunity** — yes or no? (Parked in spec round-3.)
3. **Aim-ring risk tint (1.7):** does a green/amber/red tinted, scatter-sized ring violate your "no labels, no targeting computer" intent, or was that only anti-text-clutter?
4. **Grapple mash (2.1):** carrier-side mash, defender-side mash, or both? Confirm the sub-1s takedown budget still governs.
5. **Sprite direction (2.2):** revive the hand-keyed 6-frame FILM system as the base, or extend the current compact procedural packs with hand-keyed frames?
6. **Music direction (1.1):** chiptune reference tracks/mood? Should a halftime jingle exist given halftime shows default off? Music default-on or default-off first boot?
7. **Direction swap per half:** commission the ~50-comparison refactor or drop it permanently?
8. **Serving-mode canon (3.5):** apply the Madden overlay in the Flask API too, or declare Firebase static the one true build?
9. **Star tables (3.6):** hand-refresh yearly, or should the pipeline generate rampager/QB_ID candidates with your sign-off?
10. **Licensing posture:** real names + scraped Madden ratings on public Firebase hosting — staying personal-project, or does distribution intent require stripping/licensing the real-name layer before more visibility?
11. **CRT overlay default:** on or off out of the box?
12. **WR stalk-block hold timer** (last old-style timer, deferred): convert to the persistent-engagement model in Phase 2, or leave?

## Rough sizing

Phase 0: ~15 lines. Phase 1: ~1,200–1,600 new/changed lines (game.js + shells). Phase 2: ~1,400–2,000 lines (heaviest: sprites 2.2, grapple 2.1). Phase 3: ~600–900 lines plus ~330 lines of deletions. Every phase ships behind a cache-bust bump and ends with the LESSONS #13 suite plus an owner live play-test — the play-test, not the harness, is the acceptance gate.