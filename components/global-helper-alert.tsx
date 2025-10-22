"use client"

import { useState, useEffect } from "react"
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
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"

interface HelperStatus {
  installed: boolean
  running: boolean
  isRunning: boolean
}

interface GlobalHelperAlertProps {
  className?: string
}

export function GlobalHelperAlert({ className }: GlobalHelperAlertProps) {
  const [helperStatus, setHelperStatus] = useState<HelperStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  // Check helper service status
  const checkHelperStatus = async () => {
    setIsChecking(true)
    try {
      // @ts-ignore
      const result = await window.electron?.getHelperStatus?.()
      if (result?.success) {
        setHelperStatus(result.data)
      } else {
        setHelperStatus(null)
      }
    } catch (error) {
      console.error("Failed to check helper status:", error)
      setHelperStatus(null)
    } finally {
      setIsChecking(false)
    }
  }

  // Handle fix issue action
  const handleFixIssue = async () => {
    setIsLoading(true)
    try {
      if (!helperStatus?.installed) {
        // Install the service
        // @ts-ignore
        const installResult = await window.electron?.installHelper?.()
        if (installResult?.success) {
          toast.success("Helper service installed successfully")
          // Immediately check status and close dialog
          await checkHelperStatus()
          setIsOpen(false)
        } else {
          toast.error("Failed to install helper service", {
            description: installResult?.error || "Unknown error occurred",
          })
        }
      } else if (!helperStatus?.running) {
        // Start the service
        // @ts-ignore
        const startResult = await window.electron?.startHelper?.()
        if (startResult?.success) {
          toast.success("Helper service started successfully")
          // Immediately check status and close dialog
          await checkHelperStatus()
          setIsOpen(false)
        } else {
          toast.error("Failed to start helper service", {
            description: startResult?.error || "Unknown error occurred",
          })
        }
      }
    } catch (error) {
      toast.error("Failed to fix helper service issue", {
        description: "Could not connect to helper service",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Handle ignore action
  const handleIgnore = () => {
    setIsDismissed(true)
    // Store dismissal in localStorage with timestamp
    localStorage.setItem('helper-alert-dismissed', Date.now().toString())
  }

  // Check if alert should be shown
  const shouldShowAlert = () => {
    if (isChecking || isDismissed || !helperStatus) return false
    
    // Show alert if service is not installed or not running
    return !helperStatus.installed || !helperStatus.running
  }

  // Update dialog open state
  useEffect(() => {
    setIsOpen(shouldShowAlert())
  }, [helperStatus, isDismissed, isChecking])

  // Check if alert was recently dismissed (within 1 hour)
  const isRecentlyDismissed = () => {
    const dismissed = localStorage.getItem('helper-alert-dismissed')
    if (!dismissed) return false
    
    const dismissedTime = parseInt(dismissed)
    const oneHour = 60 * 60 * 1000
    return Date.now() - dismissedTime < oneHour
  }

  // Check status on mount and periodically
  useEffect(() => {
    checkHelperStatus()
    
    // Check every 5 seconds for more responsive updates
    const interval = setInterval(checkHelperStatus, 5000)
    
    // Check if recently dismissed
    if (isRecentlyDismissed()) {
      setIsDismissed(true)
    }
    
    return () => clearInterval(interval)
  }, [])

  // Reset dismissal when status changes and hide dialog when service is available
  useEffect(() => {
    if (helperStatus) {
      if (!helperStatus.installed || !helperStatus.running) {
        // Service has issues, reset dismissal
        setIsDismissed(false)
      } else {
        // Service is working properly, hide dialog immediately
        setIsOpen(false)
      }
    }
  }, [helperStatus])

  if (!shouldShowAlert()) {
    return null
  }

  const getAlertMessage = () => {
    if (!helperStatus?.installed) {
      return {
        title: "Helper Service Not Installed",
        description: "The background helper service is not installed. This may cause port conflicts and orphaned database processes. Would you like to install it now?",
        actionText: "Install Service"
      }
    } else if (!helperStatus?.running) {
      return {
        title: "Helper Service Stopped",
        description: "The background helper service has stopped. Database process monitoring is not active. Would you like to restart it?",
        actionText: "Start Service"
      }
    }
    return null
  }

  const message = getAlertMessage()
  if (!message) return null

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            {message.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {message.description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleIgnore}>
            Ignore
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleFixIssue} 
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700 focus:ring-orange-600"
          >
            {isLoading ? "Fixing..." : message.actionText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
