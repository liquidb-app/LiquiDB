import React, { useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatabaseContainer } from "@/lib/types"
import { isLikelyFalsePositive, isDatabaseRelatedProcess } from "@/lib/utils/database/validation"

export const usePortManagement = (
  databases: DatabaseContainer[],
  bannedPorts: number[],
  setBannedPorts: React.Dispatch<React.SetStateAction<number[]>>,
  portWarningCache: Record<number, {
    show: boolean
    info: { processName: string; pid: string } | null
    freeStreak: number
  }>,
  updatePortWarningCache: (portNumber: number, next: { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }) => void,
  databasesRef: React.MutableRefObject<DatabaseContainer[]>,
  setConflictingPort: React.Dispatch<React.SetStateAction<number | null>>,
  setPortConflictDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  portConflicts: [number, DatabaseContainer[]][],
  setPortConflicts: React.Dispatch<React.SetStateAction<[number, DatabaseContainer[]][]>>,
  selectedDatabases: Set<string>,
  setSelectedDatabases: React.Dispatch<React.SetStateAction<Set<string>>>,
  setShowBulkActions: React.Dispatch<React.SetStateAction<boolean>>,
  handleBulkStartRef: React.MutableRefObject<((databaseIds: string[]) => Promise<void>) | undefined>
) => {
  // Load banned ports on component mount and listen for changes
  useEffect(() => {
    const loadBannedPorts = async () => {
      try {
        if (window.electron?.getBannedPorts) {
          const ports = await window.electron.getBannedPorts()
          setBannedPorts(Array.isArray(ports) ? ports : [])
        } else {
          const saved = localStorage.getItem("blacklisted-ports")
          if (saved) setBannedPorts(JSON.parse(saved))
        }
      } catch (error) {
        console.error("Failed to load banned ports:", error)
      }
    }
    loadBannedPorts()

    // Listen for banned port changes
    const handleBannedPortsChange = () => {
      loadBannedPorts()
    }

    // Listen to storage changes for banned ports
    window.addEventListener('storage', (e) => {
      if (e.key === 'blacklisted-ports') {
        handleBannedPortsChange()
      }
    })

    return () => {
      window.removeEventListener('storage', handleBannedPortsChange)
    }
  }, [setBannedPorts])

  // Function to check if a port is banned
  const isPortBanned = (port: number): boolean => {
    return bannedPorts.includes(port)
  }

  // Function to check for port conflicts dynamically (no caching)
  const checkPortConflict = async (port: number, databaseId?: string): Promise<{ inUse: boolean; processName?: string; pid?: string }> => {
    try {
      if (window.electron?.checkPortConflict) {
        const result = await window.electron.checkPortConflict(port, databaseId)

        // If the helper explicitly says the port is free, trust it
        if (result?.success === true && result?.inUse === false) {
          return {
            inUse: false,
            processName: undefined,
            pid: undefined,
          }
        }

        // If the helper explicitly says the port is in use, surface details if available
        if (result?.success === true && result?.inUse === true) {
          return {
            inUse: true,
            processName: result?.processInfo?.processName || "Unknown process",
            pid: result?.processInfo?.pid || "Unknown",
          }
        }

        // On any ambiguous response (success !== true), be conservative but avoid spurious UI noise
        return {
          inUse: false,
          processName: undefined,
          pid: undefined,
        }
      }

      // If electron API is not available, assume free to avoid permanent false warnings in browser/dev
      console.warn(`[Port Check] Electron API not available, treating port ${port} as free for UI`)
      return { inUse: false }
    } catch (error) {
      console.error(`[Port Check] Error checking port ${port}:`, error)
      // On error, do not claim a conflict without proof
      return { inUse: false }
    }
  }

  // Function to get port conflict info (dynamic check)
  const getPortConflictInfo = async (port: number): Promise<{ processName: string; pid: string } | null> => {
    const result = await checkPortConflict(port)
    return result.inUse
      ? { processName: result.processName || "Unknown", pid: result.pid || "Unknown" }
      : null
  }

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

  // Function to check for port conflicts in selected databases
  const checkPortConflictsInSelection = (selectedIds: string[]) => {
    const selectedDbs = databases.filter(db => selectedIds.includes(db.id))
    const portGroups = new Map<number, DatabaseContainer[]>()
    
    // Group databases by port
    selectedDbs.forEach(db => {
      if (db.port) {
        if (!portGroups.has(db.port)) {
          portGroups.set(db.port, [])
        }
        portGroups.get(db.port)!.push(db)
      }
    })
    
    // Find ports with multiple databases
    const conflicts = Array.from(portGroups.entries()).filter(([, dbs]) => dbs.length > 1)
    return conflicts
  }

  // Function to show port conflict selection dialog
  const showPortConflictDialog = (conflicts: [number, DatabaseContainer[]][]) => {
    setPortConflicts(conflicts)
    setPortConflictDialogOpen(true)
  }

  // Function to handle database selection from conflict dialog
  const handleConflictDatabaseSelect = (dbId: string) => {
    // Get the original selected databases
    const originalSelectedIds = Array.from(selectedDatabases)
    
    // Find the selected database
    const selectedDb = databases.find(db => db.id === dbId)
    if (!selectedDb) return
    
    // If the selected database is already running, we don't need to start it
    const databasesToStart = originalSelectedIds.filter(id => {
      const db = databases.find(d => d.id === id)
      if (!db) return false
      
      // Skip if it's the selected database and it's already running
      if (id === dbId && (db.status === "running" || db.status === "starting")) {
        return false
      }
      
      // Skip if it's a conflicting database (different from the selected one)
      const isConflicting = portConflicts.some(([, dbs]) => 
        dbs.some(conflictDb => conflictDb.id === id && conflictDb.id !== dbId)
      )
      
      return !isConflicting
    })
    
    // Add the selected database if it's not running
    if (selectedDb.status === "stopped") {
      databasesToStart.push(dbId)
    }
    
    // Start the databases
    if (databasesToStart.length > 0 && handleBulkStartRef.current) {
      handleBulkStartRef.current(databasesToStart)
    } else {
      // All databases are already running or no valid databases to start
      // This will be handled by the notification in handleBulkStart
    }
    
    setSelectedDatabases(new Set())
    setShowBulkActions(false)
    setPortConflictDialogOpen(false)
    setPortConflicts([])
  }

  const handleResolvePortConflict = () => {
    setConflictingPort(null)
    setPortConflictDialogOpen(false)
  }

  // Dynamic port conflict warning component
  const PortConflictWarning = ({ port, databaseId, databaseStatus }: { port: number; databaseId: string; databaseStatus: string }) => {
    const [conflictInfo, setConflictInfo] = useState<{ processName: string; pid: string } | null>(null)
    const [, setIsChecking] = useState(false)
    const freeConfirmationsRef = React.useRef(0) // Track consecutive "free" confirmations
    const hasWarningRef = React.useRef(false) // Track if we currently have a warning displayed
    const currentIntervalRef = React.useRef(10000) // Track current interval value (default 10 seconds)
    const cachedState = portWarningCache[port]
    const stopTimestampRef = React.useRef<number | null>(null) // When this DB was last seen as stopping/stopped

    // Helper: treat DB as stopped-ish (we want to be lenient right after stop)
    const isStoppedLike =
      databaseStatus === "stopped" ||
      databaseStatus === "stopping" ||
      databaseStatus === "stopping-graceful" ||
      databaseStatus === "stopping-forced"

    // Track when the DB enters a stopped-like state so we can suppress stale warnings briefly
    useEffect(() => {
      if (isStoppedLike) {
        // Set timestamp once when entering stopped-like state
        if (!stopTimestampRef.current) {
          stopTimestampRef.current = Date.now()
        }
      } else {
        // Reset when leaving stopped-like state
        stopTimestampRef.current = null
      }
    }, [isStoppedLike])

    // Clear warning when database starts running (might have been cached from before)
    useEffect(() => {
      if ((databaseStatus === "running" || databaseStatus === "starting") && conflictInfo) {
        const currentDb = databasesRef.current.find((db: DatabaseContainer) => db.id === databaseId)
        // If we have a PID and the conflict info matches our own process, clear it
        if (currentDb?.pid) {
          const conflictPid = conflictInfo.pid
          const pidMatches = 
            conflictPid === currentDb.pid.toString() ||
            conflictPid === String(currentDb.pid) ||
            parseInt(conflictPid) === currentDb.pid
          
          if (pidMatches) {
            // This is our own process - clear the warning
            hasWarningRef.current = false
            setConflictInfo(null)
            freeConfirmationsRef.current = 0
            updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
          }
        }
      }
    }, [databaseStatus, databaseId, port, conflictInfo])

    // Sync ref with state changes
    useEffect(() => {
      hasWarningRef.current = conflictInfo !== null
    }, [conflictInfo])

    useEffect(() => {
      let isMounted = true

      // Initialize local state from cache to avoid initial flicker
      // But first check if the cached warning is for this database's own process
      if (cachedState?.show && !conflictInfo) {
        const currentDb = databasesRef.current.find((db: DatabaseContainer) => db.id === databaseId)
        const cachedPid = cachedState.info?.pid
        
        // If database is running and cached PID matches our own PID, don't show the warning
        if ((databaseStatus === "running" || databaseStatus === "starting") && 
            currentDb?.pid && 
            cachedPid && 
            (cachedPid === currentDb.pid.toString() || 
             cachedPid === String(currentDb.pid) || 
             parseInt(cachedPid) === currentDb.pid)) {
          // This is our own process - clear the cached warning
          updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
          hasWarningRef.current = false
          freeConfirmationsRef.current = 0
        } else {
          // Not our own process - use cached state
          setConflictInfo(cachedState.info || null)
          hasWarningRef.current = true
          freeConfirmationsRef.current = cachedState.freeStreak || 0
        }
      }
      
      const checkConflict = async () => {
        if (!isMounted) return
        
        setIsChecking(true)
        try {
          // Get the current database to check its PID (use ref to avoid effect restarts)
          const currentDb = databasesRef.current.find((db: DatabaseContainer) => db.id === databaseId)
          
          // Check for internal conflicts first (faster) using ref snapshot
          const internalConflict = databasesRef.current.find((otherDb: DatabaseContainer) => 
            otherDb.id !== databaseId && 
            otherDb.port === port && 
            (otherDb.status === "running" || otherDb.status === "starting")
          )
          
          if (internalConflict) {
            if (isMounted) {
              // Always set conflict for internal conflicts - clear confirmation counter
              freeConfirmationsRef.current = 0
              hasWarningRef.current = true
              const info = { processName: `Another database: ${internalConflict.name}`, pid: 'N/A' }
              setConflictInfo(info)
              // Update cache
              updatePortWarningCache(port, { show: true, info, freeStreak: 0 })
            }
            setIsChecking(false)
            return
          }
          
          // For recently stopped databases, suppress transient external warnings
          const now = Date.now()
          const justStoppedWindowMs = 2500 // 2.5s grace window
          const isRecentlyStopped =
            isStoppedLike &&
            stopTimestampRef.current !== null &&
            now - stopTimestampRef.current < justStoppedWindowMs

          // Check for external conflicts (for both running and stopped databases)
          const externalConflict = await getPortConflictInfo(port)
          
          if (isMounted) {
            if (externalConflict) {
              // If this DB was just stopped, ignore this one-off external conflict result to avoid flicker
              if (isRecentlyStopped) {
                // Clear any stale warning state immediately for this DB
                hasWarningRef.current = false
                freeConfirmationsRef.current = 0
                setConflictInfo(null)
                updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                setIsChecking(false)
                return
              }

              // Reset free confirmation counter when conflict is detected
              freeConfirmationsRef.current = 0
              
              // Port is in use - verify it's a real conflict
              if (!isLikelyFalsePositive(externalConflict.processName)) {
                // Additional check: if this is a database process, verify it's not this database's own process
                const isDatabaseProcess = isDatabaseRelatedProcess(externalConflict.processName)
                
                // If database is running, check if the detected process is this database's own process
                // Check by PID (handle both string and number comparison)
                const pidMatches = currentDb?.pid && (
                  externalConflict.pid === currentDb.pid.toString() ||
                  externalConflict.pid === String(currentDb.pid) ||
                  parseInt(externalConflict.pid) === currentDb.pid
                )
                
                // Also check if process name contains this database's name or container ID
                const processNameLower = externalConflict.processName.toLowerCase()
                // Handle format like "Database: pg-mho65ape" - extract name after "Database:"
                const dbNameInProcess = currentDb?.name && (
                  processNameLower.includes(currentDb.name.toLowerCase()) ||
                  processNameLower.includes(`database: ${currentDb.name.toLowerCase()}`)
                )
                const containerIdMatches = currentDb?.containerId && processNameLower.includes(currentDb.containerId.toLowerCase())
                
                // If database is running and we detect its own process, don't show warning
                if ((databaseStatus === "running" || databaseStatus === "starting") && 
                    isDatabaseProcess && 
                    (pidMatches || dbNameInProcess || containerIdMatches)) {
                  // This is this database's own process - not a conflict, clear immediately
                  hasWarningRef.current = false
                  setConflictInfo(null)
                  freeConfirmationsRef.current = 0
                  // Update cache - clear immediately since PID/name match confirms it's our own process
                  updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                } else {
                  // Check if PID changed - if so, this might be a different process or the old one was killed
                  const previousPid = conflictInfo?.pid || cachedState?.info?.pid
                  const currentPid = externalConflict.pid
                  
                  if (previousPid && previousPid !== currentPid && previousPid !== 'N/A' && currentPid !== 'Unknown') {
                    // PID changed - the old process was likely killed, clear immediately
                    console.log(`[Port Warning] PID changed from ${previousPid} to ${currentPid}, clearing old warning`)
                    hasWarningRef.current = false
                    setConflictInfo(null)
                    freeConfirmationsRef.current = 0
                    updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                  } else {
                    // Real conflict detected (same PID or first detection)
                    // Always set/keep the warning when conflict is confirmed - no flickering
                    hasWarningRef.current = true
                    freeConfirmationsRef.current = 0 // Reset counter when conflict is confirmed
                    setConflictInfo(externalConflict)
                    // Update cache
                    updatePortWarningCache(port, { show: true, info: externalConflict, freeStreak: 0 })
                  }
                }
              } else {
                // False positive detected - don't clear existing warning if we have one
                if (!hasWarningRef.current) {
                  setConflictInfo(null)
                }
              }
            } else {
              // Port conflict check returned no conflict - port might be free
              // Need 2 consecutive "free" confirmations before removing warning (prevents flickering)
              if (hasWarningRef.current || cachedState?.show) {
                freeConfirmationsRef.current++
                if (freeConfirmationsRef.current >= 2) {
                  // Only clear after 2 consecutive confirmations that port is free
                  hasWarningRef.current = false
                  setConflictInfo(null)
                  freeConfirmationsRef.current = 0 // Reset counter after clearing
                  // Update cache - clear after stable confirmations (force clear)
                  updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                } else {
                  // Update cache with current free streak to persist between renders
                  const currentCacheInfo = cachedState?.info || conflictInfo
                  updatePortWarningCache(port, { 
                    show: true, 
                    info: currentCacheInfo, 
                    freeStreak: freeConfirmationsRef.current 
                  })
                }
              } else {
                // No warning was showing, but make sure cache is cleared
                if (cachedState?.show) {
                  updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                }
              }
            }
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          console.error(`[Port Warning] Error checking port ${port}:`, errorMessage)
        } finally {
          if (isMounted) setIsChecking(false)
        }
      }
      
      // Immediate check to show warning right away if port is taken
      checkConflict()
      
      // Re-check more frequently when a warning is active (every 2 seconds) to clear faster
      // Otherwise check every 10 seconds
      const getInterval = () => {
        if (hasWarningRef.current || cachedState?.show) {
          return 2000 // 2 seconds when warning is active
        }
        return 10000 // 10 seconds when no warning
      }
      
      currentIntervalRef.current = getInterval()
      
      let interval = setInterval(() => {
        if (isMounted) {
          checkConflict()
          const newInterval = getInterval()
          if (newInterval !== currentIntervalRef.current) {
            clearInterval(interval)
            currentIntervalRef.current = newInterval
            interval = setInterval(() => {
              if (isMounted) {
                checkConflict()
              }
            }, newInterval)
          }
        }
      }, currentIntervalRef.current)
      
      return () => {
        isMounted = false
        freeConfirmationsRef.current = 0
        clearInterval(interval)
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [port, databaseId, databaseStatus, cachedState, conflictInfo])

    const displayInfo = conflictInfo || cachedState?.info || null

    const warningMessage = (() => {
      if (!displayInfo) return null

      const isStopped = databaseStatus === "stopped" || databaseStatus === "stopping"
      const isInternalConflict = displayInfo.processName?.startsWith('Another database:')
      
      return isInternalConflict
        ? isStopped
          ? `Port ${port} is in use by ${displayInfo.processName.replace('Another database: ', '')}. Database won't start.`
          : `Port ${port} is in use by ${displayInfo.processName.replace('Another database: ', '')}`
        : isStopped
          ? `Port ${port} is in use by ${displayInfo.processName} (PID: ${displayInfo.pid}). Database won't start.`
          : `Port ${port} is in use by external process: ${displayInfo.processName} (PID: ${displayInfo.pid})`
    })()

    // Only show warning if there's an actual conflict (live or cached) and not in the immediate post-stop window
    const hasConfirmedFree = freeConfirmationsRef.current >= 2
    const now = Date.now()
    const justStoppedWindowMs = 2500
    const isRecentlyStoppedDisplay =
      (databaseStatus === "stopped" || databaseStatus === "stopping") &&
      stopTimestampRef.current !== null &&
      now - stopTimestampRef.current < justStoppedWindowMs

    const shouldShow =
      !hasConfirmedFree &&
      !isRecentlyStoppedDisplay &&
      (hasWarningRef.current || cachedState?.show) &&
      !!(conflictInfo || cachedState?.info) &&
      !!warningMessage

    if (!shouldShow) {
      return null
    }

    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <span className="text-warning text-[10px] cursor-help">
            ⚠️
          </span>
        </TooltipTrigger>
        <TooltipContent className="z-[99999] bg-destructive text-destructive-foreground border border-destructive shadow-sm">
          <p className="font-medium">
            {warningMessage}
          </p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return {
    isPortBanned,
    checkPortConflict,
    getPortConflictInfo,
    findFreePort,
    checkPortConflictsInSelection,
    showPortConflictDialog,
    handleConflictDatabaseSelect,
    handleResolvePortConflict,
    PortConflictWarning
  }
}

