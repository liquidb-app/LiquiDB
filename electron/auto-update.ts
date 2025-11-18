
// No automatic downloading or installing
let autoUpdaterModule: any = null
let autoUpdater: any = null

async function getAutoUpdater() {
  if (!autoUpdaterModule) {
    try {

      const { app } = require("electron")
      if (!app || typeof app.getVersion !== 'function') {
        return null
      }
      
      autoUpdaterModule = await import("electron-updater")
      autoUpdater = autoUpdaterModule.autoUpdater
    } catch (error) {

      return null
    }
  }
  return autoUpdater
}

import { app, BrowserWindow } from "electron"
import { log } from "./logger"
import sharedState from "./core/shared-state"

let updateCheckInterval: NodeJS.Timeout | null = null
const CHECK_INTERVAL = 1000 * 60 * 5 // Check every 5 minutes
const INITIAL_CHECK_DELAY = 1000 * 60 * 5 // Check 5 minutes after app start

// Configure update checker (only for checking, no downloading/installing)
let autoUpdaterConfigured = false
async function configureAutoUpdater(): Promise<void> {
  if (autoUpdaterConfigured) {
    return
  }
  
  try {
    const updater = await getAutoUpdater()
    if (updater && app && typeof app.getVersion === 'function') {
      const platform = process.platform
      
      // Disable all automatic operations - we only want notifications
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = false
      updater.allowPrerelease = false
      updater.allowDowngrade = false
      
      // Platform-specific configuration
      updater.requestHeaders = {
        'User-Agent': `LiquiDB/${app.getVersion()} (${platform})`
      }
      
      // For macOS unsigned apps
      if (platform === 'darwin') {
        if (typeof (updater as any).allowUnverifiedUpdates !== 'undefined') {
          (updater as any).allowUnverifiedUpdates = true
        }
        if (typeof (updater as any).disableSignatureVerification !== 'undefined') {
          (updater as any).disableSignatureVerification = true
        }
        log.info("[Update-Notification] macOS configuration applied")
      }
      
      autoUpdaterConfigured = true
      log.info(`[Update-Notification] Update checker configured for platform: ${platform}`)
    }
  } catch (error) {

    log.debug("[Update-Notification] Skipping update checker configuration - app not available")
  }
}

// For GitHub releases, electron-updater will automatically detect the configuration
// from package.json build.publish section

/**
 * Check for updates from GitHub releases
 */
export async function checkForUpdates(): Promise<{ available: boolean; info?: any; error?: string }> {
  try {
    const updater = await getAutoUpdater()
    if (!updater) {
      return { available: false, error: "Update checker not available" }
    }
    
    log.info("[Update-Notification] Checking for updates from GitHub releases...")
    const result = await updater.checkForUpdates()
    
    if (result && result.updateInfo) {
      const currentVersion = app.getVersion()
      const latestVersion = result.updateInfo.version
      
      log.info(`[Update-Notification] Current version: ${currentVersion}, Latest version: ${latestVersion}`)
      
      if (latestVersion !== currentVersion) {
        log.info("[Update-Notification] New version available!")
        return { available: true, info: result.updateInfo }
      } else {
        log.info("[Update-Notification] App is up to date")
        return { available: false }
      }
    }
    
    return { available: false }
  } catch (error: any) {
    log.error("[Update-Notification] Error checking for updates:", error.message)
    return { available: false, error: error.message }
  }
}

/**
 * Download update - DISABLED (notifications only)
 */
export async function downloadUpdate(): Promise<{ success: boolean; error?: string }> {
  log.warn("[Update-Notification] Download functionality is disabled. Only notifications are enabled.")
  return { success: false, error: "Download functionality is disabled. Please download updates manually from GitHub releases." }
}

/**
 * Install update and restart - DISABLED (notifications only)
 */
export async function installUpdateAndRestart(): Promise<void> {
  log.warn("[Update-Notification] Install functionality is disabled. Only notifications are enabled.")
  throw new Error("Install functionality is disabled. Please download and install updates manually from GitHub releases.")
}

/**
 * Get update download progress - DISABLED (notifications only)
 */
export function getUpdateProgress(): { percent: number; transferred: number; total: number } | null {
  return null
}

/**
 * Setup update notification event listeners
 */
export async function setupAutoUpdateListeners(): Promise<void> {
  const updater = await getAutoUpdater()
  if (!updater) {
    return
  }
  
  updater.on("checking-for-update", () => {
    log.info("[Update-Notification] Checking for update...")
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-checking")
    }
  })

  updater.on("update-available", (info: any) => {
    log.info(`[Update-Notification] Update available: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-available", {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || info.releaseName || "",
        downloadUrl: info.files?.[0]?.url || `https://github.com/liquidb-app/LiquiDB/releases/tag/v${info.version}`,
      })
    }
  })

  updater.on("update-not-available", (info: any) => {
    log.info(`[Update-Notification] Update not available. Current version: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-not-available")
    }
  })

  updater.on("error", (error: Error) => {
    log.error("[Update-Notification] Error:", error.message)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-error", { message: error.message })
    }
  })

  // Note: We don't listen to download-progress or update-downloaded events
  // since we're not downloading updates automatically
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

  log.info("[Update-Notification] Periodic update checks started")
}

/**
 * Stop periodic update checks
 */
export function stopPeriodicUpdateChecks(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
    log.info("[Update-Notification] Periodic update checks stopped")
  }
}

/**
 * Initialize update notification checker
 */
export async function initializeAutoUpdater(): Promise<void> {

  try {
    if (!app || typeof app.getVersion !== 'function') {
      log.debug("[Update-Notification] Skipping update checker - app not available")
      return
    }

    // Only enable update checking in production
    if (!app.isPackaged) {
      log.debug("[Update-Notification] Skipping update checker in development mode")
      return
    }

    // Configure update checker if not already configured
    await configureAutoUpdater()

    await setupAutoUpdateListeners()
    startPeriodicUpdateChecks()
    
    log.info("[Update-Notification] Update notification checker initialized")
  } catch (error) {

    log.warn("[Update-Notification] Failed to initialize update checker:", error)
  }
}
