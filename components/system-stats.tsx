"use client"

import { useState, useEffect, useRef } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Cpu, MemoryStick, HardDrive, Clock, Database, Activity, Terminal as TerminalIcon } from "lucide-react"
import { cn } from "@/lib/utils"

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

// Custom hook to safely get sidebar state
function useSidebarState() {
  const [sidebarState, setSidebarState] = useState<{
    state: "expanded" | "collapsed"
    collapsible: "offcanvas" | "icon" | "none"
  }>({ state: "collapsed", collapsible: "offcanvas" })

  useEffect(() => {
    // Detect sidebar state from DOM
    const detectSidebarState = () => {
      if (typeof window === 'undefined') return
      
      const sidebarElement = document.querySelector('[data-slot="sidebar-container"]')
      if (sidebarElement) {
        const state = sidebarElement.getAttribute('data-state') as "expanded" | "collapsed" | null
        const collapsible = sidebarElement.getAttribute('data-collapsible') as "offcanvas" | "icon" | "none" | null
        
        setSidebarState({
          state: state || "collapsed",
          collapsible: collapsible || "offcanvas"
        })
        return
      }
      
      // Check if sidebar wrapper exists
      const sidebarWrapper = document.querySelector('[data-slot="sidebar-wrapper"]')
      if (sidebarWrapper) {
        // Look for sidebar state in the wrapper's children
        const sidebarGroup = sidebarWrapper.querySelector('[data-state]')
        if (sidebarGroup) {
          const state = sidebarGroup.getAttribute('data-state') as "expanded" | "collapsed" | null
          const collapsible = sidebarGroup.getAttribute('data-collapsible') as "offcanvas" | "icon" | "none" | null
          
          setSidebarState({
            state: state || "collapsed",
            collapsible: collapsible || "offcanvas"
          })
          return
        }
      }
      
      // Default: no sidebar visible
      setSidebarState({ state: "collapsed", collapsible: "offcanvas" })
    }

    // Initial detection
    detectSidebarState()

    // Watch for changes in sidebar state
    const observer = new MutationObserver(detectSidebarState)
    const sidebarWrapper = document.querySelector('[data-slot="sidebar-wrapper"]')
    if (sidebarWrapper) {
      observer.observe(sidebarWrapper, {
        attributes: true,
        attributeFilter: ['data-state', 'data-collapsible'],
        subtree: true,
        childList: true
      })
    }

    // Also watch for changes on the document body in case sidebar is added/removed
    const bodyObserver = new MutationObserver(detectSidebarState)
    if (typeof document !== 'undefined') {
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      })
    }

    return () => {
      observer.disconnect()
      bodyObserver.disconnect()
    }
  }, [])

  return sidebarState
}

export function SystemStats() {
  const [stats, setStats] = useState<SystemStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const sidebarState = useSidebarState()

  const fetchStats = async () => {
    try {
      const data = await window.electron?.getSystemStats?.()
      if (data) {
        setStats(data)
        setIsLoading(false)
      } else {
        // If data is null/undefined, preserve previous stats instead of clearing
        console.warn('[System Stats] No data received, preserving previous stats')
        setIsLoading(false)
      }
    } catch (error) {
      // Log error but preserve previous stats instead of clearing
      console.error('[System Stats] Error fetching app stats:', error)
      // Don't clear stats on error - preserve previous values
      setIsLoading(false)
    }
  }


  useEffect(() => {
    fetchStats()

    let isVisible = !document.hidden
    
    const handleVisibilityChange = () => {
      isVisible = !document.hidden
      if (isVisible) {
        fetchStats()
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Listen for database updates to refresh stats immediately
    const handleDatabasesUpdated = () => {
      if (isVisible) {
        fetchStats()
      }
    }
    
    if (window.electron?.onDatabasesUpdated) {
      window.electron.onDatabasesUpdated(handleDatabasesUpdated)
    }

    // Start with default interval (increased to reduce load)
    intervalRef.current = setInterval(() => {
      if (isVisible) {
      fetchStats()
      }
    }, 10000) // Increased from 8s to 10s

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (window.electron?.removeDatabasesUpdatedListener) {
        window.electron.removeDatabasesUpdatedListener()
      }
    }
  }, [])


  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null
    
    const handleResize = () => {
      // Debounce resize to prevent excessive state updates during rapid resizing
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      resizeTimeout = setTimeout(() => {
        setWindowWidth(window.innerWidth)
      }, 100)
    }

    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth)
      window.addEventListener('resize', handleResize)
    }

    return () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
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

  // Calculate footer left offset based on sidebar state
  // When sidebar is expanded: shift by 16rem (256px)
  // When sidebar is collapsed with icon: shift by 3rem (48px)
  // When sidebar is collapsed with offcanvas: no shift (0)
  const getFooterLeftOffset = () => {
    if (sidebarState.state === "expanded") {
      return "md:left-[16rem]"
    }
    if (sidebarState.collapsible === "icon") {
      return "md:left-[3rem]"
    }
    return "md:left-0"
  }

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border/50 px-5 py-1 transition-all duration-200 ease-linear",
      getFooterLeftOffset()
    )}>
      <div className="flex items-center justify-between gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center justify-start gap-4">
        {/* Running Databases */}
        {stats.runningDatabases !== undefined && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 cursor-default">
                  {stats.runningDatabases > 0 && (
                    <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse flex-shrink-0" />
                  )}
                  <Database className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
              <MemoryStick className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
              <Cpu className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
                  <Activity className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
                  <HardDrive className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
                <Clock className="h-2.5 w-2.5 opacity-60 flex-shrink-0" />
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
              className="h-[22px] px-2 text-muted-foreground hover:text-foreground"
            >
              <TerminalIcon className="h-2.5 w-2.5" />
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

