"use client"

import React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { renderDatabaseIcon } from "@/lib/utils/database/database-utils"
import type { DatabaseContainer } from "@/lib/types"

interface PortConflictSelectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  portConflicts: [number, DatabaseContainer[]][]
  onConflictDatabaseSelect: (databaseId: string) => void
  onCancel: () => void
}

export function PortConflictSelectionDialog({
  open,
  onOpenChange,
  portConflicts,
  onConflictDatabaseSelect,
  onCancel,
}: PortConflictSelectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Port Conflict Detected</DialogTitle>
          <DialogDescription>
            Multiple databases are using the same port. Only one database can run on each port at a time. Choose which database to keep running on this port. Other non-conflicting databases will also be started.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {portConflicts.map(([port, dbs]) => (
            <div key={port} className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Port {port}
              </h4>
              <div className="space-y-2">
                {dbs.map((db) => (
                  <Button
                    key={db.id}
                    variant="outline"
                    className="w-full justify-start h-auto p-3"
                    onClick={() => onConflictDatabaseSelect(db.id)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded bg-secondary">
                        {renderDatabaseIcon(db.icon, "w-5 h-5")}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{db.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {db.type} {db.version} • {db.status}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={db.status === "running" ? "default" : "secondary"}>
                          {db.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {db.status === "running" ? "Keep running" : "Start this one"}
                        </span>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onCancel}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

