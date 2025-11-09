"use client"

import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: number
  width?: number | string
  height?: number | string
}

export function Logo({ className, size, width, height }: LogoProps) {
  const logoWidth = width || size || "100%"
  const logoHeight = height || size || "100%"

  return (
    <div
      className={cn("flex items-center justify-center", className)}
    >
      <img
        src="/liquiDB.png"
        alt="LiquiDB Logo"
        width={typeof logoWidth === "number" ? logoWidth : undefined}
        height={typeof logoHeight === "number" ? logoHeight : undefined}
        style={{
          width: typeof logoWidth === "string" ? logoWidth : logoWidth,
          height: typeof logoHeight === "string" ? logoHeight : logoHeight,
        }}
        className="object-contain"
      />
    </div>
  )
}

