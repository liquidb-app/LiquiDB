"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useTheme } from "next-themes"
import { Logo } from "@/components/ui/logo"

interface LoadingScreenProps {
  onComplete?: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [mounted, setMounted] = useState(false)
  const { theme, resolvedTheme } = useTheme()

  useEffect(() => {
    setMounted(true)
    
    // Prevent body scrolling during loading
    document.body.style.overflow = 'hidden'
    
    // Simple timeout to complete loading
    const timer = setTimeout(() => {
      document.body.style.overflow = '' // Restore scrolling
      onComplete?.()
    }, 2000) // 2 seconds loading time

    return () => {
      clearTimeout(timer)
      document.body.style.overflow = '' // Restore scrolling on unmount
    }
  }, [onComplete])

  // Determine the effective theme (resolvedTheme handles system theme)
  const effectiveTheme = mounted ? (resolvedTheme || theme) : "light"
  
  // Set color based on theme: RGB(229, 229, 229) for dark mode, inverted for light mode
  const logoColor = effectiveTheme === "dark" 
    ? "rgb(229, 229, 229)" 
    : "rgb(26, 26, 26)" // Inverted: 255 - 229 = 26

  // Use CSS variables for theme-consistent styling
  return (
    <motion.div 
      className="fixed inset-0 flex items-center justify-center z-[99999] bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{ 
        pointerEvents: 'auto',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <motion.div
        className="flex items-center justify-center"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ color: logoColor }}
      >
        <Logo size={32} />
      </motion.div>
    </motion.div>
  )
}
