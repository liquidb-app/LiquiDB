"use client"

import { useState, useEffect, useCallback } from "react"
import { log } from '../lib/logger'
import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Monitor, ExternalLink, Globe, Ban, AlertTriangle, Settings, Copy } from "lucide-react"
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

  const deleteIconHover = useAnimatedIconHover()
  const rotateIconHover = useAnimatedIconHover()
  const githubIconHover = useAnimatedIconHover()
  const playIconHover = useAnimatedIconHover()
  const sunIconHover = useAnimatedIconHover<SunIconHandle>()
  const moonIconHover = useAnimatedIconHover<MoonIconHandle>()
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false)
  
  const [helperStatus, setHelperStatus] = useState<{
    installed: boolean
    running: boolean
  } | null>(null)
  const [helperLoading, setHelperLoading] = useState(false)
  const [mcpConnectionInfo, setMcpConnectionInfo] = useState<{
    name: string
    command: string
    args: string[]
    description: string
    isDevelopment: boolean
  } | null>(null)
  
  const loadHelperStatus = useCallback(async () => {
    const isInitialLoad = !helperStatus
    if (isInitialLoad) {
      setHelperLoading(true)
    }
    
    try {
      console.log("Loading helper status...")
      const result = await window.electron?.getHelperStatus?.()
      console.log("Helper status result:", result)
      
      if (result?.success && result.data) {
        const status = result.data
        console.log("Helper status data:", status)
        
        if (isInitialLoad) {
          setHelperLoading(false)
        }
        
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
        setHelperStatus({
          installed: false,
          running: false
        })
        setHelperLoading(false)
      }
    } catch (error) {
      console.error("Failed to load helper status:", error)
      setHelperStatus({
        installed: false,
        running: false
      })
      setHelperLoading(false)
    }
  }, [helperStatus])

  const checkHelperStatusBackground = useCallback(async () => {
    try {
      const result = await window.electron?.getHelperStatus?.()
      
      if (result?.success && result.data) {
        const status = result.data
        
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

  const loadMCPConnectionInfo = useCallback(async () => {
    try {
      const result = await window.electron?.getMCPConnectionInfo?.()
      if (result?.success && result.data) {
        setMcpConnectionInfo(result.data)
      }
    } catch (error) {
      console.error("Failed to load MCP connection info:", error)
    }
  }, [])

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("color-scheme") || "mono"
    setColorScheme(saved)
    document.documentElement.setAttribute("data-color-scheme", saved)
    
    try {
      if (typeof window !== 'undefined') {
        if (notificationManager && typeof notificationManager.areNotificationsEnabled === 'function') {
          const enabled = notificationManager.areNotificationsEnabled()
          setNotifications(enabled)
        } else {
          const saved = localStorage.getItem("notifications-enabled")
          setNotifications(saved !== null ? JSON.parse(saved) : true)
        }
      } else {
        setNotifications(true)
      }
    } catch (error) {
      console.error("Failed to load notification setting:", error)
      setNotifications(true)
    }
    
    checkAutoLaunchStatus()
    
    if (open) {
      loadHelperStatus()
      loadMCPConnectionInfo()
    }
  }, [open, loadHelperStatus, loadMCPConnectionInfo])
  
  useEffect(() => {
    if (!open) return
    
    loadHelperStatus()
    
    const statusInterval = setInterval(checkHelperStatusBackground, 15000)
  
  return () => clearInterval(statusInterval)
  }, [open, loadHelperStatus, checkHelperStatusBackground])

  useEffect(() => {
    if (!open) {
      setBannedPortsOpen(false)
      setDeleteConfirmOpen(false)
    }
  }, [open])
  

  const checkAutoLaunchStatus = async () => {
    try {
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


  const handleThemePreview = (newTheme: string) => {
    setTheme(newTheme)
  }

  const handleColorSchemePreview = (newColorScheme: string) => {
    setColorScheme(newColorScheme)
    localStorage.setItem("color-scheme", newColorScheme)
    document.documentElement.setAttribute("data-color-scheme", newColorScheme)
  }

  const handleNotificationToggle = (enabled: boolean) => {
    setNotifications(enabled)
    
    updateNotificationSetting(enabled)
    
    if (enabled) {
      notifySuccess("Notifications enabled", {
        description: "You'll now receive toast notifications for database events.",
      })
    } else {
      toast.info("Notifications disabled", {
        description: "Toast notifications are now disabled.",
      })
    }
  }

  const handleOpenExternalLink = async (url: string) => {
    try {
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
      if (onDeleteAll) {
        await onDeleteAll()
      } else {
        const result = await window.electron?.deleteAllDatabases?.()
        if (result?.success) {
          notifySuccess("All databases deleted", {
            description: "All databases and their data have been permanently removed.",
          })
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
      let result: { success: boolean; data?: { method?: string; cleanedCount?: number; timestamp?: number }; error?: string } | undefined
      
      if (action === 'install') {
        result = await window.electron?.installHelper?.()
      } else if (action === 'start') {
        result = await window.electron?.startHelper?.()
      } else if (action === 'cleanup') {
        result = await window.electron?.cleanupHelper?.()
      }
      
      if (result?.success) {
        const method = result.data?.method === 'direct' ? ' (direct cleanup)' : ''
        const cleanedCount = result.data?.cleanedCount
        const message = action === 'cleanup' 
          ? `Cleanup completed successfully${method}${cleanedCount ? ` - ${cleanedCount} processes cleaned` : ''}`
          : action === 'install'
          ? 'Helper service installed successfully'
          : `Helper service ${action}ed successfully`
        notifySuccess(message)
        await loadHelperStatus()
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
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="appearance">Appearance</TabsTrigger>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="helper">Helper</TabsTrigger>
              <TabsTrigger value="mcp">MCP</TabsTrigger>
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

              <TabsContent value="mcp" className="space-y-4 pt-4 mt-0">
                <div className="space-y-4 min-w-0">
                  <div>
                    <Label>MCP Server</Label>
                    <p className="text-xs text-muted-foreground">
                      Connect to Cursor, Claude Desktop, and other MCP-compatible tools.
                    </p>
                  </div>

                  {mcpConnectionInfo && (
                    <>
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Label className="flex-shrink-0">Command</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs flex-shrink-0"
                            onClick={() => {
                              const command = `${mcpConnectionInfo.command} ${mcpConnectionInfo.args.join(' ')}`
                              navigator.clipboard.writeText(command)
                              notifySuccess("Command copied")
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                        </div>
                        <div className="p-3 border rounded-md bg-muted/50 min-w-0 overflow-hidden">
                          <code className="text-xs font-mono block break-all">
                            {mcpConnectionInfo.command} {mcpConnectionInfo.args.join(' ')}
                          </code>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Copy this command to configure MCP in your preferred tool
                        </p>
                      </div>

                      <div className="space-y-2 min-w-0">
                        <Label>Setup Guide</Label>
                        
                        <div className="border rounded-md overflow-hidden min-w-0">
                          <div className="px-3 py-3 space-y-3 min-w-0">
                            <div className="text-xs text-muted-foreground space-y-3 min-w-0">
                              <div className="space-y-3 min-w-0">
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="font-medium text-foreground flex-shrink-0">1.</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="block">Locate your MCP configuration. This varies by tool:</span>
                                    <ul className="mt-1.5 ml-4 space-y-1.5 list-disc min-w-0">
                                      <li className="min-w-0">
                                        <span className="block"><strong>Claude Desktop:</strong> Edit </span>
                                        <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all inline-block max-w-full mt-0.5">{`~/Library/Application Support/Claude/claude_desktop_config.json`}</code>
                                      </li>
                                      <li className="min-w-0">
                                        <strong>Cursor:</strong> Go to <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all">Settings → Features → MCP</code>
                                      </li>
                                      <li className="min-w-0">
                                        <strong>Other tools:</strong> Check your tool's MCP settings or configuration file
                                      </li>
                                    </ul>
                                  </div>
                                </div>
                                
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="font-medium text-foreground flex-shrink-0">2.</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="block">Add the LiquiDB MCP server configuration:</span>
                                    <div className="mt-2 space-y-3 min-w-0">
                                      <div className="min-w-0">
                                        <span className="text-[11px] font-medium block mb-1.5">For JSON configuration files (e.g., Claude Desktop):</span>
                                        <pre className="bg-muted px-3 py-2.5 rounded-md text-[11px] font-mono border border-border/50 break-all whitespace-pre-wrap max-w-full min-w-0">
{`"mcpServers": {
  "LiquiDB": {
    "command": "${mcpConnectionInfo.command}",
    "args": ${JSON.stringify(mcpConnectionInfo.args)}
  }
}`}
                                        </pre>
                                      </div>
                                      <div className="min-w-0">
                                        <span className="text-[11px] font-medium block mb-1.5">For UI-based configuration (e.g., Cursor):</span>
                                        <div className="space-y-1.5 min-w-0">
                                          <div className="flex items-start gap-2 min-w-0">
                                            <span className="text-[11px] flex-shrink-0 mt-0.5">Name:</span>
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all min-w-0 flex-1">LiquiDB</code>
                                          </div>
                                          <div className="flex items-start gap-2 min-w-0">
                                            <span className="text-[11px] mt-0.5 flex-shrink-0">Command:</span>
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all min-w-0 flex-1">{mcpConnectionInfo.command}</code>
                                          </div>
                                          <div className="flex items-start gap-2 min-w-0">
                                            <span className="text-[11px] mt-0.5 flex-shrink-0">Args:</span>
                                            <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono break-all min-w-0 flex-1">{mcpConnectionInfo.args.join(' ')}</code>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-start gap-2 min-w-0">
                                  <span className="font-medium text-foreground flex-shrink-0">3.</span>
                                  <div className="flex-1 min-w-0">
                                    <span className="block">Restart your application to apply the changes</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {!mcpConnectionInfo && (
                    <div className="text-center py-8">
                      <Settings className="h-6 w-6 mx-auto text-muted-foreground mb-2 animate-spin" />
                      <p className="text-xs text-muted-foreground">Loading MCP connection info...</p>
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
