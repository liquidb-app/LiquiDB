"use client"

import React from "react"
import { AnimatePresence, type TargetAndTransition } from "framer-motion"
import { DatabaseCard } from "./database-card"
import type { DatabaseContainer } from "@/lib/types"

interface DatabaseGridProps {
  databases: DatabaseContainer[]
  activeTab: string
  isDeletingAll: boolean
  deleteAnimationPhase: 'idle' | 'moving' | 'particles' | 'exploding' | 'complete'
  showBulkActions: boolean
  selectedDatabases: Set<string>
  copiedId: string | null
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  cardInitialPositions: Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>
  getCardAnimationProps: (dbId: string, index: number) => TargetAndTransition | undefined
  toggleDatabaseSelection: (id: string) => void
  handleStartStop: (id: string) => void
  handleRefreshStatus: (id: string) => void
  handleDebugDatabase: (id: string) => void
  handleSettings: (database: DatabaseContainer) => void
  handleCopyContainerId: (containerId: string, dbId: string) => void
  createHoverHandlers: (id: string, type: string) => { onMouseEnter: () => void; onMouseLeave: () => void; iconRef?: React.RefObject<{ startAnimation: () => void; stopAnimation: () => void }> }
  isPortBanned: (port: number) => boolean
  PortConflictWarning: React.ComponentType<{ port: number; databaseId: string; databaseStatus: string }>
  fetchSystemInfo: (databaseId: string) => void
  setLastSystemInfoCheck: React.Dispatch<React.SetStateAction<Record<string, number>>>
  lastSystemInfoCheckRef: React.MutableRefObject<Record<string, number>>
  filterFn?: (db: DatabaseContainer) => boolean
  testId?: string
  tourData?: string
}

export function DatabaseGrid({
  databases,
  activeTab,
  isDeletingAll,
  deleteAnimationPhase,
  showBulkActions,
  selectedDatabases,
  copiedId,
  cardRefs,
  cardInitialPositions,
  getCardAnimationProps,
  toggleDatabaseSelection,
  handleStartStop,
  handleRefreshStatus,
  handleDebugDatabase,
  handleSettings,
  handleCopyContainerId,
  createHoverHandlers,
  isPortBanned,
  PortConflictWarning,
  fetchSystemInfo,
  setLastSystemInfoCheck,
  lastSystemInfoCheckRef,
  filterFn,
  testId = "database-grid",
  tourData = "database-cards",
}: DatabaseGridProps) {
  const filteredDatabases = filterFn ? databases.filter(filterFn) : databases

  return (
    <AnimatePresence mode="popLayout">
      <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid={testId} data-tour={tourData}>
        {filteredDatabases.map((db) => (
          <DatabaseCard
            key={db.id}
            database={db}
            activeTab={activeTab}
            isDeletingAll={isDeletingAll}
            deleteAnimationPhase={deleteAnimationPhase}
            showBulkActions={showBulkActions}
            selectedDatabases={selectedDatabases}
            copiedId={copiedId}
            cardRefs={cardRefs}
            cardInitialPositions={cardInitialPositions}
            databases={databases}
            getCardAnimationProps={getCardAnimationProps}
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
        ))}
      </div>
    </AnimatePresence>
  )
}

