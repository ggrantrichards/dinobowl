# RETRO BOWL CLONE SPEC — everything Dino Bowl must change to match

Source: live observed/played session of Retro Bowl (poki.com/en/g/retro-bowl,
web version, fullscreen) on 2026-07-24 — a full in-progress franchise game
(TEN vs CHI, Week 5) played drive by drive with screenshots of every phase.
Owner's mandate: **Dino Bowl = a clone of Retro Bowl's gameplay, plus (1) you
also play defense, (2) everyone is a dinosaur, (3) real NFL players.** That's
it. Everything below is organized as: what Retro Bowl actually does → what
Dino Bowl does today → the change required.

Legend: [P0] = gameplay feel, do first · [P1] = important · [P2] = meta/polish

---

## 1. GAME FLOW & PACE — the single biggest gap

**Retro Bowl observed:**
- There is **no play-call screen**. After every whistle the next play is lined
  up within ~1–2 seconds, routes already drawn on the field. A small
  **"Change Play"** chip (top corner, side matching drive direction) cycles
  to a different play AT THE LINE — you watch the route art change. That's
  the entire play-selection UX.
- **Quarters are 2:00** (config: 1/2/3 min). The clock RUNS between downs
  (hurry-up by default); it stops on incompletions ("INCOMPLETE" band, clock
  froze at 0:43) and out of bounds. Under 1:00 the clock turns **yellow**;
  at 0:00 it turns **red** and the play finishes (their rule matches ours).
- A **"Stop Clock"** chip (two clock icons) appears after in-bounds plays
  late in a half — spend it to stop the clock (timeout-lite).
- **Opponent possessions do not exist on screen.** The CPU's drive resolves
  instantly between your drives (CHI went 0→7 with zero visible plays).
  Games are therefore ~6–10 minutes of pure player offense.
- **Halftime is instant** — score card beat, then Q3 kickoff. No minigame.
- **"Activate SIM"** chip available mid-drive to auto-play.
- Teams **swap directions each quarter** (drove left in Q2, right in Q3).

**Dino Bowl today:** full-screen 4-card playcall menu every down (plus a
defensive call screen), dead-ball beats 1.3–2.5s + banners, 3:00 quarters,
clock chunk-runoff (-14s) at playcall, halftime minigame show, no
stop-clock, no mid-game sim, offense always drives left→right.

**Changes:**
- [P0] Kill the between-downs playcall screen during drives. Line up the next
  play automatically (~1.5s) with routes pre-drawn; add a **CHANGE PLAY**
  chip that cycles through the callsheet in place. (Keep the current 4-card
  screen only as an optional "coach mode" toggle, default OFF.)
- [P0] Real running clock between downs + stop on incompletion/OOB; drop the
  -14s chunk runoff. Yellow clock <1:00, red at 0:00. Default quarter length
  2:00 (setting: 1–3 min).
- [P0] Between-downs reset must feel instant: banner ≤0.9s, no replay unless
  sack/TD, players jog to the line.
- [P1] STOP CLOCK chip after in-bounds tackles inside the final minute of
  each half (2 per half).
- [P1] "SIM" chip during any possession (skips to its result using the CPU
  brain).
- [P1] Swap drive direction each quarter (rendering + camera already handle
  a leftward drive for team B — generalize).
- [P1] **Defense (our addition) must not break the pace**: when the user opts
  to play defense, CPU drives run live with the same instant lineups (CPU
  picks its play silently — no defensive call screen by default; the current
  def-call cards become the same CHANGE PLAY chip). Offer "sim opponent
  drive" as the chip so impatient players get the authentic Retro Bowl pace.
- [P2] Halftime: no show by default (straight to Q3). Keep the mascot
  minigames behind a "Halftime Show: ON" setting (owner's existing feature).

## 2. PRESNAP PRESENTATION — routes on the field

**Retro Bowl observed:**
- Every eligible receiver's route is drawn on the turf as a thick, readable
  **polyline with an arrowhead**, color-coded: **green** = standard routes,
  **blue** = the slot/priority route, **white** = the RB swing/checkdown
  (drawn with a dot terminus). Route art IS the play call.
- **Star players** have a **yellow star** above the helmet and a **gold-lit
  sprite**; the star receiver also shows his initials tag (e.g. "J.A").
- A dashed **aim ring** idles near the QB (your finger anchor).
- The **down & distance plate** ("3rd & 10", even "3rd & Inches") sits ON the
  field at the LOS, plus the top HUD strip: score left, "Qtr time" center,
  down & distance right — nothing else. One-pixel-font aesthetic.
- Bottom-left: **condition smiley** (yellow happy face) + "K.Corker [QB]" —
  the controlled player's name plate.

**Dino Bowl today:** no on-field route preview; star/passive info lives in a
pre-snap info card; HUD busier (rampage meter etc.); has carrier name plate.

**Changes:**
- [P0] Draw route polylines at presnap exactly like this (green/blue/white
  coding, arrowheads, RB checkdown white-with-dot). Remove/condense the
  pre-snap info card.
- [P0] Down & distance plate rendered on the field at the LOS.
- [P1] Yellow star + gold glow for apex/star dinos; initials tag near the
  star receiver.
- [P1] Condition smiley next to the controlled player's name (ties into
  stamina/condition we already track).
- [P2] HUD diet: score · Q/time · down&distance only during live play; move
  rampage meter to a corner chip.

## 3. THROW MECHANIC

**Retro Bowl observed:** press near the QB plants the anchor ring; **drag
back** (slingshot) raises power/distance and shows a projected arc + landing
marker; **release throws**. Pull length controls depth — a short flick is a
dartier low ball, a long pull is a deep rainbow. No separate bullet button, no
risk percentage UI; the read is the route art + your eyes. Throws are allowed
any time; a fast flick right after the snap throws immediately.

**Dino Bowl today:** sling pull-back EXISTS (restored) with rubber-band +
RELEASE marker; separate bullet on SPACE/right-click; landing cross.

**Changes:**
- [P0] Merge to the Retro Bowl model: single gesture — pull distance sets
  depth AND trajectory flatness (short pull = bullet-ish, long = lob). Keep
  SPACE-bullet as a secondary input but the gesture alone must be complete.
- [P1] Projected dotted arc + landing ring during the pull (we draw an arc
  already — match the read: arc from QB to landing spot, no text labels).
- [P1] Ball flight: lower, faster apex like RB's; ball shadow tracks beneath.

## 4. CATCH & RUN

**Retro Bowl observed:** on the catch you instantly control the receiver;
a floating **"+Ny"** yards tag rides the carrier and settles at the tackle
("15y", "10y", "4y" seen). Running is smooth auto-forward with steering;
defenders take honest pursuit angles and the pile forms where bodies meet.
Name-driven color commentary on breaks: **"[DB] Clapp wasn't strong
enough"** printed mid-play when the carrier broke a tackle.

**Dino Bowl today:** receiver control on throw exists; no yards tag; has
commentary/announce lines but not mid-play break lines.

**Changes:**
- [P0] Floating yards-gained tag on the carrier (updates live, lingers 0.8s
  at the whistle).
- [P1] Mid-play one-liner commentary for broken tackles/big plays using the
  REAL defender names ("Wiggins wasn't strong enough", "Henry runs through
  Smith") — we have real NFL names, lean into it.
- [P1] Juke/dive polish: RB runners keep momentum through cuts; our juke is
  there — tune to not lose speed on a single cut.

## 5. TACKLES & PHYSICS LOOK

**Retro Bowl observed (zoomed):** tackles form a **pile** — several bodies
genuinely overlapping/stacked at the spot, teammates converge and stand
around it. No knockback teleports; the carrier + tacklers collapse where
contact happened. Sprites are ~3/4-view, front-facing, chunky (helmet,
jersey, skin, pant stripes readable at 16–20px).

**Dino Bowl today (after grapple pass):** overlap works in the trenches,
tackle pair wraps; other defenders stop short (no pile-on).

**Changes:**
- [P1] PILE-ON: after a wrap, 1–3 nearby pursuers keep coming and fold onto
  the tackle spot (join the overlap with small offsets, then all rise via
  getup). Sells every tackle, uses existing pair-exemption machinery —
  extend the exemption to "pile members" for the dead beat.
- [P2] Idle stances: defenders at presnap should have subtle varied idle
  poses (we have 2-frame walk; add a standing frame variant).

## 6. SCORING FLOW & KICKS

**Retro Bowl observed:**
- TD → **"1 or 2 point conversion?"** modal with two huge buttons (1 PT /
  2 PT), field dimmed behind. Choosing runs it as a real snap (2PT) or the
  kick meter (1PT: drag-aim kick with arrow, wind flag; unattended = miss —
  I missed two XPs by not touching it, hence 6/12/18/19 scores).
- **Kickoffs are real**: kicking formation, ball flies, returner or
  **TOUCHBACK** band. (Owner decision: Dino Bowl keeps spot-at-25, no
  returns — keep, but show a 1s kickoff flavor beat instead of a bare card.)
- Endzones: **solid team-color paint** (deep blue) full height; the **goal
  post stands INSIDE the endzone back** — side-view yellow pole with padded
  base, gooseneck, drawn tall (≈60% of field height) with the crossbar/fork
  visible; cheerleaders + mascots on the bottom track; "RBtv" camera cart.
- Field goals: same drag kick meter (arrow + power from pull, wind shown).

**Dino Bowl today:** ptchoice screen exists (1/2pt), two-bar kick meter,
goal posts now pseudo-3D but smaller, endzone striped with team name text.

**Changes:**
- [P0] Replace the two-bar kick meter with the **drag-back kick**: pull sets
  power + aim against a wind flag, release kicks, ball flies through (we
  already have kickfly + THROUGH flash). Unattended/late = shank.
- [P1] TD modal restyle: big two-button "1 or 2 point conversion?" over a
  dimmed live field (replace the ptchoice screen).
- [P1] Endzone art: solid team-color fill + big goal post scaled up ~1.6×
  (ours is correct in construction, too small vs reference), cheerleader
  row + mascot on the bottom sideline, camera cart prop.
- [P2] Kickoff flavor beat (kick + touchback band) before spotting at 25.

## 7. FIELD & STADIUM ART

**Retro Bowl observed:** two-tone green 10-yard banding with a fine dot
texture; thick bright yard lines with directional arrows beside numbers;
numbers rendered along BOTH sidelines mirrored (readable from each half);
team logos ("R·B" + helmet) painted twice at the ~25s; dense two-tier crowd
with team-color clusters; full sideline ecosystems on BOTH sides: benches,
staff, chain crew (orange), photographers, camera crew, cheerleaders,
mascots wandering; yellow restraining lines dashed along sidelines.

**Dino Bowl today:** 5-yard stripes, big numbers both sides (good), midfield
logo (good), crowd top-only + sideline life restored, uniform fans.

**Changes:**
- [P1] Dot-texture overlay on turf bands; yard-number directional arrows;
  paint team logos at both 25s (we have midfield only).
- [P1] Bottom sideline gets the same life as the top (benches/cheer/chain
  crew) — currently sparse.
- [P2] Crowd: add team-color clustering sections + occasional standing rows.

## 8. DEFENSE (the Dino Bowl addition — make it feel native)

Retro Bowl has NO playable defense; ours is the differentiator. To keep the
clone feel:
- [P0] Defensive possessions use the exact same presentation: instant lineup,
  CPU offense's routes NOT shown (you read the formation instead), you get
  the CHANGE PLAY chip for coverage shells, same camera/pace/banners.
- [P0] Default control = the star defender (gold glow); TAB switches. All
  the existing mechanics (timed jump, punch, soar, dive) stay.
- [P1] A "SIM DEFENSE" chip for authentic-Retro-Bowl players who only want
  offense; sim uses the balanced CPU-vs-CPU engine (now sane post-tuning).

## 9. AUDIO & FEEDBACK

**Retro Bowl:** minimal kit — crowd wash that swells on big plays, sharp
whistle, soft thud tackles, chime on scores; commentary is TEXT, not audio.
**Changes:**
- [P1] Our new layered kit is richer than RB's; tune levels DOWN toward
  subtle (RB sounds are quiet accents, not events). Crowd bed volume down,
  aww shorter. Keep whistle prominent.

## 10. META LAYER (real NFL players — [P2] unless noted)

Observed/known Retro Bowl franchise loop that Dino Bowl already half-has
(season/career exist) — parity items:
- Pregame screen: matchup card with team records, star-ratings for each
  unit (OFF/DEF stars), uniform picker (home/away), ball picker, SIM GAME
  button. [P1 — ours goes straight to intro; add this card]
- Roster: star ratings (1–5), condition smiley, morale, age/contract; the
  condition/morale feed play (tired stars underperform) — we have stamina +
  condition carry-over; surface them RB-style with smileys. 
- Front office: salary cap, sign/cut/extend, draft picks, trades, facility
  levels (training/rehab/stadium), coaching staff. [We have training room +
  season; the cap/contract sim is absent — large scope, defer]
- Press conferences / social beats affecting morale. [defer]
- Weekly schedule, standings, playoffs, player-of-the-game. [exists mostly]
- Real NFL players everywhere (we have this — keep names in commentary).

## 11. THINGS DINO BOWL KEEPS (owner's deliberate divergences)

- Playable defense (see §8) — the whole point.
- Dinosaur species per position + rampage + soar + peanut punch + snowballs.
- No kick/punt returns (RB has them; owner vetoed as glitchy — keep the
  flavor beat instead, §6).
- Optional halftime shows, practice mode, online, playbook lab, QA scenes.
- Contested-catch timed-jump duel (deeper than RB's auto-catch — keep, it's
  better and fits "you also play the ball").

## 12. PRIORITIZED BACKLOG (condensed)

P0 (the feel gap): instant next-down flow + CHANGE PLAY chip · on-field
route art w/ color coding · running clock + stop rules + 2:00 quarters ·
drag-back kick · single-gesture throw depth · yards-gained tag · on-field
down plate · defense in the same flow.
P1: stop-clock chip · mid-game SIM · direction swap per quarter · star
glow/stars · pile-on tackles · TD conversion modal · endzone/goalpost scale ·
sideline life bottom · commentary with real names · audio level pass ·
pregame matchup card.
P2: turf texture/logos at 25s · crowd clustering · kickoff beat · idle
stances · franchise economy (cap/contracts/facilities/press).

---

## IMPLEMENTATION LOG — P0 pass 1 (2026-07-24, same day)

SHIPPED (all suites green, 244 checks; bot-verified pace/balance):
- §1 Fast flow: playcall/defcall screens removed by default — instant lineup
  with the top situational call; **CHANGE PLAY chip** (top-right, click) and
  Q/E cycle the 4-call sheet at the line for offense AND defense. Classic
  card screens preserved behind `localStorage dinobowl_coachmode=1`.
- §1 Running clock: QUARTER_LEN 120s; burns 2.2× live / 2.5× dead-ball /
  1× presnap (matches observed Retro Bowl pacing ≈ 25-40 plays per game,
  bot-measured 39); freezes on incompletion/OOB/turnover until the snap;
  yellow < 1:00, red at 0:00; 0:00 at presnap ends the quarter; no more
  -14s chunk runoff. Dead beats 1.3→0.9s (first-down rise 1.6s); replays
  now sacks-only.
- §2 Presnap art: color-coded route polylines with arrowheads (white+dot RB
  checkdown incl. the leak-out, blue WR1 primary, green others), run plays
  show the back's white lane arrow, down & distance plate ON the field at
  the LOS, Retro-style CHANGE PLAY chip UI.
- §3 Single-gesture throw: pull depth now also shapes the arc — short pull
  = flat quick dart (T×0.8, apex×0.6), long pull = deep rainbow.
- §4 Yards tag: live "+Ny" tag rides the carrier and lingers 0.9s where the
  run died.
- §6 Drag-back kick: pull back from the ball (length = power, vertical =
  aim vs wind) with a live bending arrow, release to kick; >7s dawdle =
  botched operation shank; SPACE meter kept as keyboard fallback; CPU path
  unchanged.

Bot metrics after the pass (2 games): pilot 72% comp / 2.5 INT/gm,
CPU QB 72% / 3 TD/gm, ~39 plays/game, block overlap 26.8%.
STILL OPEN from P0: none. Next up = P1 list (§12).

---

## IMPLEMENTATION LOG — round 2: SOURCE-DRIVEN pass (2026-07-24)

We FOUND the real Retro Bowl logic: the GameMaker HTML5 export (5.9MB, real
`gml_Script_*` names) mined into RETRO_BOWL_MECHANICS.md. Owner corrections
applied first:
- **Play-call card screens are the DEFAULT again** (owner: a Dino Bowl
  improvement over RB). Fast flow is now the opt-in; CHANGE PLAY chip + Q/E
  still cycle at the line either way. SETTINGS menu added (play defense /
  halftime shows / play-call screens / quarter length), persisted.
- **Timeouts**: RB source rule (2/half at 2:00 quarters, 3 at 3:00), STOP
  CLOCK chip + T key during dead beats, HUD pips.
- **Play defense is optional**: OFF = CPU drives resolve instantly &
  statistically (difficulty-scaled), exactly like RB opponent drives.
- **No auto-play** anywhere (owner veto on the SIM chip).
- **Halftime shows OFF by default** (setting restores the mascot games).
- Direction swap each half: **DEFERRED** — needs a directional refactor of
  ~50 movement/goal comparisons; logged honestly as open.

Source-faithful mechanics now in the engine:
- **Throwing**: NO accuracy dice for anyone (source has none) — the ball
  lands where aimed; weather bends it slightly; QBs differ via arm range,
  ARM FATIGUE (attempts × stamina, source formula), and read quality.
- **Catch/INT**: defender window shrunk to ~0.72× the receiver's (source
  ratio), contests require the defender to actually beat the receiver to
  the ball, **no interceptions within 5 yards of the throw origin** (source
  rule — the quick game is structurally pick-proof), drops only from visible
  causes (pressure tip / weather / mistimed leap), difficulty scales the
  windows like the source.
- **Takedowns**: THE big one — no dice at contact. A wrap GRAPPLES the
  carrier and LOCKS (the tackler rides him, dragged for extra yards);
  every wrapped defender pours strength each frame and the carrier is down
  when it beats his strength threshold. Escapes = juke/stiff-arm/shrug
  (which physically shed the tackler). Verified: solo avg-strength wrap
  ≈0.2s + 1.2yd drag; big hits pour a +46 chunk.
- **Clock**: source values — 1 game second per 700ms live, dead-time chunk
  (3-7s) at in-bounds whistles, slow presnap, and the source's hidden 1.5×
  runoff while the human leads by >7.
- Presentation: RB-style TD conversion modal (1PT/2PT big buttons over a
  dimmed field), solid team-color endzones, goal posts scaled to ~55% field
  height, landing RING aim marker, star glow/★/initials at presnap,
  condition smiley on the controlled-player plate, pile-on tackles (1-2
  pursuers fold onto the wrap through the whistle), broken-tackle
  commentary with real NFL names, kickoff flavor beat, turf dot-grain,
  team marks at both 25s, SFX master trim + shorter crowd aww,
  juke keeps full momentum.

Bot after the pass (2 games): pilot 71% comp / ~4 INT/gm, CPU 61% / 3 INT/gm,
grapple overlap 26%, suites 244/244 green, soak clean.

---

## IMPLEMENTATION LOG — round 3: LEGIBILITY + GRIND + LADDER (2026-07-28)

Process: every change designed and adversarially critiqued by a two-agent
pair before implementation; all decoded-source claims verified in code.

SHIPPED (suite green: 71+7+5+27+39+87+8+17; soak clean; qa_botgame N=6 protocol):
- **Change 1 — uncontested-catch legibility** (resolveArrival): open-in-window
  = CAUGHT; drops only from visible, qaTele-tagged causes (pressure tip with
  the source's 6px offense favor + 22% carom INT only inside the defender's
  own window, mistimed-leap on high balls, weather shrinking the secure
  window deterministically). Deleted: the 0.42-floor blind catch roll and the
  phantom post-fail 22% INT. Lurker branch is now window-is-the-model
  (leap timing scales the effective window ×1/0.8/0.5). Difficulty sign moved
  into the windows (dScale signed by offenseIsUser). Contested timed-jump
  duel (owner keeper) untouched. New tele: arrive:/icall: books-balance
  instrumentation (LESSON #25).
- **Change 2 — block grind + coverage cushion**: case block/rush converted
  from hold-timer + 8% reroll to the checkTackles-mirrored accumulator
  (blockAcc/blockShedAt/blockFeed, roles swapped for the inverted win
  condition: rusher pours str-scaled feed, blocker's blk IS the threshold,
  ONE jitter roll per rep) + radial latch-point tether (base 28, bull ×0.70 —
  calibrated live: 34 was dead code at 2-5% fire rate, now ~14%). Single
  releaseBlock() path fixed a pre-existing stale-blockedBy leak. engageT
  lives on as a derived read-only projection. DIFFS gained coverLag
  (0.80/0.62/0.42) + cushion (38/28/18, floor bodyContactRange×0.62);
  VETERAN anchor deliberately widened. HONEST RESULT: outcomes in band
  (pilot 77%/2.7 INT-gm, CPU 67%/1.7, sacks 2/gm stable) but contested-entry
  stayed ~80% — breakOnBall's flight-time closing dwarfs presnap cushion;
  the real lever needs an owner call (see LESSONS #26 amendment).
- **Change 3 — dynamic difficulty ladder + fumble parity**: DYNAMIC 4th
  difficulty tier (D1..D16, suppress ladder: loss +1 / win −1 / blowout −2,
  clamp [−1,10]→[−5,10] after a championship, persisted dinobowl_dyn),
  mutated-in-place DIFFS row lerping ALL seven knobs incl. Change-2's
  coverLag/cushion; simCpuDrive tdP index-coupling fixed (G.diff=3 would
  have read 0.40). Fumbles: two-stage gate MODELED ON the source idiom
  (immunities first — defense/QB/goal-line ±5yd; integer trigger, hard-hit
  ceiling 1/11, soft wraps ~1/66; hands/str security contest + career
  hardening via new fum season stat; ~2% floor kept as a flagged LESSON-#19
  exception). Crash-catch fumble also goal-line immune. Peanut punch /
  rampage / apex QB-hunter keepers untouched — peanut punch is now the #1
  fumble source BY DESIGN (skill strips > background dice). Soak fumbles
  2.0→0.67/gm (source band 0.5-1.5). mergeSeasonStats NaN-guarded for
  legacy saves.
- Docs: RETRO_BOWL_MECHANICS.md round-2 decode (presnap alignment + call
  weights, route pools, suppress ladder, fumble gate, in-the-clear flag +
  §1 correction: "uncovered = auto hands" is dead code in source).

OPEN → next: presnap texture (jitter/hash-CB) + breakaway commentary in
deliberation; contested-entry-rate lever (breakOnBall) awaiting owner input;
rampage goal-line immunity = owner call; WR stalk-block timer = last old-style
hold timer (follow-up); direction swap per half still deferred.
- **Change 4 — presnap texture + breakaway** (designed + self-critiqued):
  ±10px one-roll-per-snap y-jitter for the back seven (source randyards;
  front four stay precise — only the presnap solver may nudge them);
  hash-aware far corner (Dino Bowl snaps center so the "hash" = G.hashY,
  where the last whistle died laterally; kicks/kickoffs re-center) widening
  +10y/+14x max; breakaway call (source s_is_in_the_clear): carrier past
  midfield with nobody goalside → one bigplay announce + crowd spike +
  brk:clear tag, latched per play. High-step anim DROPPED deliberately (only
  available cel is a stationary hop — LESSON #2/#3 risk for zero payoff).
  batch3 hold band re-derived to 0.80-2.0 (rating spread across matchups is
  design, not flake) — verified stable 4/4 runs.
