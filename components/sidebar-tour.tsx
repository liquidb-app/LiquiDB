"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  Plus,
  Settings,
  Database,
  Shield,
  Zap,
  CheckCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { notifySuccess, notifyInfo } from "@/lib/notifications"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"
import confetti from "canvas-confetti"
import { Logo } from "@/components/ui/logo"

interface TourStep {
  id: string
  title: string
  description: string
  content: React.ReactNode
  icon: React.ReactNode
  highlight?: string
  action?: string
}

const tourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to LiquiDB!",
    description: "Let's take a quick tour of your database management interface",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-4"
          >
            <Logo size={32} className="text-blue-600 dark:text-blue-400" />
          </motion.div>
          <h3 className="text-lg font-semibold mb-2">Welcome to LiquiDB!</h3>
          <p className="text-muted-foreground text-sm">
            Your powerful local database management tool. Let's explore the key features together.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
            <Zap className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium">Fast Setup</span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200/50 dark:border-green-800/50">
            <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium">Secure</span>
          </div>
        </div>
      </div>
    ),
    icon: <Logo size={20} className="text-primary" />
  },
  {
    id: "interface",
    title: "Interface Overview",
    description: "Understanding the main interface layout",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Interface Overview</h3>
          <p className="text-muted-foreground text-sm">
            The main interface is clean and intuitive, designed for efficient database management.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Database Cards</p>
              <p className="text-xs text-muted-foreground">Visual representation of your databases</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200/50 dark:border-purple-800/50">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Control Panel</p>
              <p className="text-xs text-muted-foreground">Quick actions and settings</p>
            </div>
          </div>
        </div>
      </div>
    ),
    icon: <Settings className="w-5 h-5" />
  },
  {
    id: "databases",
    title: "Database Management",
    description: "Create and manage your local databases",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Database Management</h3>
          <p className="text-muted-foreground text-sm">
            Create, start, stop, and manage multiple database instances with ease.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200/50 dark:border-green-800/50">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <Play className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Start/Stop Databases</p>
              <p className="text-xs text-muted-foreground">Control your database instances</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200/50 dark:border-blue-800/50">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Add New Databases</p>
              <p className="text-xs text-muted-foreground">Create PostgreSQL, MySQL, MongoDB</p>
            </div>
          </div>
        </div>
      </div>
    ),
    icon: <Database className="w-5 h-5" />,
    highlight: "database-cards"
  },
  {
    id: "add-database",
    title: "Add New Database",
    description: "Create your first database instance",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Plus className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Add New Database</h3>
          <p className="text-muted-foreground text-sm">
            Click this button to create your first database instance. You can choose from PostgreSQL, MySQL, or MongoDB.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Multiple Types</p>
              <p className="text-xs text-muted-foreground">PostgreSQL, MySQL, MongoDB</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Quick Setup</p>
              <p className="text-xs text-muted-foreground">Automatic configuration</p>
            </div>
          </div>
        </div>
      </div>
    ),
    icon: <Plus className="w-5 h-5" />,
    highlight: "add-database-button"
  },
  {
    id: "settings",
    title: "Settings & Configuration",
    description: "Customize your experience",
    content: (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center mx-auto mb-3">
            <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Settings & Configuration</h3>
          <p className="text-muted-foreground text-sm">
            Customize your database management experience with powerful settings.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-8 h-8 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Auto-start</p>
              <p className="text-xs text-muted-foreground">Start databases on app launch</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <p className="font-medium text-sm">Security</p>
              <p className="text-xs text-muted-foreground">Manage permissions & access</p>
            </div>
          </div>
        </div>
      </div>
    ),
    icon: <Settings className="w-5 h-5" />,
    highlight: "settings-button"
  },
  {
    id: "complete",
    title: "Tour Complete!",
    description: "You're ready to start managing databases",
    content: (
      <div className="space-y-4 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-xl flex items-center justify-center mx-auto mb-4"
        >
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </motion.div>
        <h3 className="text-lg font-semibold mb-2">Tour Complete!</h3>
        <p className="text-muted-foreground text-sm mb-4">
          You're now ready to start managing your databases. Create your first database and begin building amazing applications!
        </p>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="w-4 h-4" />
          <span>Happy coding!</span>
          <Sparkles className="w-4 h-4" />
        </div>
      </div>
    ),
    icon: <CheckCircle className="w-5 h-5" />
  }
]

interface SidebarTourProps {
  isOpen: boolean
  onClose: () => void
}

// Global flag to prevent duplicate tour notifications
let tourNotificationShown = false

export function SidebarTour({ isOpen, onClose }: SidebarTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      // Set tour mode flag
      document.body.setAttribute('data-tour-mode', 'true')
      
      // Show tour mode notification only once globally
      if (!tourNotificationShown) {
        setTimeout(() => {
          notifyInfo("Tour Mode Active", {
            description: "You're now in tour mode. Database creation is disabled until the tour completes.",
            duration: 4000
          })
          tourNotificationShown = true
        }, 500)
      }
    } else {
      setIsVisible(false)
      // Remove tour mode flag and ensure dashboard returns to normal
      document.body.removeAttribute('data-tour-mode')
      // Force a reflow to ensure CSS changes take effect
      requestAnimationFrame(() => {
        document.body.offsetHeight // Force reflow
        // Ensure all elements with tour-mode classes reset
        const tourModeElements = document.querySelectorAll('.tour-mode\\:ml-80')
        tourModeElements.forEach(el => {
          (el as HTMLElement).style.marginLeft = ''
          (el as HTMLElement).style.maxWidth = ''
          (el as HTMLElement).style.width = ''
        })
      })
      setTargetElement(null)
      tourNotificationShown = false // Reset for next time
    }
  }, [isOpen])

  // Update target element when step changes
  useEffect(() => {
    if (!isOpen) return

    const currentStepData = tourSteps[currentStep]
    if (currentStepData.highlight) {
      // Wait a bit for the UI to settle
      const timer = setTimeout(() => {
        const element = document.querySelector(`[data-tour="${currentStepData.highlight}"]`) as HTMLElement
        if (element) {
          setTargetElement(element)
        } else {
          // Fallback selectors for common elements
          let fallbackElement: HTMLElement | null = null
          
          switch (currentStepData.highlight) {
            case 'database-cards':
              fallbackElement = document.querySelector('[data-testid="database-cards"]') as HTMLElement ||
                               document.querySelector('.grid') as HTMLElement
              break
            case 'settings-button':
              fallbackElement = document.querySelector('[data-testid="settings-button"]') as HTMLElement ||
                               document.querySelector('button[aria-label*="settings"]') as HTMLElement ||
                               document.querySelector('button:has(svg)') as HTMLElement
              break
            case 'add-database-button':
              fallbackElement = document.querySelector('[data-testid="add-database"]') as HTMLElement ||
                               document.querySelector('button:has-text("Add Database")') as HTMLElement
              break
          }
          
          if (fallbackElement) {
            setTargetElement(fallbackElement)
          }
        }
      }, 100)

      return () => clearTimeout(timer)
    } else {
      setTargetElement(null)
    }
  }, [currentStep, isOpen])

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }, [currentStep])

  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }, [currentStep])

  const handleSkip = useCallback(() => {
    notifyInfo("Tour Skipped", {
      description: "Tour mode disabled. You can now create databases and use all features.",
      duration: 3000
    })
    // Remove tour mode flag before closing
    document.body.removeAttribute('data-tour-mode')
    requestAnimationFrame(() => {
      document.body.offsetHeight // Force reflow
    })
    onClose()
  }, [onClose])

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          handleNext()
          break
        case 'ArrowRight':
          event.preventDefault()
          handleNext()
          break
        case 'ArrowLeft':
        case 'Backspace':
          event.preventDefault()
          handlePrevious()
          break
        case 'Escape':
          event.preventDefault()
          handleSkip()
          break
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleNext, handlePrevious, handleSkip])

  const handleComplete = useCallback(() => {
    // Trigger confetti
    const end = Date.now() + 3 * 1000
    const colors = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b']
    
    const frame = () => {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors
      })
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors
      })
      
      if (Date.now() < end) {
        requestAnimationFrame(frame)
      }
    }
    frame()

    notifySuccess("Tour Complete!", {
      description: "You're ready to start managing databases. Create your first database to get started!",
      duration: 5000
    })

    // Remove tour mode flag before closing
    document.body.removeAttribute('data-tour-mode')
    requestAnimationFrame(() => {
      document.body.offsetHeight // Force reflow
    })
    onClose()
  }, [onClose])

  const currentStepData = tourSteps[currentStep]

  if (!isVisible) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[99999]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Overlay with cutout for highlighted element */}
          {targetElement && currentStepData.highlight && (
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
              {/* Highlight border around target element */}
              <motion.div
                className="absolute border-2 border-primary rounded-lg shadow-lg"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1,
                  scale: 1,
                  x: targetElement.offsetLeft - 4,
                  y: targetElement.offsetTop - 4,
                  width: targetElement.offsetWidth + 8,
                  height: targetElement.offsetHeight + 8
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </>
          )}

          <SidebarProvider defaultOpen={true}>
            <div className="flex h-screen">
              {/* Tour sidebar - positioned on left */}
              <Sidebar className="border-r shadow-2xl fixed left-0 top-0 h-full w-full sm:w-80 md:w-80 lg:w-80 z-[99999] bg-gradient-to-b from-background to-muted/20">
                <SidebarHeader className="border-b pt-8">
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-primary/10 rounded-lg flex items-center justify-center">
                      {currentStepData.icon}
                    </div>
                    <div>
                      <h2 className="font-semibold text-sm">Tour Guide</h2>
                      <p className="text-xs text-muted-foreground">
                        Step {currentStep + 1} of {tourSteps.length}
                      </p>
                    </div>
                  </div>
                </SidebarHeader>

                <SidebarContent className="p-3">
                  <Card className="border-0 shadow-none bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
                          {currentStepData.title}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg">{currentStepData.title}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {currentStepData.description}
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0 pb-3">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentStep}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                        >
                          {currentStepData.content}
                        </motion.div>
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </SidebarContent>

                <SidebarFooter className="border-t p-2">
                  <div className="space-y-2">
                    {/* Progress indicator */}
                    <div className="flex items-center justify-center gap-2">
                      {tourSteps.map((_, index) => (
                        <div
                          key={index}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentStep
                              ? 'bg-primary'
                              : index < currentStep
                              ? 'bg-primary/60'
                              : 'bg-muted-foreground/40'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Navigation buttons */}
                    <div className="flex items-center justify-between gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={currentStep === 0}
                        className="flex items-center gap-1 px-2 text-xs"
                      >
                        <ChevronLeft className="w-3 h-3" />
                        Back <Kbd>←</Kbd>
                      </Button>

                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSkip}
                          className="text-muted-foreground hover:text-foreground px-2 text-xs"
                        >
                          Skip <Kbd>Esc</Kbd>
                        </Button>
                        
                        <Button
                          size="sm"
                          onClick={handleNext}
                          className="flex items-center gap-1 px-2 text-xs"
                        >
                          {currentStep === tourSteps.length - 1 ? (
                            <>
                              Complete
                              <CheckCircle className="w-3 h-3" />
                              <Kbd>⏎</Kbd>
                            </>
                          ) : (
                            <>
                              Next
                              <Kbd>→</Kbd>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </SidebarFooter>
              </Sidebar>
              
              {/* Main content area - positioned next to sidebar */}
              <div className="flex-1 transition-all duration-300 sm:ml-80 md:ml-80 lg:ml-80 min-w-0">
                {/* This will be the main app content */}
              </div>
            </div>
          </SidebarProvider>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Wrapper component to replace MaybeStartTour
export function MaybeStartSidebarTour() {
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

    // Set up interval to check for tour requests
    const interval = setInterval(checkTourRequest, 100)

    return () => clearInterval(interval)
  }, []) // Empty dependency array - this effect should only run once

  const handleClose = () => {
    setShouldShowTour(false)
  }

  // Only render the tour if it was requested
  if (!shouldShowTour) {
    return null
  }

  return <SidebarTour isOpen={shouldShowTour} onClose={handleClose} />
}
