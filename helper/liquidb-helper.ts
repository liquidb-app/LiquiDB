#!/usr/bin/env node

/**
 * LiquiDB Helper Service - Focused Database Monitor
 * 
 * This service has two core responsibilities:
 * 1. Monitor for orphaned database processes that belong to LiquiDB
 * 2. Monitor port conflicts and provide port availability information
 */

import * as fs from 'fs'
import * as path from 'path'
import { exec, ExecException } from 'child_process'
import { promisify } from 'util'
import * as net from 'net'
import * as os from 'os'

const execAsync = promisify(exec)

// Configuration
interface Config {
  CHECK_INTERVAL: number
  APP_DATA_DIR: string
  DATABASE_TYPES: { [key: string]: string }
  LOG_FILE: string
  SOCKET_PATH: string
}

const CONFIG: Config = {
  // Check interval in milliseconds (2 minutes for more responsive monitoring)
  CHECK_INTERVAL: 2 * 60 * 1000,
  
  // App data directory
  APP_DATA_DIR: path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB'),
  
  // Database types and their process names
  DATABASE_TYPES: {
    mysql: 'mysqld',
    postgresql: 'postgres',
    mongodb: 'mongod',
    redis: 'redis-server'
  },
  
  // Log file
  LOG_FILE: path.join(os.homedir(), 'Library', 'Logs', 'LiquiDB', 'helper.log'),
  
  // Socket path for IPC communication
  SOCKET_PATH: path.join(os.homedir(), 'Library', 'Application Support', 'LiquiDB', 'helper.sock')
}

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE)
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Logging function
function log(message: string, level: string = 'INFO'): void {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}\n`
  
  console.log(logMessage.trim())
  
  // Write to log file
  fs.appendFileSync(CONFIG.LOG_FILE, logMessage)
}

interface DatabaseConfig {
  id?: string
  name?: string
  type?: string
  port?: number
  status?: string
  pid?: number | null
  [key: string]: any
}

interface DatabaseProcess {
  pid: number
  type: string
  command: string
  port: number | null
}

interface ProcessInfo {
  processName: string
  pid: string
}

interface PortCheckResult {
  available: boolean
  reason: string | null
  processInfo: ProcessInfo | null
}

interface PortConflict {
  database: DatabaseConfig
  port: number
  conflict: ProcessInfo | null
  suggestedPort: number | null
}

// Load database configurations from storage
function loadDatabaseConfigs(): DatabaseConfig[] {
  try {
    const configFile = path.join(CONFIG.APP_DATA_DIR, 'databases.json')
    if (!fs.existsSync(configFile)) {
      return []
    }
    
    const data = fs.readFileSync(configFile, 'utf8')
    return JSON.parse(data)
  } catch (error: any) {
    log(`Error loading database configs: ${error.message}`, 'ERROR')
    return []
  }
}

// Get all running database processes
async function getRunningDatabaseProcesses(): Promise<DatabaseProcess[]> {
  const processes: DatabaseProcess[] = []
  
  for (const [dbType, processName] of Object.entries(CONFIG.DATABASE_TYPES)) {
    try {
      const { stdout } = await execAsync(`pgrep -f "${processName}"`) as { stdout: string }
      const pids = stdout.trim().split('\n').filter(pid => pid.length > 0)
      
      for (const pid of pids) {
        try {
          // Get process details
          const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o pid,ppid,command`) as { stdout: string }
          const lines = psOutput.trim().split('\n')
          if (lines.length > 1) {
            const parts = lines[1].trim().split(/\s+/)
            const command = parts.slice(2).join(' ')
            
            // Extract port from command if possible
            const portMatch = command.match(/--port\s+(\d+)|-p\s+(\d+)|:(\d+)/)
            const port = portMatch ? (portMatch[1] || portMatch[2] || portMatch[3]) : null
            
            processes.push({
              pid: parseInt(pid),
              type: dbType,
              command,
              port: port ? parseInt(port) : null
            })
          }
        } catch (_e) {
          // Process might have died between pgrep and ps
        }
      }
    } catch (_e) {
      // No processes found for this type
    }
  }
  
  return processes
}

// Check if the main LiquiDB app is running
async function isMainAppRunning(): Promise<boolean> {
  try {
    // Check for Electron processes running LiquiDB
    // Look for processes matching "Electron" that have LiquiDB in their path
    const { stdout } = await execAsync('ps aux | grep -i "[E]lectron.*[Ll]iquidb\|[Ll]iquidb.*[E]lectron" || true') as { stdout: string }
    const processes = stdout.trim().split('\n').filter(line => {
      // Filter out grep itself and helper processes
      return line.length > 0 && 
             !line.includes('grep') && 
             !line.includes('liquidb-helper') &&
             (line.includes('Electron') || line.includes('LiquiDB'))
    })
    
    // Also check for standalone LiquiDB.app processes
    if (processes.length === 0) {
      try {
        const { stdout: appStdout } = await execAsync('pgrep -fl "LiquiDB.app/Contents" || true') as { stdout: string }
        const appProcesses = appStdout.trim().split('\n').filter(line => 
          line.length > 0 && !line.includes('liquidb-helper')
        )
        if (appProcesses.length > 0) {
          return true
        }
      } catch (_e) {
        // Ignore errors in this check
      }
    }
    
    return processes.length > 0
  } catch (_error) {
    // If check fails, assume app is not running (safer to clean up orphans)
    return false
  }
}

// Check if a process is legitimate (matches a known database config)
// This now also checks if the main app is running - if not, all processes are orphaned
async function isLegitimateProcess(
  process: DatabaseProcess,
  configs: DatabaseConfig[],
  mainAppRunning: boolean
): Promise<boolean> {
  // If main app is not running, all processes are orphaned
  if (!mainAppRunning) {
    return false
  }
  
  return configs.some(config => {
    // Check if process type matches
    if (config.type !== process.type) return false
    
    // Check if port matches (if we can determine it)
    if (process.port && config.port !== process.port) return false
    
    // Check if process is marked as running in config
    if (config.status === 'running' || config.status === 'starting') return true
    
    // Additional check: if process has a PID that matches the stored PID
    if (config.pid && config.pid === process.pid) return true
    
    return false
  })
}

// Kill a process
async function killProcess(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    await execAsync(`kill -s ${signal} ${pid}`)
    log(`Killed process ${pid} with ${signal}`)
    return true
  } catch (error: any) {
    log(`Failed to kill process ${pid}: ${error.message}`, 'ERROR')
    return false
  }
}

// Clean up orphaned processes
export async function cleanupOrphanedProcesses(): Promise<number> {
  log('Starting orphaned process cleanup...')
  
  // First check if main app is running
  const mainAppRunning = await isMainAppRunning()
  log(`Main LiquiDB app is ${mainAppRunning ? 'running' : 'not running'}`)
  
  const runningProcesses = await getRunningDatabaseProcesses()
  const databaseConfigs = loadDatabaseConfigs()
  
  log(`Found ${runningProcesses.length} running database processes`)
  log(`Found ${databaseConfigs.length} database configurations`)
  
  // If main app is not running, mark all LiquiDB-owned processes as orphaned
  if (!mainAppRunning && runningProcesses.length > 0) {
    log('Main app is not running - all LiquiDB-owned database processes will be considered orphaned', 'WARN')
  }
  
  let cleanedCount = 0
  
  // Get app data directory to verify processes belong to our app
  const appDataDir = CONFIG.APP_DATA_DIR // ~/Library/Application Support/LiquiDB
  const databasesDir = path.join(appDataDir, 'databases')
  
  for (const process of runningProcesses) {
    // Verify this process belongs to our app by checking its command line
    let belongsToApp = false
    let command = ''
    try {
      const { stdout: psOutput } = await execAsync(`ps -p ${process.pid} -o command=`) as { stdout: string }
      command = psOutput.trim()
      
      // Check if command line contains our app's data directory or databases dir
      // This ensures we only kill processes that belong to LiquiDB-managed instances
      belongsToApp = command.includes(appDataDir) || command.includes(databasesDir)
      
      if (!belongsToApp) {
        log(`Process ${process.pid} (${process.type}) does not appear to belong to LiquiDB (cmd: ${command.substring(0, 200)}), skipping`)
        continue
      }
    } catch (error: any) {
      // Could not verify process - skip it to be safe
      log(`Could not verify process ${process.pid} belongs to LiquiDB, skipping: ${error.message}`, 'WARN')
      continue
    }
    
    // At this point, we know the process belongs to LiquiDB-managed data dirs
    // If the main app is not running, treat it as orphaned regardless of databases.json
    let isLegitimate = false
    if (mainAppRunning) {
      isLegitimate = await isLegitimateProcess(process, databaseConfigs, mainAppRunning)
    }
    
    if (!mainAppRunning || !isLegitimate) {
      const reason = !mainAppRunning
        ? 'main app is not running'
        : 'not matching any known database config / status'
      
      log(`Found orphaned LiquiDB ${process.type} process (PID: ${process.pid}, Port: ${process.port || 'unknown'}) - ${reason}`)
      
      // Try SIGTERM first, then SIGKILL if needed
      const killed = await killProcess(process.pid, 'SIGTERM')
      if (killed) {
        cleanedCount++
        
        // Wait a moment and check if it's still running
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        try {
          await execAsync(`ps -p ${process.pid}`)
          // Still running, force kill
          log(`Process ${process.pid} still running after SIGTERM, force killing with SIGKILL...`)
          await killProcess(process.pid, 'SIGKILL')
        } catch (_e) {
          // Process is dead, good
        }
      } else {
        log(`Failed to kill process ${process.pid} with SIGTERM, trying SIGKILL...`)
        await killProcess(process.pid, 'SIGKILL')
        cleanedCount++
      }
    } else {
      log(`LiquiDB process ${process.pid} is legitimate (${process.type} on port ${process.port || 'unknown'}) - leaving it running`)
    }
  }
  
  log(`Cleanup complete: removed ${cleanedCount} orphaned LiquiDB database processes`)
  return cleanedCount
}

// Check if a port is available
export async function checkPortAvailability(port: number): Promise<PortCheckResult> {
  // Validate port number
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { available: false, reason: 'invalid_port', processInfo: null }
  }
  
  // Check if port is privileged (requires root)
  if (port < 1024) {
    return { available: false, reason: 'privileged_port', processInfo: null }
  }
  
  return new Promise((resolve) => {
    const server = net.createServer()
    
    // Set timeout to prevent hanging
    const timeout = setTimeout(() => {
      server.close()
      resolve({ available: false, reason: 'timeout', processInfo: null })
    }, 5000)
    
    server.listen(port, '127.0.0.1', () => {
      clearTimeout(timeout)
      // Port is available
      server.close(() => {
        resolve({ available: true, reason: null, processInfo: null })
      })
    })
    
    server.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === 'EADDRINUSE') {
        // Port is in use, get process info
        getProcessUsingPort(port).then(processInfo => {
          resolve({ 
            available: false, 
            reason: 'in_use',
            processInfo: processInfo || { processName: 'Unknown', pid: 'Unknown' }
          })
        })
      } else {
        // Other error, assume port is available
        resolve({ available: true, reason: null, processInfo: null })
      }
    })
  })
}

// Get process information for a port
async function getProcessUsingPort(port: number): Promise<ProcessInfo | null> {
  return new Promise((resolve) => {
    exec(`lsof -i :${port}`, (error: ExecException | null, stdout: string, _stderr: string) => {
      if (error || !stdout.trim()) {
        resolve(null)
        return
      }
      
      const lines = stdout.trim().split('\n')
      if (lines.length > 1) {
        // Skip header line, get first process
        const processLine = lines[1]
        const parts = processLine.split(/\s+/)
        if (parts.length >= 2) {
          const processName = parts[0]
          const pid = parts[1]
          resolve({ processName, pid })
        }
      }
      resolve(null)
    })
  })
}

// Find next available port starting from a given port
export async function findNextAvailablePort(startPort: number, maxAttempts: number = 100): Promise<number | null> {
  // Skip privileged ports (1-1023)
  if (startPort < 1024) {
    startPort = 1024
  }
  
  // Skip well-known ports that are commonly used
  const skipPorts = [3000, 3001, 3306, 5432, 6379, 27017, 8080, 8000, 9000]
  
  for (let port = startPort; port < startPort + maxAttempts; port++) {
    // Skip well-known ports
    if (skipPorts.includes(port)) {
      continue
    }
    
    const result = await checkPortAvailability(port)
    if (result.available) {
      return port
    }
  }
  return null
}

// Check for port conflicts and suggest alternatives
export async function checkPortConflicts(): Promise<PortConflict[]> {
  log('Checking for port conflicts...')
  
  const databaseConfigs = loadDatabaseConfigs()
  const conflicts: PortConflict[] = []
  
  for (const config of databaseConfigs) {
    if (config.status === 'running' || config.status === 'starting') {
      const portCheck = await checkPortAvailability(config.port || 0)
      if (!portCheck.available) {
        const suggestedPort = await findNextAvailablePort((config.port || 0) + 1)
        conflicts.push({
          database: config,
          port: config.port || 0,
          conflict: portCheck.processInfo,
          suggestedPort: suggestedPort
        })
        log(`Port conflict detected for ${config.name} on port ${config.port}`, 'WARN')
      }
    }
  }
  
  if (conflicts.length > 0) {
    log(`Found ${conflicts.length} port conflicts`)
    // Save conflicts to a file for the main app to read
    const conflictsFile = path.join(CONFIG.APP_DATA_DIR, 'port-conflicts.json')
    fs.writeFileSync(conflictsFile, JSON.stringify(conflicts, null, 2))
  }
  
  return conflicts
}

// Update database statuses in storage
export async function updateDatabaseStatuses(): Promise<void> {
  log('Updating database statuses...')
  
  const databaseConfigs = loadDatabaseConfigs()
  const runningProcesses = await getRunningDatabaseProcesses()
  
  let updatedCount = 0
  
  for (const config of databaseConfigs) {
    const isRunning = runningProcesses.some(process => 
      process.type === config.type && 
      process.port === config.port &&
      isLegitimateProcess(process, [config], true)
    )
    
    const shouldBeRunning = config.status === 'running' || config.status === 'starting'
    
    if (isRunning && !shouldBeRunning) {
      // Process is running but config says it shouldn't be
      log(`Updating ${config.name} status to running (PID found)`)
      config.status = 'running'
      // Find the PID
      const process = runningProcesses.find(p => 
        p.type === config.type && p.port === config.port
      )
      if (process) {
        config.pid = process.pid
      }
      updatedCount++
    } else if (!isRunning && shouldBeRunning) {
      // Process should be running but isn't
      log(`Updating ${config.name} status to stopped (no PID found)`)
      config.status = 'stopped'
      config.pid = null
      updatedCount++
    }
  }
  
  if (updatedCount > 0) {
    try {
      const configFile = path.join(CONFIG.APP_DATA_DIR, 'databases.json')
      fs.writeFileSync(configFile, JSON.stringify(databaseConfigs, null, 2))
      log(`Updated ${updatedCount} database statuses in storage`)
    } catch (error: any) {
      log(`Error updating database statuses: ${error.message}`, 'ERROR')
    }
  }
}

// Main monitoring loop
export async function monitor(): Promise<void> {
  try {
    log('LiquiDB Helper starting monitoring cycle...')
    
    // Clean up orphaned processes
    await cleanupOrphanedProcesses()
    
    // Check for port conflicts
    await checkPortConflicts()
    
    // Update database statuses
    await updateDatabaseStatuses()
    
    log('Monitoring cycle complete')
  } catch (error: any) {
    log(`Error in monitoring cycle: ${error.message}`, 'ERROR')
  }
}

// IPC Server for communication with main app
function startIPCServer(): net.Server {
  const server = net.createServer((socket) => {
    log('Client connected to helper IPC')
    
    socket.on('data', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        handleIPCMessage(message, socket)
      } catch (error: any) {
        log('Error parsing IPC message:', error)
        socket.write(JSON.stringify({ error: 'Invalid JSON' }))
      }
    })
    
    socket.on('close', () => {
      log('Client disconnected from helper IPC')
    })
    
    socket.on('error', (error: Error) => {
      log(`Socket error: ${error.message}`, 'ERROR')
    })
  })
  
  // Ensure socket directory exists
  const socketDir = path.dirname(CONFIG.SOCKET_PATH)
  if (!fs.existsSync(socketDir)) {
    fs.mkdirSync(socketDir, { recursive: true })
  }
  
  // Remove existing socket file
  if (fs.existsSync(CONFIG.SOCKET_PATH)) {
    fs.unlinkSync(CONFIG.SOCKET_PATH)
  }
  
  server.listen(CONFIG.SOCKET_PATH, () => {
    log(`Helper IPC server listening on ${CONFIG.SOCKET_PATH}`)
    
    // Set socket permissions
    try {
      fs.chmodSync(CONFIG.SOCKET_PATH, 0o666)
    } catch (error: any) {
      log(`Failed to set socket permissions: ${error.message}`, 'ERROR')
    }
  })
  
  server.on('error', (error: Error) => {
    log(`IPC Server error: ${error.message}`, 'ERROR')
  })
  
  return server
}

interface IPCMessage {
  type: string
  data?: any
}

// Handle IPC messages
function handleIPCMessage(message: IPCMessage, socket: net.Socket): void {
  const { type, data } = message
  
  switch (type) {
    case 'status':
      handleStatusRequest(socket)
      break
      
    case 'cleanup':
      handleCleanupRequest(socket)
      break
      
    case 'check-port':
      handlePortCheckRequest(socket, data)
      break
      
    case 'find-port':
      handleFindPortRequest(socket, data)
      break
      
    case 'ping':
      socket.write(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
      break
      
    default:
      socket.write(JSON.stringify({ error: 'Unknown message type' }))
  }
}

// Handle status request
function handleStatusRequest(socket: net.Socket): void {
  const status = {
    type: 'status_response',
    data: {
      running: true,
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: Date.now()
    }
  }
  
  socket.write(JSON.stringify(status))
}

// Handle cleanup request
async function handleCleanupRequest(socket: net.Socket): Promise<void> {
  try {
    const result = await cleanupOrphanedProcesses()
    
    socket.write(JSON.stringify({
      type: 'cleanup_response',
      data: {
        success: true,
        cleanedCount: result,
        timestamp: Date.now()
      }
    }))
  } catch (error: any) {
    socket.write(JSON.stringify({
      type: 'cleanup_response',
      data: {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }))
  }
}

// Handle port check request
async function handlePortCheckRequest(socket: net.Socket, data: any): Promise<void> {
  try {
    const port = data.port
    const result = await checkPortAvailability(port)
    
    socket.write(JSON.stringify({
      type: 'port_check_response',
      data: {
        success: true,
        port: port,
        available: result.available,
        reason: result.reason,
        processInfo: result.processInfo,
        timestamp: Date.now()
      }
    }))
  } catch (error: any) {
    socket.write(JSON.stringify({
      type: 'port_check_response',
      data: {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }))
  }
}

// Handle find port request
async function handleFindPortRequest(socket: net.Socket, data: any): Promise<void> {
  try {
    const startPort = data.startPort || 3000
    const maxAttempts = data.maxAttempts || 100
    const suggestedPort = await findNextAvailablePort(startPort, maxAttempts)
    
    socket.write(JSON.stringify({
      type: 'find_port_response',
      data: {
        success: true,
        suggestedPort: suggestedPort,
        startPort: startPort,
        timestamp: Date.now()
      }
    }))
  } catch (error: any) {
    socket.write(JSON.stringify({
      type: 'find_port_response',
      data: {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }))
  }
}

// Signal handlers for graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully...')
  process.exit(0)
})

// Start the service
log('LiquiDB Helper started')
log('Core responsibilities:')
log('  1. Monitor orphaned database processes')
log('  2. Monitor port conflicts and suggest alternatives')

// Start IPC server
startIPCServer()

// Start monitoring
monitor()

// Set up interval
setInterval(monitor, CONFIG.CHECK_INTERVAL)

// Keep the process alive
process.on('uncaughtException', (error: Error) => {
  log(`Uncaught exception: ${error.message}`, 'ERROR')
  // Don't exit, keep running
})

process.on('unhandledRejection', (reason: any, _promise: Promise<any>) => {
  log(`Unhandled rejection: ${reason}`, 'ERROR')
  // Don't exit, keep running
})

