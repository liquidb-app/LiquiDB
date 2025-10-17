'use client';

import { Database, Settings, Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';

interface TopbarProps {
  databaseCount?: number;
  runningCount?: number;
}

export function Topbar({ databaseCount = 0, runningCount = 0 }: TopbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        {/* Logo and Brand */}
        <div className="mr-4 flex items-center space-x-2">
          <Database className="h-6 w-6 text-primary" />
          <div className="flex flex-col">
            <span className="font-bold text-lg">LiquiDB</span>
            <span className="text-xs text-muted-foreground hidden sm:block">Database Management</span>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center space-x-4 ml-6">
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Databases</span>
            <Badge variant="secondary">{databaseCount}</Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-sm text-muted-foreground">Running</span>
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              {runningCount}
            </Badge>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              <Settings className="h-4 w-4" />
              <span className="ml-2">Settings</span>
            </Button>
            
            <Button variant="ghost" size="sm" className="sm:hidden">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
