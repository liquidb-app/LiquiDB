"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { DownloadIcon, type DownloadIconHandle } from "@/components/ui/download"
import { CopyIcon, type CopyIconHandle } from "@/components/ui/copy"
import { toast } from "sonner"
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import { BoxesIcon } from "@/components/ui/boxes"
import { Kbd } from "@/components/ui/kbd"
import type { DatabaseContainer } from "@/lib/types"

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
          // @ts-expect-error - Electron IPC types not available
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

interface DatabaseSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  database: DatabaseContainer
  onUpdate: (database: DatabaseContainer) => void
  onDelete: (id: string) => void
  allDatabases?: DatabaseContainer[]
}


export function DatabaseSettingsDialog({
  open,
  onOpenChange,
  database,
  onUpdate,
  onDelete,
  allDatabases = [],
}: DatabaseSettingsDialogProps) {
  const [name, setName] = useState(database.name)
  const [nameError, setNameError] = useState("")
  const MAX_NAME_LENGTH = 15
  const [port, setPort] = useState(database.port.toString())
  const [portError, setPortError] = useState<string>("")
  const [checkingPort, setCheckingPort] = useState(false)
  const [portStatus, setPortStatus] = useState<"available" | "conflict" | "checking" | null>(null)
  const [portConflictInfo, setPortConflictInfo] = useState<{ processName: string; pid: string } | null>(null)
  const [username, setUsername] = useState(database.username)
  const [password, setPassword] = useState("")
  const [autoStart, setAutoStart] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState(database.icon || "")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [autoStartConflict, setAutoStartConflict] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showDBeaverInstructions, setShowDBeaverInstructions] = useState(false)
  const downloadIconRef = useRef<DownloadIconHandle>(null)
  const copyConnectionStringRef = useRef<CopyIconHandle>(null)

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

  useEffect(() => {
    setName(database.name)
    setPort(database.port.toString())
    setUsername(database.username)
    setPassword("")
    setSelectedIcon(database.icon || "")
    setAutoStart(database.autoStart || false)
    setAutoStartConflict(null)
    setPortError("")
    setPortStatus(null)
    setPortConflictInfo(null)
  }, [database])
  
  useEffect(() => {
    if (username !== database.username) {
      setUsername(database.username)
    }
  }, [username, database.username])

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

    if (portNum === database.port) {
      setPortStatus(null)
      setPortConflictInfo(null)
      return
    }

    const timeoutId = setTimeout(async () => {
      setPortStatus("checking")
      
      try {
        const internalConflict = allDatabases.find(db => 
          db.id !== database.id && db.port === portNum
        )
        
        if (internalConflict) {
          setPortStatus("conflict")
          setPortConflictInfo({ processName: `Another database: ${internalConflict.name}`, pid: 'N/A' })
          return
        }
        
        // @ts-expect-error - Electron IPC types not available
        if (window.electron?.checkPortConflict) {
          // @ts-expect-error - Electron IPC types not available
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
          // @ts-expect-error - Electron IPC types not available
          if (window.electron?.checkPort) {
            // @ts-expect-error - Electron IPC types not available
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
  }, [port, database.port, database.id, allDatabases, open])

  const findNextAvailablePort = useCallback(async (startPort: number): Promise<number> => {
    let port = startPort
    const maxAttempts = 100
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const internalConflict = allDatabases.find(db => 
        db.id !== database.id && db.port === port
      )
      
      if (internalConflict) {
        port++
        continue
      }
      
      try {
        // @ts-expect-error - Electron IPC types not available
        if (window.electron?.checkPortConflict) {
          // @ts-expect-error - Electron IPC types not available
          const conflictResult = await window.electron.checkPortConflict(port)
          if (conflictResult?.inUse) {
            port++
            continue
          }
          return port
        }
        // @ts-expect-error - Electron IPC types not available
        if (window.electron?.checkPort) {
          // @ts-expect-error - Electron IPC types not available
          const res = await window.electron.checkPort(port)
          if (res?.available) {
            return port
          }
          port++
          continue
        }
      } catch (error) {
        console.error(`[Port Check] Error checking port ${port}:`, error)
        port++
        continue
      }
    }
    
    return startPort
  }, [allDatabases, database.id])

  const validatePort = useCallback(async (p: string) => {
    setPortError("")
    const portNum = Number.parseInt(p)
    if (isNaN(portNum)) {
      setPortError("Port must be a number")
      return false
    }
    if (portNum < 1 || portNum > 65535) {
      setPortError("Port must be between 1 and 65535")
      return false
    }
    
    if (portNum === database.port) {
      return true
    }
    
    try {
      setCheckingPort(true)
      
      const internalConflict = allDatabases.find(db => 
        db.id !== database.id && db.port === portNum
      )
      
      if (internalConflict) {
        const suggestedPort = await findNextAvailablePort(portNum + 1)
        setPortError(`Port is in use by "${internalConflict.name}". Suggested: ${suggestedPort}`)
        setCheckingPort(false)
        return false
      }
      
      // @ts-expect-error - Electron IPC types not available
      if (window.electron?.checkPortConflict) {
        // @ts-expect-error - Electron IPC types not available
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
      
      // @ts-expect-error - Electron IPC types not available
      if (window.electron?.checkPort) {
        // @ts-expect-error - Electron IPC types not available
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
    } catch (error) {
      console.error(`[Port Validation] Error:`, error)
      setPortError("Error checking port availability")
      setCheckingPort(false)
      return false
    } finally {
      setCheckingPort(false)
    }
    return true
  }, [allDatabases, database.id, database.port, findNextAvailablePort])

  const checkAutoStartPortConflict = (enableAutoStart: boolean) => {
    if (!enableAutoStart) {
      setAutoStartConflict(null)
      return true
    }

    const conflictingDb = allDatabases.find(db => 
      db.id !== database.id && 
      db.port === database.port && 
      db.autoStart
    )

    if (conflictingDb) {
      setAutoStartConflict(conflictingDb.name)
      return false
    }

    setAutoStartConflict(null)
    return true
  }

  const handleAutoStartToggle = (enabled: boolean) => {
    if (checkAutoStartPortConflict(enabled)) {
      setAutoStart(enabled)
    }
  }

  const handleCancel = useCallback(() => {
    setName(database.name)
    setPort(database.port.toString())
    setUsername(database.username)
    setPassword("")
    setSelectedIcon(database.icon || "")
    setAutoStart(database.autoStart || false)
    setAutoStartConflict(null)
    onOpenChange(false)
  }, [database, onOpenChange])


  const handleSave = useCallback(async () => {
    if (!validateName(name)) {
      return
    }

    const portValid = await validatePort(port)
    if (!portValid) {
      return
    }

    const portNum = Number.parseInt(port)
    const checkAndSave = async () => {
      const updated = {
        ...database,
        name,
        port: portNum,
        username: database.username,
        password: password || database.password,
        icon: selectedIcon,
        autoStart,
      }
      // @ts-expect-error - Electron IPC types not available
      if (window.electron?.saveDatabase) {
        // @ts-expect-error - Electron IPC types not available
        await window.electron.saveDatabase(updated)
      }
      
      const passwordChanged = password !== ""
      const nameChanged = name !== database.name
      const credentialsChanged = passwordChanged || nameChanged
      
      if (credentialsChanged && database.status === "running") {
        try {
          let actualPassword = password
          if (!actualPassword || actualPassword === "") {
            // @ts-expect-error - Electron IPC types not available
            if (window.electron?.getPassword) {
              // @ts-expect-error - Electron IPC types not available
              actualPassword = await window.electron.getPassword(database.id)
            }
          }
          
          // @ts-expect-error - Electron IPC types not available
          if (window.electron?.updateDatabaseCredentials) {
            // @ts-expect-error - Electron IPC types not available
            const result = await window.electron.updateDatabaseCredentials({
              id: database.id,
              username: database.username,
              password: actualPassword,
              name: name || database.name
            })
            
            if (!result?.success) {
              console.error("Failed to update database credentials:", result?.error)
            }
          }
        } catch (error) {
          console.error("Error updating database credentials:", error)
        }
      }
      
      onUpdate(updated)
    }
    checkAndSave()
  }, [name, port, selectedIcon, autoStart, password, database, validateName, validatePort, onUpdate])

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    setTimeout(() => {
      onDelete(database.id)
    }, 100)
  }

  const handleExport = async () => {
    if (isExporting) return
    
    try {
      // @ts-expect-error - Electron IPC types not available
      if (window.electron?.exportDatabase) {
        setIsExporting(true)
        
        let currentDescription = `Preparing export for ${database.name}...`
        const toastId = toast.loading(`Exporting ${database.name}...`, {
          description: currentDescription,
        })

        // @ts-expect-error - Electron IPC types not available
        window.electron?.onExportProgress?.((progress: { stage: string, message: string, progress: number, total: number }) => {
          if (progress.message && progress.message !== currentDescription) {
            currentDescription = progress.message
            toast.loading("Exporting database instance...", {
              id: toastId,
              description: currentDescription,
            })
          }
        })

        // @ts-expect-error - Electron IPC types not available
        window.electron.exportDatabase(database)
          .then((result: { success?: boolean; canceled?: boolean; error?: string; filePath?: string; size?: number }) => {
            setIsExporting(false)
            
            // @ts-expect-error - Electron IPC types not available
            window.electron?.removeExportProgressListener?.()
            
            toast.dismiss(toastId)

            if (result?.success) {
              const fileName = result.filePath ? result.filePath.split(/[/\\]/).pop() : 'file'
              const sizeMB = result.size ? (result.size / (1024 * 1024)).toFixed(2) : '0'
              toast.success(`Export completed successfully`, {
                description: `${database.name} exported to ${fileName} (${sizeMB} MB)`,
                duration: 5000,
              })
            } else if (result?.canceled) {
              toast.info("Export cancelled", {
                description: "Export operation was cancelled.",
                duration: 3000,
              })
            } else {
              toast.error("Export failed", {
                description: result?.error || `Failed to export ${database.name}`,
                duration: 5000,
              })
            }
          })
          .catch((error: unknown) => {
            setIsExporting(false)
            
            // @ts-expect-error - Electron IPC types not available
            window.electron?.removeExportProgressListener?.()
            
            toast.dismiss(toastId)
            
            toast.error("Export error", {
              description: error instanceof Error ? error.message : "An error occurred while exporting",
              duration: 5000,
            })
          })
      } else {
        toast.error("Export unavailable", {
          description: "Export functionality is not available",
          duration: 3000,
        })
      }
    } catch (error) {
      toast.error("Export error", {
        description: error instanceof Error ? error.message : "An error occurred while exporting",
        duration: 5000,
      })
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          handleSave()
          break
        case 'Escape':
          event.preventDefault()
          handleCancel()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleSave, handleCancel, onOpenChange])

  return (
    <>
      <Dialog open={open} onOpenChange={handleCancel}>
        <DialogContent className="sm:max-w-[500px] !top-[15vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle>Database Settings</DialogTitle>
            <DialogDescription>Configure settings for {database.name}</DialogDescription>
          </DialogHeader>

          <div className="min-h-[200px] max-h-[500px] overflow-y-auto">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="connection">Connection</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
                <TabsTrigger value="danger">Danger</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name" className="text-xs">
                    Database Name ({name.length}/{MAX_NAME_LENGTH})
                  </Label>
                  <Input
                    id="edit-name"
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
                      {renderDatabaseIcon(selectedIcon, "w-6 h-6 object-cover rounded")}
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-xs font-medium">{selectedIcon ? "Change Icon" : "Choose Icon"}</p>
                      <p className="text-[10px] text-muted-foreground">Click to select emoji or upload image</p>
                    </div>
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-port" className="text-xs">
                    Port
                  </Label>
                  <div className="relative">
                    <Input
                      id="edit-port"
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
                          await validatePort(e.target.value)
                        }
                      }}
                      className={`h-8 text-sm pr-8 ${portStatus === "conflict" ? "border-destructive focus-visible:ring-destructive" : portStatus === "available" ? "border-green-500 focus-visible:ring-green-500" : ""}`}
                      disabled={checkingPort}
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
                    <p className="text-[10px] text-destructive mt-1">
                      Port in use by {portConflictInfo.processName.startsWith('Another database') ? portConflictInfo.processName.replace('Another database: ', '') : `${portConflictInfo.processName} (PID: ${portConflictInfo.pid})`}
                    </p>
                  )}
                  {portStatus === "available" && (
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">Port is available</p>
                  )}
                  {portError && <p className="text-[10px] text-destructive mt-1">{portError}</p>}
                  {checkingPort && <p className="text-[10px] text-muted-foreground mt-1">Checking port...</p>}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Auto-start on boot</Label>
                    <p className="text-xs text-muted-foreground">Start this database automatically</p>
                    {autoStartConflict && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Port conflict with &quot;{autoStartConflict}&quot; - change port first
                      </p>
                    )}
                  </div>
                  <Switch 
                    checked={autoStart} 
                    onCheckedChange={handleAutoStartToggle}
                    disabled={autoStartConflict !== null}
                  />
                </div>
              </TabsContent>

              <TabsContent value="connection" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-username" className="text-xs">
                    Username
                  </Label>
                  <Input
                    id="edit-username"
                    value={database.username}
                    disabled
                    className="h-8 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Username is set during database creation and cannot be changed
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-password" className="text-xs">
                    Password
                  </Label>
                  <Input
                    id="edit-password"
                    type="password"
                    placeholder="Leave empty to keep current password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">Connection String</p>
                    <button
                      type="button"
                      onClick={() => {
                        const auth = database.username && database.password 
                          ? `${database.username}:${database.password}@`
                          : database.username 
                          ? `${database.username}@`
                          : ''
                        const connectionString = database.type === "redis"
                          ? `${database.type}://${auth}localhost:${database.port}`
                          : `${database.type}://${auth}localhost:${database.port}/${database.name}`
                        navigator.clipboard.writeText(connectionString).then(() => {
                          toast.success("Connection string copied to clipboard")
                          copyConnectionStringRef.current?.startAnimation()
                          setTimeout(() => copyConnectionStringRef.current?.stopAnimation(), 1000)
                        }).catch(() => {
                          toast.error("Failed to copy connection string")
                        })
                      }}
                      className="p-1 hover:bg-accent rounded transition-colors"
                      onMouseEnter={() => copyConnectionStringRef.current?.startAnimation()}
                      onMouseLeave={() => copyConnectionStringRef.current?.stopAnimation()}
                      aria-label="Copy connection string"
                    >
                      <CopyIcon ref={copyConnectionStringRef} className="text-muted-foreground" size={14} />
                    </button>
                  </div>
                  <code className="text-xs break-all block">
                    {(() => {
                      const auth = database.username && database.password 
                        ? `${database.username}:${database.password}@`
                        : database.username 
                        ? `${database.username}@`
                        : ''
                      return database.type === "redis"
                        ? `${database.type}://${auth}localhost:${database.port}`
                        : `${database.type}://${auth}localhost:${database.port}/${database.name}`
                    })()}
                  </code>
                  {database.type === "mysql" && (
                    <div className="text-[10px] text-muted-foreground mt-1.5 space-y-1">
                      <p>
                        <span className="font-medium text-foreground">Why?</span> MySQL 8.0+ uses <code className="text-xs bg-background/50 px-1 rounded">caching_sha2_password</code> which requires the server&apos;s RSA public key to encrypt passwords. The <code className="text-xs bg-background/50 px-1 rounded">allowPublicKeyRetrieval=true</code> parameter allows clients to request this key during connection.
                      </p>
                      <p>
                        This parameter is <span className="text-green-600 dark:text-green-400">safe for localhost</span> and is already included in the connection string above.
                      </p>
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <button
                      type="button"
                      onClick={() => setShowDBeaverInstructions(!showDBeaverInstructions)}
                      className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <ExternalLink className="h-3 w-3" />
                        DBeaver Connection Instructions
                      </span>
                      {showDBeaverInstructions ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                    {showDBeaverInstructions && (
                      <div className="mt-3 space-y-2 text-[10px] text-muted-foreground">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-foreground">Connection Parameters:</p>
                            <button
                              type="button"
                              onClick={async () => {
                                // @ts-expect-error - Electron IPC types not available
                                const actualPassword = await window.electron?.getPassword?.(database.id) || password || ""
                                const dbName = database.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63)
                                let paramsText = `Host: localhost\nPort: ${port}\n`
                                
                                if (database.type === "mysql" || database.type === "postgresql") {
                                  paramsText += `Database: ${dbName}\n`
                                  paramsText += `Username: ${database.username}\n`
                                  paramsText += `Password: ${actualPassword || "[Enter your password]"}\n`
                                } else if (database.type === "mongodb") {
                                  paramsText += `Database: ${dbName}\n`
                                  if (database.username) {
                                    paramsText += `Username: ${database.username}\n`
                                    paramsText += `Password: ${actualPassword || "[Enter your password]"}\n`
                                  }
                                }
                                
                                if (database.type === "mysql") {
                                  paramsText += `\nDriver Property:\nallowPublicKeyRetrieval=true`
                                }
                                
                                navigator.clipboard.writeText(paramsText).then(() => {
                                  toast.success("DBeaver connection parameters copied")
                                }).catch(() => {
                                  toast.error("Failed to copy parameters")
                                })
                              }}
                              className="text-[10px] text-primary hover:underline"
                            >
                              Copy all
                            </button>
                          </div>
                          <div className="bg-background/50 rounded p-2 space-y-1 font-mono text-xs">
                            <div><span className="text-muted-foreground">Host:</span> localhost</div>
                            <div><span className="text-muted-foreground">Port:</span> {port}</div>
                            {database.type === "mysql" && (
                              <>
                                <div><span className="text-muted-foreground">Database:</span> {database.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63)}</div>
                                <div><span className="text-muted-foreground">Username:</span> {database.username}</div>
                                <div><span className="text-muted-foreground">Password:</span> [Check password field above]</div>
                              </>
                            )}
                            {database.type === "postgresql" && (
                              <>
                                <div><span className="text-muted-foreground">Database:</span> {database.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63)}</div>
                                <div><span className="text-muted-foreground">Username:</span> {database.username}</div>
                                <div><span className="text-muted-foreground">Password:</span> [Check password field above]</div>
                              </>
                            )}
                            {database.type === "mongodb" && (
                              <>
                                <div><span className="text-muted-foreground">Database:</span> {database.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63)}</div>
                                {database.username && (
                                  <>
                                    <div><span className="text-muted-foreground">Username:</span> {database.username}</div>
                                    <div><span className="text-muted-foreground">Password:</span> [Check password field above]</div>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {database.type === "mysql" && (
                          <div className="space-y-1.5">
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">Why is this needed?</p>
                              <p className="text-[10px] leading-relaxed">
                                MySQL 8.0+ uses <span className="font-mono bg-background/50 px-1 rounded">caching_sha2_password</span> authentication by default. This plugin uses RSA public key encryption to securely transmit passwords. The client needs the server&apos;s public key to encrypt your password. <span className="font-mono bg-background/50 px-1 rounded">allowPublicKeyRetrieval=true</span> allows the client to request this key during connection. This is <span className="text-green-600 dark:text-green-400">safe for localhost connections</span> (like your LiquiDB instances).
                              </p>
                            </div>
                            <div className="space-y-1">
                              <p className="font-medium text-foreground">MySQL 8.0+ Connection Fix:</p>
                              <ol className="list-decimal list-inside space-y-1 ml-2">
                                <li>In DBeaver, open the connection settings</li>
                                <li>Go to <span className="font-mono bg-background/50 px-1 rounded">Driver properties</span> tab</li>
                                <li>Add property: <span className="font-mono bg-background/50 px-1 rounded">allowPublicKeyRetrieval</span> = <span className="font-mono bg-background/50 px-1 rounded">true</span></li>
                                <li>Or use the <span className="font-mono bg-background/50 px-1 rounded">Main</span> tab and check <span className="font-mono bg-background/50 px-1 rounded">Allow public key retrieval</span> if available</li>
                              </ol>
                            </div>
                          </div>
                        )}
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">Steps:</p>
                          <ol className="list-decimal list-inside space-y-1 ml-2">
                            <li>Open DBeaver and click <span className="font-mono bg-background/50 px-1 rounded">New Database Connection</span></li>
                            <li>Select <span className="font-mono bg-background/50 px-1 rounded">{database.type === "mysql" ? "MySQL" : database.type === "postgresql" ? "PostgreSQL" : database.type === "mongodb" ? "MongoDB" : "Redis"}</span> from the list</li>
                            <li>Enter the connection parameters above</li>
                            {database.type === "mysql" && <li>Enable <span className="font-mono bg-background/50 px-1 rounded">allowPublicKeyRetrieval</span> as described above</li>}
                            <li>Click <span className="font-mono bg-background/50 px-1 rounded">Test Connection</span> to verify</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced" className="space-y-3 pt-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Container ID</Label>
                  <Input value={database.containerId} disabled className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Version</Label>
                  <Input value={database.version} disabled className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Created</Label>
                  <Input value={new Date(database.createdAt).toLocaleString()} disabled className="h-8 text-sm" />
                </div>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExport}
                    disabled={isExporting}
                    onMouseEnter={() => !isExporting && downloadIconRef.current?.startAnimation()}
                    onMouseLeave={() => !isExporting && downloadIconRef.current?.stopAnimation()}
                    className="w-full transition-all duration-200 bg-transparent"
                  >
                    {isExporting ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <DownloadIcon ref={downloadIconRef} className="mr-2" size={16} />
                        Export Database
                      </>
                    )}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="danger" className="space-y-3 pt-3">
                <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-destructive">Delete Database</h4>
                      <p className="text-xs text-muted-foreground">
                        Permanently remove this database instance. This action cannot be undone. All data,
                        configurations, and container information will be deleted.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteClick}
                    className="w-full transition-all duration-200"
                  >
                    Delete Database
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} size="sm">
              Cancel <Kbd>Esc</Kbd>
            </Button>
            <Button onClick={handleSave} size="sm">
              Save Changes <Kbd>⏎</Kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IconPickerDialog
        open={iconPickerOpen}
        onOpenChange={setIconPickerOpen}
        currentIcon={selectedIcon}
        onSave={setSelectedIcon}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{database.name}</span> and remove all of its
              data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
