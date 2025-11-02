const { contextBridge, ipcRenderer } = require("electron")

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  startDatabase: (config) => ipcRenderer.invoke("start-database", config),
  stopDatabase: (id) => ipcRenderer.invoke("stop-database", id),
  checkDatabaseStatus: (id) => ipcRenderer.invoke("check-database-status", id),
  checkPort: (port) => ipcRenderer.invoke("check-port", port),
  getDatabases: () => ipcRenderer.invoke("get-databases"),
  getAllDatabases: () => ipcRenderer.invoke("get-databases"),
  saveDatabase: (db) => ipcRenderer.invoke("db:save", db),
  deleteDatabase: (id) => ipcRenderer.invoke("db:delete", id),
  deleteAllDatabases: () => ipcRenderer.invoke("db:deleteAll"),
  getPassword: (id) => ipcRenderer.invoke("db:getPassword", id),
  updateDatabaseCredentials: (dbConfig) => ipcRenderer.invoke("db:updateCredentials", dbConfig),
  brewIsInstalled: () => ipcRenderer.invoke("brew:isInstalled"),
  brewInstall: () => ipcRenderer.invoke("brew:install"),
  brewGetVersions: (dbType) => ipcRenderer.invoke("brew:getVersions", dbType),
  getBrewVersions: (packageName) => ipcRenderer.invoke("get-brew-versions", packageName),
  getStableVersions: (databaseType) => ipcRenderer.invoke("get-stable-versions", databaseType),
  brewInstallDb: (opts) => ipcRenderer.invoke("brew:installDb", opts),
  getBannedPorts: () => ipcRenderer.invoke("ports:getBanned"),
  setBannedPorts: (ports) => ipcRenderer.invoke("ports:setBanned", ports),
  onDatabaseStatusChanged: (callback) => {
    ipcRenderer.on('database-status-changed', (event, data) => callback(data))
  },
  removeDatabaseStatusListener: () => {
    ipcRenderer.removeAllListeners('database-status-changed')
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  },
  verifyDatabaseInstance: (id) => ipcRenderer.invoke("verify-database-instance", id),
  getDatabaseSystemInfo: (id) => ipcRenderer.invoke("get-database-system-info", id),
  getSystemStats: () => ipcRenderer.invoke("get-system-stats"),
  checkPortConflict: (port) => ipcRenderer.invoke("check-port-conflict", port),
  cleanupDeadProcesses: () => ipcRenderer.invoke("cleanup-dead-processes"),
  saveCustomImage: (imageData) => ipcRenderer.invoke("save-custom-image", imageData),
  saveAvatar: (dataUrl) => ipcRenderer.invoke("save-avatar", dataUrl),
  getSavedImages: () => ipcRenderer.invoke("get-saved-images"),
  convertFileToDataUrl: (fileUrl) => ipcRenderer.invoke("convert-file-to-data-url", fileUrl),
  checkDatabasesFile: () => ipcRenderer.invoke("check-databases-file"),
  recreateDatabasesFile: () => ipcRenderer.invoke("recreate-databases-file"),
  isAutoLaunchEnabled: () => ipcRenderer.invoke("auto-launch:isEnabled"),
  enableAutoLaunch: () => ipcRenderer.invoke("auto-launch:enable"),
  disableAutoLaunch: () => ipcRenderer.invoke("auto-launch:disable"),
  
  // Auto-start port conflict events
  onAutoStartPortConflicts: (callback) => ipcRenderer.on("auto-start-port-conflicts", callback),
  onAutoStartCompleted: (callback) => ipcRenderer.on("auto-start-completed", callback),
  
  // External link handler
  openExternalLink: (url) => ipcRenderer.invoke("open-external-link", url),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  
  // Onboarding status check
  isOnboardingComplete: () => {
    try {
      return localStorage.getItem('onboarding-complete') === 'true'
    } catch (error) {
      return false
    }
  },
  
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
  openPermissionPage: (permissionType) => ipcRenderer.invoke("permissions:openPermissionPage", permissionType),
  requestCriticalPermissions: () => ipcRenderer.invoke("permissions:requestCritical"),
  requestPermission: (permissionName) => ipcRenderer.invoke("permissions:request", permissionName),
  
  // Secure storage methods using Electron's safeStorage API
  encryptString: (text) => ipcRenderer.invoke("permissions:encryptString", text),
  decryptString: (encryptedBuffer) => ipcRenderer.invoke("permissions:decryptString", encryptedBuffer),
  isEncryptionAvailable: () => ipcRenderer.invoke("permissions:isEncryptionAvailable"),
  
  // Fetch programming quotes in bulk (bypasses CORS)
  fetchQuotes: () => ipcRenderer.invoke("fetch-quotes"),
  
  // Export specific database
  exportDatabase: (databaseConfig) => ipcRenderer.invoke("export-database", databaseConfig),
  
  // Export progress events
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (event, data) => callback(data))
  },
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export-progress')
  },
  
  platform: process.platform,
  isElectron: true,
})
