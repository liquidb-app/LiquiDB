"use client"

import { useEffect, useState } from "react"
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
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import type { DatabaseContainer, DatabaseType } from "@/lib/types"

// Helper function to render database icons (emoji or custom image)
const renderDatabaseIcon = (icon: string | undefined, className: string = "w-full h-full object-cover") => {
  if (!icon) {
    return <span className="text-lg">?</span>
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
  return <span className="text-lg leading-none">{icon}</span>
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

const DATABASE_CONFIGS = {
  postgresql: {
    defaultPort: 5432,
    brewPackage: "postgresql",
    icon: "🐘",
  },
  mysql: {
    defaultPort: 3306,
    brewPackage: "mysql",
    icon: "🐬",
  },
  mongodb: {
    defaultPort: 27017,
    brewPackage: "mongodb-community",
    icon: "🍃",
  },
  redis: {
    defaultPort: 6379,
    brewPackage: "redis",
    icon: "🔴",
  },
}

const DEFAULT_ICONS = ["🐘", "🐬", "🍃", "🔴", "💾", "🗄️", "📊", "🔷", "🟦", "🟪", "🟩", "🟨", "🟧", "🟥"]

// Function to determine if a version should be marked as "stable"
function getStableVersion(databaseType: string, versions: string[], currentIndex: number, dynamicStableVersions: string[] = []): boolean {
  const currentVersion = versions[currentIndex]
  if (!currentVersion) return false
  
  // Extract major version for comparison
  const majorVersion = currentVersion.split('.')[0] + '.' + (currentVersion.split('.')[1] || '0')
  
  // Use dynamic stable versions if available, otherwise fallback to hardcoded
  const stableMajorVersions = dynamicStableVersions.length > 0 
    ? dynamicStableVersions 
    : getFallbackStableVersions(databaseType)
  
  const isStable = stableMajorVersions.some(stable => majorVersion.startsWith(stable))
  
  // Debug logging
  console.log(`[Stable Check] ${databaseType} ${currentVersion} (${majorVersion}) - Stable versions: [${stableMajorVersions.join(', ')}] - Is stable: ${isStable}`)
  
  return isStable
}

// Fallback stable versions for when dynamic fetching fails
function getFallbackStableVersions(databaseType: string): string[] {
  const fallbackStable = {
    postgresql: ['16', '15'],
    mysql: ['8.4', '8.0'],
    mongodb: ['8.2', '8.0'],
    redis: ['7.2', '7.0']
  }
  return fallbackStable[databaseType as keyof typeof fallbackStable] || []
}

// Generate shorter, unique IDs and names
const generateShortId = (): string => {
  const timestamp = Date.now().toString(36) // Base36 for shorter representation
  const random = Math.random().toString(36).substring(2, 6) // 4 random chars
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
  const timestamp = Date.now().toString(36).substring(-4) // Last 4 chars of timestamp
  return `${shortType}-${timestamp}`
}

export function AddDatabaseDialog({ open, onOpenChange, onAdd }: AddDatabaseDialogProps) {
  const [step, setStep] = useState<"type" | "config">("type")
  const [selectedType, setSelectedType] = useState<DatabaseType>("postgresql")
  const [name, setName] = useState("")
  const [version, setVersion] = useState("")
  const [port, setPort] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [selectedIcon, setSelectedIcon] = useState("")
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const [bannedPorts, setBannedPorts] = useState<number[]>([])
  const [portError, setPortError] = useState<string>("")
  const [checkingPort, setCheckingPort] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<string>("")
  const [installProgress, setInstallProgress] = useState<number>(0)
  const [canStart, setCanStart] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(0)
  const [availableVersions, setAvailableVersions] = useState<Array<{majorVersion: string, fullVersion: string, packageName: string}>>([])
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [stableVersions, setStableVersions] = useState<string[]>([])

  // Function to fetch available versions from Homebrew
  const fetchVersions = async (databaseType: DatabaseType) => {
    setLoadingVersions(true)
    try {
      const brewPackage = DATABASE_CONFIGS[databaseType].brewPackage
      
      // Fetch both versions and stable versions in parallel
      const [versionDetails, stableVersionsData] = await Promise.all([
        // @ts-ignore
        window.electron?.getBrewVersions?.(brewPackage) || Promise.resolve([]),
        // @ts-ignore
        window.electron?.getStableVersions?.(databaseType) || Promise.resolve([])
      ])
      
      // Set stable versions
      setStableVersions(stableVersionsData)
      
      if (versionDetails && versionDetails.length > 0) {
        // Remove duplicates based on fullVersion
        const uniqueVersions = versionDetails.filter((versionDetail, index, self) => 
          index === self.findIndex(v => v.fullVersion === versionDetail.fullVersion)
        )
        setAvailableVersions(uniqueVersions)
        // Set the latest version as default
        setVersion(uniqueVersions[0].fullVersion)
      } else {
        // Fallback to hardcoded versions if brew fails
        const fallbackVersions = getFallbackVersionDetails(databaseType)
        setAvailableVersions(fallbackVersions)
        setVersion(fallbackVersions[0].fullVersion)
      }
    } catch (error) {
      console.error(`Failed to fetch versions for ${databaseType}:`, error)
      // Fallback to hardcoded versions
      const fallbackVersions = getFallbackVersionDetails(databaseType)
      setAvailableVersions(fallbackVersions)
      setVersion(fallbackVersions[0].fullVersion)
    } finally {
      setLoadingVersions(false)
    }
  }

  // Fallback versions for when brew is unavailable
  const getFallbackVersions = (databaseType: DatabaseType): string[] => {
    const fallbackVersions = {
      postgresql: ["16", "15", "14", "13"],
      mysql: ["8.0", "5.7", "5.6"],
      mongodb: ["7.0", "6.0", "5.0"],
      redis: ["7.2", "7.0", "6.2"],
    }
    return fallbackVersions[databaseType] || ["latest"]
  }

  // Fallback version details for when brew is unavailable
  const getFallbackVersionDetails = (databaseType: DatabaseType): Array<{majorVersion: string, fullVersion: string, packageName: string}> => {
    const fallbackDetails = {
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

  const handleTypeSelect = (type: DatabaseType) => {
    setSelectedType(type)
    setPort(DATABASE_CONFIGS[type].defaultPort.toString())
    setSelectedIcon(DATABASE_CONFIGS[type].icon)
    // Fetch versions dynamically
    fetchVersions(type)
    
    // Set default credentials based on database type
    if (type === "postgresql") {
      setUsername("postgres")
      setPassword("postgres")
    } else if (type === "mysql") {
      setUsername("root")
      setPassword("")
    } else if (type === "mongodb") {
      setUsername("")
      setPassword("")
    } else if (type === "redis") {
      setUsername("")
      setPassword("")
    }
    
    setStep("config")
  }

  useEffect(() => {
    const load = async () => {
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
      } catch {}
    }
    if (open) load()
  }, [open])

  const validatePort = async (p: string) => {
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
      // @ts-ignore
      if (window.electron?.checkPort) {
        // @ts-ignore
        const res = await window.electron.checkPort(portNum)
        if (!res?.available) {
          if (res?.reason === "invalid_range") setPortError("Port must be between 1 and 65535")
          else if (res?.reason === "privileged") setPortError("Privileged port (<1024) not allowed")
          else if (res?.reason === "banned") setPortError("This port is banned in settings")
          else if (res?.reason === "in_use") setPortError("Port is already in use")
          else setPortError("Port is unavailable")
          return false
        }
      }
    } finally {
      setCheckingPort(false)
    }
    return true
  }

  const handleSubmit = async () => {
    const ok = await validatePort(port)
    if (!ok) return

    // Ensure Homebrew is available and install the selected database formula
    try {
      setInstalling(true)
      setInstallProgress(10)
      setInstallMsg("Checking Homebrew…")
      
      // @ts-ignore
      const hasBrew = await window.electron?.brewIsInstalled?.()
      if (!hasBrew) {
        setInstallProgress(20)
        setInstallMsg("Installing Homebrew… this could take a few minutes")
        // @ts-ignore
        await window.electron?.brewInstall?.()
        setInstallProgress(50)
      }
      
      setInstallProgress(60)
      setInstallMsg(`Installing ${selectedType} ${version} via Homebrew…`)
      
      // Find the version details to get the major version for installation
      const versionDetail = availableVersions.find(v => v.fullVersion === version)
      const majorVersion = versionDetail?.majorVersion || version.split('.').slice(0, 2).join('.')
      
      // @ts-ignore
      const installResult = await window.electron?.brewInstallDb?.({ dbType: selectedType, version: majorVersion })
      
      setInstallProgress(100)
      if (installResult?.alreadyInstalled || installResult?.stdout?.includes("already installed")) {
        setInstallMsg(`${selectedType} ${version} is already installed and ready to use.`)
      } else {
        setInstallMsg("Installation complete! Database is ready to start.")
      }
      
      // Small delay to ensure UI updates properly
      setTimeout(() => {
        setInstalling(false)
        setCanStart(true)
        setForceUpdate(prev => prev + 1)
        console.log("Installation process completed, UI should update")
      }, 500)
    } catch (e) {
      setInstalling(false)
      setInstallMsg("")
      setInstallProgress(0)
      setCanStart(false)
      alert("Failed to install the selected database via Homebrew.")
      return
    }
    const database: DatabaseContainer = {
      id: generateShortId(),
      name: name || generateShortName(selectedType),
      type: selectedType,
      version,
      port: Number.parseInt(port),
      status: "stopped", // Create with stopped status since installation is complete
      containerId: generateShortId(),
      username,
      password,
      createdAt: new Date().toISOString(),
      icon: selectedIcon,
      autoStart,
    }
    
    // Persist via Electron (secure password via keychain)
    // @ts-ignore
    if (window.electron?.saveDatabase) {
      // @ts-ignore
      await window.electron.saveDatabase(database)
    }
    
    onAdd(database)
    handleReset()
    setInstalling(false)
    setInstallMsg("")
    setInstallProgress(0)
    setCanStart(false)
  }

  const handleReset = () => {
    setStep("type")
    setName("")
    setVersion("")
    setPort("")
    setUsername("")
    setPassword("")
    setSelectedIcon("")
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

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
                    <span className="text-3xl mb-2">{DATABASE_CONFIGS[type].icon}</span>
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
                      Database Name
                    </Label>
                    <Input
                      id="name"
                      placeholder={`my-${selectedType}-db`}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Icon</Label>
                    <button
                      onClick={() => setIconPickerOpen(true)}
                      className="w-full flex items-center gap-2 p-2 border-2 border-dashed rounded-lg hover:border-primary hover:bg-accent"
                    >
                      <div className="w-8 h-8 flex items-center justify-center bg-muted rounded text-lg">
                        {renderDatabaseIcon(selectedIcon, "w-6 h-6 object-cover rounded")}
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
                            // First filter out duplicates
                            const uniqueVersions = availableVersions.filter((versionDetail, index, self) => 
                              index === self.findIndex(v => v.fullVersion === versionDetail.fullVersion)
                            )
                            
                            // Then map with correct index references
                            return uniqueVersions.map((versionDetail, index) => {
                              // Determine tags for each version
                              const isNewest = index === 0
                              // Use the filtered list for stable check since we're working with the filtered data
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
                      Port
                    </Label>
                    <Input
                      id="port"
                      type="number"
                      value={port}
                      onChange={async (e) => {
                        setPort(e.target.value)
                        if (e.target.value) await validatePort(e.target.value)
                      }}
                      className="h-8 text-sm"
                    />
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
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Leave empty for auto-generated"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-8 text-sm"
                    />
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
                  Back
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
                  }
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
