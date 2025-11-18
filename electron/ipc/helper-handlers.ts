import { ipcMain, App } from "electron"
import HelperServiceManager from "../helper-service"
import sharedState from "../core/shared-state"

/**
 * Register helper service IPC handlers
 */
export function registerHelperHandlers(app: App): void {
  if (!ipcMain) {
    return
  }

  ipcMain.handle("helper:status", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        console.log("[Helper Status] Initializing helper service...")
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const status = await helperService.getStatus()
      return { success: true, data: status }
    } catch (error: any) {
      console.error("[Helper Status] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("helper:start", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const success = await helperService.start()
      return { success, error: success ? null : "Failed to start helper service" }
    } catch (error: any) {
      console.error("[Helper Start] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("helper:restart", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const success = await helperService.restart()
      return { success, error: success ? null : "Failed to restart helper service" }
    } catch (error: any) {
      console.error("[Helper Restart] Error:", error)
      return { success: false, error: error.message }
    }
  })


  ipcMain.handle("helper:start-on-demand", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const success = await helperService.start()
      if (!success) {
        return { success: false, error: "Failed to start helper service" }
      }
      return { success: true, error: null }
    } catch (error: any) {
      console.error("[Helper Start On Demand] Error:", error)
      const errorMessage = error.message || "Failed to start helper service"
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle("helper:install", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const success = await helperService.install()
      if (!success) {
        return { success: false, error: "Failed to install helper service" }
      }
      return { success: true, error: null }
    } catch (error: any) {
      console.error("[Helper Install] Error:", error)
      const errorMessage = error.message || "Failed to install helper service"
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle("helper:cleanup", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        console.log("[Helper Cleanup] Initializing helper service...")
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const result = await helperService.requestCleanup()
      return result
    } catch (error: any) {
      console.error("[Helper Cleanup] Error:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("helper:health", async (event) => {
    try {
      let helperService = sharedState.getHelperService()
      if (!helperService) {
        console.log("[Helper Health] Initializing helper service...")
        helperService = new HelperServiceManager(app)
        sharedState.setHelperService(helperService)
      }
      const isHealthy = await helperService.isHealthy()
      return { success: true, data: { isHealthy } }
    } catch (error: any) {
      console.error("[Helper Health] Error:", error)
      return { success: false, error: error.message }
    }
  })
}

