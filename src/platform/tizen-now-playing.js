// Now Playing on the TV: the playing track over the whole screen, with its
// album art large and, blurred, as the background. It opens by itself when
// the remote has been idle for a while during playback, and with OK on the
// player bar (tizen-player.js) or on the playing track in the queue. In it:
//   OK plays and pauses, Left and Right go to the previous and next track
//   Back, Up and Down return to browsing, with the focus where it was
// The class names have a prefix where the shared stylesheet has rules for
// the plain ones.

import { locale } from '../locale.js'
import { playSVG } from '../icons.js'
import { audio, play, playerList, playNext, playPrevious } from '../player.js'
import { focusPlayer } from './tizen-library.js'

const LEFT = 37
const UP = 38
const RIGHT = 39
const DOWN = 40
const ENTER = 13
const BACK = 10009

const IDLE_TIME = 20 * 1000
const UP_NEXT = 3

let view, background, art, paused, title, artist, album, fill, time, upNext
let idleTimer, returnFocus

// in the view; the media keys keep working through tizen.js
const keys = {
  [ENTER]: () => play.click(),
  [LEFT]: () => playPrevious(),
  [RIGHT]: () => playNext(),
  [BACK]: () => close(),
  [UP]: () => close(),
  [DOWN]: () => close(),
}

export function initNowPlaying() {
  createView()

  // the playing track changes by class, and its details arrive with it
  new MutationObserver(update).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  for (const event of ['play', 'pause', 'loadedmetadata', 'emptied']) {
    audio.addEventListener(event, update)
  }
  audio.addEventListener('timeupdate', updateTime)
  audio.addEventListener('play', resetIdle)

  // registered before the other key handlers, so that it can take the keys first
  window.addEventListener('keydown', (e) => {
    resetIdle()
    const action = isOpen()
      ? keys[e.keyCode]
      // OK on the playing track opens the view, instead of starting the track over
      : e.keyCode == ENTER && document.activeElement?.matches?.('audio-track.playing, audio-player .now') && open
    if (action) {
      e.preventDefault()
      e.stopImmediatePropagation()
      action()
    }
  }, true)
  update()
}

function createView() {
  view = document.createElement('div')
  view.id = 'now-playing'
  view.hidden = true
  view.innerHTML = `
    <div class="background"></div>
    <div class="cover">
      <img alt="">
      <div class="paused">${playSVG}</div>
    </div>
    <div class="details">
      <h1 class="np-title"></h1>
      <p class="np-artist"></p>
      <p class="np-album"></p>
      <div class="progress"><div class="bar"><div class="fill"></div></div><span class="time"></span></div>
      <h2 class="up-next-title"></h2>
      <ol class="up-next"></ol>
    </div>`
  background = view.querySelector('.background')
  art = view.querySelector('.cover img')
  paused = view.querySelector('.paused')
  title = view.querySelector('.np-title')
  artist = view.querySelector('.np-artist')
  album = view.querySelector('.np-album')
  fill = view.querySelector('.fill')
  time = view.querySelector('.time')
  upNext = view.querySelector('.up-next')
  view.querySelector('.up-next-title').textContent = locale.upNext
  art.onerror = () => view.classList.add('no-art')
  document.body.appendChild(view)
}

const isOpen = () => !view.hidden

function open() {
  if (!playerList.querySelector('audio-track.playing')) return
  returnFocus = document.activeElement
  update()
  view.hidden = false
}

// back to where the focus was, unless that was hidden meanwhile, like a
// track in the queue that collapsed: then the playing track, or the player
function close() {
  if (!isOpen()) return
  view.hidden = true
  const visible = (element) => element?.getClientRects?.().length
  const target = [returnFocus, playerList.querySelector('audio-track.playing')].find(visible)
  if (target) target.focus()
  else focusPlayer()
}

// opens after the remote has been idle for a while, while music plays
function resetIdle() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (!audio.paused && !document.querySelector('dialog[open]')) open()
  }, IDLE_TIME)
}

const text = (track, selector) => track?.querySelector(selector)?.textContent.trim() || ''

// what the TV shows of a queued track, also in the player bar and the queue
export function trackDetails(track) {
  return {
    title: text(track, '.name a'),
    artist: text(track, '.artist'),
    album: [text(track, '.album'), text(track, '.published')].filter(Boolean).join(' · '),
    cover: track.dataset.albumArt || '',
    line: [text(track, '.name a'), text(track, '.artist')].filter(Boolean).join(' – '),
  }
}

function update() {
  const track = playerList.querySelector('audio-track.playing')
  if (!track) {
    close()
    return
  }
  const details = trackDetails(track)
  view.classList.toggle('no-art', !details.cover)
  if (details.cover && art.getAttribute('src') != details.cover) {
    art.src = details.cover
    background.style.backgroundImage = `url("${details.cover}")`
  }
  title.textContent = details.title
  artist.textContent = details.artist
  album.textContent = details.album
  paused.hidden = !audio.paused

  upNext.innerHTML = ''
  let next = track.nextElementSibling
  for (let i = 0; next && i < UP_NEXT; i++, next = next.nextElementSibling) {
    const li = document.createElement('li')
    li.textContent = trackDetails(next).line
    upNext.appendChild(li)
  }
  upNext.previousElementSibling.hidden = !upNext.firstChild
  updateTime()
}

const minutes = (seconds) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`

function updateTime() {
  if (!isOpen() || !audio.duration) return
  fill.style.width = `${100 * audio.currentTime / audio.duration}%`
  time.textContent = `${minutes(audio.currentTime)} / ${minutes(audio.duration)}`
}
