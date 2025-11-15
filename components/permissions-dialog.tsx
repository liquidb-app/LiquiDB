"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  ExternalLink, 
  Settings, 
  Shield, 
  Search,
  HardDrive,
  Globe,
  Folder,
  Cog,
  Lock,
  RefreshCw
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Permission {
  name: string
  description: string
  why: string
  icon: string
  critical: boolean
  granted: boolean
  error?: string
}

interface PermissionsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  permissions: Permission[]
  onRetry: () => void
  onSkip: () => void
  onOpenSettings: () => void
  onOpenPermissionPage: (permissionType: string) => void
  onRequestCritical: () => void
}

// Icon mapping for permissions
const iconMap: { [key: string]: React.ComponentType<{ className?: string }> } = {
  '🔍': Search,
  '💾': HardDrive,
  '🌐': Globe,
  '📁': Folder,
  '⚙️': Cog,
  '🔐': Lock,
}

function getIconComponent(icon: string) {
  const IconComponent = iconMap[icon] || Shield
  return <IconComponent className="h-5 w-5" />
}

export function PermissionsDialog({ 
  open, 
  onOpenChange, 
  permissions, 
  onRetry, 
  onSkip, 
  onOpenSettings,
  onOpenPermissionPage,
  onRequestCritical
}: PermissionsDialogProps) {
  const [isRetrying, setIsRetrying] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)

  const criticalPermissions = permissions.filter(p => p.critical)
  const optionalPermissions = permissions.filter(p => !p.critical)
  const missingCritical = criticalPermissions.filter(p => !p.granted)
  const missingOptional = optionalPermissions.filter(p => !p.granted)
  const grantedPermissions = permissions.filter(p => p.granted)

  // Get platform-specific instructions
  const platform = typeof window !== 'undefined' && window.electron?.platform
  const isMac = platform === 'darwin'

  const getPlatformInstructions = () => {
    if (isMac) {
      return "You can change these permissions later in System Preferences → Security & Privacy → Privacy"
    }
    return "You can change these permissions later in your system settings"
  }

  const getSettingsButtonText = () => {
    if (isMac) {
      return "System Preferences"
    }
    return "Settings"
  }

  const handleRetry = useCallback(async () => {
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }, [onRetry])

  const handleRequestCritical = useCallback(async () => {
    setIsRequesting(true)
    try {
      await onRequestCritical()
      // Re-check after requesting
      setTimeout(() => {
        onRetry()
      }, 2000)
    } finally {
      setIsRequesting(false)
    }
  }, [onRequestCritical, onRetry])

  const handleOpenSettings = () => {
    onOpenSettings()
    const settingsName = isMac ? "System Preferences" : "System Settings"
    toast.info(`Opening ${settingsName}...`, {
      description: "Please grant the required permissions and return to LiquiDB."
    })
  }

  const handleOpenPermissionPage = useCallback(async (permissionType: string) => {
    await onOpenPermissionPage(permissionType)
    // Re-check permissions after opening settings
    setTimeout(() => {
      onRetry()
    }, 2000)
  }, [onOpenPermissionPage, onRetry])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          if (missingCritical.length === 0) {
            onSkip()
          }
          break
        case 'r':
        case 'R':
          event.preventDefault()
          if (!isRetrying) {
            handleRetry()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onSkip, handleRetry, isRetrying, missingCritical.length])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-3 pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 dark:bg-blue-500/20">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <span>Required Permissions</span>
          </DialogTitle>
          <DialogDescription className="text-base">
            LiquiDB needs certain permissions to function properly. Please review and grant the permissions below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Critical Permissions Section */}
          {missingCritical.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-semibold">Critical Permissions Required</h3>
                <Badge variant="destructive" className="ml-auto">{missingCritical.length} Required</Badge>
              </div>
              
              <Alert className="border-red-500/50 bg-red-500/10 dark:bg-red-500/5">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <AlertDescription className="text-sm">
                  These permissions are required for LiquiDB to function properly. The app may not work correctly without them.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {missingCritical.map((permission, index) => (
                  <Card 
                    key={index} 
                    className={cn(
                      "border-red-500/30 bg-red-500/5 dark:bg-red-500/5",
                      "hover:border-red-500/50 transition-colors"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-red-500/10 dark:bg-red-500/20 flex-shrink-0">
                          {getIconComponent(permission.icon)}
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-base">{permission.name}</h4>
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                            <XCircle className="h-4 w-4 text-red-500 ml-auto flex-shrink-0" />
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {permission.description}
                          </p>
                          <p className="text-xs text-muted-foreground/80 leading-relaxed">
                            {permission.why}
                          </p>
                          {permission.error && (
                            <div className="mt-2 p-2 rounded-md bg-red-500/10 border border-red-500/20">
                              <p className="text-xs text-red-500 dark:text-red-400 font-mono">
                                {permission.error}
                              </p>
                            </div>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3"
                            onClick={async () => {
                              const permissionMap: { [key: string]: string } = {
                                'Accessibility': 'accessibility',
                                'Full Disk Access': 'fullDiskAccess',
                                'Network Access': 'networkAccess',
                                'File Access': 'fileAccess',
                                'File System Access': 'fileAccess',
                                'Launch Agent': 'launchAgent',
                                'Startup Access': 'launchAgent',
                                'Systemd Service': 'launchAgent',
                                'Keychain Access': 'keychainAccess',
                                'Credential Storage': 'keychainAccess'
                              }
                              const permissionType = permissionMap[permission.name]
                              if (permissionType) {
                                await handleOpenPermissionPage(permissionType)
                              } else {
                                onOpenSettings()
                              }
                            }}
                          >
                            <Settings className="h-3.5 w-3.5 mr-1.5" />
                            Open Settings
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Optional Permissions Section */}
          {missingOptional.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-amber-500" />
                <h3 className="text-lg font-semibold">Optional Permissions</h3>
                <Badge variant="secondary" className="ml-auto">{missingOptional.length} Optional</Badge>
              </div>
              
              <div className="space-y-3">
                {missingOptional.map((permission, index) => (
                  <Card 
                    key={index} 
                    className={cn(
                      "border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/5",
                      "hover:border-amber-500/30 transition-colors"
                    )}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 flex-shrink-0">
                          {getIconComponent(permission.icon)}
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-base">{permission.name}</h4>
                            <Badge variant="secondary" className="text-xs">Optional</Badge>
                            <XCircle className="h-4 w-4 text-amber-500 ml-auto flex-shrink-0" />
                          </div>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {permission.description}
                          </p>
                          <p className="text-xs text-muted-foreground/80 leading-relaxed">
                            {permission.why}
                          </p>
                          {permission.error && (
                            <div className="mt-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                              <p className="text-xs text-amber-500 dark:text-amber-400 font-mono">
                                {permission.error}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Granted Permissions Section */}
          {grantedPermissions.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-semibold">Granted Permissions</h3>
                <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">
                  {grantedPermissions.length} Granted
                </Badge>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {grantedPermissions.map((permission, index) => (
                  <Card 
                    key={index} 
                    className={cn(
                      "border-green-500/30 bg-green-500/5 dark:bg-green-500/5",
                      "hover:border-green-500/50 transition-colors"
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/10 dark:bg-green-500/20 flex-shrink-0">
                          {getIconComponent(permission.icon)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm truncate">{permission.name}</h4>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {permissions.length === 0 && (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No permissions to display</p>
            </div>
          )}
        </div>

        <Separator className="my-4" />

        {/* Action Buttons */}
        <div className="space-y-3">
          {missingCritical.length > 0 && (
            <div className="flex gap-2">
              <Button
                onClick={handleRequestCritical}
                disabled={isRequesting}
                className="flex-1"
                variant="default"
              >
                {isRequesting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Requesting...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    Request Critical Permissions
                  </>
                )}
              </Button>
              <Button
                onClick={handleOpenSettings}
                variant="outline"
              >
                <Settings className="h-4 w-4 mr-2" />
                {getSettingsButtonText()}
                <ExternalLink className="h-3 w-3 ml-2" />
              </Button>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              variant="outline"
              className="flex-1"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Check
                </>
              )}
              <Kbd className="ml-2">R</Kbd>
            </Button>
            
            <Button
              onClick={onSkip}
              className="flex-1"
              variant={missingCritical.length === 0 ? "default" : "outline"}
            >
              {missingCritical.length === 0 ? "Continue" : "Continue Anyway"}
              <Kbd className="ml-2">⏎</Kbd>
            </Button>
          </div>
          
          <p className="text-xs text-center text-muted-foreground pt-2">
            {getPlatformInstructions()}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
