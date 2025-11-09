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

interface ChangelogEntry {
  type: string
  message: string
  scope?: string
}

interface ChangelogVersion {
  version: string
  date?: string
  entries: ChangelogEntry[]
  sections: Record<string, ChangelogEntry[]>
}

type IconType = typeof Sparkles

const typeConfig: Record<string, { icon: IconType; label: string; variant: "default" | "secondary" | "outline"; color: string }> = {
  feat: { icon: Sparkles, label: "Feature", variant: "default", color: "text-primary" },
  fix: { icon: Bug, label: "Fix", variant: "default", color: "text-destructive" },
  chore: { icon: Wrench, label: "Chore", variant: "secondary", color: "text-muted-foreground" },
  perf: { icon: Zap, label: "Performance", variant: "default", color: "text-success" },
  style: { icon: Palette, label: "Style", variant: "outline", color: "text-muted-foreground" },
  refactor: { icon: Code, label: "Refactor", variant: "secondary", color: "text-muted-foreground" },
  ci: { icon: Rocket, label: "CI", variant: "outline", color: "text-muted-foreground" },
  build: { icon: Package, label: "Build", variant: "outline", color: "text-muted-foreground" },
  test: { icon: Code, label: "Test", variant: "outline", color: "text-muted-foreground" },
  docs: { icon: Code, label: "Docs", variant: "outline", color: "text-muted-foreground" },
}

function parseChangelog(markdown: string): ChangelogVersion[] {
  const versions: ChangelogVersion[] = []
  const lines = markdown.split("\n")
  let currentVersion: ChangelogVersion | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    
    // Match version headers: ## 1.2.0 (2025-11-08) or ## 1.2.0
    const versionMatch = line.match(/^##\s+(.+?)(?:\s+\((.+?)\))?$/)
    if (versionMatch) {
      if (currentVersion) {
        versions.push(currentVersion)
      }
      currentVersion = {
        version: versionMatch[1].replace(/<small>|<\/small>/g, "").trim(),
        date: versionMatch[2],
        entries: [],
        sections: {},
      }
      continue
    }

    // Match section headers: ### Features, ### Bug Fixes, etc.
    const sectionMatch = line.match(/^###\s+(.+)$/)
    if (sectionMatch && currentVersion) {
      const sectionName = sectionMatch[1]
      if (!currentVersion.sections[sectionName]) {
        currentVersion.sections[sectionName] = []
      }
      continue
    }

    // Match list items: * feat: description or * fix: description
    const listMatch = line.match(/^\*\s+(.+)$/)
    if (listMatch && currentVersion) {
      let entryText = listMatch[1]
      // Remove commit hash links at the end: ([hash](url)) or ([hash])
      entryText = entryText.replace(/\s*\(\[([^\]]+)\]\([^)]+\)\)\s*$/, "").replace(/\s*\(([a-f0-9]+)\)\s*$/, "")
      
      // Try to extract type and message
      const typeMatch = entryText.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/)
      
      if (typeMatch) {
        const [, type, scope, message] = typeMatch
        const entry: ChangelogEntry = {
          type: type.toLowerCase(),
          message: message.trim(),
          scope,
        }
        
        // Determine which section this belongs to
        const sectionMap: Record<string, string> = {
          feat: "Features",
          fix: "Bug Fixes",
          perf: "Performance Improvements",
          refactor: "Code Refactoring",
          style: "Styles",
          chore: "Miscellaneous Chores",
          ci: "Continuous Integration",
          build: "Build System",
          test: "Tests",
          docs: "Documentation",
        }
        
        const sectionName = sectionMap[entry.type] || "Other"
        if (!currentVersion.sections[sectionName]) {
          currentVersion.sections[sectionName] = []
        }
        currentVersion.sections[sectionName].push(entry)
        currentVersion.entries.push(entry)
      } else {
        // Plain entry without type prefix
        const entry: ChangelogEntry = {
          type: "other",
          message: entryText.trim(),
        }
        if (!currentVersion.sections["Other"]) {
          currentVersion.sections["Other"] = []
        }
        currentVersion.sections["Other"].push(entry)
        currentVersion.entries.push(entry)
      }
    }
  }

  if (currentVersion) {
    versions.push(currentVersion)
  }

  return versions
}

function formatMessage(message: string): string {
  // Remove commit hash links: [hash](url) -> just the text
  return message.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
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

