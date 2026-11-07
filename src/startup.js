// When the address names playlists, they are read at once and the library
// waits: the first track gets the connection to itself, as the metadata of
// the library would otherwise take it. The library goes on when that track
// can play, or after a while, whichever comes first.
import { LIBRARY_HOLD_TIMEOUT } from './constants.js'

let held = false
let pending, timer

// media events don't bubble, but they can be caught on the way down. The
// element that plays is the one marked current.
const trackReady = (e) => {
  if (e.target?.classList?.contains('current')) releaseLibrary()
}

export function holdLibrary() {
  if (held) return
  held = true
  document.addEventListener('canplay', trackReady, true)
  timer = setTimeout(releaseLibrary, LIBRARY_HOLD_TIMEOUT)
}

export function releaseLibrary() {
  if (!held) return
  held = false
  clearTimeout(timer)
  document.removeEventListener('canplay', trackReady, true)
  const start = pending
  pending = undefined
  start?.()
}

// the latest request counts: a new one replaces one that waits
export function whenLibraryMayStart(start) {
  if (held) {
    pending = start
  } else {
    start()
  }
}
