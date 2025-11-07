import { ipcMain } from "electron"
import { exec } from "child_process"
import { log } from "../logger"
import sharedState from "./shared-state"
import storage from "../storage"
import {
  resetDatabaseStatuses,
  killProcessByPid,
  startDatabaseProcess,
  startDatabaseProcessAsync,
  stopDatabaseProcessGracefully,
} from "../database/process-manager"
import { cleanupOrphanedDatabases, cleanupDatabaseTempFiles } from "../utils/cleanup-utils"
import { autoStartDatabases } from "../database/auto-start"
import { createWindow, registerAppProtocolHandler } from "../window/window-manager"
import HelperServiceManager from "../helper-service"
import PermissionsManager from "../permissions"
import { IDatabase } from "../../types/database"

// MCP server is optional - only load if available
let mcpServerModule: any = null
;(async () => {
  try {
    mcpServerModule = await import("../mcp-server")
  } catch (_error) {
    log.warn("MCP server module not available:", (_error as Error).message)
  }
})()

const getMCPServerModule = async () => {
  if (mcpServerModule) return mcpServerModule
  try {
    mcpServerModule = await import("../mcp-server")
    return mcpServerModule
  } catch (_error) {
    log.warn("MCP server module not available:", (_error as Error).message)
    return null
  }
}

const getMCPServerStatus = () => {
  if (mcpServerModule && mcpServerModule.getMCPServerStatus) {
    return mcpServerModule.getMCPServerStatus()
  }
  return { running: false }
}

const initializeMCPServer = async (...args: any[]) => {
  const mcpModule = await getMCPServerModule()
  if (mcpModule && mcpModule.initializeMCPServer) {
    // @ts-expect-error: initializeMCPServer has a flexible signature provided by MCP server module
    return mcpModule.initializeMCPServer(...args)
  }
  return false
}

/**
 * Handle app.whenReady() lifecycle
 */
export async function handleAppReady(app: Electron.App): Promise<void> {
  log.info("App is ready, initializing...")
  const autoLauncher = sharedState.getAutoLauncher()
  log.debug("Auto-launcher available:", !!autoLauncher)
  
  // Register custom protocol handler for static files (required for assetPrefix: '/')
  // Must be registered before creating window
  // Register for both dev and production builds to support static file testing
  if (!process.argv.includes('--mcp')) {
    registerAppProtocolHandler(app)
  }
  
  // Check if running in MCP mode
  if (process.argv.includes('--mcp')) {
    return await handleMCPMode(app)
  }
  
  // Normal app mode - continue with initialization
  await handleNormalAppMode(app)
}

/**
 * Handle MCP mode initialization
 */
async function handleMCPMode(app: Electron.App): Promise<void> {
  log.info("Running in MCP server mode, starting MCP server...")

  const runningDatabases = sharedState.getRunningDatabases()

  // Create wrapper functions for MCP server
  const startDatabaseFn = async (database: IDatabase) => {
    try {
      // Check if database is already running
      if (runningDatabases.has(database.id)) {
        return { success: false, error: "Database already running" }
      }

      // Start the database using the existing startDatabaseProcess function
      const result = await startDatabaseProcess(database)
      return result
    } catch (error) {
      console.error(`[MCP] Error starting database ${database.id}:`, error)
      return { success: false, error: (error as Error).message }
    }
  }

  const stopDatabaseFn = async (id: string) => {
    try {
      const db = runningDatabases.get(id)
      if (!db) {
        return { success: false, error: "Database not running" }
      }

      // Clean up temporary files when stopping database
      try {
        const databases = storage.loadDatabases(app)
        const dbRecord = databases.find((d) => d.id === id)
        if (dbRecord?.containerId) {
          await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
        }
      } catch (error) {
        console.error(`[MCP] Error cleaning temp files for ${id}:`, error)
      }

      // Stop the database process gracefully
      await stopDatabaseProcessGracefully(db, db.config, app)
      runningDatabases.delete(id)

      // Update database in storage
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex((db) => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = 'stopped'
          databases[dbIndex].pid = null
          databases[dbIndex].lastStarted = undefined // Clear lastStarted to allow fresh start
          storage.saveDatabases(app, databases)
        }
      } catch (error) {
        console.error(`[MCP] Error updating storage for ${id}:`, error)
      }

      return { success: true }
    } catch (error) {
      console.error(`[MCP] Error stopping database ${id}:`, error)
      return { success: false, error: (error as Error).message }
    }
  }

  // Initialize and start the MCP server
  const mcpStarted = await initializeMCPServer(app, startDatabaseFn, stopDatabaseFn)
  if (mcpStarted) {
    log.info("MCP server started successfully in MCP mode")
    // In MCP mode, prevent the app from quitting
    // The stdio transport will keep the process alive as long as stdin is open
    // We need to prevent Electron from auto-quitting when no windows exist
    if (app && typeof app.on === 'function') {
      app.on("window-all-closed", () => {
        // Don't quit in MCP mode - keep the process alive for stdio communication
        // The process will stay alive as long as stdin (stdio transport) is open
      })
    }

    // Prevent app from quitting when all windows are closed
    // The MCP server will keep running via stdio transport
    // The stdio transport connection keeps the Node.js event loop active
    log.info("MCP server is running and ready for connections")
    log.info("Process will stay alive as long as stdio transport is connected")

    // In MCP mode, we don't create windows, so we need to ensure the process stays alive
    // The stdio transport should keep the event loop active, but we'll also
    // prevent the app from quitting explicitly
    if (app && typeof app.on === 'function') {
      app.on('will-quit', (event: Electron.Event) => {
        // In MCP mode, don't quit unless explicitly requested
        // The stdio transport will keep the process alive
        log.info("MCP: App will-quit event received, but keeping process alive for stdio transport")
        event.preventDefault()
      })
    }
  } else {
    log.error("Failed to start MCP server in MCP mode")
    if (app && typeof app.quit === 'function') {
      app.quit()
    }
    process.exit(1)
  }

  // Don't create window or continue with normal app initialization in MCP mode
  // The process will stay alive as long as the stdio transport is connected
  // The stdio transport keeps stdin open, which keeps the Node.js event loop active
}

/**
 * Handle normal app mode initialization
 */
async function handleNormalAppMode(app: Electron.App): Promise<void> {
  // Initialize permissions manager
  const permissionsManager = new PermissionsManager()
  sharedState.setPermissionsManager(permissionsManager)
  
  resetDatabaseStatuses(app)
  
  // Clean up orphaned database directories on startup
  await cleanupOrphanedDatabases(app)
  
  // Clean up orphaned database processes on startup
  try {
    console.log("[App Start] Checking for orphaned database processes...")
    const databases = storage.loadDatabases(app)
    const orphanedPids: Array<{ pid: number, id: string }> = []
    
    for (const db of databases) {
      if (db.pid !== null) {
        // Check if process is actually running
        try {
          await new Promise<void>((resolve) => {
            exec(`ps -p ${db.pid}`, (error) => {
              if (error) {
                // Process doesn't exist, mark as orphaned in storage
                console.log(`[App Start] Process ${db.pid} for database ${db.id} doesn't exist, clearing from storage`)
                db.status = 'stopped'
                db.pid = null
              } else {
                // Process exists but app isn't tracking it - it's orphaned
                console.log(`[App Start] Found orphaned database process ${db.pid} for database ${db.id}, will kill it`)
                orphanedPids.push({ pid: db.pid, id: db.id })
              }
              resolve()
            })
          })
        } catch (_error) {
          // Assume process doesn't exist if check fails
          db.status = 'stopped'
          db.pid = null
        }
      }
    }
    
    // Kill orphaned processes
    if (orphanedPids.length > 0) {
      console.log(`[App Start] Killing ${orphanedPids.length} orphaned database processes...`)
      for (const { pid, id } of orphanedPids) {
        console.log(`[App Start] Killing orphaned process ${pid} for database ${id}`)
        await killProcessByPid(pid, "SIGTERM")
        await new Promise(resolve => setTimeout(resolve, 500))
        // Check if still running and force kill
        try {
          await new Promise<void>((resolve) => {
            exec(`ps -p ${pid}`, (error) => {
              if (!error) {
                // Still running, force kill
                console.log(`[App Start] Process ${pid} still running, force killing with SIGKILL`)
                killProcessByPid(pid, "SIGKILL")
              }
              resolve()
            })
          })
        } catch (_error) {
          // Process already dead
        }
        
        // Update storage
        const dbIndex = databases.findIndex((d) => d.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = 'stopped'
          databases[dbIndex].pid = null
          databases[dbIndex].lastStarted = undefined // Clear lastStarted to allow fresh start
        }
      }
      
      // Save updated database statuses
      storage.saveDatabases(app, databases)
      console.log(`[App Start] Cleaned up ${orphanedPids.length} orphaned processes`)
    }
  } catch (_error) {
    console.error("[App Start] Error cleaning up orphaned processes:", _error)
  }
  
  createWindow(app)
  
  // Check if onboarding is complete before starting background processes
  let onboardingCheckCount = 0
  const maxOnboardingChecks = 30 // Maximum 30 checks (30 seconds)
  
  const checkOnboardingAndStartProcesses = async () => {
    try {
      onboardingCheckCount++
      
      const mainWindow = sharedState.getMainWindow()
      
      // Use IPC handler to check onboarding status (avoids localStorage SecurityError)
      const isOnboardingComplete = await mainWindow?.webContents?.executeJavaScript('(async () => { return window.electron?.isOnboardingComplete ? await window.electron.isOnboardingComplete() : false; })()')
      
      if (isOnboardingComplete) {
        log.info("Onboarding complete, starting background processes...")
        
        // Start helper service after onboarding is complete
        let helperService = sharedState.getHelperService()
        if (!helperService) {
          helperService = new HelperServiceManager(app)
          sharedState.setHelperService(helperService)
        }
        try {
          const isRunning = await helperService.isServiceRunning()
          if (!isRunning) {
            console.log("[Helper] Starting helper service after onboarding completion...")
            await helperService.start()
            console.log("[Helper] Helper service started successfully")
          } else {
            console.log("[Helper] Helper service already running")
          }
        } catch (error) {
          console.log("[Helper] Error starting helper service after onboarding:", (error as Error).message)
        }
        
        // Auto-start databases if not already triggered by dashboard-ready signal
        const autoStartTriggered = sharedState.getAutoStartTriggered()
        if (!autoStartTriggered) {
          console.log("[Auto-start] Triggering auto-start from onboarding check (fallback)")
          sharedState.setAutoStartTriggered(true)
          const runningDatabases = sharedState.getRunningDatabases()
          const { startDatabaseProcessAsync } = await import(
            "../database/process-manager"
          )
          await autoStartDatabases(
            app,
            runningDatabases,
            mainWindow,
            startDatabaseProcessAsync,
          )
        } else {
          console.log("[Auto-start] Auto-start already triggered by dashboard-ready, skipping")
        }
      } else if (onboardingCheckCount < maxOnboardingChecks) {
        // Only log every 5th check to reduce spam
        if (onboardingCheckCount % 5 === 0) {
          log.info(`Onboarding in progress, deferring background processes... (${onboardingCheckCount}/${maxOnboardingChecks})`)
        }
        // Check again in 2 seconds (reduced frequency)
        setTimeout(checkOnboardingAndStartProcesses, 2000)
      } else {
        log.warn("Onboarding check timeout reached, starting background processes anyway...")
        // Note: Helper service will be started by user interaction, not automatically
        
        // Auto-start databases if not already triggered
        const autoStartTriggered = sharedState.getAutoStartTriggered()
        if (!autoStartTriggered && mainWindow && !mainWindow.isDestroyed()) {
          sharedState.setAutoStartTriggered(true)
          const runningDatabases = sharedState.getRunningDatabases()
          const { startDatabaseProcessAsync } = await import(
            "../database/process-manager"
          )
          await autoStartDatabases(
            app,
            runningDatabases,
            mainWindow,
            startDatabaseProcessAsync,
          )
        }
      }
    } catch (error: unknown) {
      log.error("Error checking onboarding status:", (error as Error).message)
      // If we can't check, assume onboarding is complete and start processes
      if (onboardingCheckCount < maxOnboardingChecks) {
        setTimeout(checkOnboardingAndStartProcesses, 2000)
      } else {
        log.info("Starting background processes after error timeout...")
        // Note: Helper service will be started by user interaction, not automatically
        
        const mainWindow = sharedState.getMainWindow()
        // Auto-start databases if not already triggered
        const autoStartTriggered = sharedState.getAutoStartTriggered()
        if (!autoStartTriggered && mainWindow && !mainWindow.isDestroyed()) {
          sharedState.setAutoStartTriggered(true)
          const runningDatabases = sharedState.getRunningDatabases()
          const { startDatabaseProcessAsync } = await import(
            "../database/process-manager"
          )
          await autoStartDatabases(
            app,
            runningDatabases,
            mainWindow,
            startDatabaseProcessAsync,
          )
        }
      }
    }
  }
  
  // Start checking after a short delay to ensure the window is ready
  setTimeout(checkOnboardingAndStartProcesses, 2000)
}

/**
 * Register dashboard-ready handler
 */
export function registerDashboardReadyHandler(app: Electron.App): void {
  if (process.argv.includes('--mcp') || !ipcMain) {
    return
  }

  ipcMain.handle("dashboard-ready", async () => {
    try {
      const mainWindow = sharedState.getMainWindow()
      const runningDatabases = sharedState.getRunningDatabases()
      
      // Initialize MCP server when app is fully loaded
      // Check if MCP server is already running (only if not in --mcp mode)
      if (!process.argv.includes('--mcp')) {
        const mcpStatus = getMCPServerStatus()
        if (!mcpStatus.running) {
          console.log("[MCP] Starting MCP server...")
          
          // Create wrapper functions for MCP server
          const startDatabaseFn = async (database: IDatabase) => {
            try {
              // Check if database is already running
              if (runningDatabases.has(database.id)) {
                return { success: false, error: "Database already running" }
              }
              
              // Start the database using the existing startDatabaseProcess function
              const result = await startDatabaseProcess(database)
              return result
            } catch (error) {
              console.error(`[MCP] Error starting database ${database.id}:`, error)
              return { success: false, error: (error as Error).message }
            }
          }
          
          const stopDatabaseFn = async (id: string) => {
            try {
              const db = runningDatabases.get(id)
              if (!db) {
                return { success: false, error: "Database not running" }
              }
              
              // Clean up temporary files when stopping database
              try {
                const databases = storage.loadDatabases(app)
                const dbRecord = databases.find((d) => d.id === id)
                if (dbRecord?.containerId) {
                  await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
                }
              } catch (error) {
                console.error(`[MCP] Error cleaning temp files for ${id}:`, error)
              }
              
              // Stop the database process
              db.process.kill("SIGTERM")
              runningDatabases.delete(id)
              
              // Update database in storage
              try {
                const databases = storage.loadDatabases(app)
                const dbIndex = databases.findIndex((db) => db.id === id)
                if (dbIndex >= 0) {
                  databases[dbIndex].status = 'stopped'
                  databases[dbIndex].pid = null
                  storage.saveDatabases(app, databases)
                }
              } catch (error) {
                console.error(`[MCP] Error updating storage for ${id}:`, error)
              }
              
              return { success: true }
            } catch (error) {
              console.error(`[MCP] Error stopping database ${id}:`, error)
              return { success: false, error: (error as Error).message }
            }
          }
          
          // Initialize and start the MCP server asynchronously to avoid blocking
          // Defer initialization to ensure app is fully ready and stats are working
          // Use setTimeout to defer until after dashboard is fully loaded
          setTimeout(() => {
            log.info("[MCP] Starting MCP server initialization (deferred)...")
            initializeMCPServer(app, startDatabaseFn, stopDatabaseFn)
              .then((mcpStarted: boolean) => {
                if (mcpStarted) {
                  log.info("[MCP] MCP server started successfully")
                } else {
                  log.warn("[MCP] Failed to start MCP server (non-fatal, app continues)")
                }
              })
              .catch((error: Error) => {
                // Log error but don't crash - app should continue running
                log.error("[MCP] Error starting MCP server (non-fatal):", error)
                log.error("[MCP] Stack trace:", error.stack)
                // Don't throw - let the app continue running
              })
          }, 2000) // Defer by 2 seconds to ensure app is fully ready
        } else {
          console.log("[MCP] MCP server is already running")
        }
      }
      
      const autoStartTriggered = sharedState.getAutoStartTriggered()
      if (autoStartTriggered) {
        console.log("[Auto-start] Auto-start already triggered, ignoring dashboard-ready signal")
        return { success: true, alreadyTriggered: true }
      }
      
      console.log("[Auto-start] Dashboard is ready, checking if auto-start should be triggered...")
      
      // Check if onboarding is complete
      const isOnboardingComplete = await mainWindow?.webContents?.executeJavaScript(
        '(function() { try { const liquidbKey = localStorage.getItem(\'liquidb-onboarding-complete\'); const legacyKey = localStorage.getItem(\'onboarding-complete\'); const result = liquidbKey === \'true\' || legacyKey === \'true\'; console.log("[Auto-start] Onboarding check - liquidb-onboarding-complete:", liquidbKey, "onboarding-complete:", legacyKey, "result:", result); return result; } catch(e) { if (e.name !== "SecurityError") { console.error("[Auto-start] Error checking onboarding:", e); } return false; } })()'
      )
      
      console.log("[Auto-start] Onboarding complete check result:", isOnboardingComplete)
      
      if (isOnboardingComplete) {
        console.log("[Auto-start] Onboarding complete, triggering auto-start immediately...")
        
        // Start helper service if needed
        let helperService = sharedState.getHelperService()
        if (!helperService) {
          helperService = new HelperServiceManager(app)
          sharedState.setHelperService(helperService)
        }
        try {
          const isRunning = await helperService.isServiceRunning()
          if (!isRunning) {
            console.log("[Helper] Starting helper service...")
            await helperService.start()
            console.log("[Helper] Helper service started successfully")
          }
        } catch (error) {
          console.log("[Helper] Error starting helper service:", (error as Error).message)
        }
        
        // Trigger auto-start immediately
        sharedState.setAutoStartTriggered(true)
        await autoStartDatabases(app, runningDatabases, mainWindow, startDatabaseProcessAsync)
        
        return { success: true, triggered: true }
      } else {
        console.log("[Auto-start] Onboarding not complete yet, will wait for completion...")
        return { success: true, triggered: false, reason: "onboarding_not_complete" }
      }
    } catch (error) {
      console.error("[Auto-start] Error handling dashboard-ready:", error)
      return { success: false, error: (error as Error).message }
    }
  })
}

