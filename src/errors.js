// Errors the user should hear of: a toast with the text, and the error in the
// console. Catch an error where the user asked for something and say what
// failed: reportError(e, locale.listingFailed). initErrorHandling is the
// backstop for the ones nobody caught.
import { locale } from './locale.js'
import { notify } from './adding.js'

// a failing loop would otherwise repeat the same toast for every track
const REPEAT_TIME = 5000
let lastText, lastTime = 0

export function reportError(e, text = locale.somethingFailed) {
  console.error(e)
  const now = Date.now()
  if (text == lastText && now - lastTime < REPEAT_TIME) return
  lastText = text
  lastTime = now
  notify(text)
}

export function initErrorHandling() {
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason))
  window.addEventListener('error', (e) => {
    // a resource that didn't load, such as an image, is not an error of the code
    if (e.error) reportError(e.error)
  })
}
