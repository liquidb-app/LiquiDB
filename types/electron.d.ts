// Type declarations for Electron API
declare global {
  interface Window {
    electron?: {
      saveAvatar?: (avatar: string) => Promise<{ success: boolean; imagePath?: string; error?: string }>
      isAutoLaunchEnabled?: () => Promise<boolean>
      enableAutoLaunch?: () => Promise<{ success: boolean; error?: string }>
      disableAutoLaunch?: () => Promise<{ success: boolean; error?: string }>
      getHelperStatus?: () => Promise<{ success: boolean; data?: { installed: boolean; running: boolean }; error?: string }>
      installHelper?: () => Promise<{ success: boolean; error?: string }>
      startHelperOnDemand?: () => Promise<{ success: boolean; error?: string }>
      getBannedPorts?: () => Promise<{ success: boolean; data?: number[]; error?: string }>
      setBannedPorts?: (ports: number[]) => Promise<{ success: boolean; error?: string }>
    }
  }
}

export {}


