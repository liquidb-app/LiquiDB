"use client"

import React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BoxesIcon } from "@/components/ui/boxes"
import { FileTextIcon } from "@/components/ui/file-text"
import { PlusIcon } from "@/components/ui/plus"
import { notifyInfo } from "@/lib/notifications"

interface EmptyStateProps {
  onAddDatabase: () => void
  onOpenDocs: () => void
  plusIconHover: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.RefObject<{ startAnimation: () => void; stopAnimation: () => void }>
  }
  fileTextIconHover: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.RefObject<{ startAnimation: () => void; stopAnimation: () => void }>
  }
}

export function EmptyState({
  onAddDatabase,
  onOpenDocs,
  plusIconHover,
  fileTextIconHover,
}: EmptyStateProps) {
  const handleAddClick = () => {
    // Check if we're in tour mode, but allow when tour explicitly enables UI
    const inTour = document.body.hasAttribute('data-tour-mode')
    const tourAllowsUI = document.body.hasAttribute('data-tour-allow-ui')
    if (inTour && !tourAllowsUI) {
      notifyInfo("Tour Mode", {
        description: "Database creation is disabled during the tour. Complete the tour to create databases."
      })
      return
    }
    onAddDatabase()
  }

  return (
    <Card className="border-dashed dotted-grid min-h-[320px] items-center justify-center !gap-0">
      <CardContent className="flex flex-col items-center justify-center w-full py-8">
        <BoxesIcon size={48} className="text-muted-foreground mb-3" />
        <h3 className="text-base font-semibold mb-1">No databases yet</h3>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-md text-pretty">
          Get started by adding your first database container.
        </p>
        <div className="flex items-center gap-3">
          <Button 
            onClick={handleAddClick} 
            size="sm"
            data-testid="add-first-database-button"
            data-tour="add-first-database-button"
            onMouseEnter={plusIconHover.onMouseEnter}
            onMouseLeave={plusIconHover.onMouseLeave}
          >
            <PlusIcon ref={plusIconHover.iconRef} size={16} />
            Add Your First Database
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDocs}
            data-testid="docs-link"
            data-tour="docs-link"
            onMouseEnter={fileTextIconHover.onMouseEnter}
            onMouseLeave={fileTextIconHover.onMouseLeave}
          >
            <FileTextIcon ref={fileTextIconHover.iconRef} size={16} />
            Docs
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

