import * as path from "path"
import * as fs from "fs"
import * as net from "net"
import { exec } from "child_process"
import { App } from "electron"

/**
 * Test port connectivity
 * @param {number} port - Port number
 * @returns {Promise<boolean>} - True if port is accessible
 */
export function testPortConnectivity(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    
    socket.setTimeout(2000)
    
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    
    socket.connect(port, 'localhost')
  })
}

/**
 * Check if a port is in use by external processes
 * @param {number} port - Port number
 * @returns {Promise<boolean>} - True if port is in use
 */
export async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // First, check using lsof for a more reliable detection (especially for listening sockets)
    exec(`lsof -i :${port} -sTCP:LISTEN -n -P`, (lsofError: any, lsofStdout: string) => {
      if (!lsofError && lsofStdout.trim()) {
        // Port is definitely in use according to lsof
        resolve(true)
        return
      }
      
      // Fallback to net.createServer check for ports that might be in use but not listening yet
      const server = net.createServer()
      
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        server.close(() => {})
        resolve(true) // If we can't determine, assume port is in use to be safe
      }, 1000)
      
      server.listen(port, '127.0.0.1', () => {
        // Port is available
        clearTimeout(timeout)
        server.close(() => {
          resolve(false)
        })
      })
      
      server.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout)
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          resolve(true)
        } else {
          // Other error, assume port is available
          resolve(false)
        }
      })
    })
  })
}

/**
 * Get process information for a port
 * @param {number} port - Port number
 * @returns {Promise<object|null>} - Process info or null
 */
export async function getProcessUsingPort(port: number): Promise<{ processName: string, pid: string } | null> {
  return new Promise((resolve) => {
    // Use more specific lsof command to only get listening processes
    exec(`lsof -i :${port} -sTCP:LISTEN -n -P`, (error: any, stdout: string, stderr: string) => {
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
          
          // Filter out common false positives
          const falsePositives = [
            'node', 'npm', 'yarn', 'pnpm', 'next', 'webpack', 'vite', 'dev',
            'chrome', 'safari', 'firefox', 'electron', 'code', 'cursor',
            'system', 'kernel', 'launchd', 'WindowServer', 'Finder'
          ]
          
          const lowerProcessName = processName.toLowerCase()
          const isFalsePositive = falsePositives.some(fp => lowerProcessName.includes(fp.toLowerCase()))
          
          if (isFalsePositive) {
            resolve(null)
            return
          }
          
          resolve({ processName, pid })
        }
      }
      resolve(null)
    })
  })
}

/**
 * Get banned ports file path
 * @param {object} app - Electron app instance
 * @returns {string} - Path to banned ports file
 */
export function getBannedPortsFile(app: App): string {
  const dataDir = path.join(app.getPath("userData"))
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, "banned-ports.json")
}

