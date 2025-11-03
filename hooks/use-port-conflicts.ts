/**
 * Hook for managing port conflicts and banned ports
 */

import { useState, useEffect, useCallback } from "react"
import { isPortBanned as checkPortBanned, checkPortConflict, getPortConflictInfo } from "@/lib/utils/port-utils"

export function usePortConflicts() {
  const [bannedPorts, setBannedPorts] = useState<number[]>([])

  // Load banned ports on mount and listen for changes
  useEffect(() => {
    const loadBannedPorts = async () => {
      try {
        // @ts-expect-error - Electron IPC types not available
        if (window.electron?.getBannedPorts) {
          // @ts-expect-error - Electron IPC types not available
          const ports = await window.electron.getBannedPorts()
          setBannedPorts(Array.isArray(ports) ? ports : [])
        } else {
          const saved = localStorage.getItem("blacklisted-ports")
          if (saved) setBannedPorts(JSON.parse(saved))
        }
      } catch (error) {
        console.error("Failed to load banned ports:", error)
      }
    }
    loadBannedPorts()

    // Listen for banned port changes
    const handleBannedPortsChange = () => {
      loadBannedPorts()
    }

    // Listen to storage changes for banned ports
    window.addEventListener('storage', (e) => {
      if (e.key === 'blacklisted-ports') {
        handleBannedPortsChange()
      }
    })

    return () => {
      window.removeEventListener('storage', handleBannedPortsChange)
    }
  }, [])

  const isPortBanned = useCallback((port: number): boolean => {
    return checkPortBanned(port, bannedPorts)
  }, [bannedPorts])

  return {
    bannedPorts,
    isPortBanned,
    checkPortConflict,
    getPortConflictInfo,
  }
}

