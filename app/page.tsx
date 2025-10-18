"use client"

import { useEffect, useState, useRef } from "react"
import { Plus, Database, Play, Square, SettingsIcon, Settings2, Copy, Check, RotateCw, Cog, CheckSquare, CheckSquare2, MousePointer2, Grid3X3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AddDatabaseDialog } from "@/components/add-database-dialog"
import { DatabaseSettingsDialog } from "@/components/database-settings-dialog"
import { PortConflictDialog } from "@/components/port-conflict-dialog"
import { AppSettingsDialog } from "@/components/app-settings-dialog"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import type { DatabaseContainer } from "@/lib/types"

export default function DatabaseManager() {
  const [databases, setDatabases] = useState<DatabaseContainer[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [portConflictDialogOpen, setPortConflictDialogOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseContainer | null>(null)
  const [conflictingPort, setConflictingPort] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastStatusCheck, setLastStatusCheck] = useState<Record<string, number>>({})
  const lastStatusCheckRef = useRef<Record<string, number>>({})
  const [activeTab, setActiveTab] = useState<string>("active")
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)

  // Function to find a free port
  const findFreePort = (preferredPort: number): number => {
    const usedPorts = databases.map(db => db.port)
    let port = preferredPort
    
    // Try the preferred port first
    if (!usedPorts.includes(port)) {
      return port
    }
    
    // Find the next available port starting from preferredPort + 1
    port = preferredPort + 1
    while (usedPorts.includes(port) && port < 65535) {
      port++
    }
    
    return port
  }

  const checkDatabasesFileExists = async () => {
    try {
      // @ts-ignore
      const fileCheck = await window.electron?.checkDatabasesFile?.()
      if (fileCheck && !fileCheck.exists) {
        console.log("[Storage] databases.json file missing during runtime, clearing dashboard")
        setDatabases([])
        
        // Recreate the file
        // @ts-ignore
        const recreateResult = await window.electron?.recreateDatabasesFile?.()
        if (recreateResult?.success) {
          console.log("[Storage] Recreated databases.json file")
        }
        return true
      }
      return false
    } catch (error) {
      console.error("[Storage] Error checking databases file:", error)
      return false
    }
  }

  const handleBulkStart = async (databaseIds: string[]) => {
    console.log(`[Bulk Start] Starting ${databaseIds.length} databases`)
    
    // Show initial toast
    toast.info("Starting Multiple Databases", {
      description: `Starting ${databaseIds.length} databases...`,
      duration: 3000,
    })

    // First, set all databases to "starting" status immediately to prevent race conditions
    setDatabases(prev => prev.map(db => 
      databaseIds.includes(db.id) ? { ...db, status: "starting" as const, lastStarted: Date.now() } : db
    ))

    // Start all databases using the existing startDatabaseWithErrorHandling function
    // This function handles the async nature properly and uses real-time listeners
    const startPromises = databaseIds.map(async (id, index) => {
      try {
        // Add a small delay between starts to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * index))
        }

        const targetDb = databases.find((db) => db.id === id)
        if (!targetDb) return { id, success: false, error: "Database not found" }

        // Check for port conflicts
        const conflictingDb = databases.find((db) => 
          db.id !== id && 
          db.port === targetDb.port && 
          (db.status === "running" || db.status === "starting")
        )

        if (conflictingDb) {
          const conflictType = conflictingDb.status === "starting" ? "starting up" : "running"
          console.log(`[Bulk Start] Port conflict for ${targetDb.name}: port ${targetDb.port} used by ${conflictingDb.name} (${conflictType})`)
          return { id, success: false, error: `Port conflict with ${conflictingDb.name}` }
        }

        // Use the existing startDatabaseWithErrorHandling function
        // This function handles the async startup properly
        await startDatabaseWithErrorHandling(id)
        
        // Since startDatabaseWithErrorHandling doesn't return a value,
        // we'll assume success if no error was thrown
        return { id, success: true, error: null }
      } catch (error) {
        console.error(`[Bulk Start] Error starting database ${id}:`, error)
        return { id, success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Wait for all operations to complete
    const results = await Promise.all(startPromises)
    
    // Count successes and failures
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Show result toast
    if (failed === 0) {
      toast.success("Bulk Start Initiated", {
        description: `Starting ${successful} databases. Status updates will appear as they complete.`,
        duration: 4000,
      })
    } else if (successful === 0) {
      toast.error("Failed to Start Databases", {
        description: `Failed to initiate start for all ${failed} databases`,
        duration: 5000,
      })
    } else {
      toast.warning("Partial Success", {
        description: `Initiated start for ${successful} databases, failed to start ${failed}`,
        duration: 5000,
      })
    }

    console.log(`[Bulk Start] Completed: ${successful} successful, ${failed} failed`)
  }

  const handleBulkStop = async (databaseIds: string[]) => {
    console.log(`[Bulk Stop] Stopping ${databaseIds.length} databases`)
    
    // Show initial toast
    toast.info("Stopping Multiple Databases", {
      description: `Stopping ${databaseIds.length} databases...`,
      duration: 3000,
    })

    // First, set all databases to "stopping" status immediately
    setDatabases(prev => prev.map(db => 
      databaseIds.includes(db.id) ? { ...db, status: "stopping" as const } : db
    ))

    // Stop all databases in parallel
    const stopPromises = databaseIds.map(async (id, index) => {
      try {
        // Add a small delay between stops to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 500 * index))
        }

        // @ts-ignore
        const result = await window.electron?.stopDatabase?.(id)
        return { id, success: result?.success || false, error: result?.error }
      } catch (error) {
        console.error(`[Bulk Stop] Error stopping database ${id}:`, error)
        return { id, success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Wait for all operations to complete
    const results = await Promise.all(stopPromises)
    
    // Count successes and failures
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Show result toast
    if (failed === 0) {
      toast.success("All Databases Stopped", {
        description: `Successfully stopped ${successful} databases`,
        duration: 4000,
      })
    } else if (successful === 0) {
      toast.error("Failed to Stop Databases", {
        description: `Failed to stop all ${failed} databases`,
        duration: 5000,
      })
    } else {
      toast.warning("Partial Success", {
        description: `Stopped ${successful} databases, failed to stop ${failed}`,
        duration: 5000,
      })
    }

    console.log(`[Bulk Stop] Completed: ${successful} successful, ${failed} failed`)
  }

  const toggleDatabaseSelection = (id: string) => {
    setSelectedDatabases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAllDatabases = () => {
    setSelectedDatabases(new Set(databases.map(db => db.id)))
  }

  const clearSelection = () => {
    setSelectedDatabases(new Set())
  }

  const handleBulkStartSelected = () => {
    const selectedIds = Array.from(selectedDatabases)
    if (selectedIds.length === 0) return
    
    handleBulkStart(selectedIds)
    clearSelection()
    setShowBulkActions(false) // Exit selection mode
  }

  const handleBulkStopSelected = () => {
    const selectedIds = Array.from(selectedDatabases)
    if (selectedIds.length === 0) return
    
    handleBulkStop(selectedIds)
    clearSelection()
    setShowBulkActions(false) // Exit selection mode
  }

  useEffect(() => {
    let statusInterval: NodeJS.Timeout | null = null
    let isMounted = true

    const load = async () => {
      // Check if databases.json file exists
      try {
        // @ts-ignore
        const fileCheck = await window.electron?.checkDatabasesFile?.()
        if (fileCheck && !fileCheck.exists) {
          console.log("[Storage] databases.json file missing, clearing dashboard")
          if (isMounted) setDatabases([])
          
          // Recreate the file
          // @ts-ignore
          const recreateResult = await window.electron?.recreateDatabasesFile?.()
          if (recreateResult?.success) {
            console.log("[Storage] Recreated databases.json file")
          }
          return
        }
      } catch (error) {
        console.error("[Storage] Error checking databases file:", error)
      }
      
      // @ts-ignore
      if (window.electron?.getDatabases) {
        // @ts-ignore
        const list = await window.electron.getDatabases()
        const databases = Array.isArray(list) ? list : []
        
        // Fix any databases stuck in "installing" status
        const updatedDatabases = databases.map(db => {
          if (db.status === "installing") {
            console.log(`[Cleanup] Fixing database ${db.id} stuck in installing status`)
            return { ...db, status: "stopped" as const }
          }
          return db
        })
        
        // Save updated databases if any were fixed
        if (updatedDatabases.some((db, index) => db.status !== databases[index]?.status)) {
          // @ts-ignore
          if (window.electron?.saveDatabase) {
            for (const db of updatedDatabases) {
              // @ts-ignore
              await window.electron.saveDatabase(db)
            }
          }
        }
        
        if (isMounted) setDatabases(updatedDatabases)
        
        // Force immediate status check for all databases
        setTimeout(async () => {
          if (!isMounted) return
          for (const db of updatedDatabases) {
            try {
              // @ts-ignore
              const status = await window.electron?.checkDatabaseStatus?.(db.id)
              if (status?.status && status.status !== db.status && isMounted) {
                console.log(`[App Load] Database ${db.id} is actually ${status.status}`)
                setDatabases(prev => prev.map(d => 
                  d.id === db.id ? { ...d, status: status.status } : d
                ))
              }
            } catch (e) {
              // Ignore errors during initial load
            }
          }
        }, 1000)
        
        // Optimized status monitoring with adaptive frequency and memory management
        let fileCheckCounter = 0
        let noActiveDatabasesCount = 0
        let lastDatabaseCount = 0
        
        const startStatusMonitoring = () => {
          return setInterval(async () => {
            if (!isMounted) return
            
            try {
              // Only check file existence every 60 seconds (6 iterations) to reduce overhead
              fileCheckCounter++
              if (fileCheckCounter >= 6) {
                await checkDatabasesFileExists()
                fileCheckCounter = 0
              }
              
              // Get current database list from state at the time of check
              setDatabases(currentDatabases => {
                if (!isMounted) return currentDatabases
                
                const databasesToCheck = currentDatabases.filter(db => 
                  db.status === "running" || db.status === "starting" || db.status === "stopping"
                )
                
                // If no active databases, reduce monitoring frequency significantly
                if (databasesToCheck.length === 0) {
                  noActiveDatabasesCount++
                  // Skip monitoring if no active databases for 3 consecutive checks (30 seconds)
                  if (noActiveDatabasesCount < 3) return currentDatabases
                  // Reset counter and continue with minimal checks
                  noActiveDatabasesCount = 0
                } else {
                  noActiveDatabasesCount = 0
                }
                
                // Only check if database count changed or there are active databases
                if (databasesToCheck.length === 0 && currentDatabases.length === lastDatabaseCount) {
                  return currentDatabases // Skip unnecessary checks
                }
                lastDatabaseCount = currentDatabases.length
                
                // Check each database status asynchronously
                databasesToCheck.forEach(async (db) => {
                  if (!isMounted) return
                  try {
                    // @ts-ignore
                    const status = await window.electron?.checkDatabaseStatus?.(db.id)
                    
                    if (status?.status && status.status !== db.status && isMounted) {
                      // Protection against race conditions during startup
                      // Don't update from "starting" to "stopped" too quickly
                      if (db.status === "starting" && status.status === "stopped") {
                        // Check if the database was recently started (within last 30 seconds)
                        const timeSinceStarted = Date.now() - (db.lastStarted || 0)
                        if (timeSinceStarted < 30000) {
                          console.log(`[Status Protection] Database ${db.id} still in startup phase, ignoring status change to stopped`)
                          return
                        }
                      }
                      
                      // Don't update from "running" to "stopped" unless confirmed by real-time listener
                      if (db.status === "running" && status.status === "stopped") {
                        console.log(`[Status Protection] Database ${db.id} was running, deferring to real-time listener for stopped status`)
                        return
                      }
                      
                      // Don't update from "stopping" to "running" - this shouldn't happen
                      if (db.status === "stopping" && status.status === "running") {
                        console.log(`[Status Protection] Database ${db.id} was stopping, ignoring status change to running`)
                        return
                      }
                      
                      console.log(`[Status Update] Database ${db.id}: ${db.status} → ${status.status}`)
                      
                      // Update the database status immediately
                      setDatabases(prev => prev.map(d => 
                        d.id === db.id ? { ...d, status: status.status } : d
                      ))
                      
                      // Notifications are handled by the real-time listener to avoid duplicates
                    }
                  } catch (error) {
                    console.log(`[Status Check Error] Database ${db.id}:`, error)
                  }
                })
                
                return currentDatabases
              })
            } catch (error) {
              console.log(`[Status Monitoring Error]:`, error)
            }
          }, 15000) // Reduced frequency to every 15 seconds to save memory
        }
        
        statusInterval = startStatusMonitoring()
        
        // Set up real-time status change listener from electron main process
        // @ts-ignore
        if (window.electron?.onDatabaseStatusChanged) {
          console.log(`[Listener Setup] Setting up database status listener`)
          // @ts-ignore
          window.electron.onDatabaseStatusChanged((data: { id: string, status: string, error?: string, exitCode?: number, ready?: boolean, pid?: number }) => {
            if (!isMounted) return
            
            console.log(`[Real-time Status] Database ${data.id} status changed to ${data.status}${data.ready ? ' (ready)' : ''}`)
            
            // Create a simple event key to prevent duplicate processing
            // For stopped events, use a simpler key to prevent duplicates from error/exit events
            const eventKey = data.status === 'stopped' 
              ? `${data.id}-stopped` 
              : `${data.id}-${data.status}-${data.ready ? 'ready' : 'not-ready'}`
            
            // Check if we've already processed this exact event in the last 3 seconds (reduced from 5)
            const now = Date.now()
            const lastProcessed = lastStatusCheckRef.current[eventKey] || 0
            
            if (now - lastProcessed < 3000) {
              console.log(`[Real-time Status] Duplicate event ignored: ${eventKey} (last processed: ${new Date(lastProcessed).toISOString()})`)
              return
            }
            
            // Update the last processed time (both ref and state)
            lastStatusCheckRef.current[eventKey] = now
            if (isMounted) {
              setLastStatusCheck(prev => ({
                ...prev,
                [eventKey]: now
              }))
            }
            
            console.log(`[Real-time Status] Processing event: ${eventKey}`)
            
            // Update database status immediately
            if (isMounted) {
              setDatabases(prev => {
                const updated = prev.map(db => 
                  db.id === data.id ? { ...db, status: data.status as any, pid: data.pid } : db
                )
                
                // Show notifications only for actual status changes
                if (data.status === "stopped") {
                  const db = prev.find(d => d.id === data.id)
                  if (db && db.status !== "stopped") {
                    if (db.status === "starting") {
                      // Database was starting but failed
                      if (data.error) {
                        toast.error("Database failed to start", {
                          description: `${db.name} failed to start: ${data.error}`,
                          action: {
                            label: "Retry",
                            onClick: () => startDatabaseWithErrorHandling(data.id)
                          }
                        })
                      } else {
                        toast.error("Database failed to start", {
                          description: `${db.name} could not start properly. Please check the logs.`,
                          action: {
                            label: "Retry",
                            onClick: () => startDatabaseWithErrorHandling(data.id)
                          }
                        })
                      }
                    } else if (db.status === "running") {
                      // Database was running but crashed
                      if (data.error) {
                        toast.error("Database crashed", {
                          description: `${db.name} stopped due to an error: ${data.error}`,
                        })
                      } else {
                        toast.info("Database stopped", {
                          description: `${db.name} has stopped running.`,
                        })
                      }
                    }
                  }
                } else if (data.status === "running") {
                  const db = prev.find(d => d.id === data.id)
                  if (db && db.status === "starting") {
                    // Database was starting and is now running
                    console.log(`[Notification] Showing success notification for database ${db.id} (${db.name}) - Event Key: ${eventKey}`)
                    if (data.ready) {
                      toast.success("Database ready", {
                        description: `${db.name} is now running and ready to accept connections.`,
                        id: `db-ready-${db.id}-${now}`, // Unique ID to prevent duplicates
                      })
                    } else {
                      toast.success("Database started", {
                        description: `${db.name} is now running.`,
                        id: `db-started-${db.id}-${now}`, // Unique ID to prevent duplicates
                      })
                    }
                  }
                }
                
                return updated
              })
            }
          })
        }
      }
    }
    
    load()

    // Clean up interval and listeners on unmount
    return () => {
      isMounted = false
      if (statusInterval) {
        clearInterval(statusInterval)
      }
      // @ts-ignore
      if (window.electron?.removeDatabaseStatusListener) {
        // @ts-ignore
        window.electron.removeDatabaseStatusListener()
      }
    }
  }, []) // Empty dependency array is correct here

  const handleAddDatabase = (database: DatabaseContainer) => {
    setDatabases([...databases, database])
    setAddDialogOpen(false)
    setActiveTab("all") // Switch to All Databases tab to show the new database
    toast.success("Database added", {
      description: `${database.name} has been added successfully.`,
    })
  }

  const startDatabaseWithErrorHandling = async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    // Check if database is already starting
    if (targetDb.status === "starting") {
      toast.warning("Database already starting", {
        description: `${targetDb.name} is already in the process of starting.`,
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
      
      toast.warning("Port Conflict Detected", {
        description: `Port ${targetDb.port} is already in use by "${portConflict.name}" (${conflictType}). Database will start anyway, but consider using port ${suggestedPort} instead.`,
        action: {
          label: "Use Suggested Port",
          onClick: async () => {
            // Update the database port and save it
            const updatedDb = { ...targetDb, port: suggestedPort }
            try {
              // @ts-ignore
              await window.electron?.saveDatabase?.(updatedDb)
              setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
              toast.success("Port Updated", {
                description: `Database port changed to ${suggestedPort}`,
              })
              // Start the database with the new port
              await startDatabaseWithErrorHandling(id)
            } catch (error) {
              console.log(`[Port Update] Error updating database port:`, error)
              toast.error("Failed to update port", {
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
        db.id === id ? { ...db, status: "starting" as const, lastStarted: Date.now() } : db
      )
    )

    toast.info("Starting database", {
      description: `${targetDb.name} is starting up...`,
      duration: 3000,
    })

    try {
      // @ts-ignore
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
                toast.error("Database start timeout", {
                  description: `${targetDb.name} took too long to start. Please check the logs.`,
                  action: {
                    label: "Retry",
                    onClick: () => startDatabaseWithErrorHandling(id)
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
        let errorMessage = result?.error || "Unknown error occurred"
        let errorDescription = `${targetDb.name}: ${errorMessage}`
        
        // Handle specific error cases
        if (errorMessage.includes("port") || errorMessage.includes("Port")) {
          errorDescription = `${targetDb.name}: Port ${targetDb.port} is already in use. Please choose a different port.`
        } else if (errorMessage.includes("permission") || errorMessage.includes("Permission")) {
          errorDescription = `${targetDb.name}: Permission denied. Please check your system permissions.`
        } else if (errorMessage.includes("not found") || errorMessage.includes("command not found")) {
          errorDescription = `${targetDb.name}: Database software not found. Please install ${targetDb.type} first.`
        }
        
        toast.error("Failed to start database", {
          description: errorDescription,
          action: {
            label: "Retry",
            onClick: () => startDatabaseWithErrorHandling(id)
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
      
      toast.error("Failed to start database", {
        description: `${targetDb.name}: ${errorDescription}`,
        action: {
          label: "Retry",
          onClick: () => startDatabaseWithErrorHandling(id)
        }
      })
    }
  }

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
        
        toast.warning("Port Conflict Detected", {
          description: `Port ${targetDb.port} is already in use by "${conflictingDb.name}" (${conflictType}). Database will start anyway, but consider using port ${suggestedPort} instead.`,
          action: {
            label: "Use Suggested Port",
            onClick: async () => {
              // Update the database port and save it
              const updatedDb = { ...targetDb, port: suggestedPort }
              try {
                // @ts-ignore
                await window.electron?.saveDatabase?.(updatedDb)
                setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
                toast.success("Port Updated", {
                  description: `Database port changed to ${suggestedPort}`,
                })
                // Start the database with the new port
                await startDatabaseWithErrorHandling(id)
              } catch (error) {
                console.log(`[Port Update] Error updating database port:`, error)
                toast.error("Failed to update port", {
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

      await startDatabaseWithErrorHandling(id)
    } else {
      // Stop the database
      // Set status to stopping first
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "stopping" as const } : db
        )
      )

      try {
        // @ts-ignore
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
        } else {
          // If stop failed, revert to running status
          setDatabases((prev) =>
            prev.map((db) =>
              db.id === id ? { ...db, status: "running" as const } : db
            )
          )
          toast.error("Failed to stop database", {
            description: result?.error || "Unknown error occurred",
          })
        }
      } catch (error) {
        // If stop failed, revert to running status
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "running" as const } : db
          )
        )
        toast.error("Failed to stop database", {
          description: "Could not connect to database service",
        })
      }
    }
  }

  const handleRestart = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db || db.status !== "running") return

    toast.info("Restarting database", {
      description: `${db.name} is restarting...`,
    })

    try {
      // Stop the database first
      // @ts-ignore
      const stopResult = await window.electron?.stopDatabase?.(id)
      
      if (stopResult?.success) {
        // Wait a moment for the process to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Start the database again - this will trigger the real-time listener notifications
        await startDatabaseWithErrorHandling(id)
      } else {
        toast.error("Failed to restart database", {
          description: "Could not stop the database for restart",
        })
      }
    } catch (error) {
      console.log(`[Restart] Error restarting database ${id}:`, error)
      toast.error("Failed to restart database", {
        description: "Could not restart the database",
      })
    }
  }

  const handleDelete = (id: string) => {
    const db = databases.find((d) => d.id === id)
    // @ts-ignore
    if (window.electron?.deleteDatabase) {
      // @ts-ignore
      window.electron.deleteDatabase(id)
    }
    setDatabases(databases.filter((d) => d.id !== id))
    setSelectedDatabase(null)
    setSettingsDialogOpen(false)
    toast.error("Database removed", {
      description: `${db?.name} has been removed.`,
    })
  }

  const handleSettings = (database: DatabaseContainer) => {
    setSelectedDatabase(database)
    setSettingsDialogOpen(true)
  }

  const handleUpdateDatabase = async (updatedDatabase: DatabaseContainer) => {
    const originalDatabase = databases.find(db => db.id === updatedDatabase.id)
    if (!originalDatabase) return

    // Check if port has changed and database is running
    const portChanged = originalDatabase.port !== updatedDatabase.port
    const wasRunning = originalDatabase.status === "running" || originalDatabase.status === "starting"
    
    // Update the database in state
    setDatabases(databases.map((db) => (db.id === updatedDatabase.id ? updatedDatabase : db)))
    
    // Save the updated database to Electron storage
    try {
      // @ts-ignore
      await window.electron?.saveDatabase?.(updatedDatabase)
    } catch (error) {
      console.log(`[Port Change] Error saving database ${updatedDatabase.id}:`, error)
    }
    
    // If port changed and database was running, restart it
    if (portChanged && wasRunning) {
      setSettingsDialogOpen(false)
      
      toast.info("Port changed - restarting database", {
        description: `${updatedDatabase.name} is restarting with the new port ${updatedDatabase.port}.`,
      })

      try {
        // Stop the database first
        // @ts-ignore
        const stopResult = await window.electron?.stopDatabase?.(updatedDatabase.id)
        
        if (stopResult?.success) {
          // Update database status to stopped immediately to prevent port conflicts
          setDatabases(prev => prev.map(db => 
            db.id === updatedDatabase.id ? { ...updatedDatabase, status: "stopped" } : db
          ))
          
          // Wait a moment for the process to fully stop
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Start the database with the new port
          await startDatabaseWithErrorHandling(updatedDatabase.id)
        } else {
          toast.error("Failed to restart database", {
            description: "Could not stop the database for port change",
          })
        }
      } catch (error) {
        console.log(`[Port Change] Error restarting database ${updatedDatabase.id}:`, error)
        toast.error("Failed to restart database", {
          description: "Could not restart the database with new port",
        })
      }
    } else {
      setSettingsDialogOpen(false)
      toast.success("Settings updated", {
        description: `${updatedDatabase.name} has been updated.`,
      })
    }
  }

  const handleResolvePortConflict = (newPort: number) => {
    setConflictingPort(null)
    setPortConflictDialogOpen(false)
  }

  const handleCopyContainerId = (containerId: string, dbId: string) => {
    navigator.clipboard.writeText(containerId)
    setCopiedId(dbId)
    toast.success("Copied to clipboard", {
      description: "Container ID copied successfully.",
    })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRefreshStatus = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db) return

    // If database is not running, start it instead of restarting
    if (db.status === "stopped") {
      await startDatabaseWithErrorHandling(id)
      return
    }

    // If database is running or starting, restart it
    if (db.status === "running" || db.status === "starting") {
      toast.info("Restarting database", {
        description: `${db.name} is restarting...`,
      })

      try {
        // Stop the database first
        // @ts-ignore
        const stopResult = await window.electron?.stopDatabase?.(id)
        
        if (stopResult?.success) {
          // Wait a moment for the process to fully stop
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Start the database again - this will trigger the real-time listener notifications
          await startDatabaseWithErrorHandling(id)
        } else {
          toast.error("Failed to restart database", {
            description: "Could not stop the database for restart",
          })
        }
      } catch (error) {
        console.log(`[Restart] Error restarting database ${id}:`, error)
        toast.error("Failed to restart database", {
          description: "Could not restart the database",
        })
      }
    }
  }


  const handleDebugDatabase = async (id: string) => {
    try {
      console.log(`[Debug] Checking database ${id}...`)
      
      // @ts-ignore
      const verification = await window.electron?.verifyDatabaseInstance?.(id)
      console.log(`[Debug] Database ${id} verification:`, verification)
      
      // Show simple results
      const description = `Running: ${verification.isRunning}, PID: ${verification.pid || 'N/A'}, Killed: ${verification.killed}, Exit Code: ${verification.exitCode}`
      
      toast.info("Database debug info", {
        description,
        duration: 5000,
      })
      
      // Log results
      console.log(`[Debug] Database ${id}:`)
      console.log(`[Debug] - Running: ${verification.isRunning}`)
      console.log(`[Debug] - PID: ${verification.pid}`)
      console.log(`[Debug] - Killed: ${verification.killed}`)
      console.log(`[Debug] - Exit Code: ${verification.exitCode}`)
      
      if (verification.error) {
        console.log(`[Debug] - Error: ${verification.error}`)
      }
    } catch (error) {
      console.log(`[Debug] Error checking database ${id}:`, error)
      toast.error("Debug failed", {
        description: "Could not check database instance",
      })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-sm border-b border-border/50 cursor-move" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="container mx-auto px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {selectedDatabases.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedDatabases.size} selected
                </span>
                <Button
                  onClick={handleBulkStartSelected}
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs cursor-pointer"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <Play className="mr-1 h-3 w-3" />
                  Start All
                </Button>
                <Button
                  onClick={handleBulkStopSelected}
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs cursor-pointer"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  <Square className="mr-1 h-3 w-3" />
                  Stop All
                </Button>
                <Button
                  onClick={clearSelection}
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs cursor-pointer"
                  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setShowBulkActions(!showBulkActions)
                if (showBulkActions) {
                  // Clear selection when exiting selection mode
                  setSelectedDatabases(new Set())
                }
              }}
              size="sm"
              variant={showBulkActions ? "default" : "ghost"}
              className={`transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer ${
                showBulkActions ? "bg-primary text-primary-foreground" : ""
              }`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title={showBulkActions ? "Exit selection mode" : "Select multiple databases"}
            >
              <Grid3X3 className={`h-4 w-4 transition-transform duration-200 ${showBulkActions ? 'rotate-12' : ''}`} />
            </Button>
            <Button
              onClick={() => setAddDialogOpen(true)}
              size="sm"
              className="transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Database
            </Button>
            <Button
              onClick={() => setAppSettingsOpen(true)}
              variant="ghost"
              size="sm"
              className="transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Cog className="h-4 w-4 hover:animate-spin transition-transform duration-200" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-3 px-4">
        {databases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">No databases yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md text-pretty">
                Get started by adding your first database container.
              </p>
              <Button onClick={() => setAddDialogOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Your First Database
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="active" className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                Active
              </TabsTrigger>
              <TabsTrigger value="inactive" className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                Inactive
              </TabsTrigger>
              <TabsTrigger value="all" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                All
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="active" className="mt-6">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Active Databases</h2>
                    <p className="text-sm text-muted-foreground">
                      Databases that are currently running or starting up
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showBulkActions && (
                      <Button
                        onClick={selectAllDatabases}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                      >
                        Select All
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="font-medium">{databases.filter(db => db.status === "running" || db.status === "starting").length}</span>
                      <span>Active</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {databases
                  .filter(db => db.status === "running" || db.status === "starting")
                  .map((db) => (
              <Card 
                key={db.id} 
                className={`relative overflow-hidden border-dashed ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
                  showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
                }`}
                onClick={showBulkActions ? () => toggleDatabaseSelection(db.id) : undefined}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    {showBulkActions && (
                      <input
                        type="checkbox"
                        checked={selectedDatabases.has(db.id)}
                        onChange={() => toggleDatabaseSelection(db.id)}
                        className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-1 rounded bg-secondary text-base leading-none flex items-center justify-center w-7 h-7 shrink-0">
                        {db.icon || <Database className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-tight truncate">{db.name}</h3>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {db.type} {db.version}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={db.status === "running" ? "default" : "secondary"}
                      className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                        db.status === "running"
                          ? "bg-success text-success-foreground hover:bg-success/90"
                          : db.status === "starting"
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : db.status === "stopping"
                          ? "bg-orange-500 text-white hover:bg-orange-600"
                          : db.status === "installing"
                          ? "bg-yellow-500 text-white hover:bg-yellow-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {db.status}
                    </Badge>
                  </div>

                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Port</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono font-medium">{db.port}</span>
                        {databases.some(otherDb => 
                          otherDb.id !== db.id && 
                          otherDb.port === db.port && 
                          (otherDb.status === "running" || otherDb.status === "starting")
                        ) && (
                          <span className="text-yellow-500 text-[10px]" title="Port in use by another database">
                            ⚠️
                          </span>
                        )}
                      </div>
                    </div>
                    {(db.status === "running" || db.status === "starting") && db.pid && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">PID</span>
                        <span className="font-mono font-medium text-green-600">{db.pid}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Container</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 shrink-0 transition-all duration-200 hover:scale-125 active:scale-90"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyContainerId(db.containerId, db.id)
                          }}
                        >
                          {copiedId === db.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {!showBulkActions && (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className={`flex-1 h-6 text-[11px] transition-all duration-200 hover:scale-105 active:scale-95 ${
                          db.status === "running"
                            ? "border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                            : db.status === "starting"
                            ? "border-blue-500/50 text-blue-600"
                            : db.status === "stopping"
                            ? "border-orange-500/50 text-orange-600"
                            : db.status === "installing"
                            ? "border-yellow-500/50 text-yellow-600"
                            : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleStartStop(db.id)
                        }}
                        disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                      >
                        {db.status === "running" ? (
                          <>
                            <Square className="mr-1 h-3 w-3" />
                            Stop
                          </>
                        ) : db.status === "starting" ? (
                          <>
                            <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                            Starting
                          </>
                        ) : db.status === "stopping" ? (
                          <>
                            <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                            Stopping
                          </>
                        ) : db.status === "installing" ? (
                          <>
                            <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                            Installing
                          </>
                        ) : (
                          <>
                            <Play className="mr-1 h-3 w-3" />
                            Start
                          </>
                        )}
                      </Button>
                      {db.status !== "stopped" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRefreshStatus(db.id)
                          }}
                          title="Restart database"
                        >
                          <RotateCw className="h-3 w-3" />
                        </Button>
                      )}
                      {db.status === "running" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDebugDatabase(db.id)
                          }}
                          title="Debug database"
                        >
                          <Database className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSettings(db)
                        }}
                      >
                        <Settings2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
                  ))}
              </div>
            </TabsContent>
            
            <TabsContent value="inactive" className="mt-6">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Inactive Databases</h2>
                    <p className="text-sm text-muted-foreground">
                      Databases that are currently stopped
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showBulkActions && (
                      <Button
                        onClick={selectAllDatabases}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                      >
                        Select All
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <span className="font-medium">{databases.filter(db => db.status === "stopped").length}</span>
                      <span>Inactive</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {databases
                  .filter(db => db.status === "stopped")
                  .map((db) => (
                    <Card 
                      key={db.id} 
                      className={`relative overflow-hidden border-dashed opacity-60 ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
                        showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
                      }`}
                      onClick={showBulkActions ? () => toggleDatabaseSelection(db.id) : undefined}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          {showBulkActions && (
                            <input
                              type="checkbox"
                              checked={selectedDatabases.has(db.id)}
                              onChange={() => toggleDatabaseSelection(db.id)}
                              className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="p-1 rounded bg-secondary text-base leading-none flex items-center justify-center w-7 h-7 shrink-0">
                              {db.icon || <Database className="h-3.5 w-3.5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-semibold leading-tight truncate">{db.name}</h3>
                              <p className="text-[10px] text-muted-foreground leading-tight">
                                {db.type} {db.version}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                              db.status === "stopping"
                                ? "bg-orange-500 text-white hover:bg-orange-600"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {db.status}
                          </Badge>
                        </div>

                        <div className="space-y-1 mb-2">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Port</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-medium">{db.port}</span>
                              {databases.some(otherDb => 
                                otherDb.id !== db.id && 
                                otherDb.port === db.port && 
                                (otherDb.status === "running" || otherDb.status === "starting")
                              ) && (
                                <span className="text-yellow-500 text-[10px]" title="Port in use by another database">
                                  ⚠️
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-muted-foreground">Container</span>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 shrink-0 transition-all duration-200 hover:scale-125 active:scale-90"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyContainerId(db.containerId, db.id)
                                }}
                              >
                                {copiedId === db.id ? (
                                  <Check className="h-3 w-3 text-green-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        {!showBulkActions && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`flex-1 h-6 text-[11px] transition-all duration-200 hover:scale-105 active:scale-95 ${
                                db.status === "stopping"
                                  ? "border-orange-500/50 text-orange-600"
                                  : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStartStop(db.id)
                              }}
                              disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                            >
                              {db.status === "stopping" ? (
                                <>
                                  <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                  Stopping
                                </>
                              ) : (
                                <>
                                  <Play className="mr-1 h-3 w-3" />
                                  Start
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedDatabase(db)
                                setSettingsDialogOpen(true)
                              }}
                            >
                              <Settings2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </TabsContent>
            
            <TabsContent value="all" className="mt-6">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">All Databases</h2>
                    <p className="text-sm text-muted-foreground">
                      Complete list of all databases with inactive ones shown with reduced opacity
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showBulkActions && (
                      <Button
                        onClick={selectAllDatabases}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                      >
                        Select All
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Database className="h-4 w-4" />
                      <span className="font-medium">{databases.length}</span>
                      <span>Total</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {databases.map((db) => (
                  <Card 
                    key={db.id} 
                    className={`relative overflow-hidden border-dashed transition-opacity ${
                      db.status === "stopped" ? "opacity-60" : "opacity-100"
                    } ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
                      showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
                    }`}
                    onClick={showBulkActions ? () => toggleDatabaseSelection(db.id) : undefined}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        {showBulkActions && (
                          <input
                            type="checkbox"
                            checked={selectedDatabases.has(db.id)}
                            onChange={() => toggleDatabaseSelection(db.id)}
                            className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="p-1 rounded bg-secondary text-base leading-none flex items-center justify-center w-7 h-7 shrink-0">
                            {db.icon || <Database className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold leading-tight truncate">{db.name}</h3>
                            <p className="text-[10px] text-muted-foreground leading-tight">
                              {db.type} {db.version}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={db.status === "running" ? "default" : "secondary"}
                          className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                            db.status === "running"
                              ? "bg-success text-success-foreground hover:bg-success/90"
                              : db.status === "starting"
                              ? "bg-blue-500 text-white hover:bg-blue-600"
                              : db.status === "stopping"
                              ? "bg-orange-500 text-white hover:bg-orange-600"
                              : db.status === "installing"
                              ? "bg-yellow-500 text-white hover:bg-yellow-600"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {db.status}
                        </Badge>
                      </div>

                      <div className="space-y-1 mb-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Port</span>
                          <div className="flex items-center gap-1">
                            <span className="font-mono font-medium">{db.port}</span>
                            {databases.some(otherDb => 
                              otherDb.id !== db.id && 
                              otherDb.port === db.port && 
                              (otherDb.status === "running" || otherDb.status === "starting")
                            ) && (
                              <span className="text-yellow-500 text-[10px]" title="Port in use by another database">
                                ⚠️
                              </span>
                            )}
                          </div>
                        </div>
                        {(db.status === "running" || db.status === "starting") && db.pid && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">PID</span>
                            <span className="font-mono font-medium text-green-600">{db.pid}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <span className="text-muted-foreground">Container</span>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 shrink-0 transition-all duration-200 hover:scale-125 active:scale-90"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyContainerId(db.containerId, db.id)
                              }}
                            >
                              {copiedId === db.id ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {!showBulkActions && (
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`flex-1 h-6 text-[11px] transition-all duration-200 hover:scale-105 active:scale-95 ${
                              db.status === "running"
                                ? "border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                : db.status === "starting"
                                ? "border-blue-500/50 text-blue-600"
                                : db.status === "stopping"
                                ? "border-orange-500/50 text-orange-600"
                                : db.status === "installing"
                                ? "border-yellow-500/50 text-yellow-600"
                                : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                            }`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleStartStop(db.id)
                            }}
                            disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                          >
                            {db.status === "running" ? (
                              <>
                                <Square className="mr-1 h-3 w-3" />
                                Stop
                              </>
                            ) : db.status === "starting" ? (
                              <>
                                <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                Starting
                              </>
                            ) : db.status === "stopping" ? (
                              <>
                                <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                Stopping
                              </>
                            ) : db.status === "installing" ? (
                              <>
                                <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                Installing
                              </>
                            ) : (
                              <>
                                <Play className="mr-1 h-3 w-3" />
                                Start
                              </>
                            )}
                          </Button>
                          {db.status !== "stopped" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRefreshStatus(db.id)
                              }}
                              title="Restart database"
                            >
                              <RotateCw className="h-3 w-3" />
                            </Button>
                          )}
                          {db.status === "running" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDebugDatabase(db.id)
                              }}
                              title="Debug database"
                            >
                              <Database className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSettings(db)
                            }}
                          >
                            <Settings2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <AddDatabaseDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddDatabase} />

      {selectedDatabase && (
        <DatabaseSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          database={selectedDatabase}
          onUpdate={handleUpdateDatabase}
          onDelete={handleDelete}
        />
      )}

      {conflictingPort && (
        <PortConflictDialog
          open={portConflictDialogOpen}
          onOpenChange={setPortConflictDialogOpen}
          port={conflictingPort}
          onResolve={handleResolvePortConflict}
        />
      )}

      <AppSettingsDialog open={appSettingsOpen} onOpenChange={setAppSettingsOpen} />
    </div>
  )
}
