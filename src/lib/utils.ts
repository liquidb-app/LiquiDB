import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Debug logger gated by NEXT_PUBLIC_DEBUG
export const debugLog = (...args: any[]) => {
  if (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_DEBUG) {
    // eslint-disable-next-line no-console
    console.log(...args)
  }
}
