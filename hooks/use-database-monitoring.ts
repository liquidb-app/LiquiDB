/**
 * Hook for monitoring database status and system info
 */

import { useEffect, useRef, useCallback } from "react"
import { log } from "@/lib/logger"
import { formatBytes } from "@/lib/utils/format"
import type { DatabaseContainer } from "@/lib/types"

interface UseDatabaseMonitoringProps {
  databases: DatabaseContainer[]
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>
  databasesRef: React.MutableRefObject<DatabaseContainer[]>
}

export function useDatabaseMonitoring({
  databases,
  setDatabases,
  databasesRef,
}: UseDatabaseMonitoringProps) {
  const lastStatusCheckRef = useRef<Record<string, number>>({})

  // Update databases ref whenever databases state changes
  useEffect(() => {
    databasesRef.current = databases
  }, [databases, databasesRef])

  // Real-time uptime counter that updates every 5 seconds
  useEffect(() => {
    const uptimeInterval = setInterval(() => {
      setDatabases(prevDatabases => {
        let hasChanges = false
        const updatedDatabases = prevDatabases.map(db => {
          if (db.status === "running" && db.lastStarted) {
            const currentTime = Date.now()
            const uptimeSeconds = Math.floor((currentTime - db.lastStarted) / 1000)
            
            if (db.systemInfo?.uptime !== uptimeSeconds) {
              hasChanges = true
              return {
                ...db,
                systemInfo: {
                  cpu: db.systemInfo?.cpu ?? 0,
                  memory: db.systemInfo?.memory ?? 0,
                  connections: db.systemInfo?.connections ?? 0,
                  uptime: uptimeSeconds
                }
              }
            }
          }
          return db
        })
        
        return hasChanges ? updatedDatabases : prevDatabases
      })
    }, 5000)

    return () => clearInterval(uptimeInterval)
  }, [setDatabases])

  // Function to fetch system info for running databases
  const fetchSystemInfo = useCallback(async (databaseId: string) => {
    try {
      log.debug(`Fetching system info for database ${databaseId}`)
      const systemInfo = await window.electron?.getDatabaseSystemInfo?.(databaseId)
      
      log.verbose(`Raw system info for ${databaseId}:`, systemInfo)
      
      if (systemInfo?.success && systemInfo.memory) {
        const instanceMemoryRss = systemInfo.memory.rss || 0
        
        const newSystemInfo = {
          cpu: Math.max(0, systemInfo.memory.cpu || 0),
          memory: Math.max(0, instanceMemoryRss),
          connections: Math.max(0, systemInfo.connections || 0),
          uptime: Math.max(0, systemInfo.uptime || 0)
        }
        
        log.debug(`Processed system info for ${databaseId} (instance-specific):`, {
          ...newSystemInfo,
          memoryRss: `${formatBytes(instanceMemoryRss)} (process-specific)`
        })
        
        setDatabases(prevDatabases => {
          const updated = prevDatabases.map(db => {
            if (db.id === databaseId) {
              const currentSystemInfo = db.systemInfo
              if (!currentSystemInfo || 
                  currentSystemInfo.cpu !== newSystemInfo.cpu ||
                  currentSystemInfo.memory !== newSystemInfo.memory ||
                  currentSystemInfo.connections !== newSystemInfo.connections) {
                log.debug(`Updating system info for database ${databaseId} with memory: ${formatBytes(newSystemInfo.memory)}`)
                return {
                  ...db,
                  systemInfo: {
                    ...newSystemInfo
                  }
                }
              }
              return db
            }
            return db
          })
          
          const hasChanges = updated.some((db, index) => db !== prevDatabases[index])
          return hasChanges ? updated : prevDatabases
        })
        
        log.debug(`Successfully updated database ${databaseId} with independent system info`)
      } else {
        log.warn(`No valid system info for database ${databaseId}:`, systemInfo)
      }
    } catch (error) {
      log.error(`Error fetching system info for database ${databaseId}:`, error)
    }
  }, [setDatabases])

  return {
    fetchSystemInfo,
    lastStatusCheckRef,
  }
}

