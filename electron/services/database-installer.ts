import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseInstallationConfig {
  type: string;
  name: string;
  version: string;
  port: number;
  dataPath: string;
}

export interface InstallationResult {
  success: boolean;
  message: string;
  path?: string;
  config?: any;
}

export class DatabaseInstaller {
  private static async checkHomebrew(): Promise<boolean> {
    return new Promise((resolve) => {
      const brew = spawn('which', ['brew']);
      brew.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  private static async installViaHomebrew(packageName: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(`Installing ${packageName} via Homebrew...`);
      const brew = spawn('brew', ['install', packageName]);
      
      brew.stdout.on('data', (data) => {
        console.log(`Homebrew: ${data}`);
      });
      
      brew.stderr.on('data', (data) => {
        console.error(`Homebrew Error: ${data}`);
      });
      
      brew.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  private static getHomebrewPackageName(dbType: string, version: string): string {
    const packages: { [key: string]: string } = {
      postgresql: `postgresql@${version.split('.')[0]}`,
      mysql: `mysql@${version.split('.')[0]}`,
      mariadb: `mariadb@${version.split('.')[0]}`,
      mongodb: 'mongodb-community',
      cassandra: 'cassandra',
    };
    
    return packages[dbType] || dbType;
  }

  private static async createDatabaseConfig(config: DatabaseInstallationConfig): Promise<any> {
    const dbConfig = {
      id: `${config.type}-${config.name}-${Date.now()}`,
      name: config.name,
      type: config.type,
      version: config.version,
      port: config.port,
      dataPath: config.dataPath,
      status: 'stopped',
      installedAt: new Date().toISOString(),
    };

    const configFile = path.join(config.dataPath, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify(dbConfig, null, 2));
    
    return dbConfig;
  }

  static async installDatabase(config: DatabaseInstallationConfig): Promise<InstallationResult> {
    try {
      // Create data directory
      const dbPath = path.join(config.dataPath, config.name);
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      // Check if Homebrew is available
      const hasHomebrew = await this.checkHomebrew();
      
      if (hasHomebrew) {
        // Install via Homebrew
        const packageName = this.getHomebrewPackageName(config.type, config.version);
        const installSuccess = await this.installViaHomebrew(packageName);
        
        if (!installSuccess) {
          return {
            success: false,
            message: `Failed to install ${config.type} via Homebrew`,
          };
        }
      } else {
        // For demo purposes, simulate installation
        console.log(`Simulating installation of ${config.type} ${config.version}`);
        console.log(`Data directory: ${dbPath}`);
        console.log(`Port: ${config.port}`);
      }

      // Create configuration file
      const dbConfig = await this.createDatabaseConfig({
        ...config,
        dataPath: dbPath,
      });

      return {
        success: true,
        message: `${config.type} ${config.version} installed successfully`,
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
  }

  static async getInstallationInstructions(dbType: string): Promise<string> {
    const instructions: { [key: string]: string } = {
      postgresql: `
        PostgreSQL Installation:
        1. Install via Homebrew: brew install postgresql@16
        2. Start service: brew services start postgresql@16
        3. Create database: createdb your_database_name
        4. Connect: psql your_database_name
      `,
      mysql: `
        MySQL Installation:
        1. Install via Homebrew: brew install mysql@8.0
        2. Start service: brew services start mysql@8.0
        3. Secure installation: mysql_secure_installation
        4. Connect: mysql -u root -p
      `,
      mongodb: `
        MongoDB Installation:
        1. Install via Homebrew: brew tap mongodb/brew && brew install mongodb-community
        2. Start service: brew services start mongodb/brew/mongodb-community
        3. Connect: mongosh
      `,
    };

    return instructions[dbType] || `Installation instructions for ${dbType} are not available.`;
  }
}
