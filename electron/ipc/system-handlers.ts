import { ipcMain, shell, BrowserWindow, App } from "electron"
import { exec, execSync } from "child_process"
import sharedState from "../core/shared-state"
import storage from "../storage"
import { cleanupDatabaseTempFiles } from "../utils/cleanup-utils"
import { killAllDatabaseProcesses } from "../database/process-manager"
import * as https from "https"

/**
 * Register system IPC handlers
 */
export function registerSystemHandlers(app: App): void {
  if (!ipcMain) {
    return
  }

  // External link handler
  ipcMain.handle("open-external-link", async (event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (error: any) {
      console.error("[External Link] Error opening URL:", error)
      return { success: false, error: error.message }
    }
  })

  // Onboarding status check handler
  ipcMain.handle("is-onboarding-complete", async () => {
    try {
      const mainWindow = sharedState.getMainWindow()
      if (!mainWindow?.webContents) {
        return false
      }
      // Use executeJavaScript to read localStorage from the renderer context
      // Suppress SecurityError logs since they're expected when localStorage is blocked
      const isComplete = await mainWindow.webContents.executeJavaScript(
        '(function() { try { const liquidbKey = localStorage.getItem(\'liquidb-onboarding-complete\'); const legacyKey = localStorage.getItem(\'onboarding-complete\'); return liquidbKey === \'true\' || legacyKey === \'true\'; } catch(e) { if (e.name !== "SecurityError") { console.error("[Onboarding] Error checking:", e); } return false; } })()'
      )
      return isComplete || false
    } catch (error: any) {
      // Only log non-SecurityError errors
      if (error?.name !== 'SecurityError' && !error?.message?.includes('localStorage')) {
        console.error("[Onboarding] Error checking onboarding status:", error)
      }
      return false
    }
  })

  // App quit handler
  ipcMain.handle("app:quit", async () => {
    try {
      app.quit()
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e?.message || "quit failed" }
    }
  })


  ipcMain.handle("get-app-version", async () => {
    try {
      const version = app.getVersion()
      return { success: true, version }
    } catch (error: any) {
      console.error("[App Version] Error getting version:", error)
      return { success: false, error: error.message || "Failed to get version" }
    }
  })


  ipcMain.handle("get-electron-version", async () => {
    try {

      const electronVersion = process.versions.electron || "unknown"
      return { success: true, version: electronVersion }
    } catch (error: any) {
      console.error("[Electron Version] Error getting version:", error)
      return { success: false, error: error.message || "Failed to get Electron version" }
    }
  })


  ipcMain.handle("get-platform-info", async () => {
    try {
      const os = require("os")
      const platform = process.platform
      const arch = process.arch
      
      let platformDisplay = ""
      
      if (platform === "darwin") {
        // macOS
        if (arch === "arm64") {
          platformDisplay = "macOS (Apple Silicon)"
        } else if (arch === "x64") {
          platformDisplay = "macOS (Intel)"
        } else {
          platformDisplay = `macOS (${arch})`
        }
      } else {
        platformDisplay = `${platform} (${arch})`
      }
      
      return {
        success: true,
        platform: platformDisplay,
        rawPlatform: platform,
        architecture: arch,
        osType: os.type(),
        osRelease: os.release(),
      }
    } catch (error: any) {
      console.error("[Platform Info] Error getting platform info:", error)
      return { success: false, error: error.message || "Failed to get platform info" }
    }
  })


  ipcMain.handle("get-changelog", async () => {
    try {
      const version = app.getVersion()
      // Try to fetch changelog from GitHub releases API
      const https = require("https")
      return new Promise((resolve) => {
        const url = `https://api.github.com/repos/liquidb-app/LiquiDB/releases/tags/v${version}`
        
        const request = https.get(url, (res: any) => {
          if (res.statusCode !== 200) {
            resolve({ success: false, error: `API returned status code ${res.statusCode}` })
            return
          }
          
          let data = ''
          res.on('data', (chunk: string) => {
            data += chunk
          })
          
          res.on('end', () => {
            try {
              const release = JSON.parse(data)
              resolve({ 
                success: true, 
                changelog: release.body || `## Version ${version}\n\nSee the full changelog on GitHub.` 
              })
            } catch (error: any) {
              resolve({ success: false, error: error.message })
            }
          })
        })
        
        request.on('error', (error: any) => {
          resolve({ success: false, error: error.message })
        })
        
        request.setTimeout(5000, () => {
          request.destroy()
          resolve({ success: false, error: 'Request timeout' })
        })
      })
    } catch (error: any) {
      console.error("[Changelog] Error getting changelog:", error)
      return { success: false, error: error.message || "Failed to get changelog" }
    }
  })

  // Fetch programming quotes
  ipcMain.handle("fetch-quotes", async () => {
    return new Promise((resolve) => {
      const url = 'https://programming-quotesapi.vercel.app/api/bulk'
      
      const request = https.get(url, (res) => {

        if (res.statusCode !== 200) {
          console.error(`[Quotes] API returned status code ${res.statusCode}`)
          resolve({ success: false, error: `API returned status code ${res.statusCode}` })
          return
        }
        

        const contentType = res.headers['content-type'] || ''
        if (!contentType.includes('application/json')) {
          console.error(`[Quotes] API returned non-JSON content type: ${contentType}`)
          resolve({ success: false, error: `API returned non-JSON content type: ${contentType}` })
          return
        }
        
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          try {

            if (data.trim().startsWith('<!DOCTYPE') || data.trim().startsWith('<html')) {
              console.error('[Quotes] API returned HTML instead of JSON (likely an error page)')
              resolve({ success: false, error: 'API returned HTML instead of JSON' })
              return
            }
            
            const quotes = JSON.parse(data)
            if (Array.isArray(quotes) && quotes.length > 0) {
              const validQuotes = quotes.filter(q => q && q.quote && q.author)
              if (validQuotes.length > 0) {
                resolve({ success: true, data: validQuotes })
              } else {
                resolve({ success: false, error: 'No valid quotes in response' })
              }
            } else {
              resolve({ success: false, error: 'Invalid quotes data structure' })
            }
          } catch (error: any) {
            // Provide more specific error message
            const errorMessage = error.message || 'Unknown parsing error'
            console.error(`[Quotes] JSON parse error: ${errorMessage}`)
            console.error(`[Quotes] Response data preview: ${data.substring(0, 200)}`)
            resolve({ success: false, error: `Failed to parse JSON: ${errorMessage}` })
          }
        })
      })
      
      request.on('error', (error: any) => {
        console.error(`[Quotes] Request error: ${error.message}`)
        resolve({ success: false, error: error.message })
      })
      
      request.setTimeout(5000, () => {
        request.destroy()
        console.error('[Quotes] Request timeout')
        resolve({ success: false, error: 'Request timeout' })
      })
    })
  })


  let cachedStats: any = null
  let previousAppCpuUsage = 0
  let previousAppCpuCheckTime = Date.now()
  let lastStatsCallTime = 0
  const STATS_THROTTLE_MS = 3000 // Throttle to once every 3 seconds

  ipcMain.handle("get-system-stats", async () => {
    try {

      const now = Date.now()
      if (cachedStats && (now - lastStatsCallTime) < STATS_THROTTLE_MS) {
        return cachedStats
      }
      lastStatsCallTime = now
      
      const os = require('os')
      const runningDatabases = sharedState.getRunningDatabases()
      
      // Also check databases.json for running databases
      let runningCount = runningDatabases.size
      try {
        const databases = storage.loadDatabases(app)
        const actuallyRunning = databases.filter((db: any) => {
          if (db.status === "running" || db.status === "starting") {

            if (db.pid && typeof db.pid === 'number') {
              try {
                process.kill(db.pid, 0) // Signal 0 checks if process exists
                return true
              } catch {
                return false
              }
            }
            return false
          }
          return false
        })
        // Use the higher count (either from sharedState or from file)
        runningCount = Math.max(runningCount, actuallyRunning.length)
      } catch (error) {
        // If we can't check, use sharedState count
        console.warn("[System Stats] Error checking database file for count:", error)
      }
      

      const uptimeSeconds = Math.floor(process.uptime())
      
      // Collect all PIDs for app processes (main + renderer + database instances)
      const pids: number[] = []
      

      pids.push(process.pid)
      

      BrowserWindow.getAllWindows().forEach(win => {
        const pid = win.webContents.getProcessId()
        if (pid) {
          pids.push(pid)
        }
      })
      

      runningDatabases.forEach((db) => {
        if (!db.process.killed && db.process.exitCode === null) {
          if (db.process.pid) {
            pids.push(db.process.pid)
          }
        }
      })
      
      // Also add PIDs from databases.json
      try {
        const databases = storage.loadDatabases(app)
        databases.forEach((db: any) => {
          if ((db.status === "running" || db.status === "starting") && db.pid && typeof db.pid === 'number') {
            try {
              process.kill(db.pid, 0) // Check if process exists
              if (!pids.includes(db.pid)) {
                pids.push(db.pid)
              }
            } catch {

            }
          }
        })
      } catch (error) {
        // Ignore errors
      }
      

      let totalMemoryUsage = 0
      let totalCpuUsage = 0
      
      if (pids.length > 0) {
        try {

          const pidList = pids.join(',')
          const psOutput = execSync(`ps -o pid,rss,pcpu -p ${pidList}`, { 
            encoding: 'utf8', 
            timeout: 2000,
            maxBuffer: 1024 * 1024 // 1MB buffer
          })
          const lines = psOutput.trim().split('\n')
          
          // Skip header line
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue
            
            const parts = line.split(/\s+/)
            if (parts.length >= 3) {
              // RSS is in KB, convert to bytes
              const memoryKB = parseInt(parts[1]) || 0
              totalMemoryUsage += memoryKB * 1024
              
              // CPU percentage
              const cpuPercent = parseFloat(parts[2]) || 0
              totalCpuUsage += cpuPercent
            }
          }
        } catch (psError: any) {

          if (psError.code === 'EAGAIN' || psError.errno === -35) {
            console.log(`Resource temporarily unavailable (EAGAIN) for stats, using fallback`)
            // Use fallback with delays
            for (const pid of pids) {
              try {

                await new Promise(resolve => setTimeout(resolve, 50))
                const psOutput = execSync(`ps -o rss,pcpu -p ${pid}`, { 
                  encoding: 'utf8', 
                  timeout: 1000,
                  maxBuffer: 64 * 1024 // 64KB buffer
                })
                const lines = psOutput.trim().split('\n')
                if (lines.length > 1) {
                  const parts = lines[1].trim().split(/\s+/)
                  if (parts.length >= 2) {
                    const memoryKB = parseInt(parts[0]) || 0
                    totalMemoryUsage += memoryKB * 1024
                    
                    const cpuPercent = parseFloat(parts[1]) || 0
                    totalCpuUsage += cpuPercent
                  }
                }
              } catch (individualError: any) {
                // Skip this PID if we can't get stats (only log critical errors)
                if (individualError.code !== 'EAGAIN' && individualError.code !== 'ETIMEDOUT') {
                  console.log(`Could not get stats for PID ${pid}:`, individualError.message)
                }
              }
            }
          } else {
            // Only log non-timeout/non-EAGAIN errors
            if (psError.code !== 'EAGAIN' && psError.code !== 'ETIMEDOUT') {
              console.log(`Could not get process stats:`, psError.message)
            }
            // Fallback: try individual processes with delays
            for (const pid of pids) {
              try {

                await new Promise(resolve => setTimeout(resolve, 50))
                const psOutput = execSync(`ps -o rss,pcpu -p ${pid}`, { 
                  encoding: 'utf8', 
                  timeout: 1000,
                  maxBuffer: 64 * 1024 // 64KB buffer
                })
                const lines = psOutput.trim().split('\n')
                if (lines.length > 1) {
                  const parts = lines[1].trim().split(/\s+/)
                  if (parts.length >= 2) {
                    const memoryKB = parseInt(parts[0]) || 0
                    totalMemoryUsage += memoryKB * 1024
                    
                    const cpuPercent = parseFloat(parts[1]) || 0
                    totalCpuUsage += cpuPercent
                  }
                }
              } catch (individualError: any) {
                // Only log non-timeout/non-EAGAIN errors
                if (individualError.code !== 'EAGAIN' && individualError.code !== 'ETIMEDOUT') {
                  console.log(`Could not get stats for PID ${pid}:`, individualError.message)
                }
              }
            }
          }
        }
      }
      
      // Cap CPU usage at 100% (could be more if multiple cores)
      totalCpuUsage = Math.min(100, totalCpuUsage)
      

      let diskUsed = 0
      let diskTotal = 0
      let diskFree = 0
      try {
        // Use df command to get disk usage for home directory
        const homeDir = os.homedir()
        const dfOutput = execSync(`df -k "${homeDir}"`, { 
          encoding: 'utf8', 
          timeout: 1000,
          maxBuffer: 64 * 1024 // 64KB buffer
        })
        const lines = dfOutput.split('\n')
        if (lines.length > 1) {

          const parts = lines[1].trim().split(/\s+/)
          if (parts.length >= 4) {
            diskTotal = parseInt(parts[1]) * 1024 // Convert KB to bytes
            diskUsed = parseInt(parts[2]) * 1024 // Convert KB to bytes
            diskFree = parseInt(parts[3]) * 1024 // Convert KB to bytes
          }
        }
      } catch (diskError: any) {

        if (diskError.code === 'EAGAIN' || diskError.errno === -35) {
          console.log(`Resource temporarily unavailable (EAGAIN) for disk stats, using defaults`)
        } else {
          console.log(`Could not get disk usage:`, diskError.message)
        }
      }
      

      // Use number of active processes as a proxy for load
      const processCount = pids.length
      const loadAverage = [processCount * 0.1, processCount * 0.1, processCount * 0.1]
      
      // Store for next call
      previousAppCpuUsage = totalCpuUsage
      previousAppCpuCheckTime = Date.now()
      


      const stats = {
        success: true,
        memory: {
          total: totalMemoryUsage || 0, // App total memory (no free/total system concept)
          free: 0, // Not applicable for app stats
          used: totalMemoryUsage || 0,
          percentage: 0 // Not applicable for app stats
        },
        cpu: {
          usage: totalCpuUsage || 0,
          percentage: totalCpuUsage || 0
        },
        disk: diskTotal > 0 ? {
          total: diskTotal,
          free: diskFree,
          used: diskUsed,
          percentage: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0
        } : null,
        uptime: uptimeSeconds || 0,
        loadAverage: loadAverage || [0, 0, 0],
        runningDatabases: runningCount || 0
      }
      
      // Cache stats for error recovery
      cachedStats = stats
      
      return stats
    } catch (error: any) {

      if (error.code === 'EAGAIN' || error.errno === -35) {
        console.log(`[System Stats] Resource temporarily unavailable (EAGAIN), returning cached stats`)

        if (cachedStats) {

          const runningDatabases = sharedState.getRunningDatabases()
          return {
            ...cachedStats,
            uptime: Math.floor(process.uptime()),
            runningDatabases: runningDatabases.size || 0
          }
        }
      }
      
      console.error(`[System Stats] Error getting app stats:`, error)
      console.error(`[System Stats] Error details:`, error.message)
      if (error.stack) {
        console.error(`[System Stats] Stack trace:`, error.stack)
      }
      

      if (cachedStats) {
        console.log(`[System Stats] Returning cached stats due to error`)

        const runningDatabases = sharedState.getRunningDatabases()
        return {
          ...cachedStats,
          uptime: Math.floor(process.uptime()),
          runningDatabases: runningDatabases.size || 0
        }
      }
      
      // Last resort: return default values (but this should rarely happen)
      console.warn(`[System Stats] No cached stats available, returning defaults`)
      const runningDatabases = sharedState.getRunningDatabases()
      return {
        success: true,
        memory: {
          total: 0,
          free: 0,
          used: 0,
          percentage: 0
        },
        cpu: {
          usage: 0,
          percentage: 0
        },
        disk: null,
        uptime: Math.floor(process.uptime()),
        loadAverage: [0, 0, 0],
        runningDatabases: runningDatabases.size || 0
      }
    }
  })


  ipcMain.handle("cleanup-dead-processes", async () => {
    try {
      const runningDatabases = sharedState.getRunningDatabases()
      // Only log if there's actual work to do
      let cleanedCount = 0
      

      for (const [id, db] of runningDatabases) {
        if (db.process.killed || db.process.exitCode !== null) {
          console.log(`[Cleanup] Removing dead process ${id} (PID: ${db.process.pid})`)
          runningDatabases.delete(id)
          cleanedCount++
        }
      }
      

      const databases = storage.loadDatabases(app)
      let updatedCount = 0
      
      for (let i = 0; i < databases.length; i++) {
        const db = databases[i] as any
        if (db.status === "running" || db.status === "starting") {

          const isInRunningMap = runningDatabases.has(db.id)
          if (!isInRunningMap) {
            console.log(`[Cleanup] Updating database ${db.id} status from ${db.status} to stopped`)
            databases[i].status = "stopped"
            databases[i].pid = null
            updatedCount++
          }
        }
      }
      
      if (updatedCount > 0) {
        storage.saveDatabases(app, databases)
        console.log(`[Cleanup] Updated ${updatedCount} database statuses in storage`)
      }
      
      // Only log if cleanup actually did something
      if (cleanedCount > 0 || updatedCount > 0) {
        console.log(`[Cleanup] Cleanup complete: removed ${cleanedCount} dead processes, updated ${updatedCount} statuses`)
      }
      return { success: true, cleanedProcesses: cleanedCount, updatedStatuses: updatedCount }
    } catch (error: any) {
      console.error("[Cleanup] Error during cleanup:", error)
      return { success: false, error: error.message }
    }
  })
}

