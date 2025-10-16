import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as crypto from 'crypto';

// Encryption/Decryption functions
function getEncryptionKey(): string {
  // Use a combination of machine-specific data for the encryption key
  const machineId = app.getPath('userData');
  return crypto.createHash('sha256').update(machineId).digest('hex');
}

function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedPassword: string): string {
  const key = getEncryptionKey();
  const parts = encryptedPassword.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Database storage functions
function saveDatabases(databases: any[]) {
  try {
    const dbPath = path.join(app.getPath('userData'), 'databases.json');
    fs.writeFileSync(dbPath, JSON.stringify(databases, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save databases:', error);
    return false;
  }
}

// Installation tracking to prevent loops
const installationAttempts = new Map<string, number>();

// Track running database processes for cleanup
const runningProcesses = new Map<string, { pid: number; type: string; port: number }>();

// Track starting database processes (to be able to cancel them)
const startingProcesses = new Map<string, { process: any; type: string; port: number }>();

function trackInstallationAttempt(packageName: string): boolean {
  const attempts = installationAttempts.get(packageName) || 0;
  if (attempts >= 3) {
    console.warn(`Too many installation attempts for ${packageName}, skipping`);
    return false;
  }
  installationAttempts.set(packageName, attempts + 1);
  return true;
}

function clearInstallationAttempts(packageName: string) {
  installationAttempts.delete(packageName);
}

async function loadDatabases() {
  try {
    const dbPath = path.join(app.getPath('userData'), 'databases.json');
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      // Handle empty file or invalid JSON
      if (!data.trim()) {
        console.log('databases.json is empty, returning empty array');
        return [];
      }
      const databases = JSON.parse(data);
      
      // Verify actual status of databases by checking if processes are running
      for (const db of databases) {
        if (db.status === 'running') {
          const isActuallyRunning = await checkPortInUse(db.port);
          if (!isActuallyRunning) {
            console.log(`Database ${db.name} was marked as running but process not found, updating status to stopped`);
            db.status = 'stopped';
          }
        }
      }
      
      // Save updated statuses if any were changed
      const hasChanges = databases.some((db: any) => db.status === 'stopped' && databases.find((d: any) => d.id === db.id && d.status !== 'stopped'));
      if (hasChanges) {
        saveDatabases(databases);
      }
      
      return databases;
    }
    return [];
  } catch (error) {
    console.error('Failed to load databases:', error);
    // If JSON is corrupted, create a new empty file
    try {
      const dbPath = path.join(app.getPath('userData'), 'databases.json');
      fs.writeFileSync(dbPath, '[]', 'utf8');
      console.log('Created new empty databases.json file');
    } catch (writeError) {
      console.error('Failed to create new databases.json:', writeError);
    }
    return [];
  }
}

let mainWindow: BrowserWindow;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'hiddenInset',
    title: 'LiquiDB',
  });

  // Load the Next.js app
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  
  if (isDev) {
    console.log('Loading development URL: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
    
    // Add event listeners for debugging
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Page finished loading');
    });
    
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Page failed to load:', errorCode, errorDescription);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper function to stop a database service
async function stopDatabaseService(db: any): Promise<boolean> {
  try {
    console.log(`Stopping ${db.type} database: ${db.name}`);
    
    if (db.type === 'postgresql') {
      return await stopPostgreSQLService(db);
    } else if (db.type === 'mysql') {
      return await stopMySQLService(db);
    } else if (db.type === 'mariadb') {
      return await stopMariaDBService(db);
    } else if (db.type === 'mongodb') {
      return await stopMongoDBService(db);
    } else if (db.type === 'cassandra') {
      return await stopCassandraService(db);
    }
    
    return false;
  } catch (error) {
    console.error(`Failed to stop ${db.type} service:`, error);
    return false;
  }
}

// PostgreSQL service stop
async function stopPostgreSQLService(db: any): Promise<boolean> {
  try {
    // First try to kill the tracked process
    const killSuccess = await killDatabaseProcess(db.id);
    
    const pgDataPath = path.join(db.dataPath, 'postgresql_data');
    const pgctlPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin/pg_ctl';
    
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const pgctl = spawn(pgctlPath, ['stop', '-D', pgDataPath], {
        stdio: 'inherit',
        env: { ...process.env, PATH: '/opt/homebrew/Cellar/postgresql@16/16.10/bin:/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });
      
      pgctl.on('close', (code) => {
        console.log(`pg_ctl stop exited with code: ${code}`);
        resolve(code === 0);
      });
    });
    
    // Ensure process is untracked
    untrackProcess(db.id);
    
    return stopSuccess || killSuccess;
  } catch (error) {
    console.error('Failed to stop PostgreSQL:', error);
    // Still try to untrack the process
    untrackProcess(db.id);
    return false;
  }
}

// MySQL service stop
async function stopMySQLService(db: any): Promise<boolean> {
  try {
    // First try to kill the tracked process
    const killSuccess = await killDatabaseProcess(db.id);
    
    // Get the correct mysqladmin binary path
    const packageName = getHomebrewPackageName(db.type, db.version);
    const mysqladminPath = getHomebrewBinaryPath('mysqladmin', packageName);
    console.log(`Using mysqladmin at: ${mysqladminPath}`);
    
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const mysqladmin = spawn(mysqladminPath, ['-u', db.username, '-p' + db.password, 'shutdown'], {
        stdio: 'inherit'
      });
      
      mysqladmin.on('close', (code) => {
        console.log(`mysqladmin shutdown exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysqladmin.on('error', (error) => {
        console.error(`mysqladmin shutdown error: ${error}`);
        resolve(false);
      });
    });
    
    // Ensure process is untracked
    untrackProcess(db.id);
    
    return stopSuccess || killSuccess;
  } catch (error) {
    console.error('Failed to stop MySQL:', error);
    // Still try to untrack the process
    untrackProcess(db.id);
    return false;
  }
}

// MariaDB service stop
async function stopMariaDBService(db: any): Promise<boolean> {
  try {
    // First try to kill the tracked process
    const killSuccess = await killDatabaseProcess(db.id);
    
    // Get the correct mysqladmin binary path (MariaDB uses mysqladmin)
    const packageName = getHomebrewPackageName(db.type, db.version);
    const mysqladminPath = getHomebrewBinaryPath('mysqladmin', packageName);
    console.log(`Using mysqladmin at: ${mysqladminPath}`);
    
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const mysqladmin = spawn(mysqladminPath, ['-u', db.username, '-p' + db.password, 'shutdown'], {
        stdio: 'inherit'
      });
      
      mysqladmin.on('close', (code) => {
        console.log(`mysqladmin shutdown exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysqladmin.on('error', (error) => {
        console.error(`mysqladmin shutdown error: ${error}`);
        resolve(false);
      });
    });
    
    // Ensure process is untracked
    untrackProcess(db.id);
    
    return stopSuccess || killSuccess;
  } catch (error) {
    console.error('Failed to stop MariaDB:', error);
    // Still try to untrack the process
    untrackProcess(db.id);
    return false;
  }
}

// MongoDB service stop
async function stopMongoDBService(db: any): Promise<boolean> {
  try {
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const mongod = spawn('mongod', ['--shutdown', '--dbpath', db.dataPath], {
        stdio: 'inherit'
      });
      
      mongod.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return stopSuccess;
  } catch (error) {
    console.error('Failed to stop MongoDB:', error);
    return false;
  }
}

// Cassandra service stop
async function stopCassandraService(db: any): Promise<boolean> {
  try {
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const nodetool = spawn('nodetool', ['stopdaemon'], {
        stdio: 'inherit'
      });
      
      nodetool.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return stopSuccess;
  } catch (error) {
    console.error('Failed to stop Cassandra:', error);
    return false;
  }
}

// Cleanup function to stop all running databases
async function stopAllRunningDatabases() {
  try {
    console.log('Stopping all running databases...');
    
    // Kill all tracked processes first
    await killAllDatabaseProcesses();
    
    // Also try to stop via database services
    const databases = await loadDatabases();
    const runningDatabases = databases.filter((db: any) => db.status === 'running');
    
    console.log(`Stopping ${runningDatabases.length} tracked running databases...`);
    
    for (const db of runningDatabases) {
      try {
        console.log(`Stopping ${db.type} database: ${db.name}`);
        const stopSuccess = await stopDatabaseService(db);
        
        if (stopSuccess) {
          // Update status in storage
          db.status = 'stopped';
          console.log(`Successfully stopped ${db.name}`);
        } else {
          console.error(`Failed to stop ${db.name}`);
        }
      } catch (error) {
        console.error(`Failed to stop database ${db.name}:`, error);
      }
    }
    
    // Save updated statuses
    saveDatabases(databases);
    console.log('All databases stopped successfully');
  } catch (error) {
    console.error('Error stopping databases:', error);
  }
}

// Clean up orphaned processes on startup
app.whenReady().then(async () => {
  console.log('App ready, cleaning up orphaned processes...');
  await cleanupOrphanedProcesses();
});

// Stop all databases when app is about to quit
app.on('before-quit', async (event) => {
  console.log('App is about to quit, cleaning up database processes...');
  
  // Cancel all starting processes and reset their status
  if (startingProcesses.size > 0) {
    console.log(`Cancelling ${startingProcesses.size} starting database processes...`);
    for (const [dbId, processInfo] of startingProcesses) {
      try {
        if (processInfo.process && !processInfo.process.killed) {
          console.log(`Killing starting process for database ${dbId}`);
          processInfo.process.kill('SIGTERM');
        }
        
        // Reset database status to stopped
        const databases = await loadDatabases();
        const db = databases.find((d: any) => d.id === dbId);
        if (db && db.status === 'starting') {
          db.status = 'stopped';
          saveDatabases(databases);
          console.log(`Reset database ${dbId} status to stopped`);
        }
      } catch (error) {
        console.error(`Error killing starting process for ${dbId}:`, error);
      }
    }
    startingProcesses.clear();
  }
  
  // Stop all running databases
  await stopAllRunningDatabases();
});

// Handle force-quit scenarios (SIGTERM, SIGINT, etc.)
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, stopping all databases...');
  await killAllDatabaseProcesses();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, stopping all databases...');
  await killAllDatabaseProcesses();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('Uncaught exception:', error);
  await killAllDatabaseProcesses();
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  await killAllDatabaseProcesses();
  process.exit(1);
});

// Also handle window-all-closed to stop databases
app.on('window-all-closed', async () => {
  console.log('All windows closed, stopping all databases...');
  await stopAllRunningDatabases();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Database management IPC handlers
ipcMain.handle('get-database-types', async () => {
  return [
    { 
      id: 'postgresql', 
      name: 'PostgreSQL', 
      defaultPort: 5432, 
      icon: '🐘',
      defaultUsername: 'postgres',
      defaultPassword: 'postgres'
    },
    { 
      id: 'mysql', 
      name: 'MySQL', 
      defaultPort: 3306, 
      icon: '🐬',
      defaultUsername: 'root',
      defaultPassword: 'root'
    },
    { 
      id: 'mariadb', 
      name: 'MariaDB', 
      defaultPort: 3306, 
      icon: '🐚',
      defaultUsername: 'root',
      defaultPassword: 'root'
    },
    { 
      id: 'mongodb', 
      name: 'MongoDB', 
      defaultPort: 27017, 
      icon: '🍃',
      defaultUsername: 'admin',
      defaultPassword: 'admin'
    },
    { 
      id: 'cassandra', 
      name: 'Cassandra', 
      defaultPort: 9042, 
      icon: '☁️',
      defaultUsername: 'cassandra',
      defaultPassword: 'cassandra'
    },
    { 
      id: 'mssql', 
      name: 'Microsoft SQL Server', 
      defaultPort: 1433, 
      icon: '🗄️',
      defaultUsername: 'sa',
      defaultPassword: 'YourStrong@Passw0rd'
    },
    { 
      id: 'redshift', 
      name: 'Amazon Redshift', 
      defaultPort: 5439, 
      icon: '🔴',
      defaultUsername: 'admin',
      defaultPassword: 'admin'
    },
  ];
});

ipcMain.handle('get-database-versions', async (event, dbType: string) => {
  const versions: { [key: string]: string[] } = {
    postgresql: ['16.1', '15.5', '14.10', '13.13', '12.17'],
    mysql: ['8.0.35', '8.0.34', '8.0.33', '5.7.44', '5.6.51'],
    mariadb: ['11.2.2', '11.1.3', '10.11.6', '10.10.7', '10.9.9'],
    mongodb: ['7.0.4', '6.0.13', '5.0.22', '4.4.25', '4.2.25'],
    cassandra: ['4.1.3', '4.0.11', '3.11.16', '3.0.28'],
    mssql: ['2022', '2019', '2017', '2016'],
    redshift: ['1.0.0', '0.9.0'],
  };
  
  return versions[dbType] || [];
});

// IPC handler to check and fix database status
ipcMain.handle('check-database-status', async (event, dbId: string) => {
  try {
    const databases = await loadDatabases();
    const db = databases.find((d: any) => d.id === dbId);
    
    if (!db) {
      return { success: false, message: 'Database not found' };
    }
    
    // Check if database is actually running
    const isRunning = await checkPortInUse(db.port);
    
    if (isRunning && db.status !== 'running') {
      // Database is running but status is wrong, fix it
      db.status = 'running';
      saveDatabases(databases);
      
      // Notify renderer
      if (event.sender) {
        event.sender.send('database-status-updated', { id: dbId, status: 'running' });
      }
      
      return { success: true, message: 'Status corrected to running', status: 'running' };
    } else if (!isRunning && db.status === 'running') {
      // Database is not running but status says it is, fix it
      db.status = 'stopped';
      saveDatabases(databases);
      
      // Notify renderer
      if (event.sender) {
        event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
      }
      
      return { success: true, message: 'Status corrected to stopped', status: 'stopped' };
    }
    
    return { success: true, message: 'Status is correct', status: db.status };
  } catch (error) {
    console.error('Error checking database status:', error);
    return { success: false, message: `Error checking status: ${error}` };
  }
});

// IPC handler to create named database after instance is created
ipcMain.handle('create-named-database', async (event, dbId: string) => {
  try {
    const databases = await loadDatabases();
    const db = databases.find((d: any) => d.id === dbId);
    
    if (!db) {
      return { success: false, message: 'Database not found' };
    }
    
    console.log(`Creating named database '${db.databaseName}' for ${db.type} instance...`);
    
    // Ensure the service is running; if not, start it temporarily
    const wasRunning = await checkPortInUse(db.port);
    let startedTemporarily = false;
    if (!wasRunning) {
      console.log('Service is not running; starting temporarily to create the database...');
      const startResult = await startDatabaseService(db);
      if (!startResult) {
        return { success: false, message: 'Failed to start service to create database' };
      }
      startedTemporarily = true;
      // Give the service a moment to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Create the named database
    const createSuccess = await createNamedDatabase(
      db.type, 
      db.version, 
      db.dataPath, 
      db.username, 
      db.encryptedPassword ? decryptPassword(db.encryptedPassword) : 'admin', 
      db.port, 
      db.databaseName
    );
    
    // If we started it temporarily, stop it to restore original state
    if (startedTemporarily) {
      console.log('Stopping service that was started temporarily for database creation...');
      await stopDatabaseService(db);
    }

    if (createSuccess) {
      console.log(`Named database '${db.databaseName}' created successfully`);
      return { success: true, message: `Database '${db.databaseName}' created successfully` };
    } else {
      console.error(`Failed to create named database '${db.databaseName}'`);
      return { success: false, message: `Failed to create database '${db.databaseName}'` };
    }
  } catch (error) {
    console.error('Error creating named database:', error);
    return { success: false, message: `Error creating database: ${error}` };
  }
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Database Data Directory',
  });
  
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('install-database', async (event, config: any) => {
  try {
    const { type, name, version, port, dataPath, username, password, useCustomCredentials } = config;
    
    // Load existing databases for duplicate check
    const existingDatabases = await loadDatabases();
    
    // Check for duplicate database in same folder with same version
    const existingDbInFolder = existingDatabases.find((db: any) => 
      db.dataPath === dataPath && 
      db.type === type && 
      db.version === version
    );
    
    if (existingDbInFolder) {
      return {
        success: false,
        message: `A ${type} ${version} database already exists in this folder. Please choose a different location or version.`,
        duplicate: true,
        existingDb: existingDbInFolder
      };
    }

    // Check if the requested port is available
    const portAvailable = await isPortAvailable(port);
    
    if (!portAvailable) {
      // Check if it's used by another database
      const portCheck = await isPortInUseByRunningDatabase(port);
      
      if (portCheck.inUse) {
        const conflictingDbName = portCheck.conflictingDb?.name || 'another database';
        return {
          success: false,
          message: `Port ${port} is already in use by "${conflictingDbName}". Please choose a different port.`,
          conflict: true,
          conflictingDb: portCheck.conflictingDb
        };
      } else {
        return {
          success: false,
          message: `Port ${port} is already in use by another service. Please choose a different port.`,
          conflict: true
        };
      }
    }
    
    // Determine data root (fallback to userData if none provided)
    const dataRoot = dataPath && dataPath.trim().length > 0
      ? dataPath
      : path.join(app.getPath('userData'), 'data');

    // Ensure data root exists
    if (!fs.existsSync(dataRoot)) {
      fs.mkdirSync(dataRoot, { recursive: true });
    }

    // Create per-database path
    const dbPath = path.join(dataRoot, name);
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(dbPath, { recursive: true });
    }
    
    // Check if Homebrew is installed, install if not
    let hasHomebrew = await isHomebrewInstalled();
    
    if (!hasHomebrew) {
      console.log('Homebrew not found, installing...');
      const homebrewInstalled = await installHomebrew();
      if (!homebrewInstalled) {
        return {
          success: false,
          message: 'Failed to install Homebrew. Please install it manually: https://brew.sh',
        };
      }
      hasHomebrew = true;
    }
    
    // Check if database binary already exists locally
    const packageName = getHomebrewPackageName(type, version);
    const binaryExists = await checkLocalDatabaseExists(type, version);
    
    let installSuccess = true;
    let installMessage = '';
    
    if (!binaryExists) {
      // Check if we've already tried to install this package too many times
      if (!trackInstallationAttempt(packageName)) {
        return {
          success: false,
          message: `Too many installation attempts for ${packageName}. Please try again later or install manually.`,
        };
      }

      // Install the database via Homebrew
      console.log(`Installing ${packageName} via Homebrew...`);
      installSuccess = await new Promise<boolean>((resolve) => {
        const brew = spawn('brew', ['install', packageName], {
          stdio: 'inherit'
        });

        brew.on('close', (code) => {
          console.log(`Homebrew install exited with code: ${code}`);
          resolve(code === 0);
        });
      });

      if (installSuccess) {
        clearInstallationAttempts(packageName);
        installMessage = `Installed ${packageName} via Homebrew`;
      } else {
        installMessage = `Failed to install ${packageName} via Homebrew`;
      }
    } else {
      console.log(`${packageName} is already installed, skipping download`);
      installMessage = `${packageName} already installed locally`;
      clearInstallationAttempts(packageName);
    }

    if (!installSuccess) {
      return {
        success: false,
        message: installMessage,
      };
    }
    
    // Get default credentials if not using custom ones
    const databaseTypes = [
      { id: 'postgresql', defaultUsername: 'postgres', defaultPassword: 'postgres' },
      { id: 'mysql', defaultUsername: 'root', defaultPassword: 'root' },
      { id: 'mariadb', defaultUsername: 'root', defaultPassword: 'root' },
      { id: 'mongodb', defaultUsername: 'admin', defaultPassword: 'admin' },
      { id: 'cassandra', defaultUsername: 'cassandra', defaultPassword: 'cassandra' },
      { id: 'mssql', defaultUsername: 'sa', defaultPassword: 'YourStrong@Passw0rd' },
      { id: 'redshift', defaultUsername: 'admin', defaultPassword: 'admin' },
    ];
    const dbType = databaseTypes.find((dt: any) => dt.id === type);
    
    const finalUsername = useCustomCredentials ? username : (dbType?.defaultUsername || 'admin');
    const finalPassword = useCustomCredentials ? password : (dbType?.defaultPassword || 'admin');

    // Initialize the database server after installation (without creating named database yet)
    if (installSuccess) {
      console.log(`Initializing ${type} database server...`);
      const initSuccess = await initializeDatabaseServer(type, version, dbPath, finalUsername, finalPassword, port);
      if (!initSuccess) {
        console.warn(`Failed to initialize ${type} database server, but continuing with installation`);
      } else {
        console.log(`${type} database server initialized successfully`);
      }
    }
    
    // Create database configuration
    const dbConfig = {
      id: `${type}-${name}-${Date.now()}`,
      name,
      type,
      version,
      port,
      dataPath: dbPath,
      status: 'stopped',
      installedAt: new Date().toISOString(),
      packageName,
      username: finalUsername,
      databaseName: name, // Store the actual database name that was created
      encryptedPassword: encryptPassword(finalPassword),
      useCustomCredentials: useCustomCredentials || false,
    };
    
    // Save to persistent storage
    const allDatabases = await loadDatabases();
    allDatabases.push(dbConfig);
    saveDatabases(allDatabases);

    // After installation, ensure the named database is created
    try {
      console.log(`Ensuring named database '${name}' exists...`);
      // Start service temporarily if not running
      const isRunning = await checkPortInUse(port);
      let startedTemporarily = false;
      if (!isRunning) {
        const startResult = await startDatabaseService(dbConfig);
        if (!startResult) {
          return {
            success: false,
            message: `Failed to start ${type} service to create database '${name}'`,
          };
        }
        startedTemporarily = true;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const created = await createNamedDatabase(type, version, dbPath, finalUsername, finalPassword, port, name);
      if (!created) {
        // Stop service if we started it
        if (startedTemporarily) {
          await stopDatabaseService(dbConfig);
        }
        return {
          success: false,
          message: `Failed to create database '${name}' on ${type}`,
        };
      }

      // Stop service if we started it
      if (startedTemporarily) {
        await stopDatabaseService(dbConfig);
      }
      console.log(`Named database '${name}' created successfully.`);
    } catch (createError) {
      console.error('Error creating named database after install:', createError);
      return {
        success: false,
        message: `Installed but failed to create database '${name}': ${createError}`,
      };
    }

    console.log(`Successfully installed ${type} ${version}`);
    console.log(`Data directory: ${dbPath}`);
    console.log(`Port: ${port}`);
    
    return {
      success: true,
      message: `${type} ${version} installed successfully`,
      path: dbPath,
      config: dbConfig,
    };
  } catch (error) {
    console.error('Database installation failed:', error);
    return {
      success: false,
      message: `Failed to install database: ${error}`,
    };
  }
});

ipcMain.handle('get-installed-databases', async () => {
  return await loadDatabases();
});

ipcMain.handle('start-database', async (event, dbId: string) => {
  try {
    const databases = await loadDatabases();
    const db = databases.find((d: any) => d.id === dbId);

    if (!db) {
      return { success: false, message: 'Database not found' };
    }

    // Check if port is available on the system
    const portAvailable = await isPortAvailable(db.port);
    
    if (!portAvailable) {
      // Check for port conflicts with running databases
      const portCheck = await isPortInUseByRunningDatabase(db.port);
      
      if (portCheck.inUse) {
        const conflictingDbName = portCheck.conflictingDb?.name || 'another process';
        return {
          success: false,
          message: `Port ${db.port} is already in use by "${conflictingDbName}". Please stop the conflicting database first before starting this one.`,
          conflict: true,
          conflictingDb: portCheck.conflictingDb,
          blocking: true // This blocks the start operation
        };
      } else {
        return {
          success: false,
          message: `Port ${db.port} is already in use by another service. Please choose a different port or stop the conflicting service.`,
          conflict: true,
          blocking: true // This blocks the start operation
        };
      }
    }

    // Update status to starting immediately
    db.status = 'starting';
    saveDatabases(databases);
    
    // Notify renderer that status is updating
    if (event.sender) {
      event.sender.send('database-status-updated', { id: dbId, status: 'starting' });
    }

    // Start the database service with proper configuration
    console.log(`Attempting to start ${db.type} database...`);
    const process = await startDatabaseService(db);

    console.log(`Database start result: ${process !== null}`);

    if (process) {
      // For PostgreSQL, the process might be null but the database is actually running
      // Check if the database is actually running by checking the port
      setTimeout(async () => {
        try {
          const isActuallyRunning = await checkPortInUse(db.port);
          if (isActuallyRunning) {
            // Update status in storage
            const updatedDatabases = await loadDatabases();
            const updatedDb = updatedDatabases.find((d: any) => d.id === dbId);
            if (updatedDb) {
              updatedDb.status = 'running';
              saveDatabases(updatedDatabases);
              
              // Notify renderer that status is updated
              if (event.sender) {
                event.sender.send('database-status-updated', { id: dbId, status: 'running' });
              }
              
              console.log(`Database ${db.name} is now running on port ${db.port}`);
            }
          } else {
            // Database failed to start
            const updatedDatabases = await loadDatabases();
            const updatedDb = updatedDatabases.find((d: any) => d.id === dbId);
            if (updatedDb) {
              updatedDb.status = 'stopped';
              saveDatabases(updatedDatabases);
              
              // Notify renderer that status is updated
              if (event.sender) {
                event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
              }
              
              console.log(`Database ${db.name} failed to start on port ${db.port}`);
            }
          }
        } catch (error) {
          console.error('Error checking database status:', error);
          // Default to stopped on error
          const updatedDatabases = await loadDatabases();
          const updatedDb = updatedDatabases.find((d: any) => d.id === dbId);
          if (updatedDb) {
            updatedDb.status = 'stopped';
            saveDatabases(updatedDatabases);
            
            if (event.sender) {
              event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
            }
          }
        }
      }, 5000); // Wait 5 seconds for database to fully start
      
      return { success: true, message: 'Database started' };
    } else {
      // Update status back to stopped on failure
      const updatedDatabases = await loadDatabases();
      const updatedDb = updatedDatabases.find((d: any) => d.id === dbId);
      if (updatedDb) {
        updatedDb.status = 'stopped';
        saveDatabases(updatedDatabases);
        
        // Notify renderer that status is updated
        if (event.sender) {
          event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
        }
      }
      
      return { success: false, message: 'Failed to start database service' };
    }

    return { success: false, message: 'Unsupported database type' };
  } catch (error) {
    console.error('Failed to start database:', error);
    return { success: false, message: `Failed to start database: ${error}` };
  }
});

ipcMain.handle('stop-database', async (event, dbId: string) => {
  try {
    const databases = await loadDatabases();
    const db = databases.find((d: any) => d.id === dbId);
    
    if (!db) {
      return { success: false, message: 'Database not found' };
    }
    
    console.log(`Stopping ${db.type} database: ${db.name}`);
    
    // Update status to stopping immediately
    db.status = 'stopping';
    saveDatabases(databases);
    
    // Notify renderer that status is updating
    if (event.sender) {
      event.sender.send('database-status-updated', { id: dbId, status: 'stopping' });
    }
    
    // Stop the database service using the proper stop function
    const stopSuccess = await stopDatabaseService(db);
    
    if (stopSuccess) {
      // Update status in storage
      db.status = 'stopped';
      saveDatabases(databases);
      
      // Notify renderer that status is updated
      if (event.sender) {
        event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
      }
      
      return { success: true, message: 'Database stopped' };
    } else {
      return { success: false, message: 'Failed to stop database service' };
    }
  } catch (error) {
    console.error('Failed to stop database:', error);
    return { success: false, message: `Failed to stop database: ${error}` };
  }
});

ipcMain.handle('delete-database', async (event, dbId: string) => {
  try {
    const databases = await loadDatabases();
    const dbIndex = databases.findIndex((d: any) => d.id === dbId);
    
    if (dbIndex === -1) {
      return { success: false, message: 'Database not found' };
    }
    
    const db = databases[dbIndex];
    
    // Stop the database service first if it's running
    if (db.status === 'running') {
      console.log(`Stopping database ${db.name} before deletion...`);
      const stopSuccess = await stopDatabaseService(db);
      if (stopSuccess) {
        console.log(`Database ${db.name} stopped successfully`);
      } else {
        console.warn(`Failed to stop database ${db.name}, proceeding with deletion anyway`);
      }
    }
    
    // Remove database files and data directory
    try {
      if (db.dataPath && fs.existsSync(db.dataPath)) {
        console.log(`Removing database files from: ${db.dataPath}`);
        fs.rmSync(db.dataPath, { recursive: true, force: true });
        console.log(`Database files removed successfully`);
      }
    } catch (fileError) {
      console.warn(`Failed to remove database files: ${fileError}`);
      // Continue with deletion even if file removal fails
    }
    
    // Remove from storage
    databases.splice(dbIndex, 1);
    saveDatabases(databases);
    
    // Optionally uninstall the package (commented out for safety)
    // await new Promise<void>((resolve) => {
    //   const process = spawn('brew', ['uninstall', db.packageName]);
    //   process.on('close', () => resolve());
    // });
    
    return { success: true, message: 'Database deleted' };
  } catch (error) {
    console.error('Failed to delete database:', error);
    return { success: false, message: `Failed to delete database: ${error}` };
  }
});

// Password encryption/decryption handlers
ipcMain.handle('encrypt-password', async (event, password: string) => {
  return encryptPassword(password);
});

ipcMain.handle('decrypt-password', async (event, encryptedPassword: string) => {
  return decryptPassword(encryptedPassword);
});

// Port conflict checking
ipcMain.handle('check-port-conflict', async (event, port: number) => {
  try {
    const portCheck = await isPortInUseByRunningDatabase(port);
    
    if (portCheck.inUse) {
      const suggestedPort = await findAvailablePortForRunning(port);
      return {
        hasConflict: true,
        conflictingDb: portCheck.conflictingDb,
        suggestedPort: suggestedPort
      };
    }
    
    return { hasConflict: false };
  } catch (error) {
    console.error('Error checking port conflict:', error);
    return { hasConflict: false };
  }
});

// Check for duplicate database
ipcMain.handle('check-duplicate-database', async (event, config: any) => {
  try {
    const { type, version, dataPath } = config;
    const databases = await loadDatabases();
    const existingDbInFolder = databases.find((db: any) => 
      db.dataPath === dataPath && 
      db.type === type && 
      db.version === version
    );
    
    if (existingDbInFolder) {
      return {
        isDuplicate: true,
        existingDb: existingDbInFolder
      };
    }
    
    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking duplicate database:', error);
    return { isDuplicate: false };
  }
});

ipcMain.handle('check-name-conflict', async (event, name: string) => {
  try {
    const databases = await loadDatabases();
    
    // Check for existing database with the same name (case-insensitive)
    const existingDbWithName = databases.find((db: any) => 
      db.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingDbWithName) {
      return {
        hasConflict: true,
        conflictingDb: existingDbWithName
      };
    }
    
    return { hasConflict: false };
  } catch (error) {
    console.error('Error checking name conflict:', error);
    return { hasConflict: false };
  }
});

// Update database port
ipcMain.handle('update-database-port', async (event, dbId: string, newPort: number) => {
  try {
    const databases = await loadDatabases();
    const dbIndex = databases.findIndex((d: any) => d.id === dbId);
    
    if (dbIndex === -1) {
      return { success: false, message: 'Database not found' };
    }
    
    // Check if new port is already in use by running databases
    const runningDatabases = databases.filter((d: any) => d.status === 'running' && d.id !== dbId);
    const conflictingDb = runningDatabases.find((d: any) => d.port === newPort);
    
    if (conflictingDb) {
      return {
        success: false,
        message: `Port ${newPort} is already in use by "${conflictingDb.name}". Please choose a different port.`,
        conflict: true
      };
    }
    
    // Update the port
    databases[dbIndex].port = newPort;
    saveDatabases(databases);
    
    return { success: true, message: 'Database port updated successfully' };
  } catch (error) {
    console.error('Failed to update database port:', error);
    return { success: false, message: `Failed to update database port: ${error}` };
  }
});

// Helper function to find next available port
async function findNextAvailablePort(startPort: number, databases: any[]): Promise<number> {
  const usedPorts = new Set(databases.map((db: any) => db.port));
  let port = startPort + 1;
  
  // Try up to 100 ports to find an available one
  while (usedPorts.has(port) && port < startPort + 100) {
    port++;
  }
  
  return port;
}

// Helper function to find available port for running databases
async function findAvailablePortForRunning(startPort: number): Promise<number> {
  const databases = await loadDatabases();
  const runningDatabases = databases.filter((db: any) => db.status === 'running');
  const usedPorts = new Set(runningDatabases.map((db: any) => db.port));
  
  let port = startPort + 1;
  
  // Try up to 100 ports to find an available one
  while (usedPorts.has(port) && port < startPort + 100) {
    port++;
  }
  
  return port;
}

// Helper function to check if port is actually in use by a running database
async function isPortInUseByRunningDatabase(port: number): Promise<{ inUse: boolean; conflictingDb?: any }> {
  const databases = await loadDatabases();
  const runningDatabases = databases.filter((db: any) => db.status === 'running');
  const conflictingDb = runningDatabases.find((db: any) => db.port === port);
  
  // Also check if there's actually a process running on this port
  const isPortActuallyInUse = await checkPortInUse(port);
  
  return {
    inUse: !!conflictingDb || isPortActuallyInUse,
    conflictingDb: conflictingDb
  };
}

// Helper function to check if a port is actually in use by any process
async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const lsof = spawn('lsof', ['-i', `:${port}`], { stdio: 'pipe' });
    
    let output = '';
    lsof.stdout.on('data', (data: Buffer) => {
      output += data.toString();
    });
    
    lsof.on('close', (code: number) => {
      // If lsof finds any processes using the port, it returns 0
      // If no processes are found, it returns 1
      resolve(code === 0 && output.trim().length > 0);
    });
    
    lsof.on('error', () => {
      // If lsof command fails, assume port is not in use
      resolve(false);
    });
  });
}

// Track a running database process
function trackProcess(dbId: string, pid: number, type: string, port: number) {
  runningProcesses.set(dbId, { pid, type, port });
  console.log(`Tracking process: ${type} (PID: ${pid}) for database ${dbId} on port ${port}`);
}

// Stop tracking a database process
function untrackProcess(dbId: string) {
  const process = runningProcesses.get(dbId);
  if (process) {
    console.log(`Untracking process: ${process.type} (PID: ${process.pid}) for database ${dbId}`);
    runningProcesses.delete(dbId);
  }
}

// Kill a specific database process
async function killDatabaseProcess(dbId: string): Promise<boolean> {
  const trackedProcess = runningProcesses.get(dbId);
  if (!trackedProcess) {
    console.log(`No tracked process found for database ${dbId}`);
    return true; // Consider it successful if not tracked
  }

  try {
    console.log(`Killing ${trackedProcess.type} process (PID: ${trackedProcess.pid}) for database ${dbId}`);
    
    // Try graceful termination first
    process.kill(trackedProcess.pid, 'SIGTERM');
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if process is still running
    try {
      process.kill(trackedProcess.pid, 0); // This throws if process doesn't exist
      // Process still exists, force kill
      console.log(`Process still running, force killing PID ${trackedProcess.pid}`);
      process.kill(trackedProcess.pid, 'SIGKILL');
    } catch (error) {
      // Process already terminated
      console.log(`Process ${trackedProcess.pid} already terminated`);
    }
    
    untrackProcess(dbId);
    return true;
  } catch (error: any) {
    // Handle ESRCH error (process doesn't exist) as success
    if (error.code === 'ESRCH') {
      console.log(`Process ${trackedProcess.pid} already terminated (ESRCH)`);
      untrackProcess(dbId);
      return true;
    }
    console.error(`Failed to kill process ${trackedProcess.pid}:`, error);
    return false;
  }
}

// Kill all tracked database processes
async function killAllDatabaseProcesses(): Promise<void> {
  console.log(`Killing all tracked database processes (${runningProcesses.size} processes)`);
  
  const killPromises = Array.from(runningProcesses.keys()).map(dbId => killDatabaseProcess(dbId));
  await Promise.all(killPromises);
  
  console.log('All database processes terminated');
}

// Clean up orphaned database processes on startup
async function cleanupOrphanedProcesses(): Promise<void> {
  console.log('Checking for orphaned database processes...');
  
  const commonPorts = [5432, 3306, 27017, 9042, 1433, 5439];
  const orphanedProcesses: number[] = [];
  
  for (const port of commonPorts) {
    try {
      const isInUse = await checkPortInUse(port);
      if (isInUse) {
        console.log(`Found orphaned process on port ${port}, attempting cleanup...`);
        
        // Get process info
        const { spawn } = require('child_process');
        const lsof = spawn('lsof', ['-i', `:${port}`, '-t'], { stdio: 'pipe' });
        
        let output = '';
        lsof.stdout.on('data', (data: Buffer) => {
          output += data.toString();
        });
        
        lsof.on('close', (code: number) => {
          if (code === 0 && output.trim()) {
            const pids = output.trim().split('\n').map(pid => parseInt(pid)).filter(pid => !isNaN(pid));
            orphanedProcesses.push(...pids);
          }
        });
        
        await new Promise(resolve => lsof.on('close', resolve));
      }
    } catch (error) {
      console.warn(`Error checking port ${port}:`, error);
    }
  }
  
  // Kill orphaned processes
  for (const pid of orphanedProcesses) {
    try {
      console.log(`Killing orphaned process PID ${pid}`);
      process.kill(pid, 'SIGTERM');
      
      // Wait and force kill if needed
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        // Process already terminated
      }
    } catch (error) {
      console.warn(`Failed to kill orphaned process ${pid}:`, error);
    }
  }
  
  if (orphanedProcesses.length > 0) {
    console.log(`Cleaned up ${orphanedProcesses.length} orphaned database processes`);
  } else {
    console.log('No orphaned database processes found');
  }
}

// Helper function to check if Homebrew is installed
async function isHomebrewInstalled(): Promise<boolean> {
  try {
    const isInstalled = await new Promise<boolean>((resolve) => {
      const brew = spawn('which', ['brew']);
      brew.on('close', (code) => {
        resolve(code === 0);
      });
    });
    return isInstalled;
  } catch (error) {
    console.error('Error checking Homebrew installation:', error);
    return false;
  }
}

// Helper function to install Homebrew
async function installHomebrew(): Promise<boolean> {
  try {
    console.log('Installing Homebrew...');
    const installSuccess = await new Promise<boolean>((resolve) => {
      const curl = spawn('curl', ['-fsSL', 'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh']);
      
      curl.stdout.on('data', (data) => {
        console.log(`Homebrew install: ${data}`);
      });
      
      curl.stderr.on('data', (data) => {
        console.error(`Homebrew install error: ${data}`);
      });
      
      curl.on('close', (code) => {
        if (code === 0) {
          // Run the install script
          const installScript = spawn('bash', ['-c', 'curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh | bash']);
          installScript.on('close', (scriptCode) => {
            resolve(scriptCode === 0);
          });
        } else {
          resolve(false);
        }
      });
    });
    
    if (installSuccess) {
      console.log('Homebrew installed successfully');
      // Add Homebrew to PATH for current session
      process.env.PATH = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`;
    }
    
    return installSuccess;
  } catch (error) {
    console.error('Failed to install Homebrew:', error);
    return false;
  }
}

// Helper function to check if database binary already exists locally
async function checkLocalDatabaseExists(type: string, version: string): Promise<boolean> {
  try {
    const packageName = getHomebrewPackageName(type, version);
    console.log(`Checking if ${packageName} is installed...`);

    const isInstalled = await new Promise<boolean>((resolve) => {
      const brew = spawn('brew', ['list', '--versions', packageName]);
      let output = '';

      brew.stdout.on('data', (data) => {
        output += data.toString();
      });

      brew.on('close', (code) => {
        const installed = code === 0 && output.includes(packageName);
        console.log(`Package ${packageName} installed: ${installed}`);
        resolve(installed);
      });
    });

    return isInstalled;
  } catch (error) {
    console.error('Error checking local database:', error);
    return false;
  }
}

// Helper function to get Homebrew package name
function getHomebrewPackageName(dbType: string, version: string): string {
  const packages: { [key: string]: string } = {
    postgresql: `postgresql@${version.split('.')[0]}`,
    mysql: version.startsWith('8.0') ? 'mysql@8.0' : version.startsWith('8.4') ? 'mysql@8.4' : 'mysql',
    mariadb: getMariaDBPackageName(version),
    mongodb: 'mongodb-community',
    cassandra: 'cassandra',
  };
  return packages[dbType] || dbType;
}

// Helper function to get correct MariaDB package name
function getMariaDBPackageName(version: string): string {
  // Map MariaDB versions to available Homebrew packages
  const versionMap: { [key: string]: string } = {
    '11.2.2': 'mariadb@11.2',
    '11.1.3': 'mariadb@11.2', // Use closest available version
    '10.11.6': 'mariadb@10.11',
    '10.10.7': 'mariadb@10.11', // Use closest available version
    '10.9.9': 'mariadb@10.11', // Use closest available version
  };
  
  // Check for exact match first
  if (versionMap[version]) {
    return versionMap[version];
  }
  
  // Check for major.minor match
  const majorMinor = version.split('.').slice(0, 2).join('.');
  if (majorMinor === '11.2') return 'mariadb@11.2';
  if (majorMinor === '11.1') return 'mariadb@11.2';
  if (majorMinor === '10.11') return 'mariadb@10.11';
  if (majorMinor === '10.10') return 'mariadb@10.11';
  if (majorMinor === '10.9') return 'mariadb@10.11';
  
  // Default to latest available version
  return 'mariadb@11.2';
}

// Helper function to initialize database server (without creating named database)
async function initializeDatabaseServer(type: string, version: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    const packageName = getHomebrewPackageName(type, version);
    
    switch (type) {
      case 'postgresql':
        return await initializePostgreSQLServer(packageName, dataPath, username, password, port);
      case 'mysql':
        return await initializeMySQLServer(packageName, dataPath, username, password, port);
      case 'mariadb':
        return await initializeMariaDBServer(packageName, dataPath, username, password, port);
      case 'mongodb':
        return await initializeMongoDBServer(packageName, dataPath, username, password, port);
      default:
        console.log(`No specific initialization needed for ${type}`);
        return true;
    }
  } catch (error) {
    console.error(`Failed to initialize ${type} database server:`, error);
    return false;
  }
}

// Helper function to create named database after server is running
async function createNamedDatabase(type: string, version: string, dataPath: string, username: string, password: string, port: number, databaseName: string): Promise<boolean> {
  try {
    const packageName = getHomebrewPackageName(type, version);
    
    switch (type) {
      case 'postgresql':
        return await createPostgreSQLDatabaseAfterStart(dataPath, databaseName, port, username);
      case 'mysql':
        return await createMySQLDatabaseAfterStart(dataPath, databaseName, port, username, password);
      case 'mariadb':
        return await createMariaDBDatabaseAfterStart(dataPath, databaseName, port, username, password);
      case 'mongodb':
        return await createMongoDBDatabaseAfterStart(dataPath, databaseName, port, username, password);
      default:
        console.log(`No specific database creation needed for ${type}`);
        return true;
    }
  } catch (error) {
    console.error(`Failed to create named database for ${type}:`, error);
    return false;
  }
}

// Helper function to create a named PostgreSQL database after server is running
async function createPostgreSQLDatabaseAfterStart(dataPath: string, dbName: string, port: number, username: string): Promise<boolean> {
  try {
    const postgresPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin';
    
    // Create the named database by connecting to the running server
    console.log(`Creating database '${dbName}' on running PostgreSQL server...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const createdb = spawn(`${postgresPath}/createdb`, [
        '-h', 'localhost',
        '-p', port.toString(),
        '-U', username,
        dbName
      ], {
        stdio: 'inherit',
        env: { 
          ...process.env, 
          PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH,
          PGUSER: username,
          PGPASSWORD: '', // No password for local connections
          PGHOST: 'localhost',
          PGPORT: port.toString()
        }
      });
      
      createdb.on('close', (code) => {
        console.log(`createdb exited with code: ${code}`);
        resolve(code === 0);
      });
      
      createdb.on('error', (error) => {
        console.error('createdb error:', error);
        resolve(false);
      });
    });
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create PostgreSQL database:', error);
    return false;
  }
}

// Helper function to create a named PostgreSQL database (legacy - for temporary use during init)
async function createPostgreSQLDatabase(pgDataPath: string, dbName: string, port: number): Promise<boolean> {
  try {
    const postgresPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin';
    
    // Start PostgreSQL temporarily
    console.log('Starting PostgreSQL temporarily to create database...');
    const startSuccess = await new Promise<boolean>((resolve) => {
      const pgctl = spawn(`${postgresPath}/pg_ctl`, [
        'start',
        '-D', pgDataPath,
        '-l', path.join(pgDataPath, 'postgresql.log'),
        '-o', `-p ${port}`
      ], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });
      
      pgctl.on('close', (code) => {
        console.log(`pg_ctl start exited with code: ${code}`);
        resolve(code === 0);
      });
    });
    
    if (!startSuccess) {
      console.error('Failed to start PostgreSQL for database creation');
      return false;
    }
    
    // Wait a moment for PostgreSQL to fully start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Create the named database
    console.log(`Creating database '${dbName}'...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const createdb = spawn(`${postgresPath}/createdb`, [
        '-h', 'localhost',
        '-p', port.toString(),
        '-U', 'postgres', // Use the postgres superuser
        dbName
      ], {
        stdio: 'inherit',
        env: { 
          ...process.env, 
          PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH,
          PGUSER: 'postgres', // Set the default user
          PGPASSWORD: '', // No password for local connections
          PGHOST: 'localhost',
          PGPORT: port.toString()
        }
      });
      
      createdb.on('close', (code) => {
        console.log(`createdb exited with code: ${code}`);
        resolve(code === 0);
      });
      
      createdb.on('error', (error) => {
        console.error('createdb error:', error);
        resolve(false);
      });
    });
    
    // Stop PostgreSQL
    console.log('Stopping PostgreSQL after database creation...');
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const pgctl = spawn(`${postgresPath}/pg_ctl`, ['stop', '-D', pgDataPath], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });
      
      pgctl.on('close', (code) => {
        console.log(`pg_ctl stop exited with code: ${code}`);
        resolve(code === 0);
      });
    });
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create PostgreSQL database:', error);
    return false;
  }
}

// PostgreSQL server initialization (without creating named database)
async function initializePostgreSQLServer(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create PostgreSQL data directory
    const pgDataPath = path.join(dataPath, 'postgresql_data');
    console.log(`Creating PostgreSQL data directory: ${pgDataPath}`);
    
    if (!fs.existsSync(pgDataPath)) {
      fs.mkdirSync(pgDataPath, { recursive: true });
      console.log('PostgreSQL data directory created');
    } else {
      console.log('PostgreSQL data directory already exists');
    }

    // Ensure proper permissions for PostgreSQL data directory
    try {
      fs.chmodSync(pgDataPath, 0o700); // rwx for owner only
      console.log('Set proper permissions on PostgreSQL data directory');
    } catch (error) {
      console.warn('Could not set permissions on data directory:', error);
    }

    // Check if directory is already initialized
    const pgVersionPath = path.join(pgDataPath, 'PG_VERSION');
    if (fs.existsSync(pgVersionPath)) {
      console.log('PostgreSQL data directory is already initialized');
      return true;
    }

    // Initialize PostgreSQL database
    console.log(`Running initdb for PostgreSQL...`);
    const initSuccess = await new Promise<boolean>((resolve) => {
      // Use the full path to initdb from the PostgreSQL server installation
      const initdbPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin/initdb';
      const postgresPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin';
      const initdb = spawn(initdbPath, ['-D', pgDataPath, '-U', username], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });
      
      initdb.on('close', (code) => {
        console.log(`initdb exited with code: ${code}`);
        resolve(code === 0);
      });
      
      initdb.on('error', (error) => {
        console.error('initdb error:', error);
        resolve(false);
      });
    });

    if (initSuccess) {
      console.log(`PostgreSQL database initialized at ${pgDataPath}`);
      
      // Create a basic configuration
      const configPath = path.join(pgDataPath, 'postgresql.conf');
      const configContent = `
# PostgreSQL configuration
port = ${port}
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 128MB
`;
      fs.writeFileSync(configPath, configContent);
      console.log('PostgreSQL configuration file created');
      
      console.log(`PostgreSQL server initialized successfully`);
      return true;
    } else {
      console.error('initdb failed to initialize PostgreSQL database');
      return false;
    }
  } catch (error) {
    console.error('PostgreSQL initialization failed:', error);
    return false;
  }
}

// Helper function to create a named MySQL database after server is running
async function createMySQLDatabaseAfterStart(dataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    const packageName = 'mysql@8.0'; // Default to MySQL 8.0
    const mysqlPath = getHomebrewBinaryPath('mysql', packageName);
    
    // Create the named database by connecting to the running server
    console.log(`Creating database '${dbName}' on running MySQL server...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mysql = spawn(mysqlPath, [
        '-u', 'root', // Use root user
        '-h', '127.0.0.1',
        '-P', port.toString(),
        '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      ], {
        env: { 
          ...process.env, 
          PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
        }
      });
      
      mysql.on('close', (code) => {
        console.log(`mysql CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysql.on('error', (error) => {
        console.error(`mysql CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MySQL database:', error);
    return false;
  }
}

// Helper function to create a named MySQL database (legacy - for temporary use during init)
async function createMySQLDatabase(mysqlDataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    const packageName = 'mysql@8.0'; // Default to MySQL 8.0
    const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
    const mysqlPath = getHomebrewBinaryPath('mysql', packageName);
    
    // Start MySQL temporarily
    console.log('Starting MySQL temporarily to create database...');
    const mysqld = spawn(mysqldPath, [
      `--datadir=${mysqlDataPath}`,
      `--port=${port}`,
      `--user=${username}`,
      '--skip-networking=false',
      '--bind-address=127.0.0.1',
      '--skip-grant-tables'
    ]);
    
    // Wait for MySQL to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Create the named database
    console.log(`Creating database '${dbName}'...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mysql = spawn(mysqlPath, [
        '-u', 'root', // Use root user when skip-grant-tables is enabled
        '-h', '127.0.0.1',
        '-P', port.toString(),
        '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      ], {
        env: { 
          ...process.env, 
          PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
        }
      });
      
      mysql.on('close', (code) => {
        console.log(`mysql CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysql.on('error', (error) => {
        console.error(`mysql CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    // Stop MySQL
    console.log('Stopping MySQL after database creation...');
    mysqld.kill('SIGTERM');
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MySQL database:', error);
    return false;
  }
}

// Helper function to create a named MariaDB database after server is running
async function createMariaDBDatabaseAfterStart(dataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    const packageName = 'mariadb@11.2'; // Use available MariaDB version
    const mysqlPath = getHomebrewBinaryPath('mysql', packageName);
    
    // Create the named database by connecting to the running server
    console.log(`Creating database '${dbName}' on running MariaDB server...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mysql = spawn(mysqlPath, [
        '-u', 'root', // Use root user
        '-h', '127.0.0.1',
        '-P', port.toString(),
        '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      ], {
        env: { 
          ...process.env, 
          PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
        }
      });
      
      mysql.on('close', (code) => {
        console.log(`mysql CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysql.on('error', (error) => {
        console.error(`mysql CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MariaDB database:', error);
    return false;
  }
}

// Helper function to create a named MariaDB database (legacy - for temporary use during init)
async function createMariaDBDatabase(mariadbDataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    const packageName = 'mariadb@11.2'; // Use available MariaDB version
    const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
    const mysqlPath = getHomebrewBinaryPath('mysql', packageName);
    
    // Start MariaDB temporarily
    console.log('Starting MariaDB temporarily to create database...');
    const mariadbd = spawn(mysqldPath, [
      `--datadir=${mariadbDataPath}`,
      `--port=${port}`,
      `--user=${username}`,
      '--skip-networking=false',
      '--bind-address=127.0.0.1',
      '--skip-grant-tables'
    ]);
    
    // Wait for MariaDB to start
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Create the named database
    console.log(`Creating database '${dbName}'...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mysql = spawn(mysqlPath, [
        '-u', 'root', // Use root user when skip-grant-tables is enabled
        '-h', '127.0.0.1',
        '-P', port.toString(),
        '-e', `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`
      ], {
        env: { 
          ...process.env, 
          PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
        }
      });
      
      mysql.on('close', (code) => {
        console.log(`mysql CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mysql.on('error', (error) => {
        console.error(`mysql CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    // Stop MariaDB
    console.log('Stopping MariaDB after database creation...');
    mariadbd.kill('SIGTERM');
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MariaDB database:', error);
    return false;
  }
}

// Helper function to create a named MongoDB database after server is running
async function createMongoDBDatabaseAfterStart(dataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    // Create the named database by connecting to the running server
    console.log(`Creating database '${dbName}' on running MongoDB server...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mongosh = spawn('mongosh', [
        `--port=${port}`,
        '--eval', `db = db.getSiblingDB('${dbName}'); db.test.insertOne({created: new Date()});`
      ], {
        env: { 
          ...process.env, 
          PATH: process.env.PATH + ':/opt/homebrew/bin:/usr/local/bin'
        }
      });
      
      mongosh.on('close', (code) => {
        console.log(`mongosh CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mongosh.on('error', (error) => {
        console.error(`mongosh CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MongoDB database:', error);
    return false;
  }
}

// Helper function to create a named MongoDB database (legacy - for temporary use during init)
async function createMongoDBDatabase(mongoDataPath: string, dbName: string, port: number, username: string, password: string): Promise<boolean> {
  try {
    // Start MongoDB temporarily
    console.log('Starting MongoDB temporarily to create database...');
    const mongod = spawn('mongod', [
      `--dbpath=${mongoDataPath}`,
      `--port=${port}`,
      '--bind_ip=127.0.0.1'
    ]);
    
    // Wait for MongoDB to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Create the named database
    console.log(`Creating database '${dbName}'...`);
    const createSuccess = await new Promise<boolean>((resolve) => {
      const mongosh = spawn('mongosh', [
        `--port=${port}`,
        '--eval', `db = db.getSiblingDB('${dbName}'); db.test.insertOne({created: new Date()});`
      ]);
      
      mongosh.on('close', (code) => {
        console.log(`mongosh CREATE DATABASE exited with code: ${code}`);
        resolve(code === 0);
      });
      
      mongosh.on('error', (error) => {
        console.error(`mongosh CREATE DATABASE error: ${error}`);
        resolve(false);
      });
    });
    
    // Stop MongoDB
    console.log('Stopping MongoDB after database creation...');
    mongod.kill('SIGTERM');
    
    return createSuccess;
  } catch (error) {
    console.error('Failed to create MongoDB database:', error);
    return false;
  }
}

// Helper function to check if a port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    
    server.listen(port, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Helper function to get Homebrew binary path
function getHomebrewBinaryPath(binaryName: string, packageName: string): string {
  // Try common Homebrew paths
  const possiblePaths = [
    `/opt/homebrew/opt/${packageName}/bin/${binaryName}`,
    `/usr/local/opt/${packageName}/bin/${binaryName}`,
    `/opt/homebrew/bin/${binaryName}`,
    `/usr/local/bin/${binaryName}`,
    binaryName // fallback to system PATH
  ];
  
  for (const binaryPath of possiblePaths) {
    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  }
  
  return binaryName; // fallback
}

// MySQL server initialization (without creating named database)
async function initializeMySQLServer(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MySQL data directory
    const mysqlDataPath = path.join(dataPath, 'mysql_data');
    if (!fs.existsSync(mysqlDataPath)) {
      fs.mkdirSync(mysqlDataPath, { recursive: true });
    }

    // Get the correct mysqld binary path
    const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
    console.log(`Using mysqld at: ${mysqldPath}`);

    // Initialize MySQL database
    const initSuccess = await new Promise<boolean>((resolve) => {
      const mysqld = spawn(mysqldPath, ['--initialize-insecure', `--datadir=${mysqlDataPath}`, `--user=${username}`]);
      
      mysqld.stdout.on('data', (data) => {
        console.log(`MySQL init stdout: ${data}`);
      });
      
      mysqld.stderr.on('data', (data) => {
        console.log(`MySQL init stderr: ${data}`);
      });
      
      mysqld.on('close', (code) => {
        console.log(`MySQL init process exited with code ${code}`);
        resolve(code === 0);
      });
      
      mysqld.on('error', (error) => {
        console.error(`MySQL init process error: ${error}`);
        resolve(false);
      });
    });

    if (initSuccess) {
      console.log(`MySQL database server initialized at ${mysqlDataPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('MySQL initialization failed:', error);
    return false;
  }
}

// MariaDB server initialization (without creating named database)
async function initializeMariaDBServer(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MariaDB data directory
    const mariadbDataPath = path.join(dataPath, 'mariadb_data');
    if (!fs.existsSync(mariadbDataPath)) {
      fs.mkdirSync(mariadbDataPath, { recursive: true });
    }

    // Get the correct mysql_install_db binary path
    const mysqlInstallDbPath = getHomebrewBinaryPath('mysql_install_db', packageName);
    console.log(`Using mysql_install_db at: ${mysqlInstallDbPath}`);
    
    // For newer MariaDB versions, use mysqld --initialize-insecure instead
    const useNewInit = packageName.includes('@11');

    // Initialize MariaDB database
    const initSuccess = await new Promise<boolean>((resolve) => {
      let mariadbInstall;
      
      if (useNewInit) {
        // Use mysqld --initialize-insecure for newer MariaDB versions
        const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
        console.log(`Using mysqld --initialize-insecure for MariaDB ${packageName}`);
        mariadbInstall = spawn(mysqldPath, ['--initialize-insecure', `--datadir=${mariadbDataPath}`, `--user=${username}`]);
      } else {
        // Use mysql_install_db for older versions
        mariadbInstall = spawn(mysqlInstallDbPath, [`--datadir=${mariadbDataPath}`, `--user=${username}`]);
      }
      
      mariadbInstall.stdout.on('data', (data) => {
        console.log(`MariaDB init stdout: ${data}`);
      });
      
      mariadbInstall.stderr.on('data', (data) => {
        console.log(`MariaDB init stderr: ${data}`);
      });
      
      mariadbInstall.on('close', (code) => {
        console.log(`MariaDB init process exited with code ${code}`);
        resolve(code === 0);
      });
      
      mariadbInstall.on('error', (error) => {
        console.error(`MariaDB init process error: ${error}`);
        resolve(false);
      });
    });

    if (initSuccess) {
      console.log(`MariaDB database server initialized at ${mariadbDataPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('MariaDB initialization failed:', error);
    return false;
  }
}

// MongoDB server initialization (without creating named database)
async function initializeMongoDBServer(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MongoDB data directory
    const mongoDataPath = path.join(dataPath, 'mongodb_data');
    if (!fs.existsSync(mongoDataPath)) {
      fs.mkdirSync(mongoDataPath, { recursive: true });
    }

    console.log(`MongoDB data directory created at ${mongoDataPath}`);
    console.log(`MongoDB server initialized successfully`);
    return true;
  } catch (error) {
    console.error('MongoDB initialization failed:', error);
    return false;
  }
}

// Helper function to start database service
async function startDatabaseService(db: any): Promise<any> {
  try {
    let process: any = null;
    
    switch (db.type) {
      case 'postgresql':
        process = await startPostgreSQLService(db);
        break;
      case 'mysql':
        process = await startMySQLService(db);
        break;
      case 'mariadb':
        process = await startMariaDBService(db);
        break;
      case 'mongodb':
        process = await startMongoDBService(db);
        break;
      case 'cassandra':
        process = await startCassandraService(db);
        break;
      default:
        console.log(`Starting ${db.type} via Homebrew services`);
        process = spawn('brew', ['services', 'start', db.packageName]);
        break;
    }
    
    // Track the starting process only if it's a real process object
    if (process && typeof process === 'object' && process.pid !== undefined) {
      startingProcesses.set(db.id, { process, type: db.type, port: db.port });
      
      // Remove from starting processes when it completes
      process.on('close', () => {
        startingProcesses.delete(db.id);
      });
      
      process.on('error', () => {
        startingProcesses.delete(db.id);
      });
    }
    
    return process;
  } catch (error) {
    console.error(`Failed to start ${db.type} service:`, error);
    return null;
  }
}

// PostgreSQL service start
async function startPostgreSQLService(db: any): Promise<boolean> {
  try {
    const pgDataPath = path.join(db.dataPath, 'postgresql_data');
    const logPath = path.join(pgDataPath, 'postgresql.log');

    console.log(`Starting PostgreSQL from data directory: ${pgDataPath}`);
    console.log(`Using port: ${db.port}`);

    // Check if data directory exists and is initialized
    if (!fs.existsSync(pgDataPath)) {
      console.error('PostgreSQL data directory does not exist:', pgDataPath);
      return false;
    }

    // Start PostgreSQL with custom data directory and port
    const startSuccess = await new Promise<boolean>((resolve) => {
      const pgctlPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin/pg_ctl';
      const postgresPath = '/opt/homebrew/Cellar/postgresql@16/16.10/bin';
      const pgctl = spawn(pgctlPath, [
        'start',
        '-D', pgDataPath,
        '-l', logPath,
        '-o', `-p ${db.port}`,
        '-w' // Wait for startup to complete
      ], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });

      pgctl.on('close', (code) => {
        console.log('pg_ctl process exited with code:', code);
        resolve(code === 0);
      });

      pgctl.on('error', (error) => {
        console.error('pg_ctl error:', error);
        resolve(false);
      });

      // Set a timeout in case it hangs
      setTimeout(() => {
        if (!pgctl.killed) {
          console.log('pg_ctl taking too long, but continuing...');
          // Don't kill the process, just resolve as success since pg_ctl might still be working
          resolve(true);
        }
      }, 20000); // 20 second timeout
    });

    if (startSuccess) {
      // Wait a moment for PostgreSQL to fully start, then get the main process PID
      setTimeout(async () => {
        try {
          const { spawn } = require('child_process');
          const lsof = spawn('lsof', ['-i', `:${db.port}`, '-t'], { stdio: 'pipe' });
          
          let output = '';
          lsof.stdout.on('data', (data: Buffer) => {
            output += data.toString();
          });
          
          lsof.on('close', (code: number) => {
            if (code === 0 && output.trim()) {
              const pids = output.trim().split('\n').map(pid => parseInt(pid)).filter(pid => !isNaN(pid));
              if (pids.length > 0) {
                // Track the main PostgreSQL process (usually the first one)
                const mainPid = pids[0];
                trackProcess(db.id, mainPid, 'postgresql', db.port);
                console.log(`Successfully tracked PostgreSQL process PID ${mainPid} for database ${db.id}`);
              } else {
                console.warn('No PostgreSQL process found on port', db.port);
              }
            } else {
              console.warn('Failed to find PostgreSQL process on port', db.port);
            }
          });
          
          lsof.on('error', (error: Error) => {
            console.warn('Error running lsof to track PostgreSQL process:', error);
          });
        } catch (error: any) {
          console.warn('Failed to track PostgreSQL process:', error);
        }
      }, 3000); // Wait a bit longer for PostgreSQL to fully start
    }

    console.log('PostgreSQL start result:', startSuccess);
    return startSuccess;
  } catch (error) {
    console.error('Failed to start PostgreSQL:', error);
    return false;
  }
}

// MySQL service start
async function startMySQLService(db: any): Promise<any> {
  try {
    const mysqlDataPath = path.join(db.dataPath, 'mysql_data');
    
    // Get the correct mysqld binary path
    const packageName = getHomebrewPackageName(db.type, db.version);
    const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
    console.log(`Starting MySQL with mysqld at: ${mysqldPath}`);
    
    // Start MySQL with custom data directory and port
    const mysqld = spawn(mysqldPath, [
      `--datadir=${mysqlDataPath}`,
      `--port=${db.port}`,
      `--user=${db.username}`,
      '--skip-networking=false',
      '--bind-address=127.0.0.1'
    ]);
    
    mysqld.stdout.on('data', (data) => {
      console.log(`MySQL start stdout: ${data}`);
    });
    
    mysqld.stderr.on('data', (data) => {
      console.log(`MySQL start stderr: ${data}`);
    });
    
    mysqld.on('close', (code) => {
      console.log(`MySQL start process exited with code ${code}`);
    });
    
    mysqld.on('error', (error) => {
      console.error(`MySQL start process error: ${error}`);
    });
    
    return mysqld;
  } catch (error) {
    console.error('Failed to start MySQL:', error);
    return null;
  }
}

// MariaDB service start
async function startMariaDBService(db: any): Promise<any> {
  try {
    const mariadbDataPath = path.join(db.dataPath, 'mariadb_data');
    
    // Get the correct mysqld binary path (MariaDB uses mysqld)
    const packageName = getHomebrewPackageName(db.type, db.version);
    const mysqldPath = getHomebrewBinaryPath('mysqld', packageName);
    console.log(`Starting MariaDB with mysqld at: ${mysqldPath}`);
    
    // Start MariaDB with custom data directory and port
    const mariadbd = spawn(mysqldPath, [
      `--datadir=${mariadbDataPath}`,
      `--port=${db.port}`,
      `--user=${db.username}`,
      '--skip-networking=false',
      '--bind-address=127.0.0.1'
    ]);
    
    mariadbd.stdout.on('data', (data) => {
      console.log(`MariaDB start stdout: ${data}`);
    });
    
    mariadbd.stderr.on('data', (data) => {
      console.log(`MariaDB start stderr: ${data}`);
    });
    
    mariadbd.on('close', (code) => {
      console.log(`MariaDB start process exited with code ${code}`);
    });
    
    mariadbd.on('error', (error) => {
      console.error(`MariaDB start process error: ${error}`);
    });
    
    return mariadbd;
  } catch (error) {
    console.error('Failed to start MariaDB:', error);
    return null;
  }
}

// MongoDB service start
async function startMongoDBService(db: any): Promise<boolean> {
  try {
    const mongoDataPath = path.join(db.dataPath, 'mongodb_data');
    
    // Start MongoDB with custom data directory and port
    const startSuccess = await new Promise<boolean>((resolve) => {
      const mongod = spawn('mongod', [
        `--dbpath=${mongoDataPath}`,
        `--port=${db.port}`,
        '--bind_ip=127.0.0.1'
      ]);
      
      mongod.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return startSuccess;
  } catch (error) {
    console.error('Failed to start MongoDB:', error);
    return false;
  }
}

// Cassandra service start
async function startCassandraService(db: any): Promise<boolean> {
  try {
    // Start Cassandra via Homebrew services
    const startSuccess = await new Promise<boolean>((resolve) => {
      const process = spawn('brew', ['services', 'start', db.packageName]);
      process.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return startSuccess;
  } catch (error) {
    console.error('Failed to start Cassandra:', error);
    return false;
  }
}

// Helper function to get start command for different database types
function getStartCommand(dbType: string, packageName: string): string | null {
  const commands: { [key: string]: string } = {
    postgresql: 'brew services start',
    mysql: 'brew services start',
    mariadb: 'brew services start',
    mongodb: 'brew services start',
    cassandra: 'brew services start',
  };
  return commands[dbType] || null;
}
