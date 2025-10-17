"use client"

import type React from "react"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Upload, LinkIcon } from "lucide-react"

interface IconPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentIcon: string
  onSave: (icon: string) => void
}

const EMOJI_LIST = [
  "🐘",
  "🐬",
  "🍃",
  "🔴",
  "💾",
  "🗄️",
  "📊",
  "🔷",
  "🟦",
  "🟪",
  "🟩",
  "🟨",
  "🟧",
  "🟥",
  "⚡",
  "🔥",
  "💡",
  "🚀",
  "⭐",
  "💎",
  "🎯",
  "🎨",
  "🎭",
  "🎪",
  "🎬",
  "🎮",
  "🎲",
  "🎰",
  "🧩",
  "🔮",
  "📱",
  "💻",
  "⌨️",
  "🖥️",
  "🖨️",
  "🖱️",
  "💿",
  "📀",
  "🧮",
  "📡",
]

export function IconPickerDialog({ open, onOpenChange, currentIcon, onSave }: IconPickerDialogProps) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon)
  const [imageUrl, setImageUrl] = useState("")
  const [activeTab, setActiveTab] = useState<"emoji" | "image">("emoji")

  const handleSave = () => {
    if (activeTab === "emoji") {
      onSave(selectedIcon)
    } else if (activeTab === "image" && imageUrl) {
      onSave(imageUrl)
    }
    onOpenChange(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setImageUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] !top-[15vh] !translate-y-0">
        <DialogHeader>
          <DialogTitle>Choose Icon</DialogTitle>
          <DialogDescription>Select an emoji or upload a custom image</DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px] max-h-[400px] overflow-y-auto">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "emoji" | "image")} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="emoji">Emoji</TabsTrigger>
              <TabsTrigger value="image">Custom Image</TabsTrigger>
            </TabsList>

            <TabsContent value="emoji" className="space-y-3 pt-3">
              <div className="grid grid-cols-8 gap-2">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setSelectedIcon(emoji)}
                    className={`w-10 h-10 flex items-center justify-center text-2xl border-2 rounded-lg hover:bg-accent transition-all duration-200 hover:scale-110 ${
                      selectedIcon === emoji ? "border-primary bg-accent" : "border-border"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              {selectedIcon && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <span className="text-3xl">{selectedIcon}</span>
                  <span className="text-sm text-muted-foreground">Selected emoji</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="image" className="space-y-3 pt-3">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="image-url" className="text-xs">
                    Image URL
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="image-url"
                      placeholder="https://example.com/image.png"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="h-8 text-sm flex-1"
                    />
                    <Button variant="outline" size="sm" className="h-8 px-3 bg-transparent">
                      <LinkIcon className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="image-upload" className="text-xs">
                    Upload Image
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="h-8 text-sm flex-1"
                    />
                    <Button variant="outline" size="sm" className="h-8 px-3 bg-transparent">
                      <Upload className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {imageUrl && (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <img
                      src={imageUrl || "/placeholder.svg"}
                      alt="Preview"
                      className="w-12 h-12 object-cover rounded"
                    />
                    <span className="text-sm text-muted-foreground">Image preview</span>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Cancel
          </Button>
          <Button onClick={handleSave} size="sm" disabled={!selectedIcon && !imageUrl}>
            Save Icon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
