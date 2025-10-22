#!/bin/bash

# LiquiDB Helper Installation Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.liquidb.helper"
PLIST_FILE="$HELPER_DIR/$PLIST_NAME.plist"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/$PLIST_NAME.plist"
LOG_DIR="$HOME/Library/Logs/LiquiDB"

echo -e "${GREEN}LiquiDB Helper Installation${NC}"
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    echo "Please install Node.js first: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✓ Node.js found: $(node --version)${NC}"

# Create log directory
echo "Creating log directory..."
mkdir -p "$LOG_DIR"
echo -e "${GREEN}✓ Log directory created: $LOG_DIR${NC}"

# Make helper script executable
echo "Making helper script executable..."
chmod +x "$HELPER_DIR/liquidb-helper.js"
echo -e "${GREEN}✓ Helper script is now executable${NC}"

# Update plist with correct paths
echo "Updating plist with correct paths..."
sed -i.bak "s|/Users/alex/Documents/Developer/LiquiDB/helper|$HELPER_DIR|g" "$PLIST_FILE"
sed -i.bak "s|/Users/alex|$HOME|g" "$PLIST_FILE"
rm "$PLIST_FILE.bak"
echo -e "${GREEN}✓ Plist updated with correct paths${NC}"

# Copy plist to LaunchAgents
echo "Installing launchd plist..."
mkdir -p "$LAUNCHD_DIR"
cp "$PLIST_FILE" "$LAUNCHD_PLIST"
echo -e "${GREEN}✓ Plist installed to: $LAUNCHD_PLIST${NC}"

# Load the service
echo "Loading the service..."
launchctl load "$LAUNCHD_PLIST" 2>/dev/null || true
echo -e "${GREEN}✓ Service loaded${NC}"

# Start the service
echo "Starting the service..."
launchctl start "$PLIST_NAME" 2>/dev/null || true
echo -e "${GREEN}✓ Service started${NC}"

echo ""
echo -e "${GREEN}Installation complete!${NC}"
echo ""
echo "LiquiDB Helper is now running as a background service."
echo "It will automatically:"
echo "  • Monitor for orphaned database processes"
echo "  • Clean up processes that should be stopped"
echo "  • Detect and resolve port conflicts"
echo "  • Update database statuses in storage"
echo ""
echo "Logs are available at: $LOG_DIR/helper.log"
echo ""
echo "To manage the service:"
echo "  • Check status: launchctl list | grep $PLIST_NAME"
echo "  • Stop service: launchctl stop $PLIST_NAME"
echo "  • Start service: launchctl start $PLIST_NAME"
echo "  • Uninstall: ./uninstall.sh"
