"use client"

import React, { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { loadProfile, getInitials } from "@/lib/preferences"
import { Monitor, ChevronDown } from "lucide-react"
import { CogIcon } from "@/components/ui/cog"
import { CircleHelpIcon } from "@/components/ui/circle-help"
import { LogoutIcon } from "@/components/ui/logout"
import { SunIcon } from "@/components/ui/sun"
import { MoonIcon } from "@/components/ui/moon"
import { useAnimatedIconHover } from "@/hooks/use-animated-icon-hover"
import { useTheme } from "next-themes"

export function ProfileMenuTrigger() {
  const [username, setUsername] = useState<string>("")
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { theme, setTheme } = useTheme()

  const settingsIconHover = useAnimatedIconHover()
  const helpIconHover = useAnimatedIconHover()
  const logoutIconHover = useAnimatedIconHover()
  const sunIconHover = useAnimatedIconHover()
  const moonIconHover = useAnimatedIconHover()

  useEffect(() => {
    const p = loadProfile()
    if (p) {
      setUsername(p.username)
      setAvatar(p.avatar)
    }
  }, [])

  useEffect(() => {
    const handleOpenAppSettings = () => {
      setDropdownOpen(false)
    }
    
    window.addEventListener('open-app-settings', handleOpenAppSettings)
    return () => window.removeEventListener('open-app-settings', handleOpenAppSettings)
  }, [])

  const initials = getInitials(username || "User")
  const hasValidAvatar = avatar && avatar.startsWith('data:')

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-full p-0 hover:bg-accent/50 transition-colors relative cursor-pointer select-none"
          style={{ 
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            cursor: 'pointer'
          }}
          aria-label="Open profile menu"
        >
          <Avatar 
            className="h-8 w-8 select-none"
            style={{ 
              userSelect: 'none',
              WebkitUserSelect: 'none',
              MozUserSelect: 'none',
              msUserSelect: 'none'
            }}
          >
            {hasValidAvatar && (
              <AvatarImage 
                src={avatar} 
                alt={`${username || "User"}'s avatar`}
                className="object-cover pointer-events-none select-none"
                draggable={false}
                style={{ 
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  pointerEvents: 'none',
                  WebkitUserDrag: 'none',
                  KhtmlUserDrag: 'none',
                  MozUserDrag: 'none',
                  OUserDrag: 'none',
                  userDrag: 'none'
                }}
              />
            )}
            <AvatarFallback 
              className="text-[10px] font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-colors pointer-events-none select-none"
              style={{ 
                userSelect: 'none',
                WebkitUserSelect: 'none',
                MozUserSelect: 'none',
                msUserSelect: 'none',
                pointerEvents: 'none'
              }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          <ChevronDown 
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 bg-background rounded-full p-0.5 border border-border/50 shadow-sm text-muted-foreground pointer-events-none select-none" 
            aria-hidden="true"
            style={{ 
              userSelect: 'none',
              WebkitUserSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent 
        className="w-64 p-2" 
        align="end" 
        sideOffset={8}
      >
        <DropdownMenuLabel className="p-2">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              {hasValidAvatar && (
                <AvatarImage 
                  src={avatar} 
                  alt={`${username || "User"}'s avatar`}
                  className="object-cover"
                />
              )}
              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {username || "User"}
              </span>
              <span className="text-xs text-muted-foreground">
                LiquiDB User
              </span>
            </div>
          </div>
        </DropdownMenuLabel>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground px-2 py-1.5">
            Theme
          </DropdownMenuLabel>
          
          <div className="px-2 py-2">
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
              <Button
                variant={theme === "light" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTheme("light")}
                className="h-8 w-8 p-0"
                onMouseEnter={sunIconHover.onMouseEnter}
                onMouseLeave={sunIconHover.onMouseLeave}
              >
                <SunIcon ref={sunIconHover.iconRef} size={16} />
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "ghost"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="h-8 w-8 p-0"
                onMouseEnter={moonIconHover.onMouseEnter}
                onMouseLeave={moonIconHover.onMouseLeave}
              >
                <MoonIcon ref={moonIconHover.iconRef} size={16} />
              </Button>
              <Button
                variant={theme === "system" || !theme ? "default" : "ghost"}
                size="sm"
                onClick={() => setTheme("system")}
                className="h-8 w-8 p-0"
              >
                <Monitor className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Choose your preferred theme
            </p>
          </div>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false)
              const event = new CustomEvent("open-app-settings")
              window.dispatchEvent(event)
            }}
            className="cursor-pointer gap-2"
            onMouseEnter={settingsIconHover.onMouseEnter}
            onMouseLeave={settingsIconHover.onMouseLeave}
          >
            <CogIcon ref={settingsIconHover.iconRef} size={16} />
            <span>Settings</span>
          </DropdownMenuItem>
          
          <DropdownMenuItem
            onClick={() => {
              setDropdownOpen(false)
              window.electron?.openExternalLink?.("https://liquidb.app/help")
            }}
            className="cursor-pointer gap-2"
            onMouseEnter={helpIconHover.onMouseEnter}
            onMouseLeave={helpIconHover.onMouseLeave}
          >
            <CircleHelpIcon ref={helpIconHover.iconRef} size={16} />
            <span>Help & Support</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem
          onClick={() => {
            setDropdownOpen(false)
            window.electron?.quitApp?.()
          }}
          className="cursor-pointer text-destructive focus:text-destructive gap-2"
          onMouseEnter={logoutIconHover.onMouseEnter}
          onMouseLeave={logoutIconHover.onMouseLeave}
        >
          <LogoutIcon ref={logoutIconHover.iconRef} size={16} />
          <span>Quit LiquiDB</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}




