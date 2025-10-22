#!/bin/bash

# LiquiDB Helper Uninstallation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PLIST_NAME="com.liquidb.helper"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/$PLIST_NAME.plist"

echo -e "${GREEN}LiquiDB Helper Uninstallation${NC}"
echo "=================================="

# Check if service is running
if launchctl list | grep -q "$PLIST_NAME"; then
    echo "Stopping the service..."
    launchctl stop "$PLIST_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ Service stopped${NC}"
else
    echo -e "${YELLOW}Service is not running${NC}"
fi

# Unload the service
echo "Unloading the service..."
launchctl unload "$LAUNCHD_PLIST" 2>/dev/null || true
echo -e "${GREEN}✓ Service unloaded${NC}"

# Remove plist file
if [ -f "$LAUNCHD_PLIST" ]; then
    echo "Removing plist file..."
    rm "$LAUNCHD_PLIST"
    echo -e "${GREEN}✓ Plist file removed${NC}"
else
    echo -e "${YELLOW}Plist file not found${NC}"
fi

# Ask about log files
echo ""
read -p "Do you want to remove log files? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    LOG_DIR="$HOME/Library/Logs/LiquiDB"
    if [ -d "$LOG_DIR" ]; then
        echo "Removing log directory..."
        rm -rf "$LOG_DIR"
        echo -e "${GREEN}✓ Log files removed${NC}"
    else
        echo -e "${YELLOW}Log directory not found${NC}"
    fi
else
    echo -e "${YELLOW}Log files preserved${NC}"
fi

echo ""
echo -e "${GREEN}Uninstallation complete!${NC}"
echo ""
echo "LiquiDB Helper has been removed from your system."
echo "The main LiquiDB app will continue to work normally."
