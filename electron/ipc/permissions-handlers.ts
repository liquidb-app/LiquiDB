import { ipcMain } from "electron"
import { exec } from "child_process"
import { promisify } from "util"
import sharedState from "../core/shared-state"
import { log } from "../logger"

const execAsync = promisify(exec)
const IS_MAC = process.platform === 'darwin'

/**
 * Register permissions IPC handlers
 */
export function registerPermissionsHandlers(): void {
  if (!ipcMain) {
    return
  }

  // Permissions management
  ipcMain.handle("permissions:check", async (event, force: boolean = false) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const result = await permissionsManager.checkAllPermissions(force)
      return { success: true, data: result }
    } catch (error: any) {
      log.error("[Permissions Check] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:getDescriptions", async (event) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const descriptions = permissionsManager.getPermissionDescriptions()
      return { success: true, data: descriptions }
    } catch (error: any) {
      log.error("[Permissions Descriptions] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:openSettings", async (event) => {
    try {
      // macOS: Open System Preferences to Privacy & Security
      await execAsync('open "x-apple.systempreferences:com.apple.preference.security?Privacy"')
      return { success: true }
    } catch (error: any) {
      log.error("[Permissions Open Settings] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:openPermissionPage", async (event, permissionType: string) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const result = await permissionsManager.openPermissionPage(permissionType)
      return { success: result }
    } catch (error: any) {
      log.error("[Permissions Open Permission Page] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:requestCritical", async (event) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const result = await permissionsManager.requestCriticalPermissions()
      return { success: true, data: result }
    } catch (error: any) {
      log.error("[Permissions Request Critical] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:request", async (event, permissionName: string) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const granted = await permissionsManager.requestPermission(permissionName)
      // Re-check permissions after request to ensure state is updated
      await permissionsManager.checkAllPermissions()
      return { success: true, data: { granted } }
    } catch (error: any) {
      log.error("[Permissions Request] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  // Secure storage methods using Electron's safeStorage API
  ipcMain.handle("permissions:encryptString", async (event, text: string) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const encrypted = permissionsManager.encryptString(text)
      if (!encrypted) {
        return { success: false, error: "Encryption not available" }
      }
      return { success: true, data: { encrypted } }
    } catch (error: any) {
      log.error("[Permissions Encrypt String] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:decryptString", async (event, encryptedBuffer: Buffer) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const decrypted = permissionsManager.decryptString(encryptedBuffer)
      if (!decrypted) {
        return { success: false, error: "Decryption failed or not available" }
      }
      return { success: true, data: { decrypted } }
    } catch (error: any) {
      log.error("[Permissions Decrypt String] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })

  ipcMain.handle("permissions:isEncryptionAvailable", async (event) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const available = permissionsManager.isEncryptionAvailable()
      return { success: true, data: { available } }
    } catch (error: any) {
      log.error("[Permissions Is Encryption Available] Error:", error)
      return { success: false, error: error.message || "Unknown error" }
    }
  })
}

