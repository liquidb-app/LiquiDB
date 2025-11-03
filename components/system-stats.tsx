"use client"

import { useState, useEffect, useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Cpu, MemoryStick, HardDrive, Clock, Database, Activity } from "lucide-react"

interface SystemStats {
  success: boolean
  memory?: {
    total: number
    free: number
    used: number
    percentage: number
  }
  cpu?: {
    usage: number
    percentage: number
  }
  disk?: {
    total: number
    free: number
    used: number
    percentage: number
  } | null
  uptime?: number
  loadAverage?: number[]
  runningDatabases?: number
  error?: string
}

// Helper function to format bytes
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Helper function to format uptime
const formatUptime = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export function SystemStats() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStats = async () => {
    try {
      // @ts-ignore
      const data = await window.electron?.getSystemStats?.()
      if (data) {
        setStats(data)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Error fetching app stats:', error)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // Initial fetch
    fetchStats()

    // Use Page Visibility API to pause polling when tab is hidden
    let isVisible = !document.hidden
    
    const handleVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible) {
        // Refresh immediately when becoming visible
        fetchStats()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Poll every 8 seconds for live updates (reduced from 2s to save CPU/memory)
    intervalRef.current = setInterval(() => {
      // Only poll when page is visible to save resources
      if (isVisible) {
      fetchStats()
      }
    }, 8000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (isLoading || !stats?.success || !stats.memory || !stats.cpu) {
    return null
  }

  const cpuPercentage = stats.cpu.percentage
  const diskUsed = stats.disk?.used || 0
  const diskTotal = stats.disk?.total || 0
  const loadAvg = stats.loadAverage?.[0] || 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border/50 px-6 py-1.5">
      <div className="container mx-auto flex items-center justify-start gap-4 text-xs text-muted-foreground">
        {/* Running Databases */}
        {stats.runningDatabases !== undefined && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default min-w-[85px]">
                  {stats.runningDatabases > 0 && (
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  )}
                  <Database className="h-3 w-3 opacity-60 flex-shrink-0" />
                  <span className="font-mono tabular-nums">{stats.runningDatabases} running</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">Running Databases</div>
                  <div>Active instances: {stats.runningDatabases}</div>
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground/30 flex-shrink-0">|</span>
          </>
        )}

        {/* RAM Stats */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default min-w-[100px]">
              <MemoryStick className="h-3 w-3 opacity-60 flex-shrink-0" />
              <span className="font-mono tabular-nums whitespace-nowrap">RAM {formatBytes(stats.memory.used)}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <div className="font-semibold">App Memory Usage</div>
              <div>Used: {formatBytes(stats.memory.used)}</div>
              <div>Includes: Main process + Renderer + Database instances</div>
            </div>
          </TooltipContent>
        </Tooltip>

        <span className="text-muted-foreground/30 flex-shrink-0">|</span>

        {/* CPU Stats */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default min-w-[75px]">
              <Cpu className="h-3 w-3 opacity-60 flex-shrink-0" />
              <span className="font-mono tabular-nums whitespace-nowrap">CPU {cpuPercentage.toFixed(2)}%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs space-y-1">
              <div className="font-semibold">App CPU Usage</div>
              <div>Current: {cpuPercentage.toFixed(1)}%</div>
              <div>Includes: Main process + Renderer + Database instances</div>
            </div>
          </TooltipContent>
        </Tooltip>

        <span className="text-muted-foreground/30 flex-shrink-0">|</span>

        {/* Load Average */}
        {stats.loadAverage && stats.loadAverage.length > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default min-w-[70px]">
                  <Activity className="h-3 w-3 opacity-60 flex-shrink-0" />
                  <span className="font-mono tabular-nums whitespace-nowrap">Load {loadAvg.toFixed(2)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">App Load</div>
                  <div>Based on active processes</div>
                  <div>1min: {stats.loadAverage[0]?.toFixed(2) || '0.00'}</div>
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground/30 flex-shrink-0">|</span>
          </>
        )}

        {/* Disk Stats */}
        {stats.disk && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default min-w-[200px]">
                  <HardDrive className="h-3 w-3 opacity-60 flex-shrink-0" />
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    Disk: {formatBytes(diskUsed)} used (limit {formatBytes(diskTotal)})
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">Disk Usage</div>
                  <div>Used: {formatBytes(diskUsed)}</div>
                  <div>Free: {formatBytes(stats.disk.free)}</div>
                  <div>Total: {formatBytes(diskTotal)}</div>
                  <div>Usage: {stats.disk.percentage.toFixed(1)}%</div>
                </div>
              </TooltipContent>
            </Tooltip>
            <span className="text-muted-foreground/30 flex-shrink-0">|</span>
          </>
        )}

        {/* System Uptime */}
        {stats.uptime !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default min-w-[90px]">
                <Clock className="h-3 w-3 opacity-60 flex-shrink-0" />
                <span className="font-mono tabular-nums whitespace-nowrap">Uptime {formatUptime(stats.uptime)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <div className="font-semibold">App Uptime</div>
                <div>Total: {formatUptime(stats.uptime)}</div>
                <div>Seconds: {stats.uptime.toLocaleString()}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

