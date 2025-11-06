/**
 * Formatting utility functions
 */

/**
 * Format a compact number with trailing zeros removed
 */
function formatCompactNumber(value: number, maxDecimals = 2): string {
  const fixed = Number.isFinite(value) ? value.toFixed(maxDecimals) : '0'
  // strip trailing zeros and optional dot
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

/**
 * Format bytes to human-readable string (B, KB, MB, GB, TB)
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  const value = bytes / Math.pow(k, i)
  return `${formatCompactNumber(value, 1)} ${sizes[i]}`
}


