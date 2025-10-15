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
