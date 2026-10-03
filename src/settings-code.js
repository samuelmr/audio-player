import { locale } from './locale.js'

// Home screen web apps on iOS have their own storage, separate from the browser,
// and the TV app can't read the phone's storage either, so settings are moved
// over with a settings code (clipboard, QR code, or pasted into a text field)
export const SETTINGS_CODE_PREFIX = 'ctrl-audio-settings:'

export function encodeSettings(settings) {
  const bytes = new TextEncoder().encode(JSON.stringify(settings))
  return SETTINGS_CODE_PREFIX + btoa(String.fromCharCode(...bytes))
}

export function decodeSettings(code) {
  code = (code || '').trim()
  if (!code.startsWith(SETTINGS_CODE_PREFIX)) {
    throw new Error(locale.invalidCode)
  }
  try {
    const bytes = Uint8Array.from(atob(code.slice(SETTINGS_CODE_PREFIX.length)), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch(e) {
    throw new Error(locale.invalidCode)
  }
}
