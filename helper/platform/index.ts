/**
 * Platform Detection and Module Selection
 * 
 * Provides macOS platform detection and exports the macOS-specific
 * implementation module.
 */

const PLATFORM = process.platform
const IS_MAC = PLATFORM === 'darwin'

// Platform-specific implementations
let platformImpl: any = null

try {
  if (IS_MAC) {
    platformImpl = require('./mac')
  } else {
    console.error(`[Platform] Unsupported platform: ${PLATFORM}. Only macOS is supported.`)
    // Don't throw, just log - allow app to continue
  }
} catch (error: any) {
  console.error(`[Platform] Failed to load macOS platform module:`, error.message)
  // Don't throw - allow app to continue even if platform module fails to load
  // The app should still be able to start, just without platform-specific features
}

export const platform = {
  name: PLATFORM,
  isMac: IS_MAC
}

// Export the platform implementation (or empty object if loading failed)
export default platformImpl || {}

// Also export as CommonJS for compatibility
module.exports = platformImpl || {}
module.exports.platform = platform

