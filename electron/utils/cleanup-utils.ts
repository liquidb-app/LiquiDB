import * as path from "path"
import * as fs from "fs"
import { App } from "electron"
import storage from "../storage"

/**
 * Cleanup temporary files for a database
 * @param {object} app - Electron app instance
 * @param {string} containerId - Container ID
 * @param {string} dbType - Database type
 */
export async function cleanupDatabaseTempFiles(app: App, containerId: string, dbType: string): Promise<void> {
  try {
    const dataDir = storage.getDatabaseDataDir(app, containerId)
    const tempDir = path.join(dataDir, 'tmp')
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir)
      for (const file of files) {
        try {
          const filePath = path.join(tempDir, file)
          const stats = fs.statSync(filePath)
          // Remove temp files older than 1 hour or larger than 100MB
          const oneHourAgo = Date.now() - (60 * 60 * 1000)
          if (stats.mtimeMs < oneHourAgo || stats.size > 100 * 1024 * 1024) {
            fs.unlinkSync(filePath)
            console.log(`[Cleanup] Removed temp file: ${filePath}`)
          }
        } catch (error: any) {
          // Ignore errors deleting individual files
        }
      }
    }
    
    // Database-specific cleanup
    if (dbType === "postgresql") {
      // Clean up old PostgreSQL log files (keep only last 7 days)
      const logDir = path.join(dataDir, 'log')
      if (fs.existsSync(logDir)) {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
        const files = fs.readdirSync(logDir)
        for (const file of files) {
          if (file.startsWith('postgresql-') && file.endsWith('.log')) {
            try {
              const filePath = path.join(logDir, file)
              const stats = fs.statSync(filePath)
              if (stats.mtimeMs < sevenDaysAgo) {
                fs.unlinkSync(filePath)
                console.log(`[Cleanup] Removed old PostgreSQL log: ${filePath}`)
              }
            } catch (error: any) {
              // Ignore errors
            }
          }
        }
      }
      
      // Clean up old WAL files if they exceed limits (PostgreSQL manages this, but we can check)
      const pgWalDir = path.join(dataDir, 'pg_wal')
      if (fs.existsSync(pgWalDir)) {
        try {
          const files = fs.readdirSync(pgWalDir)
          // If there are more than 32 WAL files (typical for 1GB max_wal_size), clean old ones
          if (files.length > 32) {
            const walFiles = files
              .filter(f => f.match(/^[0-9A-F]{24}$/))
              .map(f => ({
                name: f,
                path: path.join(pgWalDir, f),
                mtime: fs.statSync(path.join(pgWalDir, f)).mtimeMs
              }))
              .sort((a, b) => a.mtime - b.mtime)
            
            // Keep only the 32 most recent WAL files
            const toRemove = walFiles.slice(0, walFiles.length - 32)
            for (const walFile of toRemove) {
              try {
                fs.unlinkSync(walFile.path)
                console.log(`[Cleanup] Removed old WAL file: ${walFile.name}`)
              } catch (error: any) {
                // Ignore errors - file might be in use
              }
            }
          }
        } catch (error: any) {
          // Ignore errors accessing pg_wal directory
        }
      }
    } else if (dbType === "mongodb") {
      // Clean up old MongoDB log files (keep only last 7 days)
      const logFile = path.join(dataDir, 'mongod.log')
      if (fs.existsSync(logFile)) {
        try {
          const stats = fs.statSync(logFile)
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
          // If log file is older than 7 days and larger than 100MB, rotate it
          if (stats.mtimeMs < sevenDaysAgo && stats.size > 100 * 1024 * 1024) {
            const rotatedLog = `${logFile}.${new Date().toISOString().split('T')[0]}`
            fs.renameSync(logFile, rotatedLog)
            console.log(`[Cleanup] Rotated MongoDB log: ${rotatedLog}`)
          }
        } catch (error: any) {
          // Ignore errors
        }
      }
    } else if (dbType === "mysql") {
      // MySQL log files are disabled (redirected to /dev/null), so no log cleanup needed
      // Clean up any large temporary files in MySQL data directory
      try {
        const files = fs.readdirSync(dataDir)
        for (const file of files) {
          // Skip system directories and important files
          if (file === 'mysql' || file === 'tmp' || file.startsWith('.')) {
            continue
          }
          
          const filePath = path.join(dataDir, file)
          try {
            const stats = fs.statSync(filePath)
            // Remove temporary files larger than 50MB or older than 1 day
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
            if (stats.isFile() && (stats.size > 50 * 1024 * 1024 || stats.mtimeMs < oneDayAgo)) {
              // Only remove files that look like temporary files
              if (file.includes('tmp') || file.includes('temp') || file.endsWith('.tmp') || file.match(/^\./)) {
                fs.unlinkSync(filePath)
                console.log(`[Cleanup] Removed MySQL temp file: ${filePath} (size: ${(stats.size / 1024 / 1024).toFixed(2)}MB)`)
              }
            }
          } catch (error: any) {
            // Ignore errors for individual files
          }
        }
      } catch (error: any) {
        // Ignore errors reading directory
        console.debug(`[Cleanup] Could not read MySQL data directory:`, error.message)
      }
    } else if (dbType === "redis") {
      // Clean up old Redis AOF files if they exist
      const aofFile = path.join(dataDir, `appendonly-${containerId}.aof`)
      if (fs.existsSync(aofFile)) {
        try {
          const stats = fs.statSync(aofFile)
          // If AOF file is larger than 500MB, it should be rewritten (Redis handles this, but we can check)
          if (stats.size > 500 * 1024 * 1024) {
            console.log(`[Cleanup] Redis AOF file is large (${(stats.size / 1024 / 1024).toFixed(2)}MB), consider rewriting`)
          }
        } catch (error: any) {
          // Ignore errors
        }
      }
    }
  } catch (error: any) {
    console.error(`[Cleanup] Error cleaning temp files for ${containerId}:`, error)
  }
}

/**
 * Find and clean up orphaned database directories
 * @param {object} app - Electron app instance
 */
export async function cleanupOrphanedDatabases(app: App): Promise<void> {
  try {
    const databases = storage.loadDatabases(app)
    const validContainerIds = new Set(databases.map((db: any) => db.containerId || db.id))
    
    const databasesDir = path.join(app.getPath("userData"), "databases")
    if (!fs.existsSync(databasesDir)) {
      return
    }
    
    const dirs = fs.readdirSync(databasesDir)
    let cleanedCount = 0
    let cleanedSize = 0
    
    for (const dir of dirs) {
      const dirPath = path.join(databasesDir, dir)
      try {
        const stats = fs.statSync(dirPath)
        if (stats.isDirectory() && !validContainerIds.has(dir)) {
          // This directory doesn't belong to any database - it's orphaned
          // Calculate size before deleting
          let dirSize = 0
          try {
            const calculateSize = (currentPath: string): number => {
              let size = 0
              const files = fs.readdirSync(currentPath)
              for (const file of files) {
                const filePath = path.join(currentPath, file)
                try {
                  const fileStats = fs.statSync(filePath)
                  if (fileStats.isDirectory()) {
                    size += calculateSize(filePath)
                  } else {
                    size += fileStats.size
                  }
                } catch (e: any) {
                  // Skip files we can't access
                }
              }
              return size
            }
            dirSize = calculateSize(dirPath)
            
            // Remove orphaned directory
            fs.rmSync(dirPath, { recursive: true, force: true })
            cleanedCount++
            cleanedSize += dirSize
            console.log(`[Cleanup] Removed orphaned database directory: ${dir} (${(dirSize / 1024 / 1024).toFixed(2)}MB)`)
          } catch (error: any) {
            console.error(`[Cleanup] Error removing orphaned directory ${dir}:`, error.message)
          }
        }
      } catch (error: any) {
        // Skip directories we can't access
        console.debug(`[Cleanup] Could not check directory ${dir}:`, error.message)
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[Cleanup] Cleaned up ${cleanedCount} orphaned database directories (total: ${(cleanedSize / 1024 / 1024).toFixed(2)}MB)`)
    }
  } catch (error: any) {
    console.error(`[Cleanup] Error cleaning orphaned databases:`, error)
  }
}

