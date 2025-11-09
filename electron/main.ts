import { app } from "electron"

// Suppress harmless GPU-related errors that are common in Electron/Chromium
// These errors don't affect functionality and are known issues with GPU process initialization
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
app.commandLine.appendSwitch('disable-gpu-sandbox')

import sharedState from "./core/shared-state"
import { initializeAppLock, initializeAutoLauncher, setupAppLifecycleHandlers, setupProcessSignalHandlers } from "./core/app-init"
import { handleAppReady, registerDashboardReadyHandler } from "./core/app-lifecycle"
import { registerAppProtocol } from "./window/window-manager"

import { registerAutoLaunchHandlers } from "./ipc/auto-launch-handlers"
import { registerDatabaseHandlers } from "./ipc/database-handlers"
import { registerPortHandlers } from "./ipc/port-handlers"
import { registerVersionHandlers } from "./ipc/version-handlers"
import { registerHelperHandlers } from "./ipc/helper-handlers"
import { registerMCPHandlers } from "./ipc/mcp-handlers"
import { registerPermissionsHandlers } from "./ipc/permissions-handlers"
import { registerFileHandlers } from "./ipc/file-handlers"
import { registerSystemHandlers } from "./ipc/system-handlers"
import { registerUpdateHandlers } from "./ipc/update-handlers"
import { initializeAutoUpdater } from "./auto-update"

initializeAppLock()

const autoLauncher = initializeAutoLauncher()
sharedState.setAutoLauncher(autoLauncher)

setupAppLifecycleHandlers(app)

setupProcessSignalHandlers(app)

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
    registerUpdateHandlers()
    
    // Register dashboard-ready handler (needs to be registered separately)
    registerDashboardReadyHandler(app)
  }
}

// Initialize auto-updater
initializeAutoUpdater()

// Handle app.whenReady() lifecycle
app.whenReady().then(async () => {
  await handleAppReady(app)
})

