"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BoxesIcon } from "@/components/ui/boxes"

interface LoadingScreenProps {
  onComplete?: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Simple timeout to complete loading
    const timer = setTimeout(() => {
      onComplete?.()
    }, 2000) // 2 seconds loading time

    return () => clearTimeout(timer)
  }, [onComplete])

  // Use CSS variables for theme-consistent styling
  return (
    <motion.div 
      className="fixed inset-0 flex items-center justify-center z-50 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="w-16 h-16 rounded-xl flex items-center justify-center bg-primary/10 backdrop-blur-sm border border-border"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        <BoxesIcon size={32} className="text-primary" />
      </motion.div>
    </motion.div>
  )
}
