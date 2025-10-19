"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Monitor, Moon, Sun, Github, ExternalLink, Globe, Ban, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BannedPortsDialog } from "./banned-ports-dialog"
import { toast } from "sonner"
import { notifications, notifySuccess, notifyError, notifyInfo, notifyWarning } from "@/lib/notifications"

interface AppSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const colorSchemes = [
  {
    value: "mono",
    label: "Monochrome",
    lightPreview: "bg-gradient-to-r from-gray-300 to-gray-500",
    darkPreview: "bg-gradient-to-r from-gray-600 to-gray-800",
  },
  {
    value: "blue",
    label: "Blue",
    lightPreview: "bg-gradient-to-r from-blue-400 to-blue-600",
    darkPreview: "bg-gradient-to-r from-blue-500 to-blue-700",
  },
  {
    value: "green",
    label: "Green",
    lightPreview: "bg-gradient-to-r from-green-400 to-green-600",
    darkPreview: "bg-gradient-to-r from-green-500 to-green-700",
  },
  {
    value: "purple",
    label: "Purple",
    lightPreview: "bg-gradient-to-r from-purple-400 to-purple-600",
    darkPreview: "bg-gradient-to-r from-purple-500 to-purple-700",
  },
  {
    value: "orange",
    label: "Orange",
    lightPreview: "bg-gradient-to-r from-orange-400 to-orange-600",
    darkPreview: "bg-gradient-to-r from-orange-500 to-orange-700",
  },
]

export function AppSettingsDialog({ open, onOpenChange }: AppSettingsDialogProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [autoStart, setAutoStart] = useState(false)
  const [notifications, setNotifications] = useState(true)
  const [colorScheme, setColorScheme] = useState("mono")
  const [mounted, setMounted] = useState(false)
  const [bannedPortsOpen, setBannedPortsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false)
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false)
  

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("color-scheme") || "mono"
    setColorScheme(saved)
    document.documentElement.setAttribute("data-color-scheme", saved)
    
    // Load notification setting
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        if (notifications && typeof (notifications as any).areNotificationsEnabled === 'function') {
          const enabled = (notifications as any).areNotificationsEnabled()
          setNotifications(enabled)
        } else {
          // Fallback to localStorage directly
          const saved = localStorage.getItem("notifications-enabled")
          setNotifications(saved !== null ? JSON.parse(saved) : true)
        }
      } else {
        // Server-side rendering, default to enabled
        setNotifications(true)
      }
    } catch (error) {
      console.error("Failed to load notification setting:", error)
      setNotifications(true) // Default to enabled
    }
    
    // Check auto-launch status
    checkAutoLaunchStatus()
  }, [])
  

  const checkAutoLaunchStatus = async () => {
    try {
      // @ts-ignore
      const enabled = await window.electron?.isAutoLaunchEnabled?.()
      setAutoLaunchEnabled(enabled || false)
    } catch (error) {
      console.error("Failed to check auto-launch status:", error)
    }
  }

  const handleAutoLaunchToggle = async (enabled: boolean) => {
    setAutoLaunchLoading(true)
    try {
      if (enabled) {
        // @ts-ignore
        const result = await window.electron?.enableAutoLaunch?.()
        if (result?.success) {
          setAutoLaunchEnabled(true)
          notifySuccess("Auto-launch enabled", {
            description: "LiquiDB will now start automatically when you log in.",
          })
        } else {
          notifyError("Failed to enable auto-launch", {
            description: result?.error || "Please check system permissions.",
          })
        }
      } else {
        // @ts-ignore
        const result = await window.electron?.disableAutoLaunch?.()
        if (result?.success) {
          setAutoLaunchEnabled(false)
          notifySuccess("Auto-launch disabled", {
            description: "LiquiDB will no longer start automatically.",
          })
        } else {
          notifyError("Failed to disable auto-launch", {
            description: result?.error || "Please check system permissions.",
          })
        }
      }
    } catch (error) {
      notifyError("Failed to update auto-launch setting", {
        description: "Could not connect to system service.",
      })
    } finally {
      setAutoLaunchLoading(false)
    }
  }

  const handleColorSchemeChange = (value: string) => {
    setColorScheme(value)
    localStorage.setItem("color-scheme", value)
    document.documentElement.setAttribute("data-color-scheme", value)
  }

  // Preview handlers that apply changes immediately
  const handleThemePreview = (newTheme: string) => {
    setTheme(newTheme) // Apply immediately for preview
  }

  const handleColorSchemePreview = (newColorScheme: string) => {
    setColorScheme(newColorScheme) // Apply immediately for preview
    localStorage.setItem("color-scheme", newColorScheme)
    document.documentElement.setAttribute("data-color-scheme", newColorScheme)
  }

  const handleNotificationToggle = (enabled: boolean) => {
    setNotifications(enabled)
    
    // Check if we're in a browser environment
    if (typeof window !== 'undefined') {
      if (notifications && typeof (notifications as any).setNotificationsEnabled === 'function') {
        ;(notifications as any).setNotificationsEnabled(enabled)
        
        // Force reload the setting to ensure it's updated
        if (typeof (notifications as any).reloadNotificationSetting === 'function') {
          ;(notifications as any).reloadNotificationSetting()
        }
        
        // Show a notification about the setting change (this will respect the new setting)
        if (enabled) {
          ;(notifications as any).success("Notifications enabled", {
            description: "You'll now receive toast notifications for database events.",
          })
        } else {
          // Use direct toast for this one since we want to show it even when disabling
          toast.info("Notifications disabled", {
            description: "Toast notifications are now disabled.",
          })
        }
      } else {
        try {
          localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
        } catch (error) {
          console.error("Failed to save notification setting:", error)
        }
      }
    }
  }

  const handleOpenExternalLink = async (url: string) => {
    try {
      // @ts-ignore
      const result = await window.electron?.openExternalLink?.(url)
      if (!result?.success) {
        notifyError("Failed to open link", {
          description: result?.error || "Could not open the link in your default browser.",
        })
      }
    } catch (error) {
      notifyError("Failed to open link", {
        description: "Could not open the link in your default browser.",
      })
    }
  }


  const isDark = mounted && resolvedTheme === "dark"

  const handleDeleteAllDatabases = async () => {
    setDeleting(true)
    try {
      // @ts-ignore
      const result = await window.electron?.deleteAllDatabases?.()
      if (result?.success) {
        notifySuccess("All databases deleted", {
          description: "All databases and their data have been permanently removed.",
        })
        setDeleteConfirmOpen(false)
        onOpenChange(false)
        // Reload the page to refresh the database list
        window.location.reload()
      } else {
        notifyError("Failed to delete databases", {
          description: result?.error || "Unknown error occurred",
        })
      }
    } catch (error) {
      notifyError("Failed to delete databases", {
        description: "Could not connect to database service",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] !top-[15vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle>App Settings</DialogTitle>
            <DialogDescription>Configure LiquiDB preferences and behavior</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="appearance" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>

            <div className="min-h-[200px] max-h-[500px] overflow-y-auto">
              <TabsContent value="appearance" className="space-y-4 pt-4 mt-0">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select value={theme || "system"} onValueChange={handleThemePreview}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">
                        <div className="flex items-center gap-2">
                          <Sun className="h-4 w-4" />
                          Light
                        </div>
                      </SelectItem>
                      <SelectItem value="dark">
                        <div className="flex items-center gap-2">
                          <Moon className="h-4 w-4" />
                          Dark
                        </div>
                      </SelectItem>
                      <SelectItem value="system">
                        <div className="flex items-center gap-2">
                          <Monitor className="h-4 w-4" />
                          System
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose your preferred theme or sync with system settings
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Color Scheme</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {colorSchemes.map((scheme) => (
                      <button
                        key={scheme.value}
                        onClick={() => handleColorSchemePreview(scheme.value)}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-md border-2 transition-colors ${
                          colorScheme === scheme.value
                            ? "border-primary bg-accent"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div className={`w-full h-8 rounded ${isDark ? scheme.darkPreview : scheme.lightPreview}`} />
                        <span className="text-[10px] font-medium">{scheme.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Select a color scheme for the interface</p>
                </div>
              </TabsContent>

              <TabsContent value="general" className="space-y-4 pt-4 mt-0">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Launch at startup</Label>
                    <p className="text-xs text-muted-foreground">
                      Start LiquiDB when you log in
                      {autoLaunchLoading && " (Updating...)"}
                    </p>
                  </div>
                  <Switch 
                    checked={autoLaunchEnabled} 
                    onCheckedChange={handleAutoLaunchToggle}
                    disabled={autoLaunchLoading}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Notifications</Label>
                    <p className="text-xs text-muted-foreground">Show toast notifications for database events</p>
                  </div>
                  <Switch checked={notifications} onCheckedChange={handleNotificationToggle} />
                </div>

                <div className="space-y-2">
                  <Label>Port Management</Label>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-transparent"
                    onClick={() => setBannedPortsOpen(true)}
                  >
                    <Ban className="h-4 w-4 mr-2" />
                    Banned Ports
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Manage ports that cannot be used for database instances
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Danger Zone</Label>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-transparent border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Databases
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete all databases and their data. This action cannot be undone.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="about" className="space-y-4 pt-4 mt-0">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Version</Label>
                    <p className="text-sm font-mono">1.0.0</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Platform</Label>
                    <p className="text-sm">macOS (Electron)</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">License</Label>
                    <p className="text-sm">MIT</p>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    LiquiDB is a modern database management application for macOS developers. Built with Electron,
                    React, and Tailwind CSS.
                  </p>
                </div>
                <div className="pt-4 border-t space-y-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-transparent"
                    onClick={() => handleOpenExternalLink("https://github.com/alexg-sh/LiquiDB")}
                  >
                    <Github className="h-4 w-4 mr-2" />
                    View on GitHub
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start bg-transparent"
                    onClick={() => handleOpenExternalLink("https://liquidb.app")}
                  >
                    <Globe className="h-4 w-4 mr-2" />
                    Visit Website
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>
          
        </DialogContent>
      </Dialog>

      <BannedPortsDialog open={bannedPortsOpen} onOpenChange={setBannedPortsOpen} />

      {/* Delete All Databases Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete All Databases
            </DialogTitle>
            <DialogDescription>
              This action will permanently delete ALL databases and their data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive font-medium">
                ⚠️ Warning: This will delete:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• All database instances</li>
                <li>• All database data files and configurations</li>
                <li>• All stored passwords</li>
                <li>• All auto-start settings</li>
                <li>• All database data directories (/tmp/liquidb-*)</li>
              </ul>
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAllDatabases}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete All"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
