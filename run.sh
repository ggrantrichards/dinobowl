#!/usr/bin/env bash
# Gridiron launcher: sets up deps, builds data if missing, starts the app.
set -e
cd "$(dirname "$0")"
python3 -m pip install --quiet flask pandas pyarrow requests
if [ ! -f data/players.parquet ]; then
  echo "First run: downloading NFL data (2000–present)…"
  python3 fetch_data.py
fi
echo "Starting Gridiron at http://127.0.0.1:5000  (Ctrl+C to stop)"
python3 app.py
