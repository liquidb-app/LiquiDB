"use client"

import React, { useEffect, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { loadProfile, getInitials } from "@/lib/preferences"
import { Monitor, Moon, Sun, Cog, HelpCircle, LogOut } from "lucide-react"
import { useTheme } from "next-themes"

export function ProfileMenuTrigger() {
  const [username, setUsername] = useState<string>("")
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const p = loadProfile()
    if (p) {
      setUsername(p.username)
      setAvatar(p.avatar)
    }
  }, [])

  const initials = avatar || getInitials(username || "User")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 rounded-full p-0" aria-label="Open menu" id="btn-open-settings">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-semibold">
            {initials}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{username || "Profile"}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 flex flex-col items-center">
          <div className="text-xs font-medium text-muted-foreground mb-2 w-full text-left">Theme</div>
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
            <Button
              variant={theme === "light" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTheme("light")}
              className="h-7 w-7 p-0"
            >
              <Sun className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTheme("dark")}
              className="h-7 w-7 p-0"
            >
              <Moon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={theme === "system" || !theme ? "default" : "ghost"}
              size="sm"
              onClick={() => setTheme("system")}
              className="h-7 w-7 p-0"
            >
              <Monitor className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          const event = new CustomEvent("open-app-settings")
          window.dispatchEvent(event)
        }}>
          <Cog className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          // @ts-ignore
          window.electron?.openExternalLink?.("https://liquidb.app/help")
        }}>
          <HelpCircle className="mr-2 h-4 w-4" /> Help
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          // @ts-ignore
          window.electron?.quitApp?.()
        }}>
          <LogOut className="mr-2 h-4 w-4" /> Quit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}




