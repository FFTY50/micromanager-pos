#!/bin/bash

# Micromanager Edge v1 — Dual instance installer
# Creates two systemd instances bound to ttyUSB0 and ttyUSB1 (configurable)
# without interfering with any legacy micromanager@ units.

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Defaults (override via env)
PORTS_CSV=${PORTS:-"ttyUSB0,ttyUSB1"}
SERVICE_USER=${SERVICE_USER:-"micromanager"}
TEMPLATE_NAME=${TEMPLATE_NAME:-"micromanager-edge@.service"}
ENV_DIR=${ENV_DIR:-"/etc/micromanager"}
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${BLUE}=== Micromanager Edge v1 Dual Instance Install ===${NC}"

# Root check
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

# Split ports
IFS=',' read -r -a PORTS <<< "$PORTS_CSV"

if [[ ${#PORTS[@]} -eq 0 ]]; then
  echo -e "${RED}No ports specified in PORTS${NC}"
  exit 1
fi

# Ensure service user exists
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --shell /bin/false "$SERVICE_USER"
  echo -e "${GREEN}✓ Created user: $SERVICE_USER${NC}"
else
  echo -e "${GREEN}✓ User $SERVICE_USER already exists${NC}"
fi

# Create systemd template for edge instances (separate from legacy micromanager@)
TEMPLATE_PATH="/etc/systemd/system/$TEMPLATE_NAME"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo -e "${YELLOW}Creating systemd template ${TEMPLATE_NAME}...${NC}"
  cat > "$TEMPLATE_PATH" <<'UNITEOF'
[Unit]
Description=Micromanager Edge v1 (%i)
After=network.target
Wants=network.target

[Service]
Type=simple
User=micromanager
Group=micromanager
WorkingDirectory=/opt/micromanager-edge-%i
ExecStart=/usr/bin/node app/src/index.js
Environment=NODE_ENV=production
EnvironmentFile=/etc/micromanager/edge-%i.env
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=micromanager-edge@%i
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/micromanager-edge-%i /var/lib/micromanager /dev
SupplementaryGroups=dialout

[Install]
WantedBy=multi-user.target
UNITEOF
  echo -e "${GREEN}✓ Created template at $TEMPLATE_PATH${NC}"
else
  echo -e "${GREEN}✓ Template already exists: $TEMPLATE_PATH${NC}"
fi

mkdir -p "$ENV_DIR"

# Ensure base dependencies are installed in the repo
echo -e "${YELLOW}Installing Node.js dependencies in repo (omit dev)...${NC}"
if command -v npm >/dev/null 2>&1; then
  # Ensure service user has a HOME (npm writes cache/logs)
  if [[ ! -d "/home/$SERVICE_USER" ]]; then
    mkdir -p "/home/$SERVICE_USER"
    chown "$SERVICE_USER:$SERVICE_USER" "/home/$SERVICE_USER"
    chmod 750 "/home/$SERVICE_USER"
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$BASE_DIR"
  su -s /bin/bash -c "set -e; export HOME=/home/$SERVICE_USER; cd '$BASE_DIR'; npm ci --omit=dev || npm install --production; npm rebuild better-sqlite3 || true" "$SERVICE_USER" \
    && echo -e "${GREEN}✓ Dependencies installed or already present${NC}" \
    || echo -e "${YELLOW}⚠️  Skipped dependency install (npm error)${NC}"
else
  echo -e "${YELLOW}⚠️  npm not found; skipping dependency install${NC}"
fi

# Create per-instance dirs, env files, and symlink to repo
for PORT in "${PORTS[@]}"; do
  INSTANCE_DIR="/opt/micromanager-edge-$PORT"
  QUEUE_DIR="/var/lib/micromanager/edge-$PORT"
  ENV_FILE="$ENV_DIR/edge-$PORT.env"

  echo -e "${YELLOW}Setting up instance for ${PORT}...${NC}"
  mkdir -p "$INSTANCE_DIR" "$QUEUE_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTANCE_DIR" "$QUEUE_DIR"
  chmod 755 "$INSTANCE_DIR" "$QUEUE_DIR"

  # Repo symlink under instance dir
  if [[ ! -L "$INSTANCE_DIR/app" ]]; then
    ln -s "$BASE_DIR" "$INSTANCE_DIR/app"
    chown -h "$SERVICE_USER:$SERVICE_USER" "$INSTANCE_DIR/app"
  fi

  # Suggest distinct health ports if the name ends with a digit
  DEFAULT_HEALTH_PORT="3300"
  if [[ "$PORT" =~ ([0-9]+)$ ]]; then
    LAST_DIGIT="${BASH_REMATCH[1]}"
    DEFAULT_HEALTH_PORT=$((3300 + LAST_DIGIT))
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" <<ENVEOF
# Required endpoints
N8N_LINES_URL=
N8N_TXNS_URL=

# Serial and identity
SERIAL_PORT=/dev/$PORT
MICROMANAGER_ID=
DEVICE_NAME=register-$PORT
TERMINAL_ID=
STORE_ID=
DRAWER_ID=

# Instance-specific queue path
QUEUE_DB_PATH=$QUEUE_DIR/queue.db

# Health server per instance
HEALTH_PORT=$DEFAULT_HEALTH_PORT
HEALTH_HOST=0.0.0.0

# Optional Frigate integration
# FRIGATE_BASE=
# FRIGATE_ENABLED=true
# FRIGATE_URL=
# FRIGATE_CAMERA_NAME=
# FRIGATE_LABEL=transaction
# FRIGATE_DURATION_SECONDS=900
# FRIGATE_REMOTE_ROLE=admin
# FRIGATE_RETAIN_ON_COMPLETE=false

# Posting mode
POST_LINES_AS_BATCH=true
ENVEOF
    chmod 640 "$ENV_FILE"
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
    echo -e "${GREEN}✓ Created $ENV_FILE${NC}"
  else
    echo -e "${GREEN}✓ Env file exists: $ENV_FILE${NC}"
  fi
done

# Reload and enable/start instances
systemctl daemon-reload
for PORT in "${PORTS[@]}"; do
  systemctl enable "micromanager-edge@${PORT}" >/dev/null 2>&1 || true
  systemctl restart "micromanager-edge@${PORT}" >/dev/null 2>&1 || systemctl start "micromanager-edge@${PORT}" >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Enabled micromanager-edge@${PORT}${NC}"
done

echo
echo -e "${BLUE}Done.${NC} Edit env files under $ENV_DIR (edge-*.env), then run:${NC}"
echo -e "  systemctl restart micromanager-edge@${PORTS[0]} micromanager-edge@${PORTS[1]}"
