import { ipcMain } from "electron"

// MCP server is optional - only load if available
let mcpServerModule: any = null
try {
  mcpServerModule = require("../mcp-server")
} catch (error: any) {
  console.log("MCP server module not available:", error.message)
}
const { getMCPServerStatus, getMCPConnectionInfo } = mcpServerModule || {
  getMCPServerStatus: () => ({ running: false }),
  getMCPConnectionInfo: () => null
}

/**
 * Register MCP IPC handlers
 */
export function registerMCPHandlers(): void {
  if (process.argv.includes('--mcp') || !ipcMain) {
    return
  }

  // MCP server status
  ipcMain.handle("mcp:status", async (event) => {
    try {
      const status = getMCPServerStatus()
      return { success: true, data: status }
    } catch (error: any) {
      console.error("[MCP Status] Error:", error)
      return { success: false, error: error.message }
    }
  })

  // MCP connection info
  ipcMain.handle("mcp:connection-info", async (event) => {
    try {
      const info = getMCPConnectionInfo()
      return { success: true, data: info }
    } catch (error: any) {
      console.error("[MCP Connection Info] Error:", error)
      return { success: false, error: error.message }
    }
  })
}

