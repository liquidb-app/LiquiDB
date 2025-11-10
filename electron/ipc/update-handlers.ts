import { ipcMain } from "electron"
import { checkForUpdates, downloadUpdate, installUpdateAndRestart } from "../auto-update"

/**
 * Register update IPC handlers
 */
export function registerUpdateHandlers(): void {
  if (!ipcMain) {
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
      await installUpdateAndRestart()
      // Note: This return won't execute because installUpdateAndRestart
      // calls quitAndInstall which quits the app immediately
      return { success: true }
    } catch (error: any) {
      console.error("[Update IPC] Error installing update:", error)
      return { success: false, error: error.message || "Failed to install update" }
    }
  })
}

