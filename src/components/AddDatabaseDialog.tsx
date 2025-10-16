'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatabaseType, DatabaseConfig } from '@/types/database';
import { FolderOpen, Database, ChevronDown, ChevronUp, Lock, User } from 'lucide-react';

interface AddDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDatabase: (config: DatabaseConfig) => Promise<void>;
}

export function AddDatabaseDialog({ open, onOpenChange, onAddDatabase }: AddDatabaseDialogProps) {
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [versions, setVersions] = useState<string[]>([]);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [config, setConfig] = useState<DatabaseConfig>({
    type: '',
    name: '',
    version: '',
    port: 0,
    dataPath: '',
    username: '',
    password: '',
    useCustomCredentials: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [portConflict, setPortConflict] = useState<{ hasConflict: boolean; conflictingDb?: any; suggestedPort?: number } | null>(null);
  const [duplicateDb, setDuplicateDb] = useState<{ isDuplicate: boolean; existingDb?: any } | null>(null);
  const [nameConflict, setNameConflict] = useState<{ hasConflict: boolean; conflictingDb?: any } | null>(null);

  useEffect(() => {
    if (open) {
      loadDatabaseTypes();
    }
  }, [open]);

  useEffect(() => {
    if (selectedType) {
      loadVersions(selectedType);
      const dbType = databaseTypes.find(t => t.id === selectedType);
      if (dbType) {
        setConfig(prev => ({
          ...prev,
          type: selectedType,
          port: dbType.defaultPort,
          username: dbType.defaultUsername,
          password: dbType.defaultPassword,
        }));
        // Check for port conflict with new default port
        checkPortConflict(dbType.defaultPort);
      }
    }
  }, [selectedType, databaseTypes]);

  // Check for port conflicts when port changes
  useEffect(() => {
    if (config.port > 0) {
      const timeoutId = setTimeout(() => {
        checkPortConflict(config.port);
      }, 500); // Debounce the check
      return () => clearTimeout(timeoutId);
    } else {
      setPortConflict(null);
    }
  }, [config.port]);

  // Check for duplicate database when config changes
  useEffect(() => {
    if (config.type && config.version && config.dataPath) {
      const timeoutId = setTimeout(() => {
        checkForDuplicateDatabase(config);
      }, 500); // Debounce the check
      return () => clearTimeout(timeoutId);
    } else {
      setDuplicateDb(null);
    }
  }, [config.type, config.version, config.dataPath]);

  // Check for name conflicts when name changes
  useEffect(() => {
    if (config.name && config.name.trim().length > 0) {
      const timeoutId = setTimeout(() => {
        checkForNameConflict(config.name);
      }, 500); // Debounce the check
      return () => clearTimeout(timeoutId);
    } else {
      setNameConflict(null);
    }
  }, [config.name]);

  const loadDatabaseTypes = async () => {
    try {
      if (window.electronAPI) {
        const types = await window.electronAPI.getDatabaseTypes();
        setDatabaseTypes(types);
      } else {
        // Demo data for browser development
        setDatabaseTypes([
          { id: 'postgresql', name: 'PostgreSQL', defaultPort: 5432, icon: '🐘', defaultUsername: 'postgres', defaultPassword: 'postgres' },
          { id: 'mysql', name: 'MySQL', defaultPort: 3306, icon: '🐬', defaultUsername: 'root', defaultPassword: 'root' },
          { id: 'mariadb', name: 'MariaDB', defaultPort: 3306, icon: '🐚', defaultUsername: 'root', defaultPassword: 'root' },
          { id: 'mongodb', name: 'MongoDB', defaultPort: 27017, icon: '🍃', defaultUsername: 'admin', defaultPassword: 'admin' },
          { id: 'cassandra', name: 'Cassandra', defaultPort: 9042, icon: '☁️', defaultUsername: 'cassandra', defaultPassword: 'cassandra' },
          { id: 'mssql', name: 'Microsoft SQL Server', defaultPort: 1433, icon: '🗄️', defaultUsername: 'sa', defaultPassword: 'YourStrong@Passw0rd' },
          { id: 'redshift', name: 'Amazon Redshift', defaultPort: 5439, icon: '🔴', defaultUsername: 'admin', defaultPassword: 'admin' },
        ]);
      }
    } catch (error) {
      console.error('Failed to load database types:', error);
    }
  };

  const loadVersions = async (dbType: string) => {
    try {
      if (window.electronAPI) {
        const versions = await window.electronAPI.getDatabaseVersions(dbType);
        setVersions(versions);
        if (versions.length > 0) {
          setSelectedVersion(versions[0]);
          setConfig(prev => ({ ...prev, version: versions[0] }));
        }
      } else {
        // Demo versions for browser development
        const demoVersions: { [key: string]: string[] } = {
          postgresql: ['16.1', '15.5', '14.10', '13.13', '12.17'],
          mysql: ['8.0.35', '8.0.34', '8.0.33', '5.7.44', '5.6.51'],
          mariadb: ['11.2.2', '11.1.3', '10.11.6', '10.10.7', '10.9.9'],
          mongodb: ['7.0.4', '6.0.13', '5.0.22', '4.4.25', '4.2.25'],
          cassandra: ['4.1.3', '4.0.11', '3.11.16', '3.0.28'],
          mssql: ['2022', '2019', '2017', '2016'],
          redshift: ['1.0.0', '0.9.0'],
        };
        const versions = demoVersions[dbType] || ['1.0.0'];
        setVersions(versions);
        if (versions.length > 0) {
          setSelectedVersion(versions[0]);
          setConfig(prev => ({ ...prev, version: versions[0] }));
        }
      }
    } catch (error) {
      console.error('Failed to load versions:', error);
    }
  };

  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
          setConfig(prev => ({ ...prev, dataPath: folder }));
          // Check for duplicate database when folder changes
          if (selectedType && selectedVersion) {
            checkForDuplicateDatabase({ ...config, dataPath: folder, type: selectedType, version: selectedVersion });
          }
        }
      } else {
        // Demo folder selection for browser development
        const demoPath = '/Users/alex/Documents/Databases';
        setConfig(prev => ({ ...prev, dataPath: demoPath }));
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  };

  const checkPortConflict = async (port: number) => {
    try {
      if (window.electronAPI && port > 0) {
        const result = await window.electronAPI.checkPortConflict(port);
        // Only show conflict if there's actually a running database using this port
        if (result.hasConflict && result.conflictingDb) {
          setPortConflict(result);
        } else {
          setPortConflict(null);
        }
      } else {
        setPortConflict(null);
      }
    } catch (error) {
      console.error('Failed to check port conflict:', error);
      setPortConflict(null);
    }
  };

  const checkForDuplicateDatabase = async (configToCheck: any) => {
    try {
      if (window.electronAPI && configToCheck.type && configToCheck.version && configToCheck.dataPath) {
        const result = await window.electronAPI.checkDuplicateDatabase(configToCheck);
        setDuplicateDb(result);
      } else {
        setDuplicateDb(null);
      }
    } catch (error) {
      console.error('Failed to check duplicate database:', error);
      setDuplicateDb(null);
    }
  };

  const checkForNameConflict = async (name: string) => {
    try {
      if (window.electronAPI && name.trim().length > 0) {
        const result = await window.electronAPI.checkNameConflict(name);
        setNameConflict(result);
      } else {
        setNameConflict(null);
      }
    } catch (error) {
      console.error('Failed to check name conflict:', error);
      setNameConflict(null);
    }
  };

  const useSuggestedPort = () => {
    if (portConflict?.suggestedPort) {
      setConfig(prev => ({ ...prev, port: portConflict.suggestedPort }));
      setPortConflict(null);
    }
  };

  const handleSubmit = async () => {
    console.log('Form submission started with config:', config);
    console.log('Form validation:', {
      name: config.name,
      type: config.type,
      version: config.version,
      dataPath: config.dataPath,
      portConflict: portConflict?.hasConflict,
      duplicateDb: duplicateDb?.isDuplicate
    });

    if (!config.name || !config.type || !config.version) {
      console.log('Form validation failed - missing required fields');
      return;
    }

    if (duplicateDb?.isDuplicate) {
      console.log('Form validation failed - duplicate database detected');
      return;
    }

    if (nameConflict?.hasConflict) {
      console.log('Form validation failed - name conflict detected');
      return;
    }

    console.log('Form validation passed, starting installation...');
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        console.log('Using Electron API for installation');
        await onAddDatabase(config);
      } else {
        // Demo submission for browser development
        console.log('Demo: Adding database with config:', config);
        // Simulate successful installation
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log('Installation completed successfully');
      onOpenChange(false);
      // Reset form
      setConfig({
        type: '',
        name: '',
        version: '',
        port: 0,
        dataPath: '',
        username: '',
        password: '',
        useCustomCredentials: false,
      });
      setSelectedType('');
      setSelectedVersion('');
      setShowAdvanced(false);
      setPortConflict(null);
      setDuplicateDb(null);
      setNameConflict(null);
    } catch (error) {
      console.error('Failed to add database:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectedDbType = databaseTypes.find(t => t.id === selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="text-center pb-3 flex-shrink-0">
          <div className="mx-auto mb-3 w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <Database className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Install New Database
          </DialogTitle>
          <DialogDescription className="text-sm">
            Choose a database type and configure its settings for installation.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-1">
          <div className="grid gap-4 py-2">
          <div className="grid gap-3">
            <Label htmlFor="db-type" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Database Type
            </Label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-10 border-2 focus:border-blue-500 transition-colors">
                <SelectValue placeholder="Select database type" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px] overflow-y-auto">
                {databaseTypes.map((type) => (
                  <SelectItem key={type.id} value={type.id} className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{type.icon}</span>
                      <div>
                        <div className="font-medium text-sm">{type.name}</div>
                        <div className="text-xs text-muted-foreground">Port {type.defaultPort}</div>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedType && (
            <div className="grid gap-2">
              <Label htmlFor="db-version" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Version</Label>
              <Select value={selectedVersion} onValueChange={(value) => {
                setSelectedVersion(value);
                setConfig(prev => ({ ...prev, version: value }));
              }}>
                <SelectTrigger className="h-10 border-2 focus:border-blue-500 transition-colors">
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent className="max-h-[150px] overflow-y-auto">
                  {versions.map((version) => (
                    <SelectItem key={version} value={version} className="py-2">
                      {version}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="db-name" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Database Name</Label>
            <Input
              id="db-name"
              placeholder="Enter database name"
              value={config.name}
              onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
              className={`h-10 border-2 focus-visible:ring-blue-500 ${
                nameConflict?.hasConflict ? 'border-red-500 focus:border-red-500' : ''
              }`}
            />
            {nameConflict?.hasConflict && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="text-red-600 dark:text-red-400 text-sm">
                  ⚠️ Database name "{config.name}" is already taken by "{nameConflict.conflictingDb?.name}"
                </div>
                <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                  Please choose a different name for your database.
                </div>
              </div>
            )}
            {config.name && !nameConflict?.hasConflict && (
              <p className="text-xs text-green-600 dark:text-green-400">
                ✓ Database name "{config.name}" is available
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="db-port" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Port</Label>
            <Input
              id="db-port"
              type="number"
              placeholder="Enter port number"
              value={config.port || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
              className={`h-10 border-2 focus-visible:ring-blue-500 ${
                portConflict?.hasConflict ? 'border-red-500 focus:border-red-500' : ''
              }`}
            />
            {selectedDbType && !portConflict?.hasConflict && (
              <p className="text-xs text-muted-foreground">
                Default port for {selectedDbType.name}: {selectedDbType.defaultPort}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="data-path" className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Directory</Label>
            <div className="flex gap-2">
              <Input
                id="data-path"
                placeholder="Select data directory"
                value={config.dataPath}
                readOnly
                className={`h-10 border-2 focus-visible:ring-blue-500 ${
                  duplicateDb?.isDuplicate ? 'border-orange-500 focus:border-orange-500' : ''
                }`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSelectFolder}
                className="h-10 w-10"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            {duplicateDb?.isDuplicate && (
              <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                <div className="text-orange-600 dark:text-orange-400 text-sm">
                  ⚠️ A {config.type} {config.version} database already exists in this folder: "{duplicateDb.existingDb?.name}"
                </div>
                <div className="text-xs text-orange-500 dark:text-orange-400 mt-1">
                  Please choose a different location or version to avoid conflicts.
                </div>
              </div>
            )}
          </div>

          {/* Advanced Configuration */}
          <div className="border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full justify-between p-0 h-auto font-medium text-gray-700 dark:text-gray-300 text-sm"
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Advanced Configuration
              </div>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            
            {showAdvanced && (
              <div className="mt-3 space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="use-custom-credentials"
                    checked={config.useCustomCredentials}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      useCustomCredentials: e.target.checked,
                      username: e.target.checked ? prev.username : selectedDbType?.defaultUsername || '',
                      password: e.target.checked ? prev.password : selectedDbType?.defaultPassword || ''
                    }))}
                    className="rounded border-gray-300"
                  />
                  <Label htmlFor="use-custom-credentials" className="text-sm font-medium">
                    Use custom username and password
                  </Label>
                </div>
                
                {config.useCustomCredentials && (
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      <Label htmlFor="db-username" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        <User className="h-4 w-4 inline mr-1" />
                        Username
                      </Label>
                      <Input
                        id="db-username"
                        placeholder="Enter username"
                        value={config.username || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                        className="h-10 border-2 focus-visible:ring-blue-500"
                      />
                    </div>
                    
                    <div className="grid gap-2">
                      <Label htmlFor="db-password" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        <Lock className="h-4 w-4 inline mr-1" />
                        Password
                      </Label>
                      <Input
                        id="db-password"
                        type="password"
                        placeholder="Enter password"
                        value={config.password || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                        className="h-10 border-2 focus-visible:ring-blue-500"
                      />
                    </div>
                  </div>
                )}
                
                {!config.useCustomCredentials && selectedDbType && (
                  <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                    <p className="font-medium text-blue-800 dark:text-blue-200 mb-1">Default Credentials:</p>
                    <p><strong>Username:</strong> {selectedDbType.defaultUsername}</p>
                    <p><strong>Password:</strong> {selectedDbType.defaultPassword}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </div>
        <DialogFooter className="gap-2 pt-3 flex-shrink-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="flex-1 h-10"
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              console.log('Install button clicked!');
              console.log('Button disabled state:', {
                isLoading,
                missingName: !config.name,
                missingType: !config.type,
                missingVersion: !config.version,
                hasPortConflict: portConflict?.hasConflict,
                hasDuplicateDb: duplicateDb?.isDuplicate
              });
              handleSubmit();
            }}
            disabled={isLoading || !config.name || !config.type || !config.version || duplicateDb?.isDuplicate || nameConflict?.hasConflict}
            className="flex-1 h-10 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Installing...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Install Database
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
