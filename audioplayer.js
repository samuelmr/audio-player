import { S3Client } from "@aws-sdk/client-s3"
import { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import qrcode from "qrcode-generator"
import jsQR from "jsqr"

const EXPIRE_SECONDS = 7 * 24 * 60 * 60
const WAKELOCK_CLEAR_TIMEOUT = 5 * 60 * 1000
const SEEK_TARGET_TIMEOUT = 100
const folderDelimiter = '/'

const pauseSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96zM400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z"/></svg>'
const playSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/></svg>'
const returnSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M236.3 107.1C247.9 96 265 92.9 279.7 99.2C294.4 105.5 304 120 304 136L304 272.3L476.3 107.2C487.9 96 505 92.9 519.7 99.2C534.4 105.5 544 120 544 136L544 504C544 520 534.4 534.5 519.7 540.8C505 547.1 487.9 544 476.3 532.9L304 367.7L304 504C304 520 294.4 534.5 279.7 540.8C265 547.1 247.9 544 236.3 532.9L44.3 348.9C36.5 341.3 32 330.9 32 320C32 309.1 36.5 298.7 44.3 291.1L236.3 107.1z"/></svg>'
const forwardSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M403.7 107.1C392.1 96 375 92.9 360.3 99.2C345.6 105.5 336 120 336 136L336 272.3L163.7 107.2C152.1 96 135 92.9 120.3 99.2C105.6 105.5 96 120 96 136L96 504C96 520 105.6 534.5 120.3 540.8C135 547.1 152.1 544 163.7 532.9L336 367.7L336 504C336 520 345.6 534.5 360.3 540.8C375 547.1 392.1 544 403.7 532.9L595.7 348.9C603.5 341.3 608 330.9 608 320C608 309.1 603.5 298.7 595.7 291.1L403.7 107.1z"/></svg>'
const addSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM296 408L296 344L232 344C218.7 344 208 333.3 208 320C208 306.7 218.7 296 232 296L296 296L296 232C296 218.7 306.7 208 320 208C333.3 208 344 218.7 344 232L344 296L408 296C421.3 296 432 306.7 432 320C432 333.3 421.3 344 408 344L344 344L344 408C344 421.3 333.3 432 320 432C306.7 432 296 421.3 296 408z"/></svg>'
const offlineSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM7 3h2v5.6l2.3-2.3 1.4 1.4L8 12.4 3.3 7.7l1.4-1.4L7 8.6z"/></svg>'
const removeSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><!--!Font Awesome Free v7.3.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.--><path d="M320 576C461.4 576 576 461.4 576 320C576 178.6 461.4 64 320 64C178.6 64 64 178.6 64 320C64 461.4 178.6 576 320 576zM231 231C240.4 221.6 255.6 221.6 264.9 231L319.9 286L374.9 231C384.3 221.6 399.5 221.6 408.8 231C418.1 240.4 418.2 255.6 408.8 264.9L353.8 319.9L408.8 374.9C418.2 384.3 418.2 399.5 408.8 408.8C399.4 418.1 384.2 418.2 374.9 408.8L319.9 353.8L264.9 408.8C255.5 418.2 240.3 418.2 231 408.8C221.7 399.4 221.6 384.2 231 374.9L286 319.9L231 264.9C221.6 255.5 221.6 240.3 231 231z"/></svg>'

const locale = {}
locale.play = 'Play'
locale.previous = 'Previous'
locale.next = 'Next'
locale.playFolder = `Add all tracks to queue`
locale.playSong = `Add track to queue`
locale.playlistTitle = `Playlists`
locale.playPlaylist = `Add playlist contents to queue`
locale.jumpTo = `Jump to`
locale.save = `Save`
locale.reset = `Cancel`
locale.transferTitle = `Transfer settings`
locale.copySettings = `Copy settings code`
locale.pasteSettings = `Paste settings code`
locale.showQR = `Show QR code`
locale.hideQR = `Hide QR code`
locale.scanQR = `Scan QR code`
locale.stopScan = `Stop scanning`
locale.copied = `Settings code copied. It contains your secret key, so keep it safe.`
locale.pastePrompt = `Paste settings code`
locale.invalidCode = `Not a valid settings code`
locale.search = `Search`
locale.searchPlaceholder = `Search artists, albums, tracks…`
locale.noResults = `No matches`
locale.saveOffline = `Save offline`
locale.offlineName = `Name`
locale.offlinePlaylistsTitle = `Offline playlists`
locale.playOfflinePlaylist = `Add playlist contents to queue`
locale.removeOffline = `Remove from offline storage`
locale.confirmRemoveOffline = (name) => `Remove "${name}" from offline storage?`
locale.offlineSaved = `Saved offline`
locale.offlineDownloading = `Saving offline…`
locale.offlineFailed = `Saving offline failed`
locale.storageFull = `Storage is full, downloads paused`
// locale.playAlbum = `Add all album tracks to queue`

const MAX_SEARCH_RESULTS = 50
const MAX_FOLDER_RESULTS = 20
const MIN_SEARCH_LENGTH = 2
const SEARCH_DEBOUNCE = 250

let s3, bucketName, playerList, browserList, playlistList, db
let skipMenu, previousFirst, sourceLink, wakeLock, wakelockCooldown
let seekTarget, seekTimeout
let searchInput, searchResults, searchTimeout, searchKeys, searchKeysPromise
let searchRun = 0
let offlineParent, offlineList, offlineMessage

// offline playlists use the same format as the .json playlists in S3:
// {title, track: [{url: <S3 key>, ...metadata}]}, plus id and created
const OFFLINE_PLAYLISTS = 'offlinePlaylists'
const OFFLINE_AUDIO = 'offlineAudio'
const offlineKeys = new Set() // keys of the tracks stored in OFFLINE_AUDIO
const offlineUrls = new Map() // key -> object URL of the stored blob
const failedKeys = new Set() // not retried until the next start or 'online' event
const trackMeta = new WeakMap() // audio-track -> metadata, for saving playlists
let downloadRunning = false
let downloadKey, downloadController

const preloadCache = {}
let preloading = false

const storedColor = localStorage.getItem('playerColor')
if (storedColor) {
  document.documentElement.style.setProperty('--base-hue', storedColor);
}

const dbRequest = indexedDB.open("audio-library", 4)
dbRequest.onupgradeneeded = function(event) {
  const db = dbRequest.result
  if (event.oldVersion < 1) {
    const cache = db.createObjectStore("meta", {keyPath: "key"})
    const artistIndex = cache.createIndex("by_artist", "artist")
    const albumIndex = cache.createIndex("by_album", "album")
    const titleIndex = cache.createIndex("by_title", "title")
    const tracknumberIndex = cache.createIndex("by_tracknumber", "tracknumber")
    const yearIndex = cache.createIndex("by_year", "year")
    const playlistIndex = cache.createIndex("by_playlist", "playlist")
    const genreIndex = cache.createIndex("by_genre", "genre")
    const commentIndex = cache.createIndex("by_comment", "comment")
  }
  if (event.oldVersion < 2) {
    const cache = dbRequest.transaction.objectStore("meta")
    const keyIndex = cache.createIndex("key", "key", {unique: true})
  }
  if (event.oldVersion < 3) {
    const cache = dbRequest.transaction.objectStore("meta")
    const commentIndex = cache.createIndex("image", "image")
  }
  if (event.oldVersion < 4) {
    db.createObjectStore(OFFLINE_PLAYLISTS, {keyPath: "id", autoIncrement: true})
    db.createObjectStore(OFFLINE_AUDIO, {keyPath: "key"})
  }
}
const dbReady = new Promise((resolve, reject) => {
  dbRequest.onsuccess = function() {
    db = dbRequest.result
    resolve(db)
  }
  dbRequest.onerror = () => reject(dbRequest.error)
})

const myUri = new URL(document.location.href)
let myPath = decodeURIComponent(myUri.hash.replace('#', '')).split(folderDelimiter)

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
else {
  const skipNav = document.createElement('nav')
  skipNav.id = 'skipNav'
  skipMenu = document.createElement('ol')
  const li = document.createElement('li')
  const a = document.createElement('a')
  a.href = `#${player.id}`
  a.title = `#${locale.jumpTo} ${locale.play}`
  a.innerHTML = '⏵'
  li.appendChild(a)
  skipMenu.appendChild(li)
  skipNav.appendChild(skipMenu)
  browserList = document.createElement('nav')
  const playlistParent = document.createElement('ol')
  playlistParent.id = 'playlists'
  playlistParent.className = 'playlists'
  const pli = document.createElement('li')
  pli.className = 'folder'
  pli.innerHTML = locale.playlistTitle
  pli.onclick = function(e) {
    e.preventDefault()
    e.stopPropagation()
    const isOpen = this.classList.toggle('open')
  }
  playlistList = document.createElement('ol')
  playlistList.className = 'playlists'
  pli.appendChild(playlistList)
  playlistParent.appendChild(pli)
  // class 'playlists' keeps getFolders from using these lists for folders
  offlineParent = document.createElement('ol')
  offlineParent.id = 'offline-playlists'
  offlineParent.className = 'playlists'
  offlineParent.hidden = true
  const oli = document.createElement('li')
  oli.className = 'folder'
  oli.textContent = locale.offlinePlaylistsTitle + ' '
  oli.onclick = function(e) {
    e.preventDefault()
    e.stopPropagation()
    this.classList.toggle('open')
  }
  offlineMessage = document.createElement('span')
  offlineMessage.className = 'offline-message'
  oli.appendChild(offlineMessage)
  offlineList = document.createElement('ol')
  offlineList.className = 'playlists'
  oli.appendChild(offlineList)
  offlineParent.appendChild(oli)
  const mli = document.createElement('li')
  const pa = document.createElement('a')
  pa.title = `#${locale.jumpTo} ${locale.playlistTitle}`
  pa.href = `#playlists`
  pa.innerHTML = '#'
  mli.appendChild(pa)
  skipMenu.appendChild(mli)
  const searchBox = document.createElement('div')
  searchBox.className = 'search'
  searchInput = document.createElement('input')
  searchInput.type = 'search'
  searchInput.title = locale.search
  searchInput.placeholder = locale.searchPlaceholder
  searchInput.autocomplete = 'off'
  searchInput.oninput = () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(runSearch, SEARCH_DEBOUNCE)
  }
  searchInput.onkeydown = (e) => {
    if (e.key == 'Escape') {
      searchInput.value = ''
      runSearch()
    }
  }
  searchResults = document.createElement('ul')
  searchResults.className = 'search-results'
  searchBox.appendChild(searchInput)
  searchBox.appendChild(searchResults)
  skipNav.appendChild(searchBox)
  browser.innerHTML = ''
  browser.appendChild(skipNav)
  browserList.appendChild(offlineParent)
  browserList.appendChild(playlistParent)
  browser.appendChild(browserList)
}

const ss = document.createElement('dialog')
ss.id = 'settings'
ss.setAttribute('closedby', 'any')
const gearBtn = document.createElement('button')
gearBtn.className = 'gear'
gearBtn.type = 'button'
gearBtn.textContent = '⚙'
gearBtn.onclick = () => ss.showModal()

const settingsForm = document.createElement('form')
settingsForm.method = 'dialog'

const makeField = (id, labelText, type, autocompleteType, storageKey) => {
  const label = document.createElement('label')
  label.htmlFor = id
  label.textContent = labelText
  settingsForm.appendChild(label)
  const input = document.createElement('input')
  input.id = id
  input.type = type
  input.size = 40
  input.required = true
  input.autocomplete = autocompleteType
  input.value = localStorage.getItem(storageKey) || ''
  settingsForm.appendChild(input)
  return input
}

const accessKeyIdInput     = makeField('accessKeyIdInput',     'S3 accessKeyId',     'text',     'on',               'accessKeyId')
const secretAccessKeyInput = makeField('secretAccessKeyInput', 'S3 secretAccessKey', 'password', 'current-password', 'secretAccessKey')
const endpointInput        = makeField('endpointInput',        'S3 endpoint',        'text',     'url',              'endpoint')
const regionInput          = makeField('regionInput',          'S3 region',          'text',     'on',               'region')
const bucketInput          = makeField('bucketInput',          'S3 bucket',          'text',     'on',               'bucketName')
const playerColor          = makeField('playerColor',          'Player color',       'range',    'off',              'playerColor')
playerColor.min = 0
playerColor.max = 360

var style = window.getComputedStyle(document.body)
console.log( style.getPropertyValue('--base-hue') )
const defaultHue = style.getPropertyValue('--base-hue')
playerColor.value = localStorage.getItem('playerColor') || defaultHue
playerColor.oninput = playerColor.onchange = (e) => {
  playerColor.style.accentColor = `hsl(${e.target.value}, var(--base-saturation), calc(100% - var(--base-lightness)))`
  document.documentElement.style.setProperty('--base-hue', e.target.value);
}

const submit = document.createElement('input')
submit.type = 'submit'
submit.value = locale.save
// submit.setAttribute('commandfor', 'settings')
// submit.setAttribute('command', 'close')
const reset = document.createElement('input')
reset.type = 'reset'
reset.value = locale.reset
const formButtons = document.createElement('div')
formButtons.className = 'buttons'
formButtons.appendChild(submit)
formButtons.appendChild(reset)
settingsForm.appendChild(formButtons)

const settingsError = document.createElement('div')
settingsError.className = 'error'
settingsForm.appendChild(settingsError)

// Home screen web apps on iOS have their own storage, separate from the browser,
// so settings are moved over with a settings code (clipboard or QR code)
const SETTINGS_CODE_PREFIX = 'ctrl-audio-settings:'
const settingsInputs = {
  accessKeyId: accessKeyIdInput,
  secretAccessKey: secretAccessKeyInput,
  endpoint: endpointInput,
  region: regionInput,
  bucketName: bucketInput,
  playerColor: playerColor
}

function exportSettingsCode() {
  const settings = {}
  for (const [key, input] of Object.entries(settingsInputs)) {
    settings[key] = input.value
  }
  const bytes = new TextEncoder().encode(JSON.stringify(settings))
  return SETTINGS_CODE_PREFIX + btoa(String.fromCharCode(...bytes))
}

function importSettingsCode(code) {
  code = (code || '').trim()
  if (!code.startsWith(SETTINGS_CODE_PREFIX)) {
    throw new Error(locale.invalidCode)
  }
  let settings
  try {
    const bytes = Uint8Array.from(atob(code.slice(SETTINGS_CODE_PREFIX.length)), c => c.charCodeAt(0))
    settings = JSON.parse(new TextDecoder().decode(bytes))
  } catch(e) {
    throw new Error(locale.invalidCode)
  }
  for (const [key, input] of Object.entries(settingsInputs)) {
    if (typeof settings[key] === 'string') {
      input.value = settings[key]
    }
  }
  playerColor.dispatchEvent(new Event('input'))
  settingsForm.requestSubmit()
}

const transfer = document.createElement('fieldset')
transfer.className = 'transfer'
const transferLegend = document.createElement('legend')
transferLegend.textContent = locale.transferTitle
transfer.appendChild(transferLegend)

const makeButton = (text, onclick) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text
  button.onclick = async () => {
    try {
      settingsError.textContent = ''
      await onclick(button)
    } catch(e) {
      settingsError.textContent = e.message || e.toString()
    }
  }
  transfer.appendChild(button)
  return button
}

makeButton(locale.copySettings, async () => {
  await navigator.clipboard.writeText(exportSettingsCode())
  settingsError.textContent = locale.copied
})

makeButton(locale.pasteSettings, async () => {
  let code
  try {
    code = await navigator.clipboard.readText()
  } catch(e) {
    // clipboard read not allowed, let the user paste manually
  }
  if (!code?.startsWith(SETTINGS_CODE_PREFIX)) {
    code = prompt(locale.pastePrompt)
  }
  if (code) {
    importSettingsCode(code)
  }
})

const qrContainer = document.createElement('div')
qrContainer.className = 'qr'

const hideQR = () => {
  qrContainer.innerHTML = ''
  qrButton.textContent = locale.showQR
}

const qrButton = makeButton(locale.showQR, () => {
  if (qrContainer.firstChild) {
    hideQR()
    return
  }
  stopScan()
  const qr = qrcode(0, 'M')
  qr.addData(exportSettingsCode())
  qr.make()
  qrContainer.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
  qrButton.textContent = locale.hideQR
})

const scanVideo = document.createElement('video')
scanVideo.setAttribute('playsinline', '')
scanVideo.muted = true
const scanCanvas = document.createElement('canvas')
let scanStream

const stopScan = () => {
  if (scanStream) {
    scanStream.getTracks().forEach(track => track.stop())
    scanStream = null
  }
  scanVideo.srcObject = null
  scanVideo.remove()
  scanButton.textContent = locale.scanQR
}

const scanFrame = () => {
  if (!scanStream) {
    return
  }
  if (scanVideo.readyState >= scanVideo.HAVE_ENOUGH_DATA) {
    scanCanvas.width = scanVideo.videoWidth
    scanCanvas.height = scanVideo.videoHeight
    const ctx = scanCanvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(scanVideo, 0, 0)
    const image = ctx.getImageData(0, 0, scanCanvas.width, scanCanvas.height)
    const result = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
    if (result?.data?.startsWith(SETTINGS_CODE_PREFIX)) {
      stopScan()
      try {
        importSettingsCode(result.data)
      } catch(e) {
        settingsError.textContent = e.message
      }
      return
    }
  }
  requestAnimationFrame(scanFrame)
}

const scanButton = makeButton(locale.scanQR, async () => {
  if (scanStream) {
    stopScan()
    return
  }
  hideQR()
  scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  scanVideo.srcObject = scanStream
  qrContainer.appendChild(scanVideo)
  await scanVideo.play()
  scanButton.textContent = locale.stopScan
  requestAnimationFrame(scanFrame)
})

transfer.appendChild(qrContainer)

ss.addEventListener('close', () => {
  hideQR()
  stopScan()
})

// native reset would empty the fields, so restore the saved values instead
settingsForm.onreset = (e) => {
  e.preventDefault()
  for (const [key, input] of Object.entries(settingsInputs)) {
    input.value = localStorage.getItem(key) || ''
  }
  playerColor.value = localStorage.getItem('playerColor') || defaultHue
  playerColor.dispatchEvent(new Event('input'))
  settingsError.textContent = ''
  ss.close()
}

settingsForm.onsubmit = (e) => {
  e.preventDefault()
  localStorage.setItem('accessKeyId', accessKeyIdInput.value)
  localStorage.setItem('secretAccessKey', secretAccessKeyInput.value)
  localStorage.setItem('endpoint', endpointInput.value)
  localStorage.setItem('region', regionInput.value)
  localStorage.setItem('bucketName', bucketInput.value)
  localStorage.setItem('playerColor', playerColor.value)
  try {
    initS3()
    runDownloads()
    settingsError.textContent = ''
    // ss.classList.remove('open')
    ss.close()
  } catch(e) {
    settingsError.textContent = e.toString()
  }
}
ss.appendChild(settingsForm)
ss.appendChild(transfer)
document.body.appendChild(ss)
player.appendChild(gearBtn)

try {
  initS3()
} catch(e) {
  // ss.classList.add('open')
  ss.showModal()
  settingsError.textContent = e.toString()
}

function initS3() {
  const keys = [
    'accessKeyId',
    'secretAccessKey',
    'endpoint',
    'region',
    'bucketName'
  ]
  const params = {}
  keys.forEach(key => {
    params[key] = localStorage.getItem(key)
    if (!params[key]) {
      throw new Error(`S3 ${key} is missing`)
    }
  })
  const s3opts = {
    credentials: {
      accessKeyId: params['accessKeyId'],
      secretAccessKey: params['secretAccessKey'],
    },
    endpoint: params['endpoint'],
    s3BucketEndpoint: true,
    forcePathStyle: true,
    region: params['region']
  }
  bucketName = params['bucketName']
  s3 = new S3Client(s3opts)
  searchKeys = searchKeysPromise = null
  if (browserList) {
    getFolders(browserList)
  }
}

/*
const dbName = 'music'
const dbVersion = 1

let db
const request = window.indexedDB.open(dbName, dbVersion)
request.onerror = (event) => {
  console.error(`Error: can't use IndexedDB ${Name}, ${dbVersion}!`)
}
request.onsuccess = (event) => {
  db = event.target.result
}
*/

const buttons = document.createElement('div')
buttons.id = 'buttons'
const prev = document.createElement('button')
prev.title = locale.previous
// prev.textContent = '⏮'
prev.innerHTML = returnSVG
buttons.appendChild(prev)
const play = document.createElement('button')
play.title = locale.play
// play.textContent = '⏵'
play.innerHTML = playSVG
play.disabled = true
buttons.appendChild(play)
const next = document.createElement('button')
next.title = locale.next
// next.textContent = '⏭'
next.innerHTML = forwardSVG
buttons.appendChild(next)

player.appendChild(buttons)

const audio = document.createElement('audio')
audio.className = 'current'
audio.preload = 'auto'
player.appendChild(audio)

const audioTime = document.createElement('div')
audioTime.className = 'audio-time'
const cursor = document.createElement('input')
cursor.id = 'cursor'
// cursor.type = 'time'
// cursor.step = '1'
// cursor.value = '00:00:00'
cursor.size = 5
cursor.pattern = '[0-9]{1,2}:[0-9]{2}'
cursor.value = '0:00'
cursor.disabled = true
cursor.addEventListener('blur', (e) => {
  const parts = e.target.value.split(':')
  const secs = parseInt(parts[0]) * 60 + parseInt(parts[1])
  audio.currentTime = secs
})
audioTime.appendChild(cursor)
audioTime.appendChild(document.createTextNode(' / '))
const trackLength = document.createElement('input')
trackLength.id = 'trackLength'
// trackLength.type = 'time'
// trackLength.step = '1'
trackLength.size = 5
trackLength.value = '0:00'
trackLength.disabled = true
audioTime.appendChild(trackLength)
player.appendChild(audioTime)

const titleHolder = document.createElement('div')
titleHolder.className = 'track'
const trackTitle = document.createElement('input')
trackTitle.id = 'trackTitle'
trackTitle.size = 70
trackTitle.className = 'track-title'
trackTitle.disabled = true
titleHolder.appendChild(trackTitle)
player.appendChild(titleHolder)

const progress = document.createElement('input')
progress.type = 'range'
progress.id = 'progress'
progress.addEventListener('input', (e) => {
  // Safari gets confused from scrubbing
  // too many concurrent seek requests set currentTime to 0
  // avoid many seeks by setting currentTime on a timeOut
  seekTarget = parseInt(e.target.value)
  if (seekTimeout) {
    // cancel previous seek request
    clearTimeout(seekTimeout)
  }
  seekTimeout = setTimeout(function() {
    audio.currentTime = seekTarget
  }, SEEK_TARGET_TIMEOUT)
})
player.appendChild(progress)

const updateDuration = function() {
  const seconds = parseInt(audio.duration)
  progress.max = seconds
  trackLength.value = parseInt(seconds/60) + ':' + parseInt(seconds%60).toString().padStart(2, '0')
  cursor.max = '0:' + trackLength.value
}
const requestWakeLock = async () => {
  if (wakelockCooldown) {
    wakelockCooldown = clearTimeout(wakelockCooldown) // returns undefined
  }
  try {
    wakeLock = await navigator.wakeLock.request("screen")
  } catch (err) {
    console.error(`${err.name}: ${err.message}`)
  }
}
audio.onloadedmetadata = updateDuration
audio.oncanplay = (e) => {
  play.disabled = false
}
audio.onplay = () => {
  // play.textContent = '⏸'
  play.innerHTML = pauseSVG
  cursor.disabled = true
  navigator.mediaSession.playbackState = 'playing'
  play.classList.remove('stalled')
  requestWakeLock()
}
audio.onpause = () => {
  // 'pause' also fires when a track ends; the next track starts right away,
  // so don't tell iOS that the session is paused
  if (audio.ended) return
  // play.textContent = '⏵'
  cursor.disabled = false
  play.innerHTML = playSVG
  navigator.mediaSession.playbackState = 'paused'
  wakelockCooldown = setTimeout(() => wakeLock?.release(), WAKELOCK_CLEAR_TIMEOUT)
}
audio.onwaiting = (e) => {
  cursor.disabled = false
  play.innerHTML = playSVG
  navigator.mediaSession.playbackState = 'paused'
}
audio.onplaying = (e) => {
  play.innerHTML = pauseSVG
  play.classList.remove('stalled')
  navigator.mediaSession.playbackState = 'playing'
  cursor.disabled = true
}
audio.onstalled = (e) => {
  // play.innerHTML = '<span class="fa-solid fa-play"></span>'
  play.classList.add('stalled')
  cursor.disabled = false
}
audio.onseeking = audio.onseeked = (e) => {
  // console.log(e.timeStamp, e.target.currentTime, e.target.seekable, e)
  // for (let i=0; i<e.target.seekable.length; i++) {
  //   console.log(e.target.seekable.start(i), e.target.seekable.end(i))
  // }
}
audio.onended = next.onclick = (e) => {
  playNext()
}

const saveOfflineButton = document.createElement('button')
saveOfflineButton.type = 'button'
saveOfflineButton.className = 'save-offline'
saveOfflineButton.innerHTML = offlineSVG + ' ' + locale.saveOffline
saveOfflineButton.hidden = true
player.appendChild(saveOfflineButton)

const collection = document.createElement('ol')
collection.className = 'collection'
player.appendChild(collection)

playerList = document.createElement('nav')
player.appendChild(playerList)
new MutationObserver(() => {
  saveOfflineButton.hidden = !playerList.querySelector('audio-track')
}).observe(playerList, {childList: true})

const saveOfflineDialog = document.createElement('dialog')
saveOfflineDialog.id = 'save-offline'
saveOfflineDialog.setAttribute('closedby', 'any')
const saveOfflineForm = document.createElement('form')
saveOfflineForm.method = 'dialog'
const offlineNameLabel = document.createElement('label')
offlineNameLabel.htmlFor = 'offlineNameInput'
offlineNameLabel.textContent = locale.offlineName
const offlineNameInput = document.createElement('input')
offlineNameInput.id = 'offlineNameInput'
offlineNameInput.type = 'text'
offlineNameInput.size = 40
offlineNameInput.required = true
const saveOfflineSubmit = document.createElement('input')
saveOfflineSubmit.type = 'submit'
saveOfflineSubmit.value = locale.saveOffline
const saveOfflineCancel = document.createElement('input')
saveOfflineCancel.type = 'reset'
saveOfflineCancel.value = locale.reset
const saveOfflineButtons = document.createElement('div')
saveOfflineButtons.className = 'buttons'
saveOfflineButtons.appendChild(saveOfflineSubmit)
saveOfflineButtons.appendChild(saveOfflineCancel)
saveOfflineForm.appendChild(offlineNameLabel)
saveOfflineForm.appendChild(offlineNameInput)
saveOfflineForm.appendChild(saveOfflineButtons)
saveOfflineDialog.appendChild(saveOfflineForm)
document.body.appendChild(saveOfflineDialog)

saveOfflineButton.onclick = () => {
  offlineNameInput.value = [...collection.querySelectorAll('li')]
    .map(li => li.textContent.trim())
    .filter(Boolean)
    .join(', ')
  saveOfflineDialog.showModal()
}
saveOfflineForm.onreset = (e) => {
  e.preventDefault()
  saveOfflineDialog.close()
}
saveOfflineForm.onsubmit = async (e) => {
  e.preventDefault()
  saveOfflineDialog.close()
  await saveOfflinePlaylist(offlineNameInput.value.trim())
}

const updateTime = () => {
    const seconds = parseInt(audio.currentTime)
/*
    cursor.value = [
      '00',
      parseInt(seconds/60).toString().padStart(2, '0'),
      parseInt(seconds%60).toString().padStart(2, '0')
    ].join(':')
*/
    cursor.value = parseInt(seconds/60) + ':' + 
      parseInt(seconds%60).toString().padStart(2, '0')
    progress.value = seconds
    if ('setPositionState' in navigator.mediaSession) {
      if (audio.duration && audio.currentTime) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: audio.currentTime,
          playbackRate: audio.playbackRate,
        })
      }
    }
}
audio.addEventListener("timeupdate", updateTime)

prev.onclick = (e) => {
  playPrevious()
}

play.onclick = async (e) => {
  if (!audio.getAttribute('src')) {
    return playNext()
  }
  if (audio.paused) {
    await audio.play().catch(err => console.warn('Playback failed:', err))
  }
  else {
    audio.pause()
  }
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() == 'button') return
    if (e.target.type == 'range') return
    if (e.target.type == 'search') return
    let current = document.querySelector('audio-track:focus-within')
    let newCurrent = false
    switch(e.key) {
      case " ": e.preventDefault(); play.click(); break
      // case "Enter": play.disabled = true; audio.src = current.dataset.src; break
      case "Enter": current.querySelector('.name a')?.click(); break
      case "ArrowRight": playNext(); break
      case "ArrowLeft": playPrevious(); break
      case "ArrowDown":
        e.preventDefault() 
        if (current) {
          if (current.nextElementSibling) {
            newCurrent = current.nextElementSibling
          }
          else {
            newCurrent = current.parentNode.firstElementChild
          }
        }
        break
      case "ArrowUp":
        e.preventDefault() 
        if (current) {
          if (current.previousElementSibling) {
            newCurrent = current.previousElementSibling
          }
          else {
            newCurrent = current.parentNode.lastElementChild
          }
        }
        break
    }
    if (newCurrent) {
        newCurrent.focus()
    }
})

async function getFolders(parentElement=null, autoAdd=false, token=null) {
  const input = {Bucket: bucketName}
  if (token) {
    input.ContinuationToken = token
  }
  if (parentElement.dataset.folder) {
    input['Prefix'] = decodeURIComponent(parentElement.dataset.folder) + '/'
  }
  else {
    input['Delimiter'] = folderDelimiter
  }
  try {
    let olRef = parentElement.querySelector('ol:not(.playlists)')
    if (!olRef) {
      const ol = document.createElement('ol')
      parentElement.appendChild(ol)
      olRef = ol
    }
    const command = new ListObjectsV2Command(input)
    const response = await s3.send(command)
    if (response.CommonPrefixes) {
      for (const obj of response.CommonPrefixes) {
        const folderName = obj.Prefix.replace(/\/$/, '')
        const li = createFolderElement(folderName, olRef)
        let first = folderName.slice(0, 1)
        if (first.match(/\d+/)) {
          first = '1'
        }
        if (first && first != previousFirst) {
          li.id = first
          const skipLi = document.createElement('li')
          const a = document.createElement('a')
          a.href = `#${first}`
          a.innerHTML = first
          a.title = `#${locale.jumpTo} ${first}`
          skipLi.appendChild(a)
          skipMenu.appendChild(skipLi)
          previousFirst = first
        }
        // folders[folderName] = folderName
      }
    }
    if (response.Contents) {
      let subRef = olRef
      for (const obj of response.Contents) {
        let trimmed = obj.Key
        if (input.Prefix) {
          trimmed = trimmed.replace(input.Prefix + '/', '')
        }
        const match = trimmed.match(/^(.*)\/[^\/]*$/)
        if (match) {
          const li = createFolderElement(match[1], olRef)
          li.classList.toggle('open', true)
          let ol = li.querySelector('ol')
          if (!ol) {
            ol = document.createElement('ol')
            li.appendChild(ol)
          }
          // ol.classList.toggle('hidden', false)
          subRef = ol
        }
        if (obj.Key.endsWith('.mp3')) {
          obj.Metadata = await getS3Meta(obj.Key)
          const getParams = {Bucket: bucketName, Key: obj.Key}
          const command = new GetObjectCommand(getParams)
          obj.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
          createSongElement(obj, subRef).then(li => {
            if (autoAdd) {
              li.querySelector('a')?.click()
            }
          })
        }
        else if (obj.Key.endsWith('.json')) {
          const getParams = {Bucket: bucketName, Key: obj.Key}
          const command = new GetObjectCommand(getParams)
          const li = createPlaylistElement(obj, playlistList)
        }
        else if (obj.Key.endsWith('.m3u')) {
          // playlists.push(obj.Key)
        }
      }
    }
    if (response.IsTruncated) {
      getFolders(parentElement, autoAdd, response.NextContinuationToken)
    }
  }
  catch(e) {
    console.error(e)
  }
}

function scrollToFirstTrack(e) {
  const source = this.dataset.source
  const track = this.closest('audio-player').querySelector(`audio-track[data-source="${source}"]`)
  if (track) {
    track.scrollIntoView({block: "nearest", inline: "nearest", behavior: 'smooth'})
    track.focus()
  }
}

function removeTracks(e) {
  e.stopPropagation()
  const cli = this.closest('li')
  const source = cli.dataset.source
  const tracks = cli.closest('audio-player').querySelectorAll(`audio-track[data-source="${source}"]`)
  for (const track of tracks) {
    if (track.classList.contains('playing')) {
      if (!audio.paused) {
        play.click()
      }
      trackLength.value = progress.value = 0
      // cursor.value = '00:00:00'
      cursor.value = '0:00'
      trackTitle.value = ''
      audio.src = ''
    }
    track.parentNode.removeChild(track)
  }
  const li = this.closest('li')
  li?.parentNode?.removeChild(li)
}

function createFolderElement(folder, ol) {
  const candidate = ol.querySelector(`[data-folder="${folder}"]`)
  if (candidate) return candidate
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'folder'
  li.dataset.folder = folder
  li.textContent = folder.replace(`${parent}/`, '')
  const a = document.createElement('a')
  // a.href = '#' + (parent ? encodeURIComponent(parent) + '/' : '') + encodeURIComponent(folder)
  a.href = '#' + encodeURIComponent(folder)
  a.className = 'action'
  a.title = locale.playFolder
  // a.textContent = '⥅' // '⤅' '⧐' '⏵'
  // a.innerHTML = '<i class="fa-solid fa-album-circle-plus"></i>'
  a.innerHTML = addSVG
  a.onclick = async function(e) {
    e.preventDefault()
    e.stopPropagation()
    li.classList.add('open')
    history.pushState(folder, '', a.href)
    document.title = folder
    const cli = document.createElement('li')
    cli.onclick = scrollToFirstTrack
    cli.className = 'folder'
    cli.textContent = folder + ' '
    cli.dataset.source = folder
    sourceLink = cli.dataset.source
    const ca = document.createElement('a')
    ca.innerHTML = removeSVG
    ca.onclick = removeTracks
    cli.appendChild(ca)
    if (!li.querySelector('ol')) {
      await getFolders(li, true)
    }
    else {
      const tracks = e?.target?.closest('.folder')?.querySelectorAll('.song a')
      tracks.forEach((link) => {
        link.click()
      })
    }
    collection.appendChild(cli)
    // collection.innerHTML = (parent ? `${parent}: ` : '') + folder
    // collection.innerHTML = folder
  }
  li.appendChild(document.createTextNode(' '))
  li.appendChild(a)
  li.onclick = function(e) {
    e.preventDefault()
    e.stopPropagation()
    const isOpen = this.classList.toggle('open')
    // history.pushState(folder, '', a.href)
    document.title = folder
    const subLists = this.querySelectorAll('li ol')
    if (subLists.length > 0) {
      for (const subList of subLists) {
        subList.classList.toggle('hidden', !isOpen)
      }
    }
    else {
      getFolders(li)
    }
  }
  li.appendChild(a)
  const pathIndex = myPath.indexOf(folder.trim())
  if (pathIndex >= 0) {
    myPath = myPath.toSpliced(pathIndex, 1)
    a.click()
  }
  ol.appendChild(li)
  return li
}

async function createSongElement(obj, ol) {
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'song'
  li.textContent = obj.Key.replace(`${parent}/`, '') + ' '
  const a = document.createElement('a')
  a.className = 'action'
  a.href = obj.href
  a.title = locale.playSong
  // a.textContent = '⧐' // '⥅' '⏵'
  a.innerHTML = addSVG
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e?.pointerId > 0) {
      history.pushState(a.href, '', `#${obj.Key}`)
      document.title = a.textContent
      // collection.innerHTML = obj.Key
      const cli = document.createElement('li')
      cli.onclick = scrollToFirstTrack
      cli.className = 'song'
      cli.textContent = obj.Key + ' '
      cli.dataset.source = obj.Key
      sourceLink = cli.dataset.source
      const ca = document.createElement('a')
      ca.innerHTML = removeSVG
      ca.onclick = removeTracks
      cli.appendChild(ca)
      collection.appendChild(cli)
    }
    createAudioTrack(obj)
  }
  li.appendChild(a)
  ol.appendChild(li)
  const pathIndex = myPath.indexOf(li.textContent.trim())
  if (pathIndex >= 0) {
    a.click()
    myPath = myPath.slice(pathIndex)
  }
  return li
}

async function createPlaylistElement(obj, ol) {
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'playlist'
  li.textContent = obj.Key.replace(`${parent}/`, '') + ' '
  const a = document.createElement('a')
  a.className = 'action'
  a.href = obj.Key
  a.title = locale.playPlaylist
  // a.textContent = '⧐' // '⥅' '⏵'
  a.innerHTML = addSVG
  a.onclick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    // if (e?.pointerId > 0) {
      history.pushState(a.href, '', `#${obj.Key}`)
      document.title = a.textContent
      // collection.innerHTML = obj.Key
      const cli = document.createElement('li')
      cli.onclick = scrollToFirstTrack
      cli.className = 'playlist'
      cli.textContent = obj.Key + ' '
      cli.dataset.source = obj.Key
      sourceLink = cli.dataset.source
      const ca = document.createElement('a')
      ca.innerHTML = removeSVG
      ca.onclick = removeTracks
      cli.appendChild(ca)
      collection.appendChild(cli)
    // }
    const getParams = {Bucket: bucketName, Key: obj.Key}
    const command = new GetObjectCommand(getParams)
    const res = await s3.send(command)
    const json = await res.Body.transformToString()
    try {
      const playlist = JSON.parse(json)
      const base = obj.Key.replace(/\/[^\/]+$/, '')
      playlist?.track.forEach(async (track) => {
        const song = {
          Bucket: bucketName,
          Key: track.url,
          Metadata: track,
        }
        const getParams = {Bucket: bucketName, Key: song.Key}
        const command = new GetObjectCommand(getParams)
        song.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
        createAudioTrack(song)
      })
    }
    catch(e) {
      console.error(e)
    }
  }
  li.appendChild(a)
  ol.appendChild(li)
  return li
}

function getS3Meta(key) {
  return new Promise(
    function(resolve, reject) {
      let meta
      const tx = db.transaction("meta", "readonly")
      const cache = tx.objectStore("meta")
      const index = cache.index("key")
      const dbRequest = index.get(key)
      dbRequest.onerror = function(event) {
        reject(new Error(event))
      }
      dbRequest.onsuccess = async function() {
        const matching = dbRequest.result
        if (matching !== undefined) {
          meta = matching
          resolve(meta)
        } else {
          try {
            const get = new HeadObjectCommand({Bucket: bucketName, Key: key})
            const metaQuery = await s3.send(get)
            meta = metaQuery.Metadata
            meta.key = key
            const putx = db.transaction("meta", "readwrite")
            putx.objectStore("meta").put(meta)
            resolve(meta)
          }
          catch(e) {
            console.warn(`Error retrieving metadata for '${key}' from S3 bucket '${bucketName}'`)
            console.log(e)
            reject(new Error(e))
          }
        }
      }
    }
  )
}

function getAllMeta() {
  return new Promise(
    function(resolve, reject) {
      if (!db) {
        return resolve([])
      }
      const request = db.transaction("meta", "readonly").objectStore("meta").getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    }
  )
}

// list every track key in the bucket once, so search also covers unopened folders
function getSearchKeys() {
  if (!searchKeysPromise && s3) {
    searchKeysPromise = (async () => {
      const keys = []
      let token
      do {
        const input = {Bucket: bucketName}
        if (token) {
          input.ContinuationToken = token
        }
        const response = await s3.send(new ListObjectsV2Command(input))
        for (const obj of response.Contents || []) {
          if (obj.Key.endsWith('.mp3')) {
            keys.push(obj.Key)
          }
        }
        token = response.IsTruncated ? response.NextContinuationToken : null
      } while (token)
      searchKeys = keys
      return keys
    })()
    searchKeysPromise.catch(e => {
      console.error(e)
      searchKeysPromise = null
    })
  }
  return searchKeysPromise
}

const safeDecode = (value) => {
  try {
    return decodeURIComponent(value)
  } catch(e) {
    return value
  }
}

// case and accent insensitive
const normalizeSearch = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

async function runSearch() {
  const run = ++searchRun
  const query = searchInput.value.trim()
  if (query.length < MIN_SEARCH_LENGTH) {
    searchResults.innerHTML = ''
    return
  }
  if (!searchKeys) {
    getSearchKeys()?.then(() => {
      if (run == searchRun) runSearch()
    }, () => {})
  }
  const terms = normalizeSearch(query).split(/\s+/)
  const matches = (text) => {
    const normalized = normalizeSearch(text)
    return terms.every(term => normalized.includes(term))
  }

  const records = {}
  for (const record of await getAllMeta()) {
    records[record.key] = record
  }
  if (run != searchRun) {
    return
  }
  // until the bucket listing arrives, fall back to the tracks seen before
  const keys = searchKeys || Object.keys(records).filter(key => key.endsWith('.mp3'))

  const folders = new Set()
  const tracks = []
  for (const key of keys) {
    const parts = key.split(folderDelimiter)
    for (let i = 1; i < parts.length; i++) {
      folders.add(parts.slice(0, i).join(folderDelimiter))
    }
    const record = records[key]
    const text = record ? [key, ...Object.values(record).map(safeDecode)].join(' ') : key
    if (tracks.length < MAX_SEARCH_RESULTS && matches(text)) {
      tracks.push({key, record})
    }
  }
  const folderMatches = [...folders].filter(matches).slice(0, MAX_FOLDER_RESULTS)
  const playlistMatches = [...playlistList.querySelectorAll('li.playlist')].filter(li => matches(li.textContent))

  searchResults.innerHTML = ''
  for (const folder of folderMatches) {
    addSearchResult('result-folder', folder, '', async () => {
      const folderKeys = (await getSearchKeys()).filter(key => key.startsWith(folder + folderDelimiter))
      queueKeys(folderKeys, folder, 'folder')
    })
  }
  for (const li of playlistMatches) {
    addSearchResult('result-playlist', li.textContent.trim(), '', () => li.querySelector('a')?.click())
  }
  for (const {key, record} of tracks) {
    const path = key.split(folderDelimiter)
    const fileName = path.pop().replace(/\.mp3$/, '')
    const title = safeDecode(record?.title || record?.name || '') || fileName
    const artist = safeDecode(record?.artist || '')
    const album = safeDecode(record?.album || '')
    const details = [artist, album].filter(Boolean).join(' – ') || path.join(folderDelimiter)
    addSearchResult('result-track', title, details, () => queueKeys([key], key, 'song'))
  }
  if (!searchResults.firstChild) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = locale.noResults
    searchResults.appendChild(li)
  }
}

function addSearchResult(className, name, details, onAdd) {
  const li = document.createElement('li')
  li.className = className
  const nameSpan = document.createElement('span')
  nameSpan.className = 'name'
  nameSpan.textContent = name
  li.appendChild(nameSpan)
  if (details) {
    const small = document.createElement('small')
    small.textContent = ' ' + details
    li.appendChild(small)
  }
  const a = document.createElement('a')
  a.className = 'action'
  a.href = '#'
  a.title = className == 'result-track' ? locale.playSong : locale.playFolder
  a.innerHTML = addSVG
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    onAdd()
  }
  li.appendChild(document.createTextNode(' '))
  li.appendChild(a)
  searchResults.appendChild(li)
}

async function queueKeys(keys, source, className) {
  const cli = document.createElement('li')
  cli.onclick = scrollToFirstTrack
  cli.className = className
  cli.textContent = source + ' '
  cli.dataset.source = source
  const ca = document.createElement('a')
  ca.innerHTML = removeSVG
  ca.onclick = removeTracks
  cli.appendChild(ca)
  collection.appendChild(cli)
  // one at a time, to keep the queue in the listed order
  for (const key of keys) {
    const obj = {Key: key}
    try {
      obj.Metadata = await getS3Meta(key)
    } catch(e) {
      obj.Metadata = {}
    }
    const command = new GetObjectCommand({Bucket: bucketName, Key: key})
    obj.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
    sourceLink = source
    await createAudioTrack(obj)
  }
}

// offline, only the tracks saved to offline storage can be played
const isPlayable = (track) => {
  return track.classList.contains('offline-saved') || (navigator.onLine && Boolean(track.dataset.src))
}

const playNext = () => {
  const playing = playerList.querySelector('.playing')
  const tracks = [...playerList.querySelectorAll('audio-track')]
  const start = tracks.indexOf(playing) + 1
  // wrap around to the beginning of the list
  for (let i = 0; i < tracks.length; i++) {
    const candidate = tracks[(start + i) % tracks.length]
    if (isPlayable(candidate)) {
      return playTrack(candidate)
    }
  }
}

const playPrevious = () => {
  let candidate = playerList.querySelector('.playing')?.previousElementSibling
  while (candidate && !isPlayable(candidate)) {
    candidate = candidate.previousElementSibling
  }
  playTrack(candidate)
}

const playTrack = async (track) => {
  if (track) {
    document.title = track.querySelector('.name').textContent
    let sessionOpts
    if ('mediaSession' in navigator) {
      sessionOpts = {
        title: document.title,
        artist: track.querySelector('.artist')?.textContent || 'Unknown Artist',
        album: track.querySelector('.album')?.textContent || 'Unknown Album',
      }
    }
    trackTitle.value = document.title
    playerList.querySelector('.playing')?.classList.remove('playing')
    track.classList.add('playing')
    track.scrollIntoView({block: "nearest", inline: "nearest"})
    audio.src = track.dataset['src']
    // call play() synchronously instead of waiting for 'canplay': on iOS a
    // backgrounded PWA is suspended as soon as audio stops, so an async gap
    // between tracks would stop playback at the end of the first track
    audio.play().catch(err => console.warn('Playback failed:', err))
    if (track.dataset.albumArt) {
      const image = new Image()
      let url = track.dataset.albumArt
      image.src = url
      image.crossOrigin = "Anonymous"
      image.onload = async function() {
        if ('mediaSession' in navigator) {
          const response = await fetch(url)
          const blob = await response.blob()
          if (blob) {
            sessionOpts.artwork = [ {
              src: url,
              sizes: `${image.naturalWidth}x${image.naturalHeight}`,
              type: blob.type
            } ]
          }
        }
        const ctx = document.createElement("canvas").getContext("2d")
        ctx.drawImage(image, 0, 0, 1, 1)
        const rgba = ctx.getImageData(0, 0, 1, 1).data
        const hue = getHue(rgba[0], rgba[1], rgba[2])
        document.documentElement.style.setProperty('--base-hue', hue)
      }  
    }
    if (sessionOpts) {
      navigator.mediaSession.metadata = new MediaMetadata(sessionOpts)
    }
  }
 }

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', (e) => { audio.play().catch(err => console.warn('Playback failed:', err)) })
  navigator.mediaSession.setActionHandler('pause', (e) => { audio.pause() })
  navigator.mediaSession.setActionHandler('previoustrack', playPrevious)
  navigator.mediaSession.setActionHandler('nexttrack', playNext)
  navigator.mediaSession.setActionHandler('stop', (e) => { audio.pause() })
  navigator.mediaSession.setActionHandler('seekto', (details) => {
    audio.currentTime = details.seekTime
  })
  navigator.mediaSession.setActionHandler('seekbackward', (details) => {
    audio.currentTime = Math.max(audio.currentTime - details.seekOffset, 0)
  })
  navigator.mediaSession.setActionHandler('seekforward', (details) => {
    audio.currentTime = Math.min(audio.currentTime + details.seekOffset, audio.duration)
  })
}

function getHue(r, g, b) {
  r /= 255, g /= 255, b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  if(max != min){
    const d = max - min;
    switch(max){
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6
  }
  return Math.round(h*360)
}

async function preloadAudio() {
  const cacheKeys = Object.keys(preloadCache)
  // saving offline playlists goes first
  if (preloading || downloadRunning || !navigator.onLine || cacheKeys.length < 1) {
    return false
  }
  const href = cacheKeys[0]
  delete(preloadCache[href])
  preloading = href
  const dummyAudio = document.createElement('audio')
  dummyAudio.src = href
  dummyAudio.load()
  dummyAudio.oncanplay = (e) => {
    dummyAudio.src = ''
    preloading = false
    preloadAudio()
  }
}

async function queuePreload(href) {
  if (!href) return
  preloadCache[href] = true
  preloadAudio()
}

async function createAudioTrack(obj, source) {

  await offlineReady

  // pre-fetch content to cache
  if (!offlineKeys.has(obj.Key)) {
    queuePreload(obj.href)
  }

  let myArtist = ''
  let myAlbum = ''
  let myTitle = ''
  let myTrackNumber = ''
  let myDuration = '0:00'
  let myYear = ''
  let myPlaylist = ''
  let myGenre = ''
  let myKeywords = ''
  let myImage = ''
 
  const matches = obj.Key.match(/([^\/]*)\/?([^\/]*)\/([^\/]*)\.mp3/)
  if (matches && matches.length == 4) {
    myArtist = matches[1]
    myAlbum = matches[2]
    myTitle = matches[3]
  }
  else if (matches && matches.length > 0) {
    myArtist = matches[1]
    myTitle = matches[2]
  }

  if (obj.Metadata['artist']) myArtist = decodeURIComponent(obj.Metadata['artist'])
  if (obj.Metadata['album']) myAlbum = decodeURIComponent(obj.Metadata['album'])
  if (obj.Metadata['name']) myTitle = decodeURIComponent(obj.Metadata['name'])
  if (obj.Metadata['title']) myTitle = decodeURIComponent(obj.Metadata['title'])
  if (obj.Metadata['tracknumber']) myTrackNumber = decodeURIComponent(obj.Metadata['tracknumber'])
  if (obj.Metadata['length']) myDuration = decodeURIComponent(obj.Metadata['length'])
  if (obj.Metadata['datePublished']) myYear = decodeURIComponent(obj.Metadata['datePublished'])
  if (obj.Metadata['recordingtime']) myYear = decodeURIComponent(obj.Metadata['recordingtime'])
  if (obj.Metadata['year']) myYear = decodeURIComponent(obj.Metadata['year'])
  if (obj.Metadata['playlist']) myPlaylist = decodeURIComponent(obj.Metadata['playlist'])
  if (obj.Metadata['genre']) myGenre = decodeURIComponent(obj.Metadata['genre'])
  if (obj.Metadata['keywords']) myKeywords = decodeURIComponent(obj.Metadata['keywords'])
  if (obj.Metadata['image']) myImage = decodeURIComponent(obj.Metadata['image'])

  const track = document.createElement('audio-track')
  track.tabIndex = 0
  track.itemprop = 'track'
  track.itemscope = ''
  track.itemtype = 'https://schema.org/MusicRecording'
  track.dataset.src = obj.href
  track.dataset.href = obj.href
  track.dataset.key = obj.Key
  track.dataset.source = sourceLink
  trackMeta.set(track, obj.Metadata)
  if (offlineKeys.has(obj.Key)) {
    track.classList.add('offline-saved')
    track.dataset.src = await getOfflineUrl(obj.Key)
  }
  else if (obj.Key == downloadKey) {
    track.classList.add('offline-downloading')
  }
  else if (failedKeys.has(obj.Key)) {
    track.classList.add('offline-failed')
  }

  // album art is not stored offline
  if (myImage && navigator.onLine && s3) {
    const img = {
      Bucket: bucketName,
      Key: myImage
    }
    const getParams = {Bucket: bucketName, Key: img.Key}
    const command = new GetObjectCommand(getParams)
    const url = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
    track.style.backgroundImage = `url(${url})`
    track.dataset.albumArt = url
  }

  const artist = document.createElement('section')
  artist.className = 'artist'
  const byArtist = document.createElement('a')
  byArtist.itemprop = 'byArtist'
  byArtist.textContent = myArtist
  artist.appendChild(byArtist)
  track.appendChild(artist)

  const trackName = document.createElement('section')
  trackName.className = 'name track'
  const trackLink = document.createElement('a')
  trackLink.href = obj.href
  trackLink.onclick = (e) => {
    e.preventDefault()
    playTrack(track)
  }
  const nameSpan = document.createElement('span')
  nameSpan.itemprop = 'name'
  trackLink.appendChild(nameSpan)
  trackLink.textContent = myTitle
  const offlineIcon = document.createElement('span')
  offlineIcon.className = 'offline-icon'
  offlineIcon.innerHTML = offlineSVG
  trackName.appendChild(offlineIcon)
  trackName.appendChild(trackLink)
  track.appendChild(trackName)

  const duration = document.createElement('section')
  duration.className = 'duration'
  const durationMeta = document.createElement('meta')
  durationMeta.itemprop = 'duration'
  duration.appendChild(durationMeta)
  const durationSpan = document.createElement('span')
  durationSpan.className = 'duration'
  duration.appendChild(durationSpan)
  if (myDuration) {
    myDuration = parseInt(myDuration)/1000 // ms to s
    const min = Math.floor(myDuration / 60)
    const sec = Math.round(myDuration % 60)
    durationMeta.content = `PT${min}M${sec}S`
    durationSpan.textContent = [min, sec.toString().padStart(2, '0')].join(':')
  }
  track.appendChild(duration)

  const trackNumber = document.createElement('section')
  trackNumber.className = 'trackNumber'
  const trackNumberSpan = document.createElement('span')
  trackNumberSpan.itemprop = 'position'
  trackNumberSpan.textContent = myTrackNumber
  trackNumber.appendChild(trackNumberSpan)
  track.appendChild(trackNumber)

  const album = document.createElement('section')
  album.className = 'album'
  const albumLink = document.createElement('a')
  albumLink.itemprop = 'inAlbum'
  albumLink.textContent = myAlbum
  album.appendChild(albumLink)
  track.appendChild(album)

  const published = document.createElement('section')
  published.className = 'published'
  const publishedSpan = document.createElement('span')
  publishedSpan.itemprop = 'datePublished'
  publishedSpan.textContent = myYear
  published.appendChild(publishedSpan)
  track.appendChild(published)

  const playlist = document.createElement('section')
  playlist.className = 'playlist'
  const playlistLink = document.createElement('a')
  playlistLink.itemprop = 'inPlaylist'
  playlistLink.textContent = myPlaylist
  playlist.appendChild(playlistLink)
  track.appendChild(playlist)

  const genre = document.createElement('section')
  genre.className = 'genre'
  const genreSpan = document.createElement('span')
  genreSpan.itemprop = 'genre'
  genreSpan.textContent = myGenre
  genre.appendChild(genreSpan)
  track.appendChild(genre)

  const keywords = document.createElement('section')
  keywords.className = 'keywords'
  const keywordsSpan = document.createElement('span')
  keywordsSpan.itemprop = 'keywords'
  keywordsSpan.textContent = myKeywords
  keywords.appendChild(keywordsSpan)
  track.appendChild(keywords)

  playerList.appendChild(track)

  const playing = playerList.querySelector('.playing')
  if (!playing && isPlayable(track)) {
    trackLink.click()
  }

}

// Offline playlists
//
// A saved playlist is a fixed list of S3 keys. The downloader saves the tracks
// one at a time, in the order the playlists were saved, until every saved
// playlist is complete. Downloading goes before preloading.

const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const playlistKeys = (playlists) => new Set(playlists.flatMap(p => p.track.map(t => t.url)))

const getOfflinePlaylists = () => {
  return requestResult(db.transaction(OFFLINE_PLAYLISTS).objectStore(OFFLINE_PLAYLISTS).getAll())
}

const offlineReady = dbReady.then(async () => {
  const keys = await requestResult(db.transaction(OFFLINE_AUDIO).objectStore(OFFLINE_AUDIO).getAllKeys())
  keys.forEach(key => offlineKeys.add(key))
}).catch(e => console.error(e))

async function getOfflineUrl(key) {
  if (!offlineUrls.has(key)) {
    const stored = await requestResult(db.transaction(OFFLINE_AUDIO).objectStore(OFFLINE_AUDIO).get(key))
    offlineUrls.set(key, URL.createObjectURL(stored.blob))
  }
  return offlineUrls.get(key)
}

function tracksWithKey(key) {
  return playerList.querySelectorAll(`audio-track[data-key="${CSS.escape(key)}"]`)
}

function setOfflineState(key, state) {
  for (const track of tracksWithKey(key)) {
    track.classList.toggle('offline-saved', state == 'saved')
    track.classList.toggle('offline-downloading', state == 'downloading')
    track.classList.toggle('offline-failed', state == 'failed')
    const icon = track.querySelector('.offline-icon')
    if (icon) {
      icon.title = {
        saved: locale.offlineSaved,
        downloading: locale.offlineDownloading,
        failed: locale.offlineFailed
      }[state] || ''
    }
  }
}

async function saveOfflinePlaylist(title) {
  const track = [...playerList.querySelectorAll('audio-track')].map(t => {
    return {...trackMeta.get(t), url: t.dataset.key}
  })
  if (!title || track.length < 1) return
  await requestResult(db.transaction(OFFLINE_PLAYLISTS, 'readwrite')
    .objectStore(OFFLINE_PLAYLISTS).add({title, track, created: Date.now()}))
  // ask the browser not to evict offline storage under storage pressure
  navigator.storage?.persist?.()
  await renderOfflinePlaylists()
  runDownloads()
}

function removeOfflinePlaylist(id) {
  // one transaction, so that a download finishing at the same time
  // can't store a track that is no longer needed
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OFFLINE_PLAYLISTS, OFFLINE_AUDIO], 'readwrite')
    const playlistStore = tx.objectStore(OFFLINE_PLAYLISTS)
    const audioStore = tx.objectStore(OFFLINE_AUDIO)
    const removed = []
    let keep
    playlistStore.delete(id)
    playlistStore.getAll().onsuccess = (e) => {
      keep = playlistKeys(e.target.result)
      audioStore.getAllKeys().onsuccess = (e) => {
        for (const key of e.target.result) {
          if (!keep.has(key)) {
            audioStore.delete(key)
            removed.push(key)
          }
        }
      }
    }
    tx.oncomplete = () => resolve({removed, keep})
    tx.onerror = tx.onabort = () => reject(tx.error)
  }).then(({removed, keep}) => {
    for (const key of removed) {
      offlineKeys.delete(key)
      const url = offlineUrls.get(key)
      offlineUrls.delete(key)
      for (const track of tracksWithKey(key)) {
        track.dataset.src = track.dataset.href
      }
      setOfflineState(key, null)
      // the current track keeps playing from its blob
      if (url && audio.src != url) {
        URL.revokeObjectURL(url)
      }
    }
    if (downloadKey && !keep.has(downloadKey)) {
      downloadController?.abort()
    }
    offlineMessage.textContent = ''
    renderOfflinePlaylists()
    runDownloads()
  })
}

function storeDownload(key, blob) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OFFLINE_PLAYLISTS, OFFLINE_AUDIO], 'readwrite')
    let stored = false
    // the playlist may have been removed during the download
    tx.objectStore(OFFLINE_PLAYLISTS).getAll().onsuccess = (e) => {
      if (playlistKeys(e.target.result).has(key)) {
        tx.objectStore(OFFLINE_AUDIO).put({key, blob, type: blob.type, size: blob.size})
        stored = true
      }
    }
    tx.oncomplete = () => resolve(stored)
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

async function nextMissingKey() {
  for (const playlist of await getOfflinePlaylists()) {
    for (const entry of playlist.track) {
      if (!offlineKeys.has(entry.url) && !failedKeys.has(entry.url)) {
        return entry.url
      }
    }
  }
}

async function downloadTrack(key) {
  const command = new GetObjectCommand({Bucket: bucketName, Key: key})
  const url = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
  downloadController = new AbortController()
  const response = await fetch(url, {signal: downloadController.signal})
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  let blob = await response.blob()
  // Safari won't play a blob without an audio type
  if (!blob.type.startsWith('audio/')) {
    blob = new Blob([blob], {type: key.endsWith('.mp3') ? 'audio/mpeg' : 'audio/*'})
  }
  return storeDownload(key, blob)
}

async function runDownloads() {
  if (downloadRunning || !s3) return
  downloadRunning = true
  try {
    await offlineReady
    let key
    while (navigator.onLine && (key = await nextMissingKey())) {
      downloadKey = key
      setOfflineState(key, 'downloading')
      try {
        if (await downloadTrack(key)) {
          offlineKeys.add(key)
          const url = await getOfflineUrl(key)
          for (const track of tracksWithKey(key)) {
            track.dataset.src = url
          }
          setOfflineState(key, 'saved')
        }
        else {
          setOfflineState(key, null)
        }
      }
      catch (e) {
        if (e.name == 'QuotaExceededError') {
          setOfflineState(key, null)
          offlineMessage.textContent = locale.storageFull
          break
        }
        if (e.name == 'AbortError' || !navigator.onLine) {
          setOfflineState(key, null)
          continue
        }
        console.warn(`Saving '${key}' offline failed`, e)
        failedKeys.add(key)
        setOfflineState(key, 'failed')
      }
      renderOfflinePlaylists()
    }
  }
  catch (e) {
    console.error(e)
  }
  finally {
    downloadKey = downloadController = null
    downloadRunning = false
    preloadAudio()
  }
}

async function queueOfflinePlaylist(playlist) {
  const source = `offline:${playlist.id}`
  const cli = document.createElement('li')
  cli.onclick = scrollToFirstTrack
  cli.className = 'playlist'
  cli.textContent = playlist.title + ' '
  cli.dataset.source = source
  const ca = document.createElement('a')
  ca.innerHTML = removeSVG
  ca.onclick = removeTracks
  cli.appendChild(ca)
  collection.appendChild(cli)
  // one at a time, to keep the queue in the listed order
  for (const entry of playlist.track) {
    const song = {Key: entry.url, Metadata: entry, href: ''}
    if (s3) {
      // signing doesn't need the network
      const command = new GetObjectCommand({Bucket: bucketName, Key: entry.url})
      song.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS })
    }
    sourceLink = source
    await createAudioTrack(song)
  }
}

async function renderOfflinePlaylists() {
  const playlists = await getOfflinePlaylists()
  offlineParent.hidden = playlists.length < 1
  offlineList.innerHTML = ''
  for (const playlist of playlists) {
    const keys = playlistKeys([playlist])
    const saved = [...keys].filter(key => offlineKeys.has(key)).length
    const li = document.createElement('li')
    li.className = 'playlist'
    li.textContent = playlist.title + ' '
    const status = document.createElement('span')
    status.className = 'offline-status'
    status.textContent = `${saved}/${keys.size}`
    li.appendChild(status)
    const a = document.createElement('a')
    a.className = 'action'
    a.href = '#'
    a.title = locale.playOfflinePlaylist
    a.innerHTML = addSVG
    a.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      queueOfflinePlaylist(playlist)
    }
    li.appendChild(a)
    const remove = document.createElement('a')
    remove.className = 'action'
    remove.href = '#'
    remove.title = locale.removeOffline
    remove.innerHTML = removeSVG
    remove.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (confirm(locale.confirmRemoveOffline(playlist.title))) {
        removeOfflinePlaylist(playlist.id)
      }
    }
    li.appendChild(remove)
    offlineList.appendChild(li)
  }
}

offlineReady.then(async () => {
  await renderOfflinePlaylists()
  // offline, the offline playlists are all there is to play
  if (!navigator.onLine) {
    offlineParent.querySelector('.folder').classList.add('open')
  }
  runDownloads()
})

window.addEventListener('online', () => {
  failedKeys.clear()
  runDownloads()
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker registration failed:', e))
}
