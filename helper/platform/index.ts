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

if (IS_MAC) {
  platformImpl = require('./mac')
} else if (IS_WINDOWS) {
  platformImpl = require('./windows')
} else if (IS_LINUX) {
  platformImpl = require('./linux')
} else {
  throw new Error(`Unsupported platform: ${PLATFORM}`)
}

export const platform = {
  name: PLATFORM,
  isMac: IS_MAC,
  isWindows: IS_WINDOWS,
  isLinux: IS_LINUX
}

// Export the platform implementation
export default platformImpl

// Also export as CommonJS for compatibility
module.exports = platformImpl
module.exports.platform = platform

