import { app } from "electron"
import * as https from "https"
import { URL } from "url"
import { log } from "./logger"
import sharedState from "./core/shared-state"
import * as semver from "semver"

const GITHUB_API_URL = "https://api.github.com/repos/liquidb-app/LiquiDB/releases/latest"
const CHECK_INTERVAL = 1000 * 60 * 5 // Check every 5 minutes


let updateCheckInterval: NodeJS.Timeout | null = null
let isChecking = false

interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  draft: boolean
  prerelease: boolean
  published_at: string
  assets: Array<{
    name: string
    browser_download_url: string
    size: number
  }>
}

interface UpdateInfo {
  version: string
  downloadUrl: string
  releaseNotes: string
  releaseDate: string
}

/**
 * Fetch the latest release from GitHub API
 * Only returns published, non-prerelease releases
 */
async function fetchLatestRelease(): Promise<UpdateInfo | null> {
  try {
    log.info("[GitHub Update] Fetching latest release from GitHub...")
    
    const urlObj = new URL(GITHUB_API_URL)
    const release: GitHubRelease = await new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': `LiquiDB/${app.getVersion()}`
        }
      }

      const req = https.request(options, (res) => {
        if (res.statusCode === 404) {
          log.warn("[GitHub Update] No releases found")
          resolve(null as any)
          return
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`GitHub API returned ${res.statusCode}: ${res.statusMessage}`))
          return
        }

        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            resolve(parsed)
          } catch (error) {
            reject(new Error(`Failed to parse GitHub API response: ${error}`))
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.setTimeout(10000, () => {
        req.destroy()
        reject(new Error('Request timeout'))
      })

      req.end()
    })

    if (!release) {
      return null
    }


    if (release.draft || release.prerelease) {
      log.info("[GitHub Update] Latest release is draft or prerelease, skipping")
      return null
    }


    const version = release.tag_name.startsWith('v') 
      ? release.tag_name.substring(1) 
      : release.tag_name


    if (!semver.valid(version)) {
      log.warn(`[GitHub Update] Invalid version format: ${version}`)
      return null
    }


    const releaseUrl = `https://github.com/liquidb-app/LiquiDB/releases/tag/${release.tag_name}`

    return {
      version,
      downloadUrl: releaseUrl,
      releaseNotes: release.body || release.name || "",
      releaseDate: release.published_at
    }
  } catch (error: any) {
    log.error(`[GitHub Update] Error fetching latest release: ${error.message}`)
    return null
  }
}

/**
 * Check if an update is available
 * Compares current version with latest GitHub release using SemVer
 */
export async function checkForUpdate(): Promise<{ available: boolean; info?: UpdateInfo; error?: string }> {
  if (isChecking) {
    log.debug("[GitHub Update] Update check already in progress")
    return { available: false, error: "Check already in progress" }
  }

  try {
    isChecking = true
    const currentVersion = app.getVersion()
    log.info(`[GitHub Update] Checking for updates. Current version: ${currentVersion}`)

    const latestRelease = await fetchLatestRelease()
    
    if (!latestRelease) {
      log.info("[GitHub Update] No update available or error fetching release")
      return { available: false }
    }


    if (semver.gt(latestRelease.version, currentVersion)) {
      log.info(`[GitHub Update] Update available! Current: ${currentVersion}, Latest: ${latestRelease.version}`)
      return { available: true, info: latestRelease }
    } else {
      log.info(`[GitHub Update] App is up to date. Current: ${currentVersion}, Latest: ${latestRelease.version}`)
      return { available: false }
    }
  } catch (error: any) {
    log.error(`[GitHub Update] Error checking for updates: ${error.message}`)
    return { available: false, error: error.message }
  } finally {
    isChecking = false
  }
}

/**
 * Check for updates and notify if available
 * This is the main function called periodically
 */
async function checkAndNotifyForUpdate(): Promise<void> {
  try {
    const result = await checkForUpdate()
    
    if (result.available && result.info) {
      log.info(`[GitHub Update] Update available: ${result.info.version}`)
      

      const mainWindow = sharedState.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("update-available", {
          version: result.info.version,
          releaseDate: result.info.releaseDate,
          releaseNotes: result.info.releaseNotes || "",
          downloadUrl: result.info.downloadUrl
        })
      }
    }
  } catch (error: any) {
    log.error(`[GitHub Update] Error in checkAndNotifyForUpdate: ${error.message}`)
  }
}

/**
 * Start periodic update checks
 * Checks on app start and then every 5 minutes
 */
export function startPeriodicUpdateChecks(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
  }

  // Initial check on app start
  checkAndNotifyForUpdate()

  // Periodic checks every 5 minutes
  updateCheckInterval = setInterval(() => {
    checkAndNotifyForUpdate()
  }, CHECK_INTERVAL)

  log.info("[GitHub Update] Periodic update checks started (every 5 minutes)")
}

/**
 * Stop periodic update checks
 */
export function stopPeriodicUpdateChecks(): void {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
    updateCheckInterval = null
    log.info("[GitHub Update] Periodic update checks stopped")
  }
}

/**
 * Initialize GitHub updater
 * Only runs in production (packaged app)
 */
export async function initializeGitHubUpdater(): Promise<void> {
  try {

    if (!app || typeof app.getVersion !== 'function') {
      log.debug("[GitHub Update] Skipping GitHub updater - app not available")
      return
    }

    // Only enable in production
    if (!app.isPackaged) {
      log.debug("[GitHub Update] Skipping GitHub updater in development mode")
      return
    }

    log.info("[GitHub Update] Initializing GitHub updater")
    startPeriodicUpdateChecks()
  } catch (error: any) {
    log.warn(`[GitHub Update] Failed to initialize GitHub updater: ${error.message}`)
  }
}


