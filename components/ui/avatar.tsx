import React from "react"
import { sanitizeImageUrl } from "@/lib/utils"

export function Avatar({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full ${className || ""}`} style={style}>{children}</div>
}

export function AvatarImage({ src, alt, className, draggable, style }: { src?: string; alt?: string; className?: string; draggable?: boolean; style?: React.CSSProperties }) {
  // Sanitize URL to prevent XSS vulnerabilities
  const sanitizedSrc = sanitizeImageUrl(src)
  
  return (
    <img
      src={sanitizedSrc || undefined}
      alt={alt}
      className={`aspect-square h-full w-full object-cover ${className || ""}`}
      draggable={draggable}
      style={style}
    />
  )
}

export function AvatarFallback({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-full bg-muted ${className || ""}`} style={style}>
      {children}
    </div>
  )
}
