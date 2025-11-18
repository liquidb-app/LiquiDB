import { useCallback } from "react"
import { notifySuccess, notifyError, notifyInfo } from "@/lib/notifications"
import type { DatabaseContainer } from "@/lib/types"
import { isNameDuplicate, isContainerIdDuplicate } from "@/lib/utils/database/validation"

export const useDatabaseCrud = (
  databases: DatabaseContainer[],
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>,
  setAddDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  setActiveTab: React.Dispatch<React.SetStateAction<string>>,
  setSelectedDatabase: React.Dispatch<React.SetStateAction<DatabaseContainer | null>>,
  setSettingsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  getPortConflictInfo: (port: number) => Promise<{ processName: string; pid: string } | null>,
  setConflictingPort: React.Dispatch<React.SetStateAction<number | null>>,
  setPortConflictDialogOpen: React.Dispatch<React.SetStateAction<boolean>>,
  isDeletingAll: boolean,
  setIsDeletingAll: React.Dispatch<React.SetStateAction<boolean>>,
  deleteAnimationPhase: 'idle' | 'moving' | 'particles' | 'exploding' | 'complete',
  setDeleteAnimationPhase: React.Dispatch<React.SetStateAction<'idle' | 'moving' | 'particles' | 'exploding' | 'complete'>>,
  centerPosition: React.MutableRefObject<{ x: number; y: number } | null>,
  cardInitialPositions: Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>,
  setCardInitialPositions: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>>>
) => {
  const handleAddDatabase = async (database: DatabaseContainer) => {

    if (isNameDuplicate(databases, database.name)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${database.name}" already exists. Please choose a different name.`,
      })
      return
    }

    const conflict = await getPortConflictInfo(database.port)

    if (conflict) {
      setConflictingPort(database.port)
      setPortConflictDialogOpen(true)
      return
    }

    try {
      if (window.electron?.saveDatabase) {
        await window.electron.saveDatabase(database)
      }
    } catch (error) {
      console.error("[Database Save] Error saving database:", error)
      notifyError("Failed to save database", {
        description: "An error occurred while saving the database.",
      })
      return
    }

    setDatabases([...databases, database])
    setAddDialogOpen(false)
    setActiveTab("all") // Switch to All Databases tab to show the new database
    notifySuccess("Database added", {
      description: `${database.name} has been added successfully.`,
    })
  }

  const handleUpdateDatabase = async (updatedDatabase: DatabaseContainer) => {
    const originalDatabase = databases.find(db => db.id === updatedDatabase.id)
    if (!originalDatabase) return


    if (isNameDuplicate(databases, updatedDatabase.name, updatedDatabase.id)) {
      notifyError("Database name already exists", {
        description: `A database with the name "${updatedDatabase.name}" already exists. Please choose a different name.`,
      })
      return
    }


    if (isContainerIdDuplicate(databases, updatedDatabase.containerId, updatedDatabase.id)) {
      notifyError("Container ID already exists", {
        description: `A database with container ID "${updatedDatabase.containerId}" already exists. Please try again.`,
      })
      return
    }


    const portChanged = originalDatabase.port !== updatedDatabase.port
    const wasRunning = originalDatabase.status === "running" || originalDatabase.status === "starting"
    

    setDatabases(databases.map((db) => (db.id === updatedDatabase.id ? updatedDatabase : db)))
    
    // Port conflicts are now checked dynamically, no need to cache
    

    try {
      const result = await window.electron?.saveDatabase?.(updatedDatabase)
      if (result && result.success === false) {
        notifyError("Failed to update database", {
          description: result.error || "An error occurred while saving the database changes.",
        })
        return
      }
    } catch (error) {
      console.log(`[Port Change] Error saving database ${updatedDatabase.id}:`, error)
      notifyError("Failed to update database", {
        description: "An error occurred while saving the database changes.",
      })
      return
    }
    
    // If port changed and database was running, restart it
    if (portChanged && wasRunning) {
      setSettingsDialogOpen(false)
      
      notifyInfo("Port changed - restarting database", {
        description: `${updatedDatabase.name} is restarting with the new port ${updatedDatabase.port}.`,
      })

      try {

        const stopResult = await window.electron?.stopDatabase?.(updatedDatabase.id)
        
        if (stopResult?.success) {

          setDatabases(prev => prev.map(db => 
            db.id === updatedDatabase.id ? { ...updatedDatabase, status: "stopped" } : db
          ))
          
          // Wait a moment for the process to fully stop
          await new Promise(resolve => setTimeout(resolve, 2000))
          

          // This will be handled by the caller via startDatabaseWithErrorHandlingRef
          return { shouldRestart: true, databaseId: updatedDatabase.id }
        } else {
          notifyError("Failed to restart database", {
            description: "Could not stop the database for port change",
          })
        }
      } catch (error) {
        console.log(`[Port Change] Error restarting database ${updatedDatabase.id}:`, error)
        notifyError("Failed to restart database", {
          description: "Could not restart the database with new port",
        })
      }
    } else {
      setSettingsDialogOpen(false)
      

      const nameChanged = originalDatabase.name !== updatedDatabase.name
      const portChanged_actual = originalDatabase.port !== updatedDatabase.port
      const iconChanged = originalDatabase.icon !== updatedDatabase.icon
      const autoStartChanged = originalDatabase.autoStart !== updatedDatabase.autoStart
      // Note: password changes are handled separately in the settings dialog
      
      // Only show notification if something actually changed
      if (nameChanged || portChanged_actual || iconChanged || autoStartChanged) {
        notifySuccess("Settings updated", {
          description: `${updatedDatabase.name} has been updated.`,
        })
      }
    }

    return { shouldRestart: false }
  }

  const handleDelete = async (id: string) => {
    const db = databases.find((d) => d.id === id)
    

    setDatabases(prev => prev.filter((d) => d.id !== id))
    setSelectedDatabase(null)
    setSettingsDialogOpen(false)
    

    notifyError("Database removed", {
      description: `${db?.name} has been removed.`,
    })
    
    // Perform actual deletion in background (non-blocking)
    try {
      if (window.electron?.deleteDatabase) {
        await window.electron.deleteDatabase(id)
      }
    } catch (error) {
      console.error(`[Delete] Error deleting database ${id}:`, error)
      // If deletion failed, reload databases to sync state
      try {
        if (window.electron?.getDatabases) {
          const list = await window.electron.getDatabases()
          setDatabases(Array.isArray(list) ? list : [])
        }
      } catch (reloadError) {
        console.error("[Delete] Error reloading databases after failed delete:", reloadError)
      }
      
      notifyError("Failed to delete database", {
        description: `An error occurred while deleting ${db?.name}. The database may still exist.`,
      })
    }
  }


  const handleDeleteAllWithAnimation = useCallback(async () => {
    if (databases.length === 0) return
    
    setIsDeletingAll(true)
    

    centerPosition.current = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }
    

    setDeleteAnimationPhase('moving')
    
    // Wait for cards to reach center
    const cardCount = databases.length
    const staggerDelay = 80 // 80ms stagger per card
    const moveDuration = 1000 // ms for cards to move (adjusted for better spring)
    await new Promise(resolve => setTimeout(resolve, (cardCount - 1) * staggerDelay + moveDuration))
    

    setDeleteAnimationPhase('particles')
    
    // Wait for particle transformation
    await new Promise(resolve => setTimeout(resolve, 400))
    
    // Explode particles outward
    setDeleteAnimationPhase('exploding')
    
    // Wait for explosion animation
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Actually delete all databases
    try {
      const result = await window.electron?.deleteAllDatabases?.()
      if (result?.success) {

        await new Promise(resolve => setTimeout(resolve, 100))
        
        setDeleteAnimationPhase('complete')
        notifySuccess("All databases deleted", {
          description: "All databases and their data have been permanently removed.",
        })
        

        setDatabases([])
        setIsDeletingAll(false)
        setDeleteAnimationPhase('idle')
        centerPosition.current = null
        setCardInitialPositions(new Map())
      } else {
        notifyError("Failed to delete databases", {
          description: result?.error || "Unknown error occurred",
        })
        setIsDeletingAll(false)
        setDeleteAnimationPhase('idle')
        centerPosition.current = null
        setCardInitialPositions(new Map())
      }
    } catch {
      notifyError("Failed to delete databases", {
        description: "Could not connect to database service",
      })
      setIsDeletingAll(false)
      setDeleteAnimationPhase('idle')
      centerPosition.current = null
      setCardInitialPositions(new Map())
    }
  }, [databases, setIsDeletingAll, setDeleteAnimationPhase, centerPosition, setCardInitialPositions, setDatabases])

  return {
    handleAddDatabase,
    handleUpdateDatabase,
    handleDelete,
    handleDeleteAllWithAnimation
  }
}

