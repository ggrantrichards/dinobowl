# Gridiron 3.0 — the UI/UX bar, and what it takes to clear it

Written 2026-09-10 for the owner. Two parts: what shipped in the 3.0 build (so the list
in ROADMAP.md is closed out honestly), then the design standard the page should be held to
from here — the things that separate a reference tool people come back to from a demo that
answers questions. Nothing here is a feature that needs new data. It is all about how the
existing data reaches the eye and the hand.

## Part 1 — shipped in 3.0 (build g11)

| # | Item | What it does now |
|---|---|---|
| 1 | Windowed table | 150 rows render; the rest stream in as the sentinel scrolls into view (observer + a plain scroll fallback). A "N of M rows shown · show all" line sits under the grid. |
| 2 | State in the URL | `?q=…&sort=col:dir` plus `#player/<id>`. Refresh keeps the answer, back/forward walk questions, a result can be sent. |
| 3 | Zero rows explained | Names the clause that empties it, how many seasons match without it, the best value among those, and a one-click **Drop that clause**. |
| 4 | Coverage notes | A stat charted from 2018 asked "since 2010" says so under the reading. |
| 5 | Frozen columns | Headshot, Yr, Player, Pos stick while the grid scrolls sideways; offsets are measured, not guessed. |
| 6 | Autocomplete | From the alias table (positions, stats, phrases); arrows, Enter/Tab, Esc; `/` focuses the box. Articles in front ("a pres") do not hide the match. |
| 7 | Editable reading | Numbers in the read-back are editable in place; × drops a clause; both re-run without re-parsing. |
| 8 | Columns + per game | A column chooser remembered per position group on the browser; per-game divides counting stats by games. |
| 9 | Player page tabs | Passing / Rushing & receiving / Defense / Advanced / Kicking / Bio, gated by whether the player actually played that family; clicking a header charts that stat. |
| 10 | Hover cards | Definition, formula, source and coverage year on every header. |
| 11 | Progress | A real progress bar while the 24 MB table loads. **Not done:** splitting the data file into a hot core and an on-demand advanced shard — that is a pipeline change and is the next performance step. |
| 12 | Copy CSV / Copy link | On the results toolbar. |
| 13 | Phones | Below 640px the grid shows the key columns with an **All columns** toggle; header and controls reflow. |
| 14 | League leaders | The season's best value in a column is bold with a marker (rate stats honour the qualifying minimum). |
| 15 | Sort persists | Across questions when the column still exists, and lives in the URL. |
| 16 | Scatter | Axis pickers; hovering a row lights its dot; clicking a dot opens the player. |
| 17 | Type/spacing | One scale (11 / 12 / 13 / 15 / 17 / 22 / 34), 32px controls, one radius, visible focus rings. |
| 18 | Theme | Light → Dark → Auto (follows the OS), remembered. |
| 19 | Did you mean | An unreadable clause offers the nearest stat name; one click replaces it and re-runs. |
| 20 | Keyboard | `/` focus, Esc closes menus and blurs, arrows in autocomplete, everything focusable. |

Parity between the browser engine and the Python engine is unchanged (58/58); the page
only gained an `apply(conds)` seam so it can re-run edited conditions.

## Part 2 — the standard: what "next level" means here

The reference is Pro Football Reference: dense, legible, fast, boring in the best way.
The goal is that plus the one thing PFR does not have — a question box that reads
English — without the question box ever making the table worse. Everything below is
measured against three questions: *can I find it, can I trust it, can I keep going.*

### 2.1 Information architecture — one page, three states, no dead ends

- **Three states only:** asking, reading a result, reading a player. Every control belongs
  to exactly one state and is hidden in the others. Nothing floats over the data (the dock
  hides while its panel is open; that rule extends to anything new).
- **The reading is the contract.** "How I read that" is not a caption, it is the filter
  panel. Every clause is a thing you can change or remove, and the result updates in
  place. The typed sentence is one way to author the filters; the pills are the other.
- **Nothing silent.** Every word the parser drops is shown in red with a suggestion.
  Every stat with partial coverage says so next to the clause that uses it. Every empty
  result names the clause that emptied it and what the best real value was.
- **Player pages are the leaves.** Every name is a link. A player page is a header, a
  chart, tabs, and a grid with a Career row. Back always returns to the exact result.

### 2.2 The grid — the product

- **Density:** 12.5–13px numerals, 6px vertical padding, hairline rules both ways.
  Zebra at 1.5% and hover at ~7% tint, never louder. Text left, numbers right, tabular
  figures. The grid should look like a printed table, not a card list.
- **Orientation never lost:** frozen identity columns (Yr, Player, Pos) on the left, the
  horizontal scrollbar above the table stuck to the viewport, the sorted column tinted
  and its header filled. On a 1920px monitor the grid may use the full width even though
  the copy above stays at 1180px.
- **Sorting is the primary interaction.** One click high-to-low, one more to flip, arrow
  on the header, aria-sort set, blanks always last, the sort surviving a new question.
- **Leaders are visible.** The season's best in each column is bold with a dot, so a
  league-leading season is obvious without a second query. Rates honour the minimum.
- **Scale honestly.** The grid is windowed so 2,000 rows never stutter, and it tells you
  how many are shown. If a question matches 5,000 seasons the count says 5,000 and offers
  the first 2,000, with the answer to "which 2,000?" being the sort.

### 2.3 The question box — the only novel part, so the most restrained

- Autocomplete offers the vocabulary the engine will accept, not free text. Three types:
  position, stat, phrase. Eight items max, keyboard first.
- Examples are real questions that show the grammar (position, threshold, rank, range,
  ordering, playoff result). They live under the box, not in a wall.
- The box never blocks: Enter runs, Shift+Enter is a newline, `/` focuses from anywhere,
  Esc leaves.
- Errors are sentences with a fix attached, never a stack trace or a bare count.

### 2.4 Type, colour, surface

- Two families: Oswald for the wordmark, the count, and player names; Inter for
  everything read; IBM Plex Mono for numbers, codes, keys and hints. No third face.
- One scale: 11, 12, 13, 15, 17, 22, 34. One control height: 32px. One radius.
- Colour is for meaning only: accent for the active thing (sorted header, selected tab,
  primary button, links), the second accent for warnings, the danger colour for what could
  not be read. Never decorative gradients, never colour-coded pills by kind.
- Contrast: body text ≥ 12:1 in both themes, secondary text ≥ 7:1, measured by computed
  colour, not by eye. Light is the default; dark is a choice; auto follows the machine.

### 2.5 Speed as a feature

- First answer target: under 3 s on a normal connection. Today the table is one 24 MB
  JSON (≈4 MB gzipped). The next step is a hot core (identity + the ~60 columns any
  position's defaults use) and an on-demand advanced shard, fetched the first time a
  question or a column chooser needs it. The page already has the progress bar and the
  seam (`loadTable`) for it.
- Interactions under 100 ms: sorting, editing a clause, switching a tab, toggling per
  game. All are in-memory today; keep them that way (no re-parse on edit — done).
- Nothing animates except the results rising 8px on arrival, and that respects
  `prefers-reduced-motion`.

### 2.6 Accessibility and input

- Every control reachable by keyboard with a visible ring; tables carry `aria-sort`;
  the autocomplete is a listbox; the read-back's × has a label.
- Hover cards duplicate nothing you cannot get by clicking (they explain, they do not gate).
- Touch: the phone layout shows key columns, 44px targets on tabs and toolbar, no hover-
  only affordances (the ⇅ hint on headers is a hint, not the only signal).

### 2.7 What "done" looks like for the next pass

In order, each one measurable:

1. Split data file; first answer under 3 s cold, under 1 s warm (measure with the
   Performance panel; write the number in the README).
2. Team pages? No. But team **filters** — "Lions QBs since 2020" — are vocabulary, not a
   feature, and the engine already has the team column. Add the words.
3. A "compare" view is the one addition worth considering later: two player pages side by
   side, same tabs, same grid. It is still just the existing grid twice.
4. A print stylesheet: the grid on paper, frozen columns unfrozen, no chrome. Cheap and
   exactly what a reference page should do.

Anything else — accounts, comments, projections, badges, "insights" — is not this
product. The page answers a question about real seasons, shows the table, and gets out of
the way.
