import { ipcMain } from "electron"
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
import { HelperServiceManager } from "../helper-service"
import PermissionsManager from "../permissions"
import { IDatabase } from "../../types/database"
import { startDatabaseFileWatcher, stopDatabaseFileWatcher } from "../database/file-watcher"
import { setupApplicationMenu } from "../menu/menu-setup"


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
    registerAppProtocolHandler(app)
  
  // Normal app mode - continue with initialization
  await handleNormalAppMode(app)
}


/**
 * Handle normal app mode initialization
 */
async function handleNormalAppMode(app: Electron.App): Promise<void> {
  // Initialize permissions manager
  const permissionsManager = new PermissionsManager()
  sharedState.setPermissionsManager(permissionsManager)
  
  // Start automatic permission checking (every 10 seconds)
  permissionsManager.startAutomaticChecking(10000)
  
  // Listen for permission changes and notify renderer
  permissionsManager.on('permission-changed', (data: { permission: string; granted: boolean }) => {
    log.info(`[Permissions] Permission changed: ${data.permission} = ${data.granted}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('permission-changed', data)
    }
  })
  
  resetDatabaseStatuses(app)
  
  // Ensure databases directory exists
  storage.ensureDatabasesDirectory(app)
  
  // Start watching databases.json for changes
  startDatabaseFileWatcher(app)
  
  // Clean up orphaned database directories on startup
  await cleanupOrphanedDatabases(app)
  
  // Clean up orphaned database processes on startup
  // Add a small delay to ensure app is fully ready before checking processes
  // This helps prevent crashes from calling process.kill() too early
  await new Promise(resolve => setTimeout(resolve, 100))
  
  try {
    console.log("[App Start] Checking for orphaned database processes...")
    const databases = storage.loadDatabases(app)
    const orphanedPids: Array<{ pid: number, id: string }> = []
    
    // Helper function to check if a process exists using process.kill(pid, 0)
    // This is safer than using exec() and doesn't require shell commands
    // Added additional validation to prevent SIGSEGV crashes
    const isProcessRunning = (pid: number): boolean => {
      try {
        // Additional validation: PIDs on macOS are typically 1-999999
        // Very large PIDs or invalid values can cause crashes
        if (!Number.isInteger(pid) || pid <= 0 || pid > 999999) {
          console.log(`[App Start] Invalid PID value: ${pid}`)
          return false
        }
        
        // Signal 0 doesn't actually kill the process, it just checks if it exists
        process.kill(pid, 0)
        return true
      } catch (error: any) {
        // ESRCH means process doesn't exist
        if (error.code === 'ESRCH') {
          return false
        }
        // EINVAL means invalid signal (shouldn't happen with signal 0, but handle it)
        if (error.code === 'EINVAL') {
          console.log(`[App Start] Invalid signal for PID ${pid}`)
          return false
        }
        // Other errors (like EPERM) mean process exists but we can't signal it
        // In that case, assume it's running
        return true
      }
    }
    
    for (const db of databases) {
      // Validate PID before using it
      if (db.pid !== null && db.pid !== undefined) {
        const pid = typeof db.pid === 'number' ? db.pid : parseInt(String(db.pid), 10)
        
        // Skip if PID is invalid (more strict validation)
        if (isNaN(pid) || pid <= 0 || !Number.isInteger(pid) || pid > 999999) {
          console.log(`[App Start] Invalid PID ${db.pid} for database ${db.id}, clearing from storage`)
          db.status = 'stopped'
          db.pid = null
          continue
        }
        
        // Check if process is actually running using safer method
        // Wrap in try-catch to prevent crashes from process.kill()
        try {
          const isRunning = isProcessRunning(pid)
          if (!isRunning) {
            // Process doesn't exist, mark as orphaned in storage
            console.log(`[App Start] Process ${pid} for database ${db.id} doesn't exist, clearing from storage`)
            db.status = 'stopped'
            db.pid = null
          } else {
            // Process exists but app isn't tracking it - it's orphaned
            console.log(`[App Start] Found orphaned database process ${pid} for database ${db.id}, will kill it`)
            orphanedPids.push({ pid, id: db.id })
          }
        } catch (error: any) {
          // Catch any errors (including potential crashes) and assume process doesn't exist
          console.log(`[App Start] Error checking process ${pid} for database ${db.id}: ${error.message || error}, clearing from storage`)
          db.status = 'stopped'
          db.pid = null
        }
      }
    }
    
    // Kill orphaned processes
    if (orphanedPids.length > 0) {
      console.log(`[App Start] Killing ${orphanedPids.length} orphaned database processes...`)
      for (const { pid, id } of orphanedPids) {
        try {
          console.log(`[App Start] Killing orphaned process ${pid} for database ${id}`)
          await killProcessByPid(pid, "SIGTERM")
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Check if still running using safer method
          try {
            const stillRunning = isProcessRunning(pid)
            if (stillRunning) {
              // Still running, force kill
              console.log(`[App Start] Process ${pid} still running, force killing with SIGKILL`)
              await killProcessByPid(pid, "SIGKILL")
            }
          } catch (_error) {
            // Process already dead or error checking
            console.log(`[App Start] Error checking if process ${pid} is still running:`, _error)
          }
        } catch (killError) {
          console.error(`[App Start] Error killing orphaned process ${pid} for database ${id}:`, killError)
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
  
  // Setup application menu bar (About, Check for Updates, etc.)
  setupApplicationMenu()
  
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
  if (!ipcMain) {
    return
  }

  ipcMain.handle("dashboard-ready", async () => {
    try {
      const mainWindow = sharedState.getMainWindow()
      const runningDatabases = sharedState.getRunningDatabases()
      
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

