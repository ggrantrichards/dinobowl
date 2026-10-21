"""Team-seasons: one row per team per regular season, for team questions
("a 2026 team top 6 in point differential with a 1,000-yard back ...").

    python build_teams.py            # -> data/teams.parquet
    python build_teams.py --rebuild  # ignore the per-season cache

Sources, all nflverse, the same release as the player tables:
  schedules/games.parquet                     final scores -> record, points, point differential
  stats_team/stats_team_week_{year}.parquet   team box scores with the opponent named, so a
                                              team's yards and turnovers ALLOWED are its
                                              opponents' yards and giveaways in those games
  pbp/play_by_play_{year}.parquet             special teams EPA (kickoffs, punts, field goals,
                                              extra points)

Totals yards are net: passing yards minus sack yards (nflverse stores those as a
negative number) plus rushing yards, which is how the league counts them.
"""
import argparse
import os

import pandas as pd

import fetch_data as fd

SCHED_URL = fd.BASE + "schedules/games.parquet"
TEAM_WEEK_URL = fd.BASE + "stats_team/stats_team_week_{year}.parquet"
OUT_FILE = os.path.join(fd.DATA_DIR, "teams.parquet")
ST_PLAYS = ["kickoff", "punt", "field_goal", "extra_point"]

# rank 1 = best within each season; True means lower is better
TEAM_RANKS = {"wins": False, "point_diff": False, "ppg": False, "papg": True, "ypg": False,
              "ypg_allowed": True, "turnover_diff": False, "takeaways": False, "giveaways": True,
              "st_epa": False}


def load_team_weeks(year, rebuild=False):
    cache = os.path.join(fd.CACHE_DIR, f"teamweek_{year}.parquet")
    if fd.cached(cache, year, rebuild):
        return pd.read_parquet(cache)
    try:
        w = pd.read_parquet(TEAM_WEEK_URL.format(year=year))
    except Exception as e:
        print(f"  ! no team weekly file for {year} ({e})")
        return None
    w = w[w["season_type"] == "REG"].copy()
    z = lambda c: w[c].fillna(0) if c in w else 0
    w["yards"] = z("passing_yards") + z("sack_yards_lost") + z("rushing_yards")
    w["giveaways"] = z("passing_interceptions") + z("fumbles_lost_total")
    w = w[["season", "week", "team", "opponent_team", "yards", "giveaways"]]
    os.makedirs(fd.CACHE_DIR, exist_ok=True)
    w.to_parquet(cache, index=False)
    return w


def load_st_epa(year, rebuild=False):
    cache = os.path.join(fd.CACHE_DIR, f"stepa_{year}.parquet")
    if fd.cached(cache, year, rebuild):
        return pd.read_parquet(cache)
    try:
        p = pd.read_parquet(fd.PBP_URL.format(year=year), columns=["season_type", "posteam", "defteam", "play_type", "epa"])
    except Exception as e:
        print(f"  ! no play-by-play for {year} ({e})")
        return None
    p = p[(p["season_type"] == "REG") & p["play_type"].isin(ST_PLAYS) & p["epa"].notna()]
    # EPA is the possession team's; the other side's special teams gave it up
    gained = p.groupby("posteam")["epa"].sum()
    lost = p.groupby("defteam")["epa"].sum()
    out = gained.sub(lost, fill_value=0).rename("st_epa").rename_axis("team").reset_index()
    out["season"] = year
    os.makedirs(fd.CACHE_DIR, exist_ok=True)
    out.to_parquet(cache, index=False)
    return out


# the schedule keeps a franchise's code from that season; every other nflverse
# file (players, box scores, play-by-play) uses today's
FRANCHISE = {"OAK": "LV", "SD": "LAC", "STL": "LA"}

def records(sched):
    """Per team-season: games played, record and points, from final scores."""
    g = sched[sched["game_type"] == "REG"].copy()
    for c in ("home_team", "away_team"):
        g[c] = g[c].replace(FRANCHISE)
    sides = []
    for me, opp, pf, pa in (("home_team", "away_team", "home_score", "away_score"),
                            ("away_team", "home_team", "away_score", "home_score")):
        s = g[["season", me, pf, pa]].rename(columns={me: "team", pf: "pf", pa: "pa"})
        sides.append(s)
    s = pd.concat(sides, ignore_index=True)
    sched_games = s.groupby(["season", "team"]).size().rename("sched_games")
    done = s[s["pf"].notna()]
    r = done.groupby(["season", "team"]).agg(games=("pf", "size"), points_for=("pf", "sum"), points_against=("pa", "sum"),
                                              wins=("pf", lambda x: 0), losses=("pf", lambda x: 0))
    r["wins"] = (done["pf"] > done["pa"]).groupby([done["season"], done["team"]]).sum()
    r["losses"] = (done["pf"] < done["pa"]).groupby([done["season"], done["team"]]).sum()
    r["ties"] = (done["pf"] == done["pa"]).groupby([done["season"], done["team"]]).sum()
    r = r.join(sched_games, how="right").reset_index()
    r["games"] = r["games"].fillna(0).astype(int)
    for c in ("points_for", "points_against", "wins", "losses", "ties"):
        r[c] = r[c].fillna(0).astype(int)
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rebuild", action="store_true")
    args = ap.parse_args()
    end = fd.current_year()
    print(f"Building team-seasons {fd.START_YEAR}-{end} from nflverse...")
    sched = pd.read_parquet(SCHED_URL)
    sched = sched[(sched["season"] >= fd.START_YEAR) & (sched["season"] <= end)]
    df = records(sched)

    weeks, st = [], []
    for year in range(fd.START_YEAR, end + 1):
        w = load_team_weeks(year, args.rebuild)
        if w is not None: weeks.append(w)
        e = load_st_epa(year, args.rebuild)
        if e is not None: st.append(e)
        print(f"  {year}")
    w = pd.concat(weeks, ignore_index=True)
    off = w.groupby(["season", "team"])[["yards", "giveaways"]].sum()
    allowed = w.groupby(["season", "opponent_team"])[["yards", "giveaways"]].sum()
    allowed.index.names = ["season", "team"]
    allowed.columns = ["yards_allowed", "takeaways"]
    df = df.merge(off.join(allowed, how="outer").reset_index(), on=["season", "team"], how="left")
    df = df.merge(pd.concat(st, ignore_index=True), on=["season", "team"], how="left")

    g = df["games"].where(df["games"] > 0)
    df["point_diff"] = df["points_for"] - df["points_against"]
    df["ppg"] = (df["points_for"] / g).round(1)
    df["papg"] = (df["points_against"] / g).round(1)
    df["ypg"] = (df["yards"] / g).round(1)
    df["ypg_allowed"] = (df["yards_allowed"] / g).round(1)
    df["turnover_diff"] = df["takeaways"] - df["giveaways"]
    df["st_epa"] = df["st_epa"].round(1)
    # a season is over when every scheduled game has a score; until then totals
    # are paced by the team's games played (see static/gridiron/teams.js)
    df["complete"] = df.groupby("season")["games"].transform("sum") == df.groupby("season")["sched_games"].transform("sum")

    df = df[df["games"] > 0].copy()
    for col, asc in TEAM_RANKS.items():
        df[f"{col}_rank"] = df.groupby("season")[col].rank(ascending=asc, method="min").astype("Int64")
    df = df.sort_values(["season", "team"]).reset_index(drop=True)
    df.to_parquet(OUT_FILE, index=False)
    print(f"Done. {len(df):,} team-seasons, {df['season'].nunique()} seasons -> {OUT_FILE}")


if __name__ == "__main__":
    main()
