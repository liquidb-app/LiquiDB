"use client"

import { useState, useEffect, useCallback } from "react"
import { Gift, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
  downloadUrl?: string
}

interface UpdateNotificationProps {
  className?: string
}

export function UpdateNotification({ className }: UpdateNotificationProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  const handleCheckForUpdate = useCallback(async () => {
    try {
      const result = await window.electron?.checkForUpdate?.()
      if (result?.available && result.info) {
        setUpdateInfo({
          version: result.info.version,
          releaseDate: result.info.releaseDate,
          releaseNotes: result.info.releaseNotes,
          downloadUrl: result.info.downloadUrl,
        })
        setIsVisible(true)
      }
    } catch (error) {
      console.error("Failed to check for update:", error)
    }
  }, [])

  const handleDownload = useCallback(() => {
    if (updateInfo?.downloadUrl) {
      window.electron?.openExternalLink?.(updateInfo.downloadUrl)
    }
  }, [updateInfo])

  const handleLater = useCallback(() => {
    setIsVisible(false)
  }, [])

  useEffect(() => {
    // Only enable in production (packaged app)
    if (typeof window === 'undefined' || !window.electron?.isElectron) {
      return
    }

    // Listen for update events from Electron
    const handleUpdateAvailable = (info: UpdateInfo) => {
      setUpdateInfo(info)
      setIsVisible(true)
    }

    if (window.electron) {
      window.electron.onUpdateAvailable?.(handleUpdateAvailable)
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
          <div className="flex flex-col">
            <p className="text-sm text-[#D3D3D3] whitespace-nowrap">
              New update available: v{updateInfo.version}
            </p>
          </div>

          {/* Later Button */}
          <button
            onClick={handleLater}
            className="text-sm text-[#D3D3D3] hover:text-foreground transition-colors whitespace-nowrap"
          >
            Later
          </button>

          {/* Download Button */}
          <Button
            size="sm"
            onClick={handleDownload}
            className="bg-[#3B82F6] hover:bg-[#3B82F6]/90 text-white rounded-md px-4 py-1.5 h-auto whitespace-nowrap flex items-center gap-2"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
