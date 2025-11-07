"use client"

import React from "react"
import { motion, AnimatePresence, type TargetAndTransition } from "framer-motion"
import { TabHeader } from "../tab-header"
import { DatabaseGrid } from "../database-grid"
import type { DatabaseContainer } from "@/lib/types"

interface AllTabContentProps {
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

export function AllTabContent({
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
}: AllTabContentProps) {
  const activeDatabases = databases.filter(db => db.status === "running" || db.status === "starting" || db.status === "stopping")
  const inactiveDatabases = databases.filter(db => db.status === "stopped")

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="all"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <TabHeader
          title="All Databases"
          description="Complete overview of all your databases"
          count={databases.length}
          showBulkActions={showBulkActions}
          getSelectAllButtonText={getSelectAllButtonText}
          toggleSelectAll={toggleSelectAll}
          getVisibleDatabases={getVisibleDatabases}
          variant="all"
        />

        {/* Active Databases Section */}
        {activeDatabases.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3 mt-6">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-muted-foreground">
                <span className="text-foreground font-semibold">{activeDatabases.length}</span> Active 
              </span>
            </div>
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
              filterFn={(db) => db.status === "running" || db.status === "starting" || db.status === "stopping"}
              testId="database-grid"
              tourData="database-cards"
            />
          </>
        )}

        {/* Inactive Databases Section */}
        {inactiveDatabases.length > 0 && (
          <>
            <div className="flex items-center gap-2 mb-3 mt-8">
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
              <span className="text-sm font-medium text-muted-foreground">
                <span className="text-foreground font-semibold">{inactiveDatabases.length}</span> Inactive 
              </span>
            </div>
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
          </>
        )}

        {/* Show message if no databases at all */}
        {databases.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No databases found</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

