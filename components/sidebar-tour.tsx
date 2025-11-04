"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Badge } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  ChevronLeft,
  CheckCircle,
} from "lucide-react"
import { notifySuccess, notifyInfo } from "@/lib/notifications"
import { wasTourRequested, setTourRequested } from "@/lib/preferences"
import confetti from "canvas-confetti"
import { Logo } from "@/components/ui/logo"
import { LayoutPanelTopIcon } from "@/components/ui/layout-panel-top"
import { FoldersIcon } from "@/components/ui/folders"
import { PlusIcon } from "@/components/ui/plus"
import { SettingsIcon } from "@/components/ui/settings"
import { useTheme } from "next-themes"
import { Skeleton } from "@/components/ui/skeleton"

interface Quote {
  quote: string
  author: string
}

// Fallback quotes in case API fails
const FALLBACK_QUOTES: Quote[] = [
  {
    quote: "Programs must be written for people to read, and only incidentally for machines to execute.",
    author: "Harold Abelson"
  },
  {
    quote: "The best way to get a project done faster is to start sooner.",
    author: "Jim Highsmith"
  },
  {
    quote: "First, solve the problem. Then, write the code.",
    author: "John Johnson"
  },
  {
    quote: "Code is like humor. When you have to explain it, it&apos;s bad.",
    author: "Cory House"
  },
  {
    quote: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci"
  },
  {
    quote: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.",
    author: "Martin Fowler"
  },
  {
    quote: "The only way to learn a new programming language is by writing programs in it.",
    author: "Dennis Ritchie"
  },
  {
    quote: "Programming isn&apos;t about what you know; it&apos;s about what you can figure out.",
    author: "Chris Pine"
  }
]

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
    title: "Welcome to LiquiDB",
    description: "Let's take a quick tour of your database management interface",
    content: (
      <div className="space-y-3">
        <div className="flex items-center justify-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <Logo size={32} />
          </motion.div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/20 border border-border/50">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/80" />
            <span className="text-sm text-muted-foreground">Fast Setup</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/20 border border-border/50">
            <div className="w-1.5 h-1.5 rounded-full bg-primary/80" />
            <span className="text-sm text-muted-foreground">Secure</span>
          </div>
        </div>
      </div>
    ),
    icon: <Logo size={20} />
  },
  {
    id: "interface",
    title: "Interface Overview",
    description: "Understanding the main interface layout",
    icon: <LayoutPanelTopIcon size={20} className="text-muted-foreground" />,
    content: (
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
            <p className="text-sm font-medium mb-1">Database Cards</p>
            <p className="text-xs text-muted-foreground">Visual representation of your databases</p>
          </div>
          <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
            <p className="text-sm font-medium mb-1">Control Panel</p>
            <p className="text-xs text-muted-foreground">Quick actions and settings</p>
          </div>
        </div>
      </div>
    )
  },
  {
    id: "databases",
    title: "Database Management",
    description: "Create and manage your local databases",
    content: (
      <div className="space-y-2">
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Start/Stop Databases</p>
          <p className="text-xs text-muted-foreground">Control your database instances</p>
        </div>
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Add New Databases</p>
          <p className="text-xs text-muted-foreground">Create PostgreSQL, MySQL, MongoDB</p>
        </div>
      </div>
    ),
    icon: <FoldersIcon size={20} className="text-muted-foreground" />,
    highlight: "database-cards"
  },
  {
    id: "add-database",
    title: "Add New Database",
    description: "Create your first database instance",
    content: (
      <div className="space-y-2">
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Multiple Types</p>
          <p className="text-xs text-muted-foreground">PostgreSQL, MySQL, MongoDB</p>
        </div>
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Quick Setup</p>
          <p className="text-xs text-muted-foreground">Automatic configuration</p>
        </div>
      </div>
    ),
    icon: <PlusIcon size={20} className="text-muted-foreground" />,
    highlight: "add-database-button"
  },
  {
    id: "settings",
    title: "Settings & Configuration",
    description: "Customize your experience",
    content: (
      <div className="space-y-2">
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Auto-start</p>
          <p className="text-xs text-muted-foreground">Start databases on app launch</p>
        </div>
        <div className="px-3 py-2.5 rounded-md bg-muted/20 border border-border/50">
          <p className="text-sm font-medium mb-1">Security</p>
          <p className="text-xs text-muted-foreground">Manage permissions & access</p>
        </div>
      </div>
    ),
    icon: <SettingsIcon size={20} className="text-muted-foreground" />,
    highlight: "settings-button"
  },
  {
    id: "complete",
    title: "Tour Complete!",
    description: "You're ready to start managing databases",
    content: (
      <div className="space-y-3 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className="w-12 h-12 bg-muted/20 rounded-lg flex items-center justify-center mx-auto border border-border/50"
        >
          <CheckCircle className="w-6 h-6 text-muted-foreground" />
        </motion.div>
        <p className="text-muted-foreground text-sm">
          You&apos;re now ready to start managing your databases. Create your first database and begin building amazing applications!
        </p>
      </div>
    ),
    icon: <CheckCircle className="w-5 h-5" />
  }
]

interface SidebarTourProps {
  isOpen: boolean
  onClose: () => void
  quotes?: Quote[]
  isLoadingQuotes?: boolean
}

export function SidebarTour({ isOpen, onClose, quotes, isLoadingQuotes }: SidebarTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const { theme, resolvedTheme } = useTheme()
  const notificationShownRef = useRef(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Get quote for current step
  const currentQuote = quotes && quotes.length > 0 ? quotes[currentStep % quotes.length] : null

  // Determine the effective theme (resolvedTheme handles system theme)
  const effectiveTheme = mounted ? (resolvedTheme || theme) : "light"
  
  // Set color based on theme: RGB(229, 229, 229) for dark mode, inverted for light mode
  const logoColor = effectiveTheme === "dark" 
    ? "rgb(229, 229, 229)" 
    : "rgb(26, 26, 26)" // Inverted: 255 - 229 = 26

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      // Set tour mode flag
      document.body.setAttribute('data-tour-mode', 'true')
      
      // Show tour mode notification only once per tour session
      if (!notificationShownRef.current) {
        const timeoutId = setTimeout(() => {
          notifyInfo("Tour Mode Active", {
            description: "You're now in tour mode. Database creation is disabled until the tour completes.",
            duration: 4000
          })
          notificationShownRef.current = true
        }, 500)
        
        // Cleanup timeout on unmount
        return () => clearTimeout(timeoutId)
      }
    } else {
      setIsVisible(false)
      // Remove tour mode flag and ensure dashboard returns to normal
      document.body.removeAttribute('data-tour-mode')
      // Force a reflow to ensure CSS changes take effect
      requestAnimationFrame(() => {
        void document.body.offsetHeight // Force reflow
        // Ensure all elements with tour-mode classes reset
        const tourModeElements = document.querySelectorAll('.tour-mode\\:ml-80')
        tourModeElements.forEach((el) => {
          const htmlEl = el as HTMLElement
          htmlEl.style.marginLeft = ''
          htmlEl.style.maxWidth = ''
          htmlEl.style.width = ''
        })
      })
      setTargetElement(null)
      // Reset notification flag when tour closes
      notificationShownRef.current = false
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

  const handleComplete = useCallback(() => {
    // Trigger confetti with theme colors
    const end = Date.now() + 3 * 1000
    const root = document.documentElement
    const primaryColor = getComputedStyle(root).getPropertyValue('--primary').trim()
    const mutedColor = getComputedStyle(root).getPropertyValue('--muted-foreground').trim()
    const borderColor = getComputedStyle(root).getPropertyValue('--border').trim()
    
    const colors = [primaryColor, mutedColor, borderColor].filter(Boolean)
    
    const frame = () => {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: colors.length > 0 ? colors : undefined
      })
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: colors.length > 0 ? colors : undefined
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
      void document.body.offsetHeight // Force reflow
    })
    onClose()
  }, [onClose])

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }, [currentStep, handleComplete])

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
      void document.body.offsetHeight // Force reflow
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
                className="absolute border-4 border-primary rounded-lg pointer-events-none"
                style={{
                  boxShadow: '0 0 0 2px hsl(var(--primary) / 0.2)',
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ 
                  opacity: 1,
                  scale: 1,
                  x: targetElement.offsetLeft - 8,
                  y: targetElement.offsetTop - 8,
                  width: targetElement.offsetWidth + 16,
                  height: targetElement.offsetHeight + 16
                }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </>
          )}

          <SidebarProvider defaultOpen={true}>
            <div className="flex h-screen">
              {/* Tour sidebar - positioned on left */}
              <Sidebar 
                className="shadow-xl fixed left-0 top-0 h-full w-full sm:w-80 md:w-80 lg:w-80 z-[99999] [&_[data-slot=sidebar-inner]]:!bg-background [&_[data-slot=sidebar-inner]]:!text-foreground [&_[data-sidebar=sidebar]]:!bg-background [&_[data-sidebar=sidebar]]:!text-foreground"
                style={{
                  '--sidebar': 'var(--background)',
                  '--sidebar-foreground': 'var(--foreground)',
                } as React.CSSProperties}
              >
                <SidebarHeader className="pt-8">
                  <div className="flex items-center gap-3 p-4">
                    {currentStepData.icon && (
                      <div className="flex items-center justify-center" style={{ color: logoColor }}>
                        {currentStepData.icon}
                      </div>
                    )}
                    <div>
                      <h2 className="font-semibold text-sm text-foreground">{currentStepData.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        Step {currentStep + 1} of {tourSteps.length}
                      </p>
                    </div>
                  </div>
                </SidebarHeader>

                <SidebarContent className="p-4 flex-1 overflow-auto bg-background flex flex-col">
                  <div className="space-y-4 flex-1">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {currentStepData.description}
                    </p>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        {currentStepData.content}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  
                  {/* Quote display at bottom */}
                  {(currentQuote || isLoadingQuotes) && (
                    <div className="mt-auto pt-4 border-t border-border/30">
                      {isLoadingQuotes ? (
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-3/4 ml-auto" />
                        </div>
                      ) : currentQuote ? (
                        <motion.div
                          key={currentStep}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2 }}
                          className="text-xs text-muted-foreground/50 leading-relaxed"
                        >
                          <p className="italic mb-1">&quot;{currentQuote.quote}&quot;</p>
                          <p className="text-right">— {currentQuote.author}</p>
                        </motion.div>
                      ) : null}
                    </div>
                  )}
                </SidebarContent>

                <SidebarFooter className="p-2 bg-background">
                  <div className="space-y-2">
                    {/* Progress indicator */}
                  <div className="flex items-center justify-center gap-2">
                    {tourSteps.map((_, index) => (
                      <div
                        key={index}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          index === currentStep
                            ? 'bg-primary'
                            : index < currentStep
                            ? 'bg-muted-foreground/60'
                            : 'bg-muted-foreground/30'
                        }`}
                      />
                    ))}
                  </div>

                    {/* Navigation buttons */}
                    <div className="flex items-center justify-between gap-1">
                      {currentStep > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrevious}
                          className="flex items-center gap-1 px-2 text-xs"
                        >
                          <ChevronLeft className="w-3 h-3" />
                          Back <Kbd>←</Kbd>
                        </Button>
                      ) : (
                        <div />
                      )}

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
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false)
  const [hasFetchedQuotes, setHasFetchedQuotes] = useState(false)

  const fetchQuotes = useCallback(async (forceRefresh = false) => {
    // Skip if already fetched and not forcing refresh
    if (hasFetchedQuotes && !forceRefresh && quotes.length > 0) {
      return
    }

    setIsLoadingQuotes(true)
    try {
      // Use Electron IPC if available (bypasses CORS), otherwise fallback to fetch
      if (typeof window !== 'undefined' && window.electron?.fetchQuotes) {
        try {
          const result = await window.electron.fetchQuotes()
          if (result.success && result.data && Array.isArray(result.data)) {
            const validQuotes = result.data.filter(q => q && q.quote && q.author)
            if (validQuotes.length > 0) {
              setQuotes(validQuotes)
              setHasFetchedQuotes(true)
              setIsLoadingQuotes(false)
              return
            }
          }
          throw new Error(result.error || 'Failed to fetch quotes')
        } catch (ipcError) {
          // If IPC fails (e.g., handler not registered, API error, or invalid response), fall through to fallback
          // Only log in development to avoid console noise
          if (process.env.NODE_ENV === 'development') {
            const errorMessage = ipcError instanceof Error ? ipcError.message : String(ipcError)
            // Only log if it's not a known API error (HTML response, timeout, etc.)
            if (!errorMessage.includes('HTML') && !errorMessage.includes('timeout') && !errorMessage.includes('status code')) {
              console.warn('IPC fetch failed, using fallback quotes:', errorMessage)
            }
          }
          // Fall through to fallback quotes
        }
      }
      
      // If IPC not available or failed, use fallback quotes immediately (no fetch attempt)
      // This prevents CORS errors and rate limiting
      // Shuffle fallback quotes to get different quotes each time
      const shuffledFallbacks = [...FALLBACK_QUOTES].sort(() => Math.random() - 0.5)
      const neededQuotes = tourSteps.length
      const fallbackQuotes: Quote[] = []
      for (let i = 0; i < neededQuotes; i++) {
        fallbackQuotes.push(shuffledFallbacks[i % shuffledFallbacks.length])
      }
      setQuotes(fallbackQuotes)
      setHasFetchedQuotes(true)
      setIsLoadingQuotes(false)
    } catch (error) {
      // Final fallback - use hardcoded quotes (shuffled for variety)
      if (process.env.NODE_ENV === 'development') {
        console.warn('All quote fetching methods failed, using fallback:', error instanceof Error ? error.message : error)
      }
      const shuffledFallbacks = [...FALLBACK_QUOTES].sort(() => Math.random() - 0.5)
      const neededQuotes = tourSteps.length
      const fallbackQuotes: Quote[] = []
      for (let i = 0; i < neededQuotes; i++) {
        fallbackQuotes.push(shuffledFallbacks[i % shuffledFallbacks.length])
      }
      setQuotes(fallbackQuotes)
      setHasFetchedQuotes(true)
      setIsLoadingQuotes(false)
    }
  }, [hasFetchedQuotes, quotes.length])

  useEffect(() => {
    // Check for tour request on mount
    if (wasTourRequested()) {
      // Reset quotes and fetch fresh ones for each new tour
      setQuotes([])
      setHasFetchedQuotes(false)
      setShouldShowTour(true)
      // Fetch fresh quotes (will use fallbacks if API fails)
      fetchQuotes(true)
      // Clear the tour request immediately
      setTourRequested(false)
    }
  }, [fetchQuotes])

  // Listen for tour request changes (in case it's set after component mounts)
  useEffect(() => {
    const checkTourRequest = () => {
      if (wasTourRequested()) {
        // Reset quotes and fetch fresh ones for each new tour
        setQuotes([])
        setHasFetchedQuotes(false)
        setShouldShowTour(true)
        // Fetch fresh quotes (will use fallbacks if API fails)
        fetchQuotes(true)
        setTourRequested(false)
      }
    }

    // Set up interval to check for tour requests
    const interval = setInterval(checkTourRequest, 100)

    return () => clearInterval(interval)
  }, [fetchQuotes])

  const handleClose = () => {
    setShouldShowTour(false)
    // Reset quotes when tour closes so next tour fetches fresh ones
    setQuotes([])
    setHasFetchedQuotes(false)
  }

  // Only render the tour if it was requested
  if (!shouldShowTour) {
    return null
  }

  return <SidebarTour isOpen={shouldShowTour} onClose={handleClose} quotes={quotes} isLoadingQuotes={isLoadingQuotes} />
}
