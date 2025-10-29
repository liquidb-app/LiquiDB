"use client"

import { useRef, useCallback } from "react"

export function useAnimatedIconHover() {
  const iconRef = useRef<any>(null)

  const handleMouseEnter = useCallback(() => {
    if (iconRef.current?.startAnimation) {
      iconRef.current.startAnimation()
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (iconRef.current?.stopAnimation) {
      iconRef.current.stopAnimation()
    }
  }, [])

  return {
    iconRef,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave
  }
}
