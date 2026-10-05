// Tells what was just added to the queue, as the queue may be closed or
// scrolled away: "Adding ABBA…", then "Added ABBA: 3 tracks" when no more
// tracks have come for a while. onFirst hears of the first track added.

import { locale } from './locale.js'

// the count waits this long for more tracks before it's final, and longer
// for the first one, since a folder's listing may be slow
const SETTLE_TIME = 1500
const FIRST_TRACK_TIME = 15000
const TOAST_TIME = 3000

let toast, timer, adding

export function initAdding(playerList) {
  toast = document.createElement('div')
  toast.className = 'toast'
  toast.setAttribute('role', 'status')
  toast.hidden = true
  document.body.appendChild(toast)
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType == Node.ELEMENT_NODE && node.matches('audio-track')) {
          trackAdded(node)
        }
      }
    }
  }).observe(playerList, {childList: true})
}

// the name of a folder, playlist, song or search result in the library
export function itemName(item) {
  const text = [...item.childNodes].find(node => node.nodeType == Node.TEXT_NODE && node.textContent.trim())
  return (text?.textContent || item.querySelector('.name')?.textContent || '').trim().replace(/\.(mp3|json)$/, '')
}

// returns what is being added, until the count is final
export function startAdding(name, onFirst) {
  adding = {name, count: 0, onFirst}
  show(locale.adding(name))
  waitForTracks(FIRST_TRACK_TIME)
  return adding
}

export const currentAdding = () => adding

function trackAdded(track) {
  if (!adding) return
  adding.count++
  if (!adding.first) {
    adding.first = track
    adding.onFirst?.(track)
  }
  show(locale.added(adding.name, adding.count))
  waitForTracks(SETTLE_TIME)
}

function waitForTracks(time) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (adding && adding.count == 0) {
      show(locale.addedNothing(adding.name))
    }
    adding = null
    timer = setTimeout(() => toast.hidden = true, TOAST_TIME)
  }, time)
}

function show(text) {
  toast.textContent = text
  toast.hidden = false
}
