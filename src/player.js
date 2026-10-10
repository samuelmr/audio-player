import { WAKELOCK_CLEAR_TIMEOUT, SEEK_TARGET_TIMEOUT } from './constants.js'
import { locale } from './locale.js'
import { pauseSVG, playSVG, returnSVG, forwardSVG, offlineSVG, removeSVG } from './icons.js'
import { s3, objectUrl } from './s3.js'
import { decode, parseTrackNumber, replayGainVolume } from './track-metadata.js'
import { reportError } from './errors.js'
import { mirrorQueue } from './address.js'
import { offlineReady, offlineKeys, failedKeys, trackMeta, downloadKey, downloadRunning, getOfflineUrl } from './offline.js'

export let audio, play, collection, playerList
let cursor, trackLength, trackTitle, progress
let sourceLink, wakeLock, wakelockCooldown
let seekTarget, seekTimeout
// tracks in a row that failed to play
let failedInRow = 0

const preloadCache = {}
let preloading = false

// mediaSession is missing from some browser engines, such as older TVs
const setPlaybackState = (state) => {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state
  }
}

export function initPlayer(player) {
  const buttons = document.createElement('div')
  buttons.id = 'buttons'
  const prev = document.createElement('button')
  prev.title = locale.previous
  // prev.textContent = '⏮'
  prev.innerHTML = returnSVG
  buttons.appendChild(prev)
  play = document.createElement('button')
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

  audio = document.createElement('audio')
  audio.className = 'current'
  audio.preload = 'auto'
  player.appendChild(audio)

  const audioTime = document.createElement('div')
  audioTime.className = 'audio-time'
  cursor = document.createElement('input')
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
    // text that isn't a time is ignored; the cursor shows the time again
    if (Number.isFinite(secs)) audio.currentTime = secs
  })
  audioTime.appendChild(cursor)
  audioTime.appendChild(document.createTextNode(' / '))
  trackLength = document.createElement('input')
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
  trackTitle = document.createElement('input')
  trackTitle.id = 'trackTitle'
  trackTitle.size = 70
  trackTitle.className = 'track-title'
  trackTitle.disabled = true
  titleHolder.appendChild(trackTitle)
  player.appendChild(titleHolder)

  progress = document.createElement('input')
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
      // missing from some browser engines, such as older TVs
      wakeLock = await navigator.wakeLock?.request("screen")
    } catch (err) {
      console.warn(`${err.name}: ${err.message}`)
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
    setPlaybackState('playing')
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
    setPlaybackState('paused')
    wakelockCooldown = setTimeout(() => wakeLock?.release(), WAKELOCK_CLEAR_TIMEOUT)
  }
  audio.onwaiting = (e) => {
    cursor.disabled = false
    play.innerHTML = playSVG
    setPlaybackState('paused')
  }
  audio.onplaying = (e) => {
    failedInRow = 0
    play.innerHTML = pauseSVG
    play.classList.remove('stalled')
    setPlaybackState('playing')
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
  // a track that won't play is skipped, unless none of them play
  audio.onerror = () => {
    // not the empty source of an emptied queue
    if (!audio.getAttribute('src')) return
    reportError(audio.error, locale.trackFailed(trackTitle.value))
    if (++failedInRow < playerList.querySelectorAll('audio-track').length) {
      playNext()
    }
  }

  collection = document.createElement('ol')
  collection.className = 'collection'
  player.appendChild(collection)
  mirrorQueue(collection)

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
      if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
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
}

// Queue sources: the folders, playlists and tracks listed above the queue

export function setSourceLink(source) {
  sourceLink = source
}

export function createSourceItem(className, label, source) {
  const cli = document.createElement('li')
  cli.onclick = scrollToFirstTrack
  cli.className = className
  cli.textContent = label + ' '
  cli.dataset.source = source
  const ca = document.createElement('a')
  ca.innerHTML = removeSVG
  ca.onclick = removeTracks
  cli.appendChild(ca)
  return cli
}

function scrollToFirstTrack(e) {
  const source = this.dataset.source
  const track = this.closest('audio-player').querySelector(`audio-track[data-source="${source}"]`)
  if (track) {
    track.scrollIntoView({block: "nearest", inline: "nearest", behavior: 'smooth'})
    track.focus()
  }
}

// empties the queue of what came from the bucket; the offline playlists play
// from the device and stay
export function clearQueue() {
  for (const li of [...collection.children]) {
    if (!li.dataset.source.startsWith('offline:')) {
      li.querySelector('a').click()
    }
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

// offline, only the tracks saved to offline storage can be played
const isPlayable = (track) => {
  return track.classList.contains('offline-saved') || (navigator.onLine && Boolean(track.dataset.src))
}

export const playNext = () => {
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

export const playPrevious = () => {
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
    audio.volume = replayGainVolume(trackMeta.get(track))
    // call play() synchronously instead of waiting for 'canplay': on iOS a
    // backgrounded PWA is suspended as soon as audio stops, so an async gap
    // between tracks would stop playback at the end of the first track
    audio.play().catch(err => console.warn('Playback failed:', err))
    if (track.dataset.albumArt) {
      const image = new Image()
      let url = track.dataset.albumArt
      image.src = url
      image.crossOrigin = "Anonymous"
      // the art is decoration: when it can't be read, playing goes on without it
      image.onload = async function() {
        // another track may have started while the art was loading
        if (!track.classList.contains('playing')) return
        if (sessionOpts) {
          try {
            const response = await fetch(url)
            const blob = await response.blob()
            sessionOpts.artwork = [ {
              src: url,
              sizes: `${image.naturalWidth}x${image.naturalHeight}`,
              type: blob.type
            } ]
            if (track.classList.contains('playing')) {
              navigator.mediaSession.metadata = new MediaMetadata(sessionOpts)
            }
          } catch(e) {
            console.warn('Reading the album art failed:', e)
          }
        }
        try {
          const ctx = document.createElement("canvas").getContext("2d")
          ctx.drawImage(image, 0, 0, 1, 1)
          const rgba = ctx.getImageData(0, 0, 1, 1).data
          const hue = getHue(rgba[0], rgba[1], rgba[2])
          document.documentElement.style.setProperty('--base-hue', hue)
        } catch(e) {
          console.warn('Reading the color of the album art failed:', e)
        }
      }
      image.onerror = () => console.warn('Loading the album art failed:', url)
    }
    if (sessionOpts) {
      navigator.mediaSession.metadata = new MediaMetadata(sessionOpts)
    }
  }
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

export async function preloadAudio() {
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
  // an address that can't be loaded must not stop the preloading
  dummyAudio.oncanplay = dummyAudio.onerror = (e) => {
    dummyAudio.oncanplay = dummyAudio.onerror = null
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

export async function createAudioTrack(obj, source) {

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

  if (obj.Metadata['artist']) myArtist = decode(obj.Metadata['artist'])
  if (obj.Metadata['album']) myAlbum = decode(obj.Metadata['album'])
  if (obj.Metadata['name']) myTitle = decode(obj.Metadata['name'])
  if (obj.Metadata['title']) myTitle = decode(obj.Metadata['title'])
  if (obj.Metadata['tracknumber']) myTrackNumber = parseTrackNumber(obj.Metadata['tracknumber'])
  if (obj.Metadata['length']) myDuration = decode(obj.Metadata['length'])
  if (obj.Metadata['datePublished']) myYear = decode(obj.Metadata['datePublished'])
  if (obj.Metadata['recordingtime']) myYear = decode(obj.Metadata['recordingtime'])
  if (obj.Metadata['year']) myYear = decode(obj.Metadata['year'])
  if (obj.Metadata['playlist']) myPlaylist = decode(obj.Metadata['playlist'])
  if (obj.Metadata['genre']) myGenre = decode(obj.Metadata['genre'])
  if (obj.Metadata['keywords']) myKeywords = decode(obj.Metadata['keywords'])
  if (obj.Metadata['image']) myImage = decode(obj.Metadata['image'])

  const track = document.createElement('audio-track')
  track.tabIndex = 0
  track.itemprop = 'track'
  track.itemscope = ''
  track.itemtype = 'https://schema.org/MusicRecording'
  track.dataset.src = obj.href
  track.dataset.href = obj.href
  track.dataset.key = obj.Key
  track.dataset.source = source || sourceLink
  trackMeta.set(track, obj.Metadata)
  if (offlineKeys.has(obj.Key)) {
    try {
      track.dataset.src = await getOfflineUrl(obj.Key)
      track.classList.add('offline-saved')
    } catch(e) {
      // the saved track is gone, and plays from the bucket
      console.warn(`Reading '${obj.Key}' from offline storage failed`, e)
    }
  }
  else if (obj.Key == downloadKey) {
    track.classList.add('offline-downloading')
  }
  else if (failedKeys.has(obj.Key)) {
    track.classList.add('offline-failed')
  }

  // album art is not stored offline
  if (myImage && navigator.onLine && s3) {
    const url = await objectUrl(myImage)
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
  if (myDuration && Number.isFinite(parseInt(myDuration))) {
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
