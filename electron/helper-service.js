/**
 * LiquiDB Helper Service Manager
 * 
 * Manages the background helper service that monitors database processes
 */

const { spawn, exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

class HelperServiceManager {
  constructor(app) {
    this.app = app
    this.helperProcess = null
    this.isRunning = false
    this.plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.liquidb.helper.plist')
    
    // Determine the correct path to helper files based on whether app is packaged
    if (app.isPackaged) {
      // In production, helper files are in the app bundle
      this.helperPath = path.join(process.resourcesPath, 'helper', 'liquidb-helper.js')
      this.plistTemplate = path.join(process.resourcesPath, 'helper', 'com.liquidb.helper.plist')
    } else {
      // In development, helper files are in the source directory
      this.helperPath = path.join(__dirname, '..', 'helper', 'liquidb-helper.js')
      this.plistTemplate = path.join(__dirname, '..', 'helper', 'com.liquidb.helper.plist')
    }
  }

  // Check if helper service is installed
  isInstalled() {
    return fs.existsSync(this.plistPath)
  }

  // Check if helper service is running
  isServiceRunning() {
    return new Promise((resolve) => {
      exec('launchctl list | grep com.liquidb.helper', (error, stdout) => {
        if (error) {
          resolve(false)
          return
        }
        // Check if the service is actually running (not just loaded)
        const lines = stdout.trim().split('\n')
        const isRunning = lines.some(line => {
          const parts = line.trim().split(/\s+/)
          // Format: PID Status Label
          // If PID is not 0, service is running
          return parts.length >= 3 && parts[0] !== '0' && parts[0] !== '-'
        })
        resolve(isRunning)
      })
    })
  }

  // Install helper service
  async install() {
    try {
      console.log('[Helper] Installing helper service...')
      
      // Create LaunchAgents directory
      const launchAgentsDir = path.dirname(this.plistPath)
      if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true })
      }

      // Read and update plist template
      let plistContent = fs.readFileSync(this.plistTemplate, 'utf8')
      
      // Replace paths with actual paths
      const appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      const helperDir = path.join(appDataDir, 'helper')
      const logDir = path.join(os.homedir(), 'Library', 'Logs', 'LiquiDB')
      const logFile = path.join(logDir, 'helper.log')
      
      // Ensure directories exist
      if (!fs.existsSync(helperDir)) {
        fs.mkdirSync(helperDir, { recursive: true })
      }
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      
      // Copy all helper files to app data directory
      const helperFiles = [
        'liquidb-helper.js',
        'ipc-server.js',
        'ipc-client.js'
      ]
      
      // Determine source directory based on whether app is packaged
      const sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath, 'helper')
        : path.join(__dirname, '..', 'helper')
      
      for (const fileName of helperFiles) {
        const sourceFile = path.join(sourceDir, fileName)
        const targetFile = path.join(helperDir, fileName)
        if (fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, targetFile)
          console.log('[Helper] Copied helper file to:', targetFile)
        } else {
          console.warn('[Helper] Source file not found:', sourceFile)
        }
      }
      
      // Use system Node.js, not the one from the Electron app bundle
      let nodeExecutable = '/usr/local/bin/node'
      console.log('[Helper] Checking Node.js paths...')
      console.log('[Helper] /usr/local/bin/node exists:', fs.existsSync('/usr/local/bin/node'))
      console.log('[Helper] /opt/homebrew/bin/node exists:', fs.existsSync('/opt/homebrew/bin/node'))
      console.log('[Helper] /usr/bin/node exists:', fs.existsSync('/usr/bin/node'))
      
      if (!fs.existsSync(nodeExecutable)) {
        nodeExecutable = '/opt/homebrew/bin/node'
        if (!fs.existsSync(nodeExecutable)) {
          nodeExecutable = '/usr/bin/node'
        }
      }

      console.log('[Helper] Using Node.js executable:', nodeExecutable)
      console.log('[Helper] Helper directory:', helperDir)
      console.log('[Helper] Home directory:', os.homedir())

      // Get current user info
      const username = os.userInfo().username
      const groupname = os.userInfo().username // Use username as group for simplicity
      
      // Replace placeholders with actual values
      plistContent = plistContent
        .replaceAll('NODE_EXECUTABLE_PATH', nodeExecutable)
        .replaceAll('HELPER_SCRIPT_PATH', path.join(helperDir, 'liquidb-helper.js'))
        .replaceAll('USER_NAME', username)
        .replaceAll('GROUP_NAME', groupname)
        .replaceAll('LOG_FILE_PATH', logFile)
        .replaceAll('HELPER_DIRECTORY', helperDir)

      console.log('[Helper] Updated plist content preview:', plistContent.substring(0, 500) + '...')

      // Write plist file
      fs.writeFileSync(this.plistPath, plistContent)
      console.log('[Helper] Plist file created:', this.plistPath)

      // Load the service
      await this.loadService()
      
      console.log('[Helper] Service installed successfully')
      return true
    } catch (error) {
      console.error('[Helper] Installation failed:', error)
      return false
    }
  }

  // Load helper service
  async loadService() {
    return new Promise((resolve, reject) => {
      exec(`launchctl load "${this.plistPath}"`, (error, stdout, stderr) => {
        if (error && !error.message.includes('already loaded')) {
          console.error('[Helper] Failed to load service:', stderr)
          reject(error)
        } else {
          console.log('[Helper] Service loaded')
          resolve()
        }
      })
    })
  }

  // Unload helper service
  async unloadService() {
    return new Promise((resolve, reject) => {
      exec(`launchctl unload "${this.plistPath}"`, (error, stdout, stderr) => {
        if (error && !error.message.includes('not loaded')) {
          console.error('[Helper] Failed to unload service:', stderr)
          reject(error)
        } else {
          console.log('[Helper] Service unloaded')
          resolve()
        }
      })
    })
  }

  // Start helper service
  async start() {
    try {
      if (this.isRunning) {
        console.log('[Helper] Service already running')
        return true
      }

      // Check if service is already running
      const isAlreadyRunning = await this.isServiceRunning()
      if (isAlreadyRunning) {
        console.log('[Helper] Service is already running externally')
        this.isRunning = true
        return true
      }

      if (!this.isInstalled()) {
        console.log('[Helper] Service not installed, installing...')
        const installed = await this.install()
        if (!installed) {
          return false
        }
      } else {
        // Service is installed, make sure it's loaded
        console.log('[Helper] Service is installed, ensuring it\'s loaded...')
        try {
          await this.loadService()
        } catch (error) {
          console.log('[Helper] Service already loaded or load failed:', error.message)
        }
      }

      // Start the service
      await this.startService()
      
      this.isRunning = true
      console.log('[Helper] Service started successfully')
      return true
    } catch (error) {
      console.error('[Helper] Failed to start service:', error)
      return false
    }
  }

  // Start the actual service
  async startService() {
    return new Promise((resolve, reject) => {
      exec(`launchctl start com.liquidb.helper`, (error, stdout, stderr) => {
        if (error) {
          console.error('[Helper] Failed to start service:', stderr)
          reject(error)
        } else {
          console.log('[Helper] Service started')
          resolve()
        }
      })
    })
  }

  // Stop helper service
  async stop() {
    try {
      if (!this.isRunning) {
        console.log('[Helper] Service not running')
        return true
      }

      await this.stopService()
      this.isRunning = false
      console.log('[Helper] Service stopped')
      return true
    } catch (error) {
      console.error('[Helper] Failed to stop service:', error)
      return false
    }
  }

  // Stop the actual service
  async stopService() {
    return new Promise((resolve, reject) => {
      exec(`launchctl stop com.liquidb.helper`, (error, stdout, stderr) => {
        if (error) {
          console.error('[Helper] Failed to stop service:', stderr)
          reject(error)
        } else {
          console.log('[Helper] Service stopped')
          resolve()
        }
      })
    })
  }

  // Restart helper service
  async restart() {
    await this.stop()
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
    return await this.start()
  }

  // Uninstall helper service
  async uninstall() {
    try {
      console.log('[Helper] Uninstalling helper service...')
      
      // Stop and unload service
      await this.stop()
      await this.unloadService()
      
      // Remove plist file
      if (fs.existsSync(this.plistPath)) {
        fs.unlinkSync(this.plistPath)
        console.log('[Helper] Plist file removed')
      }
      
      console.log('[Helper] Service uninstalled')
      return true
    } catch (error) {
      console.error('[Helper] Uninstall failed:', error)
      return false
    }
  }

  // Get service status
  async getStatus() {
    const installed = this.isInstalled()
    const running = await this.isServiceRunning()
    
    return {
      installed,
      running,
      isRunning: this.isRunning
    }
  }

  // Check if helper service is healthy and running
  async isHealthy() {
    try {
      const status = await this.getStatus()
      return status.installed && status.running
    } catch (error) {
      console.error('[Helper] Error checking health:', error)
      return false
    }
  }

  // Request cleanup from helper
  async requestCleanup() {
    try {
      // First check if helper service is running
      const isRunning = await this.isServiceRunning()
      if (!isRunning) {
        console.log('[Helper] Service not running, performing direct cleanup')
        return await this.performDirectCleanup()
      }

      // Try to connect to helper service
      const HelperClient = require('../helper/ipc-client')
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.requestCleanup()
      client.disconnect()
      
      return result
    } catch (error) {
      console.error('[Helper] Cleanup request failed:', error)
      
      // If socket connection failed, try direct cleanup
      if (error.message.includes('ECONNREFUSED') || error.message.includes('socket not found')) {
        console.log('[Helper] Socket unavailable, performing direct cleanup')
        return await this.performDirectCleanup()
      }
      
      return { success: false, error: error.message }
    }
  }

  // Perform cleanup directly without helper service
  async performDirectCleanup() {
    try {
      console.log('[Helper] Performing direct cleanup of orphaned processes')
      
      // Import the helper functions directly
      const helperPath = path.join(__dirname, '..', 'helper', 'liquidb-helper.js')
      const helper = require(helperPath)
      
      // Run cleanup
      const cleanedCount = await helper.cleanupOrphanedProcesses()
      
      return {
        success: true,
        data: {
          cleanedCount,
          method: 'direct',
          timestamp: Date.now()
        }
      }
    } catch (error) {
      console.error('[Helper] Direct cleanup failed:', error)
      return { 
        success: false, 
        error: error.message,
        method: 'direct'
      }
    }
  }
}

module.exports = HelperServiceManager
