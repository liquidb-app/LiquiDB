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
      <DialogContent className="w-[600px] h-[80vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-4 pt-4 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Database Settings
          </DialogTitle>
          <DialogDescription>
            Configure settings and view connection information for "{database.name}".
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 px-4 pb-3">
          <Tabs defaultValue="general" className="w-full h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3 flex-shrink-0 mb-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="connection">Connection</TabsTrigger>
              <TabsTrigger value="dangerous">Dangerous</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ maxHeight: 'calc(80vh - 200px)' }}>
              <TabsContent value="general" className="space-y-3 mt-0 pb-3">
                {/* Settings Form */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="db-name">Database Name</Label>
                      <Input
                        id="db-name"
                        placeholder="Enter database name"
                        value={settings.name}
                        onChange={(e) => setSettings(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="db-port">Port</Label>
                      <Input
                        id="db-port"
                        type="number"
                        placeholder="Enter port number"
                        value={settings.port || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                        className={portConflict?.hasConflict ? 'border-red-500 focus-visible:ring-red-500' : ''}
                      />
                    </div>
                  </div>

                  {selectedDbType && !portConflict?.hasConflict && (
                    <p className="text-sm text-muted-foreground">
                      Default port for {selectedDbType.name}: {selectedDbType.defaultPort}
                    </p>
                  )}

                  {portConflict?.hasConflict && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="font-medium">Port {settings.port} is already in use by "{portConflict.conflictingDb?.name}"</div>
                        {portConflict.suggestedPort && (
                          <div className="text-sm mt-1">
                            Suggested port: {portConflict.suggestedPort}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <Separator />

                {/* Database Information */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Database Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Type:</span>
                      <div className="font-medium capitalize">{database.type}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Version:</span>
                      <div className="font-medium">{database.version}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Status:</span>
                      <div className="font-medium capitalize">{database.status}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Port:</span>
                      <div className="font-medium">{database.port}</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Data Path:</span>
                    <div className="font-medium text-sm truncate" title={database.dataPath}>
                      {database.dataPath}
                    </div>
                  </div>
                </div>

                {selectedDbType && (
                  <>
                    <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Default Credentials</h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <span className="text-muted-foreground">Username:</span>
                          <div className="font-medium">{selectedDbType.defaultUsername}</div>
                        </div>
                        <div className="space-y-1">
                          <span className="text-muted-foreground">Password:</span>
                          <div className="font-medium">{selectedDbType.defaultPassword}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="connection" className="space-y-3 mt-0 pb-3">
                {/* Connection Details */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Host & Port
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value="localhost"
                        readOnly
                        className="flex-1 bg-muted"
                      />
                      <Input
                        value={database.port}
                        readOnly
                        className="w-20 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(`localhost:${database.port}`, 'Host:Port')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Username
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername || ''}
                        readOnly
                        className="flex-1 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(
                          database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername || '', 
                          'Username'
                        )}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Password
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type={showPassword ? "text" : "password"}
                        value={database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword || ''}
                        readOnly
                        className="flex-1 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(
                          database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword || '', 
                          'Password'
                        )}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Database Name</Label>
                    <div className="flex gap-2">
                      <Input
                        value={database.databaseName || database.name}
                        readOnly
                        className="flex-1 bg-muted"
                        placeholder="Database name to connect to"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(database.databaseName || database.name, 'Database Name')}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Connection String */}
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">Connection String</div>
                    <div className="text-xs font-mono bg-muted p-2 rounded border break-all">
                      {database.type}://{database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername}:{database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword}@localhost:{database.port}/{database.databaseName || database.name}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(
                        `${database.type}://${database.useCustomCredentials ? database.username : selectedDbType?.defaultUsername}:${database.useCustomCredentials ? database.encryptedPassword : selectedDbType?.defaultPassword}@localhost:${database.port}/${database.databaseName || database.name}`,
                        'Connection String'
                      )}
                      className="mt-2"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Connection String
                    </Button>
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value="dangerous" className="space-y-3 mt-0 pb-3">
                {/* Delete Section */}
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">Delete Database</div>
                    <div className="text-sm mb-3">
                      Permanently delete this database instance and all its data. This action cannot be undone.
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowDeleteDialog(true)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Database
                    </Button>
                  </AlertDescription>
                </Alert>

                <Separator />

                {/* Database Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Database Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Name:</span>
                      <div className="font-medium">{database.name}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Type:</span>
                      <div className="font-medium capitalize">{database.type}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Port:</span>
                      <div className="font-medium">{database.port}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Status:</span>
                      <div className="font-medium capitalize">{database.status}</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground">Data Path:</span>
                    <div className="font-medium text-sm truncate" title={database.dataPath}>
                      {database.dataPath}
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">Warning</div>
                    <ul className="text-sm space-y-1 list-disc list-inside">
                      <li>All data in this database will be permanently lost</li>
                      <li>This action cannot be undone</li>
                      <li>Make sure you have backups if needed</li>
                      <li>Consider stopping the database first</li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className="flex-shrink-0 px-4 py-3 border-t bg-background mt-auto">
          <div className="flex justify-end gap-3 w-full">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isLoading || !settings.name.trim() || portConflict?.hasConflict}
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
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-4 w-4 text-red-500" />
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
            <AlertDialogCancel className="h-8 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

