// The queue on the TV starts collapsed to its summary row (queue.js), so
// that the remote gets from the player to the library without going
// through every queued track:
//   Right on the summary expands the queue, and moves into it when expanded
//   Left anywhere in the queue collapses it and returns to the summary
//   OK on the summary expands or collapses it

import { initQueue as initSummary, summary, isCollapsed, expand, collapse } from '../queue.js'

const LEFT = 37
const RIGHT = 39
const ENTER = 13

let playerList

export function initQueue(player, list) {
  playerList = list
  initSummary(player, list, {collapsed: true})

  window.addEventListener('keydown', (e) => {
    const focused = document.activeElement
    let handled = false
    if (focused == summary) {
      if (e.keyCode == RIGHT) handled = expandOrEnter()
      else if (e.keyCode == LEFT) handled = collapse()
      else if (e.keyCode == ENTER) handled = isCollapsed() ? expand() : collapse()
    }
    else if (e.keyCode == LEFT && inQueue(focused)) {
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

function expandOrEnter() {
  if (isCollapsed()) return expand()
  const track = playerList.querySelector('audio-track.playing') || playerList.querySelector('audio-track')
  track?.focus()
  track?.scrollIntoView({block: 'nearest'})
  return true
}
