"use client"

import dynamic from "next/dynamic"

// Dynamically import Analytics only if not in Electron
const Analytics = dynamic(
  () => {
    if (typeof window !== 'undefined' && (window as any).electron) {
      // Return a no-op component for Electron
      return Promise.resolve(() => null)
    }
    return import("@vercel/analytics/next").then((mod) => mod.Analytics)
  },
  { ssr: false }
)

export function AnalyticsWrapper() {
  // The dynamic import already handles the Electron check
  return <Analytics />
}
