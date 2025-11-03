"use client"

import { useState, useEffect } from "react"
import { BoxesIcon } from "@/components/ui/boxes"

/**
 * Component to handle custom image loading with file:// URL conversion
 */
export function DatabaseIcon({ src, alt, className }: { src: string, alt: string, className: string }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) return
      
      // If it's already a data URL, use it directly
      if (src.startsWith('data:')) {
        setImageSrc(src)
        setIsLoading(false)
        return
      }
      
      // If it's a file:// URL, convert it to data URL
      if (src.startsWith('file://')) {
        try {
          // @ts-expect-error - Electron IPC types not available
          const result = await window.electron?.convertFileToDataUrl?.(src)
          if (result?.success) {
            setImageSrc(result.dataUrl)
          } else {
            console.error('Failed to convert file to data URL:', result?.error)
            setHasError(true)
          }
        } catch (error) {
          console.error('Error converting file to data URL:', error)
          setHasError(true)
        } finally {
          setIsLoading(false)
        }
      } else {
        // For other URLs, try to load directly
        setImageSrc(src)
        setIsLoading(false)
      }
    }

    loadImage()
  }, [src])

  if (isLoading) {
    return <BoxesIcon size={14} />
  }

  if (hasError || !imageSrc) {
    return <BoxesIcon size={14} />
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt} 
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

/**
 * Helper function to render database icons (emoji or custom image)
 */
export function renderDatabaseIcon(icon: string | undefined, className: string = "w-full h-full object-cover") {
  if (!icon) {
    return <BoxesIcon size={14} />
  }
  
  // Check if it's a custom image path (starts with file path or data URL)
  if (icon.startsWith('/') || icon.startsWith('file://') || icon.startsWith('data:') || icon.includes('.')) {
    return (
      <DatabaseIcon 
        src={icon} 
        alt="Database icon" 
        className={className}
      />
    )
  }
  
  // It's an emoji, render as text
  return <span className="text-base leading-none">{icon}</span>
}

