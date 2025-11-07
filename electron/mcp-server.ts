// MCP SDK imports - loaded lazily to avoid crashes
// These will be loaded when initializeMCPServer is called

import { log } from "./logger"
import storage from "./storage"
import * as path from "path"
import * as fs from "fs"
import { App } from "electron"

// Lazy load electron app to avoid crashes if not available
let app: App | null = null
function getApp(): App | null {
  if (!app) {
    try {
      app = require("electron").app
    } catch (error: any) {
      log.error("Failed to get electron app:", error)
      return null
    }
  }
  return app
}

let mcpServer: any = null
let transport: any = null
let isMCPServerRunning = false

interface MCPConnectionInfo {
  name: string
  command: string
  args: string[]
  description: string
  isDevelopment: boolean
}

interface MCPServerStatus {
  running: boolean
  name: string
}

/**
 * Initialize and start the MCP server
 * @param {Object} app - Electron app instance
 * @param {Function} startDatabaseFn - Function to start a database
 * @param {Function} stopDatabaseFn - Function to stop a database
 */
export async function initializeMCPServer(
  appInstance: App,
  startDatabaseFn: (db: any) => Promise<any>,
  stopDatabaseFn: (id: string) => Promise<any>
): Promise<boolean> {
  try {
    log.info("[MCP] Initializing MCP server...")
    log.debug("[MCP] App instance available:", !!appInstance)
    log.debug("[MCP] Start database function available:", typeof startDatabaseFn === 'function')
    log.debug("[MCP] Stop database function available:", typeof stopDatabaseFn === 'function')
    
    // Ensure app is available
    if (!appInstance) {
      log.error("[MCP] App instance not available")
      return false
    }
    
    // Initialize MCP SDK components safely
    let Server: any, StdioServerTransport: any, CallToolRequestSchema: any, ListToolsRequestSchema: any
    
    try {
      log.debug("[MCP] Loading MCP SDK components...")
      Server = require("@modelcontextprotocol/sdk/server/index.js").Server
      StdioServerTransport = require("@modelcontextprotocol/sdk/server/stdio.js").StdioServerTransport
      CallToolRequestSchema = require("@modelcontextprotocol/sdk/types.js").CallToolRequestSchema
      ListToolsRequestSchema = require("@modelcontextprotocol/sdk/types.js").ListToolsRequestSchema
      log.debug("[MCP] MCP SDK components loaded successfully")
    } catch (error: any) {
      log.error("[MCP] Failed to load MCP SDK:", error)
      log.error("[MCP] Error details:", error.message)
      log.error("[MCP] Stack trace:", error.stack)
      return false
    }
    
    mcpServer = new Server(
      {
        name: "liquidb-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    // Set up error handling
    mcpServer.onerror = (error: any) => {
      log.error("[MCP] MCP Server error:", error)
      log.error("[MCP] Error details:", error.message)
      if (error.stack) {
        log.error("[MCP] Stack trace:", error.stack)
      }
      // Don't crash - just log the error
    }

    // List available tools
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "list_databases",
            description: "List all databases in LiquiDB",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "create_database",
            description: "Create a new database instance",
            inputSchema: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Name of the database",
                },
                type: {
                  type: "string",
                  enum: ["postgresql", "mysql", "mongodb", "redis"],
                  description: "Type of database",
                },
                version: {
                  type: "string",
                  description: "Database version (e.g., '16', '8.0', '8')",
                },
                port: {
                  type: "number",
                  description: "Port number for the database",
                },
                username: {
                  type: "string",
                  description: "Username for the database",
                },
                password: {
                  type: "string",
                  description: "Password for the database",
                },
                autoStart: {
                  type: "boolean",
                  description: "Whether to auto-start the database",
                },
              },
              required: ["name", "type", "version", "port", "username", "password"],
            },
          },
          {
            name: "start_database",
            description: "Start a database instance",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Database ID",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "stop_database",
            description: "Stop a database instance",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Database ID",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "update_database",
            description: "Update database settings",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Database ID",
                },
                name: {
                  type: "string",
                  description: "New name for the database",
                },
                port: {
                  type: "number",
                  description: "New port number",
                },
                username: {
                  type: "string",
                  description: "New username",
                },
                password: {
                  type: "string",
                  description: "New password",
                },
                autoStart: {
                  type: "boolean",
                  description: "Whether to auto-start the database",
                },
              },
              required: ["id"],
            },
          },
          {
            name: "delete_database",
            description: "Delete a database instance",
            inputSchema: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  description: "Database ID",
                },
              },
              required: ["id"],
            },
          },
        ],
      }
    })

    // Handle tool calls - use the imported schemas
    mcpServer.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case "list_databases": {
            const databases = storage.loadDatabases(appInstance)
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    databases.map((db: any) => ({
                      id: db.id,
                      name: db.name,
                      type: db.type,
                      version: db.version,
                      port: db.port,
                      status: db.status,
                      username: db.username,
                      autoStart: db.autoStart || false,
                      createdAt: db.createdAt,
                    })),
                    null,
                    2
                  ),
                },
              ],
            }
          }

          case "create_database": {
            const { name, type, version, port, username, password, autoStart } = args

            // Validate required fields
            if (!name || !type || !version || !port || !username || !password) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Missing required fields: name, type, version, port, username, password",
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Check for duplicate name
            const existingDatabases = storage.loadDatabases(appInstance)
            const nameExists = existingDatabases.some((db: any) => db.name === name)
            if (nameExists) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Database name "${name}" already exists`,
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Generate unique ID and container ID
            const id = `db_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            const containerId = `liquidb_${type}_${Date.now()}`

            // Create database object
            const newDatabase = {
              id,
              name,
              type,
              version,
              port: parseInt(port, 10),
              username,
              password,
              status: "stopped",
              containerId,
              createdAt: new Date().toISOString(),
              autoStart: autoStart || false,
            }

            // Save database
            storage.upsertDatabase(appInstance, newDatabase)

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    database: {
                      id: newDatabase.id,
                      name: newDatabase.name,
                      type: newDatabase.type,
                      version: newDatabase.version,
                      port: newDatabase.port,
                      status: newDatabase.status,
                      username: newDatabase.username,
                      autoStart: newDatabase.autoStart,
                    },
                  }),
                },
              ],
            }
          }

          case "start_database": {
            const { id } = args

            if (!id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Database ID is required",
                    }),
                  },
                ],
                isError: true,
              }
            }

            const databases = storage.loadDatabases(appInstance)
            const database = databases.find((db: any) => db.id === id)

            if (!database) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Database with ID "${id}" not found`,
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Start the database
            const result = await startDatabaseFn(database)

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: result.success || false,
                    message: result.success
                      ? `Database "${database.name}" started successfully`
                      : result.error || "Failed to start database",
                  }),
                },
              ],
            }
          }

          case "stop_database": {
            const { id } = args

            if (!id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Database ID is required",
                    }),
                  },
                ],
                isError: true,
              }
            }

            const databases = storage.loadDatabases(appInstance)
            const database = databases.find((db: any) => db.id === id)

            if (!database) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Database with ID "${id}" not found`,
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Stop the database
            const result = await stopDatabaseFn(id)

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: result.success || false,
                    message: result.success
                      ? `Database "${database.name}" stopped successfully`
                      : result.error || "Failed to stop database",
                  }),
                },
              ],
            }
          }

          case "update_database": {
            const { id, ...updates } = args

            if (!id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Database ID is required",
                    }),
                  },
                ],
                isError: true,
              }
            }

            const databases = storage.loadDatabases(appInstance)
            const database = databases.find((db: any) => db.id === id)

            if (!database) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Database with ID "${id}" not found`,
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Check for duplicate name if name is being updated
            if (updates.name && updates.name !== database.name) {
              const nameExists = databases.some((db: any) => db.name === updates.name && db.id !== id)
              if (nameExists) {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify({
                        success: false,
                        error: `Database name "${updates.name}" already exists`,
                      }),
                    },
                  ],
                  isError: true,
                }
              }
            }

            // Update database
            const updatedDatabase = {
              ...database,
              ...updates,
              id, // Ensure ID doesn't change
            }

            // Convert port to number if provided
            if (updates.port !== undefined) {
              updatedDatabase.port = parseInt(updates.port, 10)
            }

            // Always set dataPath to the correct absolute path using the app's userData directory
            // This ensures consistency regardless of where the app is installed
            const containerId = updatedDatabase.containerId || updatedDatabase.id
            if (containerId) {
              updatedDatabase.dataPath = storage.getDatabaseDataDir(appInstance, containerId)
            }

            storage.upsertDatabase(appInstance, updatedDatabase)

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    database: {
                      id: updatedDatabase.id,
                      name: updatedDatabase.name,
                      type: updatedDatabase.type,
                      version: updatedDatabase.version,
                      port: updatedDatabase.port,
                      status: updatedDatabase.status,
                      username: updatedDatabase.username,
                      autoStart: updatedDatabase.autoStart || false,
                    },
                    message: `Database "${updatedDatabase.name}" updated successfully`,
                  }),
                },
              ],
            }
          }

          case "delete_database": {
            const { id } = args

            if (!id) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: "Database ID is required",
                    }),
                  },
                ],
                isError: true,
              }
            }

            const databases = storage.loadDatabases(appInstance)
            const database = databases.find((db: any) => db.id === id)

            if (!database) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      success: false,
                      error: `Database with ID "${id}" not found`,
                    }),
                  },
                ],
                isError: true,
              }
            }

            // Stop database if running
            if (database.status === "running" || database.status === "starting") {
              await stopDatabaseFn(id)
              // Wait a bit for cleanup
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }

            // Delete database
            storage.deleteDatabase(appInstance, id)

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: `Database "${database.name}" deleted successfully`,
                  }),
                },
              ],
            }
          }

          default:
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Unknown tool: ${name}`,
                  }),
                },
              ],
              isError: true,
            }
        }
      } catch (error: any) {
        log.error(`MCP tool error (${name}):`, error)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error.message || "Unknown error occurred",
              }),
            },
          ],
          isError: true,
        }
      }
    })

    // Create stdio transport with error handling
    log.debug("[MCP] Creating stdio transport...")
    try {
      transport = new StdioServerTransport()
      log.debug("[MCP] Stdio transport created successfully")
    } catch (transportError: any) {
      log.error("[MCP] Failed to create stdio transport:", transportError)
      log.error("[MCP] Error details:", transportError.message)
      log.error("[MCP] Stack trace:", transportError.stack)
      return false
    }

    // Connect server to transport with error handling
    log.debug("[MCP] Connecting server to transport...")
    try {
      await mcpServer.connect(transport)
      log.debug("[MCP] Server connected to transport successfully")
    } catch (connectError: any) {
      log.error("[MCP] Failed to connect server to transport:", connectError)
      log.error("[MCP] Error details:", connectError.message)
      log.error("[MCP] Stack trace:", connectError.stack)
      // Clean up transport if connection failed
      transport = null
      return false
    }
    
    isMCPServerRunning = true

    log.info("[MCP] MCP server started successfully on stdio")
    return true
  } catch (error: any) {
    log.error("[MCP] Failed to initialize MCP server:", error)
    log.error("[MCP] Error details:", error.message)
    log.error("[MCP] Stack trace:", error.stack)
    // Clean up on error
    transport = null
    mcpServer = null
    isMCPServerRunning = false
    return false
  }
}

/**
 * Get MCP server connection info
 */
export function getMCPConnectionInfo(): MCPConnectionInfo {
  let command = process.execPath
  let isDevelopment = false
  
  const appInstance = getApp()
  
  // Check if app is packaged (production) or in development
  if (appInstance && appInstance.isPackaged) {
    // Production mode - use the app bundle executable
    if (process.platform === 'darwin') {
      // For macOS, the executable is inside the app bundle
      // process.execPath should already be the correct path
      command = process.execPath
      
      // Verify the path exists
      if (!fs.existsSync(command)) {
        log.warn(`MCP: Executable path does not exist: ${command}`)
        // Fallback to default production path
        command = '/Applications/LiquiDB.app/Contents/MacOS/LiquiDB'
      }
    } else {
      // For other platforms, use execPath directly
      command = process.execPath
    }
  } else {
    // Development mode - need to find the electron binary
    isDevelopment = true
    
    // Try to find electron in node_modules
    const projectRoot = path.resolve(__dirname, '..')
    const electronPath = path.join(projectRoot, 'node_modules', '.bin', 'electron')
    
    if (fs.existsSync(electronPath)) {
      command = electronPath
    } else {
      // Try global electron
      const globalElectron = '/usr/local/bin/electron'
      if (fs.existsSync(globalElectron)) {
        command = globalElectron
      } else {
        // Fallback: use node with electron
        // This is a workaround for development
        const electronPackage = path.join(projectRoot, 'node_modules', 'electron', 'cli.js')
        if (fs.existsSync(electronPackage)) {
          command = 'node'
          // We'll need to adjust args to include electron cli
        } else {
          // Last resort: use execPath
          command = process.execPath
          log.warn(`MCP: Could not find electron binary, using execPath: ${command}`)
        }
      }
    }
  }
  
  const args = ['--mcp']
  
  // In development, if using node, we need to pass electron cli as first arg
  if (isDevelopment && command === 'node') {
    const electronPackage = path.join(path.resolve(__dirname, '..'), 'node_modules', 'electron', 'cli.js')
    if (fs.existsSync(electronPackage)) {
      args.unshift(electronPackage)
    }
  }
  
  return {
    name: "LiquiDB MCP Server",
    command: command,
    args: args,
    description: "MCP server for LiquiDB database management",
    isDevelopment: isDevelopment,
  }
}

/**
 * Stop the MCP server
 */
export async function stopMCPServer(): Promise<void> {
  try {
    if (transport) {
      await transport.close()
      transport = null
    }
    if (mcpServer) {
      mcpServer = null
    }
    isMCPServerRunning = false
    log.info("MCP server stopped")
  } catch (error: any) {
    log.error("Error stopping MCP server:", error)
  }
}

/**
 * Get MCP server status
 */
export function getMCPServerStatus(): MCPServerStatus {
  return {
    running: isMCPServerRunning,
    name: "LiquiDB MCP Server",
  }
}
