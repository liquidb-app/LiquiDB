"use client"

import { useState, useEffect, useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Cpu, MemoryStick, HardDrive, Clock, Database, Activity, Terminal as TerminalIcon } from "lucide-react"

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

const formatCompactNumber = (value: number, maxDecimals = 2) => {
  const fixed = Number.isFinite(value) ? value.toFixed(maxDecimals) : '0'
  // strip trailing zeros and optional dot
  return fixed.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1')
}

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  const value = bytes / Math.pow(k, i)
  return `${formatCompactNumber(value, 1)} ${sizes[i]}`
}

const formatUptime = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export function SystemStats() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const [mcpStatus, setMcpStatus] = useState<{ running: boolean; name: string } | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchStats = async () => {
    try {
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

  const fetchMCPStatus = async () => {
    try {
      const data = await window.electron?.getMCPStatus?.()
      if (data?.success && data.data) {
        setMcpStatus(data.data)
      }
    } catch (error) {
      console.error('Error fetching MCP status:', error)
    }
  }

  useEffect(() => {
    fetchStats()
    fetchMCPStatus()

    let isVisible = !document.hidden
    
    const handleVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible) {
        fetchStats()
        fetchMCPStatus()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    intervalRef.current = setInterval(() => {
      if (isVisible) {
      fetchStats()
      fetchMCPStatus()
      }
    }, 8000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth)
    }

    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth)
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [])

  const showText = windowWidth > 768

  if (isLoading || !stats?.success || !stats.memory || !stats.cpu) {
    return null
  }

  const cpuPercentage = stats.cpu.percentage
  const diskUsed = stats.disk?.used || 0
  const diskTotal = stats.disk?.total || 0
  const loadAvg = stats.loadAverage?.[0] || 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border/50 px-6 py-1.5">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex items-center justify-start gap-4">
        {/* MCP Icon - Very Left */}
        {mcpStatus !== null && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  {mcpStatus.running && (
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  )}
                  <svg
                    fill="currentColor"
                    fillRule="evenodd"
                    height="12"
                    width="12"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                    className="opacity-60 flex-shrink-0"
                    aria-label="MCP"
                  >
                    <title>ModelContextProtocol</title>
                    <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"></path>
                    <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"></path>
                  </svg>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">{mcpStatus.name}</div>
                  <div>Status: {mcpStatus.running ? "Running" : "Stopped"}</div>
                </div>
              </TooltipContent>
            </Tooltip>
            {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}
          </>
        )}
        {/* Running Databases */}
        {stats.runningDatabases !== undefined && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  {stats.runningDatabases > 0 && (
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  )}
                  <Database className="h-3 w-3 opacity-60 flex-shrink-0" />
                  {showText && (
                    <span className="font-mono tabular-nums">{stats.runningDatabases}</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-xs space-y-1">
                  <div className="font-semibold">Running Databases</div>
                  <div>Active instances: {stats.runningDatabases}</div>
                </div>
              </TooltipContent>
            </Tooltip>
            {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}
          </>
        )}

        {/* RAM Stats */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <MemoryStick className="h-3 w-3 opacity-60 flex-shrink-0" />
              {showText && (
                <span className="font-mono tabular-nums whitespace-nowrap">RAM {formatBytes(stats.memory.used)}</span>
              )}
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

        {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}

        {/* CPU Stats */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default">
              <Cpu className="h-3 w-3 opacity-60 flex-shrink-0" />
              {showText && (
                <span className="font-mono tabular-nums whitespace-nowrap">CPU {formatCompactNumber(cpuPercentage, 1)}%</span>
              )}
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

        {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}

        {/* Load Average */}
        {stats.loadAverage && stats.loadAverage.length > 0 && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <Activity className="h-3 w-3 opacity-60 flex-shrink-0" />
                  {showText && (
                    <span className="font-mono tabular-nums whitespace-nowrap">Load {formatCompactNumber(loadAvg, 2)}</span>
                  )}
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
            {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}
          </>
        )}

        {/* Disk Stats */}
        {stats.disk && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  <HardDrive className="h-3 w-3 opacity-60 flex-shrink-0" />
                  {showText && (
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      {formatBytes(diskUsed)} / {formatBytes(diskTotal)}
                    </span>
                  )}
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
            {showText && <span className="text-muted-foreground/30 flex-shrink-0">|</span>}
          </>
        )}

        {/* System Uptime */}
        {stats.uptime !== undefined && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 cursor-default">
                <Clock className="h-3 w-3 opacity-60 flex-shrink-0" />
                {showText && (
                  <span className="font-mono tabular-nums whitespace-nowrap">{formatUptime(stats.uptime)}</span>
                )}
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
        
        {/* Terminal Icon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-muted-foreground hover:text-foreground"
            >
              <TerminalIcon className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="text-xs">
              Terminal
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

