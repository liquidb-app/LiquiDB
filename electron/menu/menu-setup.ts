import { app, Menu, BrowserWindow, dialog, shell, nativeImage } from "electron"
import * as path from "path"
import * as fs from "fs"
import { checkForUpdate } from "../github-update"
import { log } from "../logger"
import sharedState from "../core/shared-state"

/**
 * Setup application menu bar
 * Works on Windows, macOS, and Linux
 */
export function setupApplicationMenu(): void {
  const isMac = process.platform === "darwin"
  const isWindows = process.platform === "win32"
  const isLinux = process.platform === "linux"

  const template: Electron.MenuItemConstructorOptions[] = []

  // macOS: App menu (first menu)
  if (isMac) {
    template.push({
      label: app.getName(),
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => showAboutDialog(),
        },
        { type: "separator" },
        {
          label: "Check for Updates...",
          click: () => handleCheckForUpdate(),
        },
        { type: "separator" },
        {
          label: "Visit Website",
          click: () => openWebsite(),
        },
        { type: "separator" },
        {
          label: "Services",
          role: "services",
          submenu: [],
        },
        { type: "separator" },
        {
          label: `Hide ${app.getName()}`,
          accelerator: "Command+H",
          role: "hide",
        },
        {
          label: "Hide Others",
          accelerator: "Command+Shift+H",
          role: "hideOthers",
        },
        {
          label: "Show All",
          role: "unhide",
        },
        { type: "separator" },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: () => {
            app.quit()
          },
        },
      ],
    })
  }

  // Windows/Linux: File menu (or first menu)
  if (isWindows || isLinux) {
    template.push({
      label: "File",
      submenu: [
        {
          label: "Exit",
          accelerator: isWindows ? "Alt+F4" : "Ctrl+Q",
          click: () => {
            app.quit()
          },
        },
      ],
    })
  }

  // Edit menu (all platforms)
  template.push({
    label: "Edit",
    submenu: [
      { label: "Undo", accelerator: "CmdOrCtrl+Z", role: "undo" },
      { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", role: "redo" },
      { type: "separator" },
      { label: "Cut", accelerator: "CmdOrCtrl+X", role: "cut" },
      { label: "Copy", accelerator: "CmdOrCtrl+C", role: "copy" },
      { label: "Paste", accelerator: "CmdOrCtrl+V", role: "paste" },
      { label: "Select All", accelerator: "CmdOrCtrl+A", role: "selectAll" },
    ],
  })

  // View menu (all platforms)
  template.push({
    label: "View",
    submenu: [
      { label: "Reload", accelerator: "CmdOrCtrl+R", role: "reload" },
      { label: "Force Reload", accelerator: "CmdOrCtrl+Shift+R", role: "forceReload" },
      // DevTools menu item removed in production - access is blocked
      { type: "separator" },
      { label: "Actual Size", accelerator: "CmdOrCtrl+0", role: "resetZoom" },
      { label: "Zoom In", accelerator: "CmdOrCtrl+=", role: "zoomIn" },
      { label: "Zoom Out", accelerator: "CmdOrCtrl+-", role: "zoomOut" },
      { type: "separator" },
      { label: "Toggle Fullscreen", accelerator: isMac ? "Ctrl+Command+F" : "F11", role: "togglefullscreen" },
    ],
  })

  // Windows/Linux: Help menu with About, Check for Updates, and Website
  if (isWindows || isLinux) {
    template.push({
      label: "Help",
      submenu: [
        {
          label: `About ${app.getName()}`,
          click: () => showAboutDialog(),
        },
        {
          label: "Check for Updates...",
          click: () => handleCheckForUpdate(),
        },
        { type: "separator" },
        {
          label: "Visit Website",
          click: () => openWebsite(),
        },
      ],
    })
  }

  // macOS: Window menu
  if (isMac) {
    template.push({
      label: "Window",
      submenu: [
        { label: "Close", accelerator: "Command+W", role: "close" },
        { label: "Minimize", accelerator: "Command+M", role: "minimize" },
        { label: "Zoom", role: "zoom" },
        { type: "separator" },
        { label: "Bring All to Front", role: "front" },
      ],
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  log.info("[Menu] Application menu bar configured")
}

/**
 * Resolve logo path - works in both dev and production
 */
function resolveLogoPath(): string | null {
  const isDev = !app.isPackaged
  
  if (isDev) {
    // Development: use relative path from electron directory
    const iconPath = path.join(__dirname, '..', 'public', 'liquiDB.png')
    if (fs.existsSync(iconPath)) {
      return iconPath
    }
  } else {
    // Production: check multiple possible locations
    const appPath = app.getAppPath()
    
    // Try public folder (should be accessible)
    let publicPath = path.join(appPath, 'public', 'liquiDB.png')
    
    // Check if appPath points to app.asar
    if (appPath.endsWith('.asar')) {
      // In asar, public folder should be unpacked or accessible
      // Try unpacked location first
      const unpackedPath = appPath.replace('.asar', '.asar.unpacked')
      publicPath = path.join(unpackedPath, 'public', 'liquiDB.png')
      
      if (!fs.existsSync(publicPath)) {
        // Fallback to asar location
        publicPath = path.join(appPath, 'public', 'liquiDB.png')
      }
    }
    
    // Also check if liquiDB.png is in the out directory (copied from public)
    const outPath = path.join(appPath, 'out', 'liquiDB.png')
    
    if (fs.existsSync(publicPath)) {
      return publicPath
    } else if (fs.existsSync(outPath)) {
      return outPath
    } else {
      // Fallback: try relative path (for development builds)
      const iconPath = path.join(__dirname, '..', 'public', 'liquiDB.png')
      if (fs.existsSync(iconPath)) {
        return iconPath
      }
    }
  }
  
  return null
}

/**
 * Show About dialog
 */
function showAboutDialog(): void {
  const version = app.getVersion()
  const electronVersion = process.versions.electron
  const chromeVersion = process.versions.chrome
  const nodeVersion = process.versions.node

  const aboutMessage = `${app.getName()}\n\n` +
    `Version: ${version}\n` +
    `Electron: ${electronVersion}\n` +
    `Chrome: ${chromeVersion}\n` +
    `Node.js: ${nodeVersion}\n\n` +
    `Modern Database Management for macOS\n` +
    `© ${new Date().getFullYear()} LiquidB`

  const mainWindow = sharedState.getMainWindow()
  
  // Resolve logo path and create NativeImage
  const logoPath = resolveLogoPath()
  let icon: Electron.NativeImage | undefined
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      icon = nativeImage.createFromPath(logoPath)
      // Scale icon for better display in dialog (macOS About dialogs typically use 128x128 or 256x256)
      if (icon && !icon.isEmpty()) {
        const size = icon.getSize()
        if (size.width > 256 || size.height > 256) {
          icon = icon.resize({ width: 256, height: 256 })
        }
      }
    } catch (error) {
      log.warn("[Menu] Failed to load logo for About dialog:", error)
    }
  }
  
  const options: Electron.MessageBoxOptions = {
    type: "info" as const,
    title: `About ${app.getName()}`,
    message: aboutMessage,
    buttons: ["OK"],
    ...(icon && !icon.isEmpty() ? { icon } : {}),
  }
  
  if (mainWindow) {
    dialog.showMessageBox(mainWindow, options).catch((error) => {
      log.error("[Menu] Error showing about dialog:", error)
    })
  } else {
    dialog.showMessageBox(options).catch((error) => {
      log.error("[Menu] Error showing about dialog:", error)
    })
  }
}

/**
 * Handle Check for Updates menu item
 */
async function handleCheckForUpdate(): Promise<void> {
  const mainWindow = sharedState.getMainWindow()
  if (!mainWindow) {
    log.warn("[Menu] Main window not available for update check")
    return
  }

  try {
    log.info("[Menu] Checking for updates from menu...")
    const result = await checkForUpdate()

    if (result.available && result.info) {
      const updateMessage = `Update Available!\n\n` +
        `Version: ${result.info.version}\n` +
        `Release Date: ${result.info.releaseDate || "N/A"}\n\n` +
        `An update is available. You will be prompted to download it.`

      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: updateMessage,
        buttons: ["OK"],
      }).catch((error) => {
        log.error("[Menu] Error showing update dialog:", error)
      })
    } else {
      const noUpdateMessage = `You're up to date!\n\n` +
        `You have the latest version of ${app.getName()}.`

      dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "No Updates Available",
        message: noUpdateMessage,
        buttons: ["OK"],
      }).catch((error) => {
        log.error("[Menu] Error showing no update dialog:", error)
      })
    }
  } catch (error: any) {
    log.error("[Menu] Error checking for updates:", error)
    const errorMessage = `Failed to check for updates.\n\n` +
      `Error: ${error.message || "Unknown error"}`

    dialog.showMessageBox(mainWindow, {
      type: "error",
      title: "Update Check Failed",
      message: errorMessage,
      buttons: ["OK"],
    }).catch((err) => {
      log.error("[Menu] Error showing error dialog:", err)
    })
  }
}

/**
 * Open LiquiDB website
 */
function openWebsite(): void {
  const websiteUrl = "https://liquidb.app"
  try {
    shell.openExternal(websiteUrl)
    log.info(`[Menu] Opened website: ${websiteUrl}`)
  } catch (error: any) {
    log.error("[Menu] Error opening website:", error)
    const mainWindow = sharedState.getMainWindow()
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: "error",
        title: "Error",
        message: `Failed to open website.\n\nError: ${error.message || "Unknown error"}`,
        buttons: ["OK"],
      }).catch((err) => {
        log.error("[Menu] Error showing error dialog:", err)
      })
    }
  }
}

