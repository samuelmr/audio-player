import { locale, LANGUAGE_KEY } from './locale.js'
import { SORT_KEY } from './library-order.js'

// Home screen web apps on iOS have their own storage, separate from the browser,
// and the TV app can't read the phone's storage either, so settings are moved
// over with a settings code (clipboard, QR code, or pasted into a text field)
export const SETTINGS_CODE_PREFIX = 'ctrl-audio-settings:'

export function encodeSettings(settings) {
  const bytes = new TextEncoder().encode(JSON.stringify(settings))
  return SETTINGS_CODE_PREFIX + btoa(String.fromCharCode(...bytes))
}

// the settings stored on the device, in the order of the settings dialog
const SETTING_KEYS = ['accessKeyId', 'secretAccessKey', 'endpoint', 'region', 'bucketName', 'playerColor', SORT_KEY, LANGUAGE_KEY]

// The QR code holds a link to the player, with the code in the fragment, so
// that a phone's camera opens the player and the player stores the settings.
// The fragment is never sent to a server.
const LINK_PARAM = 'settings'

export function settingsLink(code, playerUrl) {
  const url = new URL(playerUrl)
  url.search = ''
  url.hash = `${LINK_PARAM}=${encodeURIComponent(code)}`
  return url.href
}

// the code in a link made by settingsLink, or the text itself, if it isn't one
function codeFrom(text) {
  text = (text || '').trim()
  if (text.startsWith(SETTINGS_CODE_PREFIX)) return text
  try {
    return new URLSearchParams(new URL(text).hash.slice(1)).get(LINK_PARAM) || text
  } catch(e) {
    return text
  }
}

export function isSettingsCode(text) {
  return codeFrom(text).startsWith(SETTINGS_CODE_PREFIX)
}

// Stores the settings of a link in the address bar and takes them out of the
// address. Returns whether there were any. Throws when the link is invalid.
export function applySettingsLink(hash = location.hash) {
  if (!hash.startsWith(`#${LINK_PARAM}=`)) return false
  history.replaceState(null, '', location.pathname + location.search)
  const settings = decodeSettings(new URLSearchParams(hash.slice(1)).get(LINK_PARAM))
  for (const key of SETTING_KEYS) {
    if (typeof settings[key] === 'string') localStorage.setItem(key, settings[key])
  }
  return true
}

export function decodeSettings(code) {
  code = codeFrom(code)
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
