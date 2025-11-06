/**
 * Port-related utility functions
 */

/**
 * Get port conflict info (returns null if no conflict)
 */
export async function getPortConflictInfo(port: number): Promise<{ processName: string; pid: string } | null> {
  try {
    if (window.electron?.checkPortConflict) {
      const result = await window.electron.checkPortConflict(port)
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


