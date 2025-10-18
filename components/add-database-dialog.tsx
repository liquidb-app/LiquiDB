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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import type { DatabaseContainer, DatabaseType } from "@/lib/types"

interface AddDatabaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (database: DatabaseContainer) => void
}

const DATABASE_CONFIGS = {
  postgresql: {
    defaultPort: 5432,
    versions: ["16", "15", "14", "13"],
    icon: "🐘",
  },
  mysql: {
    defaultPort: 3306,
    versions: ["8.0", "5.7", "5.6"],
    icon: "🐬",
  },
  mongodb: {
    defaultPort: 27017,
    versions: ["7.0", "6.0", "5.0"],
    icon: "🍃",
  },
  redis: {
    defaultPort: 6379,
    versions: ["7.2", "7.0", "6.2"],
    icon: "🔴",
  },
}

const DEFAULT_ICONS = ["🐘", "🐬", "🍃", "🔴", "💾", "🗄️", "📊", "🔷", "🟦", "🟪", "🟩", "🟨", "🟧", "🟥"]

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
  const [bannedPorts, setBannedPorts] = useState<number[]>([])
  const [portError, setPortError] = useState<string>("")
  const [checkingPort, setCheckingPort] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installMsg, setInstallMsg] = useState<string>("")
  const [installProgress, setInstallProgress] = useState<number>(0)
  const [canStart, setCanStart] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(0)

  const handleTypeSelect = (type: DatabaseType) => {
    setSelectedType(type)
    setPort(DATABASE_CONFIGS[type].defaultPort.toString())
    setVersion(DATABASE_CONFIGS[type].versions[0])
    setSelectedIcon(DATABASE_CONFIGS[type].icon)
    
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
      // @ts-ignore
      const installResult = await window.electron?.brewInstallDb?.({ dbType: selectedType, version })
      
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
      autoStart: false,
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
                    className="flex flex-col items-center justify-center p-4 border-2 border-border rounded-lg hover:border-foreground hover:bg-accent transition-colors"
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
                        {selectedIcon || "?"}
                      </div>
                      <div className="text-left flex-1">
                        <p className="text-xs font-medium">{selectedIcon ? "Change Icon" : "Choose Icon"}</p>
                        <p className="text-[10px] text-muted-foreground">Click to select emoji or upload image</p>
                      </div>
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="version" className="text-xs">
                      Version
                    </Label>
                    <Select value={version} onValueChange={setVersion}>
                      <SelectTrigger id="version" className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DATABASE_CONFIGS[selectedType].versions.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
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
                </TabsContent>
              </Tabs>
            )}
          </div>

          <DialogFooter>
            {step === "config" && (
              <>
                <Button variant="outline" onClick={() => setStep("type")} size="sm">
                  Back
                </Button>
                <Button onClick={handleSubmit} size="sm" disabled={installing}>
                  {installing ? "Installing..." : canStart ? "Create Database" : "Install & Create"}
                </Button>
                {installMsg && (
                  <div className="text-[10px] text-muted-foreground ml-2">
                    <div>{installMsg}</div>
                    {installing && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div 
                          className="bg-blue-600 h-1 rounded-full transition-all duration-300" 
                          style={{ width: `${installProgress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </DialogFooter>
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
