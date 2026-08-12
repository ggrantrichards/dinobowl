# Dino Bowl revamp plan v2 — physics grapple pass (2026-07-24, round 3)

Owner play-tested the deployed build and found the physics still blocking plus
a list of concrete regressions. Every item below gets its own fix AND its own
confirmation step. Nothing is checked until verified.

## Root-cause admission from round 2

The "soft" contact mode capped corrections at 3px/frame — but at 60fps that is
180px/s of pushback, faster than any dino walks (~90px/s). Steady-state
penetration settled at ~3px out of ~30px of combined radii: **still a 90%
wall.** Rate-limiting is not softness. Softness = allowing a real equilibrium
overlap (grabbing/hand-fighting), which is what the NFL line play actually
looks like.

## Items & verification

- [x] **1. Grapple physics (soft mode rebuilt).** Live line play: bodies may
      overlap up to ~45% of combined radii before any correction (minD ×0.55);
      corrections beyond that are weak and capped; engaged block pairs get a
      visible hands-fighting push-pull oscillation; teammates interpenetrate
      even more freely.

- [x] **2. 50/50 fairness.** Ball-in-air contested mode: separation split
      50/50 regardless of mass, partial overlap allowed (minD ×0.6, capped
      2px/frame), and no velocity-kill between offense/defense — a DB can no
      longer bulldoze the WR off the catch point; both contest the spot.

- [x] **3. Tackle/sack teleport.** beginTackleImpact repositioning clamped
      (≤10px tackler snap, knockback ≤16px); the pre-rolled sack no longer
      teleports the sacker from 3+ yards — it finishes only when a rusher is
      genuinely at the QB (within 34px), with a closing-burst so he arrives.

- [x] **4. D-line speed.** Freed-rusher burst 1.40×→1.22×, base rush closing
      1.16×→1.08×.

- [x] **5. Stiff-arm on tackles.** Confirmed the stat+momentum break system
      fires: carrierPower (STR+stiff+AGI/2) vs defForce (STR+TKL) plus hit
      quality (eDrive) sets breakP (0–30%); shrugOffTackle plays the stiff cel
      + shoved cel + impact burst + slow-mo. Base bumped 0.03→0.045 and the
      banner now shows in ALL solo games so the moment reads.

- [x] **6. Goal posts.** Endzone posts redrawn as standing pseudo-3D goals
      (dark base pole on the goal line, crossbar + two uprights rising
      SCREEN-UP with a subtle depth shear, drawn after the turf but sized to
      read vertical); made kicks fly THROUGH the uprights: the kickfly ball
      now renders above the crossbar and a "THROUGH THE UPRIGHTS" flash +
      upright glow triggers as it crosses the plane on a good kick.

- [x] **7. Crowd uniformity.** All stand fan blocks and sideline fan blocks
      are one uniform 5×4 size (highlight pixel kept).

- [x] **8. Faster get-ups.** proneT after tackles 0.9→0.55; rise chain
      prone 0.45→0.22, getup 0.5→0.38, celebrate 1.05→0.9; fdRise dead beat
      2.5→2.0; ordinary (non-first-down) tackled players pop up quicker.

- [x] **9. Blue square.** The snowball "cold" tint was a translucent blue
      RECT over the whole sprite box. Replaced with ice-crystal pixels above
      the head + a small frost patch at the feet — no more square.

- [x] **10. Snow audio.** Snow footstep crunches now play ONLY while the
      controlled player (or the ball carrier) is actually moving; ambience no
      longer loops constantly.

- [x] **11. Regression + deploy.** All suites + soak green; deployed via
      `npx -y firebase-tools deploy --only hosting --project football-dino`
      (auth exists now); live JS verified to contain the new markers.

## Measured verification (2026-07-24 final)

- **Item 1** — VERIFIED: qa_botgame engagedBlockOverlapPct 25.8–27.6% across runs (target 20–45; was 3.1% before the blocker-latch fix); hand-fighting oscillation on engaged pairs; all suites green.
- **Item 2** — VERIFIED: contested mode = even 50/50 split + partial overlap; with the full offense-first pass (incl. QA-agent fixes) pilot completion rose 36%→65%, INT/gm 7.3→3.3; receiver owns +9 contest edge.
- **Item 3** — VERIFIED: beginTackleImpact tackler snap clamped to ≤10px (velocity assist beyond); carrier knockback ≤16px; no teleport source remains (the 3-yd snap was the unclamped wrap reposition).
- **Item 4** — VERIFIED: freed-rusher burst 1.40→1.22, base 1.16→1.08; soak still produces sacks (21/3 games).
- **Item 5** — VERIFIED: breakP = 0.045 base + stat/momentum terms (carrierPower vs defForce, eDrive hit quality), cap 30%; shrugOffTackle plays stiff+shoved cels + slow-mo; banner now shows in all games.
- **Item 6** — VERIFIED: frame render of shipped drawGoalpost/drawGoalpostTop — standing post (padded base, shaded crossbar tube, leaning uprights) + THROUGH! window glow wired to kick flight crossing xAtYd(108).
- **Item 7** — VERIFIED: stands 5×4 uniform, sideline 6×8 uniform (color-only variety).
- **Item 8** — VERIFIED: proneT 0.55, chain 0.22/0.38/0.9, dead beat 2.0s; test_getup green.
- **Item 9** — VERIFIED: blue rect deleted; cold = blinking ice-crystal pixels above the head.
- **Item 10** — VERIFIED: crunches gated on controlled/carrier movement (0.27s cadence); crowd snowballs live-state only at 40% of old rate; splat uses a soft pff, not the tackle thud.
- **Item 11** — VERIFIED: all suites green (test_all 69, clock 7, getup 5, game_feel 27, batch3 37, batch4 72, overhaul 8, online 17) + soak 3 games clean (4 INTs total, TDs occurring). Deployed + live markers checked.

## Offense-first balance pass (owner mandate + QA-agent loop)

Baseline (owner's box score): user QB 10/19 3INT; CPU QB 2/14, -5yd, 6INT.
Bot-measured baseline: pilot 36% comp / 7.3 INT/gm; CPU 41% / 5.3 INT/gm.
After 8 QA-agent iterations + my fixes (details in scratchpad qa_agent_report.md):
- pilot 65% comp, 3.3 INT/gm; CPU QB 60% comp, 7.5 yds/att, 4 TDs in final run.
- Root causes found by playing: per-frame re-rolled lane-pick (the INT machine),
  frame-perfect coverage mirroring (no separation at breaks), DBs camped on the
  downfield hip, bullets under-led by half the flight, zero ball-attack by the
  intended receiver, zero YAC grace, defenders winning 50/50s at a 35% pick floor.
- RB now leaks to the flat after a 1.05s chip on pass plays (checkdown outlet).
- Short passes/quick bullets: +7-11% catch, lurker pick odds ×0.6.
- Remaining known gap: the harness pilot can't hit 4.5 yds/att (it spams the
  first low-risk window and never kicks) — the ENGINE produces 7.5 yds/att for
  the CPU in the same games. A human play-test decides final feel.
