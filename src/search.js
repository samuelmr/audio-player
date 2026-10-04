import { ListObjectsV2Command } from "@aws-sdk/client-s3"
import { folderDelimiter, MAX_SEARCH_RESULTS, MAX_FOLDER_RESULTS, MIN_SEARCH_LENGTH, SEARCH_DEBOUNCE } from './constants.js'
import { locale } from './locale.js'
import { addSVG } from './icons.js'
import { getAllMeta } from './db.js'
import { s3, bucketName, signedUrl, getS3Meta } from './s3.js'
import { playlistList } from './browser.js'
import { collection, createAudioTrack, createSourceItem, setSourceLink } from './player.js'

let searchInput, searchResults, searchTimeout, searchKeys, searchKeysPromise
// when each listed key was last modified, for the metadata cache
const searchModified = new Map()
let searchRun = 0

export function initSearch(skipNav) {
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
}

// the bucket may have changed
export function resetSearchKeys() {
  searchKeys = searchKeysPromise = null
  searchModified.clear()
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
            searchModified.set(obj.Key, obj.LastModified)
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
  // by name only: the TV app may list the playlist's tracks inside its item
  const playlistName = (li) => li.firstChild.textContent.trim()
  const playlistMatches = [...playlistList.querySelectorAll('li.playlist')].filter(li => matches(playlistName(li)))

  searchResults.innerHTML = ''
  for (const folder of folderMatches) {
    addSearchResult('result-folder', folder, '', async () => {
      const folderKeys = (await getSearchKeys()).filter(key => key.startsWith(folder + folderDelimiter))
      queueKeys(folderKeys, folder, 'folder')
    })
  }
  for (const li of playlistMatches) {
    addSearchResult('result-playlist', playlistName(li), '', () => li.querySelector(':scope > a.add')?.click())
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
  a.className = 'action add'
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

export async function queueKeys(keys, source, className) {
  collection.appendChild(createSourceItem(className, source, source))
  // one at a time, to keep the queue in the listed order
  for (const key of keys) {
    const obj = {Key: key}
    try {
      obj.Metadata = await getS3Meta(key, searchModified.get(key))
    } catch(e) {
      obj.Metadata = {}
    }
    obj.href = await signedUrl(key)
    setSourceLink(source)
    await createAudioTrack(obj)
  }
}
