// Now Playing: the playing track over the whole screen, with its album art
// large and, blurred, as the background, its details, its progress and the
// next tracks. Each app opens and closes it its own way: the remote on the
// TV (tizen-now-playing.js), buttons, taps and Esc on the web (pwa.js).
// With controls, it has buttons of its own, a click on the art plays and
// pauses, and a click on the progress bar seeks. onClose hears of it
// closing, also by itself when nothing plays any more.
// The class names have a prefix where the stylesheet has rules for the
// plain ones.

import { locale } from './locale.js'
import { playSVG, pauseSVG, returnSVG, forwardSVG, compressSVG } from './icons.js'
import { audio, play, playerList, playNext, playPrevious } from './player.js'
import { trackDetails } from './player-bar.js'

const UP_NEXT = 3

let view, background, art, paused, title, artist, album, meta, bar, fill, time, upNext, playButton
let onClose

export function initNowPlaying({ controls = false, onClose: closed } = {}) {
  onClose = closed || (() => {})
  createView(controls)

  // the playing track changes by class, and its details arrive with it
  new MutationObserver(update).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  for (const event of ['play', 'pause', 'loadedmetadata', 'emptied']) {
    audio.addEventListener(event, update)
  }
  audio.addEventListener('timeupdate', updateTime)
  update()
  return view
}

function createView(controls) {
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
      <p class="np-meta"></p>
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
  meta = view.querySelector('.np-meta')
  bar = view.querySelector('.bar')
  fill = view.querySelector('.fill')
  time = view.querySelector('.time')
  upNext = view.querySelector('.up-next')
  view.querySelector('.up-next-title').textContent = locale.upNext
  art.onerror = () => view.classList.add('no-art')
  if (controls) addControls()
  document.body.appendChild(view)
}

function addControls() {
  view.classList.add('controls')
  const button = (className, label, svg, onclick) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = className
    b.title = label
    b.setAttribute('aria-label', label)
    b.innerHTML = svg
    b.onclick = onclick
    return b
  }
  const buttons = document.createElement('div')
  buttons.className = 'np-controls'
  buttons.appendChild(button('np-previous', locale.previous, returnSVG, () => playPrevious()))
  playButton = button('np-play', locale.play, playSVG, () => play.click())
  buttons.appendChild(playButton)
  buttons.appendChild(button('np-next', locale.next, forwardSVG, () => playNext()))
  view.querySelector('.progress').after(buttons)
  view.appendChild(button('np-close', locale.closeNowPlaying, compressSVG, () => close()))

  view.querySelector('.cover').onclick = () => play.click()
  bar.onclick = (e) => {
    const box = bar.getBoundingClientRect()
    if (audio.duration) audio.currentTime = audio.duration * (e.clientX - box.left) / box.width
  }
}

export const isOpen = () => !view.hidden

// false when nothing plays
export function open() {
  if (!playerList.querySelector('audio-track.playing')) return false
  update()
  view.hidden = false
  return true
}

export function close() {
  if (!isOpen()) return
  view.hidden = true
  onClose()
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
  meta.textContent = [details.genre, details.keywords].filter(Boolean).join(' · ')
  paused.hidden = !audio.paused
  if (playButton) playButton.innerHTML = audio.paused ? playSVG : pauseSVG

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
