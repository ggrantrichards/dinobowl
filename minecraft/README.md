# Free 24/7 Minecraft server on Oracle Cloud

`setup-minecraft.sh` sets up everything on the VM with one command. You only do
the Oracle console clicks (steps 1 and 2); the script handles the rest.

## 1. Create the VM (Oracle web console)

1. Sign up at <https://cloud.oracle.com>. A card is required for verification;
   Always Free resources are not charged.
2. **Compute → Instances → Create instance**
   - **Image:** Canonical Ubuntu 24.04 (22.04 also works)
   - **Shape:** Ampere `VM.Standard.A1.Flex`, **2 OCPU / 12 GB**. That is the Always Free
     maximum since Oracle halved it on 15 June 2026; anything bigger can be billed
   - **Networking:** keep "Assign a public IPv4 address" on
   - **SSH keys:** "Generate a key pair for me" → **Save private key**
3. **"Out of capacity"?** Pick another availability domain or retry later.
   Upgrading to Pay-As-You-Go usually fixes it, and you still pay nothing
   while you stay inside the Always Free limits.

### Stuck on "Out of capacity"? Let a script keep retrying

`oracle-retry-launch.sh` asks Oracle for the VM about once a minute until it
gets one, at 2 OCPU / 12 GB. It also creates the
network if needed and opens port 25565, so you can skip step 2. It runs on
your Mac, and the setup below is a one-time job.

**A. Give the OCI CLI access to your account**

1. Install the tools. If `brew` isn't found, install Homebrew from
   <https://brew.sh> first.
   ```bash
   brew install oci-cli jq
   ```
2. In the Oracle console, click the **profile icon** (top right) →
   **My profile** (or **User settings**) → **API keys** (or **Tokens and keys**)
   → **Add API key** → **Generate API key pair** → **Download private key**
   → **Add**.
3. A **Configuration file preview** appears. Click **Copy**.
4. In Terminal:
   ```bash
   mkdir -p ~/.oci
   ls ~/Downloads/*.pem                       # the API key you just downloaded
   mv ~/Downloads/THE-FILE-NAME.pem ~/.oci/oci_api_key.pem
   nano ~/.oci/config                         # paste the preview, Ctrl+O Enter, Ctrl+X
   ```
   In that file, change the `key_file=` line to
   `key_file=~/.oci/oci_api_key.pem`. Then run:
   ```bash
   chmod 600 ~/.oci/config ~/.oci/oci_api_key.pem
   oci iam region list                         # prints a list of regions = it works
   ```

**B. Run it** (the SSH key is the one you downloaded when creating the VM;
the private key or `.pub` both work):

```bash
cd ~/Downloads
bash oracle-retry-launch.sh --ssh-key ~/Downloads/ssh-key-XXXX.key
```

Leave Terminal open and the Mac plugged in. The script keeps the Mac awake
while it runs. When it succeeds, it shows a notification and prints the IP and
the next commands. Stop it with Ctrl+C at any time. Running it again is safe:
if a VM already exists, it tells you and exits.

It only creates Always Free resources: one Ampere VM of at most 2 OCPU / 12 GB,
the default ~47 GB boot volume, and a free VCN.

### Safety net: a quota policy that blocks anything beyond Always Free

`oracle-quota-policy.txt` makes Oracle **refuse** to create VMs or disks beyond
the free amounts, instead of billing for them. It is worth having before any
upgrade to Pay As You Go, and harmless on Free Tier.

☰ → **Governance & Administration** → **Quota Policies** → **Create Quota Policy**:
name `always-free-only`, compartment = your root compartment, paste the seven
lines from the file, **Create**.

It covers compute (only Ampere A1 up to 2 OCPU / 12 GB) and disk space (200 GB
total). Other paid services such as databases and load balancers are not
covered; don't create them, and keep a $1 budget alert as a second line of
defence.

## 2. Open the port in Oracle's cloud firewall

Instance page → **Primary VNIC → Subnet** → **Security Lists** → the default list →
**Add Ingress Rules**:

| Source CIDR | IP Protocol | Destination Port | For |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `25565` | Java players |
| `0.0.0.0/0` | UDP | `19132` | Bedrock players (only with `--bedrock`) |

The script opens the same ports in the VM's own iptables firewall. Both layers
must allow the traffic.

## 3. Run the script on the VM

From your computer (use the key you saved in step 1):

```bash
chmod 600 ssh-key.key
scp -i ssh-key.key setup-minecraft.sh ubuntu@<PUBLIC_IP>:~
ssh -i ssh-key.key ubuntu@<PUBLIC_IP>
```

Then, on the VM:

```bash
bash setup-minecraft.sh --op YourMinecraftName --whitelist Friend1,Friend2
# add --bedrock to let phones / consoles / Switch players join too
```

It takes a few minutes and prints the address friends connect to:
`<PUBLIC_IP>:25565`.

### Options

| Option | Meaning |
|---|---|
| `--op NAME` | Make NAME an operator (admin); also whitelists them |
| `--whitelist A,B` | Players allowed to join (Java names) |
| `--bedrock` | Install Geyser + Floodgate and open UDP 19132 |
| `--version 1.21.8` | Pin a Minecraft version (default: newest with a stable Paper build) |
| `--memory 16G` | Java heap (default: about 2/3 of RAM, so 8G on a 12 GB VM) |
| `--motd "text"` | Server list message (first install only) |
| `--dir PATH` | Install location (default `~/mc`) |

## What you get

- **Paper**: the latest stable build, with its SHA-256 checksum verified.
- **Java**: the version Paper asks for, from Ubuntu's own packages if they
  have it, otherwise from Eclipse Temurin.
- **`minecraft` systemd service**: starts on boot and restarts after a crash.
  Uses Aikar's GC flags, minus any flag the installed Java doesn't accept.
- **`server.properties`**:
  - `online-mode=true`
  - whitelist enforced
  - `view-distance=8` and `simulation-distance=6`
  - RCON on port 25575, which neither firewall opens, so it is reachable only
    from the VM itself
- **`mc-cmd`**: the server console, sent over RCON.
- **`mc-backup`**: runs daily at 04:00 through a systemd timer. It pauses
  saving, archives the world folders to `~/mc-backups`, and keeps the newest 7.

## Everyday commands (on the VM)

```bash
mc-cmd                               # interactive console (Ctrl+D quits)
mc-cmd "whitelist add Steve"         # let a Java player in
mc-cmd "fwhitelist add Steve"        # let a Bedrock player in (with --bedrock)
mc-cmd "op Steve"                    # make an admin
journalctl -u minecraft -f           # live log
sudo systemctl restart minecraft     # restart (stop / start work too)
mc-backup                            # back up right now
nano ~/mc/server.properties          # edit settings, then restart
bash setup-minecraft.sh              # update Paper (backs up the world first)
```

To change the heap later, edit the `-Xms` / `-Xmx` lines in `~/mc/jvm.args`
and restart.

## Notes

- **Off-server backups.** `~/mc-backups` lives on the same VM, so it won't
  save you if the instance is lost. Copy the backups to your own computer now
  and then:
  `scp -i ssh-key.key 'ubuntu@<PUBLIC_IP>:mc-backups/*' .`
- **Idle reclaim.** Oracle may reclaim Always Free instances that stay nearly
  idle for 7 days: CPU, network and (on A1 shapes) memory all below 20%. The
  server reserves its whole heap at startup (`-Xms` equals `-Xmx`, plus
  `AlwaysPreTouch`), so memory stays well above that line.
  Pay-As-You-Go accounts are not subject to reclaim.
- **Can't connect?**
  - Check the Security List rule from step 2.
  - Check the server is running: `systemctl status minecraft`.
  - From your own computer, test the port: `nc -vz <PUBLIC_IP> 25565`.
