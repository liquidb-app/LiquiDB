import { toast } from "sonner"
import { log } from './logger'

// Notification utility that respects the user's notification setting
class NotificationManager {
  private static instance: NotificationManager
  private notificationsEnabled: boolean = true

  private constructor() {
    // Load notification setting from localStorage
    this.loadNotificationSetting()
  }

  public static getInstance(): NotificationManager {
    if (!NotificationManager.instance) {
      NotificationManager.instance = new NotificationManager()
    }
    return NotificationManager.instance
  }

  private loadNotificationSetting() {
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem("notifications-enabled")
        this.notificationsEnabled = saved !== null ? JSON.parse(saved) : true
        log.debug("Loaded setting from localStorage:", saved, "parsed:", this.notificationsEnabled)
      } else {
        // Server-side rendering or localStorage not available
        this.notificationsEnabled = true
        log.debug("Using default setting (SSR):", this.notificationsEnabled)
      }
    } catch (error) {
      log.error("Failed to load notification setting:", error)
      this.notificationsEnabled = true
    }
  }

  public setNotificationsEnabled(enabled: boolean) {
    log.debug("Setting notifications enabled to:", enabled)
    this.notificationsEnabled = enabled
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
        log.debug("Saved to localStorage:", enabled)
      }
    } catch (error) {
      log.error("Failed to save notification setting:", error)
    }
  }

  public areNotificationsEnabled(): boolean {
    return this.notificationsEnabled
  }

  public reloadNotificationSetting() {
    this.loadNotificationSetting()
  }

  public success(message: string, options?: Parameters<typeof toast.success>[1], critical: boolean = false) {
    log.debug("Success called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.success(message, options)
    } else {
      log.debug("Success notification blocked - notifications disabled")
    }
  }

  public error(message: string, options?: Parameters<typeof toast.error>[1], critical: boolean = false) {
    log.debug("Error called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.error(message, options)
    } else {
      log.debug("Error notification blocked - notifications disabled")
    }
  }

  public info(message: string, options?: Parameters<typeof toast.info>[1], critical: boolean = false) {
    log.debug("Info called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.info(message, options)
    } else {
      log.debug("Info notification blocked - notifications disabled")
    }
  }

  public warning(message: string, options?: Parameters<typeof toast.warning>[1], critical: boolean = false) {
    log.debug("Warning called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.warning(message, options)
    } else {
      log.debug("Warning notification blocked - notifications disabled")
    }
  }
}

// Export singleton instance
const notifications = NotificationManager.getInstance()

// Debug: Log singleton instance details
log.debug("Singleton instance created:", notifications)
log.debug("Initial enabled state:", notifications.areNotificationsEnabled())

// Helper function to check if notifications are enabled
const areNotificationsEnabled = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem("notifications-enabled")
      const enabled = saved !== null ? JSON.parse(saved) : true
      log.debug("Checked localStorage:", saved, "parsed:", enabled)
      return enabled
    }
    return true // Default to enabled if localStorage not available
  } catch (error) {
    log.error("Failed to check notification setting:", error)
    return true // Default to enabled on error
  }
}

// Export individual methods for convenience with safety checks
export const notifySuccess = (message: string, options?: Parameters<typeof toast.success>[1], critical: boolean = false) => {
  log.debug("Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  log.debug("Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.success(message, options)
  } else {
    log.debug("Notification blocked - notifications disabled")
  }
}

export const notifyError = (message: string, options?: Parameters<typeof toast.error>[1], critical: boolean = false) => {
  log.debug("Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  log.debug("Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.error(message, options)
  } else {
    log.debug("Notification blocked - notifications disabled")
  }
}

export const notifyInfo = (message: string, options?: Parameters<typeof toast.info>[1], critical: boolean = false) => {
  log.debug("Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  log.debug("Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.info(message, options)
  } else {
    log.debug("Notification blocked - notifications disabled")
  }
}

export const notifyWarning = (message: string, options?: Parameters<typeof toast.warning>[1], critical: boolean = false) => {
  log.debug("Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  log.debug("Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.warning(message, options)
  } else {
    log.debug("Notification blocked - notifications disabled")
  }
}

// Function to update notification setting and sync with singleton
export const updateNotificationSetting = (enabled: boolean) => {
  log.debug("Setting notifications to:", enabled)
  notifications.setNotificationsEnabled(enabled)
  
  // Also update localStorage directly for consistency
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
      log.debug("Updated localStorage:", enabled)
    }
  } catch (error) {
    log.error("Failed to update localStorage:", error)
  }
}

// Function to get current notification setting
export const getNotificationSetting = (): boolean => {
  return notifications.areNotificationsEnabled()
}

// Export the singleton instance for direct access
export { notifications }
