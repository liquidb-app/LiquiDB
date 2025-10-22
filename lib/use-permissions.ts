import { useState, useEffect, useCallback } from 'react'

interface Permission {
  name: string
  description: string
  why: string
  icon: string
  critical: boolean
  granted: boolean
  error?: string
}

interface PermissionsResult {
  permissions: Record<string, boolean>
  allGranted: boolean
  results: Array<{
    permission: string
    granted: boolean
    error: string | null
  }>
}

export function usePermissions() {
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const checkPermissions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // @ts-ignore
      const [permissionsResult, descriptionsResult] = await Promise.all([
        window.electron?.checkPermissions?.(),
        window.electron?.getPermissionDescriptions?.()
      ])

      if (permissionsResult?.success && descriptionsResult?.success) {
        const result: PermissionsResult = permissionsResult.data
        const descriptions = descriptionsResult.data

        // Map the results to permission objects
        const permissionList: Permission[] = result.results.map((result) => {
          const desc = descriptions[result.permission]
          return {
            name: desc.name,
            description: desc.description,
            why: desc.why,
            icon: desc.icon,
            critical: desc.critical,
            granted: result.granted,
            error: result.error || undefined
          }
        })

        setPermissions(permissionList)
      } else {
        setError('Failed to check permissions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const openSystemPreferences = useCallback(async () => {
    try {
      // @ts-ignore
      const result = await window.electron?.openSystemPreferences?.()
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to open system preferences')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open system preferences')
    }
  }, [])

  const openPermissionPage = useCallback(async (permissionType: string) => {
    try {
      // @ts-ignore
      const result = await window.electron?.openPermissionPage?.(permissionType)
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to open permission page')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open permission page')
    }
  }, [])

  const requestCriticalPermissions = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // @ts-ignore
      const result = await window.electron?.requestCriticalPermissions?.()
      if (result?.success) {
        const permissionList: Permission[] = result.data.results.map((result) => {
          const desc = descriptions[result.permission]
          return {
            name: desc.name,
            description: desc.description,
            why: desc.why,
            icon: desc.icon,
            critical: desc.critical,
            granted: result.granted,
            error: result.error || undefined
          }
        })
        setPermissions(permissionList)
      } else {
        setError('Failed to request critical permissions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const requestPermission = useCallback(async (permissionName: string) => {
    try {
      // @ts-ignore
      const result = await window.electron?.requestPermission?.(permissionName)
      if (result?.success) {
        // Refresh permissions after requesting
        await checkPermissions()
      } else {
        throw new Error(result?.error || 'Failed to request permission')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request permission')
    }
  }, [checkPermissions])

  const getMissingCriticalPermissions = useCallback(() => {
    return permissions.filter(p => p.critical && !p.granted)
  }, [permissions])

  const getMissingPermissions = useCallback(() => {
    return permissions.filter(p => !p.granted)
  }, [permissions])

  const hasAllCriticalPermissions = useCallback(() => {
    return getMissingCriticalPermissions().length === 0
  }, [getMissingCriticalPermissions])

  const hasAllPermissions = useCallback(() => {
    return getMissingPermissions().length === 0
  }, [getMissingPermissions])

  useEffect(() => {
    checkPermissions()
  }, [checkPermissions])

  return {
    permissions,
    isLoading,
    error,
    checkPermissions,
    openSystemPreferences,
    openPermissionPage,
    requestCriticalPermissions,
    requestPermission,
    getMissingCriticalPermissions,
    getMissingPermissions,
    hasAllCriticalPermissions,
    hasAllPermissions
  }
}
