/**
 * Windows Platform-Specific Implementation
 * 
 * Uses Windows-specific commands (tasklist, netstat, wmic) and paths
 * (APPDATA, LOCALAPPDATA) with named pipe IPC
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
 * Get all running database processes using Windows commands
 */
export async function getRunningDatabaseProcesses(
  databaseTypes: { [key: string]: string }
): Promise<DatabaseProcess[]> {
  const processes: DatabaseProcess[] = []
  
  for (const [dbType, processName] of Object.entries(databaseTypes)) {
    try {
      // Use tasklist to find processes by name
      // Windows process names typically don't have extensions in tasklist
      const processNameWin = processName.replace('.exe', '')
      const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${processNameWin}*" /FO CSV /NH`) as { stdout: string }
      
      const lines = stdout.trim().split('\n').filter(line => line.trim().length > 0)
      
      for (const line of lines) {
        try {
          // Parse CSV output: "image name","pid","session name","session#","mem usage"
          const parts = line.split('","').map(p => p.replace(/"/g, ''))
          if (parts.length >= 2) {
            const pid = parseInt(parts[1])
            if (!isNaN(pid)) {
              // Get full command line using wmic
              let command = ''
              try {
                const { stdout: wmicOutput } = await execAsync(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`) as { stdout: string }
                const commandLineMatch = wmicOutput.match(/CommandLine=(.+)/)
                if (commandLineMatch) {
                  command = commandLineMatch[1].trim()
                }
              } catch (_e) {
                // Fallback to process name if wmic fails
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
        } catch (_e) {
          // Skip invalid lines
        }
      }
    } catch (_e) {
      // No processes found for this type
    }
  }
  
  return processes
}

/**
 * Get process information for a port using netstat (Windows)
 */
export async function getProcessUsingPort(port: number): Promise<ProcessInfo | null> {
  return new Promise((resolve) => {
    // Use netstat to find process using port
    exec(`netstat -ano | findstr :${port}`, (error: ExecException | null, stdout: string, _stderr: string) => {
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
          try {
            exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, (taskError: ExecException | null, taskStdout: string) => {
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
          } catch (_e) {
            resolve({ processName: 'Unknown', pid })
            return
          }
        }
      }
      resolve(null)
    })
  })
}

/**
 * Kill a process using Windows taskkill command
 */
export async function killProcess(pid: number, signal: string = 'SIGTERM'): Promise<boolean> {
  try {
    // Windows doesn't use signals the same way, but we can use /F for force kill
    const force = signal === 'SIGKILL' ? ' /F' : ''
    await execAsync(`taskkill /PID ${pid}${force} /T`)
    return true
  } catch (error: any) {
    return false
  }
}

/**
 * Check if the main LiquiDB app is running (Windows-specific)
 */
export async function isMainAppRunning(): Promise<boolean> {
  try {
    // Check for Electron processes or LiquiDB.exe
    const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Electron.exe" /FI "IMAGENAME eq LiquiDB.exe" /FO CSV /NH') as { stdout: string }
    const processes = stdout.trim().split('\n').filter(line => {
      return line.length > 0 && 
             !line.includes('liquidb-helper') &&
             (line.includes('Electron') || line.includes('LiquiDB'))
    })
    
    // Also check for processes with LiquiDB in the command line
    if (processes.length === 0) {
      try {
        const { stdout: wmicStdout } = await execAsync('wmic process where "CommandLine like \'%LiquiDB%\'" get ProcessId /format:list') as { stdout: string }
        const pids = wmicStdout.match(/ProcessId=(\d+)/g)
        if (pids && pids.length > 0) {
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
 * Get process command line (Windows)
 */
export async function getProcessCommand(pid: number): Promise<string> {
  try {
    const { stdout } = await execAsync(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`) as { stdout: string }
    const commandLineMatch = stdout.match(/CommandLine=(.+)/)
    if (commandLineMatch) {
      return commandLineMatch[1].trim()
    }
    return ''
  } catch (error: any) {
    return ''
  }
}


