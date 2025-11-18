import { ipcMain, App } from "electron"
import * as net from "net"
import { exec } from "child_process"
import { getBannedPortsFile, checkPortInUse, getProcessUsingPort } from "../utils/port-utils"
import * as fs from "fs"
import * as path from "path"
import sharedState from "../core/shared-state"
import storage from "../storage"

/**
 * Register port IPC handlers
 */
export function registerPortHandlers(app: App): void {
  if (!ipcMain) {
    return
  }

  ipcMain.handle("check-port", async (event, port: number) => {
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return { available: false, reason: "invalid_range" }
    }

    if (portNum < 1024) {
      // macOS privileged port range
      return { available: false, reason: "privileged" }
    }


    const bannedFile = getBannedPortsFile(app)
    let banned: number[] = []
    try {
      if (fs.existsSync(bannedFile)) {
        banned = JSON.parse(fs.readFileSync(bannedFile, "utf-8"))
      }
    } catch {
      banned = []
    }
    if (Array.isArray(banned) && banned.includes(portNum)) {
      return { available: false, reason: "banned" }
    }

    // Fast check by trying to bind
    const canBind = await new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once("error", () => {
        resolve(false)
      })
      server.once("listening", () => {
        server.close(() => resolve(true))
      })
      server.listen(portNum, "127.0.0.1")
    })
    if (!canBind) {
      // Extra diagnostic with lsof if available
      return await new Promise<any>((resolve) => {
        exec(`lsof -i :${portNum} -sTCP:LISTEN -n -P | tail -n +2`, (err: any, stdout: string) => {
          if (stdout && stdout.trim().length > 0) {
            resolve({ available: false, reason: "in_use", details: stdout.trim() })
          } else {
            resolve({ available: false, reason: "in_use" })
          }
        })
      })
    }

    return { available: true }
  })

  ipcMain.handle("check-port-conflict", async (event, port: number, databaseId?: string) => {
    try {
      const inUse = await checkPortInUse(port)

      if (!inUse) {
        // Port is definitively free
        return {
          success: true,
          inUse: false,
        }
      }

      // Port appears to be in use – attempt to get process info
      const processInfo = await getProcessUsingPort(port)

      if (!processInfo) {
        // Couldn't get process info, but port is in use
        return {
          success: true,
          inUse: true,
        }
      }


      const runningDatabases = sharedState.getRunningDatabases()
      const databases = storage.loadDatabases(app)
      

      for (const [id, db] of runningDatabases) {
        if (db.process.pid && db.process.pid.toString() === processInfo.pid) {
          // This is one of our own databases
          // If databaseId is provided and matches, it's the same database - not a conflict
          if (databaseId && id === databaseId) {
            return {
              success: true,
              inUse: false, // Not a conflict - it's the same database
            }
          }
          // If databaseId is provided but doesn't match, it's a different database - conflict
          if (databaseId && id !== databaseId) {
            const dbRecord = databases.find((d) => d.id === id)
            return {
              success: true,
              inUse: true,
              processInfo: {
                processName: `Another database: ${dbRecord?.name || id}`,
                pid: processInfo.pid,
              },
            }
          }
          // If no databaseId provided, check if it's a database process
          const dbRecord = databases.find((d) => d.id === id)
          if (dbRecord) {
            // It's one of our databases, but we don't know which one is checking

            return {
              success: true,
              inUse: true,
              processInfo: {
                processName: `Database: ${dbRecord.name}`,
                pid: processInfo.pid,
              },
            }
          }
        }
      }


      for (const db of databases) {
        if (db.pid && db.pid.toString() === processInfo.pid) {
          // This PID matches a database's stored PID
          // If databaseId is provided and matches, it's the same database - not a conflict
          if (databaseId && db.id === databaseId) {
            return {
              success: true,
              inUse: false, // Not a conflict - it's the same database's stale process
            }
          }
          // If databaseId is provided but doesn't match, it's a different database - conflict
          if (databaseId && db.id !== databaseId) {
            return {
              success: true,
              inUse: true,
              processInfo: {
                processName: `Another database: ${db.name}`,
                pid: processInfo.pid,
              },
            }
          }
          // If no databaseId provided, return as conflict but indicate it's a database
          return {
            success: true,
            inUse: true,
            processInfo: {
              processName: `Database: ${db.name}`,
              pid: processInfo.pid,
            },
          }
        }
      }

      // Not one of our databases - real external conflict
      return {
        success: true,
        inUse: true,
        processInfo: {
          processName: processInfo.processName,
          pid: processInfo.pid,
        },
      }
    } catch (error: any) {
      console.error("[Port Check] Error in check-port-conflict:", error)
      // On error, stay conservative and mark as in use
      return {
        success: false,
        inUse: true,
        error: error?.message || "Unknown error during port check",
      }
    }
  })

  ipcMain.handle("ports:getBanned", async () => {
    try {
      const file = getBannedPortsFile(app)
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, "utf-8"))
        return Array.isArray(parsed) ? parsed : []
      }
    } catch {
      // ignore
    }
    return []
  })

  ipcMain.handle("ports:setBanned", async (event, ports: number[]) => {
    try {
      const file = getBannedPortsFile(app)
      const uniqueSorted = Array.from(new Set((Array.isArray(ports) ? ports : []).filter((p) => Number.isInteger(p))))
        .sort((a, b) => a - b)
      fs.writeFileSync(file, JSON.stringify(uniqueSorted, null, 2), "utf-8")
      return { success: true, data: uniqueSorted }
    } catch (e: any) {
      console.error("[Banned Ports] Error setting banned ports:", e)
      return { success: false, error: e.message || "Failed to set banned ports" }
    }
  })
}

