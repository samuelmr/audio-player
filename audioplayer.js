import { S3Client } from "@aws-sdk/client-s3";
import { ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const EXPIRE_SECONDS = 7 * 24 * 60 * 60
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

let s3, err, f, bucketName, playerList, browserList, playlistList, db, skipMenu, previousFirst

const dbRequest = indexedDB.open("audio-library", 3);
dbRequest.onupgradeneeded = function(event) {
  const db = dbRequest.result;
  if (event.oldVersion < 1) {
    const cache = db.createObjectStore("meta", {keyPath: "key"});
    const artistIndex = cache.createIndex("by_artist", "artist");
    const albumIndex = cache.createIndex("by_album", "album");
    const titleIndex = cache.createIndex("by_title", "title");
    const tracknumberIndex = cache.createIndex("by_tracknumber", "tracknumber");
    const yearIndex = cache.createIndex("by_year", "year");
    const playlistIndex = cache.createIndex("by_playlist", "playlist");
    const genreIndex = cache.createIndex("by_genre", "genre");
    const commentIndex = cache.createIndex("by_comment", "comment");
  }
  if (event.oldVersion < 2) {
    const cache = dbRequest.transaction.objectStore("meta")
    const keyIndex = cache.createIndex("key", "key", {unique: true});
  }
  if (event.oldVersion < 3) {
    const cache = dbRequest.transaction.objectStore("meta")
    const commentIndex = cache.createIndex("image", "image");
  }
}
dbRequest.onsuccess = function() {
  db = dbRequest.result;
};

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
    accessKeyIdLabel.for = accessKeyIdInput
    accessKeyIdLabel.textContent = 'accessKeyId'
    f.appendChild(accessKeyIdLabel)
    accessKeyIdInput.id = 'S3 accessKeyIdInput'
    accessKeyIdInput.type = 'text'
    accessKeyIdInput.size = '40'
    accessKeyIdInput.required = 'required'
    f.appendChild(accessKeyIdInput)
    
    const secretAccessKeyInput = document.createElement('input')
    const secretAccessKeyLabel = document.createElement('label')
    secretAccessKeyLabel.for = secretAccessKeyInput
    secretAccessKeyLabel.textContent = 'secretAccessKey'
    f.appendChild(secretAccessKeyLabel)
    secretAccessKeyInput.id = 'S3 secretAccessKeyInput'
    secretAccessKeyInput.type = 'password'
    secretAccessKeyInput.size = '40'
    secretAccessKeyInput.required = 'required'
    f.appendChild(secretAccessKeyInput)
    
    const endpointInput = document.createElement('input')
    const endpointLabel = document.createElement('label')
    endpointLabel.for = endpointInput
    endpointLabel.textContent = 'endpoint'
    f.appendChild(endpointLabel)
    endpointInput.id = 'S3 endpointInput'
    endpointInput.type = 'text'
    endpointInput.size = '40'
    endpointInput.required = 'required'
    f.appendChild(endpointInput)
    
    const regionInput = document.createElement('input')
    const regionLabel = document.createElement('label')
    regionLabel.for = regionInput
    regionLabel.textContent = 'S3 region'
    f.appendChild(regionLabel)
    regionInput.id = 'regionInput'
    regionInput.type = 'text'
    regionInput.size = '40'
    regionInput.required = 'required'
    f.appendChild(regionInput)
    
    const bucketInput = document.createElement('input')
    const bucketLabel = document.createElement('label')
    bucketLabel.for = bucketInput
    bucketLabel.textContent = 'S3 bucket'
    f.appendChild(bucketLabel)
    bucketInput.id = 'bucket'
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
  // console.log(a.href)
}

/*
const dbName = 'music'
const dbVersion = 1

let db
const request = window.indexedDB.open(dbName, dbVersion);
request.onerror = (event) => {
  console.error(`Error: can't use IndexedDB ${Name}, ${dbVersion}!`);
};
request.onsuccess = (event) => {
  db = event.target.result;
};
*/

const enablePlay = async () => {
  play.disabled = false
  // play.textContent = '⏵'
  // play.click()
}

const buttons = document.createElement('div')
buttons.id = 'buttons'
const prev = document.createElement('button')
prev.title = locale.previous
prev.textContent = '⏮'
buttons.appendChild(prev)
const play = document.createElement('button')
play.title = locale.play
play.textContent = '⏵'
// play.disabled = true
buttons.appendChild(play)
const next = document.createElement('button')
next.title = locale.next
next.textContent = '⏭'
buttons.appendChild(next)
player.appendChild(buttons)

const previousTrack = document.createElement('audio')
previousTrack.className = 'previous'
previousTrack.preload = 'auto'
player.appendChild(previousTrack)
let previousTrackRef = previousTrack

const audio = document.createElement('audio')
audio.className = 'current'
audio.preload = 'auto'
player.appendChild(audio)
let audioRef = audio

const nextTrack = document.createElement('audio')
nextTrack.className = 'next'
nextTrack.preload = 'auto'
player.appendChild(nextTrack)
let nextTrackRef = nextTrack

const audioTime = document.createElement('div')
audioTime.className = 'audio-time'
const cursor = document.createElement('input')
cursor.size = 5
cursor.value = '00:00'
cursor.addEventListener('blur', (e) => {
  const parts = e.target.value.split(':')
  audioRef.currentTime = parts[0] * 60 + parts[1]
})
audioTime.appendChild(cursor)
audioTime.appendChild(document.createTextNode(' / '))
const trackLength = document.createElement('input')
trackLength.size = 5
trackLength.value = '00:00'
audioTime.appendChild(trackLength)
player.appendChild(audioTime)

const progress = document.createElement('input')
progress.type = 'range'
progress.id = 'progress'
progress.addEventListener('input', (e) => {audioRef.currentTime = parseInt(e.target.value)})
player.appendChild(progress)

updateDuration = function() {
  const seconds = parseInt(this?.duration ? this.duration : audioRef.duration)
  progress.max = seconds
  trackLength.value = parseInt(seconds/60) + ':' + parseInt(seconds%60).toString().padStart(2, '0')
}
audioRef.onloadedmetadata = updateDuration
audioRef.onplay = () => {
  play.textContent = '⏸'
}
audioRef.onpause = () => {
  play.textContent = '⏵'
}
audioRef.onstalled = audioRef.onsuspend = audioRef.onwaiting = () => {
  play.classList.add('stalled')
}
audioRef.onplaying = () => {
  play.classList.remove('stalled')
}

const collection = document.createElement('div')
player.appendChild(collection)

playerList = document.createElement('nav')
player.appendChild(playerList)

const updateTime = () => {
    const seconds = parseInt(audioRef.currentTime)
    cursor.value = parseInt(seconds/60) + ':' + parseInt(seconds%60).toString().padStart(2, '0')
    progress.value = seconds
}
audioRef.addEventListener("timeupdate", updateTime);

play.onclick = async (e) => {
  if (audioRef.paused) {
    await audioRef.play()
    play.textContent = '⏸'
  }
  else {
    audioRef.pause()
    play.textContent = '⏵'
  }
}

audio.onended = nextTrack.onended = previousTrack.onended = next.onclick = (e) => {
  playNext()
}
prev.onclick = (e) => {
  playPrevious()
}

window.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() == 'button') return
    if (e.target.type == 'range') return
    let current = document.querySelector('audio-track:focus-within')
    let newCurrent = false
    switch(e.key) {
      case " ": e.preventDefault(); play.click(); break
      // case "Enter": play.disabled = true; audioRef.src = current.dataset.src; break
      case "Enter": current.querySelector('.name a')?.click(); break
      case "ArrowRight": playNext(); break
      case "ArrowLeft": playPrevious(); break
      case "ArrowDown":
        e.preventDefault(); 
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
        e.preventDefault(); 
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

async function getFolders(parentElement=null, token=null) {
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
  // console.log(parentElement)
  // console.log(input)
  try {
/*
    let olRef
    const candidate = parentElement.querySelector('ol')
    if (candidate) {
      olRef = candidate
    }
    else {
      const ol = document.createElement('ol')
      parentElement.appendChild(ol)
      olRef = ol
    }
*/
    let olRef = parentElement.querySelector('ol:not(.playlists)')
    console.log(olRef)
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
          // obj.href = `?play#${encodeURIComponent(obj.Key)}`
          const getParams = {Bucket: bucketName, Key: obj.Key}
          const command = new GetObjectCommand(getParams)
          obj.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS });
          const li = createSongElement(obj, subRef)
        }
        else if (obj.Key.endsWith('.json')) {
          // playlists.push(obj.Key)
          const getParams = {Bucket: bucketName, Key: obj.Key}
          const command = new GetObjectCommand(getParams)
          // obj.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS });
          const li = createPlaylistElement(obj, playlistList)
          // console.log(playlistList)
        }
        else if (obj.Key.endsWith('.m3u')) {
          // playlists.push(obj.Key)
        }
      }
    }
    if (response.IsTruncated) {
      // console.log(response)
      getFolders(parentElement, response.NextContinuationToken)
    }
  }
  catch(e) {
    console.error(e)
  }
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
  a.href = '#' + (parent ? encodeURIComponent(parent) + '/' : '') + encodeURIComponent(folder)
  a.className = 'action'
  a.title = locale.playFolder
  a.textContent = '⥅' // '⤅' '⧐' '⏵'
  a.onclick = async function(e) {
    e.preventDefault()
    e.stopPropagation()
    li.classList.add('open')
    history.pushState(folder, folder, a.href)
    collection.innerHTML = (parent ? `${parent}: ` : '') + folder
    if (!li.querySelector('ol')) {
      await getFolders(li)
    }
    const tracks = e?.target?.parentNode?.querySelectorAll('.song a')
    tracks.forEach((link) => {
      link.click()
    })
  }
  li.appendChild(document.createTextNode(' '))
  li.appendChild(a)
  li.onclick = function(e) {
    e.preventDefault()
    e.stopPropagation()
    const isOpen = this.classList.toggle('open')
    history.pushState(folder, folder, a.href)
    const subLists = this.querySelectorAll('li ol')
    if (subLists.length > 0) {
      for (const subList of subLists) {
        subList.classList.toggle('hidden', !isOpen)
        // subList.onclick = li.onclick
      }  
    }
    else {
      getFolders(li)
    }
  }
  li.appendChild(a)
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
  a.textContent = '⧐' // '⥅' '⏵'
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e?.pointerId > 0) {
      history.pushState(a.href, a.textContent, `#${obj.Key}`)
      collection.innerHTML = obj.Key  
    }
    createAudioTrack(obj)
  }
  li.appendChild(a)
  ol.appendChild(li)
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
  a.textContent = '⧐' // '⥅' '⏵'
  a.onclick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e?.pointerId > 0) {
      history.pushState(a.href, a.textContent, `#${obj.Key}`)
      collection.innerHTML = obj.Key  
    }
    // console.log(obj)
    const getParams = {Bucket: bucketName, Key: obj.Key}
    const command = new GetObjectCommand(getParams);
    const res = await s3.send(command)
    const json = await res.Body.transformToString()
    try {
      const playlist = JSON.parse(json)
      const base = obj.Key.replace(/\/[^\/]+$/, '')
      playlist?.track.forEach(async (track) => {
        const song = {
          Bucket: bucketName,
          Key: `${base}/${track.url}`,
          Metadata: track,
        }
        const getParams = {Bucket: bucketName, Key: song.Key}
        const command = new GetObjectCommand(getParams);
        song.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS });
        createAudioTrack(song)
        // console.log(song)
      })
    }
    catch(e) {
      console.error(e)
    }
    // console.log(playlist)
    // createAudioTrack(obj)
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
        reject(new Error(event));
      };
      dbRequest.onsuccess = async function() {
        const matching = dbRequest.result;
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
            // console.log(meta, putx)
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

async function prepareNext() {
  const current = playerList.querySelector('.playing')
  if (current?.nextElementSibling?.tagName.toLocaleLowerCase() == 'audio-track') {
    nextTrackRef.className = 'next'
    nextTrackRef.onloadedmetadata = () => {}
    nextTrackRef.oncanplay = () => {}
    nextTrackRef.src = current.nextElementSibling.dataset.src
  }
}

async function preparePrevious() {
  const current = playerList.querySelector('.playing')
  if (current?.previousElementSibling?.tagName.toLocaleLowerCase() == 'audio-track') {
    previousTrackRef.className = 'previous'
    previousTrackRef.onloadedmetadata = () => {}
    previousTrackRef.oncanplay = () => {}
    previousTrackRef.src = current.previousElementSibling.dataset.src
  }
}

const playNext = () => {
  const playing = playerList.querySelector('.playing')
  const candidate = playing?.nextElementSibling
  playTrack(candidate)
}

const playPrevious = () => {
  const playing = playerList.querySelector('.playing')
  const candidate = playing?.previousElementSibling
  playTrack(candidate)
}

const playTrack = async (track) => {
  if (track) {
    playerList.querySelector('.playing')?.classList.remove('playing')
    track.classList.add('playing')
    track.scrollIntoView({block: "nearest", inline: "nearest"})
    if (track.dataset['src'] == nextTrackRef.src) {
      let tmpRef = previousTrackRef
      previousTrackRef = audioRef
      audioRef = nextTrackRef
      audioRef.className = 'current'
      updateDuration()
      enablePlay()
      await audioRef.play()
      play.textContent = '⏸'
      nextTrackRef = tmpRef
      await prepareNext()
      await preparePrevious()
    }
    else if (track.dataset['src'] == previousTrackRef.src) {
      let tmpRef = nextTrackRef
      nextTrackRef = audioRef
      audioRef = previousTrackRef
      updateDuration()
      enablePlay()
      await audioRef.play()
      play.textContent = '⏸'
      previousTrackRef = tmpRef
      await preparePrevious()
      await prepareNext()
    }
    else {
      nextTrackRef.onloadedmetadata = updateDuration
      nextTrackRef.ontimeupdate = updateTime
      nextTrackRef.src = track.dataset['src']
      nextTrackRef.oncanplay = async (e) => {
        let tmpRef = previousTrackRef
        previousTrackRef = audioRef
        audioRef = nextTrackRef
        audioRef.className = 'current'
        enablePlay()
        await audioRef.play()
        play.textContent = '⏸'
        nextTrackRef = tmpRef
        await  prepareNext()
        await preparePrevious()
      }  
    }
    // if (track.style.backgroundImage) {
      const image = new Image();
      image.src = track.style.backgroundImage
      image.onload = function() {
        const context = document.createElement("canvas").getContext("2d")
        context.drawImage(image, 0, 0, 1, 1)
        const i = ctx.getImageData(0, 0, 1, 1).data
        const color = `rgba(${i[0]},${i[1]},${i[2]},${i[3]})`
        console.log(color)

      }  
    // }
  }
}
  
async function createAudioTrack(obj) {
  let myArtist = ''
  let myAlbum = ''
  let myTitle = ''
  let myTrackNumber = ''
  let myDuration = ''
  let myYear = ''
  let myPlaylist = ''
  let myGenre = ''
  let myKeywords = ''
  let myImage = ''
 
  const matches = obj.Key.match(/([^\/]*)\/?([^\/]*)\/([^\/]*)\.mp3/)
  if (matches.length == 4) {
    myArtist = matches[1]
    myAlbum = matches[2]
    myTitle = matches[3]
  }
  else if (matches.length > 0) {
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

  if (myImage) {
    const img = {
      Bucket: bucketName,
      Key: myImage
    }
    const getParams = {Bucket: bucketName, Key: img.Key}
    const command = new GetObjectCommand(getParams);
    const url = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS });
    track.style.backgroundImage = `url(${url})`
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
/*
    playerList.querySelector('.playing')?.classList?.remove('playing')
    track.classList.add('playing')
    play.disabled = true
    previousTrackRef = audioRef
    nextTrackRef.src = obj.href
    console.log(nextTrackRef)
    nextTrackRef.onloadedmetadata = updateDuration
    nextTrackRef.ontimeupdate = updateTime
    nextTrackRef.oncanplay = async (e) => {
      console.log(nextTrackRef, 'can play')
      previousTrackRef = audio
      previousTrackRef.onloadedmetadata = () => {}
      audioRef = nextTrackRef
      enablePlay()
      console.log('enabled')
      prepareNext()
      console.log('next prepared')
      // preparePrevious()
    }
    // collection.innerHTML = `${myArtist}: ${myTitle}`
*/
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
  // if (!audioRef.src) {
    // trackLink.click()
  // }

}
