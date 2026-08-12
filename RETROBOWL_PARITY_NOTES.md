# Dino Bowl → Retro Bowl parity notes — REVISED 2026-07-24

This file was rewritten after (a) restoring the full engine that a stripped
"migration" build had deleted, (b) a real human play-test, and (c) a code +
frame-level review of the original notes below. Sections are marked with an
honest verdict: what the original notes got right, what they got wrong, and
what is now actually fixed vs. still open.

---

## 0. Review of the original notes — agree / disagree

| Original claim | Verdict |
|---|---|
| "Audio is the single biggest satisfaction gap — every sound is a single-oscillator beep" | **AGREED, and now largely fixed.** The claim was already half-stale (the crowd bed/cheer had been upgraded to layered noise synthesis), but the action SFX really were bare beeps. This pass rebuilt them (see §1). |
| "No live slow-mo / hit-stop; drama only lives in the replay" | **AGREED — implemented.** `impactMoment()` now drives hit-stop + slow-mo on tackles, big hits, broken tackles, fumbles, INTs, contested catch arrivals, and TDs. |
| "Camera is flat: no zoom" | **AGREED — still open** (P1 below). |
| "Throw/catch juice is thin (no ball trail, no catch pop)" | **AGREED — still open** (P1 below). Aim arc + landing marker exist. |
| "Contact animations … already at/near Retro Bowl quality" | **DISAGREE — this was overstated.** The QA still-frames looked right, but live play revealed: the first-down celebration *overrode* the tackled cel mid-wrap, which broke the tackle-pair overlap exemption and visibly teleported the pair apart (the "tackle you never see"); there was no stand-up animation at all (prone → running snap-cut); and the aftermath could flash a rotated-sprite fallback. **Lesson: a passing QA frame is not a passing live sequence.** All three are now fixed (see §1). |
| "Physics feel … momentum-based tackling, unit-measured" | **PARTLY DISAGREE.** The measurements verified *outcomes*, not *feel*. The firm no-overlap solver was applied during live line play, which made every body an immovable box: the D-line could never spin off a block, pursuit got body-blocked by teammates, and carriers were sometimes untackleable. The real purpose of firm separation is narrow: **make contested 50/50 balls legible (clear WHO is WHERE)**. It now applies only there (+ presnap + loose-ball scrums); live play uses soft, capped, springy contact. |
| "P1: Verify AI outcomes with a real play-test — headless sims are artifacts" | **STRONGLY AGREED.** The human play-test found every real issue the harness missed. This stays the #1 process rule. |

---

## 1. What is NOW in the build (fixed this pass, all regression-tested)

- **Physics rework.** `resolvePlayerContacts` has two regimes:
  - **Firm** (presnap, ball-in-air, loose-ball): full separation + exact
    opaque-pixel mask pass → contested catches read fairly, zero overlap.
  - **Soft** (live line play / pursuit): ONE gentle capped pass (≤3px/frame),
    teammates barely jostle (0.45×), engaged block pairs read as contact
    (1.35×), velocity settle reduced to a glancing bump (0.12–0.3×).
  - Result: spin/speed/bull rush techniques actually shed blocks (interior DL
    now have techniques too), pursuit is never walled off, tackles connect.
    Soak sacks rose ~55% after the change.
- **Tackle sequencing.** The first-down celebration no longer overrides the
  tackle. New pose chain: `tackled → prone → getup → celebrate`, where
  **getup** is a new authored 3-cel stand-up action (turf push → crouch →
  rising), built per-species like every other compact action. The dead-ball
  beat extends to 2.5s so the whole rise is on screen. The rotated-sprite
  prone fallback can no longer flash (the prone cel now covers the full
  down-time). Verified frame-by-frame and by `tests/test_getup.js`.
- **Quarter clock.** Confirmed + regression-locked (`tests/test_clock.js`):
  0:00 during a live snap never ends the quarter/game — the play runs to the
  whistle. A "0:00 — the play runs to the whistle!" banner makes the rule
  visible so it does not read as a bug.
- **Audio kit (P0 from the original notes).**
  - New `noiseBurst()` (filtered noise with sweep + attack envelopes) and
    `thump()` (pitch-dropping sine = impact weight) layered under every
    action sound: tackle = pad-crack + body-thud + sub; catch = leather pock
    + chest thump; throw/bullet = real whooshes; TD fanfare with bass +
    sparkle; INT sting + stadium inhale; T-rex roar with sub growl.
  - **Moment scaling**: tackle volume/size scales with the defender's actual
    closing drive (a de-cleater is audibly bigger than an arm tackle); deep
    or high-point catches sound bigger than checkdowns.
  - **Crowd deflation**: `crowdAww()` — a falling, murmuring "awww" when the
    home side's play dies (turnover > sack > incompletion, proportional).
  - Still to do by ear: mix balance pass in a real browser session (the
    harness can only prove it runs without errors).
- **Hit-stop + live slow-mo** (`impactMoment`): frozen frames + a short
  0.42–0.5× slow beat on tackles (bigger for de-cleaters), broken tackles,
  fumbles (short — the loose-ball scramble plays near full speed), picks,
  contested arrivals, and goal-line crossings.
- **Restored engine** (the deployed build had deleted all of this): sling
  pull-back throwing, adaptive scouted CPU AI, stamina, stiff-arms, live
  kicks, 4 halftime shows, intro, training room, quick match, crowd/sideline
  life, action-cel animation system, SPEED_SCALE 0.6 (≈50% of the stripped
  build's on-screen speed).

## 2. Remaining gaps to Retro Bowl (prioritized)

1. **P1 — Camera zoom.** Subtle ease to ~1.15–1.25 during `air`/red-zone/
   scoring, back to 1.0. (`updateCamera` + a canvas scale at the top of
   `render()`; keep HUD unscaled.)
2. **P1 — Throw/catch juice.** Ball trail ghosts + spin while `mode==="air"`,
   catch "pop" (1–2 frame scale-punch + reuse `drawPixelImpactBurst`), aim
   arc fading with `assessPassWindow` risk.
3. **P1 — By-ear audio mix pass.** The new kit is synthesized blind; someone
   must A/B it against Retro Bowl for loudness balance and annoyance ceiling
   (especially crowdAww frequency).
4. **P2 — Run-game feel + presentation polish** (drive-summary lower-third,
   broken-tackle/big-hit stat lines).
5. **Balance play-test.** Difficulty knobs (`diff().catchBonus`, `cpuThink`)
   and INT/catch probabilities still need live tuning numbers, per the
   original notes' correct advice.

## 3. Process rules learned (see also LESSONS.md)

- A live human play-test outranks QA stills and headless sims. Every
  regression in this pass was invisible to both.
- Physics firmness is a *reading aid* for contested moments, not a world
  property.
- Never `playPose()` over an in-flight contact animation — chain it.
- The quarter clock rule must be visible, not just correct.
