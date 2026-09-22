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

**New: 📺 WATCH** — the round 📺 button beside the 🦖 in the bottom-right corner opens
this week's NFL games in a pop-up player (full screen with ⛶). NFL only: see
[Gridiron g22](#gridiron-g22-2026-09-22--watch-nfl-games-only).

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

## Gridiron 3.0 — 2026-09-10

Twenty UI/UX items, all shipped in one page build (g11): windowed grid, the question and
sort in the URL, zero-row explanations with one-click relax, coverage notes, frozen identity
columns, autocomplete, an editable read-back (change a number, × a clause), column chooser and
per-game toggle, player-page tabs with click-to-chart, header hover cards, load progress,
Copy CSV / Copy link, phone layout, league leaders in bold, sort persistence, scatter axis
pickers with row↔dot hover, one type scale, light/dark/auto theme, "did you mean", keyboard.
The engine gained `apply(conds)` / `queryConds()` so edited readings re-run without re-parsing;
parity with the Python engine is unchanged (58/58). The standard the page is held to, and the
next measurable steps (split data file, team words, compare view, print), are in
[GRIDIRON_3.md](GRIDIRON_3.md).

## Gridiron 2.1 — hosted, catch-all stats

Gridiron now runs entirely in the browser, on the same Firebase host as the game:
https://football-dino.web.app/ (the game stays at /game/). No server, no Python at
runtime; the Flask app still serves the identical page locally at http://127.0.0.1:5000/.

Pipeline (run in order after any data refresh):

```bash
python fetch_data.py            # nflverse box score 2000+, PFR advanced 2018+, snap counts 2012+, ESPN QBR 2006+,
                                # Next Gen Stats 2016+, and play-by-play for length/depth counts (20+ yard TDs, deep balls)
python export_gridiron.py       # -> static/gridiron/data.json (table + vocabulary + rank rules; ~22 MB, gzipped on the wire)
python build_gridiron_page.py g19  # -> static/index.html (bump the version token so browsers refetch)
python build_games.py           # -> data/games.parquet  (nflverse weekly stats, one row per player-game)
python export_games.py         # -> static/gridiron/games.json (~43 MB, fetched only when a question asks about a game)
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
- Click any column header (results grid and player grid alike) to sort high-to-low, click again to
  flip; the header fills and the column tints; blanks sink to the bottom.
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

### Gridiron g22 (2026-09-22) — 📺 Watch, NFL games only

A 📺 button now sits in the corner dock next to the 🦖 and links this site to
[UnderDog Live](https://underdog-nfl-media.web.app/). One click opens a pop-up with this
week's slate (live games first, then kickoffs, then finals). **▶ Watch** plays the game in
the panel, and **⛶ full screen** fills the screen (on an iPhone it fills the window). Each
stream has source and feed buttons for when one goes down, and **UnderDog ↗** opens the
full site with chat and picks.

- **NFL only, by construction.** The list *is* ESPN's NFL scoreboard
  (`site.api.espn.com/.../football/nfl/scoreboard`). A stream from the feed UnderDog uses
  (`streamed.pk/api/matches/american-football`) attaches to a game only when its two sides
  are exactly that game's two teams ("Arizona Cardinals", "Cardinals", "ARI", "LA Rams") and
  it starts within 12 hours of kickoff. "Louisville Cardinals vs Pittsburgh Panthers" and
  "NFL PrimeTime" never match.
- Only `https:` embed URLs go into the player. On phones the player is sandboxed, as it is
  on UnderDog, to block the embeds' pop-up ads.
- Opening Watch minimises Dino Bowl, and opening Dino Bowl closes Watch. Closing Watch
  unloads the stream. The dock hides while either panel is open.

### Gridiron g19 (2026-09-14) — the headshots came back

Player faces had stopped appearing. The URLs were unchanged and the images still served, but
the league now stores those headshots as **4 to 6 MB originals a few thousand pixels wide**,
and the table draws them at 28px. Seventy-eight rows is roughly 400 MB of images for one
answer, so the browser queued them and they never arrived.

The host is Cloudinary, so the page now asks for the size it actually draws: `w_96,c_fill,g_face`
in the table and `w_256` on a player page. 3 KB each instead of 5 MB, and the URLs that do not
match the pattern are left alone. Verified: 78 of 78 faces load, none fail.

### Gridiron g18 (2026-09-14) — per-game lines

"QBs with a game with 350+ total yards, 4+ total TDs, 70%+ completion, and 0 ints and 0 fumbles"
now works. A row in the main table is one **season**, so questions about one afternoon needed a
second table: `build_games.py` pulls nflverse weekly stats, which come from the same release as
the season files with the same column names, so `STAT_COLS` renames them and **every alias,
display name and position swap works unchanged on a game line**. 420,734 player-games, 2000 to
now, lines with no production dropped.

The file is 43 MB and is fetched **only when a question actually asks about a game**, so the
ordinary visitor never pays for it. Columns whose encoding is mostly one value (a quarterback
has no tackles) now store that value once and list only the rows that differ, which halved it.

What makes a question per-game: "a game with", "games with", "in one game", "single game", and
"a 200 yard game". Note "per game" is still a season rate, not a game line.

Three parser faults that query exposed, both engines:

- **"70%+ completion"** read as seventy completions. A percent on a count now means the rate that
  count feeds (completions → completion %, receptions → catch %, FG made → FG %).
- **"0 ints"** read as "≥ 0", which is every game ever played. A bare zero on a count is now an
  exact zero. Yardage keeps the floor reading, since it can go negative.
- **"total touchdowns"** for a QB read as passing TDs only, missing a QB with 3 passing and 1
  rushing. "Total touchdowns" is now everything he accounted for (`tds_accounted`, passing +
  rushing + receiving + returns); the bare word "touchdowns" still means the kind his position
  scores, and without a position the ones he put in the end zone himself.

Also: two game lines by the same player in the same season used to tie on every identity column,
so their order was whatever the table happened to hold. The week settles it and the id settles the
rest, in both engines. Parity 94/94 across both grains.

 — an edge rusher is a usage, not a label

"Edge rushers with 10+ sacks in 2025" returned 8 of the real 16, missing Brian Burns, Micah
Parsons, Nik Bonitto, Tuli Tuipulotu, Byron Young, Josh Sweat, Al-Quadin Muhammad and Cameron
Jordan. The alias mapped to the position codes `DE` and `OLB`, and nflverse files most modern
3-4 outside rushers as plain **LB** — while filing genuine off-ball linebackers like Lavonte
David as **OLB**. The label cannot answer the question in either direction.

`fetch_data.edge_flag` now derives an `is_edge` column per player-season. A DE or DL is an edge
by label; a linebacker earns it by how he was used that season, best evidence first:

1. PFR pressures above coverage targets (2018+),
2. else (sacks + QB hits) per defensive snap ≥ 0.025 (2012+),
3. else sacks per tackle ≥ 0.08 for the older seasons with neither.

Checked against the 2025 board: all eight LB-filed edge rushers flagged, and none of Roquan
Smith, Fred Warner, Bobby Wagner, Zack Baun, Demario Davis or Lavonte David. Interior linemen
stay out — Jeffery Simmons and his 11 sacks are a DT, not an edge. The position condition
gained an optional `flag`, honoured by both engines and emitted by both parsers. Parity 87/87.

Known difference from ESPN-style sources: `games` counts seasons games with a recorded stat
line, so a defender who played but recorded nothing is not counted (Danielle Hunter reads 16,
ESPN 17).

### Gridiron g16 (2026-09-12) — season or career, decided by the span

"The most deep pass TDs since 2021" was answering with the best single season. A row in this
table is one season, so "most X" needs a reading, and the span decides it:

| Question | Reading |
|---|---|
| most X **in 2024** | that season — nothing to decide |
| most X **since 2021** | **career** — the matched seasons added up |
| most X **in a season** since 2021 | the best single line ("single season", "best season", "per season" all work) |
| **over 4000** X since 2021 | a threshold is always per season |
| **top 10** by X since 2021 | a rank is always per season |

Rates are **rebuilt from the totals**, never averaged: yards per attempt over four years is
total yards / total attempts, passer rating is recomputed from the summed attempts,
completions, yards, touchdowns and interceptions. `fetch_data.RATE_PARTS` says what each rate
is made of (read out of `DERIVED` where the formula is `a / b`, hand-written for the rest); a
rate with no parts to rebuild from — QBR, CPOE, Next Gen — stays on season lines and says so
rather than averaging four numbers and calling it a career. Rebuilt rates keep their
qualifying minimum, scaled to the span (14 attempts per scheduled game, so 2021-2025 needs
1,190). Career rows sum counting stats, take the longest for `fg_long`, drop what cannot be
added (a salary, a year), show the span in the season column, and count "players".

Also: **rate leaderboards now qualify**. Sorting by a rate on season lines used to put a
two-game backup on top of "best QBR since 2021"; seasons under the minimum now sit below the
ones above it, and the page keeps the engine's order instead of re-sorting it away. And the
engine's reading notes (career totals, rebuilt rate, qualifier) finally **render** — they ride
in their own `readNotes` field so the clause pills stay index-aligned with their × buttons.

Parity 83/83 (ten new questions). The summable-column list and the rate parts are computed
once and shipped in `meta`, so both engines read the identical lists.

### Gridiron g15 (2026-09-11) — rings go to the men who played, and "most" means a career

Owner: "QBs sorted by Super Bowl wins since 2000" showed Kenny Pickett, Chad Henne and Nate
Sudfeld with a ring each and every row reading 1. Two faults.

- **Credit.** Postseason wins and Super Bowls were credited by roster. Now a QB / RB / FB / WR /
  TE is credited with the playoff wins he took part in (a pass, a carry or a target, from
  play-by-play), and a QB gets the Super Bowl only as the winner's primary passer in that game —
  Nick Foles has 2017, Nate Sudfeld does not. Backs and receivers need a touch in the game.
  Linemen, defenders and specialists stay by roster, which is all the play-by-play can see of
  them. Cached per season in `data/cache/postgames_<year>.json`.
- **Career totals.** "most Super Bowl wins", "most playoff wins", "3+ rings" now answer with one
  row per player: the matched seasons added up, identity from the latest one, the season column
  showing the span (`2001–2019`), counting stats summed and rate columns dropped. The count line
  says "players · career totals". Both engines; the parity test compares the career rows too.
- Parity 73/73 (five new questions).

### Gridiron g14 (2026-09-11) — total yards is the sum, and contracts

- **Total yards.** "total yards", "all-purpose yards", "yards from scrimmage" always mean
  passing + rushing + receiving (a back's rushing + receiving, a QB's passing + rushing). The
  bare word "yards" still means the position's own yards ("RBs with 1500 yards" = rushing),
  and without a position it means the sum. Before, "total yards" was hijacked by that swap.
- **Contracts.** Over The Cap data via nflverse, spread over the seasons each deal covers (an
  extension replaces the old deal from its first season): `contract_apy` ($M per year),
  `contract_value`, `contract_guaranteed`, `contract_cap_pct`, `contract_years`,
  `contract_signed`. Ask "QBs making over $40 million a year in 2024", "the highest paid RBs
  in 2025", "WRs with a contract over 25 million per year since 2020". Money reads in
  millions ("$40M", "40 million", "40 mil"). Complete from 2011; `contract_apy` is in every
  position's default columns. 27,732 contract-seasons.
- Parity 68/68 (seven new questions). Pipeline: fetch_data (contracts cached at
  `data/cache/contracts.parquet`) → export → page g14.

### Gridiron g13 (2026-09-11) — a back's yards per attempt are carries

"RBs with over 1000 rushing yards in 2025 and over 4.7 yards/carry" read the slash form as
plain "yards" (so rushing yards > 4.7), and "yards per attempt" went to the passing column,
which a running back only has when he threw a pass — 19 seasons all-time, none in 2025.
New aliases (`yards/carry`, `yards/rush`, `yards a carry`, `rushing yards per attempt`, ...)
and two position swaps: for RB / FB, `yards per attempt` → yards/carry and `attempts` →
carries. Both engines; parity 61/61.

### Dino Bowl 2.6 (2026-09-14) — online is a match, not a relay race

Two faults, both reported by the owner, both in the same place.

- **The host picked both teams.** Each player now picks his own on his own board.
  The guest's choice goes to the room and the host starts the game when both are in;
  if you both want the same jersey the guest is nudged, not refused.
- **The players took turns on offense.** Whoever had the ball played, and the other one
  watched the CPU run his defense. Now the man without the ball **is** the defense: he
  calls the front, drives a dino, and the two seats swap when possession does.

How it works: the host still simulates everything, but an `actor` names the side whose
input is being served, so one set of handlers feeds both players. Each human has his own
seat (`G.ctrl.A` / `G.ctrl.B`), his own keyboard and his own pointer, and every dino moves
on *his owner's* sticks. Two questions that used to be one are now separate — whether the
offense is human-driven at all (so the CPU stays off it) and whether **this** player is the
one attacking (what the controls and the HUD need). Your dino wears the gold chevron and
the other player's wears a dim blue one.

Also: the realtime-database rules gained the `guestTeam` key, and a refused write now says
so instead of leaving the host waiting forever.

Verified two-origin in Chrome: both boards, both picks, then a live snap with the host on
the quarterback and the guest on the free safety. The guest's key moved his safety 50px and
the host's quarterback not at all. 12 Node suites green, the online suite up from 22 to 35.

 — no forward pass past the line; THE KING, AA pass

- **Rule.** The frame a carrier crosses the line of scrimmage he loses the throw and any
  half-drawn aim is cancelled ("PAST THE LINE"); both throw functions refuse a forward pass
  from past the line even if something else slipped through. Scenario: crossing clears
  `canPass` and the aim; a forced bullet never leaves his hands.
- **THE KING.** Shaded skull (highlights on the crown, shadow under the cheeks, two-tone teeth,
  a tongue when the mouth opens), pupils that follow you along the wall, eased rise, a rear-back
  before the bite and a snap-down / slow recovery, the claw slides then slams, every strike
  kicks dust off the parapet and leaves a crack, footballs spin and trail, a damage ghost on the
  HP bar, the crit tag pops. All dt-based.

### Dino Bowl 2.5 (2026-09-11) — THE KING, a real catch meter, a bigger playbook

- **Catch meter, second pass.** The bar shows only for players who can play the ball: the
  intended receiver, or a CB / S, within ~6 yards of the landing spot. No more bar under an
  edge rusher. The CPU now times its own leap through the same door (`timedJump`): each
  contester picks a press time around the green window with rating-scaled error, so it gets
  PERFECT / GOOD / EARLY the same way you do, and its bar draws dimmer under him so you can
  see why the corner won the ball. Replaces two flat arrival dice.
- **HB option / sweep pass.** Behind the line, a back who can still throw steers freely
  (back, sideways, forward) instead of auto-churning; hands off, he jogs forward. Past the
  line the normal carrier model resumes. Only on plays flagged `hbPass`.
- **QB scrambles.** No more step from 90% pocket legs to full stride the frame he crosses
  the line: a one-second build, and the running back's hole-burst no longer applies to QBs.
- **Playbook.** 12 more offensive calls (SMASH, Y CROSS, LEVELS, STICK, DOUBLE POST, TE SEAM,
  HB WHEEL, GO BALLS, SPOT, HB COUNTER, HB OPTION, HB TOSS) and 6 defensive (COVER 1 ROBBER,
  COVER 6, DIME DROP, FIRE ZONE, BEAR FRONT, MAN PRESS), all from the route / flag vocabulary
  the engine already runs. The sheet is **sampled** by score instead of sliced: the same
  down-and-distance no longer hands you the same four cards, plays on the last few sheets are
  penalised, and a sheet always mixes run and pass (short yardage included).
- **THE KING, second cut (owner: the perspective).** You stand on top of the stadium wall with
  your back to the camera; only the King's head and neck clear the parapet, the body is outside.
  Detailed pixel head (brow spikes, burning eyes, two rows of teeth, a jaw that opens), the
  football shrinks as it climbs to the face, open mouth or an eye counts double. He BITES (the
  head drops onto your lane) and SWIPES (a claw comes over the wall on one side and slams your
  lane); both telegraph a red lane on the wall for ~0.9 s. 16 HP, 3 hearts, 32 s.
- **THE KING, first cut.** One halftime in ten, instead of a mascot game, a giant T-rex looms top-left
  and roars. Mouse aims, click / space throws footballs (head = double damage), A / D slides
  you out of the red chomp lane. Three hearts, thirty seconds, 14 HP. Scare him off and the
  rampage meter is fed.
- **Rampage.** The meter glows gold and pulses when full, and the ★ apex dino's eyes glow red
  until he goes.
- **First visit.** After the cold open, the first ENTER opens the how-to-play pages once
  (ENTER = next, ESC = skip; it stays under TUTORIAL). Two new pages: THE CATCH METER and
  GAMEDAY. Only a flag is written; seasons, careers and records are untouched.

Also fixed: the Gridiron `data.json` 404 — the 2.4 deploy ran from the repo root, where the
gitignored 24 MB table does not exist. Hosting deploys run from the worktree that has it.

Token `dinobowl-2-5-20260911`; title reads V2.5. 12 Node suites green; new 32-check scenario
(tutorial gate, 14+ distinct plays over 40 snaps, every sheet mixed, passes on 3rd & 2, no bar
for an edge, bar for a CB, CPU leap stamps `jumpAt` and grades by the same rule, QB ramp, option
back steers backward, THE KING headshot 2 / body 1 / chomp costs a heart / dodge / win).

### Dino Bowl 2.4 (2026-09-11) — GAMEDAY: weather with a clock, a catch meter

Presentation only; no weather modifier, speed, catch or kick number moves during a game.
Everything is derived from quarter + clock (already streamed online), so a guest's field
matches the host's.

- **Dynamic snow.** A snow game starts as a dusting and the field is white by the fourth
  quarter: turf colour, yard-line/number/hash paint and the mow grain all fade under the cover,
  snow banks build along the sidelines. The field sheet repaints twelve times a game, not per frame.
- **Cleat prints and turf scars.** Moving players leave prints in snow (slush early, packed grey
  late) and mud in rain; every whistle on a tackle/sack/flatten, and every cut, catch and juke,
  leaves a scar for a minute. Two bounded lists (220 prints, 60 scars), never streamed.
- **Frozen breath** below 35°F outdoors; drifts with the wind.
- **Dusk games end under the lights.** Sky, sun, stars, skyline and windows slide from dusk to
  night over the four quarters; the light masts fade in from the second quarter.
- **Rain in bands** (0.4x–1.5x, minutes apart) and puddles that grow and multiply (14 → 20) as
  the game goes on; splashes use the same puddle list the field draws.
- **Wind pennants** on both uprights: direction and strength at a glance before a kick.
- **Catch meter.** When the ball is up and you control the receiver (or a defender), a bar under
  him shows the jump window in Madden's colours — red = more than 0.6 s early, yellow = 0.35–0.6 s,
  green = inside 0.35 s — with a cursor running with the flight. Jump and it freezes where you
  pressed and calls it: PERFECT! / GOOD / EARLY!. The zones are `timedJump`'s own numbers; the
  verdict is read off the player's flags, which are streamed, so an online guest sees the host's
  call. Every throw now clears the last throw's flags for every player (defenders kept stale ones
  across plays before).

Cache-bust token `dinobowl-2-4-20260911`; title reads V2.4. Node suites all green plus a
26-check GAMEDAY scenario (snow steps 3 → 12, sky dusk|0 → dusk|16, puddles 14 → 20, modifiers
pinned, meter grades at 0.78 / 0.5 / 0.2 s).

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
