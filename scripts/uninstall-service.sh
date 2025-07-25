#!/bin/bash

# Micromanager Cloud Service Uninstaller
# Removes the systemd service and cleans up files

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVICE_NAME="micromanager-cloud"
SERVICE_USER="micromanager"
INSTALL_DIR="/opt/micromanager-cloud"
LOG_DIR="/var/log/micromanager"

echo -e "${BLUE}=== Micromanager Cloud Service Uninstaller ===${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root (use sudo)${NC}"
   exit 1
fi

# Confirm uninstall
echo -e "${YELLOW}This will completely remove the micromanager-cloud service and all its files.${NC}"
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstall cancelled.${NC}"
    exit 0
fi

echo -e "${YELLOW}Step 1: Stopping and disabling service...${NC}"
if systemctl is-active --quiet "$SERVICE_NAME"; then
    systemctl stop "$SERVICE_NAME"
    echo -e "${GREEN}✓ Service stopped${NC}"
fi

if systemctl is-enabled --quiet "$SERVICE_NAME"; then
    systemctl disable "$SERVICE_NAME"
    echo -e "${GREEN}✓ Service disabled${NC}"
fi

echo -e "${YELLOW}Step 2: Removing systemd service file...${NC}"
if [[ -f "/etc/systemd/system/$SERVICE_NAME.service" ]]; then
    rm "/etc/systemd/system/$SERVICE_NAME.service"
    systemctl daemon-reload
    echo -e "${GREEN}✓ Service file removed${NC}"
else
    echo -e "${GREEN}✓ Service file not found${NC}"
fi

echo -e "${YELLOW}Step 3: Removing application directory...${NC}"
if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Application directory removed${NC}"
else
    echo -e "${GREEN}✓ Application directory not found${NC}"
fi

echo -e "${YELLOW}Step 4: Removing log directory...${NC}"
if [[ -d "$LOG_DIR" ]]; then
    rm -rf "$LOG_DIR"
    echo -e "${GREEN}✓ Log directory removed${NC}"
else
    echo -e "${GREEN}✓ Log directory not found${NC}"
fi

echo -e "${YELLOW}Step 5: Removing service user...${NC}"
if id "$SERVICE_USER" &>/dev/null; then
    userdel "$SERVICE_USER"
    echo -e "${GREEN}✓ Service user removed${NC}"
else
    echo -e "${GREEN}✓ Service user not found${NC}"
fi

echo
echo -e "${GREEN}=== Uninstall Complete! ===${NC}"
echo -e "${GREEN}The micromanager-cloud service has been completely removed.${NC}"
