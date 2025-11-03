"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Kbd } from "@/components/ui/kbd"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"

interface PortConflictDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  port: number
  onResolve: (newPort: number) => void
}

export function PortConflictDialog({ open, onOpenChange, port, onResolve }: PortConflictDialogProps) {
  const [newPort, setNewPort] = useState((port + 1).toString())

  const handleResolve = useCallback(() => {
    onResolve(Number.parseInt(newPort))
    onOpenChange(false)
  }, [newPort, onResolve, onOpenChange])

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          handleResolve()
          break
        case 'Escape':
          event.preventDefault()
          onOpenChange(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, handleResolve, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Port Conflict Detected
          </DialogTitle>
          <DialogDescription>Port {port} is already in use by another database</DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Another database is already using port {port}. Please choose a different port to continue.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="new-port">New Port Number</Label>
            <Input
              id="new-port"
              type="number"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="Enter available port"
            />
            <p className="text-xs text-muted-foreground">Common ports: 5433, 3307, 27018, 6380</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel <Kbd>Esc</Kbd>
          </Button>
          <Button onClick={handleResolve}>Use Port {newPort} <Kbd>⏎</Kbd></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
