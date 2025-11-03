"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
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
import { Kbd } from "@/components/ui/kbd"
import { Upload, LinkIcon } from "lucide-react"

// Component to handle custom image loading with file:// URL conversion
const SavedImageIcon = ({ src, alt, className }: { src: string, alt: string, className: string }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    const loadImage = async () => {
      if (!src) return
      
      // If it's already a data URL, use it directly
      if (src.startsWith('data:')) {
        setImageSrc(src)
        setIsLoading(false)
        return
      }
      
      // If it's a file:// URL, convert it to data URL
      if (src.startsWith('file://')) {
        try {
          // @ts-expect-error - Electron IPC types not available
          const result = await window.electron?.convertFileToDataUrl?.(src)
          if (result?.success) {
            setImageSrc(result.dataUrl)
          } else {
            console.error('Failed to convert file to data URL:', result?.error)
            setHasError(true)
          }
        } catch (error) {
          console.error('Error converting file to data URL:', error)
          setHasError(true)
        } finally {
          setIsLoading(false)
        }
      } else {
        // For other URLs, try to load directly
        setImageSrc(src)
        setIsLoading(false)
      }
    }

    loadImage()
  }, [src])

  if (isLoading) {
    return <div className="w-10 h-10 bg-muted rounded animate-pulse flex items-center justify-center text-xs">...</div>
  }

  if (hasError || !imageSrc) {
    return <div className="w-10 h-10 bg-muted rounded flex items-center justify-center text-xs">?</div>
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt} 
      className={className}
      onError={() => setHasError(true)}
    />
  )
}

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
  const [savedImages, setSavedImages] = useState<Array<{fileName: string, path: string, created: Date}>>([])
  const [isSaving, setIsSaving] = useState(false)

  // Load saved images when dialog opens
  useEffect(() => {
    if (open && window.electron?.getSavedImages) {
      window.electron.getSavedImages().then((result) => {
        if (result.success) {
          setSavedImages(result.images)
        }
      })
    }
  }, [open])

  const handleSave = useCallback(async () => {
    if (activeTab === "emoji") {
      onSave(selectedIcon)
    } else if (activeTab === "image" && imageUrl) {
      // Check if it's a data URL (uploaded file), file URL (saved image), or external URL
      if (imageUrl.startsWith("data:")) {
        // It's a data URL from file upload, save it locally
        setIsSaving(true)
        try {
          const result = await window.electron?.saveCustomImage({ dataUrl: imageUrl })
          if (result?.success) {
            onSave(result.imagePath)
          } else {
            console.error("Failed to save image:", result?.error)
            onSave(imageUrl) // Fallback to original data URL
          }
        } catch (error) {
          console.error("Error saving image:", error)
          onSave(imageUrl) // Fallback to original data URL
        } finally {
          setIsSaving(false)
        }
      } else if (imageUrl.startsWith("file://")) {
        // It's a file URL from a previously saved image, use it directly
        onSave(imageUrl)
      } else {
        // It's an external URL, save it locally
        setIsSaving(true)
        try {
          const result = await window.electron?.saveCustomImage({ imageUrl })
          if (result?.success) {
            onSave(result.imagePath)
          } else {
            console.error("Failed to save image:", result?.error)
            onSave(imageUrl) // Fallback to original URL
          }
        } catch (error) {
          console.error("Error saving image:", error)
          onSave(imageUrl) // Fallback to original URL
        } finally {
          setIsSaving(false)
        }
      }
    }
    onOpenChange(false)
  }, [activeTab, selectedIcon, imageUrl, onSave, onOpenChange])

  // Keyboard event handlers
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return
      
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (event.key) {
        case 'Enter':
          event.preventDefault()
          if ((selectedIcon || imageUrl) && !isSaving) {
            handleSave()
          }
          break
        case 'Escape':
          event.preventDefault()
          onOpenChange(false)
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIcon, imageUrl, isSaving, handleSave, onOpenChange])

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
                    className={`w-10 h-10 flex items-center justify-center text-2xl border-2 rounded-lg hover:bg-accent transition-all duration-200 ${
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

                {savedImages.length > 0 && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Saved Images</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 max-h-32 overflow-y-auto">
                      {savedImages.map((image) => (
                        <button
                          key={image.fileName}
                          onClick={() => setImageUrl(image.path)}
                          className={`w-12 h-12 flex items-center justify-center border-2 rounded-lg hover:bg-accent transition-all duration-200 ${
                            imageUrl === image.path ? "border-primary bg-accent" : "border-border"
                          }`}
                        >
                          <SavedImageIcon
                            src={image.path}
                            alt={image.fileName}
                            className="w-10 h-10 object-cover rounded"
                          />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} size="sm">
            Cancel <Kbd>Esc</Kbd>
          </Button>
          <Button onClick={handleSave} size="sm" disabled={(!selectedIcon && !imageUrl) || isSaving}>
            {isSaving ? "Saving..." : "Save Icon"} <Kbd>⏎</Kbd>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
