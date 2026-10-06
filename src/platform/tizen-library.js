// The library on the TV, worked like a tree with the remote:
//   Right opens a folder or playlist, or moves into an open one
//   Left closes an open folder or playlist, or moves out to its parent
//   OK adds the focused item to the queue, and holding OK also plays it
//
// Folders are on the left, and the songs of the selected folder or playlist
// on the right, level with it. The songs stay in their folder in the
// document; the stylesheet only moves the list aside.

import { getObjectText } from '../s3.js'
import { queueKeys } from '../search.js'
import { play as playButton } from '../player.js'
import { itemName, startAdding, currentAdding } from '../adding.js'
import { scrollIntoView } from '../spatial-navigation.js'

const LEFT = 37
const UP = 38
const RIGHT = 39
const DOWN = 40
const ENTER = 13

const ITEMS = 'li.folder, li.playlist, li.song, .search-results li'
// a held OK repeats faster than this; separate presses are slower
const REPEAT_GAP = 250

let browser, selected
let okDown = false
let lastOk = 0

export function initLibrary(browserElement) {
  browser = browserElement

  // the song lists get the 'songs' class as the songs arrive from S3
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType == Node.ELEMENT_NODE && node.matches('li.song')) {
          node.parentNode.classList.add('songs')
          const folder = node.parentNode.closest('li.folder, li.playlist')
          if (folder?.contains(document.activeElement)) {
            select(folder)
          }
        }
      }
    }
  }).observe(browser, {childList: true, subtree: true})

  browser.addEventListener('focusin', (e) => {
    const folder = e.target.closest('li.folder, li.playlist')
    if (folder?.querySelector(':scope > ol.songs')) {
      select(folder)
    }
  })

  window.addEventListener('keydown', (e) => {
    const item = document.activeElement
    if (!item?.matches?.(ITEMS) || !browser.contains(item)) return
    let handled = false
    if (e.keyCode == RIGHT) handled = openOrEnter(item)
    else if (e.keyCode == LEFT) handled = closeOrLeave(item)
    else if (e.keyCode == UP || e.keyCode == DOWN) handled = atListEnd(item, e.keyCode)
    else if (e.keyCode == ENTER) handled = ok(item, e)
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, true)
  window.addEventListener('keyup', (e) => {
    if (e.keyCode == ENTER) okDown = false
  })

  // a shortcut (A, B, C…) moves the focus to its first item, not only the view
  browser.addEventListener('click', (e) => {
    const shortcut = e.target.closest('#skipNav a[href^="#"]')
    const target = shortcut && document.getElementById(decodeURIComponent(shortcut.hash.slice(1)))
    if (!target) return
    e.preventDefault()
    if (target.matches('audio-player')) {
      focusPlayer()
      return
    }
    // the playlists shortcut leads to a list, the others to a folder
    const item = target.matches('li') ? target : target.querySelector('li')
    if (item) {
      focusItem(item, 'center')
    }
  })

}

// adds the focused library item and plays it, for the Play key;
// false when the focus isn't on a library item
export function addFocusedAndPlay() {
  const item = document.activeElement
  if (!item?.matches?.(ITEMS) || !browser?.contains(item)) return false
  return add(item, true)
}

function openOrEnter(item) {
  // nothing further right of a song; search results are a flat list
  if (item.matches('li.song')) return true
  if (item.matches('.search-results li')) return false
  if (item.matches('li.playlist')) {
    // saved offline playlists have no track list; Right reaches their remove button
    if (!item.closest('#playlists')) return false
    if (!item.classList.contains('open')) {
      openPlaylist(item)
      return true
    }
    return enter(item)
  }
  if (!item.classList.contains('open')) {
    item.click()
    return true
  }
  return enter(item)
}

function enter(item) {
  const first = [...item.querySelectorAll(':scope > ol > li')].find(li => li.getClientRects().length > 0)
  if (first) focusItem(first)
  return true
}

function closeOrLeave(item) {
  if (item.matches('li.folder, li.playlist') && item.classList.contains('open')) {
    if (item.matches('li.playlist')) {
      item.classList.remove('open')
    }
    else {
      item.click()
    }
    return true
  }
  const parent = item.parentNode.closest('li.folder, li.playlist')
  if (parent) {
    focusItem(parent)
    return true
  }
  return false
}

// Up and Down stay in the song list at its ends
function atListEnd(item, keyCode) {
  if (!item.matches('li.song')) return false
  return (keyCode == UP && !item.previousElementSibling) || (keyCode == DOWN && !item.nextElementSibling)
}

function ok(item, e) {
  const now = performance.now()
  const repeat = e.repeat || (okDown && now - lastOk < REPEAT_GAP)
  okDown = true
  lastOk = now
  if (repeat) {
    // held down: play what was just added
    const adding = currentAdding()
    if (adding) adding.playNow = true
    if (adding?.first) play(adding.first)
    return true
  }
  // the Playlists group can't be added; OK opens it
  return add(item, false)
}

function add(item, playNow) {
  const action = item.querySelector(':scope > a.action.add')
  if (!action) return false
  const adding = startAdding(itemName(item), (track) => {
    if (adding.playNow) play(track)
  })
  adding.playNow = playNow
  action.click()
  return true
}

function play(track) {
  track.querySelector('.name a')?.click()
}

// A playlist's tracks are listed like a folder's songs. The list is also in
// the 'playlists' class, which keeps getFolders from using it for folders.
async function openPlaylist(item) {
  item.classList.add('open')
  if (item.querySelector(':scope > ol')) {
    select(item)
    return
  }
  const list = document.createElement('ol')
  list.className = 'songs playlists'
  item.appendChild(list)
  try {
    const key = item.querySelector(':scope > a.action').getAttribute('href')
    const playlist = JSON.parse(await getObjectText(key))
    for (const track of playlist.track || []) {
      const song = document.createElement('li')
      song.className = 'song'
      song.textContent = trackTitle(track) + ' '
      const action = document.createElement('a')
      action.className = 'action add'
      action.href = '#'
      action.onclick = (e) => {
        e.preventDefault()
        queueKeys([track.url], track.url, 'song')
      }
      song.appendChild(action)
      list.appendChild(song)
    }
  }
  catch (e) {
    console.error(e)
  }
}

function trackTitle(track) {
  const title = track.title || track.name
  if (title) {
    try {
      return decodeURIComponent(title)
    } catch (e) {
      return title
    }
  }
  return track.url.split('/').pop()
}

function focusItem(item, block = 'nearest') {
  item.tabIndex = -1
  item.focus()
  scrollIntoView(item, block)
}

// The shortcut of the focused item's section: its letter, or # for the playlists.
// Without a focused library item, the first letter.
export function focusShortcut() {
  const links = [...browser.querySelectorAll('#skipNav a')]
  const linkTo = (id) => links.find(a => decodeURIComponent(a.hash.slice(1)) == id)
  let item = document.activeElement?.closest?.('nav > ol > li')
  let link
  if (item?.closest('.playlists')) {
    link = linkTo('playlists')
  }
  else {
    // the first item of each letter has the letter as its id
    while (item && !item.id) item = item.previousElementSibling
    link = item && linkTo(item.id)
  }
  ;(link || linkTo('playlists') || links[0])?.focus()
}

// Play/Pause, or Previous while Play is disabled: it is until a track loads
export function focusPlayer() {
  window.scrollTo(0, 0)
  const button = playButton.disabled ? document.querySelector('audio-player #buttons button:not(:disabled)') : playButton
  button?.focus()
}

function select(folder) {
  if (selected != folder) {
    selected?.classList.remove('selected')
    selected = folder
    folder.classList.add('selected')
  }
  // the right half of the library, measured from the folder
  const list = folder.querySelector(':scope > ol.songs')
  const library = folder.closest('nav').getBoundingClientRect()
  const folderBox = folder.getBoundingClientRect()
  list.style.left = `${library.left + library.width / 2 - folderBox.left}px`
  // less the gap between the columns, which is the list's margin
  list.style.width = `calc(${library.width / 2}px - 1em)`
}
