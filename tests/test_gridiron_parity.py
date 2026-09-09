"""
Gridiron parity: the browser engine (static/gridiron/engine.js on data.json)
must answer every question EXACTLY like the Python engine (query_engine.py on
data/players.parquet) — same player-seasons, same "how I read that" notes.

    python tests/test_gridiron_parity.py

Any drift fails the run. Requires node on PATH and a built data.json
(python fetch_data.py && python export_gridiron.py).
"""
import json, os, subprocess, sys, tempfile
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
import pandas as pd
import query_engine as qe

QUERIES = [
    "QBs top 10 in passing yards and passing touchdowns with a top 5 lowest interception rate who had a playoff game",
    "WRs with over 100 receptions and top 5 in receiving yards since 2015",
    "Qbs under 25 years old",
    "QBs with a QBR over 70 and EPA per play above 0.2",
    "edge rushers with 50+ pressures and a pressure rate over 7% since 2020",
    "edge rushers top 5 in pressure rate since 2020",
    "CBs top 5 in interceptions plus passes defended with a completion percentage allowed under 55%",
    "RBs over 1500 rushing yards with a turnover percentage under 1%",
    "WRs taller than 6'3 with over 1000 receiving yards and a drop rate under 5% in 2024",
    "linebackers heavier than 250 pounds with over 100 tackles and 5+ sacks",
    "QBs with a sack rate under 5% and a passer rating over 100 since 2018",
    "safeties top 3 in interception return touchdowns",
    "kickers with a field goal percentage over 90% and at least 25 field goals made",
    "QBs led the league in passer rating",
    "bottom 5 in interceptions among QBs with at least 300 pass attempts in 2023",
    "tight ends with 10 or more receiving tds",
    "RBs with at least 4.5 yards per carry and 250+ carries between 2010 and 2020",
    "QBs with a completion percentage over 68 and time to throw under 2.6 seconds",
    "receivers with a catch rate of 75%+ and 120+ targets",
    "DTs top 10 in qb hits in 2022",
    "punters with at least 30 punts inside the 20",
    "QBs with 4,000+ passing yards and fewer than 8 interceptions who made the playoffs",
    "rookies drafted in 2020 with over 1000 receiving yards",
    "QBs with a cpoe over 5 and an aggressiveness above 20%",
    "top 3 in sacks per blitz among linebackers with at least 25 blitzes",
]

NODE_RUNNER = r"""
const {Table} = require(process.argv[2]);
const data = JSON.parse(require("fs").readFileSync(process.argv[3], "utf8"));
const T = new Table(data);
const qs = JSON.parse(require("fs").readFileSync(process.argv[4], "utf8"));
const out = [];
for (const q of qs) {
  try { const r = T.run(q); out.push({ notes: r.notes, keys: r.idx.map(i => T.cols.season[i] + "|" + T.cols.player_id[i]).sort() }); }
  catch (e) { out.push({ error: e.message }); }
}
process.stdout.write(JSON.stringify(out));
"""

def main():
    df = pd.read_parquet(os.path.join(ROOT, "data", "players.parquet"))
    with tempfile.TemporaryDirectory() as td:
        runner = os.path.join(td, "run.js"); qfile = os.path.join(td, "q.json")
        open(runner, "w", encoding="utf-8").write(NODE_RUNNER)
        json.dump(QUERIES, open(qfile, "w", encoding="utf-8"))
        js = json.loads(subprocess.check_output(["node", runner, os.path.join(ROOT, "static", "gridiron", "engine.js"),
                                                 os.path.join(ROOT, "static", "gridiron", "data.json"), qfile], text=True, encoding="utf-8"))
    fails = 0
    for q, j in zip(QUERIES, js):
        try:
            res, notes, _ = qe.run_full(df, q)
            py = {"notes": notes, "keys": sorted(f"{int(s)}|{p}" for s, p in zip(res["season"], res["player_id"]))}
        except qe.QueryError as e:
            py = {"error": str(e)}
        ok = py == j
        fails += 0 if ok else 1
        tag = "PASS" if ok else "FAIL"
        n = len(py.get("keys", [])) if "keys" in py else "err"
        print(f"{tag}  {q}  [py={n} js={len(j.get('keys', [])) if 'keys' in j else 'err'}]")
        if not ok:
            if py.get("notes") != j.get("notes"): print("      notes py:", py.get("notes"), "\n      notes js:", j.get("notes"))
            if "keys" in py and "keys" in j:
                a, b = set(py["keys"]), set(j["keys"])
                print("      only py:", sorted(a - b)[:5], " only js:", sorted(b - a)[:5])
            if "error" in py or "error" in j: print("      py:", py.get("error"), " js:", j.get("error"))
    print(f"\n{len(QUERIES) - fails} of {len(QUERIES)} questions answered identically by both engines")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
