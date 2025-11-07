import type { DatabaseContainer } from "@/lib/types"

export const useSelectionManagement = (
  databases: DatabaseContainer[],
  selectedDatabases: Set<string>,
  setSelectedDatabases: React.Dispatch<React.SetStateAction<Set<string>>>,
  getVisibleDatabases: () => DatabaseContainer[]
) => {
  const toggleDatabaseSelection = (id: string) => {
    setSelectedDatabases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAllDatabases = () => {
    const visibleDatabases = getVisibleDatabases()
    setSelectedDatabases(new Set(visibleDatabases.map(db => db.id)))
  }

  const clearSelection = () => {
    setSelectedDatabases(new Set())
  }

  const toggleSelectAll = () => {
    const visibleDatabases = getVisibleDatabases()
    const visibleIds = new Set(visibleDatabases.map(db => db.id))
    const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
    
    if (selectedVisibleCount === visibleDatabases.length && visibleDatabases.length > 0) {
      // All visible are selected, deselect all
      clearSelection()
    } else {
      // Not all visible are selected, select all visible
      selectAllDatabases()
    }
  }

  const getSelectAllButtonText = () => {
    const visibleDatabases = getVisibleDatabases()
    const visibleIds = new Set(visibleDatabases.map(db => db.id))
    const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
    
    if (visibleDatabases.length === 0) {
      return "Select All" // Button should be disabled anyway, but fallback text
    }
    
    return selectedVisibleCount === visibleDatabases.length ? "Deselect All" : "Select All"
  }

  // Helper function to get selected databases with their statuses
  const getSelectedDatabases = () => {
    return databases.filter(db => selectedDatabases.has(db.id))
  }

  // Helper function to determine which bulk action buttons to show
  const getBulkActionButtons = () => {
    const selectedDbs = getSelectedDatabases()
    if (selectedDbs.length === 0) return { showStart: false, showStop: false }

    const runningCount = selectedDbs.filter(db => db.status === "running" || db.status === "starting").length
    const stoppedCount = selectedDbs.filter(db => db.status === "stopped").length

    // If all selected databases are running/starting, only show Stop All
    if (runningCount === selectedDbs.length) {
      return { showStart: false, showStop: true }
    }
    
    // If all selected databases are stopped, only show Start All
    if (stoppedCount === selectedDbs.length) {
      return { showStart: true, showStop: false }
    }
    
    // If there's a mix, show both buttons (but only affect relevant databases)
    return { showStart: stoppedCount > 0, showStop: runningCount > 0 }
  }

  return {
    toggleDatabaseSelection,
    selectAllDatabases,
    clearSelection,
    toggleSelectAll,
    getSelectAllButtonText,
    getSelectedDatabases,
    getBulkActionButtons
  }
}

