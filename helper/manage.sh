#!/bin/bash

# LiquiDB Helper Management Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PLIST_NAME="com.liquidb.helper"
LAUNCHD_DIR="$HOME/Library/LaunchAgents"
LAUNCHD_PLIST="$LAUNCHD_DIR/$PLIST_NAME.plist"
LOG_FILE="$HOME/Library/Logs/LiquiDB/helper.log"

# Function to show usage
show_usage() {
    echo "LiquiDB Helper Management"
    echo "========================"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  status    - Show service status"
    echo "  start     - Start the service"
    echo "  stop      - Stop the service"
    echo "  restart   - Restart the service"
    echo "  logs      - Show recent logs"
    echo "  tail      - Follow logs in real-time"
    echo "  install   - Install the service"
    echo "  uninstall - Uninstall the service"
    echo ""
}

# Function to check if service exists
service_exists() {
    [ -f "$LAUNCHD_PLIST" ]
}

# Function to check if service is running
service_running() {
    launchctl list | grep -q "$PLIST_NAME"
}

# Function to show status
show_status() {
    echo -e "${BLUE}LiquiDB Helper Status${NC}"
    echo "====================="
    
    if service_exists; then
        echo -e "${GREEN}✓ Service is installed${NC}"
    else
        echo -e "${RED}✗ Service is not installed${NC}"
        return 1
    fi
    
    if service_running; then
        echo -e "${GREEN}✓ Service is running${NC}"
        
        # Show process info
        if pgrep -f "liquidb-helper.js" > /dev/null; then
            PID=$(pgrep -f "liquidb-helper.js")
            echo "  PID: $PID"
        fi
    else
        echo -e "${YELLOW}⚠ Service is not running${NC}"
    fi
    
    if [ -f "$LOG_FILE" ]; then
        echo -e "${GREEN}✓ Log file exists${NC}"
        echo "  Location: $LOG_FILE"
        echo "  Size: $(du -h "$LOG_FILE" | cut -f1)"
    else
        echo -e "${YELLOW}⚠ Log file not found${NC}"
    fi
}

# Function to start service
start_service() {
    if ! service_exists; then
        echo -e "${RED}Error: Service is not installed${NC}"
        echo "Run: $0 install"
        exit 1
    fi
    
    if service_running; then
        echo -e "${YELLOW}Service is already running${NC}"
        return 0
    fi
    
    echo "Starting service..."
    launchctl start "$PLIST_NAME"
    sleep 2
    
    if service_running; then
        echo -e "${GREEN}✓ Service started successfully${NC}"
    else
        echo -e "${RED}✗ Failed to start service${NC}"
        echo "Check logs: $0 logs"
        exit 1
    fi
}

# Function to stop service
stop_service() {
    if ! service_exists; then
        echo -e "${RED}Error: Service is not installed${NC}"
        exit 1
    fi
    
    if ! service_running; then
        echo -e "${YELLOW}Service is not running${NC}"
        return 0
    fi
    
    echo "Stopping service..."
    launchctl stop "$PLIST_NAME"
    sleep 2
    
    if ! service_running; then
        echo -e "${GREEN}✓ Service stopped successfully${NC}"
    else
        echo -e "${RED}✗ Failed to stop service${NC}"
        exit 1
    fi
}

# Function to restart service
restart_service() {
    echo "Restarting service..."
    stop_service
    start_service
}

# Function to show logs
show_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${RED}Log file not found: $LOG_FILE${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Recent logs (last 50 lines):${NC}"
    echo "================================"
    tail -50 "$LOG_FILE"
}

# Function to follow logs
follow_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${RED}Log file not found: $LOG_FILE${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}Following logs (Ctrl+C to stop):${NC}"
    echo "====================================="
    tail -f "$LOG_FILE"
}

# Function to install service
install_service() {
    if service_exists; then
        echo -e "${YELLOW}Service is already installed${NC}"
        read -p "Do you want to reinstall? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Installation cancelled"
            exit 0
        fi
        stop_service
    fi
    
    echo "Installing service..."
    ./install.sh
}

# Function to uninstall service
uninstall_service() {
    if ! service_exists; then
        echo -e "${YELLOW}Service is not installed${NC}"
        exit 0
    fi
    
    read -p "Are you sure you want to uninstall? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Uninstallation cancelled"
        exit 0
    fi
    
    echo "Uninstalling service..."
    ./uninstall.sh
}

# Main script logic
case "${1:-}" in
    status)
        show_status
        ;;
    start)
        start_service
        ;;
    stop)
        stop_service
        ;;
    restart)
        restart_service
        ;;
    logs)
        show_logs
        ;;
    tail)
        follow_logs
        ;;
    install)
        install_service
        ;;
    uninstall)
        uninstall_service
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
