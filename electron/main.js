const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const { spawn } = require("child_process")
const fs = require("fs")
const net = require("net")
const os = require("os")
const { exec } = require("child_process")
const brew = require("./brew")
const storage = require("./storage")
let keytar
try {
  keytar = require("keytar")
} catch {
  keytar = null
}

let mainWindow
const runningDatabases = new Map() // id -> { process, config }

// Auto-start databases on app launch (simplified)
async function autoStartDatabases() {
  try {
    const databases = storage.loadDatabases(app)
    for (const db of databases) {
      if (db.autoStart && db.status === "stopped") {
        console.log(`[Auto-start] Marking database ${db.name} for auto-start...`)
        // Just mark for auto-start, don't actually start the process
        db.status = "running"
        storage.saveDatabase(app, db)
      }
    }
  } catch (error) {
    console.error("[Auto-start] Error loading databases:", error)
  }
}

// Reset all database statuses to stopped on app start
function resetDatabaseStatuses() {
  try {
    const databases = storage.loadDatabases(app)
    const updatedDatabases = databases.map(db => ({
      ...db,
      status: "stopped"
    }))
    storage.saveDatabases(app, updatedDatabases)
    console.log("[App Start] Reset all database statuses to stopped")
  } catch (error) {
    console.error("[App Start] Error resetting database statuses:", error)
  }
}

// Start database process (extracted from start-database handler)
async function startDatabaseProcess(config) {
  const { id, type, version, port, username, password } = config
  
  // Return immediately to prevent UI freezing
  console.log(`[Database] Starting ${type} database on port ${port}...`)
  
  // Use process.nextTick to defer the heavy initialization work to the next event loop
  process.nextTick(async () => {
    try {
      await startDatabaseProcessAsync(config)
    } catch (error) {
      console.error(`[Database] Failed to start ${type} database:`, error)
    }
  })
  
  return { success: true }
}

async function startDatabaseProcessAsync(config) {
  const { id, type, version, port, username, password } = config
  
  let cmd, args, env = { 
    ...process.env,
    PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
    HOMEBREW_PREFIX: "/opt/homebrew"
  }

  if (type === "postgresql") {
    // Find PostgreSQL binary path for the specific version (async)
    const { exec } = require("child_process")
    const { promisify } = require("util")
    const execAsync = promisify(exec)
    
    let postgresPath, initdbPath
    
    // Try to find the specific version first
    try {
      // Look for postgresql@16 specifically
      const { stdout: versionPath } = await execAsync("find /opt/homebrew -path '*/postgresql@16/*' -name postgres -type f 2>/dev/null | head -1")
      const { stdout: versionInitdbPath } = await execAsync("find /opt/homebrew -path '*/postgresql@16/*' -name initdb -type f 2>/dev/null | head -1")
      
      if (versionPath.trim() && versionInitdbPath.trim()) {
        postgresPath = versionPath.trim()
        initdbPath = versionInitdbPath.trim()
        console.log(`[PostgreSQL] Found PostgreSQL 16 at ${postgresPath}`)
      } else {
        throw new Error("PostgreSQL 16 not found")
      }
    } catch (e) {
      // Fallback to any PostgreSQL version
      try {
        const { stdout: postgresOut } = await execAsync("which postgres")
        const { stdout: initdbOut } = await execAsync("which initdb")
        postgresPath = postgresOut.trim()
        initdbPath = initdbOut.trim()
      } catch (e2) {
        // Try Homebrew paths
        try {
          const { stdout: postgresOut } = await execAsync("find /opt/homebrew -name postgres -type f 2>/dev/null | head -1")
          const { stdout: initdbOut } = await execAsync("find /opt/homebrew -name initdb -type f 2>/dev/null | head -1")
          postgresPath = postgresOut.trim()
          initdbPath = initdbOut.trim()
        } catch (e3) {
          console.error("PostgreSQL not found in PATH or Homebrew")
          throw new Error("PostgreSQL not found. Please ensure it's installed via Homebrew.")
        }
      }
    }
    
    cmd = postgresPath
    args = ["-D", `/tmp/liquidb-${id}`, "-p", port.toString(), "-h", "localhost"]
    
    // Create data directory and initialize (async to prevent blocking)
    const fs = require("fs").promises
    const fsSync = require("fs")
    
    try {
      await fs.mkdir(`/tmp/liquidb-${id}`, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    // Check if database directory already exists and is initialized
    const pgVersionPath = `/tmp/liquidb-${id}/PG_VERSION`
    
    if (!fsSync.existsSync(pgVersionPath)) {
      try {
        console.log(`[PostgreSQL] Initializing database with ${initdbPath}`)
        // Use spawn instead of execSync to prevent blocking
        const { spawn } = require("child_process")
        const initProcess = spawn(initdbPath, ["-D", `/tmp/liquidb-${id}`, "-U", "postgres"], {
          env: { ...env, LC_ALL: "C" },
          stdio: "pipe"
        })
        
        await new Promise((resolve, reject) => {
          initProcess.on("exit", (code) => {
            if (code === 0) {
              console.log(`[PostgreSQL] Database initialized successfully`)
              resolve()
            } else {
              console.log("PostgreSQL init failed, continuing without initialization")
              resolve() // Don't reject, just continue
            }
          })
          initProcess.on("error", (err) => {
            console.log("PostgreSQL init error:", err.message)
            resolve() // Don't reject, just continue
          })
        })
      } catch (e) {
        console.log("PostgreSQL init failed:", e.message)
        console.log(`[PostgreSQL] Continuing without initialization - database may still work`)
      }
    } else {
      console.log(`[PostgreSQL] Database already initialized, skipping initdb`)
    }
    
    // Set up authentication (async)
    const pgHbaPath = `/tmp/liquidb-${id}/pg_hba.conf`
    if (fsSync.existsSync(pgHbaPath)) {
      try {
        const content = await fs.readFile(pgHbaPath, "utf8")
        const updatedContent = content
          .replace(/^local\s+all\s+all\s+peer$/m, "local   all             all                                     trust")
          .replace(/^host\s+all\s+all\s+127\.0\.0\.1\/32\s+md5$/m, "host    all             all             127.0.0.1/32            trust")
        await fs.writeFile(pgHbaPath, updatedContent)
        console.log(`[PostgreSQL] Updated pg_hba.conf for trust authentication`)
      } catch (e) {
        console.log(`[PostgreSQL] Could not update pg_hba.conf:`, e.message)
      }
    }
  } else if (type === "mysql") {
    // Find MySQL binary path
    const { execSync } = require("child_process")
    let mysqldPath
    try {
      mysqldPath = execSync("which mysqld", { encoding: "utf8" }).trim()
    } catch (e) {
      try {
        mysqldPath = execSync("find /opt/homebrew -name mysqld -type f 2>/dev/null | head -1", { encoding: "utf8" }).trim()
      } catch (e2) {
        console.error("MySQL not found in PATH or Homebrew")
        throw new Error("MySQL not found. Please ensure it's installed via Homebrew.")
      }
    }
    
    cmd = mysqldPath
    args = ["--port", port.toString(), "--datadir", `/tmp/liquidb-${id}`, "--user=mysql", "--skip-grant-tables", "--skip-networking=false"]
    
    // Create data directory (async)
    const fs = require("fs").promises
    try {
      await fs.mkdir(`/tmp/liquidb-${id}`, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    try {
      console.log(`[MySQL] Initializing database with ${mysqldPath}`)
      // Use spawn instead of execSync to prevent blocking
      const { spawn } = require("child_process")
      const initProcess = spawn(mysqldPath, ["--initialize-insecure", "--datadir=/tmp/liquidb-${id}", "--user=mysql"], { stdio: "ignore" })
      
      await new Promise((resolve) => {
        initProcess.on("exit", () => resolve())
        initProcess.on("error", () => resolve())
      })
    } catch (e) {
      console.log("MySQL init:", e.message)
    }
  } else if (type === "mongodb") {
    // Find MongoDB binary path
    const { execSync } = require("child_process")
    let mongodPath
    try {
      mongodPath = execSync("which mongod", { encoding: "utf8" }).trim()
    } catch (e) {
      try {
        mongodPath = execSync("find /opt/homebrew -name mongod -type f 2>/dev/null | head -1", { encoding: "utf8" }).trim()
      } catch (e2) {
        console.error("MongoDB not found in PATH or Homebrew")
        throw new Error("MongoDB not found. Please ensure it's installed via Homebrew.")
      }
    }
    
    cmd = mongodPath
    args = ["--port", port.toString(), "--dbpath", `/tmp/liquidb-${id}`, "--bind_ip", "127.0.0.1"]
    
    // Create data directory (async)
    const fs = require("fs").promises
    try {
      await fs.mkdir(`/tmp/liquidb-${id}`, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
  } else if (type === "redis") {
    // Find Redis binary path
    const { execSync } = require("child_process")
    let redisPath
    try {
      redisPath = execSync("which redis-server", { encoding: "utf8" }).trim()
    } catch (e) {
      try {
        redisPath = execSync("find /opt/homebrew -name redis-server -type f 2>/dev/null | head -1", { encoding: "utf8" }).trim()
      } catch (e2) {
        console.error("Redis not found in PATH or Homebrew")
        throw new Error("Redis not found. Please ensure it's installed via Homebrew.")
      }
    }
    
    cmd = redisPath
    args = ["--port", port.toString(), "--bind", "127.0.0.1"]
  }

  const child = spawn(cmd, args, { env, detached: false })
  
  // Track startup status for PostgreSQL
  let isStartupComplete = false
  let startupTimeout = null
  let readyEventSent = false // Flag to prevent duplicate events
  
  // For PostgreSQL, listen for "ready to accept connections" message
  if (type === "postgresql") {
    const sendReadyEvent = () => {
      if (!readyEventSent && mainWindow) {
        readyEventSent = true
        console.log(`[PostgreSQL] ${id} sending ready event (readyEventSent: ${readyEventSent})`)
        mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true })
      } else {
        console.log(`[PostgreSQL] ${id} ready event already sent or no mainWindow (readyEventSent: ${readyEventSent}, mainWindow: ${!!mainWindow})`)
      }
    }
    
    child.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(`[PostgreSQL] ${id} output:`, output.trim())
      
      // Check for PostgreSQL ready message
      if (output.includes('ready to accept connections') || output.includes('database system is ready to accept connections')) {
        console.log(`[PostgreSQL] ${id} is ready to accept connections`)
        isStartupComplete = true
        if (startupTimeout) {
          clearTimeout(startupTimeout)
          startupTimeout = null
        }
        sendReadyEvent()
      }
    })
    
    child.stderr.on('data', (data) => {
      const output = data.toString()
      console.log(`[PostgreSQL] ${id} error output:`, output.trim())
      
      // Check for PostgreSQL ready message in stderr too
      if (output.includes('ready to accept connections') || output.includes('database system is ready to accept connections')) {
        console.log(`[PostgreSQL] ${id} is ready to accept connections (from stderr)`)
        isStartupComplete = true
        if (startupTimeout) {
          clearTimeout(startupTimeout)
          startupTimeout = null
        }
        sendReadyEvent()
      }
    })
    
    // Set a timeout for PostgreSQL startup (60 seconds)
    startupTimeout = setTimeout(() => {
      if (!isStartupComplete) {
        console.log(`[PostgreSQL] ${id} startup timeout - assuming ready`)
        isStartupComplete = true
        sendReadyEvent()
      }
    }, 60000)
  }
  
  child.on("error", (err) => {
    console.error(`[Database] ${id} error:`, err)
    runningDatabases.delete(id)
    if (startupTimeout) {
      clearTimeout(startupTimeout)
      startupTimeout = null
    }
    // Notify the renderer process that the database has stopped
    if (mainWindow) {
      mainWindow.webContents.send('database-status-changed', { id, status: 'stopped', error: err.message })
    }
  })

  child.on("exit", (code) => {
    console.log(`[Database] ${id} exited with code ${code}`)
    runningDatabases.delete(id)
    if (startupTimeout) {
      clearTimeout(startupTimeout)
      startupTimeout = null
    }
    // Notify the renderer process that the database has stopped
    if (mainWindow) {
      mainWindow.webContents.send('database-status-changed', { id, status: 'stopped', exitCode: code })
    }
  })

  // Add to running map immediately - we'll let the process events handle cleanup
  runningDatabases.set(id, { process: child, config, isStartupComplete: () => isStartupComplete })
  console.log(`[Database] ${type} database process started (PID: ${child.pid})`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 20, y: 20 },
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    backgroundColor: "#000000",
  })

  // In development, load from Next.js dev server
  // In production, load from built files
  const isDev = !app.isPackaged

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000")
    mainWindow.webContents.openDevTools()
  } else {
    // Start Next.js server in production
    const nextServer = spawn("node", [path.join(__dirname, "../.next/standalone/server.js")], {
      env: { ...process.env, PORT: "3000" },
    })

    nextServer.stdout.on("data", (data) => {
      console.log(`Next.js: ${data}`)
    })

    setTimeout(() => {
      mainWindow.loadURL("http://localhost:3000")
    }, 2000)
  }

  mainWindow.on("closed", () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  resetDatabaseStatuses()
  createWindow()
  // Auto-start databases after a short delay
  setTimeout(autoStartDatabases, 2000)
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Cleanup on app termination
app.on("before-quit", () => {
  console.log("[App Quit] Stopping all databases...")
  for (const [id, db] of runningDatabases) {
    try {
      console.log(`[App Quit] Stopping database ${id}`)
      db.process.kill("SIGTERM")
    } catch (error) {
      console.error(`[App Quit] Error stopping database ${id}:`, error)
    }
  }
  runningDatabases.clear()
})

// Handle app termination
process.on("SIGINT", () => {
  console.log("[App Quit] Received SIGINT, stopping all databases...")
  for (const [id, db] of runningDatabases) {
    try {
      db.process.kill("SIGTERM")
    } catch (error) {
      console.error(`[App Quit] Error stopping database ${id}:`, error)
    }
  }
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("[App Quit] Received SIGTERM, stopping all databases...")
  for (const [id, db] of runningDatabases) {
    try {
      db.process.kill("SIGTERM")
    } catch (error) {
      console.error(`[App Quit] Error stopping database ${id}:`, error)
    }
  }
  process.exit(0)
})

// IPC handlers for database operations
ipcMain.handle("start-database", async (event, config) => {
  const { id } = config
  if (runningDatabases.has(id)) {
    return { success: false, error: "Database already running" }
  }

  try {
    return await startDatabaseProcess(config)
  } catch (error) {
    console.error("Failed to start database:", error)
    return { success: false, error: error.message }
  }
})

// Simple port check (not used in new logic)
function testPortConnectivity(port) {
  return new Promise((resolve) => {
    const net = require('net')
    const socket = new net.Socket()
    
    socket.setTimeout(2000)
    
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    
    socket.connect(port, 'localhost')
  })
}

// Simple and reliable database status check
async function checkDatabaseStatus(id) {
  try {
    console.log(`[Status Check] Checking database ${id}`)

    // 1. Check if we have this database in our running map
    const db = runningDatabases.get(id)
    if (!db) {
      console.log(`[Status Check] Database ${id} not in running map`)
      return { status: "stopped" }
    }

    // 2. Check if the process is still alive
    if (db.process.killed || db.process.exitCode !== null) {
      console.log(`[Status Check] Database ${id} process has died`)
      runningDatabases.delete(id)
      return { status: "stopped" }
    }

    // 3. For PostgreSQL, check if startup is complete
    if (db.config.type === "postgresql" && db.isStartupComplete && !db.isStartupComplete()) {
      console.log(`[Status Check] Database ${id} is starting (PostgreSQL not ready yet)`)
      return { status: "starting" }
    }

    // 4. Simple process check - if it exists and isn't killed, it's running
    console.log(`[Status Check] Database ${id} is running (PID: ${db.process.pid})`)
    return { status: "running" }
  } catch (error) {
    console.log(`[Status Check] Error checking ${id}: ${error.message}`)
    return { status: "stopped" }
  }
}

// Simple status check
ipcMain.handle("check-database-status", async (event, id) => {
  return await checkDatabaseStatus(id)
})

ipcMain.handle("stop-database", async (event, id) => {
  const db = runningDatabases.get(id)
  if (!db) {
    return { success: false, error: "Database not running" }
  }

  try {
    db.process.kill("SIGTERM")
    runningDatabases.delete(id)
    return { success: true }
  } catch (error) {
    console.error("Failed to stop database:", error)
    return { success: false, error: error.message }
  }
})

// Simple debug function
ipcMain.handle("verify-database-instance", async (event, id) => {
  const db = runningDatabases.get(id)
  if (!db) {
    return { 
      isRunning: false, 
      error: "Database not in running map",
      pid: null
    }
  }
  
  return {
    isRunning: !db.process.killed && db.process.exitCode === null,
    pid: db.process.pid,
    killed: db.process.killed,
    exitCode: db.process.exitCode
  }
})

ipcMain.handle("check-port", async (event, port) => {
  const portNum = Number(port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { available: false, reason: "invalid_range" }
  }

  if (portNum < 1024) {
    // macOS/Linux privileged port range
    return { available: false, reason: "privileged" }
  }

  // Load banned ports from a JSON file under app data
  const dataDir = path.join(app.getPath("userData"))
  const bannedFile = path.join(dataDir, "banned-ports.json")
  let banned = []
  try {
    if (fs.existsSync(bannedFile)) {
      banned = JSON.parse(fs.readFileSync(bannedFile, "utf-8"))
    }
  } catch {
    banned = []
  }
  if (Array.isArray(banned) && banned.includes(portNum)) {
    return { available: false, reason: "banned" }
  }

  // Fast check by trying to bind
  const canBind = await new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => {
      resolve(false)
    })
    server.once("listening", () => {
      server.close(() => resolve(true))
    })
    server.listen(portNum, "127.0.0.1")
  })
  if (!canBind) {
    // Extra diagnostic with lsof if available
    return await new Promise((resolve) => {
      exec(`lsof -i :${portNum} -sTCP:LISTEN -n -P | tail -n +2`, (err, stdout) => {
        if (stdout && stdout.trim().length > 0) {
          resolve({ available: false, reason: "in_use", details: stdout.trim() })
        } else {
          resolve({ available: false, reason: "in_use" })
        }
      })
    })
  }

  return { available: true }
})

// Brew-related IPC
ipcMain.handle("brew:isInstalled", async () => {
  return brew.isHomebrewInstalled()
})

ipcMain.handle("brew:install", async () => {
  await brew.installHomebrew()
  return true
})

ipcMain.handle("brew:getVersions", async (event, dbType) => {
  return brew.getDatabaseVersions(dbType)
})

ipcMain.handle("brew:installDb", async (event, { dbType, version }) => {
  await brew.installDatabase({ dbType, version })
  return true
})

// Banned ports persistence
function getBannedPortsFile() {
  const dataDir = path.join(app.getPath("userData"))
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, "banned-ports.json")
}

ipcMain.handle("ports:getBanned", async () => {
  try {
    const file = getBannedPortsFile()
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8"))
      return Array.isArray(parsed) ? parsed : []
    }
  } catch {
    // ignore
  }
  return []
})

ipcMain.handle("ports:setBanned", async (event, ports) => {
  try {
    const file = getBannedPortsFile()
    const uniqueSorted = Array.from(new Set((Array.isArray(ports) ? ports : []).filter((p) => Number.isInteger(p))))
      .sort((a, b) => a - b)
    fs.writeFileSync(file, JSON.stringify(uniqueSorted, null, 2), "utf-8")
    return true
  } catch (e) {
    return false
  }
})

ipcMain.handle("get-databases", async () => {
  const list = storage.loadDatabases(app)
  return list
})

ipcMain.handle("db:save", async (event, db) => {
  if (db?.password && keytar) {
    try {
      await keytar.setPassword("LiquiDB", db.id, db.password)
      db.password = "__SECURE__"
    } catch {}
  }
  const saved = storage.upsertDatabase(app, db)
  return saved
})

ipcMain.handle("db:getPassword", async (event, id) => {
  if (!keytar) return null
  try {
    return await keytar.getPassword("LiquiDB", id)
  } catch {
    return null
  }
})

ipcMain.handle("db:delete", async (event, id) => {
  try {
    // Stop the database if it's running
    const db = runningDatabases.get(id)
    if (db) {
      try {
        console.log(`[Delete] Stopping database ${id}`)
        db.process.kill("SIGTERM")
      } catch (error) {
        console.error(`[Delete] Error stopping database ${id}:`, error)
      }
      runningDatabases.delete(id)
    }
    
    // Delete password from keychain
    if (keytar) {
      try {
        await keytar.deletePassword("LiquiDB", id)
      } catch {}
    }
    
    // Delete database data files
    const fs = require("fs")
    const dataDir = `/tmp/liquidb-${id}`
    if (fs.existsSync(dataDir)) {
      try {
        console.log(`[Delete] Removing database files for ${id}: ${dataDir}`)
        fs.rmSync(dataDir, { recursive: true, force: true })
      } catch (error) {
        console.error(`[Delete] Error removing database files for ${id}:`, error)
      }
    }
    
    // Delete from storage
    return storage.deleteDatabase(app, id)
  } catch (error) {
    console.error(`[Delete] Error deleting database ${id}:`, error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("db:deleteAll", async (event) => {
  try {
    // Stop all running databases first
    for (const [id, db] of runningDatabases) {
      try {
        console.log(`[Delete All] Stopping database ${id}`)
        db.process.kill("SIGTERM")
      } catch (error) {
        console.error(`[Delete All] Error stopping database ${id}:`, error)
      }
    }
    runningDatabases.clear()
    
    // Get all databases before deleting them
    const databases = storage.loadDatabases(app)
    
    // Delete all passwords from keychain
    if (keytar) {
      for (const db of databases) {
        try {
          await keytar.deletePassword("LiquiDB", db.id)
        } catch {}
      }
    }
    
    // Delete all database data files
    const fs = require("fs")
    const path = require("path")
    for (const db of databases) {
      try {
        const dataDir = `/tmp/liquidb-${db.id}`
        if (fs.existsSync(dataDir)) {
          console.log(`[Delete All] Removing database files for ${db.id}: ${dataDir}`)
          fs.rmSync(dataDir, { recursive: true, force: true })
        }
      } catch (error) {
        console.error(`[Delete All] Error removing database files for ${db.id}:`, error)
      }
    }
    
    // Delete all databases from storage
    storage.deleteAllDatabases(app)
    console.log("[Delete All] All databases and data files deleted successfully")
    return { success: true }
  } catch (error) {
    console.error("[Delete All] Error deleting all databases:", error)
    return { success: false, error: error.message }
  }
})
