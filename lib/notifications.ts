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

  public success(message: string, options?: any) {
    console.log("[Notification Manager] Success called, enabled:", this.notificationsEnabled, "message:", message)
    if (this.notificationsEnabled) {
      toast.success(message, options)
    } else {
      console.log("[Notification Manager] Success notification blocked - notifications disabled")
    }
  }

  public error(message: string, options?: any) {
    if (this.notificationsEnabled) {
      toast.error(message, options)
    }
  }

  public info(message: string, options?: any) {
    if (this.notificationsEnabled) {
      toast.info(message, options)
    }
  }

  public warning(message: string, options?: any) {
    if (this.notificationsEnabled) {
      toast.warning(message, options)
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
export const notifySuccess = (message: string, options?: any) => {
  console.log("[notifySuccess] Called with message:", message)
  const enabled = areNotificationsEnabled()
  console.log("[notifySuccess] Notifications enabled:", enabled)
  
  if (enabled) {
    toast.success(message, options)
  } else {
    console.log("[notifySuccess] Notification blocked - notifications disabled")
  }
}

export const notifyError = (message: string, options?: any) => {
  console.log("[notifyError] Called with message:", message)
  const enabled = areNotificationsEnabled()
  console.log("[notifyError] Notifications enabled:", enabled)
  
  if (enabled) {
    toast.error(message, options)
  } else {
    console.log("[notifyError] Notification blocked - notifications disabled")
  }
}

export const notifyInfo = (message: string, options?: any) => {
  console.log("[notifyInfo] Called with message:", message)
  const enabled = areNotificationsEnabled()
  console.log("[notifyInfo] Notifications enabled:", enabled)
  
  if (enabled) {
    toast.info(message, options)
  } else {
    console.log("[notifyInfo] Notification blocked - notifications disabled")
  }
}

export const notifyWarning = (message: string, options?: any) => {
  console.log("[notifyWarning] Called with message:", message)
  const enabled = areNotificationsEnabled()
  console.log("[notifyWarning] Notifications enabled:", enabled)
  
  if (enabled) {
    toast.warning(message, options)
  } else {
    console.log("[notifyWarning] Notification blocked - notifications disabled")
  }
}

// Export the singleton instance for direct access
export { notifications }
