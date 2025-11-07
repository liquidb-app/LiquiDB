// Type declarations for Electron API
import type { DatabaseContainer, DatabaseStatus } from "@/lib/types"

declare global {
  interface Window {
    electron?: {
      saveAvatar?: (avatar: string) => Promise<{ success: boolean; imagePath?: string; error?: string }>
      isAutoLaunchEnabled?: () => Promise<boolean>
      enableAutoLaunch?: () => Promise<{ success: boolean; error?: string }>
      disableAutoLaunch?: () => Promise<{ success: boolean; error?: string }>
      getHelperStatus?: () => Promise<{ success: boolean; data?: { installed: boolean; running: boolean }; error?: string }>
      installHelper?: () => Promise<{ success: boolean; error?: string }>
      startHelper?: () => Promise<{ success: boolean; error?: string }>
      startHelperOnDemand?: () => Promise<{ success: boolean; error?: string }>
      cleanupHelper?: () => Promise<{ success: boolean; data?: { method?: string; cleanedCount?: number; timestamp?: number }; error?: string }>
      getMCPStatus?: () => Promise<{ success: boolean; data?: { running: boolean; name: string }; error?: string }>
      getMCPConnectionInfo?: () => Promise<{ success: boolean; data?: { name: string; command: string; args: string[]; description: string; isDevelopment: boolean }; error?: string }>
      getBannedPorts?: () => Promise<{ success: boolean; data?: number[]; error?: string }>
      setBannedPorts?: (ports: number[]) => Promise<{ success: boolean; error?: string }>
      getSystemStats?: () => Promise<{
        success: boolean
        memory?: {
          total: number
          free: number
          used: number
          percentage: number
        }
        cpu?: {
          usage: number
          percentage: number
        }
        disk?: {
          total: number
          free: number
          used: number
          percentage: number
        } | null
        uptime?: number
        loadAverage?: number[]
        runningDatabases?: number
        error?: string
      }>
      fetchQuotes?: () => Promise<{ success: boolean; data?: Array<{ quote: string; author: string }>; error?: string }>
      isOnboardingComplete?: () => Promise<boolean>
      notifyDashboardReady?: () => Promise<{ success: boolean; triggered?: boolean; alreadyTriggered?: boolean; reason?: string; error?: string }>
      getSavedImages?: () => Promise<{ success: boolean; images?: Array<{ fileName: string; path: string; created: Date }>; error?: string }>
      saveCustomImage?: (imageData: { imageUrl?: string; dataUrl?: string }) => Promise<{ success: boolean; imagePath?: string; fileName?: string; error?: string }>
      convertFileToDataUrl?: (fileUrl: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
      getStableVersions?: (databaseType: string) => Promise<string[]>
      getBrewVersions?: (packageName: string) => Promise<Array<{ majorVersion: string; fullVersion: string; packageName: string }>>
      checkPort?: (port: number) => Promise<{ available: boolean; reason?: string; details?: string }>
      getDatabases?: () => Promise<DatabaseContainer[]>
      checkPermissions?: () => Promise<{ success: boolean; data?: { permissions: Record<string, boolean>; allGranted: boolean; results: Array<{ permission: string; granted: boolean; error: string | null }> }; error?: string }>
      getPermissionDescriptions?: () => Promise<{ success: boolean; data?: Record<string, { name: string; description: string; why: string; icon: string; critical: boolean }>; error?: string }>
      openSystemPreferences?: () => Promise<{ success: boolean; error?: string }>
      openPermissionPage?: (permissionType: string) => Promise<{ success: boolean; error?: string }>
      requestCriticalPermissions?: () => Promise<{ success: boolean; data?: { results: Array<{ permission: string; granted: boolean; error: string | null }> }; error?: string }>
      requestPermission?: (permissionName: string) => Promise<{ success: boolean; error?: string }>
      openExternalLink?: (url: string) => Promise<{ success: boolean; error?: string }>
      cleanupDeadProcesses?: () => Promise<{ success: boolean; cleanedProcesses: number; updatedStatuses: number; error?: string }>
      startDatabase?: (config: DatabaseContainer) => Promise<{ success: boolean; error?: string }>
      stopDatabase?: (id: string) => Promise<{ success: boolean; error?: string }>
      checkDatabaseStatus?: (id: string) => Promise<{ status: "running" | "stopped" | "starting"; pid?: number | null }>
      saveDatabase?: (db: DatabaseContainer) => Promise<{ success: boolean; error?: string }>
      deleteDatabase?: (id: string) => Promise<{ success: boolean; error?: string }>
      deleteAllDatabases?: () => Promise<{ success: boolean; error?: string }>
      updateDatabaseCredentials?: (dbConfig: { id: string; username: string; password?: string; name: string }) => Promise<{ success: boolean; error?: string }>
      getPassword?: (id: string) => Promise<string | null>
      checkPortConflict?: (port: number, databaseId?: string) => Promise<{ success: boolean; inUse: boolean; processInfo?: { processName: string; pid: string } | null; error?: string }>
      getDatabaseSystemInfo?: (id: string) => Promise<{ success: boolean; pid?: number | null; memory?: { rss?: number; vsz?: number; cpu?: number; pmem?: number; time?: string } | null; cpu?: number | null; systemMemory?: { total: number; free: number; active?: number; inactive?: number; wired?: number; used?: number } | null; connections?: number; uptime?: number; isRunning?: boolean; killed?: boolean; exitCode?: number | null; error?: string }>
      verifyDatabaseInstance?: (id: string) => Promise<{ isRunning: boolean; pid?: number | null; killed?: boolean; exitCode?: number | null; error?: string }>
      recreateDatabasesFile?: () => Promise<{ success: boolean; recreated?: boolean; error?: string }>
      checkDatabasesFile?: () => Promise<{ success: boolean; exists?: boolean; error?: string }>
      brewIsInstalled?: () => Promise<boolean>
      brewInstall?: () => Promise<boolean>
      brewInstallDb?: (opts: { dbType: string; version: string }) => Promise<boolean | { alreadyInstalled?: boolean; stdout?: string }>
      getHelperHealth?: () => Promise<{ success: boolean; data?: { isHealthy: boolean }; error?: string }>
      uninstallHelper?: () => Promise<{ success: boolean; error?: string }>
      exportDatabase?: (databaseConfig: DatabaseContainer) => Promise<{ success: boolean; canceled?: boolean; error?: string }>
      onDatabaseStatusChanged?: <T extends { id: string; status: DatabaseStatus | string; pid?: number | null; exitCode?: number | null; error?: string; ready?: boolean }>(callback: (data: T) => void) => void
      removeDatabaseStatusListener?: () => void
      removeAllListeners?: (channel: string) => void
      onAutoStartPortConflicts?: (callback: (event: unknown, data: { conflicts: Array<{ databaseName: string; originalPort: number; newPort: number; conflictingDatabase: string }> }) => void) => void
      onAutoStartCompleted?: (callback: (event: unknown, data: { successful: number; failed: number; portConflicts: number }) => void) => void
      onExportProgress?: (callback: (data: { stage?: string; message?: string; progress?: number; total?: number }) => void) => void
      removeExportProgressListener?: () => void
      quitApp?: () => Promise<void>
      isElectron?: boolean
      platform?: string
    }
  }
}

export {}


