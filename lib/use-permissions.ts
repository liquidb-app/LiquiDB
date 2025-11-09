import { useState, useEffect, useCallback, useRef } from 'react'

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
  const lastCheckTime = useRef<number>(0)
  const checkInProgress = useRef<boolean>(false)

  const checkPermissions = useCallback(async () => {
    // Throttle checks to once every 5 seconds to prevent resource exhaustion
    const now = Date.now()
    if (checkInProgress.current || (now - lastCheckTime.current < 5000)) {
      console.log('[Permissions] Throttling permission check')
      return
    }
    
    checkInProgress.current = true
    lastCheckTime.current = now
    setIsLoading(true)
    setError(null)
    
    try {
      const [permissionsResult, descriptionsResult] = await Promise.all([
        window.electron?.checkPermissions?.(),
        window.electron?.getPermissionDescriptions?.()
      ])

      if (permissionsResult?.success && descriptionsResult?.success && permissionsResult.data && descriptionsResult.data) {
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
      checkInProgress.current = false
    }
  }, [])

  const openSystemPreferences = useCallback(async () => {
    try {
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
      const [result, descriptionsResult] = await Promise.all([
        window.electron?.requestCriticalPermissions?.(),
        window.electron?.getPermissionDescriptions?.()
      ])
      
      if (result?.success && descriptionsResult?.success && result.data && descriptionsResult.data) {
        const descriptions = descriptionsResult.data
        const permissionList: Permission[] = result.data.results.map((resultItem: { permission: string; granted: boolean; error: string | null }) => {
          const desc = descriptions[resultItem.permission]
          if (!desc) {
            return {
              name: resultItem.permission,
              description: resultItem.permission,
              why: '',
              icon: '🔒',
              critical: false,
              granted: resultItem.granted,
              error: resultItem.error || undefined
            }
          }
          return {
            name: desc.name,
            description: desc.description,
            why: desc.why,
            icon: desc.icon,
            critical: desc.critical,
            granted: resultItem.granted,
            error: resultItem.error || undefined
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
    
    // Listen for permission changes from main process
    const handlePermissionChanged = (data: { permission: string; granted: boolean }) => {
      console.log('[Permissions] Permission changed:', data)
      // Re-check permissions when a change is detected
      checkPermissions()
    }
    
    if (window.electron?.onPermissionChanged) {
      window.electron.onPermissionChanged(handlePermissionChanged)
    }
    
    // Re-check permissions when window regains focus
    const handleFocus = () => {
      console.log('[Permissions] Window focused, re-checking permissions')
      checkPermissions()
    }
    
    window.addEventListener('focus', handleFocus)
    
    return () => {
      if (window.electron?.removePermissionChangedListener) {
        window.electron.removePermissionChangedListener()
      }
      window.removeEventListener('focus', handleFocus)
    }
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
