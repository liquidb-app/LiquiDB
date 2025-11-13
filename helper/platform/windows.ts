/**
 * Windows Platform-Specific Implementation
 * 
 * Uses Windows-specific commands (tasklist, netstat, PowerShell) and paths
 * (APPDATA, LOCALAPPDATA) with named pipe IPC
 * 
 * Includes comprehensive error handling, permission checks, and fallback mechanisms
 * Replaces deprecated wmic with PowerShell commands
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
    const { stdout } = await execAsync(`where ${command}`, { timeout: 3000 })
    const exists = stdout.trim().length > 0
    commandCache.set(command, exists)
    return exists
  } catch (error) {
    commandCache.set(command, false)
    return false
  }
}

/**
 * Check if PowerShell is available
 */
async function checkPowerShellAvailable(): Promise<boolean> {
  return await checkCommandExists('powershell')
}

/**
 * Get process command line using PowerShell (preferred method)
 */
async function getProcessCommandLinePowerShell(pid: number): Promise<string> {
  try {
    const psCommand = `Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path`
    const { stdout } = await execAsync(
      `powershell -Command "${psCommand}"`,
      { timeout: 5000, maxBuffer: 1024 * 1024 }
    )
    return stdout.trim()
  } catch (error: any) {
    // Try alternative PowerShell command to get full command line
    try {
      const psCommand = `(Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}").CommandLine`
      const { stdout } = await execAsync(
        `powershell -Command "${psCommand}"`,
        { timeout: 5000, maxBuffer: 1024 * 1024 }
      )
      return stdout.trim()
    } catch (error2: any) {
      console.debug(`[Windows Platform] PowerShell command line fetch failed for PID ${pid}: ${error2.message}`)
      return ''
    }
  }
}

/**
 * Get process command line using WMI via PowerShell (fallback)
 */
async function getProcessCommandLineWMI(pid: number): Promise<string> {
  try {
    const psCommand = `(Get-WmiObject Win32_Process -Filter "ProcessId = ${pid}").CommandLine`
    const { stdout } = await execAsync(
      `powershell -Command "${psCommand}"`,
      { timeout: 5000, maxBuffer: 1024 * 1024 }
    )
    return stdout.trim()
  } catch (error: any) {
    console.debug(`[Windows Platform] WMI command line fetch failed for PID ${pid}: ${error.message}`)
    return ''
  }
}

/**
 * Get process command line with multiple fallbacks
 */
async function getProcessCommandLine(pid: number): Promise<string> {
  // Try PowerShell CIM first (most reliable on modern Windows)
  let command = await getProcessCommandLinePowerShell(pid)
  if (command) {
    return command
  }
  
  // Fallback to WMI via PowerShell
  command = await getProcessCommandLineWMI(pid)
  if (command) {
    return command
  }
  
  // Final fallback: try to get process name from tasklist
  try {
    const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 })
    const parts = stdout.trim().split('","')
    if (parts.length >= 1) {
      return parts[0].replace(/"/g, '')
    }
  } catch (error: any) {
    console.debug(`[Windows Platform] tasklist fallback failed for PID ${pid}: ${error.message}`)
  }
  
  return ''
}

/**
 * Check if running with admin privileges
 */
export async function checkAdminPrivileges(): Promise<boolean> {
  try {
    // Try to query a protected resource that requires admin
    const { stdout } = await execAsync('net session', { timeout: 3000 })
    return !stdout.includes('Access is denied')
  } catch (error: any) {
    // If net session fails, we likely don't have admin
    return false
  }
}

/**
 * Get the application data directory for Windows
 */
export function getAppDataDir(): string {
  const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appDataPath, 'LiquiDB')
}

/**
 * Get the log directory for Windows
 */
export function getLogDir(): string {
  const localAppDataPath = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(localAppDataPath, 'LiquiDB', 'Logs')
}

/**
 * Get the IPC named pipe path for Windows
 */
export function getSocketPath(): string {
  // Windows named pipe path format
  return '\\\\.\\pipe\\liquidb-helper'
}

/**
 * Check named pipe permissions (verify we can create pipes)
 */
export async function checkNamedPipePermissions(): Promise<{ writable: boolean; error?: string }> {
  try {
    // On Windows, named pipes are created in the \\.\pipe\ namespace
    // We can't directly test pipe creation without actually creating one
    // Instead, verify we have write access to the temp directory (where pipe handles are created)
    const tempDir = os.tmpdir()
    try {
      await fs.promises.access(tempDir, fs.constants.W_OK)
      return { writable: true }
    } catch (error: any) {
      return { writable: false, error: `Cannot write to temp directory: ${error.message}` }
    }
  } catch (error: any) {
    return { writable: false, error: `Named pipe permission check failed: ${error.message}` }
  }
}

/**
 * Get all running database processes using Windows commands with fallbacks
 */
export async function getRunningDatabaseProcesses(
  databaseTypes: { [key: string]: string }
): Promise<DatabaseProcess[]> {
  const processes: DatabaseProcess[] = []
  
  // Check if tasklist is available
  const hasTasklist = await checkCommandExists('tasklist')
  if (!hasTasklist) {
    console.warn('[Windows Platform] tasklist not available')
    return processes
  }
  
  for (const [dbType, processName] of Object.entries(databaseTypes)) {
    try {
      // Use tasklist to find processes by name
      // Windows process names typically don't have extensions in tasklist
      const processNameWin = processName.replace('.exe', '')
      const { stdout } = await execAsync(
        `tasklist /FI "IMAGENAME eq ${processNameWin}*" /FO CSV /NH`,
        { timeout: 5000 }
      ) as { stdout: string }
      
      const lines = stdout.trim().split('\n').filter(line => line.trim().length > 0)
      
      for (const line of lines) {
        try {
          // Parse CSV output: "image name","pid","session name","session#","mem usage"
          const parts = line.split('","').map(p => p.replace(/"/g, ''))
          if (parts.length >= 2) {
            const pid = parseInt(parts[1])
            if (!isNaN(pid)) {
              // Get full command line using modern methods (PowerShell preferred)
              let command = ''
              
              // Try PowerShell first
              const hasPowerShell = await checkPowerShellAvailable()
              if (hasPowerShell) {
                command = await getProcessCommandLine(pid)
              }
              
              // Fallback to process name if command line unavailable
              if (!command) {
                command = parts[0]
              }
              
              // Extract port from command if possible
              const portMatch = command.match(/--port\s+(\d+)|-p\s+(\d+)|:(\d+)|port=(\d+)/i)
              const port = portMatch ? (portMatch[1] || portMatch[2] || portMatch[3] || portMatch[4]) : null
              
              processes.push({
                pid,
                type: dbType,
                command,
                port: port ? parseInt(port) : null
              })
            }
          }
        } catch (error: any) {
          console.debug(`[Windows Platform] Failed to process line: ${error.message}`)
        }
      }
    } catch (error: any) {
      // tasklist returns non-zero exit code when no processes found, which is normal
      if (error.code !== 1) {
        console.warn(`[Windows Platform] tasklist failed for ${processName}: ${error.message}`)
      }
    }
  }
  
  return processes
}

/**
 * Get process information for a port using netstat with fallbacks
 */
export async function getProcessUsingPort(port: number): Promise<ProcessInfo | null> {
  // Check if netstat is available
  const hasNetstat = await checkCommandExists('netstat')
  if (!hasNetstat) {
    console.warn('[Windows Platform] netstat not available')
    return null
  }
  
  return new Promise((resolve) => {
    // Use netstat to find process using port
    exec(`netstat -ano | findstr :${port}`, { timeout: 5000 }, (error: ExecException | null, stdout: string, _stderr: string) => {
      if (error || !stdout.trim()) {
        resolve(null)
        return
      }
      
      const lines = stdout.trim().split('\n')
      for (const line of lines) {
        // netstat output format: PROTO  LOCAL_ADDRESS  FOREIGN_ADDRESS  STATE  PID
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 5) {
          const pid = parts[parts.length - 1]
          
          // Get process name from PID
          exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 }, (taskError: ExecException | null, taskStdout: string) => {
            if (!taskError && taskStdout.trim()) {
              const taskParts = taskStdout.trim().split('","')
              if (taskParts.length >= 1) {
                const processName = taskParts[0].replace(/"/g, '')
                resolve({ processName, pid })
                return
              }
            }
            resolve({ processName: 'Unknown', pid })
          })
          return
        }
      }
      resolve(null)
    })
  })
}

/**
 * Kill a process using Windows taskkill command with retry logic
 */
export async function killProcess(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    // Verify process exists first
    try {
      await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 })
    } catch (error: any) {
      // Process doesn't exist
      return false
    }
    
    // Windows doesn't use signals the same way, but we can use /F for force kill
    let force = signal === 'SIGKILL' ? ' /F' : ''
    
    // Attempt kill with retry logic
    const maxRetries = 3
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await execAsync(`taskkill /PID ${pid}${force} /T`, { timeout: 5000 })
        
        // Wait a moment and verify process is gone
        await new Promise(resolve => setTimeout(resolve, 500))
        
        try {
          await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 })
          // Process still exists
          if (attempt < maxRetries - 1) {
            // Try force kill on retry
            force = ' /F'
            continue
          }
          return false
        } catch {
          // Process is gone
          return true
        }
      } catch (error: any) {
        if (error.message.includes('not found') || error.message.includes('does not exist')) {
          // Process already dead
          return true
        }
        if (attempt === maxRetries - 1) {
          console.warn(`[Windows Platform] Failed to kill process ${pid} after ${maxRetries} attempts: ${error.message}`)
          return false
        }
        // Retry after short delay
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    return false
  } catch (error: any) {
    console.warn(`[Windows Platform] Error killing process ${pid}: ${error.message}`)
    return false
  }
}

/**
 * Check if the main LiquiDB app is running (Windows-specific) with fallbacks
 */
export async function isMainAppRunning(): Promise<boolean> {
  try {
    // Check if tasklist is available
    const hasTasklist = await checkCommandExists('tasklist')
    if (!hasTasklist) {
      return false
    }
    
    // Check for Electron processes or LiquiDB.exe
    try {
      const { stdout } = await execAsync(
        'tasklist /FI "IMAGENAME eq Electron.exe" /FI "IMAGENAME eq LiquiDB.exe" /FO CSV /NH',
        { timeout: 5000 }
      ) as { stdout: string }
      const processes = stdout.trim().split('\n').filter(line => {
        return line.length > 0 && 
               !line.includes('liquidb-helper') &&
               (line.includes('Electron') || line.includes('LiquiDB'))
      })
      
      if (processes.length > 0) {
        return true
      }
    } catch (error: any) {
      // No processes found, continue to PowerShell check
    }
    
    // Also check for processes with LiquiDB in the command line using PowerShell
    const hasPowerShell = await checkPowerShellAvailable()
    if (hasPowerShell) {
      try {
        const psCommand = `Get-Process | Where-Object { $_.ProcessName -like '*LiquiDB*' -or $_.ProcessName -like '*Electron*' } | Select-Object -ExpandProperty Id`
        const { stdout } = await execAsync(
          `powershell -Command "${psCommand}"`,
          { timeout: 5000 }
        )
        const pids = stdout.trim().split('\n').filter(pid => pid.length > 0 && /^\d+$/.test(pid))
        if (pids.length > 0) {
          return true
        }
      } catch (error: any) {
        console.debug(`[Windows Platform] PowerShell process check failed: ${error.message}`)
      }
    }
    
    return false
  } catch (error: any) {
    // If check fails, assume app is not running (safer to clean up orphans)
    console.debug(`[Windows Platform] Main app check failed: ${error.message}`)
    return false
  }
}

/**
 * Get process command line (Windows) with fallbacks
 */
export async function getProcessCommand(pid: number): Promise<string> {
  try {
    // Try PowerShell first (preferred)
    const hasPowerShell = await checkPowerShellAvailable()
    if (hasPowerShell) {
      const command = await getProcessCommandLine(pid)
      if (command) {
        return command
      }
    }
    
    // Fallback: try to get process name from tasklist
    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 3000 })
      const parts = stdout.trim().split('","')
      if (parts.length >= 1) {
        return parts[0].replace(/"/g, '')
      }
    } catch (error: any) {
      console.debug(`[Windows Platform] tasklist fallback failed for PID ${pid}: ${error.message}`)
    }
    
    return ''
  } catch (error: any) {
    console.debug(`[Windows Platform] Failed to get command for PID ${pid}: ${error.message}`)
    return ''
  }
}

/**
 * Check if system commands are available
 */
export async function checkSystemCommandAvailability(): Promise<{ available: boolean; missing: string[]; errors: string[] }> {
  const requiredCommands = ['tasklist', 'taskkill', 'netstat']
  const optionalCommands = ['powershell']
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
 * Check Task Scheduler service status
 */
export async function checkTaskSchedulerService(): Promise<{ running: boolean; error?: string }> {
  try {
    const hasPowerShell = await checkPowerShellAvailable()
    if (hasPowerShell) {
      try {
        const psCommand = `(Get-Service -Name Schedule).Status`
        const { stdout } = await execAsync(
          `powershell -Command "${psCommand}"`,
          { timeout: 5000 }
        )
        const status = stdout.trim().toLowerCase()
        return { running: status === 'running' }
      } catch (error: any) {
        return { running: false, error: `Failed to check Task Scheduler service: ${error.message}` }
      }
    }
    
    // Fallback: try sc query
    try {
      const { stdout } = await execAsync('sc query Schedule', { timeout: 5000 })
      return { running: stdout.includes('RUNNING') }
    } catch (error: any) {
      return { running: false, error: `Failed to check Task Scheduler service: ${error.message}` }
    }
  } catch (error: any) {
    return { running: false, error: `Task Scheduler check failed: ${error.message}` }
  }
}
