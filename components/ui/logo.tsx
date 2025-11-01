"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface LogoProps {
  className?: string
  size?: number
  width?: number | string
  height?: number | string
}

export function Logo({ className, size, width, height }: LogoProps) {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Determine the effective theme (resolvedTheme handles system theme)
  const effectiveTheme = mounted ? (resolvedTheme || theme) : "light"
  
  // Set color based on theme: white for dark mode, black/dark for light mode
  const colorClass = effectiveTheme === "dark" ? "text-white" : "text-black"

  const logoWidth = width || size || "100%"
  const logoHeight = height || size || "100%"

  return (
    <div
      className={cn("flex items-center justify-center", colorClass, className)}
    >
      <svg
        width={logoWidth}
        height={logoHeight}
        viewBox="0 0 780 347"
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        style={{ fillRule: "evenodd", clipRule: "evenodd", strokeLinecap: "round", strokeMiterlimit: 1.5 }}
      >
        <g transform="matrix(1,0,0,1,-122.236837,-340.464543)">
          <g transform="matrix(0.995398,0,0,1.213141,2.356345,163.072546)">
            <path
              d="M200,282.267C303.99,344.249 407.96,234.551 511.97,234.712C552.394,234.774 592.817,251.429 633.241,268.093C683.129,288.659 733.017,309.241 782.905,298.668C796.603,295.765 810.302,290.513 824,282.267"
              style={{ fill: "none", stroke: "currentColor", strokeWidth: "9.39px" }}
            />
          </g>
          <g transform="matrix(1.213141,0,0,1.213141,-109.128205,310.219454)">
            <path
              d="M200,282.267C303.99,344.249 407.96,234.551 511.97,234.712C602.282,234.851 692.593,317.808 782.905,298.668C796.603,295.765 810.302,290.513 824,282.267"
              style={{ fill: "none", stroke: "currentColor", strokeWidth: "10.3px" }}
            />
          </g>
          <g transform="matrix(0.497699,0,0,0.505118,257.178172,229.419216)">
            <path
              d="M200,282.267C303.99,344.249 407.96,234.551 511.97,234.712C602.282,234.851 692.593,317.808 782.905,298.668C796.603,295.765 810.302,290.513 824,282.267"
              style={{ fill: "none", stroke: "currentColor", strokeWidth: "16.62px" }}
            />
          </g>
        </g>
      </svg>
    </div>
  )
}

