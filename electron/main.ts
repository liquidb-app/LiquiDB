// Use require instead of import to ensure app is available
// This is more reliable when Electron is launched via command line
const { app } = require("electron")

// Suppress harmless GPU-related errors that are common in Electron/Chromium
// These errors don't affect functionality and are known issues with GPU process initialization
try {
  if (app && app.commandLine) {
    app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
    app.commandLine.appendSwitch('disable-gpu-sandbox')
  }
} catch (error) {
  // If app.commandLine is not available, continue without setting switches
  // This can happen in certain Electron initialization scenarios
  console.warn('Could not set command line switches:', error)
}

import sharedState from "./core/shared-state"
import { initializeAppLock, initializeAutoLauncher, setupAppLifecycleHandlers, setupProcessSignalHandlers } from "./core/app-init"
import { handleAppReady, registerDashboardReadyHandler } from "./core/app-lifecycle"
import { registerAppProtocol } from "./window/window-manager"

import { registerAutoLaunchHandlers } from "./ipc/auto-launch-handlers"
import { registerDatabaseHandlers } from "./ipc/database-handlers"
import { registerPortHandlers } from "./ipc/port-handlers"
import { registerVersionHandlers } from "./ipc/version-handlers"
import { registerHelperHandlers } from "./ipc/helper-handlers"
import { registerPermissionsHandlers } from "./ipc/permissions-handlers"
import { registerFileHandlers } from "./ipc/file-handlers"
import { registerSystemHandlers } from "./ipc/system-handlers"
import { registerUpdateHandlers } from "./ipc/update-handlers"
import { initializeGitHubUpdater } from "./github-update"

// Check if app is available before initializing
if (!app) {
  console.error("App object is not available - cannot initialize application")
    process.exit(1)
  }

  initializeAppLock()

  const autoLauncher = initializeAutoLauncher()
  sharedState.setAutoLauncher(autoLauncher)

  setupAppLifecycleHandlers(app)

  setupProcessSignalHandlers(app)

    registerAppProtocol(app)

// Register all IPC handlers
    const { ipcMain } = require("electron")
    
    if (ipcMain) {
      // Register all IPC handlers
      registerAutoLaunchHandlers()
      registerSystemHandlers(app)
      registerDatabaseHandlers(app)
      registerPortHandlers(app)
      registerVersionHandlers()
      registerHelperHandlers(app)
      registerPermissionsHandlers()
      registerFileHandlers(app)
      registerUpdateHandlers()
      
      // Register dashboard-ready handler (needs to be registered separately)
      registerDashboardReadyHandler(app)
}

// Initialize GitHub updater (async, but don't wait for it)
initializeGitHubUpdater().catch((error) => {
  console.warn("Failed to initialize GitHub updater:", error)
})

// Handle app.whenReady() lifecycle
if (app && typeof app.whenReady === 'function') {
  app.whenReady().then(async () => {
    await handleAppReady(app)
  }).catch((error: unknown) => {
    console.error("Error in app.whenReady():", error)
  })
} else {
  console.error("App object is not available - cannot initialize application")
    process.exit(1)
}

