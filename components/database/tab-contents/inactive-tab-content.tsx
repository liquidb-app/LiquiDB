"use client"

import React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { TabHeader } from "../tab-header"
import { DatabaseGrid } from "../database-grid"
import type { DatabaseContainer } from "@/lib/types"

interface InactiveTabContentProps {
  databases: DatabaseContainer[]
  activeTab: string
  isDeletingAll: boolean
  deleteAnimationPhase: 'idle' | 'moving' | 'particles' | 'exploding' | 'complete'
  showBulkActions: boolean
  selectedDatabases: Set<string>
  copiedId: string | null
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  cardInitialPositions: Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>
  getCardAnimationProps: (dbId: string, index: number) => Record<string, unknown>
  getVisibleDatabases: () => DatabaseContainer[]
  toggleSelectAll: () => void
  getSelectAllButtonText: () => string
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
}

export function InactiveTabContent({
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
  getVisibleDatabases,
  toggleSelectAll,
  getSelectAllButtonText,
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
}: InactiveTabContentProps) {
  const inactiveCount = databases.filter(db => db.status === "stopped").length

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="inactive"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <TabHeader
          title="Inactive Databases"
          description="Databases that are currently stopped"
          count={inactiveCount}
          showBulkActions={showBulkActions}
          getSelectAllButtonText={getSelectAllButtonText}
          toggleSelectAll={toggleSelectAll}
          getVisibleDatabases={getVisibleDatabases}
          variant="inactive"
        />
        <DatabaseGrid
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
          filterFn={(db) => db.status === "stopped"}
          testId="database-grid"
          tourData="database-cards"
        />
      </motion.div>
    </AnimatePresence>
  )
}

