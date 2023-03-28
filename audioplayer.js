import { S3Client } from "@aws-sdk/client-s3";
import { ListObjectsCommand,
    HeadObjectCommand,
    GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const EXPIRE_SECONDS = 7 * 24 * 60 * 60
const folderDelimiter = '/'

let s3, err, f, bucketName, browserList, playerList

const browser = document.querySelector('audio-browser')
if (!browser) {
  throw new Error("Didn't find an audio-browser element in HTML document")
}
else {
  browserList = document.createElement('nav')
  browser.innerHTML = ''
  browser.appendChild(browserList)
}

const player = document.querySelector('audio-player')
if (!player) {
  throw new Error("Didn't find an audio-player element in HTML document")
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
  // console.log(f)
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
  if (!localStorage.getItem('accessKeyId')) {
    throw new Error('S3 accessKeyId is missing')
  }
  if (!localStorage.getItem('secretAccessKey')) {
    throw new Error('S3 secretAccessKey is missing')
  }
  if (!localStorage.getItem('endpoint')) {
    throw new Error('S3 endpoint is missing')
  }
  if (!localStorage.getItem('region')) {
    throw new Error('S3 region is missing')
  }
  const s3opts = {
    credentials: {
      accessKeyId: localStorage.getItem('accessKeyId'),
      secretAccessKey: localStorage.getItem('secretAccessKey'),
    },
    endpoint: localStorage.getItem('endpoint'),
    s3BucketEndpoint: true,
    forcePathStyle: true,
    region: localStorage.getItem('region')
  }
  bucketName = localStorage.getItem('bucketName')
  s3 = new S3Client(s3opts)
  if (browserList) {
    getFolders(browserList)
  }
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

async function getFolders(parentElement=null) {
  const input = {Bucket: bucketName}
  if (parentElement.dataset.folder) {
    input['Prefix'] = decodeURIComponent(parentElement.dataset.folder)
  }
  else {
    input['Delimiter'] = folderDelimiter
  }
/*
  try {
*/
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
    // console.log(input)
    const command = new ListObjectsCommand(input)
    const response = await s3.send(command)
    if (response.CommonPrefixes) {
      for (const obj of response.CommonPrefixes) {
        const folderName = obj.Prefix.replace(/\/$/, '')
        const li = createFolderElement(folderName, olRef)
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
          let ol = li.querySelector('ol')
          if (!ol) {
            ol = document.createElement('ol')
            li.appendChild(ol)
          }
          subRef = ol
        }
        if (obj.Key.endsWith('.mp3')) {
          const meta = await getS3Meta(obj.Key)
          if (meta) {
            obj.Metadata = meta.Metadata
            // console.log(obj.Metadata)
          }
          obj.href = `?play#${encodeURIComponent(obj.Key)}`
          const getParams = {Bucket: bucketName, Key: obj.Key}
          const command = new GetObjectCommand(getParams);
          obj.href = await getSignedUrl(s3, command, { expiresIn: EXPIRE_SECONDS });
          const li = createSongElement(obj, subRef)
        }
        else if (obj.Key.endsWith('.m3u')) {
          // playlists.push(obj.Key)
        }
      }
    }
/*
  }
  catch(e) {
    console.error(e)
  }
*/
}
const audio = document.createElement('audio')
player.appendChild(audio)
let audioRef = audio
const enablePlay = async () => {
  play.disabled = false
  await play.click()
}
// audioRef.oncanplay = enablePlay

const buttons = document.createElement('div')
buttons.id = 'buttons'
const prev = document.createElement('button')
prev.title = 'Previous'
prev.textContent = '⏮'
buttons.appendChild(prev)
const play = document.createElement('button')
play.title = 'Play'
play.textContent = '⏵'
play.disabled = true
buttons.appendChild(play)
const next = document.createElement('button')
next.title = 'Previous'
next.textContent = '⏭'
buttons.appendChild(next)
player.appendChild(buttons)

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
  
const previousTrack = document.createElement('audio')
player.appendChild(previousTrack)
let previousTrackRef = previousTrack
const nextTrack = document.createElement('audio')
player.appendChild(nextTrack)
let nextTrackRef = nextTrack

const progress = document.createElement('input')
progress.type = 'range'
progress.id = 'progress'
progress.addEventListener('input', (e) => {audioRef.currentTime = parseInt(e.target.value)})
player.appendChild(progress)

updateDuration = function() {
  const seconds = parseInt(this.duration)
  progress.max = seconds
  trackLength.value = parseInt(seconds/60) + ':' + parseInt(seconds%60).toString().padStart(2, '0')
}
audioRef.onloadedmetadata = updateDuration

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

play.addEventListener('click', async (e) => {
    if (play.textContent == '⏵') {
        await audioRef.play()
        play.textContent = '⏸'
    }
    else {
        await audioRef.pause()
        play.textContent = '⏵'
    }
})
/*
document.querySelectorAll('audio-track').forEach(track => {
    track.onclick = () => { play.dispatchEvent(new MouseEvent('click')) }
})
*/
window.addEventListener('keydown', (e) => {
    if (e.target.tagName.toLowerCase() == 'button') return
    if (e.target.type == 'range') return
    let current = document.querySelector('audio-track:focus-within')
    let newCurrent = false
    switch(e.key) {
      case " ": e.preventDefault(); play.click(); break
      case "Enter": play.disabled = true; audioRef.src = current.dataset.src; break
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

function createFolderElement(folder, ol) {
  const candidate = ol.querySelector(`[data-folder="${folder}"]`)
  if (candidate) return candidate
  const parent = ol.parentNode.dataset.folder
  const li = document.createElement('li')
  li.className = 'folder'
  li.dataset.folder = folder
  const a = document.createElement('a')
  a.href = '#' + (parent ? encodeURIComponent(parent) + '/' : '') + encodeURIComponent(folder)
  a.textContent = folder
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    history.pushState(folder, folder, a.href)
    getFolders(li)
  }
  li.onclick = (e) => {
    history.pushState(folder, folder, a.href)
    getFolders(li)
    li.onclick = function(e) {
      const subList = this.querySelector('ol')
      if (subList) {
        subList.classList.toggle('hidden')
      }
    }
  }
  li.appendChild(a)
  ol.appendChild(li)
  return li
}

async function createSongElement(obj, ol) {
  // console.log(obj)
/*
  const response = await fetch(obj.href)
  for (var pair of response.headers.entries()) {
    console.log(pair[0]+ ': '+ pair[1]);
  }
  console.log(response.headers['x-amz-meta-x-amz-meta-tracknumber'])
*/
  const li = document.createElement('li')
  li.className = 'song'
  const a = document.createElement('a')
  a.href = obj.href
  a.textContent = obj.Key
  a.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    history.pushState(a.href, a.textContent, `#${obj.Key}`)
    createAudioTrack(obj)
  }
  li.appendChild(a)
  ol.appendChild(li)
  return li
}

async function getS3Meta(key) {
  let meta
  // let meta = metaCache.get(key)
  // if (meta === undefined) {
    try {
      const get = new HeadObjectCommand({Bucket: bucketName, Key: key})
      meta = await s3.send(get)
      // console.log(key)
      // console.log(meta)
      // metaCache.set(key, meta)
    }
    catch(e) {
      console.warn(`Error retrieving metadata for '${key}' from S3 bucket '${bucketName}'`)
      console.log(e)
      return false
    }
  // }
  return meta
}

const playNext = () => {
  const playing = playerList.querySelector(`[data-src="${audioRef.src}"]`)
  if (playing && playing.nextElementSibling) {
    const link = playing.nextElementSibling.querySelector('.name a')
    if (link) {
      link.click()
    }
  }
}

const playPrevious = () => {
  const playing = playerList.querySelector(`[data-src="${audioRef.src}"]`)
  if (playing && playing.previousElementSibling) {
    const link = playing.previousElementSibling.querySelector('.name a')
    if (link) {
      link.click()
    }
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
  if (obj.Metadata['title']) myTitle = decodeURIComponent(obj.Metadata['title'])
  if (obj.Metadata['tracknumber']) myTrackNumber = decodeURIComponent(obj.Metadata['tracknumber'])
  if (obj.Metadata['length']) myDuration = decodeURIComponent(obj.Metadata['length'])
  if (obj.Metadata['year']) myYear = decodeURIComponent(obj.Metadata['year'])
  if (obj.Metadata['playlist']) myPlaylist = decodeURIComponent(obj.Metadata['playlist'])
  if (obj.Metadata['genre']) myGenre = decodeURIComponent(obj.Metadata['genre'])
  if (obj.Metadata['keywords']) myKeywords = decodeURIComponent(obj.Metadata['keywords'])

  const track = document.createElement('audio-track')
  track.tabIndex = 0
  // const article = document.createElement('article')
  track.itemprop = 'track'
  track.itemscope = ''
  track.itemtype = 'https://schema.org/MusicRecording'
  track.dataset.src = obj.href

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
    play.disabled = true
    previousTrackRef = audioRef
    nextTrackRef.src = obj.href
    nextTrackRef.onloadedmetadata = updateDuration
    nextTrackRef.addEventListener("timeupdate", updateTime);
    nextTrackRef.addEventListener('canplay', async (e) => {
      enablePlay()
      previousTrackRef = audio
      previousTrackRef.onloadedmetadata = () => {}
      audioRef = nextTrack
      await previousTrackRef.pause()
      // await audioRef.play()
      if (track.nextElementSibling && track.nextElementSibling.tagName == 'audio-track') {
        nextTrackRef = previousTrackRef
        nextTrackRef.src = track.nextElementSibling.dataset.src
      }
    })
    collection.innerHTML = `${myArtist}: ${myTitle}`
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
    const sec = myDuration % 60
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

  // console.log(playerList)

  playerList.appendChild(track)
  if (!audioRef.src) {
    trackLink.click()
  }

}