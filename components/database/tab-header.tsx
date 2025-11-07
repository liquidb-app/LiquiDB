"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { BoxesIcon } from "@/components/ui/boxes"
import type { DatabaseContainer } from "@/lib/types"

interface TabHeaderProps {
  title: string
  description: string
  count: number
  showBulkActions: boolean
  getSelectAllButtonText: () => string
  toggleSelectAll: () => void
  getVisibleDatabases: () => DatabaseContainer[]
  variant?: 'all' | 'active' | 'inactive'
  activeCount?: number
}

export function TabHeader({
  title,
  description,
  count,
  showBulkActions,
  getSelectAllButtonText,
  toggleSelectAll,
  getVisibleDatabases,
  variant = 'all',
  activeCount,
}: TabHeaderProps) {
  return (
    <div className={variant === 'all' ? 'mb-6' : 'mb-4'}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-3">
          {showBulkActions && getVisibleDatabases().length > 0 && (
            <Button
              onClick={toggleSelectAll}
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs"
            >
              {getSelectAllButtonText()}
            </Button>
          )}
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            {variant === 'all' && <BoxesIcon size={16} />}
            {variant === 'active' && (
              <div className={`w-2 h-2 rounded-full ${
                (activeCount ?? 0) > 0
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
              }`}></div>
            )}
            {variant === 'inactive' && (
              <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            )}
            <span className="text-foreground font-semibold">{count}</span>
            <span>
              {variant === 'all' ? 'Total' : variant === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

