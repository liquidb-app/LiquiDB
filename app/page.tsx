"use client"

import React, { useEffect, useState, useRef } from "react"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"
import { useDatabaseIconHover } from "@/hooks/use-database-icon-hover"
import { AddDatabaseDialog } from "@/components/add-database-dialog"
import { DatabaseSettingsDialog } from "@/components/database-settings-dialog"
import { PortConflictDialog } from "@/components/port-conflict-dialog"
import { AppSettingsDialog } from "@/components/app-settings-dialog"
import { InstanceInfoDialog } from "@/components/instance-info-dialog"
import { HelperHealthMonitor } from "@/components/helper-health-monitor"
import { PermissionsDialog } from "@/components/permissions-dialog"
import { usePermissions } from "@/lib/use-permissions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OnboardingOverlay } from "@/components/onboarding"
import { MaybeStartSidebarTour } from "@/components/sidebar-tour"
import { LoadingScreen } from "@/components/loading-screen"
import { SystemStats } from "@/components/system-stats"
import { setTourRequested } from "@/lib/preferences"
import { BoxesIcon } from "@/components/ui/boxes"
import { useDatabaseCrud } from "@/hooks/database/use-database-crud"
import { useDatabaseOperations } from "@/hooks/database/use-database-operations"
import { useBulkOperations } from "@/hooks/database/use-bulk-operations"
import { useSelectionManagement } from "@/hooks/selection/use-selection-management"
import { usePortManagement } from "@/hooks/port/use-port-management"
import { useDatabaseMonitoring } from "@/hooks/database/use-database-monitoring"
import { useUiUtilities } from "@/hooks/ui/use-ui-utilities"
import { useFileManagement } from "@/hooks/file/use-file-management"
import { useDialogManagement } from "@/hooks/ui/use-dialog-management"
import { useAppInitialization } from "@/hooks/ui/use-app-initialization"
import { EmptyState } from "@/components/database/empty-state"
import { HeaderActions } from "@/components/database/header-actions"
import { AllTabContent } from "@/components/database/tab-contents/all-tab-content"
import { ActiveTabContent } from "@/components/database/tab-contents/active-tab-content"
import { InactiveTabContent } from "@/components/database/tab-contents/inactive-tab-content"
import { PortConflictSelectionDialog } from "@/components/database/port-conflict-selection-dialog"
import type { DatabaseContainer } from "@/lib/types"

export default function DatabaseManager() {
  const [databases, setDatabases] = useState<DatabaseContainer[]>([])
  
  // Cache for per-port warning state to prevent UI twitching
  const [portWarningCache, setPortWarningCache] = useState<Record<number, {
    show: boolean
    info: { processName: string; pid: string } | null
    freeStreak: number
  }>>({})

  // Update cache only when values actually change to avoid unnecessary re-renders
  const updatePortWarningCache = React.useCallback((portNumber: number, next: { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }) => {
    setPortWarningCache((prev: Record<number, { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }>): Record<number, { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }> => {
      const current = prev[portNumber]
      // Null-safe equality for info objects
      const currentInfo = current?.info
      const nextInfo = next.info
      let infoEqual = false
      if (!currentInfo && !nextInfo) {
        infoEqual = true
      } else if (currentInfo && nextInfo) {
        infoEqual = currentInfo.processName === nextInfo.processName && currentInfo.pid === nextInfo.pid
      }
      if (current && current.show === next.show && current.freeStreak === next.freeStreak && infoEqual) {
        return prev // No change; skip state update
      }
      const result: Record<number, { show: boolean; info: { processName: string; pid: string } | null; freeStreak: number }> = { ...prev }
      result[portNumber] = next
      return result
    })
  }, [])
  
  // Animated icon hover hooks
  const playIconHover = useAnimatedIconHover()
  const plusIconHover = useAnimatedIconHover()
  const gripIconHover = useAnimatedIconHover()
  const fileTextIconHover = useAnimatedIconHover()
  
  // Database-specific icon hover hook
  const { createHoverHandlers } = useDatabaseIconHover()
  
  // Refs and state that need to be declared before useEffects
  const databasesRef = useRef<DatabaseContainer[]>([])
  const lastStatusCheckRef = useRef<Record<string, number>>({})
  const [lastSystemInfoCheck, setLastSystemInfoCheck] = useState<Record<string, number>>({})
  const lastSystemInfoCheckRef = useRef<Record<string, number>>({})
  
  // Update databases ref whenever databases state changes
  useEffect(() => {
    databasesRef.current = databases
  }, [databases])

  useEffect(() => {
    lastSystemInfoCheckRef.current = lastSystemInfoCheck
  }, [lastSystemInfoCheck])
  
  // Dialog management
  const {
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
  } = useDialogManagement()

  const [conflictingPort, setConflictingPort] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>("all")
  const [selectedDatabases, setSelectedDatabases] = useState<Set<string>>(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [bannedPorts, setBannedPorts] = useState<number[]>([])
  const [portConflicts, setPortConflicts] = useState<[number, DatabaseContainer[]][]>([])
  
  // Delete animation state
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [deleteAnimationPhase, setDeleteAnimationPhase] = useState<'idle' | 'moving' | 'particles' | 'exploding' | 'complete'>('idle')
  const centerPosition = useRef<{ x: number; y: number } | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
  // Store initial card positions and dimensions when animation starts
  const [cardInitialPositions, setCardInitialPositions] = useState<Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>>(new Map())
  
  // App initialization
  const {
    isLoading,
    setIsLoading,
    showOnboarding,
    setShowOnboarding,
    dashboardOpacity,
  } = useAppInitialization(setAppSettingsOpen)
  
  // Initialize hooks - order matters due to dependencies
  const { checkDatabasesFileExists } = useFileManagement(setDatabases)
  
  const { getVisibleDatabases, getCardAnimationProps, handleOpenExternalLink, handleSettings, handleCopyContainerId } = useUiUtilities(
    databases,
    activeTab,
    deleteAnimationPhase,
    isDeletingAll,
    cardInitialPositions,
    centerPosition,
    cardRefs,
    setCardInitialPositions,
    setSelectedDatabase,
    setSettingsDialogOpen,
    setCopiedId
  )
  
  const { toggleDatabaseSelection, clearSelection, toggleSelectAll, getSelectAllButtonText, getBulkActionButtons } = useSelectionManagement(
    databases,
    selectedDatabases,
    setSelectedDatabases,
    getVisibleDatabases
  )
  
  // Create ref for handleBulkStart to avoid circular dependency
  const handleBulkStartRef = useRef<((databaseIds: string[]) => Promise<void>) | undefined>(undefined)
  
  // Port management needs to be initialized before bulk operations (which depends on it)
  const { isPortBanned, checkPortConflict, getPortConflictInfo, findFreePort, checkPortConflictsInSelection, showPortConflictDialog, handleConflictDatabaseSelect, handleResolvePortConflict, PortConflictWarning } = usePortManagement(
    databases,
    bannedPorts,
    setBannedPorts,
    portWarningCache,
    updatePortWarningCache,
    databasesRef,
    setConflictingPort,
    setPortConflictDialogOpen,
    portConflicts,
    setPortConflicts,
    selectedDatabases,
    setSelectedDatabases,
    setShowBulkActions,
    handleBulkStartRef
  )
  
  const { startDatabaseWithErrorHandlingRef, handleStartStop, handleRefreshStatus, handleDebugDatabase } = useDatabaseOperations(
    databases,
    setDatabases,
    setSelectedDatabase,
    setSettingsDialogOpen,
    setInstanceInfoOpen,
    checkPortConflict,
    isPortBanned,
    findFreePort
  )
  
  const { handleAddDatabase, handleUpdateDatabase, handleDelete, handleDeleteAllWithAnimation } = useDatabaseCrud(
    databases,
    setDatabases,
    setAddDialogOpen,
    setActiveTab,
    setSelectedDatabase,
    setSettingsDialogOpen,
    getPortConflictInfo,
    setConflictingPort,
    setPortConflictDialogOpen,
    isDeletingAll,
    setIsDeletingAll,
    deleteAnimationPhase,
    setDeleteAnimationPhase,
    centerPosition,
    cardInitialPositions,
    setCardInitialPositions
  )
  
  const { handleBulkStart, handleBulkStartSelected, handleBulkStopSelected } = useBulkOperations(
    databases,
    setDatabases,
    checkPortConflict,
    isPortBanned,
    startDatabaseWithErrorHandlingRef,
    checkPortConflictsInSelection,
    showPortConflictDialog,
    clearSelection,
    setShowBulkActions
  )
  
  // Update ref with handleBulkStart for port management
  handleBulkStartRef.current = handleBulkStart
  
  const { fetchSystemInfo } = useDatabaseMonitoring(
    databases,
    setDatabases,
    databasesRef,
    lastStatusCheckRef,
    lastSystemInfoCheck,
    setLastSystemInfoCheck,
    lastSystemInfoCheckRef,
    startDatabaseWithErrorHandlingRef,
    checkDatabasesFileExists
  )
  
  // Permissions
  const {
    permissions,
    isLoading: permissionsLoading,
    checkPermissions,
    openSystemPreferences,
    openPermissionPage,
    requestCriticalPermissions,
  } = usePermissions()

  // Check permissions on app startup
  useEffect(() => {
    if (!permissionsLoading && permissions.length > 0) {
      const missingCritical = permissions.filter(p => p.critical && !p.granted)
      if (missingCritical.length > 0) {
        setPermissionsDialogOpen(true)
      }
    }
  }, [permissions, permissionsLoading, setPermissionsDialogOpen])

  // Clear selections when switching tabs to avoid confusion
  useEffect(() => {
    if (showBulkActions) {
      const visibleDatabases = getVisibleDatabases()
      const visibleIds = new Set(visibleDatabases.map(db => db.id))
      const selectedVisibleCount = Array.from(selectedDatabases).filter(id => visibleIds.has(id)).length
      
      // If we have selections but they're not visible in the current tab, clear them
      if (selectedDatabases.size > 0 && selectedVisibleCount === 0) {
        setSelectedDatabases(new Set())
      }
    }
  }, [activeTab, showBulkActions, selectedDatabases, getVisibleDatabases])

  return (
    <React.Fragment>
      {isLoading ? (
        <LoadingScreen onComplete={() => setIsLoading(false)} />
      ) : (
        <div className="min-h-screen bg-background">
          <MaybeStartSidebarTour />
          {showOnboarding && (
            <OnboardingOverlay
              onFinished={() => setShowOnboarding(false)}
              onStartTour={() => {
                setTourRequested(true)
              }}
            />
          )}
          <HelperHealthMonitor className="mx-6 mt-4" data-testid="helper-status" />
          <div 
            className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/50 cursor-move transition-opacity duration-1000 ease-out" 
            style={{ 
              WebkitAppRegion: 'drag',
              opacity: dashboardOpacity 
            } as React.CSSProperties}>
            <div className="container mx-auto pl-20 pr-6 py-1 flex items-center justify-between transition-all duration-300 tour-mode:ml-80">
              <HeaderActions
                databases={databases}
                selectedDatabases={selectedDatabases}
                showBulkActions={showBulkActions}
                setShowBulkActions={setShowBulkActions}
                setSelectedDatabases={setSelectedDatabases}
                setAddDialogOpen={setAddDialogOpen}
                getBulkActionButtons={getBulkActionButtons}
                handleBulkStartSelected={handleBulkStartSelected}
                handleBulkStopSelected={handleBulkStopSelected}
                playIconHover={playIconHover}
                plusIconHover={plusIconHover}
                gripIconHover={gripIconHover}
              />
            </div>
          </div>

          {/* Select Mode Indicator */}
          {showBulkActions && (
            <div className="bg-primary/5 border-b border-primary/10 py-1">
              <div className="container mx-auto px-6 flex items-center justify-center gap-1.5 transition-all duration-300 tour-mode:ml-80">
                <div className="w-1.5 h-1.5 bg-primary/70 rounded-full"></div>
                <span className="text-xs text-primary/80">
                  Selection mode - Click cards to select
                </span>
                <div className="w-1.5 h-1.5 bg-primary/70 rounded-full"></div>
              </div>
            </div>
          )}

          <div 
            className="container mx-auto py-3 px-4 pb-12 transition-all duration-300 tour-mode:ml-80"
            style={{ opacity: dashboardOpacity }}>
            {databases.length === 0 ? (
              <EmptyState
                onAddDatabase={() => setAddDialogOpen(true)}
                onOpenDocs={() => handleOpenExternalLink("https://liquidb.app/help")}
                plusIconHover={plusIconHover}
                fileTextIconHover={fileTextIconHover}
              />
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all" className="flex items-center gap-2">
                    <BoxesIcon size={16} />
                    All
                  </TabsTrigger>
                  <TabsTrigger value="active" className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      databases.filter(db => db.status === "running" || db.status === "starting").length > 0
                        ? "bg-yellow-500 animate-pulse"
                        : "bg-red-500"
                    }`}></div>
                    Active
                  </TabsTrigger>
                  <TabsTrigger value="inactive" className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                    Inactive
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="all" className="mt-6">
                  <AllTabContent
                    databases={databases}
                    activeTab={activeTab}
                    isDeletingAll={isDeletingAll}
                    deleteAnimationPhase={deleteAnimationPhase}
                    showBulkActions={showBulkActions}
                    selectedDatabases={selectedDatabases}
                    copiedId={copiedId}
                    cardRefs={cardRefs}
                    cardInitialPositions={cardInitialPositions}
                    getCardAnimationProps={getCardAnimationProps}
                    getVisibleDatabases={getVisibleDatabases}
                    toggleSelectAll={toggleSelectAll}
                    getSelectAllButtonText={getSelectAllButtonText}
                    toggleDatabaseSelection={toggleDatabaseSelection}
                    handleStartStop={handleStartStop}
                    handleRefreshStatus={handleRefreshStatus}
                    handleDebugDatabase={handleDebugDatabase}
                    handleSettings={handleSettings}
                    handleCopyContainerId={handleCopyContainerId}
                    createHoverHandlers={createHoverHandlers}
                    isPortBanned={isPortBanned}
                    PortConflictWarning={PortConflictWarning}
                    fetchSystemInfo={fetchSystemInfo}
                    setLastSystemInfoCheck={setLastSystemInfoCheck}
                    lastSystemInfoCheckRef={lastSystemInfoCheckRef}
                  />
                </TabsContent>
                
                <TabsContent value="active" className="mt-6">
                  <ActiveTabContent
                    databases={databases}
                    activeTab={activeTab}
                    isDeletingAll={isDeletingAll}
                    deleteAnimationPhase={deleteAnimationPhase}
                    showBulkActions={showBulkActions}
                    selectedDatabases={selectedDatabases}
                    copiedId={copiedId}
                    cardRefs={cardRefs}
                    cardInitialPositions={cardInitialPositions}
                    getCardAnimationProps={getCardAnimationProps}
                    getVisibleDatabases={getVisibleDatabases}
                    toggleSelectAll={toggleSelectAll}
                    getSelectAllButtonText={getSelectAllButtonText}
                    toggleDatabaseSelection={toggleDatabaseSelection}
                    handleStartStop={handleStartStop}
                    handleRefreshStatus={handleRefreshStatus}
                    handleDebugDatabase={handleDebugDatabase}
                    handleSettings={handleSettings}
                    handleCopyContainerId={handleCopyContainerId}
                    createHoverHandlers={createHoverHandlers}
                    isPortBanned={isPortBanned}
                    PortConflictWarning={PortConflictWarning}
                    fetchSystemInfo={fetchSystemInfo}
                    setLastSystemInfoCheck={setLastSystemInfoCheck}
                    lastSystemInfoCheckRef={lastSystemInfoCheckRef}
                  />
                </TabsContent>
                
                <TabsContent value="inactive" className="mt-6">
                  <InactiveTabContent
                    databases={databases}
                    activeTab={activeTab}
                    isDeletingAll={isDeletingAll}
                    deleteAnimationPhase={deleteAnimationPhase}
                    showBulkActions={showBulkActions}
                    selectedDatabases={selectedDatabases}
                    copiedId={copiedId}
                    cardRefs={cardRefs}
                    cardInitialPositions={cardInitialPositions}
                    getCardAnimationProps={getCardAnimationProps}
                    getVisibleDatabases={getVisibleDatabases}
                    toggleSelectAll={toggleSelectAll}
                    getSelectAllButtonText={getSelectAllButtonText}
                    toggleDatabaseSelection={toggleDatabaseSelection}
                    handleStartStop={handleStartStop}
                    handleRefreshStatus={handleRefreshStatus}
                    handleDebugDatabase={handleDebugDatabase}
                    handleSettings={handleSettings}
                    handleCopyContainerId={handleCopyContainerId}
                    createHoverHandlers={createHoverHandlers}
                    isPortBanned={isPortBanned}
                    PortConflictWarning={PortConflictWarning}
                    fetchSystemInfo={fetchSystemInfo}
                    setLastSystemInfoCheck={setLastSystemInfoCheck}
                    lastSystemInfoCheckRef={lastSystemInfoCheckRef}
                  />
                </TabsContent>
              </Tabs>
            )}
          </div>

          <AddDatabaseDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} onAdd={handleAddDatabase} />

          {selectedDatabase && (
            <DatabaseSettingsDialog
              open={settingsDialogOpen}
              onOpenChange={setSettingsDialogOpen}
              database={selectedDatabase}
              onUpdate={handleUpdateDatabase}
              onDelete={handleDelete}
              allDatabases={databases}
            />
          )}

          {conflictingPort && (
            <PortConflictDialog
              open={portConflictDialogOpen}
              onOpenChange={setPortConflictDialogOpen}
              port={conflictingPort}
              onResolve={handleResolvePortConflict}
            />
          )}

          <AppSettingsDialog 
            open={appSettingsOpen} 
            onOpenChange={setAppSettingsOpen}
            onDeleteAll={handleDeleteAllWithAnimation}
          />

          <PermissionsDialog
            open={permissionsDialogOpen}
            onOpenChange={setPermissionsDialogOpen}
            permissions={permissions}
            onRetry={checkPermissions}
            onSkip={() => setPermissionsDialogOpen(false)}
            onOpenSettings={openSystemPreferences}
            onOpenPermissionPage={openPermissionPage}
            onRequestCritical={requestCriticalPermissions}
          />

          {selectedDatabase && (
            <InstanceInfoDialog
              open={instanceInfoOpen}
              onOpenChange={setInstanceInfoOpen}
              databaseId={selectedDatabase.id}
              databaseName={selectedDatabase.name}
            />
          )}

          <PortConflictSelectionDialog
            open={portConflictDialogOpen}
            onOpenChange={setPortConflictDialogOpen}
            portConflicts={portConflicts}
            onConflictDatabaseSelect={handleConflictDatabaseSelect}
            onCancel={() => {
              setPortConflictDialogOpen(false)
              setPortConflicts([])
            }}
          />
          
          {/* Fixed Footer with System Stats */}
          <SystemStats />
        </div>
      )}
    </React.Fragment>
  )
}
