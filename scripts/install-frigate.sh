#!/usr/bin/env bash
# install-frigate-016.sh — Frigate 0.16.0-rc3 on Docker (Debian/Ubuntu/Raspberry Pi OS)
# External: 8971 (auth’d UI/API)
# Internal-only: 5000 (compat for your current PiTunnel integration)
set -euo pipefail

# --- Tunables ---
COMPOSE_DIR="/opt/frigate"
STORAGE_DIR="/srv/frigate"
IMAGE="ghcr.io/blakeblackshear/frigate:0.16.0-rc3"
UI_PORT="8971"                        # external
COMPAT_PORT="5000"                    # internal-only
SHM_MB="512"                          # ffmpeg shared mem
USER_TO_ADD="$(logname 2>/dev/null || echo "${SUDO_USER:-}")"

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)."; exit 1; fi

mkdir -p "$COMPOSE_DIR" "$STORAGE_DIR"/{media,db} "$COMPOSE_DIR/config"
chmod -R 755 "$COMPOSE_DIR" "$STORAGE_DIR"

# --- Docker + Compose (idempotent) ---
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/$(. /etc/os-release; echo "$ID")/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/$(. /etc/os-release; echo "$ID") \
$(. /etc/os-release; echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable --now docker
  [[ -n "$USER_TO_ADD" ]] && usermod -aG docker "$USER_TO_ADD" || true
fi

# --- docker-compose.yml ---
cat >"$COMPOSE_DIR/docker-compose.yml" <<EOF
version: "3.9"
services:
  frigate:
    image: ${IMAGE}
    container_name: frigate
    privileged: true
    restart: unless-stopped
    shm_size: "${SHM_MB}mb"
    # Expose 8971 publicly; keep 5000 loopback-only for your MVP integration
    ports:
      - "${UI_PORT}:8971"
      - "127.0.0.1:${COMPAT_PORT}:5000"
    volumes:
      - ./config:/config
      - ${STORAGE_DIR}/media:/media/frigate
      - ${STORAGE_DIR}/db:/db
      - /etc/localtime:/etc/localtime:ro
    devices:
      - /dev/dri:/dev/dri
      - /dev/bus/usb:/dev/bus/usb
      - /dev/apex_0:/dev/apex_0
    environment:
      # If you use rtsp://user:\${FRIGATE_RTSP_PASSWORD}@... in camera URLs, set it here.
      # FRIGATE_RTSP_PASSWORD: "changeme"
EOF

# --- Starter config.yml (0.16-friendly, minimal, CPU detector) ---
cat >"$COMPOSE_DIR/config/config.yml" <<'EOF'
# Minimal Frigate config for 0.16.x — expand as needed.

mqtt:
  enabled: false   # flip to true + configure if/when you integrate HA

detectors:
  cpu:
    type: cpu

# Keep detect enabled explicitly (safe across versions)
detect:
  enabled: true

record:
  enabled: true
  retain:
    days: 7
  events:
    retain:
      default: 30

snapshots:
  enabled: true
  retain:
    default: 30

# Example camera (disabled). Copy this block, update URL, then set enabled: true.
cameras:
  example_cam:
    enabled: false
    ffmpeg:
      inputs:
        - path: rtsp://user:pass@CAMERA_IP:554/Streaming/Channels/101
          roles: [record, detect]
    detect:
      width: 1280
      height: 720

media_dir: /media/frigate
database:
  path: /db/frigate.db
EOF

# --- Launch ---
echo "[+] Pulling image and starting Frigate..."
cd "$COMPOSE_DIR"
docker compose pull
docker compose up -d

echo
echo "Frigate 0.16 RC is spinning up."
echo "External (UI/API):   https://<HOST>:${UI_PORT}"
echo "Internal-only API:   http://127.0.0.1:${COMPAT_PORT}"
echo "Compose dir:         ${COMPOSE_DIR}"
echo "Storage dir:         ${STORAGE_DIR}"
echo
echo "Pro tips:"
echo " - Add cameras: edit ${COMPOSE_DIR}/config/config.yml, then: docker compose restart frigate"
echo " - Health check: docker logs -f frigate (first-run admin creds are logged)"
echo " - Upgrade later: edit image tag, then: docker compose pull && docker compose up -d"