"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Kbd } from "@/components/ui/kbd"
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import { BoxesIcon } from "@/components/ui/boxes"
import { CopyIcon, type CopyIconHandle } from "@/components/ui/copy"
import { Eye, EyeOff, Info } from "lucide-react"
import { SparklesIcon } from "@/components/ui/sparkles"
import { toast } from "sonner"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { DatabaseContainer, DatabaseType } from "@/lib/types"

const renderDatabaseIcon = (icon: string | undefined, className: string = "w-full h-full object-cover") => {
  if (!icon) {
    return <BoxesIcon size={14} />
  }
  
  if (icon.startsWith('/') || icon.startsWith('file://') || icon.startsWith('data:') || icon.includes('.')) {
    return (
      <DatabaseIcon 
        src={icon} 
        alt="Database icon" 
        className={className}
      />
    )
  }
  
  return <span className="text-lg leading-none">{icon}</span>
}

const DatabaseIcon = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) return
      
      if (src.startsWith('data:')) {
        setImageSrc(src)
        setIsLoading(false)
        return
      }
      
      if (src.startsWith('file://')) {
        try {
          const result = await window.electron?.convertFileToDataUrl?.(src)
          if (result?.success && result.dataUrl) {
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
        setImageSrc(src)
        setIsLoading(false)
      }
    }

    loadImage()
  }, [src])

  if (isLoading) {
    return <span className="text-lg animate-pulse">?</span>
  }

  if (hasError || !imageSrc) {
    return <span className="text-lg">?</span>
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

interface AddDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (database: DatabaseContainer) => void
}

const DATABASE_CONFIGS: Record<DatabaseType, { defaultPort: number; brewPackage: string; icon: string }> = {
  postgresql: {
    defaultPort: 5432,
    brewPackage: "postgresql",
    icon: "/Postgresql_elephant.svg",
  },
  mysql: {
    defaultPort: 3306,
    brewPackage: "mysql",
    icon: "/mysql-icon.svg",
  },
  mongodb: {
    defaultPort: 27017,
    brewPackage: "mongodb-community",
    icon: "/mongodb-icon.svg",
  },
  redis: {
    defaultPort: 6379,
    brewPackage: "redis",
    icon: "/redis-icon.svg",
  },
}


function getStableVersion(databaseType: string, versions: string[], currentIndex: number, dynamicStableVersions: string[] = []): boolean {
  const currentVersion = versions[currentIndex]
  if (!currentVersion) return false
  
  const majorVersion = currentVersion.split('.')[0] + '.' + (currentVersion.split('.')[1] || '0')
  
  const stableMajorVersions = dynamicStableVersions.length > 0 
    ? dynamicStableVersions 
    : getFallbackStableVersions(databaseType)
  
  const isStable = stableMajorVersions.some(stable => majorVersion.startsWith(stable))
  
  return isStable
}

function getFallbackStableVersions(databaseType: string): string[] {
  const fallbackStable = {
    postgresql: ['16', '15'],
    mysql: ['8.4', '8.0'],
    mongodb: ['8.2', '8.0'],
    redis: ['7.2', '7.0']
  }
  return fallbackStable[databaseType as keyof typeof fallbackStable] || []
}

const generateShortId = (): string => {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 6)
  return `${timestamp}${random}`
}

const generateShortName = (type: DatabaseType): string => {
  const typeMap = {
    postgresql: "pg",
    mysql: "my",
    mongodb: "mongo",
    redis: "redis"
  }
  const shortType = typeMap[type]
  const timestamp = Date.now().toString(36).substring(-4)
  return `${shortType}-${timestamp}`
}

const generateSecurePassword = (): string => {
  const length = 16
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
  const values = new Uint32Array(length)
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(values)
  } else {
    for (let i = 0; i < length; i++) {
      values[i] = Math.floor(Math.random() * 0xFFFFFFFF)
    }
  }
  let password = ""
  for (let i = 0; i < length; i++) {
    password += charset[values[i] % charset.length]
  }
  return password
}

export function AddDatabaseDialog({ open, onOpenChange, onAdd }: AddDatabaseDialogProps) {
  const [step, setStep] = useState<"type" | "config">("type")
  const [selectedType, setSelectedType] = useState<DatabaseType>("postgresql")
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState("")
  const MAX_NAME_LENGTH = 15

  const validateName = useCallback((nameValue: string) => {
    if (nameValue.length > MAX_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_NAME_LENGTH} characters or less`)
      return false
    }
    setNameError("")
    return true
  }, [MAX_NAME_LENGTH])

  const handleNameChange = (value: string) => {
    if (value.length > MAX_NAME_LENGTH) {
      value = value.substring(0, MAX_NAME_LENGTH)
    }
    setName(value)
    validateName(value)
  }

  const [version, setVersion] = useState("")
  const [port, setPort] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [selectedIcon, setSelectedIcon] = useState("")
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [bannedPorts, setBannedPorts] = useState<number[]>([])
  const [portError, setPortError] = useState<string>("")
  const [, setCheckingPort] = useState(false)
  const [portStatus, setPortStatus] = useState<"available" | "conflict" | "checking" | null>(null)
  const [portConflictInfo, setPortConflictInfo] = useState<{ processName: string; pid: string } | null>(null)
  const [findingPort, setFindingPort] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<string>("")
  const [installProgress, setInstallProgress] = useState<number>(0)
  const [canStart, setCanStart] = useState(false)
  const [, setForceUpdate] = useState(0)
  const [availableVersions, setAvailableVersions] = useState<Array<{majorVersion: string, fullVersion: string, packageName: string}>>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [stableVersions, setStableVersions] = useState<string[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [displayedPassword, setDisplayedPassword] = useState("")
  const [isAutoGenerated, setIsAutoGenerated] = useState(false)
  const copyIconRef = useRef<CopyIconHandle>(null)

  const fetchVersions = async (databaseType: DatabaseType) => {
    setLoadingVersions(true)
    try {
      const brewPackage = DATABASE_CONFIGS[databaseType].brewPackage
      
      const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<T>((resolve) => {
            setTimeout(() => {
              resolve(fallback)
            }, timeoutMs)
          })
        ])
      }
      
      const [versionDetails, stableVersionsData] = await Promise.all([
        window.electron?.getBrewVersions?.(brewPackage) || Promise.resolve([]),
        withTimeout(
          window.electron?.getStableVersions?.(databaseType) || Promise.resolve([]),
          5000,
          []
        )
      ])
      
      setStableVersions(stableVersionsData)
      
      if (versionDetails && versionDetails.length > 0) {
        const uniqueVersions = versionDetails.filter((versionDetail: { majorVersion: string; fullVersion: string; packageName: string }, index: number, self: { majorVersion: string; fullVersion: string; packageName: string }[]) => 
          index === self.findIndex((v: { majorVersion: string; fullVersion: string; packageName: string }) => v.fullVersion === versionDetail.fullVersion)
        )
        setAvailableVersions(uniqueVersions)
        setVersion(uniqueVersions[0].fullVersion)
      } else {
        const fallbackVersions = getFallbackVersionDetails(databaseType)
        setAvailableVersions(fallbackVersions)
        setVersion(fallbackVersions[0].fullVersion)
      }
    } catch (error) {
      console.error(`Failed to fetch versions for ${databaseType}:`, error)
      const fallbackVersions = getFallbackVersionDetails(databaseType)
      setAvailableVersions(fallbackVersions)
      setVersion(fallbackVersions[0].fullVersion)
    } finally {
      setLoadingVersions(false)
    }
  }


  const getFallbackVersionDetails = (databaseType: DatabaseType): Array<{majorVersion: string, fullVersion: string, packageName: string}> => {
    const fallbackDetails: Record<DatabaseType, Array<{majorVersion: string, fullVersion: string, packageName: string}>> = {
      postgresql: [
        { majorVersion: "16", fullVersion: "16.1", packageName: "postgresql@16" },
        { majorVersion: "15", fullVersion: "15.5", packageName: "postgresql@15" },
        { majorVersion: "14", fullVersion: "14.10", packageName: "postgresql@14" },
        { majorVersion: "13", fullVersion: "13.13", packageName: "postgresql@13" },
        { majorVersion: "12", fullVersion: "12.17", packageName: "postgresql@12" }
      ],
      mysql: [
        { majorVersion: "8.0", fullVersion: "8.0.35", packageName: "mysql@8.0" },
        { majorVersion: "5.7", fullVersion: "5.7.44", packageName: "mysql@5.7" },
        { majorVersion: "5.6", fullVersion: "5.6.51", packageName: "mysql@5.6" }
      ],
      mongodb: [
        { majorVersion: "8.2", fullVersion: "8.2.1", packageName: "mongodb-community@8.2" },
        { majorVersion: "8.0", fullVersion: "8.0.4", packageName: "mongodb-community@8.0" },
        { majorVersion: "7.0", fullVersion: "7.0.14", packageName: "mongodb-community@7.0" },
        { majorVersion: "6.0", fullVersion: "6.0.20", packageName: "mongodb-community@6.0" },
        { majorVersion: "5.0", fullVersion: "5.0.30", packageName: "mongodb-community@5.0" }
      ],
      redis: [
        { majorVersion: "7.2", fullVersion: "7.2.4", packageName: "redis@7.2" },
        { majorVersion: "7.0", fullVersion: "7.0.15", packageName: "redis@7.0" },
        { majorVersion: "6.2", fullVersion: "6.2.14", packageName: "redis@6.2" }
      ]
    }
    return fallbackDetails[databaseType] || [{ majorVersion: "latest", fullVersion: "latest", packageName: databaseType }]
  }

  const handleTypeSelect = async (type: DatabaseType) => {
    setSelectedType(type)
    setSelectedIcon(DATABASE_CONFIGS[type].icon)
    
    const defaultPort = DATABASE_CONFIGS[type].defaultPort
    setFindingPort(true)
    setPortError("")
    
    try {
      const availablePort = await findNextAvailablePort(defaultPort)
      setPort(availablePort.toString())
    } catch (_error) {
      setPort(defaultPort.toString())
    } finally {
      setFindingPort(false)
    }
    
    fetchVersions(type)
    
    if (type === "postgresql") {
      setUsername("postgres")
      const defaultPassword = "postgres"
      setPassword(defaultPassword)
      setDisplayedPassword(defaultPassword)
      setIsAutoGenerated(false)
    } else if (type === "mysql") {
      setUsername("root")
      setPassword("")
      setDisplayedPassword("")
      setIsAutoGenerated(false)
    } else if (type === "mongodb") {
      setUsername("")
      setPassword("")
      setDisplayedPassword("")
      setIsAutoGenerated(false)
    } else if (type === "redis") {
      setUsername("")
      setPassword("")
      setDisplayedPassword("")
      setIsAutoGenerated(false)
    }
    
    setStep("config")
  }

  useEffect(() => {
    const load = async () => {
      try {
        if (window.electron?.getBannedPorts) {
          const result = await window.electron.getBannedPorts()
          if (result.success && result.data) {
            setBannedPorts(result.data)
          } else {
            setBannedPorts([])
          }
        } else {
          const saved = localStorage.getItem("blacklisted-ports")
          if (saved) setBannedPorts(JSON.parse(saved))
        }
      } catch {}
    }
    if (open) load()
  }, [open])

  useEffect(() => {
    if (!port || !open) {
      setPortStatus(null)
      setPortConflictInfo(null)
      return
    }

    const portNum = Number.parseInt(port)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setPortStatus(null)
      setPortConflictInfo(null)
      return
    }

    const timeoutId = setTimeout(async () => {
      setPortStatus("checking")
      
      try {
        const allDatabases = await window.electron?.getDatabases?.() || []
        const internalConflict = allDatabases.find((db: DatabaseContainer) => db.port === portNum)
        
        if (internalConflict) {
          setPortStatus("conflict")
          setPortConflictInfo({ processName: `Another database: ${internalConflict.name}`, pid: 'N/A' })
          return
        }
        
        if (window.electron?.checkPortConflict) {
          const conflictResult = await window.electron.checkPortConflict(portNum)
          if (conflictResult?.inUse) {
            const processInfo = conflictResult?.processInfo
            setPortStatus("conflict")
            setPortConflictInfo({
              processName: processInfo?.processName || 'Unknown process',
              pid: processInfo?.pid || 'Unknown'
            })
          } else {
            setPortStatus("available")
            setPortConflictInfo(null)
          }
        } else {
          if (window.electron?.checkPort) {
            const res = await window.electron.checkPort(portNum)
            if (res?.available) {
              setPortStatus("available")
              setPortConflictInfo(null)
            } else {
              setPortStatus("conflict")
              setPortConflictInfo({ processName: 'Unknown process', pid: 'Unknown' })
            }
          }
        }
      } catch (error) {
        console.error(`[Live Port Check] Error:`, error)
        setPortStatus(null)
        setPortConflictInfo(null)
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [port, open])

  const findNextAvailablePort = useCallback(async (startPort: number): Promise<number> => {
    console.log(`[Port Search] Starting search from port ${startPort}`)
    const maxAttempts = 50
    const batchSize = 5
    
    for (let attempt = 0; attempt < maxAttempts; attempt += batchSize) {
      const portsToCheck = []
      for (let i = 0; i < batchSize && (attempt + i) < maxAttempts; i++) {
        const currentPort = startPort + attempt + i
        if (currentPort > 65535) break
        
        if (!bannedPorts.includes(currentPort)) {
          portsToCheck.push(currentPort)
        }
      }
      
      if (portsToCheck.length === 0) {
        continue
      }
      
      try {
        if (window.electron?.checkPortConflict) {
          const conflictChecks = await Promise.all(
            portsToCheck.map(async (p) => {
              try {
                const allDatabases = await window.electron?.getDatabases?.() || []
                console.log(`[Port Check] Checking port ${p} against ${allDatabases.length} existing databases`)
                const internalConflict = allDatabases.some((db: DatabaseContainer) => {
                  const isConflict = db.port === p
                  if (isConflict) {
                    console.log(`[Port Check] Internal conflict found: ${db.name} (${db.port}) - ${db.status}`)
                  }
                  return isConflict
                })
                
                if (internalConflict) {
                  return { port: p, inUse: true }
                }
                
                const result = await window.electron?.checkPortConflict?.(p)
                return { port: p, inUse: result?.inUse || false }
              } catch (error) {
                console.error(`[Port Check] Error checking port ${p}:`, error)
                return { port: p, inUse: true }
              }
            })
          )
          
          const availablePort = conflictChecks.find(check => !check.inUse)
          if (availablePort) {
            console.log(`[Port Search] Found available port: ${availablePort.port}`)
            return availablePort.port
          }
        } else if (window.electron?.checkPort) {
          const portChecks = await Promise.all(
            portsToCheck.map(async (p) => {
              try {
                const allDatabases = await window.electron?.getDatabases?.() || []
                console.log(`[Port Check] Checking port ${p} against ${allDatabases.length} existing databases`)
                const internalConflict = allDatabases.some((db: DatabaseContainer) => {
                  const isConflict = db.port === p
                  if (isConflict) {
                    console.log(`[Port Check] Internal conflict found: ${db.name} (${db.port}) - ${db.status}`)
                  }
                  return isConflict
                })
                
                if (internalConflict) {
                  return { port: p, available: false }
                }
                
                if (window.electron?.checkPort) {
                  const result = await window.electron.checkPort(p)
                  return { port: p, available: result?.available || false }
                }
                return { port: p, available: false }
              } catch (error) {
                console.error(`[Port Check] Error checking port ${p}:`, error)
                return { port: p, available: false }
              }
            })
          )
          
          const availablePort = portChecks.find(check => check.available)
          if (availablePort) {
            console.log(`[Port Search] Found available port: ${availablePort.port}`)
            return availablePort.port
          }
        }
      } catch (error) {
        console.error(`[Port Check] Error checking port batch:`, error)
      }
      
    }
    
    console.warn(`[Port Check] Could not find available port starting from ${startPort}, returning original`)
    return startPort
  }, [bannedPorts])

  const validatePort = useCallback(async (p: string) => {
    setPortError("")
    const portNum = Number.parseInt(p)
    if (isNaN(portNum)) return false
    if (portNum < 1 || portNum > 65535) {
      setPortError("Port must be between 1 and 65535")
      return false
    }
    if (bannedPorts.includes(portNum)) {
      setPortError("This port is banned in settings")
      return false
    }
    try {
      setCheckingPort(true)
      
      const allDatabases = await window.electron?.getDatabases?.() || []
      const internalConflict = allDatabases.find((db: DatabaseContainer) => db.port === portNum)
      
      if (internalConflict) {
        const suggestedPort = await findNextAvailablePort(portNum + 1)
        setPortError(`Port is in use by "${internalConflict.name}". Suggested: ${suggestedPort}`)
        setCheckingPort(false)
        return false
      }
      
      if (window.electron?.checkPortConflict) {
        const conflictResult = await window.electron.checkPortConflict(portNum)
        if (conflictResult?.inUse) {
          const suggestedPort = await findNextAvailablePort(portNum + 1)
          const processInfo = conflictResult?.processInfo
          const processName = processInfo?.processName || 'Unknown process'
          const pid = processInfo?.pid || 'Unknown'
          setPortError(`Port is in use by ${processName} (PID: ${pid}). Suggested: ${suggestedPort}`)
          setCheckingPort(false)
          return false
        }
      }
      
      if (window.electron?.checkPort) {
        const res = await window.electron.checkPort(portNum)
        if (!res?.available) {
          if (res?.reason === "invalid_range") setPortError("Port must be between 1 and 65535")
          else if (res?.reason === "privileged") setPortError("Privileged port (<1024) not allowed")
          else if (res?.reason === "banned") setPortError("This port is banned in settings")
          else if (res?.reason === "in_use") {
            const suggestedPort = await findNextAvailablePort(portNum + 1)
            setPortError(`Port is already in use. Suggested: ${suggestedPort}`)
          }
          else setPortError("Port is unavailable")
          setCheckingPort(false)
          return false
        }
      }
    } finally {
      setCheckingPort(false)
    }
    return true
  }, [bannedPorts, findNextAvailablePort])

  const handleReset = useCallback(() => {
    setStep("type")
    setName("")
    setVersion("")
    setPort("")
    setUsername("")
    setPassword("")
    setSelectedIcon("")
    setShowPassword(false)
    setDisplayedPassword("")
    setIsAutoGenerated(false)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!validateName(name)) {
      return
    }

    const ok = await validatePort(port)
    if (!ok) return

    try {
      setInstalling(true)
      setInstallProgress(10)
      setInstallMsg("Checking Homebrew…")
      
      const hasBrew = await window.electron?.brewIsInstalled?.()
      if (!hasBrew) {
        setInstallProgress(20)
        setInstallMsg("Installing Homebrew… this could take a few minutes")
        await window.electron?.brewInstall?.()
        setInstallProgress(50)
      }
      
      setInstallProgress(60)
      setInstallMsg(`Installing ${selectedType} ${version} via Homebrew…`)
      
      const versionDetail = availableVersions.find(v => v.fullVersion === version)
      const majorVersion = versionDetail?.majorVersion || version.split('.').slice(0, 2).join('.')
      
      const installResult = await window.electron?.brewInstallDb?.({ dbType: selectedType, version: majorVersion })
      
      setInstallProgress(100)
      if (typeof installResult === 'object' && (installResult?.alreadyInstalled || installResult?.stdout?.includes("already installed"))) {
        setInstallMsg(`${selectedType} ${version} is already installed and ready to use.`)
      } else {
        setInstallMsg("Installation complete! Database is ready to start.")
      }
      
      const getHomebrewPath = (dbType: DatabaseType, version: string) => {
        const versionDetail = availableVersions.find(v => v.fullVersion === version)
        const majorVersion = versionDetail?.majorVersion || version.split('.').slice(0, 2).join('.')
        
        switch (dbType) {
          case 'postgresql':
            return `/opt/homebrew/opt/postgresql@${majorVersion}/bin`
          case 'mysql':
            return `/opt/homebrew/opt/mysql@${majorVersion}/bin`
          case 'mongodb':
            return `/opt/homebrew/opt/mongodb-community@${majorVersion}/bin`
          case 'redis':
            return `/opt/homebrew/opt/redis/bin`
          default:
            return `/opt/homebrew/bin`
        }
      }

      const id = generateShortId()
      const database: DatabaseContainer = {
        id,
        name: name || generateShortName(selectedType),
        type: selectedType,
        version,
        port: Number.parseInt(port),
        status: "stopped",
        containerId: id,
        username,
        password,
        createdAt: new Date().toISOString(),
        icon: selectedIcon,
        autoStart,
        homebrewPath: getHomebrewPath(selectedType, version),
        // dataPath will be set correctly by the Electron main process
      }
      
      if (window.electron?.saveDatabase) {
        await window.electron.saveDatabase(database)
      }
      
      onAdd(database)
      handleReset()
      
      setTimeout(() => {
        setInstalling(false)
        setCanStart(true)
        setForceUpdate(prev => prev + 1)
        console.log("Installation process completed, UI should update")
      }, 500)
    } catch (error: unknown) {
      setInstalling(false)
      setInstallMsg("")
      setInstallProgress(0)
      setCanStart(false)
      
      // Extract meaningful error message
      let errorMessage = "Failed to install the selected database via Homebrew."
      if (error instanceof Error && error.message) {
        errorMessage = error.message
      } else if (typeof error === 'string' && error) {
        errorMessage = error
      }
      
      // Provide more specific error messages for common issues
      if (errorMessage.includes("tap") || errorMessage.includes("mongodb/brew")) {
        errorMessage = `MongoDB tap installation failed. Please ensure Homebrew is properly configured. Error: ${errorMessage}`
      } else if (errorMessage.includes("formula") || errorMessage.includes("not found")) {
        errorMessage = `Database formula not found. The version ${version} may not be available. Error: ${errorMessage}`
      } else if (errorMessage.includes("permission") || errorMessage.includes("Permission")) {
        errorMessage = `Permission denied. Please check your system permissions. Error: ${errorMessage}`
      }
      
      console.error(`[Install] Failed to install ${selectedType} ${version}:`, error)
      alert(errorMessage)
      return
    }
  }, [name, port, selectedType, version, username, password, selectedIcon, autoStart, availableVersions, onAdd, validateName, validatePort, handleReset])

  const handleClose = useCallback(() => {
    handleReset()
    onOpenChange(false)
  }, [onOpenChange, handleReset])

  const handleBack = useCallback(() => {
    if (step === "config") {
      setStep("type")
    }
  }, [step])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          if (step === 'config') {
            handleSubmit()
          }
          break
        case 'Escape':
          event.preventDefault()
          if (step === 'config') {
            handleClose()
          } else if (step === 'type') {
            handleClose()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, step, installing, canStart, handleSubmit, handleClose, handleBack])

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px] !top-[15vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle>Add New Database</DialogTitle>
            <DialogDescription>
              {step === "type" ? "Choose the type of database you want to create" : "Configure your database settings"}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px] max-h-[500px] overflow-y-auto">
            {step === "type" ? (
              <div className="grid grid-cols-2 gap-3 py-3">
                {(Object.keys(DATABASE_CONFIGS) as DatabaseType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => handleTypeSelect(type)}
                    disabled={loadingVersions}
                    className={`flex flex-col items-center justify-center p-4 border-2 border-border rounded-lg transition-colors ${
                      loadingVersions 
                        ? 'opacity-50 cursor-not-allowed' 
                        : 'hover:border-foreground hover:bg-accent'
                    }`}
                  >
                    <div className="w-12 h-12 mb-2 flex items-center justify-center">
                      {renderDatabaseIcon(DATABASE_CONFIGS[type].icon, "w-12 h-12 object-contain")}
                    </div>
                    <span className="font-semibold capitalize text-sm">{type}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      Port {DATABASE_CONFIGS[type].defaultPort}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>
                <TabsContent value="basic" className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs">
                      Database Name ({name.length}/{MAX_NAME_LENGTH})
                    </Label>
                    <Input
                      id="name"
                      placeholder={`my-${selectedType}-db`}
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="h-8 text-sm"
                      maxLength={MAX_NAME_LENGTH}
                    />
                    {nameError && <p className="text-[10px] text-destructive">{nameError}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Icon</Label>
                    <button
                      onClick={() => setIconPickerOpen(true)}
                      className="w-full flex items-center gap-2 p-2 border-2 border-dashed rounded-lg hover:border-primary hover:bg-accent"
                    >
                      <div className="w-8 h-8 flex items-center justify-center bg-muted rounded text-lg">
                        {renderDatabaseIcon(selectedIcon, "w-6 h-6 object-contain rounded")}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-xs font-medium">{selectedIcon ? "Change Icon" : "Choose Icon"}</p>
                        <p className="text-[10px] text-muted-foreground">Click to select emoji or upload image</p>
                      </div>
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="version" className="text-xs">
                      Version {loadingVersions && <span className="text-muted-foreground">(Loading...)</span>}
                    </Label>
                    <Select value={version} onValueChange={setVersion} disabled={loadingVersions}>
                      <SelectTrigger id="version" className="h-8 text-sm">
                        <SelectValue placeholder={loadingVersions ? "Loading versions..." : "Select version"} />
                      </SelectTrigger>
                      <SelectContent>
                        {loadingVersions ? (
                          <SelectItem value="loading" disabled>
                            Loading versions...
                          </SelectItem>
                        ) : (
                          (() => {
                            const uniqueVersions = availableVersions.filter((versionDetail, index, self) => 
                              index === self.findIndex(v => v.fullVersion === versionDetail.fullVersion)
                            )
                            
                            return uniqueVersions.map((versionDetail, index) => {
                              const isNewest = index === 0
                              const isStable = getStableVersion(selectedType, uniqueVersions.map(v => v.fullVersion), index, stableVersions)
                              
                              return (
                                <SelectItem key={`${versionDetail.fullVersion}-${versionDetail.majorVersion}-${index}`} value={versionDetail.fullVersion}>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono">{versionDetail.fullVersion}</span>
                                    <div className="flex gap-1">
                                      {isNewest && (
                                        <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-medium">
                                          newest
                                        </span>
                                      )}
                                      {isStable && (
                                        <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full font-medium">
                                          stable
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </SelectItem>
                              )
                            })
                          })()
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="port" className="text-xs">
                      Port {findingPort && <span className="text-muted-foreground">(finding available...)</span>}
                    </Label>
                    <div className="relative">
                      <Input
                        id="port"
                        type="text"
                        value={port}
                        onChange={(e) => {
                          setPort(e.target.value)
                          if (portError) {
                            setPortError("")
                          }
                        }}
                        onBlur={async (e) => {
                          const portNum = Number.parseInt(e.target.value)
                          if (!isNaN(portNum) && portNum > 0) {
                            const isValid = await validatePort(e.target.value)
                            
                            if (!isValid && portError && portError.includes("in use")) {
                            }
                          }
                        }}
                        className={`h-8 text-sm pr-8 ${portStatus === "conflict" ? "border-destructive focus-visible:ring-destructive" : portStatus === "available" ? "border-green-500 focus-visible:ring-green-500" : ""}`}
                        disabled={findingPort}
                      />
                      {portStatus === "checking" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {portStatus === "conflict" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <span className="text-destructive text-xs">⚠️</span>
                        </div>
                      )}
                      {portStatus === "available" && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <span className="text-green-500 text-xs">✓</span>
                        </div>
                      )}
                    </div>
                    {portStatus === "conflict" && portConflictInfo && (
                      <p className="text-[10px] text-destructive">
                        Port in use by {portConflictInfo.processName.startsWith('Another database') ? portConflictInfo.processName.replace('Another database: ', '') : `${portConflictInfo.processName} (PID: ${portConflictInfo.pid})`}
                      </p>
                    )}
                    {portStatus === "available" && (
                      <p className="text-[10px] text-green-600 dark:text-green-400">Port is available</p>
                    )}
                    {portError && <p className="text-[10px] text-destructive">{portError}</p>}
                  </div>
                </TabsContent>
                <TabsContent value="advanced" className="space-y-3 pt-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="username" className="text-xs">
                      Username
                    </Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs">
                      Password
                      {isAutoGenerated && <span className="text-muted-foreground"> (Auto-generated)</span>}
                      {!isAutoGenerated && displayedPassword && displayedPassword === "postgres" && (
                        <span className="text-muted-foreground"> (Default)</span>
                      )}
                    </Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={selectedType === "postgresql" ? "Default: postgres" : "Enter password or click sparkles to generate"}
                        value={displayedPassword || password}
                        onChange={(e) => {
                          const newPassword = e.target.value
                          setPassword(newPassword)
                          setDisplayedPassword(newPassword)
                          setIsAutoGenerated(false)
                        }}
                        className="h-8 text-sm pr-20"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const passwordToCopy = displayedPassword || password
                            if (passwordToCopy) {
                              navigator.clipboard.writeText(passwordToCopy).then(() => {
                                toast.success("Password copied to clipboard")
                                copyIconRef.current?.startAnimation()
                                setTimeout(() => copyIconRef.current?.stopAnimation(), 1000)
                              }).catch(() => {
                                toast.error("Failed to copy password")
                              })
                            }
                          }}
                          className="p-1 hover:bg-accent rounded transition-colors"
                          onMouseEnter={() => copyIconRef.current?.startAnimation()}
                          onMouseLeave={() => copyIconRef.current?.stopAnimation()}
                          aria-label="Copy password"
                        >
                          <CopyIcon ref={copyIconRef} className="text-muted-foreground" size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-1 hover:bg-accent rounded transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center pl-1 border-l border-border/50 ml-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const autoGenPassword = generateSecurePassword()
                                    setPassword(autoGenPassword)
                                    setDisplayedPassword(autoGenPassword)
                                    setIsAutoGenerated(true)
                                    toast.success("Password generated")
                                  }}
                                  className="p-1 hover:bg-accent rounded transition-colors"
                                  aria-label="Generate password"
                                >
                                  <SparklesIcon size={16} />
                                </button>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Generate secure password</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    {isAutoGenerated && (
                      <p className="text-[10px] text-muted-foreground">
                        A secure password has been auto-generated for you. Make sure to copy it!
                      </p>
                    )}
                    {selectedType === "mysql" && (
                      <div className="flex items-start gap-1.5 p-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded text-[10px]">
                        <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                        <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
                          <span className="font-medium">Tip:</span> When connecting with external tools (DBeaver, MySQL Workbench, etc.), enable <code className="text-xs bg-blue-100 dark:bg-blue-900/50 px-1 rounded">allowPublicKeyRetrieval=true</code> in connection settings if you see a &quot;Public Key Retrieval is not allowed&quot; error.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-xs">Auto-start on boot</Label>
                      <p className="text-xs text-muted-foreground">Start this database when LiquiDB launches</p>
                    </div>
                    <Switch checked={autoStart} onCheckedChange={setAutoStart} />
                  </div>
                </TabsContent>
              </Tabs>
              </div>
            )}
          </div>

          <DialogFooter>
            {step === "config" && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setStep("type")} 
                  size="sm"
                  className="mr-auto"
                >
                  Back <Kbd>Esc</Kbd>
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  size="sm" 
                  disabled={installing || loadingVersions}
                >
                  {installing 
                    ? "Installing..." 
                    : loadingVersions 
                    ? "Loading versions..." 
                    : canStart 
                    ? "Create Database" 
                    : "Install & Create"
                  } <Kbd>⏎</Kbd>
                </Button>
              </>
            )}
          </DialogFooter>
          
          {loadingVersions && (
            <div className="px-6 pb-4">
              <div className="flex items-center justify-center p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-sm text-muted-foreground">Loading versions and stable release information...</span>
                </div>
              </div>
            </div>
          )}
          
          {installing && (
            <div className="px-6 pb-4">
              <div className="flex items-center justify-center p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span className="text-sm text-muted-foreground">{installMsg}</span>
                </div>
                {installProgress > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-1 mt-2">
                    <div 
                      className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                      style={{ width: `${installProgress}%` }}
                    ></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <IconPickerDialog
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        currentIcon={selectedIcon}
        onSave={setSelectedIcon}
      />
    </>
  )
}
