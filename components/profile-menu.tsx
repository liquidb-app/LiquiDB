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
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" /> Light Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" /> Dark Mode
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <Monitor className="mr-2 h-4 w-4" /> Automatic
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => {
          const event = new CustomEvent("open-app-settings")
          window.dispatchEvent(event)
        }}>
          <Cog className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => {
          // @ts-ignore
          window.electron?.openExternalLink?.("https://liquidb.com/help")
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




