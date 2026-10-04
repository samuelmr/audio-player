// The queue on the TV collapses like a folder, so that the remote gets from
// the player to the library without going through every queued track.
// Collapsed, it is a summary row with the track count and the next track;
// the playing track is in the player bar (tizen-player.js). Expanded, it
// also shows where the tracks came from, and the button to save them offline.
//   Right on the summary expands the queue, and moves into it when expanded
//   Left anywhere in the queue collapses it and returns to the summary
//   OK on the summary expands or collapses it

import { locale } from '../locale.js'
import { trackDetails } from './tizen-now-playing.js'

const LEFT = 37
const RIGHT = 39
const ENTER = 13

let summary, count, upNext, playerElement, playerList

export function initQueue(player, list) {
  playerElement = player
  playerList = list
  summary = document.createElement('div')
  summary.className = 'queue-summary'
  summary.tabIndex = 0
  count = document.createElement('span')
  count.className = 'count'
  upNext = document.createElement('span')
  upNext.className = 'next'
  summary.appendChild(count)
  summary.appendChild(upNext)
  player.insertBefore(summary, playerList)
  collapse()

  // the playing track changes by class
  new MutationObserver(updateSummary).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  updateSummary()

  window.addEventListener('keydown', (e) => {
    const focused = document.activeElement
    let handled = false
    if (focused == summary) {
      if (e.keyCode == RIGHT) handled = expandOrEnter()
      else if (e.keyCode == LEFT) handled = collapse()
      else if (e.keyCode == ENTER) handled = playerList.classList.contains('collapsed') ? expand() : collapse()
    }
    else if (e.keyCode == LEFT && focused?.matches?.('audio-track') && playerList.contains(focused)) {
      collapse()
      summary.focus()
      handled = true
    }
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, true)
}

// for Back from a queued track
export function inQueue(element) {
  return element?.matches?.('audio-track') && playerList.contains(element)
}

export function focusSummary() {
  summary.focus()
  summary.scrollIntoView({block: 'nearest'})
}

function updateSummary() {
  const tracks = playerList.querySelectorAll('audio-track').length
  count.textContent = locale.queue(tracks)
  const next = playerList.querySelector('audio-track.playing')?.nextElementSibling
  upNext.textContent = next ? locale.upNextTrack(trackDetails(next).line) : ''
  summary.hidden = tracks == 0
}

function expand() {
  playerList.classList.remove('collapsed')
  summary.classList.add('open')
  playerElement.classList.add('queue-open')
  return true
}

function collapse() {
  playerList.classList.add('collapsed')
  summary.classList.remove('open')
  playerElement.classList.remove('queue-open')
  return true
}

function expandOrEnter() {
  if (playerList.classList.contains('collapsed')) return expand()
  const track = playerList.querySelector('audio-track.playing') || playerList.querySelector('audio-track')
  track?.focus()
  track?.scrollIntoView({block: 'nearest'})
  return true
}
