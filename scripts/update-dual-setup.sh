#!/bin/bash

# Update Dual Micromanager Setup Script
# Updates existing micromanager@ systemd template and fixes dependencies
# for the current codebase (index.js entry point, per-instance queue paths)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SERVICE_USER="micromanager"
BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DIR="/etc/micromanager"
SERVICE_TEMPLATE="/etc/systemd/system/micromanager@.service"

echo -e "${BLUE}=== Micromanager Dual Setup Update ===${NC}"

# Root check
if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

# Detect configured ports from existing env files or use defaults
PORTS=()
if [[ -d "$ENV_DIR" ]]; then
  for env_file in "$ENV_DIR"/*.env; do
    if [[ -f "$env_file" ]]; then
      # Skip edge-*.env files (those are for micromanager-edge@)
      if [[ "$(basename "$env_file")" =~ ^edge- ]]; then
        continue
      fi
      # Extract port name from filename (e.g., ttyUSB0.env -> ttyUSB0)
      port_name=$(basename "$env_file" .env)
      PORTS+=("$port_name")
    fi
  done
fi

# If no ports detected, use defaults
if [[ ${#PORTS[@]} -eq 0 ]]; then
  echo -e "${YELLOW}No existing env files found, using defaults: ttyUSB0, ttyUSB1${NC}"
  PORTS=("ttyUSB0" "ttyUSB1")
else
  echo -e "${GREEN}Detected ports: ${PORTS[*]}${NC}"
fi

# Ensure service user exists
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --shell /bin/false "$SERVICE_USER"
  echo -e "${GREEN}✓ Created user: $SERVICE_USER${NC}"
else
  echo -e "${GREEN}✓ User $SERVICE_USER already exists${NC}"
fi

# Backup and update systemd template
if [[ -f "$SERVICE_TEMPLATE" ]]; then
  BACKUP_FILE="${SERVICE_TEMPLATE}.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$SERVICE_TEMPLATE" "$BACKUP_FILE"
  echo -e "${GREEN}✓ Backed up existing template to $BACKUP_FILE${NC}"
fi

echo -e "${YELLOW}Updating systemd template...${NC}"
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
ExecStart=/usr/bin/node app/src/index.js
EnvironmentFile=/etc/micromanager/%i.env
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNITEOF
echo -e "${GREEN}✓ Updated template at $SERVICE_TEMPLATE${NC}"

# Ensure env directory exists
mkdir -p "$ENV_DIR"

# Update env files and create queue directories
for PORT in "${PORTS[@]}"; do
  INST_DIR="/opt/micromanager-$PORT"
  QUEUE_DIR="/var/lib/micromanager/$PORT"
  ENV_FILE="$ENV_DIR/$PORT.env"
  
  echo -e "${YELLOW}Setting up instance for $PORT...${NC}"
  
  # Create instance directory if missing
  mkdir -p "$INST_DIR"
  if [[ ! -L "$INST_DIR/app" ]]; then
    ln -s "$BASE_DIR" "$INST_DIR/app"
    chown -h "$SERVICE_USER:$SERVICE_USER" "$INST_DIR/app"
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INST_DIR"
  
  # Create per-instance queue directory
  mkdir -p "$QUEUE_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$QUEUE_DIR"
  chmod 755 "$QUEUE_DIR"
  echo -e "${GREEN}✓ Created queue directory: $QUEUE_DIR${NC}"
  
  # Calculate per-instance health port (3300 + last digit of port name)
  DEFAULT_HEALTH_PORT="3300"
  if [[ "$PORT" =~ ([0-9]+)$ ]]; then
    LAST_DIGIT="${BASH_REMATCH[1]}"
    DEFAULT_HEALTH_PORT=$((3300 + LAST_DIGIT))
  fi
  
  # Update or create env file
  if [[ -f "$ENV_FILE" ]]; then
    # Check if QUEUE_DB_PATH is already set
    if ! grep -q "^QUEUE_DB_PATH=" "$ENV_FILE"; then
      echo "" >> "$ENV_FILE"
      echo "# Per-instance queue database path" >> "$ENV_FILE"
      echo "QUEUE_DB_PATH=$QUEUE_DIR/queue.db" >> "$ENV_FILE"
      echo -e "${GREEN}✓ Added QUEUE_DB_PATH to $ENV_FILE${NC}"
    else
      # Update existing QUEUE_DB_PATH if it's wrong
      sed -i "s|^QUEUE_DB_PATH=.*|QUEUE_DB_PATH=$QUEUE_DIR/queue.db|" "$ENV_FILE"
      echo -e "${GREEN}✓ Updated QUEUE_DB_PATH in $ENV_FILE${NC}"
    fi
    
    # Check if HEALTH_PORT is already set
    if ! grep -q "^HEALTH_PORT=" "$ENV_FILE"; then
      echo "# Per-instance health server port" >> "$ENV_FILE"
      echo "HEALTH_PORT=$DEFAULT_HEALTH_PORT" >> "$ENV_FILE"
      echo -e "${GREEN}✓ Added HEALTH_PORT=$DEFAULT_HEALTH_PORT to $ENV_FILE${NC}"
    else
      # Update existing HEALTH_PORT if it's the default (3000) or missing
      if grep -q "^HEALTH_PORT=3000" "$ENV_FILE" || ! grep -q "^HEALTH_PORT=" "$ENV_FILE"; then
        sed -i "s|^HEALTH_PORT=.*|HEALTH_PORT=$DEFAULT_HEALTH_PORT|" "$ENV_FILE"
        echo -e "${GREEN}✓ Updated HEALTH_PORT to $DEFAULT_HEALTH_PORT in $ENV_FILE${NC}"
      fi
    fi
    
    chmod 640 "$ENV_FILE"
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
  else
    # Create new env file with defaults
    cat > "$ENV_FILE" <<ENVEOF
SERIAL_PORT=/dev/$PORT
DEVICE_NAME=register-$PORT
QUEUE_DB_PATH=$QUEUE_DIR/queue.db
HEALTH_PORT=$DEFAULT_HEALTH_PORT
ENVEOF
    chmod 640 "$ENV_FILE"
    chown "$SERVICE_USER:$SERVICE_USER" "$ENV_FILE"
    echo -e "${GREEN}✓ Created $ENV_FILE (you may need to add N8N_LINES_URL, N8N_TXNS_URL, etc.)${NC}"
  fi
done

# Fix transaction-logs permissions
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
echo -e "${GREEN}✓ Transaction-logs directories ready${NC}"

# Install/update npm dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
if command -v npm >/dev/null 2>&1; then
  # Ensure service user has a HOME for npm cache
  if [[ ! -d "/home/$SERVICE_USER" ]]; then
    mkdir -p "/home/$SERVICE_USER"
    chown "$SERVICE_USER:$SERVICE_USER" "/home/$SERVICE_USER"
    chmod 750 "/home/$SERVICE_USER"
  fi
  
  # Ensure repo is owned by service user for npm operations
  chown -R "$SERVICE_USER:$SERVICE_USER" "$BASE_DIR"
  
  su -s /bin/bash -c "set -e; export HOME=/home/$SERVICE_USER; cd '$BASE_DIR'; npm install --omit=dev; npm rebuild better-sqlite3 || true" "$SERVICE_USER" \
    && echo -e "${GREEN}✓ Dependencies installed/updated${NC}" \
    || echo -e "${YELLOW}⚠️  Dependency install had issues (check logs)${NC}"
else
  echo -e "${YELLOW}⚠️  npm not found; skipping dependency install${NC}"
fi

# Reload systemd and restart services
echo -e "${YELLOW}Reloading systemd daemon...${NC}"
systemctl daemon-reload
echo -e "${GREEN}✓ Systemd daemon reloaded${NC}"

# Restart services
for PORT in "${PORTS[@]}"; do
  SERVICE_NAME="micromanager@$PORT"
  if systemctl list-units --type=service --all | grep -q "$SERVICE_NAME"; then
    echo -e "${YELLOW}Restarting $SERVICE_NAME...${NC}"
    systemctl restart "$SERVICE_NAME" || systemctl start "$SERVICE_NAME" || true
    sleep 1
    if systemctl is-active --quiet "$SERVICE_NAME"; then
      echo -e "${GREEN}✓ $SERVICE_NAME is running${NC}"
    else
      echo -e "${RED}⚠️  $SERVICE_NAME failed to start. Check logs: journalctl -u $SERVICE_NAME -n 50${NC}"
    fi
  else
    echo -e "${YELLOW}Enabling $SERVICE_NAME...${NC}"
    systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
    systemctl start "$SERVICE_NAME" || true
    echo -e "${GREEN}✓ Enabled and started $SERVICE_NAME${NC}"
  fi
done

echo
echo -e "${BLUE}=== Update Complete ===${NC}"
echo
echo -e "Next steps:"
echo -e "  1. Check service status:"
for PORT in "${PORTS[@]}"; do
  echo -e "     systemctl status micromanager@$PORT"
done
echo -e "  2. View logs:"
for PORT in "${PORTS[@]}"; do
  echo -e "     journalctl -u micromanager@$PORT -f"
done
echo -e "  3. Verify env files are configured:"
for PORT in "${PORTS[@]}"; do
  echo -e "     cat $ENV_DIR/$PORT.env"
done
echo
echo -e "${YELLOW}Note: If services are still failing, check:${NC}"
echo -e "  - Env files have required variables (N8N_LINES_URL, N8N_TXNS_URL, etc.)"
echo -e "  - Serial ports are accessible: ls -l /dev/ttyUSB*"
echo -e "  - Queue directories are writable: ls -ld /var/lib/micromanager/*"

