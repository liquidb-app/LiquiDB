"use client"

/**
 * StarsBackground Component
 * 
 * NOTE: This component is ONLY used during onboarding.
 * It will be automatically unmounted and cleaned up when onboarding completes.
 * Do not use this component outside of the onboarding flow.
 */

import React, { useEffect, useRef } from "react"

type StarsBackgroundProps = React.ComponentProps<"div"> & {
  factor?: number
  speed?: number
  transition?: { stiffness?: number; damping?: number }
  starColor?: string
  pointerEvents?: boolean
  opacity?: number
  parallaxFactor?: number
  glow?: boolean
}

export function StarsBackground({
  factor = 0.05,
  speed = 100,
  transition: _transition,
  starColor = "#fff",
  pointerEvents = true,
  parallaxFactor = 20,
  glow = true,
  className,
  style,
  ...props
}: StarsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animationRef = useRef<number | null>(null)
  const speedRef = useRef<number>(speed)
  const colorRef = useRef<string>(starColor)
  const targetParallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const parallaxRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    colorRef.current = starColor
  }, [starColor])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Track if component is still mounted to prevent operations after unmount
    let isMounted = true

    let cssWidth = canvas.offsetWidth
    let cssHeight = canvas.offsetHeight
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    let width = (canvas.width = Math.max(1, Math.floor(cssWidth * dpr)))
    let height = (canvas.height = Math.max(1, Math.floor(cssHeight * dpr)))
    const setCanvasScale = () => {
      if (!isMounted) return
      const context = canvas.getContext("2d")
      if (!context) return
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(dpr, dpr)
    }
    setCanvasScale()
    
    if (cssWidth === 0 || cssHeight === 0) {
      cssWidth = 800
      cssHeight = 600
      width = canvas.width = Math.floor(cssWidth * dpr)
      height = canvas.height = Math.floor(cssHeight * dpr)
      setCanvasScale()
    }
    
    // Track previous dimensions to avoid unnecessary re-initialization
    let lastWidth = cssWidth
    let lastHeight = cssHeight
    let resizeTimeout: NodeJS.Timeout | null = null
    
    const onResize = () => {
      if (!isMounted) return
      
      // Clear any pending resize operation
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
      }
      
      // Debounce resize operations to prevent excessive calls during rapid resizing
      resizeTimeout = setTimeout(() => {
        if (!isMounted) return
        
        const newWidth = canvas.offsetWidth || 800
        const newHeight = canvas.offsetHeight || 600
        
        // Only reinitialize if dimensions changed significantly (more than 10% change)
        const widthChanged = Math.abs(newWidth - lastWidth) > lastWidth * 0.1
        const heightChanged = Math.abs(newHeight - lastHeight) > lastHeight * 0.1
        
        if (!widthChanged && !heightChanged) {
          return // Skip if dimensions haven't changed significantly
        }
        
        cssWidth = newWidth
        cssHeight = newHeight
        lastWidth = cssWidth
        lastHeight = cssHeight
        
      width = canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
      height = canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
        
      if (cssWidth === 0 || cssHeight === 0) {
        cssWidth = 800
        cssHeight = 600
        width = canvas.width = Math.floor(cssWidth * dpr)
        height = canvas.height = Math.floor(cssHeight * dpr)
      }
        
      setCanvasScale()
      init()
      }, 150) // Debounce for 150ms
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)

    type Star = { x: number; y: number; size: number; depth: number }
    let stars: Star[] = []

    function rand(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    function init() {
      if (!isMounted) return
      // Recalculate numStars based on current dimensions
      const numStars = Math.max(100, Math.floor(cssWidth * cssHeight * factor * 0.001))
      stars = new Array(numStars).fill(0).map(() => ({
        x: rand(0, cssWidth),
        y: rand(0, cssHeight),
        size: rand(0.4, 1.6),
        depth: rand(0.4, 1.4),
      }))
    }
    init()

    const onMouseMove = (e: MouseEvent) => {
      if (!isMounted) return
      const rect = canvas.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      targetParallaxRef.current.x = ((e.clientX - cx) / (rect.width / 2)) * parallaxFactor
      targetParallaxRef.current.y = ((e.clientY - cy) / (rect.height / 2)) * parallaxFactor
    }
    window.addEventListener("mousemove", onMouseMove, { passive: true })

    if (ctx) {
      ctx.fillStyle = colorRef.current
      ctx.strokeStyle = colorRef.current
    }

    function draw() {
      if (!isMounted || !ctx) {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        return
      }
      
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      ctx.fillStyle = colorRef.current
      const spd = Math.max(0, speedRef.current) * 0.1
      parallaxRef.current.x += (targetParallaxRef.current.x - parallaxRef.current.x) * 0.06
      parallaxRef.current.y += (targetParallaxRef.current.y - parallaxRef.current.y) * 0.06
      const px = parallaxRef.current.x
      const py = parallaxRef.current.y
      for (const s of stars) {
        const r = Math.max(0.5, s.size)
        ctx.beginPath()
        ctx.arc(s.x + px * s.depth, s.y + py * s.depth, r, 0, Math.PI * 2)
        ctx.fill()
        s.y -= spd * 0.02
        if (s.y < -2) {
          s.y = cssHeight + 2
          s.x = rand(0, cssWidth)
        }
      }
      if (glow) {
        const gradient = ctx.createLinearGradient(0, cssHeight, 0, cssHeight * 0.6)
        const isLight = colorRef.current === "#000" || colorRef.current === "#000000"
        const glowColor = isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)"
        gradient.addColorStop(0, glowColor)
        gradient.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = gradient
        ctx.fillRect(0, cssHeight * 0.6, cssWidth, cssHeight * 0.4)
      }
      animationRef.current = requestAnimationFrame(draw)
    }
    animationRef.current = requestAnimationFrame(draw)

    return () => {
      // Mark as unmounted immediately to stop all operations
      isMounted = false
      
      // Cancel animation frame
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      
      // Clear any pending resize operations
      if (resizeTimeout) {
        clearTimeout(resizeTimeout)
        resizeTimeout = null
      }
      
      // Disconnect resize observer
      resizeObserver.disconnect()
      
      // Remove event listeners
      window.removeEventListener("mousemove", onMouseMove)
      
      // Clear the canvas
      if (ctx && canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
      
      // Clear stars array to free memory
      stars = []
    }
  }, [factor, starColor, parallaxFactor, glow])

  return (
    <div
      className={className}
      style={{ position: "absolute", inset: 0, pointerEvents: pointerEvents ? "auto" : "none", ...style }}
      {...props}
    >
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  )
}



