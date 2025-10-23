# LiquiDB Helper Service

A focused background process monitor for LiquiDB that handles two core responsibilities:

1. **Monitor Orphaned Database Processes** - Detects and cleans up database processes that belong to LiquiDB but are running without the app knowing
2. **Monitor Port Conflicts** - Detects when ports are taken by external processes and suggests alternatives

## Features

- **Orphaned Process Detection**: Automatically detects and cleans up database processes that are running but not tracked by the main app
- **Port Conflict Detection**: Identifies when requested ports are occupied by external processes
- **Port Suggestion**: Finds alternative available ports when conflicts are detected
- **Continuous Monitoring**: Runs every 2 minutes to maintain system health
- **Automatic Startup**: Starts automatically when the system boots
- **Comprehensive Logging**: Detailed logs for troubleshooting and monitoring
- **Integrated Management**: Fully integrated into the main LiquiDB app

## Automatic Installation

The helper service is automatically installed and managed by the main LiquiDB application. No manual installation is required.

When you first run LiquiDB, it will:
- Automatically install the helper service
- Start the background monitoring process
- Set up automatic startup on system boot
- Provide management controls in the app settings

## Management

The helper service can be managed through the LiquiDB app settings:

1. Open LiquiDB
2. Go to **App Settings** (gear icon)
3. Click on the **Helper Service** tab
4. Use the controls to start, stop, restart, or uninstall the service

### Available Actions

- **Start**: Start the helper service
- **Stop**: Stop the helper service
- **Restart**: Restart the helper service
- **Cleanup**: Request immediate cleanup of orphaned processes
- **Uninstall**: Remove the helper service completely

## How It Works

### Orphaned Process Monitoring

The helper continuously monitors for database processes by:
1. Scanning for running `mysqld`, `postgres`, `mongod`, and `redis-server` processes
2. Extracting process information (PID, port, command)
3. Cross-referencing with database configurations in storage
4. Identifying processes that don't match any known database configuration
5. Safely terminating orphaned processes

### Port Conflict Detection

The helper monitors port availability by:
1. Checking if requested ports are available
2. Identifying which external processes are using occupied ports
3. Finding alternative available ports when conflicts are detected
4. Providing detailed information about port conflicts to the main app

## API

The helper service provides an IPC interface for the main app to:

- **Check Port Availability**: `checkPort(port)` - Returns whether a port is available
- **Find Available Port**: `findPort(startPort, maxAttempts)` - Finds the next available port
- **Request Cleanup**: `requestCleanup()` - Triggers immediate orphaned process cleanup
- **Get Status**: `getStatus()` - Returns helper service status

## Logs

Helper service logs are available at:
```
~/Library/Logs/LiquiDB/helper.log
```

## Troubleshooting

### Service Not Starting
1. Check if Node.js is installed: `node --version`
2. Check service status: `launchctl list | grep com.liquidb.helper`
3. Check logs: `tail -f ~/Library/Logs/LiquiDB/helper.log`

### Port Conflicts Not Detected
1. Ensure the helper service is running
2. Check if the port is actually in use: `lsof -i :PORT`
3. Verify the helper service has proper permissions

### Orphaned Processes Not Cleaned
1. Check if the helper service is running
2. Verify database configurations are properly stored
3. Check helper service logs for error messages

## Development

The helper service consists of:
- `liquidb-helper.js` - Main helper service with monitoring logic
- `ipc-client.js` - IPC client for communication with main app
- `com.liquidb.helper.plist` - LaunchAgent configuration

The service is automatically installed and managed by the main LiquiDB application.