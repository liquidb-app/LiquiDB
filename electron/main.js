const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require("electron")
const archiver = require("archiver")

// Import logging system
const { log } = require('./logger')

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
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
// const os = require("os")
const { exec } = require("child_process")
const brew = require("./brew")
const storage = require("./storage")
const HelperServiceManager = require("./helper-service")
const PermissionsManager = require("./permissions")
const https = require("https")
const http = require("http")
const AutoLaunch = require("auto-launch")
// Keychain functionality removed - passwords are stored directly in database config

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
        } catch (_logError) {
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

// Configure PostgreSQL with custom username, password, and database name
async function configurePostgreSQL(config) {
  const { id, type, port, username, password, containerId: _containerId, name } = config
  
  if (type !== "postgresql") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[PostgreSQL Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    let actualPassword = password || ''
    
    const psqlPath = `${dbRecord.homebrewPath}/psql`
    const { execSync } = require("child_process")
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew"
    }
    
    // Wait for PostgreSQL to be fully ready and accepting connections
    // Retry connection attempts with exponential backoff
    let postgresReady = false
    const maxRetries = 10
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to connect to PostgreSQL to check if it's ready
        execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "SELECT 1;"`, {
          env: { ...env, PGPASSWORD: '' },
          stdio: 'pipe',
          timeout: 2000
        })
        postgresReady = true
        break
      } catch (pingError) {
        if (attempt < maxRetries - 1) {
          // Wait with exponential backoff: 500ms, 1s, 2s, etc.
          const waitTime = Math.min(500 * Math.pow(2, attempt), 5000)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    if (!postgresReady) {
      console.log(`[PostgreSQL Config] ${id} PostgreSQL not ready after ${maxRetries} attempts, skipping configuration`)
      console.log(`[PostgreSQL Config] ${id} Note: Configuration will be retried on next database restart`)
      return
    }
    
    // Sanitize database name (PostgreSQL database names must be valid identifiers)
    const dbName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63) || 'liquidb_db'
    
    const actualUsername = username || dbRecord.username || 'postgres'
    console.log(`[PostgreSQL Config] ${id} Configuring with username: ${actualUsername}, database: ${dbName}`)
    
    // Connect as postgres superuser to configure the database
    try {
      // Create database if it doesn't exist
      const createDbCmd = `CREATE DATABASE "${dbName}";`
      execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "${createDbCmd}"`, {
        env: { ...env, PGPASSWORD: '' },
        stdio: 'pipe'
      })
      console.log(`[PostgreSQL Config] ${id} Created database: ${dbName}`)
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log(`[PostgreSQL Config] ${id} Database ${dbName} already exists`)
      } else {
        console.log(`[PostgreSQL Config] ${id} Could not create database: ${e.message}`)
      }
    }
    
    // If custom username is provided (not 'postgres'), we need to handle the default postgres user
    // PostgreSQL initdb always creates a 'postgres' user, so we need to either:
    // 1. Rename postgres to the custom username (if postgres exists and custom username doesn't)
    // 2. Or drop postgres after creating/renaming to custom username
    let postgresRenamed = false
    let connectAsUser = 'postgres' // Default to postgres for admin operations
    
    if (actualUsername && actualUsername !== 'postgres' && actualUsername.trim() !== '') {
      try {
        // Check if postgres user exists
        const checkPostgresCmd = `SELECT 1 FROM pg_user WHERE usename = 'postgres';`
        let postgresExists = false
        try {
          const result = execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -t -c "${checkPostgresCmd}"`, {
            env: { ...env, PGPASSWORD: '' },
            stdio: 'pipe',
            encoding: 'utf8'
          }).trim()
          postgresExists = !!result
        } catch (_e) {
          // postgres doesn't exist or can't connect
          postgresExists = false
        }
        
        // Check if custom username already exists (maybe it was renamed earlier)
        let customUserExists = false
        if (postgresExists) {
          try {
            const checkCustomUserCmd = `SELECT 1 FROM pg_user WHERE usename = '${actualUsername}';`
            const result = execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -t -c "${checkCustomUserCmd}"`, {
              env: { ...env, PGPASSWORD: '' },
              stdio: 'pipe',
              encoding: 'utf8'
            }).trim()
            customUserExists = !!result
          } catch (_e) {
            customUserExists = false
          }
        } else {
          // If postgres doesn't exist, try connecting as custom username to check if it exists
          try {
            const checkCustomUserCmd = `SELECT 1 FROM pg_user WHERE usename = '${actualUsername}';`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -t -c "${checkCustomUserCmd}"`, {
              env: { ...env, PGPASSWORD: actualPassword || '' },
              stdio: 'pipe',
              encoding: 'utf8'
            })
            customUserExists = true
            connectAsUser = actualUsername
          } catch (_e) {
            customUserExists = false
          }
        }
        
        if (postgresExists && !customUserExists) {
          // Rename postgres user to custom username
          console.log(`[PostgreSQL Config] ${id} Renaming default postgres user to ${actualUsername}`)
          try {
            const renamePostgresCmd = `ALTER USER postgres RENAME TO "${actualUsername}";`
            execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "${renamePostgresCmd}"`, {
              env: { ...env, PGPASSWORD: '' },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Renamed postgres user to ${actualUsername}`)
            postgresRenamed = true
            connectAsUser = actualUsername
          } catch (renameError) {
            console.log(`[PostgreSQL Config] ${id} Could not rename postgres user: ${renameError.message}`)
            // If rename fails, we'll create the user and drop postgres below
          }
        } else if (postgresExists && customUserExists) {
          // Both exist - drop postgres user
          console.log(`[PostgreSQL Config] ${id} Both postgres and ${actualUsername} exist - dropping postgres user`)
          try {
            // Revoke privileges from postgres
            const revokePostgresCmd = `REVOKE ALL PRIVILEGES ON DATABASE "${dbName}" FROM postgres;`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -c "${revokePostgresCmd}"`, {
              env: { ...env, PGPASSWORD: actualPassword || '' },
              stdio: 'pipe'
            })
            // Drop postgres user
            const dropPostgresCmd = `DROP USER IF EXISTS postgres;`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -c "${dropPostgresCmd}"`, {
              env: { ...env, PGPASSWORD: actualPassword || '' },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Dropped postgres user`)
            connectAsUser = actualUsername
          } catch (_dropError) {
            // If that fails, try as postgres
            try {
              const revokePostgresCmd = `REVOKE ALL PRIVILEGES ON DATABASE "${dbName}" FROM postgres;`
              execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "${revokePostgresCmd}"`, {
                env: { ...env, PGPASSWORD: '' },
                stdio: 'pipe'
              })
              const dropPostgresCmd = `DROP USER IF EXISTS postgres;`
              execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "${dropPostgresCmd}"`, {
                env: { ...env, PGPASSWORD: '' },
                stdio: 'pipe'
              })
              console.log(`[PostgreSQL Config] ${id} Dropped postgres user`)
            } catch (dropError2) {
              console.log(`[PostgreSQL Config] ${id} Could not drop postgres user: ${dropError2.message}`)
            }
          }
        } else if (!postgresExists && customUserExists) {
          // Only custom user exists - use it for connections
          connectAsUser = actualUsername
        }
      } catch (postgresCheckError) {
        console.log(`[PostgreSQL Config] ${id} Could not check/remove postgres user: ${postgresCheckError.message}`)
      }
    }
    
    // Only create/update user if custom username is provided and not 'postgres'
    if (actualUsername && actualUsername !== 'postgres' && actualUsername.trim() !== '') {
      try {
        // If we renamed postgres to custom username, we know the user exists, just set the password
        if (postgresRenamed) {
          if (actualPassword && actualPassword.trim() !== '') {
            const escapedPassword = actualPassword.replace(/'/g, "''")
            const alterUserCmd = `ALTER USER "${actualUsername}" WITH PASSWORD '${escapedPassword}';`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -c "${alterUserCmd}"`, {
              env: { ...env, PGPASSWORD: '' },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Set password for renamed user: ${actualUsername}`)
          }
        } else {
          // Check if user exists (connect as postgres or custom username depending on what's available)
          const checkUserCmd = `SELECT 1 FROM pg_user WHERE usename = '${actualUsername}';`
          let userExists = false
          try {
            const result = execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d postgres -t -c "${checkUserCmd}"`, {
              env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : (actualPassword || '') },
              stdio: 'pipe',
              encoding: 'utf8'
            }).trim()
            userExists = !!result
          } catch (_e) {
            userExists = false
          }
          
          if (userExists) {
            // User exists, update password if provided
            if (actualPassword && actualPassword.trim() !== '') {
              const escapedPassword = actualPassword.replace(/'/g, "''")
              const alterUserCmd = `ALTER USER "${actualUsername}" WITH PASSWORD '${escapedPassword}';`
              execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d postgres -c "${alterUserCmd}"`, {
                env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : (actualPassword || '') },
                stdio: 'pipe'
              })
              console.log(`[PostgreSQL Config] ${id} Updated password for user: ${actualUsername}`)
            }
          } else {
            // Create new user
            const passwordPart = actualPassword && actualPassword.trim() !== '' 
              ? `WITH PASSWORD '${actualPassword.replace(/'/g, "''")}'` 
              : ''
            const createUserCmd = `CREATE USER "${actualUsername}" ${passwordPart};`
            execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d postgres -c "${createUserCmd}"`, {
              env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : (actualPassword || '') },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Created user: ${actualUsername}`)
          }
        }
        
        // Grant privileges on the database to the user
        try {
          const grantCmd = `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${actualUsername}";`
          execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d postgres -c "${grantCmd}"`, {
            env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : (actualPassword || '') },
            stdio: 'pipe'
          })
          console.log(`[PostgreSQL Config] ${id} Granted privileges on ${dbName} to ${actualUsername}`)
        } catch (grantError) {
          console.log(`[PostgreSQL Config] ${id} Could not grant privileges: ${grantError.message}`)
        }
        
        // Also grant schema privileges (PostgreSQL 15+ requires explicit schema grants)
        try {
          const grantSchemaCmd = `GRANT ALL ON SCHEMA public TO "${actualUsername}";`
          execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d "${dbName}" -c "${grantSchemaCmd}"`, {
            env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : (actualPassword || '') },
            stdio: 'pipe'
          })
          console.log(`[PostgreSQL Config] ${id} Granted schema privileges to ${actualUsername}`)
        } catch (schemaError) {
          // Schema grant might fail - log but don't fail
          console.log(`[PostgreSQL Config] ${id} Could not grant schema privileges: ${schemaError.message}`)
        }
      } catch (userError) {
        console.log(`[PostgreSQL Config] ${id} Could not configure user: ${userError.message}`)
      }
    } else if (actualUsername === 'postgres' && actualPassword && actualPassword.trim() !== '') {
      // Update postgres user password if provided
      try {
        const escapedPassword = actualPassword.replace(/'/g, "''")
        const alterUserCmd = `ALTER USER postgres WITH PASSWORD '${escapedPassword}';`
        execSync(`${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "${alterUserCmd}"`, {
          env: { ...env, PGPASSWORD: '' },
          stdio: 'pipe'
        })
        console.log(`[PostgreSQL Config] ${id} Updated postgres user password`)
      } catch (passError) {
        console.log(`[PostgreSQL Config] ${id} Could not update postgres password: ${passError.message}`)
      }
    }
    
    console.log(`[PostgreSQL Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[PostgreSQL Config] ${id} Configuration error:`, error.message)
  }
}

// Configure MySQL with custom username, password, and database name
async function configureMySQL(config) {
  const { id, type, port: _port, username, password, containerId: _containerId, name, oldUsername } = config
  
  if (type !== "mysql") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[MySQL Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Get containerId from config or dbRecord
    const containerId = config.containerId || dbRecord.containerId || id
    
    // Use password directly from config
    let actualPassword = password || ''
    
    const mysqlPath = `${dbRecord.homebrewPath}/mysql`
    const { execSync } = require("child_process")
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew"
    }
    
    // Wait a moment for MySQL to be fully ready
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Sanitize database name (MySQL database names)
    const dbName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 64) || 'liquidb_db'
    const actualUsername = username || dbRecord.username || 'root'
    
    console.log(`[MySQL Config] ${id} Configuring with username: ${actualUsername}, database: ${dbName}`)
    
    // Connect using socket (more reliable than TCP for initial setup)
    const socketPath = `/tmp/mysql-${containerId}.sock`
    
    try {
      // Create database if it doesn't exist
      const createDbCmd = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      execSync(`${mysqlPath} --socket=${socketPath} -e "${createDbCmd}"`, {
        env,
        stdio: 'pipe'
      })
      console.log(`[MySQL Config] ${id} Created database: ${dbName}`)
    } catch (e) {
      console.log(`[MySQL Config] ${id} Could not create database: ${e.message}`)
    }
    
    // Handle username rename if username changed
    if (oldUsername && oldUsername !== actualUsername && oldUsername !== 'root' && oldUsername.trim() !== '' && actualUsername && actualUsername !== 'root') {
      console.log(`[MySQL Config] ${id} Username changed - renaming user: ${oldUsername} to ${actualUsername}`)
      try {
        // Check if old user exists
        const checkOldUserCmd = `SELECT COUNT(*) FROM mysql.user WHERE user = '${oldUsername}' AND host = 'localhost';`
        let oldUserExists = false
        try {
          const oldUserCount = execSync(`${mysqlPath} --socket=${socketPath} -e "${checkOldUserCmd}"`, {
            env,
            stdio: 'pipe',
            encoding: 'utf8'
          }).trim()
          oldUserExists = parseInt(oldUserCount) > 0
        } catch {}
        
        if (oldUserExists) {
          // Check if new username already exists
          const checkNewUserCmd = `SELECT COUNT(*) FROM mysql.user WHERE user = '${actualUsername}' AND host = 'localhost';`
          let newUserExists = false
          try {
            const newUserCount = execSync(`${mysqlPath} --socket=${socketPath} -e "${checkNewUserCmd}"`, {
              env,
              stdio: 'pipe',
              encoding: 'utf8'
            }).trim()
            newUserExists = parseInt(newUserCount) > 0
          } catch {}
          
          if (!newUserExists) {
            // Rename the user in MySQL (RENAME USER)
            try {
              const renameUserCmd = `RENAME USER '${oldUsername}'@'localhost' TO '${actualUsername}'@'localhost'; FLUSH PRIVILEGES;`
              execSync(`${mysqlPath} --socket=${socketPath} -e "${renameUserCmd}"`, {
                env,
                stdio: 'pipe'
              })
              console.log(`[MySQL Config] ${id} Renamed user from ${oldUsername} to ${actualUsername}`)
            } catch (renameError) {
              console.log(`[MySQL Config] ${id} Could not rename user: ${renameError.message}`)
              // Fallback: drop old user if rename fails
              try {
                const dropUserCmd = `DROP USER IF EXISTS '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
                execSync(`${mysqlPath} --socket=${socketPath} -e "${dropUserCmd}"`, {
                  env,
                  stdio: 'pipe'
                })
                console.log(`[MySQL Config] ${id} Dropped old user: ${oldUsername} (rename failed)`)
              } catch (dropError) {
                console.log(`[MySQL Config] ${id} Could not drop old user: ${dropError.message}`)
              }
            }
          } else {
            // New username already exists - drop old user instead
            console.log(`[MySQL Config] ${id} New username ${actualUsername} already exists, dropping old user`)
            try {
              const revokeCmd = `REVOKE ALL PRIVILEGES ON \`${dbName}\`.* FROM '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
              execSync(`${mysqlPath} --socket=${socketPath} -e "${revokeCmd}"`, {
                env,
                stdio: 'pipe'
              })
            } catch (revokeError) {
              console.log(`[MySQL Config] ${id} Could not revoke privileges: ${revokeError.message}`)
            }
            
            try {
              const dropUserCmd = `DROP USER IF EXISTS '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
              execSync(`${mysqlPath} --socket=${socketPath} -e "${dropUserCmd}"`, {
                env,
                stdio: 'pipe'
              })
              console.log(`[MySQL Config] ${id} Dropped old user: ${oldUsername}`)
            } catch (dropError) {
              console.log(`[MySQL Config] ${id} Could not drop old user: ${dropError.message}`)
            }
          }
        }
      } catch (oldUserError) {
        console.log(`[MySQL Config] ${id} Could not handle old user: ${oldUserError.message}`)
      }
    }
    
    // Only create/update user if custom username is provided and not 'root'
    if (actualUsername && actualUsername !== 'root' && actualUsername.trim() !== '') {
      try {
        // Create user if it doesn't exist, or update password if it does
        const passwordPart = actualPassword && actualPassword.trim() !== '' 
          ? `IDENTIFIED BY '${actualPassword.replace(/'/g, "''")}'` 
          : 'IDENTIFIED BY ""'
        
        const createUserCmd = `CREATE USER IF NOT EXISTS '${actualUsername}'@'localhost' ${passwordPart};`
        execSync(`${mysqlPath} --socket=${socketPath} -e "${createUserCmd}"`, {
          env,
          stdio: 'pipe'
        })
        
        // Update password if user already exists
        if (actualPassword && actualPassword.trim() !== '') {
          const updatePasswordCmd = `ALTER USER '${actualUsername}'@'localhost' ${passwordPart};`
          try {
            execSync(`${mysqlPath} --socket=${socketPath} -e "${updatePasswordCmd}"`, {
              env,
              stdio: 'pipe'
            })
            console.log(`[MySQL Config] ${id} Updated password for user: ${actualUsername}`)
          } catch (_updateError) {
            // Try SET PASSWORD as fallback (for older MySQL versions)
            const setPasswordCmd = `SET PASSWORD FOR '${actualUsername}'@'localhost' = PASSWORD('${actualPassword.replace(/'/g, "''")}'); FLUSH PRIVILEGES;`
            try {
              execSync(`${mysqlPath} --socket=${socketPath} -e "${setPasswordCmd}"`, {
                env,
                stdio: 'pipe'
              })
              console.log(`[MySQL Config] ${id} Updated password for user: ${actualUsername} (using SET PASSWORD)`)
            } catch (setPassError) {
              console.log(`[MySQL Config] ${id} Could not update password: ${setPassError.message}`)
            }
          }
        }
        
        // Grant privileges on the database to the user
        try {
          const grantCmd = `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${actualUsername}'@'localhost'; FLUSH PRIVILEGES;`
          execSync(`${mysqlPath} --socket=${socketPath} -e "${grantCmd}"`, {
            env,
            stdio: 'pipe'
          })
          console.log(`[MySQL Config] ${id} Granted privileges on ${dbName} to ${actualUsername}`)
        } catch (grantError) {
          console.log(`[MySQL Config] ${id} Could not grant privileges: ${grantError.message}`)
        }
        
        console.log(`[MySQL Config] ${id} Created/updated user: ${actualUsername}`)
      } catch (userError) {
        console.log(`[MySQL Config] ${id} Could not configure user: ${userError.message}`)
      }
    } else if (actualUsername === 'root' && actualPassword && actualPassword.trim() !== '') {
      // Update root user password if provided
      try {
        const updateRootCmd = `ALTER USER 'root'@'localhost' IDENTIFIED BY '${actualPassword.replace(/'/g, "''")}'; FLUSH PRIVILEGES;`
        execSync(`${mysqlPath} --socket=${socketPath} -e "${updateRootCmd}"`, {
          env,
          stdio: 'pipe'
        })
        console.log(`[MySQL Config] ${id} Updated root user password`)
      } catch (_passError) {
        // Try SET PASSWORD as fallback (for older MySQL versions)
        try {
          const setPasswordCmd = `SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${actualPassword.replace(/'/g, "''")}'); FLUSH PRIVILEGES;`
          execSync(`${mysqlPath} --socket=${socketPath} -e "${setPasswordCmd}"`, {
            env,
            stdio: 'pipe'
          })
          console.log(`[MySQL Config] ${id} Updated root user password (using SET PASSWORD)`)
        } catch (setPassError) {
          console.log(`[MySQL Config] ${id} Could not update root password: ${setPassError.message}`)
        }
      }
    }
    
    console.log(`[MySQL Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[MySQL Config] ${id} Configuration error:`, error.message)
  }
}

// Configure MongoDB with custom username, password, and database name
async function configureMongoDB(config) {
  const { id, type, port: _port, username, password, containerId: _containerId, name, oldUsername } = config
  
  if (type !== "mongodb") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[MongoDB Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    let actualPassword = password || ''
    
    const mongoshPath = `${dbRecord.homebrewPath}/mongosh`
    // Fallback to mongosh if mongosh doesn't exist in same path
    let mongoshCmd = mongoshPath
    try {
      const fsSync = require("fs")
      if (!fsSync.existsSync(mongoshPath)) {
        // Try to find mongosh in PATH or alternative location
        const { execSync } = require("child_process")
        try {
          mongoshCmd = execSync("which mongosh", { encoding: "utf8" }).trim()
        } catch {
          // Try mongosh without path
          mongoshCmd = "mongosh"
        }
      }
    } catch {}
    
    const { execSync } = require("child_process")
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew"
    }
    
    // Wait a moment for MongoDB to be fully ready
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Sanitize database name (MongoDB database names)
    const dbName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_').substring(0, 63) || 'liquidb_db'
    const actualUsername = username || dbRecord.username || ''
    
    console.log(`[MongoDB Config] ${id} Configuring with username: ${actualUsername}, database: ${dbName}`)
    
    // Connect to MongoDB (by default, MongoDB doesn't require auth initially)
    try {
      // Switch to the target database
      // MongoDB databases are created automatically when first used
      
      // Handle username rename if username changed
      // Note: MongoDB doesn't support renaming users directly, so we drop and recreate
      if (oldUsername && oldUsername !== actualUsername && oldUsername.trim() !== '' && actualUsername && actualUsername.trim() !== '') {
        console.log(`[MongoDB Config] ${id} Username changed - removing old user: ${oldUsername}, new user: ${actualUsername}`)
        try {
          // Drop old user from target database
          try {
            const dropUserScript = `use('${dbName}'); db.dropUser('${oldUsername}')`
            execSync(`${mongoshCmd} --host localhost:${port} --eval "${dropUserScript}" --quiet`, {
              env,
              stdio: 'pipe',
              timeout: 10000
            })
            console.log(`[MongoDB Config] ${id} Dropped old user: ${oldUsername} from ${dbName}`)
          } catch (dropError) {
            // User might not exist, that's fine
            if (!dropError.message.includes('not found') && !dropError.message.includes('does not exist')) {
              console.log(`[MongoDB Config] ${id} Could not drop old user from ${dbName}: ${dropError.message}`)
            }
          }
          
          // Also try to drop old admin user
          try {
            const dropAdminUserScript = `use('admin'); db.dropUser('${oldUsername}')`
            execSync(`${mongoshCmd} --host localhost:${port} --eval "${dropAdminUserScript}" --quiet`, {
              env,
              stdio: 'pipe',
              timeout: 10000
            })
            console.log(`[MongoDB Config] ${id} Dropped old admin user: ${oldUsername}`)
          } catch (dropAdminError) {
            // Admin user might not exist, that's fine
            if (!dropAdminError.message.includes('not found') && !dropAdminError.message.includes('does not exist')) {
              console.log(`[MongoDB Config] ${id} Could not drop old admin user: ${dropAdminError.message}`)
            }
          }
        } catch (oldUserError) {
          console.log(`[MongoDB Config] ${id} Could not handle old user: ${oldUserError.message}`)
        }
      }
      
      // Only configure user if username is provided
      if (actualUsername && actualUsername.trim() !== '') {
        // Escape password for MongoDB
        const escapedPassword = actualPassword.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, "\\'")
        
        // Create user in the target database
        try {
          // First create user in the target database
          const createUserScript = `use('${dbName}'); db.createUser({ user: '${actualUsername}', pwd: '${escapedPassword}', roles: [{ role: 'readWrite', db: '${dbName}' }] })`
          execSync(`${mongoshCmd} --host localhost:${port} --eval "${createUserScript}" --quiet`, {
            env,
            stdio: 'pipe',
            timeout: 10000
          })
          console.log(`[MongoDB Config] ${id} Created user: ${actualUsername} in database: ${dbName}`)
        } catch (userError) {
          // User might already exist, try to update password
          if (userError.message.includes('already exists') || userError.message.includes('duplicate') || userError.message.includes('E11000')) {
            console.log(`[MongoDB Config] ${id} User ${actualUsername} already exists in ${dbName}, updating password`)
            try {
              const updatePasswordScript = `use('${dbName}'); db.changeUserPassword('${actualUsername}', '${escapedPassword}')`
              execSync(`${mongoshCmd} --host localhost:${port} --eval "${updatePasswordScript}" --quiet`, {
                env,
                stdio: 'pipe',
                timeout: 10000
              })
              console.log(`[MongoDB Config] ${id} Updated password for user: ${actualUsername} in ${dbName}`)
            } catch (updateError) {
              console.log(`[MongoDB Config] ${id} Could not update password in ${dbName}: ${updateError.message}`)
            }
          } else {
            console.log(`[MongoDB Config] ${id} Could not create user in ${dbName}: ${userError.message}`)
          }
        }
        
        // Also create admin user in admin database (for managing the instance)
        try {
          const adminUserScript = `use('admin'); db.createUser({ user: '${actualUsername}', pwd: '${escapedPassword}', roles: [{ role: 'userAdminAnyDatabase', db: 'admin' }, { role: 'readWriteAnyDatabase', db: 'admin' }] })`
          execSync(`${mongoshCmd} --host localhost:${port} --eval "${adminUserScript}" --quiet`, {
            env,
            stdio: 'pipe',
            timeout: 10000
          })
          console.log(`[MongoDB Config] ${id} Created admin user: ${actualUsername}`)
        } catch (adminError) {
          // Admin user might already exist, try to update password
          if (adminError.message.includes('already exists') || adminError.message.includes('duplicate') || adminError.message.includes('E11000')) {
            console.log(`[MongoDB Config] ${id} Admin user ${actualUsername} already exists, updating password`)
            try {
              const updateAdminPasswordScript = `use('admin'); db.changeUserPassword('${actualUsername}', '${escapedPassword}')`
              execSync(`${mongoshCmd} --host localhost:${port} --eval "${updateAdminPasswordScript}" --quiet`, {
                env,
                stdio: 'pipe',
                timeout: 10000
              })
              console.log(`[MongoDB Config] ${id} Updated password for admin user: ${actualUsername}`)
            } catch (updateAdminError) {
              console.log(`[MongoDB Config] ${id} Could not update admin password: ${updateAdminError.message}`)
            }
          } else {
            console.log(`[MongoDB Config] ${id} Could not create admin user: ${adminError.message}`)
          }
        }
      }
      
      // Create the database by inserting a dummy document (MongoDB creates DBs on first write)
      try {
        const createDbScript = `use('${dbName}'); db.dummy.insertOne({created: new Date()})`
        execSync(`${mongoshCmd} --host localhost:${port} --eval "${createDbScript}" --quiet`, {
          env,
          stdio: 'pipe',
          timeout: 10000
        })
        console.log(`[MongoDB Config] ${id} Ensured database exists: ${dbName}`)
      } catch (_dbError) {
        // Database creation is automatic in MongoDB, so errors here are usually fine
        console.log(`[MongoDB Config] ${id} Database ${dbName} will be created on first use`)
      }
    } catch (error) {
      console.log(`[MongoDB Config] ${id} Configuration error: ${error.message}`)
    }
    
    console.log(`[MongoDB Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[MongoDB Config] ${id} Configuration error:`, error.message)
  }
}

// Configure Redis with custom password
async function configureRedis(config) {
  const { id, type, port, username, password, containerId, name } = config
  
  if (type !== "redis") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[Redis Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    let actualPassword = password || ''
    
    const redisCliPath = `${dbRecord.homebrewPath}/redis-cli`
    // Fallback to redis-cli if it doesn't exist in same path
    let redisCliCmd = redisCliPath
    try {
      const fsSync = require("fs")
      if (!fsSync.existsSync(redisCliPath)) {
        // Try to find redis-cli in PATH or alternative location
        const { execSync } = require("child_process")
        try {
          redisCliCmd = execSync("which redis-cli", { encoding: "utf8" }).trim()
        } catch {
          // Try redis-cli without path
          redisCliCmd = "redis-cli"
        }
      }
    } catch {}
    
    const { execSync } = require("child_process")
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew"
    }
    
    // Wait for Redis to be fully ready and accepting connections
    // Retry connection attempts with exponential backoff
    let redisReady = false
    const maxRetries = 10
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Try to ping Redis to check if it's ready
        execSync(`${redisCliCmd} -h localhost -p ${port} PING`, {
          env,
          stdio: 'pipe',
          timeout: 2000
        })
        redisReady = true
        break
      } catch (pingError) {
        if (attempt < maxRetries - 1) {
          // Wait with exponential backoff: 500ms, 1s, 2s, etc.
          const waitTime = Math.min(500 * Math.pow(2, attempt), 5000)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }
    
    if (!redisReady) {
      console.log(`[Redis Config] ${id} Redis not ready after ${maxRetries} attempts, skipping configuration`)
      console.log(`[Redis Config] ${id} Note: Configuration will be retried on next database restart`)
      return
    }
    
    console.log(`[Redis Config] ${id} Configuring Redis authentication`)
    
    // Redis doesn't have users - it uses a single requirepass
    // Try to set password. If Redis already has a password, we might need it first
    // But for initial setup, Redis shouldn't have a password yet
    
    // First, try without password (for initial setup)
    let redisAuth = ''
    if (actualPassword && actualPassword.trim() !== '') {
      try {
        // Set password using CONFIG SET (temporary, until restart)
        // Try without auth first (initial setup)
        execSync(`${redisCliCmd} -h localhost -p ${port} CONFIG SET requirepass "${actualPassword.replace(/"/g, '\\"')}"`, {
          env,
          stdio: 'pipe',
          timeout: 5000
        })
        console.log(`[Redis Config] ${id} Set Redis password`)
        redisAuth = actualPassword // Now we need auth for subsequent commands
        
        // Save the configuration to make it persistent
        try {
          execSync(`${redisCliCmd} -h localhost -p ${port} ${redisAuth ? `-a "${redisAuth.replace(/"/g, '\\"')}"` : ''} CONFIG REWRITE`, {
            env,
            stdio: 'pipe',
            timeout: 5000
          })
          console.log(`[Redis Config] ${id} Saved Redis configuration`)
        } catch (saveError) {
          // Config REWRITE might fail if Redis wasn't started with config file
          console.log(`[Redis Config] ${id} Could not save config to file (this is normal if no config file exists)`)
        }
      } catch (passError) {
        // If that fails, Redis might already have a password set
        // In that case, password updates should be done via settings which will restart Redis
        console.log(`[Redis Config] ${id} Could not set password: ${passError.message}`)
        console.log(`[Redis Config] ${id} Note: If Redis already has a password, changes require restart`)
      }
    } else {
      // Remove password if it was set
      try {
        // Try to check if there's a password first
        let currentPassword = ''
        try {
          // Try to execute a command without auth
          execSync(`${redisCliCmd} -h localhost -p ${port} PING`, {
            env,
            stdio: 'pipe',
            timeout: 5000
          })
          // If this succeeds, no password is set
        } catch {
          // If this fails, password might be set
          // Password removal requires restart
          console.log(`[Redis Config] ${id} Password removal requires Redis restart`)
        }
        
        try {
          execSync(`${redisCliCmd} -h localhost -p ${port} CONFIG SET requirepass ""`, {
            env,
            stdio: 'pipe',
            timeout: 5000
          })
          console.log(`[Redis Config] ${id} Removed Redis password`)
        } catch (removeError) {
          console.log(`[Redis Config] ${id} Could not remove password: ${removeError.message}`)
          console.log(`[Redis Config] ${id} Password removal may require Redis restart`)
        }
      } catch (removeError) {
        // If there's no password set, this will fail - that's fine
        console.log(`[Redis Config] ${id} No password to remove`)
      }
    }
    
    console.log(`[Redis Config] ${id} Configuration completed`)
    console.log(`[Redis Config] ${id} Note: Password changes require restart for persistence. Consider restarting the database.`)
  } catch (error) {
    console.error(`[Redis Config] ${id} Configuration error:`, error.message)
  }
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
  const { id, type, version, port, username, password, containerId: configContainerId } = config
  
  // Ensure containerId is available - use from config, or fallback to id
  const containerId = configContainerId || config.containerId || id
  
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
    
    // Create container-specific temp directory for PostgreSQL
    const tempDir = path.join(dataDir, 'tmp')
    try {
      await fs.mkdir(tempDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = postgresPath
    args = [
      "-D", dataDir, 
      "-p", port.toString(), 
      "-h", "localhost",
      "-c", "log_min_messages=warning",  // Reduce log verbosity
      "-c", "log_line_prefix=%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ",  // Compact log format
      "-c", "log_directory=log",  // Store logs in data directory
      "-c", "log_filename=postgresql-%Y-%m-%d.log",  // Rotate logs daily
      "-c", "log_rotation_age=1d",  // Rotate logs daily
      "-c", "log_rotation_size=10MB",  // Rotate logs at 10MB
      "-c", "max_wal_size=1GB",  // Limit WAL size to prevent unbounded growth
      "-c", "min_wal_size=80MB",  // Minimum WAL size
      "-c", "wal_keep_size=500MB",  // Keep only 500MB of WAL files
      "-c", "temp_file_limit=2GB",  // Limit temporary file usage to 2GB per query
      "-c", "work_mem=64MB"  // Increase work memory to reduce temp file usage
    ]
    
    // Set TMPDIR environment variable to use container-specific temp directory
    env.TMPDIR = tempDir
    env.TMP = tempDir
    env.TEMP = tempDir
    
    // Check if database directory already exists and is initialized
    const pgVersionPath = `${dataDir}/PG_VERSION`
    const pgConfigPath = `${dataDir}/postgresql.conf`
    
    if (!fsSync.existsSync(pgVersionPath) || !fsSync.existsSync(pgConfigPath)) {
      try {
        console.log(`[PostgreSQL] Initializing database with ${initdbPath}`)
        // Use spawn instead of execSync to prevent blocking
        const { spawn } = require("child_process")
        const initProcess = spawn(initdbPath, ["-D", dataDir, "-U", "postgres"], {
          env: { ...env, LC_ALL: "C" },
          stdio: "pipe"
        })
        
        let initOutput = ""
        let initError = ""
        
        initProcess.stdout.on("data", (data) => {
          const output = data.toString()
          initOutput += output
          console.log(`[PostgreSQL Init] ${output.trim()}`)
        })
        
        initProcess.stderr.on("data", (data) => {
          const error = data.toString()
          initError += error
          console.log(`[PostgreSQL Init] ${error.trim()}`)
        })
        
        await new Promise((resolve, reject) => {
          initProcess.on("exit", (code) => {
            if (code === 0) {
              // Verify that postgresql.conf was actually created
              if (fsSync.existsSync(pgConfigPath)) {
                console.log(`[PostgreSQL] Database initialized successfully`)
                resolve()
              } else {
                console.error(`[PostgreSQL] Init completed but postgresql.conf not found`)
                reject(new Error("PostgreSQL initialization failed: postgresql.conf not created"))
              }
            } else {
              console.error(`[PostgreSQL] Init failed with code ${code}`)
              console.error(`[PostgreSQL] Init output: ${initOutput}`)
              console.error(`[PostgreSQL] Init error: ${initError}`)
              reject(new Error(`PostgreSQL initialization failed with exit code ${code}: ${initError || initOutput}`))
            }
          })
          initProcess.on("error", (err) => {
            console.error(`[PostgreSQL] Init process error:`, err.message)
            reject(new Error(`PostgreSQL initialization failed: ${err.message}`))
          })
        })
      } catch (e) {
        console.error(`[PostgreSQL] Initialization failed:`, e.message)
        throw new Error(`Failed to initialize PostgreSQL database: ${e.message}`)
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
    
    // Use container-specific temp directory to allow cleanup
    const tempDir = path.join(dataDir, 'tmp')
    
    // Ensure data directory exists first
    try {
      await fs.mkdir(dataDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    // Ensure temp directory exists (will be recreated after init if needed)
    try {
      await fs.mkdir(tempDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = mysqldPath
    
    args = [
      "--port", port.toString(), 
      "--datadir", dataDir, 
      "--bind-address=127.0.0.1",
      `--log-error=${dataDir}/mysql-error.log`,
      `--basedir=${mysqlBaseDir}`,
      `--tmpdir=${tempDir}`,  // Use container-specific temp dir instead of /tmp
      `--pid-file=${dataDir}/mysql.pid`,
      `--socket=/tmp/mysql-${containerId}.sock`,
      "--mysqlx=OFF",  // Disable X Plugin to allow multiple MySQL instances
      "--skip-log-bin"  // Disable binary logging to prevent log file growth
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
                  // Recreate temp directory after initialization (it was deleted during rmdir)
                  try {
                    await fs.mkdir(tempDir, { recursive: true })
                    console.log(`[MySQL] Recreated temp directory: ${tempDir}`)
                  } catch (e) {
                    console.warn(`[MySQL] Could not recreate temp directory:`, e.message)
                  }
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
      // Ensure temp directory exists even if database was already initialized
      try {
        await fs.mkdir(tempDir, { recursive: true })
        console.log(`[MySQL] Ensured temp directory exists: ${tempDir}`)
      } catch (e) {
        console.warn(`[MySQL] Could not ensure temp directory exists:`, e.message)
      }
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
    
    // Create container-specific temp directory for MongoDB
    const tempDir = path.join(dataDir, 'tmp')
    try {
      await fs.mkdir(tempDir, { recursive: true })
    } catch (e) {
      // Directory might already exist
    }
    
    cmd = mongodPath
    args = [
      "--port", port.toString(), 
      "--dbpath", dataDir, 
      "--bind_ip", "127.0.0.1",
      "--logpath", path.join(dataDir, "mongod.log"),  // Store logs in data directory
      "--logappend",  // Append to log file instead of overwriting
      "--logRotate", "rename",  // Rotate logs by renaming
      "--setParameter", "logLevel=1",  // Reduce log verbosity (0=off, 1=low, 2=higher)
      "--smallfiles",  // Use smaller data files to reduce disk usage
      "--noprealloc"  // Don't preallocate data files
    ]
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
    
    // Use password directly from config
    let redisPassword = password || ''
    
    // Create container-specific temp directory for Redis
    const tempDir = path.join(redisDataDir, 'tmp')
    try {
      await fs.mkdir(tempDir, { recursive: true })
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
      "--save", "60 10000", // Save after 60 seconds if at least 10000 keys changed
      "--maxmemory", "512mb",  // Limit memory usage to prevent swap file growth
      "--maxmemory-policy", "allkeys-lru",  // Evict least recently used keys when memory limit reached
      "--no-appendfsync-on-rewrite",  // Don't fsync during rewrite to reduce I/O
      "--auto-aof-rewrite-percentage", "100",  // Rewrite AOF when it's 100% larger than previous
      "--auto-aof-rewrite-min-size", "64mb"  // Minimum AOF size before rewrite
    ]
    
    // Add --requirepass if password is provided (for persistence)
    if (redisPassword && redisPassword.trim() !== '') {
      args.push("--requirepass", redisPassword)
      console.log(`[Redis] ${id} Starting with password authentication`)
    }
  }

  // Ensure temp directory exists right before starting the process (for MySQL and PostgreSQL)
  if (type === "mysql" || type === "postgresql") {
    try {
      const fsPromises = require("fs").promises
      const tempDir = path.join(storage.getDatabaseDataDir(app, containerId), 'tmp')
      await fsPromises.mkdir(tempDir, { recursive: true })
      console.log(`[${type}] Ensured temp directory exists before start: ${tempDir}`)
    } catch (e) {
      console.warn(`[${type}] Could not ensure temp directory exists:`, e.message)
    }
  }
  
  // Use stdio: "pipe" to prevent terminal interactions (password prompts, etc.)
  const child = spawn(cmd, args, { 
    env, 
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'] // stdin=ignore, stdout=pipe, stderr=pipe
  })
  
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
        
        // Configure PostgreSQL with custom username, password, and database name
        setTimeout(async () => {
          try {
            await configurePostgreSQL(config)
          } catch (configError) {
            console.error(`[PostgreSQL] ${id} Failed to configure:`, configError.message)
          }
        }, 3000)
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
      const trimmedOutput = output.trim()
      
      // Filter out routine checkpoint logs (they're informational, not errors)
      const isCheckpointLog = trimmedOutput.includes('checkpoint starting:') || 
                             trimmedOutput.includes('checkpoint complete:')
      
      // Only log non-checkpoint messages or actual errors
      if (!isCheckpointLog) {
        // Check if it's an actual error (contains ERROR, FATAL, PANIC)
        const isError = /ERROR|FATAL|PANIC/i.test(trimmedOutput)
        if (isError) {
          console.error(`[PostgreSQL] ${id} error:`, trimmedOutput)
        } else {
          console.log(`[PostgreSQL] ${id} output:`, trimmedOutput)
        }
      }
      
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
        
        mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true, pid: child.pid })
        
        // Configure MySQL with custom username, password, and database name
        setTimeout(async () => {
          try {
            await configureMySQL(config)
          } catch (configError) {
            console.error(`[MySQL] ${id} Failed to configure:`, configError.message)
          }
        }, 4000)
      } else {
        console.log(`[MySQL] ${id} ready event already sent or no mainWindow (readyEventSent: ${readyEventSent}, mainWindow: ${!!mainWindow})`)
      }
    }
    
    child.stdout.on('data', (data) => {
      try {
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
      } catch (error) {
        console.error(`[MySQL] ${id} Error in stdout handler:`, error)
        // Don't crash, just log the error
      }
    })
    
    child.stderr.on('data', (data) => {
      try {
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
      } catch (error) {
        console.error(`[MySQL] ${id} Error in stderr handler:`, error)
        // Don't crash, just log the error
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
  } else if (type === "mongodb") {
    // For MongoDB, mark as running after a short delay and configure
    setTimeout(async () => {
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex(db => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = 'running'
          databases[dbIndex].pid = child.pid
          storage.saveDatabases(app, databases)
          console.log(`[Database] ${id} status updated to running in storage (MongoDB)`)
        }
        
        if (mainWindow) {
          mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true, pid: child.pid })
        }
        
        // Configure MongoDB with custom username, password, and database name
        setTimeout(async () => {
          try {
            await configureMongoDB(config)
          } catch (configError) {
            console.error(`[MongoDB] ${id} Failed to configure:`, configError.message)
          }
        }, 3000)
      } catch (error) {
        console.error(`[Database] ${id} failed to update status to running in storage:`, error)
      }
    }, 2000)
  } else if (type === "redis") {
    // For Redis, mark as running after a short delay and configure
    setTimeout(async () => {
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex(db => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = 'running'
          databases[dbIndex].pid = child.pid
          storage.saveDatabases(app, databases)
          console.log(`[Database] ${id} status updated to running in storage (Redis)`)
        }
        
        if (mainWindow) {
          mainWindow.webContents.send('database-status-changed', { id, status: 'running', ready: true, pid: child.pid })
        }
        
        // Configure Redis with custom password
        setTimeout(async () => {
          try {
            await configureRedis(config)
          } catch (configError) {
            console.error(`[Redis] ${id} Failed to configure:`, configError.message)
          }
        }, 2000)
      } catch (error) {
        console.error(`[Database] ${id} failed to update status to running in storage:`, error)
      }
    }, 1000)
  } else {
    // For other databases, mark as running immediately
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
  }
  
  child.on("error", (err) => {
    try {
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
      if (mainWindow && !mainWindow.isDestroyed() && !stoppedEventSent) {
        stoppedEventSent = true
        mainWindow.webContents.send('database-status-changed', { id, status: 'stopped', error: err.message, pid: null })
      }
    } catch (error) {
      console.error(`[Database] ${id} Error in error handler:`, error)
      // Don't let error handler errors crash the app
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
      
      // @ts-expect-error - This will be available in the renderer process
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

// Cleanup temporary files for a database
async function cleanupDatabaseTempFiles(app, containerId, dbType) {
  try {
    const dataDir = storage.getDatabaseDataDir(app, containerId)
    const tempDir = path.join(dataDir, 'tmp')
    
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir)
      for (const file of files) {
        try {
          const filePath = path.join(tempDir, file)
          const stats = fs.statSync(filePath)
          // Remove temp files older than 1 hour or larger than 100MB
          const oneHourAgo = Date.now() - (60 * 60 * 1000)
          if (stats.mtimeMs < oneHourAgo || stats.size > 100 * 1024 * 1024) {
            fs.unlinkSync(filePath)
            console.log(`[Cleanup] Removed temp file: ${filePath}`)
          }
        } catch (error) {
          // Ignore errors deleting individual files
        }
      }
    }
    
    // Database-specific cleanup
    if (dbType === "postgresql") {
      // Clean up old PostgreSQL log files (keep only last 7 days)
      const logDir = path.join(dataDir, 'log')
      if (fs.existsSync(logDir)) {
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
        const files = fs.readdirSync(logDir)
        for (const file of files) {
          if (file.startsWith('postgresql-') && file.endsWith('.log')) {
            try {
              const filePath = path.join(logDir, file)
              const stats = fs.statSync(filePath)
              if (stats.mtimeMs < sevenDaysAgo) {
                fs.unlinkSync(filePath)
                console.log(`[Cleanup] Removed old PostgreSQL log: ${filePath}`)
              }
            } catch (error) {
              // Ignore errors
            }
          }
        }
      }
      
      // Clean up old WAL files if they exceed limits (PostgreSQL manages this, but we can check)
      const pgWalDir = path.join(dataDir, 'pg_wal')
      if (fs.existsSync(pgWalDir)) {
        try {
          const files = fs.readdirSync(pgWalDir)
          // If there are more than 32 WAL files (typical for 1GB max_wal_size), clean old ones
          if (files.length > 32) {
            const walFiles = files
              .filter(f => f.match(/^[0-9A-F]{24}$/))
              .map(f => ({
                name: f,
                path: path.join(pgWalDir, f),
                mtime: fs.statSync(path.join(pgWalDir, f)).mtimeMs
              }))
              .sort((a, b) => a.mtime - b.mtime)
            
            // Keep only the 32 most recent WAL files
            const toRemove = walFiles.slice(0, walFiles.length - 32)
            for (const walFile of toRemove) {
              try {
                fs.unlinkSync(walFile.path)
                console.log(`[Cleanup] Removed old WAL file: ${walFile.name}`)
              } catch (error) {
                // Ignore errors - file might be in use
              }
            }
          }
        } catch (error) {
          // Ignore errors accessing pg_wal directory
        }
      }
    } else if (dbType === "mongodb") {
      // Clean up old MongoDB log files (keep only last 7 days)
      const logFile = path.join(dataDir, 'mongod.log')
      if (fs.existsSync(logFile)) {
        try {
          const stats = fs.statSync(logFile)
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
          // If log file is older than 7 days and larger than 100MB, rotate it
          if (stats.mtimeMs < sevenDaysAgo && stats.size > 100 * 1024 * 1024) {
            const rotatedLog = `${logFile}.${new Date().toISOString().split('T')[0]}`
            fs.renameSync(logFile, rotatedLog)
            console.log(`[Cleanup] Rotated MongoDB log: ${rotatedLog}`)
          }
        } catch (error) {
          // Ignore errors
        }
      }
    } else if (dbType === "redis") {
      // Clean up old Redis AOF files if they exist
      const aofFile = path.join(dataDir, `appendonly-${containerId}.aof`)
      if (fs.existsSync(aofFile)) {
        try {
          const stats = fs.statSync(aofFile)
          // If AOF file is larger than 500MB, it should be rewritten (Redis handles this, but we can check)
          if (stats.size > 500 * 1024 * 1024) {
            console.log(`[Cleanup] Redis AOF file is large (${(stats.size / 1024 / 1024).toFixed(2)}MB), consider rewriting`)
          }
        } catch (error) {
          // Ignore errors
        }
      }
    }
  } catch (error) {
    console.error(`[Cleanup] Error cleaning temp files for ${containerId}:`, error)
  }
}

// Cleanup on app termination
app.on("before-quit", async () => {
  log.info("Stopping all databases...")
  for (const [id, db] of runningDatabases) {
    try {
      log.debug(`Stopping database ${id}`)
      db.process.kill("SIGTERM")
      // Clean up temporary files
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find(d => d.id === id)
      if (dbRecord?.containerId) {
        await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
      }
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
  // Clean up temporary files when stopping database
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    if (dbRecord?.containerId) {
      await cleanupDatabaseTempFiles(app, dbRecord.containerId, dbRecord.type)
    }
  } catch (error) {
    console.error(`[Stop DB] Error cleaning temp files for ${id}:`, error)
  }
  
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
          // Use password directly from config
          let mysqlPassword = db.config.password || ''
          
          // Use --password= or --password="" to avoid password prompt
          // If password is empty, use --password="" 
          const passwordFlag = mysqlPassword && mysqlPassword.trim() !== '' 
            ? `--password="${mysqlPassword.replace(/"/g, '\\"')}"` 
            : '--password='
          
          const mysqlCommand = `mysql -h localhost -P ${db.config.port} -u ${db.config.username} ${passwordFlag} -e "SHOW PROCESSLIST;" 2>/dev/null | wc -l || echo "0"`
          const sessionCount = execSync(mysqlCommand, { 
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'] // Prevent password prompt
          }).trim()
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

// Store previous CPU times for app CPU calculation
let previousAppCpuUsage = null
let previousAppCpuCheckTime = null

// Get app-specific statistics (RAM, CPU usage for app + instances)
ipcMain.handle("get-system-stats", async () => {
  try {
    const os = require('os')
    const { execSync } = require('child_process')
    
    // Get app uptime (time since Electron main process started)
    const uptimeSeconds = Math.floor(process.uptime())
    
    // Collect all PIDs for app processes (main + renderer + database instances)
    const pids = []
    
    // Add main process PID
    pids.push(process.pid)
    
    // Add renderer process PIDs (from all BrowserWindows)
    BrowserWindow.getAllWindows().forEach(win => {
      const pid = win.webContents.getProcessId()
      if (pid) {
        pids.push(pid)
      }
    })
    
    // Add all running database instance PIDs
    let runningDatabasesCount = 0
    runningDatabases.forEach((db) => {
      if (!db.process.killed && db.process.exitCode === null) {
        runningDatabasesCount++
        if (db.process.pid) {
          pids.push(db.process.pid)
        }
      }
    })
    
    // Calculate total memory and CPU usage from all app processes
    let totalMemoryUsage = 0
    let totalCpuUsage = 0
    
    if (pids.length > 0) {
      try {
        // Get process stats for all PIDs at once
        const pidList = pids.join(',')
        const psOutput = execSync(`ps -o pid,rss,pcpu -p ${pidList}`, { encoding: 'utf8', timeout: 2000 })
        const lines = psOutput.trim().split('\n')
        
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          const parts = line.split(/\s+/)
          if (parts.length >= 3) {
            // RSS is in KB, convert to bytes
            const memoryKB = parseInt(parts[1]) || 0
            totalMemoryUsage += memoryKB * 1024
            
            // CPU percentage
            const cpuPercent = parseFloat(parts[2]) || 0
            totalCpuUsage += cpuPercent
          }
        }
      } catch (psError) {
        log.debug(`Could not get process stats:`, psError.message)
        // Fallback: try individual processes
        for (const pid of pids) {
          try {
            const psOutput = execSync(`ps -o rss,pcpu -p ${pid}`, { encoding: 'utf8', timeout: 1000 })
            const lines = psOutput.trim().split('\n')
            if (lines.length > 1) {
              const parts = lines[1].trim().split(/\s+/)
              if (parts.length >= 2) {
                const memoryKB = parseInt(parts[0]) || 0
                totalMemoryUsage += memoryKB * 1024
                
                const cpuPercent = parseFloat(parts[1]) || 0
                totalCpuUsage += cpuPercent
              }
            }
          } catch (individualError) {
            log.debug(`Could not get stats for PID ${pid}:`, individualError.message)
          }
        }
      }
    }
    
    // Cap CPU usage at 100% (could be more if multiple cores)
    totalCpuUsage = Math.min(100, totalCpuUsage)
    
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
    
    // Calculate load average based on number of processes (simplified)
    // Use number of active processes as a proxy for load
    const processCount = pids.length
    const loadAverage = [processCount * 0.1, processCount * 0.1, processCount * 0.1]
    
    // Store for next call
    previousAppCpuUsage = totalCpuUsage
    previousAppCpuCheckTime = Date.now()
    
    return {
      success: true,
      memory: {
        total: totalMemoryUsage, // App total memory (no free/total system concept)
        free: 0, // Not applicable for app stats
        used: totalMemoryUsage,
        percentage: 0 // Not applicable for app stats
      },
      cpu: {
        usage: totalCpuUsage,
        percentage: totalCpuUsage
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
    log.error(`Error getting app stats:`, error)
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
    
    // Prevent username changes - username is set during creation and cannot be changed
    if (db.id) {
      const existingDb = existingDatabases.find(d => d.id === db.id)
      if (existingDb && existingDb.username && db.username && existingDb.username !== db.username) {
        return {
          success: false,
          error: "Username cannot be changed after database creation. It was set during initialization and must remain unchanged."
        }
      }
    }
    
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
    
    // Password is stored directly in database config (no keychain)
    const saved = storage.upsertDatabase(app, db)
    return saved
  } catch (error) {
    console.error("[Database Save] Error saving database:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("db:getPassword", async (event, id) => {
  // Get password directly from database config
  const databases = storage.loadDatabases(app)
  const db = databases.find(d => d.id === id)
  return db?.password || null
})


// IPC handler to export a specific database with its data files
ipcMain.handle("export-database", async (event, databaseConfig) => {
  try {
    if (!databaseConfig || !databaseConfig.id) {
      return { success: false, error: "No database provided for export" }
    }

    // Show save dialog for zip file first
    const dateStr = new Date().toISOString().split('T')[0]
    const dbName = databaseConfig.name || 'database'
    const result = await dialog.showSaveDialog(mainWindow || null, {
      title: 'Export Database',
      defaultPath: `${dbName}-${dateStr}.zip`,
      filters: [
        { name: 'ZIP Files', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['showOverwriteConfirmation']
    })

    if (result.canceled) {
      return { success: false, canceled: true }
    }

    let zipFilePath = result.filePath
    // Ensure .zip extension
    if (!zipFilePath.endsWith('.zip')) {
      zipFilePath = zipFilePath + '.zip'
    }

    // Prepare export data for this specific database
    const exportDb = { ...databaseConfig }
    
    // Don't export password for security
    exportDb.password = ""

    // Remove sensitive runtime data
    delete exportDb.pid
    delete exportDb.systemInfo
    delete exportDb.status

    const exportData = {
      exportDate: new Date().toISOString(),
      version: "1.0.0",
      database: exportDb
    }

    // Create zip file directly - no temp directory needed
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath)
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      let resolved = false

      const cleanupAndResolve = (result) => {
        if (resolved) return
        resolved = true
        resolve(result)
      }

      const cleanupAndReject = (err) => {
        if (resolved) return
        resolved = true
        reject(err)
      }

      output.on('error', cleanupAndReject)
      archive.on('error', cleanupAndReject)

      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') {
          cleanupAndReject(err)
        }
      })

      archive.on('progress', (progress) => {
        try {
          if (mainWindow && !mainWindow.isDestroyed() && progress.entries && progress.entries.total > 0) {
            const zipProgress = Math.round((progress.entries.processed / progress.entries.total) * 100)
            mainWindow.webContents.send('export-progress', {
              stage: 'zipping',
              message: `Compressing files... (${zipProgress}%)`,
              progress: zipProgress,
              total: 100
            })
          }
        } catch (error) {
          console.error("[Export] Error sending progress update:", error)
          // Don't crash on progress update errors
        }
      })

      output.on('close', () => {
        try {
          const size = archive.pointer()
          cleanupAndResolve({ 
            success: true, 
            filePath: zipFilePath, 
            databaseCount: 1,
            size: size
          })
        } catch (error) {
          console.error("[Export] Error getting archive size:", error)
          cleanupAndResolve({ 
            success: true, 
            filePath: zipFilePath, 
            databaseCount: 1,
            size: 0
          })
        }
      })

      archive.pipe(output)

      // Send progress update
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('export-progress', {
            stage: 'preparing',
            message: `Preparing export for ${databaseConfig.name}...`,
            progress: 0,
            total: 100
          })
        }
      } catch (error) {
        console.error("[Export] Error sending initial progress update:", error)
        // Don't crash on progress update errors
      }

      // Add JSON config file to zip
      archive.append(JSON.stringify(exportData, null, 2), { name: 'database-config.json' })

      // Add database data directory directly from its source location
      // This is where the database stores its actual data files (SQL data, etc.)
      if (databaseConfig.containerId) {
        const sourceDataDir = storage.getDatabaseDataDir(app, databaseConfig.containerId)
        console.log(`[Export] Database data directory path: ${sourceDataDir}`)
        
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('export-progress', {
              stage: 'copying',
              message: `Adding database files for ${databaseConfig.name}...`,
              progress: 50,
              total: 100
            })
          }
        } catch (error) {
          console.error("[Export] Error sending copying progress update:", error)
          // Don't crash on progress update errors
        }

        if (fs.existsSync(sourceDataDir)) {
          // Check if directory has any files
          try {
            const files = fs.readdirSync(sourceDataDir)
            console.log(`[Export] Found ${files.length} items in database data directory`)
            
            // Add directory directly to zip from source location
            // This includes all database files (e.g., PostgreSQL data files, MySQL data files, etc.)
            archive.directory(sourceDataDir, `database-data`)
            console.log(`[Export] Added database data directory to zip: ${sourceDataDir}`)
          } catch (error) {
            console.error(`[Export] Error reading database data directory:`, error)
            // Still try to add it even if we can't read it
            archive.directory(sourceDataDir, `database-data`)
          }
        } else {
          console.warn(`[Export] Database data directory does not exist: ${sourceDataDir}`)
          // Send warning to user
          try {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('export-progress', {
                stage: 'warning',
                message: `Warning: Database data directory not found for ${databaseConfig.name}`,
                progress: 50,
                total: 100
              })
            }
          } catch (error) {
            console.error("[Export] Error sending warning progress update:", error)
            // Don't crash on progress update errors
          }
        }
      } else {
        console.warn(`[Export] No containerId found for database: ${databaseConfig.name}`)
      }

      // Send progress update - finalizing
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('export-progress', {
            stage: 'finishing',
            message: 'Finalizing zip archive...',
            progress: 100,
            total: 100
          })
        }
      } catch (error) {
        console.error("[Export] Error sending final progress update:", error)
        // Don't crash on progress update errors
      }

      archive.finalize()
    })
  } catch (error) {
    console.error("[Export] Error exporting database:", error)
    return { success: false, error: error.message }
  }
})

ipcMain.handle("db:updateCredentials", async (event, dbConfig) => {
  try {
    const { id, username, password, name, oldUsername } = dbConfig
    
    // Load the database from storage
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find(d => d.id === id)
    
    if (!dbRecord) {
      return { success: false, error: "Database not found" }
    }
    
    // Use password directly from config
    let actualPassword = password || ''
    
    // Check if database is running
    const db = runningDatabases.get(id)
    if (!db) {
      return { success: false, error: "Database must be running to update credentials" }
    }
    
    // Build config object for configuration functions
    // Username cannot be changed - always use the database's existing username
    const config = {
      id: dbRecord.id,
      type: dbRecord.type,
      port: dbRecord.port,
      username: dbRecord.username, // Username cannot be changed - always use existing
      password: actualPassword || dbRecord.password || '',
      containerId: dbRecord.containerId,
      name: name || dbRecord.name,
      oldUsername: null // Username changes are no longer allowed
    }
    
    console.log(`[Update Credentials] ${id} Updating credentials - username: ${config.username} (cannot be changed)`)
    
    // Configure based on database type
    if (dbRecord.type === "postgresql") {
      await configurePostgreSQL(config)
      console.log(`[Update Credentials] PostgreSQL ${id} credentials updated`)
    } else if (dbRecord.type === "mysql") {
      await configureMySQL(config)
      console.log(`[Update Credentials] MySQL ${id} credentials updated`)
    } else if (dbRecord.type === "mongodb") {
      await configureMongoDB(config)
      console.log(`[Update Credentials] MongoDB ${id} credentials updated`)
    } else if (dbRecord.type === "redis") {
      await configureRedis(config)
      console.log(`[Update Credentials] Redis ${id} credentials updated`)
      // Note: Redis password changes require restart for full persistence
      // The CONFIG SET is temporary until restart
    } else {
      return { success: false, error: `Credential update not supported for ${dbRecord.type}` }
    }
    
    return { success: true }
  } catch (error) {
    console.error("[Update Credentials] Error updating credentials:", error)
    return { success: false, error: error.message }
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
    
    // Password removed with database (no keychain cleanup needed)
    
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
    
    // Passwords removed with databases (no keychain cleanup needed)
    
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
    // Keychain functionality removed
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
    // Keychain functionality removed - skip keychain permission requests
    if (permissionName === 'keychainAccess') {
      return { success: true, data: { granted: false } }
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

// Fetch programming quote (bypasses CORS by using Node's https module)
ipcMain.handle("fetch-quotes", async () => {
  return new Promise((resolve) => {
    const url = 'https://programming-quotesapi.vercel.app/api/bulk'
    
    const request = https.get(url, (res) => {
      let data = ''
      
      res.on('data', (chunk) => {
        data += chunk
      })
      
      res.on('end', () => {
        try {
          const quotes = JSON.parse(data)
          if (Array.isArray(quotes) && quotes.length > 0) {
            const validQuotes = quotes.filter(q => q && q.quote && q.author)
            if (validQuotes.length > 0) {
              resolve({ success: true, data: validQuotes })
            } else {
              resolve({ success: false, error: 'No valid quotes in response' })
            }
          } else {
            resolve({ success: false, error: 'Invalid quotes data structure' })
          }
        } catch (error) {
          resolve({ success: false, error: error.message })
        }
      })
    })
    
    request.on('error', (error) => {
      resolve({ success: false, error: error.message })
    })
    
    request.setTimeout(5000, () => {
      request.destroy()
      resolve({ success: false, error: 'Request timeout' })
    })
  })
})

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
