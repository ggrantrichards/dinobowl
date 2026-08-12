# Retro Bowl Mechanics — Reverse-Engineered from the GameMaker HTML5 Export

Source: `RetroBowl.js` (5.9 MB GameMaker HTML5 export with real script names).
All snippets below are trimmed from that file; GML noise (`yyGetBool`, `__yy_gml_errCheck`, `yyftime` = multiply, `yyfplus` = add, `yyfdivide` = divide) is stripped in the pseudo-code but visible in the evidence quotes.

## Global conventions (needed to read everything else)

- **Units**: 20 px = 1 yard (`air_yards = point_distance(...)/20`). Field runs x = 300 (own goal line) to x = 2300. Frame rate: standard GameMaker 60 fps step; wall-clock times use `get_current_time()` in ms.
- **Player attributes** are a `ds_map` with **string keys**: `"skill"`, `"speed"`, `"strength"`, `"stamina"` (0–10), plus `"condition"` (0–100, < 0 = injured), `"attitude"` (morale, 0–100), `"age"`, `"position"`, and `stat_*` counters. There is no separate catching/accuracy/tackling stat — `skill` doubles as hands/accuracy/kick accuracy depending on position, `strength` doubles as arm/leg power and break-tackle.
- `s_get_attribute(pmap, key)` = `min(base + buff, 10)` for the four core stats.
- **Match difficulty** `cont.difficulty` (controller instance 105): starts at a dynamic `suppress_difficulty`, then hard-overridden by the options difficulty:

```js
switch(op_difficulty){ case 1: difficulty=7;  case 2: difficulty=2;
                       case 3: difficulty=-5; case 4: difficulty=-5; }
```
Higher = easier for the human. `op_difficulty >= 3` ("hard"/"extreme") also switches several formulas to attribute-driven variants (noted below).

---

## 1. Catch / Interception / Incompletion

Resolution lives in **`gml_Script_s_check_ball_collision`** (runs per player per step while a ball is in flight) plus **`gml_Script_s_check_tipped`** (the drop model) and **`gml_Script_s_drop_ball`** (deflection physics). There is **no single dice roll for "catch %"** — it is a proximity contest with two deterministic-ish gates (radius + tip) whose thresholds are stat/difficulty-scaled.

### Pseudo-code

```
onBallNear(player):                             # only if balldist <= 20px (1 yd)
  reject if player dead / tackling / in tackle anim / is OL(pos 5)
  reject if player.y outside 132..468 (sideline strip)
  reject if < 750 ms since ball was tipped/dropped (gmldropped_time)
  height gate: diving(anim 10) needs ball.height <= 60
               carrying(anim 5)                <= 15
               otherwise                       <= 30

  if player is OFFENSE:
    reject if dist(player, landing_marker) > 100px    # must be near the aim dot
    if throw went past LOS (throw_distance > 0):
       if check_tipped(): return  DROP/DEFLECTION     # see below
    catch_radius_t = (difficulty + 5) / 15            # easy .8, med .47, hard 0
    if op_difficulty >= 3 and player has pmap:
       catch_radius_t = skill / 11                    # attribute-driven on hard+
    cdif = lerp(0.75, 1.0, catch_radius_t)
    if balldist > 20 * cdif: return "catch radius fail"   # 15..20 px window
    CATCH (receive_ball; completion stats if past LOS and never tipped)

  if player is DEFENSE:
    catch_radius_t = (difficulty + 5) / 15
    cdif = lerp(0.9, 0.5, catch_radius_t)             # easy .58, hard .9
    if op_difficulty >= 3: cdif = lerp(0.95, 0.8, catch_radius_t)
    if balldist > 20 * cdif: return                   # 10..19 px window
    if dist(player, throw_origin) < 100: return       # NO INTs within 5 yds of QB
    if check_tipped(): return DEFLECTION
    INTERCEPT: receive_ball; ball.state = 9 (INT) or 21 (INT+touchback if x<300/x>2300);
               QB stat_int++
```

**The tip/drop model** (`s_check_tipped`) — the only randomless "drop" source; a tipped ball becomes a live deflection that usually lands incomplete:

```
check_tipped():
  never in practice or kickoffs
  if catcher NOT diving and NOT already carrying:
     low_catch = lerp(0.5, 0.4, skill * 0.1)          # skill 0 → .5, skill 10 → .4
     if op_difficulty >= 3: low_catch = lerp(0.55, 0.45, skill*0.1)
     if weather is not clear: low_catch += 0.05
     ch = 30 (+5 if bullet throw)
     if ball.height < ch * low_catch:  TIPPED ("low")  → drop_ball(false)
  if offense and "in the clear": return false          # uncovered = automatic hands
  oppd = nearest_opponent.balldist
  if offense:  oppd -= 2 if no pmap (generic guy); oppd += 5 if ball already tipped once
  if defense:  oppd -= 5                               # contest favors the offense
  if oppd < my.balldist (or during a kick): TIPPED ("pressure") → drop_ball(false)
```

`drop_ball` scatters the ball: direction ± 20°, `velocity = 1 + rand(0.1,1)`, small pop-up, `dropped_time = now - irandom(250)` (which re-arms the 750 ms no-touch window).

### Evidence (trimmed)

```js
var gmlcatch_radius = (yyInst(...,105).gmldifficulty + 5) / 15;
if (op_difficulty >= 3 && _inst.gmlpmap)
  gmlcatch_radius = gml_Script_s_get_attribute(...,"skill") / 11;
var gmlcdif = lerp(0.75, 1, gmlcatch_radius);
if (_inst.gmlballdist > 20 * gmlcdif) { slog("catch radius fail"); return false; }
```
```js
// defense branch
var gmlcdif = lerp(0.9, 0.5, gmlcatch_radius);
if (op_difficulty >= 3) gmlcdif = lerp(0.95, 0.8, gmlcatch_radius);
if (_inst.gmlballdist > 20 * gmlcdif) return false;
if (distance_to_point(_inst, ball.gmlxthrow, ball.gmlythrow) < 100) return false;
```
```js
// s_check_tipped: low-ball drop
var gmllow_catch = lerp(0.5, 0.4, _inst.gmlskill * 0.1);
... var gmlch = 30; if (ball.gmlbullet_throw) gmlch += 5;
if (ball.gmlheight < gmlch * gmllow_catch) { slog(">>> Tipped: low"); s_drop_ball(false); return true; }
// pressure tip
if (_inst.gmloffense && _inst.gmlintheclear) return false;
... else { gmloppballdist -= 5 };   // defender contesting
if (gmloppballdist < _inst.gmlballdist || cont.gmlkicking) { slog(">>> Tipped: pressure"); ... }
```

**Dino Bowl delta**: `resolveArrival` in `static/game/game.js` uses much larger catch radii (30/34 px base, scaled by `hands`/`jump` 0.82–1.12) and resolves offense-vs-defense in one comparison. Retro Bowl's windows are far tighter (10–20 px on a 20 px/yd scale), the drop is a *low-ball tip* not a hands roll, contested balls always favor the offense by 5 px of separation, and defenders physically cannot pick anything within 100 px of the release point — that last rule is the biggest behavioral difference (no tip-drill INTs at the line).

---

## 2. Tackling (`gml_Script_s_check_tackling`)

Fully **deterministic contact physics** — no tackle probability roll anywhere. Tackles are a *grapple* that succeeds when an accumulated counter passes a strength-scaled limit.

### Pseudo-code

```
each step, for each opponent O within 40 px:
  skip if teammate, dead, in tackle anims; DBs re-tackle cooldown = 2000 ms
  # carrier runs over a defender head-on (overlap, |dy| < 10, carrier anim 5, speed > .1):
    if defender.jumps > 0:  BIG HIT — defender anim 8, carrier knocked dead (down),
                            defender inherits carrier velocity * 0.5, carrier speed *= 0.9
    else:                   defender dive (anim 4), carrier speed *= 0.75, keeps going
  # engagement (also IS the blocking system):
  if odist < O.collsize:                       # collsize: 10 linemen, 5 skill, 2.5 WR
     if not goalside: push — my hspeed += O.hspeed * O.strength/5   (bulldoze)
     else: both speed *= 0.5
     both revert to previous x/y; O.tackling=me, me.tackling=O; both anim 3 (wrestle)

while locked (me.tackling set):
  break_dist = 12 px (20 on kickoffs); if partners drift past it -> both released (anim 2)
  if I am the carrier and stiff_arm > 0:  STIFF ARM — defender flung (vspeed ±1, anim 4),
                                          carrier anim 9, keeps going
  else each frame:  partner.tacklecount += my.strength        # mutual grind
       (positional drags: kickoff gunners slow carrier ×0.9; DL/OL shove x by 0.025*strength;
        others push carrier's vspeed ±0.1)
  TACKLED when partner.tacklecount > partner.strength * partner.my_tackle_limit
          (QBs are tackled instantly when wrapped, except on kickoffs)
  loser flung backwards at 1.5 px/frame opposite his joystick dir, anim 4;
  tackle stat awarded only if the ball is past the line of scrimmage (per-position rules)
```

Broken tackles are therefore emergent: a strong carrier has a high `strength × my_tackle_limit` product, so weak defenders grind for many frames and get dragged (and can be shed by drifting > 12 px, stiff-arms, or the carrier's push-through). `s_tackle_failure` docks the credited defender's `stat_tackles` (−4 DL, −3 LB, −2 DB) when the carrier escapes.

### Where the numbers come from (`gml_Script_s_set_skills_and_skin`, per-snap)

`team_defense = opponent_defense_rating − difficulty, clamped 2..15` (fixed 15 on "extreme").

| Role (position) | strength | my_tackle_limit | accel (px/frame²) |
|---|---|---|---|
| DL (6) | `3.5 + 0.2·teamDef` (`4 + …` on hard+) | `(20+teamDef)·irandom(3..5)` | `0.035 + 0.002·teamDef` |
| LB (7) | `2 + 0.1·teamDef` | `20 + teamDef` | `0.065 + rnd(0.005) + 0.002·teamDef` |
| CB/S (8/9) | `1 + 0.2·teamDef` | `20 + teamDef` | `0.065 + rnd(0.04,0.055) + 0.002·teamDef` (extreme: `0.135+0.003·teamDef`) |
| OL (5) | `4.75 + 0.85·nTEblockers + 0.4·strengthAttr` | `(20 + difficulty + 5.5·nTEblockers + skillAttr)·5` | `0.055 + 0.002·speedAttr` |
| QB (1) | `1 + 0.1·strengthAttr` | `(20 + difficulty + skillAttr)·4` | `0.095 + 0.002·speedAttr` |
| RB (2) | `2 + 0.1·strengthAttr` | — | `0.105 + 0.002·speedAttr` |
| WR (3/4) | `1 + 0.2·strengthAttr` | — | `0.115 + 0.002·speedAttr` |

Stiff-arm / jump charges (per snap): RB gets `stiff_arm = irandom(1)`, +1 if `irandom(10) < strengthAttr`, guaranteed ≥ 1 at strength ≥ 6; `jumps` analogous from speed (WR uses `irandom(11)`). Easy difficulties strip them from *defenders* (`difficulty < 2 → −1 both`).

### Evidence (trimmed)

```js
var gmlodist = point_distance(...); if (gmlodist > 40) continue;
...
if (odist < O.gmlcollsize) { ... O.gmltackling = _inst.id; ... s_set_anim(_inst, 3); }
...
var gmldist_break = 12; if (s_is_kickoff(true)) gmldist_break = 20;
...
if (_inst.id != ball.gmlholder)
  tackling.gmltacklecount += _inst.gmlstrength;
...
if ((tackling.gmlposition == 1 && !is_kickoff) ||
    tackling.gmltacklecount > tackling.gmlstrength * tackling.gmlmy_tackle_limit) {
  // flung: hspeed = dcos(jdir+180)*1.5 ... s_set_anim(4)
```
```js
// stiff arm
if (ball.gmlholder == _inst.id && _inst.gmlstiff_arm > 0) {
  s_fieldtxt("match_StiffArm"); ... tackling.vspeed = ±1; s_set_anim(tackling, 4); s_set_anim(_inst, 9);
```

**Dino Bowl delta**: `checkTackles` rolls probabilities (punch odds, tackle odds vs. `str`) per contact. Retro Bowl has *zero* RNG at the moment of contact — all randomness was front-loaded into per-snap stat rolls (`my_tackle_limit`, `stiff_arm`, `jumps`). To match the feel, convert tackle resolution into a deterministic grind counter and move the dice to snap setup.

---

## 3. Blocking / Line Play

There is **no separate blocking system** — blocking is literally the tackle grapple from §2 between OL (pos 5) and rushers. How long a block "holds":

```
block frames ≈ (rusher.strength × rusher.my_tackle_limit) / blocker.strength
```
because the blocker feeds `blocker.strength` per frame into the rusher's `tacklecount`, and the rusher is shed when it exceeds `rusher.strength × rusher.my_tackle_limit`. Example (medium, teamDef = 8): DL strength ≈ 5.1, limit ≈ 28·4 = 112 → threshold ≈ 571; OL strength ≈ 4.75 + 0.4·str; a str-5 OL feeds ~6.75/frame → shed in ~85 frames ≈ 1.4 s; but *simultaneously* the DL is grinding the OL's much larger threshold (`(20+diff+5.5·te+skill)·5 ≈ 135–200 ×  strength ≈ 6.75` ⇒ ~900+), so the OL virtually always wins the mutual grind and the pocket collapses only via the *rusher breaking the 12 px tether* or extra rushers. Extra TE blockers raise every OL's strength by 0.85 and limit by 27.5 — that's the entire "max protect" mechanic.

Defensive alignment (`s_set_position_defense`) was not decoded in depth (timebox); the shed-vs-hold math above is the load-bearing part.

**Dino Bowl delta**: `game.js` uses `blockedBy`/`holdT` timers for blocks. Retro Bowl blocks have no timer at all — they end by *distance break* (rusher steering 12 px away from the grapple) or by grind-out, which is why swim moves look like a slide-off rather than a countdown.

---

## 4. Throw / Aiming Physics (`s_update_ball` states 2–3, release code)

The human throw has **no accuracy scatter whatsoever** — the ball goes exactly along the drag vector. "QB accuracy" is expressed through *arm power fatigue*, the *bullet-throw arc*, and receiver-side catch/tip windows.

### Pseudo-code

```
drag:  dragdist = min(dist(touch_start, finger), 100)     # px, hard cap
       direction = exact drag direction (flipped)
       dragdist < 20 at release (or aiming backwards)  → QB scramble instead of a throw

release:
  velocity = dragdist * holder.my_throw_power             # px/frame
  zvel     = velocity * 0.35                              # arc
  bullet throw (2nd finger / right-click toggle):
  velocity *= 1.2 ; zvel = velocity * 0.35 * 0.5          # flatter, faster

my_throw_power = 0.08 + 0.004 * effStr
  effStr = clamp(strengthAttr − stat_attempts * (10 − staminaAttr) * 0.05, 1, 10)
           # the arm tires with every attempt; stamina 10 = never tires

flight (per frame, s_update_ball_movement, non-kick):
  velocity *= 0.986;  zvel -= 0.08;  height += zvel
  ground bounce: zvel *= −0.5, velocity *= rnd(0.2,0.5), direction += rnd(−40,40)
```

Max range: `v0 = 100 × 0.12 = 12 px/frame` at strength 10. The CPU's own model of arm range (used by receivers coming back to the ball) is `260 + 40·armStrength` px = **13 + 2·strength yards** — so a 10-arm QB is modeled as a 33-yard-air thrower.

### Evidence (trimmed)

```js
if (_inst.gmlbullet_throw) {
  _inst.gmlvelocity = _inst.gmldragdist * holder.gmlmy_throw_power * 1.2;
  _inst.gmlzvel = _inst.gmlvelocity * 0.35 * 0.5;
} else {
  _inst.gmlvelocity = _inst.gmldragdist * holder.gmlmy_throw_power;
  _inst.gmlzvel = _inst.gmlvelocity * 0.35;
}
```
```js
// s_set_skills_and_skin
var gmlstam = (10 - _inst.gmlstamina) * 0.05;
var gmldep  = ds_map_find_value(pmap, "stat_attempts") * gmlstam;
gmlstr = clamp(strengthAttr - gmldep, 1, 10);
_inst.gmlmy_throw_power = 0.08 + 0.004 * gmlstr;
```
```js
// s_update_ball_movement (pass in flight)
_inst.gmlvelocity *= 0.986;  _inst.gmlzvel -= 0.08;
```
```js
// s_aim_AI_offense — the engine's own range model
var gmldist = 260 + gmlarmstrength * 40;
```
```js
if (_inst.gmldragdist < 20 || s_opposite_aim(...)) { ...s_qb_run(false); } else { s_throw_ball(...); }
```

Also relevant: QB `skill` sets `cont.route_alpha = 1 + strengthAttr` (how visibly routes are drawn), and per-play RB stiff-arm/jump charges are *decremented* on every passing play (`s_throw_ball`) at low difficulty — small anti-cheese detail.

**Dino Bowl delta**: `slingAim` maps pull → a lead point and (elsewhere) applies `acc`-based scatter. Retro Bowl applies *zero* scatter to human throws; inaccuracy is 100 % in the player's thumb plus the receiver-side tip gates. If Dino Bowl wants Retro feel: drop landing scatter, cap pull at a fixed px distance, scale velocity (not landing point) by arm, and add the `attempts × (10−stamina)` arm-fatigue decay.

---

## 5. Clock & Timeouts

### Pseudo-code

```
quarter length  = (2 + op_matchlength) minutes           # option −1/0/1 → 1/2/3 min
timeouts        = clamp(2 + op_matchlength, 2, 3) per half (reset at Q3); overtime → 2

live-ball tick (s_update_game_timer, every step):
  clock runs only while ball is snapped/live; frozen when:
    kicking == 2, timeout_called, down > 4 (scoring/turnover states),
    kickoffs, college OT, ball states {0,1,6,7,8,12,14,15,16,17,20}
    (pre-snap, aim, FG/punt flight, dead-ball), defense holding the ball,
    4th-down carrier still short of the line
  tick period gmlsec = 700 ms real time  → subtract 1 game second
    (× 1.5 → 1050 ms while a carrier runs, on the shortest match length)

between-play runoff (s_subtract_time(min,max) from the drive/commentary sim):
  Tick 1–1s | kickoff 3–5s | CPU-drive stages 7–12 / 10–15 / 5–10s |
  red-zone escape RUN 15–20s, PASS 10–15s | punt 5–10s | FG 4–5s | hail mary 21–22s
  modifiers: goforit → t = 1 + t*0.5 ;  human leading by >7 (and not shortest mode) → t *= 1.5
  the subtract queue drains visually at 1 s per frame (s_update_game_clock);
  s_clear_clock flushes it instantly
```

Note the CPU opponent's drives are **not simulated on the field** — they're the staged text "commentary" sim, and its stage lengths above are the entire defensive time model.

### Evidence (trimmed)

```js
_inst.gmlminutes = 2 + yyInst(...,98).gmlop_matchlength;  _inst.gmlseconds = 0;
```
```js
var gmlsec = 700;
if (ball.gmlstate == 4 && op_matchlength == -1) gmlsec *= 1.5;
if (get_current_time() > _inst.gmlgametimer + gmlsec) {
  _inst.gmlgametimer = get_current_time();
  gml_Script_s_subtract_time(_inst, ball, 1, 1, "Tick");
```
```js
var gmltos = clamp(2 + op_matchlength, 2, 3);
if (quarter == 3) s_set_timeouts(gmltos);
if (quarter == 5) s_set_timeouts(2);
```
```js
// s_subtract_time
var gmltm = irandom_range(argument0, argument1);
if (_inst.gmlgoforit) gmltm = 1 + gmltm*0.5;
else if (argument1 > 1 && humanScore > oppScore + 7 && op_matchlength > -1) gmltm *= 1.5;
_inst.gmltime_subtract += round(gmltm);
```

**Dino Bowl delta**: the 700 ms-per-game-second live tick (≈ 1.43 game-s per real second) and the random 5–20 s dead-time chunks are the two constants that make Retro Bowl's 2-minute quarters feel like full games. Also note the hidden comeback throttle (× 1.5 runoff when the human leads by more than 7).

---

## 6. Coverage AI (`s_aim_AI_defense`, `s_cover_object`, `s_intercept_object`)

```
cover_object(target, f):  steer toward a point 180·f px AHEAD of the target
                          (toward the offense's goal side)  # f = lead factor

DL (6):   jforce = 1, straight at the QB.
S  (9):   backpedal at jforce 0.3; if cover-defense play or a deep WR (pos 4)
          within 80 px → cover_object(WR, f=1) at jforce 0.5.
LB/CB (7/8):
   diff  = clamp(difficulty,1,10)/10          # easy=1.0 (difficulty 7→0.7)
   trail = lerp(10, 40, diff) px              # allowed cushion
   if dist(man) > trail: cover_object(man, lerp(0.25, 0.5, diff)); jforce = 1
   else if man not goalside & not QB: jforce = clamp(dist/20, 0.5, 1)   # eases off!
   else: intercept_object(man)                # true pursuit
intercept_object(target):
   lead = target.speed * dist * 0.5           # frames of prediction
   lead *= 0.5 if |Δy| < 40                   # tighter when level
   aim at target.xy + lengthdir(lead, target.direction), ±2 px y-bias; jforce 1
loose/thrown ball: defenders within 80–100 px of the landing dot converge,
   jforce = clamp(bouncedist/40, 0.25, 0.75)
zone wrinkle: on cover-0 blitz looks, safeties/CBs flip position to 9 based on
   parity of a per-snap random (gmlrandyards % 2) — cheap randomized zone/man mix
```

So the coverage knob is **not** a stat mirror: defender speed comes from `teamDef` accel (§2 table), and *reaction* comes from difficulty-scaled cushion (10–40 px) and lead factor (0.25–0.5 of 180 px). On easy, defenders literally decelerate (`jforce` down to 0.5) when they've caught up to a receiver who isn't goalside.

**Dino Bowl delta**: `game.js` uses risk windows computed per read (`cpuReadBoard`). Retro Bowl's defenders never evaluate the ball in the air until it's thrown (then §1's radius rules apply) — coverage quality only changes *where defenders stand*, never their catch odds. Tuning to Retro: make coverage cushion the difficulty dial and keep INT windows constant.

---

## 7. Condition / Morale Effects In-Match (`s_attribute_buff`, fatigue terms)

```
s_get_attribute(pmap, k) = min(base + buff, 10) where buff (0 or +1):
  skill    +1 if attitude  > 90        # happy players are sharper
  speed    +1 if condition > 99        # only a fully-rested player
  strength +1 if attitude <= 30        # angry players hit harder (!)
  stamina  +1 if attitude <= 15
  buff = 0 if condition < 0 (injured) or co-op mode
condition UI: <= 40 red, <= 60 yellow (s_get_condition_colour)
in-match fatigue (all in s_set_skills_and_skin, i.e. re-rolled every snap):
  throw power: effStr −= stat_attempts · (10 − stamina) · 0.05
  kick power:  effStr −= stat_attempts · (11 − stamina) · 0.2
  carrier accel: yds = clamp(stat_yards + stat_rush_yards, 0, 275)/275
                 yds = lerp(yds·0.99, yds·0.5, stamina·0.1)
                 accel = lerp(accel, accel·0.8, yds)      # up to −20 % after 275 yds
  generic (non-roster) players fade by quarter: accel → ·0.7 (off) / ·0.85 (def) by Q5
```

So condition is binary in-match (only the >99 speed buff), morale is a ±1 stat edge, and the real degradation channel is **usage fatigue vs stamina**.

**Dino Bowl delta**: if Dino Bowl has per-play stamina drain, note Retro Bowl instead decays from *cumulative attempt/yardage counters* with stamina as the resistance stat, recomputed at each snap — nothing decays mid-play.

---

## 8. Kick Meter (`s_update_ball_fieldgoal`, `s_get_kick_direction`, `s_kick_ball`)

Two-stage tap meter: power oscillator → aim oscillator; both speeds scale with kicker `skill`.

```
POWER (stage 0): kickpow ping-pongs 0..55
  rise speed = 1.4 − 0.05 · my_kick_skill  per frame   # skill 10 → 0.9/frame
  fall speed = 5 per frame                             # falling edge is brutal
  meter draws kickpow·2 (0–100), red zone < 30 (kickpow < 15)
AIM (stage 2): marker y ping-pongs 300 ± 100 (kickoff ± 200)
  sweep speed = clamp(9 − kick_skill/3 − (5+difficulty)/5, 3, 9) px/frame
  # skill 10 + easy → 3 px/frame; skill 0 + hard → 9
SHANK: locking power with kickpow < 15 skips aiming;
  direction = ±5° random, with the feeble power
LAUNCH: velocity = (50 + kickpow) · my_kick_power ;  zvel = velocity · 0.4
  my_kick_power = 0.065 + 0.001235 · effStr    (leg fatigue: attempts·(11−stamina)·0.2)
  kick flight: velocity *= 0.9995/frame ; zvel −= 0.03/frame   (vs 0.986/0.08 for passes)
  punts (no placekick holder): velocity *= rnd(0.4, 0.7)
  kickoffs: kickpow < 15 → squib (vel·1.5, zvel·0.5) ; else deep (vel·0.7, zvel+2.2)
WIND: active only while a non-kickoff kick is airborne pre-bounce:
  wind strength 0..9, 8 compass directions (dir·45°)
  wind_force ramps +0.008/frame up to strength; ball.x/y += lengthdir(wind_force, dir·45)
  s_change_wind every so often: irandom(4) → ±1 strength | ±1 direction | nothing
```

Max FG velocity at strength 10: `105 × 0.07735 ≈ 8.12 px/frame` with very low drag — long range comes from the flat 0.03 gravity, not raw speed.

### Evidence (trimmed)

```js
var gmlsp = 1.4 - holder.gmlmy_kick_skill * 0.05;
... case 1: _inst.gmlkickpow += gmlsp; ...
if (_inst.gmlkickpow >= 55) { _inst.gmlkickpow = 55; _inst.gmlkickflip = -_inst.gmlkickflip; }
```
```js
// s_get_kick_direction
var gmlsp = 9 - my_kick_skill/3 - (5 + difficulty)/5;  gmlsp = clamp(gmlsp, 3, 9);
var gmlconewid = 100; if (is_kickoff) { gmlsp = 9; gmlconewid = 200; }
```
```js
if (_inst.gmlkickpow < 15) { _inst.gmldirec = random_range(-5, 5); ... }  // shank
_inst.gmlvelocity = (50 + _inst.gmlkickpow) * holder.gmlmy_kick_power;
_inst.gmlzvel = _inst.gmlvelocity * 0.4;
```
```js
// wind, in flight
wind.gmlwind_force = clamp(wind.gmlwind_force + 0.008, 0, wind.gmlwind);
_inst.x += dcos(wind.gmlwind_dir * 45) * wind.gmlwind_force;
```

**Dino Bowl delta**: `updateKick` uses sine-wave meters (`50+50·sin(t·4.2)`) and a drag-to-kick input. Retro Bowl's meter is a *linear* ping-pong with **asymmetric speeds** (slow rise 0.9–1.4, fast fall 5) and the aim stage is a moving cone marker whose sweep speed is the skill knob. The shank rule (lock in the red = auto-miss with ±5° scatter) and the ramping wind force (starts at 0, grows 0.008/frame — so short kicks barely feel wind, long ones drift late) are the two signature behaviors worth copying.

---

## Round 2 decode (2026-07-28) — the five former unknowns

All five previously-undecoded items were mined from the same export
(`RetroBowl.js.download`, raw.githubusercontent.com/dragon731012/retrobowlworking).
Pretty-printed GML extracts were saved during the session; evidence style as above.

### 9. Presnap defensive alignment (`s_set_position_defense` + `s_choose_defensive_formation`)

Always the same 11 bodies; the per-snap `defensive_cover` roll morphs them.
Base = cover-2 shell: 4 DL at scrim−20 y±18/±36 · 2 OLB scrim−rnd(40..60) y±rnd(40..50) ·
MIKE scrim−80 center · CBs scrim−40 y∓100 (∓140 on a hash) · S scrim−140 y+60 · S scrim−160 y−20.
Cover 0 (blitz): safeties collapse into the box/edge, MIKE bails deep. Cover 1: one
deep-middle S at −180. Cover 3/prevent: OLBs convert to S, soft-quarters CBs at −100
when yards-to-go > 3. 2-pt plays (`down == 6` internally): CBs press to scrim−20.
Every non-DL gets **±10px y-jitter per snap** (`randyards`). Call weights by
down/distance bucket — the signature rows: 2nd-and-short = 70% cover-1 (man lock),
3rd/4th-and-long = blitz-or-prevent (3/4/1/4 over base/blitz/c1/prevent),
2-pt = blitz-heavy (1/5/1/1).

### 10. Route generation (`s_set_position_offense`) — there is NO playbook

Every snap builds one formation and rolls each receiver's route from situational
pools (`choose()` = uniform): fixed personnel QB/RB/5 OL/2 TE-slot/2 WR; RB 50%
beside QB else offset-I; QB 50% under center else dropback path; TE auto-BLOCKS
when the RB lines up on his side. WR pools: hurry-up (last 15s of half) or
>10 to go → slant|post|streak only; outside alignment → hitch/slant/slant2/curl/dig1-3
(+post/streak if scrimmage ≤ 40); slot adds out1-3/comeback (+post/corner/streak);
inside the opp ~10 the deep routes are removed. RB: fb_1..4 (+fb_flat/fb_flat2 in
shotgun). Anti-duplication: two slants/digs/hitches on one snap force a re-roll
from a swap pool. Audibles just re-run the whole roll (community guides confirm).

### 11. `suppress_difficulty` — the rubber-band is a win/loss ladder

Career starts at 10 (easiest). After each franchise match: loss +1, win −1,
win by >14 −1 extra, tie 0. Clamp [−1,10] (widens to [−5,10] once you've won a
Retro Bowl). Seeds `cont.difficulty` only when the difficulty option is "Dynamic";
fixed options override (7/2/−5/−5). UI shows "D" + (16−(5+suppress)) → D1..D16.
Side effects: fan growth −1 below suppress 5 (−2 below 1), CPU sim strength up a
notch below 0, coin-toss possession bias toward the human on dynamic-easy.

### 12. Fumble triggers — ONE call site, two-stage gate, goal-line immunity

The only gameplay `s_drop_ball(true)` lives in `s_set_anim` case 4 (the tackled/
flung anim, which big hits also route through) — fumbles happen only at completed
takedowns. Stage 1 trigger: `irandom(10 − 1 hard − 1 extreme − 2 badWeather) == 0`
(~1-in-11 clear weather), **forced OFF within 5 yds of either goal line**
(x<400 || x>2200 → immune), offense only, never the QB (no sack-fumbles!), never
on kickoffs. Stage 2 security contest: `catching = (skill·10 + attitude)·0.5
(+ career stat_fumbles·50 for non-rookies, + difficulty·2, clamp 1..100)` vs
`irandom_range(−100, 85)`, plus a flat `irandom(49)==0` 2% floor. Net ≈ ~1% per
open-field tackle.

### 13. `gmlintheclear` — a breakaway flag, not a coverage check

`s_is_in_the_clear`: true only for the CURRENT BALL HOLDER with zero opponents
between him and the goal he attacks. Drives the high-step showboat sprite
(goaldist < 40) and commentary. **Correction to §1:** during a pass the ball's
`holder` is −4, so the "uncovered receiver skips the pressure tip" early-out is
dead code in practice — every catch attempt faces the pressure-tip contest.

### Parity candidates from this decode (owner-keeper conflicts flagged)

1. Dynamic difficulty ladder (HIGH, no conflict) — Dino Bowl has only the static
   3-tier DIFFS; add persisted suppress ladder behind a "DYNAMIC" option, mapped
   onto defSpd/catchBonus/cpuThink/simCpuDrive tdP, shown as D1..D16.
2. Fumble parity (HIGH-MED, partial) — goal-line immunity; base roll only on
   completed takedowns (two-stage); career-fumbles hardening; plain sacks never
   fumble. KEEP peanut punch / QB-hunter strip (dino powers = owner keeper).
3. Presnap texture (MED, partial) — ±10px y-jitter per snap; hash-aware CB
   width/depth; source's down&distance call weights inside cpuChooseDef. KEEP
   the defensive play cards themselves.
4. Situational card biasing (MED-LOW) — hurry-up/red-zone route-pool rules bias
   which cards relevantPlays offers. KEEP authored cards (owner keeper).
5. Breakaway showboat flag (LOW, pure presentation) — carrier + nobody goalside
   → high-step anim inside the 20 + commentary line.
