import { notifySuccess, notifyError, notifyInfo, notifyWarning } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"

export const useBulkOperations = (
  databases: DatabaseContainer[],
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>,
  checkPortConflict: (port: number) => Promise<{ inUse: boolean; processName?: string; pid?: string }>,
  isPortBanned: (port: number) => boolean,
  startDatabaseWithErrorHandlingRef: React.MutableRefObject<(id: string) => Promise<void>>,
  checkPortConflictsInSelection: (selectedIds: string[]) => [number, DatabaseContainer[]][],
  showPortConflictDialog: (conflicts: [number, DatabaseContainer[]][]) => void,
  clearSelection: () => void,
  setShowBulkActions: React.Dispatch<React.SetStateAction<boolean>>
) => {
  const handleBulkStart = async (databaseIds: string[]) => {
    // Filter to only include databases that are actually stopped
    const stoppedDatabases = databases.filter(db => 
      databaseIds.includes(db.id) && db.status === "stopped"
    )
    
    if (stoppedDatabases.length === 0) {
      notifyInfo("No Stopped Databases", {
        description: "All selected databases are already running or starting.",
        duration: 3000,
      })
      return
    }
    
    console.log(`[Bulk Start] Starting ${stoppedDatabases.length} stopped databases (${databaseIds.length - stoppedDatabases.length} already running)`)
    
    notifyInfo("Starting Multiple Databases", {
      description: `Starting ${stoppedDatabases.length} stopped databases...`,
      duration: 3000,
    })

    const bannedPortDatabases = stoppedDatabases.filter(db => isPortBanned(db.port))
    
    if (bannedPortDatabases.length > 0) {
      const bannedNames = bannedPortDatabases.map(db => db.name).join(", ")
      notifyError("Cannot start databases", {
        description: `The following databases use banned ports: ${bannedNames}. Please change their ports in settings.`,
      })
      return
    }

    // Check for port conflicts before starting any databases (only on stopped databases)
    const conflictChecks = await Promise.all(
      stoppedDatabases.map(async (targetDb) => {
        // Check for external port conflicts
        if (targetDb.port) {
          const conflictResult = await checkPortConflict(targetDb.port)
          if (conflictResult.inUse) {
            return { 
              id: targetDb.id, 
              hasConflict: true, 
              conflictType: 'external',
              message: `Port ${targetDb.port} is in use by external process: ${conflictResult.processName} (PID: ${conflictResult.pid})`
            }
          }
        }

        // Check for internal port conflicts (other databases in the selection)
        const conflictingDb = stoppedDatabases.find(otherDb => 
          otherDb.id !== targetDb.id && 
          otherDb.port === targetDb.port
        )

        if (conflictingDb) {
          return { 
            id: targetDb.id, 
            hasConflict: true, 
            conflictType: 'internal',
            message: `Port ${targetDb.port} is in use by "${conflictingDb.name}" in this selection`
          }
        }

        return { id: targetDb.id, hasConflict: false }
      })
    )

    // Filter out databases with conflicts
    const conflictedDatabases = conflictChecks.filter(check => check.hasConflict)
    const validDatabaseIds = conflictChecks.filter(check => !check.hasConflict).map(check => check.id)

    if (conflictedDatabases.length > 0) {
      const conflictMessages = conflictedDatabases.map(check => 
        `${databases.find(db => db.id === check.id)?.name}: ${check.message}`
      ).join('\n')
      
      notifyError("Cannot start some databases", {
        description: `The following databases have port conflicts:\n${conflictMessages}`,
        duration: 8000,
      })
      
      // If no valid databases to start, return early
      if (validDatabaseIds.length === 0) {
        return
      }
    }

    // First, set all valid databases to "starting" status immediately to prevent race conditions
    setDatabases(prev => prev.map(db => 
      validDatabaseIds.includes(db.id) ? { 
        ...db, 
        status: "starting" as const, 
        lastStarted: Date.now(),
        systemInfo: {
          cpu: 0,
          memory: 0,
          connections: 0,
          uptime: 0
        }
      } : db
    ))

    // Start all valid databases using the existing startDatabaseWithErrorHandling function
    // This function handles the async nature properly and uses real-time listeners
    const startPromises = validDatabaseIds.map(async (id, index) => {
      try {
        // Add a small delay between starts to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * index))
        }

        const targetDb = databases.find((db) => db.id === id)
        if (!targetDb) return { id, success: false, error: "Database not found" }

        // Use the existing startDatabaseWithErrorHandling function
        // This function handles the async startup properly
        // Note: Port conflicts are already checked upfront, so this should succeed
        await startDatabaseWithErrorHandlingRef.current(id)
        
        // Since startDatabaseWithErrorHandling doesn't return a value,
        // we'll assume success if no error was thrown
        return { id, success: true, error: null }
      } catch (error) {
        console.error(`[Bulk Start] Error starting database ${id}:`, error)
        return { id, success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Wait for all operations to complete
    const results = await Promise.all(startPromises)
    
    // Count successes and failures
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Show result toast
    if (failed === 0) {
      notifySuccess("Bulk Start Initiated", {
        description: `Starting ${successful} databases. Status updates will appear as they complete.`,
        duration: 4000,
      })
    } else if (successful === 0) {
      notifyError("Failed to Start Databases", {
        description: `Failed to initiate start for all ${failed} databases`,
        duration: 5000,
      })
    } else {
      notifyWarning("Partial Success", {
        description: `Initiated start for ${successful} databases, failed to start ${failed}`,
        duration: 5000,
      })
    }

    console.log(`[Bulk Start] Completed: ${successful} successful, ${failed} failed`)
  }

  const handleBulkStop = async (databaseIds: string[]) => {
    // Filter to only include databases that are actually running
    const runningDatabases = databases.filter(db => 
      databaseIds.includes(db.id) && (db.status === "running" || db.status === "starting")
    )
    
    if (runningDatabases.length === 0) {
      notifyInfo("No Running Databases", {
        description: "All selected databases are already stopped.",
        duration: 3000,
      })
      return
    }
    
    console.log(`[Bulk Stop] Stopping ${runningDatabases.length} running databases (${databaseIds.length - runningDatabases.length} already stopped)`)
    
    // Show initial toast
    notifyInfo("Stopping Multiple Databases", {
      description: `Stopping ${runningDatabases.length} running databases...`,
      duration: 3000,
    })

    // First, set only running databases to "stopping" status immediately
    setDatabases(prev => prev.map(db => 
      runningDatabases.some(rdb => rdb.id === db.id) ? { ...db, status: "stopping" as const } : db
    ))

    // Stop only running databases in parallel
    const stopPromises = runningDatabases.map(async (db, index) => {
      try {
        // Add a small delay between stops to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 500 * index))
        }

        const result = await window.electron?.stopDatabase?.(db.id)
        return { id: db.id, success: result?.success || false, error: result?.error }
      } catch (error) {
        console.error(`[Bulk Stop] Error stopping database ${db.id}:`, error)
        return { id: db.id, success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Wait for all operations to complete
    const results = await Promise.all(stopPromises)
    
    // Count successes and failures
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Show result toast
    if (failed === 0) {
      notifySuccess("All Databases Stopped", {
        description: `Successfully stopped ${successful} databases`,
        duration: 4000,
      })
    } else if (successful === 0) {
      notifyError("Failed to Stop Databases", {
        description: `Failed to stop all ${failed} databases`,
        duration: 5000,
      })
    } else {
      notifyWarning("Partial Success", {
        description: `Stopped ${successful} databases, failed to stop ${failed}`,
        duration: 5000,
      })
    }

    console.log(`[Bulk Stop] Completed: ${successful} successful, ${failed} failed`)
  }

  const handleBulkStartSelected = (selectedDatabases: Set<string>) => {
    const selectedIds = Array.from(selectedDatabases)
    if (selectedIds.length === 0) return
    
    // Check for port conflicts
    const conflicts = checkPortConflictsInSelection(selectedIds)
    
    if (conflicts.length > 0) {
      // Show port conflict dialog
      showPortConflictDialog(conflicts)
      return
    }
    
    // No conflicts, proceed with normal bulk start
    handleBulkStart(selectedIds)
    clearSelection()
    setShowBulkActions(false) // Exit selection mode
  }

  const handleBulkStopSelected = (selectedDatabases: Set<string>) => {
    const selectedIds = Array.from(selectedDatabases)
    if (selectedIds.length === 0) return
    
    handleBulkStop(selectedIds)
    clearSelection()
    setShowBulkActions(false) // Exit selection mode
  }

  return {
    handleBulkStart,
    handleBulkStop,
    handleBulkStartSelected,
    handleBulkStopSelected
  }
}

