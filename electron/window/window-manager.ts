import { BrowserWindow, protocol, App } from "electron"
import * as path from "path"
import * as fs from "fs"
import { log } from "../logger"
import sharedState from "../core/shared-state"

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate Next.js static export
 * @param {string} outDir - Path to the out directory
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
export function validateNextJsStaticExport(outDir: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Check if out directory exists
  if (!fs.existsSync(outDir)) {
    errors.push(`Out directory does not exist: ${outDir}`)
    return { valid: false, errors, warnings }
  }
  
  // Check if out directory is actually a directory
  try {
    const stats = fs.statSync(outDir)
    if (!stats.isDirectory()) {
      errors.push(`Out path exists but is not a directory: ${outDir}`)
      return { valid: false, errors, warnings }
    }
  } catch (err: any) {
    errors.push(`Cannot access out directory: ${outDir} - ${err.message}`)
    return { valid: false, errors, warnings }
  }
  
  // Check for index.html (required)
  const indexPath = path.join(outDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    errors.push(`index.html not found in out directory: ${indexPath}`)
  } else {
    try {
      const indexStats = fs.statSync(indexPath)
      if (!indexStats.isFile()) {
        errors.push(`index.html exists but is not a file: ${indexPath}`)
      }
    } catch (err: any) {
      errors.push(`Cannot access index.html: ${indexPath} - ${err.message}`)
    }
  }
  
  // Check for _next directory (critical for Next.js static exports)
  const nextDir = path.join(outDir, '_next')
  if (!fs.existsSync(nextDir)) {
    errors.push(`_next directory not found in out directory: ${nextDir}`)
  } else {
    try {
      const nextStats = fs.statSync(nextDir)
      if (!nextStats.isDirectory()) {
        errors.push(`_next exists but is not a directory: ${nextDir}`)
      } else {
        // Check for _next/static directory (contains CSS, JS, and other assets)
        const staticDir = path.join(nextDir, 'static')
        if (!fs.existsSync(staticDir)) {
          warnings.push(`_next/static directory not found: ${staticDir} (may indicate incomplete build)`)
        } else {
          try {
            const staticStats = fs.statSync(staticDir)
            if (!staticStats.isDirectory()) {
              warnings.push(`_next/static exists but is not a directory: ${staticDir}`)
            }
          } catch (err: any) {
            warnings.push(`Cannot access _next/static: ${staticDir} - ${err.message}`)
          }
        }
      }
    } catch (err: any) {
      errors.push(`Cannot access _next directory: ${nextDir} - ${err.message}`)
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Register app:// protocol scheme
 * @param {object} app - Electron app instance
 */
export function registerAppProtocol(app: App): void {
  // Register custom protocol scheme BEFORE app is ready (required for registerSchemesAsPrivileged)
  if (!process.argv.includes('--mcp')) {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'app',
        privileges: {
          standard: true,
          secure: true,
          corsEnabled: true,
          supportFetchAPI: true,
          stream: true
        }
      }
    ])
    log.info("[Protocol] Registered app:// scheme as privileged")
  }
}

/**
 * Register app:// protocol handler
 * @param {object} app - Electron app instance
 */
export function registerAppProtocolHandler(app: App): void {
  if (!process.argv.includes('--mcp')) {
    const isDev = !app.isPackaged
    const useDevServer = isDev && process.env.USE_DEV_SERVER === 'true'
    
    // Always register protocol handler, even in dev mode (for testing static builds)
    if (!useDevServer) {
      // Register app:// protocol for production builds
      protocol.registerFileProtocol('app', (request, callback) => {
        try {
          let url = request.url.replace('app://', '').replace('app:///', '')
          
          // Remove leading slash if present
          if (url.startsWith('/')) {
            url = url.substring(1)
          }
          
          // Critical: Strip out index.html/ prefix if present (browser resolves relative paths incorrectly)
          // When browser loads app://index.html, relative paths like /_next/... become app://index.html/_next/...
          // This must happen BEFORE checking for root/index
          while (url.startsWith('index.html/')) {
            url = url.substring('index.html/'.length)
          }
          
          // Handle root/index (only if no path after stripping index.html)
          if (!url || url === '' || url === '/') {
            url = 'index.html'
          }
          
          // Fix common path issues: next/ should be _next/ (browser may strip underscore)
          if (url.startsWith('next/') && !url.startsWith('_next/')) {
            url = '_next/' + url.substring('next/'.length)
          }
          
          // Normalize path separators (handle both forward and backslashes)
          url = url.replace(/\\/g, '/')
          
          const appPath = app.getAppPath()
          let filePath = path.join(appPath, 'out', url)
          
          // Normalize the file path for the current platform
          filePath = path.normalize(filePath)
          
          // Check if appPath points to app.asar, and if so, check for unpacked files
          if (appPath.endsWith('.asar')) {
            const unpackedPath = appPath.replace('.asar', '.asar.unpacked')
            const unpackedFilePath = path.join(unpackedPath, 'out', url)
            const normalizedUnpackedPath = path.normalize(unpackedFilePath)
            
            // Check unpacked first
            if (fs.existsSync(normalizedUnpackedPath)) {
              filePath = normalizedUnpackedPath
            } else if (fs.existsSync(filePath)) {
              // Use asar path if it exists
              filePath = filePath
            } else {
              // Fallback to unpacked even if it doesn't exist yet
              filePath = normalizedUnpackedPath
            }
          }
          
          // Verify file exists before returning
          if (!fs.existsSync(filePath)) {
            log.warn(`[Protocol] File not found: ${filePath} (from URL: ${request.url})`)
            
            let found = false
            
            // Try case-insensitive match first
            const dir = path.dirname(filePath)
            const fileName = path.basename(filePath)
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir)
              const caseMatch = files.find(f => f.toLowerCase() === fileName.toLowerCase())
              if (caseMatch) {
                filePath = path.join(dir, caseMatch)
                log.info(`[Protocol] Found file with different case: ${filePath}`)
                found = true
              }
            }
            
            // If still not found, try path variations (e.g., next vs _next)
            if (!found) {
              let altUrl: string | null = null
              // Check if we're looking for /next/ but should be /_next/
              if (url.includes('/next/') && !url.includes('/_next/')) {
                altUrl = url.replace('/next/', '/_next/')
              }
              // Also try the reverse (/_next/ -> /next/) in case files are in wrong location
              else if (url.includes('/_next/')) {
                altUrl = url.replace('/_next/', '/next/')
              }
              
              if (altUrl) {
                const altPath = path.join(appPath, 'out', altUrl)
                let altFilePath = path.normalize(altPath)
                
                if (appPath.endsWith('.asar')) {
                  const unpackedPath = appPath.replace('.asar', '.asar.unpacked')
                  const altUnpackedPath = path.join(unpackedPath, 'out', altUrl)
                  altFilePath = path.normalize(altUnpackedPath)
                  if (fs.existsSync(altUnpackedPath)) {
                    filePath = altUnpackedPath
                    log.info(`[Protocol] Found file with corrected path (unpacked): ${filePath}`)
                    found = true
                  } else if (fs.existsSync(altPath)) {
                    filePath = path.normalize(altPath)
                    log.info(`[Protocol] Found file with corrected path: ${filePath}`)
                    found = true
                  }
                } else if (fs.existsSync(altPath)) {
                  filePath = path.normalize(altPath)
                  log.info(`[Protocol] Found file with corrected path: ${filePath}`)
                  found = true
                }
              }
            }
            
            // If still not found, return error
            if (!found && !fs.existsSync(filePath)) {
              log.error(`[Protocol] File not found after all attempts: ${filePath} (from URL: ${request.url})`)
              callback({ error: -6 }) // FILE_NOT_FOUND
              return
            }
          }
          
          log.debug(`[Protocol] Serving file: ${filePath} (from URL: ${request.url}, parsed: ${url})`)
          callback({ path: filePath })
        } catch (error: any) {
          log.error(`[Protocol] Error handling request ${request.url}:`, error)
          callback({ error: -6 }) // FILE_NOT_FOUND
        }
      })
      
      log.info("[Protocol] Registered app:// protocol handler")
    }
  }
}

/**
 * Create and configure main window
 * @param {object} app - Electron app instance
 * @returns {BrowserWindow} - Created window
 */
export function createWindow(app: App): BrowserWindow {
  // Resolve icon path - works in both dev and production
  let iconPath: string | null = null
  const isDev = !app.isPackaged
  
  if (isDev) {
    // Development: use relative path from electron directory
    iconPath = path.join(__dirname, '..', 'public', 'icon.png')
  } else {
    // Production: check multiple possible locations
    const appPath = app.getAppPath()
    
    // Try public folder (should be accessible)
    let publicPath = path.join(appPath, 'public', 'icon.png')
    
    // Check if appPath points to app.asar
    if (appPath.endsWith('.asar')) {
      // In asar, public folder should be unpacked or accessible
      // Try unpacked location first
      const unpackedPath = appPath.replace('.asar', '.asar.unpacked')
      publicPath = path.join(unpackedPath, 'public', 'icon.png')
      
      if (!fs.existsSync(publicPath)) {
        // Fallback to asar location
        publicPath = path.join(appPath, 'public', 'icon.png')
      }
    }
    
    // Also check if icon.png is in the out directory (copied from public)
    const outPath = path.join(appPath, 'out', 'icon.png')
    
    if (fs.existsSync(publicPath)) {
      iconPath = publicPath
    } else if (fs.existsSync(outPath)) {
      iconPath = outPath
    } else {
      // Fallback: try relative path (for development builds)
      iconPath = path.join(__dirname, '..', 'public', 'icon.png')
      if (!fs.existsSync(iconPath)) {
        log.warn(`[Window] icon.png not found in expected locations`)
        iconPath = null
      }
    }
  }
  
  // Log icon path for debugging
  if (iconPath && fs.existsSync(iconPath)) {
    log.info(`[Window] Using app icon: ${iconPath}`)
  } else {
    log.warn(`[Window] App icon not found, using default`)
  }
  
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 8, y: 8 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: (() => {
        if (isDev) {
          // In dev: __dirname is electron-dist/electron/window/
          // preload.js is at electron-dist/preload.js
          const preloadPath = path.join(__dirname, "..", "..", "preload.js")
          if (fs.existsSync(preloadPath)) {
            return preloadPath
          }
          // Fallback: try electron-dist/electron/preload.js (if it exists there)
          const fallbackPath = path.join(__dirname, "..", "preload.js")
          if (fs.existsSync(fallbackPath)) {
            return fallbackPath
          }
          log.warn(`[Window] Preload script not found at ${preloadPath} or ${fallbackPath}`)
          return preloadPath // Return the expected path anyway
        } else {
          // In production: preload.js should be in the same directory as main.js
          return path.join(__dirname, "..", "preload.js")
        }
      })(),
    },
    backgroundColor: "#000000",
  }
  
  // Only set icon if it exists (macOS may ignore SVG, but we try anyway)
  if (iconPath && fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath
  }
  
  const mainWindow = new BrowserWindow(windowOptions)
  sharedState.setMainWindow(mainWindow)

  // In development, load from Next.js dev server
  // In production, load from built static files

  // Filter out harmless DevTools Protocol errors (Autofill not supported in Electron)
  // These errors come from DevTools trying to enable Autofill features that Electron doesn't support
  mainWindow.webContents.on("console-message", (_event, _level, message) => {
    // Suppress harmless Autofill DevTools Protocol errors
    if (message && (message.includes("Autofill.enable") || message.includes("Autofill.setAddresses"))) {
      return // Don't log these errors
    }
  })

  // Check if we should use dev server or static files
  // Use dev server only if explicitly running in dev mode AND dev server is available
  const useDevServer = isDev && process.env.USE_DEV_SERVER === 'true'
  
  if (useDevServer) {
    // Development: use Next.js dev server
    // Add error handling for failed loads
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      log.error(`[Window] Failed to load: ${errorCode} - ${errorDescription} - ${validatedURL}`)
      // Show error message to user
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; flex-direction: column; font-family: system-ui; background: #000; color: #fff;">
          <h1 style="font-size: 24px; margin-bottom: 16px;">Failed to connect to dev server</h1>
          <p style="color: #888; margin-bottom: 8px;">Error: ${errorCode} - ${errorDescription}</p>
          <p style="color: #888; margin-bottom: 8px;">URL: ${validatedURL}</p>
          <p style="color: #666; font-size: 14px;">Make sure Next.js dev server is running on http://localhost:3000</p>
        </div>'
      `)
    })
    
    mainWindow.webContents.on('did-finish-load', () => {
      log.info('[Window] Page loaded successfully')
    })
    
    mainWindow.loadURL("http://localhost:3000")
    mainWindow.webContents.openDevTools()
  } else {
    // Production: load static files from out directory
    // In packaged Electron apps, files can be in:
    // 1. app.asar (when asar is enabled and not unpacked)
    // 2. app.asar.unpacked (when unpacked from asar)
    // 3. app directory (when asar is disabled)
    
    const appPath = app.getAppPath()
    let outDir = path.join(appPath, 'out')
    let indexPath = path.join(appPath, 'out', 'index.html')
    
    // Check if appPath points to app.asar, and if so, check for unpacked files
    if (appPath.endsWith('.asar')) {
      // Files are unpacked, so they're in app.asar.unpacked directory
      const unpackedPath = appPath.replace('.asar', '.asar.unpacked')
      const unpackedOutDir = path.join(unpackedPath, 'out')
      const unpackedIndexPath = path.join(unpackedOutDir, 'index.html')
      
      // Verify unpacked path exists
      if (fs.existsSync(unpackedIndexPath)) {
        outDir = unpackedOutDir
        indexPath = unpackedIndexPath
      } else {
        // Fallback: try inside asar (if files weren't unpacked)
        indexPath = path.join(appPath, 'out', 'index.html')
      }
    }
    
    // Validate the Next.js static export before loading
    const validation = validateNextJsStaticExport(outDir)
    
    if (!validation.valid) {
      // Log all errors and warnings
      log.error(`[Window] Next.js static export validation failed:`)
      validation.errors.forEach(error => log.error(`[Window] ERROR: ${error}`))
      validation.warnings.forEach(warning => log.warn(`[Window] WARNING: ${warning}`))
      
      // Build detailed error message for user
      const errorDetails = validation.errors.map(e => `  • ${e}`).join('\n')
      const warningDetails = validation.warnings.length > 0 
        ? '\n\nWarnings:\n' + validation.warnings.map(w => `  • ${w}`).join('\n')
        : ''
      
      const errorMessage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invalid Next.js Static Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      background: #2a2a2a;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    h1 {
      margin-top: 0;
      color: #ff6b6b;
      font-size: 24px;
    }
    .error-section {
      background: #3a1f1f;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
      border-left: 3px solid #ff6b6b;
    }
    .warning-section {
      background: #3a3a1f;
      padding: 15px;
      border-radius: 4px;
      margin: 15px 0;
      border-left: 3px solid #ffd93d;
    }
    pre {
      background: #1a1a1a;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
      line-height: 1.5;
      margin: 10px 0;
    }
    .solution {
      margin-top: 20px;
      padding: 15px;
      background: #1f3a3a;
      border-radius: 4px;
      border-left: 3px solid #4ecdc4;
    }
    .solution h2 {
      margin-top: 0;
      color: #4ecdc4;
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Invalid Next.js Static Export</h1>
    <p>The application files are missing or incomplete. The static export validation failed.</p>
    
    <div class="error-section">
      <strong>Errors:</strong>
      <pre>${errorDetails}</pre>
    </div>
    
    ${validation.warnings.length > 0 ? `
    <div class="warning-section">
      <strong>Warnings:</strong>
      <pre>${validation.warnings.map(w => `  • ${w}`).join('\n')}</pre>
    </div>
    ` : ''}
    
    <div class="solution">
      <h2>🔧 Solution</h2>
      <p>Please ensure the Next.js application was built with <code>output: 'export'</code> in <code>next.config.ts</code>:</p>
      <pre>const nextConfig = {
  output: 'export',
  // ... other config
}</pre>
      <p>Then rebuild the application:</p>
      <pre>npm run build</pre>
      <p><strong>Expected location:</strong> <code>${outDir}</code></p>
    </div>
  </div>
</body>
</html>`
      
      mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorMessage)}`)
      return mainWindow
    }
    
    // Log warnings if any (but continue loading since validation passed)
    if (validation.warnings.length > 0) {
      log.warn(`[Window] Next.js static export validation warnings:`)
      validation.warnings.forEach(warning => log.warn(`[Window] WARNING: ${warning}`))
    }
    
    // Verify the file exists before loading (double-check)
    if (fs.existsSync(indexPath)) {
      log.info(`[Window] Loading static file from: ${indexPath}`)
      // Use app:// protocol to support assetPrefix: '/' with next/font
      mainWindow.loadURL('app://index.html')
    } else {
      // Fallback: try relative path from __dirname (for development builds or different structures)
      const fallbackPath = path.join(__dirname, '..', 'out', 'index.html')
      const fallbackOutDir = path.join(__dirname, '..', 'out')
      
      // Validate fallback path as well
      const fallbackValidation = validateNextJsStaticExport(fallbackOutDir)
      
      if (fs.existsSync(fallbackPath) && fallbackValidation.valid) {
        log.info(`[Window] Loading static file from fallback: ${fallbackPath}`)
        mainWindow.loadFile(fallbackPath)
      } else {
        log.error(`[Window] Cannot find valid Next.js static export. Checked locations:
          - ${outDir} (validation: ${validation.valid ? 'PASSED' : 'FAILED'})
          - ${fallbackOutDir} (validation: ${fallbackValidation.valid ? 'PASSED' : 'FAILED'})
          - app.getAppPath(): ${appPath}
        `)
        
        // Show comprehensive error message
        const errorMessage = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Application Files Not Found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #1a1a1a;
      color: #e0e0e0;
      padding: 20px;
      box-sizing: border-box;
    }
    .container {
      max-width: 600px;
      background: #2a2a2a;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    }
    h1 {
      margin-top: 0;
      color: #ff6b6b;
    }
    pre {
      background: #1a1a1a;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>❌ Application Files Not Found</h1>
    <p>Could not locate a valid Next.js static export in any of the expected locations.</p>
    <p><strong>Checked locations:</strong></p>
    <pre>• ${outDir}
• ${fallbackOutDir}
• ${appPath}</pre>
    <p>Please rebuild the application with <code>npm run build</code>.</p>
  </div>
</body>
</html>`
        
        mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorMessage)}`)
      }
    }
  }

  mainWindow.on("closed", () => {
    sharedState.setMainWindow(null)
  })
  
  return mainWindow
}

