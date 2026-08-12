# LESSONS.md — design truths & past mistakes (do not repeat)

Running log of hard-won rules from play-tests and regressions. Read this
before touching physics, animation, clock, or audio code.

## Design truths (from the owner's play-tests)

1. **Physics exists to make contested moments LEGIBLE, not to make bodies
   rigid.** The one hard requirement: on 50/50 balls the receiver and DB must
   be visibly separate — clear WHO is WHERE — so a pick or a contested catch
   feels fair. Firm no-overlap separation belongs ONLY at: presnap alignment,
   ball-in-air, loose-ball scrums. Everywhere else (live line play, pursuit,
   carries) contact must be soft, springy, and capped per frame: bump and
   slide, never box out. Rigid live physics caused: D-line unable to spin off
   blocks, 100% reliable box-outs, pursuit walled by teammates, untackleable
   carriers.
2. **Never overwrite an in-flight contact animation with a new pose.** The
   first-down celebration used to `playPose("celebrate")` the instant the
   whistle blew, which (a) cut the tackle cel and (b) broke the
   tackle-pair overlap exemption, so the solver teleported the two bodies
   apart mid-wrap — "the tackle you never see." Sequence with a pose chain
   instead: `tackled → prone → getup → celebrate`.
3. **Players must STAND UP.** Prone → run-cycle snap-cuts read as glitches.
   The `getup` compact action (turf push → crouch → rise) exists for this;
   any new knockdown state needs a rise path through it.
4. **The quarter clock never ends a live play.** 0:00 mid-snap → the play
   runs to the whistle (tackle/OOB/score), THEN the quarter/game ends. Also
   show the "0:00 — play runs to the whistle!" banner: a correct rule that is
   invisible reads as a bug.
5. **Speed target:** SPEED_SCALE 0.6 at YPX 24 ≈ 3.8 yd/s top speed — exactly
   50% of the stripped build's on-screen speed that was reported as "40 yards
   in 2.5 seconds." Do not remove the scale or the min-speed floor.

## Process rules

6. **A live human play-test outranks everything.** QA still-frames and
   headless sims both passed while live play was broken (sequencing, physics
   feel). Frame exports prove art; only play proves feel. Budget for a human
   pass after any physics/animation change.
7. **This environment is headless:** requestAnimationFrame does not tick in
   the browser pane and screenshots need the pane displayed. Verify via the
   Node harness (`tests/`), canvas `toDataURL` exports, and the `?qa=1`
   deterministic scenes.
8. **Harness gotchas:** `step(ms)` takes MILLISECONDS (use the exported
   `stepFor(seconds)`, never a homemade one); boot with the exact Enter
   sequence from test_all (Enter-spam can land in the wrong mode); pin
   `g.weather` to CLEAR in tests that pin `Math.random` (RAIN puddle checks
   otherwise stagger everyone); poll for state transitions instead of fixed
   waits (dead-ball beats, replays, and slow-mo stretch wall-clock time).
9. **Slow-mo steals test time.** `impactMoment` freeze/slow reduces game-time
   inside fixed step windows; keep the fumble beat short (the loose-ball
   scramble must play near full speed — recovery is gated on `ball.t > 0.45`
   of game time).
10. **The "migration" trap:** never accept a smaller rewrite of game.js /
    sprites.js without diffing — the 2026-07 "new" build silently deleted
    ~3,400 lines (AI, physics, animation system, modes, speed governor). The
    repo `static/game/` files are the source of truth.

## Operations

11. **Deploy:** `firebase deploy --only hosting --project football-dino`
    from the repo root; the live site is https://football-dino.web.app/game/
    and serves `static/game/`. Verify after deploy by curling game.js and
    grepping for a marker (`impactMoment`, `getup`).
12. **Local play:** `python app.py` (port 5000, .claude/launch.json name
    "gridiron") or `python -m http.server` from `static/`. Browsers cache
    game.js/sprites.js aggressively — hard-reload or cache-bust after edits.
13. **Full check before shipping:** test_all, test_clock, test_getup,
    test_game_feel, test_batch3, test_batch4, test_overhaul, test_online,
    **test_aa_glitchless** (added 2026-08-12), soak (3 full games, no runtime
    errors). **NINE suites, 285 assertions** — that is the number to preserve. (batch3's old "avg block hold"
    assertion was remembered as "≥0.9s" but actually guarded 0.72 — its
    stale comment said 0.9. Since the Change-2 grind model it is a two-sided
    0.95-2.0s band on a deterministic accumulator, no longer flaky by design.)

## Round-3 additions (offense-first pass, QA-agent loop)

14. **Rate-limiting is not softness.** A 3px/frame correction cap is 180px/s —
    faster than anyone walks — so it is still a wall. Softness = a legal
    equilibrium overlap (grapple core at ~55% of contact range), enforced only
    beyond it. AND the movement AI must agree: the blocker latch targeted full
    contact range, so physics allowed overlap the AI never used (3% measured
    until the latch target was scaled too).
15. **Per-frame probability rolls are rate bugs.** The lane-pick check rolled
    every FRAME a defender trailed the receiver — a 30%/frame roll is a
    certainty per throw. Roll once per event (per throw / per contact), never
    per tick. Grep for `Math.random() < p` inside per-frame loops when a rate
    is inexplicably high.
16. **Attribute outcomes to harness vs engine before tuning.** The pilot's
    space-press right after each throw mistimed every catch jump and made the
    engine look broken. Instrument branch telemetry (qaT tags) FIRST; tune
    second. Also: a scripted pilot's ceiling is not the engine's ceiling —
    the CPU hit 7.5 yds/att in the same games where the pilot managed 1.7.
17. **Offense-first is a design stance, encode it everywhere symmetric code
    hides defense bias**: default DB jump (80) > WR (72) quietly decided
    every 50/50; equal-split contested physics, receiver contest edge (+9),
    AI receivers timing leaps more often than DBs, grapple share 32/68.
18. **Tests can enshrine dead design.** Five assertions guarded the old
    defense-favoring constants; update the TEST with a comment when the
    design deliberately moved (never to make a broken thing look fixed).

## Round-6 additions (decompiled-source alignment)

19. **The real Retro Bowl has NO dice at the moments of truth.** Catches are
    spatial windows (defender window ≈0.6-0.75× the receiver's, no INTs
    within 5yds of the throw, flat offense bias); tackles are strength
    accumulation in a LOCKED grapple (the tackler rides the carrier until
    the pour beats his threshold — drag-the-pile is emergent); throws have
    ZERO accuracy scatter (arm = velocity/range + fatigue). Fairness = the
    player can always see WHY. Source mined in RETRO_BOWL_MECHANICS.md from
    the GameMaker HTML5 export (github mirrors host it; gml_Script_* names
    survive minification).
20. **When adding an accumulation/engagement model, hunt down every
    old-throttle**: the per-arrival `tackleCd = 0.5` silently broke the
    grapple (contact fired once per half-second); the "dazed" fallback
    branch detached the tackler. Deterministic models need PERSISTENT
    engagement — remove one-shot cooldowns and re-anchor escapes as the
    only detach paths.
21. **Removing randomness shifts distributions elsewhere** — zero-scatter
    throws landed ON the receiver every time, inflating contested-catch
    entries and INTs until the contest gate matched the source's window
    ratio. Align the whole chain, not one link.
22. **Owner keepers vs source**: play-call cards, playable defense, the
    timed-jump duel, no kick returns, dino powers — deliberate divergences;
    everything else follows the decompiled source. Check the SETTINGS menu
    defaults before assuming a behavior is missing.

## Round-8 additions (catch-legibility pass, 2026-07-28)

24. **A 2-game qa_botgame run is statistical noise.** The same build produced
    pilot 29%, 55%, and 79% comp across three 2-game runs (matchup + small-N
    variance). Never accept or reject a balance change on fewer than ~6 games,
    and diff the TELEMETRY DISTRIBUTION (tele tags), never just the topline.
25. **The books must balance.** resolveArrival pushes `arrive:*` and
    intercepted() pushes `icall:*` tele tags; arrivals must ≈ attempts and
    icall must equal the sum of int:* cause tags. A mismatch means a code path
    without a cause tag — that IS the legibility regression (LESSON #19), and
    it's machine-checkable. Keep the instrumentation (it only runs under qaTele).
26. **Contested-entry rate is the passing-feel metric that matters.** With
    zero-scatter throws every ball lands in the receiver's window, so the
    outcome distribution is decided by how often a defender is close enough to
    force the 50/50 duel: measured 68-77% of arrivals (ct: tags / arrive:
    tags) — in real Retro Bowl contested catches are the MINORITY. Coverage
    cushion, not catch dice, is the lever that moves comp% and INT rate.
    AMENDMENT (post Change-2): widening the standing cushion (22→28px) did
    NOT move contested-entry (still ~80%) — breakOnBall lets DBs close
    60-110px during a 0.6-1s flight, dwarfing any presnap cushion. The real
    lever is flight-time closing speed/reaction, which interacts with the
    owner-keeper timed duel → needs an owner call, not an autonomous change.
    Outcomes still landed in band (pilot 77%/2.7 INT-gm, CPU 67%/1.7)
    because the duel itself is offense-tilted; high contest rate may even be
    the right Dino Bowl feel. Judge in the live play-test.

## Round-7 tuning (owner play-test)

23. **Tackle collapse tuning:** fold pitch 0.10+0.08p with head-lead 1+2p (a
    0.14+0.14p pitch read as a pancake); tackled cel 0.42s, wrap 0.34s,
    slow-mo ≤0.2s, proneT 0.4 — the takedown must resolve in under a second
    of screen time. Forced-fumble terms run at roughly HALF their v1 values
    (base 0.005, hardHit fresh 0.07); goal fork is ±30px with makes threading
    MID±8 — snug like the reference.
