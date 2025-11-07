import { execSync, spawn } from "child_process"
import storage from "../storage"
import { IDatabase } from "../../types/database"
import fs from "fs"

/**
 * Alternative MySQL initialization method
 * @param {string} mysqldPath - Path to mysqld binary
 * @param {string} dataDir - Data directory path
 * @param {object} env - Environment variables
 */
export async function alternativeMySQLInit(mysqldPath: string, dataDir: string, env: NodeJS.ProcessEnv): Promise<void> {
  console.log(`[MySQL Alt] Trying alternative initialization...`)
  
  // Try with different arguments
  const initProcess = spawn(mysqldPath, [
    "--initialize-insecure", 
    `--datadir=${dataDir}`,
    // Don't specify --log-error to prevent log file creation during alternative initialization
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
  
  initProcess.stdout.on("data", (data: Buffer) => {
    const output = data.toString()
    initOutput += output
    console.log(`[MySQL Alt Init] ${output.trim()}`)
  })
  
  initProcess.stderr.on("data", (data: Buffer) => {
    const error = data.toString()
    initError += error
    console.error(`[MySQL Alt Init Error] ${error.trim()}`)
  })
  
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      initProcess.kill('SIGTERM')
      reject(new Error('Alternative MySQL initialization timed out'))
    }, 30000)
    
    initProcess.on("exit", async (code: number | null) => {
      clearTimeout(timeout)
      if (code === 0) {
        console.log(`[MySQL Alt] Alternative initialization successful`)
        resolve()
      } else {
        console.error(`[MySQL Alt] Alternative initialization failed with code ${code}`)
        console.error(`[MySQL Alt] Output:`, initOutput)
        console.error(`[MySQL Alt] Error:`, initError)
        
        // Log files are disabled, error details are in initError
        
        reject(new Error(`Alternative MySQL initialization failed with exit code ${code}`))
      }
    })
    
    initProcess.on("error", (error: Error) => {
      clearTimeout(timeout)
      console.error(`[MySQL Alt] Process error:`, error)
      reject(error)
    })
  })
}

/**
 * Configure PostgreSQL with custom username, password, and database name
 * @param {object} config - Database configuration
 * @param {object} app - Electron app instance
 */
export async function configurePostgreSQL(config: IDatabase, app: Electron.App): Promise<void> {
  const { id, type, port, username, password, name } = config
  
  if (type !== "postgresql") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find((d) => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[PostgreSQL Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    const actualPassword = (password || '') as string
    
    const psqlPath = `${dbRecord.homebrewPath}/psql`
    const env: NodeJS.ProcessEnv = {
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
        execSync(
          `${psqlPath} -h localhost -p ${port} -U postgres -d postgres -c "SELECT 1;"`,
          {
            env: { ...env, PGPASSWORD: "" },
            stdio: "pipe",
            timeout: 2000,
          },
        )
        postgresReady = true
        break
      } catch (_pingError) {
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
      if (e instanceof Error && e.message.includes('already exists')) {
        console.log(`[PostgreSQL Config] ${id} Database ${dbName} already exists`)
      } else {
        console.log(`[PostgreSQL Config] ${id} Could not create database:`, e)
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
              env: { ...env, PGPASSWORD: actualPassword },
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
            console.log(`[PostgreSQL Config] ${id} Could not rename postgres user:`, renameError)
            // If rename fails, we'll create the user and drop postgres below
          }
        } else if (postgresExists && customUserExists) {
          // Both exist - drop postgres user
          console.log(`[PostgreSQL Config] ${id} Both postgres and ${actualUsername} exist - dropping postgres user`)
          try {
            // Revoke privileges from postgres
            const revokePostgresCmd = `REVOKE ALL PRIVILEGES ON DATABASE "${dbName}" FROM postgres;`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -c "${revokePostgresCmd}"`, {
              env: { ...env, PGPASSWORD: actualPassword },
              stdio: 'pipe'
            })
            // Drop postgres user
            const dropPostgresCmd = `DROP USER IF EXISTS postgres;`
            execSync(`${psqlPath} -h localhost -p ${port} -U "${actualUsername}" -d postgres -c "${dropPostgresCmd}"`, {
              env: { ...env, PGPASSWORD: actualPassword },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Dropped postgres user`)
          } catch (dropError2) {
            console.log(`[PostgreSQL Config] ${id} Could not drop postgres user:`, dropError2)
          }
        } else if (!postgresExists && customUserExists) {
          // Only custom user exists - use it for connections
          connectAsUser = actualUsername
        }
      } catch (postgresCheckError) {
        console.log(`[PostgreSQL Config] ${id} Could not check/remove postgres user:`, postgresCheckError)
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
              env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : actualPassword },
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
                env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : actualPassword },
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
              env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : actualPassword },
              stdio: 'pipe'
            })
            console.log(`[PostgreSQL Config] ${id} Created user: ${actualUsername}`)
          }
        }
        
        // Grant privileges on the database to the user
        try {
          const grantCmd = `GRANT ALL PRIVILEGES ON DATABASE "${dbName}" TO "${actualUsername}";`
          execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d postgres -c "${grantCmd}"`, {
            env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : actualPassword },
            stdio: 'pipe'
          })
          console.log(`[PostgreSQL Config] ${id} Granted privileges on ${dbName} to ${actualUsername}`)
        } catch (grantError) {
          console.log(`[PostgreSQL Config] ${id} Could not grant privileges:`, grantError)
        }
        
        // Also grant schema privileges (PostgreSQL 15+ requires explicit schema grants)
        try {
          const grantSchemaCmd = `GRANT ALL ON SCHEMA public TO "${actualUsername}";`
          execSync(`${psqlPath} -h localhost -p ${port} -U ${connectAsUser} -d "${dbName}" -c "${grantSchemaCmd}"`, {
            env: { ...env, PGPASSWORD: connectAsUser === 'postgres' ? '' : actualPassword },
            stdio: 'pipe'
          })
          console.log(`[PostgreSQL Config] ${id} Granted schema privileges to ${actualUsername}`)
        } catch (schemaError) {
          // Schema grant might fail - log but don't fail
          console.log(`[PostgreSQL Config] ${id} Could not grant schema privileges:`, schemaError)
        }
      } catch (userError) {
        console.log(`[PostgreSQL Config] ${id} Could not configure user:`, userError)
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
        console.log(`[PostgreSQL Config] ${id} Could not update postgres password:`, passError)
      }
    }
    
    console.log(`[PostgreSQL Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[PostgreSQL Config] ${id} Configuration error:`, error)
  }
}

/**
 * Configure MySQL with custom username, password, and database name
 * @param {object} config - Database configuration
 * @param {object} app - Electron app instance
 */
export async function configureMySQL(config: IDatabase, app: Electron.App): Promise<void> {
  const { id, type, username, password, name, oldUsername } = config
  
  if (type !== "mysql") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find((d) => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[MySQL Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Get containerId from config or dbRecord
    const containerId = config.containerId || dbRecord.containerId || id
    
    // Use password directly from config
    const actualPassword = (password || '') as string
    
    const mysqlPath = `${dbRecord.homebrewPath}/mysql`
    const env: NodeJS.ProcessEnv = {
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
    
    // Check if MySQL server is running by checking if socket exists
    if (!fs.existsSync(socketPath)) {
      console.log(`[MySQL Config] ${id} MySQL server is not running (socket not found: ${socketPath}). Skipping configuration.`)
      return
    }
    
    // Verify MySQL is actually accessible by checking connection
    try {
      const testCmd = 'SELECT 1;'
      const escapedTestCmd = testCmd.replace(/'/g, "'\\''")
      execSync(`${mysqlPath} --socket=${socketPath} -e '${escapedTestCmd}'`, {
        env,
        stdio: 'pipe',
        timeout: 5000
      })
    } catch (testError) {
      console.log(`[MySQL Config] ${id} MySQL server is not accessible (socket exists but connection failed). Skipping configuration.`, testError)
      return
    }
    
    try {
      // Create database if it doesn't exist
      // Use single quotes around SQL command to prevent shell interpretation of backticks
      const createDbCmd = `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      // Escape single quotes in the SQL command for shell execution
      const escapedCmd = createDbCmd.replace(/'/g, "'\\''")
      execSync(`${mysqlPath} --socket=${socketPath} -e '${escapedCmd}'`, {
        env,
        stdio: 'pipe'
      })
      console.log(`[MySQL Config] ${id} Created database: ${dbName}`)
    } catch (e) {
      console.log(`[MySQL Config] ${id} Could not create database:`, e)
    }
    
    // Handle username rename if username changed
    if (oldUsername && typeof oldUsername === 'string' && oldUsername.trim() !== '' && oldUsername !== actualUsername && oldUsername !== 'root' && actualUsername && actualUsername !== 'root') {
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
              console.log(`[MySQL Config] ${id} Could not rename user:`, renameError)
              // Fallback: drop old user if rename fails
              try {
                const dropUserCmd = `DROP USER IF EXISTS '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
                execSync(`${mysqlPath} --socket=${socketPath} -e "${dropUserCmd}"`, {
                  env,
                  stdio: 'pipe'
                })
                console.log(`[MySQL Config] ${id} Dropped old user: ${oldUsername} (rename failed)`)
              } catch (dropError) {
                console.log(`[MySQL Config] ${id} Could not drop old user:`, dropError)
              }
            }
          } else {
            // New username already exists - drop old user instead
            console.log(`[MySQL Config] ${id} New username ${actualUsername} already exists, dropping old user`)
            try {
              const revokeCmd = `REVOKE ALL PRIVILEGES ON \`${dbName}\`.* FROM '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
              const escapedRevokeCmd = revokeCmd.replace(/'/g, "'\\''")
              execSync(`${mysqlPath} --socket=${socketPath} -e '${escapedRevokeCmd}'`, {
                env,
                stdio: 'pipe'
              })
            } catch (revokeError) {
              console.log(`[MySQL Config] ${id} Could not revoke privileges:`, revokeError)
            }
            
            try {
              const dropUserCmd = `DROP USER IF EXISTS '${oldUsername}'@'localhost'; FLUSH PRIVILEGES;`
              execSync(`${mysqlPath} --socket=${socketPath} -e "${dropUserCmd}"`, {
                env,
                stdio: 'pipe'
              })
              console.log(`[MySQL Config] ${id} Dropped old user: ${oldUsername}`)
            } catch (dropError) {
              console.log(`[MySQL Config] ${id} Could not drop old user:`, dropError)
            }
          }
        }
      } catch (oldUserError) {
        console.log(`[MySQL Config] ${id} Could not handle old user:`, oldUserError)
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
              console.log(`[MySQL Config] ${id} Could not update password:`, setPassError)
            }
          }
        }
        
        // Grant privileges on the database to the user
        try {
          const grantCmd = `GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${actualUsername}'@'localhost'; FLUSH PRIVILEGES;`
          const escapedGrantCmd = grantCmd.replace(/'/g, "'\\''")
          execSync(`${mysqlPath} --socket=${socketPath} -e '${escapedGrantCmd}'`, {
            env,
            stdio: 'pipe'
          })
          console.log(`[MySQL Config] ${id} Granted privileges on ${dbName} to ${actualUsername}`)
        } catch (grantError) {
          console.log(`[MySQL Config] ${id} Could not grant privileges:`, grantError)
        }
        
        console.log(`[MySQL Config] ${id} Created/updated user: ${actualUsername}`)
      } catch (userError) {
        console.log(`[MySQL Config] ${id} Could not configure user:`, userError)
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
          console.log(`[MySQL Config] ${id} Could not update root password:`, setPassError)
        }
      }
    }
    
    console.log(`[MySQL Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[MySQL Config] ${id} Configuration error:`, error)
  }
}

/**
 * Configure MongoDB with custom username, password, and database name
 * @param {object} config - Database configuration
 * @param {object} app - Electron app instance
 */
export async function configureMongoDB(config: IDatabase, app: Electron.App): Promise<void> {
  const { id, type, port, username, password, name, oldUsername } = config
  
  if (type !== "mongodb") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find((d) => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[MongoDB Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    const actualPassword = (password || '') as string
    
    const mongoshPath = `${dbRecord.homebrewPath}/mongosh`
    // Fallback to mongosh if mongosh doesn't exist in same path
    let mongoshCmd = mongoshPath
    try {
      if (!fs.existsSync(mongoshPath)) {
        // Try to find mongosh in PATH or alternative location
        try {
          mongoshCmd = execSync("which mongosh", { encoding: "utf8" }).trim()
        } catch {
          // Try mongosh without path
          mongoshCmd = "mongosh"
        }
      }
    } catch {
      // ignore
    }
    
    const env: NodeJS.ProcessEnv = {
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
      if (oldUsername && typeof oldUsername === 'string' && oldUsername.trim() !== '' && oldUsername !== actualUsername && actualUsername && actualUsername.trim() !== '') {
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
            if (dropError instanceof Error && !dropError.message.includes('not found') && !dropError.message.includes('does not exist')) {
              console.log(`[MongoDB Config] ${id} Could not drop old user from ${dbName}:`, dropError)
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
            if (dropAdminError instanceof Error && !dropAdminError.message.includes('not found') && !dropAdminError.message.includes('does not exist')) {
              console.log(`[MongoDB Config] ${id} Could not drop old admin user:`, dropAdminError)
            }
          }
        } catch (oldUserError) {
          console.log(`[MongoDB Config] ${id} Could not handle old user:`, oldUserError)
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
          if (userError instanceof Error && (userError.message.includes('already exists') || userError.message.includes('duplicate') || userError.message.includes('E11000'))) {
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
              console.log(`[MongoDB Config] ${id} Could not update password in ${dbName}:`, updateError)
            }
          } else {
            console.log(`[MongoDB Config] ${id} Could not create user in ${dbName}:`, userError)
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
          if (adminError instanceof Error && (adminError.message.includes('already exists') || adminError.message.includes('duplicate') || adminError.message.includes('E11000'))) {
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
              console.log(`[MongoDB Config] ${id} Could not update admin password:`, updateAdminError)
            }
          } else {
            console.log(`[MongoDB Config] ${id} Could not create admin user:`, adminError)
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
      console.log(`[MongoDB Config] ${id} Configuration error:`, error)
    }
    
    console.log(`[MongoDB Config] ${id} Configuration completed`)
  } catch (error) {
    console.error(`[MongoDB Config] ${id} Configuration error:`, error)
  }
}

/**
 * Configure Redis with custom password
 * @param {object} config - Database configuration
 * @param {object} app - Electron app instance
 */
export async function configureRedis(config: IDatabase, app: Electron.App): Promise<void> {
  const { id, type, port, password } = config
  
  if (type !== "redis") return
  
  try {
    const databases = storage.loadDatabases(app)
    const dbRecord = databases.find((d) => d.id === id)
    if (!dbRecord?.homebrewPath) {
      console.log(`[Redis Config] ${id} No homebrew path found, skipping configuration`)
      return
    }
    
    // Use password directly from config
    const actualPassword = (password || '') as string
    
    const redisCliPath = `${dbRecord.homebrewPath}/redis-cli`
    // Fallback to redis-cli if it doesn't exist in same path
    let redisCliCmd = redisCliPath
    try {
      if (!fs.existsSync(redisCliPath)) {
        // Try to find redis-cli in PATH or alternative location
        try {
          redisCliCmd = execSync("which redis-cli", { encoding: "utf8" }).trim()
        } catch {
          // Try redis-cli without path
          redisCliCmd = "redis-cli"
        }
      }
    } catch {
      // ignore
    }
    
    const env: NodeJS.ProcessEnv = {
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
          stdio: "pipe",
          timeout: 2000,
        })
        redisReady = true
        break
      } catch (_pingError) {
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
        
        // Don't call CONFIG REWRITE as it creates config files with potentially unquoted paths
        // Redis started with command-line args doesn't need config files
        // Password persistence is handled via command-line args on restart
        console.log(`[Redis Config] ${id} Skipping CONFIG REWRITE to avoid creating config files with unquoted paths`)
      } catch (passError) {
        // If that fails, Redis might already have a password set
        // In that case, password updates should be done via settings which will restart Redis
        console.log(`[Redis Config] ${id} Could not set password:`, passError)
        console.log(`[Redis Config] ${id} Note: If Redis already has a password, changes require restart`)
      }
    } else {
      // Remove password if it was set
      try {
        // Try to check if there's a password first
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
          console.log(`[Redis Config] ${id} Could not remove password:`, removeError)
          console.log(`[Redis Config] ${id} Password removal may require Redis restart`)
        }
      } catch (removeError) {
        // If there's no password set, this will fail - that's fine
        console.log(`[Redis Config] ${id} No password to remove:`, removeError)
      }
    }
    
    console.log(`[Redis Config] ${id} Configuration completed`)
    console.log(`[Redis Config] ${id} Note: Password changes require restart for persistence. Consider restarting the database.`)
  } catch (error) {
    console.error(`[Redis Config] ${id} Configuration error:`, error)
  }
}

