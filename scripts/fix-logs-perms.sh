#!/usr/bin/env bash

# Repairs permissions for transaction-logs directories used by Micromanager
# Covers both historical paths and the current installer path.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVICE_USER="micromanager"

DIRS=(
  "/opt/micromanager-pos/transaction-logs"
  "/opt/micromanager-cloud/transaction-logs"
)

if [[ $EUID -ne 0 ]]; then
  echo -e "${RED}This script must be run as root${NC}"
  exit 1
fi

echo -e "${YELLOW}Repairing transaction-logs permissions...${NC}"
for d in "${DIRS[@]}"; do
  mkdir -p "$d"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$d"
  chmod 755 "$d"
  echo -e "${GREEN}✓ Ensured $d is writable by $SERVICE_USER${NC}"
done

echo -e "${GREEN}All done.${NC}"

