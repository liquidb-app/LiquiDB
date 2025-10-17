"use client";

import { useState, useEffect } from "react";
import { DatabaseCard } from "@/components/database-card";
import { AddDatabaseDialog } from "@/components/add-database-dialog";
import { Button } from "@/components/ui/button";
import { Plus, Database, Settings } from "lucide-react";
import { Database as DatabaseType } from "@/types/database";

export default function Home() {
  const [databases, setDatabases] = useState<DatabaseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);

  useEffect(() => {
    loadDatabases();
    
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onDatabaseStatusUpdate((data) => {
        setDatabases(prev => 
          prev.map(db => 
            db.id === data.id ? { ...db, status: data.status as any } : db
          )
        );
      });
    }

    return () => {
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.removeDatabaseStatusUpdateListener();
      }
    };
  }, []);

  const loadDatabases = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const data = await window.electronAPI.getDatabases();
        setDatabases(data);
      }
    } catch (error) {
      console.error('Failed to load databases:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDatabaseUpdate = () => {
    loadDatabases();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
          <p className="text-muted-foreground">Loading databases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">LiquiDB</h1>
            <p className="text-muted-foreground mt-2">
              Manage your local databases with ease
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Database
            </Button>
          </div>
        </div>

        {databases.length === 0 ? (
          <div className="text-center py-12">
            <Database className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No databases yet</h3>
            <p className="text-muted-foreground mb-4">
              Get started by adding your first database
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Database
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {databases.map((database) => (
              <DatabaseCard
                key={database.id}
                database={database}
                onUpdate={handleDatabaseUpdate}
              />
            ))}
          </div>
        )}

        <AddDatabaseDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onDatabaseAdded={handleDatabaseUpdate}
        />
      </div>
    </div>
  );
}