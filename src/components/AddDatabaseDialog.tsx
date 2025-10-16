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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { DatabaseType, DatabaseConfig } from '@/types/database';
import { FolderOpen, Database, ChevronDown, ChevronUp, Lock, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { debugLog } from '@/lib/utils';

interface AddDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddDatabase: (config: DatabaseConfig) => Promise<any>;
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
  const [loadingMessage, setLoadingMessage] = useState('Installing...');
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
      setConfig(prev => ({ ...prev, port: portConflict.suggestedPort! }));
      setPortConflict(null);
    }
  };

  const handleSubmit = async () => {
    debugLog('Form submission started with config:', config);
    debugLog('Form validation:', {
      name: config.name,
      type: config.type,
      version: config.version,
      dataPath: config.dataPath,
      portConflict: portConflict?.hasConflict,
      duplicateDb: duplicateDb?.isDuplicate
    });

    if (!config.name || !config.type || !config.version) {
      debugLog('Form validation failed - missing required fields');
      return;
    }

    if (duplicateDb?.isDuplicate) {
      debugLog('Form validation failed - duplicate database detected');
      return;
    }

    if (nameConflict?.hasConflict) {
      debugLog('Form validation failed - name conflict detected');
      return;
    }

    debugLog('Form validation passed, starting installation...');
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        debugLog('Using Electron API for installation');
        const result = await onAddDatabase(config);
      } else {
        // Demo submission for browser development
        debugLog('Demo: Adding database with config:', config);
        // Simulate successful installation
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      debugLog('Installation completed successfully');
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
      <DialogContent className="w-[600px] max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Install New Database
          </DialogTitle>
          <DialogDescription>
            Choose a database type and configure its settings for installation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2 scrollbar-thin">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="db-type">Database Type</Label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select database type" />
                </SelectTrigger>
                <SelectContent>
                  {databaseTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{type.icon}</span>
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
              <div className="space-y-2">
                <Label htmlFor="db-version">Version</Label>
                <Select value={selectedVersion} onValueChange={(value) => {
                  setSelectedVersion(value);
                  setConfig(prev => ({ ...prev, version: value }));
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="db-name">Database Name</Label>
              <Input
                id="db-name"
                placeholder="Enter database name"
                value={config.name}
                onChange={(e) => setConfig(prev => ({ ...prev, name: e.target.value }))}
                className={nameConflict?.hasConflict ? 'border-red-500' : ''}
              />
              {nameConflict?.hasConflict && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium">Database name "{config.name}" is already taken by "{nameConflict.conflictingDb?.name}"</div>
                    <div className="text-sm mt-1">Please choose a different name for your database.</div>
                  </AlertDescription>
                </Alert>
              )}
              {config.name && !nameConflict?.hasConflict && (
                <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-600 dark:text-green-400">
                    Database name "{config.name}" is available
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="db-port">Port</Label>
              <Input
                id="db-port"
                type="number"
                placeholder="Enter port number"
                value={config.port || ''}
                onChange={(e) => setConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                className={portConflict?.hasConflict ? 'border-red-500' : ''}
              />
              {selectedDbType && !portConflict?.hasConflict && (
                <p className="text-sm text-muted-foreground">
                  Default port for {selectedDbType.name}: {selectedDbType.defaultPort}
                </p>
              )}
              {portConflict?.hasConflict && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium">Port {config.port} is already in use by "{portConflict.conflictingDb?.name}"</div>
                    {portConflict.suggestedPort && (
                      <div className="text-sm mt-1">
                        Suggested port: {portConflict.suggestedPort}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="data-path">Data Directory</Label>
              <div className="flex gap-2">
                <Input
                  id="data-path"
                  placeholder="Select data directory"
                  value={config.dataPath}
                  readOnly
                  className={duplicateDb?.isDuplicate ? 'border-orange-500' : ''}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectFolder}
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              {duplicateDb?.isDuplicate && (
                <Alert className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20">
                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  <AlertDescription className="text-orange-600 dark:text-orange-400">
                    <div className="font-medium">A {config.type} {config.version} database already exists in this folder: "{duplicateDb.existingDb?.name}"</div>
                    <div className="text-sm mt-1">Please choose a different location or version to avoid conflicts.</div>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Advanced Configuration */}
            <div className="border-t pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full justify-between"
              >
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  <span>Advanced Configuration</span>
                </div>
                {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
              
              {showAdvanced && (
                <div className="mt-4 space-y-4 p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="use-custom-credentials"
                      checked={config.useCustomCredentials}
                      onCheckedChange={(checked) => setConfig(prev => ({ 
                        ...prev, 
                        useCustomCredentials: checked as boolean,
                        username: checked ? prev.username : selectedDbType?.defaultUsername || '',
                        password: checked ? prev.password : selectedDbType?.defaultPassword || ''
                      }))}
                    />
                    <Label htmlFor="use-custom-credentials">
                      Use custom username and password
                    </Label>
                  </div>
                  
                  {config.useCustomCredentials && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="db-username">Username</Label>
                        <Input
                          id="db-username"
                          placeholder="Enter username"
                          value={config.username || ''}
                          onChange={(e) => setConfig(prev => ({ ...prev, username: e.target.value }))}
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="db-password">Password</Label>
                        <Input
                          id="db-password"
                          type="password"
                          placeholder="Enter password"
                          value={config.password || ''}
                          onChange={(e) => setConfig(prev => ({ ...prev, password: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                  
                  {!config.useCustomCredentials && selectedDbType && (
                    <div className="text-sm text-muted-foreground bg-background p-3 rounded border">
                      <p className="font-medium mb-2">Default Credentials:</p>
                      <p><strong>Username:</strong> {selectedDbType.defaultUsername}</p>
                      <p><strong>Password:</strong> {selectedDbType.defaultPassword}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          {isLoading && (
            <div className="w-full mb-4">
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>{loadingMessage}</span>
                <span>Please wait</span>
              </div>
              <Progress value={undefined} className="h-2" />
            </div>
          )}
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !config.name || !config.type || !config.version || duplicateDb?.isDuplicate || nameConflict?.hasConflict}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {loadingMessage}
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
