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

# Webhook URL configuration
# Prefer environment N8N_WEBHOOK_URL if set; otherwise use the standard URL.
N8N_URL_DEFAULT="https://n8n-vcni0-u35184.vm.elestio.app/webhook/parse-pos-line"
N8N_URL="${N8N_WEBHOOK_URL:-$N8N_URL_DEFAULT}"

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
SupplementaryGroups=dialout
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
N8N_WEBHOOK_URL=$N8N_URL
DEVICE_NAME=register-$PORT
ENVEOF
    echo -e "${GREEN}✓ Created $ENV_FILE${NC}"
  else
    echo -e "${GREEN}✓ Env file $ENV_FILE already exists${NC}"
  fi

done

# Install Node.js dependencies (shared repo) and fix log permissions
echo -e "${YELLOW}Installing Node.js dependencies (if needed)...${NC}"
if command -v npm >/dev/null 2>&1; then
  # Prefer npm ci; fallback to npm install --production
  su -s /bin/bash -c "cd '$BASE_DIR' && (npm ci --omit=dev || npm install --production)" $SERVICE_USER \
    && echo -e "${GREEN}✓ Dependencies installed${NC}" \
    || echo -e "${YELLOW}⚠️  Skipped dependency install (npm error)${NC}"
else
  echo -e "${YELLOW}⚠️  npm not found; skipping dependency install${NC}"
fi

echo -e "${YELLOW}Ensuring transaction-logs permissions...${NC}"
LOG_DIRS=(
  "/opt/micromanager-pos/transaction-logs"
  "/opt/micromanager-cloud/transaction-logs"
)
for d in "${LOG_DIRS[@]}"; do
  mkdir -p "$d"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$d"
  chmod 755 "$d"
done
if [[ -x "$BASE_DIR/scripts/fix-logs-perms.sh" ]]; then
  sudo "$BASE_DIR/scripts/fix-logs-perms.sh" || true
fi
echo -e "${GREEN}✓ Log directories ready${NC}"

# Enable services
systemctl daemon-reload
for PORT in "${PORTS[@]}"; do
  systemctl enable "micromanager@$PORT" >/dev/null 2>&1 || true
  systemctl start "micromanager@$PORT" >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Enabled micromanager@$PORT${NC}"
  echo -e "${GREEN}✓ Started micromanager@$PORT${NC}"

done

echo -e "${BLUE}Setup complete. Edit environment files in $ENV_DIR to customize.${NC}"
