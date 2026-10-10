// Arrow key navigation for remote controls: the arrows move the focus to the
// nearest focusable element in that direction, and Enter activates it.
// Only the TV app uses this; browsers on computers have Tab for this.

// list items with click handlers act as buttons too, and songs add themselves
// to the queue; links inside a track are skipped, the track itself plays with Enter
const CANDIDATES = 'a[href], button, input, select, textarea, [tabindex], li.folder, li.playlist, li.song, .search-results li, .collection li, .collection a'
const SKIPPED = 'audio-track a'
const NATIVE = 'a[href], button, input, select, textarea'
const TEXT_TYPES = ['text', 'search', 'password', 'url', 'email', 'number']

// by key code, which every remote control sends
const DIRECTIONS = {
  38: 'up',
  40: 'down',
  37: 'left',
  39: 'right',
}
const ENTER = 13
const KEYBOARD_DONE = 65376
const KEYBOARD_CANCEL = 65385

// Holding an arrow key repeats it faster than the TV can move the focus and
// redraw, so repeats closer than this are dropped instead of piling up
const REPEAT_INTERVAL = 120
// up and down first look at the items this close in the document,
// instead of measuring the whole library on every press
const NEARBY = 40
// added to the score of anything not in the same row or column
const OUT_OF_LINE = 100000
// the library's shortcut bar stays at the top, over the rows scrolling under it
const STICKY = 'nav#skipNav'

let lastMove = -Infinity // performance.now() starts from 0 when the app loads
let cached, cachedScope

const isTextField = (element) => element?.tagName == 'INPUT' && TEXT_TYPES.includes(element.type)

export function initSpatialNavigation() {
  // The TV opens its on-screen keyboard whenever a text field gets the focus,
  // which would stop the arrows from moving on. So text fields stay read-only
  // while the focus passes through them, and Enter (OK) starts editing.
  document.querySelectorAll('input').forEach(input => {
    if (isTextField(input)) input.readOnly = true
  })
  document.addEventListener('focusout', (e) => {
    if (isTextField(e.target)) e.target.readOnly = true
  })
  new MutationObserver(() => {
    cached = null
  }).observe(document.body, {childList: true, subtree: true})
  window.addEventListener('keydown', (e) => {
    const direction = DIRECTIONS[e.keyCode]
    const current = document.activeElement
    if (direction) {
      if (keepsArrow(current, direction)) return
      e.preventDefault()
      if (performance.now() - lastMove < REPEAT_INTERVAL) return
      move(direction)
      lastMove = performance.now()
    }
    else if (e.keyCode == ENTER && isTextField(current) && current.readOnly) {
      e.preventDefault()
      startEditing(current)
    }
    else if (e.keyCode == KEYBOARD_DONE || e.keyCode == KEYBOARD_CANCEL) {
      if (isTextField(current)) current.readOnly = true
    }
    else if (e.keyCode == ENTER && current && !current.matches(NATIVE)) {
      e.preventDefault()
      activate(current)
    }
  })
}

function startEditing(input) {
  // the keyboard opens when an editable field gets the focus
  input.blur()
  input.readOnly = false
  input.focus()
}

// while editing, the caret moves with left and right, and sliders change their value
function keepsArrow(element, direction) {
  if (!element || direction == 'up' || direction == 'down') return false
  if (element.type == 'range') return true
  if (isTextField(element)) {
    if (element.readOnly) return false
    const atStart = element.selectionStart == 0 && element.selectionEnd == 0
    const atEnd = element.selectionStart == element.value.length
    return direction == 'left' ? !atStart : !atEnd
  }
  return false
}

function activate(element) {
  if (element.tagName == 'AUDIO-TRACK') {
    element.querySelector('.name a')?.click()
  }
  else if (element.matches('li.song')) {
    element.querySelector('a.action')?.click()
  }
  else {
    element.click()
  }
}

// an open modal dialog keeps the focus inside it; of two, the one opened last
function scope() {
  const open = document.querySelectorAll('dialog[open]')
  return open[open.length - 1] || document.body
}

// in document order, until the document changes
function candidates() {
  const root = scope()
  if (!cached || cachedScope != root) {
    cached = [...root.querySelectorAll(CANDIDATES)].filter(element => !element.matches(SKIPPED))
    cachedScope = root
  }
  return cached
}

const usable = (element) => !element.disabled && element.getClientRects().length > 0

// A list item's box includes its open sublists, so it's measured by its own
// text: the folder name, not the whole folder. As a target up or down, it's
// as wide as its row, so that a short name is as much below a shortcut as a
// long one.
function box(element, wide = false) {
  const rect = element.getBoundingClientRect()
  if (element.tagName == 'LI') {
    const text = [...element.childNodes].find(node => node.nodeType == Node.TEXT_NODE && node.textContent.trim())
    if (text) {
      const range = document.createRange()
      range.selectNodeContents(text)
      const textRect = range.getBoundingClientRect()
      const across = wide ? rect : textRect
      return {left: across.left, right: across.right, top: textRect.top, bottom: textRect.bottom}
    }
  }
  return rect
}

const center = (b) => ({x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2})

// gap between two ranges, 0 when they overlap
const gap = (start1, end1, start2, end2) => Math.max(0, start2 - end1, start1 - end2)

function score(from, to, direction) {
  const a = center(from)
  const b = center(to)
  const ahead = {
    up: a.y - b.y,
    down: b.y - a.y,
    left: a.x - b.x,
    right: b.x - a.x,
  }[direction]
  // the target must begin past the middle of the current element,
  // so that the + of the row above doesn't count as being on the right
  const beyond = {
    up: to.bottom <= a.y,
    down: to.top >= a.y,
    left: to.right <= a.x,
    right: to.left >= a.x,
  }[direction]
  if (ahead < 1 || !beyond) return Infinity
  const vertical = direction == 'up' || direction == 'down'
  const distance = vertical
    ? gap(from.top, from.bottom, to.top, to.bottom)
    : gap(from.left, from.right, to.left, to.right)
  const sideways = vertical
    ? gap(from.left, from.right, to.left, to.right)
    : gap(from.top, from.bottom, to.top, to.bottom)
  // stay in the same row or column when possible
  return distance + ahead / 10 + sideways * 3 + (sideways > 0 ? OUT_OF_LINE : 0)
}

function move(direction) {
  const current = document.activeElement
  const all = candidates()
  const index = all.indexOf(current)
  if (index < 0 || !usable(current)) {
    return focus(all.find(usable))
  }
  const from = box(current)
  // in a list, the next item up or down is close in the document too
  if (direction == 'up' || direction == 'down') {
    const nearby = all.slice(Math.max(0, index - NEARBY), index + NEARBY + 1).filter(behindBar(current))
    const {best, bestScore} = closest(from, current, nearby, direction)
    if (bestScore < OUT_OF_LINE) return focus(best)
  }
  const {best, bestScore} = closest(from, current, all, direction)
  // up and down may move to another column, but left and right stay in the row
  if (direction == 'up' || direction == 'down' || bestScore < OUT_OF_LINE) {
    focus(best)
  }
}

// Rows scrolled under the sticky bar come before the bar, as the list goes on
// behind it: from a row, the bar and what's above it are left out.
// Without a row up there, the bar is the next stop again.
function behindBar(current) {
  const bar = coveringBar(current)
  if (!bar) return () => true
  const barTop = bar.getBoundingClientRect().top
  return (option) => !bar.contains(option) && box(option).bottom > barTop
}

// the sticky bar that the element can scroll under
function coveringBar(element) {
  const bar = document.querySelector(STICKY)
  return bar && !bar.contains(element) && bar.parentNode.contains(element) ? bar : null
}

function closest(from, current, options, direction) {
  let best, bestScore = Infinity
  for (const option of options) {
    if (option == current || !usable(option)) continue
    const optionScore = score(from, box(option, direction == 'up' || direction == 'down'), direction)
    if (optionScore < bestScore) {
      best = option
      bestScore = optionScore
    }
  }
  return {best, bestScore}
}

function focus(element) {
  if (!element) return
  if (!element.matches(NATIVE) && !element.hasAttribute('tabindex')) {
    element.tabIndex = -1
  }
  if (isTextField(element)) {
    element.readOnly = true
  }
  element.focus()
  scrollIntoView(element)
}

// scrolls the element into view, and down from under the sticky bar
// when the bar would cover it
export function scrollIntoView(element, block = 'nearest') {
  element.scrollIntoView({block, inline: 'nearest'})
  const bar = coveringBar(element)
  if (!bar) return
  const covered = bar.getBoundingClientRect().bottom - element.getBoundingClientRect().top
  if (covered > 0) {
    window.scrollBy(0, -Math.ceil(covered))
  }
}
