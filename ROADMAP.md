# ROADMAP.md — the canonical Dino Bowl plan of record

> **This file supersedes `AA_PLUS_PLAN.md` as the plan of record (2026-08-12).**
> `AA_PLUS_PLAN.md` stays for its rationale, its DO-NOT-TOUCH list and its owner
> questions, but **every line number in it is stale by 100-300 lines** and its
> §3.7 deletion range is actively dangerous — see the warning below.
> `AA_TRANSFORMATION.md` remains the record of what shipped on 08-06/07.

## Provenance

Produced 2026-08-12 by an 8-dimension adversarial audit: eight specialist finders
(sim core · flow/state · animation · special teams · juice/parity · perf/mobile ·
meta/franchise · hygiene/ops), each finding then handed to a verifier whose job was
to **refute** it from the code. **64 findings verified → 59 survived (5 refuted).**
Every surviving finding's line number was re-grepped against the working tree.
17 agents, ~2.97M tokens, 947 tool calls.

Two independent methods fed it, and they found different things — keep both:
- **Static**: reading code against `LESSONS.md` and the decoded Retro Bowl source.
- **Dynamic**: harness probes (pacing, per-frame invariants, first-down integrity,
  corrupt-save boot, sprite-cel pixel metrics). Four of the five defects fixed on
  08-12 were found *only* by probing, not by reading.

## GRIDIRON 3.0 — 2026-09-10 (shipped, build g11; #11's data split is the one open half — see GRIDIRON_3.md)

UI/UX only. No new stat families. Each line is a fix to something a user hits today,
ordered by how often they hit it. P0 = necessary, P1 = clear improvement, P2 = worth it later.

| # | P | Today | 3.0 |
|---|---|---|---|
| 1 | P0 | A 2,000-row result is 2,000 DOM rows x 25 cells; scrolling stutters | Render ~150 rows and stream the rest as you scroll (windowed table). Same look, instant |
| 2 | P0 | The URL never changes; refresh loses the question, a result cannot be sent to anyone | Question, sort and theme in the URL (`?q=...&sort=passing_tds:desc`); back/forward move between questions |
| 3 | P0 | Zero rows says "0 player-seasons matched" and nothing else | Say which clause emptied it ("pressure rate ≥ 12% leaves 0 of 114 — the max at 300+ snaps is 8.2%") with one-click relax |
| 4 | P0 | A stat that exists from 2018 silently returns nothing for 2010-2017 | Coverage note in the read-back ("pressure rate is charted from 2018; earlier seasons cannot match") |
| 5 | P0 | Wide tables lose Yr / Player when scrolled sideways | Freeze the first three columns (Yr, Player, Pos) |
| 6 | P0 | Typing a stat name is guesswork | Autocomplete from the alias table as you type (positions, stats, "since", "top N"), keyboard-driven; `/` focuses the box |
| 7 | P1 | The read-back is display only | Each clause is editable: click the value to change it, x to drop it, re-runs instantly. The read-back IS the filter UI |
| 8 | P1 | 25 columns whether you asked for them or not | Column chooser (per position group, remembered) + "per game" toggle like PFR |
| 9 | P1 | Player page is one 30-column grid | Tabs on the grid: Passing / Rushing & Receiving / Advanced / Bio; click a header to chart that stat instead of the fixed one |
| 10 | P1 | Header tooltip is the raw display name | Proper hover card: definition, formula, source, coverage years (from the glossary data already on the page) |
| 11 | P1 | First load pulls 24 MB with a spinner | Byte progress bar; split data.json into a hot core (always) + advanced/NGS shard (on demand) so first answer is ~3x sooner |
| 12 | P1 | Export is copy-paste from the screen | "Copy as CSV" and "Copy link" on the results toolbar |
| 13 | P1 | Below 640px the table is unusable | Card rows on phones (Yr · Player · Tm and the 4 headline stats), sticky Run button |
| 14 | P1 | League leaders are not visible in a result | Bold the league-leading value in each column for that season (rank data already exists) |
| 15 | P1 | Sort resets on every new question | Keep the sort when the column still exists; show it in the URL (#2) |
| 16 | P2 | Scatter chart axes are fixed | Axis pickers; hover a row to light its dot; click a dot to open the player |
| 17 | P2 | One type scale drifted across three passes | Spacing/type audit on an 8px grid: 12/13/15/17/22/34, buttons 36px, one radius, one border colour per theme |
| 18 | P2 | Theme is light or dark | Add "auto" (follow the OS) as a third state; keep light as the first-visit default |
| 19 | P2 | A could-not-read clause just says so | Suggest the nearest alias ("did you mean pressure rate?") using the fuzzy matcher already in the engine |
| 20 | P2 | Keyboard use is partial | Esc clears, arrows move through autocomplete, Enter on a row opens the player, focus rings everywhere |

Not proposed: accounts, comments, comparisons/compare-two-players, team pages, fantasy
projections, predictions. They are features, not upgrades, and each would need its own data.

## DINO BOWL 2.3 — 2026-09-10 (shipped): YAC fade + safety chase flight

Owner play-test: receivers never slowed after the catch, and the CPU quetzalcoatlus
safety only ever flew on the once-a-play breakaway latch (nobody left in front), so a
trailing safety jogged behind a 20-yard YAC run. Two deterministic changes in `updateEntity`
and the live loop, no dice (LESSON #15/#19):

- **YAC FADE** — `catchX` is stamped with `catchT`; the carrier loses 0.6% of top speed per
  yard after the first 6 yards of YAC, 8.4% down at 20, floor 18% at 36 (`yacFade`, merged
  with `longCarryFade` by max). Pinned scenario: 100% → 88% at 25 yd → 82% at 40 yd; the old
  build measured flat.
- **SOAR CHASE** — every 0.2s of a carry 6+ yards past the LOS with no defender within 30px,
  `cpuSoarSave(c, true)` lets a CPU quetz the carrier has already run past fly at the
  intercept point, with a real charge (≥0.6) only, landing up to 4 yards short (the fade
  and a fresh pursuit close the rest). Pinned scenario, safety 7 yards behind: 12/12
  flights within a second; old build 0/12. Human-steered safeties are never auto-launched.

Gridiron in the same push: length buckets ("20+ yard passing TDs"), playoff wins / Super
Bowl wins from play-by-play, table scrollbars (see README).

## DINO BOWL 2.0 — 2026-09-09 (branch `dinobowl-2.0`, shipped)

The 2.0 pass is a **presentation and UX** release. Gameplay, physics, balance,
tackle timings, the kick meter math, the throw model and every keeper in §7 /
LESSONS #22 are untouched by design — the owner asked for the same classic feel.
What changed is the layer *around* the football, plus the open P0s that were
pure product bugs. Screens were audited live in Chrome (every state, both
fresh and mid-season) before anything was drawn.

| # | What was weak | What 2.0 does | Where |
|---|---|---|---|
| 1 | **Season hub** was six centred text lines — the screen a season player sees most, with no colour, no dinosaur, nothing to read | Team-colour header band with mascot, record, division rank and streak · NEXT UP matchup card (opponent mascot, record, home/away, OVR bar) · coaching staff with stars · last-five form strip · full 17-week schedule strip with W/L colours and the current week framed · tappable action chips (PLAY / STANDINGS / STATS / TRAIN / MENU). All keys unchanged; a tap on empty space no longer starts a game by accident | `drawHub`, `hubChips`, `drawTeamBand`, `mascotSheet` |
| 2 | **Team select**: abbreviation drawn in the helmet colour was near-invisible on a dozen jerseys; no mascot anywhere on the screen that picks dinosaurs | Two-colour tiles with text legible on any jersey (`onTeam`) · left panel: mascot, division, OVR with bar · right panel: the stars (QB identity, RB/WR OVR, kicker) or, on step two, the head-to-head matchup. Grid geometry unchanged, `teamCellAt` untouched | `drawSelect` |
| 3 | **FINAL screen** was three lines over the frozen field | Scoreboard card: both teams in their colours with mascots, verdict, week context, YOUR DAY, player of the game, your top three stat lines. B = box score unchanged; the card hides while the box is open | `drawOver` |
| 4 | **Standings** were 7px columns | Eight division panels: rank, colours, name, record, games back, leader marked, your row framed, conference playoff-line footer | `drawStandings` |
| 5 | Front door "PLAY SEASON" said "pick up where you left off" | It names the season: `EAGLES · 4-2-1 · WEEK 8 vs BEARS` | `homeOptions` |
| 6 | **P0-6** TD yardage never reached YOUR DAY (`0 TOTAL YDS · 1 TD`) | `touchdown()` credits `G.stats` for side A | `touchdown` |
| 7 | **P0-11** END OF Q / HALFTIME / OVERTIME / opening kickoff killable on frame 1 (timer belonged to the state) | `deadBeat(secs)` arms a fresh lockout clock for ceremonial beats | `deadBeat`, `endQuarter` |
| 8 | **P0-24** crowd bus pinned at 1.1 above the action, no slider | CROWD VOLUME setting (default 70%), ceiling 0.85 × volume — the bed sits under the SFX layer (owner mix law) | `setVol`, `SETTINGS_ROWS` |
| 9 | Kick meter's centre stripe promised a payoff for a year | PERFECT! banner + sparks + cheer on a dead-centre lock. Cosmetic only — `kickLocked` math unchanged | `kickLocked` |
| 10 | No favicon / theme-color / share card on either shell | SVG 🦖 favicon, theme-color, description and OG tags on both shells; `const BUILD = "2.0"` shown on the title | `index.html`, `game.html` |

Not touched, deliberately: run-game yardage band, scoring targets, snapshotFrame cost,
pooled particles, dead-code deletion, direction swap, franchise economy (all still open
below). Verification: the twelve headless suites plus `text_overflow_sweep` (448 scenes,
0 hits) pass; every new screen screenshotted in Chrome fresh and mid-season.


## Status — what is already fixed and deployed

Shipped and live as `aa-plus-v36-20260812`, all verified by curl against the
deployed bundle. **Baseline to preserve: 285 assertions, 9 suites, 0 fail.**

| Finding | Fix | Proof |
|---|---|---|
| Unguarded `localStorage` in the `const G` initializer killed the **boot** — including Safari private browsing, which needed no corruption at all | `lsGet/lsSet/lsDel/lsJSON/lsInt` guards; 9 call sites routed through them | `test_aa_glitchless.js` A1-A7 (child-process boot against hostile storage) |
| First-down ruling compared a **float** spot to an integer line while the plate drew the **rounded** spot — ball sat on the yellow line reading "4th & 1", ~3.6% of plays | one `spotInt` + one captured `fdLine` drive both ruling and display | B1-B3; chain drift 6 → 0 over 253 plays |
| Kick flight was the **only** unskippable dead beat, and ran 3.2s+ against a 1.7s intent | `flySkip()` + `FLY_READ_LOCK`; `T` clamped to 1.7 | C1-C2; impatient 15.4s → 3.3s per game |
| Dead cels: `shoved` frames 2-3 pixel-identical in **all 11 species**; `tackled`'s two fold cels near-identical uprights | four distinct leans; fold arc samples 0.40→1.0 | D1-D7 (pixel-level, min delta 4.7% → 55%) |
| `kickLocked()` re-entrancy → NaN punt geometry → permanent `kickfly` softlock (**P0-12**) | re-entry refused, `k.val`/`k.power` pinned finite | full battery |
| Career mode deleted its own save at season end (**P0-9**) | ENTER always continues to the offseason; wipe requires explicit ESC | full battery |
| SCOUTING blank on the Firebase host (**P0-14**) | falls back to `/game/players.json`; stays `null` on failure so it retries | full battery |
| Stale cache-bust token | both shells → `v36-20260812` | curl |

**Therefore: of the 24 P0s below, P0-9, P0-12 and P0-14 are DONE.** Their remaining
sub-items (the `deadBeat()` lockout routing in P0-11, the touch-id work in P0-13,
the `k.mode` latch in P0-4) are untouched. **21 P0s remain.**

Note: §5 A8 names `BUILD = "aa-plus-v35-20260812"`; the shipped token is now **v36**.

## BALANCE TARGETS — from the owner, 2026-08-12 (authoritative)

These are the owner's first-hand Retro Bowl numbers. They are the spec; published
sources do not carry this data (searched, nothing usable). **Do not tune toward NFL
realism** — Retro Bowl is deliberately an arcade curve and NFL rates are the wrong
target. A game is ~25 attempts, so per-game NFL rates do not transfer either.

| scenario | pass yds | TD | INT | comp % |
|---|---|---|---|---|
| **Normal** (good OL + good WR/RB) | **300** | **4** | **2** | **80** |
| Underdog (elite opponent, weak roster) | 175 | 2 | 2 | 70 |
| Stacked (your roster OP, weak opponent) | 400 | 5 | 0 | — |
| **Opponent / CPU baseline** | **280** | — | **2** | **75** |
| Opponent points | **~26** | | | |

**The arithmetic that makes 80% completion and 2 INT coexist** — and it is the whole
design, so do not "fix" one without the other. 25 attempts = 20 completions + 2 INTs
+ 3 harmless incompletions. That is an **8% INT rate, ~3.5x the NFL's 2.3%**, sitting
on top of a completion rate well above the NFL's 65%. So **40% of all failed throws
are interceptions**. Throw it to the right place and it is caught almost every time;
misread the route, misclick, or panic, and you are usually picked rather than merely
incomplete. High punishment SALIENCE at moderate frequency, with all agency in the
player's thumb — which is what the zero-scatter throw model in
`RETRO_BOWL_MECHANICS.md` §1/§4 is built to deliver.

### Where Dino Bowl actually stands (seeded 6-game run, seed 4242, post-batch-B)

| metric | pilot | CPU | target | verdict |
|---|---|---|---|---|
| completion % | 76 | 85 | 80 / 75 | **in band** (CPU slightly too high) |
| INT per attempt | 7.6% | 3.4% | ~8% | **already correct — do not touch** |
| INT per game | 2.7 | 0.7 | 2 | close |
| **yards per attempt** | **4.3** | **2.8** | **~12** | **3-4x too low** |
| **pass yards / game** | **152** | **54** | **300 / 280** | **2-5x too low** |
| **pass TD / game** | **0.2** | **0.2** | **4** | **20x too low** |
| **points / game** | **1.0** | **14.7** | — / ~26 | **broken** |

**The conclusion that matters: the INT dice are NOT the problem. The offense is.**
Completion rate and INT rate are already inside the Retro Bowl band. What is broken
is that a completed pass gains 4.3 yards, so drives never reach the end zone. Any
instinct to "reduce interceptions" is tuning the one dial that is already right.

### Tuning priority, in order

1. **Yards per attempt.** The read selection only ever takes short, safe routes.
   The CPU's own AI manages 2.8 yds/att with no harness bias at all, so this is the
   engine, not the pilot. Levers: `safeLimit`/`playableLimit` and the `risk * 145`
   board weight in `cpuReadBoard`, route depth, the throw range clamp, and the
   lowered lob apex from the 08-11 session. This is ROADMAP A6 and it is
   balance-coupled — re-baseline with a seeded 6-game diff.
2. **Rushing nets ~0 yards for both sides** even after the sack-attribution fix
   (verified identical pre-batch-B, so it is not a regression). Half the offense is
   missing; TDs cannot recover without it.
3. **TDs follow from 1 and 2.** Do not chase TD count directly.
4. **CPU is too conservative** (85% completion means it only throws layups). Same
   read-selection lever as 1; it is also what makes the defense feel untested.
5. **INT rate: leave alone.** 7.6% vs an 8% target.

### Instrument status (what you can and cannot trust)

- **FIXED**: `qa_botgame` is seedable (`node tests/qa_botgame.js [games] [seed]`).
  Unseeded, the same build produced pilot INT 37 vs 53 — every unseeded balance
  comparison in this repo's history is uninterpretable (LESSON #24).
- **FIXED**: sacks are no longer booked as QB rushing attempts, which had cancelled
  64 carries to 0 net rushing yards.
- **STILL BROKEN**: the scripted pilot is a weak QB — bullets only, risk <= 0.45,
  mistimed catch jump. Its 4.3 yds/att is partly its own fault, so the human-side
  yardage figure is a floor, not a measurement (LESSON #16). Fix the pilot before
  signing off any human-side balance number.

## BATCH STATUS — what is DONE and live

| batch | scope | shipped | state |
|---|---|---|---|
| **A** | Animation & pose integrity (5 items + 3 in-kind) | v37 | **DONE** |
| **B** | Contact physics & live feel (5 items) | v38 | **DONE** |
| **A6** | Read-selection / yards-per-attempt | v39 | **DONE** (owner-approved) |
| — | Short-throw aim accuracy | v40 | **DONE** |
| — | Owner play-test round 1+2 (all 3 findings) | v41, v42 | **DONE** |
| **C** | Special teams & kick input | v43 | **DONE** |

Baseline held throughout: **293 assertions, 9 suites, 0 fail**, clean 3-game soak,
every deploy curl-verified byte-identical to local.

### Batch A — DONE (v37-20260812)
proneT rise chain (rotated-walk fallback 180/180 frames → 0); dive cel
double-rotation; frameBobDy baselined on the standing pack (max float 12px → 0);
catch-cue contact guard; `% 2` walk-cel clamps removed (3 sites).

### Batch B — DONE (v38-20260812)
Arrival-pool state filter; escape charges no longer burned inside the catch
grace; the three hard freezes (stalk-block frozen frames 35-59% → 0-6.5%, worst
pin 1.57s → 0.50s; blockHold leak; FB pancake 3 defenders → 1, self-freeze
6.55s → 0.00s); sacks no longer booked as rushing attempts; juke/stiff frame-rate
spread 4.87x → 1.13x.

### Batch C — DONE (v43-20260813)
**C1 kick input:** two models fired on one press — the press burned the meter's
power beat AND fired `sfx.kick` while the same held pointer accumulated a drag
pull (measured **2 sfx.kick per kick**, two different power numbers per gesture),
and a discarded regrip left the NEXT press kicking with a power the player never
chose. Now `k.mode` latches one model per kick; a press only arms the gesture and
samples the meter AT THE PRESS; `kickRelease` arbitrates tap vs pull; the loser is
a no-op. Kick SFX moved to the actual boot (2 → 1). `onRelease` now sees the kick
state at all — it previously bailed on anything not `"live"`, so a tap inside one
frame was invisible. Meter oscillation / perfect window / dawdle / resolveKick
math untouched.
**C2 kickoff:** the beat rendered with **0 players for all 102 frames** and left
`ball.mode = "koflight"` frozen over the first play-call card 10.5s later. Now a
real 11-v-11 alignment (22 players, all 102 frames) and the ball resolves to
`dead` before any card. Still no kick return (owner veto) — receiving team takes
over at its own 25.
**C3 spotting:** missed FG had no floor and was spotted at the LOS (los 97 miss →
opponent at their own **3**); now spot-of-kick with a 20-yard floor. Extra points
were staged from the TD's LOS — **measured at 18, 22, 29, 42, 57 and 72 yards**;
now uniformly 33 (`originYd 84`), at **no conversion cost: XP 96% → 97%**.

*Attribution note:* points/game moved at both probe seeds, but that is kickoff-flow
divergence, not a nerf — C2 changes possession timing from the first snap, so a
seeded game is a different game after it (LESSON #24). The attributable mechanism
measurement is flat (XP 96→97%, FG rates unchanged). Two seeds cannot rule out a
systematic effect; the kicking mechanism itself is clean.

*Open owner calls from batch C:* (1) a tap now commits on RELEASE using the
press-instant value — timing-honest, but the visual commit is ~50-80ms late; say
the word if it feels laggy. (2) The 2.4s pregame beat in `kickoffAfterPregame` is
still an empty field — same class as C2, not yet fixed.

### OWNER PLAY-TEST FINDINGS — v40 → all fixed in v41/v42

1. **"Players don't slow down after receiving the ball"** — FIXED v41. Receivers
   were at **100% of route speed** the frame they possessed the ball, inside the
   0.40s untackleable grace. Deterministic gather ramp: 55% legs at possession →
   full stride at +0.45s, crossing ~95% exactly as the grace expires. Defenders
   now close 11-14px in the first 0.5s (was 2-9px).
2. **"You never see the ball go through the uprights"** — FIXED v41, and it had
   **never once** flown through: made kicks peaked at z≈72 against a crossbar
   ~84+, crossing ~70px BELOW the bar and dying on the posts. Arc now solved from
   the crossing constraint (z≈115, inside the drawn window), flight ends 150px
   past. Make/miss ruling byte-identical.
3. **"CPU safeties never use their flight ability"** — FIXED v42. Verified true:
   both startSoar call sites were human input, 0 defensive soars in 12 seeded
   games. `cpuSoarSave` hooks the existing breakawayCalled latch (once per play,
   structural), flies the fastest un-engaged CPU quetz to a led intercept point,
   spends real charge, resolves through normal contact. 17/17 in-range breakaways
   answered; a breakaway TD became a stopped long gain. Never auto-launches a
   human-steered safety (measured zero fires on the controlled side).
   *Feel knob if it reads as a leash: charge gate 0.3 → 0.6, or reach 1.02 → 0.9.*

## TRENCH WARFARE — OL vs DL, the AAA rewrite (owner-directed 2026-08-13)

The run game gains ~0 yards and I failed to fix it in five separate attempts, each
aimed at a different layer and each measured as no better than baseline. This
section records the diagnosis, why each attempt failed, and the subtask
decomposition that follows from the evidence. Read it before touching case "block"
or case "rush".

### What is measured and certain

- The back is NOT the problem: he reaches full speed (102 vs a 91 top) and moves
  forward on 98% of frames.
- He is contacted 0.2-0.3s after a handoff taken 1.5yd deep, and gains 1.05yd.
- In 29 of 30 forced run plays the first defender to reach him is a DL **who had
  already been blocked**. Blocking is therefore COSMETIC with respect to
  penetration -- the block latches and rides along to the ball.
- The five OL sit 32px apart with ~14px body radii: about **4px of daylight**. The
  line is a solid ~140px wall. No lane exists by construction.
- Only receivers and the TE ever get a run-specific state ("runblock"). The OL stay
  in case "block", which is pass protection -- a HOLD, not a drive.
- Pass protection separately measures: rushers engaged 52.9% of rush-frames, median
  engagement 0.65s against a nominal ~1.3s grind, and 39.6% of rush-frames are a
  rusher running FREE post-shed. Retro Bowl's line, per the decoded source,
  "virtually always wins the mutual grind" and gives only to a shed or a ~12px
  tether break.

### The five failed attempts (do not repeat these)

1. Blocker aims THROUGH his man on runs -> carrier 1.05 -> 0.07yd. The contact
   solver caps per-frame correction and enforces an equilibrium overlap, so
   pressing into a defender cannot move him; it only parks the blocker in the lane.
2. Explicit strength-scaled positional shove on the rusher -> 0.29yd. Undone by the
   solver and by the rusher's own pursuit speed.
3. Gap derived from RB alignment + carrier aims at it + OL lane-discipline sort ->
   0.67yd, and own-traffic ROSE 48% -> 78%: aiming him at a gap that is 4px wide
   just runs him into the two men flanking it.
4. Step the flanking linemen aside at the snap to widen the gap -> 0.57yd.
   **Why it failed, and this is the key insight: engaged blockers run
   moveToward(rusher) EVERY FRAME, so the line re-converges and a one-time
   alignment change is erased within a few frames. A lane must be MAINTAINED.**
5. Cut the pass-rush `push` to 15% on runs (blocked rushers advance toward the ball
   at `push` px/s, and on a run the ball is only ~36px away) -> 0.74yd.

### Subtasks, in dependency order

**S1 MEASUREMENT FIRST.** A real blocking instrument, because ad-hoc 30-play probes
produced numbers noisy enough that attempts 1-5 were arguably indistinguishable.
Needs: seeded yds/carry DISTRIBUTION (median + p90, not mean), time-to-pressure,
sack rate as a share of dropbacks, hole width over time, pair displacement, and
first-tackler role + whether he was blocked. Nothing downstream is trustworthy
without this.

**S2 ASSIGNMENT MODEL.** Replace "nearest unengaged rusher" globally -- which clumps
all five blockers on one threat -- with per-play-type assignment: gap/lane
responsibility on runs, inside-out pocket integrity on passes.

**S3 PENETRATION CONTROL.** Being blocked must impede progress toward the ball.
Separate "engaged and held" from "engaged and walking to the ball" (the 29/30
finding). This is the single highest-value subtask.

**S4 LANE MAINTENANCE.** The designed hole, derived from RB alignment, must survive
per-frame re-convergence -- bias the flanking blockers' target continuously, do not
move them once at the snap.

**S5 DISPLACEMENT / DRIVE.** Run blocks should move defenders off the ball
(currently ~0.6yd) via a bounded, strength-scaled mechanism that respects the
solver's soft-contact contract (LESSON #1) rather than fighting it.

**S6 SHED FIDELITY.** Attribute the 1.3s nominal vs 0.65s measured gap (per-snap
jitter, technique feed multipliers, the tether, the derived OL blk rating) and make
a shed read as a MOVE rather than a timer expiring.

**S7 SECOND LEVEL.** Nobody blocks the linebackers; receivers stalk-block DBs. A
hole must lead somewhere, so someone has to climb.

**S8 CARRIER VISION.** cpuCarrier defaults to `ty = e.y` -- dead straight from
alignment. He needs to aim at the hole, then read the second level.

**S9 MAX PROTECT.** Retro Bowl's nTEblockers raises every OL's strength by 0.85 and
limit by 27.5; ours gives a blocking TE no line effect at all, so keeping him in is
not a decision.

**S10 REGRESSION GATES.** Permanent assertions: test_batch3 #6's pass-protection
hold band must hold (it uses freshPassPlay, so it is insulated from run changes),
plus new bands for sack rate, yds/carry, and no rigid freezes.

### Hard constraints for all of it

The contact solver's three-mode system and the firmness rules are DO-NOT-TOUCH
(LESSON #1: firm only at presnap / ball-in-air / loose-ball). No per-frame
probability rolls (LESSON #15). No dice at moments of truth (LESSON #19). A run game
gaining 8yd/carry is as broken as one gaining 0 -- the target band is 4-5.

## Read this before deleting anything

**`AA_PLUS_PLAN.md` §3.7 says "remove legacy FILM cels sprites.js:671-992".
Executing that range today deletes `buildSpecies` (`sprites.js:777`) — the function
that builds every sprite in the game — plus the 4-frame walk expansion and
`IDLE_MAPS`.** `profileOf` (`sprites.js:925-944`) is **live code** that happens to
sit under a comment header reading `// LEGACY FILM-CEL MODELS (unattached)`.
Delete by symbol name, never by line range, and only after AA_PLUS open question 5.

## Why the coordinates rotted

`game.js` and `sprites.js` were rewritten on **2026-08-11** (visual / special-teams /
QB overhaul) and again on **2026-08-12** (this glitchless pass) with **no doc entry
for either at the time**. That is the single root cause of every stale line number
in the older plans, and it is why Lane B1 below is a safety-critical task rather
than housekeeping. Both sessions are now recorded in `AA_TRANSFORMATION.md`.

## How to work this plan

1. **`git init` happened on 2026-08-12** — this repo now has history. Use it. Before
   08-12 there was no version control, which is why edits had no rollback.
2. **Lane A is strictly sequential** (`game.js` is one 10,581-line IIFE). Lane B
   never opens `game.js` and runs in parallel with any Lane A batch.
3. Full battery green between every batch — 285 assertions minimum, plus the new
   assertions each batch brings.
4. **LESSON #6 still outranks this document.** Batches A3, A5 and A8 are marked as
   needing a live human play-test; the harness cannot sign those off.

---

# DINO BOWL — AA REQUIREMENTS LIST AND BUILD PLAN
**Author: lead engineer · Date: 2026-08-12 · Baseline verified this session**

**Ground truth for every line number below.** All citations are re-anchored against the CURRENT working tree: `static/game/game.js` = 10,581 lines / 571,136 bytes, mtime `2026-08-12 14:48:51`; `static/game/sprites.js` = 1,901 lines, mtime `14:46:51`; both shells mtime `14:55:16`. The eight specialist audits ran against two different revisions (~14 to ~23 lines of drift in the 5900-8400 band), so **every finding's cited line was re-grepped and corrected here.** Implementers must still re-grep the quoted string before editing — LESSON #10 discipline.

**Verified baseline (run this session, all nine suites):** `test_all 71 · batch4 91 · batch3 39 · feel 27 · online 17 · aa_glitchless 20 · overhaul 8 · clock 7 · getup 5` = **285 assertions, 9 suites, 0 fail.** Note LESSONS.md#13 lists only eight suites — `tests/test_aa_glitchless.js` (2026-08-12, 20 assertions) is not in the pre-ship list. That doc gap is a batch-B1 fix, and **285/9 is the number the plan must preserve, not 265/8.**

**Two findings are already remediated — do not re-plan them.** (1) Both shells are now pinned to `?v=aa-plus-v35-20260812` (`static/game/index.html:112-113`, `templates/game.html:138,144`) and are byte-consistent; the residual is the missing `BUILD` constant, per-file tokens, `firebase.json` headers block, and a parity test. (2) The unskippable kick flight is closed — `flySkip()` exists at `game.js:1273` with `FLY_READ_LOCK = 0.35` bound to tap and SPACE/ENTER.

---

## 1. VERDICT

The simulation core and the pacing loop are genuinely at or above the AA bar, and the whistle-to-snap budget already **beats** Retro Bowl (routine down: 0.6s beat + two taps, one of which is the throw windup; TD-to-next-snap floor ~2.4s vs Retro Bowl's 4-5s). What stands between this build and shipping is not design — it is a **layer of confirmed, mostly one-to-five-line defects sitting on the highest-traffic beats in the game**: a tackled dinosaur never stands up and holds a 90-degree-rotated *walk* sprite for the entire dead beat (measured 385 of 400 frames), three or four defenders freeze rigid on every single run play, every extra point is staged from the touchdown's line of scrimmage, every kick fires a phantom kick sound and shows the player a meter value he is not controlling, and career mode deletes its own save file at the end of its first season. Retro Bowl has none of these because Retro Bowl has no equivalent of the last two undocumented sessions: `game.js` and `sprites.js` were rewritten on 08-11 and again on 08-12 with **no doc entry for either**, which is why every coordinate in AA_PLUS_PLAN 2.2/3.7 is now wrong by 100-300 lines and why a "delete sprites.js:671-992" instruction would today delete `buildSpecies`, the function that builds every sprite in the game. There is also one hard softlock (a two-finger tap on the PUNT card NaNs the punt geometry and parks the game in `kickfly` forever — `flySkip` does not save it because `NaN < 0.35` is false) and one shipped menu screen that is completely blank on the only host real players use. Verdict: this is roughly **six to eight sequential game.js batches from glitchless**, the presentation ceiling is 80% built and 20% wired, and the largest single risk to the project is not code quality — it is that nobody is writing down what changed.

---

## 2. P0 — GLITCHLESS

Ordered by **how likely a player is to hit it.** Every item is a CONFIRMED or verified-PARTIAL finding.

### P0-1 · Tackled dinos never stand up; a rotated walk sprite holds for the whole dead beat
`game.js:6094` (`tickDeadEntities` has no `proneT` line) · `game.js:6490` (only decrement, live-path only) · `game.js:7865` (`playPose(c, "tackled", 0.42)` with no chain)
**Player sees:** every routine tackle. The authored tackled cel expires, then a sideways-rotated *walking* dinosaur (velocity 76.6 > the idle gate) sits frozen on the turf for 6.43s across `dead` → `playcall`, visible behind the card because `renderInner` draws the world first. No getup ever plays. Measured: 385/400 frames in the rotated fallback, `proneT` still 0.400 at the end.
**Fix:** after `playPose(c, "tackled", 0.42)` at 7865 add `c.poseChain = [{pose:"prone",dur:0.34},{pose:"getup",dur:0.34}]` and let the existing chain runner (6127-6137) drive it; then add `if (e.proneT > 0) e.proneT = Math.max(0, e.proneT - dt);` beside the `poseT` tick in `tickDeadEntities`. Order matters — the tick alone makes him pop upright with no rise, which is worse.
**Proof:** extend `tests/test_getup.js` with a **1st-and-20** tackle (cannot be a first down) asserting the pose sequence contains `prone` then `getup` and that `rotationFallback` is never active; `test_game_feel` pose assertions stay green.

### P0-2 · Three to four defenders freeze solid on every run play
`game.js:6997` — `b2.vx *= 0.5; b2.vy *= 0.5; if (b2.staggerT <= 0) b2.staggerT = 0.12;`
**Player sees:** on every carry, the WR/TE stalk blockers turn their men into statues. The `<= 0` guard does not prevent a continuous freeze — it re-stamps on every decay, and because offense is pushed into `P` before defense in `buildPlayers`, the defender never gets one free frame; `6490` holds him at `vx = vy = 0` for the entire hold. `game.js:3130` sets WR1/WR2/WR3/TE to `runblock` on every run, so this is the highest-frequency defect in the build and the literal symptom LESSON #1 was written about.
**Fix:** delete the `staggerT` stamp; keep the velocity damp plus a small positional shove and let the contact solver own separation (LESSON #1 bump-and-slide). Separately add `e.blockHold = 0;` to the quetz-soar break at `game.js:6991` so the retained accumulator cannot kill the next block on frame one.
**Proof:** deterministic probe — run-block a defender for 1.0s and assert he is never `vx === 0 && vy === 0` for more than 2 consecutive frames; `test_batch3`'s 0.95-2.0s block-hold band must stay green.

### P0-3 · Every extra point is snapped from the touchdown's line of scrimmage
`game.js:4611` — `originYd: kind === "KO" ? 35 : G.losYd` · hard-coded distance at `4646` and `4796`
**Player sees:** score from the 45 and the kicker lines up at the 39 while the HUD calls it a 33-yard XP. `touchdown()` (4111) never assigns `G.losYd`; the author knew — `goForTwo` sets `G.losYd = 98` explicitly. Blocked XPs then need a 55-yard scramble because `spotYd >= 100` is the gate.
**Fix:** `originYd: kind === "KO" ? 35 : kind === "XP" ? 84 : G.losYd`. 84 is the spot at which `100 - 84 + 17 = 33` matches the two hard-coded 33s, so geometry, meter plan and scoring all agree **without touching `G.losYd`** (which is the live drive spot). Same for `defensiveTouchdown`'s XP staging and the blocked-XP live ball.
**Proof:** matrix test asserting `kick.originYd === 84` and `kickerEnt.x` are independent of the TD's LOS, across LOS 20/45/84/98.

### P0-4 · Every kick fires a phantom kick sound and shows a number the player is not controlling
`game.js:5320` (`onPress` → `kickLocked()`) · `4722` (`kickLocked` stage 0 burns `k.val` + `sfx.kick()`) · `8031`ff (drag on the same button) · `10146-10168` (bar keys off stage; footer advertises both models)
**Player sees:** press to begin the pull-back → a kick sound plays with no kick, power silently locks to a sine sample, and the one bright element on screen sweeps the fast **aim** sine for the whole gesture while the drag separately accumulates pull. A short pull is discarded as a regrip (`8053`) but the press already burned stage 0, so the *next* press kicks with a power the player never chose. Measured: `stage=1 power=53.50` on press, `power=73.53` on release from a different formula.
**Fix:** latch a mode instead of stacking models — `k.mode` seeded `null` in `enterKick`, set `"meter"` by `onKey` (5597) and `"drag"` by `updateKick` once `k.pull > 25`; gate `onPress`'s `kickLocked()` on `k.mode !== "drag"`; draw only the active affordance; move `sfx.kick()` out of `kickLocked` into `launchKick` (which already calls it).
**Proof:** input-matrix test — SPACE-only, drag-only, click-only, and click-then-drag each produce exactly one `sfx.kick`, one power source, and a resolved kick; assert `k.power` is always the value the active model produced.

### P0-5 · Every sack is booked as a QB rushing attempt with negative yards
`game.js:3971` — `addStat(G.carrier, "rushYds", g2); addStat(G.carrier, "car");`
**Player sees:** the box score reads "Mahomes 4 car -31 yd" (`10432`), the season page repeats it (`9733`), and `developPlayers` (`1607`, weight `rushYds * 0.8`) plus `careerXpAfterGame` (`1867`) actively punish the QB's development for being sacked. `G.playPass` is null on a sack, so `playDead` falls to the rushing branch.
**Fix:** `playDead` already takes `reason` — branch on `reason === "SACKED!"` to `addStat(passer, "passYds", g2)` plus a new `sacked` counter in the `statLine` template, and print it next to the passing line.
**Proof:** assert after a scripted sack that `car` is unchanged, `rushYds` is unchanged, `passYds` decreased, and `sacked === 1`.

### P0-6 · Touchdown yardage never reaches "YOUR DAY"
`game.js:4111` (`touchdown()` credits per-player only) · `3960` (`G.stats.passYds += gained`, unreachable on a score because `playDead` returns at the TD check)
**Player sees:** the post-game card can read `YOUR DAY: 0 TOTAL YDS · 1 TD`; a normal game reads 5-15% short. The `gained > 0` gate at `3958` also makes "TOTAL YDS" gross-positive, not net.
**Fix:** one line inside `touchdown()` after `const g2 = Math.round(100 - G.losYd);` — `if (t === "A") G.stats.passYds += g2;`. Leave the `passYds`/`rushYds` split alone: both consumers (`1624`, `10410`) sum the two fields, so the mislabel is inert.
**Proof:** score from the 20 and assert `G.stats.passYds >= 80`; assert the post-game string is non-zero.

### P0-7 · The first play-call card of every game renders a bare field with a football frozen in mid-air
`game.js:4631` (`G.players = []; G.carrier = null;`) · `4633` (`mode: "koflight"`) · `4635` (deadNext clears `koFly` only)
**Player sees:** the opening kickoff plays over zero players, the ball hangs at `xAtYd(-4)` for 0.35s (koFly.T 1.35 vs deadT 1.7) and never lands (`z = 12 + 300p(1-p)` returns to 12), then the play-call card opens with that frozen ball still on screen — measured still there at t=3.01s.
**Fix:** in the deadNext, neutralize before flipping possession: `G.koFly = null; G.ball = { mode:"dead", x:G.ball.x, y:G.ball.y, z:0, holder:null };` and either set `koFly.T = 1.7` or clamp `z` to 0 at `p >= 1`. Replace `G.players = []` with the already-written-but-unreachable `buildKickFormation("KO")` (`4674-4688`: tee, kicker, five gunners) so the beat has a boot and a coverage unit — **cosmetic only, no returns** (owner keeper).
**Proof:** assert `g.ball.mode !== "koflight"` once `g.state` is `playcall`/`presnap`, and `g.players.length > 0` during the kickoff beat. `test_overhaul.js:47-49` checks only drive/losYd/state, which is why this shipped green.

### P0-8 · A missed field goal hands the opponent first-and-10 at his own 3
`game.js:4828` — `G.deadNext = () => { changePossession(100 - losYd0); enterPlaycall(); };`
**Player sees:** miss a 20-yard chip shot from the 97 and the opponent takes over at his own 3. Measured: `losYd 97 → 3, down 1, toGain 10`. Every other special-teams outcome in the file is floored or fixed (XP/FG made 25, 2-pt 25, touchback 25, safety 30); the missed FG is the only one that runs to the goal line, which inverts the whole fourth-down calculus.
**Fix:** `changePossession(Math.max(20, 100 - (losYd0 - 7)))` — the 20-yard floor plus the true spot-of-the-kick (the unit stages `losX - 140` = 7 yards back).
**Proof:** the special-teams matrix test (see P0-3) asserting the `(drive, losYd, down, toGain)` tuple for **every** ST outcome at mid-quarter and at clock 0. No suite exercises the missed-FG spot today.

### P0-9 · Career mode deletes its own save at the end of its first season
`game.js:5862` — `if (G.mode === "career") clearCareer();` · label lie at `9590`
**Player sees:** the hub says `ENTER = BACK TO MENU`, the player presses ENTER, and `lsDel("dinobowl_career")` runs. `startOffseason()` is unreachable in career mode because `5861` gates it on `G.mode === "season"`. Since re-entry needs **both** saves (`5712-5713`), CONTINUE CAREER disappears forever — silent, permanent, behind a mislabeled prompt.
**Fix:** drop the `&& G.mode === "season"` guard so career reaches `startOffseason`; in `finishOffseason` bump and `saveCareer()` before `clearSeason()` (which only removes the season key); split the hub label to `ENTER = OFFSEASON` for both franchise modes; put a confirm state in front of any surviving `clearCareer()`.
**Proof:** boot career, force season end, press ENTER, assert `loadCareer()` is non-null and the menu still offers CONTINUE CAREER.

### P0-10 · Overtime promises "next score wins" and then plays a full timed fifth quarter
`game.js:4559` (banner) · `4535-4567` (`endQuarter`) · `G.ot` has five hits total and **no scoring path reads it**
**Player sees:** score the first OT touchdown, get told he won, kick the PAT, hand over possession, and lose. The game only ends when the 5th quarter's clock expires. Measured: raising a score in OT leaves `over=false`.
**Fix:** one helper next to `gameOver` — `checkSuddenDeath()` returning true and setting `G.deadNext = gameOver` when `G.ot && score.A !== score.B` — called from the two whistle-to-next-snap funnels (the `patMode`/safety branches of `playDead`, `touchdown`'s deadNext assignments, and the three `resolveKick` continuations) so the score beat still plays first.
**Proof:** assert `g.state === "over"` after any OT score, for TD, XP, FG, 2-pt, safety and defensive TD.

### P0-11 · The ceremonial dead beats are skippable on frame one
`game.js:6055-6057` — `if (!G.deadElapsed) G.deadT0 = G.deadT; G.deadElapsed = (G.deadElapsed||0) + dt; } else G.deadElapsed = 0;`
**Player sees:** the counter belongs to the *state*, not the beat, so any beat chained without leaving `dead` inherits a spent `deadElapsed` and a stale `deadT0`. Measured: one SPACE on the first kickoff frame → `deadT = 0.010`; the 1.7s kickoff is annihilated with zero read time. Same for END OF Q (1.6), HALFTIME (2.0/1.6), OVERTIME (2.2). The contract in AA_TRANSFORMATION:99-100 silently does not hold on exactly the ceremonial beats.
**Fix:** make the beat own the timer — add `deadBeat(t, next)` beside `deadSkip` (`1258`) setting `state/deadT/deadT0/deadElapsed/deadNext`, and route the ~26 sites through it. Minimum viable: stamp `G.deadT0 = G.deadT; G.deadElapsed = 0;` after `startKickoff`'s 1.7 (`4630`) and each of the four `endQuarter` assignments (`4544`, `4549`, `4560`, `4567`).
**Proof:** for each ceremonial beat, press a key on frame 1 and assert `deadT > deadT0 - 0.9`; then press after the lockout and assert `deadT <= 0.01`.

### P0-12 · A two-finger tap on the PUNT card permanently softlocks the game
`game.js:4604` (`enterKick` seeds no `k.val`) · `4722` (`kickLocked` has no re-entrancy guard) · `1124-1137` (`onTouchStart` loops every finger in one synchronous event and calls `onPress()` per finger) · `8075` (`updateKickFly`) · `1273` (`flySkip` does not rescue NaN)
**Player sees:** finger 1 selects PUNT, finger 2 in the same event sees `S === "kick"` and burns stage 0 with `k.val` undefined. Any later tap resolves: `T = NaN`, `ball.x = NaN`, and `updateKickFly`'s `kk >= 1` never fires. Measured: `+15s later → state=kickfly ball.x=NaN`. `flySkip`'s guard `f.t < FLY_READ_LOCK` passes for NaN and then assigns NaN. `update()` dead-ends with no watchdog. Also reachable by an online guest (`applyRemoteInput` → `onPress()` drained per Firebase `child_added`). FG/XP do not lock but become a **deterministic guaranteed miss**.
**Fix:** four guards — seed `val: 50` in `enterKick`; early-return `if (!k || k.stage >= 2 || k.lockedFrame === G.frameId) return;` in `kickLocked`; register at most one `role:"aim"` touch per event; and reject non-finite state in both `updateKickFly` and `flySkip` (`!isFinite(f.T) || !isFinite(f.to.x) || f.t > f.T + 3` → bail to `f.after()`).
**Proof:** `tests/harness.js` gains a `touch(ev, [{id,x,y},...])` dispatcher; assert that for every kick kind `G.state` leaves `"kickfly"` within 5s and that `k.power`, `k.acc`, `kickFly.T` are always finite — including the two-finger-tap case.

### P0-13 · A second finger during a throw erases the loaded arm and the throw evaporates
`game.js:1137` (`touches[t.identifier] = { role: "aim" }` for every non-button touch) · `1157-1159` (any lift calls `onRelease()`) · `mouse` is one shared object at `881`
**Player sees:** a resting off-hand thumb anywhere in the right 58% of the screen during the drop resets `G.slingAnchor` and nulls `G.aim`; the next lift resolves nothing and `mouse.down` goes false, so `6148` can never re-arm. The QB stands there holding the ball until the sack. There is no `aimTouchId` anywhere in the file.
**Fix:** add `let aimTouchId = null`; ignore additional aim touches; require the id match in `onTouchMove`; only `onRelease()` for the owning id and clear it there (`touchcancel` shares the handler). Separately move the `mouseup`/`mousemove` listeners from `cv` to `window` (`1091-1092`) so a desktop release over the letterbox still resolves.
**Proof:** after two simultaneous right-side aim touches assert `g.slingAnchor` still equals the **first** touch position and exactly one `onRelease` fired.

### P0-14 · The SCOUTING screen is blank on football-dino.web.app
`game.js:9264` (single Flask-only `fetch("/api/game/players")`) · `9302` (`if (!G.scoutData)` — `[]` passes the guard)
**Player sees:** gold title, seven sortable headers, zero rows, no error copy. `firebase.json` has no `rewrites`, so the URL is a 404 and `r.json()` rejects into `.catch(() => { G.scoutData = []; })`. `game/players.json` (129 KB) **is** deployed, and `boot()` at `1315-1317` already implements the correct two-URL fallback loop — it simply was not applied here.
**Fix:** copy `boot()`'s loop over `["/game/players.json", "/api/game/players"]`; set `G.scoutErr` on total failure and split the guard so "unavailable" and "loading" are distinguishable.
**Proof:** assert with `fetch` stubbed to reject on `/api/*` that `G.scoutData.length > 0` from the static path, and that a full failure renders the error copy.

### P0-15 · Fullback lead block hard-freezes up to three defenders at once
`game.js:6967` — `if (dist(e, threat) < bodyContactRange(e, threat, 2)) { threat.staggerT = 0.9; e.staggerT = 0.35; sfx.tackle(); }`
**Player sees:** a raw 0.9s freeze with zero str/blk/tkl input and no per-play latch, re-armed every 0.35s onto the next un-frozen defender (the filter at `6964` excludes the man he just froze). With clustered DL — literally every DL on `tush_push` — `ceil(0.9/0.35) = 3` bodies are frozen simultaneously. Only fires on the franchise signature plays `power_toss`/`tush_push` (9 of 32 teams, card #4 on a 0.35 roll), i.e. the marquee play the player deliberately chose.
**Fix:** convert to the persistent-engagement model already in the file (`e.engaged`/`threat.blockedBy` driven by `blockFeedRate`/`blockShedCheck`/`releaseBlock` with `BLK_RUN_ANCHOR_MULT`). If the one-off pancake beat stays, latch it: add `e.pancakeDone` to `snap()`'s per-play reset (`3286`), gate both the stagger and the SFX behind it, and delete `e.staggerT = 0.35` so the FB keeps escorting.
**Proof:** run `tush_push` and assert at most one defender has `staggerT > 0` from the FB per play, and that the FB's own `staggerT` never exceeds 0.

### P0-16 · Juke and stiff-arm roll per FRAME with no dt scaling
`game.js:7483-7485` — `Math.random() < 0.018 + …` and `Math.random() < 0.02`, both inside `cpuCarrier` (called once per frame, `dt` passed in and unused)
**Player sees:** a 144Hz display gets ~2.4x the jukes in the same 28px window (~36% → ~65% per approach), and because `sdt = dt * (G.slowScale || 0.45)`, the roll rate **per game-second rises during every slow-mo beat.** Payload is material: a juke deletes the tackle and drains 30 off the deterministic accumulator (`7717`). This is the exact pattern LESSON #15 bans, and the correct idiom is 130 lines away at `7654` with a per-play latch.
**Fix:** `Math.random() < dt * JUKE_RATE` / `dt * STIFF_RATE` with named constants (JUKE_RATE ~0.55/s reproduces roughly one juke per approach given `jukeCd = 2.1`), plus a one-decision-per-closing-defender latch (`e.jukeConsidered = n.bodyId`, cleared past 44px). Do **not** merely lower 0.018 — that leaves the refresh-rate dependence and the slow-mo inflation.
**Proof:** step the same scenario at 16.7ms and 33.3ms and assert juke counts match within 10%; assert the count does not rise when `slowT > 0`.

### P0-17 · The human defender's dive cel is rotated a second 90 degrees
`game.js:6541` (`e.proneT = 0.55` set while `pose` is still `"dive"`) · `8654` (`cx.rotate(e.dir * Math.PI / 2)` — `"dive"` absent from the allowlist) · same bug at `drawReplay:5155` and in the **physics** footprint at `7104`
**Player sees:** dive and miss on defense → `actionLayFlat` has already laid the body horizontal (`sprites.js:1530-1547` / `1385-1395`), so it gets turned a second time: 12 frames (0.20s) of double-rotated dive cels, then 0.35s of rotated walk sprite, then instantly upright with no getup. `doDive` also sets `diveT = 0.3` but `poseDur = 0.50`, so the pose outlives the physics by 0.20s by construction.
**Fix:** stop maintaining a string allowlist — propagate a `laidOut: true` flag from `selectActionSpriteFrame` whenever `compactActionFrame` took an `actionLayFlat` branch and gate all three rotation sites on `!spriteFrame.laidOut`. Align `doDive`'s two timers and route the miss through a `poseChain` ending in `getup`.
**Proof:** assert for `dive`/`diveCatch`/`tackled`/`prone` cels that the render path never applies rotation, and that a missed defensive dive ends in `getup`.

### P0-18 · The post-catch grace window is checked after the carrier's escape resources are spent
`game.js:7796` — the grace bail sits **below** `truckCharges--` (7725), `shedCharges--` (7733), `yacCharge = 0` (7738) and `stiffT = 0` (7745)
**Player sees:** a trailing DB is by construction at contact range the instant `completeCatch` stamps `catchT` and `becomeCarrier` grants the charges, so within 0.40s of a catch the player's YAC charge, truck charges, and his **timed stiff-arm input** are consumed on contacts that then `continue` with no visible result and no cooldown. Roughly two-thirds of truck tries and 60% of YAC tries are silently eaten, on exactly the play type the YAC passive advertises. LESSON #19 violation.
**Fix:** hoist the grace bail to the top of the per-defender arrival block — after the rampage branches, **before** the juke check — keeping the `diveT > 0 || soarT > 0` exemption so a committed dive still finishes.
**Proof:** with a non-diving defender adjacent at `G.playT - catchT === 0.3`, assert an apex `yac` receiver still has `yacCharge === 1` and `stiffT` still 0.35.

### P0-19 · Career bling and QB visors float 9-11px above prone bodies
`game.js:8770` (`frameBobDy` measures the bob against the *action pack's own* cel 0) · `8794` (`headTop = h * 0.08`, calibrated to the upright walk) · `9112`/`9123` (`drawQBFeature`)
**Player sees:** re-measured with the real builder: troodon `prone` mask top 12 with bobDy 0 vs a bling head top of 2.56 → **9.44px of empty air**; carno and trike 11.44px; all four `tackled` cels float a consistent ~3.4px. `QB_ID` gives 31 of 32 franchises a head/chest feature and every sack ends `tackled` → `prone`, so the visor detaches for ~0.8s on the most cinematic negative play. This is owner QA fix #6 (AA_TRANSFORMATION:144) recurring on the action packs.
**Fix:** give `frameBobDy` an absolute baseline (`basePack` param defaulting to the walk `spr`; the `bobCache` key at `8772` must gain a base-pack id or it serves stale values), and publish the head point `compactActionFrame` already computes into the `anchor` object so laid-out cels use the authored point instead of `w/2 + dir*w*0.20`.
**Proof:** gallery assertion that the bling head point lands inside the cel's opaque mask for **every species × action cel**.

### P0-20 · The "0:00 — play runs to the whistle" banner is vetoed by any other banner
`game.js:6014` — `if (cb > 0 && G.clock <= 0 && G.state === "live" && !G.banner)`
**Player sees:** the edge is true for exactly one frame and `!G.banner` kills it with no retry. A/B probe on an identical live carry: with `banner = null` it shows; with a 0.8s `BROKEN TACKLE!` up it never posts, and 1.5s more of live play never re-posts it. The realistic occupants are BROKEN TACKLE (the most common), RAMPAGE, MOSSED, FUMBLE, LATERAL READY, ICEMAN. LESSON #4 is owner law: "a correct rule that is invisible reads as a bug."
**Fix:** latch the event, not the screen — `G.zeroBannerPlay !== G.playNo`, reset in `snap()`. The banner is already `sticky: true` so it correctly wins the slot from a toast.
**Proof:** `tests/test_clock.js` A/B — cross zero once with a live banner set and once without; assert `g.banner.text === "0:00"` in both.

### P0-21 · A leaked celebration flag stops the quarter clock outright
`game.js:4073` (the only clear, inside `updateCelebration`, reachable from two state-gated call sites) · `5999` (`!G.celebrate` in the clock gate)
**Player sees:** with the flag truthy during a live snap the clock freezes 100% (probe: 100.00 → 100.00 vs 97.85 control). The realistic exposure is small — the TD beat plus the XP beat drain 2.5 of the 3.2s and both `ptchoice` and `playcall` tick it, so worst case is ~0.65s real time — but `enterKick`/`kickfly` never tick it at all, and `startGame` resets `G.banner` without resetting `G.celebrate`, so a residual survives into the next game.
**Fix:** give the latch an unconditional lifetime in `update()` beside the other per-frame ticks, strip the decrement from `updateCelebration`, and null it in `snap()` and `startGame`.
**Proof:** set `G.celebrate` during a live snap, step 1s, assert the clock burned; assert `G.celebrate` is null after `startGame`.

### P0-22 · A tie is recorded as your loss plus the opponent's win, and eliminates you from the playoffs
`game.js:1634` — `const won = G.score.A > G.score.B;` · records template has no `t` key (`1553`) · `advancePlayoffs(false)` → `alive = false` → random champion
**Player sees:** `gameOver` (`4571`) knows about ties and bumps `G.record.t`, but the season layer's boolean does not — the same game is booked as a loss twenty lines below `bumpDynamicLadder`, which correctly treats a tie as neutral. Reachable: a level score at the end of Q4 plus a scoreless full OT period.
**Fix:** `const res = Math.sign(G.score.A - G.score.B);` and branch -1/0/+1 for records and train points; add `t: 0` to the template and render it. For the postseason, kill the tie instead of encoding it — let playoff games keep granting sudden-death periods so `advancePlayoffs`'s boolean stays honest.
**Proof:** force a tie in the regular season and assert `records[team].t === 1` with no `l`/`w` change; force a playoff tie and assert another OT period starts.

### P0-23 · Season state bleeds into exhibition, versus and online
`game.js:3186` (`if (G.szn && G.szn.condition)` — no mode guard, fifteen lines above a correctly guarded sibling) · every non-franchise entry (`1019`, `2069`, `5757`, `5760`, `5763`, `5766`) clears `G.career` and leaves `G.szn`
**Player sees:** an exhibition with your season team inherits fatigue-scaled speed and `stamNow` from the franchise save (`e.spd *= 0.85 + 0.15 * cond/100`). The intent is documented two ways in the file: the sibling block guards on mode, and `G.gameWeek` (`2023`) does too. The condition map is keyed by bare player **name**, so `fallbackRoster` names collide across teams as well.
**Fix:** `G.szn = null;` beside each existing `G.career = null;` (the hub ESC path already ran `saveSeason()`); copy the mode guard onto the condition block and `roster()`'s dev/franchise blocks; re-key the condition/dev maps to `sideOf(e) + "|" + e.name` the way `statLine` already does.
**Proof:** start an exhibition with the season team and assert every entity's `spd` equals its roster value and `stamNow` is undefined.

### P0-24 · The crowd bed mutes for the entire flight of every kick
`game.js:6040` — `const inGame = ["live","presnap","dead","kick","playcall","defcall","ptchoice"]` omits `"kickfly"`, `"over"`, `"halftime"`
**Player sees:** `launchKick` sets `state = "kickfly"`, so `6042` forces volume 0 and the bed decays with tau 0.4 across a 0.8-1.7s flight — including a Q4 game-winner, exactly where the close-game bonus has the bed at its loudest. Two related mix defects: `crowdBus.gain.value = 1.1` (`262`) directly contradicts the OWNER MIX LAW stated three lines above it (crowd **under** the action), and `crowdCheer`'s 14 claps / 2 whistles / 3 airhorns pass no bus, so they route to `sfxBus`.
**Fix:** add the three missing states (and scale `kickfly`'s bed by `t/T` for a rising swell); set `crowdBus` to ~0.75 and re-scale the bed constants to compensate; pass `crowdBus` to the three `beep()` calls; add a CROWD row to `SETTINGS_ROWS` (crowd has no slider today, so at SFX 0 the roar plays at full level with its claps silenced).
**Proof:** assert `crowdGain` target is non-zero while `state === "kickfly"`; assert `crowdBus.gain.value < sfxBus.gain.value`.

---

## 3. P1 — SEAMLESS

**Headline: the pacing budget is already won; the seams are that beats can be nuked on frame one, beats play over nothing, the terminal moment has no weight, and two input models fight each other.** Cutting more dead air is the wrong instinct — the numbers below are at or better than parity already.

### 3.1 Dead-beat / transition table (current, verified)

`deadSkip` (`1258-1262`) cuts any beat to 0.01 after a read-lockout of **0.35s** routine / **0.9s** when `deadT0 > 1.6`. "Floor" = an engaged player tapping through.

| Beat | file:line | Current | Floor (mashing) | Target | Action |
|---|---|---|---|---|---|
| Routine whistle → cards | `4045` | 0.60s | 0.35s | keep | none |
| First down | `4024`/`4045` | 0.60s | 0.35s | keep | none |
| Incompletion / OOB | `4045` | 0.60s | 0.35s | keep | none |
| Turnover on downs | `4035` | 1.20s | 0.35s | keep | banner copy only |
| INT / scoop | `3978` | 1.20s | 0.35s | keep | add de-cleater beat (P2) |
| TD → PT choice | `4145` | 1.20s | 0.90s | keep | clamp banner life to the beat |
| Easter-egg TD (BEAST QUAKE / BEAR WEATHER) | `4154`/`4163` | 3.40 / 3.20s | 0.90s | keep | none |
| 2-pt result | `3922` | 1.40s | 0.35s | keep | none |
| Safety | `3939` | 1.40s | 0.35s | keep | none |
| XP good | `4821` | 1.30s | 0.35s | keep | + `checkSuddenDeath` |
| FG good | `4825` | 1.50s | 0.35s | keep | + payoff FX |
| FG missed | `4828` | 1.80s | 0.35s | keep | **fix the spot (P0-8)** |
| Punt downed / touchback | `4764`/`4792` | 1.00 / 1.10s | 0.35s | keep | none |
| Kick flight (`kickfly`) | `8075`, T = `clamp(0.8+d/640,0.8,1.7)` | 0.80-1.70s | 0.35s (`flySkip`) | keep | **already fixed 08-12**; add NaN bail |
| Defensive TD | `3600` | 1.40s | 0.35s | keep | + payoff FX |
| **Opening kickoff boot+flight** | `4630` | 1.70s | **frame 1 (bug)** | 1.70s / 0.9 lockout | P0-7 + P0-11 |
| **Pregame → kickoff** | `2064` | 2.40s | 0.90s | keep | P0-11 (stale `deadT0`) |
| **END OF Q** | `4567` | 1.60s | **frame 1 (bug)** | 1.60s / 0.35 | P0-11 |
| **HALFTIME** | `4544` + `4549` | 2.00 + 1.60s | **frame 1 (bug)** | 2.00 / 0.9 | P0-11 |
| **OVERTIME** | `4560` | 2.20s | **frame 1 (bug)** | 2.20 / 0.9 | P0-11 + P0-10 |
| Halftime show | `4414` | 2.20s | 0.90s | keep | none |
| Challenge chain | `4903`/`4911`/`4934` | 2.60 / 1.80 / 2.00s | 0.90s | keep | GIF entry (P2) |
| CPU-drive beats (coach mode) | `2085`/`2123`/`2174` | 1.60 / 2.00 / 1.30s | 0.35-0.9s | keep | none |
| *Dead code:* return beat | `3951` | 0.90s | — | **delete** | `returnPlay` is only ever `= null` |

### 3.2 Whistle-to-snap budget vs Retro Bowl

| Sequence | Dino Bowl floor | Taps | Retro Bowl | Verdict |
|---|---|---|---|---|
| Routine down (whistle → next snap) | **0.35s beat + card tap + snap press ≈ 0.6-0.9s** | 2 (the 2nd *is* the throw windup, per QA fix #1) | ~1-1.5s | **beats it** |
| TD → next snap (TD, PT choice, XP, kick flight, result) | **≈2.4s** (0.9 + tap + ~0.8 gesture + 0.35 fly + 0.35 result) | 3-4 | ~4-5s | **beats it** |
| Game open (pregame → first snap) | 2.4 + 1.7 = **4.1s over an empty field**, or ~0s if you tap once (P0-11 kills the art entirely) | 1-2 | n/a | **the one real seam** |

Do not spend further budget on shortening beats. Spend it on making the 4.1s opening worth watching (P0-7) and on making beats un-nukeable before their read-lockout (P0-11).

### 3.3 Remaining seams (flow, input, hand-offs)

| # | Seam | file:line | Fix |
|---|---|---|---|
| S1 | **Hit-stop and slow-mo are discarded at every terminal moment** — `const scalable = G.state === "live";` then `else { G.freezeT = 0; G.slowT = 0; }`. `impactMoment` accepts `dead`, so the timers ARE set and then wiped. The tuned owner number in LESSON #23 ("slow-mo ≤0.2s" for the tackle collapse) describes a beat that **never plays** — `7850` supplies exactly 0.2/0.11 and `playDead` fires the next line. Same for sacks, picks, and TDs (`touchdown` is reached from *inside* `playDead`, after `G.state = "dead"`). | `5961-5964` | `scalable = live \|\| (dead && (freezeT>0 \|\| slowT>0))`, and subtract the stretched wall-time from `G.deadT` so the beat's on-screen length is unchanged (LESSON #9/#23 intact). Verify with a rising-edge counter bucketed by state. **Flag to owner: the comment at 5963 claims the live-only gate is deliberate.** |
| S2 | **The aim ring previews a flight time neither throw uses.** Ring: `TAim = 0.55 + d/470` (`10077`). Real lob: `× (0.8 + 0.28 × pull)` (`3483`). Real bullet: `d/430` (`3510`) — at 400px the ring previews 1.40s while the ball flies 0.93s, moving risk by >0.1 in the direction that costs the catch (`b.read.risk` feeds `3723`). Right-click fires the bullet from the identical aim state. `ringR` also uses `err × 0.7` vs the real `× 0.5`/`× 0.3`, and wind is a deterministic **offset** drawn as a **radius**. | `10062`, `10077-10081` | Extract `lobFlight(qb,to,pull)` / `bulletFlight(qb,to)` / `lobApex(d,pull)` and call them from all sites (`3483`, `3510`, `6369`, `10062`, `10077`); tint by the **worse** of the two release options; put `ringR` on the real `err`; move the ring's center by the wind offset. Delete the dead `label` field (`3414`, `3445` — no consumer). |
| S3 | **An exception inside a `deadNext` continuation permanently softlocks `dead`**, and `G.lastErr` has two writers and **zero readers**. Probe: throw inside a continuation → `state=dead deadT=-1.80 deadNext=null`, 3s of mashing space/enter/escape does nothing. Latent (no throwing continuation is demonstrated) but the observability half is free and hides every softlock class. | `6079`, `5975` | Don't consume the continuation until it succeeds (`try { f(); G.deadNext = null; } catch { … enterPlaycall(); }`); watchdog `if (G.deadT < -3 && !G.deadNext && !G.koFly) enterPlaycall();`; render `G.lastErr` as a small red one-liner (at minimum under `G.qaMode`) and `console.error` once per distinct message. |
| S4 | **Online guests never reach `onKey` in any state** — `onlineInput` returns true unconditionally, so mute, help, pause/quit, box score and dead-beat skip are dead for the guest *even during live play*. Host keeps control through every whistle (the inverted list at `1051`). | `1065`, `1050`, `1105` | Whitelist purely-local keys (`m`,`h`,`b`,`escape`) before the net gate; add `dead`/`replay` to the guest list so a tap forwards to the host (whose `deadSkip` is already spam-safe). Guest-local `deadT` edits are pointless — `applyNetFrame` `Object.assign`s over them. |
| S5 | **`netStatus` reports READY when the Firebase SDK is blocked**, and the online failure alert names the one cause that is not the problem (`!CONFIG \|\| !firebase` → "needs FIREBASE_WEB_CONFIG"). Error UX is seven native `alert()`s, one on the **success** path. | `1070`, `925`, `937` | Three-state status (`CONFIG MISSING` / `SDK BLOCKED` / `READY`), `onerror` on the config script, branch the alert on the same distinction, route all seven through `banner()`/`G.msg` (AA_PLUS 3.8). |
| S6 | **The mega TD banner covers the top of the 1PT/2PT buttons.** `fillRect(0, H/2-72, W, 132)` at .88 alpha covers y 198-330; the buttons are at y 300 h 72 and `drawBanner` runs after `drawPTChoice`. Clicks still land (pure geometry), and any input trims the banner — so this only bites a player who touches nothing. | `10403`, `4197` | Clamp the card's life to the beat (`Math.min(2, G.deadT)` after the `deadT` assignment, keeping the easter-egg beats' longer cards), or drop the fill to ~.25 behind the text metrics and keep the two gold rules as the frame. |
| S7 | **The pregame showcase hard-codes `% 2`**, so both headliners cycle only walk cels 0 and 1 at 7.7 flips/sec — the mirrored stride (`contactB`) never plays, versus the tuned in-game ~2.75 strides/sec. | `8955` | `((performance.now() / 250) | 0) % 4` and drop the now-redundant second modulo. (`APEX_SPECIES.S === "quetz"` at `8941` is unreachable — `APEX_ROLE` never contains `S` — leave it as a latent trap, not a fix.) |
| S8 | **The kickoff HUD frame disagrees with the flight.** `G.drive = other(receivingSide)` makes the HUD show the kicking team while `koFly` runs `xAtYd(66) → xAtYd(-4)`, i.e. right-to-left into the current offense's own end zone. | `4623`, `4632` | Author `koFly` in the kicking team's frame, or defer the `G.drive` flip to `deadNext`. |
| S9 | **`snapshotFrame` runs every live frame for a replay only a coach's challenge can play**, and once `challengeUsed` flips true the tape is provably unreadable for the rest of the game. 24 objects allocated per frame (`.map()` over 22 players × 20 fields). | `6188`, `6066`, `4858` | `if (!G.challengeUsed) snapshotFrame();` — provably safe because `startReplay`'s only caller returns early on that flag. Ring-buffer later only if a device profile shows it. |
| S10 | **`templates/game.html` has no pseudo-fullscreen path or rotation reassert** — `(el.requestFullscreen \|\| el.webkitRequestFullscreen).call(el)` throws a swallowed TypeError on iPhone, so both fullscreen buttons are permanently inert; no `body.fs`, no `isMobileFallback`, no `orientationchange` reassert, and the `dvh` base has no `vh` fallback outside one media block. The shipped host (`static/game/`) has all of it. | `templates/game.html:129`, `51`, `83` vs `index.html:45-57`, `100-105` | Extract `static/game/shell.css` + `shell.js` and include from both shells; this divergence has now happened twice (version pin, then layout). |

---

## 4. P2 — SATISFYING / BEATS RETRO BOWL

### 4.1 Reaches parity (Retro Bowl already does this; we currently do not)

| Item | file:line | Gap |
|---|---|---|
| **Payoff FX on anything but an offensive TD.** `fxConfetti` (`8120`) and `fxFlash` (`8129`) have **exactly one call site each**, both inside `touchdown()`. No confetti/flash/punch on a defensive TD, a made FG, a made XP, a 2-pt conversion, or a pick. | `4113`-ish, `3583`, `4799`, `4803`, `3919` | Add `payoff(kind, x)` composing confetti + flash (night) + `zoomPunch` + `crowdCheer` + `crowdSpike`; call from all five sites. |
| **A loss plays the scoring sting.** `gameOver` is unconditional: `banner(win ? "…WIN!" : "TIE GAME"); sfx.td();`. | `4571`-`4577` | Split into `sfx.win` / a new falling-minor `sfx.lose`, keyed on `win === G.my`. Add `crowdAww` to both kick-miss branches. |
| **The crowd cheers the opponent.** The only in-play crowd reaction is offense-side and aww-only (`3859`); the first-down cheer (`4024`, comment says "the home crowd roars"), the breakaway cheer (`6227`) and the made-FG cheer (`4803`) have **no side test**. A CPU pick thrown to your defense produces no reaction at all. | `3859`, `4024`, `4803`, `6227`, `3831` | `homeSide(e)` helper; mirror the aww with a defense-side cheer scaled turnover > sack > stop; gate the three side-blind cheers. |
| **The two sack paths are not the same event.** Scripted: shake 0.25 + `fxChunks` + `impactMoment`. Earned: `sfx.tackle()` + `announce` + a stat. | `7596`-`7597` vs `7933` | Lift into `sackBeat(qb, sacker)` and call from both. |
| **The championship is silent.** `advancePlayoffs` sets `phase`/`champion` and returns; the only surfacing is one `fillText` on the hub. | `1692`, `9563` | Mega banner tier + jingle + confetti. AA_PLUS 1.1's "Dino Bowl win jingle" is genuinely unbuilt. |
| **Kick PERFECT payoff.** The center stripe is drawn 2.4% wide with a comment promising "the highest-accuracy portion," but `accOk` is binary — no outcome term reads the stripe. | `10153-10157`, `4805` | `k.perfect = accError < 2.5` + flash/chime/crowd spike/1-frame hitstop (AA_PLUS 2.7). |
| **Anti-aliased vector strokes on the turf.** The aim overlay is pure vector at fractional coords (`lineWidth 3`, `setLineDash`, `cx.arc`) while `drawRoutePoly` 20 lines away is disciplined pixel chalk — a violation of AA_TRANSFORMATION §1's stated law, framing every throw in the game. Plus one `ellipse` under star players. | `10033`, `10037`, `10060`, `9988` | March the arc with `drawRoutePoly`'s integer 3×3 fillRect loop; ring as 12 integer blocks keeping the risk tint; star oval via the `pxBlock` helper. **Leave `#8ecafc` alone** — it is an established identity token used 11 times, not the rejected sky-blue. |
| **Franchise record book, pregame matchup card, first-session hints, favicon/OG/manifest.** All four are AA_PLUS 3.1/3.2/3.3/3.4, declared and unstarted. `grep` for `favicon|og:|manifest|theme-color|apple-touch` across `static`, `templates`, `*.py` returns **nothing**; the offseason also re-rolls `staff` and wipes every season record. | `1554-1559`, `9433` | Phase 3 work; sequence after glitchless. |

### 4.2 Beats Retro Bowl (differentiators — honest status)

| Item | Status | What it needs |
|---|---|---|
| **GIF highlight export.** Retro Bowl has no equivalent. Currently reachable **only** by spending the once-per-game coach's challenge (`startReplay`'s single caller is `throwChallenge`) with a timeout at risk, whitelisted to reasons that exclude TOUCHDOWN, SACKED, FLATTENED and FUMBLE RETURN TD; the palette is a fixed 3-3-2 table so gold → (255,218,0) and turf → olive and blue is lost entirely; the seek `frames.length - 150` is **dead** (tape is capped at 126) and `test_overhaul.js:37` asserts the dead constant verbatim (LESSON #18). | Real feature, unreachable and off-palette | Own entry point: a `G — SAVE HIGHLIGHT` chip on any score/turnover dead beat with no challenge cost; local color table built from the real palette; fix the seek and update the test **with a comment**. |
| **The honest aim ring** (tinted by the window the engine already computes, zero text, "no targeting computer" respected). Retro Bowl throws blind. | Shipped, but it lies about flight time (S2) | Land S2 and it becomes a genuine advantage rather than a liability. |
| **Career mode + drills** (per-player XP, level-ups raising `career.ratings`). Beats Retro Bowl's roster-only progression. | Fully functional — and it **deletes itself** (P0-9) | P0-9, plus season-boundary persistence and a record book. |
| **Dino powers, rampage, the timed-jump duel, playable defense, playcall cards.** | Owner keepers, working | Do not touch. |
| **Replays that show the right dinosaur.** `snapshotFrame` records no `careerAcc`, `role`, `apex` or velocity, so replays strip every QB visor and all career bling, and stationary dinos cycle walk legs (the idle gate reads live velocity). | Cosmetic; low exposure (challenge-gated) | Five scalars added to the record + mirror `drawBling`/`drawQBFeature` in `drawReplay`. Do P0-19 first or the replay inherits the detached accessory. |

---

## 5. DEPENDENCY-ORDERED BUILD SEQUENCE

**Constraint:** `game.js` is one 10,581-line IIFE in a non-git directory. **No worktree isolation exists, so Lane A batches are strictly sequential — one at a time, suite green between each.** Lane B never opens `game.js` and can run in parallel with any Lane A batch.

**Full battery command (use after every batch):**
```
for f in test_all test_clock test_getup test_game_feel test_batch3 test_batch4 \
         test_overhaul test_online test_aa_glitchless; do node tests/$f.js; done
node tests/soak.js                 # 3 full games, zero runtime errors
node tests/qa_botgame.js 6         # only where a batch touches sim/balance
```
Gate: **285 assertions, 9 suites, 0 fail** plus the batch's new assertions.

### LANE B (parallel, no `game.js`)

**B1 · Docs and coordinates.** `LESSONS.md` #13 → nine suites (add `test_aa_glitchless`). `AA_TRANSFORMATION.md` → record the **2026-08-11 visual/special-teams/QB session and the 2026-08-12 glitchless session** (the root cause of every stale coordinate). `AA_PLUS_PLAN.md:117` and `:72` → replace line ranges with **symbol names** (`FILM`, `filmCel`, `filmPack`, `drawDinoCel`, `filmPalette`, `mirrorCanvas`) and state explicitly that `walkMirrorLegs`/`WALK_EXPAND`/`IDLE_MAPS`/`buildSpecies` are LIVE. **This is safety-critical: executing 3.7's range literally today deletes `buildSpecies` (`sprites.js:777`), the function that builds every sprite in the game.**

**B2 · Shells and hosting.** Extract `static/game/shell.css` + `shell.js` from `index.html:45-57`/`100-105`; include from both shells; port the `vh` base + `@supports dvh`; wire `#fs-btn` and `#fs-mobile` (S10). Add `firebase.json` `headers`: `no-cache` for `**/*.html`, long immutable for `/game/*.js` once tokens are per-file. Add favicon / apple-touch-icon / theme-color / OG / twitter once, in the shared head.

**B3 · sprites.js.** Hoist `profileOf` (`925-944`) out of the block headed `// LEGACY FILM-CEL MODELS (unattached)` (`824`) to sit beside its only live consumer (`1189`), marked LIVE. Rewrite the block boundary comment to name the actually-dead span. Do **not** delete anything until AA_PLUS open question 5 is answered.

**B4 · Harness and test infrastructure.** Add `touch(ev, [{id,x,y},...])` to `tests/harness.js` (required by P0-12/P0-13). Fix `tests/stats.js:44` to `(x - 240) / 24` — the current `(x - 200) / 20` yields `1.2Y + 2`, a **+6 to +22 yard per-play bias**; no `game.js` change needed for the interim. Add the shell-token parity test (both shells equal each other and equal `game.js`'s `BUILD` once A8 lands).

### LANE A (sequential, `game.js`)

**A1 · Softlocks, save loss, blank screens.** *Ship first: nothing here touches the sim, and each item is a hard failure.*
- Files: `static/game/game.js`. New test: `tests/test_p0_hardfail.js`.
- Functions: `enterKick` (4604), `kickLocked` (4722), `onTouchStart` (1124), `flySkip` (1273), `updateKickFly` (8075), `hubKey` (5862), `drawHub` (9590), `finishOffseason`, `openScouting` (9264), `drawScouting` (9302), the `dead` block (6079), `update()` (celebrate lifetime), `snap()` (3247), `startGame` (2035), `deadBeat()` helper + the four `endQuarter` sites (4544/4549/4560/4567) + `startKickoff` (4630), `onTouchEnd` (1157), `aimTouchId`, window-level `mouseup`.
- Covers: **P0-9, P0-11, P0-12, P0-13, P0-14, P0-21, S3.**
- Verify: full battery + new suite (two-finger PUNT tap leaves `kickfly` within 5s with finite state; career save survives season end; scouting populates from static; frame-1 press does not cut a ceremonial beat; a throwing `deadNext` recovers to `playcall`).

**A2 · Special teams correctness.** *One coherent 4100-4900 region; no sim contact.*
- Functions: `touchdown` (4111), `enterKick` originYd (4611), `kickMeterPlan` (4646), `resolveKick` (4742/4796/4821/4825/4828), `blockedKick`, `defensiveTouchdown` (3600), `endQuarter` (4535-4567) + `checkSuddenDeath()`, `startKickoff` (4616-4635), `buildKickFormation("KO")` (4674-4688), `onPress` (5320) / `onKey` (5597) / `updateKick` (8031) / `drawKickUI` (10131-10168), crowd `inGame` (6040), `crowdBus` (262) + `crowdCheer` bus args + `SETTINGS_ROWS`.
- Covers: **P0-3, P0-4, P0-7, P0-8, P0-10, P0-24, S8.**
- New test: `tests/test_specialteams.js` — a matrix over made/missed/blocked FG, made/missed XP, 2-pt made/failed, punt downed/touchback, safety, OT score for every type, asserting `(drive, losYd, down, toGain, state)` at mid-quarter **and** at clock 0, plus `kick.originYd`, one `sfx.kick` per kick, and `g.ball.mode !== "koflight"` in `playcall`.
- Verify: full battery + new suite. No bot games needed (no probability touched).

**A3 · Animation and LESSON #3.** *The most-repeated visual beat in the game.*
- Functions: `checkTackles` (7865), `tickDeadEntities` (6094), `doDive` (5676-5684), the dive expiry (6541), `selectActionSpriteFrame` (5071) → `laidOut` flag, the three rotation sites (8654, `drawReplay` 5155, `visualFootprint` 7104), `frameBobDy` (8770) + `bobCache` key + `drawBling`/`drawQBFeature` (8794, 9112), showcase callers (8969, 8975, 9058), `drawIntroSide` (8955).
- Covers: **P0-1, P0-17, P0-19, S7.**
- Verify: extended `tests/test_getup.js` (1st-and-20 non-first-down tackle → `prone` → `getup`, never the rotated fallback), `test_game_feel` pose assertions green, new gallery assertion that the bling head point lands inside the opaque mask for every species × action cel. **LESSON #6: this batch needs a live human pass.**

**A4 · Contact and rate correctness.** *First batch that touches the sim — re-baseline required.*
- Functions: the `runblock` stalk branch (6991-6997), `case "leadblock"` (6960-6970) + `snap()` latch reset (3286), `cpuCarrier` (7473-7485), the arrival grace bail (7796), `resolveArrival`'s defender pool (3622).
- Covers: **P0-2, P0-15, P0-16, P0-18**, plus the `resolveArrival` state filter.
- Verify: full battery + `node tests/qa_botgame.js 6` with a **tele-tag distribution diff, not the topline** (LESSON #24): `icall:` must equal the sum of `int:*` (LESSON #25), `arrive:` ≈ attempts, the `ct:`/`arrive:` ratio must not move materially (LESSON #26), `test_batch3`'s 0.95-2.0s block-hold band green, takedown still sub-1s (LESSON #23). New deterministic probes: frame-rate invariance of juke counts at 16.7 vs 33.3ms; no defender frozen >2 consecutive frames by a stalk block; `yacCharge`/`stiffT` survive the grace window; a `proneT = 0.5` defender on the landing spot yields `catch:solo`, not `int:lurk`.

**A5 · Preview honesty and payoff.** *Presentation on top of now-correct systems.*
- Functions: `lobFlight`/`bulletFlight`/`lobApex` helpers used by `throwLob` (3483), `throwBullet` (3510), `updateBall`'s lob branch (6369), the preview apex (10062) and `TAim` (10077); `loop()`'s `scalable` (5961) + `deadT` compensation; new `payoff(kind, x)` + `sackBeat()` + `homeSide()`; `gameOver` (4571) split; `intercepted` (3831) de-cleater; champion branch in `advancePlayoffs` (1692); the 0:00 latch (6014); mega-banner life clamp (10403); aim-overlay pixelization (10033-10061, 9988); delete the dead `label` (3414, 3445).
- Covers: **P0-20, S1, S2, S6**, and the whole of §4.1 except the four Phase-3 items.
- Verify: `tests/test_clock.js` A/B for the 0:00 banner; a rising-edge counter for `freezeT`/`slowT` bucketed by `G.state` (must be non-zero in `dead`); assert `lobFlight`/`bulletFlight` are the single source for all five sites; full battery + soak. **LESSON #6: live pass on the mix and the beats.**

**A6 · Balance-coupled (owner-gated).** *Isolated so it can be deferred without blocking anything.*
- Functions: `assessPassWindow`'s lane loop (3419-3437) — skip `blockedBy`/`proneT`/`staggerT` and require `future.x > qb.x + 40`; then **re-baseline together** `safeLimit`/`playableLimit` (7562-7565), the `risk * 145` board weight (7521), and the 0.24/0.56 ring thresholds (10081). `ballSecurityScore` (7967-7971) per the owner's answer, plus a `fum:sec` tele tag.
- Verify: ≥6 bot games, `ct:`/`arrive:` and fumbles-per-game distributions before and after (LESSON #21: the CPU limits were tuned **with** the lane term present, so removing it without re-baselining is the actual risk).

**A7 · Data, stats and season integrity.**
- Functions: `touchdown` (4125 area) → `G.stats`; the `gained > 0` gate (3958-3960); the sack branch (3971) + `statLine` `sacked` + box score (10432); `seasonAfterGame` (1634) + records template (1553) + `advancePlayoffs`; `G.szn = null` at 1019/2069/5757/5760/5763/5766; mode guards on 3186 and `roster()`'s dev/franchise blocks; `lsDel("dinobowl_franchise")` beside the two `clearCareer()` calls; export `ydAtX`/`xAtYd` on `G.debug`.
- Covers: **P0-5, P0-6, P0-22, P0-23**, franchise scoping.
- New test: `tests/test_season_integrity.js`; re-point `tests/stats.js:44` to `dbg.ydAtX`.

**A8 · Perf, online, dead code, build marker.** *Last, because it is the widest diff and the least player-visible.*
- Functions: `netFrame` (903-904) strip `parts`/`gameStats` + guest particle self-tick before the `Net.remoteView` bail + `G.parts = []` in `applyNetFrame`; guest local-key whitelist (1105) + `canControlHere` (1050); `G.fieldCv` field cache (drawField 8323-8420, keyed on weather+endzones+stadium+drive) + cached gradient; particle `kind` switch + pool + **dt-scaled weather spawn** (`dt * 360` rain / `dt * 120` snow reproduces today's 60fps density exactly while a 30fps phone stops losing half its weather); `snapshotFrame` challenge gate (6188, 6066); persistent draw-order array (8621); GIF local palette + dead seek + entry chip; `const BUILD = "aa-plus-v35-20260812"` near the top of the IIFE; delete `returncover`/`returnblock` (6909-6937), the `returnPlay` branch (3945-3953) and its five `= null` sites, and `careerPickTeam` (1860) plus its two dead call sites.
- Verify: measure `JSON.stringify(netFrame()).length` in CLEAR and SNOW before/after; assert equal particle steady-state stepping at 16.7 vs 33.3ms and `nLive <= 300` after 8s of SNOW; `test_overhaul.js` GIF-seek assertion updated **with a LESSON #18 comment**; B4's shell/BUILD parity test now passes; full battery + soak. **LESSON #6: the field cache needs a live human pass — stills are not enough.**

---

## 6. RISK REGISTER

| Batch | What could regress | LESSON | The assertion that catches it | DO-NOT-TOUCH |
|---|---|---|---|---|
| **A1** | `deadBeat()` routing misses a site → a beat with no lockout, or a double-stamped `deadT0` shortening a mega beat. Career persistence change could orphan `dinobowl_season`. Touch id gating could swallow a legitimate single tap. | #8 (poll for transitions, never fixed waits) | Per-beat lockout matrix (frame-1 press must not cut; post-lockout press must); `loadCareer() && loadSeason()` both non-null after an offseason; single-finger tap still snaps, aims and kicks. | None. |
| **A2** | `originYd: 84` desyncs from a future non-33 XP distance. The KO formation could accidentally create a **returnable** ball. `k.mode` latch could leave a click-only mouse user unable to kick (the known trap: deleting `5320` outright bricks them). Crowd bus re-scale could bury the bed. | #22 (no kick/punt returns is an owner keeper); #6 | ST matrix asserts `fgDist === 33` and geometry agree; assert `G.carrier === null` and no `returnPlay` for the whole kickoff beat; the four-way input matrix each resolves a kick; `crowdBus < sfxBus`. | **"Kick meter core" is a tuned constant** — this is routing and staging only: do not change `kickMeterPlan` values or the math inside `kickLocked`. |
| **A3** | The pose chain extends the on-screen takedown past the sub-1s budget, or overrides the first-down chain. `laidOut` flag mis-plumbed → an upright cel drawn sideways (the mirror-image bug). `frameBobDy`'s new signature breaks the showcase or serves stale cached values. | **#2** (never overwrite an in-flight contact anim), **#3** (players must stand up), **#23** (0.42/0.34/≤0.2/0.4 timings), #6 | Assert the live takedown resolves <1s while the chain plays only in `dead`/`playcall`; assert the first-down chain still wins (`!e.poseChain` guard at 6142); rotation-vs-cel table for all 13 packs × 4 dirs; bobCache key includes the base-pack id. | Adjacent to nothing protected, but the LESSON #23 timings are on the tuned-constants list — the chain must live **behind** the card, not in front of the whistle. |
| **A4** | Removing the stalk freeze lets defenders shed blocks instantly → run game collapses. Leadblock engagement conversion changes pancake frequency. Per-second juke rates change YAC distributions. Grace-window hoist lets a committed dive whiff. `resolveArrival` filter changes INT rate. | **#1** (soft live contact), **#14** (rate-limiting is not softness; the AI must agree with the physics), **#15** (per-frame rolls), **#19/#20** (persistent engagement, no one-shot throttles), **#24/#25/#26** (≥6 games, books balance, distribution not topline), **#21** (removing randomness shifts distributions elsewhere) | `test_batch3` block-hold 0.95-2.0s band; `icall:` == sum of `int:*`; `arrive:` ≈ attempts; `ct:`/`arrive:` within a stated tolerance of baseline; yds/att and INT/gm inside the round-8 bands (pilot ~77%/2.7, CPU ~67%/1.7); frame-rate invariance probe; dive still completes through the grace exemption. | **`resolveArrival`'s catch windows / tip model IS on the DO-NOT-TOUCH list** — the change is a *state predicate on the defender pool*, matching the filter `6381` already uses; it can only reduce INTs. Do not touch the windows themselves. **The contact solver (three-mode) is DO NOT TOUCH** — all A4 edits are in AI state code. |
| **A5** | Unifying flight time changes the ring's tint distribution and therefore player behavior. Letting `freezeT`/`slowT` survive the whistle stretches dead beats (the exact thing the 08-07 pass removed) and steals harness game-time. `payoff()` over-firing = FX spam. | **#9** (slow-mo steals test time; keep the fumble beat short), #23, #4 (the 0:00 banner is owner law), #18 (update tests with comments) | Assert on-screen dead-beat wall-time is unchanged after the `deadT` compensation; assert loose-ball recovery still gates on `ball.t > 0.45` of **game** time; 0:00 A/B in `test_clock`; ring tint recorded for a fixed set of geometries before/after. | Tint thresholds `0.24/0.56` are coupled to A6 — if A5 changes only *flight time* and not the risk formula, note the shift and re-check in A6. |
| **A6** | The CPU's `safeLimit`/board weights were tuned **with** the lane term present; removing it makes the CPU throw into coverage. | **#21**, **#24**, #26 | ≥6-game diff of `ct:`/`arrive:` ratio, comp%, INT/gm, sacks/gm — all four, before and after, in the same seeds. | **Two-stage fumble gate is DO NOT TOUCH** — the `ballSecurityScore` half is OWNER-CALL only, and `RETRO_BOWL_MECHANICS.md:477-479` shows the current form is faithful source parity. |
| **A7** | Nulling `G.szn` on a non-franchise entry could drop an unsaved season (it cannot — the hub ESC path saves first, but verify). Re-keying the condition map must update all six touch points or fatigue silently stops applying. Tie handling must not break `bumpDynamicLadder`, which is already tie-neutral. | #18, #10 | Assert `loadSeason()` intact after an exhibition; assert fatigue still applies **in** season mode after the re-key; D-number unchanged across a tie. | **D1-D16 ladder mechanics are tuned constants** — *displaying* the rung is fine; changing its motion is OWNER-CALL. |
| **A8** | Stripping `parts` from `netFrame` **throws on the guest** unless `G.parts` is initialized before `drawWeatherFX` runs — the guest returns from `update()` before `updateParticles` (this is the one trap the implementer must not miss). The field cache can miss an invalidation (possession flip changes the endzone pair) and freeze the wrong endzones on screen. Dead-code deletion is the #10 catastrophe class. | **#10** (never accept a shrunken file without a line-by-line diff), #15 (weather spawn was a per-frame rate bug), #6, #18 | Online suite green + no guest console error in SNOW; endzone labels correct after `changePossession`; `wc -l` before/after each deletion matches the reviewed diff exactly; `test_overhaul`'s `!g.returnPlay` and `!SRC.includes("function startKickReturn")` still green. | **Do not modularize the monolith.** The KO branch and `returncover`/`returnblock` deletions are sanctioned by AA_PLUS 3.7 — but only by **symbol**, never by the plan's stale line ranges. |
| **B3** | Deleting the FILM block by AA_PLUS_PLAN's stated range removes `buildSpecies`, `walkMirrorLegs`, `WALK_EXPAND` and `IDLE_MAPS` — every sprite in the game. | **#10** | Pure move-only diff for `profileOf` in B3 (zero deletions); the gallery renders all 13 species after. | Deletion direction is **AA_PLUS open question 5** — B3 moves and re-comments only. |

---

## 7. OWNER CALLS

Six. Everything else is decided and sequenced above.

1. **Overtime rule** — sudden death (game ends on any OT score) or a timed 5th quarter with the banner copy corrected? *Recommended default: sudden death, and playoff games grant repeated sudden-death periods so a tie can never eliminate you. Matches the banner already shipped and `RETRO_BOWL_MECHANICS.md:275`. Implemented in A2 unless you say otherwise.*
2. **Fumble hardening saturation** (`7971`, `prior * 50` clamps to 100 = literally un-fumbleable) — widen the contest roll to `irandomRange(-100, 105)` keeping exact source parity, or scale the term to `+Math.min(18, prior * 9)`? *Recommended default: widen the roll (keeps parity, removes the on/off switch). Deferred to A6 — nothing blocks on it.*
3. **The pass-window lane term** (`3437` prices blocked rushers and rushers standing in front of the QB, bumping borderline sideline-out/quick-dig reads a full tint bucket) — pull it now with a 6-game re-baseline of the CPU limits, or leave the CPU on the baseline it was tuned against? *Recommended default: pull it in A6 with the full re-baseline. If you'd rather not spend the bot games, A6 drops out entirely and nothing else changes.*
4. **Kickoff cadence** — keep the visible boot once per game, or fire the 1.7s beat after every score? *Recommended default: keep once per game. Re-adding it re-introduces exactly the 11-16s TD tax the 08-07 pass removed at your request. A2 makes the one beat look like a real kickoff; it does not add more of them.*
5. **HUD glyphs** — emoji (▲▼◀▶⚙★🏆🚩🎥) are a long-standing house idiom in ~20 places; keep them, or authored pixel glyphs? *Recommended default: keep the emoji. A5 pixelizes only the aim overlay's anti-aliased vector strokes and the star ellipse, which violate your own stated pixel-discipline law and frame every throw.*
6. **Serving canon** (AA_PLUS open Q8) — is Firebase static the one true build, with `apply_madden` lifted out of `export_static_game_data.py` and called at the tail of `_build_game_teams` so Flask serves identical numbers? *Recommended default: yes. Today the Flask host has no `kacc` at all and a different OVR scale, and `game.js`'s `|| kickAccOf(name)` fallbacks make missing data indistinguishable from real data — which means local play-test tuning conclusions are drawn on numbers the shipped build does not use (LESSONS #6/#12).*