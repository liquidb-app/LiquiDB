import { useCallback, useEffect } from "react"
import { notifyError } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"
import type { TargetAndTransition } from "framer-motion"

export const useUiUtilities = (
  databases: DatabaseContainer[],
  activeTab: string,
  deleteAnimationPhase: 'idle' | 'moving' | 'particles' | 'exploding' | 'complete',
  isDeletingAll: boolean,
  cardInitialPositions: Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>,
  centerPosition: React.MutableRefObject<{ x: number; y: number } | null>,
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  setCardInitialPositions: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>>>,
  setSelectedDatabase: React.Dispatch<React.SetStateAction<DatabaseContainer | null>>,
  setSettingsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setCopiedId: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const handleOpenExternalLink = async (url: string) => {
    try {
      const result = await window.electron?.openExternalLink?.(url)
      if (result && !result.success) {
        notifyError("Failed to open link", {
          description: result.error || "Could not open the link in your default browser.",
        })
      }
    } catch {
      notifyError("Failed to open link", {
        description: "Could not open the link in your default browser.",
      })
    }
  }

  // Capture card positions and center position when animation starts
  useEffect(() => {
    if (deleteAnimationPhase === 'moving' && cardInitialPositions.size === 0) {

      centerPosition.current = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }
      

      requestAnimationFrame(() => {
        const positions = new Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>()
        cardRefs.current.forEach((cardElement, dbId) => {
          const rect = cardElement.getBoundingClientRect()
          positions.set(dbId, {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          })
        })
        setCardInitialPositions(positions)
      })
    } else if (deleteAnimationPhase === 'idle') {
      setCardInitialPositions(new Map())
      centerPosition.current = null
    }
  }, [deleteAnimationPhase, cardInitialPositions.size, centerPosition, cardRefs, setCardInitialPositions])

  // Helper to get card animation props using Motion.dev
  const getCardAnimationProps = useCallback((dbId: string, index: number): TargetAndTransition | undefined => {
    if (deleteAnimationPhase === 'idle' || !isDeletingAll || !centerPosition.current) {
      return undefined
    }
    
    const initialPos = cardInitialPositions.get(dbId)
    if (!initialPos) {
      return undefined
    }
    

    const deltaX = centerPosition.current.x - initialPos.x
    const deltaY = centerPosition.current.y - initialPos.y
    
    if (deleteAnimationPhase === 'moving') {

      const staggerDelay = index * 0.08 // 80ms per card
      const randomRotation = (Math.random() - 0.5) * 45 // -22.5 to +22.5 degrees
      return {
        x: [0, deltaX], // Start from 0 (original position), move to center
        y: [0, deltaY],
        rotate: [0, randomRotation],
        opacity: [1, 1], // Keep opacity during movement
        transition: {
          type: "spring" as const,
          stiffness: 500,
          damping: 40,
          mass: 0.7,
          delay: staggerDelay,
        }
      }
    } else if (deleteAnimationPhase === 'particles') {
      // At center: fade in and make smaller
      const particleDelay = index * 0.04 // 40ms stagger
      return {
        x: deltaX, // Already at center
        y: deltaY,
        scale: [1, 0.15], // Shrink to small particle
        opacity: [0.3, 1], // Fade in from 0.3 to 1
        rotate: 0, // Reset rotation
        transition: {
          type: "spring" as const,
          stiffness: 600,
          damping: 35,
          mass: 0.5,
          delay: particleDelay,
        }
      }
    } else if (deleteAnimationPhase === 'exploding') {
      // Explode outward then fade out completely
      const explodeDelay = index * 0.015 // 15ms stagger
      const angle = (index / databases.length) * Math.PI * 2 // Distribute in circle
      const distance = 250 + Math.random() * 150 // Random distance
      const randomAngle = angle + (Math.random() - 0.5) * 0.6
      
      return {
        x: [deltaX, deltaX + Math.cos(randomAngle) * distance], // Start at center, explode outward
        y: [deltaY, deltaY + Math.sin(randomAngle) * distance],
        scale: [0.15, 0], // Shrink from particle size to nothing
        opacity: [1, 0], // Fade out completely
        rotate: [0, randomAngle * (180 / Math.PI) + Math.random() * 360], // Spin during explosion
        transition: {
          type: "spring" as const,
          stiffness: 300,
          damping: 25,
          mass: 0.3,
          delay: explodeDelay,
        }
      }
    }
    
    return undefined
  }, [deleteAnimationPhase, isDeletingAll, centerPosition, cardInitialPositions, databases.length])

  const getVisibleDatabases = useCallback(() => {
    switch (activeTab) {
      case "active":
        return databases.filter(db => db.status === "running" || db.status === "starting")
      case "inactive":
        return databases.filter(db => db.status === "stopped")
      case "all":
        return databases
      default:
        return []
    }
  }, [activeTab, databases])

  const handleSettings = (database: DatabaseContainer) => {
    setSelectedDatabase(database)
    setSettingsDialogOpen(true)
  }

  const handleCopyContainerId = (containerId: string, dbId: string) => {
    navigator.clipboard.writeText(containerId)
    setCopiedId(dbId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return {
    getVisibleDatabases,
    getCardAnimationProps,
    handleOpenExternalLink,
    handleSettings,
    handleCopyContainerId
  }
}

