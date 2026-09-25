#!/usr/bin/env bash
# Keeps trying to create the Always Free Ampere VM until Oracle has capacity,
# then prints its public IP. Also makes sure there is a public subnet with an
# internet route and opens TCP 25565 (and UDP 19132 with --bedrock) in its
# Security List, so the Oracle console firewall step is done for you.
#
# Runs on macOS (bash 3.2) or Linux, or in Oracle Cloud Shell. Needs the OCI
# CLI with a working config (see README.md) and jq.
#
#   bash oracle-retry-launch.sh --ssh-key ~/Downloads/ssh-key-2026-09-24.key
#
# Stop it any time with Ctrl+C; running it again picks up where it left off.
set -uo pipefail

# Keep a Mac awake while this runs (it still sleeps if you close the lid on battery).
# This has to happen before the options are parsed, while "$@" is still intact.
if [[ "$(uname)" == Darwin && -z "${OCI_RETRY_CAFFEINATED:-}" ]] && command -v caffeinate >/dev/null; then
  OCI_RETRY_CAFFEINATED=1 exec caffeinate -i bash "$0" "$@"
fi

SHAPE="VM.Standard.A1.Flex"
SSH_KEY=""
SIZES="2:12"
INTERVAL=60
NAME="minecraft"
COMPARTMENT=""
BEDROCK=0

usage() {
  cat <<'EOF'
Usage: bash oracle-retry-launch.sh --ssh-key PATH [options]

  --ssh-key PATH     The SSH key you downloaded from Oracle (private key or .pub)
  --sizes "2:12"     OCPU:GB sizes to try, biggest first (Always Free max is 2:12 since June 2026)
  --interval 60      Seconds to wait between rounds of attempts
  --bedrock          Also open UDP 19132 for Bedrock players
  --name minecraft   Name for the VM
  --compartment ID   Compartment OCID (default: your tenancy's root compartment)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssh-key) SSH_KEY="$2"; shift 2 ;;
    --sizes) SIZES="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --bedrock) BEDROCK=1; shift ;;
    --name) NAME="$2"; shift 2 ;;
    --compartment) COMPARTMENT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v oci >/dev/null || die "The OCI CLI isn't installed. On a Mac: brew install oci-cli"
command -v jq >/dev/null || die "jq isn't installed. On a Mac: brew install jq"
[[ -n "$SSH_KEY" ]] || { usage; die "--ssh-key is required"; }
[[ -f "$SSH_KEY" ]] || die "No such file: $SSH_KEY"

for size in $SIZES; do
  [[ "$size" =~ ^[0-9]+:[0-9]+$ ]] || die "Bad size '$size'; use OCPU:GB like 2:12"
  # Oracle halved the Always Free A1 allowance on 2026-06-15 (1,500 OCPU-h / 9,000 GB-h a month).
  (( ${size%%:*} <= 2 && ${size##*:} <= 12 )) || die "$size is over the Always Free limit of 2 OCPU / 12 GB"
done

# Oracle wants the public key. Accept the private key too and derive it.
PUB_KEY="$SSH_KEY"
if ! head -c 4 "$SSH_KEY" | grep -qE '^(ssh-|ecds)'; then
  chmod 600 "$SSH_KEY"
  PUB_KEY=$(mktemp "${TMPDIR:-/tmp}/oci-retry-pub.XXXXXX")
  ssh-keygen -y -f "$SSH_KEY" > "$PUB_KEY" 2>/dev/null \
    || die "$SSH_KEY isn't an SSH key ssh-keygen can read"
fi

ERR=$(mktemp "${TMPDIR:-/tmp}/oci-retry-err.XXXXXX")
trap 'rm -f "$ERR"; [[ "$PUB_KEY" != "$SSH_KEY" ]] && rm -f "$PUB_KEY"' EXIT

# ---------------------------------------------------------------------------
if [[ -z "$COMPARTMENT" ]]; then
  COMPARTMENT="${OCI_TENANCY:-}"   # set in Oracle Cloud Shell
  if [[ -z "$COMPARTMENT" ]]; then
    cfg="${OCI_CLI_CONFIG_FILE:-$HOME/.oci/config}"
    [[ -f "$cfg" ]] && COMPARTMENT=$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$cfg")
  fi
  [[ -n "$COMPARTMENT" ]] || die "Couldn't find your tenancy OCID in ~/.oci/config; pass --compartment"
fi
C="$COMPARTMENT"

log "Checking your Oracle login"
ADS=$(oci iam availability-domain list -c "$C" 2>"$ERR" | jq -r '.data[]?.name') \
  || true
[[ -n "$ADS" ]] || { cat "$ERR" >&2; die "The OCI CLI couldn't log in. Check ~/.oci/config (README.md, step A)."; }
log "Availability domains: $(echo $ADS)"

existing=$(oci compute instance list -c "$C" --all 2>/dev/null | jq -r --arg s "$SHAPE" '
  .data[]? | select(.shape == $s and ."lifecycle-state" != "TERMINATED" and ."lifecycle-state" != "TERMINATING")
  | "\(."display-name")  \(."lifecycle-state")  \(.id)"')
if [[ -n "$existing" ]]; then
  echo "You already have an Ampere VM, so there's nothing to create:"
  echo "  $existing"
  echo "Find its public IP under Compute → Instances. (Terminate it first if you want a new one.)"
  exit 0
fi

# Converts the CLI's kebab-case output back into the camelCase it wants as input.
JQ_CAMEL='def camel: if type == "object" then with_entries(select(.value != null)
    | .key |= (split("-") | .[0] + (.[1:] | map((.[:1] | ascii_upcase) + .[1:]) | join("")))
    | .value |= camel)
  elif type == "array" then map(camel) else . end;'

# ---------------------------------------------------------------------------
log "Looking for a public subnet"
SUBNET=$(oci network subnet list -c "$C" --all 2>/dev/null | jq -r '
  [.data[]? | select(."prohibit-public-ip-on-vnic" == false and ."lifecycle-state" == "AVAILABLE")][0].id // empty')
if [[ -z "$SUBNET" ]]; then
  log "None found; creating a network (VCNs are free)"
  VCN=$(oci network vcn create -c "$C" --cidr-blocks '["10.0.0.0/16"]' --display-name "$NAME-vcn" \
    --dns-label mcvcn --wait-for-state AVAILABLE 2>"$ERR" | jq -r '.data.id // empty')
  [[ -n "$VCN" ]] || { cat "$ERR" >&2; die "Couldn't create the VCN"; }
  SUBNET=$(oci network subnet create -c "$C" --vcn-id "$VCN" --cidr-block 10.0.0.0/24 \
    --display-name "$NAME-subnet" --dns-label mcsub --prohibit-public-ip-on-vnic false \
    --wait-for-state AVAILABLE 2>"$ERR" | jq -r '.data.id // empty')
  [[ -n "$SUBNET" ]] || { cat "$ERR" >&2; die "Couldn't create the subnet"; }
fi
SUBNET_JSON=$(oci network subnet get --subnet-id "$SUBNET") || die "Couldn't read subnet $SUBNET"
VCN=$(jq -r '.data."vcn-id"' <<<"$SUBNET_JSON")
log "Using subnet $(jq -r '.data."display-name"' <<<"$SUBNET_JSON")"

# A public subnet only reaches the internet through a 0.0.0.0/0 route to an internet gateway.
RT=$(jq -r '.data."route-table-id"' <<<"$SUBNET_JSON")
rules=$(oci network route-table get --rt-id "$RT" | jq -c '.data."route-rules" // []')
if ! jq -e 'any(.[]; .destination == "0.0.0.0/0")' <<<"$rules" >/dev/null; then
  log "Adding an internet gateway route"
  IGW=$(oci network internet-gateway list -c "$C" --vcn-id "$VCN" 2>/dev/null | jq -r '.data[0].id // empty')
  if [[ -z "$IGW" ]]; then
    IGW=$(oci network internet-gateway create -c "$C" --vcn-id "$VCN" --is-enabled true \
      --display-name "$NAME-igw" --wait-for-state AVAILABLE 2>"$ERR" | jq -r '.data.id // empty')
    [[ -n "$IGW" ]] || { cat "$ERR" >&2; die "Couldn't create the internet gateway"; }
  fi
  new_rules=$(jq -c --arg g "$IGW" "$JQ_CAMEL"' camel + [{destination: "0.0.0.0/0", destinationType: "CIDR_BLOCK", networkEntityId: $g}]' <<<"$rules")
  oci network route-table update --rt-id "$RT" --route-rules "$new_rules" --force >/dev/null 2>"$ERR" \
    || { cat "$ERR" >&2; die "Couldn't add the internet route"; }
fi

# Open the Minecraft port(s) in the subnet's Security List.
SL=$(jq -r '.data."security-list-ids"[0]' <<<"$SUBNET_JSON")
ingress=$(oci network security-list get --security-list-id "$SL" | jq -c '.data."ingress-security-rules" // []')
add_rules='[]'
port_open() {  # proto(6|17) optkey port
  jq -e --arg p "$1" --arg k "$2" --argjson n "$3" '
    [.[] | select(.protocol == $p and .source == "0.0.0.0/0") | .[$k]."destination-port-range"
     | select(. != null) | select(.min <= $n and .max >= $n)] | length > 0' <<<"$ingress" >/dev/null
}
if ! port_open 6 tcp-options 25565; then
  add_rules=$(jq -c '. + [{source: "0.0.0.0/0", protocol: "6", isStateless: false, description: "Minecraft Java",
    tcpOptions: {destinationPortRange: {min: 25565, max: 25565}}}]' <<<"$add_rules")
fi
if [[ $BEDROCK -eq 1 ]] && ! port_open 17 udp-options 19132; then
  add_rules=$(jq -c '. + [{source: "0.0.0.0/0", protocol: "17", isStateless: false, description: "Minecraft Bedrock",
    udpOptions: {destinationPortRange: {min: 19132, max: 19132}}}]' <<<"$add_rules")
fi
if [[ "$add_rules" != "[]" ]]; then
  log "Opening the Minecraft port in the Security List"
  new_ingress=$(jq -c --argjson add "$add_rules" "$JQ_CAMEL"' camel + $add' <<<"$ingress")
  oci network security-list update --security-list-id "$SL" --ingress-security-rules "$new_ingress" --force \
    >/dev/null 2>"$ERR" || { cat "$ERR" >&2; die "Couldn't update the Security List"; }
else
  log "Minecraft port already open in the Security List"
fi

# ---------------------------------------------------------------------------
log "Finding the latest Ubuntu image for Ampere"
IMAGE=""
for ver in 24.04 22.04; do
  IMAGE=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version "$ver" \
    --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --all 2>/dev/null | jq -r '.data[0].id // empty')
  [[ -n "$IMAGE" ]] && { log "Ubuntu $ver"; break; }
done
[[ -n "$IMAGE" ]] || die "Couldn't find an Ubuntu image for $SHAPE"

# ---------------------------------------------------------------------------
log "Trying to create the VM. This can take hours; leave it running. Ctrl+C to stop."
attempt=0
while true; do
  for ad in $ADS; do
    for size in $SIZES; do
      ocpus=${size%%:*}; mem=${size##*:}
      attempt=$((attempt + 1))
      out=$(oci compute instance launch --availability-domain "$ad" -c "$C" --shape "$SHAPE" \
        --shape-config "{\"ocpus\": $ocpus, \"memoryInGBs\": $mem}" --image-id "$IMAGE" \
        --subnet-id "$SUBNET" --assign-public-ip true --ssh-authorized-keys-file "$PUB_KEY" \
        --display-name "$NAME" 2>"$ERR")
      id=$(jq -r '.data.id // empty' <<<"$out" 2>/dev/null)
      if [[ -n "$id" ]]; then
        log "Attempt $attempt: GOT ONE! $ocpus OCPU / $mem GB in ${ad##*:}"
        break 3
      fi
      err=$(cat "$ERR")
      if grep -qi 'capacity' <<<"$err"; then
        log "Attempt $attempt: ${ad##*:} $ocpus OCPU/$mem GB: out of capacity"
      elif grep -qiE 'TooManyRequests|"status": 429' <<<"$err"; then
        log "Attempt $attempt: Oracle says slow down; waiting 3 minutes"
        sleep 180
      elif grep -qiE 'LimitExceeded|QuotaExceeded|limit.*exceeded' <<<"$err"; then
        echo "$err" >&2
        die "Oracle says this would go over your free limits. You may already have an Ampere VM, or
boot volumes using up the 200 GB (check Compute → Instances and Storage → Boot volumes)."
      elif grep -qiE 'NotAuthenticated|NotAuthorized|NotAuthorizedOrNotFound' <<<"$err"; then
        echo "$err" >&2
        die "Oracle refused the request (login or permissions); check ~/.oci/config."
      elif grep -qiE 'timed out|timeout|Connection|RequestException|ServiceUnavailable|"status": 50[234]' <<<"$err"; then
        log "Attempt $attempt: network hiccup, will retry"
      else
        echo "$err" >&2
        die "Unexpected error from Oracle (above). Send it to me and I'll adjust the script."
      fi
      sleep 5
    done
  done
  sleep $((INTERVAL + RANDOM % 15))
done

# ---------------------------------------------------------------------------
log "Waiting for the VM to boot"
for _ in $(seq 1 60); do
  state=$(oci compute instance get --instance-id "$id" 2>/dev/null | jq -r '.data."lifecycle-state" // empty')
  [[ "$state" == RUNNING ]] && break
  sleep 10
done
IP=""
for _ in $(seq 1 12); do
  IP=$(oci compute instance list-vnics --instance-id "$id" 2>/dev/null | jq -r '.data[0]."public-ip" // empty')
  [[ -n "$IP" ]] && break
  sleep 10
done

if [[ "$(uname)" == Darwin ]]; then
  osascript -e 'display notification "Your Minecraft VM was created" with title "Oracle Cloud" sound name "Glass"' 2>/dev/null || true
fi
cat <<EOF

=====================================================================
  Your VM is ${state:-starting}. Public IP: ${IP:-<see Compute → Instances>}
  Port 25565 is already open in Oracle's firewall.

  Next (give it a minute to finish booting):
    scp -i $SSH_KEY setup-minecraft.sh ubuntu@${IP:-<PUBLIC_IP>}:~
    ssh -i $SSH_KEY ubuntu@${IP:-<PUBLIC_IP>}
    bash setup-minecraft.sh --op YourName --whitelist Friend1,Friend2
=====================================================================
EOF
