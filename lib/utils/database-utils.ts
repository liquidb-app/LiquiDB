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


