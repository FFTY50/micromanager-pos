# Dual Port Install — Micromanager Edge v1

This guide shows how to run the new Micromanager Edge v1 code as two independent systemd instances, one per serial adapter (e.g., `/dev/ttyUSB0` and `/dev/ttyUSB1`). It does not replace any existing legacy `micromanager@` services; instead it installs separate `micromanager-edge@` instances so you can test safely.

## Prerequisites

- Root access (`sudo`)
- Node.js 18+ installed system-wide
- Serial devices present (e.g., `/dev/ttyUSB0`, `/dev/ttyUSB1`)
- n8n endpoints ready for lines and transactions

## What the installer does

- Creates a systemd template unit: `/etc/systemd/system/micromanager-edge@.service`
- Creates per-instance working dirs: `/opt/micromanager-edge-ttyUSB{N}`
- Symlinks your repo into each instance dir as `app/`
- Creates env files under `/etc/micromanager/edge-ttyUSB{N}.env`
- Sets per-instance queue path: `/var/lib/micromanager/edge-ttyUSB{N}/queue.db`
- Enables and starts: `micromanager-edge@ttyUSB0`, `micromanager-edge@ttyUSB1`

The service runs your current repo entrypoint `app/src/index.js` and reads instance-specific settings from the env files.

## Install

1. From the repo root, run the installer (as root):

   ```bash
   sudo scripts/install-dual-edge.sh
   ```

   - To customize port names (comma-separated):
     ```bash
     sudo PORTS=ttyUSB1,ttyUSB2 scripts/install-dual-edge.sh
     ```

2. Edit the generated env files and set required values:

   - `/etc/micromanager/edge-ttyUSB0.env`
   - `/etc/micromanager/edge-ttyUSB1.env`

   Required:
   - `N8N_LINES_URL` — webhook for line batches or individual lines
   - `N8N_TXNS_URL` — webhook for transaction summaries
   - `SERIAL_PORT` — created by the script (e.g., `/dev/ttyUSB0`)
   - `MICROMANAGER_ID`, `DEVICE_NAME` — identifiers for payloads

   Optional:
   - `TERMINAL_ID`, `STORE_ID`, `DRAWER_ID`
   - `HEALTH_PORT` (defaults 3300/3301)
   - Frigate settings (`FRIGATE_*`, plus `FRIGATE_URL` for the public viewer link)
   - `MICROMANAGER_ID` (defaults to `mmd-rv1-<last6 MAC>-<port>` when omitted)

3. Restart the instances to apply changes:

   ```bash
   sudo systemctl restart micromanager-edge@ttyUSB0 micromanager-edge@ttyUSB1
   ```

## Verify

- Check service status:
  ```bash
  systemctl status micromanager-edge@ttyUSB0
  systemctl status micromanager-edge@ttyUSB1
  ```

- Tail logs:
  ```bash
  journalctl -u micromanager-edge@ttyUSB0 -f
  journalctl -u micromanager-edge@ttyUSB1 -f
  ```

- Health endpoints (per instance):
  ```bash
  curl http://localhost:3300/healthz
  curl http://localhost:3301/healthz
  ```

### Frigate address tips

- The app now defaults to Frigate at `http://127.0.0.1:5000` via `config/defaults.json`.
- If Micromanager and Frigate run in the same Docker network, prefer the service name:
  - `FRIGATE_BASE=http://frigate:5000`
- If Micromanager runs on the host while Frigate runs in Docker (or vice versa), use localhost:
  - `FRIGATE_BASE=http://127.0.0.1:5000`
- You can override at any time in the instance env files:
  - `/etc/micromanager/edge-ttyUSB0.env`, `/etc/micromanager/edge-ttyUSB1.env`
- Set both `FRIGATE_BASE` (local/internal API target) and `FRIGATE_URL` (public link surfaced in webhook payloads)

## Coexistence with legacy services

- The legacy template `micromanager@.service` usually runs `src/app.js` or `app/src/app.js`. This installer uses `micromanager-edge@.service` and runs `app/src/index.js` to avoid conflicts.
- Do NOT attach two services to the same serial device. If a legacy instance already uses `/dev/ttyUSB0`, bind the new one to `/dev/ttyUSB1` or stop the legacy instance while testing.

## Updating code

The instance working directories symlink to your repo. After pulling new code:

```bash
cd /path/to/your/repo
sudo -u micromanager npm ci --omit=dev || sudo -u micromanager npm install --production
sudo systemctl restart micromanager-edge@ttyUSB0 micromanager-edge@ttyUSB1
```

## Managing services

- Start/stop/restart:
  ```bash
  sudo systemctl start  micromanager-edge@ttyUSB0
  sudo systemctl stop   micromanager-edge@ttyUSB0
  sudo systemctl restart micromanager-edge@ttyUSB0
  ```

- Enable at boot:
  ```bash
  sudo systemctl enable micromanager-edge@ttyUSB0 micromanager-edge@ttyUSB1
  ```

## Rollback

To disable the new instances and go back to legacy services:

```bash
sudo systemctl disable --now micromanager-edge@ttyUSB0 micromanager-edge@ttyUSB1
# Start your legacy units again, e.g.:
sudo systemctl start micromanager@ttyUSB0 micromanager@ttyUSB1
```

## Uninstall (optional)

```bash
sudo systemctl disable --now micromanager-edge@ttyUSB0 micromanager-edge@ttyUSB1
sudo rm -f /etc/systemd/system/micromanager-edge@.service
sudo rm -f /etc/micromanager/edge-ttyUSB0.env /etc/micromanager/edge-ttyUSB1.env
sudo rm -rf /opt/micromanager-edge-ttyUSB0 /opt/micromanager-edge-ttyUSB1
sudo systemctl daemon-reload
```

Instance queue DBs live under `/var/lib/micromanager/edge-ttyUSB{N}/queue.db`; remove if desired.
