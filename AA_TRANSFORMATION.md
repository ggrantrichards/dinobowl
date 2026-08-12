# How Dino Bowl Became an AA-Category Game

*2026-08-06/07 — the research, the diagnosis, and every change. Written for the
owner per the standing directive: analyze the gameplay and code, research what
makes Retro Bowl satisfying, revamp visual + gameplay design for production.*

---

## 1. The research (what makes Retro Bowl so satisfying)

Two research passes fed this work. The first (run against the sibling project,
Pixel Gridiron) mined Retro Bowl reviews, design analyses, and the game-juice
canon (Vlambeer's screenshake talk, "Juice it or lose it", trauma-camera math).
The second was a three-critic comparative pass reading BOTH codebases side by
side after the owner ruled Dino Bowl inferior in play. The distilled laws:

- **One perfected gesture is the game.** The slingshot throw with live arc
  preview. Everything else exists to frame it.
- **Skill in, skill out — no hidden dice, and show the truth before commitment.**
  Dino Bowl's sim already honored no-dice (decompiled-source alignment); what it
  lacked was *surfacing* the truth (risk, scatter) at aim time.
- **Play only the interesting moments; the next beat is always seconds away.**
  Retro Bowl's whistle-to-snap is ~1s and every wait is tap-through. Dead air
  is the #1 killer of "one more game."
- **The juice stack is cheap and mandatory:** hitstop, trauma shake with roll,
  punch-zoom, payoff particles, celebrate poses, score-punch, banner tiers.
- **Music + a living crowd** — and the crowd sits UNDER the action (owner mix
  law from the Pixel Gridiron play-test).
- **Pixel discipline:** fillRect at integer coords, one palette, no
  anti-aliased vector strokes anywhere near the field.

## 2. The diagnosis (what was actually wrong)

The mapping pass rated Dino Bowl's **simulation core at or above the AA bar**
(window-based catches, deterministic grapple tackles, zero-scatter throws,
700ms clock model, D1–D16 ladder). The gap was the presentation ceiling, and
after the owner's play-test, three critics pinned it precisely:

1. **Route art read as modern flat design.** Solid anti-aliased 3px strokes
   with round caps in pure sky-blue `#6fb7ff` and mint `#59d977` — colors from
   outside the game's palette — plus filled-triangle arrowheads and `ctx.arc`
   dots. The play cards stroked everything in a third off-palette green at
   fractional coords: four identical anti-aliased scribbles.
2. **Animations strobed instead of striding.** Every species had 2 walk frames
   where only leg rows differ, and a double-multiplied frame index flipped them
   at ~49Hz — a vibration, not a gait. No idle (formations jittered), no run
   bounce (dinos glided), and every "action" was a 1–3px procedural shear of
   the same standing sprite. The game's best moments had no silhouette.
3. **The loop taxed the player.** Unskippable dead beats (0.9–3.4s), a 7–13s
   replay after EVERY sack/turnover/TD, banner chains stacked sequentially
   (PAT result → kickoff flavor = 2.5–2.8s), cards appearing only after the
   full dead beat. A routine down: ~3–4s and 2 forced stops. A TD: 11–16s and
   6–7 taps. Retro Bowl/Pixel Gridiron: ~1–1.5s and 4–5s respectively.
4. Bugs found in my own earlier pass: TD confetti spawned above the visible
   frame (died before falling into view).

## 3. The revamp (everything that changed)

### Phase 0 — verification unblocked
- tests/harness.js Node 22 fix (suite was dead on this machine); both HTML
  shells unified onto one cache-bust marker (now `aa-plus-v31`).

### Phase 1 — presentation systems (ported from the proven playbook)
- **Music, for the first time**: WebAudio chiptune step-sequencer — a Dm
  plains theme for menus, a stomping Em gameday loop — state-driven, ducking
  under TD/INT jingles.
- **Mixer**: master/music/sfx/crowd GainNode buses + limiter; MUSIC and SFX
  volume rows in settings; the crowd bus hard-ceilinged UNDER the action
  layer (owner mix law).
- **Camera language**: trauma shake with rotational roll (power-curve
  falloff), punch-zoom on TDs/de-cleaters/ball flights (world only, HUD
  pinned), velocity lookahead that leads the runner.
- **Payoff FX vocabulary**: turf chunks on takedowns/sacks, impact sparks on
  de-cleaters, dust on jukes and catches, TD confetti + night flashbulbs,
  breakaway speed streaks, ball-flight trail with height-aware shadow.
- **Presentation**: mega-tier TD banner (slam-in + pulse), any-input banner
  skip that never eats a gameplay press (0:00 rule banner stays sticky per
  LESSON #4), scorebug gold-flash + floating "+6" on scores, honest aim ring
  (tinted green/amber/red by the pass window the engine already computes,
  sized by real weather scatter + wind — zero text, respecting the "no
  targeting computer" rule), screen fades between shell states, CRT scanline
  toggle (default OFF).

### Phase 2 — the owner's play-test verdicts, executed
- **Route art is pixel chalk now.** Marching 3×3 dots with turf shadows,
  chunky pixel chevrons, palette colors: GOLD = the play's primary read
  (every pass play now declares `primary`), chalk off-white = others, sage =
  checkdown, gold lane on runs. Play-card minis are chalkboard diagrams with
  an LOS tick and the gold route telegraphing intent — cards finally look
  like different plays.
- **Animations stride.** Frame cadence is speed-proportional (~2.75
  strides/sec at full gallop — the 49Hz strobe is dead). All 11 land species
  authored to 4-frame walk cycles (contact-A / pass-up / contact-B mirrored /
  pass-down) with baked vertical bounce and tail sway. A dedicated 3-frame
  idle pack (breathe + blink) replaces presnap leg jitter. Celebrate is a
  real crouch→airborne→land→tail-flick; throws release above the head.
  Action packs went 3→4 cels (settle/inbetween frames) within all LESSON #23
  timing limits. Quetz untouched (owner-gated test contract; flagged below).
- **The loop respects the player's time.** Any tap/key advances dead beats
  past a 0.35s read-lockout (0.9s on TD/turnover mega beats); play-call cards
  appear at 0.6s while tackle/getup pose chains finish BEHIND them (chains
  tick through playcall/defcall/ptchoice — never overridden, LESSONS #2/#3
  intact); sack and turnover auto-replays deleted (the sub-1s takedown sells
  it live; replays live behind the challenge flag, cut to the last 2.1s at
  0.55×); PAT-result→kickoff banner chain collapsed to one beat; TD→conversion
  choice at 1.2s with the celebration still playing behind the card; slow-mo
  no longer stretches dead time. Soak evidence: replay frames per 3 games
  went 3,462 → 0.
- **Confetti actually rains** (spawn heights fixed, settles on the turf).

## 4. Verification (proven vs. not)

- Full LESSONS #13 battery: **265 assertions, 8 suites, all green**
  (test_all 71, batch4 91, batch3 39, feel 27, online 17, overhaul 8,
  clock 7, getup 5) + **3-game soak, zero runtime errors**.
- Four test assertions were updated WITH comments per LESSON #18 — each
  guarded a design that deliberately moved (sack replays, 2-frame walks,
  dead-beat observation windows). None were changed to hide a failure.
- **NOT yet proven: feel in human hands.** Per LESSON #6 the live play-test
  outranks everything here — the music mix, the new stride cadence, the
  card-overlay pacing and the gold-read language all need the owner's eyes
  and ears. NOT deployed; `firebase deploy --only hosting --project
  football-dino` remains the owner's call.

## 4b. QA round (owner live play-test, 2026-08-07) — all fixed, shipped as v33

The owner's hands-on session surfaced ten issues the harness couldn't feel.
Every one is fixed and the full battery re-run green (265 assertions + soak):

1. **One-motion snap** — pressing your QB used to open a stat card; now it
   snaps AND the same hold pulls back into the throw (field-tap snaps carry
   the hold too). The Retro Bowl gesture, finally.
2. **PAT buttons dead** — ptClick hit-tested the playcall card layout while
   the screen drew two different buttons. One shared geometry now.
3. **Clock dying mid-call** — presnap no longer bleeds clock (matches the
   decompiled source: live tick + whistle chunks only). Reach the line, the
   snap is yours.
4. **Throws landing short of the marker** — the aim arc/ring now runs
   through the throw's own range clamp. The preview cannot lie.
5. **"Pancake mush" dive/tackles** — new actionLayFlat silhouettes: the
   species' own body rotated onto its belly (head forward, snout down,
   dorsal features up, legs trailing), full-height pike mid-fall, squashed
   sprawl at rest. Tackled arc: fold → deeper fold → head-first pike → flat.
6. **Floating accessories** — headbands/features now ride each frame's
   pixel mask (frameBobDy), on-field and in the pregame showcase.
7. **Pregame UI floating text** — gameday strip, nameplates, and starter
   columns all in bordered panels.
8. **Sideline tiny-dino clutter** — removed.
9. **Music overlap / ghost audio** — hidden tabs suspend their
   AudioContext and stop the sequencer (two open tabs used to mean two
   soundtracks, forever). One incident was an invisible debug tab inside
   the assistant's own browser pane — unloaded, and a lesson recorded.
10. **Mix** — music down to a bed (0.32×), crowd + grunts up (SFX master
   0.85, crowd ceiling raised), per the owner's ears.

## 4c. The two undocumented sessions, recorded late (2026-08-12)

Both of these shipped without a doc entry at the time. That omission is the single
root cause of every stale line number in `AA_PLUS_PLAN.md` (100-300 lines of drift),
and it is why that file's §3.7 deletion range would now delete `buildSpecies`.
Recorded here so the next reader does not trust a stale coordinate.

**2026-08-11 — visual / special-teams / QB overhaul (shipped as v34, no doc entry).**
Reconstructed from `tests/test_overhaul.js` and the code: kickoffs became a VISIBLE
boot-and-flight beat (`launchKick`/`updateKickFly`, states `kick`/`kickfly`/
`koflight`) with still no live return; the replay GIF export moved to 480x270 /
120 frames; the pass-aim threat/risk reticle was REMOVED (so AA_PLUS_PLAN 1.7 is
withdrawn, not pending); the lob apex dropped to `clamp(d * 0.17, 20, 74)`. This
session was deployed under the SAME `v34-20260807` cache-bust token as the 08-07
build, so the token no longer identified the bundle.

**2026-08-12 — glitchless pass (shipped as v35, then v36).** An 8-dimension
adversarial audit (59 verified findings) plus five fixes, four of which were found
only by DYNAMIC probing, not by reading code:
- guarded every `localStorage` touch — the `const G` initializer used to parse
  storage unguarded, so a truncated save, the literal string `"undefined"`, or
  merely running in Safari private browsing left a permanently black canvas;
- one rounded spot + one captured first-down line in `playDead`, fixing a ruling
  that put the ball ON the yellow line while the HUD read "4th & 1" (~3.6% of plays);
- `flySkip()` + `FLY_READ_LOCK`, and `T` clamped to the intended 1.7s — the kick
  flight had been the only dead beat with no skip at all (15-17s per game);
- `sprites.js`: four distinct `shoved` leans (frames 2-3 had been pixel-identical
  in all 11 species) and a real `tackled` fold arc sampling 0.40→1.0 instead of
  `phase` 0/0.33, which had produced two near-identical uprights;
- `kickLocked` re-entrancy guard (a two-press event NaN'd punt geometry into a
  permanent `kickfly` softlock), career-save preservation, and a static roster
  fallback for SCOUTING.
Added `tests/test_aa_glitchless.js` (20 assertions) → **285 assertions, 9 suites**.
`git init` also happened this day; before it, this repo had no version control.
The full requirements list and build plan now live in **`ROADMAP.md`** (plan of
record); `AA_PLUS_PLAN.md` is retained for rationale and owner questions only.

## 5. Still open (owner decisions)
- Quetz 4-frame ground waddle (needs a coordinated test edit — separate commit).
- Parked balance levers: contested-entry rate (`breakOnBall`), rampage
  goal-line fumble immunity.
- Phase 2 backlog not yet built: interactive grapple mash, defensive card
  identity + named-defender XP, crowd team pockets, master palette sweep,
  kick PERFECT payoff, procedural headlines + records, pregame matchup card.
- Licensing posture on real NFL names + Madden-derived ratings before wider
  distribution.
