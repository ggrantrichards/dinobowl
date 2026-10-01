"""
Gridiron — deploy guard (runs as firebase.json's hosting predeploy).

static/gridiron/data.json and games.json are generated and git-ignored, and a
Firebase deploy replaces the whole site: deploying from a checkout without them
took the stat table off the live site ("/gridiron/data.json 404"). Before every
deploy this rebuilds whichever is missing or older than its parquet, and stops
the deploy if it cannot.

The exports need pandas, pyarrow and rapidfuzz. Homebrew's Python refuses a
system-wide pip install (PEP 668), so they live in a project virtualenv,
.venv, and this script switches to it on its own; nothing needs activating:

    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt

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

VENV = os.path.join(HERE, ".venv")
SETUP = ("One-time setup, in this folder:\n"
         "  python3 -m venv .venv\n"
         "  .venv/bin/python -m pip install -r requirements.txt\n"
         "then deploy again.")

def has_deps():
    try:
        import pandas, pyarrow, rapidfuzz  # noqa: F401
        return True
    except ImportError:
        return False

def use_venv():
    """Re-run under .venv's Python when this one lacks the packages."""
    if has_deps():
        return
    for py in (os.path.join(VENV, "bin", "python"), os.path.join(VENV, "Scripts", "python.exe")):
        # compare prefixes, not paths: .venv/bin/python is a symlink to the system Python
        if os.path.exists(py) and os.path.abspath(sys.prefix) != os.path.abspath(VENV):
            print(f"using {os.path.relpath(py, HERE)}", flush=True)
            os.execv(py, [py, os.path.abspath(__file__)])
    sys.exit("\nDeploy stopped: building the stat table needs pandas, pyarrow and rapidfuzz.\n" + SETUP +
             "\n(Deploying without it would take the stat table off the live site.)")

def main():
    todo = [o for o in OUTPUTS if stale(o[0], o[1])]
    if todo:
        use_venv()
    for out, _, _ in OUTPUTS:
        if not any(t[0] == out for t in todo):
            print(f"ok   {out}")
    for out, src, script in todo:
        print(f"build {out} ({script})")
        if subprocess.call([sys.executable, os.path.join(HERE, script)], cwd=HERE) != 0 or not os.path.exists(os.path.join(HERE, out)):
            sys.exit(f"\nDeploy stopped: could not build {out} (see the error above).\n" + SETUP +
                     "\n(Deploying without it would take the stat table off the live site.)")

if __name__ == "__main__":
    main()
