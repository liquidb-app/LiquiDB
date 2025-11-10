"use client"

import { useState, useEffect, useCallback } from "react"
import { Gift } from "lucide-react"
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
  const [isDownloaded, setIsDownloaded] = useState(false)
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
    setDownloadProgress(0)
    setIsDownloaded(false)
    try {
      const result = await window.electron?.downloadUpdate?.()
      if (result?.success) {
        // Download started, progress will be handled via events
      } else {
        console.error("Failed to download update:", result?.error)
        setIsDownloading(false)
        setIsDownloaded(false)
      }
    } catch (error) {
      console.error("Failed to download update:", error)
      setIsDownloading(false)
      setIsDownloaded(false)
    }
  }, [updateInfo])

  const handleInstallNow = useCallback(async () => {
    // If update is not downloaded yet, download it first
    if (!isDownloaded) {
      await handleDownloadUpdate()
      return
    }

    // Update is downloaded, install it
    try {
      console.log("[Update] Installing update and restarting...")
      const result = await window.electron?.installUpdate?.()
      if (result?.success) {
        console.log("[Update] Install command sent successfully")
      } else {
        console.error("[Update] Failed to install update:", result?.error)
      }
    } catch (error) {
      console.error("[Update] Failed to install update:", error)
    }
  }, [isDownloaded, handleDownloadUpdate])

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
      setIsDownloaded(true)
      console.log("[Update] Update downloaded and ready to install")
    }

    const handleUpdateDownloadProgress = (progress: { percent: number }) => {
      setDownloadProgress(progress.percent)
    }

    const handleUpdateError = (error: { message: string }) => {
      console.error("[Update] Update error:", error.message)
      setIsDownloading(false)
      setIsDownloaded(false)
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
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className={cn(
          "fixed left-4 bottom-4 z-50",
          className
        )}
      >
        <div className="bg-[#2C2C2C] dark:bg-[#1A1A1A] rounded-lg border border-border/50 shadow-lg px-4 py-3 flex items-center gap-4 relative">
          {/* Gift Icon */}
          <div className="flex-shrink-0">
            <Gift className="h-5 w-5 text-[#D3D3D3]" strokeWidth={1.5} />
          </div>

          {/* Text */}
          <p className="text-sm text-[#D3D3D3] whitespace-nowrap">
            New update available
          </p>

          {/* Later Button */}
          <button
            onClick={handleLater}
            className="text-sm text-[#D3D3D3] hover:text-foreground transition-colors whitespace-nowrap"
          >
            Later
          </button>

          {/* Install Now Button */}
          <Button
            size="sm"
            onClick={handleInstallNow}
            disabled={isDownloading && !isDownloaded}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white rounded-md px-4 py-1.5 h-auto whitespace-nowrap disabled:opacity-50"
          >
            {isDownloading && !isDownloaded
              ? `Downloading... ${Math.round(downloadProgress)}%`
              : isDownloaded
              ? "Install Now"
              : "Install Now"}
          </Button>

          {/* Download Progress Bar (shown during download) */}
          {isDownloading && downloadProgress < 100 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted/20 rounded-b-lg overflow-hidden">
              <motion.div
                className="h-full bg-[#3B82F6]"
                initial={{ width: 0 }}
                animate={{ width: `${downloadProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

