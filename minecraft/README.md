# Free 24/7 Minecraft server on Oracle Cloud

`setup-minecraft.sh` sets up everything on the VM with one command. You only do
the Oracle console clicks (steps 1 and 2); the script handles the rest.

## 1. Create the VM (Oracle web console)

1. Sign up at <https://cloud.oracle.com>. A card is required for verification;
   Always Free resources are not charged.
2. **Compute → Instances → Create instance**
   - **Image:** Canonical Ubuntu 24.04 (22.04 also works)
   - **Shape:** Ampere `VM.Standard.A1.Flex`, **4 OCPU / 24 GB** (or 2 / 12)
   - **Networking:** keep "Assign a public IPv4 address" on
   - **SSH keys:** "Generate a key pair for me" → **Save private key**
3. **"Out of capacity"?** Pick another availability domain or retry later.
   Upgrading to Pay-As-You-Go usually fixes it, and you still pay nothing
   while you stay inside the Always Free limits.

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
| `--memory 16G` | Java heap (default: about 2/3 of RAM, so 16G on a 24 GB VM) |
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
