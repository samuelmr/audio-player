// Shuffle, beside Save offline: a toggle. On, the queue is in a random
// order with the playing track first, and tracks added meanwhile go to a
// random place after the playing one. Off, the queue is back in the order
// the tracks were added in. The queue itself is reordered, so that it, Up
// next and the track loaded ahead show the order the tracks play in.

import { locale } from './locale.js'
import { shuffleSVG } from './icons.js'
import { playerList } from './player.js'

let button
let on = false
// audio-track -> when it was added; tracks are only ever appended
const added = new WeakMap()
let count = 0

// a new array of the items in a random order (Fisher–Yates)
export function shuffled(items, random = Math.random) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const tracks = () => [...playerList.querySelectorAll('audio-track')]

// adds the button to the queue's actions, before Save offline
export function initShuffle(actions) {
  button = document.createElement('button')
  button.type = 'button'
  button.className = 'shuffle'
  button.innerHTML = shuffleSVG + ' ' + locale.shuffle
  button.setAttribute('aria-pressed', 'false')
  button.hidden = true
  button.onclick = () => setShuffle(!on)
  actions.insertBefore(button, actions.firstChild)
  new MutationObserver(queueChanged).observe(playerList, {childList: true})
}

function queueChanged() {
  const all = tracks()
  const newTracks = all.filter(track => !added.has(track))
  for (const track of newTracks) added.set(track, count++)
  // an emptied queue starts over in order
  if (!all.length) setShuffle(false)
  else if (on && newTracks.length) placeRandomly(newTracks)
  // with one track, there's nothing to shuffle
  button.hidden = all.length < 2
}

export function setShuffle(value) {
  on = value
  button.setAttribute('aria-pressed', String(on))
  if (on) shuffleQueue()
  else restoreOrder()
}

function shuffleQueue() {
  const all = tracks()
  const playing = all.find(track => track.classList.contains('playing'))
  const rest = shuffled(all.filter(track => track != playing))
  playerList.append(...(playing ? [playing, ...rest] : rest))
}

function restoreOrder() {
  const all = tracks()
  const ordered = [...all].sort((a, b) => added.get(a) - added.get(b))
  // moving tracks for nothing would load the next track again
  if (ordered.some((track, i) => track != all[i])) playerList.append(...ordered)
}

// each to a random place after the playing track, or anywhere if none plays
function placeRandomly(newTracks) {
  for (const track of newTracks) {
    const others = tracks().filter(other => other != track)
    const playing = others.findIndex(other => other.classList.contains('playing'))
    const before = others[playing + 1 + Math.floor(Math.random() * (others.length - playing))] || null
    if (before != track.nextElementSibling) playerList.insertBefore(track, before)
  }
}
