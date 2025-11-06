"use client"

import React from "react"
import { motion } from "framer-motion"
import { Square, RotateCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PlayIcon } from "@/components/ui/play"
import { CopyIcon } from "@/components/ui/copy"
import { CheckIcon } from "@/components/ui/check"
import { RefreshCCWIcon } from "@/components/ui/refresh-ccw"
import { ActivityIcon } from "@/components/ui/activity"
import { SettingsIcon } from "@/components/ui/settings"
import { renderDatabaseIcon } from "@/lib/utils/database/database-utils"
import { SystemMetrics } from "./system-metrics"
import type { DatabaseContainer } from "@/lib/types"

interface DatabaseCardProps {
  database: DatabaseContainer
  activeTab: string
  isDeletingAll: boolean
  deleteAnimationPhase: 'idle' | 'moving' | 'particles' | 'exploding' | 'complete'
  showBulkActions: boolean
  selectedDatabases: Set<string>
  copiedId: string | null
  cardRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  cardInitialPositions: Map<string, { x: number; y: number; left: number; top: number; width: number; height: number }>
  databases: DatabaseContainer[]
  getCardAnimationProps: (dbId: string, index: number) => Record<string, unknown>
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
  lastSystemInfoCheck: Record<string, number>
  setLastSystemInfoCheck: React.Dispatch<React.SetStateAction<Record<string, number>>>
  lastSystemInfoCheckRef: React.MutableRefObject<Record<string, number>>
}

export function DatabaseCard({
  database: db,
  activeTab,
  isDeletingAll,
  deleteAnimationPhase,
  showBulkActions,
  selectedDatabases,
  copiedId,
  cardRefs,
  cardInitialPositions,
  databases,
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
  lastSystemInfoCheck,
  setLastSystemInfoCheck,
  lastSystemInfoCheckRef,
}: DatabaseCardProps) {
  const databaseIndex = databases.findIndex((d) => d.id === db.id)

  return (
    <motion.div
      key={db.id}
      ref={(el) => {
        if (el) cardRefs.current.set(db.id, el)
        else cardRefs.current.delete(db.id)
      }}
      layoutId={activeTab === "all" && !isDeletingAll ? `database-${db.id}` : undefined}
      layout={activeTab === "all" && !isDeletingAll ? true : false}
      initial={isDeletingAll && deleteAnimationPhase === 'moving' ? { x: 0, y: 0, opacity: 1, scale: 1 } : false}
      animate={(() => {
        if (isDeletingAll) {
          const deleteProps = getCardAnimationProps(db.id, databaseIndex)
          return deleteProps
        }
        return activeTab === "all" ? { opacity: 1 } : undefined
      })()}
      exit={activeTab === "all" ? { opacity: 0 } : undefined}
      transition={(() => {
        if (isDeletingAll) {
          return {} // Transition is handled in getCardAnimationProps
        }
        return {
          type: "spring",
          stiffness: 400,
          damping: 35,
          layout: {
            type: "spring",
            stiffness: 400,
            damping: 35
          }
        }
      })()}
      style={{
        ...(isDeletingAll && deleteAnimationPhase !== 'idle' 
          ? (() => {
              const initialPos = cardInitialPositions.get(db.id)
              return {
                position: 'fixed' as const,
                zIndex: 9999 + databaseIndex,
                transformOrigin: 'center center',
                left: initialPos?.left ?? 0,
                top: initialPos?.top ?? 0,
                width: initialPos?.width ?? 'auto',
                height: initialPos?.height ?? 'auto',
              }
            })()
          : {
              position: 'relative' as const,
              zIndex: 'auto',
            }
        ),
      }}
    >
      <Card 
        className={`relative overflow-hidden border-dashed transition-opacity ${
          showBulkActions 
            ? (selectedDatabases.has(db.id) ? 'opacity-100' : 'opacity-60')
            : (db.status === "stopped" ? "opacity-60" : "opacity-100")
        } ${selectedDatabases.has(db.id) ? 'ring-2 ring-primary' : ''} ${
          showBulkActions ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''
        }`}
        onClick={showBulkActions ? () => toggleDatabaseSelection(db.id) : undefined}
      >
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            {showBulkActions && (
              <input
                type="checkbox"
                checked={selectedDatabases.has(db.id)}
                onChange={() => toggleDatabaseSelection(db.id)}
                className="mr-2 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex items-center justify-center w-7 h-7 shrink-0">
                {renderDatabaseIcon(db.icon, "w-7 h-7 object-cover rounded")}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-tight truncate">{db.name}</h3>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {db.type} {db.version}
                </p>
              </div>
            </div>
            <Badge
              variant={db.status === "running" ? "default" : "secondary"}
              className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
                db.status === "running"
                  ? "bg-success text-success-foreground hover:bg-success/90"
                  : db.status === "starting"
                  ? "bg-status-starting text-status-starting-foreground hover:opacity-90"
                  : db.status === "stopping"
                  ? "bg-status-stopping text-status-stopping-foreground hover:opacity-90"
                  : db.status === "installing"
                  ? "bg-status-installing text-status-installing-foreground hover:opacity-90"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {db.status}
            </Badge>
          </div>

          <div className="space-y-1 mb-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Port</span>
              <div className="flex items-center gap-1">
                <span className="font-mono font-medium text-success">{db.port}</span>
                {isPortBanned(db.port) && (
                  <span className="text-destructive text-[10px]" title="This port is banned and cannot be used">
                    🚫
                  </span>
                )}
                <PortConflictWarning port={db.port} databaseId={db.id} databaseStatus={db.status} />
              </div>
            </div>
            {(db.status === "running" || db.status === "starting") && db.pid && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">PID</span>
                <span className="font-mono font-medium text-success">{db.pid}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-[11px] gap-2">
              <span className="text-muted-foreground">Container</span>
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-mono text-[10px] truncate max-w-[90px]">{db.containerId}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleCopyContainerId(db.containerId, db.id)
                  }}
                  onMouseEnter={createHoverHandlers(db.id, 'copy').onMouseEnter}
                  onMouseLeave={createHoverHandlers(db.id, 'copy').onMouseLeave}
                >
                  {copiedId === db.id ? (
                    <CheckIcon ref={createHoverHandlers(db.id, 'check').iconRef} size={12} />
                  ) : (
                    <CopyIcon ref={createHoverHandlers(db.id, 'copy').iconRef} size={12} />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* System Metrics - Only show for running instances */}
          <SystemMetrics
            database={db}
            fetchSystemInfo={fetchSystemInfo}
            lastSystemInfoCheck={lastSystemInfoCheck}
            setLastSystemInfoCheck={setLastSystemInfoCheck}
            lastSystemInfoCheckRef={lastSystemInfoCheckRef}
          />

          {!showBulkActions && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className={`flex-1 h-6 text-[11px] ${
                  db.status === "running"
                    ? "border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    : db.status === "starting"
                    ? "border-blue-500/50 text-blue-600"
                    : db.status === "stopping"
                    ? "border-orange-500/50 text-orange-600"
                    : db.status === "installing"
                    ? "border-yellow-500/50 text-yellow-600"
                    : "border-success/50 text-success hover:bg-success hover:text-success-foreground"
                }`}
                onClick={(e) => {
                  e.stopPropagation()
                  handleStartStop(db.id)
                }}
                disabled={db.status === "installing" || db.status === "starting" || db.status === "stopping"}
                onMouseEnter={createHoverHandlers(db.id, 'play').onMouseEnter}
                onMouseLeave={createHoverHandlers(db.id, 'play').onMouseLeave}
              >
                {db.status === "running" ? (
                  <>
                    <Square className="mr-1 h-3 w-3" />
                    Stop
                  </>
                ) : db.status === "starting" ? (
                  <>
                    <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                    Starting
                  </>
                ) : db.status === "stopping" ? (
                  <>
                    <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                    Stopping
                  </>
                ) : db.status === "installing" ? (
                  <>
                    <RotateCw className="mr-1 h-3 w-3 animate-spin" />
                    Installing
                  </>
                ) : (
                  <>
                    <PlayIcon ref={createHoverHandlers(db.id, 'play').iconRef} size={12} />
                    Start
                  </>
                )}
              </Button>
              {db.status !== "stopped" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 bg-transparent disabled:opacity-50"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRefreshStatus(db.id)
                      }}
                      onMouseEnter={createHoverHandlers(db.id, 'restart').onMouseEnter}
                      onMouseLeave={createHoverHandlers(db.id, 'restart').onMouseLeave}
                    >
                      <RefreshCCWIcon ref={createHoverHandlers(db.id, 'restart').iconRef} size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Restart database</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {db.status === "running" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDebugDatabase(db.id)
                      }}
                      onMouseEnter={createHoverHandlers(db.id, 'debug').onMouseEnter}
                      onMouseLeave={createHoverHandlers(db.id, 'debug').onMouseLeave}
                    >
                      <ActivityIcon ref={createHoverHandlers(db.id, 'debug').iconRef} size={12} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Instance information</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 bg-transparent"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSettings(db)
                }}
                onMouseEnter={createHoverHandlers(db.id, 'settings').onMouseEnter}
                onMouseLeave={createHoverHandlers(db.id, 'settings').onMouseLeave}
              >
                <SettingsIcon ref={createHoverHandlers(db.id, 'settings').iconRef} size={12} />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

