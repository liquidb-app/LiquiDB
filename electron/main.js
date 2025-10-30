const { app, BrowserWindow, ipcMain, shell } = require("electron")

// Import logging system
const { log } = require('./logger')

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
const path = require("path")
const { spawn } = require("child_process")
const fs = require("fs")
const net = require("net")
const os = require("os")
const { exec } = require("child_process")
const brew = require("./brew")
const storage = require("./storage")
const HelperServiceManager = require("./helper-service")
const PermissionsManager = require("./permissions")
const https = require("https")
const http = require("http")
const AutoLaunch = require("auto-launch")
let keytar
try {
  keytar = require("keytar")
} catch {
  keytar = null
}

let mainWindow
const runningDatabases = new Map() // id -> { process, config }
let helperService = null
let permissionsManager = null

// Auto-launch configuration
let autoLauncher
try {
  log.debug("App path:", process.execPath)
  log.debug("App name:", require('path').basename(process.execPath))
  
  // Use the proper app name instead of executable name
  const appName = app.getName() || "LiquiDB"
  log.debug("Using app name:", appName)
  
  // For macOS, try to use the app bundle path if available
  let appPath = process.execPath
  if (process.platform === 'darwin' && process.execPath.includes('.app')) {
    // Extract the app bundle path from the executable path
    const pathParts = process.execPath.split('/')
    const appIndex = pathParts.findIndex(part => part.endsWith('.app'))
    if (appIndex !== -1) {
      appPath = pathParts.slice(0, appIndex + 1).join('/')
      log.debug("Using app bundle path:", appPath)
    }
  }
  
  autoLauncher = new AutoLaunch({
    name: appName,
    path: appPath,
    isHidden: true
  })
  log.info("Auto-launch module initialized successfully")
} catch (error) {
  console.error("[Auto-launch] Failed to initialize auto-launch module:", error)
  autoLauncher = null
}

// Alternative MySQL initialization method
async function alternativeMySQLInit(mysqldPath, dataDir, env) {
  console.log(`[MySQL Alt] Trying alternative initialization...`)
  
  // Try with different arguments
  const { spawn } = require("child_process")
  const initProcess = spawn(mysqldPath, [
    "--initialize-insecure", 
    `--datadir=${dataDir}`,
    `--log-error=${dataDir}/mysql-alt-init.log`,
    "--skip-log-bin",
    "--skip-innodb",
    "--default-storage-engine=MyISAM"
  ], { 
    stdio: "pipe",
    env: { 
      ...env,
      MYSQL_HOME: "/opt/homebrew"
    }
  })
  
  let initOutput = ""
  let initError = ""
  
  initProcess.stdout.on("data", (data) => {
    const output = data.toString()
    initOutput += output
    console.log(`[MySQL Alt Init] ${output.trim()}`)
  })
  
  initProcess.stderr.on("data", (data) => {
    const error = data.toString()
    initError += error
    console.error(`[MySQL Alt Init Error] ${error.trim()}`)
  })
  
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      initProcess.kill('SIGTERM')
      reject(new Error('Alternative MySQL initialization timed out'))
    }, 30000)
    
    initProcess.on("exit", async (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        console.log(`[MySQL Alt] Alternative initialization successful`)
        resolve()
      } else {
        console.error(`[MySQL Alt] Alternative initialization failed with code ${code}`)
        console.error(`[MySQL Alt] Output:`, initOutput)
        console.error(`[MySQL Alt] Error:`, initError)
        
        // Try to read the error log
        try {
          const logContent = await fs.readFile(`${dataDir}/mysql-alt-init.log`, 'utf8')
          console.error(`[MySQL Alt] Error log:`, logContent)
        } catch (logError) {
          console.log(`[MySQL Alt] Could not read error log`)
        }
        
        reject(new Error(`Alternative MySQL initialization failed with exit code ${code}`))
      }
    })
    
    initProcess.on("error", (error) => {
      clearTimeout(timeout)
      console.error(`[MySQL Alt] Process error:`, error)
      reject(error)
    })
  })
}

// Helper function to find a free port for auto-start conflicts
function findFreePortForAutoStart(port, usedPorts) {
  let newPort = port + 1
  while (usedPorts.includes(newPort) && newPort < 65535) {
    newPort++
  }
  return newPort
}

// Auto-start databases on app launch (simplified)
async function autoStartDatabases() {
  try {
    const databases = storage.loadDatabases(app)
    const autoStartDatabases = databases.filter(db => db.autoStart && db.status === "stopped")
    
    if (autoStartDatabases.length === 0) {
      console.log("[Auto-start] No databases configured for auto-start")
      return
    }
    
    console.log(`[Auto-start] Found ${autoStartDatabases.length} databases to auto-start:`, 
      autoStartDatabases.map(db => `${db.name} (${db.type})`).join(", "))
    
    // Check for port conflicts among auto-start databases
    const portConflicts = []
    const usedPorts = []
    const databasesToStart = []
    
    for (const db of autoStartDatabases) {
      if (usedPorts.includes(db.port)) {
        // Port conflict detected
        const conflictingDb = databasesToStart.find(d => d.port === db.port)
        portConflicts.push({
          database: db,
          conflictingDatabase: conflictingDb,
          suggestedPort: findFreePortForAutoStart(db.port, usedPorts)
        })
        console.warn(`[Auto-start] Port conflict detected: ${db.name} (port ${db.port}) conflicts with ${conflictingDb.name}`)
      } else {
        usedPorts.push(db.port)
        databasesToStart.push(db)
      }
    }
    
    // Handle port conflicts
    if (portConflicts.length > 0) {
      console.log(`[Auto-start] Found ${portConflicts.length} port conflicts, resolving automatically`)
      
      for (const conflict of portConflicts) {
        const { database, suggestedPort } = conflict
        console.log(`[Auto-start] Resolving conflict: ${database.name} port changed from ${database.port} to ${suggestedPort}`)
        
        // Update the database port in storage
        try {
          const updatedDb = { ...database, port: suggestedPort }
          const allDatabases = storage.loadDatabases(app)
          const dbIndex = allDatabases.findIndex(d => d.id === database.id)
          if (dbIndex >= 0) {
            allDatabases[dbIndex] = updatedDb
            storage.saveDatabases(app, allDatabases)
            console.log(`[Auto-start] Updated ${database.name} port to ${suggestedPort} in storage`)
          }
          
          // Add to databases to start with updated port
          databasesToStart.push(updatedDb)
          usedPorts.push(suggestedPort)
        } catch (error) {
          console.error(`[Auto-start] Failed to update port for ${database.name}:`, error)
          // Skip this database if port update fails
        }
      }
      
      // Notify frontend about port conflicts and resolutions
      if (mainWindow) {
        mainWindow.webContents.send('auto-start-port-conflicts', {
          conflicts: portConflicts.map(c => ({
            databaseName: c.database.name,
            originalPort: c.database.port,
            newPort: c.suggestedPort,
            conflictingDatabase: c.conflictingDatabase.name
          }))
        })
      }
    }
    
    let successCount = 0
    let failureCount = 0
    let skippedCount = 0
    
    for (const db of databasesToStart) {
      try {
        console.log(`[Auto-start] Starting database ${db.name} (${db.type}) on port ${db.port}...`)
        
        // Send initial "starting" status to frontend before starting the process
        if (mainWindow) {
          mainWindow.webContents.send('database-status-changed', { 
            id: db.id, 
            status: 'starting', 
            pid: null 
          })
          console.log(`[Auto-start] Sent initial starting status for ${db.name} to frontend`)
        }
        
        // Start the database process
        const result = await startDatabaseProcessAsync(db)
        
        if (result && result.success) {
          console.log(`[Auto-start] Successfully started ${db.name}`)
          successCount++
          
          // Verify the database is actually running by checking the running databases map
          setTimeout(() => {
            if (runningDatabases.has(db.id)) {
              console.log(`[Auto-start] Verified ${db.name} is running (PID: ${runningDatabases.get(db.id).process.pid})`)
            } else {
              console.warn(`[Auto-start] Warning: ${db.name} may not be running despite successful start`)
            }
          }, 2000) // Check after 2 seconds
        } else {
          console.error(`[Auto-start] Failed to start ${db.name}:`, result ? result.error : "No result returned")
          failureCount++
        }
      } catch (error) {
        console.error(`[Auto-start] Error starting database ${db.name}:`, error)
        failureCount++
      }
      
      // Add a small delay between starts to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Count skipped databases (those with unresolvable port conflicts)
    skippedCount = autoStartDatabases.length - databasesToStart.length
    
    console.log(`[Auto-start] Auto-start process completed: ${successCount} successful, ${failureCount} failed, ${skippedCount} skipped due to port conflicts`)
    
    // Send summary to frontend
    if (mainWindow) {
      mainWindow.webContents.send('auto-start-completed', {
        total: autoStartDatabases.length,
        successful: successCount,
        failed: failureCount,
        skipped: skippedCount,
        portConflicts: portConflicts.length
      })
    }
  } catch (error) {
    console.error("[Auto-start] Error in auto-start process:", error)
  }
}

// Reset all database statuses to stopped on app start
function resetDatabaseStatuses() {
  try {
    const databases = storage.loadDatabases(app)
    const updatedDatabases = databases.map(db => ({
      ...db,
      status: "stopped",
      pid: null
    }))
    storage.saveDatabases(app, updatedDatabases)
    console.log("[App Start] Reset all database statuses to stopped and cleared PIDs")
  } catch (error) {
    console.error("[App Start] Error resetting database statuses:", error)
  }
}

// Start database process (extracted from start-database handler)
async function startDatabaseProcess(config) {
  const { id, type, version, port, username, password, containerId } = config
  
  // Return immediately to prevent UI freezing
  log.info(`Starting ${type} database on port ${port}...`)
  
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
  const { id, type, version, port, username, password, containerId } = config
  
  try {
    let cmd, args, env = { 
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew"
    }
    
    // Declare mysqldPath at function scope so it's accessible throughout
    let mysqldPath

  if (type === "postgresql") {
    // Get PostgreSQL binary paths from database record or find them
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    let postgresPath, initdbPath
    
    if (dbRecord?.homebrewPath) {
      // Use stored Homebrew path
      postgresPath = `${dbRecord.homebrewPath}/postgres`
      initdbPath = `${dbRecord.homebrewPath}/initdb`
      console.log(`[PostgreSQL] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
    } else {
      // Fallback to finding PostgreSQL binary path for the specific version (async)
      const { exec } = require("child_process")
      const { promisify } = require("util")
      const execAsync = promisify(exec)
      
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
    }
    
    // Create data directory and initialize (async to prevent blocking)
    const fs = require("fs").promises
    const fsSync = require("fs")
    const dataDir = storage.getDatabaseDataDir(app, containerId)
    
    try {
      await fs.mkdir(dataDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = postgresPath
    args = ["-D", dataDir, "-p", port.toString(), "-h", "localhost"]
    
    // Check if database directory already exists and is initialized
    const pgVersionPath = `${dataDir}/PG_VERSION`
    
    if (!fsSync.existsSync(pgVersionPath)) {
      try {
        console.log(`[PostgreSQL] Initializing database with ${initdbPath}`)
        // Use spawn instead of execSync to prevent blocking
        const { spawn } = require("child_process")
        const initProcess = spawn(initdbPath, ["-D", dataDir, "-U", "postgres"], {
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
    const pgHbaPath = `${dataDir}/pg_hba.conf`
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
    // Get MySQL binary path from database record or find it
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    
    if (dbRecord?.homebrewPath) {
      // Use stored Homebrew path
      mysqldPath = `${dbRecord.homebrewPath}/mysqld`
      console.log(`[MySQL] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
    } else {
      // Fallback to finding MySQL binary path
      const { execSync } = require("child_process")
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
    }
    
    // Create data directory (async)
    const fs = require("fs").promises
    const dataDir = storage.getDatabaseDataDir(app, containerId)
    
    // Get the MySQL base directory from the mysqld path
    const mysqlBaseDir = mysqldPath.replace('/bin/mysqld', '')
    
    cmd = mysqldPath
    args = [
      "--port", port.toString(), 
      "--datadir", dataDir, 
      "--bind-address=127.0.0.1",
      `--log-error=${dataDir}/mysql-error.log`,
      `--basedir=${mysqlBaseDir}`,
      "--tmpdir=/tmp",
      `--pid-file=${dataDir}/mysql.pid`,
      `--socket=/tmp/mysql-${containerId}.sock`,
      "--mysqlx=OFF"  // Disable X Plugin to allow multiple MySQL instances
    ]
    
    console.log(`[MySQL] Starting MySQL with ID: ${id}, Container ID: ${containerId}, Port: ${port}`)
    console.log(`[MySQL] Socket path: /tmp/mysql-${containerId}.sock`)
    console.log(`[MySQL] Data dir: ${dataDir}`)
    console.log(`[MySQL] Args:`, args)
    try {
      await fs.mkdir(dataDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    // Initialize MySQL database if it doesn't exist
    const mysqlDataExists = await fs.access(`${dataDir}/mysql`).then(() => true).catch(() => false)
    
    if (!mysqlDataExists) {
      try {
        console.log(`[MySQL] Initializing database with ${mysqldPath}`)
        console.log(`[MySQL] Data directory: ${dataDir}`)
        
        // Ensure data directory is empty and has proper permissions
        try {
          await fs.rmdir(dataDir, { recursive: true })
        } catch (e) {
          // Directory might not exist, that's fine
        }
        await fs.mkdir(dataDir, { recursive: true })
        
        // Add a small delay to ensure directory is properly created
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Use spawn instead of execSync to prevent blocking
        const { spawn } = require("child_process")
        // Get the MySQL base directory from the mysqld path
        const mysqlBaseDir = mysqldPath.replace('/bin/mysqld', '')
        
        const initProcess = spawn(mysqldPath, [
          "--initialize-insecure", 
          `--datadir=${dataDir}`,
          `--log-error=${dataDir}/mysql-init.log`,
          `--basedir=${mysqlBaseDir}`,
          "--tmpdir=/tmp"
        ], { 
          stdio: "pipe",
          env: { 
            ...env,
            MYSQL_HOME: mysqlBaseDir,
            MYSQL_UNIX_PORT: `/tmp/mysql-${containerId}.sock`
          },
          cwd: mysqlBaseDir
        })
        
        let initOutput = ""
        let initError = ""
        
        initProcess.stdout.on("data", (data) => {
          const output = data.toString()
          initOutput += output
          console.log(`[MySQL Init] ${output.trim()}`)
        })
        
        initProcess.stderr.on("data", (data) => {
          const error = data.toString()
          initError += error
          console.error(`[MySQL Init Error] ${error.trim()}`)
        })
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.log(`[MySQL] Initialization timeout, killing process...`)
            initProcess.kill('SIGTERM')
            reject(new Error('MySQL initialization timed out after 30 seconds'))
          }, 30000)
          
          initProcess.on("exit", async (code) => {
            clearTimeout(timeout)
            console.log(`[MySQL] Initialization process exited with code ${code}`)
            if (code === 0) {
              console.log(`[MySQL] Database initialized successfully`)
              // Verify the mysql directory was created
              try {
                const mysqlDirExists = await fs.access(`${dataDir}/mysql`).then(() => true).catch(() => false)
                if (mysqlDirExists) {
                  console.log(`[MySQL] Verified mysql directory exists`)
                  resolve()
                } else {
                  console.error(`[MySQL] MySQL directory not found after initialization`)
                  reject(new Error('MySQL initialization completed but mysql directory not found'))
                }
              } catch (verifyError) {
                console.error(`[MySQL] Error verifying mysql directory:`, verifyError.message)
                reject(verifyError)
              }
            } else {
              console.error(`[MySQL] Initialization failed with code ${code}`)
              console.error(`[MySQL] Init output:`, initOutput)
              console.error(`[MySQL] Init error:`, initError)
              
              // Try to read the error log for more details
              try {
                const logContent = await fs.readFile(`${dataDir}/mysql-init.log`, 'utf8')
                console.error(`[MySQL] Error log content:`, logContent)
              } catch (logError) {
                console.log(`[MySQL] Could not read error log:`, logError.message)
              }
              
              // Try alternative initialization method
              console.log(`[MySQL] Attempting alternative initialization method...`)
              try {
                await alternativeMySQLInit(mysqldPath, dataDir, env)
                console.log(`[MySQL] Alternative initialization successful`)
                resolve()
              } catch (altError) {
                console.error(`[MySQL] Alternative initialization also failed:`, altError.message)
                reject(new Error(`MySQL initialization failed with exit code ${code}. Both standard and alternative methods failed.`))
              }
            }
          })
          
          initProcess.on("error", (error) => {
            clearTimeout(timeout)
            console.error(`[MySQL] Initialization process error:`, error)
            reject(error)
          })
        })
      } catch (e) {
        console.error(`[MySQL] Initialization error:`, e.message)
        throw new Error(`MySQL initialization failed: ${e.message}`)
      }
    } else {
      console.log(`[MySQL] Database already initialized, skipping initialization`)
    }
  } else if (type === "mongodb") {
    // Get MongoDB binary path from database record or find it
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    let mongodPath
    
    if (dbRecord?.homebrewPath) {
      // Use stored Homebrew path
      mongodPath = `${dbRecord.homebrewPath}/mongod`
      console.log(`[MongoDB] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
    } else {
      // Fallback to finding MongoDB binary path
      const { execSync } = require("child_process")
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
    }
    
    // Create data directory (async)
    const fs = require("fs").promises
    const dataDir = storage.getDatabaseDataDir(app, containerId)
    
    try {
      await fs.mkdir(dataDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = mongodPath
    args = ["--port", port.toString(), "--dbpath", dataDir, "--bind_ip", "127.0.0.1"]
  } else if (type === "redis") {
    // Get Redis binary path from database record or find it
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    let redisPath
    
    if (dbRecord?.homebrewPath) {
      // Use stored Homebrew path
      redisPath = `${dbRecord.homebrewPath}/redis-server`
      console.log(`[Redis] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
    } else {
      // Fallback to finding Redis binary path
      const { execSync } = require("child_process")
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
    }
    
    // Create data directory for Redis
    const fs = require("fs").promises
    const redisDataDir = storage.getDatabaseDataDir(app, containerId)
    try {
      await fs.mkdir(redisDataDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = redisPath
    args = [
      "--port", port.toString(), 
      "--bind", "127.0.0.1",
      "--dir", redisDataDir,
      "--dbfilename", `dump-${containerId}.rdb`,
      "--save", "900 1", // Save after 900 seconds if at least 1 key changed
      "--save", "300 10", // Save after 300 seconds if at least 10 keys changed
      "--save", "60 10000" // Save after 60 seconds if at least 10000 keys changed
    ]
  }

  const child = spawn(cmd, args, { env, detached: false })
  
  // Track startup status for PostgreSQL
  let isStartupComplete = false
  let startupTimeout = null
  let readyEventSent = false // Flag to prevent duplicate events
  let stoppedEventSent = false // Flag to prevent duplicate stopped events
  
  // For PostgreSQL, listen for "ready to accept connections" message
  if (type === "postgresql") {
    const sendReadyEvent = () => {
      if (!readyEventSent && mainWindow) {
        readyEventSent = true
        console.log(`[PostgreSQL] ${id} sending ready event (readyEventSent: ${readyEventSent})`)
        
        // Update status to running in storage
        try {
          const databases = storage.loadDatabases(app)
          const dbIndex = databases.findIndex(db => db.id === id)
          if (dbIndex >= 0) {
            databases[dbIndex].status = 'running'
            databases[dbIndex].pid = child.pid
            storage.saveDatabases(app, databases)
            console.log(`[Database] ${id} status updated to running in storage`)
          }
        } catch (error) {
          console.error(`[Database] ${id} failed to update status to running in storage:`, error)
        }
        
        mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true, pid: child.pid })
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
  } else if (type === "mysql") {
    // For MySQL, wait for startup completion
    const sendReadyEvent = () => {
      if (!readyEventSent && mainWindow) {
        readyEventSent = true
        console.log(`[MySQL] ${id} sending ready event (readyEventSent: ${readyEventSent})`)
        
        // Update status to running in storage
        try {
          const databases = storage.loadDatabases(app)
          const dbIndex = databases.findIndex(db => db.id === id)
          if (dbIndex >= 0) {
            databases[dbIndex].status = 'running'
            databases[dbIndex].pid = child.pid
            storage.saveDatabases(app, databases)
            console.log(`[Database] ${id} status updated to running in storage`)
          }
        } catch (error) {
          console.error(`[Database] ${id} failed to update status to running in storage:`, error)
        }
        
        // Create a user with no password for easy access
        try {
          const { execSync } = require("child_process")
          const mysqlClientPath = mysqldPath.replace('mysqld', 'mysql')
          
          // Wait a moment for MySQL to be fully ready
          setTimeout(async () => {
            try {
              // Create user with no password
              execSync(`${mysqlClientPath} --socket=/tmp/mysql-${containerId}.sock -e "CREATE USER IF NOT EXISTS 'root'@'localhost' IDENTIFIED BY ''; GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' WITH GRANT OPTION; FLUSH PRIVILEGES;"`, { 
                stdio: 'pipe',
                env: { 
                  ...process.env,
                  PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
                  HOMEBREW_PREFIX: "/opt/homebrew"
                }
              })
              console.log(`[MySQL] ${id} created root user with no password`)
            } catch (userError) {
              console.log(`[MySQL] ${id} user creation failed (this is normal for existing databases):`, userError.message)
            }
          }, 2000)
        } catch (error) {
          console.log(`[MySQL] ${id} user creation setup failed:`, error.message)
        }
        
        mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true, pid: child.pid })
      } else {
        console.log(`[MySQL] ${id} ready event already sent or no mainWindow (readyEventSent: ${readyEventSent}, mainWindow: ${!!mainWindow})`)
      }
    }
    
    child.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(`[MySQL] ${id} output:`, output.trim())
      
      // Check for MySQL ready message
      if (output.includes('ready for connections') || output.includes('ready to accept connections') || output.includes('mysqld: ready for connections')) {
        console.log(`[MySQL] ${id} is ready for connections`)
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
      console.log(`[MySQL] ${id} error output:`, output.trim())
      
      // Check for MySQL ready message in stderr too
      if (output.includes('ready for connections') || output.includes('ready to accept connections') || output.includes('mysqld: ready for connections')) {
        console.log(`[MySQL] ${id} is ready for connections (from stderr)`)
        isStartupComplete = true
        if (startupTimeout) {
          clearTimeout(startupTimeout)
          startupTimeout = null
        }
        sendReadyEvent()
      }
    })
    
    // Set a timeout for MySQL startup (30 seconds)
    startupTimeout = setTimeout(() => {
      if (!isStartupComplete) {
        console.log(`[MySQL] ${id} startup timeout - assuming ready`)
        isStartupComplete = true
        sendReadyEvent()
      }
    }, 30000)
  } else {
    // For other databases (MongoDB, Redis), mark as running immediately
    try {
      const databases = storage.loadDatabases(app)
      const dbIndex = databases.findIndex(db => db.id === id)
      if (dbIndex >= 0) {
        databases[dbIndex].status = 'running'
        databases[dbIndex].pid = child.pid
        storage.saveDatabases(app, databases)
        console.log(`[Database] ${id} status updated to running in storage (non-PostgreSQL)`)
      }
    } catch (error) {
      console.error(`[Database] ${id} failed to update status to running in storage:`, error)
    }
  }
  
  child.on("error", (err) => {
    console.error(`[Database] ${id} error:`, err)
    runningDatabases.delete(id)
    if (startupTimeout) {
      clearTimeout(startupTimeout)
      startupTimeout = null
    }
    
    // Update database in storage to clear PID and update status
    try {
      const databases = storage.loadDatabases(app)
      const dbIndex = databases.findIndex(db => db.id === id)
      if (dbIndex >= 0) {
        databases[dbIndex].status = 'stopped'
        databases[dbIndex].pid = null
        storage.saveDatabases(app, databases)
        console.log(`[Database] ${id} status updated to stopped in storage`)
      }
    } catch (error) {
      console.error(`[Database] ${id} failed to update storage:`, error)
    }
    
    // Notify the renderer process that the database has stopped
    if (mainWindow && !stoppedEventSent) {
      stoppedEventSent = true
      mainWindow.webContents.send('database-status-changed', { id, status: 'stopped', error: err.message, pid: null })
    }
  })

  child.on("exit", (code) => {
    console.log(`[Database] ${id} exited with code ${code}`)
    runningDatabases.delete(id)
    if (startupTimeout) {
      clearTimeout(startupTimeout)
      startupTimeout = null
    }
    
    // Update database in storage to clear PID and update status
    try {
      const databases = storage.loadDatabases(app)
      const dbIndex = databases.findIndex(db => db.id === id)
      if (dbIndex >= 0) {
        databases[dbIndex].status = 'stopped'
        databases[dbIndex].pid = null
        storage.saveDatabases(app, databases)
        console.log(`[Database] ${id} status updated to stopped in storage`)
      }
    } catch (error) {
      console.error(`[Database] ${id} failed to update storage:`, error)
    }
    
    // Notify the renderer process that the database has stopped
    if (mainWindow && !stoppedEventSent) {
      stoppedEventSent = true
      mainWindow.webContents.send('database-status-changed', { id, status: 'stopped', exitCode: code, pid: null })
    }
  })

  // Add to running map immediately - we'll let the process events handle cleanup
  runningDatabases.set(id, { process: child, config, isStartupComplete: () => isStartupComplete })
  console.log(`[Database] ${type} database process started (PID: ${child.pid})`)
  
  // Save PID and starting status to storage
  try {
    const databases = storage.loadDatabases(app)
    const dbIndex = databases.findIndex(db => db.id === id)
    if (dbIndex >= 0) {
      databases[dbIndex].status = 'starting'
      databases[dbIndex].pid = child.pid
      databases[dbIndex].lastStarted = Date.now() // Set start timestamp
      storage.saveDatabases(app, databases)
      console.log(`[Database] ${id} PID ${child.pid}, starting status, and start time saved to storage`)
    }
  } catch (error) {
    console.error(`[Database] ${id} failed to save PID to storage:`, error)
  }
  
  // Notify the renderer process that the database is starting
  if (mainWindow) {
    mainWindow.webContents.send('database-status-changed', { 
      id, 
      status: 'starting', 
      pid: child.pid 
    })
    console.log(`[Database] ${id} starting status sent to frontend`)
  }
  
  // Return success result for auto-start functionality
  return { success: true }
  
  } catch (error) {
    console.error(`[Database] ${id} failed to start:`, error)
    return { success: false, error: error.message }
  }
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

// Auto-launch IPC handlers
ipcMain.handle("auto-launch:isEnabled", async () => {
  try {
    if (!autoLauncher) {
      console.warn("[Auto-launch] Auto-launcher not available")
      return false
    }
    return await autoLauncher.isEnabled()
  } catch (error) {
    console.error("[Auto-launch] Error checking if enabled:", error)
    return false
  }
})

ipcMain.handle("auto-launch:enable", async () => {
  try {
    if (!autoLauncher) {
      console.warn("[Auto-launch] Auto-launcher not available")
      return { success: false, error: "Auto-launch module not available" }
    }
    
    // First check if auto-launch is already enabled
    const isCurrentlyEnabled = await autoLauncher.isEnabled()
    if (isCurrentlyEnabled) {
      console.log("[Auto-launch] Auto-launch is already enabled")
      return { success: true }
    }
    
    console.log("[Auto-launch] Attempting to enable auto-launch...")
    await autoLauncher.enable()
    console.log("[Auto-launch] Successfully enabled startup launch")
    
    // Verify it was enabled
    const isEnabled = await autoLauncher.isEnabled()
    console.log("[Auto-launch] Verification - isEnabled:", isEnabled)
    
    return { success: true }
  } catch (error) {
    console.error("[Auto-launch] Error enabling:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("auto-launch:disable", async () => {
  try {
    if (!autoLauncher) {
      console.warn("[Auto-launch] Auto-launcher not available")
      return { success: false, error: "Auto-launch module not available" }
    }
    
    // First check if auto-launch is actually enabled
    const isCurrentlyEnabled = await autoLauncher.isEnabled()
    if (!isCurrentlyEnabled) {
      console.log("[Auto-launch] Auto-launch is already disabled")
      return { success: true }
    }
    
    console.log("[Auto-launch] Attempting to disable auto-launch...")
    await autoLauncher.disable()
    console.log("[Auto-launch] Successfully disabled startup launch")
    
    // Verify it was disabled
    const isEnabled = await autoLauncher.isEnabled()
    console.log("[Auto-launch] Verification - isEnabled:", isEnabled)
    
    return { success: true }
  } catch (error) {
    console.error("[Auto-launch] Error disabling:", error)
    
    // Handle specific case where login item doesn't exist
    if (error.message && error.message.includes("Can't get login item")) {
      console.log("[Auto-launch] Login item doesn't exist, considering as already disabled")
      return { success: true }
    }
    
    return { success: false, error: error.message }
  }
})

// External link handler
ipcMain.handle("open-external-link", async (event, url) => {
  try {
    await shell.openExternal(url)
    return { success: true }
  } catch (error) {
    console.error("[External Link] Error opening URL:", error)
    return { success: false, error: error.message }
  }
})

app.whenReady().then(async () => {
  log.info("App is ready, initializing...")
  log.debug("Auto-launcher available:", !!autoLauncher)
  
  // Initialize permissions manager
  permissionsManager = new PermissionsManager()
  
  resetDatabaseStatuses()
  createWindow()
  
  // Check if onboarding is complete before starting background processes
  let onboardingCheckCount = 0
  const maxOnboardingChecks = 30 // Maximum 30 checks (30 seconds)
  
  const checkOnboardingAndStartProcesses = async () => {
    try {
      onboardingCheckCount++
      
      // @ts-ignore - This will be available in the renderer process
      const isOnboardingComplete = await mainWindow?.webContents?.executeJavaScript('window.electron?.isOnboardingComplete ? window.electron.isOnboardingComplete() : false')
      
      if (isOnboardingComplete) {
        log.info("Onboarding complete, starting background processes...")
        
        // Start helper service after onboarding is complete
        helperService = new HelperServiceManager(app)
        try {
          const isRunning = await helperService.isServiceRunning()
          if (!isRunning) {
            console.log("[Helper] Starting helper service after onboarding completion...")
            await helperService.start()
            console.log("[Helper] Helper service started successfully")
          } else {
            console.log("[Helper] Helper service already running")
          }
        } catch (error) {
          console.log("[Helper] Error starting helper service after onboarding:", error.message)
        }
        
        // Auto-start databases after a short delay to ensure mainWindow is ready
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log("[Auto-start] MainWindow is ready, starting auto-start process")
            autoStartDatabases()
          } else {
            console.warn("[Auto-start] MainWindow not ready, delaying auto-start")
            // Retry after another 2 seconds
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                console.log("[Auto-start] MainWindow ready on retry, starting auto-start process")
                autoStartDatabases()
              } else {
                console.error("[Auto-start] MainWindow still not ready, skipping auto-start")
              }
            }, 2000)
          }
        }, 2000)
      } else if (onboardingCheckCount < maxOnboardingChecks) {
        // Only log every 5th check to reduce spam
        if (onboardingCheckCount % 5 === 0) {
          log.info(`Onboarding in progress, deferring background processes... (${onboardingCheckCount}/${maxOnboardingChecks})`)
        }
        // Check again in 2 seconds (reduced frequency)
        setTimeout(checkOnboardingAndStartProcesses, 2000)
      } else {
        log.warn("Onboarding check timeout reached, starting background processes anyway...")
        // Note: Helper service will be started by user interaction, not automatically
        
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            autoStartDatabases()
          }
        }, 2000)
      }
    } catch (error) {
      log.error("Error checking onboarding status:", error.message)
      // If we can't check, assume onboarding is complete and start processes
      if (onboardingCheckCount < maxOnboardingChecks) {
        setTimeout(checkOnboardingAndStartProcesses, 2000)
      } else {
        log.info("Starting background processes after error timeout...")
        // Note: Helper service will be started by user interaction, not automatically
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            autoStartDatabases()
          }
        }, 2000)
      }
    }
  }
  
  // Start checking after a short delay to ensure the window is ready
  setTimeout(checkOnboardingAndStartProcesses, 2000)
})
ipcMain.handle("app:quit", async () => {
  try {
    app.quit()
    return { success: true }
  } catch (e) {
    return { success: false, error: e?.message || "quit failed" }
  }
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
app.on("before-quit", async () => {
  log.info("Stopping all databases...")
  for (const [id, db] of runningDatabases) {
    try {
      log.debug(`Stopping database ${id}`)
      db.process.kill("SIGTERM")
    } catch (error) {
      console.error(`[App Quit] Error stopping database ${id}:`, error)
    }
  }
  runningDatabases.clear()
  
  // Start helper service when main app closes
  if (helperService) {
    try {
      console.log("[App Quit] Starting helper service for background monitoring...")
      await helperService.start()
    } catch (error) {
      console.error("[App Quit] Error starting helper service:", error)
    }
  }
  
  // Clear all PIDs from storage when app quits
  try {
    const databases = storage.loadDatabases(app)
    let updated = false
    for (const db of databases) {
      if (db.pid !== null) {
        db.status = 'stopped'
        db.pid = null
        updated = true
      }
    }
    if (updated) {
      storage.saveDatabases(app, databases)
      console.log("[App Quit] Cleared all PIDs from storage")
    }
  } catch (error) {
    console.error("[App Quit] Failed to clear PIDs from storage:", error)
  }
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
  
  // Clear all PIDs from storage
  try {
    const databases = storage.loadDatabases(app)
    let updated = false
    for (const db of databases) {
      if (db.pid !== null) {
        db.status = 'stopped'
        db.pid = null
        updated = true
      }
    }
    if (updated) {
      storage.saveDatabases(app, databases)
      console.log("[App Quit] Cleared all PIDs from storage (SIGINT)")
    }
  } catch (error) {
    console.error("[App Quit] Failed to clear PIDs from storage (SIGINT):", error)
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
  
  // Clear all PIDs from storage
  try {
    const databases = storage.loadDatabases(app)
    let updated = false
    for (const db of databases) {
      if (db.pid !== null) {
        db.status = 'stopped'
        db.pid = null
        updated = true
      }
    }
    if (updated) {
      storage.saveDatabases(app, databases)
      console.log("[App Quit] Cleared all PIDs from storage (SIGTERM)")
    }
  } catch (error) {
    console.error("[App Quit] Failed to clear PIDs from storage (SIGTERM):", error)
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

// Check if a port is in use by external processes
async function checkPortInUse(port) {
  return new Promise((resolve) => {
    // First, check using lsof for a more reliable detection (especially for listening sockets)
    const { exec } = require('child_process')
    exec(`lsof -i :${port} -sTCP:LISTEN -n -P`, (lsofError, lsofStdout) => {
      if (!lsofError && lsofStdout.trim()) {
        // Port is definitely in use according to lsof
        resolve(true)
        return
      }
      
      // Fallback to net.createServer check for ports that might be in use but not listening yet
      const server = net.createServer()
      
      // Set a timeout to prevent hanging
      const timeout = setTimeout(() => {
        server.close(() => {})
        resolve(true) // If we can't determine, assume port is in use to be safe
      }, 1000)
      
      server.listen(port, '127.0.0.1', () => {
        // Port is available
        clearTimeout(timeout)
        server.close(() => {
          resolve(false)
        })
      })
      
      server.on('error', (err) => {
        clearTimeout(timeout)
        if (err.code === 'EADDRINUSE') {
          // Port is in use
          resolve(true)
        } else {
          // Other error, assume port is available
          resolve(false)
        }
      })
    })
  })
}

// Get process information for a port
async function getProcessUsingPort(port) {
  return new Promise((resolve) => {
    // Use more specific lsof command to only get listening processes
    exec(`lsof -i :${port} -sTCP:LISTEN -n -P`, (error, stdout, stderr) => {
      if (error || !stdout.trim()) {
        resolve(null)
        return
      }
      
      const lines = stdout.trim().split('\n')
      if (lines.length > 1) {
        // Skip header line, get first process
        const processLine = lines[1]
        const parts = processLine.split(/\s+/)
        if (parts.length >= 2) {
          const processName = parts[0]
          const pid = parts[1]
          
          // Filter out common false positives
          const falsePositives = [
            'node', 'npm', 'yarn', 'pnpm', 'next', 'webpack', 'vite', 'dev',
            'chrome', 'safari', 'firefox', 'electron', 'code', 'cursor',
            'system', 'kernel', 'launchd', 'WindowServer', 'Finder'
          ]
          
          const lowerProcessName = processName.toLowerCase()
          const isFalsePositive = falsePositives.some(fp => lowerProcessName.includes(fp.toLowerCase()))
          
          if (isFalsePositive) {
            resolve(null)
            return
          }
          
          resolve({ processName, pid })
        }
      }
      resolve(null)
    })
  })
}

// Simple and reliable database status check
async function checkDatabaseStatus(id) {
  try {
    log.debug(`Checking database ${id}`)

    // 1. Check if we have this database in our running map
    const db = runningDatabases.get(id)
    if (!db) {
      log.debug(`Database ${id} not in running map`)
      return { status: "stopped" }
    }

    // 2. Check if the process is still alive
    if (db.process.killed || db.process.exitCode !== null) {
      log.warn(`Database ${id} process has died`)
      runningDatabases.delete(id)
      return { status: "stopped" }
    }

    // 3. For PostgreSQL, check if startup is complete
    if (db.config.type === "postgresql" && db.isStartupComplete && !db.isStartupComplete()) {
      log.debug(`Database ${id} is starting (PostgreSQL not ready yet)`)
      return { status: "starting", pid: db.process.pid }
    }

    // 4. Simple process check - if it exists and isn't killed, it's running
    log.debug(`Database ${id} is running (PID: ${db.process.pid})`)
    return { status: "running", pid: db.process.pid }
  } catch (error) {
    log.error(`Error checking ${id}: ${error.message}`)
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
    
    // Update database in storage to clear PID and update status
    try {
      const databases = storage.loadDatabases(app)
      const dbIndex = databases.findIndex(db => db.id === id)
      if (dbIndex >= 0) {
        databases[dbIndex].status = 'stopped'
        databases[dbIndex].pid = null
        storage.saveDatabases(app, databases)
        console.log(`[Database] ${id} status updated to stopped in storage (manual stop)`)
      }
    } catch (error) {
      console.error(`[Database] ${id} failed to update storage (manual stop):`, error)
    }
    
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

// Store previous CPU times for calculating CPU usage
const previousCpuTimes = new Map()

// Get system information for a database process
ipcMain.handle("get-database-system-info", async (event, id) => {
  try {
    log.debug(`Getting system info for database ${id}`)
    const db = runningDatabases.get(id)
    if (!db) {
      log.warn(`Database ${id} not found in running databases`)
      return { 
        success: false, 
        error: "Database not running",
        pid: null,
        memory: null,
        cpu: null
      }
    }
    
    const pid = db.process.pid
    log.debug(`Database ${id} found with PID ${pid}`)
    
    // Get memory usage and CPU time using ps command (optimized)
    let memoryUsage = null
    let cpuUsage = 0
    try {
      const { execSync } = require('child_process')
      
      // Use only ps command for better performance (skip heavy top command)
      const psOutput = execSync(`ps -o pid,rss,vsz,pcpu,pmem,time,command -p ${pid}`, { encoding: 'utf8', timeout: 2000 })
      log.verbose(`PS output for PID ${pid}:`, psOutput)
      const lines = psOutput.trim().split('\n')
      if (lines.length > 1) {
        const data = lines[1].trim().split(/\s+/)
        log.verbose(`Parsed PS data:`, data)
        if (data.length >= 6) {
          cpuUsage = parseFloat(data[3]) || 0
          
          memoryUsage = {
            rss: parseInt(data[1]) * 1024, // Convert KB to bytes
            vsz: parseInt(data[2]) * 1024, // Convert KB to bytes
            cpu: cpuUsage,
            pmem: parseFloat(data[4]) || 0,
            time: data[5] || "00:00:00"
          }
          log.debug(`Memory usage with CPU:`, memoryUsage)
        }
      }
    } catch (psError) {
      log.warn(`Could not get process info for PID ${pid}:`, psError.message)
    }
    
    // Get system memory info (simplified for performance)
    let systemMemory = null
    try {
      const { execSync } = require('child_process')
      const vmStatOutput = execSync('vm_stat', { encoding: 'utf8', timeout: 1000 })
      const lines = vmStatOutput.split('\n')
      const memoryInfo = {}
      
      lines.forEach(line => {
        const match = line.match(/(\w+):\s+(\d+)/)
        if (match) {
          memoryInfo[match[1]] = parseInt(match[2]) * 4096 // Convert pages to bytes
        }
      })
      
      if (memoryInfo.free !== undefined && memoryInfo.active !== undefined) {
        systemMemory = {
          free: memoryInfo.free,
          active: memoryInfo.active,
          inactive: memoryInfo.inactive || 0,
          wired: memoryInfo.wired || 0,
          total: (memoryInfo.free + memoryInfo.active + (memoryInfo.inactive || 0) + (memoryInfo.wired || 0))
        }
      }
    } catch (vmStatError) {
      log.debug(`Could not get system memory info:`, vmStatError.message)
    }
    
    // Get database connections - real database sessions
    let connections = 0
    try {
      const { execSync } = require('child_process')
      
      if (db.config.type === "postgresql") {
        // For PostgreSQL, get actual database sessions
        try {
          // Connect to the database and count active sessions
          const psqlCommand = `psql -h localhost -p ${db.config.port} -U ${db.config.username} -d postgres -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';" 2>/dev/null || echo "0"`
          const sessionCount = execSync(psqlCommand, { encoding: 'utf8' }).trim()
          connections = parseInt(sessionCount) || 0
          log.debug(`PostgreSQL active sessions on port ${db.config.port}: ${connections}`)
        } catch (psqlError) {
          log.debug(`Could not get PostgreSQL sessions, falling back to network connections:`, psqlError.message)
          // Fallback to network connection count
          const lsofOutput = execSync(`lsof -i :${db.config.port} | wc -l`, { encoding: 'utf8' })
          connections = Math.max(0, parseInt(lsofOutput.trim()) - 1)
        }
      } else if (db.config.type === "mysql") {
        // For MySQL, get actual database sessions
        try {
          const mysqlCommand = `mysql -h localhost -P ${db.config.port} -u ${db.config.username} -p${db.config.password} -e "SHOW PROCESSLIST;" 2>/dev/null | wc -l || echo "0"`
          const sessionCount = execSync(mysqlCommand, { encoding: 'utf8' }).trim()
          connections = Math.max(0, parseInt(sessionCount) - 1) // Subtract header line
          log.debug(`MySQL active sessions on port ${db.config.port}: ${connections}`)
        } catch (mysqlError) {
          log.debug(`Could not get MySQL sessions, falling back to network connections:`, mysqlError.message)
          // Fallback to network connection count
          const lsofOutput = execSync(`lsof -i :${db.config.port} | wc -l`, { encoding: 'utf8' })
          connections = Math.max(0, parseInt(lsofOutput.trim()) - 1)
        }
      } else if (db.config.type === "mongodb") {
        // For MongoDB, get actual database sessions
        try {
          const mongoCommand = `mongosh --host localhost:${db.config.port} --eval "db.serverStatus().connections.current" --quiet 2>/dev/null || echo "0"`
          const sessionCount = execSync(mongoCommand, { encoding: 'utf8' }).trim()
          connections = parseInt(sessionCount) || 0
          log.debug(`MongoDB active sessions on port ${db.config.port}: ${connections}`)
        } catch (mongoError) {
          log.debug(`Could not get MongoDB sessions, falling back to network connections:`, mongoError.message)
          // Fallback to network connection count
          const lsofOutput = execSync(`lsof -i :${db.config.port} | wc -l`, { encoding: 'utf8' })
          connections = Math.max(0, parseInt(lsofOutput.trim()) - 1)
        }
      } else if (db.config.type === "redis") {
        // For Redis, get actual database sessions
        try {
          const redisCommand = `redis-cli -h localhost -p ${db.config.port} CLIENT LIST | wc -l 2>/dev/null || echo "0"`
          const sessionCount = execSync(redisCommand, { encoding: 'utf8' }).trim()
          connections = parseInt(sessionCount) || 0
          log.debug(`Redis active sessions on port ${db.config.port}: ${connections}`)
        } catch (redisError) {
          log.debug(`Could not get Redis sessions, falling back to network connections:`, redisError.message)
          // Fallback to network connection count
          const lsofOutput = execSync(`lsof -i :${db.config.port} | wc -l`, { encoding: 'utf8' })
          connections = Math.max(0, parseInt(lsofOutput.trim()) - 1)
        }
      }
    } catch (connectionError) {
      log.warn(`Could not get connection count for ${db.config.type}:`, connectionError.message)
      // Set a default value if we can't get connections
      connections = 1 // At least 1 connection (the database itself)
    }
    
    // Calculate uptime based on lastStarted timestamp
    let uptimeSeconds = 0
    try {
      const databases = storage.loadDatabases(app)
      const dbData = databases.find(d => d.id === id)
      if (dbData && dbData.lastStarted) {
        uptimeSeconds = Math.floor((Date.now() - dbData.lastStarted) / 1000)
        log.debug(`Database ${id} uptime: ${uptimeSeconds} seconds (started at ${new Date(dbData.lastStarted).toISOString()})`)
      }
    } catch (uptimeError) {
      log.warn(`Could not get uptime for database ${id}:`, uptimeError.message)
    }
    
    return {
      success: true,
      pid: pid,
      memory: memoryUsage,
      systemMemory: systemMemory,
      connections: connections,
      uptime: uptimeSeconds,
      isRunning: !db.process.killed && db.process.exitCode === null,
      killed: db.process.killed,
      exitCode: db.process.exitCode
    }
  } catch (error) {
    log.error(`Error getting system info for database ${id}:`, error)
    return { 
      success: false, 
      error: error.message,
      pid: null,
      memory: null,
      cpu: null
    }
  }
})

// Store previous CPU times for system-wide CPU calculation
let previousSystemCpuUsage = null
let previousSystemCpuCheckTime = null

// Get system-wide statistics (RAM, CPU usage)
ipcMain.handle("get-system-stats", async () => {
  try {
    const os = require('os')
    const { execSync } = require('child_process')
    
    // Get accurate memory stats using vm_stat (macOS) - more accurate than os.freemem()
    let totalMemory = 0
    let freeMemory = 0
    let usedMemory = 0
    
    try {
      // Get total physical memory from sysctl
      const sysctlOutput = execSync('sysctl hw.memsize', { encoding: 'utf8', timeout: 1000 })
      const memMatch = sysctlOutput.match(/hw\.memsize:\s+(\d+)/)
      if (memMatch) {
        totalMemory = parseInt(memMatch[1])
      } else {
        // Fallback to os module
        totalMemory = os.totalmem()
      }
      
      // Get memory breakdown from vm_stat
      const vmStatOutput = execSync('vm_stat', { encoding: 'utf8', timeout: 1000 })
      const lines = vmStatOutput.split('\n')
      const memoryInfo = {}
      
      lines.forEach(line => {
        const match = line.match(/(\w+):\s+(\d+)/)
        if (match) {
          memoryInfo[match[1]] = parseInt(match[2]) * 4096 // Convert pages to bytes
        }
      })
      
      if (memoryInfo.free !== undefined && memoryInfo.active !== undefined) {
        // On macOS, memory calculation:
        // Free = pages_free * 4096
        // Used = active + wired + inactive (memory in use)
        // Note: inactive can be reclaimed but is still "used" for our purposes
        freeMemory = memoryInfo.free || 0
        const activeMemory = memoryInfo.active || 0
        const wiredMemory = memoryInfo.wired || 0
        const inactiveMemory = memoryInfo.inactive || 0
        
        // Used memory = total - free (most accurate representation)
        usedMemory = totalMemory - freeMemory
        
        // If calculation seems off, use active + wired (what's actually active)
        // But prefer total - free as it matches Activity Monitor
        if (usedMemory < 0 || usedMemory > totalMemory) {
          usedMemory = activeMemory + wiredMemory
          freeMemory = totalMemory - usedMemory
        }
      } else {
        // Fallback to os module if vm_stat fails
        totalMemory = os.totalmem()
        freeMemory = os.freemem()
        usedMemory = totalMemory - freeMemory
      }
    } catch (error) {
      // Fallback to os module
      log.debug(`Could not get memory stats from vm_stat:`, error.message)
      totalMemory = os.totalmem()
      freeMemory = os.freemem()
      usedMemory = totalMemory - freeMemory
    }
    
    // Get disk usage for the home directory using df command
    let diskUsed = 0
    let diskTotal = 0
    let diskFree = 0
    try {
      // Use df command to get disk usage for home directory
      const homeDir = os.homedir()
      const dfOutput = execSync(`df -k "${homeDir}"`, { encoding: 'utf8', timeout: 1000 })
      const lines = dfOutput.split('\n')
      if (lines.length > 1) {
        // Parse the output - format: Filesystem 1024-blocks Used Available Capacity Mounted
        const parts = lines[1].trim().split(/\s+/)
        if (parts.length >= 4) {
          diskTotal = parseInt(parts[1]) * 1024 // Convert KB to bytes
          diskUsed = parseInt(parts[2]) * 1024 // Convert KB to bytes
          diskFree = parseInt(parts[3]) * 1024 // Convert KB to bytes
        }
      }
    } catch (diskError) {
      log.debug(`Could not get disk usage:`, diskError.message)
    }
    
    // Get CPU usage efficiently using os.loadavg and process.cpuUsage
    let cpuUsage = 0
    let loadAverage = [0, 0, 0]
    try {
      // Get load average
      loadAverage = os.loadavg()
      
      // Use top command with -l 1 (single sample) and -n 0 (no processes) for efficiency
      const topOutput = execSync('top -l 1 -n 0 | grep "CPU usage"', { encoding: 'utf8', timeout: 1000 })
      
      // macOS top output format: "CPU usage: 5.23% user, 2.45% sys, 92.32% idle"
      // We calculate used CPU as: 100 - idle
      const idleMatch = topOutput.match(/(\d+\.\d+)%\s+idle/)
      if (idleMatch) {
        const idlePercent = parseFloat(idleMatch[1])
        cpuUsage = Math.max(0, Math.min(100, 100 - idlePercent))
      } else {
        // Fallback: try to match user + sys
        const userMatch = topOutput.match(/(\d+\.\d+)%\s+user/)
        const sysMatch = topOutput.match(/(\d+\.\d+)%\s+sys/)
        if (userMatch && sysMatch) {
          cpuUsage = parseFloat(userMatch[1]) + parseFloat(sysMatch[1])
        }
      }
      
      // Store for next call
      previousSystemCpuUsage = cpuUsage
      previousSystemCpuCheckTime = Date.now()
    } catch (error) {
      log.debug(`Could not get CPU usage:`, error.message)
      // Use cached value if available
      cpuUsage = previousSystemCpuUsage || 0
      // Load average is still available from os.loadavg()
      loadAverage = os.loadavg()
    }
    
    // Get system uptime
    const uptimeSeconds = Math.floor(os.uptime())
    
    // Get number of running databases
    let runningDatabasesCount = 0
    runningDatabases.forEach((db) => {
      if (!db.process.killed && db.process.exitCode === null) {
        runningDatabasesCount++
      }
    })
    
    return {
      success: true,
      memory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        percentage: totalMemory > 0 ? (usedMemory / totalMemory) * 100 : 0
      },
      cpu: {
        usage: cpuUsage,
        percentage: cpuUsage
      },
      disk: diskTotal > 0 ? {
        total: diskTotal,
        free: diskFree,
        used: diskUsed,
        percentage: diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0
      } : null,
      uptime: uptimeSeconds,
      loadAverage: loadAverage,
      runningDatabases: runningDatabasesCount
    }
  } catch (error) {
    log.error(`Error getting system stats:`, error)
    return {
      success: false,
      error: error.message,
      memory: null,
      cpu: null,
      disk: null
    }
  }
})

// Clean up dead processes and reset statuses
ipcMain.handle("cleanup-dead-processes", async () => {
  try {
    console.log("[Cleanup] Starting cleanup of dead processes")
    let cleanedCount = 0
    
    // Check all running databases
    for (const [id, db] of runningDatabases) {
      if (db.process.killed || db.process.exitCode !== null) {
        console.log(`[Cleanup] Removing dead process ${id} (PID: ${db.process.pid})`)
        runningDatabases.delete(id)
        cleanedCount++
      }
    }
    
    // Update storage to reflect actual status
    const databases = storage.loadDatabases(app)
    let updatedCount = 0
    
    for (let i = 0; i < databases.length; i++) {
      const db = databases[i]
      if (db.status === "running" || db.status === "starting") {
        // Check if process is actually running
        const isInRunningMap = runningDatabases.has(db.id)
        if (!isInRunningMap) {
          console.log(`[Cleanup] Updating database ${db.id} status from ${db.status} to stopped`)
          databases[i].status = "stopped"
          databases[i].pid = null
          updatedCount++
        }
      }
    }
    
    if (updatedCount > 0) {
      storage.saveDatabases(app, databases)
      console.log(`[Cleanup] Updated ${updatedCount} database statuses in storage`)
    }
    
    console.log(`[Cleanup] Cleanup complete: removed ${cleanedCount} dead processes, updated ${updatedCount} statuses`)
    return { success: true, cleanedProcesses: cleanedCount, updatedStatuses: updatedCount }
  } catch (error) {
    console.error("[Cleanup] Error during cleanup:", error)
    return { success: false, error: error.message }
  }
})

// Check for port conflicts
ipcMain.handle("check-port-conflict", async (event, port) => {
  try {
    const isInUse = await checkPortInUse(port)
    if (isInUse) {
      const processInfo = await getProcessUsingPort(port)
      return {
        success: true,
        inUse: true,
        processInfo: processInfo || { processName: 'Unknown', pid: 'Unknown' }
      }
    }
    return {
      success: true,
      inUse: false,
      processInfo: null
    }
  } catch (error) {
    console.error(`[Port Check] Error checking port ${port}:`, error)
    return {
      success: false,
      error: error.message,
      inUse: false,
      processInfo: null
    }
  }
})

// Function to fetch stable version information from official sources
async function getStableVersionsFromOfficialSources(databaseType) {
  try {
    console.log(`[Stable Versions] Fetching stable versions for ${databaseType}`)
    
    const stableVersions = {
      postgresql: [],
      mysql: [],
      mongodb: [],
      redis: []
    }
    
    // Fetch PostgreSQL stable versions
    if (databaseType === 'postgresql') {
      try {
        const response = await fetch('https://www.postgresql.org/support/versioning/')
        const html = await response.text()
        // Parse HTML to extract supported versions (this is a simplified approach)
        // In a real implementation, you'd want to use a proper HTML parser
        const versionMatches = html.match(/PostgreSQL (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.postgresql = versionMatches
            .map(match => match.replace('PostgreSQL ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 15 // Only include versions 15+ as stable
            })
        }
      } catch (error) {
        console.log(`[Stable Versions] Error fetching PostgreSQL versions:`, error.message)
        // Fallback to known stable versions
        stableVersions.postgresql = ['16', '15']
      }
    }
    
    // Fetch MySQL stable versions
    if (databaseType === 'mysql') {
      try {
        const response = await fetch('https://dev.mysql.com/doc/relnotes/mysql/8.4/en/')
        const html = await response.text()
        // Check if 8.4 is available and stable
        if (html.includes('8.4')) {
          stableVersions.mysql = ['8.4', '8.0']
        } else {
          stableVersions.mysql = ['8.0']
        }
      } catch (error) {
        console.log(`[Stable Versions] Error fetching MySQL versions:`, error.message)
        stableVersions.mysql = ['8.4', '8.0']
      }
    }
    
    // Fetch MongoDB stable versions
    if (databaseType === 'mongodb') {
      try {
        const response = await fetch('https://www.mongodb.com/docs/manual/release-notes/')
        const html = await response.text()
        // Extract version numbers from release notes
        const versionMatches = html.match(/MongoDB (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.mongodb = versionMatches
            .map(match => match.replace('MongoDB ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 8 // Only include versions 8+ as stable
            })
            .slice(0, 2) // Take only the latest 2 stable versions
        }
      } catch (error) {
        console.log(`[Stable Versions] Error fetching MongoDB versions:`, error.message)
        stableVersions.mongodb = ['8.2', '8.0']
      }
    }
    
    // Fetch Redis stable versions
    if (databaseType === 'redis') {
      try {
        const response = await fetch('https://redis.io/docs/about/releases/')
        const html = await response.text()
        // Extract version numbers from releases page
        const versionMatches = html.match(/Redis (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.redis = versionMatches
            .map(match => match.replace('Redis ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 7 // Only include versions 7+ as stable
            })
            .slice(0, 2) // Take only the latest 2 stable versions
        }
      } catch (error) {
        console.log(`[Stable Versions] Error fetching Redis versions:`, error.message)
        stableVersions.redis = ['7.2', '7.0']
      }
    }
    
    console.log(`[Stable Versions] Found stable versions for ${databaseType}:`, stableVersions[databaseType])
    return stableVersions[databaseType] || []
    
  } catch (error) {
    console.log(`[Stable Versions] Error fetching stable versions for ${databaseType}:`, error.message)
    // Return fallback stable versions
    const fallbackStable = {
      postgresql: ['16', '15'],
      mysql: ['8.4', '8.0'],
      mongodb: ['8.2', '8.0'],
      redis: ['7.2', '7.0']
    }
    return fallbackStable[databaseType] || []
  }
}

ipcMain.handle("get-stable-versions", async (event, databaseType) => {
  return await getStableVersionsFromOfficialSources(databaseType)
})

ipcMain.handle("get-brew-versions", async (event, packageName) => {
  try {
    console.log(`[Brew] Fetching detailed versions for ${packageName}`)
    
    // Special handling for MongoDB - check the MongoDB tap for available versions
    if (packageName === "mongodb-community") {
      return await getMongoDBVersions()
    }
    
    // Get detailed version information with full version numbers
    const result = await new Promise((resolve) => {
      const versionDetails = []
      let completedCalls = 0
      const totalCalls = 2
      
      const checkComplete = () => {
        completedCalls++
        if (completedCalls === totalCalls) {
          // Sort versions (newest first)
          const sortedVersions = versionDetails.sort((a, b) => {
            return compareVersions(b.fullVersion, a.fullVersion)
          })
          
          console.log(`[Brew] Found ${sortedVersions.length} detailed versions for ${packageName}:`, sortedVersions)
          resolve(sortedVersions.length > 0 ? sortedVersions : getFallbackVersionDetails(packageName))
        }
      }
      
      // Get versioned packages with full version info
      exec(`brew search --formula "^${packageName}@"`, (error, stdout, stderr) => {
        if (!error && stdout) {
          try {
            const lines = stdout.trim().split('\n').filter(line => line.trim())
            const packagePromises = []
            
            for (const line of lines) {
              const match = line.match(new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(.+)$`))
              if (match) {
                const majorVersion = match[1]
                const fullPackageName = `${packageName}@${majorVersion}`
                
                // Get full version details for each package
                packagePromises.push(
                  new Promise((resolve) => {
                    exec(`brew info ${fullPackageName} --json`, (infoError, infoStdout) => {
                      if (!infoError && infoStdout) {
                        try {
                          const info = JSON.parse(infoStdout)
                          if (info && info.length > 0) {
                            const fullVersion = info[0].versions?.stable || info[0].version
                            if (fullVersion) {
                              resolve({
                                majorVersion,
                                fullVersion,
                                packageName: fullPackageName
                              })
                            } else {
                              resolve(null)
                            }
                          } else {
                            resolve(null)
                          }
                        } catch (parseError) {
                          console.log(`[Brew] Error parsing version info for ${fullPackageName}:`, parseError.message)
                          resolve(null)
                        }
                      } else {
                        resolve(null)
                      }
                    })
                  })
                )
              }
            }
            
            // Wait for all package info to be fetched
            Promise.all(packagePromises).then((results) => {
              results.forEach(result => {
                if (result) {
                  versionDetails.push(result)
                }
              })
              checkComplete()
            })
          } catch (parseError) {
            console.log(`[Brew] Error parsing search results:`, parseError.message)
            checkComplete()
          }
        } else {
          checkComplete()
        }
      })
      
      // Get main package version
      exec(`brew info ${packageName} --json`, (infoError, infoStdout) => {
        if (!infoError && infoStdout) {
          try {
            const info = JSON.parse(infoStdout)
            if (info && info.length > 0) {
              const fullVersion = info[0].versions?.stable || info[0].version
              if (fullVersion) {
                // Extract major version from full version
                const majorVersion = fullVersion.split('.').slice(0, 2).join('.')
                const existingVersion = versionDetails.find(v => v.majorVersion === majorVersion)
                if (!existingVersion) {
                  versionDetails.push({
                    majorVersion,
                    fullVersion,
                    packageName: packageName
                  })
                }
              }
            }
          } catch (parseError) {
            console.log(`[Brew] Error parsing main package version:`, parseError.message)
          }
        }
        checkComplete()
      })
    })
    
    return result
  } catch (error) {
    console.log(`[Brew] Failed to fetch versions for ${packageName}:`, error.message)
    return getFallbackVersionDetails(packageName)
  }
})

// Special function to get MongoDB versions (optimized)
async function getMongoDBVersions() {
  try {
    console.log(`[Brew] Fetching detailed MongoDB versions`)
    
    // Fast MongoDB version fetching with full version details
    const versions = await new Promise((resolve) => {
      // Use a single command to get MongoDB versions quickly
      exec(`brew search mongodb/brew/mongodb-community`, (error, stdout, stderr) => {
        if (error) {
          console.log(`[Brew] Error searching MongoDB versions:`, error.message)
          resolve(getFallbackVersionDetails("mongodb-community"))
          return
        }
        
        try {
          const lines = stdout.trim().split('\n').filter(line => line.trim())
          const mongoPackages = []
          
          // Extract versioned package names from mongodb-community@x.x.x format
          for (const line of lines) {
            const match = line.match(/mongodb-community@([0-9.]+)/)
            if (match) {
              mongoPackages.push(`mongodb/brew/mongodb-community@${match[1]}`)
            }
          }
          
          // Get full version details for each MongoDB package
          const getMongoVersionDetails = async (packages) => {
            const versionDetails = []
            
            for (const pkg of packages) {
              try {
                const versionInfo = await new Promise((resolve) => {
                  exec(`brew info ${pkg} --json`, (infoError, infoStdout) => {
                    if (!infoError && infoStdout) {
                      try {
                        const info = JSON.parse(infoStdout)
                        if (info && info.length > 0) {
                          const fullVersion = info[0].versions?.stable || info[0].version
                          if (fullVersion) {
                            const majorVersion = pkg.match(/mongodb-community@([0-9.]+)/)[1]
                            resolve({
                              majorVersion,
                              fullVersion,
                              packageName: pkg
                            })
                          } else {
                            resolve(null)
                          }
                        } else {
                          resolve(null)
                        }
                      } catch (parseError) {
                        console.log(`[Brew] Error parsing MongoDB version info for ${pkg}:`, parseError.message)
                        resolve(null)
                      }
                    } else {
                      resolve(null)
                    }
                  })
                })
                
                if (versionInfo) {
                  versionDetails.push(versionInfo)
                }
              } catch (err) {
                console.log(`[Brew] Error getting MongoDB version for ${pkg}:`, err.message)
              }
            }
            
            return versionDetails
          }
          
          // Get full version details for all MongoDB packages
          getMongoVersionDetails(mongoPackages).then((versionDetails) => {
            // Sort versions (newest first)
            const sortedVersions = versionDetails.sort((a, b) => {
              return compareVersions(b.fullVersion, a.fullVersion)
            })
            
            console.log(`[Brew] Found ${sortedVersions.length} detailed MongoDB versions:`, sortedVersions)
            resolve(sortedVersions.length > 0 ? sortedVersions : getFallbackVersionDetails("mongodb-community"))
          })
        } catch (parseError) {
          console.log(`[Brew] Error parsing MongoDB versions:`, parseError.message)
          resolve(getFallbackVersionDetails("mongodb-community"))
        }
      })
    })
    
    return versions
  } catch (error) {
    console.log(`[Brew] Failed to fetch MongoDB versions:`, error.message)
    return getFallbackVersionDetails("mongodb-community")
  }
}

// Helper function to compare semantic versions
function compareVersions(a, b) {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0
    const bPart = bParts[i] || 0
    if (aPart !== bPart) {
      return aPart - bPart
    }
  }
  return 0
}

// Helper function to get fallback versions
function getFallbackVersions(packageName) {
  const fallbackVersions = {
    postgresql: ["16.1", "15.5", "14.10", "13.13", "12.17"],
    mysql: ["8.0.35", "5.7.44", "5.6.51"],
    "mongodb-community": ["8.2.1", "8.0.4", "7.0.14", "6.0.20", "5.0.30"],
    redis: ["7.2.4", "7.0.15", "6.2.14"],
  }
  return fallbackVersions[packageName] || ["latest"]
}

// Helper function to get fallback version details with full version info
function getFallbackVersionDetails(packageName) {
  const fallbackDetails = {
    postgresql: [
      { majorVersion: "16", fullVersion: "16.1", packageName: "postgresql@16" },
      { majorVersion: "15", fullVersion: "15.5", packageName: "postgresql@15" },
      { majorVersion: "14", fullVersion: "14.10", packageName: "postgresql@14" },
      { majorVersion: "13", fullVersion: "13.13", packageName: "postgresql@13" },
      { majorVersion: "12", fullVersion: "12.17", packageName: "postgresql@12" }
    ],
    mysql: [
      { majorVersion: "8.0", fullVersion: "8.0.35", packageName: "mysql@8.0" },
      { majorVersion: "5.7", fullVersion: "5.7.44", packageName: "mysql@5.7" },
      { majorVersion: "5.6", fullVersion: "5.6.51", packageName: "mysql@5.6" }
    ],
    "mongodb-community": [
      { majorVersion: "8.2", fullVersion: "8.2.1", packageName: "mongodb-community@8.2" },
      { majorVersion: "8.0", fullVersion: "8.0.4", packageName: "mongodb-community@8.0" },
      { majorVersion: "7.0", fullVersion: "7.0.14", packageName: "mongodb-community@7.0" },
      { majorVersion: "6.0", fullVersion: "6.0.20", packageName: "mongodb-community@6.0" },
      { majorVersion: "5.0", fullVersion: "5.0.30", packageName: "mongodb-community@5.0" }
    ],
    redis: [
      { majorVersion: "7.2", fullVersion: "7.2.4", packageName: "redis@7.2" },
      { majorVersion: "7.0", fullVersion: "7.0.15", packageName: "redis@7.0" },
      { majorVersion: "6.2", fullVersion: "6.2.14", packageName: "redis@6.2" }
    ]
  }
  return fallbackDetails[packageName] || [{ majorVersion: "latest", fullVersion: "latest", packageName: packageName }]
}

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
    return { success: true, data: uniqueSorted }
  } catch (e) {
    console.error("[Banned Ports] Error setting banned ports:", e)
    return { success: false, error: e.message || "Failed to set banned ports" }
  }
})

ipcMain.handle("get-databases", async () => {
  const list = storage.loadDatabases(app)
  return list
})

ipcMain.handle("db:save", async (event, db) => {
  try {
    // Validate name length
    if (db.name && db.name.length > 15) {
      return { 
        success: false, 
        error: `Database name must be 15 characters or less. Current length: ${db.name.length}` 
      }
    }

    // Load existing databases to check for duplicates
    const existingDatabases = storage.loadDatabases(app)
    
    // Check for duplicate name
    const nameExists = existingDatabases.some(existingDb => 
      existingDb.name === db.name && existingDb.id !== db.id
    )
    if (nameExists) {
      return { 
        success: false, 
        error: `Database name "${db.name}" already exists. Please choose a different name.` 
      }
    }
    
    // Check for duplicate container ID
    const containerIdExists = existingDatabases.some(existingDb => 
      existingDb.containerId === db.containerId && existingDb.id !== db.id
    )
    if (containerIdExists) {
      return { 
        success: false, 
        error: `Container ID "${db.containerId}" already exists. Please try again.` 
      }
    }
    
    if (db?.password && keytar) {
      try {
        await keytar.setPassword("LiquiDB", db.id, db.password)
        db.password = "__SECURE__"
      } catch {}
    }
    const saved = storage.upsertDatabase(app, db)
    return saved
  } catch (error) {
    console.error("[Database Save] Error saving database:", error)
    return { success: false, error: error.message }
  }
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
    const databases = storage.loadDatabases(app)
    const databaseRecord = databases.find(d => d.id === id)
    if (databaseRecord) {
      const dataDir = storage.getDatabaseDataDir(app, databaseRecord.containerId)
      if (fs.existsSync(dataDir)) {
        try {
          console.log(`[Delete] Removing database files for ${id}: ${dataDir}`)
          fs.rmSync(dataDir, { recursive: true, force: true })
        } catch (error) {
          console.error(`[Delete] Error removing database files for ${id}:`, error)
        }
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
        const dataDir = storage.getDatabaseDataDir(app, db.containerId)
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

// Helper service management
ipcMain.handle("helper:status", async (event) => {
  try {
    if (!helperService) {
      console.log("[Helper Status] Initializing helper service...")
      helperService = new HelperServiceManager(app)
    }
    const status = await helperService.getStatus()
    return { success: true, data: status }
  } catch (error) {
    console.error("[Helper Status] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("helper:start", async (event) => {
  try {
    if (!helperService) {
      helperService = new HelperServiceManager(app)
    }
    const success = await helperService.start()
    return { success, error: success ? null : "Failed to start helper service" }
  } catch (error) {
    console.error("[Helper Start] Error:", error)
    return { success: false, error: error.message }
  }
})


ipcMain.handle("helper:restart", async (event) => {
  try {
    if (!helperService) {
      helperService = new HelperServiceManager(app)
    }
    const success = await helperService.restart()
    return { success, error: success ? null : "Failed to restart helper service" }
  } catch (error) {
    console.error("[Helper Restart] Error:", error)
    return { success: false, error: error.message }
  }
})

// Start helper service on demand (for onboarding step 4 or app settings)
ipcMain.handle("helper:start-on-demand", async (event) => {
  try {
    if (!helperService) {
      helperService = new HelperServiceManager(app)
    }
    const success = await helperService.start()
    return { success, error: success ? null : "Failed to start helper service" }
  } catch (error) {
    console.error("[Helper Start On Demand] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("helper:install", async (event) => {
  try {
    if (!helperService) {
      helperService = new HelperServiceManager(app)
    }
    const success = await helperService.install()
    return { success, error: success ? null : "Failed to install helper service" }
  } catch (error) {
    console.error("[Helper Install] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("helper:cleanup", async (event) => {
  try {
    if (!helperService) {
      console.log("[Helper Cleanup] Initializing helper service...")
      helperService = new HelperServiceManager(app)
    }
    const result = await helperService.requestCleanup()
    return result
  } catch (error) {
    console.error("[Helper Cleanup] Error:", error)
    return { success: false, error: error.message }
  }
})


ipcMain.handle("helper:health", async (event) => {
  try {
    if (!helperService) {
      console.log("[Helper Health] Initializing helper service...")
      helperService = new HelperServiceManager(app)
    }
    const isHealthy = await helperService.isHealthy()
    return { success: true, data: { isHealthy } }
  } catch (error) {
    console.error("[Helper Health] Error:", error)
    return { success: false, error: error.message }
  }
})

// Permissions management
ipcMain.handle("permissions:check", async (event) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const result = await permissionsManager.checkAllPermissions()
    return { success: true, data: result }
  } catch (error) {
    console.error("[Permissions Check] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:getDescriptions", async (event) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const descriptions = permissionsManager.getPermissionDescriptions()
    return { success: true, data: descriptions }
  } catch (error) {
    console.error("[Permissions Descriptions] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:openSettings", async (event) => {
  try {
    // Open System Preferences to Privacy & Security
    await exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy"')
    return { success: true }
  } catch (error) {
    console.error("[Permissions Open Settings] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:openPermissionPage", async (event, permissionType) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const result = await permissionsManager.openPermissionPage(permissionType)
    return { success: result }
  } catch (error) {
    console.error("[Permissions Open Permission Page] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:requestCritical", async (event) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const result = await permissionsManager.requestCriticalPermissions()
    return { success: true, data: result }
  } catch (error) {
    console.error("[Permissions Request Critical] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:request", async (event, permissionName) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const granted = await permissionsManager.requestPermission(permissionName)
    return { success: true, data: { granted } }
  } catch (error) {
    console.error("[Permissions Request] Error:", error)
    return { success: false, error: error.message }
  }
})

// Secure storage methods using Electron's safeStorage API
ipcMain.handle("permissions:encryptString", async (event, text) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const encrypted = permissionsManager.encryptString(text)
    return { success: true, data: { encrypted } }
  } catch (error) {
    console.error("[Permissions Encrypt String] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:decryptString", async (event, encryptedBuffer) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const decrypted = permissionsManager.decryptString(encryptedBuffer)
    return { success: true, data: { decrypted } }
  } catch (error) {
    console.error("[Permissions Decrypt String] Error:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("permissions:isEncryptionAvailable", async (event) => {
  try {
    if (!permissionsManager) {
      return { success: false, error: "Permissions manager not initialized" }
    }
    const available = permissionsManager.isEncryptionAvailable()
    return { success: true, data: { available } }
  } catch (error) {
    console.error("[Permissions Is Encryption Available] Error:", error)
    return { success: false, error: error.message }
  }
})

// Image saving functionality
function getImagesDirectory() {
  const dataDir = app.getPath("userData")
  const imagesDir = path.join(dataDir, "images")
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
  return imagesDir
}

function generateImageFileName(originalUrl, dataUrl) {
  const timestamp = Date.now()
  let extension = "png" // default
  
  if (originalUrl) {
    // Try to get extension from URL
    const urlMatch = originalUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)
    if (urlMatch) {
      extension = urlMatch[1].toLowerCase()
    }
  } else if (dataUrl) {
    // Try to get extension from data URL
    const dataUrlMatch = dataUrl.match(/data:image\/([^;]+)/)
    if (dataUrlMatch) {
      extension = dataUrlMatch[1].toLowerCase()
    }
  }
  
  return `custom-icon-${timestamp}.${extension}`
}

function downloadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https:") ? https : http
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`))
        return
      }
      
      const chunks = []
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("end", () => {
        const buffer = Buffer.concat(chunks)
        resolve(buffer)
      })
    }).on("error", (error) => {
      reject(error)
    })
  })
}

function saveDataUrlToFile(dataUrl, filePath) {
  return new Promise((resolve, reject) => {
    try {
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "")
      const buffer = Buffer.from(base64Data, "base64")
      fs.writeFile(filePath, buffer, (error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    } catch (error) {
      reject(error)
    }
  })
}

// IPC handler to save custom image
ipcMain.handle("save-custom-image", async (event, { imageUrl, dataUrl }) => {
  try {
    console.log("[Image Save] Saving custom image...")
    
    const imagesDir = getImagesDirectory()
    const fileName = generateImageFileName(imageUrl, dataUrl)
    const filePath = path.join(imagesDir, fileName)
    
    if (imageUrl) {
      // Download image from URL
      console.log(`[Image Save] Downloading image from URL: ${imageUrl}`)
      const imageBuffer = await downloadImageFromUrl(imageUrl)
      fs.writeFileSync(filePath, imageBuffer)
    } else if (dataUrl) {
      // Save data URL to file
      console.log(`[Image Save] Saving data URL to file: ${fileName}`)
      await saveDataUrlToFile(dataUrl, filePath)
    } else {
      throw new Error("No image URL or data URL provided")
    }
    
    // Return the relative path that can be used in the app
    const relativePath = `file://${filePath}`
    console.log(`[Image Save] Image saved successfully: ${relativePath}`)
    return { success: true, imagePath: relativePath, fileName }
    
  } catch (error) {
    console.error("[Image Save] Error saving custom image:", error)
    return { success: false, error: error.message }
  }
})

// IPC handler to get saved images
ipcMain.handle("get-saved-images", async () => {
  try {
    const imagesDir = getImagesDirectory()
    const files = fs.readdirSync(imagesDir)
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file)
    )
    
    const images = imageFiles.map(file => ({
      fileName: file,
      path: `file://${path.join(imagesDir, file)}`,
      created: fs.statSync(path.join(imagesDir, file)).birthtime
    }))
    
    // Sort by creation date (newest first)
    images.sort((a, b) => b.created - a.created)
    
    console.log(`[Image Get] Found ${images.length} saved images`)
    return { success: true, images }
    
  } catch (error) {
    console.error("[Image Get] Error getting saved images:", error)
    return { success: false, error: error.message, images: [] }
  }
})

// IPC handler to save avatar image
ipcMain.handle("save-avatar", async (event, dataUrl) => {
  try {
    console.log("[Avatar Save] Saving avatar image...")

    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      throw new Error("Invalid avatar data URL")
    }

    const imagesDir = getImagesDirectory()
    const timestamp = Date.now()
    const extension = dataUrl.match(/data:image\/([^;]+)/)?.[1] || 'png'
    const fileName = `avatar_${timestamp}.${extension}`
    const filePath = path.join(imagesDir, fileName)

    // Save data URL to file
    await saveDataUrlToFile(dataUrl, filePath)

    console.log(`[Avatar Save] Avatar saved successfully: ${filePath}`)
    return { success: true, imagePath: `file://${filePath}`, fileName }

  } catch (error) {
    console.error("[Avatar Save] Error saving avatar:", error)
    return { success: false, error: error.message }
  }
})

// IPC handler to convert file URL to data URL
ipcMain.handle("convert-file-to-data-url", async (event, fileUrl) => {
  try {
    console.log(`[Image Convert] Converting file URL to data URL: ${fileUrl}`)
    
    // Remove file:// prefix and decode URL
    const filePath = decodeURIComponent(fileUrl.replace('file://', ''))
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    
    // Read file as buffer
    const fileBuffer = fs.readFileSync(filePath)
    
    // Get file extension to determine MIME type
    const ext = path.extname(filePath).toLowerCase()
    let mimeType = 'image/png' // default
    
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        mimeType = 'image/jpeg'
        break
      case '.png':
        mimeType = 'image/png'
        break
      case '.gif':
        mimeType = 'image/gif'
        break
      case '.webp':
        mimeType = 'image/webp'
        break
      case '.svg':
        mimeType = 'image/svg+xml'
        break
    }
    
    // Convert buffer to base64
    const base64Data = fileBuffer.toString('base64')
    const dataUrl = `data:${mimeType};base64,${base64Data}`
    
    console.log(`[Image Convert] Successfully converted to data URL (${base64Data.length} chars)`)
    return { success: true, dataUrl }
    
  } catch (error) {
    console.error("[Image Convert] Error converting file to data URL:", error)
    return { success: false, error: error.message }
  }
})

// IPC handler to check if databases.json exists
ipcMain.handle("check-databases-file", async () => {
  try {
    const exists = storage.checkDatabasesFileExists(app)
    console.log(`[Storage Check] databases.json exists: ${exists}`)
    return { success: true, exists }
  } catch (error) {
    console.error("[Storage Check] Error checking databases file:", error)
    return { success: false, error: error.message, exists: false }
  }
})

// IPC handler to recreate databases.json if missing
ipcMain.handle("recreate-databases-file", async () => {
  try {
    const recreated = storage.recreateDatabasesFile(app)
    console.log(`[Storage Recreate] databases.json recreated: ${recreated}`)
    return { success: true, recreated }
  } catch (error) {
    console.error("[Storage Recreate] Error recreating databases file:", error)
    return { success: false, error: error.message, recreated: false }
  }
})
