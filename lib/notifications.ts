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
      } else {
        // Server-side rendering or localStorage not available
        this.notificationsEnabled = true
      }
    } catch (error) {
      console.error("Failed to load notification setting:", error)
      this.notificationsEnabled = true
    }
  }

  public setNotificationsEnabled(enabled: boolean) {
    this.notificationsEnabled = enabled
    try {
      // Check if we're in a browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem("notifications-enabled", JSON.stringify(enabled))
      }
    } catch (error) {
      console.error("Failed to save notification setting:", error)
    }
  }

  public areNotificationsEnabled(): boolean {
    return this.notificationsEnabled
  }

  public success(message: string, options?: any) {
    if (this.notificationsEnabled) {
      toast.success(message, options)
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

// Export individual methods for convenience with safety checks
export const notifySuccess = (message: string, options?: any) => {
  if (notifications && typeof notifications.success === 'function') {
    notifications.success(message, options)
  } else {
    console.warn("Notification manager not available, falling back to direct toast")
    toast.success(message, options)
  }
}

export const notifyError = (message: string, options?: any) => {
  if (notifications && typeof notifications.error === 'function') {
    notifications.error(message, options)
  } else {
    console.warn("Notification manager not available, falling back to direct toast")
    toast.error(message, options)
  }
}

export const notifyInfo = (message: string, options?: any) => {
  if (notifications && typeof notifications.info === 'function') {
    notifications.info(message, options)
  } else {
    console.warn("Notification manager not available, falling back to direct toast")
    toast.info(message, options)
  }
}

export const notifyWarning = (message: string, options?: any) => {
  if (notifications && typeof notifications.warning === 'function') {
    notifications.warning(message, options)
  } else {
    console.warn("Notification manager not available, falling back to direct toast")
    toast.warning(message, options)
  }
}

// Export the singleton instance for direct access
export { notifications }
