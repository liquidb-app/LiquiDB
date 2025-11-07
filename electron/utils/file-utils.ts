import * as path from "path"
import * as fs from "fs"
import * as http from "http"
import * as https from "https"
import { App } from "electron"

/**
 * Get images directory
 * @param {object} app - Electron app instance
 * @returns {string} - Path to images directory
 */
export function getImagesDirectory(app: App): string {
  const dataDir = app.getPath("userData")
  const imagesDir = path.join(dataDir, "images")
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true })
  }
  return imagesDir
}

/**
 * Generate image file name
 * @param {string} originalUrl - Original image URL
 * @param {string} dataUrl - Data URL
 * @returns {string} - Generated file name
 */
export function generateImageFileName(originalUrl?: string, dataUrl?: string): string {
  const timestamp = Date.now()
  let extension = "png" // default
  
  if (originalUrl) {
    // Try to get extension from URL
    const urlMatch = originalUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i)
    if (urlMatch) {
      extension = urlMatch[1].toLowerCase()
    }
  } else if (dataUrl) {
    // Try to get extension from data URL
    const dataUrlMatch = dataUrl.match(/data:image\/([^;]+)/)
    if (dataUrlMatch) {
      extension = dataUrlMatch[1].toLowerCase()
    }
  }
  
  return `custom-icon-${timestamp}.${extension}`
}

/**
 * Download image from URL
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} - Image buffer
 */
export function downloadImageFromUrl(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https:") ? https : http
    
    protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`))
        return
      }
      
      const chunks: Buffer[] = []
      response.on("data", (chunk: Buffer) => chunks.push(chunk))
      response.on("end", () => {
        const buffer = Buffer.concat(chunks)
        resolve(buffer)
      })
    }).on("error", (error: Error) => {
      reject(error)
    })
  })
}

/**
 * Save data URL to file
 * @param {string} dataUrl - Data URL
 * @param {string} filePath - File path
 * @returns {Promise<void>}
 */
export function saveDataUrlToFile(dataUrl: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64Data = dataUrl.replace(/^data:image\/[a-z]+;base64,/, "")
      const buffer = Buffer.from(base64Data, "base64")
      fs.writeFile(filePath, buffer, (error: NodeJS.ErrnoException | null) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    } catch (error: any) {
      reject(error)
    }
  })
}

