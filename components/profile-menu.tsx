"use client"

import React, { useEffect, useState } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { loadProfile, saveProfile, getInitials } from "@/lib/preferences"
import { Monitor, Moon, Sun, Cog, HelpCircle, LogOut } from "lucide-react"
import { useTheme } from "next-themes"

export function ProfileMenuTrigger() {
  const [username, setUsername] = useState<string>("")
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const p = loadProfile()
    if (p) {
      setUsername(p.username)
      setAvatar(p.avatar)
    }
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen && !(event.target as Element)?.closest('.profile-menu-container')) {
        setDropdownOpen(false)
      }
    }

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [dropdownOpen])

  const initials = getInitials(username || "User")
  const hasValidAvatar = avatar && avatar.startsWith('data:')

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = async (e) => {
          const result = e.target?.result as string
          setAvatar(result)

          // Save avatar to user's computer
          try {
            // @ts-ignore
            const saveResult = await window.electron?.saveAvatar?.(result)
            if (saveResult?.success) {
              console.log('Avatar saved to disk:', saveResult.imagePath)
              // Update profile using the proper save function
              saveProfile({ username, avatar: result })
            } else {
              console.warn('Failed to save avatar to disk:', saveResult?.error)
            }
          } catch (error) {
            console.warn('Error saving avatar to disk:', error)
          }
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 rounded-full p-0"
        aria-label="Open menu"
        id="btn-open-settings"
        onClick={(e) => {
          // Only open dropdown if clicking outside the avatar area
          if (!e.currentTarget.querySelector('.avatar-click-area')?.contains(e.target as Node)) {
            setDropdownOpen(!dropdownOpen)
          }
        }}
      >
        <Avatar className="h-7 w-7 cursor-pointer avatar-click-area">
          <span
            className="h-full w-full inline-flex items-center justify-center"
            tabIndex={0}
            role="button"
            aria-label="Change avatar"
            onClick={handleAvatarClick}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleAvatarClick(e as any)
              }
            }}
            style={{ outline: 'none' }}
          >
            {hasValidAvatar && (
              <AvatarImage src={avatar} alt={`${username || "User"}'s avatar`} />
            )}
            <AvatarFallback className="text-[9px] font-semibold bg-primary/10 hover:bg-primary/20 transition-colors">
              {initials}
            </AvatarFallback>
          </span>
        </Avatar>
      </Button>

      {/* Dropdown Menu positioned absolutely */}
      {dropdownOpen && (
        <div className="absolute top-8 right-0 z-50">
          <div className="w-56 bg-background border rounded-md shadow-lg">
            <div className="p-2 text-sm font-medium text-foreground truncate border-b">{username || "Profile"}</div>
            <div className="py-1">
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
              <div className="border-t my-1"></div>
              <div className="px-2 py-1">
                <div
                  className="flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                  onClick={() => {
                    const event = new CustomEvent("open-app-settings")
                    window.dispatchEvent(event)
                    setDropdownOpen(false)
                  }}
                >
                  <Cog className="mr-2 h-4 w-4" /> Settings
                </div>
                <div
                  className="flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                  onClick={() => {
                    // @ts-ignore
                    window.electron?.openExternalLink?.("https://liquidb.app/help")
                    setDropdownOpen(false)
                  }}
                >
                  <HelpCircle className="mr-2 h-4 w-4" /> Help
                </div>
                <div className="border-t my-1"></div>
                <div
                  className="flex items-center px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded-sm"
                  onClick={() => {
                    // @ts-ignore
                    window.electron?.quitApp?.()
                    setDropdownOpen(false)
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Quit
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




