"use client"

import { useState, useEffect, useCallback } from "react"
import { log } from '../lib/logger'
import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Monitor, ExternalLink, Globe, Ban, AlertTriangle, Settings } from "lucide-react"
import { DeleteIcon } from "@/components/ui/delete"
import { RotateCCWIcon } from "@/components/ui/rotate-ccw"
import { GithubIcon } from "@/components/ui/github"
import { PlayIcon } from "@/components/ui/play"
import { SunIcon, type SunIconHandle } from "@/components/ui/sun"
import { MoonIcon, type MoonIconHandle } from "@/components/ui/moon"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"
import { Button } from "@/components/ui/button"
import { BannedPortsDialog } from "./banned-ports-dialog"
import { toast } from "sonner"
import { notifications as notificationManager, notifySuccess, notifyError, updateNotificationSetting } from "@/lib/notifications"

interface AppSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleteAll?: () => Promise<void>
}

const colorSchemes = [
  {
    value: "mono",
    label: "Monochrome",
    lightPreview: "bg-gradient-to-r from-gray-300 via-gray-400 to-gray-500 gradient-animate",
    darkPreview: "bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 gradient-animate",
  },
  {
    value: "blue",
    label: "Blue",
    lightPreview: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 gradient-flow",
    darkPreview: "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 gradient-flow",
  },
  {
    value: "green",
    label: "Green",
    lightPreview: "bg-gradient-to-r from-green-400 via-green-500 to-green-600 gradient-animate",
    darkPreview: "bg-gradient-to-r from-green-500 via-green-600 to-green-700 gradient-animate",
  },
  {
    value: "purple",
    label: "Purple",
    lightPreview: "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 gradient-flow",
    darkPreview: "bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 gradient-flow",
  },
  {
    value: "orange",
    label: "Orange",
    lightPreview: "bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 gradient-animate",
    darkPreview: "bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 gradient-animate",
  },
]

export function AppSettingsDialog({ open, onOpenChange, onDeleteAll }: AppSettingsDialogProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [notifications, setNotifications] = useState(true)
  const [colorScheme, setColorScheme] = useState("mono")
  const [mounted, setMounted] = useState(false)
  const [bannedPortsOpen, setBannedPortsOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [autoLaunchEnabled, setAutoLaunchEnabled] = useState(false)

  // Animated icon hover hooks
  const deleteIconHover = useAnimatedIconHover()
  const rotateIconHover = useAnimatedIconHover()
  const githubIconHover = useAnimatedIconHover()
  const playIconHover = useAnimatedIconHover()
  const sunIconHover = useAnimatedIconHover<SunIconHandle>()
  const moonIconHover = useAnimatedIconHover<MoonIconHandle>()
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false)
  
  // Helper service state
  const [helperStatus, setHelperStatus] = useState<{
    installed: boolean
    running: boolean
  } | null>(null)
  const [helperLoading, setHelperLoading] = useState(false)
  
  // Helper service functions - defined early for use in useEffect
  const loadHelperStatus = useCallback(async () => {
    // Only set loading if we don't have status yet
    const isInitialLoad = !helperStatus
    if (isInitialLoad) {
      setHelperLoading(true)
    }
    
    try {
      console.log("Loading helper status...")
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.getHelperStatus?.()
      console.log("Helper status result:", result)
      
      if (result?.success && result.data) {
        const status = result.data
        console.log("Helper status data:", status)
        
        // Always clear loading state after first check
        if (isInitialLoad) {
          setHelperLoading(false)
        }
        
        // Only update if the status has actually changed
        setHelperStatus(prevStatus => {
          if (!prevStatus || 
              prevStatus.installed !== status.installed || 
              prevStatus.running !== status.running) {
            console.log("Helper status changed, updating UI")
            return status
          }
          console.log("Helper status unchanged, skipping UI update")
          return prevStatus
        })
      } else {
        console.error("Helper status API failed:", result?.error)
        // Set a default status when API fails
        setHelperStatus({
          installed: false,
          running: false
        })
        setHelperLoading(false)
      }
    } catch (error) {
      console.error("Failed to load helper status:", error)
      // Set a default status when there's an error
      setHelperStatus({
        installed: false,
        running: false
      })
      setHelperLoading(false)
    }
  }, [helperStatus])

  // Background status checking without UI updates
  const checkHelperStatusBackground = useCallback(async () => {
    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.getHelperStatus?.()
      
      if (result?.success && result.data) {
        const status = result.data
        
        // Only update if the status has actually changed
        setHelperStatus(prevStatus => {
          if (!prevStatus || 
              prevStatus.installed !== status.installed || 
              prevStatus.running !== status.running) {
            log.debug("Helper status changed in background, updating UI")
            return status
          }
          log.debug("Helper status unchanged in background, skipping UI update")
          return prevStatus
        })
      }
    } catch (error) {
      log.error("Background helper status check failed:", error)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("color-scheme") || "mono"
    setColorScheme(saved)
    document.documentElement.setAttribute("data-color-scheme", saved)
    
    // Load notification setting
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined') {
        if (notificationManager && typeof notificationManager.areNotificationsEnabled === 'function') {
          const enabled = notificationManager.areNotificationsEnabled()
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
    
    // Load helper service status only when dialog is open
    if (open) {
  loadHelperStatus()
    }
  }, [open, loadHelperStatus])
  
  // Background check helper status only when dialog is open
  useEffect(() => {
    if (!open) return
    
    // Load helper status immediately when dialog opens
    loadHelperStatus()
    
    // Background check helper status every 15 seconds (increased from 10s to save resources)
    const statusInterval = setInterval(checkHelperStatusBackground, 15000)
  
  return () => clearInterval(statusInterval)
  }, [open, loadHelperStatus, checkHelperStatusBackground])

  // Close child dialogs when parent dialog closes
  useEffect(() => {
    if (!open) {
      setBannedPortsOpen(false)
      setDeleteConfirmOpen(false)
    }
  }, [open])
  

  const checkAutoLaunchStatus = async () => {
    try {
      // @ts-expect-error - Electron IPC types not available
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
        // @ts-expect-error - Electron IPC types not available
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
        // @ts-expect-error - Electron IPC types not available
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
    } catch {
      notifyError("Failed to update auto-launch setting", {
        description: "Could not connect to system service.",
      })
    } finally {
      setAutoLaunchLoading(false)
    }
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
    
    // Update notification setting using the new system
    updateNotificationSetting(enabled)
    
    // Show a notification about the setting change (this will respect the new setting)
    if (enabled) {
      notifySuccess("Notifications enabled", {
        description: "You'll now receive toast notifications for database events.",
      })
    } else {
      // Use direct toast for this one since we want to show it even when disabling
      toast.info("Notifications disabled", {
        description: "Toast notifications are now disabled.",
      })
    }
  }

  const handleOpenExternalLink = async (url: string) => {
    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.openExternalLink?.(url)
      if (!result?.success) {
        notifyError("Failed to open link", {
          description: result?.error || "Could not open the link in your default browser.",
        })
      }
    } catch {
      notifyError("Failed to open link", {
        description: "Could not open the link in your default browser.",
      })
    }
  }


  const isDark = mounted && resolvedTheme === "dark"

  const handleDeleteAllDatabases = async () => {
    setDeleting(true)
    setDeleteConfirmOpen(false)
    onOpenChange(false)
    
    try {
      // Use the animation callback if provided, otherwise use the old method
      if (onDeleteAll) {
        await onDeleteAll()
      } else {
        // @ts-expect-error - Electron IPC types not available
        const result = await window.electron?.deleteAllDatabases?.()
        if (result?.success) {
          notifySuccess("All databases deleted", {
            description: "All databases and their data have been permanently removed.",
          })
          // Reload the page to refresh the database list
          window.location.reload()
        } else {
          notifyError("Failed to delete databases", {
            description: result?.error || "Unknown error occurred",
          })
        }
      }
    } catch {
      notifyError("Failed to delete databases", {
        description: "Could not connect to database service",
      })
    } finally {
      setDeleting(false)
    }
  }


  const handleHelperAction = async (action: 'install' | 'start' | 'cleanup') => {
    setHelperLoading(true)
    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.[`${action}Helper`]?.()
      if (result?.success) {
        const method = result.data?.method === 'direct' ? ' (direct cleanup)' : ''
        const cleanedCount = result.data?.cleanedCount
        const message = action === 'cleanup' 
          ? `Cleanup completed successfully${method}${cleanedCount ? ` - ${cleanedCount} processes cleaned` : ''}`
          : action === 'install'
          ? 'Helper service installed successfully'
          : `Helper service ${action}ed successfully`
        notifySuccess(message)
        // Refresh status immediately after action
        await loadHelperStatus()
        // Also refresh again after a short delay to ensure status is accurate
        setTimeout(checkHelperStatusBackground, 1000)
      } else {
        const errorMessage = result?.error || "Unknown error occurred"
        const isSocketError = errorMessage.includes('ECONNREFUSED') || errorMessage.includes('socket not found')
        const description = isSocketError 
          ? "Helper service is not running. Try starting the service first."
          : errorMessage
        notifyError(`Failed to ${action} helper service`, {
          description,
        })
      }
    } catch {
      notifyError(`Failed to ${action} helper service`, {
        description: "Could not connect to helper service",
      })
    } finally {
      setHelperLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Close all child dialogs when parent closes
      setBannedPortsOpen(false)
      setDeleteConfirmOpen(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[500px] !top-[15vh] !translate-y-0">
          <DialogHeader>
            <DialogTitle>App Settings</DialogTitle>
            <DialogDescription>Configure LiquiDB preferences and behavior</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="appearance" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="helper">Helper Service</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>

            <div className="min-h-[200px] max-h-[500px] overflow-y-auto">
              <TabsContent value="appearance" className="space-y-4 pt-4 mt-0">
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="space-y-1">
                    <div
                      className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent rounded-sm"
                      onClick={() => handleThemePreview("light")}
                      onMouseEnter={sunIconHover.onMouseEnter}
                      onMouseLeave={sunIconHover.onMouseLeave}
                    >
                      <div className="flex items-center gap-2">
                        <SunIcon ref={sunIconHover.iconRef} size={16} />
                        <span>Light</span>
                      </div>
                      {theme === "light" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    
                    <div
                      className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent rounded-sm"
                      onClick={() => handleThemePreview("dark")}
                      onMouseEnter={moonIconHover.onMouseEnter}
                      onMouseLeave={moonIconHover.onMouseLeave}
                    >
                      <div className="flex items-center gap-2">
                        <MoonIcon ref={moonIconHover.iconRef} size={16} />
                        <span>Dark</span>
                      </div>
                      {theme === "dark" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    
                    <div
                      className="flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent rounded-sm"
                      onClick={() => handleThemePreview("system")}
                    >
                      <div className="flex items-center gap-2">
                        <Monitor className="h-4 w-4" />
                        <span>System</span>
                      </div>
                      {(theme === "system" || !theme) && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                  </div>
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
                    onMouseEnter={deleteIconHover.onMouseEnter}
                    onMouseLeave={deleteIconHover.onMouseLeave}
                  >
                    <DeleteIcon ref={deleteIconHover.iconRef} size={16} />
                    Delete All Databases
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Permanently delete all databases and their data. This action cannot be undone.
                  </p>
                </div>
              </TabsContent>


              <TabsContent value="helper" className="space-y-4 pt-4 mt-0">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Background Helper Service</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      The helper service runs in the background to monitor database processes and prevent port conflicts. It automatically starts when the app launches and continues running to ensure database management.
                    </p>
                  </div>
                  
                  
                  {helperLoading && (
                    <div className="text-center py-8">
                      <Settings className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading helper service status...</p>
                    </div>
                  )}
                  
                  {!helperLoading && !helperStatus && (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-8 w-8 mx-auto text-yellow-500 mb-4" />
                      <h3 className="text-lg font-semibold text-foreground mb-2">Helper Service Not Available</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        The helper service is not initialized or installed. This service provides advanced features like port monitoring and system integration.
                      </p>
                      <div className="space-y-2">
                        <Button 
                          onClick={() => handleHelperAction('install')}
                          disabled={helperLoading}
                          className="w-full"
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Install Helper Service
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          This will install the background service for advanced features
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {!helperLoading && helperStatus && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 rounded-full ${helperStatus.running ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                          <div>
                            <p className="font-medium text-foreground">
                              {helperStatus.installed ? 'Helper Service Installed' : 'Helper Service Not Installed'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {helperStatus.running ? 'Service is running' : helperStatus.installed ? 'Service is stopped' : 'Service is not installed'}
                            </p>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          {!helperStatus.installed && (
                            <Button 
                              onClick={() => handleHelperAction('install')}
                              disabled={helperLoading}
                              size="sm"
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Install
                            </Button>
                          )}
                          {helperStatus.installed && !helperStatus.running && (
                            <Button 
                              onClick={() => handleHelperAction('start')}
                              disabled={helperLoading}
                              size="sm"
                              onMouseEnter={playIconHover.onMouseEnter}
                              onMouseLeave={playIconHover.onMouseLeave}
                            >
                              <PlayIcon ref={playIconHover.iconRef} size={16} />
                              Start
                            </Button>
                          )}
                          {helperStatus.running && (
                            <Button 
                              onClick={() => handleHelperAction('cleanup')}
                              disabled={helperLoading}
                              size="sm"
                              variant="outline"
                              onMouseEnter={rotateIconHover.onMouseEnter}
                              onMouseLeave={rotateIconHover.onMouseLeave}
                            >
                              <RotateCCWIcon ref={rotateIconHover.iconRef} size={16} />
                              Cleanup
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {helperStatus.running && (
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" style={{ minWidth: '8px', minHeight: '8px' }}></div>
                            <p className="text-sm text-green-700 dark:text-green-300">
                              The helper service is automatically managing database processes in the background.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                    onMouseEnter={githubIconHover.onMouseEnter}
                    onMouseLeave={githubIconHover.onMouseLeave}
                  >
                    <GithubIcon ref={githubIconHover.iconRef} size={16} />
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

      {open && (
        <>
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
      )}
    </>
  )
}
