"use client"

import React, { useEffect } from "react"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"

// Skeleton shim: if onborda is present, lazy load it; otherwise no-op
export function MaybeStartTour() {
  useEffect(() => {
    if (!wasTourRequested()) return
    async function start() {
      try {
        const mod = await import("onborda").catch(() => null as any)
        if (!mod) return
        const { createTour } = mod as any
        const tour = createTour({ id: "quick-start" })
        tour
          .step({
            element: "#btn-add-database",
            title: "Create a database",
            description: "Click here to spin up your first container.",
            placement: "bottom",
          })
          .step({
            element: "#btn-open-settings",
            title: "App settings",
            description: "Manage theme, notifications, helper service and more.",
            placement: "left",
          })
        tour.start()
      } finally {
        setTourRequested(false)
      }
    }
    start()
  }, [])
  return null
}




