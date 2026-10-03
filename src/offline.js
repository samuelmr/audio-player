// Offline playlists
//
// A saved playlist is a fixed list of S3 keys. The downloader saves the tracks
// one at a time, in the order the playlists were saved, until every saved
// playlist is complete. Downloading goes before preloading.

import { locale } from './locale.js'
import { offlineSVG, addSVG, removeSVG } from './icons.js'
import { db, dbReady, requestResult, OFFLINE_PLAYLISTS, OFFLINE_AUDIO } from './db.js'
import { s3, signedUrl } from './s3.js'
import { browserList } from './browser.js'
import { audio, collection, playerList, createAudioTrack, createSourceItem, setSourceLink, preloadAudio } from './player.js'

export const offlineKeys = new Set() // keys of the tracks stored in OFFLINE_AUDIO
const offlineUrls = new Map() // key -> object URL of the stored blob
export const failedKeys = new Set() // not retried until the next start or 'online' event
export const trackMeta = new WeakMap() // audio-track -> metadata, for saving playlists
export let downloadRunning = false
export let downloadKey
let downloadController
let offlineParent, offlineList, offlineMessage

const playlistKeys = (playlists) => new Set(playlists.flatMap(p => p.track.map(t => t.url)))

const getOfflinePlaylists = () => {
  return requestResult(db.transaction(OFFLINE_PLAYLISTS).objectStore(OFFLINE_PLAYLISTS).getAll())
}

export const offlineReady = dbReady.then(async () => {
  const keys = await requestResult(db.transaction(OFFLINE_AUDIO).objectStore(OFFLINE_AUDIO).getAllKeys())
  keys.forEach(key => offlineKeys.add(key))
}).catch(e => console.error(e))

export function initOffline(player) {
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
  browserList.prepend(offlineParent)

  const saveOfflineButton = document.createElement('button')
  saveOfflineButton.type = 'button'
  saveOfflineButton.className = 'save-offline'
  saveOfflineButton.innerHTML = offlineSVG + ' ' + locale.saveOffline
  saveOfflineButton.hidden = true
  player.insertBefore(saveOfflineButton, collection)
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
}

export async function getOfflineUrl(key) {
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
  const url = await signedUrl(key)
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

export async function runDownloads() {
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
  collection.appendChild(createSourceItem('playlist', playlist.title, source))
  // one at a time, to keep the queue in the listed order
  for (const entry of playlist.track) {
    const song = {Key: entry.url, Metadata: entry, href: ''}
    if (s3) {
      // signing doesn't need the network
      song.href = await signedUrl(entry.url)
    }
    setSourceLink(source)
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
    a.className = 'action add'
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
    remove.className = 'action remove'
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
