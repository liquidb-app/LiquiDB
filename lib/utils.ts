import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize URL for use in img src attributes to prevent XSS
 * Only allows safe URL schemes: http, https, data, and relative paths
 * @param url - URL to sanitize
 * @returns Sanitized URL or empty string if unsafe
 */
export function sanitizeImageUrl(url: string | undefined | null): string {
  if (!url) {
    return ""
  }
  
  // Allow relative paths (starting with /)
  if (url.startsWith("/")) {
    return url
  }
  
  // Allow data URLs (for base64 images)
  if (url.startsWith("data:")) {
    // Validate data URL format: data:[<mediatype>][;base64],<data>
    if (/^data:image\/[^;]+(;base64)?,/.test(url)) {
      return url
    }
    return ""
  }
  
  // Allow file:// URLs (for Electron file system access)
  if (url.startsWith("file://")) {
    return url
  }
  
  // Allow http/https URLs
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return url
    }
  } catch {
    // Invalid URL, return empty string
    return ""
  }
  
  // Block javascript:, vbscript:, and other dangerous schemes
  return ""
}
