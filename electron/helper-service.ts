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

      // Check if template file exists, try alternative paths if needed
      let templatePath = this.serviceTemplate
      if (!fs.existsSync(templatePath)) {
        // Try alternative paths for packaged app
        if (this.app.isPackaged) {
          // Try app.asar.unpacked location (where electron-builder unpacks files)
          const unpackedPath = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper', 'com.liquidb.helper.plist')
          if (fs.existsSync(unpackedPath)) {
            templatePath = unpackedPath
            console.log(`[Helper] Found template at unpacked location: ${templatePath}`)
          } else {
            // Try direct resources path
            const directPath = path.join(process.resourcesPath!, 'com.liquidb.helper.plist')
            if (fs.existsSync(directPath)) {
              templatePath = directPath
              console.log(`[Helper] Found template at direct path: ${templatePath}`)
            } else {
              // Try app path (for development builds)
              const appPath = this.app.getAppPath()
              const appPathTemplate = path.join(appPath, '..', 'helper', 'com.liquidb.helper.plist')
              if (fs.existsSync(appPathTemplate)) {
                templatePath = appPathTemplate
                console.log(`[Helper] Found template at app path: ${templatePath}`)
              } else {
                const errorMsg = `Service template file not found. Tried: ${this.serviceTemplate}, ${unpackedPath}, ${directPath}, ${appPathTemplate}`
                console.error(`[Helper] ${errorMsg}`)
                throw new Error(errorMsg)
              }
            }
          }
        } else {
          const errorMsg = `Service template file not found: ${this.serviceTemplate}`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }

      let plistContent = fs.readFileSync(templatePath, 'utf8')
      
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
      
      // Always try multiple paths for packaged apps to handle different electron-builder configurations
      let sourceDir: string | null = null
      const possiblePaths: string[] = []
      
      if (this.app.isPackaged) {
        // Get app path and check if it's in asar
        const appPath = this.app.getAppPath()
        console.log(`[Helper] App path: ${appPath}`)
        console.log(`[Helper] Resources path: ${process.resourcesPath}`)
        
        // If appPath is in asar, try unpacked location first (most common)
        if (appPath.endsWith('.asar')) {
          const unpackedBase = appPath.replace('.asar', '.asar.unpacked')
          possiblePaths.push(
            path.join(unpackedBase, 'helper-dist'),  // Most likely location
            path.join(unpackedBase, 'helper')
          )
        }
        
        // Try app.asar.unpacked relative to resources path
        possiblePaths.push(
          path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper-dist'),
          path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper'),
          path.join(process.resourcesPath!, 'helper-dist'),
          path.join(process.resourcesPath!, 'helper')
        )
      } else {
        // Development: use helper-dist
        possiblePaths.push(path.join(__dirname, '..', 'helper-dist'))
      }
      
      // Try each path
      for (const tryPath of possiblePaths) {
        console.log(`[Helper] Trying path: ${tryPath}`)
        if (fs.existsSync(tryPath)) {
          sourceDir = tryPath
          console.log(`[Helper] Found helper source directory at: ${sourceDir}`)
          break
        }
      }
      
      if (!sourceDir) {
        const errorMsg = `Helper source directory not found. Tried: ${possiblePaths.join(', ')}`
        console.error(`[Helper] ${errorMsg}`)
        throw new Error(errorMsg)
      }
      
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
            console.log(`[Helper] Copied ${fileName} to ${targetFile}`)
          }
        } else {
          console.warn(`[Helper] Source file not found: ${sourceFile}`)
        }
      }
      
      // Verify helper script exists
      const helperScriptPath = path.join(helperDir, 'liquidb-helper.js')
      if (!fs.existsSync(helperScriptPath)) {
        const errorMsg = `Helper script not found after copy: ${helperScriptPath}`
        console.error(`[Helper] ${errorMsg}`)
        throw new Error(errorMsg)
      }
      
      // Find Node.js executable
      let nodeExecutable = '/usr/local/bin/node'
      if (!fs.existsSync(nodeExecutable)) {
        nodeExecutable = '/opt/homebrew/bin/node'
        if (!fs.existsSync(nodeExecutable)) {
          nodeExecutable = '/usr/bin/node'
          if (!fs.existsSync(nodeExecutable)) {
            // Try to find node in PATH
            try {
              const { stdout } = await execAsync('which node')
              const nodePath = stdout.trim()
              if (nodePath && fs.existsSync(nodePath)) {
                nodeExecutable = nodePath
                console.log(`[Helper] Found Node.js via which: ${nodeExecutable}`)
              } else {
                throw new Error('Node.js executable not found')
              }
            } catch (error: any) {
              const errorMsg = 'Node.js executable not found. Please install Node.js.'
              console.error(`[Helper] ${errorMsg}`)
              throw new Error(errorMsg)
            }
          }
        }
      }
      
      console.log(`[Helper] Using Node.js executable: ${nodeExecutable}`)

      const username = os.userInfo().username
      const groupname = os.userInfo().username
      
      plistContent = plistContent
        .replaceAll('NODE_EXECUTABLE_PATH', nodeExecutable)
        .replaceAll('HELPER_SCRIPT_PATH', helperScriptPath)
        .replaceAll('USER_NAME', username)
        .replaceAll('GROUP_NAME', groupname)
        .replaceAll('LOG_FILE_PATH', logFile)
        .replaceAll('HELPER_DIRECTORY', helperDir)

      // Unload existing service if it exists
      try {
        await this.unloadService()
      } catch (error: any) {
        console.log('[Helper] Service not loaded or unload failed (continuing):', error.message)
      }

      // Write plist file
      fs.writeFileSync(this.servicePath, plistContent)
      console.log(`[Helper] Plist file written to: ${this.servicePath}`)
      
      // Load the service
      try {
        await this.loadService()
        console.log('[Helper] Service loaded successfully')
      } catch (error: any) {
        console.error('[Helper] Failed to load service:', error)
        throw new Error(`Failed to load service: ${error.message}`)
      }
      
      console.log('[Helper] Service installed successfully (macOS)')
      return true
    } catch (error: any) {
      console.error('[Helper] Installation failed (macOS):', error)
      const errorMessage = error.message || 'Unknown error occurred'
      throw new Error(`Failed to install helper service: ${errorMessage}`)
    } finally {
      this.isInstalling = false
    }
  }

  private async loadService(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Try modern bootstrap command first (macOS Big Sur+)
      // For user LaunchAgents, we use the user domain
      const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid
      exec(`launchctl bootstrap gui/${uid} "${this.servicePath}"`, (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          // If bootstrap fails, check if it's because service is already loaded
          if (error.message.includes('already exists') || error.message.includes('already loaded') || stderr.includes('already exists')) {
            console.log('[Helper] Service already loaded')
            resolve()
            return
          }
          
          // If bootstrap fails, try the deprecated load command for older macOS versions
          console.log('[Helper] Bootstrap failed, trying legacy load command...')
          exec(`launchctl load "${this.servicePath}"`, (legacyError: ExecException | null, legacyStdout: string, legacyStderr: string) => {
            if (legacyError && !legacyError.message.includes('already loaded') && !legacyStderr.includes('already loaded')) {
              console.error('[Helper] Failed to load service (both methods):', legacyStderr || stderr)
              reject(new Error(`Failed to load service: ${legacyStderr || stderr || legacyError.message}`))
            } else {
              console.log('[Helper] Service loaded (legacy method)')
              resolve()
            }
          })
        } else {
          console.log('[Helper] Service loaded (bootstrap method)')
          resolve()
        }
      })
    })
  }

  private async unloadService(): Promise<void> {
    return new Promise((resolve, reject) => {
      const serviceLabel = 'com.liquidb.helper'
      // Try modern bootout command first (macOS Big Sur+)
      const uid = typeof process.getuid === 'function' ? process.getuid() : os.userInfo().uid
      exec(`launchctl bootout gui/${uid}/${serviceLabel}`, (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          // If bootout fails, try the deprecated unload command
          console.log('[Helper] Bootout failed, trying legacy unload command...')
          exec(`launchctl unload "${this.servicePath}"`, (legacyError: ExecException | null, legacyStdout: string, legacyStderr: string) => {
            if (legacyError && !legacyError.message.includes('not loaded') && !legacyStderr.includes('not loaded')) {
              // If both fail, it might already be unloaded, which is fine
              console.log('[Helper] Service may already be unloaded')
              resolve()
            } else {
              console.log('[Helper] Service unloaded (legacy method)')
              resolve()
            }
          })
        } else {
          console.log('[Helper] Service unloaded (bootout method)')
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
      
      // Pre-installation checks
      console.log('[Helper] Performing pre-installation checks...')
      
      // Check admin privileges (Task Scheduler operations may require admin)
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkAdminPrivileges && typeof platformImpl.checkAdminPrivileges === 'function') {
          const hasAdmin = await platformImpl.checkAdminPrivileges()
          if (!hasAdmin) {
            console.warn('[Helper] Warning: Not running with admin privileges. Task Scheduler operations may fail.')
            console.warn('[Helper] If installation fails, try running LiquiDB as administrator.')
          } else {
            console.log('[Helper] ✓ Running with admin privileges')
          }
        }
      } catch (error: any) {
        console.warn(`[Helper] Warning: Could not check admin privileges: ${error.message}`)
      }
      
      // Check Task Scheduler service status
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkTaskSchedulerService && typeof platformImpl.checkTaskSchedulerService === 'function') {
          const schedulerCheck = await platformImpl.checkTaskSchedulerService()
          if (!schedulerCheck.running) {
            const errorMsg = `Task Scheduler service is not running: ${schedulerCheck.error || 'Service unavailable'}. Please start the Task Scheduler service.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
          console.log('[Helper] ✓ Task Scheduler service is running')
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Task Scheduler service')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify Task Scheduler service: ${error.message || 'Unknown error'}`)
      }
      
      // Check system command availability
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkSystemCommandAvailability) {
          const cmdCheck = await platformImpl.checkSystemCommandAvailability()
          if (!cmdCheck.available) {
            const errorMsg = `Required system commands are missing: ${cmdCheck.missing.join(', ')}. Please install them.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
          console.log('[Helper] ✓ Required system commands are available')
        }
      } catch (error: any) {
        if (error.message.includes('Required system commands')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify system commands: ${error.message}`)
      }
      
      // Check named pipe permissions
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkNamedPipePermissions && typeof platformImpl.checkNamedPipePermissions === 'function') {
          const pipeCheck = await platformImpl.checkNamedPipePermissions()
          if (!pipeCheck.writable) {
            const errorMsg = `Cannot create named pipes: ${pipeCheck.error || 'Permission denied'}. Please check permissions.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
          console.log('[Helper] ✓ Named pipe permissions are correct')
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Cannot create named pipes')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify named pipe permissions: ${error.message || 'Unknown error'}`)
      }
      
      const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      const appDataDir = path.join(appDataPath, 'LiquiDB')
      const helperDir = path.join(appDataDir, 'helper')
      const logDir = path.join(appDataPath, '..', 'Local', 'LiquiDB', 'Logs')
      const logFile = path.join(logDir, 'helper.log')
      
      try {
        if (!fs.existsSync(helperDir)) {
          fs.mkdirSync(helperDir, { recursive: true })
          console.log(`[Helper] Created helper directory: ${helperDir}`)
        }
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true })
          console.log(`[Helper] Created log directory: ${logDir}`)
        }
      } catch (error: any) {
        const errorMsg = `Cannot create directories: ${error.message}. Please check permissions.`
        console.error(`[Helper] ${errorMsg}`)
        throw new Error(errorMsg)
      }
      
      const helperFiles = ['liquidb-helper.js', 'ipc-client.js']
      let sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath!, 'helper')
        : path.join(__dirname, '..', 'helper-dist')
      
      // Verify source directory exists, try alternative paths if needed
      if (!fs.existsSync(sourceDir)) {
        if (this.app.isPackaged) {
          const unpackedDir = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper')
          if (fs.existsSync(unpackedDir)) {
            sourceDir = unpackedDir
            console.log(`[Helper] Found Windows helper source directory at unpacked location: ${sourceDir}`)
          } else {
            const unpackedDistDir = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper-dist')
            if (fs.existsSync(unpackedDistDir)) {
              sourceDir = unpackedDistDir
              console.log(`[Helper] Found Windows helper source directory at unpacked dist location: ${sourceDir}`)
            } else {
              const directDir = path.join(process.resourcesPath!, 'helper-dist')
              if (fs.existsSync(directDir)) {
                sourceDir = directDir
                console.log(`[Helper] Found Windows helper source directory at direct path: ${sourceDir}`)
              } else {
                const errorMsg = `Windows helper source directory not found. Tried: ${path.join(process.resourcesPath!, 'helper')}, ${unpackedDir}, ${unpackedDistDir}, ${directDir}`
                console.error(`[Helper] ${errorMsg}`)
                throw new Error(errorMsg)
              }
            }
          }
        } else {
          const errorMsg = `Windows helper source directory not found: ${sourceDir}`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }
      
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
        const nodePath = stdout.trim().split('\n')[0]
        if (nodePath && fs.existsSync(nodePath)) {
          nodeExecutable = nodePath
          console.log('[Helper] Found Node.js via where command:', nodeExecutable)
        }
      } catch (error: any) {
        console.log('[Helper] where node failed, trying common paths...')
        // Try common Node.js paths
        const commonPaths = [
          path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
          path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node.exe'),
          path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'nodejs', 'node.exe')
        ]
        for (const nodePath of commonPaths) {
          if (fs.existsSync(nodePath)) {
            nodeExecutable = nodePath
            console.log('[Helper] Found Node.js at common path:', nodeExecutable)
            break
          }
        }
      }
      
      // Verify Node.js executable exists
      if (nodeExecutable !== 'node' && !fs.existsSync(nodeExecutable)) {
        console.warn('[Helper] Node.js path does not exist:', nodeExecutable, '- will try using "node" command')
        nodeExecutable = 'node'
      }
      
      console.log('[Helper] Using Node.js executable:', nodeExecutable)

      const username = os.userInfo().username
      const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME || ''
      const fullUsername = domain ? `${domain}\\${username}` : username
      
      // Check if template file exists, try alternative paths if needed
      let templatePath = this.serviceTemplate
      if (!fs.existsSync(templatePath)) {
        if (this.app.isPackaged) {
          const unpackedPath = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper', 'com.liquidb.helper.windows.xml')
          if (fs.existsSync(unpackedPath)) {
            templatePath = unpackedPath
            console.log(`[Helper] Found Windows template at unpacked location: ${templatePath}`)
          } else {
            const directPath = path.join(process.resourcesPath!, 'com.liquidb.helper.windows.xml')
            if (fs.existsSync(directPath)) {
              templatePath = directPath
              console.log(`[Helper] Found Windows template at direct path: ${templatePath}`)
            } else {
              const errorMsg = `Windows service template file not found. Tried: ${this.serviceTemplate}, ${unpackedPath}, ${directPath}`
              console.error(`[Helper] ${errorMsg}`)
              throw new Error(errorMsg)
            }
          }
        } else {
          const errorMsg = `Windows service template file not found: ${this.serviceTemplate}`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }
      
      let xmlContent = fs.readFileSync(templatePath, 'utf8')
      const helperScriptPath = path.join(helperDir, 'liquidb-helper.js')
      
      // Windows Task Scheduler XML - paths should be as-is (backslashes are fine)
      // Only escape XML special characters if needed, but paths typically don't need escaping
      // For paths with spaces in Arguments, we need to quote them
      const nodePath = nodeExecutable
      const scriptPath = helperScriptPath.includes(' ') 
        ? `"${helperScriptPath}"` 
        : helperScriptPath
      const workDir = helperDir
      const logPath = logFile
      
      xmlContent = xmlContent
        .replaceAll('NODE_EXECUTABLE_PATH', nodePath)
        .replaceAll('HELPER_SCRIPT_PATH', scriptPath)
        .replaceAll('HELPER_DIRECTORY', workDir)
        .replaceAll('LOG_FILE_PATH', logPath)

      console.log('[Helper] XML content prepared, node:', nodeExecutable)
      console.log('[Helper] Script path:', helperScriptPath)
      console.log('[Helper] Working directory:', helperDir)

      // Write XML to temp file (Windows Task Scheduler requires UTF-16LE encoding with BOM)
      const tempXmlPath = path.join(helperDir, 'task.xml')
      
      // Properly convert UTF-8 to UTF-16LE with BOM
      // Node.js doesn't have direct utf16le encoding, so we need to convert manually
      const bom = Buffer.from([0xFF, 0xFE])
      const utf16Buffer = Buffer.allocUnsafe(xmlContent.length * 2)
      for (let i = 0; i < xmlContent.length; i++) {
        const charCode = xmlContent.charCodeAt(i)
        utf16Buffer[i * 2] = charCode & 0xFF
        utf16Buffer[i * 2 + 1] = (charCode >> 8) & 0xFF
      }
      const finalBuffer = Buffer.concat([bom, utf16Buffer])
      fs.writeFileSync(tempXmlPath, finalBuffer)
      
      console.log('[Helper] XML file written to:', tempXmlPath)
      console.log('[Helper] XML file size:', finalBuffer.length, 'bytes')
      
      // Verify the XML file exists and is readable
      if (!fs.existsSync(tempXmlPath)) {
        throw new Error('Failed to create XML file for Task Scheduler')
      }
      
      // Import task using schtasks
      try {
        // Escape the XML path for the command line (handle spaces)
        const escapedXmlPath = tempXmlPath.includes(' ') ? `"${tempXmlPath}"` : tempXmlPath
        const command = `schtasks /Create /TN "${this.servicePath}" /XML ${escapedXmlPath} /F`
        console.log('[Helper] Executing command:', command)
        
        const { stdout, stderr } = await execAsync(command, {
          maxBuffer: 1024 * 1024, // 1MB buffer
          timeout: 30000 // 30 second timeout
        })
        
        if (stdout) console.log('[Helper] Task creation output:', stdout)
        if (stderr && !stderr.includes('SUCCESS')) {
          console.warn('[Helper] Task creation stderr:', stderr)
        }
        
        // Validate task was created successfully
        try {
          const { stdout: queryStdout } = await execAsync(`schtasks /Query /TN "${this.servicePath}" /FO LIST`, { timeout: 5000 }) as { stdout: string }
          if (queryStdout.includes(this.servicePath)) {
            console.log('[Helper] ✓ Task Scheduler task created and verified')
          } else {
            throw new Error('Task created but not found in Task Scheduler')
          }
        } catch (verifyError: any) {
          console.warn(`[Helper] Warning: Could not verify task creation: ${verifyError.message}`)
        }
      } catch (error: any) {
        console.error('[Helper] Failed to create task:', error)
        console.error('[Helper] Error message:', error.message)
        if (error.stdout) console.error('[Helper] Error stdout:', error.stdout)
        if (error.stderr) console.error('[Helper] Error stderr:', error.stderr)
        
        // Try to get more details about the error
        let errorMessage = error.message || 'Unknown error'
        if (error.stderr) {
          errorMessage = error.stderr.toString()
        } else if (error.stdout) {
          errorMessage = error.stdout.toString()
        }
        
        // Check if task already exists
        if (errorMessage.includes('already exists') || errorMessage.includes('ERROR: The task already exists')) {
          console.log('[Helper] Task already exists, attempting to delete and recreate...')
          try {
            await execAsync(`schtasks /Delete /TN "${this.servicePath}" /F`, { timeout: 10000 })
            console.log('[Helper] Deleted existing task')
            
            const escapedXmlPath = tempXmlPath.includes(' ') ? `"${tempXmlPath}"` : tempXmlPath
            await execAsync(`schtasks /Create /TN "${this.servicePath}" /XML ${escapedXmlPath} /F`, {
              maxBuffer: 1024 * 1024,
              timeout: 30000
            })
            console.log('[Helper] ✓ Task recreated successfully')
            
            // Verify recreated task
            try {
              const { stdout: queryStdout } = await execAsync(`schtasks /Query /TN "${this.servicePath}" /FO LIST`, { timeout: 5000 }) as { stdout: string }
              if (!queryStdout.includes(this.servicePath)) {
                throw new Error('Task recreated but not found in Task Scheduler')
              }
            } catch (verifyError: any) {
              console.warn(`[Helper] Warning: Could not verify task recreation: ${verifyError.message}`)
            }
          } catch (retryError: any) {
            const retryErrorMessage = retryError.message || retryError.stderr || 'Unknown error'
            const errorMsg = `Failed to recreate Windows Task Scheduler task: ${retryErrorMessage}. Please check permissions and try running as administrator.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
        } else {
          // Provide helpful error message
          let userFriendlyError = errorMessage
          if (errorMessage.includes('Access is denied') || errorMessage.includes('denied')) {
            userFriendlyError = 'Access denied. Please run LiquiDB as administrator to install the helper service.'
          } else if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
            userFriendlyError = 'Task Scheduler service not found. Please ensure Task Scheduler service is running.'
          }
          throw new Error(`Failed to create Windows Task Scheduler task: ${userFriendlyError}`)
        }
      } finally {
        // Clean up temp file after a delay to ensure it's been read
        setTimeout(() => {
          if (fs.existsSync(tempXmlPath)) {
            try {
              fs.unlinkSync(tempXmlPath)
              console.log('[Helper] Cleaned up temporary XML file')
            } catch (e) {
              // Ignore cleanup errors
              console.warn('[Helper] Failed to clean up temp file:', e)
            }
          }
        }, 5000) // Increased delay to 5 seconds
      }
      
      console.log('[Helper] Service installed successfully (Windows)')
      return true
    } catch (error: any) {
      console.error('[Helper] Installation failed (Windows):', error)
      const errorMessage = error.message || 'Unknown error occurred'
      throw new Error(`Failed to install helper service: ${errorMessage}`)
    } finally {
      this.isInstalling = false
    }
  }

  private async startServiceWindows(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Start the service
        exec(`schtasks /Run /TN "${this.servicePath}"`, { timeout: 10000 }, async (error: ExecException | null, stdout: string, stderr: string) => {
          if (error) {
            console.error('[Helper] Failed to start service:', stderr || error.message)
            reject(error)
            return
          }
          
          // Verify service actually started
          try {
            await new Promise(resolve => setTimeout(resolve, 2000)) // Wait a moment for service to start
            
            const isRunning = await this.isServiceRunningWindows()
            if (isRunning) {
              console.log('[Helper] Service started and verified')
              resolve()
            } else {
              // Check task status for more details
              try {
                const { stdout: statusStdout } = await execAsync(`schtasks /Query /TN "${this.servicePath}" /FO LIST /V`, { timeout: 5000 }) as { stdout: string }
                console.warn('[Helper] Service start command succeeded but service is not running:')
                console.warn(statusStdout)
                reject(new Error('Service start command succeeded but service is not running. Check Task Scheduler for details.'))
              } catch (statusError: any) {
                reject(new Error('Service start command succeeded but service is not running'))
              }
            }
          } catch (verifyError: any) {
            console.warn('[Helper] Could not verify service status:', verifyError.message)
            // Assume success if we can't verify
            console.log('[Helper] Service started (status verification failed)')
            resolve()
          }
        })
      } catch (error: any) {
        reject(error)
      }
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
      
      // Pre-installation checks
      console.log('[Helper] Performing pre-installation checks...')
      
      // Check if systemd user services are enabled
      try {
        const { stdout, stderr } = await execAsync('systemctl --user list-units --type=service --no-pager 2>&1', { timeout: 5000 }) as { stdout: string, stderr: string }
        if (stdout.includes('Failed to connect to bus') || stderr.includes('Failed to connect to bus') || 
            stdout.includes('permission denied') || stderr.includes('permission denied')) {
          const errorMsg = 'systemd user services are not enabled. Please enable them by running: systemctl --user enable --now systemd-user-session.service'
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
        console.log('[Helper] ✓ systemd user services are enabled')
      } catch (error: any) {
        if (error.message.includes('systemd user services')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify systemd user services: ${error.message}`)
      }
      
      // Check system command availability
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkSystemCommandAvailability && typeof platformImpl.checkSystemCommandAvailability === 'function') {
          const cmdCheck = await platformImpl.checkSystemCommandAvailability()
          if (!cmdCheck.available) {
            const errorMsg = `Required system commands are missing: ${cmdCheck.missing.join(', ')}. Please install them.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
          console.log('[Helper] ✓ Required system commands are available')
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Required system commands')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify system commands: ${error.message || 'Unknown error'}`)
      }
      
      // Check socket directory permissions
      try {
        const platformImpl = require('../helper/platform')
        if (platformImpl && platformImpl.checkSocketPermissions && typeof platformImpl.checkSocketPermissions === 'function') {
          const socketCheck = await platformImpl.checkSocketPermissions()
          if (!socketCheck.writable) {
            const errorMsg = `Cannot write to socket directory: ${socketCheck.error || 'Permission denied'}. Please check directory permissions.`
            console.error(`[Helper] ${errorMsg}`)
            throw new Error(errorMsg)
          }
          console.log('[Helper] ✓ Socket directory permissions are correct')
        }
      } catch (error: any) {
        if (error.message && error.message.includes('Cannot write to socket directory')) {
          throw error
        }
        console.warn(`[Helper] Warning: Could not verify socket permissions: ${error.message || 'Unknown error'}`)
      }
      
      const systemdUserDir = path.join(os.homedir(), '.config', 'systemd', 'user')
      if (!fs.existsSync(systemdUserDir)) {
        try {
          fs.mkdirSync(systemdUserDir, { recursive: true, mode: 0o755 })
          console.log(`[Helper] Created systemd user directory: ${systemdUserDir}`)
        } catch (error: any) {
          const errorMsg = `Cannot create systemd user directory: ${error.message}. Please check permissions.`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      } else {
        // Verify write permissions
        try {
          await fs.promises.access(systemdUserDir, fs.constants.W_OK)
        } catch (error: any) {
          const errorMsg = `Cannot write to systemd user directory: ${error.message}. Please check permissions.`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
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
      let sourceDir = this.app.isPackaged 
        ? path.join(process.resourcesPath!, 'helper')
        : path.join(__dirname, '..', 'helper-dist')
      
      // Verify source directory exists, try alternative paths if needed
      if (!fs.existsSync(sourceDir)) {
        if (this.app.isPackaged) {
          const unpackedDir = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper')
          if (fs.existsSync(unpackedDir)) {
            sourceDir = unpackedDir
            console.log(`[Helper] Found Linux helper source directory at unpacked location: ${sourceDir}`)
          } else {
            const unpackedDistDir = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper-dist')
            if (fs.existsSync(unpackedDistDir)) {
              sourceDir = unpackedDistDir
              console.log(`[Helper] Found Linux helper source directory at unpacked dist location: ${sourceDir}`)
            } else {
              const directDir = path.join(process.resourcesPath!, 'helper-dist')
              if (fs.existsSync(directDir)) {
                sourceDir = directDir
                console.log(`[Helper] Found Linux helper source directory at direct path: ${sourceDir}`)
              } else {
                const errorMsg = `Linux helper source directory not found. Tried: ${path.join(process.resourcesPath!, 'helper')}, ${unpackedDir}, ${unpackedDistDir}, ${directDir}`
                console.error(`[Helper] ${errorMsg}`)
                throw new Error(errorMsg)
              }
            }
          }
        } else {
          const errorMsg = `Linux helper source directory not found: ${sourceDir}`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }
      
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

      // Check if template file exists, try alternative paths if needed
      let templatePath = this.serviceTemplate
      if (!fs.existsSync(templatePath)) {
        if (this.app.isPackaged) {
          const unpackedPath = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper', 'com.liquidb.helper.service')
          if (fs.existsSync(unpackedPath)) {
            templatePath = unpackedPath
            console.log(`[Helper] Found Linux template at unpacked location: ${templatePath}`)
          } else {
            const directPath = path.join(process.resourcesPath!, 'com.liquidb.helper.service')
            if (fs.existsSync(directPath)) {
              templatePath = directPath
              console.log(`[Helper] Found Linux template at direct path: ${templatePath}`)
            } else {
              const errorMsg = `Linux service template file not found. Tried: ${this.serviceTemplate}, ${unpackedPath}, ${directPath}`
              console.error(`[Helper] ${errorMsg}`)
              throw new Error(errorMsg)
            }
          }
        } else {
          const errorMsg = `Linux service template file not found: ${this.serviceTemplate}`
          console.error(`[Helper] ${errorMsg}`)
          throw new Error(errorMsg)
        }
      }
      
      let serviceContent = fs.readFileSync(templatePath, 'utf8')
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
