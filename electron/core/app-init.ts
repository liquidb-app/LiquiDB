import { app, BrowserWindow } from "electron"
import { log } from "../logger"
import sharedState from "./shared-state"
import storage from "../storage"
import AutoLaunch from "auto-launch"
import { basename } from "path"
import { killAllDatabaseProcesses } from "../database/process-manager"
import { cleanupDatabaseTempFiles } from "../utils/cleanup-utils"
import { createWindow } from "../window/window-manager"

/**
 * Initialize app instance lock handling
 */
export function initializeAppLock(): void {
  // Prevent multiple instances
    const gotTheLock = app.requestSingleInstanceLock()

    if (!gotTheLock) {
      app.quit()
    } else {
      app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window instead.
        const mainWindow = sharedState.getMainWindow()
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.focus()
        }
      })
  }
}

/**
 * Initialize auto-launcher
 * @returns {object|null} - Auto-launcher instance or null
 */
export function initializeAutoLauncher(): AutoLaunch | null {
  // Only initialize auto-launcher in production mode (packaged app)
  // In development mode, process.execPath points to Electron binary in node_modules,
  // which can cause issues when editors open the project (auto-starting the app)
  if (!app.isPackaged) {
    log.debug("Skipping auto-launcher initialization in development mode")
    return null
  }

  try {
    log.debug("App path:", process.execPath)
    log.debug("App name:", basename(process.execPath))
    log.debug("Platform:", process.platform)
    
    // Use the proper app name instead of executable name
    const appName = app.getName() || "LiquiDB"
    log.debug("Using app name:", appName)
    
    // macOS-specific path resolution
    let appPath = process.execPath
    
    // macOS: Use app bundle path if available
    if (process.execPath.includes('.app')) {
      // Extract the app bundle path from the executable path
      const pathParts = process.execPath.split('/')
      const appIndex = pathParts.findIndex(part => part.endsWith('.app'))
      if (appIndex !== -1) {
        appPath = pathParts.slice(0, appIndex + 1).join('/')
        log.debug("Using app bundle path:", appPath)
      }
    }
    
    log.debug("Final app path for auto-launch:", appPath)
    
    const autoLauncher = new AutoLaunch({
      name: appName,
      path: appPath,
      isHidden: true
    })
    log.info("Auto-launch module initialized successfully for platform:", process.platform)
    return autoLauncher
  } catch (error) {
    console.error("[Auto-launch] Failed to initialize auto-launch module:", error)
    return null
  }
}

/**
 * Setup app lifecycle event handlers
 */
export function setupAppLifecycleHandlers(app: Electron.App): void {
  // Window management
  app.on("window-all-closed", async () => {
    // On macOS, when all windows are closed, still kill all database processes
    // This ensures processes are cleaned up even if the app stays running
    console.log("[Window All Closed] All windows closed, killing all database processes...")
    try {
      await killAllDatabaseProcesses(app)
      
      // Clear all PIDs from storage
      const databases = storage.loadDatabases(app)
      let updated = false
      for (const db of databases) {
        if (db.pid !== null) {
          db.status = 'stopped'
          db.pid = null
          updated = true
        }
      }
      if (updated) {
        storage.saveDatabases(app, databases)
        console.log("[Window All Closed] Cleared all PIDs from storage")
      }
    } catch (error) {
      console.error("[Window All Closed] Error killing processes:", error)
    }
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(app)
    }
  })

  // Cleanup on app termination
  // Import file watcher for cleanup
  const { stopDatabaseFileWatcher } = require("../database/file-watcher")
  
  app.on("before-quit", async (event: Electron.Event) => {
    // Check if we're installing an update
    // If so, skip cleanup and allow immediate quit
    if (sharedState.getIsInstallingUpdate()) {
      log.info("[App Quit] Update installation detected, skipping cleanup and allowing immediate quit")
      // Stop file watcher but don't prevent quit
      stopDatabaseFileWatcher()
      // Don't prevent default - allow quit immediately for update installation
      // This is critical for macOS where quitAndInstall needs the app to quit immediately
      return
    }
    
    // Stop file watcher on quit
    stopDatabaseFileWatcher()
    // Prevent default quit behavior until cleanup is done
    event.preventDefault()
    
    log.info("Stopping all databases...")
    
    // Set a timeout to prevent blocking indefinitely (max 5 seconds for cleanup)
    const cleanupTimeout = setTimeout(() => {
      console.warn("[App Quit] Cleanup timeout reached, forcing quit...")
      app.exit(0)
    }, 5000)
    
    try {
      const runningDatabases = sharedState.getRunningDatabases()
      
      // Kill all database processes (from memory and storage) - with timeout
      const killPromise = killAllDatabaseProcesses(app)
      const killTimeout = Promise.race([
        killPromise,
        new Promise((resolve) => setTimeout(() => {
          console.warn("[App Quit] Process kill timeout, continuing with cleanup...")
          resolve(null)
        }, 3000))
      ])
      await killTimeout
      
      // Clean up temporary files (non-blocking, don't wait)
      const tempCleanupPromises: Promise<void>[] = []
      for (const [id] of runningDatabases) {
        tempCleanupPromises.push(
          (async () => {
            try {
              const databases = storage.loadDatabases(app)
              const dbRecord = databases.find((d) => d.id === id)
              if (dbRecord?.containerId) {
                await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
              }
            } catch (error) {
              console.error(`[App Quit] Error cleaning temp files for database ${id}:`, error)
            }
          })()
        )
      }
      // Don't wait for temp cleanup - let it run in background
      Promise.all(tempCleanupPromises).catch(() => {})
      
      runningDatabases.clear()
      
      // Start helper service when main app closes (helper must continue running) - non-blocking
      const helperService = sharedState.getHelperService()
      if (helperService) {
        // Don't wait for helper service start - let it run in background
        helperService.start().catch((error: any) => {
          console.error("[App Quit] Error starting helper service:", error)
        })
      }
      
      // Clear all PIDs from storage when app quits
      try {
        const databases = storage.loadDatabases(app)
        let updated = false
        for (const db of databases) {
          if (db.pid !== null) {
            db.status = 'stopped'
            db.pid = null
            updated = true
          }
        }
        if (updated) {
          storage.saveDatabases(app, databases)
          console.log("[App Quit] Cleared all PIDs from storage")
        }
      } catch (error) {
        console.error("[App Quit] Failed to clear PIDs from storage:", error)
      }
    } catch (error) {
      console.error("[App Quit] Error during cleanup:", error)
    } finally {
      clearTimeout(cleanupTimeout)
      // Now allow the app to quit
      app.exit(0)
    }
  })
}

/**
 * Setup process signal handlers
 */
export function setupProcessSignalHandlers(app: Electron.App): void {
  // Handle app termination
  process.on("SIGINT", async () => {
    console.log("[App Quit] Received SIGINT, stopping all databases...")
    
    // Kill all database processes (from memory and storage)
    await killAllDatabaseProcesses(app)
    
    // Clear all PIDs from storage (skip if app is not available)
    if (app) {
      try {
        const databases = storage.loadDatabases(app)
        let updated = false
        for (const db of databases) {
          if (db.pid !== null) {
            db.status = 'stopped'
            db.pid = null
            updated = true
          }
        }
        if (updated) {
          storage.saveDatabases(app, databases)
          console.log("[App Quit] Cleared all PIDs from storage (SIGINT)")
        }
      } catch (error) {
        console.error("[App Quit] Failed to clear PIDs from storage (SIGINT):", error)
      }
    }
    
    process.exit(0)
  })

  process.on("SIGTERM", async () => {
    console.log("[App Quit] Received SIGTERM, stopping all databases...")
    
    // Kill all database processes (from memory and storage)
    await killAllDatabaseProcesses(app)
    
    // Clear all PIDs from storage (skip if app is not available)
    if (app) {
      try {
        const databases = storage.loadDatabases(app)
        let updated = false
        for (const db of databases) {
          if (db.pid !== null) {
            db.status = 'stopped'
            db.pid = null
            updated = true
          }
        }
        if (updated) {
          storage.saveDatabases(app, databases)
          console.log("[App Quit] Cleared all PIDs from storage (SIGTERM)")
        }
      } catch (error) {
        console.error("[App Quit] Failed to clear PIDs from storage (SIGTERM):", error)
      }
    }
    
    process.exit(0)
  })

  // Handle uncaught exceptions (app crashes)
  process.on("uncaughtException", async (error: Error) => {
    console.error("[App Crash] Uncaught exception:", error)
    
    const runningDatabases = sharedState.getRunningDatabases()
    
    // Handle EAGAIN errors gracefully - don't crash the app
    if ((error as NodeJS.ErrnoException).code === 'EAGAIN' || (error as NodeJS.ErrnoException).errno === -35) {
      console.error("[App Crash] Resource exhaustion (EAGAIN) detected, waiting before cleanup...")
      // Wait a bit to let resources recover
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Try to kill processes with more delays
      try {
        console.log("[App Crash] Attempting to kill database processes with delays...")
        // Kill processes one at a time with delays
        for (const [_id, db] of runningDatabases) {
          try {
            db.process.kill("SIGTERM")
            await new Promise(resolve => setTimeout(resolve, 200))
          } catch (_e) {
            // Ignore individual errors
          }
        }
      } catch (killError) {
        console.error("[App Crash] Error killing processes:", killError)
      }
      
      // Don't re-throw EAGAIN errors - let the app continue
      console.log("[App Crash] EAGAIN error handled, app will continue")
      return
    }
    
    // Kill all database processes before crashing
    try {
      console.log("[App Crash] Killing all database processes before exit...")
      await killAllDatabaseProcesses(app)
    } catch (killError) {
      console.error("[App Crash] Error killing processes:", killError)
    }
    
    // Clear all PIDs from storage (skip if app is not available)
    if (app) {
      try {
        const databases = storage.loadDatabases(app)
        let updated = false
        for (const db of databases) {
          if (db.pid !== null) {
            db.status = 'stopped'
            db.pid = null
            updated = true
          }
        }
        if (updated) {
          storage.saveDatabases(app, databases)
          console.log("[App Crash] Cleared all PIDs from storage")
        }
      } catch (storageError) {
        console.error("[App Crash] Failed to clear PIDs from storage:", storageError)
      }
    }
    
    // Re-throw to allow default crash behavior (except for EAGAIN which we handled above)
    throw error
  })

  // Handle unhandled promise rejections (app crashes)
  process.on("unhandledRejection", async (reason: unknown, _promise: Promise<unknown>) => {
    console.error("[App Crash] Unhandled rejection:", reason)
    
    // Kill all database processes before crashing
    try {
      console.log("[App Crash] Killing all database processes before exit (unhandled rejection)...")
      await killAllDatabaseProcesses(app)
    } catch (killError) {
      console.error("[App Crash] Error killing processes:", killError)
    }
    
    // Clear all PIDs from storage (skip if app is not available)
    if (app) {
      try {
        const databases = storage.loadDatabases(app)
        let updated = false
        for (const db of databases) {
          if (db.pid !== null) {
            db.status = 'stopped'
            db.pid = null
            updated = true
          }
        }
        if (updated) {
          storage.saveDatabases(app, databases)
          console.log("[App Crash] Cleared all PIDs from storage (unhandled rejection)")
        }
      } catch (storageError) {
        console.error("[App Crash] Failed to clear PIDs from storage (unhandled rejection):", storageError)
      }
    }
  })
}

