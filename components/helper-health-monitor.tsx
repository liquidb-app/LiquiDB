"use client"

import { useState, useEffect } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Settings } from "lucide-react"
import { RotateCCWIcon } from "@/components/ui/rotate-ccw"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"
import { notifySuccess, notifyError } from "@/lib/notifications"
import { isOnboardingComplete } from "@/lib/preferences"

interface HelperHealthMonitorProps {
  className?: string
}

export function HelperHealthMonitor({ className }: HelperHealthMonitorProps) {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isReinstalling, setIsReinstalling] = useState(false)

  // Animated icon hover hook
  const rotateIconHover = useAnimatedIconHover()

  // Check helper service health
  const checkHealth = async () => {
    setIsChecking(true)
    try {
      // @ts-expect-error - Electron IPC types not available
      const result = await window.electron?.getHelperHealth?.()
      if (result?.success) {
        // Only show as unhealthy if the main app is not running
        // When main app is running, helper service should be off
        const isMainAppRunning = window.electron?.isElectron
        if (isMainAppRunning) {
          // Main app is running, helper should be off - this is healthy
          setIsHealthy(true)
        } else {
          // Main app is not running, helper should be on
          setIsHealthy(result.data.isHealthy)
        }
      } else {
        setIsHealthy(false)
      }
    } catch (error) {
      console.error("Failed to check helper health:", error)
      setIsHealthy(false)
    } finally {
      setIsChecking(false)
    }
  }

  // Reinstall helper service
  const handleReinstall = async () => {
    setIsReinstalling(true)
    try {
      // First try to uninstall
      // @ts-expect-error - Electron IPC types not available
      await window.electron?.uninstallHelper?.()
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Then reinstall by starting
      // @ts-expect-error - Electron IPC types not available
      const installResult = await window.electron?.startHelper?.()
      
      if (installResult?.success) {
        notifySuccess("Helper service reinstalled successfully")
        await checkHealth()
      } else {
        notifyError("Failed to reinstall helper service", {
          description: installResult?.error || "Unknown error occurred",
        })
      }
    } catch {
      notifyError("Failed to reinstall helper service", {
        description: "Could not connect to helper service",
      })
    } finally {
      setIsReinstalling(false)
    }
  }

  // Check health on mount and periodically (only if onboarding is complete)
  useEffect(() => {
    // Don't start health monitoring during onboarding
    if (!isOnboardingComplete()) {
      return
    }
    
    checkHealth()
    
    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000)
    
    return () => clearInterval(interval)
  }, [])

  // Don't show anything if we haven't checked yet, if it's healthy, or if main app is running
  if (isHealthy === null || isHealthy === true) {
    return null
  }

  // Don't show the alert when the main app is running (helper should be off)
  const isMainAppRunning = typeof window !== 'undefined' && window.electron?.isElectron
  if (isMainAppRunning) {
    return null
  }

  return (
    <Alert className={`border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 ${className}`}>
      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 animate-pulse" />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1">
          <p className="font-medium text-red-800 dark:text-red-200">
            Background Helper Service is Off
          </p>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            The background process monitor is not running. This may cause port conflicts and orphaned database processes.
          </p>
        </div>
        <div className="flex gap-2 ml-4">
          <Button
            variant="outline"
            size="sm"
            onClick={checkHealth}
            disabled={isChecking}
            className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900"
          >
            <Settings className="h-3 w-3 mr-1" />
            {isChecking ? "Checking..." : "Check"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleReinstall}
            disabled={isReinstalling}
            className="bg-red-600 hover:bg-red-700 text-white"
            onMouseEnter={rotateIconHover.onMouseEnter}
            onMouseLeave={rotateIconHover.onMouseLeave}
          >
            <RotateCCWIcon ref={rotateIconHover.iconRef} size={12} />
            {isReinstalling ? "Reinstalling..." : "Reinstall"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
