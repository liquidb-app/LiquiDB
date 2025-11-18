import { ipcMain, App } from "electron"
import * as fs from "fs"
import * as path from "path"
import { getImagesDirectory, generateImageFileName, downloadImageFromUrl, saveDataUrlToFile } from "../utils/file-utils"
import storage from "../storage"

/**
 * Register file/image IPC handlers
 */
export function registerFileHandlers(app: App): void {
  if (!ipcMain) {
    return
  }

  // IPC handler to save custom image
  ipcMain.handle("save-custom-image", async (event, { imageUrl, dataUrl }: { imageUrl?: string, dataUrl?: string }) => {
    try {
      console.log("[Image Save] Saving custom image...")
      
      const imagesDir = getImagesDirectory(app)
      const fileName = generateImageFileName(imageUrl, dataUrl)
      const filePath = path.join(imagesDir, fileName)
      
      if (imageUrl) {
        // Download image from URL
        console.log(`[Image Save] Downloading image from URL: ${imageUrl}`)
        const imageBuffer = await downloadImageFromUrl(imageUrl)
        fs.writeFileSync(filePath, imageBuffer)
      } else if (dataUrl) {

        console.log(`[Image Save] Saving data URL to file: ${fileName}`)
        await saveDataUrlToFile(dataUrl, filePath)
      } else {
        throw new Error("No image URL or data URL provided")
      }
      

      const relativePath = `file://${filePath}`
      console.log(`[Image Save] Image saved successfully: ${relativePath}`)
      return { success: true, imagePath: relativePath, fileName }
      
    } catch (error: any) {
      console.error("[Image Save] Error saving custom image:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler to get saved images
  ipcMain.handle("get-saved-images", async () => {
    try {
      const imagesDir = getImagesDirectory(app)
      const files = fs.readdirSync(imagesDir)
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file)
      )
      
      const images = imageFiles.map(file => ({
        fileName: file,
        path: `file://${path.join(imagesDir, file)}`,
        created: fs.statSync(path.join(imagesDir, file)).birthtime
      }))
      

      images.sort((a, b) => b.created.getTime() - a.created.getTime())
      
      console.log(`[Image Get] Found ${images.length} saved images`)
      return { success: true, images }
      
    } catch (error: any) {
      console.error("[Image Get] Error getting saved images:", error)
      return { success: false, error: error.message, images: [] }
    }
  })

  // IPC handler to save avatar image
  ipcMain.handle("save-avatar", async (event, dataUrl: string) => {
    try {
      console.log("[Avatar Save] Saving avatar image...")

      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        throw new Error("Invalid avatar data URL")
      }

      const imagesDir = getImagesDirectory(app)
      const timestamp = Date.now()
      const extension = dataUrl.match(/data:image\/([^;]+)/)?.[1] || 'png'
      const fileName = `avatar_${timestamp}.${extension}`
      const filePath = path.join(imagesDir, fileName)


      await saveDataUrlToFile(dataUrl, filePath)

      console.log(`[Avatar Save] Avatar saved successfully: ${filePath}`)
      return { success: true, imagePath: `file://${filePath}`, fileName }

    } catch (error: any) {
      console.error("[Avatar Save] Error saving avatar:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler to convert file URL to data URL
  ipcMain.handle("convert-file-to-data-url", async (event, fileUrl: string) => {
    try {
      console.log(`[Image Convert] Converting file URL to data URL: ${fileUrl}`)
      

      const filePath = decodeURIComponent(fileUrl.replace('file://', ''))
      

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`)
      }
      

      const fileBuffer = fs.readFileSync(filePath)
      

      const ext = path.extname(filePath).toLowerCase()
      let mimeType = 'image/png' // default
      
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg'
          break
        case '.png':
          mimeType = 'image/png'
          break
        case '.gif':
          mimeType = 'image/gif'
          break
        case '.webp':
          mimeType = 'image/webp'
          break
        case '.svg':
          mimeType = 'image/svg+xml'
          break
      }
      

      const base64Data = fileBuffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64Data}`
      
      console.log(`[Image Convert] Successfully converted to data URL (${base64Data.length} chars)`)
      return { success: true, dataUrl }
      
    } catch (error: any) {
      console.error("[Image Convert] Error converting file to data URL:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler to check if databases.json exists
  ipcMain.handle("check-databases-file", async () => {
    try {
      const exists = storage.checkDatabasesFileExists(app)
      // Only log if file doesn't exist (error case)
      if (!exists) {
        console.log(`[Storage Check] databases.json does not exist`)
      }
      return { success: true, exists }
    } catch (error: any) {
      console.error("[Storage Check] Error checking databases file:", error)
      return { success: false, error: error.message, exists: false }
    }
  })

  // IPC handler to recreate databases.json file
  ipcMain.handle("recreate-databases-file", async () => {
    try {
      storage.recreateDatabasesFile(app)
      return { success: true }
    } catch (error: any) {
      console.error("[Storage Recreate] Error recreating databases file:", error)
      return { success: false, error: error.message }
    }
  })
}

