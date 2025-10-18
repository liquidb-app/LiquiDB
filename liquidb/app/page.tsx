"use client"

import { useEffect, useState } from "react"
import { Plus, Database, Play, Square, SettingsIcon, Settings2, Copy, Check, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AddDatabaseDialog } from "@/components/add-database-dialog"
import { DatabaseSettingsDialog } from "@/components/database-settings-dialog"
import { PortConflictDialog } from "@/components/port-conflict-dialog"
import { AppSettingsDialog } from "@/components/app-settings-dialog"
import { toast } from "sonner"
import type { DatabaseContainer } from "@/lib/types"

export default function DatabaseManager() {
  const [databases, setDatabases] = useState<DatabaseContainer[]>([])
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [portConflictDialogOpen, setPortConflictDialogOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseContainer | null>(null)
  const [conflictingPort, setConflictingPort] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [lastStatusCheck, setLastStatusCheck] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = async () => {
      // @ts-ignore
      if (window.electron?.getDatabases) {
        // @ts-ignore
        const list = await window.electron.getDatabases()
        const databases = Array.isArray(list) ? list : []
        
        // Fix any databases stuck in "installing" status
        const updatedDatabases = databases.map(db => {
          if (db.status === "installing") {
            console.log(`[Cleanup] Fixing database ${db.id} stuck in installing status`)
            return { ...db, status: "stopped" as const }
          }
          return db
        })
        
        // Save updated databases if any were fixed
        if (updatedDatabases.some((db, index) => db.status !== databases[index]?.status)) {
          // @ts-ignore
          if (window.electron?.saveDatabase) {
            for (const db of updatedDatabases) {
              // @ts-ignore
              await window.electron.saveDatabase(db)
            }
          }
        }
        
        setDatabases(updatedDatabases)
        
        // Force immediate status check for all databases
        setTimeout(async () => {
          for (const db of updatedDatabases) {
            try {
              // @ts-ignore
              const status = await window.electron?.checkDatabaseStatus?.(db.id)
              if (status?.status && status.status !== db.status) {
                console.log(`[App Load] Database ${db.id} is actually ${status.status}`)
                setDatabases(prev => prev.map(d => 
                  d.id === db.id ? { ...d, status: status.status } : d
                ))
              }
            } catch (e) {
              // Ignore errors during initial load
            }
          }
        }, 1000)
      }
    }
    load()

    // Disable automatic status checking to prevent loops
    // Status will only be updated manually or during startup/stop operations
  }, [])

  const handleAddDatabase = (database: DatabaseContainer) => {
    setDatabases([...databases, database])
    setAddDialogOpen(false)
    toast.success("Database added", {
      description: `${database.name} has been added successfully.`,
    })
  }

  const handleStartStop = async (id: string) => {
    const targetDb = databases.find((db) => db.id === id)
    if (!targetDb) return

    if (targetDb.status === "stopped") {
      const conflictingDb = databases.find((db) => db.id !== id && db.port === targetDb.port && db.status === "running")

      if (conflictingDb) {
        toast.error("Port conflict detected", {
          description: `Port ${targetDb.port} is already in use by "${conflictingDb.name}". Stop it first to start "${targetDb.name}".`,
          action: {
            label: "Stop & Start",
            onClick: () => {
              setDatabases((prevDatabases) =>
                prevDatabases.map((db) => {
                  if (db.id === conflictingDb.id) {
                    toast.info("Database stopped", {
                      description: `${db.name} has been stopped.`,
                    })
                    return { ...db, status: "stopped" as const }
                  }
                  if (db.id === id) {
                    toast.success("Database started", {
                      description: `${db.name} is now running.`,
                    })
                    return { ...db, status: "running" as const }
                  }
                  return db
                }),
              )
            },
          },
          duration: 10000,
        })
        return
      }

      // Set status to starting and record start time
      setDatabases((prev) =>
        prev.map((db) =>
          db.id === id ? { ...db, status: "starting" as const, lastStarted: Date.now() } : db
        )
      )

      try {
        // @ts-ignore
        const result = await window.electron?.startDatabase?.(targetDb)
        if (result?.success) {
          // Immediately set to running since the process is starting
          setDatabases((prev) =>
            prev.map((db) => {
              if (db.id === id) {
                toast.success("Database started", {
                  description: `${db.name} is now running.`,
                })
                return { ...db, status: "running" as const, lastStarted: Date.now() }
              }
              return db
            })
          )
        } else {
          setDatabases((prev) =>
            prev.map((db) =>
              db.id === id ? { ...db, status: "stopped" as const } : db
            )
          )
          toast.error("Failed to start database", {
            description: result?.error || "Unknown error occurred",
          })
        }
      } catch (error) {
        setDatabases((prev) =>
          prev.map((db) =>
            db.id === id ? { ...db, status: "stopped" as const } : db
          )
        )
        toast.error("Failed to start database", {
          description: "Could not connect to database service",
        })
      }
    } else {
      // Stop the database
      try {
        // @ts-ignore
        const result = await window.electron?.stopDatabase?.(id)
        if (result?.success) {
          setDatabases((prev) =>
            prev.map((db) => {
              if (db.id === id) {
                toast.success("Database stopped", {
                  description: `${db.name} has been stopped.`,
                })
                return { ...db, status: "stopped" as const }
              }
              return db
            })
          )
        } else {
          toast.error("Failed to stop database", {
            description: result?.error || "Unknown error occurred",
          })
        }
      } catch (error) {
        toast.error("Failed to stop database", {
          description: "Could not connect to database service",
        })
      }
    }
  }

  const handleRestart = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    if (!db || db.status !== "running") return

    // Stop the database
    setDatabases(
      databases.map((d) => {
        if (d.id === id) {
          return { ...d, status: "stopped" as const }
        }
        return d
      }),
    )

    toast.info("Restarting database", {
      description: `${db.name} is restarting...`,
    })

    // Start it again after a brief delay
    setTimeout(() => {
      setDatabases((prevDatabases) =>
        prevDatabases.map((d) => {
          if (d.id === id) {
            toast.success("Database restarted", {
              description: `${db.name} has been restarted successfully.`,
            })
            return { ...d, status: "running" as const }
          }
          return d
        }),
      )
    }, 1000)
  }

  const handleDelete = (id: string) => {
    const db = databases.find((d) => d.id === id)
    // @ts-ignore
    if (window.electron?.deleteDatabase) {
      // @ts-ignore
      window.electron.deleteDatabase(id)
    }
    setDatabases(databases.filter((d) => d.id !== id))
    setSelectedDatabase(null)
    setSettingsDialogOpen(false)
    toast.error("Database removed", {
      description: `${db?.name} has been removed.`,
    })
  }

  const handleSettings = (database: DatabaseContainer) => {
    setSelectedDatabase(database)
    setSettingsDialogOpen(true)
  }

  const handleUpdateDatabase = (updatedDatabase: DatabaseContainer) => {
    setDatabases(databases.map((db) => (db.id === updatedDatabase.id ? updatedDatabase : db)))
    setSettingsDialogOpen(false)
    toast.success("Settings updated", {
      description: `${updatedDatabase.name} has been updated.`,
    })
  }

  const handleResolvePortConflict = (newPort: number) => {
    setConflictingPort(null)
    setPortConflictDialogOpen(false)
  }

  const handleCopyContainerId = (containerId: string, dbId: string) => {
    navigator.clipboard.writeText(containerId)
    setCopiedId(dbId)
    toast.success("Copied to clipboard", {
      description: "Container ID copied successfully.",
    })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRefreshStatus = async (id: string) => {
    try {
      // @ts-ignore
      const status = await window.electron?.checkDatabaseStatus?.(id)
      if (status?.status) {
        setLastStatusCheck(prev => ({ ...prev, [id]: Date.now() }))
        setDatabases(prev => prev.map(db => 
          db.id === id ? { ...db, status: status.status } : db
        ))
        toast.info("Status refreshed", {
          description: `Database status updated to ${status.status}`,
        })
        console.log(`[Manual Refresh] Database ${id} status: ${status.status}`)
      }
    } catch (error) {
      toast.error("Failed to refresh status", {
        description: "Could not check database status",
      })
    }
  }

  const handleRefreshAllStatuses = async () => {
    console.log("[Manual Refresh] Checking all database statuses...")
    const now = Date.now()
    for (const db of databases) {
      try {
        // @ts-ignore
        const status = await window.electron?.checkDatabaseStatus?.(db.id)
        setLastStatusCheck(prev => ({ ...prev, [db.id]: now }))
        
        if (status?.status && status.status !== db.status) {
          console.log(`[Manual Refresh] Database ${db.id} status changed from ${db.status} to ${status.status}`)
          setDatabases(prev => prev.map(d => 
            d.id === db.id ? { ...d, status: status.status } : d
          ))
        }
      } catch (e) {
        setLastStatusCheck(prev => ({ ...prev, [db.id]: now }))
        console.log(`[Manual Refresh] Error checking database ${db.id}:`, e.message)
      }
    }
    toast.info("All statuses refreshed", {
      description: "Database statuses have been updated",
    })
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4 flex items-center justify-end">
          <div className="flex items-center gap-2">
            <Button
              onClick={handleRefreshAllStatuses}
              variant="ghost"
              size="sm"
              className="gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              onClick={() => setAppSettingsOpen(true)}
              variant="ghost"
              size="sm"
              className="gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
            <Button
              onClick={() => setAddDialogOpen(true)}
              size="sm"
              className="transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Database
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto py-3 px-4">
        {databases.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Database className="h-12 w-12 text-muted-foreground mb-3" />
              <h3 className="text-base font-semibold mb-1">No databases yet</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md text-pretty">
                Get started by adding your first database container.
              </p>
              <Button onClick={() => setAddDialogOpen(true)} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Your First Database
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {databases.map((db) => (
              <Card key={db.id} className="relative overflow-hidden border-dashed">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="p-1 rounded bg-secondary text-base leading-none flex items-center justify-center w-7 h-7 shrink-0">
                        {db.icon || <Database className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold leading-tight truncate">{db.name}</h3>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {db.type} {db.version}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={db.status === "running" ? "default" : "secondary"}
                      className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                        db.status === "running"
                          ? "bg-success text-success-foreground hover:bg-success/90"
                          : db.status === "starting"
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : db.status === "installing"
                          ? "bg-yellow-500 text-white hover:bg-yellow-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {db.status}
                    </Badge>
                  </div>

                  <div className="space-y-1 mb-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">Port</span>
                      <span className="font-mono font-medium">{db.port}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] gap-2">
                      <span className="text-muted-foreground">Container</span>
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 w-4 p-0 shrink-0 transition-all duration-200 hover:scale-125 active:scale-90"
                          onClick={() => handleCopyContainerId(db.containerId, db.id)}
                        >
                          {copiedId === db.id ? (
                            <Check className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className={`flex-1 h-6 text-[11px] transition-all duration-200 hover:scale-105 active:scale-95 ${
                        db.status === "running"
                          ? "border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          : db.status === "starting"
                          ? "border-blue-500/50 text-blue-600"
                          : db.status === "installing"
                          ? "border-yellow-500/50 text-yellow-600"
                          : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                      }`}
                      onClick={() => handleStartStop(db.id)}
                      disabled={db.status === "installing" || db.status === "starting"}
                    >
                      {db.status === "running" ? (
                        <>
                          <Square className="mr-1 h-3 w-3" />
                          Stop
                        </>
                      ) : db.status === "starting" ? (
                        <>
                          <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                          Starting
                        </>
                      ) : db.status === "installing" ? (
                        <>
                          <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                          Installing
                        </>
                      ) : (
                        <>
                          <Play className="mr-1 h-3 w-3" />
                          Start
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50"
                      onClick={() => handleRefreshStatus(db.id)}
                      title="Refresh status"
                    >
                      <RotateCw className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 bg-transparent transition-all duration-200 hover:scale-110 active:scale-95"
                      onClick={() => handleSettings(db)}
                    >
                      <SettingsIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AddDatabaseDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddDatabase} />

      {selectedDatabase && (
        <DatabaseSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          database={selectedDatabase}
          onUpdate={handleUpdateDatabase}
          onDelete={handleDelete}
        />
      )}

      {conflictingPort && (
        <PortConflictDialog
          open={portConflictDialogOpen}
          onOpenChange={setPortConflictDialogOpen}
          port={conflictingPort}
          onResolve={handleResolvePortConflict}
        />
      )}

      <AppSettingsDialog open={appSettingsOpen} onOpenChange={setAppSettingsOpen} />
    </div>
  )
}
