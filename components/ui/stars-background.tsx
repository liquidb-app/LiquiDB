"use client"

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

// Lightweight canvas starfield that avoids external deps
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

    let cssWidth = canvas.offsetWidth
    let cssHeight = canvas.offsetHeight
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    let width = (canvas.width = Math.max(1, Math.floor(cssWidth * dpr)))
    let height = (canvas.height = Math.max(1, Math.floor(cssHeight * dpr)))
    const setCanvasScale = () => {
      const context = canvas.getContext("2d")
      if (!context) return
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.scale(dpr, dpr)
    }
    setCanvasScale()
    
    // Ensure minimum dimensions
    if (cssWidth === 0 || cssHeight === 0) {
      cssWidth = 800
      cssHeight = 600
      width = canvas.width = Math.floor(cssWidth * dpr)
      height = canvas.height = Math.floor(cssHeight * dpr)
      setCanvasScale()
    }
    
    const onResize = () => {
      cssWidth = canvas.offsetWidth
      cssHeight = canvas.offsetHeight
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
    }
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(canvas)

    type Star = { x: number; y: number; size: number; depth: number }
    let stars: Star[] = []
    const numStars = Math.max(100, Math.floor(width * height * factor * 0.001))

    function rand(min: number, max: number) {
      return Math.random() * (max - min) + min
    }

    function init() {
      stars = new Array(numStars).fill(0).map(() => ({
        x: rand(0, cssWidth),
        y: rand(0, cssHeight),
        size: rand(0.4, 1.6),
        depth: rand(0.4, 1.4),
      }))
    }
    init()

    const onMouseMove = (e: MouseEvent) => {
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
      if (!ctx) return
      
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      ctx.fillStyle = colorRef.current
      const spd = Math.max(0, speedRef.current) * 0.1 // vertical drift
      // ease parallax
      parallaxRef.current.x += (targetParallaxRef.current.x - parallaxRef.current.x) * 0.06
      parallaxRef.current.y += (targetParallaxRef.current.y - parallaxRef.current.y) * 0.06
      const px = parallaxRef.current.x
      const py = parallaxRef.current.y
      for (const s of stars) {
        const r = Math.max(0.5, s.size) // Ensure minimum size
        ctx.beginPath()
        ctx.arc(s.x + px * s.depth, s.y + py * s.depth, r, 0, Math.PI * 2)
        ctx.fill()
        // move up
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
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      resizeObserver.disconnect()
      window.removeEventListener("mousemove", onMouseMove)
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



