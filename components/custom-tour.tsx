"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, ChevronRight, Play, Square, Settings, Copy, Check } from "lucide-react"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"
import { useTheme } from "next-themes"
import { notifyInfo } from "@/lib/notifications"
import confetti from "canvas-confetti"
import { 
  MockAddDatabaseDialogStep1, 
  MockAddDatabaseDialogStep2, 
  MockDatabaseCard 
} from "@/components/mock-tour-dialogs"

interface TourStep {
  id: string
  title: string
  description: string
  target?: string
  placement?: "top" | "bottom" | "left" | "right" | "center"
  demo?: boolean
  demoContent?: React.ReactNode
}

const tourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to LiquiDB! 🎉",
    description: "Let's quickly explore how to create and manage databases.",
    placement: "center"
  },
  {
    id: "add-database",
    title: "Create Your First Database",
    description: "Click the 'Add Database' button to get started.",
    target: "[data-testid='add-database-button'], #btn-add-database",
    placement: "bottom"
  },
  {
    id: "database-type-selection",
    title: "Choose Database Type",
    description: "Select from PostgreSQL, MySQL, MongoDB, Redis, and more.",
    placement: "center",
    demo: true,
    demoContent: <MockAddDatabaseDialogStep1 />
  },
  {
    id: "database-configuration",
    title: "Configure Database",
    description: "Set name, port, credentials, and enable auto-start.",
    placement: "center",
    demo: true,
    demoContent: <MockAddDatabaseDialogStep2 />
  },
  {
    id: "database-created",
    title: "Database Created!",
    description: "Your database is ready to use with start/stop controls.",
    placement: "center",
    demo: true,
    demoContent: <MockDatabaseCard />
  },
  {
    id: "database-grid",
    title: "Your Database Collection",
    description: "All your databases appear here with status and controls.",
    target: "[data-testid='database-grid'], .database-grid, #database-list, [data-testid*='database']",
    placement: "top"
  },
  {
    id: "database-actions",
    title: "Database Management",
    description: "Start, stop, and configure your databases easily.",
    placement: "center",
    demo: true,
    demoContent: <MockDatabaseCard />
  },
  {
    id: "complete",
    title: "You're All Set! 🚀",
    description: "Start creating databases and enjoy LiquiDB!",
    placement: "center"
  }
]

export function CustomTour() {
  const [isOpen, setIsOpen] = useState(true) // Tour is open when this component renders
  const [currentStep, setCurrentStep] = useState(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const { theme, resolvedTheme } = useTheme()

  // Set tour mode flag to prevent database creation
  useEffect(() => {
    document.body.setAttribute('data-tour-mode', 'true')
    
    // Show tour mode notification after a short delay to ensure dashboard is visible
    const timer = setTimeout(() => {
      notifyInfo("Tour Mode Active", {
        description: "You're now in tour mode. Database creation is disabled until the tour completes.",
        duration: 4000
      })
    }, 1000) // 1 second delay to ensure dashboard is fully visible
    
    return () => {
      document.body.removeAttribute('data-tour-mode')
      clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    // Simple progression through tour steps - no more real UI interactions
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handleSkip = () => {
    // Show skip notification (no confetti for skipping)
    notifyInfo("Tour Skipped", {
      description: "Tour mode disabled. You can now create databases and use all features.",
      duration: 3000
    })
    setIsOpen(false)
  }

  const triggerConfetti = () => {
    const end = Date.now() + 3 * 1000 // 3 seconds
    const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1"]

    const frame = () => {
      if (Date.now() > end) return

      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors: colors,
      })
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors: colors,
      })

      requestAnimationFrame(frame)
    }

    frame()
  }

  const handleComplete = () => {
    // Trigger confetti celebration
    triggerConfetti()
    
    // Show completion notification
    notifyInfo("Tour Complete! 🎉", {
      description: "Congratulations! You've completed the tour. You can now create databases and use all features.",
      duration: 4000
    })
    
    // Close tour after a short delay to let confetti start
    setTimeout(() => {
      setIsOpen(false)
    }, 500)
  }

  const currentStepData = tourSteps[currentStep]

  // Find target element for highlighting
  useEffect(() => {
    if (currentStepData.target && currentStepData.placement !== 'center') {
      // Try multiple selectors to find the target element
      const selectors = currentStepData.target.split(', ')
      let element: HTMLElement | null = null
      
      for (const selector of selectors) {
        try {
          element = document.querySelector(selector) as HTMLElement
          if (element && element.offsetParent !== null) {
            // Element is visible
            break
          }
        } catch (e) {
          // Invalid selector, continue
          continue
        }
      }
      
      // If still not found, try to find by text content
      if (!element) {
        const buttons = document.querySelectorAll('button')
        for (const button of buttons) {
          if (button.textContent?.includes('Add Database') || button.textContent?.includes('Add')) {
            element = button as HTMLElement
            break
          }
        }
      }
      
      // Verify element is actually visible on screen; if offscreen try scroll into view
      if (element) {
        const rect = element.getBoundingClientRect()
        const inView = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
        if (!inView) {
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
        }
        // Recalculate after potential scroll
        const rect2 = element.getBoundingClientRect()
        const nowInView = rect2.bottom > 0 && rect2.top < window.innerHeight && rect2.right > 0 && rect2.left < window.innerWidth
        if (!nowInView || element.offsetParent === null) {
          element = null
        }
      }
      
      setTargetElement(element)
    } else {
      setTargetElement(null)
    }
  }, [currentStepData.target, currentStepData.placement, currentStep])


  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] tour-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Overlay with proper cutout for target element */}
        {targetElement ? (
          <>
            {/* Top overlay */}
            <motion.div
              className="absolute bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                width: '100%',
                height: targetElement.offsetTop - 8
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            {/* Left overlay */}
            <motion.div
              className="absolute bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                x: 0,
                y: targetElement.offsetTop - 8,
                width: targetElement.offsetLeft - 8,
                height: targetElement.offsetHeight + 16
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            {/* Right overlay */}
            <motion.div
              className="absolute bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                x: targetElement.offsetLeft + targetElement.offsetWidth + 8,
                y: targetElement.offsetTop - 8,
                width: window.innerWidth - (targetElement.offsetLeft + targetElement.offsetWidth + 8),
                height: targetElement.offsetHeight + 16
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
            {/* Bottom overlay */}
            <motion.div
              className="absolute bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: 1,
                x: 0,
                y: targetElement.offsetTop + targetElement.offsetHeight + 8,
                width: '100%',
                height: window.innerHeight - (targetElement.offsetTop + targetElement.offsetHeight + 8)
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            />
          </>
        ) : (
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}

        {/* Highlight Box */}
        {targetElement && (
          <motion.div
            className="absolute border-4 border-primary rounded-lg pointer-events-none shadow-lg"
            style={{
              boxShadow: '0 0 0 4px hsl(var(--primary) / 0.3), 0 0 20px hsl(var(--primary) / 0.5)',
              background: 'hsl(var(--primary) / 0.1)'
            }}
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: 1,
              x: targetElement.offsetLeft - 12,
              y: targetElement.offsetTop - 12,
              width: targetElement.offsetWidth + 24,
              height: targetElement.offsetHeight + 24
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}

        {/* Tour Card */}
        <motion.div
          className={`absolute z-[10000] tour-card ${!targetElement ? 'flex items-center justify-center' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={targetElement ? {
            left: Math.min(
              Math.max(targetElement.offsetLeft + targetElement.offsetWidth / 2 - 200, 20), 
              window.innerWidth - 420
            ),
            top: currentStepData.placement === 'top' 
              ? Math.max(targetElement.offsetTop - 300, 20)
              : Math.min(targetElement.offsetTop + targetElement.offsetHeight + 20, window.innerHeight - 400),
            transform: 'none',
            maxHeight: '80vh',
            overflowY: 'auto'
          } : {
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}
        >
          <Card className="w-80 max-w-[calc(100vw-40px)] shadow-xl bg-card border-border">
            <CardContent className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <Database className="w-4 h-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{currentStepData.title}</h3>
                    <div className="text-xs text-muted-foreground">
                      Step {currentStep + 1} of {tourSteps.length}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-1 mb-4">
                <motion.div
                  className="bg-primary h-1 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-4">
                  {currentStepData.description}
                </p>
                
                {/* Demo Content */}
                {currentStepData.demo && currentStepData.demoContent && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    {currentStepData.demoContent}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentStep === 0}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                  >
                    Skip Tour
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleNext}
                  >
                    {currentStep === tourSteps.length - 1 ? 'Complete' : 'Next'}
                    {currentStep < tourSteps.length - 1 && <ChevronRight className="w-4 h-4 ml-1" />}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// Wrapper component to replace MaybeStartTour
export function MaybeStartTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false)

  useEffect(() => {
    // Check for tour request on mount
    if (wasTourRequested()) {
      setShouldShowTour(true)
      // Clear the tour request immediately
      setTourRequested(false)
    }
  }, [])

  // Listen for tour request changes (in case it's set after component mounts)
  useEffect(() => {
    const checkTourRequest = () => {
      if (wasTourRequested()) {
        setShouldShowTour(true)
        setTourRequested(false)
      }
    }

    // Check immediately
    checkTourRequest()

    // Set up interval to check for tour requests
    const interval = setInterval(checkTourRequest, 100)

    return () => clearInterval(interval)
  }, [])

  // Only render the tour if it was requested
  if (!shouldShowTour) {
    return null
  }

  return <CustomTour />
}
