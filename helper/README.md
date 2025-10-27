# LiquiDB Helper Service

A background monitoring service for LiquiDB that handles two core responsibilities:

1. **Orphaned Process Cleanup** - Detects and removes database processes running without the app's knowledge
2. **Port Conflict Detection** - Identifies port conflicts and suggests alternatives

## Features

- Automatic detection and cleanup of orphaned database processes (mysql, postgres, mongodb, redis)
- Port conflict detection with alternative port suggestions
- Continuous monitoring every 2 minutes
- Auto-start on system boot
- Management controls in the app settings

## Installation

Automatically installed and managed by the main LiquiDB application. No manual installation required.

## Management

Access via **App Settings → Helper Service**:
- Start, Stop, Restart
- Immediate cleanup request
- Uninstall

## API

IPC methods available to the main app:
- `checkPort(port)` - Check if a port is available
- `findPort(startPort, maxAttempts)` - Find next available port
- `requestCleanup()` - Trigger cleanup now
- `getStatus()` - Get service status

## Logs

```
~/Library/Logs/LiquiDB/helper.log
```

## Troubleshooting

**Service not starting**: Check Node.js installation and logs  
**Port conflicts not detected**: Verify service is running and permissions  
**Orphaned processes not cleaned**: Check service status and logs

## Development

- `liquidb-helper.js` - Main monitoring logic
- `ipc-client.js` - IPC communication
- `com.liquidb.helper.plist` - LaunchAgent config