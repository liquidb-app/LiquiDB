/**
 * Platform Detection and Module Selection
 * 
 * Provides runtime platform detection and exports the appropriate
 * platform-specific implementation module.
 */

import * as os from 'os'

const PLATFORM = process.platform
const IS_MAC = PLATFORM === 'darwin'
const IS_WINDOWS = PLATFORM === 'win32'
const IS_LINUX = PLATFORM === 'linux'

// Platform-specific implementations
let platformImpl: any = null

try {
  if (IS_MAC) {
    platformImpl = require('./mac')
  } else if (IS_WINDOWS) {
    platformImpl = require('./windows')
  } else if (IS_LINUX) {
    platformImpl = require('./linux')
  } else {
    console.error(`[Platform] Unsupported platform: ${PLATFORM}`)
    // Don't throw, just log - allow app to continue
  }
} catch (error: any) {
  console.error(`[Platform] Failed to load platform module for ${PLATFORM}:`, error.message)
  // Don't throw - allow app to continue even if platform module fails to load
  // The app should still be able to start, just without platform-specific features
}

export const platform = {
  name: PLATFORM,
  isMac: IS_MAC,
  isWindows: IS_WINDOWS,
  isLinux: IS_LINUX
}

// Export the platform implementation (or empty object if loading failed)
export default platformImpl || {}

// Also export as CommonJS for compatibility
module.exports = platformImpl || {}
module.exports.platform = platform

