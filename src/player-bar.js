// The player bar's small Now Playing: the album art, title, artist and album
// of the playing track, or a hint of how to start, which the platform gives,
// as the TV adds music with the remote. onCover hears of each new album art.
// Also fills the progress bar by --played, as a range input can't color its
// played part on every browser, such as the oldest TVs (Chromium 76).

import { locale } from './locale.js'
import { audio, playerList } from './player.js'

let playerElement, now, art, title, subtitle, progress, hint, onCover

const text = (track, selector) => track?.querySelector(selector)?.textContent.trim() || ''

// what is shown of a queued track: here, in the queue's summary and on the TV
export function trackDetails(track) {
  return {
    title: text(track, '.name a'),
    artist: text(track, '.artist'),
    album: [text(track, '.album'), text(track, '.published')].filter(Boolean).join(' · '),
    cover: track.dataset.albumArt || '',
    line: [text(track, '.name a'), text(track, '.artist')].filter(Boolean).join(' – '),
  }
}

// returns the element, for the platform to add to
export function initPlayerBar(player, options) {
  playerElement = player
  hint = options.hint
  onCover = options.onCover || (() => {})
  now = document.createElement('div')
  now.className = 'now'
  now.innerHTML = `
    <div class="now-art"><img alt=""></div>
    <div class="now-text"><div class="now-title"></div><div class="now-subtitle"></div></div>`
  art = now.querySelector('img')
  title = now.querySelector('.now-title')
  subtitle = now.querySelector('.now-subtitle')
  art.onerror = () => {
    now.classList.add('no-art')
    onCover('')
  }
  player.insertBefore(now, player.firstChild)

  progress = player.querySelector('#progress')
  audio.addEventListener('timeupdate', updateProgress)
  audio.addEventListener('emptied', updateProgress)

  // the playing track changes by class, and its details arrive with it
  new MutationObserver(update).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  update()
  return now
}

function update() {
  const track = playerList.querySelector('audio-track.playing')
  const details = track && trackDetails(track)
  now.classList.toggle('idle', !track)
  // the progress bar is empty, without its knob
  playerElement.classList.toggle('idle', !track)
  title.textContent = details ? details.title : locale.nothingPlaying
  subtitle.textContent = details
    ? [details.artist, details.album].filter(Boolean).join(' · ')
    : hint

  const cover = details?.cover || ''
  now.classList.toggle('no-art', !cover)
  if (!cover) {
    onCover('')
  }
  else if (art.getAttribute('src') != cover) {
    art.src = cover
    onCover(cover)
  }
}

function updateProgress() {
  const played = audio.duration ? 100 * audio.currentTime / audio.duration : 0
  progress.style.setProperty('--played', `${played}%`)
}
