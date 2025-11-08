import { ipcMain } from "electron"
import { checkForUpdates, downloadUpdate, installUpdateAndRestart } from "../auto-update"

/**
 * Register update IPC handlers
 */
export function registerUpdateHandlers(): void {
  if (process.argv.includes('--mcp') || !ipcMain) {
    return
  }

  ipcMain.handle("update:check", async () => {
    try {
      return await checkForUpdates()
    } catch (error: any) {
      console.error("[Update IPC] Error checking for updates:", error)
      return { available: false, error: error.message }
    }
  })

  ipcMain.handle("update:download", async () => {
    try {
      return await downloadUpdate()
    } catch (error: any) {
      console.error("[Update IPC] Error downloading update:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("update:install", async () => {
    try {
      installUpdateAndRestart()
      return { success: true }
    } catch (error: any) {
      console.error("[Update IPC] Error installing update:", error)
      return { success: false, error: error.message }
    }
  })
}

