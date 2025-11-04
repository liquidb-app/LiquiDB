"use client"

import { useState, useEffect, useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getPortConflictInfo, isLikelyFalsePositive, isDatabaseRelatedProcess } from "@/lib/utils/port-utils"
import type { DatabaseContainer, DatabaseStatus } from "@/lib/types"

interface PortConflictWarningProps {
  port: number
  databaseId: string
  databaseStatus: DatabaseStatus
  databasesRef: React.MutableRefObject<DatabaseContainer[]>
  portWarningCache: Record<number, {
    show: boolean
    info: { processName: string; pid: string } | null
    freeStreak: number
  }>
  updatePortWarningCache: (portNumber: number, next: { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }) => void
}

export function PortConflictWarning({ 
  port, 
  databaseId, 
  databaseStatus,
  databasesRef,
  portWarningCache,
  updatePortWarningCache,
}: PortConflictWarningProps) {
  const [conflictInfo, setConflictInfo] = useState<{ processName: string; pid: string } | null>(null)
  const [, setIsChecking] = useState(false)
  const freeConfirmationsRef = useRef(0)
  const hasWarningRef = useRef(false)
  const cachedState = portWarningCache[port]

  useEffect(() => {
    hasWarningRef.current = conflictInfo !== null
  }, [conflictInfo])

  useEffect(() => {
    let isMounted = true

    if (cachedState?.show && !conflictInfo) {
      setConflictInfo(cachedState.info || null)
      hasWarningRef.current = true
      freeConfirmationsRef.current = cachedState.freeStreak || 0
    }
    
    const checkConflict = async () => {
      if (!isMounted) return
      
      setIsChecking(true)
      try {
        const currentDb = databasesRef.current.find((db: DatabaseContainer) => db.id === databaseId)
        
        // Check for internal conflicts first
        const internalConflict = databasesRef.current.find((otherDb: DatabaseContainer) => 
          otherDb.id !== databaseId && 
          otherDb.port === port && 
          (otherDb.status === "running" || otherDb.status === "starting")
        )
        
        if (internalConflict) {
          if (isMounted) {
            freeConfirmationsRef.current = 0
            hasWarningRef.current = true
            const info = { processName: `Another database: ${internalConflict.name}`, pid: 'N/A' }
            setConflictInfo(info)
            updatePortWarningCache(port, { show: true, info, freeStreak: 0 })
          }
          setIsChecking(false)
          return
        }
        
        // Check for external conflicts
        const externalConflict = await getPortConflictInfo(port)
        
        if (isMounted) {
          if (externalConflict) {
            freeConfirmationsRef.current = 0
            
            if (!isLikelyFalsePositive(externalConflict.processName)) {
              const isDatabaseProcess = isDatabaseRelatedProcess(externalConflict.processName)
              
              if ((databaseStatus === "running" || databaseStatus === "starting") && 
                  isDatabaseProcess && 
                  currentDb?.pid && 
                  externalConflict.pid === currentDb.pid.toString()) {
                hasWarningRef.current = false
                setConflictInfo(null)
                freeConfirmationsRef.current = 0
                updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
              } else {
                hasWarningRef.current = true
                freeConfirmationsRef.current = 0
                setConflictInfo(externalConflict)
                updatePortWarningCache(port, { show: true, info: externalConflict, freeStreak: 0 })
              }
            } else {
              if (!hasWarningRef.current) {
                setConflictInfo(null)
              }
            }
          } else {
            // Port conflict check returned no conflict - port might be free
            // Check if we had a stored PID that no longer exists
            const storedPid = conflictInfo?.pid || cachedState?.info?.pid
            if (storedPid && storedPid !== 'N/A' && storedPid !== 'Unknown') {
              // Verify the stored PID is no longer running
              try {
                // @ts-expect-error - Electron IPC types not available
                if (window.electron?.checkPortConflict) {
                  // @ts-expect-error - Electron IPC types not available
                  const pidCheck = await window.electron.checkPortConflict(port)
                  const currentPid = pidCheck?.processInfo?.pid
                  
                  // If PID changed or no longer detected, clear immediately
                  if (!pidCheck?.inUse || (currentPid && currentPid !== storedPid)) {
                    hasWarningRef.current = false
                    setConflictInfo(null)
                    freeConfirmationsRef.current = 0
                    updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
                    setIsChecking(false)
                    return
                  }
                }
              } catch (error) {
                // If check fails, continue with normal flow
              }
            }
            
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
                // But keep show as true until we have 2 confirmations
                updatePortWarningCache(port, { 
                  show: true, 
                  info: portWarningCache[port]?.info || conflictInfo, 
                  freeStreak: freeConfirmationsRef.current 
                })
              }
              // Otherwise keep existing warning state - don't clear on single "free" check
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
    
    checkConflict()
    
    // Re-check more frequently when a warning is active (every 2 seconds) to clear faster
    // Otherwise check every 10 seconds
    const getInterval = () => {
      // If we have a warning, check more frequently
      if (hasWarningRef.current || cachedState?.show) {
        return 2000 // 2 seconds when warning is active
      }
      return 10000 // 10 seconds when no warning
    }
    
    // Use a ref to track the current interval value
    const currentIntervalRef = useRef(getInterval())
    
    let interval = setInterval(() => {
      if (isMounted) {
        checkConflict()
        // Update interval dynamically based on warning state
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
  }, [port, databaseId, databaseStatus, cachedState, conflictInfo, databasesRef, portWarningCache, updatePortWarningCache])

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

  // Only show warning if there's an actual conflict (live or cached)
  // Don't show if we've confirmed the port is free (2+ consecutive free checks)
  const hasConfirmedFree = freeConfirmationsRef.current >= 2
  const shouldShow = (hasWarningRef.current || cachedState?.show) && 
                     !hasConfirmedFree && 
                     (conflictInfo !== null || cachedState?.info)
  if (!shouldShow || !displayInfo || !warningMessage) {
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

