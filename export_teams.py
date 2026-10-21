"""Gridiron — team table export.

Writes static/gridiron/teams.json from data/teams.parquet (build_teams.py) for
the browser's team questions (static/gridiron/teams.js). Small enough to ship
as plain rows: ~860 team-seasons.

    python export_teams.py
"""
import datetime as dt
import json
import math
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "teams.parquet")
OUT = os.path.join(HERE, "static", "gridiron", "teams.json")


def clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NA:
        return None
    if hasattr(v, "item"):
        v = v.item()
    return v


def main():
    df = pd.read_parquet(SRC)
    rows = [{k: clean(v) for k, v in r.items()} for r in df.to_dict("records")]
    out = {"meta": {"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
                    "seasons": [int(df["season"].min()), int(df["season"].max())], "rows": len(rows)},
           "rows": rows}
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT}: {len(rows):,} team-seasons, {os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
