import { useEffect, useState } from "react"
import { isOnboardingComplete } from "@/lib/preferences"

export const useAppInitialization = (setAppSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>) => {
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [dashboardOpacity, setDashboardOpacity] = useState(0)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const done = isOnboardingComplete()
        setShowOnboarding(!done)
        
        if (done) {
          setDashboardOpacity(1)
        }
      } catch (error) {
        console.error("App initialization error:", error)
        setShowOnboarding(true) // Default to onboarding if check fails
      } finally {
        setIsLoading(false) // Hide loading screen
      }
    }

    initializeApp()
  }, [])

  useEffect(() => {
    if (!isLoading && !showOnboarding && typeof window !== 'undefined' && window.electron?.notifyDashboardReady) {
      const notifyReady = async () => {
        try {
          console.log("[Dashboard] Dashboard is ready, notifying main process...")
          await window.electron?.notifyDashboardReady?.()
          console.log("[Dashboard] Main process notified of dashboard readiness")
        } catch (error) {
          console.error("[Dashboard] Error notifying main process:", error)
        }
      }
      
      const timeoutId = setTimeout(notifyReady, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isLoading, showOnboarding])

  useEffect(() => {
    if (!showOnboarding) {
      const timer = setTimeout(() => {
        setDashboardOpacity(1)
      }, 100) // Small delay to sync with stars fade-out
      return () => clearTimeout(timer)
    }
  }, [showOnboarding])

  useEffect(() => {
    const handler = () => setAppSettingsOpen(true)
    window.addEventListener("open-app-settings", handler as EventListener)
    return () => window.removeEventListener("open-app-settings", handler as EventListener)
  }, [setAppSettingsOpen])

  return {
    isLoading,
    setIsLoading,
    showOnboarding,
    setShowOnboarding,
    dashboardOpacity,
    setDashboardOpacity,
  }
}

