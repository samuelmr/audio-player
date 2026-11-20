// The Samsung TV app (Tizen): the TV app of tv.js, with the remote's keys
// from Tizen's API
import { initTv, remoteKeys } from './tv.js'
import { BACK } from './tv-keys.js'

export { oneAudioElement, addTransferControls } from './tv.js'

export function init() {
  initTv({exit: () => tizen.application.getCurrentApplication().exit()})
  const handlers = new Map()
  // media keys reach the app only when registered; Back always does
  for (const [name, handler] of Object.entries(remoteKeys)) {
    if (name == 'GoBack') continue
    try {
      tizen.tvinputdevice.registerKey(name)
      handlers.set(tizen.tvinputdevice.getKey(name).code, handler)
    } catch(e) {
      console.warn(`Registering remote control key ${name} failed:`, e)
    }
  }
  handlers.set(BACK, remoteKeys.GoBack)
  window.addEventListener('keydown', (e) => {
    const handler = handlers.get(e.keyCode)
    if (handler) {
      e.preventDefault()
      handler()
    }
  })
}
