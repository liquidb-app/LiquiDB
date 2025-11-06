"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { X, ChevronLeft, ChevronRight, Play, Square, Settings, Check, Zap, Shield, ArrowRight, Info } from "lucide-react"
import { BoxesIcon } from "@/components/ui/boxes"
import { Logo } from "@/components/ui/logo"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"
import { useTheme } from "next-themes"
import { notifyInfo } from "@/lib/notifications"
import confetti from "canvas-confetti"

interface TourStep {
  id: string
  title: string
  description: string
  details?: string[]
  target?: string
  placement?: "top" | "bottom" | "left" | "right" | "center"
  demo?: boolean
  demoContent?: React.ReactNode
  highlight?: boolean
  icon?: React.ReactNode
}

const tourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to LiquiDB! 🎉",
    description: "Let's take a comprehensive tour to learn how to create and manage your databases. This interactive tour will show you all the key features with live mockups.",
    details: [
      "Learn how to create databases in just 2 steps",
      "Understand database management controls",
      "See how to configure ports and settings",
      "Discover advanced features and tips"
    ],
    placement: "center",
    icon: <Logo size={24} className="text-primary" />
  },
  {
    id: "add-database",
    title: "Create Your First Database",
    description: "The 'Add Database' button is your gateway to creating new database containers. Click it to start the simple 2-step process.",
    details: [
      "Supports PostgreSQL, MySQL, MongoDB, Redis, MariaDB",
      "Automatic port detection and conflict resolution",
      "One-click database creation and startup",
      "Built-in health monitoring and status tracking"
    ],
    target: "[data-testid='add-database-button'], #btn-add-database, button:has-text('Add Database')",
    placement: "left",
    highlight: true,
    icon: <Zap className="w-5 h-5 text-green-500" />
  },
  {
    id: "database-type-selection",
    title: "Step 1: Choose Your Database Type",
    description: "Select from a wide variety of database engines. Each type comes with optimized default configurations and automatic port assignment.",
    details: [
      "PostgreSQL: Advanced relational database",
      "MySQL: Popular web application database", 
      "MongoDB: Document-based NoSQL database",
      "Redis: High-performance in-memory database",
      "MariaDB: MySQL-compatible alternative"
    ],
    placement: "center",
    icon: <BoxesIcon size={20} className="text-blue-500" />
  },
  {
    id: "database-configuration",
    title: "Step 2: Configure Your Database",
    description: "Customize your database settings including name, credentials, port, and version. The app intelligently suggests available ports and optimal configurations.",
    details: [
      "Smart port conflict detection",
      "Auto-generated secure passwords",
      "Version selection for compatibility",
      "Auto-start option for convenience",
      "Environment variable management"
    ],
    placement: "center",
    icon: <Settings className="w-5 h-5 text-purple-500" />
  },
  {
    id: "database-created",
    title: "Database Successfully Created!",
    description: "Your database container is now running and ready to use. The card shows real-time status, connection details, and management controls.",
    details: [
      "Real-time status monitoring",
      "Quick connection details",
      "One-click start/stop controls",
      "Port and process information",
      "Health status indicators"
    ],
    placement: "center",
    icon: <Check className="w-5 h-5 text-green-500" />
  },
  {
    id: "database-grid",
    title: "Your Database Collection",
    description: "This is your central dashboard where all database containers are displayed. Each card provides quick access to essential information and controls.",
    details: [
      "Visual status indicators (Running, Stopped, Error)",
      "Quick action buttons for common tasks",
      "Connection details and port information",
      "Resource usage monitoring",
      "Bulk operations support"
    ],
    target: "[data-testid='database-grid'], .database-grid, #database-list, [data-testid*='database'], .grid",
    placement: "left",
    highlight: true,
    icon: <BoxesIcon size={20} className="text-indigo-500" />
  },
  {
    id: "tabs-overview",
    title: "Organize Your Databases with Tabs",
    description: "Use the tabs at the top to filter and organize your databases by status. This helps you quickly find and manage databases based on whether they're running or stopped.",
    details: [
      "📦 All: View every database you've created",
      "🟢 Active: See only running or starting databases",
      "⚪ Inactive: View stopped databases only",
      "Quick switching between views",
      "Each tab shows count badges for easy reference"
    ],
    target: "[data-slot='tabs-list'], [role='tablist'], .grid.w-full.grid-cols-3",
    placement: "bottom",
    highlight: true,
    icon: <BoxesIcon size={20} className="text-blue-500" />
  },
  {
    id: "tabs-all",
    title: "All Tab: Complete Overview",
    description: "The 'All' tab displays every database in your collection, regardless of status. This is perfect for getting a comprehensive view of all your databases at once.",
    details: [
      "Shows all databases (running, stopped, starting, etc.)",
      "Total count badge shows your complete database collection",
      "Useful for bulk operations across all databases",
      "See the full picture of your database infrastructure",
      "Easy access to all databases from one place"
    ],
    target: "[data-slot='tabs-trigger'][value='all'], button[value='all'], [role='tab'][value='all']",
    placement: "bottom",
    highlight: true,
    icon: <BoxesIcon size={20} className="text-purple-500" />
  },
  {
    id: "tabs-active",
    title: "Active Tab: Running Databases",
    description: "The 'Active' tab filters to show only databases that are currently running or starting. The yellow pulsing indicator shows when you have active databases.",
    details: [
      "Shows databases with status 'running' or 'starting'",
      "Yellow pulsing dot indicates active databases present",
      "Perfect for monitoring active workloads",
      "Quick view of databases consuming resources",
      "Active count badge updates in real-time"
    ],
    target: "[data-slot='tabs-trigger'][value='active'], button[value='active'], [role='tab'][value='active']",
    placement: "bottom",
    highlight: true,
    icon: <Zap className="w-5 h-5 text-green-500" />
  },
  {
    id: "tabs-inactive",
    title: "Inactive Tab: Stopped Databases",
    description: "The 'Inactive' tab displays only databases that are currently stopped. This helps you quickly identify databases that need to be started or can be safely removed.",
    details: [
      "Shows only databases with 'stopped' status",
      "Gray indicator for inactive databases",
      "Perfect for finding databases ready to start",
      "Useful for cleanup and organization",
      "Helps identify unused or dormant databases"
    ],
    target: "[data-slot='tabs-trigger'][value='inactive'], button[value='inactive'], [role='tab'][value='inactive']",
    placement: "bottom",
    highlight: true,
    icon: <Square className="w-5 h-5 text-gray-500" />
  },
  {
    id: "database-actions",
    title: "Database Management Controls",
    description: "Each database card includes powerful management controls. Learn how to start, stop, configure, and monitor your databases efficiently.",
    details: [
      "▶️ Start: Launch stopped databases",
      "⏹️ Stop: Gracefully shutdown databases", 
      "⚙️ Settings: Configure ports, versions, and more",
      "📋 Copy: Quick access to connection strings",
      "📊 Monitor: View logs and performance metrics"
    ],
    placement: "center",
    icon: <Play className="w-5 h-5 text-orange-500" />
  },
  {
    id: "complete",
    title: "Tour Complete! You're Ready to Go! 🎉",
    description: "Congratulations! You now have all the knowledge needed to effectively use LiquiDB. Start creating your databases and explore the advanced features.",
    details: [
      "Create your first database now",
      "Explore settings and preferences",
      "Try different database types",
      "Set up auto-start for convenience",
      "Join our community for tips and support"
    ],
    placement: "center",
    icon: <Shield className="w-6 h-6 text-primary" />
  }
]

export function CustomTour() {
  const [isOpen, setIsOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  useTheme()

  useEffect(() => {
    document.body.setAttribute('data-tour-mode', 'true')
    
    const timer = setTimeout(() => {
      notifyInfo("Tour Mode Active", {
        description: "You're now in tour mode. Database creation is disabled until the tour completes.",
        duration: 4000
      })
    }, 1000)
    
    return () => {
      document.body.removeAttribute('data-tour-mode')
      clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    notifyInfo("Tour Skipped", {
      description: "Tour mode disabled. You can now create databases and use all features.",
      duration: 3000
    })
    // Remove tour mode flag and force reflow to ensure CSS updates
    document.body.removeAttribute('data-tour-mode')
    void document.body.offsetHeight // Force reflow
    setIsOpen(false)
  }

  const triggerConfetti = () => {
    const end = Date.now() + 3 * 1000
    // Use fixed colorful colors regardless of theme
    const colors = ["#a786ff", "#fd8bbc", "#eca184", "#f8deb1", "#4ade80", "#60a5fa", "#fbbf24", "#f472b6"]

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
    triggerConfetti()
    
    notifyInfo("Tour Complete! 🎉", {
      description: "Congratulations! You've completed the tour. You can now create databases and use all features.",
      duration: 4000
    })
    
    setTimeout(() => {
      // Remove tour mode flag and force reflow to ensure CSS updates
      document.body.removeAttribute('data-tour-mode')
      void document.body.offsetHeight // Force reflow
      setIsOpen(false)
    }, 500)
  }

  const currentStepData = tourSteps[currentStep]
  
  const getTourPosition = () => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const tourCardWidth = 420
    const margin = 20
    
    if (currentStepData.demo) {
      return {
        left: `${margin}px`,
        top: `${margin}px`,
        width: `${tourCardWidth}px`,
        height: `${viewportHeight - margin * 2}px`,
        position: 'fixed' as const,
        zIndex: 99999
      }
    } else if (targetElement && currentStepData.highlight) {
      return {
        left: `${margin}px`,
        top: `${margin}px`,
        width: `${tourCardWidth}px`,
        height: `${viewportHeight - margin * 2}px`,
        position: 'fixed' as const,
        zIndex: 99999
      }
    } else {
      return {
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${Math.min(tourCardWidth, viewportWidth - margin * 2)}px`,
        position: 'fixed' as const,
        zIndex: 99999
      }
    }
  }

  const getMockupPosition = () => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const tourCardWidth = 420
    const margin = 20
    
    if (currentStepData.demo) {
      return {
        left: `${tourCardWidth + margin * 2}px`,
        top: `${margin}px`,
        width: `${viewportWidth - tourCardWidth - margin * 3}px`,
        height: `${viewportHeight - margin * 2}px`,
        position: 'fixed' as const,
        zIndex: 99998
      }
    }
    return null
  }

  useEffect(() => {
    const handleResize = () => {
      setCurrentStep(prev => prev)
    }
    
    const handleScroll = () => {
      setCurrentStep(prev => prev)
    }
    
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  useEffect(() => {
    if (currentStepData.target && currentStepData.placement !== 'center') {
      const selectors = currentStepData.target.split(', ')
      let element: HTMLElement | null = null
      
      for (const selector of selectors) {
        try {
          element = document.querySelector(selector) as HTMLElement
          if (element && element.offsetParent !== null) {
            break
          }
        } catch {
          continue
        }
      }
      
      if (!element) {
        const buttons = document.querySelectorAll('button')
        for (const button of buttons) {
          if (button.textContent?.includes('Add Database') || button.textContent?.includes('Add')) {
            element = button as HTMLElement
            break
          }
        }
      }
      
      if (element) {
        const rect = element.getBoundingClientRect()
        const inView = rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth
        if (!inView) {
          element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior })
        }
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

  const mockupPosition = getMockupPosition()

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[99998] tour-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Overlay with proper cutout for target element */}
        {targetElement && currentStepData.highlight ? (
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
        ) : !currentStepData.demo ? (
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        ) : null}

        {/* Highlight Box */}
        {targetElement && currentStepData.highlight && (
          <motion.div
            className="absolute border-4 border-primary rounded-lg pointer-events-none"
            style={{
              boxShadow: '0 0 0 2px hsl(var(--primary) / 0.2)',
            }}
            initial={{ opacity: 0 }}
            animate={{ 
              opacity: 1,
              x: targetElement.offsetLeft - 8,
              y: targetElement.offsetTop - 8,
              width: targetElement.offsetWidth + 16,
              height: targetElement.offsetHeight + 16
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          />
        )}

        {/* Mockup Display Area */}
        {currentStepData.demo && mockupPosition && (
          <motion.div
            className="absolute bg-background/95 backdrop-blur-sm border border-border rounded-lg shadow-xl"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            style={mockupPosition}
          >
            <div className="p-6 h-full overflow-auto">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-lg">Interactive Demo</h3>
              </div>
              <div className="flex justify-center items-center h-full min-h-[400px]">
                {currentStepData.demoContent}
              </div>
            </div>
          </motion.div>
        )}

        {/* Tour Card */}
        <motion.div
          className="absolute z-[99999] tour-card"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          style={getTourPosition()}
        >
          <Card className="w-full h-full shadow-xl bg-card border-border pointer-events-auto relative z-[99999] overflow-hidden">
            <CardContent className="p-6 h-full flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {currentStepData.icon}
                  <div>
                    <h3 className="font-semibold text-lg">{currentStepData.title}</h3>
                    <div className="text-xs text-muted-foreground">
                      Step {currentStep + 1} of {tourSteps.length}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  className="h-8 w-8 p-0 pointer-events-auto"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted rounded-full h-2 mb-6">
                <motion.div
                  className="bg-primary h-2 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto">
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {currentStepData.description}
                </p>
                
                {/* Details List */}
                {currentStepData.details && (
                  <div className="space-y-2 mb-6">
                    {currentStepData.details.map((detail, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-2 text-sm"
                      >
                        <ArrowRight className="w-3 h-3 text-primary mt-1 flex-shrink-0" />
                        <span className="text-muted-foreground">{detail}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  disabled={currentStep === 0}
                  className="pointer-events-auto"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>

                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSkip}
                    className="pointer-events-auto"
                  >
                    Skip Tour
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleNext}
                    className="pointer-events-auto"
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

export function MaybeStartTour() {
  const [shouldShowTour, setShouldShowTour] = useState(false)

  useEffect(() => {
    if (wasTourRequested()) {
      setShouldShowTour(true)
      setTourRequested(false)
    }
  }, [])

  useEffect(() => {
    const checkTourRequest = () => {
      if (wasTourRequested()) {
        setShouldShowTour(true)
        setTourRequested(false)
      }
    }

    checkTourRequest()

    const interval = setInterval(checkTourRequest, 100)

    return () => clearInterval(interval)
  }, [])

  if (!shouldShowTour) {
    return null
  }

  return <CustomTour />
}
