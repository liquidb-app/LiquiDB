#!/usr/bin/env node

/**
 * LiquiDB Helper - Background Process Monitor
 * 
 * This process runs independently of the main LiquiDB app to:
 * - Monitor for orphaned database processes
 * - Clean up processes that should be stopped
 * - Detect and resolve port conflicts
 * - Log database process crashes and status changes
 */

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Configuration
const CONFIG = {
  // Check interval in milliseconds (5 minutes)
  CHECK_INTERVAL: 5 * 60 * 1000,
  
  // App data directory
  APP_DATA_DIR: path.join(require('os').homedir(), 'Library', 'Application Support', 'LiquiDB'),
  
  // Database types and their process names
  DATABASE_TYPES: {
    mysql: 'mysqld',
    postgresql: 'postgres',
    mongodb: 'mongod',
    redis: 'redis-server'
  },
  
  // Log file
  LOG_FILE: path.join(require('os').homedir(), 'Library', 'Logs', 'LiquiDB', 'helper.log')
}

// Ensure log directory exists
const logDir = path.dirname(CONFIG.LOG_FILE)
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Logging function
function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] [${level}] ${message}\n`
  
  console.log(logMessage.trim())
  
  // Write to log file
  fs.appendFileSync(CONFIG.LOG_FILE, logMessage)
}

// Get all running database processes
async function getRunningDatabaseProcesses() {
  const processes = []
  
  for (const [dbType, processName] of Object.entries(CONFIG.DATABASE_TYPES)) {
    try {
      const { stdout } = await execAsync(`pgrep -f "${processName}"`)
      const pids = stdout.trim().split('\n').filter(pid => pid.length > 0)
      
      for (const pid of pids) {
        try {
          // Get process details
          const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o pid,ppid,command`)
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
        } catch (e) {
          // Process might have died between pgrep and ps
        }
      }
    } catch (e) {
      // No processes found for this type
    }
  }
  
  return processes
}

// Load database configurations from storage
function loadDatabaseConfigs() {
  try {
    const configFile = path.join(CONFIG.APP_DATA_DIR, 'databases.json')
    if (!fs.existsSync(configFile)) {
      return []
    }
    
    const data = fs.readFileSync(configFile, 'utf8')
    return JSON.parse(data)
  } catch (error) {
    log(`Error loading database configs: ${error.message}`, 'ERROR')
    return []
  }
}

// Check if a process is legitimate (matches a known database config)
function isLegitimateProcess(process, configs) {
  return configs.some(config => {
    // Check if process type matches
    if (config.type !== process.type) return false
    
    // Check if port matches (if we can determine it)
    if (process.port && config.port !== process.port) return false
    
    // Check if process is marked as running in config
    if (config.status === 'running' || config.status === 'starting') return true
    
    return false
  })
}

// Kill a process
async function killProcess(pid, signal = 'SIGTERM') {
  try {
    await execAsync(`kill -s ${signal} ${pid}`)
    log(`Killed process ${pid} with ${signal}`)
    return true
  } catch (error) {
    log(`Failed to kill process ${pid}: ${error.message}`, 'ERROR')
    return false
  }
}

// Clean up orphaned processes
async function cleanupOrphanedProcesses() {
  log('Starting orphaned process cleanup...')
  
  const runningProcesses = await getRunningDatabaseProcesses()
  const databaseConfigs = loadDatabaseConfigs()
  
  log(`Found ${runningProcesses.length} running database processes`)
  log(`Found ${databaseConfigs.length} database configurations`)
  
  let cleanedCount = 0
  
  for (const process of runningProcesses) {
    const isLegitimate = isLegitimateProcess(process, databaseConfigs)
    
    if (!isLegitimate) {
      log(`Found orphaned ${process.type} process (PID: ${process.pid}, Port: ${process.port || 'unknown'})`)
      
      // Try SIGTERM first, then SIGKILL if needed
      const killed = await killProcess(process.pid, 'SIGTERM')
      if (killed) {
        cleanedCount++
        
        // Wait a moment and check if it's still running
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        try {
          await execAsync(`ps -p ${process.pid}`)
          // Still running, force kill
          log(`Process ${process.pid} still running, force killing...`)
          await killProcess(process.pid, 'SIGKILL')
        } catch (e) {
          // Process is dead, good
        }
      }
    } else {
      log(`Process ${process.pid} is legitimate (${process.type} on port ${process.port || 'unknown'})`)
    }
  }
  
  log(`Cleanup complete: removed ${cleanedCount} orphaned processes`)
  return cleanedCount
}

// Check for port conflicts
async function checkPortConflicts() {
  log('Checking for port conflicts...')
  
  const databaseConfigs = loadDatabaseConfigs()
  const runningProcesses = await getRunningDatabaseProcesses()
  
  // Group processes by port
  const portMap = new Map()
  for (const process of runningProcesses) {
    if (process.port) {
      if (!portMap.has(process.port)) {
        portMap.set(process.port, [])
      }
      portMap.get(process.port).push(process)
    }
  }
  
  // Check for conflicts
  for (const [port, processes] of portMap) {
    if (processes.length > 1) {
      log(`Port conflict detected on port ${port}: ${processes.length} processes`, 'WARN')
      
      // Find the legitimate process
      const legitimateProcesses = processes.filter(p => isLegitimateProcess(p, databaseConfigs))
      const orphanedProcesses = processes.filter(p => !isLegitimateProcess(p, databaseConfigs))
      
      if (legitimateProcesses.length > 0 && orphanedProcesses.length > 0) {
        log(`Killing ${orphanedProcesses.length} orphaned processes on port ${port}`)
        for (const process of orphanedProcesses) {
          await killProcess(process.pid)
        }
      }
    }
  }
}

// Update database statuses in storage
async function updateDatabaseStatuses() {
  log('Updating database statuses...')
  
  const databaseConfigs = loadDatabaseConfigs()
  const runningProcesses = await getRunningDatabaseProcesses()
  
  let updatedCount = 0
  
  for (const config of databaseConfigs) {
    const isRunning = runningProcesses.some(process => 
      process.type === config.type && 
      process.port === config.port &&
      isLegitimateProcess(process, [config])
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
    } catch (error) {
      log(`Error updating database statuses: ${error.message}`, 'ERROR')
    }
  }
}

// Main monitoring loop
async function monitor() {
  try {
    log('LiquiDB Helper starting monitoring cycle...')
    
    // Clean up orphaned processes
    await cleanupOrphanedProcesses()
    
    // Check for port conflicts
    await checkPortConflicts()
    
    // Update database statuses
    await updateDatabaseStatuses()
    
    log('Monitoring cycle complete')
  } catch (error) {
    log(`Error in monitoring cycle: ${error.message}`, 'ERROR')
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

// Export functions for IPC server
module.exports = {
  cleanupOrphanedProcesses,
  checkPortConflicts,
  updateDatabaseStatuses,
  monitor
}

// Start monitoring
log('LiquiDB Helper started')
monitor()

// Set up interval
setInterval(monitor, CONFIG.CHECK_INTERVAL)

// Start IPC server in the same process
if (!process.env.IPC_SERVER_STARTED) {
  try {
    require('./ipc-server.js')
    process.env.IPC_SERVER_STARTED = 'true'
    log('IPC server started in same process')
  } catch (error) {
    log(`Failed to start IPC server: ${error.message}`, 'ERROR')
  }
}

// Keep the process alive
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}`, 'ERROR')
  // Don't exit, keep running
})

process.on('unhandledRejection', (reason, promise) => {
  log(`Unhandled rejection: ${reason}`, 'ERROR')
  // Don't exit, keep running
})
