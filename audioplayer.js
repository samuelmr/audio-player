import { S3Client } from "@aws-sdk/client-s3"
import { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const EXPIRE_SECONDS = 7 * 24 * 60 * 60
const WAKELOCK_CLEAR_TIMEOUT = 5 * 60 * 1000
const folderDelimiter = '/'

const locale = {}
locale.play = 'Play'
locale.previous = 'Previous'
locale.next = 'Next'
locale.playFolder = `Add all tracks to queue`
locale.playSong = `Add track to queue`
locale.playlistTitle = `Playlists`
locale.playPlaylist = `Add playlist contents to queue`
locale.jumpTo = `Jump to`
// locale.playAlbum = `Add all album tracks to queue`

let s3, err, f, bucketName, playerList, browserList, playlistList, db, skipMenu, previousFirst, sourceLink, wakeLock

const preloadCache = {}
let preloading = false

const dbRequest = indexedDB.open("audio-library", 3)
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
}
dbRequest.onsuccess = function() {
  db = dbRequest.result
}

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
  const mli = document.createElement('li')
  const pa = document.createElement('a')
  pa.title = `#${locale.jumpTo} ${locale.playlistTitle}`
  pa.href = `#playlists`
  pa.innerHTML = '#'
  mli.appendChild(pa)
  skipMenu.appendChild(mli)
  browser.innerHTML = ''
  browser.appendChild(skipNav)
  browserList.appendChild(playlistParent)
  browser.appendChild(browserList)
}

try {
  initS3()
}
catch(e) {
  if (!err) {
    err = document.createElement('div')
    err.className = 'error'
    document.body.appendChild(err)
  }
  err.textContent = e.toString()
  if (!f) {
    ss = document.createElement('storage-settings')
    f = document.createElement('form')

    const accessKeyIdInput = document.createElement('input')
    const accessKeyIdLabel = document.createElement('label')
    accessKeyIdInput.id = 'accessKeyIdInput'
    accessKeyIdLabel.for = accessKeyIdInput.id
    accessKeyIdLabel.textContent = 'S3 accessKeyId'
    f.appendChild(accessKeyIdLabel)
    accessKeyIdInput.type = 'text'
    accessKeyIdInput.size = '40'
    accessKeyIdInput.required = 'required'
    f.appendChild(accessKeyIdInput)
    
    const secretAccessKeyInput = document.createElement('input')
    const secretAccessKeyLabel = document.createElement('label')
    secretAccessKeyInput.id = 'secretAccessKeyInput'
    secretAccessKeyLabel.for = secretAccessKeyInput.id
    secretAccessKeyLabel.textContent = 'S3 secretAccessKey'
    f.appendChild(secretAccessKeyLabel)
    secretAccessKeyInput.type = 'password'
    secretAccessKeyInput.size = '40'
    secretAccessKeyInput.required = 'required'
    f.appendChild(secretAccessKeyInput)
    
    const endpointInput = document.createElement('input')
    const endpointLabel = document.createElement('label')
    endpointInput.id = 'endpointInput'
    endpointLabel.for = endpointInput.id
    endpointLabel.textContent = 'S3 endpoint'
    f.appendChild(endpointLabel)
    endpointInput.type = 'text'
    endpointInput.size = '40'
    endpointInput.required = 'required'
    f.appendChild(endpointInput)
    
    const regionInput = document.createElement('input')
    const regionLabel = document.createElement('label')
    regionInput.id = 'regionInput'
    regionLabel.for = regionInput.id
    regionLabel.textContent = 'S3 region'
    f.appendChild(regionLabel)
    regionInput.type = 'text'
    regionInput.size = '40'
    regionInput.required = 'required'
    f.appendChild(regionInput)
    
    const bucketInput = document.createElement('input')
    const bucketLabel = document.createElement('label')
    bucketInput.id = 'bucket'
    bucketLabel.for = bucketInput.id
    bucketLabel.textContent = 'S3 bucket'
    f.appendChild(bucketLabel)
    bucketInput.type = 'text'
    bucketInput.size = '40'
    bucketInput.required = 'required'
    f.appendChild(bucketInput)

    const submit = document.createElement('input')
    submit.type = 'submit'
    submit.value = 'Submit'
    f.appendChild(submit)

    f.onsubmit = () => {
      localStorage.setItem('accessKeyId', accessKeyIdInput.value)
      localStorage.setItem('secretAccessKey', secretAccessKeyInput.value)
      localStorage.setItem('endpoint', endpointInput.value)
      localStorage.setItem('region', regionInput.value)
      localStorage.setItem('bucketName', bucketInput.value)
      initS3()
    }
    ss.appendChild(f)
    document.body.appendChild(ss)
  }
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
  if (browserList) {
    getFolders(browserList)
  }
  const a = document.createElement('a')
  a.href = document.location.href
  const query = new URLSearchParams(params).toString()
  a.search += (a?.search.includes('?') ? '&' : '?') + query
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
prev.innerHTML = '<span class="fa-solid fa-backward"></span>'
buttons.appendChild(prev)
const play = document.createElement('button')
play.title = locale.play
// play.textContent = '⏵'
play.innerHTML = '<span class="fa-solid fa-play"></span>'
play.disabled = true
buttons.appendChild(play)
const next = document.createElement('button')
next.title = locale.next
// next.textContent = '⏭'
next.innerHTML = '<span class="fa-solid fa-forward"></span>'
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
  audio.currentTime = parseInt(e.target.value)
})
player.appendChild(progress)

const enablePlay = () => {
  play.disabled = false
}

updateDuration = function() {
  const seconds = parseInt(audio.duration)
  progress.max = seconds
  trackLength.value = parseInt(seconds/60) + ':' + parseInt(seconds%60).toString().padStart(2, '0')
  cursor.max = '0:' + trackLength.value
}
const requestWakeLock = async () => {
  try {
    wakeLock = await navigator.wakeLock.request("screen")
  } catch (err) {
    console.error(`${err.name}: ${err.message}`)
  }
}
audio.onloadedmetadata = updateDuration
audio.onplay = () => {
  // play.textContent = '⏸'
  play.innerHTML = '<span class="fa-solid fa-pause"></span>'
  cursor.disabled = true
  navigator.mediaSession.playbackState = 'playing'
  play.classList.remove('stalled')
  requestWakeLock()
}
audio.onpause = () => {
  // play.textContent = '⏵'
  cursor.disabled = false
  play.innerHTML = '<span class="fa-solid fa-play"></span>'
  navigator.mediaSession.playbackState = 'paused'
  setTimeout(wakeLock?.release, WAKELOCK_CLEAR_TIMEOUT)
}
audio.onstalled = audio.onsuspend = audio.onwaiting = (e) => {
  play.innerHTML = '<span class="fa-solid fa-play"></span>'
  play.classList.add('stalled')
  cursor.disabled = false
}
audio.onplaying = () => {
  play.innerHTML = '<span class="fa-solid fa-pause"></span>'
  play.classList.remove('stalled')
  cursor.disabled = true
}

const collection = document.createElement('ol')
collection.className = 'collection'
player.appendChild(collection)

playerList = document.createElement('nav')
player.appendChild(playerList)

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
audio.oncanplay = async (e) => {
  enablePlay()
  await audio.play()
  // play.textContent = '⏸'
  // play.innerHTML = '<span class="fa-solid fa-pause"></span>'
}
audio.onended = next.onclick = (e) => {
  playNext()
}
prev.onclick = (e) => {
  playPrevious()
}

play.onclick = async (e) => {
  if (!audio.getAttribute('src')) {
    return playNext()
  }
  if (audio.paused) {
    await audio.play()
    // play.textContent = '⏸'
    // play.innerHTML = '<span class="fa-solid fa-pause"></span>'
  }
  else {
    audio.pause()
    // play.textContent = '⏵'
    // play.innerHTML = '<span class="fa-solid fa-play"></span>'
  }
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() == 'button') return
    if (e.target.type == 'range') return
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
  a.innerHTML = '<span class="fa-solid fa-circle-play"></span>'
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
    ca.innerHTML = '<span class="fa-sharp fa-regular fa-circle-xmark"></span>'
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
    a.click()
    myPath = myPath.slice(pathIndex)
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
  a.innerHTML = '<span class="fa-solid fa-circle-plus"></span>'
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
      ca.innerHTML = '<span class="fa-sharp fa-regular fa-circle-xmark"></span>'
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
  a.innerHTML = '<span class="fa-solid fa-circle-plus"></span>'
  a.onclick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e?.pointerId > 0) {
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
      ca.innerHTML = '<span class="fa-sharp fa-regular fa-circle-xmark"></span>'
      ca.onclick = removeTracks
      cli.appendChild(ca)
      collection.appendChild(cli)    
    }
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
            metaQuery = await s3.send(get)
            meta = metaQuery.Metadata
            meta.key = key
            putx = db.transaction("meta", "readwrite")
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

const playNext = () => {
  const playing = playerList.querySelector('.playing')
  let candidate = playing?.nextElementSibling
  if (!candidate) {
    // pick the first item on the list
    candidate = playerList.querySelector('audio-track')
  }
  playTrack(candidate)
}

const playPrevious = () => {
  const playing = playerList.querySelector('.playing')
  const candidate = playing?.previousElementSibling
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
    audio.load()
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
  navigator.mediaSession.setActionHandler('play', (e) => { audio.play() })
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
  if (preloading || cacheKeys.length < 1) {
    return false
  }
  const href = cacheKeys[0]
  delete(preloadCache[href])
  preloading = href
  const dummyAudio = document.createElement('audio')
  dummyAudio.src = href
  dummyAudio.load()
  dummyAudio.oncanplay = (e) => {
    preloading = false
    preloadAudio()
  }
}

async function queuePreload(href) {
  preloadCache[href] = true
  preloadAudio()
}

async function createAudioTrack(obj, source) {

  // pre-fetch content to cache
  queuePreload(obj.href)

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
  track.dataset.source = sourceLink

  if (myImage) {
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
  track.appendChild(trackNumber)

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
  if (!playing) {
    trackLink.click()
  }

}
