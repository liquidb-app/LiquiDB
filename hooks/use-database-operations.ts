/**
 * Hook for individual database operations (start, stop, restart, delete, update)
 */

import { useRef, useCallback } from "react"
import { notifySuccess, notifyError, notifyInfo, notifyWarning } from "@/lib/notifications"
import { checkPortConflict, findFreePort } from "@/lib/utils/port-utils"
import { isNameDuplicate, isContainerIdDuplicate } from "@/lib/utils/database-utils"
import type { DatabaseContainer } from "@/lib/types"

interface UseDatabaseOperationsProps {
  databases: DatabaseContainer[]
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>
  isPortBanned: (port: number) => boolean
  onOpenSettings?: (database: DatabaseContainer) => void
}

export function useDatabaseOperations({
  databases,
  setDatabases,
  isPortBanned,
  onOpenSettings,
}: UseDatabaseOperationsProps) {
  const startDatabaseWithErrorHandlingRef = useRef<(id: string) => Promise<void>>(async () => {})

  const startDatabase = useCallback(async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    // Check for port conflicts before starting
    if (targetDb.port) {
      const conflictResult = await checkPortConflict(targetDb.port)
      
      if (conflictResult.inUse) {
        notifyError("Cannot start database", {
          description: `Port ${targetDb.port} is already in use by external process: ${conflictResult.processName} (PID: ${conflictResult.pid}). Please choose a different port.`,
        })
        return
      }
      
      const conflictingDb = databases.find(otherDb => 
        otherDb.id !== targetDb.id && 
        otherDb.port === targetDb.port && 
        (otherDb.status === "running" || otherDb.status === "starting")
      )
      
      if (conflictingDb) {
        notifyError("Cannot start database", {
          description: `Port ${targetDb.port} is already in use by "${conflictingDb.name}". Only one database can use a port at a time.`,
        })
        return
      }
    }

    if (targetDb.status === "starting") {
      notifyWarning("Database already starting", {
        description: `${targetDb.name} is already in the process of starting.`,
      })
      return
    }

    if (isPortBanned(targetDb.port)) {
      notifyError("Cannot start database", {
        description: `Port ${targetDb.port} is banned. Please change the port in database settings.`,
        action: onOpenSettings ? {
          label: "Open Settings",
          onClick: () => onOpenSettings(targetDb)
        } : undefined
      })
      return
    }

    const portConflict = databases.find((db) => 
      db.id !== id && 
      db.port === targetDb.port && 
      (db.status === "running" || db.status === "starting")
    )

    if (portConflict) {
      const conflictType = portConflict.status === "starting" ? "starting up" : "running"
      const suggestedPort = findFreePort(targetDb.port, databases.map(db => db.port))
      
      notifyWarning("Port Conflict Detected", {
        description: `Port ${targetDb.port} is already in use by "${portConflict.name}" (${conflictType}). Database will start anyway, but consider using port ${suggestedPort} instead.`,
        action: {
          label: "Use Suggested Port",
          onClick: async () => {
            const updatedDb = { ...targetDb, port: suggestedPort }
            try {
              // @ts-expect-error - Electron IPC types not available
              await window.electron?.saveDatabase?.(updatedDb)
              setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
              notifySuccess("Port Updated", {
                description: `Database port changed to ${suggestedPort}`,
              })
              await startDatabaseWithErrorHandlingRef.current(id)
            } catch (error) {
              console.log(`[Port Update] Error updating database port:`, error)
              notifyError("Failed to update port", {
                description: "Could not change the database port",
              })
            }
          }
        }
      })
    }

    setDatabases((prev) =>
      prev.map((db) =>
        db.id === id ? { 
          ...db, 
          status: "starting" as const, 
          lastStarted: Date.now(),
          systemInfo: {
            cpu: 0,
            memory: 0,
            connections: 0,
            uptime: 0
          }
        } : db
      )
    )

    try {
      const finalCheck = await checkPortConflict(targetDb.port)
      if (finalCheck.inUse) {
        notifyError("Cannot start database", {
          description: `Port ${targetDb.port} is now in use by ${finalCheck.processName} (PID: ${finalCheck.pid}). Please choose a different port.`,
        })
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "stopped" as const } : db
          )
        )
        return
      }
    } catch (error) {
      console.error(`[Port Check] Final check error:`, error)
    }

    notifyInfo("Starting database", {
      description: `${targetDb.name} is starting up...`,
      duration: 3000,
    })

    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.startDatabase?.(targetDb)
      
      if (result?.success) {
        console.log(`[Database] ${targetDb.name} process started, waiting for status confirmation...`)
        
        setTimeout(() => {
          setDatabases((prev) =>
            prev.map((db) => {
              if (db.id === id && db.status === "starting") {
                console.log(`[Database] ${targetDb.name} startup timeout after 60 seconds`)
                notifyError("Database start timeout", {
                  description: `${targetDb.name} took too long to start. Please check the logs.`,
                  action: {
                    label: "Retry",
                    onClick: () => startDatabaseWithErrorHandlingRef.current(id)
                  }
                })
                return { ...db, status: "stopped" as const }
              }
              return db
            })
          )
        }, 60000)
      } else {
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "stopped" as const } : db
          )
        )
        const errorMessage = result?.error || "Unknown error occurred"
        const errorDescription = (() => {
          if (errorMessage.includes("port") || errorMessage.includes("Port")) {
            return `${targetDb.name}: Port ${targetDb.port} is already in use. Please choose a different port.`
          } else if (errorMessage.includes("permission") || errorMessage.includes("Permission")) {
            return `${targetDb.name}: Permission denied. Please check your system permissions.`
          } else if (errorMessage.includes("not found") || errorMessage.includes("command not found")) {
            return `${targetDb.name}: Database software not found. Please install ${targetDb.type} first.`
          }
          return `${targetDb.name}: ${errorMessage}`
        })()
        
        notifyError("Failed to start database", {
          description: errorDescription,
          action: {
            label: "Retry",
            onClick: () => startDatabaseWithErrorHandlingRef.current(id)
          }
        })
      }
    } catch (error) {
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "stopped" as const } : db
        )
      )
      
      let errorDescription = "Could not connect to database service"
      if (error instanceof Error) {
        if (error.message.includes("ECONNREFUSED") || error.message.includes("connection refused")) {
          errorDescription = "Database service is not responding. Please check if the service is running."
        } else if (error.message.includes("timeout")) {
          errorDescription = "Database service request timed out. Please try again."
        } else if (error.message.includes("ENOENT") || error.message.includes("not found")) {
          errorDescription = "Database service not found. Please check your installation."
        }
      }
      
      notifyError("Failed to start database", {
        description: `${targetDb.name}: ${errorDescription}`,
        action: {
          label: "Retry",
          onClick: () => startDatabaseWithErrorHandlingRef.current(id)
        }
      })
    }
  }, [databases, setDatabases, isPortBanned, onOpenSettings])

  const stopDatabase = useCallback(async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    setDatabases((prev) =>
      prev.map((db) =>
        db.id === id ? { ...db, status: "stopping" as const } : db
      )
    )

    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.stopDatabase?.(id)
      if (result?.success) {
        setDatabases((prev) =>
          prev.map((db) => {
            if (db.id === id) {
              return { ...db, status: "stopped" as const }
            }
            return db
          })
        )
        notifySuccess("Database stopped", {
          description: `${targetDb.name} has been stopped successfully.`,
        })
      } else {
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "running" as const } : db
          )
        )
        notifyError("Failed to stop database", {
          description: result?.error || "Unknown error occurred",
        })
      }
    } catch {
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "running" as const } : db
        )
      )
      notifyError("Failed to stop database", {
        description: "Could not connect to database service",
      })
    }
  }, [databases, setDatabases])

  const restartDatabase = useCallback(async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db) return

    if (db.status === "stopped") {
      await startDatabaseWithErrorHandlingRef.current(id)
      return
    }

    if (db.status === "running" || db.status === "starting") {
      notifyInfo("Restarting database", {
        description: `${db.name} is restarting...`,
      })

      try {
        // @ts-expect-error - Electron IPC types not available
        const stopResult = await window.electron?.stopDatabase?.(id)
        
        if (stopResult?.success) {
          await new Promise(resolve => setTimeout(resolve, 2000))
          await startDatabaseWithErrorHandlingRef.current(id)
        } else {
          notifyError("Failed to restart database", {
            description: "Could not stop the database for restart",
          })
        }
      } catch (error) {
        console.log(`[Restart] Error restarting database ${id}:`, error)
        notifyError("Failed to restart database", {
          description: "Could not restart the database",
        })
      }
    }
  }, [databases])

  const deleteDatabase = useCallback((id: string) => {
    const db = databases.find((d) => d.id === id)
    // @ts-expect-error - Electron IPC types not available
    if (window.electron?.deleteDatabase) {
      // @ts-expect-error - Electron IPC types not available
      window.electron.deleteDatabase(id)
    }
    setDatabases(databases.filter((d) => d.id !== id))
    notifyError("Database removed", {
      description: `${db?.name} has been removed.`,
    })
  }, [databases, setDatabases])

  const updateDatabase = useCallback(async (updatedDatabase: DatabaseContainer) => {
    const originalDatabase = databases.find(db => db.id === updatedDatabase.id)
    if (!originalDatabase) return

    if (isNameDuplicate(updatedDatabase.name, databases, updatedDatabase.id)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${updatedDatabase.name}" already exists. Please choose a different name.`,
      })
      return
    }

    if (isContainerIdDuplicate(updatedDatabase.containerId, databases, updatedDatabase.id)) {
      notifyError("Container ID already exists", {
        description: `A database with container ID "${updatedDatabase.containerId}" already exists. Please try again.`,
      })
      return
    }

    const portChanged = originalDatabase.port !== updatedDatabase.port
    const wasRunning = originalDatabase.status === "running" || originalDatabase.status === "starting"
    
    setDatabases(databases.map((db) => (db.id === updatedDatabase.id ? updatedDatabase : db)))
    
    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.saveDatabase?.(updatedDatabase)
      if (result && result.success === false) {
        notifyError("Failed to update database", {
          description: result.error || "An error occurred while saving the database changes.",
        })
        return
      }
    } catch (error) {
      console.log(`[Port Change] Error saving database ${updatedDatabase.id}:`, error)
      notifyError("Failed to update database", {
        description: "An error occurred while saving the database changes.",
      })
      return
    }
    
    if (portChanged && wasRunning) {
      notifyInfo("Port changed - restarting database", {
        description: `${updatedDatabase.name} is restarting with the new port ${updatedDatabase.port}.`,
      })

      try {
        // @ts-expect-error - Electron IPC types not available
        const stopResult = await window.electron?.stopDatabase?.(updatedDatabase.id)
        
        if (stopResult?.success) {
          setDatabases(prev => prev.map(db => 
            db.id === updatedDatabase.id ? { ...updatedDatabase, status: "stopped" } : db
          ))
          
          await new Promise(resolve => setTimeout(resolve, 2000))
          await startDatabaseWithErrorHandlingRef.current(updatedDatabase.id)
        } else {
          notifyError("Failed to restart database", {
            description: "Could not stop the database for port change",
          })
        }
      } catch (error) {
        console.log(`[Port Change] Error restarting database ${updatedDatabase.id}:`, error)
        notifyError("Failed to restart database", {
          description: "Could not restart the database with new port",
        })
      }
    } else {
      const nameChanged = originalDatabase.name !== updatedDatabase.name
      const portChanged_actual = originalDatabase.port !== updatedDatabase.port
      const iconChanged = originalDatabase.icon !== updatedDatabase.icon
      const autoStartChanged = originalDatabase.autoStart !== updatedDatabase.autoStart
      
      if (nameChanged || portChanged_actual || iconChanged || autoStartChanged) {
        notifySuccess("Settings updated", {
          description: `${updatedDatabase.name} has been updated.`,
        })
      }
    }
  }, [databases, setDatabases])

  const addDatabase = useCallback(async (database: DatabaseContainer) => {
    if (isNameDuplicate(database.name, databases)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${database.name}" already exists. Please choose a different name.`,
      })
      return false
    }

    try {
      // @ts-expect-error - Electron IPC types not available
      if (window.electron?.saveDatabase) {
        // @ts-expect-error - Electron IPC types not available
        await window.electron.saveDatabase(database)
      }
    } catch (error) {
      console.error("[Database Save] Error saving database:", error)
      notifyError("Failed to save database", {
        description: "An error occurred while saving the database.",
      })
      return false
    }

    setDatabases([...databases, database])
    notifySuccess("Database added", {
      description: `${database.name} has been added successfully.`,
    })
    return true
  }, [databases, setDatabases])

  startDatabaseWithErrorHandlingRef.current = startDatabase

  return {
    startDatabase,
    stopDatabase,
    restartDatabase,
    deleteDatabase,
    updateDatabase,
    addDatabase,
    startDatabaseRef: startDatabaseWithErrorHandlingRef,
  }
}

