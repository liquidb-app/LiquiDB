"use client"

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Gift, Info } from "lucide-react"

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
  commitHash?: string
  commitUrl?: string
  issueNumber?: string
  issueUrl?: string
}

interface ChangelogVersion {
  version: string
  date?: string
  entries: ChangelogEntry[]
  sections: Record<string, ChangelogEntry[]>
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
      
      // Extract issue number: (#123)
      const issueMatch = entryText.match(/\(#(\d+)\)/)
      let issueNumber: string | undefined
      let issueUrl: string | undefined
      if (issueMatch) {
        issueNumber = issueMatch[1]
        issueUrl = `https://github.com/alexg-sh/LiquiDB/issues/${issueNumber}`
        entryText = entryText.replace(/\(#\d+\)\s*/, "")
      }
      
      // Extract commit hash: ([hash](url)) or (hash)
      const commitLinkMatch = entryText.match(/\(\[([a-f0-9]+)\]\(([^)]+)\)\)\s*$/)
      const commitHashMatch = entryText.match(/\(([a-f0-9]{7,})\)\s*$/)
      let commitHash: string | undefined
      let commitUrl: string | undefined
      
      if (commitLinkMatch) {
        commitHash = commitLinkMatch[1]
        commitUrl = commitLinkMatch[2]
        entryText = entryText.replace(/\s*\(\[[^\]]+\]\([^)]+\)\)\s*$/, "")
      } else if (commitHashMatch) {
        commitHash = commitHashMatch[1]
        commitUrl = `https://github.com/alexg-sh/LiquiDB/commit/${commitHash}`
        entryText = entryText.replace(/\s*\([a-f0-9]+\)\s*$/, "")
      }
      
      // Try to extract type and message
      const typeMatch = entryText.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/)
      
      if (typeMatch) {
        const [, type, scope, message] = typeMatch
        const entry: ChangelogEntry = {
          type: type.toLowerCase(),
          message: message.trim(),
          scope,
          commitHash,
          commitUrl,
          issueNumber,
          issueUrl,
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
          commitHash,
          commitUrl,
          issueNumber,
          issueUrl,
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
                  <div className="pb-4">
                    <h3 className="text-2xl font-bold text-foreground">
                      {versionData.version}
                      {versionData.date && (
                        <span className="text-base font-normal text-muted-foreground ml-2">
                          ({versionData.date})
                        </span>
                      )}
                    </h3>
                  </div>

                  {/* Sections */}
                  {Object.entries(versionData.sections)
                    .filter(([, entries]) => entries.length > 0)
                    .map(([sectionName, entries]) => (
                    <div key={sectionName} className="space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">
                        {sectionName}
                      </h4>
                      <ul className="space-y-2">
                        {entries.map((entry, entryIdx) => {
                          const scopePrefix = entry.scope ? `${entry.scope}: ` : ""
                          const displayMessage = `${scopePrefix}${entry.message}`
                          
                          return (
                            <li key={entryIdx} className="text-sm text-foreground/90">
                              <span className="mr-2">•</span>
                              <span>{displayMessage}</span>
                              {entry.issueNumber && entry.issueUrl && (
                                <a
                                  href={entry.issueUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline ml-1"
                                >
                                  (#{entry.issueNumber})
                                </a>
                              )}
                              {entry.commitHash && entry.commitUrl && (
                                <a
                                  href={entry.commitUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline ml-1"
                                >
                                  ({entry.commitHash.slice(0, 7)})
                                </a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}

                  {/* Note Block */}
                  {versionData.entries.length > 0 && (
                    <div className="mt-6 border-l-4 border-primary/60 bg-muted/30 rounded-r-md p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <Info className="h-4 w-4 text-primary" />
                        <span>Note</span>
                      </div>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        Release {versionData.version} with {versionData.entries.length} change{versionData.entries.length !== 1 ? 's' : ''}.
                      </p>
                    </div>
                  )}
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

