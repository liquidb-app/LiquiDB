"use client"

import { useState, useEffect } from "react"
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
import { AlertTriangle, Download } from "lucide-react"
import { IconPickerDialog } from "@/components/icon-picker-dialog"
import { BoxesIcon } from "@/components/ui/boxes"
import type { DatabaseContainer } from "@/lib/types"

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

interface DatabaseSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  database: DatabaseContainer
  onUpdate: (database: DatabaseContainer) => void
  onDelete: (id: string) => void
  allDatabases?: DatabaseContainer[]
}

const DEFAULT_ICONS = ["🐘", "🐬", "🍃", "🔴", "💾", "🗄️", "📊", "🔷", "🟦", "🟪", "🟩", "🟨", "🟧", "🟥"]

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
  const [username, setUsername] = useState(database.username)
  const [password, setPassword] = useState("")
  const [autoStart, setAutoStart] = useState(false)
  const [selectedIcon, setSelectedIcon] = useState(database.icon || "")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [autoStartConflict, setAutoStartConflict] = useState<string | null>(null)

  // Function to validate name length
  const validateName = (nameValue: string) => {
    if (nameValue.length > MAX_NAME_LENGTH) {
      setNameError(`Name must be ${MAX_NAME_LENGTH} characters or less`)
      return false
    }
    setNameError("")
    return true
  }

  // Function to handle name change with validation
  const handleNameChange = (value: string) => {
    // Truncate if too long
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
    setPassword("") // Don't show existing password
    setSelectedIcon(database.icon || "")
    setAutoStart(database.autoStart || false)
    setAutoStartConflict(null)
  }, [database])

  // Check for port conflicts when enabling auto-start
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

  const handleCancel = () => {
    // Reset local state to original database values
    setName(database.name)
    setPort(database.port.toString())
    setUsername(database.username)
    setPassword("")
    setSelectedIcon(database.icon || "")
    setAutoStart(database.autoStart || false)
    setAutoStartConflict(null)
    onOpenChange(false)
  }

  const handleSave = () => {
    // Validate name length
    if (!validateName(name)) {
      return
    }

    const portNum = Number.parseInt(port)
    const checkAndSave = async () => {
      // Only check port availability if the port has changed
      if (portNum !== database.port) {
        // @ts-ignore
        if (window.electron?.checkPort) {
          // @ts-ignore
          const res = await window.electron.checkPort(portNum)
          if (!res?.available) {
            alert(
              res?.reason === "banned"
                ? "This port is banned in settings. Choose another."
                : res?.reason === "privileged"
                  ? "Privileged port (<1024) not allowed."
                  : res?.reason === "invalid_range"
                    ? "Port must be between 1 and 65535."
                    : "Port is in use or unavailable."
            )
            return
          }
        }
      }
      const updated = {
        ...database,
        name,
        port: portNum,
        username,
        password: password || database.password, // Keep existing password if not changed
        icon: selectedIcon,
        autoStart,
      }
      // @ts-ignore
      if (window.electron?.saveDatabase) {
        // @ts-ignore
        await window.electron.saveDatabase(updated)
      }
      onUpdate(updated)
    }
    checkAndSave()
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    // Small delay to ensure AlertDialog overlay is removed before closing parent dialog
    setTimeout(() => {
      onDelete(database.id)
    }, 100)
  }

  const handleExport = () => {
    // Placeholder for export functionality
    console.log("Exporting database:", database.name)
  }

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
                  <Input
                    id="edit-port"
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Auto-start on boot</Label>
                    <p className="text-xs text-muted-foreground">Start this database automatically</p>
                    {autoStartConflict && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Port conflict with "{autoStartConflict}" - change port first
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
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-8 text-sm"
                  />
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
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs">Auto-start on boot</Label>
                    <p className="text-xs text-muted-foreground">Start this database when LiquiDB launches</p>
                    {autoStartConflict && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Port conflict with "{autoStartConflict}" - change port first
                      </p>
                    )}
                  </div>
                  <Switch 
                    checked={autoStart} 
                    onCheckedChange={handleAutoStartToggle}
                    disabled={autoStartConflict !== null}
                  />
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs font-medium mb-1.5">Connection String</p>
                  <code className="text-xs break-all">
                    {database.type}://{username}:****@localhost:{port}
                  </code>
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
                    className="w-full transition-all duration-200 hover:scale-105 active:scale-95 bg-transparent"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Database
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
                    className="w-full transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    Delete Database
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancel} size="sm">
              Cancel
            </Button>
            <Button onClick={handleSave} size="sm">
              Save Changes
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
