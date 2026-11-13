// Shuffle, beside Save offline: puts the queue in a random order with the
// playing track first. The queue itself is reordered, so that it, Up next
// and the track loaded ahead show the order the tracks play in. Pressing it
// again shuffles again.

import { locale } from './locale.js'
import { shuffleSVG } from './icons.js'
import { playerList } from './player.js'

// a new array of the items in a random order (Fisher–Yates)
export function shuffled(items, random = Math.random) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// adds the button to the queue's actions, before Save offline
export function initShuffle(actions) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'shuffle'
  button.innerHTML = shuffleSVG + ' ' + locale.shuffle
  button.hidden = true
  button.onclick = shuffleQueue
  actions.insertBefore(button, actions.firstChild)
  // with one track, there's nothing to shuffle
  new MutationObserver(() => {
    button.hidden = playerList.querySelectorAll('audio-track').length < 2
  }).observe(playerList, {childList: true})
}

export function shuffleQueue() {
  const tracks = [...playerList.querySelectorAll('audio-track')]
  const playing = tracks.find(track => track.classList.contains('playing'))
  const rest = shuffled(tracks.filter(track => track != playing))
  playerList.append(...(playing ? [playing, ...rest] : rest))
}
