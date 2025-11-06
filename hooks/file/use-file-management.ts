import type { DatabaseContainer } from "@/lib/types"

export const useFileManagement = (
  setDatabases: React.Dispatch<React.SetStateAction<DatabaseContainer[]>>
) => {
  const checkDatabasesFileExists = async () => {
    try {
      const fileCheck = await window.electron?.checkDatabasesFile?.()
      if (fileCheck && !fileCheck.exists) {
        console.log("[Storage] databases.json file missing during runtime, clearing dashboard")
        setDatabases([])
        
        // Recreate the file
        const recreateResult = await window.electron?.recreateDatabasesFile?.()
        if (recreateResult?.success) {
          console.log("[Storage] Recreated databases.json file")
        }
        return true
      }
      return false
    } catch (error) {
      console.error("[Storage] Error checking databases file:", error)
      return false
    }
  }

  return {
    checkDatabasesFileExists
  }
}

