import { WAKELOCK_CLEAR_TIMEOUT, SEEK_TARGET_TIMEOUT } from './constants.js'
import { locale } from './locale.js'
import { pauseSVG, playSVG, returnSVG, forwardSVG, offlineSVG, removeSVG } from './icons.js'
import { s3, objectUrl } from './s3.js'
import { decode, parseTrackNumber, replayGainVolume } from './track-metadata.js'
import { reportError } from './errors.js'
import { mirrorQueue } from './address.js'
import { offlineReady, offlineKeys, failedKeys, trackMeta, downloadKey, downloadRunning, getOfflineUrl, fetchAudio } from './offline.js'

export let audio, play, collection, playerList
let cursor, trackLength, trackTitle, progress
let sourceLink, wakeLock, wakelockCooldown
let seekTarget, seekTimeout
// tracks in a row that failed to play
let failedInRow = 0

// The next track is downloaded whole while the current one plays, and put
// into a second audio element, which plays it when the current track ends. On
// iOS an app in the background is suspended as soon as the music stops, and
// loading a track into the playing element only after the previous one has
// ended sometimes stalls then, with the app suspended before any sound.
let standby // the audio element that isn't playing
let prepared // {track, href, controller, url, owned, ready}
let playingUrl // object URL of the prepared track that plays now

// The other modules listen to the events of the current element, whichever it is
export function onAudio(type, handler) {
  for (const el of [audio, standby]) {
    el.addEventListener(type, (e) => { if (el === audio) handler(e) })
  }
}

function createAudioElement(name) {
  const el = document.createElement('audio')
  el.preload = 'auto'
  el.dataset.name = name
  return el
}

// iOS lets only an audio element that the user has started play on its own
// later. The element that waits is started silently on a tap, once, with half
// a second of silence (a clip too short to play never starts, and leaves the
// element holding it).
const unlocked = new WeakSet()
let silence

function silenceUrl() {
  if (!silence) {
    const samples = 4000 // 8 kHz, 8 bits, mono
    const bytes = new Uint8Array(44 + samples).fill(128)
    const view = new DataView(bytes.buffer)
    const text = (offset, chars) => [...chars].forEach((c, i) => { bytes[offset + i] = c.charCodeAt(0) })
    text(0, 'RIFF')
    view.setUint32(4, 36 + samples, true)
    text(8, 'WAVEfmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true) // PCM
    view.setUint16(22, 1, true) // mono
    view.setUint32(24, 8000, true)
    view.setUint32(28, 8000, true)
    view.setUint16(32, 1, true)
    view.setUint16(34, 8, true)
    text(36, 'data')
    view.setUint32(40, samples, true)
    silence = URL.createObjectURL(new Blob([bytes], {type: 'audio/wav'}))
  }
  return silence
}

function initUnlock() {
  const unlock = () => {
    const el = standby
    // the current element was started by the user, or will be; one that has a
    // track, or is being unlocked, is left alone
    if (unlocked.has(el) || el.getAttribute('src')) return
    const url = silenceUrl()
    // not left holding the silence if it doesn't start
    const release = () => {
      if (el.getAttribute('src') == url) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      delete el.dataset.unlocking
    }
    const giveUp = setTimeout(release, 3000)
    el.dataset.unlocking = 'yes'
    el.muted = true
    el.src = url
    el.play().then(() => {
      unlocked.add(el)
    }).catch(err => {
      console.warn(`Unlocking an audio element failed:`, err)
    }).finally(() => {
      clearTimeout(giveUp)
      release()
    })
  }
  // before the handlers of the buttons, to be inside the same tap
  for (const type of ['click', 'touchend', 'keydown']) {
    document.addEventListener(type, unlock, true)
  }
}

// mediaSession is missing from some browser engines, such as older TVs
const setPlaybackState = (state) => {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state
  }
}

export function initPlayer(player) {
  // Safari: this is a music player, which plays on in the background
  try {
    if ('audioSession' in navigator) navigator.audioSession.type = 'playback'
  } catch (err) {
    console.warn('Setting the audio session type failed:', err)
  }

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

  audio = createAudioElement('A')
  standby = createAudioElement('B')
  audio.classList.add('current')
  player.append(audio, standby)
  initUnlock()

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
  // The handlers are on both audio elements, and act on the events of the one
  // that is current. The other one is getting the next track ready.
  const bindAudio = (el) => {
    const current = (handler) => (e) => { if (el === audio) handler(e) }
    el.onloadedmetadata = current(updateDuration)
    el.oncanplay = current((e) => {
      play.disabled = false
    })
    el.onplay = current(() => {
      // play.textContent = '⏸'
      play.innerHTML = pauseSVG
      cursor.disabled = true
      setPlaybackState('playing')
      play.classList.remove('stalled')
      requestWakeLock()
    })
    el.onpause = current(() => {
      // 'pause' also fires when a track ends; the next track starts right away,
      // so don't tell iOS that the session is paused
      if (el.ended) return
      // play.textContent = '⏵'
      cursor.disabled = false
      play.innerHTML = playSVG
      setPlaybackState('paused')
      wakelockCooldown = setTimeout(() => wakeLock?.release(), WAKELOCK_CLEAR_TIMEOUT)
    })
    // 'waiting' fires between tracks while the next one loads, and when the
    // network is slow; playing goes on, so iOS mustn't hear that it is paused
    el.onwaiting = current((e) => {
      play.classList.add('stalled')
      cursor.disabled = false
    })
    el.onplaying = current((e) => {
      failedInRow = 0
      prepareNext()
      play.innerHTML = pauseSVG
      play.classList.remove('stalled')
      setPlaybackState('playing')
      cursor.disabled = true
    })
    el.onstalled = current((e) => {
      // play.innerHTML = '<span class="fa-solid fa-play"></span>'
      play.classList.add('stalled')
      cursor.disabled = false
    })
    el.onended = current(() => playNext())
    // a track that won't play is skipped, unless none of them play
    el.onerror = current(() => {
      // not the empty source of an emptied queue
      if (!audio.getAttribute('src')) return
      reportError(audio.error, locale.trackFailed(trackTitle.value))
      if (++failedInRow < playerList.querySelectorAll('audio-track').length) {
        playNext()
      }
    })
    el.addEventListener('canplay', () => standbyLoaded(el, 'canplay'))
    el.addEventListener('canplaythrough', () => standbyLoaded(el, 'canplaythrough'))
    el.addEventListener("timeupdate", current(updateTime))
  }
  next.onclick = (e) => {
    playNext()
  }

  collection = document.createElement('ol')
  collection.className = 'collection'
  player.appendChild(collection)
  mirrorQueue(collection)

  playerList = document.createElement('nav')
  player.appendChild(playerList)
  // a change in the queue may change the next track
  new MutationObserver(prepareNext).observe(playerList, {childList: true})

  const updateTime = () => {
      // 'stalled' only says that no data came for a while: a track that plays
      // with data in hand is not stalled, and nothing else clears the pulse
      if (!audio.paused && audio.readyState >= audio.HAVE_FUTURE_DATA) {
        play.classList.remove('stalled')
      }
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
  bindAudio(audio)
  bindAudio(standby)

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

const nextPlayable = () => {
  const playing = playerList.querySelector('.playing')
  const tracks = [...playerList.querySelectorAll('audio-track')]
  const start = tracks.indexOf(playing) + 1
  // wrap around to the beginning of the list
  for (let i = 0; i < tracks.length; i++) {
    const candidate = tracks[(start + i) % tracks.length]
    if (isPlayable(candidate)) {
      return candidate
    }
  }
}

export const playNext = () => {
  playTrack(nextPlayable())
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
    const previousUrl = playingUrl
    const staged = takeStandby(track)
    // the track that was loaded at the other element, playing it needs no loading
    const release = (el) => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      if (previousUrl && previousUrl != playingUrl) URL.revokeObjectURL(previousUrl)
    }
    const volume = replayGainVolume(trackMeta.get(track))
    if (staged) {
      const old = audio
      switchTo(staged.el)
      playingUrl = staged.owned ? staged.url : undefined
      audio.volume = volume
      // iOS may let the position of a paused element run on in the background
      // (its time is not always up to date either), so the track starts from
      // the beginning, not from where the clock got to
      audio.currentTime = 0
      audio.play().then(() => release(old)).catch(err => {
        // the element may not be allowed to start on its own: the track plays
        // in the element that played the previous one
        console.warn('Playback failed:', err)
        const failed = audio
        switchTo(old)
        old.src = staged.url
        old.volume = volume
        old.play().catch(err => console.warn('Playback failed:', err))
        release(failed)
      })
    }
    else {
      playingUrl = undefined
      audio.src = track.dataset['src']
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      audio.volume = volume
      // call play() synchronously instead of waiting for 'canplay': on iOS a
      // backgrounded PWA is suspended as soon as audio stops, so an async gap
      // between tracks would stop playback at the end of the first track
      audio.play().catch(err => {
        console.warn('Playback failed:', err)
      })
    }
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

function switchTo(el) {
  standby = audio
  audio = el
  standby.classList.remove('current')
  audio.classList.add('current')
  audio.muted = false
}

// the track in the other element, if it is the one to play and is ready
function takeStandby(track) {
  const ready = prepared?.ready && prepared.track == track && prepared.href == track.dataset.src && standby.getAttribute('src') == prepared.url
  if (!ready) return
  const {url, owned} = prepared
  prepared = undefined
  return {el: standby, url, owned}
}

// the other element has the next track loaded
function standbyLoaded(el, type) {
  if (el === audio || !prepared?.url || el.getAttribute('src') != prepared.url || prepared.ready) return
  // while it plays silently it is ready when it can play through, otherwise when it can play
  if (type == 'canplay' && !el.paused) return
  if (el.readyState < el.HAVE_FUTURE_DATA) return
  // loaded in silence, and waiting at the start
  el.pause()
  el.currentTime = 0
  prepared.ready = true
}

function discardPrepared() {
  prepared?.controller.abort()
  // the other element lets go of the track, unless it is silent for unlocking
  if (prepared?.url) {
    if (standby.getAttribute('src') == prepared.url) {
      standby.pause()
      standby.removeAttribute('src')
      standby.load()
    }
    if (prepared.owned) URL.revokeObjectURL(prepared.url)
  }
  prepared = undefined
}

// load the track into the other element, silent until it plays
function stageStandby(preparing, url, owned) {
  preparing.url = url
  preparing.owned = owned
  const el = standby
  el.muted = true
  el.src = url
  // iOS may load no more than the metadata of an element that isn't playing,
  // so it is played silently until it has loaded
  el.play().catch(err => {
    // paused when loaded, or replaced by another track
    if (err.name != 'AbortError') console.warn('Getting the next track ready failed:', err)
  })
}

export function prepareNext() {
  const track = nextPlayable()
  // a track alone in the queue is loading now
  const href = track && !track.classList.contains('playing') && track.dataset.src
  if (href && prepared?.track == track && prepared.href == href) return
  discardPrepared()
  // the playing track is loaded first
  if (!href || audio.paused || audio.readyState < audio.HAVE_FUTURE_DATA || !navigator.onLine) {
    return
  }
  const preparing = prepared = {track, href, controller: new AbortController()}
  // offline tracks are on the device already
  if (track.classList.contains('offline-saved')) {
    stageStandby(preparing, href, false)
    return
  }
  // saving offline playlists goes first
  if (downloadRunning) {
    prepared = undefined
    return
  }
  fetchAudio(href, track.dataset.key, preparing.controller.signal).then(blob => {
    if (prepared == preparing) stageStandby(preparing, URL.createObjectURL(blob), true)
  }).catch(e => {
    // the track plays from the bucket instead
    if (e.name != 'AbortError') console.warn('Getting the next track ready failed:', e)
  })
}

export async function createAudioTrack(obj, source) {

  await offlineReady

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
  // a track without a length, or with 0, shows none
  const seconds = Math.round(parseInt(myDuration) / 1000) // ms to s
  if (seconds > 0) {
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
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
