import { BrowserWindow } from "electron"
import storage from "../storage"
import { IDatabase } from "../../types/database"
import { DatabaseProcess } from "../core/shared-state"

interface PortConflict {
  database: IDatabase
  conflictingDatabase: IDatabase
  suggestedPort: number
}

/**
 * Find a free port for auto-start conflicts
 * @param {number} port - Starting port
 * @param {number[]} usedPorts - Array of used ports
 * @returns {number} - Free port number
 */
export function findFreePortForAutoStart(port: number, usedPorts: number[]): number {
  let newPort = port + 1
  while (usedPorts.includes(newPort) && newPort < 65535) {
    newPort++
  }
  return newPort
}

/**
 * Auto-start databases on app launch
 * @param {object} app - Electron app instance
 * @param {Map} runningDatabases - Map of running databases
 * @param {object} mainWindow - Main window instance
 * @param {function} startDatabaseProcessAsync - Function to start database process
 */
export async function autoStartDatabases(
  app: Electron.App,
  runningDatabases: Map<string, DatabaseProcess>,
  mainWindow: BrowserWindow | null,
  startDatabaseProcessAsync: (config: IDatabase) => Promise<{ success: boolean; error?: string }>
): Promise<void> {
  try {
    const databases = storage.loadDatabases(app)
    const autoStartDatabasesList = databases.filter((db) => db.autoStart && db.status === "stopped")
    
    if (autoStartDatabasesList.length === 0) {
      console.log("[Auto-start] No databases configured for auto-start")
      return
    }
    
    console.log(`[Auto-start] Found ${autoStartDatabasesList.length} databases to auto-start:`, 
      autoStartDatabasesList.map((db) => `${db.name} (${db.type})`).join(", "))
    
    // Check for port conflicts among auto-start databases
    const portConflicts: PortConflict[] = []
    const usedPorts: number[] = []
    const databasesToStart: IDatabase[] = []
    
    for (const db of autoStartDatabasesList) {
      if (usedPorts.includes(db.port)) {
        // Port conflict detected
        const conflictingDb = databasesToStart.find((d) => d.port === db.port)
        if (conflictingDb) {
          portConflicts.push({
            database: db,
            conflictingDatabase: conflictingDb,
            suggestedPort: findFreePortForAutoStart(db.port, usedPorts)
          })
          console.warn(`[Auto-start] Port conflict detected: ${db.name} (port ${db.port}) conflicts with ${conflictingDb?.name}`)
        }
      } else {
        usedPorts.push(db.port)
        databasesToStart.push(db)
      }
    }
    
    // Handle port conflicts
    if (portConflicts.length > 0) {
      console.log(`[Auto-start] Found ${portConflicts.length} port conflicts, resolving automatically`)
      
      for (const conflict of portConflicts) {
        const { database, suggestedPort } = conflict
        console.log(`[Auto-start] Resolving conflict: ${database.name} port changed from ${database.port} to ${suggestedPort}`)
        
        // Update the database port in storage
        try {
          const updatedDb = { ...database, port: suggestedPort }
          const allDatabases = storage.loadDatabases(app)
          const dbIndex = allDatabases.findIndex((d) => d.id === database.id)
          if (dbIndex >= 0) {
            allDatabases[dbIndex] = updatedDb
            storage.saveDatabases(app, allDatabases)
            console.log(`[Auto-start] Updated ${database.name} port to ${suggestedPort} in storage`)
          }
          
          // Add to databases to start with updated port
          databasesToStart.push(updatedDb)
          usedPorts.push(suggestedPort)
        } catch (error) {
          console.error(`[Auto-start] Failed to update port for ${database.name}:`, error)
          // Skip this database if port update fails
        }
      }
      
      // Notify frontend about port conflicts and resolutions
      if (mainWindow) {
        mainWindow.webContents.send('auto-start-port-conflicts', {
          conflicts: portConflicts.map(c => ({
            databaseName: c.database.name,
            originalPort: c.database.port,
            newPort: c.suggestedPort,
            conflictingDatabase: c.conflictingDatabase?.name
          }))
        })
      }
    }
    
    let successCount = 0
    let failureCount = 0
    let skippedCount = 0
    
    for (const db of databasesToStart) {
      try {
        console.log(`[Auto-start] Starting database ${db.name} (${db.type}) on port ${db.port}...`)
        
        // Send initial "starting" status to frontend before starting the process
        if (mainWindow) {
          mainWindow.webContents.send('database-status-changed', { 
            id: db.id, 
            status: 'starting', 
            pid: null 
          })
          console.log(`[Auto-start] Sent initial starting status for ${db.name} to frontend`)
        }
        
        // Start the database process
        const result = await startDatabaseProcessAsync(db)
        
        if (result && result.success) {
          console.log(`[Auto-start] Successfully started ${db.name}`)
          successCount++
          
          // Verify the database is actually running by checking the running databases map
          setTimeout(() => {
            const runningDb = runningDatabases.get(db.id)
            if (runningDb) {
              console.log(`[Auto-start] Verified ${db.name} is running (PID: ${runningDb.process.pid})`)
            } else {
              console.warn(`[Auto-start] Warning: ${db.name} may not be running despite successful start`)
            }
          }, 2000) // Check after 2 seconds
        } else {
          console.error(`[Auto-start] Failed to start ${db.name}:`, result ? result.error : "No result returned")
          failureCount++
        }
      } catch (error) {
        console.error(`[Auto-start] Error starting database ${db.name}:`, error)
        failureCount++
      }
      
      // Add a small delay between starts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Count skipped databases (those with unresolvable port conflicts)
    skippedCount = autoStartDatabasesList.length - databasesToStart.length
    
    console.log(`[Auto-start] Auto-start process completed: ${successCount} successful, ${failureCount} failed, ${skippedCount} skipped due to port conflicts`)
    
    // Send summary to frontend
    if (mainWindow) {
      mainWindow.webContents.send('auto-start-completed', {
        total: autoStartDatabasesList.length,
        successful: successCount,
        failed: failureCount,
        skipped: skippedCount,
        portConflicts: portConflicts.length
      })
    }
  } catch (error) {
    console.error("[Auto-start] Error in auto-start process:", error)
  }
}

