"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, X, Pencil } from "lucide-react"
import { BanIcon } from "@/components/ui/ban"
import { CheckIcon } from "@/components/ui/check"
import { PlusIcon } from "@/components/ui/plus"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"

interface BannedPortsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BannedPortsDialog({ open, onOpenChange }: BannedPortsDialogProps) {
  const [blacklistedPorts, setBlacklistedPorts] = useState<number[]>([])
  const [newPort, setNewPort] = useState("")
  const [editingPort, setEditingPort] = useState<number | null>(null)
  const [editValue, setEditValue] = useState("")
  const [error, setError] = useState<string>("")
  const [suggestedFix, setSuggestedFix] = useState<string>("")

  // Animated icon hover hooks
  const plusIconHover = useAnimatedIconHover()
  const checkIconHover = useAnimatedIconHover()

  useEffect(() => {
    const load = async () => {
      try {
        // @ts-ignore
        if (window.electron?.getBannedPorts) {
          // @ts-ignore
          const ports = await window.electron.getBannedPorts()
          setBlacklistedPorts(Array.isArray(ports) ? ports : [])
        } else {
          const savedPorts = localStorage.getItem("blacklisted-ports")
          if (savedPorts) setBlacklistedPorts(JSON.parse(savedPorts))
        }
      } catch {
        // ignore
      }
    }
    if (open) load()
  }, [open])

  const handleApplyFix = () => {
    setNewPort(suggestedFix)
    setError("")
    setSuggestedFix("")
  }

  const handleAddPort = () => {
    setError("")
    setSuggestedFix("")

    const invalidChars = newPort.match(/[^0-9,\s]/g)
    if (invalidChars) {
      const corrected = newPort.replace(/[^0-9,\s]/g, ",")
      setSuggestedFix(corrected)
      setError(
        `Invalid format detected. Found invalid characters: "${invalidChars.join(", ")}". Did you mean: "${corrected}"?`,
      )
      return
    }

    const portStrings = newPort
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p)

    if (portStrings.length === 0) {
      setError("Please enter at least one port number")
      return
    }

    const validPorts: number[] = []
    const invalidPorts: string[] = []

    for (const portStr of portStrings) {
      const port = Number.parseInt(portStr)
      if (isNaN(port)) {
        invalidPorts.push(portStr)
      } else if (port <= 0 || port > 65535) {
        setError(`Port ${port} is out of range. Ports must be between 1-65535`)
        return
      } else if (blacklistedPorts.includes(port)) {
        setError(`Port ${port} is already in the blacklist`)
        return
      } else if (!validPorts.includes(port)) {
        validPorts.push(port)
      }
    }

    if (invalidPorts.length > 0) {
      setError(`Invalid port numbers: ${invalidPorts.join(", ")}. Please enter only numbers between 1-65535`)
      return
    }

    if (validPorts.length > 0) {
      const updated = [...blacklistedPorts, ...validPorts].sort((a, b) => a - b)
      setBlacklistedPorts(updated)
      // @ts-ignore
      if (window.electron?.setBannedPorts) {
        // @ts-ignore
        window.electron.setBannedPorts(updated)
      } else {
        localStorage.setItem("blacklisted-ports", JSON.stringify(updated))
      }
      setNewPort("")
      setError("")
    }
  }

  const handleDeletePort = (port: number) => {
    const updated = blacklistedPorts.filter((p) => p !== port)
    setBlacklistedPorts(updated)
    // @ts-ignore
    if (window.electron?.setBannedPorts) {
      // @ts-ignore
      window.electron.setBannedPorts(updated)
    } else {
      localStorage.setItem("blacklisted-ports", JSON.stringify(updated))
    }
  }

  const handleStartEdit = (port: number) => {
    setEditingPort(port)
    setEditValue(port.toString())
  }

  const handleSaveEdit = () => {
    if (editingPort === null) return
    const newPortValue = Number.parseInt(editValue)
    if (!isNaN(newPortValue) && newPortValue > 0 && newPortValue <= 65535) {
      const updated = blacklistedPorts
        .filter((p) => p !== editingPort)
        .concat(newPortValue)
        .sort((a, b) => a - b)
      setBlacklistedPorts(updated)
      // @ts-ignore
      if (window.electron?.setBannedPorts) {
        // @ts-ignore
        window.electron.setBannedPorts(updated)
      } else {
        localStorage.setItem("blacklisted-ports", JSON.stringify(updated))
      }
      setEditingPort(null)
      setEditValue("")
    }
  }

  const handleCancelEdit = () => {
    setEditingPort(null)
    setEditValue("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] !top-[15vh] !translate-y-0">
        <DialogHeader>
          <DialogTitle>Banned Ports</DialogTitle>
          <DialogDescription>Manage ports that cannot be used for database instances</DialogDescription>
        </DialogHeader>

        <div className="min-h-[150px] max-h-[400px] overflow-y-auto space-y-4">
          <div className="space-y-2">
            <Label>Add Port</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter port number(s)"
                value={newPort}
                onChange={(e) => {
                  setNewPort(e.target.value)
                  setError("")
                  setSuggestedFix("")
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAddPort()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddPort} disabled={!newPort} onMouseEnter={plusIconHover.onMouseEnter} onMouseLeave={plusIconHover.onMouseLeave}>
                <PlusIcon ref={plusIconHover.iconRef} size={16} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter port number(s) between 1-65535. Separate multiple ports with commas (e.g., 123, 402, 5012)
            </p>
            {error && (
              <Alert variant="destructive" className="py-2">
                <BanIcon size={16} />
                <AlertDescription className="text-xs flex items-center justify-between gap-2">
                  <span className="flex-1">{error}</span>
                  {suggestedFix && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleApplyFix}
                      className="h-6 text-xs shrink-0 bg-transparent"
                    >
                      Yes, fix
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {blacklistedPorts.length > 0 && (
            <div className="space-y-2">
              <Label>Blacklisted Ports ({blacklistedPorts.length})</Label>
              <div className="space-y-1">
                {blacklistedPorts.map((port) => (
                  <div
                    key={port}
                    className="flex items-center justify-between p-2 rounded-md border bg-card text-card-foreground"
                  >
                    {editingPort === port ? (
                      <>
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit()
                            if (e.key === "Escape") handleCancelEdit()
                          }}
                          className="h-6 w-24 text-xs"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-6 w-6 p-0" onMouseEnter={checkIconHover.onMouseEnter} onMouseLeave={checkIconHover.onMouseLeave}>
                            <CheckIcon ref={checkIconHover.iconRef} size={12} />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 w-6 p-0">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-sm font-mono">{port}</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(port)}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeletePort(port)}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {blacklistedPorts.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">No banned ports yet</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
