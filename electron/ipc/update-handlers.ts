import { ipcMain } from "electron"
import { checkForUpdate } from "../github-update"

/**
 * Register update IPC handlers
 */
export function registerUpdateHandlers(): void {
  if (!ipcMain) {
    return
  }

  ipcMain.handle("update:check", async () => {
    try {
      return await checkForUpdate()
    } catch (error: any) {
      console.error("[Update IPC] Error checking for updates:", error)
      return { available: false, error: error.message }
    }
  })
}

