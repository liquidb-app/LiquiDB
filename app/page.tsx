"use client"

import React, { useEffect, useState, useRef } from "react"
import { log } from '../lib/logger'
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Square, RotateCw, CheckSquare, CheckSquare2, MousePointer2 } from "lucide-react"
import { CogIcon } from "@/components/ui/cog"
import { CopyIcon } from "@/components/ui/copy"
import { PlayIcon } from "@/components/ui/play"
import { PlusIcon } from "@/components/ui/plus"
import { CheckIcon } from "@/components/ui/check"
import { GripIcon } from "@/components/ui/grip"
import { ActivityIcon } from "@/components/ui/activity"
import { SettingsIcon } from "@/components/ui/settings"
import { RefreshCCWIcon } from "@/components/ui/refresh-ccw"
import { BoxesIcon } from "@/components/ui/boxes"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"
import { useDatabaseIconHover } from "@/hooks/use-database-icon-hover"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AddDatabaseDialog } from "@/components/add-database-dialog"
import { DatabaseSettingsDialog } from "@/components/database-settings-dialog"
import { PortConflictDialog } from "@/components/port-conflict-dialog"
import { AppSettingsDialog } from "@/components/app-settings-dialog"
import { InstanceInfoDialog } from "@/components/instance-info-dialog"
import { HelperHealthMonitor } from "@/components/helper-health-monitor"
import { PermissionsDialog } from "@/components/permissions-dialog"
import { usePermissions } from "@/lib/use-permissions"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { notifySuccess, notifyError, notifyInfo, notifyWarning } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"
import { OnboardingOverlay } from "@/components/onboarding"
import { MaybeStartSidebarTour } from "@/components/sidebar-tour"
import { ProfileMenuTrigger } from "@/components/profile-menu"
import { LoadingScreen } from "@/components/loading-screen"
import { isOnboardingComplete, wasTourRequested, setTourRequested } from "@/lib/preferences"

// Helper function to format bytes
const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Helper function to format uptime
const formatUptime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`
  } else {
    return `${secs}s`
  }
}

// Helper function to render database icons (emoji or custom image)
const renderDatabaseIcon = (icon: string | undefined, className: string = "w-full h-full object-cover") => {
  if (!icon) {
    return <BoxesIcon size={14} />
  }
  
  // Check if it's a custom image path (starts with file path or data URL)
  if (icon.startsWith('/') || icon.startsWith('file://') || icon.startsWith('data:') || icon.includes('.')) {
    return (
      <DatabaseIcon 
        src={icon} 
        alt="Database icon" 
        className={className}
      />
    )
  }
  
  // It's an emoji, render as text
  return <span className="text-base leading-none">{icon}</span>
}

// Component to handle custom image loading with file:// URL conversion
const DatabaseIcon = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) return
      
      // If it's already a data URL, use it directly
      if (src.startsWith('data:')) {
        setImageSrc(src)
        setIsLoading(false)
        return
      }
      
      // If it's a file:// URL, convert it to data URL
      if (src.startsWith('file://')) {
        try {
          // @ts-ignore
          const result = await window.electron?.convertFileToDataUrl?.(src)
          if (result?.success) {
            setImageSrc(result.dataUrl)
          } else {
            console.error('Failed to convert file to data URL:', result?.error)
            setHasError(true)
          }
        } catch (error) {
          console.error('Error converting file to data URL:', error)
          setHasError(true)
        } finally {
          setIsLoading(false)
        }
      } else {
        // For other URLs, try to load directly
        setImageSrc(src)
        setIsLoading(false)
      }
    }

    loadImage()
  }, [src])

  if (isLoading) {
    return <BoxesIcon size={14} />
  }

  if (hasError || !imageSrc) {
    return <BoxesIcon size={14} />
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt} 
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

export default function DatabaseManager() {
  const [isLoading, setIsLoading] = useState(true) // Show loading screen initially
  const [showOnboarding, setShowOnboarding] = useState(false) // Don't show onboarding until loading is complete
  const [dashboardOpacity, setDashboardOpacity] = useState(0) // Start with 0, fade in when onboarding finishes
  const [databases, setDatabases] = useState<DatabaseContainer[]>([])
  const [animationThrottled, setAnimationThrottled] = useState(false)
  
  // Animated icon hover hooks
  const settingsIconHover = useAnimatedIconHover()
  const copyIconHover = useAnimatedIconHover()
  const playIconHover = useAnimatedIconHover()
  const plusIconHover = useAnimatedIconHover()
  const checkIconHover = useAnimatedIconHover()
  const gripIconHover = useAnimatedIconHover()
  const debugIconHover = useAnimatedIconHover()
  const restartIconHover = useAnimatedIconHover()
  
  // Database-specific icon hover hook
  const { createHoverHandlers } = useDatabaseIconHover()
  
  // Update databases ref whenever databases state changes
  useEffect(() => {
    databasesRef.current = databases
  }, [databases])

  // Animation throttling based on running databases
  useEffect(() => {
    const runningDatabases = databases.filter(db => db.status === "running" || db.status === "starting")
    // Throttle animations when more than 2 databases are running
    setAnimationThrottled(runningDatabases.length > 2)
  }, [databases])

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
  }, [])
  
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [instanceInfoOpen, setInstanceInfoOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseContainer | null>(null)
  const [conflictingPort, setConflictingPort] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastStatusCheck, setLastStatusCheck] = useState<Record<string, number>>({})
  const lastStatusCheckRef = useRef<Record<string, number>>({})
  const [lastSystemInfoCheck, setLastSystemInfoCheck] = useState<Record<string, number>>({})
  const databasesRef = useRef<DatabaseContainer[]>([])
  const [activeTab, setActiveTab] = useState<string>("all")
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [bannedPorts, setBannedPorts] = useState<number[]>([])
  const [portConflictDialogOpen, setPortConflictDialogOpen] = useState(false)
  const [portConflicts, setPortConflicts] = useState<[number, DatabaseContainer[]][]>([])
  // No port conflict caching - all checks are dynamic
  
  // Permissions
  const {
    permissions,
    isLoading: permissionsLoading,
    checkPermissions,
    openSystemPreferences,
    openPermissionPage,
    requestCriticalPermissions,
    hasAllCriticalPermissions,
    hasAllPermissions
  } = usePermissions()
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)

  // App initialization - check onboarding status after loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Simulate app initialization time
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Check onboarding status
        const done = isOnboardingComplete()
        setShowOnboarding(!done)
        
        // If onboarding is complete, fade in dashboard
        if (done) {
          setDashboardOpacity(1)
        }
      } catch (error) {
        console.error("App initialization error:", error)
        setShowOnboarding(true) // Default to onboarding if check fails
      } finally {
        setIsLoading(false) // Hide loading screen
      }
    }

    initializeApp()
  }, [])

  // Allow profile menu to open settings via event
  useEffect(() => {
    const handler = () => setAppSettingsOpen(true)
    window.addEventListener("open-app-settings", handler as EventListener)
    return () => window.removeEventListener("open-app-settings", handler as EventListener)
  }, [])

  // Check permissions on app startup
  useEffect(() => {
    if (!permissionsLoading && permissions.length > 0) {
      const missingCritical = permissions.filter(p => p.critical && !p.granted)
      if (missingCritical.length > 0) {
        setPermissionsDialogOpen(true)
      }
    }
  }, [permissions, permissionsLoading])

  // Load banned ports on component mount and listen for changes
  useEffect(() => {
    const loadBannedPorts = async () => {
      try {
        // @ts-ignore
        if (window.electron?.getBannedPorts) {
          // @ts-ignore
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
  }, [])

  // Dashboard fade-in effect when onboarding finishes
  useEffect(() => {
    if (!showOnboarding) {
      // Fade in dashboard when onboarding is hidden
      const timer = setTimeout(() => {
        setDashboardOpacity(1)
      }, 100) // Small delay to sync with stars fade-out
      return () => clearTimeout(timer)
    }
  }, [showOnboarding])

  // Function to check if a port is banned
  const isPortBanned = (port: number): boolean => {
    return bannedPorts.includes(port)
  }

  // Function to check for port conflicts dynamically (no caching)
  const checkPortConflict = async (port: number): Promise<{ inUse: boolean; processName?: string; pid?: string }> => {
    try {
      // @ts-ignore
      if (window.electron?.checkPortConflict) {
        // @ts-ignore
        const result = await window.electron.checkPortConflict(port)
        return {
          inUse: result?.inUse || false,
          processName: result?.processInfo?.processName || 'Unknown process',
          pid: result?.processInfo?.pid || 'Unknown'
        }
      }
      return { inUse: false }
    } catch (error) {
      console.error(`[Port Check] Error checking port ${port}:`, error)
      return { inUse: false }
    }
  }

  // Function to check if a port has a conflict (dynamic check)
  const hasPortConflict = async (port: number): Promise<boolean> => {
    const result = await checkPortConflict(port)
    return result.inUse
  }

  // Function to get port conflict info (dynamic check)
  const getPortConflictInfo = async (port: number): Promise<{ processName: string; pid: string } | null> => {
    const result = await checkPortConflict(port)
    return result.inUse ? { processName: result.processName || 'Unknown', pid: result.pid || 'Unknown' } : null
  }

  // Dynamic port conflict warning component
  const PortConflictWarning = ({ port, databaseId, databaseStatus }: { port: number; databaseId: string; databaseStatus: string }) => {
    // Disable port warnings for stopped databases to prevent false positives
    // Only show warnings for running/starting databases where conflicts actually matter
    if (databaseStatus === "stopped" || databaseStatus === "stopping") {
      return null
    }

    const [conflictInfo, setConflictInfo] = useState<{ processName: string; pid: string } | null>(null)
    const [isChecking, setIsChecking] = useState(false)
    const [hasInitialized, setHasInitialized] = useState(false)

    useEffect(() => {
      let isMounted = true
      
      const checkConflict = async () => {
        // Only show warning if this database is NOT running
        if (databaseStatus === "running" || databaseStatus === "starting") {
          if (isMounted) setConflictInfo(null)
          return
        }
        
        setIsChecking(true)
        try {
          // Check for internal conflicts first (faster)
          const internalConflict = databases.some(otherDb => 
            otherDb.id !== databaseId && 
            otherDb.port === port && 
            (otherDb.status === "running" || otherDb.status === "starting")
          )
          
          if (internalConflict) {
            if (isMounted) setConflictInfo({ processName: 'Another database in this app', pid: 'N/A' })
            return
          }
          
          // Only check for external conflicts if no internal conflicts found
          // Add a small delay to ensure system is stable
          await new Promise(resolve => setTimeout(resolve, 100))
          
          const externalConflict = await getPortConflictInfo(port)
          
          if (isMounted) {
            // Only set conflict info if there's actually a meaningful conflict
            // Filter out common false positives like system processes that don't actually conflict
            if (externalConflict && !isLikelyFalsePositive(externalConflict.processName)) {
              setConflictInfo(externalConflict)
            } else {
              setConflictInfo(null)
            }
          }
        } catch (error) {
          console.error(`[Port Warning] Error checking port ${port}:`, error)
          if (isMounted) setConflictInfo(null)
        } finally {
          if (isMounted) setIsChecking(false)
        }
      }
      
      // Add a delay before the first check to allow the system to stabilize after reload
      const initialTimeout = setTimeout(() => {
        if (isMounted) {
          checkConflict()
          setHasInitialized(true)
        }
      }, 2000) // Wait 2 seconds before first check
      
      // Re-check every 5 seconds, but only after initial check
      const interval = setInterval(() => {
        if (isMounted && hasInitialized) {
          checkConflict()
        }
      }, 5000)
      
      return () => {
        isMounted = false
        clearTimeout(initialTimeout)
        clearInterval(interval)
      }
    }, [port, databaseId, databaseStatus, databases, hasInitialized])

    // Don't show anything if no conflict and not checking
    if (!conflictInfo && !isChecking) {
      return null
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-warning text-[10px] cursor-help">
            ⚠️
          </span>
        </TooltipTrigger>
        <TooltipContent className="z-[99999]">
          <p>
            {conflictInfo?.processName === 'Another database in this app'
              ? `Port ${port} is in use by another database in this app`
              : `Port ${port} is in use by external process: ${conflictInfo?.processName} (PID: ${conflictInfo?.pid})`
            }
          </p>
        </TooltipContent>
      </Tooltip>
    )
  }

  // Helper function to filter out likely false positives
  const isLikelyFalsePositive = (processName: string): boolean => {
    const falsePositives = [
      'node', 'npm', 'yarn', 'pnpm', 'next', 'webpack', 'vite', 'dev',
      'chrome', 'safari', 'firefox', 'electron', 'code', 'cursor',
      'system', 'kernel', 'launchd', 'WindowServer', 'Finder'
    ]
    
    const lowerProcessName = processName.toLowerCase()
    return falsePositives.some(fp => lowerProcessName.includes(fp.toLowerCase()))
  }

  // Function to check if a database name already exists
  const isNameDuplicate = (name: string, excludeId?: string): boolean => {
    return databases.some(db => db.name === name && db.id !== excludeId)
  }

  // Function to check if a container ID already exists
  const isContainerIdDuplicate = (containerId: string, excludeId?: string): boolean => {
    return databases.some(db => db.containerId === containerId && db.id !== excludeId)
  }

  // Function to find the next available port starting from a given port
  const findNextAvailablePort = async (startPort: number, excludeId?: string): Promise<number> => {
    let port = startPort
    const maxAttempts = 100 // Prevent infinite loops
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Check if port is banned
      if (isPortBanned(port)) {
        port++
        continue
      }
      
      // Check for internal conflicts (other databases in the app)
      const internalConflict = databases.some(db => 
        db.id !== excludeId && 
        db.port === port && 
        (db.status === "running" || db.status === "starting")
      )
      
      if (internalConflict) {
        port++
        continue
      }
      
      // Check for external conflicts (other services)
      try {
        const conflictResult = await checkPortConflict(port)
        if (conflictResult.inUse) {
          port++
          continue
        }
      } catch (error) {
        console.error(`[Port Check] Error checking port ${port}:`, error)
        port++
        continue
      }
      
      // Port is available
      return port
    }
    
    // If we couldn't find an available port, return the original port
    console.warn(`[Port Check] Could not find available port starting from ${startPort}, returning original`)
    return startPort
  }

  // Function to fetch system info for running databases
  // Each instance gets its own independent memory stats (RSS - Resident Set Size)
  const fetchSystemInfo = async (databaseId: string) => {
    try {
      log.debug(`Fetching system info for database ${databaseId}`)
      // @ts-ignore
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
  }

  // Helper function to parse uptime string to seconds
  const parseUptimeToSeconds = (uptimeStr: string): number => {
    // Parse format like "00:02:34" or "2:34:56"
    const parts = uptimeStr.split(':').map(part => parseInt(part, 10))
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2]
    }
    return 0
  }

  // Main useEffect to load databases and set up monitoring
  useEffect(() => {
    let isMounted = true
    let statusInterval: NodeJS.Timeout | null = null
    let systemInfoInterval: NodeJS.Timeout | null = null
    let lastDatabaseCount = 0
    let noActiveDatabasesCount = 0
    // Track all pending timeouts to clear them on unmount
    const pendingTimeouts = new Set<NodeJS.Timeout>()

    const load = async (retryCount = 0) => {
      const maxRetries = 3
      
      // Check if Electron is available
      // @ts-ignore
      if (!window.electron) {
        console.log("[Debug] Electron not available yet, retrying in 1 second")
        setTimeout(() => load(retryCount), 1000)
        return
      }
      
      // Check if databases.json file exists
      let fileExists = false
      try {
        // @ts-ignore
        const fileCheck = await window.electron?.checkDatabasesFile?.()
        fileExists = fileCheck?.exists || false
        
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
        // @ts-ignore
        if (window.electron?.getDatabases) {
          // @ts-ignore
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
                    fetchSystemInfo(db.id)
                  }
                }, 2000) // Wait 2 seconds for initial load
                pendingTimeouts.add(timeoutId)
              }
            })
            
            // Clean up any dead processes first
            try {
              // @ts-ignore
              if (window.electron?.cleanupDeadProcesses) {
                // @ts-ignore
                const cleanupResult = await window.electron.cleanupDeadProcesses()
                if (cleanupResult.success && (cleanupResult.cleanedProcesses > 0 || cleanupResult.updatedStatuses > 0)) {
                  console.log(`[Cleanup] Cleaned up ${cleanupResult.cleanedProcesses} dead processes, updated ${cleanupResult.updatedStatuses} statuses`)
                  // Reload databases after cleanup
                  // @ts-ignore
                  const cleanedList = await window.electron.getDatabases()
                  const cleanedDatabases = Array.isArray(cleanedList) ? cleanedList : []
                  setDatabases(cleanedDatabases)
                }
              }
            } catch (cleanupError) {
              console.error("[Cleanup] Error during cleanup:", cleanupError)
            }
            
            // Port conflicts are now checked dynamically, no need to cache
          }
          console.log(`[Storage] Successfully loaded ${updatedDatabases.length} databases`)
          
          // Force immediate status check for all databases
          const checkDatabasesFileExists = async () => {
            try {
              // @ts-ignore
              const fileCheck = await window.electron?.checkDatabasesFile?.()
              if (!fileCheck?.exists) {
                console.log("[Storage] databases.json file deleted, clearing dashboard")
                if (isMounted) setDatabases([])
              }
            } catch (error) {
              console.error("[Storage] Error checking databases file:", error)
            }
          }
          
          let fileCheckCounter = 0
          const startStatusMonitoring = () => {
            return setInterval(async () => {
              if (!isMounted) return
              
              try {
                // Check if databases file still exists every 10 checks (every 2.5 minutes)
                fileCheckCounter++
                if (fileCheckCounter >= 10) {
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
                        
                        // Update the database status immediately, preserving PID if provided
                        setDatabases(prev => prev.map(d => 
                          d.id === db.id ? { ...d, status: status.status, pid: status.pid || d.pid } : d
                        ))
                        
                        // Fetch system info for running databases
                        if (status.status === "running") {
                          const now = Date.now()
                          const lastCheck = lastSystemInfoCheck[db.id] || 0
                          // Only fetch system info every 30 seconds to avoid excessive calls
                          if (now - lastCheck > 30000) {
                            setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: now }))
                            fetchSystemInfo(db.id)
                          }
                        }
                        
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
          
          // Set up system info monitoring for running databases (optimized)
          const startSystemInfoMonitoring = () => {
            return setInterval(async () => {
              if (!isMounted) return
              
              try {
                // Get current databases state from ref
                const currentDatabases = databasesRef.current.filter(db => db.status === "running")
                
                // Only monitor if there are running databases and reduce frequency
                if (currentDatabases.length === 0) return
                
                log.debug(`Found ${currentDatabases.length} running databases`)
                
                // Fetch system info for each running database with staggered timing
                for (let i = 0; i < currentDatabases.length; i++) {
                  const db = currentDatabases[i]
                  const now = Date.now()
                  const lastCheck = lastSystemInfoCheck[db.id] || 0
                  
                  // Update system info every 15 seconds for live updates (further reduced frequency)
                  if (now - lastCheck > 15000) {
                    log.debug(`Updating system info for database ${db.id}`)
                    setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: now }))
                    
                    // Process sequentially with delay to prevent timeout accumulation
                    await new Promise(resolve => {
                      const timeoutId = setTimeout(() => {
                        pendingTimeouts.delete(timeoutId)
                        if (isMounted) {
                          fetchSystemInfo(db.id)
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
            }, 10000) // Update every 10 seconds instead of 5 seconds
          }
          
          systemInfoInterval = startSystemInfoMonitoring()
          
          // Set up real-time status change listener from electron main process
          // @ts-ignore
          if (window.electron?.onDatabaseStatusChanged) {
            log.debug(`Setting up database status listener`)
            // @ts-ignore
            window.electron.onDatabaseStatusChanged((data: { id: string, status: string, error?: string, exitCode?: number, ready?: boolean, pid?: number }) => {
              if (!isMounted) return
              
              log.debug(`Database ${data.id} status changed to ${data.status}${data.ready ? ' (ready)' : ''} (PID: ${data.pid})`)
              
              // Create a simple event key to prevent duplicate processing
              // For stopped events, use a simpler key to prevent duplicates from error/exit events
              const eventKey = data.status === 'stopped' 
                ? `${data.id}-stopped` 
                : `${data.id}-${data.status}-${data.ready ? 'ready' : 'not-ready'}`
              
              // Check if we've already processed this exact event in the last 500ms (reduced further)
              const now = Date.now()
              const lastProcessed = lastStatusCheckRef.current[eventKey] || 0
              
              if (now - lastProcessed < 500) {
                log.debug(`Duplicate event ignored: ${eventKey} (last processed: ${new Date(lastProcessed).toISOString()})`)
                return
              }
              
              log.debug(`Processing event: ${eventKey} (time since last: ${now - lastProcessed}ms)`)
              
              // Update the last processed time (both ref and state)
              lastStatusCheckRef.current[eventKey] = now
              if (isMounted) {
                setLastStatusCheck(prev => ({
                  ...prev,
                  [eventKey]: now
                }))
              }
              
              log.debug(`Processing event: ${eventKey}`)
              
              // Update database status immediately
              if (isMounted) {
                setDatabases(prev => {
                  const updated = prev.map(db => 
                    db.id === data.id ? { 
                      ...db, 
                      status: data.status as any, 
                      pid: data.pid,
                      // Set lastStarted timestamp when database starts running
                      lastStarted: data.status === "running" ? Date.now() : db.lastStarted,
                      // Initialize systemInfo when database starts running
                      systemInfo: data.status === "running" ? {
                        cpu: 0,
                        memory: 0,
                        connections: 0,
                        uptime: 0
                      } : db.systemInfo
                    } : db
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
                            onClick: () => startDatabaseWithErrorHandling(data.id)
                          }
                        })
                      } else {
                        notifyError("Database stopped", {
                          description: `${db.name} has stopped unexpectedly.`,
                          id: `db-stopped-${db.id}-${now}`, // Unique ID to prevent duplicates
                          action: {
                            label: "Restart",
                            onClick: () => startDatabaseWithErrorHandling(data.id)
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
                          fetchSystemInfo(data.id)
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
          // @ts-ignore
          if (window.electron?.removeAllListeners) {
            // @ts-ignore
            window.electron.removeAllListeners('auto-start-port-conflicts')
            // @ts-ignore
            window.electron.removeAllListeners('auto-start-completed')
          }
          
          // @ts-ignore
          if (window.electron?.onAutoStartPortConflicts) {
            // @ts-ignore
            window.electron.onAutoStartPortConflicts((event, data) => {
              if (!isMounted) return
              
              console.log(`[Auto-start] Port conflicts detected:`, data.conflicts)
              
              // Show individual conflict notifications
              data.conflicts.forEach((conflict: any) => {
                notifyWarning("Auto-start Port Conflict Resolved", {
                  description: `${conflict.databaseName} port changed from ${conflict.originalPort} to ${conflict.newPort} due to conflict with ${conflict.conflictingDatabase}`,
                  duration: 8000,
                })
              })
            })
          }
          
          // @ts-ignore
          if (window.electron?.onAutoStartCompleted) {
            // @ts-ignore
            window.electron.onAutoStartCompleted((event, data) => {
              if (!isMounted) return
              
              console.log(`[Auto-start] Completed:`, data)
              
              // Show summary notification
              if (data.conflicts && data.conflicts.length > 0) {
                notifyInfo("Auto-start Completed with Port Conflicts", {
                  description: `${data.started} databases started, ${data.conflicts.length} port conflicts resolved`,
                  duration: 6000,
                })
              } else {
                notifySuccess("Auto-start Completed", {
                  description: `${data.started} databases started successfully`,
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
        
        // @ts-ignore
        if (window.electron?.removeAllListeners) {
          // @ts-ignore
          window.electron.removeAllListeners('database-status-changed')
          // @ts-ignore
          window.electron.removeAllListeners('auto-start-port-conflicts')
          // @ts-ignore
          window.electron.removeAllListeners('auto-start-completed')
        }
      }
    }, [])

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
    // Filter to only include databases that are actually stopped
    const stoppedDatabases = databases.filter(db => 
      databaseIds.includes(db.id) && db.status === "stopped"
    )
    
    if (stoppedDatabases.length === 0) {
      notifyInfo("No Stopped Databases", {
        description: "All selected databases are already running or starting.",
        duration: 3000,
      })
      return
    }
    
    console.log(`[Bulk Start] Starting ${stoppedDatabases.length} stopped databases (${databaseIds.length - stoppedDatabases.length} already running)`)
    
    // Show initial toast
    notifyInfo("Starting Multiple Databases", {
      description: `Starting ${stoppedDatabases.length} stopped databases...`,
      duration: 3000,
    })

    // Check for banned ports first (only on stopped databases)
    const bannedPortDatabases = stoppedDatabases.filter(db => isPortBanned(db.port))
    
    if (bannedPortDatabases.length > 0) {
      const bannedNames = bannedPortDatabases.map(db => db.name).join(", ")
      notifyError("Cannot start databases", {
        description: `The following databases use banned ports: ${bannedNames}. Please change their ports in settings.`,
      })
      return
    }

    // Check for port conflicts before starting any databases (only on stopped databases)
    const conflictChecks = await Promise.all(
      stoppedDatabases.map(async (targetDb) => {
        // Check for external port conflicts
        if (targetDb.port) {
          const conflictResult = await checkPortConflict(targetDb.port)
          if (conflictResult.inUse) {
            return { 
              id: targetDb.id, 
              hasConflict: true, 
              conflictType: 'external',
              message: `Port ${targetDb.port} is in use by external process: ${conflictResult.processName} (PID: ${conflictResult.pid})`
            }
          }
        }

        // Check for internal port conflicts (other databases in the selection)
        const conflictingDb = stoppedDatabases.find(otherDb => 
          otherDb.id !== targetDb.id && 
          otherDb.port === targetDb.port
        )

        if (conflictingDb) {
          return { 
            id: targetDb.id, 
            hasConflict: true, 
            conflictType: 'internal',
            message: `Port ${targetDb.port} is in use by "${conflictingDb.name}" in this selection`
          }
        }

        return { id: targetDb.id, hasConflict: false }
      })
    )

    // Filter out databases with conflicts
    const conflictedDatabases = conflictChecks.filter(check => check.hasConflict)
    const validDatabaseIds = conflictChecks.filter(check => !check.hasConflict).map(check => check.id)

    if (conflictedDatabases.length > 0) {
      const conflictMessages = conflictedDatabases.map(check => 
        `${databases.find(db => db.id === check.id)?.name}: ${check.message}`
      ).join('\n')
      
      notifyError("Cannot start some databases", {
        description: `The following databases have port conflicts:\n${conflictMessages}`,
        duration: 8000,
      })
      
      // If no valid databases to start, return early
      if (validDatabaseIds.length === 0) {
        return
      }
    }

    // First, set all valid databases to "starting" status immediately to prevent race conditions
    setDatabases(prev => prev.map(db => 
      validDatabaseIds.includes(db.id) ? { 
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
    ))

    // Start all valid databases using the existing startDatabaseWithErrorHandling function
    // This function handles the async nature properly and uses real-time listeners
    const startPromises = validDatabaseIds.map(async (id, index) => {
      try {
        // Add a small delay between starts to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * index))
        }

        const targetDb = databases.find((db) => db.id === id)
        if (!targetDb) return { id, success: false, error: "Database not found" }

        // Use the existing startDatabaseWithErrorHandling function
        // This function handles the async startup properly
        // Note: Port conflicts are already checked upfront, so this should succeed
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
      notifySuccess("Bulk Start Initiated", {
        description: `Starting ${successful} databases. Status updates will appear as they complete.`,
        duration: 4000,
      })
    } else if (successful === 0) {
      notifyError("Failed to Start Databases", {
        description: `Failed to initiate start for all ${failed} databases`,
        duration: 5000,
      })
    } else {
      notifyWarning("Partial Success", {
        description: `Initiated start for ${successful} databases, failed to start ${failed}`,
        duration: 5000,
      })
    }

    console.log(`[Bulk Start] Completed: ${successful} successful, ${failed} failed`)
  }

  const handleBulkStop = async (databaseIds: string[]) => {
    // Filter to only include databases that are actually running
    const runningDatabases = databases.filter(db => 
      databaseIds.includes(db.id) && (db.status === "running" || db.status === "starting")
    )
    
    if (runningDatabases.length === 0) {
      notifyInfo("No Running Databases", {
        description: "All selected databases are already stopped.",
        duration: 3000,
      })
      return
    }
    
    console.log(`[Bulk Stop] Stopping ${runningDatabases.length} running databases (${databaseIds.length - runningDatabases.length} already stopped)`)
    
    // Show initial toast
    notifyInfo("Stopping Multiple Databases", {
      description: `Stopping ${runningDatabases.length} running databases...`,
      duration: 3000,
    })

    // First, set only running databases to "stopping" status immediately
    setDatabases(prev => prev.map(db => 
      runningDatabases.some(rdb => rdb.id === db.id) ? { ...db, status: "stopping" as const } : db
    ))

    // Stop only running databases in parallel
    const stopPromises = runningDatabases.map(async (db, index) => {
      try {
        // Add a small delay between stops to prevent overwhelming the system
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 500 * index))
        }

        // @ts-ignore
        const result = await window.electron?.stopDatabase?.(db.id)
        return { id: db.id, success: result?.success || false, error: result?.error }
      } catch (error) {
        console.error(`[Bulk Stop] Error stopping database ${db.id}:`, error)
        return { id: db.id, success: false, error: error instanceof Error ? error.message : String(error) }
      }
    })

    // Wait for all operations to complete
    const results = await Promise.all(stopPromises)
    
    // Count successes and failures
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Show result toast
    if (failed === 0) {
      notifySuccess("All Databases Stopped", {
        description: `Successfully stopped ${successful} databases`,
        duration: 4000,
      })
    } else if (successful === 0) {
      notifyError("Failed to Stop Databases", {
        description: `Failed to stop all ${failed} databases`,
        duration: 5000,
      })
    } else {
      notifyWarning("Partial Success", {
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

  const getVisibleDatabases = () => {
    switch (activeTab) {
      case "active":
        return databases.filter(db => db.status === "running" || db.status === "starting")
      case "inactive":
        return databases.filter(db => db.status === "stopped")
      case "all":
        return databases
      default:
        return []
    }
  }

  const selectAllDatabases = () => {
    const visibleDatabases = getVisibleDatabases()
    setSelectedDatabases(new Set(visibleDatabases.map(db => db.id)))
  }

  const clearSelection = () => {
    setSelectedDatabases(new Set())
  }

  const toggleSelectAll = () => {
    const visibleDatabases = getVisibleDatabases()
    const visibleIds = new Set(visibleDatabases.map(db => db.id))
    const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
    
    if (selectedVisibleCount === visibleDatabases.length && visibleDatabases.length > 0) {
      // All visible are selected, deselect all
      clearSelection()
    } else {
      // Not all visible are selected, select all visible
      selectAllDatabases()
    }
  }

  const getSelectAllButtonText = () => {
    const visibleDatabases = getVisibleDatabases()
    const visibleIds = new Set(visibleDatabases.map(db => db.id))
    const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
    
    if (visibleDatabases.length === 0) {
      return "Select All" // Button should be disabled anyway, but fallback text
    }
    
    return selectedVisibleCount === visibleDatabases.length ? "Deselect All" : "Select All"
  }

  // Helper function to get selected databases with their statuses
  const getSelectedDatabases = () => {
    return databases.filter(db => selectedDatabases.has(db.id))
  }

  // Helper function to determine which bulk action buttons to show
  const getBulkActionButtons = () => {
    const selectedDbs = getSelectedDatabases()
    if (selectedDbs.length === 0) return { showStart: false, showStop: false }

    const runningCount = selectedDbs.filter(db => db.status === "running" || db.status === "starting").length
    const stoppedCount = selectedDbs.filter(db => db.status === "stopped").length

    // If all selected databases are running/starting, only show Stop All
    if (runningCount === selectedDbs.length) {
      return { showStart: false, showStop: true }
    }
    
    // If all selected databases are stopped, only show Start All
    if (stoppedCount === selectedDbs.length) {
      return { showStart: true, showStop: false }
    }
    
    // If there's a mix, show both buttons (but only affect relevant databases)
    return { showStart: stoppedCount > 0, showStop: runningCount > 0 }
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
    const conflicts = Array.from(portGroups.entries()).filter(([port, dbs]) => dbs.length > 1)
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
      const isConflicting = portConflicts.some(([port, dbs]) => 
        dbs.some(conflictDb => conflictDb.id === id && conflictDb.id !== dbId)
      )
      
      return !isConflicting
    })
    
    // Add the selected database if it's not running
    if (selectedDb.status === "stopped") {
      databasesToStart.push(dbId)
    }
    
    // Start the databases
    if (databasesToStart.length > 0) {
      handleBulkStart(databasesToStart)
    } else {
      // All databases are already running or no valid databases to start
      notifyInfo("No Databases to Start", {
        description: "All selected databases are already running or have been resolved.",
        duration: 3000,
      })
    }
    
    clearSelection()
    setShowBulkActions(false)
    setPortConflictDialogOpen(false)
    setPortConflicts([])
  }

  const handleBulkStartSelected = () => {
    const selectedIds = Array.from(selectedDatabases)
    if (selectedIds.length === 0) return
    
    // Check for port conflicts
    const conflicts = checkPortConflictsInSelection(selectedIds)
    
    if (conflicts.length > 0) {
      // Show port conflict dialog
      showPortConflictDialog(conflicts)
      return
    }
    
    // No conflicts, proceed with normal bulk start
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
    const pendingTimeouts = new Set<NodeJS.Timeout>()

    const load = async () => {
      // Check if Electron is available
      // @ts-ignore
      if (!window.electron) {
        console.log("[Debug] Electron not available yet, retrying in 1 second")
        const timeoutId = setTimeout(load, 1000)
        pendingTimeouts.add(timeoutId)
        return
      }
      
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
        const timeoutId = setTimeout(async () => {
          pendingTimeouts.delete(timeoutId)
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
        pendingTimeouts.add(timeoutId)
        
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
                      
                      // Update the database status immediately, preserving PID if provided
                      setDatabases(prev => prev.map(d => 
                        d.id === db.id ? { ...d, status: status.status, pid: status.pid || d.pid } : d
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
            
            console.log(`[Real-time Status] Database ${data.id} status changed to ${data.status}${data.ready ? ' (ready)' : ''} (PID: ${data.pid})`)
            
            // Create a simple event key to prevent duplicate processing
            // For stopped events, use a simpler key to prevent duplicates from error/exit events
            const eventKey = data.status === 'stopped' 
              ? `${data.id}-stopped` 
              : `${data.id}-${data.status}-${data.ready ? 'ready' : 'not-ready'}`
            
            // Check if we've already processed this exact event in the last 500ms (reduced further)
            const now = Date.now()
            const lastProcessed = lastStatusCheckRef.current[eventKey] || 0
            
            if (now - lastProcessed < 500) {
              console.log(`[Real-time Status] Duplicate event ignored: ${eventKey} (last processed: ${new Date(lastProcessed).toISOString()})`)
              return
            }
            
            console.log(`[Real-time Status] Processing event: ${eventKey} (time since last: ${now - lastProcessed}ms)`)
            
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
                        notifyError("Database failed to start", {
                          description: `${db.name} failed to start: ${data.error}`,
                          id: `db-failed-start-${db.id}-${now}`, // Unique ID to prevent duplicates
                          action: {
                            label: "Retry",
                            onClick: () => startDatabaseWithErrorHandling(data.id)
                          }
                        })
                      } else {
                        notifyError("Database failed to start", {
                          description: `${db.name} could not start properly. Please check the logs.`,
                          id: `db-failed-start-${db.id}-${now}`, // Unique ID to prevent duplicates
                          action: {
                            label: "Retry",
                            onClick: () => startDatabaseWithErrorHandling(data.id)
                          }
                        })
                      }
                    } else if (db.status === "running") {
                      // Database was running but crashed
                      if (data.error) {
                        notifyError("Database crashed", {
                          description: `${db.name} stopped due to an error: ${data.error}`,
                          id: `db-crashed-${db.id}-${now}`, // Unique ID to prevent duplicates
                        })
                      } else {
                        notifyInfo("Database stopped", {
                          description: `${db.name} has stopped running.`,
                          id: `db-stopped-${db.id}-${now}`, // Unique ID to prevent duplicates
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
                      notifySuccess("Database ready", {
                        description: `${db.name} is now running and ready to accept connections.`,
                        id: `db-ready-${db.id}-${now}`, // Unique ID to prevent duplicates
                      })
                    } else {
                      notifySuccess("Database started", {
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
    
    // Set up auto-start port conflict listener (remove existing listeners first to prevent leaks)
    // @ts-ignore
    if (window.electron?.removeAllListeners) {
      // @ts-ignore
      window.electron.removeAllListeners('auto-start-port-conflicts')
      // @ts-ignore
      window.electron.removeAllListeners('auto-start-completed')
    }
    
    // @ts-ignore
    if (window.electron?.onAutoStartPortConflicts) {
      console.log(`[Listener Setup] Setting up auto-start port conflicts listener`)
      // @ts-ignore
      window.electron.onAutoStartPortConflicts((event, data) => {
        if (!isMounted) return
        
        console.log(`[Auto-start] Port conflicts detected:`, data.conflicts)
        
        // Show notification for each port conflict
        data.conflicts.forEach((conflict: any) => {
          notifyWarning("Auto-start Port Conflict Resolved", {
            description: `${conflict.databaseName} port changed from ${conflict.originalPort} to ${conflict.newPort} due to conflict with ${conflict.conflictingDatabase}`,
            duration: 8000,
          })
        })
      })
    }
    
    // Set up auto-start completion listener
    // @ts-ignore
    if (window.electron?.onAutoStartCompleted) {
      console.log(`[Listener Setup] Setting up auto-start completion listener`)
      // @ts-ignore
      window.electron.onAutoStartCompleted((event, data) => {
        if (!isMounted) return
        
        console.log(`[Auto-start] Auto-start completed:`, data)
        
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
            description: `Successfully started ${data.successful} databases`,
            duration: 4000,
          })
        }
      })
    }
    
    load()

    // Clean up interval and listeners on unmount
    return () => {
      isMounted = false
      if (statusInterval) {
        clearInterval(statusInterval)
        statusInterval = null
      }
      
      // Clear all pending timeouts to prevent memory leaks
      pendingTimeouts.forEach(timeoutId => {
        clearTimeout(timeoutId)
      })
      pendingTimeouts.clear()
      
      // @ts-ignore
      if (window.electron?.removeDatabaseStatusListener) {
        // @ts-ignore
        window.electron.removeDatabaseStatusListener()
      }
    }
  }, []) // Empty dependency array is correct here


  // Clear selections when switching tabs to avoid confusion
  useEffect(() => {
    if (showBulkActions) {
      const visibleDatabases = getVisibleDatabases()
      const visibleIds = new Set(visibleDatabases.map(db => db.id))
      const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
      
      // If we have selections but they're not visible in the current tab, clear them
      if (selectedDatabases.size > 0 && selectedVisibleCount === 0) {
        setSelectedDatabases(new Set())
      }
    }
  }, [activeTab, showBulkActions, selectedDatabases])

  const handleAddDatabase = async (database: DatabaseContainer) => {
    // Check for duplicate name
    if (isNameDuplicate(database.name)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${database.name}" already exists. Please choose a different name.`,
      })
      return
    }

    // Check for duplicate container ID
    if (isContainerIdDuplicate(database.containerId)) {
      notifyError("Container ID already exists", {
        description: `A database with container ID "${database.containerId}" already exists. Please try again.`,
      })
      return
    }

    // Save to backend with validation
    try {
      // @ts-ignore
      const result = await window.electron?.saveDatabase?.(database)
      if (result && result.success === false) {
        notifyError("Failed to save database", {
          description: result.error || "An error occurred while saving the database.",
        })
        return
      }
    } catch (error) {
      console.error("[Database Save] Error saving database:", error)
      notifyError("Failed to save database", {
        description: "An error occurred while saving the database.",
      })
      return
    }

    setDatabases([...databases, database])
    setAddDialogOpen(false)
    setActiveTab("all") // Switch to All Databases tab to show the new database
    notifySuccess("Database added", {
      description: `${database.name} has been added successfully.`,
    })
  }

  const startDatabaseWithErrorHandling = async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    // Check for port conflicts before starting
    if (targetDb.port) {
      const conflictResult = await checkPortConflict(targetDb.port)
      
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

    // Check if database is already starting
    if (targetDb.status === "starting") {
      notifyWarning("Database already starting", {
        description: `${targetDb.name} is already in the process of starting.`,
      })
      return
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
              // @ts-ignore
              await window.electron?.saveDatabase?.(updatedDb)
              setDatabases(prev => prev.map(db => db.id === id ? updatedDb : db))
              notifySuccess("Port Updated", {
                description: `Database port changed to ${suggestedPort}`,
              })
              // Start the database with the new port
              await startDatabaseWithErrorHandling(id)
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

    notifyInfo("Starting database", {
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
                notifyError("Database start timeout", {
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
        
        notifyError("Failed to start database", {
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
      
      notifyError("Failed to start database", {
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
        
        notifyWarning("Port Conflict Detected", {
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
                notifySuccess("Port Updated", {
                  description: `Database port changed to ${suggestedPort}`,
                })
                // Start the database with the new port
                await startDatabaseWithErrorHandling(id)
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
      } catch (error) {
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

  const handleRestart = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db || db.status !== "running") return

    notifyInfo("Restarting database", {
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
    notifyError("Database removed", {
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

    // Check for duplicate name (excluding current database)
    if (isNameDuplicate(updatedDatabase.name, updatedDatabase.id)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${updatedDatabase.name}" already exists. Please choose a different name.`,
      })
      return
    }

    // Check for duplicate container ID (excluding current database)
    if (isContainerIdDuplicate(updatedDatabase.containerId, updatedDatabase.id)) {
      notifyError("Container ID already exists", {
        description: `A database with container ID "${updatedDatabase.containerId}" already exists. Please try again.`,
      })
      return
    }

    // Check if port has changed and database is running
    const portChanged = originalDatabase.port !== updatedDatabase.port
    const wasRunning = originalDatabase.status === "running" || originalDatabase.status === "starting"
    
    // Update the database in state
    setDatabases(databases.map((db) => (db.id === updatedDatabase.id ? updatedDatabase : db)))
    
    // Port conflicts are now checked dynamically, no need to cache
    
    // Save the updated database to Electron storage with validation
    try {
      // @ts-ignore
      const result = await window.electron?.saveDatabase?.(updatedDatabase)
      if (result && result.success === false) {
        notifyError("Failed to update database", {
          description: result.error || "An error occurred while saving the database changes.",
        })
        return
      }
    } catch (error) {
      console.log(`[Port Change] Error saving database ${updatedDatabase.id}:`, error)
      notifyError("Failed to update database", {
        description: "An error occurred while saving the database changes.",
      })
      return
    }
    
    // If port changed and database was running, restart it
    if (portChanged && wasRunning) {
      setSettingsDialogOpen(false)
      
      notifyInfo("Port changed - restarting database", {
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
          notifyError("Failed to restart database", {
            description: "Could not stop the database for port change",
          })
        }
      } catch (error) {
        console.log(`[Port Change] Error restarting database ${updatedDatabase.id}:`, error)
        notifyError("Failed to restart database", {
          description: "Could not restart the database with new port",
        })
      }
    } else {
      setSettingsDialogOpen(false)
      notifySuccess("Settings updated", {
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
    notifySuccess("Copied to clipboard", {
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
      notifyInfo("Restarting database", {
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

  return (
    <React.Fragment>
      {isLoading && (
        <LoadingScreen onComplete={() => setIsLoading(false)} />
      )}
      <div className="min-h-screen bg-background">
        <MaybeStartSidebarTour />
        {showOnboarding && (
          <OnboardingOverlay
            onFinished={() => setShowOnboarding(false)}
            onStartTour={() => {
              setTourRequested(true)
            }}
          />
        )}
        <HelperHealthMonitor className="mx-6 mt-4" data-testid="helper-status" />
      <div 
        className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50 cursor-move transition-opacity duration-1000 ease-out" 
        style={{ 
          WebkitAppRegion: 'drag',
          opacity: dashboardOpacity 
        } as React.CSSProperties}>
        <div className="container mx-auto px-6 py-2 flex items-center justify-between transition-all duration-300 tour-mode:ml-80">
          <div className="flex items-center gap-2">
            {selectedDatabases.size > 0 && (() => {
              const { showStart, showStop } = getBulkActionButtons()
              return (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedDatabases.size} selected
                  </span>
                  {showStart && (
                    <Button
                      onClick={handleBulkStartSelected}
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs cursor-pointer border-success/50 text-success hover:bg-success hover:text-success-foreground"
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                      onMouseEnter={playIconHover.onMouseEnter}
                      onMouseLeave={playIconHover.onMouseLeave}
                    >
                      <PlayIcon ref={playIconHover.iconRef} size={12} />
                      Start All
                    </Button>
                  )}
                  {showStop && (
                    <Button
                      onClick={handleBulkStopSelected}
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs cursor-pointer border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    >
                      <Square className="mr-1 h-3 w-3" />
                      Stop All
                    </Button>
                  )}
                </div>
              )
            })()}
          </div>
          
          <div className="flex items-center gap-2 align-middle">
            {databases.length > 0 && (
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
                className={`cursor-pointer ${
                  showBulkActions ? "bg-primary text-primary-foreground" : ""
                }`}
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                title={showBulkActions ? "Exit selection mode" : "Select multiple databases"}
                onMouseEnter={gripIconHover.onMouseEnter}
                onMouseLeave={gripIconHover.onMouseLeave}
              >
                <GripIcon ref={gripIconHover.iconRef} size={16} className={`transition-transform duration-200 ${showBulkActions ? 'rotate-12' : ''}`} />
              </Button>
            )}
            <Button
              onClick={() => {
                // Check if we're in tour mode, but allow when tour explicitly enables UI
                const inTour = document.body.hasAttribute('data-tour-mode')
                const tourAllowsUI = document.body.hasAttribute('data-tour-allow-ui')
                if (inTour && !tourAllowsUI) {
                  notifyInfo("Tour Mode", {
                    description: "Database creation is disabled during the tour. Complete the tour to create databases."
                  })
                  return
                }
                setAddDialogOpen(true)
              }}
              size="sm"
              id="btn-add-database"
              data-testid="add-database-button"
              data-tour="add-database-button"
              className="cursor-pointer"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onMouseEnter={plusIconHover.onMouseEnter}
              onMouseLeave={plusIconHover.onMouseLeave}
            >
              <PlusIcon ref={plusIconHover.iconRef} size={16} />
              Add Database
            </Button>
            {/* User/profile menu replacing gear */}
            <div className="relative flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} data-testid="profile-menu" data-tour="settings-button">
              <ProfileMenuTrigger />
            </div>
          </div>
        </div>
      </div>

      {/* Select Mode Indicator */}
      {showBulkActions && (
        <div className="bg-primary/5 border-b border-primary/10 py-1">
          <div className="container mx-auto px-6 flex items-center justify-center gap-1.5 transition-all duration-300 tour-mode:ml-80">
            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full"></div>
            <span className="text-xs text-primary/80">
              Selection mode - Click cards to select
            </span>
            <div className="w-1.5 h-1.5 bg-primary/70 rounded-full"></div>
          </div>
        </div>
      )}

      <div 
        className="container mx-auto py-3 px-4 transition-all duration-300 tour-mode:ml-80"    
        style={{ opacity: dashboardOpacity }}>
        {databases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BoxesIcon size={48} className="text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">No databases yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md text-pretty">
                Get started by adding your first database container.
              </p>
              <Button 
                onClick={() => {
                  // Check if we're in tour mode, but allow when tour explicitly enables UI
                  const inTour = document.body.hasAttribute('data-tour-mode')
                  const tourAllowsUI = document.body.hasAttribute('data-tour-allow-ui')
                  if (inTour && !tourAllowsUI) {
                    notifyInfo("Tour Mode", {
                      description: "Database creation is disabled during the tour. Complete the tour to create databases."
                    })
                    return
                  }
                  setAddDialogOpen(true)
                }} 
                size="sm"
                data-testid="add-first-database-button"
                onMouseEnter={plusIconHover.onMouseEnter}
                onMouseLeave={plusIconHover.onMouseLeave}
              >
                <PlusIcon ref={plusIconHover.iconRef} size={16} />
                Add Your First Database
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all" className="flex items-center gap-2">
                <BoxesIcon size={16} />
                All
              </TabsTrigger>
              <TabsTrigger value="active" className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  databases.filter(db => db.status === "running" || db.status === "starting").length > 0
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
                }`}></div>
                Active
              </TabsTrigger>
              <TabsTrigger value="inactive" className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                Inactive
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key="all"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  {/* All Databases Header */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">All Databases</h2>
                        <p className="text-sm text-muted-foreground">
                          Complete overview of all your databases
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {showBulkActions && getVisibleDatabases().length > 0 && (
                          <Button
                            onClick={toggleSelectAll}
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs"
                          >
                            {getSelectAllButtonText()}
                          </Button>
                        )}
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <BoxesIcon size={16} />
                          <span className="text-foreground font-semibold">{databases.length}</span>
                          <span>Total</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active Databases Section */}
                  {databases.filter(db => db.status === "running" || db.status === "starting" || db.status === "stopping").length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mb-3 mt-6">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-muted-foreground">
                        <span className="text-foreground font-semibold">{databases.filter(db => db.status === "running" || db.status === "starting" || db.status === "stopping").length}</span> Active 
                        </span>
                      </div>
                      <AnimatePresence mode="popLayout">
                        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-8" data-testid="database-grid" data-tour="database-cards">
                          {databases
                            .filter(db => db.status === "running" || db.status === "starting" || db.status === "stopping")
                            .map((db) => (
                  <motion.div
                    key={db.id}
                    layoutId={activeTab === "all" ? `database-${db.id}` : undefined}
                    layout={activeTab === "all" ? true : false}
                    initial={false}
                    animate={activeTab === "all" ? { opacity: 1 } : undefined}
                    exit={activeTab === "all" ? { opacity: 0 } : undefined}
                    transition={{
                      type: "spring",
                      stiffness: 400,
                      damping: 35,
                      layout: {
                        type: "spring",
                        stiffness: 400,
                        damping: 35
                      }
                    }}
                  >
                  <Card 
                    className={`relative overflow-hidden border-dashed transition-opacity ${
                      showBulkActions 
                        ? (selectedDatabases.has(db.id) ? 'opacity-100' : 'opacity-60')
                        : (db.status === "stopped" ? "opacity-60" : "opacity-100")
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
                          <div className="flex items-center justify-center w-7 h-7 shrink-0">
                            {renderDatabaseIcon(db.icon, "w-7 h-7 object-cover rounded")}
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
                              ? "bg-status-starting text-status-starting-foreground hover:opacity-90"
                              : db.status === "stopping"
                              ? "bg-status-stopping text-status-stopping-foreground hover:opacity-90"
                              : db.status === "installing"
                              ? "bg-status-installing text-status-installing-foreground hover:opacity-90"
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
                            <span className="font-mono font-medium text-success">{db.port}</span>
                            {isPortBanned(db.port) && (
                              <span className="text-destructive text-[10px]" title="This port is banned and cannot be used">
                                🚫
                              </span>
                            )}
                            <PortConflictWarning port={db.port} databaseId={db.id} databaseStatus={db.status} />
                          </div>
                        </div>
                        {(db.status === "running" || db.status === "starting") && db.pid && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">PID</span>
                            <span className="font-mono font-medium text-success">{db.pid}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[11px] gap-2">
                          <span className="text-muted-foreground">Container</span>
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyContainerId(db.containerId, db.id)
                              }}
                              onMouseEnter={createHoverHandlers(db.id, 'copy').onMouseEnter}
                              onMouseLeave={createHoverHandlers(db.id, 'copy').onMouseLeave}
                            >
                              {copiedId === db.id ? (
                                <CheckIcon ref={createHoverHandlers(db.id, 'check').iconRef} size={12} />
                              ) : (
                                <CopyIcon ref={createHoverHandlers(db.id, 'copy').iconRef} size={12} />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* System Metrics - Only show for running instances */}
                      {(() => {
                        if (db.status === "running") {
                          log.debug(`Database ${db.id} status: ${db.status}, systemInfo:`, db.systemInfo)
                          if (db.systemInfo) {
                            return (
                              <div className="space-y-1 mb-2 pt-2 border-t border-border/50">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-muted-foreground">Uptime</span>
                                  <span className="font-mono font-medium text-success">{formatUptime(db.systemInfo.uptime)}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">CPU</div>
                                    <div className="text-[11px] font-medium">{db.systemInfo.cpu.toFixed(1)}%</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Memory</div>
                                    <div className="text-[11px] font-medium">{formatBytes(db.systemInfo.memory)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-muted-foreground">Connections</div>
                                    <div className="text-[11px] font-medium">{db.systemInfo.connections}</div>
                                  </div>
                                </div>
                              </div>
                            )
                          } else {
                            log.debug(`Database ${db.id} is running but has no systemInfo - triggering fetch`)
                            // Trigger system info fetch if not available
                            setTimeout(() => {
                              const now = Date.now()
                              const lastCheck = lastSystemInfoCheck[db.id] || 0
                              if (now - lastCheck > 5000) { // Allow more frequent checks for missing data
                                setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: now }))
                                fetchSystemInfo(db.id)
                              }
                            }, 1000)
                            
                            // Show placeholder while loading
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
                        }
                        return null
                      })()}

                      {!showBulkActions && (
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`flex-1 h-6 text-[11px] ${
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
                            onMouseEnter={createHoverHandlers(db.id, 'play').onMouseEnter}
                            onMouseLeave={createHoverHandlers(db.id, 'play').onMouseLeave}
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
                                <PlayIcon ref={createHoverHandlers(db.id, 'play').iconRef} size={12} />
                                Start
                              </>
                            )}
                          </Button>
                          {db.status !== "stopped" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 bg-transparent disabled:opacity-50"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleRefreshStatus(db.id)
                                  }}
                                  onMouseEnter={createHoverHandlers(db.id, 'restart').onMouseEnter}
                                  onMouseLeave={createHoverHandlers(db.id, 'restart').onMouseLeave}
                                >
                                  <RefreshCCWIcon ref={createHoverHandlers(db.id, 'restart').iconRef} size={12} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Restart database</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {db.status === "running" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 bg-transparent"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDebugDatabase(db.id)
                                  }}
                                  onMouseEnter={createHoverHandlers(db.id, 'debug').onMouseEnter}
                                  onMouseLeave={createHoverHandlers(db.id, 'debug').onMouseLeave}
                                >
                                  <ActivityIcon ref={createHoverHandlers(db.id, 'debug').iconRef} size={12} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Instance information</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 px-2 bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleSettings(db)
                            }}
                            onMouseEnter={createHoverHandlers(db.id, 'settings').onMouseEnter}
                            onMouseLeave={createHoverHandlers(db.id, 'settings').onMouseLeave}
                          >
                            <SettingsIcon ref={createHoverHandlers(db.id, 'settings').iconRef} size={12} />
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  </motion.div>
                          ))}
                        </div>
                      </AnimatePresence>
                    </>
                  )}

                  {/* Inactive Databases Section */}
                  {databases.filter(db => db.status === "stopped").length > 0 && (
                    <>
                      <div className="flex items-center gap-2 mb-3 mt-8">
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                        <span className="text-sm font-medium text-muted-foreground">
                        <span className="text-foreground font-semibold">{databases.filter(db => db.status === "stopped").length}</span> Inactive 
                        </span>
                      </div>
                      <AnimatePresence mode="popLayout">
                        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="database-grid" data-tour="database-cards">
                          {databases
                            .filter(db => db.status === "stopped")
                            .map((db) => (
                            <motion.div
                              key={db.id}
                              layoutId={activeTab === "all" ? `database-${db.id}` : undefined}
                              layout={activeTab === "all" ? true : false}
                              initial={false}
                              animate={activeTab === "all" ? { opacity: 1 } : undefined}
                              exit={activeTab === "all" ? { opacity: 0 } : undefined}
                              transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 35,
                                layout: {
                                  type: "spring",
                                  stiffness: 400,
                                  damping: 35
                                }
                              }}
                            >
                            <Card 
                              className={`relative overflow-hidden border-dashed ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
                                showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
                              } ${selectedDatabases.has(db.id) ? '' : 'opacity-60'}`}
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
                                    <div className="flex items-center justify-center w-7 h-7 shrink-0">
                                      {renderDatabaseIcon(db.icon, "w-7 h-7 object-cover rounded")}
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
                                        ? "bg-status-stopping text-status-stopping-foreground hover:opacity-90"
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
                                      <span className="font-mono font-medium text-success">{db.port}</span>
                                      {isPortBanned(db.port) && (
                                        <span className="text-destructive text-[10px]" title="This port is banned and cannot be used">
                                          🚫
                                        </span>
                                      )}
                                      <PortConflictWarning port={db.port} databaseId={db.id} databaseStatus={db.status} />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] gap-2">
                                    <span className="text-muted-foreground">Container</span>
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-4 w-4 p-0 shrink-0"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleCopyContainerId(db.containerId, db.id)
                                        }}
                                        onMouseEnter={createHoverHandlers(db.id, 'copy').onMouseEnter}
                                        onMouseLeave={createHoverHandlers(db.id, 'copy').onMouseLeave}
                                      >
                                        {copiedId === db.id ? (
                                          <CheckIcon ref={createHoverHandlers(db.id, 'check').iconRef} size={12} />
                                        ) : (
                                          <CopyIcon ref={createHoverHandlers(db.id, 'copy').iconRef} size={12} />
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
                                      className={`flex-1 h-6 text-[11px] ${
                                        db.status === "stopping"
                                          ? "border-orange-500/50 text-orange-600"
                                          : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleStartStop(db.id)
                                      }}
                                      disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                                      onMouseEnter={createHoverHandlers(db.id, 'play').onMouseEnter}
                                      onMouseLeave={createHoverHandlers(db.id, 'play').onMouseLeave}
                                    >
                                      {db.status === "stopping" ? (
                                        <>
                                          <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                          Stopping
                                        </>
                                      ) : (
                                        <>
                                          <PlayIcon ref={createHoverHandlers(db.id, 'play').iconRef} size={12} />
                                          Start
                                        </>
                                      )}
                                    </Button>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 bg-transparent"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedDatabase(db)
                                            setSettingsDialogOpen(true)
                                          }}
                                          onMouseEnter={createHoverHandlers(db.id, 'settings').onMouseEnter}
                                          onMouseLeave={createHoverHandlers(db.id, 'settings').onMouseLeave}
                                        >
                                          <SettingsIcon ref={createHoverHandlers(db.id, 'settings').iconRef} size={12} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Database settings</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                            </motion.div>
                          ))}
                        </div>
                      </AnimatePresence>
                    </>
                  )}

                  {/* Show message if no databases at all */}
                  {databases.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">No databases found</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </TabsContent>
            
            <TabsContent value="active" className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key="active"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Active Databases</h2>
                    <p className="text-sm text-muted-foreground">
                      Databases that are currently running or starting up
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showBulkActions && getVisibleDatabases().length > 0 && (
                      <Button
                        onClick={toggleSelectAll}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                      >
                        {getSelectAllButtonText()}
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <div className={`w-2 h-2 rounded-full ${
                        databases.filter(db => db.status === "running" || db.status === "starting").length > 0
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-red-500"
                      }`}></div>
                      <span className="text-foreground font-semibold">{databases.filter(db => db.status === "running" || db.status === "starting").length}</span>
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
                } ${showBulkActions && !selectedDatabases.has(db.id) ? 'opacity-60' : ''}`}
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
                      <div className="flex items-center justify-center w-7 h-7 shrink-0">
                        {renderDatabaseIcon(db.icon, "w-7 h-7 object-cover rounded")}
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
                          ? "bg-status-starting text-status-starting-foreground hover:opacity-90"
                          : db.status === "stopping"
                          ? "bg-status-stopping text-status-stopping-foreground hover:opacity-90"
                          : db.status === "installing"
                          ? "bg-status-installing text-status-installing-foreground hover:opacity-90"
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
                        <span className="font-mono font-medium text-success">{db.port}</span>
                        {isPortBanned(db.port) && (
                          <span className="text-destructive text-[10px]" title="This port is banned and cannot be used">
                            🚫
                          </span>
                        )}
                        <PortConflictWarning port={db.port} databaseId={db.id} databaseStatus={db.status} />
                      </div>
                    </div>
                    {(db.status === "running" || db.status === "starting") && db.pid && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">PID</span>
                        <span className="font-mono font-medium text-success">{db.pid}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Container</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCopyContainerId(db.containerId, db.id)
                          }}
                          onMouseEnter={createHoverHandlers(db.id, 'copy').onMouseEnter}
                          onMouseLeave={createHoverHandlers(db.id, 'copy').onMouseLeave}
                        >
                          {copiedId === db.id ? (
                            <CheckIcon className="h-3 w-3 text-success" />
                          ) : (
                            <CopyIcon ref={createHoverHandlers(db.id, 'copy').iconRef} size={12} />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* System Metrics - Only show for running instances */}
                  {(() => {
                    if (db.status === "running") {
                      log.debug(`Database ${db.id} status: ${db.status}, systemInfo:`, db.systemInfo)
                      if (db.systemInfo) {
                        return (
                          <div className="space-y-1 mb-2 pt-2 border-t border-border/50">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-muted-foreground">Uptime</span>
                              <span className="font-mono font-medium text-success">{formatUptime(db.systemInfo.uptime)}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div>
                                <div className="text-[10px] text-muted-foreground">CPU</div>
                                <div className="text-[11px] font-medium">{db.systemInfo.cpu.toFixed(1)}%</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">Memory</div>
                                <div className="text-[11px] font-medium">{formatBytes(db.systemInfo.memory)}</div>
                              </div>
                              <div>
                                <div className="text-[10px] text-muted-foreground">Connections</div>
                                <div className="text-[11px] font-medium">{db.systemInfo.connections}</div>
                              </div>
                            </div>
                          </div>
                        )
                      } else {
                        log.debug(`Database ${db.id} is running but has no systemInfo - triggering fetch`)
                        // Trigger system info fetch if not available
                        setTimeout(() => {
                          const now = Date.now()
                          const lastCheck = lastSystemInfoCheck[db.id] || 0
                          if (now - lastCheck > 5000) { // Allow more frequent checks for missing data
                            setLastSystemInfoCheck(prev => ({ ...prev, [db.id]: now }))
                            fetchSystemInfo(db.id)
                          }
                        }, 1000)
                        
                        // Show placeholder while loading
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
                    }
                    return null
                  })()}

                  {!showBulkActions && (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className={`flex-1 h-6 text-[11px] ${
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
                        onMouseEnter={createHoverHandlers(db.id, 'play').onMouseEnter}
                        onMouseLeave={createHoverHandlers(db.id, 'play').onMouseLeave}
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
                            <PlayIcon ref={createHoverHandlers(db.id, 'play').iconRef} size={12} />
                            Start
                          </>
                        )}
                      </Button>
                      {db.status !== "stopped" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 bg-transparent disabled:opacity-50"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRefreshStatus(db.id)
                              }}
                              onMouseEnter={createHoverHandlers(db.id, 'restart').onMouseEnter}
                              onMouseLeave={createHoverHandlers(db.id, 'restart').onMouseLeave}
                            >
                              <RefreshCCWIcon ref={createHoverHandlers(db.id, 'restart').iconRef} size={12} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Restart database</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {db.status === "running" && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 bg-transparent"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDebugDatabase(db.id)
                              }}
                              onMouseEnter={createHoverHandlers(db.id, 'debug').onMouseEnter}
                              onMouseLeave={createHoverHandlers(db.id, 'debug').onMouseLeave}
                            >
                              <ActivityIcon ref={createHoverHandlers(db.id, 'debug').iconRef} size={12} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Instance information</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 bg-transparent"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSettings(db)
                        }}
                        onMouseEnter={createHoverHandlers(db.id, 'settings').onMouseEnter}
                        onMouseLeave={createHoverHandlers(db.id, 'settings').onMouseLeave}
                      >
                        <SettingsIcon ref={createHoverHandlers(db.id, 'settings').iconRef} size={12} />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
                  ))}
              </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>
            
            <TabsContent value="inactive" className="mt-6">
              <AnimatePresence mode="wait">
                <motion.div
                  key="inactive"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                >
                  <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Inactive Databases</h2>
                    <p className="text-sm text-muted-foreground">
                      Databases that are currently stopped
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showBulkActions && getVisibleDatabases().length > 0 && (
                      <Button
                        onClick={toggleSelectAll}
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                      >
                        {getSelectAllButtonText()}
                      </Button>
                    )}
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      <span className="text-foreground font-semibold">{databases.filter(db => db.status === "stopped").length}</span>
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
                      className={`relative overflow-hidden border-dashed ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
                        showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
                      } ${selectedDatabases.has(db.id) ? '' : 'opacity-60'}`}
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
                            <div className="flex items-center justify-center w-7 h-7 shrink-0">
                              {renderDatabaseIcon(db.icon, "w-7 h-7 object-cover rounded")}
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
                                ? "bg-status-stopping text-status-stopping-foreground hover:opacity-90"
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
                              <span className="font-mono font-medium text-success">{db.port}</span>
                              {isPortBanned(db.port) && (
                                <span className="text-destructive text-[10px]" title="This port is banned and cannot be used">
                                  🚫
                                </span>
                              )}
                              <PortConflictWarning port={db.port} databaseId={db.id} databaseStatus={db.status} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-muted-foreground">Container</span>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCopyContainerId(db.containerId, db.id)
                                }}
                                onMouseEnter={createHoverHandlers(db.id, 'copy').onMouseEnter}
                                onMouseLeave={createHoverHandlers(db.id, 'copy').onMouseLeave}
                              >
                                {copiedId === db.id ? (
                                  <CheckIcon ref={createHoverHandlers(db.id, 'check').iconRef} size={12} />
                                ) : (
                                  <CopyIcon ref={createHoverHandlers(db.id, 'copy').iconRef} size={12} />
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
                              className={`flex-1 h-6 text-[11px] ${
                                db.status === "stopping"
                                  ? "border-orange-500/50 text-orange-600"
                                  : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                              }`}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStartStop(db.id)
                              }}
                              disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                              onMouseEnter={createHoverHandlers(db.id, 'play').onMouseEnter}
                              onMouseLeave={createHoverHandlers(db.id, 'play').onMouseLeave}
                            >
                              {db.status === "stopping" ? (
                                <>
                                  <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                                  Stopping
                                </>
                              ) : (
                                <>
                                  <PlayIcon ref={createHoverHandlers(db.id, 'play').iconRef} size={12} />
                                  Start
                                </>
                              )}
                            </Button>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 bg-transparent"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedDatabase(db)
                                    setSettingsDialogOpen(true)
                                  }}
                                  onMouseEnter={createHoverHandlers(db.id, 'settings').onMouseEnter}
                                  onMouseLeave={createHoverHandlers(db.id, 'settings').onMouseLeave}
                                >
                                  <SettingsIcon ref={createHoverHandlers(db.id, 'settings').iconRef} size={12} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Database settings</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
              </div>
                </motion.div>
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        )}
      </div>
      </div>

      <AddDatabaseDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddDatabase} />

      {selectedDatabase && (
        <DatabaseSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          database={selectedDatabase}
          onUpdate={handleUpdateDatabase}
          onDelete={handleDelete}
          allDatabases={databases}
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

      <PermissionsDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        permissions={permissions}
        onRetry={checkPermissions}
        onSkip={() => setPermissionsDialogOpen(false)}
        onOpenSettings={openSystemPreferences}
        onOpenPermissionPage={openPermissionPage}
        onRequestCritical={requestCriticalPermissions}
      />

      {selectedDatabase && (
        <InstanceInfoDialog
          open={instanceInfoOpen}
          onOpenChange={setInstanceInfoOpen}
          databaseId={selectedDatabase.id}
          databaseName={selectedDatabase.name}
        />
      )}

      {/* Port Conflict Selection Dialog */}
      <Dialog open={portConflictDialogOpen} onOpenChange={setPortConflictDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Port Conflict Detected</DialogTitle>
            <DialogDescription>
              Multiple databases are using the same port. Only one database can run on each port at a time. Choose which database to keep running on this port. Other non-conflicting databases will also be started.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {portConflicts.map(([port, dbs]) => (
              <div key={port} className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Port {port}
                </h4>
                <div className="space-y-2">
                  {dbs.map((db) => (
                    <Button
                      key={db.id}
                      variant="outline"
                      className="w-full justify-start h-auto p-3"
                      onClick={() => handleConflictDatabaseSelect(db.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center rounded bg-secondary">
                          {renderDatabaseIcon(db.icon, "w-5 h-5")}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{db.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {db.type} {db.version} • {db.status}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={db.status === "running" ? "default" : "secondary"}>
                            {db.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {db.status === "running" ? "Keep running" : "Start this one"}
                          </span>
                        </div>
                      </div>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setPortConflictDialogOpen(false)
                setPortConflicts([])
              }}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </React.Fragment>
  )
}

