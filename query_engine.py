# """
# Gridiron — query engine.

# Turns human-ish queries into filters over the player-season table. It is a small,
# transparent rule parser (not an LLM): every query compiles to a list of
# human-readable conditions plus a pandas mask, and the app shows you exactly how it
# read your sentence so you can trust (or correct) the result.

# Supported grammar, mixed freely in one sentence:
#   position         "QBs", "quarterbacks", "wide receivers", "RB", "TE", ...
#   top-N / bottom-N "top 10 in passing yards", "top 3 lowest interception rate",
#                    "bottom 5 in interceptions"
#   thresholds       "over 4000 passing yards", "at least 30 passing tds",
#                    "under 10 interceptions", "more than 100 receptions"
#   playoffs         "who had a playoff game", "made the playoffs", "in the playoffs"
#   season window    "since 2010", "before 2015", "between 2005 and 2012", "in 2019"
#   led the league   "led the league in passing yards"  (== top 1)

# Multiple stat conditions joined by "and"/commas are ANDed together.
# """
# import re

# # Friendly stat phrases -> column stem. Longest phrases first so "passing yards"
# # wins over a bare "yards", etc.
# STAT_ALIASES = [
#     ("passing yards", "passing_yards"),
#     ("pass yards", "passing_yards"),
#     ("passing touchdowns", "passing_tds"),
#     ("passing tds", "passing_tds"),
#     ("pass tds", "passing_tds"),
#     ("passing td", "passing_tds"),
#     ("total touchdowns", "total_tds"),
#     ("total tds", "total_tds"),
#     ("total td", "total_tds"),
#     ("combined touchdowns", "total_tds"),
#     ("combined tds", "total_tds"),
#     ("interception rate", "int_rate"),
#     ("interception percentage", "int_rate"),
#     ("interception percent", "int_rate"),
#     ("int rate", "int_rate"),
#     ("int percentage", "int_rate"),
#     ("int percent", "int_rate"),
#     ("interceptions", "interceptions"),
#     ("interception", "interceptions"),
#     ("ints", "interceptions"),
#     ("pass attempts", "pass_attempts"),
#     ("passing attempts", "pass_attempts"),
#     ("attempts", "pass_attempts"),
#     ("completion percentage", "completion_pct"),
#     ("completion percent", "completion_pct"),
#     ("completion pct", "completion_pct"),
#     ("comp percentage", "completion_pct"),
#     ("comp percent", "completion_pct"),
#     ("comp pct", "completion_pct"),
#     ("completions", "completions"),
#     ("rushing yards", "rushing_yards"),
#     ("rush yards", "rushing_yards"),
#     ("rushing touchdowns", "rushing_tds"),
#     ("rushing tds", "rushing_tds"),
#     ("rush tds", "rushing_tds"),
#     ("carries", "carries"),
#     ("receiving yards", "receiving_yards"),
#     ("rec yards", "receiving_yards"),
#     ("receiving touchdowns", "receiving_tds"),
#     ("receiving touchdown", "receiving_tds"),
#     ("caught a touchdown", "receiving_tds"),
#     ("receiving tds", "receiving_tds"),
#     ("rec tds", "receiving_tds"),
#     ("receptions", "receptions"),
#     ("caught a td", "receiving_tds"),
#     ("catches", "receptions"),
#     ("targets", "targets"),
#     ("sacks taken", "sacks_taken"),
#     ("fantasy points", "fantasy_ppr"),
#     ("fantasy", "fantasy_ppr"),
#     ("age", "age"),
#     ("years old", "age"),
# ]

# POSITIONS = {
#     "qb": "QB", "qbs": "QB", "quarterback": "QB", "quarterbacks": "QB",
#     "rb": "RB", "rbs": "RB", "running back": "RB", "running backs": "RB",
#     "halfback": "RB", "halfbacks": "RB",
#     "wr": "WR", "wrs": "WR", "wide receiver": "WR", "wide receivers": "WR",
#     "receiver": "WR", "receivers": "WR",
#     "te": "TE", "tes": "TE", "tight end": "TE", "tight ends": "TE",
# }

# DISPLAY = {
#     "passing_yards": "passing yards", "passing_tds": "passing TDs",
#     "interceptions": "interceptions", "int_rate": "interception rate",
#     "pass_attempts": "pass attempts", "completions": "completions",
#     "completion_pct": "completion %", "total_tds": "TDs scored",
#     "rushing_yards": "rushing yards", "rushing_tds": "rushing TDs",
#     "carries": "carries", "receiving_yards": "receiving yards",
#     "receiving_tds": "receiving TDs", "receptions": "receptions",
#     "targets": "targets", "sacks_taken": "sacks taken", "fantasy_ppr": "fantasy pts (PPR)",
#     "age": "age",
# }
# # Stats where "lowest/fewest" is the good direction.
# ASCENDING_GOOD = {"interceptions", "int_rate", "sacks_taken"}
# PCT_STATS = {"completion_pct", "int_rate"}

# class QueryError(Exception):
#     pass


# def _find_stat(text, start=0):
#     """Return (column, end_index) for the first stat alias appearing at/after start."""
#     best = None
#     for phrase, col in STAT_ALIASES:
#         idx = text.find(phrase, start)
#         if idx != -1 and (best is None or idx < best[1]):
#             best = (col, idx, idx + len(phrase))
#     return best


# def parse(query):
#     """Parse into a list of condition dicts + a list of human-readable descriptions."""
#     q = " " + query.lower().strip() + " "
#     conds, notes = [], []

#     # --- position ---
#     for word in sorted(POSITIONS, key=len, reverse=True):
#         if re.search(rf"\b{re.escape(word)}\b", q):
#             pos = POSITIONS[word]
#             conds.append({"kind": "position", "value": pos})
#             notes.append(f"position is {pos}")
#             break

#     # --- season window ---
#     m = re.search(r"between (\d{4}) and (\d{4})", q)
#     if m:
#         a, b = int(m.group(1)), int(m.group(2))
#         conds.append({"kind": "season_range", "min": min(a, b), "max": max(a, b)})
#         notes.append(f"season between {min(a,b)} and {max(a,b)}")
#     else:
#         m = re.search(r"since (\d{4})", q)
#         if m:
#             conds.append({"kind": "season_range", "min": int(m.group(1)), "max": None})
#             notes.append(f"season since {m.group(1)}")
#         m = re.search(r"before (\d{4})", q)
#         if m:
#             conds.append({"kind": "season_range", "min": None, "max": int(m.group(1)) - 1})
#             notes.append(f"season before {m.group(1)}")
#         m = re.search(r"\bin (\d{4})\b", q)
#         if m:
#             yr = int(m.group(1))
#             conds.append({"kind": "season_range", "min": yr, "max": yr})
#             notes.append(f"season is {yr}")

#     # --- playoffs ---
#     if re.search(r"playoff|postseason", q):
#         conds.append({"kind": "playoffs"})
#         notes.append("appeared in the playoffs that season")

#     # --- led the league (top 1) ---
#     for mm in re.finditer(r"led the league in ", q):
#         st = _find_stat(q, mm.end())
#         if st:
#             col = st[0]
#             conds.append({"kind": "rank", "col": col, "n": 1,
#                           "asc": col in ASCENDING_GOOD})
#             notes.append(f"led the league in {DISPLAY.get(col, col)}")

#     # --- top-N / bottom-N ranks ---
#     # A single "top N" can distribute across several stats joined by "and"/commas,
#     # e.g. "top 10 in passing yards and passing touchdowns". We scan forward from
#     # the number, collecting stats until we hit the next rank/threshold keyword.
#     rank_starts = [m.start() for m in re.finditer(r"(top|bottom)\s+\d+", q)]
#     for mm in re.finditer(r"(top|bottom)\s+(\d+)", q):
#         direction, n = mm.group(1), int(mm.group(2))
#         # window runs until the next rank clause or a threshold word.
#         nxt = min([s for s in rank_starts if s > mm.start()] + [len(q)])
#         stop = nxt
#         tm = re.search(r"\b(over|more than|at least|above|under|less than|fewer than|"
#                                r"below|at most|who|since|before|between|led|for|on)\b|\d",
#                                q[mm.end():nxt])
#         if tm:
#             stop = mm.end() + tm.start()
#         window = q[mm.end():stop]
#         # find every stat mention in the window
#         pos = 0
#         found_any = False
#         while True:
#             st = _find_stat(window, pos)
#             if not st:
#                 break
#             col, s_start, s_end = st
#             pre = window[:s_start]
#             wants_low = ("lowest" in pre or "fewest" in pre
#                          or direction == "bottom" or col in ASCENDING_GOOD)
#             conds.append({"kind": "rank", "col": col, "n": n, "asc": wants_low})
#             arrow = "lowest" if wants_low else "highest"
#             word = ("bottom" if direction == "bottom" and col not in ASCENDING_GOOD
#                     else "top")
#             notes.append(f"{word} {n} in {DISPLAY.get(col, col)} ({arrow})")
#             pos = s_end
#             found_any = True
#         if not found_any:
#             continue

#     # --- numeric thresholds ---
#     thresh_pat = (r"(over|more than|at least|above|under|less than|fewer than|below|"
#                   r"at most)\s+([\d,\.]+)")
#     for mm in re.finditer(thresh_pat, q):
#         op_word, num = mm.group(1), float(mm.group(2).replace(",", ""))
#         window = q[mm.end():mm.end() + 40]
#         st = _find_stat(window, 0)
#         if not st:
#             continue
#         col = st[0]

#         # Determine exact operator
#         if op_word in ("over", "more than", "above"):
#             op = ">"
#         elif op_word == "at least":
#             op = ">="
#         elif op_word in ("under", "less than", "fewer than", "below"):
#             op = "<"
#         elif op_word == "at most":
#             op = "<="

#         conds.append({"kind": "threshold", "col": col, "op": op, "value": num})
#         notes.append(f"{DISPLAY[col]} {op} {num:g}")

#     # thresholds phrased as "30 or more total tds", "10 or fewer interceptions", "30+ tds"
#     post_pat = r"([\d,\.]+)\s*(\+|or more|or fewer|or less|or higher|or lower)\s*(%|percent)?"
#     for mm in re.finditer(post_pat, q):
#         num = float(mm.group(1).replace(",", ""))
#         phrase = mm.group(2)
#         is_pct = bool(mm.group(3))
#         gte = phrase in ("+", "or more", "or higher")
#         window = q[mm.end():mm.end() + 45]
#         cut = re.search(r"\b(and|over|more than|at least|above|under|less than|"
#                         r"fewer than|below|at most|who|top|bottom|since|before|"
#                         r"between|led|for|on)\b", window)
#         stat_window = window[:cut.start()] if cut else window
#         st = _find_stat(stat_window, 0)
#         if not st:
#             continue
#         col = st[0]
#         if is_pct or col in PCT_STATS:
#             num = num / 100.0 if num > 1 else num
#         conds.append({"kind": "threshold", "col": col, "op": ">=" if gte else "<=",
#                       "value": num})
#         shown = f"{num*100:g}%" if col in PCT_STATS else f"{num:g}"
#         notes.append(f"{DISPLAY.get(col, col)} {'≥' if gte else '≤'} {shown}")

#     if not conds:
#         raise QueryError(
#             "I couldn't find anything to filter on. Try naming a position, a stat "
#             "with 'top N', a threshold like 'over 4000 passing yards', or 'playoffs'.")
#     return conds, notes


# def run(df, query):
#     """Apply a parsed query to the dataframe. Returns (result_df, notes)."""
#     conds, notes = parse(query)
#     mask = df.index == df.index  # all True

#     for c in conds:
#         if c["kind"] == "position":
#             mask &= (df["position"] == c["value"])
#         elif c["kind"] == "playoffs":
#             mask &= df["made_playoffs"].fillna(False)
#         elif c["kind"] == "season_range":
#             if c["min"] is not None:
#                 mask &= df["season"] >= c["min"]
#             if c["max"] is not None:
#                 mask &= df["season"] <= c["max"]
#         elif c["kind"] == "threshold":
#             col = c["col"]
#             if col not in df:
#                 raise QueryError(f"I don't have a '{DISPLAY.get(col, col)}' column.")
#             # Handle strict vs inclusive operators
#             series = df[col].fillna(-1 if ">" in c["op"] else float("inf"))
#             if c["op"] == ">=": mask &= (series >= c["value"])
#             elif c["op"] == ">": mask &= (series > c["value"])
#             elif c["op"] == "<=": mask &= (series <= c["value"])
#             elif c["op"] == "<": mask &= (series < c["value"])

#         elif c["kind"] == "rank":
#             col = c["col"]
#             is_natively_asc = col in ASCENDING_GOOD

#             # If the user is asking for the natural "best" direction, use precomputed ranks
#             if c["asc"] == is_natively_asc:
#                 rank_col = f"{col}_rank"
#                 if rank_col not in df:
#                     raise QueryError(f"I can't rank on '{DISPLAY.get(col, col)}'.")
#                 mask &= df[rank_col].notna() & (df[rank_col] <= c["n"])
#             else:
#                 # User asked for "bottom N" on a good stat, or "top N" on a bad stat.
#                 # Compute rank dynamically over valid (non-zero) entries.
#                 valid_mask = df[col].fillna(0) > 0
#                 dyn_rank = df.loc[valid_mask, col].rank(ascending=c["asc"], method="min")
#                 # Align the dynamic rank series with the main dataframe index
#                 aligned_rank = dyn_rank.reindex(df.index)
#                 mask &= aligned_rank.notna() & (aligned_rank <= c["n"])

#     res = df[mask].copy()
#     return res, notes


# # Columns worth showing in results, in order.
# RESULT_COLS = ["season", "player_display_name", "position", "recent_team", "games",
#                "made_playoffs", "passing_yards", "passing_tds", "completions",
#                "completion_pct", "interceptions", "int_rate", "rushing_yards",
#                "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
#                "total_tds", "fantasy_ppr", "age"]
# PCT_STATS = {'completion_pct', 'int_rate'}
"""
Gridiron — query engine.
"""
import math
import re
import pandas as pd
from rapidfuzz import process, fuzz, utils

pd.set_option('future.no_silent_downcasting', True)

# ORDER MATTERS: _find_stat takes the alias that starts EARLIEST in the text,
# and on a tie the one listed FIRST. So every phrase must appear before any
# shorter phrase it begins with ("sack percentage" before "sack", "passer
# rating allowed" before "passer rating", "pressure rate" before "pressures").
# The catch-all stats block (2.1) sits at the top for exactly that reason.
STAT_ALIASES = [
    # ---- canonical names written by the length rewrite in parse()
    ("twentyplus yard td passes", "pass_td_20"), ("fortyplus yard td passes", "pass_td_40"),
    ("twentyplus yard td runs", "rush_td_20"), ("fortyplus yard td runs", "rush_td_40"),
    ("twentyplus yard td catches", "rec_td_20"), ("fortyplus yard td catches", "rec_td_40"),
    ("twentyplus yard completions", "pass_20_plus"), ("fortyplus yard completions", "pass_40_plus"),
    ("twentyplus yard runs", "rush_20_plus"), ("fortyplus yard runs", "rush_40_plus"),
    ("twentyplus yard catches", "rec_20_plus"), ("fortyplus yard catches", "rec_40_plus"),
    # ---- postseason results
    ("playoff wins", "playoff_wins"), ("postseason wins", "playoff_wins"), ("playoff victories", "playoff_wins"),
    ("super bowl wins", "super_bowl_wins"), ("super bowl victories", "super_bowl_wins"),
    ("super bowl titles", "super_bowl_wins"), ("super bowl rings", "super_bowl_wins"),
    ("super bowls won", "super_bowl_wins"), ("rings", "super_bowl_wins"),
    # ---- big plays by LENGTH (play-by-play) and DEPTH (20+ air yards)
    ("deep passing touchdowns", "pass_td_20"), ("deep pass touchdowns", "pass_td_20"),
    ("deep touchdown passes", "pass_td_20"), ("deep passing tds", "pass_td_20"),
    ("deep pass tds", "pass_td_20"), ("deep td passes", "pass_td_20"),
    ("long touchdown passes", "pass_td_20"), ("long td passes", "pass_td_20"),
    ("bomb touchdowns", "pass_td_40"), ("bomb tds", "pass_td_40"),
    ("deep ball completion percentage", "deep_cmp_pct"), ("deep completion percentage", "deep_cmp_pct"),
    ("deep ball accuracy", "deep_cmp_pct"),
    ("deep ball attempts", "deep_att"), ("deep attempts", "deep_att"),
    ("deep ball completions", "deep_cmp"), ("deep completions", "deep_cmp"),
    ("deep ball yards", "deep_yards"), ("deep pass yards", "deep_yards"),
    ("deep ball touchdowns", "deep_td"), ("deep ball tds", "deep_td"),
    ("deep ball interceptions", "deep_int"), ("deep interceptions", "deep_int"),
    ("deep receiving touchdowns", "deep_rec_td"), ("deep receiving tds", "deep_rec_td"),
    ("deep receiving yards", "deep_rec_yards"), ("deep targets", "deep_targets"),
    ("deep receptions", "deep_recs"), ("deep catches", "deep_recs"),
    ("long receiving touchdowns", "rec_td_20"), ("long receiving tds", "rec_td_20"),
    ("long rushing touchdowns", "rush_td_20"), ("long rushing tds", "rush_td_20"),
    ("explosive completions", "pass_20_plus"), ("big completions", "pass_20_plus"),
    ("explosive runs", "rush_20_plus"), ("long runs", "rush_20_plus"), ("breakaway runs", "rush_40_plus"),
    ("explosive catches", "rec_20_plus"), ("long catches", "rec_20_plus"),
    # ---- efficiency: EPA, CPOE, QBR, passer rating
    ("passing epa per play", "pass_epa_per_play"), ("epa per dropback", "pass_epa_per_play"),
    ("passing epa per dropback", "pass_epa_per_play"), ("epa per pass play", "pass_epa_per_play"),
    ("rushing epa per carry", "rush_epa_per_carry"), ("epa per carry", "rush_epa_per_carry"),
    ("epa per rush", "rush_epa_per_carry"), ("receiving epa per target", "rec_epa_per_target"),
    ("epa per target", "rec_epa_per_target"), ("epa per play", "epa_per_play"), ("epa/play", "epa_per_play"),
    ("passing epa", "pass_epa"), ("pass epa", "pass_epa"), ("rushing epa", "rush_epa"), ("rush epa", "rush_epa"),
    ("receiving epa", "rec_epa"), ("rec epa", "rec_epa"), ("epa", "epa_per_play"),
    ("ngs cpoe", "cpoe_ngs"), ("completion percentage over expected", "cpoe"),
    ("completion percentage above expectation", "cpoe"), ("completion % over expected", "cpoe"), ("cpoe", "cpoe"),
    ("expected completion percentage", "xcomp_pct"), ("expected completion %", "xcomp_pct"),
    ("total qbr", "qbr"), ("espn qbr", "qbr"), ("qbr", "qbr"),
    ("passer rating allowed", "cov_rating"), ("rating allowed", "cov_rating"),
    ("passer rating", "passer_rating"), ("qb rating", "passer_rating"), ("quarterback rating", "passer_rating"),
    # ---- per-attempt / per-game rates
    ("passing yards per game", "pass_ypg"), ("pass yards per game", "pass_ypg"), ("passing yards/game", "pass_ypg"),
    ("rushing yards per game", "rush_ypg"), ("rush yards per game", "rush_ypg"),
    ("receiving yards per game", "rec_ypg"), ("rec yards per game", "rec_ypg"),
    ("yards per game", "total_ypg"), ("yards/game", "total_ypg"), ("y/g", "total_ypg"), ("ypg", "total_ypg"),
    ("yards per attempt", "ypa"), ("yards/attempt", "ypa"), ("y/a", "ypa"), ("ypa", "ypa"),
    ("yards per carry", "ypc"), ("yards per rush", "ypc"), ("y/c", "ypc"), ("ypc", "ypc"),
    ("yards/carry", "ypc"), ("yards/rush", "ypc"), ("yards a carry", "ypc"), ("yards per rushing attempt", "ypc"),
    ("rushing yards per attempt", "ypc"), ("rushing yards per carry", "ypc"),
    ("yards per reception", "ypr"), ("yards per catch", "ypr"), ("y/r", "ypr"), ("ypr", "ypr"),
    ("catch percentage", "catch_pct"), ("catch rate", "catch_pct"), ("catch pct", "catch_pct"), ("catch %", "catch_pct"),
    ("touchdown percentage", "td_pct"), ("td percentage", "td_pct"), ("td rate", "td_pct"), ("td%", "td_pct"), ("td %", "td_pct"),
    ("contract value", "contract_value"), ("total contract", "contract_value"), ("contract total", "contract_value"),
    ("guaranteed money", "contract_guaranteed"), ("guaranteed", "contract_guaranteed"),
    ("percent of the cap", "contract_cap_pct"), ("percentage of the cap", "contract_cap_pct"), ("cap percentage", "contract_cap_pct"),
    ("cap hit", "contract_cap_pct"), ("cap %", "contract_cap_pct"),
    ("contract years", "contract_years"), ("contract length", "contract_years"), ("year deal", "contract_years"), ("year contract", "contract_years"),
    ("contract signed", "contract_signed"), ("signed in", "contract_signed"),
    ("average per year", "contract_apy"), ("average annual value", "contract_apy"), ("annual value", "contract_apy"),
    ("annual salary", "contract_apy"), ("salary per year", "contract_apy"), ("per year salary", "contract_apy"),
    ("contract per year", "contract_apy"), ("contract apy", "contract_apy"), ("apy", "contract_apy"), ("aav", "contract_apy"),
    ("salary", "contract_apy"), ("paid", "contract_apy"), ("making", "contract_apy"), ("earning", "contract_apy"), ("earns", "contract_apy"),
    ("a year", "contract_apy"), ("per year", "contract_apy"), ("contract", "contract_apy"),
    ("total yards", "total_yards"), ("yards from scrimmage", "total_yards"), ("scrimmage yards", "total_yards"),
    ("all-purpose yards", "total_yards"),
    # ---- sacks, ball security
    ("sack percentage", "sack_pct"), ("sack rate", "sack_pct"), ("sack pct", "sack_pct"), ("sack%", "sack_pct"),
    ("sack %", "sack_pct"), ("sk%", "sack_pct"), ("sk %", "sack_pct"),
    ("sack to blitz ratio", "sack_per_blitz"), ("sacks per blitz", "sack_per_blitz"), ("sack-to-blitz", "sack_per_blitz"),
    ("sack yards lost", "sack_yards_lost"), ("sacks allowed", "sacks_taken"), ("times sacked", "sacks_taken"),
    ("sacks taken", "sacks_taken"), ("sacks suffered", "sacks_taken"), ("sacked", "sacks_taken"),
    ("sacks caused", "sacks"), ("sack yards", "sack_yards"),
    ("turnover percentage", "turnover_pct"), ("turnover rate", "turnover_pct"), ("turnover pct", "turnover_pct"),
    ("turnover%", "turnover_pct"), ("turnover %", "turnover_pct"), ("to%", "turnover_pct"),
    ("turnovers", "turnovers"), ("giveaways", "turnovers"),
    ("fumbles lost", "fumbles_lost"), ("lost fumbles", "fumbles_lost"),
    ("fumble recoveries", "fumble_recoveries"), ("fumbles recovered", "fumble_recoveries"), ("recovered fumbles", "fumble_recoveries"),
    ("fr", "fumble_recoveries"), ("forced fumbles", "forced_fumbles"), ("fumbles forced", "forced_fumbles"), ("ff", "forced_fumbles"),
    ("fumbles", "fumbles"), ("fumble", "fumbles"),
    ("int%", "int_rate"), ("int %", "int_rate"),
    # ---- pass rush, pressure, blitz (PFR advanced + snap counts)
    ("pass rush win rate", "pressure_rate"), ("pass-rush win rate", "pressure_rate"), ("prwr", "pressure_rate"),
    ("run stop win rate", "tackles_for_loss"), ("run defense win rate", "tackles_for_loss"), ("rswr", "tackles_for_loss"),
    ("pressure rate", "pressure_rate"), ("pressure percentage", "pressure_rate"), ("pressure pct", "pressure_rate"),
    ("pressure%", "pressure_rate"), ("pressure %", "pressure_rate"), ("pressures per snap", "pressure_rate"),
    ("pressures", "pressures"), ("pressure", "pressures"),
    ("blitz percentage", "blitz_pct"), ("blitz rate", "blitz_pct"), ("blitz pct", "blitz_pct"), ("blitz%", "blitz_pct"),
    ("blitz %", "blitz_pct"), ("blitzes", "blitzes"), ("blitz", "blitzes"),
    ("times blitzed", "times_blitzed"), ("blitzed", "times_blitzed"),
    ("pressured percentage", "pressured_pct"), ("pressure faced", "pressured_pct"), ("pressured rate", "pressured_pct"),
    ("times pressured", "times_pressured"), ("pressured", "times_pressured"),
    ("times hurried", "times_hurried"), ("hurries", "hurries"), ("hurry", "hurries"),
    ("qb hit rate", "qb_hit_rate"), ("quarterback hit rate", "qb_hit_rate"),
    ("qb hits", "qb_hits"), ("quarterback hits", "qb_hits"), ("times hit", "times_hit"),
    ("qb knockdowns", "qb_knockdowns"), ("knockdowns", "qb_knockdowns"),
    ("pocket time", "pocket_time"), ("time to throw", "time_to_throw"), ("time-to-throw", "time_to_throw"),
    ("aggressiveness", "aggressiveness"), ("throwaways", "throwaways"), ("scrambles", "scrambles"),
    ("bad throw percentage", "bad_throw_pct"), ("bad throw rate", "bad_throw_pct"), ("bad throws", "bad_throws"),
    ("on target percentage", "on_target_pct"), ("on-target percentage", "on_target_pct"), ("on target rate", "on_target_pct"),
    ("intended air yards per attempt", "iay_per_att"), ("air yards to the sticks", "air_yards_to_sticks"),
    ("air yards to sticks", "air_yards_to_sticks"),
    # ---- coverage, tackling (PFR advanced)
    ("completion percentage allowed", "cov_cmp_pct"), ("completion % allowed", "cov_cmp_pct"), ("cmp% allowed", "cov_cmp_pct"),
    ("yards allowed", "cov_yards"), ("touchdowns allowed", "cov_tds"), ("tds allowed", "cov_tds"),
    ("completions allowed", "cov_completions"), ("targets as nearest defender", "cov_targets"), ("coverage targets", "cov_targets"),
    ("times targeted", "cov_targets"), ("missed tackle percentage", "missed_tackle_pct"), ("missed tackle rate", "missed_tackle_pct"),
    ("missed tackles", "missed_tackles"), ("solo tackles", "tackles_solo"), ("tackles per game", "tackles_per_game"),
    ("tfl yards", "tfl_yards"), ("interception yards", "def_int_yards"), ("int yards", "def_int_yards"),
    ("defensive safeties", "safeties"), ("safeties scored", "safeties"),
    ("defensive snaps", "def_snaps"), ("offensive snaps", "off_snaps"), ("special teams snaps", "st_snaps"), ("snaps", "def_snaps"),
    # ---- receiving / rushing tracking (NGS, PFR)
    ("yards after catch above expectation", "yac_oe"), ("yac over expected", "yac_oe"), ("yac above expectation", "yac_oe"),
    ("yards after catch", "rec_yac"), ("yac", "rec_yac"), ("yards before contact per attempt", "ybc_per_att"),
    ("yards before contact", "ybc_per_att"), ("yards after contact per attempt", "yac_per_att"), ("yards after contact", "yac_per_att"),
    ("broken tackles", "broken_tackles_rush"), ("separation", "separation"), ("cushion", "cushion"),
    ("average depth of target", "adot"), ("adot", "adot"), ("drop percentage", "drop_pct"), ("drop rate", "drop_pct"),
    ("drop pct", "drop_pct"), ("drops", "drops"), ("dropped passes", "drops"),
    ("rush yards over expected per attempt", "ryoe_per_att"), ("ryoe per attempt", "ryoe_per_att"), ("ryoe/att", "ryoe_per_att"),
    ("rush yards over expected", "ryoe"), ("rushing yards over expected", "ryoe"), ("ryoe", "ryoe"),
    ("rush percentage over expected", "rush_pct_oe"), ("stacked box rate", "stacked_box_pct"), ("eight defenders in the box", "stacked_box_pct"),
    ("rushing efficiency", "rush_efficiency"), ("time to line of scrimmage", "time_to_los"), ("time to los", "time_to_los"),
    ("passing air yards", "pass_air_yards"), ("receiving air yards", "rec_air_yards"), ("air yards share", "air_yards_share"),
    ("intended air yards", "rec_iay"), ("target share", "target_share"), ("wopr", "wopr"), ("racr", "racr"), ("pacr", "pacr"),
    ("passing first downs", "pass_first_downs"), ("rushing first downs", "rush_first_downs"), ("receiving first downs", "rec_first_downs"),
    # ---- special teams, misc
    ("field goal percentage", "fg_pct"), ("fg percentage", "fg_pct"), ("fg%", "fg_pct"), ("fg %", "fg_pct"),
    ("field goals made", "fg_made"), ("field goals", "fg_made"), ("fgm", "fg_made"), ("field goal attempts", "fg_att"),
    ("long field goal", "fg_long"), ("longest field goal", "fg_long"), ("extra points", "pat_made"), ("pats", "pat_made"),
    ("punts inside the 20", "punts_inside_20"), ("punts inside 20", "punts_inside_20"), ("punt yards", "punt_yards"), ("punts", "punts"),
    ("punt return yards", "punt_return_yards"), ("punt returns", "punt_returns"),
    ("kick return yards", "kickoff_return_yards"), ("kickoff return yards", "kickoff_return_yards"), ("kick returns", "kickoff_returns"),
    ("return touchdowns", "special_teams_tds"), ("special teams touchdowns", "special_teams_tds"), ("return tds", "special_teams_tds"),
    ("penalty yards", "penalty_yards"), ("penalties", "penalties"),
    ("games played", "games"), ("games", "games"),
    ("standard fantasy points", "fantasy_std"), ("fantasy points standard", "fantasy_std"),
    # ---- defensive touchdowns split, coverage counting stats
    ("interception return touchdowns", "int_tds"), ("interception return tds", "int_tds"), ("pick sixes", "int_tds"),
    ("pick-sixes", "int_tds"), ("int tds", "int_tds"), ("inttd", "int_tds"), ("int td", "int_tds"),
    ("fumble return touchdowns", "fumble_rec_tds"), ("fumble return tds", "fumble_rec_tds"), ("frtd", "fumble_rec_tds"),
    ("fumble recovery touchdowns", "fumble_rec_tds"), ("interceptions plus passes defended", "int_plus_pd"),
    ("ints plus pds", "int_plus_pd"), ("ball production", "int_plus_pd"),
    ("pd", "passes_defended"), ("pds", "passes_defended"), ("passes defensed", "passes_defended"),
    # ---- bio
    ("height", "height"), ("tall", "height"), ("weight", "weight"), ("weigh", "weight"), ("pounds", "weight"), ("lbs", "weight"),
    ("draft round", "draft_round"), ("round drafted", "draft_round"), ("draft pick", "draft_pick"), ("overall pick", "draft_pick"),
    ("draft year", "draft_year"), ("drafted in", "draft_year"), ("years of experience", "experience"), ("experience", "experience"),
    ("seasons played", "experience"), ("rookie season", "rookie_season"),
    # ---- the originals
    ("passing yards", "passing_yards"), ("pass yards", "passing_yards"),
    ("passing touchdowns", "passing_tds"), ("passing tds", "passing_tds"),
    ("pass tds", "passing_tds"), ("passing td", "passing_tds"),
    ("total touchdowns", "total_tds"), ("total tds", "total_tds"),
    ("total td", "total_tds"), ("combined touchdowns", "total_tds"),
    ("combined tds", "total_tds"), ("interception rate", "int_rate"),
    ("interception percentage", "int_rate"), ("interception percent", "int_rate"),
    ("int rate", "int_rate"), ("int percentage", "int_rate"),
    ("int percent", "int_rate"), ("interceptions", "interceptions"),
    ("interception", "interceptions"), ("ints", "interceptions"),
    ("pass attempts", "pass_attempts"), ("passing attempts", "pass_attempts"),
    ("attempts", "pass_attempts"), ("completion percentage", "completion_pct"),
    ("completion percent", "completion_pct"), ("completion pct", "completion_pct"),
    ("comp percentage", "completion_pct"), ("comp percent", "completion_pct"),
    ("comp pct", "completion_pct"), ("completions", "completions"),
    ("rushing yards", "rushing_yards"), ("rush yards", "rushing_yards"),
    ("rushing touchdowns", "rushing_tds"), ("rushing tds", "rushing_tds"),
    ("rush tds", "rushing_tds"), ("carries", "carries"),
    ("receiving yards", "receiving_yards"), ("rec yards", "receiving_yards"),
    ("receiving touchdowns", "receiving_tds"), ("receiving touchdown", "receiving_tds"),
    ("caught a touchdown", "receiving_tds"), ("receiving tds", "receiving_tds"),
    ("rec tds", "receiving_tds"), ("receptions", "receptions"),
    ("caught a td", "receiving_tds"), ("catches", "receptions"),
    ("targets", "targets"), ("sacks taken", "sacks_taken"),
    ("fantasy points", "fantasy_ppr"), ("fantasy", "fantasy_ppr"),
    ("age", "age"), ("years old", "age"),
    # defensive stats — longer phrases first so they win ties at the same index
    ("tackles for loss", "tackles_for_loss"), ("tfl", "tackles_for_loss"),
    ("tackles", "tackles"), ("tackle", "tackles"),
    ("sacks", "sacks"), ("sack", "sacks"),
    ("interceptions made", "def_interceptions"), ("ints made", "def_interceptions"),
    ("defensive interceptions", "def_interceptions"), ("picks", "def_interceptions"),
    ("passes defended", "passes_defended"), ("pass deflections", "passes_defended"),
    ("pass breakups", "passes_defended"), ("pbus", "passes_defended"),
    ("forced fumbles", "forced_fumbles"), ("fumbles forced", "forced_fumbles"),
    ("defensive touchdowns", "def_tds"), ("defensive tds", "def_tds"),
    # ---- generic words, resolved by position in _find_stat (POS_SWAP)
    ("touchdowns", "total_tds"), ("tds", "total_tds"), ("yards", "any_yards"),
]

# word/phrase -> (list of raw position codes in the data, friendly label)
def _pos(codes, label, flag=None):
    # `flag` narrows the codes by a derived column - "edge rusher" is the one
    # group the position label cannot answer on its own (see fetch_data.edge_flag)
    return {"codes": codes, "label": label, "flag": flag}

# An edge rusher is a USAGE, not a label: nflverse files most 3-4 outside
# rushers as plain LB and some off-ball linebackers as OLB, so the codes are
# wide and fetch_data.edge_flag decides who actually rushed.
_EDGE = {"codes": ["DE", "DL", "LB", "OLB", "ILB", "MLB"], "label": "edge rusher", "flag": "is_edge"}

POSITIONS = {
    "qb": _pos(["QB"], "QB"), "qbs": _pos(["QB"], "QB"),
    "quarterback": _pos(["QB"], "QB"), "quarterbacks": _pos(["QB"], "QB"),
    "rb": _pos(["RB"], "RB"), "rbs": _pos(["RB"], "RB"),
    "running back": _pos(["RB"], "RB"), "running backs": _pos(["RB"], "RB"),
    "halfback": _pos(["RB"], "RB"), "halfbacks": _pos(["RB"], "RB"),
    "fb": _pos(["FB"], "FB"), "fullback": _pos(["FB"], "FB"), "fullbacks": _pos(["FB"], "FB"),
    "wr": _pos(["WR"], "WR"), "wrs": _pos(["WR"], "WR"),
    "wide receiver": _pos(["WR"], "WR"), "wide receivers": _pos(["WR"], "WR"),
    "receiver": _pos(["WR"], "WR"), "receivers": _pos(["WR"], "WR"),
    "te": _pos(["TE"], "TE"), "tes": _pos(["TE"], "TE"),
    "tight end": _pos(["TE"], "TE"), "tight ends": _pos(["TE"], "TE"),
    # defense
    "cb": _pos(["CB", "DB"], "CB"), "cbs": _pos(["CB", "DB"], "CB"),
    "cornerback": _pos(["CB", "DB"], "CB"), "cornerbacks": _pos(["CB", "DB"], "CB"),
    "safety": _pos(["S", "FS", "SAF"], "safety"), "safeties": _pos(["S", "FS", "SAF"], "safety"),
    "db": _pos(["CB", "DB", "S", "FS", "SAF"], "DB"), "dbs": _pos(["CB", "DB", "S", "FS", "SAF"], "DB"),
    "defensive back": _pos(["CB", "DB", "S", "FS", "SAF"], "DB"),
    "defensive backs": _pos(["CB", "DB", "S", "FS", "SAF"], "DB"),
    "edge": _EDGE, "edges": _EDGE, "edge rusher": _EDGE, "edge rushers": _EDGE,
    "pass rusher": _EDGE, "pass rushers": _EDGE,
    "de": _pos(["DE"], "DE"), "defensive end": _pos(["DE"], "DE"), "defensive ends": _pos(["DE"], "DE"),
    "dt": _pos(["DT", "NT"], "DT"), "dts": _pos(["DT", "NT"], "DT"),
    "defensive tackle": _pos(["DT", "NT"], "DT"), "defensive tackles": _pos(["DT", "NT"], "DT"),
    "nose tackle": _pos(["NT"], "NT"), "nose tackles": _pos(["NT"], "NT"),
    "dl": _pos(["DE", "DT", "DL", "NT"], "D-line"),
    "defensive lineman": _pos(["DE", "DT", "DL", "NT"], "D-line"),
    "defensive linemen": _pos(["DE", "DT", "DL", "NT"], "D-line"),
    "lb": _pos(["LB", "ILB", "OLB", "MLB"], "LB"), "lbs": _pos(["LB", "ILB", "OLB", "MLB"], "LB"),
    "linebacker": _pos(["LB", "ILB", "OLB", "MLB"], "LB"),
    "linebackers": _pos(["LB", "ILB", "OLB", "MLB"], "LB"),
    "ilb": _pos(["ILB", "MLB", "LB"], "ILB"), "mlb": _pos(["ILB", "MLB", "LB"], "MLB"),
    "inside linebacker": _pos(["ILB", "MLB", "LB"], "ILB"),
    "inside linebackers": _pos(["ILB", "MLB", "LB"], "ILB"),
    "middle linebacker": _pos(["ILB", "MLB", "LB"], "MLB"),
    "middle linebackers": _pos(["ILB", "MLB", "LB"], "MLB"),
    "olb": _pos(["OLB"], "OLB"),
    "outside linebacker": _pos(["OLB"], "OLB"), "outside linebackers": _pos(["OLB"], "OLB"),
    "kicker": _pos(["K"], "kicker"), "kickers": _pos(["K"], "kicker"),
    "punter": _pos(["P"], "punter"), "punters": _pos(["P"], "punter"),
    "center": _pos(["C"], "center"), "centers": _pos(["C"], "center"),
    "guard": _pos(["G"], "guard"), "guards": _pos(["G"], "guard"),
    "offensive tackle": _pos(["OT"], "OT"), "offensive tackles": _pos(["OT"], "OT"),
    "ol": _pos(["C", "G", "OT", "OL"], "O-line"),
    "offensive lineman": _pos(["C", "G", "OT", "OL"], "O-line"),
    "offensive linemen": _pos(["C", "G", "OT", "OL"], "O-line"),
}

DISPLAY = {
    "playoff_wins": "playoff wins", "super_bowl_wins": "Super Bowl wins",
    "passing_yards": "passing yards", "passing_tds": "passing TDs",
    "interceptions": "interceptions", "int_rate": "interception rate",
    "pass_attempts": "pass attempts", "completions": "completions",
    "completion_pct": "completion %", "total_tds": "total TDs",
    "rushing_yards": "rushing yards", "rushing_tds": "rushing TDs",
    "carries": "carries", "receiving_yards": "receiving yards",
    "receiving_tds": "receiving TDs", "receptions": "receptions",
    "targets": "targets", "sacks_taken": "sacks taken", "fantasy_ppr": "fantasy pts (PPR)",
    "fantasy_std": "fantasy pts (standard)", "age": "age", "games": "games",
    "tackles": "tackles", "tackles_for_loss": "tackles for loss", "sacks": "sacks",
    "def_interceptions": "interceptions made", "passes_defended": "passes defended",
    "forced_fumbles": "forced fumbles", "def_tds": "defensive TDs",
    # efficiency
    "epa_per_play": "EPA per play", "pass_epa_per_play": "passing EPA per play", "rush_epa_per_carry": "rushing EPA per carry",
    "rec_epa_per_target": "receiving EPA per target", "pass_epa": "passing EPA", "rush_epa": "rushing EPA", "rec_epa": "receiving EPA",
    "cpoe": "CPOE", "cpoe_ngs": "CPOE (NGS)", "xcomp_pct": "expected completion %", "qbr": "Total QBR",
    "qbr_raw": "raw QBR", "qbr_pts_added": "QBR points added", "qbr_plays": "QBR plays",
    "contract_apy": "contract $M/yr", "contract_value": "contract total $M", "contract_guaranteed": "guaranteed $M",
    "contract_cap_pct": "% of cap", "contract_years": "contract years", "contract_signed": "signed",
    "passer_rating": "passer rating", "td_pct": "TD %", "ypa": "yards/attempt", "ypc": "yards/carry", "ypr": "yards/reception",
    "catch_pct": "catch %", "pass_ypg": "passing yards/game", "rush_ypg": "rushing yards/game", "rec_ypg": "receiving yards/game",
    "total_ypg": "yards/game", "total_yards": "total yards", "touches": "touches",
    "pacr": "PACR", "racr": "RACR", "target_share": "target share", "air_yards_share": "air-yards share", "wopr": "WOPR",
    # sacks, ball security
    "sack_pct": "sack %", "sack_yards_lost": "sack yards lost", "sack_fumbles": "sack fumbles", "sack_fumbles_lost": "sack fumbles lost",
    "turnovers": "turnovers", "turnover_pct": "turnover %", "fumbles": "fumbles", "fumbles_lost": "fumbles lost",
    "rushing_fumbles": "rushing fumbles", "receiving_fumbles": "receiving fumbles",
    "fumble_recoveries": "fumble recoveries", "fumble_rec_own": "own fumbles recovered", "fumble_rec_tds": "fumble-return TDs",
    "int_tds": "interception-return TDs", "int_plus_pd": "INT + PD", "def_int_yards": "interception return yards",
    # pass rush / pressure / blitz
    "pressures": "pressures", "pressure_rate": "pressure rate (pressures per defensive snap; ESPN PRWR is not public)",
    "hurries": "hurries", "qb_knockdowns": "QB knockdowns", "qb_hits": "QB hits", "qb_hit_rate": "QB hit rate",
    "blitzes": "blitzes", "blitz_pct": "blitz %", "sack_per_blitz": "sacks per blitz", "sack_yards": "sack yards",
    "times_blitzed": "times blitzed", "times_hurried": "times hurried", "times_hit": "times hit", "times_pressured": "times pressured",
    "pressured_pct": "pressured %", "pocket_time": "pocket time (s)", "time_to_throw": "time to throw (s)",
    "aggressiveness": "aggressiveness", "throwaways": "throwaways", "scrambles": "scrambles",
    "bad_throws": "bad throws", "bad_throw_pct": "bad throw %", "on_target_pct": "on-target %",
    "iay_per_att": "intended air yards/attempt", "air_yards_to_sticks": "air yards to sticks", "ngs_cay": "completed air yards (avg)",
    "ngs_iay": "intended air yards (avg)", "air_yards_diff": "air-yards differential", "max_completed_air": "longest completed air distance",
    # coverage / tackling
    "cov_targets": "targets (nearest defender)", "cov_completions": "completions allowed", "cov_cmp_pct": "completion % allowed",
    "cov_yards": "yards allowed", "cov_tds": "TDs allowed", "cov_rating": "passer rating allowed", "cov_adot": "depth of target allowed",
    "missed_tackles": "missed tackles", "missed_tackle_pct": "missed tackle %", "pfr_comb_tackles": "combined tackles (PFR)",
    "tackles_solo": "solo tackles", "tackles_per_game": "tackles/game", "tfl_yards": "TFL yards", "safeties": "safeties",
    "def_fumbles": "own fumbles (defense)", "def_snaps": "defensive snaps", "off_snaps": "offensive snaps", "st_snaps": "special-teams snaps",
    # receiving / rushing tracking
    "rec_yac": "yards after catch", "pass_yac": "passing yards after catch", "yac_oe": "YAC over expected", "x_yac": "expected YAC",
    "ybc_per_att": "yards before contact/att", "yac_per_att": "yards after contact/att", "broken_tackles_rush": "broken tackles (rush)",
    "broken_tackles_rec": "broken tackles (rec)", "separation": "separation (yds)", "cushion": "cushion (yds)", "adot": "aDOT",
    "drops": "drops", "drop_pct": "drop %", "drops_suffered": "drops by receivers", "drop_pct_suffered": "drop % by receivers",
    "ryoe": "rush yards over expected", "ryoe_per_att": "RYOE/attempt", "x_rush_yards": "expected rush yards", "rush_pct_oe": "rush % over expected",
    "stacked_box_pct": "stacked-box rate", "rush_efficiency": "rushing efficiency", "time_to_los": "time to LOS (s)",
    "pass_air_yards": "passing air yards", "rec_air_yards": "receiving air yards", "rec_iay": "intended air yards (rec)", "iay_share": "intended air-yards share",
    "pass_first_downs": "passing first downs", "rush_first_downs": "rushing first downs", "rec_first_downs": "receiving first downs",
    "pass_2pt": "2-pt passes", "penalties": "penalties", "penalty_yards": "penalty yards", "special_teams_tds": "special-teams TDs",
    # kicking / returns
    "fg_made": "field goals made", "fg_att": "field goal attempts", "fg_pct": "FG %", "fg_long": "long FG", "pat_made": "extra points",
    "pat_att": "extra point attempts", "punts": "punts", "punt_yards": "punt yards", "punts_inside_20": "punts inside the 20",
    "punt_returns": "punt returns", "punt_return_yards": "punt return yards", "kickoff_returns": "kick returns", "kickoff_return_yards": "kick return yards",
    # bio
    "pass_td_20": "TD passes of 20+ yards", "pass_td_40": "TD passes of 40+ yards",
    "rush_td_20": "rushing TDs of 20+ yards", "rush_td_40": "rushing TDs of 40+ yards",
    "rec_td_20": "receiving TDs of 20+ yards", "rec_td_40": "receiving TDs of 40+ yards",
    "pass_20_plus": "completions of 20+ yards", "pass_40_plus": "completions of 40+ yards",
    "rush_20_plus": "runs of 20+ yards", "rush_40_plus": "runs of 40+ yards",
    "rec_20_plus": "catches of 20+ yards", "rec_40_plus": "catches of 40+ yards",
    "deep_att": "deep attempts (20+ air yards)", "deep_cmp": "deep completions", "deep_cmp_pct": "deep completion %",
    "deep_yards": "deep pass yards", "deep_td": "deep pass TDs", "deep_int": "deep interceptions",
    "deep_targets": "deep targets", "deep_recs": "deep catches", "deep_rec_yards": "deep receiving yards",
    "deep_rec_td": "deep receiving TDs",
    "height": "height", "weight": "weight", "college": "college", "draft_year": "draft year", "draft_round": "draft round",
    "draft_pick": "draft pick", "rookie_season": "rookie season", "experience": "years of experience",
}

# lower is better
ASCENDING_GOOD = {"interceptions", "int_rate", "sacks_taken", "sack_pct", "sack_yards_lost", "sack_fumbles", "sack_fumbles_lost",
                  "turnovers", "turnover_pct", "fumbles", "fumbles_lost", "rushing_fumbles", "receiving_fumbles", "def_fumbles",
                  "times_pressured", "pressured_pct", "times_hurried", "times_hit", "bad_throws", "bad_throw_pct",
                  "drops", "drop_pct", "drops_suffered", "drop_pct_suffered", "missed_tackles", "missed_tackle_pct",
                  "cov_cmp_pct", "cov_yards", "cov_tds", "cov_rating", "cov_completions", "penalties", "penalty_yards",
                  "time_to_throw", "rush_efficiency", "draft_round", "draft_pick", "deep_int"}
# fractions shown as percentages
PCT_STATS = {"contract_cap_pct", "completion_pct", "int_rate", "td_pct", "sack_pct", "turnover_pct", "catch_pct", "pressure_rate", "blitz_pct",
             "qb_hit_rate", "missed_tackle_pct", "cov_cmp_pct", "pressured_pct", "drop_pct", "drop_pct_suffered",
             "bad_throw_pct", "on_target_pct", "aggressiveness", "stacked_box_pct", "iay_share", "xcomp_pct",
             "target_share", "air_yards_share", "fg_pct", "rush_pct_oe", "deep_cmp_pct"}
# already in percentage points (shown with a sign, no scaling)
PP_STATS = {"cpoe", "cpoe_ngs"}

# Which columns a result table shows: the identity columns, every stat the
# question named, and the default set for the positions in the answer. Any
# column that is empty for every matched row is dropped afterwards.
ALWAYS_COLS = ["headshot_url", "player_id", "season", "player_display_name", "position", "recent_team", "games", "made_playoffs", "age"]
POS_DEFAULTS = {
    "QB": ["pass_attempts", "completions", "completion_pct", "passing_yards", "passing_tds", "interceptions", "int_rate",
           "passer_rating", "qbr", "epa_per_play", "cpoe", "ypa", "sacks_taken", "sack_pct", "turnover_pct", "rushing_yards", "rushing_tds", "total_yards", "contract_apy"],
    "RB": ["carries", "rushing_yards", "ypc", "rushing_tds", "receptions", "receiving_yards", "receiving_tds", "total_yards",
           "total_ypg", "fumbles_lost", "epa_per_play", "ryoe_per_att", "fantasy_ppr", "contract_apy"],
    "WR": ["targets", "receptions", "catch_pct", "receiving_yards", "ypr", "receiving_tds", "rec_ypg", "rec_yac", "drops",
           "target_share", "separation", "rec_epa_per_target", "fantasy_ppr", "contract_apy"],
    "DEF": ["tackles", "tackles_for_loss", "sacks", "qb_hits", "pressures", "pressure_rate", "forced_fumbles", "fumble_recoveries",
            "def_interceptions", "passes_defended", "def_tds", "int_tds", "fumble_rec_tds", "missed_tackle_pct", "cov_cmp_pct", "contract_apy"],
    "K": ["fg_made", "fg_att", "fg_pct", "fg_long", "pat_made", "pat_att"],
    "P": ["punts", "punt_yards", "punts_inside_20"],
}
POS_DEFAULTS["TE"] = POS_DEFAULTS["WR"]; POS_DEFAULTS["FB"] = POS_DEFAULTS["RB"]
DEF_CODES = {"CB", "DB", "S", "FS", "SS", "SAF", "LB", "ILB", "OLB", "MLB", "DE", "DT", "DL", "NT", "EDGE"}
DEF_STAT_COLS = set(POS_DEFAULTS["DEF"]) | {"hurries", "qb_knockdowns", "blitzes", "blitz_pct", "sack_per_blitz", "cov_rating", "cov_yards", "cov_tds", "tackles_solo", "safeties", "tfl_yards", "def_int_yards", "int_plus_pd"}

def result_columns(res, conds):
    """Ordered columns for a result frame (see the note above)."""
    named = [c["col"] for c in conds if c.get("col")]
    positions = set(res["position"].dropna().unique()) if "position" in res else set()
    groups = []
    for p in positions:
        key = "DEF" if p in DEF_CODES else ("WR" if p == "TE" else ("RB" if p == "FB" else p))
        if key in POS_DEFAULTS and key not in groups: groups.append(key)
    if not groups and any(c in DEF_STAT_COLS for c in named): groups = ["DEF"]
    if not groups and named:
        groups = ["QB"] if any(c.startswith(("pass", "completion", "int_rate", "qbr", "sack_pct")) for c in named) else ["RB", "WR"]
    ordered = []
    for c in ALWAYS_COLS + named + [c for g in groups for c in POS_DEFAULTS[g]]:
        if c in res.columns and c not in ordered: ordered.append(c)
    return [c for c in ordered if c in ALWAYS_COLS or res[c].notna().any()]

class QueryError(Exception):
    pass

# The same word is a different column depending on who is asked about: a
# cornerback's "interceptions" are the ones he MADE, a quarterback's "sacks"
# are the ones he TOOK, a receiver's "touchdowns" are receiving TDs.
_DEF_CODES = {"CB", "DB", "S", "FS", "SAF", "DE", "OLB", "DT", "NT", "DL", "LB", "ILB", "MLB"}
POS_SWAP = {
    "interceptions": {"DEF": "def_interceptions"},
    "sacks": {"QB": "sacks_taken"},
    "fumbles": {"DEF": "forced_fumbles"},
    "total_tds": {"QB": "passing_tds", "RB": "rushing_tds", "FB": "rushing_tds", "WR": "receiving_tds", "TE": "receiving_tds", "DEF": "def_tds"},
    # bare "yards": the position's own yards; without a position, the sum. "total yards" is always the sum.
    "any_yards": {"QB": "passing_yards", "RB": "rushing_yards", "FB": "rushing_yards", "WR": "receiving_yards", "TE": "receiving_yards", "*": "total_yards"},
    # a back's "yards per attempt" / "attempts" are carries, not throws
    "ypa": {"RB": "ypc", "FB": "ypc"},
    "pass_attempts": {"RB": "carries", "FB": "carries"},
}
_POS_GROUP = None   # set by parse() for the one question being read

def _pos_group(codes):
    if not codes:
        return None
    return "DEF" if any(c in _DEF_CODES for c in codes) else codes[0]

def _find_stat(text, start=0):
    r = _find_stat_raw(text, start)
    swap = POS_SWAP.get(r[0]) if r else None
    if swap:
        col = swap.get(_POS_GROUP) if _POS_GROUP else None
        col = col or swap.get("*")
        if col: return (col, r[1], r[2])
    return r

def _find_stat_raw(text, start=0):
    search_text = text[start:].strip()
    if not search_text: return None

    best = None

    # 1. Exact Match
    for phrase, col in STAT_ALIASES:
        idx = text.find(phrase, start)
        if idx != -1 and (best is None or idx < best[1]):
            best = (col, idx, idx + len(phrase))

    if best: return best

    # 2. Strict Chunk-Based Fuzzy Matching
    words = search_text.split()
    best_match = None
    best_idx = -1
    best_len = 0

    for n in (3, 2, 1):
        for i in range(len(words) - n + 1):
            chunk = " ".join(words[i:i+n])
            match = process.extractOne(chunk, [a[0] for a in STAT_ALIASES], scorer=fuzz.ratio, score_cutoff=85)
            if match:
                chunk_idx = text.find(chunk, start)
                if chunk_idx != -1 and (best_match is None or chunk_idx < best_idx):
                    best_match = match[0]
                    best_idx = chunk_idx
                    best_len = len(chunk)

    if best_match:
        col = next(c for p, c in STAT_ALIASES if p == best_match)
        return (col, best_idx, best_idx + best_len)

    return None

# comparison words that carry their own stat when none is named nearby
COMPARE_GT = {"over", "more than", "above", "taller than", "heavier than", "older than", "longer than",
              "greater than", "higher than", "bigger than", "faster than"}
COMPARE_LT = {"under", "less than", "fewer than", "below", "shorter than", "lighter than", "younger than",
              "lower than", "smaller than", "slower than"}
COMPARE_COL = {"taller than": "height", "shorter than": "height", "heavier than": "weight", "lighter than": "weight",
               "older than": "age", "younger than": "age"}
_COMPARE_RE = "|".join(sorted(COMPARE_GT | COMPARE_LT | {"at least", "at most"}, key=len, reverse=True))
# a stat found FORWARD of a number that sits past a conjunction belongs to the
# NEXT clause ("QBR over 70 and EPA per play above 0.2"), so prefer the stat
# behind the number in that case
_LEN = r"(\d{2,3})\s*(?:\+|plus|or more|or longer)?\s*-?\s*(?:yards?|yds?|yarders?)"
_LEN_FAMILIES = [
    ("pass_td", r"(?:passing|pass|throwing)\s+(?:touchdowns?|tds?)|(?:touchdown|td)\s+(?:passes|throws)"),
    ("rush_td", r"(?:rushing|rush|running)\s+(?:touchdowns?|tds?)|(?:touchdown|td)\s+(?:runs?|rushes|carries)"),
    ("rec_td", r"(?:receiving|rec)\s+(?:touchdowns?|tds?)|(?:touchdown|td)\s+(?:catches|receptions|grabs)"),
    ("pos_td", r"(?:touchdowns?|tds?|scores)"),
    ("pass", r"(?:completions|passes|throws|passing plays)"),
    ("rush", r"(?:runs|rushes|carries|rushing plays)"),
    ("rec", r"(?:catches|receptions|grabs|receiving plays)"),
]
_LEN_NAMES = {"pass_td": "td passes", "rush_td": "td runs", "rec_td": "td catches",
              "pass": "completions", "rush": "runs", "rec": "catches"}
_POS_TD_FAMILY = {"QB": "pass_td", "RB": "rush_td", "FB": "rush_td", "WR": "rec_td", "TE": "rec_td"}

def _rewrite_lengths(q, pos_codes, ignored):
    """'20+ yard passing tds' / 'td passes of 40 or more yards' -> a stat name.
    Only 20+ and 40+ buckets exist; any other length is reported, not guessed."""
    def name(fam, n):
        if fam == "pos_td":
            fam = next((_POS_TD_FAMILY[c] for c in (pos_codes or []) if c in _POS_TD_FAMILY), None)
            if not fam:
                return None
        if int(n) < 20:
            return ""
        return ("fortyplus" if int(n) >= 40 else "twentyplus") + " yard " + _LEN_NAMES[fam]
    for fam, pat in _LEN_FAMILIES:
        for rx in (rf"{_LEN}\s+(?:long\s+)?(?:{pat})\b",
                   rf"\b(?:{pat})\s+(?:of|over|for|going|longer than|greater than|at least|more than|beyond)\s+(?:at least\s+)?{_LEN}"):
            def sub(m):
                nm = name(fam, m.group(1))
                if nm is None:
                    return m.group(0)
                if nm == "":
                    ignored.append(f"{m.group(0).strip()} (only 20+ and 40+ yard plays are counted)")
                    return " "
                return f" {nm} "
            q = re.sub(rx, sub, q)
    return q

_CLAUSE_BREAK = re.compile(r"\b(and|with|who|that|or|while)\b|,")

def _find_stat_last(text):
    """The stat mentioned LAST in text (the one nearest a number that follows it)."""
    last, pos = None, 0
    while True:
        st = _find_stat(text, pos)
        if not st: return last
        last, pos = st, st[2]

def _stat_for_number(q, start, end, fwd_len):
    fwd = q[end:end + fwd_len]
    st = _find_stat(fwd, 0)
    if st and _CLAUSE_BREAK.search(fwd[:st[1]]):
        back = _find_stat_last(q[max(0, start - 40):start])
        if back: return back
    if st: return st
    return _find_stat_last(q[max(0, start - 40):start])

_NUM_RE = re.compile(r"\d[\d,\.]*")
_PCT_TAIL_RE = re.compile(r"\s*(%|percent)")

def _covered(i, spans):
    return any(a <= i < b for a, b in spans)

_SIGN = {">": ">", "<": "<", ">=": "≥", "<=": "≤"}

def _pct_value(col, num, marked):
    """A percent stat typed as '5%' or '5' means 0.05; typed as '0.05' stays."""
    if col in PCT_STATS and (marked or num >= 1): return num / 100.0
    return num

def parse(query):
    global _POS_GROUP
    _POS_GROUP = None
    q = " " + query.lower().strip() + " "
    # money is in millions: "$40 million", "$40m", "40 million", "40 mil" -> 40
    q = re.sub(r"\$\s*(\d[\d,\.]*)\s*(million|mil|m)\b", r"\1", q)
    q = re.sub(r"(\d[\d,\.]*)\s*(million|mil)\b", r"\1", q)
    # 6'2 / 6-2" style heights become inches so "taller than 6'2" just works
    q = re.sub(r"(\d)['\u2019-](\d{1,2})(?:\"|''|\u201d| in\b|\b)", lambda m: str(int(m.group(1)) * 12 + int(m.group(2))), q)
    # A parenthetical that is only a length — "deep pass TDs (20+ yards)" — is
    # restating what the stat already means, not asking for a second filter.
    q = re.sub(r"\(\s*\d+\s*\+?\s*(?:or more\s*)?(?:air\s+)?(?:yards?|yds?)\s*\)", " ", q)
    conds, notes, ignored = [], [], []
    spans = []   # character ranges already turned into a condition

    pos_codes = None
    for word in sorted(POSITIONS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(word)}\b", q):
            pos = POSITIONS[word]
            pos_codes = pos["codes"]
            conds.append({"kind": "position", "value": pos["codes"], "flag": pos.get("flag")})
            notes.append(f"position is {pos['label']}")
            break
    _POS_GROUP = _pos_group(pos_codes)
    q = _rewrite_lengths(q, pos_codes, ignored)

    m = re.search(r"between (\d{4}) and (\d{4})", q)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        conds.append({"kind": "season_range", "min": min(a, b), "max": max(a, b)})
        notes.append(f"season between {min(a,b)} and {max(a,b)}")
        spans.append(m.span())
    else:
        m = re.search(r"since (\d{4})", q)
        if m:
            conds.append({"kind": "season_range", "min": int(m.group(1)), "max": None})
            notes.append(f"season since {m.group(1)}")
            spans.append(m.span())
        m = re.search(r"before (\d{4})", q)
        if m:
            conds.append({"kind": "season_range", "min": None, "max": int(m.group(1)) - 1})
            notes.append(f"season before {m.group(1)}")
            spans.append(m.span())
        m = re.search(r"\bin (\d{4})\b", q)
        if m:
            yr = int(m.group(1))
            conds.append({"kind": "season_range", "min": yr, "max": yr})
            notes.append(f"season is {yr}")
            spans.append(m.span())

    m = re.search(r"\b(?:won|win|winning|wins)\b[^,]{0,25}?\bsuper bowl\b|\bsuper bowl (?:champions?|champs|winners?|mvp)\b|\b(?:has|have|with|got|earned) (?:a |their |his |her )?rings?\b", q)
    if m:
        conds.append({"kind": "threshold", "col": "super_bowl_wins", "op": ">=", "value": 1})
        notes.append("won the Super Bowl that season")
        spans.append(m.span())
    m = re.search(r"\b(?:won|win|winning|wins)\b[^,]{0,25}?\b(?:playoff|postseason)\s+(?:game|games|win|wins|matchup)\b|\bwon in the (?:playoffs|postseason)\b|\b(?:playoff|postseason) (?:win|wins|victory|victories)\b", q)
    if m:
        if not re.search(r"\d\s*\+?\s*(?:or more\s+)?(?:playoff|postseason) (?:win|wins|victories)", q):
            conds.append({"kind": "threshold", "col": "playoff_wins", "op": ">=", "value": 1})
            notes.append("won a playoff game that season")
            spans.append(m.span())
    elif re.search(r"playoff|postseason", q):
        conds.append({"kind": "playoffs"})
        notes.append("appeared in the playoffs that season")

    for mm in re.finditer(r"led the league in ", q):
        st = _find_stat(q, mm.end())
        if st:
            col = st[0]
            conds.append({"kind": "rank", "col": col, "n": 1, "asc": col in ASCENDING_GOOD})
            notes.append(f"led the league in {DISPLAY.get(col, col)}")
            spans.append((mm.start(), st[2]))

    rank_starts = [m.start() for m in re.finditer(r"(top|bottom)\s+\d+", q)]
    for mm in re.finditer(r"(top|bottom)\s+(\d+)", q):
        direction, n = mm.group(1), int(mm.group(2))
        nxt = min([s for s in rank_starts if s > mm.start()] + [len(q)])
        stop = nxt
        tm = re.search(r"\b(over|more than|at least|above|under|less than|fewer than|below|at most|who|since|before|between|led|for|on)\b|\d", q[mm.end():nxt])
        if tm: stop = mm.end() + tm.start()
        window = q[mm.end():stop]
        pos = 0
        found_any = False
        while True:
            st = _find_stat(window, pos)
            if not st: break
            col, s_start, s_end = st
            pre = window[:s_start]

            if "lowest" in pre or "fewest" in pre or direction == "bottom":
                wants_low = True
            elif "highest" in pre or "most" in pre:
                wants_low = False
            else:
                wants_low = col in ASCENDING_GOOD

            conds.append({"kind": "rank", "col": col, "n": n, "asc": wants_low})
            arrow = "lowest" if wants_low else "highest"
            word = ("bottom" if direction == "bottom" and col not in ASCENDING_GOOD else "top")
            notes.append(f"{word} {n} in {DISPLAY.get(col, col)} ({arrow})")
            pos = s_end
            found_any = True
        spans.append(mm.span())   # "top 10" is spoken for either way
        if not found_any: continue

    # "who has the most X" / "fewest X" asks for an ORDER, not a filter. Skipped
    # when the sentence already says top N, which is the explicit form.
    if not re.search(r"(top|bottom)\s+\d+", q):
        mm = re.search(r"(?<!at )\b(most|fewest|least|lowest|highest|best|leader in|leaders in)\b\s*", q)
        if mm:
            st = _find_stat(q[mm.end():mm.end() + 45], 0)
            if st:
                asc = mm.group(1) in ("fewest", "least", "lowest")
                conds.append({"kind": "sort", "col": st[0], "asc": asc})
                notes.append(f"sorted by {DISPLAY.get(st[0], st[0])} ({'lowest' if asc else 'highest'} first)")

    thresh_pat = r"(" + _COMPARE_RE + r")\s+([\d,\.]+)\s*(%|percent)?"
    for mm in re.finditer(thresh_pat, q):
        op_word, num, pct_mark = mm.group(1), float(mm.group(2).replace(",", "")), bool(mm.group(3))
        st = None
        if op_word not in COMPARE_COL:
            st = _stat_for_number(q, mm.start(), mm.end(), 40)
        if st: col = st[0]
        elif op_word in COMPARE_COL: col = COMPARE_COL[op_word]
        elif 18 <= num <= 50: col = "age"
        else: continue
        if op_word in COMPARE_GT: op = ">"
        elif op_word == "at least": op = ">="
        elif op_word in COMPARE_LT: op = "<"
        else: op = "<="
        num = _pct_value(col, num, pct_mark)
        conds.append({"kind": "threshold", "col": col, "op": op, "value": num})
        shown = f"{num*100:g}%" if col in PCT_STATS else f"{num:g}"
        notes.append(f"{DISPLAY.get(col, col)} {_SIGN[op]} {shown}")
        spans.append(mm.span())

    # "12%+" and "12+%" mean the same thing, so the percent mark is allowed on
    # either side of the plus. It used to be accepted only after it, which made
    # "12%+ pressure rate" parse as nothing.
    post_pat = (r"(?P<num>[\d,\.]+)\s*(?P<pre>%|percent)?\s*"
                r"(?P<word>\+|or more|or fewer|or less|or higher|or lower|or younger|or older)"
                r"\s*(?P<post>%|percent|years old)?")
    for mm in re.finditer(post_pat, q):
        num = float(mm.group("num").replace(",", ""))
        phrase = mm.group("word")
        is_pct = mm.group("pre") in ("%", "percent") or mm.group("post") in ("%", "percent")
        gte = phrase in ("+", "or more", "or higher", "or older")

        window_fwd = q[mm.end():mm.end() + 45]
        cut = re.search(r"\b(and|over|more than|at least|above|under|less than|fewer than|below|at most|who|top|bottom|since|before|between|led|for|on)\b", window_fwd)
        stat_window = window_fwd[:cut.start()] if cut else window_fwd
        st = _find_stat(stat_window, 0)
        if not st:
            st = _find_stat_last(q[max(0, mm.start()-40):mm.start()])

        if not st:
            if 18 <= num <= 50: col = "age"
            else: continue
        else:
            col = st[0]

        num = _pct_value(col, num, is_pct)
        conds.append({"kind": "threshold", "col": col, "op": ">=" if gte else "<=", "value": num})
        shown = f"{num*100:g}%" if col in PCT_STATS else f"{num:g}"
        notes.append(f"{DISPLAY.get(col, col)} {_SIGN['>=' if gte else '<=']} {shown}")
        spans.append(mm.span())

    # A number next to a stat with no comparison word at all — "100 receptions",
    # "12% pressure rate" — is a floor, the way anyone reading it out loud would
    # take it. Without this the clause was dropped and the answer came back
    # looking right: "WRs with 100 receptions" returned every WR season ever.
    for mm in _NUM_RE.finditer(q):
        if _covered(mm.start(), spans): continue
        num = float(mm.group(0).replace(",", ""))
        tail = _PCT_TAIL_RE.match(q[mm.end():])
        end = mm.end() + (tail.end() if tail else 0)
        st = _stat_for_number(q, mm.start(), end, 40)
        col = st[0] if st else None
        # "25 years old" is an equality, not a floor, so age stays explicit
        if col is None or col == "age":
            frag = q[mm.start():mm.start() + 30].strip()
            frag = re.split(r"\b(and|with|who|that|since|before|between)\b|,", frag)[0].strip()
            ignored.append(frag)
            continue
        value = _pct_value(col, num, bool(tail))
        conds.append({"kind": "threshold", "col": col, "op": ">=", "value": value})
        shown = f"{value*100:g}%" if col in PCT_STATS else f"{value:g}"
        notes.append(f"{DISPLAY.get(col, col)} {_SIGN['>=']} {shown}")
        spans.append((mm.start(), end))

    # the escape hatch that keeps a multi-season question on season lines
    if re.search(r"\bin a (?:single )?season\b|\bsingle[- ]season\b|\bbest season\b|\bper season\b|\bseason with the\b", q):
        conds.append({"kind": "scope", "value": "season"})
    if not conds:
        raise QueryError("I couldn't find anything to filter on. Try naming a position, a stat with 'top N', a threshold like 'over 4000 passing yards', or 'playoffs'.")
    # "5 rings" is a career count; a season holds one at most. Keep the season
    # filter at >= 1 and carry the real number for the career-totals pass.
    for c in conds:
        if c["kind"] == "threshold" and c["col"] == "super_bowl_wins" and c["value"] > 1:
            c["career"] = int(c["value"]); c["value"] = 1
            notes[:] = [n if not n.startswith("Super Bowl wins") else f"Super Bowl wins ≥ {c['career']} across the matched seasons (career total)" for n in notes]
            if not any(k["kind"] == "sort" for k in conds):
                conds.append({"kind": "sort", "col": "super_bowl_wins", "asc": False})
    return conds, notes, ignored

# ---- CAREER OR SEASON: which question is being asked -----------------------
# A row in this table is one season, so "most X" needs a reading. The span
# decides it and the word "season" overrides it:
#   "most X in 2024"                 one season, nothing to decide
#   "most X since 2021"              CAREER — the matched seasons added up
#   "most X in a season since 2021"  the best single line
#   "over 4000 X since 2021"         a THRESHOLD is always per season
#   "top 10 by X since 2021"         a RANK is always per season
# Rates are rebuilt from the totals (yards/attempt = total yards / total
# attempts) and keep their qualifying minimum, scaled to the span. A rate with
# no parts to rebuild from (QBR, CPOE, Next Gen) stays on season lines and says
# so, instead of averaging four numbers and calling that a career.
CAREER_TRIGGERS = {"super_bowl_wins", "playoff_wins"}
CAREER_NOTE = "career totals — one row per player, the matched seasons added up; the season column shows the span"
def r4(x): return math.floor(x * 10000 + 0.5) / 10000   # one rounding, shared with the browser engine

def sum_cols(df, rank_desc, rate_parts, never_sum, max_cols):
    """Columns whose career value is their sum. Computed once from the whole table
    and shipped to the browser engine, so both read the identical list."""
    # games is an identity column on a season line and a total on a career line
    skip = (set(ALWAYS_COLS) - {"games"}) | PCT_STATS | PP_STATS | set(rate_parts) | set(never_sum) | set(max_cols)
    out = []
    for c in df.columns:
        if c in skip or c.endswith("_rank") or c == "made_playoffs":
            continue
        if c in rank_desc or c in CAREER_TRIGGERS:
            out.append(c); continue
        v = pd.to_numeric(df[c], errors="coerce").dropna()
        if len(v) and float(v.mod(1).abs().max()) == 0:
            out.append(c)
    return sorted(out)

RATING_PARTS = ("completions", "pass_attempts", "passing_yards", "passing_tds", "interceptions")

def rate_ok(parts, cols):
    return all(c in cols for c in (RATING_PARTS if parts == "rating" else parts[0] + parts[1]))

def rate_value(get, parts):
    """Rebuild one rate from career totals. `get(col)` returns the summed total."""
    if parts == "rating":
        att = get("pass_attempts")
        if not att: return None
        cap = lambda x: max(0.0, min(2.375, x))
        a = cap((get("completions") / att - 0.3) * 5)
        b = cap((get("passing_yards") / att - 3) * 0.25)
        c = cap(get("passing_tds") / att * 20)
        d = cap(2.375 - get("interceptions") / att * 25)
        return r4((a + b + c + d) / 6 * 100)
    den = sum(get(x) for x in parts[1])
    if not den: return None
    return r4(sum(get(x) for x in parts[0]) / den)

def rate_floor(col, rate_ranks):
    """(qualifier column, minimum, is that minimum per game?) for a rate, or None."""
    for c, _asc, qual, minimum, per_game in rate_ranks:
        if c == col: return qual, minimum, bool(per_game)
    return None

def rate_notes(col, rate_ranks):
    out = [f"{DISPLAY.get(col, col)} is rebuilt from the career totals, not averaged"]
    fl = rate_floor(col, rate_ranks)
    if fl:
        out.append(f"ranked only for a player with at least {fl[1]:g} {DISPLAY.get(fl[0], fl[0])} per {'scheduled game' if fl[2] else 'season'} over the span")
    return out

def career_scope(conds, res, sums, rate_parts, rate_ranks):
    """(career?, extra notes) — the reading this question gets."""
    if any(c["kind"] == "scope" and c["value"] == "season" for c in conds): return False, []
    if any(c["kind"] == "rank" for c in conds): return False, []
    if res["season"].nunique() < 2: return False, []
    sort = next((c for c in conds if c["kind"] == "sort"), None)
    if sort is None:
        return any(c["kind"] == "threshold" and c.get("career") for c in conds), []
    col = sort["col"]
    if col in sums: return True, []
    if col in rate_parts and rate_ok(rate_parts[col], res.columns):
        return True, rate_notes(col, rate_ranks)
    if col in rate_parts or col in PCT_STATS or col in PP_STATS:
        return False, [f"{DISPLAY.get(col, col)} is a per-season rate I can't rebuild across seasons — these are season lines"]
    return False, []

def career_rows(res, conds, sums, rate_parts, rate_ranks, max_cols):
    cols = set(res.columns)
    rates = [c for c in res.columns if c in rate_parts and rate_ok(rate_parts[c], cols)]
    maxes = [c for c in max_cols if c in cols]
    ident = [c for c in ALWAYS_COLS if c in cols and c != "made_playoffs"]
    base = result_columns(res, conds)
    keep = ident + [c for c in base if c not in ident and (c in sums or c in maxes or c in rates)]
    for extra in ("playoff_wins", "super_bowl_wins"):   # always carried: they break ties
        if extra in cols and extra not in keep: keep.append(extra)
    if res.empty:
        return res.reindex(columns=keep)
    sort = next((c for c in conds if c["kind"] == "sort" and c["col"] in keep), None) or {"col": "super_bowl_wins", "asc": False}
    fl = rate_floor(sort["col"], rate_ranks) if sort["col"] in rates else None
    # every column a kept rate is made of, plus the sorted rate's qualifier
    need = {c for r in rates for c in (RATING_PARTS if rate_parts[r] == "rating" else rate_parts[r][0] + rate_parts[r][1])}
    need |= {"games"} | ({fl[0]} if fl else set())
    want = [c for c in (set(keep) | need) if c in cols]
    rows = []
    for _pid, g in res.groupby("player_id", sort=False):
        g = g.sort_values("season")
        last = g.iloc[-1]
        tot, seen = {}, {}
        for c in want:
            v = pd.to_numeric(g[c], errors="coerce")
            seen[c] = bool(v.notna().any())
            tot[c] = float(v.sum()) if seen[c] else 0.0
        r = {c: last[c] for c in ident if c != "season"}
        lo, hi = int(g["season"].min()), int(g["season"].max())
        r["season"] = str(lo) if lo == hi else f"{lo}–{hi}"
        for c in keep:
            if c in rates: r[c] = rate_value(lambda x: tot.get(x, 0.0), rate_parts[c])
            elif c in maxes:
                v = pd.to_numeric(g[c], errors="coerce")
                r[c] = float(v.max()) if v.notna().any() else None
            elif c in sums: r[c] = tot[c] if seen.get(c) else None
        r["_qual"] = tot.get(fl[0], 0.0) if fl else 0.0
        sched = float(sum(17 if int(y) >= 2021 else 16 for y in g["season"]))
        r["_floor"] = (sched if fl and fl[2] else float(len(g))) * (fl[1] if fl else 0)
        rows.append(r)
    out = pd.DataFrame(rows, columns=keep + ["_qual", "_floor"])
    th = next((c for c in conds if c["kind"] == "threshold" and c.get("career")), None)
    if th is not None and th["col"] in out.columns:
        out = out[out[th["col"]].fillna(0) >= th["career"]]
    if fl:   # a rate ranks only a player who cleared the bar over the whole span
        out = out[out["_qual"] >= out["_floor"]]
    out = out.drop(columns=["_qual", "_floor"])
    by = [sort["col"]] + [c for c in ("playoff_wins", "player_display_name", "player_id") if c != sort["col"] and c in out.columns]
    asc = [bool(sort["asc"])] + [c != "playoff_wins" for c in by[1:]]
    return out.sort_values(by, ascending=asc, na_position="last").reset_index(drop=True)

def sort_result(res, conds, rate_ranks=None):
    """Result order: an explicit "most/fewest X" first, otherwise newest season.
    A rate leaderboard is only meaningful among players with the volume to qualify,
    so unqualified seasons sink to the bottom instead of topping the table."""
    s = next((c for c in conds if c["kind"] == "sort" and c["col"] in res.columns), None)
    if s is None:
        return res.sort_values(["season", "player_display_name"], ascending=[False, True])
    fl = rate_floor(s["col"], rate_ranks) if rate_ranks else None
    if fl and fl[0] in res.columns:
        sched = res["season"].map(lambda y: 17 if int(y) >= 2021 else 16)
        need = fl[1] * sched if fl[2] else fl[1]
        res = res.assign(_unq=(pd.to_numeric(res[fl[0]], errors="coerce").fillna(0) < need).astype(int))
        out = res.sort_values(["_unq", s["col"], "season", "player_display_name"],
                              ascending=[True, s["asc"], False, True], na_position="last")
        return out.drop(columns=["_unq"])
    return res.sort_values([s["col"], "season", "player_display_name"],
                           ascending=[s["asc"], False, True], na_position="last")

def run(df, query):
    res, notes, _conds, _ignored = run_full(df, query)
    return res, notes

def run_full(df, query):
    """run() plus the parsed conditions (for column choice) and anything ignored."""
    conds, notes, ignored = parse(query)
    mask = df.index == df.index

    for c in conds:
        if c["kind"] == "position":
            codes = c["value"] if isinstance(c["value"], list) else [c["value"]]
            mask &= df["position"].isin(codes)
            if c.get("flag") and c["flag"] in df:
                mask &= df[c["flag"]].fillna(False).astype(bool)
        elif c["kind"] == "playoffs":
            mask &= df["made_playoffs"].fillna(False)
        elif c["kind"] == "season_range":
            if c["min"] is not None: mask &= df["season"] >= c["min"]
            if c["max"] is not None: mask &= df["season"] <= c["max"]
        elif c["kind"] == "threshold":
            col = c["col"]
            if col not in df:
                raise QueryError(f"I don't have a '{DISPLAY.get(col, col)}' column.")
            series = pd.to_numeric(df[col], errors="coerce").fillna(-1 if ">" in c["op"] else float("inf"))
            if c["op"] == ">=": mask &= (series >= c["value"])
            elif c["op"] == ">": mask &= (series > c["value"])
            elif c["op"] == "<=": mask &= (series <= c["value"])
            elif c["op"] == "<": mask &= (series < c["value"])
        elif c["kind"] == "rank":
            col = c["col"]
            is_natively_asc = col in ASCENDING_GOOD
            if c["asc"] == is_natively_asc:
                rank_col = f"{col}_rank"
                if rank_col not in df:
                    raise QueryError(f"I can't rank on '{DISPLAY.get(col, col)}'.")
                mask &= df[rank_col].notna() & (df[rank_col] <= c["n"])
            else:
                valid_mask = df[col].fillna(0) > 0
                dyn_rank = df.loc[valid_mask, col].rank(ascending=c["asc"], method="min")
                aligned_rank = dyn_rank.reindex(df.index)
                mask &= aligned_rank.notna() & (aligned_rank <= c["n"])

    res = df[mask].copy()
    return res, notes, conds, ignored

RESULT_COLS = ["headshot_url", "player_id", "season", "player_display_name", "position", "recent_team", "games",
               "made_playoffs", "passing_yards", "passing_tds", "completions",
               "completion_pct", "interceptions", "int_rate", "rushing_yards",
               "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
               "total_tds", "fantasy_ppr",
               "tackles", "tackles_for_loss", "sacks", "def_interceptions",
               "passes_defended", "forced_fumbles", "def_tds", "age"]