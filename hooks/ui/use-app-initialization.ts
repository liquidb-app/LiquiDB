import { useEffect, useState } from "react"
import { isOnboardingComplete } from "@/lib/preferences"

export const useAppInitialization = (setAppSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>) => {
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [dashboardOpacity, setDashboardOpacity] = useState(0)

  // App initialization - check onboarding status after loading
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Simulate app initialization time
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Check onboarding status
        const done = isOnboardingComplete()
        setShowOnboarding(!done)
        
        // If onboarding is complete, fade in dashboard
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

  // Notify main process when dashboard is ready (loaded and onboarding complete)
  useEffect(() => {
    // Dashboard is ready when loading is complete and onboarding is not showing
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
      
      // Small delay to ensure everything is fully initialized
      const timeoutId = setTimeout(notifyReady, 100)
      
      return () => clearTimeout(timeoutId)
    }
  }, [isLoading, showOnboarding])

  // Dashboard fade-in effect when onboarding finishes
  useEffect(() => {
    if (!showOnboarding) {
      // Fade in dashboard when onboarding is hidden
      const timer = setTimeout(() => {
        setDashboardOpacity(1)
      }, 100) // Small delay to sync with stars fade-out
      return () => clearTimeout(timer)
    }
  }, [showOnboarding])

  // Allow profile menu to open settings via event
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

