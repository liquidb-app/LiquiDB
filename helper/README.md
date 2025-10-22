# LiquiDB Helper

A background process monitor for LiquiDB that runs independently of the main application to maintain database process health and prevent port conflicts.

## Features

- **Orphaned Process Detection**: Automatically detects and cleans up database processes that are running but not tracked by the main app
- **Port Conflict Resolution**: Identifies and resolves port conflicts between legitimate and orphaned processes
- **Status Synchronization**: Updates database statuses in storage to match actual running processes
- **Continuous Monitoring**: Runs every 5 minutes to maintain system health
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

### Process Monitoring

The helper continuously monitors for database processes by:
1. Scanning for running `mysqld`, `postgres`, `mongod`, and `redis-server` processes
2. Extracting process information (PID, port, command)
3. Cross-referencing with database configurations in storage
4. Identifying orphaned processes (running but not in configs)

### Cleanup Actions

When orphaned processes are detected:
1. Attempts graceful shutdown with `SIGTERM`
2. Waits 2 seconds for process to exit
3. Force kills with `SIGKILL` if still running
4. Logs all actions for audit trail

### Port Conflict Resolution

When port conflicts are detected:
1. Identifies all processes using the same port
2. Determines which processes are legitimate (in database configs)
3. Kills orphaned processes to free up ports
4. Preserves legitimate processes

### Status Synchronization

The helper maintains consistency between:
- Actual running processes
- Database status in storage
- Process PIDs in configuration

## Configuration

### Check Interval

The helper runs every 5 minutes by default. To change this, edit `liquidb-helper.js`:

```javascript
const CONFIG = {
  CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
  // ... other config
}
```

### Logging

Logs are written to:
- Console output (if running manually)
- `~/Library/Logs/LiquiDB/helper.log`

Log levels:
- `INFO` - Normal operations
- `WARN` - Warnings (port conflicts, etc.)
- `ERROR` - Errors and failures

## Troubleshooting

### Service Not Starting

1. Check if Node.js is installed:
   ```bash
   node --version
   ```

2. Check service status:
   ```bash
   ./manage.sh status
   ```

3. View logs for errors:
   ```bash
   ./manage.sh logs
   ```

### Service Not Detecting Processes

1. Verify database processes are running:
   ```bash
   ps aux | grep -E "(mysqld|postgres|mongod|redis-server)"
   ```

2. Check if processes match expected patterns
3. Review logs for detection issues

### Port Conflicts Persist

1. Check for processes using specific ports:
   ```bash
   lsof -i :3306
   ```

2. Verify database configurations are correct
3. Manually kill orphaned processes if needed

## Uninstallation

To remove the LiquiDB Helper:

```bash
./uninstall.sh
```

This will:
- Stop the service
- Remove the launchd plist
- Optionally remove log files
- Clean up the installation

## Integration with Main App

The helper works independently but can be integrated with the main LiquiDB app:

1. **Status Updates**: The helper updates database statuses in the same storage file used by the main app
2. **Process Cleanup**: Prevents the port conflict issues that were causing confusion
3. **Health Monitoring**: Provides continuous monitoring even when the main app is closed

## Security Considerations

- The helper only kills processes that match database patterns
- It cross-references with legitimate database configurations
- All actions are logged for audit purposes
- It runs with user-level permissions (not root)

## Performance Impact

- Minimal CPU usage (runs every 5 minutes)
- Low memory footprint
- Efficient process detection using system tools
- Non-blocking operations
