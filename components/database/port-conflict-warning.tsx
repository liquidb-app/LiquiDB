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
            if (hasWarningRef.current) {
              freeConfirmationsRef.current++
              if (freeConfirmationsRef.current >= 2) {
                hasWarningRef.current = false
                setConflictInfo(null)
                freeConfirmationsRef.current = 0
                updatePortWarningCache(port, { show: false, info: null, freeStreak: 0 })
              } else {
                updatePortWarningCache(port, { show: true, info: portWarningCache[port]?.info || conflictInfo, freeStreak: freeConfirmationsRef.current })
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
    
    const interval = setInterval(() => {
      if (isMounted) {
        checkConflict()
      }
    }, 10000)
    
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

  const shouldShow = hasWarningRef.current || cachedState?.show
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

