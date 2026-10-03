// The queue on the TV collapses like a folder, so that the remote gets from
// the player to the library without going through every queued track.
// Collapsed, it shows a summary row and the playing track:
//   Right on the summary expands the queue, and moves into it when expanded
//   Left anywhere in the queue collapses it and returns to the summary
//   OK on the summary expands or collapses it

import { locale } from '../locale.js'

const LEFT = 37
const RIGHT = 39
const ENTER = 13

let summary, playerList

export function initQueue(player, list) {
  playerList = list
  summary = document.createElement('div')
  summary.className = 'queue-summary'
  summary.tabIndex = 0
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
  const count = playerList.querySelectorAll('audio-track').length
  summary.textContent = locale.queue(count)
  summary.hidden = count == 0
  // collapsed and with nothing playing, the list would be an empty box
  playerList.classList.toggle('idle', !playerList.querySelector('audio-track.playing'))
}

function expand() {
  playerList.classList.remove('collapsed')
  summary.classList.add('open')
  return true
}

function collapse() {
  playerList.classList.add('collapsed')
  summary.classList.remove('open')
  return true
}

function expandOrEnter() {
  if (playerList.classList.contains('collapsed')) return expand()
  const track = playerList.querySelector('audio-track.playing') || playerList.querySelector('audio-track')
  track?.focus()
  track?.scrollIntoView({block: 'nearest'})
  return true
}
