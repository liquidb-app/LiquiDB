"use client"

import { useState, useEffect } from "react"
import { BoxesIcon } from "@/components/ui/boxes"

/**
 * Component to handle custom image loading with file:
 */
export function DatabaseIcon({ src, alt, className }: { src: string, alt: string, className: string }) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) return
      
      if (src.startsWith('data:')) {
        setImageSrc(src)
        setIsLoading(false)
        return
      }
      
      if (src.startsWith('file://')) {
        try {
          const result = await window.electron?.convertFileToDataUrl?.(src)
          if (result?.success && result.dataUrl) {
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
  
  if (icon.startsWith('/') || icon.startsWith('file://') || icon.startsWith('data:') || icon.includes('.')) {
    return (
      <DatabaseIcon 
        src={icon} 
        alt="Database icon" 
        className={className}
      />
    )
  }
  
  return <span className="text-base leading-none">{icon}</span>
}

