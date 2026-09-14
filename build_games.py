"""Per-game lines: one row per player-game, in the SAME vocabulary as the season table.

nflverse publishes stats_player_week_{year}.parquet from the same release as the
season files, with the same column names, so fetch_data.STAT_COLS renames it for
free and every alias, display name and position swap the season table already
knows works unchanged on a game line.

    python build_games.py            # -> data/games.parquet
    python build_games.py --rebuild  # ignore the per-season cache

Rows with no production at all are dropped: a game line for a player who did not
touch the ball or make a play is noise, and there are three of those for every
one that matters.
"""
import argparse
import os

import numpy as np
import pandas as pd

import fetch_data as fd

WEEK_URL = fd.BASE + "stats_player/stats_player_week_{year}.parquet"
OUT_FILE = os.path.join(fd.DATA_DIR, "games.parquet")
ID_COLS = ["player_id", "player_display_name", "position", "position_group",
           "season", "week", "season_type", "team", "opponent_team"]
# any one of these means the player did something worth a row
PRODUCTION = ["pass_attempts", "carries", "targets", "tackles_solo", "tackles_assist", "tackles_wa",
              "sacks", "def_interceptions", "passes_defended", "forced_fumbles", "fumble_recoveries",
              "qb_hits", "tackles_for_loss", "fg_att", "pat_att", "punts", "punt_returns",
              "kickoff_returns", "special_teams_tds"]


def load_week(year, rebuild=False):
    cache = os.path.join(fd.CACHE_DIR, f"week_{year}.parquet")
    if os.path.exists(cache) and not rebuild:
        return pd.read_parquet(cache)
    try:
        w = pd.read_parquet(WEEK_URL.format(year=year))
    except Exception as e:
        print(f"  ! no weekly file for {year} ({e}); skipping")
        return None
    have = [c for c in fd.STAT_COLS if c in w.columns]
    keep = [c for c in ID_COLS if c in w.columns] + have
    df = w[keep].copy().rename(columns=fd.STAT_COLS)
    df = df.rename(columns={"team": "recent_team", "opponent_team": "opponent"})
    os.makedirs(fd.CACHE_DIR, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df


def derive(df):
    """The same derived columns the season table carries, computed for one game."""
    num = lambda c: pd.to_numeric(df[c], errors="coerce") if c in df else pd.Series(np.nan, index=df.index)
    z = lambda c: num(c).fillna(0)
    att, car, rec, tgt = z("pass_attempts"), z("carries"), z("receptions"), z("targets")

    df["games"] = 1                      # a game line is one game, so per-game rates stay honest
    df["playoff_game"] = df["season_type"].eq("POST") if "season_type" in df else False
    if "interceptions" in df: df["int_rate"] = fd._rate(num("interceptions"), att)
    if "completions" in df: df["completion_pct"] = fd._rate(num("completions"), att)
    if "passing_tds" in df: df["td_pct"] = fd._rate(num("passing_tds"), att)
    if "passing_yards" in df: df["ypa"] = (z("passing_yards") / att.where(att > 0)).round(2)
    if "sacks_taken" in df:
        drop = att + z("sacks_taken")
        df["sack_pct"] = (z("sacks_taken") / drop.where(drop > 0)).round(4)
    if all(c in df for c in ("completions", "passing_yards", "passing_tds", "interceptions")):
        ok = att > 0
        df["passer_rating"] = fd.passer_rating(z("completions")[ok], att[ok], z("passing_yards")[ok],
                                               z("passing_tds")[ok], z("interceptions")[ok])
    if "rushing_yards" in df: df["ypc"] = (z("rushing_yards") / car.where(car > 0)).round(2)
    if "receiving_yards" in df: df["ypr"] = (z("receiving_yards") / rec.where(rec > 0)).round(2)
    if "receptions" in df: df["catch_pct"] = fd._rate(rec, tgt)

    yd = [c for c in ("passing_yards", "rushing_yards", "receiving_yards") if c in df]
    if yd: df["total_yards"] = df[yd].fillna(0).sum(axis=1).astype(int)
    scored = [c for c in ("rushing_tds", "receiving_tds", "special_teams_tds") if c in df]
    if scored: df["total_tds"] = df[scored].fillna(0).sum(axis=1).astype(int)
    acc = [c for c in ("passing_tds", "rushing_tds", "receiving_tds", "special_teams_tds") if c in df]
    if acc: df["tds_accounted"] = df[acc].fillna(0).sum(axis=1).astype(int)

    tk = [c for c in ("tackles_solo", "tackles_wa", "tackles_assist") if c in df]
    if tk: df["tackles"] = df[tk].fillna(0).sum(axis=1).astype(int)
    df["touches"] = (att + car + rec + z("sacks_taken")).astype(int)
    if "fumbles_lost" in df and "interceptions" in df:
        df["turnovers"] = (z("interceptions") + z("fumbles_lost")).astype(int)
    if "int_plus_pd" not in df and all(c in df for c in ("def_interceptions", "passes_defended")):
        df["int_plus_pd"] = (z("def_interceptions") + z("passes_defended")).astype(int)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--since", type=int, default=fd.START_YEAR)
    args = ap.parse_args()
    end = fd.current_year()
    frames = []
    print(f"Building per-game lines {args.since}-{end} from nflverse weekly stats...")
    for year in range(args.since, end + 1):
        one = load_week(year, rebuild=args.rebuild)
        if one is None or one.empty:
            continue
        frames.append(one)
        print(f"  {year}: {len(one):,} rows")
    if not frames:
        raise SystemExit("no weekly files")
    df = pd.concat(frames, ignore_index=True)
    df = df[df["player_id"].notna()]
    df = derive(df)
    have = [c for c in PRODUCTION if c in df]
    keep = df[have].fillna(0).abs().sum(axis=1) > 0
    print(f"  dropping {int((~keep).sum()):,} lines with no production")
    df = df[keep].reset_index(drop=True)
    fcols = df.select_dtypes(include="float").columns
    df[fcols] = df[fcols].replace([np.inf, -np.inf], np.nan)
    os.makedirs(fd.DATA_DIR, exist_ok=True)
    df.to_parquet(OUT_FILE, index=False)
    print(f"Done. {len(df):,} player-games, {len(df.columns)} columns -> {OUT_FILE}")


if __name__ == "__main__":
    main()
