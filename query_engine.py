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
#     "completion_pct": "completion %", "total_tds": "total TDs",
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
#             notes.append(f"led the league in {DISPLAY[col]}")

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
#             notes.append(f"{word} {n} in {DISPLAY[col]} ({arrow})")
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
#         notes.append(f"{DISPLAY[col]} {'≥' if gte else '≤'} {shown}")

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
import re
import pandas as pd
from rapidfuzz import process, fuzz, utils

pd.set_option('future.no_silent_downcasting', True)

STAT_ALIASES = [
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
]

# word/phrase -> (list of raw position codes in the data, friendly label)
def _pos(codes, label):
    return {"codes": codes, "label": label}

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
    "edge": _pos(["DE", "OLB"], "edge rusher"), "edges": _pos(["DE", "OLB"], "edge rusher"),
    "edge rusher": _pos(["DE", "OLB"], "edge rusher"), "edge rushers": _pos(["DE", "OLB"], "edge rusher"),
    "pass rusher": _pos(["DE", "OLB"], "edge rusher"), "pass rushers": _pos(["DE", "OLB"], "edge rusher"),
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
    "passing_yards": "passing yards", "passing_tds": "passing TDs",
    "interceptions": "interceptions", "int_rate": "interception rate",
    "pass_attempts": "pass attempts", "completions": "completions",
    "completion_pct": "completion %", "total_tds": "total TDs",
    "rushing_yards": "rushing yards", "rushing_tds": "rushing TDs",
    "carries": "carries", "receiving_yards": "receiving yards",
    "receiving_tds": "receiving TDs", "receptions": "receptions",
    "targets": "targets", "sacks_taken": "sacks taken", "fantasy_ppr": "fantasy pts (PPR)",
    "age": "age",
    "tackles": "tackles", "tackles_for_loss": "tackles for loss", "sacks": "sacks",
    "def_interceptions": "interceptions made", "passes_defended": "passes defended",
    "forced_fumbles": "forced fumbles", "def_tds": "defensive TDs",
}

ASCENDING_GOOD = {"interceptions", "int_rate", "sacks_taken"}
PCT_STATS = {"completion_pct", "int_rate"}

class QueryError(Exception):
    pass

def _find_stat(text, start=0):
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

def parse(query):
    q = " " + query.lower().strip() + " "
    conds, notes = [], []

    for word in sorted(POSITIONS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(word)}\b", q):
            pos = POSITIONS[word]
            conds.append({"kind": "position", "value": pos["codes"]})
            notes.append(f"position is {pos['label']}")
            break

    m = re.search(r"between (\d{4}) and (\d{4})", q)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        conds.append({"kind": "season_range", "min": min(a, b), "max": max(a, b)})
        notes.append(f"season between {min(a,b)} and {max(a,b)}")
    else:
        m = re.search(r"since (\d{4})", q)
        if m:
            conds.append({"kind": "season_range", "min": int(m.group(1)), "max": None})
            notes.append(f"season since {m.group(1)}")
        m = re.search(r"before (\d{4})", q)
        if m:
            conds.append({"kind": "season_range", "min": None, "max": int(m.group(1)) - 1})
            notes.append(f"season before {m.group(1)}")
        m = re.search(r"\bin (\d{4})\b", q)
        if m:
            yr = int(m.group(1))
            conds.append({"kind": "season_range", "min": yr, "max": yr})
            notes.append(f"season is {yr}")

    if re.search(r"playoff|postseason", q):
        conds.append({"kind": "playoffs"})
        notes.append("appeared in the playoffs that season")

    for mm in re.finditer(r"led the league in ", q):
        st = _find_stat(q, mm.end())
        if st:
            col = st[0]
            conds.append({"kind": "rank", "col": col, "n": 1, "asc": col in ASCENDING_GOOD})
            notes.append(f"led the league in {DISPLAY[col]}")

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
            notes.append(f"{word} {n} in {DISPLAY[col]} ({arrow})")
            pos = s_end
            found_any = True
        if not found_any: continue

    thresh_pat = (r"(over|more than|at least|above|under|less than|fewer than|below|at most)\s+([\d,\.]+)")
    for mm in re.finditer(thresh_pat, q):
        op_word, num = mm.group(1), float(mm.group(2).replace(",", ""))
        
        window_fwd = q[mm.end():mm.end() + 40]
        st = _find_stat(window_fwd, 0)
        
        if not st:
            window_bwd = q[max(0, mm.start()-40):mm.start()]
            st = _find_stat(window_bwd, 0)
            
        if not st:
            if 18 <= num <= 50: col = "age"
            else: continue
        else:
            col = st[0]
        
        if op_word in ("over", "more than", "above"): op = ">"
        elif op_word == "at least": op = ">="
        elif op_word in ("under", "less than", "fewer than", "below"): op = "<"
        elif op_word == "at most": op = "<="

        conds.append({"kind": "threshold", "col": col, "op": op, "value": num})
        notes.append(f"{DISPLAY[col]} {op} {num:g}")

    post_pat = r"([\d,\.]+)\s*(\+|or more|or fewer|or less|or higher|or lower|or younger|or older)\s*(%|percent|years old)?"
    for mm in re.finditer(post_pat, q):
        num = float(mm.group(1).replace(",", ""))
        phrase = mm.group(2)
        is_pct = bool(mm.group(3))
        gte = phrase in ("+", "or more", "or higher", "or older")
        
        window_fwd = q[mm.end():mm.end() + 45]
        cut = re.search(r"\b(and|over|more than|at least|above|under|less than|fewer than|below|at most|who|top|bottom|since|before|between|led|for|on)\b", window_fwd)
        stat_window = window_fwd[:cut.start()] if cut else window_fwd
        
        st = _find_stat(stat_window, 0)
        if not st:
            window_bwd = q[max(0, mm.start()-40):mm.start()]
            st = _find_stat(window_bwd, 0)
            
        if not st:
            if 18 <= num <= 50: col = "age"
            else: continue
        else:
            col = st[0]

        if is_pct or col in PCT_STATS:
            num = num / 100.0 if num > 1 else num
        conds.append({"kind": "threshold", "col": col, "op": ">=" if gte else "<=", "value": num})
        shown = f"{num*100:g}%" if col in PCT_STATS else f"{num:g}"
        notes.append(f"{DISPLAY[col]} {'≥' if gte else '≤'} {shown}")

    if not conds:
        raise QueryError("I couldn't find anything to filter on. Try naming a position, a stat with 'top N', a threshold like 'over 4000 passing yards', or 'playoffs'.")
    return conds, notes

def run(df, query):
    conds, notes = parse(query)
    mask = df.index == df.index

    for c in conds:
        if c["kind"] == "position":
            codes = c["value"] if isinstance(c["value"], list) else [c["value"]]
            mask &= df["position"].isin(codes)
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
    return res, notes

RESULT_COLS = ["headshot_url", "player_id", "season", "player_display_name", "position", "recent_team", "games",
               "made_playoffs", "passing_yards", "passing_tds", "completions",
               "completion_pct", "interceptions", "int_rate", "rushing_yards",
               "rushing_tds", "receptions", "receiving_yards", "receiving_tds",
               "total_tds", "fantasy_ppr",
               "tackles", "tackles_for_loss", "sacks", "def_interceptions",
               "passes_defended", "forced_fumbles", "def_tds", "age"]