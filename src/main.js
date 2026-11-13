// Shared by the PWA and the TV app. Webpack resolves '#platform'
// to src/platform/pwa.js or src/platform/tizen.js
import * as platform from '#platform'
import { connectS3 } from './s3.js'
import { initBrowser, browserList, getFolders, orderLibrary, clearLibrary, takeLinkedPlaylists, linkedNeedsListing, addLinkedPlaylists } from './browser.js'
import { holdLibrary, releaseLibrary, whenLibraryMayStart } from './startup.js'
import { initSearch, resetSearchKeys } from './search.js'
import { initSettings } from './settings.js'
import { setting } from './defaults.js'
import { initPlayer, clearQueue } from './player.js'
import { initOffline, runDownloads } from './offline.js'
import { initShuffle } from './shuffle.js'
import { clearMeta, hasMeta } from './db.js'
import { scanLibrary, stopLibraryScan } from './scan.js'
import { initErrorHandling, reportError } from './errors.js'
import { applySettingsLink } from './settings-code.js'
import { locale, LANGUAGE_KEY } from './locale.js'
import { notify } from './adding.js'

initErrorHandling()

// a link from the QR code of another device carries its settings
let linkedSettings = false, linkError
try {
  const language = localStorage.getItem(LANGUAGE_KEY)
  linkedSettings = applySettingsLink()
  // the texts are set as the app starts
  if (linkedSettings && localStorage.getItem(LANGUAGE_KEY) != language) location.reload()
} catch(e) {
  // told once the page is up
  linkError = e
}

const storedColor = localStorage.getItem('playerColor')
if (storedColor) {
  document.documentElement.style.setProperty('--base-hue', storedColor);
}

const player = document.querySelector('audio-player')
if (!player) {
  throw new Error("Didn't find an audio-player element in HTML document")
}
if (!player.id) {
  player.id = 'my-audio-player' // possible clash...
}

const browser = document.querySelector('audio-browser')
if (!browser) {
  throw new Error("Didn't find an audio-browser element in HTML document")
}

const sourceKey = () => ['endpoint', 'region', 'bucketName'].map(setting).join(' ')
let source = sourceKey()

function initS3() {
  connectS3()
  resetSearchKeys()
  clearLibrary()
  // The playlists in the address are read first, and the first track gets
  // the connection to itself: the library waits for it. Folders and songs in
  // the address are found in the listing, so it can't wait for them.
  const playlists = takeLinkedPlaylists()
  if (playlists.length && !linkedNeedsListing()) holdLibrary()
  addLinkedPlaylists(playlists).finally(() => {
    // nothing came of them: nothing to wait for
    if (!document.querySelector('audio-player audio-track')) releaseLibrary()
  })
  whenLibraryMayStart(() => getFolders(browserList))
}

initSearch(initBrowser(browser, player))
const settings = initSettings(player, {
  onSave: () => {
    // the queued tracks are from the old source
    if (sourceKey() != source) {
      source = sourceKey()
      clearQueue()
    }
    initS3()
    runDownloads()
  },
  addTransferControls: platform.addTransferControls,
  hasLocalData: hasMeta,
  clearLocalData: async () => {
    // a running scan would put the old metadata back
    stopLibraryScan()
    await clearMeta()
    resetSearchKeys()
    await orderLibrary()
  },
  // the sort names may be new
  scanLibrary: (onProgress) => scanLibrary(onProgress).finally(orderLibrary),
  stopLibraryScan,
})
initPlayer(player, {oneAudioElement: platform.oneAudioElement})
initShuffle(initOffline(player))
platform.init()
if (linkedSettings) notify(locale.settingsImported)
if (linkError) reportError(linkError, locale.invalidLink)

try {
  initS3()
} catch(e) {
  settings.showError(e)
}
