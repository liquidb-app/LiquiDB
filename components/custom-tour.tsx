"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, ChevronLeft, ChevronRight, Database, Play, Square, Settings, Copy, Check } from "lucide-react"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"
import { useTheme } from "next-themes"
import { notifyInfo } from "@/lib/notifications"
import confetti from "canvas-confetti"

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
    description: "Let's take a quick tour to learn how to create and manage your databases. This tour will show you the key features without actually creating anything.",
    placement: "center"
  },
  {
    id: "add-database",
    title: "Create Your First Database",
    description: "Let's walk through creating a database. Click 'Next' and we'll show you the complete process step by step.",
    target: "[data-testid='add-database-button'], #btn-add-database",
    placement: "bottom"
  },
  {
    id: "database-creation-intro",
    title: "Database Creation Walkthrough",
    description: "We'll now demonstrate how to create a database. This is a demo - no actual database will be created during the tour.",
    placement: "center",
    demo: false
  },
  {
    id: "database-type-selection",
    title: "Step 1: Choose Database Type",
    description: "First, you'll see a dialog where you select your database type. Choose from PostgreSQL, MySQL, MongoDB, Redis, MariaDB, and many others. Each database type has its own configuration options.",
    placement: "center",
    demo: true,
    demoContent: (
      <div className="space-y-3 max-w-sm">
        <div className="text-sm font-medium mb-2">Available Database Types:</div>
        <div className="grid grid-cols-2 gap-2">
          {['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'MariaDB', 'Cassandra'].map((db) => (
            <div key={db} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
              <Database className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{db}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    id: "database-configuration",
    title: "Step 2: Configure Database",
    description: "After selecting the database type, you'll configure: Port number, Database name, Username, Password, and Version. The app automatically suggests available ports.",
    placement: "center",
    demo: true,
    demoContent: (
      <div className="space-y-2 max-w-sm">
        <div className="text-sm font-medium mb-2">Configuration Options:</div>
        <div className="space-y-2">
          <div className="p-2 border rounded-lg bg-muted/50">
            <div className="text-xs font-medium text-muted-foreground">Port</div>
            <div className="text-sm">5432 (Auto-detected)</div>
          </div>
          <div className="p-2 border rounded-lg bg-muted/50">
            <div className="text-xs font-medium text-muted-foreground">Database Name</div>
            <div className="text-sm">my_database</div>
          </div>
          <div className="p-2 border rounded-lg bg-muted/50">
            <div className="text-xs font-medium text-muted-foreground">Credentials</div>
            <div className="text-sm">Username & Password</div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "database-auto-start",
    title: "Step 3: Auto-Start Options",
    description: "Choose whether the database should automatically start when you open the app. This is useful for databases you use frequently.",
    placement: "center",
    demo: true,
    demoContent: (
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
          <input type="checkbox" className="w-4 h-4" checked readOnly />
          <div className="text-sm">Start database automatically on app launch</div>
        </div>
        <div className="text-xs text-muted-foreground">
          Enable this for databases you use regularly to save time.
        </div>
      </div>
    )
  },
  {
    id: "database-created",
    title: "Database Created Successfully!",
    description: "Once configured, your database container will be created and ready to use. You'll see it appear in your database list with status indicators and management controls.",
    placement: "center",
    demo: true,
    demoContent: (
      <div className="space-y-2 max-w-sm">
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-green-50 dark:bg-green-900/20">
          <Check className="w-5 h-5 text-green-500" />
          <div className="flex-1">
            <div className="font-medium text-sm text-green-700 dark:text-green-300">PostgreSQL 15</div>
            <div className="text-xs text-green-600 dark:text-green-400">Ready to use • Port: 5432</div>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "database-grid",
    title: "Your Database Collection",
    description: "This is where all your database containers will appear. Each card shows the database status, connection details, and quick actions like start, stop, and settings.",
    target: "[data-testid='database-grid'], .database-grid, #database-list, [data-testid*='database']",
    placement: "top"
  },
  {
    id: "database-actions",
    title: "Database Management",
    description: "Each database card provides quick actions:",
    placement: "center",
    demo: true,
    demoContent: (
      <div className="space-y-2 max-w-xs">
        <div className="flex items-center gap-2 p-2 border rounded-lg bg-card">
          <Database className="w-4 h-4 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">PostgreSQL 15</div>
            <div className="text-xs text-muted-foreground">Port: 5432 • Running</div>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
              <Play className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
              <Square className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="outline" className="h-6 w-6 p-0">
              <Settings className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>• <strong>Play:</strong> Start database</div>
          <div>• <strong>Square:</strong> Stop database</div>
          <div>• <strong>Settings:</strong> Configure database</div>
        </div>
      </div>
    )
  },
  {
    id: "settings",
    title: "Application Settings",
    description: "Click 'Next' to open your profile menu and see all available app preferences, theme settings, notification preferences, and helper service configuration options.",
    target: "[data-testid='profile-menu'] button, .profile-menu button, [aria-label='Open profile menu']",
    placement: "left"
  },
  {
    id: "profile-menu-open",
    title: "Profile Menu Opened",
    description: "Perfect! This is your profile dropdown menu. It contains your user information, theme selection (light/dark/system), settings access, help & support, and account management options. You can see all the available settings here.",
    target: "[role='menu'], [data-radix-dropdown-menu-content], [data-radix-popper-content-wrapper]",
    placement: "left"
  },
  {
    id: "profile",
    title: "Your Profile Menu",
    description: "This dropdown menu contains your user profile information, theme selection options, and application settings. You can change themes, access settings, and manage your account from here.",
    target: "[role='menu'], [data-radix-dropdown-menu-content], [data-radix-popper-content-wrapper]",
    placement: "bottom"
  },
  {
    id: "complete",
    title: "Tour Complete! 🎉",
    description: "You're all set! You now know how to create and manage databases in LiquiDB. Click 'Add Database' to create your first database, or explore the settings to customize your experience.",
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
    // Allow the tour to temporarily open UI it needs to demo
    document.body.setAttribute('data-tour-allow-ui', 'true')
    
    // Show tour mode notification after a short delay to ensure dashboard is visible
    const timer = setTimeout(() => {
      notifyInfo("Tour Mode Active", {
        description: "You're now in tour mode. Database creation is disabled until the tour completes.",
        duration: 4000
      })
    }, 1000) // 1 second delay to ensure dashboard is fully visible
    
    return () => {
      document.body.removeAttribute('data-tour-mode')
      document.body.removeAttribute('data-tour-allow-ui')
      clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    // Drive real UI for Add Database flow
    if (currentStepData.id === 'add-database') {
      const addButton = document.querySelector('[data-testid="add-database-button"], #btn-add-database') as HTMLElement
      if (addButton) {
        addButton.click()
        setTimeout(() => {
          // highlight dialog content
          const dialog = document.querySelector('[role="dialog"], [data-radix-dialog-content]') as HTMLElement
          if (dialog) setTargetElement(dialog)
          if (currentStep < tourSteps.length - 1) setCurrentStep(currentStep + 1)
        }, 700)
        return
      }
    }

    // Special handling for settings step - open the menu and go to next step
    if (currentStepData.id === 'settings') {
      // Find and click the profile button
      const profileButton = document.querySelector('[data-testid="profile-menu"] button, [aria-label="Open profile menu"]') as HTMLElement
      if (profileButton) {
        profileButton.click()
        
        // Wait for dropdown to open, then proceed to next step
        setTimeout(() => {
          if (currentStep < tourSteps.length - 1) {
            setCurrentStep(currentStep + 1)
          } else {
            handleComplete()
          }
        }, 800) // Longer delay to ensure menu opens
      } else {
        // Fallback to normal progression if button not found
        if (currentStep < tourSteps.length - 1) {
          setCurrentStep(currentStep + 1)
        } else {
          handleComplete()
        }
      }
    } else {
      // Normal auto-click for other steps
      if (targetElement && currentStepData.target) {
        const clickableElement = targetElement.closest('button, [role="button"], a, [onclick]')
        if (clickableElement) {
          setTimeout(() => {
            (clickableElement as HTMLElement).click()
          }, 200)
        }
      }

      if (currentStep < tourSteps.length - 1) {
        setCurrentStep(currentStep + 1)
      } else {
        handleComplete()
      }
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
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
