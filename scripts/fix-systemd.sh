#!/bin/bash

# Script to repair existing Micromanager systemd units that used the `ptty` typo.
# It searches for unit files containing "ptty" and renames/reloads them with
# the correct "tty" naming.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

echo -e "${YELLOW}Checking for misnamed systemd units...${NC}"

shopt -s nullglob
for file in /etc/systemd/system/micromanager@ptty*.service; do
  corrected="${file/ptty/tty}"
  echo -e "${YELLOW}Fixing ${file} -> ${corrected}${NC}"
  sed -i 's/ptty/tty/g' "$file"
  mv "$file" "$corrected"
  systemctl disable "$(basename "$file" .service)" >/dev/null 2>&1 || true
  systemctl enable "$(basename "$corrected" .service)" >/dev/null 2>&1 || true
  systemctl restart "$(basename "$corrected" .service)" >/dev/null 2>&1 || true
  echo -e "${GREEN}✓ Corrected and restarted $(basename "$corrected")${NC}"

done

systemctl daemon-reload

echo -e "${GREEN}Systemd units updated.${NC}"
