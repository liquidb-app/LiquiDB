import { DatabaseType, DatabaseConfig, DatabaseInstance } from './database';

export interface ElectronAPI {
  getDatabaseTypes: () => Promise<DatabaseType[]>;
  getDatabaseVersions: (dbType: string) => Promise<string[]>;
  selectFolder: () => Promise<string | null>;
  installDatabase: (config: DatabaseConfig) => Promise<{ success: boolean; message: string; path?: string; suggestedPort?: number; conflict?: boolean; duplicate?: boolean; existingDb?: any }>;
  getInstalledDatabases: () => Promise<DatabaseInstance[]>;
  startDatabase: (dbId: string) => Promise<{ success: boolean; message: string; conflict?: boolean; conflictingDb?: any; suggestedPort?: number }>;
  stopDatabase: (dbId: string) => Promise<{ success: boolean; message: string }>;
  deleteDatabase: (dbId: string) => Promise<{ success: boolean; message: string }>;
  encryptPassword: (password: string) => Promise<string>;
  decryptPassword: (encryptedPassword: string) => Promise<string>;
  checkPortConflict: (port: number) => Promise<{ hasConflict: boolean; conflictingDb?: any; suggestedPort?: number }>;
  checkDuplicateDatabase: (config: any) => Promise<{ isDuplicate: boolean; existingDb?: any }>;
  updateDatabasePort: (dbId: string, newPort: number) => Promise<{ success: boolean; message: string; conflict?: boolean }>;
  checkDatabaseStatus: (id: string) => Promise<{ success: boolean; message: string; status?: string }>;
  createNamedDatabase: (id: string) => Promise<{ success: boolean; message: string }>;
  onDatabaseStatusUpdate: (callback: (data: { id: string; status: string }) => void) => void;
  removeDatabaseStatusListener: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
