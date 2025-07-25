#!/bin/bash

# Micromanager Cloud Service Installation Script
# This script sets up the micromanager as a systemd service

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVICE_NAME="micromanager-cloud"
SERVICE_USER="micromanager"
INSTALL_DIR="/opt/micromanager-cloud"
LOG_DIR="/var/log/micromanager"

echo -e "${BLUE}=== Micromanager Cloud Service Installer ===${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Get the current directory (where the script is run from)
CURRENT_DIR="$(pwd)"
if [[ ! -f "package.json" ]]; then
    echo -e "${RED}Error: package.json not found. Please run this script from the micromanager-cloud root directory.${NC}"
    exit 1
fi

echo -e "${YELLOW}Step 1: Creating service user...${NC}"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --home-dir "$INSTALL_DIR" --shell /bin/false "$SERVICE_USER"
    echo -e "${GREEN}✓ Created user: $SERVICE_USER${NC}"
else
    echo -e "${GREEN}✓ User $SERVICE_USER already exists${NC}"
fi

echo -e "${YELLOW}Step 2: Creating directories...${NC}"
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
echo -e "${GREEN}✓ Created directories${NC}"

echo -e "${YELLOW}Step 3: Copying application files...${NC}"
# Copy all files except node_modules, logs, and .git
rsync -av --exclude='node_modules' --exclude='logs' --exclude='.git' --exclude='*.log' "$CURRENT_DIR/" "$INSTALL_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
echo -e "${GREEN}✓ Copied application files${NC}"

echo -e "${YELLOW}Step 4: Installing Node.js dependencies...${NC}"
cd "$INSTALL_DIR"
sudo -u "$SERVICE_USER" npm install --production
echo -e "${GREEN}✓ Installed dependencies${NC}"

echo -e "${YELLOW}Step 5: Setting up environment configuration...${NC}"
if [[ ! -f "$INSTALL_DIR/.env" ]]; then
    cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
    chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
    echo -e "${YELLOW}⚠️  Created .env from .env.example - YOU MUST EDIT THIS FILE!${NC}"
    echo -e "${YELLOW}   Edit: $INSTALL_DIR/.env${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo -e "${YELLOW}Step 6: Creating systemd service...${NC}"
cat > "/etc/systemd/system/$SERVICE_NAME.service" << EOF
[Unit]
Description=Micromanager Cloud - POS Data Forwarder
After=network.target
Wants=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Environment
Environment=NODE_ENV=production

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$INSTALL_DIR $LOG_DIR /dev

# Allow access to serial ports
SupplementaryGroups=dialout

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓ Created systemd service${NC}"

echo -e "${YELLOW}Step 7: Adding user to dialout group (for serial port access)...${NC}"
usermod -a -G dialout "$SERVICE_USER"
echo -e "${GREEN}✓ Added $SERVICE_USER to dialout group${NC}"

echo -e "${YELLOW}Step 8: Enabling and starting service...${NC}"
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
echo -e "${GREEN}✓ Service enabled${NC}"

echo
echo -e "${GREEN}=== Installation Complete! ===${NC}"
echo
echo -e "${BLUE}Next steps:${NC}"
echo -e "1. Edit the configuration: ${YELLOW}sudo nano $INSTALL_DIR/.env${NC}"
echo -e "2. Start the service: ${YELLOW}sudo systemctl start $SERVICE_NAME${NC}"
echo -e "3. Check status: ${YELLOW}sudo systemctl status $SERVICE_NAME${NC}"
echo -e "4. View logs: ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
echo
echo -e "${BLUE}Service Management Commands:${NC}"
echo -e "• Start:   ${YELLOW}sudo systemctl start $SERVICE_NAME${NC}"
echo -e "• Stop:    ${YELLOW}sudo systemctl stop $SERVICE_NAME${NC}"
echo -e "• Restart: ${YELLOW}sudo systemctl restart $SERVICE_NAME${NC}"
echo -e "• Status:  ${YELLOW}sudo systemctl status $SERVICE_NAME${NC}"
echo -e "• Logs:    ${YELLOW}sudo journalctl -u $SERVICE_NAME -f${NC}"
echo
echo -e "${YELLOW}⚠️  IMPORTANT: Remember to configure your .env file before starting!${NC}"
