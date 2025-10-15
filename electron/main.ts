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
      return JSON.parse(data);
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
    
    return stopSuccess;
  } catch (error) {
    console.error('Failed to stop PostgreSQL:', error);
    return false;
  }
}

// MySQL service stop
async function stopMySQLService(db: any): Promise<boolean> {
  try {
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const mysqladmin = spawn('mysqladmin', ['-u', db.username, '-p' + db.password, 'shutdown'], {
        stdio: 'inherit'
      });
      
      mysqladmin.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return stopSuccess;
  } catch (error) {
    console.error('Failed to stop MySQL:', error);
    return false;
  }
}

// MariaDB service stop
async function stopMariaDBService(db: any): Promise<boolean> {
  try {
    const stopSuccess = await new Promise<boolean>((resolve) => {
      const mysqladmin = spawn('mysqladmin', ['-u', db.username, '-p' + db.password, 'shutdown'], {
        stdio: 'inherit'
      });
      
      mysqladmin.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return stopSuccess;
  } catch (error) {
    console.error('Failed to stop MariaDB:', error);
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
    const databases = await loadDatabases();
    const runningDatabases = databases.filter((db: any) => db.status === 'running');
    
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

// Stop all databases when app is about to quit
app.on('before-quit', async (event) => {
  console.log('App is about to quit, stopping all databases...');
  await stopAllRunningDatabases();
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

    // Initialize and configure the database after installation
    if (installSuccess) {
      console.log(`Initializing ${type} database...`);
      const initSuccess = await initializeDatabase(type, version, dbPath, finalUsername, finalPassword, port);
      if (!initSuccess) {
        console.warn(`Failed to initialize ${type} database, but continuing with installation`);
      } else {
        console.log(`${type} database initialized successfully`);
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
      databaseName: name, // Store the actual database name
      encryptedPassword: encryptPassword(finalPassword),
      useCustomCredentials: useCustomCredentials || false,
    };
    
    // Save to persistent storage
    const allDatabases = await loadDatabases();
    allDatabases.push(dbConfig);
    saveDatabases(allDatabases);
    
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

    // Check for port conflicts with running databases
    const portCheck = await isPortInUseByRunningDatabase(db.port);
    
    if (portCheck.inUse) {
      return {
        success: false,
        message: `Port ${db.port} is already in use by "${portCheck.conflictingDb.name}". Please stop the conflicting database first before starting this one.`,
        conflict: true,
        conflictingDb: portCheck.conflictingDb,
        blocking: true // This blocks the start operation
      };
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
    const startSuccess = await startDatabaseService(db);

    console.log(`Database start result: ${startSuccess}`);

    if (startSuccess) {
      // Update status in storage
      db.status = 'running';
      saveDatabases(databases);
      
      // Notify renderer that status is updated
      if (event.sender) {
        event.sender.send('database-status-updated', { id: dbId, status: 'running' });
      }
      
      return { success: true, message: 'Database started' };
    } else {
      // Update status back to stopped on failure
      db.status = 'stopped';
      saveDatabases(databases);
      
      // Notify renderer that status is updated
      if (event.sender) {
        event.sender.send('database-status-updated', { id: dbId, status: 'stopped' });
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
  
  return {
    inUse: !!conflictingDb,
    conflictingDb: conflictingDb
  };
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
    mariadb: `mariadb@${version.split('.')[0]}`,
    mongodb: 'mongodb-community',
    cassandra: 'cassandra',
  };
  return packages[dbType] || dbType;
}

// Helper function to initialize database
async function initializeDatabase(type: string, version: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    const packageName = getHomebrewPackageName(type, version);
    
    switch (type) {
      case 'postgresql':
        return await initializePostgreSQL(packageName, dataPath, username, password, port);
      case 'mysql':
        return await initializeMySQL(packageName, dataPath, username, password, port);
      case 'mariadb':
        return await initializeMariaDB(packageName, dataPath, username, password, port);
      case 'mongodb':
        return await initializeMongoDB(packageName, dataPath, username, password, port);
      default:
        console.log(`No specific initialization needed for ${type}`);
        return true;
    }
  } catch (error) {
    console.error(`Failed to initialize ${type} database:`, error);
    return false;
  }
}

// Helper function to create a named PostgreSQL database
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
      const createdb = spawn(`${postgresPath}/createdb`, [dbName], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });
      
      createdb.on('close', (code) => {
        console.log(`createdb exited with code: ${code}`);
        resolve(code === 0);
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

// PostgreSQL initialization
async function initializePostgreSQL(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
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
      
      // Start PostgreSQL temporarily to create the named database
      console.log(`Creating database: ${username}`);
      const createDbSuccess = await createPostgreSQLDatabase(pgDataPath, username, port);
      
      if (createDbSuccess) {
        console.log(`Database '${username}' created successfully`);
        return true;
      } else {
        console.error('Failed to create named database');
        return false;
      }
    } else {
      console.error('initdb failed to initialize PostgreSQL database');
      return false;
    }
  } catch (error) {
    console.error('PostgreSQL initialization failed:', error);
    return false;
  }
}

// MySQL initialization
async function initializeMySQL(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MySQL data directory
    const mysqlDataPath = path.join(dataPath, 'mysql_data');
    if (!fs.existsSync(mysqlDataPath)) {
      fs.mkdirSync(mysqlDataPath, { recursive: true });
    }

    // Initialize MySQL database
    const initSuccess = await new Promise<boolean>((resolve) => {
      const mysqld = spawn('mysqld', ['--initialize-insecure', `--datadir=${mysqlDataPath}`, `--user=${username}`]);
      mysqld.on('close', (code) => {
        resolve(code === 0);
      });
    });

    if (initSuccess) {
      console.log(`MySQL database initialized at ${mysqlDataPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('MySQL initialization failed:', error);
    return false;
  }
}

// MariaDB initialization
async function initializeMariaDB(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MariaDB data directory
    const mariadbDataPath = path.join(dataPath, 'mariadb_data');
    if (!fs.existsSync(mariadbDataPath)) {
      fs.mkdirSync(mariadbDataPath, { recursive: true });
    }

    // Initialize MariaDB database
    const initSuccess = await new Promise<boolean>((resolve) => {
      const mariadbInstall = spawn('mysql_install_db', [`--datadir=${mariadbDataPath}`, `--user=${username}`]);
      mariadbInstall.on('close', (code) => {
        resolve(code === 0);
      });
    });

    if (initSuccess) {
      console.log(`MariaDB database initialized at ${mariadbDataPath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('MariaDB initialization failed:', error);
    return false;
  }
}

// MongoDB initialization
async function initializeMongoDB(packageName: string, dataPath: string, username: string, password: string, port: number): Promise<boolean> {
  try {
    // Create MongoDB data directory
    const mongoDataPath = path.join(dataPath, 'mongodb_data');
    if (!fs.existsSync(mongoDataPath)) {
      fs.mkdirSync(mongoDataPath, { recursive: true });
    }

    console.log(`MongoDB data directory created at ${mongoDataPath}`);
    return true;
  } catch (error) {
    console.error('MongoDB initialization failed:', error);
    return false;
  }
}

// Helper function to start database service
async function startDatabaseService(db: any): Promise<boolean> {
  try {
    switch (db.type) {
      case 'postgresql':
        return await startPostgreSQLService(db);
      case 'mysql':
        return await startMySQLService(db);
      case 'mariadb':
        return await startMariaDBService(db);
      case 'mongodb':
        return await startMongoDBService(db);
      case 'cassandra':
        return await startCassandraService(db);
      default:
        console.log(`Starting ${db.type} via Homebrew services`);
        return await new Promise<boolean>((resolve) => {
          const process = spawn('brew', ['services', 'start', db.packageName]);
          process.on('close', (code) => {
            resolve(code === 0);
          });
        });
    }
  } catch (error) {
    console.error(`Failed to start ${db.type} service:`, error);
    return false;
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
        '-o', `-p ${db.port}`
      ], {
        stdio: 'inherit',
        env: { ...process.env, PATH: postgresPath + ':/opt/homebrew/bin:/usr/local/bin:' + process.env.PATH }
      });

      pgctl.on('close', (code) => {
        console.log('pg_ctl process exited with code:', code);
        resolve(code === 0);
      });

      // Set a timeout in case it hangs
      setTimeout(() => {
        pgctl.kill();
        console.log('pg_ctl timed out, killing process');
        resolve(false);
      }, 10000); // 10 second timeout
    });

    console.log('PostgreSQL start result:', startSuccess);
    return startSuccess;
  } catch (error) {
    console.error('Failed to start PostgreSQL:', error);
    return false;
  }
}

// MySQL service start
async function startMySQLService(db: any): Promise<boolean> {
  try {
    const mysqlDataPath = path.join(db.dataPath, 'mysql_data');
    
    // Start MySQL with custom data directory and port
    const startSuccess = await new Promise<boolean>((resolve) => {
      const mysqld = spawn('mysqld', [
        `--datadir=${mysqlDataPath}`,
        `--port=${db.port}`,
        `--user=${db.username}`,
        '--skip-networking=false',
        '--bind-address=127.0.0.1'
      ]);
      
      mysqld.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return startSuccess;
  } catch (error) {
    console.error('Failed to start MySQL:', error);
    return false;
  }
}

// MariaDB service start
async function startMariaDBService(db: any): Promise<boolean> {
  try {
    const mariadbDataPath = path.join(db.dataPath, 'mariadb_data');
    
    // Start MariaDB with custom data directory and port
    const startSuccess = await new Promise<boolean>((resolve) => {
      const mariadbd = spawn('mysqld', [
        `--datadir=${mariadbDataPath}`,
        `--port=${db.port}`,
        `--user=${db.username}`,
        '--skip-networking=false',
        '--bind-address=127.0.0.1'
      ]);
      
      mariadbd.on('close', (code) => {
        resolve(code === 0);
      });
    });
    
    return startSuccess;
  } catch (error) {
    console.error('Failed to start MariaDB:', error);
    return false;
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
