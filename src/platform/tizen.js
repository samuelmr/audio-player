// The Samsung TV app (Tizen)
import { locale } from '../locale.js'
import { audio, play, playerList, playNext, playPrevious } from '../player.js'
import { initSpatialNavigation } from '../spatial-navigation.js'
import { initLibrary, addFocusedAndPlay, focusPlayer, focusShortcut } from './tizen-library.js'
import { initQueue, inQueue, focusSummary } from './tizen-queue.js'
import { initNowPlaying } from './tizen-now-playing.js'

const BACK_KEY = 10009 // always delivered, needs no registration
const SEEK_SECONDS = 10

// media keys reach the app only when registered
const mediaKeys = {
  MediaPlayPause: () => play.click(),
  // on a library item, Play adds it to the queue and plays it right away
  MediaPlay: () => addFocusedAndPlay() || audio.play().catch(err => console.warn('Playback failed:', err)),
  MediaPause: () => audio.pause(),
  MediaStop: () => audio.pause(),
  MediaTrackPrevious: () => playPrevious(),
  MediaTrackNext: () => playNext(),
  // the channel keys aren't otherwise used
  ChannelUp: () => playNext(),
  ChannelDown: () => playPrevious(),
  MediaRewind: () => { audio.currentTime = Math.max(audio.currentTime - SEEK_SECONDS, 0) },
  MediaFastForward: () => { audio.currentTime = Math.min(audio.currentTime + SEEK_SECONDS, audio.duration) },
}

let exitDialog

export function init() {
  exitDialog = createExitDialog()
  // first, so that its key handler goes before the others while it's open
  initNowPlaying()
  initSpatialNavigation()
  initLibrary(document.querySelector('audio-browser'), playerList)
  initQueue(document.querySelector('audio-player'), playerList)
  const handlers = new Map()
  for (const [name, handler] of Object.entries(mediaKeys)) {
    try {
      tizen.tvinputdevice.registerKey(name)
      handlers.set(tizen.tvinputdevice.getKey(name).code, handler)
    } catch(e) {
      console.warn(`Registering remote control key ${name} failed:`, e)
    }
  }
  handlers.set(BACK_KEY, back)
  window.addEventListener('keydown', (e) => {
    const handler = handlers.get(e.keyCode)
    if (handler) {
      e.preventDefault()
      handler()
    }
  })
}

// Back goes up a level: an open dialog closes, the library returns to the
// shortcut bar, a queued track to the queue's summary, the rest to the
// player buttons, and the player buttons ask before exiting the app
function back() {
  const dialog = document.querySelector('dialog[open]')
  const focused = document.activeElement
  if (dialog) {
    dialog.close()
  }
  else if (focused?.closest('audio-browser') && !focused.closest('#skipNav')) {
    focusShortcut()
  }
  else if (inQueue(focused)) {
    focusSummary()
  }
  else if (!focused?.closest('#buttons')) {
    focusPlayer()
  }
  else {
    exitDialog.showModal()
  }
}

function createExitDialog() {
  const dialog = document.createElement('dialog')
  dialog.id = 'exit-confirm'
  const question = document.createElement('p')
  question.textContent = locale.confirmExit
  const exit = document.createElement('button')
  exit.type = 'button'
  exit.textContent = locale.exit
  exit.onclick = () => tizen.application.getCurrentApplication().exit()
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = locale.reset
  // a second Back, or OK right away, keeps the music playing
  cancel.autofocus = true
  cancel.onclick = () => dialog.close()
  const buttons = document.createElement('div')
  buttons.className = 'buttons'
  buttons.appendChild(exit)
  buttons.appendChild(cancel)
  dialog.appendChild(question)
  dialog.appendChild(buttons)
  document.body.appendChild(dialog)
  return dialog
}

// The TV has no clipboard and no camera. The SmartThings app on a phone
// can type into the focused text field on the TV, so the settings code
// copied on the phone is pasted into a text field.
export function addTransferControls({ container, addButton, importCode }) {
  const input = document.createElement('input')
  input.type = 'text'
  input.id = 'settingsCodeInput'
  input.size = 40
  input.autocomplete = 'off'
  input.placeholder = locale.pastePrompt
  input.title = locale.pastePrompt
  container.appendChild(input)
  const importButton = addButton(locale.importSettings, () => {
    importCode(input.value)
    input.value = ''
  })
  input.onkeydown = (e) => {
    // while the field is read-only, Enter opens the keyboard instead
    if (e.key == 'Enter' && !input.readOnly) {
      e.preventDefault()
      importButton.click()
    }
  }
}
