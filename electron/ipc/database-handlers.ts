import { ipcMain, dialog, App, BrowserWindow } from "electron"
import archiver from "archiver"
import * as fs from "fs"
import * as path from "path"
import { execSync } from "child_process"
import sharedState from "../core/shared-state"
import storage from "../storage"
import { startDatabaseProcess, checkDatabaseStatus, stopDatabaseProcessGracefully } from "../database/process-manager"
import { cleanupDatabaseTempFiles } from "../utils/cleanup-utils"
import { configurePostgreSQL, configureMySQL, configureMongoDB, configureRedis } from "../database/config"
import { log } from "../logger"
import { IDatabase } from "../../types/database"

/**
 * Register database IPC handlers
 */
export function registerDatabaseHandlers(app: App): void {
  if (!ipcMain) {
    return
  }

  const runningDatabases = sharedState.getRunningDatabases()
  const mainWindow = sharedState.getMainWindow()

  ipcMain.handle("start-database", async (event, config: any) => {
    const { id } = config
    if (runningDatabases.has(id)) {
      return { success: false, error: "Database already running" }
    }

    try {
      return await startDatabaseProcess(config)
    } catch (error: any) {
      console.error("Failed to start database:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("check-database-status", async (event, id: string) => {
    return await checkDatabaseStatus(id)
  })

  ipcMain.handle("stop-database", async (event, id: string) => {
    // Clean up temporary files when stopping database
    try {
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d: any) => d.id === id)
      if (dbRecord?.containerId) {
        await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
      }
    } catch (error: any) {
      console.error(`[Stop DB] Error cleaning temp files for ${id}:`, error)
    }
    
    const db = runningDatabases.get(id)
    if (!db) {
      return { success: false, error: "Database not running" }
    }

    try {
      // Use graceful shutdown function
      await stopDatabaseProcessGracefully(db, db.config, app)
      runningDatabases.delete(id)
      
      // Update database in storage to clear PID, update status, and clear lastStarted timestamp
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex((db: any) => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = 'stopped'
          databases[dbIndex].pid = null
          databases[dbIndex].lastStarted = undefined // Clear lastStarted to allow fresh start
          storage.saveDatabases(app, databases)
          console.log(`[Database] ${id} status updated to stopped in storage (manual stop)`)
        }
      } catch (error: any) {
        console.error(`[Database] ${id} failed to update storage (manual stop):`, error)
      }
      
      return { success: true }
    } catch (error: any) {
      console.error("Failed to stop database:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("verify-database-instance", async (event, id: string) => {
    const db = runningDatabases.get(id)
    if (!db) {
      return { 
        isRunning: false, 
        error: "Database not in running map",
        pid: null
      }
    }
    
    return {
      isRunning: !db.process.killed && db.process.exitCode === null,
      pid: db.process.pid,
      killed: db.process.killed,
      exitCode: db.process.exitCode
    }
  })

  // Store previous CPU times for calculating CPU usage
  const previousCpuTimes = new Map<string, number>()

  ipcMain.handle("get-database-system-info", async (event, id: string) => {
    try {
      log.debug(`Getting system info for database ${id}`)
      const db = runningDatabases.get(id)
      if (!db) {
        log.warn(`Database ${id} not found in running databases`)
        return { 
          success: false, 
          error: "Database not running",
          pid: null,
          memory: null,
          cpu: null
        }
      }
      
      const pid = db.process.pid
      log.debug(`Database ${id} found with PID ${pid}`)
      
      // Get memory usage and CPU time using ps command (optimized)
      let memoryUsage = null
      let cpuUsage = null
      
      try {
        const { execSync } = require('child_process')
        const psOutput = execSync(`ps -o pid,rss,pcpu -p ${pid}`, { 
          encoding: 'utf8', 
          timeout: 1000,
          maxBuffer: 64 * 1024 // 64KB buffer
        })
        const lines = psOutput.trim().split('\n')
        
        if (lines.length > 1) {
          const parts = lines[1].trim().split(/\s+/)
          if (parts.length >= 3) {
            // RSS is in KB, convert to bytes
            const memoryKB = parseInt(parts[1]) || 0
            memoryUsage = memoryKB * 1024
            
            // CPU percentage
            const cpuPercent = parseFloat(parts[2]) || 0
            cpuUsage = cpuPercent
          }
        }
      } catch (psError: unknown) {
        const typedError = psError as NodeJS.ErrnoException
        // Handle EAGAIN errors gracefully
        if (typedError.code === 'EAGAIN' || typedError.errno === -35) {
          log.debug(`Resource temporarily unavailable (EAGAIN) for database ${id} stats`)
          // Return null values instead of failing
          memoryUsage = null
          cpuUsage = null
        } else {
          log.debug(`Could not get process stats for ${id}:`, typedError?.message ?? typedError)
          memoryUsage = null
          cpuUsage = null
        }
      }
      
      // Calculate uptime from database config in storage
      let uptime = 0
      try {
        const databases = storage.loadDatabases(app)
        const dbConfig = databases.find((d: any) => d.id === id)
        if (dbConfig?.lastStarted) {
          uptime = Math.floor((Date.now() - dbConfig.lastStarted) / 1000)
        }
      } catch (error) {
        log.debug(`Could not get lastStarted for database ${id}:`, error)
        // Uptime will be calculated on frontend from lastStarted
      }
      
      return {
        success: true,
        pid: pid,
        memory: memoryUsage,
        cpu: cpuUsage,
        connections: 0, // Database-specific connection counting would require DB-specific queries
        uptime: uptime
      }
    } catch (error: unknown) {
      const typedError = error instanceof Error ? error : new Error(String(error))
      log.error(`Error getting system info for ${id}:`, typedError.message)
      return { 
        success: false, 
        error: typedError.message,
        pid: null,
        memory: null,
        cpu: null
      }
    }
  })

  ipcMain.handle("get-databases", async () => {
    const list = storage.loadDatabases(app)
    return list
  })

  ipcMain.handle("db:save", async (event, db) => {
    try {
      // Validate name length
      if (db.name && db.name.length > 15) {
        return { 
          success: false, 
          error: `Database name must be 15 characters or less. Current length: ${db.name.length}` 
        }
      }

      // Load existing databases to check for duplicates
      const existingDatabases = storage.loadDatabases(app)
      
      // Prevent username changes - username is set during creation and cannot be changed
      if (db.id) {
        const existingDb = existingDatabases.find((d: any) => d.id === db.id)
        if (existingDb && existingDb.username && db.username && existingDb.username !== db.username) {
          return {
            success: false,
            error: "Username cannot be changed after database creation. It was set during initialization and must remain unchanged."
          }
        }
      }
      
      // Check for duplicate name
      const nameExists = existingDatabases.some((existingDb: any) => 
        existingDb.name === db.name && existingDb.id !== db.id
      )
      if (nameExists) {
        return { 
          success: false, 
          error: `Database name "${db.name}" already exists. Please choose a different name.` 
        }
      }
      
      // Check for duplicate container ID
      const containerIdExists = existingDatabases.some((existingDb: any) => 
        existingDb.containerId === db.containerId && existingDb.id !== db.id
      )
      if (containerIdExists) {
        return { 
          success: false, 
          error: `Container ID "${db.containerId}" already exists. Please try again.` 
        }
      }
      
      // Ensure databases directory exists before saving
      storage.ensureDatabasesDirectory(app)
      
      // Always set dataPath to the correct absolute path using the app's userData directory
      // This ensures consistency regardless of where the app is installed
      const containerId = db.containerId || db.id
      if (containerId) {
        db.dataPath = storage.getDatabaseDataDir(app, containerId)
      }
      
      // Password is stored directly in database config (no keychain)
      const saved = storage.upsertDatabase(app, db)
      return saved
    } catch (error: any) {
      console.error("[Database Save] Error saving database:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("db:getPassword", async (event, id: string) => {
    // Get password directly from database config
    const databases = storage.loadDatabases(app)
    const db = databases.find((d: any) => d.id === id)
    return db?.password || null
  })

  // IPC handler to export a specific database with its data files
  ipcMain.handle("export-database", async (event, databaseConfig: any) => {
    try {
      if (!databaseConfig || !databaseConfig.id) {
        return { success: false, error: "No database provided for export" }
      }

      // Show save dialog for zip file first
      const dateStr = new Date().toISOString().split('T')[0]
      const dbName = databaseConfig.name || 'database'
      const windowForDialog: BrowserWindow | undefined =
        mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
      const saveDialogOptions: Electron.SaveDialogOptions = {
        title: 'Export Database',
        defaultPath: `${dbName}-${dateStr}.zip`,
        filters: [
          { name: 'ZIP Files', extensions: ['zip'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['showOverwriteConfirmation']
      }

      const result = windowForDialog
        ? await dialog.showSaveDialog(windowForDialog, saveDialogOptions)
        : await dialog.showSaveDialog(saveDialogOptions)

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      let zipFilePath = result.filePath
      // Ensure .zip extension
      if (!zipFilePath.endsWith('.zip')) {
        zipFilePath = zipFilePath + '.zip'
      }

      // Prepare export data for this specific database
      const exportDb = { ...databaseConfig }
      
      // Don't export password for security
      exportDb.password = ""

      // Remove sensitive runtime data
      delete exportDb.pid
      delete exportDb.systemInfo
      delete exportDb.status

      const exportData = {
        exportDate: new Date().toISOString(),
        version: "1.0.0",
        database: exportDb
      }

      // Create zip file directly - no temp directory needed
      type ExportSuccess = {
        success: true
        filePath: string
        databaseCount: number
        size: number
      }

      return new Promise<ExportSuccess>((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath)
        const archive = archiver('zip', {
          zlib: { level: 9 }
        })

        let resolved = false

        const cleanupAndResolve = (result: ExportSuccess) => {
          if (resolved) return
          resolved = true
          resolve(result)
        }

        const cleanupAndReject = (err: unknown) => {
          if (resolved) return
          resolved = true
          reject(err instanceof Error ? err : new Error(String(err)))
        }

        output.on('error', cleanupAndReject)
        archive.on('error', cleanupAndReject)

        archive.on('warning', (err: any) => {
          if (err.code !== 'ENOENT') {
            cleanupAndReject(err)
          }
        })

        archive.on('progress', (progress: any) => {
          try {
            if (mainWindow && !mainWindow.isDestroyed() && progress.entries && progress.entries.total > 0) {
              const zipProgress = Math.round((progress.entries.processed / progress.entries.total) * 100)
              mainWindow.webContents.send('export-progress', {
                stage: 'zipping',
                message: `Compressing files... (${zipProgress}%)`,
                progress: zipProgress,
                total: 100
              })
            }
          } catch (error: any) {
            console.error("[Export] Error sending progress update:", error)
            // Don't crash on progress update errors
          }
        })

        output.on('close', () => {
          try {
            const size = archive.pointer()
            cleanupAndResolve({
              success: true,
              filePath: zipFilePath,
              databaseCount: 1,
              size
            })
          } catch (error: any) {
            cleanupAndReject(error)
          }
        })

        archive.pipe(output)
        
        // Add export data as JSON
        archive.append(JSON.stringify(exportData, null, 2), { name: 'database.json' })
        
        // Add database data files if they exist
        const databases = storage.loadDatabases(app)
        const dbRecord = databases.find((d: any) => d.id === databaseConfig.id)
        if (dbRecord?.containerId) {
          const dataDir = storage.getDatabaseDataDir(app, dbRecord.containerId)
          if (fs.existsSync(dataDir)) {
            archive.directory(dataDir, `database-data/${dbRecord.containerId}`)
          }
        }
        
        archive.finalize()
      })
    } catch (error: any) {
      console.error("[Export] Error exporting database:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("db:updateCredentials", async (event, dbConfig: any) => {
    try {
      const { id, username, password, name, oldUsername } = dbConfig
      
      // Load the database from storage
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d: any) => d.id === id)
      
      if (!dbRecord) {
        return { success: false, error: "Database not found" }
      }
      
      // Use password directly from config
  const actualPassword = password || ''
      
      // Check if database is running
      const db = runningDatabases.get(id)
      if (!db) {
        return { success: false, error: "Database must be running to update credentials" }
      }
      
      // Build config object for configuration functions
      // Username cannot be changed - always use the database's existing username
      const config: IDatabase & { password: string; oldUsername: string | null } = {
        ...(dbRecord as IDatabase),
        username: dbRecord.username,
        password: actualPassword || dbRecord.password || '',
        containerId: dbRecord.containerId,
        name: name || dbRecord.name,
        oldUsername: null
      }
      
      console.log(`[Update Credentials] ${id} Updating credentials - username: ${config.username} (cannot be changed)`)
      
      // Configure based on database type
      if (dbRecord.type === "postgresql") {
        await configurePostgreSQL(config, app)
        console.log(`[Update Credentials] PostgreSQL ${id} credentials updated`)
      } else if (dbRecord.type === "mysql") {
        await configureMySQL(config, app)
        console.log(`[Update Credentials] MySQL ${id} credentials updated`)
      } else if (dbRecord.type === "mongodb") {
        await configureMongoDB(config, app)
        console.log(`[Update Credentials] MongoDB ${id} credentials updated`)
      } else if (dbRecord.type === "redis") {
        await configureRedis(config, app)
        console.log(`[Update Credentials] Redis ${id} credentials updated`)
        // Note: Redis password changes require restart for full persistence
        // The CONFIG SET is temporary until restart
      } else {
        return { success: false, error: `Credential update not supported for ${dbRecord.type}` }
      }
      
      return { success: true }
    } catch (error: any) {
      console.error("[Update Credentials] Error updating credentials:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("db:delete", async (event, id: string) => {
    try {
      // Stop the database if it's running
      const db = runningDatabases.get(id)
      if (db) {
        try {
          console.log(`[Delete] Stopping database ${id}`)
          db.process.kill("SIGTERM")
        } catch (error: any) {
          console.error(`[Delete] Error stopping database ${id}:`, error)
        }
        runningDatabases.delete(id)
      }
      
      // Password removed with database (no keychain cleanup needed)
      
      // Delete database data files
      const databases = storage.loadDatabases(app)
      const databaseRecord = databases.find((d: any) => d.id === id)
      if (databaseRecord) {
        const dataDir = storage.getDatabaseDataDir(app, databaseRecord.containerId)
        if (fs.existsSync(dataDir)) {
          try {
            console.log(`[Delete] Removing database files for ${id}: ${dataDir}`)
            fs.rmSync(dataDir, { recursive: true, force: true })
          } catch (error: any) {
            console.error(`[Delete] Error removing database files for ${id}:`, error)
          }
        }
      }
      
      // Delete from storage
      return storage.deleteDatabase(app, id)
    } catch (error: any) {
      console.error(`[Delete] Error deleting database ${id}:`, error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("db:deleteAll", async (event) => {
    try {
      // Stop all running databases first
      for (const [id, db] of runningDatabases) {
        try {
          console.log(`[Delete All] Stopping database ${id}`)
          db.process.kill("SIGTERM")
        } catch (error: any) {
          console.error(`[Delete All] Error stopping database ${id}:`, error)
        }
      }
      runningDatabases.clear()
      
      // Get all databases before deleting them
      const databases = storage.loadDatabases(app)
      
      // Passwords removed with databases (no keychain cleanup needed)
      
      // Delete all database data files
      for (const db of databases) {
        try {
          const dataDir = storage.getDatabaseDataDir(app, (db as any).containerId)
          if (fs.existsSync(dataDir)) {
            console.log(`[Delete All] Removing database files for ${(db as any).id}: ${dataDir}`)
            fs.rmSync(dataDir, { recursive: true, force: true })
          }
        } catch (error: any) {
          console.error(`[Delete All] Error removing database files for ${(db as any).id}:`, error)
        }
      }
      
      // Delete all databases from storage
      storage.deleteAllDatabases(app)
      console.log("[Delete All] All databases and data files deleted successfully")
      return { success: true }
    } catch (error: any) {
      console.error("[Delete All] Error deleting all databases:", error)
      return { success: false, error: error.message }
    }
  })
}

