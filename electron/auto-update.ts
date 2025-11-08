import { autoUpdater, UpdateInfo } from "electron-updater"
import { app, BrowserWindow } from "electron"
import { log } from "./logger"
import sharedState from "./core/shared-state"

let updateCheckInterval: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 1000 * 60 * 60 * 4 // Check every 4 hours
const INITIAL_CHECK_DELAY = 1000 * 60 * 5 // Check 5 minutes after app start

// Configure auto-updater
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// For GitHub releases, electron-updater will automatically detect the configuration
// from package.json build.publish section

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<{ available: boolean; info?: UpdateInfo; error?: string }> {
  try {
    log.info("[Auto-Update] Checking for updates...")
    const result = await autoUpdater.checkForUpdates()
    
    if (result && result.updateInfo) {
      const currentVersion = app.getVersion()
      const latestVersion = result.updateInfo.version
      
      log.info(`[Auto-Update] Current version: ${currentVersion}, Latest version: ${latestVersion}`)
      
      if (latestVersion !== currentVersion) {
        log.info("[Auto-Update] Update available!")
        return { available: true, info: result.updateInfo }
      } else {
        log.info("[Auto-Update] App is up to date")
        return { available: false }
      }
    }
    
    return { available: false }
  } catch (error: any) {
    log.error("[Auto-Update] Error checking for updates:", error.message)
    return { available: false, error: error.message }
  }
}

/**
 * Download update
 */
export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    log.info("[Auto-Update] Downloading update...")
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error: any) {
    log.error("[Auto-Update] Error downloading update:", error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Install update and restart
 */
export function installUpdateAndRestart(): void {
  try {
    log.info("[Auto-Update] Installing update and restarting...")
    autoUpdater.quitAndInstall(false, true)
  } catch (error: any) {
    log.error("[Auto-Update] Error installing update:", error.message)
  }
}

/**
 * Get update download progress
 */
export function getUpdateProgress(): { percent: number; transferred: number; total: number } | null {
  // Progress is handled via events
  return null
}

/**
 * Setup auto-update event listeners
 */
export function setupAutoUpdateListeners(): void {
  autoUpdater.on("checking-for-update", () => {
    log.info("[Auto-Update] Checking for update...")
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-checking")
    }
  })

  autoUpdater.on("update-available", (info: UpdateInfo) => {
    log.info(`[Auto-Update] Update available: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || info.releaseName || "",
      })
    }
  })

  autoUpdater.on("update-not-available", (info: UpdateInfo) => {
    log.info(`[Auto-Update] Update not available. Current version: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-not-available")
    }
  })

  autoUpdater.on("error", (error: Error) => {
    log.error("[Auto-Update] Error:", error.message)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-error", { message: error.message })
    }
  })

  autoUpdater.on("download-progress", (progressObj: { percent: number; transferred: number; total: number }) => {
    log.info(`[Auto-Update] Download progress: ${progressObj.percent}%`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-download-progress", progressObj)
    }
  })

  autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
    log.info(`[Auto-Update] Update downloaded: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      // Store current version before update
      const currentVersion = app.getVersion()
      mainWindow.webContents.executeJavaScript(`
        localStorage.setItem('previous-version', '${currentVersion}');
        localStorage.setItem('app-was-updated', 'true');
      `).catch(() => {
        // Ignore errors
      })
      
      mainWindow.webContents.send("update-downloaded", {
        version: info.version,
        releaseNotes: info.releaseNotes || info.releaseName || "",
      })
    }
  })
}

/**
 * Start periodic update checks
 */
export function startPeriodicUpdateChecks(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
  }

  // Initial check after delay
  setTimeout(() => {
    checkForUpdates()
  }, INITIAL_CHECK_DELAY)

  // Periodic checks
  updateCheckInterval = setInterval(() => {
    checkForUpdates()
  }, CHECK_INTERVAL)

  log.info("[Auto-Update] Periodic update checks started")
}

/**
 * Stop periodic update checks
 */
export function stopPeriodicUpdateChecks(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
    log.info("[Auto-Update] Periodic update checks stopped")
  }
}

/**
 * Initialize auto-updater
 */
export function initializeAutoUpdater(): void {
  if (process.argv.includes('--mcp')) {
    return
  }

  // Only enable auto-update in production
  if (!app.isPackaged) {
    log.debug("[Auto-Update] Skipping auto-update in development mode")
    return
  }

  setupAutoUpdateListeners()
  startPeriodicUpdateChecks()
  
  log.info("[Auto-Update] Auto-updater initialized")
}

