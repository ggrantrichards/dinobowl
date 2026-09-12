"""
Gridiron — static export.

Writes static/gridiron/data.json: the whole player-season table plus the query
vocabulary and ranking rules, so the browser engine (static/gridiron/engine.js)
answers exactly what the Python engine answers, with no server.

    python export_gridiron.py

Layout of data.json:
  meta.columns        column names, in order
  cols[name]          dense: a plain array (one value per row, null = NA)
                      sparse: {"i": [row indices], "v": [values]} when most
                      rows are NA (every PFR / NGS / QBR column is)
  meta.*              aliases, positions, display names, direction, percent
                      sets, rank rules, formulas, coverage years, column rules
Per-season rank columns are NOT shipped; the browser recomputes them from the
same rules (meta.rank_desc / meta.rate_ranks) that fetch_data.add_ranks uses.
"""
import datetime as dt
import json
import math
import os
import pandas as pd

import fetch_data as fd
import query_engine as qe

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "players.parquet")
OUT_DIR = os.path.join(HERE, "static", "gridiron")
OUT = os.path.join(OUT_DIR, "data.json")

def clean(v):
    if v is None: return None
    if isinstance(v, float):
        if math.isnan(v) or math.isinf(v): return None
        return round(v, 4)
    if hasattr(v, "item"):
        v = v.item()
        if isinstance(v, float):
            if math.isnan(v) or math.isinf(v): return None
            return round(v, 4)
    if isinstance(v, (bool, int, str)): return v
    if pd.isna(v): return None
    return v

def main():
    df = pd.read_parquet(SRC)
    df = df[[c for c in df.columns if not c.endswith("_rank")]]
    df = df.sort_values(["season", "player_display_name"], ascending=[False, True]).reset_index(drop=True)
    n = len(df)
    cols = {}
    for c in df.columns:
        vals = [clean(v) for v in df[c].tolist()]
        nn = sum(1 for v in vals if v is not None)
        if nn < n * 0.5:
            idx = [i for i, v in enumerate(vals) if v is not None]
            cols[c] = {"i": idx, "v": [vals[i] for i in idx]}
        else:
            cols[c] = vals
    meta = {
        "built": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%MZ"),
        "rows": n,
        "seasons": sorted(int(s) for s in df["season"].unique()),
        "columns": list(df.columns),
        "aliases": [[p, c] for p, c in qe.STAT_ALIASES],
        "positions": qe.POSITIONS,
        "display": qe.DISPLAY,
        "ascending_good": sorted(qe.ASCENDING_GOOD),
        "pct_stats": sorted(qe.PCT_STATS),
        "pp_stats": sorted(qe.PP_STATS),
        "always_cols": qe.ALWAYS_COLS,
        "pos_defaults": qe.POS_DEFAULTS,
        "def_codes": sorted(qe.DEF_CODES),
        "def_stat_cols": sorted(qe.DEF_STAT_COLS),
        "rank_desc": fd.RANK_DESC,
        "rate_ranks": [list(r) for r in fd.RATE_RANKS],
        "rate_parts": fd.RATE_PARTS,
        "max_cols": fd.MAX_COLS,
        "sum_cols": qe.sum_cols(df, fd.RANK_DESC, fd.RATE_PARTS, fd.NEVER_SUM, fd.MAX_COLS),
        "derived": fd.DERIVED,
        "coverage": {"box_score": fd.START_YEAR, "pfr": fd.PFR_FROM, "snaps": fd.SNAPS_FROM, "qbr": fd.QBR_FROM, "ngs": fd.NGS_FROM, "contracts": fd.CONTRACTS_FROM},
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "cols": cols}, f, separators=(",", ":"), ensure_ascii=False)
    size = os.path.getsize(OUT)
    print(f"wrote {OUT}: {n:,} rows, {len(df.columns)} columns, {size/1e6:.1f} MB")

if __name__ == "__main__":
    main()
