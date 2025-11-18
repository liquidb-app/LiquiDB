import { ipcMain } from "electron"
import sharedState from "../core/shared-state"

/**
 * Register auto-launch IPC handlers
 */
export function registerAutoLaunchHandlers(): void {
  if (!ipcMain) {
    return
  }

  ipcMain.handle("auto-launch:isEnabled", async () => {
    try {
      const autoLauncher = sharedState.getAutoLauncher()
      if (!autoLauncher) {


        return false
      }
      return await autoLauncher.isEnabled()
    } catch (error: any) {
      console.error("[Auto-launch] Error checking if enabled:", error)
      return false
    }
  })

  ipcMain.handle("auto-launch:enable", async () => {
    try {
      const autoLauncher = sharedState.getAutoLauncher()
      if (!autoLauncher) {


        return { success: false, error: "Auto-launch is only available in production builds" }
      }
      
      // First check if auto-launch is already enabled
      const isCurrentlyEnabled = await autoLauncher.isEnabled()
      if (isCurrentlyEnabled) {
        console.log("[Auto-launch] Auto-launch is already enabled")
        return { success: true }
      }
      
      console.log("[Auto-launch] Attempting to enable auto-launch...")
      await autoLauncher.enable()
      console.log("[Auto-launch] Successfully enabled startup launch")
      

      const isEnabled = await autoLauncher.isEnabled()
      console.log("[Auto-launch] Verification - isEnabled:", isEnabled)
      
      return { success: true }
    } catch (error: any) {
      console.error("[Auto-launch] Error enabling:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("auto-launch:disable", async () => {
    try {
      const autoLauncher = sharedState.getAutoLauncher()
      if (!autoLauncher) {


        return { success: true }
      }
      
      // First check if auto-launch is actually enabled
      const isCurrentlyEnabled = await autoLauncher.isEnabled()
      if (!isCurrentlyEnabled) {
        console.log("[Auto-launch] Auto-launch is already disabled")
        return { success: true }
      }
      
      console.log("[Auto-launch] Attempting to disable auto-launch...")
      await autoLauncher.disable()
      console.log("[Auto-launch] Successfully disabled startup launch")
      

      const isEnabled = await autoLauncher.isEnabled()
      console.log("[Auto-launch] Verification - isEnabled:", isEnabled)
      
      return { success: true }
    } catch (error: any) {
      console.error("[Auto-launch] Error disabling:", error)
      

      if (error.message && error.message.includes("Can't get login item")) {
        console.log("[Auto-launch] Login item doesn't exist, considering as already disabled")
        return { success: true }
      }
      
      return { success: false, error: error.message }
    }
  })
}
