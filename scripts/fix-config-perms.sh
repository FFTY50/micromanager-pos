#!/bin/bash

# Repair permissions for Micromanager config directory
# Ensures /opt/micromanager-pos/config is writable by the service user

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVICE_USER="micromanager"
CONFIG_DIR="/opt/micromanager-pos/config"

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

echo -e "${YELLOW}Ensuring config directory exists and is writable...${NC}"
mkdir -p "$CONFIG_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$CONFIG_DIR"
chmod 755 "$CONFIG_DIR"

echo -e "${GREEN}✓ Config directory permissions repaired${NC}"
