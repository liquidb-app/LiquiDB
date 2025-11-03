"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StarsBackground } from "@/components/ui/stars-background"
import { Kbd } from "@/components/ui/kbd"
// import { GlowingEffect } from "@/components/ui/glowing-effect" // Using local implementation
import { saveProfile, loadProfile, getInitials, loadPreferences, savePreferences, getBannedPorts, setBannedPorts, markOnboardingComplete, setTourRequested, isOnboardingComplete } from "@/lib/preferences"
import { useTheme } from "next-themes"
import { notifyError, notifySuccess, updateNotificationSetting } from "@/lib/notifications"
import { usePermissions } from "@/lib/use-permissions"
import { SunIcon } from "@/components/ui/sun"
import { MoonIcon } from "@/components/ui/moon"
import { Monitor } from "lucide-react"
import { Logo } from "@/components/ui/logo"

// Utility function
function cn(...inputs: unknown[]) {
  return inputs.filter(Boolean).join(" ");
}

// Enhanced GlowingEffect Component
interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

const GlowingEffect = React.memo(
  ({
    blur = 0,
    inactiveZone = 0.7,
    proximity = 0,
    spread = 20,
    variant = "default",
    glow = false,
    className,
    movementDuration: _movementDuration = 2,
    borderWidth = 1,
    disabled = true,
  }: GlowingEffectProps) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const lastPosition = React.useRef({ x: 0, y: 0 });
    const animationFrameRef = React.useRef<number>(0);

    const handleMove = React.useCallback(
      (e?: MouseEvent | { x: number; y: number }) => {
        if (!containerRef.current) return;

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        animationFrameRef.current = requestAnimationFrame(() => {
          const element = containerRef.current;
          if (!element) return;

          const { left, top, width, height } = element.getBoundingClientRect();
          const mouseX = e?.x ?? lastPosition.current.x;
          const mouseY = e?.y ?? lastPosition.current.y;

          if (e) {
            lastPosition.current = { x: mouseX, y: mouseY };
          }

          const center = [left + width * 0.5, top + height * 0.5];
          const distanceFromCenter = Math.hypot(
            mouseX - center[0],
            mouseY - center[1]
          );
          const inactiveRadius = 0.5 * Math.min(width, height) * inactiveZone;

          if (distanceFromCenter < inactiveRadius) {
            element.style.setProperty("--active", "0");
            return;
          }

          const isActive =
            mouseX > left - proximity &&
            mouseX < left + width + proximity &&
            mouseY > top - proximity &&
            mouseY < top + height + proximity;

          element.style.setProperty("--active", isActive ? "1" : "0");

          if (!isActive) return;

          const currentAngle =
            parseFloat(element.style.getPropertyValue("--start")) || 0;
          const targetAngle =
            (180 * Math.atan2(mouseY - center[1], mouseX - center[0])) /
              Math.PI +
            90;

          const angleDiff = ((targetAngle - currentAngle + 180) % 360) - 180;
          const newAngle = currentAngle + angleDiff;

          element.style.setProperty("--start", String(newAngle));
        });
      },
      [inactiveZone, proximity]
    );

    React.useEffect(() => {
      if (disabled) return;

      const handleScroll = () => handleMove();
      const handlePointerMove = (e: PointerEvent) => handleMove(e);

      window.addEventListener("scroll", handleScroll, { passive: true });
      document.body.addEventListener("pointermove", handlePointerMove, {
        passive: true,
      });

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        window.removeEventListener("scroll", handleScroll);
        document.body.removeEventListener("pointermove", handlePointerMove);
      };
    }, [handleMove, disabled]);

    return (
      <>
        <div
          className={cn(
            "pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity",
            glow && "opacity-100",
            variant === "white" && "border-white",
            disabled && "!block"
          )}
        />
        <div
          ref={containerRef}
          style={
            {
              "--blur": `${blur}px`,
              "--spread": spread,
              "--start": "0",
              "--active": "0",
              "--glowingeffect-border-width": `${borderWidth}px`,
              "--repeating-conic-gradient-times": "5",
              "--gradient":
                variant === "white"
                  ? `repeating-conic-gradient(
                  from 236.84deg at 50% 50%,
                  var(--black),
                  var(--black) calc(25% / var(--repeating-conic-gradient-times))
                )`
                  : `radial-gradient(circle, #dd7bbb 10%, #dd7bbb00 20%),
                radial-gradient(circle at 40% 40%, #d79f1e 5%, #d79f1e00 15%),
                radial-gradient(circle at 60% 60%, #5a922c 10%, #5a922c00 20%), 
                radial-gradient(circle at 40% 60%, #4c7894 10%, #4c789400 20%),
                repeating-conic-gradient(
                  from 236.84deg at 50% 50%,
                  #dd7bbb 0%,
                  #d79f1e calc(25% / var(--repeating-conic-gradient-times)),
                  #5a922c calc(50% / var(--repeating-conic-gradient-times)), 
                  #4c7894 calc(75% / var(--repeating-conic-gradient-times)),
                  #dd7bbb calc(100% / var(--repeating-conic-gradient-times))
                )`,
            } as React.CSSProperties
          }
          className={cn(
            "pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity",
            glow && "opacity-100",
            blur > 0 && "blur-[var(--blur)] ",
            className,
            disabled && "!hidden"
          )}
        >
          <div
            className={cn(
              "glow",
              "rounded-[inherit]",
              'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
              "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
              "after:[background:var(--gradient)] after:[background-attachment:fixed]",
              "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
              "after:[mask-clip:padding-box,border-box]",
              "after:[mask-composite:intersect]",
              "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]"
            )}
          />
        </div>
      </>
    );
  }
);

GlowingEffect.displayName = "GlowingEffect";

// BentoCard Component
interface BentoCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
  completed?: boolean;
  children?: React.ReactNode;
}

const BentoCard: React.FC<BentoCardProps> = ({
  icon,
  title,
  description,
  className,
  completed = false,
  children,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={cn("relative h-full min-h-[8rem]", className)}
    >
      <div className="relative h-full rounded-xl border border-border/50 p-2 md:p-3">
        <GlowingEffect
          spread={40}
          glow={true}
          disabled={false}
          proximity={64}
          inactiveZone={0.01}
          borderWidth={2}
        />
        <div className="relative flex h-full flex-col justify-between gap-3 overflow-hidden rounded-lg border border-border/50 bg-background/95 p-4 shadow-lg backdrop-blur-sm transition-all duration-300 hover:shadow-xl">
          {completed && (
            <div className="absolute right-4 top-4">
              <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-white"></div>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div className="w-fit rounded-lg border border-border bg-muted/50 p-2 backdrop-blur-sm">
              {icon}
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
          {children && (
            <div className="mt-auto">
              {children}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

type Step = 1 | 2 | 3 | 4 | 5

const colorSchemes = [
  {
    value: "mono",
    label: "Monochrome",
    lightPreview: "bg-gradient-to-r from-gray-300 via-gray-400 to-gray-500 gradient-animate",
    darkPreview: "bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 gradient-animate",
  },
  {
    value: "blue",
    label: "Blue",
    lightPreview: "bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 gradient-flow",
    darkPreview: "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 gradient-flow",
  },
  {
    value: "green",
    label: "Green",
    lightPreview: "bg-gradient-to-r from-green-400 via-green-500 to-green-600 gradient-animate",
    darkPreview: "bg-gradient-to-r from-green-500 via-green-600 to-green-700 gradient-animate",
  },
  {
    value: "purple",
    label: "Purple",
    lightPreview: "bg-gradient-to-r from-purple-400 via-purple-500 to-purple-600 gradient-flow",
    darkPreview: "bg-gradient-to-r from-purple-500 via-purple-600 to-purple-700 gradient-flow",
  },
  {
    value: "orange",
    label: "Orange",
    lightPreview: "bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 gradient-animate",
    darkPreview: "bg-gradient-to-r from-orange-500 via-orange-600 to-orange-700 gradient-animate",
  },
]

export function OnboardingOverlay({ onFinished, onStartTour: _onStartTour }: { onFinished: () => void; onStartTour: () => void }) {
  // Add flicker animation styles
  React.useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes flicker {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const [step, setStep] = useState<Step>(1)
  const [, setTransitionDir] = useState<'forward' | 'backward' | 'none'>('none')
  const prevStepRef = useRef<Step>(1)
  const [bgSpeed, setBgSpeed] = useState(300)
  const [bgFactor] = useState(0.05)
  const [starsOpacity, setStarsOpacity] = useState(1)
  const [username, setUsername] = useState("")
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [autoStart, setAutoStartPref] = useState(false)
  const [autoStartLoading, setAutoStartLoading] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [theme, setThemeState] = useState<"system" | "light" | "dark">("system")
  const [colorScheme, setColorScheme] = useState("mono")
  const [bannedPortsLocal, setBannedPortsLocal] = useState<number[]>([])
  const [bannedPortsInput, setBannedPortsInput] = useState("")
  const [bannedPortsError, setBannedPortsError] = useState<string | null>(null)
  const [, setBannedPortsSuggestion] = useState<string | null>(null)
  const { setTheme, resolvedTheme } = useTheme()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // permissions hook for step 3
  const { permissions, isLoading: permLoading, requestCriticalPermissions, openPermissionPage } = usePermissions()

  // helper service state for step 4
  const [helperStatus, setHelperStatus] = useState<{ installed: boolean; running: boolean } | null>(null)
  const [helperLoading, setHelperLoading] = useState(false)
  const [helperTimeout, setHelperTimeout] = useState(false)
  
  // Track if user is manually toggling auto-launch to prevent periodic check interference
  const isTogglingAutoLaunchRef = useRef(false)

  useEffect(() => {
    const existing = loadProfile()
    if (existing) {
      setUsername(existing.username)
      // Only set avatar if it's a valid data URL (custom image), not initials
      if (existing.avatar && existing.avatar.startsWith('data:')) {
        setAvatar(existing.avatar)
      } else {
        setAvatar(undefined)
      }
    }
    
    // Check actual macOS auto-launch status and sync with toggle
    const checkAutoLaunchStatus = async () => {
      try {
        // @ts-expect-error - Electron IPC types not available
        const api = window?.electron
        if (!api?.isAutoLaunchEnabled) {
          console.warn("[Onboarding] Auto-launch status check not available")
          // Fallback to preferences if available
          if (isOnboardingComplete()) {
            const prefs = loadPreferences()
            setAutoStartPref(prefs.autoStartOnBoot)
          }
          return
        }

        const isEnabled = await api.isAutoLaunchEnabled()
        if (typeof isEnabled === 'boolean') {
          setAutoStartPref(isEnabled)
          console.log(`[Onboarding] Auto-launch status: ${isEnabled ? 'enabled' : 'disabled'}`)
        } else {
          console.warn("[Onboarding] Invalid auto-launch status response:", isEnabled)
          // Fallback to preferences if available
          if (isOnboardingComplete()) {
            const prefs = loadPreferences()
            setAutoStartPref(prefs.autoStartOnBoot)
          }
        }
      } catch (error) {
        console.warn("[Onboarding] Could not check auto-launch status:", error)
        // Fallback to preferences if available
        if (isOnboardingComplete()) {
          const prefs = loadPreferences()
          setAutoStartPref(prefs.autoStartOnBoot)
        }
      }
    }
    
    checkAutoLaunchStatus()
    
    // Set up periodic auto-launch status check to stay in sync
    const autoLaunchCheckInterval = setInterval(async () => {
      // Skip periodic check if user is manually toggling
      if (isTogglingAutoLaunchRef.current) {
        return
      }
      
      try {
        // @ts-expect-error - Electron IPC types not available
        const api = window?.electron
        if (api?.isAutoLaunchEnabled) {
          const isEnabled = await api.isAutoLaunchEnabled()
          if (typeof isEnabled === 'boolean' && isEnabled !== autoStart) {
            console.log(`[Onboarding] Auto-launch status changed externally: ${isEnabled ? 'enabled' : 'disabled'}`)
            setAutoStartPref(isEnabled)
          }
        }
      } catch (error) {
        // Silently handle errors in periodic checks
        console.debug("[Onboarding] Periodic auto-launch check failed:", error)
      }
    }, 5000) // Check every 5 seconds
    
    // Clean up interval on unmount
    return () => clearInterval(autoLaunchCheckInterval)
    
    // Only load other prefs if onboarding was already completed, otherwise use defaults
    if (isOnboardingComplete()) {
      const prefs = loadPreferences()
      setNotificationsEnabled(prefs.notificationsEnabled)
      setThemeState(prefs.theme)
      setColorScheme(prefs.colorScheme || "mono")
      document.documentElement.setAttribute("data-color-scheme", prefs.colorScheme || "mono")
      ;(async () => {
        const ports = await getBannedPorts()
        setBannedPortsLocal(ports)
        setBannedPortsInput(ports.join(", "))
      })()
    }
  }, [autoStart])
  // Track navigation direction to drive grow/shrink effect between steps
  useEffect(() => {
    const previous = prevStepRef.current
    if (step > previous) setTransitionDir('forward')
    else if (step < previous) setTransitionDir('backward')
    else setTransitionDir('none')
    prevStepRef.current = step
  }, [step])

  const checkHelperStatus = useCallback(async () => {
    // Only set loading if we don't have status yet
    const isInitialCheck = !helperStatus
    if (isInitialCheck) {
      setHelperLoading(true)
    }
    
    try {
      // Add timeout to prevent getting stuck
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Helper status check timeout')), 5000)
      )
      
      // @ts-expect-error - Electron IPC types not available
      const statusPromise = window.electron?.getHelperStatus?.()
      
      const result = await Promise.race([statusPromise, timeoutPromise]) as { success?: boolean; data?: unknown } | Error | undefined
      
      if (result && !(result instanceof Error) && result?.success) {
        const newStatus = result.data
        
        // Always clear loading state after first check
        if (isInitialCheck) {
          setHelperLoading(false)
        }
        
        // Only update if the status has actually changed
        setHelperStatus(prevStatus => {
          if (!prevStatus || 
              prevStatus.installed !== newStatus.installed || 
              prevStatus.running !== newStatus.running || 
              prevStatus.isRunning !== newStatus.isRunning) {
            console.log("Helper status changed in onboarding, updating UI")
            return newStatus
          }
          console.log("Helper status unchanged in onboarding, skipping UI update")
          return prevStatus
        })
      } else {
        setHelperStatus(null)
        setHelperLoading(false)
      }
    } catch (error) {
      console.error("Failed to check helper status:", error)
      setHelperStatus(null)
      setHelperLoading(false)
      
      // If it's a timeout, show a more helpful message
      if (error instanceof Error && error.message?.includes('timeout')) {
        console.warn("Helper status check timed out, assuming service is not available")
      }
    }
  }, [helperStatus])

  // Check helper status when reaching step 4 and set up periodic updates
  useEffect(() => {
    if (step === 4) {
      setHelperTimeout(false)
      checkHelperStatus()
      
      // Set a timeout to show fallback options if helper check takes too long
      const timeoutId = setTimeout(() => {
        if (helperLoading) {
          setHelperTimeout(true)
          setHelperLoading(false)
        }
      }, 10000) // 10 second timeout
      
      // Set up periodic status updates every 10 seconds to reduce interference
      const statusInterval = setInterval(checkHelperStatus, 10000)
      
      return () => {
        clearInterval(statusInterval)
        clearTimeout(timeoutId)
      }
    } else {
      // Clear helper status when not on step 4 to stop unnecessary checks
      setHelperStatus(null)
      setHelperLoading(false)
      setHelperTimeout(false)
    }
  }, [step, checkHelperStatus, helperLoading])

  const handleStartHelper = async () => {
    setHelperLoading(true)
    setHelperTimeout(false) // Reset timeout when trying to install
    try {
      // @ts-expect-error - Electron IPC types not available
      const api = window?.electron
      if (!helperStatus?.installed) {
        const installResult = await api?.installHelper?.()
        if (installResult?.success) {
          notifySuccess("Helper service installed")
        } else {
          throw new Error(installResult?.error || "Installation failed")
        }
      }
      // Use the on-demand helper service start
      const startResult = await api?.startHelperOnDemand?.()
      if (startResult?.success) {
        await checkHelperStatus()
        notifySuccess("Helper service started")
      } else {
        throw new Error(startResult?.error || "Failed to start service")
      }
    } catch (error) {
      console.error("Failed to start helper:", error)
      notifyError(`Failed to start helper service: ${error instanceof Error ? error.message : 'Unknown error'}`, undefined, true) // Critical - system service
    } finally {
      setHelperLoading(false)
    }
  }

  const initials = useMemo(() => getInitials(username), [username])

  // Port validation and parsing with smart separator detection
  const validateAndParsePorts = (input: string): { ports: number[], isValid: boolean, error?: string, suggestion?: string } => {
    if (!input.trim()) {
      return { ports: [], isValid: true }
    }

    // Smart separator detection - handle commas, dots, semicolons, spaces, etc.
    const separators = [',', '.', ';', '|', '\n', '\t']
    let rawPorts: string[] = []
    let detectedSeparator = ','
    
    // Try to detect the separator being used
    for (const sep of separators) {
      if (input.includes(sep)) {
        rawPorts = input.split(sep).map(p => p.trim()).filter(Boolean)
        detectedSeparator = sep
        break
      }
    }
    
    // If no separator found, treat as single port
    if (rawPorts.length === 0) {
      rawPorts = [input.trim()]
    }
    
    if (rawPorts.length === 0) {
      return { ports: [], isValid: true }
    }

    const ports: number[] = []
    const errors: string[] = []
    const suggestions: string[] = []
    const invalidEntries: string[] = []

    for (const rawPort of rawPorts) {
      // Clean up the port string
      const cleanPort = rawPort.trim()
      
      // Check if it's a valid number
      const parsedPort = parseInt(cleanPort, 10)
      
      if (isNaN(parsedPort)) {
        errors.push(`"${cleanPort}" is not a valid number`)
        invalidEntries.push(cleanPort)
        continue
      }

      // Check port range (1-65535)
      if (parsedPort < 1 || parsedPort > 65535) {
        errors.push(`Port ${parsedPort} is out of range (1-65535)`)
        invalidEntries.push(cleanPort)
        continue
      }

      // Check for duplicates
      if (ports.includes(parsedPort)) {
        errors.push(`Port ${parsedPort} is duplicated`)
        continue
      }

      ports.push(parsedPort)
    }

    // Generate smart suggestions based on detected issues
    if (errors.length > 0) {
      const validPorts = ports.join(', ')
      if (validPorts) {
        suggestions.push(`Valid ports: ${validPorts}`)
      }
      
      // Suggest format fix if wrong separator detected
      if (detectedSeparator !== ',') {
        const correctedFormat = rawPorts.map(p => p.trim()).join(', ')
        suggestions.push(`Try: ${correctedFormat}`)
      }
      
      suggestions.push('Format: 1234, 1235, 1236 (comma-separated numbers)')
    }

    return {
      ports,
      isValid: errors.length === 0,
      error: errors.length > 0 ? errors.join('; ') : undefined,
      suggestion: suggestions.length > 0 ? suggestions.join('. ') : undefined
    }
  }

  // Handle banned ports input changes with validation
  const handleBannedPortsChange = (value: string) => {
    setBannedPortsInput(value)
    
    const validation = validateAndParsePorts(value)
    setBannedPortsError(validation.error || null)
    setBannedPortsSuggestion(validation.suggestion || null)
    
    if (validation.isValid) {
      setBannedPortsLocal(validation.ports)
    }
  }

  // Apply suggested fix for banned ports
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const applyBannedPortsFix = () => {
    const validation = validateAndParsePorts(bannedPortsInput)
    
    if (validation.ports.length > 0) {
      // Use the valid ports that were parsed
      setBannedPortsInput(validation.ports.join(", "))
      setBannedPortsLocal(validation.ports)
      setBannedPortsError(null)
      setBannedPortsSuggestion(null)
      notifySuccess(`Fixed ports: ${validation.ports.join(", ")}`)
    } else {
      // If no valid ports, try to fix the format by converting separators
      const separators = ['.', ';', '|', '\n', '\t']
      let fixedInput = bannedPortsInput
      
      for (const sep of separators) {
        if (fixedInput.includes(sep)) {
          fixedInput = fixedInput.replace(new RegExp(`\\${sep}`, 'g'), ', ')
          break
        }
      }
      
      // Clean up multiple spaces and commas
      fixedInput = fixedInput.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim()
      
      // Re-validate the fixed input
      const fixedValidation = validateAndParsePorts(fixedInput)
      if (fixedValidation.isValid) {
        setBannedPortsInput(fixedInput)
        setBannedPortsLocal(fixedValidation.ports)
        setBannedPortsError(null)
        setBannedPortsSuggestion(null)
        notifySuccess(`Fixed format: ${fixedInput}`)
      } else {
        notifyError("Could not fix the port format. Please check manually.")
      }
    }
  }

  // Clear banned ports
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const clearBannedPorts = () => {
    setBannedPortsInput("")
    setBannedPortsLocal([])
    setBannedPortsError(null)
    setBannedPortsSuggestion(null)
  }

  // Handle auto-launch toggle with proper error handling and edge cases
  const handleAutoLaunchToggle = async (enabled: boolean) => {
    // Set flag to prevent periodic check from interfering
    isTogglingAutoLaunchRef.current = true
    setAutoStartLoading(true)
    
    try {
      // @ts-expect-error - Electron IPC types not available
      const api = window?.electron
      if (!api?.enableAutoLaunch || !api?.disableAutoLaunch) {
        console.warn("[Onboarding] Auto-launch functions not available")
        isTogglingAutoLaunchRef.current = false
        setAutoStartLoading(false)
        return
      }

      const result = enabled 
        ? await api?.enableAutoLaunch?.()
        : await api?.disableAutoLaunch?.()
      
      if (!result?.success) {
        console.error(`[Onboarding] Failed to ${enabled ? 'enable' : 'disable'} auto-launch:`, result?.error)
        
        // Provide more specific error messages
        const errorMessage = result?.error?.includes("Can't get login item") 
          ? "Auto-launch was already disabled"
          : `Failed to ${enabled ? 'enable' : 'disable'} auto-launch`
        
        if (result?.error?.includes("Can't get login item")) {
          notifySuccess("Auto-launch is already disabled")
          // Don't update state if it was already disabled
        } else {
          notifyError(errorMessage, undefined, true) // Critical - system error
        }
      } else {
        // Only update state after successful operation
        setAutoStartPref(enabled)
        console.log(`[Onboarding] Auto-launch ${enabled ? 'enabled' : 'disabled'} successfully`)
        notifySuccess(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`)
      }
    } catch (error) {
      console.error("[Onboarding] Auto-launch toggle error:", error)
      notifyError("Failed to update auto-launch setting", undefined, true) // Critical - system error
    } finally {
      setAutoStartLoading(false)
      // Clear the flag after a short delay to allow the system to update
      setTimeout(() => {
        isTogglingAutoLaunchRef.current = false
      }, 1000)
    }
  }

  const saveAndNext = useCallback(async () => {
    if (step === 1) {
      if (!username.trim()) return notifyError("Please choose a username", undefined, true) // Critical - blocks progression

      // Save avatar to disk if it exists and electron API is available
      if (avatar && avatar.startsWith('data:')) {
        try {
          // @ts-expect-error - Electron IPC types not available
          if (window.electron?.saveAvatar) {
            const saveResult = await window.electron.saveAvatar(avatar)
            if (saveResult?.success) {
              console.log('Avatar saved to disk during profile save:', saveResult.imagePath)
            } else {
              console.warn('Failed to save avatar to disk during profile save:', saveResult?.error)
            }
          } else {
            console.log('Electron API not available during onboarding, avatar will be saved to profile only')
          }
        } catch {
          // Ignore errors saving avatar during onboarding
        }
      }

      saveProfile({ username: username.trim(), avatar: avatar })
      setStep(2)
      return
    }
    if (step === 2) {
      // Check if there are invalid ports that need to be fixed
      if (bannedPortsError) {
        notifyError("Please fix the banned ports format before continuing", undefined, true) // Critical - blocks progression
        return
      }

      savePreferences({
        theme,
        notificationsEnabled,
        autoStartOnBoot: autoStart,
        bannedPorts: bannedPortsLocal,
        colorScheme,
      })
      setTheme(theme)
      
      // Sync notification setting with the notification system
      updateNotificationSetting(notificationsEnabled)
      // Set banned ports in background without blocking onboarding
      setBannedPorts(bannedPortsLocal).catch(error => {
        console.warn("Banned ports setup failed, continuing with onboarding:", error)
      })
      setStep(3)
      return
    }
    if (step === 3) {
      await requestCriticalPermissions()
      setStep(4)
      return
    }
    if (step === 4) {
      try {
        // @ts-expect-error - Electron IPC types not available
        const api = window?.electron
        const status = await api?.getHelperStatus?.()
        if (!status?.data?.running) {
          // Use on-demand helper service start
          await api?.startHelperOnDemand?.()
          notifySuccess("Helper service started")
        }
        setStep(5)
      } catch {
        notifyError("Could not start helper service", undefined, true) // Critical - system service
        setStep(5)
      }
      return
    }
  }, [step, username, avatar, theme, notificationsEnabled, autoStart, bannedPortsLocal, colorScheme, setTheme, requestCriticalPermissions, bannedPortsError])


  const finish = useCallback((takeTour: boolean) => {
    markOnboardingComplete()
    // Don't set tour request yet - wait for animation to complete

    // 1) Fade out onboarding UI (keep stars visible)
    const overlay = document.querySelector('[data-onboarding-stars]') as HTMLElement | null
    if (overlay) {
      const children = Array.from(overlay.children)
      children.forEach((child, index) => {
        if (index === 0) return // keep the first child (stars) visible
        const el = child as HTMLElement
        el.style.transition = 'opacity 600ms ease, transform 600ms ease'
        el.style.opacity = '0'
        el.style.transform = 'translateY(8px)'
        el.style.pointerEvents = 'none'
      })
    }

    // 2) Gradually slow stars from current speed to 0 and reduce opacity to 0 with shorter durations
    const start = performance.now()
    const startSpeed = bgSpeed
    const startOpacity = starsOpacity
    const speedDuration = 4000 // 4 seconds for speed
    const opacityDuration = 2000 // 2 seconds for opacity (faster fade)
    
    const animate = (t: number) => {
      const elapsed = t - start
      
      // Speed animation (4 seconds)
      const speedP = Math.min(1, Math.max(0, elapsed / speedDuration))
      const newSpeed = Math.max(0, Math.round(startSpeed + (0 - startSpeed) * speedP))
      
      // Opacity animation (2 seconds - faster fade)
      const opacityP = Math.min(1, Math.max(0, elapsed / opacityDuration))
      const newOpacity = Math.max(0, startOpacity + (0 - startOpacity) * opacityP)
      
      setBgSpeed(newSpeed)
      setStarsOpacity(newOpacity)
      
      if (speedP < 1 || opacityP < 1) {
        requestAnimationFrame(animate)
      } else {
        // 3) After animation completes, proceed to dashboard with fade-in
        setTimeout(() => {
          if (takeTour) {
            // Set tour request only after animation completes and dashboard appears
            setTourRequested(true)
          }
          onFinished()
        }, 100) // Small delay to ensure smooth transition
      }
    }
    requestAnimationFrame(animate)
  }, [bgSpeed, starsOpacity, onFinished])

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
          if (step === 1 && username.trim()) {
            saveAndNext()
          } else if (step === 2) {
            saveAndNext()
          } else if (step === 3) {
            saveAndNext()
          } else if (step === 4 && helperStatus?.running && !helperLoading) {
            saveAndNext()
          } else if (step === 5) {
            finish(true) // Take the tour
          }
          break
        case 'ArrowLeft':
        case 'Backspace':
          event.preventDefault()
          if (step > 1 && step < 5) {
            setStep((s) => Math.max(1, s - 1) as Step)
          }
          break
        case 'Escape':
          event.preventDefault()
          if (step === 5) {
            finish(false) // Skip tour
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [step, username, helperStatus, helperLoading, saveAndNext, finish])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-start bg-background pt-8" data-onboarding-stars>
      {/* Full-screen stars background */}
      <div className="absolute inset-0 pointer-events-none" style={{ opacity: starsOpacity }}>
        <StarsBackground
          speed={bgSpeed}
          factor={bgFactor}
          pointerEvents={false}
          starColor={resolvedTheme === 'dark' ? '#ffffff' : '#000000'}
        />
      </div>
      
      {/* Progress bar - ABOVE CARD */}
      <div className="relative z-10 w-full max-w-4xl mx-4 mb-6 flex justify-center">
        <div className="flex gap-3 w-[70%]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-1 rounded-full flex-1 relative overflow-hidden bg-muted/40"
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ 
                  scaleX: i <= step ? 1 : 0,
                  backgroundColor: i === step 
                    ? (resolvedTheme === 'dark' ? '#ffffff' : '#1e293b')
                    : (resolvedTheme === 'dark' ? '#ffffff' : '#1e293b') + '80'
                }}
                transition={{ 
                  scaleX: { 
                    duration: 0.5, 
                    ease: "easeOut",
                    delay: i === step ? 0.1 : 0
                  },
                  backgroundColor: { duration: 0.3 }
                }}
                style={{ transformOrigin: 'left' }}
              />
            </div>
          ))}
        </div>
      </div>
      
      <div className="relative z-10 w-full max-w-2xl mx-4">
        <Card className="relative overflow-hidden shadow-2xl border-border/20 bg-background/85 backdrop-blur-md text-foreground w-full transition-all duration-500 ease-in-out">
          {/* Subtle internal overlay placed behind content */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/30 to-background/40" />
          <CardHeader className="relative z-0 pb-4">
            <motion.div
              key={`title-${step}`}
              initial={{ opacity: 0.7, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <CardTitle className="text-lg">{step === 1 ? "Create your profile" : step === 2 ? "Preferences" : step === 3 ? "Permissions" : step === 4 ? "Helper service" : "You're all set!"}</CardTitle>
            </motion.div>
          </CardHeader>
          <CardContent className="relative z-10 flex flex-col transition-all duration-500 ease-in-out">
            <motion.div 
              className="flex-1 min-h-0"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`onboarding-step-${step}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ 
                    duration: 0.3, 
                    ease: "easeOut",
                    opacity: { duration: 0.2 },
                    y: { duration: 0.3 }
                  }}
                  className="relative z-10 break-words"
                >
              {step === 1 && (
                <motion.div 
                  className="space-y-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <div className="flex flex-col items-center text-center gap-2">
                    <motion.div
                      className="relative"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 140, damping: 18 }}
                    >
                      <div className="flex items-center justify-center animate-in zoom-in-95">
                        <Logo size={48} className="opacity-90" />
                      </div>
                    </motion.div>
                    <motion.div initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
                      <div className="text-lg font-semibold tracking-tight whitespace-nowrap">LiquiDB</div>
                    </motion.div>
                    <motion.p
                      className="text-sm text-muted-foreground max-w-[40ch] break-words leading-relaxed"
                      initial={{ y: 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      Modern database management for macOS. Spin up Postgres, MySQL, Redis and more with one click.
                    </motion.p>
                  </div>

                  <div className="space-y-3 animate-in fade-in-50 slide-in-from-bottom-1">
                    <div className="flex items-center gap-3">
                      {/* Hidden file input for avatar selection (robust on macOS/Electron) */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', left: -9999 } as React.CSSProperties}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file || !file.type?.startsWith('image/')) return
                          try {
                            const reader = new FileReader()
                            reader.onload = async (ev) => {
                              const result = ev.target?.result as string
                              if (!result) return
                              setAvatar(result)
                              try {
                                // @ts-expect-error - Electron IPC types not available
                                if (window.electron?.saveAvatar) {
                                  const saveResult = await window.electron.saveAvatar(result)
                                  if (!saveResult?.success) {
                                    console.warn('Failed to save avatar to disk:', saveResult?.error)
                                  }
                                }
                              } catch (err) {
                                console.warn('Error saving avatar to disk:', err)
                              }
                            }
                            reader.readAsDataURL(file)
                          } catch (err) {
                            console.error('Failed to process selected image:', err)
                          } finally {
                            // Reset input so selecting the same file again still triggers change
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }
                        }}
                      />

                      <motion.div
                        className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold select-none cursor-pointer hover:bg-primary/20 transition-colors relative overflow-hidden group"
                        initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
                        animate={{ rotate: 0, scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 150, damping: 16 }}
                        title={avatar && avatar.startsWith('data:') ? "Click to change image" : "Click to choose a custom image"}
                        onClick={async () => {
                          try {
                            const input = fileInputRef.current
                            if (!input) return
                            // Prefer showPicker in Chromium/Electron when DevTools is open
                            // Falls back to click when not available
                            // @ts-expect-error - Electron IPC types not available
                            if (typeof input.showPicker === 'function') {
                              try {
                                // @ts-expect-error - Electron IPC types not available
                                await input.showPicker()
                              } catch {
                                input.click()
                              }
                            } else {
                              input.click()
                            }
                          } catch (err) {
                            console.error('Failed to open file dialog:', err)
                          }
                        }}
                      >
                        {avatar && avatar.startsWith('data:') ? (
                          <>
                            <img 
                              src={avatar} 
                              alt="Profile" 
                              className="w-full h-full object-cover rounded-full"
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setAvatar(undefined)
                              }}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove custom image"
                            >
                              ×
                            </button>
                            {/* Camera icon for changing image */}
                            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-primary font-semibold">
                              {initials}
                            </span>
                            {/* Camera icon for adding image */}
                            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                          </>
                        )}
                      </motion.div>
                      <div className="flex-1 relative z-10">
                        <Label htmlFor="username" className="text-sm">Choose a username</Label>
                        <Input 
                          id="username" 
                          value={username} 
                          onChange={(e) => setUsername(e.target.value)} 
                          placeholder="Jane Doe" 
                          className="relative z-10"
                          style={{ pointerEvents: 'auto' }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {avatar && avatar.startsWith('data:') ? 'Custom image selected' : 'We\'ll use your initials as the avatar by default.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

          {step === 2 && (
            <motion.div 
              className="space-y-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* Appearance Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <h3 className="text-base font-semibold">Appearance</h3>
                </div>
                
                <div className="flex gap-6">
                  {/* Theme Selection */}
                  <div className="flex-1 space-y-3">
                    <Label className="text-sm font-medium">Theme</Label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setThemeState("light")
                          setTheme("light")
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                          theme === "light" 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <SunIcon size={16} />
                        <div className="text-sm font-medium">Light</div>
                      </button>
                      <button
                        onClick={() => {
                          setThemeState("dark")
                          setTheme("dark")
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                          theme === "dark" 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <MoonIcon size={16} />
                        <div className="text-sm font-medium">Dark</div>
                      </button>
                      <button
                        onClick={() => {
                          setThemeState("system")
                          setTheme("system")
                        }}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all ${
                          theme === "system" 
                            ? "border-primary bg-primary/5" 
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <Monitor className="h-4 w-4" />
                        <div className="text-sm font-medium">System</div>
                      </button>
                    </div>
                  </div>

                  {/* Color Scheme Selection */}
                  <div className="flex-1 space-y-3">
                    <Label className="text-sm font-medium">Accent Color</Label>
                    <div className="flex gap-2">
                      {colorSchemes.map((scheme) => (
                        <button
                          key={scheme.value}
                          onClick={() => { 
                            setColorScheme(scheme.value)
                            document.documentElement.setAttribute("data-color-scheme", scheme.value)
                          }}
                          className={`relative w-12 h-8 rounded-lg border-2 transition-all overflow-hidden ${
                            colorScheme === scheme.value
                              ? "border-primary"
                              : "border-border hover:border-muted-foreground"
                          }`}
                        >
                          <div className={`w-full h-full ${resolvedTheme === 'dark' ? scheme.darkPreview : scheme.lightPreview} gradient-pulse`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Behavior Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <h3 className="text-base font-semibold">Behavior</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Start on boot</div>
                        <div className="text-xs text-muted-foreground">Launch automatically</div>
                      </div>
                    </div>
                    <Switch 
                      checked={autoStart} 
                      onCheckedChange={handleAutoLaunchToggle}
                      disabled={autoStartLoading}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium">Notifications</div>
                        <div className="text-xs text-muted-foreground">App notifications</div>
                      </div>
                    </div>
                    <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                  </div>
                </div>
              </div>

              {/* Advanced Settings Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                  <h3 className="text-base font-semibold">Advanced Settings</h3>
                </div>
                
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Banned Ports</Label>
                  <p className="text-xs text-muted-foreground">Ports to avoid when starting databases (optional)</p>
                  <div className="relative">
                    <Input 
                      value={bannedPortsInput} 
                      onChange={(e) => handleBannedPortsChange(e.target.value)} 
                      placeholder="5432, 6379, 3306" 
                      className={bannedPortsError ? "border-red-500" : bannedPortsLocal.length > 0 ? "border-green-500" : ""}
                    />
                    {bannedPortsInput && (
                      <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                        {bannedPortsInput.length} chars
                      </div>
                    )}
                  </div>
                  
                  {/* Status Messages */}
                  {bannedPortsError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-red-800 dark:text-red-200">Invalid port format</div>
                          <div className="text-xs text-red-600 dark:text-red-300 mt-1">
                            Please enter valid port numbers separated by commas (e.g., 5432, 6379, 3306)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!bannedPortsError && bannedPortsLocal.length > 0 && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                        <div>
                          <div className="text-sm font-medium text-green-800 dark:text-green-200">
                            {bannedPortsLocal.length} port{bannedPortsLocal.length !== 1 ? 's' : ''} configured
                          </div>
                          <div className="text-xs text-green-600 dark:text-green-300 mt-1">
                            {bannedPortsLocal.join(', ')}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!bannedPortsError && bannedPortsLocal.length === 0 && bannedPortsInput.trim() && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      ⚠ No valid ports found in input
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div 
              className="space-y-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <p className="text-sm text-muted-foreground leading-relaxed">We need a couple of permissions. You can grant them here without leaving onboarding.</p>
              <div className="space-y-2">
                {permLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">Checking permissions…</div>
                ) : (
                  permissions.map((p) => (
                    <div 
                      key={p.name} 
                      className={`flex items-start justify-between p-3 rounded-lg border-2 transition-all ${
                        p.granted 
                          ? "border-green-500/20 bg-green-500/5" 
                          : "border-orange-500/20 bg-orange-500/5"
                      }`}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.description}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        {!p.granted && (
                          <Button 
                            size="sm" 
                            onClick={() => {
                              const permissionMap: { [key: string]: string } = {
                                'Accessibility': 'accessibility',
                                'Full Disk Access': 'fullDiskAccess',
                                'Network Access': 'networkAccess',
                                'File Access': 'fileAccess',
                                'Launch Agent': 'launchAgent',
                                'Keychain Access': 'keychainAccess'
                              }
                              const permissionType = permissionMap[p.name]
                              if (permissionType) {
                                openPermissionPage(permissionType)
                              }
                            }}
                          >
                            Open
                          </Button>
                        )}
                        <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          p.granted 
                            ? "bg-green-600/10 text-green-600" 
                            : "bg-orange-600/10 text-orange-600"
                        }`}>
                          {p.granted ? (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                              </svg>
                              Granted
                            </>
                          ) : (
                            <>
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                              </svg>
                              Required
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div 
              className="space-y-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <div>
                <p className="text-sm font-medium mb-1 leading-tight">Background Helper Service</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The helper service runs in the background to monitor database processes and prevent port conflicts.
                </p>
              </div>

              {helperTimeout ? (
                <div className="p-6 text-center space-y-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-yellow-600 dark:text-yellow-400">Service check timed out</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The helper service check is taking longer than expected. You can continue without it or try to install it manually.
                  </p>
                  <div className="space-y-2">
                    <Button 
                      size="sm" 
                      onClick={handleStartHelper}
                      disabled={helperLoading}
                      className="w-full"
                    >
                      {helperLoading ? 'Installing...' : 'Try Install Helper Service'}
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setStep(5)}
                      className="w-full"
                    >
                      Continue Without Helper Service
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can install the helper service later from app settings.
                  </p>
                </div>
              ) : helperLoading && !helperStatus ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm">Checking service status…</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    This may take a few seconds. If it takes too long, you can continue without the helper service.
                  </p>
                </div>
              ) : helperStatus ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border-2 rounded-lg bg-muted/20">
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-tight">Service Status</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          helperStatus.running 
                            ? 'bg-green-500 animate-pulse' 
                            : 'bg-red-500 animate-pulse'
                        } ${helperLoading ? 'opacity-50' : ''}`} />
                        <span className="text-xs text-muted-foreground leading-relaxed">
                          {helperStatus.running ? 'Running' : 'Stopped'}
                          {helperLoading && ' •'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground leading-tight">Installed</p>
                      <span className="text-sm font-medium leading-relaxed">
                        {helperStatus.installed ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>

                  {(!helperStatus.installed || !helperStatus.running) && (
                    <div className="flex items-start gap-3 p-4 rounded-lg border-2 border-orange-500/20 bg-orange-500/5">
                      <svg className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                          {!helperStatus.installed ? 'Service Not Installed' : 'Service Stopped'}
                        </p>
                        <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                          {!helperStatus.installed 
                            ? 'Click below to install and start the helper service.' 
                            : 'Click below to start the helper service.'}
                        </p>
                        <Button 
                          size="sm" 
                          onClick={handleStartHelper}
                          disabled={helperLoading}
                          className="mt-3"
                        >
                          {helperLoading ? 'Starting...' : !helperStatus.installed ? 'Install & Start' : 'Start Service'}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {helperStatus.installed && helperStatus.running && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border-2 border-green-500/20 bg-green-500/5">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                      </svg>
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        Helper service is running properly
                      </p>
                    </div>
                  )}
                </div>
               ) : (
                 <div className="p-6 text-center space-y-4">
                   <p className="text-sm text-muted-foreground">Unable to check helper service status</p>
                   <div className="space-y-2">
                     <Button 
                       size="sm" 
                       onClick={handleStartHelper}
                       disabled={helperLoading}
                       className="w-full"
                     >
                       {helperLoading ? 'Installing...' : 'Install Helper Service'}
                     </Button>
                     <Button 
                       size="sm" 
                       variant="outline"
                       onClick={() => setStep(5)}
                       className="w-full"
                     >
                       Continue Without Helper Service
                     </Button>
                   </div>
                   <p className="text-xs text-muted-foreground">
                     You can install the helper service later from app settings.
                   </p>
                 </div>
               )}
            </motion.div>
          )}

          {step === 5 && (
            <motion.div 
              className="space-y-4"
              layout
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              {/* Welcome Message - Aligned with CardTitle */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-left"
              >
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="text-sm text-muted-foreground"
                >
                  Welcome to LiquiDB! You&apos;re ready to start managing your databases with powerful features.
                </motion.p>
              </motion.div>

              {/* Modern Bento Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
              >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4 lg:grid-cols-3">
                  <BentoCard
                    icon={<div className="text-lg">🗄️</div>}
                    title="Database Management"
                    description="Create, manage, and monitor your databases with ease"
                    completed={true}
                    className="md:col-span-2 lg:col-span-1"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" style={{
                          animation: 'flicker 2s infinite'
                        }}></div>
                        <span>Auto-start configured</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" style={{
                          animation: 'flicker 2s infinite'
                        }}></div>
                        <span>Port monitoring active</span>
                      </div>
                    </div>
                  </BentoCard>

                  <BentoCard
                    icon={<div className="text-lg">🔍</div>}
                    title="Smart Monitoring"
                    description="Intelligent port conflict detection and resolution"
                    completed={true}
                    className="md:col-span-2 lg:col-span-1"
                  >
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        {bannedPortsLocal.length}
                      </div>
                      <div className="text-xs text-muted-foreground">Banned ports</div>
                    </div>
                  </BentoCard>

                  <BentoCard
                    icon={<div className="text-lg">🚀</div>}
                    title="Auto-Launch"
                    description="Start with your system for seamless experience"
                    completed={autoStart}
                    className="md:col-span-2 lg:col-span-1"
                  >
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {autoStart ? "ON" : "OFF"}
                      </div>
                      <div className="text-xs text-muted-foreground">Boot startup</div>
                    </div>
                  </BentoCard>

                  <BentoCard
                    icon={<div className="text-lg">⚙️</div>}
                    title="Helper Service"
                    description="Background service for advanced features"
                    completed={helperStatus?.running}
                    className="md:col-span-3 lg:col-span-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <div className={`w-1.5 h-1.5 rounded-full ${helperStatus?.running ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}></div>
                        <span>{helperStatus?.running ? 'Service running' : 'Service available'}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {helperStatus?.running ? 'All systems operational' : 'Can be installed later'}
                      </div>
                    </div>
                  </BentoCard>

                  <BentoCard
                    icon={<div className="text-lg">✨</div>}
                    title="Ready to Go"
                    description="Your LiquiDB setup is complete and optimized"
                    completed={true}
                    className="md:col-span-3 lg:col-span-1"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                      <span>All systems ready</span>
                    </div>
                  </BentoCard>
                </div>
              </motion.div>

            </motion.div>
          )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
            
            {/* Fixed button bar at bottom - always in same position */}
            <div className="pt-3 mt-3 relative z-10">
              <div className="flex justify-between">
                {step > 1 && step < 5 ? (
                  <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}>Back <Kbd>←</Kbd></Button>
                ) : (
                  <div />
                )}
                {step === 1 && (
                  <Button size="sm" onClick={saveAndNext} disabled={!username.trim()}>Continue <Kbd>⏎</Kbd></Button>
                )}
                {step === 2 && (
                  <Button size="sm" onClick={saveAndNext}>Continue <Kbd>⏎</Kbd></Button>
                )}
                {step === 3 && (
                  <Button size="sm" onClick={saveAndNext}>Continue <Kbd>⏎</Kbd></Button>
                )}
                {step === 4 && (
                  <Button 
                    size="sm"
                    onClick={saveAndNext} 
                    disabled={!helperStatus?.running || helperLoading}
                  >
                    {helperLoading ? 'Checking...' : 
                     !helperStatus?.installed ? 'Install Service First' :
                     !helperStatus?.running ? 'Start Service First' : 
                     'Continue'} <Kbd>⏎</Kbd>
                  </Button>
                )}
                {step === 5 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4 }}
                    className="flex items-center justify-center gap-6 w-full"
                  >
                    <div className="relative">
                      <GlowingEffect variant="white" disabled={false} />
                      <Button 
                        id="onboarding-tour-skip" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => finish(false)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors px-6 py-2"
                      >
                        Skip <Kbd>Esc</Kbd>
                      </Button>
                    </div>
                    
                    <div className="relative">
                      <GlowingEffect variant="default" disabled={false} glow={true} />
                      <Button 
                        id="onboarding-tour-start" 
                        size="sm"
                        onClick={() => finish(true)}
                        className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-6 py-2"
                      >
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 1.6 }}
                          className="flex items-center gap-2"
                        >
                          Take the tour
                          <motion.span
                            animate={{ x: [0, 4, 0] }}
                            transition={{ 
                              repeat: Infinity, 
                              duration: 1.5,
                              delay: 1.8 
                            }}
                          >
                            →
                          </motion.span>
                          <Kbd>⏎</Kbd>
                        </motion.span>
                      </Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


