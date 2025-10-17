import { contextBridge, ipcRenderer } from 'electron';

export interface DatabaseType {
  id: string;
  name: string;
  defaultPort: number;
  icon: string;
  defaultUsername: string;
  defaultPassword: string;
}

export interface DatabaseConfig {
  type: string;
  name: string;
  version: string;
  port: number;
  dataPath: string;
  username?: string;
  password?: string;
  useCustomCredentials?: boolean;
}

export interface DatabaseInstance {
  id: string;
  name: string;
  type: string;
  version: string;
  port: number;
  status: 'running' | 'stopped' | 'starting' | 'error';
  dataPath: string;
  username: string;
  databaseName: string;
  encryptedPassword: string;
  useCustomCredentials: boolean;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getDatabaseTypes: (): Promise<DatabaseType[]> => 
    ipcRenderer.invoke('get-database-types'),
  
  getDatabaseVersions: (dbType: string): Promise<string[]> => 
    ipcRenderer.invoke('get-database-versions', dbType),
  
  selectFolder: (): Promise<string | null> => 
    ipcRenderer.invoke('select-folder'),
  
  installDatabase: (config: DatabaseConfig): Promise<{ success: boolean; message: string; path?: string }> => 
    ipcRenderer.invoke('install-database', config),
  
  getInstalledDatabases: (): Promise<DatabaseInstance[]> => 
    ipcRenderer.invoke('get-installed-databases'),
  
  startDatabase: (dbId: string): Promise<{ success: boolean; message: string; conflict?: boolean; conflictingDb?: any; suggestedPort?: number; canResolve?: boolean; blocking?: boolean; suggestedAction?: string }> => 
    ipcRenderer.invoke('start-database', dbId),
  
  stopDatabase: (dbId: string): Promise<{ success: boolean; message: string }> => 
    ipcRenderer.invoke('stop-database', dbId),
  
  deleteDatabase: (dbId: string): Promise<{ success: boolean; message: string }> => 
    ipcRenderer.invoke('delete-database', dbId),
  
  encryptPassword: (password: string): Promise<string> => 
    ipcRenderer.invoke('encrypt-password', password),
  
  decryptPassword: (encryptedPassword: string): Promise<string> => 
    ipcRenderer.invoke('decrypt-password', encryptedPassword),
  
  checkPortConflict: (port: number): Promise<{ hasConflict: boolean; conflictingDb?: any; suggestedPort?: number }> => 
    ipcRenderer.invoke('check-port-conflict', port),
  
  checkDuplicateDatabase: (config: any): Promise<{ isDuplicate: boolean; existingDb?: any }> => 
    ipcRenderer.invoke('check-duplicate-database', config),
  
  checkNameConflict: (name: string): Promise<{ hasConflict: boolean; conflictingDb?: any }> => 
    ipcRenderer.invoke('check-name-conflict', name),
  
  updateDatabasePort: (dbId: string, newPort: number): Promise<{ success: boolean; message: string; conflict?: boolean }> => 
    ipcRenderer.invoke('update-database-port', dbId, newPort),
  
  checkDatabaseStatus: (id: string) => ipcRenderer.invoke('check-database-status', id),
  
  createNamedDatabase: (id: string) => ipcRenderer.invoke('create-named-database', id),
  
  resolvePortConflict: (dbId: string, conflictingDbId: string) => ipcRenderer.invoke('resolve-port-conflict', dbId, conflictingDbId),
  
  onDatabaseStatusUpdate: (callback: (data: { id: string; status: string }) => void) => {
    ipcRenderer.on('database-status-updated', (event, data) => callback(data));
  },
  
  removeDatabaseStatusListener: () => {
    ipcRenderer.removeAllListeners('database-status-updated');
  },
});
