'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent } from '@/components/ui/empty';
import { AddDatabaseDialog } from '@/components/AddDatabaseDialog';
import { DatabaseCard } from '@/components/DatabaseCard';
import { DatabaseSettingsDialog } from '@/components/DatabaseSettingsDialog';
import { DatabaseInstance, DatabaseConfig } from '@/types/database';
import { Plus, Database, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/theme-toggle';

export default function Home() {
  const [databases, setDatabases] = useState<DatabaseInstance[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && window.electronAPI) {
      loadDatabases();
      
      // Listen for real-time database status updates
      window.electronAPI.onDatabaseStatusUpdate((data) => {
        console.log('Database status updated:', data);
        setDatabases(prevDatabases => 
          prevDatabases.map(db => 
            db.id === data.id ? { ...db, status: data.status as any } : db
          )
        );
        
        // Show appropriate toast based on status
        const database = databases.find(db => db.id === data.id);
        if (database) {
          if (data.status === 'running') {
            toast.success("Database Started", {
              description: `${database.type} database "${database.name}" is now running.`
            });
          } else if (data.status === 'stopped') {
            toast.info("Database Stopped", {
              description: `${database.type} database "${database.name}" has been stopped.`
            });
          }
        }
      });
      
      // Cleanup listener on unmount
      return () => {
        window.electronAPI.removeDatabaseStatusListener();
      };
    } else {
      // For development in browser, show empty state
      setDatabases([]);
      setIsLoading(false);
    }
  }, []);

  const loadDatabases = async () => {
    try {
      const installedDatabases = await window.electronAPI.getInstalledDatabases();
      setDatabases(installedDatabases);
    } catch (error) {
      console.error('Failed to load databases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddDatabase = async (config: DatabaseConfig) => {
    console.log('handleAddDatabase called with config:', config);
    try {
      if (window.electronAPI) {
        console.log('Electron API available, calling installDatabase...');
        const result = await window.electronAPI.installDatabase(config);
        console.log('Install database result:', result);
        if (result.success) {
          console.log('Installation successful, reloading databases...');
          // Show success toast
          toast.success("Database Created Successfully", {
            description: `${config.type} database "${config.name}" has been created and is ready to use.`
          });
          // Reload databases after successful installation
          await loadDatabases();
        } else {
          console.error('Installation failed:', result.message);
          // Handle port conflict or other errors
          if (result.conflict) {
            toast.error("Port Conflict", {
              description: result.message
            });
          } else if (result.duplicate) {
            toast.error("Database Already Exists", {
              description: result.message
            });
          } else {
            toast.error("Installation Failed", {
              description: result.message || "An unknown error occurred during installation."
            });
          }
          throw new Error(result.message);
        }
      } else {
        // Demo installation for browser development
        console.log('Demo: Installing database with config:', config);
        // Simulate successful installation
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Add to demo databases
        const newDb: DatabaseInstance = {
            id: `${config.type}-${config.name}-${Date.now()}`,
            name: config.name,
            type: config.type,
            version: config.version,
            port: 0,
            status: 'running',
            dataPath: '',
            username: '',
            databaseName: '',
            encryptedPassword: '',
            useCustomCredentials: false
        };
        setDatabases(prev => [...prev, newDb]);
        // Show success toast for demo
        toast.success("Database Created Successfully", {
          description: `${config.type} database "${config.name}" has been created and is ready to use.`
        });
      }
    } catch (error) {
      console.error('Failed to install database:', error);
      throw error;
    }
  };

  const handleStartDatabase = async (dbId: string) => {
    try {
      const database = databases.find(db => db.id === dbId);
      if (window.electronAPI) {
        const result = await window.electronAPI.startDatabase(dbId);
        if (result.success) {
          // Show starting toast
          toast.info("Database Starting", {
            description: `${database?.type} database "${database?.name}" is starting up...`
          });
          // Wait a moment for the database to fully start, then reload
          setTimeout(async () => {
            await loadDatabases();
            // Show started toast after reload
            toast.success("Database Started", {
              description: `${database?.type} database "${database?.name}" is now running.`
            });
          }, 2000);
        } else {
          // Handle port conflict or other errors
          if (result.conflict) {
            toast.error("Port Conflict", {
              description: result.message
            });
          } else {
            toast.error("Failed to Start Database", {
              description: result.message || "An unknown error occurred while starting the database."
            });
          }
        }
      } else {
        // Demo start for browser development
        setDatabases(prev => prev.map(db => 
          db.id === dbId ? { ...db, status: 'running' as const } : db
        ));
        toast.success("Database Started", {
          description: `${database?.type} database "${database?.name}" is now running.`
        });
      }
    } catch (error) {
      console.error('Failed to start database:', error);
      toast.error("Failed to Start Database", {
        description: "An unexpected error occurred while starting the database."
      });
    }
  };

  const handleStopDatabase = async (dbId: string) => {
    try {
      const database = databases.find(db => db.id === dbId);
      if (window.electronAPI) {
        // Show stopping toast immediately
        toast.info("Database Stopping", {
          description: `${database?.type} database "${database?.name}" is stopping...`
        });
        
        const result = await window.electronAPI.stopDatabase(dbId);
        if (result.success) {
          await loadDatabases();
          // Show stopped toast after successful stop
          toast.success("Database Stopped", {
            description: `${database?.type} database "${database?.name}" has been stopped.`
          });
        } else {
          // Handle stop failure
          toast.error("Failed to Stop Database", {
            description: result.message || "An error occurred while stopping the database."
          });
        }
      } else {
        // Demo stop for browser development
        setDatabases(prev => prev.map(db => 
          db.id === dbId ? { ...db, status: 'stopped' as const } : db
        ));
        toast.success("Database Stopped", {
          description: `${database?.type} database "${database?.name}" has been stopped.`
        });
      }
    } catch (error) {
      console.error('Failed to stop database:', error);
      toast.error("Failed to Stop Database", {
        description: "An unexpected error occurred while stopping the database."
      });
    }
  };

  const handleDeleteDatabase = async (dbId: string) => {
    try {
      const database = databases.find(db => db.id === dbId);
      if (window.electronAPI) {
        const result = await window.electronAPI.deleteDatabase(dbId);
        if (result.success) {
          await loadDatabases();
          // Show deleted toast
          toast.success("Database Deleted", {
            description: `${database?.type} database "${database?.name}" has been permanently deleted.`
          });
        }
      } else {
        // Demo delete for browser development
        setDatabases(prev => prev.filter(db => db.id !== dbId));
        toast.success("Database Deleted", {
          description: `${database?.type} database "${database?.name}" has been permanently deleted.`
        });
      }
    } catch (error) {
      console.error('Failed to delete database:', error);
    }
  };

  const handleOpenSettings = (database: DatabaseInstance) => {
    setSelectedDatabase(database);
    setIsSettingsDialogOpen(true);
  };

  const handleUpdateDatabase = async (dbId: string, updates: Partial<DatabaseInstance>) => {
    try {
      if (window.electronAPI) {
        // In a real implementation, you would call an API to update the database
        // For now, we'll just update the local state
        setDatabases(prev => prev.map(db => 
          db.id === dbId ? { ...db, ...updates } : db
        ));
      } else {
        // Demo update for browser development
        setDatabases(prev => prev.map(db => 
          db.id === dbId ? { ...db, ...updates } : db
        ));
      }
    } catch (error) {
      console.error('Failed to update database:', error);
      throw error;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header Skeleton */}
        <div className="border-b bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
          <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="w-full">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-lg" />
                        <div>
                          <Skeleton className="h-5 w-24 mb-2" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <Skeleton className="h-4 w-20 mb-2" />
                        <Skeleton className="h-3 w-full" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-8 flex-1" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-gradient-to-r from-white to-gray-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg blur-sm opacity-75"></div>
                  <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 p-1.5 sm:p-2 rounded-lg">
                    <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                    LiquiDB
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Database Management for macOS
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button 
                onClick={() => setIsAddDialogOpen(true)}
                className="h-10 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 text-sm sm:text-base px-3 sm:px-4"
              >
                <Plus className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Add Database</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {databases.length === 0 ? (
          <Empty className="min-h-[400px]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database className="h-10 w-10" />
              </EmptyMedia>
              <EmptyTitle>No databases yet</EmptyTitle>
              <EmptyDescription>
                Get started by creating your first database. Choose from PostgreSQL, MySQL, MongoDB, and more.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                className="h-12 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Database
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Your Databases</h2>
              <div className="text-sm text-muted-foreground">
                {databases.length} database{databases.length !== 1 ? 's' : ''} installed
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {databases.map((database) => (
                <DatabaseCard
                  key={database.id}
                  database={database}
                  onStart={handleStartDatabase}
                  onStop={handleStopDatabase}
                  onSettings={handleOpenSettings}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Database Dialog */}
      <AddDatabaseDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onAddDatabase={handleAddDatabase}
      />

      {/* Database Settings Dialog */}
        <DatabaseSettingsDialog
          open={isSettingsDialogOpen}
          onOpenChange={setIsSettingsDialogOpen}
          database={selectedDatabase}
          onUpdateDatabase={handleUpdateDatabase}
          onDeleteDatabase={handleDeleteDatabase}
        />
    </div>
  );
}
