"""
Gridiron — dataset builder.

Pulls player-season stats from nflverse (open data, MIT) and writes one flat
table, data/players.parquet, that the query engine and the static export read.

    python fetch_data.py            # incremental (per-season cache)
    python fetch_data.py --rebuild  # re-download everything

Sources, all from https://github.com/nflverse/nflverse-data/releases :
  stats_player/stats_player_reg_{year}.parquet   box-score aggregates, 2000-present
  stats_player/stats_player_post_{year}.parquet  used only for "made the playoffs"
  players/players.parquet                        ages, headshots, gsis<->pfr ids
  pfr_advstats/advstats_season_{def,pass,rush,rec}.parquet
                                                 Pro Football Reference advanced
                                                 stats as scraped by nflverse:
                                                 pressures, blitzes, hurries, QB
                                                 knockdowns, coverage, drops,
                                                 pocket time ... 2018-present
  snap_counts/snap_counts_{year}.parquet         offense / defense / ST snaps,
                                                 2012-present (rate denominators)

Every number is either taken as-is from those files or derived from them by a
formula named in DERIVED below. Nothing is estimated. Where a source does not
cover a season the column is NA and the UI shows a dash.
"""
import argparse
import datetime as dt
import json, os
import sys
import numpy as np
import pandas as pd

START_YEAR = 2000
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
OUT_FILE = os.path.join(DATA_DIR, "players.parquet")

BASE = "https://github.com/nflverse/nflverse-data/releases/download/"
REG_URL = BASE + "stats_player/stats_player_reg_{year}.parquet"
POST_URL = BASE + "stats_player/stats_player_post_{year}.parquet"
PLAYERS_URL = BASE + "players/players.parquet"
ADV_URL = BASE + "pfr_advstats/advstats_season_{kind}.parquet"
SNAP_URL = BASE + "snap_counts/snap_counts_{year}.parquet"
QBR_URL = BASE + "espn_data/qbr_season_level.parquet"      # ESPN Total QBR, 2006-present
NGS_URL = BASE + "nextgen_stats/ngs_{kind}.parquet"          # NFL Next Gen Stats, 2016-present
PBP_URL = BASE + "pbp/play_by_play_{year}.parquet"           # every play, 1999-present
PFR_FROM, SNAPS_FROM, QBR_FROM, NGS_FROM = 2018, 2012, 2006, 2016
AIR_YARDS_FROM = 2006     # air yards are charted from 2006; before that the deep-ball columns are NA

# Play-by-play, read one column-pruned slice per season (a few MB, not the whole
# 50 MB file). This is the only way to get length- and depth-qualified numbers
# like "TD passes of 20+ yards" — the season aggregates only carry totals.
PBP_COLS = ["season", "season_type", "passer_player_id", "rusher_player_id", "receiver_player_id",
            "pass_touchdown", "rush_touchdown", "pass_attempt", "complete_pass", "interception",
            "yards_gained", "air_yards", "game_id", "week", "home_team", "away_team", "result"]

# ESPN Total QBR (season totals, regular season). player_id there is the ESPN
# id; players.parquet maps it to gsis.
QBR_COLS = {"qbr_total": "qbr", "qbr_raw": "qbr_raw", "pts_added": "qbr_pts_added",
            "qb_plays": "qbr_plays", "epa_total": "qbr_epa_total"}
# Next Gen Stats season rows (week 0), keyed by gsis id.
NGS_COLS = {
    "passing": {"avg_time_to_throw": "time_to_throw", "avg_completed_air_yards": "ngs_cay",
                "avg_intended_air_yards": "ngs_iay", "avg_air_yards_differential": "air_yards_diff",
                "aggressiveness": "aggressiveness", "max_completed_air_distance": "max_completed_air",
                "avg_air_yards_to_sticks": "air_yards_to_sticks",
                "expected_completion_percentage": "xcomp_pct",
                "completion_percentage_above_expectation": "cpoe_ngs"},
    "rushing": {"efficiency": "rush_efficiency", "percent_attempts_gte_eight_defenders": "stacked_box_pct",
                "avg_time_to_los": "time_to_los", "expected_rush_yards": "x_rush_yards",
                "rush_yards_over_expected": "ryoe", "rush_yards_over_expected_per_att": "ryoe_per_att",
                "rush_pct_over_expected": "rush_pct_oe"},
    "receiving": {"avg_cushion": "cushion", "avg_separation": "separation",
                  "avg_intended_air_yards": "rec_iay", "percent_share_of_intended_air_yards": "iay_share",
                  "avg_yac_above_expectation": "yac_oe", "avg_expected_yac": "x_yac"},
}
NGS_PCT = {"aggressiveness", "stacked_box_pct", "iay_share", "xcomp_pct"}   # arrive 0-100

# nflverse column -> our column. Names on the right are what the engine, the
# UI and the static export all use.
STAT_COLS = {
    # passing
    "passing_yards": "passing_yards", "passing_tds": "passing_tds",
    "passing_interceptions": "interceptions", "attempts": "pass_attempts",
    "completions": "completions", "sacks_suffered": "sacks_taken",
    "sack_yards_lost": "sack_yards_lost", "sack_fumbles": "sack_fumbles",
    "sack_fumbles_lost": "sack_fumbles_lost", "passing_air_yards": "pass_air_yards",
    "passing_yards_after_catch": "pass_yac", "passing_first_downs": "pass_first_downs",
    "passing_epa": "pass_epa", "passing_2pt_conversions": "pass_2pt",
    "passing_cpoe": "cpoe", "pacr": "pacr",
    "passing_20": "pass_20_plus", "passing_40": "pass_40_plus",
    # rushing
    "carries": "carries", "rushing_yards": "rushing_yards", "rushing_tds": "rushing_tds",
    "rushing_fumbles": "rushing_fumbles", "rushing_fumbles_lost": "rushing_fumbles_lost",
    "rushing_first_downs": "rush_first_downs", "rushing_epa": "rush_epa",
    "rushing_20": "rush_20_plus", "rushing_40": "rush_40_plus",
    # receiving
    "targets": "targets", "receptions": "receptions", "receiving_yards": "receiving_yards",
    "receiving_tds": "receiving_tds", "receiving_fumbles": "receiving_fumbles",
    "receiving_fumbles_lost": "receiving_fumbles_lost", "receiving_air_yards": "rec_air_yards",
    "receiving_yards_after_catch": "rec_yac", "receiving_first_downs": "rec_first_downs",
    "receiving_epa": "rec_epa", "racr": "racr", "target_share": "target_share",
    "receiving_20": "rec_20_plus", "receiving_40": "rec_40_plus",
    "air_yards_share": "air_yards_share", "wopr": "wopr",
    # ball security, misc
    "fumbles_total": "fumbles", "fumbles_lost_total": "fumbles_lost",
    "special_teams_tds": "special_teams_tds", "penalties": "penalties",
    "penalty_yards": "penalty_yards",
    "fantasy_points_ppr": "fantasy_ppr", "fantasy_points": "fantasy_std",
    # defense
    "def_tackles_solo": "tackles_solo", "def_tackles_with_assist": "tackles_wa",
    "def_tackle_assists": "tackles_assist", "def_tackles_for_loss": "tackles_for_loss",
    "def_tackles_for_loss_yards": "tfl_yards", "def_sacks": "sacks",
    "def_sack_yards": "sack_yards", "def_qb_hits": "qb_hits",
    "def_interceptions": "def_interceptions", "def_interception_yards": "def_int_yards",
    "def_pass_defended": "passes_defended", "def_fumbles_forced": "forced_fumbles",
    "def_tds": "def_tds", "def_fumbles": "def_fumbles", "def_safeties": "safeties",
    "fumble_recovery_opp": "fumble_recoveries", "fumble_recovery_own": "fumble_rec_own",
    "fumble_recovery_tds": "fumble_rec_tds",
    # returns + kicking
    "punt_returns": "punt_returns", "punt_return_yards": "punt_return_yards",
    "kickoff_returns": "kickoff_returns", "kickoff_return_yards": "kickoff_return_yards",
    "fg_made": "fg_made", "fg_att": "fg_att", "fg_pct": "fg_pct", "fg_long": "fg_long",
    "pat_made": "pat_made", "pat_att": "pat_att",
    "pt_att": "punts", "pt_yards": "punt_yards", "pt_inside_20": "punts_inside_20",
}
ID_COLS = ["player_id", "player_display_name", "position", "position_group",
           "recent_team", "season", "games"]

# PFR advanced stats: file kind -> {pfr column: our column}. Percent columns
# arrive as 0-100 and are stored as fractions like every other rate here.
ADV_COLS = {
    "def": {"bltz": "blitzes", "hrry": "hurries", "qbkd": "qb_knockdowns", "prss": "pressures",
            "comb": "pfr_comb_tackles", "m_tkl": "missed_tackles", "m_tkl_percent": "missed_tackle_pct",
            "tgt": "cov_targets", "cmp": "cov_completions", "cmp_percent": "cov_cmp_pct",
            "yds": "cov_yards", "td": "cov_tds", "rat": "cov_rating", "dadot": "cov_adot"},
    "pass": {"times_blitzed": "times_blitzed", "times_hurried": "times_hurried", "times_hit": "times_hit",
             "times_pressured": "times_pressured", "pressure_pct": "pressured_pct", "pocket_time": "pocket_time",
             "drops": "drops_suffered", "drop_pct": "drop_pct_suffered", "bad_throws": "bad_throws",
             "bad_throw_pct": "bad_throw_pct", "on_tgt_pct": "on_target_pct", "throwaways": "throwaways",
             "scrambles": "scrambles", "intended_air_yards_per_pass_attempt": "iay_per_att"},
    "rush": {"ybc_att": "ybc_per_att", "yac_att": "yac_per_att", "brk_tkl": "broken_tackles_rush"},
    "rec": {"drop": "drops", "drop_percent": "drop_pct", "adot": "adot", "brk_tkl": "broken_tackles_rec",
            "yac_r": "rec_yac_per_rec"},
}
ADV_PCT = {"missed_tackle_pct", "cov_cmp_pct", "pressured_pct", "drop_pct_suffered", "bad_throw_pct",
           "on_target_pct", "drop_pct"}

# Counting stats ranked per season, highest = 1, among players with a
# non-zero value.
RANK_DESC = ["passing_yards", "passing_tds", "pass_attempts", "completions", "pass_first_downs",
             "carries", "rushing_yards", "rushing_tds", "rush_first_downs",
             "targets", "receptions", "receiving_yards", "receiving_tds", "rec_first_downs", "rec_yac",
             "fantasy_ppr", "total_tds", "total_yards",
             "tackles", "tackles_solo", "tackles_for_loss", "sacks", "qb_hits", "def_interceptions",
             "passes_defended", "forced_fumbles", "fumble_recoveries", "def_tds", "int_tds", "fumble_rec_tds",
             "int_plus_pd", "def_int_yards", "tfl_yards", "safeties",
             "pressures", "hurries", "qb_knockdowns", "blitzes",
             "pass_td_20", "pass_td_40", "rush_td_20", "rush_td_40", "rec_td_20", "rec_td_40",
             "pass_20_plus", "pass_40_plus", "rush_20_plus", "rush_40_plus", "rec_20_plus", "rec_40_plus",
             "deep_att", "deep_cmp", "deep_yards", "deep_td", "deep_targets", "deep_recs", "deep_rec_yards", "deep_rec_td",
             "fg_made", "punt_return_yards", "kickoff_return_yards", "special_teams_tds"]
# Rate stats ranked per season with a QUALIFIER so a one-attempt season cannot
# lead the league. (col, ascending_is_better, qualifier column, minimum per
# scheduled game -- or an absolute minimum when per_game is False). The same
# table is exported for the browser engine, so both rank identically.
RATE_RANKS = [
    ("int_rate", True, "pass_attempts", 14, True),
    ("completion_pct", False, "pass_attempts", 14, True),
    ("td_pct", False, "pass_attempts", 14, True),
    ("ypa", False, "pass_attempts", 14, True),
    ("passer_rating", False, "pass_attempts", 14, True),
    ("sack_pct", True, "pass_attempts", 14, True),
    ("pressured_pct", True, "pass_attempts", 14, True),
    ("bad_throw_pct", True, "pass_attempts", 14, True),
    ("on_target_pct", False, "pass_attempts", 14, True),
    ("pass_ypg", False, "pass_attempts", 14, True),
    ("turnover_pct", True, "touches", 6.25, True),
    ("ypc", False, "carries", 6.25, True),
    ("rush_ypg", False, "carries", 6.25, True),
    ("ybc_per_att", False, "carries", 6.25, True),
    ("yac_per_att", False, "carries", 6.25, True),
    ("ypr", False, "receptions", 2.5, True),
    ("catch_pct", False, "targets", 2.5, True),
    ("drop_pct", True, "targets", 2.5, True),
    ("rec_ypg", False, "targets", 2.5, True),
    ("total_ypg", False, "touches", 6.25, True),
    ("pressure_rate", False, "def_snaps", 200, False),
    ("blitz_pct", False, "def_snaps", 200, False),
    ("qb_hit_rate", False, "def_snaps", 200, False),
    ("sack_per_blitz", False, "blitzes", 25, False),
    ("missed_tackle_pct", True, "pfr_comb_tackles", 30, False),
    ("cov_cmp_pct", True, "cov_targets", 30, False),
    ("cov_rating", True, "cov_targets", 30, False),
    ("tackles_per_game", False, "games", 8, False),
    ("fg_pct", False, "fg_att", 16, False),
    # efficiency: EPA, CPOE, ESPN QBR, Next Gen Stats
    ("epa_per_play", False, "touches", 6.25, True),
    ("pass_epa_per_play", False, "pass_attempts", 14, True),
    ("rush_epa_per_carry", False, "carries", 6.25, True),
    ("rec_epa_per_target", False, "targets", 2.5, True),
    ("cpoe", False, "pass_attempts", 14, True),
    ("qbr", False, "qbr_plays", 200, False),
    ("time_to_throw", True, "pass_attempts", 14, True),
    ("aggressiveness", False, "pass_attempts", 14, True),
    ("cpoe_ngs", False, "pass_attempts", 14, True),
    ("ryoe_per_att", False, "carries", 6.25, True),
    ("rush_efficiency", True, "carries", 6.25, True),
    ("separation", False, "targets", 2.5, True),
    ("yac_oe", False, "targets", 2.5, True),
    ("pacr", False, "pass_attempts", 14, True),
    ("racr", False, "targets", 2.5, True),
    ("target_share", False, "targets", 2.5, True),
    ("wopr", False, "targets", 2.5, True),
    # lowest-is-best counting stats need a qualifier too, or a backup with one
    # attempt "leads the league" in fewest interceptions
    ("deep_cmp_pct", False, "deep_att", 20, False),
    ("interceptions", True, "pass_attempts", 14, True),
    ("sacks_taken", True, "pass_attempts", 14, True),
    ("fumbles_lost", True, "touches", 6.25, True),
    ("fumbles", True, "touches", 6.25, True),
    ("turnovers", True, "touches", 6.25, True),
    ("drops", True, "targets", 2.5, True),
    ("missed_tackles", True, "pfr_comb_tackles", 30, False),
]

# Formulas, for the glossary and for anyone checking the numbers.
DERIVED = {
    "playoff_wins": "postseason games the player's playoff team won that season (0 if the team missed the playoffs)",
    "super_bowl_wins": "1 in a season the player's team won the Super Bowl; ask for 'most Super Bowl wins' to count rings across seasons",
    "completion_pct": "completions / pass_attempts",
    "int_rate": "interceptions / pass_attempts",
    "td_pct": "passing_tds / pass_attempts",
    "ypa": "passing_yards / pass_attempts",
    "sack_pct": "sacks_taken / (pass_attempts + sacks_taken)",
    "passer_rating": "NFL passer rating (cmp%, yds/att, td%, int% components, each capped 0-2.375)",
    "pass_ypg": "passing_yards / games",
    "ypc": "rushing_yards / carries",
    "rush_ypg": "rushing_yards / games",
    "ypr": "receiving_yards / receptions",
    "catch_pct": "receptions / targets",
    "rec_ypg": "receiving_yards / games",
    "total_yards": "passing_yards + rushing_yards + receiving_yards",
    "total_ypg": "total_yards / games",
    "total_tds": "rushing_tds + receiving_tds + special_teams_tds — touchdowns the player SCORED (a QB's TD passes are passing_tds)",
    "touches": "pass_attempts + carries + receptions + sacks_taken",
    "turnovers": "interceptions + fumbles_lost",
    "turnover_pct": "turnovers / touches",
    "tackles": "solo + with-assist + assists (press total tackles)",
    "tackles_per_game": "tackles / games",
    "pressure_rate": "PFR pressures / defensive snaps (all defensive snaps, not pass-rush snaps only)",
    "blitz_pct": "PFR blitzes / defensive snaps",
    "qb_hit_rate": "qb_hits / defensive snaps",
    "sack_per_blitz": "sacks / PFR blitzes",
    "missed_tackle_pct": "PFR missed tackles / (PFR combined tackles + missed tackles)",
    "cov_cmp_pct": "PFR completions allowed / targets as the nearest defender",
    "cov_rating": "PFR passer rating allowed when targeted",
    "pressured_pct": "PFR times pressured / pass attempts (QB)",
    "drop_pct": "PFR drops / targets (receiver)",
    "epa_per_play": "(pass_epa + rush_epa + rec_epa) / touches — nflverse EPA from play-by-play",
    "pass_epa_per_play": "pass_epa / (pass_attempts + sacks_taken)",
    "rush_epa_per_carry": "rush_epa / carries",
    "rec_epa_per_target": "rec_epa / targets",
    "cpoe": "completion % over expected (nflverse model), per attempt, in percentage points",
    "qbr": "ESPN Total QBR, season total, regular season (0-100)",
    "pacr": "passing_yards / pass_air_yards (Passing Air Conversion Ratio)",
    "racr": "receiving_yards / rec_air_yards (Receiver Air Conversion Ratio)",
    "target_share": "share of team targets", "wopr": "1.5 x target share + 0.7 x air-yards share",
    "time_to_throw": "NGS average seconds from snap to throw",
    "aggressiveness": "NGS share of attempts into tight windows (defender within 1 yd)",
    "cpoe_ngs": "NGS completion % above expectation (percentage points)",
    "ryoe_per_att": "NGS rush yards over expected per attempt",
    "rush_efficiency": "NGS yards run per yard gained (lower = more north-south)",
    "separation": "NGS average yards of separation at catch/incompletion",
    "cushion": "NGS average yards of cushion at the snap",
    "yac_oe": "NGS yards after catch above expectation, per reception",
    "pass_td_20": "TD passes that gained 20+ yards (play-by-play)",
    "pass_td_40": "TD passes that gained 40+ yards (play-by-play)",
    "rush_td_20": "rushing TDs of 20+ yards", "rush_td_40": "rushing TDs of 40+ yards",
    "rec_td_20": "receiving TDs of 20+ yards", "rec_td_40": "receiving TDs of 40+ yards",
    "pass_20_plus": "completions of 20+ yards", "pass_40_plus": "completions of 40+ yards",
    "rush_20_plus": "runs of 20+ yards", "rush_40_plus": "runs of 40+ yards",
    "rec_20_plus": "catches of 20+ yards", "rec_40_plus": "catches of 40+ yards",
    "deep_att": "pass attempts with 20+ air yards (2006+)",
    "deep_cmp": "completions with 20+ air yards", "deep_cmp_pct": "deep_cmp / deep_att",
    "deep_yards": "yards on completions with 20+ air yards", "deep_td": "TDs on passes with 20+ air yards",
    "deep_int": "interceptions on passes with 20+ air yards",
    "deep_targets": "targets with 20+ air yards", "deep_recs": "catches with 20+ air yards",
    "deep_rec_yards": "yards on catches with 20+ air yards", "deep_rec_td": "TDs on catches with 20+ air yards",
}

def current_year():
    today = dt.date.today()
    return today.year if today.month >= 9 else today.year - 1

def _read(url):
    return pd.read_parquet(url)

def _rate(num, den):
    den = den.fillna(0)
    return (num.fillna(0) / den.where(den > 0)).round(4)

def passer_rating(cmp, att, yds, td, ints):
    a = ((cmp / att) - 0.3) * 5
    b = ((yds / att) - 3) * 0.25
    c = (td / att) * 20
    d = 2.375 - (ints / att) * 25
    tot = sum(x.clip(lower=0, upper=2.375) for x in (a, b, c, d))
    return (tot / 6 * 100).round(1)

def load_season(year, rebuild=False):
    cache = os.path.join(CACHE_DIR, f"season_{year}.parquet")
    if os.path.exists(cache) and not rebuild:
        return pd.read_parquet(cache)
    try:
        reg = _read(REG_URL.format(year=year))
    except Exception as e:
        print(f"  ! no regular-season file for {year} ({e}); skipping")
        return None
    playoff_ids, post_team = set(), pd.Series(dtype=object)
    try:
        post = _read(POST_URL.format(year=year))
        playoff_ids = set(post["player_id"].dropna().unique())
        post_team = post.dropna(subset=["player_id"]).drop_duplicates("player_id").set_index("player_id")["recent_team"]
    except Exception:
        pass

    have = [c for c in STAT_COLS if c in reg.columns]
    keep = [c for c in ID_COLS if c in reg.columns] + have
    df = reg[keep].copy().rename(columns=STAT_COLS)
    df["made_playoffs"] = df["player_id"].isin(playoff_ids)
    df["post_team"] = df["player_id"].map(post_team)

    g = df["games"].fillna(0)
    att = df["pass_attempts"].fillna(0) if "pass_attempts" in df else pd.Series(0, index=df.index)
    if "interceptions" in df: df["int_rate"] = _rate(df["interceptions"], att)
    if "completions" in df: df["completion_pct"] = _rate(df["completions"], att)
    if "passing_tds" in df: df["td_pct"] = _rate(df["passing_tds"], att)
    if "passing_yards" in df:
        df["ypa"] = (df["passing_yards"].fillna(0) / att.where(att > 0)).round(2)
        df["pass_ypg"] = (df["passing_yards"].fillna(0) / g.where(g > 0)).where(att > 0).round(1)
    if "sacks_taken" in df:
        drop = att + df["sacks_taken"].fillna(0)
        df["sack_pct"] = (df["sacks_taken"].fillna(0) / drop.where(drop > 0)).round(4)
    if all(c in df for c in ("completions", "passing_yards", "passing_tds", "interceptions")):
        ok = att > 0
        df["passer_rating"] = passer_rating(df["completions"].fillna(0)[ok], att[ok], df["passing_yards"].fillna(0)[ok],
                                            df["passing_tds"].fillna(0)[ok], df["interceptions"].fillna(0)[ok])
    car = df["carries"].fillna(0) if "carries" in df else pd.Series(0, index=df.index)
    if "rushing_yards" in df:
        df["ypc"] = (df["rushing_yards"].fillna(0) / car.where(car > 0)).round(2)
        df["rush_ypg"] = (df["rushing_yards"].fillna(0) / g.where(g > 0)).where(car > 0).round(1)
    rec = df["receptions"].fillna(0) if "receptions" in df else pd.Series(0, index=df.index)
    tgt = df["targets"].fillna(0) if "targets" in df else pd.Series(0, index=df.index)
    if "receiving_yards" in df:
        df["ypr"] = (df["receiving_yards"].fillna(0) / rec.where(rec > 0)).round(2)
        df["rec_ypg"] = (df["receiving_yards"].fillna(0) / g.where(g > 0)).where(tgt > 0).round(1)
    if "receptions" in df: df["catch_pct"] = _rate(rec, tgt)
    yd_parts = [c for c in ("passing_yards", "rushing_yards", "receiving_yards") if c in df]
    if yd_parts:
        df["total_yards"] = df[yd_parts].fillna(0).sum(axis=1).astype(int)
        df["total_ypg"] = (df["total_yards"] / g.where(g > 0)).where(df["total_yards"] != 0).round(1)
    td_parts = [c for c in ("rushing_tds", "receiving_tds", "special_teams_tds") if c in df]
    if td_parts:
        df["total_tds"] = df[td_parts].fillna(0).sum(axis=1).astype(int)
    sk = df["sacks_taken"].fillna(0) if "sacks_taken" in df else 0
    df["touches"] = (att + car + rec + sk).astype(int)
    if "fumbles_lost" in df and "interceptions" in df:
        df["turnovers"] = (df["interceptions"].fillna(0) + df["fumbles_lost"].fillna(0)).astype(int)
        df["turnover_pct"] = (df["turnovers"] / df["touches"].where(df["touches"] > 0)).round(4)
    # EPA per play, from nflverse play-by-play EPA totals
    epa_parts = [c for c in ("pass_epa", "rush_epa", "rec_epa") if c in df]
    if epa_parts:
        tot = df[epa_parts].sum(axis=1, min_count=1)
        df["epa_per_play"] = (tot / df["touches"].where(df["touches"] > 0)).round(3)
    if "pass_epa" in df:
        drop = att + (df["sacks_taken"].fillna(0) if "sacks_taken" in df else 0)
        df["pass_epa_per_play"] = (df["pass_epa"] / drop.where(drop > 0)).round(3)
    if "rush_epa" in df: df["rush_epa_per_carry"] = (df["rush_epa"] / car.where(car > 0)).round(3)
    if "rec_epa" in df: df["rec_epa_per_target"] = (df["rec_epa"] / tgt.where(tgt > 0)).round(3)
    # combined tackles; NA when the player has no defensive line at all
    parts = [c for c in ("tackles_solo", "tackles_wa", "tackles_assist") if c in df]
    if parts:
        combined = sum(df[c].fillna(0) for c in parts)
        all_na = df[parts].isna().all(axis=1)
        df["tackles"] = combined.where(~all_na)
        df["tackles_per_game"] = (df["tackles"] / g.where(g > 0)).round(1)
        df = df.drop(columns=[c for c in ("tackles_wa", "tackles_assist") if c in df])
    os.makedirs(CACHE_DIR, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df

def load_pbp(year, rebuild=False):
    """Per-player big-play and deep-ball counts for one season, from play-by-play."""
    cache = os.path.join(CACHE_DIR, f"pbp_{year}.parquet")
    jcache = os.path.join(CACHE_DIR, f"post_{year}.json")
    if os.path.exists(cache) and os.path.exists(jcache) and not rebuild:
        return pd.read_parquet(cache)
    try:
        p = pd.read_parquet(PBP_URL.format(year=year), columns=PBP_COLS)
    except Exception as e:
        print(f"  ! no play-by-play for {year} ({e})")
        return None
    os.makedirs(CACHE_DIR, exist_ok=True)
    # who won each playoff game: `result` is home score minus away score, and
    # the Super Bowl is the last week of the postseason
    post = p[(p["season_type"] == "POST") & p["result"].notna()].groupby("game_id").first()
    wins, sb = {}, None
    if len(post):
        post["winner"] = np.where(post["result"] > 0, post["home_team"], post["away_team"])
        wins = post["winner"].value_counts().to_dict()
        sb = post.loc[post["week"].idxmax(), "winner"]
    json.dump({"wins": {k: int(v) for k, v in wins.items()}, "super_bowl": sb}, open(jcache, "w"))
    p = p[p["season_type"] == "REG"].copy()
    has_air = p["air_yards"].notna().any()
    yds, air = p["yards_gained"], p["air_yards"]
    ptd, rtd = p["pass_touchdown"] == 1, p["rush_touchdown"] == 1
    deep = air >= 20                              # the standard deep-ball line
    frames = []

    def roll(id_col, spec):
        d = p[p[id_col].notna()]
        if d.empty:
            return None
        out = pd.DataFrame({k: v.loc[d.index] for k, v in spec.items()})
        out[id_col] = d[id_col].values
        g = out.groupby(id_col).sum()
        g.index.name = "player_id"
        return g

    frames.append(roll("passer_player_id", {
        "pass_td_20": (ptd & (yds >= 20)).astype(int),
        "pass_td_40": (ptd & (yds >= 40)).astype(int),
        "deep_att": (deep & (p["pass_attempt"] == 1)).astype(int),
        "deep_cmp": (deep & (p["complete_pass"] == 1)).astype(int),
        "deep_yards": (deep & (p["complete_pass"] == 1)).astype(int) * yds.fillna(0),
        "deep_td": (deep & ptd).astype(int),
        "deep_int": (deep & (p["interception"] == 1)).astype(int),
    }))
    frames.append(roll("rusher_player_id", {
        "rush_td_20": (rtd & (yds >= 20)).astype(int),
        "rush_td_40": (rtd & (yds >= 40)).astype(int),
    }))
    frames.append(roll("receiver_player_id", {
        "rec_td_20": (ptd & (yds >= 20)).astype(int),
        "rec_td_40": (ptd & (yds >= 40)).astype(int),
        "deep_targets": (deep & (p["pass_attempt"] == 1)).astype(int),
        "deep_recs": (deep & (p["complete_pass"] == 1)).astype(int),
        "deep_rec_yards": (deep & (p["complete_pass"] == 1)).astype(int) * yds.fillna(0),
        "deep_rec_td": (deep & ptd).astype(int),
    }))
    frames = [f for f in frames if f is not None]
    if not frames:
        return None
    out = frames[0]
    for f in frames[1:]:
        out = out.join(f, how="outer")
    out = out.reset_index()
    out["season"] = year
    if not has_air:
        for c in ("deep_att", "deep_cmp", "deep_yards", "deep_td", "deep_int",
                  "deep_targets", "deep_recs", "deep_rec_yards", "deep_rec_td"):
            out[c] = np.nan
    out.to_parquet(cache, index=False)
    return out

def playoff_results(year):
    """{team: playoff wins} and the Super Bowl winner, from load_pbp's cache."""
    jcache = os.path.join(CACHE_DIR, f"post_{year}.json")
    if not os.path.exists(jcache):
        return {}, None
    j = json.load(open(jcache))
    return j["wins"], j["super_bowl"]

def load_advstats(pfr_to_gsis):
    """PFR advanced stats, one row per (player, season), keyed back to gsis ids."""
    frames = []
    for kind, cols in ADV_COLS.items():
        try:
            adv = _read(ADV_URL.format(kind=kind))
        except Exception as e:
            print(f"  ! PFR advanced {kind} unavailable ({e})")
            continue
        adv = adv[adv["pfr_id"].notna()].copy()
        # a traded player has per-team rows and a combined row; keep the one
        # with the most games/attempts so the season total survives
        size_col = next((c for c in ("g", "pass_attempts", "att", "tgt") if c in adv.columns), None)
        if size_col:
            adv = adv.sort_values(size_col, ascending=False)
        adv = adv.drop_duplicates(subset=["pfr_id", "season"])
        keep = {k: v for k, v in cols.items() if k in adv.columns}
        part = adv[["pfr_id", "season"] + list(keep)].rename(columns=keep)
        part["player_id"] = part["pfr_id"].map(pfr_to_gsis)
        part = part[part["player_id"].notna()].drop(columns=["pfr_id"])
        for c in keep.values():
            if c in ADV_PCT:
                # PFR's files are not consistent: the passing file stores
                # percents (0-100), the defense and receiving files store
                # fractions (0-1). Detect per column rather than assume.
                v = pd.to_numeric(part[c], errors="coerce")
                part[c] = (v / 100 if v.max() > 1.5 else v).round(4)
        frames.append(part.set_index(["player_id", "season"]))
        print(f"  PFR {kind}: {len(part):,} player-seasons")
    if not frames:
        return None
    out = frames[0]
    for f in frames[1:]:
        out = out.join(f, how="outer")
    return out.reset_index()

def load_snaps(years, pfr_to_gsis, rebuild=False):
    frames = []
    for year in years:
        cache = os.path.join(CACHE_DIR, f"snaps_{year}.parquet")
        try:
            if os.path.exists(cache) and not rebuild:
                s = pd.read_parquet(cache)
            else:
                s = _read(SNAP_URL.format(year=year))
                s = s[s["game_type"] == "REG"]
                s = s.groupby(["pfr_player_id", "season"], as_index=False)[["offense_snaps", "defense_snaps", "st_snaps"]].sum()
                os.makedirs(CACHE_DIR, exist_ok=True)
                s.to_parquet(cache, index=False)
        except Exception as e:
            print(f"  ! snap counts {year} unavailable ({e})")
            continue
        frames.append(s)
    if not frames:
        return None
    snaps = pd.concat(frames, ignore_index=True)
    snaps["player_id"] = snaps["pfr_player_id"].map(pfr_to_gsis)
    snaps = snaps[snaps["player_id"].notna()].drop(columns=["pfr_player_id"])
    return snaps.rename(columns={"offense_snaps": "off_snaps", "defense_snaps": "def_snaps"})

def load_qbr(espn_to_gsis):
    """ESPN Total QBR season totals (regular season), keyed back to gsis ids."""
    try:
        q = _read(QBR_URL)
    except Exception as e:
        print(f"  ! ESPN QBR unavailable ({e})"); return None
    q = q[(q["season_type"] == "Regular") & (q["game_week"] == "Season Total")].copy()
    q["player_id"] = q["player_id"].astype(str).map(espn_to_gsis)
    q = q[q["player_id"].notna()]
    keep = {k: v for k, v in QBR_COLS.items() if k in q.columns}
    q = q[["player_id", "season"] + list(keep)].rename(columns=keep)
    q = q.sort_values("qbr_plays", ascending=False).drop_duplicates(subset=["player_id", "season"])
    print(f"  ESPN QBR: {len(q):,} QB-seasons")
    return q

def load_ngs():
    """Next Gen Stats season rows (week 0), regular season, keyed by gsis id."""
    frames = []
    for kind, cols in NGS_COLS.items():
        try:
            n = _read(NGS_URL.format(kind=kind))
        except Exception as e:
            print(f"  ! NGS {kind} unavailable ({e})"); continue
        n = n[(n["week"] == 0) & (n["season_type"] == "REG") & n["player_gsis_id"].notna()].copy()
        keep = {k: v for k, v in cols.items() if k in n.columns}
        part = n[["player_gsis_id", "season"] + list(keep)].rename(columns=dict(keep, player_gsis_id="player_id"))
        for c in keep.values():
            if c in NGS_PCT:
                part[c] = (pd.to_numeric(part[c], errors="coerce") / 100).round(4)
        part = part.drop_duplicates(subset=["player_id", "season"]).set_index(["player_id", "season"])
        frames.append(part)
        print(f"  NGS {kind}: {len(part):,} player-seasons")
    if not frames:
        return None
    out = frames[0]
    for f in frames[1:]:
        out = out.join(f, how="outer")
    return out.reset_index()

def add_ranks(df):
    out = []
    for season, grp in df.groupby("season"):
        grp = grp.copy()
        sched = 17 if season >= 2021 else 16
        for stat in RANK_DESC:
            if stat in grp:
                mask = grp[stat].fillna(0) > 0
                grp.loc[mask, f"{stat}_rank"] = grp.loc[mask, stat].rank(ascending=False, method="min").astype("Int64")
        for col, asc, qual, minimum, per_game in RATE_RANKS:
            if col not in grp or qual not in grp:
                continue
            need = minimum * sched if per_game else minimum
            q = (grp[qual].fillna(0) >= need) & grp[col].notna()
            grp.loc[q, f"{col}_rank"] = grp.loc[q, col].rank(ascending=asc, method="min").astype("Int64")
        out.append(grp)
    return pd.concat(out, ignore_index=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="re-download every season")
    args = ap.parse_args()
    os.makedirs(DATA_DIR, exist_ok=True)
    end = current_year()
    print(f"Building NFL player dataset {START_YEAR}-{end} from nflverse...")

    print("Players database (ages, headshots, id map)...")
    players = pd.DataFrame(); pfr_to_gsis = {}
    try:
        players = pd.read_parquet(PLAYERS_URL)
        if "pfr_id" in players.columns and "gsis_id" in players.columns:
            m = players[["pfr_id", "gsis_id"]].dropna().drop_duplicates(subset=["pfr_id"])
            pfr_to_gsis = dict(zip(m["pfr_id"], m["gsis_id"]))
        players = players.drop_duplicates(subset=["gsis_id"]).set_index("gsis_id")
    except Exception as e:
        print(f"Could not fetch global players DB: {e}")

    frames = []
    for year in range(START_YEAR, end + 1):
        print(f"[{year}]")
        s = load_season(year, rebuild=args.rebuild)
        if s is None or not len(s):
            continue
        if not players.empty and "birth_date" in players.columns:
            birth_years = pd.to_datetime(players["birth_date"], errors="coerce").dt.year
            s["age"] = year - s["player_id"].map(birth_years)
        else:
            s["age"] = pd.NA
        s["headshot_url"] = s["player_id"].map(players["headshot"]) if "headshot" in players.columns else pd.NA
        # bio: height (inches), weight (lbs), college, draft slot, rookie year
        for src, dst in (("height", "height"), ("weight", "weight"), ("college_name", "college"),
                         ("draft_year", "draft_year"), ("draft_round", "draft_round"),
                         ("draft_pick", "draft_pick"), ("rookie_season", "rookie_season")):
            s[dst] = s["player_id"].map(players[src]) if src in players.columns else pd.NA
        if "rookie_season" in s:
            s["experience"] = (year - pd.to_numeric(s["rookie_season"], errors="coerce")).astype("Float64")
        frames.append(s)
    if not frames:
        print("No data pulled. Check your network connection.")
        sys.exit(1)
    df = pd.concat(frames, ignore_index=True)
    df = df[df["player_id"].notna()].copy()   # nflverse ships one id-less team-total line per season
    # defensive TD split: nflverse gives fumble-return TDs on their own; the
    # rest of a player's defensive TDs are interception returns
    if "def_tds" in df and "fumble_rec_tds" in df:
        df["int_tds"] = (df["def_tds"].fillna(0) - df["fumble_rec_tds"].fillna(0)).clip(lower=0).where(df["def_tds"].notna())
    if "def_interceptions" in df and "passes_defended" in df:
        df["int_plus_pd"] = (df["def_interceptions"].fillna(0) + df["passes_defended"].fillna(0)).where(df["def_interceptions"].notna() | df["passes_defended"].notna())

    print("PFR advanced stats (2018+)...")
    adv = load_advstats(pfr_to_gsis) if pfr_to_gsis else None
    if adv is not None:
        df = df.merge(adv, on=["player_id", "season"], how="left")
    print("Snap counts (2012+)...")
    snaps = load_snaps(range(max(SNAPS_FROM, START_YEAR), end + 1), pfr_to_gsis, rebuild=args.rebuild) if pfr_to_gsis else None
    if snaps is not None:
        df = df.merge(snaps, on=["player_id", "season"], how="left")
        ds = df["def_snaps"]
        if "pressures" in df: df["pressure_rate"] = (df["pressures"] / ds.where(ds > 0)).round(4)
        if "blitzes" in df:
            df["blitz_pct"] = (df["blitzes"] / ds.where(ds > 0)).round(4)
            bl = df["blitzes"]
            df["sack_per_blitz"] = (df["sacks"].fillna(0) / bl.where(bl > 0)).round(3)
        if "qb_hits" in df: df["qb_hit_rate"] = (df["qb_hits"] / ds.where(ds > 0)).round(4)
    print("Play-by-play big plays and deep balls...")
    pbp = []
    for year in range(START_YEAR, end + 1):
        one = load_pbp(year, rebuild=args.rebuild)
        if one is not None:
            pbp.append(one)
            print(f"  {year}: {len(one):,} players")
    if pbp:
        df = df.merge(pd.concat(pbp, ignore_index=True), on=["player_id", "season"], how="left")
        for c in ("deep_att", "deep_cmp", "deep_yards", "deep_td", "deep_int", "deep_targets", "deep_recs", "deep_rec_yards", "deep_rec_td"):
            df[c] = pd.to_numeric(df[c], errors="coerce")   # seasons without air yards carry NA
        da = df["deep_att"]
        df["deep_cmp_pct"] = (df["deep_cmp"] / da.where(da > 0)).round(4)
    print("Playoff wins and Super Bowls...")
    df["playoff_wins"], df["super_bowl_wins"] = 0, 0
    for year in range(START_YEAR, end + 1):
        wins, sb = playoff_results(year)
        yr = (df["season"] == year) & df["made_playoffs"]
        df.loc[yr, "playoff_wins"] = df.loc[yr, "post_team"].map(wins).fillna(0).astype(int)
        if sb:
            df.loc[yr & (df["post_team"] == sb), "super_bowl_wins"] = 1
    df = df.drop(columns=["post_team"])

    print("ESPN Total QBR (2006+)...")
    espn_to_gsis = {}
    if not players.empty and "espn_id" in players.columns:
        m = players.reset_index()[["espn_id", "gsis_id"]].dropna()
        espn_to_gsis = dict(zip(m["espn_id"].astype(str), m["gsis_id"]))
    qbr = load_qbr(espn_to_gsis) if espn_to_gsis else None
    if qbr is not None:
        df = df.merge(qbr, on=["player_id", "season"], how="left")
    print("Next Gen Stats (2016+)...")
    ngs = load_ngs()
    if ngs is not None:
        df = df.merge(ngs, on=["player_id", "season"], how="left")

    # nflverse divides by zero in a few share columns; an infinite share is NA
    fcols = df.select_dtypes(include="float").columns
    df[fcols] = df[fcols].replace([np.inf, -np.inf], np.nan)
    df = add_ranks(df)
    df.to_parquet(OUT_FILE, index=False)
    seasons = sorted(df["season"].unique())
    print(f"\nDone. {len(df):,} player-seasons across {len(seasons)} seasons, {len(df.columns)} columns.")
    print(f"Written to {OUT_FILE}")

if __name__ == "__main__":
    main()
