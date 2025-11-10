/**
 * LiquiDB Helper Service Manager
 * 
 * Cross-platform helper service manager for macOS, Windows, and Linux
 */

import { exec, ExecException } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { App } from 'electron'

const execAsync = promisify(exec)

const PLATFORM = process.platform
const IS_MAC = PLATFORM === 'darwin'
const IS_WINDOWS = PLATFORM === 'win32'
const IS_LINUX = PLATFORM === 'linux'

interface ServiceStatus {
  installed: boolean
  running: boolean
  isRunning: boolean
}

interface CleanupResult {
  success: boolean
  data?: {
    cleanedCount: number
    method: string
    timestamp: number
  }
  error?: string
  method?: string
}

interface PortCheckResult {
  success: boolean
  data?: {
    port: number
    available: boolean
    reason: string | null
    method: string
  }
  error?: string
  method?: string
}

interface PortFindResult {
  success: boolean
  data?: {
    suggestedPort: number
    startPort: number
    method: string
  }
  error?: string
  method?: string
}

class HelperServiceManager {
  private app: App
  private helperProcess: any
  private isRunning: boolean
  private isInstalling: boolean
  private servicePath: string // Platform-specific service file path
  private helperPath: string
  private serviceTemplate: string
  private platform: string

  constructor(app: App) {
    this.app = app
    this.helperProcess = null
    this.isRunning = false
    this.isInstalling = false
    this.platform = PLATFORM
    
    // Determine the correct path to helper files based on whether app is packaged
    if (app.isPackaged) {
      this.helperPath = path.join(process.resourcesPath!, 'helper', 'liquidb-helper.js')
    } else {
      this.helperPath = path.join(__dirname, '..', 'helper-dist', 'liquidb-helper.js')
    }
    
    // Platform-specific paths
    if (IS_MAC) {
      this.servicePath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.liquidb.helper.plist')
      this.serviceTemplate = app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'com.liquidb.helper.plist')
        : path.join(__dirname, '..', 'helper', 'com.liquidb.helper.plist')
    } else if (IS_WINDOWS) {
      // Windows Task Scheduler task name (not a file path)
      this.servicePath = 'LiquiDB Helper Service'
      this.serviceTemplate = app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'com.liquidb.helper.windows.xml')
        : path.join(__dirname, '..', 'helper', 'com.liquidb.helper.windows.xml')
    } else if (IS_LINUX) {
      this.servicePath = path.join(os.homedir(), '.config', 'systemd', 'user', 'com.liquidb.helper.service')
      this.serviceTemplate = app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'com.liquidb.helper.service')
        : path.join(__dirname, '..', 'helper', 'com.liquidb.helper.service')
    } else {
      throw new Error(`Unsupported platform: ${PLATFORM}`)
    }
  }

  // ==================== Platform-Agnostic Methods ====================

  isInstalled(): boolean {
    if (IS_MAC) {
      return this.isInstalledMac()
    } else if (IS_WINDOWS) {
      return this.isInstalledWindows()
    } else if (IS_LINUX) {
      return this.isInstalledLinux()
    }
    return false
  }

  async isServiceRunning(): Promise<boolean> {
    if (IS_MAC) {
      return await this.isServiceRunningMac()
    } else if (IS_WINDOWS) {
      return await this.isServiceRunningWindows()
    } else if (IS_LINUX) {
      return await this.isServiceRunningLinux()
    }
    return false
  }

  async install(): Promise<boolean> {
    if (IS_MAC) {
      return await this.installMac()
    } else if (IS_WINDOWS) {
      return await this.installWindows()
    } else if (IS_LINUX) {
      return await this.installLinux()
    }
    return false
  }

  async start(): Promise<boolean> {
    try {
      if (this.isRunning) {
        console.log('[Helper] Service already running')
        return true
      }

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
        // Ensure service is loaded/started
        if (IS_MAC) {
          try {
            await this.loadService()
          } catch (error: any) {
            console.log('[Helper] Service already loaded or load failed:', error.message)
          }
        } else if (IS_LINUX) {
          try {
            await execAsync('systemctl --user daemon-reload')
          } catch (error: any) {
            console.log('[Helper] Failed to reload systemd:', error.message)
          }
        }
      }

      // Start the service
      await this.startService()
      
      this.isRunning = true
      console.log('[Helper] Service started successfully')
      return true
    } catch (error: any) {
      console.error('[Helper] Failed to start service:', error)
      return false
    }
  }

  async startService(): Promise<void> {
    if (IS_MAC) {
      return await this.startServiceMac()
    } else if (IS_WINDOWS) {
      return await this.startServiceWindows()
    } else if (IS_LINUX) {
      return await this.startServiceLinux()
    }
  }

  async stop(): Promise<boolean> {
    try {
      if (!this.isRunning) {
        console.log('[Helper] Service not running')
        return true
      }

      await this.stopService()
      this.isRunning = false
      console.log('[Helper] Service stopped')
      return true
    } catch (error: any) {
      console.error('[Helper] Failed to stop service:', error)
      return false
    }
  }

  async stopService(): Promise<void> {
    if (IS_MAC) {
      return await this.stopServiceMac()
    } else if (IS_WINDOWS) {
      return await this.stopServiceWindows()
    } else if (IS_LINUX) {
      return await this.stopServiceLinux()
    }
  }

  async restart(): Promise<boolean> {
    await this.stop()
    await new Promise(resolve => setTimeout(resolve, 1000))
    return await this.start()
  }

  async uninstall(): Promise<boolean> {
    try {
      console.log('[Helper] Uninstalling helper service...')
      
      await this.stop()
      
      if (IS_MAC) {
        await this.unloadService()
        if (fs.existsSync(this.servicePath)) {
          fs.unlinkSync(this.servicePath)
        }
      } else if (IS_WINDOWS) {
        try {
          await execAsync(`schtasks /Delete /TN "${this.servicePath}" /F`)
        } catch (error: any) {
          if (!error.message.includes('does not exist')) {
            throw error
          }
        }
      } else if (IS_LINUX) {
        try {
          await execAsync('systemctl --user disable com.liquidb.helper.service')
          await execAsync('systemctl --user stop com.liquidb.helper.service')
        } catch (error: any) {
          // Ignore if service doesn't exist
        }
        if (fs.existsSync(this.servicePath)) {
          fs.unlinkSync(this.servicePath)
        }
      }
      
      console.log('[Helper] Service uninstalled')
      return true
    } catch (error: any) {
      console.error('[Helper] Uninstall failed:', error)
      return false
    }
  }

  async getStatus(): Promise<ServiceStatus> {
    const installed = this.isInstalled()
    const running = await this.isServiceRunning()
    
    return {
      installed,
      running,
      isRunning: this.isRunning
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const status = await this.getStatus()
      return status.installed && status.running
    } catch (error: any) {
      console.error('[Helper] Error checking health:', error)
      return false
    }
  }

  // ==================== macOS Methods ====================

  private isInstalledMac(): boolean {
    return fs.existsSync(this.servicePath)
  }

  private async isServiceRunningMac(): Promise<boolean> {
    return new Promise((resolve) => {
      exec('launchctl list | grep com.liquidb.helper', (error: ExecException | null, stdout: string) => {
        if (error) {
          resolve(false)
          return
        }
        const lines = stdout.trim().split('\n')
        const isRunning = lines.some(line => {
          const parts = line.trim().split(/\s+/)
          return parts.length >= 3 && parts[2] === 'com.liquidb.helper'
        })
        resolve(isRunning)
      })
    })
  }

  private async installMac(): Promise<boolean> {
    try {
      if (this.isInstalling) {
        console.log('[Helper] Installation already in progress, skipping...')
        return true
      }
      
      this.isInstalling = true
      console.log('[Helper] Installing helper service (macOS)...')
      
      const launchAgentsDir = path.dirname(this.servicePath)
      if (!fs.existsSync(launchAgentsDir)) {
        fs.mkdirSync(launchAgentsDir, { recursive: true })
      }

      let plistContent = fs.readFileSync(this.serviceTemplate, 'utf8')
      
      const appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      const helperDir = path.join(appDataDir, 'helper')
      const logDir = path.join(os.homedir(), 'Library', 'Logs', 'LiquiDB')
      const logFile = path.join(logDir, 'helper.log')
      
      if (!fs.existsSync(helperDir)) {
        fs.mkdirSync(helperDir, { recursive: true })
      }
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      
      const helperFiles = ['liquidb-helper.js', 'ipc-client.js']
      const sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath!, 'helper')
        : path.join(__dirname, '..', 'helper-dist')
      
      for (const fileName of helperFiles) {
        const sourceFile = path.join(sourceDir, fileName)
        const targetFile = path.join(helperDir, fileName)
        if (fs.existsSync(sourceFile)) {
          let shouldCopy = false
          if (!fs.existsSync(targetFile)) {
            shouldCopy = true
          } else {
            const sourceStats = fs.statSync(sourceFile)
            const targetStats = fs.statSync(targetFile)
            if (sourceStats.mtime > targetStats.mtime) {
              shouldCopy = true
            }
          }
          
          if (shouldCopy) {
            fs.copyFileSync(sourceFile, targetFile)
          }
        }
      }
      
      let nodeExecutable = '/usr/local/bin/node'
      if (!fs.existsSync(nodeExecutable)) {
        nodeExecutable = '/opt/homebrew/bin/node'
        if (!fs.existsSync(nodeExecutable)) {
          nodeExecutable = '/usr/bin/node'
        }
      }

      const username = os.userInfo().username
      const groupname = os.userInfo().username
      
      plistContent = plistContent
        .replaceAll('NODE_EXECUTABLE_PATH', nodeExecutable)
        .replaceAll('HELPER_SCRIPT_PATH', path.join(helperDir, 'liquidb-helper.js'))
        .replaceAll('USER_NAME', username)
        .replaceAll('GROUP_NAME', groupname)
        .replaceAll('LOG_FILE_PATH', logFile)
        .replaceAll('HELPER_DIRECTORY', helperDir)

      fs.writeFileSync(this.servicePath, plistContent)
      await this.loadService()
      
      console.log('[Helper] Service installed successfully (macOS)')
      return true
    } catch (error: any) {
      console.error('[Helper] Installation failed (macOS):', error)
      return false
    } finally {
      this.isInstalling = false
    }
  }

  private async loadService(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`launchctl load "${this.servicePath}"`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  private async unloadService(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`launchctl unload "${this.servicePath}"`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  private async startServiceMac(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`launchctl start com.liquidb.helper`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  private async stopServiceMac(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`launchctl stop com.liquidb.helper`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  // ==================== Windows Methods ====================

  private isInstalledWindows(): boolean {
    try {
      // Use synchronous check for Windows Task Scheduler
      const { execSync } = require('child_process')
      execSync(`schtasks /Query /TN "${this.servicePath}" /FO LIST`, { stdio: 'ignore' })
      return true
    } catch (error: any) {
      return false
    }
  }

  private async isServiceRunningWindows(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`schtasks /Query /TN "${this.servicePath}" /FO LIST /V`)
      // Check if task is running by looking for "Running" status
      return stdout.includes('Running') || stdout.includes('Ready')
    } catch (error: any) {
      return false
    }
  }

  private async installWindows(): Promise<boolean> {
    try {
      if (this.isInstalling) {
        console.log('[Helper] Installation already in progress, skipping...')
        return true
      }
      
      this.isInstalling = true
      console.log('[Helper] Installing helper service (Windows)...')
      
      const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      const appDataDir = path.join(appDataPath, 'LiquiDB')
      const helperDir = path.join(appDataDir, 'helper')
      const logDir = path.join(appDataPath, '..', 'Local', 'LiquiDB', 'Logs')
      const logFile = path.join(logDir, 'helper.log')
      
      if (!fs.existsSync(helperDir)) {
        fs.mkdirSync(helperDir, { recursive: true })
      }
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      
      const helperFiles = ['liquidb-helper.js', 'ipc-client.js']
      const sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath!, 'helper')
        : path.join(__dirname, '..', 'helper-dist')
      
      for (const fileName of helperFiles) {
        const sourceFile = path.join(sourceDir, fileName)
        const targetFile = path.join(helperDir, fileName)
        if (fs.existsSync(sourceFile)) {
          let shouldCopy = false
          if (!fs.existsSync(targetFile)) {
            shouldCopy = true
          } else {
            const sourceStats = fs.statSync(sourceFile)
            const targetStats = fs.statSync(targetFile)
            if (sourceStats.mtime > targetStats.mtime) {
              shouldCopy = true
            }
          }
          
          if (shouldCopy) {
            fs.copyFileSync(sourceFile, targetFile)
          }
        }
      }
      
      // Find Node.js executable
      let nodeExecutable = 'node'
      try {
        const { stdout } = await execAsync('where node')
        nodeExecutable = stdout.trim().split('\n')[0]
      } catch (error: any) {
        // Try common Node.js paths
        const commonPaths = [
          path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node.exe')
        ]
        for (const nodePath of commonPaths) {
          if (fs.existsSync(nodePath)) {
            nodeExecutable = nodePath
            break
          }
        }
      }

      const username = os.userInfo().username
      const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME || ''
      const fullUsername = domain ? `${domain}\\${username}` : username
      
      let xmlContent = fs.readFileSync(this.serviceTemplate, 'utf8')
      const helperScriptPath = path.join(helperDir, 'liquidb-helper.js')
      xmlContent = xmlContent
        .replaceAll('NODE_EXECUTABLE_PATH', nodeExecutable)
        .replaceAll('HELPER_SCRIPT_PATH', helperScriptPath)
        .replaceAll('USER_NAME', fullUsername)
        .replaceAll('HELPER_DIRECTORY', helperDir)
        .replaceAll('LOG_FILE_PATH', logFile)

      // Write XML to temp file (Windows Task Scheduler requires UTF-16LE encoding with BOM)
      const tempXmlPath = path.join(helperDir, 'task.xml')
      // Convert UTF-8 string to UTF-16LE with BOM
      // Use iconv-lite or native Buffer conversion
      const bom = Buffer.from([0xFF, 0xFE])
      // Convert string to UTF-16LE buffer
      const utf16Buffer = Buffer.from(xmlContent, 'ucs2')
      const finalBuffer = Buffer.concat([bom, utf16Buffer])
      fs.writeFileSync(tempXmlPath, finalBuffer)
      
      // Import task using schtasks
      try {
        await execAsync(`schtasks /Create /TN "${this.servicePath}" /XML "${tempXmlPath}" /F`)
        console.log('[Helper] Task Scheduler task created')
      } catch (error: any) {
        console.error('[Helper] Failed to create task:', error)
        throw error
      } finally {
        // Clean up temp file
        if (fs.existsSync(tempXmlPath)) {
          fs.unlinkSync(tempXmlPath)
        }
      }
      
      console.log('[Helper] Service installed successfully (Windows)')
      return true
    } catch (error: any) {
      console.error('[Helper] Installation failed (Windows):', error)
      return false
    } finally {
      this.isInstalling = false
    }
  }

  private async startServiceWindows(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`schtasks /Run /TN "${this.servicePath}"`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  private async stopServiceWindows(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec(`schtasks /End /TN "${this.servicePath}"`, (error: ExecException | null, stdout: string, stderr: string) => {
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

  // ==================== Linux Methods ====================

  private isInstalledLinux(): boolean {
    return fs.existsSync(this.servicePath)
  }

  private async isServiceRunningLinux(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('systemctl --user is-active com.liquidb.helper.service')
      return stdout.trim() === 'active'
    } catch (error: any) {
      return false
    }
  }

  private async installLinux(): Promise<boolean> {
    try {
      if (this.isInstalling) {
        console.log('[Helper] Installation already in progress, skipping...')
        return true
      }
      
      this.isInstalling = true
      console.log('[Helper] Installing helper service (Linux)...')
      
      const systemdUserDir = path.join(os.homedir(), '.config', 'systemd', 'user')
      if (!fs.existsSync(systemdUserDir)) {
        fs.mkdirSync(systemdUserDir, { recursive: true })
      }
      
      const configDir = path.join(os.homedir(), '.config', 'LiquiDB')
      const helperDir = path.join(configDir, 'helper')
      const logDir = path.join(os.homedir(), '.local', 'share', 'LiquiDB', 'logs')
      const logFile = path.join(logDir, 'helper.log')
      
      if (!fs.existsSync(helperDir)) {
        fs.mkdirSync(helperDir, { recursive: true })
      }
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      
      const helperFiles = ['liquidb-helper.js', 'ipc-client.js']
      const sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath!, 'helper')
        : path.join(__dirname, '..', 'helper-dist')
      
      for (const fileName of helperFiles) {
        const sourceFile = path.join(sourceDir, fileName)
        const targetFile = path.join(helperDir, fileName)
        if (fs.existsSync(sourceFile)) {
          let shouldCopy = false
          if (!fs.existsSync(targetFile)) {
            shouldCopy = true
          } else {
            const sourceStats = fs.statSync(sourceFile)
            const targetStats = fs.statSync(targetFile)
            if (sourceStats.mtime > targetStats.mtime) {
              shouldCopy = true
            }
          }
          
          if (shouldCopy) {
            fs.copyFileSync(sourceFile, targetFile)
          }
        }
      }
      
      // Find Node.js executable
      let nodeExecutable = 'node'
      try {
        const { stdout } = await execAsync('which node')
        nodeExecutable = stdout.trim()
      } catch (error: any) {
        // Try common paths
        const commonPaths = ['/usr/bin/node', '/usr/local/bin/node', '/opt/homebrew/bin/node']
        for (const nodePath of commonPaths) {
          if (fs.existsSync(nodePath)) {
            nodeExecutable = nodePath
            break
          }
        }
      }

      let serviceContent = fs.readFileSync(this.serviceTemplate, 'utf8')
      const helperScriptPath = path.join(helperDir, 'liquidb-helper.js')
      // Escape paths for systemd (paths with spaces need to be quoted)
      const escapedNodePath = nodeExecutable.includes(' ') ? `"${nodeExecutable}"` : nodeExecutable
      const escapedScriptPath = helperScriptPath.includes(' ') ? `"${helperScriptPath}"` : helperScriptPath
      serviceContent = serviceContent
        .replaceAll('NODE_EXECUTABLE_PATH', escapedNodePath)
        .replaceAll('HELPER_SCRIPT_PATH', escapedScriptPath)
        .replaceAll('HELPER_DIRECTORY', helperDir)
        .replaceAll('LOG_FILE_PATH', logFile)

      fs.writeFileSync(this.servicePath, serviceContent)
      
      // Reload systemd and enable service
      await execAsync('systemctl --user daemon-reload')
      await execAsync('systemctl --user enable com.liquidb.helper.service')
      
      console.log('[Helper] Service installed successfully (Linux)')
      return true
    } catch (error: any) {
      console.error('[Helper] Installation failed (Linux):', error)
      return false
    } finally {
      this.isInstalling = false
    }
  }

  private async startServiceLinux(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec('systemctl --user start com.liquidb.helper.service', (error: ExecException | null, stdout: string, stderr: string) => {
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

  private async stopServiceLinux(): Promise<void> {
    return new Promise((resolve, reject) => {
      exec('systemctl --user stop com.liquidb.helper.service', (error: ExecException | null, stdout: string, stderr: string) => {
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

  // ==================== Helper Methods (Platform-Agnostic) ====================

  async requestCleanup(): Promise<CleanupResult> {
    try {
      const isRunning = await this.isServiceRunning()
      if (!isRunning) {
        console.log('[Helper] Service not running, performing direct cleanup')
        return await this.performDirectCleanup()
      }

      const helperPath = this.app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'ipc-client.js')
        : path.join(__dirname, '..', 'helper-dist', 'ipc-client.js')
      const HelperClient = require(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.requestCleanup()
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Cleanup request failed:', error)
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('socket not found')) {
        console.log('[Helper] Socket unavailable, performing direct cleanup')
        return await this.performDirectCleanup()
      }
      
      return { success: false, error: error.message }
    }
  }

  async checkPort(port: number): Promise<PortCheckResult> {
    try {
      const isRunning = await this.isServiceRunning()
      if (!isRunning) {
        return await this.performDirectPortCheck(port)
      }

      const helperPath = this.app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'ipc-client.js')
        : path.join(__dirname, '..', 'helper-dist', 'ipc-client.js')
      const HelperClient = require(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.checkPort(port)
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Port check failed:', error)
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('socket not found')) {
        return await this.performDirectPortCheck(port)
      }
      
      return { success: false, error: error.message }
    }
  }

  async findPort(startPort: number = 3000, maxAttempts: number = 100): Promise<PortFindResult> {
    try {
      const isRunning = await this.isServiceRunning()
      if (!isRunning) {
        return await this.performDirectPortFind(startPort, maxAttempts)
      }

      const helperPath = this.app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'ipc-client.js')
        : path.join(__dirname, '..', 'helper-dist', 'ipc-client.js')
      const HelperClient = require(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.findPort(startPort, maxAttempts)
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Find port failed:', error)
      
      if (error.message.includes('ECONNREFUSED') || error.message.includes('socket not found')) {
        return await this.performDirectPortFind(startPort, maxAttempts)
      }
      
      return { success: false, error: error.message }
    }
  }

  async performDirectCleanup(): Promise<CleanupResult> {
    try {
      console.log('[Helper] Performing direct cleanup of orphaned processes')
      
      const helperPath = this.app.isPackaged
        ? path.join(process.resourcesPath!, 'helper', 'liquidb-helper.js')
        : path.join(__dirname, '..', 'helper-dist', 'liquidb-helper.js')
      const helper = require(helperPath)
      
      const cleanedCount = await helper.cleanupOrphanedProcesses()
      
      return {
        success: true,
        data: {
          cleanedCount,
          method: 'direct',
          timestamp: Date.now()
        }
      }
    } catch (error: any) {
      console.error('[Helper] Direct cleanup failed:', error)
      return { 
        success: false, 
        error: error.message,
        method: 'direct'
      }
    }
  }

  async performDirectPortCheck(port: number): Promise<PortCheckResult> {
    try {
      const net = require('net')
      
      return new Promise((resolve) => {
        const server = net.createServer()
        
        server.listen(port, '127.0.0.1', () => {
          server.close(() => {
            resolve({
              success: true,
              data: {
                port: port,
                available: true,
                reason: null,
                method: 'direct'
              }
            })
          })
        })
        
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            resolve({
              success: true,
              data: {
                port: port,
                available: false,
                reason: 'in_use',
                method: 'direct'
              }
            })
          } else {
            resolve({
              success: true,
              data: {
                port: port,
                available: true,
                reason: null,
                method: 'direct'
              }
            })
          }
        })
      })
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        method: 'direct'
      }
    }
  }

  async performDirectPortFind(startPort: number, maxAttempts: number): Promise<PortFindResult> {
    try {
      for (let port = startPort; port < startPort + maxAttempts; port++) {
        const result = await this.performDirectPortCheck(port)
        if (result.success && result.data?.available) {
          return {
            success: true,
            data: {
              suggestedPort: port,
              startPort: startPort,
              method: 'direct'
            }
          }
        }
      }
      
      return {
        success: false,
        error: 'No available ports found',
        method: 'direct'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        method: 'direct'
      }
    }
  }
}

export { HelperServiceManager }
