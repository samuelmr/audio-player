// The Google TV app: the TV app of tv.js in the WebView of an Android app
// (android/). The arrows and OK reach the page as keys of a keyboard. The
// app's activity takes Back, the media keys and the channel keys before the
// WebView would, and sends them to the page as key events named by the
// web's key values, such as GoBack and MediaPlayPause. Exiting goes through
// the AndroidTv object that the activity adds to the page.
import { initTv, remoteKeys } from './tv.js'

export { oneAudioElement, addTransferControls } from './tv.js'

export function init() {
  initTv({exit: () => window.AndroidTv.exit()})
  window.addEventListener('keydown', (e) => {
    const handler = remoteKeys[e.key]
    if (handler) {
      e.preventDefault()
      handler()
    }
  })
}
