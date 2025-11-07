import { ipcMain } from "electron"
import { exec } from "child_process"
import { promisify } from "util"
import sharedState from "../core/shared-state"

const execAsync = promisify(exec)

/**
 * Register permissions IPC handlers
 */
export function registerPermissionsHandlers(): void {
  if (process.argv.includes('--mcp') || !ipcMain) {
    return
  }

  // Permissions management
  ipcMain.handle("permissions:check", async (event) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      // Keychain functionality removed
      const result = await permissionsManager.checkAllPermissions()
      return { success: true, data: result }
    } catch (error: any) {
      console.error("[Permissions Check] Error:", error)
      return { success: false, error: error.message }
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
      console.error("[Permissions Descriptions] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("permissions:openSettings", async (event) => {
    try {
      // Open System Preferences to Privacy & Security
      await execAsync('open "x-apple.systempreferences:com.apple.preference.security?Privacy"')
      return { success: true }
    } catch (error: any) {
      console.error("[Permissions Open Settings] Error:", error)
      return { success: false, error: error.message }
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
      console.error("[Permissions Open Permission Page] Error:", error)
      return { success: false, error: error.message }
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
      console.error("[Permissions Request Critical] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("permissions:request", async (event, permissionName: string) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      // Keychain functionality removed - skip keychain permission requests
      if (permissionName === 'keychainAccess') {
        return { success: true, data: { granted: false } }
      }
      const granted = await permissionsManager.requestPermission(permissionName)
      return { success: true, data: { granted } }
    } catch (error: any) {
      console.error("[Permissions Request] Error:", error)
      return { success: false, error: error.message }
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
      return { success: true, data: { encrypted } }
    } catch (error: any) {
      console.error("[Permissions Encrypt String] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("permissions:decryptString", async (event, encryptedBuffer: Buffer) => {
    try {
      const permissionsManager = sharedState.getPermissionsManager()
      if (!permissionsManager) {
        return { success: false, error: "Permissions manager not initialized" }
      }
      const decrypted = permissionsManager.decryptString(encryptedBuffer)
      return { success: true, data: { decrypted } }
    } catch (error: any) {
      console.error("[Permissions Decrypt String] Error:", error)
      return { success: false, error: error.message }
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
      console.error("[Permissions Is Encryption Available] Error:", error)
      return { success: false, error: error.message }
    }
  })
}

