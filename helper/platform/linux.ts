/**
 * Linux Platform-Specific Implementation
 * 
 * Uses Linux-specific commands (pgrep, lsof, ps) and paths
 * following XDG Base Directory specification
 * 
 * Includes comprehensive error handling, permission checks, and fallback mechanisms
 */

import * as fs from 'fs'
import * as path from 'path'
import { exec, ExecException } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'

const execAsync = promisify(exec)

export interface DatabaseProcess {
  pid: number
  type: string
  command: string
  port: number | null
}

export interface ProcessInfo {
  processName: string
  pid: string
}

// Cache for command availability checks
const commandCache: Map<string, boolean> = new Map()

/**
 * Check if a command exists and is executable
 */
async function checkCommandExists(command: string): Promise<boolean> {
  if (commandCache.has(command)) {
    return commandCache.get(command)!
  }
  
  try {
    const { stdout } = await execAsync(`which ${command}`)
    const exists = stdout.trim().length > 0
    commandCache.set(command, exists)
    return exists
  } catch (error) {
    commandCache.set(command, false)
    return false
  }
}

/**
 * Get process info from /proc filesystem (fallback method)
 */
async function getProcessInfoFromProc(pid: number): Promise<{ command: string; uid: number | null } | null> {
  try {
    const cmdlinePath = `/proc/${pid}/cmdline`
    const statusPath = `/proc/${pid}/status`
    
    if (!fs.existsSync(cmdlinePath) || !fs.existsSync(statusPath)) {
      return null
    }
    
    // Read command line (null-separated)
    const cmdline = fs.readFileSync(cmdlinePath, 'utf8')
    const command = cmdline.split('\0').filter(s => s.length > 0).join(' ')
    
    // Read status to get UID
    const status = fs.readFileSync(statusPath, 'utf8')
    const uidMatch = status.match(/^Uid:\s+(\d+)/m)
    const uid = uidMatch ? parseInt(uidMatch[1]) : null
    
    return { command, uid }
  } catch (error) {
    return null
  }
}

/**
 * Verify process ownership before operations
 */
async function verifyProcessOwnership(pid: number): Promise<boolean> {
  try {
    const currentUid = process.getuid ? process.getuid() : os.userInfo().uid
    const procInfo = await getProcessInfoFromProc(pid)
    
    if (!procInfo || procInfo.uid === null) {
      // If we can't determine ownership, assume we can't access it
      return false
    }
    
    // Allow if process belongs to current user
    return procInfo.uid === currentUid
  } catch (error) {
    return false
  }
}

/**
 * Get the application data directory for Linux (XDG Base Directory)
 */
export function getAppDataDir(): string {
  // Follow XDG Base Directory specification
  const xdgConfigHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(xdgConfigHome, 'LiquiDB')
}

/**
 * Get the log directory for Linux (XDG Base Directory)
 */
export function getLogDir(): string {
  // Follow XDG Base Directory specification
  const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share')
  return path.join(xdgDataHome, 'LiquiDB', 'logs')
}

/**
 * Get the IPC socket path for Linux (Unix domain socket)
 */
export function getSocketPath(): string {
  return path.join(getAppDataDir(), 'helper.sock')
}

/**
 * Check socket directory permissions
 */
async function checkSocketDirectoryPermissions(): Promise<{ writable: boolean; error?: string }> {
  const socketDir = path.dirname(getSocketPath())
  
  try {
    // Ensure directory exists
    if (!fs.existsSync(socketDir)) {
      try {
        fs.mkdirSync(socketDir, { recursive: true, mode: 0o755 })
      } catch (error: any) {
        return { writable: false, error: `Cannot create socket directory: ${error.message}` }
      }
    }
    
    // Check write permissions
    await fs.promises.access(socketDir, fs.constants.W_OK)
    
    // Try to create a test file to verify write access
    const testFile = path.join(socketDir, '.test-write')
    try {
      fs.writeFileSync(testFile, 'test')
      fs.unlinkSync(testFile)
      return { writable: true }
    } catch (error: any) {
      return { writable: false, error: `Cannot write to socket directory: ${error.message}` }
    }
  } catch (error: any) {
    return { writable: false, error: `Socket directory access check failed: ${error.message}` }
  }
}

/**
 * Get all running database processes using Linux commands with fallbacks
 */
export async function getRunningDatabaseProcesses(
  databaseTypes: { [key: string]: string }
): Promise<DatabaseProcess[]> {
  const processes: DatabaseProcess[] = []
  
  // Check if pgrep is available
  const hasPgrep = await checkCommandExists('pgrep')
  if (!hasPgrep) {
    console.warn('[Linux Platform] pgrep not available, using /proc fallback')
  }
  
  for (const [dbType, processName] of Object.entries(databaseTypes)) {
    try {
      let pids: string[] = []
      
      if (hasPgrep) {
        try {
          const { stdout } = await execAsync(`pgrep -f "${processName}"`, { timeout: 5000 })
          pids = stdout.trim().split('\n').filter(pid => pid.length > 0 && /^\d+$/.test(pid))
        } catch (error: any) {
          // pgrep returns non-zero exit code when no processes found, which is normal
          if (error.code !== 1) {
            console.warn(`[Linux Platform] pgrep failed for ${processName}: ${error.message}`)
          }
        }
      }
      
      // Fallback: scan /proc for processes
      if (pids.length === 0) {
        try {
          const procDirs = fs.readdirSync('/proc').filter(dir => /^\d+$/.test(dir))
          for (const procDir of procDirs) {
            try {
              const procInfo = await getProcessInfoFromProc(parseInt(procDir))
              if (procInfo && procInfo.command.includes(processName)) {
                pids.push(procDir)
              }
            } catch {
              // Skip processes we can't read
            }
          }
        } catch (error: any) {
          console.warn(`[Linux Platform] /proc fallback failed: ${error.message}`)
        }
      }
      
      for (const pidStr of pids) {
        const pid = parseInt(pidStr)
        if (isNaN(pid)) continue
        
        try {
          // Verify ownership before accessing process
          const isOwned = await verifyProcessOwnership(pid)
          if (!isOwned) {
            console.debug(`[Linux Platform] Skipping process ${pid} (not owned by current user)`)
            continue
          }
          
          let command = ''
          let port: number | null = null
          
          // Try ps command first
          const hasPs = await checkCommandExists('ps')
          if (hasPs) {
            try {
              const { stdout: psOutput } = await execAsync(`ps -p ${pid} -o pid,ppid,command --no-headers`, { timeout: 3000 })
              const parts = psOutput.trim().split(/\s+/)
              if (parts.length >= 3) {
                command = parts.slice(2).join(' ')
              }
            } catch (error: any) {
              console.debug(`[Linux Platform] ps failed for PID ${pid}: ${error.message}`)
            }
          }
          
          // Fallback to /proc if ps failed or unavailable
          if (!command) {
            const procInfo = await getProcessInfoFromProc(pid)
            if (procInfo) {
              command = procInfo.command
            }
          }
          
          if (command) {
            // Extract port from command if possible
            const portMatch = command.match(/--port\s+(\d+)|-p\s+(\d+)|:(\d+)/)
            if (portMatch) {
              port = parseInt(portMatch[1] || portMatch[2] || portMatch[3])
            }
            
            processes.push({
              pid,
              type: dbType,
              command,
              port
            })
          }
        } catch (error: any) {
          // Process might have died between detection and inspection
          console.debug(`[Linux Platform] Failed to inspect process ${pid}: ${error.message}`)
        }
      }
    } catch (error: any) {
      console.warn(`[Linux Platform] Error detecting ${dbType} processes: ${error.message}`)
    }
  }
  
  return processes
}

/**
 * Get process information for a port using lsof with fallback
 */
export async function getProcessUsingPort(port: number): Promise<ProcessInfo | null> {
  // Check if lsof is available
  const hasLsof = await checkCommandExists('lsof')
  
  if (hasLsof) {
    try {
      const { stdout } = await execAsync(`lsof -i :${port} -n -P`, { timeout: 5000 })
      const lines = stdout.trim().split('\n')
      if (lines.length > 1) {
        // Skip header line, get first process
        const processLine = lines[1]
        const parts = processLine.split(/\s+/)
        if (parts.length >= 2) {
          const processName = parts[0]
          const pid = parts[1]
          return { processName, pid }
        }
      }
    } catch (error: any) {
      // lsof returns non-zero when port is not in use, which is normal
      if (error.code !== 1) {
        console.debug(`[Linux Platform] lsof failed for port ${port}: ${error.message}`)
      }
    }
  }
  
  // Fallback: try to bind to the port to see if it's in use
  // This doesn't give us process info but confirms port is in use
  try {
    const net = require('net')
    return new Promise((resolve) => {
      const server = net.createServer()
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(null))
      })
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          // Port is in use but we can't determine which process
          resolve({ processName: 'Unknown', pid: 'Unknown' })
        } else {
          resolve(null)
        }
      })
      setTimeout(() => {
        server.close()
        resolve(null)
      }, 1000)
    })
  } catch (error) {
    return null
  }
}

/**
 * Kill a process using Linux kill command with ownership verification
 */
export async function killProcess(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    // Verify process ownership before attempting to kill
    const isOwned = await verifyProcessOwnership(pid)
    if (!isOwned) {
      console.warn(`[Linux Platform] Cannot kill process ${pid}: not owned by current user`)
      return false
    }
    
    // Verify process still exists
    try {
      await fs.promises.access(`/proc/${pid}`, fs.constants.F_OK)
    } catch {
      // Process doesn't exist
      return false
    }
    
    // Attempt to kill with retry logic
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await execAsync(`kill -s ${signal} ${pid}`, { timeout: 3000 })
        
        // Wait a moment and verify process is gone
        await new Promise(resolve => setTimeout(resolve, 500))
        
        try {
          await fs.promises.access(`/proc/${pid}`, fs.constants.F_OK)
          // Process still exists
          if (attempt < maxRetries - 1) {
            continue
          }
          return false
        } catch {
          // Process is gone
          return true
        }
      } catch (error: any) {
        if (error.code === 3) {
          // ESRCH: No such process (already dead)
          return true
        }
        if (attempt === maxRetries - 1) {
          console.warn(`[Linux Platform] Failed to kill process ${pid} after ${maxRetries} attempts: ${error.message}`)
          return false
        }
        // Retry after short delay
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    return false
  } catch (error: any) {
    console.warn(`[Linux Platform] Error killing process ${pid}: ${error.message}`)
    return false
  }
}

/**
 * Check if the main LiquiDB app is running (Linux-specific) with fallbacks
 */
export async function isMainAppRunning(): Promise<boolean> {
  try {
    // Check if ps is available
    const hasPs = await checkCommandExists('ps')
    
    if (hasPs) {
      try {
        // Check for Electron processes running LiquiDB
        const { stdout } = await execAsync('ps aux | grep -i "[E]lectron.*[Ll]iquidb\\|[Ll]iquidb.*[E]lectron" || true', { timeout: 3000 })
        const processes = stdout.trim().split('\n').filter(line => {
          return line.length > 0 && 
                 !line.includes('grep') && 
                 !line.includes('liquidb-helper') &&
                 (line.includes('Electron') || line.includes('LiquiDB'))
        })
        
        if (processes.length > 0) {
          return true
        }
      } catch (error: any) {
        console.debug(`[Linux Platform] ps check failed: ${error.message}`)
      }
    }
    
    // Fallback: check /proc for LiquiDB processes
    try {
      const procDirs = fs.readdirSync('/proc').filter(dir => /^\d+$/.test(dir))
      for (const procDir of procDirs) {
        try {
          const procInfo = await getProcessInfoFromProc(parseInt(procDir))
          if (procInfo && 
              (procInfo.command.includes('LiquiDB') || procInfo.command.includes('liquidb')) &&
              !procInfo.command.includes('liquidb-helper')) {
            return true
          }
        } catch {
          // Skip processes we can't read
        }
      }
    } catch (error: any) {
      console.debug(`[Linux Platform] /proc fallback failed: ${error.message}`)
    }
    
    return false
  } catch (error: any) {
    // If check fails, assume app is not running (safer to clean up orphans)
    console.debug(`[Linux Platform] Main app check failed: ${error.message}`)
    return false
  }
}

/**
 * Get process command line (Linux) with fallback
 */
export async function getProcessCommand(pid: number): Promise<string> {
  try {
    // Verify ownership first
    const isOwned = await verifyProcessOwnership(pid)
    if (!isOwned) {
      return ''
    }
    
    // Try ps command first
    const hasPs = await checkCommandExists('ps')
    if (hasPs) {
      try {
        const { stdout } = await execAsync(`ps -p ${pid} -o command= --no-headers`, { timeout: 3000 })
        const command = stdout.trim()
        if (command) {
          return command
        }
      } catch (error: any) {
        console.debug(`[Linux Platform] ps failed for PID ${pid}: ${error.message}`)
      }
    }
    
    // Fallback to /proc
    const procInfo = await getProcessInfoFromProc(pid)
    if (procInfo) {
      return procInfo.command
    }
    
    return ''
  } catch (error: any) {
    console.debug(`[Linux Platform] Failed to get command for PID ${pid}: ${error.message}`)
    return ''
  }
}

/**
 * Check if system commands are available and executable
 */
export async function checkSystemCommandAvailability(): Promise<{ available: boolean; missing: string[]; errors: string[] }> {
  const requiredCommands = ['pgrep', 'ps', 'kill']
  const optionalCommands = ['lsof']
  const missing: string[] = []
  const errors: string[] = []
  
  // Check required commands
  for (const cmd of requiredCommands) {
    const exists = await checkCommandExists(cmd)
    if (!exists) {
      missing.push(cmd)
    }
  }
  
  // Check optional commands
  for (const cmd of optionalCommands) {
    const exists = await checkCommandExists(cmd)
    if (!exists) {
      errors.push(`${cmd} not available (optional, will use fallback)`)
    }
  }
  
  return {
    available: missing.length === 0,
    missing,
    errors
  }
}

/**
 * Check socket directory permissions
 */
export async function checkSocketPermissions(): Promise<{ writable: boolean; error?: string }> {
  return await checkSocketDirectoryPermissions()
}
