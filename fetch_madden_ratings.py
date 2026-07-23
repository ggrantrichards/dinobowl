"""Pull the latest Madden ratings from EA's public drop-api and cache them
locally (data/madden_ratings.json). export_static_game_data.py merges these
into the game's roster files so every dino carries his real Madden numbers."""
import json
import re
import time
import urllib.request
from pathlib import Path

API = "https://drop-api.ea.com/rating/madden-nfl?locale=en&limit={limit}&offset={offset}"
OUT = Path(__file__).parent / "data" / "madden_ratings.json"

def norm_name(name: str) -> str:
    name = re.sub(r"[.'’-]", "", (name or "").lower())
    name = re.sub(r"\s+(jr|sr|ii|iii|iv|v)$", "", name.strip())
    return re.sub(r"\s+", " ", name)

def sval(stats, key):
    v = stats.get(key)
    if isinstance(v, dict):
        v = v.get("value")
    return v

def fetch_all():
    players, offset, limit = [], 0, 100
    while True:
        url = API.format(limit=limit, offset=offset)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (dinobowl-ratings)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        items = d.get("items", [])
        if not items:
            break
        for it in items:
            st = it.get("stats") or {}
            acc3 = [sval(st, k) for k in ("throwAccuracyShort", "throwAccuracyMid", "throwAccuracyDeep")]
            acc3 = [a for a in acc3 if a]
            players.append({
                "name": (it.get("firstName", "") + " " + it.get("lastName", "")).strip(),
                "key": norm_name(it.get("firstName", "") + " " + it.get("lastName", "")),
                "team": (it.get("team") or {}).get("label", ""),
                "pos": (it.get("position") or {}).get("shortLabel", ""),
                "ovr": it.get("overallRating"),
                "spd": sval(st, "speed"),
                "str": sval(st, "strength"),
                "agi": sval(st, "agility"),
                "hands": sval(st, "catching"),
                "arm": sval(st, "throwPower"),
                "acc": round(sum(acc3) / len(acc3)) if acc3 else None,
                "tkl": sval(st, "tackle"),
                "jump": sval(st, "jumping"),
                "stam": sval(st, "stamina"),
                "stiff": sval(st, "stiffArm"),
                "blk": round(((sval(st, "passBlock") or 0) + (sval(st, "runBlock") or 0)) / 2) or None,
                "kickPower": sval(st, "kickPower"),
                "kickAcc": sval(st, "kickAccuracy"),
            })
        offset += limit
        total = d.get("totalItems", 0)
        print(f"  fetched {min(offset, total)}/{total}")
        if offset >= total:
            break
        time.sleep(0.25)
    return players

def main():
    players = fetch_all()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"fetched": int(time.time()), "players": players},
                              separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(players)} Madden ratings to {OUT}")

if __name__ == "__main__":
    main()
