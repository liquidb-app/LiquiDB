import { spawn } from 'child_process';

export interface BrewPackage {
  name: string;
  version: string;
  available: boolean;
  description?: string;
}

export class HomebrewService {
  private static sortVersions(versions: string[]): string[] {
    return versions.sort((a, b) => {
      // Handle "latest" as the highest priority
      if (a === 'latest') return -1;
      if (b === 'latest') return 1;
      
      // Split versions into parts for comparison
      const aParts = a.split('.').map(part => {
        const num = parseInt(part, 10);
        return isNaN(num) ? part : num;
      });
      const bParts = b.split('.').map(part => {
        const num = parseInt(part, 10);
        return isNaN(num) ? part : num;
      });
      
      // Compare each part
      const maxLength = Math.max(aParts.length, bParts.length);
      for (let i = 0; i < maxLength; i++) {
        const aPart = aParts[i] || 0;
        const bPart = bParts[i] || 0;
        
        if (typeof aPart === 'number' && typeof bPart === 'number') {
          if (aPart !== bPart) {
            return bPart - aPart; // Descending order (newest first)
          }
        } else if (typeof aPart === 'string' && typeof bPart === 'string') {
          const comparison = bPart.localeCompare(aPart);
          if (comparison !== 0) return comparison;
        } else {
          // Mixed types - numbers come first
          return typeof aPart === 'number' ? -1 : 1;
        }
      }
      
      return 0;
    });
  }

  private static async checkHomebrew(): Promise<boolean> {
    return new Promise((resolve) => {
      const brew = spawn('which', ['brew']);
      brew.on('close', (code) => {
        resolve(code === 0);
      });
    });
  }

  private static async runBrewCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const brew = spawn('brew', args);
      let output = '';
      let error = '';

      brew.stdout.on('data', (data) => {
        output += data.toString();
      });

      brew.stderr.on('data', (data) => {
        error += data.toString();
      });

      brew.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error(`Brew command failed: ${error}`));
        }
      });
    });
  }

  static async getAvailableVersions(dbType: string): Promise<string[]> {
    try {
      const hasHomebrew = await this.checkHomebrew();
      if (!hasHomebrew) {
        console.warn('Homebrew not available, returning fallback versions');
        return this.getFallbackVersions(dbType);
      }

      switch (dbType) {
        case 'postgresql':
          return await this.getPostgreSQLVersions();
        case 'mysql':
          return await this.getMySQLVersions();
        case 'mariadb':
          return await this.getMariaDBVersions();
        case 'mongodb':
          return await this.getMongoDBVersions();
        case 'cassandra':
          return await this.getCassandraVersions();
        default:
          return this.getFallbackVersions(dbType);
      }
    } catch (error) {
      console.error(`Failed to fetch versions for ${dbType}:`, error);
      return this.getFallbackVersions(dbType);
    }
  }

  private static async getPostgreSQLVersions(): Promise<string[]> {
    try {
      const output = await this.runBrewCommand(['search', 'postgresql']);
      const versions: string[] = [];
      
      // Extract versioned packages like postgresql@16, postgresql@15, etc.
      const matches = output.match(/postgresql@(\d+)/g);
      if (matches) {
        matches.forEach(match => {
          const version = match.replace('postgresql@', '');
          versions.push(version);
        });
      }
      
      // Add the latest version (just 'postgresql')
      if (output.includes('postgresql ')) {
        versions.push('latest');
      }
      
      return versions.length > 0 ? this.sortVersions(versions) : this.getFallbackVersions('postgresql');
    } catch (error) {
      console.error('Failed to get PostgreSQL versions:', error);
      return this.getFallbackVersions('postgresql');
    }
  }

  private static async getMySQLVersions(): Promise<string[]> {
    try {
      const output = await this.runBrewCommand(['search', 'mysql']);
      const versions: string[] = [];
      
      // Extract versioned packages like mysql@8.0, mysql@8.4, etc.
      const matches = output.match(/mysql@(\d+\.\d+)/g);
      if (matches) {
        matches.forEach(match => {
          const version = match.replace('mysql@', '');
          versions.push(version);
        });
      }
      
      // Add the latest version (just 'mysql')
      if (output.includes('mysql ')) {
        versions.push('latest');
      }
      
      return versions.length > 0 ? this.sortVersions(versions) : this.getFallbackVersions('mysql');
    } catch (error) {
      console.error('Failed to get MySQL versions:', error);
      return this.getFallbackVersions('mysql');
    }
  }

  private static async getMariaDBVersions(): Promise<string[]> {
    try {
      const output = await this.runBrewCommand(['search', 'mariadb']);
      const versions: string[] = [];
      
      // Extract versioned packages like mariadb@11.4, mariadb@11.8, etc.
      const matches = output.match(/mariadb@(\d+\.\d+)/g);
      if (matches) {
        matches.forEach(match => {
          const version = match.replace('mariadb@', '');
          // Skip disabled versions like 11.2
          if (version !== '11.2') {
            versions.push(version);
          }
        });
      }
      
      // Add the latest version (just 'mariadb')
      if (output.includes('mariadb ')) {
        versions.push('latest');
      }
      
      return versions.length > 0 ? this.sortVersions(versions) : this.getFallbackVersions('mariadb');
    } catch (error) {
      console.error('Failed to get MariaDB versions:', error);
      return this.getFallbackVersions('mariadb');
    }
  }

  private static async getMongoDBVersions(): Promise<string[]> {
    try {
      // First ensure the MongoDB tap is available
      try {
        await this.runBrewCommand(['tap', 'mongodb/brew']);
      } catch (error) {
        console.warn('Failed to tap mongodb/brew:', error);
      }

      const output = await this.runBrewCommand(['search', 'mongodb-community']);
      const versions: string[] = [];
      
      // Extract versioned packages like mongodb-community@7.0, mongodb-community@6.0, etc.
      const matches = output.match(/mongodb-community@(\d+\.\d+)/g);
      if (matches) {
        matches.forEach(match => {
          const version = match.replace('mongodb-community@', '');
          versions.push(version);
        });
      }
      
      // Add the latest version (just 'mongodb-community')
      if (output.includes('mongodb-community ')) {
        versions.push('latest');
      }
      
      return versions.length > 0 ? this.sortVersions(versions) : this.getFallbackVersions('mongodb');
    } catch (error) {
      console.error('Failed to get MongoDB versions:', error);
      return this.getFallbackVersions('mongodb');
    }
  }

  private static async getCassandraVersions(): Promise<string[]> {
    try {
      const output = await this.runBrewCommand(['search', 'cassandra']);
      const versions: string[] = [];
      
      // Cassandra typically has one main version
      if (output.includes('cassandra ')) {
        versions.push('latest');
      }
      
      return versions.length > 0 ? this.sortVersions(versions) : this.getFallbackVersions('cassandra');
    } catch (error) {
      console.error('Failed to get Cassandra versions:', error);
      return this.getFallbackVersions('cassandra');
    }
  }


  private static getFallbackVersions(dbType: string): string[] {
    const fallbackVersions: { [key: string]: string[] } = {
      postgresql: ['16', '15', '14', '13', '12'],
      mysql: ['8.0', '8.4', '5.7'],
      mariadb: ['11.4', '11.8', '12.0'],
      mongodb: ['7.0', '6.0', '5.0', '4.4'],
      cassandra: ['5.0', '4.1', '4.0'],
    };

    const versions = fallbackVersions[dbType] || [];
    return this.sortVersions(versions);
  }

  static async getPackageInfo(packageName: string): Promise<BrewPackage | null> {
    try {
      const hasHomebrew = await this.checkHomebrew();
      if (!hasHomebrew) {
        return null;
      }

      const output = await this.runBrewCommand(['info', packageName]);
      
      // Parse the output to extract version and availability
      const versionMatch = output.match(/stable (\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      
      const isAvailable = !output.includes('Disabled because');
      
      return {
        name: packageName,
        version,
        available: isAvailable,
        description: output.split('\n')[0] || ''
      };
    } catch (error) {
      console.error(`Failed to get package info for ${packageName}:`, error);
      return null;
    }
  }
}
