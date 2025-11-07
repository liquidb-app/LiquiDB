import { useRef } from "react"
import { notifySuccess, notifyError, notifyWarning, notifyInfo } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"

export const useDatabaseOperations = (
  databases: DatabaseContainer[],
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>,
  setSelectedDatabase: React.Dispatch<React.SetStateAction<DatabaseContainer | null>>,
  setSettingsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setInstanceInfoOpen: React.Dispatch<React.SetStateAction<boolean>>,
  checkPortConflict: (port: number, databaseId?: string) => Promise<{ inUse: boolean; processName?: string; pid?: string }>,
  isPortBanned: (port: number) => boolean,
  findFreePort: (preferredPort: number) => number
) => {
  const startDatabaseWithErrorHandlingRef = useRef<(id: string) => Promise<void>>(async () => {})

  const startDatabaseWithErrorHandling = async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    // Check for port conflicts before starting
    if (targetDb.port) {
      const conflictResult = await checkPortConflict(targetDb.port, id)
      
      // Check for external port conflicts
      if (conflictResult.inUse) {
        notifyError("Cannot start database", {
          description: `Port ${targetDb.port} is already in use by external process: ${conflictResult.processName} (PID: ${conflictResult.pid}). Please choose a different port.`,
        })
        return
      }
      
      // Check for internal port conflicts (other databases in the app)
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

    // Check if database is already running
    if (targetDb.status === "running") {
      notifyWarning("Database already running", {
        description: `${targetDb.name} is already running.`,
      })
      return
    }
    
    // Check if database is already starting by verifying it's actually in the running databases map
    // This prevents duplicate starts while allowing bulk start to work
    // In bulk start scenarios, the status is set to "starting" but the process hasn't started yet
    // So we check the actual backend status to see if it's really starting
    if (targetDb.status === "starting") {
      try {
        const status = await window.electron?.checkDatabaseStatus?.(id)
        // Only prevent if the backend confirms it's actually starting or running
        // If backend says it's stopped, it means the frontend status is stale and we should proceed
        if (status?.status === "running") {
          notifyWarning("Database already running", {
            description: `${targetDb.name} is already running.`,
          })
          return
        }
        // If backend says it's starting, it's actually starting - prevent duplicate
        if (status?.status === "starting") {
          notifyWarning("Database already starting", {
            description: `${targetDb.name} is already in the process of starting.`,
          })
          return
        }
        // If backend says it's stopped, the frontend status is stale - proceed with start
        // This allows bulk start to work properly
      } catch (error) {
        // If check fails, continue anyway - it's likely not actually starting
        console.log(`[Start DB] Status check failed for ${id}, continuing anyway:`, error)
      }
    }

    // Check if the database port is banned
    if (isPortBanned(targetDb.port)) {
      notifyError("Cannot start database", {
        description: `Port ${targetDb.port} is banned. Please change the port in database settings.`,
        action: {
          label: "Open Settings",
          onClick: () => {
            setSelectedDatabase(targetDb)
            setSettingsDialogOpen(true)
          }
        }
      })
      return
    }

    // Enhanced port conflict check - includes both running and starting databases
    const portConflict = databases.find((db) => 
      db.id !== id && 
      db.port === targetDb.port && 
      (db.status === "running" || db.status === "starting")
    )

    if (portConflict) {
      const conflictType = portConflict.status === "starting" ? "starting up" : "running"
      const suggestedPort = findFreePort(targetDb.port)
      
      notifyWarning("Port Conflict Detected", {
        description: `Port ${targetDb.port} is already in use by "${portConflict.name}" (${conflictType}). Database will start anyway, but consider using port ${suggestedPort} instead.`,
        action: {
          label: "Use Suggested Port",
          onClick: async () => {
            // Update the database port and save it
            const updatedDb = { ...targetDb, port: suggestedPort }
            try {
              await window.electron?.saveDatabase?.(updatedDb)
              setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
              notifySuccess("Port Updated", {
                description: `Database port changed to ${suggestedPort}`,
              })
              // Start the database with the new port
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
      
      // Continue with the original port anyway (don't return)
      console.log(`[Port Conflict] Starting database ${id} on port ${targetDb.port} despite conflict with ${portConflict.name}`)
    }

    // Set status to starting and show starting toast
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

      // Final port conflict check right before starting (race condition protection)
      try {
        const finalCheck = await checkPortConflict(targetDb.port, id)
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
      // Continue anyway - the earlier check should have caught it
    }

    notifyInfo("Starting database", {
      description: `${targetDb.name} is starting up...`,
      duration: 3000,
    })

    try {
      const result = await window.electron?.startDatabase?.(targetDb)
      
      if (result?.success) {
        // Database process started successfully - let the real-time listener handle status changes
        // The "starting" status will be maintained until we get a real status change from the process
        console.log(`[Database] ${targetDb.name} process started, waiting for status confirmation...`)
        
        // Add a timeout to prevent databases from staying in "starting" status indefinitely
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
        }, 60000) // 60 second timeout
        
        // Status changes will be handled by the real-time listener
        // No need for manual status checking here
      } else {
        // Start command failed immediately
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "stopped" as const } : db
          )
        )
        // Provide more specific error messages for common failure scenarios
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
      // Network or other error
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "stopped" as const } : db
        )
      )
      
      // Provide more specific error messages for network/connection issues
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
  }

  startDatabaseWithErrorHandlingRef.current = startDatabaseWithErrorHandling

  const handleStartStop = async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    if (targetDb.status === "stopped") {
      const conflictingDb = databases.find((db) => 
        db.id !== id && 
        db.port === targetDb.port && 
        (db.status === "running" || db.status === "starting")
      )

      if (conflictingDb) {
        const conflictType = conflictingDb.status === "starting" ? "starting up" : "running"
        const suggestedPort = findFreePort(targetDb.port)
        
        notifyWarning("Port Conflict Detected", {
          description: `Port ${targetDb.port} is already in use by "${conflictingDb.name}" (${conflictType}). Database will start anyway, but consider using port ${suggestedPort} instead.`,
          action: {
            label: "Use Suggested Port",
            onClick: async () => {
              // Update the database port and save it
              const updatedDb = { ...targetDb, port: suggestedPort }
              try {
                await window.electron?.saveDatabase?.(updatedDb)
                setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
                notifySuccess("Port Updated", {
                  description: `Database port changed to ${suggestedPort}`,
                })
                // Start the database with the new port
                await startDatabaseWithErrorHandlingRef.current(id)
              } catch (error) {
                console.log(`[Port Update] Error updating database port:`, error)
                notifyError("Failed to update port", {
                  description: "Could not change the database port",
                })
              }
            }
          },
          duration: 10000,
        })
        
        // Continue with the original port anyway (don't return)
        console.log(`[Port Conflict] Starting database ${id} on port ${targetDb.port} despite conflict with ${conflictingDb.name}`)
      }

      await startDatabaseWithErrorHandlingRef.current(id)
    } else {
      // Stop the database
      // Set status to stopping first
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "stopping" as const } : db
        )
      )

      try {
        const result = await window.electron?.stopDatabase?.(id)
        if (result?.success) {
          setDatabases((prev) =>
            prev.map((db) => {
              if (db.id === id) {
                // Status change notification will be handled by real-time listener
                return { ...db, status: "stopped" as const }
              }
              return db
            })
          )
          notifySuccess("Database stopped", {
            description: `${targetDb.name} has been stopped successfully.`,
          })
        } else {
          // If stop failed, revert to running status
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
        // If stop failed, revert to running status
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "running" as const } : db
          )
        )
        notifyError("Failed to stop database", {
          description: "Could not connect to database service",
        })
      }
    }
  }

  const handleRefreshStatus = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db) return

    // If database is not running, start it instead of restarting
    if (db.status === "stopped") {
      await startDatabaseWithErrorHandlingRef.current(id)
      return
    }

    // If database is running or starting, restart it
    if (db.status === "running" || db.status === "starting") {
      notifyInfo("Restarting database", {
        description: `${db.name} is restarting...`,
      })

      try {
        // Stop the database first
        const stopResult = await window.electron?.stopDatabase?.(id)
        
        if (stopResult?.success) {
          // Wait a moment for the process to fully stop
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Start the database again - this will trigger the real-time listener notifications
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
  }

  const handleDebugDatabase = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db) return
    
    setSelectedDatabase(db)
    setInstanceInfoOpen(true)
  }

  return {
    startDatabaseWithErrorHandling,
    startDatabaseWithErrorHandlingRef,
    handleStartStop,
    handleRefreshStatus,
    handleDebugDatabase
  }
}

