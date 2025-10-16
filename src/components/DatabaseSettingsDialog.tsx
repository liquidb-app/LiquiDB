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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { DatabaseInstance, DatabaseType } from '@/types/database';
import { Settings, Database, User, Lock, Globe, AlertTriangle, CheckCircle, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface DatabaseSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  database: DatabaseInstance | null;
  onUpdateDatabase: (id: string, updates: Partial<DatabaseInstance>) => Promise<void>;
  onDeleteDatabase: (id: string) => Promise<void>;
}

export function DatabaseSettingsDialog({ 
  open, 
  onOpenChange, 
  database, 
  onUpdateDatabase,
  onDeleteDatabase
}: DatabaseSettingsDialogProps) {
  const [databaseTypes, setDatabaseTypes] = useState<DatabaseType[]>([]);
  const [settings, setSettings] = useState({
    name: '',
    port: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [portConflict, setPortConflict] = useState<{ hasConflict: boolean; conflictingDb?: any; suggestedPort?: number } | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    if (open && database) {
      setSettings({
        name: database.name,
        port: database.port,
      });
      loadDatabaseTypes();
    }
  }, [open, database]);

  useEffect(() => {
    if (settings.port > 0 && settings.port !== database?.port) {
      const timeoutId = setTimeout(() => {
        checkPortConflict(settings.port);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setPortConflict(null);
    }
  }, [settings.port, database?.port]);

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

  const checkPortConflict = async (port: number) => {
    try {
      if (window.electronAPI && port > 0) {
        const result = await window.electronAPI.checkPortConflict(port);
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

  const handleSave = async () => {
    if (!database) return;

    if (!settings.name.trim()) {
      toast.error("Database name is required");
      return;
    }

    if (portConflict?.hasConflict) {
      toast.error("Port conflict detected. Please choose a different port.");
      return;
    }

    setIsLoading(true);
    try {
      await onUpdateDatabase(database.id, {
        name: settings.name.trim(),
        port: settings.port,
      });
      toast.success("Database settings updated successfully");
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to update database settings:', error);
      toast.error("Failed to update database settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!database) return;

    try {
      await onDeleteDatabase(database.id);
      toast.success("Database deleted successfully");
      setShowDeleteDialog(false);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to delete database:', error);
      toast.error("Failed to delete database");
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const selectedDbType = databaseTypes.find(t => t.id === database?.type);

  if (!database) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="text-center pb-3 flex-shrink-0">
          <div className="mx-auto mb-3 w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <Settings className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
            Database Settings
          </DialogTitle>
          <DialogDescription className="text-sm">
            Configure settings and view connection information for "{database.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-1">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="connection">Connection Info</TabsTrigger>
              <TabsTrigger value="dangerous">Dangerous</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4 min-h-[400px]">
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                    <Settings className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">General Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Configure your database name and port settings
                  </p>
                </div>

                <Separator />

                <div className="grid gap-2">
                  <Label htmlFor="db-name" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Database Name
                  </Label>
                  <Input
                    id="db-name"
                    placeholder="Enter database name"
                    value={settings.name}
                    onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))}
                    className="h-10 border-2 focus-visible:ring-blue-500"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="db-port" className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Port
                  </Label>
                  <Input
                    id="db-port"
                    type="number"
                    placeholder="Enter port number"
                    value={settings.port || ''}
                    onChange={(e) => setSettings(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                    className={`h-10 border-2 focus-visible:ring-blue-500 ${
                      portConflict?.hasConflict ? 'border-red-500 focus:border-red-500' : ''
                    }`}
                  />
                  {selectedDbType && !portConflict?.hasConflict && (
                    <p className="text-xs text-muted-foreground">
                      Default port for {selectedDbType.name}: {selectedDbType.defaultPort}
                    </p>
                  )}
                  {portConflict?.hasConflict && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="font-medium">Port {settings.port} is already in use by "{portConflict.conflictingDb?.name}"</div>
                        {portConflict.suggestedPort && (
                          <div className="text-xs mt-1">
                            Suggested port: {portConflict.suggestedPort}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Database Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <div className="font-medium capitalize">{database.type}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Version:</span>
                      <div className="font-medium">{database.version}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <div className="font-medium capitalize">{database.status}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Data Path:</span>
                      <div className="font-medium text-xs truncate" title={database.dataPath}>
                        {database.dataPath}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="connection" className="space-y-4 mt-4 min-h-[400px]">
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                    <Database className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">Connection Information</h3>
                  <p className="text-sm text-muted-foreground">
                    Use these credentials to connect to your database
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="grid gap-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Host & Port
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value="localhost"
                        readOnly
                        className="h-10 bg-gray-50 dark:bg-gray-800"
                      />
                      <Input
                        value={database.port}
                        readOnly
                        className="h-10 bg-gray-50 dark:bg-gray-800 w-24"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(`localhost:${database.port}`, 'Host:Port')}
                        className="h-10 w-10"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Username
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername || ''}
                        readOnly
                        className="h-10 bg-gray-50 dark:bg-gray-800"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(
                          database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername || '', 
                          'Username'
                        )}
                        className="h-10 w-10"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Password
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword || ''}
                        readOnly
                        className="h-10 bg-gray-50 dark:bg-gray-800"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowPassword(!showPassword)}
                        className="h-10 w-10"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(
                          database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword || '', 
                          'Password'
                        )}
                        className="h-10 w-10"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Database Name
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={database.databaseName || database.name}
                        readOnly
                        className="h-10 bg-gray-50 dark:bg-gray-800"
                        placeholder="Database name to connect to"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(database.databaseName || database.name, 'Database Name')}
                        className="h-10 w-10"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This is the actual database name you can connect to with your client
                    </p>
                  </div>
                </div>

                <Separator />

                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <AlertDescription className="text-blue-600 dark:text-blue-400">
                    <div className="font-medium">Connection String</div>
                    <div className="text-xs mt-1 font-mono">
                      {database.type}://{database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername}:{database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword}@localhost:{database.port}/{database.databaseName || database.name}
                    </div>
                    <div className="text-xs mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(
                          `${database.type}://${database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername}:${database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword}@localhost:${database.port}/${database.databaseName || database.name}`,
                          'Connection String'
                        )}
                        className="h-6 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Connection String
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </TabsContent>

            <TabsContent value="dangerous" className="space-y-4 mt-4 min-h-[400px]">
              <div className="space-y-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 w-16 h-16 bg-gradient-to-r from-red-500 to-orange-500 rounded-full flex items-center justify-center">
                    <AlertTriangle className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">Dangerous Operations</h3>
                  <p className="text-sm text-muted-foreground">
                    These operations cannot be undone. Please proceed with caution.
                  </p>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="p-4 border border-red-200 dark:border-red-800 rounded-lg bg-red-50 dark:bg-red-900/10">
                    <div className="flex items-start space-x-3">
                      <Trash2 className="h-5 w-5 text-red-500 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Delete Database</h4>
                        <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                          Permanently delete this database instance and all its data. This action cannot be undone.
                        </p>
                        <div className="mt-3">
                          <Button
                            variant="destructive"
                            onClick={() => setShowDeleteDialog(true)}
                            className="h-10"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Database
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 pt-3 flex-shrink-0">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            className="flex-1 h-10"
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || !settings.name.trim() || portConflict?.hasConflict}
            className="flex-1 h-10 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Settings className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Database
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Are you sure you want to delete the database <strong>"{database?.name}"</strong>?
              </p>
              <p className="text-red-600 dark:text-red-400 font-medium">
                This action cannot be undone. All data in this database will be permanently lost.
              </p>
              <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-3 mt-3">
                <p className="text-sm text-red-700 dark:text-red-300">
                  <strong>Database Details:</strong>
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  • Type: {database?.type} {database?.version}
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  • Port: {database?.port}
                </p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  • Data Path: {database?.dataPath}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="h-10 bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

