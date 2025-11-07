import { useState } from "react"
import type { DatabaseContainer } from "@/lib/types"

export const useDialogManagement = () => {
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [appSettingsOpen, setAppSettingsOpen] = useState(false)
  const [instanceInfoOpen, setInstanceInfoOpen] = useState(false)
  const [portConflictDialogOpen, setPortConflictDialogOpen] = useState(false)
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<DatabaseContainer | null>(null)

  return {
    // Dialog states
    addDialogOpen,
    setAddDialogOpen,
    settingsDialogOpen,
    setSettingsDialogOpen,
    appSettingsOpen,
    setAppSettingsOpen,
    instanceInfoOpen,
    setInstanceInfoOpen,
    portConflictDialogOpen,
    setPortConflictDialogOpen,
    permissionsDialogOpen,
    setPermissionsDialogOpen,
    selectedDatabase,
    setSelectedDatabase,
  }
}

