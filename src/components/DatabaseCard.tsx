'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DatabaseInstance } from '@/types/database';
import { Play, Square, Trash2, Database, AlertTriangle, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface DatabaseCardProps {
  database: DatabaseInstance;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DatabaseCard({ database, onStart, onStop, onDelete }: DatabaseCardProps) {

  const handleStartWithConflictCheck = async () => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.startDatabase(database.id);
        
        if (result.success) {
          // Show success toast for starting database
          toast.success("Database Started Successfully", {
            description: `${database.type} database "${database.name}" is now running.`
          });
          // In Electron mode we already started the DB in main process;
          // parent will refresh list separately.
        } else if (result.conflict) {
          // Show toast notification for port conflict
          toast.error("Port Conflict Detected", {
            description: `Port ${database.port} is already in use by "${result.conflictingDb?.name}". Would you like to stop the conflicting database?`,
            action: {
              label: "Stop Conflicting Database",
              onClick: async () => {
                try {
                  if (window.electronAPI) {
                    await window.electronAPI.stopDatabase(result.conflictingDb.id);
                    // Show toast for stopping conflicting database
                    toast.success("Conflicting Database Stopped", {
                      description: `Stopped "${result.conflictingDb.name}" to resolve port conflict.`
                    });
                    // Try to start this database again
                    setTimeout(() => handleStartWithConflictCheck(), 1000);
                  }
                } catch (error) {
                  console.error('Failed to stop conflicting database:', error);
                }
              }
            }
          });
        } else {
          // Handle other errors
          console.error('Failed to start database:', result.message);
        }
      } else {
        // Demo start for browser development
        onStart(database.id);
      }
    } catch (error) {
      console.error('Failed to start database:', error);
    }
  };


  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-green-600';
      case 'starting':
        return 'text-blue-600';
      case 'stopped':
        return 'text-gray-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <div className="w-2 h-2 bg-green-500 rounded-full" />;
      case 'starting':
        return <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />;
      case 'stopped':
        return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
      case 'error':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />;
      default:
        return <div className="w-2 h-2 bg-gray-400 rounded-full" />;
    }
  };

  return (
    <Card className="w-full hover:shadow-lg transition-all duration-200 border-0 shadow-md bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-lg blur-sm"></div>
              <div className="relative bg-gradient-to-r from-blue-500 to-purple-500 p-3 rounded-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
            </div>
            <div>
              <CardTitle className="text-xl font-semibold text-gray-900 dark:text-white">
                {database.name}
              </CardTitle>
              <CardDescription className="text-gray-600 dark:text-gray-400">
                <span className="font-medium capitalize">{database.type}</span> {database.version} • Port {database.port}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusIcon(database.status)}
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${getStatusColor(database.status)} ${
              database.status === 'running' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
              database.status === 'starting' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
              database.status === 'stopped' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400' :
              'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            }`}>
              {database.status.charAt(0).toUpperCase() + database.status.slice(1)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
            <p className="font-medium text-gray-700 dark:text-gray-300">Data Directory</p>
            <p className="text-gray-600 dark:text-gray-400 font-mono text-xs">{database.dataPath}</p>
          </div>
          
          <div className="flex gap-2">
            {database.status === 'running' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStop(database.id)}
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            ) : database.status === 'starting' ? (
              <Button
                variant="outline"
                size="sm"
                disabled
                className="flex-1 border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400"
              >
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleStartWithConflictCheck}
                className="flex-1 border-green-200 text-green-600 hover:bg-green-50 hover:border-green-300 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20"
              >
                <Play className="h-4 w-4 mr-2" />
                Start
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(database.id)}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
