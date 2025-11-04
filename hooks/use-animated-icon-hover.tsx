"use client"

import { useRef, useCallback } from "react"

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export function useAnimatedIconHover<T extends AnimatedIconHandle = AnimatedIconHandle>() {
  const iconRef = useRef<T | null>(null)

  const handleMouseEnter = useCallback(() => {
    iconRef.current?.startAnimation()
  }, [])

  const handleMouseLeave = useCallback(() => {
    iconRef.current?.stopAnimation()
  }, [])

  return {
    iconRef: iconRef as React.MutableRefObject<T | null>,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave
  }
}
