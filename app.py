"""
Gridiron — local Flask app.
"""
import os
import math
import json
import pandas as pd
from flask import Flask, jsonify, render_template, request

import query_engine as qe

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "data", "players.parquet")

app = Flask(__name__)
_DF = None
_GAME_TEAMS = None

def get_df():
    global _DF
    if _DF is None:
        if not os.path.exists(DATA_FILE):
            raise FileNotFoundError("No data file yet. Run python fetch_data.py first.")
        _DF = pd.read_parquet(DATA_FILE)
    return _DF

def _clean(v):
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if pd.isna(v):
        return None
    if hasattr(v, "item"):
        return v.item()
    return v

@app.route("/")
def index():
    try:
        df = get_df()
        meta = {
            "rows": len(df),
            "seasons": f"{int(df['season'].min())}–{int(df['season'].max())}",
            "ready": True,
        }
    except FileNotFoundError:
        meta = {"ready": False}
    return render_template("index.html", meta=meta)

@app.route("/api/query", methods=["POST"])
def api_query():
    q = (request.json or {}).get("q", "").strip()
    if not q:
        return jsonify({"error": "Type a query first."}), 400
    try:
        df = get_df()
        res, notes = qe.run(df, q)
    except qe.QueryError as e:
        return jsonify({"error": str(e), "notes": []}), 200
    except FileNotFoundError as e:
        return jsonify({"error": str(e)}), 500

    cols = [c for c in qe.RESULT_COLS if c in res.columns]
    # hide stat columns that are empty for every matched row (e.g. tackles for a QB query)
    ALWAYS = {"headshot_url", "player_id", "season", "player_display_name",
              "position", "recent_team", "games", "made_playoffs", "age"}
    cols = [c for c in cols if c in ALWAYS or res[c].notna().any()]
    res = res.sort_values(["season", "player_display_name"], ascending=[False, True])
    rows = [{c: _clean(r[c]) for c in cols} for _, r in res.iterrows()]
    LIMIT = 2000
    return jsonify({
        "notes": notes,
        "count": len(rows),
        "columns": cols,
        "rows": rows[:LIMIT],
        "truncated": len(rows) > LIMIT,
    })

@app.route("/api/player", methods=["GET"])
def api_player():
    pid = request.args.get("id")
    if not pid:
        return jsonify({"error": "Missing player id"}), 400
    try:
        df = get_df()
        player_df = df[df["player_id"] == pid].sort_values("season")
        if player_df.empty:
            return jsonify({"error": "Player not found"}), 404
        
        records = player_df.to_dict(orient="records")
        pos = records[-1].get("position", "")
        
        DEF_POS = {"CB", "DB", "S", "FS", "SAF", "LB", "ILB", "OLB", "MLB",
                   "DE", "DT", "DL", "NT"}
        if pos == "QB":
            stat = "passing_yards"
        elif pos == "RB":
            stat = "rushing_yards"
        elif pos in DEF_POS and "tackles" in player_df.columns:
            stat = "tackles"
        else:
            stat = "receiving_yards"
        
        valid_records = [r for r in records if pd.notnull(r.get(stat))]
        best_season = max(valid_records, key=lambda x: x.get(stat) or 0) if valid_records else records[0]

        return jsonify({
            "history": [{"season": r["season"], stat: _clean(r.get(stat))} for r in records],
            "bio": {
                "name": records[-1].get("player_display_name"),
                "headshot_url": records[-1].get("headshot_url"),
                "age": _clean(records[-1].get("age")),
                "recent_team": records[-1].get("recent_team"),
                "position": pos
            },
            "best_season": {
                "season": best_season["season"],
                "stat": stat,
                "value": _clean(best_season.get(stat))
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/game")
def game():
    # Firebase web configuration is intentionally public; access is protected by
    # Firebase Authentication and the Realtime Database rules in firebase.json.
    # Keep credentials/project selection outside source control.
    firebase_config = os.environ.get("FIREBASE_WEB_CONFIG", "")
    try:
        firebase_config = json.loads(firebase_config) if firebase_config else None
    except json.JSONDecodeError:
        firebase_config = None
    return render_template("game.html", firebase_config=firebase_config)


ROSTER_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "data", "roster_current.parquet")
ROSTER_URL = ("https://github.com/nflverse/nflverse-data/releases/download/"
              "weekly_rosters/roster_weekly_{year}.parquet")


def _load_current_roster(stats_season):
    """The upcoming season's actual roster (team assignments + height/weight).
    Downloads once and caches; falls back to None if unavailable (offline)."""
    if os.path.exists(ROSTER_FILE):
        r = pd.read_parquet(ROSTER_FILE)
        if len(r):
            return r
    for year in (stats_season + 1, stats_season):
        try:
            r = pd.read_parquet(ROSTER_URL.format(year=year))
            keep = [c for c in ("season", "team", "position", "status", "full_name",
                                "height", "weight", "gsis_id", "birth_date") if c in r.columns]
            r = r[keep]
            if "status" in r.columns:
                r = r[r["status"].isin(["ACT", "RES"])]
            r = r.drop_duplicates(subset=["gsis_id"], keep="last")
            os.makedirs(os.path.dirname(ROSTER_FILE), exist_ok=True)
            r.to_parquet(ROSTER_FILE, index=False)
            return r
        except Exception:
            continue
    return None


def _hash01(name, salt=""):
    s = (name or "") + salt
    h = 0
    for i, c in enumerate(s):
        h = (h * 31 + ord(c) * (i + 7)) % 100000
    return (h % 1000) / 999.0


def _build_game_teams(df):
    """Rosters for the UPCOMING season (2026 team assignments) rated from the
    most recent season's production plus real height/weight physicals.
    Every player gets a unique spd/str/jump/hands/arm/acc/agi/tkl profile."""
    stats_season = int(df["season"].max())
    cur = df[df["season"] == stats_season].copy().set_index("player_id", drop=False)
    prev1 = df[df["season"] == stats_season - 1].set_index("player_id")
    prev2 = df[df["season"] == stats_season - 2].set_index("player_id")

    roster = _load_current_roster(stats_season)
    display_season = stats_season + 1 if roster is not None and "season" in roster.columns \
        and len(roster) and int(roster["season"].max()) > stats_season else stats_season

    def pct(series):
        return series.rank(pct=True)

    # league-wide stat percentiles from the latest season
    P = {}
    for col in ("passing_yards", "completion_pct", "rushing_yards", "receptions",
                "receiving_yards", "targets", "carries", "fantasy_ppr", "tackles",
                "sacks", "def_interceptions", "pass_attempts"):
        if col in cur.columns:
            P[col] = pct(cur[col])

    def stat_pct(pid, col):
        try:
            v = P[col].loc[pid]
            return None if pd.isna(v) else float(v)
        except Exception:
            return None

    # physicals from the current roster (weight -> strength, height -> jump)
    if roster is not None:
        wts = pd.to_numeric(roster["weight"], errors="coerce")
        hts = pd.to_numeric(roster["height"], errors="coerce")
        wq = wts.rank(pct=True)
        hq = hts.rank(pct=True)
        roster = roster.assign(_wq=wq.values, _hq=hq.values)
        ros_by_id = roster.set_index("gsis_id", drop=False)
    else:
        ros_by_id = None

    def R(lo, hi, p):
        p = 0.5 if p is None else max(0.0, min(1.0, p))
        return int(round(lo + (hi - lo) * p))

    def rate_player(pid, name, pos):
        """A full, unique rating sheet for any player."""
        h = lambda salt: _hash01(name, salt)
        wq = hq = None
        if ros_by_id is not None and pid in ros_by_id.index:
            row = ros_by_id.loc[pid]
            wq = None if pd.isna(row["_wq"]) else float(row["_wq"])
            hq = None if pd.isna(row["_hq"]) else float(row["_hq"])
        strength = R(58, 99, (wq if wq is not None else h("st")) * 0.8 + h("st2") * 0.2)
        jump = R(58, 99, ((hq if hq is not None else h("j")) * 0.45 +
                          (1 - (wq if wq is not None else 0.5)) * 0.3 + h("j2") * 0.25))
        spd_base = 1 - (wq if wq is not None else 0.5)          # lighter = faster
        ratings = {
            "str": strength, "jump": jump,
            "spd": R(58, 92, spd_base * 0.6 + h("sp") * 0.4),
            "hands": R(58, 90, h("ha")),
            "agi": R(58, 92, spd_base * 0.4 + h("ag") * 0.6),
            "arm": R(58, 88, h("ar")),
            "acc": R(58, 88, h("ac")),
            "tkl": R(60, 92, (wq if wq is not None else h("tk")) * 0.5 + h("tk2") * 0.5),
        }
        # production overrides where the stats actually speak
        if pos == "QB":
            a = stat_pct(pid, "passing_yards");  ratings["arm"] = R(62, 99, a) if a is not None else ratings["arm"]
            c = stat_pct(pid, "completion_pct"); ratings["acc"] = R(62, 99, c) if c is not None else ratings["acc"]
            s = stat_pct(pid, "rushing_yards");  ratings["spd"] = R(55, 92, s) if s is not None else ratings["spd"]
        elif pos in ("RB", "FB"):
            s = stat_pct(pid, "rushing_yards");  ratings["spd"] = R(62, 99, s) if s is not None else ratings["spd"]
            r2 = stat_pct(pid, "receptions");    ratings["hands"] = R(55, 92, r2) if r2 is not None else ratings["hands"]
            f = stat_pct(pid, "fantasy_ppr");    ratings["agi"] = R(62, 99, f) if f is not None else ratings["agi"]
        elif pos == "WR":
            s = stat_pct(pid, "receiving_yards"); ratings["spd"] = R(62, 99, s) if s is not None else ratings["spd"]
            r2 = stat_pct(pid, "receptions");     ratings["hands"] = R(62, 99, r2) if r2 is not None else ratings["hands"]
            f = stat_pct(pid, "fantasy_ppr");     ratings["agi"] = R(62, 99, f) if f is not None else ratings["agi"]
        elif pos == "TE":
            s = stat_pct(pid, "receiving_yards"); ratings["spd"] = R(55, 90, s) if s is not None else ratings["spd"]
            r2 = stat_pct(pid, "receptions");     ratings["hands"] = R(62, 99, r2) if r2 is not None else ratings["hands"]
        elif pos in ("DE", "DT", "DL", "NT", "LB", "ILB", "OLB", "MLB"):
            t = stat_pct(pid, "tackles");  ratings["tkl"] = R(66, 99, t) if t is not None else ratings["tkl"]
            sk = stat_pct(pid, "sacks");   ratings["str"] = max(ratings["str"], R(60, 99, sk)) if sk is not None else ratings["str"]
        elif pos in ("CB", "DB", "S", "FS", "SAF"):
            t = stat_pct(pid, "tackles");            ratings["tkl"] = R(64, 96, t) if t is not None else ratings["tkl"]
            di = stat_pct(pid, "def_interceptions"); ratings["hands"] = R(60, 96, di) if di is not None else ratings["hands"]
            ratings["spd"] = max(ratings["spd"], R(72, 96, _hash01(name, "dbs")))
        return ratings

    def stat_row(pid):
        try:
            return cur.loc[pid]
        except Exception:
            return None

    def qb_score(pid):
        """Multi-year weighted volume so a star back from injury beats a fill-in."""
        tot = 0.0
        for frame, w in ((cur, 1.0), (prev1, 0.6), (prev2, 0.3)):
            try:
                v = frame.loc[pid].get("pass_attempts")
                if pd.notna(v):
                    tot += float(v) * w
            except Exception:
                pass
        return tot

    OFF_POS = {"QB", "RB", "FB", "WR", "TE"}
    DLP = ["DE", "DT", "DL", "NT"]
    LBP = ["LB", "ILB", "OLB", "MLB"]
    DBP = ["CB", "DB", "S", "FS", "SAF"]
    OLP = ["C", "G", "OT", "OL", "T"]

    teams = {}
    all_players = []

    # membership: prefer the upcoming season's actual roster
    if ros_by_id is not None:
        members = roster[["gsis_id", "team", "position", "full_name"]].rename(
            columns={"gsis_id": "pid", "team": "abbr", "full_name": "name"})
    else:
        members = cur[["player_id", "recent_team", "position", "player_display_name"]].rename(
            columns={"player_id": "pid", "recent_team": "abbr", "player_display_name": "name"})

    for abbr, grp in members.groupby("abbr"):
        if abbr not in {"ARI","ATL","BAL","BUF","CAR","CHI","CIN","CLE","DAL","DEN","DET","GB",
                        "HOU","IND","JAX","KC","LA","LAC","LV","MIA","MIN","NE","NO","NYG",
                        "NYJ","PHI","PIT","SEA","SF","TB","TEN","WAS"}:
            continue
        off, defense, oline = [], [], []

        def volume(pid, col):
            row = stat_row(pid)
            if row is None:
                return 0.0
            v = row.get(col)
            return float(v) if pd.notna(v) else 0.0

        def add_off(pid, name, pos, role, keys):
            row = stat_row(pid)
            stats = {k: _clean(row.get(k)) for k in keys} if row is not None else {}
            rt = rate_player(pid, name, pos)
            off.append(dict({"name": name, "pos": pos, "role": role, "stats": stats}, **rt))

        g = grp.drop_duplicates(subset=["pid"])
        qbs_t = sorted([r for r in g.itertuples() if r.position == "QB"],
                       key=lambda r: qb_score(r.pid), reverse=True)
        if qbs_t:
            add_off(qbs_t[0].pid, qbs_t[0].name, "QB", "QB", ["passing_yards", "passing_tds", "interceptions"])
        rbs_t = sorted([r for r in g.itertuples() if r.position in ("RB", "FB")],
                       key=lambda r: volume(r.pid, "carries"), reverse=True)[:2]
        for r in rbs_t:
            add_off(r.pid, r.name, "RB", "RB", ["rushing_yards", "rushing_tds", "receptions"])
        wrs_t = sorted([r for r in g.itertuples() if r.position == "WR"],
                       key=lambda r: volume(r.pid, "targets") + _hash01(r.name) * 0.1, reverse=True)[:3]
        for r in wrs_t:
            add_off(r.pid, r.name, "WR", "WR", ["receiving_yards", "receiving_tds", "receptions"])
        tes_t = sorted([r for r in g.itertuples() if r.position == "TE"],
                       key=lambda r: volume(r.pid, "targets"), reverse=True)[:1]
        for r in tes_t:
            add_off(r.pid, r.name, "TE", "TE", ["receiving_yards", "receiving_tds", "receptions"])

        # real offensive line, heaviest five
        ols = [r for r in g.itertuples() if r.position in OLP]
        ols = sorted(ols, key=lambda r: rate_player(r.pid, r.name, r.position)["str"], reverse=True)[:5]
        for r in ols:
            rt = rate_player(r.pid, r.name, r.position)
            oline.append(dict({"name": r.name, "pos": r.position}, **rt))

        for group, count in ((DLP, 4), (LBP, 3), (DBP, 4)):
            picks = sorted([r for r in g.itertuples() if r.position in group],
                           key=lambda r: volume(r.pid, "tackles") + volume(r.pid, "games") * 0.1
                           + _hash01(r.name) * 0.05, reverse=True)[:count]
            for r in picks:
                rt = rate_player(r.pid, r.name, r.position)
                defense.append(dict({"name": r.name, "pos": r.position}, **rt))

        ks = [r for r in g.itertuples() if r.position == "K"]
        kicker = {"name": ks[0].name if ks else "Ptero Legsly",
                  "leg": R(74, 96, _hash01((ks[0].name if ks else abbr) + "K"))}

        ovr = int(sum(p["spd"] + p["hands"] for p in off) / max(1, 2 * len(off))) if off else 75
        teams[abbr] = {"offense": off, "oline": oline, "defense": defense, "kicker": kicker, "ovr": ovr}
        for p in off + oline + defense:
            all_players.append(dict(p, team=abbr))

    return {"season": display_season, "statsSeason": stats_season, "teams": teams,
            "players": all_players}


@app.route("/api/game/teams")
def api_game_teams():
    global _GAME_TEAMS
    if _GAME_TEAMS is None:
        try:
            _GAME_TEAMS = _build_game_teams(get_df())
        except FileNotFoundError as e:
            return jsonify({"error": str(e)}), 500
    # the big flat player list rides on a separate endpoint
    slim = {k: v for k, v in _GAME_TEAMS.items() if k != "players"}
    return jsonify(slim)


@app.route("/api/game/players")
def api_game_players():
    """Every rated player on a current roster — for the scouting screen."""
    global _GAME_TEAMS
    if _GAME_TEAMS is None:
        try:
            _GAME_TEAMS = _build_game_teams(get_df())
        except FileNotFoundError as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"players": _GAME_TEAMS.get("players", [])})


if __name__ == "__main__":
    print("Gridiron running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
