import { useEffect, useCallback, useRef } from "react"
import { log } from "@/lib/logger"
import { notifySuccess, notifyError, notifyInfo, notifyWarning } from "@/lib/notifications"
import { formatBytes } from "@/lib/utils/database/database-utils"
import type { DatabaseContainer, DatabaseStatus } from "@/lib/types"

export const useDatabaseMonitoring = (
  databases: DatabaseContainer[],
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>,
  databasesRef: React.MutableRefObject<DatabaseContainer[]>,
  lastStatusCheckRef: React.MutableRefObject<Record<string, number>>,
  lastSystemInfoCheck: Record<string, number>,
  setLastSystemInfoCheck: React.Dispatch<React.SetStateAction<Record<string, number>>>,
  lastSystemInfoCheckRef: React.MutableRefObject<Record<string, number>>,
  startDatabaseWithErrorHandlingRef: React.MutableRefObject<(id: string) => Promise<void>>,
  checkDatabasesFileExists: () => Promise<boolean>
) => {
  // Update databases ref whenever databases state changes
  useEffect(() => {
    databasesRef.current = databases
  }, [databases, databasesRef])

  useEffect(() => {
    lastSystemInfoCheckRef.current = lastSystemInfoCheck
  }, [lastSystemInfoCheck, lastSystemInfoCheckRef])

  const checkDatabasesFileExistsRef = useRef(checkDatabasesFileExists)

  useEffect(() => {
    checkDatabasesFileExistsRef.current = checkDatabasesFileExists
  }, [checkDatabasesFileExists])

  // Real-time uptime counter that updates every 5 seconds (reduced frequency)
  useEffect(() => {
    const uptimeInterval = setInterval(() => {
      setDatabases(prevDatabases => {
        // Only update if there are changes to avoid unnecessary re-renders
        let hasChanges = false
        const updatedDatabases = prevDatabases.map(db => {
          if (db.status === "running" && db.lastStarted) {
            const currentTime = Date.now()
            const uptimeSeconds = Math.floor((currentTime - db.lastStarted) / 1000)
            
            // Only update if uptime has actually changed
            // Preserve existing independent memory and other systemInfo values for each instance
            if (db.systemInfo?.uptime !== uptimeSeconds) {
              hasChanges = true
              return {
                ...db,
                systemInfo: {
                  // Preserve existing instance-specific values (each instance maintains its own)
                  cpu: db.systemInfo?.cpu ?? 0,
                  memory: db.systemInfo?.memory ?? 0, // Preserve instance-specific memory (RSS)
                  connections: db.systemInfo?.connections ?? 0,
                  uptime: uptimeSeconds
                }
              }
            }
          }
          return db
        })
        
        // Only return updated databases if there were actual changes
        return hasChanges ? updatedDatabases : prevDatabases
      })
    }, 5000) // Update every 5 seconds instead of every second

    return () => clearInterval(uptimeInterval)
  }, [setDatabases])

  // Function to fetch system info for running databases
  // Each instance gets its own independent memory stats (RSS - Resident Set Size)
  const fetchSystemInfo = useCallback(async (databaseId: string) => {
    try {
      log.debug(`Fetching system info for database ${databaseId}`)
      const systemInfo = await window.electron?.getDatabaseSystemInfo?.(databaseId)
      
      log.verbose(`Raw system info for ${databaseId}:`, systemInfo)
      
      if (systemInfo?.success && systemInfo.memory) {
        // Extract RSS (Resident Set Size) - this is the actual memory used by THIS specific process/instance
        // RSS is process-specific, so each instance will have its own independent value
        const instanceMemoryRss = systemInfo.memory.rss || 0
        
        const newSystemInfo = {
          cpu: Math.max(0, systemInfo.memory.cpu || 0), // Ensure non-negative
          memory: Math.max(0, instanceMemoryRss), // RSS memory for THIS specific instance - independent for each database
          connections: Math.max(0, systemInfo.connections || 0), // Use real connections from API
          uptime: Math.max(0, systemInfo.uptime || 0) // Use calculated uptime from API
        }
        
        log.debug(`Processed system info for ${databaseId} (instance-specific):`, {
          ...newSystemInfo,
          memoryRss: `${formatBytes(instanceMemoryRss)} (process-specific)`
        })
        
        // Debug CPU values specifically
        log.debug(`CPU debug for ${databaseId}:`, {
          rawCpu: systemInfo.memory.cpu,
          processedCpu: newSystemInfo.cpu
        })
        
        // Update only the specific database - ensure complete independence
        // Each database instance maintains its own separate systemInfo object
        setDatabases(prevDatabases => {
          const updated = prevDatabases.map(db => {
            if (db.id === databaseId) {
              // Only update if the system info has actually changed
              const currentSystemInfo = db.systemInfo
              if (!currentSystemInfo || 
                  currentSystemInfo.cpu !== newSystemInfo.cpu ||
                  currentSystemInfo.memory !== newSystemInfo.memory ||
                  currentSystemInfo.connections !== newSystemInfo.connections) {
                log.debug(`Updating system info for database ${databaseId} with memory: ${formatBytes(newSystemInfo.memory)}`)
                // Create a completely new object to ensure independence
                return {
                  ...db,
                  systemInfo: {
                    ...newSystemInfo // Copy all properties to new object
                  }
                }
              }
              // Return existing db unchanged if no updates needed
              return db
            }
            // Return other databases unchanged - they maintain their own independent values
            return db
          })
          
          // Only return updated array if there were actual changes
          const hasChanges = updated.some((db, index) => db !== prevDatabases[index])
          return hasChanges ? updated : prevDatabases
        })
        
        log.debug(`Successfully updated database ${databaseId} with independent system info`)
      } else {
        log.warn(`No valid system info for database ${databaseId}:`, systemInfo)
      }
    } catch (error) {
      log.error(`Error fetching system info for database ${databaseId}:`, error)
    }
  }, [setDatabases])

  const fetchSystemInfoRef = useRef(fetchSystemInfo)

  useEffect(() => {
    fetchSystemInfoRef.current = fetchSystemInfo
  }, [fetchSystemInfo])

  // Main useEffect to load databases and set up monitoring
  // This effect wires Electron IPC listeners and long-running timers; it intentionally runs once on mount
  useEffect(() => {
    let isMounted = true
    let statusInterval: NodeJS.Timeout | null = null
    let systemInfoInterval: NodeJS.Timeout | null = null
    let lastDatabaseCount = 0
    let noActiveDatabasesCount = 0
    // Track all pending timeouts to clear them on unmount
    const pendingTimeouts = new Set<NodeJS.Timeout>()

    let hasRunInitialCleanup = false
    
    let hasScheduledRetry = false

    const load = async (retryCount = 0) => {
      const maxRetries = 3
      
      // Check if Electron is available
      if (!window.electron) {
        console.log("[Debug] Electron not available yet, retrying in 1 second")
        if (!hasScheduledRetry) {
          hasScheduledRetry = true
          setTimeout(() => {
            hasScheduledRetry = false
            load(retryCount)
          }, 1000)
        }
        return
      }
      
      // Check if databases.json file exists (only log if file is missing)
      let fileExists = false
      try {
        const fileCheckFn = checkDatabasesFileExistsRef.current
        if (fileCheckFn) {
          const result = await fileCheckFn()
          fileExists = typeof result === "boolean" ? result : true
        } else {
          const fileCheck = await window.electron?.checkDatabasesFile?.()
          fileExists = fileCheck?.exists ?? true
        }
        
        if (!fileExists) {
          console.log("[Storage] databases.json file missing, clearing dashboard")
          if (isMounted) setDatabases([])
          return
        }
      } catch (error) {
        console.error("[Storage] Error checking databases file:", error)
        // If we can't check if file exists, try to load anyway
      }
      
      // Try to load databases with retry logic
      try {
        if (window.electron?.getDatabases) {
          const list = await window.electron.getDatabases()
          const databases = Array.isArray(list) ? list : []
          
          // Fix any databases stuck in "installing" status
          const updatedDatabases = databases.map(db => ({
            ...db,
            status: db.status === "installing" ? "stopped" as const : db.status
          }))
          
          if (isMounted) {
            setDatabases(updatedDatabases)
            
            // Fetch system info for already running databases
            updatedDatabases.forEach(db => {
              if (db.status === "running") {
                console.log(`[System Info] Database ${db.id} is already running, fetching system info`)
                const timeoutId = setTimeout(() => {
                  pendingTimeouts.delete(timeoutId)
                  if (isMounted) {
                    setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: Date.now() }))
                    fetchSystemInfoRef.current?.(db.id)
                  }
                }, 2000) // Wait 2 seconds for initial load
                pendingTimeouts.add(timeoutId)
              }
            })
            
            // Clean up any dead processes only once on initial load
            if (!hasRunInitialCleanup) {
              hasRunInitialCleanup = true
              try {
                if (window.electron?.cleanupDeadProcesses) {
                  const cleanupResult = await window.electron.cleanupDeadProcesses()
                  if (cleanupResult.success && (cleanupResult.cleanedProcesses > 0 || cleanupResult.updatedStatuses > 0)) {
                    console.log(`[Cleanup] Cleaned up ${cleanupResult.cleanedProcesses} dead processes, updated ${cleanupResult.updatedStatuses} statuses`)
                    // Reload databases after cleanup
                    const cleanedList = await window.electron.getDatabases()
                    const cleanedDatabases = Array.isArray(cleanedList) ? cleanedList : []
                    setDatabases(cleanedDatabases)
                  }
                }
              } catch (cleanupError) {
                console.error("[Cleanup] Error during cleanup:", cleanupError)
              }
            }
            
            // Port conflicts are now checked dynamically, no need to cache
          }
          console.log(`[Storage] Successfully loaded ${updatedDatabases.length} databases`)
          
          // Force immediate status check for all databases
          const ensureDatabasesFileExists = async () => {
            try {
              const fileCheckFn = checkDatabasesFileExistsRef.current
              const result = fileCheckFn
                ? await fileCheckFn()
                : (await window.electron?.checkDatabasesFile?.())?.exists
              const exists = typeof result === "boolean" ? result : true

              if (exists === false) {
                console.log("[Storage] databases.json file deleted, clearing dashboard")
                if (isMounted) setDatabases([])
              }
              // Don't log if file exists - only log when there's an issue
            } catch (error) {
              console.error("[Storage] Error checking databases file:", error)
            }
          }
          
          let fileCheckCounter = 0
          const startStatusMonitoring = () => {
            return setInterval(async () => {
              if (!isMounted) return
              
              try {
                // Check if databases file still exists every 20 checks (every 10 minutes) - reduced frequency
                fileCheckCounter++
                if (fileCheckCounter >= 20) {
                  await ensureDatabasesFileExists()
                  fileCheckCounter = 0
                }
                
                // Get current database list from state at the time of check
                // Use a ref to access current state without triggering nested updates
                const databasesSnapshot = databasesRef.current
                const databasesToCheck = databasesSnapshot.filter(db => 
                  db.status === "running" || db.status === "starting" || db.status === "stopping"
                )
                
                // If no active databases, reduce monitoring frequency significantly
                if (databasesToCheck.length === 0) {
                  noActiveDatabasesCount++
                  // Skip monitoring if no active databases for 3 consecutive checks (30 seconds)
                  if (noActiveDatabasesCount < 3) return
                  // Reset counter and continue with minimal checks
                  noActiveDatabasesCount = 0
                } else {
                  noActiveDatabasesCount = 0
                }
                
                // Only check if database count changed or there are active databases
                if (databasesToCheck.length === 0 && databasesSnapshot.length === lastDatabaseCount) {
                  return // Skip unnecessary checks
                }
                lastDatabaseCount = databasesSnapshot.length
                
                // Process status checks sequentially to prevent state update accumulation
                // Batch all updates into a single setState call
                const statusUpdates: Array<{id: string, status: DatabaseStatus, pid?: number}> = []
                
                for (const db of databasesToCheck) {
                  if (!isMounted) break
                  try {
                    const status = await window.electron?.checkDatabaseStatus?.(db.id)
                    
                    if (status?.status && status.status !== db.status && isMounted) {
                      // Protection against race conditions during startup
                      // Don't update from "starting" to "stopped" too quickly
                      if (db.status === "starting" && status.status === "stopped") {
                        // Check if the database was recently started (within last 30 seconds)
                        const timeSinceStarted = Date.now() - (db.lastStarted || 0)
                        if (timeSinceStarted < 30000) {
                          console.log(`[Status Protection] Database ${db.id} still in startup phase, ignoring status change to stopped`)
                          continue
                        }
                      }
                      
                      // Don't update from "running" to "stopped" unless confirmed by real-time listener
                      if (db.status === "running" && status.status === "stopped") {
                        console.log(`[Status Protection] Database ${db.id} was running, deferring to real-time listener for stopped status`)
                        continue
                      }
                      
                      // Don't update from "stopping" to "running" - this shouldn't happen
                      if (db.status === "stopping" && status.status === "running") {
                        console.log(`[Status Protection] Database ${db.id} was stopping, ignoring status change to running`)
                        continue
                      }
                      
                      console.log(`[Status Update] Database ${db.id}: ${db.status} → ${status.status}`)
                      statusUpdates.push({ id: db.id, status: status.status, pid: status.pid ?? undefined })
                    }
                  } catch (error) {
                    console.log(`[Status Check Error] Database ${db.id}:`, error)
                  }
                }
                
                // Batch all status updates into a single setState call to prevent UI freeze
                if (statusUpdates.length > 0 && isMounted) {
                  setDatabases(prev => {
                    const updated = prev.map(db => {
                      const update = statusUpdates.find(u => u.id === db.id)
                      if (update) {
                        // Fetch system info for newly running databases
                        if (update.status === "running" && db.status !== "running") {
                          const now = Date.now()
                          const lastCheck = lastSystemInfoCheckRef.current[db.id] || 0
                          // Only fetch system info every 30 seconds to avoid excessive calls
                          if (now - lastCheck > 30000) {
                            setLastSystemInfoCheck(prevCheck => ({ ...prevCheck, [db.id]: now }))
                            // Use requestAnimationFrame to defer state updates
                            requestAnimationFrame(() => {
                              if (isMounted) {
                                fetchSystemInfoRef.current?.(db.id)
                              }
                            })
                          }
                        }
                        return { ...db, status: update.status as DatabaseStatus, pid: update.pid || db.pid }
                      }
                      return db
                    })
                    return updated
                  })
                }
              } catch (error) {
                console.log(`[Status Monitoring Error]:`, error)
              }
            }, 30000) // Reduced frequency to every 30 seconds to save CPU/memory
          }
          
          statusInterval = startStatusMonitoring()
          
          // Set up system info monitoring for running databases (optimized)
          const startSystemInfoMonitoring = () => {
            let isRunning = false // Prevent overlapping interval executions
            return setInterval(async () => {
              if (!isMounted || isRunning) return
              isRunning = true
              
              try {
                // Get current databases state from ref
                const currentDatabases = databasesRef.current.filter(db => db.status === "running")
                
                // Only monitor if there are running databases and reduce frequency
                if (currentDatabases.length === 0) {
                  isRunning = false
                  return
                }
                
                log.debug(`Found ${currentDatabases.length} running databases`)
                
                // Fetch system info for each running database with staggered timing
                // Use sequential processing to prevent timeout accumulation
                for (let i = 0; i < currentDatabases.length; i++) {
                  if (!isMounted) break
                  
                  const db = currentDatabases[i]
                  const now = Date.now()
                  const lastCheck = lastSystemInfoCheckRef.current[db.id] || 0
                  
                  // Update system info every 20 seconds for live updates (reduced frequency to save CPU)
                  if (now - lastCheck > 20000) {
                    log.debug(`Updating system info for database ${db.id}`)
                    setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: now }))
                    
                    // Process sequentially with delay to prevent timeout accumulation
                    await new Promise(resolve => {
                      const timeoutId = setTimeout(() => {
                        pendingTimeouts.delete(timeoutId)
                        if (isMounted) {
                          fetchSystemInfoRef.current?.(db.id)
                        }
                        resolve(undefined)
                      }, i * 1000) // 1 second delay between each request
                      pendingTimeouts.add(timeoutId)
                    })
                  }
                }
              } catch (error) {
                log.error(`System Info Monitoring Error:`, error)
              } finally {
                isRunning = false
              }
            }, 20000) // Update every 20 seconds (reduced from 10s to save CPU/memory)
          }
          
          systemInfoInterval = startSystemInfoMonitoring()
          
          // Set up real-time status change listener from electron main process
          if (window.electron?.onDatabaseStatusChanged) {
            console.log(`[Status Listener] Setting up database status listener`)
            window.electron.onDatabaseStatusChanged((data: { id: string, status: DatabaseStatus, error?: string, exitCode?: number, ready?: boolean, pid?: number }) => {
              if (!isMounted) return
              
              console.log(`[Status Listener] Database ${data.id} status changed to ${data.status}${data.ready ? ' (ready)' : ''} (PID: ${data.pid})`)
              
              // Create a simple event key to prevent duplicate processing
              // For stopped events, use a simpler key to prevent duplicates from error/exit events
              const eventKey = data.status === 'stopped' 
                ? `${data.id}-stopped` 
                : `${data.id}-${data.status}-${data.ready ? 'ready' : 'not-ready'}`
              
              // Check if we've already processed this exact event in the last 500ms (reduced further)
              const now = Date.now()
              const lastProcessed = lastStatusCheckRef.current[eventKey] || 0
              
              if (now - lastProcessed < 500) {
                console.log(`[Status Listener] Duplicate event ignored: ${eventKey} (last processed: ${new Date(lastProcessed).toISOString()})`)
                // Still update status even if it's a duplicate - the status might have changed
                if (isMounted) {
                  setDatabases(prev => {
                    const db = prev.find(d => d.id === data.id)
                    if (db && db.status !== data.status) {
                      console.log(`[Status Listener] Updating status despite duplicate check: ${db.id} ${db.status} -> ${data.status}`)
                      return prev.map(d => 
                        d.id === data.id ? { 
                          ...d, 
                          status: data.status, 
                          pid: data.pid,
                          lastStarted: data.status === "running" ? Date.now() : d.lastStarted,
                          systemInfo: data.status === "running" ? {
                            cpu: 0,
                            memory: 0,
                            connections: 0,
                            uptime: 0
                          } : d.systemInfo
                        } : d
                      )
                    }
                    return prev
                  })
                }
                return
              }
              
              console.log(`[Status Listener] Processing event: ${eventKey} (time since last: ${now - lastProcessed}ms)`)
              
              // Update the last processed time (both ref and state)
              lastStatusCheckRef.current[eventKey] = now
              
              // Update database status immediately
              if (isMounted) {
                setDatabases(prev => {
                  const db = prev.find(d => d.id === data.id)
                  if (!db) {
                    console.warn(`[Status Listener] Database ${data.id} not found in state`)
                    return prev
                  }
                  
                  console.log(`[Status Listener] Updating ${data.id}: ${db.status} -> ${data.status}`)
                  
                  const updated = prev.map(d => 
                    d.id === data.id ? { 
                      ...d, 
                      status: data.status, 
                      pid: data.pid,
                      // Set lastStarted timestamp when database starts running
                      lastStarted: data.status === "running" ? Date.now() : d.lastStarted,
                      // Initialize systemInfo when database starts running
                      systemInfo: data.status === "running" ? {
                        cpu: 0,
                        memory: 0,
                        connections: 0,
                        uptime: 0
                      } : d.systemInfo
                    } : d
                  )
                  
                  // Show notifications only for actual status changes
                  if (data.status === "stopped") {
                    const db = prev.find(d => d.id === data.id)
                    if (db && db.status !== "stopped") {
                      if (db.status === "starting") {
                        notifyError("Database failed to start", {
                          description: `${db.name} failed to start: ${data.error || 'Unknown error'}`,
                          id: `db-failed-start-${db.id}-${now}`, // Unique ID to prevent duplicates
                          action: {
                            label: "Retry",
                            onClick: () => startDatabaseWithErrorHandlingRef.current(data.id)
                          }
                        })
                      } else {
                        notifyError("Database stopped", {
                          description: `${db.name} has stopped unexpectedly.`,
                          id: `db-stopped-${db.id}-${now}`, // Unique ID to prevent duplicates
                          action: {
                            label: "Restart",
                            onClick: () => startDatabaseWithErrorHandlingRef.current(data.id)
                          }
                        })
                      }
                    }
                  } else if (data.status === "running") {
                    const db = prev.find(d => d.id === data.id)
                    if (db && db.status !== "running") {
                      notifySuccess("Database started", {
                        description: `${db.name} is now running on port ${db.port}.`,
                        id: `db-started-${db.id}-${now}`, // Unique ID to prevent duplicates
                      })
                      
                      // Fetch system info for newly started database
                      const timeoutId = setTimeout(() => {
                        pendingTimeouts.delete(timeoutId)
                        if (isMounted) {
                          setLastSystemInfoCheck(prev => ({ ...prev, [data.id]: now }))
                          fetchSystemInfoRef.current?.(data.id)
                        }
                      }, 2000) // Wait 2 seconds for database to fully initialize
                      pendingTimeouts.add(timeoutId)
                    }
                  }
                  
                  return updated
                })
              }
            })
          }
          
          // Set up auto-start event listeners (remove existing listeners first to prevent leaks)
          if (window.electron?.removeAllListeners) {
            window.electron.removeAllListeners('auto-start-port-conflicts')
            window.electron.removeAllListeners('auto-start-completed')
          }
          
          if (window.electron?.onAutoStartPortConflicts) {
            window.electron.onAutoStartPortConflicts((event, data) => {
              if (!isMounted) return
              
              console.log(`[Auto-start] Port conflicts detected:`, data.conflicts)
              
              // Show individual conflict notifications
              data.conflicts.forEach((conflict) => {
                notifyWarning("Auto-start Port Conflict Resolved", {
                  description: `${conflict.databaseName} port changed from ${conflict.originalPort} to ${conflict.newPort} due to conflict with ${conflict.conflictingDatabase}`,
                  duration: 8000,
                })
              })
            })
          }
          
          if (window.electron?.onAutoStartCompleted) {
            window.electron.onAutoStartCompleted((event, data) => {
              if (!isMounted) return
              
              console.log(`[Auto-start] Completed:`, data)
              
              // Show summary notification
              if (data.portConflicts > 0) {
                notifyInfo("Auto-start Completed with Port Conflicts", {
                  description: `${data.successful} databases started, ${data.failed} failed, ${data.portConflicts} port conflicts resolved`,
                  duration: 6000,
                })
              } else if (data.failed > 0) {
                notifyWarning("Auto-start Completed with Issues", {
                  description: `${data.successful} databases started, ${data.failed} failed`,
                  duration: 6000,
                })
              } else if (data.successful > 0) {
                notifySuccess("Auto-start Completed", {
                  description: `${data.successful} ${data.successful === 1 ? 'database' : 'databases'} started successfully`,
                  duration: 4000,
                })
              }
            })
          }
        }
        } catch (error) {
          console.error(`[Storage] Error loading databases (attempt ${retryCount + 1}/${maxRetries + 1}):`, error)
          
          // If file exists but loading failed, retry a few times
          if (fileExists && retryCount < maxRetries) {
            console.log(`[Storage] Retrying database load in ${(retryCount + 1) * 1000}ms...`)
            setTimeout(() => {
              if (isMounted) {
                load(retryCount + 1)
              }
            }, (retryCount + 1) * 1000)
            return
          }
          
          // If all retries failed or file doesn't exist, show error
          if (isMounted) {
            console.error("[Storage] Failed to load databases after all retries")
            setDatabases([])
            notifyError("Failed to load databases", {
              description: "Could not load database configuration. Please restart the application.",
            })
          }
        }
      }
      
      load()

      // Clean up interval and listeners on unmount
      return () => {
        isMounted = false
        
        // Clear all intervals
        if (statusInterval) {
          clearInterval(statusInterval)
          statusInterval = null
        }
        if (systemInfoInterval) {
          clearInterval(systemInfoInterval)
          systemInfoInterval = null
        }
        
        // Clear all pending timeouts to prevent memory leaks
        pendingTimeouts.forEach(timeoutId => {
          clearTimeout(timeoutId)
        })
        pendingTimeouts.clear()
        
        if (window.electron?.removeAllListeners) {
          window.electron.removeAllListeners('database-status-changed')
          window.electron.removeAllListeners('auto-start-port-conflicts')
          window.electron.removeAllListeners('auto-start-completed')
        }
      }
  }, [])

  return {
    fetchSystemInfo
  }
}

