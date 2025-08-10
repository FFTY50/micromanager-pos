#!/bin/bash

# Dual Micromanager Setup Script
# Creates two systemd service instances for ttyUSB0 and ttyUSB1

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PORTS=("ttyUSB0" "ttyUSB1")
SERVICE_USER="micromanager"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="/etc/micromanager"
SERVICE_TEMPLATE="/etc/systemd/system/micromanager@.service"

echo -e "${BLUE}=== Micromanager Dual Instance Setup ===${NC}"

# Root check
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

# Ensure service user exists
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --shell /bin/false "$SERVICE_USER"
  echo -e "${GREEN}✓ Created user: $SERVICE_USER${NC}"
else
  echo -e "${GREEN}✓ User $SERVICE_USER already exists${NC}"
fi

# Create templated unit file if missing
if [[ ! -f "$SERVICE_TEMPLATE" ]]; then
  echo -e "${YELLOW}Creating systemd template...${NC}"
  cat > "$SERVICE_TEMPLATE" <<'UNITEOF'
[Unit]
Description=Micromanager POS instance %i
After=network.target

[Service]
Type=simple
User=micromanager
Group=micromanager
WorkingDirectory=/opt/micromanager-%i
ExecStart=/usr/bin/node app/src/app.js
EnvironmentFile=/etc/micromanager/%i.env
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNITEOF
  echo -e "${GREEN}✓ Created template at $SERVICE_TEMPLATE${NC}"
else
  echo -e "${GREEN}✓ Systemd template already exists${NC}"
fi

mkdir -p "$ENV_DIR"

for PORT in "${PORTS[@]}"; do
  INST_DIR="/opt/micromanager-$PORT"
  echo -e "${YELLOW}Setting up instance for $PORT...${NC}"
  mkdir -p "$INST_DIR"
  if [[ ! -L "$INST_DIR/app" ]]; then
    ln -s "$BASE_DIR" "$INST_DIR/app"
    chown -h $SERVICE_USER:$SERVICE_USER "$INST_DIR/app"
  fi
  chown $SERVICE_USER:$SERVICE_USER "$INST_DIR"

  ENV_FILE="$ENV_DIR/$PORT.env"
  if [[ ! -f "$ENV_FILE" ]]; then
    cat > "$ENV_FILE" <<ENVEOF
SERIAL_PORT=/dev/$PORT
N8N_WEBHOOK_URL=https://example.com/webhook-$PORT
DEVICE_NAME=register-$PORT
ENVEOF
    echo -e "${GREEN}✓ Created $ENV_FILE${NC}"
  else
    echo -e "${GREEN}✓ Env file $ENV_FILE already exists${NC}"
  fi

done

# Enable services
systemctl daemon-reload
for PORT in "${PORTS[@]}"; do
  systemctl enable "micromanager@$PORT" >/dev/null 2>&1 || true
  systemctl start "micromanager@$PORT" >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Enabled micromanager@$PORT${NC}"
  echo -e "${GREEN}✓ Started micromanager@$PORT${NC}"

done

echo -e "${BLUE}Setup complete. Edit environment files in $ENV_DIR to customize.${NC}"
