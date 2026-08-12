# """
# Gridiron — data builder.

# Pulls per-player, per-season NFL stats from nflverse (free, open, no scraping of
# PFR/ESPN which both forbid it) for every season from START_YEAR to the current
# year, tags which players appeared in the playoffs that season, computes per-season
# league ranks for the stats we care about, and writes one tidy Parquet file the app
# reads.

# Run:  python fetch_data.py           (incremental — skips cached seasons)
#       python fetch_data.py --rebuild (re-download everything)
# """
# import argparse
# import datetime as dt
# import os
# import sys
# import pandas as pd

# START_YEAR = 2000
# DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
# CACHE_DIR = os.path.join(DATA_DIR, "cache")
# OUT_FILE = os.path.join(DATA_DIR, "players.parquet")

# REG_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
#            "stats_player/stats_player_reg_{year}.parquet")
# POST_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
#             "stats_player/stats_player_post_{year}.parquet")
# ROSTER_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
#               "rosters/roster_{year}.parquet")

# # Columns we surface + rank on. (source_col -> friendly name)
# STAT_COLS = {
#     "passing_yards": "passing_yards",
#     "passing_tds": "passing_tds",
#     "passing_interceptions": "interceptions",
#     "attempts": "pass_attempts",
#     "completions": "completions",
#     "carries": "carries",
#     "rushing_yards": "rushing_yards",
#     "rushing_tds": "rushing_tds",
#     "targets": "targets",
#     "receptions": "receptions",
#     "receiving_yards": "receiving_yards",
#     "receiving_tds": "receiving_tds",
#     "sacks_suffered": "sacks_taken",
#     "fantasy_points_ppr": "fantasy_ppr",
# }
# ID_COLS = ["player_id", "player_display_name", "position", "position_group",
#            "recent_team", "season", "games", "age"]

# # Stats where a HIGHER value = rank 1. (interceptions handled separately as ascending)
# RANK_DESC = ["passing_yards", "passing_tds", "pass_attempts", "completions",
#              "carries", "rushing_yards", "rushing_tds", "targets", "receptions",
#              "receiving_yards", "receiving_tds", "fantasy_ppr", "total_tds"]


# def current_year():
#     now = dt.date.today()
#     # NFL season labeled by starting year; new-season data lands ~Sept.
#     return now.year if now.month >= 9 else now.year - 1


# def _read(url):
#     return pd.read_parquet(url)


# def load_season(year, rebuild=False):
#     cache = os.path.join(CACHE_DIR, f"season_{year}.parquet")
#     if os.path.exists(cache) and not rebuild:
#         return pd.read_parquet(cache)

#     try:
#         reg = _read(REG_URL.format(year=year))
#     except Exception as e:
#         print(f"  ! no regular-season file for {year} ({e}); skipping")
#         return None

#     # Which players played in the postseason this year?
#     playoff_ids = set()
#     try:
#         post = _read(POST_URL.format(year=year))
#         playoff_ids = set(post["player_id"].dropna().unique())
#     except Exception:
#         print(f"  . no postseason file for {year} (offseason/incomplete)")

#     have = [c for c in STAT_COLS if c in reg.columns]
#     keep = [c for c in ID_COLS if c in reg.columns] + have
#     df = reg[keep].copy()
#     df = df.rename(columns=STAT_COLS)
#     df["made_playoffs"] = df["player_id"].isin(playoff_ids)

#     # --- NEW: Fetch Roster to map ages ---
#     try:
#         roster = _read(ROSTER_URL.format(year=year))
#         # nflverse usually keys rosters by 'gsis_id' or 'player_id' 
#         id_col = "player_id" if "player_id" in roster.columns else "gsis_id"
        
#         if id_col in roster.columns and "age" in roster.columns:
#             age_map = roster.drop_duplicates(subset=[id_col]).set_index(id_col)["age"]
#             df["age"] = df["player_id"].map(age_map)
#         else:
#             df["age"] = pd.NA
#     except Exception as e:
#         print(f"  . no roster file for {year}, setting age to NA ({e})")
#         df["age"] = pd.NA
#     # -------------------------------------

#     # Interception rate = INT / attempt (only meaningful for passers).
#     if "interceptions" in df and "pass_attempts" in df:
#         att = df["pass_attempts"].fillna(0)
#         df["int_rate"] = (df["interceptions"].fillna(0) / att.where(att > 0)).round(4)

#     # Completion percentage = completions / attempts.
#     if "completions" in df and "pass_attempts" in df:
#         att = df["pass_attempts"].fillna(0)
#         df["completion_pct"] = (df["completions"].fillna(0) / att.where(att > 0)).round(4)

#     # Total touchdowns scored = passing + rushing + receiving TDs.
#     td_parts = [c for c in ("passing_tds", "rushing_tds", "receiving_tds") if c in df]
#     if td_parts:
#         df["total_tds"] = df[td_parts].fillna(0).sum(axis=1).astype(int)

#     os.makedirs(CACHE_DIR, exist_ok=True)
#     df.to_parquet(cache, index=False)
#     return df


# def add_ranks(df):
#     """Per-season league rank for each ranked stat. Rank 1 = best.
#     Ranks are computed only over players who actually recorded the stat (>0),
#     so a WR with 0 pass attempts doesn't 'rank' in passing."""
#     out = []
#     for season, grp in df.groupby("season"):
#         grp = grp.copy()
#         for stat in RANK_DESC:
#             if stat in grp:
#                 mask = grp[stat].fillna(0) > 0
#                 grp.loc[mask, f"{stat}_rank"] = (
#                     grp.loc[mask, stat].rank(ascending=False, method="min").astype("Int64"))
#         # Interception rate: lower is better. Qualifier = official NFL standard
#         # of 14 attempts per team game (16-game seasons through 2020, 17 from 2021).
#         if "int_rate" in grp and "pass_attempts" in grp:
#             min_att = 14 * (17 if season >= 2021 else 16)
#             q = grp["pass_attempts"].fillna(0) >= min_att
#             grp.loc[q, "int_rate_rank"] = (
#                 grp.loc[q, "int_rate"].rank(ascending=True, method="min").astype("Int64"))
#         # Completion %: higher is better, same attempt qualifier as int rate.
#         if "completion_pct" in grp and "pass_attempts" in grp:
#             min_att = 14 * (17 if season >= 2021 else 16)
#             q = grp["pass_attempts"].fillna(0) >= min_att
#             grp.loc[q, "completion_pct_rank"] = (
#                 grp.loc[q, "completion_pct"].rank(ascending=False, method="min").astype("Int64"))
#         out.append(grp)
#     return pd.concat(out, ignore_index=True)


# def main():
#     ap = argparse.ArgumentParser()
#     ap.add_argument("--rebuild", action="store_true", help="re-download every season")
#     args = ap.parse_args()

#     os.makedirs(DATA_DIR, exist_ok=True)
#     end = current_year()
#     print(f"Building NFL player dataset {START_YEAR}–{end} from nflverse…")

#     frames = []
#     for year in range(START_YEAR, end + 1):
#         print(f"[{year}]")
#         s = load_season(year, rebuild=args.rebuild)
#         if s is not None and len(s):
#             frames.append(s)

#     if not frames:
#         print("No data pulled. Check your network connection.")
#         sys.exit(1)

#     df = pd.concat(frames, ignore_index=True)
#     df = add_ranks(df)
#     df.to_parquet(OUT_FILE, index=False)
#     seasons = sorted(df["season"].unique())
#     print(f"\nDone. {len(df):,} player-seasons across {len(seasons)} seasons "
#           f"({seasons[0]}–{seasons[-1]}).")
#     print(f"Written to {OUT_FILE}")


# if __name__ == "__main__":
#     main()import argparse
import datetime as dt
import argparse
import os
import sys
import pandas as pd

START_YEAR = 2000
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
CACHE_DIR = os.path.join(DATA_DIR, "cache")
OUT_FILE = os.path.join(DATA_DIR, "players.parquet")

REG_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
           "stats_player/stats_player_reg_{year}.parquet")
POST_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
            "stats_player/stats_player_post_{year}.parquet")
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.parquet"

STAT_COLS = {
    "passing_yards": "passing_yards",
    "passing_tds": "passing_tds",
    "passing_interceptions": "interceptions",
    "attempts": "pass_attempts",
    "completions": "completions",
    "carries": "carries",
    "rushing_yards": "rushing_yards",
    "rushing_tds": "rushing_tds",
    "targets": "targets",
    "receptions": "receptions",
    "receiving_yards": "receiving_yards",
    "receiving_tds": "receiving_tds",
    "sacks_suffered": "sacks_taken",
    "fantasy_points_ppr": "fantasy_ppr",
    # defensive stats
    "def_tackles_solo": "tackles_solo",
    "def_tackles_with_assist": "tackles_wa",
    "def_tackle_assists": "tackles_assist",
    "def_tackles_for_loss": "tackles_for_loss",
    "def_sacks": "sacks",
    "def_interceptions": "def_interceptions",
    "def_pass_defended": "passes_defended",
    "def_fumbles_forced": "forced_fumbles",
    "def_tds": "def_tds",
}
ID_COLS = ["player_id", "player_display_name", "position", "position_group",
           "recent_team", "season", "games"]

RANK_DESC = ["passing_yards", "passing_tds", "pass_attempts", "completions",
             "carries", "rushing_yards", "rushing_tds", "targets", "receptions",
             "receiving_yards", "receiving_tds", "fantasy_ppr", "total_tds",
             "tackles", "tackles_for_loss", "sacks", "def_interceptions",
             "passes_defended", "forced_fumbles", "def_tds"]

def current_year():
    now = dt.date.today()
    return now.year if now.month >= 9 else now.year - 1

def _read(url):
    return pd.read_parquet(url)

def load_season(year, rebuild=False):
    cache = os.path.join(CACHE_DIR, f"season_{year}.parquet")
    if os.path.exists(cache) and not rebuild:
        return pd.read_parquet(cache)

    try:
        reg = _read(REG_URL.format(year=year))
    except Exception as e:
        print(f"  ! no regular-season file for {year} ({e}); skipping")
        return None

    playoff_ids = set()
    try:
        post = _read(POST_URL.format(year=year))
        playoff_ids = set(post["player_id"].dropna().unique())
    except Exception:
        pass

    have = [c for c in STAT_COLS if c in reg.columns]
    keep = [c for c in ID_COLS if c in reg.columns] + have
    df = reg[keep].copy()
    df = df.rename(columns=STAT_COLS)
    df["made_playoffs"] = df["player_id"].isin(playoff_ids)

    if "interceptions" in df and "pass_attempts" in df:
        att = df["pass_attempts"].fillna(0)
        df["int_rate"] = (df["interceptions"].fillna(0) / att.where(att > 0)).round(4)

    if "completions" in df and "pass_attempts" in df:
        att = df["pass_attempts"].fillna(0)
        df["completion_pct"] = (df["completions"].fillna(0) / att.where(att > 0)).round(4)

    td_parts = [c for c in ("passing_tds", "rushing_tds", "receiving_tds") if c in df]
    if td_parts:
        df["total_tds"] = df[td_parts].fillna(0).sum(axis=1).astype(int)

    # combined tackles (solo + with-assist + assists = press "total tackles");
    # NA when the player has no defensive line
    parts = [c for c in ("tackles_solo", "tackles_wa", "tackles_assist") if c in df]
    if parts:
        combined = sum(df[c].fillna(0) for c in parts)
        all_na = df[parts].isna().all(axis=1)
        df["tackles"] = combined.where(~all_na)
        df = df.drop(columns=parts)

    os.makedirs(CACHE_DIR, exist_ok=True)
    df.to_parquet(cache, index=False)
    return df

def add_ranks(df):
    out = []
    for season, grp in df.groupby("season"):
        grp = grp.copy()
        for stat in RANK_DESC:
            if stat in grp:
                mask = grp[stat].fillna(0) > 0
                grp.loc[mask, f"{stat}_rank"] = (
                    grp.loc[mask, stat].rank(ascending=False, method="min").astype("Int64"))
        if "int_rate" in grp and "pass_attempts" in grp:
            min_att = 14 * (17 if season >= 2021 else 16)
            q = grp["pass_attempts"].fillna(0) >= min_att
            grp.loc[q, "int_rate_rank"] = (
                grp.loc[q, "int_rate"].rank(ascending=True, method="min").astype("Int64"))
        if "completion_pct" in grp and "pass_attempts" in grp:
            min_att = 14 * (17 if season >= 2021 else 16)
            q = grp["pass_attempts"].fillna(0) >= min_att
            grp.loc[q, "completion_pct_rank"] = (
                grp.loc[q, "completion_pct"].rank(ascending=False, method="min").astype("Int64"))
        out.append(grp)
    return pd.concat(out, ignore_index=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true", help="re-download every season")
    args = ap.parse_args()

    os.makedirs(DATA_DIR, exist_ok=True)
    end = current_year()
    print(f"Building NFL player dataset {START_YEAR}–{end} from nflverse…")

    print("Fetching global players database for age and headshots...")
    try:
        players = pd.read_parquet(PLAYERS_URL)
        if "gsis_id" in players.columns:
            players = players.drop_duplicates(subset=["gsis_id"]).set_index("gsis_id")
        else:
            players = pd.DataFrame()
    except Exception as e:
        print(f"Could not fetch global players DB: {e}")
        players = pd.DataFrame()

    frames = []
    for year in range(START_YEAR, end + 1):
        print(f"[{year}]")
        s = load_season(year, rebuild=args.rebuild)
        if s is not None and len(s):
            if not players.empty:
                if "birth_date" in players.columns:
                    birth_years = pd.to_datetime(players["birth_date"], errors="coerce").dt.year
                    s["age"] = year - s["player_id"].map(birth_years)
                else:
                    s["age"] = pd.NA
                    
                if "headshot" in players.columns:
                    s["headshot_url"] = s["player_id"].map(players["headshot"])
                else:
                    s["headshot_url"] = pd.NA
            else:
                s["age"] = pd.NA
                s["headshot_url"] = pd.NA
                
            frames.append(s)

    if not frames:
        print("No data pulled. Check your network connection.")
        sys.exit(1)

    df = pd.concat(frames, ignore_index=True)
    df = add_ranks(df)
    df.to_parquet(OUT_FILE, index=False)
    seasons = sorted(df["season"].unique())
    print(f"\nDone. {len(df):,} player-seasons across {len(seasons)} seasons.")
    print(f"Written to {OUT_FILE}")

if __name__ == "__main__":
    main()