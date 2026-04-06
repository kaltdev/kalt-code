import type { Platform } from '../utils/platform.js'

export function supportsClipboardImageFallback(platform: Platform): boolean {
  return (
    platform === 'macos' || platform === 'windows' || platform === 'linux'
  )
}
