import React, { useRef, useCallback } from "react"

interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export function useDatabaseIconHover() {
  const hoverStates = useRef<Map<string, React.RefObject<AnimatedIconHandle | null>>>(new Map())

  const getIconRef = useCallback((databaseId: string, iconType: string): React.RefObject<AnimatedIconHandle | null> => {
    const key = `${databaseId}-${iconType}`
    
    if (!hoverStates.current.has(key)) {
      hoverStates.current.set(key, React.createRef<AnimatedIconHandle | null>())
    }
    
    return hoverStates.current.get(key)!
  }, [])

  const onMouseEnter = useCallback((databaseId: string, iconType: string) => {
    const iconRef = getIconRef(databaseId, iconType)
    if (iconRef.current && typeof iconRef.current.startAnimation === "function") {
      iconRef.current.startAnimation()
    }
  }, [getIconRef])

  const onMouseLeave = useCallback((databaseId: string, iconType: string) => {
    const iconRef = getIconRef(databaseId, iconType)
    if (iconRef.current && typeof iconRef.current.stopAnimation === "function") {
      iconRef.current.stopAnimation()
    }
  }, [getIconRef])

  const createHoverHandlers = useCallback((databaseId: string, iconType: string): {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.RefObject<AnimatedIconHandle | null>
  } => {
    const iconRef = getIconRef(databaseId, iconType)
    
    return { 
      onMouseEnter: (): void => onMouseEnter(databaseId, iconType),
      onMouseLeave: (): void => onMouseLeave(databaseId, iconType),
      iconRef
    }
  }, [getIconRef, onMouseEnter, onMouseLeave])

  return { createHoverHandlers }
}
