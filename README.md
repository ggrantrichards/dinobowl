# Gridiron — local NFL stat query app

Ask for NFL player-seasons in plain-ish English and get a filtered stat table back.
Runs entirely on your machine, uses free open data, and shows you exactly how it
parsed every query.

**New: 🦖 DINO BOWL** — an 8-bit retro football game (think Retro Bowl, but every
player is a dinosaur) built into the app. Click the **🦖 DINO BOWL** button on the
main page to play in a corner widget while your queries run, or open
`http://127.0.0.1:5000/game` full screen. All 32 NFL teams with their real
latest-season starters (ratings derived from actual stats via `/api/game/teams`).
See [Dino Bowl](#dino-bowl) below.

Example:

> QBs top 10 in passing yards and passing touchdowns with a top 5 lowest
> interception rate who had a playoff game

---

## What it does

- Downloads every player-season from **2000 to the current year** from
  [nflverse](https://github.com/nflverse/nflverse-data) (a free, open,
  community-maintained NFL dataset — CC-BY-4.0) and caches it locally as Parquet.
- Tags whether each player appeared in the **playoffs** that season.
- Precomputes **per-season league ranks** for the major stats, so "top 10 in
  passing yards" means top 10 *that year*.
- Serves a local web UI with a query box and a live "how I read that" read-back.

### Why nflverse and not pro-football-reference / ESPN?

Both PFR and ESPN prohibit scraping in their terms of use and actively block it.
nflverse publishes the same underlying stats as clean, versioned data files, is
free, has no rate limits, and is what most public NFL analytics is built on. If you
ever need a stat nflverse doesn't carry, the fetcher is a single file and easy to
extend.

---

## Setup

Requires Python 3.9+.

```bash
cd gridiron
pip install flask pandas pyarrow requests

# One-time: download & cache all seasons (a few minutes the first time).
python fetch_data.py

# Start the app, then open http://127.0.0.1:5000
python app.py
```

To refresh mid-season with the latest data, run `python fetch_data.py` again
(it only re-downloads the current season plus anything missing). Use
`python fetch_data.py --rebuild` to force a full re-download.

---

## Query grammar

Mix any of these freely in one sentence; multiple stat conditions are ANDed.

| You can say | Meaning |
|---|---|
| `QBs`, `wide receivers`, `RB`, `tight ends` | filter by position |
| `top 10 in passing yards` | league rank ≤ 10 that season |
| `top 10 in passing yards and passing touchdowns` | one rank across several stats |
| `top 3 lowest interception rate` | ascending rank (lower is better) |
| `bottom 5 in interceptions` | ascending rank |
| `led the league in receiving yards` | rank == 1 |
| `over 4000 passing yards`, `at least 30 passing tds` | numeric threshold (≥) |
| `under 10 interceptions`, `fewer than 5 fumbles` | numeric threshold (≤) |
| `who had a playoff game`, `made the playoffs` | appeared in postseason |
| `since 2010`, `before 2015`, `between 2005 and 2012`, `in 2019` | season window |

**Stats available:** passing yards / TDs / attempts / completions / interceptions /
interception rate, rushing yards / TDs / carries, receptions / targets / receiving
yards / TDs, fantasy points (PPR), and **defensive stats**: tackles (combined),
tackles for loss, sacks, interceptions made, passes defended, forced fumbles,
defensive TDs.

**Positions:** all of them — QBs, RBs, FBs, WRs, TEs, O-line (centers/guards/
tackles), defensive tackles / nose tackles, edge rushers / DEs, linebackers
(inside/outside), cornerbacks, safeties, DBs, kickers, punters. Grouped names
work too ("edge rushers" = DE+OLB, "safeties" = S/FS/SAF).

Ranking rules: rank 1 = best. For yards/TDs/receptions etc. that's the highest
value; for interceptions, interception rate, and sacks taken it's the lowest.
Interception-rate ranking requires ≥100 pass attempts to qualify (filters out noise).

---

## Files

- `fetch_data.py` — downloads, caches, flags playoffs, computes ranks → `data/players.parquet`
- `query_engine.py` — the plain-English → pandas-filter parser (no LLM; fully transparent)
- `app.py` — Flask server + JSON API (`POST /api/query {"q": "..."}`)
- `templates/index.html` — the UI

## Gridiron 2.1 — hosted, catch-all stats

Gridiron now runs entirely in the browser, on the same Firebase host as the game:
https://football-dino.web.app/ (the game stays at /game/). No server, no Python at
runtime; the Flask app still serves the identical page locally at http://127.0.0.1:5000/.

Pipeline (run in order after any data refresh):

```bash
python fetch_data.py            # nflverse box score 2000+, PFR advanced 2018+, snap counts 2012+, ESPN QBR 2006+,
                                # Next Gen Stats 2016+, and play-by-play for length/depth counts (20+ yard TDs, deep balls)
python export_gridiron.py       # -> static/gridiron/data.json (table + vocabulary + rank rules; ~22 MB, gzipped on the wire)
python build_gridiron_page.py g9   # -> static/index.html (bump the version token so browsers refetch)
python tests/test_gridiron_parity.py   # the browser engine must match the Python engine on every question:
                                       # same rows, same conditions, same ignored list, same order
firebase deploy --only hosting --project football-dino
```

Every stat is either a nflverse/PFR/NGS/ESPN field as published or a derived rate whose
formula is listed in `fetch_data.DERIVED` and on the page under "Every stat I know".
ESPN's Pass Rush Win Rate / Run Stop Win Rate and per-lineman sacks allowed are not
public data; the page says so and answers with the nearest real stat (pressure rate,
tackles for loss, the QB's sacks taken).

### 2.2 — lengths, playoff results, and a table that fits the monitor (2026-09-10)

- **"20+ yard passing TDs" means the play-by-play bucket**, not "passing TDs ≥ 20". Any
  `N+ yard <stat>` or `<stat> of N or more yards` is rewritten to the 20+/40+ column before
  the numbers are read; other lengths are reported as not counted instead of guessed.
- **Won, not played:** `playoff_wins` (postseason games the player's playoff team won) and
  `super_bowl_wins` (1 in a ring season) come from play-by-play results. "who won a playoff
  game", "won the Super Bowl", "most rings" all resolve; a per-season table cannot hold
  "5 rings", so that asks for ring seasons and the totals panel adds them up per player.
- The results table owns its scrollbars (one above, one below, both always on screen) and
  may use the whole monitor width; the page itself never scrolls sideways.
- **Words mean what the position means:** a cornerback's "interceptions" are the ones he made
  (`def_interceptions`), a quarterback's "sacks" are the ones he took, "touchdowns" are passing /
  rushing / receiving TDs by position and TDs *scored* with no position (`query_engine.POS_SWAP`).
  "at least 4.5" is no longer read as a "least X" ordering. Id-less team-total lines are dropped.
- Click any column header to sort high-to-low, click again to flip; blanks sink to the bottom.
- Light by default, dark on the header toggle (remembered per browser); dark mode has higher
  text contrast on chips and secondary copy. Charts follow the theme.
- **Player pages:** every name links to `#player/<id>` — headshot and bio, a career line, every
  season as one grid with a Career row (counting stats summed, `a / b` rates recomputed from the
  sums). Back returns to the results untouched; the link works on its own.
- No per-player totals panel above the chart any more (owner: not helpful).
- The page scrolls, not the table: no nested vertical scroll; the horizontal scrollbar above the
  table sticks to the top of the viewport so it is reachable anywhere in a long result.
- The Dino Bowl dock is two small round buttons that hide while the panel is open (the panel head
  carries mute / minimise / full screen), so nothing sits over the charts while you scroll.

## Dino Bowl

### Dino Bowl 2.0 (2026-09-09)

A presentation and UX release; gameplay is untouched. New season hub (team colours,
mascot, next-opponent matchup, staff, form, 17-week schedule, tappable actions),
rebuilt team select (legible tiles, mascot + OVR panel, matchup panel), a proper FINAL
scoreboard card, division-panel standings with a playoff line, a season-aware front
door, a CROWD VOLUME setting, a PERFECT kick payoff, favicon / theme-color / share
tags, and three long-open product bugs (TD yards on the post-game card, ceremonial
beats killable on frame 1, crowd above the action). Details in ROADMAP.md → "DINO
BOWL 2.0".

An 8-bit, canvas-rendered American football game in the spirit of Retro Bowl —
except the Cretaceous never ended. Every position is its own species:

| Pos | Dino | Pos | Dino |
|---|---|---|---|
| QB | Troodon | DT | Stegosaurus |
| RB | Carnotaurus | EDGE | Allosaurus |
| FB | Pachycephalosaurus | LB | Spinosaurus |
| WR | Velociraptor | CB | Deinonychus |
| TE | Deinocheirus | S | Quetzalcoatlus (it can **soar**) |
| OL | Triceratops | | + rampaging T-rex form |

Press **G** on the title screen to meet the herd.

**Game modes** (main menu): **Exhibition** (any matchup), **2-Player Versus**
(you vs a friend on one screen — control follows possession; whoever has the ball
plays offense while the CPU runs the other team's defense, and the game prompts
you to pass the device when possession changes), **Practice** (a no-clock sandbox
to drill passing, running, laterals, peanut punches, flight, and RAMPAGE — press
**P** to switch between the offense and defense drill), **Season** (17 games,
simulated league, division standings, 7-seed playoffs, the DINO BOWL), and
**Career** — create your own dino, take the timed **DINOLICK**, run the combine
drills, get drafted, and level up through your rookie season.

**Pregame hype screen** shows both teams' starters (position, name, overall),
the weather/time/stadium, and each team's ★ **RAMPAGER** — the franchise's real
star, who carries a signature **passive ability** in-character with their NFL
counterpart (e.g. Josh Allen → *Howitzer Arm*, Derrick-Henry-style backs →
*Truckstick*, Myles Garrett → *QB Hunter*, Chris Jones → *Immovable*, Sauce
Gardner → *Ballhawk*, Justin Jefferson → *Afterburner*…). Only that one apex dino
per team can trigger RAMPAGE.

**10 offensive and 10 defensive playcalls**, and the call sheet surfaces the **4
most relevant** for the situation — runs and the QB sneak show up on short
yardage and at the goal line, deep shots on 3rd-and-long, blitzes and goal-line
fronts vs the run, Prevent late when protecting a lead. Card 4 on offense is
always your team's famous signature play.

**Plays on every device.** On **Mac/Windows** use mouse + keyboard. On
**iPhone/iPad** the game is touch-native: a left-thumb joystick to run, drag the
right side to aim passes, and on-screen buttons for snap, juke, dive, punch,
soar, lateral, and rampage. The field scales responsively to any screen.

### Online multiplayer + hosting

**Online Versus** is now built in. One player hosts a room and shares the link;
the host controls Team A and the guest controls Team B on its possessions. The
host remains authoritative and streams the rendered game state through Firebase
Realtime Database, so both players see the same ball, clock, weather, and calls.

To enable it, create a Firebase project with **Anonymous Authentication** and a
**Realtime Database**, then provide the web-app configuration as a JSON environment
variable. Firebase web configuration is public; the included database rules use the
anonymous authenticated UID to make only the room creator able to write frames.

```bash
# Paste the full config from Firebase Console → Project settings → Your apps.
# The API key is a public web identifier; do not put an Admin SDK private key here.
export FIREBASE_WEB_CONFIG='{"apiKey":"REPLACE_WITH_YOUR_WEB_API_KEY","authDomain":"football-dino.firebaseapp.com","databaseURL":"https://football-dino-default-rtdb.firebaseio.com","projectId":"football-dino","storageBucket":"football-dino.firebasestorage.app","messagingSenderId":"891658875263","appId":"1:891658875263:web:194c3617fd1d733559ea4a"}'
python app.py
```

For a no-billing deployment, Firebase Hosting serves a fully static Dino Bowl at
`/game/`; Firebase Realtime Database supplies online rooms. It uses balanced
generic rosters unless you later generate `static/game/teams.json` from the local
NFL data. Deploy it with:

```bash
firebase login
firebase deploy --only database,hosting
```

After deployment, open `/game`, choose **ONLINE VERSUS**, select the matchup, and
share the generated URL. Before deploying, enable **Anonymous** in Firebase Console → Authentication →
Sign-in method, and create the default Realtime Database instance in Firebase
Console → Realtime Database. The public web config in `static/firebase-config.js`
is required by browser Firebase SDKs; it is not an Admin SDK secret.

- **Real NFL teams & players.** Rosters and ratings are built from the latest
  season in your `players.parquet` (top passers, rushers, receivers, kickers per
  team; percentile-normalized into speed / hands / arm / accuracy ratings).
- **Four downs** to cross the yellow first-down line; punts, field goals with a
  two-stage power/accuracy meter, extra points, safeties, quarters, halftime, OT.
- **Aim your passes**: hold left-click to aim — a dotted arc previews the ball's
  trajectory and landing spot; drag further to throw deeper; release to lob it
  over defenders. Press **Space / right-click while aiming** for a fast, flat
  **bullet pass** (riskier through traffic).
- **Run game**: WASD to run and scramble, **Shift** to juke defenders,
  **E** to dive, **X** to throw the ball away.
- **Play both sides**: on defense you control the ▼ dino (Tab to switch,
  Space to dive tackle) while the CPU quarterback reads coverage.
- **Audibles**: Q/E at the line to change the play before the snap.
- **Weather**: clear, rain (slick ball, fumbles) or snow (heavy legs), plus wind
  that bends long passes and kicks.
- **Laterals**: press **Q** while running to pitch the ball backward to a
  trailing teammate — it's a live ball if dropped. The flea-flicker and
  hook-and-lateral signature plays are built on it.
- **Signature plays**: every franchise carries one famous call on its sheet —
  the Philly Special, Beast Quake, Music City Miracle, Minneapolis Miracle,
  Immaculate Reception, the Tush Push…
- **APEX RAMPAGE** 🦖: each team has ONE apex dino (Josh Allen types, bell-cow
  backs, or a monster edge rusher — sometimes your rampager plays *defense*).
  Fill the meter, press **R**, and they become a giant tackle-shedding
  (or sack-forcing, ball-punching) T-rex.
- **Peanut punch**: on defense, jump (or soar) first, then press **F** near
  the carrier to swat at the ball midair. Quetzalcoatlus safeties press **F**
  in space to soar in a straight line and erase breakaways.
- **Two-point conversions**, coin-flip openings, safeties, OT.
- **Instant replay** of touchdowns and turnovers, slow-mo and letterboxed.
- **Stadiums**: all 32 parks parameterized — domes (no weather inside), seeded
  city skylines, day/dusk/night with stadium lights, home-crowd colors.
- **Atmosphere**: a crowd that roars louder in close 4th quarters, snowball-
  throwing fans in snow games (hits make dinos cold, blue, and slower; Iceman
  Caleb Williams is immune), puddle splashes, and rain TD celebrations.
- **Stats**: full box score (press **B**), per-player season stats in season
  mode, difficulty levels (Hatchling/Veteran/Apex) and a persistent all-time
  record. There are pterodactyl flyovers and an all-dinosaur crowd, obviously.

Files: `templates/game.html`, `static/game/sprites.js` (pixel-art engine),
`static/game/game.js` (game logic), plus the `/game` route and `/api/game/teams`
roster endpoint in `app.py`. No extra dependencies.

## Notes & limits

- The parser is rule-based and transparent by design — the read-back panel always
  shows how your sentence compiled, so you can catch a misread. It won't understand
  arbitrary phrasing; stick to the grammar above.
- "Top N" uses per-season ranks over players who recorded that stat, so a WR with
  zero pass attempts never ranks in passing categories.
- Not affiliated with the NFL. Data © nflverse contributors under CC-BY-4.0.
