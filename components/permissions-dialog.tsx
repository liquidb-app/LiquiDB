"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Settings, Shield } from "lucide-react"
import { toast } from "sonner"

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

  const criticalPermissions = permissions.filter(p => p.critical)
  const optionalPermissions = permissions.filter(p => !p.critical)
  const missingCritical = criticalPermissions.filter(p => !p.granted)
  const missingOptional = optionalPermissions.filter(p => !p.granted)

  const handleRetry = useCallback(async () => {
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }, [onRetry])

  const handleOpenSettings = () => {
    onOpenSettings()
    toast.info("Opening System Preferences...", {
      description: "Please grant the required permissions and return to LiquiDB."
    })
  }

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          onSkip()
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
  }, [open, onSkip, handleRetry, isRetrying])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            Required Permissions
          </DialogTitle>
          <DialogDescription>
            LiquiDB needs certain permissions to function properly. Please review and grant the permissions below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {missingCritical.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <h3 className="font-semibold text-red-800 dark:text-red-200">Critical Permissions Required</h3>
              </div>
              
              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <AlertDescription>
                  These permissions are required for LiquiDB to function properly. The app may not work correctly without them.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                {missingCritical.map((permission, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border border-red-200 rounded-lg bg-red-50 dark:border-red-800 dark:bg-red-950">
                    <div className="text-2xl">{permission.icon}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-red-800 dark:text-red-200">{permission.name}</h4>
                        <Badge variant="destructive" className="text-xs">Required</Badge>
                      </div>
                      <p className="text-sm text-red-700 dark:text-red-300">{permission.description}</p>
                      <p className="text-xs text-red-600 dark:text-red-400">{permission.why}</p>
                      {permission.error && (
                        <p className="text-xs text-red-500 dark:text-red-500 font-mono">{permission.error}</p>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => {
                          const permissionMap: { [key: string]: string } = {
                            'Accessibility': 'accessibility',
                            'Full Disk Access': 'fullDiskAccess',
                            'Network Access': 'networkAccess',
                            'File Access': 'fileAccess',
                            'Launch Agent': 'launchAgent',
                            'Keychain Access': 'keychainAccess'
                          }
                          const permissionType = permissionMap[permission.name]
                          if (permissionType) {
                            onOpenPermissionPage(permissionType)
                          }
                        }}
                      >
                        <Settings className="h-3 w-3 mr-1" />
                        Open Settings
                      </Button>
                    </div>
                    <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {missingOptional.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-orange-600" />
                <h3 className="font-semibold text-orange-800 dark:text-orange-200">Optional Permissions</h3>
              </div>
              
              <div className="space-y-3">
                {missingOptional.map((permission, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 border border-orange-200 rounded-lg bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                    <div className="text-2xl">{permission.icon}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-orange-800 dark:text-orange-200">{permission.name}</h4>
                        <Badge variant="secondary" className="text-xs">Optional</Badge>
                      </div>
                      <p className="text-sm text-orange-700 dark:text-orange-300">{permission.description}</p>
                      <p className="text-xs text-orange-600 dark:text-orange-400">{permission.why}</p>
                      {permission.error && (
                        <p className="text-xs text-orange-500 dark:text-orange-500 font-mono">{permission.error}</p>
                      )}
                    </div>
                    <XCircle className="h-5 w-5 text-orange-600 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {permissions.filter(p => p.granted).length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <h3 className="font-semibold text-green-800 dark:text-green-200">Granted Permissions</h3>
              </div>
              
              <div className="space-y-2">
                {permissions.filter(p => p.granted).map((permission, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 border border-green-200 rounded-lg bg-green-50 dark:border-green-800 dark:bg-green-950">
                    <div className="text-xl">{permission.icon}</div>
                    <div className="flex-1">
                      <h4 className="font-medium text-green-800 dark:text-green-200">{permission.name}</h4>
                    </div>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pt-4 border-t">
          <div className="flex gap-2">
            <Button
              onClick={onRequestCritical}
              className="flex-1"
              variant="default"
            >
              <Settings className="h-4 w-4 mr-2" />
              Request Critical Permissions
            </Button>
            <Button
              onClick={handleOpenSettings}
              variant="outline"
            >
              <Settings className="h-4 w-4 mr-2" />
              Open System Preferences
              <ExternalLink className="h-3 w-3 ml-2" />
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              onClick={handleRetry}
              disabled={isRetrying}
              variant="outline"
              className="flex-1"
            >
              {isRetrying ? "Checking..." : "Retry Check"} <Kbd>R</Kbd>
            </Button>
          </div>
          
          <div className="flex gap-2">
            {missingCritical.length === 0 ? (
              <Button
                onClick={onSkip}
                className="flex-1"
                variant="default"
              >
                Continue <Kbd>⏎</Kbd>
              </Button>
            ) : (
              <Button
                onClick={onSkip}
                className="flex-1"
                variant="outline"
              >
                Continue Anyway <Kbd>⏎</Kbd>
              </Button>
            )}
          </div>
          
          <p className="text-xs text-muted-foreground text-center">
            You can change these permissions later in System Preferences → Security & Privacy → Privacy
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

