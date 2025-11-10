// Lazy import electron-updater to avoid accessing app before it's available
// electron-updater accesses app during module initialization, so we need to delay the import
let autoUpdaterModule: any = null
let autoUpdater: any = null
let UpdateInfo: any = null

async function getAutoUpdater() {
  if (!autoUpdaterModule) {
    try {
      // Check if app is available before importing electron-updater
      const { app } = require("electron")
      if (!app || typeof app.getVersion !== 'function') {
        return null
      }
      
      autoUpdaterModule = await import("electron-updater")
      autoUpdater = autoUpdaterModule.autoUpdater
      UpdateInfo = autoUpdaterModule.UpdateInfo
    } catch (error) {
      // If import fails or app is not available, return null
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

// Configure auto-updater (only if app is available)
let autoUpdaterConfigured = false
async function configureAutoUpdater(): Promise<void> {
  if (autoUpdaterConfigured) {
    return
  }
  
  try {
    const updater = await getAutoUpdater()
    if (updater && app && typeof app.getVersion === 'function') {
      const platform = process.platform
      
      // Common configuration for all platforms
      updater.autoDownload = false
      updater.autoInstallOnAppQuit = true
      updater.allowPrerelease = false
      updater.allowDowngrade = false
      
      // Platform-specific configuration
      if (platform === 'darwin') {
        // macOS configuration (including unsigned apps)
        // For unsigned macOS apps, we need to disable signature verification
        // This allows updates to work even without code signing
        updater.requestHeaders = {
          'User-Agent': `LiquiDB/${app.getVersion()} (${platform})`
        }
        
        // Disable signature verification for unsigned apps
        // Note: This is safe because we're downloading from GitHub releases
        // and verifying via SHA256 hashes in the update manifest
        updater.disableWebInstaller = false
        
        // For unsigned macOS apps, we need to allow unverified updates
        // This is required for electron-updater to work with unsigned apps
        // The updater will still verify SHA256 hashes from the update manifest
        if (typeof (updater as any).allowUnverifiedUpdates !== 'undefined') {
          (updater as any).allowUnverifiedUpdates = true
        }
        
        // Also try the disableSignatureVerification property if it exists
        if (typeof (updater as any).disableSignatureVerification !== 'undefined') {
          (updater as any).disableSignatureVerification = true
        }
        
        log.info("[Auto-Update] macOS configuration applied (unsigned app support enabled)")
      } else if (platform === 'win32') {
        // Windows configuration
        updater.requestHeaders = {
          'User-Agent': `LiquiDB/${app.getVersion()} (${platform})`
        }
        log.info("[Auto-Update] Windows configuration applied")
      } else if (platform === 'linux') {
        // Linux configuration
        updater.requestHeaders = {
          'User-Agent': `LiquiDB/${app.getVersion()} (${platform})`
        }
        log.info("[Auto-Update] Linux configuration applied")
      }
      
      autoUpdaterConfigured = true
      log.info(`[Auto-Update] Auto-updater configured for platform: ${platform}`)
    }
  } catch (error) {
    // If app is not available, skip configuration
    log.debug("[Auto-Update] Skipping auto-updater configuration - app not available")
  }
}

// For GitHub releases, electron-updater will automatically detect the configuration
// from package.json build.publish section

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<{ available: boolean; info?: any; error?: string }> {
  try {
    const updater = await getAutoUpdater()
    if (!updater) {
      return { available: false, error: "Auto-updater not available" }
    }
    
    log.info("[Auto-Update] Checking for updates...")
    const result = await updater.checkForUpdates()
    
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
    const updater = await getAutoUpdater()
    if (!updater) {
      return { success: false, error: "Auto-updater not available" }
    }
    
    log.info("[Auto-Update] Downloading update...")
    await updater.downloadUpdate()
    return { success: true }
  } catch (error: any) {
    log.error("[Auto-Update] Error downloading update:", error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Install update and restart
 */
export async function installUpdateAndRestart(): Promise<void> {
  try {
    const updater = await getAutoUpdater()
    if (!updater) {
      log.warn("[Auto-Update] Cannot install update - auto-updater not available")
      return
    }
    
    log.info("[Auto-Update] Installing update and restarting...")
    updater.quitAndInstall(false, true)
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
export async function setupAutoUpdateListeners(): Promise<void> {
  const updater = await getAutoUpdater()
  if (!updater) {
    return
  }
  
  updater.on("checking-for-update", () => {
    log.info("[Auto-Update] Checking for update...")
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-checking")
    }
  })

  updater.on("update-available", (info: any) => {
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

  updater.on("update-not-available", (info: any) => {
    log.info(`[Auto-Update] Update not available. Current version: ${info.version}`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-not-available")
    }
  })

  updater.on("error", (error: Error) => {
    log.error("[Auto-Update] Error:", error.message)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-error", { message: error.message })
    }
  })

  updater.on("download-progress", (progressObj: { percent: number; transferred: number; total: number }) => {
    log.info(`[Auto-Update] Download progress: ${progressObj.percent}%`)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send("update-download-progress", progressObj)
    }
  })

  updater.on("update-downloaded", (info: any) => {
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
export async function initializeAutoUpdater(): Promise<void> {
  // Check if app is available before initializing
  try {
    if (!app || typeof app.getVersion !== 'function') {
      log.debug("[Auto-Update] Skipping auto-update - app not available")
      return
    }

    // Only enable auto-update in production
    if (!app.isPackaged) {
      log.debug("[Auto-Update] Skipping auto-update in development mode")
      return
    }

    // Configure auto-updater if not already configured
    await configureAutoUpdater()

    await setupAutoUpdateListeners()
    startPeriodicUpdateChecks()
    
    log.info("[Auto-Update] Auto-updater initialized")
  } catch (error) {
    // If initialization fails, log and continue
    log.warn("[Auto-Update] Failed to initialize auto-updater:", error)
  }
}

