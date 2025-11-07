import type { DatabaseContainer } from "@/lib/types"

// Function to check if a database name already exists
export const isNameDuplicate = (databases: DatabaseContainer[], name: string, excludeId?: string): boolean => {
  return databases.some((db: DatabaseContainer) => db.name === name && db.id !== excludeId)
}

// Function to check if a container ID already exists
export const isContainerIdDuplicate = (databases: DatabaseContainer[], containerId: string, excludeId?: string): boolean => {
  return databases.some((db: DatabaseContainer) => db.containerId === containerId && db.id !== excludeId)
}

// Helper function to filter out likely false positives
export const isLikelyFalsePositive = (processName: string): boolean => {
  const falsePositives = [
    'node', 'npm', 'yarn', 'pnpm', 'next', 'webpack', 'vite', 'dev',
    'chrome', 'safari', 'firefox', 'electron', 'code', 'cursor',
    'system', 'kernel', 'launchd', 'WindowServer', 'Finder'
  ]
  
  const lowerProcessName = processName.toLowerCase()
  return falsePositives.some(fp => lowerProcessName.includes(fp.toLowerCase()))
}

// Helper function to check if a process is a database-related process
export const isDatabaseRelatedProcess = (processName: string): boolean => {
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


