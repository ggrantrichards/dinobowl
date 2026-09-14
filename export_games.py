"""data/games.parquet -> static/gridiron/games.json, the same shape as data.json.

The browser engine's Table class is generic over {meta, cols}, so a game line
loads into exactly the same machinery as a season line. This file is fetched
only when a question actually asks about a game, so it never costs the ordinary
visitor anything.
"""
import json
import os
from collections import Counter

import pandas as pd

import export_gridiron as eg
import fetch_data as fd
import query_engine as qe

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "games.parquet")
OUT = os.path.join(HERE, "static", "gridiron", "games.json")
# identity for a game line: the season table's identity plus when and against whom
ALWAYS = ["player_id", "season", "week", "opponent", "player_display_name", "position", "recent_team", "playoff_game"]
# THE BOX SCORE, AND NOTHING ELSE. Every column costs ~2 MB across 420,000 game
# lines whatever it holds, so this file carries the stats a question about one
# game can actually use. Season-only sources (PFR, Next Gen, QBR, snap counts)
# have no game grain at all; per-play rates (EPA, CPOE, PACR) and the finely
# split kicking columns are dropped as noise on a single line.
KEEP = [
    "player_id", "player_display_name", "position", "season", "week", "opponent", "recent_team",
    "playoff_game", "games",
    "pass_attempts", "completions", "completion_pct", "passing_yards", "passing_tds", "interceptions",
    "ypa", "passer_rating", "sacks_taken", "pass_first_downs", "pass_yac", "pass_20_plus", "pass_40_plus",
    "carries", "rushing_yards", "rushing_tds", "ypc", "rush_first_downs", "rush_20_plus", "rush_40_plus",
    "targets", "receptions", "catch_pct", "receiving_yards", "receiving_tds", "ypr", "rec_first_downs",
    "rec_yac", "rec_20_plus", "rec_40_plus",
    "total_yards", "total_tds", "tds_accounted", "touches", "turnovers", "fumbles", "fumbles_lost",
    "fantasy_ppr", "special_teams_tds",
    "tackles", "tackles_solo", "tackles_assist", "tackles_for_loss", "sacks", "qb_hits",
    "def_interceptions", "passes_defended", "forced_fumbles", "fumble_recoveries", "def_tds", "int_plus_pd",
    "fg_made", "fg_att", "fg_long", "pat_made", "pat_att", "punt_return_yards", "kickoff_return_yards",
]


def encode(vals, n):
    """A game line is mostly zeros: a quarterback has no tackles and a lineman no
    targets. Storing the most common value once and listing only the rows that
    differ turns 420,000 explicit zeros per column into nothing."""
    common, cnt = Counter(vals).most_common(1)[0]
    if cnt <= n * 0.55:
        return vals
    idx = [i for i, v in enumerate(vals) if v != common]
    out = {"i": idx, "v": [vals[i] for i in idx]}
    if common is not None:
        out["d"] = common
    return out


def main():
    df = pd.read_parquet(SRC)
    df = df[[c for c in KEEP if c in df.columns]]
    df = df.sort_values(["season", "week", "player_display_name"], ascending=[False, False, True]).reset_index(drop=True)
    n = len(df)
    cols = {}
    for c in df.columns:
        vals = [eg.clean(v) for v in df[c].tolist()]
        cols[c] = encode(vals, n)
    meta = {
        "grain": "game",
        "rows": n,
        "seasons": [int(df["season"].min()), int(df["season"].max())],
        "built": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
        "columns": list(df.columns),
        "aliases": [[p, c] for p, c in qe.STAT_ALIASES],
        "positions": qe.POSITIONS,
        "display": dict(qe.DISPLAY, week="week", opponent="opponent", playoff_game="playoff game"),
        "ascending_good": sorted(qe.ASCENDING_GOOD),
        "pct_stats": sorted(qe.PCT_STATS),
        "pp_stats": sorted(qe.PP_STATS),
        "always_cols": [c for c in ALWAYS if c in df.columns],
        "pos_defaults": qe.POS_DEFAULTS,
        "def_codes": sorted(qe.DEF_CODES),
        "def_stat_cols": sorted(qe.DEF_STAT_COLS),
        "rank_desc": fd.RANK_DESC,
        "rate_ranks": [],          # a one-game rate has no qualifying minimum
        "rate_parts": fd.RATE_PARTS,
        "max_cols": fd.MAX_COLS,
        "sum_cols": [],            # a game line is never a career total
        "derived": fd.DERIVED,
        "coverage": {"box_score": fd.START_YEAR},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "cols": cols}, f, separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {OUT}: {n:,} rows, {len(df.columns)} columns, {os.path.getsize(OUT)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
