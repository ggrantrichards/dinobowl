"""Build Firebase Hosting data files from the local NFL roster/stat cache,
then overlay the latest Madden ratings (data/madden_ratings.json, refreshed
by fetch_madden_ratings.py) so in-game numbers match the real ratings."""
import json
import re
from pathlib import Path

import app

MADDEN = Path(__file__).parent / "data" / "madden_ratings.json"
# Madden attribute -> game attribute (only overwrite when Madden has a value)
FIELD_MAP = ["spd", "str", "agi", "hands", "arm", "acc", "tkl", "jump", "stam"]

def norm_name(name):
    name = re.sub(r"[.'’-]", "", (name or "").lower())
    name = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", name.strip())
    return re.sub(r"\s+", " ", name)

def load_madden():
    if not MADDEN.exists():
        print("(no madden_ratings.json — run fetch_madden_ratings.py to sync ratings)")
        return {}
    idx = {}
    for p in json.loads(MADDEN.read_text(encoding="utf-8"))["players"]:
        idx.setdefault(p["key"], []).append(p)
    return idx

POS_GROUP = {
    "QB": "QB", "RB": "RB", "FB": "RB", "WR": "WR", "TE": "TE",
    "C": "OL", "G": "OL", "OT": "OL", "T": "OL", "OL": "OL", "LT": "OL", "RT": "OL", "LG": "OL", "RG": "OL",
    "DE": "DL", "DT": "DL", "DL": "DL", "NT": "DL", "LE": "DL", "RE": "DL", "EDGE": "DL",
    "LB": "LB", "ILB": "LB", "OLB": "LB", "MLB": "LB", "LOLB": "LB", "ROLB": "LB",
    "CB": "DB", "DB": "DB", "S": "DB", "FS": "DB", "SS": "DB", "SAF": "DB",
    "K": "K", "P": "K",
}

def apply_madden(player, idx, team_label_hint=""):
    """Overlay Madden numbers onto one roster dict; returns match or None.
    Same-name collisions resolve by position group, then team."""
    cands = idx.get(norm_name(player.get("name", "")))
    if not cands:
        return None
    want = POS_GROUP.get(player.get("pos", ""), "")
    def score(c):
        s = 0
        if want and POS_GROUP.get(c.get("pos", ""), "?") == want:
            s += 2
        if team_label_hint and team_label_hint.lower() in (c.get("team") or "").lower():
            s += 1
        return s
    m = max(cands, key=score)
    for f in FIELD_MAP:
        if m.get(f):
            player[f] = m[f]
    if m.get("blk") and player.get("pos") in ("OL", "C", "G", "OT", "T"):
        player["blk"] = m["blk"]
    if m.get("stiff"):
        player["stiff"] = m["stiff"]
    player["ovr"] = m.get("ovr")
    return m

def main():
    data = app._build_game_teams(app.get_df())
    idx = load_madden()
    matched = missed = 0
    NICK = {
        "ARI": "Cardinals", "ATL": "Falcons", "BAL": "Ravens", "BUF": "Bills", "CAR": "Panthers",
        "CHI": "Bears", "CIN": "Bengals", "CLE": "Browns", "DAL": "Cowboys", "DEN": "Broncos",
        "DET": "Lions", "GB": "Packers", "HOU": "Texans", "IND": "Colts", "JAX": "Jaguars",
        "KC": "Chiefs", "LA": "Rams", "LAC": "Chargers", "LV": "Raiders", "MIA": "Dolphins",
        "MIN": "Vikings", "NE": "Patriots", "NO": "Saints", "NYG": "Giants", "NYJ": "Jets",
        "PHI": "Eagles", "PIT": "Steelers", "SEA": "Seahawks", "SF": "49ers", "TB": "Buccaneers",
        "TEN": "Titans", "WAS": "Commanders",
    }
    for abbr, team in data["teams"].items():
        hint = NICK.get(abbr, "")
        ovrs = []
        for group in ("offense", "oline", "defense"):
            for p in team.get(group, []):
                m = apply_madden(p, idx, hint)
                if m:
                    matched += 1
                    if m.get("ovr"):
                        ovrs.append(m["ovr"])
                else:
                    missed += 1
        k = team.get("kicker")
        if k:
            mk = idx.get(norm_name(k.get("name", "")))
            if mk:
                mk = mk[0]
                if mk.get("kickPower"):
                    k["leg"] = mk["kickPower"]
                if mk.get("kickAcc"):
                    k["kacc"] = mk["kickAcc"]
        if ovrs:
            team["ovr"] = round(sum(ovrs) / len(ovrs))
    for p in data.get("players", []):
        apply_madden(p, idx)

    out = Path(__file__).parent / "static" / "game"
    out.mkdir(parents=True, exist_ok=True)
    teams = {key: value for key, value in data.items() if key != "players"}
    (out / "teams.json").write_text(json.dumps(teams, separators=(",", ":")), encoding="utf-8")
    (out / "players.json").write_text(json.dumps({"players": data.get("players", [])}, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote static roster and scouting data. Madden overlay: {matched} matched, {missed} unmatched.")

if __name__ == "__main__":
    main()