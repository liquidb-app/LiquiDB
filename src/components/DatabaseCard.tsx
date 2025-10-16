'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DatabaseInstance } from '@/types/database';
import { Play, Square, Trash2, Database, AlertTriangle, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { debugLog } from '@/lib/utils';

interface DatabaseCardProps {
  database: DatabaseInstance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onSettings: (database: DatabaseInstance) => void;
}

export function DatabaseCard({ database, onStart, onStop, onSettings }: DatabaseCardProps) {

  const handleStartWithConflictCheck = async () => {
    try {
      if (window.electronAPI) {
        debugLog(`Starting database ${database.name} on port ${database.port}`);
        const result = await window.electronAPI.startDatabase(database.id);
        debugLog('Start database result:', result);
        
        if (result.success) {
          // Show starting toast immediately
          toast.info("Database Starting", {
            description: `${database.type} database "${database.name}" is starting up...`
          });
          // The status will be updated via the real-time listener
        } else if (result.conflict && result.canResolve) {
          // Show toast notification for port conflict with auto-resolve option
          toast.error("Port Conflict Detected", {
            description: `Port ${database.port} is already in use by "${result.conflictingDb?.name}". Would you like to stop the conflicting database and start this one?`,
            action: {
              label: "Stop & Start",
              onClick: async () => {
                try {
                  if (window.electronAPI) {
                    toast.info("Resolving Port Conflict", {
                      description: `Stopping "${result.conflictingDb.name}" and starting "${database.name}"...`
                    });
                    
                    const resolveResult = await window.electronAPI.resolvePortConflict(database.id, result.conflictingDb.id);
                    
                    if (resolveResult.success) {
                      toast.success("Port Conflict Resolved", {
                        description: `Stopped "${resolveResult.stoppedDatabase}" and started "${resolveResult.startedDatabase}"`
                      });
                    } else {
                      toast.error("Failed to Resolve Conflict", {
                        description: resolveResult.message
                      });
                    }
                  }
                } catch (error) {
                  console.error('Failed to resolve port conflict:', error);
                  toast.error("Failed to Resolve Conflict", {
                    description: "An unexpected error occurred while resolving the port conflict."
                  });
                }
              }
            }
          });
        } else if (result.conflict) {
          // Fallback: show non-resolvable conflict (external service) with guidance
          toast.error("Port Conflict Detected", {
            description: result.message || `Port ${database.port} is already in use. Please free the port or change the instance port in settings.`,
          });
        } else {
          // Handle other errors
          console.error('Failed to start database:', result.message);
          toast.error("Failed to Start Database", {
            description: result.message || "An unknown error occurred while starting the database."
          });
        }
      } else {
        // Demo start for browser development
        onStart(database.id);
      }
    } catch (error) {
      console.error('Failed to start database:', error);
      toast.error("Failed to Start Database", {
        description: "An unexpected error occurred while starting the database."
      });
    }
  };

  const handleRefreshDatabase = async () => {
    try {
      if (window.electronAPI) {
        // First stop the database if it's running
        if (database.status === 'running') {
          toast.info("Stopping Database", {
            description: `Stopping ${database.type} database "${database.name}"...`
          });
          
          const stopResult = await window.electronAPI.stopDatabase(database.id);
          if (!stopResult.success) {
            toast.error("Failed to Stop Database", {
              description: stopResult.message || "Failed to stop the database."
            });
            return;
          }
          
          // Wait a moment for the database to fully stop
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Now start the database
        toast.info("Starting Database", {
          description: `Starting ${database.type} database "${database.name}"...`
        });
        
        const startResult = await window.electronAPI.startDatabase(database.id);
        
        if (startResult.success) {
          toast.success("Database Refreshed", {
            description: `${database.type} database "${database.name}" has been restarted successfully.`
          });
        } else if (startResult.conflict) {
          toast.error("Port Conflict Detected", {
            description: `Port ${database.port} is already in use by "${startResult.conflictingDb?.name}". Would you like to stop the conflicting database?`,
            action: {
              label: "Stop Conflicting Database",
              onClick: async () => {
                try {
                  if (window.electronAPI) {
                    await window.electronAPI.stopDatabase(startResult.conflictingDb.id);
                    toast.success("Conflicting Database Stopped", {
                      description: `Stopped "${startResult.conflictingDb.name}" to resolve port conflict.`
                    });
                    // Try to start this database again
                    setTimeout(() => handleRefreshDatabase(), 1000);
                  }
                } catch (error) {
                  console.error('Failed to stop conflicting database:', error);
                }
              }
            }
          });
        } else {
          toast.error("Failed to Refresh Database", {
            description: startResult.message || "An unknown error occurred while refreshing the database."
          });
        }
      } else {
        // Demo refresh for browser development
        onStop(database.id);
        setTimeout(() => onStart(database.id), 1000);
      }
    } catch (error) {
      console.error('Failed to refresh database:', error);
      toast.error("Failed to Refresh Database", {
        description: "An unexpected error occurred while refreshing the database."
      });
    }
  };


  const getStatusBadge = (status: string) => {
    const getStatusIcon = (status: string) => {
      switch (status) {
        case 'running':
          return <div className="w-2 h-2 bg-green-500 rounded-full" />;
        case 'starting':
          return <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />;
        case 'stopping':
          return <RefreshCw className="w-3 h-3 text-orange-500 animate-spin" />;
        case 'stopped':
          return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
        case 'error':
          return <div className="w-2 h-2 bg-red-500 rounded-full" />;
        default:
          return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
      }
    };

    const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
      switch (status) {
        case 'running':
          return 'default';
        case 'starting':
          return 'secondary';
        case 'stopping':
          return 'outline';
        case 'stopped':
          return 'outline';
        case 'error':
          return 'destructive';
        default:
          return 'outline';
      }
    };

    return (
      <Badge 
        variant={getStatusVariant(status)}
        className={`flex items-center gap-2 ${
          status === 'running' ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' :
          status === 'starting' ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' :
          status === 'stopping' ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800' :
          status === 'stopped' ? 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700' :
          'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
        }`}
      >
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm">{database.name}</CardTitle>
              <CardDescription className="text-xs">
                {database.type} {database.version} • Port {database.port}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge(database.status)}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
            <p className="font-medium">Data Directory</p>
            <p className="font-mono text-xs">{database.dataPath}</p>
          </div>
          
          <div className="flex gap-1">
            {database.status === 'running' || database.status === 'stopping' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={database.status === 'running' ? () => onStop(database.id) : undefined}
                disabled={database.status === 'stopping'}
                className="flex-1"
              >
                {database.status === 'stopping' ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Stop
                  </>
                )}
              </Button>
            ) : database.status === 'starting' ? (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="flex-1"
              >
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Starting...
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartWithConflictCheck}
                className="flex-1"
              >
                <Play className="h-3 w-3 mr-1" />
                Start
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSettings(database)}
            >
              <Settings className="h-3 w-3" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshDatabase}
              title="Refresh/Restart database"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
