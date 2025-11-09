const { contextBridge, ipcRenderer } = require("electron")

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  startDatabase: (config: any) => ipcRenderer.invoke("start-database", config),
  stopDatabase: (id: string) => ipcRenderer.invoke("stop-database", id),
  checkDatabaseStatus: (id: string) => ipcRenderer.invoke("check-database-status", id),
  checkPort: (port: number) => ipcRenderer.invoke("check-port", port),
  getDatabases: () => ipcRenderer.invoke("get-databases"),
  saveDatabase: (db: any) => ipcRenderer.invoke("db:save", db),
  deleteDatabase: (id: string) => ipcRenderer.invoke("db:delete", id),
  deleteAllDatabases: () => ipcRenderer.invoke("db:deleteAll"),
  getPassword: (id: string) => ipcRenderer.invoke("db:getPassword", id),
  updateDatabaseCredentials: (dbConfig: any) => ipcRenderer.invoke("db:updateCredentials", dbConfig),
  brewIsInstalled: () => ipcRenderer.invoke("brew:isInstalled"),
  brewInstall: () => ipcRenderer.invoke("brew:install"),
  brewGetVersions: (dbType: string) => ipcRenderer.invoke("brew:getVersions", dbType),
  getBrewVersions: (packageName: string) => ipcRenderer.invoke("get-brew-versions", packageName),
  getStableVersions: (databaseType: string) => ipcRenderer.invoke("get-stable-versions", databaseType),
  brewInstallDb: (opts: any) => ipcRenderer.invoke("brew:installDb", opts),
  getBannedPorts: () => ipcRenderer.invoke("ports:getBanned"),
  setBannedPorts: (ports: number[]) => ipcRenderer.invoke("ports:setBanned", ports),
  onDatabaseStatusChanged: (callback: (data: any) => void) => {
    ipcRenderer.on('database-status-changed', (_event: any, data: any) => callback(data))
  },
  removeDatabaseStatusListener: () => {
    ipcRenderer.removeAllListeners('database-status-changed')
  },
  onDatabasesUpdated: (callback: () => void) => {
    ipcRenderer.on('databases-updated', () => callback())
  },
  removeDatabasesUpdatedListener: () => {
    ipcRenderer.removeAllListeners('databases-updated')
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  },
  verifyDatabaseInstance: (id: string) => ipcRenderer.invoke("verify-database-instance", id),
  getDatabaseSystemInfo: (id: string) => ipcRenderer.invoke("get-database-system-info", id),
  getSystemStats: () => ipcRenderer.invoke("get-system-stats"),
  checkPortConflict: (port: number, databaseId?: string) => ipcRenderer.invoke("check-port-conflict", port, databaseId),
  cleanupDeadProcesses: () => ipcRenderer.invoke("cleanup-dead-processes"),
  saveCustomImage: (imageData: any) => ipcRenderer.invoke("save-custom-image", imageData),
  saveAvatar: (dataUrl: string) => ipcRenderer.invoke("save-avatar", dataUrl),
  getSavedImages: () => ipcRenderer.invoke("get-saved-images"),
  convertFileToDataUrl: (fileUrl: string) => ipcRenderer.invoke("convert-file-to-data-url", fileUrl),
  checkDatabasesFile: () => ipcRenderer.invoke("check-databases-file"),
  recreateDatabasesFile: () => ipcRenderer.invoke("recreate-databases-file"),
  isAutoLaunchEnabled: () => ipcRenderer.invoke("auto-launch:isEnabled"),
  enableAutoLaunch: () => ipcRenderer.invoke("auto-launch:enable"),
  disableAutoLaunch: () => ipcRenderer.invoke("auto-launch:disable"),
  
  // Auto-start port conflict events
  onAutoStartPortConflicts: (callback: (event: any, data: any) => void) => ipcRenderer.on("auto-start-port-conflicts", callback),
  onAutoStartCompleted: (callback: (event: any, data: any) => void) => ipcRenderer.on("auto-start-completed", callback),
  
  // External link handler
  openExternalLink: (url: string) => ipcRenderer.invoke("open-external-link", url),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  
  // App version
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getElectronVersion: () => ipcRenderer.invoke("get-electron-version"),
  getPlatformInfo: () => ipcRenderer.invoke("get-platform-info"),
  
  // Onboarding status check - use IPC instead of direct localStorage access
  isOnboardingComplete: () => ipcRenderer.invoke("is-onboarding-complete"),
  
  // Dashboard ready signal - notify main process that dashboard is loaded
  notifyDashboardReady: () => ipcRenderer.invoke("dashboard-ready"),
  
  // Helper service methods
  getHelperStatus: () => ipcRenderer.invoke("helper:status"),
  getHelperHealth: () => ipcRenderer.invoke("helper:health"),
  
  installHelper: () => ipcRenderer.invoke("helper:install"),
  startHelper: () => ipcRenderer.invoke("helper:start"),
  startHelperOnDemand: () => ipcRenderer.invoke("helper:start-on-demand"),
  restartHelper: () => ipcRenderer.invoke("helper:restart"),
  cleanupHelper: () => ipcRenderer.invoke("helper:cleanup"),
  
  // Permissions methods
  checkPermissions: () => ipcRenderer.invoke("permissions:check"),
  getPermissionDescriptions: () => ipcRenderer.invoke("permissions:getDescriptions"),
  openSystemPreferences: () => ipcRenderer.invoke("permissions:openSettings"),
  openPermissionPage: (permissionType: string) => ipcRenderer.invoke("permissions:openPermissionPage", permissionType),
  requestCriticalPermissions: () => ipcRenderer.invoke("permissions:requestCritical"),
  requestPermission: (permissionName: string) => ipcRenderer.invoke("permissions:request", permissionName),
  onPermissionChanged: (callback: (data: { permission: string; granted: boolean }) => void) => {
    ipcRenderer.on('permission-changed', (_event: any, data: any) => callback(data))
  },
  removePermissionChangedListener: () => {
    ipcRenderer.removeAllListeners('permission-changed')
  },
  
  // Secure storage methods using Electron's safeStorage API
  encryptString: (text: string) => ipcRenderer.invoke("permissions:encryptString", text),
  decryptString: (encryptedBuffer: Buffer) => ipcRenderer.invoke("permissions:decryptString", encryptedBuffer),
  isEncryptionAvailable: () => ipcRenderer.invoke("permissions:isEncryptionAvailable"),
  
  // Fetch programming quotes in bulk (bypasses CORS)
  fetchQuotes: () => ipcRenderer.invoke("fetch-quotes"),
  
  // Export specific database
  exportDatabase: (databaseConfig: any) => ipcRenderer.invoke("export-database", databaseConfig),
  
  // Export progress events
  onExportProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('export-progress', (_event: any, data: any) => callback(data))
  },
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export-progress')
  },
  
  // Update methods
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  onUpdateAvailable: (callback: (data: any) => void) => {
    ipcRenderer.on('update-available', (_event: any, data: any) => callback(data))
  },
  onUpdateDownloaded: (callback: (data: any) => void) => {
    ipcRenderer.on('update-downloaded', (_event: any, data: any) => callback(data))
  },
  onUpdateDownloadProgress: (callback: (data: any) => void) => {
    ipcRenderer.on('update-download-progress', (_event: any, data: any) => callback(data))
  },
  onUpdateError: (callback: (data: any) => void) => {
    ipcRenderer.on('update-error', (_event: any, data: any) => callback(data))
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available')
    ipcRenderer.removeAllListeners('update-downloaded')
    ipcRenderer.removeAllListeners('update-download-progress')
    ipcRenderer.removeAllListeners('update-error')
  },
  
  // Changelog methods
  getChangelog: () => ipcRenderer.invoke("get-changelog"),
  
  platform: process.platform,
  isElectron: true,
})

