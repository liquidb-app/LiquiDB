"use client"

import { useState, useEffect, useCallback } from "react"
import { Gift, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

interface UpdateNotificationProps {
  className?: string
}

export function UpdateNotification({ className }: UpdateNotificationProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  const handleCheckForUpdate = useCallback(async () => {
    try {
      const result = await window.electron?.checkForUpdate?.()
      if (result?.available && result.info) {
        setUpdateInfo({
          version: result.info.version,
          releaseDate: result.info.releaseDate,
          releaseNotes: result.info.releaseNotes,
        })
        setIsVisible(true)
      }
    } catch (error) {
      console.error("Failed to check for update:", error)
    }
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    if (!updateInfo) return

    setIsDownloading(true)
    try {
      const result = await window.electron?.downloadUpdate?.()
      if (result?.success) {
        // Download started, progress will be handled via events
      } else {
        console.error("Failed to download update:", result?.error)
        setIsDownloading(false)
      }
    } catch (error) {
      console.error("Failed to download update:", error)
      setIsDownloading(false)
    }
  }, [updateInfo])

  const handleInstallNow = useCallback(async () => {
    try {
      await window.electron?.installUpdate?.()
    } catch (error) {
      console.error("Failed to install update:", error)
    }
  }, [])

  const handleLater = useCallback(() => {
    setIsVisible(false)
  }, [])

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
  }, [])

  useEffect(() => {
    // Only enable auto-update in production (packaged app)
    if (typeof window === 'undefined' || !window.electron?.isElectron) {
      return
    }

    // Listen for update events from Electron
    const handleUpdateAvailable = (info: UpdateInfo) => {
      setUpdateInfo(info)
      setIsVisible(true)
    }

    const handleUpdateDownloaded = (info: UpdateInfo) => {
      setUpdateInfo(info)
      setIsDownloading(false)
      setDownloadProgress(100)
    }

    const handleUpdateDownloadProgress = (progress: { percent: number }) => {
      setDownloadProgress(progress.percent)
    }

    const handleUpdateError = (error: { message: string }) => {
      console.error("Update error:", error.message)
      setIsDownloading(false)
    }

    if (window.electron) {
      window.electron.onUpdateAvailable?.(handleUpdateAvailable)
      window.electron.onUpdateDownloaded?.(handleUpdateDownloaded)
      window.electron.onUpdateDownloadProgress?.(handleUpdateDownloadProgress)
      window.electron.onUpdateError?.(handleUpdateError)
    }

    // Initial check
    handleCheckForUpdate()

    return () => {
      if (window.electron) {
        window.electron.removeUpdateListeners?.()
      }
    }
  }, [handleCheckForUpdate])

  if (!isVisible || !updateInfo) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: -400, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: -400, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "fixed left-4 top-1/2 -translate-y-1/2 z-50 w-80",
          className
        )}
      >
        <div className="bg-[#2C2C2C] dark:bg-[#1A1A1A] rounded-lg border border-border/50 shadow-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-shrink-0">
                <Gift className="h-5 w-5 text-[#D3D3D3]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#D3D3D3]">
                  New update available
                </p>
                {updateInfo.version && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Version {updateInfo.version}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {isDownloading && (
            <div className="space-y-1">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${downloadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Downloading... {Math.round(downloadProgress)}%
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLater}
              className="flex-1 text-[#D3D3D3] hover:text-foreground hover:bg-accent"
            >
              Later
            </Button>
            {downloadProgress === 100 ? (
              <Button
                size="sm"
                onClick={handleInstallNow}
                className="flex-1 bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white"
              >
                Install Now
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleDownloadUpdate}
                disabled={isDownloading}
                className="flex-1 bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white"
              >
                {isDownloading ? "Downloading..." : "Download"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

