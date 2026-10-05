// The queue's summary row: the number of tracks and the next one. Clicking
// it, or OK on the TV, collapses the queue to the row and expands it again;
// the player bar still shows the playing track (player-bar.js). Expanded,
// the player also shows where the tracks came from and Save offline: it has
// the queue-open class.

import { locale } from './locale.js'
import { trackDetails } from './player-bar.js'

export let summary
let count, upNext, playerElement, playerList

export function initQueue(player, list, { collapsed = false } = {}) {
  playerElement = player
  playerList = list
  summary = document.createElement('button')
  summary.type = 'button'
  summary.className = 'queue-summary'
  count = document.createElement('span')
  count.className = 'count'
  upNext = document.createElement('span')
  upNext.className = 'next'
  summary.appendChild(count)
  summary.appendChild(upNext)
  summary.onclick = () => isCollapsed() ? expand() : collapse()
  player.insertBefore(summary, playerList)
  if (collapsed) collapse()
  else expand()

  // the playing track changes by class
  new MutationObserver(updateSummary).observe(playerList, {childList: true, subtree: true, attributeFilter: ['class']})
  updateSummary()
}

export const isCollapsed = () => playerList.classList.contains('collapsed')

function updateSummary() {
  const tracks = playerList.querySelectorAll('audio-track').length
  count.textContent = locale.queue(tracks)
  const next = playerList.querySelector('audio-track.playing')?.nextElementSibling
  upNext.textContent = next ? locale.upNextTrack(trackDetails(next).line) : ''
  summary.hidden = tracks == 0
}

export function expand() {
  playerList.classList.remove('collapsed')
  summary.classList.add('open')
  summary.setAttribute('aria-expanded', 'true')
  playerElement.classList.add('queue-open')
  return true
}

export function collapse() {
  playerList.classList.add('collapsed')
  summary.classList.remove('open')
  summary.setAttribute('aria-expanded', 'false')
  playerElement.classList.remove('queue-open')
  return true
}
