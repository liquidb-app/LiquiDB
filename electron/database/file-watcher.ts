/**
 * File watcher for databases.json
 * Detects changes and triggers UI updates
 */

import * as fs from "fs"
import * as path from "path"
import { App, BrowserWindow } from "electron"
import { log } from "../logger"
import storage from "../storage"
import sharedState from "../core/shared-state"
import { checkDatabaseStatus } from "./process-manager"

let watchHandle: fs.FSWatcher | null = null
let lastModifiedTime = 0
let lastDatabaseIds: Set<string> = new Set()
let debounceTimer: NodeJS.Timeout | null = null
const DEBOUNCE_MS = 500 // Debounce rapid file changes

/**
 * Start watching databases.json for changes
 */
export function startDatabaseFileWatcher(app: App): void {
  if (watchHandle) {
    log.warn("[File Watcher] Already watching databases.json")
    return
  }

  const databasesFile = path.join(app.getPath("userData"), "databases.json")
  

  try {
    if (fs.existsSync(databasesFile)) {
      const stats = fs.statSync(databasesFile)
      lastModifiedTime = stats.mtimeMs
      const initialDatabases = storage.loadDatabases(app)
      lastDatabaseIds = new Set(initialDatabases.map((db: any) => db.id))
    }
  } catch (error) {
    log.error("[File Watcher] Error getting initial file stats:", error)
  }

  // Watch the directory (more reliable than watching the file directly)
  const watchDir = path.dirname(databasesFile)
  
  try {
    watchHandle = fs.watch(watchDir, (eventType, filename) => {
      if (filename !== "databases.json") return
      
      // Debounce rapid changes
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      
      debounceTimer = setTimeout(() => {
        handleFileChange(app, databasesFile)
      }, DEBOUNCE_MS)
    })
    
    log.info("[File Watcher] Started watching databases.json")
  } catch (error) {
    log.error("[File Watcher] Error starting file watcher:", error)
  }
}

/**
 * Handle file change event
 */
async function handleFileChange(app: App, databasesFile: string): Promise<void> {
  try {

    if (!fs.existsSync(databasesFile)) {
      log.debug("[File Watcher] databases.json deleted")
      return
    }
    
    const stats = fs.statSync(databasesFile)
    
    // Always check for changes, even if mtimeMs hasn't changed (handles rapid writes)

    const currentDatabases = storage.loadDatabases(app)
    const currentIds = new Set(currentDatabases.map((db: any) => db.id))
    const newDatabaseIds = new Set([...currentIds].filter(id => !lastDatabaseIds.has(id)))
    const removedDatabaseIds = new Set([...lastDatabaseIds].filter(id => !currentIds.has(id)))
    

    const hasChanges = newDatabaseIds.size > 0 || removedDatabaseIds.size > 0 || currentDatabases.length !== lastDatabaseIds.size
    
    // Only skip if no actual changes detected AND mtimeMs hasn't changed
    if (!hasChanges && stats.mtimeMs <= lastModifiedTime) {
      // File wasn't actually modified (could be a false positive)
      return
    }
    
    lastModifiedTime = stats.mtimeMs
    
    log.debug("[File Watcher] databases.json changed, checking for updates")
    
    const runningDatabases = sharedState.getRunningDatabases()
    const mainWindow = sharedState.getMainWindow()
    
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    
    if (newDatabaseIds.size > 0) {
      log.info(`[File Watcher] Detected ${newDatabaseIds.size} newly added database(s): ${Array.from(newDatabaseIds).join(', ')}`)
    }
    
    if (removedDatabaseIds.size > 0) {
      log.info(`[File Watcher] Detected ${removedDatabaseIds.size} removed database(s): ${Array.from(removedDatabaseIds).join(', ')}`)
    }
    

    lastDatabaseIds = new Set(currentIds)
    
    // Always send update event when file changes (even if no new databases, in case of updates)
    // This ensures the UI refreshes and shows the latest state
    log.debug(`[File Watcher] Sending databases-updated event (changes: ${hasChanges ? 'yes' : 'no'})`)
    mainWindow.webContents.send("databases-updated")
    

    for (const db of currentDatabases) {
      const wasRunning = runningDatabases.has(db.id)
      const shouldBeRunning = db.status === "running" || db.status === "starting"
      
      // If status changed, check actual process status
      if (shouldBeRunning && !wasRunning) {


        if (db.pid && typeof db.pid === 'number') {
          try {

            process.kill(db.pid, 0) // Signal 0 checks if process exists

            log.debug(`[File Watcher] Database ${db.id} is running (PID: ${db.pid}), updating state`)
            

            mainWindow.webContents.send("database-status-changed", {
              id: db.id,
              status: db.status || "running",
              pid: db.pid,
            })
          } catch (error: any) {

            if (error.code === 'ESRCH') {

              log.debug(`[File Watcher] Database ${db.id} marked as running but process not found, updating status`)
              db.status = "stopped"
              db.pid = null
              storage.upsertDatabase(app, db)
              
              mainWindow.webContents.send("database-status-changed", {
                id: db.id,
                status: "stopped",
                pid: null,
              })
            } else {
              log.error(`[File Watcher] Error checking PID ${db.pid} for ${db.id}:`, error)
            }
          }
        } else if (db.status === "running") {
          // File says running but no PID - update file
          log.debug(`[File Watcher] Database ${db.id} marked as running but no PID, updating status`)
          db.status = "stopped"
          db.pid = null
          storage.upsertDatabase(app, db)
          
          mainWindow.webContents.send("database-status-changed", {
            id: db.id,
            status: "stopped",
            pid: null,
          })
        }
      } else if (!shouldBeRunning && wasRunning) {

        log.debug(`[File Watcher] Database ${db.id} marked as stopped, cleaning up`)
        

        runningDatabases.delete(db.id)
        

        mainWindow.webContents.send("database-status-changed", {
          id: db.id,
          status: "stopped",
          pid: null,
        })
      } else if (shouldBeRunning && wasRunning) {
        // Database is running, check if PID changed
        const runningDb = runningDatabases.get(db.id)
        if (runningDb && db.pid && runningDb.process.pid !== db.pid) {
          log.debug(`[File Watcher] Database ${db.id} PID changed from ${runningDb.process.pid} to ${db.pid}`)
          
          // PID changed, send update
          mainWindow.webContents.send("database-status-changed", {
            id: db.id,
            status: db.status,
            pid: db.pid,
          })
        }
      }
    }
    

    for (const [id, runningDb] of runningDatabases.entries()) {
      if (!currentIds.has(id)) {
        log.debug(`[File Watcher] Database ${id} was deleted, cleaning up`)
        runningDatabases.delete(id)
        
        mainWindow.webContents.send("database-status-changed", {
          id,
          status: "stopped",
          pid: null,
        })
      }
    }
    
    // Note: databases-updated event is already sent above when changes are detected
    // This ensures the UI refreshes immediately when databases are added/removed
    
  } catch (error) {
    log.error("[File Watcher] Error handling file change:", error)
  }
}

/**
 * Stop watching databases.json
 */
export function stopDatabaseFileWatcher(): void {
  if (watchHandle) {
    watchHandle.close()
    watchHandle = null
    log.info("[File Watcher] Stopped watching databases.json")
  }
  
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

