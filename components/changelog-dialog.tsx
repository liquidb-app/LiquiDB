"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Gift, Sparkles, Bug, Wrench, Zap, Palette, Rocket, Code, Package } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChangelogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version?: string
  changelog?: string
}

export function ChangelogDialog({ open, onOpenChange, version, changelog }: ChangelogDialogProps) {
  const [localChangelog, setLocalChangelog] = useState<string>("")

  useEffect(() => {
    if (open && !changelog) {
      // Try to fetch changelog from GitHub releases
      const fetchChangelog = async () => {
        try {
          const result = await window.electron?.getChangelog?.()
          if (result?.success && result.changelog) {
            setLocalChangelog(result.changelog)
          } else {
            setLocalChangelog("## What's New\n\nSee the full changelog on GitHub.")
          }
        } catch (error) {
          console.error("Failed to fetch changelog:", error)
          setLocalChangelog("## What's New\n\nSee the full changelog on GitHub.")
        }
      }
      fetchChangelog()
    } else if (changelog) {
      setLocalChangelog(changelog)
    }
  }, [open, changelog])

  const displayChangelog = changelog || localChangelog || "## What's New\n\nSee the full changelog on GitHub."
  
  const parsedVersions = useMemo(() => {
    try {
      return parseChangelog(displayChangelog)
    } catch (error) {
      console.error("Failed to parse changelog:", error)
      return []
    }
  }, [displayChangelog])

  const hasParsedContent = parsedVersions.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Gift className="h-5 w-5 text-primary" />
            </div>
            {version ? `Update to ${version}` : "What's New"}
          </DialogTitle>
          <DialogDescription className="text-base">
            {version ? `LiquiDB has been updated to version ${version}` : "Check out what's new in this update"}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
          {hasParsedContent ? (
            <div className="space-y-8">
              {parsedVersions.map((versionData, versionIdx) => (
                <div key={versionIdx} className="space-y-4">
                  {/* Version Header */}
                  <div className="sticky top-0 z-10 pb-3 bg-background/95 backdrop-blur-sm border-b border-border/50 -mx-2 px-2">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-xl font-bold text-foreground">
                        {versionData.version}
                      </h3>
                      {versionData.date && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {versionData.date}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sections */}
                  {Object.entries(versionData.sections)
                    .filter(([, entries]) => entries.length > 0)
                    .map(([sectionName, entries]) => (
                    <div key={sectionName} className="space-y-2.5">
                      <h4 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide flex items-center gap-2">
                        <span className="h-px flex-1 bg-border/50"></span>
                        <span>{sectionName}</span>
                        <span className="h-px flex-1 bg-border/50"></span>
                      </h4>
                      <ul className="space-y-2.5 ml-1">
                        {entries.map((entry, entryIdx) => {
                          const config = typeConfig[entry.type] || { 
                            icon: Code, 
                            label: entry.type, 
                            variant: "outline" as const,
                            color: "text-muted-foreground"
                          }
                          const Icon = config.icon
                          
                          return (
                            <li key={entryIdx} className="flex items-start gap-2.5 group">
                              <div className={cn(
                                "mt-0.5 p-1.5 rounded-md bg-muted/50 group-hover:bg-muted transition-colors shrink-0",
                                config.color
                              )}>
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {entry.type !== "other" && (
                                    <Badge 
                                      variant={config.variant}
                                      className="text-[10px] px-1.5 py-0.5 h-5 font-medium shrink-0"
                                    >
                                      {config.label}
                                    </Badge>
                                  )}
                                  {entry.scope && (
                                    <Badge 
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0.5 h-5 font-normal shrink-0"
                                    >
                                      {entry.scope}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-foreground/90 leading-relaxed">
                                  {formatMessage(entry.message)}
                                </p>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground/80">
              {displayChangelog}
            </div>
          )}
        </div>
        
        <div className="flex justify-end gap-2 pt-4 border-t border-border/50 mt-4">
          <Button onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

