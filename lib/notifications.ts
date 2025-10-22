import { toast } from "sonner"

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
        console.log("[Notification Manager] Loaded setting from localStorage:", saved, "parsed:", this.notificationsEnabled)
      } else {
        // Server-side rendering or localStorage not available
        this.notificationsEnabled = true
        console.log("[Notification Manager] Using default setting (SSR):", this.notificationsEnabled)
      }
    } catch (error) {
      console.error("Failed to load notification setting:", error)
      this.notificationsEnabled = true
    }
  }

  public setNotificationsEnabled(enabled: boolean) {
    console.log("[Notification Manager] Setting notifications enabled to:", enabled)
    this.notificationsEnabled = enabled
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
        console.log("[Notification Manager] Saved to localStorage:", enabled)
      }
    } catch (error) {
      console.error("Failed to save notification setting:", error)
    }
  }

  public areNotificationsEnabled(): boolean {
    return this.notificationsEnabled
  }

  public reloadNotificationSetting() {
    this.loadNotificationSetting()
  }

  public success(message: string, options?: any, critical: boolean = false) {
    console.log("[Notification Manager] Success called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.success(message, options)
    } else {
      console.log("[Notification Manager] Success notification blocked - notifications disabled")
    }
  }

  public error(message: string, options?: any, critical: boolean = false) {
    console.log("[Notification Manager] Error called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.error(message, options)
    } else {
      console.log("[Notification Manager] Error notification blocked - notifications disabled")
    }
  }

  public info(message: string, options?: any, critical: boolean = false) {
    console.log("[Notification Manager] Info called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.info(message, options)
    } else {
      console.log("[Notification Manager] Info notification blocked - notifications disabled")
    }
  }

  public warning(message: string, options?: any, critical: boolean = false) {
    console.log("[Notification Manager] Warning called, enabled:", this.notificationsEnabled, "critical:", critical, "message:", message)
    if (this.notificationsEnabled || critical) {
      toast.warning(message, options)
    } else {
      console.log("[Notification Manager] Warning notification blocked - notifications disabled")
    }
  }
}

// Export singleton instance
const notifications = NotificationManager.getInstance()

// Debug: Log singleton instance details
console.log("[Notification System] Singleton instance created:", notifications)
console.log("[Notification System] Initial enabled state:", notifications.areNotificationsEnabled())

// Helper function to check if notifications are enabled
const areNotificationsEnabled = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem("notifications-enabled")
      const enabled = saved !== null ? JSON.parse(saved) : true
      console.log("[areNotificationsEnabled] Checked localStorage:", saved, "parsed:", enabled)
      return enabled
    }
    return true // Default to enabled if localStorage not available
  } catch (error) {
    console.error("Failed to check notification setting:", error)
    return true // Default to enabled on error
  }
}

// Export individual methods for convenience with safety checks
export const notifySuccess = (message: string, options?: any, critical: boolean = false) => {
  console.log("[notifySuccess] Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  console.log("[notifySuccess] Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.success(message, options)
  } else {
    console.log("[notifySuccess] Notification blocked - notifications disabled")
  }
}

export const notifyError = (message: string, options?: any, critical: boolean = false) => {
  console.log("[notifyError] Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  console.log("[notifyError] Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.error(message, options)
  } else {
    console.log("[notifyError] Notification blocked - notifications disabled")
  }
}

export const notifyInfo = (message: string, options?: any, critical: boolean = false) => {
  console.log("[notifyInfo] Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  console.log("[notifyInfo] Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.info(message, options)
  } else {
    console.log("[notifyInfo] Notification blocked - notifications disabled")
  }
}

export const notifyWarning = (message: string, options?: any, critical: boolean = false) => {
  console.log("[notifyWarning] Called with message:", message, "critical:", critical)
  const enabled = areNotificationsEnabled()
  console.log("[notifyWarning] Notifications enabled:", enabled)
  
  if (enabled || critical) {
    toast.warning(message, options)
  } else {
    console.log("[notifyWarning] Notification blocked - notifications disabled")
  }
}

// Function to update notification setting and sync with singleton
export const updateNotificationSetting = (enabled: boolean) => {
  console.log("[updateNotificationSetting] Setting notifications to:", enabled)
  notifications.setNotificationsEnabled(enabled)
  
  // Also update localStorage directly for consistency
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
      console.log("[updateNotificationSetting] Updated localStorage:", enabled)
    }
  } catch (error) {
    console.error("[updateNotificationSetting] Failed to update localStorage:", error)
  }
}

// Function to get current notification setting
export const getNotificationSetting = (): boolean => {
  return notifications.areNotificationsEnabled()
}

// Export the singleton instance for direct access
export { notifications }
