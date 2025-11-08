"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Gift } from "lucide-react"

interface ChangelogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version?: string
  changelog?: string
}

export function ChangelogDialog({ open, onOpenChange, version, changelog }: ChangelogDialogProps) {
  const [localChangelog, setLocalChangelog] = useState<string>("")

  useEffect(() => {
    if (open && !changelog) {
      // Try to fetch changelog from GitHub releases
      const fetchChangelog = async () => {
        try {
          const result = await window.electron?.getChangelog?.()
          if (result?.success && result.changelog) {
            setLocalChangelog(result.changelog)
          } else {
            setLocalChangelog("## What's New\n\nSee the full changelog on GitHub.")
          }
        } catch (error) {
          console.error("Failed to fetch changelog:", error)
          setLocalChangelog("## What's New\n\nSee the full changelog on GitHub.")
        }
      }
      fetchChangelog()
    } else if (changelog) {
      setLocalChangelog(changelog)
    }
  }, [open, changelog])

  const displayChangelog = changelog || localChangelog || "## What's New\n\nSee the full changelog on GitHub."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            {version ? `Update to ${version}` : "What's New"}
          </DialogTitle>
          <DialogDescription>
            {version ? `LiquiDB has been updated to version ${version}` : "Check out what's new in this update"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-4">
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {displayChangelog}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

