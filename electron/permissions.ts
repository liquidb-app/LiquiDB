/**
 * LiquiDB Permissions Manager
 * 
 * Handles checking and requesting all necessary macOS permissions for the app
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { systemPreferences, safeStorage } from 'electron'

const execAsync = promisify(exec)

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

// Helper function to check TCC permissions using tccutil
async function checkTCCPermission(service: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`tccutil reset ${service} com.liquidb.app 2>/dev/null || echo "not_found"`) as { stdout: string }
    if (stdout.includes('not_found')) {
      // If tccutil doesn't find the app, it means no permission has been granted
      return false
    }
    // If tccutil succeeds, it means the app has permission
    return true
  } catch (error: any) {
    return false
  }
}

// Helper function to trigger permission dialogs by resetting permissions
async function triggerPermissionDialog(service: string): Promise<boolean> {
  try {
    console.log(`[Permissions] Triggering permission dialog for ${service}...`)
    // Reset the permission to trigger a new dialog
    await execAsync(`tccutil reset ${service} com.liquidb.app`)
    return true
  } catch (error: any) {
    console.log(`[Permissions] Failed to trigger permission dialog for ${service}:`, error.message)
    return false
  }
}

class PermissionsManager {
  private permissions: PermissionsState

  constructor() {
    this.permissions = {
      accessibility: false,
      fullDiskAccess: false,
      networkAccess: false,
      fileAccess: false,
      launchAgent: false,
      keychainAccess: false
    }
  }

  async checkAccessibilityPermission(): Promise<boolean> {
    try {
      // Use Electron's native API to check accessibility permission
      const hasPermission = systemPreferences.isTrustedAccessibilityClient(false)
      this.permissions.accessibility = hasPermission
      return hasPermission
    } catch (e: any) {
      console.log('[Permissions] Accessibility permission check failed:', e.message)
      this.permissions.accessibility = false
      return false
    }
  }

  async requestAccessibilityPermission(): Promise<boolean> {
    try {
      console.log('[Permissions] Requesting accessibility permission...')
      
      // Use Electron's native API to request accessibility permission
      // This will show the system dialog if permission is not granted
      systemPreferences.isTrustedAccessibilityClient(true)
      
      // Wait a moment for the user to respond to the dialog
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check the current permission status
      const granted = await this.checkAccessibilityPermission()
      this.permissions.accessibility = granted
      return granted
    } catch (e: any) {
      console.log('[Permissions] Accessibility permission request failed:', e.message)
      this.permissions.accessibility = false
      return false
    }
  }

  async checkFullDiskAccessPermission(): Promise<boolean> {
    try {
      // Try to access a system file that requires full disk access
      const { stdout, stderr } = await execAsync('ls /var/log/system.log 2>&1') as { stdout: string, stderr: string }
      
      // Check if the command actually succeeded and we got output
      if (stdout && !stderr && stdout.includes('system.log')) {
        this.permissions.fullDiskAccess = true
        return true
      } else {
        this.permissions.fullDiskAccess = false
        return false
      }
    } catch (e: any) {
      // If we can't access system files, we don't have full disk access
      this.permissions.fullDiskAccess = false
      return false
    }
  }

  async requestFullDiskAccessPermission(): Promise<boolean> {
    try {
      console.log('[Permissions] Requesting full disk access permission...')
      
      // First, try to reset the permission to trigger a dialog
      await triggerPermissionDialog('kTCCServiceSystemPolicyAllFiles')
      
      // Wait a moment for the user to respond to the dialog
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Then try to access system logs to trigger the permission dialog
      await execAsync('ls /var/log/system.log')
      
      // Wait another moment for the user to respond
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check if permission was granted
      const granted = await this.checkFullDiskAccessPermission()
      this.permissions.fullDiskAccess = granted
      return granted
    } catch (e: any) {
      console.log('[Permissions] Full disk access permission request failed:', e.message)
      this.permissions.fullDiskAccess = false
      return false
    }
  }

  async checkNetworkAccessPermission(): Promise<boolean> {
    this.permissions.networkAccess = true
    return true
  }

  async requestNetworkAccessPermission(): Promise<boolean> {
    this.permissions.networkAccess = true
    return true
  }

  async checkFileAccessPermission(): Promise<boolean> {
    try {
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      
      if (!fs.existsSync(testDir)) {
        await fs.promises.mkdir(testDir, { recursive: true })
      }
      
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      
      const content = await fs.promises.readFile(testFile, 'utf8')
      
      await fs.promises.unlink(testFile)
      
      this.permissions.fileAccess = content === 'test'
      return this.permissions.fileAccess
    } catch (error: any) {
      this.permissions.fileAccess = false
      return false
    }
  }

  async requestFileAccessPermission(): Promise<boolean> {
    try {
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      await fs.promises.mkdir(testDir, { recursive: true })
      
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      await fs.promises.unlink(testFile)
      
      this.permissions.fileAccess = true
      return true
    } catch (error: any) {
      this.permissions.fileAccess = false
      return false
    }
  }

  async checkLaunchAgentPermission(): Promise<boolean> {
    try {
      const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
      
      // Check if we can access the LaunchAgents directory
      await fs.promises.access(launchAgentsDir, fs.constants.R_OK | fs.constants.W_OK)
      
      // Check if we can create a test plist file
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
      
      this.permissions.launchAgent = content.includes('com.liquidb.test')
      return this.permissions.launchAgent
    } catch (error: any) {
      this.permissions.launchAgent = false
      return false
    }
  }

  async checkKeychainAccessPermission(): Promise<boolean> {
    try {
      const isAvailable = safeStorage.isEncryptionAvailable()
      this.permissions.keychainAccess = isAvailable
      return isAvailable
    } catch (e: any) {
      console.log('[Permissions] Keychain access check failed:', e.message)
      this.permissions.keychainAccess = false
      return false
    }
  }

  async requestKeychainAccessPermission(): Promise<boolean> {
    try {
      console.log('[Permissions] Requesting keychain access permission...')
      
      if (safeStorage.isEncryptionAvailable()) {
        const testData = 'LiquiDB test data'
        safeStorage.encryptString(testData)
        
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const granted = await this.checkKeychainAccessPermission()
        this.permissions.keychainAccess = granted
        return granted
      } else {
        this.permissions.keychainAccess = false
        return false
      }
    } catch (error: any) {
      console.log('[Permissions] Keychain access permission request failed:', error.message)
      this.permissions.keychainAccess = false
      return false
    }
  }

  async checkAllPermissions(): Promise<CheckAllPermissionsResult> {
    this.permissions = {
      accessibility: false,
      fullDiskAccess: false,
      networkAccess: false,
      fileAccess: false,
      launchAgent: false,
      keychainAccess: false
    }
    
    // Check each permission individually (reduced logging for performance)
    const accessibilityResult = await this.checkAccessibilityPermission()
    const fullDiskResult = await this.checkFullDiskAccessPermission()
    const networkResult = await this.checkNetworkAccessPermission()
    const fileResult = await this.checkFileAccessPermission()
    const launchAgentResult = await this.checkLaunchAgentPermission()
    const keychainResult = await this.checkKeychainAccessPermission()

    const allGranted = accessibilityResult && fullDiskResult && networkResult && fileResult && launchAgentResult && keychainResult

    return {
      permissions: this.permissions,
      allGranted,
      results: [
        { permission: 'accessibility', granted: accessibilityResult, error: null },
        { permission: 'fullDiskAccess', granted: fullDiskResult, error: null },
        { permission: 'networkAccess', granted: networkResult, error: null },
        { permission: 'fileAccess', granted: fileResult, error: null },
        { permission: 'launchAgent', granted: launchAgentResult, error: null },
        { permission: 'keychainAccess', granted: keychainResult, error: null }
      ]
    }
  }

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

  // Get missing critical permissions
  getMissingCriticalPermissions(): string[] {
    const descriptions = this.getPermissionDescriptions()
    return Object.keys(this.permissions).filter(permission => {
      const desc = descriptions[permission]
      return desc && desc.critical && !this.permissions[permission as keyof PermissionsState]
    })
  }

  // Get missing permissions
  getMissingPermissions(): string[] {
    return Object.keys(this.permissions).filter(permission => !this.permissions[permission as keyof PermissionsState])
  }

  // Request only critical permissions that the app actually needs
  async requestCriticalPermissions(): Promise<RequestCriticalPermissionsResult> {
    console.log('[Permissions] Requesting critical permissions only...')
    
    // Request accessibility permission using Electron's native API
    let accessibilityResult: PromiseSettledResult<boolean> = { status: 'fulfilled', value: true }
    if (!this.permissions.accessibility) {
      try {
        console.log('[Permissions] Requesting accessibility permission using Electron API...')
        // This will show the system dialog
        systemPreferences.isTrustedAccessibilityClient(true)
        
        // Wait for user to respond to the dialog
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // Check if permission was granted
        const granted = await this.checkAccessibilityPermission()
        accessibilityResult = { 
          status: 'fulfilled', 
          value: granted 
        }
      } catch (e: any) {
        console.log('[Permissions] Accessibility permission request failed:', e.message)
        accessibilityResult = { status: 'rejected', reason: e }
      }
    }
    
    // Only request permissions that are actually needed for core functionality
    const criticalRequests = [
      this.requestFileAccessPermission() // Always needed for database files
    ]

    const results = await Promise.allSettled(criticalRequests)
    const allResults = [...results, accessibilityResult]
    const allGranted = allResults.every(result => result.status === 'fulfilled' && result.value === true)
    
    console.log('[Permissions] Critical permission request results:', {
      fileAccess: this.permissions.fileAccess,
      accessibility: this.permissions.accessibility,
      allGranted
    })

    return {
      permissions: this.permissions,
      allGranted,
      results: allResults.map((result, index) => {
        const permissionNames = ['fileAccess', 'accessibility']
        return {
          permission: permissionNames[index],
          granted: result.status === 'fulfilled' && result.value === true,
          error: result.status === 'rejected' ? (result.reason as Error).message : null
        }
      })
    }
  }

  // Request specific permission
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

  // Open specific permission page in System Preferences
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
      console.error(`[Permissions] Unknown permission type: ${permissionType}`)
      return false
    }

    try {
      await execAsync(`open "${url}"`)
      console.log(`[Permissions] Opened System Preferences to ${permissionType} section`)
      return true
    } catch (error: any) {
      console.error(`[Permissions] Failed to open ${permissionType} page:`, error)
      return false
    }
  }

  // Utility methods for secure storage using Electron's safeStorage API
  encryptString(text: string): Buffer | null {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(text)
      }
      return null
    } catch (error: any) {
      console.error('[Permissions] Failed to encrypt string:', error)
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
      console.error('[Permissions] Failed to decrypt string:', error)
      return null
    }
  }

  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }
}

export default PermissionsManager
