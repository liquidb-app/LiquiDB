import * as path from "path"
import { spawn, ChildProcess, exec, execSync } from "child_process"
import * as fs from "fs"
import { promisify } from "util"
import { app as electronApp } from "electron"
import storage from "../storage"
import { log } from "../logger"
import * as os from "os"
import {
  alternativeMySQLInit,
  configurePostgreSQL,
  configureMySQL,
  configureMongoDB,
  configureRedis,
} from "./config"
import sharedState from "../core/shared-state"
import { IDatabase } from "../../types/database"

const execAsync = promisify(exec)

/**
 * Reset all database statuses to stopped on app start
 * @param {object} app - Electron app instance
 */
export function resetDatabaseStatuses(app: Electron.App): void {
  try {
    const databases = storage.loadDatabases(app)
    const updatedDatabases = databases.map((db) => ({
      ...db,
      status: "stopped",
      pid: null,
    }))
    storage.saveDatabases(app, updatedDatabases)
    console.log(
      "[App Start] Reset all database statuses to stopped and cleared PIDs",
    )
  } catch (error) {
    console.error("[App Start] Error resetting database statuses:", error)
  }
}

/**
 * Start database process (wrapper that returns immediately)
 * @param {object} config - Database configuration
 * @returns {Promise<object>} - Success result
 */
export async function startDatabaseProcess(
  config: IDatabase,
): Promise<{ success: boolean }> {
  const { type, port } = config

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

/**
 * Start database process (async implementation)
 * This is a very large function that handles starting different database types
 * @param {object} config - Database configuration
 * @returns {Promise<object>} - Success result
 */
export async function startDatabaseProcessAsync(
  config: IDatabase,
): Promise<{ success: boolean; error?: string }> {
  const {
    id,
    type,
    port,
    password,
    containerId: configContainerId,
  } = config
  const app = electronApp
  const runningDatabases = sharedState.getRunningDatabases()
  const mainWindow = sharedState.getMainWindow()

  // Ensure containerId is available - use from config, or fallback to id
  const containerId = configContainerId || config.containerId || id

  try {
    let cmd: string | undefined
    let args: string[] | undefined
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew",
    }

    // Declare mysqldPath at function scope so it's accessible throughout
    let mysqldPath: string

    if (type === "postgresql") {
      // Get PostgreSQL binary paths from database record or find them
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d) => d.id === id)
      let postgresPath, initdbPath

      // Extract major version from config version (e.g., "16.1" -> "16", "15.4" -> "15")
      const getMajorVersion = (version: string): string => {
        if (!version) return ""
        const parts = version.split('.')
        return parts[0] // Return major version (e.g., "16" from "16.1")
      }

      const majorVersion = getMajorVersion(config.version || dbRecord?.version || "")

      if (dbRecord?.homebrewPath) {
        // Use stored Homebrew path
        postgresPath = `${dbRecord.homebrewPath}/postgres`
        initdbPath = `${dbRecord.homebrewPath}/initdb`
        console.log(
          `[PostgreSQL] Using stored Homebrew path: ${dbRecord.homebrewPath}`,
        )
      } else if (majorVersion) {
        // Try to find the specific version from config
        try {
          console.log(`[PostgreSQL] Looking for PostgreSQL version ${majorVersion}...`)
          const { stdout: versionPath } = await execAsync(
            `find /opt/homebrew -path "*/postgresql@${majorVersion}/*" -name postgres -type f 2>/dev/null | head -1`,
          )
          const { stdout: versionInitdbPath } = await execAsync(
            `find /opt/homebrew -path "*/postgresql@${majorVersion}/*" -name initdb -type f 2>/dev/null | head -1`,
          )

          if (versionPath.trim() && versionInitdbPath.trim()) {
            postgresPath = versionPath.trim()
            initdbPath = versionInitdbPath.trim()
            console.log(`[PostgreSQL] Found PostgreSQL ${majorVersion} at ${postgresPath}`)
          } else {
            throw new Error(`PostgreSQL ${majorVersion} not found`)
          }
        } catch (_e: unknown) {
          // Fallback to any PostgreSQL version
          console.log(`[PostgreSQL] Version ${majorVersion} not found, trying any version...`)
          try {
            const { stdout: postgresOut } = await execAsync("which postgres")
            const { stdout: initdbOut } = await execAsync("which initdb")
            postgresPath = postgresOut.trim()
            initdbPath = initdbOut.trim()
          } catch (_e2: unknown) {
            // Try Homebrew paths
            try {
              const { stdout: postgresOut } = await execAsync(
                "find /opt/homebrew -name postgres -type f 2>/dev/null | head -1",
              )
              const { stdout: initdbOut } = await execAsync(
                "find /opt/homebrew -name initdb -type f 2>/dev/null | head -1",
              )
              postgresPath = postgresOut.trim()
              initdbPath = initdbOut.trim()
            } catch (_e3: unknown) {
              console.error("PostgreSQL not found in PATH or Homebrew")
              throw new Error(
                "PostgreSQL not found. Please ensure it's installed via Homebrew.",
              )
            }
          }
        }
      } else {
        // No version specified, try to find any PostgreSQL version
        console.log(`[PostgreSQL] No version specified, trying to find any PostgreSQL version...`)
        try {
          const { stdout: postgresOut } = await execAsync("which postgres")
          const { stdout: initdbOut } = await execAsync("which initdb")
          postgresPath = postgresOut.trim()
          initdbPath = initdbOut.trim()
        } catch (_e2: unknown) {
          // Try Homebrew paths
          try {
            const { stdout: postgresOut } = await execAsync(
              "find /opt/homebrew -name postgres -type f 2>/dev/null | head -1",
            )
            const { stdout: initdbOut } = await execAsync(
              "find /opt/homebrew -name initdb -type f 2>/dev/null | head -1",
            )
            postgresPath = postgresOut.trim()
            initdbPath = initdbOut.trim()
          } catch (_e3: unknown) {
            console.error("PostgreSQL not found in PATH or Homebrew")
            throw new Error(
              "PostgreSQL not found. Please ensure it's installed via Homebrew.",
            )
          }
        }
      }

      // Create data directory and initialize (async to prevent blocking)
      const fsPromises = fs.promises
      const fsSync = fs
      const dataDir = storage.getDatabaseDataDir(app, containerId)

      try {
        await fsPromises.mkdir(dataDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Create container-specific temp directory for PostgreSQL
      const tempDir = path.join(dataDir, "tmp")
      try {
        await fsPromises.mkdir(tempDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      cmd = postgresPath
      args = [
        "-D",
        dataDir,
        "-p",
        port.toString(),
        "-h",
        "localhost",
        "-c",
        "log_min_messages=warning", // Reduce log verbosity
        "-c",
        "log_line_prefix=%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h ", // Compact log format
        "-c",
        "log_directory=log", // Store logs in data directory
        "-c",
        "log_filename=postgresql-%Y-%m-%d.log", // Rotate logs daily
        "-c",
        "log_rotation_age=1d", // Rotate logs daily
        "-c",
        "log_rotation_size=10MB", // Rotate logs at 10MB
        "-c",
        "max_wal_size=1GB", // Limit WAL size to prevent unbounded growth
        "-c",
        "min_wal_size=80MB", // Minimum WAL size
        "-c",
        "wal_keep_size=500MB", // Keep only 500MB of WAL files
        "-c",
        "temp_file_limit=2GB", // Limit temporary file usage to 2GB per query
        "-c",
        "work_mem=64MB", // Increase work memory to reduce temp file usage
      ]

      // Set TMPDIR environment variable to use container-specific temp directory
      env.TMPDIR = tempDir
      env.TMP = tempDir
      env.TEMP = tempDir

      // Check if database directory already exists and is initialized
      const pgVersionPath = `${dataDir}/PG_VERSION`
      const pgConfigPath = `${dataDir}/postgresql.conf`

      if (
        !fsSync.existsSync(pgVersionPath) ||
        !fsSync.existsSync(pgConfigPath)
      ) {
        try {
          // If directory exists but is not properly initialized, always clean it up
          // initdb requires an empty directory, so we must remove it if initialization files are missing
          if (fsSync.existsSync(dataDir)) {
            try {
              const dirContents = fsSync.readdirSync(dataDir)
              // If directory has any contents (including hidden files), clean it up
              if (dirContents.length > 0) {
                console.log(
                  `[PostgreSQL] Directory exists but is not properly initialized (missing PG_VERSION or postgresql.conf), cleaning up...`,
                )
                await fsPromises.rm(dataDir, { recursive: true, force: true })
                // Wait a bit to ensure filesystem operations complete
                await new Promise((resolve) => setTimeout(resolve, 200))
                await fsPromises.mkdir(dataDir, { recursive: true })
              }
            } catch (cleanupError: unknown) {
              // If readdir fails, try to remove directory anyway (might be permission issue or directory in use)
              // This can happen if there are hidden files or permission issues
              console.log(
                `[PostgreSQL] Could not read directory contents, attempting to remove directory anyway:`,
                (cleanupError as Error).message,
              )
              try {
                await fsPromises.rm(dataDir, { recursive: true, force: true })
                await new Promise((resolve) => setTimeout(resolve, 200))
                await fsPromises.mkdir(dataDir, { recursive: true })
              } catch (rmError: unknown) {
                console.error(
                  `[PostgreSQL] Failed to clean up directory:`,
                  (rmError as Error).message,
                )
                throw new Error(
                  `Failed to clean up PostgreSQL data directory: ${
                    (rmError as Error).message
                  }`,
                )
              }
            }
          }

          // Final verification: ensure directory is empty before initializing
          // This catches edge cases where files might still exist after cleanup
          if (fsSync.existsSync(dataDir)) {
            try {
              const finalCheck = fsSync.readdirSync(dataDir)
              if (finalCheck.length > 0) {
                console.log(
                  `[PostgreSQL] Warning: Directory still has ${finalCheck.length} items after cleanup, removing again...`,
                )
                await fsPromises.rm(dataDir, { recursive: true, force: true })
                await new Promise((resolve) => setTimeout(resolve, 200))
                await fsPromises.mkdir(dataDir, { recursive: true })
              }
            } catch (finalCheckError: unknown) {
              // If we can't verify, try to remove anyway to be safe
              console.log(
                `[PostgreSQL] Could not verify directory is empty, attempting final cleanup:`,
                (finalCheckError as Error).message,
              )
              await fsPromises.rm(dataDir, { recursive: true, force: true })
              await new Promise((resolve) => setTimeout(resolve, 200))
              await fsPromises.mkdir(dataDir, { recursive: true })
            }
          }

          console.log(`[PostgreSQL] Initializing database with ${initdbPath}`)
          // Use spawn instead of execSync to prevent blocking
          const initProcess = spawn(
            initdbPath,
            ["-D", dataDir, "-U", "postgres"],
            {
              env: { ...env, LC_ALL: "C" },
              stdio: "pipe",
            },
          )

          let initOutput = ""
          let initError = ""

          initProcess.stdout.on("data", (data: Buffer) => {
            const output = data.toString()
            initOutput += output
            console.log(`[PostgreSQL Init] ${output.trim()}`)
          })

          initProcess.stderr.on("data", (data: Buffer) => {
            const error = data.toString()
            initError += error
            console.log(`[PostgreSQL Init] ${error.trim()}`)
          })

          await new Promise<void>((resolve, reject) => {
            initProcess.on("exit", (code: number | null) => {
              if (code === 0) {
                // Verify that postgresql.conf was actually created
                if (fsSync.existsSync(pgConfigPath)) {
                  console.log(`[PostgreSQL] Database initialized successfully`)
                  resolve()
                } else {
                  console.error(
                    `[PostgreSQL] Init completed but postgresql.conf not found`,
                  )
                  reject(
                    new Error(
                      "PostgreSQL initialization failed: postgresql.conf not created",
                    ),
                  )
                }
              } else {
                console.error(`[PostgreSQL] Init failed with code ${code}`)
                console.error(`[PostgreSQL] Init output: ${initOutput}`)
                console.error(`[PostgreSQL] Init error: ${initError}`)
                reject(
                  new Error(
                    `PostgreSQL initialization failed with exit code ${code}: ${
                      initError || initOutput
                    }`,
                  )
                )
              }
            })
            initProcess.on("error", (err: Error) => {
              console.error(`[PostgreSQL] Init process error:`, err.message)
              reject(
                new Error(`PostgreSQL initialization failed: ${err.message}`),
              )
            })
          })
        } catch (e: unknown) {
          console.error(
            `[PostgreSQL] Initialization failed:`,
            (e as Error).message,
          )
          throw new Error(
            `Failed to initialize PostgreSQL database: ${(e as Error).message}`,
          )
        }
      } else {
        console.log(`[PostgreSQL] Database already initialized, skipping initdb`)
      }

      // Set up authentication (async)
      const pgHbaPath = `${dataDir}/pg_hba.conf`
      if (fsSync.existsSync(pgHbaPath)) {
        try {
          const content = await fsPromises.readFile(pgHbaPath, "utf8")
          const updatedContent = content
            .replace(
              /^local\s+all\s+all\s+peer$/m,
              "local   all             all                                     trust",
            )
            .replace(
              /^host\s+all\s+all\s+127\.0\.0\.1\/32\s+md5$/m,
              "host    all             all             127.0.0.1/32            trust",
            )
          await fsPromises.writeFile(pgHbaPath, updatedContent)
          console.log(`[PostgreSQL] Updated pg_hba.conf for trust authentication`)
        } catch (e: unknown) {
          console.log(
            `[PostgreSQL] Could not update pg_hba.conf:`,
            (e as Error).message,
          )
        }
      }
    } else if (type === "mysql") {
      // Get MySQL binary path from database record or find it
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d) => d.id === id)

      // Extract major version from config version (e.g., "8.0.35" -> "8.0")
      const getMajorVersion = (version: string): string => {
        if (!version) return ""
        const parts = version.split('.')
        if (parts.length >= 2) {
          return `${parts[0]}.${parts[1]}` // Return major.minor (e.g., "8.0" from "8.0.35")
        }
        return parts[0] // Return major version if no minor version
      }

      const majorVersion = getMajorVersion(config.version || dbRecord?.version || "")

      if (dbRecord?.homebrewPath) {
        // Use stored Homebrew path
        mysqldPath = `${dbRecord.homebrewPath}/mysqld`
        console.log(`[MySQL] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
      } else if (majorVersion) {
        // Try to find the specific version from config
        try {
          console.log(`[MySQL] Looking for MySQL version ${majorVersion}...`)
          const versionPath = execSync(
            `find /opt/homebrew -path "*/mysql@${majorVersion}/*" -name mysqld -type f 2>/dev/null | head -1`,
            { encoding: "utf8" },
          ).trim()
          if (versionPath) {
            mysqldPath = versionPath
            console.log(`[MySQL] Found MySQL ${majorVersion} at ${mysqldPath}`)
          } else {
            throw new Error(`MySQL ${majorVersion} not found`)
          }
        } catch (_e) {
          // Fallback to finding MySQL binary path
          console.log(`[MySQL] Version ${majorVersion} not found, trying any version...`)
          try {
            mysqldPath = execSync("which mysqld", { encoding: "utf8" }).trim()
          } catch (_e2) {
            try {
              mysqldPath = execSync(
                "find /opt/homebrew -name mysqld -type f 2>/dev/null | head -1",
                { encoding: "utf8" },
              ).trim()
            } catch (_e3) {
              console.error("MySQL not found in PATH or Homebrew")
              throw new Error(
                "MySQL not found. Please ensure it's installed via Homebrew.",
              )
            }
          }
        }
      } else {
        // No version specified, try to find any MySQL version
        console.log(`[MySQL] No version specified, trying to find any MySQL version...`)
        try {
          mysqldPath = execSync("which mysqld", { encoding: "utf8" }).trim()
        } catch (_e) {
          try {
            mysqldPath = execSync(
              "find /opt/homebrew -name mysqld -type f 2>/dev/null | head -1",
              { encoding: "utf8" },
            ).trim()
          } catch (_e2) {
            console.error("MySQL not found in PATH or Homebrew")
            throw new Error(
              "MySQL not found. Please ensure it's installed via Homebrew.",
            )
          }
        }
      }

      // Create data directory (async)
      const fsPromises = fs.promises
      const dataDir = storage.getDatabaseDataDir(app, containerId)

      // Get the MySQL base directory from the mysqld path
      const mysqlBaseDir = mysqldPath.replace("/bin/mysqld", "")

      // Use container-specific temp directory to allow cleanup
      const tempDir = path.join(dataDir, "tmp")

      // Ensure data directory exists first
      try {
        await fsPromises.mkdir(dataDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Ensure temp directory exists (will be recreated after init if needed)
      try {
        await fsPromises.mkdir(tempDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      cmd = mysqldPath

      args = [
        "--port",
        port.toString(),
        "--datadir",
        dataDir,
        "--bind-address=127.0.0.1",
        // Don't specify --log-error to prevent log file creation
        `--basedir=${mysqlBaseDir}`,
        `--tmpdir=${tempDir}`, // Use container-specific temp dir instead of /tmp
        `--pid-file=${dataDir}/mysql.pid`,
        `--socket=/tmp/mysql-${containerId}.sock`,
        "--mysqlx=OFF", // Disable X Plugin to allow multiple MySQL instances
        "--skip-log-bin", // Disable binary logging to prevent log file growth
      ]

      console.log(
        `[MySQL] Starting MySQL with ID: ${id}, Container ID: ${containerId}, Port: ${port}`,
      )
      console.log(`[MySQL] Socket path: /tmp/mysql-${containerId}.sock`)
      console.log(`[MySQL] Data dir: ${dataDir}`)
      console.log(`[MySQL] Args:`, args)
      try {
        await fsPromises.mkdir(dataDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Initialize MySQL database if it doesn't exist
      const mysqlDataExists = await fsPromises
        .access(`${dataDir}/mysql`)
        .then(() => true)
        .catch(() => false)

      if (!mysqlDataExists) {
        try {
          console.log(`[MySQL] Initializing database with ${mysqldPath}`)
          console.log(`[MySQL] Data directory: ${dataDir}`)

          // Ensure data directory is empty and has proper permissions
          try {
            await fsPromises.rm(dataDir, { recursive: true, force: true })
          } catch (_e) {
            // Directory might not exist, that's fine
          }
          await fsPromises.mkdir(dataDir, { recursive: true })

          // Add a small delay to ensure directory is properly created
          await new Promise((resolve) => setTimeout(resolve, 100))

          // Use spawn instead of execSync to prevent blocking
          // Get the MySQL base directory from the mysqld path
          const mysqlBaseDir = mysqldPath.replace("/bin/mysqld", "")

          const initProcess = spawn(
            mysqldPath,
            [
              "--initialize-insecure",
              `--datadir=${dataDir}`,
              // Don't specify --log-error to prevent log file creation during initialization
              `--basedir=${mysqlBaseDir}`,
              "--tmpdir=/tmp",
            ],
            {
              stdio: "pipe",
              env: {
                ...env,
                MYSQL_HOME: mysqlBaseDir,
                MYSQL_UNIX_PORT: `/tmp/mysql-${containerId}.sock`,
              },
              cwd: mysqlBaseDir,
            },
          )

          let initOutput = ""
          let initError = ""

          initProcess.stdout.on("data", (data: Buffer) => {
            const output = data.toString()
            initOutput += output
            console.log(`[MySQL Init] ${output.trim()}`)
          })

          initProcess.stderr.on("data", (data: Buffer) => {
            const error = data.toString()
            initError += error
            console.error(`[MySQL Init Error] ${error.trim()}`)
          })

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              console.log(`[MySQL] Initialization timeout, killing process...`)
              initProcess.kill("SIGTERM")
              reject(new Error("MySQL initialization timed out after 30 seconds"))
            }, 30000)

            initProcess.on("exit", async (code: number | null) => {
              clearTimeout(timeout)
              console.log(`[MySQL] Initialization process exited with code ${code}`)
              if (code === 0) {
                console.log(`[MySQL] Database initialized successfully`)
                // Verify the mysql directory was created
                try {
                  const mysqlDirExists = await fsPromises
                    .access(`${dataDir}/mysql`)
                    .then(() => true)
                    .catch(() => false)
                  if (mysqlDirExists) {
                    console.log(`[MySQL] Verified mysql directory exists`)
                    // Recreate temp directory after initialization (it was deleted during rmdir)
                    try {
                      await fsPromises.mkdir(tempDir, { recursive: true })
                      console.log(`[MySQL] Recreated temp directory: ${tempDir}`)
                    } catch (e: unknown) {
                      console.warn(
                        `[MySQL] Could not recreate temp directory:`,
                        (e as Error).message,
                      )
                    }
                    resolve()
                  } else {
                    console.error(
                      `[MySQL] MySQL directory not found after initialization`,
                    )
                    reject(
                      new Error(
                        "MySQL initialization completed but mysql directory not found",
                      ),
                    )
                  }
                } catch (verifyError: unknown) {
                  console.error(
                    `[MySQL] Error verifying mysql directory:`,
                    (verifyError as Error).message,
                  )
                  reject(verifyError)
                }
              } else {
                console.error(`[MySQL] Initialization failed with code ${code}`)
                console.error(`[MySQL] Init output:`, initOutput)
                console.error(`[MySQL] Init error:`, initError)

                // Log files are disabled, error details are in initError above

                // Try alternative initialization method
                console.log(`[MySQL] Attempting alternative initialization method...`)
                try {
                  await alternativeMySQLInit(mysqldPath, dataDir, env)
                  console.log(`[MySQL] Alternative initialization successful`)
                  resolve()
                } catch (altError: unknown) {
                  console.error(
                    `[MySQL] Alternative initialization also failed:`,
                    (altError as Error).message,
                  )
                  reject(
                    new Error(
                      `MySQL initialization failed with exit code ${code}. Both standard and alternative methods failed.`,
                    ),
                  )
                }
              }
            })

            initProcess.on("error", (error: Error) => {
              clearTimeout(timeout)
              console.error(`[MySQL] Initialization process error:`, error)
              reject(error)
            })
          })
        } catch (e: unknown) {
          console.error(`[MySQL] Initialization error:`, (e as Error).message)
          throw new Error(
            `MySQL initialization failed: ${(e as Error).message}`,
          )
        }
      } else {
        console.log(`[MySQL] Database already initialized, skipping initialization`)
        // Ensure temp directory exists even if database was already initialized
        try {
          await fsPromises.mkdir(tempDir, { recursive: true })
          console.log(`[MySQL] Ensured temp directory exists: ${tempDir}`)
        } catch (e: unknown) {
          console.warn(
            `[MySQL] Could not ensure temp directory exists:`,
            (e as Error).message,
          )
        }
      }
    } else if (type === "mongodb") {
      // Get MongoDB binary path from database record or find it
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d) => d.id === id)
      let mongodPath: string

      // Extract major version from config version (e.g., "8.0.1" -> "8.0")
      const getMajorVersion = (version: string): string => {
        if (!version) return ""
        const parts = version.split('.')
        if (parts.length >= 2) {
          return `${parts[0]}.${parts[1]}` // Return major.minor (e.g., "8.0" from "8.0.1")
        }
        return parts[0] // Return major version if no minor version
      }

      const majorVersion = getMajorVersion(config.version || dbRecord?.version || "")

      if (dbRecord?.homebrewPath) {
        // Use stored Homebrew path
        mongodPath = `${dbRecord.homebrewPath}/mongod`
        console.log(
          `[MongoDB] Using stored Homebrew path: ${dbRecord.homebrewPath}`,
        )
      } else if (majorVersion) {
        // Try to find the specific version from config
        try {
          console.log(`[MongoDB] Looking for MongoDB version ${majorVersion}...`)
          const versionPath = execSync(
            `find /opt/homebrew -path "*/mongodb-community@${majorVersion}/*" -name mongod -type f 2>/dev/null | head -1`,
            { encoding: "utf8" },
          ).trim()
          if (versionPath) {
            mongodPath = versionPath
            console.log(`[MongoDB] Found MongoDB ${majorVersion} at ${mongodPath}`)
          } else {
            throw new Error(`MongoDB ${majorVersion} not found`)
          }
        } catch (_e) {
          // Fallback to finding MongoDB binary path
          console.log(`[MongoDB] Version ${majorVersion} not found, trying any version...`)
          try {
            mongodPath = execSync("which mongod", { encoding: "utf8" }).trim()
          } catch (_e2) {
            try {
              mongodPath = execSync(
                "find /opt/homebrew -name mongod -type f 2>/dev/null | head -1",
                { encoding: "utf8" },
              ).trim()
            } catch (_e3) {
              console.error("MongoDB not found in PATH or Homebrew")
              throw new Error(
                "MongoDB not found. Please ensure it's installed via Homebrew.",
              )
            }
          }
        }
      } else {
        // No version specified, try to find any MongoDB version
        console.log(`[MongoDB] No version specified, trying to find any MongoDB version...`)
        try {
          mongodPath = execSync("which mongod", { encoding: "utf8" }).trim()
        } catch (_e) {
          try {
            mongodPath = execSync(
              "find /opt/homebrew -name mongod -type f 2>/dev/null | head -1",
              { encoding: "utf8" },
            ).trim()
          } catch (_e2) {
            console.error("MongoDB not found in PATH or Homebrew")
            throw new Error(
              "MongoDB not found. Please ensure it's installed via Homebrew.",
            )
          }
        }
      }

      // Create data directory (async)
      const fsPromises = fs.promises
      const dataDir = storage.getDatabaseDataDir(app, containerId)

      try {
        await fsPromises.mkdir(dataDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Create container-specific temp directory for MongoDB
      const tempDir = path.join(dataDir, "tmp")
      try {
        await fsPromises.mkdir(tempDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Verify MongoDB binary exists and is executable
      const fsSync = fs
      try {
        if (!fsSync.existsSync(mongodPath)) {
          throw new Error(`MongoDB binary not found at ${mongodPath}`)
        }
        // Check if file is executable (stat mode)
        const stats = fsSync.statSync(mongodPath)
        if (!stats.isFile()) {
          throw new Error(`MongoDB path exists but is not a file: ${mongodPath}`)
        }
        console.log(`[MongoDB] Verified MongoDB binary exists: ${mongodPath}`)
      } catch (error: unknown) {
        console.error(
          `[MongoDB] ${id} Error verifying MongoDB binary:`,
          (error as Error).message,
        )
        throw new Error(
          `MongoDB binary verification failed: ${(error as Error).message}`,
        )
      }

      // Verify data directory is writable
      try {
        const testFile = path.join(dataDir, ".write-test")
        fsSync.writeFileSync(testFile, "test")
        fsSync.unlinkSync(testFile)
        console.log(`[MongoDB] Verified data directory is writable: ${dataDir}`)
      } catch (error: unknown) {
        console.error(
          `[MongoDB] ${id} Data directory may not be writable:`,
          (error as Error).message,
        )
        throw new Error(
          `MongoDB data directory is not writable: ${(error as Error).message}`,
        )
      }

      // Check for and remove MongoDB lock file that might prevent startup
      // An unclean shutdown can leave a mongod.lock file preventing MongoDB from starting
      const lockFilePath = path.join(dataDir, "mongod.lock")
      if (fsSync.existsSync(lockFilePath)) {
        console.log(
          `[MongoDB] ${id} Found mongod.lock file, removing to allow startup`,
        )
        try {
          fsSync.unlinkSync(lockFilePath)
          console.log(`[MongoDB] ${id} Removed mongod.lock file`)
        } catch (error: unknown) {
          console.warn(
            `[MongoDB] ${id} Could not remove mongod.lock file:`,
            (error as Error).message,
          )
          // Continue anyway - MongoDB might handle it or we'll see the error
        }
      }

      cmd = mongodPath
      args = [
        "--port",
        port.toString(),
        "--dbpath",
        dataDir, // Store data files in database folder
        "--bind_ip",
        "127.0.0.1",
        "--logpath",
        path.join(dataDir, "mongod.log"), // Store logs in data directory
        "--logappend", // Append to log file instead of overwriting
        "--setParameter",
        "logLevel=1", // Reduce log verbosity (0=off, 1=low, 2=higher)
        // Note: --smallfiles and --noprealloc were removed in MongoDB 4.0+
        // Note: --logRotate is not a valid flag, log rotation is handled automatically
      ]
    } else if (type === "redis") {
      // Get Redis binary path from database record or find it
      const databases = storage.loadDatabases(app)
      const dbRecord = databases.find((d) => d.id === id)
      let redisPath

      // Extract major version from config version (e.g., "7.2.1" -> "7.2")
      const getMajorVersion = (version: string): string => {
        if (!version) return ""
        const parts = version.split('.')
        if (parts.length >= 2) {
          return `${parts[0]}.${parts[1]}` // Return major.minor (e.g., "7.2" from "7.2.1")
        }
        return parts[0] // Return major version if no minor version
      }

      const majorVersion = getMajorVersion(config.version || dbRecord?.version || "")

      if (dbRecord?.homebrewPath) {
        // Use stored Homebrew path
        redisPath = `${dbRecord.homebrewPath}/redis-server`
        console.log(`[Redis] Using stored Homebrew path: ${dbRecord.homebrewPath}`)
      } else if (majorVersion) {
        // Try to find the specific version from config
        // Note: Redis doesn't use versioned formulas like postgresql@16, but we can try
        try {
          console.log(`[Redis] Looking for Redis version ${majorVersion}...`)
          // Redis might be installed as redis@7.2 or just redis
          const versionPath = execSync(
            `find /opt/homebrew -path "*/redis@${majorVersion}/*" -name redis-server -type f 2>/dev/null | head -1`,
            { encoding: "utf8" },
          ).trim()
          if (versionPath) {
            redisPath = versionPath
            console.log(`[Redis] Found Redis ${majorVersion} at ${redisPath}`)
          } else {
            // Redis is usually installed as just "redis" without version suffix
            throw new Error(`Redis ${majorVersion} not found, trying default`)
          }
        } catch (_e) {
          // Fallback to finding Redis binary path
          console.log(`[Redis] Version ${majorVersion} not found, trying any version...`)
          try {
            redisPath = execSync("which redis-server", {
              encoding: "utf8",
            }).trim()
          } catch (_e2) {
            try {
              redisPath = execSync(
                "find /opt/homebrew -name redis-server -type f 2>/dev/null | head -1",
                { encoding: "utf8" },
              ).trim()
            } catch (_e3) {
              console.error("Redis not found in PATH or Homebrew")
              throw new Error(
                "Redis not found. Please ensure it's installed via Homebrew.",
              )
            }
          }
        }
      } else {
        // No version specified, try to find any Redis version
        console.log(`[Redis] No version specified, trying to find any Redis version...`)
        try {
          redisPath = execSync("which redis-server", {
            encoding: "utf8",
          }).trim()
        } catch (_e) {
          try {
            redisPath = execSync(
              "find /opt/homebrew -name redis-server -type f 2>/dev/null | head -1",
              { encoding: "utf8" },
            ).trim()
          } catch (_e2) {
            console.error("Redis not found in PATH or Homebrew")
            throw new Error(
              "Redis not found. Please ensure it's installed via Homebrew.",
            )
          }
        }
      }

      // Create data directory for Redis
      const fsPromises = fs.promises
      const redisDataDir = storage.getDatabaseDataDir(app, containerId)
      try {
        await fsPromises.mkdir(redisDataDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Use password directly from config
      const redisPassword = (password as string) || ""

      // Create container-specific temp directory for Redis
      const tempDir = path.join(redisDataDir, "tmp")
      try {
        await fsPromises.mkdir(tempDir, { recursive: true })
      } catch (_e) {
        // Directory might already exist
      }

      // Verify Redis binary exists and is executable
      const fsSync = fs
      try {
        if (!fsSync.existsSync(redisPath)) {
          throw new Error(`Redis binary not found at ${redisPath}`)
        }
        // Check if file is executable (stat mode)
        const stats = fsSync.statSync(redisPath)
        if (!stats.isFile()) {
          throw new Error(`Redis path exists but is not a file: ${redisPath}`)
        }
        console.log(`[Redis] Verified Redis binary exists: ${redisPath}`)
      } catch (error: unknown) {
        console.error(
          `[Redis] ${id} Error verifying Redis binary:`,
          (error as Error).message,
        )
        throw new Error(
          `Redis binary verification failed: ${(error as Error).message}`,
        )
      }

      // Verify data directory is writable
      try {
        const testFile = path.join(redisDataDir, ".write-test")
        fsSync.writeFileSync(testFile, "test")
        fsSync.unlinkSync(testFile)
        console.log(`[Redis] Verified data directory is writable: ${redisDataDir}`)
      } catch (error: unknown) {
        console.error(
          `[Redis] ${id} Data directory may not be writable:`,
          (error as Error).message,
        )
        throw new Error(
          `Redis data directory is not writable: ${(error as Error).message}`,
        )
      }

      // Check for and remove any existing Redis config files that might cause issues
      // Redis 8.2+ has issues with paths containing spaces in config files
      // We must remove all config files to prevent Redis from auto-discovering them
      const possibleConfigFiles = [
        path.join(redisDataDir, "redis.conf"),
        path.join(redisDataDir, "redis-server.conf"),
        path.join(redisDataDir, ".redis.conf"),
        path.join(redisDataDir, "redis.conf.bak"),
        path.join(redisDataDir, "redis.conf.tmp"),
      ]
      for (const configFile of possibleConfigFiles) {
        if (fsSync.existsSync(configFile)) {
          console.log(
            `[Redis] ${id} Found existing config file ${configFile}, removing to avoid conflicts`,
          )
          try {
            fsSync.unlinkSync(configFile)
            console.log(`[Redis] ${id} Removed config file ${configFile}`)
          } catch (error: unknown) {
            console.warn(
              `[Redis] ${id} Could not remove config file ${configFile}:`,
              (error as Error).message,
            )
          }
        }
      }

      // Check for Homebrew default config file that might cause issues
      const homebrewConfigPath = "/opt/homebrew/etc/redis.conf"
      if (fsSync.existsSync(homebrewConfigPath)) {
        console.log(
          `[Redis] ${id} Warning: Homebrew default config found at ${homebrewConfigPath}`,
        )
        console.log(
          `[Redis] ${id} Using command-line arguments to override any config file settings`,
        )
      }

      // Use command-line arguments instead of config file to avoid path-with-spaces issues
      // Redis 8.2+ has issues with paths containing spaces in config files
      // Command-line arguments should override any default config file settings
      // We explicitly avoid using config files and rely on command-line args only
      cmd = redisPath
      args = [
        "--port",
        port.toString(),
        "--bind",
        "127.0.0.1",
        "--dir",
        redisDataDir, // Command-line args handle spaces better than config files
        "--dbfilename",
        `dump-${containerId}.rdb`,
        "--save",
        "900",
        "1",
        "--save",
        "300",
        "10",
        "--save",
        "60",
        "10000",
        "--maxmemory",
        "512mb",
        "--maxmemory-policy",
        "allkeys-lru",
        "--appendonly",
        "no", // Disable AOF to avoid conflicts
      ]

      // Add password if provided
      if (redisPassword && redisPassword.trim() !== "") {
        args.push("--requirepass", redisPassword)
        console.log(`[Redis] ${id} Starting with password authentication`)
      }

      // Final check: remove any config files that might have been created between checks
      // This prevents race conditions where config files might be created after cleanup
      for (const configFile of possibleConfigFiles) {
        if (fsSync.existsSync(configFile)) {
          console.log(
            `[Redis] ${id} Final check: Found config file ${configFile}, removing immediately`,
          )
          try {
            fsSync.unlinkSync(configFile)
            console.log(
              `[Redis] ${id} Removed config file ${configFile} (final check)`,
            )
          } catch (error: unknown) {
            console.warn(
              `[Redis] ${id} Could not remove config file ${configFile} in final check:`,
              (error as Error).message,
            )
          }
        }
      }

      // Log the actual args being used to verify no config file path is included
      console.log(
        `[Redis] ${id} Starting Redis with command-line args (no config file)`,
      )
      console.log(`[Redis] ${id} Command: ${cmd}`)
      console.log(`[Redis] ${id} Args: ${JSON.stringify(args)}`)

      // For Redis: Final safety check - ensure no config file path is in args
      if (type === "redis") {
        // Verify args doesn't contain any config file paths
        const argsString = JSON.stringify(args)
        if (argsString.includes("redis.conf") || argsString.includes(".conf")) {
          console.error(
            `[Redis] ${id} ERROR: Config file path found in args! This should not happen.`,
          )
          console.error(`[Redis] ${id} Args: ${argsString}`)
          // Remove any config file references from args
          args = args.filter(
            (arg) => !arg.includes("redis.conf") && !arg.endsWith(".conf"),
          )
          console.log(`[Redis] ${id} Cleaned args: ${JSON.stringify(args)}`)
        }

        // One more final check to remove config file just before spawning
        const redisDataDir = storage.getDatabaseDataDir(app, containerId)
        const configFilePath = path.join(redisDataDir, "redis.conf")
        if (fsSync.existsSync(configFilePath)) {
          console.log(
            `[Redis] ${id} CRITICAL: Config file exists right before spawn, removing now`,
          )
          try {
            fsSync.unlinkSync(configFilePath)
            console.log(
              `[Redis] ${id} Successfully removed config file ${configFilePath}`,
            )
          } catch (error: unknown) {
            console.error(
              `[Redis] ${id} Failed to remove config file: ${
                (error as Error).message
              }`,
            )
            // Even if we can't delete it, we should not pass it to Redis
            throw new Error(
              `Cannot start Redis with existing config file: ${
                (error as Error).message
              }`,
            )
          }
        }
      }
    }

    // Ensure temp directory exists right before starting the process (for MySQL and PostgreSQL)
    if (type === "mysql" || type === "postgresql") {
      try {
        const fsPromises = fs.promises
        const tempDir = path.join(
          storage.getDatabaseDataDir(app, containerId),
          "tmp",
        )
        await fsPromises.mkdir(tempDir, { recursive: true })
        console.log(`[${type}] Ensured temp directory exists before start: ${tempDir}`)
      } catch (e: unknown) {
        console.warn(
          `[${type}] Could not ensure temp directory exists:`,
          (e as Error).message,
        )
      }
    }

    // Use stdio: "pipe" to prevent terminal interactions (password prompts, etc.)
    // For Redis, ensure we're not starting from a directory with config files
    const spawnOptions: {
      env: NodeJS.ProcessEnv
      detached: boolean
      stdio: ("ignore" | "pipe")[]
      cwd?: string
    } = {
      env,
      detached: false,
      stdio: ["ignore", "pipe", "pipe"], // stdin=ignore, stdout=pipe, stderr=pipe
    }

    // For Redis, set working directory to a safe location (not the data directory)
    // This prevents Redis from auto-discovering config files in the data directory
    if (type === "redis") {
      // Use a temp directory or system temp to avoid config file auto-discovery
      spawnOptions.cwd = os.tmpdir()
      console.log(
        `[Redis] ${id} Starting Redis from ${spawnOptions.cwd} to avoid config file auto-discovery`,
      )
    }

    // Ensure cmd and args are defined before spawning
    if (!cmd || !args) {
      throw new Error(
        `Failed to initialize ${type} database: cmd or args not defined`,
      )
    }

    const child: ChildProcess = spawn(cmd, args, spawnOptions)

    // Track startup status for PostgreSQL
    let isStartupComplete = false
    let startupTimeout: NodeJS.Timeout | null = null
    let readyEventSent = false // Flag to prevent duplicate events
    let stoppedEventSent = false // Flag to prevent duplicate stopped events
    let mongodbStatusTimeout: NodeJS.Timeout | null = null
    let redisStatusTimeout: NodeJS.Timeout | null = null
    
    // Capture error output for better error messages
    let errorOutput: string[] = []
    let stderrOutput: string[] = []

    // For PostgreSQL, listen for "ready to accept connections" message
    if (type === "postgresql") {
      const sendReadyEvent = () => {
        if (!readyEventSent && mainWindow) {
          readyEventSent = true
          console.log(
            `[PostgreSQL] ${id} sending ready event (readyEventSent: ${readyEventSent})`,
          )

          // Update status to running in storage
          try {
            const databases = storage.loadDatabases(app)
            const dbIndex = databases.findIndex((db) => db.id === id)
            if (dbIndex >= 0) {
              databases[dbIndex].status = "running"
              databases[dbIndex].pid = child.pid
              storage.saveDatabases(app, databases)
              console.log(`[Database] ${id} status updated to running in storage`)
            }
          } catch (error) {
            console.error(
              `[Database] ${id} failed to update status to running in storage:`,
              error,
            )
          }

          console.log(`[Database] ${id} Sending database-status-changed event to frontend:`, {
            id,
            status: "running",
            ready: true,
            pid: child.pid,
          })
          
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("database-status-changed", {
              id,
              status: "running",
              ready: true,
              pid: child.pid,
            })
            console.log(`[Database] ${id} Event sent successfully`)
          } else {
            console.error(`[Database] ${id} Cannot send event - mainWindow is null or destroyed`)
          }

          // Configure PostgreSQL with custom username, password, and database name
          setTimeout(async () => {
            try {
              await configurePostgreSQL(config, app)
            } catch (configError: unknown) {
              console.error(
                `[PostgreSQL] ${id} Failed to configure:`,
                (configError as Error).message,
              )
            }
          }, 3000)
        } else {
          console.log(
            `[PostgreSQL] ${id} ready event already sent or no mainWindow (readyEventSent: ${readyEventSent}, mainWindow: ${!!mainWindow})`,
          )
        }
      }

      child.stdout!.on("data", (data: Buffer) => {
        const output = data.toString()
        console.log(`[PostgreSQL] ${id} output:`, output.trim())

        // Check for PostgreSQL ready message
        if (
          output.includes("ready to accept connections") ||
          output.includes("database system is ready to accept connections")
        ) {
          console.log(`[PostgreSQL] ${id} is ready to accept connections`)
          isStartupComplete = true
          if (startupTimeout) {
            clearTimeout(startupTimeout)
            startupTimeout = null
          }
          sendReadyEvent()
        }
      })

      child.stderr!.on("data", (data: Buffer) => {
        const output = data.toString()
        const trimmedOutput = output.trim()
        
        // Capture error output for better error messages
        stderrOutput.push(trimmedOutput)

        // Filter out routine checkpoint logs (they're informational, not errors)
        const isCheckpointLog =
          trimmedOutput.includes("checkpoint starting:") ||
          trimmedOutput.includes("checkpoint complete:")

        // Only log non-checkpoint messages or actual errors
        if (!isCheckpointLog) {
          // Check if it's an actual error (contains ERROR, FATAL, PANIC)
          const isError = /ERROR|FATAL|PANIC/i.test(trimmedOutput)
          if (isError) {
            console.error(`[PostgreSQL] ${id} error:`, trimmedOutput)
            errorOutput.push(trimmedOutput)
          } else {
            console.log(`[PostgreSQL] ${id} output:`, trimmedOutput)
          }
        }

        // Check for PostgreSQL ready message in stderr too
        if (
          output.includes("ready to accept connections") ||
          output.includes("database system is ready to accept connections")
        ) {
          console.log(
            `[PostgreSQL] ${id} is ready to accept connections (from stderr)`,
          )
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
          console.log(
            `[MySQL] ${id} sending ready event (readyEventSent: ${readyEventSent})`,
          )

          // Update status to running in storage
          try {
            const databases = storage.loadDatabases(app)
            const dbIndex = databases.findIndex((db) => db.id === id)
            if (dbIndex >= 0) {
              databases[dbIndex].status = "running"
              databases[dbIndex].pid = child.pid
              storage.saveDatabases(app, databases)
              console.log(`[Database] ${id} status updated to running in storage`)
            }
          } catch (error: unknown) {
            console.error(
              `[Database] ${id} failed to update status to running in storage:`,
              error,
            )
          }

          mainWindow.webContents.send("database-status-changed", {
            id,
            status: "running",
            ready: true,
            pid: child.pid,
          })

          // Configure MySQL with custom username, password, and database name
          setTimeout(async () => {
            try {
              await configureMySQL(config, app)
            } catch (configError: unknown) {
              console.error(
                `[MySQL] ${id} Failed to configure:`,
                (configError as Error).message,
              )
            }
          }, 4000)
        } else {
          console.log(
            `[MySQL] ${id} ready event already sent or no mainWindow (readyEventSent: ${readyEventSent}, mainWindow: ${!!mainWindow})`,
          )
        }
      }

      child.stdout!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          console.log(`[MySQL] ${id} output:`, output.trim())

          // Check for MySQL ready message
          if (
            output.includes("ready for connections") ||
            output.includes("ready to accept connections") ||
            output.includes("mysqld: ready for connections")
          ) {
            console.log(`[MySQL] ${id} is ready for connections`)
            isStartupComplete = true
            if (startupTimeout) {
              clearTimeout(startupTimeout)
              startupTimeout = null
            }
            sendReadyEvent()
          }
        } catch (error: unknown) {
          console.error(`[MySQL] ${id} Error in stdout handler:`, error)
          // Don't crash, just log the error
        }
      })

      child.stderr!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          const trimmedOutput = output.trim()
          
          // Capture error output for better error messages
          stderrOutput.push(trimmedOutput)
          
          // Check if it's an actual error
          const isError = /ERROR|FATAL|error|fatal/i.test(trimmedOutput)
          if (isError) {
            console.error(`[MySQL] ${id} error:`, trimmedOutput)
            errorOutput.push(trimmedOutput)
          } else {
            console.log(`[MySQL] ${id} output:`, trimmedOutput)
          }

          // Check for MySQL ready message in stderr too
          if (
            output.includes("ready for connections") ||
            output.includes("ready to accept connections") ||
            output.includes("mysqld: ready for connections")
          ) {
            console.log(`[MySQL] ${id} is ready for connections (from stderr)`)
            isStartupComplete = true
            if (startupTimeout) {
              clearTimeout(startupTimeout)
              startupTimeout = null
            }
            sendReadyEvent()
          }
        } catch (error: unknown) {
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
      // Log MongoDB output for debugging
      child.stdout!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          console.log(`[MongoDB] ${id} output:`, output.trim())
        } catch (error: unknown) {
          console.error(`[MongoDB] ${id} Error in stdout handler:`, error)
        }
      })

      child.stderr!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          const trimmedOutput = output.trim()
          
          // Capture error output for better error messages
          stderrOutput.push(trimmedOutput)

          // Check if it's an actual error (contains ERROR, FATAL, or critical messages)
          const isError =
            /ERROR|FATAL|error|fatal|exception|Assertion/i.test(trimmedOutput)
          if (isError) {
            console.error(`[MongoDB] ${id} error output:`, trimmedOutput)
            errorOutput.push(trimmedOutput)
          } else {
            console.log(`[MongoDB] ${id} output:`, trimmedOutput)
          }
        } catch (error: unknown) {
          console.error(`[MongoDB] ${id} Error in stderr handler:`, error)
        }
      })

      // For MongoDB, mark as running after a short delay and configure
      mongodbStatusTimeout = setTimeout(async () => {
        // Check if process is still running before setting status to running
        if (child.killed || child.exitCode !== null) {
          console.log(
            `[Database] ${id} process already exited, not setting status to running (MongoDB)`,
          )
          console.error(`[MongoDB] ${id} MongoDB failed to start. Common causes:`)
          console.error(`[MongoDB] ${id} - Port ${port} may already be in use`)
          console.error(
            `[MongoDB] ${id} - Data directory may have permission issues`,
          )
          console.error(`[MongoDB] ${id} - Invalid configuration arguments`)
          console.error(
            `[MongoDB] ${id} - Check for mongod.lock file in data directory`,
          )
          console.error(`[MongoDB] ${id} Check the error output above for details.`)
          return
        }

        // Check if still in runningDatabases map
        if (!runningDatabases.has(id)) {
          console.log(
            `[Database] ${id} not in running databases map, not setting status to running (MongoDB)`,
          )
          return
        }

        try {
          const databases = storage.loadDatabases(app)
          const dbIndex = databases.findIndex((db) => db.id === id)
          if (dbIndex >= 0) {
            databases[dbIndex].status = "running"
            databases[dbIndex].pid = child.pid
            storage.saveDatabases(app, databases)
            console.log(
              `[Database] ${id} status updated to running in storage (MongoDB)`,
            )
          }

          if (mainWindow) {
            mainWindow.webContents.send("database-status-changed", {
              id,
              status: "running",
              ready: true,
              pid: child.pid,
            })
          }

          // Configure MongoDB with custom username, password, and database name
          setTimeout(async () => {
            try {
              await configureMongoDB(config, app)
            } catch (configError: unknown) {
              console.error(
                `[MongoDB] ${id} Failed to configure:`,
                (configError as Error).message,
              )
            }
          }, 3000)
        } catch (error: unknown) {
          console.error(
            `[Database] ${id} failed to update status to running in storage:`,
            error,
          )
        }
      }, 2000)
    } else if (type === "redis") {
      // For Redis, mark as running after a short delay and configure
      redisStatusTimeout = setTimeout(async () => {
        // Check if process is still running before setting status to running
        if (child.killed || child.exitCode !== null) {
          console.error(
            `[Database] ${id} process already exited, not setting status to running (Redis)`,
          )
          // Notify frontend that Redis failed to start
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("database-status-changed", {
              id,
              status: "stopped",
              error: "Redis process exited immediately after start",
              pid: null,
            })
          }
          // Update storage
          try {
            const databases = storage.loadDatabases(app)
            const dbIndex = databases.findIndex((db) => db.id === id)
            if (dbIndex >= 0) {
              databases[dbIndex].status = "stopped"
              databases[dbIndex].pid = null
              databases[dbIndex].lastStarted = undefined
              storage.saveDatabases(app, databases)
            }
          } catch (error: unknown) {
            console.error(`[Database] ${id} failed to update storage:`, error)
          }
          return
        }

        // Check if still in runningDatabases map
        if (!runningDatabases.has(id)) {
          console.log(
            `[Database] ${id} not in running databases map, not setting status to running (Redis)`,
          )
          return
        }

        try {
          const databases = storage.loadDatabases(app)
          const dbIndex = databases.findIndex((db) => db.id === id)
          if (dbIndex >= 0) {
            databases[dbIndex].status = "running"
            databases[dbIndex].pid = child.pid
            storage.saveDatabases(app, databases)
            console.log(
              `[Database] ${id} status updated to running in storage (Redis)`,
            )
          }

          if (mainWindow) {
            mainWindow.webContents.send("database-status-changed", {
              id,
              status: "running",
              ready: true,
              pid: child.pid,
            })
          }

          // Configure Redis with custom password
          setTimeout(async () => {
            try {
              await configureRedis(config, app)
            } catch (configError: unknown) {
              console.error(
                `[Redis] ${id} Failed to configure:`,
                (configError as Error).message,
              )
            }
          }, 2000)
        } catch (error: unknown) {
          console.error(
            `[Database] ${id} failed to update status to running in storage:`,
            error,
          )
        }
      }, 1000)

      // Log Redis output for debugging
      child.stdout!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          console.log(`[Redis] ${id} output:`, output.trim())
        } catch (error: unknown) {
          console.error(`[Redis] ${id} Error in stdout handler:`, error)
        }
      })

      child.stderr!.on("data", (data: Buffer) => {
        try {
          const output = data.toString()
          const trimmedOutput = output.trim()
          
          // Capture error output for better error messages
          stderrOutput.push(trimmedOutput)
          errorOutput.push(trimmedOutput)
          
          console.error(`[Redis] ${id} error output:`, trimmedOutput)
        } catch (error: unknown) {
          console.error(`[Redis] ${id} Error in stderr handler:`, error)
        }
      })
    } else {
      // For other databases, mark as running immediately
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex((db) => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = "running"
          databases[dbIndex].pid = child.pid
          storage.saveDatabases(app, databases)
          console.log(`[Database] ${id} status updated to running in storage`)
        }
      } catch (error: unknown) {
        console.error(
          `[Database] ${id} failed to update status to running in storage:`,
          error,
        )
      }
    }

    child.on("error", (err: Error) => {
      try {
        console.error(`[Database] ${id} error:`, err)
        runningDatabases.delete(id)
        if (startupTimeout) {
          clearTimeout(startupTimeout)
          startupTimeout = null
        }
        if (mongodbStatusTimeout) {
          clearTimeout(mongodbStatusTimeout)
          mongodbStatusTimeout = null
        }
        if (redisStatusTimeout) {
          clearTimeout(redisStatusTimeout)
          redisStatusTimeout = null
        }

        // Build a more helpful error message
        let errorMessage = err.message
        if (err.message.includes("ENOENT") || err.message.includes("not found")) {
          errorMessage = `${type} binary not found. Please ensure ${type} is installed via Homebrew.`
        } else if (err.message.includes("EACCES") || err.message.includes("permission")) {
          errorMessage = `Permission denied. Please check your system permissions.`
        } else if (err.message.includes("EADDRINUSE") || err.message.includes("port")) {
          errorMessage = `Port ${port} is already in use. Please choose a different port.`
        }

        // Update database in storage to clear PID, update status, and clear lastStarted timestamp
        try {
          const databases = storage.loadDatabases(app)
          const dbIndex = databases.findIndex((db) => db.id === id)
          if (dbIndex >= 0) {
            databases[dbIndex].status = "stopped"
            databases[dbIndex].pid = null
            databases[dbIndex].lastStarted = undefined // Clear lastStarted to allow fresh start
            storage.saveDatabases(app, databases)
            console.log(`[Database] ${id} status updated to stopped in storage`)
          }
        } catch (error: unknown) {
          console.error(`[Database] ${id} failed to update storage:`, error)
        }

        // Notify the renderer process that the database has stopped
        if (mainWindow && !mainWindow.isDestroyed() && !stoppedEventSent) {
          stoppedEventSent = true
          mainWindow.webContents.send("database-status-changed", {
            id,
            status: "stopped",
            error: errorMessage,
            pid: null,
          })
        }
      } catch (error: unknown) {
        console.error(`[Database] ${id} Error in error handler:`, error)
        // Don't let error handler errors crash the app
      }
    })

    child.on("exit", (code: number | null) => {
      console.log(`[Database] ${id} exited with code ${code}`)

      // Build error message from captured output
      let errorMessage: string | undefined = undefined
      
      // Log additional error information for non-zero exit codes
      if (code !== 0 && code !== null) {
        console.error(
          `[Database] ${id} exited with non-zero code ${code}. This usually indicates an error.`,
        )
        
        // Extract meaningful error message from captured output
        if (errorOutput.length > 0) {
          // Use the last few error lines (most recent errors are usually most relevant)
          const recentErrors = errorOutput.slice(-3).join("; ")
          errorMessage = recentErrors.length > 200 ? recentErrors.substring(0, 200) + "..." : recentErrors
        } else if (stderrOutput.length > 0) {
          // If no explicit errors, use stderr output
          const recentStderr = stderrOutput.slice(-3).join("; ")
          errorMessage = recentStderr.length > 200 ? recentStderr.substring(0, 200) + "..." : recentStderr
        } else {
          // Generate a helpful error message based on database type
          if (type === "postgresql") {
            errorMessage = `PostgreSQL failed to start. Common causes: Port ${port} may be in use, data directory issues, or initialization failed.`
          } else if (type === "mysql") {
            errorMessage = `MySQL failed to start. Common causes: Port ${port} may be in use, data directory issues, or initialization failed.`
          } else if (type === "mongodb") {
            errorMessage = `MongoDB failed to start. Common causes: Port ${port} may be in use, data directory issues, or mongod.lock file exists.`
          } else if (type === "redis") {
            errorMessage = `Redis failed to start. Common causes: Port ${port} may be in use, data directory issues, or invalid configuration.`
          } else {
            errorMessage = `Database failed to start with exit code ${code}`
          }
        }
        
        // Log detailed error information
        if (type === "postgresql") {
          console.error(`[PostgreSQL] ${id} PostgreSQL failed to start. Common causes:`)
          console.error(`[PostgreSQL] ${id} - Port ${port} may already be in use`)
          console.error(`[PostgreSQL] ${id} - Data directory may have permission issues`)
          console.error(`[PostgreSQL] ${id} - Database initialization may have failed`)
          if (errorMessage) {
            console.error(`[PostgreSQL] ${id} Error details: ${errorMessage}`)
          }
        } else if (type === "mysql") {
          console.error(`[MySQL] ${id} MySQL failed to start. Common causes:`)
          console.error(`[MySQL] ${id} - Port ${port} may already be in use`)
          console.error(`[MySQL] ${id} - Data directory may have permission issues`)
          console.error(`[MySQL] ${id} - Database initialization may have failed`)
          if (errorMessage) {
            console.error(`[MySQL] ${id} Error details: ${errorMessage}`)
          }
        } else if (type === "mongodb") {
          console.error(`[MongoDB] ${id} MongoDB failed to start. Common causes:`)
          console.error(`[MongoDB] ${id} - Port ${port} may already be in use`)
          console.error(
            `[MongoDB] ${id} - Data directory may have permission issues`,
          )
          console.error(`[MongoDB] ${id} - Invalid configuration arguments`)
          console.error(
            `[MongoDB] ${id} - Check for mongod.lock file in data directory (may need repair)`,
          )
          if (errorMessage) {
            console.error(`[MongoDB] ${id} Error details: ${errorMessage}`)
          }
        } else if (type === "redis") {
          console.error(`[Redis] ${id} Redis failed to start. Common causes:`)
          console.error(`[Redis] ${id} - Port ${port} may already be in use`)
          console.error(
            `[Redis] ${id} - Data directory may have permission issues`,
          )
          console.error(`[Redis] ${id} - Invalid configuration arguments`)
          if (errorMessage) {
            console.error(`[Redis] ${id} Error details: ${errorMessage}`)
          }
        }
      }

      runningDatabases.delete(id)
      if (startupTimeout) {
        clearTimeout(startupTimeout)
        startupTimeout = null
      }
      if (mongodbStatusTimeout) {
        clearTimeout(mongodbStatusTimeout)
        mongodbStatusTimeout = null
      }
      if (redisStatusTimeout) {
        clearTimeout(redisStatusTimeout)
        redisStatusTimeout = null
      }

      // Update database in storage to clear PID, update status, and clear lastStarted timestamp
      try {
        const databases = storage.loadDatabases(app)
        const dbIndex = databases.findIndex((db) => db.id === id)
        if (dbIndex >= 0) {
          databases[dbIndex].status = "stopped"
          databases[dbIndex].pid = null
          databases[dbIndex].lastStarted = undefined // Clear lastStarted to allow fresh start
          storage.saveDatabases(app, databases)
          console.log(`[Database] ${id} status updated to stopped in storage`)
        }
      } catch (error: unknown) {
        console.error(`[Database] ${id} failed to update storage:`, error)
      }

      // Notify the renderer process that the database has stopped
      if (mainWindow && !stoppedEventSent) {
        stoppedEventSent = true
        mainWindow.webContents.send("database-status-changed", {
          id,
          status: "stopped",
          exitCode: code,
          error: errorMessage || (code !== 0 && code !== null ? `Process exited with code ${code}` : undefined),
          pid: null,
        })
      }
    })

    // Add to running map immediately - we'll let the process events handle cleanup
    runningDatabases.set(id, {
      process: child,
      config,
      isStartupComplete: () => isStartupComplete,
    })
    console.log(`[Database] ${type} database process started (PID: ${child.pid})`)

    // Save PID and starting status to storage
    try {
      const databases = storage.loadDatabases(app)
      const dbIndex = databases.findIndex((db) => db.id === id)
      if (dbIndex >= 0) {
        databases[dbIndex].status = "starting"
        databases[dbIndex].pid = child.pid
        databases[dbIndex].lastStarted = Date.now() // Set start timestamp
        storage.saveDatabases(app, databases)
        console.log(
          `[Database] ${id} PID ${child.pid}, starting status, and start time saved to storage`,
        )
      }
    } catch (error: unknown) {
      console.error(`[Database] ${id} failed to save PID to storage:`, error)
    }

    // Notify the renderer process that the database is starting
    if (mainWindow) {
      mainWindow.webContents.send("database-status-changed", {
        id,
        status: "starting",
        pid: child.pid,
      })
      console.log(`[Database] ${id} starting status sent to frontend`)
    }

    // Return success result for auto-start functionality
    return { success: true }
  } catch (error: unknown) {
    console.error(`[Database] ${id} failed to start:`, error)
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Check database status
 * @param {string} id - Database ID
 * @returns {Promise<object>} - Status object
 */
export async function checkDatabaseStatus(
  id: string,
): Promise<{ status: string; pid?: number }> {
  const runningDatabases = sharedState.getRunningDatabases()

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
    if (
      db.config.type === "postgresql" &&
      db.isStartupComplete &&
      !db.isStartupComplete()
    ) {
      log.debug(`Database ${id} is starting (PostgreSQL not ready yet)`)
      return { status: "starting", pid: db.process.pid }
    }

    // 4. Simple process check - if it exists and isn't killed, it's running
    log.debug(`Database ${id} is running (PID: ${db.process.pid})`)
    return { status: "running", pid: db.process.pid }
  } catch (error: unknown) {
    log.error(`Error checking ${id}: ${(error as Error).message}`)
    return { status: "stopped" }
  }
}

/**
 * Gracefully stop a database process
 * @param {object} db - Database process object
 * @param {object} config - Database configuration
 * @param {object} app - Electron app instance
 * @returns {Promise<boolean>} - True if successful
 */
export async function stopDatabaseProcessGracefully(
  db: { process: ChildProcess; config: IDatabase },
  config: IDatabase,
  app: Electron.App,
): Promise<boolean> {
  const { id, type, port, password } = config
  const { process } = db

  try {
    // For Redis, try graceful shutdown using redis-cli SHUTDOWN SAVE first
    if (type === "redis") {
      try {
        const databases = storage.loadDatabases(app)
        const dbRecord = databases.find((d) => d.id === id)
        if (dbRecord?.homebrewPath && dbRecord?.port) {
          const redisCliPath = `${dbRecord.homebrewPath}/redis-cli`
          let redisCliCmd = redisCliPath
          try {
            if (!fs.existsSync(redisCliPath)) {
              try {
                redisCliCmd = execSync("which redis-cli", { encoding: "utf8" }).trim()
              } catch {
                redisCliCmd = "redis-cli"
              }
            }
          } catch {
            // ignore
          }

          const env: NodeJS.ProcessEnv = {
            ...global.process.env,
            PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${global.process.env.PATH}`,
            HOMEBREW_PREFIX: "/opt/homebrew",
          }

          // Try graceful shutdown with redis-cli
          try {
            const actualPassword = (password || "") as string
            if (actualPassword && actualPassword.trim() !== "") {
              execSync(
                `${redisCliCmd} -h localhost -p ${dbRecord.port} -a "${actualPassword}" SHUTDOWN SAVE`,
                {
                  env,
                  stdio: "pipe",
                  timeout: 5000,
                },
              )
            } else {
              execSync(`${redisCliCmd} -h localhost -p ${dbRecord.port} SHUTDOWN SAVE`, {
                env,
                stdio: "pipe",
                timeout: 5000,
              })
            }
            console.log(`[Redis] ${id} Gracefully shut down using redis-cli SHUTDOWN SAVE`)
          } catch (shutdownError: unknown) {
            // If redis-cli fails, fall back to SIGTERM
            console.log(
              `[Redis] ${id} redis-cli shutdown failed, using SIGTERM:`,
              (shutdownError as Error).message,
            )
            process.kill("SIGTERM")
          }
        } else {
          // Fall back to SIGTERM if we can't use redis-cli
          process.kill("SIGTERM")
        }
      } catch (error: unknown) {
        // Fall back to SIGTERM if anything fails
        console.log(
          `[Redis] ${id} Error during graceful shutdown, using SIGTERM:`,
          (error as Error).message,
        )
        process.kill("SIGTERM")
      }
    } else {
      // For other databases, use SIGTERM
      process.kill("SIGTERM")
    }

    // Wait for process to exit gracefully (max 2 seconds for faster shutdown)
    const maxWaitTime = 2000 // 2 seconds (reduced from 10 for faster shutdown)
    const checkInterval = 100 // Check every 100ms
    let waited = 0

    while (waited < maxWaitTime) {
      if (process.killed || process.exitCode !== null) {
        console.log(`[Database] ${id} Process exited gracefully after ${waited}ms`)
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval))
      waited += checkInterval
    }

    // If process is still running, force kill it
    if (!process.killed && process.exitCode === null) {
      console.log(`[Database] ${id} Process did not exit gracefully, force killing with SIGKILL`)
      try {
        process.kill("SIGKILL")
        // Wait a bit more for SIGKILL to take effect (reduced from 500ms)
        await new Promise((resolve) => setTimeout(resolve, 200))
        return true
      } catch (killError: unknown) {
        console.error(`[Database] ${id} Error force killing process:`, killError)
        return false
      }
    }

    return true
  } catch (error: unknown) {
    console.error(`[Database] ${id} Error stopping process gracefully:`, error)
    return false
  }
}

/**
 * Kill process by PID
 * @param {number} pid - Process ID
 * @param {string} signal - Signal to send (default: SIGTERM)
 * @returns {Promise<boolean>} - True if successful
 */
export async function killProcessByPid(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<boolean> {
  return new Promise((resolve) => {
    // Validate PID is a valid number
    if (pid === null || pid === undefined || typeof pid !== "number" || isNaN(pid)) {
      console.log(`[Kill] Invalid PID: ${pid}, skipping`)
      resolve(false)
      return
    }

    try {
      process.kill(pid, signal)
      console.log(`[Kill] Sent ${signal} to PID ${pid}`)
      resolve(true)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        // Process doesn't exist
        console.log(`[Kill] Process ${pid} doesn't exist`)
        resolve(false)
      } else {
        console.error(`[Kill] Error killing process ${pid}:`, error)
        resolve(false)
      }
    }
  })
}

/**
 * Kill all database processes
 * @param {object} app - Electron app instance
 * @returns {Promise<void>}
 */
let lastKillAllCallTime = 0
let isKillingInProgress = false
const KILL_ALL_THROTTLE_MS = 5000 // Throttle to once every 5 seconds

export async function killAllDatabaseProcesses(
  app: Electron.App | null,
): Promise<void> {
  // Throttle calls to prevent resource exhaustion from multiple simultaneous calls
  const now = Date.now()
  if (isKillingInProgress || (now - lastKillAllCallTime) < KILL_ALL_THROTTLE_MS) {
    console.log('[Kill] Throttling killAllDatabaseProcesses call to prevent resource exhaustion')
    return
  }
  
  isKillingInProgress = true
  lastKillAllCallTime = now
  
  try {
    const runningDatabases = sharedState.getRunningDatabases()
    const killedPids = new Set()

  // First, kill processes in runningDatabases map
  for (const [id, db] of runningDatabases) {
    try {
      const pid = db.process.pid
      if (pid && !killedPids.has(pid)) {
        console.log(
          `[Kill] Killing database ${id} (PID: ${pid}) from runningDatabases`,
        )
        db.process.kill("SIGTERM")
        killedPids.add(pid)
      }
    } catch (error) {
      console.error(`[Kill] Error killing database ${id}:`, error)
    }
  }

  // Also check storage for PIDs that might not be in runningDatabases (orphaned processes)
  // Skip if app is not available (e.g., in MCP mode during cleanup)
  if (app) {
    try {
      const databases = storage.loadDatabases(app)
      for (const db of databases) {
        // Check that pid is a valid number (not null, undefined, or NaN)
        if (
          db.pid !== null &&
          db.pid !== undefined &&
          typeof db.pid === "number" &&
          !isNaN(db.pid) &&
          !killedPids.has(db.pid)
        ) {
          console.log(
            `[Kill] Killing orphaned database ${db.id} (PID: ${db.pid}) from storage`,
          )
          await killProcessByPid(db.pid, "SIGTERM")
          killedPids.add(db.pid)
        } else if (db.pid === null || db.pid === undefined) {
          console.log(
            `[Kill] Skipping orphaned database ${db.id} (PID: ${db.pid}) from storage - no valid PID`,
          )
        }
      }
    } catch (error) {
      console.error(`[Kill] Error killing processes from storage:`, error)
    }
  }

  // Scan for ALL database processes that might be orphaned (not tracked anywhere)
  // Only kill processes that belong to our app (verify by checking command line contains our data directory)
  // Skip if app is not available (e.g., in MCP mode during cleanup)
  if (app) {
    try {
      const appDataDir = app.getPath("userData") // e.g., ~/Library/Application Support/LiquiDB
      const databasesDir = path.join(appDataDir, "databases")

      const databaseProcessNames = [
        "mysqld",
        "postgres",
        "mongod",
        "redis-server",
      ]
      for (const processName of databaseProcessNames) {
        try {
          const output = execSync(`pgrep -f "${processName}"`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          })
          const pids = output
            .trim()
            .split("\n")
            .filter((pid) => pid.length > 0)

          for (const pidStr of pids) {
            const pid = parseInt(pidStr)
            if (!isNaN(pid) && !killedPids.has(pid)) {
              // Check if this PID matches any known database
              const databases = storage.loadDatabases(app)
              const isKnownProcess =
                databases.some((db) => db.pid === pid) ||
                Array.from(runningDatabases.values()).some(
                  (db) => db.process.pid === pid,
                )

              if (!isKnownProcess) {
                // Verify this process belongs to our app by checking its command line
                try {
                  // Add small delay between execSync calls to prevent EAGAIN errors (reduced from 200ms)
                  await new Promise((resolve) => setTimeout(resolve, 50))

                  const psOutput = execSync(`ps -p ${pid} -o command=`, {
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "ignore"],
                    timeout: 3000,
                  })
                  const command = psOutput.trim()

                  // Check if command line contains our app's data directory
                  const belongsToApp =
                    command.includes(appDataDir) || command.includes(databasesDir)

                  if (belongsToApp) {
                    // This is a truly orphaned process that belongs to our app - kill it
                    console.log(
                      `[Kill] Found orphaned ${processName} process (PID: ${pid}) belonging to app, killing it`,
                    )
                    console.log(`[Kill] Command: ${command.substring(0, 200)}`)
                    await killProcessByPid(pid, "SIGTERM")
                    killedPids.add(pid)
                    // Add small delay after killing to prevent resource exhaustion (reduced from 300ms)
                    await new Promise((resolve) => setTimeout(resolve, 100))
                  } else {
                    // This process doesn't belong to our app - leave it alone
                    console.log(
                      `[Kill] Found ${processName} process (PID: ${pid}) but it doesn't belong to our app, skipping`,
                    )
                  }
                } catch (psError: unknown) {
                  // Handle EAGAIN errors gracefully
                  if (
                    (psError as NodeJS.ErrnoException).code === "EAGAIN" ||
                    (psError as NodeJS.ErrnoException).errno === -35 ||
                    (psError as NodeJS.ErrnoException).code === "ETIMEDOUT"
                  ) {
                    // Skip this PID immediately to prevent further resource exhaustion
                    // Don't log to reduce noise
                    continue
                  }
                  // Process might have died between pgrep and ps, or we can't read it - skip
                  console.log(
                    `[Kill] Could not verify process ${pid} belongs to app, skipping:`,
                    (psError as Error).message,
                  )
                }
              }
            }
          }
        } catch (_error: unknown) {
          // No processes found for this type, or pgrep failed - continue
        }
      }
    } catch (error: unknown) {
      console.error(`[Kill] Error scanning for orphaned processes:`, error)
    }
  }

  // Wait a moment for processes to terminate gracefully (reduced from 2000ms for faster shutdown)
  await new Promise((resolve) => setTimeout(resolve, 500))

      // Force kill any processes that are still running
  const stillRunning: number[] = []
  for (const pid of killedPids) {
    try {
      // Check if process is still running using Promise
      await new Promise<void>((resolve) => {
        exec(`ps -p ${pid}`, (psError: unknown) => {
          if (!psError) {
            // Process still running
            const pidNum = typeof pid === "number" ? pid : parseInt(String(pid))
            if (!isNaN(pidNum)) {
              stillRunning.push(pidNum)
            }
          }
          resolve()
        })
      })
    } catch (_error: unknown) {
      // Process already dead, ignore
    }
  }  // Force kill processes that are still running
  for (const pid of stillRunning) {
    console.log(
      `[Kill] Process ${pid} still running after SIGTERM, force killing with SIGKILL`,
    )
    await killProcessByPid(pid, "SIGKILL")
  }

  // Final scan to ensure no database processes belonging to our app are left running
  // Skip if app is not available (e.g., in MCP mode during cleanup)
  if (app) {
    try {
      const appDataDir = app.getPath("userData") // e.g., ~/Library/Application Support/LiquiDB
      const databasesDir = path.join(appDataDir, "databases")

      const databaseProcessNames = [
        "mysqld",
        "postgres",
        "mongod",
        "redis-server",
      ]
      for (const processName of databaseProcessNames) {
        try {
          const output = execSync(`pgrep -f "${processName}"`, {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          })
          const pids = output
            .trim()
            .split("\n")
            .filter((pid) => pid.length > 0)

          for (const pidStr of pids) {
            const pid = parseInt(pidStr)
            if (!isNaN(pid) && !killedPids.has(pid)) {
              // Check if this PID matches any known database
              const databases = storage.loadDatabases(app)
              const isKnownProcess =
                databases.some((db) => db.pid === pid) ||
                Array.from(runningDatabases.values()).some(
                  (db) => db.process.pid === pid,
                )

              if (!isKnownProcess) {
                // Verify this process belongs to our app by checking its command line
                try {
                  const psOutput = execSync(`ps -p ${pid} -o command=`, {
                    encoding: "utf8",
                    stdio: ["ignore", "pipe", "ignore"],
                  })
                  const command = psOutput.trim()

                  // Check if command line contains our app's data directory
                  const belongsToApp =
                    command.includes(appDataDir) || command.includes(databasesDir)

                  if (belongsToApp) {
                    // Still orphaned and belongs to our app - force kill
                    console.log(
                      `[Kill] Found still-running orphaned ${processName} process (PID: ${pid}) belonging to app, force killing`,
                    )
                    console.log(`[Kill] Command: ${command.substring(0, 200)}`)
                    await killProcessByPid(pid, "SIGKILL")
                  }
                } catch (_psError: unknown) {
                  // Process might have died between pgrep and ps, or we can't read it - skip
                  // Don't kill processes we can't verify belong to our app
                }
              }
            }
          }
        } catch (_error: unknown) {
          // No processes found for this type - good
        }
      }
    } catch (error: unknown) {
      console.error(`[Kill] Error in final orphan scan:`, error)
    }
  }
  } catch (error) {
    console.error('[Kill] Error in killAllDatabaseProcesses:', error)
  } finally {
    isKillingInProgress = false
  }
}
