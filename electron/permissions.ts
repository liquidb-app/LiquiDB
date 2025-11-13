/**
 * LiquiDB Permissions Manager
 * 
 * macOS permission checking and requesting
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { systemPreferences, safeStorage, app, BrowserWindow } from 'electron'
import { EventEmitter } from 'events'
import sharedState from './core/shared-state'
import { log } from './logger'

const execAsync = promisify(exec)

const PLATFORM = process.platform
const IS_MAC = PLATFORM === 'darwin'

interface PermissionsState {
  accessibility: boolean
  fullDiskAccess: boolean
  networkAccess: boolean
  fileAccess: boolean
  launchAgent: boolean
  keychainAccess: boolean
}

interface PermissionDescription {
  name: string
  description: string
  why: string
  icon: string
  critical: boolean
}

interface PermissionResult {
  permission: string
  granted: boolean
  error: string | null
}

interface CheckAllPermissionsResult {
  permissions: PermissionsState
  allGranted: boolean
  results: PermissionResult[]
}

interface RequestCriticalPermissionsResult {
  permissions: PermissionsState
  allGranted: boolean
  results: PermissionResult[]
}

// Permission check cache with TTL
interface PermissionCache {
  [key: string]: { value: boolean; timestamp: number }
}

class PermissionsManager extends EventEmitter {
  private permissions: PermissionsState
  private cache: PermissionCache = {}
  private cacheTTL = 5000 // 5 seconds cache TTL
  private checkInterval: NodeJS.Timeout | null = null
  private lastCheckTime = 0
  private checkDebounceMs = 2000 // Minimum 2 seconds between checks
  private isChecking = false
  private checkQueue: Array<() => Promise<void>> = []
  private focusTimeout: NodeJS.Timeout | null = null
  private activateTimeout: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.permissions = {
      accessibility: false,
      fullDiskAccess: false,
      networkAccess: false,
      fileAccess: false,
      launchAgent: false,
      keychainAccess: false
    }
  }

  /**
   * Start automatic permission checking
   */
  startAutomaticChecking(intervalMs: number = 10000): void {
    if (this.checkInterval) {
      this.stopAutomaticChecking()
    }

    log.info(`[Permissions] Starting automatic checking every ${intervalMs}ms`)
    
    // Initial check
    this.checkAllPermissions().catch(err => {
      log.error('[Permissions] Initial check failed:', err)
    })

    // Set up polling
    this.checkInterval = setInterval(() => {
      this.checkAllPermissions().catch(err => {
        log.error('[Permissions] Periodic check failed:', err)
      })
    }, intervalMs)

    // Set up window focus listener
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      mainWindow.on('focus', () => {
        // Debounce focus checks to prevent rapid re-checking
        if (this.focusTimeout) {
          clearTimeout(this.focusTimeout)
        }
        this.focusTimeout = setTimeout(() => {
          log.debug('[Permissions] Window focused, re-checking permissions')
          // Don't force check on focus - use normal check which preserves state on error
          this.checkAllPermissions(false).catch(err => {
            log.error('[Permissions] Focus check failed:', err)
          })
        }, 500) // Wait 500ms after focus before checking
      })
    }

    // Set up app focus listener (macOS)
    if (IS_MAC && app) {
      app.on('activate', () => {
        // Debounce activate checks to prevent rapid re-checking
        if (this.activateTimeout) {
          clearTimeout(this.activateTimeout)
        }
        this.activateTimeout = setTimeout(() => {
          log.debug('[Permissions] App activated, re-checking permissions')
          // Don't force check on activate - use normal check which preserves state on error
          this.checkAllPermissions(false).catch(err => {
            log.error('[Permissions] Activate check failed:', err)
          })
        }, 500) // Wait 500ms after activate before checking
      })
    }
  }

  /**
   * Stop automatic permission checking
   */
  stopAutomaticChecking(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    if (this.focusTimeout) {
      clearTimeout(this.focusTimeout)
      this.focusTimeout = null
    }
    if (this.activateTimeout) {
      clearTimeout(this.activateTimeout)
      this.activateTimeout = null
    }
    log.info('[Permissions] Stopped automatic checking')
  }

  /**
   * Get cached permission value or check fresh
   */
  private async getCachedOrCheck(
    permissionKey: string,
    checkFn: () => Promise<boolean>
  ): Promise<boolean> {
    // Don't cache accessibility permission - always check fresh
    // This is critical for production where permissions can change
    if (permissionKey === 'accessibility') {
      return await checkFn()
    }
    
    const cached = this.cache[permissionKey]
    const now = Date.now()

    if (cached && (now - cached.timestamp) < this.cacheTTL) {
      log.debug(`[Permissions] Using cached value for ${permissionKey}: ${cached.value}`)
      return cached.value
    }

    try {
      const value = await checkFn()
      this.cache[permissionKey] = { value, timestamp: now }
      return value
    } catch (error: any) {
      log.error(`[Permissions] Check failed for ${permissionKey}:`, error)
      // Return cached value if available, otherwise false
      return cached?.value ?? false
    }
  }

  /**
   * Invalidate cache for a specific permission or all permissions
   */
  private invalidateCache(permissionKey?: string): void {
    if (permissionKey) {
      delete this.cache[permissionKey]
    } else {
      this.cache = {}
    }
  }

  /**
   * Queue a permission check to prevent race conditions
   */
  private async queueCheck(checkFn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.checkQueue.push(async () => {
        try {
          await checkFn()
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      this.processCheckQueue()
    })
  }

  /**
   * Process queued permission checks
   */
  private async processCheckQueue(): Promise<void> {
    if (this.isChecking || this.checkQueue.length === 0) {
      return
    }

    this.isChecking = true
    const check = this.checkQueue.shift()
    if (check) {
      try {
        await check()
      } catch (error) {
        log.error('[Permissions] Queued check failed:', error)
      }
    }
    this.isChecking = false

    // Process next item in queue
    if (this.checkQueue.length > 0) {
      setImmediate(() => this.processCheckQueue())
    }
  }

  // ==================== macOS Permission Checks ====================

  private async checkAccessibilityPermissionMac(): Promise<boolean> {
    try {
      if (!IS_MAC) return false
      
      // Method 1: Use Electron's built-in check
      try {
        const electronCheck = systemPreferences.isTrustedAccessibilityClient(false)
        if (electronCheck) {
          log.debug('[Permissions] Accessibility granted (Electron check)')
          return true
        }
      } catch (e: any) {
        log.warn('[Permissions] Electron accessibility check failed:', e.message)
      }
      
      // Method 2: Check TCC database directly (most reliable for production)
      try {
        // Get app name and construct possible bundle IDs
        const appName = app.getName()
        // Try to get bundle ID from process or construct common variants
        const bundleIdVariants = [
          appName,
          `${appName}.app`,
          `com.electron.${appName.toLowerCase()}`,
          `com.electron.${appName.toLowerCase()}.app`,
          `com.electron`,
          `com.electron.app`
        ]
        
        // Try multiple TCC database locations
        const tccPaths = [
          `${os.homedir()}/Library/Application Support/com.apple.TCC/TCC.db`,
          `/Library/Application Support/com.apple.TCC/TCC.db`
        ]
        
        for (const tccPath of tccPaths) {
          try {
            // Check if database exists and is accessible
            await fs.promises.access(tccPath, fs.constants.R_OK)
            
            // Query TCC database for accessibility permission
            // Try all bundle ID variants
            for (const variant of bundleIdVariants) {
              try {
                const { stdout } = await execAsync(
                  `sqlite3 "${tccPath}" "SELECT allowed FROM access WHERE service='kTCCServiceAccessibility' AND client LIKE '%${variant}%' LIMIT 1" 2>&1`
                ) as { stdout: string }
                
                if (stdout && stdout.trim() === '1') {
                  log.debug(`[Permissions] Accessibility granted (TCC database check: ${variant})`)
                  return true
                }
              } catch (e: any) {
                // Continue to next variant
              }
            }
            
            // Also try a broader query to find any Electron app with accessibility
            try {
              const { stdout } = await execAsync(
                `sqlite3 "${tccPath}" "SELECT allowed FROM access WHERE service='kTCCServiceAccessibility' AND (client LIKE '%electron%' OR client LIKE '%${appName}%') LIMIT 1" 2>&1`
              ) as { stdout: string }
              
              if (stdout && stdout.trim() === '1') {
                log.debug('[Permissions] Accessibility granted (TCC database check: electron app)')
                return true
              }
            } catch (e: any) {
              // Continue
            }
          } catch (e: any) {
            // Continue to next path
          }
        }
      } catch (e: any) {
        log.warn('[Permissions] TCC database check failed:', e.message)
      }
      
      // Method 3: Try to actually use accessibility API (most reliable - this is the gold standard)
      try {
        // Try to use System Events to list processes - if this works, permission is definitely granted
        const { stdout, stderr } = await execAsync(
          `osascript -e 'tell application "System Events" to get name of every process' 2>&1`
        ) as { stdout: string, stderr: string }
        
        // Check for success indicators
        const hasProcesses = stdout && stdout.trim().length > 0
        const noErrors = !stdout.includes('not allowed') && 
                         !stdout.includes('denied') && 
                         !stdout.includes('error') &&
                         !stderr.includes('not allowed') &&
                         !stderr.includes('denied')
        
        if (hasProcesses && noErrors) {
          log.debug('[Permissions] Accessibility granted (System Events check - most reliable)')
          return true
        }
      } catch (e: any) {
        // If osascript fails with specific error, log it
        const errorMsg = e.message || String(e)
        if (!errorMsg.includes('not allowed') && !errorMsg.includes('denied')) {
          log.warn('[Permissions] System Events check failed:', errorMsg)
        }
      }
      
      // Method 4: Check via ps command (if we can list processes, we likely have accessibility)
      // Note: This is less reliable but can work as a fallback
      try {
        const { stdout, stderr } = await execAsync('ps aux | head -5 2>&1') as { stdout: string, stderr: string }
        const hasOutput = stdout && stdout.trim().length > 0
        const hasPid = stdout.includes('PID') || stdout.includes('USER')
        const noErrors = !stdout.includes('denied') && !stderr.includes('denied')
        
        if (hasOutput && hasPid && noErrors) {
          log.debug('[Permissions] Accessibility granted (ps command check - fallback)')
          return true
        }
      } catch (e: any) {
        log.warn('[Permissions] ps command check failed:', e.message)
      }
      
      log.debug('[Permissions] All accessibility checks failed - permission not granted')
      return false
    } catch (e: any) {
      log.error('[Permissions] macOS accessibility check failed:', e.message)
      return false
    }
  }

  private async checkFullDiskAccessPermissionMac(): Promise<boolean> {
    try {
      if (!IS_MAC) return false
      // Try to access a system file that requires full disk access
      const { stdout, stderr } = await execAsync('ls /var/log/system.log 2>&1') as { stdout: string, stderr: string }
      return !!(stdout && !stderr && stdout.includes('system.log'))
    } catch (e: any) {
      return false
    }
  }

  private async checkLaunchAgentPermissionMac(): Promise<boolean> {
    try {
      if (!IS_MAC) return false
      const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
      await fs.promises.access(launchAgentsDir, fs.constants.R_OK | fs.constants.W_OK)
      
      const testPlist = path.join(launchAgentsDir, 'com.liquidb.test.plist')
      const testContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.liquidb.test</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/echo</string>
        <string>test</string>
    </array>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>`
      
      await fs.promises.writeFile(testPlist, testContent)
      const content = await fs.promises.readFile(testPlist, 'utf8')
      await fs.promises.unlink(testPlist)
      
      return content.includes('com.liquidb.test')
    } catch (error: any) {
      return false
    }
  }

  private async checkKeychainAccessPermissionMac(): Promise<boolean> {
    try {
      if (!IS_MAC) return false
      return safeStorage.isEncryptionAvailable()
    } catch (e: any) {
      log.error('[Permissions] macOS keychain check failed:', e.message)
      return false
    }
  }

  // ==================== Unified Permission Checks ====================

  async checkAccessibilityPermission(): Promise<boolean> {
    // Don't use cache for accessibility - always check fresh
    // Cache can cause issues in production where permissions change
    const result = await this.checkAccessibilityPermissionMac()
    this.permissions.accessibility = result
    // Invalidate cache to force fresh check next time
    this.invalidateCache('accessibility')
    log.debug(`[Permissions] Accessibility check result: ${result}`)
    return result
  }

  async checkFullDiskAccessPermission(): Promise<boolean> {
    const result = await this.getCachedOrCheck('fullDiskAccess', () => this.checkFullDiskAccessPermissionMac())
    this.permissions.fullDiskAccess = result
    return result
  }

  async checkNetworkAccessPermission(): Promise<boolean> {
    // macOS: Network access is automatically granted
    this.permissions.networkAccess = true
    return true
  }

  async checkFileAccessPermission(): Promise<boolean> {
    try {
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      await fs.promises.mkdir(testDir, { recursive: true })
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      const content = await fs.promises.readFile(testFile, 'utf8')
      await fs.promises.unlink(testFile)
      const result = content === 'test'
      this.permissions.fileAccess = result
      return result
    } catch (error: any) {
      this.permissions.fileAccess = false
      return false
    }
  }

  async checkLaunchAgentPermission(): Promise<boolean> {
    const result = await this.getCachedOrCheck('launchAgent', () => this.checkLaunchAgentPermissionMac())
    this.permissions.launchAgent = result
    return result
  }

  async checkKeychainAccessPermission(): Promise<boolean> {
    const result = await this.getCachedOrCheck('keychainAccess', () => this.checkKeychainAccessPermissionMac())
    this.permissions.keychainAccess = result
    return result
  }

  // ==================== Permission Requests ====================

  async requestAccessibilityPermission(): Promise<boolean> {
    try {
      log.info('[Permissions] Requesting macOS accessibility permission...')
      // Request permission (this shows the system dialog)
      systemPreferences.isTrustedAccessibilityClient(true)
      
      // Wait for user to respond to dialog
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Invalidate cache and force re-check
      this.invalidateCache('accessibility')
      
      // Check multiple times with delays to catch permission grant
      // Use longer delays and more attempts for production
      let granted = false
      for (let i = 0; i < 10; i++) {
        // Use the direct check method (bypasses cache)
        granted = await this.checkAccessibilityPermissionMac()
        if (granted) {
          this.permissions.accessibility = true
          this.emit('permission-changed', { permission: 'accessibility', granted: true })
          log.info('[Permissions] Accessibility permission granted')
          break
        }
        // Wait longer between checks (2 seconds)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
      if (!granted) {
        log.warn('[Permissions] Accessibility permission not granted after request')
      }
      return granted
    } catch (e: any) {
      log.error('[Permissions] macOS accessibility request failed:', e.message)
      return false
    }
  }

  async requestFullDiskAccessPermission(): Promise<boolean> {
    try {
      log.info('[Permissions] Requesting macOS full disk access permission...')
      // Try to access system logs to trigger permission dialog
      await execAsync('ls /var/log/system.log 2>&1').catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 3000))
      this.invalidateCache('fullDiskAccess')
      const granted = await this.checkFullDiskAccessPermission()
      if (granted) {
        this.emit('permission-changed', { permission: 'fullDiskAccess', granted: true })
      }
      return granted
    } catch (e: any) {
      log.error('[Permissions] macOS full disk access request failed:', e.message)
      return false
    }
  }

  async requestNetworkAccessPermission(): Promise<boolean> {
    // Network access is generally automatic, but we verify
    this.invalidateCache('networkAccess')
    const granted = await this.checkNetworkAccessPermission()
    if (granted) {
      this.emit('permission-changed', { permission: 'networkAccess', granted: true })
    }
    return granted
  }

  async requestFileAccessPermission(): Promise<boolean> {
    try {
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      await fs.promises.mkdir(testDir, { recursive: true })
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      await fs.promises.unlink(testFile)
      
      // Invalidate cache and force re-check
      this.invalidateCache('fileAccess')
      
      // Check multiple times to ensure permission is detected
      let granted = false
      for (let i = 0; i < 3; i++) {
        granted = await this.checkFileAccessPermission()
        if (granted) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      if (granted) {
        this.emit('permission-changed', { permission: 'fileAccess', granted: true })
        log.info('[Permissions] File access permission granted')
      } else {
        log.warn('[Permissions] File access permission not granted')
      }
      return granted
    } catch (error: any) {
      log.error('[Permissions] File access request failed:', error)
      return false
    }
  }

  async requestKeychainAccessPermission(): Promise<boolean> {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const testData = 'LiquiDB test data'
        safeStorage.encryptString(testData)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
      this.invalidateCache('keychainAccess')
      const granted = await this.checkKeychainAccessPermission()
      if (granted) {
        this.emit('permission-changed', { permission: 'keychainAccess', granted: true })
      }
      return granted
    } catch (error: any) {
      log.error('[Permissions] Keychain access request failed:', error.message)
      return false
    }
  }

  // ==================== Main Permission Checking ====================

  async checkAllPermissions(force: boolean = false): Promise<CheckAllPermissionsResult> {
    const now = Date.now()
    if (!force && now - this.lastCheckTime < this.checkDebounceMs) {
      // Return cached results if check was recent
      return {
        permissions: this.permissions,
        allGranted: Object.values(this.permissions).every(v => v),
        results: Object.keys(this.permissions).map(key => ({
          permission: key,
          granted: this.permissions[key as keyof PermissionsState],
          error: null
        }))
      }
    }

    this.lastCheckTime = now

    // Save previous permissions state (don't reset yet!)
    const previousPermissions = { ...this.permissions }

    // Invalidate cache when force checking
    if (force) {
      this.invalidateCache()
    }

    // Check all permissions in parallel with timeout
    const checkWithTimeout = async (fn: () => Promise<boolean>, timeout: number = 5000): Promise<boolean> => {
      try {
        return await Promise.race([
          fn(),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeout))
        ])
      } catch (error: any) {
        log.error('[Permissions] Check timeout or error:', error)
        // Return false on error, but don't reset existing state
        return false
      }
    }

    const results = await Promise.allSettled([
      checkWithTimeout(() => this.checkAccessibilityPermission(), 5000),
      checkWithTimeout(() => this.checkFullDiskAccessPermission(), 5000),
      checkWithTimeout(() => this.checkNetworkAccessPermission(), 5000),
      checkWithTimeout(() => this.checkFileAccessPermission(), 5000),
      checkWithTimeout(() => this.checkLaunchAgentPermission(), 5000),
      checkWithTimeout(() => this.checkKeychainAccessPermission(), 5000)
    ])

    const permissionNames = ['accessibility', 'fullDiskAccess', 'networkAccess', 'fileAccess', 'launchAgent', 'keychainAccess']
    
    // Update permissions state only with confirmed results
    // If a check fails or times out, preserve the previous state
    // If a check succeeds but returns false, update to false (permission was revoked)
    const permissionResults: PermissionResult[] = results.map((result, index) => {
      const key = permissionNames[index] as keyof PermissionsState
      let granted = false
      
      if (result.status === 'fulfilled') {
        // Check succeeded - use the result (true or false)
        // Note: Individual check methods may have already updated this.permissions[key],
        // but we ensure it matches the result here
        granted = result.value === true
        this.permissions[key] = granted
      } else {
        // Check failed (error or timeout) - preserve previous state
        // This prevents permissions from being reset to false when checks fail
        granted = previousPermissions[key]
        this.permissions[key] = previousPermissions[key]
        log.warn(`[Permissions] Check failed for ${permissionNames[index]}, preserving previous state: ${granted}`)
      }
      
      return {
        permission: permissionNames[index],
        granted,
        error: result.status === 'rejected' ? (result.reason as Error).message : null
      }
    })

    // Detect permission changes and emit events
    permissionResults.forEach((result, index) => {
      const key = permissionNames[index] as keyof PermissionsState
      const previous = previousPermissions[key]
      const current = this.permissions[key]
      if (previous !== current) {
        log.info(`[Permissions] Permission changed: ${permissionNames[index]} from ${previous} to ${current}`)
        this.emit('permission-changed', { permission: permissionNames[index], granted: current })
      }
    })

    const allGranted = permissionResults.every(r => r.granted)

    return {
      permissions: this.permissions,
      allGranted,
      results: permissionResults
    }
  }

  // ==================== Permission Descriptions ====================

  getPermissionDescriptions(): { [key: string]: PermissionDescription } {
    return {
      accessibility: {
        name: 'Accessibility',
        description: 'Required to monitor database processes and detect port conflicts.',
        why: 'LiquiDB needs accessibility permission to monitor running database processes and automatically clean up orphaned processes.',
        icon: '🔍',
        critical: true
      },
      fullDiskAccess: {
        name: 'Full Disk Access',
        description: 'Optional - provides access to system logs for advanced debugging.',
        why: 'LiquiDB can work without this, but it helps with advanced debugging and system monitoring.',
        icon: '💾',
        critical: false
      },
      networkAccess: {
        name: 'Network Access',
        description: 'Automatically granted - no permission required.',
        why: 'Network access is automatically granted to apps on macOS and does not require special permission.',
        icon: '🌐',
        critical: false
      },
      fileAccess: {
        name: 'File Access',
        description: 'Required to create and manage database files.',
        why: 'LiquiDB needs file access to create database directories, store configuration files, and manage database data.',
        icon: '📁',
        critical: true
      },
      launchAgent: {
        name: 'Launch Agent',
        description: 'Optional - enables background process monitoring.',
        why: 'LiquiDB can work without this, but it enables the background helper service for better process management.',
        icon: '⚙️',
        critical: false
      },
      keychainAccess: {
        name: 'Keychain Access',
        description: 'Optional - enables secure password storage using Electron safeStorage.',
        why: 'LiquiDB can work without this, but it enables secure storage of database passwords using macOS keychain via Electron\'s native safeStorage API.',
        icon: '🔐',
        critical: false
      }
    }
  }

  // ==================== Utility Methods ====================

  getMissingCriticalPermissions(): string[] {
    const descriptions = this.getPermissionDescriptions()
    return Object.keys(this.permissions).filter(permission => {
      const desc = descriptions[permission]
      return desc && desc.critical && !this.permissions[permission as keyof PermissionsState]
    })
  }

  getMissingPermissions(): string[] {
    return Object.keys(this.permissions).filter(permission => !this.permissions[permission as keyof PermissionsState])
  }

  async requestCriticalPermissions(): Promise<RequestCriticalPermissionsResult> {
    log.info('[Permissions] Requesting critical permissions...')
    
    const criticalPermissions = this.getMissingCriticalPermissions()
    
    if (criticalPermissions.length === 0) {
      log.info('[Permissions] All critical permissions already granted')
      return {
        permissions: this.permissions,
        allGranted: true,
        results: []
      }
    }

    const requests: Promise<boolean>[] = []

    for (const permission of criticalPermissions) {
      requests.push(this.requestPermission(permission))
    }

    const results = await Promise.allSettled(requests)
    
    // Wait a bit for permissions to be processed by the system
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Force re-check all permissions after requests (invalidate cache)
    await this.checkAllPermissions(true)

    const allGranted = results.every(result => result.status === 'fulfilled' && result.value === true)

    log.info(`[Permissions] Critical permission request complete. All granted: ${allGranted}`)

    return {
      permissions: this.permissions,
      allGranted,
      results: results.map((result, index) => ({
        permission: criticalPermissions[index],
        granted: result.status === 'fulfilled' && result.value === true,
        error: result.status === 'rejected' ? (result.reason as Error).message : null
      }))
    }
  }

  async requestPermission(permissionName: string): Promise<boolean> {
    const permissionMap: { [key: string]: () => Promise<boolean> } = {
      accessibility: () => this.requestAccessibilityPermission(),
      fullDiskAccess: () => this.requestFullDiskAccessPermission(),
      networkAccess: () => this.requestNetworkAccessPermission(),
      fileAccess: () => this.requestFileAccessPermission(),
      keychainAccess: () => this.requestKeychainAccessPermission()
    }

    if (permissionMap[permissionName]) {
      return await permissionMap[permissionName]()
    }
    
    throw new Error(`Unknown permission: ${permissionName}`)
  }

  async openPermissionPage(permissionType: string): Promise<boolean> {
    const urls: { [key: string]: string } = {
      accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
      networkAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Network',
      fileAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders',
      keychainAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Keychain'
    }

    const url = urls[permissionType]
    if (!url) {
      log.error(`[Permissions] Unknown permission type: ${permissionType}`)
      return false
    }

    try {
      await execAsync(`open "${url}"`)
      log.info(`[Permissions] Opened System Preferences to ${permissionType} section`)
      return true
    } catch (error: any) {
      log.error(`[Permissions] Failed to open ${permissionType} page:`, error)
      return false
    }
  }

  // ==================== Secure Storage ====================

  encryptString(text: string): Buffer | null {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(text)
      }
      return null
    } catch (error: any) {
      log.error('[Permissions] Failed to encrypt string:', error)
      return null
    }
  }

  decryptString(encryptedBuffer: Buffer): string | null {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encryptedBuffer)
      }
      return null
    } catch (error: any) {
      log.error('[Permissions] Failed to decrypt string:', error)
      return null
    }
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }
}

export default PermissionsManager
