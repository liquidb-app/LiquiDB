import { app } from "electron"

// Import core modules
import sharedState from "./core/shared-state"
import { initializeAppLock, initializeAutoLauncher, setupAppLifecycleHandlers, setupProcessSignalHandlers } from "./core/app-init"
import { handleAppReady, registerDashboardReadyHandler } from "./core/app-lifecycle"
import { registerAppProtocol } from "./window/window-manager"

// Import IPC handlers
import { registerAutoLaunchHandlers } from "./ipc/auto-launch-handlers"
import { registerDatabaseHandlers } from "./ipc/database-handlers"
import { registerPortHandlers } from "./ipc/port-handlers"
import { registerVersionHandlers } from "./ipc/version-handlers"
import { registerHelperHandlers } from "./ipc/helper-handlers"
import { registerMCPHandlers } from "./ipc/mcp-handlers"
import { registerPermissionsHandlers } from "./ipc/permissions-handlers"
import { registerFileHandlers } from "./ipc/file-handlers"
import { registerSystemHandlers } from "./ipc/system-handlers"

// Initialize app instance lock handling
initializeAppLock()

// Initialize auto-launcher
const autoLauncher = initializeAutoLauncher()
sharedState.setAutoLauncher(autoLauncher)

// Setup app lifecycle event handlers
setupAppLifecycleHandlers(app)

// Setup process signal handlers
setupProcessSignalHandlers(app)

// Register custom protocol scheme BEFORE app is ready (required for registerSchemesAsPrivileged)
if (!process.argv.includes('--mcp')) {
  registerAppProtocol(app)
}

// Register all IPC handlers (skip in MCP mode)
if (!process.argv.includes('--mcp')) {
  const { ipcMain } = require("electron")
  
  if (ipcMain) {
    // Register all IPC handlers
    registerAutoLaunchHandlers()
    registerSystemHandlers(app)
    registerDatabaseHandlers(app)
    registerPortHandlers(app)
    registerVersionHandlers()
    registerHelperHandlers(app)
    registerMCPHandlers()
    registerPermissionsHandlers()
    registerFileHandlers(app)
    
    // Register dashboard-ready handler (needs to be registered separately)
    registerDashboardReadyHandler(app)
  }
}

// Handle app.whenReady() lifecycle
app.whenReady().then(async () => {
  await handleAppReady(app)
})

