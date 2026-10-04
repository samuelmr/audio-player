// The player bar on the TV: a small Now Playing at the top, with the album
// art, title and artist of the playing track. OK on it opens the full view
// (tizen-now-playing.js). Behind the whole app is the album art, blurred and
// dark, as in Now Playing; without art, a gradient of the player's hue.
// The progress bar fills by --played, as a range input can't color its
// played part on Chromium 76.

import { locale } from '../locale.js'
import { audio, playerList } from '../player.js'
import { trackDetails } from './tizen-now-playing.js'

let now, art, title, subtitle, backdrop, progress

export function initPlayerBar(player) {
  backdrop = document.createElement('div')
  backdrop.id = 'backdrop'
  document.body.insertBefore(backdrop, document.body.firstChild)

  now = document.createElement('div')
  now.className = 'now'
  now.tabIndex = 0
  now.innerHTML = `
    <div class="now-art"><img alt=""></div>
    <div class="now-text"><div class="now-title"></div><div class="now-subtitle"></div></div>`
  art = now.querySelector('img')
  title = now.querySelector('.now-title')
  subtitle = now.querySelector('.now-subtitle')
  art.onerror = () => {
    now.classList.add('no-art')
    backdrop.classList.add('no-art')
  }
  player.insertBefore(now, player.firstChild)

  progress = player.querySelector('#progress')
  audio.addEventListener('timeupdate', updateProgress)
  audio.addEventListener('emptied', updateProgress)

  // the playing track changes by class, and its details arrive with it
  new MutationObserver(update).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  update()
}

function update() {
  const track = playerList.querySelector('audio-track.playing')
  const details = track && trackDetails(track)
  now.classList.toggle('idle', !track)
  title.textContent = details ? details.title : locale.nothingPlaying
  subtitle.textContent = details
    ? [details.artist, details.album].filter(Boolean).join(' · ')
    : locale.addHint

  const cover = details?.cover || ''
  now.classList.toggle('no-art', !cover)
  backdrop.classList.toggle('no-art', !cover)
  if (cover && art.getAttribute('src') != cover) {
    art.src = cover
    backdrop.style.backgroundImage = `url("${cover}")`
  }
}

function updateProgress() {
  const played = audio.duration ? 100 * audio.currentTime / audio.duration : 0
  progress.style.setProperty('--played', `${played}%`)
}
