/**
 * Linux Platform-Specific Implementation
 * 
 * Uses Linux-specific commands (pgrep, lsof, ps) and paths
 * following XDG Base Directory specification
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
 * Get all running database processes using Linux commands
 */
export async function getRunningDatabaseProcesses(
  databaseTypes: { [key: string]: string }
): Promise<DatabaseProcess[]> {
  const processes: DatabaseProcess[] = []
  
  for (const [dbType, processName] of Object.entries(databaseTypes)) {
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

/**
 * Get process information for a port using lsof (Linux)
 */
export async function getProcessUsingPort(port: number): Promise<ProcessInfo | null> {
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

/**
 * Kill a process using Linux kill command
 */
export async function killProcess(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    await execAsync(`kill -s ${signal} ${pid}`)
    return true
  } catch (error: any) {
    return false
  }
}

/**
 * Check if the main LiquiDB app is running (Linux-specific)
 */
export async function isMainAppRunning(): Promise<boolean> {
  try {
    // Check for Electron processes running LiquiDB
    const { stdout } = await execAsync('ps aux | grep -i "[E]lectron.*[Ll]iquidb\|[Ll]iquidb.*[E]lectron" || true') as { stdout: string }
    const processes = stdout.trim().split('\n').filter(line => {
      return line.length > 0 && 
             !line.includes('grep') && 
             !line.includes('liquidb-helper') &&
             (line.includes('Electron') || line.includes('LiquiDB'))
    })
    
    // Also check for LiquiDB processes
    if (processes.length === 0) {
      try {
        const { stdout: appStdout } = await execAsync('pgrep -fl "LiquiDB" || true') as { stdout: string }
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

/**
 * Get process command line (Linux)
 */
export async function getProcessCommand(pid: number): Promise<string> {
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o command=`) as { stdout: string }
    return stdout.trim()
  } catch (error: any) {
    return ''
  }
}


