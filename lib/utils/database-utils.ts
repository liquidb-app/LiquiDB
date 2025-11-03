/**
 * Database-related utility functions
 */

import type { DatabaseContainer } from "@/lib/types"

/**
 * Check if a database name already exists
 */
export function isNameDuplicate(name: string, databases: DatabaseContainer[], excludeId?: string): boolean {
  return databases.some((db: DatabaseContainer) => db.name === name && db.id !== excludeId)
}

/**
 * Check if a container ID already exists
 */
export function isContainerIdDuplicate(containerId: string, databases: DatabaseContainer[], excludeId?: string): boolean {
  return databases.some((db: DatabaseContainer) => db.containerId === containerId && db.id !== excludeId)
}

/**
 * Check if databases.json file exists
 */
export async function checkDatabasesFileExists(): Promise<boolean> {
  try {
    // @ts-expect-error - Electron IPC types not available
    const fileCheck = await window.electron?.checkDatabasesFile?.()
    if (fileCheck && !fileCheck.exists) {
      console.log("[Storage] databases.json file missing during runtime, clearing dashboard")
      
      // Recreate the file
      // @ts-expect-error - Electron IPC types not available
      const recreateResult = await window.electron?.recreateDatabasesFile?.()
      if (recreateResult?.success) {
        console.log("[Storage] Recreated databases.json file")
      }
      return false
    }
    return fileCheck?.exists ?? false
  } catch (error) {
    console.error("[Storage] Error checking databases file:", error)
    return false
  }
}

