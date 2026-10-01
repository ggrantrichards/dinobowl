"""
Gridiron — deploy guard (runs as firebase.json's hosting predeploy).

static/gridiron/data.json and games.json are generated and git-ignored, and a
Firebase deploy replaces the whole site: deploying from a checkout without them
took the stat table off the live site ("/gridiron/data.json 404"). Before every
deploy this rebuilds whichever is missing or older than its parquet, and stops
the deploy if it cannot.

    python prepare_deploy.py
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUTS = [
    # (generated file, its source, the script that writes it)
    ("static/gridiron/data.json", "data/players.parquet", "export_gridiron.py"),
    ("static/gridiron/games.json", "data/games.parquet", "export_games.py"),
]

def stale(out, src):
    out, src = os.path.join(HERE, out), os.path.join(HERE, src)
    return not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src)

def main():
    for out, src, script in OUTPUTS:
        if not stale(out, src):
            print(f"ok   {out}")
            continue
        print(f"build {out} ({script})")
        if subprocess.call([sys.executable, os.path.join(HERE, script)], cwd=HERE) != 0 or not os.path.exists(os.path.join(HERE, out)):
            sys.exit(f"\nDeploy stopped: could not build {out}.\n"
                     f"Install the Python packages first:  python3 -m pip install -r requirements.txt\n"
                     f"then deploy again. (Deploying without it would take the stat table off the live site.)")

if __name__ == "__main__":
    main()
