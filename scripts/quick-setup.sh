#!/bin/bash

# Quick Setup Script for Micromanager Cloud
# For development and testing (non-systemd)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Micromanager Cloud Quick Setup ===${NC}"
echo

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "Error: package.json not found. Please run this script from the micromanager-cloud root directory."
    exit 1
fi

echo -e "${YELLOW}Step 1: Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"

echo -e "${YELLOW}Step 2: Setting up environment configuration...${NC}"
if [[ ! -f ".env" ]]; then
    cp ".env.example" ".env"
    echo -e "${GREEN}✓ Created .env from .env.example${NC}"
    echo -e "${YELLOW}⚠️  Please edit .env file with your configuration${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo -e "${YELLOW}Step 3: Creating logs directory...${NC}"
mkdir -p logs
echo -e "${GREEN}✓ Created logs directory${NC}"

echo
echo -e "${GREEN}=== Setup Complete! ===${NC}"
echo
echo -e "${BLUE}To run the application:${NC}"
echo -e "• Development: ${YELLOW}npm run dev${NC}"
echo -e "• Production:  ${YELLOW}npm start${NC}"
echo -e "• Test n8n:    ${YELLOW}npm run test${NC}"
echo
echo -e "${BLUE}Configuration:${NC}"
echo -e "• Edit: ${YELLOW}.env${NC}"
echo -e "• Logs: ${YELLOW}logs/micromanager.log${NC}"
echo
echo -e "${YELLOW}⚠️  Don't forget to configure your .env file!${NC}"
