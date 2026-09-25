#!/usr/bin/env bash
# One-shot Minecraft (Paper) server installer for an Oracle Cloud Always Free
# Ampere VM running Ubuntu 22.04 / 24.04. Run it ON THE VM as the normal
# `ubuntu` user (not with sudo); it calls sudo itself where needed.
#
#   bash setup-minecraft.sh --op YourName --whitelist Friend1,Friend2
#
# What it does (safe to re-run; re-running also updates Paper):
#   1. Installs Java (the version Paper asks for), jq, iptables-persistent.
#   2. Opens TCP 25565 (and UDP 19132 with --bedrock) in the VM's iptables,
#      above Oracle's default REJECT rule, and saves it across reboots.
#   3. Downloads the latest stable Paper build and verifies its SHA-256.
#   4. Writes eula.txt, server.properties (whitelist on, online-mode on,
#      view-distance 8, simulation-distance 6, RCON on localhost-only port).
#   5. Installs a systemd service (starts on boot, restarts on crash),
#      a `mc-cmd` console helper, and a daily world backup timer.
#   6. Starts the server, then applies --op / --whitelist through RCON.
#
# It cannot open the port in Oracle's cloud firewall (the VCN Security List);
# do that in the web console, see README.md.
set -euo pipefail

MC_VERSION=""
MEMORY=""
MOTD="A Minecraft Server"
BEDROCK=0
OPS=()
WHITELIST=()
MC_DIR="$HOME/mc"
BACKUP_DIR="$HOME/mc-backups"
PAPER_API="${PAPER_API:-https://fill.papermc.io}"
PAPER_API_V2="${PAPER_API_V2:-https://api.papermc.io}"
UA="mc-oracle-setup/1.0 (self-hosted server installer)"

usage() {
  cat <<'EOF'
Usage: bash setup-minecraft.sh [options]

  --op NAME            Make NAME an operator (repeatable, or comma-separated)
  --whitelist NAMES    Whitelist these Java players (repeatable, or comma-separated)
  --bedrock            Also install Geyser + Floodgate so phones/consoles can join (UDP 19132)
  --version X          Minecraft version (default: newest with a stable Paper build)
  --memory 16G         Java heap size (default: about 2/3 of the VM's RAM)
  --motd "text"        Server list message (first install only)
  --dir PATH           Install directory (default: ~/mc)
  -h, --help           Show this help
EOF
}

split_names() { tr ',' '\n' <<<"$1" | sed 's/^ *//;s/ *$//' | grep -v '^$' || true; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --op) while read -r n; do OPS+=("$n"); done < <(split_names "$2"); shift 2 ;;
    --whitelist) while read -r n; do WHITELIST+=("$n"); done < <(split_names "$2"); shift 2 ;;
    --bedrock) BEDROCK=1; shift ;;
    --version) MC_VERSION="$2"; shift 2 ;;
    --memory) MEMORY="$2"; shift 2 ;;
    --motd) MOTD="$2"; shift 2 ;;
    --dir) MC_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Run this as your normal user (e.g. ubuntu), not as root or with sudo."
command -v apt-get >/dev/null || die "This script expects Ubuntu (apt-get not found)."
RUN_USER="$(id -un)"
MC_DIR="$(realpath -m "$MC_DIR")"

# --------------------------------------------------------------------------
log "Installing base packages"
echo "iptables-persistent iptables-persistent/autosave_v4 boolean true" | sudo debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean true" | sudo debconf-set-selections
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl jq iptables iptables-persistent python3 ca-certificates gpg

# --------------------------------------------------------------------------
log "Opening firewall ports on the VM"
open_port() {  # proto port
  local proto=$1 port=$2 pos
  if sudo iptables -C INPUT -p "$proto" -m state --state NEW -m "$proto" --dport "$port" -j ACCEPT 2>/dev/null; then
    echo "$proto/$port already open"
    return
  fi
  # Oracle's Ubuntu images end INPUT with a REJECT rule; insert just above it.
  pos=$(sudo iptables -L INPUT --line-numbers -n | awk '$2=="REJECT"{print $1; exit}')
  if [[ -n "$pos" ]]; then
    sudo iptables -I INPUT "$pos" -p "$proto" -m state --state NEW -m "$proto" --dport "$port" -j ACCEPT
  else
    sudo iptables -A INPUT -p "$proto" -m state --state NEW -m "$proto" --dport "$port" -j ACCEPT
  fi
  echo "opened $proto/$port"
}
open_port tcp 25565
[[ $BEDROCK -eq 1 ]] && open_port udp 19132
sudo netfilter-persistent save

# --------------------------------------------------------------------------
log "Finding the Paper build"
api() { curl -fsSL --retry 3 -A "$UA" "$@"; }

JAR_URL="" JAR_SHA="" JAVA_MIN="" BUILD=""
pick_build_v3() {  # tries versions newest-first, keeps the first with a STABLE build
  local candidates v b
  if [[ -n "$MC_VERSION" ]]; then
    candidates="$MC_VERSION"
  else
    # Accepts {"versions":{"1.21":["1.21.8",...]}} or a list of ids / {version:{id}} objects.
    candidates=$(api "$PAPER_API/v3/projects/paper" | jq -r '
        .versions | if type == "object" then [.[][]] else . end | .[]
        | if type == "object" then (.version.id // .id) else . end | strings' \
      | grep -Ev -- '-|[a-z]' | sort -rV | head -n 5) || return 1
  fi
  for v in $candidates; do
    b=$(api "$PAPER_API/v3/projects/paper/versions/$v/builds/latest") || continue
    if [[ "$(jq -r '.channel // "" | ascii_upcase' <<<"$b")" == "STABLE" || -n "$MC_VERSION" ]]; then
      MC_VERSION="$v"
      BUILD=$(jq -r '.id' <<<"$b")
      JAR_URL=$(jq -r '(.downloads["server:default"] // (.downloads | to_entries[0].value)).url' <<<"$b")
      JAR_SHA=$(jq -r '(.downloads["server:default"] // (.downloads | to_entries[0].value)).checksums.sha256' <<<"$b")
      JAVA_MIN=$(api "$PAPER_API/v3/projects/paper/versions/$v" | jq -r '.version.java.version.minimum // empty') || true
      return 0
    fi
  done
  return 1
}
pick_build_v2() {  # legacy API, used only if the v3 API is unreachable
  local builds name
  if [[ -z "$MC_VERSION" ]]; then
    MC_VERSION=$(api "$PAPER_API_V2/v2/projects/paper" | jq -r '.versions[]' | grep -Ev -- '-|[a-z]' | sort -rV | head -n 1) || return 1
  fi
  builds=$(api "$PAPER_API_V2/v2/projects/paper/versions/$MC_VERSION/builds") || return 1
  BUILD=$(jq -r '[.builds[] | select(.channel=="default")] | last | .build // empty' <<<"$builds")
  [[ -n "$BUILD" ]] || return 1
  name=$(jq -r --argjson b "$BUILD" '.builds[] | select(.build==$b) | .downloads.application.name' <<<"$builds")
  JAR_SHA=$(jq -r --argjson b "$BUILD" '.builds[] | select(.build==$b) | .downloads.application.sha256' <<<"$builds")
  JAR_URL="$PAPER_API_V2/v2/projects/paper/versions/$MC_VERSION/builds/$BUILD/downloads/$name"
}
pick_build_v3 || { warn "Paper v3 API failed, trying the v2 API"; pick_build_v2; } \
  || die "Could not find a Paper build${MC_VERSION:+ for $MC_VERSION}. Check https://papermc.io/downloads/paper"
[[ -n "$JAR_URL" && "$JAR_URL" != null ]] || die "Paper API returned no download URL"
if [[ -z "$JAVA_MIN" ]]; then
  # 1.20.5 to 1.21.x need Java 21; the year-numbered releases (26.x+) need 25.
  if [[ "$MC_VERSION" == 1.* ]]; then JAVA_MIN=21; else JAVA_MIN=25; fi
fi
echo "Minecraft $MC_VERSION, Paper build $BUILD, needs Java $JAVA_MIN+"

# --------------------------------------------------------------------------
log "Installing Java $JAVA_MIN"
find_java() {
  local j v
  for j in /usr/lib/jvm/*/bin/java; do
    [[ -x "$j" ]] || continue
    v=$("$j" -XshowSettings:properties -version 2>&1 | awk -F' = ' '/java.specification.version/{print $2}')
    if [[ "$v" =~ ^[0-9]+$ ]] && (( v >= JAVA_MIN )); then echo "$j"; return 0; fi
  done
  return 1
}
if ! JAVA_BIN=$(find_java); then
  if apt-cache show "openjdk-$JAVA_MIN-jre-headless" >/dev/null 2>&1; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "openjdk-$JAVA_MIN-jre-headless"
  else
    echo "openjdk-$JAVA_MIN isn't in this Ubuntu's repos; using Eclipse Temurin (Adoptium)"
    curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | sudo gpg --dearmor --yes -o /usr/share/keyrings/adoptium.gpg
    codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
    echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $codename main" \
      | sudo tee /etc/apt/sources.list.d/adoptium.list >/dev/null
    sudo apt-get update -y
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "temurin-$JAVA_MIN-jdk"
  fi
  JAVA_BIN=$(find_java) || die "Java $JAVA_MIN installed but not found under /usr/lib/jvm"
fi
echo "Using $JAVA_BIN"

# --------------------------------------------------------------------------
mkdir -p "$MC_DIR" "$BACKUP_DIR"
cd "$MC_DIR"
if [[ -f server.jar ]] && [[ "$(sha256sum server.jar | cut -d' ' -f1)" == "$JAR_SHA" ]]; then
  log "Paper $MC_VERSION build $BUILD already installed"
else
  if [[ -f server.jar ]] && ls -d world* >/dev/null 2>&1 && command -v mc-backup >/dev/null; then
    log "Backing up the world before updating Paper"
    mc-backup || warn "Backup failed; continuing"
  fi
  log "Downloading Paper $MC_VERSION build $BUILD"
  api -o server.jar.new "$JAR_URL"
  echo "$JAR_SHA  server.jar.new" | sha256sum -c - || die "Checksum mismatch on the Paper download"
  mv server.jar.new server.jar
fi

if [[ $BEDROCK -eq 1 ]]; then
  log "Installing Geyser + Floodgate (Bedrock support)"
  mkdir -p plugins
  for p in geyser floodgate; do
    api -o "plugins/$p-spigot.jar" \
      "https://download.geysermc.org/v2/projects/$p/versions/latest/builds/latest/downloads/spigot"
  done
fi

# --------------------------------------------------------------------------
log "Writing server config"
echo "eula=true" > eula.txt

set_prop() {  # key value: replace the line if present, else append
  local k=$1 v=$2
  if grep -q "^$k=" server.properties 2>/dev/null; then
    local tmp; tmp=$(mktemp)
    awk -v k="$k" -v v="$v" 'index($0, k"=")==1 {print k"="v; next} {print}' server.properties > "$tmp"
    cat "$tmp" > server.properties && rm -f "$tmp"
  else
    echo "$k=$v" >> server.properties
  fi
}
if [[ ! -f server.properties ]]; then
  touch server.properties
  set_prop motd "$MOTD"
  set_prop online-mode true
  set_prop white-list true
  set_prop enforce-whitelist true
  set_prop view-distance 8
  set_prop simulation-distance 6
  set_prop server-port 25565
fi
# RCON lets mc-cmd and the backup job talk to the server. Port 25575 is not
# opened in either firewall, so it is only reachable from the VM itself.
if ! grep -q '^rcon.password=.\+' server.properties; then
  set_prop rcon.password "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
fi
set_prop enable-rcon true
set_prop rcon.port 25575
set_prop broadcast-rcon-to-ops false
chmod 600 server.properties

# --------------------------------------------------------------------------
log "Choosing JVM flags"
total_mb=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
if [[ -z "$MEMORY" ]]; then
  heap_gb=$(( total_mb * 2 / 3 / 1024 ))
  if (( heap_gb < 1 )); then
    warn "Only ${total_mb} MB RAM. Use the Ampere A1 shape (2 OCPU / 12 GB), not the 1 GB micro VM."
    MEMORY="768M"
  else
    MEMORY="${heap_gb}G"
  fi
fi
MEMORY="${MEMORY^^}"; MEMORY="${MEMORY%B}"
heap_mb=$(numfmt --from=iec "$MEMORY" | awk '{print int($1/1048576)}')
(( heap_mb < total_mb )) || die "--memory $MEMORY is not less than the VM's ${total_mb} MB RAM"

# Aikar's G1 flags, as recommended in the Paper docs.
if (( heap_mb >= 12288 )); then
  g1="-XX:G1NewSizePercent=40 -XX:G1MaxNewSizePercent=50 -XX:G1HeapRegionSize=16M -XX:G1ReservePercent=15 -XX:InitiatingHeapOccupancyPercent=20"
else
  g1="-XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:InitiatingHeapOccupancyPercent=15"
fi
candidate_flags="-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions
  -XX:+DisableExplicitGC -XX:+AlwaysPreTouch $g1 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4
  -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseIntervalMillis=5000 -XX:SurvivorRatio=32
  -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1"
# Drop any flag this JVM no longer accepts, so a newer Java can't break startup.
{
  echo "-Xms$MEMORY"
  echo "-Xmx$MEMORY"
  for f in $candidate_flags; do
    if "$JAVA_BIN" -XX:+UnlockExperimentalVMOptions "$f" -version >/dev/null 2>&1; then
      echo "$f"
    else
      echo "  skipping $f (not supported by this Java)" >&2
    fi
  done
  echo "-Dusing.aikars.flags=https://mcflags.emc.gs"
  echo "-Daikars.new.flags=true"
} > jvm.args
echo "Heap $MEMORY of ${total_mb} MB RAM; flags in $MC_DIR/jvm.args"

# --------------------------------------------------------------------------
log "Installing mc-cmd (server console over RCON)"
sudo tee /usr/local/bin/mc-cmd >/dev/null <<EOF
#!/usr/bin/env python3
"""Send a command to the Minecraft server console.

  mc-cmd "whitelist add Steve"     one command
  mc-cmd                           interactive console (Ctrl+D to quit)
"""
import os, re, socket, struct, sys

MC_DIR = os.environ.get("MC_DIR", "$MC_DIR")


def prop(key, default=None):
    with open(os.path.join(MC_DIR, "server.properties"), encoding="utf-8") as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip()
    return default


def recv_exact(sock, n):
    buf = b""
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("RCON connection closed")
        buf += chunk
    return buf


def request(sock, req_id, kind, body):
    data = struct.pack("<ii", req_id, kind) + body.encode("utf-8") + b"\0\0"
    sock.sendall(struct.pack("<i", len(data)) + data)
    (length,) = struct.unpack("<i", recv_exact(sock, 4))
    resp_id, _ = struct.unpack("<ii", recv_exact(sock, 8))
    payload = recv_exact(sock, length - 8)[:-2]
    return resp_id, re.sub("§.", "", payload.decode("utf-8", "replace"))


def connect():
    sock = socket.create_connection(("127.0.0.1", int(prop("rcon.port", "25575"))), timeout=30)
    if request(sock, 1, 3, prop("rcon.password", ""))[0] == -1:
        sys.exit("RCON login failed (wrong rcon.password?)")
    return sock


def main():
    try:
        sock = connect()
    except OSError as e:
        sys.exit(f"Can't reach the server console ({e}). Is it running? systemctl status minecraft")
    if len(sys.argv) > 1:
        out = request(sock, 2, 2, " ".join(sys.argv[1:]))[1]
        if out:
            print(out)
        return
    print("Minecraft console. Type commands without a slash; Ctrl+D to quit.")
    while True:
        try:
            line = input("> ").strip()
        except EOFError:
            print()
            return
        if line:
            out = request(sock, 2, 2, line)[1]
            if out:
                print(out)


if __name__ == "__main__":
    main()
EOF
sudo chmod 755 /usr/local/bin/mc-cmd

log "Installing mc-backup and a daily backup timer"
sudo tee /usr/local/bin/mc-backup >/dev/null <<EOF
#!/usr/bin/env bash
# Archive the world folders to $BACKUP_DIR, keeping the newest \${KEEP:-7}.
set -euo pipefail
MC_DIR="$MC_DIR"
DEST="$BACKUP_DIR"
KEEP="\${KEEP:-7}"
mkdir -p "\$DEST"
cd "\$MC_DIR"
level=\$(awk -F= '\$1=="level-name"{print \$2}' server.properties)
level=\${level:-world}
worlds=("\$level" "\${level}"_nether "\${level}"_the_end)
existing=()
for w in "\${worlds[@]}"; do [[ -d "\$w" ]] && existing+=("\$w"); done
[[ \${#existing[@]} -gt 0 ]] || { echo "No world folders yet"; exit 0; }
paused=0
if systemctl is-active --quiet minecraft && mc-cmd "save-off" >/dev/null 2>&1; then
  paused=1
  trap 'mc-cmd "save-on" >/dev/null 2>&1 || true' EXIT
  mc-cmd "save-all flush" >/dev/null
fi
out="\$DEST/world-\$(date +%F_%H%M%S).tar.gz"
tar -czf "\$out" "\${existing[@]}"
echo "Saved \$out (\$(du -h "\$out" | cut -f1))"
ls -1t "\$DEST"/world-*.tar.gz | tail -n +\$((KEEP + 1)) | xargs -r rm --
EOF
sudo chmod 755 /usr/local/bin/mc-backup

sudo tee /etc/systemd/system/minecraft-backup.service >/dev/null <<EOF
[Unit]
Description=Back up the Minecraft world

[Service]
Type=oneshot
User=$RUN_USER
ExecStart=/usr/local/bin/mc-backup
EOF
sudo tee /etc/systemd/system/minecraft-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Daily Minecraft world backup

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=15min
Persistent=true

[Install]
WantedBy=timers.target
EOF

# --------------------------------------------------------------------------
log "Installing the minecraft systemd service"
sudo tee /etc/systemd/system/minecraft.service >/dev/null <<EOF
[Unit]
Description=Minecraft server (Paper $MC_VERSION)
Wants=network-online.target
After=network-online.target

[Service]
User=$RUN_USER
WorkingDirectory=$MC_DIR
ExecStart=$JAVA_BIN @$MC_DIR/jvm.args -jar $MC_DIR/server.jar --nogui
# Paper saves the worlds on SIGTERM; give it time before a hard kill.
KillSignal=SIGTERM
TimeoutStopSec=180
SuccessExitStatus=0 143
Restart=on-failure
RestartSec=15
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable minecraft.service minecraft-backup.timer >/dev/null
sudo systemctl start minecraft-backup.timer
if systemctl is-active --quiet minecraft; then
  log "Restarting the server to pick up changes"
  sudo systemctl restart minecraft
else
  log "Starting the server"
  sudo systemctl start minecraft
fi

# --------------------------------------------------------------------------
log "Waiting for the server to finish starting (first start generates the world, 1-5 min)"
ready=0
for _ in $(seq 1 120); do
  if ! systemctl is-active --quiet minecraft; then
    sudo journalctl -u minecraft -n 40 --no-pager >&2
    die "The server stopped during startup; the log is above."
  fi
  if mc-cmd list >/dev/null 2>&1; then ready=1; break; fi
  sleep 5
done
if [[ $ready -eq 1 ]]; then
  for n in "${WHITELIST[@]}" "${OPS[@]}"; do mc-cmd "whitelist add $n" || warn "could not whitelist $n"; done
  for n in "${OPS[@]}"; do mc-cmd "op $n" || warn "could not op $n"; done
  mc-cmd "whitelist reload" >/dev/null
else
  warn "Server is still starting. Add players later with: mc-cmd \"whitelist add NAME\""
fi

PUBLIC_IP=$(curl -fsS -m 5 https://ifconfig.me 2>/dev/null || curl -fsS -m 5 https://api.ipify.org 2>/dev/null || echo "<PUBLIC_IP>")
ports="TCP 25565"
[[ $BEDROCK -eq 1 ]] && ports="TCP 25565 and UDP 19132"
printf '\n\033[1;32mDone.\033[0m Paper %s (build %s) is running as a systemd service.\n\n' "$MC_VERSION" "$BUILD"
echo "  Java players connect to:    $PUBLIC_IP:25565"
[[ $BEDROCK -eq 1 ]] && echo "  Bedrock players connect to: $PUBLIC_IP, port 19132"
cat <<EOF

  If friends can't connect, add an Oracle Security List ingress rule for
  $ports from 0.0.0.0/0 (see README.md).

  mc-cmd                          interactive server console
  mc-cmd "whitelist add NAME"     let a Java player join
  mc-cmd "op NAME"                make someone an admin
  journalctl -u minecraft -f      live server log
  sudo systemctl restart minecraft
  mc-backup                       back up now (runs daily at 04:00, keeps 7)
  bash setup-minecraft.sh         re-run any time to update Paper
EOF
[[ $BEDROCK -eq 1 ]] && echo '  mc-cmd "fwhitelist add NAME"    let a Bedrock player join (Floodgate)'
exit 0
