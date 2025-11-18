"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { Square } from "lucide-react"
import { PlayIcon } from "@/components/ui/play"
import { PlusIcon } from "@/components/ui/plus"
import { GripIcon } from "@/components/ui/grip"
import { ProfileMenuTrigger } from "@/components/profile-menu"
import { notifyInfo } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"

interface HeaderActionsProps {
  databases: DatabaseContainer[]
  selectedDatabases: Set<string>
  showBulkActions: boolean
  setShowBulkActions: React.Dispatch<React.SetStateAction<boolean>>
  setSelectedDatabases: React.Dispatch<React.SetStateAction<Set<string>>>
  setAddDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  getBulkActionButtons: () => { showStart: boolean; showStop: boolean }
  handleBulkStartSelected: (selectedDatabases: Set<string>) => void
  handleBulkStopSelected: (selectedDatabases: Set<string>) => void
  playIconHover: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.MutableRefObject<{ startAnimation: () => void; stopAnimation: () => void } | null>
  }
  plusIconHover: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.MutableRefObject<{ startAnimation: () => void; stopAnimation: () => void } | null>
  }
  gripIconHover: {
    onMouseEnter: () => void
    onMouseLeave: () => void
    iconRef: React.MutableRefObject<{ startAnimation: () => void; stopAnimation: () => void } | null>
  }
}

export function HeaderActions({
  databases,
  selectedDatabases,
  showBulkActions,
  setShowBulkActions,
  setSelectedDatabases,
  setAddDialogOpen,
  getBulkActionButtons,
  handleBulkStartSelected,
  handleBulkStopSelected,
  playIconHover,
  plusIconHover,
  gripIconHover,
}: HeaderActionsProps) {
  const { showStart, showStop } = getBulkActionButtons()

  const handleAddClick = () => {

    const inTour = document.body.hasAttribute('data-tour-mode')
    const tourAllowsUI = document.body.hasAttribute('data-tour-allow-ui')
    if (inTour && !tourAllowsUI) {
      notifyInfo("Tour Mode", {
        description: "Database creation is disabled during the tour. Complete the tour to create databases."
      })
      return
    }
    setAddDialogOpen(true)
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {selectedDatabases.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selectedDatabases.size} selected
            </span>
            {showStart && (
              <Button
                onClick={() => handleBulkStartSelected(selectedDatabases)}
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs cursor-pointer border-success/50 text-success hover:bg-success hover:text-success-foreground"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                onMouseEnter={playIconHover.onMouseEnter}
                onMouseLeave={playIconHover.onMouseLeave}
              >
                <PlayIcon ref={playIconHover.iconRef} size={12} />
                Start All
              </Button>
            )}
            {showStop && (
              <Button
                onClick={() => handleBulkStopSelected(selectedDatabases)}
                size="sm"
                variant="outline"
                className="h-7 px-3 text-xs cursor-pointer border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <Square className="mr-1 h-3 w-3" />
                Stop All
              </Button>
            )}
          </div>
        )}
      </div>
      
      <div className="flex items-center gap-2 align-middle">
        {databases.length > 0 && (
          <Button
            onClick={() => {
              setShowBulkActions(!showBulkActions)
              if (showBulkActions) {

                setSelectedDatabases(new Set())
              }
            }}
            size="sm"
            variant={showBulkActions ? "default" : "ghost"}
            className={`cursor-pointer ${
              showBulkActions ? "bg-primary text-primary-foreground" : ""
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title={showBulkActions ? "Exit selection mode" : "Select multiple databases"}
            onMouseEnter={gripIconHover.onMouseEnter}
            onMouseLeave={gripIconHover.onMouseLeave}
          >
            <GripIcon ref={gripIconHover.iconRef} size={16} className={`transition-transform duration-200 ${showBulkActions ? 'rotate-12' : ''}`} />
          </Button>
        )}
        {databases.length > 0 && (
          <Button
            onClick={handleAddClick}
            size="sm"
            id="btn-add-database"
            data-testid="add-database-button"
            data-tour="add-database-button"
            className="cursor-pointer"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onMouseEnter={plusIconHover.onMouseEnter}
            onMouseLeave={plusIconHover.onMouseLeave}
          >
            <PlusIcon ref={plusIconHover.iconRef} size={16} />
            Add Database
          </Button>
        )}
        {/* User/profile menu replacing gear */}
        <div className="relative flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} data-testid="profile-menu" data-tour="settings-button">
          <ProfileMenuTrigger />
        </div>
      </div>
    </>
  )
}

