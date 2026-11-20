// The TV apps, worked with a remote control: the Samsung TV app (tizen.js)
// and the Google TV app (androidtv.js). Each passes the keys of its remote
// to remoteKey(), by their names in the web's key values, and tells how to
// exit the app.
import { locale } from '../locale.js'
import { audio, play, playerList, playNext, playPrevious } from '../player.js'
import { initSpatialNavigation } from '../spatial-navigation.js'
import { initAdding } from '../adding.js'
import { initLibrary, addFocusedAndPlay, focusPlayer, focusShortcut } from './tv-library.js'
import { initQueue, inQueue, focusSummary } from './tv-queue.js'
import { initNowPlaying } from './tv-now-playing.js'
import { initPlayerBar } from './tv-player.js'

const SEEK_SECONDS = 10

// the keys of the remote that aren't arrows or OK, by name
export const remoteKeys = {
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
  GoBack: () => back(),
}

// the TVs play one audio element at a time (player.js)
export const oneAudioElement = true

let exitDialog

export function initTv({ exit }) {
  exitDialog = createExitDialog(exit)
  // first, so that its key handler goes before the others while it's open
  initNowPlaying()
  initSpatialNavigation()
  initAdding(playerList)
  initLibrary(document.querySelector('audio-browser'))
  initQueue(document.querySelector('audio-player'), playerList)
  initPlayerBar(document.querySelector('audio-player'))
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

function createExitDialog(exitApp) {
  const dialog = document.createElement('dialog')
  dialog.id = 'exit-confirm'
  const question = document.createElement('p')
  question.textContent = locale.confirmExit
  const exit = document.createElement('button')
  exit.type = 'button'
  exit.textContent = locale.exit
  exit.onclick = exitApp
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

// The TVs have no clipboard or camera for the app. A phone can type into
// the focused text field on the TV (Samsung's SmartThings app, the Google
// TV app), so the settings code copied on the phone is pasted into a text field.
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
