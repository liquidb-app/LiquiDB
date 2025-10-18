const { contextBridge, ipcRenderer } = require("electron")

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  startDatabase: (config) => ipcRenderer.invoke("start-database", config),
  stopDatabase: (id) => ipcRenderer.invoke("stop-database", id),
  checkDatabaseStatus: (id) => ipcRenderer.invoke("check-database-status", id),
  checkPort: (port) => ipcRenderer.invoke("check-port", port),
  getDatabases: () => ipcRenderer.invoke("get-databases"),
  saveDatabase: (db) => ipcRenderer.invoke("db:save", db),
  deleteDatabase: (id) => ipcRenderer.invoke("db:delete", id),
  deleteAllDatabases: () => ipcRenderer.invoke("db:deleteAll"),
  getPassword: (id) => ipcRenderer.invoke("db:getPassword", id),
  brewIsInstalled: () => ipcRenderer.invoke("brew:isInstalled"),
  brewInstall: () => ipcRenderer.invoke("brew:install"),
  brewGetVersions: (dbType) => ipcRenderer.invoke("brew:getVersions", dbType),
  brewInstallDb: (opts) => ipcRenderer.invoke("brew:installDb", opts),
  getBannedPorts: () => ipcRenderer.invoke("ports:getBanned"),
  setBannedPorts: (ports) => ipcRenderer.invoke("ports:setBanned", ports),
  onDatabaseStatusChanged: (callback) => {
    ipcRenderer.on('database-status-changed', (event, data) => callback(data))
  },
  removeDatabaseStatusListener: () => {
    ipcRenderer.removeAllListeners('database-status-changed')
  },
  verifyDatabaseInstance: (id) => ipcRenderer.invoke("verify-database-instance", id),
  platform: process.platform,
  isElectron: true,
})
