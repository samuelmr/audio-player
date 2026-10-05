// Now Playing on the TV (now-playing.js). It opens by itself when the
// remote has been idle for a while during playback, and with OK on the
// player bar (tizen-player.js) or on the playing track in the queue. In it:
//   OK plays and pauses, Left and Right go to the previous and next track
//   Back, Up and Down return to browsing, with the focus where it was

import { audio, play, playerList, playNext, playPrevious } from '../player.js'
import { initNowPlaying as initView, isOpen, open as openView, close } from '../now-playing.js'
import { focusPlayer } from './tizen-library.js'

const LEFT = 37
const UP = 38
const RIGHT = 39
const DOWN = 40
const ENTER = 13
const BACK = 10009

const IDLE_TIME = 20 * 1000

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
  initView({onClose: returnToFocus})
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
}

function open() {
  returnFocus = document.activeElement
  openView()
}

// back to where the focus was, unless that was hidden meanwhile, like a
// track in the queue that collapsed: then the playing track, or the player
function returnToFocus() {
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
