/**
 * LiquiDB Permissions Manager
 * 
 * Handles checking and requesting all necessary macOS permissions for the app
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { systemPreferences, safeStorage } = require('electron')

const execAsync = promisify(exec)

// Helper function to check TCC permissions using tccutil
async function checkTCCPermission(service) {
  try {
    const { stdout } = await execAsync(`tccutil reset ${service} com.liquidb.app 2>/dev/null || echo "not_found"`)
    if (stdout.includes('not_found')) {
      // If tccutil doesn't find the app, it means no permission has been granted
      return false
    }
    // If tccutil succeeds, it means the app has permission
    return true
  } catch (error) {
    return false
  }
}

// Helper function to trigger permission dialogs by resetting permissions
async function triggerPermissionDialog(service) {
  try {
    console.log(`[Permissions] Triggering permission dialog for ${service}...`)
    // Reset the permission to trigger a new dialog
    await execAsync(`tccutil reset ${service} com.liquidb.app`)
    return true
  } catch (error) {
    console.log(`[Permissions] Failed to trigger permission dialog for ${service}:`, error.message)
    return false
  }
}

class PermissionsManager {
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

  // Check if accessibility permission is granted
  async checkAccessibilityPermission() {
    try {
      // Use Electron's native API to check accessibility permission
      const hasPermission = systemPreferences.isTrustedAccessibilityClient(false)
      this.permissions.accessibility = hasPermission
      return hasPermission
    } catch (e) {
      console.log('[Permissions] Accessibility permission check failed:', e.message)
      this.permissions.accessibility = false
      return false
    }
  }

  // Request accessibility permission
  async requestAccessibilityPermission() {
    try {
      console.log('[Permissions] Requesting accessibility permission...')
      
      // Use Electron's native API to request accessibility permission
      // This will show the system dialog if permission is not granted
      const hasPermission = systemPreferences.isTrustedAccessibilityClient(true)
      
      // Wait a moment for the user to respond to the dialog
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check the current permission status
      const granted = await this.checkAccessibilityPermission()
      this.permissions.accessibility = granted
      return granted
    } catch (e) {
      console.log('[Permissions] Accessibility permission request failed:', e.message)
      this.permissions.accessibility = false
      return false
    }
  }

  // Check if full disk access is granted
  async checkFullDiskAccessPermission() {
    try {
      // Try to access a system file that requires full disk access
      const { stdout, stderr } = await execAsync('ls /var/log/system.log 2>&1')
      
      // Check if the command actually succeeded and we got output
      if (stdout && !stderr && stdout.includes('system.log')) {
        this.permissions.fullDiskAccess = true
        return true
      } else {
        this.permissions.fullDiskAccess = false
        return false
      }
    } catch (e) {
      // If we can't access system files, we don't have full disk access
      this.permissions.fullDiskAccess = false
      return false
    }
  }

  // Request full disk access permission
  async requestFullDiskAccessPermission() {
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
    } catch (e) {
      console.log('[Permissions] Full disk access permission request failed:', e.message)
      this.permissions.fullDiskAccess = false
      return false
    }
  }

  // Check if network access is available
  async checkNetworkAccessPermission() {
    // Network access is automatically granted to apps on macOS
    // We don't need to check this as a permission
    this.permissions.networkAccess = true
    return true
  }

  // Request network access permission (usually not needed as it's automatic)
  async requestNetworkAccessPermission() {
    // Network access is automatically granted to apps on macOS
    // No permission dialog is needed
    this.permissions.networkAccess = true
    return true
  }

  // Check if file access is available
  async checkFileAccessPermission() {
    try {
      // Check if we can access the app's data directory
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      
      // Try to create directory if it doesn't exist
      if (!fs.existsSync(testDir)) {
        await fs.promises.mkdir(testDir, { recursive: true })
      }
      
      // Try to write a test file
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      
      // Try to read it back
      const content = await fs.promises.readFile(testFile, 'utf8')
      
      // Clean up
      await fs.promises.unlink(testFile)
      
      // If we got here without errors, we have file access
      this.permissions.fileAccess = content === 'test'
      return this.permissions.fileAccess
    } catch (error) {
      this.permissions.fileAccess = false
      return false
    }
  }

  // Request file access permission
  async requestFileAccessPermission() {
    try {
      const testDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      await fs.promises.mkdir(testDir, { recursive: true })
      
      const testFile = path.join(testDir, 'permission-test.txt')
      await fs.promises.writeFile(testFile, 'test')
      await fs.promises.unlink(testFile)
      
      this.permissions.fileAccess = true
      return true
    } catch (error) {
      this.permissions.fileAccess = false
      return false
    }
  }

  // Check if launch agent permission is available
  async checkLaunchAgentPermission() {
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
      
      // Try to write and then delete the test file
      await fs.promises.writeFile(testPlist, testContent)
      
      // Verify we can read it back
      const content = await fs.promises.readFile(testPlist, 'utf8')
      
      // Clean up
      await fs.promises.unlink(testPlist)
      
      // If we got here without errors, we have launch agent permission
      this.permissions.launchAgent = content.includes('com.liquidb.test')
      return this.permissions.launchAgent
    } catch (error) {
      this.permissions.launchAgent = false
      return false
    }
  }

  // Check if keychain access is available
  async checkKeychainAccessPermission() {
    try {
      // Use Electron's native safeStorage API to check keychain access
      const isAvailable = safeStorage.isEncryptionAvailable()
      this.permissions.keychainAccess = isAvailable
      return isAvailable
    } catch (e) {
      console.log('[Permissions] Keychain access check failed:', e.message)
      this.permissions.keychainAccess = false
      return false
    }
  }

  // Request keychain access permission
  async requestKeychainAccessPermission() {
    try {
      console.log('[Permissions] Requesting keychain access permission...')
      
      // Use Electron's native safeStorage API to trigger keychain permission dialog
      // This will show the macOS keychain permission dialog on first use
      if (safeStorage.isEncryptionAvailable()) {
        // Try to encrypt a test string - this will trigger the permission dialog
        const testData = 'LiquiDB test data'
        const encrypted = safeStorage.encryptString(testData)
        
        // Wait a moment for the user to respond to the dialog
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Check if permission was granted
        const granted = await this.checkKeychainAccessPermission()
        this.permissions.keychainAccess = granted
        return granted
      } else {
        // If encryption is not available, we don't have keychain access
        this.permissions.keychainAccess = false
        return false
      }
    } catch (error) {
      console.log('[Permissions] Keychain access permission request failed:', error.message)
      this.permissions.keychainAccess = false
      return false
    }
  }

  // Check all permissions
  async checkAllPermissions() {
    console.log('[Permissions] Checking all permissions...')
    
    // Reset all permissions to false first
    this.permissions = {
      accessibility: false,
      fullDiskAccess: false,
      networkAccess: false,
      fileAccess: false,
      launchAgent: false,
      keychainAccess: false
    }
    
    // Check each permission individually with detailed logging
    console.log('[Permissions] Checking accessibility...')
    const accessibilityResult = await this.checkAccessibilityPermission()
    console.log('[Permissions] Accessibility result:', accessibilityResult)
    
    console.log('[Permissions] Checking full disk access...')
    const fullDiskResult = await this.checkFullDiskAccessPermission()
    console.log('[Permissions] Full disk access result:', fullDiskResult)
    
    console.log('[Permissions] Checking network access...')
    const networkResult = await this.checkNetworkAccessPermission()
    console.log('[Permissions] Network access result:', networkResult)
    
    console.log('[Permissions] Checking file access...')
    const fileResult = await this.checkFileAccessPermission()
    console.log('[Permissions] File access result:', fileResult)
    
    console.log('[Permissions] Checking launch agent...')
    const launchAgentResult = await this.checkLaunchAgentPermission()
    console.log('[Permissions] Launch agent result:', launchAgentResult)
    
    console.log('[Permissions] Checking keychain access...')
    const keychainResult = await this.checkKeychainAccessPermission()
    console.log('[Permissions] Keychain access result:', keychainResult)

    const allGranted = accessibilityResult && fullDiskResult && networkResult && fileResult && launchAgentResult && keychainResult
    
    console.log('[Permissions] Final permission check results:', {
      accessibility: this.permissions.accessibility,
      fullDiskAccess: this.permissions.fullDiskAccess,
      networkAccess: this.permissions.networkAccess,
      fileAccess: this.permissions.fileAccess,
      launchAgent: this.permissions.launchAgent,
      keychainAccess: this.permissions.keychainAccess,
      allGranted
    })

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

  // Get permission descriptions
  getPermissionDescriptions() {
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
  getMissingCriticalPermissions() {
    const descriptions = this.getPermissionDescriptions()
    return Object.keys(this.permissions).filter(permission => {
      const desc = descriptions[permission]
      return desc.critical && !this.permissions[permission]
    })
  }

  // Get missing permissions
  getMissingPermissions() {
    return Object.keys(this.permissions).filter(permission => !this.permissions[permission])
  }

  // Request only critical permissions that the app actually needs
  async requestCriticalPermissions() {
    console.log('[Permissions] Requesting critical permissions only...')
    
    // Request accessibility permission using Electron's native API
    let accessibilityResult = { status: 'fulfilled', value: true }
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
      } catch (e) {
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
          error: result.status === 'rejected' ? result.reason.message : null
        }
      })
    }
  }

  // Request specific permission
  async requestPermission(permissionName) {
    const permissionMap = {
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
  async openPermissionPage(permissionType) {
    const urls = {
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
    } catch (error) {
      console.error(`[Permissions] Failed to open ${permissionType} page:`, error)
      return false
    }
  }

  // Utility methods for secure storage using Electron's safeStorage API
  encryptString(text) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(text)
      }
      return null
    } catch (error) {
      console.error('[Permissions] Failed to encrypt string:', error)
      return null
    }
  }

  decryptString(encryptedBuffer) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encryptedBuffer)
      }
      return null
    } catch (error) {
      console.error('[Permissions] Failed to decrypt string:', error)
      return null
    }
  }

  isEncryptionAvailable() {
    return safeStorage.isEncryptionAvailable()
  }
}

module.exports = PermissionsManager
