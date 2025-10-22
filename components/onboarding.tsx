"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { StarsBackground } from "@/components/ui/stars-background"
// import { GlowingEffect } from "@/components/ui/glowing-effect" // Using local implementation
import { BentoGrid, BentoGridItem } from "@/components/ui/bento-grid"
import { saveProfile, loadProfile, getInitials, loadPreferences, savePreferences, setAutoLaunch, getBannedPorts, setBannedPorts, markOnboardingComplete, setTourRequested, isOnboardingComplete } from "@/lib/preferences"
import { useTheme } from "next-themes"
import { notifyError, notifySuccess, updateNotificationSetting } from "@/lib/notifications"
import { usePermissions } from "@/lib/use-permissions"
import { Sun, Moon, Monitor } from "lucide-react"

// Utility function
function cn(...inputs: any[]) {
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
    movementDuration = 2,
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
          let targetAngle =
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
    lightPreview: "bg-gradient-to-r from-gray-300 to-gray-500",
    darkPreview: "bg-gradient-to-r from-gray-600 to-gray-800",
  },
  {
    value: "blue",
    label: "Blue",
    lightPreview: "bg-gradient-to-r from-blue-400 to-blue-600",
    darkPreview: "bg-gradient-to-r from-blue-500 to-blue-700",
  },
  {
    value: "green",
    label: "Green",
    lightPreview: "bg-gradient-to-r from-green-400 to-green-600",
    darkPreview: "bg-gradient-to-r from-green-500 to-green-700",
  },
  {
    value: "purple",
    label: "Purple",
    lightPreview: "bg-gradient-to-r from-purple-400 to-purple-600",
    darkPreview: "bg-gradient-to-r from-purple-500 to-purple-700",
  },
  {
    value: "orange",
    label: "Orange",
    lightPreview: "bg-gradient-to-r from-orange-400 to-orange-600",
    darkPreview: "bg-gradient-to-r from-orange-500 to-orange-700",
  },
]

export function OnboardingOverlay({ onFinished, onStartTour }: { onFinished: () => void; onStartTour: () => void }) {
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
  const [transitionDir, setTransitionDir] = useState<'forward' | 'backward' | 'none'>('none')
  const prevStepRef = useRef<Step>(1)
  const [bgSpeed, setBgSpeed] = useState(50)
  const [username, setUsername] = useState("")
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [autoStart, setAutoStartPref] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [theme, setThemeState] = useState<"system" | "light" | "dark">("system")
  const [colorScheme, setColorScheme] = useState("mono")
  const [bannedPortsLocal, setBannedPortsLocal] = useState<number[]>([])
  const [bannedPortsInput, setBannedPortsInput] = useState("")
  const [bannedPortsError, setBannedPortsError] = useState<string | null>(null)
  const [bannedPortsSuggestion, setBannedPortsSuggestion] = useState<string | null>(null)
  const { setTheme, resolvedTheme } = useTheme()

  // permissions hook for step 3
  const { permissions, isLoading: permLoading, checkPermissions, requestCriticalPermissions, openSystemPreferences, openPermissionPage } = usePermissions()

  // helper service state for step 4
  const [helperStatus, setHelperStatus] = useState<{ installed: boolean; running: boolean } | null>(null)
  const [helperLoading, setHelperLoading] = useState(false)
  const [helperTimeout, setHelperTimeout] = useState(false)

  useEffect(() => {
    const existing = loadProfile()
    if (existing) {
      setUsername(existing.username)
      setAvatar(existing.avatar)
    }
    
    // Check actual macOS auto-launch status and sync with toggle
    const checkAutoLaunchStatus = async () => {
      try {
        // @ts-ignore
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
      try {
        // @ts-ignore
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
  }, [])

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
      
      // Set up periodic status updates every 5 seconds to reduce interference
      const statusInterval = setInterval(checkHelperStatus, 5000)
      
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
  }, [step])

  const checkHelperStatus = async () => {
    setHelperLoading(true)
    try {
      // Add timeout to prevent getting stuck
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Helper status check timeout')), 5000)
      )
      
      // @ts-ignore
      const statusPromise = window.electron?.getHelperStatus?.()
      
      const result = await Promise.race([statusPromise, timeoutPromise])
      
      if (result?.success) {
        setHelperStatus(result.data)
      } else {
        setHelperStatus(null)
      }
    } catch (error) {
      console.error("Failed to check helper status:", error)
      setHelperStatus(null)
      
      // If it's a timeout, show a more helpful message
      if (error instanceof Error && error.message?.includes('timeout')) {
        console.warn("Helper status check timed out, assuming service is not available")
      }
    } finally {
      setHelperLoading(false)
    }
  }

  const handleStartHelper = async () => {
    setHelperLoading(true)
    setHelperTimeout(false) // Reset timeout when trying to install
    try {
      // @ts-ignore
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
      const port = parseInt(cleanPort, 10)
      
      if (isNaN(port)) {
        errors.push(`"${cleanPort}" is not a valid number`)
        invalidEntries.push(cleanPort)
        continue
      }

      // Check port range (1-65535)
      if (port < 1 || port > 65535) {
        errors.push(`Port ${port} is out of range (1-65535)`)
        invalidEntries.push(cleanPort)
        continue
      }

      // Check for duplicates
      if (ports.includes(port)) {
        errors.push(`Port ${port} is duplicated`)
        continue
      }

      ports.push(port)
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
  const clearBannedPorts = () => {
    setBannedPortsInput("")
    setBannedPortsLocal([])
    setBannedPortsError(null)
    setBannedPortsSuggestion(null)
  }

  // Handle auto-launch toggle with proper error handling and edge cases
  const handleAutoLaunchToggle = async (enabled: boolean) => {
    setAutoStartPref(enabled)
    
    try {
      // @ts-ignore
      const api = window?.electron
      if (!api?.enableAutoLaunch || !api?.disableAutoLaunch) {
        console.warn("[Onboarding] Auto-launch functions not available")
        return
      }

      const result = enabled 
        ? await api?.enableAutoLaunch?.()
        : await api?.disableAutoLaunch?.()
      
      if (!result?.success) {
        console.error(`[Onboarding] Failed to ${enabled ? 'enable' : 'disable'} auto-launch:`, result?.error)
        // Revert the toggle if the operation failed
        setAutoStartPref(!enabled)
        
        // Provide more specific error messages
        const errorMessage = result?.error?.includes("Can't get login item") 
          ? "Auto-launch was already disabled"
          : `Failed to ${enabled ? 'enable' : 'disable'} auto-launch`
        
        if (result?.error?.includes("Can't get login item")) {
          notifySuccess("Auto-launch is already disabled")
        } else {
          notifyError(errorMessage, undefined, true) // Critical - system error
        }
      } else {
        console.log(`[Onboarding] Auto-launch ${enabled ? 'enabled' : 'disabled'} successfully`)
        notifySuccess(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`)
      }
    } catch (error) {
      console.error("[Onboarding] Auto-launch toggle error:", error)
      // Revert the toggle if there was an error
      setAutoStartPref(!enabled)
      notifyError("Failed to update auto-launch setting", undefined, true) // Critical - system error
    }
  }

  const saveAndNext = useCallback(async () => {
    if (step === 1) {
      if (!username.trim()) return notifyError("Please choose a username", undefined, true) // Critical - blocks progression
      saveProfile({ username: username.trim(), avatar: avatar || initials })
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
        // @ts-ignore
        const api = window?.electron
        const status = await api?.getHelperStatus?.()
        if (!status?.data?.running) {
          // Use on-demand helper service start
          await api?.startHelperOnDemand?.()
          notifySuccess("Helper service started")
        }
        setStep(5)
      } catch (e) {
        notifyError("Could not start helper service", undefined, true) // Critical - system service
        setStep(5)
      }
      return
    }
  }, [step, username, avatar, initials, theme, notificationsEnabled, autoStart, bannedPortsLocal, colorScheme, setTheme, requestCriticalPermissions])

  const finish = useCallback((takeTour: boolean) => {
    markOnboardingComplete()
    setTourRequested(takeTour)
    // speed up background to 100 over 5s
    const start = performance.now()
    const startSpeed = bgSpeed
    const animate = (t: number) => {
      const elapsed = (t - start) / 5000
      const p = Math.min(1, Math.max(0, elapsed))
      const newSpeed = Math.round(startSpeed + (100 - startSpeed) * p)
      setBgSpeed(newSpeed)
      if (p < 1) requestAnimationFrame(animate)
      else {
        // After speed up completes, fade the global background if any
        const overlay = document.querySelector('[data-onboarding-stars]') as HTMLElement | null
        if (overlay) {
          overlay.style.transition = 'opacity 800ms ease'
          overlay.style.opacity = '0'
          setTimeout(() => {
            if (takeTour) onStartTour()
            onFinished()
          }, 820)
        } else {
          if (takeTour) onStartTour()
          onFinished()
        }
      }
    }
    requestAnimationFrame(animate)
  }, [bgSpeed, onFinished, onStartTour])

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background" data-onboarding-stars>
      {/* Full-screen stars background */}
      <div className="absolute inset-0 pointer-events-none">
        <StarsBackground
          speed={bgSpeed}
          factor={0.05}
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
              className="h-1.5 rounded-full flex-1 relative overflow-hidden bg-muted/40"
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
      
      <div className="relative z-10 w-full max-w-4xl mx-4">
        <Card className="relative overflow-hidden shadow-2xl border-border/20 bg-background/85 backdrop-blur-md text-foreground min-h-[500px]">
          {/* Subtle internal overlay placed behind content */}
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-background/40 via-background/30 to-background/40" />
          <CardHeader className="relative z-0">
            <CardTitle>{step === 1 ? "Create your profile" : step === 2 ? "Preferences" : step === 3 ? "Permissions" : step === 4 ? "Helper service" : "You're all set!"}</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 flex flex-col min-h-[400px]">
            <div className="flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`onboarding-step-${step}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ type: "spring", stiffness: 120, damping: 16 }}
                  className="relative z-10"
                >
              {step === 1 && (
                <div className="space-y-6">
                  <div className="flex flex-col items-center text-center gap-3">
                    <motion.div
                      className="relative"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 140, damping: 18 }}
                    >
                      <div className="size-16 rounded-full bg-gradient-to-br from-primary/30 via-primary/10 to-transparent ring-2 ring-primary/40 flex items-center justify-center animate-in zoom-in-95">
                        <img src="/globe.svg" alt="LiquiDB" className="size-8 opacity-90" />
                      </div>
                    </motion.div>
                    <motion.div initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }}>
                      <div className="text-xl font-semibold tracking-tight">LiquiDB</div>
                    </motion.div>
                    <motion.p
                      className="text-sm text-muted-foreground max-w-[48ch]"
                      initial={{ y: 6, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.1 }}
                    >
                      Modern database management for macOS. Spin up Postgres, MySQL, Redis and more with one click.
                    </motion.p>
                  </div>

                  <div className="space-y-4 animate-in fade-in-50 slide-in-from-bottom-1">
                    <div className="flex items-center gap-4">
                      <motion.div
                        className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold select-none"
                        initial={{ rotate: -6, scale: 0.9, opacity: 0 }}
                        animate={{ rotate: 0, scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 150, damping: 16 }}
                        title="Profile picture"
                      >
                        {avatar || initials}
                      </motion.div>
                      <div className="flex-1 relative z-10">
                        <Label htmlFor="username">Choose a username</Label>
                        <Input 
                          id="username" 
                          value={username} 
                          onChange={(e) => setUsername(e.target.value)} 
                          placeholder="Jane Doe" 
                          className="relative z-10"
                          style={{ pointerEvents: 'auto' }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">We'll use your initials as the avatar by default.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Theme</Label>
                  <p className="text-sm text-muted-foreground mb-3">Choose your preferred theme</p>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => {
                        setThemeState("light")
                        setTheme("light")
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        theme === "light" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <Sun className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium">Light</div>
                        <div className="text-xs text-muted-foreground">Clean and bright</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setThemeState("dark")
                        setTheme("dark")
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        theme === "dark" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <Moon className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium">Dark</div>
                        <div className="text-xs text-muted-foreground">Easy on the eyes</div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setThemeState("system")
                        setTheme("system")
                      }}
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                        theme === "system" 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-muted-foreground"
                      }`}
                    >
                      <Monitor className="h-5 w-5" />
                      <div className="text-left">
                        <div className="font-medium">System</div>
                        <div className="text-xs text-muted-foreground">Follows your OS</div>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-base font-medium">Color Scheme</Label>
                  <p className="text-sm text-muted-foreground mb-3">Pick your favorite accent color</p>
                  <div className="grid grid-cols-5 gap-3">
                    {colorSchemes.map((scheme) => (
                      <button
                        key={scheme.value}
                        onClick={() => { 
                          setColorScheme(scheme.value)
                          document.documentElement.setAttribute("data-color-scheme", scheme.value)
                        }}
                        className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          colorScheme === scheme.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-muted-foreground"
                        }`}
                      >
                        <div className={`w-full h-6 rounded ${resolvedTheme === 'dark' ? scheme.darkPreview : scheme.lightPreview}`} />
                        <span className="text-xs font-medium">{scheme.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="text-sm font-medium">Start on boot</div>
                    <div className="text-xs text-muted-foreground">Launch LiquiDB automatically</div>
                  </div>
                  <Switch checked={autoStart} onCheckedChange={handleAutoLaunchToggle} />
                </div>
                <div className="flex items-center justify-between border rounded-md p-3">
                  <div>
                    <div className="text-sm font-medium">Notifications</div>
                    <div className="text-xs text-muted-foreground">Enable app notifications</div>
                  </div>
                  <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                </div>
              </div>
              <div>
                <Label>Banned ports (optional, comma separated)</Label>
                <div className="relative">
                  <Input 
                    value={bannedPortsInput} 
                    onChange={(e) => handleBannedPortsChange(e.target.value)} 
                    placeholder="5432, 6379" 
                    className={bannedPortsError ? "border-red-500" : bannedPortsLocal.length > 0 ? "border-green-500" : ""}
                  />
                  {bannedPortsInput && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                      {bannedPortsInput.length} chars
                    </div>
                  )}
                </div>
                {bannedPortsError && (
                  <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-red-800 dark:text-red-200">Invalid port format</p>
                        <p className="text-xs text-red-700 dark:text-red-300 mt-1">{bannedPortsError}</p>
                        {bannedPortsSuggestion && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{bannedPortsSuggestion}</p>
                        )}
                        <div className="flex gap-2 mt-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={applyBannedPortsFix}
                            className="text-xs"
                          >
                            Apply Fix
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={clearBannedPorts}
                            className="text-xs"
                          >
                            Clear All
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {!bannedPortsError && bannedPortsLocal.length > 0 && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    ✓ {bannedPortsLocal.length} valid port{bannedPortsLocal.length !== 1 ? 's' : ''} configured: {bannedPortsLocal.join(", ")}
                  </p>
                )}
                {!bannedPortsError && bannedPortsLocal.length === 0 && bannedPortsInput.trim() && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    ⚠ No valid ports found in input
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <p className="text-sm text-muted-foreground">We need a couple of permissions. You can grant them here without leaving onboarding.</p>
              <div className="space-y-3">
                {permLoading ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">Checking permissions…</div>
                ) : (
                  permissions.map((p) => (
                    <div 
                      key={p.name} 
                      className={`flex items-start justify-between p-4 rounded-lg border-2 transition-all ${
                        p.granted 
                          ? "border-green-500/20 bg-green-500/5" 
                          : "border-orange-500/20 bg-orange-500/5"
                      }`}
                    >
                      <div className="flex-1 space-y-1">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm text-muted-foreground">{p.description}</div>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        {!p.granted && (
                          <Button size="sm" onClick={() => openPermissionPage(p.name)}>
                            Open
                          </Button>
                        )}
                        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium ${
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
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-1">Background Helper Service</p>
                <p className="text-sm text-muted-foreground">
                  The helper service runs in the background to monitor database processes and prevent port conflicts.
                </p>
              </div>

              {helperTimeout ? (
                <div className="p-6 text-center space-y-4">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-yellow-600 dark:text-yellow-400">Service check timed out</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
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
                    Checking service status…
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    This may take a few seconds. If it takes too long, you can continue without the helper service.
                  </p>
                </div>
              ) : helperStatus ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border-2 rounded-lg bg-muted/20">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Service Status</p>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          helperStatus.running 
                            ? 'bg-green-500 animate-pulse' 
                            : 'bg-red-500 animate-pulse'
                        } ${helperLoading ? 'opacity-50' : ''}`} />
                        <span className="text-xs text-muted-foreground">
                          {helperStatus.running ? 'Running' : 'Stopped'}
                          {helperLoading && ' •'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Installed</p>
                      <span className="text-sm font-medium">
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
            </div>
          )}

          {step === 5 && (
            <div className="space-y-8">
              {/* Celebration Header */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-center space-y-4"
              >
                <div className="relative">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 200, 
                      damping: 15,
                      delay: 0.4 
                    }}
                    className="text-6xl mb-4"
                  >
                    🎉
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="text-3xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent"
                  >
                    You're all set!
                  </motion.div>
                </div>
                
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="text-lg text-muted-foreground max-w-2xl mx-auto"
                >
                  Welcome to LiquiDB! You're ready to start managing your databases with powerful features.
                </motion.p>
              </motion.div>

              {/* Bento Grid with Features */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
              >
                <BentoGrid className="max-w-4xl mx-auto">
                  <BentoGridItem
                    size="2"
                    title="Database Management"
                    description="Create, manage, and monitor your databases with ease"
                    icon={<div className="text-2xl">🗄️</div>}
                    className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20"
                  >
                    <GlowingEffect variant="default" disabled={false} glow={true}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span>Auto-start configured</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span>Port monitoring active</span>
                        </div>
                      </div>
                    </GlowingEffect>
                  </BentoGridItem>

                  <BentoGridItem
                    size="1"
                    title="Smart Monitoring"
                    description="Intelligent port conflict detection"
                    icon={<div className="text-2xl">🔍</div>}
                    className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20"
                  >
                    <GlowingEffect variant="default" disabled={false}>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {bannedPortsLocal.length}
                        </div>
                        <div className="text-xs text-muted-foreground">Banned ports</div>
                      </div>
                    </GlowingEffect>
                  </BentoGridItem>

                  <BentoGridItem
                    size="1"
                    title="Auto-Launch"
                    description="Start with your system"
                    icon={<div className="text-2xl">🚀</div>}
                    className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20"
                  >
                    <GlowingEffect variant="default" disabled={false}>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {autoStart ? "ON" : "OFF"}
                        </div>
                        <div className="text-xs text-muted-foreground">Boot startup</div>
                      </div>
                    </GlowingEffect>
                  </BentoGridItem>

                  <BentoGridItem
                    size="2"
                    title="Helper Service"
                    description="Background service for advanced features"
                    icon={<div className="text-2xl">⚙️</div>}
                    className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20"
                  >
                    <GlowingEffect variant="default" disabled={false}>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <div className={`w-2 h-2 rounded-full ${helperStatus?.running ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`}></div>
                          <span>{helperStatus?.running ? 'Service running' : 'Service available'}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {helperStatus?.running ? 'All systems operational' : 'Can be installed later'}
                        </div>
                      </div>
                    </GlowingEffect>
                  </BentoGridItem>
                </BentoGrid>
              </motion.div>

              {/* Tour Invitation */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="max-w-2xl mx-auto"
              >
                <GlowingEffect variant="default" disabled={false} glow={true} className="rounded-xl">
                  <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 dark:from-blue-900/20 dark:via-purple-900/20 dark:to-pink-900/20 rounded-xl p-8 border border-blue-200 dark:border-blue-800">
                    <div className="text-center space-y-4">
                      <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        Ready to explore?
                      </h3>
                      <p className="text-muted-foreground">
                        Take a quick 30-second tour to discover all the features and get the most out of LiquiDB.
                      </p>
                      
                      <div className="flex items-center justify-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          <span>Database management</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                          <span>Port monitoring</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-pink-500 rounded-full animate-pulse"></div>
                          <span>Auto-start</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </GlowingEffect>
              </motion.div>
            </div>
          )}
                </motion.div>
              </AnimatePresence>
            </div>
            
            {/* Fixed button bar at bottom - always in same position */}
            <div className="pt-4 mt-4 relative z-10">
              <div className="flex justify-between">
                {step > 1 && step < 5 ? (
                  <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1) as Step)}>Back</Button>
                ) : (
                  <div />
                )}
                {step === 1 && (
                  <Button onClick={saveAndNext} disabled={!username.trim()}>Continue</Button>
                )}
                {step === 2 && (
                  <Button onClick={saveAndNext}>Continue</Button>
                )}
                {step === 3 && (
                  <Button onClick={saveAndNext}>Continue</Button>
                )}
                {step === 4 && (
                  <Button 
                    onClick={saveAndNext} 
                    disabled={!helperStatus?.running || helperLoading}
                  >
                    {helperLoading ? 'Checking...' : 
                     !helperStatus?.installed ? 'Install Service First' :
                     !helperStatus?.running ? 'Start Service First' : 
                     'Continue'}
                  </Button>
                )}
                {step === 5 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.4 }}
                    className="flex items-center justify-center gap-6 w-full"
                  >
                    <GlowingEffect variant="white" disabled={false}>
                      <Button 
                        id="onboarding-tour-skip" 
                        variant="ghost" 
                        onClick={() => finish(false)}
                        className="hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors px-8 py-3"
                      >
                        Skip
                      </Button>
                    </GlowingEffect>
                    
                    <GlowingEffect variant="default" disabled={false} glow={true}>
                      <Button 
                        id="onboarding-tour-start" 
                        onClick={() => finish(true)}
                        className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 px-8 py-3"
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
                        </motion.span>
                      </Button>
                    </GlowingEffect>
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


