// Shared by the PWA and the TV app. Webpack resolves '#platform'
// to src/platform/pwa.js or src/platform/tizen.js
import * as platform from '#platform'
import { connectS3 } from './s3.js'
import { initBrowser, browserList, getFolders, orderLibrary } from './browser.js'
import { initSearch, resetSearchKeys } from './search.js'
import { initSettings } from './settings.js'
import { initPlayer } from './player.js'
import { initOffline, runDownloads } from './offline.js'
import { scanLibrary, stopLibraryScan } from './scan.js'

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

function initS3() {
  connectS3()
  resetSearchKeys()
  getFolders(browserList)
}

initSearch(initBrowser(browser, player))
const settings = initSettings(player, {
  onSave: () => {
    initS3()
    runDownloads()
  },
  addTransferControls: platform.addTransferControls,
  // the sort names may be new
  scanLibrary: (onProgress) => scanLibrary(onProgress).finally(orderLibrary),
  stopLibraryScan,
})
initPlayer(player)
initOffline(player)
platform.init()

try {
  initS3()
} catch(e) {
  settings.showError(e)
}
