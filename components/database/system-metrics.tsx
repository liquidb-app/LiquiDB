"use client"

import { useEffect } from "react"
import { log } from "@/lib/logger"
import { formatBytes, formatUptime } from "@/lib/utils/database/database-utils"
import type { DatabaseContainer } from "@/lib/types"

interface SystemMetricsProps {
  database: DatabaseContainer
  fetchSystemInfo: (databaseId: string) => void
  setLastSystemInfoCheck: React.Dispatch<React.SetStateAction<Record<string, number>>>
  lastSystemInfoCheckRef: React.MutableRefObject<Record<string, number>>
}

export function SystemMetrics({
  database,
  fetchSystemInfo,
  setLastSystemInfoCheck,
  lastSystemInfoCheckRef,
}: SystemMetricsProps) {

  useEffect(() => {
    if (database.status !== "running" || database.systemInfo) {
      return
    }
    
    log.debug(`Database ${database.id} is running but has no systemInfo - triggering fetch`)
    const timeoutId = setTimeout(() => {
      const now = Date.now()
      const lastCheck = lastSystemInfoCheckRef.current[database.id] || 0
      if (now - lastCheck > 5000) {
        // Allow more frequent checks for missing data
        setLastSystemInfoCheck((prev) => ({ ...prev, [database.id]: now }))
        fetchSystemInfo(database.id)
      }
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [database.id, database.status, database.systemInfo, fetchSystemInfo, lastSystemInfoCheckRef, setLastSystemInfoCheck])

  if (database.status !== "running") {
    return null
  }

  log.debug(`Database ${database.id} status: ${database.status}, systemInfo:`, database.systemInfo)

  if (database.systemInfo) {
    return (
      <div className="space-y-1 mb-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">Uptime</span>
          <span className="font-mono font-medium text-success">{formatUptime(database.systemInfo.uptime)}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] text-muted-foreground">CPU</div>
            <div className="text-[11px] font-medium">{database.systemInfo.cpu.toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Memory</div>
            <div className="text-[11px] font-medium">{formatBytes(database.systemInfo.memory)}</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground">Connections</div>
            <div className="text-[11px] font-medium">{database.systemInfo.connections}</div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="space-y-1 mb-2 pt-2 border-t border-border/50">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Uptime</span>
        <span className="font-mono font-medium text-muted-foreground">Loading...</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">CPU</div>
          <div className="text-[11px] font-medium text-muted-foreground">--</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Memory</div>
          <div className="text-[11px] font-medium text-muted-foreground">--</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">Connections</div>
          <div className="text-[11px] font-medium text-muted-foreground">--</div>
        </div>
      </div>
    </div>
  )
}

