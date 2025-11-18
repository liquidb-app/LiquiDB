/**
 * LiquiDB Helper Service Manager
 * 
 * macOS helper service manager
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
    

    if (app.isPackaged) {
      this.helperPath = path.join(process.resourcesPath!, 'helper', 'liquidb-helper.js')
    } else {
      this.helperPath = path.join(__dirname, '..', 'helper-dist', 'liquidb-helper.js')
    }
    
    // macOS-specific paths
    if (!IS_MAC) {
      throw new Error(`Unsupported platform: ${PLATFORM}. Only macOS is supported.`)
    }
    
    this.servicePath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.liquidb.helper.plist')
    this.serviceTemplate = app.isPackaged
      ? path.join(process.resourcesPath!, 'helper', 'com.liquidb.helper.plist')
      : path.join(__dirname, '..', 'helper', 'com.liquidb.helper.plist')
  }

  // ==================== Platform-Agnostic Methods ====================

  isInstalled(): boolean {
    return this.isInstalledMac()
  }

  async isServiceRunning(): Promise<boolean> {
    return await this.isServiceRunningMac()
  }

  async install(): Promise<boolean> {
    return await this.installMac()
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

        try {
          await this.loadService()
        } catch (error: any) {
          console.log('[Helper] Service already loaded or load failed:', error.message)
        }
      }


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
    return await this.startServiceMac()
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
    return await this.stopServiceMac()
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
      
      await this.unloadService()
      if (fs.existsSync(this.servicePath)) {
        fs.unlinkSync(this.servicePath)
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
      

      const helperScriptPath = path.join(helperDir, 'liquidb-helper.js')
      if (!fs.existsSync(helperScriptPath)) {
        const errorMsg = `Helper script not found after copy: ${helperScriptPath}`
        console.error(`[Helper] ${errorMsg}`)
        throw new Error(errorMsg)
      }
      

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


      fs.writeFileSync(this.servicePath, plistContent)
      console.log(`[Helper] Plist file written to: ${this.servicePath}`)
      

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

          if (error.message.includes('already exists') || error.message.includes('already loaded') || stderr.includes('already exists')) {
            console.log('[Helper] Service already loaded')
            resolve()
            return
          }
          

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

  // ==================== Helper Methods (Platform-Agnostic) ====================

  /**
   * Resolve the path to a helper file (ipc-client.js or liquidb-helper.js)
   * Checks Application Support directory first (where files are copied during installation),
   * then falls back to resources path for packaged apps
   */
  private resolveHelperFilePath(fileName: string): string {
    if (this.app.isPackaged) {
      // First, check Application Support directory (where files are copied during installation)
      const appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB')
      const helperDir = path.join(appDataDir, 'helper')
      const appSupportPath = path.join(helperDir, fileName)
      
      if (fs.existsSync(appSupportPath)) {
        console.log(`[Helper] Found ${fileName} at Application Support: ${appSupportPath}`)
        return appSupportPath
      }
      
      // Fallback to resources path
      const resourcesPath = path.join(process.resourcesPath!, 'helper', fileName)
      if (fs.existsSync(resourcesPath)) {
        console.log(`[Helper] Found ${fileName} at resources path: ${resourcesPath}`)
        return resourcesPath
      }
      
      // Try unpacked location
      const unpackedPath = path.join(process.resourcesPath!, 'app.asar.unpacked', 'helper-dist', fileName)
      if (fs.existsSync(unpackedPath)) {
        console.log(`[Helper] Found ${fileName} at unpacked path: ${unpackedPath}`)
        return unpackedPath
      }
      
      // Last resort: return Application Support path (will fail with clear error)
      console.warn(`[Helper] ${fileName} not found in any expected location, using Application Support path`)
      return appSupportPath
    } else {
      // Development: use helper-dist
      return path.join(__dirname, '..', 'helper-dist', fileName)
    }
  }

  /**
   * Load HelperClient class from the compiled ipc-client.js file
   * Handles both CommonJS exports (HelperClient.HelperClient or HelperClient.default)
   */
  private loadHelperClient(helperPath: string): any {
    const module = require(helperPath)
    
    // Handle CommonJS exports: exports.HelperClient or exports.default
    if (module.HelperClient && typeof module.HelperClient === 'function') {
      return module.HelperClient
    }
    
    // Handle default export
    if (module.default && typeof module.default === 'function') {
      return module.default
    }
    
    // If module itself is a constructor (shouldn't happen, but handle it)
    if (typeof module === 'function') {
      return module
    }
    
    throw new Error(`HelperClient class not found in module. Available exports: ${Object.keys(module).join(', ')}`)
  }

  async requestCleanup(): Promise<CleanupResult> {
    try {
      const isRunning = await this.isServiceRunning()
      if (!isRunning) {
        console.log('[Helper] Service not running, performing direct cleanup')
        return await this.performDirectCleanup()
      }

      const helperPath = this.resolveHelperFilePath('ipc-client.js')
      
      // Check if file exists before requiring
      if (!fs.existsSync(helperPath)) {
        console.warn(`[Helper] IPC client not found at ${helperPath}, performing direct cleanup`)
        return await this.performDirectCleanup()
      }
      
      const HelperClient = this.loadHelperClient(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.requestCleanup()
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Cleanup request failed:', error)
      
      // Handle module not found, constructor errors, or connection errors - fall back to direct cleanup
      if (
        error.message.includes('Cannot find module') ||
        error.message.includes('is not a constructor') ||
        error.message.includes('HelperClient class not found') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('socket not found') ||
        error.code === 'MODULE_NOT_FOUND'
      ) {
        console.log('[Helper] IPC client unavailable, performing direct cleanup')
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

      const helperPath = this.resolveHelperFilePath('ipc-client.js')
      
      // Check if file exists before requiring
      if (!fs.existsSync(helperPath)) {
        console.warn(`[Helper] IPC client not found at ${helperPath}, performing direct port check`)
        return await this.performDirectPortCheck(port)
      }
      
      const HelperClient = this.loadHelperClient(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.checkPort(port)
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Port check failed:', error)
      
      // Handle module not found, constructor errors, or connection errors - fall back to direct check
      if (
        error.message.includes('Cannot find module') ||
        error.message.includes('is not a constructor') ||
        error.message.includes('HelperClient class not found') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('socket not found') ||
        error.code === 'MODULE_NOT_FOUND'
      ) {
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

      const helperPath = this.resolveHelperFilePath('ipc-client.js')
      
      // Check if file exists before requiring
      if (!fs.existsSync(helperPath)) {
        console.warn(`[Helper] IPC client not found at ${helperPath}, performing direct port find`)
        return await this.performDirectPortFind(startPort, maxAttempts)
      }
      
      const HelperClient = this.loadHelperClient(helperPath)
      const client = new HelperClient()
      
      await client.connect()
      const result = await client.findPort(startPort, maxAttempts)
      client.disconnect()
      
      return result
    } catch (error: any) {
      console.error('[Helper] Port find failed:', error)
      
      // Handle module not found, constructor errors, or connection errors - fall back to direct find
      if (
        error.message.includes('Cannot find module') ||
        error.message.includes('is not a constructor') ||
        error.message.includes('HelperClient class not found') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('socket not found') ||
        error.code === 'MODULE_NOT_FOUND'
      ) {
        return await this.performDirectPortFind(startPort, maxAttempts)
      }
      
      return { success: false, error: error.message }
    }
  }

  async performDirectCleanup(): Promise<CleanupResult> {
    try {
      console.log('[Helper] Performing direct cleanup of orphaned processes')
      
      const helperPath = this.resolveHelperFilePath('liquidb-helper.js')
      
      // Check if file exists before requiring
      if (!fs.existsSync(helperPath)) {
        const errorMsg = `Helper script not found at ${helperPath}. Please reinstall the helper service.`
        console.error(`[Helper] ${errorMsg}`)
        return { 
          success: false, 
          error: errorMsg,
          method: 'direct'
        }
      }
      
      const helper = require(helperPath)
      
      // Check if the cleanup function exists
      if (typeof helper.cleanupOrphanedProcesses !== 'function') {
        const errorMsg = `Helper script at ${helperPath} does not export cleanupOrphanedProcesses function`
        console.error(`[Helper] ${errorMsg}`)
        return { 
          success: false, 
          error: errorMsg,
          method: 'direct'
        }
      }
      
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
      
      // Handle module not found errors with helpful message
      if (error.message.includes('Cannot find module') || error.code === 'MODULE_NOT_FOUND') {
        const errorMsg = `Helper script not found. Please reinstall the helper service. Original error: ${error.message}`
        return { 
          success: false, 
          error: errorMsg,
          method: 'direct'
        }
      }
      
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

export default HelperServiceManager
