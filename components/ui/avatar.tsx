export function Avatar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`relative flex h-8 w-8 shrink-0 overflow-hidden rounded-full ${className || ""}`}>{children}</div>
}

export function AvatarImage({ src, alt, className }: { src?: string; alt?: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`aspect-square h-full w-full object-cover ${className || ""}`}
    />
  )
}

export function AvatarFallback({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-full bg-muted ${className || ""}`}>
      {children}
    </div>
  )
}
