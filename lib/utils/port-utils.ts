/**
 * Port-related utility functions
 */

/**
 * Check if a port is in use and return conflict information
 */
export async function checkPortConflict(port: number, databaseId?: string): Promise<{ inUse: boolean; processName?: string; pid?: string }> {
  try {
    if (window.electron?.checkPortConflict) {
      const result = await window.electron.checkPortConflict(port, databaseId)
      // Only return false if we got a definitive success response
      if (result?.success === true && result?.inUse === false) {
        return {
          inUse: false,
          processName: undefined,
          pid: undefined
        }
      }
      // If inUse is true, or if success is false/undefined, treat as in use
      return {
        inUse: result?.inUse ?? true, // Default to in use if uncertain
        processName: result?.processInfo?.processName || 'Unknown process',
        pid: result?.processInfo?.pid || 'Unknown'
      }
    }
    // If electron API is not available, default to assuming port is in use for safety
    console.warn(`[Port Check] Electron API not available, assuming port ${port} is in use`)
    return { inUse: true, processName: 'Unknown (API unavailable)', pid: 'Unknown' }
  } catch (error) {
    console.error(`[Port Check] Error checking port ${port}:`, error)
    // On error, default to assuming port is in use for safety
    return { inUse: true, processName: 'Unknown (check failed)', pid: 'Unknown' }
  }
}

/**
 * Get port conflict info (returns null if no conflict)
 */
export async function getPortConflictInfo(port: number, databaseId?: string): Promise<{ processName: string; pid: string } | null> {
  try {
    if (window.electron?.checkPortConflict) {
      const result = await window.electron.checkPortConflict(port, databaseId)
      // Only return conflict info if port is in use
      if (result?.success === true && result?.inUse === true && result?.processInfo) {
        return {
          processName: result.processInfo.processName || 'Unknown',
          pid: result.processInfo.pid || 'Unknown'
        }
      }
      // Port is available or check failed
      return null
    }
    // If electron API is not available, return null (no conflict info)
    return null
  } catch (error) {
    console.error(`[Port Check] Error checking port ${port}:`, error)
    return null
  }
}

/**
 * Filter out likely false positives from port conflict checks
 */
export function isLikelyFalsePositive(processName: string): boolean {
  const falsePositives = [
    'node', 'npm', 'yarn', 'pnpm', 'next', 'webpack', 'vite', 'dev',
    'chrome', 'safari', 'firefox', 'electron', 'code', 'cursor',
    'system', 'kernel', 'launchd', 'WindowServer', 'Finder'
  ]
  
  const lowerProcessName = processName.toLowerCase()
  return falsePositives.some(fp => lowerProcessName.includes(fp.toLowerCase()))
}

/**
 * Check if a process is a database-related process
 */
export function isDatabaseRelatedProcess(processName: string): boolean {
  const databaseProcesses = ['postgres', 'mysqld', 'mongod', 'redis-server', 'redis-ser', 'postmaster']
  const lowerProcessName = processName.toLowerCase()
  // Check if process name matches any database process (handles truncated names from lsof)
  return databaseProcesses.some(dp => {
    const lowerDbProcess = dp.toLowerCase()
    // Check if the process name includes the database process name OR if the database process name includes the process name
    // This handles cases where lsof truncates names (e.g., "redis-ser" vs "redis-server")
    return lowerProcessName.includes(lowerDbProcess) || lowerDbProcess.includes(lowerProcessName)
  })
}

/**
 * Check if a port is banned
 */
export function isPortBanned(port: number, bannedPorts: number[]): boolean {
  return bannedPorts.includes(port)
}

/**
 * Find the next available port starting from a preferred port
 */
export function findFreePort(preferredPort: number, usedPorts: number[]): number {
  let port = preferredPort
  
  // Try the preferred port first
  if (!usedPorts.includes(port)) {
    return port
  }
  
  // Find the next available port starting from preferredPort + 1
  port = preferredPort + 1
  while (usedPorts.includes(port) && port < 65535) {
    port++
  }
  
  return port
}
