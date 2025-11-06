export interface UserProfile {
  username: string
  avatar?: string
}

export interface AppPreferences {
  theme: "light" | "dark" | "system"
  notificationsEnabled: boolean
  autoStartOnBoot: boolean
  bannedPorts: number[]
  colorScheme: string
}

const PROFILE_KEY = "liquidb-profile"
const PREFS_KEY = "liquidb-preferences"
const ONBOARDING_KEY = "liquidb-onboarding-complete"
const TOUR_KEY = "liquidb-tour-requested"
const TOUR_SKIPPED_KEY = "liquidb-tour-skipped"

// Profile functions
export function saveProfile(profile: UserProfile): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
      } catch (storageError: unknown) {
        const error = storageError as Error
        const isSecurityError = error?.name === 'SecurityError' || 
                                (error?.message && error.message.includes('localStorage') && error.message.includes('denied'))
        if (isSecurityError) {
          console.warn("localStorage access denied (SecurityError), cannot save profile")
        } else {
          throw storageError
        }
      }
    }
  } catch (error) {
    console.error("Failed to save profile:", error)
  }
}

export function loadProfile(): UserProfile | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = localStorage.getItem(PROFILE_KEY)
        return raw ? JSON.parse(raw) : null
      } catch (storageError: unknown) {
        const error = storageError as Error
        const isSecurityError = error?.name === 'SecurityError' || 
                                (error?.message && error.message.includes('localStorage') && error.message.includes('denied'))
        if (isSecurityError) {
          console.warn("localStorage access denied (SecurityError), cannot load profile")
          return null
        }
        throw storageError
      }
    }
    return null
  } catch (error) {
    console.error("Failed to load profile:", error)
    return null
  }
}

export function getInitials(username: string): string {
  if (!username) return "U"
  
  const words = username.trim().split(/\s+/)
  if (words.length === 1) {
    return words[0].substring(0, 2).toUpperCase()
  }
  
  return words
    .slice(0, 2)
    .map(word => word.charAt(0))
    .join("")
    .toUpperCase()
}

// Preferences functions
export function savePreferences(prefs: AppPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch (error) {
    console.error("Failed to save preferences:", error)
  }
}

export function loadPreferences(): AppPreferences {
  try {
    if (typeof window === "undefined") {
      return {
        theme: "system",
        notificationsEnabled: true,
        autoStartOnBoot: false,
        bannedPorts: [],
        colorScheme: "mono",
      }
    }

    if (!window.localStorage) {
      return {
        theme: "system",
        notificationsEnabled: true,
        autoStartOnBoot: false,
        bannedPorts: [],
        colorScheme: "mono",
      }
    }

    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (raw) return JSON.parse(raw) as AppPreferences

      // Build defaults from scattered keys for backward compatibility
      const notificationsEnabled = (() => {
        try {
          const v = localStorage.getItem("notifications-enabled")
          return v !== null ? JSON.parse(v) : true
        } catch {
          return true
        }
      })()
      const colorScheme = (() => {
        try {
          return localStorage.getItem("color-scheme") || "mono"
        } catch {
          return "mono"
        }
      })()
      return {
        theme: "system",
        notificationsEnabled,
        autoStartOnBoot: false,
        bannedPorts: [],
        colorScheme,
      }
    } catch (storageError: unknown) {
      // Handle SecurityError specifically (access denied)
      const error = storageError as Error
      const isSecurityError = error?.name === 'SecurityError' || 
                              (error?.message && error.message.includes('localStorage') && error.message.includes('denied'))
      if (isSecurityError) {
        console.warn("localStorage access denied (SecurityError), using default preferences")
        return {
          theme: "system",
          notificationsEnabled: true,
          autoStartOnBoot: false,
          bannedPorts: [],
          colorScheme: "mono",
        }
      }
      throw storageError // Re-throw if it's not a SecurityError
    }
  } catch {
    return {
      theme: "system",
      notificationsEnabled: true,
      autoStartOnBoot: false,
      bannedPorts: [],
      colorScheme: "mono",
    }
  }
}

// Auto-launch functions
export async function setAutoLaunch(enabled: boolean): Promise<void> {
  try {
    // Check if auto-launch functions are available
    if (!window.electron?.enableAutoLaunch || !window.electron?.disableAutoLaunch) {
      console.warn("Auto-launch functions not available, skipping auto-launch setup")
      return
    }

    const result = enabled 
      ? await window.electron?.enableAutoLaunch?.()
      : await window.electron?.disableAutoLaunch?.()
    
    if (!result?.success) {
      console.error("Failed to set auto-launch:", result?.error)
    } else {
      console.log(`Auto-launch ${enabled ? 'enabled' : 'disabled'} successfully`)
    }
  } catch (error) {
    console.error("Failed to set auto-launch:", error)
    // Don't throw the error to prevent onboarding from failing
  }
}

// Banned ports functions
export async function getBannedPorts(): Promise<number[]> {
  try {
    const result = await window.electron?.getBannedPorts?.()
    return result?.success && result.data ? result.data : []
  } catch (error) {
    console.error("Failed to get banned ports:", error)
    return []
  }
}

export async function setBannedPorts(ports: number[]): Promise<void> {
  try {
    // Check if the function is available
    if (!window.electron?.setBannedPorts) {
      console.warn("setBannedPorts function not available, skipping banned ports setup")
      return
    }

    const result = await window.electron?.setBannedPorts?.(ports)
    if (!result?.success) {
      console.error("Failed to set banned ports:", result?.error)
    } else {
      console.log(`Banned ports set successfully: ${ports.length} ports`)
    }
  } catch (error) {
    console.error("Failed to set banned ports:", error)
    // Don't throw the error to prevent onboarding from failing
  }
}

// Onboarding functions
export function markOnboardingComplete(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(ONBOARDING_KEY, "true")
      } catch (storageError: unknown) {
        // Handle SecurityError specifically (access denied)
        const error = storageError as Error
        const isSecurityError = error?.name === 'SecurityError' || 
                                (error?.message && error.message.includes('localStorage') && error.message.includes('denied'))
        if (isSecurityError) {
          console.warn("localStorage access denied (SecurityError), cannot persist onboarding completion")
        } else {
          throw storageError // Re-throw if it's not a SecurityError
        }
      }
    }
  } catch (error) {
    console.error("Failed to mark onboarding complete:", error)
  }
}

export function isOnboardingComplete(): boolean {
  try {
    // Fallback to localStorage (synchronous access)
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        return localStorage.getItem(ONBOARDING_KEY) === "true"
      } catch (storageError: unknown) {
        // Handle SecurityError specifically (access denied)
        const error = storageError as Error
        const isSecurityError = error?.name === 'SecurityError' || 
                                (error?.message && error.message.includes('localStorage') && error.message.includes('denied'))
        if (isSecurityError) {
          console.warn("localStorage access denied (SecurityError), defaulting to onboarding incomplete")
          return false // Default to showing onboarding if localStorage is blocked
        }
        throw storageError // Re-throw if it's not a SecurityError
      }
    }
    return false // Default to showing onboarding if localStorage is not available
  } catch (error) {
    console.error("Failed to check onboarding status:", error)
    return false // Default to showing onboarding on error
  }
}

// Tour functions
export function setTourRequested(requested: boolean): void {
  try {
    localStorage.setItem(TOUR_KEY, requested.toString())
  } catch (error) {
    console.error("Failed to set tour requested:", error)
  }
}

export function wasTourRequested(): boolean {
  try {
    return localStorage.getItem(TOUR_KEY) === "true"
  } catch (error) {
    console.error("Failed to check tour status:", error)
    return false
  }
}

export function setTourSkipped(skipped: boolean): void {
  try {
    localStorage.setItem(TOUR_SKIPPED_KEY, skipped.toString())
  } catch (error) {
    console.error("Failed to set tour skipped:", error)
  }
}

export function wasTourSkipped(): boolean {
  try {
    return localStorage.getItem(TOUR_SKIPPED_KEY) === "true"
  } catch (error) {
    console.error("Failed to check tour skipped status:", error)
    return false
  }
}

