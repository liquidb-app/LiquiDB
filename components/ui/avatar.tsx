import React from "react"
import { sanitizeImageUrl } from "@/lib/utils"

export function Avatar({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div className={`relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full ${className || ""}`} style={style}>{children}</div>
}

export function AvatarImage({ src, alt, className, draggable, style }: { src?: string; alt?: string; className?: string; draggable?: boolean; style?: React.CSSProperties }) {

  // CodeQL Fix: Ensure src only contains safe protocols
  let safeSrc = undefined;
  if (src && (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:image/') || src.startsWith('file://') || src.startsWith('/'))) {
    safeSrc = src;
  }
  
  return (
    <img
      src={safeSrc}
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
